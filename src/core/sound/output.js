// Clock and Web Audio output for the emulated sound system (./system.js).
//
// The sound system advances in buffer fills (9.984 ms each by default). Time comes from one of:
//  * the Web Audio renderer, while anything is (or may be) sounding: it runs fills ahead of the
//    audio clock (LOOKAHEAD), resamples them (linear interpolation, continuous across fills,
//    like Sound0's 2x linear oversampling) to the context rate and schedules them frame-exactly
//    as AudioBufferSourceNodes; when everything is quiet it stops;
//  * sync(), when the renderer is stopped (no audio, node, audio not yet allowed, or idle):
//    fills are run up to the wall clock so the scheduler, BEAT and note durations keep time.
// Commands call sync() first (SoundSystem.syncHook), so they take effect "now".

const LOOKAHEAD = 0.12;       // seconds of audio scheduled ahead of the audio clock
const LATENCY = 0.03;         // start this far ahead of currentTime when (re)starting
const TICK_MS = 25;
const MAX_CATCHUP = 30;       // seconds of full fills when catching up; beyond that only Level2 runs

const wallNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class SoundOutput {
  /**
   * sys: SoundSystem. opts: {audio: false to never use Web Audio, gain (output gain, default 1),
   * AudioContext (the class to use, default the browser's)}
   */
  constructor(sys, opts = {}) {
    this.sys = sys;
    this.AC = opts.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
    this.useAudio = opts.audio !== false && !!this.AC;
    this.gain = opts.gain ?? 1;
    this.ctx = null; this.out = null;
    this.playing = false;
    this.timer = null;
    this.anchorFill = sys.fills; this.anchorTime = wallNow(); this.anchorPeriod = sys.fillPeriod;
    this.nodes = [];
    sys.syncHook = () => this.sync();
    sys.onChange = () => this.wake();
    this._unlock = null;
  }

  // ------------------------------------------------------------------ clock
  /** Run fills (without output) up to the wall clock, unless the renderer owns time. */
  sync() {
    if (this.playing || this._inSync) return;
    const sys = this.sys;
    if (sys.fillPeriod !== this.anchorPeriod) { this.anchorFill = sys.fills; this.anchorTime = Math.min(wallNow(), this.anchorTime + (sys.fills - this.anchorFill) * this.anchorPeriod); this.anchorPeriod = sys.fillPeriod; }
    const target = this.anchorFill + Math.floor((wallNow() - this.anchorTime) / this.anchorPeriod);
    let n = target - sys.fills;
    if (n <= 0) return;
    this._inSync = true;
    try {
      const full = Math.ceil(MAX_CATCHUP / this.anchorPeriod);
      if (n > full) { sys.skip(n - full); n = full; }
      while (n-- > 0) sys.fill();
    } finally { this._inSync = false; }
  }

  // ------------------------------------------------------------------ Web Audio
  /** Create (or return) the AudioContext; null if there is no Web Audio. */
  audio() {
    if (!this.useAudio) return null;
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;
    try {
      this.ctx = new this.AC({ latencyHint: 'interactive' });
      this.out = this.ctx.createGain();
      this.out.gain.value = this.gain;
      this.out.connect(this.ctx.destination);
      this.ctx.onstatechange = () => { if (this.ctx.state === 'running') this.wake(); else this._stop(); };
      this._armUnlock();
    } catch { this.useAudio = false; this.ctx = null; }
    return this.ctx;
  }

  /** Resume audio (call from a user gesture: browsers only allow audio after one). */
  resume() {
    const c = this.audio();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  _armUnlock() {
    if (this._unlock || typeof window === 'undefined') return;
    this._unlock = () => {
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.ctx?.state === 'running') for (const e of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(e, this._unlock, true);
    };
    for (const e of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(e, this._unlock, true);
  }

  /** Seconds from now until the next fill to be rendered is heard. */
  ahead() {
    const c = this.ctx;
    if (!this.playing || !c) return LATENCY;
    return Math.max(0, this.nextFrame / c.sampleRate - c.currentTime + this.fifoLen / this.sys.sampleRate);
  }

  setGain(g) { this.gain = g; if (this.out) this.out.gain.value = g; }

  /** Something changed: start rendering if it may make a sound. */
  wake() {
    if (this.playing || this._inTick) return;
    if (!this.sys.busy()) return;
    const c = this.audio();
    if (!c) return;
    if (c.state !== 'running') { if (c.state === 'suspended') c.resume().catch(() => {}); return; }
    this.sync();
    this.playing = true;
    const sr = c.sampleRate;
    this.nextFrame = Math.ceil((c.currentTime + LATENCY) * sr);
    this._resetResampler();
    this.quietFills = 0;
    this._tick();
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }

  _stop() {
    if (!this.playing) return;
    clearInterval(this.timer); this.timer = null;
    this.playing = false;
    // the fills rendered ahead are in the future: anchor the wall clock there
    const c = this.ctx;
    const ahead = c ? Math.max(0, this.nextFrame / c.sampleRate - c.currentTime) : 0;
    this.anchorFill = this.sys.fills; this.anchorTime = wallNow() + ahead; this.anchorPeriod = this.sys.fillPeriod;
  }

  /** Stop everything scheduled (e.g. on Sound_QInit + hush from a player). */
  cut() {
    const c = this.ctx;
    if (!c) return;
    for (const n of this.nodes) { try { n.stop(); } catch { /* */ } }
    this.nodes = [];
    if (this.playing) { this.nextFrame = Math.ceil((c.currentTime + LATENCY) * c.sampleRate); this._resetResampler(); }
  }

  _resetResampler() {
    this.fifoL = new Float32Array(4096); this.fifoR = new Float32Array(4096);
    this.fifoLen = 0; this.pos = 0;
  }

  _push(l, r) {
    const n = l.length;
    if (this.fifoLen + n > this.fifoL.length) {
      const g = (a) => { const b = new Float32Array((this.fifoLen + n) * 2); b.set(a.subarray(0, this.fifoLen)); return b; };
      this.fifoL = g(this.fifoL); this.fifoR = g(this.fifoR);
    }
    this.fifoL.set(l, this.fifoLen); this.fifoR.set(r, this.fifoLen);
    this.fifoLen += n;
  }

  _tick() {
    const c = this.ctx, sys = this.sys;
    if (!c || c.state !== 'running') { this._stop(); return; }
    this._inTick = true;
    try {
      const sr = c.sampleRate;
      const nowFrame = Math.floor(c.currentTime * sr);
      if (this.nextFrame < nowFrame) {
        // fell behind (the main thread was busy): drop the fills for the missed time
        const late = (nowFrame - this.nextFrame) / sr + LATENCY;
        for (let k = Math.ceil(late / sys.fillPeriod); k > 0; k--) sys.fill();
        this.nextFrame = Math.ceil((c.currentTime + LATENCY) * sr);
        this._resetResampler();
      }
      const want = Math.ceil((c.currentTime + LOOKAHEAD) * sr) - this.nextFrame;
      if (want <= 0) return;
      const step = sys.sampleRate / sr;
      const zero = new Float32Array(sys.bufLen);
      while (Math.floor(this.pos + (want - 1) * step) + 1 >= this.fifoLen) {
        if (sys.fill()) { this._push(sys.left, sys.right); this.quietFills = 0; }
        else { const z = zero.length === sys.bufLen ? zero : new Float32Array(sys.bufLen); this._push(z, z); this.quietFills++; }
      }
      // linear interpolation at input positions pos + j * step
      const buf = c.createBuffer(2, want, sr);
      const oL = buf.getChannelData(0), oR = buf.getChannelData(1);
      const L = this.fifoL, R = this.fifoR;
      let x = this.pos, loud = false;
      for (let j = 0; j < want; j++) {
        const i0 = Math.floor(x), f = x - i0;
        const l = L[i0] + (L[i0 + 1] - L[i0]) * f, r = R[i0] + (R[i0 + 1] - R[i0]) * f;
        oL[j] = l; oR[j] = r;
        if (l || r) loud = true;
        x += step;
      }
      const drop = Math.floor(x);
      L.copyWithin(0, drop, this.fifoLen); R.copyWithin(0, drop, this.fifoLen);
      this.fifoLen -= drop; this.pos = x - drop;
      if (loud) {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(this.out);
        src.start(this.nextFrame / sr);
        src.onended = () => { const i = this.nodes.indexOf(src); if (i >= 0) this.nodes.splice(i, 1); };
        this.nodes.push(src);
      }
      this.nextFrame += want;
      if (!loud && this.quietFills > 4 && sys.idle()) this._stop();
    } finally { this._inTick = false; }
  }
}
