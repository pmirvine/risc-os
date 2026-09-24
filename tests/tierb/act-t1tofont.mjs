// !T1ToFont: launch from the Filer (HardDisc4.$.Utilities), drag a generated Type 1 font (PFB, typed Data)
// from the RAM disc into the converter box, check the pop-up menus and an error, convert into the first
// Font$Path directory (!Fonts) and parse the Outlines0 / IntMetric0 written; then a PFA with "As specified
// in Type 1 file" and Keep PostScript (Outlines, IntMetrics, Encoding, Type1). Screenshots tierB-t1tofont-*.png.
import path from 'path';
import { makeType1 } from './t1-make.mjs';
import { filerItem, filerOpen, iconbarPos, check } from '../edit/ui.mjs';
import { readEncoding } from '../../src/apps/T1ToFont/type1.js';
import base0 from '../../src/apps/T1ToFont/base0.js';

const SHOTS = process.env.SHOTS || 'tests/screens';
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-t1tofont-${n}.png`) });
const T = (page, fn, arg) => page.evaluate(fn, arg);

export default async (page) => {
  const font = makeType1();
  // Base0 is the Font Manager's internal glyph order (the Latin1 encoding maps character codes onto it)
  const B0 = await readEncoding('/Base0', async () => base0);
  const NAMES = { ' ': 'space', '-': 'hyphen', '?': 'question', '&': 'ampersand', 'Á': 'Aacute', '.': 'period' };
  const codes = (str) => [...str].map((ch) => B0.matchname(NAMES[ch] ?? (/[0-9]/.test(ch) ? ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][+ch] : ch)));
  const AACUTE = B0.matchname('Aacute'), ACUTE = B0.matchname('acute');
  await T(page, ({ pfa, pfb }) => {
    os.vfs.writeFile('RAM::RamDisc0.$.Sample/pfb', new Uint8Array(pfb), { filetype: 0xFFD });
    os.vfs.writeFile('RAM::RamDisc0.$.Sample/pfa', new Uint8Array(pfa), { filetype: 0xFFD });
  }, { pfa: [...font.pfa], pfb: [...font.pfb] });

  // launch by double-clicking the application in a Filer window
  await filerOpen(page, 'ADFS::HardDisc4.$.Utilities', '!T1ToFont', { wait: 1500 });
  const running = await T(page, () => { const t = os.apps.tasksOf('T1ToFont')[0]; return t ? { name: t.name, dir: os.sysvars.get('T1ToFont$Dir'), path: os.sysvars.get('T1ToFont$Path'), fp: os.sysvars.get('Font$Path') } : null; });
  check('T1ToFont started from the Filer', !!running, JSON.stringify(running));
  check('task name from Messages Title', running?.name === 'Type 1 Converter');
  check('T1ToFont$Path set like !Run', /!T1ToFont\.,.*!Fonts/.test(running?.path ?? ''), running?.path);
  await T(page, () => { for (const v of [...os.filer.viewers.values()]) v.win.close(); });

  // click the icon bar icon: the converter box opens
  const ib = await iconbarPos(page, '!t1tofont');
  check('icon bar icon', !!ib);
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(400);
  const box = await T(page, () => { const w = os.apps.tasksOf('T1ToFont')[0].t1.window; return { open: w.isOpen, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h, enc: w.icons[6].text, savein: w.icons[8].text }; });
  check('box open', box.open && /Type 1 to Acorn Font Converter/.test(box.title), JSON.stringify(box));
  check('default encoding and Save in', box.enc === 'Acorn Extended Latin' && /!Fonts$/.test(box.savein), `${box.enc} / ${box.savein}`);
  await T(page, () => { const w = os.apps.tasksOf('T1ToFont')[0].t1.window; w.open({ x: 60, y: 80, behind: 'top' }); });
  await page.waitForTimeout(200);

  // OK with nothing filled in: "Please drag in a Type 1 file ..."
  const iconPos = (i) => T(page, (i) => { const w = os.apps.tasksOf('T1ToFont')[0].t1.window; const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); }, i);
  let p = await iconPos(0);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  const err1 = await T(page, () => document.body.innerText.includes('Please drag in a Type 1 file'));
  check('NoFiles error', err1);
  await shot(page, 'error');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // drag Sample/pfb from a RAM disc Filer window into the box (typed Data: recognised by content)
  const fi = await filerItem(page, 'RAM::RamDisc0.$', 'Sample/pfb', { x: 600, y: 420, w: 360, h: 180 });
  const target = await iconPos(2);
  await page.mouse.move(fi.x, fi.y);
  await page.mouse.down();
  await page.mouse.move(fi.x - 20, fi.y - 20, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const filled = await T(page, () => { const w = os.apps.tasksOf('T1ToFont')[0].t1.window; return { t1: w.icons[2].text, name: w.icons[10].text }; });
  check('Type 1 field filled by the drag', /Sample\/pfb$/.test(filled.t1), filled.t1);
  check('font name guessed from /FontName', filled.name === 'Sample.Medium', filled.name);
  await shot(page, 'box');

  // Encoding pop-up
  p = await iconPos(12);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  const encItems = await page.locator('.menu').last().locator('.mitem').allInnerTexts();
  check('Encoding menu from Messages', encItems.length === 5 && /As specified in Type 1 file/.test(encItems.join('|')), encItems.join('|'));
  await shot(page, 'encmenu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Save in pop-up: the Font$Path directories
  p = await iconPos(13);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  const saveItems = await page.locator('.menu').last().locator('.mitem').allInnerTexts();
  check('Save in menu lists Font$Path', saveItems.length >= 1 && /!Fonts/.test(saveItems[0]), saveItems.join('|'));
  await shot(page, 'savemenu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // convert
  p = await iconPos(0);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => os.apps.tasksOf('T1ToFont')[0].lastConversion, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  const errText = await T(page, () => document.body.innerText.match(/Message from[^\n]*\n[^\n]*/)?.[0] ?? '');
  if (errText) console.log('AFTER OK', errText);
  const res = await T(page, async ({ AACUTE }) => {
    const R = await import('/tools/lib/riscosfont.mjs'); const nb = (b) => { b.toString = null; return b; };   // riscosfont.mjs tests buf.toString for node Buffers
    const t = os.apps.tasksOf('T1ToFont')[0];
    const dir = t.lastConversion.savein + '.Sample.Medium';
    const out = { files: os.vfs.exists(dir) ? os.vfs.list(dir).map((e) => `${e.name}:${e.filetype?.toString(16)}`) : [] };
    try {
      const o = R.parseOutlines(nb(await os.vfs.readFile(dir + '.Outlines0')));
      const m = R.parseIntMetrics(nb(await os.vfs.readFile(dir + '.IntMetric0')));
      out.version = o.version; out.glyphA = o.glyphs.get(65)?.contours.length; out.aacute = o.glyphs.get(AACUTE)?.includes?.map((i) => i.code);
      out.name = m.name; out.flags = m.flags; out.widthA = m.xoff?.[m.map ? m.map[65] : 65];
    } catch (e) { out.error = e.message; }
    return out;
  }, { AACUTE });
  check('Outlines0 + IntMetric0 written into !Fonts.Sample.Medium', res.files.includes('Outlines0:ff6') && res.files.includes('IntMetric0:ff6'), JSON.stringify(res.files));
  check('Outlines parse (v8, A has contours)', res.version === 8 && res.glyphA > 0, JSON.stringify(res));
  check('Aacute (seac) became a composite of A + acute', JSON.stringify(res.aacute) === JSON.stringify([65, ACUTE]), JSON.stringify(res.aacute));
  check('IntMetrics parse (name, width of A)', res.name.startsWith('Sample.Medium') && res.widthA > 500, `${res.name} ${res.widthA}`);
  await T(page, () => os.filer.openDir(os.apps.tasksOf('T1ToFont')[0].lastConversion.savein + '.Sample.Medium', { x: 560, y: 360, w: 400, h: 150, mode: 'full' }));
  await page.waitForTimeout(600);
  await shot(page, 'done');

  // second run: the PFA, font-specific encoding, Keep PostScript, another name
  await T(page, async () => {
    const t = os.apps.tasksOf('T1ToFont')[0];
    await t.t1.importFile('RAM::RamDisc0.$.Sample/pfa', 0xFFD, 2);
    t.t1.setEnc(2);
    const w = t.t1.window; w.icons[10].setText('Sample.Specific');
    t.lastConversion = null;
  });
  await page.waitForTimeout(300);
  p = await iconPos(11);
  await page.mouse.click(p.x, p.y);                  // Keep PostScript
  p = await iconPos(0);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(800);
  const warn = await T(page, () => document.body.innerText.includes('Using Adobe Standard Encoding'));
  check('Adobe Standard Encoding message', warn);
  await shot(page, 'adobe');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => os.apps.tasksOf('T1ToFont')[0].lastConversion, null, { timeout: 15000 }).catch(() => {});
  const res2 = await T(page, async () => {
    const t = os.apps.tasksOf('T1ToFont')[0];
    const dir = t.lastConversion.savein + '.Sample.Specific';
    const R = await import('/tools/lib/riscosfont.mjs'); const nb = (b) => { b.toString = null; return b; };   // riscosfont.mjs tests buf.toString for node Buffers
    const files = os.vfs.list(dir).map((e) => e.name);
    const o = R.parseOutlines(nb(await os.vfs.readFile(dir + '.Outlines')));
    const enc = await os.vfs.readText(dir + '.Encoding');
    return { files, acute: o.glyphs.get(194)?.contours.length, encA: enc.split('\n')[65] };
  });
  check('font-specific conversion: Outlines, IntMetrics, Encoding, Type1', ['Outlines', 'IntMetrics', 'Encoding', 'Type1'].every((f) => res2.files.includes(f)), res2.files.join(','));
  check('font-specific: glyph at Adobe code 194, Encoding file', res2.acute > 0 && res2.encA === '/A', JSON.stringify(res2));

  // render some converted glyphs from the Outlines0 file (checks the outlines themselves)
  await T(page, async ({ line1, line2 }) => {
    const R = await import('/tools/lib/riscosfont.mjs'); const nb = (b) => { b.toString = null; return b; };   // riscosfont.mjs tests buf.toString for node Buffers
    const dir = os.apps.tasksOf('T1ToFont')[0].lastConversion.savein.replace(/\.$/, '');
    const o = R.parseOutlines(nb(await os.vfs.readFile(dir + '.Sample.Medium.Outlines0')));
    const m = R.parseIntMetrics(nb(await os.vfs.readFile(dir + '.Sample.Medium.IntMetric0')));
    const c = document.createElement('canvas'); c.id = 't1sheet'; c.width = 1000; c.height = 260;
    Object.assign(c.style, { position: 'fixed', left: '10px', top: '10px', zIndex: 99999, background: '#fff', border: '2px solid #000' });
    document.body.appendChild(c);
    const g = c.getContext('2d');
    g.font = '14px Homerton, sans-serif'; g.fillText('Sample.Medium converted by !T1ToFont (Outlines0 / IntMetric0, parsed back and drawn)', 10, 20);
    const draw = (code, x, y, s) => {
      const gl = o.glyphs.get(code); if (!gl) return 0;
      const path = (gl2, dx, dy) => {
        for (const inc of gl2.includes ?? []) { const sub = o.glyphs.get(inc.code); if (sub) path(sub, dx + inc.dx, dy + inc.dy); }
        for (const ct of gl2.contours ?? []) for (const sg of ct) {
          const P = sg.pts.map(([px, py]) => [x + (px + dx) * s, y - (py + dy) * s]);
          if (sg.t === 'M') g.moveTo(...P[0]); else if (sg.t === 'L') g.lineTo(...P[0]); else g.bezierCurveTo(...P[0], ...P[1], ...P[2]);
        }
      };
      g.beginPath(); path(gl, 0, 0); g.fill('nonzero');
      const idx = m.map ? m.map[code] : code;
      return (m.xoff?.[idx] ?? 500) * s;
    };
    let x = 10;
    for (const code of line1) x += draw(code, x, 110, 0.07);
    x = 10;
    for (const code of line2) x += draw(code, x, 220, 0.045);
  }, { line1: codes('Hamburgefonstiv ÁB-O&Q?'), line2: codes('The quick brown fox - 0123456789.') });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'tierB-t1tofont-glyphs.png'), clip: { x: 0, y: 0, width: 1030, height: 290 } });
  await T(page, () => document.getElementById('t1sheet')?.remove());

  // Info box from the icon bar menu, then Quit
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  const items = await page.locator('.menu').last().locator('.mitem').allInnerTexts();
  check('icon bar menu Info / Quit', items.length === 2 && /Info/.test(items[0]) && /Quit/.test(items[1]), items.join('|'));
  const it = await page.locator('.menu').last().locator('.mitem').nth(0).boundingBox();
  await page.mouse.move(it.x + 20, it.y + it.height / 2);
  await page.mouse.move(it.x + it.width - 6, it.y + it.height / 2, { steps: 3 });
  await page.waitForTimeout(400);
  const ver = await T(page, () => document.body.innerText.includes('1.28 (31-Jan-95)'));
  check('Info box shows the version', ver);
  await shot(page, 'info');
  const q = await page.locator('.menu').first().locator('.mitem').nth(1).boundingBox();
  await page.mouse.click(q.x + 20, q.y + q.height / 2);
  await page.waitForTimeout(400);
  check('Quit', await T(page, () => os.apps.tasksOf('T1ToFont').length === 0));
};
