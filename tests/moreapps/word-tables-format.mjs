// !Letters' Table properties box and Cell alignment (Batch C5.1, D26; real menu clicks, real keys, pixels). With the caret
// in a cell of a 2 x 2 table, Table > Table properties... opens the box filled from the cell (Auto width, Left, indent 0,
// Auto row height, the column's and the cell's width, Top). Row height Exactly with 0.3 in and OK is one undo step: the
// row is drawn 28.8 px high (the pixels of its two border lines, +-1) and its two-line cell is clipped; Ctrl-Z takes it
// back. Escape changes nothing and the box is deleted with it; a row height of 23 in, -1 in or text, a column width of 0
// beeps, says why and keeps the box (never clamped). A row of At least 1 in, then Table > Cell alignment > Top, Centre,
// Bottom moves the cell's text in the row (the ink's place, by pixels), one undo step each. A box left open while the
// caret moves to another cell: OK beeps, the box is refilled from the new cell and kept. Table width Length with 3 in,
// Alignment Right and Column width 2 in in one OK: one step. 20 open / close cycles leak nothing.
// Borders and shading (C5.2, D31) on a 3 x 3 table with no lines: Format > Borders and shading... with the caret in a
// cell offers Apply to Cell and Table (Cell chosen, Between shaded); outside the table they are shaded and Paragraph
// is chosen. Cell + Box + OK on the middle cell: one undo step, the cell's four sides (its neighbours untouched),
// the lines drawn (pixels), a grey fill drawn in the cell; Ctrl-Z takes them away. Table + All: the
// table's six sides, its outer and inside lines drawn. Paragraph + Box in a cell paragraph still borders the
// paragraph. A cell whose border is themed (kept raw): Box beeps, says why and keeps the box, nothing changed.
// 20 Borders-box cycles leak nothing. C5 fixes: a table 100% wide (pct) opens with Table width blank and the width
// field shaded; a width given with neither Auto nor Length beeps with "Choose Auto or Length..."; Length enables
// the field and 5 in is one step. Closing a document with both table boxes open deletes them.
// Column edges dragged (C5.3, D33) on a 2 x 3 Table Grid table (tcW dxa 3000, one pct): a real drag of the border
// between columns 1 and 2 by 30 px draws a dashed line while it lasts and makes one undo step: the grid 3450 / 2550 /
// 3000 and every cell's tcW in both columns (the pct one dxa now), the border's pixels moved 30 px; Ctrl-Z takes it
// back. Escape mid-drag: the line gone, nothing changed, no step. A drag back to its start: no step. The right edge
// +50 px: the last column 3750. At 200% a press 2 screen px from the border drags it (30 screen px = 15 layout px),
// one 5 screen px away selects text instead (the zone is 3 screen px).
// Row edges dragged (C5.4, D19, D33): a real drag of a row's bottom border 20 px down draws a dashed horizontal line,
// makes one undo step (trHeight atLeast the dragged height, the other rows untouched), moves the border's pixels 20 px;
// Ctrl-Z; Escape mid-drag: nothing; back to the start: no step; an exact row stays exact. The ruler in a cell (D32): its
// markers sit over the cell's text area (not the page's), and a real drag of the left-indent marker sets the cell
// paragraph's indent relative to the cell, one undo step.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { tbl, tr, tc, tblDocx, TABLE_NORMAL, TABLE_GRID } from './tbl-fixtures.mjs';
import { asDraft } from './word-draft.mjs';

const LOOK = '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" '
  + 'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const cell = (blocks) => tc(blocks, { tcPr: '<w:tcW w:w="3000" w:type="dxa"/>' });
const T2 = tbl([
  tr([cell(p(r('r0c0')) + p(r('r0c0b'))), cell(p(r('r0c1')))]),
  tr([cell(p(r('r1c0'))), cell(p(r('r1c1')))]),
], { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000] });
const T3 = tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => cell(p(r(`b${i}${j}`)))))),
  { tblPr: LOOK, grid: [3000, 3000, 3000] });
const THEMED = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="4472C4" w:themeColor="accent1"/>'
  + '</w:tcBorders>';
const T4 = tbl([tr([tc(p(r('raw')), { tcPr: '<w:tcW w:w="3000" w:type="dxa"/>' + THEMED }), cell(p(r('plain')))])],
  { tblPr: LOOK, grid: [3000, 3000] });
