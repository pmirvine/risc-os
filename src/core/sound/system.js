// The RISC OS 3.71 sound system: Level0 (SoundDMA), Level1 (SoundChannels) and Level2
// (SoundScheduler), emulated buffer fill by buffer fill from the ARM sources in
// vendor/ro371/Sources/OS_Core/HWSupport/Sound (Sound0, Sound1, Sound2).
//
// fill() is one Level0 sound interrupt: run the Level2 scheduler (Sound_QSchedule events due at
// the current tempo), then Level1 asks each active channel's voice to fill its 208-byte buffer
// of VIDC log samples, then the channels are mixed to stereo with the 3.71 16-bit output code
// (mu-law -> linear table, 7 stereo image positions, *11 / 8N scaling). The result is two
// Float32Arrays of BUFFER_LEN samples at 1e6/period Hz (20833 Hz by default).
//
// Nothing here knows about time or Web Audio: see ./output.js for the clock and the output.

import {
  SAMPLE_PERIOD, BUFFER_LEN, LOG_TO_LINEAR, DEF_MASTER_PITCH,
  buildLogTable, buildAmpTable, pitchToInc,
} from './tables.js';
import { WaveSynthVoice } from './wavesynth.js';
import { stringLibVoices, percussionVoices } from './stringlib.js';

// SCCB flag bits (Hdr:Sound)
export const F = {
  GATE_OFF: 0x80, GATE_ON: 0x40, UPDATE: 0x20, RESERVED: 0x10, ACTIVE: 0x08, OVERRUN: 0x04,
  FLUSH2: 0x02, FLUSH1: 0x01,
};
const MAX_VOICES = 32;
const CHANNELS = 8;

// Errors (Hdr:NewErrors &20000 + n, texts from the SoundChannels Messages file)
export const ERR = {
  BadSoundParameter: { errnum: 0x20000, errmess: 'Sound command parameters not recognised' },
  BadSoundChannel: { errnum: 0x20001, errmess: 'Channel number must be in the range 1-8' },
  BadSoundStereo: { errnum: 0x20002, errmess: 'Bad sound stereo position' },
  BadSoundVoice: { errnum: 0x20005, errmess: 'Sound voice must be in the range 0-32' },
  IllegalVoice: { errnum: 0x20008, errmess: 'Illegal voice index' },
};
export class SoundError extends Error {
  constructor(e) { super(e.errmess); this.errnum = e.errnum; this.errmess = e.errmess; }
}

// SWI numbers
export const SWI = {
  Sound_Configure: 0x40140, Sound_Enable: 0x40141, Sound_Stereo: 0x40142, Sound_Speaker: 0x40143,
  Sound_Mode: 0x40144, Sound_LinearHandler: 0x40145, Sound_SampleRate: 0x40146,
  Sound_Volume: 0x40180, Sound_SoundLog: 0x40181, Sound_LogScale: 0x40182, Sound_InstallVoice: 0x40183,
  Sound_RemoveVoice: 0x40184, Sound_AttachVoice: 0x40185, Sound_ControlPacked: 0x40186, Sound_Tuning: 0x40187,
  Sound_Pitch: 0x40188, Sound_Control: 0x40189, Sound_AttachNamedVoice: 0x4018A,
  Sound_ReadControlBlock: 0x4018B, Sound_WriteControlBlock: 0x4018C,
  Sound_QInit: 0x401C0, Sound_QSchedule: 0x401C1, Sound_QRemove: 0x401C2, Sound_QFree: 0x401C3,
  Sound_QSDispatch: 0x401C4, Sound_QTempo: 0x401C5, Sound_QBeat: 0x401C6, Sound_QInterface: 0x401C7,
};
export const SWI_NAMES = Object.fromEntries(Object.entries(SWI).map(([k, v]) => [v, k]));

