/* Yard: woodpile under a lean-to, chopping block, rain barrel, clothesline with laundry, kitchen garden
   with scarecrow and corn shocks, fire pit with stump seats, stone well, mailbox, path fence,
   plank footbridge over the creek and stepping stones. */

function yardMaterials(T, M) {
  M.bark = patchMaterial(new THREE.MeshStandardMaterial({ map: T.barkMap, normalMap: T.barkNormal, vertexColors: true, roughness: 0.95, envMapIntensity: 0.3 }), { moss: 0.35 });
  Sky.registerEnv(M.bark);
  const laundryOpts = { wind: 'cloth', foliage: true, foliageTrans: 0.75, foliageWrap: 0.45 };
  M.laundry = patchMaterial(new THREE.MeshLambertMaterial({ map: T.cloth, vertexColors: true, side: THREE.DoubleSide }), laundryOpts);
  M.laundry.userData.depthMaterial = makeDepthMaterial(laundryOpts);
  return M;
}

// Prism with a convex cross-section (y, z) extruded along X; faces tagged as bark (arc) or split (flat).
function firewoodPiece(rng, len, R, kind) {
  const poly = [];
  const arcSegs = 7;
  if (kind === 'round') {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; poly.push([Math.cos(a) * R, Math.sin(a) * R, true]); }
  } else if (kind === 'half') {
    for (let i = 0; i <= arcSegs; i++) { const a = (i / arcSegs) * Math.PI; poly.push([Math.cos(a) * R, Math.sin(a) * R, i < arcSegs]); }
  } else {
    poly.push([0, 0, false]);
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); poly.push([Math.cos(a) * R, Math.sin(a) * R, i < 4]); }
  }
  const parts = { bark: [], split: [], end: [] };
  const n = poly.length;
  let cy = 0, cz = 0;
  for (const p of poly) { cy += p[0]; cz += p[1]; }
  cy /= n; cz /= n;
  const x0 = -len / 2, x1 = len / 2;
  const jitter = () => rng.range(-0.004, 0.004);
  for (let i = 0; i < n; i++) {
    const a = poly[i], bb = poly[(i + 1) % n];
    const isBark = a[2] && kind !== 'quarter' ? true : a[2];
    const g = new THREE.BufferGeometry();
    const ny = bb[1] - a[1], nz = -(bb[0] - a[0]);
    const nl = Math.hypot(ny, nz) || 1;
    const el = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, a[0], a[1], x1, a[0] + jitter(), a[1], x1, bb[0], bb[1] + jitter(), x0, bb[0], bb[1]], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, ny / nl, nz / nl, 0, ny / nl, nz / nl, 0, ny / nl, nz / nl, 0, ny / nl, nz / nl], 3));
    const v0 = rng.range(0, 1);
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, v0, len, v0, len, v0 + el, 0, v0 + el], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    parts[isBark ? 'bark' : 'split'].push(g);
  }
  const cell = [Math.floor(rng() * 2) * 0.5, Math.floor(rng() * 2) * 0.5];
  for (const [x, sgn] of [[x0, -1], [x1, 1]]) {
    const pos = [x, cy, cz], nor = [sgn, 0, 0], uv = [cell[0] + 0.25 + (cy / R) * 0.235, cell[1] + 0.25 + (cz / R) * 0.235], idx = [];
    for (const p of poly) {
      pos.push(x, p[0], p[1]);
      nor.push(sgn, 0, 0);
      uv.push(cell[0] + 0.25 + (p[0] / R) * 0.235 * 0.97, cell[1] + 0.25 + (p[1] / R) * 0.235 * 0.97);
    }
    for (let i = 0; i < n; i++) {
      const a = 1 + i, bb = 1 + ((i + 1) % n);
      if (sgn > 0) idx.push(0, a, bb); else idx.push(0, bb, a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    parts.end.push(g);
  }
  return parts;
}

function buildYard(T, M, cabin) {
  const rng = makeRng('yard');
  const b = new Batch('yard');
  const C = CABIN;
  const out = { emitters: {}, colliders: [] };
  const gy = (x, z) => World.heightAt(x, z);
  const tint = (hex, j = 0.08) => {
    const c = lin(hex).multiplyScalar(rng.range(1 - j, 1 + j));
    c.offsetHSL(rng.range(-0.008, 0.008), rng.range(-0.03, 0.03), 0);
    return c;
  };
  const addPiece = (parts, m, colors) => {
    for (const key of ['bark', 'split', 'end']) {
      if (!parts[key].length) continue;
      const g = mergeGeometries(parts[key].map((p) => { setColor(p, colors[key]); return p; }));
      g.applyMatrix4(m);
      b.add(key === 'split' ? 'wood' : key, g);
    }
  };
  const fresh = () => ({ bark: tint('#c4a888', 0.1), split: tint('#f0dcc0', 0.08), end: tint('#f3e2c8', 0.08) });

  // ── woodpile under a lean-to against the left wall ──
  {
    const wallX = -C.xw - C.logR - 0.04;
    const z0 = -2.45, z1 = -0.18;
    const groundY = Math.min(gy(wallX - 0.5, z0), gy(wallX - 0.5, z1));
    for (const xr of [wallX - 0.24, wallX - 0.72]) {
      for (const zz of [z0 + 0.15, z1 - 0.15]) {
        const s = logGeo(rng, 0.95, 0.06, { seg: 6, color: tint('#8f7a62'), caps: true, capColor: tint('#a89276') });
        s.side.applyMatrix4(makeMatrix([wallX - 0.48, groundY + 0.05, zz], [0, 0, 0]));
        b.add('bark', s.side);
        if (s.caps) { s.caps.applyMatrix4(makeMatrix([wallX - 0.48, groundY + 0.05, zz], [0, 0, 0])); b.add('end', s.caps); }
      }
      for (let z = z0 + 0.08; z < z1 - 0.05; z += 0.165) {
        const capH = 1.42 + 0.18 * Math.sin(z * 2.3 + xr) + rng.range(-0.08, 0.08) - (xr < wallX - 0.5 ? 0.18 : 0);
        let y = groundY + 0.15;
        while (y < groundY + capH) {
          const R = rng.range(0.065, 0.095);
          const kind = rng.pick(['quarter', 'quarter', 'half', 'half', 'round']);
          const len = rng.range(0.38, 0.46);
          const parts = firewoodPiece(rng, len, R, kind);
          const m = makeMatrix([xr + rng.range(-0.03, 0.03), y + R * 0.75, z + rng.range(-0.025, 0.025)], [rng.range(0, TAU), rng.range(-0.08, 0.08), rng.range(-0.04, 0.04)]);
          addPiece(parts, m, fresh());
          y += R * rng.range(1.35, 1.6);
        }
      }
    }
    // lean-to roof on three posts
    const outerX = wallX - 1.2;
    const yIn = C.FL + 2.12, yOut = C.FL + 1.66;
    for (const zz of [z0 - 0.12, (z0 + z1) / 2, z1 + 0.12]) {
      const g0 = gy(outerX, zz) - 0.05;
      const pg = logGeo(rng, yOut - g0, 0.055, { seg: 8, color: tint('#cbb69c'), caps: false });
      pg.side.applyMatrix4(makeMatrix([outerX, (yOut + g0) / 2, zz], [0, 0, Math.PI / 2]));
      b.add('wood', pg.side);
    }
    b.add('wood', box(0.1, 0.12, z1 - z0 + 0.5, { color: tint('#b9a284'), at: [outerX, yOut + 0.04, (z0 + z1) / 2] }));
    const run = wallX - outerX + 0.35, drop = yIn - yOut;
    const ang = Math.atan2(drop, run);
    for (let z = z0 - 0.3; z < z1 + 0.3; z += 0.21) {
      const g = box(Math.hypot(run, drop) + 0.12, 0.03, 0.2, { color: tint('#a99a88', 0.1), uv: [rng.range(0, 1.6), rng.range(0, 0.8)] });
      g.applyMatrix4(makeMatrix([wallX - run / 2 + 0.12, (yIn + yOut) / 2 + 0.12 - 0.05, z + 0.1], [0, 0, ang]));
      b.add('shingle', g);
    }
    for (const zz of [z0 - 0.05, z1 + 0.05]) {
      const g = box(Math.hypot(run, drop) + 0.12, 0.05, 0.06, { color: tint('#9a8670') });
      g.applyMatrix4(makeMatrix([wallX - run / 2 + 0.12, (yIn + yOut) / 2 + 0.16, zz], [0, 0, ang]));
      b.add('wood', g);
    }
    World.addAORect(wallX - 0.5, (z0 + z1) / 2, 0.55, (z1 - z0) / 2, 0.8, 0.6);
    out.colliders.push({ x: wallX - 0.6, z: (z0 + z1) / 2, r: 1.4 });
  }

  // ── chopping block with an axe, chips and a few split pieces ──
  {
    const cx = -5.9, cz = 2.5, g0 = gy(cx, cz);
    const stump = logGeo(rng, 0.5, 0.27, { seg: 14, bow: 0, taper: -0.06, color: tint('#b39a7e'), capColor: tint('#e6cfae'), caps: 'end', noiseAmt: 0.05 });
    const m = makeMatrix([cx, g0 + 0.22, cz], [0, 0, Math.PI / 2]);
    stump.side.applyMatrix4(m);
    stump.caps.applyMatrix4(m);
    b.add('bark', stump.side);
    b.add('end', stump.caps);
    const top = g0 + 0.47;
    const handle = logGeo(rng, 0.74, 0.017, { seg: 6, color: tint('#d9b88c'), caps: false, taper: -0.15 });
    const hm = makeMatrix([cx + 0.2, top + 0.27, cz + 0.05], [0, 0.4, Math.PI / 2 - 0.62]);
    handle.side.applyMatrix4(hm);
    b.add('wood', handle.side);
    const head = box(0.17, 0.1, 0.03, { color: tint('#3a3734') });
    head.applyMatrix4(makeMatrix([cx - 0.02, top + 0.0, cz - 0.02], [0, 0.4, -0.62]));
    b.add('metal', head);
    const bit = box(0.04, 0.14, 0.012, { color: tint('#8a8784') });
    bit.applyMatrix4(makeMatrix([cx - 0.09, top - 0.03, cz - 0.05], [0, 0.4, -0.62]));
    b.add('metal', bit);
    for (let i = 0; i < 40; i++) {
      const a = rng() * TAU, rr = 0.35 + Math.pow(rng(), 0.7) * 1.1;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const s = rng.range(0.025, 0.075);
      b.add('wood', box(s, 0.008, s * rng.range(0.4, 0.8), { color: tint('#efd8b6', 0.1), at: [x, gy(x, z) + 0.006, z], rot: [rng.range(-0.2, 0.2), rng() * TAU, rng.range(-0.2, 0.2)] }));
    }
    for (let i = 0; i < 4; i++) {
      const a = rng() * TAU, rr = rng.range(0.55, 0.9);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const R = rng.range(0.07, 0.09);
      const parts = firewoodPiece(rng, rng.range(0.38, 0.44), R, rng.pick(['quarter', 'half']));
      addPiece(parts, makeMatrix([x, gy(x, z) + R * 0.6, z], [rng() * TAU, rng() * TAU, 0], 1), fresh());
    }
    World.addAO(cx, cz, 0.7, 0.5);
    out.colliders.push({ x: cx, z: cz, r: 0.6 });
    out.choppingBlock = new THREE.Vector3(cx, top, cz);
  }

  // ── rain barrel at the front-left corner ──
  {
    const bx = -C.xw - 0.62, bz = C.zw + 0.42, g0 = gy(bx, bz) - 0.03;
    const h = 0.86;
    const prof = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.29 + 0.04 * Math.sin(Math.PI * t), t * h)); }
    const g = new THREE.LatheGeometry(prof, 18);
    const uv = g.attributes.uv.array;
    for (let i = 0; i < uv.length; i += 2) { const u = uv[i]; uv[i] = uv[i + 1] * h; uv[i + 1] = u * 2.0; }
    setColor(g, tint('#b59b7c'));
    g.translate(bx, g0, bz);
    b.add('wood', g);
    for (const t of [0.13, 0.5, 0.86]) {
      const hoop = new THREE.TorusGeometry(0.29 + 0.04 * Math.sin(Math.PI * t) + 0.006, 0.011, 4, 28);
      hoop.rotateX(Math.PI / 2);
      hoop.translate(bx, g0 + t * h, bz);
      setColor(hoop, tint('#3a3532'));
      b.add('metal', hoop);
    }
    b.add('ceramic', cylinder(0.3, 0.3, 0.01, { seg: 18, color: lin('#0d1314'), at: [bx, g0 + h - 0.06, bz] }));
    World.addAO(bx, bz, 0.6, 0.55);
    out.colliders.push({ x: bx, z: bz, r: 0.45 });
  }

  // ── clothesline with laundry behind the cabin ──
  {
    const p1 = new THREE.Vector3(5.6, 0, -4.7), p2 = new THREE.Vector3(11.6, 0, -2.2);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const lineY = 2.0;
    for (const p of [p1, p2]) {
      const g0 = gy(p.x, p.z) - 0.1;
      p.y = g0;
      const pg = logGeo(rng, lineY + 0.2, 0.055, { seg: 8, color: tint('#c6b297'), caps: 'end', capColor: tint('#b8a68e') });
      const m = makeMatrix([p.x, g0 + (lineY + 0.2) / 2, p.z], [0, 0, Math.PI / 2]);
      pg.side.applyMatrix4(m);
      if (pg.caps) { pg.caps.applyMatrix4(m); b.add('end', pg.caps); }
      b.add('wood', pg.side);
      const bar = box(0.9, 0.07, 0.07, { color: tint('#c6b297') });
      bar.applyMatrix4(makeMatrix([p.x, g0 + lineY, p.z], [0, Math.atan2(-side.z, side.x), 0]));
      b.add('wood', bar);
      World.addAO(p.x, p.z, 0.35, 0.4);
    }
    const ends = [];
    for (const off of [-0.32, 0.32]) {
      const pts = [], rad = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const base = new THREE.Vector3().lerpVectors(p1, p2, t).addScaledVector(side, off);
        const y = lerp(p1.y, p2.y, t) + lineY + 0.025 - 0.2 * 4 * t * (1 - t);
        pts.push([base.x, y, base.z]);
        rad.push(0.006);
      }
      ends.push(pts);
      b.add('matte', tubeGeo(pts, rad, { seg: 4, color: lin('#d8ccb2') }));
    }
    const cloths = [
      { line: 0, t: 0.1, w: 1.5, h: 1.05, uv: CLOTH_UV.linen, color: '#f2ece0' },
      { line: 0, t: 0.42, w: 1.15, h: 0.9, uv: CLOTH_UV.plaid, color: '#ffffff' },
      { line: 0, t: 0.7, w: 0.62, h: 0.78, uv: CLOTH_UV.stripes, color: '#ffffff' },
      { line: 1, t: 0.22, w: 0.95, h: 0.7, uv: CLOTH_UV.quilt, color: '#ffffff' },
      { line: 1, t: 0.6, w: 0.55, h: 0.48, uv: CLOTH_UV.linen, color: '#d9c7a3' },
    ];
    for (const c of cloths) {
      const pts = ends[c.line];
      const g = new THREE.PlaneGeometry(c.w, c.h, 10, 8);
      const pos = g.attributes.position.array, uv = g.attributes.uv.array;
      const wind = [];
      const phase = rng();
      for (let i = 0; i < pos.length / 3; i++) {
        const lx = pos[i * 3], ly = pos[i * 3 + 1];
        const hang = clamp((c.h / 2 - ly) / c.h, 0, 1);
        const t = c.t + (lx + c.w / 2) / len;
        const ti = clamp(t, 0, 1) * 16;
        const k = Math.min(15, Math.floor(ti)), f = ti - k;
        const top = [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f), lerp(pts[k][2], pts[k + 1][2], f)];
        const bulge = Math.sin(hang * Math.PI) * 0.06 * (0.5 + 0.5 * Math.sin((lx / c.w) * 5 + phase * 6));
        pos[i * 3] = top[0] + side.x * bulge;
        pos[i * 3 + 1] = top[1] - hang * c.h - 0.01;
        pos[i * 3 + 2] = top[2] + side.z * bulge;
        uv[i * 2] = lerp(c.uv[0], c.uv[2], uv[i * 2]);
        uv[i * 2 + 1] = lerp(c.uv[1], c.uv[3], uv[i * 2 + 1]);
        wind.push(hang, 0, phase);
      }
      g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
      g.computeVertexNormals();
      setColor(g, lin(c.color));
      b.add('laundry', g);
      for (const q of [0.12, 0.88]) {
        const t = clamp(c.t + (q * c.w) / len, 0, 1) * 16;
        const k = Math.min(15, Math.floor(t)), f = t - k;
        b.add('wood', box(0.015, 0.07, 0.022, { color: tint('#d9c19a'), at: [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f) - 0.02, lerp(pts[k][2], pts[k + 1][2], f)] }));
      }
    }
    out.clothesline = { p1, p2 };
  }

  // ── kitchen garden: picket fence, beds, cabbages, pumpkins, corn shocks, scarecrow ──
  {
    const gx0 = -15.6, gx1 = -8.6, gz0 = -3.2, gz1 = 4.4;
    const fenceC = () => tint('#b9b1a3', 0.1);
    const edges = [[[gx0, gz0], [gx1, gz0]], [[gx1, gz0], [gx1, 0.2]], [[gx1, 1.3], [gx1, gz1]], [[gx1, gz1], [gx0, gz1]], [[gx0, gz1], [gx0, gz0]]];
    for (const [[ax, az], [bx2, bz2]] of edges) {
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const dx = (bx2 - ax) / len, dz = (bz2 - az) / len;
      const yaw = Math.atan2(-dz, dx);
      const np = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= np; i++) {
        const t = (i / np) * len;
        const x = ax + dx * t, z = az + dz * t, g0 = gy(x, z);
        b.add('wood', box(0.09, 1.05, 0.09, { color: fenceC(), at: [x, g0 + 0.47, z], rot: [rng.range(-0.03, 0.03), yaw, rng.range(-0.03, 0.03)] }));
      }
      for (const ry of [0.3, 0.78]) {
        const midx = ax + dx * len / 2, midz = az + dz * len / 2;
        const gm = (gy(ax, az) + gy(bx2, bz2)) / 2;
        const rail = box(len, 0.06, 0.035, { color: fenceC() });
        rail.applyMatrix4(makeMatrix([midx, gm + ry, midz], [0, yaw, 0]));
        rail.translate(-dz * 0.06, 0, dx * 0.06);
        b.add('wood', rail);
      }
      for (let t = 0.06; t < len - 0.04; t += rng.range(0.11, 0.14)) {
        const x = ax + dx * t - dz * 0.09, z = az + dz * t + dx * 0.09, g0 = gy(x, z);
        const h = rng.range(0.82, 0.95);
        const pk = box(0.075, h, 0.02, { color: fenceC() });
        pk.applyMatrix4(makeMatrix([x, g0 + h / 2 - 0.04, z], [rng.range(-0.04, 0.04), yaw, rng.range(-0.05, 0.05)]));
        b.add('wood', pk);
        const tip = box(0.054, 0.054, 0.02, { color: fenceC() });
        tip.applyMatrix4(makeMatrix([x, g0 + h - 0.04, z], [0, yaw, Math.PI / 4]));
        b.add('wood', tip);
      }
    }
    // gate standing open
    {
      const hx = gx1, hz = 0.2, g0 = gy(hx, hz);
      for (let i = 0; i < 6; i++) {
        const pk = box(0.075, 0.9, 0.02, { color: fenceC() });
        pk.applyMatrix4(makeMatrix([hx + 0.12 + i * 0.16 * Math.cos(0.9), g0 + 0.42, hz - i * 0.16 * Math.sin(0.9) * -1], [0, -0.9, 0]));
        b.add('wood', pk);
      }
    }
    // beds
    const soil = () => tint('#4a3626', 0.1);
    const beds = [-14.6, -13.2, -11.8, -10.4, -9.4];
    beds.forEach((x, i) => {
      const len = gz1 - gz0 - 1.2;
      const zc = (gz0 + gz1) / 2;
      const g0 = gy(x, zc);
      const bedGeo = blockStoneGeo(rng, 0.78, 0.22, len, { color: soil(), round: 0.55, rough: 0.05 });
      bedGeo.translate(x, g0 + 0.02, zc);
      b.add('mortar', bedGeo);
      if (i < 2) {
        for (let z = gz0 + 1.0; z < gz1 - 0.9; z += rng.range(0.55, 0.65)) addCabbage(b, rng, [x + rng.range(-0.08, 0.08), g0 + 0.1, z]);
      } else if (i === 2) {
        for (let z = gz0 + 0.9; z < gz1 - 0.8; z += rng.range(0.42, 0.55)) addCornStalk(b, rng, [x + rng.range(-0.1, 0.1), g0 + 0.08, z]);
      } else {
        for (let z = gz0 + 1.1; z < gz1 - 1.0; z += rng.range(0.7, 1.0)) {
          const s = rng.range(0.28, 0.46);
          addPumpkin(b, rng, [x + rng.range(-0.15, 0.15), g0 + 0.04, z], s, rng.pick(['#d9772c', '#e08a3a', '#c86a2a', '#d07a30']), z);
          for (let k = 0; k < 4; k++) {
            const card = flatCard('leaf', rng.pick([5, 7, 1]), rng.range(0.22, 0.32), rng);
            card.applyMatrix4(makeMatrix([x + rng.range(-0.35, 0.35), g0 + 0.12, z + rng.range(-0.4, 0.4)], [-Math.PI / 2 + rng.range(-0.3, 0.3), 0, rng() * TAU]));
            setColor(card, lin('#8f8b55').multiplyScalar(rng.range(0.6, 1)));
            b.add('leaf', card);
          }
        }
      }
    });
    for (const [x, z] of [[-15.0, -2.6], [-9.2, 3.8]]) addCornShock(b, rng, [x, gy(x, z), z]);
    addScarecrow(b, rng, [-12.5, gy(-12.5, 0.6), 0.6], 0.35);
    World.addAORect((gx0 + gx1) / 2, (gz0 + gz1) / 2, (gx1 - gx0) / 2, (gz1 - gz0) / 2, 0.6, 0.25);
    out.colliders.push({ x: (gx0 + gx1) / 2, z: (gz0 + gz1) / 2, r: 5.5 });
    out.garden = { x0: gx0, x1: gx1, z0: gz0, z1: gz1 };
  }

  // ── fire pit with stump seats ──
  {
    const fx = 6.2, fz = 9.4, g0 = gy(fx, fz);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * TAU + rng.range(-0.08, 0.08);
      const x = fx + Math.cos(a) * 0.66, z = fz + Math.sin(a) * 0.66;
      const st = stoneGeo(rng, rng.range(0.15, 0.21), { detail: 1, flat: 0.75, rough: 0.25, color: tint('#a8a29a', 0.15) });
      st.translate(x, gy(x, z) + 0.06, z);
      b.add('stone', st);
    }
    b.add('mortar', cylinder(0.56, 0.6, 0.06, { seg: 20, color: lin('#2b2623'), at: [fx, g0 + 0.0, fz] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      const lg = logGeo(rng, 0.62, rng.range(0.045, 0.06), { seg: 8, color: tint('#4a3a2e'), capColor: tint('#3a2a20'), caps: true });
      // lean each log inward so the tops meet above the center (a small teepee)
      const mm = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeRotationZ(-0.95));
      mm.setPosition(fx + Math.cos(a) * 0.16, g0 + 0.2, fz + Math.sin(a) * 0.16);
      lg.side.applyMatrix4(mm);
      b.add('bark', lg.side);
      if (lg.caps) { lg.caps.applyMatrix4(mm); b.add('end', lg.caps); }
    }
    const seats = [[2.2, 1.9, 0.24], [3.3, 1.8, 0.22], [4.6, 1.95, 0.26]];
    for (const [a, rr, rad] of seats) {
      const x = fx + Math.cos(a) * rr, z = fz + Math.sin(a) * rr, h = rng.range(0.38, 0.46);
      const s = logGeo(rng, h, rad, { seg: 14, taper: -0.08, color: tint('#ad9478'), capColor: tint('#d9c3a2'), caps: 'end', noiseAmt: 0.05 });
      const m = makeMatrix([x, gy(x, z) + h / 2 - 0.03, z], [0, 0, Math.PI / 2]);
      s.side.applyMatrix4(m);
      s.caps.applyMatrix4(m);
      b.add('bark', s.side);
      b.add('end', s.caps);
      World.addAO(x, z, 0.5, 0.45);
    }
    {
      const a = 0.9, rr = 2.0;
      const x = fx + Math.cos(a) * rr, z = fz + Math.sin(a) * rr;
      const lg = logGeo(rng, 1.9, 0.18, { seg: 12, color: tint('#a58c70'), capColor: tint('#d6c09e'), caps: true });
      const m = makeMatrix([x, gy(x, z) + 0.15, z], [0, -a + Math.PI / 2, 0]);
      lg.side.applyMatrix4(m);
      lg.caps.applyMatrix4(m);
      b.add('bark', lg.side);
      b.add('end', lg.caps);
      World.addAO(x, z, 1.1, 0.4, 0.5);
    }
    World.addAO(fx, fz, 1.1, 0.55);
    out.emitters.fire = new THREE.Vector3(fx, g0 + 0.12, fz);
    out.colliders.push({ x: fx, z: fz, r: 1.2 });
  }

  // ── stone well with a little roof ──
  {
    const wx = 9.2, wz = 2.6, g0 = gy(wx, wz);
    const R = 0.62;
    let y = g0 - 0.1;
    for (let c = 0; c < 4; c++) {
      const sh = rng.range(0.18, 0.23);
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = ((i + (c % 2) * 0.5) / n) * TAU;
        const g = blockStoneGeo(rng, 0.31, sh * 0.95, 0.22, { color: tint(rng.pick(['#c4bcae', '#b9b3aa', '#c9b9a2']), 0.12) });
        g.applyMatrix4(makeMatrix([wx + Math.cos(a) * R, y + sh / 2, wz + Math.sin(a) * R], [0, -a + Math.PI / 2, 0]));
        b.add('stone', g);
      }
      y += sh;
    }
    b.add('mortar', cylinder(R - 0.05, R - 0.05, y - g0 + 0.05, { seg: 20, open: true, color: lin('#7f786c'), at: [wx, (y + g0) / 2 - 0.02, wz] }));
    b.add('ceramic', cylinder(R - 0.08, R - 0.08, 0.01, { seg: 20, color: lin('#05080a'), at: [wx, y - 0.25, wz] }));
    const top = y;
    for (const sx of [-1, 1]) {
      const pg = logGeo(rng, 1.55, 0.055, { seg: 8, color: tint('#bfa88a'), caps: false });
      pg.side.applyMatrix4(makeMatrix([wx + sx * (R + 0.05), top + 0.62, wz], [0, 0, Math.PI / 2]));
      b.add('wood', pg.side);
    }
    const axle = logGeo(rng, R * 2 + 0.3, 0.06, { seg: 10, color: tint('#b59d80'), caps: true, capColor: tint('#c8b190') });
    axle.side.applyMatrix4(makeMatrix([wx, top + 0.95, wz], [0, 0, 0]));
    axle.caps.applyMatrix4(makeMatrix([wx, top + 0.95, wz], [0, 0, 0]));
    b.add('wood', axle.side);
    b.add('end', axle.caps);
    b.add('metal', box(0.03, 0.22, 0.03, { color: lin('#2f2b28'), at: [wx + R + 0.22, top + 0.86, wz] }));
    b.add('metal', box(0.14, 0.03, 0.03, { color: lin('#2f2b28'), at: [wx + R + 0.28, top + 0.76, wz] }));
    b.add('matte', cylinder(0.008, 0.008, 0.55, { seg: 4, color: lin('#cbbd9d'), at: [wx - 0.1, top + 0.68, wz] }));
    // bucket on the rim
    b.add('wood', cylinder(0.13, 0.11, 0.22, { seg: 12, open: true, color: tint('#a88d6c'), at: [wx + 0.42, top + 0.11, wz + 0.42] }));
    const hoop = new THREE.TorusGeometry(0.125, 0.008, 4, 18);
    hoop.rotateX(Math.PI / 2);
    hoop.translate(wx + 0.42, top + 0.18, wz + 0.42);
    setColor(hoop, lin('#2f2b28'));
    b.add('metal', hoop);
    // roof
    const rp = 40 * DEG, rl = 0.68, ry = top + 1.42;
    for (const s of [1, -1]) {
      for (let j = 0; j < 5; j++) {
        const v = 0.08 + j * 0.13;
        let x = -0.95 + rng.range(0, 0.1);
        while (x < 0.95) {
          const sw = rng.range(0.12, 0.2);
          const g = box(Math.min(sw, 0.95 - x), 0.016, 0.3, { color: tint('#a89a8a', 0.1) });
          g.applyMatrix4(makeMatrix([wx + x + sw / 2, ry - v * Math.sin(rp) + 0.02, wz + s * v * Math.cos(rp)], [s * (rp + 0.06), 0, 0]));
          b.add('shingle', g);
          x += sw + 0.008;
        }
      }
      b.add('wood', box(2.0, 0.03, rl, { color: tint('#a8957c'), at: [wx, ry - (rl / 2) * Math.sin(rp) - 0.01, wz + s * (rl / 2) * Math.cos(rp)], rot: [s * rp, 0, 0] }));
    }
    World.addAO(wx, wz, 1.1, 0.55);
    out.colliders.push({ x: wx, z: wz, r: 0.9 });
  }

  // ── path: stepping stones, fence, mailbox, footbridge ──
  const pathPt = (t) => {
    const p = World.path;
    let i = 0;
    while (i < p.len.length - 2 && p.len[i + 1] < t) i++;
    const f = clamp((t - p.len[i]) / (p.len[i + 1] - p.len[i]), 0, 1);
    const x = lerp(p.pts[i][0], p.pts[i + 1][0], f), z = lerp(p.pts[i][1], p.pts[i + 1][1], f);
    const dx = p.pts[i + 1][0] - p.pts[i][0], dz = p.pts[i + 1][1] - p.pts[i][1], l = Math.hypot(dx, dz) || 1;
    return { x, z, tx: dx / l, tz: dz / l };
  };
  for (const t of [0.6, 1.25, 1.95, 2.7, 3.5]) {
    const p = pathPt(t);
    const x = p.x + rng.range(-0.12, 0.12), z = p.z;
    const g = blockStoneGeo(rng, rng.range(0.42, 0.55), 0.09, rng.range(0.34, 0.44), { color: tint('#b5ada0', 0.1), round: 0.45 });
    g.applyMatrix4(makeMatrix([x, gy(x, z) + 0.01, z], [0, rng() * TAU, 0]));
    b.add('stone', g);
  }
  // post-and-rail fence along the right side of the path
  {
    let prev = null;
    for (let t = 5; t <= 23.5; t += 2.3) {
      const p = pathPt(t);
      const x = p.x - p.tz * 1.75, z = p.z + p.tx * 1.75, g0 = gy(x, z);
      const pg = logGeo(rng, 1.15, 0.06, { seg: 8, color: tint('#b8a68e'), capColor: tint('#aa9a84'), caps: 'end' });
      const m = makeMatrix([x, g0 + 0.5, z], [rng.range(-0.04, 0.04), 0, Math.PI / 2 + rng.range(-0.04, 0.04)]);
      pg.side.applyMatrix4(m);
      pg.caps.applyMatrix4(m);
      b.add('wood', pg.side);
      b.add('end', pg.caps);
      if (prev && !(t > 14 && t < 17)) {
        for (const ry of [0.45, 0.88]) {
          const len = Math.hypot(x - prev.x, z - prev.z) + 0.25;
          const rail = logGeo(rng, len, 0.045, { seg: 7, bow: 0.02, color: tint('#bfae95'), caps: true, capColor: tint('#b09f86') });
          const yaw = Math.atan2(-(z - prev.z), x - prev.x);
          const mm = makeMatrix([(x + prev.x) / 2, (g0 + prev.g0) / 2 + ry, (z + prev.z) / 2], [0, yaw, Math.atan2(g0 - prev.g0, len)]);
          rail.side.applyMatrix4(mm);
          rail.caps.applyMatrix4(mm);
          b.add('wood', rail.side);
          b.add('end', rail.caps);
        }
      }
      prev = { x, z, g0 };
      World.addAO(x, z, 0.3, 0.35);
    }
  }
  // mailbox at the clearing edge
  {
    const p = pathPt(17.5);
    const x = p.x - p.tz * 1.25, z = p.z + p.tx * 1.25, g0 = gy(x, z);
    const yaw = Math.atan2(p.tx, p.tz);
    const parts = [];
    parts.push(['wood', box(0.09, 1.12, 0.09, { color: tint('#a8957c'), at: [0, 0.52, 0] })]);
    parts.push(['paint', box(0.24, 0.14, 0.46, { color: lin('#5f6e57'), at: [0, 1.12, 0] })]);
    const roofc = cylinder(0.12, 0.12, 0.46, { seg: 12, color: lin('#5f6e57') });
    roofc.applyMatrix4(makeMatrix([0, 1.19, 0], [Math.PI / 2, 0, 0]));
    parts.push(['paint', roofc]);
    parts.push(['paint', box(0.025, 0.2, 0.05, { color: lin('#a3372a'), at: [0.135, 1.24, -0.08] })]);
    const m = makeMatrix([x, g0, z], [0, yaw, 0]);
    for (const [k, g] of parts) { g.applyMatrix4(m); b.add(k, g); }
  }
  // plank footbridge where the path crosses the creek
  {
    let best = null;
    for (let i = 0; i < World.path.pts.length; i++) {
      const [x, z] = World.path.pts[i];
      const d = World.creekDist(x, z);
      if (!best || d < best.d) best = { d, i, t: World.path.len[i] };
    }
    const p = pathPt(best.t);
    const tx = p.tx, tz = p.tz;
    const L = 5.4;
    const e0 = [p.x - tx * L / 2, p.z - tz * L / 2], e1 = [p.x + tx * L / 2, p.z + tz * L / 2];
    const deckY = Math.max(gy(e0[0], e0[1]), gy(e1[0], e1[1])) + 0.12;
    const yaw = Math.atan2(-tz, tx);
    for (const s of [-0.48, 0.48]) {
      const lg = logGeo(rng, L + 0.4, 0.13, { seg: 12, color: tint('#8f7a62'), capColor: tint('#b9a284'), caps: true, bow: 0.004 });
      const m = makeMatrix([p.x - tz * s, deckY - 0.16, p.z + tx * s], [0, yaw, 0]);
      lg.side.applyMatrix4(m);
      lg.caps.applyMatrix4(m);
      b.add('bark', lg.side);
      b.add('end', lg.caps);
    }
    for (let d = -L / 2; d <= L / 2 + 0.01; d += 0.16) {
      const x = p.x + tx * d, z = p.z + tz * d;
      const g = box(0.14, 0.045, 1.3 + rng.range(-0.06, 0.06), { color: tint('#bba68a', 0.1), uv: [rng.range(0, 1.6), rng.range(0, 0.8)] });
      g.applyMatrix4(makeMatrix([x, deckY + rng.range(-0.006, 0.006), z], [rng.range(-0.01, 0.01), yaw, rng.range(-0.01, 0.01)]));
      b.add('wood', g);
    }
    const rs = 0.62;
    const postsAt = [-L / 2 + 0.3, 0, L / 2 - 0.3];
    for (const d of postsAt) {
      const x = p.x + tx * d - tz * rs, z = p.z + tz * d + tx * rs;
      const pg = logGeo(rng, 1.15, 0.05, { seg: 8, color: tint('#b39d82'), caps: 'end', capColor: tint('#a8957c') });
      const m = makeMatrix([x, deckY + 0.42, z], [0, 0, Math.PI / 2]);
      pg.side.applyMatrix4(m);
      pg.caps.applyMatrix4(m);
      b.add('wood', pg.side);
      b.add('end', pg.caps);
    }
    const rail = logGeo(rng, L - 0.4, 0.045, { seg: 8, color: tint('#bfa98c'), caps: true, capColor: tint('#a8957c'), bow: 0.01 });
    const rm = makeMatrix([p.x - tz * rs, deckY + 0.95, p.z + tx * rs], [0, yaw, 0]);
    rail.side.applyMatrix4(rm);
    rail.caps.applyMatrix4(rm);
    b.add('wood', rail.side);
    b.add('end', rail.caps);
    out.bridge = { x: p.x, z: p.z, y: deckY, tx, tz, L };
  }

  const group = b.build(M, { extras: { laundry: { aWind: 3 }, leaf: { aWind: 3 }, plant: { aWind: 3 } } });
  group.traverse((o) => { if (o.isMesh && o.material === M.laundry) o.customDepthMaterial = M.laundry.userData.depthMaterial; });
  out.group = group;
  return out;
}

