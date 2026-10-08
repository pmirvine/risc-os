// !Word's Save boxes and files already there, in the real desktop: a
// new document's Save box offers a name no file has (a second new
// document saved with Return does not overwrite the first: it gets
// Untitled2); OK onto a file that is there asks Replace / Cancel
// (Return and Escape are Cancel, the file and the window left as
// they were; Replace writes), but not onto the window's own file, a
// locked file or another open window's file (refused); Save a copy
// refuses another open window's file, holds the composing text, and
// asks before replacing even the window's own file, and onto a
// locked file says "'Locked' could not be saved: ..." as Save does.
// An input method's late commit after a Save is dropped only
// straight after the Save: the same text typed 1.5 s later, after a
// click or after an arrow key is kept. Quit while a close prompt's
// Save waits on the Save box brings the box forward, and its Replace
// question over it when that is open; a close request while Revert
// asks brings that question forward with a beep. Needs the disc
// built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const plain = await buildDocx({ 'word/document.xml': documentXml(p(r('First line.'))) });
const texts = async (bytes) => (await readDocx(new Uint8Array(bytes))).sections.flatMap((s) => s.blocks.map((b) => b.text));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (a) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const n of ['Base', 'Target', 'Other', 'Locked', 'Ime1', 'Ime2', 'Ime3', 'Rev']) {
      os.vfs.writeFile('RAM::RamDisc0.$.' + n, new Uint8Array(a), { filetype: 0xA7E });
    }
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__bytes = async (path) => Array.from(await os.vfs.readFile(path));
    window.__box = (d, text) => d.win.menu({}).items.find((i) => i.text === text).submenu();
    window.__replace = () => [...os.wimp.windows].find((w) => w.isOpen && w.iconByName?.('button:Replace'));
    window.__ok = (box) => box.emit('click', { icon: box.icons[0], button: 'select' });
    window.__race = (p) => Promise.race([p, window.__sleep(3000).then(() => 'hung')]);
    window.__same = async (path, bytes) => JSON.stringify(await window.__bytes(path)) === JSON.stringify(bytes);
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Base');   // (the Save box's directory)
  }, Array.from(plain));

  // ------------------------------------------------ a new document's name is free
  const n1 = await ev(async () => {
    const t = window.__word();
    const a = await t.word.new();
    const da = t.word.docs.find((x) => x.dw === a);
    da.view.type('first');
    const pa = da.save();
    await window.__frames(2);
    const boxA = window.__box(da, 'Save as');
    const res = { nameA: boxA.filename() };
    boxA.emit('key', { code: 13 });           // Return
    res.savedA = await window.__race(pa);
    res.bytesA = await window.__bytes('RAM::RamDisc0.$.Untitled');
    const b = await t.word.new();
    const db = t.word.docs.find((x) => x.dw === b);   // (A is 'Untitled' too now)
    res.leafB = db.leaf;
    db.view.type('second');
    const pb = db.save();
    await window.__frames(2);
    const boxB = window.__box(db, 'Save as');
    res.nameB = boxB.filename();
    boxB.emit('key', { code: 13 });
    res.savedB = await window.__race(pb);
    res.prompt = !!window.__replace();
    res.firstKept = await window.__same('RAM::RamDisc0.$.Untitled', res.bytesA);
    res.bytesB = os.vfs.exists('RAM::RamDisc0.$.Untitled2') ? await window.__bytes('RAM::RamDisc0.$.Untitled2') : [];
    delete res.bytesA;
    return res;
  });
  const tb = n1.bytesB.length ? await texts(n1.bytesB) : [];
  ok('a second new document saved with Return gets Untitled2, not the first one\'s file', n1.nameA === 'RAM::RamDisc0.$.Untitled'
    && n1.savedA && n1.leafB === 'Untitled' && n1.nameB === 'RAM::RamDisc0.$.Untitled2' && n1.savedB && !n1.prompt && n1.firstKept
    && tb[0] === 'second', { ...n1, bytesB: null, tb });

  // ------------------------------------------------ OK onto a file that is there
  const r1 = await ev(async () => {
    const d = window.__by('Base');
    d.view.type('mine ');
    const before = await window.__bytes('RAM::RamDisc0.$.Target');
    window.__tbefore = before;
    const box = window.__box(d, 'Save as');
    box.open({ x: 200, y: 200 });
    box.setFilename('RAM::RamDisc0.$.Target');
    window.__ok(box);
    await window.__frames(2);
    const q = window.__replace();
    const res = { asked: !!q, text: q && q.iconByName('message').text };
    q.emit('key', { code: 13 });              // Return: Cancel
    await window.__frames(2);
    res.afterReturn = { prompt: !!window.__replace(), same: await window.__same('RAM::RamDisc0.$.Target', before),
      dirty: d.view.dirty, path: d.path, boxOpen: box.isOpen, caret: os.wimp.caret?.window === box };
    window.__ok(box);
    await window.__frames(2);
    window.__replace().emit('key', { code: 27 });   // Escape: Cancel
    await window.__frames(2);
    res.afterEscape = { same: await window.__same('RAM::RamDisc0.$.Target', before), dirty: d.view.dirty, path: d.path };
    window.__ok(box);
    await window.__frames(2);
    const q2 = window.__replace();
    q2.emit('click', { icon: q2.iconByName('button:Replace'), button: 'select' });
    for (let i = 0; i < 40 && d.path !== 'RAM::RamDisc0.$.Target'; i++) await window.__sleep(25);
    res.replaced = { path: d.path, dirty: d.view.dirty, same: await window.__same('RAM::RamDisc0.$.Target', before),
      prompt: !!window.__replace(), msgs: [...window.__msgs] };
    // onto its own file again: no question
    d.view.type('again ');
    box.open({ x: 200, y: 200 });
    box.setFilename('RAM::RamDisc0.$.Target');
    window.__ok(box);
    await window.__frames(2);
    res.own = { prompt: !!window.__replace() };
    for (let i = 0; i < 40 && d.view.dirty; i++) await window.__sleep(25);
    res.own.dirty = d.view.dirty;
    // onto a locked file: no question, refused
    window.__msgs.length = 0;
    os.vfs.setAccess('RAM::RamDisc0.$.Locked', 8 | 3);
    d.view.type('locked ');
    box.open({ x: 200, y: 200 });
    box.setFilename('RAM::RamDisc0.$.Locked');
    window.__ok(box);
    await window.__sleep(50);
    res.locked = { prompt: !!window.__replace(), msgs: [...window.__msgs], dirty: d.view.dirty };
    box.close();
    return res;
  });
  ok('OK onto a file that is there asks Replace / Cancel', r1.asked && r1.text === "'Target' already exists. Replace it?", r1);
  ok('... Return is Cancel: the file untouched, the window dirty, the Save box open with the caret', !r1.afterReturn.prompt
    && r1.afterReturn.same && r1.afterReturn.dirty && r1.afterReturn.path === 'RAM::RamDisc0.$.Base' && r1.afterReturn.boxOpen
    && r1.afterReturn.caret, r1.afterReturn);
  ok('... Escape is Cancel too', r1.afterEscape.same && r1.afterEscape.dirty && r1.afterEscape.path === 'RAM::RamDisc0.$.Base', r1.afterEscape);
  ok('... Replace writes it and the window takes the name', r1.replaced.path === 'RAM::RamDisc0.$.Target' && !r1.replaced.dirty
    && !r1.replaced.same && !r1.replaced.prompt && !r1.replaced.msgs.length, r1.replaced);
  ok('OK onto the window\'s own file asks nothing', !r1.own.prompt && !r1.own.dirty, r1.own);
  ok('OK onto a locked file asks nothing: refused, said why', !r1.locked.prompt && r1.locked.msgs.length === 1
    && /locked/i.test(r1.locked.msgs[0]) && r1.locked.dirty, r1.locked);

  // ------------------------------------------------ Save a copy
  const c1 = await ev(async () => {
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Other');
    const d = window.__by('Target');
    window.__msgs.length = 0;
    const other = await window.__bytes('RAM::RamDisc0.$.Other');
    const box = window.__box(d, 'Save a copy');
    const res = { offered: box.filename() };
    box.open({ x: 220, y: 220 });
    box.setFilename('RAM::RamDisc0.$.Other');
    window.__ok(box);
    await window.__sleep(50);
    res.other = { prompt: !!window.__replace(), msgs: [...window.__msgs], same: await window.__same('RAM::RamDisc0.$.Other', other) };
    // the composing text goes into the copy
    window.__msgs.length = 0;
    d.view.compose('\u306d\u3053');
    box.setFilename('RAM::RamDisc0.$.CopyC');
    window.__ok(box);
    for (let i = 0; i < 40 && !os.vfs.exists('RAM::RamDisc0.$.CopyC'); i++) await window.__sleep(25);
    res.copy = await window.__bytes('RAM::RamDisc0.$.CopyC');
    res.after = { comp: d.view.composing, path: d.path, msgs: [...window.__msgs] };
    // over the window's own file: asks
    box.open({ x: 220, y: 220 });
    box.setFilename('RAM::RamDisc0.$.Target');
    window.__ok(box);
    await window.__frames(2);
    const q = window.__replace();
    res.ownAsks = !!q;
    if (q) q.emit('key', { code: 27 });
    await window.__frames(2);
    // onto a locked file: no question; refused as Save says it
    window.__msgs.length = 0;
    box.setFilename('RAM::RamDisc0.$.Locked');
    window.__ok(box);
    for (let i = 0; i < 40 && !window.__msgs.length; i++) await window.__sleep(25);
    res.locked = { prompt: !!window.__replace(), msgs: [...window.__msgs] };
    box.close();
    return res;
  });
  const ct = await texts(c1.copy);
  ok('Save a copy offers a full path (OK works)', c1.offered === 'RAM::RamDisc0.$.Target', c1.offered);
  ok('Save a copy over another open window\'s file is refused (no Replace question)', !c1.other.prompt && c1.other.msgs.length === 1
    && /open in another window/.test(c1.other.msgs[0]) && c1.other.same, c1.other);
  ok('Save a copy holds the composing text', ct[0].includes('\u306d\u3053') && c1.after.comp === null
    && c1.after.path === 'RAM::RamDisc0.$.Target' && !c1.after.msgs.length, { ct, after: c1.after });
  ok('Save a copy over the window\'s own file asks Replace first', c1.ownAsks, c1);
  ok('Save a copy onto a locked file: "\'Locked\' could not be saved: ..." as Save says it', !c1.locked.prompt
    && c1.locked.msgs.length === 1 && /^'Locked' could not be saved: .*locked/i.test(c1.locked.msgs[0]), c1.locked);

  // ------------------------------------------------ the late commit: only straight after the Save
  {
    const cdp = await page.context().newCDPSession(page);
    const late = async (leaf, between) => {
      await ev(async (leaf) => {
        const t = window.__word();
        const dw = await t.word.open('RAM::RamDisc0.$.' + leaf);
        const h = window.__by(leaf).view;
        h.setSelection({ id: h.layout.items[0].id, off: 0 });
        dw.view.focus();
        await window.__frames(2);
      }, leaf);
      await cdp.send('Input.imeSetComposition', { text: '\u306b\u307b', selectionStart: 2, selectionEnd: 2 });
      await ev(async (leaf) => {
        const d = window.__by(leaf);
        d.dw.win.menu({}).items.find((i) => i.text === 'Save').action();
        for (let i = 0; i < 40 && (d.saving || d.view.dirty); i++) await window.__sleep(20);
      }, leaf);
      await between();
      await cdp.send('Input.insertText', { text: '\u306b\u307b' });
      return ev(async (leaf) => { await window.__frames(2); return window.__by(leaf).view.lines()[0]; }, leaf);
    };
    const count = (s) => (s.match(/\u306b\u307b/g) || []).length;
    const l1 = await late('Ime1', () => page.waitForTimeout(1500));
    ok('the same text typed 1.5 s after the Save is kept', count(l1) === 2, l1);
    const l2 = await late('Ime2', async () => {
      const at = await ev(() => {
        const d = window.__by('Ime2'), w = d.win, c = d.dw.view.caretRect();
        const s = w.workToScreen(c.x + 1, c.y + c.h / 2);
        const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
        return { x: rc.left + s.x * k, y: rc.top + s.y * k };
      });
      await page.mouse.click(at.x, at.y);
    });
    ok('the same text typed after a click in the window is kept', count(l2) === 2, l2);
    const l3 = await late('Ime3', () => page.keyboard.press('ArrowRight'));
    ok('the same text typed after an arrow key is kept', count(l3) === 2, l3);
  }

  // ------------------------------------------------ Quit while a close prompt's Save waits on the Save box
  const m4 = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) d.dw.close();
    const u = await t.word.new();
    const d = window.__by(u.leaf);
    d.view.type('waiting');
    const closing = d.requestClose();
    await window.__frames(2);
    const w = [...os.wimp.windows].find((q) => q.isOpen && q.iconByName?.('button:Save'));
    w.emit('click', { icon: w.iconByName('button:Save'), button: 'select' });
    await window.__frames(2);
    const box = window.__box(d, 'Save as');
    const res = { boxOpen: box.isOpen };
    let fronts = 0;
    const was = box.bringToFront.bind(box);
    box.bringToFront = () => { fronts++; was(); };
    const quitting = t.word.quit();
    await window.__frames(2);
    res.fronts = fronts;
    res.quitPrompts = [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Discard') && !q.iconByName('button:Save')).length;
    box.close();                               // the Save box closed: not saved
    res.closed = await window.__race(closing);
    await window.__frames(3);
    const qp = [...os.wimp.windows].find((q) => q.isOpen && q.iconByName?.('button:Discard') && !q.iconByName('button:Save'));
    res.askedAfter = !!qp;
    if (qp) qp.emit('click', { icon: qp.iconByName('button:Cancel'), button: 'select' });
    res.quit = await window.__race(quitting);
    res.alive = t.alive;
    return res;
  });
  ok('Quit while a close prompt\'s Save waits on the Save box: the box comes forward, no second prompt', m4.boxOpen && m4.fronts >= 1
    && m4.quitPrompts === 0, m4);
  ok('... the box closed unsaved: the quit prompt asks then (Cancel keeps Word)', m4.closed === false && m4.askedAfter
    && m4.quit === false && m4.alive, m4);

  // ------------------------------------------------ a close request while Revert asks
  const m5 = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) d.dw.close();
    await t.word.open('RAM::RamDisc0.$.Rev');
    const u = await t.word.new();
    const rv = window.__by('Rev'), other = window.__by(u.leaf);
    rv.view.type('changed ');
    other.view.type('x');
    const reverting = rv.revert();
    await window.__frames(2);
    const qw = [...os.wimp.windows].find((w) => w.isOpen && w.task === t && w.icons.some((i) => /Discard changes to 'Rev'/.test(i.text ?? '')));
    const res = { query: !!qw };
    let beeps = 0, fronts = 0;
    const beep = os.wimp.beep;
    os.wimp.beep = () => { beeps++; };
    const was = qw.bringToFront.bind(qw);
    qw.bringToFront = () => { fronts++; was(); };
    res.close = await window.__race(other.requestClose());
    os.wimp.beep = beep;
    res.beeps = beeps;
    res.fronts = fronts;
    res.closePrompts = [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Save')).length;
    qw.emit('key', { code: 27 });            // Cancel
    res.reverted = await window.__race(reverting);
    res.prompt = t.word.prompt;
    return res;
  });
  ok('a close request while Revert asks: that question comes forward with a beep, no second prompt', m5.query && m5.close === false
    && m5.beeps === 1 && m5.fronts === 1 && m5.closePrompts === 0, m5);
  ok('... Revert cancelled, nothing left set', m5.reverted === false && m5.prompt === null, m5);

  // ------------------------------------------------ Quit while the Replace question of a close prompt's Save is open
  const m6 = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) d.dw.close();
    const before = await window.__bytes('RAM::RamDisc0.$.Other');
    const u = await t.word.new();
    const d = window.__by(u.leaf);
    d.view.type('replacing');
    const closing = d.requestClose();
    await window.__frames(2);
    const w = [...os.wimp.windows].find((q) => q.isOpen && q.iconByName?.('button:Save'));
    w.emit('click', { icon: w.iconByName('button:Save'), button: 'select' });
    await window.__frames(2);
    const box = window.__box(d, 'Save as');
    box.setFilename('RAM::RamDisc0.$.Other');
    window.__ok(box);
    await window.__frames(2);
    const q = window.__replace();
    const res = { asked: !!q };
    const quitting = t.word.quit();
    await window.__frames(2);
    const st = os.wimp.stack;
    res.questionOnTop = !!q && st.indexOf(q) > st.indexOf(box) && st.indexOf(box) >= 0;
    res.quitPrompts = [...os.wimp.windows].filter((x) => x.isOpen && x.iconByName?.('button:Discard') && !x.iconByName('button:Save')).length;
    q.emit('click', { icon: q.iconByName('button:Replace'), button: 'select' });
    res.closed = await window.__race(closing);
    res.replaced = !(await window.__same('RAM::RamDisc0.$.Other', before));
    await window.__frames(3);
    res.quit = await window.__race(quitting);
    res.alive = t.alive;
    return res;
  });
  ok('Quit while the Replace question is open: the question comes forward over the Save box', m6.asked && m6.questionOnTop
    && m6.quitPrompts === 0, m6);
  ok('... Replace there saves; the close ends and nothing is left to ask: Word quits', m6.closed === true && m6.replaced
    && m6.quit === true && m6.alive === false, m6);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
