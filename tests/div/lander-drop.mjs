// !Lander takes the original program dragged from a RISC OS Filer window (DataLoad), as it does a host file.
// Dragging a file onto the !Lander icon in the Diversions viewer starts it with that file; a DataLoad sent to
// the running game (Message_DataLoad) restarts it with the file. A file that isn't Lander is refused and the
// game keeps running. The original (C) D. J. Braben is not in this repository: skipped without vendor/lander.
// node tests/core/shot.mjs lander-drop tests/div/lander-drop.mjs
import fs from 'fs';
import path from 'path';
import { filerItem, check } from '../edit/ui.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

export default async (page) => {
  if (!fs.existsSync(path.join(ROOT, 'vendor/lander/4-reference-binaries/!RunImage.bin'))) {
    console.log('SKIP lander-drop: vendor/lander is not there (the original is not part of this repository)');
    return;
  }
  // forget any copy kept from an earlier run, and put the binary on the RAM disc
  await page.evaluate(async () => {
    (await import('/src/apps/Lander/store.js')).forget();
    const b = new Uint8Array(await (await fetch('/vendor/lander/4-reference-binaries/!RunImage.bin')).arrayBuffer());
    os.vfs.writeFile('RAM::RamDisc0.$.Lander', b, { filetype: 0xFF8 });
    os.vfs.writeFile('RAM::RamDisc0.$.NotLander', 'hello', { filetype: 0xFFF });
  });
  const lander = await filerItem(page, 'ADFS::HardDisc4.$.Diversions', '!Lander', { x: 40, y: 60, w: 520, h: 300 });
  const src = await filerItem(page, 'RAM::RamDisc0.$', 'Lander', { x: 580, y: 60, w: 400, h: 240 });
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(src.x + 8, src.y + 8, { steps: 3 });
  await page.mouse.move(lander.x, lander.y, { steps: 12 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForFunction(() => os.apps.tasksOf('Lander')[0]?.lander, null, { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => ({
    mode: os.apps.tasksOf('Lander')[0]?.lander?.mode ?? null,
    copied: os.vfs.exists('ADFS::HardDisc4.$.Diversions.Lander'),
  }));
  check('dropping the binary on !Lander in a Filer viewer runs the original', r.mode === 'original', String(r.mode));
  check('the file was not copied into Diversions', !r.copied);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(process.env.SHOTDIR || 'tests/screens', 'lander-drop.png') });

  // DataLoad to the running game: a non-Lander file is refused, the binary restarts the game
  const r2 = await page.evaluate(async () => {
    const t = os.apps.tasksOf('Lander')[0];
    const m0 = t.lander.machine;
    const f = (p) => ({ path: p, filetype: os.vfs.stat(p).filetype });
    const bad = os.wimp.sendMessage('DataLoad', { files: [f('RAM::RamDisc0.$.NotLander')] }, { to: t });
    await new Promise((res) => setTimeout(res, 300));
    const kept = t.lander.machine === m0;
    const good = os.wimp.sendMessage('DataLoad', { files: [f('RAM::RamDisc0.$.Lander')] }, { to: t });
    await new Promise((res) => setTimeout(res, 500));
    return { bad: !!bad, kept, good: !!good, restarted: t.lander.machine !== m0, mode: t.lander.mode };
  });
  check('a DataLoad of another file leaves the game running', r2.bad && r2.kept, JSON.stringify(r2));
  check('a DataLoad of the binary restarts the original', r2.good && r2.restarted && r2.mode === 'original', JSON.stringify(r2));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !os.apps.tasksOf('Lander').length, null, { timeout: 10000 }).catch(() => console.log('FAIL Escape did not quit'));
  await page.evaluate(async () => (await import('/src/apps/Lander/store.js')).forget());
};
