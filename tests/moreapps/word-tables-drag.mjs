// !Letters' table edge drags on merged, nested and styled tables (the C5 review's fixes; real mouse drags). A 3 x 3
// Table Grid table whose first row has a cell over two columns and whose first column is merged down rows 2 and 3:
// a real drag of the border between the wide cell and the next by 30 px is one undo step (grid 3000 / 3450 / 2550,
// the wide cell's tcW the sum of its columns, the cells under the dragged columns too). The border between rows 2
// and 3 is not dragged inside the merged cell (no line is drawn there: a press there selects text, no step), and is
// dragged beside it (one step, trHeight on row 2). A table nested in a cell: a drag of its own column border changes
// its grid, not the outer one's, in one step. A table 100% wide by its style (no tblW of its own): the right edge
// dragged 60 px left is one step, the table gets tblW dxa and is drawn narrower (the drag shows). A row of Exactly
// 0.42 in dragged 200 px up stops at 0.01 in (15 twips, exact kept: a 0 height would lose the rule). A window closed
// in the middle of a drag: the release does not beep and puts nothing in.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { tbl, tr, tc, tblDocx, TABLE_NORMAL, TABLE_GRID } from './tbl-fixtures.mjs';

const LOOK = '<w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" '
  + 'w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const W = (w) => `<w:tcW w:w="${w}" w:type="dxa"/>`;
const cell = (t, pr = W(3000)) => tc(p(r(t)), { tcPr: pr });
const STYLES = TABLE_NORMAL + TABLE_GRID;
const WIDE = '<w:style w:type="table" w:styleId="Wide"><w:name w:val="Wide"/><w:basedOn w:val="TableGrid"/><w:tblPr>'
  + '<w:tblW w:w="5000" w:type="pct"/></w:tblPr></w:style>';
const MERGED = tbl([
  tr([cell('m00', W(6000) + '<w:gridSpan w:val="2"/>'), cell('m02')]),
  tr([cell('m10', W(3000) + '<w:vMerge w:val="restart"/>'), cell('m11'), cell('m12')]),
  tr([cell('', W(3000) + '<w:vMerge/>'), cell('m21'), cell('m22')]),
  tr([cell('m30'), cell('m31'), cell('m32')]),
], { tblPr: LOOK, grid: [3000, 3000, 3000] });
const INNER = tbl([tr([cell('n0', W(1300)), cell('n1', W(1300))])], { tblPr: LOOK, grid: [1300, 1300] });
const NESTED = tbl([tr([tc(p(r('a1')) + INNER + p(r('a2')), { tcPr: W(3000) }), cell('b')]),
  tr([cell('c'), cell('d')])], { tblPr: LOOK, grid: [3000, 3000] });
const STYLED = tbl([tr([cell('s0', W(2000)), cell('s1', W(2000)), cell('s2', W(2000))])],
  { tblPr: '<w:tblStyle w:val="Wide"/>', grid: [2000, 2000, 2000] });
const EXACT = tbl([tr([cell('x00'), cell('x01')], { trPr: '<w:trHeight w:val="600" w:hRule="exact"/>' }),
  tr([cell('x10'), cell('x11')])], { tblPr: LOOK, grid: [3000, 3000] });
