// !Letters and RTF in the real desktop (Batch G2, task 10): the boot
// files claim &C32 (File$Type_C32, Alias$@RunType_C32); a
// double-click on an RTF file starts Letters and opens it as RTF;
// Save writes RTF back to the same file, type &C32, the window
// clean and keeping its name; Revert reads it again as RTF; a second
// RTF goes to the running Letters (DataOpen &C32), a damaged one
// opens with its notes said once (an information notice); a file of
// type &C32 that is not RTF is said not to be an RTF file; a .docx still
// opens as a .docx. Save as (task 11): the window menu's Save as
// opens the box asking .docx or RTF as its submenu, Rich Text picked
// by a real click and Continue give the Save box with &C32, OK
// writes RTF and the window is RTF from then on; F3 on a .docx RTF
// cannot hold all of asks first, listing it, and Escape there writes
// nothing. An edited RTF saved stays RTF, Save as .docx makes the
// window a .docx, and both files reopen with the same text (task
// 12). Needs the disc built by tools/disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const enc = (s) => Array.from(Buffer.from(s, 'latin1'));
const LETTER = enc('{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}\\f0 Hello RTF.\\par Second.\\par}');
const CUT = enc('{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}\\f0 Cut short');
const docx = Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('A docx.'))) }));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(([a, b, c]) => {
    window.__msgs = [];
    const rec = (m, o) => { window.__msgs.push([String(m), o?.category ?? null]); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    const v = os.vfs;
    v.writeFile('RAM::RamDisc0.$.Letter/rtf', new Uint8Array(a), { filetype: 0xC32 });
    v.writeFile('RAM::RamDisc0.$.Cut', new Uint8Array(b), { filetype: 0xC32 });
    v.writeFile('RAM::RamDisc0.$.Junk', new Uint8Array(300).map((_, i) => (i * 7919 + 13) & 255), { filetype: 0xC32 });
    v.writeFile('RAM::RamDisc0.$.Report', new Uint8Array(c), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__by = (leaf) => window.__word()?.word?.docs.find((d) => d.leaf === leaf && !d.closed);
    window.__wait = async (fn, n = 100) => { for (let i = 0; i < n && !fn(); i++) await window.__sleep(50); };
  }, [LETTER, CUT, docx]);

  const boot = await ev(() => ({ type: os.sysvars.get('File$Type_C32') ?? null, alias: os.sysvars.get('Alias$@RunType_C32') ?? null }));
  ok('File$Type_C32 is RTF', boot.type === 'RTF', boot);
  ok('Alias$@RunType_C32 runs !Letters', /MoreApps\.!Letters\.!Run %\*0$/.test(boot.alias ?? ''), boot);

  // a double-click on the RTF file: Letters starts and opens it
  const r1 = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Letter/rtf');
    await window.__wait(() => window.__by('Letter/rtf'));
    await window.__sleep(200);
    const d = window.__by('Letter/rtf');
    return { open: !!d, format: d?.format, text: d?.text, title: d?.win.title, msgs: [...window.__msgs] };
  });
  ok('a double-click on an RTF file opens it in Letters, as RTF', r1.open && r1.format === 'rtf' && /Hello RTF\./.test(r1.text ?? '') && r1.title === 'Letter/rtf', r1);
  ok('... with no notice for a clean file', r1.msgs.length === 0, r1.msgs);

  // typed in, then Save: RTF back to the same file, &C32, clean
  const r2 = await ev(async () => {
    const d = window.__by('Letter/rtf');
    d.view.type('Typed ');
    const dirty = d.view.dirty;
    const saved = await d.save();
    const st = os.vfs.stat('RAM::RamDisc0.$.Letter/rtf');
    const bytes = await os.vfs.readFile('RAM::RamDisc0.$.Letter/rtf');
    return { dirty, saved, after: d.view.dirty, type: st.filetype, head: String.fromCharCode(...bytes.slice(0, 6)),
      body: String.fromCharCode(...bytes), path: d.path, leaf: d.leaf, title: d.win.title, format: d.format,
      files: os.vfs.list('RAM::RamDisc0.$').map((f) => f.name) };
  });
  ok('Save of an RTF window writes RTF to its file, type &C32', r2.dirty && r2.saved && r2.type === 0xC32 && r2.head === '{\\rtf1' && /Typed /.test(r2.body), r2);
  ok('... and keeps its name and path, clean, still RTF', !r2.after && /Letter\/rtf$/.test(r2.path) && r2.leaf === 'Letter/rtf' && r2.title === 'Letter/rtf' && r2.format === 'rtf' && !r2.files.some((n) => /docx/i.test(n)), r2);

  // Revert: read again as RTF
  const r3 = await ev(async () => {
    const d = window.__by('Letter/rtf');
    const res = await d.revert();
    await window.__sleep(200);
    const n = window.__by('Letter/rtf');
    return { res, fresh: n && n !== d, format: n?.format, text: n?.text };
  });
  ok('Revert of an RTF window reads it again as RTF', r3.res && r3.fresh && r3.format === 'rtf' && /Typed Hello RTF\./.test(r3.text ?? ''), r3);

  // Save a copy of an RTF window: RTF, &C32
  const r4 = await ev(async () => {
    const d = window.__by('Letter/rtf');
    const box = d.win.menu({}).items.find((i) => i.text === 'Save a copy').submenu();
    const save = d.saveBox();          // (G2: behind the Save as box's Continue)
    return { copy: box.filetype, save: save.filetype };
  });
  ok('the Save a copy and Save as boxes of an RTF window have type &C32', r4.copy === 0xC32 && r4.save === 0xC32, r4);

  // (task 12) edited and saved (still RTF), then Save as .docx; both files reopened
  const s1 = await ev(async () => {
    const d = window.__by('Letter/rtf');
    d.view.type('Edited ');
    const saved = await d.save();
    const rtf = os.vfs.stat('RAM::RamDisc0.$.Letter/rtf');
    const a = d.saveAsBox(), w = a.win;
    a.set('format', 'docx');
    w.emit('click', { icon: w.iconByName('button:Continue'), button: 'select' });
    await window.__sleep(100);
    const b = d.saveBox();
    const box = { name: b.filename(), type: b.filetype };
    b.setFilename('RAM::RamDisc0.$.Letter/docx');
    b.emit('click', { icon: b.icons[0], button: 'select' });
    await window.__wait(() => d.path?.endsWith('/docx') && !d.saving);
    const st = os.vfs.stat('RAM::RamDisc0.$.Letter/docx');
    const bytes = st ? await os.vfs.readFile('RAM::RamDisc0.$.Letter/docx') : new Uint8Array(0);
    const res = { saved, rtfType: rtf?.filetype, box, type: st?.filetype, zip: bytes[0] === 0x50 && bytes[1] === 0x4b,
      now: d.format, title: d.win.title, dirty: d.view.dirty };
    d.dw.close();
    await window.__sleep(150);
    const t = window.__word().word;
    for (const f of ['Letter/rtf', 'Letter/docx']) {
      await t.open('RAM::RamDisc0.$.' + f);
      await window.__wait(() => window.__by(f));
      await window.__sleep(100);
    }
    const ra = window.__by('Letter/rtf'), rb = window.__by('Letter/docx');
    res.again = [[ra?.format, ra?.text], [rb?.format, rb?.text]];
    return res;
  });
  ok('an edited RTF window saved stays RTF (&C32); Save as .docx asks nothing and gives the Save box with &A7E',
    s1.saved && s1.rtfType === 0xC32 && s1.box.type === 0xA7E && /Letter\/docx$/.test(s1.box.name), s1);
  ok('... OK writes a .docx (&A7E, a zip); the window is a .docx from then on, clean',
    s1.type === 0xA7E && s1.zip && s1.now === 'docx' && s1.title === 'Letter/docx' && !s1.dirty, s1);
  ok('... both files reopen: the RTF as RTF, the .docx as a .docx, the same text',
    s1.again[0][0] === 'rtf' && s1.again[1][0] === 'docx' && /Edited Typed Hello RTF\./.test(String(s1.again[0][1]))
    && JSON.stringify(s1.again[0][1]) === JSON.stringify(s1.again[1][1]), s1.again);

  // a second RTF, damaged: to the running Letters (Run: !Run forwards DataOpen &C32), notes said once
  const r5 = await ev(async () => {
    window.__msgs.length = 0;
    await os.cli.run('Run RAM::RamDisc0.$.Cut');
    await window.__wait(() => window.__by('Cut'));
    await window.__sleep(300);
    const d = window.__by('Cut');
    const tasks = os.wimp.tasks.filter((t) => t.alive && t.name === 'Letters').length;
    const msgs = [...window.__msgs];
    await window.__word().word.open('RAM::RamDisc0.$.Cut');      // (already open: to the front, no notice)
    await window.__sleep(100);
    return { open: !!d, format: d?.format, text: d?.text, tasks, msgs, again: window.__msgs.length };
  });
  ok('a damaged RTF goes to the running Letters and opens as far as read', r5.open && r5.format === 'rtf' && /Cut short/.test(r5.text ?? '') && r5.tasks === 1, r5);
  ok('... its notes said once, as an information notice', r5.msgs.length === 1 && r5.msgs[0][1] === 'info' && /^'Cut' was opened, but: /.test(r5.msgs[0][0]) && r5.again === 1, r5.msgs);

  // a .docx sent by DataOpen &A7E, as before
  const r6 = await ev(async () => {
    const t = window.__word();
    window.__msgs.length = 0;
    os.wimp.sendMessage('DataOpen', { path: 'RAM::RamDisc0.$.Report', filetype: 0xA7E }, { to: t });
    await window.__wait(() => window.__by('Report'));
    await window.__sleep(200);
    const d = window.__by('Report');
    return { docx: !!d, format: d?.format, text: d?.text, msgs: [...window.__msgs] };
  });
  ok('a .docx still opens as a .docx', r6.docx && r6.format === 'docx' && /A docx\./.test(r6.text ?? '') && !r6.msgs.length, r6);

  // a file of type &C32 that is not RTF: said as not an RTF file (the format it was opened as)
  const r7 = await ev(async () => {
    window.__msgs.length = 0;
    await os.filer.run('RAM::RamDisc0.$.Junk');
    await window.__wait(() => window.__msgs.length);
    return { msgs: [...window.__msgs], alive: window.__word()?.alive, open: !!window.__by('Junk') };
  });
  ok('a &C32 file that is not RTF: an error box in RTF\'s words, Letters carries on', r7.msgs.length === 1 && /^'Junk' could not be opened: it is not an RTF file\.$/.test(r7.msgs[0][0]) && r7.alive && !r7.open, r7);

  // (task 11) Save as from the window menu: the box asking .docx or RTF, then the Save box; RTF chosen for a .docx
  const g1 = await ev(async () => {
    const t = window.__word(), M = os.wimp.menus, d = window.__by('Report');
    window.__msgs.length = 0;
    d.view.type('More ');
    const at = d.win.workToScreen(100, 100);
    const m = d.win.menu({});
    M.open(m, at.x, at.y, { task: t });
    M._openSub(M.levels[0], m.items.findIndex((i) => i.text === 'Save as'), 'arrow');
    await window.__sleep(50);
    const a = d.saveAsBox(), w = a.win;
    const ic = w.iconByName('rtf').bbox, sc = w.workToScreen((ic.x0 + ic.x1) / 2, (ic.y0 + ic.y1) / 2);
    const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { inMenu: M.levels.some((l) => l.win === w), format: a.get('format'), title: w.title,
      at: { x: rc.left + sc.x * k, y: rc.top + sc.y * k } };
  });
  await page.mouse.click(g1.at.x, g1.at.y);          // (a real click on Rich Text)
  await page.waitForTimeout(80);
  Object.assign(g1, await ev(async () => {
    const M = os.wimp.menus, d = window.__by('Report');
    const a = d.saveAsBox(), w = a.win;
    const res = { picked: a.get('format') };
    w.emit('click', { icon: w.iconByName('button:Continue'), button: 'select' });
    await window.__sleep(100);
    const b = d.saveBox();
    res.box = { open: b.isOpen, inMenu: M.levels.some((l) => l.win === b), name: b.filename(), type: b.filetype };
    res.fmtOpen = w.isOpen;
    res.asked = [...os.wimp.windows].some((q) => q.isOpen && q.title === 'Save as RTF');
    b.setFilename('RAM::RamDisc0.$.Report/rtf');
    b.emit('click', { icon: b.icons[0], button: 'select' });
    await window.__wait(() => d.path?.endsWith('/rtf') && !d.saving);
    const st = os.vfs.stat('RAM::RamDisc0.$.Report/rtf');
    const bytes = st ? await os.vfs.readFile('RAM::RamDisc0.$.Report/rtf') : new Uint8Array(0);
    Object.assign(res, { type: st?.filetype, head: String.fromCharCode(...bytes.slice(0, 6)), ascii: bytes.every((c) => c < 128),
      body: String.fromCharCode(...bytes), now: d.format, wtitle: d.win.title, dirty: d.view.dirty, msgs: [...window.__msgs] });
    return res;
  }));
  ok('Save as opens the box asking .docx or RTF (the .docx chosen) as the menu\'s submenu', g1.inMenu && g1.format === 'docx' && g1.title === 'Save as', g1);
  ok('... RTF picked and Continue: the Save box with &C32 as a menu, nothing asked (nothing lost)', g1.picked === 'rtf' && g1.box.open
    && g1.box.inMenu && g1.box.type === 0xC32 && g1.box.name === 'RAM::RamDisc0.$.Report' && !g1.fmtOpen && !g1.asked, g1);
  ok('... OK writes ASCII RTF, type &C32; the window is RTF from then on, clean', g1.type === 0xC32 && g1.head === '{\\rtf1' && g1.ascii
    && /More A docx\./.test(g1.body) && g1.now === 'rtf' && g1.wtitle === 'Report/rtf' && !g1.dirty && !g1.msgs.length, g1);

  // F3 on a .docx RTF cannot hold all of: the question, Cancel writes nothing
  const ODD = await buildDocx({ 'word/document.xml': documentXml(p(r('before ') + '<w:r><w:foo/></w:r>' + r(' after'))) });
  await ev(async (a) => {
    os.vfs.writeFile('RAM::RamDisc0.$.Odd', new Uint8Array(a), { filetype: 0xA7E });
    await window.__word().word.open('RAM::RamDisc0.$.Odd');
    await window.__wait(() => window.__by('Odd'));
    window.__by('Odd').dw.view.focus();
    await window.__sleep(100);
  }, Array.from(ODD));
  await page.keyboard.press('F3');
  await page.waitForTimeout(100);
  const g2 = await ev(() => {
    const d = window.__by('Odd'), a = d.saveAsBox();
    const res = { open: a.isOpen, menu: os.wimp.menus.isOpen, format: a.get('format') };
    a.set('format', 'rtf');
    return res;
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const g3 = await ev(() => {
    const q = [...os.wimp.windows].filter((w) => w.isOpen && w.title === 'Save as RTF');
    const d = window.__by('Odd');
    return { n: q.length, text: q[0] ? q[0].icons.map((i) => i?.text ?? '').join(' ') : '', save: d.dw.boxes.get('saveas')?.isOpen ?? false };
  });
  ok('F3: the Save as box near the caret as a menu', g2.open && g2.menu && g2.format === 'docx', g2);
  ok('... RTF and Return: one question listing what RTF cannot store, before any Save box', g3.n === 1 && !g3.save
    && g3.text.includes("1 item can't be stored in RTF: other items (1).") && g3.text.includes('Cancel saves nothing.'), g3);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const g4 = await ev(() => {
    const d = window.__by('Odd');
    return { n: [...os.wimp.windows].filter((w) => w.isOpen && w.title === 'Save as RTF').length, save: d.dw.boxes.get('saveas')?.isOpen ?? false,
      format: d.format, path: d.path, files: os.vfs.list('RAM::RamDisc0.$').map((f) => f.name) };
  });
  ok('... Escape there (Cancel): nothing written, the window as it was', g4.n === 0 && !g4.save && g4.format === 'docx'
    && g4.path === 'RAM::RamDisc0.$.Odd' && !g4.files.some((n) => /^Odd./.test(n)), g4);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
