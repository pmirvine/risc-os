// The sound system's clients: BBC BASIC (SOUND, VOICES, VOICE, STEREO, BEATS/TEMPO/BEAT, SYS
// Sound_*, * commands), Maestro's performance -> SOUND parameters, and VDU 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BasicMachine } from '../../src/basic/machine.js';
import { Sound } from '../../src/basic/sound.js';
import { SoundOutput } from '../../src/core/sound/output.js';
import { soundSystem, vdu7, bell, configureSound } from '../../src/core/sound/index.js';
import { parseMaestro, perform, STEREO_POS } from '../../src/apps/Maestro/format.js';
import { playNote, VOICES } from '../../src/apps/Maestro/synth.js';
import { pitchToInc } from '../../src/core/sound/tables.js';
import { fresh } from './helpers.mjs';

const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');
async function basic(src) {
  const sys = fresh();
  new SoundOutput(sys, { audio: false });            // wall-clock timing, no audio
  let out = '';
  const m = new BasicMachine({ sound: new Sound({ system: sys }), onOutput: (c) => { if (c !== 13) out += String.fromCharCode(c); } });
  await m.load(lines(...src));
  const res = await m.run();
  return { sys, out, res };
}

test('BASIC SOUND is immediate (OS_Word 7): the last SOUND on a channel wins, nothing waits', async () => {
  const t = Date.now();
  const { sys, res } = await basic(['VOICES 2', 'FOR I%=1 TO 20:SOUND 1,-15,53+I%,20:NEXT', 'SOUND 2,-10,100,5']);
  assert.equal(res.reason, 'end');
  assert.ok(Date.now() - t < 500, 'no queue to wait on');
  assert.equal(sys.chan[0].pitch & 0xFFFF, pitchToInc(73));
  assert.equal(sys.chan[1].ampGate, (((-10 - 1) & 15) << 2) ^ 0x7F);
  assert.equal(sys.nchan, 2);
});

test('BASIC SOUND ...,beat goes to Sound_QSchedule; BEATS / TEMPO / BEAT are the scheduler\'s', async () => {
  const { sys, out } = await basic([
    'BEATS 1000:TEMPO &1000:PRINT BEATS;" ";TEMPO',
    'SOUND 1,-15,53,5,500',
    'T%=TIME:REPEAT UNTIL TIME>T%+5:PRINT BEAT>=4 AND BEAT<50',
    'SYS "Sound_QBeat",200 TO a%:PRINT a%;" ";BEATS',
  ]);
  assert.equal(out, '      1000 4096\n        -1\n      1000 200\n');
  assert.equal(sys.qDepth, 1);
});

test('BASIC VOICE, STEREO, ENVELOPE (ignored), SOUND OFF/ON and SYS Sound_* reach the sound system', async () => {
  const { sys, out, res } = await basic([
    'VOICES 4:VOICE 2,"StringLib-Steel":STEREO 2,-127',
    'ENVELOPE 1,1,0,0,0,0,0,0,126,-1,0,-1,126,100:SOUND 3,1,53,10',
    'SYS "Sound_InstallVoice",0,6 TO n$:PRINT n$',
    'SYS "Sound_AttachVoice",3,9 TO ,old%:PRINT old%',
    'SYS "Sound_Pitch",&4000 TO i%:PRINT i%',
    'SYS "Sound_Volume",100 TO v%:PRINT v%',
    'SOUND OFF:SYS "Sound_Enable" TO e%:SOUND ON:PRINT e%',
    '*ChannelVoice 4 StringLib-Soft',
    'ON ERROR PRINT REPORT$;" &";~ERR:END',
    'VOICE 1,"Nonsense"',
  ]);
  assert.equal(res.reason, 'end');
  assert.equal(out, 'Percussion-Soft\n         1\n       813\n       127\nSound voice must be in the range 0-32 &20005\n'.replace('       127\n', '       127\n         1\n'));
  assert.deepEqual(sys.chan.slice(0, 4).map((c) => c.voice), [1, 4, 9, 2]);
  assert.equal(sys.stereo(2, -128), -127);
  assert.equal(sys.chan[2].flags & 0x40, 0);          // SOUND with an envelope did nothing
  assert.equal(sys.maxAmp, 100);
  assert.equal(sys.enable(0), 2);
});

test('*Voices lists the voices and the channel allocation map', async () => {
  const { out } = await basic(['VOICES 2:VOICE 2,"Percussion-Snare"', '*Voices']);
  const l = out.split('\n');
  assert.equal(l[0], '         Voice      Name');
  assert.equal(l[1], '1 345678   1   WaveSynth-Beep');     // channels default to WaveSynth-Beep
  assert.equal(l[8], ' 2         8   Percussion-Snare');
  assert.equal(l[10], '^^^^^^^^ Channel allocation map');
});

test('VDU 7 on the shared system: channel 1, BELLinfo amplitude, pitch 100, 6/20 s', () => {
  const s = soundSystem();
  configureSound({ loud: false, volume: 7, speaker: true });
  assert.equal(bell.info, 0xD0);
  vdu7();
  assert.equal(s.chan[0].ampGate, 0x57);                // -5
  assert.equal(s.chan[0].duration, 30);
  assert.equal(s.chan[0].pitch & 0xFFFF, pitchToInc(100));
  configureSound({ loud: true });
  vdu7();
  assert.equal(s.chan[0].ampGate, 0x77);                // -13
  configureSound({ volume: 3 });
  assert.equal(s.maxAmp, 0x37);                         // CMOS loudness 3 -> &37
  configureSound({ volume: 7 });
  assert.equal(s.maxAmp, 0x7F);
});

test('Maestro: notes become SOUND c, vol OR &100, Line()+Aoff(), D% on the right voice and stereo', { skip: !fs.existsSync('assets/disc/HardDisc4/Sound/Fanfare') }, () => {
  assert.deepEqual(VOICES.slice(0, 9), ['WaveSynth-Beep', 'StringLib-Soft', 'StringLib-Pluck', 'StringLib-Steel', 'StringLib-Hard',
    'Percussion-Soft', 'Percussion-Medium', 'Percussion-Snare', 'Percussion-Noise']);
  assert.deepEqual(STEREO_POS, [-127, -84, -42, 0, 42, 84, 127]);
  const doc = parseMaestro(new Uint8Array(fs.readFileSync('assets/disc/HardDisc4/Sound/Fanfare')));
  const { events } = perform(doc);
  const e = events[1];
  assert.equal(e.pitch, 0x4000);                                  // middle C line
  // D%: 1/20 s, each (tied) note's Duration%() entry rounded separately
  assert.ok(events.every((x) => x.d20 >= 1 && x.d20 <= 254 && Math.abs(x.d20 - x.dur * 20) <= 2 && x.pitch > 0 && x.pitch < 0x8000));
  const s = soundSystem();
  playNote({ ...e, ch: 2, voice: 4, pan: -1 });
  assert.equal(s.nchan, 8);                                       // SYS Sound_Configure,8
  assert.equal(s.chan[2].voice, 4);
  assert.equal(s.stereo(3, -128), -127);
  assert.equal(s.chan[2].ampGate, e.amp & 0x7F);
  assert.equal(s.chan[2].pitch & 0xFFFF, pitchToInc(e.pitch));
  assert.equal(s.chan[2].duration, e.d20 * 5);
});
