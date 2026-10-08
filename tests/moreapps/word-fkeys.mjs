// !Word's RISC OS function keys and Ctrl-S / Ctrl-N in the real
// desktop, by real key presses with the caret in a document: F2 and
// Ctrl-N a new untitled document with the caret; Ctrl-F2 closes the
// window (asking first when it has changes); F3 the Save as box near
// the caret (once: the box is kept), for an untitled document the
// same as Save; Ctrl-S saves in place (an untitled document: the Save
// box); F8 / F9 undo and redo; Ctrl-F10 sends the window to the back.
// A key held down (auto-repeat) does New, Close, Save and Save as
// once. F4 opens the Find box (as Ctrl-F: word-find.mjs). Keys the
// window does not use go on to the desktop (F1, Shift-F4, F5, F6,
// F7, F10, F11, Shift-F2, Ctrl-F5, Alt-F2; F12 and its forms are the
// desktop's hot keys). The menus
// show the keys; on a Mac Cmd-S saves and Cmd-N makes a new
// document. 30 cycles leak nothing. Needs the disc built by
// tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = await buildDocx({ 'word/document.xml': documentXml(p(r('First line.')) + p(r('Second line.'))) });
const texts = async (bytes) => (await readDocx(new Uint8Array(bytes))).sections.flatMap((s) => s.blocks.map((b) => b.text));

