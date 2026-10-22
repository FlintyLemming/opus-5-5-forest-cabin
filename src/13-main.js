/* Main: builds the scene in stages behind the loader, owns time of day, quality, resolution and the frame loop. */

const App = {
  renderer: null,
  scene: null,
  camera: null,
  post: null,
  T: null,
  lights: {},
  qualityKey: 'high',
  quality: QUALITY_TIERS.high,
  renderScale: 1,
  scaleCeil: 1,
  clock: { time: 0, frozen: null, paused: false, last: 0 },
  tod: { value: 1, from: 1, to: 1, anim: 1, dur: 4, dirty: true },
  params: {},
  envTimer: 0,
  systems: [],
  mode: 'cine',
  gust: 0.5,
  perf: { acc: 0, frames: 0, slow: 0, fast: 0, cooldown: 0 },
  dragFlag: false,
  manualCamera: null,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  shotExposure: 1,
  currentHFov: 58,
  lastInput: 0,
  cross: null,
  fadeIn: null,
  sound: false,

  async init() {
    const canvas = document.getElementById('stage');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    } catch (err) {
      showFatal('这个浏览器没有可用的 WebGL2，无法显示三维场景。请换用新版的 Chrome、Edge、Safari 或 Firefox 再打开。', err);
      return;
    }
    if (!renderer.capabilities.isWebGL2) {
      showFatal('这个浏览器没有可用的 WebGL2，无法显示三维场景。请换用新版的 Chrome、Edge、Safari 或 Firefox 再打开。');
      return;
    }
    this.renderer = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.info.autoReset = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      showFatal('显卡上下文丢失了（可能是设备休眠或显卡驱动重置）。重新加载页面即可恢复。');
    });

    this.qualityKey = detectQuality(renderer);
    this.quality = QUALITY_TIERS[this.qualityKey];
    UI.init(this);
    UI.setQuality(this.qualityKey);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.layers.enable(1);
    this.post = new PostFX(renderer);
    this.post.setQuality(this.quality);
    CreekMirror.setQuality(this.quality);
    this.post.state.fade = 1;

    const stages = this.stages();
    for (let i = 0; i < stages.length; i++) {
      UI.progress(i / stages.length, stages[i][0]);
      await nextFrame();
      await stages[i][1]();
    }
    UI.progress(1, '即将开始');
    this.director = new Director(this);
    this.orbit = new OrbitRig(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.applyQuality();
    this.updateTimeOfDay(0, true);
    Sky.updateEnv(renderer, true);
    this.placeCamera(0, 0);
    this.fx.prewarm(this.camera);
    try {
      await renderer.compileAsync(this.scene, this.camera);
    } catch { /* compileAsync is an optimization only */ }
    this.frame(1 / 60);
    this.frame(1 / 60);
    await nextFrame();

    attachControls(this);
    UI.done();
    this.fadeIn = { t: 0, dur: 2.6 };
    window.__cabin.ready = true;
    this.clock.last = performance.now();
    renderer.setAnimationLoop((now) => this.tick(now));
  },

  stages() {
    const r = this.renderer, s = this.scene;
    return [
      ['铺展地形', () => {
        this.T = buildTextures(r);
        World.build();
        s.add(World.buildTerrain(this.T));
        s.add(World.buildWater(this.T));
      }],
      ['天空与远山', () => {
        s.add(Sky.build(r));
        s.add(Sky.buildRidges());
        s.add(Sky.buildCanopy(this.T));
      }],
      ['搭建木屋', () => {
        this.M = cabinMaterials(this.T);
        this.cabin = buildCabin(this.T, this.M);
        s.add(this.cabin.group);
      }],
      ['布置院落', () => {
        yardMaterials(this.T, this.M);
        this.yard = buildYard(this.T, this.M, this.cabin);
        s.add(this.yard.group);
      }],
      ['种下松杉与白桦', () => {
        forestMaterials(this.T, this.M);
        this.forest = buildForest(this.T, this.M, typeof SHOT_CLEARANCE !== 'undefined' ? SHOT_CLEARANCE : []);
        s.add(this.forest.group);
        this.systems.push(this.forest);
      }],
      ['生长草地', () => {
        this.grass = buildGrass(this.cabin, this.yard, this.forest);
        s.add(this.grass.mesh);
        this.systems.push(this.grass);
        this.ground = buildGroundCover(this.T, this.M, this.cabin, this.yard, this.forest);
        s.add(this.ground.group);
        World.commitMask();
      }],
      ['点亮窗灯', () => {
        this.buildLights();
        this.fx = buildFX(this.T, this.M, this.cabin, this.yard, this.forest);
        s.add(this.fx.group);
        this.systems.push(this.fx);
      }],
    ];
  },

  buildLights() {
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.castShadow = true;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.035;
    this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.2);
    this.scene.add(fill, fill.target);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(hemi);
    this.lights = { key, fill, hemi };
  },

  fitShadow() {
    const key = this.lights.key;
    const dir = U.uScatterDir.value;
    const c = WORLD.clearing;
    const target = new THREE.Vector3(c.cx, World.cabinY, c.cz - 2);
    key.target.position.copy(target);
    key.position.copy(target).addScaledVector(dir, 260);
    key.target.updateMatrixWorld();
    key.updateMatrixWorld();
    key.shadow.updateMatrices(key);
    const cam = key.shadow.camera;
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    const ext = 40;
    for (const x of [c.cx - ext, c.cx + ext]) for (const y of [World.cabinY - 6, World.cabinY + 30]) for (const z of [c.cz - ext - 4, c.cz + ext]) {
      v.set(x, y, z).applyMatrix4(inv);
      min.min(v);
      max.max(v);
    }
    cam.left = min.x; cam.right = max.x; cam.bottom = min.y; cam.top = max.y;
    cam.near = Math.max(0.5, -max.z - 120);
    cam.far = -min.z + 10;
    cam.updateProjectionMatrix();
    const fd = dirFromAngles(this.params.keyAz + 180, 6, new THREE.Vector3());
    this.lights.fill.target.position.copy(target);
    this.lights.fill.position.copy(target).addScaledVector(fd, 60);
    this.lights.fill.target.updateMatrixWorld();
  },

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const outW = Math.round(w * dpr), outH = Math.round(h * dpr);
    this.post.setSize(outW * this.renderScale, outH * this.renderScale, outW, outH);
    CreekMirror.setSize(this.post.w, this.post.h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewW = w;
    this.viewH = h;
  },

  setQuality(key, user = false) {
    if (!QUALITY_TIERS[key]) return;
    this.qualityKey = key;
    this.quality = QUALITY_TIERS[key];
    if (user) storage.set('linjian.quality', key);
    this.renderScale = 1;
    this.scaleCeil = 1;
    this.post.setQuality(this.quality);
    CreekMirror.setQuality(this.quality);
    this.applyQuality();
    this.resize();
    UI.setQuality(key);
  },

  applyQuality() {
    const q = this.quality;
    const key = this.lights.key;
    if (key && key.shadow.mapSize.x !== q.shadowSize) {
      key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (key.shadow.map) {
        key.shadow.map.dispose();
        key.shadow.map = null;
      }
    }
    for (const s of this.systems) if (s.setQuality) s.setQuality(q);
  },

  setTimeTarget(v, animate) {
    const t = this.tod;
    v = clamp(v, 0, 2);
    if (!animate) {
      t.value = t.to = v;
      t.anim = 1;
      t.dirty = true;
    } else {
      t.from = t.value;
      t.to = v;
      t.anim = 0;
      t.dur = 2.2 + Math.abs(v - t.value) * 2.2;
    }
  },

  updateTimeOfDay(dt, force = false) {
    const t = this.tod;
    if (t.anim < 1) {
      t.anim = Math.min(1, t.anim + dt / t.dur);
      t.value = lerp(t.from, t.to, easeInOutSine(t.anim));
      t.dirty = true;
    }
    if (!t.dirty && !force) return;
    t.dirty = false;
    const p = samplePresets(t.value, this.params);
    applyTimeParams(p, this.lights);
    this.fitShadow();
    const s = this.post.state;
    s.temp = p.temp;
    s.tint = p.tint;
    s.contrast = p.contrast * 1.2;
    s.sat = p.sat * 1.12;
    s.split = p.split;
    s.lift = p.lift * 0.6;
    s.shadowTint.copy(p.shadowTint);
    s.highTint.copy(p.highTint);
    s.bloom = p.bloom;
    s.rays = p.rays;
    for (const sys of this.systems) if (sys.setTime) sys.setTime(p);
    Sky.envDirty = true;
    UI.setTimeValue(t.value);
  },

  updateWind(time) {
    const g = 0.5 + 0.35 * Noise.n2(time * 0.07, 3.7) + 0.25 * Noise.n2(time * 0.21, 8.1);
    this.gust = clamp(g, 0, 1);
    const a = (-35 + 12 * Noise.n2(time * 0.01, 1.3)) * DEG;
    U.uWind.value.set(Math.sin(a), Math.cos(a), this.params.wind ?? 0.8, this.gust);
  },

  placeCamera(dt = 0, time = 0) {
    if (this.manualCamera) {
      const m = this.manualCamera;
      this.camera.position.copy(m.pos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(m.look);
      this.setHFov(m.fov);
      this.post.state.focus = m.pos.distanceTo(m.look);
      this.post.state.fstop = m.fstop || 5.6;
      this.post.state.autoFocus = false;
      this.shotExposure = 1;
      return;
    }
    if (this.mode === 'cine') {
      this.director.update(dt);
      this.director.apply(this.camera, time);
    } else {
      this.orbit.update(dt);
      this.orbit.apply(this.camera);
      if (performance.now() - this.lastInput > 30000 && !this.clock.frozen) this.setMode('cine');
    }
  },

  // Horizontal field of view stays constant across aspect ratios; portrait screens crop the sides.
  setHFov(hfov) {
    this.currentHFov = hfov;
    const fit = Math.max(this.camera.aspect, 0.9);
    const fov = (2 * Math.atan(Math.tan((hfov * DEG) / 2) / fit)) / DEG;
    if (Math.abs(fov - this.camera.fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  },

  crossfade(dur) {
    this.post.state.cross = 0;
    this.cross = { t: 0, dur };
  },

  setMode(mode, { user = false } = {}) {
    if (mode === this.mode) return;
    if (mode === 'free') {
      this.orbit.fromCamera(this.camera, this.post.state.focus);
      UI.showTitle(false);
      this.director.titleShown = false;
      const touch = matchMedia('(pointer: coarse)').matches;
      UI.hint(touch ? '单指拖动旋转 · 双指缩放和平移 · 闲置片刻后回到电影镜头' : '拖动旋转 · 滚轮缩放 · 右键或 Shift 拖动平移 · 闲置片刻后回到电影镜头', 6000);
    } else {
      this.post.freezeFrame();
      this.crossfade(1.6);
      this.director.start(this.director.index + 1);
    }
    this.mode = mode;
    this.lastInput = performance.now();
    UI.setMode(mode);
    void user;
  },
  toggleSound() {
    this.sound = !this.sound;
    if (typeof Ambience !== 'undefined') Ambience.setEnabled(this.sound, this);
    UI.setSound(this.sound);
    storage.set('linjian.sound', this.sound ? '1' : '0');
  },
  wasDrag() { return this.dragFlag; },

  updateFrameState(dt) {
    const s = this.post.state;
    if (this.cross) {
      this.cross.t += dt;
      s.cross = smoothstep(0, 1, this.cross.t / this.cross.dur);
      if (this.cross.t >= this.cross.dur) { s.cross = 1; this.cross = null; }
    }
    if (this.fadeIn) {
      this.fadeIn.t += dt;
      s.fade = 1 - smoothstep(0, 1, this.fadeIn.t / this.fadeIn.dur);
      if (this.fadeIn.t >= this.fadeIn.dur) { s.fade = 0; this.fadeIn = null; }
    }
    const aspect = this.camera.aspect;
    const target = this.mode === 'cine' && !this.manualCamera && aspect > 1.15 && aspect < 2.39 ? (1 - aspect / 2.39) / 2 : 0;
    s.bars = this.manualBars ?? damp(s.bars, target, 3, dt);
    s.exposure = (this.params.exposure || 1) * this.shotExposure;
    s.grain = this.reducedMotion ? 0.02 : 0.035;
  },

  tick(now) {
    const dt = Math.min(0.1, Math.max(0, (now - this.clock.last) / 1000));
    this.clock.last = now;
    if (this.clock.paused) return;
    this.measure(dt);
    this.frame(dt);
  },

  measure(dt) {
    const p = this.perf;
    p.acc += dt;
    p.frames++;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.acc < 1) return;
    const avg = p.acc / p.frames;
    p.acc = 0;
    p.frames = 0;
    if (avg > 0.024) { p.slow++; p.fast = 0; } else if (avg < 0.0185) { p.fast++; p.slow = 0; } else { p.slow = 0; p.fast = 0; }
    if (p.slow >= 2 && this.renderScale > 0.6) {
      this.scaleCeil = this.renderScale;
      this.renderScale = Math.max(0.6, this.renderScale - 0.1);
      p.slow = 0;
      p.cooldown = 6;
      this.resize();
    } else if (p.fast >= 6 && p.cooldown <= 0 && this.renderScale < this.scaleCeil - 0.01) {
      this.renderScale = Math.min(this.scaleCeil - 0.05, this.renderScale + 0.05);
      p.fast = 0;
      p.cooldown = 4;
      this.resize();
    }
  },

  frame(dt) {
    this.renderer.info.reset();
    if (this.clock.frozen === null) this.clock.time += dt;
    const time = this.clock.frozen ?? this.clock.time;
    U.uTime.value = time;
    this.updateWind(time);
    this.updateTimeOfDay(dt);
    this.envTimer += dt;
    if (Sky.envDirty && (this.envTimer > 0.3 || this.tod.anim >= 1)) {
      Sky.updateEnv(this.renderer);
      this.envTimer = 0;
    }
    this.placeCamera(dt, time);
    this.updateFrameState(dt);
    for (const s of this.systems) if (s.update) s.update(dt, time, this);
    Ambience.update(this, dt);
    Sky.dome.position.copy(this.camera.position);
    this.post.updateSun(this.camera, U.uScatterDir.value, this.params.keyEl);
    CreekMirror.update(this);
    this.post.render(this.scene, this.camera, time, dt);
  },

  stats() {
    const info = this.renderer.info;
    return {
      quality: this.qualityKey,
      scale: this.renderScale,
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      size: [this.post.w, this.post.h],
    };
  },
};

window.__cabin = {
  ready: false,
  freeze(t) { App.clock.frozen = t; },
  unfreeze() { App.clock.frozen = null; },
  pause(p = true) { App.clock.paused = p; },
  renderFrames(n = 1) { for (let i = 0; i < n; i++) App.frame(1 / 30); },
  setTime(v) { App.setTimeTarget(v, false); App.updateTimeOfDay(0, true); Sky.updateEnv(App.renderer, true); },
  setQuality(k) { App.setQuality(k); },
  setCamera(pos, look, hfov = 50, fstop = 5.6) {
    App.manualCamera = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov: hfov, fstop };
  },
  clearCamera() { App.manualCamera = null; },
  setShot(i, u = 0.5) {
    document.body.classList.add('no-anim');
    UI.showTitle(SHOTS[i].title && SHOTS[i].dur * u > 2.2 && SHOTS[i].dur * u < 10.5);
    App.director.titleShown = !!(SHOTS[i].title && SHOTS[i].dur * u > 2.2 && SHOTS[i].dur * u < 10.5);
    App.manualCamera = null;
    App.mode = 'cine';
    UI.setMode('cine');
    App.director.start(i, SHOTS[i].dur * u);
    App.post.state.cross = 1;
    App.cross = null;
    App.fadeIn = null;
    App.post.state.fade = 0;
  },
  setMode(m) { App.setMode(m); },
  bars(v) { App.manualBars = v; },
  setPost(o) { Object.assign(App.post.state, o); },
  stats() { return App.stats(); },
  breakdown() {
    const rows = [];
    App.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const n = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
      rows.push([o.name || o.type, Math.round(tris), n, Math.round(tris * n), o.castShadow ? 'S' : '']);
    });
    rows.sort((a, b) => b[3] - a[3]);
    return rows.slice(0, 40).map((r) => r.join(' | ')).join('\n');
  },
  groundY(x, z) { return World.heightAt(x, z); },
  preset(i, o) {
    for (const [k, v] of Object.entries(o)) PRESETS[i][k] = PRESET_COLORS.includes(k) ? lin(v) : v;
    App.updateTimeOfDay(0, true);
    Sky.updateEnv(App.renderer, true);
  },
  obj(name) { return App.scene.getObjectByName(name); },
  show(name, v = true) { const o = App.scene.getObjectByName(name); if (o) o.visible = v; return !!o; },
};

App.init().catch((err) => showFatal('场景初始化时出错：' + (err && err.message ? err.message : String(err)), err));