// 16-bit output stereo weights (Sound0 stereo_code) for image positions 1..7: left, right
const WL = [0, 6, 5, 4, 3, 2, 1, 0];
const WR = [0, 0, 1, 2, 3, 4, 5, 6];
/** Sound0 ConvImages: stored position byte (value + &80) -> image register value 1..7. */
export function imageOf(b) {
  let v = b < 0xE0 ? b + 0x10 : b;
  v >>= 5;
  return v === 0 ? 1 : v > 7 ? 7 : v;
}

// Level2 queue: 8K workspace, 16-byte elements after the 1072-byte header and wheel
const Q_ELEMENTS = (8192 - 1072) >> 4;
const Q_FREE_SLOTS = (8192 - 1072) >> 6;
const DEFAULT_TEMPO = 0x1000;

class SCCB {
  constructor() {
    this.ampGate = 0; this.voice = 0; this.instance = 0; this.flags = 0x03;
    this.pitch = 0; this.timbre = 0; this.duration = 0;
    this.p1 = 0; this.p2 = 0; this.p3 = 0; this.p4 = 0;
  }
}

export class SoundSystem {
  /**
   * opts: volume (Sound_Volume 1..127, default &7F: CMOS loudness 7), voice (channel 1 voice,
   * default 1), attachAll (attach `voice` to every channel at power-on, default true - see
   * docs/SOUND.md), speaker (default true).
   */
  constructor(opts = {}) {
    // Level0
    this.log2nchan = 0;                  // 1 channel (SCLogChannel)
    this.appliedLog2 = 0;                // Log2nchan_C
    this.period = SAMPLE_PERIOD;
    this.bufLen = BUFFER_LEN;
    this.images = new Uint8Array(8).fill(0x80);
    this.enabled = true;
    this.speakerOn = opts.speaker ?? true;
    // Level1
    this.maxAmp = (opts.volume ?? 0x7F) & 0x7F || 1;
    this.logTable = buildLogTable(this.maxAmp);
    this.ampTable = buildAmpTable(this.maxAmp);
    this.masterPitch = DEF_MASTER_PITCH;
    this.voiceTable = new Array(MAX_VOICES + 1).fill(null);
    this.localNames = new Array(MAX_VOICES + 1).fill(null);
    this.chan = Array.from({ length: CHANNELS }, () => new SCCB());
    this.bufs = Array.from({ length: CHANNELS }, () => [new Uint8Array(BUFFER_LEN), new Uint8Array(BUFFER_LEN)]);
    this.suppress = false;               // OS_Byte 210
    // Level2
    this.q = new Map();                  // absolute tick -> [events]
    this.qSlot = 0;
    this.qInit();
    // output
    this.left = new Float32Array(BUFFER_LEN);
    this.right = new Float32Array(BUFFER_LEN);
    this.fills = 0;
    this.listeners = new Set();          // onFill hooks (Level2-style clients, e.g. Maestro's player)
    this.eventHandlers = new Set();      // Event_Sound (beat counter wrap)
    this.onChange = null;                // called when something may start making sound

    // Power-on: channel 1 gets the CMOS default voice, then the ROM voice modules install in
    // ROM order (WaveSynth, StringLib, Percussion): 1 Beep, 2-5 StringLib, 6-9 Percussion.
    this.chan[0].voice = opts.voice ?? 1;
    if (opts.attachAll ?? true) for (const c of this.chan) c.voice = opts.voice ?? 1;
    this.installVoice(new WaveSynthVoice());
    for (const v of stringLibVoices()) this.installVoice(v);
    for (const v of percussionVoices()) this.installVoice(v);
  }

  /** Bring the clock up to date before a command (not while inside a fill). */
  _pre() { if (!this.inFill && this.syncHook) this.syncHook(); }

  get nchan() { return 1 << this.log2nchan; }
  get sampleRate() { return 1e6 / this.period; }
  get fillPeriod() { return this.bufLen * this.period / 1e6; }
  _changed() { this.onChange?.(); }

