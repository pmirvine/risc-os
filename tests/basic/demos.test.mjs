// The BBC BASIC demo programs in src/basic/demos/ ($.Demos.BASIC on the seed disc): each one is
// tokenised as tools/disc-basicdemos.mjs does, run headless for a bounded time with keys fed in,
// then stopped with Escape. No BASIC errors may be reported and the screen must not be blank.
// WimpClock runs against stub Wimp SWIs; Sprites runs with and without the desktop's OS_SpriteOp.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BasicMachine } from '../../src/basic/machine.js';
import { VDU } from '../../src/basic/vdu.js';
import { Sound } from '../../src/basic/sound.js';
import { tokeniseFile, readMe } from '../../tools/disc-basicdemos.mjs';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'src', 'basic', 'demos');
const LIST = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const UP = 139, DOWN = 138, LEFT = 136, RIGHT = 137;

// how long to let each program run (ms), keys to press [ms, key], and what the output must show
const PLAN = {
  'mandel.bas': { ms: 8000, out: /Mandelbrot set - 48 iterations/ },
  'plasma.bas': { ms: 1500 },
  'fire.bas': { ms: 1500 },
  'stars.bas': { ms: 1500, keys: [[300, UP], [600, DOWN]], stopKey: 32, out: /\d+ frames in/ },
  'asmbars.bas': { ms: 1500, stopKey: 32, out: /Code: 72 bytes/ },
  'asmplot.bas': { ms: 3000, out: /Code: 168 bytes/ },
  'cube.bas': { ms: 1200, stopKey: 32, out: /\d+ frames in/ },
  'sprites.bas': { ms: 1500, out: /No OS_SpriteOp|OS_SpriteOp 34/ },
  'lissajous.bas': { ms: 1500 },
  'roses.bas': { ms: 20000, keys: [[400, 32]] },
  'spiral.bas': { ms: 3000 },
  'circles.bas': { ms: 3000 },
  'colours.bas': { ms: 3000 },
  'tree.bas': { ms: 3000 },
  'life.bas': { ms: 2500, keys: [[1000, 'g'], [1600, 'r']], stopKey: 'q', out: /Generation/ },
  'hanoi.bas': { ms: 2500, out: /TOWERS OF HANOI/ },
  'snake.bas': { ms: 3500, keys: [[300, 32], [700, UP], [1100, LEFT], [1500, DOWN], [1900, RIGHT]], out: /S\s?N\s?A\s?K\s?E|SNAKE/ },
  'ball.bas': { ms: 1500, stopKey: 32, out: /Done\./ },
  'voices.bas': { ms: 3000, out: /WaveSynth-Beep/ },
  'canon.bas': { ms: 2500, out: /Bar 1/ },
  'tune.bas': { ms: 8000, out: /Done - 20 notes/ },
  'teletext.bas': { ms: 3000, text: /RISC OS 3\.71/ },
  'sieve.bas': { ms: 5000, out: /1899 primes/, text: /1899 primes/ },
  'guess.bas': { ms: 4000, keys: [...Array(100)].map((_, i) => [50 + i * 20, `${i + 1}\r`]), out: /Correct! You took \d+ tries\./ },
  'errors.bas': { ms: 3000, out: /Top-level handler: Something went wrong \(99\) at line 130/, allowErl: true },
  'wimpclock.bas': { ms: 3000, wimp: true },
  'mouse.bas': { ms: 1500, stopKey: 'q' },
};

/** Screen summary: distinct pixel values on the displayed bank (sampled) and the text on it. */
function screen(vdu) {
  const seen = new Set();
  for (let y = 0; y < vdu.height; y += 2) for (let x = 0; x < vdu.width; x += 2) seen.add(vdu.getPixel(x, y));
  return { colours: seen.size, text: vdu.teletext ? vdu.textLines().join('\n') : '' };
}

function press(m, k) {
  if (typeof k === 'number') m.keyPress(k);
  else for (const ch of k) m.keyPress(ch.charCodeAt(0));
}

/** Stub Wimp for WimpClock: a redraw of the whole window, some null events, then Message_Quit. */
function wimpStubs(log) {
  const events = [1, 0, 0, 1, 0, 17];
  let rects = 0;
  const S = {};
  const fillState = (m, b) => { const M = m.mem; M.wr32(b + 4, 600); M.wr32(b + 8, 300); M.wr32(b + 12, 1000); M.wr32(b + 16, 760); M.wr32(b + 20, 0); M.wr32(b + 24, 0); M.wr32(b + 28, -1); };
  S.Wimp_Initialise = (r) => { log.push('init ' + r[0]); r[0] = 310; r[1] = 0x1234; };
  S.Wimp_CreateIcon = (r) => { r[0] = 1; };
  S.Wimp_CreateWindow = (r) => { r[0] = 0x220040; };
  S.Wimp_GetWindowState = (r, m) => fillState(m, r[1]);
  S.Wimp_OpenWindow = () => { log.push('open'); };
  S.Wimp_CloseWindow = () => {};
  S.Wimp_ForceRedraw = () => { log.push('force'); };
  S.Wimp_CreateMenu = () => {};
  S.Wimp_CloseDown = () => { log.push('closedown'); };
  S.Wimp_ReportError = (r, m) => { log.push('error ' + m.mem.rdStr0(r[0] + 4)); };
  S.Wimp_SetColour = (r, m) => { m.vduBytes([18, 0, r[0] & 15]); };
  S.Wimp_RedrawWindow = (r, m) => { fillState(m, r[1]); const M = m.mem; M.wr32(r[1] + 28, 600); M.wr32(r[1] + 32, 300); M.wr32(r[1] + 36, 1000); M.wr32(r[1] + 40, 760); rects++; r[0] = 1; };
  S.Wimp_GetRectangle = (r) => { r[0] = 0; };
  S.Wimp_PollIdle = (r, m) => new Promise((res) => setTimeout(() => {
    const e = events.length ? events.shift() : 0;
    const b = r[1];
    if (e === 1) m.mem.wr32(b, 0x220040);
    if (e === 17) { m.mem.wr32(b, 20); m.mem.wr32(b + 16, 0); }
    r[0] = e;
    log.push('poll ' + e);
    res();
  }, 30));
  return { S, rects: () => rects };
}

