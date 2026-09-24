// !Access+ and !AccessCD: launched by double-clicking them in HardDisc4.Utilities.Access+. Access+: share a
// directory through the Select dialogue (password + protected), drag a directory from a Filer window to the
// icon, Show ▸ <share> ("About a share"), *Shares, Save (!Shares), Remove ▸, structured sharing from a PINS
// text file, Quit box (Leave). AccessCD: Set cache box, adjusters, Save to Config, Info.
import path from 'path';
import { SHOTS } from '../core/pw.mjs';
import { filerOpen, filerItem, menuItem, hoverArrow, clickItem, menuTexts, check } from '../edit/ui.mjs';

const DIR = 'ADFS::HardDisc4.$.Utilities.Access+';
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-access-${n}.png`) });
const ib = (page, name) => page.evaluate((name) => {
  const t = os.apps.tasksOf(name)[0];
  const it = t && [...t.iconbarIcons][0];
  if (!it) return null;
  const r = it.icon.el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + 14 };
}, name);
const openWin = (page, title) => page.evaluate((title) => {
  const w = [...wimp.windows].find((q) => q.isOpen && q.task?.name?.startsWith('Access') && q.title === title);
  return !!w;
}, title);
const iconCentre = (page, title, i) => page.evaluate(({ title, i }) => {
  const w = [...wimp.windows].reverse().find((q) => q.isOpen && q.title === title);
  const b = w.icons[i].bbox;
  return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
}, { title, i });

export default async (page) => {
  await page.evaluate(() => {
    for (const d of ['Stuff', 'Photos']) os.vfs.mkdir('RAM::RamDisc0.$.' + d);
    // the structured-sharing layout next to !Access+: Apps, Dirs.<user>
    for (const d of ['Apps', 'Dirs', 'Dirs.fred', 'Dirs.jim']) os.vfs.mkdir('ADFS::HardDisc4.$.Utilities.Access+.' + d, { parents: true });
    os.vfs.writeFile('RAM::RamDisc0.$.Users', 'U fred abc\nP jim 1234\n', { filetype: 0xFFF });
  });

  // ---------------------------------------------------------------- launch from the Filer
  await filerOpen(page, DIR, '!Access+');
  let pos = await ib(page, 'Access+');
  check('Access+ icon on the icon bar', !!pos);
  if (!pos) return;
  const st = await page.evaluate(() => ({ dir: os.sysvars.get('Access+$Dir'), run: os.sysvars.get('Access+$Running'), t: os.sysvars.get('File$Type_BDA') }));
  check('Access+ variables', /!Access\+$/.test(st.dir ?? '') && st.run === 'Yes' && st.t === 'Disc', JSON.stringify(st));

  // ---------------------------------------------------------------- Select: share dialogue
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(400);
  check('Select opens the share dialogue', await openWin(page, 'Access+'));
  await page.keyboard.type('RAM::RamDisc0.$.Stuff');
  // bad key first
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('a');
  let p = await iconCentre(page, 'Access+', 6);
  await page.mouse.click(p.x, p.y);           // Share protected
  await shot(page, 'server');
  p = await iconCentre(page, 'Access+', 0);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  const e1 = await page.evaluate(() => document.querySelector('.errorbox, .error-box')?.innerText ?? [...wimp.windows].filter((w) => w.isOpen).map((w) => w.title + ':' + w.icons?.map((i) => i?.text).join('|')).join('\n'));
  check('bad key gives Pin0 error', /Valid keys are from two to six/.test(e1), e1.slice(0, 200));
  await shot(page, 'pinerror');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  p = await iconCentre(page, 'Access+', 4);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Control+u');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let sh = await page.evaluate(() => os.apps.tasksOf('Access+')[0].accessPlus.shares());
  check('Stuff shared protected with a key', sh.length === 1 && sh[0].name === 'Stuff' && !sh[0].how.owner && sh[0].pin > 0, JSON.stringify(sh));

  // ---------------------------------------------------------------- drag a directory to the icon
  const from = await filerItem(page, 'RAM::RamDisc0.$', 'Photos', { x: 300, y: 80, w: 400, h: 200 });
  pos = await ib(page, 'Access+');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
  await page.mouse.move(pos.x, pos.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const txt = await page.evaluate(() => os.apps.tasksOf('Access+')[0].accessPlus.server?.icons[3].text);
  check('dragging a directory fills in the dialogue', /Photos$/.test(txt ?? ''), txt);
  await shot(page, 'drop');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------- menu: Show ▸ Stuff
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(300);
  const items = await menuTexts(page, 0);
  check('icon bar menu', items.map((s) => s.trim()).join(',') === 'Info,Show,Save,Remove,Quit', items.join(','));
  await hoverArrow(page, 0, 1);
  const shows = await menuTexts(page, 1);
  check('Show lists the shares', shows.map((s) => s.trim()).join(',') === 'Stuff,Photos', shows.join(','));
  await hoverArrow(page, 1, 0);
  await page.waitForTimeout(300);
  const about = await page.evaluate(() => { const w = [...wimp.windows].find((q) => q.isOpen && q.title === 'About a share'); return w && [0, 2, 4].map((i) => w.icons[i].text); });
  check('About a share', about && about[0] === 'Stuff' && /Stuff$/.test(about[1]) && /Protected/.test(about[2]), JSON.stringify(about));
  await shot(page, 'show');
  // Save
  await page.mouse.move(pos.x, pos.y - 200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 2);
  const saved = await page.evaluate(() => os.vfs.readText('ADFS::HardDisc4.$.Utilities.Access+.!Access+.!Shares'));
  check('Save writes !Shares', /Share RAM::RamDisc0\.\$\.Stuff Stuff -protected -auth \d+/.test(saved) && /Photos/.test(saved), saved);
  // *Shares
  const out = await page.evaluate(async () => { let s = ''; await os.cli.run('Shares', { out: { write: (t) => { s += t; }, writeln: (t) => { s += t + '\n'; } } }); return s; });
  check('*Shares lists both', /Export Stuff\s+RAM::RamDisc0\.\$\.Stuff -protected/.test(out) && /Export Photos/.test(out), out);

  // ---------------------------------------------------------------- Remove ▸ Photos
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(300);
  await hoverArrow(page, 0, 3);
  await shot(page, 'remove');
  await clickItem(page, 1, 1);
  sh = await page.evaluate(() => os.apps.tasksOf('Access+')[0].accessPlus.shares().map((s) => s.name));
  check('Remove stops sharing Photos', sh.join(',') === 'Stuff', sh.join(','));

  // ---------------------------------------------------------------- structured sharing: PINS file
  await page.evaluate(() => os.apps.tasksOf('Access+')[0].accessPlus.dropped([{ path: 'RAM::RamDisc0.$.Users' }]));
  await page.waitForTimeout(300);
  sh = await page.evaluate(() => os.apps.tasksOf('Access+')[0].accessPlus.shares().map((s) => `${s.name}:${s.how.owner ? 'U' : 'P'}${s.how.readonly ? 'R' : ''}${s.pin ? 'K' : ''}`));
  check('structured shares Apps, fred, jim', sh.join(',') === 'Stuff:PK,Apps:UR,fred:UK,jim:PK', sh.join(','));
  const pins = await page.evaluate(() => os.vfs.readText('ADFS::HardDisc4.$.Utilities.Access+.!Access+.PINS'));
  check('PINS file kept', /U fred abc/.test(pins), pins);
  // a second drop asks Replace / Add / Cancel
  await page.evaluate(() => { os.apps.tasksOf('Access+')[0].accessPlus.dropped([{ path: 'RAM::RamDisc0.$.Users' }]); });
  await page.waitForTimeout(400);
  const ovr = await page.evaluate(() => !![...wimp.windows].find((q) => q.isOpen && q.icons?.[0]?.text?.startsWith('A password file already exists')));
  check('existing PINS: Replace/Add box', ovr);
  await shot(page, 'ovr');
  p = await page.evaluate(() => { const w = [...wimp.windows].find((q) => q.isOpen && q.icons?.[0]?.text?.startsWith('A password file')); const b = w.icons[2].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); });
  await page.mouse.click(p.x, p.y);   // Cancel
  await page.waitForTimeout(200);

  // ---------------------------------------------------------------- Quit with shares: Leave
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 4);
  await page.waitForTimeout(300);
  const q = await page.evaluate(() => !![...wimp.windows].find((w) => w.isOpen && w.icons?.[0]?.text?.startsWith('There are Access+ shares present')));
  check('Quit asks about the shares', q);
  await shot(page, 'quit');
  p = await page.evaluate(() => { const w = [...wimp.windows].find((q) => q.isOpen && q.icons?.[0]?.text?.startsWith('There are Access+')); const b = w.icons[3].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); });
  await page.mouse.click(p.x, p.y);   // Leave
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => ({ running: os.apps.tasksOf('Access+').length, out: os.sysvars.get('Access+$Running') ?? '' }));
  check('Leave quits, shares stay', left.running === 0 && !left.out, JSON.stringify(left));

  // ---------------------------------------------------------------- !AccessCD
  await filerOpen(page, DIR, '!AccessCD');
  const cpos = await ib(page, 'AccessCD');
  check('AccessCD icon on the icon bar', !!cpos);
  if (!cpos) return;
  await page.mouse.click(cpos.x, cpos.y);
  await page.waitForTimeout(400);
  const size0 = await page.evaluate(() => [...wimp.windows].find((w) => w.isOpen && w.title === 'Set cache')?.icons[0].text);
  check('Set cache shows the configured 256K', size0 === '256', size0);
  p = await iconCentre(page, 'Set cache', 4);
  await page.mouse.click(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  await shot(page, 'cd-cache');
  const size1 = await page.evaluate(() => [...wimp.windows].find((w) => w.isOpen && w.title === 'Set cache')?.icons[0].text);
  check('up arrow increases the size', size1 === '288', size1);
  p = await iconCentre(page, 'Set cache', 1);
  await page.mouse.click(p.x, p.y);   // Save
  await page.waitForTimeout(300);
  const conf = await page.evaluate(() => os.vfs.readText('ADFS::HardDisc4.$.Utilities.Access+.!AccessCD.Config'));
  check('Save writes Config', conf.trim() === '288', conf);
  await page.mouse.click(cpos.x, cpos.y, { button: 'right' });
  await page.waitForTimeout(300);
  await hoverArrow(page, 0, 0);
  await page.waitForTimeout(300);
  await shot(page, 'cd-info');
  await page.keyboard.press('Escape');
};