  // ============================================================== Level0 (Sound0)
  /** Sound_Configure: returns the old [channels, samples per buffer, period, level1, level2]. */
  configure(nch = 0, bufLen = 0, period = 0) {
    this._pre();
    const old = [this.nchan, this.bufLen, this.period, 0, 0];
    let l2 = this.log2nchan;
    if (nch) {
      l2 = nch - 1;
      if (l2 === 3) l2 = 2; else if (l2 > 3) l2 = 3;
      if (l2 < 0) l2 = 0;
      // must update stereo positions: re-set each of the N channels at the new interleave
      const keep = this.log2nchan;
      this.log2nchan = l2;
      const n = 1 << l2;
      for (let c = 1; c <= n; c++) this.stereo(c, this.stereo(c, -128));
      this.log2nchan = keep;
    }
    if (bufLen) {
      let b = bufLen & 0xFFFF;
      b = Math.min(b << l2, 4096) >> l2;
      b = Math.max(b, 32 >> l2);
      b = (b << l2) & ~0xF; b >>= l2;        // physical length must be a multiple of 16
      if (b > 0 && b !== this.bufLen) this._setBufLen(b);
    }
    if (period) {
      const p = period < 0 ? 3 : period & ~0xFF ? 0xFF : period;
      let r3 = p >> l2; if (r3 < 3) r3 = 3;
      this.period = r3 << l2;
    }
    this.log2nchan = l2;
    this._changed();
    return old;
  }
  _setBufLen(b) {
    this.bufLen = b;
    this.bufs = Array.from({ length: CHANNELS }, () => [new Uint8Array(b), new Uint8Array(b)]);
    this.left = new Float32Array(b); this.right = new Float32Array(b);
  }

  /** Sound_Enable: 0 read, 1 off, 2 on; returns the previous state (1 off, 2 on). */
  enable(r0 = 0) {
    this._pre();
    const old = this.enabled ? 2 : 1;
    if (r0 === 1) this.enabled = false;
    else if (r0 >= 2) { this.enabled = true; this._changed(); }
    return old;
  }

  /** Sound_Speaker: 0 read, 1 off, 2 on; returns the previous state. */
  speaker(r0 = 0) {
    const old = this.speakerOn ? 2 : 1;
    if (r0 === 1) this.speakerOn = false; else if (r0 >= 2) this.speakerOn = true;
    return old;
  }

  /** Sound_Stereo: channel 1-8, position -127..127 (-128 = read). Returns the old position or -128. */
  stereo(ch, pos) {
    const c = (ch | 0) - 1;
    if (c < 0 || c >= CHANNELS) return -128;
    const old = this.images[c] - 0x80;
    const b = (pos | 0) + 0x80;
    if (b <= 0 || b >= 0x100) return old;
    for (let k = c; k < 8; k += this.nchan) this.images[k] = b;   // program at the interleave factor
    return old;
  }

  // ============================================================== Level1 (Sound1)
  /** Sound_Volume: 1..127 sets (0 reads); returns the old value. */
  volume(v = 0) {
    const old = this.maxAmp;
    v &= 0x7F;
    if (v) { this.maxAmp = v; this.logTable = buildLogTable(v); this.ampTable = buildAmpTable(v); }
    return old;
  }

  /** Sound_Tuning: 0 reads, else sets the master pitch (16 bits); returns the old value. */
  tuning(v = 0) {
    const old = this.masterPitch;
    if (v) this.masterPitch = v & 0xFFFF;
    return old;
  }

  /** Sound_Pitch: 15-bit pitch -> phase increment (>= &8000 passes through). */
  pitch(p) { return (p | 0) >= 0x8000 ? p : pitchToInc(p, this.masterPitch); }

  /** Sound_SoundLog: 32-bit signed linear -> log byte scaled by the volume. */
  soundLog(v) { return this.logTable[(v >>> 19) & 8191]; }
  /** Sound_LogScale: scale a log byte by the volume. */
  logScale(b) { return this.ampTable[b & 0xFF]; }

