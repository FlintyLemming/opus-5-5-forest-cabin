/* Core: three.js loading, quality tiers, deterministic randomness, noise, math and the geometry kit.
   All source files are concatenated into one module, so top-level names are shared. */

const THREE_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
  'https://unpkg.com/three@0.170.0/build/three.module.min.js',
];

async function loadThree() {
  let lastError = null;
  for (const url of THREE_SOURCES) {
    try {
      return await import(url);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const THREE = await loadThree().catch((err) => {
  showFatal('三维引擎没有加载成功，可能是网络无法访问公共 CDN。请检查网络后重新加载。', err);
  throw err;
});

/* ── Quality tiers ─────────────────────────────────────────────────────────── */

const QUALITY_TIERS = {
  low: { key: 'low', label: '流畅', maxDpr: 1.0, msaa: 0, shadowSize: 1024, grass: 30000, dofTaps: 16, bloomLevels: 4, rayScale: 0.25, fx: 0.55, mirror: 0 },
  medium: { key: 'medium', label: '均衡', maxDpr: 1.25, msaa: 4, shadowSize: 2048, grass: 80000, dofTaps: 32, bloomLevels: 5, rayScale: 0.25, fx: 0.8, mirror: 0 },
  high: { key: 'high', label: '精致', maxDpr: 1.75, msaa: 4, shadowSize: 4096, grass: 150000, dofTaps: 48, bloomLevels: 6, rayScale: 0.5, fx: 1.0, mirror: 0.5 },
};
const MAX_GRASS = QUALITY_TIERS.high.grass;

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage may be blocked; preferences are optional */ }
  },
};

function detectQuality(renderer) {
  const saved = storage.get('linjian.quality');
  if (saved && QUALITY_TIERS[saved]) return saved;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || '';
  } catch { /* renderer string is optional */ }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 720;
  if (/swiftshader|llvmpipe|software|microsoft basic/i.test(gpu)) return 'low';
  if (coarse && small) return 'low';
  if (coarse || /intel|mali|adreno|powervr|videocore|apple gpu|apple m1\b/i.test(gpu)) return 'medium';
  return 'high';
}

