// A small stand-in for the QTMTracker module that !Hopper uses (Steve Harrison's QTM): it plays the game's
// sound effect samples (QTM_PlayRawSample) and its three ProTracker "M.K." modules (QTM_Load / Start / Stop /
// Volume) through the desktop's one emulated RISC OS sound system (src/core/sound, docs/SOUND.md), like QTM
// drives SoundDMA itself:
//
//  * Sound_Configure 8 channels (as the game asks QTM for: QTM_SoundControl 8); channels 1-4 play the module,
//    5-8 the effects. The previous channel count and voices are put back by release().
//  * One installed voice, "QTM-Sample", fills a channel's buffers with 8-bit VIDC log samples: the effect files
//    are log data already, module samples are converted from 8-bit linear with Sound1's linear -> log table.
//    Pitch: Amiga period P plays at 3546895 / P Hz, resampled to the 20833 Hz channel rate; volumes (0-64) and
//    QTM's music/sample volumes become log attenuation (16 steps per halving), then the master volume.
//  * The module player runs as a Level2 client (every 1 cs buffer fill) with ProTracker timing (speed / BPM,
//    50 Hz ticks at 125 BPM) and the usual effects: arpeggio, portamentos, tone portamento, vibrato, tremolo,
//    sample offset, volume slides, position jump, pattern break, set volume / speed / tempo, and the E commands
//    (fine slides, pattern loop, retrigger, note cut / delay, pattern delay).

import { soundSystem, soundOutput } from '../../core/sound/index.js';
import { buildLogTable } from '../../core/sound/tables.js';

const PAL_CLOCK = 3546895;
const LIN2LOG = buildLogTable(0x7F);                  // unscaled linear (13 bit) -> log
const linToLog = (s8) => LIN2LOG[(s8 << 5) & 8191];
const ACTIVE = 0x08, FLUSH = 0x02;

// ProTracker periods, finetune 0, C-1 .. B-3 (QTM note numbers 1..36)
const PERIODS = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113];
const SINE = Array.from({ length: 32 }, (_, i) => Math.round(255 * Math.sin((i * Math.PI) / 32)));
const atten = (g) => (g <= 0 ? 127 : Math.min(127, Math.round(-16 * Math.log2(g))));   // log steps for a linear gain

/** Per channel playback state read by the voice. */
class Chan {
  constructor() { this.data = null; this.pos = 0; this.step = 0; this.end = 0; this.loopStart = 0; this.loopLen = 0; this.att = 0; this.on = false; }
  play(data, start, end, loopStart, loopLen) { this.data = data; this.pos = start; this.end = end; this.loopStart = loopStart; this.loopLen = loopLen; this.on = !!data && start < end; }
}

class QTMVoice {
  constructor(q) { this.name = 'QTM-Sample'; this.q = q; }
  instantiate() { return true; }
  free() {}
  gateOn(sys, ch, c, out) { return this.fill(sys, ch, c, out); }
  update(sys, ch, c, out) { return this.fill(sys, ch, c, out); }
  gateOff(sys, ch, c, out) { out.fill(0); return FLUSH; }
  fill(sys, ch, c, out) {
    const s = this.q.chan[ch];
    if (!s || !s.on) { out.fill(0); return this.q.music && ch < 4 ? ACTIVE : FLUSH; }
    const amp = sys.ampTable, d = s.data, att2 = s.att * 2;
    let pos = s.pos;
    for (let i = 0; i < out.length; i++) {
      if (pos >= s.end) {
        if (s.loopLen > 2) { pos = s.loopStart + ((pos - s.end) % s.loopLen); }
        else { s.on = false; out.fill(0, i); break; }
      }
      let b = d[pos | 0];
      b = b - att2 > 1 ? b - att2 : 0;
      out[i] = amp[b];
      pos += s.step;
    }
    s.pos = pos;
    return s.on || (this.q.music && ch < 4) ? ACTIVE : FLUSH;
  }
}

