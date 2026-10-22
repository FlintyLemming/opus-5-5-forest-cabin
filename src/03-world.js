/* World: terrain height field, the path and the creek, ground masks, terrain meshes and creek water.
   Layout (meters): the cabin sits at the origin facing +Z; the meadow clearing is an ellipse around it;
   the creek runs from the back-left to the front-right and crosses the path on a plank bridge. */

const WORLD = {
  clearing: { cx: -1, cz: 5, rx: 21, rz: 25 },
  maskRect: { x0: -120, z0: -120, size: 240 },
  maskRes: 1024,
  sunAzDusk: -106,     // degrees; the meadow corridor along the creek valley keeps this sunline open
  sunElDusk: 8,
  creekDepth: 0.42,
};

const PATH_POINTS = [[0, 5.7], [0.25, 8.4], [1.5, 12.3], [1.9, 16.8], [0.4, 21.3], [-2.2, 25.8], [-4.2, 30.6], [-4.9, 35.6], [-3.9, 41.5], [-1.4, 49.5], [1.4, 59.5], [2.9, 71], [2.1, 85], [-0.8, 99], [-3, 117]];
const CREEK_POINTS = [[-118, -47], [-96, -36], [-73, -24], [-53, -10], [-38.5, 4], [-27, 15], [-16.5, 24.5], [-6.5, 32.5], [5, 38.8], [18, 44], [32, 49.5], [48, 57], [64, 66.5], [82, 75.5], [100, 82.5], [118, 87]];

// Centripetal-ish Catmull-Rom through 2D points, resampled to roughly `step` meters.
function sampleSpline2D(points, step = 0.5) {
  const v = points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
  const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / step));
  const pts = curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1] };
}

// Distance (and arc-length parameter) to a polyline, stored on a grid; only cells within maxD are touched.
class DistField {
  constructor(res, rect, maxD, withT = false) {
    this.res = res;
    this.x0 = rect.x0; this.z0 = rect.z0;
    this.cell = rect.size / res;
    this.maxD = maxD;
    this.d = new Float32Array(res * res).fill(maxD);
    this.t = withT ? new Float32Array(res * res) : null;
  }
  stamp(poly) {
    const { res, x0, z0, cell, maxD } = this;
    for (let i = 0; i < poly.pts.length - 1; i++) {
      const [ax, az] = poly.pts[i], [bx, bz] = poly.pts[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - maxD - x0) / cell));
      const i1 = Math.min(res - 1, Math.ceil((Math.max(ax, bx) + maxD - x0) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - maxD - z0) / cell));
      const j1 = Math.min(res - 1, Math.ceil((Math.max(az, bz) + maxD - z0) / cell));
      const l0 = poly.len[i], l1 = poly.len[i + 1];
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + (j + 0.5) * cell;
        for (let k = i0; k <= i1; k++) {
          const px = x0 + (k + 0.5) * cell;
          let h = ((px - ax) * dx + (pz - az) * dz) / L2;
          h = h < 0 ? 0 : h > 1 ? 1 : h;
          const ex = px - ax - dx * h, ez = pz - az - dz * h;
          const d = Math.sqrt(ex * ex + ez * ez);
          const idx = j * res + k;
          if (d < this.d[idx]) {
            this.d[idx] = d;
            if (this.t) this.t[idx] = l0 + h * (l1 - l0);
          }
        }
      }
    }
  }
  _bilinear(arr, x, z, fallback) {
    const fx = (x - this.x0) / this.cell - 0.5, fz = (z - this.z0) / this.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.res - 1 || j >= this.res - 1) return fallback;
    const tx = fx - i, tz = fz - j, r = this.res;
    const a = arr[j * r + i], b = arr[j * r + i + 1], c = arr[(j + 1) * r + i], d = arr[(j + 1) * r + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  dist(x, z) { return this._bilinear(this.d, x, z, this.maxD); }
  param(x, z) {
    const fx = Math.round((x - this.x0) / this.cell - 0.5), fz = Math.round((z - this.z0) / this.cell - 0.5);
    if (fx < 0 || fz < 0 || fx >= this.res || fz >= this.res) return 0;
    return this.t[fz * this.res + fx];
  }
}

