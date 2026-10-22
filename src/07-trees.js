/* Trees: procedural spruce, Scots pine, birch, maple, saplings and snags (two levels of detail each),
   instanced across the forest with species zoning, hero trees for composition and an open sunline. */

class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.wind = []; this.idx = [];
  }
  get count() { return this.pos.length / 3; }
  vert(p, n, uv, c, w) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(uv[0], uv[1]);
    this.col.push(c.r, c.g, c.b);
    this.wind.push(w[0], w[1], w[2]);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  append(geo) {
    const base = this.count;
    const a = geo.attributes;
    const n = a.position.count;
    for (let i = 0; i < n; i++) {
      this.pos.push(a.position.array[i * 3], a.position.array[i * 3 + 1], a.position.array[i * 3 + 2]);
      this.nor.push(a.normal.array[i * 3], a.normal.array[i * 3 + 1], a.normal.array[i * 3 + 2]);
      this.uv.push(a.uv.array[i * 2], a.uv.array[i * 2 + 1]);
      this.col.push(a.color.array[i * 3], a.color.array[i * 3 + 1], a.color.array[i * 3 + 2]);
      const w = a.aWind ? [a.aWind.array[i * 3], a.aWind.array[i * 3 + 1], a.aWind.array[i * 3 + 2]] : [0, 0, 0];
      this.wind.push(w[0], w[1], w[2]);
    }
    for (const k of geo.index.array) this.idx.push(k + base);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// A card following a 3-point branch curve; width runs along `side`. uvRect = [u0, v0, u1, v1] (u along the branch).
function addBranchCard(mb, pts, side, width, uvRect, { normalFn, colorFn, windFn, taper = [0.6, 1, 0.8] }) {
  const rows = [];
  for (let i = 0; i < pts.length; i++) {
    const s = i / (pts.length - 1);
    const hw = (width / 2) * taper[i];
    const along = _v1.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize().clone();
    const cn = new THREE.Vector3().crossVectors(side, along).normalize();
    if (cn.y < 0) cn.negate();
    const row = [];
    for (const k of [-1, 1]) {
      const p = pts[i].clone().addScaledVector(side, hw * k);
      const n = normalFn(p, cn);
      const u = lerp(uvRect[0], uvRect[2], s);
      const v = k < 0 ? uvRect[1] : uvRect[3];
      row.push(mb.vert(p, n, [u, v], colorFn(p, s), windFn(p, s)));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const [a, b] = rows[i], [c, d] = rows[i + 1];
    mb.tri(a, c, b);
    mb.tri(b, c, d);
  }
}

// A free card centered at `c` with in-plane axes ax (width) and ay (height), atlas cell uv rect.
function addQuadCard(mb, c, ax, ay, uvRect, { normalFn, colorFn, windFn }) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const cn = new THREE.Vector3().crossVectors(ax, ay).normalize();
  const ids = corners.map(([i, j]) => {
    const p = c.clone().addScaledVector(ax, i * 0.5).addScaledVector(ay, j * 0.5);
    const u = i < 0 ? uvRect[0] : uvRect[2];
    const v = j < 0 ? uvRect[3] : uvRect[1];
    return mb.vert(p, normalFn(p, cn), [u, v], colorFn(p), windFn(p, (j + 1) / 2));
  });
  mb.tri(ids[0], ids[1], ids[2]);
  mb.tri(ids[0], ids[2], ids[3]);
}

function trunkTube(mb, rng, H, r0, { seg = 8, lean = 0.02, wobble = 0.03, flare = 1.3, tint, phase, topR = 0.03, steps = 9, bend = null }) {
  const pts = [], rad = [];
  const lx = rng.range(-lean, lean), lz = rng.range(-lean, lean);
  const o = rng() * 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * H;
    let x = lx * y + Noise.n2(o, t * 3) * wobble * H * t;
    let z = lz * y + Noise.n2(o + 7, t * 3) * wobble * H * t;
    if (bend) { x += bend[0] * t * t * H; z += bend[1] * t * t * H; }
    pts.push([x, y - (i === 0 ? 0.25 : 0), z]);
    rad.push(lerp(r0, topR, Math.pow(t, 0.85)) * (i === 0 ? flare : i === 1 ? lerp(1, flare, 0.35) : 1));
  }
  const geo = tubeGeo(pts, rad, {
    seg, color: tint, uPeriod: TEX_SIZE.bark[1],
    extra: (i) => { const t = i / steps; return [t * t * 0.9, 0, phase]; },
  });
  mb.append(geo);
  return pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
}

