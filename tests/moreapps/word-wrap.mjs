// !Letters' Format > Wrap text in the real desktop (Batch D P12.4,
// D28): a picture in line with text selected, Wrap text > shows
// "In line with text" ticked; Square makes it a floating picture
// (one undo step) and, in Print layout, the lines beside it start
// right of it (its width and distR 114300 EMU = 12 px) while those
// below it start at the margin; the menu then ticks Square; Undo
// puts it back in line; Draft shows the square picture inline (no
// wrap); Behind text and In front of text leave the lines at the
// margin; a floating picture this program does not understand
// (simplePos="1") is refused with a beep and nothing changes; with
// no picture selected Wrap text is shaded; (P12a fix I2) a click on text over a picture behind the text puts the caret
// there; (P12a fix I3) a float across two newspaper columns wraps the lines of both; (P12a fix I5) text in a table
// cell wraps round a float in that cell; (P12.5, D27) a floating picture dragged by its body 48 px right and 24 down
// has posOffset + 457200 and + 228600 EMU in one undo step (Ctrl-Z gives it back), the ghost is drawn while it
// is dragged, Escape during a drag changes nothing, and its handle resizes it. (P12.7, R5) A floating table: the
// lines beside it wrapped (its width + rightFromText), in Draft in the flow, dashed; arrow keys in and out of it in
// document order; type in a floating table (the table grows, the text beside it re-breaks, the caret stays in the
// placed cell, Undo restores the Doc and the line breaks); Table > Insert > Rows above in it; (P12b fix I2) a drag
// on its outline (its right edge, its bottom) resizes it as any table, where it is drawn, its position kept; a
// column border inside it dragged as in any table; 100 pages with a floating table on each:
// a keystroke in a cell < 30 ms (median of 20).
// Needs the disc built by tools/disc-wimplib.mjs and
// disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { drawingXml } from './pic-fixtures.mjs';

const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" '
  + 'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
// a picture in line (96 x 96 px, no media: its alt text drawn) at the start of a long paragraph;
// then a floating picture not understood (simplePos="1")
const PIC = drawingXml({ cx: 96 * 9525, cy: 96 * 9525, descr: 'WRAPME' });
const ODD = drawingXml({ kind: 'anchor', id: 2, descr: 'ODD' }).replace('simplePos="0"', 'simplePos="1"');
const BODY = p('<w:r>' + PIC + '</w:r>' + r(Array.from({ length: 120 }, (_, i) => WORDS[i % 10]).join(' ')))
  + p(r('Odd: ') + '<w:r>' + ODD + '</w:r>') + p(r('Last.')) + SECT;
// (P12a fix I3) 2 columns and a 300 x 200 px square float centred in the margin box, across both
const SPAN = drawingXml({ kind: 'anchor', id: 3, cx: 300 * 9525, cy: 200 * 9525, descr: 'SPAN' })
  .replace(/<wp:positionH[^]*<\/wp:positionV>/, '<wp:positionH relativeFrom="margin"><wp:align>center</wp:align>'
    + '</wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>476250</wp:posOffset></wp:positionV>');
const TWO = WORDS.concat(WORDS.slice(0, 8)).join(' ');
const COLS = p('<w:r>' + SPAN + '</w:r>' + r(TWO)) + Array.from({ length: 30 }, () => p(r(TWO))).join('')
  + SECT.replace('</w:sectPr>', '<w:cols w:num="2" w:space="720"/></w:sectPr>');
// (P12a fix I5) a table whose second cell (400 px) holds a 96 x 96 px square float at its paragraph's top left
const INCELL = drawingXml({ kind: 'anchor', id: 4, cx: 96 * 9525, cy: 96 * 9525, descr: 'INCELL' });
const tcw = (w, inner) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const CELL = p(r('above')) + '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid>'
  + '<w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr>' + tcw(3000, p(r('left')))
  + tcw(6000, p('<w:r>' + INCELL + '</w:r>' + r(TWO + ' ' + TWO))) + '</w:tr></w:tbl>' + p(r('below')) + SECT;