function addCabbage(b, rng, [x, y, z]) {
  const core = new THREE.SphereGeometry(0.12, 9, 6);
  setColor(core, lin('#9fb38a').multiplyScalar(rng.range(0.9, 1.05)));
  core.translate(x, y + 0.08, z);
  b.add('pumpkin', core);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.2, 0.2);
    const g = new THREE.SphereGeometry(0.16, 7, 3, 0, TAU, 0, Math.PI / 2);
    g.scale(1, 0.45, 0.8);
    g.rotateX(-Math.PI / 2 + 0.55);
    g.rotateY(-a + Math.PI / 2);
    g.translate(x + Math.cos(a) * 0.11, y + 0.05, z + Math.sin(a) * 0.11);
    setColor(g, lin(rng.pick(['#5f7f62', '#6d8b66', '#577457'])).multiplyScalar(rng.range(0.85, 1.05)));
    b.add('pumpkin', g);
  }
}

function addCornStalk(b, rng, [x, y, z]) {
  const h = rng.range(1.5, 2.0);
  const lean = [rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)];
  const pts = [], rad = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push([x + lean[0] * t * h, y + t * h, z + lean[1] * t * h]);
    rad.push(lerp(0.016, 0.006, t));
  }
  b.add('wood', tubeGeo(pts, rad, { seg: 5, color: lin('#d6c08a').multiplyScalar(rng.range(0.85, 1.05)) }));
  for (let i = 0; i < 5; i++) {
    const t = rng.range(0.2, 0.9);
    const card = flatCard('tuft', 0, rng.range(0.5, 0.75), rng, 0.55);
    card.translate(0, 0.25, 0);
    card.applyMatrix4(makeMatrix([x + lean[0] * t * h, y + t * h, z + lean[1] * t * h], [rng.range(-0.4, 0.4), rng() * TAU, rng.range(0.6, 1.1)]));
    setColor(card, lin('#cdb67e').multiplyScalar(rng.range(0.8, 1.05)));
    b.add('leaf', card);
  }
}

