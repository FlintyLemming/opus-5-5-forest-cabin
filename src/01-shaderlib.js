/* Shader library: shared uniforms, GLSL snippets (noise, wind, atmosphere, sky) and the material patcher
   that injects them into three.js built-in materials through onBeforeCompile. */

// Uniform objects are shared by reference across every patched material, so one update per frame reaches all.
const U = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector4(0.82, 0.57, 1.0, 0.4) }, // xy direction, z strength, w gust (0..1)
  uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },         // toward the sun (sky disk and horizon glow)
  uScatterDir: { value: new THREE.Vector3(0, 0.2, -1) },     // toward the key light (sun or moon) for in-scattering
  uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },           // key light radiance used by scattering effects
  uFogA: { value: new THREE.Color(0.4, 0.45, 0.5) },          // haze looking away from the key light
  uFogB: { value: new THREE.Color(1, 0.7, 0.45) },            // haze looking toward the key light
  uFogP: { value: new THREE.Vector4(0.004, 0.05, 0, 1) },     // density, height falloff, base height, max opacity
  uMistP: { value: new THREE.Vector4(0, 0.6, 0, 0) },         // ground mist density, falloff, base height
  uHaze: { value: new THREE.Vector4(0.0008, 0, 0, 0) },       // distance haze density (aerial perspective at any height)
  uSkyZenith: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
  uSkyGlow: { value: new THREE.Color() },
  uSkyGround: { value: new THREE.Color() },
  uSkyP: { value: new THREE.Vector4(1, 1, 0, 0) },            // sun disk, horizon glow, stars, moon
  uMoonDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
  uMoonCol: { value: new THREE.Color(0.8, 0.85, 1) },
  uCloudP: { value: new THREE.Vector4(0.45, 0.25, 0.85, 1) }, // coverage, softness, opacity, brightness
  uCloudLit: { value: new THREE.Color(1, 0.8, 0.6) },
  uCloudShade: { value: new THREE.Color(0.4, 0.4, 0.5) },
  uTrans: { value: 1 },                                       // foliage back-light transmission
  uMossCol: { value: lin('#4f5a2a') },
  uWindowGlow: { value: 1 },
  uExposureHint: { value: 1 },
  uFoliageLit: { value: new THREE.Color(0.5, 0.4, 0.3) },     // irradiance / PI on sunlit foliage (fake reflections)
  uReflPass: { value: new THREE.Vector4(0, 0, 0, 0) },        // x: 1 while rendering the creek mirror, y: water plane height
};