  /** Sound_InstallVoice with a voice object; slot 0 = first free. Returns the slot (0 = failed). */
  installVoice(voice, slot = 0, localName = null) {
    if (slot > MAX_VOICES) throw new SoundError(ERR.IllegalVoice);
    if (!slot) { slot = this.voiceTable.findIndex((v, i) => i > 0 && !v); if (slot < 0) return 0; }
    if (this.voiceTable[slot]) return 0;
    this.voiceTable[slot] = voice;
    this.localNames[slot] = localName;
    // CheckAttachments: re-attach channels that were using this voice number
    for (let c = CHANNELS; c >= 1; c--) if (this.chan[c - 1].voice === slot) { this.chan[c - 1].voice = 0; this.attachVoice(c, slot); }
    return slot;
  }

  /** Name of voice n ('' if none). */
  voiceName(n) { return this.voiceTable[n]?.name ?? ''; }
  /** Installed voices: [{n, name, channels: [1..8 attached]}]. */
  voices() {
    const r = [];
    for (let n = 1; n <= MAX_VOICES; n++) {
      const v = this.voiceTable[n];
      if (v) r.push({ n, name: v.name, local: this.localNames[n] ?? v.name, channels: this.chan.map((c, i) => (c.voice === n ? i + 1 : 0)).filter(Boolean) });
    }
    return r;
  }

  /** Sound_RemoveVoice: returns the removed voice's name. */
  removeVoice(n) {
    if (!(n > 0 && n <= MAX_VOICES)) throw new SoundError(ERR.IllegalVoice);
    const v = this.voiceTable[n];
    if (!v) return 'NullVoice';
    for (let c = CHANNELS; c >= 1; c--) if (this.chan[c - 1].voice === n) { this.attachVoice(c, 0); this.chan[c - 1].voice = n; }
    this.voiceTable[n] = null; this.localNames[n] = null;
    return v.name;
  }

  /** Sound_AttachVoice: channel 1-8, voice (0 = detach). Returns the previous voice. */
  attachVoice(ch, n) {
    const c = (ch | 0) - 1;
    if (c < 0 || c >= CHANNELS) throw new SoundError(ERR.BadSoundChannel);
    const s = this.chan[c];
    let old = s.voice;
    s.voice = 0;
    if (n > MAX_VOICES || n < 0) throw new SoundError(ERR.BadSoundVoice);
    this.voiceTable[old]?.free?.(c);
    if (n) {
      s.voice = n;
      const v = this.voiceTable[n];
      if (v) {
        if (v.instantiate?.(c) === false) { s.voice = 0; throw new SoundError(ERR.BadSoundVoice); }
        s.flags = F.FLUSH2;
      }
    }
    return old;
  }

  /** Sound_AttachNamedVoice (exact name match, ends at a control character or space). */
  attachNamedVoice(ch, name) {
    if (!((ch | 0) >= 1 && ch <= CHANNELS)) throw new SoundError(ERR.BadSoundChannel);
    const want = String(name).replace(/^ +/, '').split(/[\x00-\x20]/)[0];
    for (let n = 1; n <= MAX_VOICES; n++) {
      if (this.voiceTable[n]?.name === want) { this.attachVoice(ch, n); return n; }
    }
    throw new SoundError(ERR.BadSoundVoice);
  }

