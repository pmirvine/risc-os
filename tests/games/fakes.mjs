// Fakes for the GameLib tests: a canvas 2D context that records calls.

/** A fake 2D context whose canvas belongs to a fake document. */
export function fakeCtx() {
  const log = [];
  const made = [];
  const doc = {
    createElement(tag) {
      const canvas = {
        tag, width: 0, height: 0,
        getContext() {
          return {
            createImageData: (w, h) => ({
              width: w, height: h, data: new Uint8ClampedArray(w * h * 4),
            }),
            putImageData: (...a) => log.push(['putImageData', ...a]),
          };
        },
      };
      made.push(canvas);
      return canvas;
    },
  };
  const ctx = {
    canvas: { ownerDocument: doc },
    imageSmoothingEnabled: true,
    drawImage: (...a) => log.push(['drawImage', ...a]),
  };
  return { ctx, log, made };
}

/** A fake requestAnimationFrame with a clock the test advances. */
export function fakeTimers() {
  const t = { time: 0, queue: [], cancelled: new Set(), id: 0 };
  t.raf = (f) => { t.queue.push([++t.id, f]); return t.id; };
  t.caf = (id) => { t.cancelled.add(id); };
  t.now = () => t.time;
  /** Run the callbacks waiting now, with the clock at ms. */
  t.fire = (ms) => {
    t.time = ms;
    const q = t.queue; t.queue = [];
    for (const [id, f] of q) f(ms);
  };
  /** Run frames every `step` ms until `until` ms. */
  t.run = (step, until) => {
    for (let ms = t.time + step; ms <= until + 1e-6; ms += step) t.fire(ms);
  };
  return t;
}

/** A fake choices service: files by name; read/write can be made to fail. */
export function fakeChoices(files = {}) {
  const c = { files, reads: [], writes: [], failRead: null,
    failWrite: false };
  c.read = async (name, defaults) => {
    c.reads.push(name);
    if (c.failRead) throw new Error('read');
    return name in files ? files[name] : defaults;
  };
  c.write = async (name, obj) => {
    c.writes.push([name, obj]);
    if (c.failWrite) throw new Error('write');
    files[name] = obj;
  };
  return c;
}

/** A fake vfs that records mkdir calls and can be made to throw. */
export function fakeVfs() {
  const v = { made: [], fail: false };
  v.mkdir = (dir, opts) => {
    v.made.push([dir, opts]);
    if (v.fail) throw new Error('mkdir');
  };
  return v;
}

/** Fake system variables. */
export function fakeSysvars(vars = {}) {
  return { get: (n) => vars[n] };
}

/** A getGamepads function giving one fake standard pad. */
export function fakePads({ down = [], axes = [0, 0] } = {}) {
  const buttons = [];
  for (let i = 0; i < 16; i++) {
    buttons.push({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 });
  }
  return () => [null, { connected: true, buttons, axes }];
}

/** A fake AudioContext recording its sources and gains. */
export function fakeAudioContext({ state = 'suspended' } = {}) {
  const c = { state, sources: [], gains: [], resumed: 0, closed: 0,
    currentTime: 0, destination: { dest: true }, failSource: false };
  const param = (v = 1) => ({ value: v,
    setTargetAtTime(x) { this.value = x; },
    cancelScheduledValues() {} });
  c.resume = async () => { c.resumed++; c.state = 'running'; };
  c.close = async () => { c.closed++; c.state = 'closed'; };
  c.createBuffer = (ch, len, rate) => {
    const data = new Float32Array(len);
    return { length: len, sampleRate: rate, duration: len / rate,
      getChannelData: () => data };
  };
  c.createGain = () => {
    const g = { gain: param(), connect() {}, disconnect() {} };
    c.gains.push(g);
    return g;
  };
  c.createBufferSource = () => {
    if (c.failSource) throw new Error('no source');
    const s = { buffer: null, loop: false, playbackRate: param(),
      started: [], stopped: 0, connect() {}, disconnect() {},
      start(...a) { s.started.push(a); },
      stop() { s.stopped++; } };
    c.sources.push(s);
    return s;
  };
  return c;
}

/** A fake DOM element: style, children, listeners, a fixed box. */
export function fakeElement(tag = 'div', doc = null) {
  const el = { tag, style: {}, children: [], listeners: {}, width: 0,
    height: 0, removed: 0, box: { left: 0, top: 0, width: 0, height: 0 },
    clientWidth: 0, clientHeight: 0, ownerDocument: doc };
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.remove = () => { el.removed++; };
  el.addEventListener = (type, f) => {
    (el.listeners[type] ??= []).push(f);
  };
  el.getBoundingClientRect = () => ({ ...el.box });
  el.getContext = () => (el.ctx ??= { canvas: el, drawn: [] });
  /** Dispatch an event; the fake event records preventDefault. */
  el.fire = (type, props = {}) => {
    const ev = { type, ...props, prevented: 0, stopped: 0,
      preventDefault() { this.prevented++; },
      stopPropagation() { this.stopped++; } };
    for (const f of el.listeners[type] ?? []) f(ev);
    return ev;
  };
  return el;
}

/** A fake document; installs nothing itself (the test sets it). */
export function fakeDocument() {
  const doc = { made: [], fullscreenElement: null, fullRequests: 0,
    exits: 0 };
  doc.createElement = (tag) => {
    const el = fakeElement(tag, doc);
    doc.made.push(el);
    return el;
  };
  doc.documentElement = {
    requestFullscreen() { doc.fullRequests++; doc.fullscreenElement = 1;
      return Promise.resolve(); } };
  doc.exitFullscreen = () => { doc.exits++; doc.fullscreenElement = null;
    return Promise.resolve(); };
  return doc;
}

/** A fake window as task.createWindow returns it (see CORE_API). */
export function fakeWindow(def) {
  const w = { def, w: def.w, h: def.h, view: fakeElement('div'),
    handlers: {}, opens: [], deleted: 0 };
  w.on = (name, f) => { (w.handlers[name] ??= []).push(f); };
  w.open = (o) => { w.opens.push(o); };
  w.delete = () => { w.deleted++; };
  /** Emit a window event; returns the event, with preventDefault. */
  w.emit = (name, props = {}) => {
    const ev = { ...props, prevented: 0,
      preventDefault() { this.prevented++; } };
    for (const f of w.handlers[name] ?? []) f(ev);
    return ev;
  };
  return w;
}

/** A fake task whose createWindow records its definitions. */
export function fakeTask() {
  const t = { windows: [] };
  t.createWindow = (def) => {
    const w = fakeWindow(def);
    t.windows.push(w);
    return w;
  };
  return t;
}

/** A fake wimp: screen size, scale, and the caret. */
export function fakeWimp({ width = 1024, height = 768, scale = 1 } = {}) {
  const w = { width, height, scale, caret: { window: null } };
  w.setCaret = (win) => { w.caret = { window: win }; };
  return w;
}

/** A fake os with cli.acquireScreen as cli.js gives it. */
export function fakeOs(wimp) {
  const os = { acquired: [], released: 0 };
  os.cli = { acquireScreen(opts) {
    const el = fakeElement('div');
    el.clientWidth = wimp.width;
    el.clientHeight = wimp.height;
    os.acquired.push(opts);
    return { el, width: wimp.width, height: wimp.height,
      release() { os.released++; } };
  } };
  return os;
}