function axisAt(pts, y) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (y <= pts[i + 1].y || i === pts.length - 2) {
      const t = clamp((y - pts[i].y) / (pts[i + 1].y - pts[i].y), 0, 1);
      return new THREE.Vector3().lerpVectors(pts[i], pts[i + 1], t);
    }
  }
  return pts[pts.length - 1].clone();
}

/* ── species generators: each returns { wood, leaves, height, radius } ── */

function genSpruce(rng, { H = 18, lod = 0, slim = 1, tint = '#d3c3b4', sapling = false } = {}) {
  const wood = new MeshBuilder(), leaves = new MeshBuilder();
  const phase = rng();
  const r0 = clamp(H * 0.016, 0.06, 0.34);
  const axis = trunkTube(wood, rng, H, r0, { seg: lod ? 5 : 8, lean: 0.015, wobble: 0.012, tint: lin('#b5a596'), phase, steps: lod ? 4 : 8 });
  const yStart = H * rng.range(0.04, 0.1);
  const Wmax = H * 0.165 * slim * rng.range(0.92, 1.08);
  const crown = (t) => Wmax * Math.pow(Math.max(0, 1 - t), 0.92) * (0.82 + 0.18 * smoothstep(0, 0.12, t)) + 0.12;
  const spacing = lod ? 1.15 : sapling ? 0.42 : 0.55;
  const perWhorl = lod ? 4 : 5;
  const cells = ATLAS_CELLS.fir.length;
  const up = new THREE.Vector3(0, 1, 0);
  for (let y = yStart; y < H - 0.25; y += spacing * rng.range(0.85, 1.15) * (1 - (y / H) * 0.35)) {
    const t = y / H;
    const Rc = crown(t);
    const a0 = rng() * TAU;
    const n = perWhorl + (lod ? 0 : rng.int(0, 1));
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU + rng.range(-0.25, 0.25);
      const L = Rc * rng.range(0.82, 1.12);
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const pitch = lerp(-0.42, 0.28, Math.pow(t, 1.4)) + rng.range(-0.08, 0.08);
      const base = axisAt(axis, y).addScaledVector(dir, r0 * (1 - t) * 0.8);
      const p1 = base.clone().addScaledVector(dir, L * 0.5).addScaledVector(up, Math.sin(pitch) * L * 0.5 - L * 0.04);
      const p2 = base.clone().addScaledVector(dir, L).addScaledVector(up, Math.sin(pitch) * L * 0.92 + L * 0.08 * (1 - t));
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      // saplings are seen from eye level: tilt their shelves so they never read edge-on
      const roll = sapling ? rng.range(-0.65, 0.65) : rng.range(-0.3, 0.3);
      side.applyAxisAngle(dir, roll);
      const centerY = y - 0.45 * Rc;
      const ao = (p) => {
        const d = Math.hypot(p.x, p.z) / Math.max(0.3, Rc);
        const k2 = lerp(0.45, 1.0, smoothstep(0.05, 1.0, d)) * lerp(0.6, 1.0, Math.pow(t, 0.6)) * rng.range(0.94, 1.06);
        return new THREE.Color(k2, k2, k2 * 0.96);
      };
      const normalFn = (p, cn) => {
        _v2.set(p.x, (p.y - centerY) * 0.8, p.z).normalize();
        return new THREE.Vector3().copy(cn).multiplyScalar(0.3).addScaledVector(_v2, 0.8).normalize();
      };
      const windFn = (p, s) => [Math.pow(p.y / H, 2) * 0.9, s, phase + k * 0.13];
      const cell = rng.int(0, cells - 1);
      const curve = lod ? [base, p2] : [base, p1, p2];
      // hanging direction: down and slightly outward, like the drooping branchlets of a spruce
      const hang = new THREE.Vector3(0, -0.82, 0).addScaledVector(dir, 0.38).normalize();
      if (lod) {
        const diag = side.clone().multiplyScalar(0.6).addScaledVector(hang, 0.5).normalize();
        const w = Math.max(0.5, L * 1.0);
        const pts = curve.map((p) => p.clone().addScaledVector(hang, w * 0.18));
        addBranchCard(leaves, pts, diag, w, atlasUV('fir', cell), { normalFn, colorFn: ao, windFn, taper: [0.75, 0.95] });
      } else {
        const w = Math.max(0.34, L * 0.6);
        addBranchCard(leaves, curve, side, w, atlasUV('fir', cell), { normalFn, colorFn: ao, windFn, taper: [0.55, 1, 0.75] });
        if (L > (sapling ? 0.16 : 0.5)) {
          const wc = Math.max(sapling ? 0.24 : 0.3, L * 0.48);
          const pts = curve.map((p, i) => p.clone().addScaledVector(hang, wc * (i === 0 ? 0.3 : 0.45)));
          addBranchCard(leaves, pts, hang, wc, atlasUV('fir', (cell + 1) % cells), { normalFn, colorFn: ao, windFn, taper: [0.5, 1, 0.8] });
        }
      }
    }
  }
  // leader at the top
  if (!lod && !sapling) {
    const top = axis[axis.length - 1];
    const uvr = atlasUV('fir', 0);
    for (let i = 0; i < 2; i++) {
      const ax = new THREE.Vector3(Math.cos(i * 1.6), 0, Math.sin(i * 1.6)).multiplyScalar(0.45);
      addQuadCard(leaves, top.clone().add(new THREE.Vector3(0, 0.1, 0)), ax, new THREE.Vector3(0, 0.9, 0), [uvr[0], uvr[1], uvr[2], uvr[3]], {
        normalFn: (p, cn) => _v3.set(p.x, 0.6, p.z).normalize().clone(),
        colorFn: () => new THREE.Color(1, 1, 0.96),
        windFn: (p, s) => [0.9, s, phase],
      });
    }
  }
  // dense core so the crown never looks see-through
  {
    const segs = lod ? 5 : 6, rings = lod ? 4 : 6;
    const ids = [];
    for (let r = 0; r <= rings; r++) {
      const t = lerp(yStart / H + 0.02, sapling ? 0.84 : 0.97, r / rings);
      const y = t * H;
      const rad = crown(t) * (sapling ? 0.27 : 0.42);
      const c = axisAt(axis, y);
      const row = [];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * TAU;
        const p = new THREE.Vector3(c.x + Math.cos(a) * rad, y, c.z + Math.sin(a) * rad);
        const n = new THREE.Vector3(Math.cos(a), 0.45, Math.sin(a)).normalize();
        const k2 = lerp(0.045, 0.085, t);
        row.push(leaves.vert(p, n, [0.5, 0.5], new THREE.Color(k2 * 0.62, k2 * 0.85, k2 * 0.5), [t * t * 0.9, -1, phase]));
      }
      ids.push(row);
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
      leaves.tri(ids[r][s], ids[r + 1][s], ids[r][s + 1]);
      leaves.tri(ids[r][s + 1], ids[r + 1][s], ids[r + 1][s + 1]);
    }
  }
  return { wood: wood.build(), leaves: leaves.build(), height: H, radius: Wmax };
}