const files = {
  Tb: Array.from(await tblDocx(p(r('Before')) + T3 + p(r('Mid')) + T4 + p(r('After')), { styles: TABLE_NORMAL })),
  Tf: Array.from(await tblDocx(p(r('Before')) + T2 + p(r('After')), { styles: TABLE_NORMAL + TABLE_GRID })),
  Tg: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('cycles'))) })),
  Td: Array.from(await tblDocx(p(r('Before')) + tbl([0, 1].map((i) => tr([0, 1, 2].map((j) => tc(p(r(`d${i}${j}`)),
    { tcPr: i === 1 && j === 1 ? '<w:tcW w:w="1666" w:type="pct"/>' : '<w:tcW w:w="3000" w:type="dxa"/>' })))),
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000, 3000] }) + p(r('After')),
  { styles: TABLE_NORMAL + TABLE_GRID })),
  Tp: Array.from(await tblDocx(p(r('Before')) + tbl([0, 1].map((i) => tr([cell(p(r(`p${i}0`))), cell(p(r(`p${i}1`)))])),
    { tblPr: '<w:tblW w:w="5000" w:type="pct"/>', grid: [3000, 3000] }) + p(r('After')), { styles: TABLE_NORMAL })),
  Tc: Array.from(await tblDocx(p(r('Before')) + T3 + p(r('After')), { styles: TABLE_NORMAL })),
  Te: Array.from(await tblDocx(p(r('Before')) + tbl([tr([cell(p(r('x00'))), cell(p(r('x01')))],
    { trPr: '<w:trHeight w:val="600" w:hRule="exact"/>' }), tr([cell(p(r('x10'))), cell(p(r('x11')))])],
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000] }) + p(r('After')),
  { styles: TABLE_NORMAL + TABLE_GRID })),
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
  await asDraft(page);                 // (written for Draft: word-draft.mjs)
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
    window.__client = (win, x, y) => { const s = win.workToScreen(x, y); return window.__screen(s.x, s.y); };
    /** The dark pixels of a work-area rectangle: the first and last y, the count. */
    window.__ink = (leaf, x0, y0, x1, y1, lim = 450) => {
      const d = window.__doc(leaf), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const X0 = Math.floor((x0 - win.scrollX) * k), Y0 = Math.floor((y0 - win.scrollY) * k);
      const W = Math.max(1, Math.floor((x1 - x0) * k)), H = Math.max(1, Math.floor((y1 - y0) * k));
      const a = cv.getContext('2d').getImageData(X0, Y0, W, H).data;
      let top = -1, bottom = -1, n = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (a[i] + a[i + 1] + a[i + 2] < lim) { if (top < 0) top = y; bottom = y; n++; }
        }
      }
      return { top: top < 0 ? null : y0 + top / k, bottom: bottom < 0 ? null : y0 + (bottom + 1) / k, n };
    };
    window.__beeps = 0;
    const b = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return b(); };
    window.__st = (leaf) => {
      const d = window.__doc(leaf), v = d.view, sec = d.d.doc.sections[0].blocks;
      const t = sec.find((x) => x.type === 'tbl');
      const it = v.layout.items.find((x) => x.kind === 'tbl');
      return { depth: v.undoDepth, beeps: window.__beeps, box: d.dw.boxes.has('tblprops'), grid: t.grid.slice(),
        tblPr: JSON.parse(JSON.stringify({ ...t.tblPr, extra: undefined })),
        trH: t.rows.map((row) => row.trPr.trHeight || null),
        vAl: t.rows.map((row) => row.cells.map((c) => c.tcPr.vAlign || null)),
        tcW: t.rows.map((row) => row.cells.map((c) => (c.tcPr.tcW ? c.tcPr.tcW.w : null))),
        rows: it.rows.map((row) => ({ y: row.y, h: row.h, cells: row.cells.map((c) => ({ x: c.x, w: c.w, dy: c.dy, clip: c.clip,
          need: c.need })) })), itx: it.x };
    };
    window.__sel = (leaf, a, ao) => {
      const v = window.__doc(leaf).view, f = (t) => v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t).id;
      v.setSelection({ id: f(a), off: ao });
    };
    window.__api = (leaf) => {
      const d = window.__doc(leaf);
      return window.__word().word.dialog({ key: 'tblprops:' + d.docKey, rows: [] });
    };
  }, files);
  await ev(() => os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters'));
  await page.waitForFunction(() => !!window.__word()?.word, null, { timeout: 20000 });
  for (const leaf of ['Tf', 'Tg', 'Tb', 'Td', 'Te', 'Tp', 'Tc']) {
    await ev((leaf) => os.filer.run('RAM::RamDisc0.$.' + leaf), leaf);
    await page.waitForFunction((leaf) => !!window.__doc(leaf)?.view.layout, leaf, { timeout: 20000 });
  }
  const show = (leaf) => ev(async (leaf) => {
    const d = window.__doc(leaf);
    d.win.open({ x: 40, y: 40, w: 900, h: 640, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    await window.__frames(3);
    return window.__msgs;
  }, leaf);
  ok('the documents open, no message', !(await show('Tg')).length && !(await show('Tf')).length, await ev(() => window.__msgs));
  const st = (leaf) => ev((l) => window.__st(l), leaf);

  const openMenu = async (leaf) => {
    const ic = await ev((l) => {
      const rc = window.__doc(l).toolbar2.icon('lineSpacing').el.getBoundingClientRect();
      return { x: rc.left + 4, y: rc.top + 4 };
    }, leaf);
    await page.mouse.click(ic.x, ic.y, { button: 'middle' });
    await page.waitForFunction(() => os.wimp.menus.isOpen && os.wimp.menus.levels.length > 0, null, { timeout: 5000 });
    await settle();
  };
  const pick = async (level, text, { hover = false } = {}) => {
    const idx = await ev(([l, t]) => os.wimp.menus.levels[l].menu.items.findIndex((i) => String(i.text) === t), [level, text]);
    if (idx < 0) throw new Error(`no menu item '${text}' at level ${level}`);
    const b = await page.locator('.menu').nth(level).locator(`.mitem[data-index="${idx}"]`).boundingBox();
    if (hover) {
      await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
      await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
      await page.waitForFunction((n) => os.wimp.menus.levels.length > n, level + 1, { timeout: 5000 });
    } else {
      await page.mouse.click(b.x + 30, b.y + b.height / 2);
    }
    await settle();
  };
  const choose = async (leaf, ...path) => {
    await openMenu(leaf);
    for (let i = 0; i < path.length - 1; i++) await pick(i, path[i], { hover: true });
    await pick(path.length - 1, path.at(-1));
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
    await settle();
  };
  const boxIcon = (leaf, n) => ev(([leaf, n]) => {
    const w = window.__api(leaf).win, b = w.iconByName(n).bbox;
    return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, [leaf, n]);
  const boxMsg = (leaf) => ev((leaf) => window.__api(leaf).win.iconByName('msg')?.text ?? null, leaf);
  const vals = (leaf) => ev((leaf) => {
    const a = window.__api(leaf), o = {};
    for (const k of ['widthMode', 'width', 'align', 'indent', 'rowMode', 'rowHeight', 'colWidth', 'cellWidth', 'vAlign']) o[k] = a.get(k);
    return o;
  }, leaf);
  const field = async (leaf, n, text) => {
    const q = await boxIcon(leaf, n);
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction((n) => os.wimp.caret?.icon?.name === n, n, { timeout: 5000 });
    await page.keyboard.press('End');
    for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text);
    await settle();
  };
  const popup = async (leaf, n, text) => {
    const q = await boxIcon(leaf, 'arrow:' + n);
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction(() => os.wimp.menus.isOpen, null, { timeout: 5000 });
    await pick(0, text);
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
    await settle();
  };
  const clickOK = async (leaf) => {
    const q = await boxIcon(leaf, 'button:OK');
    await page.mouse.click(q.x, q.y);
    await settle();
  };
  const openBox = async (leaf) => {
    await choose(leaf, 'Table', 'Table properties...');
    await until((l) => !!window.__doc(l).dw.boxes.has('tblprops'), leaf);
    await settle();
  };
  const undo = async (leaf, n) => {
    await page.keyboard.press('Control+z');
    await until(([l, n]) => window.__doc(l).view.undoDepth === n, [leaf, n]);
    await settle();
  };

  // ---------------------------------------------------- the box opens filled
  await ev(() => window.__sel('Tf', 'r0c0', 2));
  await settle();
  const s0 = await st('Tf');
  await openBox('Tf');
  const v0 = await vals('Tf');
  ok('Table properties... opens the box filled from the caret\'s cell: Auto width, Left, indent 0, Auto rows, the column and '
    + 'cell 3000 twips, Top',
  v0.widthMode === 'auto' && v0.align === 'left' && v0.indent === 0 && v0.rowMode === 'auto' && v0.rowHeight === undefined
    && near(v0.colWidth, 3000, 5) && near(v0.cellWidth, 3000, 5) && v0.vAlign === 'top', v0);

  // ---------------------------------------------------- invalid lengths: a beep, a message, the box kept
  const bad = [];
  const tryBad = async (what, set) => {
    const b0 = await st('Tf');
    await set();
    await clickOK('Tf');
    await until((n) => window.__beeps > n, b0.beeps);
    const b1 = await st('Tf');
    bad.push({ what, beeped: b1.beeps === b0.beeps + 1, box: b1.box, same: b1.depth === b0.depth && same(b1.trH, b0.trH),
      msg: await boxMsg('Tf') });
  };
  await popup('Tf', 'rowMode', 'Exactly');
  await tryBad('row 23 in', async () => { await field('Tf', 'rowHeight', '23'); });
  await tryBad('row -1 in', async () => { await field('Tf', 'rowHeight', '-1'); });
  await tryBad('row abc', async () => { await field('Tf', 'rowHeight', 'abc'); });
  await field('Tf', 'rowHeight', '0.3');
  await tryBad('column 0', async () => { await field('Tf', 'colWidth', '0'); });
  await field('Tf', 'colWidth', '2.08');       // as shown for 3000 twips: not a change
  await tryBad('cell 23 in', async () => { await field('Tf', 'cellWidth', '23'); });
  await field('Tf', 'cellWidth', '2.08');
  ok('a row height of 23 in, -1 in or text, a column width of 0 and a cell width of 23 in each beep, say why and keep the '
    + 'box; the document is unchanged (never clamped)',
  bad.length === 5 && bad.every((x) => x.beeped && x.box && x.same && x.msg.length > 5)
    && /Row height/.test(bad[0].msg) && /Column width/.test(bad[3].msg) && /Cell width/.test(bad[4].msg), bad);

  // ---------------------------------------------------- Row height Exactly 0.3 in: one step, drawn 28.8 px high
  const b2 = await st('Tf');
  await page.keyboard.press('Enter');
  await until((n) => window.__doc('Tf').view.undoDepth === n, b2.depth + 1);
  await settle();
  const a2 = await st('Tf');
  const r0 = a2.rows[0], c0 = r0.cells[0];
  // the row's two border lines at the right edge of its first cell, away from the text
  const xr = c0.x + c0.w - 14;
  const line1 = await ev(([x, y]) => window.__ink('Tf', x, y - 4, x + 6, y + 3), [xr, r0.y]);
  const line2 = await ev(([x, y]) => window.__ink('Tf', x, y - 4, x + 6, y + 3), [xr, r0.y + r0.h]);
  ok('Exactly 0.3 in + Return: one undo step, only trHeight exact 432 on that row (the column kept: 3000), the row 28.8 px '
    + 'high, its two-line cell clipped, the box gone',
  a2.depth === b2.depth + 1 && same(a2.trH, [{ val: 432, hRule: 'exact' }, null]) && same(a2.grid, [3000, 3000])
    && near(r0.h, 28.8) && near(a2.rows[1].y - r0.y, 28.8) && c0.clip === true && c0.need > r0.h && !a2.box
    && line1.n > 0 && line2.n > 0, { a2, line1, line2 });
  const gapPx = await ev(([x, y, h]) => {
    // the first dark pixel at or below the top line, then the next dark band 10+ px further
    const top = window.__ink('Tf', x, y - 3, x + 6, y + 4);
    const bot = window.__ink('Tf', x, y + h - 3, x + 6, y + h + 4);
    return { top: top.top, bottom: bot.top };
  }, [xr, r0.y, r0.h]);
  ok('the pixels: the row\'s top and bottom border lines are 28.8 px apart (+-1)',
    gapPx.top !== null && gapPx.bottom !== null && near(gapPx.bottom - gapPx.top, 28.8), gapPx);
  await undo('Tf', b2.depth);
  const a3 = await st('Tf');
  ok('Ctrl-Z: the row Auto again, as tall as its two lines', same(a3.trH, [null, null]) && a3.rows[0].h > 28.8 + 5, a3);

  // ---------------------------------------------------- Escape changes nothing, the box is deleted
  await openBox('Tf');
  await popup('Tf', 'rowMode', 'Exactly');
  await field('Tf', 'rowHeight', '0.5');
  const e0 = await st('Tf');
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Tf').dw.boxes.has('tblprops'));
  await settle();
  const e1 = await st('Tf');
  ok('Escape: nothing changed, no undo step, the box is gone', !e1.box && e1.depth === e0.depth && same(e1.trH, e0.trH)
    && same(e1.grid, e0.grid), { e0, e1 });

  // ---------------------------------------------------- Cell alignment: the text moves in an At least 1 in row
  await ev(() => window.__sel('Tf', 'r1c0', 2));
  await settle();
  await openBox('Tf');
  await popup('Tf', 'rowMode', 'At least');
  await field('Tf', 'rowHeight', '1');
  await clickOK('Tf');
  await until((n) => window.__doc('Tf').view.undoDepth === n, e1.depth + 1);
  await settle();
  const t0 = await st('Tf');
  const ink = async () => {
    const s = await st('Tf'), row = s.rows[1], c = row.cells[0];
    const x = c.x;
    return { s, ink: await ev(([x, y0, y1, w]) => window.__ink('Tf', x + 6, y0 + 3, x + Math.min(w, 60), y1 - 3), [x, row.y, row.y + row.h, c.w]) };
  };
  const place = async (item) => {
    const b = await st('Tf');
    await choose('Tf', 'Table', 'Cell alignment', item);
    await until((n) => window.__doc('Tf').view.undoDepth === n, b.depth + 1);
    await settle();
    return { b, ...(await ink()) };
  };
  const top = await place('Top');
  const mid = await place('Centre');
  const bot = await place('Bottom');
  const rowTop = top.s.rows[1].y, rowH = top.s.rows[1].h;
  ok('At least 1 in: the row is 96 px; Cell alignment > Top, Centre, Bottom: one undo step each, vAlign on that cell only, '
    + 'the text moves (the ink at the top, the middle, the bottom of the row, by pixels)',
  near(t0.rows[1].h, 96) && top.s.depth === top.b.depth + 1 && mid.s.depth === mid.b.depth + 1 && bot.s.depth === bot.b.depth + 1
    && same(top.s.vAl[1], ['top', null]) && same(mid.s.vAl[1], ['center', null]) && same(bot.s.vAl[1], ['bottom', null])
    && top.s.vAl[0].every((x) => x === null)
    && top.ink.top - rowTop < 12 && near((mid.ink.top + mid.ink.bottom) / 2, rowTop + rowH / 2, 6)
    && rowTop + rowH - bot.ink.bottom < 12 && mid.ink.top - rowTop > 25 && bot.ink.top - rowTop > 50,
  { ink: [top.ink, mid.ink, bot.ink], dep: [top.s.depth - top.b.depth, mid.s.depth - mid.b.depth, bot.s.depth - bot.b.depth],
    vAl: [top.s.vAl, mid.s.vAl, bot.s.vAl], h: t0.rows[1].h, rowTop, rowH });
  await undo('Tf', bot.s.depth - 1);

  // ---------------------------------------------------- the caret moves while the box is open
  await openBox('Tf');
  await ev(() => window.__sel('Tf', 'r0c1', 1));
  await settle();
  const g0 = await st('Tf');
  await clickOK('Tf');
  await until((n) => window.__beeps > n, g0.beeps);
  const g1 = await st('Tf'), gm = await boxMsg('Tf');
  ok('the caret moved to another cell while the box was open: OK beeps, says so, keeps the box, refilled (the row\'s 96 px '
    + 'rule is not the new row\'s: Auto), no undo step', g1.beeps === g0.beeps + 1 && g1.box && g1.depth === g0.depth
    && /changed/.test(gm) && (await vals('Tf')).rowMode === 'auto', { g0, g1, gm });

  // ---------------------------------------------------- several fields in one step
  await popup('Tf', 'widthMode', 'Length');
  await field('Tf', 'width', '4');
  await popup('Tf', 'align', 'Right');
  await field('Tf', 'colWidth', '2');
  const m0 = await st('Tf');
  await clickOK('Tf');
  await until((n) => window.__doc('Tf').view.undoDepth === n, m0.depth + 1);
  await settle();
  const m1 = await st('Tf');
  ok('Table width Length 4 in, Alignment Right and Column width 2 in in one OK: one undo step, tblW 5760, jc right, the '
    + 'second column 2880 and every cell over it',
  m1.depth === m0.depth + 1 && same(m1.tblPr.tblW, { w: 5760, type: 'dxa' }) && m1.tblPr.jc === 'right'
    && same(m1.grid, [3000, 2880]) && same(m1.tcW.map((x) => x[1]), [2880, 2880]) && same(m1.tcW.map((x) => x[0]), [3000, 3000]),
  { m0, m1 });
  await undo('Tf', m0.depth);

  // ---------------------------------------------------- Borders and shading for cells and tables (C5.2)
  {
  await show('Tb');
  await ev(() => {
    window.__bx = (leaf) => {
      const d = window.__doc(leaf);
      return d.dw.boxes.has('borders') ? window.__word().word.dialog({ key: 'borders:' + d.docKey, rows: [] }) : null;
    };
    window.__tb = (leaf, n = 0) => {
      const d = window.__doc(leaf), t = d.d.doc.sections[0].blocks.filter((x) => x.type === 'tbl')[n];
      const it = d.view.layout.byId.get(t.id);
      const plain = (o) => (o === undefined ? null : JSON.parse(JSON.stringify(o)));
      return { depth: d.view.undoDepth, beeps: window.__beeps, box: d.dw.boxes.has('borders'),
        tcb: t.rows.map((row) => row.cells.map((c) => plain(c.tcPr.tcBorders))),
        shd: t.rows.map((row) => row.cells.map((c) => plain(c.tcPr.shd))),
        tblBorders: plain(t.tblPr.tblBorders), x: it.x, y: it.y,
        rows: it.rows.map((row) => ({ y: row.y, h: row.h, cells: row.cells.map((c) => ({ x: c.x, w: c.w })) })) };
    };
  });
  const tb = (n = 0) => ev(([l, n]) => window.__tb(l, n), ['Tb', n]);
  const bxIcon = (n) => ev((n) => {
    const w = window.__bx('Tb').win, b = w.iconByName(n).bbox;
    return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, n);
  const bxClick = async (n) => { const q = await bxIcon(n); await page.mouse.click(q.x, q.y); await settle(); };
  const bxShaded = (names) => ev((ns) => ns.map((n) => window.__bx('Tb').win.iconByName(n).shaded), names);
  const bxVals = () => ev(() => window.__bx('Tb').values());
  const openBorders = async () => {
    await choose('Tb', 'Format', 'Borders and shading...');
    await until(() => !!window.__doc('Tb').dw.boxes.has('borders'));
    await settle();
  };
  /** The dark pixels along a horizontal line (y) or a vertical one (x) of the work area, inside the table item. */
  const hLine = (x0, x1, y) => ev(([a, b, y]) => window.__ink('Tb', a, y - 2, b, y + 2), [x0, x1, y]);
  const vLine = (x, y0, y1) => ev(([x, a, b]) => window.__ink('Tb', x - 2, a, x + 2, b), [x, y0, y1]);
  /** The middle cell's top, bottom, left and right edges' ink (away from the corners and the caret). */
  const midInk = async () => {
    const s = await tb(), row = s.rows[1], c = row.cells[1], X = 0, Y = 0; // work-area px, as C5.1's
    return {
      top: (await hLine(X + c.x + c.w / 2, X + c.x + c.w - 8, Y + row.y)).n,
      bottom: (await hLine(X + c.x + c.w / 2, X + c.x + c.w - 8, Y + row.y + row.h)).n,
      left: (await vLine(X + c.x, Y + row.y + 4, Y + row.y + row.h - 4)).n,
      right: (await vLine(X + c.x + c.w, Y + row.y + 4, Y + row.y + row.h - 4)).n,
      fill: await ev(([x, y]) => {
        const d = window.__doc('Tb'), win = d.win, cv = win._canvas, k = cv.width / win.w;
        const a = cv.getContext('2d').getImageData(Math.floor((x - win.scrollX) * k), Math.floor((y - win.scrollY) * k), 1, 1).data;
        return [a[0], a[1], a[2]];
      }, [X + c.x + c.w - 10, Y + row.y + row.h / 2]),
    };
  };

  await ev(() => window.__sel('Tb', 'Before', 1));
  await settle();
  await openBorders();
  const out0 = await bxVals(), shOut = await bxShaded(['apply-cell', 'apply-table']);
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Tb').dw.boxes.has('borders'));
  ok('outside a table: Apply to Paragraph, Cell and Table shaded', out0.apply === 'para' && shOut.every(Boolean),
    { out0, shOut });

  await ev(() => window.__sel('Tb', 'b11', 1));
  await settle();
  const k0 = await tb(), i0 = await midInk();
  await openBorders();
  const c0v = await bxVals();
  const c0s = await bxShaded(['apply-cell', 'apply-table', 'between', 'insideH', 'setting-all']);
  ok('the caret in a cell: Apply to Cell chosen, Cell and Table offered, Between shaded, the inside sides and All '
    + 'offered; no lines yet (None)', c0v.apply === 'cell' && same(c0s, [false, false, true, false, false])
    && c0v.setting === 'none' && i0.top === 0 && i0.left === 0, { c0v, c0s, i0 });
  await bxClick('setting-box');
  await bxClick('arrow:fillkind');
  await page.waitForFunction(() => os.wimp.menus.isOpen, null, { timeout: 5000 });
  await pick(0, 'Colour');
  await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
  await settle();
  await bxClick('button:OK');
  await until((n) => window.__doc('Tb').view.undoDepth === n, k0.depth + 1);
  await settle();
  const k1 = await tb(), i1 = await midInk();
  const ONE = { val: 'single', sz: 4, space: 0, color: 'auto' };
  ok('Cell + Box + Fill Colour, OK: one undo step; the middle cell\'s four sides (its neighbours untouched: a drawn '
    + 'side wins), its grey fill; the four lines drawn and the cell filled (pixels); the box gone',
  k1.depth === k0.depth + 1 && !k1.box && same(k1.tcb[1][1], { top: ONE, bottom: ONE, left: ONE, right: ONE })
    && k1.tcb.every((row, r) => row.every((x, c) => (r === 1 && c === 1) || x === null))
    && same(k1.shd[1][1], { val: 'clear', color: 'auto', fill: 'D9D9D9' }) && k1.shd[0][0] === null
    && i1.top > 0 && i1.bottom > 0 && i1.left > 0 && i1.right > 0 && i1.fill.every((c) => c > 200 && c < 230),
  { k1: { depth: k1.depth, tcb: k1.tcb, shd: k1.shd[1] }, i1 });
  await undo('Tb', k0.depth);
  const i2 = await midInk(), k2 = await tb();
  ok('... Ctrl-Z: the sides, the fill and the lines gone', i2.top === 0 && i2.left === 0 && k2.tcb.flat().every((x) => x === null)
    && i2.fill.every((c) => c > 245), { i2, tcb: k2.tcb });

  await openBorders();
  await bxClick('apply-table');
  await bxClick('setting-all');
  const t0 = await tb();
  await bxClick('button:OK');
  await until((n) => window.__doc('Tb').view.undoDepth === n, t0.depth + 1);
  await settle();
  const t1 = await tb(), i3 = await midInk();
  const outerTop = await hLine(t1.rows[0].cells[0].x + 40, t1.rows[0].cells[0].x + 80, t1.rows[0].y);
  ok('Table + All, OK: one undo step, the table\'s six sides, no cell side written; the outer and inside lines drawn',
    t1.depth === t0.depth + 1 && same(t1.tblBorders, { top: ONE, bottom: ONE, left: ONE, right: ONE, insideH: ONE,
      insideV: ONE }) && t1.tcb.flat().every((x) => x === null) && outerTop.n > 0 && i3.top > 0 && i3.left > 0,
  { t1: t1.tblBorders, outerTop, i3 });
  await undo('Tb', t0.depth);

  await ev(() => window.__sel('Tb', 'b00', 1));
  await settle();
  await openBorders();
  await bxClick('apply-para');
  const pv = await bxVals();
  await bxClick('setting-box');
  const p0 = await tb();
  await bxClick('button:OK');
  await until((n) => window.__doc('Tb').view.undoDepth === n, p0.depth + 1);
  await settle();
  const pBdr = await ev(() => {
    const v = window.__doc('Tb').view, it = v.layout.flow.find((x) => x.kind === 'p' && x.block.text === 'b00');
    return JSON.parse(JSON.stringify(it.block.pPr.pBdr || null));
  });
  const p1 = await tb();
  ok('Paragraph + Box in a cell paragraph: the paragraph\'s four sides, no cell side, one undo step',
    pv.apply === 'para' && pBdr && pBdr.top && pBdr.left && pBdr.bottom && pBdr.right && p1.depth === p0.depth + 1
    && p1.tcb.flat().every((x) => x === null), { pv, pBdr });
  await undo('Tb', p0.depth);

  await ev(() => window.__sel('Tb', 'raw', 1));
  await settle();
  const r0b = await tb(1);
  await openBorders();
  await bxClick('setting-box');
  await bxClick('button:OK');
  await until((n) => window.__beeps > n, r0b.beeps);
  const r1b = await tb(1);
  const rmsg = await ev(() => window.__bx('Tb').win.iconByName('msg')?.text ?? null);
  ok('Box on a cell whose border is themed (raw): beeps, says why, the box kept, nothing changed',
    r1b.beeps === r0b.beeps + 1 && r1b.box && r1b.depth === r0b.depth && same(r1b.tcb, r0b.tcb) && /themed/.test(rmsg),
  { r0b, r1b, rmsg });
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Tb').dw.boxes.has('borders'));
  // 20 open / close cycles of the Borders box leak nothing
  await ev(() => window.__sel('Tb', 'b11', 1));
  await settle();
  const bw0 = await ev(() => [...os.wimp.windows].length);
  for (let i = 0; i < 20; i++) {
    await openBorders();
    if (i % 2) await page.keyboard.press('Escape');
    else await bxClick('button:Cancel');
    await until(() => !window.__doc('Tb').dw.boxes.has('borders'));
  }
  await settle();
  const bw1 = await ev(() => [...os.wimp.windows].length), bk = await tb();
  ok('20 open / close cycles of the Borders and shading box (Escape and Cancel in turn) leak no window, change nothing',
    bw1 === bw0 && !bk.box && bk.depth === k0.depth, { bw0, bw1 });
  await openBorders();
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Tb').dw.boxes.has('borders'));
  await show('Tf');
  }

  // ---------------------------------------------------- column edges dragged (C5.3)
  {
  await show('Td');
  await ev(() => window.__sel('Td', 'd00', 0));
  await settle();
  /** Grid line c of the table at row r: its layout x, the row's y range, and client points of layout (x, y). */
  const edge = (c, r = 0) => ev(([c, r]) => {
    const d = window.__doc('Td'), v = d.dw.view, it = v.L.items.find((x) => x.kind === 'tbl');
    const x = it.x + it.left + it.key.cols.slice(0, c).reduce((a, b) => a + b, 0), row = it.rows[r];
    return { x, y0: row.y, y1: row.y + row.h, z: v.zoom, top: v.L.top };
  }, [c, r]);
  const clientOf = (lx, ly) => ev(([lx, ly]) => {
    const d = window.__doc('Td'), v = d.dw.view, z = v.zoom, t = v.L.top;
    return window.__client(d.win, lx * z, t + (ly - t) * z);
  }, [lx, ly]);
  const dragSt = () => ev(() => {
    const d = window.__doc('Td'), v = d.dw.view, t = d.d.doc.sections[0].blocks.find((x) => x.type === 'tbl');
    return { depth: d.view.undoDepth, beeps: window.__beeps, grid: t.grid.slice(), ghost: v.tblGhost ?? null,
      dragging: !!v.tblDrag, tcW: t.rows.map((row) => row.cells.map((c) => (c.tcPr.tcW ? [c.tcPr.tcW.w, c.tcPr.tcW.type]
        : null))), tblW: t.tblPr.tblW ?? null, collapsed: v.sel.anchor.id === v.sel.head.id && v.sel.anchor.off === v.sel.head.off };
  });
  /** The x (layout) of the dark pixels in a 1-px row at layout y between x0 and x1 (the border lines). */
  const darkXs = (x0, x1, y) => ev(([x0, x1, y]) => {
    const d = window.__doc('Td'), win = d.win, v = d.dw.view, z = v.zoom, t = v.L.top;
    const cv = win._canvas, k = cv.width / win.w;
    const X0 = Math.floor((x0 * z - win.scrollX) * k), W = Math.ceil((x1 - x0) * z * k);
    const Y = Math.floor((t + (y - t) * z - win.scrollY) * k);
    const a = cv.getContext('2d').getImageData(X0, Y, W, 1).data, xs = [];
    for (let i = 0; i < W; i++) if (a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] < 300) xs.push(x0 + i / k / z);
    return xs;
  }, [x0, x1, y]);
  // (no fixed sleep: wait until a press cannot make a double-click of the last one)
  const apart = () => page.waitForFunction(() => !os.wimp._lastClick
    || performance.now() - os.wimp._lastClick.t > os.input.config.doubleClickMs + 20, null, { timeout: 5000 });
  /** A real drag from client point a by dx (client px), back to a first when back; mid() before the release. */
  const dragBy = async (a, dx, { mid, back = false } = {}) => {
    await apart();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx / 2, a.y, { steps: 3 });
    await page.mouse.move(a.x + dx, a.y, { steps: 3 });
    if (back) await page.mouse.move(a.x, a.y, { steps: 4 });
    await settle();
    const m = mid ? await mid() : null;
    await page.mouse.up();
    await settle();
    return m;
  };
  const e1 = await edge(1);
  const yLow = e1.y1 - 2;
  const ink0 = await darkXs(e1.x - 40, e1.x + 60, yLow);
  const a1 = await clientOf(e1.x + 1, (e1.y0 + e1.y1) / 2), a1b = await clientOf(e1.x + 31, (e1.y0 + e1.y1) / 2);
  const d0 = await dragSt();
  const mid1 = await dragBy(a1, a1b.x - a1.x, { mid: dragSt });
  await until((n) => window.__doc('Td').view.undoDepth === n, d0.depth + 1);
  await settle();
  const d1 = await dragSt();
  const ink1 = await darkXs(e1.x - 40, e1.x + 60, yLow);
  ok('during a border drag a dashed line is drawn where the border goes (30 px right)', mid1.dragging && mid1.ghost
    && near(mid1.ghost.x, e1.x + 30, 1.5), mid1);
  ok('a real drag of the border between columns 1 and 2 by 30 px: one undo step, grid 3450 / 2550 / 3000, every cell\'s '
    + 'tcW in both columns (the pct one dxa now), column 3 kept',
  d1.depth === d0.depth + 1 && same(d1.grid, [3450, 2550, 3000]) && same(d1.tcW, [[[3450, 'dxa'], [2550, 'dxa'], [3000, 'dxa']],
    [[3450, 'dxa'], [2550, 'dxa'], [3000, 'dxa']]]) && d1.ghost === null && !d1.dragging, { d0, d1 });
  ok('the border\'s pixels moved 30 px', ink0.some((x) => near(x, e1.x, 1.5)) && !ink1.some((x) => near(x, e1.x, 1.5))
    && ink1.some((x) => near(x, e1.x + 30, 1.5)), { ink0, ink1, x: e1.x });
  await undo('Td', d0.depth);
  const d2 = await dragSt();
  ok('Ctrl-Z: the widths back', same(d2.grid, [3000, 3000, 3000]) && same(d2.tcW[1][1], [1666, 'pct']), d2);

  const mid3 = await dragBy(a1, 40, { mid: async () => {
    const before = await dragSt();
    await page.keyboard.press('Escape');
    await settle();
    const after = await dragSt();
    await page.mouse.move(a1.x + 80, a1.y, { steps: 3 });
    return { before, after };
  } });
  const d3 = await dragSt();
  ok('Escape mid-drag: the line gone, then nothing changed, no undo step, no beep', mid3.before.dragging
    && mid3.after.ghost === null && !mid3.after.dragging && d3.depth === d2.depth && same(d3.grid, d2.grid)
    && d3.beeps === d2.beeps, { mid3, d3 });

  await dragBy(a1, 40, { back: true });
  const d4 = await dragSt();
  ok('a drag back to its start: no step, nothing changed', d4.depth === d2.depth && same(d4.grid, d2.grid), d4);

  const e3 = await edge(3, 1);
  const a3 = await clientOf(e3.x - 1, (e3.y0 + e3.y1) / 2), a3b = await clientOf(e3.x + 49, (e3.y0 + e3.y1) / 2);
  await dragBy(a3, a3b.x - a3.x);
  await until((n) => window.__doc('Td').view.undoDepth === n, d2.depth + 1);
  const d5 = await dragSt();
  ok('the right edge +50 px: the last column 3750 and its cells\' tcW, the others kept, tblW auto kept', same(d5.grid,
    [3000, 3000, 3750]) && same(d5.tcW.map((row) => row[2]), [[3750, 'dxa'], [3750, 'dxa']]) && d5.tblW
    && d5.tblW.type === 'auto', d5);
  await undo('Td', d2.depth);

  await ev(async () => { const d = window.__doc('Td'); d.setZoom(200); await window.__frames(3); d.win.scrollTo(0, 0); await window.__frames(3); });
  const z1 = await edge(1);
  const za = await clientOf(z1.x + 1, (z1.y0 + z1.y1) / 2), zb = await clientOf(z1.x + 2.5, (z1.y0 + z1.y1) / 2);
  const z0 = await dragSt();
  await dragBy(za, 30 * (za.x - (await clientOf(z1.x, z1.y0)).x) / 2);
  await until((n) => window.__doc('Td').view.undoDepth === n, z0.depth + 1);
  const zd = await dragSt();
  ok('at 200%: a press 2 screen px from the border drags it, 30 screen px = 15 layout px (grid 3225 / 2775)',
    zd.depth === z0.depth + 1 && same(zd.grid, [3225, 2775, 3000]), { z0, zd });
  await undo('Td', z0.depth);
  await dragBy(zb, 30 * (za.x - (await clientOf(z1.x, z1.y0)).x) / 2);
  const ze = await dragSt();
  ok('... one 5 screen px away is a text drag: a selection, no step, the widths kept', ze.depth === z0.depth
    && same(ze.grid, [3000, 3000, 3000]) && !ze.collapsed, ze);
  await ev(async () => { const d = window.__doc('Td'); d.setZoom(100); await window.__frames(3); });
  await show('Tf');
  }


  // ---------------------------------------------------- row edges dragged, the ruler in a cell (C5.4)
  {
  await show('Td');
  await ev(() => window.__sel('Td', 'd00', 0));
  await settle();
  const rowSt = (leaf) => ev((leaf) => {
    const d = window.__doc(leaf), v = d.dw.view, t = d.d.doc.sections[0].blocks.find((x) => x.type === 'tbl');
    const it = v.L.items.find((x) => x.kind === 'tbl');
    return { depth: d.view.undoDepth, beeps: window.__beeps, trH: t.rows.map((row) => row.trPr.trHeight ?? null),
      ghost: v.tblGhost ?? null, dragging: !!v.tblDrag, rows: it.rows.map((row) => ({ y: row.y, h: row.h })),
      x: it.x + it.left, w: it.key.cols.reduce((a, b) => a + b, 0), z: v.zoom, top: v.L.top };
  }, leaf);
  const clientAt = (leaf, lx, ly) => ev(([leaf, lx, ly]) => {
    const d = window.__doc(leaf), v = d.dw.view, z = v.zoom, t = v.L.top;
    return window.__client(d.win, lx * z, t + (ly - t) * z);
  }, [leaf, lx, ly]);
  /** The layout y of the dark pixels in a 1-px column at layout x between y0 and y1 (the border lines). */
  const darkYs = (leaf, x, y0, y1) => ev(([leaf, x, y0, y1]) => {
    const d = window.__doc(leaf), win = d.win, v = d.dw.view, z = v.zoom, t = v.L.top;
    const cv = win._canvas, k = cv.width / win.w;
    const X = Math.floor((x * z - win.scrollX) * k), Y0 = Math.floor((t + (y0 - t) * z - win.scrollY) * k);
    const H = Math.ceil((y1 - y0) * z * k);
    const a = cv.getContext('2d').getImageData(X, Y0, 1, H).data, ys = [];
    for (let i = 0; i < H; i++) if (a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] < 300) ys.push(y0 + i / k / z);
    return ys;
  }, [leaf, x, y0, y1]);
  const apart2 = () => page.waitForFunction(() => !os.wimp._lastClick
    || performance.now() - os.wimp._lastClick.t > os.input.config.doubleClickMs + 20, null, { timeout: 5000 });
  const dragXY = async (a, dx, dy, { mid, back = false } = {}) => {
    await apart2();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 3 });
    await page.mouse.move(a.x + dx, a.y + dy, { steps: 3 });
    if (back) await page.mouse.move(a.x, a.y, { steps: 4 });
    await settle();
    const m = mid ? await mid() : null;
    await page.mouse.up();
    await settle();
    return m;
  };
  const s0 = await rowSt('Td');
  const row0 = s0.rows[0], xm = s0.x + 1500 / 15 - 30, yb = row0.y + row0.h;
  const b0 = await clientAt('Td', xm, yb), b20 = await clientAt('Td', xm, yb + 20);
  const ys0 = await darkYs('Td', xm, yb - 6, yb + 30);
  const midR = await dragXY(b0, 0, b20.y - b0.y, { mid: () => rowSt('Td') });
  await until((n) => window.__doc('Td').view.undoDepth === n, s0.depth + 1);
  await settle();
  const s1 = await rowSt('Td');
  const ys1 = await darkYs('Td', xm, yb - 6, yb + 30);
  ok('during a row drag a dashed horizontal line is drawn where the border goes (20 px down)', midR.dragging && midR.ghost
    && near(midR.ghost.y, yb + 20, 1.5) && midR.ghost.w === s0.w && midR.ghost.h === undefined, midR);
  ok('a real drag of row 1\'s bottom border 20 px down: one undo step, trHeight atLeast the new height, the other row '
    + 'untouched', s1.depth === s0.depth + 1 && s1.trH[0] && s1.trH[0].hRule === 'atLeast'
    && near(s1.trH[0].val, Math.round((row0.h + 20) * 15), 8) && s1.trH[1] === null && near(s1.rows[0].h, row0.h + 20, 1)
    && s1.ghost === null && !s1.dragging, { s0, s1 });
  ok('the border\'s pixels moved 20 px down', ys0.some((y) => near(y, yb, 1.5)) && !ys1.some((y) => near(y, yb, 1.5))
    && ys1.some((y) => near(y, yb + 20, 1.5)), { ys0, ys1, yb });
  await undo('Td', s0.depth);
  const s2 = await rowSt('Td');
  ok('Ctrl-Z: the row back, no trHeight', s2.trH[0] === null && near(s2.rows[0].h, row0.h, 0.01), s2);
  const midE = await dragXY(b0, 0, 30, { mid: async () => {
    const before = await rowSt('Td');
    await page.keyboard.press('Escape');
    await settle();
    const after = await rowSt('Td');
    await page.mouse.move(b0.x, b0.y + 60, { steps: 3 });
    return { before, after };
  } });
  const s3 = await rowSt('Td');
  ok('Escape mid-drag: the line gone, nothing changed, no undo step, no beep', midE.before.dragging && midE.after.ghost === null
    && !midE.after.dragging && s3.depth === s2.depth && same(s3.trH, s2.trH) && s3.beeps === s2.beeps, { midE, s3 });
  await dragXY(b0, 0, 30, { back: true });
  const s4 = await rowSt('Td');
  ok('a row drag back to its start: no step', s4.depth === s2.depth && same(s4.trH, s2.trH), s4);

  await show('Te');
  await ev(() => window.__sel('Te', 'x10', 0));
  await settle();
  const e0 = await rowSt('Te'), er = e0.rows[0], eb = er.y + er.h;
  const c0 = await clientAt('Te', e0.x + 20, eb), c20 = await clientAt('Te', e0.x + 20, eb + 20);
  await dragXY(c0, 0, c20.y - c0.y);
  await until((n) => window.__doc('Te').view.undoDepth === n, e0.depth + 1);
  const e1s = await rowSt('Te');
  ok('an exact row stays exact: 600 -> exact at the dragged height, the other row kept', e1s.depth === e0.depth + 1
    && e1s.trH[0].hRule === 'exact' && near(e1s.trH[0].val, 600 + 300, 8) && e1s.trH[1] === null
    && near(e1s.rows[0].h, er.h + 20, 1), { e0, e1s });
  await undo('Te', e0.depth);

  // The ruler in a cell: its markers over the cell's text area.
  await show('Td');
  await ev(() => window.__sel('Td', 'd11', 0));
  await settle();
  const rul = () => ev(() => {
    const d = window.__doc('Td'), ru = d.dw.rb.ruler, v = d.dw.view, it = v.L.items.find((x) => x.kind === 'tbl');
    const c = it.rows[1].cells[1], z = v.zoom;
    const at = (tw) => window.__client(ru.pane, ru._x(tw), 10).x;
    const m = Object.fromEntries(ru.markers.map((k) => [k.id, k.twips]));
    return { on: d.dw.rulerOn, m, left: at(m.left), cellX: window.__client(d.win, c.tx * z, 0).x,
      textTw: Math.round(c.tw * 15), cols: ru.markers.filter((k) => /col/i.test(k.id)).length, depth: d.view.undoDepth,
      ind: d.d.doc.sections[0].blocks.find((x) => x.type === 'tbl').rows[1].cells[1].blocks[0].pPr?.ind ?? null,
      px: (tw) => 0 };
  });
  const q0 = await rul();
  ok('with the caret in a cell the ruler\'s left marker sits over the cell\'s text, right marker at its width, no column '
    + 'markers', q0.on && near(q0.left, q0.cellX, 1.5) && near(q0.m.right, q0.textTw, 2) && q0.cols === 0, q0);
  const mk0 = await ev(() => {
    const ru = window.__doc('Td').dw.rb.ruler, m = ru.markers.find((k) => k.id === 'left');
    return { ...window.__client(ru.pane, ru._x(m.twips), ru.height - 2), to: window.__client(ru.pane, ru._x(720), ru.height - 2) };
  });
  await dragXY(mk0, mk0.to.x - mk0.x, 0);
  await until((n) => window.__doc('Td').view.undoDepth === n, q0.depth + 1);
  await settle();
  const q1 = await rul();
  ok('a real drag of the left marker 0.5 in: one undo step, the cell paragraph\'s indent 720 relative to the cell, the box '
    + 'follows', q1.depth === q0.depth + 1 && q1.ind && q1.ind.left === 720 && near(q1.m.left, 720, 2), q1);
  await undo('Td', q0.depth);
  await show('Tf');
  }

  // ---------------------------------------------------- a percentage width: Table width blank, the field shaded
  {
  await show('Tp');
  await ev(() => window.__sel('Tp', 'p00', 1));
  await settle();
  const tpSt = () => ev(() => {
    const d = window.__doc('Tp'), t = d.d.doc.sections[0].blocks.find((x) => x.type === 'tbl');
    return { depth: d.view.undoDepth, beeps: window.__beeps, box: d.dw.boxes.has('tblprops'),
      tblW: JSON.parse(JSON.stringify(t.tblPr.tblW ?? null)) };
  });
  const shadedW = () => ev(() => window.__api('Tp').win.iconByName('width').shaded);
  await openBox('Tp');
  const pv = await vals('Tp'), ps0 = await shadedW();
  ok('a table 100% wide (pct): Table width blank and the width field shaded', pv.widthMode === undefined
    && pv.width === undefined && ps0 === true, { pv, ps0 });
  const pa = await tpSt();
  await ev(() => window.__api('Tp').set('width', 7200));
  await clickOK('Tp');
  await until((n) => window.__beeps > n, pa.beeps);
  const pb = await tpSt(), pm = await boxMsg('Tp');
  ok('... a width there with neither Auto nor Length: OK beeps, says "Choose Auto or Length", keeps the box, nothing '
    + 'changed', pb.beeps === pa.beeps + 1 && pb.box && pb.depth === pa.depth && same(pb.tblW, pa.tblW)
    && /Choose Auto or Length for the table width/.test(pm), { pa, pb, pm });
  await popup('Tp', 'widthMode', 'Length');
  const ps1 = await shadedW();
  await field('Tp', 'width', '5');
  await clickOK('Tp');
  await until((n) => window.__doc('Tp').view.undoDepth === n, pa.depth + 1);
  const pc = await tpSt();
  ok('... Length chosen: the field is no longer shaded; 5 in + OK: one undo step, tblW 7200 dxa', ps1 === false
    && pc.depth === pa.depth + 1 && same(pc.tblW, { w: 7200, type: 'dxa' }) && !pc.box, { ps1, pc });
  await undo('Tp', pa.depth);

  // closing a document with both its table boxes open deletes them
  await show('Tc');
  await ev(() => window.__sel('Tc', 'b11', 1));
  await settle();
  await openBox('Tc');
  await choose('Tc', 'Format', 'Borders and shading...');
  await until(() => window.__doc('Tc').dw.boxes.has('borders'));
  const cl = await ev(async () => {
    const d = window.__doc('Tc'), w = window.__word().word;
    const a = w.dialog({ key: 'tblprops:' + d.docKey, rows: [] }), b = w.dialog({ key: 'borders:' + d.docKey, rows: [] });
    const n = os.wimp.windows.size, wins = [a.win, b.win], m = window.__msgs.length;
    d.dw.close();
    await window.__frames(3);
    return { gone: [a.gone, b.gone], inWimp: wins.map((x) => [...os.wimp.windows].includes(x)), fewer: n - os.wimp.windows.size,
      docs: w.docs.filter((x) => !x.closed && x.leaf === 'Tc').length, msgs: window.__msgs.length - m };
  });
  ok('closing the document with Table properties and Borders and shading open deletes both boxes; no errors',
    same(cl.gone, [true, true]) && same(cl.inWimp, [false, false]) && cl.fewer >= 3 && cl.docs === 0 && !cl.msgs, cl);
  await show('Tf');
  }

  // ---------------------------------------------------- 20 cycles leak nothing
  await ev(() => window.__sel('Tf', 'r0c0', 1));
  await settle();
  const w0 = await ev(() => [...os.wimp.windows].length);
  for (let i = 0; i < 20; i++) {
    await openBox('Tf');
    if (i % 2) await page.keyboard.press('Escape');
    else {
      const q = await boxIcon('Tf', 'button:Cancel');
      await page.mouse.click(q.x, q.y);
    }
    await until(() => !window.__doc('Tf').dw.boxes.has('tblprops'));
  }
  await settle();
  const w1 = await ev(() => [...os.wimp.windows].length);
  ok('20 open / close cycles (Escape and Cancel in turn) leak no window', w1 === w0 && !(await st('Tf')).box, { w0, w1 });

  ok('no console errors', !logs.some((l) => /PAGEERROR|error/i.test(l) && !/favicon/.test(l)), logs.slice(-5));
} catch (e) {
  out.push('FAIL exception ' + (e && e.stack || e));
}
console.log(out.join('\n'));
await browser.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
