/* Camera: the cinematic shot list (director) with dissolves and a title card, a free orbit rig
   that takes over from the current shot, and the hand-off between the two. */

// Positions are [x, height above ground, z]; looks are [x, height above ground, z].
// hfov is the horizontal field of view in degrees; fstop and focus drive depth of field.
// ev is exposure compensation in stops; evNight adds more at night where no window or fire light reaches.
const SHOTS = [
  {
    name: '序 · 林梢', dur: 18, title: true,
    pos: [[44, 42, 70], [30, 27, 47], [19, 13, 32], [11.5, 5.2, 23]],
    look: [[-14, 6, -14], [-8, 4, -7], [-3, 3, -2], [-1, 2.4, 0.5]],
    hfov: [58, 60], fstop: 11, focus: 'look', ev: 0,
  },
  {
    name: '小径', dur: 14,
    pos: [[2.6, 0.62, 21.5], [2.2, 0.6, 17.5], [1.7, 0.62, 14.2]],
    look: [[0.5, 1.75, 4.2], [0.4, 1.7, 4.0], [0.3, 1.65, 3.8]],
    hfov: [34, 32], fstop: 2.8, focus: [0.82, 1.62, 4.53], focusFromFloor: true, ev: 0.2,
  },
  {
    name: '柴垛', dur: 13,
    pos: [[-7.6, 1.35, 4.6], [-7.3, 1.3, 2.0], [-7.0, 1.25, -0.9]],
    look: [[-4.5, 1.0, 1.6], [-4.4, 0.95, 0.0], [-4.3, 0.95, -1.9]],
    hfov: [50, 48], fstop: 4, focus: 'look', ev: 0, evNight: 0.75,
  },
  {
    name: '门廊', dur: 12, porch: true,
    pos: [[0.75, 1.42, 4.3], [0.5, 1.36, 4.18], [0.25, 1.3, 4.06]],
    look: [[-1.6, 0.85, 3.45], [-1.6, 0.82, 3.42], [-1.6, 0.8, 3.4]],
    hfov: [46, 44], fstop: 2.0, focus: [-1.14, 0.62, 3.52], focusFromFloor: true, ev: 0.35,
  },
  {
    name: '溪桥', dur: 14, water: true,
    pos: [[8.6, 0.75, 43.6], [6.4, 0.7, 43.0], [4.4, 0.7, 42.4]],
    look: [[-4.5, 1.2, 33.6], [-4.8, 1.2, 33.4], [-5.0, 1.3, 33.2]],
    hfov: [52, 50], fstop: 5.6, focus: 'look', ev: 0.1,
  },
  {
    name: '菜园', dur: 13,
    pos: [[-7.4, 0.75, 8.2], [-7.1, 1.7, 8.8], [-6.8, 2.9, 9.4]],
    look: [[-12.2, 1.0, 1.8], [-8.5, 2.2, 1.2], [-2.0, 3.2, 0.5]],
    hfov: [52, 54], fstop: 5.6, focus: 'look', ev: 0, evNight: 0.55,
  },
  {
    name: '林间逆光', dur: 14, noSight: true,
    pos: [[-9.0, 1.4, -5.2], [-11.2, 1.5, -5.7], [-13.4, 1.6, -6.2]],
    look: [[-40, 4.5, -12.5], [-41, 4.8, -13.5], [-42, 5.0, -14.5]],
    hfov: [56, 54], fstop: 5.6, focus: 26, ev: -0.15,
  },
  {
    name: '全景', dur: 16, orbit: { r: 21, h: 5.2, a0: 30, a1: 95, look: [-0.5, 2.1, 1] },
    hfov: [56, 56], fstop: 8, focus: 'look', ev: 0,
  },
];

// Trees are kept off the low camera paths and out of each shot's line of sight.
const SHOT_CLEARANCE = (() => {
  const out = [];
  for (const s of SHOTS) {
    let pos = s.pos, look = s.look;
    if (s.orbit) {
      const o = s.orbit;
      pos = [];
      for (let i = 0; i <= 8; i++) {
        const a = lerp(o.a0, o.a1, i / 8) * DEG;
        pos.push([o.look[0] + Math.sin(a) * o.r, o.h, o.look[2] + Math.cos(a) * o.r]);
      }
      look = pos.map(() => o.look);
    }
    for (let i = 0; i < pos.length - 1; i++) {
      const [x0, h0, z0] = pos[i], [x1, h1, z1] = pos[i + 1];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, h = lerp(h0, h1, t);
        if (h > 24) continue;
        out.push([lerp(x0, x1, t), lerp(z0, z1, t), h > 10 ? 5.5 : 4.4]);
      }
    }
    // line of sight from the last third of the path toward the subject
    if (look && !s.noSight) {
      for (const i of [Math.max(0, pos.length - 2), pos.length - 1]) {
        const p = pos[i], l = look[Math.min(i, look.length - 1)];
        const d = Math.hypot(l[0] - p[0], l[2] - p[2]);
        for (let t = 0.1; t < 0.85; t += 2.5 / Math.max(d, 1)) out.push([lerp(p[0], l[0], t), lerp(p[2], l[2], t), 3.2]);
      }
    }
  }
  return out;
})();