function genPine(rng, { H = 19, lod = 0 } = {}) {
  const wood = new MeshBuilder(), leaves = new MeshBuilder();
  const phase = rng();
  const r0 = clamp(H * 0.014, 0.12, 0.3);
  const lowerBark = lin('#9a8e84'), upperBark = lin('#e0a070');
  const axis = trunkTube(wood, rng, H, r0, { seg: lod ? 5 : 8, lean: 0.03, wobble: 0.025, tint: lowerBark, phase, steps: lod ? 5 : 9, topR: 0.05 });
  // warm orange bark on the upper trunk (Scots pine)
  {
    const c = wood.col, p = wood.pos;
    for (let i = 0; i < p.length / 3; i++) {
      const k = smoothstep(0.4, 0.65, p[i * 3 + 1] / H);
      c[i * 3] = lerp(lowerBark.r, upperBark.r, k); c[i * 3 + 1] = lerp(lowerBark.g, upperBark.g, k); c[i * 3 + 2] = lerp(lowerBark.b, upperBark.b, k);
    }
  }
  const crownBase = H * rng.range(0.58, 0.66);
  const crownC = new THREE.Vector3(0, lerp(crownBase, H, 0.55), 0);
  const nb = lod ? 6 : rng.int(9, 12);
  const clumps = [];
  for (let i = 0; i < nb; i++) {
    const y = lerp(crownBase, H * 0.94, i / nb) + rng.range(-0.3, 0.3);
    const a = rng() * TAU;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const L = rng.range(1.6, 3.2) * (1 - (y - crownBase) / (H - crownBase) * 0.45);
    const base = axisAt(axis, y);
    const p1 = base.clone().addScaledVector(dir, L * 0.45).add(new THREE.Vector3(0, L * 0.35, 0));
    const p2 = base.clone().addScaledVector(dir, L).add(new THREE.Vector3(0, L * 0.55 + rng.range(-0.3, 0.2), 0));
    if (!lod) {
      wood.append(tubeGeo([[base.x, base.y, base.z], [p1.x, p1.y, p1.z], [p2.x, p2.y, p2.z]], [0.07, 0.045, 0.02], {
        seg: 5, color: upperBark, uPeriod: TEX_SIZE.bark[1], extra: (k) => [Math.pow(y / H, 2) * 0.9, k * 0.25, phase],
      }));
    }
    clumps.push(p2, p1.clone().lerp(p2, 0.4).add(new THREE.Vector3(0, 0.2, 0)));
    if (L > 2.2) clumps.push(p1.clone().lerp(base, 0.3).add(new THREE.Vector3(0, 0.25, 0)));
  }
  clumps.push(axisAt(axis, H).add(new THREE.Vector3(0, 0.1, 0)));
  // dead branch stubs on the lower trunk
  if (!lod) {
    for (let i = 0; i < 9; i++) {
      const y = rng.range(H * 0.12, crownBase - 0.5), a = rng() * TAU;
      const base = axisAt(axis, y);
      const d = new THREE.Vector3(Math.cos(a), rng.range(-0.3, 0.1), Math.sin(a)).normalize();
      const e = base.clone().addScaledVector(d, rng.range(0.25, 0.7));
      wood.append(tubeGeo([[base.x, base.y, base.z], [e.x, e.y, e.z]], [0.025, 0.008], { seg: 4, color: lin('#8a7c70'), extra: () => [Math.pow(y / H, 2) * 0.9, 0, phase] }));
    }
  }
  const uvs = [atlasUV('pine', 0), atlasUV('pine', 1)];
  for (const c of clumps) {
    const nCards = lod ? 3 : 6;
    const size = rng.range(1.35, 1.9);
    for (let k = 0; k < nCards; k++) {
      const n = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)).normalize();
      const ax = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0.3, 1, 0.2)).normalize().multiplyScalar(size);
      const ay = new THREE.Vector3().crossVectors(n, ax).normalize().multiplyScalar(size);
      addQuadCard(leaves, c.clone().add(new THREE.Vector3(rng.range(-0.15, 0.15), rng.range(-0.1, 0.15), rng.range(-0.15, 0.15))), ax, ay, rng.pick(uvs), {
        normalFn: (p) => {
          _v2.subVectors(p, c).normalize();
          _v3.subVectors(p, crownC).normalize();
          return _v2.multiplyScalar(0.5).addScaledVector(_v3, 0.7).add(new THREE.Vector3(0, 0.25, 0)).normalize().clone();
        },
        colorFn: (p) => {
          const k2 = lerp(0.72, 1.1, smoothstep(-0.5, 1.0, (p.y - crownC.y) / (H - crownBase) + 0.3)) * rng.range(0.92, 1.05);
          return new THREE.Color(k2, k2, k2 * 0.95);
        },
        windFn: (p, s) => [Math.pow(p.y / H, 2) * 0.9, 0.6 + 0.4 * s, phase + k * 0.21],
      });
    }
  }
  return { wood: wood.build(), leaves: leaves.build(), height: H, radius: 3.2 };
}