/** Parse a ProTracker M.K. module. Sample data becomes log bytes. */
export function parseMod(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n)).replace(/\0.*$/, '');
  const u16 = (o) => (b[o] << 8) | b[o + 1];
  const samples = [];
  for (let i = 0; i < 31; i++) {
    const o = 20 + i * 30;
    samples.push({ name: str(o, 22), len: u16(o + 22) * 2, finetune: ((b[o + 24] & 15) << 28) >> 28, vol: Math.min(64, b[o + 25]), loopStart: u16(o + 26) * 2, loopLen: u16(o + 28) * 2 });
  }
  const songLen = b[950], order = [...b.subarray(952, 952 + 128)];
  const nPat = Math.max(...order) + 1;
  const patterns = [];
  let o = 1084;
  for (let p = 0; p < nPat; p++) {
    const rows = [];
    for (let r = 0; r < 64; r++) {
      const row = [];
      for (let c = 0; c < 4; c++, o += 4) {
        row.push({ sample: (b[o] & 0xF0) | (b[o + 2] >> 4), period: ((b[o] & 15) << 8) | b[o + 1], fx: b[o + 2] & 15, param: b[o + 3] });
      }
      rows.push(row);
    }
    patterns.push(rows);
  }
  for (const s of samples) {
    const n = Math.min(s.len, Math.max(0, b.length - o));
    s.data = new Uint8Array(n);
    for (let i = 0; i < n; i++) s.data[i] = linToLog((b[o + i] << 24) >> 24);
    o += s.len;
    if (s.loopStart + s.loopLen > n) s.loopLen = Math.max(0, n - s.loopStart);
  }
  return { title: str(0, 20), samples, songLen, order, patterns };
}

/** The QTM emulation: one per running game. */
export class QTM {
  constructor() {
    this.sys = soundSystem();
    this.chan = Array.from({ length: 8 }, () => new Chan());
    this.music = null;              // playing module state
    this.musicVol = 64; this.sampleVol = 64; this.volume = 64;
    this.voice = new QTMVoice(this);
    this.claimed = false;
    this.listener = (sys) => this._tick(sys);
  }

  /** Take over the sound system (Sound_Configure 8, our voice on every channel). */
  claim() {
    if (this.claimed) return;
    const s = this.sys;
    this.saved = { nchan: s.nchan, voices: s.chan.map((c) => c.voice), stereo: s.images.slice() };
    this.slot = s.voiceTable.indexOf(this.voice);
    if (this.slot < 0) this.slot = s.installVoice(this.voice);
    s.configure(8);
    for (let c = 1; c <= 8; c++) s.attachVoice(c, this.slot);
    for (let c = 1; c <= 4; c++) s.stereo(c, [-96, 96, 96, -96][c - 1]);   // LRRL, as QTM pans the Amiga channels
    this.claimed = true;
    try { soundOutput().resume(); } catch { /* no audio */ }
  }

  /** Give the sound system back. */
  release() {
    if (!this.claimed) return;
    this.stop();
    const s = this.sys;
    for (let c = 1; c <= 8; c++) s.control(c, 0, 0, 1);
    s.configure(this.saved.nchan);
    this.saved.voices.forEach((v, i) => { try { s.attachVoice(i + 1, v); } catch { /* */ } });
    this.saved.stereo.forEach((v, i) => { s.images[i] = v; });
    if (this.slot > 0) { try { s.removeVoice(this.slot); } catch { /* */ } }
    this.claimed = false;
  }

  _gate(ch) { this.sys.control(ch + 1, -15, 0, 255); }

  /** QTM_PlayRawSample: a log sample on channel 1-8 at a QTM note (1 = C-1) and volume 0-64. */
  playRawSample(ch, data, note, vol) {
    if (!this.claimed) return;
    const s = this.chan[ch - 1];
    s.play(data, 0, data.length, 0, 0);
    s.step = PAL_CLOCK / PERIODS[Math.max(0, Math.min(35, note - 1))] / this.sys.sampleRate;
    s.att = atten((vol / 64) * (this.sampleVol / 64));
    this._gate(ch - 1);
  }
  /** QTM_Stereo: -127 (left) .. 127 (right). */
  stereo(ch, pos) { if (this.claimed) this.sys.stereo(ch, Math.max(-127, Math.min(127, pos | 0))); }

