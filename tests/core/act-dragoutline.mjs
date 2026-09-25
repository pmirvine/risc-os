// *Configure WimpFlags bits 0-3 (!Configure > Windows > Instant dragging): when clear, moving,
// resizing and dragging a scroll bar show a dashed outline and act only when the button is released.
const P = (ok, what, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${extra}`);
const part = (page, name) => page.evaluate((n) => { const v = os.filer.viewers.get('adfs::harddisc4.$.apps'); const b = v.win.el.querySelector(`[data-part=${n}]`).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, name);
const geom = (page) => page.evaluate(() => { const w = os.filer.viewers.get('adfs::harddisc4.$.apps').win; return { x: w.x, y: w.y, w: w.w, h: w.h, sy: w.scrollY }; });
const box = (page) => page.evaluate(() => { const b = document.querySelector('.drag-box'); return b ? b.getBoundingClientRect().toJSON() : null; });
async function dragPart(page, name, dx, dy) {
  const p = await part(page, name);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2, { steps: 4 }); await page.mouse.move(p.x + dx, p.y + dy, { steps: 4 });
  await page.waitForTimeout(100);
  const during = { g: await geom(page), box: await box(page) };
  await page.mouse.up(); await page.waitForTimeout(200);
  return { during, after: await geom(page), boxAfter: await box(page) };
}
export default async (page) => {
  await page.evaluate(() => { os.config.set('WimpFlags', 0b01100000); os.config.apply(); });
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Apps', { x: 200, y: 150, w: 300, h: 120 }));
  await page.waitForTimeout(500);
  let g0 = await geom(page);
  let r = await dragPart(page, 'title', 80, 60);
  P(r.during.box && r.during.g.x === g0.x && r.during.g.y === g0.y, 'move: dashed outline, window stays put while dragging', JSON.stringify(r.during.g));
  P(!r.boxAfter && Math.abs(r.after.x - g0.x - 80) <= 2 && Math.abs(r.after.y - g0.y - 60) <= 2, 'move: window moves on release', JSON.stringify(r.after));
  g0 = r.after;
  r = await dragPart(page, 'size', 60, 40);
  P(r.during.box && r.during.g.w === g0.w && r.during.g.h === g0.h, 'resize: dashed outline, size unchanged while dragging');
  P(Math.abs(r.after.w - g0.w - 60) <= 2 && Math.abs(r.after.h - g0.h - 40) <= 2, 'resize: window resized on release', JSON.stringify(r.after));
  await page.evaluate(() => { const w = os.filer.viewers.get('adfs::harddisc4.$.apps').win; w.requestOpen({ w: 120, h: 150, behind: 'top' }); });
  await page.waitForTimeout(200);
  g0 = await geom(page);
  r = await dragPart(page, 'vbar', 0, 30);
  P(r.during.box && r.during.g.sy === g0.sy, 'scroll bar: dashed outline, no scrolling while dragging');
  P(r.after.sy > g0.sy, 'scroll bar: scrolls on release', `${g0.sy} -> ${r.after.sy}`);
  // instant again: the window follows the pointer
  await page.evaluate(() => { os.config.set('WimpFlags', 0b01101111); os.config.apply(); });
  g0 = await geom(page);
  r = await dragPart(page, 'title', 40, 0);
  P(!r.during.box && Math.abs(r.during.g.x - g0.x - 40) <= 2, 'instant move: window follows the pointer, no outline');
};
