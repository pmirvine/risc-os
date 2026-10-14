// !Letters' views in the real desktop (Batch D P3.4, D29, D30, D34,
// OD2), part 1: a three-page document opens in Print layout (three
// white pages, grey desk between them, by pixel); a file whose
// settings say w:view normal opens in Draft; View > Draft and back
// keeps the selection and the caret's line where it was in the window;
// the choice is remembered for the next window; the info line on the
// second toolbar row says "Page 2 of 3" at the caret (and the section
// when there are several; nothing in Draft for one section); View >
// Formatting marks draws the break rules in Print layout, and only
// then; the bytes saved do not change with the view (OD2: nothing
// written for it; every part of the zip compared byte for byte, not
// the zip, whose time stamps are the time saved); a long document's pages are worked out in slices
// after it opens, the extent growing to hold them all, typing working
// meanwhile, and a window closed while they are still being worked out
// stops them. Part 3, tables across pages (P4.2, D8): a table
// running over three pages shows its shaded header row at the top of
// pages 2 and 3 (by pixel); a row cut across pages 1 and 2: Down
// from its cell's last line on page 1 goes to the same cell's
// continuation on page 2 (PG35), the caret drawn there; a real click
// in that continuation and one in a repeated header row put the caret
// in the cell drawn there and in the original header row (PG10).
// Part 4, floating pictures (P12.2, D26): in Print layout a floating
// picture is zero width in its line and drawn where its anchor puts
// it on the page; View > Draft shows it inline (dashed) again,
// re-breaking only its paragraph, and back. Part 5, text wrap
// (P12.3, D27): the lines beside a square-wrapped float start right
// of it (its width and distR) in Print layout, those below it at the
// margin; Draft shows the picture inline and no wrap; back in Print
// layout the wrap again. Part 6, a floating table (P12.6, R5):
// placed at its tblpX / tblpY in Print layout, drawn there and
// taking no height in the flow; a click in it puts the caret in the
// cell drawn there and typing goes in; Draft keeps it in the flow.
// Needs the disc built by tools/disc-wimplib.mjs and
// disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p, r } from './build-docx.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';
import { drawingXml } from './pic-fixtures.mjs';

const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" '
  + 'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
const PBB = '<w:pageBreakBefore/>';
const THREE = p(r('Page one.')) + p(r('Page two, after a page break before.'), PBB)
  + p('<w:r><w:br w:type="page"/></w:r>' + r('Page three, after a page break.')) + SECT;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const LONG = Array.from({ length: 900 }, (_, i) => p(r(Array.from({ length: 30 }, (_, j) => WORDS[(i + j) % 10]).join(' '))))
  .join('') + SECT;
const TWO_SECT = p(r('Section one.')) + p(r('End of one.'), '<w:sectPr><w:type w:val="nextPage"/></w:sectPr>')
  + p(r('Section two.')) + SECT;
const TC = (body, pr = '') => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/>${pr}</w:tcPr>${body}</w:tc>`;
const HEAD = '<w:shd w:val="clear" w:color="auto" w:fill="00B050"/>';
const TROWS = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>' + TC(p(r('Head A')), HEAD) + TC(p(r('Head B')), HEAD) + '</w:tr>']
  .concat(Array.from({ length: 30 }, (_, i) => '<w:tr>' + TC(p(r('row ' + i))) + TC(p(r('cell ' + i))) + '</w:tr>'))
  .concat(['<w:tr>' + TC(Array.from({ length: 60 }, (_, j) => p(r('tall ' + j))).join('')) + TC(p(r('beside'))) + '</w:tr>'])
  .concat(Array.from({ length: 60 }, (_, i) => '<w:tr>' + TC(p(r('more ' + i))) + TC(p(r('x ' + i))) + '</w:tr>'));
const TABLE = p(r('Before the table.')) + '<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/><w:tblBorders>'
  + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((x) => `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('')
  + '</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>' + TROWS.join('')
  + '</w:tbl>' + p(r('After the table.')) + SECT;
// a floating picture (96 x 48 px, no media: its alt text drawn) at 200, 300 px on the page
const FLOAT = p(r('Before.') + '<w:r>' + drawingXml({ kind: 'anchor', cx: 96 * 9525, cy: 48 * 9525, descr: 'FLOATPIC' })
  .replace(/<wp:positionH[^]*<\/wp:positionV>/, '<wp:positionH relativeFrom="page"><wp:posOffset>1905000</wp:posOffset>'
    + '</wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>2857500</wp:posOffset></wp:positionV>') + '</w:r>'
  + r('After.')) + p(r('Second paragraph.')) + SECT;
