/* Cabin: saddle-notched log walls with chinking on a stone foundation, board-and-batten gables,
   a shingled gable roof plus a porch roof, an exterior stone chimney, windows with a lit interior,
   a plank door and a furnished porch. Pieces are merged per material. Cabin faces +Z. */

const CABIN = {
  logR: 0.14, step: 0.33, courses: 8,
  xw: 3.35, zw: 2.6, over: 0.32,
  pitch: 35 * DEG, porchPitch: 11 * DEG,
  roofX: 3.84, eaveZ: 3.05, ridgeH: 4.72,
  porchFront: 4.75, postZ: 4.55,
  chimney: { x0: 3.5, x1: 4.3, z0: -0.66, z1: 0.66 },
  FL: 0, PFL: 0,
};

function cabinMaterials(T) {
  const M = {};
  const std = (o) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 0.45, ...o });
    Sky.registerEnv(m);
    return m;
  };
  M.wood = patchMaterial(std({ map: T.woodMap, normalMap: T.woodNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.86 }), { moss: 0.18 });
  M.end = patchMaterial(std({ map: T.endMap, normalMap: T.endNormal, roughness: 0.9, envMapIntensity: 0.35 }), {});
  M.shingle = patchMaterial(std({ map: T.woodMap, normalMap: T.woodNormal, roughness: 0.93, envMapIntensity: 0.35 }), {
    worldNormal: true,
    fsColor: /* glsl */ `
{
  vec3 wn = normalize(vWorldNormal);
  float n1 = vnoise(vWorldPos.xz * 1.15 + 3.0) * 0.6 + vnoise(vWorldPos.xz * 4.3 + 1.0) * 0.4;
  float north = smoothstep(0.3, -0.5, wn.z);
  float m = smoothstep(0.58, 0.82, n1 + north * 0.22 + (1.0 - vColor.g / max(vColor.r, 0.01)) * 0.0) * smoothstep(0.2, 0.6, wn.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, uMossCol * (0.55 + 0.55 * n1), m * 0.8);
}`,
  });
  M.stone = patchMaterial(std({ map: T.stoneMap, normalMap: T.stoneNormal, roughness: 0.93, envMapIntensity: 0.35 }), { moss: 0.45 });
  M.mortar = patchMaterial(std({ map: T.stoneMap, roughness: 1.0, envMapIntensity: 0.25 }), {});
  M.paint = patchMaterial(std({ map: T.woodMap, normalMap: T.woodNormal, roughness: 0.72, envMapIntensity: 0.5 }), {
    fsColor: /* glsl */ `
{
  vec3 bare = texture2D(map, vMapUv).rgb;
  float tl = dot(bare, vec3(0.333));
  float wear = vnoise(vWorldPos.xy * 7.0 + vWorldPos.z * 5.0) * 0.55 + vnoise(vWorldPos.zy * 21.0 + vWorldPos.x * 13.0) * 0.45;
  float chip = smoothstep(0.8, 0.86, wear + (0.3 - tl) * 0.2) * 0.75;
  vec3 paint = vColor.rgb * (0.8 + 0.5 * tl / 0.3) * 0.55;
  diffuseColor.rgb = mix(paint, bare * 0.95, chip);
}`,
  });
  M.metal = patchMaterial(std({ metalness: 0.75, roughness: 0.52, envMapIntensity: 0.8 }), {});
  M.ceramic = patchMaterial(std({ roughness: 0.32, envMapIntensity: 0.7 }), {});
  M.matte = patchMaterial(std({ roughness: 0.82, envMapIntensity: 0.4 }), {});
  M.pumpkin = patchMaterial(std({ roughness: 0.55, envMapIntensity: 0.5 }), {});
  M.cloth = patchMaterial(new THREE.MeshLambertMaterial({ map: T.cloth, vertexColors: true, side: THREE.DoubleSide }), { foliage: true, foliageTrans: 0.35, foliageWrap: 0.35 });
  M.leaf = foliageMaterial({ map: T.atlas, wind: 'none', trans: 1.0 });
  M.plant = foliageMaterial({ map: T.atlas, wind: 'plant', trans: 1.1 });

  M.glass = patchMaterial(std({ color: 0x090b0b, roughness: 0.05, metalness: 0, envMapIntensity: 1.25, vertexColors: false }), {
    vsPars: 'attribute vec3 aWinR;\nattribute vec3 aWinN;\nattribute vec2 aWinUV;\nattribute vec4 aWinS;\nvarying vec3 vWinR;\nvarying vec3 vWinN;\nvarying vec2 vWinUV;\nvarying vec4 vWinS;',
    vsWorld: 'vWinR = aWinR; vWinN = aWinN; vWinUV = aWinUV; vWinS = aWinS;',
    fsPars: 'varying vec3 vWinR;\nvarying vec3 vWinN;\nvarying vec2 vWinUV;\nvarying vec4 vWinS;',
    fsEmissive: /* glsl */ `
{
  // Interior mapping: trace the view ray into a box-shaped room behind the glass.
  vec3 vd = normalize(vWorldPos - cameraPosition);
  vec3 R = normalize(vWinR), N = normalize(vWinN);
  vec3 d = vec3(dot(vd, R), vd.y, dot(vd, -N));
  d = sign(d) * max(abs(d), vec3(1e-4));
  vec2 size = vWinS.xy;
  float seed = vWinS.w;
  vec3 p = vec3(vWinUV.x * size.x, vWinUV.y * size.y, 0.0);
  vec3 bmin = vec3(-1.3 - seed * 0.6, -vWinS.z, 0.0);
  vec3 bmax = vec3(size.x + 1.1 + seed * 0.5, size.y + 0.55, 2.6 + seed);
  vec3 tm = (mix(bmin, bmax, step(0.0, d)) - p) / d;
  float t = min(min(tm.x, tm.y), tm.z);
  vec3 h = p + d * t;
  vec2 lampPos = vec2(size.x * (0.3 + seed * 0.4), size.y * 0.35);
  vec3 warm = vec3(1.0, 0.56, 0.24);
  vec3 col;
  if (t == tm.z) {
    float lamp = exp(-length(h.xy - lampPos) * 1.4);
    col = warm * (0.16 + 1.1 * lamp);
    float shelf = step(abs(h.y - size.y * 0.75), 0.03) * step(abs(h.x - size.x * 0.5), 0.6);
    float frame = step(abs(h.x - size.x * (0.75 - seed * 0.5)), 0.22) * step(abs(h.y - size.y * 0.55), 0.17);
    col *= 1.0 - shelf * 0.6 - frame * 0.45;
  } else if (t == tm.y) {
    if (d.y < 0.0) {
      float planks = 0.75 + 0.25 * step(0.5, fract(h.x * 3.5));
      col = vec3(0.32, 0.16, 0.07) * planks * (0.25 + 0.6 * exp(-length(h.xz - vec2(lampPos.x, 1.0)) * 0.8));
    } else {
      col = warm * 0.09;
    }
  } else {
    col = warm * (0.08 + 0.35 * exp(-abs(h.z - 1.0) * 0.8)) * vec3(0.95, 0.9, 0.85);
  }
  col *= exp(-t * 0.18);
  float cur = smoothstep(0.24, 0.1, vWinUV.x) + smoothstep(0.76, 0.9, vWinUV.x);
  float folds = 0.6 + 0.4 * sin(vWinUV.x * 70.0 + seed * 9.0);
  col = mix(col, vec3(0.78, 0.42, 0.2) * folds * 0.55, clamp(cur, 0.0, 1.0) * 0.82);
  totalEmissiveRadiance += col * (0.04 + uWindowGlow) * 1.25;
}`,
  });
  M.glass.vertexColors = false;
  M.glow = glowMaterial('#ffb35e', 'windows');
  M.lanternGlow = glowMaterial('#ffbd6e', 'lantern');
  return M;
}

