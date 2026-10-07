// !Word's lists against hostile input in the real desktop:
// a 100,000-paragraph list (multilevel and bullets) opens, takes a
// keystroke and a Tab at the start of an item and paints, within
// generous bounds (the times are logged); 100 rounds of Tab and
// Shift-Tab spam (real keys and the command) in a nine-level list
// keep the levels within 0..8, the model valid and undo whole;
// absurd numbering definitions (a start of 2^31, an lvlText of 1000
// placeholders, nine levels of legal numbering, numbering style
// cycles and a paragraph style basedOn cycle with numbering, an
// unknown numFmt) open with labels within the 40-character cap and
// take Tab, Shift-Tab, Backspace and Enter; everything selected
// across lists then Backspace (one undo step), and Backspace held at
// the start of list items (number off, then joins); and 500 seeded
// random actions: keys (Tab, Shift-Tab, Backspace, Enter, Delete,
// undo and redo among them), text, clicks and drags, the Format >
// List commands and the indent commands (after each: the selection
// valid, every block passes ModelCheck.checkBlock, a label for
// every item that has one, no error; undoing everything gives back
// the opened model). No page errors.
// Positions come from the layout the test hook gives
// (task.word.docs[i].view, ./EditView hook()).
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { numberingXml, stylesXml, p, r } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';
import { lvl, item, heading, listDocx, NUMBERING, STYLES_LIST } from './list-fixtures.mjs';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
// 100,000 paragraphs: the multilevel list (numId 2, levels 0..2), a bullet list every 7th, a heading every 1000th
const HUGE = Array.from({ length: 100000 }, (_, i) => (i % 1000 === 0 ? heading('Part ' + i)
  : i % 7 === 0 ? item(`bullet ${i}`, 1) : item(`${i} ${WORDS[i % 10]}`, 2, i % 3)));
// nine levels of numId 2 (1. a. i. ...) and plain paragraphs
const NINE = [p(r('Nine levels')), ...Array.from({ length: 18 }, (_, i) => item(`Level item ${i}`, 2, i % 9)), p(r('end'))];

// absurd numbering definitions
const abs = (id, inner) => `<w:abstractNum w:abstractNumId="${id}">${inner}</w:abstractNum>`;
const num = (id, a) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${a}"/></w:num>`;
const ABSURD = numberingXml(
  abs(0, lvl(0, { start: 2147483648, text: '%1.' }) + lvl(1, { start: 2147483647, fmt: 'upperRoman', text: '%1.%2' }))
  + abs(1, lvl(0, { text: '%1'.repeat(1000) }) + lvl(1, { text: '%9%0%%1x'.repeat(200) }))
  + abs(2, Array.from({ length: 9 }, (_, k) => lvl(k, { fmt: k ? 'lowerLetter' : 'upperRoman', isLgl: k > 0,
    text: Array.from({ length: k + 1 }, (_, j) => `%${j + 1}`).join('.') })).join(''))
  + abs(3, '<w:numStyleLink w:val="LoopA"/>') + abs(4, '<w:numStyleLink w:val="LoopB"/>')
  + abs(5, lvl(0, { fmt: 'klingon', text: '%1)' }) + lvl(1, { fmt: '', text: '%2]' }) + lvl(8, { start: -5, text: '%9' }))
  + num(1, 0) + num(2, 1) + num(3, 2) + num(4, 3) + num(5, 4) + num(6, 5));
const ABSURD_STYLES = stylesXml('<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + '<w:style w:type="numbering" w:styleId="LoopA"><w:name w:val="LoopA"/><w:pPr><w:numPr><w:numId w:val="5"/></w:numPr></w:pPr></w:style>'
  + '<w:style w:type="numbering" w:styleId="LoopB"><w:name w:val="LoopB"/><w:pPr><w:numPr><w:numId w:val="4"/></w:numPr></w:pPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="CycA"><w:name w:val="CycA"/><w:basedOn w:val="CycB"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="CycB"><w:name w:val="CycB"/><w:basedOn w:val="CycA"/><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr></w:style>');
