/* Sky, distant ridges, the far forest canopy, time-of-day presets and environment lighting. */

// Slider stops: 0 dawn mist, 0.5 day, 1 dusk (default), 1.5 blue hour, 2 moonlit night.
// Colors are sRGB hex (converted to linear on use); angles in degrees (azimuth 0 = +Z, 90 = +X).
const PRESETS = [
  {
    t: 0, haze: 0.0006,
    sunAz: 196, sunEl: 7, keyAz: 196, keyEl: 7, keyColor: '#ffc495', keyIntensity: 3.3,
    moonAz: 215, moonEl: 30, moon: 0,
    hemiSky: '#a6b7d4', hemiGround: '#5a5244', hemiIntensity: 1.35,
    fillColor: '#b49a80', fillIntensity: 0.22,
    zenith: '#6f8fbb', horizon: '#f0c2a2', glow: '#ffae78', ground: '#3b3d38',
    sunDisk: 0.85, skyGlow: 0.95, stars: 0,
    cloudCover: 0.34, cloudSoft: 0.32, cloudOpacity: 0.7, cloudBright: 1.0, cloudLit: '#ffd2b4', cloudShade: '#8f8ea8',
    fogA: '#97a5bb', fogB: '#f9c69e', fogDensity: 0.0017, fogFalloff: 0.035, mist: 0.0055, mistFalloff: 0.8,
    exposure: 1.06, temp: -0.02, tint: 0.0,
    contrast: 1.02, sat: 1.0, split: 0.13, shadowTint: '#4a6a88', highTint: '#ffc896', lift: 0.02,
    bloom: 0.06, rays: 0.85, shafts: 0.9, dust: 0.6, fireflies: 0, leaves: 0.6,
    windows: 0.65, lantern: 0.3, fire: 0.18, smoke: 1.0, trans: 0.95, wind: 0.55,
    birds: 1.0, crickets: 0.0, owl: 0.0,
  },
  {
    t: 0.5, haze: 0.0006,
    sunAz: 190, sunEl: 40, keyAz: 190, keyEl: 40, keyColor: '#fff1de', keyIntensity: 3.4,
    moonAz: 215, moonEl: 30, moon: 0,
    hemiSky: '#b4c6e2', hemiGround: '#6c6046', hemiIntensity: 1.3,
    fillColor: '#a59878', fillIntensity: 0.25,
    zenith: '#5a84c1', horizon: '#c9d9e9', glow: '#fff0da', ground: '#3f4134',
    sunDisk: 1.0, skyGlow: 0.35, stars: 0,
    cloudCover: 0.42, cloudSoft: 0.25, cloudOpacity: 0.85, cloudBright: 1.0, cloudLit: '#ffffff', cloudShade: '#a3abbc',
    fogA: '#b0bccb', fogB: '#e8e3d8', fogDensity: 0.0018, fogFalloff: 0.035, mist: 0.0, mistFalloff: 0.6,
    exposure: 0.92, temp: 0.0, tint: 0.0,
    contrast: 1.0, sat: 1.0, split: 0.05, shadowTint: '#506a80', highTint: '#fff0dc', lift: 0.015,
    bloom: 0.045, rays: 0.25, shafts: 0.15, dust: 0.3, fireflies: 0, leaves: 0.8,
    windows: 0.0, lantern: 0.0, fire: 0.3, smoke: 0.7, trans: 0.9, wind: 1.0,
    birds: 0.8, crickets: 0.1, owl: 0.0,
  },
  {
    t: 1, haze: 0.0011,
    sunAz: 254, sunEl: 8, keyAz: 254, keyEl: 8, keyColor: '#ffa45c', keyIntensity: 4.2,
    moonAz: 215, moonEl: 30, moon: 0,
    hemiSky: '#8d9fc8', hemiGround: '#6a5038', hemiIntensity: 1.0,
    fillColor: '#c48552', fillIntensity: 0.28,
    zenith: '#46689c', horizon: '#efae7e', glow: '#ff8f45', ground: '#2f2d26',
    sunDisk: 1.0, skyGlow: 1.0, stars: 0,
    cloudCover: 0.45, cloudSoft: 0.28, cloudOpacity: 0.85, cloudBright: 1.0, cloudLit: '#ffb578', cloudShade: '#86708e',
    fogA: '#8a8da6', fogB: '#ffad6c', fogDensity: 0.0024, fogFalloff: 0.04, mist: 0.006, mistFalloff: 0.6,
    exposure: 1.0, temp: 0.04, tint: 0.0,
    contrast: 1.04, sat: 1.0, split: 0.14, shadowTint: '#3f6b80', highTint: '#ffc285', lift: 0.02,
    bloom: 0.055, rays: 0.7, shafts: 0.75, dust: 1.0, fireflies: 0.15, leaves: 1.0,
    windows: 0.9, lantern: 0.7, fire: 0.85, smoke: 1.0, trans: 1.0, wind: 0.85,
    birds: 0.5, crickets: 0.4, owl: 0.0,
  },
  {
    t: 1.5, haze: 0.0007,
    sunAz: 262, sunEl: -5, keyAz: 262, keyEl: -3, keyColor: '#ff9a6a', keyIntensity: 0.1,
    moonAz: 215, moonEl: 30, moon: 0.35,
    hemiSky: '#5b6b9a', hemiGround: '#2b2520', hemiIntensity: 0.85,
    fillColor: '#6a5a6a', fillIntensity: 0.1,
    zenith: '#1f2f50', horizon: '#be8468', glow: '#e07650', ground: '#1f1f1f',
    sunDisk: 0.0, skyGlow: 0.75, stars: 0.25,
    cloudCover: 0.42, cloudSoft: 0.3, cloudOpacity: 0.75, cloudBright: 1.0, cloudLit: '#cd7d5e', cloudShade: '#383853',
    fogA: '#39445f', fogB: '#9e6a58', fogDensity: 0.002, fogFalloff: 0.04, mist: 0.006, mistFalloff: 0.6,
    exposure: 1.65, temp: -0.02, tint: 0.0,
    contrast: 1.02, sat: 0.95, split: 0.12, shadowTint: '#3d5c86', highTint: '#ffb27a', lift: 0.02,
    bloom: 0.06, rays: 0.2, shafts: 0.1, dust: 0.2, fireflies: 0.7, leaves: 0.6,
    windows: 1.5, lantern: 1.3, fire: 1.05, smoke: 0.9, trans: 0.7, wind: 0.6,
    birds: 0.1, crickets: 0.9, owl: 0.3,
  },
  {
    t: 2, haze: 0.0006,
    sunAz: 290, sunEl: -25, keyAz: 215, keyEl: 30, keyColor: '#9cb2ff', keyIntensity: 0.8,
    moonAz: 215, moonEl: 30, moon: 1.0,
    hemiSky: '#3b4b7a', hemiGround: '#1b1915', hemiIntensity: 0.82,
    fillColor: '#3a4060', fillIntensity: 0.12,
    zenith: '#060a17', horizon: '#18233a', glow: '#000000', ground: '#0e0f12',
    sunDisk: 0.0, skyGlow: 0.0, stars: 1.0,
    cloudCover: 0.32, cloudSoft: 0.32, cloudOpacity: 0.55, cloudBright: 1.0, cloudLit: '#8693b6', cloudShade: '#151a28',
    fogA: '#131b2b', fogB: '#3a4a6c', fogDensity: 0.0021, fogFalloff: 0.04, mist: 0.004, mistFalloff: 0.6,
    exposure: 1.85, temp: -0.06, tint: 0.0,
    contrast: 1.0, sat: 0.9, split: 0.12, shadowTint: '#2c4c86', highTint: '#ffb070', lift: 0.022,
    bloom: 0.07, rays: 0.15, shafts: 0.12, dust: 0.0, fireflies: 1.0, leaves: 0.4,
    windows: 2.1, lantern: 2.0, fire: 1.3, smoke: 0.8, trans: 0.5, wind: 0.5,
    birds: 0.0, crickets: 1.0, owl: 1.0,
  },
];

