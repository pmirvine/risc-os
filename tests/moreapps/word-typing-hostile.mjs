// !Word's typing, deleting and undo against hostile input in the real
// desktop: 100,000 characters typed at once (through the Wimp's text
// field), a storm of 5000 mixed events, everything selected in a
// 50,000-paragraph document and replaced by one character, storms of
// Backspace and of Enter (20,000 new paragraphs), 1000 undos and
// redos, an input method composing while its window closes, a
// document whose first block is a table, an empty document, a
// 100,000-character word, and 500 seeded random key, text and mouse
// actions (after each: the selection valid; the model passes
// ModelCheck.checkBlock; undoing everything gives back the opened
// model). No page errors, no error boxes.
// Positions come from the layout the test hook gives
// (task.word.docs[i].view, ./EditView hook()).
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { BODIES } from './hostile-docs.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' + p(r('a cell')) + '</w:tc></w:tr></w:tbl>';
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const para = (i) => p(r(`${i}: ` + WORDS.slice(0, 3 + (i % 5)).join(' ')));
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const files = {
  Plain: Array.from(await docx(Array.from({ length: 30 }, (_, i) => para(i)).join(''))),
  Huge: Array.from(await docx(Array.from({ length: 50000 }, (_, i) => p(r(`${i} ${WORDS[i % 10]}`))).join(''))),
  TableFirst: Array.from(await docx(TBL + p(r('after the table')) + TBL)),
  Empty: Array.from(await docx('')),
  Word: Array.from(await docx(p(r('x'.repeat(100000))))),
  Mixed: Array.from(await docx(BODIES.mixed + p(r('A ')) + '<w:p><w:hyperlink><w:r><w:t>link</w:t></w:r></w:hyperlink>' +
    r(' after') + '</w:p>' + p(r('Tab') + '<w:r><w:tab/></w:r>' + r('stop')) + p(r('Emoji \u{1F600} e\u0301 here.')))),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const timings = [];
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
/** Every block of a JSON model passes checkBlock: '' or the error. */
const modelBad = (json) => {
  try {
    for (const s of JSON.parse(json)) for (const b of s.blocks) checkBlock(b);
    return '';
  } catch (e) {
    return e.message;
  }
};

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__client = (w, x, y) => {
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Open leaf in Word, its window at a known place, the caret in it. */
    window.__open = async (leaf, h = 400) => {
      const t = window.__word();
      if (!t) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 200 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 760, h, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      // the test hook (task.word.docs: view is EditView's hook()), and close
      const dw = window.__word().word.docs.find((d) => d.win === real.win);
      dw.close = () => real.close();
      window.__dw = dw;
      return dw;
    };
    window.__key = (w, code, key, extra = {}) => w.emit('key', { code, key, shift: false, ctrl: false, ...extra });
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /** '' if the selection of dw is valid, else what is wrong. */
    window.__bad = (dw) => {
      const L = dw.view.layout, s = dw.view.selection;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const q of [s.anchor, s.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'box') { if (q.off > 1) return 'box off'; continue; }
        const text = it.block.text;
        if (q.off > text.length) return `off ${q.off} > ${text.length}`;
        if (q.off === text.length) continue;
        let inside = true;
        for (const g of seg.segment(text.slice(Math.max(0, q.off - 64), q.off + 64))) {
          if (g.index + Math.max(0, q.off - 64) === q.off) { inside = false; break; }
        }
        if (inside && q.off > 0) return `${q.off} inside a cluster`;
      }
      return '';
    };
    window.__json = (dw) => JSON.stringify(dw.d.doc.sections);
    window.__undoAll = (dw) => { let n = 0; while (dw.d.canUndo && n < 5000) { dw.view.press('undo'); n++; } dw.view.flush(); return n; };
  }, files);

  // ---------------------------------------------------- 100,000 characters at once, through the text field
  {
    const s0 = await ev(async () => {
      const dw = await window.__open('Plain'), L = dw.view.layout, it = L.items[3];
      dw.view.setSelection({ id: it.id, off: 2 });
      const c = dw.view.caretRect(), q = window.__client(dw.win, c.x + 1, c.y + c.h / 2);
      return { q, json: window.__json(dw), depth: dw.view.undoDepth };
    });
    await page.mouse.click(s0.q.x, s0.q.y);
    const t0 = Date.now();
    await page.keyboard.insertText('q'.repeat(100000));
    const h = await ev(async () => {
      const dw = window.__dw, t = performance.now();
      dw.view.flush();
      await window.__frames(1);
      return { flush: performance.now() - t, len: dw.view.lines()[3].length, depth: dw.view.undoDepth, msgs: window.__msgs.length };
    });
    const ms = Date.now() - t0;
    const back = await ev(() => { window.__undoAll(window.__dw); return window.__json(window.__dw); });
    timings.push(`100,000 characters through the text field ${ms} ms`);
    ok('100,000 characters through the text field: typed once, one undo step, under 3 s; undo restores',
      h.len === 100000 + '3: alpha beta gamma delta epsilon zeta'.length && h.depth === s0.depth + 1 && ms < 3000 && back === s0.json && !h.msgs,
      { ms, h, restored: back === s0.json });
  }

  // ---------------------------------------------------- a storm of 5000 mixed events
  {
    const s = await ev(async () => {
      const dw = window.__dw, w = dw.win, L = dw.view.layout;
      dw.view.setSelection({ id: L.items[10].id, off: 0 });
      const before = window.__json(dw);
      let extents = 0;
      const se = w.setExtent.bind(w);
      w.setExtent = (...a) => { extents++; return se(...a); };
      const t0 = performance.now();
      for (let k = 0; k < 5000; k++) {
        const m = k % 10;
        if (m < 6) w.emit('textinput', { text: m === 5 ? ' \u{1F600}' : 'ab'[m % 2], window: w });
        else if (m === 6) window.__key(w, 8, 'Backspace');
        else if (m === 7) window.__key(w, 13, 'Enter');
        else if (m === 8) window.__key(w, 0x18A, 'Tab');
        else window.__key(w, 127, 'Delete');
      }
      const sync = performance.now() - t0;
      await window.__frames(2);
      const total = performance.now() - t0;
      w.setExtent = se;
      const res = { sync: Math.round(sync), total: Math.round(total), extents, bad: window.__bad(dw), json: window.__json(dw), msgs: window.__msgs.length,
        depth: dw.view.undoDepth };
      // more than 1000 steps: the oldest went, so undoing all of them
      // cannot reach the opened state, and the star stays
      res.undone = window.__undoAll(dw);
      res.dirty = dw.view.dirty;
      res.restored = window.__json(dw) === before;
      return res;
    });
    timings.push(`storm of 5000 mixed events ${s.total} ms (laid out ${s.extents} times)`);
    ok('a storm of 5000 mixed events: under 5 s, laid out at most twice, selection and model valid; history capped at 1000 steps, the star stays',
      s.total < 5000 && s.extents <= 2 && !s.bad && !modelBad(s.json) && s.depth === 1000 && s.undone === 1000 && s.dirty && !s.restored && !s.msgs,
      { ...s, json: undefined, model: modelBad(s.json) });
    await ev(() => window.__dw.close());
  }

  // ---------------------------------------------------- Backspace storm, Enter storm, undo/redo storm
  {
    const b = await ev(async () => {
      const dw = await window.__open('Plain'), w = dw.win, L = dw.view.layout;
      const before = window.__json(dw);
      dw.view.setSelection({ id: L.items[29].id, off: L.items[29].block.text.length });
      const t0 = performance.now();
      for (let k = 0; k < 3000; k++) window.__key(w, 8, 'Backspace');
      await window.__frames(2);
      const ms = performance.now() - t0;
      const lines = dw.view.lines();
      const res = { ms: Math.round(ms), n: lines.length, first: lines[0], bad: window.__bad(dw), json: window.__json(dw) };
      window.__undoAll(dw);
      res.restored = window.__json(dw) === before;
      return res;
    });
    timings.push(`3000 Backspaces ${b.ms} ms`);
    ok('a Backspace storm (3000, more than the text): under 3 s, stops at the start, model valid, undo restores',
      b.ms < 3000 && b.n === 1 && b.first === '' && !b.bad && !modelBad(b.json) && b.restored, { ...b, json: undefined, model: modelBad(b.json) });

    const e = await ev(async () => {
      const dw = window.__dw, w = dw.win, L = dw.view.layout;
      dw.view.setSelection({ id: L.items[5].id, off: 3 });
      let extents = 0;
      const se = w.setExtent.bind(w);
      w.setExtent = (...a) => { extents++; return se(...a); };
      const t0 = performance.now();
      let worst = 0;
      for (let k = 0; k < 20000; k++) {
        const t = performance.now();
        window.__key(w, 13, 'Enter');
        worst = Math.max(worst, performance.now() - t);
      }
      const sync = performance.now() - t0;
      await window.__frames(2);
      const total = performance.now() - t0;
      // responsive after it: a keystroke with its layout and drawing
      const t1 = performance.now();
      w.emit('textinput', { text: 'k', window: w });
      dw.view.flush();
      await window.__frames(1);
      const after = performance.now() - t1;
      w.setExtent = se;
      const res = { sync: Math.round(sync), total: Math.round(total), worst: Math.round(worst), after: Math.round(after), extents,
        n: dw.view.lines().length, bad: window.__bad(dw), depth: dw.view.undoDepth, msgs: window.__msgs.length };
      dw.close();
      return res;
    });
    timings.push(`20,000 Enters ${e.total} ms (worst ${e.worst} ms; laid out ${e.extents} times), a keystroke after ${e.after} ms`);
    ok('an Enter storm makes 20,000 paragraphs: under 10 s, each Enter under 250 ms, laid out at most twice, a keystroke after it under 500 ms',
      e.n === 30 + 20000 && e.total < 10000 && e.worst < 250 && e.extents <= 2 && e.after < 500 && !e.bad && !e.msgs, e);

    const u = await ev(async () => {
      const dw = await window.__open('Plain'), w = dw.win, L = dw.view.layout;
      const before = window.__json(dw);
      dw.view.setSelection({ id: L.items[7].id, off: 1 });
      for (let k = 0; k < 1000; k++) window.__key(w, 13, 'Enter');
      dw.view.flush();
      const edited = window.__json(dw), depth = dw.view.undoDepth;
      const t0 = performance.now();
      for (let k = 0; k < 1000; k++) window.__key(w, 26, 'z', { ctrl: true });
      await window.__frames(2);
      const undoMs = performance.now() - t0, undone = window.__json(dw) === before, dirty = dw.view.dirty;
      const t1 = performance.now();
      for (let k = 0; k < 1000; k++) window.__key(w, 25, 'y', { ctrl: true });
      await window.__frames(2);
      const redoMs = performance.now() - t1;
      const res = { depth, undoMs: Math.round(undoMs), redoMs: Math.round(redoMs), undone, dirty, redone: window.__json(dw) === edited, bad: window.__bad(dw) };
      dw.close();
      return res;
    });
    timings.push(`1000 undos ${u.undoMs} ms, 1000 redos ${u.redoMs} ms`);
    ok('1000 undos then 1000 redos (Ctrl-Z, Ctrl-Y): each under 5 s; back to the opened model, then to the edited one',
      u.depth === 1000 && u.undone && !u.dirty && u.redone && u.undoMs < 5000 && u.redoMs < 5000 && !u.bad, u);
  }

  // ---------------------------------------------------- 50,000 paragraphs: select all, type one character
  {
    const o = await ev(async () => {
      const t0 = performance.now();
      const dw = await window.__open('Huge');
      return { open: Math.round(performance.now() - t0), n: dw.view.lines().length, json: window.__json(dw).length };
    });
    timings.push(`50,000 paragraphs opened in ${o.open} ms`);
    await page.keyboard.press('Control+a');
    const h = await ev(async () => {
      const dw = window.__dw, w = dw.win, before = window.__json(dw), depth = dw.view.undoDepth;
      const t0 = performance.now();
      w.emit('textinput', { text: 'Z', window: w });
      dw.view.flush();
      await window.__frames(1);
      const ms = performance.now() - t0;
      const res = { ms: Math.round(ms), steps: dw.view.undoDepth - depth, lines: dw.view.lines(), bad: window.__bad(dw), title: w.title };
      const t1 = performance.now();
      dw.view.press('undo');
      dw.view.flush();
      await window.__frames(1);
      res.undoMs = Math.round(performance.now() - t1);
      res.restored = window.__json(dw) === before;
      res.n = dw.view.lines().length;
      dw.close();
      return res;
    });
    timings.push(`select all in 50,000 paragraphs and type: ${h.ms} ms, undo ${h.undoMs} ms`);
    ok('50,000 paragraphs: Ctrl-A then one character is one paragraph, one undo step, under 5 s; undo restores it all in under 5 s',
      o.n === 50000 && h.ms < 5000 && h.steps === 1 && h.lines.length === 1 && h.lines[0] === 'Z' && !h.bad && h.restored && h.n === 50000 && h.undoMs < 5000,
      { o, h: { ...h, lines: h.lines.slice(0, 3) } });
  }

  // ---------------------------------------------------- an input method composing while its window closes
  {
    const cdp = await page.context().newCDPSession(page);
    const pt = await ev(async () => {
      const dw = await window.__open('Plain'), L = dw.view.layout, c = L.caretRect({ id: L.items[2].id, off: 2 });
      return window.__client(dw.win, c.x + 1, c.y + c.h / 2);
    });
    await page.mouse.click(pt.x, pt.y);
    await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 });
    const c1 = await ev(async () => {
      const dw = window.__dw, w = dw.win, text = dw.d.doc.sections[0].blocks[2].text;
      const comp = dw.view.composing;
      // the window closes in the middle of events
      w.emit('composition', { text: '\u306b\u307b', window: w });
      dw.close();
      w.emit('composition', { text: '\u306b\u307b\u3093', window: w });
      w.emit('compositionend', { text: '\u306b\u307b\u3093', cancelled: false, window: w });
      w.emit('textinput', { text: '\u65e5\u672c', window: w });
      w.emit('composition', { text: 'x', start: true, window: w });
      await window.__frames(2);
      return { comp, text, after: dw.d.doc.sections[0].blocks[2].text, open: w.isOpen, docs: window.__word().word.docs.length, caretWin: !!os.wimp.caret?.window };
    });
    // the input method goes on in the browser with no window for it
    await cdp.send('Input.imeSetComposition', { text: '\u306b\u307b', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: '\u65e5\u672c' });
    await cdp.send('Input.imeSetComposition', { text: '\u304b', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await ev(() => window.__frames(2));
    const c2 = await ev(async () => {
      // and a new window works
      const dw = await window.__open('Plain'), w = dw.win, L = dw.view.layout;
      dw.view.setSelection({ id: L.items[0].id, off: 0 });
      w.emit('textinput', { text: 'ok', window: w });
      dw.view.flush();
      const res = { line: dw.view.lines()[0], msgs: window.__msgs.length };
      dw.close();
      return res;
    });
    ok('composing while the window closes: late events ignored, nothing typed, no errors; the next window types',
      c1.comp === '\u306b' && c1.after === c1.text && !c1.open && c1.docs === 0 && c2.line.startsWith('ok0: ') && !c2.msgs && !pageErrors(), { c1, c2 });
  }

  // ---------------------------------------------------- a table first; an empty document
  {
    const t = await ev(async () => {
      const dw = await window.__open('TableFirst'), w = dw.win, s0 = dw.view.selection;
      const before = window.__json(dw);
      const start = { id: s0.head.id, off: s0.head.off, box: dw.view.layout.byId.get(s0.head.id)?.kind };
      w.emit('textinput', { text: 'x', window: w });
      dw.view.flush();
      const l1 = dw.view.lines();
      window.__key(w, 13, 'Enter');
      window.__key(w, 8, 'Backspace');
      window.__key(w, 8, 'Backspace');
      window.__key(w, 8, 'Backspace');
      dw.view.flush();
      const l2 = dw.view.lines();
      const bad = window.__bad(dw), json = window.__json(dw);
      window.__undoAll(dw);
      const res = { start, l1, l2, bad, json, restored: window.__json(dw) === before };
      dw.close();
      return res;
    });
    ok('a document whose first block is a table: typing at its start puts a paragraph before it; Backspace never deletes into it',
      t.start.box === 'box' && t.start.off === 0 && t.l1[0] === 'x' && t.l1[1] === null && t.l2[0] === '' && t.l2[1] === null &&
      !t.bad && !modelBad(t.json) && t.restored, { ...t, json: undefined });

    const e = await ev(async () => {
      const dw = await window.__open('Empty'), w = dw.win;
      let beeps = 0;
      const b = os.wimp.beep;
      os.wimp.beep = () => { beeps++; };
      w.emit('textinput', { text: 'x', window: w });
      w.emit('composition', { text: 'k', start: true, window: w });
      w.emit('compositionend', { text: 'k', cancelled: false, window: w });
      for (const [code, key, extra] of [[13, 'Enter'], [13, 'Enter', { shift: true }], [8, 'Backspace'], [127, 'Delete'], [0x18A, 'Tab'],
        [8, 'Backspace', { ctrl: true }], [0x1CD, 'Insert'], [26, 'z', { ctrl: true }], [25, 'y', { ctrl: true }], [1, 'a', { ctrl: true }]]) {
        window.__key(w, code, key, extra);
      }
      w.emit('textinput', { text: 'y', window: w });
      await window.__frames(2);
      os.wimp.beep = b;
      const res = { beeps, blocks: dw.d.doc.sections.reduce((n, s) => n + s.blocks.length, 0), title: w.title, depth: dw.view.undoDepth, msgs: window.__msgs.length };
      dw.close();
      return res;
    });
    ok('an empty document: typing, Enter, Backspace, undo... change nothing, typing beeps, no errors',
      e.blocks === 0 && e.beeps >= 2 && e.title === 'Empty' && e.depth === 0 && !e.msgs && !pageErrors(), e);
  }

  // ---------------------------------------------------- a 100,000-character word
  {
    const w1 = await ev(async () => {
      const dw = await window.__open('Word'), w = dw.win, L = dw.view.layout;
      dw.view.setSelection({ id: L.items[0].id, off: 50000 });
      await window.__frames(2);
      const keys = [];
      for (let k = 0; k < 10; k++) {
        const t0 = performance.now();
        if (k < 5) w.emit('textinput', { text: 'y', window: w });
        else window.__key(w, 8, 'Backspace');
        dw.view.flush();
        await window.__frames(1);
        keys.push(Math.round(performance.now() - t0));
      }
      const res = { keys, len: dw.view.lines()[0].length, bad: window.__bad(dw) };
      dw.close();
      return res;
    });
    timings.push(`a 100,000-character word: keystrokes ${w1.keys.join('/')} ms`);
    ok('a 100,000-character word: each keystroke (typing, Backspace) with its layout and frame under 500 ms',
      w1.keys.every((x) => x < 500) && w1.len === 100000 && !w1.bad, w1);
  }

  // ---------------------------------------------------- 500 random keys, text and mouse actions
  {
    const box = await ev(async () => {
      const dw = await window.__open('Mixed', 360), w = dw.win;
      window.__opened = window.__json(dw);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    });
    const rnd = rng(20261006), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape',
      'Control+a', 'Enter', 'Shift+Enter', 'Backspace', 'Delete', 'Tab', 'Control+Backspace', 'Control+Delete',
      'Control+z', 'Control+y', 'Insert', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowDown', 'Control+ArrowRight'];
    const TEXT = ['a', 'b', ' ', 'word ', '\u00e9', 'e\u0301', '\u{1F600}', '\u{1F469}\u200d\u{1F4BB}', '\u4e2d', 'x y z'];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + 2 + rnd() * (box.y1 - box.y0 - 4) });
    const bad = [];
    let checked = 0;
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.45) {
        what = pick(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.75) {
        what = 'text';
        if (rnd() < 0.7) await page.keyboard.insertText(pick(TEXT));
        else await page.keyboard.type(pick(['ab', 'c', ' d']));
      } else {
        const q = at(), b = rnd();
        what = 'mouse';
        if (b < 0.4) await page.mouse.click(q.x, q.y);
        else if (b < 0.55) { await page.keyboard.down('Shift'); await page.mouse.click(q.x, q.y); await page.keyboard.up('Shift'); }
        else if (b < 0.7) await page.mouse.dblclick(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      }
      const s = await ev(async () => {
        await window.__frames(1);
        const dw = window.__dw;
        return { why: window.__bad(dw) + (window.__msgs.length ? ' msgs' : '') + (os.wimp.menus.isOpen ? ' menu' : ''), json: window.__json(dw) };
      });
      const m = modelBad(s.json);
      checked++;
      if ((s.why || m) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${m}`);
      if (s.why.includes('menu')) await ev(() => os.wimp.menus.close());
    }
    const end = await ev(() => {
      const dw = window.__dw, n = window.__undoAll(dw);
      const res = { n, same: window.__json(dw) === window.__opened, dirty: dw.view.dirty, bad: window.__bad(dw), errs: window.__msgs.length };
      dw.close();
      return res;
    });
    ok('500 random keys, text and mouse actions: selection and every block valid after each; undoing everything gives the opened model',
      !bad.length && checked === 500 && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors(), { bad, end });
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log('timings: ' + timings.join('; '));
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