// (P12.7, R5) a floating table at the margin's left, placed from its flow place (vertAnchor text), 2 x 2 cells of
// 1000 twips, rightFromText 180 (12 px), with a long paragraph beside it
const ftbl = (a, rows) => '<w:tbl><w:tblPr><w:tblpPr ' + a + '/><w:tblW w:w="2000" w:type="dxa"/></w:tblPr><w:tblGrid>'
  + '<w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid>' + rows.map((row) => '<w:tr>' + row.map((t) => '<w:tc><w:tcPr>'
  + '<w:tcW w:w="1000" w:type="dxa"/></w:tcPr>' + p(r(t)) + '</w:tc>').join('') + '</w:tr>').join('') + '</w:tbl>';
const FTA = 'w:leftFromText="180" w:rightFromText="180" w:horzAnchor="margin" w:vertAnchor="text" w:tblpXSpec="left" w:tblpY="1"';
const FTBL = p(r('Intro.')) + ftbl(FTA, [['FT a', 'FT c'], ['FT b', 'FT d']])
  + p(r(Array.from({ length: 60 }, (_, i) => WORDS[i % 10]).join(' '))) + p(r('After.')) + SECT;
// 100 pages, a floating table on each
const HUNDRED = Array.from({ length: 100 }, (_, k) => ftbl(FTA, [['c' + k, 'd'], ['e', 'f']]) + p(r(TWO)) + p(r(TWO))
  + (k < 99 ? p('<w:r><w:br w:type="page"/></w:r>') : p(r('end')))).join('') + SECT;
