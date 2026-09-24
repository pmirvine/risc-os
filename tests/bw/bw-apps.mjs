// Run original BASIC Wimp applications from the seed disc through the bridge (each from a copy on
// the RAM disc, so the native JS versions don't claim them), click their icon bar icon and screenshot.
//   node tests/bw/bw-apps.mjs [App ...]     e.g. Diversions.!Clock Apps.!Maestro
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const all = ['Apps.!SciCalc', 'Diversions.!MemNow', 'Diversions.!Clock', 'Diversions.!Flasher', 'Diversions.!Blocks', 'Diversions.!Patience',
  'Diversions.!Puzzle', 'Apps.!Maestro', 'Apps.!CloseUp', 'Diversions.!Player', 'Utilities.!HForm', 'Printing.!PrintEdit', 'Utilities.!Verify', 'Utilities.!SaveCMOS', 'Images.!SlideShow', 'Examples.!Doodle'];
const list = process.argv.slice(2).length ? process.argv.slice(2) : all;
const results = [];
for (const app of list) {
  const { browser, page, logs } = await launch({ width: 1024, height: 768 });
  const leaf = app.split('.').pop();
  const name = leaf.replace('!', '');
  try {
    await page.goto(BASE_URL + '?fast=1');
    await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
    await page.evaluate(async ([src, leaf]) => {
      const { vfs } = window.os;
      await vfs.copy('ADFS::HardDisc4.$.' + src, 'RAM::RamDisc0.$.' + leaf);
      // !Maestro's !Run runs EnsureRMA, an ARM binary the seed disc doesn't carry: stand in an empty Obey file
      if (leaf === '!Maestro') vfs.writeFile('RAM::RamDisc0.$.!Maestro.EnsureRMA', '| EnsureRMA stand-in\n', { filetype: 0xFEB });
      window.__errs = [];
      window.os.cli.run('Run RAM::RamDisc0.$.' + leaf).catch((e) => window.__errs.push('run: ' + e.message));
    }, [app, leaf]);
    await page.waitForTimeout(2500);
    const box0 = await page.evaluate(() => [...document.querySelectorAll('.win')].filter((e) => e.style.display !== 'none' && /Message from|Error/.test(e.querySelector('.win-title .ttext')?.textContent ?? '')).map((e) => e.innerText.replace(/\s+/g, ' ')).join(' / '));
    const st = await page.evaluate(() => {
      const p = [...(window.bwProcesses ?? [])][0];
      if (p) { window.__proc = p; const I = p.machine.interp; const he = I.handleError.bind(I); I.handleError = (e) => { window.__errs.push(String(e.message ?? e) + ' (line ' + (I.curLineNum?.() ?? '?') + ')'); return he(e); }; }
      const t = p?.bridge?.task;
      return { proc: !!p, task: t?.name ?? null, ended: p?.ended ?? null, late: p?.lateOutput ?? '', exit: p?.exitError?.message ?? null, screen: !!document.querySelector('.fullscreen-program') };
    });
    // click its icon bar icon (if any)
    const ib = await page.evaluate(() => { const it = window.wimp.iconbar.items.find((i) => i.task?.basicProcess); if (!it) return null; const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (ib) { await page.mouse.click(ib.x, ib.y); await page.waitForTimeout(1500); }
    await page.screenshot({ path: path.join(SHOTS, `bw-app-${name}.png`) });
    const after = await page.evaluate(() => ({ wins: [...window.wimp.windows].filter((w) => w.task?.basicProcess && w.isOpen).map((w) => w.title), errs: window.__errs, exit: window.__proc?.exitError?.message ?? null, late: window.__proc?.lateOutput ?? '', ended: window.__proc?.ended ?? null }));
    results.push({ app, box0, ...st, iconbar: !!ib, ...after, page: logs.filter((l) => /PAGEERROR|error/i.test(l)).slice(0, 3) });
  } catch (e) {
    results.push({ app, crash: e.message });
  }
  await browser.close();
}
for (const r of results) console.log(JSON.stringify(r));
