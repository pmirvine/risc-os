// Chars: open, type into the F12-free writable of a Filer "New directory"-like target: we use the Example tools box.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Chars'));
  await page.waitForTimeout(800);
  const w = await page.evaluate(() => { const t = os.apps.tasksOf('Chars')[0]; const x = [...t.windows][0]; return { x: x.x, y: x.y, w: x.w, h: x.h }; });
  // a writable target: a window with a writable icon owned by a scratch task
  await page.evaluate(() => {
    const t = os.wimp.createTask('Target');
    const win = t.createWindow({ title: 'Target', x: 500, y: 500, w: 300, h: 60, flags: { title: true, moveable: true }, icons: [{ x: 10, y: 14, w: 280, h: 32, text: '', border: true, filled: true, bg: 0, button: 'writable', validation: 'R7', maxLen: 40 }] });
    win.open({ behind: 'top' }); os.wimp.setCaret(win, win.icons[0]); window.__tgt = win;
  });
  const cell = (ch) => ({ x: w.x + 8 + (ch % 32) * 12 + 4, y: w.y + 8 + Math.floor(ch / 32) * 22 + 8 });
  for (const ch of [0x52, 0x49, 0x53, 0x43, 0x20, 0x4f, 0x53, 0xa9]) { const p = cell(ch); await page.mouse.click(p.x, p.y); }
  const txt = await page.evaluate(() => window.__tgt.icons[0].text);
  console.log('typed:', JSON.stringify(txt));
  if (process.env.FONT) {
    await page.mouse.click(w.x + 200, w.y + 100, { button: 'right' });
    await page.waitForTimeout(300);
    const it = page.locator('.menu .mitem', { hasText: 'Trinity' }).first();
    const b = await it.boundingBox();
    await page.mouse.move(b.x + b.width - 5, b.y + b.height / 2, { steps: 3 });
    await page.waitForTimeout(400);
  }
};
export async function pickFont(page) {
  const m = page.locator('.menu .mitem', { hasText: 'Medium' }).first();
  await m.click();
  await page.waitForTimeout(600);
}