  /**
   * Sound_Control (SoundShared): make or change a sound on channel 1-8 (only the bottom 4
   * bits of the channel are used: the BBC's H, S and flush bits are ignored).
   * amp: -15..0 (0 = silent), &100-&17F gate on with 7-bit log amplitude, &180-&1FF smooth
   * update; 1..&FF (envelopes) are ignored. pitch: see tables.pitchToInc. dur: 1/20 s, 255 = forever,
   * 0 = leave the duration as it was.
   */
  control(ch, amp, pitch, dur) {
    this._pre();
    const c = (ch & 0x0F) - 1;
    if (c < 0 || c >= CHANNELS) return;
    if (this.suppress) return;
    const s = this.chan[c];
    let r1;
    const hi = (amp >>> 8) & 0xFF;
    if (hi === 0 || hi === 0xFF) {
      const a = (amp << 16) >> 16;
      if (a > 0) return;                           // ENVELOPE!
      r1 = ((((a - 1) & 0x0F) << 2) ^ 0x7F);
      if (a === 0) r1 = 0;                         // mute 0 amplitude
    } else if (hi === 1) r1 = amp | 0;
    else return;
    s.ampGate = r1 & 0x7F;
    const inc = pitchToInc(pitch, this.masterPitch);
    s.pitch = ((s.pitch & 0xFFFF0000) | inc) >>> 0;   // preserve the phase
    let d = dur | 0;
    if (d === 0xFF) d = 0x0FFFFFFF;
    d = (d + (d << 2)) | 0;                        // * 5: centiseconds (buffer fills)
    if (d !== 0) s.duration = d;
    let f = s.flags & 0x1F;
    if (!(r1 & 0x7F)) f |= F.GATE_OFF;
    f |= r1 & 0x80 ? F.UPDATE : F.GATE_ON;
    s.flags = f;
    this._changed();
  }

  /** Sound_ControlPacked / OS_Word 7: r0 = channel | amplitude << 16, r1 = pitch | duration << 16. */
  controlPacked(r0, r1) {
    this.control(r0 & 0xFFFF, r0 >> 16, r1 & 0xFFFF, r1 >>> 16);
  }

  /** Sound_ReadControlBlock / WriteControlBlock: word at a byte offset (0..24) of a channel's SCCB. */
  readControlBlock(ch, off) {
    const s = this.chan[ch - 1];
    if (!s || off < 0 || off >= 255) return null;
    switch (off & ~3) {
      case 0: return (s.ampGate | (s.voice << 8) | (s.instance << 16) | (s.flags << 24)) | 0;
      case 4: return s.pitch | 0;
      case 8: return s.timbre | 0;
      case 12: return s.duration | 0;
      case 16: return s.p1 | 0;
      case 20: return s.p2 | 0;
      case 24: return s.p3 | 0;
      case 28: return s.p4 | 0;
      default: return 0;
    }
  }
  writeControlBlock(ch, off, v) {
    const s = this.chan[ch - 1];
    const old = this.readControlBlock(ch, off);
    if (old === null) return null;
    switch (off & ~3) {
      case 0: s.ampGate = v & 0xFF; s.voice = (v >>> 8) & 0xFF; s.instance = (v >>> 16) & 0xFF; s.flags = v >>> 24; break;
      case 4: s.pitch = v >>> 0; break;
      case 8: s.timbre = v | 0; break;
      case 12: s.duration = v | 0; break;
      case 16: s.p1 = v | 0; break;
      case 20: s.p2 = v | 0; break;
      case 24: s.p3 = v | 0; break;
      case 28: s.p4 = v | 0; break;
      default: break;
    }
    this._changed();
    return old;
  }

  /** Silence every channel (what acknowledging Escape does: SOUND c,&101,0,1 for c = 8..1). */
  hush() { for (let c = 8; c >= 1; c--) this.control(c, 0x101, 0, 1); }

  // ============================================================== Level2 (Sound2)
  /** Sound_QInit: empty the queue, tempo &1000, beat counter off. */
  qInit() {
    this._pre();
    this.q.clear();
    this.qDepth = 0;
    this.qTempo = DEFAULT_TEMPO;
    this.qLast = 0; this.qBeatCount = 0; this.qBeat = 0;
    return 0;
  }

