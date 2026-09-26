// !JsEdit's directory views (src/apps/JsEdit/dirs.js): a directory dropped on the icon bar icon or opened from
// its menu shows as a tree; sub-directories fold open; double-click edits a text file and runs anything else;
// files being edited are bold with * when changed; New file / New directory / Rename / Delete; keys; Find in
// files; drags to and from the Filer; changes made elsewhere show at once; views come back after quitting.
import { launch, BASE_URL } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ width: 1100, height: 850 });
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const sleep = (ms) => page.waitForTimeout(ms);
const until = async (fn, arg, ms = 5000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v || Date.now() - t0 > ms) return v;
    await sleep(100);
  }
};
const D = 'RAM::RamDisc0.$.Proj';
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.evaluate((D) => {
    const v = os.vfs;
    v.mkdir(D); v.mkdir(D + '.lib'); v.mkdir(D + '.lib.deep');
    v.writeFile(D + '.main', 'print("main");\n// TODO: tidy\n', { filetype: 0xF81 });
    v.writeFile(D + '.lib.util', 'export const x = 1; // TODO later\n', { filetype: 0xF81 });
    v.writeFile(D + '.lib.deep.notes', 'nothing here\n', { filetype: 0xFFF });
    v.writeFile(D + '.picture', new Uint8Array([1, 2, 3]), { filetype: 0xFF9 });
    window.__je = () => os.wimp.tasks.find((t) => t.name === 'JsEdit');
    window.__texts = () => [...(__je()?.windows ?? [])].map((w) => w.userData?.state).filter(Boolean);
  }, D);
  await page.evaluate(async () => { await os.cli.run('Run ADFS::HardDisc4.$.Apps.!JsEdit'); await new Promise((r) => setTimeout(r, 600)); });

  // a directory dropped on the icon bar icon
  await page.evaluate((D) => os.iconbar.items.find((i) => i.sprite === '!jsedit').onDataLoad({ files: [{ path: D, filetype: 0x1000 }] }), D);
  const view = await until(() => { const w = [...__je().windows].find((x) => /Proj$/.test(x.title)); return w && w.isOpen; });
  ok('dropping a directory on the icon opens a directory view', view);
  const rows = await until(() => __je().jsedit?.dirs.views[0]?.rows.map((r) => `${r.depth}:${r.name}`).join(','));
  ok('the tree: directories first, then files, folded shut', rows === '0:lib,0:main,0:picture', rows);
  await page.evaluate(() => { window.DV = () => __je().jsedit.dirs.views[0]; });

  // folding open by the arrow, then the keyboard
  await page.evaluate(() => { const v = DV(); v.click({ button: 'select', x: 6, y: 5 }); });
  ok('clicking the arrow opens a sub-directory', await page.evaluate(() => DV().rows.map((r) => `${r.depth}:${r.name}`).join(',')) === '0:lib,1:deep,1:util,0:main,0:picture');
  await page.evaluate(() => { const v = DV(); v.select(1); v.key({ code: 0x18D }); });
  ok('Right opens the selected directory', await page.evaluate(() => DV().rows.some((r) => r.name === 'notes' && r.depth === 2)));
  await page.evaluate(() => { const v = DV(); v.select(0); v.key({ code: 0x18C }); });
  ok('Left shuts it again', await page.evaluate(() => DV().rows.length === 3));
  await page.evaluate(() => DV().key({ code: 0x18E }));
  ok('Down moves the selection', await page.evaluate(() => DV().rows[DV().cursor]?.name === 'main' && DV().selected.size === 1));
  await page.evaluate(() => DV().key({ code: 112, char: 'p' }));
  ok('typing a letter goes to a name', await page.evaluate(() => DV().rows[DV().cursor]?.name === 'picture'));

  // double-click: a text file is edited (and marked), anything else is run
  await page.evaluate(() => { const v = DV(); const i = v.rows.findIndex((r) => r.name === 'main'); v.doubleClick({ button: 'select', x: 60, y: i * 22 + 5 }); });
  ok('double-click on a JSScript file edits it', await until((D) => __texts().some((s) => s.filename === D + '.main'), D));
  await page.evaluate((D) => { const s = __texts().find((x) => x.filename === D + '.main'); s.doc.setText('changed'); s.doc.setModified(true); }, D);
  const mark = await page.evaluate(async () => {
    const v = DV(); const i = v.rows.findIndex((r) => r.name === 'main');
    const t = __je().jsedit.findNamed(v.rows[i].path);
    return { open: !!t, modified: t?.doc.modified };
  });
  ok('the view knows the file is being edited, with changes', mark.open && mark.modified, mark);
  const ran = await page.evaluate(() => {
    const v = DV(); const i = v.rows.findIndex((r) => r.name === 'picture');
    let run = null; const orig = os.filer.run; os.filer.run = (p) => { run = p; }; v.openRow(i); os.filer.run = orig; return run;
  });
  ok('double-click on another kind of file runs it (as the Filer)', /picture$/.test(ran ?? ''), ran);

  // New file / New directory / Rename / Delete
  await page.evaluate(() => { const v = DV(); v.select(-1); v.newFile('extra/json'); });
  ok('New file: made, typed from its name, and edited', await until((D) => os.vfs.stat(D + '.extra/json')?.filetype === 0xF75 && __texts().some((s) => s.filename === D + '.extra/json'), D));
  await page.evaluate(() => { const v = DV(); v.select(v.rows.findIndex((r) => r.name === 'lib')); v.newFile('more'); });
  ok('New file in the selected directory takes the type of the files there', await until((D) => os.vfs.stat(D + '.lib.more')?.filetype === 0xF81, D));
  await page.evaluate(() => { const v = DV(); v.select(-1); v.newDir('assets'); });
  ok('New directory', await page.evaluate((D) => os.vfs.isDir(D + '.assets') && DV().rows.some((r) => r.name === 'assets'), D));
  await page.evaluate(() => { const v = DV(); const i = v.rows.findIndex((r) => r.name === 'main'); v.rename(v.rows[i], 'app'); });
  ok('Rename: the file, and the text being edited follows it', await page.evaluate((D) => os.vfs.exists(D + '.app') && !os.vfs.exists(D + '.main') && __texts().some((s) => s.filename === D + '.app'), D));
  await page.evaluate(() => { const v = DV(); v.select(v.rows.findIndex((r) => r.name === 'assets')); v.deleteSelection(); });
  ok('Delete asks first', await until(() => os.wimp.stack.some((w) => w._errorBox && w.isOpen && /Delete 'assets'/.test(w.icons[0].text))));
  await page.keyboard.press('Enter');
  ok('and deletes', await until((D) => !os.vfs.exists(D + '.assets') && !DV().rows.some((r) => r.name === 'assets'), D));

  // changes made elsewhere show at once
  await page.evaluate((D) => os.vfs.writeFile(D + '.fromelsewhere', 'x', { filetype: 0xFFF }), D);
  ok('a file made elsewhere appears', await until(() => DV().rows.some((r) => r.name === 'fromelsewhere')));

  // Find in files
  const hits = await page.evaluate((D) => __je().jsedit.dirs.findInFiles(D, 'todo'), D);
  const found = await page.evaluate(() => { const f = __je().jsedit.dirs.found; return { open: f.win.isOpen, items: f.items.map((i) => i.text) }; });
  ok('Find in files lists every line, file by file', hits === 2 && found.open && found.items.some((t) => /line {4}2: \/\/ TODO: tidy/.test(t)) && found.items.some((t) => /util$/.test(t)), found);
  await page.evaluate(() => __je().jsedit.dirs.found.items.find((i) => /util$/.test(i.text)).go());
  ok('clicking a found line edits the file', await until((D) => __texts().some((s) => s.filename === D + '.lib.util'), D));

  // dragging from the view to a Filer window copies; from the Filer into the view copies in
  await page.evaluate(() => os.vfs.mkdir('RAM::RamDisc0.$.Out'));
  await page.evaluate(() => {
    const v = DV(); const f = os.filer.openDir('RAM::RamDisc0.$.Out');
    v.dropped({ window: f.win, x: 5, y: 5, sx: 0, sy: 0 }, v.rows.filter((r) => r.name === 'picture'));
  });
  ok('a file dragged to a Filer window is copied there', await until(() => os.vfs.exists('RAM::RamDisc0.$.Out.picture')));
  await page.evaluate(() => { os.vfs.writeFile('RAM::RamDisc0.$.Out.incoming', 'in', { filetype: 0xFFF }); const v = DV(); v.dataLoad({ files: [{ path: 'RAM::RamDisc0.$.Out.incoming', filetype: 0xFFF }], y: 1000 }); });
  ok('a file dropped in from the Filer is copied into the directory', await until((D) => os.vfs.exists(D + '.incoming') && DV().rows.some((r) => r.name === 'incoming'), D));

  // Open directory on the icon bar menu
  await page.evaluate(() => os.vfs.mkdir('RAM::RamDisc0.$.Other'));
  const menuOpened = await page.evaluate(() => {
    const m = os.iconbar.items.find((i) => i.sprite === '!jsedit').menu();
    const it = m.items.find((i) => i.text === 'Open directory');
    const sub = typeof it.submenu === 'function' ? it.submenu() : it.submenu;
    sub.items[0].action({ value: 'RAM::RamDisc0.$.Other' });
    return __je().jsedit.dirs.views.map((v) => v.path);
  });
  ok('Open directory on the icon bar menu', menuOpened.includes('RAM::RamDisc0.$.Other'), menuOpened);

  // views come back after quitting (with their open sub-directories)
  await page.evaluate(() => { const v = DV(); v.setOpen(v.rows.findIndex((r) => r.name === 'lib'), true); });
  await page.evaluate(async () => { for (const s of __texts()) s.doc.setModified(false); __je().jsedit.dirs.quit(); __je().quit(); await new Promise((r) => setTimeout(r, 300)); await os.cli.run('Run ADFS::HardDisc4.$.Apps.!JsEdit'); await new Promise((r) => setTimeout(r, 800)); });
  const back = await until(() => { const d = __je()?.jsedit?.dirs.views; return d?.length === 2 && d[0].rows.some((r) => r.depth === 1) && d.map((v) => v.path).join(); });
  ok('directory views come back when !JsEdit starts again, as they were', !!back, back);
  const help = await page.evaluate(() => DV().help(0));
  ok('interactive help', /directory 'lib'/.test(help), help);
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
}
