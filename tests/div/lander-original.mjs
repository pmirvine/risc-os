// !Lander with the ORIGINAL program on the emulated ARM2, compared with the JavaScript port. Lander is
// (C) D. J. Braben 1987 and is not in this repository: the test is skipped unless a local, git-ignored
// vendor/lander checkout (github.com/markmoxon/lander-source-code-acorn-archimedes) is served.
// Both run to the same frame with no input; the displayed screen banks must be identical.
// Screenshots: lander-original.png, lander-port.png.
// node tests/core/shot.mjs lander-original-end tests/div/lander-original.mjs
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SHOT = process.env.SHOTDIR || 'tests/screens';
const FRAME = 40;
export default async (page) => {
  if (!fs.existsSync(path.join(ROOT, 'vendor/lander/4-reference-binaries/!RunImage.bin'))) {
    console.log('SKIP lander-original: vendor/lander is not there (the original is not part of this repository)');
    return;
  }
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const fail = (m) => console.log('FAIL ' + m);
  const startAndHold = async (args) => {
    await page.evaluate((a) => os.cli.run('Run ADFS::HardDisc4.$.Diversions.!Lander' + a), args);
    await page.waitForFunction(() => os.apps.tasksOf('Lander')[0]?.lander, null, { timeout: 15000 });
    await page.evaluate((n) => { os.apps.tasksOf('Lander')[0].lander.runner.pauseAt = n; }, FRAME);
    await page.waitForFunction((n) => os.apps.tasksOf('Lander')[0].lander.runner.frames >= n, FRAME, { timeout: 20000 });
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const l = os.apps.tasksOf('Lander')[0].lander, v = l.vdu;
      const b = v.banks[v.displayBank];
      let h = 2166136261;
      for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619);
      let lit = 0; for (let i = 0; i < b.length; i++) if (b[i]) lit++;
      const g = l.runner.game;
      return { mode: l.mode, frames: l.runner.frames, hash: h >>> 0, lit, cycles: g.cycles ?? null, instr: g.cpu?.instrCount ?? null };
    });
  };
  const quit = async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const r = os.apps.tasksOf('Lander')[0]?.lander?.runner; if (r) r.pauseAt = Infinity; });
    await page.waitForFunction(() => !os.apps.tasksOf('Lander').length, null, { timeout: 10000 }).catch(() => fail('Escape did not quit'));
    await page.waitForTimeout(300);
  };

  // the original
  const t0 = Date.now();
  const a = await startAndHold('');
  const secs = (Date.now() - t0) / 1000;
  if (a.mode !== 'original') { fail('the original did not run (mode ' + a.mode + ')'); return; }
  console.log(`original: ${a.frames} frames, ${(a.cycles / 8e6).toFixed(2)} s of ARM2 time (${(a.frames / (a.cycles / 8e6)).toFixed(1)} frames/s), ` +
    `${a.instr} instructions (${(a.instr / (a.cycles / 8e6) / 1e6).toFixed(2)} MIPS emulated) in ${secs.toFixed(1)} s`);
  await page.screenshot({ path: `${SHOT}/lander-original.png` });
  await quit();

  // the port
  const b = await startAndHold(' -port');
  if (b.mode !== 'port') fail('expected the port, got ' + b.mode);
  await page.screenshot({ path: `${SHOT}/lander-port.png` });
  await quit();

  // raw emulator speed, unthrottled (headless, in the page)
  const raw = await page.evaluate(async () => {
    const h = await import('/src/apps/Lander/host.js');
    const bin = new Uint8Array(await (await fetch('/vendor/lander/4-reference-binaries/!RunImage.bin')).arrayBuffer());
    const { m } = h.createMachine();
    const g = new h.OriginalLander(m, bin);
    await g.runFrames(5);
    const i0 = g.cpu.instrCount, c0 = g.cycles, t = performance.now();
    await g.runFrames(200);
    const ms = performance.now() - t;
    return { mips: (g.cpu.instrCount - i0) / ms / 1000, x: ((g.cycles - c0) / 8e6) / (ms / 1000) };
  });
  console.log(`emulator: ${raw.mips.toFixed(1)} MIPS unthrottled, ${raw.x.toFixed(1)}x the speed of an 8MHz ARM2`);
  if (raw.mips < 8) fail('the ARM emulator is slower than an ARM2: ' + raw.mips.toFixed(1) + ' MIPS');
  console.log(`frame ${FRAME}: original ${a.hash.toString(16)} (${a.lit} lit), port ${b.hash.toString(16)} (${b.lit} lit)`);
  if (a.lit < 5000) fail('the original drew nothing');
  if (a.hash !== b.hash) fail('the port and the original differ at frame ' + FRAME);
  if (errs.length) fail('page errors: ' + errs.join('; '));
  console.log('lander original ok');
};
