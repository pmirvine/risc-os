// The Acorn mouse mapping (default): right = Adjust, middle and Ctrl+left = Menu, Shift left alone.
// Adjust on a close icon opens the parent viewer; Adjust double-click opens a directory and closes its
// parent; Shift-double-click on an application opens it as a directory without closing the viewer;
// a directory with an open viewer is shown with the open-directory sprite.
// Run with the Acorn mapping: the suite passes BUTTONS=acorn for this script (see index.mjs).
const P = (ok, what, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${extra}`);
const viewers = (page) => page.evaluate(() => [...os.filer.viewers.keys()].sort().join('|'));
async function itemPos(page, dir, leaf) {
  return page.evaluate(({ dir, leaf }) => {
    const v = os.filer.viewers.get(os.vfs.canonical(dir).toLowerCase());
    const i = v.items.findIndex((it) => it.name.toLowerCase() === leaf.toLowerCase());
    const r = v.hotRect(i);
    return v.win.workToScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  }, { dir, leaf });
}
const sprite = (page, dir, leaf) => page.evaluate(({ dir, leaf }) => {
  const v = os.filer.viewers.get(os.vfs.canonical(dir).toLowerCase());
  const i = v.items.findIndex((it) => it.name.toLowerCase() === leaf.toLowerCase());
  return v.icons[i].validation ?? v.icons[i].spec?.validation ?? v.icons[i].el.innerHTML.match(/directoryo?|small_diro?/)?.[0];
}, { dir, leaf });
export default async (page) => {
  P(await page.evaluate(() => os.input.config.rightIsAdjust), 'right button is Adjust by default');
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$', { x: 60, y: 80, w: 420, h: 260 }));
  await page.waitForTimeout(500);
  // right double-click (Adjust) on Apps: opens it and closes $
  let p = await itemPos(page, '$', 'Apps');
  await page.mouse.dblclick(p.x, p.y, { button: 'right' }); await page.waitForTimeout(600);
  P((await viewers(page)) === 'adfs::harddisc4.$.apps', 'Adjust double-click opens the directory and closes its parent', await viewers(page));
  // Adjust on the close icon: closes Apps and opens $
  const c = await page.evaluate(() => { const v = os.filer.viewers.get('adfs::harddisc4.$.apps'); const b = v.win.el.querySelector('[data-part=close]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(c.x, c.y, { button: 'right' }); await page.waitForTimeout(600);
  P((await viewers(page)) === 'adfs::harddisc4.$', 'Adjust on the close icon opens the parent', await viewers(page));
  // Select double-click on Apps: opens it, $ stays; Apps shown as an open directory in $
  p = await itemPos(page, '$', 'Apps');
  await page.mouse.dblclick(p.x, p.y); await page.waitForTimeout(600);
  P((await viewers(page)) === 'adfs::harddisc4.$|adfs::harddisc4.$.apps', 'Select double-click keeps the parent', await viewers(page));
  let s = await sprite(page, '$', 'Apps');
  P(/directoryo|small_diro/.test(s), 'open directory shown with the open sprite', s);
  // close Apps with Select: sprite back to closed
  const c2 = await page.evaluate(() => { const v = os.filer.viewers.get('adfs::harddisc4.$.apps'); const b = v.win.el.querySelector('[data-part=close]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(500);
  s = await sprite(page, '$', 'Apps');
  P(!/directoryo|small_diro/.test(s) && /directory|small_dir/.test(s), 'closed directory shown with the closed sprite', s);
  // Shift-double-click (Select) on an application opens it as a directory; the viewer stays open
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Apps', { x: 500, y: 80, w: 420, h: 260 }));
  await page.waitForTimeout(500);
  p = await itemPos(page, '$.Apps', '!SciCalc');
  await page.keyboard.down('Shift'); await page.mouse.dblclick(p.x, p.y); await page.keyboard.up('Shift');
  await page.waitForTimeout(600);
  const vs = await viewers(page);
  P(vs.includes('adfs::harddisc4.$.apps!') === false && vs.includes('adfs::harddisc4.$.apps.!scicalc') && vs.includes('adfs::harddisc4.$.apps|'), 'Shift-double-click opens an application as a directory', vs);
  // Ctrl+left and middle give Menu
  p = await itemPos(page, '$', 'Apps');
  await page.keyboard.down('Control'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Control'); await page.waitForTimeout(300);
  P(await page.evaluate(() => os.wimp.menus.isOpen), 'Ctrl+click opens the menu');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(200);
  await page.mouse.click(p.x, p.y, { button: 'middle' }); await page.waitForTimeout(300);
  P(await page.evaluate(() => os.wimp.menus.isOpen), 'middle click opens the menu');
};