function genBroadleaf(rng, { H = 13, lod = 0, kind = 'birch' } = {}) {
  const wood = new MeshBuilder(), leaves = new MeshBuilder();
  const phase = rng();
  const birch = kind === 'birch';
  const r0 = birch ? clamp(H * 0.012, 0.09, 0.18) : clamp(H * 0.02, 0.14, 0.28);
  const barkTint = birch ? lin('#ffffff') : lin('#b0a294');
  const bend = [rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)];
  const trunkH = birch ? H : H * 0.55;
  const axis = trunkTube(wood, rng, trunkH, r0, { seg: lod ? 5 : 8, lean: 0.03, wobble: birch ? 0.02 : 0.03, flare: birch ? 1.25 : 1.45, tint: barkTint, phase, steps: lod ? 4 : 8, topR: birch ? 0.02 : r0 * 0.55, bend });
  const crownC = new THREE.Vector3(axis[axis.length - 1].x * 0.6, H * (birch ? 0.66 : 0.62), axis[axis.length - 1].z * 0.6);
  const crownR = birch ? new THREE.Vector3(H * 0.24, H * 0.33, H * 0.24) : new THREE.Vector3(H * 0.36, H * 0.3, H * 0.36);
  const twigEnds = [];
  const nb = lod ? 6 : birch ? rng.int(11, 14) : rng.int(5, 7);
  for (let i = 0; i < nb; i++) {
    const t = birch ? lerp(0.36, 0.95, i / nb) : lerp(0.92, 1.0, rng());
    const y = t * trunkH;
    const a = rng() * TAU + i * 2.4;
    const base = axisAt(axis, y);
    const up = birch ? lerp(0.55, 1.0, t) : rng.range(0.6, 1.1);
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const L = birch ? (H * 0.22) * (1 - (t - 0.36) * 0.6) * rng.range(0.8, 1.15) : H * rng.range(0.38, 0.5);
    const droop = birch ? 0.35 : 0.1;
    const p1 = base.clone().addScaledVector(dir, L * 0.5);
    const p2 = base.clone().addScaledVector(dir, L).add(new THREE.Vector3(0, -droop * L * 0.4, 0));
    const br = birch ? lerp(0.05, 0.025, t) : r0 * 0.5;
    if (!lod || !birch) {
      wood.append(tubeGeo([[base.x, base.y, base.z], [p1.x, p1.y, p1.z], [p2.x, p2.y, p2.z]], [br, br * 0.6, br * 0.2], {
        seg: lod ? 4 : 5, color: birch ? lin('#e8e2da') : barkTint, uPeriod: TEX_SIZE.bark[1],
        extra: (k) => [Math.pow(base.y / H, 2) * 0.9, k * 0.2, phase],
      }));
    }
    const nTw = lod ? 2 : birch ? rng.int(3, 4) : rng.int(4, 6);
    for (let k = 0; k < nTw; k++) {
      const s = rng.range(0.35, 1.0);
      const origin = new THREE.Vector3().lerpVectors(p1, p2, s).lerp(base, s < 0.5 ? 0.2 : 0);
      const ta = a + rng.range(-1.2, 1.2);
      const td = new THREE.Vector3(Math.cos(ta), rng.range(0.1, 0.8), Math.sin(ta)).normalize();
      const tl = (birch ? rng.range(0.7, 1.3) : rng.range(1.2, 2.4)) * (H / 13);
      const tEnd = origin.clone().addScaledVector(td, tl).add(new THREE.Vector3(0, birch ? -tl * 0.35 : 0, 0));
      if (!lod) {
        wood.append(tubeGeo([[origin.x, origin.y, origin.z], [tEnd.x, tEnd.y, tEnd.z]], [br * 0.35, 0.006], {
          seg: 3, color: birch ? lin('#7a5a48') : barkTint, extra: () => [Math.pow(origin.y / H, 2) * 0.9, 0.5, phase],
        }));
      }
      twigEnds.push(tEnd, origin.clone().lerp(tEnd, 0.55));
    }
    twigEnds.push(p2);
  }
  // fill the crown volume so the silhouette reads as a rounded mass
  const fill = lod ? 14 : 36;
  for (let i = 0; i < fill; i++) {
    const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize().multiplyScalar(Math.pow(rng(), 0.4));
    twigEnds.push(crownC.clone().add(new THREE.Vector3(d.x * crownR.x, d.y * crownR.y, d.z * crownR.z)));
  }
  const cellKind = birch ? 'birch' : 'maple';
  const cardSize = (birch ? 1.1 : 1.35) * (H / 13) * (lod ? 1.7 : 1);
  for (const c of twigEnds) {
    const nCards = lod ? 1 : 3;
    for (let k = 0; k < nCards; k++) {
      const out = _v1.subVectors(c, crownC).normalize().clone();
      const n = out.clone().add(new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(-0.3, 0.6), rng.range(-0.7, 0.7))).normalize();
      const ax = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
      if (ax.lengthSq() < 0.01) ax.set(1, 0, 0);
      const ay = new THREE.Vector3().crossVectors(ax, n).normalize();
      ax.applyAxisAngle(n, rng.range(-0.4, 0.4));
      ay.applyAxisAngle(n, rng.range(-0.4, 0.4));
      const sz = cardSize * rng.range(0.8, 1.2);
      addQuadCard(leaves, c.clone().addScaledVector(ay, -sz * 0.2), ax.multiplyScalar(sz), ay.multiplyScalar(sz), atlasUV(cellKind, rng.int(0, 1)), {
        normalFn: (p) => {
          _v2.subVectors(p, crownC);
          _v2.set(_v2.x / crownR.x, _v2.y / crownR.y + 0.25, _v2.z / crownR.z).normalize();
          return _v2.clone();
        },
        colorFn: (p) => {
          _v2.subVectors(p, crownC);
          const r = Math.hypot(_v2.x / crownR.x, _v2.y / crownR.y, _v2.z / crownR.z);
          const k2 = lerp(0.5, 1.05, smoothstep(0.2, 1.0, r)) * lerp(0.8, 1.05, smoothstep(-0.6, 0.8, _v2.y / crownR.y)) * rng.range(0.9, 1.08);
          return new THREE.Color(k2, k2, k2);
        },
        windFn: (p, s) => [Math.pow(p.y / H, 2) * 0.9, 0.55 + 0.45 * s, phase + rng() * 0.5],
      });
    }
  }
  return { wood: wood.build(), leaves: leaves.build(), height: H, radius: crownR.x };
}