class Director {
  constructor(app) {
    this.app = app;
    this.index = 0;
    this.t = 0;
    this.curves = SHOTS.map((s) => this.buildCurves(s));
    this.started = false;
    this.speed = app.reducedMotion ? 0.7 : 1;
    this.titleShown = false;
  }
  groundY(x, z, shot) {
    if (shot && shot.water) {
      const d = World.creekDist(x, z);
      const g = World.heightAt(x, z);
      if (d < 4) return Math.max(g, World.waterAt(World.creekField.param(x, z)));
      return g;
    }
    return World.heightAt(x, z);
  }
  buildCurves(s) {
    let pos, look;
    if (s.orbit) {
      const o = s.orbit, c = WORLD.clearing;
      pos = [];
      for (let i = 0; i <= 4; i++) {
        const a = lerp(o.a0, o.a1, i / 4) * DEG;
        const x = o.look[0] + Math.sin(a) * o.r, z = o.look[2] + Math.cos(a) * o.r;
        pos.push(new THREE.Vector3(x, this.groundY(x, z) + o.h + Math.sin((i / 4) * Math.PI) * 1.5, z));
      }
      const ly = World.heightAt(o.look[0], o.look[2]) + o.look[1];
      look = [new THREE.Vector3(o.look[0], ly, o.look[2]), new THREE.Vector3(o.look[0] - 1, ly, o.look[2] + 0.5)];
      void c;
    } else {
      const base = (p, isLook) => {
        if (s.porch || (isLook && s.focusFromFloor)) return new THREE.Vector3(p[0], (s.porch ? CABIN.PFL : World.heightAt(p[0], p[2])) + p[1], p[2]);
        return new THREE.Vector3(p[0], this.groundY(p[0], p[2], s) + p[1], p[2]);
      };
      pos = s.pos.map((p) => base(p, false));
      look = s.look.map((p) => base(p, true));
    }
    const focusPt = Array.isArray(s.focus) ? new THREE.Vector3(s.focus[0], (s.focusFromFloor ? CABIN.FL : World.heightAt(s.focus[0], s.focus[2])) + s.focus[1], s.focus[2]) : null;
    return {
      pos: new THREE.CatmullRomCurve3(pos, false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(look, false, 'centripetal'),
      focusPt,
    };
  }
  start(index = 0, t = 0) {
    this.index = ((index % SHOTS.length) + SHOTS.length) % SHOTS.length;
    this.t = t;
    this.started = true;
    const s = SHOTS[this.index];
    UI.setSlate(`${String(this.index + 1).padStart(2, '0')} / ${String(SHOTS.length).padStart(2, '0')}　${s.name}`);
  }
  next() {
    this.app.post.freezeFrame();
    this.app.crossfade(1.6);
    this.start(this.index + 1);
  }
  update(dt) {
    if (!this.started) this.start(0);
    const s = SHOTS[this.index];
    this.t += dt * this.speed;
    if (s.title) {
      const show = this.t > 2.2 && this.t < 10.5;
      if (show !== this.titleShown) { UI.showTitle(show); this.titleShown = show; }
    } else if (this.titleShown) {
      UI.showTitle(false);
      this.titleShown = false;
    }
    if (this.t >= s.dur) this.next();
  }
  apply(camera, time) {
    const s = SHOTS[this.index], c = this.curves[this.index];
    const u = clamp(this.t / s.dur, 0, 1);
    const e = easeInOutSine(u) * 0.85 + u * 0.15;
    const p = c.pos.getPoint(e), l = c.look.getPoint(e);
    if (!this.app.reducedMotion) {
      const k = 0.012;
      p.x += Noise.n2(time * 0.21, 1.1) * k * 1.4;
      p.y += Noise.n2(time * 0.17, 5.3) * k;
      p.z += Noise.n2(time * 0.19, 9.7) * k;
      l.x += Noise.n2(time * 0.13, 3.3) * k * 2.5;
      l.y += Noise.n2(time * 0.15, 7.7) * k * 2.5;
    }
    camera.position.copy(p);
    camera.up.set(0, 1, 0);
    camera.lookAt(l);
    const hfov = lerp(s.hfov[0], s.hfov[1], e);
    this.app.setHFov(hfov);
    const ps = this.app.post.state;
    ps.fstop = s.fstop;
    ps.autoFocus = false;
    if (c.focusPt) ps.focus = Math.max(0.5, p.distanceTo(c.focusPt));
    else if (typeof s.focus === 'number') ps.focus = s.focus;
    else ps.focus = Math.max(0.5, p.distanceTo(l));
    const night = smoothstep(1.3, 2, this.app.tod.value);
    this.app.shotExposure = Math.pow(2, (s.ev || 0) + (s.evNight || 0) * night);
  }
}

class OrbitRig {
  constructor(app) {
    this.app = app;
    this.target = new THREE.Vector3();
    this.radius = 18;
    this.theta = 0.6;
    this.phi = 1.25;
    this.vTheta = 0;
    this.vPhi = 0;
    this.vRadius = 0;
    this.panV = new THREE.Vector3();
    this.hfov = 58;
  }
  fromCamera(camera, lookDist) {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const c = WORLD.clearing;
    const t = camera.position.clone().addScaledVector(fwd, clamp(lookDist || 14, 4, 30));
    const dx = t.x - c.cx, dz = t.z - c.cz, d = Math.hypot(dx, dz);
    if (d > 16) { t.x = c.cx + (dx / d) * 16; t.z = c.cz + (dz / d) * 16; }
    t.y = Math.max(World.heightAt(t.x, t.z) + 0.8, Math.min(t.y, World.heightAt(t.x, t.z) + 6));
    this.target.copy(t);
    const off = camera.position.clone().sub(t);
    this.radius = clamp(off.length(), 3.5, 42);
    this.theta = Math.atan2(off.x, off.z);
    this.phi = clamp(Math.acos(clamp(off.y / Math.max(off.length(), 1e-3), -1, 1)), 0.35, 1.52);
    this.vTheta = this.vPhi = this.vRadius = 0;
    this.panV.set(0, 0, 0);
    this.hfov = this.app.currentHFov || 58;
  }
  rotate(dx, dy) {
    this.vTheta -= dx * 0.0052;
    this.vPhi -= dy * 0.0045;
  }
  zoom(f) { this.vRadius += Math.log(f) * 1.6; }
  pan(dx, dy) {
    const cam = this.app.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3(-right.z, 0, right.x);
    const k = this.radius * 0.0016;
    this.panV.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
  }
  update(dt) {
    const decay = Math.exp(-dt * 7.5);
    this.theta += this.vTheta * dt * 9;
    this.phi += this.vPhi * dt * 9;
    this.radius *= Math.exp(this.vRadius * dt * 9);
    this.target.addScaledVector(this.panV, dt * 9);
    this.vTheta *= decay;
    this.vPhi *= decay;
    this.vRadius *= decay;
    this.panV.multiplyScalar(decay);
    this.phi = clamp(this.phi, 0.35, 1.52);
    this.radius = clamp(this.radius, 3.5, 42);
    const c = WORLD.clearing;
    const dx = this.target.x - c.cx, dz = this.target.z - c.cz, d = Math.hypot(dx, dz);
    if (d > 16) { this.target.x = c.cx + (dx / d) * 16; this.target.z = c.cz + (dz / d) * 16; }
    const g = World.heightAt(this.target.x, this.target.z);
    this.target.y = clamp(this.target.y, g + 0.8, g + 6);
  }
  apply(camera) {
    const sp = Math.sin(this.phi);
    const p = new THREE.Vector3(Math.sin(this.theta) * sp, Math.cos(this.phi), Math.cos(this.theta) * sp).multiplyScalar(this.radius).add(this.target);
    // keep out of the ground and the cabin
    const g = World.heightAt(p.x, p.z);
    if (p.y < g + 0.45) p.y = g + 0.45;
    const inCabin = p.x > -4.1 && p.x < 4.8 && p.z > -3.3 && p.z < 5.3 && p.y < CABIN.FL + 5.3;
    if (inCabin) p.y = CABIN.FL + 5.3;
    camera.position.copy(p);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.target);
    this.app.setHFov(this.hfov);
    const ps = this.app.post.state;
    ps.autoFocus = true;
    ps.fstop = 5.6;
    ps.focus = this.radius;
    this.app.shotExposure = 1;
  }
}