/* ── Math helpers ──────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const lin = (hex) => new THREE.Color(hex); // hex is sRGB; THREE.Color stores linear

function dirFromAngles(azDeg, elDeg, out = new THREE.Vector3()) {
  const az = azDeg * DEG, el = elDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/* ── Deterministic randomness: one stream per subsystem keeps tuning stable ── */

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(name) {
  let a = hashString('linjian-muwu/' + name);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.sign = () => (next() < 0.5 ? -1 : 1);
  next.gauss = () => {
    const u = Math.max(1e-9, next()), v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return next;
}

/* ── Simplex noise (Gustavson), seeded ─────────────────────────────────────── */

const Noise = (() => {
  const rng = makeRng('noise');
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512), perm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; perm12[i] = perm[i] % 12; }
  const g = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const F3 = 1 / 3, G3 = 1 / 6;

  function n2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const k = perm12[ii + perm[jj]] * 3; t0 *= t0; n += t0 * t0 * (g[k] * x0 + g[k + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const k = perm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n += t1 * t1 * (g[k] * x1 + g[k + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const k = perm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n += t2 * t2 * (g[k] * x2 + g[k + 1] * y2); }
    return 70 * n;
  }

  function n3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const q = perm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n += t0 * t0 * (g[q] * x0 + g[q + 1] * y0 + g[q + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const q = perm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n += t1 * t1 * (g[q] * x1 + g[q + 1] * y1 + g[q + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const q = perm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n += t2 * t2 * (g[q] * x2 + g[q + 1] * y2 + g[q + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const q = perm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n += t3 * t3 * (g[q] * x3 + g[q + 1] * y3 + g[q + 2] * z3); }
    return 32 * n;
  }

  function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n2(x * freq + o * 17.3, y * freq - o * 9.1);
      norm += amp; amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  function fbm3(x, y, z, octaves = 3, lacunarity = 2.07, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n3(x * freq + o * 11.7, y * freq - o * 5.3, z * freq + o * 3.1);
      norm += amp; amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  return { n2, n3, fbm2, fbm3 };
})();

/* ── Geometry kit ──────────────────────────────────────────────────────────────
   Props are built from small primitives with UVs measured in meters (so one texture
   keeps one texel density everywhere) and per-vertex colors, then merged per material. */

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

function makeMatrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, order = 'XYZ') {
  _e.set(rot[0], rot[1], rot[2], order);
  _q.setFromEuler(_e);
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new THREE.Matrix4().compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _q, new THREE.Vector3(s[0], s[1], s[2]));
}

function setColor(geo, color) {
  const c = color instanceof THREE.Color ? color : lin(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Multiply vertex colors by fn(x, y, z, nx, ny, nz) evaluated in the geometry's current space.
function shade(geo, fn) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array, c = geo.attributes.color.array;
  for (let i = 0, j = 0; i < p.length; i += 3, j++) {
    const k = fn(p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2]);
    c[i] *= k; c[i + 1] *= k; c[i + 2] *= k;
  }
  return geo;
}

function place(geo, at = [0, 0, 0], rot = [0, 0, 0], scale = 1, order = 'XYZ') {
  geo.applyMatrix4(makeMatrix(at, rot, scale, order));
  return geo;
}

function box(w, h, d, { at, rot, color = 0xffffff, uv = [0, 0], order } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const n = geo.attributes.normal.array, t = geo.attributes.uv.array;
  for (let i = 0, j = 0; j < t.length; i += 3, j += 2) {
    const ax = Math.abs(n[i]), ay = Math.abs(n[i + 1]);
    const su = ax > 0.5 ? d : w;
    const sv = ay > 0.5 ? d : h;
    t[j] = t[j] * su + uv[0];
    t[j + 1] = t[j + 1] * sv + uv[1];
  }
  setColor(geo, color);
  return place(geo, at, rot, 1, order);
}

function cylinder(rTop, rBot, h, { seg = 8, hseg = 1, open = false, at, rot, color = 0xffffff, uv = [0, 0], order, uPeriod = 0.8 } = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, hseg, open);
  const circ = Math.max(1, Math.round((Math.PI * (rTop + rBot)) / uPeriod)) * uPeriod;
  const t = geo.attributes.uv.array, n = geo.attributes.normal.array;
  for (let i = 0, j = 0; j < t.length; i += 3, j += 2) {
    if (Math.abs(n[i + 1]) > 0.99) { // cap
      t[j] = t[j] * 2 * rBot + uv[0];
      t[j + 1] = t[j + 1] * 2 * rBot + uv[1];
    } else {
      t[j] = t[j] * circ + uv[0];
      t[j + 1] = t[j + 1] * h + uv[1];
    }
  }
  setColor(geo, color);
  return place(geo, at, rot, 1, order);
}

// Irregular rounded stone: displaced icosahedron, slightly flattened.
function stoneGeo(rng, radius, { detail = 1, flat = 0.75, rough = 0.28, color = 0x8a8478, at, rot, stretch = [1, 1, 1] } = {}) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const ox = rng() * 100, oy = rng() * 100, oz = rng() * 100;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const nx = x / stretch[0], ny = y / (flat * stretch[1]), nz = z / stretch[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nrm[i] = nx / nl; nrm[i + 1] = ny / nl; nrm[i + 2] = nz / nl;
    const d = 1 + rough * Noise.n3(x * 1.3 + ox, y * 1.3 + oy, z * 1.3 + oz) + rough * 0.4 * Noise.n3(x * 3.1 + oz, y * 3.1 + ox, z * 3.1 + oy);
    p[i] = x * d * radius * stretch[0];
    p[i + 1] = y * d * radius * flat * stretch[1];
    p[i + 2] = z * d * radius * stretch[2];
  }
  const out = geo.index ? geo.toNonIndexed() : geo;
  // icosahedron uvs are spherical; replace with planar meter uvs so stone texture tiles evenly
  const pp = out.attributes.position.array, uvs = new Float32Array((pp.length / 3) * 2);
  for (let i = 0, j = 0; i < pp.length; i += 3, j += 2) { uvs[j] = pp[i] + pp[i + 1] * 0.5 + ox; uvs[j + 1] = pp[i + 2] + pp[i + 1] * 0.5 + oy; }
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  setColor(out, color);
  return place(out, at, rot);
}

// Rough rectangular fieldstone: a subdivided box with softened corners and noise, flat-shaded.
function blockStoneGeo(rng, w, h, d, { color = 0xc9c2b6, round = 0.3, rough = 0.07, at, rot } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  const p = geo.attributes.position.array;
  const o = rng() * 100;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]);
    const s = v.clone().normalize().multiplyScalar(0.62);
    v.lerp(s, round);
    const n = Noise.n3(v.x * 2.1 + o, v.y * 2.1 - o, v.z * 2.1 + o * 0.5);
    v.multiplyScalar(1 + rough * n * 2);
    p[i] = v.x * w; p[i + 1] = v.y * h; p[i + 2] = v.z * d;
  }
  const out = geo.toNonIndexed();
  out.computeVertexNormals();
  const pp = out.attributes.position.array, uvs = out.attributes.uv.array;
  for (let i = 0, j = 0; i < pp.length; i += 3, j += 2) { uvs[j] = pp[i] + pp[i + 2] + o; uvs[j + 1] = pp[i + 1] + pp[i + 2] * 0.5 + o * 0.3; }
  setColor(out, color);
  return place(out, at, rot);
}