function genSnag(rng, { H = 11 } = {}) {
  const wood = new MeshBuilder();
  const phase = rng();
  const r0 = 0.2;
  const axis = trunkTube(wood, rng, H, r0, { seg: 7, lean: 0.05, wobble: 0.03, tint: lin('#a49c94'), phase, steps: 7, topR: 0.09 });
  for (let i = 0; i < 6; i++) {
    const y = rng.range(H * 0.35, H * 0.95), a = rng() * TAU;
    const base = axisAt(axis, y);
    const d = new THREE.Vector3(Math.cos(a), rng.range(-0.2, 0.5), Math.sin(a)).normalize();
    const L = rng.range(0.6, 2.0);
    const m = base.clone().addScaledVector(d, L * 0.5).add(new THREE.Vector3(0, rng.range(-0.1, 0.2), 0));
    const e = base.clone().addScaledVector(d, L);
    wood.append(tubeGeo([[base.x, base.y, base.z], [m.x, m.y, m.z], [e.x, e.y, e.z]], [0.05, 0.03, 0.008], { seg: 4, color: lin('#9c948c'), extra: () => [Math.pow(y / H, 2) * 0.5, 0.2, phase] }));
  }
  return { wood: wood.build(), leaves: null, height: H, radius: 1.5 };
}

