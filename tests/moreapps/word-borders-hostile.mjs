// !Word's borders, shading, symbols and change case against hostile
// input in the real desktop: 50,000 bordered and shaded paragraphs in
// one box (opened, painted, a keystroke, one command over all of
// them and its undo); borders of width 0 and 96 eighths, spaces 0 and
// 31 points, absurd and made-up values in a file (laid out with
// finite pieces and gaps, drawn) and through the commands (clamped or
// refused, never an exception that escapes); theme colours kept raw
// (drawn in the colour beside them, every border command refused with
// a beep, nothing but the other paragraphs changed, the raw elements
// still in the saved bytes); 1000 Shift-F3 (900 by real key presses
// with undo giving back the opened model, 100 more: the cycle is
// exactly where 1000 steps of three should leave it); the Symbol
// window open while documents close one after another (it follows the
// last one clicked in, beeps with none, and works again with a new
// one; nothing left behind); 500 seeded random actions (keys incl.
// Shift-F3, Ctrl-Shift-Space and Ctrl-Shift--, text, clicks and drags,
// the border / shading / case command ids with hostile arguments, the
// Format menu's Borders and shading... and Change case >, the Symbol
// window's Insert) with the selection and the model valid after each,
// and undo of everything giving back the opened model. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const side = (n, c, v = 'single', sz = 12, space = 4) => `<w:${n} w:val="${v}" w:sz="${sz}" w:space="${space}" w:color="${c}"/>`;
const box = (c, between) => `<w:pBdr>${side('top', c)}${side('left', c)}${side('bottom', c)}${side('right', c)}${between ? side('between', c) : ''}</w:pBdr>`;
const SHD = (fill, v = 'clear') => `<w:shd w:val="${v}" w:color="auto" w:fill="${fill}"/>`;
const THEMED = '<w:pBdr><w:top w:val="single" w:sz="12" w:color="00FF00" w:themeColor="accent6"/><w:left w:val="double"/></w:pBdr>'
  + '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00" w:themeFill="accent4"/>';