const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s / 0.9375;
}
`;

const GLSL_ATMOS = /* glsl */ `
uniform vec3 uFogA;
uniform vec3 uFogB;
uniform vec4 uFogP;
uniform vec4 uMistP;
uniform vec4 uHaze;
uniform vec3 uScatterDir;
uniform vec4 uReflPass;
float fogDepth(float density, float falloff, float base, vec3 ro, vec3 rd, float dist) {
  if (density <= 0.0) return 0.0;
  float a = density * exp(-falloff * (ro.y - base));
  float k = clamp(falloff * rd.y * dist, -20.0, 60.0);
  float f = abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0 - 0.5 * k;
  return a * dist * f;
}
vec3 atmosColor(vec3 rd) {
  float s = max(dot(rd, uScatterDir), 0.0);
  return mix(uFogA, uFogB, s * s * s * 0.55 + pow(s, 14.0) * 0.45);
}
float atmosAmount(vec3 wp) {
  vec3 ro = cameraPosition;
  vec3 rv = wp - ro;
  float dist = length(rv);
  vec3 rd = rv / max(dist, 1e-4);
  // mirror pass: the camera sits below the water, but the light only travels from the surface onward
  if (uReflPass.x > 0.5 && rd.y > 1e-4) {
    float t0 = clamp((uReflPass.y - ro.y) / rd.y, 0.0, dist);
    ro += rd * t0;
    dist -= t0;
  }
  float od = fogDepth(uFogP.x, uFogP.y, uFogP.z, ro, rd, dist) + fogDepth(uMistP.x, uMistP.y, uMistP.z, ro, rd, dist) + uHaze.x * dist;
  return (1.0 - exp(-od)) * uFogP.w;
}
vec3 applyAtmos(vec3 col, vec3 wp) {
  vec3 rd = normalize(wp - cameraPosition);
  return mix(col, atmosColor(rd), atmosAmount(wp));
}
`;

const GLSL_WIND = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
float windField(vec2 xz) {
  vec2 d = uWind.xy;
  float wave = vnoise(xz * 0.045 - d * uTime * 0.32) * 0.65 + vnoise(xz * 0.13 - d * uTime * 0.85) * 0.35;
  return (0.3 + 0.7 * wave) * (0.45 + 0.8 * uWind.w) * uWind.z;
}
vec3 treeWind(vec3 wp, vec3 origin, vec3 aw) {
  float f = windField(origin.xz);
  float sway = sin(uTime * 0.62 + dot(origin.xz, vec2(0.13, 0.17))) * 0.25 + f;
  vec3 d = vec3(uWind.x, 0.0, uWind.y) * sway * aw.x * 0.42;
  float fl = sin(uTime * 3.1 + aw.z * 6.2831 + wp.x * 0.8 + wp.y * 0.6) * cos(uTime * 2.3 + aw.z * 4.0 + wp.z * 0.7);
  d += vec3(0.5, 0.75, 0.45) * fl * max(aw.y, 0.0) * (0.025 + 0.06 * f);
  return d;
}
vec3 plantWind(vec3 wp, vec3 origin, vec3 aw) {
  float f = windField(origin.xz);
  float fl = sin(uTime * 2.4 + aw.z * 6.2831 + wp.x * 1.3) * 0.5 + sin(uTime * 3.7 + aw.z * 3.0 + wp.z * 1.1) * 0.25;
  vec3 d = vec3(uWind.x, 0.0, uWind.y) * (f * 0.6 + fl * (0.2 + 0.3 * f)) * aw.x * 0.22;
  d.y -= dot(d, d) * 1.5;
  return d;
}
vec3 grassWind(vec3 root, float h01, float height, float phase) {
  float f = windField(root.xz);
  float flutter = sin(uTime * 2.3 + phase * 6.2831 + root.x * 0.9 + root.z * 0.7) * 0.16;
  float bend = (f * 0.55 + flutter * (0.35 + f)) * h01 * h01 * height;
  vec3 d = vec3(uWind.x, 0.0, uWind.y) * bend;
  d.y -= bend * bend / max(height, 0.05) * 0.6;
  return d;
}
vec3 clothWind(vec3 wp, vec3 aw) {
  float f = windField(wp.xz);
  float w = sin(uTime * 2.1 + wp.x * 1.6 + wp.z * 1.2 + aw.z * 6.28) * 0.6 + sin(uTime * 3.9 + wp.x * 3.3 + aw.z * 2.0) * 0.3;
  vec3 d = vec3(uWind.x, 0.0, uWind.y) * (0.12 + f * 0.45 + w * 0.1) * aw.x * aw.x;
  d.y += (abs(w) * 0.04 + f * 0.05) * aw.x * aw.x;
  return d;
}
`;

const GLSL_SKY = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGlow;
uniform vec3 uSkyGround;
uniform vec4 uSkyP;
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform vec4 uCloudP;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;