/** Boot with navigator.platform = platform, Plain on the RAM disc, !Word running. */
async function start(page, platform) {
  await page.addInitScript((pf) => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => pf, configurable: true }); }, platform);
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.evaluate(async (a) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    os.vfs.writeFile('RAM::RamDisc0.$.Plain', new Uint8Array(a), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__until = async (f, ms = 3000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await window.__sleep(20); return !!f(); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__docs = () => window.__word().word.docs.filter((d) => !d.closed);
    window.__by = (leaf) => window.__docs().find((d) => d.leaf === leaf);
    window.__prompts = () => [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Save') && q.iconByName('button:Discard'));
    window.__saveBoxes = () => [...os.wimp.windows].filter((q) => q.isOpen && q.title === 'Save as');
    window.__focus = async (leaf) => {
      const d = window.__by(leaf);
      d.win.bringToFront();
      d.dw.view.focus();
      await window.__frames(2);
      return os.wimp.caret?.window === d.win;
    };
    /** A keydown as the browser fires it, at the text field: whether it was prevented. */
    window.__kd = (key, o = {}) => {
      const e = new KeyboardEvent('keydown', { key, code: o.code ?? key, ctrlKey: !!o.ctrl, shiftKey: !!o.shift,
        altKey: !!o.alt, metaKey: !!o.meta, repeat: !!o.repeat, bubbles: true, cancelable: true });
      os.wimp.textInput.el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    window.__closeAll = async (keep) => {
      for (const d of window.__docs()) if (d.leaf !== keep) d.dw.close();
      await window.__frames(2);
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.open('RAM::RamDisc0.$.Plain');
    await window.__frames(3);
  }, Array.from(plain));
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(2)); };
try {
  await start(page, 'Win32');
  ok('Plain is open and holds the caret', await ev(() => window.__focus('Plain')));
  const base = await ev(() => ({ windows: os.wimp.windows.size, dom: document.querySelectorAll('*').length }));

  // ------------------------------------------------ F2 and Ctrl-N: New
  for (const key of ['F2', 'Control+n']) {
    await ev(() => window.__focus('Plain'));
    const n0 = await ev(() => window.__docs().length);
    await press(key);
    const s = await ev(() => {
      const ds = window.__docs(), d = ds.at(-1);
      return { n: ds.length, leaf: d.leaf, untitled: d.untitled, caret: os.wimp.caret?.window === d.win, focus: d.dw.view.hasFocus };
    });
    await page.keyboard.type('abc');
    const t = await ev(() => { const d = window.__docs().at(-1); return { text: d.text, title: d.win.title }; });
    ok(`${key}: one new untitled document with the caret; typing goes into it`, s.n === n0 + 1 && /^Untitled/.test(s.leaf)
      && s.untitled && s.caret && s.focus && same(t.text, ['abc']) && t.title === s.leaf + ' *', { s, t });
    await ev(() => window.__closeAll('Plain'));
  }

  // ------------------------------------------------ auto-repeat: one action per press
  {
    await ev(() => window.__focus('Plain'));
    const r = await ev(async () => {
      const n0 = window.__docs().length;
      const prevented = [];
      for (let i = 0; i < 50; i++) prevented.push(window.__kd('F2', { repeat: true }));
      for (let i = 0; i < 50; i++) prevented.push(window.__kd('n', { code: 'KeyN', ctrl: true, repeat: true }));
      await window.__frames(2);
      const n1 = window.__docs().length;
      window.__kd('F3', { repeat: true });
      window.__kd('s', { code: 'KeyS', ctrl: true, repeat: true });
      await window.__frames(2);
      const boxes = window.__saveBoxes().length;
      window.__by('Plain').view.type('R');
      window.__kd('F2', { ctrl: true, repeat: true });
      await window.__frames(2);
      const prompts = window.__prompts().length, open = window.__by('Plain')?.win.isOpen;
      window.__by('Plain').view.press('undo');
      // a press (not repeat): one
      window.__kd('F2');
      await window.__frames(2);
      const n2 = window.__docs().length;
      return { n0, n1, n2, boxes, prompts, open, allPrevented: prevented.every(Boolean), saving: window.__by('Plain').saving };
    });
    ok('held keys (auto-repeat): F2, Ctrl-N, F3, Ctrl-S and Ctrl-F2 do nothing and go no further; a press then does one New',
      r.n1 === r.n0 && r.boxes === 0 && r.prompts === 0 && r.open && r.allPrevented && r.n2 === r.n0 + 1 && !r.saving, r);
    await ev(() => window.__closeAll('Plain'));
  }

  // ------------------------------------------------ F3: the Save as box near the caret
  {
    await ev(() => window.__focus('Plain'));
    await press('F3');
    const s = await ev(() => {
      const d = window.__by('Plain'), b = d.dw.boxes.get('saveas');
      const c = d.dw.view.caretRect(), cs = c && d.win.workToScreen(c.x, c.y);
      return { open: b?.isOpen, n: window.__saveBoxes().length, menu: os.wimp.menus.isOpen, name: b?.filename(),
        caretInBox: os.wimp.caret?.window === b, near: b && cs && Math.abs(b.x - cs.x) < 200 && Math.abs(b.y - cs.y) < 200,
        box: b && { x: b.x, y: b.y }, cs };
    });
    ok('F3 opens the Save as box near the caret, with the file\'s name and the caret in it', s.open && s.n === 1 && s.menu
      && s.name === 'RAM::RamDisc0.$.Plain' && s.caretInBox && s.near, s);
    const s2 = await ev(async () => {
      const d = window.__by('Plain'), b = d.dw.boxes.get('saveas');
      // the key again while the box is open (sent to the window): the same box, still one
      d.win.emit('key', { code: 0x183, key: 'F3', shift: false, ctrl: false, alt: false });
      d.win.emit('key', { code: 0x183, key: 'F3', shift: false, ctrl: false, alt: false });
      await window.__frames(2);
      return { same: d.dw.boxes.get('saveas') === b, n: window.__saveBoxes().length, windows: os.wimp.windows.size };
    });
    const w0 = await ev(() => os.wimp.windows.size);
    ok('F3 again: the same box, never two', s2.same && s2.n === 1 && s2.windows === w0, s2);
    await press('Escape');
    const s3 = await ev(() => ({ open: window.__by('Plain').dw.boxes.get('saveas')?.isOpen ?? false, n: window.__saveBoxes().length }));
    ok('Escape closes the Save as box', !s3.open && s3.n === 0, s3);
    // F3 a second time: it opens again (the kept box)
    await ev(() => window.__focus('Plain'));
    await press('F3');
    const s4 = await ev(() => ({ n: window.__saveBoxes().length }));
    ok('F3 opens it again after it closed', s4.n === 1, s4);
    await press('Escape');
    // untitled: F3 is Save (the box, centred, a free name)
    const u = await ev(async () => {
      const dw = await window.__word().word.newUntitled();
      dw.view.focus();
      await window.__frames(2);
      return dw.leaf;
    });
    await page.keyboard.type('u');
    await press('F3');
    const s5 = await ev((leaf) => {
      const d = window.__by(leaf), b = d.dw.boxes.get('saveas');
      return { open: b?.isOpen, n: window.__saveBoxes().length, name: b?.filename(), saving: d.saving,
        centred: b && Math.abs(b.x + b.w / 2 - os.wimp.width / 2) < 4 };
    }, u);
    ok('F3 on an untitled document opens the Save box as Save does (centred, a new name)', s5.open && s5.n === 1
      && /Untitled|Document|docx/i.test(s5.name) && s5.centred, s5);
    await press('Escape');
    await ev(() => window.__closeAll('Plain'));
  }

  // ------------------------------------------------ Ctrl-S
  {
    await ev(() => window.__focus('Plain'));
    await page.keyboard.type('X');
    const t0 = await ev(() => window.__by('Plain').win.title);
    await press('Control+s');
    await ev(() => window.__until(() => window.__by('Plain').win.title === 'Plain' && !window.__by('Plain').saving));
    const s = await ev(async () => ({ title: window.__by('Plain').win.title, bytes: Array.from(await os.vfs.readFile('RAM::RamDisc0.$.Plain')),
      boxes: window.__saveBoxes().length, msgs: window.__msgs }));
    const tx = await texts(s.bytes);
    ok('Ctrl-S on a titled document with changes writes its file and clears the star', t0 === 'Plain *' && s.title === 'Plain'
      && tx[0] === 'XFirst line.' && s.boxes === 0 && s.msgs.length === 0, { t0, title: s.title, tx, msgs: s.msgs });
    const u = await ev(async () => {
      const dw = await window.__word().word.newUntitled();
      dw.view.focus();
      await window.__frames(2);
      return dw.leaf;
    });
    await page.keyboard.type('v');
    await press('Control+s');
    const s2 = await ev((leaf) => {
      const d = window.__by(leaf), b = d.dw.boxes.get('saveas');
      return { open: b?.isOpen, n: window.__saveBoxes().length, title: d.win.title };
    }, u);
    ok('Ctrl-S on an untitled document opens the Save box', s2.open && s2.n === 1 && s2.title === u + ' *', s2);
    await press('Escape');
    await ev(() => window.__closeAll('Plain'));
  }

  // ------------------------------------------------ Ctrl-F2: close
  {
    await ev(() => window.__focus('Plain'));
    await page.keyboard.type('Q');
    await press('Control+F2');
    const c = await ev(() => ({ prompts: window.__prompts().length, leaf: window.__word().word.prompt?.leaf, open: window.__by('Plain')?.win.isOpen }));
    ok('Ctrl-F2 on a document with changes asks Save / Discard / Cancel', c.prompts === 1 && c.leaf === 'Plain' && c.open, c);
    await press('Escape');
    const c2 = await ev(() => ({ prompts: window.__prompts().length, open: window.__by('Plain')?.win.isOpen, title: window.__by('Plain')?.win.title }));
    ok('Escape (Cancel) keeps it', c2.prompts === 0 && c2.open && c2.title === 'Plain *', c2);
    const u = await ev(async () => {
      const dw = await window.__word().word.newUntitled();
      dw.view.focus();
      await window.__frames(2);
      return dw.leaf;
    });
    const n0 = await ev(() => window.__docs().length);
    await press('Control+F2');
    const c3 = await ev((leaf) => ({ n: window.__docs().length, gone: !window.__by(leaf), prompts: window.__prompts().length }), u);
    ok('Ctrl-F2 on a clean document closes it at once', c3.n === n0 - 1 && c3.gone && c3.prompts === 0, c3);
  }

  // ------------------------------------------------ F8 / F9: undo, redo
  {
    await ev(() => window.__focus('Plain'));
    const a = await ev(() => window.__by('Plain').text[0]);
    await page.keyboard.type('ab ');
    const b = await ev(() => window.__by('Plain').text[0]);
    await press('F8');
    const c = await ev(() => window.__by('Plain').text[0]);
    await press('F9');
    const d = await ev(() => window.__by('Plain').text[0]);
    await press('Control+z');
    const e = await ev(() => window.__by('Plain').text[0]);
    await press('Control+y');
    const f = await ev(() => window.__by('Plain').text[0]);
    ok('F8 undoes and F9 redoes, as Ctrl-Z and Ctrl-Y do', b !== a && c !== b && b.endsWith('ab First line.') && !c.includes('ab') && d === b && e === c && f === b, { a, b, c, d, e, f });
  }

  // ------------------------------------------------ Ctrl-F10: to the back
  {
    const u = await ev(async () => {
      const dw = await window.__word().word.newUntitled();
      await window.__frames(2);
      return dw.leaf;
    });
    await ev(() => window.__focus('Plain'));
    const s0 = await ev((leaf) => { const S = os.wimp.stack; return S.indexOf(window.__by('Plain').win) > S.indexOf(window.__by(leaf).win); }, u);
    await press('Control+F10');
    const s1 = await ev((leaf) => { const S = os.wimp.stack; return { back: S.indexOf(window.__by('Plain').win) < S.indexOf(window.__by(leaf).win), open: window.__by('Plain').win.isOpen }; }, u);
    ok('Ctrl-F10 sends the window to the back', s0 && s1.back && s1.open, { s0, s1 });
    await ev(() => window.__closeAll('Plain'));
  }

  // ------------------------------------------------ keys not used go on
  {
    await ev(() => window.__focus('Plain'));
    const st0 = await ev(() => ({ n: window.__docs().length, text: window.__by('Plain').text, boxes: window.__saveBoxes().length,
      rulerOn: window.__by('Plain').rulerOn, zoom: window.__by('Plain').zoom }));
    await ev(() => { window.__seen = []; window.__off = os.wimp.on('key', (e) => { window.__seen.push(e.code); }); });
    const keys = [['F1', 0x181], ['Shift+F4', 0x194], ['F5', 0x185], ['F6', 0x186], ['F7', 0x187], ['F10', 0x1CA], ['F11', 0x1CB],
      ['Shift+F2', 0x192], ['Shift+F3', 0x193], ['Control+F5', 0x1A5], ['Alt+F2', 0x182], ['Control+Shift+F2', 0x1B2]];
    for (const [k] of keys) await press(k);
    await ev(() => window.__until(() => window.__seen.length >= 12, 2000));
    const seen = await ev(() => { window.__off(); return [...window.__seen]; });
    const st1 = await ev(() => ({ n: window.__docs().length, text: window.__by('Plain').text, boxes: window.__saveBoxes().length,
      rulerOn: window.__by('Plain').rulerOn, zoom: window.__by('Plain').zoom, prompts: window.__prompts().length }));
    ok('F1, Shift-F4, F5, F6, F7, F10, F11, Shift-F2, Shift-F3, Ctrl-F5, Alt-F2, Ctrl-Shift-F2 go on to the desktop and do nothing here',
      keys.every(([, c]) => seen.includes(c)) && same(st0, { ...st1, prompts: undefined }) && st1.prompts === 0, { seen, st0, st1 });
    const h = await ev(() => {
      const w = window.__by('Plain').win;
      const k = (code, key, o = {}) => { const e = w.emit('key', { code, key, shift: false, ctrl: false, alt: false, ...o }); return !!(e.handled || e.defaultPrevented); };
      return { F12: k(0x1CC, 'F12'), sF12: k(0x1DC, 'F12', { shift: true }), cF12: k(0x1EC, 'F12', { ctrl: true }),
        csF12: k(0x1FC, 'F12', { ctrl: true, shift: true }), F5: k(0x185, 'F5'), altF3: k(0x183, 'F3', { alt: true }),
        bareF5: k(0x185, ''), altF4: k(0x184, 'F4', { alt: true }) };
    });
    ok('the window never takes F12 (any form), F5, Alt-F3 or Alt-F4', Object.values(h).every((v) => v === false), h);
    // F4: the Find box (closed again: the caret back in the document)
    await ev(() => window.__focus('Plain'));
    await press('F4');
    const f4 = await ev(() => {
      const b = window.__word().word.find.box;
      const r = { open: b.isOpen, caret: os.wimp.caret?.window === b.win };
      b.close();
      return { ...r, back: os.wimp.caret?.window === window.__by('Plain').win };
    });
    ok('F4 opens the Find box with the caret in it; closed, the caret is back in the document', f4.open && f4.caret && f4.back, f4);
    // a real Ctrl-F12 (the task window hook stubbed: only counted)
    const hk = await ev(async () => {
      window.__hk = { t: os.hooks.taskWindow, n: 0 };
      os.hooks.taskWindow = () => { window.__hk.n++; };
      return window.__focus('Plain');
    });
    await press('Control+F12');
    const hn = await ev(() => { os.hooks.taskWindow = window.__hk.t; return window.__hk.n; });
    ok('Ctrl-F12 with the caret in a document still reaches the desktop\'s hot key', hk && hn === 1, { hk, hn });
  }

  // ------------------------------------------------ the menus show the keys
  {
    const m = await ev(() => {
      const d = window.__by('Plain');
      const top = d.win.menu({}).items.map((i) => [i.text, i.key ?? '']);
      const ed = d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.map((i) => [i.text, i.key ?? '']);
      return { top, ed };
    });
    ok('the window menu shows Ctrl+S, F3, F2 and Ctrl+F2', same(m.top, [['Save', 'Ctrl+S'], ['Save as', 'F3'], ['Revert', ''],
      ['Save a copy', ''], ['Info', ''], ['Edit', ''], ['Format', ''], ['Zoom', ''], ['New', 'F2'], ['Close', 'Ctrl+F2']]), m.top);
    ok('the Edit menu shows Ctrl+Z, Ctrl+Y and Ctrl+F for Find... (F4 named in its help)', m.ed[0][1] === 'Ctrl+Z'
      && m.ed[1][1] === 'Ctrl+Y' && same(m.ed.find((x) => x[0] === 'Find...'), ['Find...', 'Ctrl+F']), m.ed);
    const tb = await ev(() => { const d = window.__by('Plain'); return { toolbar: !!d.toolbar, ruler: d.rulerOn, zoom: d.zoom }; });
    ok('the toolbar and ruler are as they were', tb.toolbar && tb.ruler && tb.zoom === 100, tb);
  }

  // ------------------------------------------------ 30 cycles leak nothing
  {
    await ev(() => window.__closeAll('Plain'));
    const before = await ev(() => ({ windows: os.wimp.windows.size, task: window.__word().windows.size, dom: document.querySelectorAll('*').length }));
    for (let i = 0; i < 30; i++) {
      await ev(() => window.__focus('Plain'));
      await page.keyboard.press('F2');
      await page.keyboard.press('Control+F2');
      await ev(() => window.__focus('Plain'));
      await page.keyboard.press('F3');
      await page.keyboard.press('Escape');
    }
    await ev(() => window.__frames(3));
    const after = await ev(() => ({ windows: os.wimp.windows.size, task: window.__word().windows.size, dom: document.querySelectorAll('*').length,
      docs: window.__docs().length, prompts: window.__prompts().length, boxes: window.__saveBoxes().length }));
    ok('30 cycles of F2, Ctrl-F2, F3, Escape leak nothing', after.windows === before.windows && after.task === before.task
      && Math.abs(after.dom - before.dom) < 20 && after.docs === 1 && after.prompts === 0 && after.boxes === 0, { before, after, base });
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ===================================================================== a Mac: Cmd-S, Cmd-N
{
  const { browser: b2, page: p2, logs: l2 } = await launch();
  const e2 = (fn, arg) => p2.evaluate(fn, arg);
  try {
    await start(p2, 'MacIntel');
    await e2(() => window.__focus('Plain'));
    await p2.keyboard.type('M');
    // (dispatched: Chromium keeps Cmd-N for itself on a real Mac)
    const r = await e2(async () => {
      window.__kd('s', { code: 'KeyS', meta: true });
      await window.__until(() => window.__by('Plain').win.title === 'Plain' && !window.__by('Plain').saving);
      const title = window.__by('Plain').win.title;
      const n0 = window.__docs().length;
      window.__kd('n', { code: 'KeyN', meta: true });
      await window.__frames(2);
      const n1 = window.__docs().length;
      const d = window.__by('Plain');
      const top = d.win.menu({}).items.map((i) => [i.text, i.key ?? '']).filter((x) => x[1]);
      return { title, n0, n1, top };
    });
    ok('Mac: Cmd-S saves, Cmd-N makes a new document', r.title === 'Plain' && r.n1 === r.n0 + 1, r);
    ok('Mac: the window menu shows Cmd+S, F3, F2, Ctrl+F2', same(r.top, [['Save', 'Cmd+S'], ['Save as', 'F3'], ['New', 'F2'], ['Close', 'Ctrl+F2']]), r.top);
  } catch (e) {
    out.push('FAIL exception (Mac) ' + (e.stack ?? e));
  }
  logs.push(...l2);
  await b2.close();
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