// Cloth atlas quadrants (CanvasTexture is flipped, so the canvas top row is v = 1).
const CLOTH_UV = { plaid: [0, 0.5, 0.5, 1], stripes: [0.5, 0.5, 1, 1], quilt: [0, 0, 0.5, 0.5], linen: [0.5, 0, 1, 0.5] };

// Unlit emissive surface (lamp glass, light leaking around the door) scaled by a time-of-day level.
const GLOW_LEVELS = { windows: { value: 1 }, lantern: { value: 1 }, fire: { value: 1 } };
function glowMaterial(hex, level) {
  const m = new THREE.MeshBasicMaterial({ color: lin(hex) });
  patchMaterial(m, {
    uniforms: { uLevel: GLOW_LEVELS[level] },
    fsPars: 'uniform float uLevel;',
    fsOut: 'gl_FragColor.rgb *= uLevel * 6.0;',
  });
  return m;
}

function buildCabin(T, M) {
  const rng = makeRng('cabin');
  const b = new Batch('cabin');
  const C = CABIN;
  const FL = (C.FL = World.cabinY + 0.58);
  const PFL = (C.PFL = FL - 0.04);
  const r = C.logR;
  const out = { emitters: {}, lights: {} };

  const tint = (hex, j = 0.08) => {
    const c = lin(hex).multiplyScalar(rng.range(1 - j, 1 + j));
    c.offsetHSL(rng.range(-0.008, 0.008), rng.range(-0.03, 0.03), 0);
    return c;
  };
  const logColor = () => tint('#d6c2a8', 0.1);
  const capColor = () => tint('#bfb3a1', 0.08);

  const walls = {
    front: { name: 'front', axis: 'x', line: C.zw, n: [0, 0, 1], yaw: 0, off: 0 },
    back: { name: 'back', axis: 'x', line: -C.zw, n: [0, 0, -1], yaw: Math.PI, off: 0 },
    left: { name: 'left', axis: 'z', line: -C.xw, n: [-1, 0, 0], yaw: -Math.PI / 2, off: 0.165 },
    right: { name: 'right', axis: 'z', line: C.xw, n: [1, 0, 0], yaw: Math.PI / 2, off: 0.165 },
  };
  // a = coordinate along the wall (x for front/back, z for the sides); y measured from the floor
  const openings = [
    { wall: 'front', a0: -0.52, a1: 0.52, y0: 0, y1: 2.02, kind: 'door' },
    { wall: 'front', a0: -2.7, a1: -1.5, y0: 0.86, y1: 2.0, kind: 'window', cols: 2, rows: 3, shutters: true, box: true },
    { wall: 'front', a0: 1.5, a1: 2.7, y0: 0.86, y1: 2.0, kind: 'window', cols: 2, rows: 3, shutters: true, box: true },
    { wall: 'back', a0: 0.55, a1: 1.55, y0: 1.0, y1: 1.92, kind: 'window', cols: 2, rows: 2 },
    { wall: 'left', a0: 0.5, a1: 1.6, y0: 0.9, y1: 1.98, kind: 'window', cols: 2, rows: 2 },
    { wall: 'right', a0: 1.25, a1: 2.0, y0: 1.02, y1: 1.82, kind: 'window', cols: 1, rows: 2 },
  ];
  const wp = (w, a, y, o = 0) => (w.axis === 'x' ? [a, y, w.line + w.n[2] * o] : [w.line + w.n[0] * o, y, a]);
  // place geometry built in wall-local axes (x along the wall, y up, z outward)
  const onWall = (geo, w, a, y, o, pre) => {
    if (pre) geo.applyMatrix4(pre);
    geo.applyMatrix4(makeMatrix(wp(w, a, y, o), [0, w.yaw, 0]));
    return geo;
  };
  const rotZ90 = makeMatrix([0, 0, 0], [0, 0, Math.PI / 2]);
  const vbox = (along, up, outward, color) => box(up, along, outward, { color }).applyMatrix4(rotZ90); // grain runs vertically
  const hbox = (along, up, outward, color) => box(along, up, outward, { color });
  const alongDir = (w) => (w.axis === 'x' ? new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw)) : new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw)));

  // ── log walls ──
  const span = { x: [-C.xw - C.over, C.xw + C.over], z: [-C.zw - C.over, C.zw + C.over] };
  const cut = (segs, w, ylo, yhi) => {
    for (const o of openings) {
      if (o.wall !== w.name) continue;
      if (yhi < FL + o.y0 + 0.02 || ylo > FL + o.y1 - 0.02) continue;
      segs = segs.flatMap(([a, bb, caps]) => {
        if (o.a1 <= a || o.a0 >= bb) return [[a, bb, caps]];
        const res = [];
        const capStart = caps === true || caps === 'start' ? 'start' : false;
        const capEnd = caps === true || caps === 'end' ? 'end' : false;
        if (o.a0 - a > 0.18) res.push([a, o.a0, capStart]);
        if (bb - o.a1 > 0.18) res.push([o.a1, bb, capEnd]);
        return res;
      });
    }
    return segs;
  };
  for (const w of Object.values(walls)) {
    const [s0, s1] = span[w.axis];
    const k0 = w.axis === 'z' ? -1 : 0;
    for (let k = k0; k < C.courses; k++) {
      const y = FL + 0.28 + w.off + k * C.step;
      for (const [a, bb, caps] of cut([[s0, s1, true]], w, y - r * 0.6, y + r * 0.6)) {
        const len = bb - a, mid = (a + bb) / 2;
        const rr = r * rng.range(0.93, 1.07);
        const g = logGeo(rng, len, rr, { seg: 12, bow: 0.005, taper: 0.05, color: logColor(), capColor: capColor(), caps, noiseAmt: 0.045 });
        const m = makeMatrix(wp(w, mid, y, 0), [rng.range(0, TAU) * 0, w.axis === 'z' ? -Math.PI / 2 : 0, 0]);
        g.side.applyMatrix4(m);
        b.add('wood', g.side);
        if (g.caps) { g.caps.applyMatrix4(m); b.add('end', g.caps); }
      }
      // chinking above this log
      if (k < C.courses - 1) {
        const yc = y + C.step / 2;
        const inner = w.axis === 'x' ? [-C.xw + 0.1, C.xw - 0.1] : [-C.zw + 0.1, C.zw - 0.1];
        for (const [a, bb] of cut([[inner[0], inner[1], false]], w, yc - 0.05, yc + 0.05)) {
          const g = hbox(bb - a, 0.1, 0.2, tint('#bdb5a4', 0.05));
          b.add('mortar', onWall(g, w, (a + bb) / 2, yc, 0));
        }
      }
    }
    // sill beam under the eave walls
    if (w.axis === 'x') b.add('wood', onWall(hbox(C.xw * 2 + 0.3, 0.15, 0.25, logColor()), w, 0, FL + 0.065, 0));
  }
  // first chinking line on the eave walls (between sill and first course is tight), and on the gable walls
  for (const w of [walls.left, walls.right]) {
    const yc = FL + 0.28 + w.off - C.step / 2;
    b.add('mortar', onWall(hbox(C.zw * 2 - 0.2, 0.09, 0.2, tint('#bdb5a4', 0.05)), w, 0, yc, 0));
  }

  // ── stone foundation ──
  const stoneColor = () => {
    const c = tint(rng.pick(['#c4bcae', '#b9b3aa', '#c9b9a2', '#aeaaa3', '#c2b29a']), 0.12);
    return c;
  };
  const foundationRun = (w, a0, a1) => {
    for (let a = a0; a < a1 - 0.05;) {
      const sw = rng.range(0.26, 0.46);
      const ac = Math.min(a + sw / 2, a1 - sw / 2);
      const [x, , z] = wp(w, ac, 0, 0);
      const gy = World.heightAt(x, z);
      let top = FL - 0.02;
      while (top > gy - 0.1) {
        const sh = rng.range(0.17, 0.26);
        const g = blockStoneGeo(rng, sw * 0.96, sh * 0.94, 0.3, { color: stoneColor() });
        const p = wp(w, ac + rng.range(-0.02, 0.02), top - sh / 2, rng.range(0.0, 0.03));
        g.applyMatrix4(makeMatrix(p, [0, w.yaw + rng.range(-0.06, 0.06), rng.range(-0.04, 0.04)]));
        b.add('stone', g);
        top -= sh * rng.range(0.92, 1.0);
      }
      a += sw * rng.range(0.92, 1.02);
    }
    // mortar core behind the stones
    const len = a1 - a0;
    const [mx, , mz] = wp(w, (a0 + a1) / 2, 0, 0);
    const gy = World.heightAt(mx, mz);
    const hgt = FL - 0.02 - (gy - 0.25);
    b.add('mortar', onWall(hbox(len, hgt, 0.26, tint('#9c9484', 0.04)), w, (a0 + a1) / 2, gy - 0.25 + hgt / 2, -0.01));
  };
  foundationRun(walls.front, -C.xw - 0.14, C.xw + 0.14);
  foundationRun(walls.back, -C.xw - 0.14, C.xw + 0.14);
  foundationRun(walls.left, -C.zw + 0.1, C.zw - 0.1);
  foundationRun(walls.right, -C.zw + 0.1, C.zw - 0.1);

  // ── gables: vertical boards with battens ──
  const tanP = Math.tan(C.pitch), cosP = Math.cos(C.pitch), sinP = Math.sin(C.pitch);
  const deckY = (z) => FL + C.ridgeH - Math.abs(z) * tanP;
  const gableBottom = FL + 0.28 + 0.165 + (C.courses - 1) * C.step + 0.09;
  for (const w of [walls.left, walls.right]) {
    const bw = 0.2;
    for (let z = -C.zw - 0.14; z < C.zw + 0.14 - 0.02; z += bw + 0.004) {
      const zc = z + bw / 2;
      const top = Math.min(deckY(z), deckY(z + bw)) - 0.02;
      const h = top - gableBottom;
      if (h < 0.05) continue;
      const g = vbox(bw, h, 0.03, tint('#cbb79c', 0.09));
      b.add('wood', onWall(g, w, zc, gableBottom + h / 2, r - 0.01));
      if (z > -C.zw - 0.1) {
        const bt = vbox(0.055, h - 0.02, 0.025, tint('#c2ae94', 0.06));
        b.add('wood', onWall(bt, w, z, gableBottom + (h - 0.02) / 2, r + 0.015));
      }
    }
    // attic vent with slats on the left gable
    if (w.name === 'left') {
      const vy = FL + 3.62;
      for (const [aa, yy, ww, hh] of [[0, vy + 0.26, 0.62, 0.07], [0, vy - 0.26, 0.62, 0.07], [-0.28, vy, 0.07, 0.58], [0.28, vy, 0.07, 0.58]]) {
        b.add('wood', onWall(ww > hh ? hbox(ww, hh, 0.04, tint('#a99377')) : vbox(ww, hh, 0.04, tint('#a99377')), w, aa, yy, r + 0.04));
      }
      b.add('mortar', onWall(hbox(0.5, 0.46, 0.01, lin('#141414')), w, 0, vy, r + 0.025));
      for (let i = 0; i < 4; i++) {
        const s = hbox(0.5, 0.09, 0.02, tint('#a99377'));
        b.add('wood', onWall(s, w, 0, vy - 0.17 + i * 0.115, r + 0.05, makeMatrix([0, 0, 0], [-0.6, 0, 0])));
      }
    }
  }

  // ── main roof ──
  // roof-local axes: x along the ridge, y along the outward normal, z down the slope from the ridge
  const roofPlace = (geo, s, u, v, wOff, pre) => {
    if (pre) geo.applyMatrix4(pre);
    const X = new THREE.Vector3(s, 0, 0);
    const N = new THREE.Vector3(0, cosP, s * sinP);
    const D = new THREE.Vector3(0, -sinP, s * cosP);
    const m = new THREE.Matrix4().makeBasis(X, N, D);
    m.setPosition(s * u, FL + C.ridgeH - v * sinP + wOff * cosP, s * (v * cosP + wOff * sinP));
    geo.applyMatrix4(m);
    return geo;
  };
  const eaveV = C.eaveZ / cosP;
  const ch = C.chimney;
  const nearChimney = (xa, xb, zw0, zw1) => xb > ch.x0 - 0.06 && xa < ch.x1 && zw1 > ch.z0 - 0.06 && zw0 < ch.z1 + 0.06;
  for (const s of [1, -1]) {
    // deck (split around the chimney on the right overhang)
    const deckParts = [[-C.roofX, ch.x0 - 0.06, 0, eaveV], [ch.x0 - 0.06, C.roofX, (ch.z1 + 0.06) / cosP, eaveV]];
    for (const [xa, xb, va, vb] of deckParts) {
      const g = box(xb - xa, 0.03, vb - va, { color: tint('#b9a68c', 0.04) });
      const uc = (xa + xb) / 2 * s;
      b.add('wood', roofPlace(g, s, uc, (va + vb) / 2, 0.0));
    }
    // shingles, from the eave up
    const expo = 0.155, slen = 0.42;
    const rows = Math.ceil(eaveV / expo) + 1;
    for (let j = 0; j < rows; j++) {
      const vButt = eaveV + 0.04 - j * expo;
      if (vButt < 0.06) break;
      const vc = Math.max(vButt - slen / 2, slen / 2 - 0.02);
      let x = -C.roofX - 0.03 + rng.range(0, 0.18);
      const lowness = 1 - j / rows;
      while (x < C.roofX + 0.03) {
        const sw = rng.range(0.13, 0.27);
        const xa = x, xb = Math.min(x + sw, C.roofX + 0.03);
        x += sw + rng.range(0.006, 0.012);
        if (xb - xa < 0.06) continue;
        const zw0 = Math.min(vButt - slen, vButt) * cosP, zw1 = vButt * cosP;
        if (nearChimney(xa, xb, s > 0 ? zw0 : -zw1, s > 0 ? zw1 : -zw0)) continue;
        const dark = rng.chance(0.12) ? 0.72 : 1;
        const c = tint('#b3a594', 0.1).multiplyScalar(dark);
        if (rng.chance(0.25 * lowness + (s < 0 ? 0.1 : 0))) c.lerp(lin('#8f9a70'), 0.35);
        const g = box(xb - xa, 0.018, slen, { color: c, uv: [rng.range(0, 1.6), rng.range(0, 0.8)] });
        const lift = makeMatrix([0, 0, 0], [rng.range(0.05, 0.08), rng.range(-0.02, 0.02), rng.range(-0.015, 0.015)]);
        const uc = ((xa + xb) / 2) * s;
        b.add('shingle', roofPlace(g, s, uc, vc, 0.03 + rng.range(0, 0.006), lift));
      }
    }
    // ridge cap boards
    b.add('wood', roofPlace(box(C.roofX * 2 + 0.06, 0.035, 0.17, { color: tint('#a39079') }), s, 0, 0.07, 0.07));
    // fascia at the eave
    const fz = s * (C.eaveZ + 0.02), fy = deckY(C.eaveZ) - 0.07;
    b.add('wood', box(C.roofX * 2 + 0.04, 0.17, 0.035, { color: tint('#9e8a70'), at: [0, fy, fz] }));
    // rafter tails
    for (let x = -C.xw + 0.05; x <= C.xw; x += 0.6) {
      const g = box(0.07, 0.13, eaveV - (C.zw - 0.2) / cosP, { color: tint('#a28d72') });
      b.add('wood', roofPlace(g, s, x * s, ((C.zw - 0.2) / cosP + eaveV) / 2, -0.09));
    }
  }
  // rake (barge) boards along both gable edges
  for (const xs of [-1, 1]) {
    for (const s of [1, -1]) {
      const g = box(0.035, 0.19, eaveV + 0.02, { color: tint('#9e8a70') });
      b.add('wood', roofPlace(g, s, xs * (C.roofX + 0.018) * s, eaveV / 2, -0.02));
    }
  }

  // ── chimney ──
  const chimneyStones = (x0, x1, z0, z1, y0, y1) => {
    let y = y0;
    while (y < y1 - 0.05) {
      const sh = rng.range(0.16, 0.24);
      const yc = y + sh / 2;
      const ring = [
        [[x0, z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]],
      ];
      for (const [[ax, az], [bx, bz]] of ring) {
        const len = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        let t = rng.range(0, 0.12);
        while (t < len - 0.08) {
          const sw = Math.min(rng.range(0.24, 0.4), len - t);
          const cx = ax + dx * (t + sw / 2), cz = az + dz * (t + sw / 2);
          const g = blockStoneGeo(rng, sw * 0.97, sh * 0.93, 0.22, { color: stoneColor() });
          const yaw = Math.atan2(-dz, dx);
          g.applyMatrix4(makeMatrix([cx - dz * 0.0, yc, cz + dx * 0.0], [rng.range(-0.04, 0.04), yaw, rng.range(-0.05, 0.05)]));
          b.add('stone', g);
          t += sw * rng.range(0.93, 1.0);
        }
      }
      y += sh * rng.range(0.93, 1.0);
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.add('mortar', box(x1 - x0 - 0.06, y1 - y0, z1 - z0 - 0.06, { color: tint('#8f877a', 0.03), at: [cx, (y0 + y1) / 2, cz] }));
  };
  const chGround = Math.min(World.heightAt(ch.x0, 0), World.heightAt(ch.x1, 0)) - 0.15;
  const shoulder = FL + 2.35;
  chimneyStones(ch.x0, ch.x1, ch.z0, ch.z1, chGround, shoulder);
  // shoulders taper to the flue
  const fx0 = ch.x0 + 0.08, fx1 = ch.x0 + 0.68, fz0 = -0.36, fz1 = 0.36;
  chimneyStones(ch.x0 + 0.04, ch.x1 - 0.12, ch.z0 + 0.15, ch.z1 - 0.15, shoulder, shoulder + 0.45);
  const chTop = FL + C.ridgeH + 0.95;
  chimneyStones(fx0, fx1, fz0, fz1, shoulder + 0.45, chTop);
  b.add('stone', box(fx1 - fx0 + 0.16, 0.08, fz1 - fz0 + 0.16, { color: tint('#cfc9bd'), at: [(fx0 + fx1) / 2, chTop + 0.04, 0] }));
  b.add('mortar', box(fx1 - fx0 - 0.2, 0.02, fz1 - fz0 - 0.2, { color: lin('#0d0b0a'), at: [(fx0 + fx1) / 2, chTop + 0.085, 0] }));
  out.emitters.chimney = new THREE.Vector3((fx0 + fx1) / 2, chTop + 0.15, 0);
  // flashing where the flue passes the roof
  for (const s of [1, -1]) b.add('metal', box(0.04, 0.03, 0.8, { color: lin('#4a4440'), at: [fx0 - 0.02, deckY(0.35) + 0.06, s * 0.2], rot: [s * C.pitch, 0, 0] }));

  // ── porch ──
  const pz0 = C.zw + r, pz1 = C.porchFront;
  for (let z = pz0 + 0.02, i = 0; z < pz1 - 0.05; z += 0.145, i++) {
    const g = box(C.xw * 2 + 0.3, 0.035, 0.135, { color: tint('#cdb79a', 0.09), uv: [rng.range(0, 1.6), rng.range(0, 0.8)] });
    g.applyMatrix4(makeMatrix([rng.range(-0.02, 0.02), PFL - 0.0175 + rng.range(-0.004, 0.004), z + 0.0675], [rng.range(-0.004, 0.004), 0, rng.range(-0.002, 0.002)]));
    b.add('wood', g);
  }
  b.add('wood', box(C.xw * 2 + 0.34, 0.2, 0.06, { color: tint('#a8927a'), at: [0, PFL - 0.135, pz1 - 0.02] }));
  for (const xs of [-1, 1]) b.add('wood', box(0.06, 0.2, pz1 - pz0, { color: tint('#a8927a'), at: [xs * (C.xw + 0.15), PFL - 0.135, (pz0 + pz1) / 2] }));
  for (let x = -C.xw; x <= C.xw + 0.01; x += 0.75) b.add('wood', box(0.07, 0.15, pz1 - pz0, { color: tint('#8f7a62'), at: [x, PFL - 0.11, (pz0 + pz1) / 2] }));
  // stone piers and posts
  const postX = [-C.xw, -1.1, 1.1, C.xw];
  const postTop = FL + 1.92;
  for (const px of postX) {
    const gy = World.heightAt(px, C.postZ);
    let top = PFL - 0.2;
    while (top > gy - 0.15) {
      const sh = rng.range(0.18, 0.26);
      const g = blockStoneGeo(rng, rng.range(0.38, 0.46), sh * 0.95, rng.range(0.38, 0.46), { color: stoneColor() });
      g.applyMatrix4(makeMatrix([px, top - sh / 2, C.postZ], [0, rng.range(0, TAU), 0]));
      b.add('stone', g);
      top -= sh * 0.95;
    }
    const pg = logGeo(rng, postTop - PFL, 0.085, { seg: 10, bow: 0.004, taper: 0.08, color: logColor(), capColor: capColor(), caps: false, noiseAmt: 0.04 });
    pg.side.applyMatrix4(makeMatrix([px, (PFL + postTop) / 2, C.postZ], [0, rng.range(0, TAU), Math.PI / 2]));
    b.add('wood', pg.side);
    // knee braces
    for (const dir of [-1, 1]) {
      if ((px === -C.xw && dir < 0) || (px === C.xw && dir > 0)) continue;
      const g = box(0.55, 0.07, 0.07, { color: logColor() });
      g.applyMatrix4(makeMatrix([px + dir * 0.19, postTop - 0.17, C.postZ], [0, 0, dir * Math.PI / 4]));
      b.add('wood', g);
    }
  }
  b.add('wood', box(C.xw * 2 + 0.4, 0.18, 0.17, { color: logColor(), at: [0, postTop + 0.09, C.postZ] }));
  // porch roof (shed) under the main eave
  const proofY0 = FL + 2.47, pTan = Math.tan(C.porchPitch), pCos = Math.cos(C.porchPitch), pSin = Math.sin(C.porchPitch);
  const porchRoofZ0 = C.zw + r, porchRoofZ1 = 5.02;
  const pPlace = (geo, u, v, wOff, pre) => {
    if (pre) geo.applyMatrix4(pre);
    const X = new THREE.Vector3(1, 0, 0), N = new THREE.Vector3(0, pCos, pSin), D = new THREE.Vector3(0, -pSin, pCos);
    const m = new THREE.Matrix4().makeBasis(X, N, D);
    m.setPosition(u, proofY0 - v * pSin + wOff * pCos, porchRoofZ0 + v * pCos + wOff * pSin);
    geo.applyMatrix4(m);
    return geo;
  };
  const pLen = (porchRoofZ1 - porchRoofZ0) / pCos;
  b.add('wood', pPlace(box(C.xw * 2 + 0.5, 0.03, pLen, { color: tint('#b9a68c', 0.04) }), 0, pLen / 2, 0));
  {
    const expo = 0.16, slen = 0.42;
    for (let j = 0; ; j++) {
      const vButt = pLen + 0.04 - j * expo;
      if (vButt < 0.08) break;
      const vc = Math.max(vButt - slen / 2, slen / 2 - 0.05);
      let x = -C.xw - 0.27 + rng.range(0, 0.18);
      while (x < C.xw + 0.27) {
        const sw = rng.range(0.13, 0.27);
        const xa = x, xb = Math.min(x + sw, C.xw + 0.27);
        x += sw + rng.range(0.006, 0.012);
        if (xb - xa < 0.06) continue;
        const c = tint('#b3a594', 0.1).multiplyScalar(rng.chance(0.1) ? 0.72 : 1);
        const g = box(xb - xa, 0.018, slen, { color: c, uv: [rng.range(0, 1.6), rng.range(0, 0.8)] });
        b.add('shingle', pPlace(g, (xa + xb) / 2, vc, 0.03, makeMatrix([0, 0, 0], [rng.range(0.05, 0.08), rng.range(-0.02, 0.02), 0])));
      }
    }
  }
  b.add('wood', box(C.xw * 2 + 0.5, 0.16, 0.035, { color: tint('#9e8a70'), at: [0, proofY0 - pLen * pSin - 0.07, porchRoofZ1 + 0.02] }));
  for (const xs of [-1, 1]) b.add('wood', pPlace(box(0.035, 0.17, pLen + 0.02, { color: tint('#9e8a70') }), xs * (C.xw + 0.27), pLen / 2, -0.03));
  for (let x = -C.xw; x <= C.xw + 0.01; x += 0.6) b.add('wood', pPlace(box(0.065, 0.12, pLen - 0.05, { color: tint('#a28d72') }), x, pLen / 2, -0.08));
  b.add('metal', box(C.xw * 2 + 0.5, 0.012, 0.16, { color: lin('#3e3a36'), at: [0, proofY0 + 0.035, porchRoofZ0 + 0.04], rot: [C.porchPitch, 0, 0] }));

  // railings (gap for the steps in the middle)
  const railSpans = [[-C.xw, -0.78, 'x'], [0.78, C.xw, 'x']];
  const railY = PFL + 0.88, botY = PFL + 0.14;
  const addRail = (a0, a1, axis, fixed) => {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    for (const [yy, rr] of [[railY, 0.045], [botY, 0.038]]) {
      const g = logGeo(rng, len, rr, { seg: 8, bow: 0.01, taper: 0.04, color: logColor(), capColor: capColor(), caps: true, noiseAmt: 0.05 });
      const m = axis === 'x' ? makeMatrix([mid, yy, fixed], [0, 0, 0]) : makeMatrix([fixed, yy, mid], [0, -Math.PI / 2, 0]);
      g.side.applyMatrix4(m);
      b.add('wood', g.side);
      if (g.caps) { g.caps.applyMatrix4(m); b.add('end', g.caps); }
    }
    for (let a = a0 + 0.12; a < a1 - 0.06; a += rng.range(0.12, 0.15)) {
      const h = railY - botY;
      const g = logGeo(rng, h + 0.02, rng.range(0.018, 0.026), { seg: 6, rings: 2, bow: 0.03, taper: 0.1, color: tint('#cbb69c', 0.12), caps: false, noiseAmt: 0.08 });
      const p = axis === 'x' ? [a, (railY + botY) / 2, fixed] : [fixed, (railY + botY) / 2, a];
      g.side.applyMatrix4(makeMatrix(p, [rng.range(-0.04, 0.04), rng.range(0, TAU), Math.PI / 2 + rng.range(-0.04, 0.04)]));
      b.add('wood', g.side);
    }
  };
  for (const [a0, a1, ax] of railSpans) addRail(a0 + 0.05, a1, ax, C.postZ);
  addRail(pz0 + 0.1, C.postZ - 0.05, 'z', -C.xw);
  addRail(pz0 + 0.1, C.postZ - 0.05, 'z', C.xw);

  // steps down to the path
  const stepGround = World.heightAt(0, pz1 + 0.75);
  const rise = PFL - stepGround;
  const nSteps = Math.max(2, Math.round(rise / 0.19));
  const sr = rise / nSteps;
  for (let i = 1; i < nSteps; i++) {
    const ty = PFL - i * sr, z0 = pz1 + (i - 1) * 0.29;
    for (const dz of [0.07, 0.215]) b.add('wood', box(1.5, 0.04, 0.135, { color: tint('#c8b294', 0.08), at: [0, ty - 0.02, z0 + dz] }));
  }
  {
    const run = (nSteps - 1) * 0.29 + 0.15;
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    for (const xs of [-1, 1]) {
      const g = box(0.05, 0.22, len, { color: tint('#a8927a') });
      g.applyMatrix4(makeMatrix([xs * 0.75, PFL - 0.12 - rise / 2, pz1 + run / 2], [ang, 0, 0]));
      b.add('wood', g);
    }
  }
  out.stepsEnd = new THREE.Vector3(0, stepGround, pz1 + (nSteps - 1) * 0.29 + 0.2);

  // ── openings: windows and door ──
  const glassParts = [];
  for (const o of openings) {
    const w = walls[o.wall];
    const width = o.a1 - o.a0, height = o.y1 - o.y0, ac = (o.a0 + o.a1) / 2;
    const yc = FL + (o.y0 + o.y1) / 2, ybot = FL + o.y0, ytop = FL + o.y1;
    const face = r + 0.01;
    const trimC = () => tint('#bca78b', 0.06);
    // jambs lining the opening
    b.add('wood', onWall(vbox(0.05, height, 0.3, trimC()), w, o.a0 + 0.025, yc, 0));
    b.add('wood', onWall(vbox(0.05, height, 0.3, trimC()), w, o.a1 - 0.025, yc, 0));
    b.add('wood', onWall(hbox(width, 0.05, 0.3, trimC()), w, ac, ytop - 0.025, 0));
    // exterior casing
    b.add('wood', onWall(vbox(0.11, height + 0.12, 0.035, trimC()), w, o.a0 - 0.035, yc + 0.03, face));
    b.add('wood', onWall(vbox(0.11, height + 0.12, 0.035, trimC()), w, o.a1 + 0.035, yc + 0.03, face));
    b.add('wood', onWall(hbox(width + 0.3, 0.13, 0.04, trimC()), w, ac, ytop + 0.07, face + 0.005));
    if (o.kind === 'window') {
      b.add('wood', onWall(hbox(width, 0.05, 0.3, trimC()), w, ac, ybot + 0.025, 0));
      b.add('wood', onWall(hbox(width + 0.26, 0.05, 0.24, trimC()), w, ac, ybot - 0.01, face - 0.02, makeMatrix([0, 0, 0], [0.12, 0, 0])));
      // sash and muntins
      const so = 0.03, sc = () => tint('#d9ccb6', 0.04);
      b.add('paint', onWall(vbox(0.06, height - 0.1, 0.05, sc()), w, o.a0 + 0.08, yc, so));
      b.add('paint', onWall(vbox(0.06, height - 0.1, 0.05, sc()), w, o.a1 - 0.08, yc, so));
      b.add('paint', onWall(hbox(width - 0.1, 0.07, 0.05, sc()), w, ac, ytop - 0.085, so));
      b.add('paint', onWall(hbox(width - 0.1, 0.07, 0.05, sc()), w, ac, ybot + 0.085, so));
      const gw = width - 0.22, gh = height - 0.24;
      for (let i = 1; i < o.cols; i++) b.add('paint', onWall(vbox(0.025, gh, 0.035, sc()), w, o.a0 + 0.11 + (gw * i) / o.cols, yc, so + 0.005));
      for (let i = 1; i < o.rows; i++) b.add('paint', onWall(hbox(gw, 0.025, 0.035, sc()), w, ac, ybot + 0.12 + (gh * i) / o.rows, so + 0.005));
      // glass with interior
      const g = new THREE.PlaneGeometry(gw + 0.02, gh + 0.02);
      const n = g.attributes.position.count;
      const R = alongDir(w), N = new THREE.Vector3(...w.n);
      const seed = rng();
      g.setAttribute('aWinR', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [R.x, R.y, R.z]), 3));
      g.setAttribute('aWinN', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [N.x, N.y, N.z]), 3));
      g.setAttribute('aWinUV', new THREE.Float32BufferAttribute(g.attributes.uv.array.slice(), 2));
      g.setAttribute('aWinS', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [gw, gh, o.y0 + 0.12, seed]), 4));
      setColor(g, 0xffffff);
      glassParts.push(onWall(g, w, ac, yc, so - 0.012));
      if (o.shutters) {
        const sw = width / 2 + 0.05, sh = height + 0.04;
        const paintC = () => tint('#7a8b70', 0.05);
        for (const side of [-1, 1]) {
          const sa = side < 0 ? o.a0 - 0.1 - sw / 2 : o.a1 + 0.1 + sw / 2;
          const so2 = face + 0.045;
          const ajar = makeMatrix([0, 0, 0], [0, side * 0.08, 0]);
          for (let i = 0; i < 3; i++) {
            const bwid = sw / 3 - 0.006;
            const bb = vbox(bwid, sh, 0.028, paintC());
            bb.translate(-sw / 2 + bwid / 2 + i * (sw / 3), 0, 0);
            bb.applyMatrix4(ajar);
            b.add('paint', onWall(bb, w, sa, yc, so2));
          }
          for (const yy of [-sh * 0.36, sh * 0.36]) {
            const bt = hbox(sw - 0.04, 0.09, 0.025, paintC());
            bt.translate(0, yy, 0.026);
            bt.applyMatrix4(ajar);
            b.add('paint', onWall(bt, w, sa, yc, so2));
          }
          const diag = hbox(Math.hypot(sw - 0.1, sh * 0.72 - 0.1), 0.075, 0.025, paintC());
          diag.applyMatrix4(makeMatrix([0, 0, 0.026], [0, 0, side * Math.atan2(sh * 0.72 - 0.1, sw - 0.1)]));
          diag.applyMatrix4(ajar);
          b.add('paint', onWall(diag, w, sa, yc, so2));
          for (const yy of [-sh * 0.36, sh * 0.36]) {
            const hg = hbox(0.16, 0.03, 0.008, lin('#2a2624'));
            hg.translate(side < 0 ? sw / 2 - 0.08 : -sw / 2 + 0.08, yy, 0.042);
            hg.applyMatrix4(ajar);
            b.add('metal', onWall(hg, w, sa, yc, so2));
          }
        }
      }
      if (o.box) {
        const bwid = width + 0.12, by = ybot - 0.2;
        const bc = () => tint('#6d7c64', 0.04);
        b.add('paint', onWall(hbox(bwid, 0.18, 0.025, bc()), w, ac, by, face + 0.2));
        b.add('paint', onWall(hbox(bwid, 0.025, 0.2, bc()), w, ac, by - 0.09, face + 0.1));
        for (const s2 of [-1, 1]) b.add('paint', onWall(hbox(0.025, 0.18, 0.2, bc()), w, ac + s2 * bwid / 2, by, face + 0.1));
        for (let i = 0; i < 2; i++) b.add('metal', onWall(vbox(0.03, 0.22, 0.02, lin('#2a2624')), w, ac + (i ? 0.4 : -0.4), by - 0.1, face + 0.03));
        b.add('mortar', onWall(hbox(bwid - 0.04, 0.02, 0.17, lin('#2a1d14')), w, ac, by + 0.06, face + 0.1));
        const flowers = [['flower', 0], ['flower', 1], ['tuft', 0], ['flower', 0], ['flower', 1], ['flower', 2], ['tuft', 0]];
        for (let i = 0; i < 8; i++) {
          const [kind, cell] = flowers[i % flowers.length];
          const card = crossCard(kind, cell, rng.range(0.24, 0.34), rng.range(0.24, 0.32), rng);
          card.applyMatrix4(makeMatrix([0, 0, 0], [0, rng.range(0, TAU), 0]));
          b.add('plant', onWall(card, w, ac - bwid / 2 + 0.08 + (i / 7) * (bwid - 0.16), by + 0.06, face + 0.1 + rng.range(-0.03, 0.03)));
        }
      }
    } else {
      // door: vertical planks, Z brace, iron straps, ring handle
      const dz = 0.07;
      b.add('wood', onWall(hbox(width + 0.12, 0.04, 0.34, trimC()), w, ac, FL - 0.02, 0.02));
      const boards = 5, bwid = (width - 0.04) / boards;
      for (let i = 0; i < boards; i++) {
        b.add('wood', onWall(vbox(bwid - 0.006, height - 0.03, 0.045, tint('#8c6c50', 0.08)), w, o.a0 + 0.02 + bwid * (i + 0.5), yc - 0.01, dz));
      }
      for (const yy of [ybot + 0.38, ytop - 0.4]) b.add('wood', onWall(hbox(width - 0.1, 0.13, 0.03, tint('#7e624a', 0.05)), w, ac, yy, dz + 0.037));
      const dh = ytop - 0.4 - (ybot + 0.38);
      const diag = hbox(Math.hypot(width - 0.22, dh), 0.11, 0.03, tint('#7e624a', 0.05));
      b.add('wood', onWall(diag, w, ac, (ybot + ytop - 0.02) / 2, dz + 0.037, makeMatrix([0, 0, 0], [0, 0, Math.atan2(dh, width - 0.22)])));
      for (const yy of [ybot + 0.38, ytop - 0.4]) {
        b.add('metal', onWall(hbox(0.58, 0.05, 0.01, lin('#2b2725')), w, o.a0 + 0.3, yy, dz + 0.058));
        b.add('metal', onWall(cylinder(0.035, 0.035, 0.01, { seg: 10, color: lin('#2b2725') }), w, o.a0 + 0.58, yy, dz + 0.058, makeMatrix([0, 0, 0], [Math.PI / 2, 0, 0])));
      }
      const ring = new THREE.TorusGeometry(0.05, 0.008, 6, 16);
      setColor(ring, lin('#2b2725'));
      b.add('metal', onWall(ring, w, o.a1 - 0.17, FL + 1.0, dz + 0.07));
      b.add('metal', onWall(hbox(0.05, 0.09, 0.012, lin('#2b2725')), w, o.a1 - 0.17, FL + 1.06, dz + 0.06));
      // warm light leaking around the closed door
      b.add('glow', onWall(vbox(0.012, height - 0.05, 0.01, 0xffffff), w, o.a0 + 0.012, yc, dz - 0.03));
      b.add('glow', onWall(vbox(0.012, height - 0.05, 0.01, 0xffffff), w, o.a1 - 0.012, yc, dz - 0.03));
      b.add('glow', onWall(hbox(width - 0.04, 0.008, 0.01, 0xffffff), w, ac, FL + 0.01, dz - 0.03));
      // autumn wreath
      const wy = FL + 1.52;
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * TAU + rng.range(-0.05, 0.05);
        const cell = rng.pick([0, 1, 2, 3, 4, 6]);
        const card = flatCard('leaf', cell, rng.range(0.1, 0.14), rng);
        card.applyMatrix4(makeMatrix([0, 0, 0], [rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), a - Math.PI / 2 + rng.range(-0.5, 0.5)]));
        card.translate(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.02 + rng.range(0, 0.02));
        b.add('leaf', onWall(card, w, ac, wy, dz + 0.06));
      }
      out.doorPos = new THREE.Vector3(...wp(w, ac, FL + 1.0, dz + 0.1));
    }
  }

  // ── porch props ──
  addRockingChair(b, rng, [-1.85, PFL, 3.72], 0.42);
  // side table with a mug
  {
    const tx = -1.1, tz = 3.5;
    b.add('wood', cylinder(0.21, 0.21, 0.04, { seg: 16, color: tint('#a88b6d'), at: [tx, PFL + 0.56, tz] }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.3;
      const g = logGeo(rng, 0.56, 0.022, { seg: 6, rings: 2, color: tint('#9c8064'), caps: false });
      g.side.applyMatrix4(makeMatrix([tx + Math.cos(a) * 0.12, PFL + 0.28, tz + Math.sin(a) * 0.12], [Math.cos(a) * 0.12, 0, Math.PI / 2 + Math.sin(a) * 0.12]));
      b.add('wood', g.side);
    }
    const mug = cylinder(0.042, 0.038, 0.1, { seg: 14, open: true, color: lin('#8a3b2a'), at: [tx - 0.04, PFL + 0.63, tz + 0.02] });
    b.add('ceramic', mug);
    b.add('ceramic', cylinder(0.036, 0.036, 0.005, { seg: 14, color: lin('#2a160c'), at: [tx - 0.04, PFL + 0.665, tz + 0.02] }));
    const handle = new THREE.TorusGeometry(0.028, 0.008, 6, 12, Math.PI);
    setColor(handle, lin('#8a3b2a'));
    handle.applyMatrix4(makeMatrix([tx + 0.005, PFL + 0.63, tz + 0.02], [0, 0, -Math.PI / 2]));
    b.add('ceramic', handle);
    out.emitters.mug = new THREE.Vector3(tx - 0.04, PFL + 0.69, tz + 0.02);
    b.add('matte', box(0.16, 0.035, 0.22, { color: lin('#6e3a2a'), at: [tx + 0.08, PFL + 0.6, tz - 0.04], rot: [0, 0.4, 0] }));
    b.add('matte', box(0.15, 0.03, 0.21, { color: lin('#e6ddcc'), at: [tx + 0.08, PFL + 0.602, tz - 0.04], rot: [0, 0.4, 0] }));
  }
  // bench under the right window with a folded blanket
  {
    const bx = 2.1, bz = C.zw + r + 0.28;
    b.add('wood', box(1.25, 0.05, 0.34, { color: tint('#a88b6d'), at: [bx, PFL + 0.45, bz] }));
    for (const dx of [-0.52, 0.52]) b.add('wood', box(0.06, 0.43, 0.3, { color: tint('#9c8064'), at: [bx + dx, PFL + 0.215, bz] }));
    const blanket = box(0.42, 0.09, 0.3, { color: 0xffffff, at: [bx + 0.25, PFL + 0.52, bz] });
    remapUV(blanket, CLOTH_UV.plaid);
    b.add('cloth', blanket);
  }
  // pumpkins on the steps and by the door, a basket of apples, boots and a broom
  const pumpkinSpots = [[-0.55, 0.12, 0.3, '#d9772c'], [0.6, 0.4, 0.22, '#c86a2a'], [-0.5, 0.7, 0.18, '#dcc49a'], [-0.85, -0.25, 0.26, '#d07a30'], [0.95, -0.2, 0.2, '#e08a3a']];
  pumpkinSpots.forEach(([x, dz, size, col], i) => {
    const z = pz1 + dz;
    let y = PFL;
    if (dz > 0) {
      const si = Math.min(nSteps - 1, Math.max(1, Math.floor(dz / 0.29) + 1));
      y = PFL - si * sr;
    }
    addPumpkin(b, rng, [x, y, z], size, col, i);
  });
  {
    const ax = 2.85, az = 3.55;
    const basket = cylinder(0.2, 0.16, 0.2, { seg: 16, open: true, color: tint('#b08d5a'), at: [ax, PFL + 0.1, az] });
    b.add('wood', basket);
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * 0.12;
      const apple = new THREE.SphereGeometry(0.045, 7, 5);
      setColor(apple, lin(rng.pick(['#9a2a22', '#b23a26', '#8a3a1e', '#a8442a'])));
      apple.translate(ax + Math.cos(a) * rr, PFL + 0.19 + rng.range(0, 0.04), az + Math.sin(a) * rr);
      b.add('pumpkin', apple);
    }
  }
  for (const dx of [0.72, 0.86]) {
    const boot = box(0.1, 0.3, 0.12, { color: tint('#3a2a20'), at: [dx, PFL + 0.15, 2.98] });
    const toe = box(0.1, 0.09, 0.14, { color: tint('#33251c'), at: [dx, PFL + 0.045, 3.1] });
    b.add('matte', boot);
    b.add('matte', toe);
  }
  // hanging lantern by the steps
  {
    const lx = 0.82, lz = C.postZ - 0.02, ly = FL + 1.62;
    b.add('metal', cylinder(0.006, 0.006, postTop - ly - 0.1, { seg: 5, color: lin('#2b2725'), at: [lx, (postTop + ly + 0.1) / 2, lz] }));
    b.add('metal', box(0.15, 0.02, 0.15, { color: lin('#2b2725'), at: [lx, ly - 0.11, lz] }));
    for (const [dx, dz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('metal', box(0.012, 0.22, 0.012, { color: lin('#2b2725'), at: [lx + dx * 0.065, ly, lz + dz2 * 0.065] }));
    b.add('metal', cylinder(0.01, 0.11, 0.08, { seg: 4, color: lin('#2b2725'), at: [lx, ly + 0.15, lz], rot: [0, Math.PI / 4, 0] }));
    b.add('lanternGlow', cylinder(0.045, 0.05, 0.16, { seg: 12, color: 0xffffff, at: [lx, ly - 0.01, lz] }));
    out.lights.lantern = new THREE.Vector3(lx, ly, lz);
  }

  const group = b.build(M, { extras: { plant: { aWind: 3 }, leaf: { aWind: 3 } }, noShadow: ['glow', 'lanternGlow'] });
  const glassGeo = mergeGeometries(glassParts, { aWinR: 3, aWinN: 3, aWinUV: 2, aWinS: 4 });
  const glass = new THREE.Mesh(glassGeo, M.glass);
  glass.name = 'cabin:glass';
  glass.receiveShadow = true;
  group.add(glass);
  group.traverse((o) => { if (o.isMesh && (o.material === M.glow || o.material === M.lanternGlow)) { o.castShadow = false; o.receiveShadow = false; } });
  out.group = group;
  out.FL = FL;
  out.PFL = PFL;

  // ground contact shading under the cabin and porch
  World.addAORect(0, 0, C.xw + 0.2, C.zw + 0.2, 1.6, 0.75);
  World.addAORect(0, (pz0 + pz1) / 2 + 0.1, C.xw + 0.2, (pz1 - pz0) / 2, 0.9, 0.55);
  World.addAO((ch.x0 + ch.x1) / 2, 0, 1.4, 0.6);
  return out;
}

// Remap a geometry's 0..1 UVs (from its box faces) into an atlas rectangle [u0, v0, u1, v1].
function remapUV(geo, rect) {
  const uv = geo.attributes.uv.array;
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (let i = 0; i < uv.length; i += 2) { minU = Math.min(minU, uv[i]); maxU = Math.max(maxU, uv[i]); minV = Math.min(minV, uv[i + 1]); maxV = Math.max(maxV, uv[i + 1]); }
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] = rect[0] + ((uv[i] - minU) / (maxU - minU || 1)) * (rect[2] - rect[0]);
    uv[i + 1] = rect[1] + ((uv[i + 1] - minV) / (maxV - minV || 1)) * (rect[3] - rect[1]);
  }
  return geo;
}

