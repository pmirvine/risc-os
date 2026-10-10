// !Word's New, Recent and quitting in the real desktop: a click on
// its icon bar icon makes one new 'Untitled' document with the caret
// in it (a double-click makes one, not two; Adjust none); the icon bar
// menu is New, Recent, Info, Quit; files opened and saved are listed
// under Recent (kept in Choices:Word across runs, missing files
// hidden, corrupt or hostile choices ignored, a failing write
// harmless) and choosing one opens it or brings it to the front.
// Quit and the Task Manager's / shutdown's PreQuit ask once
// (Discard / Cancel) when documents have changes; PreQuit objects at
// once; a close prompt already open is answered first. A save queued
// before Discard does not write the discarded changes; 50 dirty
// windows, 30 new / save / close cycles. Needs the disc built by
// tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const plain = await buildDocx({ 'word/document.xml': documentXml(p(r('First line.'))) });
const texts = async (bytes) => (await readDocx(new Uint8Array(bytes))).sections.flatMap((s) => s.blocks.map((b) => b.text));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
// a button of the open prompt, clicked with the real mouse
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
// the centre of Word's icon bar icon, in page pixels
const iconAt = () => ev(() => {
  const b = [...window.__word().iconbarIcons][0].icon.el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
const waitDocs = (n) => ev(async (n) => {
  for (let i = 0; i < 80 && window.__word().word.docs.length < n; i++) await window.__sleep(50);
  await window.__frames(3);
  return window.__word().word.docs.length;
}, n);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (a) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const n of ['Plain', 'Other', 'Carry']) os.vfs.writeFile('RAM::RamDisc0.$.' + n, new Uint8Array(a), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__bytes = async (path) => Array.from(await os.vfs.readFile(path));
    window.__menu = () => { const i = [...window.__word().iconbarIcons][0]; return typeof i.menu === 'function' ? i.menu({}) : i.menu; };
    window.__quitPrompts = () => [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Discard') && !q.iconByName('button:Save'));
    window.__closePrompts = () => [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Save') && q.iconByName('button:Discard'));
    window.__text = (w) => w.iconByName('message').text;
    window.__start = async () => {
      await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
      for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
      await window.__word().word.recentReady;
    };
    window.__count = () => ({ windows: os.wimp.windows.size, tasks: os.wimp.tasks.filter((t) => t.alive).length });
    if (os.vfs.exists('ADFS::HardDisc4.$.!Boot.Choices.Word')) os.vfs.delete('ADFS::HardDisc4.$.!Boot.Choices.Word');
    window.__base = window.__count();
    await window.__start();
    // what the Wimp sends for a click on Word's icon (its onClick, seen)
    window.__ibev = [];
    const it = [...window.__word().iconbarIcons][0], was = it.onClick;
    it.onClick = (e) => { window.__ibev.push('click:' + e.kind + ':' + e.button); return was?.(e); };
  }, Array.from(plain));

  // ------------------------------------------------ the icon bar: New
  let at = await iconAt();
  await page.mouse.click(at.x, at.y);
  await waitDocs(1);
  await page.keyboard.type('Hello');
  const i1 = await ev(async () => {
    await window.__frames(3);
    const t = window.__word(), d = t.word.docs[0];
    return { n: t.word.docs.length, leaf: d?.leaf, lines: d?.view.lines(), focus: d?.dw.view.hasFocus, title: d?.win.title,
      ev: window.__ibev.splice(0) };
  });
  ok('a click on the icon bar icon makes one Untitled document', i1.n === 1 && i1.leaf === 'Untitled', i1);
  ok('the new document has the caret: typing goes into it', i1.focus && i1.lines?.[0] === 'Hello' && i1.title === 'Untitled *', i1);
  await page.waitForTimeout(900);   // (past the 500 ms guard, with room)
  await page.mouse.click(at.x, at.y);
  await waitDocs(2);
  const i2 = await ev(() => ({ leaves: window.__word().word.docs.map((d) => d.leaf), ev: window.__ibev.splice(0) }));
  ok('a second click makes Untitled 2', i2.leaves.join() === 'Untitled,Untitled 2', i2);
  await page.waitForTimeout(900);   // (past the 500 ms guard, with room)
  await page.mouse.dblclick(at.x, at.y);
  await waitDocs(3);
  await page.waitForTimeout(900);
  const i3 = await ev(() => ({ n: window.__word().word.docs.length, ev: window.__ibev.splice(0) }));
  ok('a double-click makes one document, not two', i3.n === 3, i3);
  ok('what the Wimp sends for a double-click on the icon: two Select clicks', i3.ev.join() === 'click:click:select,click:click:select', i3.ev);
  await page.waitForTimeout(900);   // (past the 500 ms guard, with room)
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(500);
  const i4 = await ev(() => ({ n: window.__word().word.docs.length, ev: window.__ibev.splice(0) }));
  ok('an Adjust click makes no document', i4.n === 3 && i4.ev.join() === 'click:click:adjust', i4);
  const i5 = await ev(async () => {
    const t = window.__word(), m = window.__menu();
    const res = { items: m.items.map((i) => i.text), recentShaded: typeof m.items[1].shaded === 'function' ? m.items[1].shaded() : !!m.items[1].shaded };
    m.items.find((i) => i.text === 'New').action();
    for (let i = 0; i < 60 && t.word.docs.length < 4; i++) await window.__sleep(50);
    res.n = t.word.docs.length;
    res.wm = t.word.docs[0].win.menu({}).items.map((i) => i.text);
    const before = t.word.docs.length;
    await t.word.new({ paper: 'letter' });
    res.letter = t.word.docs.length - before;
    for (const d of t.word.docs) d.dw.close();
    return res;
  });
  ok('the icon bar menu: New, Recent, Info, Quit (Recent shaded while empty)', i5.items.join() === 'New,Recent,Info,Quit' && i5.recentShaded, i5);
  ok('New in the icon bar menu makes a document; app.newDoc({paper}) too', i5.n === 4 && i5.letter === 1, i5);
  ok('the window menu has New', i5.wm.join() === 'Save,Save as,Revert,Save a copy,Info,Edit,Insert,Format,Zoom,New,Close', i5.wm);

  // ------------------------------------------------ Recent
  const r1 = await ev(async () => {
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Plain');
    const u = await t.word.new();
    const d = window.__by(u.leaf);
    d.view.type('saved');
    await d.saveAs('RAM::RamDisc0.$.Saved');
    await window.__frames(2);
    const m = window.__menu(), it = m.items.find((i) => i.text === 'Recent');
    const sub = typeof it.submenu === 'function' ? it.submenu() : it.submenu;
    return { recent: t.word.recent, choices: JSON.parse(await os.vfs.readText('Choices:Word')).recent,
      sub: sub.items.map((i) => i.text), shaded: typeof it.shaded === 'function' ? it.shaded() : !!it.shaded };
  });
  ok('opening and saving list the files under Recent, newest first', r1.recent.join() === 'RAM::RamDisc0.$.Saved,RAM::RamDisc0.$.Plain'
    && r1.sub.join() === 'Saved,Plain' && !r1.shaded, r1);
  ok('the list is kept in Choices:Word', r1.choices.join() === r1.recent.join(), r1);
  const r2 = await ev(async () => {
    const t = window.__word();
    const s = window.__by('Saved');
    s.win.sendToBack?.();
    const S = os.wimp.stack;
    const sub = () => window.__menu().items.find((i) => i.text === 'Recent').submenu();
    const n0 = t.word.docs.length;
    sub().items.find((i) => i.text === 'Saved').action();
    await window.__frames(3);
    const res = { same: t.word.docs.length === n0, front: S.indexOf(s.win) === Math.max(...t.word.docs.map((d) => S.indexOf(d.win))) };
    window.__by('Plain').dw.close();
    sub().items.find((i) => i.text === 'Plain').action();
    for (let i = 0; i < 60 && !window.__by('Plain'); i++) await window.__sleep(50);
    res.reopened = !!window.__by('Plain');
    // the same file by another spelling is not listed twice
    window.__by('Plain').dw.close();
    await t.word.open('ram::ramdisc0.$.plain');
    res.recent = t.word.recent;
    // a file that has gone is not shown, and is dropped when the list is next written
    for (const d of t.word.docs) d.dw.close();
    os.vfs.delete('RAM::RamDisc0.$.Plain');
    res.sub = sub().items.map((i) => i.text);
    await t.word.open('RAM::RamDisc0.$.Other');
    res.after = JSON.parse(await os.vfs.readText('Choices:Word')).recent;
    window.__by('Other').dw.close();
    res.msgs = window.__msgs.splice(0);
    return res;
  });
  ok('choosing a recent file that is open brings it to the front', r2.same && r2.front, r2);
  ok('choosing a recent file that is closed opens it', r2.reopened, r2);
  ok('the same file in another case is listed once', r2.recent.length === 2 && /plain$/i.test(r2.recent[0]), r2.recent);
  ok('a file that has gone is hidden, and dropped at the next write', r2.sub.join() === 'Saved'
    && r2.after.join() === 'RAM::RamDisc0.$.Other,RAM::RamDisc0.$.Saved' && !r2.msgs.length, r2);
  const r3 = await ev(async () => {
    const res = {};
    window.__word().quit();
    await window.__sleep(100);
    await window.__start();
    res.restarted = window.__word().word.recent;
    // corrupt, then hostile choices
    window.__word().quit();
    os.vfs.writeFile('ADFS::HardDisc4.$.!Boot.Choices.Word', 'not json {', { filetype: 0xFFF });
    await window.__start();
    res.corrupt = window.__word().word.recent;
    res.menu = window.__menu().items.map((i) => i.text).join();
    window.__word().quit();
    const big = [];
    for (let i = 0; i < 10000; i++) big.push(i % 3 ? '__proto__' : i % 5 ? 42 : 'RAM::RamDisc0.$.Saved');
    os.vfs.writeFile('ADFS::HardDisc4.$.!Boot.Choices.Word', JSON.stringify({ recent: big, __proto__: { x: 1 } }), { filetype: 0xFFF });
    const t0 = performance.now();
    await window.__start();
    res.ms = performance.now() - t0;
    res.hostile = window.__word().word.recent;
    window.__word().quit();
    os.vfs.writeFile('ADFS::HardDisc4.$.!Boot.Choices.Word', JSON.stringify({ recent: 'nope' }), { filetype: 0xFFF });
    await window.__start();
    res.notList = window.__word().word.recent;
    // a write that fails (locked) does not stop a save
    os.vfs.setAccess('ADFS::HardDisc4.$.!Boot.Choices.Word', 8 | 3);
    const t = window.__word();
    const u = await t.word.new();
    const d = window.__by(u.leaf);
    d.view.type('x');
    res.saved = await d.saveAs('RAM::RamDisc0.$.Locked');
    res.dirty = d.view.dirty;
    res.recentAfter = t.word.recent;
    res.msgs = window.__msgs.splice(0);
    os.vfs.setAccess('ADFS::HardDisc4.$.!Boot.Choices.Word', 3);
    d.dw.close();
    return res;
  });
  ok('Recent survives quitting and starting Word again', r3.restarted?.join() === 'RAM::RamDisc0.$.Other,RAM::RamDisc0.$.Saved', r3);
  ok('corrupt Choices:Word: an empty list, no error', r3.corrupt?.length === 0 && r3.menu === 'New,Recent,Info,Quit', r3);
  ok('hostile Choices:Word (10,000 entries, __proto__, numbers): a safe list', r3.hostile?.join() === 'RAM::RamDisc0.$.Saved'
    && Object.prototype.x === undefined && r3.ms < 30000 && r3.notList?.length === 0, r3);
  ok('a Choices:Word that cannot be written does not stop a save', r3.saved === true && !r3.dirty
    && r3.recentAfter[0] === 'RAM::RamDisc0.$.Locked' && !r3.msgs.length, r3);

  // ------------------------------------------------ Quit from the icon bar
  const q1 = await ev(async () => {
    const t = window.__word();
    await t.word.new();
    window.__menu().items.find((i) => i.text === 'Quit').action();
    const res = { aliveAtOnce: t.alive };
    await window.__frames(2);
    res.count = window.__count();
    res.base = window.__base;
    res.prompts = window.__quitPrompts().length;
    return res;
  });
  ok('Quit with no changes quits at once', !q1.aliveAtOnce && q1.prompts === 0 && q1.count.windows === q1.base.windows
    && q1.count.tasks === q1.base.tasks, q1);
  const q2 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    for (let i = 0; i < 3; i++) await t.word.new();
    t.word.docs[0].view.type('a');
    t.word.docs[1].view.type('b');
    window.__menu().items.find((i) => i.text === 'Quit').action();
    await window.__frames(3);
    const w = window.__quitPrompts();
    return { n: w.length, text: w[0] && window.__text(w[0]), names: w[0]?.icons.filter((i) => i?.name?.startsWith('button:')).map((i) => i.name),
      alive: t.alive, close: window.__closePrompts().length };
  });
  ok('Quit with changes asks once, with the count', q2.n === 1 && q2.close === 0 && q2.text === '2 documents have unsaved changes.' && q2.alive, q2);
  ok('the quit prompt has Discard and Cancel', q2.names?.sort().join() === 'button:Cancel,button:Discard', q2);
  await clickButton('Cancel');
  const q3 = await ev(() => ({ alive: !!window.__word(), docs: window.__word()?.word.docs.length, dirty: window.__word()?.word.docs.filter((d) => d.view.dirty).length,
    prompts: window.__quitPrompts().length }));
  ok('Cancel keeps Word and every document', q3.alive && q3.docs === 3 && q3.dirty === 2 && q3.prompts === 0, q3);
  const q4 = await ev(async () => {
    const t = window.__word();
    window.__menu().items.find((i) => i.text === 'Quit').action();
    await window.__frames(2);
    window.__menu().items.find((i) => i.text === 'Quit').action();   // (twice: still one prompt)
    await window.__frames(2);
    return { n: window.__quitPrompts().length };
  });
  await page.keyboard.press('Enter');
  const q5 = await ev(async () => { await window.__frames(3); await window.__sleep(50); return { alive: !!window.__word(), count: window.__count(), base: window.__base }; });
  ok('Quit twice: one prompt; Return is Discard, and Word quits', q4.n === 1 && !q5.alive && q5.count.windows === q5.base.windows
    && q5.count.tasks === q5.base.tasks, [q4, q5]);
  const q6 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    await t.word.new();
    t.word.docs[0].view.type('a');
    const res = { mq: null };
    t.word.mayQuit().then((v) => { res.mq = v; });
    await window.__frames(3);
    res.text = window.__text(window.__quitPrompts()[0]);
    return res;
  });
  await page.keyboard.press('Escape');
  const q7 = await ev(async () => { await window.__frames(3); return { alive: !!window.__word(), prompts: window.__quitPrompts().length }; });
  ok('one document: "1 document has unsaved changes."; Escape is Cancel', q6.text === '1 document has unsaved changes.'
    && q7.alive && q7.prompts === 0, [q6, q7]);

  // ------------------------------------------------ PreQuit (Task Manager, shutdown)
  const p1 = await ev(async () => {
    const t = window.__word();
    const res = { objected: false };
    os.wimp.sendMessage('PreQuit', { single: true, object: () => { res.objected = true; } }, { to: t });
    res.atOnce = res.objected;
    await window.__frames(3);
    res.prompts = window.__quitPrompts().length;
    return res;
  });
  ok('PreQuit (one task) with changes objects at once and asks', p1.atOnce && p1.prompts === 1, p1);
  await clickButton('Cancel');
  const p2 = await ev(async () => ({ alive: !!window.__word(), docs: window.__word()?.word.docs.length }));
  ok('PreQuit, Cancel: nothing happens', p2.alive && p2.docs === 1, p2);
  await ev(() => { const t = window.__word(); os.wimp.sendMessage('PreQuit', { single: true, object: () => {} }, { to: t }); });
  await ev(() => window.__frames(3));
  await clickButton('Discard');
  const p3 = await ev(async () => { await window.__sleep(50); return { alive: !!window.__word(), count: window.__count(), base: window.__base }; });
  ok('PreQuit (one task), Discard: Word quits', !p3.alive && p3.count.windows === p3.base.windows, p3);
  const p4 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    window.__shut = 0;
    window.__realShutdown = os.switcher.shutdown;
    os.switcher.shutdown = () => { window.__shut++; };
    const res = { clean: false };
    os.wimp.sendMessage('PreQuit', { object: () => { res.clean = true; } }, { to: t });
    await window.__frames(2);
    res.cleanPrompts = window.__quitPrompts().length;
    await t.word.new();
    t.word.docs[0].view.type('a');
    res.all = await os.switcher.preQuitAll();
    await window.__frames(3);
    res.prompts = window.__quitPrompts().length;
    return res;
  });
  ok('PreQuit with no changes does not object', !p4.clean && p4.cleanPrompts === 0, p4);
  ok('PreQuit (all tasks) with changes objects and asks', p4.all === false && p4.prompts === 1, p4);
  await clickButton('Cancel');
  const p5 = await ev(async () => {
    await window.__sleep(50);
    const res = { shut: window.__shut, alive: !!window.__word() };
    os.wimp.sendMessage('PreQuit', { object: () => {} }, { to: window.__word() });
    await window.__frames(3);
    return res;
  });
  ok('PreQuit (all), Cancel: the closedown is not restarted', p5.shut === 0 && p5.alive, p5);
  await clickButton('Discard');
  const p6 = await ev(async () => {
    await window.__sleep(50);
    const t = window.__word();
    const res = { shut: window.__shut, docs: t?.word.docs.length, again: await os.switcher.preQuitAll() };
    os.switcher.shutdown = window.__realShutdown;
    t.quit();
    return res;
  });
  ok('PreQuit (all), Discard: the documents are thrown away and the closedown restarted', p6.shut === 1 && p6.docs === 0
    && p6.again === true, p6);

  // a close prompt already open when PreQuit comes
  const p7 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    const a = await t.word.new();
    window.__by(a.leaf).view.type('a');
    window.__by(a.leaf).requestClose();
    await window.__frames(2);
    const res = { objected: false };
    os.wimp.sendMessage('PreQuit', { single: true, object: () => { res.objected = true; } }, { to: t });
    res.atOnce = res.objected;
    await window.__frames(3);
    res.close = window.__closePrompts().length;
    res.quit = window.__quitPrompts().length;
    return res;
  });
  ok('PreQuit while a close prompt is open objects, and only that prompt shows', p7.atOnce && p7.close === 1 && p7.quit === 0, p7);
  await clickButton('Discard');
  const p8 = await ev(async () => { await window.__frames(3); await window.__sleep(50); return { alive: !!window.__word(), quit: window.__quitPrompts().length }; });
  ok('its Discard closes the document; nothing else has changes: Word quits, no second prompt', !p8.alive && p8.quit === 0, p8);
  const p9 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    const a = await t.word.new(), b = await t.word.new();
    window.__by(a.leaf).view.type('a');
    window.__by(b.leaf).view.type('b');
    window.__by(a.leaf).requestClose();
    await window.__frames(2);
    const res = {};
    os.wimp.sendMessage('PreQuit', { single: true, object: () => {} }, { to: t });
    await window.__frames(2);
    return res;
  });
  await clickButton('Cancel');
  const p10 = await ev(async () => {
    await window.__frames(3);
    const w = window.__quitPrompts();
    return { quit: w.length, text: w[0] && window.__text(w[0]), docs: window.__word().word.docs.length };
  });
  ok('after Cancel in the close prompt, the quit prompt asks about what is left', p10.quit === 1 && p10.docs === 2
    && p10.text === '2 documents have unsaved changes.', p10);
  await clickButton('Discard');
  const p11 = await ev(async () => { await window.__sleep(50); return { alive: !!window.__word() }; });
  ok('and Discard quits', !p11.alive, p11);

  // ------------------------------------------------ a save queued before Discard
  const c1 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Carry');
    const d = window.__by('Carry');
    const orig = d.dw.saveBytes.bind(d.dw);
    d.dw.saveBytes = async () => { const b = await orig(); await window.__sleep(400); return b; };
    d.view.type('One ');
    const s1 = d.save(), s2 = d.save();
    d.view.type('Two ');
    d.requestClose();
    await window.__frames(2);
    window.__s = Promise.all([s1, s2]);
    return { prompts: window.__closePrompts().length };
  });
  await clickButton('Discard');
  const c2 = await ev(async () => {
    const r = await window.__s;
    return { r, bytes: await window.__bytes('RAM::RamDisc0.$.Carry') };
  });
  const carried = await texts(c2.bytes);
  ok('a save queued before Discard does not write the discarded changes', c1.prompts === 1 && c2.r[0] === true && c2.r[1] === false
    && carried[0] === 'One First line.', { c1, r: c2.r, carried });

  // ------------------------------------------------ 50 dirty windows
  const f1 = await ev(async () => {
    const t = window.__word();
    for (let i = 0; i < 50; i++) { const u = await t.word.new(); window.__by(u.leaf).view.type('x'); }
    window.__menu().items.find((i) => i.text === 'Quit').action();
    await window.__frames(3);
    const w = window.__quitPrompts();
    return { n: w.length, text: w[0] && window.__text(w[0]), docs: t.word.docs.length };
  });
  await clickButton('Discard');
  const f2 = await ev(async () => { await window.__sleep(100); return { alive: !!window.__word(), count: window.__count(), base: window.__base }; });
  ok('50 windows with changes: one prompt; Discard quits and leaves nothing', f1.n === 1 && f1.docs === 50
    && f1.text === '50 documents have unsaved changes.' && !f2.alive && f2.count.windows === f2.base.windows
    && f2.count.tasks === f2.base.tasks, [f1, f2]);

  // ------------------------------------------------ 30 new / save / close cycles
  const l1 = await ev(async () => {
    await window.__start();
    const t = window.__word();
    const count = () => ({ windows: os.wimp.windows.size, task: t.windows.size, dom: document.querySelectorAll('*').length });
    const cycle = async (i) => {
      const u = await t.word.new();
      const d = window.__by(u.leaf);
      d.view.type('c' + i);
      await d.saveAs('RAM::RamDisc0.$.Cyc' + (i % 10));
      d.view.type('more');
      d.requestClose();
      await window.__frames(1);
      const w = window.__closePrompts()[0];
      w.emit('click', { icon: w.iconByName('button:Discard'), button: 'select' });
      await window.__frames(1);
    };
    await cycle(0);
    await cycle(1);
    await window.__frames(3);
    const base = count();
    for (let i = 0; i < 30; i++) await cycle(i);
    await window.__frames(3);
    return { base, after: count(), docs: t.word.docs.length, recent: t.word.recent.length, msgs: window.__msgs.splice(0) };
  });
  ok('30 new / save / close cycles leave nothing behind; Recent holds 8', l1.after.windows === l1.base.windows
    && l1.after.task === l1.base.task && Math.abs(l1.after.dom - l1.base.dom) <= 5 && l1.docs === 0 && l1.recent === 8
    && !l1.msgs.length, l1);

  // ------------------------------------------------ a forced quit (tests) asks nothing
  const z1 = await ev(async () => {
    const t = window.__word();
    const u = await t.word.new();
    window.__by(u.leaf).view.type('z');
    t.quit();
    await window.__frames(2);
    return { alive: t.alive, prompts: window.__quitPrompts().length };
  });
  ok('task.quit() still quits without asking', !z1.alive && z1.prompts === 0, z1);

  // ------------------------------------------------ the real shutdown (Ctrl-Shift-F12)
  await ev(async () => {
    await window.__start();
    const t = window.__word();
    const u = await t.word.new();
    window.__by(u.leaf).view.type('unsaved');
  });
  await page.keyboard.press('Control+Shift+F12');
  await page.waitForTimeout(600);
  const s1 = await ev(() => ({ alive: !!window.__word(), prompts: window.__quitPrompts().map((w) => window.__text(w)) }));
  ok('Shutdown with changes in Word: Word objects and asks', s1.alive && s1.prompts.join() === '1 document has unsaved changes.', s1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const s2 = await ev(() => ({ apps: os.wimp.tasks.filter((t) => t.alive && t.kind === 'app').map((t) => t.name),
    wins: [...os.wimp.windows].filter((w) => w.isOpen && !/iconbar|pinboard/.test(w.el?.className)).map((w) => w.task?.name) }));
  ok('Discard restarts the shutdown: every application quits and the restart box shows', !s2.apps.length
    && s2.wins.join() === 'Task Manager', s2);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
