// !Word's tables, the final whole-branch review's interface fixes (Batch C final fix wave, group 2), in the real
// desktop: the Tab item (Table and Insert menus) is live for a caret or text inside one cell and shaded for cells
// selected (a rectangle) and for a selection running from a paragraph into the table (final-2 M8: with a rectangle it
// typed a tab in the first cell and emptied the others); the Split cells box opened at one cell, the caret then moved
// to another cell: OK beeps, says the document changed and keeps the box, nothing split; the next OK splits the cell
// the caret is in now (one undo step: final-2 I2, as the Insert table box); the document edited while the box is open
// does the same.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { tbl, tr, tc, tblDocx, TABLE_NORMAL, TABLE_GRID } from './tbl-fixtures.mjs';

const LOOK = '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" '
  + 'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const cell = (t) => tc(p(r(t)), { tcPr: '<w:tcW w:w="3000" w:type="dxa"/>' });
const GRID3 = tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => cell(`c${i}${j}`)))),
  { tblPr: '<w:tblStyle w:val="TableGrid"/>' + LOOK, grid: [3000, 3000, 3000] });
const files = {
  Tz: Array.from(await tblDocx(p(r('Before')) + GRID3 + p(r('After')), { styles: TABLE_NORMAL + TABLE_GRID })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 1200)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__client = (win, x, y) => { const s = win.workToScreen(x, y); return window.__screen(s.x, s.y); };
    window.__beeps = 0;
    const b = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return b(); };
    window.__st = (leaf) => {
      const d = window.__doc(leaf), v = d.view, sec = d.d.doc.sections[0].blocks;
      const t = sec.find((x) => x.type === 'tbl');
      const h = v.selection.head, it = h && v.layout.byId.get(h.id);
      return { rows: t ? t.rows.length : 0, grid: t ? t.grid.length : 0,
        texts: t ? t.rows.map((row) => row.cells.map((c) => c.blocks.map((x) => x.text).join('|'))) : [],
        head: it ? `${it.kind === 'p' ? it.block.text : it.kind}:${h.off}` : null, depth: v.undoDepth,
        beeps: window.__beeps, box: d.dw.boxes.has('tblsplit') };
    };
    window.__sel = (leaf, a, ao, b, bo) => {
      const v = window.__doc(leaf).view, f = (t) => v.layout.flow.find((x) => x.kind === 'p' && x.block.text === t).id;
      if (b === undefined) v.setSelection({ id: f(a), off: ao });
      else v.setSelection({ id: f(a), off: ao }, { id: f(b), off: bo });
    };
    /** Whether the Tab item of the Table menu and of the Insert menu is shaded. */
    window.__tabShaded = (leaf) => {
      const m = window.__doc(leaf).win.menu({}).items, sub = (t) => m.find((i) => i.text === t).submenu();
      const sh = (it) => (typeof it.shaded === 'function' ? !!it.shaded(it) : !!it.shaded);
      return [sh(sub('Table').items.find((i) => i.text === 'Tab')), sh(sub('Insert').items.find((i) => i.text === 'Tab'))];
    };
  }, files);
  await ev(() => os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word'));
  await page.waitForFunction(() => !!window.__word()?.word, null, { timeout: 20000 });
  await ev(() => os.filer.run('RAM::RamDisc0.$.Tz'));
  await page.waitForFunction(() => !!window.__doc('Tz')?.view.layout, null, { timeout: 20000 });
  await ev(async () => {
    const d = window.__doc('Tz');
    d.win.open({ x: 40, y: 40, w: 900, h: 640, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    await window.__frames(3);
  });
  const st = () => ev(() => window.__st('Tz'));
  const sel = async (...a) => { await ev((a) => window.__sel('Tz', ...a), a); await settle(); };
  const shaded = () => ev(() => window.__tabShaded('Tz'));

  // ---------------------------------------------------- M8: the Tab item
  await sel('c00', 1);
  const caret = await shaded();
  await sel('c00', 0, 'c00', 3);
  const text = await shaded();
  await sel('c00', 1, 'c11', 2);
  const rect = await shaded();
  await sel('Before', 2, 'c00', 1);
  const mixed = await shaded();
  await sel('After', 1);
  const outside = await shaded();
  ok('the Tab item (Table and Insert menus) is live for a caret or text in one cell, shaded for cells selected, a '
    + 'selection from a paragraph into the table and outside a table',
  same(caret, [false, false]) && same(text, [false, false]) && same(rect, [true, true]) && same(mixed, [true, true])
    && same(outside, [true, true]), { caret, text, rect, mixed, outside });

  // ---------------------------------------------------- I2: the Split cells box's stale guard
  const icon = (n) => ev((n) => {
    const d = window.__doc('Tz'), w = window.__word().word.dialog({ key: 'tblsplit:' + d.docKey, rows: [] }).win;
    const b = w.iconByName(n).bbox;
    return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, n);
  const msg = () => ev(() => {
    const d = window.__doc('Tz');
    if (!d.dw.boxes.has('tblsplit')) return null;
    return window.__word().word.dialog({ key: 'tblsplit:' + d.docKey, rows: [] }).win.iconByName('msg')?.text ?? null;
  });
  const clickOK = async () => {
    const q = await icon('button:OK');
    await page.mouse.click(q.x, q.y);
    await settle();
  };
  const openBox = async () => {
    await ev(() => { window.__doc('Tz').splitBox(); });
    await until(() => window.__doc('Tz').dw.boxes.has('tblsplit'));
    await settle();
  };
  await sel('c00', 1);
  await openBox();
  const s0 = await st();
  await sel('c11', 1);
  await clickOK();
  await until((n) => window.__beeps === n, s0.beeps + 1);
  const s1 = { ...(await st()), msg: await msg() };
  ok('Split cells: opened at c00, the caret moved to c11, OK beeps, says the document changed and keeps the box; '
    + 'nothing is split',
  s1.box && s1.beeps === s0.beeps + 1 && /changed/.test(s1.msg) && s1.depth === s0.depth && same(s1.texts, s0.texts),
  { s0, s1 });
  await clickOK();
  await until((n) => window.__doc('Tz').view.undoDepth === n, s0.depth + 1);
  await settle();
  const s2 = await st();
  ok('the next OK splits c11, the cell the caret is in now, in one undo step (two columns), the box gone',
    !s2.box && s2.depth === s0.depth + 1 && s2.grid === 4 && same(s2.texts[1], ['c10', 'c11', '', 'c12'])
      && same(s2.texts[0].length, 3), s2);

  // the document edited while the box is open
  await sel('c22', 1);
  await openBox();
  const e0 = await st();
  await ev(() => { window.__doc('Tz').dw.view.input('Q'); });
  await settle();
  const e1 = await st();
  await clickOK();
  await until((n) => window.__beeps === n, e0.beeps + 1);
  const e2 = { ...(await st()), msg: await msg() };
  await page.keyboard.press('Escape');
  await until(() => !window.__doc('Tz').dw.boxes.has('tblsplit'));
  ok('the document edited while the box is open: OK beeps and keeps the box, nothing split',
    e1.depth === e0.depth + 1 && e2.box && e2.beeps === e0.beeps + 1 && e2.depth === e1.depth
      && /changed/.test(e2.msg), { e0, e1, e2 });

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