const World = {
  path: null, creek: null,
  pathField: null, creekField: null, creekWide: null,
  water: null, waterStep: 1,
  H0: 0, cabinY: 0,
  grid: null,
  mask: null, maskTex: null,

  ellipse(x, z) {
    const c = WORLD.clearing;
    return Math.hypot((x - c.cx) / c.rx, (z - c.cz) / c.rz);
  },

  corridor(x, z) {
    const d = Math.hypot(x, z);
    if (d < 18) return 0;
    const az = Math.atan2(x, z) / DEG;
    const da = Math.abs(((az - WORLD.sunAzDusk + 540) % 360) - 180);
    return (1 - smoothstep(8, 15, da)) * smoothstep(18, 32, d);
  },

  rawHeight(x, z) {
    let h = -0.035 * z - 0.012 * x;
    h += Noise.fbm2(x * 0.0065 + 3.1, z * 0.0065 - 1.7, 4) * 9.0;
    h += Noise.fbm2(x * 0.021 - 7.3, z * 0.021 + 2.2, 3) * 2.0;
    const back = smoothstep(-25, -165, z);
    h += back * back * 22.0;
    h += smoothstep(55, 190, Math.abs(x - 8)) * 9.0;
    return h;
  },

  creekHalfWidth(t) {
    return 1.15 + 0.3 * Math.sin(t * 0.045 + 1.3) + 0.15 * Math.sin(t * 0.13);
  },

  baseHeight(x, z) {
    let h = this.rawHeight(x, z);
    // keep the low evening sun visible from the cabin: cap the terrain along the corridor
    const cw = this.corridor(x, z);
    if (cw > 0) {
      const cap = this.H0 + Math.hypot(x, z) * Math.tan(3.2 * DEG);
      if (h > cap) h = lerp(h, cap, cw);
    }
    // a soft valley follows the creek
    if (this.creekWide) {
      const dv = this.creekWide.dist(x, z);
      h -= 1.6 * (1 - smoothstep(4, 30, dv));
    }
    // the meadow is a gentle, slightly tilted plane
    const e = this.ellipse(x, z);
    const k = smoothstep(0.72, 1.4, e);
    const c = WORLD.clearing;
    const plane = this.H0 - 0.028 * (z - c.cz) - 0.012 * (x - c.cx) + Noise.fbm2(x * 0.05 + 11, z * 0.05 - 4, 2) * 0.35 * smoothstep(0.25, 0.7, e);
    h = lerp(plane, h, k);
    // the path is worn a little into the ground
    if (this.pathField) {
      const dp = this.pathField.dist(x, z);
      h -= 0.06 * (1 - smoothstep(0.2, 1.3, dp));
    }
    h += Noise.n2(x * 0.33, z * 0.33) * 0.06 + Noise.n2(x * 1.1 + 5, z * 1.1) * 0.02;
    return h;
  },

  waterAt(t) {
    const w = this.water;
    const f = clamp(t / this.waterStep, 0, w.length - 1);
    const i = Math.min(w.length - 2, Math.floor(f));
    return lerp(w[i], w[i + 1], f - i);
  },

  heightFn(x, z) {
    let h = this.baseHeight(x, z);
    const d = this.creekField.dist(x, z);
    if (d < this.creekField.maxD - 0.01) {
      const t = this.creekField.param(x, z);
      const water = this.waterAt(t);
      const hw = this.creekHalfWidth(t);
      const bed = water - WORLD.creekDepth;
      const carved = d < hw ? bed + (d / hw) * (d / hw) * (WORLD.creekDepth + 0.1) : water + 0.1 + (d - hw) * 0.5;
      if (carved < h) h = lerp(h, carved, 1 - smoothstep(this.creekField.maxD - 1.5, this.creekField.maxD, d));
    }
    return h;
  },

  // Height on the rendered surface (exact triangle interpolation inside the dense grid).
  heightAt(x, z) {
    const g = this.grid;
    if (g) {
      const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
      const i = Math.floor(fx), j = Math.floor(fz);
      if (i >= 0 && j >= 0 && i < g.n && j < g.n) {
        const tx = fx - i, tz = fz - j, w = g.n + 1, H = g.h;
        const a = H[j * w + i], b = H[j * w + i + 1], c = H[(j + 1) * w + i], d = H[(j + 1) * w + i + 1];
        return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
      }
    }
    return this.heightFn(x, z);
  },

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.35;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  },

  // Ground classification for placement: 0..1 weights sampled from the CPU copy of the mask.
  maskAt(x, z) {
    const r = WORLD.maskRect, res = WORLD.maskRes;
    const i = Math.floor(((x - r.x0) / r.size) * res), j = Math.floor(((z - r.z0) / r.size) * res);
    if (i < 0 || j < 0 || i >= res || j >= res) return { path: 0, wet: 0, meadow: 0, ao: 1 };
    const k = (j * res + i) * 4, m = this.mask;
    return { path: m[k] / 255, wet: m[k + 1] / 255, meadow: m[k + 2] / 255, ao: m[k + 3] / 255 };
  },
  pathDist(x, z) { return this.pathField.dist(x, z); },
  creekDist(x, z) { return this.creekField.dist(x, z); },
  creekWideDist(x, z) { return this.creekWide.dist(x, z); },

  // Darken the ground around an object (contact shadow / ambient occlusion) in the mask's alpha.
  addAO(x, z, radius, strength = 0.5, squash = 1) {
    const r = WORLD.maskRect, res = WORLD.maskRes, cell = r.size / res;
    const i0 = Math.max(0, Math.floor((x - radius - r.x0) / cell)), i1 = Math.min(res - 1, Math.ceil((x + radius - r.x0) / cell));
    const j0 = Math.max(0, Math.floor((z - radius * squash - r.z0) / cell)), j1 = Math.min(res - 1, Math.ceil((z + radius * squash - r.z0) / cell));
    const m = this.mask;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = r.x0 + (i + 0.5) * cell, pz = r.z0 + (j + 0.5) * cell;
        const d = Math.hypot(px - x, (pz - z) / squash) / radius;
        if (d >= 1) continue;
        const k = (j * res + i) * 4 + 3;
        const f = 1 - strength * Math.pow(1 - d, 1.6);
        m[k] = Math.round(m[k] * f);
      }
    }
  },
  addAORect(cx, cz, hw, hd, falloff, strength) {
    const r = WORLD.maskRect, res = WORLD.maskRes, cell = r.size / res;
    const i0 = Math.max(0, Math.floor((cx - hw - falloff - r.x0) / cell)), i1 = Math.min(res - 1, Math.ceil((cx + hw + falloff - r.x0) / cell));
    const j0 = Math.max(0, Math.floor((cz - hd - falloff - r.z0) / cell)), j1 = Math.min(res - 1, Math.ceil((cz + hd + falloff - r.z0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = r.x0 + (i + 0.5) * cell, pz = r.z0 + (j + 0.5) * cell;
        const dx = Math.max(0, Math.abs(px - cx) - hw), dz = Math.max(0, Math.abs(pz - cz) - hd);
        const d = Math.hypot(dx, dz) / falloff;
        if (d >= 1) continue;
        const k = (j * res + i) * 4 + 3;
        this.mask[k] = Math.round(this.mask[k] * (1 - strength * Math.pow(1 - d, 1.4)));
      }
    }
  },
  commitMask() {
    if (this.maskTex) this.maskTex.needsUpdate = true;
  },

  build() {
    const c = WORLD.clearing;
    this.H0 = this.rawHeight(c.cx, c.cz);
    this.path = sampleSpline2D(PATH_POINTS, 0.5);
    this.creek = sampleSpline2D(CREEK_POINTS, 0.5);

    this.pathField = new DistField(WORLD.maskRes, WORLD.maskRect, 7, true);
    this.pathField.stamp(this.path);
    this.creekWide = new DistField(256, WORLD.maskRect, 34, false);
    this.creekWide.stamp(this.creek);

    // water surface: always at least 0.38 m below the ground along the creek, never flowing uphill
    const step = 1.0;
    const n = Math.ceil(this.creek.total / step) + 1;
    const curve = new THREE.CatmullRomCurve3(CREEK_POINTS.map((p) => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
    const water = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt(Math.min(1, (i * step) / this.creek.total));
      let lowest = Infinity;
      for (const o of [-1.2, 0, 1.2]) lowest = Math.min(lowest, this.baseHeight(p.x + o, p.z + o * 0.6) - 0.36);
      water[i] = i === 0 ? lowest : Math.min(water[i - 1] - 0.004 * step, lowest);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n - 1; i++) water[i] = Math.min(water[i], (water[i - 1] + water[i] + water[i + 1]) / 3);
      for (let i = 1; i < n; i++) water[i] = Math.min(water[i], water[i - 1] - 0.002);
    }
    this.water = water;
    this.waterStep = step;
    this.creekField = new DistField(WORLD.maskRes, WORLD.maskRect, 8, true);
    this.creekField.stamp(this.creek);
    this.cabinY = this.heightFn(0, 0);

    this.buildMask();
  },

  buildMask() {
    const res = WORLD.maskRes, r = WORLD.maskRect, cell = r.size / res;
    const m = new Uint8Array(res * res * 4);
    for (let j = 0; j < res; j++) {
      const z = r.z0 + (j + 0.5) * cell;
      for (let i = 0; i < res; i++) {
        const x = r.x0 + (i + 0.5) * cell;
        const k = (j * res + i) * 4;
        const dp = this.pathField.d[j * res + i];
        const pw = 0.75 + 0.25 * smoothstep(20, 60, this.pathField.t[j * res + i]);
        const path = 1 - smoothstep(pw * 0.55, pw + 0.55, dp);
        const dc = this.creekField.d[j * res + i];
        const wet = 1 - smoothstep(1.3, 3.4, dc);
        const e = this.ellipse(x, z);
        let meadow = 1 - smoothstep(0.82, 1.22, e);
        const dv = this.creekWide.dist(x, z);
        meadow = Math.max(meadow, (1 - smoothstep(5, 16, dv)) * 0.75);
        meadow = Math.max(meadow, this.corridor(x, z) * (1 - smoothstep(30, 90, Math.hypot(x, z))) * 0.8);
        m[k] = Math.round(path * 255);
        m[k + 1] = Math.round(wet * 255);
        m[k + 2] = Math.round(meadow * 255);
        m[k + 3] = 255;
      }
    }
    this.mask = m;
    const tex = new THREE.DataTexture(m, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.flipY = false;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.maskTex = tex;
  },

  buildTerrain(T) {
    const c = WORLD.clearing;
    const step = 0.5, half = 76;
    const n = Math.round((half * 2) / step);
    const x0 = c.cx - half, z0 = c.cz - half;
    const w = n + 1;
    const H = new Float32Array(w * w);
    const pos = new Float32Array(w * w * 3);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const h = this.heightFn(x, z);
        H[j * w + i] = h;
        const k = (j * w + i) * 3;
        pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      }
    }
    const idx = new Uint32Array(n * n * 6);
    let p = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * w + i, b = a + 1, cc = a + w, d = cc + 1;
        idx[p++] = a; idx[p++] = cc; idx[p++] = b;
        idx[p++] = b; idx[p++] = cc; idx[p++] = d;
      }
    }
    this.grid = { x0, z0, step, n, h: H };
    const inner = new THREE.BufferGeometry();
    inner.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    inner.setIndex(new THREE.BufferAttribute(idx, 1));
    inner.computeVertexNormals();

    // outer ring: geometric rings out to the horizon, tucked under the dense grid where they overlap
    const seg = 192, rings = [];
    for (let r = 78; r < 700; r *= 1.06) rings.push(r);
    rings.push(700);
    const opos = [], oidx = [];
    for (let ri = 0; ri < rings.length; ri++) {
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * TAU;
        const x = c.cx + Math.cos(a) * rings[ri], z = c.cz + Math.sin(a) * rings[ri];
        const cheb = Math.max(Math.abs(x - c.cx), Math.abs(z - c.cz));
        const tuck = 0.35 * (1 - smoothstep(half - 1, half + 8, cheb));
        opos.push(x, this.heightFn(x, z) - tuck, z);
      }
    }
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let s = 0; s < seg; s++) {
        const a = ri * (seg + 1) + s, b = a + 1, cc = a + seg + 1, d = cc + 1;
        oidx.push(a, b, cc, b, d, cc);
      }
    }
    const outer = new THREE.BufferGeometry();
    outer.setAttribute('position', new THREE.Float32BufferAttribute(opos, 3));
    outer.setIndex(oidx);
    outer.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const r = WORLD.maskRect;
    patchMaterial(mat, {
      uniforms: {
        uMask: { value: this.maskTex },
        uMaskRect: { value: new THREE.Vector4(r.x0, r.z0, 1 / r.size, 0) },
        uGround: { value: T.ground },
        uNoiseTex: { value: T.noise },
      },
      fsPars: /* glsl */ `
uniform sampler2D uMask;
uniform vec4 uMaskRect;
uniform sampler2D uGround;
uniform sampler2D uNoiseTex;`,
      fsColor: /* glsl */ `
{
  vec2 muv = (vWorldPos.xz - uMaskRect.xy) * uMaskRect.z;
  vec4 m = (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) ? texture2D(uMask, muv) : vec4(0.0, 0.0, 0.0, 1.0);
  vec4 g = texture2D(uGround, vWorldPos.xz * 0.25);
  vec4 g2 = texture2D(uGround, vWorldPos.xz * 0.061 + 0.37);
  vec4 nz = texture2D(uNoiseTex, vWorldPos.xz * 0.006);
  vec4 nz2 = texture2D(uNoiseTex, vWorldPos.xz * 0.045 + 0.5);
  vec3 forest = mix(vec3(0.062, 0.042, 0.027), vec3(0.12, 0.075, 0.042), g.r);
  forest = mix(forest, vec3(0.2, 0.11, 0.048), g.g * (0.55 + 0.45 * nz2.r));
  forest = mix(forest, vec3(0.07, 0.085, 0.032), smoothstep(0.55, 0.78, nz2.b) * 0.65);
  vec3 meadow = mix(vec3(0.085, 0.078, 0.033), vec3(0.15, 0.125, 0.055), g.b);
  meadow = mix(meadow, vec3(0.07, 0.08, 0.03), smoothstep(0.35, 0.75, nz.b) * 0.6);
  meadow = mix(meadow, forest, g.g * 0.25);
  vec3 dirt = mix(vec3(0.14, 0.095, 0.06), vec3(0.22, 0.155, 0.1), g.r);
  dirt = mix(dirt, vec3(0.3, 0.27, 0.23), g.a * 0.85);
  vec3 wet = mix(vec3(0.06, 0.048, 0.032), vec3(0.12, 0.095, 0.06), g.r);
  wet = mix(wet, vec3(0.22, 0.2, 0.17), g.a * 0.75);
  float pathAmt = smoothstep(0.3, 0.75, m.r + (g2.r - 0.5) * 0.5 + (g.a - 0.3) * 0.2);
  float meadowAmt = smoothstep(0.15, 0.85, m.b + (nz2.r - 0.5) * 0.3);
  vec3 col = mix(forest, meadow, meadowAmt);
  col = mix(col, dirt, pathAmt);
  col = mix(col, wet, smoothstep(0.1, 0.9, m.g));
  col *= 0.55 + 0.45 * m.a;
  col *= 0.85 + 0.3 * nz.r;
  diffuseColor.rgb = col;
}`,
    });
    // the creek mirror gets a 1 m version of the dense grid (layer 2); the main camera draws the full one (layer 1)
    const cn = n / 2, cw = cn + 1;
    const cpos = new Float32Array(cw * cw * 3);
    for (let j = 0; j <= cn; j++) {
      for (let i = 0; i <= cn; i++) {
        const k = (j * cw + i) * 3, src = (j * 2 * w + i * 2) * 3;
        cpos[k] = pos[src]; cpos[k + 1] = pos[src + 1]; cpos[k + 2] = pos[src + 2];
      }
    }
    const cidx = new Uint32Array(cn * cn * 6);
    p = 0;
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) {
        const a = j * cw + i, b = a + 1, cc = a + cw, d = cc + 1;
        cidx[p++] = a; cidx[p++] = cc; cidx[p++] = b;
        cidx[p++] = b; cidx[p++] = cc; cidx[p++] = d;
      }
    }
    const coarse = new THREE.BufferGeometry();
    coarse.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
    coarse.setIndex(new THREE.BufferAttribute(cidx, 1));
    coarse.computeVertexNormals();

    const group = new THREE.Group();
    const innerMesh = new THREE.Mesh(inner, mat);
    const outerMesh = new THREE.Mesh(outer, mat);
    const coarseMesh = new THREE.Mesh(coarse, mat);
    innerMesh.layers.set(1);
    coarseMesh.layers.set(2);
    for (const m of [innerMesh, outerMesh, coarseMesh]) {
      m.receiveShadow = true;
      m.castShadow = false;
      group.add(m);
    }
    group.name = 'terrain';
    return group;
  },

  buildWater(T) {
    const poly = sampleSpline2D(CREEK_POINTS, 0.6);
    this.creekSamples = [];
    const cols = 6;
    const pos = [], uv = [], flow = [], idx = [];
    const r = WORLD.maskRect;
    let rows = 0;
    for (let i = 0; i < poly.pts.length; i++) {
      const [x, z] = poly.pts[i];
      if (x < r.x0 + 4 || x > r.x0 + r.size - 4 || z < r.z0 + 4 || z > r.z0 + r.size - 4) continue;
      const a = poly.pts[Math.max(0, i - 1)], b = poly.pts[Math.min(poly.pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const t = poly.len[i];
      const hw = this.creekHalfWidth(t) + 0.45;
      const y = this.waterAt(t) - 0.02;
      if (rows % 3 === 0) this.creekSamples.push([x, y, z]);
      for (let c = 0; c <= cols; c++) {
        const s = (c / cols) * 2 - 1;
        pos.push(x - tz * hw * s, y, z + tx * hw * s);
        uv.push(c / cols, t);
        flow.push(tx, tz);
      }
      rows++;
    }
    for (let j = 0; j < rows - 1; j++) {
      for (let c = 0; c < cols; c++) {
        const a = j * (cols + 1) + c, b = a + 1, cc = a + cols + 1, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    geo.setIndex(idx);

    // The surface is lit by three (sun glints with shadows, ambient for the water body) but composes its
    // own premultiplied output: reflection by Fresnel on top, the bed showing through the shallows.
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0, transparent: true, envMapIntensity: 1.0 });
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    patchMaterial(mat, {
      noAtmos: true,
      uniforms: { uNoiseTex: { value: T.noise }, uWaterTint: { value: lin('#0f1d19') }, uFoliageLit: U.uFoliageLit, ...CreekMirror.uniforms },
      vsPars: 'attribute vec2 aFlow;\nuniform mat4 uReflMat;\nvarying vec2 vFlow;\nvarying vec2 vWUv;\nvarying vec4 vReflCoord;',
      vsWorld: 'vFlow = aFlow; vWUv = uv; vReflCoord = uReflMat * vec4(pmWorld.xyz, 1.0);',
      fsPars: /* glsl */ `
uniform sampler2D uNoiseTex;
uniform vec3 uWaterTint;
uniform vec3 uFoliageLit;
uniform sampler2D uReflTex;
uniform float uReflOn;
varying vec4 vReflCoord;
varying vec2 vFlow;
varying vec2 vWUv;
vec3 wN;
float waterH(vec2 p) {
  float a = texture2D(uNoiseTex, p * 0.35).g;
  float b = texture2D(uNoiseTex, p * 0.9 + 0.31).r;
  return a * 0.6 + b * 0.4;
}`,
      fsNormal: /* glsl */ `
{
  // ripples: a handful of wavelets carried downstream by the current (q is in meters: across, along);
  // the short ones fade where a pixel would cover them, so the surface never aliases into streaks
  float mid = 1.0 - abs(vWUv.x * 2.0 - 1.0);
  float speed = 0.35 + 0.5 * mid;
  vec2 q = vec2(vWUv.x * 3.2, vWUv.y);
  float fw = length(fwidth(q));
  vec2 qa = q - vec2(0.0, uTime * speed);
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = sin(fi * 2.399 + 0.6) * 0.45;
    vec2 dir = vec2(sin(ang), cos(ang));
    float wl = 1.2 * pow(0.7, fi);
    float k = 6.2831 / wl;
    float steep = mix(0.02, 0.012, fi / 5.0) * (1.0 - smoothstep(wl * 0.08, wl * 0.3, fw));
    float ph = dot(qa, dir) * k + fi * 1.7 + vnoise(q * vec2(1.6, 0.7) + fi * 3.1) * 3.2;
    grad += dir * steep * cos(ph);
  }
  grad *= (0.6 + 0.4 * mid) * mix(0.55, 1.0, uReflOn);
  vec3 tangentAcross = vec3(-vFlow.y, 0.0, vFlow.x);
  vec3 tangentAlong = vec3(vFlow.x, 0.0, vFlow.y);
  wN = normalize(vec3(0.0, 1.0, 0.0) - tangentAcross * grad.x - tangentAlong * grad.y);
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
}`,
      fsOut: /* glsl */ `
{
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdV = clamp(dot(wN, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, wN);
  R.y = max(R.y, 0.02);
  R = normalize(R);
  vec3 sky = atmosColor(R);
#ifdef USE_ENVMAP
  sky = textureCubeUV(envMap, envMapRotation * R, 0.06).rgb * envMapIntensity;
#endif
  // the forest around the creek mirrored: a ragged treeline over sunlit crowns (golden birch among dark
  // spruce) that dissolve into the haze toward the horizon; smooth at crown scale so ripples only bend it
  float az = atan(R.x, R.z);
  float tl = 0.44 + 0.2 * (vnoise(vec2(az * 1.4, 0.5)) - 0.5) + 0.08 * (vnoise(vec2(az * 4.5, 3.5)) - 0.5);
  float forestMask = 1.0 - smoothstep(tl - 0.05, tl + 0.05, R.y);
  vec3 atm = atmosColor(R);
  float crowns = vnoise(vec2(az * 4.0, R.y * 5.0 + 1.3)) * 0.7 + vnoise(vec2(az * 9.0, R.y * 11.0)) * 0.3;
  float golden = smoothstep(0.3, 0.7, vnoise(vec2(az * 1.1 + 5.0, 2.0)));
  vec3 hR = normalize(vec3(R.x, 0.0, R.z) + 1e-4);
  vec3 hS = normalize(vec3(uScatterDir.x, 0.0, uScatterDir.z) + 1e-4);
  float back = pow(max(dot(hR, hS), 0.0), 4.0);
  // low in the mirror it is trunks and understory; the lit crowns only come in higher up
  vec3 albedo = mix(vec3(0.06, 0.085, 0.045), vec3(0.5, 0.34, 0.08), golden);
  vec3 crownsLit = uFoliageLit * albedo * mix(0.4, 1.0, crowns) * (1.0 + 0.8 * back);
  vec3 understory = uFoliageLit * vec3(0.03, 0.035, 0.025);
  vec3 forest = mix(understory, crownsLit, smoothstep(0.12, 0.42, R.y));
  float depthCue = exp(-R.y / tl * 2.6);
  forest = mix(forest, atm * 0.8, depthCue * 0.6);
  vec3 refl = mix(sky, forest, forestMask);
  // the dark banks and their grass are what the margins mirror
  float midR = 1.0 - abs(vWUv.x * 2.0 - 1.0);
  refl *= mix(0.15, 1.0, smoothstep(0.05, 0.55, midR));
  // close up, the real mirror image (bent by the ripples) replaces the stand-in
  if (uReflOn > 0.0) {
    vec2 ruv = clamp(vReflCoord.xy / vReflCoord.w + wN.xz * 0.2, vec2(0.002), vec2(0.998));
    refl = mix(refl, texture2D(uReflTex, ruv).rgb, uReflOn);
  }

  // water body (dark, tea-tinted) lit like everything else; the bed shows through the shallows
  vec3 irr = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float mid = 1.0 - abs(vWUv.x * 2.0 - 1.0);
  float bodyA = mix(0.2, 0.62, smoothstep(0.15, 0.75, mid));
  vec3 col = refl * F + irr * uWaterTint * (1.0 - F) * bodyA + reflectedLight.directSpecular;
  float alpha = F + (1.0 - F) * bodyA;

  // foam along the banks and slow streaks on the current
  float foam = smoothstep(0.58, 0.8, waterH(vec2(vWUv.x * 6.0, vWUv.y * 1.6 - uTime * 0.9))) * (smoothstep(0.3, 0.08, vWUv.x) + smoothstep(0.7, 0.92, vWUv.x));
  float streak = smoothstep(0.7, 0.9, waterH(vec2(vWUv.x * 2.2, vWUv.y * 0.35 - uTime * 0.55))) * 0.35 * mid;
  float fa = clamp(foam * 0.3 + streak * 0.15, 0.0, 1.0);
  col = mix(col, irr * 0.4, fa);
  alpha = mix(alpha, 1.0, fa);

  // slip under the banks
  float edge = smoothstep(0.0, 0.13, vWUv.x) * smoothstep(1.0, 0.87, vWUv.x);
  col *= edge;
  alpha *= edge;
  // height fog for a premultiplied surface
  col = mix(col, atmosColor(-V) * alpha, atmosAmount(vWorldPos));
  gl_FragColor = vec4(col, alpha);
}`,
    });
    Sky.registerEnv(mat);
    const mesh = new THREE.Mesh(geo, mat);
    this.waterMesh = mesh;
    mesh.name = 'creek-water';
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    return mesh;
  },
};

// Planar mirror for the creek: the scene seen from below the water plane at reduced resolution, rendered
// only while the creek is close and on screen. Small ground scatter and the dense terrain (layer 1) stay
// out of it, a coarse terrain (layer 2) stands in and the grass is thinned; further away, and below the
// high tier, the water falls back to its stand-in reflection.
const CreekMirror = {
  rt: null,
  scale: 0,
  w: 1, h: 1,
  cam: (() => { const c = new THREE.PerspectiveCamera(); c.layers.enable(2); return c; })(),
  uniforms: { uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } },
  _p: new THREE.Vector3(),
  _look: new THREE.Vector3(),
  _plane: new THREE.Plane(),
  _clip: new THREE.Vector4(),
  _q: new THREE.Vector4(),
  _bias: new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1),

  setQuality(q) {
    this.scale = q.mirror || 0;
    this.allocate();
  },

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.allocate();
  },

  allocate() {
    const w = Math.max(1, Math.round(this.w * this.scale)), h = Math.max(1, Math.round(this.h * this.scale));
    if (!this.scale) {
      if (this.rt) this.rt.dispose();
      this.rt = null;
      this.uniforms.uReflTex.value = null;
      return;
    }
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.uniforms.uReflTex.value = this.rt.texture;
  },

  update(app) {
    const u = this.uniforms;
    u.uReflOn.value = 0;
    if (!this.rt || !World.waterMesh || !World.waterMesh.visible) return;
    const cam = app.camera;
    cam.updateMatrixWorld();
    // the nearest stretch of creek that is on screen sets the plane and whether the mirror is worth it
    let best = Infinity, planeY = 0;
    const p = this._p;
    for (const s of World.creekSamples) {
      p.set(s[0], s[1], s[2]).project(cam);
      if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      const d = Math.hypot(s[0] - cam.position.x, s[1] - cam.position.y, s[2] - cam.position.z);
      if (d < best) { best = d; planeY = s[1]; }
    }
    const on = 1 - smoothstep(20, 28, best);
    if (on <= 0 || cam.position.y < planeY + 0.05) return;

    // mirror the camera through the plane y = planeY
    const vc = this.cam;
    vc.position.set(cam.position.x, 2 * planeY - cam.position.y, cam.position.z);
    cam.getWorldDirection(this._look);
    this._look.y *= -1;
    vc.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    vc.up.y *= -1;
    vc.lookAt(this._look.add(vc.position));
    vc.near = cam.near;
    vc.far = cam.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(cam.projectionMatrix);
    u.uReflMat.value.copy(this._bias).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // oblique near plane: nothing below the water surface reaches the mirror
    const plane = this._plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), p.set(0, planeY, 0)).applyMatrix4(vc.matrixWorldInverse);
    const clip = this._clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = vc.projectionMatrix.elements, q = this._q;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1; e[14] = clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const r = app.renderer;
    const grass = app.grass && app.grass.mesh.geometry;
    const grassCount = grass ? grass.instanceCount : 0;
    if (grass) grass.instanceCount = Math.min(grassCount, 12000);
    World.waterMesh.visible = false;
    U.uReflPass.value.set(1, planeY, 0, 0);
    const autoShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(app.scene, vc);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = autoShadow;
    U.uReflPass.value.set(0, 0, 0, 0);
    World.waterMesh.visible = true;
    if (grass) grass.instanceCount = grassCount;
    u.uReflOn.value = on;
  },
};
