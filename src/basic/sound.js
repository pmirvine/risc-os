// BBC BASIC V sound statements on the emulated RISC OS 3.71 sound system (src/core/sound/),
// with the semantics of the 3.71 ROM (BASIC's Stmt code -> OS_Word 7 / Sound_* SWIs):
//
// SOUND channel, amplitude, pitch, duration     OS_Word 7 (Sound_ControlPacked): immediate - the
//                                               note replaces whatever the channel is playing;
//                                               RISC OS has no per-channel queue
// SOUND channel, amplitude, pitch, duration, b  Sound_QSchedule at beat b of the bar
//   channel   1..8 (bottom 4 bits; the BBC H/S/flush bits are ignored); only the first
//             VOICES channels sound
//   amplitude -15..0 (0 = silent), &100-&17F logarithmic (gate on), &180-&1FF smooth update;
//             1..16 (envelopes) are ignored, as OS_Word 8 (ENVELOPE) does nothing in 3.71
//   pitch     0..255 BBC quarter semitones (53 = middle C), &100-&7FFF 15-bit (&4000 = middle C,
//             &1000 per octave), >= &8000 a raw phase increment
//   duration  1/20 s, 255 = forever
// VOICES n (Sound_Configure), VOICE c,"name" (Sound_AttachNamedVoice), STEREO c,p (Sound_Stereo),
// BEATS / TEMPO / BEAT (Sound_QBeat / Sound_QTempo), SOUND ON / OFF (Sound_Enable).
//
// new Sound() uses the shared sound system (src/core/sound/index.js); new Sound({system}) a
// given SoundSystem. Works headless in node (the clock follows the wall clock).

import { soundSystem, soundOutput, vdu7, SWI, SWI_NAMES, SoundError } from '../core/sound/index.js';
import { registerSoundCommands } from '../core/sound/commands.js';
import { BasicError } from './errors.js';

const toBasic = (e) => (e instanceof SoundError ? new BasicError(e.errnum, e.errmess) : e);

export class Sound {
  constructor(opts = {}) {
    this.sys = opts.system ?? soundSystem();
    this.out = opts.system ? (opts.output ?? null) : soundOutput();
  }
  /** Call from a user gesture to let the browser start audio. */
  resume() { this.out?.resume(); }

  sound(ch, amp, pitch, dur, beat = null) {
    const d0 = ((ch & 0xFFFF) | ((amp & 0xFFFF) << 16)) | 0;
    const d1 = ((pitch & 0xFFFF) | ((dur & 0xFFFF) << 16)) | 0;
    if (beat === null || beat === undefined) this.sys.controlPacked(d0, d1);
    else this.sys.qSchedule(beat, 0, d0, d1);
  }
  /** ENVELOPE: OS_Word 8 is unused in RISC OS 3.71. */
  envelope() {}
  enable(on) { this.sys.enable(on ? 2 : 1); }
  stereo(c, p) { this.sys.stereo(c, p); }
  voices(n) { this.sys.configure(n | 0, 0, 0); }
  voice(c, name) { try { this.sys.attachNamedVoice(c, name); } catch (e) { throw toBasic(e); } }
  beat() { return this.sys.qBeatSWI(0); }
  beats() { return this.sys.qBeatSWI(-1); }
  setBeats(n) { return this.sys.qBeatSWI(n); }
  tempo() { return this.sys.qTempoSWI(0); }
  setTempo(n) { return this.sys.qTempoSWI(n); }
  /** VDU 7 with the kernel bell settings. */
  bell() { vdu7(); }
  /** Escape acknowledge (OS_Byte 126): Sound_QInit and silence every channel. */
  escape() { this.sys.qInit(); this.sys.hush(); }
  /** The program ended: RISC OS leaves its sounds alone. */
  stop() {}

  /**
   * A Sound_* SWI (number or name) with registers r (array, updated in place). Name strings
   * for Sound_AttachNamedVoice go in r.name; interrogations return r.names.
   */
  swi(num, r) {
    if (typeof num === 'string') num = SWI[num.replace(/^X/, '')];
    if (num === undefined) return false;
    try { this.sys.swi(num, r); } catch (e) { throw toBasic(e); }
    return true;
  }
  static swiName(num) { return SWI_NAMES[num & ~0x20000]; }

  /**
   * The sound modules' * commands (*Voices, *ChannelVoice, *Volume, *Sound, *Tuning, *Stereo,
   * *Speaker, *Audio, *Tempo, *QSound) for a machine without a host CLI. Returns true if handled.
   */
  async oscli(name, rest, writeln) {
    if (!this.commands) {
      this.commands = new Map();
      registerSoundCommands((n, syntax, help, run) => this.commands.set(n.toUpperCase(), run), () => this.sys);
    }
    const run = this.commands.get(String(name).toUpperCase());
    if (!run) return false;
    try { await run(String(rest).split(/\s+/).filter(Boolean), { out: { writeln, write: writeln } }); } catch (e) { throw new BasicError(e.errnum ?? 0, e.message); }
    return true;
  }
}
