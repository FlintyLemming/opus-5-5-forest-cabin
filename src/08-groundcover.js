/* Ground cover: instanced grass blades (quality tiers draw a prefix of a shuffled set), bracken ferns,
   red-leaved shrubs, dry grass tufts, wildflowers, rocks and pebbles, fallen logs, cut stumps,
   mushrooms and fallen leaves. */

const GRASS_COLORS = {
  baseGreen: { value: lin('#2d3a17') }, tipGreen: { value: lin('#7b8a3c') },
  baseDry: { value: lin('#3f3618') }, tipDry: { value: lin('#c6a85c') },
};

function grassMaterial() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  patchMaterial(mat, {
    foliage: true, foliageTrans: 1.25, foliageWrap: 0.55, foliageShadow: 0.88, undoFlip: true,
    uniforms: { uGrassBaseGreen: GRASS_COLORS.baseGreen, uGrassTipGreen: GRASS_COLORS.tipGreen, uGrassBaseDry: GRASS_COLORS.baseDry, uGrassTipDry: GRASS_COLORS.tipDry },
    vsPars: /* glsl */ `
attribute vec4 aOff;
attribute vec4 aShape;
varying vec3 vGrassCol;
uniform vec3 uGrassBaseGreen;
uniform vec3 uGrassTipGreen;
uniform vec3 uGrassBaseDry;
uniform vec3 uGrassTipDry;`,
    vsNormal: /* glsl */ `
float gh = position.y;
float gw = position.x * aShape.y * (1.0 - gh * 0.82);
float gca = cos(aOff.w), gsa = sin(aOff.w);
vec3 gFacing = vec3(gsa, 0.0, gca);
vec3 gSide = vec3(gca, 0.0, -gsa);
float gBend = aShape.z * gh * gh;
vec3 gPos = aOff.xyz + gSide * gw + vec3(0.0, gh * aShape.x * (1.0 - 0.2 * aShape.z * gh), 0.0) + gFacing * gBend * aShape.x;
gPos += grassWind(aOff.xyz, gh, aShape.x, fract(aShape.w * 7.3));
vec3 objectNormal = normalize(mix(gFacing + vec3(0.0, 0.25, 0.0), vec3(0.0, 1.0, 0.0), 0.5));
float gDry = aShape.w;
vec3 gBase = mix(uGrassBaseGreen, uGrassBaseDry, gDry);
vec3 gTip = mix(uGrassTipGreen, uGrassTipDry, gDry);
vGrassCol = mix(gBase * 0.55, gTip, smoothstep(0.0, 1.0, gh)) * (0.85 + 0.3 * fract(aShape.w * 13.7));`,
    vsBegin: 'vec3 transformed = gPos;',
    fsPars: 'varying vec3 vGrassCol;',
    fsColor: 'diffuseColor.rgb *= vGrassCol;',
  });
  return mat;
}

function bladeGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.42, 0.45, 0, 0.42, 0.45, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.45, 1, 0.45, 0.5, 1], 2));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  return g;
}