// A single alpha card showing one atlas cell, standing on its bottom edge (for leaves, flowers, tufts).
function flatCard(kind, cell, size, rng, aspect = 1) {
  const [u0, v0, u1, v1] = atlasUV(kind, cell);
  const g = new THREE.PlaneGeometry(size * aspect, size);
  const uv = g.attributes.uv.array;
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] = lerp(u0, u1, uv[i]);
    uv[i + 1] = lerp(v1, v0, uv[i + 1]);
  }
  setColor(g, lin('#ffffff').multiplyScalar(rng ? rng.range(0.85, 1.05) : 1));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(0).flatMap((_, i) => [g.attributes.position.array[i * 3 + 1] > 0 ? 1 : 0.2, 0.5, rng ? rng() : 0.5]), 3));
  return g;
}

// Two crossed cards rooted at y = 0 (small plants).
function crossCard(kind, cell, w, h, rng) {
  const parts = [];
  for (let i = 0; i < 2; i++) {
    const g = flatCard(kind, cell, h, rng, w / h);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position.array, wa = g.attributes.aWind.array;
    for (let k = 0; k < p.length / 3; k++) wa[k * 3] = clamp(p[k * 3 + 1] / h, 0, 1);
    g.rotateY(i * Math.PI / 2);
    parts.push(g);
  }
  return mergeGeometries(parts, { aWind: 3 });
}