function addCornShock(b, rng, [x, y, z]) {
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU + rng.range(-0.1, 0.1);
    const r0 = rng.range(0.28, 0.42), h = rng.range(1.7, 2.1);
    const pts = [[x + Math.cos(a) * r0, y, z + Math.sin(a) * r0], [x + Math.cos(a) * 0.08, y + 1.15, z + Math.sin(a) * 0.08], [x + Math.cos(a) * 0.22, y + h, z + Math.sin(a) * 0.22]];
    b.add('wood', tubeGeo(pts, [0.015, 0.012, 0.006], { seg: 4, color: lin('#cdb47c').multiplyScalar(rng.range(0.8, 1.05)) }));
  }
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU;
    const card = flatCard('tuft', 0, rng.range(0.7, 1.0), rng, 0.7);
    card.translate(0, 0.35, 0);
    card.applyMatrix4(makeMatrix([x + Math.cos(a) * 0.18, y + rng.range(0.6, 1.4), z + Math.sin(a) * 0.18], [0, -a + Math.PI / 2, rng.range(-0.5, 0.5)]));
    setColor(card, lin('#cdb67e').multiplyScalar(rng.range(0.8, 1.05)));
    b.add('leaf', card);
  }
  const tie = new THREE.TorusGeometry(0.09, 0.012, 4, 12);
  tie.rotateX(Math.PI / 2);
  tie.translate(x, y + 1.12, z);
  setColor(tie, lin('#8a6a3a'));
  b.add('matte', tie);
  World.addAO(x, z, 0.6, 0.45);
}

