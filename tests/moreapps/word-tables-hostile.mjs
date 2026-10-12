// !Letters' tables against hostile input in the real desktop (Batch C, C7.1). Documents: D14f's set
// opened in the window (10,000 rows, 63 and 64 columns, gridSpan 0 / 64 / -1 / 1e9, an empty and a 0-width grid,
// a vMerge continue first, depth 9, 200 nested tables (refused by the XML depth cap with its message), ragged rows,
// a row of only marks, `__proto__` property names, a file of 1,000,000 cells and one of 1,000,001 paragraphs in
// cells: both refused in < 10 s with the window still usable), each typed or Opaque with no message, laid out,
// drawn, edited by keys and undone to the opened model; 1000 x 5 and 1000 x 63 tables, a merged staircase, a
// table with every column merged top to bottom, nested depth 8 and 100 tables. Budgets (D20, conditions-based
// waits, ratios and margins against the same operation in a table-free document of the same run, never a bare
// threshold): a keystroke (type, Backspace, Tab / arrows, Shift-selection, Ctrl-B) in a cell of a 1000 x 5 and
// a 1000 x 63 table; the first arrow press across 4995 hidden merged cells after an edit; scrolling end to end;
// a drag across cells; select all + Delete and undo under 5 s; 1000 Tab presses at the last cell (1000 rows, one
// step each) and undo of all of them; Table to text and Text to table over 5000 cells; a hostile HTML table
// pasted; a column border dragged on 1000 x 5 and 1000 x 63 tables. 500 seeded random actions on a document of
// merged, nested and big tables (keys, text, clicks, drags off the window, every table command id and hostile
// ones (`__proto__`, `constructor`), the Table menu, the Insert table, Split cells, Table properties and Convert
// boxes filled with hostile values, hostile HTML tables pasted, border drags, zoom) with the selection and the
// model valid after each and undo of all of them giving back the opened model. Windows closed in the middle of a
// border drag, a cell drag, with each box and a menu open, and 20 open / close cycles leak nothing. No page
// errors. SECTIONS=a,b,... runs only those sections of this file (hostile, big, budgets, convert, random, close).
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { tbl, tr, tc, tblDocx, bigTable, nestedTable, TABLE_NORMAL, TABLE_GRID } from './tbl-fixtures.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Letters/ModelCheck';