vec3 skyGradient(vec3 rd) {
  float h = rd.y;
  float hz = 1.0 - clamp(h, 0.0, 1.0);
  vec3 col = mix(uSkyZenith, uSkyHorizon, pow(hz, 3.5));
  float sd = max(dot(rd, uSunDir), 0.0);
  float band = exp(-max(h + 0.02, 0.0) * 7.0);
  col += uSkyGlow * uSkyP.y * (pow(sd, 3.0) * band + pow(sd, 24.0) * 0.55 + pow(sd, 400.0) * 1.5);
  // the horizon melts into the same haze the terrain fog uses
  float hb = exp(-abs(h) * 14.0);
  col = mix(col, atmosColor(rd), hb * 0.65);
  col = mix(col, uSkyGround, smoothstep(-0.005, -0.09, h));
  return col;
}
float cloudField(vec2 p) {
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(13.7, 7.3); a *= 0.5; }
  return s;
}
vec4 skyClouds(vec3 rd) {
  if (rd.y <= 0.004) return vec4(0.0);
  vec2 uv = rd.xz / (rd.y + 0.09) * 0.75 + vec2(uTime * 0.0035, uTime * 0.0012);
  float warp = vnoise(uv * 0.35 + 3.1);
  uv += vec2(warp, -warp) * 0.6;
  float d = cloudField(uv * vec2(1.0, 1.9));
  float cover = uCloudP.x;
  float a = smoothstep(1.0 - cover, 1.0 - cover + uCloudP.y, d);
  float d2 = cloudField((uv + uSunDir.xz * 0.16) * vec2(1.0, 1.9));
  float lit = clamp(0.55 - (d2 - d) * 5.0, 0.0, 1.0);
  float sd = max(dot(rd, uSunDir), 0.0);
  vec3 col = mix(uCloudShade, uCloudLit, lit);
  col += uSunCol * (pow(sd, 10.0) * 0.9 + pow(sd, 60.0) * 1.5) * (1.0 - a * 0.7) * uSkyP.y * 0.4;
  a *= uCloudP.z * smoothstep(0.004, 0.16, rd.y);
  return vec4(col * uCloudP.w, a);
}
vec3 skyStars(vec3 rd) {
  vec3 p = rd * 210.0;
  vec3 c = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash13(c);
  if (h < 0.986) return vec3(0.0);
  vec3 o = vec3(hash13(c + 1.3), hash13(c + 2.7), hash13(c + 5.1)) - 0.5;
  float d = length(f - o * 0.6);
  float b = smoothstep(0.16, 0.0, d) * (0.35 + 0.65 * fract(h * 37.0));
  b *= 0.7 + 0.3 * sin(uTime * (1.0 + fract(h * 91.0) * 3.0) + h * 40.0);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.75), fract(h * 13.0));
  return tint * b * smoothstep(0.02, 0.3, rd.y);
}
vec3 skyMoon(vec3 rd) {
  float md = dot(rd, uMoonDir);
  float r = 0.0115;
  float disk = smoothstep(cos(r), cos(r * 0.9), md);
  vec3 t = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 b = cross(t, uMoonDir);
  vec2 q = vec2(dot(rd, t), dot(rd, b)) / r;
  float mare = vnoise(q * 2.2 + 3.0) * 0.6 + vnoise(q * 5.5 + 1.0) * 0.4;
  float shade = 0.72 + 0.38 * smoothstep(0.35, 0.75, mare);
  float halo = pow(max(md, 0.0), 1800.0) * 0.5 + pow(max(md, 0.0), 90.0) * 0.06 + pow(max(md, 0.0), 12.0) * 0.015;
  return (uMoonCol * shade * disk * 7.0 + uMoonCol * halo) * uSkyP.w;
}
vec3 skyColor(vec3 rd, float withDisk) {
  vec3 col = skyGradient(rd);
  col += skyStars(rd) * uSkyP.z * 1.6;
  col += skyMoon(rd);
  float sd = dot(rd, uSunDir);
  col += uSunCol * smoothstep(0.99986, 0.99991, sd) * uSkyP.x * 30.0 * withDisk;
  vec4 cl = skyClouds(rd);
  col = mix(col, cl.rgb, cl.a);
  return col;
}
`;

// Foliage lighting: wrapped diffuse plus light transmitted through thin leaves and blades when backlit.
// Replaces Lambert's RE_Direct, so shadows and every light type keep working.
const GLSL_FOLIAGE_BRDF = /* glsl */ `
uniform float uTrans;
#undef RE_Direct
void RE_Direct_Foliage( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  float diff = saturate( ( ndl + FOLIAGE_WRAP ) / ( 1.0 + FOLIAGE_WRAP ) );
  float back = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 3.0 );
  float trans = uTrans * FOLIAGE_TRANS * ( back * 0.85 + 0.15 * saturate( -ndl ) );
  vec3 transCol = material.diffuseColor * ( 1.0 + 1.4 * material.diffuseColor / max( max3( material.diffuseColor ), 1e-3 ) );
  reflectedLight.directDiffuse += directLight.color * ( diff * BRDF_Lambert( material.diffuseColor ) + trans * RECIPROCAL_PI * transCol );
}
#define RE_Direct RE_Direct_Foliage
`;

/*
  patchMaterial(material, options)
    wind:        'none' | 'tree' | 'plant' | 'cloth'   (tree/plant/cloth read attribute aWind)
    foliage:     wrapped diffuse + transmission (Lambert materials only)
    undoFlip:    keep authored normals on back faces (cards and blades)
    worldNormal: provide vWorldNormal to fragment snippets
    moss:        moss amount on up-facing surfaces (0 = none)
    vsPars/fsPars, vsNormal (replaces beginnormal), vsBegin (replaces begin_vertex), vsWorld (edits pmWorld),
    fsColor (after color_fragment), fsNormal (after normal_fragment_maps), fsRough (after roughnessmap_fragment),
    fsEmissive (after emissivemap_fragment), fsOut (before fog), uniforms (extra uniform objects)
    noAtmos:     skip the automatic height fog (the snippet applies its own, e.g. premultiplied water)
*/
function patchMaterial(mat, opts = {}) {
  const o = {
    wind: 'none', foliage: false, undoFlip: false, worldNormal: false, moss: 0, depth: false, noAtmos: false,
    vsPars: '', vsNormal: '', vsBegin: '', vsWorld: '',
    fsPars: '', fsColor: '', fsNormal: '', fsRough: '', fsEmissive: '', fsOut: '', fsAfter: null,
    foliageWrap: 0.5, foliageTrans: 1.2,
    ...opts,
  };
  const extraUniforms = o.uniforms || {};
  const keyObj = { ...o };
  delete keyObj.uniforms;
  keyObj.u = Object.keys(extraUniforms);
  const key = 'pm:' + JSON.stringify(keyObj);
  const needsWorldNormal = !o.depth && (o.worldNormal || o.moss > 0);

  mat.onBeforeCompile = (sh) => {
    for (const k of ['uTime', 'uWind', 'uScatterDir', 'uFogA', 'uFogB', 'uFogP', 'uMistP', 'uHaze', 'uReflPass', 'uTrans', 'uMossCol', 'uWindowGlow', 'uSunCol']) sh.uniforms[k] = U[k];
    Object.assign(sh.uniforms, extraUniforms);

    const windAttr = o.wind === 'tree' || o.wind === 'plant' || o.wind === 'cloth';
    let vs = sh.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>
${GLSL_NOISE}
${GLSL_WIND}
varying vec3 vWorldPos;
${needsWorldNormal ? 'varying vec3 vWorldNormal;' : ''}
${windAttr ? 'attribute vec3 aWind;' : ''}
${o.vsPars}`);
    if (o.vsNormal) vs = vs.replace('#include <beginnormal_vertex>', o.vsNormal);
    if (o.vsBegin) vs = vs.replace('#include <begin_vertex>', o.vsBegin);

    const windCode = {
      tree: 'pmWorld.xyz += treeWind( pmWorld.xyz, pmOrigin, aWind );',
      plant: 'pmWorld.xyz += plantWind( pmWorld.xyz, pmOrigin, aWind );',
      cloth: 'pmWorld.xyz += clothWind( pmWorld.xyz, aWind );',
    }[o.wind] || '';

    vs = vs.replace('#include <project_vertex>', `
vec4 pmWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  pmWorld = instanceMatrix * pmWorld;
  vec3 pmOrigin = ( modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 ) ).xyz;
#else
  vec3 pmOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#endif
pmWorld = modelMatrix * pmWorld;
${windCode}
${o.vsWorld}
vWorldPos = pmWorld.xyz;
${needsWorldNormal ? `
#ifdef USE_INSTANCING
  vWorldNormal = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );
#else
  vWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
#endif` : ''}
vec4 mvPosition = viewMatrix * pmWorld;
gl_Position = projectionMatrix * mvPosition;
`);
    vs = vs.replace('#include <worldpos_vertex>', 'vec4 worldPosition = pmWorld;');
    sh.vertexShader = vs;

    if (o.depth) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\n${o.fsPars}`);
      if (o.fsColor) sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `${o.fsColor}\n#include <alphatest_fragment>`);
      return;
    }

    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>
${GLSL_NOISE}
${GLSL_ATMOS}
uniform float uTime;
uniform vec3 uMossCol;
uniform float uWindowGlow;
uniform vec3 uSunCol;
varying vec3 vWorldPos;
${needsWorldNormal ? 'varying vec3 vWorldNormal;' : ''}
${o.fsPars}`);
    if (o.foliage) {
      fs = fs.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\n${GLSL_FOLIAGE_BRDF}`);
      // light keeps scattering through a canopy: received shadows on foliage are softened
      const lfb = THREE.ShaderChunk.lights_fragment_begin
        .replace('? getShadow( directionalShadowMap[ i ]', '? mix( 1.0 - FOLIAGE_SHADOW, 1.0, getShadow( directionalShadowMap[ i ]')
        .replace('vDirectionalShadowCoord[ i ] ) : 1.0;', 'vDirectionalShadowCoord[ i ] ) ) : 1.0;');
      fs = fs.replace('#include <lights_fragment_begin>', lfb);
    }
    if (o.undoFlip) {
      fs = fs.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
  normal *= faceDirection;
  nonPerturbedNormal = normal;
#endif`);
    }
    let colorCode = o.fsColor;
    if (o.moss > 0) {
      colorCode += `
{
  vec3 wn = normalize( vWorldNormal );
  float up = smoothstep( 0.15, 0.85, wn.y );
  float mn = vnoise( vWorldPos.xz * 1.9 + vWorldPos.y * 1.3 ) * 0.65 + vnoise( vWorldPos.xz * 7.0 - vWorldPos.y * 3.0 ) * 0.35;
  float mossAmt = smoothstep( 0.42, 0.78, up * ( 0.35 + mn ) ) * ${o.moss.toFixed(3)};
  diffuseColor.rgb = mix( diffuseColor.rgb, uMossCol * ( 0.65 + 0.7 * mn ), mossAmt );
}`;
    }
    if (colorCode) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${colorCode}`);
    if (o.fsNormal) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${o.fsNormal}`);
    if (o.fsRough) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${o.fsRough}`);
    if (o.fsEmissive) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${o.fsEmissive}`);
    for (const [chunk, code] of Object.entries(o.fsAfter || {})) fs = fs.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`);
    fs = fs.replace('#include <fog_fragment>', `${o.fsOut}\n${o.noAtmos ? '' : 'gl_FragColor.rgb = applyAtmos( gl_FragColor.rgb, vWorldPos );'}`);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  if (o.foliage) {
    mat.defines = { ...(mat.defines || {}), FOLIAGE_WRAP: o.foliageWrap.toFixed(3), FOLIAGE_TRANS: o.foliageTrans.toFixed(3), FOLIAGE_SHADOW: (o.foliageShadow ?? 0.7).toFixed(3) };
  }
  return mat;
}

// Shadow caster variant that bends with the same wind and cuts the same alpha.
function makeDepthMaterial(opts = {}, { map = null, alphaTest = 0 } = {}) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  const solid = /vSolid/.test(opts.vsWorld || '');
  patchMaterial(m, {
    wind: opts.wind || 'none', vsPars: opts.vsPars || '', vsNormal: opts.vsDepthNormal || '', vsBegin: opts.vsBegin || '', vsWorld: opts.vsWorld || '',
    uniforms: opts.uniforms, depth: true,
    fsPars: solid ? 'varying float vSolid;' : '',
    fsColor: solid ? 'if (vSolid > 0.5) diffuseColor.a = 1.0;' : '',
  });
  return m;
}

// Lambert foliage material for alpha-cut cards (leaves, needles, fronds, flowers).
// Vertices with aWind.y < -0.5 are drawn solid in their vertex color (dense crown cores without holes).
function foliageMaterial({ map, wind = 'tree', alphaTest = 0.5, a2c = true, trans = 1.2, wrap = 0.55, side = THREE.DoubleSide, solid = false, extra = {} } = {}) {
  const mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, side, alphaTest, alphaToCoverage: a2c });
  const solidOpts = solid ? {
    vsPars: 'varying float vSolid;',
    vsWorld: 'vSolid = step(aWind.y, -0.5);',
    fsPars: 'varying float vSolid;',
    fsColor: 'if (vSolid > 0.5) { diffuseColor.rgb = vColor.rgb; diffuseColor.a = 1.0; }',
  } : {};
  const opts = { wind, foliage: true, undoFlip: true, foliageTrans: trans, foliageWrap: wrap, ...solidOpts, ...extra };
  patchMaterial(mat, opts);
  mat.userData.depthMaterial = makeDepthMaterial(opts, { map, alphaTest: 0.5 });
  mat.userData.patch = opts;
  return mat;
}

// Fullscreen triangle shared by bakes and post passes.
const FULLSCREEN_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

function fullscreenTriangle() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return geo;
}
