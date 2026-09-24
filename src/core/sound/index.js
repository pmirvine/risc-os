// The desktop's one sound system (as RISC OS has one): the emulated SoundDMA/SoundChannels/
// SoundScheduler with the ROM voices, and its Web Audio output. See docs/SOUND.md.
//
//   import { soundSystem, vdu7 } from '../core/sound/index.js';
//   soundSystem().control(1, -15, 53, 20);           // SOUND 1,-15,53,20
//   vdu7();                                           // VDU 7 with the kernel bell settings
//
// Everything works headless (node): without Web Audio the clock follows the wall clock.

import { SoundSystem, SoundError, SWI, SWI_NAMES, ERR } from './system.js';
import { SoundOutput } from './output.js';

export { SoundSystem, SoundOutput, SoundError, SWI, SWI_NAMES, ERR };

let sys = null, out = null;

/** The shared SoundSystem (created on first use, with its output/clock). */
export function soundSystem() {
  if (!sys) { sys = new SoundSystem(); out = new SoundOutput(sys); }
  return sys;
}
/** The shared output (Web Audio + clock). */
export function soundOutput() { soundSystem(); return out; }

/**
 * The kernel's bell variables (OS_Byte 211-214, ByteVarInitTable): channel 1, BELLinfo &90
 * (amplitude -13; the CMOS "Quiet" setting makes it &D0, amplitude -5), pitch 100, 6/20 s.
 */
export const bell = { channel: 1, info: 0x90, freq: 100, dur: 6 };

/** The OS_Word 7 block VDU 7 builds from the bell variables (vduwrch BEL). */
export function bellBlock(b = bell) {
  let hs = b.info & 7;
  if (hs & 4) hs ^= 4 ^ 0x10;                 // H into bit 4, S bits 0-1
  const amp = ((b.info << 24) >> 27) + 1;     // bits 3-7 sign-extended, + 1
  return {
    r0: ((b.channel & 0xFF) | ((hs & 0xFF) << 8) | ((amp & 0xFFFF) << 16)) | 0,
    r1: ((b.freq & 0xFF) | ((b.dur & 0xFF) << 16)) | 0,
    channel: b.channel & 0xFF, amplitude: amp, pitch: b.freq & 0xFF, duration: b.dur & 0xFF,
  };
}

/**
 * Run fn(system) from the sound interrupt, `fills` buffers (centiseconds) from the next one:
 * like a Sound_QSchedule code event, but independent of the beat counter.
 */
export function afterFills(fills, fn) {
  const s = soundSystem();
  let n = fills | 0;
  const l = (sys) => { if (n-- <= 0) { sys.listeners.delete(l); fn(sys); } };
  s.listeners.add(l);
  out.wake();
}

/** VDU 7: SOUND &HFSC, A, P, D from the bell variables (through OS_Word 7). */
export function vdu7() {
  const k = bellBlock();
  const s = soundSystem();
  s.controlPacked(k.r0, k.r1);
  out.resume();
}

/**
 * Apply the CMOS sound configuration: volume 0-7 (SoundCMOS loudness: Sound_Volume &01..&7F),
 * speaker on/off, loud (BELLinfo &90) or quiet (&D0) beep, and the channel 1 voice (1-16),
 * which, as in Sound1's initialisation, is only taken at power-on (the first call).
 */
let cmosVoiceDone = false;
export function configureSound({ volume, speaker, loud, voice } = {}) {
  const s = soundSystem();
  if (voice != null && !cmosVoiceDone) { cmosVoiceDone = true; if (s.voiceTable[voice]) s.attachVoice(1, voice); }
  if (volume != null) { const l = Math.max(0, Math.min(7, volume | 0)); s.volume(((l << 4) | (l << 1) | 1) & 0x7F); }
  if (speaker != null) s.speaker(speaker ? 2 : 1);
  if (loud != null) bell.info = loud ? 0x90 : 0xD0;
}

/** *Voices output (Sound1 Voices_Code). */
export function voicesText(s = soundSystem()) {
  const lines = ['         Voice      Name'];
  for (let n = 1; n <= 32; n++) {
    const v = s.voiceTable[n];
    if (!v) continue;
    let map = '';
    for (let c = 0; c < 8; c++) map += s.chan[c].voice === n ? String(c + 1) : ' ';
    lines.push(`${map}  ${n <= 9 ? ' ' : ''}${n}   ${s.localNames[n] ?? v.name}`);
  }
  lines.push('^^^^^^^^ Channel allocation map');
  return lines.join('\n');
}