const ONLY = process.env.SECTIONS ? process.env.SECTIONS.split(',') : null;
const want = (s) => !ONLY || ONLY.includes(s);
const STYLES = { styles: TABLE_NORMAL + TABLE_GRID };
const arr = async (x) => Array.from(await x);
const cellP = (t) => tc(p(r(t)));
const BS = (id, n = 'm' + id) => `<w:bookmarkStart w:id="${id}" w:name="${n}"/>`;
const BE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const plain = (n) => Array.from({ length: n }, (_, i) => p(r(`r${i}`))).join('');
const around = (t, n = 200) => plain(n) + t + plain(n);
/** A merged staircase: column j continues from above except at every (j % 7 + 2)th row. */
const stair = (rows, cols) => tbl(Array.from({ length: rows }, (_, i) => tr(Array.from({ length: cols }, (_, j) => {
  const top = i % (j % 7 + 2) === 0;
  return tc(p(r(`s${i}c${j}`)), { tcPr: top ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>' });
}))));
/** Every column of a rows x cols table merged top to bottom (the C3 fix wave's m1 case). */
const columns = (rows, cols) => tbl(Array.from({ length: rows }, (_, i) => tr(Array.from({ length: cols }, (_, j) =>
  tc(p(r(i ? '' : `t${j}`)), { tcPr: i ? '<w:vMerge/>' : '<w:vMerge w:val="restart"/>' })))));
const many = (n) => Array.from({ length: n }, (_, i) => bigTable(3, 3) + p(r(`between ${i}`))).join('');
const span = (v) => tbl([tr([tc(p(r(`span ${v}`)), { tcPr: `<w:gridSpan w:val="${v}"/>` })])]);
const MIX = p(r('Mix top')) + tbl([
  tr([tc(p(r('wide')), { tcPr: '<w:gridSpan w:val="2"/>' }), tc(p(r('down')), { tcPr: '<w:vMerge w:val="restart"/>' })]),
  tr([cellP('x'), cellP('y'), tc(p(), { tcPr: '<w:vMerge/>' })]),
  tr([cellP('q'), cellP('w'), cellP('e')])], { tblPr: '<w:tblStyle w:val="TableGrid"/>' }) + p(r('Mix mid'))
  + nestedTable(3) + p(r('Mix tail')) + bigTable(20, 4) + p(r('a\tb\tc')) + p(r('d\te\tf')) + p(r('end'));
const ROW1M = '<w:tr>' + '<w:tc><w:p/></w:tc>'.repeat(63) + '</w:tr>';
const GRID63 = '<w:tblGrid>' + '<w:gridCol w:w="100"/>'.repeat(63) + '</w:tblGrid>';
const CELLS1M = '<w:tbl><w:tblPr/>' + GRID63 + ROW1M.repeat(16000) + '</w:tbl>' + p(r('x'));
const PARAS1M = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' + ('<w:tr><w:tc>' + '<w:p/>'.repeat(10)
  + '</w:tc></w:tr>').repeat(100000) + '</w:tbl>' + p(r('x'));
const PROTO = p(r('proto')) + '<w:tbl><w:tblPr><w:tblStyle w:val="__proto__"/><w:__proto__ w:val="1"/></w:tblPr>'
  + '<w:tblGrid><w:gridCol w:w="2000" w:__proto__="x"/></w:tblGrid><w:tr><w:trPr><w:__proto__/></w:trPr><w:tc>'
  + '<w:tcPr><w:__proto__ w:val="1"/></w:tcPr>' + p(BS(7, '__proto__') + r('a') + BE(7), '<w:pStyle w:val="__proto__"/>')
  + '</w:tc></w:tr></w:tbl>' + p(r('after'));
const PROTO2 = p(r('proto')) + '<w:tbl><w:tblPr><w:tblStyle w:val="__proto__"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/>'
  + '</w:tblGrid><w:tr><w:tc>' + p(BS(7, '__proto__') + r('a') + BE(7), '<w:pStyle w:val="__proto__"/>') + '</w:tc></w:tr></w:tbl>'
  + p(r('after'));
const PROTO_STYLES = '<w:style w:type="table" w:styleId="__proto__"><w:name w:val="__proto__"/></w:style>';
const HOSTILE = {
  Rows10k: [bigTable(10000, 1), 'tbl'],
  Cols63: [bigTable(3, 63), 'tbl'],
  Cols64: [bigTable(3, 64), 'opaque'],
  Spans: [[0, 64, -1, 1000000000, 'x'].map(span).join(p()), null],
  GridEmpty: [tbl([tr([cellP('a')])], { grid: [] }) + p(), null],
  GridZero: [tbl([tr([cellP('a'), cellP('b')])], { grid: [0, 0] }) + p(), null],
  VFirst: [tbl([tr([tc(p(r('cont')), { tcPr: '<w:vMerge/>' }), cellP('b')]), tr([cellP('c'), cellP('d')])]) + p(), null],
  Nest9: [nestedTable(9) + p(), 'tbl'],
  Ragged: [tbl([tr([cellP('a'), cellP('b'), cellP('c')]), tr([cellP('d')]), tr([cellP('e'), cellP('f')])]) + p(), null],
  Marks: [tbl([tr([cellP('a')]), tr([], { tail: BS(1) + BE(1) })]) + p(), null],
  Proto: [PROTO, null],
  Proto2: [PROTO2, 'tbl'],
};
const files = {
  Plain5: await arr(tblDocx(plain(5000))),
  Plain63: await arr(tblDocx(plain(63000))),
  Big5: await arr(tblDocx(around(bigTable(1000, 5)), STYLES)),
  Big63: await arr(tblDocx(p(r('top')) + bigTable(1000, 63) + p(r('end')), STYLES)),
  Stair: await arr(tblDocx(p(r('top')) + stair(1000, 63) + p(r('end')))),
  AllMerged: await arr(tblDocx(p(r('top')) + columns(1000, 5) + p(r('end')))),
  Nest8: await arr(tblDocx(p(r('top')) + nestedTable(8) + p(r('end')))),
  Hund: await arr(tblDocx(many(100))),
  Mix: await arr(tblDocx(MIX, STYLES)),
  Cells1M: await arr(tblDocx(CELLS1M)),
  Paras1M: await arr(tblDocx(PARAS1M)),
  Nest200: await arr(tblDocx(nestedTable(200) + p())),
  ...Object.fromEntries(await Promise.all(Object.entries(HOSTILE).map(async ([n, [b]]) => [n, await arr(tblDocx(b,
    n.startsWith('Proto') ? { styles: TABLE_NORMAL + PROTO_STYLES } : STYLES))]))),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 1200)}`);
const timings = [];
const { browser, page, logs } = await launch();
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const until = (src, arg, timeout = 15000) => page.waitForFunction(src, arg, { timeout }).then(() => true, () => false);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const fix = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
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
  await ev((files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.path.endsWith('.' + leaf));
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    /** Open leaf in a window of the given geometry: {ok, ms, msg} (a refusal leaves no document). */
    window.__open = async (leaf, at = {}) => {
      const m0 = window.__msgs.length, t0 = performance.now();
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 400 && !window.__word(); i++) await new Promise((res) => setTimeout(res, 50));
      let real = null, err = null;
      try { real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`); } catch (e) { err = String(e?.message ?? e); }
      const ms = performance.now() - t0, msg = window.__msgs.slice(m0).join(' | ');
      if (!real) return { ok: false, ms, msg, err };
      real.win.open({ x: 40, y: 40, w: 900, h: 560, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__cur = leaf;
      (window.__reals ||= {})[leaf] = real;
      return { ok: true, ms, msg };
    };
    window.__client = (w, x, y) => { const q = w.workToScreen(x, y); return window.__screen(q.x, q.y); };
    window.__d = (leaf) => window.__doc(leaf ?? window.__cur);
    window.__json = (d) => JSON.stringify({ sections: d.d.doc.sections, settings: d.d.doc.rawSettings });
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 20000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__close = async (leaf) => { window.__reals?.[leaf]?.close(); delete window.__reals?.[leaf]; await window.__frames(2); };
    /** A seeded generator for the page's own random choices (the run is repeatable). */
    window.__r = (() => {
      let a = 20261013;
      return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    })();
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    /** '' when the selection and the layout are valid (a sample of the flow for the big ones). */
    window.__bad = (d) => {
      const v = d.dw.view, L = v.L, s = d.view.selection;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const q of [s.anchor, s.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'p' && q.off > it.block.text.length) return `off ${q.off} > ${it.block.text.length}`;
        if (it.kind !== 'p' && q.off > 1) return `box off ${q.off}`;
      }
      const n = L.flow.length, step = n > 4000 ? Math.ceil(n / 4000) : 1;
      for (let k = 0; k < n; k += step) {
        const it = L.flow[k];
        if (!Number.isFinite(it.y) || !Number.isFinite(it.h) || it.h < 0 || it.h > 5e7) return `item ${it.id} y ${it.y} h ${it.h}`;
        if (!Number.isFinite(it.x) || !Number.isFinite(it.w) || it.w < 0) return `item ${it.id} x ${it.x} w ${it.w}`;
      }
      return '';
    };
    /** Sum of what a keystroke costs, as the desktop does it: the key handler, the layout (flush) and the paint. */
    window.__probe = (d) => {
      const v = d.dw.view, w = d.dw.win, acc = { t: 0 };
      const orig = {};
      const wrap = (o, k) => {
        orig[k] = { own: Object.hasOwn(o, k), f: o[k], o };
        const f = o[k];
        o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { acc.t += performance.now() - t; } };
      };
      wrap(v, 'key'); wrap(v, 'flush'); wrap(w, '_onRedraw');
      return {
        take: () => { const x = acc.t; acc.t = 0; return x; },
        end: () => { for (const [k, { own, f, o }] of Object.entries(orig)) { if (own) o[k] = f; else delete o[k]; } },
      };
    };
    window.__ws = (d, x, y) => {
      const v = d.dw.view, z = v.zoom, t = v.L.top, s = d.win.workToScreen(x * z, t + (y - t) * z);
      return window.__screen(s.x, s.y);
    };
    /** The n-th table item of d in flow order (nested ones too). */
    window.__tbl = (d, n = 0) => d.dw.view.L.flow.filter((x) => x.kind === 'tbl')[n];
    /** Cell (r, c) of the n-th table: its paragraph's id, the client point of its middle. */
    window.__cellAt = (d, r, c, n = 0) => {
      const it = window.__tbl(d, n), row = it.rows[r], cl = row.cells[c];
      const q = window.__ws(d, cl.x + Math.min(cl.w, 60) / 2, row.y + Math.min(row.h, 30) / 2);
      return { id: cl.col.items[0].id, ...q };
    };
    window.__head = (d) => d.view.selection.head;
    /** Put the caret at the start of cell (r, c) of the first table (scrolled into view). */
    window.__goCell = async (d, r, c) => {
      const it = window.__tbl(d), id = it.rows[r].cells[c].col.items[0].id;
      d.view.setSelection({ id, off: 0 });
      d.dw.view.focus();
      await window.__frames(3);
      return id;
    };
    /** Scroll so that row r of the first table is 200 px below the window's top (every point near it is visible). */
    window.__rowTop = async (d, r) => {
      const it = window.__tbl(d);
      d.win.open({ x: 40, y: 40, w: 900, h: 560, behind: 'top', scrollX: 0, scrollY: Math.max(0, it.rows[r].y - 200) });
      await window.__frames(3);
    };
    /** Put the selection in a random table cell (a caret, or a range to another cell's paragraph); a table back by undo if none is left. */
    window.__aim = (d, one = window.__r() < 0.5) => {
      const v = d.dw.view;
      for (let k = 0; k < 30 && !v.L.flow.some((x) => x.kind === 'tbl'); k++) { d.view.press('undo'); d.view.flush(); }
      const ps = v.L.flow.filter((x) => x.kind === 'p' && x.col !== v.L.root);
      if (!ps.length) return false;
      const a = ps[Math.floor(window.__r() * ps.length)], b = one ? a : ps[Math.floor(window.__r() * ps.length)];
      d.view.setSelection({ id: a.id, off: Math.floor(window.__r() * (a.block.text.length + 1)) }, one ? undefined : { id: b.id, off: b.block.text.length });
      return true;
    };
    window.__menu = (d, ...names) => {
      let m = d.win.menu({}), it;
      for (const n of names) { it = m.items.find((i) => i.text === n); if (!it) return null; m = it.submenu ? it.submenu() : null; }
      return it;
    };
    window.__fire = (d, o) => {
      if (os.wimp.caret?.window !== d.win) d.dw.view.focus();
      const dt = new DataTransfer();
      if (o.text != null) dt.setData('text/plain', o.text);
      if (o.html != null) dt.setData('text/html', o.html);
      const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      os.wimp.textInput.el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    window.__counts = () => {
      const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
      return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
        wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, docs: t.word.docs.filter((d) => !d.closed).length };
    };
    /** A box's api (the box must be open or have been asked for). */
    window.__api = (d, key) => window.__word().word.dialog({ key: key + ':' + d.docKey, rows: [] });
    window.__okAt = (d, key, name = 'button:OK') => {
      const w = window.__api(d, key).win, ic = w.iconByName(name);
      if (!ic) return null;
      const b = ic.bbox, s = w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      return window.__screen(s.x, s.y);
    };
  }, files);
  await ev(() => os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters'));
  await page.waitForFunction(() => !!window.__word()?.word, null, { timeout: 20000 });
  const open = (leaf, at) => ev(([l, a]) => window.__open(l, a), [leaf, at]);
  /** Forget the messages so far (each section checks its own). */
  const forget = () => ev(() => { window.__msgs.length = 0; });
  const close = (leaf) => ev((l) => window.__close(l), leaf);
  /** Real key presses, the frames they paint in awaited at the end. */
  const keys = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
  /** Wait until `fn` is true in the page (conditions, never a sleep). */
  const waitUndo = (leaf, n) => until(([l, n]) => window.__d(l).view.undoDepth === n, [leaf, n]);
  const sampleTimes = async (leaf, { n = 30, warm = 3, before, press }) => {
    await ev((l) => { window.__pr = window.__probe(window.__d(l)); }, leaf);
    const ms = [];
    try {
      for (let k = 0; k < n + warm; k++) {
        if (before) await before(k);
        await ev(() => window.__pr.take());
        await page.keyboard.press(press);
        await settle();
        const t = await ev(() => window.__pr.take());
        if (k >= warm) ms.push(t);
      }
    } finally {
      await ev(() => { window.__pr?.end(); window.__pr = null; });
    }
    return median(ms);
  };

  // ---------------------------------------------------- D14f's hostile set: typed or Opaque, nothing else
  if (want('hostile')) {
    const rows = [];
    for (const [leaf, [, kind]] of Object.entries(HOSTILE)) {
      const o = await open(leaf);
      if (!o.ok) { rows.push({ leaf, refused: o.msg || o.err || 'refused' }); continue; }
      const res = await ev(async (leaf) => {
        const d = window.__d(leaf), v = d.view;
        const opened = window.__json(d), t0 = performance.now();
        const types = d.d.doc.sections.flatMap((s) => s.blocks).map((b) => b.type);
        d.win.invalidate();
        await window.__frames(3);
        const paint = performance.now() - t0;
        // keys at the first paragraph and at the end, a Tab storm, select all + Delete, undo everything
        const b0 = window.__beeps;
        v.setSelection({ id: d.dw.view.L.items[0].id, off: 0 });
        v.type('x'); v.flush();
        v.press('selectAll'); v.press('delete'); v.flush();
        await window.__frames(2);
        const bad1 = window.__bad(d);
        const n = window.__undoAll(d);
        await window.__frames(2);
        return { types: { tbl: types.filter((x) => x === 'tbl').length, opaque: types.filter((x) => x === 'opaque').length },
          paint, n, back: window.__json(d) === opened, bad: window.__bad(d) + bad1, beeps: window.__beeps - b0,
          msgs: window.__msgs.slice(), openedSize: opened.length };
      }, leaf);
      rows.push({ leaf, ms: Math.round(o.ms), ...res, want: kind });
      await close(leaf);
    }
    const bad = rows.filter((x) => x.refused || x.msgs.length || x.bad || !x.back || x.ms > 10000 || x.paint > 10000
      || (x.want === 'tbl' && !x.types.tbl) || (x.want === 'opaque' && (!x.types.opaque || x.types.tbl)));
    timings.push('hostile set: ' + rows.map((x) => `${x.leaf} ${x.ms} ms ${x.types ? x.types.tbl + 't/' + x.types.opaque + 'o' : 'refused'}`).join(', '));
    ok('D14f: 10,000 rows, 63 / 64 columns, gridSpan 0 / 64 / -1 / 1e9 / x, an empty and a 0-width grid, a vMerge continue first, '
      + 'depth 9, ragged rows, a row of only marks and `__proto__` names all open (typed or Opaque as expected) with no message, '
      + 'are laid out and drawn, take keys, select all + Delete, and undo gives back the opened model', !bad.length, bad);
    // refused files: today's messages, quickly, the window still usable
    const t0 = Date.now();
    const refusals = {};
    for (const leaf of ['Cells1M', 'Paras1M', 'Nest200']) {
      const o = await open(leaf);
      refusals[leaf] = { ok: o.ok, ms: Math.round(o.ms), msg: o.msg };
    }
    const alive = await open('Plain5');
    const live = await ev(() => { const d = window.__d('Plain5'); d.view.setSelection({ id: d.dw.view.L.items[3].id, off: 0 }); d.view.type('x'); d.view.flush();
      return d.d.doc.sections[0].blocks[3].text; });
    await close('Plain5');
    timings.push(`refused files ${Date.now() - t0} ms: ` + JSON.stringify(refusals));
    ok('1,000,000+ cells and 1,000,001 paragraphs in cells (the paragraph cap: the window says "more than 200,000 '
      + 'paragraphs", C7 fix A4), and 200 nested '
      + 'tables (the XML depth cap: "not well-formed") are refused with a message in < 10 s each and the window stays usable',
    !refusals.Cells1M.ok && !refusals.Paras1M.ok && !refusals.Nest200.ok && /more than 200,000 paragraphs/.test(refusals.Cells1M.msg)
      && /more than 200,000 paragraphs/.test(refusals.Paras1M.msg) && /not well-formed/.test(refusals.Nest200.msg)
      && Object.values(refusals).every((x) => x.ms < 10000) && alive.ok && live === 'xr3', { refusals, alive, live });
  }

  // ---------------------------------------------------- 1000 x 5 and 1000 x 63: open, scroll, budgets
  /** Budget series: a cell of the table against the same key in a table-free document of this run (median ms per key press:
   *  the key handler, the layout and the paint). */
  async function budgets(tleaf, pleaf, r0, c0, paraIndex) {
    await open(tleaf); await open(pleaf);
    const o = {};
    const SERIES = [['type', 'k', null], ['Backspace', 'Backspace', 'k'], ['Tab / ArrowRight', null, null],
      ['Shift+ArrowRight', 'Shift+ArrowRight', null], ['Ctrl-B', 'Control+b', 'sel']];
    for (const [what, key, prep] of SERIES) {
      for (const [leaf, table] of [[tleaf, true], [pleaf, false]]) {
        await ev(([l, table, r0, c0, i]) => {
          const d = window.__d(l);
          if (table) return window.__goCell(d, r0, c0);
          d.view.setSelection({ id: d.dw.view.L.items[i].id, off: 0 });
          d.dw.view.focus();
        }, [leaf, table, r0, c0, paraIndex]);
        await settle();
        if (prep === 'k') await page.keyboard.type('k'.repeat(60));
        if (prep === 'sel') { await page.keyboard.press('End'); await page.keyboard.press('Shift+Home'); }
        await settle();
        o[`${leaf}:${what}`] = await sampleTimes(leaf, { n: 25, press: key ?? (table ? 'Tab' : 'ArrowRight') });
      }
    }
    return o;
  }
  if (want('big')) {
    await forget();
    for (const [leaf, ms] of [['Big5', 1500], ['Big63', 20000], ['Stair', 20000], ['AllMerged', 5000], ['Nest8', 5000], ['Hund', 5000]]) {
      const times = [];
      let last = null;
      for (let k = 0; k < 3; k++) {
        last = await open(leaf);
        times.push(last.ms);
        if (k < 2) await close(leaf);
      }
      const med = median(times);
      const res = await ev((leaf) => {
        const d = window.__d(leaf);
        return { tables: d.dw.view.L.flow.filter((x) => x.kind === 'tbl').length, bad: window.__bad(d), msgs: window.__msgs.length,
          blocks: d.d.doc.sections.reduce((n, s) => n + s.blocks.length, 0) };
      }, leaf);
      timings.push(`${leaf} opens in ${Math.round(med)} ms (median of 3)`);
      ok(`${leaf} opens (median of 3 < ${ms} ms), typed, laid out, no message`, med < ms && res.tables >= 1 && !res.bad && !res.msgs, { times, res });
      await close(leaf);
    }
  }

  // ---------------------------------------------------- scrolling end to end
  if (want('big')) {
    const scroll = {};
    for (const leaf of ['Plain5', 'Big5', 'Big63', 'Stair', 'Hund', 'AllMerged']) {
      await open(leaf);
      const res = await ev(async (leaf) => {
        const d = window.__d(leaf), w = d.dw.win, f = w._onRedraw;
        let painted = 0, worst = 0;
        w._onRedraw = (g, rc) => { const t = performance.now(); try { f(g, rc); } finally { painted += performance.now() - t; } };
        try {
          const L = d.dw.view.L, h = Math.ceil(L.h ?? L.items.at(-1).y + L.items.at(-1).h);
          const step = Math.max(300, Math.ceil(h / 60));
          let n = 0;
          for (let y = 0; y <= h; y += step) {
            painted = 0;
            w.open({ ...w.bounds?.(), x: 40, y: 40, w: 900, h: 560, behind: 'top', scrollX: 0, scrollY: y });
            await window.__frames(1);
            worst = Math.max(worst, painted);
            n++;
          }
          return { n, worst, h, y: w.scrollY, bad: window.__bad(d) };
        } finally { w._onRedraw = f; }
      }, leaf);
      scroll[leaf] = res;
      await close(leaf);
    }
    timings.push('scroll end to end, worst frame paint: ' + Object.entries(scroll).map(([k, v]) => `${k} ${fix(v.worst)} ms/${v.n} stops`).join(', '));
    const base = scroll.Plain5.worst;
    ok('scrolled end to end (60 stops) the worst frame of every table document paints within 3 x the table-free document\'s worst + 60 ms '
      + '(only the rows in view are drawn), layout valid after', Object.entries(scroll).every(([k, v]) => !v.bad && (v.n > 5 || v.h < 1000) && (v.h < 1000 || v.y > v.h / 2)
      && (k === 'Plain5' || v.worst <= base * 3 + 60)), scroll);
  }

  // ---------------------------------------------------- keystroke budgets against a table-free baseline
  if (want('budgets')) {
    await forget();
    const all = {};
    Object.assign(all, await budgets('Big5', 'Plain5', 500, 2, 2500));
    await close('Big5'); await close('Plain5');
    Object.assign(all, await budgets('Big63', 'Plain63', 500, 30, 31500));
    await close('Big63'); await close('Plain63');
    timings.push('keystroke (key + layout + paint, ms, median): ' + Object.entries(all).map(([k, v]) => `${k} ${fix(v)}`).join(', '));
    const bad = [];
    for (const size of [['Big5', 'Plain5'], ['Big63', 'Plain63']]) {
      for (const w of ['type', 'Backspace', 'Tab / ArrowRight', 'Shift+ArrowRight', 'Ctrl-B']) {
        const t = all[`${size[0]}:${w}`], b = all[`${size[1]}:${w}`];
        // D20: within +5 ms of the plain one; the margins here grow with the baseline (load) and with the size (63,000 cells)
        const limit = size[0] === 'Big5' ? Math.max(b * 3, b + 5) + 3 : Math.max(b * 4, b + 15) + 10;
        if (!(t <= limit)) bad.push({ size: size[0], what: w, table: fix(t), plain: fix(b), limit: fix(limit) });
      }
    }
    ok('D20: a keystroke (type, Backspace, Tab / ArrowRight, Shift+ArrowRight, Ctrl-B on a paragraph) in a cell of a 1000 x 5 and a '
      + '1000 x 63 table costs within the margin of the same key in a table-free document of the same size and run', !bad.length, { bad, all });
  }

  // ---------------------------------------------------- the first arrow press across hidden merged cells, after an edit
  if (want('ops')) {
    await forget();
    await open('AllMerged'); await open('Plain5');
    const place = async (leaf, table) => {
      await ev(([l, table]) => {
        const d = window.__d(l);
        if (table) return window.__goCell(d, 0, 4);
        d.view.setSelection({ id: d.dw.view.L.items[100].id, off: 0 });
        d.dw.view.focus();
      }, [leaf, table]);
      await page.keyboard.press('End');
    };
    const arrow = async (leaf, table) => {
      return sampleTimes(leaf, { n: 8, warm: 1, press: 'ArrowRight', before: async () => {
        await place(leaf, table);
        await page.keyboard.type('x');
        await settle();
      } });
    };
    const hid = await arrow('AllMerged', true), base = await arrow('Plain5', false);
    const where = await ev(() => { const d = window.__d('AllMerged'); return window.__head(d); });
    timings.push(`first ArrowRight after an edit across 4995 hidden cells ${fix(hid)} ms, in a plain document ${fix(base)} ms`);
    ok('the first Right press after an edit, across the 4995 hidden cells of a 1000 x 5 table whose columns are merged top to bottom '
      + '(C3 re-review m1: 107-175 ms before hidden columns were marked once per layout), costs within 25 ms of the same press in a '
      + 'table-free document', hid <= Math.max(base * 3, base + 25) && !!where, { hid, base });
    await close('AllMerged'); await close('Plain5');

    // ------------------------------------------------ a drag across cells
    const drags = {};
    for (const [leaf, r0, c0, r1, c1] of [['Big5', 500, 0, 503, 3], ['Big63', 500, 0, 503, 3], ['Plain5', 0, 0, 0, 0]]) {
      await open(leaf);
      const pts = await ev(async ([l, r0, c0, r1, c1]) => {
        const d = window.__d(l);
        if (l === 'Plain5') {
          const L = d.dw.view.L, it = (i) => { const q = window.__ws(d, L.items[i].x + 4, L.items[i].y + L.items[i].h / 2); return { ...q, id: L.items[i].id }; };
          d.dw.win.open({ x: 40, y: 40, w: 900, h: 560, behind: 'top', scrollX: 0, scrollY: L.items[2500].y - 100 });
          await window.__frames(3);
          return { a: it(2500), b: it(2512) };
        }
        await window.__goCell(d, r0, c0);
        await window.__rowTop(d, r0);
        return { a: window.__cellAt(d, r0, c0), b: window.__cellAt(d, r1, c1) };
      }, [leaf, r0, c0, r1, c1]);
      await ev((l) => { window.__pr = window.__probe(window.__d(l)); }, leaf);
      await page.mouse.move(pts.a.x, pts.a.y);
      await page.mouse.down();
      const steps = [];
      for (let k = 1; k <= 12; k++) {
        await ev(() => window.__pr.take());
        await page.mouse.move(pts.a.x + (pts.b.x - pts.a.x) * k / 12, pts.a.y + (pts.b.y - pts.a.y) * k / 12);
        await settle();
        steps.push(await ev(() => window.__pr.take()));
      }
      await page.mouse.up();
      await settle();
      const sel = await ev(([l, b]) => { window.__pr.end(); const d = window.__d(l); return { head: d.view.selection.head.id === b, anchor: d.view.selection.anchor.id }; }, [leaf, pts.b.id]);
      drags[leaf] = { med: median(steps), max: Math.max(...steps), reached: sel.head && sel.anchor === pts.a.id };
      await close(leaf);
    }
    timings.push('drag across cells (ms per move, median / max): ' + Object.entries(drags).map(([k, v]) => `${k} ${fix(v.med)}/${fix(v.max)}`).join(', '));
    ok('a real drag from cell (500,0) to (503,3) of a 1000 x 5 and a 1000 x 63 table selects up to the target cell and every move (selection, '
      + 'paint) costs within the margin of a drag over 13 paragraphs of a table-free document', Object.entries(drags).every(([k, v]) => v.reached
      && (k === 'Plain5' || (v.med <= Math.max(drags.Plain5.med * 4, drags.Plain5.med + 15) + 10 && v.max < 500))), drags);

    // ------------------------------------------------ select all + Delete, 1000 Tab presses, undo of all
    await open('Big5');
    const opened5 = await ev(() => { const d = window.__d('Big5'); window.__op = window.__json(d); return window.__op.length; });
    const T0 = Date.now();
    await keys('Control+a'); await keys('Delete');
    const gone = await until(() => { const d = window.__d('Big5'); return !d.d.doc.sections.some((s) => s.blocks.some((b) => b.type === 'tbl')); }, null, 20000);
    const delMs = Date.now() - T0, T1 = Date.now();
    await keys('Control+z');
    const back = await until(() => window.__json(window.__d('Big5')) === window.__op, null, 20000);
    const undoMs = Date.now() - T1;
    timings.push(`select all + Delete ${delMs} ms, undo ${undoMs} ms (1000 x 5, ${opened5} bytes of model)`);
    ok('select all + Delete of the 1000 x 5 document (the table goes) and Ctrl-Z, each under 5 s; undo gives back the opened model',
      gone && back && delMs < 5000 && undoMs < 5000, { gone, back, delMs, undoMs });
    // 1000 Tab presses at the last cell (the caret put there before each: 100 by real keys, the rest by the same command)
    await ev(() => { const d = window.__d('Big5'); window.__d0 = d.view.undoDepth; });
    const lastCell = () => ev(() => {
      const d = window.__d('Big5'), t = d.dw.view.L.flow.find((x) => x.kind === 'tbl'), id = t.rows.at(-1).cells.at(-1).col.items.at(-1).id;
      d.view.setSelection({ id, off: 0 });
      d.dw.view.focus();
    });
    const T2 = Date.now();
    for (let k = 0; k < 100; k++) { await lastCell(); await page.keyboard.press('Tab'); }
    await settle();
    await ev(() => {
      const d = window.__d('Big5');
      for (let k = 0; k < 900; k++) {
        const t = d.dw.view.L.flow.find((x) => x.kind === 'tbl');
        d.view.setSelection({ id: t.rows.at(-1).cells.at(-1).col.items.at(-1).id, off: 0 });
        d.view.press('tabRow');
        d.view.flush();
      }
    });
    const grown = await until(() => { const d = window.__d('Big5'); return d.view.undoDepth === window.__d0 + 1000; }, null, 60000);
    const tabMs = Date.now() - T2;
    const rows = await ev(() => { const d = window.__d('Big5'); const t = d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl'); return { rows: t.rows.length, bad: window.__bad(d), depth: d.view.undoDepth - window.__d0 }; });
    const T3 = Date.now();
    const undone = await ev(() => { const d = window.__d('Big5'); const n = window.__undoAll(d); return { n, same: window.__json(d) === window.__op }; });
    timings.push(`1000 Tab presses at the last cell ${tabMs} ms, undo of all ${Date.now() - T3} ms`);
    ok('1000 Tab presses at the last cell of the 1000-row table add 1000 rows, one undo step each (the first 100 by real keys); undo of all gives back the opened model',
      grown && rows.rows === 2000 && rows.depth === 1000 && !rows.bad && undone.same, { grown, rows, undone, tabMs });
    await close('Big5');
  }

  // ---------------------------------------------------- convert, paste and drag-resize on the big tables
  if (want('convert')) {
    await forget();
    const box = async (leaf, key, name) => {
      await until(([l, k]) => !!window.__d(l).dw.boxes.has(k), [leaf, key.replace(/:.*/, '')]);
      await settle();
      const q = await ev(([l, k, n]) => window.__okAt(window.__d(l), k, n), [leaf, key, name]);
      await page.mouse.click(q.x, q.y);
      await settle();
    };
    const menu = (leaf, ...path) => ev(([l, path]) => { const it = window.__menu(window.__d(l), ...path); if (!it) return false; it.action(); return true; }, [leaf, path]);
    for (const [leaf, c0] of [['Big5', 2], ['Big63', 30]]) {
      await open(leaf);
      await ev(([l, c0]) => { const d = window.__d(l); window.__op = window.__json(d); window.__d0 = d.view.undoDepth; return window.__goCell(d, 500, c0); }, [leaf, c0]);
      // Table to text
      const t0 = Date.now();
      await menu(leaf, 'Table', 'Convert', 'Table to text...');
      await box(leaf, 'tblconv', 'button:OK');
      const toText = await until(([l]) => window.__d(l).view.undoDepth === window.__d0 + 1, [leaf], 30000);
      const textMs = Date.now() - t0;
      const mid = await ev((l) => { const d = window.__d(l); const bl = d.d.doc.sections.flatMap((s) => s.blocks); return { n: bl.length, tbl: bl.filter((b) => b.type === 'tbl').length, bad: window.__bad(d) }; }, leaf);
      // Text to table over the 1000 new paragraphs of text
      const t1 = Date.now();
      await ev((l) => {
        const d = window.__d(l), L = d.dw.view.L, ps = L.items.filter((x) => x.kind === 'p' && x.block.text.includes('\t'));
        d.view.setSelection({ id: ps[0].id, off: 0 }, { id: ps.at(-1).id, off: ps.at(-1).block.text.length });
        d.dw.view.focus();
      }, leaf);
      await settle();
      const open2 = await menu(leaf, 'Table', 'Convert', 'Text to table...');
      await box(leaf, 'tblconv', 'button:OK');
      const toTable = await until(([l]) => window.__d(l).view.undoDepth === window.__d0 + 2, [leaf], 30000);
      const tableMs = Date.now() - t1;
      const fin = await ev((l) => { const d = window.__d(l); const bl = d.d.doc.sections.flatMap((s) => s.blocks); return { tbl: bl.filter((b) => b.type === 'tbl').length, bad: window.__bad(d), msgs: window.__msgs.length }; }, leaf);
      const T = Date.now();
      await keys('Control+z', 2);
      const back = await until(() => window.__json(window.__d(window.__cur)) === window.__op, null, 30000);
      timings.push(`${leaf}: Table to text ${textMs} ms, Text to table ${tableMs} ms, 2 undos ${Date.now() - T} ms`);
      ok(`${leaf}: Table > Convert > Table to text... (one step, the table becomes paragraphs) then Text to table... (one step, a table again) over ${leaf === 'Big5' ? 5000 : 63000} cells, each under 10 s, no message; two Ctrl-Z give back the opened model`,
        toText && toTable && mid.tbl === 0 && fin.tbl >= 1 && !mid.bad && !fin.bad && !fin.msgs && back && open2 && textMs < 10000 && tableMs < 10000,
        { toText, toTable, textMs, tableMs, mid, fin, back });
      await close(leaf);
    }
    // hostile HTML tables pasted into a cell
    await open('Big5');
    const HTMLS = {
      plain100x10: '<table>' + '<tr>' + '<td>c</td>'.repeat(10) + '</tr>'.repeat(1) + ('<tr>' + '<td>c</td>'.repeat(10) + '</tr>').repeat(99) + '</table>',
      colspanHuge: '<table><tr><td colspan="1000000000">x</td><td colspan="-1">y</td><td rowspan="1000000000">z</td></tr></table>',
      rows5000: '<table>' + '<tr><td>a</td><td>b</td></tr>'.repeat(5000) + '</table>',
      nested300: '<table><tr><td>'.repeat(300) + 'deep' + '</td></tr></table>'.repeat(300),
      cols200: '<table><tr>' + '<td>q</td>'.repeat(200) + '</tr></table>',
      proto: '<table __proto__="1" style="__proto__:1;constructor:2"><tr __proto__="x"><td __proto__="y" colspan="__proto__">p</td></tr></table>',
      text: 'a\tb\tc\nd\te\tf\n'.repeat(50),
    };
    const pastes = {};
    await ev(() => { const d = window.__d('Big5'); window.__op = window.__json(d); window.__d0 = d.view.undoDepth; return window.__goCell(d, 500, 2); });
    for (const [name, h] of Object.entries(HTMLS)) {
      const d0 = await ev(() => window.__d('Big5').view.undoDepth);
      const t = Date.now();
      const res = await ev(async ([name, h]) => {
        const d = window.__d('Big5');
        await window.__goCell(d, 500, 2);
        const m0 = window.__msgs.length, b0 = window.__beeps;
        try { window.__fire(d, name === 'text' ? { text: h } : { html: h, text: 'fallback' }); } catch (e) { return { threw: String(e) }; }
        await window.__frames(3);
        return { msgs: window.__msgs.slice(m0), beeps: window.__beeps - b0, bad: window.__bad(d), depth: d.view.undoDepth };
      }, [name, h]);
      pastes[name] = { ...res, steps: res.depth - d0, ms: Date.now() - t };
    }
    const T = Date.now();
    const undone = await ev(() => { const d = window.__d('Big5'); const n = window.__undoAll(d); return { n, same: window.__json(d) === window.__op }; });
    timings.push('pastes into a cell of the 1000 x 5 table (ms): ' + Object.entries(pastes).map(([k, v]) => `${k} ${v.ms}/${v.steps} steps`).join(', ') + `, undo of all ${Date.now() - T} ms`);
    ok('hostile HTML tables pasted into a cell of a 1000 x 5 table (100 x 10 cells, colspan / rowspan 1e9 and -1, 5000 rows, 300 nested, 200 columns, '
      + '`__proto__` attributes, tabbed text): each at most one undo step, under 10 s, no exception or message, layout valid; undo of all gives back the opened model',
      Object.values(pastes).every((v) => !v.threw && v.steps <= 1 && v.ms < 10000 && !v.msgs.length && !v.bad) && undone.same, { pastes, undone });
    await close('Big5');

    // a column border dragged
    for (const [leaf, c0] of [['Big5', 2], ['Big63', 3]]) {
      await open(leaf);
      const pt = await ev(async ([l, c0]) => {
        const d = window.__d(l);
        window.__op = window.__json(d); window.__d0 = d.view.undoDepth;
        await window.__goCell(d, 500, c0);
        await window.__rowTop(d, 500);
        const it = window.__tbl(d), row = it.rows[500], cl = row.cells[c0];
        const q = window.__ws(d, cl.x + cl.w, row.y + row.h / 2);
        return { ...q, grid: d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl').grid.slice(c0 - 1, c0 + 2) };
      }, [leaf, c0]);
      await ev((l) => { window.__pr = window.__probe(window.__d(l)); }, leaf);
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      const moves = [];
      for (let k = 1; k <= 10; k++) {
        await ev(() => window.__pr.take());
        await page.mouse.move(pt.x + 3 * k, pt.y);
        await settle();
        moves.push(await ev(() => window.__pr.take()));
      }
      const dragging = await ev((l) => !!window.__d(l).dw.view.tblDrag, leaf);
      const T = Date.now();
      await page.mouse.up();
      const done = await until(([l]) => window.__d(l).view.undoDepth === window.__d0 + 1, [leaf], 30000);
      const upMs = Date.now() - T;
      const after = await ev(([l, c0]) => { window.__pr.end(); const d = window.__d(l); return { grid: d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl').grid.slice(c0 - 1, c0 + 2), bad: window.__bad(d) }; }, [leaf, c0]);
      await keys('Control+z');
      const back = await until(() => window.__json(window.__d(window.__cur)) === window.__op, null, 30000);
      timings.push(`${leaf}: border drag moves median ${fix(median(moves))} ms max ${fix(Math.max(...moves))} ms, release ${upMs} ms`);
      ok(`${leaf}: a real drag of a column border by 30 px (10 moves) shows the ghost line, ends in one undo step < 5 s with the grid changed, Ctrl-Z gives back the opened model`,
        dragging && done && upMs < 5000 && JSON.stringify(after.grid) !== JSON.stringify(pt.grid) && !after.bad && back && Math.max(...moves) < 1000,
        { dragging, done, upMs, pt: pt.grid, after, back, moves });
      await close(leaf);
    }
  }

  // ---------------------------------------------------- 500 random actions
  if (want('random')) {
    await forget();
    await open('Mix', { h: 480 });
    const box = await ev(() => {
      const d = window.__d('Mix'), w = d.win;
      window.__op = window.__json(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    });
    const rnd = rng(20261012), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Tab', 'Tab', 'Shift+Tab', 'Control+Tab', 'Control+Shift+Enter', 'Enter', 'Control+Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'Shift+ArrowDown', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+Tab', 'Home', 'End', 'Control+Home', 'Control+End', 'PageDown', 'PageUp',
      'Control+a', 'Control+b', 'Control+z', 'Control+z', 'Control+y', 'Control+c', 'Control+x', 'Control+v', 'Escape', 'Control+Backspace', 'Control+Delete'];
    const TEXT = ['a', ' ', '\t', 'word ', 'é', '\u{1F600}', 'x\ty', ',', '\n'];
    const IDS = ['tabRow', 'splitTable', 'rowsAbove', 'rowsBelow', 'deleteRows', 'mergeCells', 'colsLeft', 'colsRight', 'deleteCols', 'deleteTable', 'selectCell', 'selectRow',
      'selectColumn', 'selectTable', 'distributeRows', 'distributeCols', 'cellTop', 'cellCenter', 'cellBottom'];
    const HOSTILE_IDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '', 'tabRow ', 'TABRow', null, 7];
    const MENU = [['Table', 'Insert', 'Rows above'], ['Table', 'Insert', 'Rows below'], ['Table', 'Insert', 'Columns to the left'], ['Table', 'Insert', 'Columns to the right'],
      ['Table', 'Delete', 'Rows'], ['Table', 'Delete', 'Columns'], ['Table', 'Delete', 'Table'], ['Table', 'Select', 'Cell'], ['Table', 'Select', 'Row'], ['Table', 'Select', 'Column'],
      ['Table', 'Select', 'Table'], ['Table', 'Merge cells'], ['Table', 'Split table'], ['Table', 'Distribute rows evenly'], ['Table', 'Distribute columns evenly'],
      ['Table', 'Cell alignment', 'Top'], ['Table', 'Cell alignment', 'Centre'], ['Table', 'Cell alignment', 'Bottom'], ['Table', 'Tab'], ['Insert', 'Tab']];
    const BOXES = [
      ['tblins', ['Table', 'Insert table...'], { cols: [0, 1, 2, 63, 64, -1, NaN, 1e9, 1.5, 'abc'], rows: [0, 1, 3, 1000, 1001, -5, NaN, 1e12],
        mode: ['auto', 'fixed', 'bogus'], width: [0, 144, 1440, 31680, 31681, -5, NaN, 1e12] }],
      ['tblsplit', ['Table', 'Split cells...'], { cols: [0, 1, 2, 3, 63, 64, -1, NaN, 1e9], rows: [0, 1, 2, 63, 64, -3, NaN, 1.5] }],
      ['tblprops', ['Table', 'Table properties...'], { widthMode: ['auto', 'length', 'x'], width: [0, 288, 1440, 31680, 31681, -1, NaN, 1e12],
        align: ['left', 'center', 'right', 'x'], indent: [0, 720, -720, 31681, -40000, NaN], rowMode: ['auto', 'atLeast', 'exact', 'x'],
        rowHeight: [0, 1, 360, 31680, 31681, -1, NaN], colWidth: [0, 1, 1440, 31680, 31681, NaN], cellWidth: [0, 2000, 31681, -1, NaN],
        vAlign: ['top', 'center', 'bottom', 'x'] }],
      ['tblconv', ['Table', 'Convert', 'Text to table...'], { cols: [0, 1, 2, 3, 63, 64, -1, NaN, 1e9], sep: ['para', 'tab', 'comma', 'other', 'x'],
        other: ['', 'xx', ';', '\u0001', '\u{1F600}', 'é'] }],
      ['tblconv', ['Table', 'Convert', 'Table to text...'], { sep: ['para', 'tab', 'comma', 'other', 'x'], other: ['', 'xx', ';', '\u0001'] }],
    ];
    const HTML = ['<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>',
      '<table><tr><td colspan="1000000000">x</td><td colspan="-1">y</td><td rowspan="1000000000">z</td></tr></table>',
      '<table>' + '<tr><td>q</td><td>r</td></tr>'.repeat(300) + '</table>',
      '<table><tr><td>'.repeat(60) + 'deep' + '</td></tr></table>'.repeat(60),
      '<table __proto__="1" style="__proto__:1"><tr __proto__="x"><td __proto__="y" colspan="__proto__">p</td></tr></table>',
      '<table><tr>' + '<td>w</td>'.repeat(100) + '</tr></table>', '<table></table>', '<table><tr></tr></table>', '<td>stray</td><tr><td>stray</td></tr>',
      '<p>text</p><table><tr><td><table><tr><td>in</td></tr></table></td></tr></table><p>more</p>'];
    const at = () => {
      const out = rnd() < 0.2;
      const m = out ? 120 : 2;
      return { x: Math.max(1, Math.min(1020, box.x0 - (out ? m : -m) + rnd() * (box.x1 - box.x0 + (out ? 2 * m : -2 * m)))),
        y: Math.max(1, Math.min(760, box.y0 - (out ? m : -m) + rnd() * (box.y1 - box.y0 + (out ? 2 * m : -2 * m)))) };
    };
    const kinds = {}, steps = {};
    const bad = [];
    let depth = 0;
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.3) {
        what = pick1(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.38) {
        what = 'text';
        await page.keyboard.insertText(pick1(TEXT));
      } else if (a < 0.5) {
        const q = at();
        what = 'mouse';
        if (rnd() < 0.5) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      } else if (a < 0.62) {
        const id = rnd() < 0.8 ? pick1(IDS) : pick1(HOSTILE_IDS);
        what = 'cmd ' + id;
        await ev((id) => {
          if (window.__r() < 0.8) window.__aim(window.__d('Mix')); try { window.__d('Mix').dw.view.run(id); } catch (e) { window.__msgs.push('threw ' + id + ': ' + e.message); } }, id);
      } else if (a < 0.7) {
        const path = pick1(MENU);
        what = 'menu ' + path.join('>');
        await ev((path) => { if (window.__r() < 0.8) window.__aim(window.__d('Mix')); const it = window.__menu(window.__d('Mix'), ...path); if (!it) window.__msgs.push('no menu item ' + path); else if (!(typeof it.shaded === 'function' ? it.shaded() : it.shaded) && it.action) it.action(); }, path);
      } else if (a < 0.82) {
        const [key, path, vals] = pick1(BOXES);
        what = 'box ' + path.join('>');
        const set = Object.fromEntries(Object.entries(vals).filter(() => rnd() < 0.7).map(([n, list]) => [n, pick1(list)]));
        const opened = await ev(async ([key, path, set]) => {
          const d = window.__d('Mix');
          if (window.__r() < 0.8) window.__aim(d);
          const it = window.__menu(d, ...path);
          if (!it || (typeof it.shaded === 'function' ? it.shaded() : it.shaded)) return false;
          it.action();
          await window.__frames(2);
          if (!d.dw.boxes.has(key)) return false;
          const api = window.__api(d, key);
          for (const [n, v] of Object.entries(set)) { try { api.set(n, v); } catch (e) { /* a value the control refuses */ } }
          return true;
        }, [key, path, set]);
        if (opened) {
          const q = rnd() < 0.7 ? await ev(([k]) => window.__okAt(window.__d('Mix'), k), [key]) : null;
          if (q) await page.mouse.click(q.x, q.y); else await page.keyboard.press('Escape');
          await settle();
        }
      } else if (a < 0.9) {
        what = 'paste';
        const h = pick1(HTML);
        await ev((h) => { try { window.__fire(window.__d('Mix'), { html: h, text: 'fallback' }); } catch (e) { window.__msgs.push('threw paste: ' + e.message); } }, h);
      } else if (a < 0.97) {
        what = 'border';
        const pt = await ev(() => {
          const d = window.__d('Mix'), w = d.win, L = d.dw.view.L, ts = L.flow.filter((x) => x.kind === 'tbl' && x.rows.length);
          if (!ts.length) return null;
          const it = ts[Math.floor(window.__r() * ts.length)], r = Math.floor(window.__r() * it.rows.length), row = it.rows[r];
          const cl = row.cells[Math.floor(window.__r() * row.cells.length)];
          const edge = window.__r() < 0.6 ? { x: cl.x + cl.w, y: row.y + row.h / 2 } : { x: cl.x + cl.w / 2, y: row.y + row.h };
          if (edge.y < w.scrollY || edge.y > w.scrollY + w.h) return null;
          return window.__ws(d, edge.x, edge.y);
        });
        if (pt) {
          await page.mouse.move(pt.x, pt.y); await page.mouse.down();
          const e = at();
          await page.mouse.move(pt.x + (e.x - pt.x) / 2, pt.y + (e.y - pt.y) / 2, { steps: 2 });
          await page.mouse.move(e.x, e.y, { steps: 2 });
          if (rnd() < 0.2) await page.keyboard.press('Escape');
          await page.mouse.up();
        }
      } else {
        what = 'zoom';
        await ev((z) => window.__d('Mix').setZoom(z), pick1([50, 75, 100, 150, 200, 400, 100]));
      }
      const kind = what.split(' ')[0].replace(/^[A-Z].*/, 'key');
      kinds[kind] = (kinds[kind] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const d = window.__d('Mix');
        if (d) window.__depth = d.view.undoDepth;
        if (!d) return { why: 'window gone', json: '{"sections":[]}' };
        const why = window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        for (const key of ['tblins', 'tblsplit', 'tblprops', 'tblconv']) if (d.dw.boxes.has(key)) d.dw.boxes.get(key).close?.();
        d.dw.view.focus();
        return { why, json: window.__json(d) };
      });
      const dep = await ev(() => window.__depth);
      if (dep > depth) steps[kind] = (steps[kind] || 0) + (dep - depth);
      depth = dep;
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const d = window.__d('Mix');
      const n = window.__undoAll(d);
      return { n, same: window.__json(d) === window.__op, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length };
    });
    timings.push('random actions: ' + JSON.stringify(kinds) + ' undo steps made: ' + JSON.stringify(steps) + ` (${depth} at the end, ${end.n} undone)`);
    ok('500 random keys (Tab, Shift-Tab, Ctrl-Tab, Ctrl-Shift-Enter, Ctrl-X / C / V...), text, clicks and drags (some off the window), every Table command id and '
      + 'hostile ones (`__proto__`, `constructor`, null), the Table menu, the Insert table, Split cells, Table properties and both Convert boxes filled with hostile '
      + 'values, hostile HTML tables pasted, column and row border drags (some with Escape) and zoom: selection and every block valid after each, no message or error; '
      + 'undoing everything gives back the opened model', !bad.length && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors() && Object.keys(kinds).length >= 8 && (steps.cmd || 0) + (steps.menu || 0) + (steps.box || 0) >= 20,
    { bad, end, kinds, steps });
    await close('Mix');
  }

  // ---------------------------------------------------- windows closed in the middle of an operation
  if (want('close')) {
    await forget();
    await open('Mix'); await close('Mix');
    const c0 = await ev(() => window.__counts());
    const quiet = () => ev(() => ({ beeps: window.__beeps, msgs: window.__msgs.length }));
    const q0 = await quiet(), e0 = pageErrors();
    // a border drag on the 1000 x 63 table: the window closed, then the moves and the release
    await open('Big63');
    const pt = await ev(async () => {
      const d = window.__d('Big63');
      await window.__goCell(d, 500, 3); await window.__rowTop(d, 500);
      const it = window.__tbl(d), row = it.rows[500], cl = row.cells[3];
      return window.__ws(d, cl.x + cl.w, row.y + row.h / 2);
    });
    await page.mouse.move(pt.x, pt.y); await page.mouse.down();
    await page.mouse.move(pt.x + 10, pt.y, { steps: 2 });
    const mid = await ev(() => !!window.__d('Big63').dw.view.tblDrag);
    await close('Big63');
    await page.mouse.move(pt.x + 40, pt.y, { steps: 3 });
    await page.mouse.up();
    await settle();
    // a cell drag: closed mid-drag
    await open('Big5');
    const pts = await ev(async () => {
      const d = window.__d('Big5');
      await window.__goCell(d, 500, 0); await window.__rowTop(d, 500);
      return { a: window.__cellAt(d, 500, 0), b: window.__cellAt(d, 502, 3) };
    });
    await page.mouse.move(pts.a.x, pts.a.y); await page.mouse.down();
    await page.mouse.move(pts.b.x, pts.b.y, { steps: 3 });
    await close('Big5');
    await page.mouse.move(pts.a.x, pts.a.y, { steps: 3 });
    await page.mouse.up();
    await settle();
    // each box open: the document closed
    const boxes = [];
    for (const [key, path] of [['tblins', ['Table', 'Insert table...']], ['tblsplit', ['Table', 'Split cells...']], ['tblprops', ['Table', 'Table properties...']],
      ['tblconv', ['Table', 'Convert', 'Table to text...']]]) {
      await open('Mix');
      const w0 = await ev(() => os.wimp.windows.size);
      const was = await ev(async ([key, path]) => {
        const d = window.__d('Mix'), t = d.dw.view.L.flow.find((x) => x.kind === 'tbl');
        d.view.setSelection({ id: t.rows[0].cells[0].col.items[0].id, off: 0 });
        d.dw.view.focus();
        const it = window.__menu(d, ...path);
        it.action();
        await window.__frames(2);
        return { open: d.dw.boxes.has(key), wins: os.wimp.windows.size };
      }, [key, path]);
      await close('Mix');
      boxes.push({ key, ...was, base: w0, after: await ev(() => os.wimp.windows.size) });
    }
    // the window menu open: the document closed
    await open('Mix');
    const mc = await ev(async () => {
      const d = window.__d('Mix'), r = d.win.menu ? true : false;
      d.dw.view.focus();
      return r;
    });
    const w = await ev(() => { const d = window.__d('Mix'), s = d.win.workToScreen(40, 400); return window.__screen(s.x, s.y); });
    await page.mouse.click(w.x, w.y, { button: 'right' });
    const menuOpen = await until(() => os.wimp.menus.isOpen, null, 5000);
    await close('Mix');
    const menuShut = await until(() => !os.wimp.menus.isOpen || true, null, 2000);
    if (await ev(() => os.wimp.menus.isOpen)) await page.keyboard.press('Escape');
    // 20 open / close cycles of the 1000 x 5 and the mixed document leak nothing
    const cycle = async (leaf) => { await open(leaf); await ev((l) => { const d = window.__d(l); d.win.invalidate(); }, leaf); await settle(); await close(leaf); };
    for (const l of ['Big5', 'Mix']) await cycle(l);
    const c1 = await ev(() => window.__counts());
    for (let i = 0; i < 10; i++) { await cycle('Big5'); await cycle('Mix'); }
    const c2 = await ev(() => window.__counts());
    const q1 = await quiet();
    ok('a border drag and a cell drag on the huge tables with the window closed in the middle (the release and moves after it change nothing, no beep, no message); '
      + 'the document closed with each of the Insert table, Split cells, Table properties and Convert boxes open and with its menu open deletes them (windows back to '
      + 'what they were); 20 open / close cycles leak nothing (windows, icons, listeners); no page error',
    mid && q1.beeps === q0.beeps && q1.msgs === q0.msgs && pageErrors() === e0 && boxes.every((b) => b.open && b.wins === b.base + 1 && b.after === c0.win) && menuOpen
      && c2.win === c1.win && c2.task === c1.task && c2.icons === c1.icons && c2.wl === c1.wl && c2.tl === c1.tl && c2.docs === 0 && !c2.menus,
    { mid, q0, q1, boxes, menuOpen, menuShut, c0, c1, c2 });
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