// Pointer and wheel input: dragging in film mode hands the camera to the orbit rig.
function attachControls(app) {
  const el = document.getElementById('stage');
  const pointers = new Map();
  let last = null, pinch = null, moved = 0;
  const now = () => performance.now();
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
    last = { x: e.clientX, y: e.clientY };
    moved = 0;
    app.dragFlag = false;
    app.lastInput = now();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) {
      app.dragFlag = true;
      el.classList.add('dragging');
      if (app.mode !== 'free') app.setMode('free', { user: true });
    }
    app.lastInput = now();
    if (app.mode !== 'free') return;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (d > 0 && pinch.d > 0) app.orbit.zoom(pinch.d / d);
      app.orbit.pan(cx - pinch.cx, cy - pinch.cy);
      pinch = { d, cx, cy };
    } else if (p.button === 2 || p.shift) {
      app.orbit.pan(dx, dy);
    } else {
      app.orbit.rotate(dx, dy);
    }
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) el.classList.remove('dragging');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    app.lastInput = now();
    if (app.mode !== 'free') app.setMode('free', { user: true });
    app.orbit.zoom(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (app.mode !== 'free' || (e.target && /INPUT|SELECT/.test(e.target.tagName))) return;
    const k = { ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
    if (k) { app.orbit.rotate(k[0], k[1]); app.lastInput = now(); e.preventDefault(); }
  });
}
