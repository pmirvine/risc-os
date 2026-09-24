// The sound modules' * commands (Sound0 SoundDMA, Sound1 SoundChannels, Sound2 SoundScheduler),
// with their syntax/help texts from the modules' Messages files and their parameter checks.
// registerSoundCommands(def) is called by src/core/commands.js (def(name, syntax, help, run));
// registerSoundCommands(def, () => system) binds them to another SoundSystem (BASIC's Sound).

import { soundSystem, voicesText, ERR } from './index.js';

class SoundCmdError extends Error {
  constructor(e) { super(e.errmess ?? e.message); this.errnum = e.errnum ?? 0; this.riscos = true; }
}
const bad = () => new SoundCmdError(ERR.BadSoundParameter);
const badChannel = () => new SoundCmdError(ERR.BadSoundChannel);

/** OS_ReadUnsigned (base 10 default, &hex, base_digits); null if not a number. */
export function readUnsigned(s) {
  s = String(s ?? '');
  let m;
  if ((m = /^&([0-9a-f]+)$/i.exec(s))) return parseInt(m[1], 16);
  if ((m = /^(\d+)_([0-9a-z]+)$/i.exec(s))) { const b = +m[1]; const v = parseInt(m[2], b); return b >= 2 && b <= 36 && !Number.isNaN(v) ? v : null; }
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}
const need = (s) => { const v = readUnsigned(s); if (v === null) throw bad(); return v; };
const onOff = (s) => { if (/^on$/i.test(s ?? '')) return 2; if (/^of(f|\.)?$/i.test(s ?? '')) return 1; throw bad(); };
const wrap = (fn) => async (a, ctx) => {
  try { return await fn(a, ctx); } catch (e) { throw e.errnum !== undefined && !e.riscos ? new SoundCmdError(e) : e; }
};

export function registerSoundCommands(def, s = soundSystem) {
  // ------------------------------------------------ SoundDMA
  def('Audio', 'Syntax: *Audio ON|OFF', '*Audio controls the sound system.', wrap((a) => { s().enable(onOff(a[0])); }));
  def('Speaker', 'Syntax: *Speaker ON|OFF', '*Speaker controls the loudspeaker.', wrap((a) => { s().speaker(onOff(a[0])); }));
  def('Stereo', 'Syntax: *Stereo <chan> <pos> where <chan> is 1-8, <pos> is -127(L) to 127(R) (0 for centre)',
    '*Stereo sets the stereo position of a sound channel.', wrap((a) => {
      const c = readUnsigned(a[0]);
      if (c === null || c < 1 || c > 8) throw badChannel();
      const m = /^([+-]?)(.*)$/.exec(a[1] ?? '');
      const p = readUnsigned(m[2]);
      if (p === null || p > 127) throw new SoundCmdError({ errnum: 0x20002, errmess: 'Stereo position must be in the range -127 to +127' });
      s().stereo(c, m[1] === '-' ? -p : p);
    }));
  // ------------------------------------------------ SoundChannels
  def('Volume', 'Syntax: *Volume <n>', '*Volume sets the audio channel loudness; range 1-127.', wrap((a) => {
    const v = need(a[0]);
    if (v === 0 || v >= 128) throw bad();
    s().volume(v);
  }));
  def('Voices', 'Syntax: *Voices', '*Voices lists the installed voices and channel allocation.', wrap((a, { out }) => {
    for (const l of voicesText(s()).split('\n')) out.writeln(l);
  }));
  def('ChannelVoice', 'Syntax: *ChannelVoice <channel> <voice index>|<voice name>', '*ChannelVoice attaches a Voice to a Sound Channel.', wrap((a) => {
    const c = readUnsigned(a[0]);
    if (c === null) throw bad();
    if (c < 1 || c > 8) throw badChannel();
    const v = readUnsigned(a[1]);
    if (v !== null) s().attachVoice(c, v); else s().attachNamedVoice(c, a.slice(1).join(' '));
  }));
  def('Sound', 'Syntax: *Sound <chan> <amp> <pitch> <duration>', '*Sound makes a foreground (immediate) sound.', wrap((a) => {
    const c = need(a[0]);
    if (c < 1 || c > 8) throw badChannel();
    s().control(c, need(a[1]), need(a[2]), need(a[3]));
  }));
  def('Tuning', 'Syntax: *Tuning -&offf to &offf (-16383 to 16383) (where \'o\' is octave, \'fff\' is fraction of octave)',
    '*Tuning alters the relative system tuning. *Tuning 0 resets tuning to default.', wrap((a) => {
      const m = /^([+-]?)(.*)$/.exec(a[0] ?? '');
      let v = need(m[2]);
      if (v >> 14) throw bad();
      if (m[1] === '-') v = -v;
      const sys = s();
      if (v === 0) sys.tuning(0xAAB0 - 0x4000); else sys.tuning(sys.tuning(0) + v);
    }));
  // ------------------------------------------------ SoundScheduler
  def('Tempo', 'Syntax: *Tempo <n> (0 - &FFFF, default is &1000)', '*Tempo sets the system tempo.', wrap((a) => {
    const v = need(a[0]);
    if (v >> 16) throw bad();
    s().qTempoSWI(v);
  }));
  def('QSound', 'Syntax: *QSound <chan> <amp> <pitch> <duration> <nTicks>', '*QSound queues a sound after the specified number of tempo ticks.', wrap((a) => {
    const c = need(a[0]);
    if (c < 1 || c > 8) throw badChannel();
    const amp = need(a[1]), pitch = need(a[2]), dur = need(a[3]), t = need(a[4]);
    s().qSchedule(t, 0, ((c & 0xFFFF) | (amp << 16)) | 0, ((pitch & 0xFFFF) | (dur << 16)) | 0);
  }));
}
