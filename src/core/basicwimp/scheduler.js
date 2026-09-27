// Time sharing for desktop BASIC programs: one cooperative scheduler for every BasicProcess, a speed
// limit per program, and a steady 50Hz "vsync" for WAIT / *FX 19.
//
// A BasicMachine runs its program in slices (BasicMachine.slice(): micro-ops until sliceMs has passed or
// its opsPerSecond allowance is used up) and awaits anything slice() returns that is a Promise. A job
// wraps the machine's slice() so that it may only run when the scheduler grants it a turn:
//
//   * turns go round the waiting jobs in order (fair: every runnable program gets a slice in turn);
//   * all BASIC together may use at most `busyMs` of every `periodMs` (default 11 of 16ms), so the
//     desktop (redraws, pointer, other tasks) keeps the rest of each frame whatever the programs do
//     (15 of 16ms while a job is `foreground`: a program full screen, with the desktop hidden);
//   * a job with a speed limit (ops/second, the machine's token bucket) that has used its allowance waits
//     until it has enough for a useful slice again, without spinning;
//   * a suspended job gets no turns; a removed job runs unscheduled (so a killed program can finish).
//
// No DOM here: node tests (tests/basic/scheduler.test.mjs) drive it with a fake clock.

/**
 * Speed settings. `ops` = BASIC micro-ops per second (BasicMachine.opsPerSecond; 0 = as fast as possible).
 * A micro-op is one compiled statement step (roughly one BASIC statement or loop step). The figures come
 * from the CLOCKSP benchmark (J.G.Harston's, results collected on stardot) relative to a 2MHz BBC B
 * (CLOCKSP 2.00). The PCW benchmarks BM1-BM8 take 89023 micro-ops here and 69.8s on a BBC B (BASIC II),
 * i.e. a BBC B does about 1275 of our micro-ops a second; each machine is that times CLOCKSP / 2:
 *   ARM2      A310/A3000 8MHz          CLOCKSP  ~45   ->    30,000 ops/s
 *   ARM3      A5000/A410-1 25MHz       CLOCKSP ~205   ->   130,000 ops/s
 *   ARM610    Risc PC 30MHz            CLOCKSP ~298   ->   190,000 ops/s
 *   StrongARM Risc PC 233MHz           CLOCKSP ~3375  -> 2,150,000 ops/s
 * (Unthrottled, this interpreter does about 10M ops/s on a 2020s laptop.) Graphics operations (PLOT,
 * CIRCLE FILL, CLG...) count as one op each, so drawing-heavy programs run faster than they did.
 */
export const SPEEDS = {
  arm2: { name: 'ARM2', ops: 30000 },
  arm3: { name: 'ARM3', ops: 130000 },
  arm610: { name: 'ARM610', ops: 190000 },
  strongarm: { name: 'StrongARM', ops: 2150000 },
  unlimited: { name: 'Unlimited', ops: 0 },
};
export const DEFAULT_SPEED = 'strongarm';

/** A speed name ('arm3') or a number of ops/second -> {key, ops}. */
export function speedOps(s) {
  if (typeof s === 'number') return { key: Object.keys(SPEEDS).find((k) => SPEEDS[k].ops === s) ?? null, ops: Math.max(0, s) };
  const k = String(s ?? DEFAULT_SPEED).toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = SPEEDS[k] ? k : DEFAULT_SPEED;
  return { key, ops: SPEEDS[key].ops };
}

const hostNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let chan = null;
/** Run fn soon, as a new task of the host's event loop (MessageChannel: not clamped like setTimeout). */
function hostSoon(fn) {
  if (typeof setImmediate === 'function') { setImmediate(fn); return; }
  if (typeof MessageChannel !== 'undefined') {
    if (!chan) { chan = new MessageChannel(); chan.q = []; chan.port1.onmessage = () => chan.q.shift()?.(); }
    chan.q.push(fn); chan.port2.postMessage(0);
    return;
  }
  setTimeout(fn, 0);
}

export class Scheduler {
  /**
   * o.now() ms clock, o.soon(fn) run fn on a new host task, o.later(fn, ms) -> handle, o.cancel(handle),
   * o.periodMs, o.busyMs (share of each period BASIC may use), o.sliceMs (the machines' slice length).
   */
  constructor(o = {}) {
    this.now = o.now ?? hostNow;
    this.soon = o.soon ?? hostSoon;
    this.later = o.later ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = o.cancel ?? ((h) => clearTimeout(h));
    this.periodMs = o.periodMs ?? 16;
    this.busyMs = o.busyMs ?? 11;
    this.busyFullMs = o.busyFullMs ?? 15;   // while a program has the whole screen (the desktop is hidden)
    this.sliceMs = o.sliceMs ?? 4;
    this.jobs = new Set();
    this.queue = [];           // jobs waiting for a turn, in order
    this.periodStart = -Infinity;
    this.used = 0;             // ms of BASIC in this period
    this.pumping = false;
    this.timer = null; this.timerAt = Infinity;
  }

  /** A new job for a machine (or attach one later). opts: {name, speed: name | ops/s}. */
  add(machine = null, opts = {}) {
    const job = new Job(this, opts);
    this.jobs.add(job);
    if (machine) job.attach(machine);
    return job;
  }

  /** The job wants its next turn (throttled: it has used its speed allowance). */
  _request(job, throttled) {
    return new Promise((resolve) => {
      job.waiter = resolve;
      job.readyAt = throttled ? this.now() + job._refillMs() : 0;
      if (!this.queue.includes(job)) this.queue.push(job);
      this._kick();
    });
  }

