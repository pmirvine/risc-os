// !Word's documents against hostile use, in the real desktop: Save as
// onto another open window's file (any case, the Save box's OK too),
// a locked file, a read-only disc, bad leaf names; 1000 rapid Saves
// (bounded time, the queue empty after); Save while typing; Save
// during a real input-method composition (CDP: the composed text
// saved once, the late commit adds no copy, the caret back); 50 dirty
// windows and a shutdown answered Cancel then Discard; the shutdown
// asked twice restarts the closedown once; a prompt that cannot open
// (Quit, PreQuit) is reported, not an unhandled rejection; Recent
// with 10,000 hostile entries and corrupt Choices:Word; Revert of a
// deleted file; Quit while the Save box is open; 500 seeded random
// actions (new, type, save, save as, revert, close and its answers,
// reopen, quit and Cancel) with the windows' state checked after
// each (title, '*', path, leaf, app.docs key, no stray windows,
// prompts or tasks, no page errors) and every saved file read back
// equal to its document. Needs the disc built by
// tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';
import { assertSameDoc } from './docx-compare.mjs';
import { rng } from './word-docs.mjs';

const out = [];
const timings = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const plain = await buildDocx({ 'word/document.xml': documentXml(p(r('First line.')) + p(r('Second line.'))) });
const texts = async (bytes) => (await readDocx(new Uint8Array(bytes))).sections.flatMap((s) => s.blocks.map((b) => b.text));
/** null when the two .docx byte arrays hold the same document, else why not. */
const differ = async (a, b, what) => {
  try { assertSameDoc(await readDocx(new Uint8Array(a)), await readDocx(new Uint8Array(b)), what); return null; }
  catch (e) { return String(e.message).slice(0, 300); }
};

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
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
  await ev(async (a) => {
    window.__msgs = [];
    window.__answer = 'Discard';
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    globalThis.__riscos.query = () => Promise.resolve(window.__answer);
    for (const n of ['Plain', 'Other', 'Locked', 'Gone', 'Ime']) os.vfs.writeFile('RAM::RamDisc0.$.' + n, new Uint8Array(a), { filetype: 0xA7E });
    window.__plain = a;
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__bytes = async (path) => Array.from(await os.vfs.readFile(path));
    window.__item = (d, text) => d.win.menu({}).items.find((i) => i.text === text);
    window.__box = (d, text) => window.__item(d, text).submenu();
    window.__menu = () => { const i = [...window.__word().iconbarIcons][0]; return typeof i.menu === 'function' ? i.menu({}) : i.menu; };
    window.__quitPrompts = () => [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Discard') && !q.iconByName('button:Save'));
    window.__closePrompts = () => [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Save') && q.iconByName('button:Discard'));
    window.__press = (w, text) => w.emit('click', { icon: w.iconByName('button:' + text), button: 'select' });
    window.__start = async () => {
      await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
      for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
      await window.__word().word.recentReady;
    };
    window.__count = () => ({ windows: os.wimp.windows.size, open: [...os.wimp.windows].filter((w) => w.isOpen).length,
      tasks: os.wimp.tasks.filter((t) => t.alive).length });
    if (os.vfs.exists('ADFS::HardDisc4.$.!Boot.Choices.Word')) os.vfs.delete('ADFS::HardDisc4.$.!Boot.Choices.Word');
    window.__base = window.__count();
    await window.__start();
  }, Array.from(plain));

  // ------------------------------------------------ Save as onto what it must not
  const a1 = await ev(async () => {
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Plain');
    await t.word.open('RAM::RamDisc0.$.Other');
    const d = window.__by('Plain');
    d.view.type('mine ');
    const before = await window.__bytes('RAM::RamDisc0.$.Other');
    const res = { refused: [] };
    for (const path of ['RAM::RamDisc0.$.Other', 'ram::ramdisc0.$.OTHER', 'RAM::RamDisc0.$.other']) {
      window.__msgs.length = 0;
      const r = await d.saveAs(path);
      res.refused.push({ r, msgs: window.__msgs.length, msg: window.__msgs[0] });
    }
    // the Save box's OK with the other window's path
    window.__msgs.length = 0;
    const box = window.__box(d, 'Save as');
    box.setFilename('RAM::RamDisc0.$.OTHER');
    box.open({ x: 100, y: 100 });
    box.emit('click', { icon: box.icons[0], button: 'select' });
    await window.__sleep(50);
    await window.__frames(2);
    res.box = { msgs: [...window.__msgs], open: box.isOpen };
    box.close();
    // an untitled document onto an open file
    const u = await t.word.new();
    const du = window.__by(u.leaf);
    du.view.type('new text');
    window.__msgs.length = 0;
    res.untitled = { r: await du.saveAs('RAM::RamDisc0.$.Plain'), msgs: window.__msgs.length, leaf: du.leaf, untitled: du.untitled };
    res.same = JSON.stringify(before) === JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Other'));
    res.plain = { path: d.path, title: d.win.title, keys: t.word.keys };
    return res;
  });
  ok('Save as onto another open window\'s file (any case) is refused and said', a1.refused.every((x) => x.r === false
    && x.msgs === 1 && /open in another window/.test(x.msg)), a1.refused);
  ok('... from the Save box\'s OK too', a1.box.msgs.length === 1 && /open in another window/.test(a1.box.msgs[0]), a1.box);
  ok('... and from an untitled document', a1.untitled.r === false && a1.untitled.msgs === 1 && a1.untitled.untitled, a1.untitled);
  ok('the other file is untouched; the window keeps its name and key', a1.same && a1.plain.path === 'RAM::RamDisc0.$.Plain'
    && a1.plain.title === 'Plain *' && a1.plain.keys.includes('ram::ramdisc0.$.plain'), a1);

  const a2 = await ev(async () => {
    const d = window.__by('Plain');
    const res = {};
    const attempt = async (name, fn) => {
      window.__msgs.length = 0;
      d.view.type('x');
      const id = d.stateId;
      let r, threw = null;
      try { r = await fn(); } catch (e) { threw = String(e); }
      res[name] = { r, threw, msgs: [...window.__msgs], dirty: d.view.dirty, path: d.path, same: d.stateId === id, title: d.win.title };
      return res[name];
    };
    const locked = await window.__bytes('RAM::RamDisc0.$.Locked');
    os.vfs.setAccess('RAM::RamDisc0.$.Locked', 8 | 3);
    await attempt('locked', () => d.saveAs('RAM::RamDisc0.$.Locked'));
    const box = window.__box(d, 'Save as');
    box.setFilename('RAM::RamDisc0.$.Locked');
    await attempt('lockedBox', async () => { box.emit('click', { icon: box.icons[0], button: 'select' }); await window.__sleep(50); });
    res.lockedSame = JSON.stringify(locked) === JSON.stringify(await window.__bytes('RAM::RamDisc0.$.Locked'));
    os.vfs.ram.readonly = true;
    await attempt('readonly', () => d.save());
    await attempt('readonlyAs', () => d.saveAs('RAM::RamDisc0.$.NewOne'));
    os.vfs.ram.readonly = false;
    res.noNewOne = !os.vfs.exists('RAM::RamDisc0.$.NewOne');
    const bad = ['RAM::RamDisc0.$.bad*name', 'RAM::RamDisc0.$.', 'RAM::RamDisc0.$.a b',
      'RAM::RamDisc0.$.\u0001ctl', 'RAM::RamDisc0.$.Nowhere.File', 'NoSuchFS::X.$.File', '', '$$$'];
    const list = [];
    for (const path of bad) list.push({ to: path.slice(0, 40), ...await attempt('one', () => d.saveAs(path)) });
    res.bad = list;
    // a long leaf is a name the disc takes: saved, the window renamed
    const long = 'RAM::RamDisc0.$.' + 'L'.repeat(300);
    res.long = { r: await d.saveAs(long), leaf: d.leaf.length, title: d.win.title.length, key: window.__word().word.keys.includes(long.toLowerCase()) };
    d.view.type('p');
    res.proto = { r: await d.saveAs('RAM::RamDisc0.$.__proto__'), key: window.__word().word.keys.includes('ram::ramdisc0.$.__proto__'),
      polluted: Object.keys(Object.prototype).length, title: d.win.title };
    return res;
  });
  for (const k of ['locked', 'readonly', 'readonlyAs']) {
    const v = a2[k];
    ok(`Save as / Save: ${k} is reported once, nothing marked`, v.r === false && !v.threw && v.msgs.length === 1 && v.dirty
      && v.same && v.path === 'RAM::RamDisc0.$.Plain' && v.title === 'Plain *', v);
  }
  ok('Save box OK onto a locked file: reported once, file untouched, window as it was', a2.lockedBox.msgs.length === 1
    && /locked/i.test(a2.lockedBox.msgs[0]) && a2.lockedBox.dirty && a2.lockedSame && a2.lockedBox.path === 'RAM::RamDisc0.$.Plain', a2);
  ok('read-only disc: no file made', a2.noNewOne, a2.noNewOne);
  ok('bad leaf names, odd paths: each refused with one message, never thrown; nothing marked', a2.bad.every((v) => v.r === false
    && !v.threw && v.msgs.length === 1 && v.dirty && v.same && v.path === 'RAM::RamDisc0.$.Plain'), a2.bad.filter((v) => !(v.r === false && v.msgs.length === 1)));
  ok('a 300-character leaf the disc accepts: saved and the window renamed', a2.long.r === true && a2.long.leaf === 300
    && a2.long.title === 300 && a2.long.key, a2.long);
  ok('a leaf __proto__: saved, keyed by its path, nothing polluted', a2.proto.r === true && a2.proto.key && !a2.proto.polluted
    && a2.proto.title === '__proto__', a2.proto);

  // ------------------------------------------------ 1000 rapid Saves
  const b1 = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) d.dw.close();
    os.vfs.writeFile('RAM::RamDisc0.$.Rapid', new Uint8Array(window.__plain), { filetype: 0xA7E });
    await t.word.open('RAM::RamDisc0.$.Rapid');
    const d = window.__by('Rapid');
    window.__msgs.length = 0;
    const t0 = performance.now();
    const all = [];
    for (let i = 0; i < 1000; i++) {
      if (i % 100 === 0) d.view.type('r' + i + ' ');
      all.push(d.save());
    }
    const results = await Promise.all(all);
    const ms = performance.now() - t0;
    await window.__frames(2);
    return { ms, n: results.length, allTrue: results.every((x) => x === true), saving: d.saving, dirty: d.view.dirty,
      title: d.win.title, msgs: window.__msgs.length, file: await window.__bytes('RAM::RamDisc0.$.Rapid'),
      doc: Array.from(await d.saveBytes()), line: d.view.lines()[0] };
  });
  timings.push(`1000 rapid Saves: ${Math.round(b1.ms)} ms`);
  ok('1000 rapid Saves (typing every 100): all true, in bounded time, the queue empty, clean', b1.n === 1000 && b1.allTrue
    && b1.ms < 30000 && !b1.saving && !b1.dirty && b1.title === 'Rapid' && !b1.msgs, { ...b1, file: null, doc: null });
  ok('... and the file holds the document as it is', !(await differ(b1.file, b1.doc, 'rapid saves')) && b1.line.startsWith('r0 r100 r200'),
    await differ(b1.file, b1.doc, 'rapid saves'));

  // ------------------------------------------------ Save while typing (real keys)
  await ev(async () => {
    const d = window.__by('Rapid');
    d.dw.view.focus();
    window.__typingSaves = [];
    window.__saver = setInterval(() => { window.__typingSaves.push(d.save()); }, 7);
  });
  await page.keyboard.type('typed while saving ', { delay: 5 });
  const c1 = await ev(async () => {
    clearInterval(window.__saver);
    const d = window.__by('Rapid');
    const rs = await Promise.all(window.__typingSaves);
    const res = { saves: rs.length, allTrue: rs.every((x) => x), dirtyAfterRacing: d.view.dirty };
    res.last = await d.save();
    res.dirty = d.view.dirty;
    res.title = d.win.title;
    res.line = d.view.lines()[0];
    res.file = await window.__bytes('RAM::RamDisc0.$.Rapid');
    res.doc = Array.from(await d.saveBytes());
    return res;
  });
  ok('saving every 7 ms while real keys type: every save true, then one more Save is clean', c1.saves > 5 && c1.allTrue
    && c1.last && !c1.dirty && c1.title === 'Rapid' && c1.line.startsWith('r0 r100') && c1.line.includes('r900 typed while saving First'), { ...c1, file: null, doc: null });
  ok('... the file holds every character typed', !(await differ(c1.file, c1.doc, 'typing saves')), await differ(c1.file, c1.doc, 'typing saves'));

  // ------------------------------------------------ Save during a real input-method composition
  {
    const cdp = await page.context().newCDPSession(page);
    await ev(async () => {
      const t = window.__word();
      const dw = await t.word.open('RAM::RamDisc0.$.Ime');
      const h = window.__by('Ime').view;
      h.setSelection({ id: h.layout.items[0].id, off: 0 });
      dw.view.focus();
      await window.__frames(2);
    });
    await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '\u306b\u307b', selectionStart: 2, selectionEnd: 2 });
    await ev(() => window.__frames(2));
    const m1 = await ev(async () => {
      const d = window.__by('Ime');
      const res = { comp: d.view.composing, composingBrowser: os.wimp.textInput?.composing };
      window.__item(d, 'Save').action();      // Save from the window menu
      for (let i = 0; i < 40 && d.saving; i++) await window.__sleep(25);
      await window.__frames(2);
      res.after = d.view.composing;
      res.dirty = d.view.dirty;
      res.file = await window.__bytes('RAM::RamDisc0.$.Ime');
      return res;
    });
    // the input method's late commit
    await cdp.send('Input.insertText', { text: '\u306b\u307b' });
    await ev(() => window.__frames(3));
    const m2 = await ev(async () => {
      const d = window.__by('Ime');
      return { line: d.view.lines()[0], dirty: d.view.dirty, focus: d.dw.view.hasFocus, caret: os.wimp.caret?.window === d.win,
        sel: d.dw.view.sel && JSON.stringify(d.dw.view.sel), comp: d.view.composing };
    });
    await page.keyboard.type('Z');
    const m3 = await ev(async () => { await window.__frames(2); return window.__by('Ime').view.lines()[0]; });
    const saved = await texts(m1.file);
    const count = (s) => (s.match(/\u306b\u307b/g) || []).length;
    ok('Save during a composition: the composed text is in the file exactly once', m1.comp === '\u306b\u307b' && m1.after === null
      && !m1.dirty && saved[0] === '\u306b\u307bFirst line.' && count(saved.join()) === 1, { m1: { ...m1, file: null }, saved });
    ok('... the late commit adds no second copy', count(m2.line) === 1 && m2.line === '\u306b\u307bFirst line.' && !m2.comp, m2);
    ok('... the caret and focus are back in the window: the next key types after it', m2.focus && m2.caret
      && m3 === '\u306b\u307bZFirst line.', { m2, m3 });
  }

  // ------------------------------------------------ 50 dirty windows and the shutdown
  const q1 = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) d.dw.close();
    for (let i = 0; i < 50; i++) { const u = await t.word.new(); window.__by(u.leaf).view.type('dirty ' + i); }
    window.__shut = 0;
    window.__realShutdown = os.switcher.shutdown;
    os.switcher.shutdown = () => { window.__shut++; };
    window.__hot = 0;
    window.__offHot = os.wimp.on('hotkey:CtrlShiftF12', () => { window.__hot++; });
    const res = { first: await os.switcher.preQuitAll() };
    await window.__frames(3);
    const w = window.__quitPrompts();
    res.n = w.length;
    res.text = w[0] && w[0].iconByName('message').text;
    return res;
  });
  await clickButton('Cancel');
  const q2 = await ev(async () => {
    await window.__sleep(50);
    const t = window.__word();
    return { shut: window.__shut, docs: t.word.docs.length, dirty: t.word.docs.filter((d) => d.view.dirty).length, prompts: window.__quitPrompts().length };
  });
  ok('shutdown with 50 dirty windows: Word objects, one prompt with the count', q1.first === false && q1.n === 1
    && q1.text === '50 documents have unsaved changes.', q1);
  ok('... Cancel: nothing restarted, all 50 kept with their changes', q2.shut === 0 && q2.docs === 50 && q2.dirty === 50 && !q2.prompts, q2);
  // the shutdown asked twice before it is answered
  const q3 = await ev(async () => {
    const a = await os.switcher.preQuitAll(), b = await os.switcher.preQuitAll();
    await window.__frames(3);
    return { a, b, prompts: window.__quitPrompts().length };
  });
  await clickButton('Discard');
  const q4 = await ev(async () => {
    await window.__sleep(100);
    const t = window.__word();
    const res = { shut: window.__shut, hot: window.__hot, docs: t?.word.docs.length, again: await os.switcher.preQuitAll(),
      count: window.__count() };
    os.switcher.shutdown = window.__realShutdown;
    if (typeof window.__offHot === 'function') window.__offHot();
    return res;
  });
  ok('the shutdown asked twice: one prompt', q3.a === false && q3.b === false && q3.prompts === 1, q3);
  ok('... Discard: every document gone, the closedown restarted once (not twice)', q4.shut === 1 && q4.hot === 1 && q4.docs === 0
    && q4.again === true, q4);

  // ------------------------------------------------ a prompt that cannot open
  const e1 = await ev(async () => {
    const t = window.__word();
    const u = await t.word.new();
    window.__by(u.leaf).view.type('kept');
    window.__msgs.length = 0;
    const real = t.createWindow;
    t.createWindow = () => { throw new Error('no room for the box'); };
    const res = {};
    try {
      res.quit = await t.word.quit();
      let objected = false;
      os.wimp.sendMessage('PreQuit', { object: () => { objected = true; } }, { to: t });
      res.objected = objected;
      await window.__sleep(50);
      os.wimp.sendMessage('PreQuit', { single: true, object: () => {} }, { to: t });
      await window.__sleep(50);
      res.close = await t.word.docs[0].requestClose();
      t.word.docs[0].win.emit('close', {});    // (its close icon)
      await window.__sleep(50);
    } finally {
      t.createWindow = real;
    }
    res.alive = t.alive;
    res.docs = t.word.docs.length;
    res.msgs = window.__msgs.splice(0);
    res.dirty = t.word.docs[0]?.view.dirty;
    // and it asks properly again afterwards
    t.word.quit();
    await window.__frames(3);
    res.promptAfter = window.__quitPrompts().length;
    window.__press(window.__quitPrompts()[0], 'Cancel');
    await window.__frames(2);
    return res;
  });
  ok('a quit or close prompt that cannot open: no unhandled rejection; Word stays, the document kept, the error reported',
    e1.quit === false && e1.close === false && e1.objected && e1.alive && e1.docs === 1 && e1.dirty && e1.msgs.length >= 1
    && e1.msgs.every((m) => /no room/.test(m)) && !pageErrors(), { e1, errs: logs.filter((l) => /PAGEERROR/.test(l)).slice(0, 3) });
  ok('... and the next Quit asks as usual', e1.promptAfter === 1, e1);

  // ------------------------------------------------ Quit while the Save box is open
  const s1 = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) d.dw.close();
    const u = await t.word.new();
    const d = window.__by(u.leaf);
    d.view.type('in the box');
    window.__pendingSave = d.save();
    await window.__frames(2);
    const box = window.__box(d, 'Save as');
    const res = { boxOpen: box.isOpen };
    window.__menu().items.find((i) => i.text === 'Quit').action();
    await window.__frames(3);
    res.prompts = window.__quitPrompts().length;
    return res;
  });
  await clickButton('Cancel');
  const s2 = await ev(async () => {
    const t = window.__word(), d = t.word.docs[0];
    const res = { alive: !!t, docs: t.word.docs.length, dirty: d.view.dirty };
    window.__menu().items.find((i) => i.text === 'Quit').action();
    await window.__frames(3);
    return res;
  });
  await clickButton('Discard');
  const s3 = await ev(async () => {
    await window.__sleep(50);
    const r = await Promise.race([window.__pendingSave, window.__sleep(1000).then(() => 'hung')]);
    return { alive: !!window.__word(), save: r, count: window.__count(), base: window.__base,
      boxes: [...os.wimp.windows].filter((w) => w.isOpen && /Save as/.test(w.title ?? '')).length };
  });
  ok('Quit while the Save box is open: asks; Cancel keeps the document', s1.boxOpen && s1.prompts === 1 && s2.alive
    && s2.docs === 1 && s2.dirty, { s1, s2 });
  ok('... Discard quits: the Save box goes, the pending Save is false, nothing left behind', !s3.alive && s3.save === false
    && !s3.boxes && s3.count.windows === s3.base.windows && s3.count.tasks === s3.base.tasks, s3);

  // ------------------------------------------------ Recent: 10,000 hostile entries, corrupt Choices
  const h1 = await ev(async () => {
    const C = 'ADFS::HardDisc4.$.!Boot.Choices.Word';
    const hostile = [];
    for (let i = 0; i < 10000; i++) {
      hostile.push([i, null, '__proto__', 'constructor', 'RAM::RamDisc0.$.Missing' + i, 'x'.repeat(5000), '\u0000bad', { a: 1 },
        'RAM::RamDisc0.$.Plain'][i % 9]);
    }
    const res = {};
    const variants = [
      ['10k', JSON.stringify({ recent: hostile, __proto__: { polluted: 1 } })],
      ['proto', '{"__proto__": {"recent": ["RAM::RamDisc0.$.Plain"]}, "constructor": {"prototype": {"x": 1}}}'],
      ['truncated', '{"recent": ["RAM::RamDisc0.$.Plain", '],
      ['binary', '\u0000\u00ff\u00fe garbage'],
      ['null', 'null'],
      ['array', '["RAM::RamDisc0.$.Plain"]'],
      ['deep', '['.repeat(100000)],
      ['huge string', JSON.stringify({ recent: 'y'.repeat(1e6) })],
      ['empty', ''],
    ];
    for (const [name, text] of variants) {
      os.vfs.writeFile(C, new TextEncoder().encode(text), { filetype: 0xFFF });
      const t0 = performance.now();
      await window.__start();
      const t = window.__word();
      const startMs = performance.now() - t0;
      const m0 = performance.now();
      const menu = window.__menu(), it = menu.items.find((i) => i.text === 'Recent');
      const shaded = typeof it.shaded === 'function' ? it.shaded() : !!it.shaded;
      const sub = shaded ? null : it.submenu();
      res[name] = { startMs: Math.round(startMs), menuMs: Math.round(performance.now() - m0), recent: t.word.recent.length,
        shown: sub ? sub.items.map((i) => i.text) : [], polluted: ({}).polluted !== undefined || ({}).x !== undefined };
      // a file opened: the list is written back, cleanly
      await t.word.open('RAM::RamDisc0.$.Other');
      await window.__sleep(20);
      try { res[name].written = JSON.parse(await os.vfs.readText(C)).recent; } catch (e) { res[name].written = 'bad: ' + e.message; }
      t.quit();
      await window.__frames(2);
    }
    res.msgs = window.__msgs.splice(0);
    return res;
  });
  const hBad = Object.entries(h1).filter(([k, v]) => k !== 'msgs' && (v.recent > 8 || v.shown.length > 2 || v.polluted
    || !Array.isArray(v.written) || v.written[0] !== 'RAM::RamDisc0.$.Other' || v.written.length > 8 || v.menuMs > 2000 || v.startMs > 5000));
  timings.push('Recent with 10,000 hostile entries: start ' + h1['10k'].startMs + ' ms, menu ' + h1['10k'].menuMs + ' ms');
  ok('Recent: 10,000 hostile entries and corrupt Choices:Word (truncated, binary, null, deep, huge): at most 8, only real files shown, ' +
    'no pollution, the menu quick, a clean list written back', !hBad.length && !h1.msgs.length
    && h1['10k'].shown.join() === 'Plain', { hBad, msgs: h1.msgs, k: h1['10k'] });

  // ------------------------------------------------ Revert of a file that has gone
  const v1 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Gone');
    const d = window.__by('Gone');
    os.vfs.delete('RAM::RamDisc0.$.Gone');
    window.__msgs.length = 0;
    const res = { clean: await d.revert(), cleanMsgs: [...window.__msgs], open: d.win.isOpen, docs: t.word.docs.length };
    d.view.type('keep me ');
    window.__answer = 'Discard';
    window.__msgs.length = 0;
    res.dirty = await d.revert();
    res.dirtyMsgs = [...window.__msgs];
    res.line = d.view.lines()[0];
    res.title = d.win.title;
    res.same = window.__by('Gone')?.dw === d.dw;
    // and then Save puts it back
    res.saved = await d.save();
    res.exists = os.vfs.exists('RAM::RamDisc0.$.Gone');
    res.after = d.win.title;
    return res;
  });
  ok('Revert of a deleted file: reported, the document kept (clean and with changes)', v1.clean === false && v1.cleanMsgs.length === 1
    && /Gone/.test(v1.cleanMsgs[0]) && v1.open && v1.dirty === false && v1.dirtyMsgs.length === 1 && v1.line === 'keep me First line.'
    && v1.title === 'Gone *' && v1.same, v1);
  ok('... and Save writes it back', v1.saved && v1.exists && v1.after === 'Gone', v1);

  // ------------------------------------------------ 500 seeded random actions
  {
    await ev(async () => {
      const t = window.__word();
      for (const d of t.word.docs) d.dw.close();
      for (let k = 0; k < 6; k++) os.vfs.writeFile('RAM::RamDisc0.$.R' + k, new Uint8Array(window.__plain), { filetype: 0xA7E });
      const mine = () => [...os.wimp.windows].filter((w) => w.isOpen && w.task === window.__word()).length;
      window.__w0 = mine();
      const u = await t.word.new();
      window.__perDoc = mine() - window.__w0;
      window.__by(u.leaf).dw.close();
      window.__all = { windows: os.wimp.windows.size, dom: document.querySelectorAll('*').length };
      window.__check = () => {
        const t = window.__word(), bad = [];
        if (!t) return ['Word not running'];
        const keys = t.word.keys, docs = t.word.docs, leaves = new Set(), paths = new Set();
        docs.forEach((d, i) => {
          const k = keys[i], name = d.leaf;
          if (d.closed) bad.push('closed window in app.docs: ' + name);
          if (!d.win.isOpen) bad.push('window not open: ' + name);
          if (d.path) {
            if (k !== os.vfs.canonical(d.path).toLowerCase()) bad.push(`key ${k} for ${d.path}`);
            if (name !== os.vfs.leaf(d.path)) bad.push(`leaf ${name} for ${d.path}`);
            if (paths.has(k)) bad.push('two windows on ' + k);
            paths.add(k);
          } else {
            if (!/^untitled:\d+$/.test(k)) bad.push('untitled key ' + k);
            if (!/^Untitled( \d+)?$/.test(name)) bad.push('untitled leaf ' + name);
            if (leaves.has(name)) bad.push('two ' + name);
            leaves.add(name);
          }
          const title = name + (d.view.dirty ? ' *' : '');
          if (d.win.title !== title) bad.push(`title '${d.win.title}' not '${title}'`);
          if (d.saving) bad.push('still saving: ' + name);
        });
        if (window.__closePrompts().length) bad.push('a close prompt left open');
        if ([...os.wimp.windows].some((w) => w.isOpen && w.iconByName?.('button:Replace'))) bad.push('a Replace prompt left open');
        if (window.__quitPrompts().length) bad.push('a quit prompt left open');
        if (t.word.prompt) bad.push('app.prompt left set');
        const boxes = [...os.wimp.windows].filter((w) => w.isOpen && /^Save /.test(w.title ?? ''));
        if (boxes.length) bad.push('a Save box left open');
        const n = [...os.wimp.windows].filter((w) => w.isOpen && w.task === t).length;
        if (n !== window.__w0 + docs.length * window.__perDoc) bad.push(`open windows ${n} for ${docs.length} documents`);
        if (os.wimp.tasks.filter((x) => x.alive).length !== window.__base.tasks + 1) bad.push('tasks ' + os.wimp.tasks.filter((x) => x.alive).length);
        return bad;
      };
      const race = (p, ms = 3000) => Promise.race([p, window.__sleep(ms).then(() => 'hung')]);
      const okBox = async (d, rnd, res) => {
        const box = window.__box(d, 'Save as');
        if (!box.isOpen) return;
        if (rnd < 0.65) {
          box.setFilename('RAM::RamDisc0.$.R' + Math.floor(rnd * 100 % 6));
          box.emit('click', { icon: box.icons[0], button: 'select' });
          await window.__frames(1);
          // an existing file: Replace? (answered either way)
          const q = [...os.wimp.windows].find((w) => w.isOpen && w.iconByName?.('button:Replace'));
          if (q) {
            res.replace = rnd * 1000 % 1 < 0.5 ? 'Replace' : 'Cancel';
            window.__press(q, res.replace);
          }
          for (let i = 0; i < 20 && box.isOpen; i++) await window.__sleep(10);
        }
        if (box.isOpen) { res.boxClosed = true; box.close(); }
      };
      window.__act = async (kind, i, k, rnd, text) => {
        let t = window.__word();
        const docs = t.word.docs, d = docs.length ? docs[i % docs.length] : null;
        const res = { kind, saved: [] };
        window.__msgs.length = 0;
        const before = d && { id: d.stateId, path: d.path };
        const savedNow = (r) => { if (r === true && d && !d.closed && t.word.docs.some((x) => x.dw === d.dw)) res.saved.push(d); };
        if (kind === 'new' || !d) {
          await t.word.new({ paper: rnd < 0.5 ? 'a4' : 'letter' });
          res.kind = 'new';
        } else if (kind === 'type') {
          d.view.type(text);
        } else if (kind === 'save') {
          const p = d.save();
          if (!before.path) { await window.__frames(1); await okBox(d, rnd, res); }
          res.r = await race(p);
          savedNow(res.r);
        } else if (kind === 'saveas') {
          const to = 'RAM::RamDisc0.$.R' + k;
          const other = t.word.docs.find((x) => x.dw !== d.dw && x.path && x.path.toLowerCase() === to.toLowerCase());
          res.r = await race(d.saveAs(to));
          res.expect = !other;
          savedNow(res.r);
        } else if (kind === 'revert') {
          window.__answer = rnd < 0.5 ? 'Discard' : 'Cancel';
          res.r = await race(d.revert());
        } else if (kind === 'close') {
          const p = d.requestClose();
          await window.__frames(1);
          const w = window.__closePrompts()[0];
          if (w) {
            res.answer = rnd < 0.3 ? 'Save' : rnd < 0.65 ? 'Discard' : 'Cancel';
            window.__press(w, res.answer);
            if (res.answer === 'Save' && !before.path) { await window.__frames(1); await okBox(d, (rnd * 7) % 1, res); }
          }
          res.r = await race(p);
        } else if (kind === 'reopen') {
          const to = 'RAM::RamDisc0.$.R' + k;
          if (os.vfs.exists(to)) await race(t.word.open(to));
        } else if (kind === 'quit') {
          // (now and then with nothing to save: Word quits, restarted)
          if (rnd < 0.25) for (const x of t.word.docs) if (x.view.dirty) x.dw.close();
          const p = t.word.quit();
          await window.__frames(1);
          const w = window.__quitPrompts()[0];
          if (w) window.__press(w, 'Cancel');
          res.r = await race(p);
          if (res.r === true) { res.restarted = true; await window.__start(); }
        }
        await window.__frames(1);
        t = window.__word();
        res.bad = window.__check();
        res.msgs = window.__msgs.filter((m) => !/open in another window/.test(m));
        // a successful Save, no edits since: the file is the document
        res.files = [];
        for (const s of res.saved) {
          if (s.view.dirty || !s.path) continue;
          res.files.push({ path: s.path, file: await window.__bytes(s.path), doc: Array.from(await s.saveBytes()) });
        }
        delete res.saved;
        if (kind === 'saveas' && res.r !== res.expect && res.r !== 'hung') res.bad.push(`saveas gave ${res.r}, expected ${res.expect}`);
        if (res.r === 'hung') res.bad.push('hung');
        return res;
      };
    });
    const rnd = rng(20261007), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KINDS = ['new', 'new', 'type', 'type', 'type', 'type', 'save', 'save', 'saveas', 'saveas', 'revert', 'close', 'close', 'reopen', 'quit'];
    const TEXT = ['a', 'word ', '\u00e9t\u00e9 ', '\u{1F600}', 'Line\tTab ', '\u65e5\u672c '];
    const kinds = {}, bad = [];
    let files = 0, fileBad = [];
    const t0 = Date.now();
    for (let n = 0; n < 500; n++) {
      const kind = pick(KINDS);
      const res = await ev(([kind, i, k, r, text]) => window.__act(kind, i, k, r, text),
        [kind, Math.floor(rnd() * 50), Math.floor(rnd() * 6), rnd(), pick(TEXT)]);
      const key = res.kind + (res.answer ? ':' + res.answer : '') + (res.restarted ? ':quit' : '')
        + (res.replace ? ':' + res.replace : '');
      kinds[key] = (kinds[key] ?? 0) + 1;
      if (res.bad.length || res.msgs.length || pageErrors()) bad.push({ n, kind: res.kind, bad: res.bad, msgs: res.msgs, errs: pageErrors() });
      for (const f of res.files) {
        files++;
        const why = await differ(f.file, f.doc, f.path);
        if (why) fileBad.push({ n, path: f.path, why });
      }
      if (bad.length > 3) break;
    }
    const ms = Date.now() - t0;
    const end = await ev(async () => {
      const t = window.__word();
      // (the check sees a wrong title)
      const u = await t.word.new();
      window.__by(u.leaf).win.setTitle('Wrong');
      const seen = window.__check();
      for (const d of t.word.docs) d.dw.close();
      await window.__frames(3);
      return { seen, windows: os.wimp.windows.size, dom: document.querySelectorAll('*').length, all: window.__all };
    });
    timings.push(`500 random actions: ${ms} ms, ${files} saved files read back; ${JSON.stringify(kinds)}`);
    ok('500 seeded random actions: titles, stars, paths, leaves and keys consistent; no stray windows, prompts, boxes or tasks; no errors',
      !bad.length, bad);
    ok('... every successful Save with no edits after it: the file reads back equal to the document', files > 20 && !fileBad.length,
      { files, fileBad: fileBad.slice(0, 3) });
    ok('... every kind of action ran (close answered Save, Discard and Cancel; a quit with nothing to save restarted)',
      ['new', 'type', 'save', 'saveas', 'revert', 'close:Save', 'close:Discard', 'close:Cancel', 'reopen', 'quit', 'quit:quit'].every((k) => kinds[k] > 0), kinds);
    ok('(the check does see a wrong title)', end.seen.some((x) => /title 'Wrong'/.test(x)), end.seen);
    ok('... and nothing is left behind once the windows are closed', end.windows === end.all.windows && Math.abs(end.dom - end.all.dom) <= 5, end);
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
if (timings.length) console.log('timings: ' + timings.join('; '));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