function addPumpkin(b, rng, pos, size, colHex, seed) {
  const g = new THREE.SphereGeometry(size / 2, 16, 9);
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const a = Math.atan2(z, x);
    const rib = 1 - 0.07 * Math.pow(Math.abs(Math.sin(a * 5 + seed)), 0.6);
    const top = y > 0 ? 1 - 0.18 * Math.pow(Math.max(0, 1 - Math.hypot(x, z) / (size / 2)), 2) : 1;
    p[i] = x * rib;
    p[i + 2] = z * rib;
    p[i + 1] = y * 0.72 * top;
  }
  g.computeVertexNormals();
  setColor(g, lin(colHex).multiplyScalar(rng.range(0.9, 1.08)));
  shade(g, (x, y) => 0.75 + 0.25 * clamp(y / (size * 0.36) + 0.6, 0, 1));
  g.translate(pos[0], pos[1] + size * 0.36, pos[2]);
  b.add('pumpkin', g);
  const stem = cylinder(size * 0.05, size * 0.07, size * 0.22, { seg: 6, color: lin('#4a4026'), at: [pos[0], pos[1] + size * 0.72 + size * 0.05, pos[2]], rot: [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)] });
  b.add('wood', stem);
}

function addRockingChair(b, rng, [x, y, z], yaw) {
  const parts = [];
  const col = () => lin('#a07e5e').multiplyScalar(rng.range(0.9, 1.05));
  const m = makeMatrix([x, y, z], [0, yaw, 0]);
  for (const sx of [-0.24, 0.24]) {
    const pts = [], rad = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10 - 0.5;
      pts.push([sx, 0.03 + t * t * 0.42, t * 0.95]);
      rad.push(0.022);
    }
    parts.push(['wood', tubeGeo(pts, rad, { seg: 6, color: col() })]);
    // legs
    parts.push(['wood', box(0.045, 0.42, 0.045, { color: col(), at: [sx, 0.24, 0.2] })]);
    const back = box(0.045, 1.0, 0.045, { color: col() });
    back.applyMatrix4(makeMatrix([sx, 0.52, -0.25], [-0.2, 0, 0]));
    parts.push(['wood', back]);
    parts.push(['wood', box(0.05, 0.035, 0.5, { color: col(), at: [sx, 0.66, -0.02] })]);
    parts.push(['wood', box(0.035, 0.22, 0.035, { color: col(), at: [sx, 0.55, 0.2] })]);
  }
  for (let i = 0; i < 5; i++) parts.push(['wood', box(0.5, 0.025, 0.075, { color: col(), at: [0, 0.43, 0.18 - i * 0.088] })]);
  const top = box(0.52, 0.09, 0.03, { color: col() });
  top.applyMatrix4(makeMatrix([0, 0.98, -0.34], [-0.2, 0, 0]));
  parts.push(['wood', top]);
  for (let i = 0; i < 5; i++) {
    const s = box(0.035, 0.5, 0.02, { color: col() });
    s.applyMatrix4(makeMatrix([-0.16 + i * 0.08, 0.72, -0.29], [-0.2, 0, 0]));
    parts.push(['wood', s]);
  }
  const cushion = box(0.44, 0.05, 0.42, { color: 0xffffff, at: [0, 0.47, 0.0] });
  remapUV(cushion, CLOTH_UV.plaid);
  parts.push(['cloth', cushion]);
  for (const [k, g] of parts) {
    g.applyMatrix4(m);
    b.add(k, g);
  }
}
