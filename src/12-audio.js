/* Ambience: procedural WebAudio soundscape. Wind follows the same gust signal that moves the grass,
   the creek and the fire get louder as the camera approaches, birds sing at dawn and dusk, and
   crickets and an owl take over at night. Starts only from the sound button. */

const Ambience = {
  ctx: null,
  master: null,
  enabled: false,
  buses: {},
  timers: { bird: 2, cricket: 0.5, owl: 12, crackle: 0 },
  levels: { birds: 0, crickets: 0, owl: 0, fire: 0 },

  setEnabled(on, app) {
    this.enabled = on;
    if (on) {
      if (!this.ctx) this.build();
      if (!this.ctx) return;
      this.ctx.resume().catch(() => {});
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.85, t, 0.6);
    } else if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.2);
      setTimeout(() => { if (!this.enabled && this.ctx) this.ctx.suspend().catch(() => {}); }, 900);
    }
    void app;
  },

  noiseBuffer(seconds, color) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (color === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
        } else d[i] = w;
      }
    }
    return buf;
  },

  loop(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  },

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch { return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    const bus = (name, gain = 0) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(this.master);
      this.buses[name] = g;
      return g;
    };
    const brown = this.noiseBuffer(6, 'brown');
    const pink = this.noiseBuffer(6, 'pink');
    this.white = this.noiseBuffer(0.05, 'white');

    // wind: low roar whose brightness follows the gusts
    const wind = bus('wind');
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 420;
    windLp.Q.value = 0.6;
    this.loop(brown).connect(windLp).connect(wind);
    this.windLp = windLp;

    // leaves rustling in the canopy
    const rustle = bus('rustle');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 0.5;
    this.loop(pink).connect(hp).connect(bp).connect(rustle);
    const flutter = ctx.createOscillator();
    const flutterGain = ctx.createGain();
    flutter.frequency.value = 0.7;
    flutterGain.gain.value = 0.35;
    flutter.connect(flutterGain).connect(rustle.gain);
    flutter.start();

    // creek: two bands of babbling water
    const creek = bus('creek');
    for (const [f, q, k] of [[700, 0.8, 1], [2300, 1.2, 0.55]]) {
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = f;
      f1.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = k;
      this.loop(pink).connect(f1).connect(g).connect(creek);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.3 + Math.random() * 0.4;
      lg.gain.value = f * 0.25;
      lfo.connect(lg).connect(f1.frequency);
      lfo.start();
    }

    // fire: low rumble plus scheduled crackles
    const fire = bus('fire');
    const flp = ctx.createBiquadFilter();
    flp.type = 'lowpass';
    flp.frequency.value = 260;
    const fg = ctx.createGain();
    fg.gain.value = 0.6;
    this.loop(brown).connect(flp).connect(fg).connect(fire);
    this.crackleBp = ctx.createBiquadFilter();
    this.crackleBp.type = 'bandpass';
    this.crackleBp.frequency.value = 3000;
    this.crackleBp.Q.value = 0.7;
    this.crackleBp.connect(fire);

    bus('birds', 1);
    bus('crickets', 1);
    // owl through a soft echo
    const owl = bus('owl', 1);
    this.owlIn = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.owlIn.connect(owl);
    this.owlIn.connect(delay).connect(lp).connect(fb).connect(delay);
    lp.connect(owl);
  },

  panner(x) {
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(x, -1, 1);
      return p;
    }
    return this.ctx.createGain();
  },

  chirp(level) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const pan = this.panner(Math.random() * 1.6 - 0.8);
    o.type = 'sine';
    g.gain.value = 0;
    const base = 2600 + Math.random() * 2200;
    const notes = 2 + Math.floor(Math.random() * 5);
    const vol = (0.02 + Math.random() * 0.03) * level;
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const d = 0.05 + Math.random() * 0.09;
      const f0 = base * (0.85 + Math.random() * 0.35), f1 = f0 * (Math.random() < 0.5 ? 0.62 : 1.35);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      t += d + 0.03 + Math.random() * 0.07;
    }
    o.connect(g).connect(pan).connect(this.buses.birds);
    o.start(t0);
    o.stop(t + 0.1);
  },

  cricket(level) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const o = ctx.createOscillator();
    const am = ctx.createOscillator();
    const amg = ctx.createGain();
    const g = ctx.createGain();
    const pan = this.panner(Math.random() * 1.8 - 0.9);
    o.frequency.value = 4200 + Math.random() * 900;
    am.frequency.value = 26 + Math.random() * 10;
    amg.gain.value = 0.5;
    g.gain.value = 0;
    am.connect(amg).connect(g.gain);
    const vol = (0.006 + Math.random() * 0.01) * level;
    const pulses = 2 + Math.floor(Math.random() * 3);
    let t = t0;
    for (let i = 0; i < pulses; i++) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.13);
      t += 0.2;
    }
    o.connect(g).connect(pan).connect(this.buses.crickets);
    o.start(t0); am.start(t0);
    o.stop(t + 0.1); am.stop(t + 0.1);
  },

  hoot(level) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const pattern = [[0, 0.22, 1], [0.4, 0.18, 0.8], [0.75, 0.6, 1]];
    for (const [dt, dur, k] of pattern) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(390, t0 + dt);
      o.frequency.linearRampToValueAtTime(350, t0 + dt + dur);
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.linearRampToValueAtTime(0.05 * level * k, t0 + dt + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + dur);
      o.connect(g).connect(this.owlIn);
      o.start(t0 + dt);
      o.stop(t0 + dt + dur + 0.05);
    }
  },

  crackle(level) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    s.playbackRate.value = 0.5 + Math.random() * 1.5;
    const g = ctx.createGain();
    g.gain.value = (0.08 + Math.random() * 0.25) * level;
    s.connect(g).connect(this.crackleBp);
    s.start(ctx.currentTime + Math.random() * 0.05, 0, 0.004 + Math.random() * 0.012);
  },

  update(app, dt) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const p = app.params, t = this.ctx.currentTime, cam = app.camera.position;
    const set = (bus, v) => this.buses[bus].gain.setTargetAtTime(v, t, 0.4);
    const gust = app.gust;
    set('wind', (0.05 + 0.13 * gust) * (p.wind ?? 0.8));
    this.windLp.frequency.setTargetAtTime(260 + 520 * gust, t, 0.5);
    set('rustle', (0.012 + 0.05 * gust * gust) * (p.wind ?? 0.8));
    const dc = World.creekDist(cam.x, cam.z);
    set('creek', 0.22 * (1 - smoothstep(3, 38, dc)) + 0.015);
    const fire = app.yard.emitters.fire;
    const df = Math.hypot(cam.x - fire.x, cam.z - fire.z);
    const fireLevel = (p.fire || 0) * (1 - smoothstep(2, 24, df));
    set('fire', 0.35 * fireLevel);
    this.timers.bird -= dt;
    if (this.timers.bird <= 0) {
      if (p.birds > 0.08) this.chirp(p.birds);
      this.timers.bird = (1.2 + Math.random() * 4) / Math.max(0.25, p.birds);
    }
    this.timers.cricket -= dt;
    if (this.timers.cricket <= 0) {
      if (p.crickets > 0.08) this.cricket(p.crickets);
      this.timers.cricket = (0.15 + Math.random() * 0.6) / Math.max(0.3, p.crickets);
    }
    this.timers.owl -= dt;
    if (this.timers.owl <= 0) {
      if (p.owl > 0.2) this.hoot(p.owl);
      this.timers.owl = 14 + Math.random() * 22;
    }
    this.timers.crackle -= dt;
    while (this.timers.crackle <= 0) {
      if (fireLevel > 0.05) this.crackle(fireLevel);
      this.timers.crackle += 0.04 + Math.random() * 0.25;
    }
  },
};