function addScarecrow(b, rng, [x, y, z], yaw) {
  const parts = [];
  const pole = logGeo(rng, 2.1, 0.04, { seg: 7, color: lin('#a8916f'), caps: false });
  pole.side.applyMatrix4(makeMatrix([0, 0.95, 0], [0, 0, Math.PI / 2]));
  parts.push(['wood', pole.side]);
  const bar = logGeo(rng, 1.35, 0.03, { seg: 7, color: lin('#a8916f'), caps: false });
  bar.side.applyMatrix4(makeMatrix([0, 1.48, 0.02], [0, 0, 0.04]));
  parts.push(['wood', bar.side]);
  const shirt = box(0.48, 0.62, 0.24, { color: 0xffffff, at: [0, 1.22, 0] });
  remapUV(shirt, CLOTH_UV.plaid);
  parts.push(['cloth', shirt]);
  for (const s of [-1, 1]) {
    const sl = box(0.42, 0.17, 0.17, { color: 0xffffff, at: [s * 0.42, 1.46, 0.02], rot: [0, 0, s * -0.06] });
    remapUV(sl, CLOTH_UV.plaid);
    parts.push(['cloth', sl]);
    const tuft = flatCard('tuft', 0, 0.22, rng, 0.8);
    tuft.applyMatrix4(makeMatrix([s * 0.68, 1.44, 0.02], [0, Math.PI / 2, s * Math.PI / 2]));
    setColor(tuft, lin('#d8bf80'));
    parts.push(['leaf', tuft]);
  }
  const trousers = box(0.42, 0.35, 0.2, { color: lin('#4a5a72'), at: [0, 0.78, 0] });
  parts.push(['matte', trousers]);
  const t2 = flatCard('tuft', 0, 0.3, rng, 1.0);
  t2.translate(0, 0.52, 0.11);
  setColor(t2, lin('#d8bf80'));
  parts.push(['leaf', t2]);
  const head = new THREE.SphereGeometry(0.15, 12, 10);
  head.scale(1, 1.1, 1);
  head.translate(0, 1.72, 0);
  setColor(head, lin('#b8a074'));
  parts.push(['matte', head]);
  parts.push(['matte', cylinder(0.3, 0.3, 0.025, { seg: 18, color: lin('#c9ad6a'), at: [0, 1.85, 0], rot: [0.12, 0, 0.08] })]);
  parts.push(['matte', cylinder(0.12, 0.15, 0.16, { seg: 14, color: lin('#c2a564'), at: [0, 1.93, 0], rot: [0.12, 0, 0.08] })]);
  parts.push(['matte', cylinder(0.152, 0.152, 0.035, { seg: 14, color: lin('#7a3a2a'), at: [0, 1.88, 0], rot: [0.12, 0, 0.08] })]);
  const m = makeMatrix([x, y, z], [0, yaw, rng.range(-0.04, 0.04)]);
  for (const [k, g] of parts) { g.applyMatrix4(m); b.add(k, g); }
  World.addAO(x, z, 0.4, 0.4);
}