// a square-wrapped float (96 x 96 px, distL/R 12 px) at the column's left, beside a long paragraph
const WRAP = p('<w:r>' + drawingXml({ kind: 'anchor', cx: 96 * 9525, cy: 96 * 9525, descr: 'WRAPPIC' }) + '</w:r>'
  + r(Array.from({ length: 120 }, (_, i) => WORDS[i % 10]).join(' '))) + SECT;
// a floating table (tblpPr: page anchored, 2 in / 5 in from the page corner) between two paragraphs (P12.6)
const FTBL = p(r('Above the table.')) + '<w:tbl><w:tblPr><w:tblpPr w:horzAnchor="page" w:vertAnchor="page" '
  + 'w:tblpX="2880" w:tblpY="7200"/><w:tblOverlap w:val="never"/><w:tblW w:w="4000" w:type="dxa"/></w:tblPr><w:tblGrid>'
  + '<w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr>' + ['FT one', 'FT two'].map((t) => '<w:tc><w:tcPr>'
  + '<w:tcW w:w="2000" w:type="dxa"/></w:tcPr>' + p(r(t)) + '</w:tc>').join('') + '</w:tr></w:tbl>'
  + p(r('Below the table.')) + SECT;
const files = {
  FloatTbl: await buildDocx({ 'word/document.xml': documentXml(FTBL) }),
  Wrap: await buildDocx({ 'word/document.xml': documentXml(WRAP) }),
  Float: await buildDocx({ 'word/document.xml': documentXml(FLOAT) }),
  Table: await buildDocx({ 'word/document.xml': documentXml(TABLE) }),
  Three: await buildDocx({ 'word/document.xml': documentXml(THREE) }),
  Normal: await buildDocx({ 'word/document.xml': documentXml(THREE),
    'word/settings.xml': settingsXml('<w:view w:val="normal"/><w:zoom w:percent="100"/>') }),
  Again: await buildDocx({ 'word/document.xml': documentXml(THREE) }),
  Long: await buildDocx({ 'word/document.xml': documentXml(LONG) }),
  Sects: await buildDocx({ 'word/document.xml': documentXml(TWO_SECT) }),
};
for (const k of Object.keys(files)) files[k] = Array.from(files[k]);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf);
    window.__open = async (leaf) => {
      const t = window.__word();
      await t.word.open(`RAM::RamDisc0.$.${leaf}`);
      await window.__frames(3);
      return window.__doc(leaf);
    };
    /** The colour of d's canvas at a work-area point (visible) -> [r, g, b]. */
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w;
      const q = cv.getContext('2d').getImageData(Math.round((x - w.scrollX) * k), Math.round((y - w.scrollY) * k), 1, 1).data;
      return [q[0], q[1], q[2]];
    };
    /** View menu item `text` of d chosen (as a click on it does). */
    window.__view = (d, text) => {
      const m = d.win.menu({}).items.find((i) => i.text === 'View').submenu();
      const it = m.items.find((i) => i.text === text);
      it.action(it);
    };
    /** The View menu's rows: [text, ticked, shaded]. */
    window.__viewRows = (d) => d.win.menu({}).items.find((i) => i.text === 'View').submenu().items.map((i) => [i.text,
      !!(typeof i.ticked === 'function' ? i.ticked(i) : i.ticked), !!(typeof i.shaded === 'function' ? i.shaded(i) : i.shaded)]);
    /** The texts d's window draws in one redraw of what shows (fillText spied on, put back). */
    window.__drawn = async (d) => {
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      proto.fillText = function (t, ...a) { seen.push(String(t)); return real.call(this, t, ...a); };
      try {
        d.win.invalidate();
        await window.__frames(2);
      } finally {
        proto.fillText = real;
      }
      return seen;
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  // ------------------------------------------------ opens in Print layout: three pages, desk between
  const o1 = await ev(async () => {
    const d = await window.__open('Three'), w = d.win, L = d.view.layout, S = L.place.sheet, P = L.place.pages;
    const res = { view: d.viewName, pages: d.view.pages(), rects: [0, 1, 2].map((i) => S.rect(P.at(i))), ext: w.extent.y1 - w.extent.y0 };
    res.white = [];
    res.desk = [];
    for (let i = 0; i < 3; i++) {
      const rc = res.rects[i];
      w.scrollTo(0, Math.max(0, rc.y - 100));
      await window.__frames(2);
      res.white.push(window.__px(d, rc.x + 20, rc.y + 20), window.__px(d, rc.x + rc.w - 20, rc.y + 600));
      res.desk.push(window.__px(d, rc.x + rc.w / 2, rc.y - 3), window.__px(d, rc.x - 10, rc.y + 200));
    }
    return res;
  });
  const W = [255, 255, 255], DESK = [136, 136, 136];
  ok('a file with no w:view opens in Print layout, three pages worked out', o1.view === 'print'
    && o1.pages.count === 3 && o1.pages.done && o1.pages.caretPage === 0, o1);
  ok('the pages are stacked 16 px apart, the same size', o1.rects[1].y - (o1.rects[0].y + o1.rects[0].h) === 16
    && o1.rects[2].y - (o1.rects[1].y + o1.rects[1].h) === 16 && o1.rects.every((rc) => rc.h === 1056 && rc.w === 816), o1.rects);
  ok('each page is white (inside its corners), with grey desk above it and beside it',
    o1.white.every((c) => same(c, W)) && o1.desk.every((c) => same(c, DESK)), o1);
  ok('the extent reaches the third page\'s bottom', o1.ext >= o1.rects[2].y + o1.rects[2].h, o1);
  const m1 = await ev(() => window.__viewRows(window.__doc('Three')));
  ok('View: Print layout (ticked), Web layout enabled (P13.1), Outline enabled (P13.2), Draft, Formatting marks, Ruler (ticked), Header and footer, its options (shaded), Field codes, Field shading (P8.4)', same(m1,
    [['Print layout', true, false], ['Web layout', false, false], ['Outline', false, false], ['Draft', false, false],
      ['Formatting marks', false, false], ['Ruler', true, false], ['Header and footer', false, false],
      ['Header and footer options', false, true], ['Field codes', false, false], ['Field shading', false, false]]), m1);
  const wm = await ev(() => window.__doc('Three').win.menu({}).items.map((i) => i.text));
  ok('the window menu has View after Insert', same(wm.slice(5, 10), ['Edit', 'Insert', 'View', 'Outline', 'Format']), wm);
  const fm = await ev(() => window.__doc('Three').win.menu({}).items.find((i) => i.text === 'Format').submenu().items.map((i) => i.text));
  ok('Format has no Ruler any more', !fm.includes('Ruler') && fm.includes('Format painter'), fm);

  // ------------------------------------------------ the info line
  const i1 = await ev(async () => {
    const d = window.__doc('Three'), L = d.view.layout, res = {};
    res.start = d.pageInfo;
    d.view.setSelection({ id: L.items[1].id, off: 4 });
    await window.__frames(3);
    res.two = d.pageInfo;
    res.caretPage = d.view.pages().caretPage;
    d.view.setSelection({ id: L.items[2].id, off: 4 });
    await window.__frames(3);
    res.three = d.pageInfo;
    return res;
  });
  ok('the info line: Page 1 of 3, Page 2 of 3, Page 3 of 3 at the caret', i1.start === 'Page 1 of 3'
    && i1.two === 'Page 2 of 3' && i1.caretPage === 1 && i1.three === 'Page 3 of 3', i1);
  const i2 = await ev(async () => {
    const d = await window.__open('Sects'), L = d.view.layout, res = { a: d.pageInfo };
    d.view.setSelection({ id: L.items[2].id, off: 1 });
    await window.__frames(3);
    res.b = d.pageInfo;
    window.__view(d, 'Draft');
    await window.__frames(3);
    res.draft = d.pageInfo;
    window.__view(d, 'Print layout');
    await window.__frames(3);
    d.dw.close();
    return res;
  });
  ok('several sections: the section too; Draft: the section only', i2.a === 'Page 1 of 2 (Section 1)'
    && i2.b === 'Page 2 of 2 (Section 2)' && i2.draft === 'Section 2', i2);

  // ------------------------------------------------ Formatting marks
  const f1 = await ev(async () => {
    const d = window.__doc('Three'), w = d.win, L = d.view.layout, S = L.place.sheet, P = L.place.pages;
    const rc = S.rect(P.at(1));
    w.scrollTo(0, rc.y - 300);
    await window.__frames(2);
    const off = await window.__drawn(d);
    window.__view(d, 'Formatting marks');
    await window.__frames(2);
    const on = await window.__drawn(d);
    const ticked = window.__viewRows(d).find((x) => x[0] === 'Formatting marks')[1];
    window.__view(d, 'Formatting marks');
    await window.__frames(2);
    const label = (t) => /^(Page|Column|Section) break/.test(t) && !/,/.test(t);
    return { off: off.filter(label), on: on.filter(label), ticked, marks: d.marks };
  });
  ok('Print layout: no break rules without Formatting marks; with them, Page break before and Page break',
    f1.off.length === 0 && f1.on.includes('Page break before') && f1.on.includes('Page break') && f1.ticked && !f1.marks, f1);

  // ------------------------------------------------ View > Draft and back: caret and its line kept
  const v1 = await ev(async () => {
    const d = window.__doc('Three'), w = d.win, L = d.view.layout;
    d.view.setSelection({ id: L.items[1].id, off: 9 });
    await window.__frames(2);
    const c0 = d.view.caretRect();
    w.scrollTo(0, Math.max(0, c0.y - d.inset - 40));
    await window.__frames(2);
    const at = (c) => c.y - w.scrollY;
    const res = { sel0: d.view.selection, y0: at(d.view.caretRect()), sy0: w.scrollY };
    window.__view(d, 'Draft');
    await window.__frames(3);
    res.view1 = d.viewName;
    res.pages1 = d.view.pages();
    res.sel1 = d.view.selection;
    res.y1 = at(d.view.caretRect());
    res.marksDraft = (await window.__drawn(d)).filter((t) => /^Page break/.test(t)).length;
    res.rows = window.__viewRows(d).slice(0, 4).map((x) => x[1]);
    window.__view(d, 'Print layout');
    await window.__frames(3);
    res.view2 = d.viewName;
    res.sel2 = d.view.selection;
    res.y2 = at(d.view.caretRect());
    res.sy2 = w.scrollY;
    res.focus = os.wimp.caret?.window === w;
    return res;
  });
  ok('View > Draft: the Draft view, no pages, the selection kept, the caret\'s line where it was in the window',
    v1.view1 === 'draft' && v1.pages1 === null && same(v1.sel1, v1.sel0) && v1.y1 === v1.y0 && same(v1.rows, [false, false, false, true]), v1);
  ok('... Draft draws its break marks always (as before)', v1.marksDraft > 0, v1);
  ok('View > Print layout again: the same selection, the same scroll and the caret where it was',
    v1.view2 === 'print' && same(v1.sel2, v1.sel0) && v1.y2 === v1.y0 && v1.sy2 === v1.sy0, v1);

  // ------------------------------------------------ remembered for the next window; a file's w:view first
  const r1 = await ev(async () => {
    const d = window.__doc('Three');
    window.__view(d, 'Draft');
    await window.__frames(2);
    const a = await window.__open('Again');
    const n = await window.__open('Normal');
    const res = { again: a.viewName, normal: n.viewName, pages: n.view.pages(), choice: window.__word().word.choices?.view };
    a.dw.close();
    window.__view(d, 'Print layout');
    await window.__frames(2);
    const b = await window.__open('Again');
    res.after = b.viewName;
    b.dw.close();
    return res;
  });
  ok('the view chosen is the next window\'s (Draft, then Print layout again)', r1.again === 'draft' && r1.after === 'print', r1);
  ok('w:view normal opens in Draft', r1.normal === 'draft' && r1.pages === null, r1);

  // ------------------------------------------------ OD2: the bytes saved do not depend on the view
  const s1 = await ev(async () => {
    const d = window.__doc('Normal'), settings = d.doc.rawSettings;
    const a = await d.saveBytes();
    window.__view(d, 'Print layout');
    await window.__frames(3);
    const b = await d.saveBytes();
    window.__view(d, 'Draft');
    await window.__frames(3);
    const c = await d.saveBytes();
    window.__view(d, 'Print layout');
    await window.__frames(3);
    const res = { zips: [a, b, c].map((x) => Array.from(x)), settings: d.doc.rawSettings === settings, dirty: d.view.dirty };
    d.dw.close();
    return res;
  });
  // (the parts compared, byte for byte: the zip's time stamps are the time saved, so two saves a second apart differ)
  {
    const [za, zb, zc] = await Promise.all(s1.zips.map((x) => readZip(new Uint8Array(x))));
    delete s1.zips;
    const same = (x, y) => x.size === y.size && [...x].every(([n, v]) => {
      const u = y.get(n);
      return u && u.length === v.length && u.every((q, i) => q === v[i]);
    });
    s1.ab = same(za, zb);
    s1.ac = same(za, zc);
    s1.parts = za.size;
  }
  ok('the file saved after switching views has every part byte-identical; settings untouched; not marked changed',
    s1.ab && s1.ac && s1.parts > 2 && s1.settings && !s1.dirty, s1);

  // ------------------------------------------------ a long document: slices, extent grows, typing meanwhile
  const l1 = await ev(async () => {
    const t = window.__word();
    await t.word.open('RAM::RamDisc0.$.Long');
    const d = window.__doc('Long'), w = d.win;
    const res = { first: d.view.pages(), ext0: w.extent.y1 - w.extent.y0, info0: d.pageInfo };
    d.view.type('X');
    await window.__frames(1);
    for (let i = 0; i < 600 && !d.view.pages().done; i++) await window.__frames(1);
    await window.__frames(2);
    const L = d.view.layout, P = L.place.pages, last = L.place.sheet.rect(P.at(P.count - 1));
    res.done = d.view.pages();
    res.ext = w.extent.y1 - w.extent.y0;
    res.bottom = last.y + last.h;
    res.text = d.view.lines()[0].slice(0, 6);
    res.info = d.pageInfo;
    return res;
  });
  ok('a long document opens with its pages still being worked out ("..." in the info line)',
    !l1.first.done && /^Page 1 of \d+\.\.\.$/.test(l1.info0), l1);
  ok('the slices finish and the extent grows to hold every page (D34)', l1.done.done && l1.done.count > 20
    && l1.ext >= l1.bottom && l1.ext > l1.ext0 && l1.info === `Page 1 of ${l1.done.count}`, l1);
  ok('typing works while they are worked out', l1.text === 'Xalpha', l1);
  const c1 = await ev(async () => {
    const t = window.__word();
    const d = window.__doc('Long');
    d.dw.close();
    await t.word.open('RAM::RamDisc0.$.Long');
    const e = window.__doc('Long'), P0 = e.view.layout.place.pages, n0 = P0.count, done0 = P0.done;
    e.dw.close();
    await window.__frames(6);
    return { n0, done0, n1: P0.count, closed: e.closed };
  });
  ok('a window closed while its pages are being worked out stops them', !c1.done0 && c1.n1 === c1.n0 && c1.closed, c1);

  // ------------------------------------------------ part 3: tables across pages (P4.2)
  const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(2)); };
  await ev(async () => {
    const d = await window.__open('Table');
    for (let i = 0; i < 100 && !d.view.pages().done; i++) await window.__frames(1);
    /** The client point of work-area point (x, y) of d, scrolled to show it. */
    window.__clientAt = async (d, x, y) => {
      const w = d.win;
      w.scrollTo(Math.max(0, Math.round(x - w.w / 2)), Math.max(0, Math.round(y - w.h / 2)));
      await window.__frames(2);
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__item = (d, text) => [...d.view.layout.byId.values()].find((x) => x.kind === 'p' && x.para.text === text);
    window.__tfrags = (d) => {
      const Pl = d.view.layout.place, out = [];
      for (let i = 0; Pl.pages.at(i); i++) {
        const f = Pl.pageFrags(i).find((x) => x.it.kind === 'tbl');
        if (f) out.push({ i, r0: f.r0, r1: f.r1, from: f.from, cuts: f.cuts, heads: f.heads });
      }
      return out;
    };
  });
  const tt1 = await ev(async () => {
    const d = window.__doc('Table'), L = d.view.layout, Pl = L.place, P = Pl.pages, res = { frags: window.__tfrags(d), px: [] };
    const hx = Pl.lineAt(window.__item(d, 'Head A'), 0).x + 60;
    for (const { i } of res.frags.slice(1)) {
      const rc = Pl.sheet.rect(P.at(i)), fy = rc.y + P.at(i).frames[0].y;
      d.win.scrollTo(0, Math.max(0, fy - 100));
      await window.__frames(2);
      res.px.push({ i, c: window.__px(d, hx, fy + 6) });
    }
    return res;
  });
  const GREEN = [0, 176, 80];
  ok('a table over three pages: its shaded header row at the top of every page it shows on', tt1.frags.length >= 3
    && tt1.frags.slice(1).every((f) => f.heads === 1) && tt1.px.every((x) => same(x.c, GREEN)), tt1);
  const td0 = await ev(() => {
    const d = window.__doc('Table'), L = d.view.layout, f = window.__tfrags(d).find((x) => x.cuts && !x.from);
    const it = window.__item(d, 'tall ' + (f.cuts[0] - 1));
    d.view.setSelection({ id: it.id, off: 2 });
    return { f, id: it.id, page: L.place.pageOf(it, 0) };
  });
  await press('ArrowDown');
  const td1 = await ev((td0) => {
    const d = window.__doc('Table'), L = d.view.layout, h = d.view.selection.head, it = L.byId.get(h.id);
    const c = L.caretRect(h), pg = L.place.pageOf(it, 0), rc = L.place.sheet.rect(L.place.pages.at(pg));
    return { text: it.para.text, page: pg, inPage: c.y >= rc.y && c.y + c.h <= rc.y + rc.h,
      want: 'tall ' + td0.f.cuts[0] };
  }, td0);
  ok('Down from a split cell\'s last line on page 1: the same cell\'s continuation on page 2 (PG35)',
    td1.text === td1.want && td1.page === td0.page + 1 && td1.inPage, { td0, td1 });
  const tc0 = await ev(async () => {
    const d = window.__doc('Table'), it = window.__item(d, 'tall 50'), p = d.view.layout.place.lineAt(it, 0);
    return { q: await window.__clientAt(d, p.x + 10, p.y + it.lines[0].h / 2), page: d.view.layout.place.pageOf(it, 0) };
  });
  await page.mouse.click(tc0.q.x, tc0.q.y);
  await ev(() => window.__frames(2));
  const tc1 = await ev(() => { const d = window.__doc('Table'); return d.view.layout.byId.get(d.view.selection.head.id).para.text; });
  ok('a click in the rest of a cut row puts the caret in the line drawn there', tc1 === 'tall 50', { tc0, tc1 });
  const th0 = await ev(async () => {
    const d = window.__doc('Table'), Pl = d.view.layout.place, P = Pl.pages, f = window.__tfrags(d).at(-1);
    const rc = Pl.sheet.rect(P.at(f.i)), x = Pl.lineAt(window.__item(d, 'Head B'), 0).x + 10;
    return { i: f.i, q: await window.__clientAt(d, x, rc.y + P.at(f.i).frames[0].y + 8) };
  });
  await page.mouse.click(th0.q.x, th0.q.y);
  await ev(() => window.__frames(2));
  const th1 = await ev(() => {
    const d = window.__doc('Table'), it = d.view.layout.byId.get(d.view.selection.head.id);
    return { text: it.para.text, page: d.view.layout.place.pageOf(it, 0) };
  });
  ok('a click in a repeated header row: the caret in the original header row (PG10)', th1.text === 'Head B' && th1.page === 0, { th0, th1 });
  await ev(() => window.__doc('Table').dw.close());

  // ------------------------------------------------ floating pictures placed on their pages (P12.2)
  const fl = await ev(async () => {
    const d = await window.__open('Float');
    const kinds = () => d.view.layout.items[0].lines[0].items.map((x) => [x.kind, Math.round(x.w)]);
    const res = { view: d.viewName, print: kinds() };
    const P = d.view.layout.place.pages, f = P.at(0).floats;
    res.floats = f.map((x) => [x.x, x.y, x.w, x.h, x.pic.alt]);
    res.drawn = (await window.__drawn(d)).filter((t) => t === 'FLOATPIC').length;
    const second = d.view.layout.items[1].lines;
    window.__view(d, 'Draft');
    await window.__frames(3);
    res.draft = kinds();
    res.kept = d.view.layout.items[1].lines === second;
    res.drawnDraft = (await window.__drawn(d)).filter((t) => t === 'FLOATPIC').length;
    window.__view(d, 'Print layout');
    await window.__frames(3);
    res.back = kinds();
    res.floats2 = d.view.layout.place.pages.at(0).floats.length;
    d.dw.close();
    return res;
  });
  ok('Print layout: a floating picture is zero width in its line, placed at its page offsets and drawn',
    fl.view === 'print' && fl.print[1][0] === 'anchor' && fl.print[1][1] === 0 && same(fl.floats, [[200, 300, 96, 48, 'FLOATPIC']])
    && fl.drawn === 1, fl);
  ok('View > Draft: the picture inline again (its paragraph re-broken, the others kept), and back',
    fl.draft[1][0] === 'pic' && fl.draft[1][1] === 96 && fl.kept && fl.drawnDraft === 1
    && fl.back[1][0] === 'anchor' && fl.floats2 === 1, fl);

  // ------------------------------------------------ text wrapped round a float (P12.3)
  const wr = await ev(async () => {
    const d = await window.__open('Wrap');
    await window.__frames(3);
    const xs = () => d.view.layout.items[0].lines.map((l) => [Math.round(l.x), Math.round(l.y)]);
    const res = { view: d.viewName, print: xs(), wrap: !!d.dw.wrap };
    window.__view(d, 'Draft');
    await window.__frames(3);
    res.draft = xs();
    window.__view(d, 'Print layout');
    await window.__frames(3);
    res.back = xs();
    d.dw.close();
    return res;
  });
  const beside = (ls) => ls.filter(([, y]) => y < 96);
  ok('Print layout: the lines beside a square-wrapped float start right of it (width + distR), those below at the margin',
    wr.view === 'print' && wr.wrap && beside(wr.print).length >= 2 && beside(wr.print).every(([x]) => x === 108)
    && wr.print.some(([x, y]) => y >= 96 && x === 0), wr);
  ok('View > Draft: no wrap (the picture inline); back in Print layout the wrap again',
    wr.draft.every(([x]) => x === 0) && same(wr.back, wr.print), wr);

  // ------------------------------------------------ a floating table placed on its page (P12.6, R5)
  const ft0 = await ev(async () => {
    const d = await window.__open('FloatTbl');
    await window.__frames(3);
    const L = d.view.layout, Pl = L.place, pg = Pl.pages.at(0), rc = Pl.sheet.rect(pg);
    const tf = pg.floats.filter((x) => x.tbl !== undefined).map((x) => [x.x, x.y]);
    const it = window.__item(d, 'FT one'), at = Pl.lineAt(it, 0);
    const below = Pl.lineAt(window.__item(d, 'Below the table.'), 0);
    const above = Pl.lineAt(window.__item(d, 'Above the table.'), 0);
    return { view: d.viewName, tf, at: [at.x - rc.x, at.y - rc.y], gap: below.y - above.y,
      drawn: (await window.__drawn(d)).includes('FT one'),
      q: await window.__clientAt(d, at.x + 4, at.y + it.lines[0].h / 2) };
  });
  ok('Print layout: a floating table placed at its tblpX / tblpY on the page, drawn there, no height in the flow',
    ft0.view === 'print' && same(ft0.tf, [[192, 480]]) && ft0.at[1] >= 479 && ft0.at[1] < 520 && ft0.at[0] >= 192
    && ft0.drawn && ft0.gap < 40, ft0);
  await page.mouse.click(ft0.q.x, ft0.q.y);
  await ev(() => window.__frames(2));
  await page.keyboard.type('Z');
  await ev(() => window.__frames(3));
  const ft1 = await ev(async () => {
    const d = window.__doc('FloatTbl'), L = d.view.layout, h = d.view.selection.head, it = L.byId.get(h.id);
    const rc = L.place.sheet.rect(L.place.pages.at(0)), c = L.caretRect(h);
    const res = { text: it.para.text, caret: [c.x - rc.x, c.y - rc.y] };
    window.__view(d, 'Draft');
    await window.__frames(3);
    const L2 = d.view.layout;
    res.draftTop = L2.place.lineAt(window.__item(d, it.para.text), 0).y
      - L2.place.lineAt(window.__item(d, 'Above the table.'), 0).y;
    window.__view(d, 'Print layout');
    await window.__frames(3);
    return res;
  });
  ok('a click in the placed table puts the caret in the cell drawn there; typing goes into it, the caret stays there',
    ft1.text.replace('Z', '') === 'FT one' && ft1.text.length === 7 && ft1.caret[1] >= 479 && ft1.caret[1] < 520 && ft1.caret[0] >= 192, ft1);
  ok('View > Draft: the floating table back in the flow (under the paragraph above it)',
    ft1.draftTop > 0 && ft1.draftTop < 100, ft1);
  await ev(() => window.__doc('FloatTbl').dw.close());

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