// Log along +X with noisy radius, slight bow and taper. Returns { side, caps } (caps use end-grain UVs).
function logGeo(rng, length, radius, { seg = 12, rings = 0, bow = 0.02, taper = 0.06, color = 0xffffff, capColor = 0xffffff, at, rot, caps = true, noiseAmt = 0.06, vPeriod = 0.8 } = {}) {
  const nr = rings || Math.max(2, Math.ceil(length / 0.45));
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const ox = rng() * 50, phase = rng() * TAU, bowDir = rng() * TAU;
  const c = lin(color);
  const radiusAt = (t, a) => {
    const base = radius * (1 + taper * (0.5 - t));
    return base * (1 + noiseAmt * Noise.n2(a * 1.6 + ox, t * length * 0.9 + ox) + noiseAmt * 0.5 * Noise.n2(a * 4.0 - ox, t * length * 3.0));
  };
  const centerAt = (t) => {
    const b = Math.sin(Math.PI * t) * bow * length;
    return [0, Math.cos(bowDir) * b, Math.sin(bowDir) * b];
  };
  const circ = Math.max(1, Math.round((TAU * radius) / vPeriod)) * vPeriod;
  for (let r = 0; r <= nr; r++) {
    const t = r / nr;
    const x = (t - 0.5) * length;
    const cc = centerAt(t);
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU + phase;
      const rad = radiusAt(t, s === seg ? phase : a);
      const cy = Math.cos(a), cz = Math.sin(a);
      pos.push(x, cc[1] + cy * rad, cc[2] + cz * rad);
      nor.push(0, cy, cz);
      uv.push(x + ox, (s / seg) * circ);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < nr; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  side.setIndex(idx);
  side.computeVertexNormals();

  let capGeo = null;
  if (caps) {
    const cp = [], cn = [], cu = [], ccol = [], ci = [];
    const cap = lin(capColor);
    // End-grain atlas: 2x2 cells, pick one per cap for variety.
    for (const end of [0, 1]) {
      if ((caps === 'start' && end === 1) || (caps === 'end' && end === 0)) continue;
      const t = end, x = (t - 0.5) * length, sgn = end ? 1 : -1;
      const cc = centerAt(t);
      const base = cp.length / 3;
      const cell = [Math.floor(rng() * 2) * 0.5, Math.floor(rng() * 2) * 0.5];
      const rot2 = rng() * TAU;
      cp.push(x, cc[1], cc[2]); cn.push(sgn, 0, 0); cu.push(cell[0] + 0.25, cell[1] + 0.25); ccol.push(cap.r, cap.g, cap.b);
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * TAU + phase;
        const rad = radiusAt(t, s === seg ? phase : a) * 0.985;
        const cy = Math.cos(a), cz = Math.sin(a);
        cp.push(x, cc[1] + cy * rad, cc[2] + cz * rad);
        cn.push(sgn, 0, 0);
        const ra = a - phase + rot2, rr = (rad / radius) * 0.235;
        cu.push(cell[0] + 0.25 + Math.cos(ra) * rr, cell[1] + 0.25 + Math.sin(ra) * rr);
        ccol.push(cap.r, cap.g, cap.b);
      }
      for (let s = 0; s < seg; s++) {
        if (end) ci.push(base, base + 1 + s, base + 2 + s);
        else ci.push(base, base + 2 + s, base + 1 + s);
      }
    }
    capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    capGeo.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
    capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    capGeo.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
    capGeo.setIndex(ci);
  }
  const m = makeMatrix(at, rot);
  side.applyMatrix4(m);
  if (capGeo) capGeo.applyMatrix4(m);
  return { side, caps: capGeo };
}

