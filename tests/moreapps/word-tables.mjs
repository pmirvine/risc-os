// !Word's tables in the real desktop (Batch C). C1 part: a Word table
// is read into the document's model (a typed table, ./TblRead): one
// 'tbl' item (C2.4); Left / Right go into its cells (C3.1: from the
// end of the paragraph before to its first cell, from its last cell
// to the paragraph after; its edges are not stops); Info counts
// it and the table nested in it ("2 tables"); a range holding it,
// copied (real Ctrl-C) and pasted (real Ctrl-V) in the same window
// (C6.1: a rectangle of its cells too, as a table of those cells),
// comes back whole as a second table (one undo step, fresh ids, the
// exact copy), Ctrl-Z takes it away, and the document saved then is
// the very bytes it was saved as before the paste; reopened, it reads
// the same. C2 part (C2.5): tables are drawn, checked by pixels: a
// Word-made 3x3 Table Grid table has black at every grid line and each
// cell's text inside its cell; Word's Grid Table 4 (themed colours, as
// Word writes it) shows its black header row, its grey band row and its
// #666666 grid; a merged cell has no line inside it; nestedTable(9)
// draws the depth-8 table and the 9th as the grey box; a 1000 x 5
// table opens in < 1.5 s (median of 5 opens) and a screen paints only
// the rows in view (task.word docs view.tables() painted); 200% zoom
// doubles the grid line spacing; a 4000 px table makes the work area
// as wide as its right edge and the window scrolls to its right border
// (C2 fix wave, D18 step 4). (C3 and later extend this suite.)
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';
import { p, r, buildDocx, documentXml, stylesXml, numberingXml, REL, R_NS } from './build-docx.mjs';
import { drawingXml, pngBytes, URIS } from './pic-fixtures.mjs';
import { tbl, tr, tc, tblDocx, bigTable, nestedTable, TABLE_NORMAL, TABLE_GRID, GRID_TABLE_4 } from './tbl-fixtures.mjs';
import { entries } from './docx-compare.mjs';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const bs = (id, name) => `<w:bookmarkStart w:id="${id}" w:name="${name}"/>`;
const be = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const NESTED = tbl([tr([tc(p(r('inner one'))), tc(p(r('inner two')))])]);
const TABLE = tbl([
  tr([tc([p(r('cell a')), NESTED, p()]), tc(p(r('cell b')))]),
  tr([tc(p(r('cell c'))), tc(p(r('cell d')))], { lead: bs(1, 'rows') }),
  be(1)]);
// C2.5: a Word-made 3x3 Table Grid table (tcW, tblW auto, tblLook as Word writes them), Word's Grid Table 4 (themed
// colours: text1 header fill, a tinted band fill, a tinted #666666 grid), a merged cell under Table Grid
const WGRID = [3005, 3005, 3006];
const wcell = (t, w, more = '') => tc(p(r(t)), { tcPr: `<w:tcW w:w="${w}" w:type="dxa"/>${more}` });
const LOOK = '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" '
  + 'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const GRID3 = tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => wcell(`r${i}c${j}`, WGRID[j])))),
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: WGRID });
const GT4 = tbl([['Name', 'Qty', 'Cost'], ['one', '1', '2'], ['two', '3', '4']].map((row) =>
  tr(row.map((t, j) => wcell(t, WGRID[j])))), { tblPr: '<w:tblStyle w:val="GridTable4"/>' + LOOK, grid: WGRID });
const MERGED = tbl([tr([wcell('wide', 6010, '<w:gridSpan w:val="2"/>'), wcell('c', 3006)]),
  tr([wcell('x', 3005), wcell('y', 3005), wcell('z', 3006)])], { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: WGRID });