  /** Sound_QTempo: 0 reads; < &10000 sets the tempo (beats per centisecond * 4096). Returns the old tempo. */
  qTempoSWI(t = 0) {
    this._pre();
    const old = this.qTempo & 0xFFFF;
    if (t) {
      if (t < 0x10000) this.qTempo = ((this.qTempo & 0xFFFF0000) | (t & 0xFFFF)) >>> 0;
      else this.qTempo = t >>> 0;
    }
    return old;
  }

  /** Sound_QBeat: 0 reads the beat, -1 reads the bar length, > 0 sets it, < -1 disables. Returns old. */
  qBeatSWI(n = 0) {
    this._pre();
    n |= 0;
    if (n === 0) return this.qBeat;
    if (n === -1) return this.qBeatCount;
    const old = this.qBeatCount;
    if (n > 0) this.qBeatCount = n & 0xFFFF;
    else { this.qBeatCount = 0; this.qBeat = 0; }
    this._changed();
    return old;
  }

  /** Sound_QFree: guaranteed free slots (pessimistic, may be negative). */
  qFree() { return Q_FREE_SLOTS - this.qDepth; }

  /**
   * Sound_QSchedule: time (beats from the start of the bar; < 0 = with the last event),
   * control (0 = Sound_Control with data0/data1 packed as OS_Word 7, &0F000000 | SWI number =
   * call that SWI with r0 = data0, r1 = data1, or a JS function called with (data0, data1)).
   * Returns 0, or -1 if the queue is full.
   */
  qSchedule(time, control, d0, d1) {
    this._pre();
    time |= 0;
    if (time < 0) time = this.qLast; else this.qLast = time;
    let rel = time - this.qBeat;
    if (rel < 0) rel = 0;
    const tick = this.qSlot + rel;
    const list = this.q.get(tick);
    const used = 2 * this.q.size + this.qDepth;
    if (Q_ELEMENTS - used < (list ? 1 : 3)) return -1;
    const ev = { control, d0: d0 | 0, d1: d1 | 0 };
    if (list) list.push(ev); else this.q.set(tick, [ev]);
    this.qDepth++;
    this._changed();
    return 0;
  }

  _dispatchSlot() {
    const list = this.q.get(this.qSlot);
    if (!list) return;
    while (list.length) {                        // events added now at this slot run too
      const ev = list.shift();
      this.qDepth--;
      this._dispatchEvent(ev);
    }
    this.q.delete(this.qSlot);
  }

  _dispatchEvent(ev) {
    const c = ev.control;
    if (typeof c === 'function') { try { c(ev.d0, ev.d1); } catch (e) { console.error(e); } return; }
    if (c === 0) { this.control(ev.d0 & 0xFFFF, ev.d0 >> 16, ev.d1 & 0xFFFF, ev.d1 >>> 16); return; }
    if ((c & 0x0F000000) === 0x0F000000) { try { this.swi(c & 0x00FFFFFF, [ev.d0, ev.d1, 0, 0, 0, 0, 0, 0]); } catch { /* errors are ignored */ } }
  }

  /** Sound_QSDispatch / the Level2 handler: advance the tempo accumulator and dispatch. */
  qDispatch() {
    let t = (this.qTempo & 0x0FFFFFFF) >>> 0;
    t = (t + (t << 16)) >>> 0;
    this.qTempo = t;
    let n = t >>> 28;
    this._dispatchSlot();
    while (n-- > 0) {
      this.qSlot++;
      if (this.qLast - 1 >= 0) this.qLast--;
      if (this.qBeatCount) {
        this.qBeat++;
        if (this.qBeat >= this.qBeatCount) {
          this.qBeat = 0;
          for (const h of this.eventHandlers) { try { h(); } catch (e) { console.error(e); } }
        }
      }
      this._dispatchSlot();
    }
  }

