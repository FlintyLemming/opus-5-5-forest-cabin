/* Textures: GPU-baked tiling materials (bark, wood, end grain, stone, ground detail, noise, smoke)
   and a hand-drawn Canvas atlas of plant sprites with dilated colors and coverage-preserving mipmaps. */

// World size (meters) covered by one tile of each baked texture; UVs in the scene are in meters.
const TEX_SIZE = {
  bark: [1.6, 0.8],   // u along the trunk, v around it
  birch: [1.2, 0.6],
  wood: [1.6, 0.8],
  stone: [1.0, 1.0],
  ground: [4.0, 4.0],
};

const BAKE_PRELUDE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSize;
uniform float uStrength;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float pnoise(vec2 p, vec2 per, float seed) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  float a = hash(i0 + seed), b = hash(vec2(i1.x, i0.y) + seed), c = hash(vec2(i0.x, i1.y) + seed), d = hash(i1 + seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 p, vec2 per, int oct, float seed) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * pnoise(p, per, seed + float(i) * 19.19);
    n += a; p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / n;
}
vec3 pvoronoi(vec2 p, vec2 per, float seed) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      vec2 o = vec2(hash(c + seed), hash(c + seed + 31.7));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash(c + seed + 71.3); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
`;

const BAKE_MAIN = /* glsl */ `
void main() {
#ifdef BAKE_NORMAL
  float e = 1.0 / uSize;
  float hL = heightFn(vUv - vec2(e, 0.0)), hR = heightFn(vUv + vec2(e, 0.0));
  float hD = heightFn(vUv - vec2(0.0, e)), hU = heightFn(vUv + vec2(0.0, e));
  vec3 n = normalize(vec3((hL - hR) * uStrength, (hD - hU) * uStrength, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
#else
  gl_FragColor = albedoFn(vUv);
#endif
}`;

const BAKES = {
  bark: /* glsl */ `
// texture x runs along the trunk, y around it: plates are long and narrow with deep fissures
float plates(vec2 uv, out float id) {
  vec2 per = vec2(4.0, 11.0);
  vec2 w = vec2(pfbm(uv * vec2(2.0, 4.0), vec2(2.0, 4.0), 3, 1.0), pfbm(uv * vec2(2.0, 4.0) + 5.2, vec2(2.0, 4.0), 3, 2.0)) - 0.5;
  vec3 v = pvoronoi(uv * per + w * vec2(1.6, 0.7), per, 3.0);
  id = v.z;
  return v.y - v.x;
}
float heightFn(vec2 uv) {
  float id; float e = plates(uv, id);
  float fissure = smoothstep(0.0, 0.2, e);
  float fibers = pnoise(uv * vec2(6.0, 90.0), vec2(6.0, 90.0), 7.0);
  float flake = pfbm(uv * vec2(12.0, 24.0), vec2(12.0, 24.0), 3, 9.0);
  float cross = smoothstep(0.92, 0.98, pnoise(uv * vec2(14.0, 6.0), vec2(14.0, 6.0), 13.0));
  return fissure * (0.6 + 0.25 * id) + fibers * 0.08 + flake * 0.14 - cross * 0.25 * fissure;
}
vec4 albedoFn(vec2 uv) {
  float id; float e = plates(uv, id);
  float fissure = smoothstep(0.0, 0.17, e);
  float flake = pfbm(uv * vec2(12.0, 24.0), vec2(12.0, 24.0), 3, 9.0);
  float fibers = pnoise(uv * vec2(6.0, 90.0), vec2(6.0, 90.0), 7.0);
  float gray = pfbm(uv * 3.0, vec2(3.0), 3, 11.0);
  vec3 plate = mix(vec3(0.16, 0.1, 0.068), vec3(0.27, 0.19, 0.13), id);
  plate = mix(plate, vec3(0.24, 0.23, 0.21), smoothstep(0.45, 0.8, gray) * 0.5);
  plate *= 0.8 + 0.35 * flake + 0.12 * fibers;
  float cross = smoothstep(0.92, 0.98, pnoise(uv * vec2(14.0, 6.0), vec2(14.0, 6.0), 13.0));
  vec3 col = mix(vec3(0.028, 0.02, 0.016), plate, fissure * (1.0 - cross * 0.7));
  return vec4(col, 1.0);
}`,

  birch: /* glsl */ `
float lenticels(vec2 uv) {
  vec2 per = vec2(5.0, 30.0);
  vec2 p = uv * per;
  vec2 i = floor(p), f = fract(p);
  float m = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 g = vec2(float(dx), float(dy));
      vec2 c = mod(i + g, per);
      float h = hash(c + 5.0);
      if (h < 0.5) continue;
      vec2 o = vec2(hash(c + 9.0), hash(c + 13.0));
      vec2 r = g + o - f;
      float len = 0.2 + 0.55 * hash(c + 17.0);
      float d = length(vec2(max(abs(r.x) - len, 0.0) * 1.0, r.y * 1.4));
      m = max(m, smoothstep(0.3, 0.1, d) * (0.55 + 0.45 * h));
    }
  }
  return m;
}
float patches(vec2 uv) { return smoothstep(0.62, 0.7, pfbm(uv * vec2(3.0, 5.0) + 2.0, vec2(3.0, 5.0), 4, 8.0)); }
float heightFn(vec2 uv) {
  uv = uv.yx;
  return 0.6 - lenticels(uv) * 0.45 - patches(uv) * 0.3 + pfbm(uv * vec2(20.0, 40.0), vec2(20.0, 40.0), 3, 21.0) * 0.12;
}
vec4 albedoFn(vec2 uv) {
  uv = uv.yx;
  float n = pfbm(uv * vec2(4.0, 8.0), vec2(4.0, 8.0), 4, 3.0);
  vec3 base = mix(vec3(0.6, 0.58, 0.52), vec3(0.74, 0.71, 0.64), n);
  float band = pnoise(vec2(uv.x * 3.0, uv.y * 24.0), vec2(3.0, 24.0), 4.0);
  base = mix(base, vec3(0.6, 0.47, 0.4), smoothstep(0.7, 0.92, band) * 0.35);
  float l = lenticels(uv);
  float d = patches(uv);
  vec3 col = mix(base, vec3(0.055, 0.05, 0.045), max(l, d * 0.92));
  return vec4(col, 1.0);
}`,

  wood: /* glsl */ `