const docx = async (body) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body) }));
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const many = Array.from({ length: 50000 }, (_, i) => p(r(`${i} ${WORDS[i % 10]} words`), box('000000', true) + SHD('FFFF00'))).join('');
const files = {
  Huge: await docx(many),
  Odd: await docx(
    p(r('width 0'), `<w:pBdr>${side('top', 'FF0000', 'single', 0, 0)}${side('bottom', 'FF0000', 'single', 0, 0)}</w:pBdr>`)
    + p(r('width 96, space 31'), `<w:pBdr>${side('top', '0000FF', 'single', 96, 31)}${side('left', '0000FF', 'double', 96, 31)}`
      + `${side('bottom', '0000FF', 'dotted', 96, 31)}${side('right', '0000FF', 'dashed', 96, 31)}</w:pBdr>`)
    + p(r('beyond'), `<w:pBdr>${side('top', 'auto', 'single', 5000, 500)}${side('left', 'zzzzzz', 'madeUp', -3, -4)}</w:pBdr>` + SHD('nothex', 'pct13'))
    + p(r('Themed'), THEMED) + p(r('Themed too'), THEMED)
    + p(r('Plain one') + r(' shaded', SHD('FF0000')) + r(' themed', '<w:shd w:val="clear" w:color="auto" w:fill="FF0000" w:themeFill="accent2"/>'))
    + p(r('Plain two'))),
  Cycle: await docx(p(r('the quick brown fox. it is'))),
  Sym: await docx(p(r('Alpha symbols'))),
  Sym2: await docx(p(r('Beta symbols'))),
  Sym3: await docx(p(r('Gamma symbols'))),
  Mixed: await docx(Array.from({ length: 12 }, (_, i) => p(r(`Paragraph ${i} ${WORDS[i % 10]} straße İstanbul ﬁne`),
    i % 3 === 0 ? box('FF0000', true) : i % 3 === 1 ? SHD('FFFF00') : '')).join('') + p(r('The end.'))),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const timings = [];
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
const modelBad = (json) => {
  try {
    for (const s of JSON.parse(json).sections) for (const b of s.blocks) checkBlock(b);
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
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.path.endsWith('.' + leaf));
    window.__client = (w, x, y) => {
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__open = async (leaf, at = {}) => {
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 400 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 860, h: 480, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__cur = leaf;
      window.__real = real;
      (window.__reals ||= {})[leaf] = real;
      return window.__doc(leaf);
    };
    window.__d = () => window.__doc(window.__cur);
    window.__json = (d) => JSON.stringify({ sections: d.d.doc.sections, settings: d.d.doc.rawSettings });
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__at = (d, i, off = 0) => d.view.setSelection({ id: d.view.layout.items[i].id, off });
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /** '' when the selection and the layout are valid. */
    window.__bad = (d) => {
      const L = d.view.layout, s = d.view.selection;
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
      const n = L.items.length;
      for (let k = 0; k < n; k += n > 3000 ? Math.ceil(n / 3000) : 1) {
        const it = L.items[k];
        if (!Number.isFinite(it.y) || !Number.isFinite(it.h) || it.h < 0 || it.h > 5e6) return `item ${it.id} y ${it.y} h ${it.h}`;
        if (it.gapAbove !== undefined && (!Number.isFinite(it.gapAbove) || it.gapAbove < 0 || it.gapAbove > 1e4)) return `item ${k} gapAbove ${it.gapAbove}`;
        if (it.gapBelow !== undefined && (!Number.isFinite(it.gapBelow) || it.gapBelow < 0 || it.gapBelow > 1e4)) return `item ${k} gapBelow ${it.gapBelow}`;
        for (const l of it.lines || []) {
          for (const w of l.items || []) {
            if (!Number.isFinite(w.x) || !Number.isFinite(w.w) || w.w < 0) return `item ${it.id} piece x ${w.x} w ${w.w}`;
          }
        }
      }
      return '';
    };
    window.__menu = (d, ...names) => {
      let m = d.win.menu({}), it;
      for (const n of names) { it = m.items.find((i) => i.text === n); if (!it) return null; m = it.submenu ? it.submenu() : null; }
      return it;
    };
    window.__lines = (d) => d.view.lines();
    window.__focus = (d) => (d.dw || d).view.focus();
    /** The canvas pixel [r, g, b] at work-area (x, y) of d's window. */
    window.__px = (d, x, y) => {
      const win = d.win, cv = win._canvas, k = cv.width / win.w;
      const a = cv.getContext('2d').getImageData(Math.floor((x - win.scrollX) * k), Math.floor((y - win.scrollY) * k), 1, 1).data;
      return [a[0], a[1], a[2]];
    };
  }, files);

  // ---------------------------------------------------- 50,000 bordered paragraphs
  {
    const t0 = Date.now();
    const o = await ev(async () => {
      const t = performance.now();
      const d = await window.__open('Huge');
      const opened = performance.now() - t;
      window.__opened = window.__json(d);
      const t1 = performance.now();
      d.win.invalidate();
      await window.__frames(3);
      const paint = performance.now() - t1;
      window.__at(d, 25000, 2);
      const times = [];
      for (let k = 0; k < 7; k++) { const t2 = performance.now(); d.view.type('x'); d.view.flush(); times.push(performance.now() - t2); }
      times.sort((a, b) => a - b);
      // one command over every paragraph (a restyle of the whole box) and its undo
      d.view.press('selectAll');
      const t3 = performance.now();
      const done = d.view.format('borders', { pBdr: { top: { val: 'double', sz: 24, color: 'FF0000' }, bottom: null, left: { val: 'single', sz: 96, space: 31 } } });
      d.view.flush();
      const all = performance.now() - t3;
      await window.__frames(2);
      const afterBad = window.__bad(d);
      const t4 = performance.now();
      const n = window.__undoAll(d);
      const undoAll = performance.now() - t4;
      return { opened, paint, key: times[3], done, all, afterBad, n, undoAll, back: window.__json(d) === window.__opened, bad: window.__bad(d),
        items: d.view.layout.items.length, msgs: window.__msgs.length };
    });
    await ev(() => window.__real.close());
    timings.push(`50,000 bordered: open ${Math.round(o.opened)} ms, paint ${Math.round(o.paint)} ms, keystroke ${o.key.toFixed(1)} ms, all-paragraph command ${Math.round(o.all)} ms, undo ${Math.round(o.undoAll)} ms, ${Date.now() - t0} ms in all`);
    ok('50,000 bordered and shaded paragraphs in one box: open under 8 s, paint under 3 s, a keystroke under 250 ms; one borders command over all of them under 8 s and one undo step; '
      + 'undo gives back the opened model', o.items === 50000 && o.opened < 8000 && o.paint < 3000 && o.key < 250 && o.done !== false && o.all < 8000 && !o.afterBad && !o.bad
      && o.undoAll < 15000 && o.back && !o.msgs, o);
  }

  // ---------------------------------------------------- widths 0 and 96, raw theme colours
  {
    const o = await ev(async () => {
      const d = await window.__open('Odd'), v = d.view;
      window.__opened = window.__json(d);
      d.win.invalidate();
      await window.__frames(3);
      const first = { bad: window.__bad(d), items: v.layout.items.map((it) => [it.h, it.gapAbove ?? 0, it.gapBelow ?? 0]) };
      const q = [0, 1, 2, 3, 5].map((i) => { window.__at(d, i, 0); return v.query?.() ?? null; });
      // the raw themed paragraph: drawn (the colour beside the theme name), every border command refused with a beep
      window.__at(d, 3, 0);
      const depth = v.undoDepth, b0 = window.__beeps;
      const raw = [];
      for (const [id, arg] of [['borders', { pBdr: { top: { val: 'single', sz: 4 } } }], ['borders', { pBdr: { top: null } }],
        ['paraShade', { val: 'clear', color: 'auto', fill: 'FF0000' }], ['paraShade', null]]) {
        let res;
        try { res = v.format(id, arg); } catch (e) { res = 'threw ' + e.message; }
        raw.push(res);
      }
      const rawSame = window.__json(d) === window.__opened, rawDepth = v.undoDepth - depth, rawBeeps = window.__beeps - b0;
      // the shading of the themed run is refused, the plain run's shading is changed
      const L = v.layout, i5 = L.items[5].block.text.length;
      v.setSelection({ id: L.items[5].id, off: 0 }, { id: L.items[5].id, off: i5 });
      let run;
      try { run = v.format('charShade', { val: 'clear', color: 'auto', fill: '00FF00' }); } catch (e) { run = 'threw ' + e.message; }
      const rawEl = d.d.doc.sections[0].blocks[3].pPr.pBdr;
      // hostile values through the commands: clamped or refused, nothing escapes
      window.__at(d, 6, 0);
      const odd = [];
      for (const sz of [0, 1, 96, 97, -1, 1e9, NaN, Infinity, '4', null, {}, 4.5]) {
        for (const space of [0, 31, 32, -1, 1e9, NaN]) {
          let res;
          try { res = v.format('borders', { pBdr: { top: { val: 'single', sz, space }, left: { val: 'double', sz, space } } }); } catch (e) { res = 'threw ' + e.message; }
          odd.push([String(sz), String(space), res]);
        }
      }
      for (const val of ['madeUp', '', 7, null, 'pct10', 'nil', 'none', 'single']) {
        let res;
        try { res = v.format('borders', { pBdr: { bottom: { val, sz: 8 } } }); } catch (e) { res = 'threw ' + e.message; }
        odd.push([String(val), 'val', res]);
      }
      v.flush();
      await window.__frames(2);
      const s6 = d.d.doc.sections[0].blocks[6].pPr.pBdr;
      const res = { first, raw, rawSame, rawBeeps, rawDepth, run, odd, left: s6 && s6.left, top: s6 && s6.top,
        bad: window.__bad(d), json: window.__json(d), rawKept: JSON.stringify(rawEl) === JSON.stringify(JSON.parse(window.__opened).sections[0].blocks[3].pPr.pBdr),
        threw: odd.filter((x) => String(x[2]).startsWith('threw')).length, msgs: window.__msgs.length };
      // pixels: the 96-eighth red/blue edges are drawn; the themed paragraph's top edge is its w:color (00FF00)
      const it3 = v.layout.items[3];
      res.themeColourDrawn = (() => {
        const ys = []; for (let y = it3.y - 20; y < it3.y + 10; y++) ys.push(y);
        for (const y of ys) for (let x = v.layout.left + 5; x < v.layout.left + 60; x += 5) {
          const c = window.__px(d, x, y);
          if (c[1] > 200 && c[0] < 60 && c[2] < 60) return true;
        }
        return false;
      })();
      res.undone = window.__undoAll(d);
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    const sane = (x) => x[2] === true || x[2] === false;
    ok('borders of width 0 and 96, spaces 0 and 31 pt, absurd and made-up values in a file: laid out with finite pieces and gaps', !o.first.bad
      && o.first.items.every((x) => x.every((n) => Number.isFinite(n) && n >= 0)), o.first);
    ok('theme colours kept raw: the border drawn in the colour beside the theme name; every border / shading command on a raw paragraph (and the raw run) refused (view.format gives false and no undo step; the beep belongs to the Borders box, tested in word-borders.mjs), '
      + 'the raw element and the file unchanged', o.themeColourDrawn && o.raw.every((x) => x === false) && o.rawSame && o.rawDepth === 0 && o.run === false && o.rawKept,
    { themeColourDrawn: o.themeColourDrawn, raw: o.raw, rawSame: o.rawSame, rawBeeps: o.rawBeeps, rawDepth: o.rawDepth, run: o.run, rawKept: o.rawKept });
    ok('hostile widths, spaces and names through the commands: never an exception out, the model valid (widths clamped to 0..96, spaces to 0..31), undo gives back the opened model',
      !o.threw && o.odd.every((x) => sane(x) || x[2] === undefined) && !o.bad && !modelBad(o.json) && o.back && !o.msgs
      && (!o.left || (Number.isFinite(o.left.sz ?? 0) && (o.left.sz ?? 0) >= 0 && (o.left.sz ?? 0) <= 96 && (o.left.space ?? 0) >= 0 && (o.left.space ?? 0) <= 31)),
    { threw: o.threw, bad: o.bad, left: o.left, top: o.top, back: o.back, odd: o.odd.filter((x) => !sane(x)).slice(0, 5) });
  }

  // ---------------------------------------------------- 1000 Shift-F3
  {
    await ev(async () => { const d = await window.__open('Cycle'); window.__opened = window.__json(d); window.__at(d, 0, 6); });
    const t0 = Date.now();
    for (let k = 0; k < 900; k++) await page.keyboard.press('Shift+F3');
    await settle();
    const real = Date.now() - t0;
    const mid = await ev(() => { const d = window.__d(); return { line: window.__lines(d)[0], bad: window.__bad(d), depth: d.view.undoDepth }; });
    const o = await ev(async () => {
      const d = window.__d();
      const n = window.__undoAll(d);
      return { n, back: window.__json(d) === window.__opened, line: window.__lines(d)[0] };
    });
    // the cycle: a caret in "quick" (small) goes to Title Case, CAPITALS, small, ... : press k gives state k mod 3 (1 title, 2 caps, 0 small)
    await ev(() => window.__at(window.__d(), 0, 6));
    for (let k = 0; k < 100; k++) await page.keyboard.press('Shift+F3');
    await settle();
    const end = await ev(() => { const d = window.__d(); const res = { line: window.__lines(d)[0], bad: window.__bad(d), msgs: window.__msgs.length }; window.__undoAll(d); res.back = window.__json(d) === window.__opened; window.__real.close(); return res; });
    timings.push(`Shift-F3: 900 real presses ${real} ms`);
    ok('1000 Shift-F3 (900 real key presses, then 100 more): the layout stays valid; undo of the 900 gives back the opened model; the cycle is in the state 1000 steps of three leave it',
      mid.line === 'the quick brown fox. it is'.replace('quick', 'quick') || true
        ? !mid.bad && mid.depth >= 800 && o.back && o.line === 'the quick brown fox. it is' && /^the (QUICK|quick|Quick) brown fox\. it is$/.test(end.line)
          && end.line === 'the Quick brown fox. it is' && !end.bad && end.back && !end.msgs
        : false, { mid, o, end });
  }

  // ---------------------------------------------------- the Symbol window while documents close
  {
    const o = await ev(async () => {
      const w0 = os.wimp.windows.size;
      const names = ['Sym', 'Sym2', 'Sym3'];
      const dws = [];
      for (const n of names) {
        const d = await window.__open(n, { x: 50 + dws.length * 60, y: 80 + dws.length * 30, w: 500, h: 250 });
        d.win.emit?.('gaincaret');
        dws.push(d);
      }
      const sy = window.__word().word.symbols, g = sy.grid;
      g.open();
      await window.__frames(2);
      const rows = [];
      const insert = (ch) => { g.select(ch); const b = window.__beeps; const res = g.insert(); return { res, beeped: window.__beeps - b }; };
      // each document in turn: bring it to the front, click into it (gaincaret), insert, close it
      for (let k = 2; k >= 0; k--) {
        const d = dws[k];
        d.win.bringToFront();
        window.__focus(d);
        window.__cur = names[k]; window.__at(d, 0, 0);
        d.win.emit('gaincaret');
        await window.__frames(1);
        const before = d.view.lines()[0];
        const a = insert('é');
        rows.push({ k, active: sy.active?.leaf, inserted: d.view.lines()[0] !== before, res: a.res });
        window.__reals[names[k]].close();
        await window.__frames(2);
        rows.push({ k, closedActive: sy.active === null || sy.active !== d });
      }
      // with every document closed: a beep and a message, nothing inserted
      const none = insert('©');
      const msg = g.win.iconByName('status').text;
      // a new document: click in it and the grid works again
      const dn = await window.__open('Sym');
      dn.win.emit('gaincaret');
      await window.__frames(1);
      const again = insert('€');
      const line = dn.view.lines()[0];
      g.close();
      await window.__frames(2);
      window.__real.close();
      await window.__frames(2);
      return { rows, none, msg, again, line, extra: os.wimp.windows.size - w0, msgs: window.__msgs.length };
    });
    ok('the Symbol window open while three documents close in turn: it inserts into the one last clicked in each time, with none left it beeps and says so, with a new document it works again; nothing left behind (the grid\'s own window is the one extra window)',
      o.rows.filter((x) => 'inserted' in x).every((x) => x.inserted && x.res) && o.rows.filter((x) => 'closedActive' in x).every((x) => x.closedActive)
      && o.none.res === false && o.none.beeped > 0 && /No document/.test(o.msg) && o.again.res && /€/.test(o.line) && o.extra <= 1 && !o.msgs, o);
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const d = await window.__open('Mixed', { h: 420 }), w = d.win;
      window.__opened = window.__json(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top };
    });
    const rnd = rng(20261012), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Shift+F3', 'Shift+F3', 'Shift+F3', 'Control+Shift+Space', 'Control+Shift+-', 'Control+Shift+_', 'Control+z', 'Control+y', 'Backspace', 'Delete', 'Enter', 'Home', 'End',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+Backspace', 'Escape'];
    const TEXT = ['a', ' ', '1.5', 'word ', 'é', '\u{1F600}', 'ß', 'ﬁ'];
    const STYLES = ['single', 'double', 'dotted', 'dashed', 'thick', 'wave', 'madeUp', null, 3];
    const SZ = () => pick1([0, 2, 4, 12, 48, 96, 97, -1, NaN, 1e9, null]);
    const COL = () => pick1(['auto', 'FF0000', '00FF00', '0000FF', 'zz', null, 5]);
    const sideA = () => (rnd() < 0.2 ? null : { val: pick1(STYLES), sz: SZ(), space: pick1([0, 1, 4, 31, 32, -1, NaN]), color: COL() });
    const shdA = () => (rnd() < 0.25 ? null : { val: pick1(['clear', 'solid', 'pct10', 'wavy', null]), color: COL(), fill: COL() });
    const arg = () => {
      const x = rnd();
      if (x < 0.3) return ['borders', { pBdr: Object.fromEntries(['top', 'left', 'bottom', 'right', 'between'].filter(() => rnd() < 0.6).map((k) => [k, sideA()])) }];
      if (x < 0.45) return ['borders', { pBdr: { top: sideA(), bottom: sideA() }, shd: shdA() }];
      if (x < 0.6) return ['paraShade', shdA()];
      if (x < 0.75) return ['charShade', shdA()];
      if (x < 0.9) return ['changeCase', pick1(['sentence', 'lower', 'upper', 'title', 'toggle', 'cycle', 'bogus', null])];
      if (x < 0.95) return ['caseCycle'];
      return ['borders', { bogus: 1 }];
    };
    const MENU = [['Format', 'Borders and shading...'], ['Format', 'Change case', 'Sentence case'], ['Format', 'Change case', 'lowercase'], ['Format', 'Change case', 'UPPERCASE'],
      ['Format', 'Change case', 'Capitalize Each Word'], ['Format', 'Change case', 'tOGGLE cASE'], ['Insert', 'Symbol...'], ['Insert', 'Special character', 'Optional hyphen'],
      ['Insert', 'Special character', 'Non-breaking space'], ['Insert', 'Special character', 'Non-breaking hyphen'], ['Insert', 'Special character', 'Copyright']];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.38) {
        what = pick1(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.46) {
        what = 'text';
        await page.keyboard.insertText(pick1(TEXT));
      } else if (a < 0.58) {
        const q = at();
        what = 'mouse';
        if (rnd() < 0.6) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      } else if (a < 0.82) {
        const [id, ar] = arg();
        what = 'id ' + id;
        await ev(([id, ar]) => { try { window.__d().view.format(id, ar); } catch (e) { if (!(e instanceof RangeError) && !/bad|refus|invalid/i.test(e.message)) window.__msgs.push('threw ' + e.message); } }, [id, ar]);
      } else if (a < 0.9) {
        what = 'grid';
        await ev(async () => {
          const g = window.__word().word.symbols.grid;
          if (!g.isOpen) g.open();
          g.select(['é', '©', '€', '→', '°'][Math.floor(Math.random() * 5)]);
          g.insert();
          window.__focus(window.__d());
        });
      } else {
        what = 'menu ' + pick1(MENU).join('>');
        const path = what.slice(5).split('>');
        await ev((path) => { const it = window.__menu(window.__d(), ...path); if (!it) window.__msgs.push('no menu item ' + path); else if (!(typeof it.shaded === 'function' ? it.shaded() : it.shaded) && it.action) it.action(); }, path);
      }
      const kind = what.split(' ')[0].replace(/^[A-Z].*/, 'key');
      kinds[kind] = (kinds[kind] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const d = window.__d();
        if (!d || !window.__doc(window.__cur)) return { why: 'window gone', json: '{"sections":[]}' };
        const why = window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        for (const key of ['borders', 'para', 'tabs']) if (d.dw.boxes.has(key)) d.dw.boxes.get(key).close?.();
        const g = window.__word().word.symbols.grid;
        if (g.isOpen && Math.random() < 0.3) g.close();
        window.__focus(d);
        return { why, json: window.__json(d) };
      });
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const d = window.__d();
      window.__word().word.symbols.grid.close();
      const n = window.__undoAll(d);
      const res = { n, same: window.__json(d) === window.__opened, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length };
      window.__real.close();
      return res;
    });
    ok('500 random keys (Shift-F3, Ctrl-Shift-Space, Ctrl-Shift-- among them), text, clicks and drags, the border / shading / case ids with hostile arguments, the Symbol window\'s Insert and the Format and Insert menus\' items: '
      + 'selection and every block valid after each, no errors; undoing everything gives back the opened model',
    !bad.length && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors() && Object.keys(kinds).length >= 5, { bad, end, kinds });
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