  // ============================================================== SWIs by number
  /**
   * Call a Sound SWI: regs is an array (r0..r7) updated in place (returns it). Voice objects
   * can't be passed by address, so Sound_InstallVoice with a generator only works from JS
   * (installVoice()); the interrogation forms return names in regs.names.
   */
  swi(num, regs = []) {
    const r = regs;
    for (let i = 0; i < 8; i++) r[i] = r[i] | 0;
    switch (num & ~0x20000) {
      case SWI.Sound_Configure: { const old = this.configure(r[0], r[1], r[2]); for (let i = 0; i < 5; i++) r[i] = old[i]; break; }
      case SWI.Sound_Enable: r[0] = this.enable(r[0]); break;
      case SWI.Sound_Stereo: r[1] = this.stereo(r[0], r[1]); break;
      case SWI.Sound_Speaker: r[0] = this.speaker(r[0]); break;
      case SWI.Sound_Mode: r[0] = 0; break;                     // mu-law sound system only
      case SWI.Sound_LinearHandler: case SWI.Sound_SampleRate: r[0] = 0; break;
      case SWI.Sound_Volume: r[0] = this.volume(r[0]); break;
      case SWI.Sound_SoundLog: r[0] = this.soundLog(r[0]); break;
      case SWI.Sound_LogScale: r[0] = this.logScale(r[0]); break;
      case SWI.Sound_InstallVoice: {
        const flavour = r[0], slot = r[1];
        if (slot > MAX_VOICES) throw new SoundError(ERR.IllegalVoice);
        if (flavour === 0 || flavour === 2) {
          if (slot === 0) { r[1] = this.voiceTable.findIndex((v, i) => i > 0 && !v); if (r[1] < 0) r[1] = 0; break; }
          const name = this.voiceName(slot);
          r.names = { name, local: this.localNames[slot] ?? name };
          break;
        }
        if (flavour === 3) { if (this.voiceTable[slot]) this.localNames[slot] = r.localName ?? this.localNames[slot]; break; }
        r[1] = 0;                                   // a voice generator in ARM code can't be installed
        break;
      }
      case SWI.Sound_RemoveVoice: r.names = { name: this.removeVoice(r[1]) }; break;
      case SWI.Sound_AttachVoice: r[1] = this.attachVoice(r[0], r[1]); break;
      case SWI.Sound_ControlPacked: this.controlPacked(r[0], r[1]); break;
      case SWI.Sound_Tuning: r[0] = this.tuning(r[0]); break;
      case SWI.Sound_Pitch: r[0] = this.pitch(r[0]); break;
      case SWI.Sound_Control: this.control(r[0], r[1], r[2], r[3]); break;
      case SWI.Sound_AttachNamedVoice: this.attachNamedVoice(r[0], r.name ?? ''); break;
      case SWI.Sound_ReadControlBlock: { const v = this.readControlBlock(r[0], r[1]); if (v === null) r[0] = 0; else r[2] = v; break; }
      case SWI.Sound_WriteControlBlock: { const v = this.writeControlBlock(r[0], r[1], r[2]); if (v === null) r[0] = 0; else r[2] = v; break; }
      case SWI.Sound_QInit: r[0] = this.qInit(); break;
      case SWI.Sound_QSchedule: r[0] = this.qSchedule(r[0], r[1] >>> 0, r[2], r[3]); break;
      case SWI.Sound_QRemove: r[0] = -1; break;
      case SWI.Sound_QFree: r[0] = this.qFree(); break;
      case SWI.Sound_QSDispatch: this.qDispatch(); break;
      case SWI.Sound_QTempo: r[0] = this.qTempoSWI(r[0]); break;
      case SWI.Sound_QBeat: r[0] = this.qBeatSWI(r[0]); break;
      case SWI.Sound_QInterface: r[0] = 0; r[1] = 0; r[2] = 0; break;
      default: throw new SoundError({ errnum: 0x1E6, errmess: 'SWI not known' });
    }
    return r;
  }

  // ============================================================== the sound interrupt
  /** True when nothing can make a sound: every channel quiet and flushed, no queued events. */
  idle() {
    if (!this.enabled) return true;
    if (this.qDepth || this.listeners.size || this.appliedLog2 !== this.log2nchan) return false;
    const n = this.nchan;
    for (let c = 0; c < n; c++) { const f = this.chan[c].flags; if (f >= F.ACTIVE || f & 3) return false; }
    return true;
  }

