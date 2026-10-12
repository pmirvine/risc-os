// !Letters: editing in tables in the real desktop (Batch C3). C3.1 part: the caret goes into cells. A real click in
// each cell of a 2x2 Table Grid table puts the caret in that cell's paragraph, and the Wimp's caret (what is drawn)
// is inside the cell's box; real ArrowRight presses from the end of the paragraph before the table go straight to
// the first cell's start and visit every cell in order (one, two, three, four), then the paragraph after (the
// table's edges are not stops: a paragraph is beside them); ArrowLeft goes back the same way; at 50% and 200%
// zoom a click in each cell lands in that cell; a table first in the document: Left from its first cell reaches
// the table's edge and Enter there puts an empty paragraph before it (one undo step, Ctrl-Z takes it away).
// C3.2 part: selection shapes painted. A real Shift-drag from cell (0,0) to cell (1,1) of a 3x3 Table Grid table
// selects a rectangle of cells: the four cells' boxes are lit in the selection colour (pixels at their right ends,
// away from the text) and cells (0,2), (2,0) and (2,2) stay white.
// C3.3 part: moving and selecting in tables (3x3 grid). Real Tab presses go through the cells selecting each cell's
// content (nothing in the last cell), Shift-Tab back (nothing at the first); ArrowDown / ArrowUp move by the cells'
// geometry and out to the paragraphs; Shift-Right across a cell's boundary lights two cells' boxes; a plain drag
// from (0,0) to (2,1) lights six; a click in the first 4 px of a cell selects its content, left of a row the row,
// just above a column the column; Ctrl-Tab in a cell types a tab (one undo step; R21: a desktop that takes Ctrl-Tab
// first would fail this check); Ctrl-A selects the document.
// C3.4 part: typing and deleting (3x3 grid between "Before" and "After"; D10, TB10, TB11; real keys). Backspace at
// the start of "After" moves the caret to the end of the last cell (nothing deleted); Delete at the end of "Before"
// does nothing; Backspace at a cell's start and Delete at its end do nothing; Delete over cells (0,0)..(1,1) clears
// them (one undo step) and Ctrl-Z gives them back with the caret in the first changed row's first cell (R18);
// Backspace over row 1 removes it, Ctrl-Z restores it; typing over two cells clears them and puts the text in the
// top-left one; Ctrl-Enter in a cell beeps and changes nothing; typing in a cell and Ctrl-Z put the caret back in
// the cell. D20: 200 characters typed in cell (500, 2) of a 1000 x 5 table cost (median of the edit, its layout
// and the next paint) within +5 ms of 200 typed in a plain paragraph of the same document.
// C3.5 part: formatting, Find and links in cells (3x3 grid). Ctrl-B with cells (0,0)..(1,1) selected makes exactly
// those four cells' text bold: drawn with more ink (pixels), the other cells' exactly as before, one undo step; the Find box
// finds "find me" in cell (1,1) from the start of the document, selects it and paints the selection inside the cell;
// a real Ctrl-click on a link in cell (2,0) follows it to its bookmark in "After".
// C3 fix wave part: a vertical merge's hidden part (a 2x3 grid, column 0 merged down: its continue cell holds
// "hidden"). Real ArrowRight from the end of "b" (row 0's last cell) goes to "c" (row 1's middle cell), passing the
// continue cell; a letter typed there goes into "c"; Home and ArrowLeft go back to the end of "b"; "hidden" is
// unchanged.
// A PNG file icon dropped on cell (0,0) of a 2x2 (each 3000 twips wide) goes in there sized to the cell's text width
// (the cell less its margins), not the page's column (one undo step); selected, its SE handle dragged up and left by
// a real mouse makes it smaller in proportion (one undo step), the picture staying in the cell.
// C4.1 part: rows (a 3x3 grid between "Before" and "After"). A real Tab in the last cell adds a row below the last
// (one undo step) with the caret in its first cell; Ctrl-Z removes it, the caret back in the last cell; Shift-Tab in
// the first cell adds nothing. Ctrl-Shift-Enter in row 1 splits the table: an empty paragraph between two tables
// (one undo step), the caret in it, and the pixels show two separate grids (the column border dark in both tables,
// white in the paragraph between); Ctrl-Z gives the one table back.
// C4.3 part: merge and split cells (a 3x3 grid between "Before" and "After"). Cells (0,0)..(1,1) selected, the
// mergeCells command (the Table menu's Merge cells, C4.4) makes one cell: their four texts in it in flow order, one undo
// step, the caret at its start; the pixels show no line inside it (the old column and row lines white there) and
// the column line beside it still dark; Ctrl-Z gives the nine cells back. The Split cells box (opened by the test
// hook until C4.4's menu) with the caret in the middle cell: Columns 3 and Rows 2 typed with real keys and OK
// clicked split it (one undo step, 5 grid columns, 4 rows, the caret in the first new cell, the box gone, new
// column lines drawn dark in the cell's place); Columns 70 beeps and says so, the box kept; Columns 62 (past the
// grid cap) beeps and says why, the box kept, nothing changed; Escape closes it, nothing changed.
// (C4 and later extend this suite.) Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { tbl, tr, tc, tblDocx, bigTable, TABLE_NORMAL, TABLE_GRID } from './tbl-fixtures.mjs';
import { pngBytes } from './pic-fixtures.mjs';

const LOOK = '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" '
  + 'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const cell = (t) => tc(p(r(t)), { tcPr: '<w:tcW w:w="3000" w:type="dxa"/>' });
const GRID = tbl([tr([cell('one'), cell('two')]), tr([cell('three'), cell('four')])],
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000] });
const STYLES = { styles: TABLE_NORMAL + TABLE_GRID };
const GRID3 = tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => cell(`c${i}${j}`)))),
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000, 3000] });
const BMK = '<w:bookmarkStart w:id="7" w:name="Target"/>' + r('After') + '<w:bookmarkEnd w:id="7"/>';
const LINKED = tc(p('<w:hyperlink w:anchor="Target">' + r('go there') + '</w:hyperlink>'),
  { tcPr: '<w:tcW w:w="3000" w:type="dxa"/>' });
const GRIDF = tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => (i === 2 && j === 0 ? LINKED
  : cell(i === 1 && j === 1 ? 'find me' : `c${i}${j}`))))),
{ tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000, 3000] });
const files = {
  Te: Array.from(await tblDocx(p(r('Before')) + GRID + p(r('After')), STYLES)),
  Tf: Array.from(await tblDocx(GRID + p(r('After')), STYLES)),
  Ts: Array.from(await tblDocx(p(r('Before')) + GRID3 + p(r('After')), STYLES)),
  Td: Array.from(await tblDocx(p(r('Before')) + GRID3 + p(r('After')), STYLES)),
  Tc: Array.from(await tblDocx(p(r('Before')) + GRIDF + p(BMK), STYLES)),
  Tm: Array.from(await tblDocx(p(r('Before')) + tbl([
    tr([tc(p(r('top')), { tcPr: '<w:vMerge w:val="restart"/>' }), cell('a'), cell('b')]),
    tr([tc(p(r('hidden')), { tcPr: '<w:vMerge/>' }), cell('c'), cell('d')])],
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000, 3000] }) + p(r('After')), STYLES)),
  Tp: Array.from(await tblDocx(p(r('Before')) + GRID + p(r('After')), STYLES)),
  Tr: Array.from(await tblDocx(p(r('Before')) + GRID3 + p(r('After')), STYLES)),
  Tg: Array.from(await tblDocx(p(r('Before')) + GRID3 + p(r('After')), STYLES)),
  Pic: Array.from(pngBytes(400, 100)),
  Tk: Array.from(await tblDocx(Array.from({ length: 200 }, (_, i) => p(r(`plain ${i} with a few words`))).join('')
    + bigTable(1000, 5) + Array.from({ length: 200 }, (_, i) => p(r(`after ${i}`))).join(''), STYLES)),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