  // ------------------------------------------------------------------ the module player
  load(mod) { this.stop(); this.mod = mod; }
  start() {
    if (!this.mod || !this.claimed) return;
    const m = this.mod;
    this.music = { pos: 0, row: 0, tick: 0, speed: 6, bpm: 125, acc: 0, delay: 0, breakRow: -1, jump: -1, loopRow: 0, loopCount: 0,
      ch: Array.from({ length: 4 }, () => ({ sample: null, period: 0, target: 0, vol: 0, portaSpeed: 0, vib: 0, vibPos: 0, trem: 0, tremPos: 0, offset: 0, note: null })) };
    for (let c = 0; c < 4; c++) { this.chan[c].on = false; this._gate(c); }
    this._row(m);
    this.sys.listeners.add(this.listener);
    try { soundOutput().wake(); } catch { /* */ }
  }
  stop() {
    if (!this.music) return;
    this.music = null;
    this.sys.listeners.delete(this.listener);
    for (let c = 0; c < 4; c++) { this.chan[c].on = false; if (this.claimed) this.sys.control(c + 1, 0, 0, 1); }
  }
  get playing() { return !!this.music; }

  _tick() {
    const M = this.music;
    if (!M) return;
    // ticks at bpm * 2 / 5 per second; one call per 208-sample buffer (9.984 ms)
    M.acc += (M.bpm * 2 / 5) * (this.sys.bufLen * this.sys.period / 1e6);
    while (M.acc >= 1 && this.music) {
      M.acc -= 1;
      if (++M.tick >= M.speed * (1 + M.delay)) { M.tick = 0; M.delay = 0; this._advance(); this._row(this.mod); }
      else this._effects(M.tick % M.speed);
    }
    this._apply();
  }

  _advance() {
    const M = this.music, m = this.mod;
    if (M.jump >= 0 || M.breakRow >= 0) {
      M.pos = M.jump >= 0 ? M.jump : M.pos + 1;
      M.row = Math.max(0, M.breakRow);
      M.jump = -1; M.breakRow = -1;
    } else if (++M.row >= 64) { M.row = 0; M.pos++; }
    if (M.pos >= m.songLen) M.pos = 0;
  }

  _row(m) {
    const M = this.music;
    const pat = m.patterns[m.order[M.pos]];
    if (!pat) return;
    pat[M.row].forEach((n, c) => {
      const C = M.ch[c];
      C.fx = n.fx; C.param = n.param;
      if (n.sample) { const s = m.samples[n.sample - 1]; if (s) { C.sample = s; C.vol = s.vol; } }
      const delayed = n.fx === 14 && (n.param >> 4) === 13 && (n.param & 15);
      if (n.period && n.fx !== 3 && n.fx !== 5) {
        C.period = n.period; C.note = n.period;
        if (!delayed) this._trigger(c, n.fx === 9 ? (n.param || C.offset) * 256 : 0);
        if (n.fx === 9 && n.param) C.offset = n.param;
        C.vibPos = 0; C.tremPos = 0;
      } else if (n.period) C.target = n.period;
      const p = n.param, x = p >> 4, y = p & 15;
      switch (n.fx) {
        case 3: if (p) C.portaSpeed = p; break;
        case 4: if (x) C.vib = (C.vib & 15) | (x << 4); if (y) C.vib = (C.vib & 0xF0) | y; break;
        case 7: if (x) C.trem = (C.trem & 15) | (x << 4); if (y) C.trem = (C.trem & 0xF0) | y; break;
        case 11: M.jump = p; M.breakRow = Math.max(M.breakRow, 0); break;
        case 12: C.vol = Math.min(64, p); break;
        case 13: M.breakRow = x * 10 + y; if (M.jump < 0) M.jump = M.pos + 1 >= m.songLen ? 0 : M.pos + 1; break;
        case 14:
          switch (x) {
            case 1: C.period = Math.max(113, C.period - y); break;
            case 2: C.period = Math.min(856, C.period + y); break;
            case 6: if (!y) M.loopRow = M.row; else if (M.loopCount === 0) { M.loopCount = y; M.jump = M.pos; M.breakRow = M.loopRow; } else if (--M.loopCount > 0) { M.jump = M.pos; M.breakRow = M.loopRow; } break;
            case 10: C.vol = Math.min(64, C.vol + y); break;
            case 11: C.vol = Math.max(0, C.vol - y); break;
            case 14: M.delay = y; break;
            default: break;
          }
          break;
        case 15: if (p) { if (p < 32) M.speed = p; else M.bpm = p; } break;
        default: break;
      }
    });
  }

