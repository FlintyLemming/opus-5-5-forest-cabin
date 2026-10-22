/* Post-processing: HDR scene → depth of field → god rays → bloom → AgX tone mapping and grade
   → present (FXAA, cross-dissolve, fades, letterbox, film grain, dither). */

const POST_COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
float hashP(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lumaOf(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
uniform float uNear;
uniform float uFar;
float linearDepth(float d) { return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
`;

const POST_SHADERS = {
  // Half resolution color + nearest (smallest) linear depth of the 2x2 footprint.
  coc: /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uSrcTexel;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float d0 = texture2D(tDepth, vUv + uSrcTexel * vec2(-0.5, -0.5)).r;
  float d1 = texture2D(tDepth, vUv + uSrcTexel * vec2(0.5, -0.5)).r;
  float d2 = texture2D(tDepth, vUv + uSrcTexel * vec2(-0.5, 0.5)).r;
  float d3 = texture2D(tDepth, vUv + uSrcTexel * vec2(0.5, 0.5)).r;
  float d = min(min(d0, d1), min(d2, d3));
  gl_FragColor = vec4(min(c, vec3(60.0)), linearDepth(d));
}`,

  // Temporal autofocus: eases toward the depth at the screen center.
  focus: /* glsl */ `
uniform sampler2D tCoc;
uniform sampler2D tPrev;
uniform float uBlend;
uniform float uMinFocus;
void main() {
  float d = 1e6;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) d = min(d, texture2D(tCoc, vec2(0.5) + vec2(float(x), float(y)) * 0.025).a);
  d = clamp(d, uMinFocus, 400.0);
  float prev = texture2D(tPrev, vec2(0.5)).r;
  gl_FragColor = vec4(prev <= 0.0 ? d : mix(prev, d, uBlend), 0.0, 0.0, 1.0);
}`,

  // Single-pass scatter-as-gather bokeh (after Dennis Gustafsson), golden-angle spiral.
  bokeh: /* glsl */ `
uniform sampler2D tCoc;
uniform sampler2D tFocus;
uniform vec2 uTexel;
uniform float uFocus;
uniform float uAuto;
uniform float uCocScale;
uniform float uMaxCoc;
#define GOLDEN 2.39996323
float cocOf(float d, float f) { return clamp(abs(1.0 / f - 1.0 / d) * uCocScale, 0.0, uMaxCoc); }
void main() {
  float focus = mix(uFocus, texture2D(tFocus, vec2(0.5)).r, uAuto);
  vec4 c0 = texture2D(tCoc, vUv);
  float d0 = c0.a;
  float s0 = cocOf(d0, focus);
  vec3 acc = c0.rgb;
  float tot = 1.0;
  float near = 0.0;
  float radius = RAD_SCALE;
  float ang = 0.0;
  for (int i = 0; i < TAPS; i++) {
    ang += GOLDEN;
    vec2 off = vec2(cos(ang), sin(ang)) * radius;
    vec4 c = texture2D(tCoc, vUv + off * uTexel);
    float s = cocOf(c.a, focus);
    if (c.a > d0) s = min(s, s0 * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, s);
    acc += mix(acc / tot, c.rgb, m);
    tot += 1.0;
    if (c.a < d0 - 0.25 && c.a < focus) near += m;
    radius += RAD_SCALE / radius;
  }
  gl_FragColor = vec4(acc / tot, clamp(near / float(TAPS) * 3.0, 0.0, 1.0));
}`,

  rayMask: /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uSun;
uniform float uAspect;
void main() {
  float d = texture2D(tDepth, vUv).r;
  float sky = step(0.99999, d);
  vec2 v = (vUv - uSun) * vec2(uAspect, 1.0);
  float w = pow(max(0.0, 1.0 - length(v) / 0.75), 2.2);
  vec3 c = min(texture2D(tScene, vUv).rgb, vec3(12.0));
  gl_FragColor = vec4(c * sky * w, 1.0);
}`,

  rayBlur: /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uStep;
void main() {
  vec2 dir = (uSun - vUv) * uStep / 12.0;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  vec2 uv = vUv;
  for (int i = 0; i < 12; i++) {
    float w = 1.0 - float(i) / 14.0;
    acc += texture2D(tSrc, uv).rgb * w;
    wsum += w;
    uv += dir;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`,

  // 13-tap downsample (Jimenez 2014); Karis average on the first level suppresses fireflies.
  down: /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = 1.0 / (1.0 + lumaOf(a)), wb = 1.0 / (1.0 + lumaOf(b)), wc = 1.0 / (1.0 + lumaOf(c)), wd = 1.0 / (1.0 + lumaOf(d));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
  vec3 o;
  if (uKaris > 0.5) {
    o = karis(j, k, l, m) * 0.5 + karis(a, b, d, e) * 0.125 + karis(b, c, e, f) * 0.125 + karis(d, e, g, h) * 0.125 + karis(e, f, h, i) * 0.125;
  } else {
    o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(min(o, vec3(80.0)), 1.0);
}`,

  up: /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tLow;
uniform vec2 uTexel;
uniform float uScatter;
void main() {
  vec3 t = vec3(0.0);
  t += texture2D(tLow, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  t += texture2D(tLow, vUv + vec2(0.0, -1.0) * uTexel).rgb * 2.0;
  t += texture2D(tLow, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  t += texture2D(tLow, vUv + vec2(-1.0, 0.0) * uTexel).rgb * 2.0;
  t += texture2D(tLow, vUv).rgb * 4.0;
  t += texture2D(tLow, vUv + vec2(1.0, 0.0) * uTexel).rgb * 2.0;
  t += texture2D(tLow, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  t += texture2D(tLow, vUv + vec2(0.0, 1.0) * uTexel).rgb * 2.0;
  t += texture2D(tLow, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(mix(texture2D(tSrc, vUv).rgb, t / 16.0, uScatter), 1.0);
}`,

  composite: /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tDof;
uniform sampler2D tFocus;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform vec2 uRes;
uniform float uDof;
uniform float uFocus;
uniform float uAuto;
uniform float uCocScale;
uniform float uBloom;
uniform vec3 uHalation;
uniform vec3 uRaysCol;
uniform float uExposure;
uniform vec3 uWB;
uniform float uContrast;
uniform float uSat;
uniform float uSplit;
uniform float uLift;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uCA;
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 v) {
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  v = m * v;
  v = clamp(log2(max(v, vec3(1e-10))), minEv, maxEv);
  v = (v - minEv) / (maxEv - minEv);
  return agxContrast(v);
}
vec3 agxEotf(vec3 v) {
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  v = mi * v;
  return pow(max(v, vec3(0.0)), vec3(2.2));
}
vec3 grade(vec3 v) {
  v = pow(max(v, vec3(0.0)), vec3(uContrast));
  float l = lumaOf(v);
  v = l + (v - l) * uSat;
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hi = smoothstep(0.4, 1.0, l);
  v += (uShadowTint - lumaOf(uShadowTint)) * sh * uSplit;
  v += (uHighTint - lumaOf(uHighTint)) * hi * uSplit;
  return v * (1.0 - uLift) + uLift;
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec2 dc = vUv - 0.5;
  float aspect = uRes.x / uRes.y;
  vec2 ac = dc * vec2(aspect, 1.0);
  float r2 = dot(ac, ac);
  vec2 off = dc * r2 * uCA;
  vec3 col = vec3(texture2D(tScene, vUv - off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + off).b);
  if (uDof > 0.5) {
    float d = linearDepth(texture2D(tDepth, vUv).r);
    float focus = mix(uFocus, texture2D(tFocus, vec2(0.5)).r, uAuto);
    float coc = abs(1.0 / focus - 1.0 / d) * uCocScale;
    vec4 b = texture2D(tDof, vUv);
    float k = max(smoothstep(0.7, 2.6, coc), b.a);
    col = mix(col, b.rgb, k);
  }
  col += texture2D(tRays, vUv).rgb * uRaysCol;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  col = mix(col, bloom * uHalation, uBloom);
  float vig = 1.0 - uVignette * smoothstep(0.25, 1.15, length(dc * vec2(1.0, 0.85)) * 1.55);
  col *= vig * uExposure * uWB;
  vec3 v = agx(col);
  v = grade(v);
  v = agxEotf(v);
  gl_FragColor = vec4(toSRGB(v), 1.0);
}`,

  present: /* glsl */ `
uniform sampler2D tLdr;
uniform sampler2D tFrozen;
uniform vec2 uLdrTexel;
uniform float uFxaa;
uniform float uCross;
uniform float uFade;
uniform float uBarPx;
uniform float uGrain;
uniform float uFrame;
uniform vec3 uBarColor;
vec3 fxaa(vec2 uv, vec2 px) {
  vec3 rgbNW = texture2D(tLdr, uv + vec2(-1.0, -1.0) * px).rgb;
  vec3 rgbNE = texture2D(tLdr, uv + vec2(1.0, -1.0) * px).rgb;
  vec3 rgbSW = texture2D(tLdr, uv + vec2(-1.0, 1.0) * px).rgb;
  vec3 rgbSE = texture2D(tLdr, uv + vec2(1.0, 1.0) * px).rgb;
  vec3 rgbM = texture2D(tLdr, uv).rgb;
  vec3 lw = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, lw), lNE = dot(rgbNE, lw), lSW = dot(rgbSW, lw), lSE = dot(rgbSE, lw), lM = dot(rgbM, lw);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * px;
  vec3 a = 0.5 * (texture2D(tLdr, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tLdr, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tLdr, uv - dir * 0.5).rgb + texture2D(tLdr, uv + dir * 0.5).rgb);
  float lb = dot(b, lw);
  return (lb < lMin || lb > lMax) ? a : b;
}
void main() {
  vec3 col = uFxaa > 0.5 ? fxaa(vUv, uLdrTexel) : texture2D(tLdr, vUv).rgb;
  if (uCross < 0.999) col = mix(texture2D(tFrozen, vUv).rgb, col, uCross);
  col *= 1.0 - uFade;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float g = hashP(floor(gl_FragCoord.xy) + uFrame * 17.31) + hashP(floor(gl_FragCoord.xy) * 1.37 + uFrame * 3.1) - 1.0;
  col += g * uGrain * (0.25 + 0.75 * (1.0 - l)) * (0.15 + 0.85 * smoothstep(0.0, 0.2, l));
  col += (hashP(gl_FragCoord.xy + 19.19) - 0.5) / 255.0;
  float y = gl_FragCoord.y;
  float bar = step(y, uBarPx) + step(uRes.y - uBarPx, y);
  col = mix(col, uBarColor, clamp(bar, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`,

  copy: /* glsl */ `
uniform sampler2D tSrc;
void main() { gl_FragColor = texture2D(tSrc, vUv); }`,
};

class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(fullscreenTriangle(), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.w = 1; this.h = 1;
    this.q = null;
    this.focusIndex = 0;
    this.frozenValid = false;
    this.state = {
      exposure: 1, temp: 0, tint: 0, contrast: 1, sat: 1, split: 0.1, lift: 0.02,
      shadowTint: new THREE.Color(0.3, 0.45, 0.55), highTint: new THREE.Color(1, 0.8, 0.6),
      bloom: 0.05, rays: 0.6, vignette: 0.32, grain: 0.035, ca: 0.0035,
      dof: true, focus: 10, fstop: 4, autoFocus: false, cocBoost: 1,
      bars: 0, cross: 1, fade: 0, fxaa: false,
    };
    this.sunScreen = new THREE.Vector2(0.5, 0.5);
    this.rayVis = 0;
    this.uRes = { value: new THREE.Vector2(1, 1) };
    const common = { uNear: { value: 0.1 }, uFar: { value: 1500 } };
    this.common = common;
    const mk = (name, uniforms, defines = {}) => new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VS,
      fragmentShader: (name === 'present' ? 'uniform vec2 uRes;\n' : '') + POST_COMMON + POST_SHADERS[name],
      uniforms: { ...common, ...uniforms },
      defines,
      depthTest: false, depthWrite: false,
    });
    this.m = {
      coc: mk('coc', { tScene: { value: null }, tDepth: { value: null }, uSrcTexel: { value: new THREE.Vector2() } }),
      focus: mk('focus', { tCoc: { value: null }, tPrev: { value: null }, uBlend: { value: 0.1 }, uMinFocus: { value: 1.2 } }),
      rayMask: mk('rayMask', { tScene: { value: null }, tDepth: { value: null }, uSun: { value: this.sunScreen }, uAspect: { value: 1 } }),
      rayBlur: mk('rayBlur', { tSrc: { value: null }, uSun: { value: this.sunScreen }, uStep: { value: 1 } }),
      down: mk('down', { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } }),
      up: mk('up', { tSrc: { value: null }, tLow: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.7 } }),
      composite: mk('composite', {
        tScene: { value: null }, tDepth: { value: null }, tDof: { value: null }, tFocus: { value: null }, tBloom: { value: null }, tRays: { value: null },
        uRes: this.uRes, uDof: { value: 1 }, uFocus: { value: 10 }, uAuto: { value: 0 }, uCocScale: { value: 1 },
        uBloom: { value: 0.05 }, uHalation: { value: new THREE.Vector3(1.06, 1.0, 0.92) }, uRaysCol: { value: new THREE.Vector3() },
        uExposure: { value: 1 }, uWB: { value: new THREE.Vector3(1, 1, 1) }, uContrast: { value: 1 }, uSat: { value: 1 }, uSplit: { value: 0.1 }, uLift: { value: 0.02 },
        uShadowTint: { value: new THREE.Color() }, uHighTint: { value: new THREE.Color() }, uVignette: { value: 0.3 }, uCA: { value: 0.003 },
      }),
      present: mk('present', {
        tLdr: { value: null }, tFrozen: { value: null }, uLdrTexel: { value: new THREE.Vector2() }, uRes: this.uRes,
        uFxaa: { value: 0 }, uCross: { value: 1 }, uFade: { value: 0 }, uBarPx: { value: 0 }, uGrain: { value: 0.03 }, uFrame: { value: 0 },
        uBarColor: { value: new THREE.Vector3(10 / 255, 12 / 255, 10 / 255) },
      }),
      copy: mk('copy', { tSrc: { value: null } }),
    };
    this.m.bokeh = null;
  }

  makeRT(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, ...opts,
    });
  }

  setQuality(q) {
    this.q = q;
    const taps = q.dofTaps;
    const maxCoc = 12;
    if (this.m.bokeh) this.m.bokeh.dispose();
    this.m.bokeh = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VS,
      fragmentShader: POST_COMMON + POST_SHADERS.bokeh,
      uniforms: {
        ...this.common, tCoc: { value: null }, tFocus: { value: null }, uTexel: { value: new THREE.Vector2() },
        uFocus: { value: 10 }, uAuto: { value: 0 }, uCocScale: { value: 1 }, uMaxCoc: { value: maxCoc },
      },
      defines: { TAPS: taps, RAD_SCALE: ((maxCoc * maxCoc) / (2 * taps)).toFixed(3) },
      depthTest: false, depthWrite: false,
    });
    this.state.fxaa = q.msaa === 0;
    if (this.w > 1) this.allocate();
  }

  setSize(w, h, outW, outH) {
    this.w = Math.max(2, Math.round(w));
    this.h = Math.max(2, Math.round(h));
    this.outW = outW;
    this.outH = outH;
    this.uRes.value.set(outW, outH);
    this.allocate();
  }

  allocate() {
    const { w, h, q } = this;
    if (!q) return;
    this.dispose();
    const depth = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: q.msaa,
      depthBuffer: true, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.rtCoc = this.makeRT(hw, hh);
    this.rtDof = this.makeRT(hw, hh);
    this.rtFocus = [this.makeRT(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }), this.makeRT(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })];
    const rw = Math.max(16, Math.round(w * q.rayScale)), rh = Math.max(16, Math.round(h * q.rayScale));
    this.rtRayA = this.makeRT(rw, rh);
    this.rtRayB = this.makeRT(rw, rh);
    this.bloomDown = [];
    this.bloomUp = [];
    let bw = w, bh = h;
    for (let i = 0; i < q.bloomLevels; i++) {
      bw = Math.max(2, Math.ceil(bw / 2));
      bh = Math.max(2, Math.ceil(bh / 2));
      this.bloomDown.push(this.makeRT(bw, bh));
      this.bloomUp.push(this.makeRT(bw, bh));
    }
    this.rtLdr = this.makeRT(w, h);
    this.rtFrozen = this.makeRT(w, h);
    this.frozenValid = false;
    this.clearFocus = true;
  }

  dispose() {
    const all = [this.rtScene, this.rtCoc, this.rtDof, this.rtRayA, this.rtRayB, this.rtLdr, this.rtFrozen, ...(this.rtFocus || []), ...(this.bloomDown || []), ...(this.bloomUp || [])];
    for (const rt of all) {
      if (!rt) continue;
      if (rt.depthTexture) rt.depthTexture.dispose();
      rt.dispose();
    }
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  // Copy the current graded frame so the next shot can dissolve from it.
  freezeFrame() {
    if (!this.rtLdr) return;
    this.m.copy.uniforms.tSrc.value = this.rtLdr.texture;
    this.pass(this.m.copy, this.rtFrozen);
    this.frozenValid = true;
  }

  render(scene, camera, time, dt) {
    const r = this.renderer;
    const s = this.state;
    const q = this.q;
    this.common.uNear.value = camera.near;
    this.common.uFar.value = camera.far;

    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    const depthTex = this.rtScene.depthTexture;

    // depth of field
    const filmH = camera.getFilmHeight() / 1000;
    const f = camera.getFocalLength() / 1000;
    const cocFull = ((f * f) / Math.max(0.7, s.fstop)) * (this.h / filmH) * s.cocBoost;
    const focusTex = this.rtFocus[this.focusIndex].texture;
    if (s.dof) {
      const mc = this.m.coc.uniforms;
      mc.tScene.value = this.rtScene.texture;
      mc.tDepth.value = depthTex;
      mc.uSrcTexel.value.set(1 / this.w, 1 / this.h);
      this.pass(this.m.coc, this.rtCoc);
      if (s.autoFocus) {
        const next = 1 - this.focusIndex;
        const mf = this.m.focus.uniforms;
        mf.tCoc.value = this.rtCoc.texture;
        mf.tPrev.value = this.clearFocus ? null : this.rtFocus[this.focusIndex].texture;
        mf.uBlend.value = 1 - Math.exp(-dt * 3.0);
        if (this.clearFocus) {
          r.setRenderTarget(this.rtFocus[this.focusIndex]);
          r.setClearColor(0x000000, 1);
          r.clear(true, false, false);
          mf.tPrev.value = this.rtFocus[this.focusIndex].texture;
          this.clearFocus = false;
        }
        this.pass(this.m.focus, this.rtFocus[next]);
        this.focusIndex = next;
      }
      const mb = this.m.bokeh.uniforms;
      mb.tCoc.value = this.rtCoc.texture;
      mb.tFocus.value = this.rtFocus[this.focusIndex].texture;
      mb.uTexel.value.set(1 / this.rtCoc.width, 1 / this.rtCoc.height);
      mb.uFocus.value = s.focus;
      mb.uAuto.value = s.autoFocus ? 1 : 0;
      mb.uCocScale.value = cocFull * 0.5;
      this.pass(this.m.bokeh, this.rtDof);
    }

    // god rays from the sun (only when it is near the frame)
    const raysOn = this.rayVis * s.rays > 0.003;
    if (raysOn) {
      const mm = this.m.rayMask.uniforms;
      mm.tScene.value = this.rtScene.texture;
      mm.tDepth.value = depthTex;
      mm.uAspect.value = this.w / this.h;
      this.pass(this.m.rayMask, this.rtRayA);
      const mbl = this.m.rayBlur.uniforms;
      let src = this.rtRayA, dst = this.rtRayB;
      for (const step of [0.62, 0.2, 0.06]) {
        mbl.tSrc.value = src.texture;
        mbl.uStep.value = step;
        this.pass(this.m.rayBlur, dst);
        [src, dst] = [dst, src];
      }
      this.rayResult = src;
    }

    // bloom
    const md = this.m.down.uniforms;
    let src = this.rtScene;
    for (let i = 0; i < this.bloomDown.length; i++) {
      md.tSrc.value = src.texture;
      md.uTexel.value.set(1 / src.width, 1 / src.height);
      md.uKaris.value = i === 0 ? 1 : 0;
      this.pass(this.m.down, this.bloomDown[i]);
      src = this.bloomDown[i];
    }
    const mu = this.m.up.uniforms;
    let low = this.bloomDown[this.bloomDown.length - 1];
    for (let i = this.bloomDown.length - 2; i >= 0; i--) {
      mu.tSrc.value = this.bloomDown[i].texture;
      mu.tLow.value = low.texture;
      mu.uTexel.value.set(1 / low.width, 1 / low.height);
      mu.uScatter.value = 0.68;
      this.pass(this.m.up, this.bloomUp[i]);
      low = this.bloomUp[i];
    }

    // grade
    const mc = this.m.composite.uniforms;
    mc.tScene.value = this.rtScene.texture;
    mc.tDepth.value = depthTex;
    mc.tDof.value = this.rtDof.texture;
    mc.tFocus.value = this.rtFocus[this.focusIndex].texture;
    mc.tBloom.value = low.texture;
    mc.tRays.value = raysOn ? this.rayResult.texture : this.rtRayB.texture;
    mc.uDof.value = s.dof ? 1 : 0;
    mc.uFocus.value = s.focus;
    mc.uAuto.value = s.autoFocus ? 1 : 0;
    mc.uCocScale.value = cocFull;
    mc.uBloom.value = s.bloom;
    const rk = raysOn ? this.rayVis * s.rays : 0;
    mc.uRaysCol.value.set(U.uSunCol.value.r * rk, U.uSunCol.value.g * rk, U.uSunCol.value.b * rk);
    mc.uExposure.value = s.exposure;
    const wb = [1 + s.temp * 0.9, 1 + s.tint * 0.5, 1 - s.temp * 1.1];
    const wl = 0.2126 * wb[0] + 0.7152 * wb[1] + 0.0722 * wb[2];
    mc.uWB.value.set(wb[0] / wl, wb[1] / wl, wb[2] / wl);
    mc.uContrast.value = s.contrast;
    mc.uSat.value = s.sat;
    mc.uSplit.value = s.split;
    mc.uLift.value = s.lift;
    mc.uShadowTint.value.copy(s.shadowTint);
    mc.uHighTint.value.copy(s.highTint);
    mc.uVignette.value = s.vignette;
    mc.uCA.value = s.ca;
    this.pass(this.m.composite, this.rtLdr);

    // present
    const mp = this.m.present.uniforms;
    mp.tLdr.value = this.rtLdr.texture;
    mp.tFrozen.value = this.frozenValid ? this.rtFrozen.texture : this.rtLdr.texture;
    mp.uLdrTexel.value.set(1 / this.w, 1 / this.h);
    mp.uFxaa.value = s.fxaa ? 1 : 0;
    mp.uCross.value = this.frozenValid ? s.cross : 1;
    mp.uFade.value = s.fade;
    mp.uBarPx.value = s.bars * this.outH;
    mp.uGrain.value = s.grain;
    mp.uFrame.value = Math.floor(time * 24) % 997;
    this.pass(this.m.present, null);
  }

  // Sun position on screen and how much god rays should show.
  updateSun(camera, sunDir, keyEl) {
    const p = new THREE.Vector3().copy(camera.position).addScaledVector(sunDir, 500);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const facing = fwd.dot(sunDir);
    p.project(camera);
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const out = Math.max(Math.abs(p.x), Math.abs(p.y));
    this.rayVis = smoothstep(0.05, 0.35, facing) * (1 - smoothstep(1.0, 1.8, out)) * smoothstep(-3, 2, keyEl);
  }
}