float knotMask(vec2 uv, out float ring) {
  vec3 k = pvoronoi(uv * vec2(2.0, 3.0), vec2(2.0, 3.0), 41.0);
  float on = step(0.74, k.z);
  ring = smoothstep(0.4, 0.0, k.x) * on;
  return smoothstep(0.13, 0.05, k.x) * on;
}
float grain(vec2 uv) {
  float ring;
  knotMask(uv, ring);
  float warp = pfbm(uv * vec2(2.0, 4.0), vec2(2.0, 4.0), 3, 5.0) * 2.4 + ring * 1.2;
  float g = 0.5 + 0.5 * sin((uv.y * 46.0 + warp) * 6.2831853);
  float fine = pnoise(uv * vec2(6.0, 380.0), vec2(6.0, 380.0), 12.0);
  return g * 0.55 + fine * 0.45;
}
float checks(vec2 uv) {
  float n = pnoise(uv * vec2(3.0, 60.0), vec2(3.0, 60.0), 23.0);
  float gate = smoothstep(0.55, 0.78, pnoise(uv * vec2(5.0, 10.0), vec2(5.0, 10.0), 29.0));
  return smoothstep(0.055, 0.0, abs(n - 0.5)) * gate;
}
float heightFn(vec2 uv) {
  float ring; float k = knotMask(uv, ring);
  return 0.5 + grain(uv) * 0.35 - checks(uv) * 0.9 + k * 0.08;
}
vec4 albedoFn(vec2 uv) {
  float ring; float k = knotMask(uv, ring);
  float w = grain(uv);
  float weather = pfbm(uv * 3.0, vec2(3.0), 4, 31.0);
  vec3 fresh = mix(vec3(0.3, 0.195, 0.115), vec3(0.42, 0.29, 0.17), w);
  vec3 gray = mix(vec3(0.29, 0.26, 0.22), vec3(0.4, 0.37, 0.32), w);
  vec3 col = mix(fresh, gray, smoothstep(0.35, 0.75, weather) * 0.55);
  col = mix(col, vec3(0.11, 0.065, 0.035), k * 0.85);
  col *= 1.0 - checks(uv) * 0.75;
  return vec4(col, 1.0);
}`,

  endgrain: /* glsl */ `
vec4 endSample(vec2 uv, out float h) {
  vec2 cell = floor(uv * 2.0);
  vec2 c = (cell + 0.5) / 2.0;
  vec2 d = uv - c;
  float r = length(d) / 0.235;
  float ang = atan(d.y, d.x);
  float seed = hash(cell + 3.1);
  vec2 q = vec2(cos(ang), sin(ang));
  float warp = (pnoise(q * 3.0 + seed * 10.0 + 10.0, vec2(64.0), 1.0) - 0.5) * 0.09 + (pnoise(d * 40.0 + seed, vec2(64.0), 2.0) - 0.5) * 0.03;
  float rr = r + warp;
  float rings = fract(rr * (13.0 + seed * 8.0));
  float late = smoothstep(0.72, 0.95, rings);
  vec3 wood = mix(vec3(0.56, 0.41, 0.26), vec3(0.43, 0.29, 0.17), late);
  wood *= 0.9 + 0.2 * pnoise(d * 90.0, vec2(256.0), 4.0);
  float crack = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = hash(cell + float(i) * 7.3) * 6.2831853;
    float len = 0.45 + 0.4 * hash(cell + float(i) * 3.7);
    float da = abs(sin(ang - a)) * r;
    float front = step(0.0, cos(ang - a));
    crack = max(crack, smoothstep(0.03, 0.0, da) * step(r, len) * front * smoothstep(0.0, 0.1, r));
  }
  wood = mix(wood, vec3(0.08, 0.05, 0.03), crack * 0.85);
  wood = mix(vec3(0.24, 0.15, 0.08), wood, smoothstep(0.025, 0.07, r));
  vec3 bark = vec3(0.1, 0.07, 0.045);
  float barkAmt = smoothstep(0.88, 0.93, r);
  wood = mix(wood, bark, barkAmt);
  h = 0.5 - crack * 0.4 - late * 0.06 + barkAmt * 0.15;
  return vec4(wood, 1.0);
}
float heightFn(vec2 uv) { float h; endSample(uv, h); return h; }
vec4 albedoFn(vec2 uv) { float h; return endSample(uv, h); }`,

  stone: /* glsl */ `