  _quiet() {
    for (let c = this.nchan - 1; c >= 0; c--) { const f = this.chan[c].flags; if (f >= F.ACTIVE || f & 3) return false; }
    return true;
  }

  /** Something audible may be produced (for the output to wake up). */
  busy() { return this.enabled && !this.idle(); }

  /**
   * One Level0 buffer: returns true if the output buffers (this.left / this.right) hold
   * sound, false if they are silent (this.left/right are then left untouched).
   */
  fill() {
    this.fills++;
    if (!this.enabled) return false;               // DMA off: no interrupts at all
    this.inFill = true;
    let any = false;
    const n = this.nchan, bank = this.fills & 1;
    try {
      let changed = false;
      if (this.log2nchan !== this.appliedLog2) { changed = true; this.appliedLog2 = this.log2nchan; }
      this.qDispatch();                            // Level2 first
      for (const l of this.listeners) { try { l(this); } catch (e) { console.error(e); } }
      if (changed || !this._quiet()) for (let c = 0; c < n; c++) any = this._fillChannel(c, changed, this.bufs[c][bank]) || any;
    } finally { this.inFill = false; }
    if (!any) return false;
    // Level0 output: the 3.71 mu-law -> 16-bit stereo conversion
    const L = this.left, R = this.right, len = this.bufLen, shift = 3 + this.log2nchan;
    const bl = [], wl = [], wr = [];
    for (let c = 0; c < n; c++) { bl[c] = this.bufs[c][bank]; const im = imageOf(this.images[c]); wl[c] = WL[im]; wr[c] = WR[im]; }
    const gain = this.speakerOn ? 1 / 32768 : 0;
    for (let i = 0; i < len; i++) {
      let al = 0, ar = 0;
      for (let c = 0; c < n; c++) { const v = LOG_TO_LINEAR[bl[c][i]]; al += v * wl[c]; ar += v * wr[c]; }
      L[i] = ((al * 11) >> shift) * gain;
      R[i] = ((ar * 11) >> shift) * gain;
    }
    return true;
  }

  /** Level1Fill for one channel. Returns true if the buffer may be non-zero. */
  _fillChannel(c, changed, buf) {
    const s = this.chan[c];
    let f = s.flags;
    if (changed) f = (f | F.FLUSH2) & ~F.FLUSH1;
    if (f >= F.ACTIVE) {
      const vi = s.voice;
      const v = vi < MAX_VOICES ? this.voiceTable[vi] : null;
      if (v) {
        let r0;
        if (f & F.GATE_OFF) r0 = v.gateOff(this, c, s, buf);
        else if (f & F.GATE_ON) r0 = v.gateOn(this, c, s, buf);
        else if (f & F.UPDATE) r0 = v.update(this, c, s, buf);
        else r0 = v.fill(this, c, s, buf);
        let f2 = s.flags;
        if (f2 & F.GATE_OFF) f2 &= ~F.GATE_OFF;
        else if (f2 & F.GATE_ON) f2 &= ~(F.GATE_ON | 3);
        else f2 = 0;
        s.flags = (f2 | r0) & 0xFF;
        return true;
      }
      f = F.FLUSH2;                                // no voice: force a flush
    }
    if (f & 3) { s.flags = f - F.FLUSH1; buf.fill(0); return false; }
    return false;                                  // untouched (zero since its flushes)
  }

  /** Advance n fills running only Level2 (the scheduler and beat counter): long idle gaps. */
  skip(n) {
    for (let k = 0; k < n; k++) {
      this.fills++;
      if (!this.enabled) continue;
      this.inFill = true;
      try { this.qDispatch(); for (const l of this.listeners) l(this); } finally { this.inFill = false; }
    }
  }
}