// C2 fix wave (D18 step 4): a Table Grid table 4000 px wide (3 x 20000 twips), far wider than its page
const WIDE = tbl([0, 1].map((i) => tr([0, 1, 2].map((j) => wcell(`w${i}${j}`, 20000)))),
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [20000, 20000, 20000] });
// C2 fix wave (guide check): a picture (a red PNG, 96 x 48 px) and a numbered list ("1." "2.") in a table's cells
const NUMP = (t) => p(r(t), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
const CELLS = tbl([tr([tc(p('<w:r>' + drawingXml({ id: 1, embed: 'rIdP1', decl: false }) + '</w:r>')),
  tc([NUMP('first item'), NUMP('second item')])])], { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000] });
const TP = await buildDocx({
  'word/document.xml': documentXml(p(r('Cells')) + CELLS + p(), { rNs: R_NS,
    rootAttrs: ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" xmlns:pic="${URIS.pic}"` }),
  'word/styles.xml': stylesXml(TABLE_NORMAL + TABLE_GRID),
  'word/numbering.xml': numberingXml('<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/>'
    + '<w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>'
    + '</w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'),
  'word/media/image1.png': pngBytes(8, 4, { rgb: [255, 0, 0] }),
}, { docRels: [['rIdP1', REL('image'), 'media/image1.png']] });
const BIG = Array.from(await tblDocx(bigTable(1000, 5) + p()));
const files = {
  Tb: Array.from(await tblDocx(p(r('Before the table.')) + TABLE + p(r('After the table.')))),
  Tg: Array.from(await tblDocx(p(r('Grid')) + GRID3 + p(r('Four')) + GT4 + p(r('Merged')) + MERGED + p(),
    { styles: TABLE_NORMAL + TABLE_GRID + GRID_TABLE_4 })),
  Tn: Array.from(await tblDocx(nestedTable(9) + p())),
  Tp: Array.from(TP),
  Tw: Array.from(await tblDocx(p(r('Wide')) + WIDE + p(), { styles: TABLE_NORMAL + TABLE_GRID })),
  // a grid of zero widths: the layout measures the cells' text while the document is being opened (C7.1)
  Tz: Array.from(await tblDocx(p(r('Zero')) + tbl([tr([tc(p(r('a b c'))), tc(p(r('d e')))])], { grid: [0, 0] }) + p(r('End')))),
  Big1: BIG, Big2: BIG, Big3: BIG, Big4: BIG, Big5: BIG,
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const st = () => ev(() => window.__st());
/** The entries of a saved .docx whose bytes differ (docProps/core.xml holds the save time). */
async function diff(a, b) {
  const za = await entries(new Uint8Array(a)), zb = await entries(new Uint8Array(b));
  const names = [...new Set([...za.keys(), ...zb.keys()])].filter((n) => n !== 'docProps/core.xml');
  return names.filter((n) => !za.get(n) || !zb.get(n) || Buffer.compare(Buffer.from(za.get(n)), Buffer.from(zb.get(n))) !== 0);
}

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf = 'Tb') => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    /** The canvas pixel [r, g, b] at work-area (x, y). */
    window.__px = (x, y, leaf = 'Tb') => {
      const d = window.__doc(leaf), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const a = cv.getContext('2d').getImageData(Math.floor((x - win.scrollX) * k), Math.floor((y - win.scrollY) * k), 1, 1).data;
      return [a[0], a[1], a[2]];
    };
    window.__sel = (i, a, j = i, b = a, leaf = 'Tb') => {
      const d = window.__doc(leaf), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: a }, { id: L.items[j].id, off: b });
      d.dw.view.focus();
    };
    window.__st = (leaf = 'Tb') => {
      const d = window.__doc(leaf), v = d.view, L = v.layout, bl = d.d.doc.sections.flatMap((s) => s.blocks);
      const ids = [];
      const walk = (list) => list.forEach((b) => {
        if (b.type === 'p' || b.type === 'tbl') ids.push(b.id);
        if (b.type === 'tbl') b.rows.forEach((row) => row.cells.forEach((c) => walk(c.blocks)));
      });
      walk(bl);
      return { types: bl.map((b) => b.type), tblIds: bl.filter((b) => b.type === 'tbl').map((b) => b.id), ids,
        items: L.items.map((it) => ({ kind: it.kind, id: it.id, label: it.label ?? null })),
        head: v.selection.head, anchor: v.selection.anchor, depth: v.undoDepth, dirty: v.dirty, clip: d.clipboard,
        beeps: window.__beeps, summary: d.summary };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Tb');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 40, y: 40, w: 640, h: 420, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!window.__doc(), msgs: window.__msgs };
  }, files);
  ok('the document opens, no message', s0.ok && !s0.msgs.length, s0);

  // ---------------------------------------------------- read typed, shown as today's grey box
  const a0 = await st();
  ok('the table is a typed table in the model (type tbl, an id)', same(a0.types, ['p', 'tbl', 'p']) && Number.isInteger(a0.tblIds[0]), a0);
  ok('... one table item (C2.4) whose id is the table\'s, with today\'s label',
    same(a0.items.map((i) => i.kind), ['p', 'tbl', 'p']) && a0.items[1].id === a0.tblIds[0]
    && a0.items[1].label === '[table - preserved, not shown]', a0.items);
  const px = await ev(() => {
    const L = window.__doc().view.layout, it = L.items[1], c = it.rows[0].cells[1], row = it.rows[0];
    let ink = 0;
    for (let x = c.tx; x < c.x + c.w - 2; x += 1) for (let y = row.y + 2; y < row.y + row.h - 2; y += 1) {
      const q = window.__px(x, y);
      if (q[0] < 150 && q[1] < 150 && q[2] < 150) ink++;
    }
    const b = L.boxRect(it);
    return { fill: window.__px(b.x + b.w - 4, b.y + b.h - 3), ink, painted: window.__doc().view.tables()[0].painted };
  });
  ok('... drawn (C2.5): cell b\'s text in its cell, no grey box (white where the box was), its rows painted',
    same(px.fill, [255, 255, 255]) && px.ink > 20 && same(px.painted, [0, 1]), px);

  // ---------------------------------------------------- the caret goes into it (C3.1)
  const heads = [];
  await ev(() => window.__sel(0, 17));
  for (const k of ['ArrowRight', 'ArrowLeft']) { await press(k); heads.push((await st()).head); }
  await ev(() => window.__sel(2, 0));
  for (const k of ['ArrowLeft', 'ArrowRight']) { await press(k); heads.push((await st()).head); }
  const T = a0.tblIds[0], P0 = a0.items[0].id, P2 = a0.items[2].id;
  const cellIds = await ev(() => {
    const t = window.__doc().d.doc.sections[0].blocks[1];
    return [t.rows[0].cells[0].blocks[0].id, t.rows[1].cells[1].blocks[0].id];
  });
  ok('Right from the end of the paragraph before: the first cell\'s start; Left back; Left from the paragraph after: '
    + 'the last cell\'s end; Right back',
  same(heads.map((h) => [h.id, h.off]), [[cellIds[0], 0], [P0, 17], [cellIds[1], 6], [P2, 0]]), { heads, T, P0, P2 });

  // ---------------------------------------------------- Info
  const info = await ev(() => {
    const d = window.__doc(), m = d.win.menu({});
    const it = m.items.find((i) => i.text === 'Info');
    const iw = typeof it.submenu === 'function' ? it.submenu() : it.submenu;
    return { icons: iw.icons.map((i) => i.text), summary: d.summary };
  });
  ok('Info shows "2 tables" (the nested one counted): the Paragraphs field "9 (2 tables)", the summary',
    info.icons.includes('9 (2 tables)') && /^9 paragraphs, 2 tables/.test(info.summary ?? ''), info);

  // ---------------------------------------------------- copy and paste in the same window, undo, save
  const bytes0 = await ev(async () => Array.from(await window.__doc().dw.saveBytes()));
  await ev(() => window.__sel(0, 0, 2, 16));
  await press(MOD + '+c');
  await ev(() => window.__sel(2, 16));
  await press(MOD + '+v');
  await page.waitForFunction(() => window.__st().depth === 1, null, { timeout: 10000 });
  const c1 = await st();
  ok('a real copy and paste of the range holding it: the table comes back whole as a second table, one undo step',
    same(c1.types, ['p', 'tbl', 'p', 'tbl', 'p']) && c1.depth === 1 && c1.clip.last === 'exact'
    && same(c1.items.map((i) => i.kind), ['p', 'tbl', 'p', 'tbl', 'p']), c1);
  ok('... every id unique (tables and paragraphs at every depth), the source table\'s kept',
    c1.ids.length === new Set(c1.ids).size && c1.ids.length === 21 && c1.tblIds[0] === T && c1.tblIds[1] !== T, c1.ids);
  const pasted = await ev(() => {
    const t = window.__doc().d.doc.sections[0].blocks[3];
    return { rows: t.rows.length, lead: t.rows[1].lead.length, tail: t.tail.length,
      text: t.rows.map((row) => row.cells.map((c) => c.blocks.map((b) => b.type === 'p' ? b.text : b.type).join('|'))) };
  });
  ok('... its cells as the source\'s; the bookmark pair between rows not copied',
    same(pasted.text, [['cell a|tbl|', 'cell b'], ['cell c', 'cell d']]) && pasted.lead === 0 && pasted.tail === 0, pasted);
  await press('Control+z');
  const c2 = await st();
  ok('Ctrl-Z takes it away', same(c2.types, ['p', 'tbl', 'p']) && c2.depth === 0 && same(c2.ids, a0.ids), c2);
  const bytes1 = await ev(async () => Array.from(await window.__doc().dw.saveBytes()));
  const d1 = await diff(bytes0, bytes1);
  ok('... saved now: the very bytes it was saved as before the paste', d1.length === 0, d1);
  const back = await readDocx(new Uint8Array(bytes1));
  const kinds = back.sections[0].blocks.map((b) => b.type);
  ok('... reopened, it reads the same: a typed table, its nested one', same(kinds, ['p', 'tbl', 'p'])
    && back.sections[0].blocks[1].rows[0].cells[0].blocks[1].type === 'tbl', kinds);
  const r1 = await ev(async (bytes) => {
    os.vfs.writeFile('RAM::RamDisc0.$.Tb2', new Uint8Array(bytes), { filetype: 0xA7E });
    await os.filer.run('RAM::RamDisc0.$.Tb2');
    for (let i = 0; i < 200 && !window.__doc('Tb2'); i++) await window.__sleep(50);
    await window.__frames(3);
    return { st: window.__st('Tb2'), bytes: Array.from(await window.__doc('Tb2').dw.saveBytes()), msgs: window.__msgs };
  }, bytes1);
  ok('... opened again in !Word: the table item, and saved, the same bytes', same(r1.st.types, ['p', 'tbl', 'p'])
    && r1.st.items[1].kind === 'tbl' && !r1.msgs.length && (await diff(bytes0, r1.bytes)).length === 0, r1.st);

  // ---------------------------------------------------- C6.1: a cell rectangle copied (real Ctrl-C / Ctrl-V)
  await ev(() => {
    const d = window.__doc(), t = d.d.doc.sections[0].blocks[1];
    const b = t.rows[0].cells[1].blocks[0], e = t.rows[1].cells[1].blocks[0];
    d.view.setSelection({ id: b.id, off: 0 }, { id: e.id, off: 2 });
    d.dw.view.focus();
  });
  await press(MOD + '+c');
  await ev(() => window.__sel(2, 16));
  await press(MOD + '+v');
  await page.waitForFunction(() => window.__st().depth === 1, null, { timeout: 10000 });
  const c6 = await ev(() => {
    const bl = window.__doc().d.doc.sections[0].blocks, t = bl[3];
    return { st: window.__st(), grid: t && t.grid, text: t && t.rows && t.rows.map((row) =>
      row.cells.map((c) => c.blocks.map((b) => b.type === 'p' ? b.text : b.type).join('|'))) };
  });
  ok('C6.1: cells b..d copied (a column of a 2 x 2 table) and pasted: a 2 x 1 table of those cells, its grid one '
    + 'column, one undo step', same(c6.st.types, ['p', 'tbl', 'p', 'tbl', 'p']) && c6.st.clip.last === 'exact'
    && same(c6.text, [['cell b'], ['cell d']]) && same(c6.grid, [2000])
    && c6.st.ids.length === new Set(c6.st.ids).size, c6);
  await press('Control+z');
  const c7 = await st();
  ok('... Ctrl-Z takes it away', same(c7.types, ['p', 'tbl', 'p']) && c7.depth === 0 && same(c7.ids, a0.ids), c7);

  // ==================================================== C2.5: tables drawn, checked by pixels
  await ev(async () => {
    /** Open leaf (in the window place of the suite) and wait for its first table to be painted. */
    window.__openTable = async (leaf) => {
      const t0 = performance.now();
      await os.filer.run('RAM::RamDisc0.$.' + leaf);
      const done = () => window.__doc(leaf)?.view.tables().some((t) => t.painted);
      while (!done() && performance.now() - t0 < 30000) await window.__frames(1);
      return performance.now() - t0;
    };
    /** Show leaf's window with work-area y at its top. */
    window.__show = async (leaf, y) => {
      window.__doc(leaf).win.open({ x: 40, y: 40, w: 640, h: 560, behind: 'top', scrollX: 0, scrollY: Math.max(0, Math.round(y)) });
      await window.__frames(3);
    };
    /** Layout -> the window's work area at the document's zoom. */
    window.__ws = (x, y, leaf) => {
      const d = window.__doc(leaf), z = d.zoom / 100, t = d.view.layout.top;
      return { x: x * z, y: t + (y - t) * z };
    };
    /** A dark pixel ([r, g, b] each < lim) within d px of layout (x, y), across (dx) or down (dy). */
    window.__dark = (leaf, x, y, along, lim = 80, d = 2) => {
      for (let k = -d; k <= d; k++) {
        const q = along === 'x' ? window.__px(x + k, y, leaf) : window.__px(x, y + k, leaf);
        if (q[0] < lim && q[1] < lim && q[2] < lim) return true;
      }
      return false;
    };
    /** The top-level table items of leaf. */
    window.__tbls = (leaf) => window.__doc(leaf).view.layout.items.filter((it) => it.kind === 'tbl');
  });

  // ---------------------------------------------------- Table Grid: black grid lines, text in its cells
  const g0 = await ev(async () => {
    const ms = await window.__openTable('Tg');
    await window.__show('Tg', 0);
    const it = window.__tbls('Tg')[0], X0 = it.x + it.left, n = it.rows.length;
    const ys = [...it.rows.map((row) => row.y), it.rows[n - 1].y + it.rows[n - 1].h];
    const xs = [X0, ...it.rows[0].cells.map((c) => c.x + c.w)];
    const missH = [], missV = [], noInk = [];
    for (const [r, Y] of ys.entries()) for (const c of it.rows[0].cells) {
      if (!window.__dark('Tg', c.x + c.w / 2, Y, 'y')) missH.push([r, c.k]);
    }
    for (const row of it.rows) for (const [k, X] of xs.entries()) {
      if (!window.__dark('Tg', X, row.y + row.h / 2, 'x')) missV.push([row.cells[0].r, k]);
    }
    for (const row of it.rows) for (const c of row.cells) {
      let ink = 0;
      for (let x = c.tx; x < c.x + c.w - 3; x++) for (let y = row.y + 3; y < row.y + row.h - 3; y++) {
        const q = window.__px(x, y, 'Tg');
        if (q[0] < 120 && q[1] < 120 && q[2] < 120) ink++;
      }
      if (ink < 15) noInk.push([c.r, c.k, ink]);
    }
    const mid = window.__px(xs[1] - 6, it.rows[1].y + it.rows[1].h / 2, 'Tg');
    return { ms, rows: n, cols: xs.length - 1, missH, missV, noInk, mid, ys, xs };
  });
  ok('Table Grid 3x3 (Word-made): a black pixel at every grid line (4 across x 3 cells, 4 down x 3 rows)',
    g0.rows === 3 && g0.cols === 3 && !g0.missH.length && !g0.missV.length, g0);
  ok('... each cell\'s text inside its cell (ink in every text area); white beside it', !g0.noInk.length
    && same(g0.mid, [255, 255, 255]), g0);

  // ---------------------------------------------------- Grid Table 4 (themed): header fill, band fill, grid colour
  const g1 = await ev(async () => {
    const it0 = window.__tbls('Tg')[1];
    await window.__show('Tg', it0.y - 30);
    const it = window.__tbls('Tg')[1], [h, b1, b2] = it.rows;
    const at = (row, k) => { const c = row.cells[k]; return window.__px(c.x + c.w / 2, row.y + row.h / 2, 'Tg'); };
    const inner = window.__px(b1.cells[1].x, b1.y + b1.h / 2, 'Tg');
    const near = (q, v) => q.every((x) => Math.abs(x - v) <= 2);
    let grid = false;
    for (let k = -2; k <= 2; k++) if (near(window.__px(b1.cells[1].x + k, b1.y + b1.h / 2, 'Tg'), 0x66)) grid = true;
    let headInner = false;
    const seam = [];
    for (let k = -2; k <= 2; k++) {
      const q = window.__px(h.cells[1].x + k, h.y + h.h / 2, 'Tg');
      seam.push(q);
      if (!near(q, 0)) headInner = true;
    }
    return { head: [at(h, 0), at(h, 1), at(h, 2)], band1: at(b1, 1), band2: at(b2, 1), inner, grid, headInner, seam };
  });
  ok('Grid Table 4 (Word\'s, themed): the header row\'s shading (text1, black) at its cells\' centres; band 1 '
    + '#cccccc, band 2 white', g1.head.every((q) => same(q, [0, 0, 0])) && same(g1.band1, [204, 204, 204])
    && same(g1.band2, [255, 255, 255]), g1);
  ok('... its inside grid line #666666 in the body; no inside line in the header (insideV nil)', g1.grid && !g1.headInner, g1);

  // ---------------------------------------------------- a merged cell spans: no line inside it
  const g2 = await ev(async () => {
    const it0 = window.__tbls('Tg')[2];
    await window.__show('Tg', it0.y - 30);
    const it = window.__tbls('Tg')[2], [a, b] = it.rows, X = b.cells[1].x;
    return { inMerged: window.__dark('Tg', X, a.y + a.h / 2, 'x'), below: window.__dark('Tg', X, b.y + b.h / 2, 'x'),
      after: window.__dark('Tg', a.cells[1].x, a.y + a.h / 2, 'x') };
  });
  ok('a merged cell (gridSpan 2) spans: no border pixel inside it; the line in the row below and after it',
    !g2.inMerged && g2.below && g2.after, g2);

  // ---------------------------------------------------- 200% zoom doubles the grid line spacing
  const runs = async () => ev(async () => {
    const it = window.__tbls('Tg')[0], c = it.rows[0].cells[0], x = c.x + c.w / 2;
    const n = it.rows.length, y0 = it.rows[0].y - 6, y1 = it.rows[n - 1].y + it.rows[n - 1].h + 6;
    const a = window.__ws(x, y0, 'Tg'), b = window.__ws(x, y1, 'Tg');
    const starts = [];
    let inRun = false;
    for (let y = Math.floor(a.y); y <= Math.ceil(b.y); y++) {
      const q = window.__px(a.x, y, 'Tg'), dark = q[0] < 80 && q[1] < 80 && q[2] < 80;
      if (dark && !inRun) starts.push(y);
      inRun = dark;
    }
    return starts;
  });
  await ev(() => window.__show('Tg', 0));
  const z1 = await runs();
  await ev(async () => { window.__doc('Tg').setZoom(200); await window.__frames(3); await window.__show('Tg', 0); });
  await page.waitForFunction(() => window.__doc('Tg').view.zoom === 2, null, { timeout: 10000 });
  const z2 = await runs();
  const gap = (s) => s.slice(1).map((v, i) => v - s[i]);
  ok('200% zoom doubles the grid line spacing (4 lines both times; each gap 2x within 2 px)',
    z1.length === 4 && z2.length === 4 && gap(z1).every((d, i) => Math.abs(gap(z2)[i] - 2 * d) <= 2), { z1, z2 });
  await ev(async () => { window.__doc('Tg').setZoom(100); await window.__frames(3); });

  // ---------------------------------------------------- nestedTable(9): depth 8 drawn, the 9th a grey box
  const n9 = await ev(async () => {
    await window.__openTable('Tn');
    await window.__show('Tn', 0);
    const L = window.__doc('Tn').view.layout;
    let box = null;
    const walk = (items) => items.forEach((it) => {
      if (it.kind === 'box') box = it;
      if (it.kind === 'tbl') it.rows.forEach((row) => row.cells.forEach((c) => walk(c.col.items)));
    });
    walk(L.items);
    const b = box && L.boxRect(box);
    const t = window.__doc('Tn').view.tables();
    return { depths: t.map((x) => x.depth), painted: t.map((x) => x.painted),
      grey: b && window.__px(b.x + b.w - 4, b.y + b.h - 4, 'Tn'), b };
  });
  ok('nestedTable(9): tables at depths 1..8 all painted; the 9th is the grey box (#eeeeee inside)',
    same(n9.depths, [1, 2, 3, 4, 5, 6, 7, 8]) && n9.painted.every((x) => same(x, [0, 0]))
    && same(n9.grey, [238, 238, 238]), n9);

  // ---------------------------------------------------- a picture and list numbers in cells are shown (the guide says so)
  const tp = await ev(async () => {
    await window.__openTable('Tp');
    await window.__show('Tp', 0);
    const it = window.__tbls('Tp')[0], [a, b] = it.rows[0].cells;
    const pic = a.col.items[0].lines[0].items.find((x) => x.kind === 'pic');
    const ln = a.col.items[0].lines[0], top = a.col.items[0].y + ln.y;
    const red = (q) => q[0] > 200 && q[1] < 60 && q[2] < 60;
    let at = null;
    for (let k = 0; k < 300 && !at; k++) {
      if (pic) {
        const q = window.__px(a.col.x + pic.x + pic.pic.w / 2, top + ln.base - pic.pic.h / 2, 'Tp');
        if (red(q)) at = q;
      }
      if (!at) await window.__frames(1);
    }
    const labels = b.col.items.map((x) => x.lines[0].label?.text ?? null);
    const ink = (x) => {
      const l = x.lines[0], lb = l.label;
      let n = 0;
      for (let px = x.x + lb.x; px < x.x + lb.x + lb.w; px++) for (let py = x.y + l.y; py < x.y + l.y + l.h; py++) {
        const q = window.__px(px, py, 'Tp');
        if (q[0] < 120 && q[1] < 120 && q[2] < 120) n++;
      }
      return n;
    };
    return { pic: !!pic, at, labels, ink: b.col.items.map(ink), msgs: window.__msgs };
  });
  ok('a picture in a cell is laid out in its line and drawn (its red pixels in the cell)', tp.pic && !!tp.at, tp);
  ok('... list numbers in a cell are shown ("1." and "2.", ink where each label is)', same(tp.labels, ['1.', '2.'])
    && tp.ink.every((n) => n > 3) && !tp.msgs.length, tp);

  // ---------------------------------------------------- a table wider than the page: the window scrolls to its end
  const wd = await ev(async () => {
    await window.__openTable('Tw');
    await window.__show('Tw', 0);
    const d = window.__doc('Tw'), w = d.win, it = window.__tbls('Tw')[0], row = it.rows[0];
    const right = it.x + it.left + it.width, page = d.view.layout.pageLeft + d.view.layout.pageW;
    w.open({ x: 40, y: 40, w: 640, h: 560, behind: 'top', scrollX: w.extent.x1 - 640, scrollY: 0 });
    await window.__frames(3);
    const y = row.y + row.h / 2;
    return { x1: w.extent.x1, right, page, width: it.width, scrollX: w.scrollX,
      inView: right - 1 >= w.scrollX && right + 1 < w.scrollX + w.w,
      edge: window.__dark('Tw', right - 1, y, 'x'), inside: window.__px(right - 10, y, 'Tw') };
  });
  ok('a 4000 px table (wider than its page): the work area reaches its right edge + 24 px', wd.width === 4000
    && wd.right > wd.page && wd.x1 >= Math.ceil(wd.right + 24), wd);
  ok('... scrolled to the right end: its right border is drawn there, in view (no ink inside the cell beside it, the '
    + 'desk\'s grey beyond the page)', wd.scrollX > wd.page && wd.inView && wd.edge && wd.inside.every((v) => v > 120), wd);

  // ---------------------------------------------------- a 1000 x 5 table: opens < 1.5 s; a screen paints its rows only
  const big = await ev(async () => {
    const ms = [];
    for (let i = 1; i <= 5; i++) {
      ms.push(await window.__openTable('Big' + i));
      if (i < 5) {
        window.__doc('Big' + i).requestClose();
        for (let k = 0; k < 600 && window.__doc('Big' + i); k++) await window.__frames(1);
      }
    }
    ms.sort((a, b) => a - b);
    const view = (leaf) => {
      const d = window.__doc(leaf), w = d.win, it = window.__tbls(leaf)[0];
      const y0 = w.scrollY, y1 = w.scrollY + w.h;
      const vis = it.rows.map((row, r) => (row.y < y1 && row.y + row.h > y0 ? r : -1)).filter((r) => r >= 0);
      return { painted: d.view.tables()[0].painted, vis: [vis[0], vis.at(-1)] };
    };
    await window.__show('Big5', 0);
    const top = view('Big5');
    const it = window.__tbls('Big5')[0];
    await window.__show('Big5', it.rows[500].y);
    for (let k = 0; k < 300 && !(view('Big5').painted[0] >= 400); k++) await window.__frames(1);
    const mid = view('Big5');
    return { median: ms[2], ms, top, mid, msgs: window.__msgs };
  });
  const within = (v) => v.painted && v.painted[0] >= v.vis[0] - 1 && v.painted[1] <= v.vis[1] + 1
    && v.painted[1] - v.painted[0] < 45;
  ok('a 1000 x 5 table opens in < 1.5 s (median of 5 opens, until its first paint)', big.median < 1500, big.ms);
  ok('... a screen paints only the rows in view (at the top, and scrolled to row 500)', within(big.top)
    && within(big.mid) && big.mid.painted[0] >= 490 && !big.msgs.length, big);

  // ---------------------------------------------------- a grid of zero widths opens (C7.1)
  const zero = await ev(async () => {
    const m0 = window.__msgs.length;
    await window.__openTable('Tz');
    const d = window.__doc('Tz');
    return { open: !!d, types: d && d.d.doc.sections[0].blocks.map((b) => b.type), msgs: window.__msgs.slice(m0) };
  });
  ok('a table whose grid has zero widths opens (its cells\' text is measured while the window is being made), typed, with no message',
    zero.open && same(zero.types, ['p', 'tbl', 'p']) && !zero.msgs.length, zero);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
