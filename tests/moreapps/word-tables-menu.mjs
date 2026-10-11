// !Word's Insert > Table and the Table menu in the real desktop (Batch C4.4, D27, D30; real menu clicks, real keys,
// pixels). The window menu has Table after Format; its items (Insert table..., Insert >, Delete >, Select >, Merge
// cells, Split cells..., Split table, Distribute rows evenly, Distribute columns evenly, Tab) with Ctrl+Shift+Enter and
// Ctrl+Tab shown, every one but Insert table... shaded with the caret outside a table, Merge cells also with the caret in
// one cell and live with cells selected; Insert has Table... and Tab (shaded outside a cell). Insert > Table... (and
// Table > Insert table...: the same box, one per document) opens the box; Columns 4, Rows 3 typed with real keys and
// Return inserts a 3 x 4 table after the caret paragraph (one undo step): the grid fills the text width and the pixels
// show the grid lines; Ctrl-Z takes it away. Columns 0, 64, Rows 1001, text, a Fixed width of 23 in each beep, say
// why and keep the box, with nothing changed; Escape closes it (deleted with it). Every Table menu item runs its
// command on a caret in a table (3 x 3 grid): rows above / below, columns left / right, delete rows / columns / table,
// select cell / row / column / table (no undo step), merge cells (cells selected), Split cells... (opens its box),
// split table, distribute rows and columns, Tab (a tab character in the cell); one undo step each. 20 open / close
// cycles of the box (closed by Escape and Cancel in turn) leak nothing. C4 fix wave: the Fixed width with one column
// refuses 23, 0.05 and -1 in (never clamped); dotted lines make four groups in the Table menu; the caret moved while the
// box is open beeps once, and asking for the box again takes the new caret; Auto in a 2-column section fills the column.
// C6.4: Table > Convert > Text to table... on three tabbed lines (the box: Columns computed, the separator recomputes
// them; 0, 64, text and an Other of none or two characters beep and keep the box) draws a 3-column grid in one undo
// step; Table to text... (Escape changes nothing; Return converts back, Ctrl-Z restores the table).
// C6 fix B5 (the Convert box's contract): asked again in the same mode for another selection it is filled again for
// that one; the selection changed while it is open: OK beeps, says so and fills it again (the next OK converts); the
// mode switched while it is open (title, choices, Columns shaded, nothing carried over); the Cancel button; 20 open /
// close cycles (Escape and Cancel in turn) leak nothing; closing the document deletes it.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { tbl, tr, tc, tblDocx, TABLE_NORMAL, TABLE_GRID } from './tbl-fixtures.mjs';

const LOOK = '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" '
  + 'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const cell = (t, w = 3000) => tc(p(r(t)), { tcPr: `<w:tcW w:w="${w}" w:type="dxa"/>` });
const GRID3 = tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => (i === 2 && j === 1
  ? tc(p(r('c21')) + p(r('c21b')), { tcPr: '<w:tcW w:w="3000" w:type="dxa"/>' })
  : cell(`c${i}${j}`, [2000, 3000, 4000][j]))))),
{ tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [2000, 3000, 4000] });
const STYLES = { styles: TABLE_NORMAL + TABLE_GRID };
function TAB(...parts) {
  return p('<w:r>' + parts.map((t) => `<w:t>${t}</w:t>`).join('<w:tab/>') + '</w:r>');
}
const files = {
  Ta: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('alpha beta')) + p(r('gamma'))) })),
  Tb: Array.from(await tblDocx(p(r('Before')) + GRID3 + p(r('After')), STYLES)),
  Tc: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('cycles'))) })),
  // three tabbed lines (C6.4: Convert)
  Te: Array.from(await buildDocx({ 'word/document.xml': documentXml(
    TAB('a', 'b', 'c') + TAB('d', 'e') + p(r('f')) + p(r('tail'))) })),
  // comma lines, tab lines and a table (C6 fix B5: the Convert box's contract)
  Tf: Array.from(await tblDocx(p(r('p,q,r')) + p(r('s,t')) + TAB('u', 'v') + TAB('w', 'x') + p(r('mid'))
    + tbl([tr([cell('k1'), cell('k2')])], { tblPr: LOOK, grid: [3000, 3000] }) + p(r('end')))),
  // a 2-column section (C4 fix wave B2: Auto fills the column, 4153 twips)
  Td: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('two columns')) + '<w:sectPr><w:pgSz '
    + 'w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" '
    + 'w:footer="708" w:gutter="0"/><w:cols w:num="2" w:space="720"/></w:sectPr>') })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 1200)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const until = (src, arg) => page.waitForFunction(src, arg, { timeout: 8000 }).then(() => true, () => false);
