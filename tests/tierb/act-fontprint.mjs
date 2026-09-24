// !FontPrint: launch from the Filer ($.Printing), open the window without !Printers (greyed, "No PostScript
// printer selected"), start !Printers (the default PostScript printer's font list appears), select / menu /
// map / encoding / add font / delete, Save (font file rewritten) and Defaults (restored).
import path from 'path';
import { SHOTS } from '../core/pw.mjs';
import { filerOpen, iconbarPos, hoverArrow, clickItem, menuTexts, check } from '../edit/ui.mjs';

const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-fontprint-${n}.png`) });
const state = (page) => page.evaluate(() => {
  const t = os.apps.tasksOf('FontPrint')[0]?.fontprint;
  return t && { n: t.list.length, enabled: t.enabled, file: t.file, title: t.main.title, open: t.main.isOpen, pane: t.pane.isOpen,
    sel: t.list.filter((f) => f.selected).map((f) => f.local), rows: t.list.map((f) => `${f.local}|${f.foreign}|${f.encoding}`) };
});
// screen position of list row i (centre of the first column)
const rowPos = (page, i) => page.evaluate((i) => { const p = os.apps.tasksOf('FontPrint')[0].fontprint.pane; return p.workToScreen(80, i * 19 + 9); }, i);

export default async (page) => {
  await filerOpen(page, 'ADFS::HardDisc4.$.Printing', '!FontPrint');
  check('FontPrint task started from the Filer', await page.evaluate(() => os.apps.tasksOf('FontPrint').length === 1));
  const ib = await iconbarPos(page, 'FontPrint');
  check('icon bar icon', !!ib);
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(500);
  let s = await state(page);
  check('window opens without !Printers', s.open && s.pane, JSON.stringify(s));
  check('no printer: title + greyed', s.title === 'No PostScript printer selected' && !s.enabled && s.n === 0, s.title);
  await shot(page, 'noprinter');

  // Info box from the icon bar menu
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  check('icon bar menu', JSON.stringify(await menuTexts(page, 0)) === JSON.stringify(['Info', 'Quit']));
  await hoverArrow(page, 0, 0);
  await page.waitForTimeout(300);
  await shot(page, 'info');
  await page.keyboard.press('Escape');

  // start !Printers: FontPrint picks up the current (PostScript) printer
  await page.evaluate(() => os.apps.start('Printers'));
  await page.waitForTimeout(1800);
  s = await state(page);
  check('printer found', s.enabled && /PostScript Level 1/.test(s.title), s.title);
  check('35 default mappings', s.n === 35, String(s.n));
  check('Trinity.Medium -> Times-Roman', s.rows.includes('Trinity.Medium|Times-Roman|Adobe.Standard'));
  await page.evaluate(() => os.apps.tasksOf('FontPrint')[0].fontprint.main.open({ behind: 'top' }));
  await page.waitForTimeout(300);
  await shot(page, 'list');

  // select row 8 (Corpus.Medium), Adjust-toggle row 9
  let p = await rowPos(page, 8);
  await page.mouse.click(p.x, p.y);
  p = await rowPos(page, 9);
  await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  s = await state(page);
  check('selection', JSON.stringify(s.sel) === JSON.stringify(['Corpus.Medium', 'Corpus.Bold']), JSON.stringify(s.sel));

  // Menu: Selection > Map to > Times-Roman
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(300);
  const t0 = await menuTexts(page, 0);
  check('window menu', t0.join(',') === 'Selection,Select all,Clear selection,Add font', t0.join(','));
  await hoverArrow(page, 0, 0);
  const t1 = await menuTexts(page, 1);
  check('selection menu', t1.join(',') === 'Download,Map to,Encoding,Delete', t1.join(','));
  await hoverArrow(page, 1, 1);
  const t2 = await menuTexts(page, 2);
  check('map menu lists PostScript fonts', t2.includes('Times-Roman') && t2.includes('Helvetica'), t2.length + '');
  await shot(page, 'mapmenu');
  await clickItem(page, 2, t2.indexOf('Times-Roman'));
  s = await state(page);
  check('mapped to Times-Roman', s.rows[8] === 'Corpus.Medium|Times-Roman|Adobe.Standard' && s.rows[9].startsWith('Corpus.Bold|Times-Roman'), s.rows[8]);

  // Encoding > Adobe.Special
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await hoverArrow(page, 0, 0);
  await hoverArrow(page, 1, 2);
  const t3 = await menuTexts(page, 2);
  check('encoding menu', t3.join(',') === 'Adobe.Special,Adobe.Standard', t3.join(','));
  await clickItem(page, 2, 0);
  s = await state(page);
  check('encoding set', s.rows[8].endsWith('|Adobe.Special'), s.rows[8]);

  // Download
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await hoverArrow(page, 0, 0);
  await clickItem(page, 1, 0);
  s = await state(page);
  check('download', s.rows[8] === 'Corpus.Medium|null|Adobe.Special', s.rows[8]);

  // Add font > Sassoon > Primary (appended, selected)
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await hoverArrow(page, 0, 3);
  const fams = await menuTexts(page, 1);
  check('font menu', fams.includes('Sassoon') && fams.includes('Trinity'), fams.join(','));
  await hoverArrow(page, 1, fams.indexOf('Sassoon'));
  await shot(page, 'addfont');
  await clickItem(page, 2, 0);
  await page.waitForTimeout(300);
  s = await state(page);
  check('font added', s.n === 36 && s.rows[35] === 'Sassoon.Primary|null|', s.rows[35]);
  await shot(page, 'added');

  // Save -> the font file
  const save = await page.evaluate(() => { const w = os.apps.tasksOf('FontPrint')[0].fontprint.main; const b = w.icons[2].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); });
  await page.mouse.click(save.x, save.y);
  await page.waitForTimeout(300);
  const txt = await page.evaluate(async (f) => os.vfs.readText(f), s.file);
  check('saved font file', /^Corpus\.Medium$/m.test(txt) && /^Sassoon\.Primary$/m.test(txt) && /^Corpus\.Bold$/m.test(txt) && /^Trinity\.Medium Times-Roman Adobe\.Standard$/m.test(txt), s.file);

  // Defaults -> restored
  const def = await page.evaluate(() => { const w = os.apps.tasksOf('FontPrint')[0].fontprint.main; const b = w.icons[3].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); });
  await page.mouse.click(def.x, def.y);
  await page.waitForTimeout(500);
  s = await state(page);
  check('defaults restored', s.n === 35 && s.rows[8] === 'Corpus.Medium|Courier|Adobe.Standard', s.rows[8]);

  // quitting !Printers greys the window again
  await page.evaluate(() => os.apps.tasksOf('Printers')[0].quit());
  await page.waitForTimeout(1000);
  s = await state(page);
  check('greyed after !Printers quits', !s.enabled && s.title === 'No PostScript printer selected');
};
