// Edit follows a browser resize (Message_ModeChange): boot at 1024x700, open a text file, grow the
// browser to 1600x900, drag the size icon wide - the window must get wider than the old screen.
// Then shrink the browser to 800x600: the window must stay reachable (title bar on screen).
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { filerOpen, check } from './ui.mjs';

const { browser, page, logs } = await launch({ width: 1024, height: 700 });
let ok = true;
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => os.vfs.writeFile('RAM::RamDisc0.$.Wide', 'A line of text\n'.repeat(20) + 'x'.repeat(300) + '\n', { filetype: 0xFFF }));
  await filerOpen(page, 'RAM::RamDisc0.$', 'Wide');
  const editWin = () => page.evaluate(() => {
    const w = wimp.stack.filter((q) => q.isOpen && q.task?.name === 'Edit').pop();
    return w ? { x: w.x, y: w.y, w: w.w, h: w.h, ext: w.extent.x1 - w.extent.x0, f: w._frame ?? { rightW: 20, botH: 20 }, sw: wimp.width, sh: wimp.height } : null;
  });
  let w = await editWin();
  ok &= check('Edit window opened', !!w, JSON.stringify(w));
  ok &= check('extent = old screen width', w && w.ext <= 1024, `ext ${w?.ext}`);

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(500);
  w = await editWin();
  ok &= check('screen grew', w.sw === 1600, `screen ${w.sw}x${w.sh}`);
  ok &= check('extent follows the new screen width', w.ext > 1024, `ext ${w.ext}`);

  // drag the size icon (bottom-right corner) far to the right
  const sx = w.x + w.w + w.f.rightW / 2, sy = w.y + w.h + w.f.botH / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 300, sy + 10, { steps: 5 });
  await page.mouse.move(1590, sy + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  w = await editWin();
  ok &= check('window dragged wider than 1024', w.w > 1024, `w ${w.w}`);
  await page.screenshot({ path: path.join(SHOTS, 'edit-resize-wide.png') });

  // shrink: the window is re-opened within the new screen and its title bar stays reachable
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(500);
  w = await editWin();
  ok &= check('extent follows a smaller screen', w.ext <= 800, `ext ${w.ext}`);
  ok &= check('window no wider than the extent', w.w <= w.ext, `w ${w.w} ext ${w.ext}`);
  ok &= check('title bar reachable', w.x < 800 - 40 && w.x + w.w > 40 && w.y >= 20 && w.y < 600, JSON.stringify(w));
  await page.screenshot({ path: path.join(SHOTS, 'edit-resize-small.png') });
} catch (e) {
  ok = false;
  console.log('FAIL exception', e.message);
}
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) { ok = false; console.log(errs.join('\n')); }
await browser.close();
process.exit(ok ? 0 : 1);
