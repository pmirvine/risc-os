// !Word's close prompt and Revert in the real desktop: closing a
// clean document closes it at once; a document with changes asks
// Save / Discard / Cancel (WimpLib Ui/SaveQuery: buttons by icon
// name, Return = Save, Escape and its close icon = Cancel, one at a
// time); Save writes then closes (an untitled one opens the Save box
// and the window stays until it is saved); Discard closes and leaves
// the file as it was; the Close menu item asks the same. Revert
// reloads a clean document at once, asks before throwing changes
// away, keeps the window's place, zoom and ruler, empties the undo
// history, is shaded for an untitled document, and keeps the old
// document when the file has gone or is not a .docx. Saves of one
// window run one after another; one pending Save per window; the
// Save a copy box follows a rename; the Save as box shows the
// canonical path; 30 prompt cycles leak nothing. Needs the disc
// built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const plain = await buildDocx({ 'word/document.xml': documentXml(p(r('First line.')) + p(r('Second line.'))) });
const changed = await buildDocx({ 'word/document.xml': documentXml(p(r('Changed on disc.'))) });
const texts = async (bytes) => (await readDocx(new Uint8Array(bytes))).sections.flatMap((s) => s.blocks.map((b) => b.text));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
// a button of the prompt, clicked with the real mouse
const clickButton = async (text) => {
  const at = await ev((t) => {
    const w = [...os.wimp.windows].find((q) => q.isOpen && q.iconByName?.('button:' + t));
    if (!w) return null;
    const c = w.iconByName('button:' + t).bbox;
    const s = w.workToScreen((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
    const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k };
  }, text);
  if (!at) throw new Error('no button ' + text);
  await page.mouse.click(at.x, at.y);
  await ev(() => window.__frames(3));
};
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async ([a, b]) => {
    window.__msgs = [];
    window.__queries = [];
    window.__answer = 'Cancel';
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    globalThis.__riscos.query = (o) => { window.__queries.push({ message: o.message, buttons: o.buttons }); return Promise.resolve(window.__answer); };
    os.vfs.writeFile('RAM::RamDisc0.$.Plain', new Uint8Array(a), { filetype: 0xA7E });
    window.__plain = a;
    window.__changed = b;
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__bytes = async (path) => Array.from(await os.vfs.readFile(path));
    window.__item = (d, text) => d.win.menu({}).items.find((i) => i.text === text);
    window.__box = (d, text) => window.__item(d, text).submenu();
    window.__prompts = () => [...os.wimp.windows].filter((q) => q.iconByName?.('button:Save') && q.iconByName('button:Discard'));
    window.__open = async () => {
      const t = window.__word();
      await t.word.open('RAM::RamDisc0.$.Plain');
      await window.__frames(2);
      return window.__by('Plain');
    };
  }, [Array.from(plain), Array.from(changed)]);
  await ev(async () => {
    window.__base = { windows: os.wimp.windows.size, tasks: os.wimp.tasks.filter((t) => t.alive).length };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
  });

  // ------------------------------------------------ closing a clean document
  const c0 = await ev(async () => {
    const d = await window.__open();
    d.win.requestClose();
    await window.__frames(2);
    return { docs: window.__word().word.docs.length, prompts: window.__prompts().length, closed: d.closed };
  });
  ok('the close icon on a clean document closes it at once', c0.docs === 0 && c0.prompts === 0 && c0.closed === true, c0);

  // ------------------------------------------------ a document with changes: the prompt
  const c1 = await ev(async () => {
    const d = await window.__open();
    d.view.type('X');
    d.win.requestClose();
    await window.__frames(2);
    const ps = window.__prompts();
    const w = ps[0];
    const prompt = window.__word().word.prompt;
    return { n: ps.length, open: w?.isOpen, texts: w?.icons.filter(Boolean).map((i) => i.text),
      names: w?.icons.filter((i) => i?.name).map((i) => i.name), prompt: prompt && { leaf: prompt.leaf, buttons: prompt.buttons },
      title: d.win.title };
  });
  ok('closing a document with changes asks, naming it', c1.n === 1 && c1.open && c1.texts.some((t) => /Plain/.test(t))
    && c1.prompt?.leaf === 'Plain' && c1.title === 'Plain *', c1);
  ok('the prompt has Save, Discard and Cancel buttons by icon name', ['button:Save', 'button:Discard', 'button:Cancel']
    .every((n) => c1.names?.includes(n)) && JSON.stringify(c1.prompt?.buttons) === '["Save","Discard","Cancel"]', c1);
  await clickButton('Cancel');
  const c2 = await ev(async () => {
    const d = window.__by('Plain');
    return { open: d?.win.isOpen, title: d?.win.title, line: d?.view.lines()[0], prompts: window.__prompts().length,
      prompt: window.__word().word.prompt };
  });
  ok('Cancel keeps the window and the changes; the prompt is gone', c2.open && c2.title === 'Plain *'
    && c2.line === 'XFirst line.' && c2.prompts === 0 && !c2.prompt, c2);

  // two clicks on the close icon: one prompt
  const c3 = await ev(async () => {
    const d = window.__by('Plain');
    d.win.requestClose();
    d.win.requestClose();
    d.requestClose();
    await window.__frames(2);
    return { prompts: window.__prompts().length };
  });
  ok('clicking the close icon again while it asks opens no second prompt', c3.prompts === 1, c3);
  await page.keyboard.press('Escape');
  const c4 = await ev(async () => {
    await window.__frames(3);
    const d = window.__by('Plain');
    return { open: d?.win.isOpen, title: d?.win.title, prompts: window.__prompts().length };
  });
  ok('Escape in the prompt is Cancel', c4.open && c4.title === 'Plain *' && c4.prompts === 0, c4);

  // the prompt's own close icon is Cancel
  const c5 = await ev(async () => {
    const d = window.__by('Plain');
    d.win.requestClose();
    await window.__frames(2);
    window.__prompts()[0].requestClose();
    await window.__frames(3);
    return { open: d.win.isOpen, title: d.win.title, prompts: window.__prompts().length, all: [...os.wimp.windows].filter((q) => q.iconByName?.('button:Save')).length };
  });
  ok('closing the prompt window is Cancel; it is deleted', c5.open && c5.title === 'Plain *' && c5.prompts === 0 && c5.all === 0, c5);

  // the Close menu item asks the same
  const c6 = await ev(async () => {
    const d = window.__by('Plain');
    window.__item(d, 'Close').action();
    await window.__frames(2);
    return { prompts: window.__prompts().length, leaf: window.__word().word.prompt?.leaf };
  });
  ok('the Close menu item asks too', c6.prompts === 1 && c6.leaf === 'Plain', c6);

  // Discard: closed, the file as it was
  await clickButton('Discard');
  const c7 = await ev(async () => ({ docs: window.__word().word.docs.length, prompts: window.__prompts().length,
    same: JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Plain')) === JSON.stringify(window.__plain), msgs: [...window.__msgs] }));
  ok('Discard closes it and leaves the file as it was', c7.docs === 0 && c7.prompts === 0 && c7.same && !c7.msgs.length, c7);

  // Save (Return): written, then closed
  await ev(async () => {
    const d = await window.__open();
    d.view.type('Saved ');
    d.win.requestClose();
    await window.__frames(2);
  });
  await page.keyboard.press('Enter');
  const c8 = await ev(async () => {
    for (let i = 0; i < 40 && window.__word().word.docs.length; i++) await window.__sleep(25);
    return { docs: window.__word().word.docs.length, bytes: await window.__bytes('RAM::RamDisc0.$.Plain'), msgs: [...window.__msgs] };
  });
  const t8 = await texts(c8.bytes);
  ok('Return in the prompt is Save: the file is written, then the window closes', c8.docs === 0 && t8[0] === 'Saved First line.'
    && !c8.msgs.length, { c8: { ...c8, bytes: null }, t8 });

  // ------------------------------------------------ Save on an untitled document: the Save box
  const u1 = await ev(async () => {
    const t = window.__word();
    const dw = await t.word.newUntitled();
    const d = window.__by(dw.leaf);
    d.view.type('New text');
    d.requestClose();
    await window.__frames(2);
    window.__u = d.leaf;
    return { leaf: d.leaf, prompts: window.__prompts().length };
  });
  await clickButton('Save');
  const u2 = await ev(async () => {
    const d = window.__by(window.__u);
    const box = d && window.__box(d, 'Save as');
    const res = { open: d?.win.isOpen, box: box?.isOpen, filename: box?.filename(), prompts: window.__prompts().length };
    box.close();                          // (the Save box closed without saving)
    await window.__frames(3);
    res.after = { open: d.win.isOpen, title: d.win.title, dirty: d.view.dirty, prompt: window.__word().word.prompt };
    return res;
  });
  ok('Save on an untitled document opens the Save box; the window stays', u1.prompts === 1 && u2.open && u2.box
    && /^RAM::RamDisc0\.\$\.Untitled\d*$/.test(u2.filename ?? '') && u2.prompts === 0, { u1, u2 });
  ok('closing the Save box without saving keeps the window and its changes', u2.after.open && u2.after.dirty
    && / \*$/.test(u2.after.title) && !u2.after.prompt, u2.after);
  await ev(async () => {
    const d = window.__by(window.__u);
    d.requestClose();
    await window.__frames(2);
  });
  await clickButton('Save');
  const u3 = await ev(async () => {
    const d = window.__by(window.__u);
    const box = window.__box(d, 'Save as');
    box.setFilename('RAM::RamDisc0.$.FromPrompt');
    box.emit('click', { icon: box.icons[0], button: 'select' });
    for (let i = 0; i < 40 && window.__word().word.docs.length; i++) await window.__sleep(25);
    const st = os.vfs.stat('RAM::RamDisc0.$.FromPrompt');
    return { docs: window.__word().word.docs.map((x) => x.leaf), type: st?.filetype,
      bytes: st ? await window.__bytes('RAM::RamDisc0.$.FromPrompt') : null, msgs: [...window.__msgs] };
  });
  const t3 = u3.bytes ? await texts(u3.bytes) : null;
  ok('saving from the Save box then closes the window', u3.docs.length === 0 && u3.type === 0xA7E
    && t3?.[0] === 'New text' && !u3.msgs.length, { u3: { ...u3, bytes: null }, t3 });

  // ------------------------------------------------ Revert
  const r0 = await ev(async () => {
    const t = window.__word();
    const dw = await t.word.newUntitled();
    const d = window.__by(dw.leaf);
    const it = window.__item(d, 'Revert');
    const items = d.win.menu({}).items.map((i) => i.text);
    const shaded = typeof it?.shaded === 'function' ? it.shaded(it) : it?.shaded;
    const res = { items, shaded, result: await d.revert(), queries: window.__queries.length, open: d.win.isOpen };
    d.dw.close();
    return res;
  });
  ok('the window menu has Revert after Save as', JSON.stringify(r0.items)
    === '["Save","Save as","Revert","Save a copy","Info","Edit","Insert","Format","Zoom","New","Close"]', r0.items);
  ok('Revert of an untitled document is shaded and does nothing', r0.shaded === true && r0.result === false
    && r0.queries === 0 && r0.open, r0);

  const r1 = await ev(async () => {
    const d = await window.__open();
    const shaded = window.__item(d, 'Revert').shaded;
    os.vfs.writeFile('RAM::RamDisc0.$.Plain', new Uint8Array(window.__changed), { filetype: 0xA7E });
    const result = await d.revert();
    await window.__frames(2);
    const n = window.__by('Plain');
    return { shaded: typeof shaded === 'function' ? shaded() : shaded, result, queries: window.__queries.length,
      lines: n?.view.lines(), title: n?.win.title, docs: window.__word().word.docs.length, keys: window.__word().word.keys };
  });
  ok('Revert on a clean document reloads it at once (the file changed on disc)', !r1.shaded && r1.result === true
    && r1.queries === 0 && r1.lines?.[0] === 'Changed on disc.' && r1.title === 'Plain' && r1.docs === 1
    && r1.keys.length === 1 && r1.keys[0] === 'ram::ramdisc0.$.plain', r1);

  const r2 = await ev(async () => {
    const d = window.__by('Plain');
    d.view.type('Edit ');
    window.__answer = 'Cancel';
    const result = await d.revert();
    return { result, q: window.__queries.at(-1), lines: d.view.lines(), title: d.win.title, open: d.win.isOpen };
  });
  ok('Revert with changes asks (Discard / Cancel); Cancel keeps them', r2.result === false && /Plain/.test(r2.q?.message ?? '')
    && JSON.stringify(r2.q?.buttons) === '["Discard","Cancel"]' && r2.lines[0] === 'Edit Changed on disc.'
    && r2.title === 'Plain *' && r2.open, r2);

  const r3 = await ev(async () => {
    const d = window.__by('Plain');
    d.win.open({ x: 222, y: 133, w: 520, h: 380 });
    d.setZoom(150);
    d.setRuler(false);
    await window.__frames(2);
    const before = { x: d.win.x, y: d.win.y, w: d.win.w, h: d.win.h };
    const depth = d.view.undoDepth;
    window.__answer = 'Discard';
    const result = await d.revert();
    await window.__frames(3);
    const n = window.__by('Plain');
    return { result, before, after: { x: n.win.x, y: n.win.y, w: n.win.w, h: n.win.h }, depth, undo: n.view.undoDepth,
      dirty: n.view.dirty, title: n.win.title, lines: n.view.lines(), zoom: n.zoom, ruler: n.rulerOn, oldClosed: d.closed,
      docs: window.__word().word.docs.length, open: n.win.isOpen };
  });
  ok('Revert with changes, Discard: reloaded, edits gone, title without *', r3.result === true && r3.lines[0] === 'Changed on disc.'
    && !r3.dirty && r3.title === 'Plain' && r3.docs === 1 && r3.open && r3.oldClosed, r3);
  ok('after Revert the undo history is empty', r3.depth > 0 && r3.undo === 0, r3);
  ok('Revert keeps the window where it was, its size, zoom and ruler', JSON.stringify(r3.before) === JSON.stringify(r3.after)
    && r3.zoom === 150 && r3.ruler === false, r3);

  const r5 = await ev(async () => {
    const t = window.__word();
    os.vfs.writeFile('RAM::RamDisc0.$.Front', new Uint8Array(window.__plain), { filetype: 0xA7E });
    await t.word.open('RAM::RamDisc0.$.Front');
    await window.__frames(2);
    const d = window.__by('Plain'), f = window.__by('Front');
    d.win.open({ scrollX: 40 });
    f.win.bringToFront();
    await window.__frames(2);
    const S = os.wimp.stack;
    const before = { scrollX: d.win.scrollX, below: S.indexOf(d.win) < S.indexOf(f.win) };
    const result = await d.revert();
    await window.__frames(2);
    const n = window.__by('Plain');
    const after = { scrollX: n.win.scrollX, below: S.indexOf(n.win) < S.indexOf(f.win) };
    f.dw.close();
    return { result, before, after };
  });
  ok('Revert keeps the scroll offset and the place in the stack (not brought to the front)', r5.result === true
    && r5.before.scrollX === 40 && r5.after.scrollX === 40 && r5.before.below && r5.after.below, r5);

  const r4 = await ev(async () => {
    const d = window.__by('Plain');
    d.view.type('Kept ');
    window.__answer = 'Discard';
    window.__msgs.length = 0;
    os.vfs.delete('RAM::RamDisc0.$.Plain');
    const gone = await d.revert();
    const m1 = [...window.__msgs];
    os.vfs.writeFile('RAM::RamDisc0.$.Plain', 'just text', { filetype: 0xFFF });
    const bad = await d.revert();
    const m2 = window.__msgs.slice(m1.length);
    return { gone, bad, m1, m2, open: d.win.isOpen, closed: d.closed, line: d.view.lines()[0], title: d.win.title,
      docs: window.__word().word.docs.length };
  });
  ok('Revert of a deleted file or a file that is not a .docx reports it and keeps the document', r4.gone === false
    && r4.bad === false && r4.m1.length === 1 && /Plain/.test(r4.m1[0]) && r4.m2.length === 1 && /Plain/.test(r4.m2[0])
    && r4.open && !r4.closed && r4.line === 'Kept Changed on disc.' && r4.title === 'Plain *' && r4.docs === 1, r4);
  await ev(async () => {
    window.__by('Plain').dw.close();
    os.vfs.writeFile('RAM::RamDisc0.$.Plain', new Uint8Array(window.__plain), { filetype: 0xA7E });
    window.__msgs.length = 0;
  });

  // ------------------------------------------------ saves of one window run in turn
  const a1 = await ev(async () => {
    const d = await window.__open();
    const w = d.dw, orig = w.saveBytes.bind(w);
    let n = 0;
    w.saveBytes = () => {
      const p = orig();                  // (the state is taken now)
      const ms = n++ === 0 ? 300 : 0;
      return p.then((b) => window.__sleep(ms).then(() => b));
    };
    d.view.type('A');
    const p1 = d.saveAs('RAM::RamDisc0.$.Older');
    d.view.type('B');
    const p2 = d.saveAs('RAM::RamDisc0.$.Newer');
    const res = { r: await Promise.all([p1, p2]) };
    w.saveBytes = orig;
    res.path = d.path;
    res.title = d.win.title;
    res.dirty = d.view.dirty;
    res.older = await window.__bytes('RAM::RamDisc0.$.Older');
    res.newer = await window.__bytes('RAM::RamDisc0.$.Newer');
    res.keys = window.__word().word.keys;
    return res;
  });
  const ta = [await texts(a1.older), await texts(a1.newer)];
  ok('two saves of one window, the first slower: the newer state and name win', a1.r.join() === 'true,true'
    && a1.path === 'RAM::RamDisc0.$.Newer' && a1.title === 'Newer' && !a1.dirty && ta[1][0] === 'ABFirst line.'
    && ta[0][0] === 'AFirst line.' && a1.keys.includes('ram::ramdisc0.$.newer') && !a1.keys.includes('ram::ramdisc0.$.older'),
  { ...a1, older: null, newer: null, ta });

  // ------------------------------------------------ a window closed or reverted while it is being saved
  const slow = `(w, ms = 300) => { const orig = w.saveBytes.bind(w); let n = 0;
    w.saveBytes = () => { const p = orig(); return n++ ? p : p.then((b) => window.__sleep(ms).then(() => b)); }; }`;
  await ev((src) => { window.__slow = eval(src); }, slow);
  const f1 = await ev(async () => {
    const t = window.__word();
    const d = window.__by('Newer');
    window.__slow(d.dw);
    d.view.type('L');
    const p = d.saveAs('RAM::RamDisc0.$.Late');
    d.requestClose();
    await window.__frames(2);
    const pw = window.__prompts()[0];
    pw.emit('click', { icon: pw.iconByName('button:Discard'), button: 'select' });
    await window.__frames(1);
    const res = { closedFirst: d.closed, result: await p };
    res.keys = t.word.keys;
    res.exists = os.vfs.stat('RAM::RamDisc0.$.Late')?.filetype;
    const nw = await t.word.open('RAM::RamDisc0.$.Late');
    await window.__frames(2);
    res.live = !!nw && !nw.closed && nw.win.isOpen;
    const h = window.__by('Late');
    res.line = h?.view.lines()[0];
    res.count = t.word.docs.filter((x) => x.leaf === 'Late').length;
    res.dead = t.word.docs.filter((x) => x.closed).length;
    return res;
  });
  ok('a window discarded while its Save as is writing: the file is written, the window not put back',
    f1.closedFirst && f1.result === true && f1.exists === 0xA7E && !f1.keys.includes('ram::ramdisc0.$.late'), f1);
  ok('and that file then opens in a live new window', f1.live && f1.count === 1 && f1.dead === 0
    && /^ABL?First line\.$/.test(f1.line ?? '') && f1.line.includes('L'), f1);

  const f2 = await ev(async () => {
    const t = window.__word();
    const d = window.__by('Late');
    window.__slow(d.dw);
    d.view.type('R');
    const q0 = window.__queries.length;
    const p = d.saveAs('RAM::RamDisc0.$.Late2');
    const r = d.revert();
    const res = { saved: await p, reverted: await r };
    await window.__frames(2);
    const n = window.__by('Late2');
    res.live = !!n && !n.closed && n.win.isOpen;
    res.line = n?.view.lines()[0];
    res.dirty = n?.view.dirty;
    res.oldClosed = d.closed;
    res.keys = t.word.keys;
    res.dead = t.word.docs.filter((x) => x.closed).length;
    res.asked = window.__queries.length - q0;
    return res;
  });
  ok('Revert during a Save as waits for it and reloads what was saved, in a live window', f2.saved && f2.reverted
    && f2.live && f2.line?.includes('R') && !f2.dirty && f2.oldClosed && f2.dead === 0 && f2.asked === 0
    && f2.keys.filter((k) => k.startsWith('ram::ramdisc0.$.late')).join() === 'ram::ramdisc0.$.late2', f2);

  const f3 = await ev(async () => {
    const d = window.__by('Late2');
    window.__slow(d.dw);
    const old = await window.__bytes('RAM::RamDisc0.$.Late2');
    d.view.type('S');
    const p1 = d.saveAs('RAM::RamDisc0.$.Moved');
    const p2 = d.save();                  // (while the Save as is writing)
    const res = { r: [await p1, await p2], path: d.path, title: d.win.title, dirty: d.view.dirty };
    res.same = JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Late2')) === JSON.stringify(old);
    res.moved = await window.__bytes('RAM::RamDisc0.$.Moved');
    return res;
  });
  const t3b = await texts(f3.moved);
  ok('Save chosen while a Save as is writing saves to the new name (the window is not renamed back)',
    f3.r.join() === 'true,true' && f3.path === 'RAM::RamDisc0.$.Moved' && f3.title === 'Moved' && !f3.dirty && f3.same
    && t3b[0].includes('S'), { ...f3, moved: null, t3b });

  const f4 = await ev(async () => {
    const d = window.__by('Moved');
    const orig = os.vfs.readFile;
    os.vfs.readFile = function (...a) { os.vfs.readFile = orig; d.view.type('T'); return orig.apply(this, a); };
    const result = await d.revert();
    os.vfs.readFile = orig;
    await window.__frames(2);
    const res = { result, closed: d.closed, open: d.win.isOpen, line: d.view.lines()[0], title: d.win.title,
      docs: window.__word().word.docs.filter((x) => x.leaf === 'Moved').length };
    d.dw.close();
    return res;
  });
  ok('Revert of a clean document gives up when typed into while the file is read (the typing kept)', f4.result === false
    && !f4.closed && f4.open && f4.line.includes('T') && f4.title === 'Moved *' && f4.docs === 1, f4);

  // ------------------------------------------------ the prompt: a long name, a failed Save, typing during the Save
  const g1 = await ev(async () => {
    const t = window.__word();
    const dw = await t.word.newUntitled();
    const d = window.__by(dw.leaf);
    d.dw.leaf = 'L'.repeat(90);
    d.view.type('x');
    d.requestClose();
    await window.__frames(2);
    const w = window.__prompts()[0];
    const msg = w.iconByName('message').text;
    const res = { msg, fits: msg.length * 8.5 + 32 <= w.w };
    w.emit('key', { code: 27 });
    await window.__frames(1);
    d.dw.close();
    return res;
  });
  ok('a long name is cut short in the prompt, so its message fits', g1.msg.includes('L'.repeat(37) + '...')
    && !g1.msg.includes('L'.repeat(41)) && g1.fits, g1);

  const g2 = await ev(async () => {
    window.__msgs.length = 0;
    const d = await window.__open();
    d.view.type('Locked ');
    const before = await window.__bytes('RAM::RamDisc0.$.Plain');
    os.vfs.setAccess('RAM::RamDisc0.$.Plain', 8 | 3);
    const rc = d.requestClose();
    await window.__frames(2);
    const w = window.__prompts()[0];
    w.emit('click', { icon: w.iconByName('button:Save'), button: 'select' });
    const res = { result: await rc };
    await window.__frames(2);
    res.open = d.win.isOpen && !d.closed;
    res.title = d.win.title;
    res.msgs = [...window.__msgs];
    res.same = JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Plain')) === JSON.stringify(before);
    res.caret = os.wimp.caret?.window === d.win;
    os.vfs.setAccess('RAM::RamDisc0.$.Plain', 3);
    return res;
  });
  ok('Save in the prompt on a locked file: one error, the window stays with its changes and the caret',
    g2.result === false && g2.open && g2.title === 'Plain *' && g2.msgs.length === 1 && /locked/i.test(g2.msgs[0])
    && g2.same && g2.caret, g2);

  const g3 = await ev(async () => {
    window.__msgs.length = 0;
    const d = window.__by('Plain');
    window.__slow(d.dw);
    const rc = d.requestClose();
    await window.__frames(2);
    const w = window.__prompts()[0];
    w.emit('click', { icon: w.iconByName('button:Save'), button: 'select' });
    await window.__sleep(80);
    d.view.type('Q');                     // (while it is being saved)
    const res = { result: await rc };
    await window.__frames(2);
    res.open = d.win.isOpen && !d.closed;
    res.title = d.win.title;
    res.msgs = [...window.__msgs];
    window.__msgs.length = 0;
    return res;
  });
  ok('typing during the prompt\'s Save: the window stays, with its *, and says why', g3.result === false && g3.open
    && g3.title === 'Plain *' && g3.msgs.length === 1 && /changed while/.test(g3.msgs[0]), g3);

  // ------------------------------------------------ 200 Saves in a row
  const h1 = await ev(async () => {
    const d = window.__by('Plain');
    const ps = [], t0 = performance.now();
    for (let i = 0; i < 200; i++) { d.view.type(String(i % 10)); ps.push(d.save()); }
    const r = await Promise.all(ps);
    const res = { ms: performance.now() - t0, all: r.every(Boolean), dirty: d.view.dirty, saving: d.saving,
      line: d.view.lines()[0], bytes: await window.__bytes('RAM::RamDisc0.$.Plain'), title: d.win.title };
    d.dw.close();
    return res;
  });
  const th = await texts(h1.bytes);
  ok('200 Saves in a row: all done in bounded time, the file holds the last state, none left queued', h1.all
    && h1.ms < 30000 && !h1.dirty && !h1.saving && th[0] === h1.line && h1.title === 'Plain', { ...h1, bytes: null, th });

  // ------------------------------------------------ questions of one task wait their turn
  const q1 = await ev(async () => {
    const t = window.__word();
    const boxes = () => [...os.wimp.windows].filter((w) => w.isOpen && w.iconByName?.('message'));
    const a = t.word.ask({ title: 'One', message: 'one', buttons: ['A', 'B'] });
    const b = t.word.ask({ title: 'Two', message: 'two', buttons: ['C', 'D', 'E'] });
    await window.__frames(2);
    const res = { first: boxes().map((w) => w.iconByName('message').text), bwin: b.win };
    const w1 = boxes()[0];
    w1.emit('click', { icon: w1.iconByName('button:A'), button: 'select' });
    res.a = await a;
    await window.__frames(2);
    res.second = boxes().map((w) => w.iconByName('message').text);
    const w2 = boxes()[0];
    w2.emit('click', { icon: w2.iconByName('button:D'), button: 'select' });
    res.b = await b;
    await window.__frames(1);
    res.left = boxes().length;
    return { ...res, bwin: res.bwin === null };
  });
  ok('a second question while one is open waits, and each gets its own answer', q1.first.join() === 'one' && q1.bwin
    && q1.a === 'A' && q1.second.join() === 'two' && q1.b === 'D' && q1.left === 0, q1);

  // ------------------------------------------------ one pending Save per window
  const b1 = await ev(async () => {
    const t = window.__word(), M = os.wimp.menus;
    const dw = await t.word.newUntitled();
    const d = window.__by(dw.leaf);
    d.view.type('Pending');
    const p1 = d.save();
    await window.__frames(2);
    const box = window.__box(d, 'Save as');
    box.setFilename('RAM::RamDisc0.$.Typed1');
    const p2 = d.save();
    const res = { same: p1 === p2, kept: box.filename() };
    let settled = null;
    p1.then((v) => { settled = v; });
    // the menu over the box, then the menu opened again over it
    const at = d.win.workToScreen(100, 100);
    for (let k = 0; k < 2; k++) {
      const m = d.win.menu({});
      M.open(m, at.x, at.y, { task: t });
      M._openSub(M.levels[0], m.items.findIndex((i) => i.text === 'Save as'), 'arrow');
      await window.__frames(2);
    }
    res.whileMenus = settled;
    res.inMenu = box.isOpen;
    box.emit('click', { icon: box.icons[0], button: 'select' });
    res.result = await Promise.race([p1, window.__sleep(2000).then(() => 'timeout')]);
    res.path = d.path;
    M.close();
    return res;
  });
  ok('Save again on an untitled document gives the same pending save, the typed name kept', b1.same
    && b1.kept === 'RAM::RamDisc0.$.Typed1', b1);
  ok('the pending save is true when saved from the box opened again from the menu', b1.whileMenus === null && b1.inMenu
    && b1.result === true && b1.path === 'RAM::RamDisc0.$.Typed1', b1);
  const b2 = await ev(async () => {
    const t = window.__word(), M = os.wimp.menus;
    const dw = await t.word.newUntitled();
    const d = window.__by(dw.leaf);
    d.view.type('Pending');
    const p1 = d.save();
    await window.__frames(2);
    const at = d.win.workToScreen(100, 100);
    const m = d.win.menu({});
    M.open(m, at.x, at.y, { task: t });
    M._openSub(M.levels[0], m.items.findIndex((i) => i.text === 'Save as'), 'arrow');
    await window.__frames(2);
    M.close();                            // (dismissed: a click elsewhere)
    const res = { result: await Promise.race([p1, window.__sleep(2000).then(() => 'timeout')]), dirty: d.view.dirty };
    d.dw.close();
    return res;
  });
  ok('the pending save is false when the box is dismissed without saving', b2.result === false && b2.dirty, b2);

  // ------------------------------------------------ the boxes follow a rename
  const d1 = await ev(async () => {
    const d = window.__by('Typed1');
    const copy = window.__box(d, 'Save a copy');
    await d.saveAs('RAM::RamDisc0.$.Renamed');
    const res = { copy: copy.filename() };
    const box = window.__box(d, 'Save as');
    box.setFilename('ram::ramdisc0.$.lower');
    box.emit('click', { icon: box.icons[0], button: 'select' });
    for (let i = 0; i < 40 && d.path !== 'RAM::RamDisc0.$.lower'; i++) await window.__sleep(25);
    await window.__frames(2);
    res.path = d.path;
    res.box = box.filename();
    res.msgs = [...window.__msgs];
    d.dw.close();
    return res;
  });
  ok('the Save a copy box takes the new name (a full path, so OK works) after Save as', d1.copy === 'RAM::RamDisc0.$.Renamed', d1);
  ok('after OK the Save as box shows the canonical path', d1.path === 'RAM::RamDisc0.$.lower' && d1.box === d1.path
    && !d1.msgs.length, d1);

  // ------------------------------------------------ one prompt at a time; 30 cycles leak nothing
  const l1 = await ev(async () => {
    const t = window.__word();
    const a = await t.word.newUntitled(), b = await t.word.newUntitled();
    const da = window.__by(a.leaf), db = window.__by(b.leaf);
    da.view.type('a');
    db.view.type('b');
    da.requestClose();
    await window.__frames(2);
    db.win.bringToFront();
    db.requestClose();
    await window.__frames(2);
    const S = os.wimp.stack, pw = window.__prompts()[0];
    const res = { prompts: window.__prompts().length, leaf: t.word.prompt?.leaf, a: a.leaf,
      front: S.indexOf(pw) > S.indexOf(db.win) };
    window.__prompts()[0].requestClose();
    await window.__frames(2);
    da.dw.close();
    db.dw.close();
    return res;
  });
  ok('only one prompt at a time; closing another window brings it to the front', l1.prompts === 1 && l1.leaf === l1.a
    && l1.front, l1);
  const l2 = await ev(async () => {
    const t = window.__word();
    const count = () => ({ windows: os.wimp.windows.size, task: t.windows.size, dom: document.querySelectorAll('*').length });
    const cycle = async (i) => {
      const dw = await t.word.newUntitled();
      const d = window.__by(dw.leaf);
      d.view.type('x');
      d.requestClose();
      await window.__frames(1);
      const w = window.__prompts()[0];
      const pick = ['button:Cancel', 'button:Discard'][i % 2];
      w.emit('click', { icon: w.iconByName(pick), button: 'select' });
      await window.__frames(1);
      if (!d.closed) {
        d.requestClose();
        await window.__frames(1);
        const v = window.__prompts()[0];
        v.emit('click', { icon: v.iconByName('button:Discard'), button: 'select' });
        await window.__frames(1);
      }
    };
    await cycle(0);
    await cycle(1);
    await window.__frames(3);
    const base = count(), docs = t.word.docs.length;
    for (let i = 0; i < 30; i++) await cycle(i);
    await window.__frames(3);
    return { base, after: count(), docs: t.word.docs.length - docs, prompts: window.__prompts().length };
  });
  ok('30 prompt cycles leave no windows or page elements behind', l2.after.windows === l2.base.windows
    && l2.after.task === l2.base.task && Math.abs(l2.after.dom - l2.base.dom) <= 5 && l2.docs === 0 && l2.prompts === 0, l2);

  // ------------------------------------------------ Quit while the prompt and a Save box are open
  const z1 = await ev(async () => {
    const t = window.__word();
    const d = await window.__open();
    d.view.type('z');
    const rc = d.requestClose();
    const dw = await t.word.newUntitled();
    const u = window.__by(dw.leaf);
    u.view.type('u');
    const sv = u.save();
    await window.__frames(2);
    const res = { prompt: window.__prompts().length, box: window.__box(u, 'Save as').isOpen };
    t.quit();
    const late = window.__sleep(2000).then(() => 'timeout');
    res.rc = await Promise.race([rc, late]);
    res.sv = await Promise.race([sv, late]);
    await window.__frames(3);
    res.alive = t.alive;
    res.windows = os.wimp.windows.size;
    res.tasks = os.wimp.tasks.filter((x) => x.alive).length;
    res.base = window.__base;
    return res;
  });
  ok('Quit while the prompt and an untitled Save box are open: both settle, nothing is left behind', z1.prompt === 1
    && z1.box && z1.rc !== 'timeout' && z1.sv === false && !z1.alive && z1.windows === z1.base.windows
    && z1.tasks === z1.base.tasks, z1);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
