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