  _kick() {
    if (this.pumping) return;
    this.pumping = true;
    this.soon(() => { this.pumping = false; this._pump(); });
  }

  _wakeAt(t) {
    if (this.timer !== null && this.timerAt <= t) return;
    if (this.timer !== null) this.cancel(this.timer);
    this.timerAt = t;
    this.timer = this.later(() => { this.timer = null; this.timerAt = Infinity; this._kick(); }, Math.max(0, t - this.now()));
  }

  /** Give the next runnable job a turn (one per host task, so the host gets in between). */
  _pump() {
    if (!this.queue.length) return;
    const t = this.now();
    if (t >= this.periodStart + this.periodMs) { this.periodStart = t; this.used = 0; }
    const busy = [...this.jobs].some((j) => j.foreground && !j.suspended) ? this.busyFullMs : this.busyMs;
    if (this.used >= busy) { this._wakeAt(this.periodStart + this.periodMs); return; }
    let next = Infinity;
    const i = this.queue.findIndex((j) => {
      if (j.suspended) return false;
      if (j.readyAt > t) { next = Math.min(next, j.readyAt); return false; }
      return true;
    });
    if (i < 0) { if (next < Infinity) this._wakeAt(next); return; }
    const job = this.queue.splice(i, 1)[0];
    job._grant();
    if (this.queue.length) this._kick();
  }

  /** CPU time a job used (called by the job after each slice). */
  _charge(job, ms) { this.used += ms; job.cpuMs += ms; }

  _remove(job) {
    this.jobs.delete(job);
    const i = this.queue.indexOf(job);
    if (i >= 0) this.queue.splice(i, 1);
    job._grant();
  }
}

export class Job {
  constructor(sched, opts = {}) {
    this.sched = sched;
    this.name = opts.name ?? '';
    this.machine = null;
    this.suspended = false;
    this.removed = false;
    this.granted = false;
    this.waiter = null;
    this.readyAt = 0;
    this.cpuMs = 0;           // time spent running BASIC
    this.foreground = false;  // the program has the whole screen: BASIC may take more of each frame
    this.setSpeed(opts.speed ?? DEFAULT_SPEED);
  }

  /** Run this machine's program under the scheduler (wraps machine.slice). */
  attach(m) {
    this.detach();
    this.machine = m;
    const slice = m.slice;
    this._orig = slice;
    m.sliceMs = this.sched.sliceMs;
    this._applySpeed();
    const now = this.sched.now;
    m.slice = () => {
      if (this.removed) return slice.call(m);
      if (!this.granted) return this.sched._request(this, false);
      this.granted = false;
      const t0 = now();
      let r;
      try { r = slice.call(m); } finally { this.sched._charge(this, now() - t0); }
      if (r === 'yield' || r === 'throttle') return this.sched._request(this, r === 'throttle');
      return r;
    };
    return this;
  }

  detach() {
    if (this.machine && this._orig) this.machine.slice = this._orig;
    this.machine = null; this._orig = null;
  }

  /** name ('arm2' ... 'unlimited') or ops/second */
  setSpeed(s) {
    const { key, ops } = speedOps(s);
    this.speed = key; this.ops = ops;
    this._applySpeed();
  }
  _applySpeed() {
    const m = this.machine;
    if (!m) return;
    m.opsPerSecond = this.ops;
    m.allowance = 0; m.allowT = 0;
    if (this.waiter) { this.readyAt = 0; this.sched._kick(); }
  }

  /** ms until the machine's token bucket holds a worthwhile slice (about 4ms of work) again */
  _refillMs() {
    const m = this.machine, ops = this.ops;
    if (!m || !ops) return 0;
    const want = Math.min(ops / 25, Math.max(256, ops * 0.004));
    const have = Math.min((m.allowance ?? 0) + (this.sched.now() - (m.allowT || this.sched.now())) * ops / 1000, ops / 25);
    return Math.max(1, (want - have) * 1000 / ops);
  }

  suspend() { this.suspended = true; }
  resume() { if (!this.suspended) return; this.suspended = false; this.sched._kick(); }
  /** Stop scheduling (the program is killed or has ended): it runs freely from now on. */
  remove() {
    if (this.removed) return;
    this.removed = true;
    this.sched._remove(this);
    this.detach();
  }

  _grant() {
    const w = this.waiter;
    this.waiter = null;
    this.granted = true;
    w?.();
  }
}

/**
 * The 50Hz frame clock for WAIT and *FX 19: wait() resolves at the next 20ms boundary of a steady clock,
 * whatever the display's refresh rate (60/120Hz) and even when the tab is in the background (timers
 * run there, animation frames don't). Every waiter of one frame is released together.
 */
export class Vsync {
  constructor(o = {}) {
    this.now = o.now ?? hostNow;
    this.later = o.later ?? ((fn, ms) => setTimeout(fn, ms));
    this.hz = o.hz ?? 50;
    this.waiters = [];
    this.timer = null;
    this.frames = 0;
    this.tick = -Infinity;   // the last frame boundary passed
  }
  get periodMs() { return 1000 / this.hz; }
  wait() {
    return new Promise((resolve) => { this.waiters.push(resolve); this._arm(); });
  }
  _arm() {
    if (this.timer !== null) return;
    const p = this.periodMs, t = this.now();
    // (a timer may fire a little early: the frame it was for counts as passed)
    const tick = Math.max(Math.floor(t / p) + 1, this.tick + 1);
    this.timer = this.later(() => {
      this.timer = null;
      this.tick = tick;
      this.frames++;
      for (const w of this.waiters.splice(0)) w();
    }, tick * p - t);
  }
}

export const scheduler = new Scheduler();
export const vsync = new Vsync();