const PRESET_COLORS = ['keyColor', 'hemiSky', 'hemiGround', 'fillColor', 'zenith', 'horizon', 'glow', 'ground', 'cloudLit', 'cloudShade', 'fogA', 'fogB', 'shadowTint', 'highTint'];
for (const p of PRESETS) for (const k of PRESET_COLORS) p[k] = lin(p[k]);

function samplePresets(t, out = {}) {
  t = clamp(t, 0, 2);
  let i = 0;
  while (i < PRESETS.length - 2 && t > PRESETS[i + 1].t) i++;
  const a = PRESETS[i], b = PRESETS[i + 1];
  const f = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
  for (const k of Object.keys(a)) {
    const va = a[k], vb = b[k];
    if (va instanceof THREE.Color) {
      if (!(out[k] instanceof THREE.Color)) out[k] = new THREE.Color();
      out[k].copy(va).lerp(vb, f);
    } else if (typeof va === 'number') {
      out[k] = lerp(va, vb, f);
    }
  }
  out.t = t;
  return out;
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

function skyMaterial(withDisk) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: SKY_VS,
    fragmentShader: `
uniform float uTime;
${GLSL_NOISE}
${GLSL_ATMOS}
${GLSL_SKY}
varying vec3 vDir;
void main() {
  vec3 rd = normalize(vDir);
  gl_FragColor = vec4(skyColor(rd, ${withDisk ? '1.0' : '0.0'}), 1.0);
}`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

const Sky = {
  dome: null,
  envScene: null,
  pmrem: null,
  envRT: null,
  envMaterials: new Set(),
  envDirty: true,
  envTimer: 0,

  build(renderer) {
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial(true));
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.dome.name = 'sky';
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(false));
    this.envScene.add(envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    return this.dome;
  },

  registerEnv(mat) {
    this.envMaterials.add(mat);
    if (this.envRT) mat.envMap = this.envRT.texture;
  },

  updateEnv(renderer, force = false) {
    if (!this.envDirty && !force) return;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    for (const m of this.envMaterials) m.envMap = rt.texture;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.envDirty = false;
  },

  // Three layers of hazy forested ridges beyond the valley; kept low along the evening sunline.
  buildRidges() {
    const group = new THREE.Group();
    group.name = 'ridges';
    const c = WORLD.clearing;
    const layers = [
      { r: 380, depth: 60, base: 12, amp: 22, freq: 2.2, color: '#121b16', seed: 3 },
      { r: 520, depth: 80, base: 20, amp: 38, freq: 1.8, color: '#16211d', seed: 7 },
      { r: 700, depth: 110, base: 30, amp: 66, freq: 1.4, color: '#1a2524', seed: 11 },
    ];
    const rows = [[0, -0.6], [0.12, 0.35], [0.3, 0.7], [0.55, 0.9], [0.8, 0.98], [1, 1]];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    patchMaterial(mat, {
      fsColor: /* glsl */ `
{
  float n = vnoise(vWorldPos.xz * 0.08) * 0.5 + vnoise(vWorldPos.xz * 0.3 + vWorldPos.y * 0.2) * 0.5;
  diffuseColor.rgb *= 0.75 + 0.5 * n;
}`,
      // aerial perspective beyond what the height fog gives, so the layers step back in value
      fsOut: 'gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosColor(normalize(vWorldPos - cameraPosition)), 1.0 - exp(-length(vWorldPos - cameraPosition) * 0.0011));',
    });
    for (const L of layers) {
      const seg = 720, pos = [], col = [], idx = [];
      const base = lin(L.color);
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * TAU;
        const dx = Math.sin(a), dz = Math.cos(a);
        const azDeg = ((a / DEG) % 360 + 360) % 360;
        const n = Noise.fbm2(dx * L.freq + L.seed, dz * L.freq - L.seed, 5, 2.1, 0.5);
        let h = L.base + L.amp * Math.pow(clamp(0.5 + 0.75 * n, 0, 1), 1.35);
        h *= 0.7 + 0.55 * smoothstep(0.3, -0.9, dz);
        const sunDelta = Math.abs(((azDeg - WORLD.sunAzDusk) % 360 + 540) % 360 - 180);
        const cap = L.r * Math.tan(2.2 * DEG) + 2;
        h = lerp(h, Math.min(h, cap), 1 - smoothstep(6, 40, sunDelta));
        for (const [f, k] of rows) {
          const rr = L.r + L.depth * f;
          pos.push(c.cx + dx * rr, World.H0 + h * k - (k < 0 ? 40 : 0), c.cz + dz * rr);
          const shade = 0.9 + 0.2 * Noise.n2(a * 40 + L.seed, f * 3);
          col.push(base.r * shade, base.g * shade, base.b * shade);
        }
      }
      const R = rows.length;
      for (let s = 0; s < seg; s++) {
        for (let k = 0; k < R - 1; k++) {
          const a = s * R + k, b = a + 1, cc = a + R, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    return group;
  },

  // A crown-height surface standing in for the forest beyond the instanced trees.
  buildCanopy(T, innerR = 116) {
    const c = WORLD.clearing;
    const seg = 560, pos = [], col = [], idx = [];
    const rings = [];
    for (let r = innerR; r < 420; r *= 1.035) rings.push(r);
    const spruce = lin('#18261a'), birch = lin('#6d5a22'), pine = lin('#22301d');
    for (const [ri, r] of rings.entries()) {
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * TAU;
        const x = c.cx + Math.sin(a) * r, z = c.cz + Math.cos(a) * r;
        const g = World.heightFn(x, z);
        let top = 15 + 5 * Noise.n2(x * 0.03, z * 0.03) + 2.5 * Noise.n2(x * 0.15, z * 0.15) + 3.2 * (Math.abs(Noise.n2(x * 0.11 + 9, z * 0.11)) - 0.3) + 1.6 * Math.abs(Noise.n2(x * 0.31, z * 0.31 - 4));
        top *= smoothstep(innerR - 2, innerR + 14, r) * 0.35 + 0.65;
        const azDeg = Math.atan2(x, z) / DEG;
        const da = Math.abs(((azDeg - WORLD.sunAzDusk + 540) % 360) - 180);
        const cw = 1 - smoothstep(7, 26, da);
        if (cw > 0) {
          const rag = 2.4 * (Math.abs(Noise.n2(x * 0.09 + 3, z * 0.09)) - 0.35) + 1.2 * Noise.n2(x * 0.25, z * 0.25);
          const cap = World.H0 + 1.2 + Math.hypot(x, z) * Math.tan(5.8 * DEG) - g + rag;
          top = lerp(top, Math.min(top, Math.max(3, cap)), cw);
          // no instanced trees stand in front of the corridor: the edge grows out of the ground
          if (ri === 0) top = lerp(top, -0.8, smoothstep(0, 0.35, cw));
        }
        pos.push(x, g + top, z);
        const b = Noise.n2(x * 0.02 + 40, z * 0.02);
        const cc = spruce.clone().lerp(pine, smoothstep(-0.2, 0.4, Noise.n2(x * 0.05, z * 0.05)));
        cc.lerp(birch, smoothstep(0.45, 0.75, b) * 0.7);
        col.push(cc.r, cc.g, cc.b);
      }
    }
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let s = 0; s < seg; s++) {
        const a = ri * (seg + 1) + s, b = a + 1, cc = a + seg + 1, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    patchMaterial(mat, {
      foliage: true, foliageWrap: 0.6, foliageTrans: 0.6,
      uniforms: { uNoiseTex: { value: T.noise } },
      fsPars: 'uniform sampler2D uNoiseTex;',
      fsColor: /* glsl */ `
{
  float crowns = texture2D(uNoiseTex, vWorldPos.xz * 0.045).a;
  float fine = texture2D(uNoiseTex, vWorldPos.xz * 0.21).g;
  diffuseColor.rgb *= 0.45 + 0.75 * smoothstep(0.05, 0.6, crowns) * (0.75 + 0.5 * fine);
}`,
      fsOut: 'gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosColor(normalize(vWorldPos - cameraPosition)), 1.0 - exp(-length(vWorldPos - cameraPosition) * 0.0012));',
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'far-canopy';
    mesh.receiveShadow = false;
    return mesh;
  },
};

// Applies one interpolated preset to the shared uniforms and the lights.
function applyTimeParams(p, lights) {
  dirFromAngles(p.sunAz, p.sunEl, U.uSunDir.value);
  dirFromAngles(p.keyAz, p.keyEl, U.uScatterDir.value);
  dirFromAngles(p.moonAz, p.moonEl, U.uMoonDir.value);
  U.uSunCol.value.copy(p.keyColor);
  U.uSkyZenith.value.copy(p.zenith);
  U.uSkyHorizon.value.copy(p.horizon);
  U.uSkyGlow.value.copy(p.glow);
  U.uSkyGround.value.copy(p.ground);
  U.uSkyP.value.set(p.sunDisk, p.skyGlow, p.stars, p.moon);
  U.uCloudP.value.set(p.cloudCover, p.cloudSoft, p.cloudOpacity, p.cloudBright);
  U.uCloudLit.value.copy(p.cloudLit);
  U.uCloudShade.value.copy(p.cloudShade);
  U.uFogA.value.copy(p.fogA);
  U.uFogB.value.copy(p.fogB);
  U.uFogP.value.set(p.fogDensity, p.fogFalloff, World.H0 - 2, 1);
  U.uMistP.value.set(p.mist, p.mistFalloff, World.H0 - 0.5, 0);
  U.uHaze.value.set(p.haze, 0, 0, 0);
  U.uTrans.value = p.trans;
  U.uWindowGlow.value = p.windows;
  U.uMoonCol.value.setRGB(0.85, 0.9, 1.0);
  U.uFoliageLit.value.copy(p.keyColor).multiplyScalar(p.keyIntensity * smoothstep(-2, 3, p.keyEl) * 0.6)
    .add(p.hemiSky.clone().multiplyScalar(p.hemiIntensity * 0.5)).multiplyScalar(1 / Math.PI);

  const { key, fill, hemi } = lights;
  key.color.copy(p.keyColor);
  key.intensity = p.keyIntensity * smoothstep(-2, 3, p.keyEl);
  hemi.color.copy(p.hemiSky);
  hemi.groundColor.copy(p.hemiGround);
  hemi.intensity = p.hemiIntensity;
  fill.color.copy(p.fillColor);
  fill.intensity = p.fillIntensity;
  const fd = dirFromAngles(p.keyAz + 180, 6, new THREE.Vector3());
  fill.position.copy(fd).multiplyScalar(50);
}