/** A real key press, then the frames it paints in. */
const press = async (k) => { await page.keyboard.press(k); await settle(); };
/** The head as 'text:off' (a paragraph) or 'tbl:off'. */
const head = (leaf) => ev((leaf) => window.__head(leaf), leaf);

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev((files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf = 'Te') => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__client = (win, x, y) => { const s = win.workToScreen(x, y); return window.__screen(s.x, s.y); };
    /** Layout -> the window's work area at the document's zoom. */
    window.__ws = (x, y, leaf = 'Te') => {
      const d = window.__doc(leaf), z = d.zoom / 100, t = d.view.layout.top;
      return { x: x * z, y: t + (y - t) * z };
    };
    window.__head = (leaf = 'Te') => {
      const v = window.__doc(leaf).view, h = v.selection.head, it = v.layout.byId.get(h.id);
      return `${it.kind === 'p' ? it.block.text : it.kind}:${h.off}`;
    };
    /** Cell (r, c) of the first table: its box (layout), the client point of its middle, its paragraph's id. */
    window.__cell = (r, c, leaf = 'Te') => {
      const d = window.__doc(leaf), L = d.view.layout, it = L.items.find((x) => x.kind === 'tbl');
      const row = it.rows[r], cl = row.cells[c], m = window.__ws(cl.x + cl.w / 2, row.y + row.h / 2, leaf);
      return { box: { x: cl.x, y: row.y, w: cl.w, h: row.h }, at: window.__client(d.win, m.x, m.y),
        id: cl.col.items[0].id };
    };
    /** The canvas pixel [r, g, b] at layout (x, y) of leaf's window (zoom 100%). */
    window.__px = (x, y, leaf = 'Te') => {
      const d = window.__doc(leaf), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const a = cv.getContext('2d').getImageData(Math.floor((x - win.scrollX) * k), Math.floor((y - win.scrollY) * k),
        1, 1).data;
      return [a[0], a[1], a[2]];
    };
    /** The Wimp's caret (zoomed work area) inside the zoomed box b. */
    window.__caretIn = (b, leaf = 'Te') => {
      const a = os.wimp.caret?.pos, p0 = window.__ws(b.x, b.y, leaf), p1 = window.__ws(b.x + b.w, b.y + b.h, leaf);
      return !!a && a.x >= p0.x && a.x <= p1.x && a.y >= p0.y && a.y + a.h <= p1.y + 0.01;
    };
  }, files);
  await ev(() => os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters'));
  await page.waitForFunction(() => !!window.__word()?.word, null, { timeout: 20000 });
  for (const leaf of ['Te', 'Tf', 'Ts', 'Td', 'Tk', 'Tc', 'Tm', 'Tp', 'Tr', 'Tg']) {
    await ev((leaf) => os.filer.run('RAM::RamDisc0.$.' + leaf), leaf);
    await page.waitForFunction((leaf) => !!window.__doc(leaf)?.view.layout, leaf, { timeout: 20000 });
  }
  /** Show leaf's window on top at the zoom z (%). */
  const show = (leaf, z) => ev(async ([leaf, z]) => {
    const d = window.__doc(leaf);
    if (d.zoom !== z) d.setZoom(z);
    await window.__frames(2);
    // (the zoom scrolls to the caret: back to the top left)
    d.win.open({ x: 40, y: 40, w: 900, h: 640, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    await window.__frames(3);
    return { zoom: d.zoom, msgs: window.__msgs };
  }, [leaf, z]);
  const s0 = await show('Te', 100);
  ok('the documents open, no message', s0.zoom === 100 && !s0.msgs.length, s0);

  // ---------------------------------------------------- a click in a cell
  /** A real click in the middle of cell (r, c); -> {head, caret in the cell}. */
  const click = async (r, c, leaf = 'Te') => {
    const cl = await ev(([r, c, leaf]) => window.__cell(r, c, leaf), [r, c, leaf]);
    await page.mouse.click(cl.at.x, cl.at.y);
    await page.waitForFunction(([id, leaf]) => window.__doc(leaf).view.selection.head.id === id, [cl.id, leaf],
      { timeout: 5000 }).catch(() => {});
    await settle();
    return ev(([b, leaf]) => ({ head: window.__head(leaf), inside: window.__caretIn(b, leaf) }), [cl.box, leaf]);
  };
  const clicks = [];
  for (const [r, c] of [[1, 1], [0, 0], [0, 1], [1, 0]]) clicks.push(await click(r, c));
  ok('a real click in each cell puts the caret in that cell\'s paragraph; the Wimp\'s caret is inside the cell',
    same(clicks.map((x) => x.head.split(':')[0]), ['four', 'one', 'two', 'three']) && clicks.every((x) => x.inside),
    clicks);

  // ---------------------------------------------------- Right / Left through the cells
  await ev(() => {
    const d = window.__doc(), L = d.view.layout;
    d.view.setSelection({ id: L.items[0].id, off: 6 });
  });
  const right = [];
  for (let k = 0; k < 20; k++) { await press('ArrowRight'); right.push(await head()); }
  const want = ['one:0', 'one:1', 'one:2', 'one:3', 'two:0', 'two:1', 'two:2', 'two:3', 'three:0', 'three:1',
    'three:2', 'three:3', 'three:4', 'three:5', 'four:0', 'four:1', 'four:2', 'four:3', 'four:4', 'After:0'];
  ok('ArrowRight from the end of "Before": straight to the first cell, every cell in order, then "After"',
    same(right, want), right);
  const left = [];
  for (let k = 0; k < 20; k++) { await press('ArrowLeft'); left.push(await head()); }
  ok('ArrowLeft back the same way to the end of "Before"', same(left, [...want.slice(0, -1).reverse(), 'Before:6']),
    left);

  // ---------------------------------------------------- zoom: clicks land in the right cell
  for (const z of [50, 200]) {
    await show('Te', z);
    const got = [];
    for (const [r, c] of [[0, 0], [0, 1], [1, 0], [1, 1]]) got.push(await click(r, c));
    ok(`${z}%: a click in each cell lands in that cell (the caret inside it)`,
      same(got.map((x) => x.head.split(':')[0]), ['one', 'two', 'three', 'four']) && got.every((x) => x.inside), got);
  }
  await show('Te', 100);

  // ---------------------------------------------------- a table first in the document: its edge, Enter there
  await show('Tf', 100);
  const c0 = await click(0, 0, 'Tf');
  await ev(() => {
    const v = window.__doc('Tf').view;
    v.setSelection({ id: v.selection.head.id, off: 0 });
  });
  await press('ArrowLeft');
  const e0 = await ev(() => ({ head: window.__head('Tf'), depth: window.__doc('Tf').view.undoDepth }));
  await press('Enter');
  const e1 = await ev(() => {
    const d = window.__doc('Tf');
    return { head: window.__head('Tf'), depth: d.view.undoDepth,
      blocks: d.d.doc.sections[0].blocks.map((b) => (b.type === 'p' ? b.text : b.type)) };
  });
  await press('Control+z');
  const e2 = await ev(() => {
    const d = window.__doc('Tf');
    return { depth: d.view.undoDepth, blocks: d.d.doc.sections[0].blocks.map((b) => (b.type === 'p' ? b.text : b.type)) };
  });
  ok('a table first in the document: Left from its first cell\'s start reaches its edge; Enter there puts an empty '
    + 'paragraph before it (one undo step); Ctrl-Z takes it away',
  c0.head.startsWith('one:') && e0.head === 'tbl:0' && same(e1.blocks, ['', 'tbl', 'After']) && e1.depth === e0.depth + 1 && e1.head === 'tbl:0'
    && same(e2.blocks, ['tbl', 'After']) && e2.depth === e0.depth, { c0, e0, e1, e2 });
  // ---------------------------------------------------- C3.2: a Shift-drag across cells paints the cells' boxes
  await show('Ts', 100);
  await click(0, 0, 'Ts');
  const [a, b] = [await ev(() => window.__cell(0, 0, 'Ts')), await ev(() => window.__cell(1, 1, 'Ts'))];
  await page.keyboard.down('Shift');
  await page.mouse.move(a.at.x, a.at.y);
  await page.mouse.down();
  await page.mouse.move((a.at.x + b.at.x) / 2, (a.at.y + b.at.y) / 2, { steps: 4 });
  await page.mouse.move(b.at.x, b.at.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(([ia, ib]) => {
    const s = window.__doc('Ts').view.selection;
    return s.anchor.id === ia && s.head.id === ib;
  }, [a.id, b.id], { timeout: 5000 }).catch(() => {});
  await settle();
  const lit = await ev(() => {
    const d = window.__doc('Ts'), it = d.view.layout.items.find((x) => x.kind === 'tbl'), s = d.view.selection;
    /** The pixel near the right end of cell (r, c), away from its text. */
    const at = (r, c) => {
      const row = it.rows[r], cl = row.cells[c];
      return window.__px(cl.x + cl.w - 10, row.y + row.h / 2, 'Ts');
    };
    const cells = {};
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells[`${r}${c}`] = at(r, c);
    return { cells, sel: [window.__head('Ts'), it.rows[0].cells[0].col.items[0].id === s.anchor.id] };
  });
  const near = (q, w) => q.every((v, k) => Math.abs(v - w[k]) <= 3);
  const SEL = [0xb3, 0xd4, 0xfc], WHITE = [255, 255, 255];
  ok('a Shift-drag from cell (0,0) to (1,1) lights the four cells\' boxes in the selection colour; cells (0,2), '
    + '(2,0), (2,2) stay white', ['00', '01', '10', '11'].every((k) => near(lit.cells[k], SEL))
    && ['02', '12', '20', '21', '22'].every((k) => near(lit.cells[k], WHITE)) && lit.sel[0].startsWith('c11:')
    && lit.sel[1], lit);

  // ---------------------------------------------------- C3.3: moving and selecting in tables
  /** The selection of Ts as 'text:off-text:off'. */
  const sel = () => ev(() => {
    const v = window.__doc('Ts').view, L = v.layout, s = v.selection;
    const nm = (p) => { const it = L.byId.get(p.id); return `${it.kind === 'p' ? it.block.text : it.kind}:${p.off}`; };
    return `${nm(s.anchor)}-${nm(s.head)}`;
  });
  /** Wait until Ts's selection is want (no fixed sleep), then the frames. */
  const until = async (want) => {
    await page.waitForFunction((want) => {
      const v = window.__doc('Ts').view, L = v.layout, s = v.selection;
      const nm = (p) => { const it = L.byId.get(p.id); return `${it.kind === 'p' ? it.block.text : it.kind}:${p.off}`; };
      return `${nm(s.anchor)}-${nm(s.head)}` === want;
    }, want, { timeout: 3000 }).catch(() => {});
    await settle();
  };
  /** Ts's selection set to a caret in the paragraph with text t at off. */
  const caretAt = (t, off) => ev(([t, off]) => {
    const v = window.__doc('Ts').view, it = v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t);
    v.setSelection({ id: it.id, off });
  }, [t, off]);
  /** The cells of Ts lit in the selection colour, as '00 01 ...'. */
  const litCells = () => ev(() => {
    const it = window.__doc('Ts').view.layout.items.find((x) => x.kind === 'tbl'), out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const row = it.rows[r], cl = row.cells[c], q = window.__px(cl.x + cl.w - 10, row.y + row.h / 2, 'Ts');
      if (Math.abs(q[0] - 0xb3) <= 3 && Math.abs(q[1] - 0xd4) <= 3 && Math.abs(q[2] - 0xfc) <= 3) out.push(`${r}${c}`);
    }
    return out.join(' ');
  });
  /** A real Select click at layout (x, y) of Ts (zoom 100%). */
  const clickLayout = async (x, y) => {
    const at = await ev(([x, y]) => {
      const d = window.__doc('Ts'), m = window.__ws(x, y, 'Ts');
      return window.__client(d.win, m.x, m.y);
    }, [x, y]);
    await page.mouse.click(at.x, at.y);
  };
  /** Ts's table geometry: x0, top, each cell's box. */
  const geo = () => ev(() => {
    const it = window.__doc('Ts').view.layout.items.find((x) => x.kind === 'tbl');
    return { x0: it.x + it.left, y: it.y, rows: it.rows.map((row) => ({ y: row.y, h: row.h,
      cells: row.cells.map((c) => ({ x: c.x, w: c.w })) })) };
  });
  await show('Ts', 100);

  // Tab and Shift-Tab: the next / previous cell, its content selected; nothing past the ends
  await caretAt('c00', 1);
  await settle();
  const tabs = [];
  for (let k = 0; k < 8; k++) { await press('Tab'); tabs.push(await sel()); }
  const back = [];
  for (let k = 0; k < 9; k++) { await press('Shift+Tab'); back.push(await sel()); }
  const cellsIn = ['c01', 'c02', 'c10', 'c11', 'c12', 'c20', 'c21', 'c22'].map((t) => `${t}:0-${t}:3`);
  const t0 = await ev(() => window.__doc('Ts').d.doc.sections[0].blocks.length);
  ok('Tab goes through the cells in order, selecting each cell\'s content (in the last cell it adds a row: C4.1 part '
    + 'below); Shift-Tab back the same way; at the first cell nothing; the document unchanged',
  same(tabs, cellsIn) && same(back, [...cellsIn.slice(0, 7).reverse(), 'c00:0-c00:3', 'c00:0-c00:3'])
    && t0 === 3, { tabs, back, t0 });

  // Up / Down by the cells' geometry
  await caretAt('c01', 1);
  await settle();
  const vert = [];
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']) {
    await press(k);
    vert.push((await sel()).split('-')[1]);
  }
  ok('ArrowDown from cell (0,1) goes to (1,1), (2,1), then the end of "After" (goalX past its text); ArrowUp back up and out to "Before"',
    same(vert, ['c11:1', 'c21:1', 'After:5', 'c21:1', 'c11:1', 'c01:1', 'Before:6']), vert);

  // Shift-Right across a cell's boundary: a cells shape (the boxes lit)
  await caretAt('c00', 3);
  await settle();
  await press('Shift+ArrowRight');
  const sr = { sel: await sel(), lit: await litCells() };
  ok('Shift-Right from the end of cell (0,0) crosses into (0,1): the two cells\' boxes are lit',
    sr.sel === 'c00:3-c01:0' && sr.lit === '00 01', sr);

  // a drag from (0,0) to (2,1): six cells
  await caretAt('c22', 0);
  await settle();
  const [d0, d1] = [await ev(() => window.__cell(0, 0, 'Ts')), await ev(() => window.__cell(2, 1, 'Ts'))];
  await page.mouse.move(d0.at.x, d0.at.y);
  await page.mouse.down();
  await page.mouse.move((d0.at.x + d1.at.x) / 2, (d0.at.y + d1.at.y) / 2, { steps: 4 });
  await page.mouse.move(d1.at.x, d1.at.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(([ia, ib]) => {
    const s = window.__doc('Ts').view.selection;
    return s.anchor.id === ia && s.head.id === ib;
  }, [d0.id, d1.id], { timeout: 5000 }).catch(() => {});
  await settle();
  const dr = await litCells();
  ok('a drag from cell (0,0) to (2,1) lights six cells', dr === '00 01 10 11 20 21', dr);

  // the mouse's zones
  const g = await geo();
  await press('ArrowRight');
  const c11 = g.rows[1].cells[1];
  await clickLayout(c11.x + 2, g.rows[1].y + g.rows[1].h / 2);
  await until('c11:0-c11:3');
  const z1 = await sel();
  await press('ArrowRight');
  await clickLayout(g.x0 - 12, g.rows[2].y + g.rows[2].h / 2);
  await until('c20:0-c22:3');
  const z2 = { sel: await sel(), lit: await litCells() };
  await press('ArrowRight');
  const c01 = g.rows[0].cells[1];
  await clickLayout(c01.x + c01.w / 2, g.y - 2);
  await until('c01:0-c21:3');
  const z3 = { sel: await sel(), lit: await litCells() };
  ok('a click in the first 4 px inside cell (1,1) selects its content', z1 === 'c11:0-c11:3', z1);
  ok('a click left of row 2 (outside the table) selects the row', z2.sel === 'c20:0-c22:3' && z2.lit === '20 21 22', z2);
  ok('a click just above column 1 selects the column', z3.sel === 'c01:0-c21:3' && z3.lit === '01 11 21', z3);

  // the zones at 200%: the caller undoes the zoom
  await show('Ts', 200);
  await press('ArrowRight');
  const g2 = await geo();
  await clickLayout(g2.x0 - 6, g2.rows[1].y + g2.rows[1].h / 2);
  await until('c10:0-c12:3');
  const z4 = await sel();
  await show('Ts', 100);
  ok('200%: a click left of row 1 selects the row', z4 === 'c10:0-c12:3', z4);

  // Ctrl-Tab in a cell: a tab character (R21: if the desktop took the key first, it would not arrive)
  await caretAt('c11', 1);
  await settle();
  const ct0 = await ev(() => window.__doc('Ts').view.undoDepth);
  await page.keyboard.press('Control+Tab');
  await page.waitForFunction(() => window.__doc('Ts').view.layout.flow.some((x) => x.kind === 'p'
    && x.block.text.includes('\t')), null, { timeout: 3000 }).catch(() => {});
  await settle();
  const ct = await ev(() => {
    const v = window.__doc('Ts').view;
    return { texts: v.layout.flow.filter((x) => x.kind === 'p' && x.block.text.includes('\t')).map((x) => x.block.text),
      depth: v.undoDepth };
  });
  ok('Ctrl-Tab in a cell types a tab character there (one undo step)', same(ct.texts, ['c\t11'])
    && ct.depth === ct0 + 1, { ct0, ct });
  await press('Control+z');

  // Ctrl-A: the whole document
  await caretAt('c11', 1);
  await settle();
  await press('Control+a');
  const all = await sel();
  ok('Ctrl-A in a cell selects the whole document', all === 'Before:0-After:5', all);

  {
    // ---------------------------------------------------- C3.4: typing and deleting in and around the table
    await show('Td', 100);
    /** Td's selection as 'text:off-text:off' (a caret: 'text:off'), the cells' texts, the undo depth. */
    const st = () => ev(() => {
      const v = window.__doc('Td').view, L = v.layout, s = v.selection;
      const nm = (q) => { const it = L.byId.get(q.id); return `${it.kind === 'p' ? it.block.text : it.kind}:${q.off}`; };
      const t = v.layout.items.find((x) => x.kind === 'tbl').block;
      return { sel: s.anchor.id === s.head.id && s.anchor.off === s.head.off ? nm(s.head) : `${nm(s.anchor)}-${nm(s.head)}`,
        cells: t.rows.map((r) => r.cells.map((c) => c.blocks.map((b) => b.text).join('|')).join(' ')),
        blocks: v.layout.items.length, depth: v.undoDepth };
    });
    /** A selection in Td from the paragraph with text a at ao to b at bo. */
    const setSel = (a, ao, b = a, bo = ao) => ev(([a, ao, b, bo]) => {
      const v = window.__doc('Td').view, f = (t) => v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t).id;
      v.setSelection({ id: f(a), off: ao }, { id: f(b), off: bo });
    }, [a, ao, b, bo]);
    /** Td's selection, undo depth and table as one string (what a key may change). */
    const state = () => ev(() => {
      const v = window.__doc('Td').view, L = v.layout, s = v.selection;
      return JSON.stringify([s.anchor, s.head, v.undoDepth, L.items.length, L.items.find((x) => x.kind === 'tbl').block]);
    });
    /** A real key; with `changes`, wait until Td's state differs (no fixed sleep); then the frames and st(). */
    const key = async (k, changes) => {
      const s0 = changes ? await state() : null;
      await page.keyboard.press(k);
      if (changes) {
        await page.waitForFunction((j) => {
          const v = window.__doc('Td').view, L = v.layout, s = v.selection;
          return JSON.stringify([s.anchor, s.head, v.undoDepth, L.items.length,
            L.items.find((x) => x.kind === 'tbl').block]) !== j;
        }, s0, { timeout: 3000 }).catch(() => {});
      }
      await settle();
      return st();
    };
    const fresh = await st();
    // Backspace at the start of "After" (not empty): to the end of the last cell, nothing deleted
    await setSel('After', 0);
    await settle();
    const b1 = await key('Backspace');
    // Delete at the end of "Before": nothing
    await setSel('Before', 6);
    await settle();
    const f1 = await key('Delete');
    // at a cell's edges: nothing
    await setSel('c11', 0);
    await settle();
    const e1 = await key('Backspace');
    await setSel('c11', 3);
    await settle();
    const e2 = await key('Delete');
    ok('TB10 by real keys: Backspace at the start of "After" goes to the end of the last cell, nothing deleted; Delete '
      + 'at the end of "Before" and Backspace / Delete at a cell\'s start / end do nothing',
    b1.sel === 'c22:3' && f1.sel === 'Before:6' && e1.sel === 'c11:0' && e2.sel === 'c11:3'
      && [b1, f1, e1, e2].every((x) => same(x.cells, fresh.cells) && x.depth === fresh.depth), { fresh, b1, f1, e1, e2 });

    // Delete over cells (0,0)..(1,1): cleared; Ctrl-Z restores them, the caret in row 0's first cell
    await setSel('c00', 1, 'c11', 2);
    await settle();
    const x1 = await key('Delete', true);
    const x2 = await key('Control+z', true);
    ok('Delete over cells (0,0)..(1,1) clears them (one undo step); Ctrl-Z gives them back, the caret in cell (0,0)',
      same(x1.cells, ['  c02', '  c12', 'c20 c21 c22'])
      && x1.depth === fresh.depth + 1 && same(x2.cells, fresh.cells) && x2.sel === 'c00:0' && x2.depth === fresh.depth,
    { x1, x2 });

    // Backspace over row 1 (all its cells): the row removed; Ctrl-Z restores it, the caret in it
    await setSel('c10', 0, 'c12', 3);
    await settle();
    const y1 = await key('Backspace', true);
    const y2 = await key('Control+z', true);
    ok('Backspace over row 1 removes the row (one undo step); Ctrl-Z restores it, the caret in its first cell',
      same(y1.cells, ['c00 c01 c02', 'c20 c21 c22']) && y1.sel === 'c20:0' && y1.depth === fresh.depth + 1
      && same(y2.cells, fresh.cells) && y2.sel === 'c10:0', { y1, y2 });

    // typing over two cells: cleared, the text in the top-left one
    await setSel('c21', 1, 'c20', 2);
    await settle();
    await page.keyboard.type('Q');
    await page.waitForFunction(() => window.__doc('Td').view.layout.flow.some((x) => x.kind === 'p' && x.block.text === 'Q'),
      null, { timeout: 3000 }).catch(() => {});
    await settle();
    const q1 = await st();
    const q2 = await key('Control+z', true);
    ok('typing Q over cells (2,0)..(2,1) clears them and puts Q in the top-left one; Ctrl-Z restores them',
      q1.cells[2] === 'Q  c22' && q1.sel === 'Q:1' && same(q2.cells, fresh.cells), { q1, q2 });

    // Ctrl-Enter in a cell: refused with a beep, nothing changed
    await setSel('c11', 1);
    await settle();
    await ev(() => {
      window.__beeps = 0;
      window.__beep = os.wimp.beep;
      const b = os.wimp.beep.bind(os.wimp);
      os.wimp.beep = () => { window.__beeps++; return b(); };
    });
    let ce;
    try {
      await page.keyboard.press('Control+Enter');
      await page.waitForFunction(() => window.__beeps > 0, null, { timeout: 3000 }).catch(() => {});
      await settle();
      ce = { ...(await st()), beeps: await ev(() => window.__beeps) };
    } finally {
      await ev(() => { os.wimp.beep = window.__beep; });
    }
    ok('Ctrl-Enter in a cell beeps and changes nothing', ce.beeps === 1 && same(ce.cells, fresh.cells)
      && ce.depth === fresh.depth && ce.sel === 'c11:1', ce);

    // typing in a cell, then Ctrl-Z: the caret back in the cell
    await page.keyboard.type('xy');
    await page.waitForFunction(() => window.__doc('Td').view.layout.flow.some((x) => x.kind === 'p' && x.block.text === 'cxy11'),
      null, { timeout: 3000 }).catch(() => {});
    await settle();
    const t1 = await st();
    const t2 = await key('Control+z', true);
    ok('typing xy in cell (1,1) (one undo step); Ctrl-Z restores it with the caret in the cell where it was',
      t1.cells[1] === 'c10 cxy11 c12' && t1.depth === fresh.depth + 1 && same(t2.cells, fresh.cells)
      && t2.sel === 'c11:1', { t1, t2 });

    // D20: 200 characters in cell (500, 2) of the 1000 x 5 table, against 200 in a plain paragraph of it
    await show('Tk', 100);
    const timing = await ev(async () => {
      const v = window.__doc('Tk').view, w = window.__doc('Tk').dw.win, f = w._onRedraw;
      let painted = 0;
      w._onRedraw = (g, rc) => { const t = performance.now(); f(g, rc); painted += performance.now() - t; };
      try {
        const run = async (id) => {
          v.setSelection({ id, off: 0 });
          await window.__frames(2);
          const ms = [];
          for (let k = 0; k < 203; k++) {
            painted = 0;
            const t0 = performance.now();
            v.type(k % 2 ? ' ' : 'k');
            v.flush();
            const t1 = performance.now();
            await window.__frames(1);
            if (k >= 3) ms.push(t1 - t0 + painted);
          }
          ms.sort((a, b) => a - b);
          return ms[100];
        };
        const L = v.layout, t = L.items.find((x) => x.kind === 'tbl');
        const cellId = t.rows[500].cells[2].col.items[0].id, plainId = L.items[100].id;
        const plain1 = await run(plainId), cell = await run(cellId), plain2 = await run(plainId);
        const text = v.layout.byId.get(cellId).block.text;
        return { plain: Math.min(plain1, plain2), plain1, plain2, cell, len: text.length, msgs: window.__msgs.length };
      } finally {
        w._onRedraw = f;
      }
    });
    console.log(`# D20 (C3.4): a keystroke in a plain paragraph ${timing.plain.toFixed(2)} ms `
      + `(${timing.plain1.toFixed(2)} / ${timing.plain2.toFixed(2)}), in cell (500, 2) of a 1000 x 5 table `
      + `${timing.cell.toFixed(2)} ms (median of 200, edit + layout + paint)`);
    ok('D20: 200 characters typed in cell (500, 2) of a 1000 x 5 table: the median keystroke (edit, layout, paint) '
      + 'within +5 ms of the median in a plain paragraph of the same document',
    timing.cell <= timing.plain + 5 && timing.len === 'r500c2'.length + 203 && !timing.msgs, timing);
  }

  {
    // ---------------------------------------------------- C3.5: formatting, Find and links in cells
    await show('Tc', 100);
    /** Cell (r, c) of Tc: its paragraph's id, text, bold runs; the right end of its first line's ink (pixels). */
    const look = (r, c) => ev(([r, c]) => {
      const d = window.__doc('Tc'), L = d.view.layout, it = L.items.find((x) => x.kind === 'tbl');
      const row = it.rows[r], cl = row.cells[c], pi = cl.col.items[0], ln = pi.lines[0];
      // (one read of the canvas over the line's band, the pixel rule of __px)
      const win = d.win, cv = win._canvas, k = cv.width / win.w;
      const x0 = Math.floor((cl.x + 1 - win.scrollX) * k), x1 = Math.floor((cl.x + cl.w - 2 - win.scrollX) * k);
      const y0 = Math.ceil((pi.y + ln.y + 2 - win.scrollY) * k), y1 = Math.floor((pi.y + ln.y + ln.h - 2 - win.scrollY) * k);
      const img = cv.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0), w = x1 - x0;
      let right = -1, ink = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const dark = 765 - img.data[i] - img.data[i + 1] - img.data[i + 2];
        ink += dark;
        if (dark > 465) right = Math.max(right, (i / 4) % w);
      }
      return { id: pi.id, text: pi.block.text, bold: pi.block.runs.every((u) => u.rPr.b === true), right, ink };
    }, [r, c]);
    const all = async () => {
      const out = {};
      for (const [r, c] of [[0, 0], [0, 1], [1, 0], [1, 1], [0, 2], [2, 2]]) out[`${r}${c}`] = await look(r, c);
      return out;
    };
    const caretAtStart = () => ev(() => {
      const v = window.__doc('Tc').view;
      v.setSelection({ id: v.layout.items[0].id, off: 0 });
    });
    await caretAtStart();
    await settle();
    const before = await all(), depth0 = await ev(() => window.__doc('Tc').view.undoDepth);
    await ev(([a, b]) => window.__doc('Tc').view.setSelection({ id: a, off: 1 }, { id: b, off: 2 }),
      [before['00'].id, before['11'].id]);
    await settle();
    await page.keyboard.press('Control+b');
    await page.waitForFunction((id) => window.__doc('Tc').view.layout.byId.get(id).block.runs.every((u) => u.rPr.b),
      before['11'].id, { timeout: 3000 }).catch(() => {});
    const depth1 = await ev(() => window.__doc('Tc').view.undoDepth);
    await caretAtStart();
    await settle();
    const after = await all();
    const inRect = ['00', '01', '10', '11'], outside = ['02', '22'];
    ok('Ctrl-B with cells (0,0)..(1,1) selected: exactly those four cells bold (one undo step), their text drawn '
      + 'heavier (more ink, never narrower); cells (0,2) and (2,2) drawn exactly as before',
    inRect.every((k) => after[k].bold && after[k].ink > before[k].ink * 1.1 && after[k].right >= before[k].right)
      && outside.every((k) => !after[k].bold && after[k].ink === before[k].ink && after[k].right === before[k].right)
      && depth1 === depth0 + 1,
    { before, after, depth0, depth1 });

    // the Find box: from the start of the document to "find me" in cell (1,1), selected and painted in the cell
    await caretAtStart();
    await settle();
    const fm = await ev(async (id) => {
      const msg = window.__word().word.find.run('next', { find: 'find me' });
      await window.__frames(3);
      const v = window.__doc('Tc').view, s = v.selection, L = v.layout, it = L.byId.get(id);
      const rs = L.selectionRects(s).map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h }));
      const q = rs[0], lit = q ? window.__px(Math.floor(q.x + 2), Math.floor(q.y + q.h - 3), 'Tc') : null;
      return { msg, sel: [s.anchor.id === id, s.anchor.off, s.head.id === id, s.head.off], rs, lit,
        cell: { x: it.x, y: it.y, w: it.w, h: it.h } };
    }, before['11'].id);
    const inside = fm.rs.length === 1 && fm.rs[0].x >= fm.cell.x - 1 && fm.rs[0].x + fm.rs[0].w <= fm.cell.x + fm.cell.w + 1;
    ok('the Find box finds "find me" in cell (1,1) from the start of the document, selects it and paints the '
      + 'selection inside the cell', fm.msg === '' && same(fm.sel, [true, 0, true, 7]) && inside && !!fm.lit
      && fm.lit.some((v) => v < 250) && fm.lit[0] + fm.lit[1] + fm.lit[2] > 450, fm);
    await ev(() => window.__word().word.find.box.close?.());

    // a real Ctrl-click on the link in cell (2,0): the caret goes to the bookmark in "After"
    await caretAtStart();
    await settle();
    const lk = await ev(() => {
      const d = window.__doc('Tc'), L = d.view.layout, it = L.items.find((x) => x.kind === 'tbl');
      const pi = it.rows[2].cells[0].col.items[0], ln = pi.lines[0], t = ln.items.find((q) => q.kind === 'link');
      const z = window.__ws(pi.x + t.x + t.w / 2, pi.y + ln.y + ln.h / 2, 'Tc');
      const after = L.items[L.items.length - 1];
      return { at: window.__client(d.win, z.x, z.y), target: after.id, text: after.block.text };
    });
    await page.keyboard.down('Control');
    try {
      await page.mouse.click(lk.at.x, lk.at.y);
    } finally {
      await page.keyboard.up('Control');
    }
    await page.waitForFunction((id) => window.__doc('Tc').view.selection.head.id === id, lk.target, { timeout: 3000 })
      .catch(() => {});
    await settle();
    const lh = await ev(() => { const s = window.__doc('Tc').view.selection; return { head: s.head, anchor: s.anchor }; });
    ok('a real Ctrl-click on a link in cell (2,0) follows it to its bookmark in "After"',
      lh.head.id === lk.target && lh.head.off <= 1, { lk, lh });
  }

  // ---------------------------------------------------- C3 fix wave: a vertical merge's hidden part
  {
    await show('Tm', 100);
    await ev(() => {
      const v = window.__doc('Tm').view, it = v.layout.flow.find((x) => x.kind === 'p' && x.block.text === 'b');
      v.setSelection({ id: it.id, off: 1 });
    });
    await settle();
    await press('ArrowRight');
    const h1 = await head('Tm');
    await page.keyboard.type('Z');
    await page.waitForFunction(() => window.__doc('Tm').view.layout.flow.some((x) => x.kind === 'p'
      && x.block.text === 'Zc'), null, { timeout: 3000 }).catch(() => {});
    await settle();
    await press('Home');
    await press('ArrowLeft');
    const h2 = await head('Tm');
    const texts = await ev(() => window.__doc('Tm').view.layout.flow.filter((x) => x.kind === 'p')
      .map((x) => x.block.text));
    ok('ArrowRight from the end of row 0 passes the hidden continue cell: "c" (typing goes there); Home, ArrowLeft '
      + 'back to "b"', h1 === 'c:0' && h2 === 'b:1' && texts.includes('Zc') && texts.includes('hidden'),
    { h1, h2, texts });
  }

  // ---------------------------------------------------- C3 fix wave: a picture dropped in a cell
  {
    await show('Tp', 100);
    const pd0 = await ev(() => window.__doc('Tp').view.undoDepth);
    await ev(() => {
      const d = window.__doc('Tp'), L = d.view.layout, t = L.items.find((x) => x.kind === 'tbl');
      const it = t.rows[0].cells[0].col.items[0];
      os.wimp.dataLoad({ window: d.win, x: it.x + 4, y: it.y + 5, sx: 0, sy: 0 },
        [{ path: 'RAM::RamDisc0.$.Pic', filetype: 0xB60, size: 10, name: 'Pic', type: 'file' }]);
    });
    await page.waitForFunction(() => window.__doc('Tp').view.layout.flow.some((x) => x.kind === 'p'
      && x.block.text.includes('\uFFFC')), null, { timeout: 5000 }).catch(() => {});
    await settle();
    const pd = await ev(() => {
      const d = window.__doc('Tp'), L = d.view.layout, t = L.items.find((x) => x.kind === 'tbl');
      const it = t.rows[0].cells[0].col.items[0], b = it.block, x = b.inlines[b.text.indexOf('\uFFFC')];
      const find = (n) => (n.name.endsWith(':extent') ? n : (n.children || []).filter((c) => c && c.name)
        .map(find).find(Boolean));
      const ext = x && x.node ? find(x.node) : null;
      return { text: b.text, cx: ext ? Number(ext.attrs.find((a) => a[0] === 'cx')[1]) : null,
        want: Math.floor(it.col.w * 15) * 635, depth: d.view.undoDepth };
    });
    ok('a PNG dropped on cell (0,0) goes in there sized to the cell\'s text width, one undo step',
      pd.text.replace('\uFFFC', '') === 'one' && pd.cx === pd.want && pd.cx < 3000 * 635 && pd.depth === pd0 + 1, { pd0, pd });
    // its SE handle dragged (the picture is selected after it goes in)
    const hd = await ev(() => {
      const d = window.__doc('Tp'), q = d.view.pic(), h = q && q.handles.find((x) => x.name === 'se');
      if (!h) return null;
      const m = window.__ws(h.x + h.w / 2, h.y + h.h / 2, 'Tp');
      return { at: window.__client(d.win, m.x, m.y), cx: q.cx, cy: q.cy };
    });
    if (hd) {
      await page.mouse.move(hd.at.x, hd.at.y);
      await page.mouse.down();
      await page.mouse.move(hd.at.x - 20, hd.at.y - 10, { steps: 4 });
      await page.mouse.move(hd.at.x - 40, hd.at.y - 20, { steps: 4 });
      await settle();
      await page.mouse.up();
      await page.waitForFunction((cx) => { const q = window.__doc('Tp').view.pic(); return !!q && q.cx < cx; },
        hd.cx, { timeout: 3000 }).catch(() => {});
      await settle();
    }
    const rs = await ev(() => {
      const d = window.__doc('Tp'), q = d.view.pic(), L = d.view.layout, t = L.items.find((x) => x.kind === 'tbl');
      return { cx: q && q.cx, cy: q && q.cy, depth: d.view.undoDepth,
        inCell: !!q && t.rows[0].cells[0].col.items[0].id === q.pos.id };
    });
    ok('the picture in the cell: its SE handle dragged makes it smaller in proportion, one undo step, still in the cell',
      !!hd && rs.cx < hd.cx && Math.abs(rs.cx / rs.cy - hd.cx / hd.cy) < 0.02 && rs.depth === pd.depth + 1 && rs.inCell,
      { hd, rs });
  }

  // ---------------------------------------------------- C4.1: Tab in the last cell, split table
  {
    await show('Tr', 100);
    /** Tr's state: the head, undo depth, top-level blocks, the tables' row counts. */
    const st = () => ev(() => {
      const d = window.__doc('Tr'), bs = d.d.doc.sections[0].blocks;
      return { head: window.__head('Tr'), depth: d.view.undoDepth,
        blocks: bs.map((b) => (b.type === 'p' ? b.text : b.type)),
        rows: bs.filter((b) => b.type === 'tbl').map((b) => b.rows.length),
        first: bs.filter((b) => b.type === 'tbl').map((b) => b.rows[b.rows.length - 1].cells[0].blocks[0].id) };
    });
    /** Wait until fn(state) holds (no fixed sleep). */
    const until = (src, arg) => page.waitForFunction(src, arg, { timeout: 5000 }).catch(() => {});
    const caretTr = (t, off) => ev(([t, off]) => {
      const v = window.__doc('Tr').view, it = v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t);
      v.setSelection({ id: it.id, off });
    }, [t, off]);
    await caretTr('c22', 3);
    await settle();
    const r0 = await st();
    await page.keyboard.press('Tab');
    await until((n) => window.__doc('Tr').view.undoDepth === n, r0.depth + 1);
    await settle();
    const r1 = await st();
    const newFirst = await ev(() => {
      const v = window.__doc('Tr').view, t = window.__doc('Tr').d.doc.sections[0].blocks[1];
      return !!t.rows[3] && v.selection.head.id === t.rows[3].cells[0].blocks[0].id && v.selection.head.off === 0;
    });
    await page.keyboard.press('Control+z');
    await until((n) => window.__doc('Tr').view.undoDepth === n, r0.depth);
    await settle();
    const r2 = await st();
    await caretTr('c00', 1);
    await settle();
    await press('Shift+Tab');
    const r3 = await st();
    ok('a real Tab in the last cell adds a row below the last (one undo step), the caret in its first cell; Ctrl-Z '
      + 'removes it, the caret back in the last cell; Shift-Tab in the first cell adds nothing',
    same(r1.rows, [4]) && r1.depth === r0.depth + 1 && newFirst && r1.head === ':0'
      && same(r2.rows, [3]) && r2.depth === r0.depth && r2.head === 'c22:3'
      && same(r3.rows, [3]) && r3.depth === r0.depth, { r0, r1, newFirst, r2, r3 });

    // Ctrl-Shift-Enter in row 1: two tables with an empty paragraph between
    await caretTr('c11', 1);
    await settle();
    const s0 = await st();
    await page.keyboard.press('Control+Shift+Enter');
    await until((n) => window.__doc('Tr').view.undoDepth === n, s0.depth + 1);
    await settle();
    const s1 = await st();
    /** The darkest pixel (sum of r, g, b) at layout y within 3 px of x. */
    const px = await ev(() => {
      const d = window.__doc('Tr'), L = d.view.layout, ts = L.items.filter((x) => x.kind === 'tbl');
      const gap = L.items.find((x) => x.kind === 'p' && x.block.text === '' && x.y > ts[0].y);
      if (ts.length !== 2 || !gap) return null;
      const bx = ts[0].rows[0].cells[1].x;
      const dark = (y) => {
        let m = 765;
        for (let x = bx - 3; x <= bx + 3; x++) { const q = window.__px(x, y, 'Tr'); m = Math.min(m, q[0] + q[1] + q[2]); }
        return m;
      };
      const mid = (row) => row.y + row.h / 2;
      return { t1: dark(mid(ts[0].rows[0])), gap: dark(gap.y + gap.h / 2), t2: dark(mid(ts[1].rows[1])),
        x2: ts[1].rows[0].cells[1].x === bx };
    });
    await page.keyboard.press('Control+z');
    await until((n) => window.__doc('Tr').view.undoDepth === n, s0.depth);
    await settle();
    const s2 = await st();
    ok('Ctrl-Shift-Enter in row 1 splits the table: an empty paragraph between (one undo step), the caret in it; two '
      + 'separate grids drawn (the border dark in both, white between); Ctrl-Z gives the one table back',
    same(s1.blocks, ['Before', 'tbl', '', 'tbl', 'After']) && same(s1.rows, [1, 2]) && s1.depth === s0.depth + 1
      && s1.head === ':0' && !!px && px.t1 < 300 && px.t2 < 300 && px.gap > 740 && px.x2
      && same(s2.blocks, ['Before', 'tbl', 'After']) && same(s2.rows, [3]) && s2.depth === s0.depth
      && s2.head === 'c10:0', { s0, s1, px, s2 });
  }

  // ---------------------------------------------------- C4.3: merge and split cells
  {
    await show('Tg', 100);
    const until = (src, arg) => page.waitForFunction(src, arg, { timeout: 5000 }).catch(() => {});
    const st = () => ev(() => {
      const d = window.__doc('Tg'), t = d.d.doc.sections[0].blocks[1];
      return { head: window.__head('Tg'), depth: d.view.undoDepth, beeps: window.__beeps, grid: t.grid.length,
        texts: t.rows.map((row) => row.cells.map((c) => c.blocks.map((b) => b.text).join('|'))),
        box: d.dw.boxes.has('tblsplit') ? window.__word().word.dialog({ key: 'tblsplit:' + d.docKey, rows: [] })
          .isOpen : false };
    });
    /** The darkest pixel (sum of r, g, b) within 3 px of (x, y), along dir 'x' or 'y'. */
    const dark = (x, y, dir) => ev(([x, y, dir]) => {
      let m = 765;
      for (let i = -3; i <= 3; i++) {
        const q = window.__px(dir === 'x' ? x + i : x, dir === 'y' ? y + i : y, 'Tg');
        m = Math.min(m, q[0] + q[1] + q[2]);
      }
      return m;
    }, [x, y, dir]);
    const geo = () => ev(() => {
      const it = window.__doc('Tg').view.layout.items.find((x) => x.kind === 'tbl');
      return it.rows.map((row) => ({ y: row.y, h: row.h, xs: row.cells.map((c) => [c.x, c.w]) }));
    });
    const sel = (a, ao, b, bo) => ev(([a, ao, b, bo]) => {
      const v = window.__doc('Tg').view, f = (t) => v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t).id;
      v.setSelection({ id: f(a), off: ao }, { id: f(b), off: bo });
    }, [a, ao, b, bo]);
    const beep0 = await ev(() => {
      window.__beeps = 0;
      window.__beep = os.wimp.beep;
      const b = os.wimp.beep.bind(os.wimp);
      os.wimp.beep = () => { window.__beeps++; return b(); };
      return true;
    });
    try {
      const g0 = await geo();
      await sel('c00', 0, 'c11', 1);
      await settle();
      const m0 = await st();
      await ev(() => window.__doc('Tg').view.press('mergeCells'));
      await until((n) => window.__doc('Tg').view.undoDepth === n, m0.depth + 1);
      await settle();
      const m1 = await st();
      const midY = g0[0].y + g0[0].h / 2, col0 = g0[0].xs[0][0] + 20;
      const px = { inCol: await dark(g0[0].xs[1][0], midY, 'x'), inRow: await dark(col0, g0[1].y, 'y'),
        beside: await dark(g0[0].xs[2][0], midY, 'x') };
      await page.keyboard.press('Control+z');
      await until((n) => window.__doc('Tg').view.undoDepth === n, m0.depth);
      await settle();
      const m2 = await st();
      ok('Merge cells over (0,0)..(1,1): one cell holding the four texts in flow order (one undo step), the caret at '
        + 'its start; no line drawn inside it, the line beside it dark; Ctrl-Z gives the nine cells back',
      beep0 && same(m1.texts, [['c00|c01|c10|c11', 'c02'], ['', 'c12'], ['c20', 'c21', 'c22']])
        && m1.depth === m0.depth + 1 && m1.head === 'c00:0' && px.inCol > 740 && px.inRow > 740 && px.beside < 300
        && same(m2.texts, m0.texts) && m2.depth === m0.depth, { m0, m1, px, m2 });

      // the Split cells box, real keys and a real click on OK
      await sel('c11', 1, 'c11', 1);
      await settle();
      const s0 = await st();
      await ev(() => { window.__doc('Tg').splitBox(); });
      await until(() => window.__doc('Tg').dw.boxes.has('tblsplit'));
      await settle();
      const icon = (n) => ev((n) => {
        const d = window.__doc('Tg'), w = window.__word().word.dialog({ key: 'tblsplit:' + d.docKey, rows: [] }).win;
        const b = w.iconByName(n).bbox;
        return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      }, n);
      const msg = () => ev(() => {
        const d = window.__doc('Tg');
        return window.__word().word.dialog({ key: 'tblsplit:' + d.docKey, rows: [] }).win.iconByName('msg').text;
      });
      const field = async (n, text) => {
        const q = await icon(n);
        await page.mouse.click(q.x, q.y);
        await until((n) => os.wimp.caret?.icon?.name === n, n);
        await page.keyboard.press('End');
        for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
        await page.keyboard.type(text);
        await settle();
      };
      const clickOK = async () => {
        const q = await icon('button:OK');
        await page.mouse.click(q.x, q.y);
        await settle();
      };
      const b0 = await st();
      await field('cols', '3');
      await field('rows', '2');
      await clickOK();
      await until((n) => window.__doc('Tg').view.undoDepth === n, s0.depth + 1);
      await settle();
      const s1 = await st();
      const g1 = await geo();
      const lines = [];
      for (const [x] of g1[1].xs.slice(1, 4)) lines.push(await dark(x, g1[1].y + g1[1].h / 2, 'x'));
      ok('the Split cells box: Columns 3, Rows 2 typed and OK clicked split the middle cell (one undo step): 5 grid '
        + 'columns, 4 rows, the caret in its first new cell, the box gone, the new lines drawn',
      b0.box && s1.grid === 5 && s1.texts.length === 4 && s1.depth === s0.depth + 1 && s1.head === 'c11:0' && !s1.box
        && same(s1.texts[1], ['c10', 'c11', '', '', 'c12']) && lines.every((v) => v < 300),
      { b0, s1, lines });

      await ev(() => { window.__doc('Tg').splitBox(); });
      await until(() => window.__doc('Tg').dw.boxes.has('tblsplit'));
      await settle();
      const t0 = await st();
      await field('cols', '70');
      await clickOK();
      await until((n) => window.__beeps === n, t0.beeps + 1);
      const t1 = { ...(await st()), msg: await msg() };
      await field('cols', '62');
      await field('rows', '1');
      await clickOK();
      await until((n) => window.__beeps === n, t0.beeps + 2);
      const t2 = { ...(await st()), msg: await msg() };
      await page.keyboard.press('Escape');
      await until(() => !window.__doc('Tg').dw.boxes.has('tblsplit'));
      await settle();
      const t3 = await st();
      ok('Columns 70: a beep and a message, the box kept; Columns 62 (past 63 grid columns): a beep and why, the box '
        + 'kept, nothing changed; Escape closes it, nothing changed',
      t1.box && t1.beeps === t0.beeps + 1 && /1 to 63/.test(t1.msg) && t2.box && t2.beeps === t0.beeps + 2
        && /63 columns/.test(t2.msg) && t2.depth === t0.depth && t2.grid === 5 && !t3.box && t3.depth === t0.depth,
      { t0, t1, t2, t3 });
    } finally {
      await ev(() => { if (window.__beep) os.wimp.beep = window.__beep; });
    }
  }

  const m = await ev(() => window.__msgs);
  ok('no message on the way', !m.length, m);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