float lichen(vec2 uv) { return smoothstep(0.6, 0.66, pfbm(uv * 6.0 + 1.3, vec2(6.0), 4, 17.0)); }
float heightFn(vec2 uv) {
  return pfbm(uv * 8.0, vec2(8.0), 5, 3.0) * 0.7 + pnoise(uv * 120.0, vec2(120.0), 7.0) * 0.15 + lichen(uv) * 0.04;
}
vec4 albedoFn(vec2 uv) {
  float m = pfbm(uv * 4.0, vec2(4.0), 5, 3.0);
  float s = pnoise(uv * 160.0, vec2(160.0), 7.0);
  float s2 = pnoise(uv * 90.0, vec2(90.0), 11.0);
  vec3 base = mix(vec3(0.19, 0.18, 0.17), vec3(0.33, 0.31, 0.28), m);
  base = mix(base, vec3(0.075, 0.07, 0.065), smoothstep(0.72, 0.86, s) * 0.8);
  base = mix(base, vec3(0.47, 0.45, 0.41), smoothstep(0.76, 0.9, s2) * 0.6);
  base = mix(base, vec3(0.42, 0.45, 0.33), lichen(uv) * 0.65);
  float l2 = pfbm(uv * 9.0 + 4.1, vec2(9.0), 3, 27.0);
  base = mix(base, vec3(0.55, 0.36, 0.13), smoothstep(0.73, 0.77, l2) * 0.55);
  return vec4(base, 1.0);
}`,

  ground: /* glsl */ `
float needles(vec2 uv) {
  vec2 per = vec2(96.0);
  vec2 p = uv * per;
  vec2 i = floor(p), f = fract(p);
  float m = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      for (int k = 0; k < 2; k++) {
        float s = float(k) * 13.1;
        vec2 a = g + vec2(hash(c + s + 1.0), hash(c + s + 2.0));
        float ang = hash(c + s + 3.0) * 6.2831853;
        float len = 0.5 + 0.6 * hash(c + s + 4.0);
        vec2 b = a + vec2(cos(ang), sin(ang)) * len;
        m = max(m, smoothstep(0.075, 0.02, segDist(f, a, b)) * (0.45 + 0.55 * hash(c + s + 5.0)));
      }
    }
  }
  return m;
}
float pebbles(vec2 uv) {
  vec3 v = pvoronoi(uv * 40.0, vec2(40.0), 51.0);
  float on = step(0.62, v.z);
  float r = 0.18 + 0.18 * fract(v.z * 13.0);
  return smoothstep(r, r * 0.55, v.x) * on;
}
float heightFn(vec2 uv) { return 0.0; }
vec4 albedoFn(vec2 uv) {
  float soil = pfbm(uv * 24.0, vec2(24.0), 5, 61.0);
  float n = needles(uv);
  float debris = pfbm(uv * 48.0, vec2(48.0), 3, 71.0) * 0.6 + pfbm(uv * 6.0, vec2(6.0), 3, 81.0) * 0.4;
  return vec4(soil, n, debris, pebbles(uv));
}`,

  noise: /* glsl */ `
float heightFn(vec2 uv) { return 0.0; }
vec4 albedoFn(vec2 uv) {
  return vec4(pnoise(uv * 8.0, vec2(8.0), 1.0), pnoise(uv * 16.0, vec2(16.0), 2.0), pfbm(uv * 4.0, vec2(4.0), 4, 3.0), pvoronoi(uv * 6.0, vec2(6.0), 4.0).x);
}`,

  smoke: /* glsl */ `