const press = async (k) => { await page.keyboard.press(k); await settle(); };

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev((files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__client = (win, x, y) => { const s = win.workToScreen(x, y); return window.__screen(s.x, s.y); };
    window.__px = (x, y, leaf) => {
      const d = window.__doc(leaf), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const a = cv.getContext('2d').getImageData(Math.floor((x - win.scrollX) * k), Math.floor((y - win.scrollY) * k),
        1, 1).data;
      return [a[0], a[1], a[2]];
    };
    window.__beeps = 0;
    window.__beep = os.wimp.beep;
    const b = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return b(); };
    /** The state of leaf's document: blocks, the first table's shape, the head, the undo depth, the box. */
    window.__st = (leaf) => {
      const d = window.__doc(leaf), v = d.view, sec = d.d.doc.sections[0].blocks;
      const t = sec.find((b) => b.type === 'tbl');
      const h = v.selection.head, it = h && v.layout.byId.get(h.id);
      const name = (b) => (b.type === 'p' ? b.text : b.type);
      return { blocks: sec.map(name), rows: t ? t.rows.length : 0, grid: t ? t.grid.slice() : [],
        texts: t ? t.rows.map((row) => row.cells.map((c) => c.blocks.map((x) => x.text).join('|'))) : [],
        head: it ? `${it.kind === 'p' ? it.block.text : it.kind}:${h.off}` : null, depth: v.undoDepth,
        beeps: window.__beeps, tblins: d.dw.boxes.has('tblins'), tblsplit: d.dw.boxes.has('tblsplit'),
        hRule: t ? t.rows.map((row) => (row.trPr.trHeight ? row.trPr.trHeight.hRule : null)) : [] };
    };
    window.__sel = (leaf, a, ao, b, bo) => {
      const v = window.__doc(leaf).view, f = (t) => v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t).id;
      if (b === undefined) v.setSelection({ id: f(a), off: ao });
      else v.setSelection({ id: f(a), off: ao }, { id: f(b), off: bo });
    };
  }, files);
  await ev(() => os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word'));
  await page.waitForFunction(() => !!window.__word()?.word, null, { timeout: 20000 });
  for (const leaf of ['Ta', 'Tb', 'Tc', 'Td', 'Te', 'Tf']) {
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
  ok('the documents open, no message', !(await show('Tb')).length && !(await show('Tc')).length && !(await show('Ta')).length,
    await ev(() => window.__msgs));
  const st = (leaf) => ev((l) => window.__st(l), leaf);

  // ---------------------------------------------------- real menu clicks
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
  /** The rows of menu level n now open: [text, shaded, key]. */
  const rowsAt = (n) => ev((n) => {
    const lv = os.wimp.menus.levels[n], v = (x, it) => (typeof x === 'function' ? !!x(it) : !!x);
    return lv.menu.items.map((i) => [String(i.text), v(i.shaded, i), i.key === undefined ? null
      : String(typeof i.key === 'function' ? i.key() : i.key)]);
  }, n);
  const closeMenu = async () => {
    await ev(() => { if (os.wimp.menus.isOpen) os.wimp.menus.close(); });
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
  };
  /** Click through path (all but the last hovered), the menu then closes. */
  const choose = async (leaf, ...path) => {
    await openMenu(leaf);
    for (let i = 0; i < path.length - 1; i++) await pick(i, path[i], { hover: true });
    await pick(path.length - 1, path.at(-1));
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
    await settle();
  };
  const SHOWN = ['Insert table...', 'Insert', 'Delete', 'Select', 'Merge cells', 'Split cells...', 'Split table',
    'Distribute rows evenly', 'Distribute columns evenly', 'Cell alignment', 'Table properties...', 'Convert', 'Tab'];

  // ---------------------------------------------------- the menus, outside a table
  await show('Ta');
  await ev(() => window.__sel('Ta', 'alpha beta', 10));
  await settle();
  await openMenu('Ta');
  const top = (await rowsAt(0)).map((x) => x[0]);
  await pick(0, 'Table', { hover: true });
  const tm0 = await rowsAt(1);
  const dots = await ev(() => os.wimp.menus.levels[1].menu.items.filter((i) => i.dotted).map((i) => String(i.text)));
  // (a shaded submenu does not open: read it from its item)
  const sub0 = await ev(() => os.wimp.menus.levels[1].menu.items.find((i) => i.text === 'Insert').submenu().items
    .map((i) => [String(i.text), !!(typeof i.shaded === 'function' ? i.shaded() : i.shaded)]));
  await closeMenu();
  ok('the window menu has Table after Format; its items in order, Insert table... live, all the others shaded outside a '
    + 'table; Split table shows Ctrl+Shift+Enter, Tab Ctrl+Tab',
  same(top.slice(6, 10), ['Insert', 'Format', 'Table', 'Zoom']) && same(tm0.map((x) => x[0]), SHOWN)
    && same(tm0.map((x) => x[1]), SHOWN.map((t) => t !== 'Insert table...'))
    && tm0.find((x) => x[0] === 'Split table')[2] === 'Ctrl+Shift+Enter' && tm0.find((x) => x[0] === 'Tab')[2] === 'Ctrl+Tab'
    && same(sub0.map((x) => x[0]), ['Rows above', 'Rows below', 'Columns to the left', 'Columns to the right'])
    && sub0.every((x) => x[1]), { top, tm0, sub0 });
  ok('the Table menu in four groups: dotted lines after Select, Split table and Convert',
    same(dots, ['Select', 'Split table', 'Convert']), dots);
  await openMenu('Ta');
  await pick(0, 'Insert', { hover: true });
  const im = await rowsAt(1);
  await closeMenu();
  ok('Insert has Table... (live) and Tab (Ctrl+Tab, shaded outside a cell)',
    im.find((x) => x[0] === 'Table...') && !im.find((x) => x[0] === 'Table...')[1]
    && im.find((x) => x[0] === 'Tab')[1] && im.find((x) => x[0] === 'Tab')[2] === 'Ctrl+Tab'
    && im.findIndex((x) => x[0] === 'Table...') === im.findIndex((x) => x[0] === 'Section break') + 1, im);

  // ---------------------------------------------------- Insert > Table...
  const boxIcon = (leaf, n) => ev(([leaf, n]) => {
    const d = window.__doc(leaf), w = window.__word().word.dialog({ key: 'tblins:' + d.docKey, rows: [] }).win;
    const b = w.iconByName(n).bbox;
    return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, [leaf, n]);
  const boxMsg = (leaf) => ev((leaf) => {
    const d = window.__doc(leaf);
    return window.__word().word.dialog({ key: 'tblins:' + d.docKey, rows: [] }).win.iconByName('msg')?.text ?? null;
  }, leaf);
  const boxCount = () => ev(() => [...os.wimp.windows].filter((w) => w.title === 'Insert table').length);
  const field = async (leaf, n, text) => {
    const q = await boxIcon(leaf, n);
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction((n) => os.wimp.caret?.icon?.name === n, n, { timeout: 5000 });
    await page.keyboard.press('End');
    for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text);
    await settle();
  };
  const clickOK = async (leaf) => {
    const q = await boxIcon(leaf, 'button:OK');
    await page.mouse.click(q.x, q.y);
    await settle();
  };
  const before = await st('Ta');
  await choose('Ta', 'Insert', 'Table...');
  const open1 = await until(() => !!window.__doc('Ta').dw.boxes.has('tblins'));
  await settle();
  const dflt = await ev(() => {
    const d = window.__doc('Ta'), api = window.__word().word.dialog({ key: 'tblins:' + d.docKey, rows: [] });
    return { cols: api.get('cols'), rows: api.get('rows'), mode: api.get('mode') };
  });
  // the same box from Table > Insert table...
  await closeMenu();
  await choose('Ta', 'Table', 'Insert table...');
  const one = await boxCount();
  ok('Insert > Table... opens the box (Columns 2, Rows 2, Auto); Table > Insert table... brings the same box (one per '
    + 'document)', open1 && dflt.cols === 2 && dflt.rows === 2 && dflt.mode === 'auto' && one === 1, { open1, dflt, one });

  // invalid values: a beep, a message, the box kept, nothing changed
  const bad = [];
  const tryBad = async (what, set) => {
    const b0 = await st('Ta');
    await set();
    await clickOK('Ta');
    await until((n) => window.__beeps > n, b0.beeps);
    const b1 = await st('Ta');
    bad.push({ what, beeped: b1.beeps === b0.beeps + 1, box: b1.tblins, same: b1.depth === b0.depth
      && same(b1.blocks, b0.blocks), msg: await boxMsg('Ta') });
  };
  await tryBad('cols 0', async () => { await field('Ta', 'cols', '0'); });
  await tryBad('cols 64', async () => { await field('Ta', 'cols', '64'); });
  await field('Ta', 'cols', '4');
  await tryBad('rows 1001', async () => { await field('Ta', 'rows', '1001'); });
  await tryBad('rows abc', async () => { await field('Ta', 'rows', 'abc'); });
  await field('Ta', 'rows', '3');
  // the Fixed width with ONE column: the width field itself must refuse (never clamp: C4 fix wave B1)
  await field('Ta', 'cols', '1');
  {
    const q = await boxIcon('Ta', 'arrow:mode');
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction(() => os.wimp.menus.isOpen, null, { timeout: 5000 });
    await pick(0, 'Fixed');
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
  }
  await tryBad('width 23 in', async () => { await field('Ta', 'width', '23'); });
  await tryBad('width 0.05 in', async () => { await field('Ta', 'width', '0.05'); });
  await tryBad('width -1 in', async () => { await field('Ta', 'width', '-1'); });
  await field('Ta', 'cols', '4');
  await tryBad('4 columns of 6 in', async () => { await field('Ta', 'width', '6'); });
  ok('out-of-range or non-numeric Columns / Rows, a Fixed width of 23 in, 0.05 in or -1 in (one column: not clamped) and '
    + '4 columns of 6 in each beep, say why and keep the box; the document is unchanged',
  bad.length === 8 && bad.every((x) => x.beeped && x.box && x.same && x.msg.length > 5)
    && /1 to 63/.test(bad[0].msg) && /1 to 63/.test(bad[1].msg) && /1 to 1000/.test(bad[2].msg)
    && bad.slice(4, 7).every((x) => /0\.1 to 22 inches/.test(x.msg)) && /Too wide/.test(bad[7].msg),
  bad);

  // Auto again, then Return inserts a 3 x 4 table after the caret paragraph
  {
    const q = await boxIcon('Ta', 'arrow:mode');
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction(() => os.wimp.menus.isOpen, null, { timeout: 5000 });
    await pick(0, 'Auto');
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
  }
  const b2 = await st('Ta');
  await page.keyboard.press('Enter');
  await until((n) => window.__doc('Ta').view.undoDepth === n, b2.depth + 1);
  await settle();
  const a1 = await st('Ta');
  const geo = await ev(() => {
    const it = window.__doc('Ta').view.layout.items.find((x) => x.kind === 'tbl');
    return { rows: it.rows.map((row) => ({ y: row.y, h: row.h, xs: row.cells.map((c) => [c.x, c.w]) })),
      x: it.x, w: it.w, textW: window.__doc('Ta').view.layout.textW };
  });
  const dark = (x, y, dir) => ev(([x, y, dir]) => {
    let m = 765;
    for (let i = -3; i <= 3; i++) {
      const q = window.__px(dir === 'x' ? x + i : x, dir === 'y' ? y + i : y, 'Ta');
      m = Math.min(m, q[0] + q[1] + q[2]);
    }
    return m;
  }, [x, y, dir]);
  const midY = geo.rows[0].y + geo.rows[0].h / 2;
  const vert = [];
  for (const [x] of geo.rows[0].xs) vert.push(await dark(x, midY, 'x'));
  const lastR = geo.rows.at(-1), lastC = lastR.xs.at(-1);
  vert.push(await dark(lastC[0] + lastC[1], midY, 'x'));
  const horiz = [];
  for (const row of geo.rows) horiz.push(await dark(geo.rows[0].xs[1][0] + 20, row.y, 'y'));
  horiz.push(await dark(geo.rows[0].xs[1][0] + 20, lastR.y + lastR.h, 'y'));
  const sum = a1.grid.reduce((x, y) => x + y, 0);
  ok('Columns 4, Rows 3 and Return: a 3 x 4 table after the caret paragraph (one undo step), the grid filling the text '
    + 'width, the caret in its first cell, the box gone; the pixels show every column and row line',
  same(a1.blocks, ['alpha beta', 'tbl', 'gamma']) && a1.rows === 3 && a1.grid.length === 4
    && Math.abs(sum - geo.textW * 15) <= 1 && a1.depth === b2.depth + 1 && a1.head === ':0' && !a1.tblins
    && vert.length === 5 && vert.every((v) => v < 300) && horiz.length === 4 && horiz.every((v) => v < 300),
  { a1, geo: geo.rows[0], vert, horiz, sum });
  await page.keyboard.press('Control+z');
  await until((n) => window.__doc('Ta').view.undoDepth === n, b2.depth);
  await settle();
  const a2 = await st('Ta');
  ok('Ctrl-Z takes the table away (the styles too)', same(a2.blocks, before.blocks) && a2.depth === b2.depth
    && !(await ev(() => window.__doc('Ta').d.doc.styles.styles.has('TableGrid'))), a2);

  // a fixed width and Escape
  await choose('Ta', 'Insert', 'Table...');
  await until(() => !!window.__doc('Ta').dw.boxes.has('tblins'));
  await settle();
  await field('Ta', 'cols', '3');
  await field('Ta', 'rows', '1');
  {
    const q = await boxIcon('Ta', 'arrow:mode');
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction(() => os.wimp.menus.isOpen, null, { timeout: 5000 });
    await pick(0, 'Fixed');
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
  }
  await field('Ta', 'width', '1.5');
  const f0 = await st('Ta');
  await clickOK('Ta');
  await until((n) => window.__doc('Ta').view.undoDepth === n, f0.depth + 1);
  const f1 = await st('Ta');
  ok('a Fixed width of 1.5 in: three columns of 2160 twips, one undo step', same(f1.grid, [2160, 2160, 2160])
    && f1.depth === f0.depth + 1 && !f1.tblins, f1);
  await page.keyboard.press('Control+z');
  await until((n) => window.__doc('Ta').view.undoDepth === n, f0.depth);
  await choose('Ta', 'Insert', 'Table...');
  await until(() => !!window.__doc('Ta').dw.boxes.has('tblins'));
  await settle();
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Ta').dw.boxes.has('tblins'));
  await settle();
  const e1 = await st('Ta');
  ok('Escape closes the box, nothing changed; the box is gone', !e1.tblins && e1.depth === f0.depth
    && same(e1.blocks, before.blocks) && (await boxCount()) === 0, e1);

  // the caret moved while the box was open: OK beeps and says so; asking for the box again takes the new caret
  await choose('Ta', 'Insert', 'Table...');
  await until(() => !!window.__doc('Ta').dw.boxes.has('tblins'));
  await settle();
  await ev(() => window.__sel('Ta', 'gamma', 2));
  await settle();
  const g0 = await st('Ta');
  await clickOK('Ta');
  await until((n) => window.__beeps > n, g0.beeps);
  const g1 = await st('Ta'), gm = await boxMsg('Ta');
  await ev(() => window.__sel('Ta', 'alpha beta', 10));
  await settle();
  await choose('Ta', 'Table', 'Insert table...');
  const g2 = await st('Ta'), gm2 = await boxMsg('Ta');
  await clickOK('Ta');
  await until((n) => window.__doc('Ta').view.undoDepth === n, g2.depth + 1);
  await settle();
  const g3 = await st('Ta');
  ok('the caret moved while the box was open: OK beeps, says so and keeps the box; asking for the box again (the same '
    + 'box) takes the new caret: OK then inserts at once, with no beep',
  g1.beeps === g0.beeps + 1 && g1.tblins && g1.depth === g0.depth && /changed/.test(gm) && g2.tblins && gm2 === ''
    && g3.depth === g2.depth + 1 && g3.beeps === g2.beeps && !g3.tblins && same(g3.blocks, ['alpha beta', 'tbl', 'gamma']),
  { g0, g1, gm, g2, gm2, g3 });
  await page.keyboard.press('Control+z');
  await until((n) => window.__doc('Ta').view.undoDepth === n, g2.depth);
  await settle();

  // Auto in a 2-column section: the table is the column's width (4153 twips), not the page's
  await show('Td');
  await ev(() => window.__sel('Td', 'two columns', 11));
  await settle();
  await choose('Td', 'Insert', 'Table...');
  await until(() => !!window.__doc('Td').dw.boxes.has('tblins'));
  await settle();
  const d0 = await st('Td');
  await page.keyboard.press('Enter');
  await until((n) => window.__doc('Td').view.undoDepth === n, d0.depth + 1);
  await settle();
  const d1 = await st('Td');
  ok('Insert table with Auto width in a 2-column section: the two columns fill the section\'s column (4153 twips)',
    d1.rows === 2 && same(d1.grid, [2076, 2077]) && d1.depth === d0.depth + 1, d1);

  // ---------------------------------------------------- the Table menu on a caret in a table
  await show('Tb');
  const run = async (what, path, want, pre) => {
    if (pre) await pre();
    await settle();
    const s0 = await st('Tb');
    await choose('Tb', 'Table', ...path);
    const done = await until(([n, b]) => window.__doc('Tb').view.undoDepth === n || window.__beeps > b, [s0.depth + 1, s0.beeps]);
    await settle();
    const s1 = await st('Tb');
    ok(what, done && s1.depth === s0.depth + 1 && want(s1, s0), { s0, s1 });
    await page.keyboard.press('Control+z');
    await until((n) => window.__doc('Tb').view.undoDepth === n, s0.depth);
    await settle();
    return s1;
  };
  const caret = (t, off = 1) => async () => { await ev(([t, off]) => window.__sel('Tb', t, off), [t, off]); };
  await ev(() => window.__sel('Tb', 'Before', 6));
  await settle();
  await openMenu('Tb');
  await pick(0, 'Table', { hover: true });
  const outside = await rowsAt(1);
  await closeMenu();
  ok('outside the table (the caret in "Before"): every item but Insert table... shaded',
    same(outside.map((x) => x[1]), SHOWN.map((t) => t !== 'Insert table...')), outside);
  await caret('c11')();
  await openMenu('Tb');
  await pick(0, 'Table', { hover: true });
  const inside = await rowsAt(1);
  await pick(1, 'Delete', { hover: true });
  const dsub = await rowsAt(2);
  await closeMenu();
  ok('the caret in a cell: every item live but Merge cells (one cell); Delete > Rows, Columns, Table',
    same(inside.map((x) => [x[0], x[1]]), SHOWN.map((t) => [t, t === 'Merge cells']))
    && same(dsub.map((x) => x[0]), ['Rows', 'Columns', 'Table']) && dsub.every((x) => !x[1]), { inside, dsub });
  await ev(() => window.__sel('Tb', 'c00', 0, 'c11', 1));
  await settle();
  await openMenu('Tb');
  await pick(0, 'Table', { hover: true });
  const cellsSel = await rowsAt(1);
  await closeMenu();
  ok('cells (0,0)..(1,1) selected: Merge cells live', !cellsSel.find((x) => x[0] === 'Merge cells')[1], cellsSel);

  await run('Table > Insert > Rows above: a row above (one undo step), the caret stays', ['Insert', 'Rows above'],
    (s) => s.rows === 4 && s.head === 'c11:1' && s.texts[1].every((t) => t === '') && s.texts[2][1] === 'c11', caret('c11'));
  await run('Rows below', ['Insert', 'Rows below'], (s) => s.rows === 4 && s.texts[2].every((t) => t === ''), caret('c11'));
  await run('Columns to the left', ['Insert', 'Columns to the left'],
    (s) => s.grid.length === 4 && s.texts[0][1] === '' && s.texts[0][2] === 'c01', caret('c11'));
  await run('Columns to the right', ['Insert', 'Columns to the right'],
    (s) => s.grid.length === 4 && s.texts[0][2] === '' && s.texts[0][1] === 'c01', caret('c11'));
  await run('Delete > Rows', ['Delete', 'Rows'], (s) => s.rows === 2 && s.texts[1][0] === 'c20', caret('c11'));
  await run('Delete > Columns', ['Delete', 'Columns'], (s) => s.grid.length === 2 && s.texts[0][1] === 'c02', caret('c11'));
  await run('Delete > Table', ['Delete', 'Table'], (s) => same(s.blocks, ['Before', 'After']), caret('c11'));
  await run('Merge cells: the four texts in one cell', ['Merge cells'],
    (s) => s.texts[0][0] === 'c00|c01|c10|c11' && s.head === 'c00:0', async () => {
      await ev(() => window.__sel('Tb', 'c00', 0, 'c11', 1));
    });
  await run('Split table: two tables with a paragraph between', ['Split table'],
    (s) => same(s.blocks, ['Before', 'tbl', '', 'tbl', 'After']), caret('c10'));
  await run('Distribute columns evenly: equal grid', ['Distribute columns evenly'],
    (s) => same(s.grid, [3000, 3000, 3000]), caret('c11'));
  await run('Distribute rows evenly: every row at least the tallest', ['Distribute rows evenly'],
    (s) => s.hRule.every((h) => h === 'atLeast'), caret('c11'));
  await run('Tab: a tab character in the cell', ['Tab'], (s) => s.texts[1][1] === 'c\t11' && s.head === 'c\t11:2',
    caret('c11'));
  // select: no undo step
  const sels = [];
  for (const [what, path] of [['cell', 'Cell'], ['row', 'Row'], ['column', 'Column'], ['table', 'Table']]) {
    await caret('c11')();
    await settle();
    const s0 = await st('Tb');
    await choose('Tb', 'Table', 'Select', path);
    await settle();
    const s1 = await ev(() => {
      const v = window.__doc('Tb').view, nm = (pos) => {
        const it = v.layout.byId.get(pos.id);
        return `${it.kind === 'p' ? it.block.text : it.kind}:${pos.off}`;
      };
      return { a: nm(v.selection.anchor), h: nm(v.selection.head), depth: v.undoDepth };
    });
    sels.push({ what, ...s1, same: s1.depth === s0.depth });
  }
  ok('Select > Cell, Row, Column, Table select what they say (no undo step)',
    same(sels.map((x) => [x.a, x.h]), [['c11:0', 'c11:3'], ['c10:0', 'c12:3'], ['c01:0', 'c21b:4'], ['tbl:0', 'tbl:1']])
    && sels.every((x) => x.same), sels);

  // Split cells... opens its box
  await caret('c11')();
  await settle();
  await choose('Tb', 'Table', 'Split cells...');
  const sp = await until(() => !!window.__doc('Tb').dw.boxes.has('tblsplit'));
  await settle();
  await page.keyboard.press('Escape');
  const sp2 = await until(() => !window.__doc('Tb').dw.boxes.has('tblsplit'));
  ok('Table > Split cells... opens the Split cells box; Escape closes it', sp && sp2, { sp, sp2 });

  // Insert > Tab
  await caret('c11')();
  await settle();
  const t0 = await st('Tb');
  await choose('Tb', 'Insert', 'Tab');
  await until((n) => window.__doc('Tb').view.undoDepth === n, t0.depth + 1);
  const t1 = await st('Tb');
  ok('Insert > Tab types a tab character in the cell (one undo step)', t1.texts[1][1] === 'c\t11' && t1.depth === t0.depth + 1,
    t1);
  await page.keyboard.press('Control+z');
  await until((n) => window.__doc('Tb').view.undoDepth === n, t0.depth);


  // ---------------------------------------------------- Convert > Text to table... / Table to text... (C6.4, D29)
  await show('Te');
  const convApi = (leaf) => ev((leaf) => {
    const d = window.__doc(leaf), api = window.__word().word.dialog({ key: 'tblconv:' + d.docKey, rows: [] });
    return { open: api.isOpen, title: api.win.title, cols: api.get('cols'), sep: api.get('sep'), msg: api.win.iconByName('msg')?.text,
      colsShaded: !!api.win.iconByName('cols')?.shaded, box: d.dw.boxes.has('tblconv') };
  }, leaf);
  const convIcon = (leaf, n) => ev(([leaf, n]) => {
    const d = window.__doc(leaf), w = window.__word().word.dialog({ key: 'tblconv:' + d.docKey, rows: [] }).win;
    const b = w.iconByName(n).bbox;
    return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, [leaf, n]);
  const convField = async (leaf, n, text) => {
    const q = await convIcon(leaf, n);
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction((n) => os.wimp.caret?.icon?.name === n, n, { timeout: 5000 });
    await page.keyboard.press('End');
    for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text);
    await settle();
  };
  const convPopup = async (leaf, name, text) => {
    const q = await convIcon(leaf, 'arrow:' + name);
    await page.mouse.click(q.x, q.y);
    await page.waitForFunction(() => os.wimp.menus.isOpen, null, { timeout: 5000 });
    await pick(0, text);
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
    await settle();
  };
  const convOK = async (leaf) => {
    const q = await convIcon(leaf, 'button:OK');
    await page.mouse.click(q.x, q.y);
    await settle();
  };
  await ev(() => window.__sel('Te', 'a\tb\tc', 0, 'f', 1));
  await settle();
  await openMenu('Te');
  await pick(0, 'Table', { hover: true });
  await pick(1, 'Convert', { hover: true });
  const cv1 = await rowsAt(2);
  await closeMenu();
  ok('Table > Convert > has Text to table... (live with paragraphs selected) and Table to text... (shaded outside a table)',
    same(cv1.map((x) => [x[0], x[1]]), [['Text to table...', false], ['Table to text...', true]]), cv1);
  const k0 = await st('Te');
  await choose('Te', 'Table', 'Convert', 'Text to table...');
  const cvOpen = await until(() => window.__doc('Te').dw.boxes.has('tblconv'));
  await settle();
  const cb = await convApi('Te');
  ok('the box opens as Convert text to table: "f" has no tab, so the default rule gives Paragraphs and 1 column', cvOpen && /text to table/.test(cb.title) && cb.sep === 'para' && cb.cols === 1,
  cb);
  await convPopup('Te', 'sep', 'Tabs');
  const cb2 = await convApi('Te');
  ok('choosing Tabs recomputes Columns from the longest line: 3', cb2.sep === 'tab' && cb2.cols === 3, cb2);
  // invalid: a beep, a message, the box kept, nothing changed
  const badC = [];
  const tryC = async (what, set) => {
    const b0 = await st('Te');
    await set();
    await convOK('Te');
    await until((n) => window.__beeps > n, b0.beeps);
    const b1 = await st('Te'), c = await convApi('Te');
    badC.push({ what, beeped: b1.beeps === b0.beeps + 1, kept: c.open && c.box, same: b1.depth === b0.depth && same(b1.blocks, b0.blocks),
      msg: c.msg });
  };
  await tryC('cols 0', () => convField('Te', 'cols', '0'));
  await tryC('cols 64', () => convField('Te', 'cols', '64'));
  await tryC('cols abc', () => convField('Te', 'cols', 'abc'));
  await convField('Te', 'cols', '3');
  await convPopup('Te', 'sep', 'Other');
  await tryC('Other empty', async () => {});
  await convField('Te', 'other', 'ab');
  await tryC('Other two characters', async () => {});
  ok('Columns 0, 64, abc and an Other that is empty or two characters each beep, say why and keep the box; nothing changed',
    badC.length === 5 && badC.every((x) => x.beeped && x.kept && x.same && x.msg.length > 5) && /1 to 63/.test(badC[0].msg)
      && /1 to 63/.test(badC[1].msg) && /1 to 63/.test(badC[2].msg) && /one character/.test(badC[3].msg)
      && /one character/.test(badC[4].msg), badC);
  await convPopup('Te', 'sep', 'Tabs');
  await convOK('Te');
  await until((n) => window.__doc('Te').view.undoDepth === n, k0.depth + 1);
  await settle();
  const k1 = await st('Te');
  ok('OK draws a 3-column grid of the three lines (one undo step): short rows padded; the box is gone',
    k1.depth === k0.depth + 1 && k1.rows === 3 && k1.grid.length === 3
      && same(k1.texts, [['a', 'b', 'c'], ['d', 'e', ''], ['f', '', '']]) && same(k1.blocks, ['tbl', 'tail'])
      && !(await ev(() => window.__doc('Te').dw.boxes.has('tblconv'))), k1);
  // Escape changes nothing
  await choose('Te', 'Table', 'Convert', 'Table to text...');
  await until(() => window.__doc('Te').dw.boxes.has('tblconv'));
  await settle();
  const tb = await convApi('Te');
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Te').dw.boxes.has('tblconv'));
  const k2 = await st('Te');
  ok('Table to text... opens the box as Convert table to text (Columns shaded, Tabs); Escape changes nothing',
    /table to text/.test(tb.title) && tb.sep === 'tab' && tb.colsShaded && k2.depth === k1.depth && same(k2.texts, k1.texts), { tb, k2 });
  // Table to text with Return
  await choose('Te', 'Table', 'Convert', 'Table to text...');
  await until(() => window.__doc('Te').dw.boxes.has('tblconv'));
  await settle();
  await page.keyboard.press('Enter');
  await until((n) => window.__doc('Te').view.undoDepth === n, k1.depth + 1);
  await settle();
  const k3 = await st('Te');
  ok('Table to text with tabs and Return: the lines come back (one undo step): a\\tb\\tc, d\\te\\t, f\\t\\t, tail',
    k3.depth === k1.depth + 1 && same(k3.blocks, ['a\tb\tc', 'd\te\t', 'f\t\t', 'tail']), k3);
  await page.keyboard.press('Control+z');
  await until((n) => window.__doc('Te').view.undoDepth === n, k1.depth);
  await settle();
  const k4 = await st('Te');
  ok('Ctrl-Z gives the table back', same(k4.texts, k1.texts) && k4.rows === 3, k4);

  // ---------------------------------------------------- the Convert box's contract (C6 fix B5)
  await show('Tf');
  const pq = async () => { await ev(() => window.__sel('Tf', 'p,q,r', 0, 's,t', 3)); await settle(); };
  const uw = async () => { await ev(() => window.__sel('Tf', 'u\tv', 0, 'w\tx', 3)); await settle(); };
  const xf0 = await st('Tf');
  await pq();
  await choose('Tf', 'Table', 'Convert', 'Text to table...');
  await until(() => window.__doc('Tf').dw.boxes.has('tblconv'));
  await settle();
  const xfa = await convApi('Tf');
  await uw();
  await choose('Tf', 'Table', 'Convert', 'Text to table...');
  await settle();
  const xfb = await convApi('Tf');
  ok('asked again for other lines in the same mode: filled for them (commas, 3 -> tabs, 2)',
    xfa.sep === 'comma' && xfa.cols === 3 && xfb.open && xfb.sep === 'tab' && xfb.cols === 2, { xfa, xfb });
  // the selection changed while the box is open: OK beeps, says so, fills again; nothing changed
  await pq();
  const xs0 = await st('Tf');
  await convOK('Tf');
  await until((n) => window.__beeps > n, xs0.beeps);
  await settle();
  const xs1 = await st('Tf'), xfc = await convApi('Tf');
  ok('the selection changed while open: OK beeps, says so and fills the box for the new lines; nothing changed',
    xs1.beeps === xs0.beeps + 1 && xs1.depth === xs0.depth && same(xs1.blocks, xs0.blocks) && xfc.open
      && /changed/.test(xfc.msg) && xfc.sep === 'comma' && xfc.cols === 3, { xs0, xs1, xfc });
  // switching the mode while it is open: Table to text with the caret in the table
  await convPopup('Tf', 'sep', 'Other');
  await convField('Tf', 'other', ';');
  await ev(() => window.__sel('Tf', 'k1', 0));
  await settle();
  await choose('Tf', 'Table', 'Convert', 'Table to text...');
  await settle();
  const xfd = await convApi('Tf');
  const other = await ev(() => {
    const d = window.__doc('Tf'), api = window.__word().word.dialog({ key: 'tblconv:' + d.docKey, rows: [] });
    return { other: api.win.iconByName('other')?.text, otherShaded: !!api.win.iconByName('other')?.shaded,
      choices: api.win.iconByName('sep')?.text };
  });
  ok('the mode switched while open: the same box says Convert table to text, Tabs, Columns shaded, nothing carried over',
    xfd.open && /table to text/.test(xfd.title) && xfd.sep === 'tab' && xfd.colsShaded && xfd.msg === ''
      && !other.other && other.otherShaded, { xfd, other });
  // the Cancel button changes nothing
  const xs2 = await st('Tf');
  const xcq = await convIcon('Tf', 'button:Cancel');
  await page.mouse.click(xcq.x, xcq.y);
  await until(() => !window.__doc('Tf').dw.boxes.has('tblconv'));
  await settle();
  const xs3 = await st('Tf');
  ok('Cancel closes the box and changes nothing', xs3.depth === xs2.depth && same(xs3.blocks, xs2.blocks)
    && !(await ev(() => window.__doc('Tf').dw.boxes.has('tblconv'))), xs3);
  // 20 open / close cycles, Escape and Cancel in turn
  let xcn = 0;
  const convCycle = async () => {
    await pq();
    await choose('Tf', 'Table', 'Convert', 'Text to table...');
    await until(() => window.__doc('Tf').dw.boxes.has('tblconv'));
    await settle();
    if (xcn++ % 2) {
      const q = await convIcon('Tf', 'button:Cancel');
      await page.mouse.click(q.x, q.y);
    } else await page.keyboard.press('Escape');
    await until(() => !window.__doc('Tf').dw.boxes.has('tblconv'));
    await settle();
  };
  const convCounts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, stack: os.wimp.stack.length };
  });
  for (let i = 0; i < 3; i++) await convCycle();
  const xcc0 = await convCounts();
  for (let i = 0; i < 20; i++) await convCycle();
  const xcc1 = await convCounts();
  const xf1 = await st('Tf');
  ok('20 open / close cycles of the Convert box (Escape and Cancel in turn) leak nothing; nothing changed',
    same(xcc0, xcc1) && xcn === 23 && xf1.depth === xf0.depth && same(xf1.blocks, xf0.blocks), { xcc0, xcc1, xcn });
  // closing the document deletes the box
  await pq();
  await choose('Tf', 'Table', 'Convert', 'Text to table...');
  await until(() => window.__doc('Tf').dw.boxes.has('tblconv'));
  await settle();
  const convGone = await ev(async () => {
    const d = window.__doc('Tf'), w = window.__word().word.dialog({ key: 'tblconv:' + d.docKey, rows: [] }).win;
    const was = [...os.wimp.windows].includes(w);
    d.dw.close();
    await window.__frames(3);
    return { was, inWimp: [...os.wimp.windows].includes(w) };
  });
  ok('closing the document deletes its Convert box', convGone.was && !convGone.inWimp, convGone);

  // ---------------------------------------------------- 20 open / close cycles leak nothing
  await show('Tc');
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, stack: os.wimp.stack.length };
  });
  // closed by Escape and by Cancel in turn (and by the document's close below)
  let nth = 0;
  const cycle = async () => {
    await ev(() => window.__doc('Tc').win.menu({}).items.find((i) => i.text === 'Insert').submenu().items
      .find((i) => i.text === 'Table...').action());
    await until(() => !!window.__doc('Tc').dw.boxes.has('tblins'));
    await settle();
    if (nth++ % 2) {
      const q = await boxIcon('Tc', 'button:Cancel');
      await page.mouse.click(q.x, q.y);
    } else await page.keyboard.press('Escape');
    await until(() => !window.__doc('Tc').dw.boxes.has('tblins'));
    await settle();
  };
  for (let i = 0; i < 3; i++) await cycle();
  const c0 = await counts();
  for (let i = 0; i < 20; i++) await cycle();
  const c1 = await counts();
  ok('20 open / close cycles of the Insert table box (Escape and Cancel in turn) leak nothing (windows, icons, listeners)',
    same(c0, c1) && nth === 23, { c0, c1, nth });

  // the box is deleted with its document
  await ev(() => window.__doc('Tc').win.menu({}).items.find((i) => i.text === 'Insert').submenu().items
    .find((i) => i.text === 'Table...').action());
  await until(() => !!window.__doc('Tc').dw.boxes.has('tblins'));
  await settle();
  const w0 = await boxCount();
  const closed = await ev(async () => {
    const d = window.__doc('Tc'), w = window.__word().word.dialog({ key: 'tblins:' + d.docKey, rows: [] }).win;
    d.dw.close();
    await window.__frames(3);
    return { gone: w.gone === true || w.deleted === true || ![...os.wimp.windows].includes(w),
      inWimp: [...os.wimp.windows].includes(w) };
  });
  ok('closing the document deletes its box (one per document while it is open)', w0 === 1 && closed.gone && !closed.inWimp,
    { w0, closed });

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
