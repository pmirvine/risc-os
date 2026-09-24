// Lander (src/apps/Lander): the JavaScript port headless, and - when a local, git-ignored vendor/lander
// checkout provides the original (C) D. J. Braben 1987 binary - the port against the original on the emulated
// ARM2, frame by frame: with the same mouse input every screen bank must be identical, through flying,
// shooting, crashes, game over and new games. Without vendor/lander those tests are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMachine, OriginalLander, portOs, portFrameCycles, FRAME_CYCLES } from '../../src/apps/Lander/host.js';
import { createLander, TABLES } from '../../src/apps/Lander/game.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const BIN = path.join(ROOT, 'vendor/lander/4-reference-binaries/!RunImage.bin');
const GAMECODE = path.join(ROOT, 'vendor/lander/4-reference-binaries/GameCode.bin');
const have = fs.existsSync(BIN) && fs.existsSync(GAMECODE);
const skip = have ? false : 'vendor/lander (the original Lander binary) is not there';

// scripted play: every 25 frames a new mouse direction and button combination
const rnd = (seed, f, k) => { let x = (f * 2654435761 + k * 40503 + seed * 97) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const drive = (m, seed, f) => {
  const seg = Math.floor(f / 25);
  const dx = Math.round((rnd(seed, seg, 1) - 0.5) * 60), dy = Math.round((rnd(seed, seg, 2) - 0.5) * 60);
  const b = [0, 4, 4, 2, 1, 5, 0, 4][Math.floor(rnd(seed, seg, 3) * 8)];
  m.setMouse(Math.max(0, Math.min(1279, m.mx + dx)), Math.max(0, Math.min(1023, m.my + dy)), b);
};
const hash = (u8) => { let h = 2166136261; for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 16777619); return h >>> 0; };
const pressKeysWhenWaiting = (...ms) => setInterval(() => { for (const m of ms) if (m.keyWaiters.length) m.keyPress(32); }, 1);

/** Run the port headless for n frames, calling onFrame(frame, machine, game) at each vsync. */
async function runPort(n, seed, onFrame) {
  const { m, vdu } = createMachine();
  let g, done;
  const finished = new Promise((r) => { done = r; });
  const os = portOs(m, {
    onVsync: (f) => { onFrame?.(f, m, g, vdu); drive(m, seed, f); if (f >= n) done(); },
    vsync: () => (os.frames >= n ? new Promise(() => {}) : new Promise((r) => setImmediate(r))),
  });
  g = createLander(os);
  const t = pressKeysWhenWaiting(m);
  g.run().catch((e) => done(e));
  const e = await finished;
  clearInterval(t);
  if (e) throw e;
  return { m, vdu, g };
}

test('the port runs headless: frames, HUD, flying, firing and the original frame rate', async () => {
  let lit = 0, cycles = 0, frames = 0, scored = false, flew = false;
  await runPort(600, 1, (f, m, game, vdu) => {
    const W = game.workspace;
    if (W[0x124 >> 2] !== 500) scored = true;
    if (W[0x98 >> 2] !== 0x03500000 - 0x00640000) flew = true;
    if (f === 30) { const b = vdu.banks[vdu.displayBank]; for (let i = 0; i < b.length; i++) if (b[i]) lit++; }
    if (f > 3) { cycles += (Math.floor(portFrameCycles(game.stats) / FRAME_CYCLES) + 1) * FRAME_CYCLES; frames++; }
    for (const k in game.stats) game.stats[k] = 0;
  });
  assert.ok(lit > 5000, 'the landscape is drawn: ' + lit);
  const fps = frames / (cycles / 8e6);
  assert.ok(fps > 8 && fps < 25, 'frame rate of an A310: ' + fps.toFixed(1));
  assert.ok(scored, 'the score changed (bullets fired or objects hit)');
  assert.ok(flew, 'the ship left the launch pad');
});

test('the port\'s lookup tables are the original\'s', { skip }, () => {
  const b = fs.readFileSync(GAMECODE);
  const rd = (a) => b.readInt32LE(a - 0x8000);
  for (const [name, t, addr] of [['sin', TABLES.sin, 0xB810], ['arctan', TABLES.atn, 0xC810], ['sqrt', TABLES.sqr, 0xCA10], ['division', TABLES.div, 0xDA10]]) {
    let bad = 0;
    for (let i = 0; i < t.length; i++) if (rd(addr + i * 4) !== t[i]) bad++;
    assert.equal(bad, 0, name + ' table');
  }
});

for (const seed of [1, 2]) {
  test(`port and original draw identical frames (1500 frames of scripted play, seed ${seed})`, { skip, timeout: 120000 }, async () => {
    const N = 1500;
    const bin = new Uint8Array(fs.readFileSync(BIN));
    const A = createMachine();
    const want = [];
    const t = pressKeysWhenWaiting(A.m);
    const orig = new OriginalLander(A.m, bin, { onVsync: (o) => { want.push(A.vdu._linear ? hash(A.vdu._linear) : 0); drive(A.m, seed, o.frames); } });
    const t0 = Date.now();
    await orig.runFrames(N);
    const ms = Date.now() - t0;
    clearInterval(t);
    // the emulator is much faster than an 8MHz ARM2 (4 MIPS at best)
    assert.ok(orig.cpu.instrCount / ms / 1000 > 8, `emulator speed ${(orig.cpu.instrCount / ms / 1000).toFixed(1)} MIPS`);
    let first = -1, differing = 0, lostLives = 0;
    await runPort(N, seed, (f, m, g, vdu) => {
      if (vdu._linear && hash(vdu._linear) !== want[f - 1]) { differing++; if (first < 0) first = f; }
      if (g.workspace[0x130 >> 2] === 0) lostLives++;
    });
    assert.equal(differing, 0, `frames differ from frame ${first}`);
    assert.ok(lostLives > 0, 'the scripted play includes crashes');
  });
}