float heightFn(vec2 uv) { return 0.0; }
vec4 albedoFn(vec2 uv) {
  vec2 d = uv - 0.5;
  float r = length(d) * 2.0;
  float n = pfbm(uv * 3.0, vec2(3.0), 5, 5.0);
  float n2 = pfbm(uv * 7.0 + 3.0, vec2(7.0), 4, 9.0);
  float shape = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.9);
  float a = shape * smoothstep(0.3, 0.75, n2 * 0.55 + n * 0.55);
  return vec4(vec3(0.75 + 0.25 * n2), a);
}`,
};

class TextureBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(fullscreenTriangle(), null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.targets = [];
  }
  bake(name, { size = 512, srgb = false, normal = false, strength = 4, wrap = THREE.RepeatWrapping, mipmaps = true } = {}) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      wrapS: wrap, wrapT: wrap,
      minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: mipmaps,
      depthBuffer: false,
      anisotropy: this.aniso,
    });
    const mat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VS,
      fragmentShader: (normal ? '#define BAKE_NORMAL\n' : '') + BAKE_PRELUDE + BAKES[name] + BAKE_MAIN,
      uniforms: { uSize: { value: size }, uStrength: { value: strength } },
      depthTest: false, depthWrite: false,
    });
    this.mesh.material = mat;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    mat.dispose();
    this.targets.push(rt);
    return rt.texture;
  }
}

// Render-target textures cannot be cloned (a clone has no GPU image), so the repeat is set in place.
function withRepeat(tex, size) {
  tex.repeat.set(1 / size[0], 1 / size[1]);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ── Canvas plant atlas ────────────────────────────────────────────────────── */

const ATLAS_SIZE = 2048;
const ATLAS_CELLS = (() => {
  const cells = {
    fir: [[0, 0, 1024, 256], [0, 256, 1024, 256], [0, 512, 1024, 256], [0, 768, 1024, 256]],
    pine: [[1024, 0, 512, 512], [1536, 0, 512, 512]],
    birch: [[1024, 512, 512, 512], [1536, 512, 512, 512]],
    maple: [[1024, 1024, 512, 512], [1536, 1024, 512, 512]],
    fern: [[0, 1024, 1024, 256]],
    flower: [[0, 1280, 256, 256], [256, 1280, 256, 256], [512, 1280, 256, 256], [768, 1280, 256, 256]],
    leaf: [],
    shrub: [[1024, 1536, 512, 512]],
    tuft: [[1536, 1536, 512, 512]],
  };
  for (let i = 0; i < 8; i++) cells.leaf.push([(i % 4) * 256, 1536 + Math.floor(i / 4) * 256, 256, 256]);
  return cells;
})();

// UV rectangle [u0, v0, u1, v1] for an atlas cell (texture uploaded without flipY: v grows downward).
function atlasUV(kind, i = 0) {
  const [x, y, w, h] = ATLAS_CELLS[kind][i];
  return [x / ATLAS_SIZE, y / ATLAS_SIZE, (x + w) / ATLAS_SIZE, (y + h) / ATLAS_SIZE];
}

function polyAlong(pts) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(l);
    total += l;
  }
  return {
    total,
    at(d) {
      let i = 0;
      while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
      const t = segs[i] > 0 ? clamp(d / segs[i], 0, 1) : 0;
      const a = pts[i], b = pts[i + 1];
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), Math.atan2(b[1] - a[1], b[0] - a[0])];
    },
  };
}

function strokeLine(ctx, x0, y0, x1, y1, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function strokePoly(ctx, pts, color, w0, w1) {
  for (let i = 1; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    strokeLine(ctx, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], color, lerp(w0, w1, t));
  }
}

function drawFirSpray(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  const cy = h * 0.5;
  const len = w - 60;
  const droop = rng.range(-0.05, 0.05) * h;
  const twigPt = (t) => [28 + t * len, cy + droop * Math.sin(t * Math.PI) - t * h * 0.02];
  const dark = ['#152618', '#19291b', '#1c2f1d'];
  const mid = ['#22392a', '#264029', '#2b442b', '#253d27'];
  const light = ['#3b5a31', '#456331', '#4f6c37', '#58733a'];
  const twigs = [];
  const main = [];
  for (let i = 0; i <= 24; i++) main.push(twigPt(i / 24));
  twigs.push({ pts: main, depth: 0 });
  for (let t = 0.04; t < 0.95; t += rng.range(0.026, 0.04)) {
    const [px, py] = twigPt(t);
    for (const s of [-1, 1]) {
      if (rng() < 0.06) continue;
      const L = h * 0.47 * (1 - t * 0.5) * rng.range(0.78, 1.06);
      const a0 = s * rng.range(0.55, 0.92);
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const q = k / 6;
        const a = a0 * (1 - q * 0.22);
        pts.push([px + Math.cos(a) * L * q, py + Math.sin(a) * L * q]);
      }
      twigs.push({ pts, depth: 1 });
    }
  }
  for (const tw of twigs) strokePoly(ctx, tw.pts, '#4a3a28', tw.depth ? 2.6 : 5.5, tw.depth ? 1.0 : 2.0);
  for (const layer of [0, 1, 2]) {
    for (const tw of twigs) {
      const path = polyAlong(tw.pts);
      const step = layer === 0 ? 4.4 : 3.7;
      for (let d = 3; d < path.total; d += step * rng.range(0.8, 1.2)) {
        const q = d / path.total;
        if (layer === 2 && q < 0.62) continue;
        const [x, y, ang] = path.at(d);
        for (const s of [-1, 1]) {
          const a = ang + s * rng.range(0.85, 1.25);
          const nl = (layer === 0 ? 1.18 : 1.0) * rng.range(10, 17) * (tw.depth ? 0.92 : 1.12) * (1 - q * 0.22);
          const col = layer === 0 ? rng.pick(dark) : layer === 1 ? rng.pick(mid) : rng.pick(light);
          strokeLine(ctx, x, y, x + Math.cos(a) * nl, y + Math.sin(a) * nl, col, layer === 0 ? 3.0 : 2.2);
        }
      }
    }
  }
  ctx.restore();
}

function drawPineTuft(ctx, [x0, y0, w, h], rng) {
  const cx = x0 + w / 2, cy = y0 + h / 2, R = w * 0.46;
  const cols = ['#24391f', '#2c4424', '#33492a', '#3c5530', '#456034', '#2a3f22'];
  strokeLine(ctx, cx - R * 0.05, cy + R * 0.05, cx + R * 0.25, cy + R * 0.3, '#4b3a28', 6);
  for (let i = 0; i < 560; i++) {
    const a = rng() * TAU;
    const len = R * rng.range(0.38, 1.0);
    const st = rng.range(0, 0.16) * R;
    const sx = cx + Math.cos(a) * st, sy = cy + Math.sin(a) * st;
    const ex = cx + Math.cos(a) * (st + len), ey = cy + Math.sin(a) * (st + len);
    const bend = rng.range(-0.12, 0.12) * len;
    const mx = (sx + ex) / 2 - Math.sin(a) * bend, my = (sy + ey) / 2 + Math.cos(a) * bend;
    ctx.strokeStyle = cols[Math.min(cols.length - 1, Math.floor(rng() * cols.length * (0.6 + 0.4 * (len / R))))];
    ctx.lineWidth = rng.range(1.8, 2.8);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
}

function leafOutline(ctx, kind, L, W, rng) {
  ctx.beginPath();
  if (kind === 'maple') {
    const cx = L * 0.45;
    const lobes = [[0, 0.62], [0.95, 0.52], [-0.95, 0.52], [1.85, 0.34], [-1.85, 0.34]];
    const n = 140;
    for (let i = 0; i <= n; i++) {
      const phi = -Math.PI + (i / n) * TAU;
      let r = 0.34;
      for (const [pa, amp] of lobes) r = Math.max(r, 0.34 + amp * Math.pow(Math.max(0, Math.cos(phi - pa)), 10));
      r += 0.035 * Math.max(0, Math.sin(phi * 21));
      if (Math.abs(Math.abs(phi) - Math.PI) < 0.35) r *= 0.75;
      const x = cx + Math.cos(phi) * r * L * 0.62, y = Math.sin(phi) * r * L * 0.62;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  } else {
    const n = 36;
    const serr = kind === 'birch' ? 0.07 : kind === 'aspen' ? 0.02 : 0.04;
    const widest = kind === 'birch' ? 0.32 : kind === 'aspen' ? 0.45 : kind === 'willow' ? 0.4 : 0.4;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let hw = t < widest ? Math.sin((t / widest) * Math.PI * 0.5) : Math.pow(Math.cos(((t - widest) / (1 - widest)) * Math.PI * 0.5), 0.85);
      if (kind === 'oak') hw *= 0.75 + 0.25 * Math.abs(Math.sin(t * Math.PI * 4.5));
      hw *= W * (1 + (i % 2 ? serr : -serr) * (t > 0.1 && t < 0.95 ? 1 : 0));
      pts.push([t * L, hw]);
    }
    ctx.moveTo(0, 0);
    for (const [x, y] of pts) ctx.lineTo(x, -y);
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
}

function drawLeaf(ctx, x, y, ang, len, kind, color, rng, { vein = true, curl = 1 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  strokeLine(ctx, 0, 0, len * 0.16, 0, '#4b3a26', Math.max(1, len * 0.03));
  ctx.translate(len * 0.14, 0);
  const L = len * 0.86;
  const W = (kind === 'willow' ? 0.16 : kind === 'aspen' ? 0.42 : kind === 'oak' ? 0.34 : 0.33) * L * curl;
  leafOutline(ctx, kind, L, W, rng);
  const c = new THREE.Color(color);
  const g = ctx.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, '#' + c.clone().multiplyScalar(0.78).getHexString());
  g.addColorStop(0.55, color);
  g.addColorStop(1, '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.08).getHexString());
  ctx.fillStyle = g;
  ctx.fill();
  if (vein) {
    const vc = '#' + c.clone().multiplyScalar(0.72).getHexString();
    strokeLine(ctx, 0, 0, L * (kind === 'maple' ? 0.75 : 0.92), 0, vc, Math.max(0.8, len * 0.018));
    if (kind === 'maple') {
      for (const a of [0.95, -0.95, 1.85, -1.85]) strokeLine(ctx, L * 0.45, 0, L * 0.45 + Math.cos(a) * L * 0.3, Math.sin(a) * L * 0.3, vc, Math.max(0.6, len * 0.012));
    } else {
      for (let k = 1; k < 6; k++) {
        const t = k / 6.5;
        for (const s of [-1, 1]) strokeLine(ctx, t * L, 0, t * L + L * 0.1, s * W * 0.55 * (1 - t * 0.5), vc, 0.6);
      }
    }
  }
  if (rng.chance(0.18)) {
    ctx.fillStyle = 'rgba(92, 55, 25, 0.55)';
    ctx.beginPath();
    ctx.arc(L * rng.range(0.3, 0.8), rng.range(-0.3, 0.3) * W, rng.range(1.5, 3.5), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawLeafCluster(ctx, [x0, y0, w, h], rng, kind) {
  ctx.save();
  ctx.translate(x0, y0);
  const palette = kind === 'maple'
    ? ['#d2582a', '#c2402a', '#e0812e', '#b8322c', '#d96d2b', '#e39a35', '#c9502c']
    : kind === 'shrub'
      ? ['#8f2b26', '#a3392c', '#7a2433', '#b04a2e', '#6f2a2a', '#9a3a2a']
      : ['#d8b13c', '#c99a2a', '#e2c255', '#b8a032', '#cfa634', '#a9a43a', '#dcb846'];
  const leafLen = kind === 'maple' ? [62, 86] : kind === 'shrub' ? [26, 36] : [34, 46];
  const base = [w * 0.5, h * 0.94];
  const nTw = kind === 'shrub' ? 7 : kind === 'maple' ? 4 : 5;
  const twigs = [];
  for (let i = 0; i < nTw; i++) {
    const spread = kind === 'shrub' ? 0.32 : 0.42;
    const ang = -Math.PI / 2 + (i - (nTw - 1) / 2) * spread + rng.range(-0.12, 0.12);
    const L = h * rng.range(0.55, 0.8);
    const sag = kind === 'birch' ? Math.sign(ang + Math.PI / 2) * 0.55 : 0.2 * Math.sign(ang + Math.PI / 2);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const q = k / 8;
      const a = ang + q * q * sag;
      const prev = pts.length ? pts[pts.length - 1] : base;
      pts.push(k === 0 ? [...base] : [prev[0] + Math.cos(a) * L / 8, prev[1] + Math.sin(a) * L / 8]);
    }
    twigs.push(pts);
  }
  ctx.lineCap = 'round';
  for (const tw of twigs) strokePoly(ctx, tw, '#3d2e22', 3.2, 1.0);
  const leaves = [];
  for (const tw of twigs) {
    const path = polyAlong(tw);
    for (let d = path.total * 0.22; d < path.total; d += leafLen[0] * rng.range(0.38, 0.55)) {
      const [x, y, ang] = path.at(d);
      const s = leaves.length % 2 ? 1 : -1;
      leaves.push([x, y, ang + s * rng.range(0.45, 1.05), rng.range(leafLen[0], leafLen[1])]);
    }
    const [x, y, ang] = path.at(path.total);
    leaves.push([x, y, ang + rng.range(-0.2, 0.2), rng.range(leafLen[0], leafLen[1])]);
  }
  for (let i = leaves.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [leaves[i], leaves[j]] = [leaves[j], leaves[i]]; }
  const lk = kind === 'maple' ? 'maple' : kind === 'shrub' ? 'aspen' : 'birch';
  for (const [x, y, a, l] of leaves) drawLeaf(ctx, x, y, a, l, lk, rng.pick(palette), rng, { vein: kind !== 'shrub' });
  if (kind === 'shrub') {
    for (let i = 0; i < 14; i++) {
      const tw = rng.pick(twigs);
      const p = polyAlong(tw).at(polyAlong(tw).total * rng.range(0.3, 1));
      ctx.fillStyle = rng.pick(['#2b2f55', '#33345e', '#262645']);
      ctx.beginPath();
      ctx.arc(p[0] + rng.range(-8, 8), p[1] + rng.range(-8, 8), rng.range(3.5, 5), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFern(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  const cy = h * 0.5;
  const L = w - 30;
  const rach = (t) => [12 + t * L, cy + Math.sin(t * Math.PI * 0.8) * h * 0.06];
  const col = ['#a39f68', '#98955f', '#aaa66e', '#8f8c58'];
  const pts = [];
  for (let i = 0; i <= 30; i++) pts.push(rach(i / 30));
  strokePoly(ctx, pts, '#6e6440', 4, 1.2);
  let side = 1;
  for (let t = 0.04; t < 0.97; t += 0.036) {
    const [px, py] = rach(t);
    const pl = h * 0.47 * Math.sin(Math.PI * Math.min(1, (t + 0.12) / 1.12)) * (1 - Math.pow(t, 4) * 0.6);
    for (const s of [-1, 1]) {
      const a = s * (1.0 + rng.range(-0.08, 0.08)) - (s === side ? 0 : 0.04);
      const ex = px + Math.cos(a) * pl * 0.55, ey = py + Math.sin(a) * pl;
      strokeLine(ctx, px, py, ex, ey, '#7a7248', 1.4);
      const n = Math.max(3, Math.floor(pl / 6));
      for (let k = 1; k <= n; k++) {
        const q = k / (n + 1);
        const lx = px + (ex - px) * q, ly = py + (ey - py) * q;
        const lw = (1 - q * 0.75) * pl * 0.2;
        ctx.fillStyle = rng.pick(col);
        ctx.beginPath();
        ctx.ellipse(lx + lw * 0.45, ly, lw, lw * 0.42, a * 0.25 + 0.6, 0, TAU);
        ctx.fill();
      }
    }
    side = -side;
  }
  ctx.restore();
}

function drawFlowers(ctx, [x0, y0, w, h], rng, kind) {
  ctx.save();
  ctx.translate(x0, y0);
  const stems = kind === 'yarrow' ? 3 : 4;
  for (let i = 0; i < stems; i++) {
    const bx = w * (0.3 + 0.4 * (i / Math.max(1, stems - 1))) + rng.range(-10, 10);
    const top = h * rng.range(0.12, 0.3);
    const lean = rng.range(-28, 28);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const q = k / 8;
      pts.push([bx + lean * q * q, h - 6 - (h - 6 - top) * q]);
    }
    const stemCol = kind === 'seed' ? '#a99a6c' : '#4d5a30';
    strokePoly(ctx, pts, stemCol, 2.6, 1.4);
    const [tx, ty] = pts[pts.length - 1];
    if (kind === 'aster') {
      for (let k = 0; k < 3; k++) strokeLine(ctx, pts[3 + k][0], pts[3 + k][1], pts[3 + k][0] + rng.sign() * 16, pts[3 + k][1] + 6, '#56633a', 2);
      const heads = rng.int(1, 2);
      for (let k = 0; k < heads; k++) {
        const hx = tx + (k ? rng.range(-22, 22) : 0), hy = ty + (k ? rng.range(6, 20) : 0);
        const r = rng.range(12, 17);
        const petal = rng.pick(['#9a86c8', '#8b77bb', '#a996d4', '#b3a2d8']);
        for (let p = 0; p < 18; p++) {
          const a = (p / 18) * TAU + rng.range(-0.05, 0.05);
          ctx.fillStyle = petal;
          ctx.beginPath();
          ctx.ellipse(hx + Math.cos(a) * r * 0.55, hy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.11, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#d9a92f';
        ctx.beginPath();
        ctx.arc(hx, hy, r * 0.28, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 'goldenrod') {
      const path = polyAlong(pts);
      for (let d = path.total * 0.45; d < path.total; d += 3) {
        const [x, y, ang] = path.at(d);
        const q = (d / path.total - 0.45) / 0.55;
        const n = Math.floor(2 + q * 3);
        for (let k = 0; k < n; k++) {
          const a = ang - Math.PI / 2 + rng.range(-1.2, 1.2);
          const dist = rng.range(2, 10 + 8 * (1 - q));
          ctx.fillStyle = rng.pick(['#d6ad30', '#e2bf45', '#c99c25', '#e8c95a']);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, rng.range(1.6, 2.8), 0, TAU);
          ctx.fill();
        }
      }
    } else if (kind === 'yarrow') {
      for (let k = 0; k < 4; k++) {
        const p = pts[2 + k];
        for (let j = 0; j < 6; j++) strokeLine(ctx, p[0], p[1], p[0] + rng.range(-14, 14), p[1] + rng.range(-4, 6), '#5a6a3a', 1);
      }
      for (let k = 0; k < 70; k++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * 24;
        ctx.fillStyle = rng.pick(['#ece5d2', '#f2ecdc', '#dcd3bd']);
        ctx.beginPath();
        ctx.arc(tx + Math.cos(a) * r, ty + Math.sin(a) * r * 0.45, rng.range(1.8, 3), 0, TAU);
        ctx.fill();
      }
    } else {
      const path = polyAlong(pts);
      for (let d = path.total * 0.5; d < path.total; d += 7) {
        const [x, y] = path.at(d);
        const s = rng.sign();
        const ex = x + s * rng.range(8, 16), ey = y + rng.range(8, 18);
        strokeLine(ctx, x, y, ex, ey, '#b8a77a', 1);
        ctx.fillStyle = rng.pick(['#c8b68a', '#bba776', '#d4c39a']);
        ctx.beginPath();
        ctx.ellipse(ex, ey, 2.4, 5, s * 0.5, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawTuft(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  const cols = ['#b7a36a', '#a2945c', '#c8b47a', '#8a8550', '#9f9a5e', '#7b7c47', '#c2ad70'];
  for (let i = 0; i < 90; i++) {
    const bx = w * 0.5 + rng.range(-34, 34);
    const lean = rng.range(-1, 1);
    const H = h * rng.range(0.5, 0.92);
    const ex = bx + lean * w * 0.42, ey = h - 4 - H * (1 - Math.abs(lean) * 0.35);
    const cx = bx + lean * w * 0.08, cy = h - 4 - H * 0.75;
    const col = rng.pick(cols);
    const segs = 4;
    let px = bx, py = h - 4;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * ex;
      const y = (1 - t) * (1 - t) * (h - 4) + 2 * (1 - t) * t * cy + t * t * ey;
      strokeLine(ctx, px, py, x, y, col, lerp(4.2, 1.0, t));
      px = x; py = y;
    }
  }
  ctx.restore();
}

// Fill transparent texels with the nearest opaque color (multi-source BFS) so mipmaps keep clean edges.
function dilateColors(data, w, h) {
  const n = w * h;
  const queue = new Int32Array(n);
  const seen = new Uint8Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] > 24) { seen[i] = 1; queue[tail++] = i; }
  }
  if (tail === 0) return;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || seen[j]) continue;
      seen[j] = 1;
      data[j * 4] = data[i * 4];
      data[j * 4 + 1] = data[i * 4 + 1];
      data[j * 4 + 2] = data[i * 4 + 2];
      queue[tail++] = j;
    }
  }
}

const SRGB_TO_LIN = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();
const linToSrgb8 = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

// Mip chain whose alpha is rescaled so the alpha-tested coverage matches level 0 (foliage stays dense far away).
function coverageMips(data, w, h, ref = 0.5) {
  const coverage = (a, scale) => {
    let c = 0;
    const thr = ref / scale;
    for (let i = 0; i < a.length; i++) if (a[i] >= thr) c++;
    return c / a.length;
  };
  let cw = w, ch = h;
  let rgb = new Float32Array(w * h * 3), alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = SRGB_TO_LIN[data[i * 4]];
    rgb[i * 3 + 1] = SRGB_TO_LIN[data[i * 4 + 1]];
    rgb[i * 3 + 2] = SRGB_TO_LIN[data[i * 4 + 2]];
    alpha[i] = data[i * 4 + 3] / 255;
  }
  const cov0 = coverage(alpha, 1);
  const levels = [{ data: new Uint8Array(data.buffer.slice(0)), width: w, height: h }];
  while (cw > 1 || ch > 1) {
    const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1);
    const nrgb = new Float32Array(nw * nh * 3), na = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(cw - 1, x * 2 + dx), sy = Math.min(ch - 1, y * 2 + dy);
            const si = sy * cw + sx;
            const wa = alpha[si] + 0.02;
            r += rgb[si * 3] * wa; g += rgb[si * 3 + 1] * wa; b += rgb[si * 3 + 2] * wa;
            wsum += wa;
            a += alpha[si];
          }
        }
        const di = y * nw + x;
        nrgb[di * 3] = r / wsum; nrgb[di * 3 + 1] = g / wsum; nrgb[di * 3 + 2] = b / wsum;
        na[di] = a / 4;
      }
    }
    let lo = 0.5, hi = 6, scale = 1;
    for (let it = 0; it < 14; it++) {
      scale = (lo + hi) / 2;
      if (coverage(na, scale) < cov0) lo = scale; else hi = scale;
    }
    const out = new Uint8Array(nw * nh * 4);
    for (let i = 0; i < nw * nh; i++) {
      out[i * 4] = linToSrgb8(nrgb[i * 3]);
      out[i * 4 + 1] = linToSrgb8(nrgb[i * 3 + 1]);
      out[i * 4 + 2] = linToSrgb8(nrgb[i * 3 + 2]);
      out[i * 4 + 3] = Math.min(255, Math.round(na[i] * scale * 255));
    }
    levels.push({ data: out, width: nw, height: nh });
    rgb = nrgb; alpha = na; cw = nw; ch = nh;
  }
  return levels;
}

function buildPlantAtlas(renderer) {
  const rng = makeRng('atlas');
  const S = ATLAS_SIZE;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, S, S);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ATLAS_CELLS.fir.forEach((r) => drawFirSpray(ctx, r, rng));
  ATLAS_CELLS.pine.forEach((r) => drawPineTuft(ctx, r, rng));
  ATLAS_CELLS.birch.forEach((r) => drawLeafCluster(ctx, r, rng, 'birch'));
  ATLAS_CELLS.maple.forEach((r) => drawLeafCluster(ctx, r, rng, 'maple'));
  ATLAS_CELLS.fern.forEach((r) => drawFern(ctx, r, rng));
  ['aster', 'goldenrod', 'yarrow', 'seed'].forEach((k, i) => drawFlowers(ctx, ATLAS_CELLS.flower[i], rng, k));
  const singles = [['birch', '#d9b13a'], ['birch', '#b9ab3c'], ['maple', '#c2402a'], ['maple', '#dd7a2c'], ['aspen', '#d8a733'], ['oak', '#8a5a2e'], ['willow', '#cfa53a'], ['oak', '#a06a34']];
  singles.forEach(([kind, color], i) => {
    const [x, y, w, h] = ATLAS_CELLS.leaf[i];
    drawLeaf(ctx, x + w * 0.5, y + h * 0.92, -Math.PI / 2, h * 0.86, kind, color, rng);
  });
  drawLeafCluster(ctx, ATLAS_CELLS.shrub[0], rng, 'shrub');
  drawTuft(ctx, ATLAS_CELLS.tuft[0], rng);

  const img = ctx.getImageData(0, 0, S, S);
  dilateColors(img.data, S, S);
  const levels = coverageMips(img.data, S, S, 0.5);
  const tex = new THREE.DataTexture(levels[0].data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

function buildClothTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const q = S / 2;
  // plaid
  ctx.fillStyle = '#e6d8be';
  ctx.fillRect(0, 0, q, q);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = 'rgba(150, 48, 38, 0.82)';
    ctx.fillRect(i * 32 + 4, 0, 14, q);
    ctx.fillRect(0, i * 32 + 4, q, 14);
    ctx.fillStyle = 'rgba(40, 46, 60, 0.5)';
    ctx.fillRect(i * 32 + 22, 0, 3, q);
    ctx.fillRect(0, i * 32 + 22, q, 3);
  }
  // stripes
  ctx.fillStyle = '#e9e4d8';
  ctx.fillRect(q, 0, q, q);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 4 === 0 ? '#36506f' : '#58739a';
    ctx.fillRect(q + i * 16, 0, i % 4 === 0 ? 6 : 3, q);
  }
  // quilt
  const quilt = ['#b8873c', '#7f8a5a', '#a85a3a', '#e3d6b8', '#53698a', '#c9a76a'];
  const rng = makeRng('cloth');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    ctx.fillStyle = rng.pick(quilt);
    ctx.fillRect(x * 32, q + y * 32, 32, 32);
    ctx.strokeStyle = 'rgba(60, 40, 30, 0.35)';
    ctx.strokeRect(x * 32 + 1, q + y * 32 + 1, 30, 30);
  }
  // linen
  ctx.fillStyle = '#ebe5d8';
  ctx.fillRect(q, q, q, q);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(200, 190, 170, 0.25)' : 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(q + rng() * q, q + rng() * q, rng.range(2, 9), 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildTextures(renderer) {
  const baker = new TextureBaker(renderer);
  const T = {};
  T.barkMap = withRepeat(baker.bake('bark', { size: 512, srgb: true }), TEX_SIZE.bark);
  T.barkNormal = withRepeat(baker.bake('bark', { size: 512, normal: true, strength: 5 }), TEX_SIZE.bark);
  T.birchMap = withRepeat(baker.bake('birch', { size: 512, srgb: true }), TEX_SIZE.birch);
  T.birchNormal = withRepeat(baker.bake('birch', { size: 512, normal: true, strength: 3 }), TEX_SIZE.birch);
  T.woodMap = withRepeat(baker.bake('wood', { size: 1024, srgb: true }), TEX_SIZE.wood);
  T.woodNormal = withRepeat(baker.bake('wood', { size: 1024, normal: true, strength: 3 }), TEX_SIZE.wood);
  T.endMap = baker.bake('endgrain', { size: 512, srgb: true, wrap: THREE.ClampToEdgeWrapping });
  T.endNormal = baker.bake('endgrain', { size: 512, normal: true, strength: 4, wrap: THREE.ClampToEdgeWrapping });
  T.stoneMap = withRepeat(baker.bake('stone', { size: 512, srgb: true }), TEX_SIZE.stone);
  T.stoneNormal = withRepeat(baker.bake('stone', { size: 512, normal: true, strength: 4 }), TEX_SIZE.stone);
  T.ground = baker.bake('ground', { size: 1024 });
  T.noise = baker.bake('noise', { size: 256 });
  T.smoke = baker.bake('smoke', { size: 128, wrap: THREE.ClampToEdgeWrapping });
  T.atlas = buildPlantAtlas(renderer);
  T.cloth = buildClothTexture();
  T.baker = baker;
  return T;
}
