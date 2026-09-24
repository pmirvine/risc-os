// Shared UI helpers for the Edit / Paint / Help Playwright scripts: real mouse operations on
// Filer windows, menus and the icon bar (no programmatic shortcuts where a user would click).
export const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
export const hoverArrow = async (page, level, idx) => {
  const b = await menuItem(page, level, idx);
  await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
  await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
  await page.waitForTimeout(250);
};
export const clickItem = async (page, level, idx, button = 'left') => {
  const b = await menuItem(page, level, idx);
  await page.mouse.click(b.x + 30, b.y + b.height / 2, { button });
  await page.waitForTimeout(200);
};
/** Menu item texts at a level (for assertions). */
export const menuTexts = (page, level) => page.locator('.menu').nth(level).locator('.mitem').allInnerTexts();

/** Open a Filer viewer on dir and return the screen centre of the item named leaf. */
export async function filerItem(page, dir, leaf, pos = { x: 560, y: 60, w: 440, h: 260 }) {
  await page.evaluate(({ dir, pos }) => os.filer.openDir(dir, pos), { dir, pos });
  await page.waitForTimeout(400);
  const p = await page.evaluate(({ dir, leaf }) => {
    const v = [...os.filer.viewers.values()].find((q) => q.path.toLowerCase() === os.vfs.canonical(dir).toLowerCase());
    v.win.open({ behind: 'top' });
    const i = v.items.findIndex((it) => it.name.toLowerCase() === leaf.toLowerCase());
    if (i < 0) return null;
    const r = v.hotRect(i);
    // scroll it into view
    if (r.y1 > v.win.scrollY + v.win.h || r.y0 < v.win.scrollY) v.win.open({ scrollY: Math.max(0, r.y0 - 8), behind: 'top' });
    return v.win.workToScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  }, { dir, leaf });
  if (!p) throw new Error(`${leaf} not in ${dir}`);
  return p;
}

/** Double-click a file in a Filer window (Shift = load as text into Edit). */
export async function filerOpen(page, dir, leaf, { shift = false, wait = 1200 } = {}) {
  const p = await filerItem(page, dir, leaf);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.dblclick(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(wait);
  return p;
}

/** Screen position of an app's icon bar icon (by task name or sprite name). */
export async function iconbarPos(page, key) {
  return page.evaluate((key) => {
    const it = wimp.iconbar.items.find((i) => i.task?.name === key || i.sprite === key);
    return it ? { x: wimp.iconbar.iconScreenX(it), y: wimp.height - 30 } : null;
  }, key);
}

/** Type a path into the open save box (menu dialogue or static) and press Return. */
export async function saveBoxTo(page, path) {
  const box = await page.evaluate(() => {
    const w = [...wimp.windows].reverse().find((q) => q.isOpen && q.icons?.some((i) => i?.writable) && /save/i.test(q.title ?? ''));
    if (!w) return null;
    const ic = w.icons.find((i) => i?.writable);
    const b = ic.bbox;
    return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  });
  if (!box) throw new Error('no save box');
  await page.mouse.click(box.x, box.y);
  await page.keyboard.press('Control+u');
  await page.keyboard.type(path);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}

/** Collect page errors so scripts can report them. */
export function watchErrors(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  return errs;
}

export function check(label, ok, extra = '') { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`); return ok; }