const files = { Wrap: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY) })),
  FTbl: Array.from(await buildDocx({ 'word/document.xml': documentXml(FTBL) })),
  FTbl100: Array.from(await buildDocx({ 'word/document.xml': documentXml(HUNDRED) })),
  Cols: Array.from(await buildDocx({ 'word/document.xml': documentXml(COLS) })),
  Cell: Array.from(await buildDocx({ 'word/document.xml': documentXml(CELL) })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
/** Waits until d's pages, columns and wrap passes are all done. */
const settled = () => page.waitForFunction(() => {
  const d = window.__doc('Wrap'), P = d.view.pages();
  return !P || (P.done && !d.dw.colDue && !d.dw.wrapDue);
}, null, { timeout: 10000 });
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf);
    /** Format > Wrap text's menu of d. */
    window.__wrapMenu = (d) => {
      const it = d.win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Wrap text');
      return it;
    };
    const val = (x, i) => !!(typeof x === 'function' ? x(i) : x);
    /** [text, ticked, shaded] of each Wrap text item. */
    window.__wrapRows = (d) => window.__wrapMenu(d).submenu().items.map((i) => [i.text, val(i.ticked, i), val(i.shaded, i)]);
    /** Wrap text > text chosen (as a click on it does). */
    window.__wrap = (d, text) => {
      const it = window.__wrapMenu(d).submenu().items.find((i) => i.text === text);
      it.action(it);
    };
    window.__lines = (d) => d.view.layout.items[0].lines.map((l) => [Math.round(l.x), Math.round(l.y)]);
    window.__selPic = (d, k) => {
      const id = d.view.layout.items[k].id, off = d.view.layout.items[k].para.text.indexOf('￼');
      d.view.setSelection({ id, off }, { id, off: off + 1 });
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Wrap');
    await window.__frames(3);
  }, files);
  await settled();

  // ------------------------------------------------ the menu
  const m0 = await ev(() => {
    const d = window.__doc('Wrap');
    d.view.setSelection({ id: d.view.layout.items[2].id, off: 1 });
    const res = { caret: window.__wrapMenu(d).shaded() };
    window.__selPic(d, 0);
    res.rows = window.__wrapRows(d);
    res.shaded = window.__wrapMenu(d).shaded();
    res.view = d.viewName;
    res.lines = window.__lines(d);
    return res;
  });
  ok('Format > Wrap text: shaded at a caret; with a picture in line selected its six kinds, In line with text ticked',
    m0.caret === true && m0.shaded === false && same(m0.rows, [['In line with text', true, false], ['Square', false, false],
      ['Tight', false, false], ['Top and bottom', false, false], ['Behind text', false, false],
      ['In front of text', false, false]]), m0);

  // ------------------------------------------------ Square
  await ev(() => window.__wrap(window.__doc('Wrap'), 'Square'));
  await settled();
  const s1 = await ev(() => {
    const d = window.__doc('Wrap');
    return { lines: window.__lines(d), undo: d.view.undoDepth, pic: d.view.pic(), dirty: d.view.dirty,
      ticked: window.__wrapRows(d).filter((x) => x[1]).map((x) => x[0]),
      floats: d.view.layout.place.pages.at(0).floats.map((f) => [f.x, f.y, f.w, f.h, f.wrap.kind]) };
  });
  const beside = (ls) => ls.filter(([, y]) => y < 96);
  ok('Square: one undo step, the picture still selected and floating, the menu ticks Square',
    s1.undo === 1 && s1.dirty && s1.pic && s1.pic.floating && same(s1.ticked, ['Square']), s1);
  ok('Square in Print layout: the lines beside the picture start right of it (96 + 12 px), those below at the margin',
    s1.floats.length === 1 && s1.floats[0][4] === 'square' && beside(s1.lines).length >= 2
    && beside(s1.lines).every(([x]) => x === 108) && s1.lines.some(([x, y]) => y >= 96 && x === 0), s1);

  // ------------------------------------------------ Draft: inline, no wrap; back
  const dr = await ev(async () => {
    const d = window.__doc('Wrap');
    d.setView('draft');
    await window.__frames(3);
    const res = { draft: window.__lines(d) };
    d.setView('print');
    return res;
  });
  await settled();
  const back = await ev(() => window.__lines(window.__doc('Wrap')));
  ok('Draft: no wrap; back in Print layout the wrap again', dr.draft.every(([x]) => x === 0) && same(back, s1.lines),
    { dr, back });

  // ------------------------------------------------ Undo
  await ev(() => window.__doc('Wrap').view.press('undo'));
  await settled();
  const u1 = await ev(() => {
    const d = window.__doc('Wrap');
    return { lines: window.__lines(d), undo: d.view.undoDepth,
      floats: d.view.layout.place.pages.at(0).floats.length };
  });
  ok('Undo: the picture in line again, no float, the lines as they were', u1.undo === 0 && u1.floats === 0
    && same(u1.lines, m0.lines), u1);

  // ------------------------------------------------ Behind text, In front of text: no wrap
  const bf = {};
  for (const k of ['Behind text', 'In front of text']) {
    await ev((k) => { const d = window.__doc('Wrap'); window.__selPic(d, 0); window.__wrap(d, k); }, k);
    await settled();
    bf[k] = await ev(() => {
      const d = window.__doc('Wrap');
      return { lines: window.__lines(d), undo: d.view.undoDepth,
        floats: d.view.layout.place.pages.at(0).floats.map((f) => [f.behind, f.wrap.kind]) };
    });
  }
  ok('Behind text, then In front of text: a step each, floating with no wrap, every line at the margin',
    bf['Behind text'].undo === 1 && same(bf['Behind text'].floats, [[true, 'none']])
    && bf['In front of text'].undo === 2 && same(bf['In front of text'].floats, [[false, 'none']])
    && bf['Behind text'].lines.every(([x]) => x === 0) && bf['In front of text'].lines.every(([x]) => x === 0), bf);

  // ------------------------------------------------ dragged: move and resize (P12.5)
  const offs = () => ev(() => {
    const d = window.__doc('Wrap'), n = d.d.doc.sections[0].blocks[0].inlines[0].node;
    const xml = JSON.stringify(n);
    const g = (k) => +(new RegExp(k + '[^]*?posOffset[^]*?"(-?\\d+)"').exec(xml)?.[1]);
    return { h: g('positionH'), v: g('positionV'), cx: d.view.pic()?.cx, depth: d.view.undoDepth, beeps: window.__beeps,
      ghost: d.dw.view.picGhost ?? null, dragging: !!d.dw.view.picDrag };
  });
  const where = () => ev(() => {
    const d = window.__doc('Wrap'), q = d.view.pic(), z = d.view.zoom, t = d.view.layout.top;
    const at = (x, y) => { const w = { x: x * z, y: t + (y - t) * z }, s = d.win.workToScreen(w.x, w.y),
      rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale; return { x: rc.left + s.x * k, y: rc.top + s.y * k }; };
    return { c: at(q.rect.x + q.rect.w / 2, q.rect.y + q.rect.h / 2), se: at(q.rect.x + q.rect.w, q.rect.y + q.rect.h) };
  });
  const dragBy = async (a, dx, dy, mid) => {
    await page.waitForTimeout(450);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 });
    await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 });
    await ev(() => window.__frames(3));
    const r = mid ? await mid() : null;
    await page.mouse.up();
    await page.waitForTimeout(40);
    await ev(() => window.__frames(3));
    return r;
  };
  // ------------------------------------------------ a click on text over a picture behind it (P12a fix I2)
  await ev(() => window.__doc('Wrap').view.press('undo'));
  await settled();
  await ev(() => { const d = window.__doc('Wrap'); window.__selPic(d, 0); });
  const wb = await where();
  await page.waitForTimeout(450);
  await page.mouse.click(wb.c.x, wb.c.y);
  await page.waitForTimeout(40);
  const ib = await ev(() => {
    const d = window.__doc('Wrap'), s = d.dw.view.sel;
    return { pic: !!d.view.pic(), behind: d.view.layout.place.pages.at(0).floats.map((f) => f.behind),
      caret: s.anchor.id === s.head.id && s.anchor.off === s.head.off, off: s.head.off };
  });
  ok('a click on text over the picture behind it puts the caret there; the picture is not selected',
    !ib.pic && ib.caret && same(ib.behind, [true]), ib);
  await ev(() => window.__doc('Wrap').view.press('redo'));
  await settled();
  await ev(() => { const d = window.__doc('Wrap'); window.__selPic(d, 0); });
  await settled();
  // a click on the float selects it; the drag then starts on its body
  await page.mouse.click((await where()).c.x, (await where()).c.y);
  await page.waitForTimeout(40);
  const m0b = await offs(), w0 = await where();
  const mid = await dragBy(w0.c, 48, 24, () => offs());
  await settled();
  const m1 = await offs();
  ok('a floating picture dragged by its body: a ghost while it moves, then posOffset + 457200 / 228600, one step',
    mid.ghost && mid.dragging && m1.h === m0b.h + 457200 && m1.v === m0b.v + 228600 && m1.depth === m0b.depth + 1
    && m1.beeps === m0b.beeps && !m1.dragging && m1.ghost === null, [m0b, mid, m1]);
  await ev(() => window.__doc('Wrap').view.press('undo'));
  await settled();
  const m2 = await offs();
  ok('Ctrl-Z puts it back', m2.h === m0b.h && m2.v === m0b.v && m2.depth === m0b.depth, m2);
  await ev(() => { const d = window.__doc('Wrap'); window.__selPic(d, 0); });
  await settled();
  const esc = await dragBy((await where()).c, 40, 40, async () => { await page.keyboard.press('Escape'); await ev(() => window.__frames(2)); });
  const m3 = await offs();
  ok('Escape during the drag: nothing changed', m3.h === m0b.h && m3.v === m0b.v && m3.depth === m0b.depth && !m3.dragging, m3);
  const w1 = await where();
  await dragBy(w1.se, 40, 40);
  await settled();
  const m4 = await offs();
  ok('the SE handle resizes it: one step, the place kept', m4.cx > m0b.cx && m4.depth === m0b.depth + 1 && m4.h === m0b.h
    && m4.v === m0b.v && m4.beeps === m0b.beeps, [m0b, m4]);
  await ev(() => window.__doc('Wrap').view.press('undo'));
  await settled();

  // ------------------------------------------------ an anchor not understood: refused
  const odd = await ev(async () => {
    const d = window.__doc('Wrap');
    window.__selPic(d, 1);
    const res = { pic: !!d.view.pic(), rows: window.__wrapRows(d), beeps: window.__beeps, undo: d.view.undoDepth };
    const text = d.view.lines().join('|');
    window.__wrap(d, 'Square');
    await window.__frames(2);
    res.after = { beeps: window.__beeps, undo: d.view.undoDepth, same: d.view.lines().join('|') === text };
    return res;
  });
  ok('a floating picture not understood: nothing ticked; Square beeps and changes nothing',
    odd.pic && odd.rows.every((x) => !x[1]) && odd.after.beeps === odd.beeps + 1 && odd.after.undo === odd.undo
    && odd.after.same, odd);

  // ------------------------------------------------ a float across two columns (P12a fix I3)
  await ev(() => window.__word().word.open('RAM::RamDisc0.$.Cols'));
  await page.waitForFunction(() => { const d = window.__doc('Cols'), P = d && d.view.pages();
    return !!P && P.done && !d.dw.colDue && !d.dw.wrapDue; }, null, { timeout: 20000 });
  const cols = await ev(() => {
    const d = window.__doc('Cols'), L = d.view.layout, pg = L.place.pages.at(0), f = pg.floats[0];
    const beside = pg.frames.map((fr) => fr.frags.flatMap((g) => {
      const it = L.byId.get(g.id);
      return it.lines.slice(g.l0, g.l1).filter((ln) => g.y + ln.y + ln.h > f.y && g.y + ln.y < f.y + f.h)
        .map((ln) => [Math.round(fr.x + ln.x), Math.round(fr.x + ln.x + Math.max(0, ...ln.items.map((x) => x.x + x.w)))]);
    }));
    return { f: [f.x, f.y, f.w, f.h], beside };
  });
  const [b1 = [], b2 = []] = cols.beside;
  ok('a float across two columns: the lines of both beside it wrapped, those in column 2 right of it',
    b1.length >= 3 && b2.length >= 3 && b1.every(([, x1]) => x1 <= cols.f[0] - 12 + 1)
    && b2.every(([x0]) => x0 >= cols.f[0] + cols.f[2] + 12 - 1), cols);

  // ------------------------------------------------ text in a cell round a float in that cell (P12a fix I5)
  await ev(() => window.__word().word.open('RAM::RamDisc0.$.Cell'));
  await page.waitForFunction(() => { const d = window.__doc('Cell'), P = d && d.view.pages();
    return !!P && P.done && !d.dw.colDue && !d.dw.wrapDue; }, null, { timeout: 20000 });
  const cell = await ev(() => {
    const d = window.__doc('Cell'), L = d.view.layout, f = L.place.pages.at(0).floats[0];
    const x = L.items[1].rows[0].cells[1].col.items[0];
    return { cell: f && f.cell, lines: x.lines.map((l) => [Math.round(l.x), Math.round(l.y)]) };
  });
  ok('text in a table cell wraps round a float in that cell: the lines beside it start right of it',
    cell.cell && cell.lines.filter(([, y]) => y < 96).length >= 2
    && cell.lines.filter(([, y]) => y < 96).every(([x]) => x === 108)
    && cell.lines.filter(([, y]) => y >= 96).every(([x]) => x === 0),
    cell);

  // ------------------------------------------------ floating tables: text wrapped round them (P12.7, R5)
  const settledOf = (leaf) => page.waitForFunction((leaf) => { const d = window.__doc(leaf), P = d && d.view.pages();
    return !!P && P.done && !d.dw.colDue && !d.dw.wrapDue; }, leaf, { timeout: 20000 });
  await ev(() => {
    /** d's floating table on page 0 and the long paragraph's lines, page px: [x, y, h]. */
    window.__ft = (d) => {
      const L = d.view.layout, Pl = L.place, pg = Pl.pages.at(0), rc = Pl.sheet.rect(pg);
      const F = pg.floats.find((f) => f.tbl !== undefined);
      const it = [...L.byId.values()].find((x) => x.kind === 'p' && x.para.text.startsWith('alpha beta'));
      const lines = it.lines.map((ln, j) => { const q = Pl.lineAt(it, j); return [+(q.x - rc.x + ln.x).toFixed(2),
        +(q.y - rc.y).toFixed(2), ln.h]; });
      return { F: F ? [F.x, F.y, F.w, F.h] : null, lines, pages: Pl.pages.count };
    };
    window.__para = (d, text) => [...d.view.layout.byId.values()].find((x) => x.kind === 'p' && x.para.text === text);
    window.__head = (d) => { const h = d.dw.view.sel.head, it = d.view.layout.byId.get(h.id); return it && it.para ? it.para.text : null; };
    /** Counts the [4, 3] dashes set while d is drawn. */
    window.__dashes = async (d) => {
      const proto = CanvasRenderingContext2D.prototype, real = proto.setLineDash;
      let n = 0;
      proto.setLineDash = function (a) { if (a && a[0] === 4 && a[1] === 3) n++; return real.call(this, a); };
      try { d.win.invalidate(); await window.__frames(2); } finally { proto.setLineDash = real; }
      return n;
    };
    window.__tblJson = (d) => JSON.stringify(d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl'));
  });
  await ev(async () => { await window.__word().word.open('RAM::RamDisc0.$.FTbl'); });
  await settledOf('FTbl');
  const ft0 = await ev(async () => { const d = window.__doc('FTbl'); return { ...window.__ft(d), dashes: await window.__dashes(d),
    view: d.viewName }; });
  const besideT = (r, F) => r.lines.filter(([, y, h]) => y < F[1] + F[3] && y + h > F[1]);
  ok('Print layout: the lines beside a floating table start right of it plus rightFromText (12 px); those below at the '
    + 'margin; no dashed outline', ft0.view === 'print' && ft0.F && besideT(ft0, ft0.F).length >= 2
    && besideT(ft0, ft0.F).every(([x]) => Math.abs(x - (ft0.F[0] + ft0.F[2] + 12)) < 0.5)
    && ft0.lines.some(([x, y]) => y >= ft0.F[1] + ft0.F[3] && Math.abs(x - 96) < 0.5) && ft0.dashes === 0, ft0);
  const ftd = await ev(async () => {
    const d = window.__doc('FTbl');
    d.setView('draft');
    await window.__frames(3);
    const L = d.view.layout, it = window.__para(d, 'FT a'), intro = window.__para(d, 'Intro.');
    const res = { lines: L.items[2].lines.map((ln) => ln.x), dashes: await window.__dashes(d),
      inFlow: L.place.lineAt(it, 0).y > L.place.lineAt(intro, 0).y };
    d.setView('print');
    return res;
  });
  await settledOf('FTbl');
  const ftb = await ev(() => window.__ft(window.__doc('FTbl')));
  ok('Draft: the floating table in the flow, dashed, no wrap; back in Print layout the wrap again',
    ftd.lines.every((x) => x === 0) && ftd.dashes > 0 && ftd.inFlow && same(ftb.lines, ft0.lines) && same(ftb.F, ft0.F),
    { ftd, ftb });

  // arrow keys in and out of it, in document order
  const q0 = await ev(async () => {
    const d = window.__doc('FTbl'), L = d.view.layout, F = L.place.pages.at(0).floats.find((f) => f.tbl !== undefined);
    const rc = L.place.sheet.rect(L.place.pages.at(0)), z = d.view.zoom, t = L.top;
    const w = { x: (rc.x + F.x + F.w / 4) * z, y: t + (rc.y + F.y + 6 - t) * z }, sc = d.win.workToScreen(w.x, w.y);
    const b = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: b.left + sc.x * k, y: b.top + sc.y * k };
  });
  await page.waitForTimeout(450);
  await page.mouse.click(q0.x, q0.y);
  await ev(() => window.__frames(2));
  const keys = [];
  await ev(() => { const d = window.__doc('FTbl'), it = window.__para(d, 'Intro.'); d.view.setSelection({ id: it.id, off: 6 }); });
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp']) {
    await page.keyboard.press(k);
    await ev(() => window.__frames(1));
    keys.push(await ev(() => window.__head(window.__doc('FTbl'))));
  }
  const LONG = (t) => !!t && t.startsWith('alpha beta');
  ok('arrow keys: Down from the paragraph above goes into the floating table, row by row, then out to the paragraph '
    + 'after it; Up goes back the same way', keys[0] === 'FT a' && keys[1] === 'FT b' && LONG(keys[2])
    && ['FT b', 'FT d'].includes(keys[3]) && ['FT a', 'FT c'].includes(keys[4]) && keys[5] === 'Intro.', keys);

  // type in a floating table (Review Focus 6)
  const ty0 = await ev(() => {
    const d = window.__doc('FTbl'), it = window.__para(d, 'FT a');
    d.view.setSelection({ id: it.id, off: 4 });
    return { ...window.__ft(d), depth: d.view.undoDepth, doc: JSON.stringify(d.d.doc.sections) };
  });
  await page.keyboard.type(' one two three four five six');
  await settledOf('FTbl');
  const ty1 = await ev(() => {
    const d = window.__doc('FTbl'), L = d.view.layout, h = d.dw.view.sel.head, c = L.caretRect(h, d.dw.view.sel.affinity);
    const rc = L.place.sheet.rect(L.place.pages.at(0));
    return { ...window.__ft(d), depth: d.view.undoDepth, head: window.__head(d), caret: [c.x - rc.x, c.y - rc.y, c.h] };
  });
  const inF = (c, F) => c[0] >= F[0] && c[0] <= F[0] + F[2] && c[1] >= F[1] && c[1] + c[2] <= F[1] + F[3] + 0.5;
  ok('type in a floating table: the table grows, the paragraph beside it re-breaks round it, the caret stays in the '
    + 'cell where the table is placed', ty1.F && ty1.F[3] > ty0.F[3] && ty1.head === 'FT a one two three four five six'
    && inF(ty1.caret, ty1.F) && besideT(ty1, ty1.F).length > besideT(ty0, ty0.F).length
    && besideT(ty1, ty1.F).every(([x]) => Math.abs(x - (ty1.F[0] + ty1.F[2] + 12)) < 0.5) && ty1.depth > ty0.depth, { ty0: { ...ty0, doc: 0 }, ty1 });
  await ev(async (n) => { const d = window.__doc('FTbl'); while (d.view.undoDepth > n) { d.view.press('undo'); await window.__frames(1); } },
    ty0.depth);
  await settledOf('FTbl');
  const ty2 = await ev(() => { const d = window.__doc('FTbl'); return { ...window.__ft(d), doc: JSON.stringify(d.d.doc.sections) }; });
  ok('Undo: the Doc deep-equal to before, the table and the earlier line breaks back', ty2.doc === ty0.doc
    && same(ty2.lines, ty0.lines) && same(ty2.F, ty0.F), { ty0: { ...ty0, doc: 0 }, ty2: { ...ty2, doc: 0 } });

  // Table > Insert > Rows above, inside it
  const ra = await ev(async () => {
    const d = window.__doc('FTbl'), it = window.__para(d, 'FT b'), depth = d.view.undoDepth;
    d.view.setSelection({ id: it.id, off: 2 });
    const tb = d.win.menu({}).items.find((i) => i.text === 'Table').submenu();
    const ins = tb.items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === 'Rows above');
    ins.action(ins);
    await window.__frames(2);
    return { depth: d.view.undoDepth - depth,
      rows: d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl').rows.map((rw) => rw.cells.map((c) => c.blocks[0].text)) };
  });
  await settledOf('FTbl');
  const ra1 = await ev(() => window.__ft(window.__doc('FTbl')));
  ok('Table > Insert > Rows above inside it: one undo step, a row above, the table still placed and taller, the text '
    + 'beside it wrapped round it', ra.depth === 1 && same(ra.rows, [['FT a', 'FT c'], ['', ''], ['FT b', 'FT d']])
    && ra1.F && ra1.F[3] > ft0.F[3] && besideT(ra1, ra1.F).every(([x]) => Math.abs(x - (ra1.F[0] + ra1.F[2] + 12)) < 0.5)
    && besideT(ra1, ra1.F).length > besideT(ft0, ft0.F).length, { ra, ra1 });
  await ev(async () => { const d = window.__doc('FTbl'); d.view.press('undo'); await window.__frames(2); });
  await settledOf('FTbl');

  // drags: its outline (P12b fix I2) and a column border inside it, as in any table
  const tclient = (fx, fy) => ev(([fx, fy]) => {
    const d = window.__doc('FTbl'), L = d.view.layout, F = L.place.pages.at(0).floats.find((f) => f.tbl !== undefined);
    const rc = L.place.sheet.rect(L.place.pages.at(0)), z = d.view.zoom, t = L.top;
    const w = { x: (rc.x + F.x + F.w * fx) * z, y: t + (rc.y + F.y + F.h * fy - t) * z }, sc = d.win.workToScreen(w.x, w.y);
    const b = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: b.left + sc.x * k, y: b.top + sc.y * k, F: [F.x, F.y, F.w, F.h] };
  }, [fx, fy]);
  const tst = () => ev(() => { const d = window.__doc('FTbl'), t = d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl');
    return { depth: d.view.undoDepth, beeps: window.__beeps, tbl: window.__tblJson(d), F: window.__ft(d).F,
      ghost: d.dw.view.tblGhost ?? null, grid: t.grid.slice(), pPr: JSON.stringify(t.tblPr.extra) }; });
  const drag2 = async (a, dx, dy) => {
    await page.waitForTimeout(450);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 });
    await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 });
    await ev(() => window.__frames(2));
    await page.mouse.up();
    await ev(() => window.__frames(3));
  };
  const dg0 = await tst();
  const right = await tclient(1, 0.5), k = await ev(() => os.wimp.scale);
  await drag2({ x: right.x - 1 * k, y: right.y }, 40, 0);
  await settledOf('FTbl');
  const dg1 = await tst();
  await drag2((await tclient(0.25, 0.97)), 0, 40);
  await settledOf('FTbl');
  const dg2 = await tst();
  ok('a drag on the floating table\'s outline resizes it as any table, its position kept (P12b fix I2): its right '
    + 'edge widens its last column, its bottom makes its last row taller, one undo step each, no beep, tblpPr the same',
  dg1.beeps === dg0.beeps && dg1.depth === dg0.depth + 1 && dg1.grid[1] > dg0.grid[1] && dg1.grid[0] === dg0.grid[0]
    && dg1.F && dg1.F[0] === dg0.F[0] && dg1.F[1] === dg0.F[1] && dg1.F[2] > dg0.F[2] && dg1.pPr === dg0.pPr
    && dg2.beeps === dg0.beeps && dg2.depth === dg0.depth + 2 && dg2.F && dg2.F[3] > dg1.F[3]
    && dg2.F[1] === dg0.F[1] && dg2.pPr === dg0.pPr && !dg2.ghost,
  { dg0: { ...dg0, tbl: 0 }, dg1: { ...dg1, tbl: 0 }, dg2: { ...dg2, tbl: 0 } });
  for (let n = 0; n < 2; n++) {
    await ev(async () => { const d = window.__doc('FTbl'); d.view.press('undo'); await window.__frames(2); });
  }
  await settledOf('FTbl');
  await drag2((await tclient(0.5, 0.25)), 20, 0);
  await settledOf('FTbl');
  const dg3 = await ev(() => { const d = window.__doc('FTbl'), t = d.d.doc.sections[0].blocks.find((b) => b.type === 'tbl');
    return { depth: d.view.undoDepth, beeps: window.__beeps, grid: t.grid.slice(), F: window.__ft(d).F,
      pPr: JSON.stringify(t.tblPr.extra) }; });
  ok('a column border inside it dragged: the two columns change in one undo step, the table still placed where it was',
    dg3.depth === dg0.depth + 1 && dg3.beeps === dg2.beeps && dg3.grid[0] > 1000 && dg3.grid[0] + dg3.grid[1] === 2000
    && dg3.F && dg3.F[0] === dg0.F[0] && dg3.F[1] === dg0.F[1] && /tblpPr/.test(dg3.pPr), dg3);
  await ev(async () => { const d = window.__doc('FTbl'); d.view.press('undo'); await window.__frames(2); });

  // 100 pages with a floating table on each: a keystroke in a cell (the P12.3 budget)
  await ev(async () => { await window.__word().word.open('RAM::RamDisc0.$.FTbl100'); });
  await settledOf('FTbl100');
  const perf = await ev(async () => {
    const d = window.__doc('FTbl100'), w = d.win, it = window.__para(d, 'c50'), times = [];
    d.view.setSelection({ id: it.id, off: 3 });
    for (let n = 0; n < 23; n++) {
      const t0 = performance.now();
      w.emit('textinput', { text: 'x', window: w });
      d.dw.view.flush();
      times.push(performance.now() - t0);
      for (let j = 0; j < 400; j++) {
        const P = d.view.pages();
        if (P && P.done && !d.dw.colDue && !d.dw.wrapDue) break;
        await window.__frames(1);
      }
    }
    const med = times.slice(3).sort((a, b) => a - b)[10];
    const L = d.view.layout;
    return { med: +med.toFixed(2), pages: L.place.pages.count, text: window.__head(d),
      placed: L.place.pages.at(50).floats.filter((f) => f.tbl !== undefined).length };
  });
  ok(`100 pages with a floating table on each: a keystroke in a cell < 30 ms (median of 20: ${perf.med} ms)`,
    perf.med < 30 && perf.pages === 100 && perf.placed === 1 && perf.text === 'c50' + 'x'.repeat(23), perf);

  const msgs = await ev(() => window.__msgs);
  ok('nothing reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