/* ── forest assembly ── */

const TREE_SPECIES = {
  spruce: { gen: (rng, lod, v) => genSpruce(rng, { H: [21, 18, 15, 12][v], lod, slim: [1, 0.95, 1.05, 1.1][v] }), variants: 4, wood: 'bark', leaves: 'needles' },
  pine: { gen: (rng, lod, v) => genPine(rng, { H: [20, 17][v], lod }), variants: 2, wood: 'bark', leaves: 'needles' },
  birch: { gen: (rng, lod, v) => genBroadleaf(rng, { H: [14, 12, 10][v], lod, kind: 'birch' }), variants: 3, wood: 'birchBark', leaves: 'leaves' },
  maple: { gen: (rng, lod, v) => genBroadleaf(rng, { H: [12, 10][v], lod, kind: 'maple' }), variants: 2, wood: 'bark', leaves: 'leaves' },
  sapling: { gen: (rng, lod, v) => genSpruce(rng, { H: [3.6, 2.2][v], lod: 0, slim: 1.25, sapling: true }), variants: 2, wood: 'bark', leaves: 'needles' },
  snag: { gen: (rng) => genSnag(rng, { H: 11 }), variants: 1, wood: 'bark', leaves: null },
};

const HERO_TREES = [
  ['spruce', 0, -9.5, -11.5, 1.12], ['spruce', 1, 9.2, -12.8, 1.05], ['spruce', 0, -18.5, 1.5, 1.0],
  ['spruce', 2, 18.5, 10.5, 1.0], ['pine', 0, 19.5, -3.5, 1.05], ['spruce', 1, -2.5, -17.5, 1.1],
  ['birch', 0, -19.5, -9.5, 1.0], ['birch', 1, -22.0, -6.0, 1.05], ['birch', 2, -17.0, -13.5, 0.95], ['birch', 1, -24.5, -11.5, 1.0],
  ['maple', 0, 19.5, 13.5, 1.0], ['maple', 1, -11.0, 21.5, 1.0], ['birch', 0, -14.5, 26.5, 0.95],
  ['spruce', 3, 13.5, 21.5, 1.0], ['sapling', 0, 10.5, 18.0, 1.0], ['sapling', 1, -7.5, -14.0, 1.1],
  ['pine', 1, 23.0, 3.0, 1.0], ['spruce', 2, 6.5, -19.0, 1.0],
];

function forestMaterials(T, M) {
  M.bark = M.bark || patchMaterial(new THREE.MeshStandardMaterial({ map: T.barkMap, normalMap: T.barkNormal, vertexColors: true, roughness: 0.95 }), { moss: 0.35 });
  const birchOpts = { wind: 'tree' };
  M.birchBark = patchMaterial(new THREE.MeshStandardMaterial({ map: T.birchMap, normalMap: T.birchNormal, vertexColors: true, roughness: 0.8, envMapIntensity: 0.4 }), birchOpts);
  Sky.registerEnv(M.birchBark);
  const barkTree = patchMaterial(new THREE.MeshStandardMaterial({ map: T.barkMap, normalMap: T.barkNormal, vertexColors: true, roughness: 0.95, envMapIntensity: 0.3 }), { wind: 'tree', moss: 0.25 });
  Sky.registerEnv(barkTree);
  M.treeBark = barkTree;
  M.treeBark.userData.depthMaterial = makeDepthMaterial({ wind: 'tree' });
  M.birchBark.userData.depthMaterial = makeDepthMaterial({ wind: 'tree' });
  M.needles = foliageMaterial({ map: T.atlas, wind: 'tree', trans: 0.9, wrap: 0.5, solid: true });
  M.leaves = foliageMaterial({ map: T.atlas, wind: 'tree', trans: 1.6, wrap: 0.6, solid: true });
  return M;
}