function buildGrass(cabin, yard, forest) {
  const rng = makeRng('grass');
  const c = WORLD.clearing;
  const R = 58;
  const N = MAX_GRASS;
  const off = new Float32Array(N * 4), shape = new Float32Array(N * 4);
  const trunks = forest.instances.filter((o) => Math.hypot(o.x - c.cx, o.z - c.cz) < R + 4);
  const tgrid = new Map();
  for (const t of trunks) {
    const k = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`;
    if (!tgrid.has(k)) tgrid.set(k, []);
    tgrid.get(k).push(t);
  }
  const nearTrunk = (x, z) => {
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    let best = 99;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = tgrid.get(`${gx + i},${gz + j}`);
      if (l) for (const t of l) best = Math.min(best, Math.hypot(t.x - x, t.z - z) / Math.max(0.6, t.scale));
    }
    return best;
  };
  const colliders = yard.colliders;
  let n = 0;
  let guard = 0;
  while (n < N && guard < N * 8) {
    guard++;
    const a = rng() * TAU, r = Math.sqrt(rng()) * R;
    const x = c.cx + Math.cos(a) * r, z = c.cz + Math.sin(a) * r;
    // cabin, porch and steps
    if (x > -3.75 && x < 4.45 && z > -2.95 && z < 5.0) continue;
    if (Math.abs(x) < 0.95 && z > 4.6 && z < 6.4) continue;
    let blocked = false;
    for (const k of colliders) if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r * 0.8) { blocked = true; break; }
    if (blocked) continue;
    const m = World.maskAt(x, z);
    let d = lerp(0.1, 1.0, m.meadow);
    d *= 1 - smoothstep(0.3, 0.72, m.path) * 0.97;
    d += smoothstep(0.08, 0.3, m.path) * (1 - smoothstep(0.3, 0.55, m.path)) * 0.7;
    const dc = World.creekDist(x, z);
    const t = World.creekField.param(x, z);
    if (dc < World.creekHalfWidth(t) + 0.15) continue;
    d += (1 - smoothstep(1.5, 4.0, dc)) * 0.45;
    const nt = nearTrunk(x, z);
    if (nt < 0.45) continue;
    d *= smoothstep(0.45, 2.2, nt) * 0.75 + 0.25;
    d *= 0.55 + 0.6 * (0.5 + 0.5 * Noise.fbm2(x * 0.12 + 7, z * 0.12 - 2, 3));
    if (rng() > d) continue;
    const gy = World.heightAt(x, z);
    const nearCabin = 1 - smoothstep(6, 13, Math.hypot(x - 0.3, z - 1.2));
    const verge = smoothstep(0.08, 0.35, m.path) * (1 - smoothstep(0.35, 0.6, m.path));
    let h = rng.range(0.28, 0.58) * lerp(1, 0.55, nearCabin) * (1 + verge * 0.45) * lerp(0.75, 1.15, 1 - m.meadow * 0.4);
    h *= 0.8 + 0.4 * (0.5 + 0.5 * Noise.n2(x * 0.3, z * 0.3));
    const dry = clamp(0.55 + 0.45 * Noise.fbm2(x * 0.06 - 4, z * 0.06 + 9, 3) + rng.range(-0.25, 0.25) - (1 - smoothstep(1.5, 5, dc)) * 0.35, 0, 1);
    off[n * 4] = x; off[n * 4 + 1] = gy - 0.03; off[n * 4 + 2] = z; off[n * 4 + 3] = rng() * TAU;
    shape[n * 4] = h; shape[n * 4 + 1] = rng.range(0.035, 0.06); shape[n * 4 + 2] = rng.range(0.12, 0.5); shape[n * 4 + 3] = Math.min(0.999, dry + rng() * 0.0001);
    n++;
  }
  const geo = bladeGeometry();
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
  geo.instanceCount = n;
  const mesh = new THREE.Mesh(geo, grassMaterial());
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grass';
  const total = n;
  return {
    mesh,
    setQuality(q) { geo.instanceCount = Math.min(total, q.grass); },
  };
}

// Plant made of curved frond strips radiating from the root (bracken in autumn).
function fernGeometry(rng) {
  const mb = new MeshBuilder();
  const uvr = atlasUV('fern', 0);
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + rng.range(-0.25, 0.25);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const L = rng.range(0.6, 0.95);
    const rise = rng.range(0.35, 0.55);
    const pts = [
      new THREE.Vector3(0, 0.02, 0),
      dir.clone().multiplyScalar(L * 0.3).add(new THREE.Vector3(0, rise * L, 0)),
      dir.clone().multiplyScalar(L * 0.68).add(new THREE.Vector3(0, rise * L * 1.05, 0)),
      dir.clone().multiplyScalar(L).add(new THREE.Vector3(0, rise * L * 0.6, 0)),
    ];
    const side = new THREE.Vector3(-dir.z, 0, dir.x).applyAxisAngle(dir, rng.range(-0.4, 0.4));
    addBranchCard(mb, pts, side, L * 0.42, uvr, {
      normalFn: (p, cn) => new THREE.Vector3().copy(cn).multiplyScalar(0.5).add(new THREE.Vector3(p.x, 0.8, p.z).normalize()).normalize(),
      colorFn: (p, s) => { const k = lerp(0.6, 1.05, s); return new THREE.Color(k, k, k); },
      windFn: (p, s) => [s, 0.6, rng()],
      taper: [0.25, 0.9, 1, 0.55],
    });
  }
  return mb.build();
}

function crossCardsGeometry(kind, cell, w, h, copies, rng, spread = 0) {
  const parts = [];
  for (let i = 0; i < copies; i++) {
    const g = crossCard(kind, cell, w * rng.range(0.85, 1.1), h * rng.range(0.85, 1.1), rng);
    g.rotateY(rng() * Math.PI);
    if (spread) g.translate(rng.range(-spread, spread), 0, rng.range(-spread, spread));
    parts.push(g);
  }
  return mergeGeometries(parts, { aWind: 3 });
}

function scatterInstances(geo, mat, list, { shadow = false, name = 'scatter', tilt = 0.08 } = {}) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  list.forEach((o, i) => {
    e.set(o.tx ?? 0, o.rot ?? 0, o.tz ?? 0);
    q.setFromEuler(e);
    const sc = o.scale ?? 1;
    s.set(sc * (o.sx ?? 1), sc * (o.sy ?? 1), sc * (o.sz ?? 1));
    m4.compose(p.set(o.x, o.y, o.z), q, s);
    mesh.setMatrixAt(i, m4);
    if (o.color) mesh.setColorAt(i, o.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  if (mat.userData.depthMaterial) mesh.customDepthMaterial = mat.userData.depthMaterial;
  mesh.name = name;
  // small scatter is left out of the creek mirror (layer 1 is drawn by the main camera only)
  if (MIRROR_SKIP.has(name)) mesh.layers.set(1);
  mesh.computeBoundingSphere();
  void tilt;
  return mesh;
}

const MIRROR_SKIP = new Set(['tufts', 'pebbles', 'mushrooms', 'leaf-litter', 'ferns']);

function buildGroundCover(T, M, cabin, yard, forest) {
  const rng = makeRng('groundcover');
  const group = new THREE.Group();
  group.name = 'groundcover';
  const c = WORLD.clearing;
  const gy = (x, z) => World.heightAt(x, z);
  const colliders = yard.colliders;
  const freeAt = (x, z, pad = 0) => {
    if (x > -3.9 - pad && x < 4.6 + pad && z > -3.1 - pad && z < 5.2 + pad) return false;
    for (const k of colliders) if ((x - k.x) ** 2 + (z - k.z) ** 2 < (k.r + pad) ** 2) return false;
    if (World.creekDist(x, z) < World.creekHalfWidth(World.creekField.param(x, z)) + 0.3) return false;
    if (World.pathDist(x, z) < 0.9 + pad) return false;
    return true;
  };
  const sample = (count, R, accept) => {
    const out = [];
    for (let i = 0; i < count * 30 && out.length < count; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * R;
      const x = c.cx + Math.cos(a) * r, z = c.cz + Math.sin(a) * r;
      const v = accept(x, z);
      if (v) out.push(Object.assign({ x, z, y: gy(x, z), rot: rng() * TAU }, typeof v === 'object' ? v : {}));
    }
    return out;
  };
  const edgeBand = (x, z, lo, hi) => {
    const e = World.ellipse(x, z);
    return smoothstep(lo - 0.12, lo, e) * (1 - smoothstep(hi, hi + 0.2, e));
  };
  M.plantCards = M.plant || foliageMaterial({ map: T.atlas, wind: 'plant', trans: 1.1 });

  // bracken ferns: forest edge and creek banks
  const fernGeos = [fernGeometry(makeRng('fern-a')), fernGeometry(makeRng('fern-b'))];
  const ferns = sample(900, 70, (x, z) => {
    if (!freeAt(x, z, 0.3)) return false;
    const band = edgeBand(x, z, 1.02, 1.9);
    const creek = 1 - smoothstep(2.5, 7, World.creekDist(x, z));
    const p = Math.max(band, creek * 0.8) * (0.4 + 0.6 * smoothstep(-0.2, 0.4, Noise.fbm2(x * 0.08, z * 0.08, 2)));
    if (rng() > p) return false;
    const bronze = rng.chance(0.62);
    const col = bronze ? lin('#d79a5c').multiplyScalar(rng.range(0.75, 1.0)) : lin('#a8b06a').multiplyScalar(rng.range(0.7, 0.95));
    return { scale: rng.range(0.75, 1.3), color: col };
  });
  ferns.forEach((f) => { f.y -= 0.02; });
  fernGeos.forEach((g, i) => {
    const mesh = scatterInstances(g, M.plantCards, ferns.filter((_, k) => k % 2 === i), { name: 'ferns', shadow: false });
    if (mesh) group.add(mesh);
  });

  // red-leaved shrubs along the edge
  const shrubGeo = crossCardsGeometry('shrub', 0, 0.9, 0.85, 5, makeRng('shrub'), 0.3);
  const shrubs = sample(200, 72, (x, z) => {
    if (!freeAt(x, z, 0.6)) return false;
    const band = edgeBand(x, z, 1.0, 1.6);
    if (rng() > band * 0.7 + (1 - smoothstep(2.5, 6, World.creekDist(x, z))) * 0.3) return false;
    return { scale: rng.range(0.8, 1.4), color: lin(rng.pick(['#ffffff', '#ffd2b8', '#f0c8a0', '#ffe0c8'])).multiplyScalar(rng.range(0.8, 1.05)) };
  });

  // tall dry tufts
  const tuftGeo = crossCardsGeometry('tuft', 0, 0.75, 0.7, 2, makeRng('tuft'));
  const tufts = sample(1800, 62, (x, z) => {
    if (!freeAt(x, z, 0.15)) return false;
    const e = World.ellipse(x, z);
    const m = World.maskAt(x, z);
    const verge = smoothstep(0.05, 0.25, m.path) * (1 - smoothstep(0.25, 0.5, m.path));
    const p = 0.25 * smoothstep(0.9, 1.3, e) + verge * 0.8 + (1 - smoothstep(1.5, 4, World.creekDist(x, z))) * 0.5 + 0.05;
    if (rng() > p) return false;
    return { scale: rng.range(0.6, 1.25), sy: rng.range(0.8, 1.3), color: lin(rng.pick(['#ffffff', '#e8e0c0', '#d8d8a8', '#f0d8b0'])).multiplyScalar(rng.range(0.75, 1.0)) };
  });
  // the open creek meadow toward the evening sun: tall grass and shrubs instead of trees
  for (let i = 0; i < 900; i++) {
    const a = (WORLD.sunAzDusk + rng.range(-15, 15)) * DEG, r = rng.range(38, 135);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!freeAt(x, z, 0.2)) continue;
    tufts.push({ x, z, y: gy(x, z), rot: rng() * TAU, scale: rng.range(0.8, 1.6), sy: rng.range(0.9, 1.5), color: lin(rng.pick(['#ffffff', '#e8e0c0', '#d8d8a8'])).multiplyScalar(rng.range(0.7, 1.0)) });
    if (rng() < 0.12) shrubs.push({ x, z, y: gy(x, z), rot: rng() * TAU, scale: rng.range(1.0, 1.8), color: lin(rng.pick(['#ffffff', '#ffd2b8', '#f0c8a0'])).multiplyScalar(rng.range(0.8, 1.05)) });
  }
  const tuftMesh = scatterInstances(tuftGeo, M.plantCards, tufts, { name: 'tufts' });
  if (tuftMesh) group.add(tuftMesh);
  const shrubMesh = scatterInstances(shrubGeo, M.plantCards, shrubs, { name: 'shrubs', shadow: true });
  if (shrubMesh) group.add(shrubMesh);

  // wildflowers in drifts along the meadow edge, path verges and around the cabin
  ['aster', 'goldenrod', 'yarrow', 'seed'].forEach((kind, i) => {
    const geo = crossCardsGeometry('flower', i, 0.42, 0.5, 2, makeRng('flower-' + kind), 0.12);
    const list = sample([260, 240, 160, 300][i], 45, (x, z) => {
      if (!freeAt(x, z, 0.2)) return false;
      const e = World.ellipse(x, z);
      const m = World.maskAt(x, z);
      const drift = smoothstep(0.25, 0.6, Noise.fbm2(x * 0.09 + i * 13, z * 0.09 - i * 7, 2));
      const verge = smoothstep(0.05, 0.25, m.path) * (1 - smoothstep(0.25, 0.5, m.path));
      const p = drift * (smoothstep(0.55, 0.9, e) * (1 - smoothstep(1.1, 1.3, e)) + verge + 0.15);
      if (rng() > p) return false;
      return { scale: rng.range(0.75, 1.25), color: lin('#ffffff').multiplyScalar(rng.range(0.8, 1.05)) };
    });
    const mesh = scatterInstances(geo, M.plantCards, list, { name: 'flowers-' + kind });
    if (mesh) group.add(mesh);
  });

  // rocks: boulders at the edge and in the forest, clusters on the creek banks
  const rockGeos = [0, 1, 2, 3, 4].map((i) => {
    const r = makeRng('rock-' + i);
    return stoneGeo(r, 0.5, { detail: 2, flat: r.range(0.55, 0.8), rough: 0.22, color: 0xffffff, stretch: [r.range(0.9, 1.3), 1, r.range(0.8, 1.1)] });
  });
  const rocks = sample(170, 85, (x, z) => {
    if (!freeAt(x, z, 0.8)) return false;
    const e = World.ellipse(x, z);
    const creek = 1 - smoothstep(1.8, 4.5, World.creekDist(x, z));
    const p = 0.12 * smoothstep(1.0, 1.5, e) + creek * 0.6;
    if (rng() > p) return false;
    const big = rng.chance(0.15);
    return { scale: big ? rng.range(1.1, 2.0) : rng.range(0.25, 0.8), color: lin(rng.pick(['#d8d2c8', '#c8c2b8', '#d0c4b0', '#bdb9b2'])).multiplyScalar(rng.range(0.85, 1.05)), tx: rng.range(-0.2, 0.2), tz: rng.range(-0.2, 0.2) };
  });
  rocks.forEach((r) => { r.y -= r.scale * 0.12; World.addAO(r.x, r.z, r.scale * 0.9, 0.5); });
  rockGeos.forEach((g, i) => {
    const mesh = scatterInstances(g, M.stone, rocks.filter((_, k) => k % rockGeos.length === i), { name: 'rocks', shadow: true });
    if (mesh) group.add(mesh);
  });
  const pebbleGeo = stoneGeo(makeRng('pebble'), 0.5, { detail: 0, flat: 0.6, rough: 0.2, color: 0xffffff });
  const pebbles = sample(900, 90, (x, z) => {
    const dc = World.creekDist(x, z), hw = World.creekHalfWidth(World.creekField.param(x, z));
    const m = World.maskAt(x, z);
    const p = (1 - smoothstep(hw + 0.6, hw + 2.2, dc)) * 0.9 + smoothstep(0.3, 0.6, m.path) * (1 - smoothstep(0.7, 0.9, m.path)) * 0.25;
    if (rng() > p) return false;
    return { scale: rng.range(0.05, 0.16), color: lin(rng.pick(['#d6cfc2', '#bfb6a6', '#a8a196', '#cbbfa8'])), sy: rng.range(0.6, 1) };
  });
  pebbles.forEach((p) => { p.y = Math.max(p.y, World.heightAt(p.x, p.z)) - p.scale * 0.15; });
  const pebbleMesh = scatterInstances(pebbleGeo, M.stone, pebbles, { name: 'pebbles' });
  if (pebbleMesh) group.add(pebbleMesh);

  // fallen logs, cut stumps and mushrooms
  const b = new Batch('deadwood');
  const lrng = makeRng('deadwood');
  const mushroomSpots = [];
  const logSpots = [[-24, 10, 0.4, 6.5], [21, -9, 2.2, 5.5], [-15, -21, 1.2, 7], [27, 16, -0.6, 5], [-30, 26, 0.9, 6]];
  for (const [x, z, yaw, len] of logSpots) {
    const g0 = gy(x, z);
    const lg = logGeo(lrng, len, lrng.range(0.22, 0.32), { seg: 12, bow: 0.02, taper: 0.18, color: lin('#9a8a7a'), capColor: lin('#8a7a66'), caps: true, noiseAmt: 0.08 });
    const m = makeMatrix([x, g0 + 0.16, z], [lrng.range(-0.05, 0.05), yaw, lrng.range(-0.04, 0.04)]);
    lg.side.applyMatrix4(m);
    lg.caps.applyMatrix4(m);
    b.add('bark', lg.side);
    b.add('end', lg.caps);
    World.addAO(x, z, len * 0.55, 0.45, 0.4);
    for (let i = 0; i < 6; i++) {
      const t = lrng.range(-0.45, 0.45) * len;
      mushroomSpots.push([x + Math.cos(yaw) * t + lrng.range(-0.4, 0.4), z - Math.sin(yaw) * t + lrng.range(-0.4, 0.4)]);
    }
  }
  const stumpSpots = [[-14, 15], [12, -9], [17, 4], [-16, -5], [8, 15.5], [-6, -11], [21, 12], [-21, 14]];
  for (const [x, z] of stumpSpots) {
    if (!freeAt(x, z, 0.4)) continue;
    const h = lrng.range(0.35, 0.6), rr = lrng.range(0.22, 0.36);
    const st = logGeo(lrng, h, rr, { seg: 14, taper: -0.1, color: lin('#a39484'), capColor: lin('#b4a690'), caps: 'end', noiseAmt: 0.06 });
    const m = makeMatrix([x, gy(x, z) + h / 2 - 0.05, z], [0, lrng() * TAU, Math.PI / 2]);
    st.side.applyMatrix4(m);
    st.caps.applyMatrix4(m);
    b.add('bark', st.side);
    b.add('end', st.caps);
    World.addAO(x, z, 0.8, 0.45);
    for (let i = 0; i < 3; i++) mushroomSpots.push([x + lrng.range(-0.5, 0.5), z + lrng.range(-0.5, 0.5)]);
  }
  group.add(b.build(M));

  const mushGeo = (() => {
    const cap = new THREE.SphereGeometry(0.5, 10, 5, 0, TAU, 0, Math.PI / 2);
    cap.scale(1, 0.55, 1);
    cap.translate(0, 0.62, 0);
    setColor(cap, 0xffffff);
    const under = new THREE.CircleGeometry(0.48, 10);
    under.rotateX(Math.PI / 2);
    under.translate(0, 0.62, 0);
    setColor(under, lin('#8a7a5a'));
    const stem = new THREE.CylinderGeometry(0.12, 0.16, 0.64, 7, 1, true);
    stem.translate(0, 0.32, 0);
    setColor(stem, lin('#d8cdb4'));
    return mergeGeometries([cap, under, stem]);
  })();
  const mushrooms = [];
  for (const [x, z] of mushroomSpots) {
    if (!freeAt(x, z, 0)) continue;
    const kind = rng.pick(['brown', 'brown', 'orange', 'red']);
    const col = { brown: '#8a5a32', orange: '#d68a2a', red: '#b8301e' }[kind];
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const mx = x + rng.range(-0.12, 0.12), mz = z + rng.range(-0.12, 0.12);
      mushrooms.push({ x: mx, z: mz, y: gy(mx, mz) - 0.01, rot: rng() * TAU, scale: rng.range(0.07, 0.15), color: lin(col).multiplyScalar(rng.range(0.85, 1.1)), tx: rng.range(-0.15, 0.15), tz: rng.range(-0.15, 0.15) });
    }
  }
  const mushMesh = scatterInstances(mushGeo, M.ceramic, mushrooms, { name: 'mushrooms' });
  if (mushMesh) group.add(mushMesh);

  // fallen leaves: under birches and maples, along the path and on the porch steps
  const leafCells = [[0, 1, 4, 6], [2, 3], [5, 7]];
  const leafGeos = leafCells.map((cells, k) => {
    const parts = cells.map((cell) => {
      const g = flatCard('leaf', cell, 0.12, makeRng('leafgeo' + k + cell));
      g.rotateX(-Math.PI / 2);
      return g;
    });
    return parts;
  });
  const leafLists = [[], [], []];
  const sources = forest.instances.filter((o) => (o.species === 'birch' || o.species === 'maple') && Math.hypot(o.x - c.cx, o.z - c.cz) < 60);
  for (const s of sources) {
    const n = s.species === 'maple' ? 70 : 45;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = Math.pow(rng(), 0.6) * (s.species === 'maple' ? 5 : 3.6) * s.scale;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (!freeAt(x, z, -0.6)) continue;
      const kind = s.species === 'maple' ? (rng.chance(0.8) ? 1 : 2) : (rng.chance(0.85) ? 0 : 2);
      leafLists[kind].push({ x, z, y: gy(x, z) + 0.012, rot: rng() * TAU, scale: rng.range(0.8, 1.3), tx: rng.range(-0.25, 0.25), tz: rng.range(-0.25, 0.25), color: lin('#ffffff').multiplyScalar(rng.range(0.65, 1.0)) });
    }
  }
  for (let i = 0; i < 700; i++) {
    const t = rng.range(0, 60);
    const p = World.path;
    let k = 0;
    while (k < p.len.length - 2 && p.len[k + 1] < t) k++;
    const x = p.pts[k][0] + rng.range(-1.4, 1.4), z = p.pts[k][1] + rng.range(-1.4, 1.4);
    if (x > -3.9 && x < 4.6 && z > -3.1 && z < 4.9) continue;
    const kind = rng.pick([0, 0, 1, 2, 2]);
    leafLists[kind].push({ x, z, y: gy(x, z) + 0.012, rot: rng() * TAU, scale: rng.range(0.8, 1.2), tx: rng.range(-0.3, 0.3), tz: rng.range(-0.3, 0.3), color: lin('#ffffff').multiplyScalar(rng.range(0.6, 0.95)) });
  }
  leafLists.forEach((list, k) => {
    const geos = leafGeos[k];
    geos.forEach((g, gi) => {
      const sub = list.filter((_, i) => i % geos.length === gi);
      const mesh = scatterInstances(g, M.leaf, sub, { name: 'leaf-litter' });
      if (mesh) group.add(mesh);
    });
  });
  return { group };
}