const NP = (id, k) => `<w:numPr><w:ilvl w:val="${k}"/><w:numId w:val="${id}"/></w:numPr>`;
const ABSURD_PARAS = [
  p(r('start 2^31'), NP(1, 0)), p(r('next'), NP(1, 0)), p(r('roman at 2^31-1'), NP(1, 1)),
  p(r('1000 placeholders'), NP(2, 0)), p(r('odd placeholders'), NP(2, 1)),
  ...Array.from({ length: 9 }, (_, k) => p(r('legal ' + k), NP(3, k))),
  p(r('style loop A'), NP(4, 0)), p(r('style loop B'), NP(5, 2)),
  p(r('basedOn cycle'), '<w:pStyle w:val="CycA"/>'), p(r('basedOn cycle B'), '<w:pStyle w:val="CycB"/>'),
  p(r('klingon'), NP(6, 0)), p(r('empty fmt'), NP(6, 1)), p(r('level 8 start -5'), NP(6, 8)), p(r('level 12'), NP(6, 12)),
  p(r('numId 99'), NP(99, 0)), p(r('numId 0'), NP(0, 0)), p(r('plain')),
];
const MIXED = [heading('Lists'), ...['a', 'b', 'c'].map((t, i) => item('Bullet ' + t, 1, i)), p(r('Between the lists, plain.')),
  ...Array.from({ length: 10 }, (_, i) => item('Item ' + i, 2, [0, 1, 1, 2, 0, 1, 0, 0, 3, 1][i])), heading('More', 2),
  item('Legal', 4), item('Legal sub', 4, 1), item('x', 7), item('x.a', 7, 1), item('five', 3), p(r('The end.'))];