async function runDemo(file, { services = false } = {}) {
  const plan = PLAN[file] ?? { ms: 1500 };
  let vdu;
  if (services) {
    const { DesktopVDU } = await import('../../src/core/basicwimp/screen.js');
    vdu = new DesktopVDU({ width: 1280, height: 1024 });
  } else vdu = new VDU({ mode: 12 });
  let out = '';
  const log = [];
  const wimp = plan.wimp ? wimpStubs(log) : null;
  const m = new BasicMachine({
    vdu, sound: new Sound(), seed: 11,
    swiHandlers: wimp?.S,
    onOutput: (c) => { if (c >= 32 || c === 10) out += String.fromCharCode(c); },
  });
  const errors = [];
  m.errorHook = (e) => errors.push(`${e.message} at line ${m.interp.line?.num ?? 0}`);
  if (services) (await import('../../src/core/basicwimp/services.js')).installServices(m, {});
  await m.load(tokeniseFile(file));
  const timers = (plan.keys ?? []).map(([t, k]) => setTimeout(() => press(m, k), t));
  let shot = null;
  const stop = setTimeout(() => {
    shot = screen(vdu);
    if (plan.stopKey !== undefined) press(m, plan.stopKey); else m.escape();
    setTimeout(() => { if (m.busy) m.escape(); }, 1500);   // a key the program ignored: Escape
  }, plan.ms);
  const result = await m.run();
  clearTimeout(stop); timers.forEach(clearTimeout);
  shot ??= screen(vdu);
  return { plan, result, out, errors, shot, log, wimp, vdu };
}

describe('BASIC demos', { concurrency: 8 }, () => {
for (const d of LIST) {
  test(`demo ${d.name} (${d.file})`, { timeout: 60000 }, async () => {
    const { plan, result, out, errors, shot, log, wimp } = await runDemo(d.file);
    assert.ok(['end', 'quit'].includes(result.reason), `${d.file} stopped with ${JSON.stringify(result)}\n${out.slice(-400)}`);
    // Escape is the only error allowed (it's how the programs are stopped); errors.bas raises its own
    const real = errors.filter((e) => !/^Escape/.test(e));
    if (d.file !== 'errors.bas') assert.deepEqual(real, [], `${d.file}: BASIC errors`);
    if (!plan.allowErl) assert.doesNotMatch(out, / at line \d+/, `${d.file} reported an error: ${out.slice(-300)}`);
    if (plan.out) assert.match(out, plan.out);
    if (plan.text) assert.match(shot.text || out, plan.text);
    else if (!plan.out || !/primes|tries|handler/.test(String(plan.out))) assert.ok(shot.colours >= 3, `${d.file}: screen nearly blank (${shot.colours} colours)`);
    if (wimp) {
      assert.ok(log.includes('init 200') && log.includes('open') && log.includes('closedown'), log.join(', '));
      assert.ok(log.includes('force'), 'redraws the hands each second');
      assert.ok(wimp.rects() >= 2 && !log.some((l) => l.startsWith('error')), log.join(', '));
    }
  });
}
});

test('Sprites plots real sprites with the desktop OS_SpriteOp', { timeout: 30000 }, async () => {
  const { result, out, errors, shot } = await runDemo('sprites.bas', { services: true });
  assert.equal(result.reason, 'end');
  assert.deepEqual(errors.filter((e) => !/^Escape/.test(e)), []);
  assert.match(out, /OS_SpriteOp 34: 8 sprites with masks/);
  assert.ok(shot.colours > 20, `shaded sprites (${shot.colours} colours)`);
});

test('every demo is listed once, tokenises, and has a ReadMe entry', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.bas')).sort();
  assert.deepEqual(LIST.map((d) => d.file).sort(), files);
  const names = LIST.map((d) => d.name);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length);
  for (const n of names) assert.ok(n.length <= 10 && /^[A-Za-z0-9]+$/.test(n), n);
  const text = readMe(LIST);
  for (const d of LIST) {
    assert.match(text, new RegExp('^' + d.name + ' ', 'm'));
    const src = fs.readFileSync(path.join(DIR, d.file), 'latin1');
    assert.match(src, /^\s*10 REM > /, `${d.file} starts with a REM > name header`);
    assert.ok(tokeniseFile(d.file).length > 20);
  }
});
