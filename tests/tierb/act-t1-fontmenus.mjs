// A font converted by !T1ToFont reaches the font menus. Converts the sample Type 1 font on the seed disc
// ($.Utilities.Type1Fonts.cmr10/pfb + cmr10/afm, SIL OFL) into !Fonts.CompModern.Medium, then checks the core
// font registry (os.fontreg) finds it on Font$Path, builds a web font from the Outlines / IntMetric files that
// renders differently from the fallback, and that the Chars, Configure, Draw and Edit font menus list it; Chars
// then draws its character set in the new font. Screenshot tierB-t1-fontmenu.png.
import path from 'path';
import { iconbarPos, check } from '../edit/ui.mjs';

const SHOTS = process.env.SHOTS || 'tests/screens';
const T = (page, fn, arg) => page.evaluate(fn, arg);
const DIR = 'ADFS::HardDisc4.$.Utilities.Type1Fonts';

export default async (page) => {
  const seeded = await T(page, (d) => ['cmr10/pfb', 'cmr10/afm', 'OFL', 'ReadMe'].map((f) => os.vfs.exists(`${d}.${f}`)), DIR);
  check('sample Type 1 font, licence and ReadMe on the seed disc', seeded.every(Boolean), JSON.stringify(seeded));

  // convert with !T1ToFont (the box filled as a Filer drag would)
  await T(page, () => os.apps.start('T1ToFont'));
  await page.waitForFunction(() => os.apps.tasksOf('T1ToFont')[0]?.t1, null, { timeout: 10000 });
  const ib = await iconbarPos(page, '!t1tofont');
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(400);
  await T(page, async (d) => {
    const t = os.apps.tasksOf('T1ToFont')[0];
    await t.t1.importFile(`${d}.cmr10/pfb`, 0xFFD, 2);
    await t.t1.importFile(`${d}.cmr10/afm`, 0xFFF, 4);
    t.t1.window.icons[10].setText('CompModern.Medium');
    t.lastConversion = null;
    t.t1.convert();
  }, DIR);
  await page.waitForFunction(() => os.apps.tasksOf('T1ToFont')[0].lastConversion, null, { timeout: 20000 }).catch(() => {});
  for (let i = 0; i < 3 && await T(page, () => /Message from/.test(document.body.innerText)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
  const conv = await T(page, () => os.apps.tasksOf('T1ToFont')[0].lastConversion);
  check('converted into !Fonts.CompModern.Medium', !!conv && conv.files.some((f) => /CompModern\.Medium\.Outlines0?$/.test(f)), JSON.stringify(conv));
  await T(page, () => os.apps.tasksOf('T1ToFont')[0].quit());

  // the registry finds and converts it
  const reg = await T(page, async () => {
    const r = await os.fontreg.ready();
    const info = r.info('CompModern.Medium');
    const loaded = await r.load('CompModern.Medium');
    const c = document.createElement('canvas').getContext('2d');
    const w = (font) => { c.font = font; return c.measureText('iiiiiiiiiiAAAAA').width; };
    const css = r.cssFor('CompModern.Medium', 40);
    return {
      disc: !!info?.disc, family: info?.family, built: !!loaded?.face, css,
      check: document.fonts.check(css), width: w(css), fallback: w(`400 40px ${info?.fallback}`),
      core: os.fonts.cssFor('CompModern.Medium', 12), builtin: r.info('Trinity.Medium')?.disc === undefined,
    };
  });
  check('registry lists the disc font', reg.disc && reg.family === 'RISCOS CompModern.Medium', JSON.stringify(reg));
  check('web font built from the Outlines / IntMetrics', reg.built && reg.check, JSON.stringify(reg));
  check('text in the font differs from the fallback', Math.abs(reg.width - reg.fallback) > 2, `${reg.width} vs ${reg.fallback}`);
  check('fonts.cssFor uses it', /RISCOS CompModern\.Medium/.test(reg.core), reg.core);
  check('built-in fonts still come from fonts.json', reg.builtin);

  // Draw, Edit and Configure menus
  const menus = await T(page, async () => {
    await os.apps.start('Draw');
    for (let i = 0; i < 50 && !globalThis.__draw; i++) await new Promise((r) => setTimeout(r, 100));
    const draw = globalThis.__draw?.DF.availableFonts() ?? [];
    const { EditApp } = await import('/src/apps/Edit/editor.js');
    const m = EditApp.prototype.fontMenu.call({ fontsMsgs: { lookup: (s) => s }, help: () => '' }, () => null, () => {});
    const edit = m.items.map((i) => i.text);
    const editSub = m.items.find((i) => i.text === 'CompModern')?.submenu?.items?.map((i) => i.text) ?? [];
    os.apps.tasksOf('Draw').forEach((t) => t.quit());
    return { draw: draw.includes('CompModern.Medium'), edit: edit.includes('CompModern') && edit.includes('Trinity'), editSub };
  });
  check('Draw font list has it', menus.draw);
  check('Edit font menu has it', menus.edit && menus.editSub.includes('Medium'), JSON.stringify(menus));

  // Chars: Menu over the window gives the font list; choose CompModern ▸ Medium
  await T(page, () => os.apps.start('Chars'));
  await page.waitForFunction(() => [...wimp.windows].some((w) => w.isOpen && w.task?.name === 'Chars'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const cw = await T(page, () => { const w = [...wimp.windows].find((q) => q.isOpen && q.task?.name === 'Chars'); w.open({ x: 100, y: 120, behind: 'top' }); return { x: w.x + 60, y: w.y + 40 }; });
  await page.waitForTimeout(200);
  await page.mouse.click(cw.x, cw.y, { button: 'middle' });
  await page.waitForTimeout(400);
  const items = await page.locator('.menu').last().locator('.mitem').allInnerTexts();
  const idx = items.findIndex((t) => /CompModern/.test(t));
  check('Chars font menu has it', idx >= 0, items.join('|'));
  if (idx >= 0) {
    const box = await page.locator('.menu').last().locator('.mitem').nth(idx).boundingBox();
    await page.mouse.click(box.x + 10, box.y + box.height / 2);     // the family item picks its first style
    await page.waitForTimeout(800);
  }
  const charsFont = await T(page, () => document.fonts.check('20px "RISCOS CompModern.Medium"'));
  check('Chars can draw in it', charsFont);
  await page.screenshot({ path: path.join(SHOTS, 'tierB-t1-fontmenu.png') });

  // Configure ▸ Fonts: the desktop font menu
  const conf = await T(page, async () => (await os.fontreg.ready()).names().filter((n) => /^[A-Za-z][\w-]*\.[\w.-]+$/.test(n) && !/^System\./.test(n)).includes('CompModern.Medium'));
  check('Configure desktop font menu has it', conf);
};
