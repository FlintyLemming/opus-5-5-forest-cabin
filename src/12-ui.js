/* UI: loader, title card, slate, control bar, hints, idle hiding and the error panel. */

// Self-contained so it works even if the rest of the module never finished initializing.
function showFatal(message, err) {
  if (err) console.error(err);
  const panel = document.getElementById('error');
  const text = document.getElementById('error-text');
  if (!panel || !text) return;
  text.textContent = message;
  panel.hidden = false;
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('done');
  const reload = document.getElementById('error-reload');
  if (reload) reload.onclick = () => location.reload();
}

const TIME_NAMES = [
  [0.0, '清晨'], [0.5, '白昼'], [1.0, '黄昏'], [1.5, '蓝调时分'], [2.0, '月夜'],
];
function timeName(t) {
  let best = TIME_NAMES[0];
  for (const n of TIME_NAMES) if (Math.abs(n[0] - t) < Math.abs(best[0] - t)) best = n;
  return best[1];
}

const UI = {
  app: null,
  idleTimer: 0,
  hintTimer: 0,
  lastPointer: 0,
  els: {},

  init(app) {
    this.app = app;
    const $ = (id) => document.getElementById(id);
    this.els = {
      body: document.body,
      stage: $('stage'),
      loaderFill: $('loader-fill'),
      loaderText: $('loader-text'),
      loader: $('loader'),
      title: $('titlecard'),
      titleTime: $('title-time'),
      slate: $('slate'),
      hint: $('hint'),
      hud: $('hud'),
      bar: $('bar'),
      modeCine: $('mode-cine'),
      modeFree: $('mode-free'),
      time: $('time'),
      ticks: [...document.querySelectorAll('.ticks button')],
      sound: $('sound'),
      quality: $('quality'),
      hideUi: $('hide-ui'),
      fullscreen: $('fullscreen'),
    };
    const e = this.els;
    e.modeCine.addEventListener('click', () => app.setMode('cine', { user: true }));
    e.modeFree.addEventListener('click', () => app.setMode('free', { user: true }));
    e.time.addEventListener('input', () => app.setTimeTarget(parseFloat(e.time.value), false));
    for (const b of e.ticks) b.addEventListener('click', () => app.setTimeTarget(parseFloat(b.dataset.time), true));
    e.sound.addEventListener('click', () => app.toggleSound());
    e.quality.addEventListener('change', () => app.setQuality(e.quality.value, true));
    e.hideUi.addEventListener('click', (ev) => { ev.stopPropagation(); this.setHidden(true); });
    e.fullscreen.addEventListener('click', () => this.toggleFullscreen());
    if (!document.fullscreenEnabled) e.fullscreen.hidden = true;

    const wake = () => this.poke();
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    e.bar.addEventListener('focusin', wake);
    e.stage.addEventListener('click', () => {
      if (document.body.classList.contains('hide-ui') && !app.wasDrag()) this.setHidden(false);
    });
    this.poke();
  },

  onKey(ev) {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') && !['h', 'H', 'f', 'F'].includes(ev.key)) return;
    if (ev.key === 'h' || ev.key === 'H') this.setHidden(!document.body.classList.contains('hide-ui'));
    else if (ev.key === 'f' || ev.key === 'F') this.toggleFullscreen();
    else if (ev.key === '1') this.app.setTimeTarget(0, true);
    else if (ev.key === '2') this.app.setTimeTarget(1, true);
    else if (ev.key === '3') this.app.setTimeTarget(2, true);
    else return;
    this.poke();
  },

  poke() {
    document.body.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const bar = this.els.bar;
      if (bar.matches(':hover') || bar.contains(document.activeElement)) return this.poke();
      document.body.classList.add('idle');
    }, 3200);
  },

  setHidden(hidden) {
    document.body.classList.toggle('hide-ui', hidden);
    if (!hidden) this.poke();
  },

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* fullscreen is optional; some views refuse it */ }
  },

  progress(frac, text) {
    this.els.loaderFill.style.transform = `scaleX(${clamp(frac, 0, 1).toFixed(3)})`;
    if (text) this.els.loaderText.textContent = text;
  },

  done() {
    this.els.loader.classList.add('done');
    this.els.loader.setAttribute('aria-busy', 'false');
  },

  setMode(mode) {
    this.els.modeCine.setAttribute('aria-pressed', String(mode === 'cine'));
    this.els.modeFree.setAttribute('aria-pressed', String(mode === 'free'));
    this.els.slate.hidden = mode !== 'cine';
  },

  setTimeValue(t) {
    const e = this.els;
    if (document.activeElement !== e.time) e.time.value = t.toFixed(3);
    const name = timeName(t);
    e.time.setAttribute('aria-valuetext', name);
    e.titleTime.textContent = name;
    for (const b of e.ticks) b.classList.toggle('near', Math.abs(parseFloat(b.dataset.time) - t) < 0.25);
  },

  setQuality(key) {
    this.els.quality.value = key;
  },

  setSound(on) {
    this.els.sound.setAttribute('aria-pressed', String(on));
  },

  showTitle(show) {
    this.els.title.classList.toggle('show', !!show);
  },

  setSlate(text) {
    this.els.slate.textContent = text;
  },

  hint(text, ms = 5000) {
    const h = this.els.hint;
    h.textContent = text;
    h.hidden = false;
    h.style.opacity = '1';
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      h.style.opacity = '0';
      this.hintTimer = setTimeout(() => { h.hidden = true; }, 900);
    }, ms);
  },
};