function buildForest(T, M, keepClear = []) {
  const rng = makeRng('forest');
  const c = WORLD.clearing;
  // generate variant geometry (LOD0 near, LOD1 far)
  const geos = {};
  for (const [name, sp] of Object.entries(TREE_SPECIES)) {
    geos[name] = [];
    for (let v = 0; v < sp.variants; v++) {
      const g0 = sp.gen(makeRng(`tree-${name}-${v}`), 0, v);
      const g1 = name === 'sapling' || name === 'snag' ? g0 : sp.gen(makeRng(`tree-${name}-${v}-lod`), 1, v);
      geos[name].push([g0, g1]);
    }
  }

  // placement
  const instances = [];
  const grid = new Map();
  const cell = 3;
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const tooClose = (x, z, d) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const list = grid.get(`${gx + i},${gz + j}`);
      if (!list) continue;
      for (const o of list) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (Math.max(d, o.d) * 0.85) ** 2) return true;
    }
    return false;
  };
  const addInstance = (species, v, x, z, scale, hero = false) => {
    const gyv = World.heightAt(x, z);
    const inst = { species, v, x, z, y: gyv - 0.12, scale, rot: rng() * TAU, tilt: [rng.range(-0.035, 0.035), rng.range(-0.035, 0.035)], d: species === 'sapling' ? 1.6 : species === 'snag' ? 2.2 : 3.1 * scale, hero };
    instances.push(inst);
    const k = key(x, z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(inst);
    return inst;
  };
  const blocked = (x, z, margin = 0) => {
    if (World.ellipse(x, z) < 1.06) return true;
    const dp = World.pathField.dist(x, z), t = World.pathField.param(x, z);
    if (dp < (t > 40 ? 4.2 : 3.0) + margin) return true;
    if (World.creekDist(x, z) < 2.3 + margin) return true;
    for (const k of keepClear) if ((x - k[0]) ** 2 + (z - k[1]) ** 2 < k[2] * k[2]) return true;
    return false;
  };
  for (const [sp, v, x, z, s] of HERO_TREES) {
    if (keepClear.some((k) => (x - k[0]) ** 2 + (z - k[1]) ** 2 < (k[2] + 1.2) ** 2)) continue;
    addInstance(sp, v, x, z, s, true);
  }

  const Rmax = 128;
  const attempts = 26000;
  for (let i = 0; i < attempts; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(lerp(0.0, 1, rng())) * Rmax;
    const x = c.cx + Math.cos(a) * r, z = c.cz + Math.sin(a) * r;
    if (blocked(x, z)) continue;
    const e = World.ellipse(x, z);
    const edge = 1 - smoothstep(1.05, 1.7, e);
    const dens = Noise.fbm2(x * 0.02 + 5, z * 0.02 - 3, 3);
    if (dens < -0.42 && edge < 0.5) continue; // small glades
    const minD = lerp(4.6, 3.3, smoothstep(-0.4, 0.4, dens)) + edge * 1.2 + smoothstep(50, 95, r) * 1.7;
    if (tooClose(x, z, minD)) continue;
    // species zoning
    const nearCreek = 1 - smoothstep(4, 16, World.creekWideDist(x, z));
    const birchPatch = smoothstep(0.15, 0.45, Noise.fbm2(x * 0.03 - 11, z * 0.03 + 4, 3));
    let pB = 0.1 + birchPatch * 0.45 + nearCreek * 0.25 + edge * 0.18;
    let pM = 0.02 + edge * 0.08 + nearCreek * 0.06;
    let pP = 0.2 * (1 - edge);
    let pS = 0.06 + edge * 0.3;
    let pSnag = 0.02;
    let species;
    const roll = rng();
    if (roll < pS && r < 70) species = 'sapling';
    else if (roll < pS) continue;
    else if (roll < pS + pB) species = 'birch';
    else if (roll < pS + pB + pM) species = 'maple';
    else if (roll < pS + pB + pM + pP) species = 'pine';
    else if (roll < pS + pB + pM + pP + pSnag) species = 'snag';
    else species = 'spruce';
    let v = rng.int(0, TREE_SPECIES[species].variants - 1);
    let scale = rng.range(0.82, 1.18) * lerp(0.85, 1, smoothstep(1.1, 1.8, e));
    // keep the low evening sun visible from the cabin
    const cw = World.corridor(x, z);
    if (cw > 0.15 && (rng() < 0.55 * cw || Math.hypot(x, z) > 45)) continue;
    if (cw > 0.15) {
      const g = World.heightAt(x, z);
      const maxTop = World.cabinY + 2.2 + Math.hypot(x, z) * Math.tan((WORLD.sunElDusk - 1.6) * DEG) - g;
      const nominal = geos[species][v][0].height;
      if (nominal * scale > maxTop) {
        if (maxTop < 1.6) continue;
        species = 'sapling';
        v = maxTop > 3.4 ? 0 : 1;
        scale = Math.min(1.1, maxTop / geos[species][v][0].height);
        if (scale < 0.45) continue;
      }
    }
    addInstance(species, v, x, z, scale);
  }

  // build instanced meshes per species/variant and LOD
  const group = new THREE.Group();
  group.name = 'forest';
  const nearR = 52;
  const meshes = { near: [], far: [], nearLow: [] };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const tintColor = new THREE.Color();
  for (const [name, sp] of Object.entries(TREE_SPECIES)) {
    for (let v = 0; v < sp.variants; v++) {
      const list = instances.filter((o) => o.species === name && o.v === v);
      if (!list.length) continue;
      const near = list.filter((o) => Math.hypot(o.x - c.cx, o.z - c.cz) < nearR || o.hero);
      const far = list.filter((o) => !near.includes(o));
      const [g0, g1] = geos[name][v];
      const mk = (geo, mat, arr, shadows, label) => {
        if (!geo || !arr.length) return null;
        const mesh = new THREE.InstancedMesh(geo, mat, arr.length);
        arr.forEach((o, i) => {
          e.set(o.tilt[0], o.rot, o.tilt[1]);
          q.setFromEuler(e);
          s3.set(o.scale, o.scale * rng.range(0.95, 1.05), o.scale);
          m4.compose(p3.set(o.x, o.y, o.z), q, s3);
          mesh.setMatrixAt(i, m4);
          const h = name === 'birch' ? rng.range(-0.05, 0.04) : name === 'maple' ? rng.range(-0.04, 0.06) : rng.range(-0.03, 0.03);
          tintColor.setRGB(1 + h, 1, 1 - h * 1.5).multiplyScalar(rng.range(0.86, 1.08));
          if (name === 'birch' && rng.chance(0.25)) tintColor.multiply(lin('#c8d08a'));
          mesh.setColorAt(i, tintColor);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        if (mat.userData.depthMaterial) mesh.customDepthMaterial = mat.userData.depthMaterial;
        mesh.name = `${label}:${name}${v}`;
        mesh.computeBoundingSphere();
        group.add(mesh);
        return mesh;
      };
      const woodMat = sp.wood === 'birchBark' ? M.birchBark : M.treeBark;
      const leafMat = sp.leaves === 'leaves' ? M.leaves : M.needles;
      for (const [geoSet, arr, shadows, bucket] of [[g0, near, true, 'near'], [g1, far, false, 'far'], [g1, near, false, 'nearLow']]) {
        if (bucket === 'nearLow' && g1 === g0) continue;
        const a = mk(geoSet.wood, woodMat, arr, shadows, bucket);
        const b = mk(geoSet.leaves, leafMat, arr, shadows, bucket);
        for (const m of [a, b]) if (m) meshes[bucket].push(m);
      }
    }
  }
  for (const m of meshes.nearLow) m.visible = false;

  // contact shading at the tree bases
  for (const o of instances) {
    const h = geos[o.species][o.v][0].height * o.scale;
    World.addAO(o.x, o.z, clamp(h * 0.16, 1.0, 3.2), o.species === 'sapling' ? 0.3 : 0.5);
  }
  return {
    group, instances, meshes,
    // the low tier draws the near trees with their far geometry; otherwise that copy only feeds the creek
    // mirror (layer 2) while the full-detail trees stay with the main camera (layer 1)
    setQuality(q) {
      const low = q.key === 'low';
      for (const m of meshes.near) {
        m.visible = !low;
        m.layers.set(1);
      }
      for (const m of meshes.nearLow) {
        m.visible = true;
        m.layers.set(low ? 0 : 2);
      }
    },
  };
}