const doc = (t, styles = STYLES) => tblDocx(p(r('Before')) + t + p(r('After')), { styles });
const files = {
  Dm: Array.from(await doc(MERGED)), Dn: Array.from(await doc(NESTED)), Ds: Array.from(await doc(STYLED, STYLES + WIDE)),
  Dx: Array.from(await doc(EXACT)), Dc: Array.from(await doc(EXACT)),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 1200)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, e = 1) => Math.abs(a - b) <= e;

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const until = (src, arg) => page.waitForFunction(src, arg, { timeout: 8000 }).then(() => true, () => false);

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev((files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__beeps = 0;
    const b = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return b(); };
    window.__sel = (leaf, a, ao) => {
      const v = window.__doc(leaf).view, f = (t) => v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t).id;
      v.setSelection({ id: f(a), off: ao });
    };
    /** The table item (n: 0 the outer one, 1 the first nested one) and its model table's state. */
    window.__ts = (leaf, n = 0) => {
      const d = window.__doc(leaf), v = d.dw.view;
      const its = v.L.flow.filter((x) => x.kind === 'tbl'), it = its[n], t = it.block;
      return { depth: d.view.undoDepth, beeps: window.__beeps, grid: t.grid.slice(), dragging: !!v.tblDrag,
        tcW: t.rows.map((row) => row.cells.map((c) => (c.tcPr.tcW ? c.tcPr.tcW.w : null))),
        trH: t.rows.map((row) => (row.trPr && row.trPr.trHeight ? { ...row.trPr.trHeight } : null)),
        tblW: t.tblPr.tblW ? { ...t.tblPr.tblW } : null, x: it.x + it.left, cols: it.key.cols.slice(),
        rows: it.rows.map((row) => ({ y: row.y, h: row.h })), outerGrid: its[0].block.grid.slice() };
    };
  }, files);
  await ev(() => os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters'));
  await page.waitForFunction(() => !!window.__word()?.word, null, { timeout: 20000 });
  for (const leaf of Object.keys(files)) {
    await ev((leaf) => os.filer.run('RAM::RamDisc0.$.' + leaf), leaf);
    await page.waitForFunction((leaf) => !!window.__doc(leaf)?.view.layout, leaf, { timeout: 20000 });
  }
  const show = (leaf, first) => ev(async ([leaf, first]) => {
    const d = window.__doc(leaf);
    d.win.open({ x: 40, y: 40, w: 900, h: 640, behind: 'top', scrollX: 0, scrollY: 0 });
    window.__sel(leaf, first, 0);
    d.dw.view.focus();
    await window.__frames(3);
    return window.__msgs;
  }, [leaf, first]);
  const ts = (leaf, n = 0) => ev(([l, n]) => window.__ts(l, n), [leaf, n]);
  /** The client point of layout point (lx, ly) of a document's window. */
  const at = (leaf, lx, ly) => ev(([leaf, lx, ly]) => {
    const d = window.__doc(leaf), v = d.dw.view, z = v.zoom, t = v.L.top, s = d.win.workToScreen(lx * z, t + (ly - t) * z);
    return window.__screen(s.x, s.y);
  }, [leaf, lx, ly]);
  const apart = () => page.waitForFunction(() => !os.wimp._lastClick
    || performance.now() - os.wimp._lastClick.t > os.input.config.doubleClickMs + 20, null, { timeout: 5000 });
  /** A real drag from client point a by (dx, dy) client px; mid() before the release. */
  const drag = async (a, dx, dy, { mid } = {}) => {
    await apart();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 3 });
    await page.mouse.move(a.x + dx, a.y + dy, { steps: 3 });
    await settle();
    const m = mid ? await mid() : null;
    await page.mouse.up();
    await settle();
    return m;
  };
  const sum = (a, n) => a.slice(0, n).reduce((s, w) => s + w, 0);

  ok('the documents open, no message', !(await show('Dm', 'm11')).length, await ev(() => window.__msgs));

  // ---------------------------------------------------- a cell over two columns
  const m0 = await ts('Dm');
  const lx = m0.x + sum(m0.cols, 2), ly0 = m0.rows[0].y + m0.rows[0].h / 2;
  const a = await at('Dm', lx + 1, ly0), b = await at('Dm', lx + 31, ly0);
  await drag(a, b.x - a.x, 0);
  await until((n) => window.__doc('Dm').view.undoDepth === n, m0.depth + 1);
  const m1 = await ts('Dm');
  ok('the border after a cell over two columns dragged 30 px: one undo step, grid 3000 / 3450 / 2550, the wide cell\'s '
    + 'tcW the sum of its columns, the cells under the dragged columns too', m1.depth === m0.depth + 1
    && same(m1.grid, [3000, 3450, 2550]) && same(m1.tcW[0], [6450, 2550]) && same(m1.tcW[3], [3000, 3450, 2550]), m1);
  await page.keyboard.press('Control+z');
  await until((n) => window.__doc('Dm').view.undoDepth === n, m0.depth);

  // ---------------------------------------------------- the border under a vertical merge
  const r1 = m0.rows[1], yb = r1.y + r1.h;
  const inMerge = await at('Dm', m0.x + 40, yb), beside = await at('Dm', m0.x + sum(m0.cols, 1) + 60, yb);
  const below = await at('Dm', m0.x + 40, yb + 20);
  await drag(inMerge, 0, below.y - inMerge.y);
  const m2 = await ts('Dm');
  ok('a press on the row border inside a vertically merged cell (no line drawn there) does not drag the row: no step, '
    + 'no trHeight', m2.depth === m0.depth && m2.trH.every((x) => x === null) && !m2.dragging, m2);
  await drag(beside, 0, below.y - inMerge.y);
  await until((n) => window.__doc('Dm').view.undoDepth === n, m0.depth + 1);
  const m3 = await ts('Dm');
  ok('... beside the merge the same border drags: one step, trHeight on row 2 only', m3.depth === m0.depth + 1
    && m3.trH[1] && m3.trH[1].hRule === 'atLeast' && m3.trH[0] === null && m3.trH[2] === null, m3);

  // ---------------------------------------------------- a nested table
  await show('Dn', 'a1');
  const n0 = await ts('Dn', 1);
  const nx = n0.x + sum(n0.cols, 1), ny = n0.rows[0].y + n0.rows[0].h / 2;
  const na = await at('Dn', nx + 1, ny), nb = await at('Dn', nx + 21, ny);
  await drag(na, nb.x - na.x, 0);
  await until((n) => window.__doc('Dn').view.undoDepth === n, n0.depth + 1);
  const n1 = await ts('Dn', 1);
  ok('a nested table\'s column border dragged 20 px: one step, its grid 1600 / 1000, the outer table\'s grid unchanged',
    n1.depth === n0.depth + 1 && same(n1.grid, [1600, 1000]) && same(n1.outerGrid, [3000, 3000]), n1);

  // ---------------------------------------------------- a width from the style
  await show('Ds', 's0');
  const s0 = await ts('Ds'), sw0 = sum(s0.cols, 3);
  const sx = s0.x + sw0, sy = s0.rows[0].y + s0.rows[0].h / 2;
  const sa = await at('Ds', sx - 1, sy), sb = await at('Ds', sx - 61, sy);
  await drag(sa, sb.x - sa.x, 0);
  await until((n) => window.__doc('Ds').view.undoDepth === n, s0.depth + 1);
  const s1 = await ts('Ds');
  ok('a table 100% wide by its style (no tblW of its own): the right edge 60 px left is one step, the table gets tblW '
    + 'dxa of its new total and is drawn 60 px narrower', s0.tblW === null && s1.depth === s0.depth + 1 && s1.tblW
    && s1.tblW.type === 'dxa' && near(s1.tblW.w, Math.round((sw0 - 60) * 15), 20) && near(sum(s1.cols, 3), sw0 - 60, 1.5),
  { s0, s1 });

  // ---------------------------------------------------- the least row height
  await show('Dx', 'x10');
  const x0 = await ts('Dx'), xr = x0.rows[0], xa = await at('Dx', x0.x + 40, xr.y + xr.h);
  const xb = await at('Dx', x0.x + 40, xr.y + xr.h - 200);
  await drag(xa, 0, xb.y - xa.y);
  await until((n) => window.__doc('Dx').view.undoDepth === n, x0.depth + 1);
  const x1 = await ts('Dx');
  ok('an exact row dragged 200 px up stops at the least height: one step, trHeight exact 15 (0.01 in), drawn 1 px high',
    x1.depth === x0.depth + 1 && same(x1.trH[0], { val: 15, hRule: 'exact' }) && near(x1.rows[0].h, 1, 0.01), x1);

  // ---------------------------------------------------- the window closed mid-drag
  await show('Dc', 'x10');
  const c0 = await ts('Dc'), cr = c0.rows[0], ca = await at('Dc', c0.x + 40, cr.y + cr.h);
  const m = await drag(ca, 0, 30, { mid: () => ev(async () => {
    const st = { dragging: !!window.__doc('Dc').dw.view.tblDrag, beeps: window.__beeps };
    window.__doc('Dc').dw.close();
    await window.__frames(2);
    return st;
  }) });
  const c1 = await ev(() => ({ beeps: window.__beeps, open: !!window.__doc('Dc'), msgs: window.__msgs.length }));
  ok('the window closed in the middle of a row drag: the release does not beep, nothing reported', m.dragging
    && c1.beeps === m.beeps && !c1.open && !c1.msgs, { m, c1 });

  ok('no console errors', !logs.some((l) => /PAGEERROR|error/i.test(l) && !/favicon/.test(l)), logs.slice(-5));
} catch (e) {
  out.push('FAIL exception ' + (e && e.stack || e));
}
console.log(out.join('\n'));
await browser.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
