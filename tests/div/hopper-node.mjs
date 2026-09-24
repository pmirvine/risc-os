// node tests/div/hopper-node.mjs - !Hopper without a browser: the seed disc copy (tools/disc-classics.mjs), its level
// tables and data files, the QTM stand-in (src/apps/Hopper/qtm.js) playing the three modules and the effect samples on
// the emulated sound system, and the Choices / HiScores file formats of keys.c and hopper.c.
import fs from 'fs';
import path from 'path';
import { soundSystem } from '../../src/core/sound/index.js';
import { QTM, parseMod } from '../../src/apps/Hopper/qtm.js';
import { readPrefs, writePrefs, defaultPrefs, readHi, writeHi, resetHi } from '../../src/apps/Hopper/prefs.js';

let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };
const ok = (c, m) => { if (!c) fail(m); };
const DIR = 'assets/disc/HardDisc4/Diversions/=21Hopper';
const file = (p) => new Uint8Array(fs.readFileSync(path.join(DIR, ...p.split('/'))));

// ---------------------------------------------------------------- the application directory
const mf = JSON.parse(fs.readFileSync('assets/disc/manifest.json', 'utf8'));
const div = mf.root.children.find((c) => c.name === 'Diversions');
const app = div?.children.find((c) => c.name === '!Hopper');
ok(app?.type === 'app', 'no $.Diversions.!Hopper in the manifest');
const names = [];
const walk = (n, p) => { for (const c of n.children ?? []) { const q = p ? p + '.' + c.name : c.name; if (c.children) walk(c, q); else names.push(q); } };
if (app) walk(app, '');
for (const want of ['!Help', '!Run', '!RunImage', '!Sprites', '!Sprites11', '!Sprites22', 'Keys', 'Messages', 'Templates', 'LICENSE',
  'Graphics.Frog', 'Graphics.Fly', 'Graphics.Snake', 'Graphics.Vehicles', 'Graphics.Water', 'Graphics.Scenery', 'Graphics.Numbers', 'Graphics.Title',
  'Levels.Cars', 'Levels.Water', 'Music.Intro', 'Music.InGame', 'Music.HiScore',
  ...['Jump', 'Alarm', 'Frog', 'Splash', 'Clear', 'Burp', 'Splat', 'Bank', 'Eaten'].map((s) => 'Sounds.' + s)]) ok(names.includes(want), 'missing ' + want);
console.log('files', names.length);
// graphics sizes as graphics.c addresses them (words): frog 13 frames x 4 shifts x 240, fly 4 x 200, snake 4 x 192,
// vehicles 7 x 4 x 200, water 5 x 4 x 440, scenery 10 x 240, numbers 10 x 40, title 61 x 42
const sizes = { Frog: 13 * 4 * 960, Fly: 4 * 800, Snake: 4 * 768, Vehicles: 7 * 4 * 800, Water: 5 * 4 * 1760, Scenery: 10 * 960, Numbers: 10 * 160, Title: 244 * 42 };
for (const [g, n] of Object.entries(sizes)) ok(file('Graphics/' + g).length === n, `Graphics.${g} is ${file('Graphics/' + g).length} bytes, want ${n}`);
ok(new TextDecoder('latin1').decode(file('Messages')).includes('_Version:1.05'), 'Messages has no _Version');

// level tables: word 0 = number of levels L, words 1..L = offsets; each level 4 rows of speed, width, num, x...
for (const lv of ['Cars', 'Water']) {
  const b = file('Levels/' + lv), v = new DataView(b.buffer);
  const w = (i) => v.getInt32(i * 4, true);
  const L = w(0);
  let good = L > 0 && L < 50;
  for (let l = 1; l <= L && good; l++) {
    let p = w(l);
    for (let r = 0; r < 4; r++) { const speed = w(p++), width = w(p++), num = w(p++); good &&= speed > 0 && width > 0 && num >= 0 && num <= 10; p += num; }
    good &&= p * 4 <= b.length;
  }
  const speeds = []; for (let p = w(1), r = 0; r < 4; r++) { speeds.push(w(p)); p += 3 + w(p + 2); }
  console.log(`Levels.${lv}: ${L} levels, level 1 row speeds ${speeds}`);
  ok(good, `Levels.${lv} table malformed`);
}

// ---------------------------------------------------------------- QTM stand-in on the sound system
const sys = soundSystem();
const before = sys.nchan;
const q = new QTM();
q.claim();
ok(sys.nchan === 8, 'QTM_SoundControl 8: channels ' + sys.nchan);
const rms = (n) => {
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) { sys.fill(); for (let k = 0; k < sys.left.length; k++) { s += sys.left[k] ** 2 + sys.right[k] ** 2; c += 2; } }
  return Math.sqrt(s / c);
};
for (const song of ['Intro', 'InGame', 'HiScore']) {
  const m = parseMod(file('Music/' + song));
  ok(m.patterns.length > 0 && m.songLen > 0 && m.samples.some((s) => s.data.length), `${song}: bad module`);
  q.load(m); q.volume = 64; q.musicVol = 48; q.start();
  const r = rms(300);                                   // 3 seconds
  console.log(`Music.${song}: "${m.title}" ${m.songLen} positions, ${m.patterns.length} patterns, rms ${r.toFixed(4)}, row ${q.music?.pos}:${q.music?.row}`);
  ok(r > 0.005, `${song} is silent`);
  ok(q.music && (q.music.pos > 0 || q.music.row > 8), `${song} does not advance`);
  q.volume = 0; const r0 = rms(20);                     // QTM_Volume 0 (the fade in gfx_fade_screen_and_qtm)
  ok(r0 < r / 20, `${song}: QTM_Volume 0 still plays (${r0})`);
  q.stop();
}
ok(rms(20) === 0, 'music still sounding after QTM_Stop');
// effects: QTM_PlayRawSample on channels 5-8, log samples at a note
q.sampleVol = 64;
const jump = file('Sounds/Jump');
q.stereo(5, -126 + Math.trunc((150 * 100) / 126));
q.playRawSample(5, jump, 15, 64);
const e1 = rms(10);
console.log('Sounds.Jump rms', e1.toFixed(4));
ok(e1 > 0.005, 'jump sample silent');
q.sampleVol = 0; q.playRawSample(6, jump, 15, 64); rms(40); ok(rms(10) === 0 || rms(10) < e1 / 20, 'QTM_SampleVolume 0 not silent');
q.release();
ok(sys.nchan === before, `sound system not given back: ${sys.nchan} channels (was ${before})`);

// ---------------------------------------------------------------- Choices and HiScores formats
const p = { ...defaultPrefs(), up: 216, fxVol: 20, autoRepeat: 1 };
const pb = writePrefs(p);
ok(pb.length === 52, 'Choices is 13 words');
ok(JSON.stringify(readPrefs(pb)) === JSON.stringify(p), 'Choices round trip');
ok(defaultPrefs().up === 207 && defaultPrefs().down === 232 && defaultPrefs().left === 225 && defaultPrefs().right === 194, "default keys ' / Z X");
const hi = resetHi(); hi[0] = { name: 'Frog Lover', score: 12340 };
const hb = writeHi(hi);
ok(hb.length === 440, 'HiScores is 10 x 44 bytes');
const h2 = readHi(hb);
ok(h2[0].name === 'Frog Lover' && h2[0].score === 12340 && h2[9].name === 'Hopper' && h2[9].score === 1000, 'HiScores round trip ' + JSON.stringify(h2[0]));

if (fails) { console.log(`FAIL ${fails} check(s)`); process.exit(1); } else console.log('OK');
