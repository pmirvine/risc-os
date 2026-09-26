// Resizing a window into the edge of the screen, as RISC OS 3.71's Wimp does it (Wimp04 size-drag limits,
// Wimp02 int_open_window): with windows allowed off screen (WimpFlags bit 5, the default) the pointer may go past
// the bottom / right and the window goes on growing, pushed up / left, until it's as big as the screen; with
// bits 5 and 6 clear it stops at the edge; a "no checks" window (flag bit 6) just runs off; moving by the title
// bar is never pushed back; a window that was closed opens wholly on screen; toggle-size and a smaller extent too.
const P = (ok, what, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${extra}`);
const DIR = 'adfs::harddisc4.$.apps';
const part = (page, name) => page.evaluate(([d, n]) => { const v = os.filer.viewers.get(d); const b = v.win.el.querySelector(`[data-part=${n}]`).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, [DIR, name]);
const geom = (page) => page.evaluate((d) => { const w = os.filer.viewers.get(d).win; const f = w._frame; return { x: w.x, y: w.y, w: w.w, h: w.h, bottom: w.y + w.h + f.botH, right: w.x + w.w + f.rightW, top: w.y - f.topH, left: w.x - f.left, W: os.wimp.width, H: os.wimp.height }; }, DIR);
async function drag(page, name, dx, dy) {
  const p = await part(page, name);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(p.x + dx * i / 8, p.y + dy * i / 8);
  await page.waitForTimeout(100);
  const during = await geom(page);
  await page.mouse.up(); await page.waitForTimeout(200);
  return { during, after: await geom(page) };
}
const place = (page, s) => page.evaluate(([d, s]) => { const w = os.filer.viewers.get(d).win; w.setExtent({ x0: 0, y0: 0, x1: 4000, y1: 4000 }); w.open({ ...s, behind: 'top' }); }, [DIR, s]);
const flags = (page, f) => page.evaluate((f) => { os.config.set('WimpFlags', f); os.config.apply(); }, f);

export default async (page) => {
  await flags(page, 0b01101111);
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Apps', { x: 200, y: 150, w: 300, h: 200 }));
  await page.waitForTimeout(500);
  const { H, W } = await geom(page);

  // down past the bottom: the window grows upwards
  await place(page, { x: 200, y: H - 260, w: 300, h: 200 });
  let g0 = await geom(page);
  let r = await drag(page, 'size', 0, 160);
  P(r.during.bottom === H && r.during.h > g0.h + 100 && r.during.y < g0.y - 100, 'instant resize past the bottom: the top rises as the window grows', JSON.stringify([g0, r.during]));
  P(r.after.bottom === H && r.after.h === r.during.h, 'and it stays so', JSON.stringify(r.after));
  // on and on: stops as tall as the screen
  r = await drag(page, 'size', 0, H);
  P(r.after.top === 0 && r.after.bottom === H, 'it stops when the top reaches the top of the screen', JSON.stringify(r.after));

  // right past the edge: the left edge moves left
  await place(page, { x: W - 360, y: 200, w: 300, h: 200 });
  g0 = await geom(page);
  r = await drag(page, 'size', 200, 0);
  P(r.after.right === W && r.after.w > g0.w + 150 && r.after.x < g0.x - 150, 'resize past the right: the left edge moves left', JSON.stringify([g0, r.after]));

  // outline resize: the window moves up on release
  await flags(page, 0b01100000);
  await place(page, { x: 200, y: H - 260, w: 300, h: 200 });
  g0 = await geom(page);
  r = await drag(page, 'size', 0, 160);
  P(r.during.y === g0.y && r.during.h === g0.h, 'outline resize: nothing moves while dragging');
  P(r.after.bottom === H && r.after.y < g0.y - 100, 'outline resize: the window jumps up to fit on release', JSON.stringify(r.after));

  // WimpFlags bits 5 and 6 clear: the window stops at the edge and doesn't move
  await flags(page, 0b00001111);
  await place(page, { x: 200, y: H - 260, w: 300, h: 200 });
  g0 = await geom(page);
  r = await drag(page, 'size', 0, 160);
  P(r.after.bottom === H && r.after.y === g0.y && r.after.h === g0.h + (H - g0.bottom), 'bits 5 and 6 clear: the size stops at the screen edge, the top stays', JSON.stringify([g0, r.after]));
  await flags(page, 0b01101111);

  // moving by the title bar is never pushed back
  await place(page, { x: 200, y: 200, w: 300, h: 200 });
  r = await drag(page, 'title', 0, H - 300);
  P(r.after.bottom > H, 'moving a window off the bottom by its title bar is allowed', JSON.stringify(r.after));

  // toggle-size puts it back on screen; a closed window opens wholly on screen
  await page.evaluate((d) => { const w = os.filer.viewers.get(d).win; w.toggleSize(); }, DIR);
  await page.waitForTimeout(100);
  r = await geom(page);
  P(r.bottom <= H && r.right <= W && r.top >= 0, 'toggle-size keeps the window on screen', JSON.stringify(r));
  await page.evaluate((d) => { const w = os.filer.viewers.get(d).win; w.close(); w.open({ x: os.wimp.width - 100, y: os.wimp.height - 100, w: 300, h: 200 }); }, DIR);
  r = await geom(page);
  P(r.bottom === H && r.right === W, 'a closed window opens wholly on screen', JSON.stringify(r));
  // an open window may still be put partly off screen by its program
  await page.evaluate((d) => { const w = os.filer.viewers.get(d).win; w.open({ y: os.wimp.height - 100 }); }, DIR);
  r = await geom(page);
  P(r.bottom > H, 'an open window may be put partly off the bottom', JSON.stringify(r));
  // never bigger than the screen
  await page.evaluate((d) => { const w = os.filer.viewers.get(d).win; w.open({ x: 10, y: 30, w: 5000, h: 5000 }); }, DIR);
  r = await geom(page);
  P(r.w <= W && r.h <= H && r.bottom <= H, 'a window is never bigger than the screen', JSON.stringify(r));

  // a "no checks" window (flag bit 6) runs off the bottom
  const nc = await page.evaluate(() => {
    const t = os.wimp.createTask('NoChecks');
    const w = t.createWindow({ title: 'No checks', x: 100, y: os.wimp.height - 150, w: 200, h: 100, extent: { w: 2000, h: 2000 }, flags: { title: true, vscroll: true, size: true, moveable: true, noBounds: true } });
    w.open(); w._onScreenOnce = true; w.open({ h: 400 });
    const r = { bottom: w.y + w.h, H: os.wimp.height };
    t.quit();
    return r;
  });
  P(nc.bottom > nc.H, 'a window with "no checks" (flag bit 6) isn\'t pushed', JSON.stringify(nc));
};