  _trigger(c, offset = 0) {
    const C = this.music.ch[c], s = C.sample;
    if (!s || !s.data.length) { this.chan[c].on = false; return; }
    const loop = s.loopLen > 2;
    const end = loop ? s.loopStart + s.loopLen : s.data.length;
    this.chan[c].play(s.data, Math.min(offset, end), end, s.loopStart, loop ? s.loopLen : 0);
  }

  _effects(tick) {
    const M = this.music;
    M.ch.forEach((C, c) => {
      const p = C.param, x = p >> 4, y = p & 15;
      C.arp = 0; C.vibDelta = 0; C.tremDelta = 0;
      switch (C.fx) {
        case 0: if (p) C.arp = [0, x, y][tick % 3]; break;
        case 1: C.period = Math.max(113, C.period - p); break;
        case 2: C.period = Math.min(856, C.period + p); break;
        case 3: this._porta(C); break;
        case 4: this._vibrato(C); break;
        case 5: this._porta(C); this._volSlide(C, p); break;
        case 6: this._vibrato(C); this._volSlide(C, p); break;
        case 7: C.tremDelta = ((SINE[C.tremPos & 31] * (C.trem & 15)) >> 6) * (C.tremPos & 32 ? -1 : 1); C.tremPos += C.trem >> 4; break;
        case 10: this._volSlide(C, p); break;
        case 14:
          if (x === 9 && y && tick % y === 0) this._trigger(c);
          if (x === 12 && tick === y) C.vol = 0;
          if (x === 13 && tick === y && C.note) this._trigger(c);
          break;
        default: break;
      }
    });
  }
  _porta(C) {
    if (!C.target) return;
    if (C.period < C.target) C.period = Math.min(C.target, C.period + C.portaSpeed);
    else if (C.period > C.target) C.period = Math.max(C.target, C.period - C.portaSpeed);
  }
  _vibrato(C) { C.vibDelta = ((SINE[C.vibPos & 31] * (C.vib & 15)) >> 7) * (C.vibPos & 32 ? -1 : 1); C.vibPos += C.vib >> 4; }
  _volSlide(C, p) { const x = p >> 4, y = p & 15; C.vol = Math.max(0, Math.min(64, C.vol + (x ? x : -y))); }

  _apply() {
    const M = this.music;
    if (!M) return;
    const rate = this.sys.sampleRate, g = (this.musicVol / 64) * (this.volume / 64);
    M.ch.forEach((C, c) => {
      const s = this.chan[c];
      let per = C.period + (C.vibDelta || 0);
      if (C.arp) { const i = PERIODS.findIndex((q) => q <= C.period); per = PERIODS[Math.min(35, (i < 0 ? 35 : i) + C.arp)]; }
      if (per > 0) s.step = PAL_CLOCK / Math.max(113, per) / rate;
      s.att = atten((Math.max(0, Math.min(64, C.vol + (C.tremDelta || 0))) / 64) * g);
    });
  }
}