const files = {
  Huge: Array.from(await listDocx(HUGE)),
  Nine: Array.from(await listDocx(NINE)),
  Absurd: Array.from(await listDocx(ABSURD_PARAS, { numbering: ABSURD, styles: ABSURD_STYLES })),
  Mixed: Array.from(await listDocx(MIXED, { numbering: NUMBERING, styles: STYLES_LIST })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const timings = [];
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = (n = 2) => ev((n) => window.__frames(n), n);
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
    /** Open leaf in Word, its window at a known place, the caret in it; the hook (window.__dw). */
    window.__open = async (leaf, at = {}) => {
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 200 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 860, h: 480, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__real = real;
      window.__dw = window.__hook();
      return window.__dw;
    };
    window.__hook = () => {
      const dw = window.__word().word.docs.find((d) => d.win === window.__real.win);
      if (dw) dw.close = () => window.__real.close();
      return dw;
    };
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
        if (q.off === text.length || q.off === 0) continue;
        let inside = true;
        for (const g of seg.segment(text.slice(Math.max(0, q.off - 64), q.off + 64))) {
          if (g.index + Math.max(0, q.off - 64) === q.off) { inside = false; break; }
        }
        if (inside) return `${q.off} inside a cluster`;
      }
      // the drawn labels: as many as the layout's items, none over the cap, numPr levels within 0..8
      const labels = dw.view.labels();
      if (labels.length !== L.items.length) return 'labels/items';
      if (labels.some((t) => t !== null && (typeof t !== 'string' || t.length > 40))) return 'label too long';
      for (const sct of dw.d.doc.sections) {
        for (const b of sct.blocks) {
          const k = b.pPr?.numPr?.ilvl;
          if (k !== undefined && k !== null && !(Number.isInteger(k) && k >= 0 && k <= 8) && b.pPr.numPr.numId !== 6) return `ilvl ${k}`;
        }
      }
      return '';
    };
    window.__json = (dw) => JSON.stringify(dw.d.doc.sections);
    window.__undoAll = (dw) => { let n = 0; while (dw.d.canUndo && n < 5000) { dw.view.press('undo'); n++; } dw.view.flush(); return n; };
    /** The caret at offset off of item i. */
    window.__at = (dw, i, off = 0) => { const L = dw.view.layout; dw.view.setSelection({ id: L.items[i].id, off }); };
  }, files);

  // ---------------------------------------------------- 100,000 list paragraphs
  {
    const h = await ev(async () => {
      const t0 = performance.now();
      const dw = await window.__open('Huge');
      const opened = performance.now() - t0;
      const v = dw.view, w = dw.win, labels = v.labels();
      // a keystroke in the middle of the document, with its layout
      window.__at(dw, 50001, 3);
      const t1 = performance.now();
      v.type('x');
      v.flush();
      await window.__frames(1);
      const key = performance.now() - t1;
      // Tab at the start of an item (a level deeper: the labels after it change)
      window.__at(dw, 50002, 0);
      const t2 = performance.now();
      v.press('tab');
      v.flush();
      await window.__frames(1);
      const tab = performance.now() - t2;
      const after = v.labels().slice(50000, 50006);
      const t3 = performance.now();
      v.press('shiftTab');
      v.flush();
      await window.__frames(1);
      const shiftTab = performance.now() - t3;
      // painting after a scroll to the end
      const t4 = performance.now();
      w.scrollTo(0, w.extent.y1 - 400);
      w.invalidate();
      await window.__frames(2);
      const paint = performance.now() - t4;
      const res = { opened, key, tab, shiftTab, paint, n: v.layout.items.length, first: labels.slice(0, 4), around: labels.slice(50000, 50006),
        after, bad: window.__bad(dw), msgs: window.__msgs.length, depth: v.undoDepth };
      res.undone = window.__undoAll(dw);
      dw.close();
      await window.__frames(2);
      return res;
    });
    const r0 = (x) => Math.round(x);
    timings.push(`100,000 list paragraphs: open ${r0(h.opened)} ms, keystroke ${r0(h.key)} ms, Tab ${r0(h.tab)} ms, Shift-Tab ${r0(h.shiftTab)} ms, `
      + `scroll and paint ${r0(h.paint)} ms`);
    ok('100,000 list paragraphs open in under 8 s with their labels (1. 1.1. ...); a keystroke, Tab and Shift-Tab at an item\'s start each '
      + 'under 1.5 s; painting after a scroll under 1 s; selection valid; no errors',
    h.n === 100000 && h.opened < 8000 && h.key < 1500 && h.tab < 1500 && h.shiftTab < 1500 && h.paint < 1000 && !h.bad && !h.msgs
      && h.first[0] === '1' && h.depth === 3 && !same(h.after, h.around), h);
  }

  // ---------------------------------------------------- Tab / Shift-Tab spam
  {
    // real keys first: 10 rounds of 10 Tab then 10 Shift-Tab at the start of item 3
    await ev(async () => { const dw = await window.__open('Nine'); window.__opened = window.__json(dw); window.__at(dw, 3, 0); });
    const t0 = Date.now();
    for (let k = 0; k < 10; k++) {
      for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
      for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+Tab');
    }
    await settle();
    const realMs = Date.now() - t0;
    const sp = await ev(async () => {
      const dw = window.__dw, v = dw.view, lv = () => dw.d.doc.sections[0].blocks[3].pPr.numPr.ilvl;
      const real = { ilvl: lv(), lines: v.lines()[3], depth: v.undoDepth };
      // then 90 rounds by the command, on one item and on a selection over them all
      let worst = 0, maxL = 0;
      for (let k = 0; k < 90; k++) {
        if (k % 2) v.setSelection({ id: v.layout.items[1].id, off: 0 }, { id: v.layout.items[18].id, off: 2 });
        else window.__at(dw, 3 + (k % 15), 0);
        for (let i = 0; i < 12; i++) {
          const t = performance.now();
          v.press(i < 9 ? 'tab' : 'shiftTab');
          worst = Math.max(worst, performance.now() - t);
          maxL = Math.max(maxL, ...dw.d.doc.sections[0].blocks.map((b) => b.pPr?.numPr?.ilvl ?? 0));
        }
      }
      v.flush();
      await window.__frames(2);
      const res = { real, worst, maxL, bad: window.__bad(dw), json: window.__json(dw), depth: v.undoDepth, msgs: window.__msgs.length };
      res.undone = window.__undoAll(dw);
      res.back = window.__json(dw) === window.__opened;
      dw.close();
      return res;
    });
    timings.push(`Tab/Shift-Tab: 200 real keys ${realMs} ms; 1080 commands, worst ${Math.round(sp.worst)} ms`);
    ok('100 rounds of Tab / Shift-Tab spam (200 real keys, 1080 commands on carets and selections): the text never changes, levels '
      + 'stay within 0..8, model and selection valid, every call under 250 ms; undoing everything gives back the opened model',
    sp.real.lines === 'Level item 2' && sp.real.ilvl === 0 && sp.maxL <= 8 && !sp.bad && !modelBad(sp.json) && sp.worst < 250 && sp.back
      && !sp.msgs, { ...sp, json: undefined, model: modelBad(sp.json) });
  }

  // ---------------------------------------------------- absurd numbering definitions
  {
    const ab = await ev(async () => {
      const t0 = performance.now();
      const dw = await window.__open('Absurd');
      const opened = performance.now() - t0;
      const v = dw.view, opened0 = window.__json(dw), labels = v.labels();
      const steps = [];
      for (let i = 0; i < v.layout.items.length; i++) {
        for (const key of ['tab', 'shiftTab', 'tab', 'backspace', 'enter']) {
          window.__at(dw, Math.min(i, v.layout.items.length - 1), 0);
          try { v.press(key); } catch (e) { steps.push(`${i} ${key}: ${e.message}`); }
        }
      }
      v.flush();
      await window.__frames(2);
      const res = { opened, labels, steps, bad: window.__bad(dw), json: window.__json(dw), msgs: window.__msgs.slice(), after: v.labels() };
      window.__undoAll(dw);
      res.back = window.__json(dw) === opened0;
      dw.close();
      return res;
    });
    const L = ab.labels;
    timings.push(`absurd numbering opened in ${Math.round(ab.opened)} ms`);
    ok('absurd numbering: start 2^31 shown without overflow (2147483648.), 1000 placeholders capped at 40 characters, nine legal '
      + 'levels 1.1.1..., style loops and a basedOn cycle, an unknown numFmt as decimal, level 12 and numId 99 handled',
    ab.opened < 3000 && L[0] === '2147483648.' && L[1] === '2147483649.' && typeof L[3] === 'string' && L[3].length <= 40 && L[3].length > 10
      && L[13] === '1.1.1.1.1.1.1.1.1' && L[5] === 'I' && L[18] === '1)' && L[22] === null && L[23] === null && L[24] === null && L.every((t) => t === null || t.length <= 40),
    { labels: L });
    ok('... Tab, Shift-Tab, Backspace and Enter at the start of every paragraph: no exception, model and selection valid, '
      + 'labels within the cap; undoing everything gives back the opened model', !ab.steps.length && !ab.bad && !modelBad(ab.json)
      && ab.back && !ab.msgs.length && !pageErrors(), { ...ab, json: undefined, model: modelBad(ab.json) });
  }

  // ---------------------------------------------------- select all + Backspace; Backspace held at items' starts
  {
    await ev(async () => { const dw = await window.__open('Mixed'); window.__opened = window.__json(dw); window.__at(dw, 2, 3); });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await settle();
    const s1 = await ev(() => { const v = window.__dw.view; return { lines: v.lines(), labels: v.labels(), depth: v.undoDepth, bad: window.__bad(window.__dw) }; });
    await page.keyboard.press('Control+z');
    await settle();
    const s2 = await ev(() => ({ back: window.__json(window.__dw) === window.__opened, depth: window.__dw.view.undoDepth }));
    ok('everything selected across lists, then Backspace: one undo step, one empty paragraph left, valid; undo gives the lists back',
      s1.lines.length === 1 && s1.lines[0] === '' && s1.depth === 1 && !s1.bad && s2.back && s2.depth === 0, { s1, s2 });
    // Backspace held from the start of the last list item: numbers off, then joins, up to the top
    await ev(() => window.__at(window.__dw, 20, 0));
    const seen = [];
    for (let k = 0; k < 60; k++) {
      await page.keyboard.press('Backspace');
      if (k % 6 === 5) seen.push(await ev(() => ({ n: window.__dw.view.lines().length, bad: window.__bad(window.__dw), json: window.__json(window.__dw) })));
    }
    await settle();
    const s3 = await ev(() => {
      const dw = window.__dw, v = dw.view;
      const res = { lines: v.lines().length, labels: v.labels(), bad: window.__bad(dw), json: window.__json(dw), msgs: window.__msgs.length };
      window.__undoAll(dw);
      res.back = window.__json(dw) === window.__opened;
      dw.close();
      return res;
    });
    ok('Backspace held at the start of list items (60 presses): numbers come off, then paragraphs join; valid after each; '
      + 'undoing everything gives back the opened model', seen.every((x) => !x.bad && !modelBad(x.json)) && !s3.bad && !modelBad(s3.json)
      && s3.lines < 20 && s3.back && !s3.msgs, { seen: seen.map((x) => [x.n, x.bad]), ...s3, json: undefined });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const dw = await window.__open('Mixed', { h: 420 }), w = dw.win;
      window.__opened = window.__json(dw);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: dw.view.layout.top };
    });
    const rnd = rng(20261006), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Backspace', 'Backspace', 'Enter', 'Delete', 'Home', 'End', 'ArrowUp',
      'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+z', 'Control+y', 'Control+m',
      'Control+Shift+m', 'Control+b', 'Escape'];
    const TEXT = ['a', ' ', 'word ', 'é', '\u{1F600}', 'x y'];
    const FORMATS = ['listIn', 'listOut', 'listOff', 'indentMore', 'indentLess', 'alignCenter', 'alignRight', 'alignLeft'];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.45) {
        what = pick(KEYS);
        // half the list keys from the start of a paragraph
        if (/Tab|Backspace/.test(what) && rnd() < 0.5) await page.keyboard.press('Home');
        await page.keyboard.press(what);
      } else if (a < 0.6) {
        what = 'text';
        await page.keyboard.insertText(pick(TEXT));
      } else if (a < 0.78) {
        const q = at(), b = rnd();
        what = 'mouse';
        if (b < 0.6) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      } else {
        what = 'format ' + pick(FORMATS);
        await ev((id) => window.__dw.view.format(id), what.split(' ')[1]);
      }
      const kind = a < 0.45 ? 'key' : what.split(' ')[0];
      kinds[kind] = (kinds[kind] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const dw = window.__hook();
        if (!dw) return { why: 'window gone', json: '[]' };
        const why = window.__bad(dw) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        return { why, json: window.__json(dw) };
      });
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const dw = window.__hook();
      const n = window.__undoAll(dw);
      const res = { n, same: window.__json(dw) === window.__opened, dirty: dw.view.dirty, bad: window.__bad(dw), errs: window.__msgs.length,
        labels: dw.view.labels() };
      dw.close();
      return res;
    });
    ok('500 random keys (Tab, Shift-Tab, Backspace, Enter among them), text, clicks and drags, Format > List and indent commands: '
      + 'selection, labels and every block valid after each, no errors; undoing everything gives back the opened model',
    !bad.length && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors() && Object.keys(kinds).length === 4, { bad, end, kinds });
    timings.push('random actions: ' + JSON.stringify(kinds));
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
