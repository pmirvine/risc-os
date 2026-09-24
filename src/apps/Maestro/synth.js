// Maestro's sound: the emulated RISC OS 3.71 sound system (src/core/sound) with the ROM voices,
// driven the way the original !RunImage drives it (PROCplay_start / PROCplay_notes):
//   Sound_Configure 8, Sound_AttachVoice / Sound_Stereo per channel, Sound_Volume, and for every
//   note  SOUND channel, amplitude OR &100, Line()+Aoff() (15-bit pitch), D% (1/20 s) at its beat.
// The notes are dispatched from the sound interrupt (a Level2 client run each buffer fill), so
// they land on the same 1-centisecond grid as the original's Sound_QSchedule events.
//
// Voice numbers follow the 3.71 ROM installation order (*Voices):
//   1 WaveSynth-Beep  2 StringLib-Soft  3 StringLib-Pluck  4 StringLib-Steel  5 StringLib-Hard
//   6 Percussion-Soft 7 Percussion-Medium 8 Percussion-Snare 9 Percussion-Noise

import { soundSystem, soundOutput } from '../../core/sound/index.js';

export const VOICES = soundSystem().voices().map((v) => v.name);

/** The AudioContext (resumed), or null if there's no Web Audio. */
export function audio() {
  const out = soundOutput();
  const c = out.audio();
  if (c) out.resume();
  return c;
}

/**
 * Overall volume: Sound_Volume 1..127 (Maestro's Volume menu). The system volume in force
 * before is put back when the player stops.
 */
let savedVolume = null;
/** The current Sound_Volume. */
export const systemVolume = () => soundSystem().maxAmp;
export function setMasterVolume(v) {
  const old = soundSystem().volume(Math.max(1, Math.min(127, v | 0)));
  savedVolume ??= old;
}

/** The SOUND parameters for an event ({pitch, d20} from perform(), else {midi, dur}). */
function soundArgs(ev) {
  const pitch = ev.pitch ?? Math.round(0x4000 + (ev.midi - 60) * 4096 / 12);
  const d20 = ev.d20 ?? Math.max(1, Math.min(254, Math.round(ev.dur * 20)));
  return [(ev.ch ?? 0) + 1, 0x100 | (Math.max(0, Math.min(127, ev.amp | 0))), pitch & 0x7FFF, d20];
}

/** Set up channel ch (0-7) for an event's voice and stereo position. */
function setupChannel(sys, ev) {
  const c = (ev.ch ?? 0) + 1;
  if (ev.voice && sys.chan[c - 1].voice !== ev.voice && sys.voiceTable[ev.voice]) sys.attachVoice(c, ev.voice);
  if (ev.pan !== undefined) sys.stereo(c, Math.round(Math.max(-1, Math.min(1, ev.pan)) * 127));
}

/**
 * Play one note now: ev {ch, amp (0..127 log), pitch | midi, d20 | dur, voice, pan}.
 * (t, an audio time, is accepted for compatibility: notes start at once.)
 */
export function playNote(ev) {
  const sys = soundSystem();
  if (sys.nchan < 8) sys.configure(8, 0, 0);
  setupChannel(sys, ev);
  sys.control(...soundArgs(ev));
  return [];
}

const wallNow = () => performance.now() / 1000;

/** Plays a list of events ({time, ...}) from `from` seconds, from the sound interrupt. */
export class Player {
  constructor() { this.playing = false; this.events = []; this._listener = null; this._t0 = 0; }

  play(events, { from = 0, onEnd, length } = {}) {
    this.stop();
    const out = soundOutput();
    if (!audio()) return false;
    const sys = soundSystem();
    this.events = [...events].sort((a, b) => a.time - b.time);
    let i = this.events.findIndex((e) => e.time >= from - 1e-6);
    if (i < 0) i = this.events.length;
    this.length = length ?? this.events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
    this.onEnd = onEnd;
    sys.configure(8, 0, 0);                                    // PROCplay_start: SYS Sound_Configure,8
    const seen = new Set();
    for (const e of this.events) { if (!seen.has(e.ch)) { seen.add(e.ch); setupChannel(sys, e); } }
    // dispatch from the sound interrupt: fill k plays at from + (k - k0) * fillPeriod
    let k = 0;
    const period = sys.fillPeriod;
    this._listener = (s) => {
      const t = from + k * period;
      k++;
      while (i < this.events.length && this.events[i].time <= t + 1e-9) {
        const e = this.events[i++];
        const c = s.chan[(e.ch ?? 0)];
        if (e.voice && c.voice !== e.voice && s.voiceTable[e.voice]) s.attachVoice((e.ch ?? 0) + 1, e.voice);
        s.control(...soundArgs(e));
      }
      if (i >= this.events.length && t > this.length + 0.3) {
        s.listeners.delete(this._listener);
        this._listener = null;
        setTimeout(() => { if (this.playing && !this._listener) { this.stop(); this.onEnd?.(); } }, Math.max(0, (this._t0 + (t - from) - wallNow()) * 1000));
      }
    };
    sys.listeners.add(this._listener);
    this.playing = true;
    this._from = from;
    // the renderer runs ahead of the audio clock: the next fill is heard this far from now
    this._t0 = wallNow() + out.ahead();
    out.wake();
    return true;
  }

  /** Current position in seconds (what is being heard). */
  get position() { return this.playing ? Math.max(0, this._from + wallNow() - this._t0) : 0; }

  /** PROCplay_stop: Sound_QInit - notes already sounding finish by themselves. */
  stop() {
    if (this._listener) soundSystem().listeners.delete(this._listener);
    this._listener = null;
    if (this.playing) {
      soundSystem().qInit();
      if (savedVolume !== null) { soundSystem().volume(savedVolume); savedVolume = null; }
    }
    this.playing = false;
  }
}