// Tapered tube along a polyline of points (arrays [x,y,z]) with radii; used for branches and twigs.
// UVs: u runs along the tube (wood grain and bark plates follow it), v wraps around in whole texture periods.
function tubeGeo(points, radii, { seg = 6, color = 0xffffff, uvScale = 1, uPeriod = 0.8, extra = null } = {}) {
  const pos = [], nor = [], uv = [], col = [], idx = [], ex = [];
  const c = lin(color);
  const n = points.length;
  const P = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  // parallel-transport frames
  let up = Math.abs(T[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3().crossVectors(T[0], up).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const len = axis.length();
      if (len > 1e-6) {
        const ang = Math.acos(clamp(T[i - 1].dot(T[i]), -1, 1));
        normal.applyAxisAngle(axis.multiplyScalar(1 / len), ang);
      }
    }
    N.push(normal.clone());
    B.push(new THREE.Vector3().crossVectors(T[i], normal).normalize());
  }
  let along = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) along += P[i].distanceTo(P[i - 1]);
    const r = radii[i];
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU;
      const cx = Math.cos(a), sy = Math.sin(a);
      const nx = N[i].x * cx + B[i].x * sy, ny = N[i].y * cx + B[i].y * sy, nz = N[i].z * cx + B[i].z * sy;
      pos.push(P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r);
      nor.push(nx, ny, nz);
      const wraps = Math.max(1, Math.round((TAU * r) / uPeriod));
      uv.push(along * uvScale, (s / seg) * wraps * uPeriod * uvScale);
      col.push(c.r, c.g, c.b);
      if (extra) ex.push(...extra(i, s));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * (seg + 1) + s, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (extra) geo.setAttribute('aWind', new THREE.Float32BufferAttribute(ex, 3));
  geo.setIndex(idx);
  return geo;
}

// Merge geometries that share position/normal/uv/color (+ optional extras with given item sizes).
function mergeGeometries(list, extras = {}) {
  const attrs = { position: 3, normal: 3, uv: 2, color: 3, ...extras };
  let vtx = 0, idx = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    vtx += c;
    idx += g.index ? g.index.count : c;
  }
  const arrays = {};
  for (const [name, size] of Object.entries(attrs)) arrays[name] = new Float32Array(vtx * size);
  const index = vtx > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let vo = 0, io = 0;
  for (const g of list) {
    const count = g.attributes.position.count;
    for (const [name, size] of Object.entries(attrs)) {
      const src = g.attributes[name];
      const dst = arrays[name];
      if (src) {
        const a = src.array;
        if (src.itemSize === size) dst.set(a.subarray(0, count * size), vo * size);
        else for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) dst[(vo + i) * size + k] = k < src.itemSize ? a[i * src.itemSize + k] : 0;
      } else if (name === 'color') {
        dst.fill(1, vo * 3, (vo + count) * 3);
      }
    }
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
      io += gi.length;
    } else {
      for (let i = 0; i < count; i++) index[io + i] = vo + i;
      io += count;
    }
    vo += count;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, size] of Object.entries(attrs)) out.setAttribute(name, new THREE.BufferAttribute(arrays[name], size));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Collects geometries per material key, then emits one mesh per key.
class Batch {
  constructor(name) {
    this.name = name;
    this.parts = new Map();
  }
  add(key, geo) {
    if (!geo) return geo;
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geo);
    return geo;
  }
  build(materials, { castShadow = true, receiveShadow = true, extras = {}, noShadow = [] } = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [key, list] of this.parts) {
      const mat = materials[key];
      if (!mat) throw new Error(`Batch ${this.name}: no material "${key}"`);
      const geo = mergeGeometries(list, extras[key] || {});
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${this.name}:${key}`;
      mesh.castShadow = castShadow && !noShadow.includes(key);
      mesh.receiveShadow = receiveShadow;
      if (mat.userData.depthMaterial) mesh.customDepthMaterial = mat.userData.depthMaterial;
      group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.parts.clear();
    return group;
  }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
