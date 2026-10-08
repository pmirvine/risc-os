// !Word's untitled documents and its Save / Save as / Save a copy in
// the real desktop: a new untitled document (the test hook's
// newUntitled: the icon bar gets it later), its name and Info; Save
// on it opens the Save box with a full path ready (OK works) and
// renames the window; Save on a titled document writes it in place;
// typing during a save keeps the star (undo back is clean); locked,
// read-only and bad names are reported and change nothing; Save as
// onto another open document is refused; Save a copy changes nothing
// in the window; an input method's composing text is saved; the Save
// box's icon dragged to a directory display saves and renames; the
// menu and its boxes (made once). Needs the disc built by
// tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';
import { assertSameDoc } from './docx-compare.mjs';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const plain = await buildDocx({ 'word/document.xml': documentXml(p(r('First line.')) + p(r('Second line.'))) });
const other = await buildDocx({ 'word/document.xml': documentXml(p(r('The other one.'))) });
const texts = async (bytes) => (await readDocx(new Uint8Array(bytes))).sections.flatMap((s) => s.blocks.map((b) => b.text));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async ([a, b]) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;           // (the Save box reports through the Wimp)
    os.vfs.writeFile('RAM::RamDisc0.$.Plain', new Uint8Array(a), { filetype: 0xA7E });
    os.vfs.writeFile('RAM::RamDisc0.$.Other', new Uint8Array(b), { filetype: 0xA7E });
    os.vfs.mkdir('RAM::RamDisc0.$.Sub');
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__bytes = async (path) => Array.from(await os.vfs.readFile(path));
    window.__item = (d, text) => d.win.menu({}).items.find((i) => i.text === text);
    window.__box = (d, text) => window.__item(d, text).submenu();
  }, [Array.from(plain), Array.from(other)]);

  // Word started with no file: just its icon
  await ev(async () => {
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
  });

  // ------------------------------------------------ a new untitled document
  const n1 = await ev(async () => {
    const t = window.__word();
    await t.word.newUntitled();
    await window.__frames(3);
    const d = t.word.docs[0];
    const info = window.__box(d, 'Info');
    return { title: d.win.title, leaf: d.leaf, path: d.path, untitled: d.untitled, dirty: d.view.dirty,
      keys: t.word.keys, info: info.icons.map((i) => i.text).join('|'), lines: d.view.lines(),
      items: d.win.menu({}).items.map((i) => i.text), open: d.win.isOpen };
  });
  ok('a new document is called Untitled, is clean and has no path', n1.title === 'Untitled' && n1.leaf === 'Untitled'
    && n1.path === null && n1.untitled && !n1.dirty && n1.open && n1.lines.length === 1 && n1.lines[0] === '', n1);
  ok('its app.docs key is a synthetic untitled:N one', n1.keys.length === 1 && /^untitled:\d+$/.test(n1.keys[0]), n1.keys);
  ok('its Info box names it, and says nothing stale', /Untitled/.test(n1.info) && !/read-only/.test(n1.info), n1.info);
  ok('window menu: Save, Save as, Revert, Save a copy, Info, Edit, Format, Zoom, New, Close',
    JSON.stringify(n1.items) === '["Save","Save as","Revert","Save a copy","Info","Edit","Format","Zoom","New","Close"]', n1.items);

  const n2 = await ev(async () => {
    const t = window.__word();
    await t.word.newUntitled();
    const d = window.__by('Untitled');
    d.view.type('Hello');
    await window.__frames(2);
    return { titles: t.word.docs.map((x) => x.win.title).sort(), keys: t.word.keys };
  });
  ok('a second one is Untitled 2; typing marks the first with *', JSON.stringify(n2.titles) === '["Untitled *","Untitled 2"]'
    && new Set(n2.keys).size === 2, n2);

  // ------------------------------------------------ Save on an untitled document: the Save box
  const s1 = await ev(async () => {
    const d = window.__by('Untitled');
    const p = d.save();
    await window.__frames(2);
    const box = window.__box(d, 'Save as');
    const res = { open: box.isOpen, filename: box.filename(), filetype: box.filetype };
    // closed without saving: false, still dirty
    box.close();
    res.result = await p;
    res.dirty = d.view.dirty;
    res.title = d.win.title;
    return res;
  });
  ok('Save on an untitled document opens the Save box with a full path on the hard disc',
    s1.open && s1.filename === 'ADFS::HardDisc4.$.Untitled' && s1.filetype === 0xA7E, s1);
  ok('closing the Save box saves nothing: save() is false, still dirty', s1.result === false && s1.dirty && s1.title === 'Untitled *', s1);

  // once a document has been opened, the Save box offers its directory
  const s2 = await ev(async () => {
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Plain');
    await t.word.newUntitled();
    const d = window.__by('Untitled 3');
    d.view.type('Typed in a new one');
    const p = d.save();
    await window.__frames(2);
    const box = window.__box(d, 'Save as');
    const res = { filename: box.filename(), open: box.isOpen };
    box.emit('click', { icon: box.icons[0], button: 'select' });
    res.result = await p;
    await window.__frames(2);
    const st = os.vfs.stat('RAM::RamDisc0.$.Untitled3');
    res.type = st?.filetype;
    res.bytes = st ? await window.__bytes('RAM::RamDisc0.$.Untitled3') : null;
    const h = window.__by('Untitled3');
    res.title = h?.win.title;
    res.path = h?.path;
    res.untitled = h?.untitled;
    res.dirty = h?.view.dirty;
    res.keys = t.word.keys;
    res.boxName = window.__box(h, 'Save as').filename();
    res.copy = Array.from(await h.saveBytes());
    res.info = window.__box(h, 'Info').icons.map((i) => i.text).join('|');
    res.msgs = [...window.__msgs];
    return res;
  });
  ok('the Save box offers the directory of the last document opened', s2.filename === 'RAM::RamDisc0.$.Untitled3', s2.filename);
  ok('OK saves it: a file of type &A7E; save() is true', s2.result === true && s2.type === 0xA7E && !s2.msgs.length, s2);
  ok('the window takes the new name, without *', s2.title === 'Untitled3' && s2.path === 'RAM::RamDisc0.$.Untitled3'
    && s2.untitled === false && s2.dirty === false, s2);
  ok('app.docs is keyed by the new path; the Save box and Info have it', s2.keys.includes('ram::ramdisc0.$.untitled3')
    && !s2.keys.some((k) => k === 'untitled:3') && s2.boxName === 'RAM::RamDisc0.$.Untitled3' && /Untitled3/.test(s2.info), s2);
  try {
    assertSameDoc(await readDocx(new Uint8Array(s2.bytes)), await readDocx(new Uint8Array(s2.copy)), 'saved new document');
    const tx = await texts(s2.bytes);
    ok('the saved file reads back equal, with the typed text', tx[0] === 'Typed in a new one', tx);
  } catch (e) {
    ok('the saved file reads back equal, with the typed text', false, e.message.slice(0, 600));
  }

  // ------------------------------------------------ Save on a titled document
  const s3 = await ev(async () => {
    const d = window.__by('Plain');
    d.view.setSelection(d.view.layout.docStart());
    d.view.type('Saved ');
    const before = d.win.title;
    const res = { before, result: await d.save() };
    res.title = d.win.title;
    res.dirty = d.view.dirty;
    res.path = d.path;
    res.type = os.vfs.stat('RAM::RamDisc0.$.Plain').filetype;
    res.bytes = await window.__bytes('RAM::RamDisc0.$.Plain');
    res.msgs = [...window.__msgs];
    return res;
  });
  const t3 = await texts(s3.bytes);
  ok('Save on a titled document writes it in place and clears the *', s3.before === 'Plain *' && s3.result === true
    && s3.title === 'Plain' && !s3.dirty && s3.path === 'RAM::RamDisc0.$.Plain' && s3.type === 0xA7E
    && t3[0] === 'Saved First line.' && !s3.msgs.length, { s3: { ...s3, bytes: null }, t3 });

  // typing during the save: the state written is the one saved
  const s4 = await ev(async () => {
    const d = window.__by('Plain');
    d.view.type('A');
    const id0 = d.stateId;
    const p = d.save();
    d.view.type('B');                     // (while writeDocx is running)
    const res = { result: await p };
    res.dirty = d.view.dirty;
    res.title = d.win.title;
    res.bytes = await window.__bytes('RAM::RamDisc0.$.Plain');
    d.view.press('undo');
    res.undone = { dirty: d.view.dirty, title: d.win.title, line: d.view.lines()[0], moved: d.stateId !== id0 };
    return res;
  });
  const t4 = await texts(s4.bytes);
  ok('typing during a save keeps the *; the file has the state written', s4.result === true && s4.dirty
    && s4.title === 'Plain *' && t4[0] === 'Saved AFirst line.', { s4: { ...s4, bytes: null }, t4 });
  ok('undoing back to the state written is clean', !s4.undone.dirty && s4.undone.title === 'Plain'
    && s4.undone.line === 'Saved AFirst line.', s4.undone);

  // an input method's composing text is saved (it is committed first)
  const s5 = await ev(async () => {
    const d = window.__by('Plain');
    d.view.compose('ねこ');
    const res = { composing: d.view.composing, result: await d.save() };
    res.after = d.view.composing;
    res.dirty = d.view.dirty;
    res.bytes = await window.__bytes('RAM::RamDisc0.$.Plain');
    return res;
  });
  const t5 = await texts(s5.bytes);
  ok('composing text is put in the document before saving', s5.composing === 'ねこ' && s5.result === true
    && s5.after === null && !s5.dirty && t5[0] === 'Saved AねこFirst line.', { s5: { ...s5, bytes: null }, t5 });

  // ------------------------------------------------ failures: reported, nothing marked
  const f1 = await ev(async () => {
    const d = window.__by('Plain');
    const res = {};
    const attempt = async (name, fn) => {
      window.__msgs.length = 0;
      d.view.type('x');
      const id = d.stateId;
      const r = await fn();
      res[name] = { result: r, msgs: [...window.__msgs], dirty: d.view.dirty, title: d.win.title, path: d.path,
        same: d.stateId === id };
    };
    const before = await window.__bytes('RAM::RamDisc0.$.Plain');
    os.vfs.setAccess('RAM::RamDisc0.$.Plain', 8 | 3);          // locked
    await attempt('locked', () => d.save());
    res.unchanged = JSON.stringify(before) === JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Plain'));
    os.vfs.setAccess('RAM::RamDisc0.$.Plain', 3);
    os.vfs.ram.readonly = true;
    await attempt('readonly', () => d.save());
    os.vfs.ram.readonly = false;
    await attempt('badLeaf', () => d.saveAs('RAM::RamDisc0.$.bad*name'));
    await attempt('noDir', () => d.saveAs('RAM::RamDisc0.$.Nowhere.File'));
    return res;
  });
  for (const [k, v] of Object.entries(f1)) {
    if (k === 'unchanged') continue;
    ok(`a failed save (${k}) is reported with the name and stays dirty`, v.result === false && v.msgs.length === 1
      && /Plain|bad\*name|File/.test(v.msgs[0]) && v.dirty && v.title === 'Plain *' && v.path === 'RAM::RamDisc0.$.Plain'
      && v.same, v);
  }
  ok('a locked file is left as it was', f1.unchanged, f1.unchanged);
  ok('the locked message says why', /locked/i.test(f1.locked.msgs[0] ?? ''), f1.locked.msgs);

  // ------------------------------------------------ Save as onto another open document
  const a1 = await ev(async () => {
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Other');
    const d = window.__by('Plain');
    window.__msgs.length = 0;
    const before = await window.__bytes('RAM::RamDisc0.$.Other');
    const res = { result: await d.saveAs('ram::ramdisc0.$.OTHER') };
    res.msgs = [...window.__msgs];
    res.path = d.path;
    res.dirty = d.view.dirty;
    res.same = JSON.stringify(before) === JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Other'));
    // and through the Save box: refused too
    window.__msgs.length = 0;
    const box = window.__box(d, 'Save as');
    box.icons[1].setText('RAM::RamDisc0.$.Other');
    box.emit('click', { icon: box.icons[0], button: 'select' });
    for (let i = 0; i < 40 && !window.__msgs.length; i++) await window.__sleep(25);
    res.boxMsgs = [...window.__msgs];
    res.boxPath = d.path;
    res.same2 = JSON.stringify(before) === JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Other'));
    // its own path is fine
    window.__msgs.length = 0;
    res.own = await d.saveAs('RAM::RamDisc0.$.Plain');
    res.ownDirty = d.view.dirty;
    res.ownMsgs = [...window.__msgs];
    return res;
  });
  ok('Save as onto a document open in another window is refused, with a message', a1.result === false
    && a1.msgs.length === 1 && /Other/.test(a1.msgs[0]) && /open/.test(a1.msgs[0]) && a1.path === 'RAM::RamDisc0.$.Plain'
    && a1.dirty && a1.same, a1);
  ok('also from the Save box', a1.boxMsgs.length === 1 && /open/.test(a1.boxMsgs[0]) && a1.boxPath === 'RAM::RamDisc0.$.Plain'
    && a1.same2, a1);
  ok('Save as onto its own path is fine', a1.own === true && !a1.ownDirty && !a1.ownMsgs.length, a1);

  // Save as to a new name: renamed; the old name is free again
  const a2 = await ev(async () => {
    const t = window.__word();
    const d = window.__by('Plain');
    d.view.type('y');
    const res = { result: await d.saveAs('RAM::RamDisc0.$.Renamed') };
    const h = window.__by('Renamed');
    res.title = h?.win.title;
    res.path = h?.path;
    res.keys = t.word.keys;
    res.box = window.__box(h, 'Save as').filename();
    await t.word.open('RAM::RamDisc0.$.Plain');
    res.reopened = t.word.docs.filter((x) => x.leaf === 'Plain').length;
    return res;
  });
  ok('Save as renames the window, its key and its Save box', a2.result === true && a2.title === 'Renamed'
    && a2.path === 'RAM::RamDisc0.$.Renamed' && a2.keys.includes('ram::ramdisc0.$.renamed')
    && !a2.keys.includes('ram::ramdisc0.$.plain') && a2.box === 'RAM::RamDisc0.$.Renamed' && a2.reopened === 1, a2);

  // ------------------------------------------------ Save a copy: the window is left as it was
  const c1 = await ev(async () => {
    const d = window.__by('Renamed');
    d.view.type('z');
    window.__msgs.length = 0;
    const box = window.__box(d, 'Save a copy');
    const res = { filename: box.filename(), sameBox: box !== window.__box(d, 'Save as') };
    box.icons[1].setText('RAM::RamDisc0.$.Copy');
    box.emit('click', { icon: box.icons[0], button: 'select' });
    for (let i = 0; i < 40 && !os.vfs.exists('RAM::RamDisc0.$.Copy'); i++) await window.__sleep(25);
    await window.__sleep(50);
    res.type = os.vfs.stat('RAM::RamDisc0.$.Copy')?.filetype;
    res.title = d.win.title;
    res.path = d.path;
    res.dirty = d.view.dirty;
    res.keys = window.__word().word.keys;
    res.saveAsName = window.__box(d, 'Save as').filename();
    res.msgs = [...window.__msgs];
    return res;
  });
  ok('Save a copy writes a copy and leaves the window as it was', c1.filename === 'RAM::RamDisc0.$.Renamed' && c1.sameBox
    && c1.type === 0xA7E && c1.title === 'Renamed *' && c1.path === 'RAM::RamDisc0.$.Renamed' && c1.dirty
    && !c1.keys.includes('ram::ramdisc0.$.copy') && c1.saveAsName === 'RAM::RamDisc0.$.Renamed' && !c1.msgs.length, c1);

  // ------------------------------------------------ drag the Save box's icon to a directory display
  const g0 = await ev(async () => {
    const t = window.__word();
    const dw = await t.word.newUntitled();
    // (the directory display in front of the new document's window)
    os.filer.openDir('RAM::RamDisc0.$.Sub', { x: 700, y: 120, w: 300, h: 200 });
    await window.__sleep(300);
    const d = window.__by(dw.leaf);
    d.view.type('Dragged');
    window.__drag = d.save();
    await window.__frames(3);
    const box = window.__box(d, 'Save as');
    window.__dragged = box.filename().split('.').pop();   // (a free name)
    const ic = box.icons[2], c = ic.bbox;
    const s = box.workToScreen((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
    const fw = [...os.wimp.windows].find((w) => w._filerDir === 'RAM::RamDisc0.$.Sub' && w.isOpen);
    const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    const cl = (x, y) => ({ x: rc.left + x * k, y: rc.top + y * k });
    return { leaf: d.leaf, from: cl(s.x, s.y), to: cl(fw.x + fw.w / 2, fw.y + fw.h / 2), open: box.isOpen };
  });
  await page.mouse.move(g0.from.x, g0.from.y);
  await page.mouse.down();
  await page.mouse.move(g0.from.x + 20, g0.from.y + 20, { steps: 4 });
  await page.mouse.move(g0.to.x, g0.to.y, { steps: 10 });
  await page.mouse.up();
  const g1 = await ev(async () => {
    const res = { result: await Promise.race([window.__drag, window.__sleep(3000).then(() => 'timeout')]) };
    const leaf = window.__dragged;
    const path = `RAM::RamDisc0.$.Sub.${leaf}`;
    res.type = os.vfs.stat(path)?.filetype;
    const d = window.__word().word.docs.find((x) => x.path === path);
    res.title = d?.win.title;
    res.path = d?.path;
    res.dirty = d?.view.dirty;
    res.box = d && window.__box(d, 'Save as').filename();
    res.msgs = [...window.__msgs];
    return res;
  });
  ok('dragging the Save box icon to a directory display saves it there and renames the window',
    g0.open && g1.result === true && g1.type === 0xA7E && g1.title === g1.path?.split('.').pop() && g1.dirty === false
    && /^RAM::RamDisc0\.\$\.Sub\.Untitled\d*$/.test(g1.path ?? '') && g1.box === g1.path && !g1.msgs.length, { g0, g1 });

  // ------------------------------------------------ the menu's boxes are made once
  const m1 = await ev(async () => {
    const t = window.__word(), M = os.wimp.menus;
    const d = window.__by('Renamed');
    const m = d.win.menu({});
    const at = d.win.workToScreen(100, 100);
    M.open(m, at.x, at.y, { task: t });
    const lv = M.levels[0];
    const names = m.items.map((i) => i.text);
    const out = [];
    for (let i = 0; i < 40; i++) {
      for (const n of ['Save as', 'Save a copy', 'Info']) M._openSub(lv, names.indexOf(n), 'arrow');
      if (i === 0 || i === 39) out.push([t.windows.size, document.querySelectorAll('*').length]);
    }
    M.close();
    return out;
  });
  ok('40 hovers over Save as, Save a copy and Info make no new windows', m1[0][0] === m1[1][0] && m1[1][1] - m1[0][1] < 50, m1);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
