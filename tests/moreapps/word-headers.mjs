// !Letters' headers and footers in the real desktop (Batch D P7.2,
// D13, PG2), part 1: a document shaped as Word writes it (hf-fixtures
// wordHf: a different first page; the default header holds a picture
// through the header's own relationships and the text "Running head",
// the default footer "Running foot", the first-page header "First
// page head" and no first-page footer) opens in Print layout; each
// page drawn shows, at its top, the first-page header on page 1 only
// and the running header on every later page, the picture drawn there
// by pixel (red) on those pages and not on page 1; at its bottom the
// running footer on every page but the first (titlePg with no first
// footer: an empty one); a tall header pushes the body down (the
// first line of text below it). Part 2 (P7.3, D14): a double-click in
// page 2's header enters the header and footer mode on its story (the
// caret in it, on that page; the body dimmed, the tabs "Header" and
// "First page header" drawn; the info line names it; no undo step);
// typing goes into the story and shows on every page that uses it;
// the caret is confined to it; Ctrl-Enter beeps and changes nothing;
// a click in the body does nothing, one in another page's same header
// moves the caret there; undo in the mode keeps the caret in the
// story; Escape leaves (typing then goes to the body); an undo of a
// header step from the body enters that header's mode (P7.5); View >
// Header and footer toggles it, a double-click in the body leaves; a
// footer is entered the same way; the story removed under the window
// takes it out of the mode; Draft leaves it. Part 3 (P7.4, D14,
// PG15, PG17): a page with no header enters the mode all the same
// (no beep, no step; Escape leaves the document untouched); the first
// letter typed makes the header (one undo step: story, reference,
// Header style) shown on every page; the mode's menu (the window
// menu's Header item, View > Header and footer options): its items;
// Different first page (one step, page 1 then in its own empty
// first-page header, undone); Remove header; Link to previous off in
// section 2 (a copy of section 1's header: typing in it shows in
// section 2 only) and on again (the copy removed, section 1's shown);
// Different odd and even pages (ticked, undone; a beep in a document
// with no settings part). Part 4 (P7.5, D14, Review Focus 2): undo
// creates and removes: a header made by typing (A, then B), left,
// undone from the body: the mode opens on it and B goes; undone
// again: the story gone, the mode left, no stale facade, the caret
// back in the body and the file's bytes as opened; redo the reverse
// (the mode on it again, A, then B); from a footer's mode an undo of
// the header's step switches to the header on that page; a body step
// undone and redone from a header's mode leaves it; Next and Previous
// section move between the sections' headers, the tab saying "Same
// as previous" once linked; Go to footer. Part 5 (P7 fixes): a
// header typed on a page of a linked later section (I1) is made once
// for the chain and shown on every section's pages, still linked;
// undone to the bytes as opened; Remove header undone from the
// footer's mode takes the window to the header put back (M1). Part 6
// (P8.3, D18): a footer "Page { PAGE } of { NUMPAGES }" whose stored
// results are 1 and 1 shows each page's number and the count on
// every page, the model unchanged. Needs
// the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { join } from 'node:path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { wordHf, picRun, BODY } from './hf-fixtures.mjs';
import { fld } from './field-fixtures.mjs';
import { pngBytes } from './pic-fixtures.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const RED = pngBytes(40, 20, { rgb: [255, 0, 0] });
const files = {
  Heads: await wordHf({ titlePg: true, pic: RED, body: BODY(60),
    default: { hdr: p(picRun('rIdP1')) + p(r('Running head')), ftr: p(r('Running foot')) },
    first: { hdr: p(r('First page head')) } }),
  Tall: await wordHf({ body: BODY(20),
    default: { hdr: Array.from({ length: 8 }, (_, i) => p(r('Tall head ' + i))).join('') } }),
  Bare: await wordHf({ body: BODY(30) }),
  Two: await wordHf({ default: { hdr: p(r('Shared head')) },
    body: BODY(12) + p(r('end of one'), '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>')
      + BODY(12) }),
  EvenOdd: await wordHf({ evenAndOdd: true, body: BODY(20), default: { hdr: p(r('Odd head')) } }),
  Undo: await wordHf({ body: BODY(30) }),
  Rem: await wordHf({ body: BODY(30), default: { hdr: p(r('Head R')), ftr: p(r('Foot R')) } }),
  Chain: await wordHf({ body: [0, 1, 2].map((k) => BODY(6) + p(r('end of ' + k), '<w:sectPr>'
    + (k === 1 ? '<w:type w:val="oddPage"/>' : '') + '<w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>')).join('')
    + BODY(6) }),
  Nums: await wordHf({ body: BODY(60),
    default: { ftr: p(r('Page ') + fld(' PAGE ', '1') + r(' of ') + fld(' NUMPAGES ', '1')) } }),
};
for (const k of Object.keys(files)) files[k] = Array.from(files[k]);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

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
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      await window.__frames(3);
      return window.__doc(leaf);
    };
    /** The colour of d's canvas at a work-area point (visible) -> [r, g, b]. */
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w;
      const q = cv.getContext('2d').getImageData(Math.round((x - w.scrollX) * k), Math.round((y - w.scrollY) * k), 1, 1).data;
      return [q[0], q[1], q[2]];
    };
    /** The texts d's window draws in one redraw of what shows, with their work-area y (fillText spied on, put back). */
    window.__drawn = async (d) => {
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      const cv = d.win._canvas, k = cv.width / d.win.w;
      proto.fillText = function (t, x, y, ...a) {
        if (this.canvas === cv) {
          const m = this.getTransform();
          seen.push([String(t), (m.b * x + m.d * y + m.f) / k + d.win.scrollY]);
        }
        return real.call(this, t, x, y, ...a);
      };
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

  // ------------------------------------------------ each page's header and footer
  const h1 = await ev(async () => {
    const d = await window.__open('Heads'), w = d.win, L = d.view.layout, P = L.place.pages, S = L.place.sheet;
    P.finish();
    const geo = L.geom(0), res = { view: d.viewName, count: P.count, pages: [] };
    for (let i = 0; i < P.count; i++) {
      const pg = P.at(i), rc = S.rect(pg), one = { i };
      w.scrollTo(0, rc.y - 4);
      await window.__frames(2);
      // (the picture: wait for its decode, at most 3 s, on the pages that show it)
      const px = () => window.__px(d, rc.x + geo.mar.left + 10, rc.y + geo.mar.header + 10);
      for (let t = 0; i > 0 && t < 60 && px()[1] > 100; t++) await window.__sleep(50);
      one.pic = px();
      const top = await window.__drawn(d);
      const inHead = (re) => top.filter(([t, y]) => re.test(t) && y > rc.y + geo.mar.header && y < rc.y + pg.bodyTop);
      one.first = inHead(/First/).length;
      one.running = inHead(/Running/).length;
      const visH = w.h;
      w.scrollTo(0, rc.y + rc.h - visH + 4);
      await window.__frames(2);
      const bot = await window.__drawn(d);
      one.foot = bot.filter(([t, y]) => /foot/.test(t) && y > rc.y + pg.bodyTop + pg.frameH
        && y < rc.y + rc.h - geo.mar.footer + 1).length;
      one.header = pg.header;
      one.footer = pg.footer;
      res.pages.push(one);
    }
    return res;
  });
  const pages = h1.pages || [];
  ok('a Word-shaped document with headers opens in Print layout, 3 pages or more', h1.view === 'print' && h1.count >= 3, h1);
  ok('different first page: page 1 shows the first-page header, not the running one',
    pages[0]?.first >= 1 && pages[0]?.running === 0 && pages[0]?.header?.type === 'first', pages[0]);
  ok('every later page shows the running header and not the first-page one',
    pages.slice(1).every((x) => x.running >= 1 && x.first === 0 && x.header?.type === 'default'), pages);
  const red = (c) => c[0] > 200 && c[1] < 60 && c[2] < 60;
  ok('the header\'s picture (through the header\'s own relationships) drawn on every later page, by pixel',
    pages.slice(1).every((x) => red(x.pic)), pages.map((x) => x.pic));
  ok('page 1 has no picture there (white)', pages[0] && !red(pages[0].pic), pages[0]);
  ok('the running footer on every page but the first (titlePg: an empty first footer)',
    pages[0]?.foot === 0 && pages[0]?.footer?.part === null && pages.slice(1).every((x) => x.foot >= 1), pages);
  await ev(() => window.__doc('Heads').dw.close());

  // ------------------------------------------------ a tall header pushes the body down
  const t1 = await ev(async () => {
    const d = await window.__open('Tall'), w = d.win, L = d.view.layout, P = L.place.pages, S = L.place.sheet;
    const pg = P.at(0), rc = S.rect(pg), geo = L.geom(0);
    w.scrollTo(0, rc.y - 4);
    await window.__frames(2);
    const drawn = await window.__drawn(d);
    const heads = drawn.filter(([t]) => /Tall|head/.test(t)).map(([, y]) => y);
    const body = drawn.filter(([t]) => /alpha|beta|gamma/.test(t)).map(([, y]) => y);
    const res = { bodyTop: pg.bodyTop, top: geo.mar.top, lastHead: Math.max(...heads), firstBody: Math.min(...body), rcy: rc.y };
    d.dw.close();
    return res;
  });
  ok('a tall header pushes the body down: its first line drawn below the header\'s last',
    t1.bodyTop > t1.top + 40 && t1.firstBody > t1.lastHead && t1.firstBody > t1.rcy + t1.bodyTop, t1);

  // ------------------------------------------------ part 2 (P7.3): the header and footer mode
  const settle = () => ev(() => window.__frames(3));
  const press = async (k) => { await page.keyboard.press(k); await settle(); };
  /** Layout point of d's body (dw.L) -> client point, scrolled into view first. */
  const showAt = (x, y) => ev(async ([x, y]) => {
    const d = window.__doc('Heads'), w = d.win, z = d.view.zoom, t = d.dw.L.top;
    const q = { x: x * z, y: t + (y - t) * z };
    w.scrollTo(Math.max(0, Math.round(q.x - w.w / 2)), Math.max(0, Math.round(q.y - w.h / 2)));
    await window.__frames(2);
    const s = w.workToScreen(q.x, q.y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k };
  }, [x, y]);
  /** Where page i's header (kind 'hdr') or footer text line, or its body, is (body layout px). */
  const spot = (i, where) => ev(([i, where]) => {
    const d = window.__doc('Heads'), L = d.dw.L, P = L.place.pages, pg = P.at(i), rc = L.place.sheet.rect(pg), geo = L.geom(pg.s);
    const x = rc.x + geo.mar.left + 40;
    if (where === 'hdr') return { x, y: rc.y + geo.mar.header + 8 };
    if (where === 'ftr') return { x, y: rc.y + rc.h - geo.mar.footer - 8 };
    return { x, y: rc.y + pg.bodyTop + 30 };
  }, [i, where]);
  /** The window's mode and where the caret is. */
  const state = () => ev(() => {
    const d = window.__doc('Heads'), v = d.dw.view, m = v.hdr, doc = d.dw.doc, head = v.sel && v.sel.head;
    const inStory = (part) => !!part && !!head && doc.stories.get(part).blocks.some((b) => b.id === head.id);
    const body = doc.sections.flatMap((s) => s.blocks.map((b) => b.text));
    return { mode: m ? { part: m.part, kind: m.kind, i: m.i } : null, facade: v.d !== d.d, typingD: d.dw.typing.d === v.d,
      inStory: m ? inStory(m.part) : false, inBody: !!head && doc.sections.some((s) => s.blocks.some((b) => b.id === head.id)),
      depth: d.d.undoDepth, body, stories: [...doc.stories].map(([k, st]) => [k, st.blocks.map((b) => b.text)]),
      info: d.toolbar2.text('pageInfo') };
  });
  /** The texts drawn on page i in its header region (or footer, or body), after a redraw of it. */
  const drawnOn = (i, where) => ev(async ([i, where]) => {
    const d = window.__doc('Heads'), w = d.win, L = d.dw.L, pg = L.place.pages.at(i), rc = L.place.sheet.rect(pg);
    w.scrollTo(0, where === 'ftr' ? rc.y + rc.h - w.h + 4 : rc.y - 4);
    await window.__frames(2);
    const seen = await window.__drawn(d), bot = rc.y + pg.bodyTop + pg.frameH;
    return seen.filter(([, y]) => (where === 'hdr' ? y > rc.y && y < rc.y + pg.bodyTop + 16
      : where === 'ftr' ? y > bot - 16 && y < rc.y + rc.h : y > rc.y + pg.bodyTop + 16 && y < bot - 16)).map(([t]) => t);
  }, [i, where]);

  const o2 = await ev(async () => {
    const d = await window.__open('Heads');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    window.__beepReal = beep;
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    return { count: d.dw.L.place.pages.count, H: d.dw.L.place.pages.at(1).header.part };
  });
  const s0 = await state();
  // a double-click in page 2's header area: the mode, on that page's story
  let q = await spot(1, 'hdr');
  let c = await showAt(q.x, q.y);
  await page.mouse.dblclick(c.x, c.y);
  await settle();
  const s1 = await state();
  ok('a double-click in page 2\'s header enters the mode on its story (the running header)',
    s1.mode && s1.mode.part === o2.H && s1.mode.kind === 'hdr' && s1.mode.i === 1 && s1.facade && s1.typingD && s1.inStory, s1);
  ok('... no undo step, nothing changed by entering', s1.depth === s0.depth && JSON.stringify(s1.stories) === JSON.stringify(s0.stories), s1);
  ok('... the info line names it', /Header/.test(s1.info), s1.info);
  const geo1 = await ev(async () => {
    const d = window.__doc('Heads'), L = d.dw.L, pg = L.place.pages.at(1), rc = L.place.sheet.rect(pg), w = d.win;
    const c = d.dw.view.caretRect(), z = d.view.zoom, t = L.top;
    w.scrollTo(0, rc.y - 4);
    await window.__frames(2);
    const proto = CanvasRenderingContext2D.prototype, real = proto.fillRect, dims = [];
    proto.fillRect = function (x, y, ww, h) {
      if (this.canvas === w._canvas && String(this.fillStyle).replace(/\s/g, '') === 'rgba(255,255,255,0.5)') dims.push([x, y, ww, h]);
      return real.call(this, x, y, ww, h);
    };
    try { w.invalidate(); await window.__frames(2); } finally { proto.fillRect = real; }
    return { caret: c && { y: t + (c.y - t) / z - rc.y, x: c.x / z - rc.x }, bodyTop: pg.bodyTop, header: L.geom(0).mar.header, dims,
      want: [rc.x, rc.y + pg.bodyTop, rc.w, pg.frameH] };
  });
  ok('the caret is in page 2\'s header (between the header margin and the body)',
    geo1.caret && geo1.caret.y >= geo1.header - 2 && geo1.caret.y < geo1.bodyTop && geo1.caret.x > 0, geo1);
  ok('the body is dimmed: 50% white over each page\'s body', geo1.dims.some((r) => r.every((v, k) => Math.abs(v - geo1.want[k]) <= 1)), geo1);
  if (process.env.SHOTS_ON) await page.screenshot({ path: join(SHOTS, 'word-headers-mode.png') });
  const lab1 = await drawnOn(1, 'hdr'), lab0 = await drawnOn(0, 'hdr');
  ok('the labels: "Header" on page 2, "First page header" on page 1', lab1.includes('Header') && lab0.includes('First page header'),
    { lab1, lab0 });
  // typing: the story changes, on every page that shows it
  c = await showAt(q.x, q.y);
  await page.keyboard.press('End');
  await page.keyboard.type('Q');
  await settle();
  const s2 = await state();
  const hText = (s) => (s.stories.find(([k]) => k === o2.H) || [, []])[1];
  ok('typing goes into the header story, one undo step; the body unchanged',
    hText(s2).some((t) => /Q/.test(t)) && s2.depth === s1.depth + 1 && JSON.stringify(s2.body) === JSON.stringify(s0.body), s2);
  const per = [];
  for (let i = 0; i < Math.min(o2.count, 4); i++) per.push((await drawnOn(i, 'hdr')).some((t) => /Q/.test(t)));
  ok('... shown on every page that uses that header (pages 2 on), not on page 1', !per[0] && per.slice(1).every(Boolean), per);
  // the caret stays in the story: arrow keys and Ctrl-End do not leave it
  await press('Control+End');
  await press('ArrowDown');
  const s3 = await state();
  ok('the caret is confined to the story (Ctrl-End, Down)', s3.inStory && s3.mode, s3);
  // a refused command: a beep, nothing changed
  const b0 = await ev(() => window.__beeps);
  await press('Control+Enter');
  const s4 = await state(), b1 = await ev(() => window.__beeps);
  ok('Ctrl-Enter (page break) in a header: refused with a beep, nothing changed',
    b1 === b0 + 1 && s4.depth === s3.depth && JSON.stringify(s4.stories) === JSON.stringify(s3.stories), { b0, b1, s4 });
  // a single click in the body does nothing; a click in another page's same header moves the caret there
  q = await spot(2, 'body');
  c = await showAt(q.x, q.y);
  await page.mouse.click(c.x, c.y);
  await settle();
  const s5 = await state();
  ok('a click in the body while in the mode does nothing (still in the story)', s5.mode && s5.inStory && s5.mode.i === 1, s5);
  q = await spot(2, 'hdr');
  c = await showAt(q.x, q.y);
  await page.mouse.click(c.x, c.y);
  await settle();
  const s6 = await state();
  ok('a click in page 3\'s header (the same story) puts the caret there', s6.mode && s6.mode.i === 2 && s6.inStory, s6);
  // undo in the mode: the letter goes, the caret stays in the story
  await press('Control+z');
  const s7 = await state();
  ok('undo in the mode: the letter gone, the caret in the story, still in the mode',
    !hText(s7).some((t) => /Q/.test(t)) && s7.mode && s7.inStory && s7.depth === s1.depth, s7);
  await press('Control+y');
  // Escape leaves: the caret back in the body, typing goes there
  await press('Escape');
  const s8 = await state();
  ok('Escape leaves the mode: the caret back in the body, the real Document again', !s8.mode && s8.inBody && !s8.facade && s8.typingD, s8);
  await page.keyboard.type('Z');
  await settle();
  const s9 = await state();
  ok('... typing then goes into the body, not the header', s9.body.join('').includes('Z') && !hText(s9).some((t) => /Z/.test(t)), s9);
  // undo of a header step while in the body: the window goes into that header (P7.5), never a body path
  const s9b = await ev(() => { const v = window.__doc('Heads').dw.view; return v.sel.head; });
  await press('Control+z');
  await press('Control+z');
  const s10 = await state();
  ok('undo of a header edit from the body: the letter goes, the window in the header\'s mode, the caret in it (P7.5)',
    !hText(s10).some((t) => /Q/.test(t)) && s10.mode && s10.mode.part === o2.H && s10.inStory && s10.facade, { s10, s9b });
  await press('Escape');
  // View > Header and footer: on and off; double-click in the body leaves
  const v1 = await ev(() => { const d = window.__doc('Heads'); d.toggleHdr(); return !!d.dw.view.hdr && d.dw.view.hdr.kind; });
  await settle();
  q = await spot(2, 'body');
  c = await showAt(q.x, q.y);
  await page.mouse.dblclick(c.x, c.y);
  await settle();
  const s11 = await state();
  ok('View > Header and footer enters it; a double-click in the body leaves it, the caret where clicked', v1 === 'hdr' && !s11.mode && s11.inBody, { v1, s11 });
  const v2 = await ev(() => { const d = window.__doc('Heads'); d.toggleHdr(); const on = !!d.dw.view.hdr; d.toggleHdr(); return [on, !!d.dw.view.hdr]; });
  ok('... and again leaves it', v2[0] && !v2[1], v2);
  // the footer: a double-click in page 2's footer enters it
  q = await spot(1, 'ftr');
  c = await showAt(q.x, q.y);
  await page.mouse.dblclick(c.x, c.y);
  await settle();
  const s12 = await state();
  ok('a double-click in a footer enters the footer\'s mode', s12.mode && s12.mode.kind === 'ftr' && s12.inStory, s12);
  // the story removed under the window (Review Focus 2): the mode is left, no stale facade
  const g1 = await ev(async () => {
    const d = window.__doc('Heads'), v = d.dw.view, part = v.hdr.part, n0 = d.d.undoDepth;
    d.d.apply({ op: 'setStory', part, story: null });
    await window.__frames(3);
    const gone = { mode: !!v.hdr, facade: v.d !== d.d, typing: d.dw.typing.d === d.d };
    d.d.undo();
    await window.__frames(3);
    return { gone, back: d.dw.doc.stories.has(part), depth: d.d.undoDepth - n0 };
  });
  ok('the story removed (as an undo of its creation would): the window leaves the mode, the real Document again',
    !g1.gone.mode && !g1.gone.facade && g1.gone.typing && g1.back && g1.depth === 0, g1);
  // Draft: switching leaves the mode
  q = await spot(1, 'hdr');
  c = await showAt(q.x, q.y);
  await page.mouse.dblclick(c.x, c.y);
  await settle();
  const d1 = await ev(async () => { const d = window.__doc('Heads'), on = !!d.dw.view.hdr; d.setView('draft'); await window.__frames(3);
    const r = [on, !!d.dw.view.hdr]; d.setView('print'); await window.__frames(3); return r; });
  ok('switching to Draft leaves the mode', d1[0] && !d1[1], d1);
  await ev(() => { os.wimp.beep = window.__beepReal; window.__doc('Heads').dw.close(); });

  // ------------------------------------------------ part 3 (P7.4): a header made on the first edit; the mode's menu
  /** Layout point of leaf's body -> client point, scrolled into view first. */
  const showIn = (leaf, x, y) => ev(async ([leaf, x, y]) => {
    const d = window.__doc(leaf), w = d.win, z = d.view.zoom, t = d.dw.L.top;
    const q = { x: x * z, y: t + (y - t) * z };
    w.scrollTo(Math.max(0, Math.round(q.x - w.w / 2)), Math.max(0, Math.round(q.y - w.h / 2)));
    await window.__frames(2);
    const s = w.workToScreen(q.x, q.y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k };
  }, [leaf, x, y]);
  const spotIn = (leaf, i, where) => ev(([leaf, i, where]) => {
    const d = window.__doc(leaf), L = d.dw.view.bodyL, P = L.place.pages, pg = P.at(i), rc = L.place.sheet.rect(pg), geo = L.geom(pg.s);
    const x = rc.x + geo.mar.left + 40;
    if (where === 'hdr') return { x, y: rc.y + geo.mar.header + 8 };
    if (where === 'ftr') return { x, y: rc.y + rc.h - geo.mar.footer - 8 };
    return { x, y: rc.y + pg.bodyTop + 30 };
  }, [leaf, i, where]);
  const dbl = async (leaf, i, where) => {
    const q = await spotIn(leaf, i, where), c = await showIn(leaf, q.x, q.y);
    await page.mouse.dblclick(c.x, c.y);
    await settle();
  };
  /** The window's mode, the document's headers and its undo depth. */
  const st3 = (leaf) => ev((leaf) => {
    const d = window.__doc(leaf), v = d.dw.view, m = v.hdr, doc = d.dw.doc, P = v.bodyL.place.pages;
    return { mode: m ? { part: m.part, kind: m.kind, i: m.i, type: m.type, pending: !!m.facade.pending } : null,
      depth: d.d.undoDepth, dirty: d.d.dirty, styles: ['Header', 'Footer'].filter((k) => doc.styles.styles.has(k)),
      stories: [...doc.stories].map(([k, s]) => [k, s.blocks.map((b) => b.text)]),
      titlePg: doc.sections.map((s) => s.props.titlePg === true),
      heads: Array.from({ length: P.count }, (_, k) => { const pg = P.at(k); return pg.header && pg.header.part; }),
      info: d.toolbar2.text('pageInfo'), beeps: window.__beeps };
  }, leaf);
  /** The mode's menu (the window menu's Header / Footer item): [text, ticked, shaded] rows. */
  const rows = (leaf) => ev((leaf) => {
    const d = window.__doc(leaf), top = d.win.menu({}).items, it = top.find((i) => i.text === 'Header' || i.text === 'Footer');
    if (!it) return { top: top.map((i) => i.text) };
    const f = (x, k) => !!(typeof x[k] === 'function' ? x[k](x) : x[k]);
    return { top: top.map((i) => i.text), rows: it.submenu().items.map((i) => [i.text, f(i, 'ticked'), f(i, 'shaded')]) };
  }, leaf);
  const pick = (leaf, text) => ev(async ([leaf, text]) => {
    const d = window.__doc(leaf), it = d.win.menu({}).items.find((i) => i.text === 'Header' || i.text === 'Footer');
    it.submenu().items.find((i) => i.text === text).action();
    await window.__frames(3);
  }, [leaf, text]);
  const undo3 = (leaf) => ev(async (leaf) => { window.__doc(leaf).d.undo(); await window.__frames(3); }, leaf);

  await ev(async () => {
    const d = await window.__open('Bare');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
    window.__beeps = 0;
    os.wimp.beep = () => { window.__beeps++; return window.__beepReal(); };
  });
  const u0 = await st3('Bare');
  await dbl('Bare', 0, 'hdr');
  const u1 = await st3('Bare');
  ok('a page with no header: a double-click enters the mode all the same (no beep, no step, nothing made)',
    u1.mode && u1.mode.pending && u1.mode.kind === 'hdr' && u1.beeps === u0.beeps && u1.depth === 0 && !u1.stories.length
      && /Header/.test(u1.info), u1);
  const vr = await ev(() => { const it = window.__doc('Bare').win.menu({}).items.find((i) => i.text === 'View').submenu().items
    .find((i) => i.text === 'Header and footer options'); return it && [it.text, false, !!it.shaded(it)]; });
  const mr = await rows('Bare');
  ok('the mode\'s menu: Header after View and Outline in the window menu; View > Header and footer options not shaded in it',
    mr.top.indexOf('Header') === mr.top.indexOf('View') + 2 && vr && vr[2] === false, { mr, vr });
  ok('its items: Different first page, Different odd and even pages, Link to previous (shaded: one section), Go to footer, '
    + 'Previous and Next section (shaded), Remove header (shaded: nothing made yet)',
  JSON.stringify(mr.rows) === JSON.stringify([['Different first page', false, false], ['Different odd and even pages', false, false],
    ['Link to previous', false, true], ['Go to footer', false, false], ['Previous section', false, true],
    ['Next section', false, true], ['Remove header', false, true]]), mr.rows);
  await press('Escape');
  const u2 = await st3('Bare');
  ok('... Escape leaves: nothing changed, no step, the document not modified', !u2.mode && u2.depth === 0 && !u2.dirty
    && !u2.stories.length && JSON.stringify(u2.styles) === '[]', u2);
  await dbl('Bare', 0, 'hdr');
  await page.keyboard.type('N');
  await settle();
  const u3 = await st3('Bare');
  const part = u3.stories[0] && u3.stories[0][0];
  ok('the first letter makes the header: one undo step, the story, its reference, the Header style; still in the mode on it',
    u3.depth === 1 && u3.stories.length === 1 && u3.stories[0][1][0] === 'N' && u3.styles.includes('Header')
      && u3.mode && u3.mode.part === part && !u3.mode.pending && u3.heads.every((h) => h === part), u3);
  const nOn = [];
  for (let i = 0; i < Math.min(u3.heads.length, 3); i++) {
    nOn.push(await ev(async ([i]) => {
      const d = window.__doc('Bare'), w = d.win, L = d.dw.view.bodyL, pg = L.place.pages.at(i), rc = L.place.sheet.rect(pg);
      w.scrollTo(0, rc.y - 4);
      await window.__frames(2);
      return (await window.__drawn(d)).some(([t, y]) => t === 'N' && y > rc.y && y < rc.y + pg.bodyTop);
    }, [i]));
  }
  ok('... drawn in every page\'s header', nOn.length >= 2 && nOn.every(Boolean), nOn);
  // Different first page: one step; page 1 then shows its own (empty) first-page header
  await pick('Bare', 'Different first page');
  const u4 = await st3('Bare'), y4 = await rows('Bare');
  ok('Different first page: one step, titlePg on, the mode on page 1\'s empty first-page header, ticked',
    u4.depth === 2 && u4.titlePg[0] && u4.mode && u4.mode.i === 0 && u4.mode.type === 'first' && u4.mode.pending
      && y4.rows[0][1] === true && /First page header/.test(u4.info), { u4, y4: y4.rows });
  await undo3('Bare');
  const u5 = await st3('Bare');
  ok('... undone: titlePg off again', u5.depth === 1 && !u5.titlePg[0], u5);
  // Remove header: the story emptied, the part kept
  await dbl('Bare', 1, 'hdr');
  await pick('Bare', 'Remove header');
  const u6 = await st3('Bare');
  ok('Remove header: one step, the story one empty paragraph, the part and every page\'s reference kept',
    u6.depth === 2 && u6.stories.length === 1 && JSON.stringify(u6.stories[0][1]) === '[""]' && u6.heads.every((h) => h === part), u6);
  // Different odd and even pages: no settings part here: a beep, nothing changed
  const ube = (await st3('Bare')).beeps;
  await pick('Bare', 'Different odd and even pages');
  const u7 = await st3('Bare');
  ok('Different odd and even pages in a document with no settings part: a beep, nothing changed', u7.beeps === ube + 1 && u7.depth === 2, u7);
  await ev(() => { window.__doc('Bare').d.markSaved(); window.__doc('Bare').dw.close(); });

  // two sections: Link to previous off (a copy), typing in it, on again (the copy removed)
  await ev(async () => {
    const d = await window.__open('Two');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  const first2 = await ev(() => { const P = window.__doc('Two').dw.view.bodyL.place.pages;
    for (let k = 0; k < P.count; k++) if (P.at(k).s === 1) return k; return -1; });
  await dbl('Two', first2, 'hdr');
  const w0 = await st3('Two'), y0 = await rows('Two');
  ok('section 2 has its own reference to section 1\'s header: Link to previous not ticked, Previous section not shaded',
    first2 > 0 && w0.mode && w0.mode.part === 'word/header1.xml' && y0.rows[2][1] === false && y0.rows[2][2] === false
      && y0.rows[4][2] === false, { first2, w0, y0: y0.rows });
  await pick('Two', 'Link to previous');
  const wa = await st3('Two'), ya = await rows('Two');
  ok('Link to previous on: one step, section 2\'s reference gone, the header kept (section 1 uses it), ticked',
    wa.depth === 1 && wa.stories.length === 1 && wa.mode && wa.mode.part === 'word/header1.xml' && ya.rows[2][1] === true
      && wa.heads.every((h) => h === 'word/header1.xml'), { wa, ya: ya.rows });
  await pick('Two', 'Link to previous');
  const w1 = await st3('Two');
  const copy = w1.mode && w1.mode.part;
  ok('Link to previous off: one step, a copy of the header in a new part, the mode on it, section 2\'s pages showing it',
    w1.depth === 2 && copy && copy !== 'word/header1.xml' && w1.stories.length === 2
      && JSON.stringify(w1.stories[1][1]) === JSON.stringify(w1.stories[0][1])
      && w1.heads.slice(0, first2).every((h) => h === 'word/header1.xml') && w1.heads.slice(first2).every((h) => h === copy), w1);
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('X');
  await settle();
  const w2 = await st3('Two');
  ok('... typing in the copy changes section 2\'s header only', w2.stories.find(([k]) => k === copy)[1][0].startsWith('X')
    && !w2.stories.find(([k]) => k === 'word/header1.xml')[1][0].startsWith('X'), w2);
  await pick('Two', 'Link to previous');
  const w3 = await st3('Two');
  ok('Link to previous on again: one step, the copy (used nowhere) removed, section 1\'s header shown in the mode',
    w3.depth === 4 && w3.stories.length === 1 && w3.mode && w3.mode.part === 'word/header1.xml'
      && w3.heads.every((h) => h === 'word/header1.xml'), w3);
  await pick('Two', 'Previous section');
  const w4 = await st3('Two');
  ok('Previous section: the mode on section 1\'s first page', w4.mode && w4.mode.i === 0, w4);
  await ev(() => { window.__doc('Two').d.markSaved(); window.__doc('Two').dw.close(); });

  // Different odd and even pages, document-wide
  await ev(async () => {
    const d = await window.__open('EvenOdd');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  await dbl('EvenOdd', 0, 'hdr');
  const x0 = await rows('EvenOdd');
  await pick('EvenOdd', 'Different odd and even pages');
  const x1 = await rows('EvenOdd'), e1s = await st3('EvenOdd');
  await undo3('EvenOdd');
  const x2 = await rows('EvenOdd');
  ok('Different odd and even pages: ticked, then not (one step), undone ticked again',
    x0.rows[1][1] === true && x1.rows[1][1] === false && e1s.depth === 1 && x2.rows[1][1] === true, { x0: x0.rows, x1: x1.rows, x2: x2.rows });
  await ev(() => { os.wimp.beep = window.__beepReal; window.__doc('EvenOdd').d.markSaved(); window.__doc('EvenOdd').dw.close(); });


  // ------------------------------------------------ part 4 (P7.5): undo and redo follow the story; Previous and Next section
  /** The window's mode, where its caret is, the document's headers and its undo depth. */
  const st4 = (leaf) => ev((leaf) => {
    const d = window.__doc(leaf), v = d.dw.view, m = v.hdr, doc = d.dw.doc, head = v.sel && v.sel.head;
    const st = m && doc.stories.get(m.part);
    return { mode: m ? { part: m.part, kind: m.kind, i: m.i, pending: !!m.facade.pending, gone: m.facade.gone } : null,
      facade: v.d !== d.d, typingD: d.dw.typing.d === v.d, head,
      inStory: !!st && !!head && st.blocks.some((b) => b.id === head.id),
      inBody: !!head && doc.sections.some((s) => s.blocks.some((b) => b.id === head.id)),
      depth: d.d.undoDepth, dirty: d.d.dirty, body0: doc.sections[0].blocks[0].text,
      stories: [...doc.stories].map(([k, s]) => [k, s.blocks.map((b) => b.text)]), info: d.toolbar2.text('pageInfo') };
  }, leaf);
  /** The bytes leaf's window would save now. */
  const bytesNow = (leaf) => ev(async (leaf) => Array.from(await window.__doc(leaf).saveBytes()), leaf);
  /** The same parts, byte for byte (the zip's time stamps are the time written). */
  const sameParts = async (a, b) => {
    const [x, y] = await Promise.all([a, b].map((q) => readZip(new Uint8Array(q))));
    return x.size === y.size && [...x].every(([n, v]) => { const u = y.get(n); return u && u.length === v.length && u.every((q, i) => q === v[i]); });
  };
  await ev(async () => {
    const d = await window.__open('Undo');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  const bytes0 = await bytesNow('Undo'), k0 = await st4('Undo');
  // undo creates and removes (Review Focus 2): a header made by typing, left, undone from the body
  await dbl('Undo', 0, 'hdr');
  await page.keyboard.type('A');
  await press('ArrowLeft');
  await press('ArrowRight');
  await page.keyboard.type('B');
  await settle();
  const k1 = await st4('Undo'), made = k1.stories[0] && k1.stories[0][0];
  ok('a header made by typing A, then B (a step of its own): two steps', made && k1.depth === 2
    && JSON.stringify(k1.stories[0][1]) === '["AB"]' && k1.mode && k1.mode.part === made, k1);
  await press('Escape');
  const k2 = await st4('Undo');
  await press('Control+z');
  const k3 = await st4('Undo');
  ok('undo in the body: the mode opens on that header, the letter goes, the caret in it after A',
    !k2.mode && k3.mode && k3.mode.part === made && !k3.mode.pending && k3.facade && k3.typingD && k3.inStory
      && k3.head.off === 1 && JSON.stringify(k3.stories[0][1]) === '["A"]' && k3.depth === 1 && /Header/.test(k3.info), { k2, k3 });
  await press('Control+z');
  const k4 = await st4('Undo'), bytes4 = await bytesNow('Undo');
  ok('undo again (the step that made it): the story gone, the mode left, no stale facade, the caret back in the body',
    !k4.mode && !k4.stories.length && !k4.facade && k4.typingD && k4.inBody && JSON.stringify(k4.head) === JSON.stringify(k0.head)
      && k4.depth === 0 && !k4.dirty, { k4, k0: k0.head });
  ok('... the file\'s bytes as opened', await sameParts(bytes0, bytes4), bytes4.length);
  await press('Control+y');
  const k5 = await st4('Undo');
  ok('redo from the body: the header made again and the mode open on it, the caret after A',
    k5.mode && k5.mode.part === made && !k5.mode.pending && k5.facade && k5.inStory && k5.head.off === 1
      && JSON.stringify(k5.stories) === JSON.stringify([[made, ['A']]]), k5);
  await press('Control+y');
  const k6 = await st4('Undo');
  ok('redo again: B back, still in the header, the caret after it', k6.mode && k6.mode.part === made && k6.inStory
    && k6.head.off === 2 && JSON.stringify(k6.stories[0][1]) === '["AB"]' && k6.depth === 2, k6);
  // from the footer's mode (a footer not made yet) an undo of the header's step goes to the header
  await press('Escape');
  await dbl('Undo', 1, 'ftr');
  const k7 = await st4('Undo');
  await press('Control+z');
  const k8 = await st4('Undo');
  ok('in a footer\'s mode, an undo of a header step: the window switches to the header, on the same page, nothing made for the footer',
    k7.mode && k7.mode.kind === 'ftr' && k8.mode && k8.mode.kind === 'hdr' && k8.mode.part === made && k8.mode.i === 1
      && k8.inStory && k8.stories.length === 1 && JSON.stringify(k8.stories[0][1]) === '["A"]', { k7, k8 });
  await press('Control+y');
  // the reverse: a body step undone and redone from a header's mode
  await press('Escape');
  await page.keyboard.type('Z');
  await settle();
  const k9 = await st4('Undo');
  await dbl('Undo', 1, 'hdr');
  await press('Control+z');
  const k10 = await st4('Undo');
  ok('an undo of a body step from the header\'s mode: the mode left, the letter gone, the caret in the body',
    /Z/.test(k9.body0) && !k10.mode && k10.inBody && !k10.facade && !/Z/.test(k10.body0), { k9: k9.body0, k10 });
  await dbl('Undo', 1, 'hdr');
  await press('Control+y');
  const k11 = await st4('Undo');
  ok('... and its redo from the header\'s mode: the mode left, the letter back in the body', !k11.mode && k11.inBody
    && /Z/.test(k11.body0) && JSON.stringify(k11.stories[0][1]) === '["AB"]', k11);
  await ev(() => { window.__doc('Undo').d.markSaved(); window.__doc('Undo').dw.close(); });

  // Previous and Next section; the tabs say "Same as previous" when linked
  /** The texts drawn in page i's header region of leaf's window. */
  const tabs = (leaf, i) => ev(async ([leaf, i]) => {
    const d = window.__doc(leaf), w = d.win, L = d.dw.view.bodyL, pg = L.place.pages.at(i), rc = L.place.sheet.rect(pg);
    w.scrollTo(0, rc.y - 4);
    await window.__frames(2);
    return (await window.__drawn(d)).filter(([, y]) => y > rc.y - 20 && y < rc.y + pg.bodyTop + 16).map(([t]) => t);
  }, [leaf, i]);
  await ev(async () => {
    const d = await window.__open('Two');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  await dbl('Two', 0, 'hdr');
  const pn0 = await st3('Two'), pr0 = await rows('Two'), pt0 = await tabs('Two', 0);
  await pick('Two', 'Next section');
  const pn1 = await st3('Two'), pr1 = await rows('Two'), pt1 = await tabs('Two', first2);
  ok('Next section: from section 1 (Previous shaded) to section 2\'s first page, its own header (no "Same as previous")',
    pn0.mode && pn0.mode.i === 0 && pr0.rows[4][2] === true && pr0.rows[5][2] === false && pt0.includes('Header - Section 1')
      && pn1.mode && pn1.mode.i === first2 && pn1.mode.part === 'word/header1.xml' && pr1.rows[5][2] === true
      && pt1.includes('Header - Section 2') && !pt1.includes('Same as previous') && pn1.depth === 0, { pn0, pn1, pt0, pt1, pr1: pr1.rows });
  await pick('Two', 'Link to previous');
  const pt2 = await tabs('Two', first2), pn2 = await st3('Two');
  ok('... linked to the previous: its tab says "Same as previous"', pt2.includes('Same as previous') && pn2.mode
    && pn2.mode.i === first2 && pn2.depth === 1, { pt2, pn2 });
  await pick('Two', 'Previous section');
  const pn3 = await st3('Two'), pt3 = await tabs('Two', 0);
  ok('Previous section: back to section 1\'s first page, no "Same as previous" there', pn3.mode && pn3.mode.i === 0
    && pn3.mode.part === 'word/header1.xml' && pt3.includes('Header - Section 1') && !pt3.includes('Same as previous'), { pn3, pt3 });
  await pick('Two', 'Go to footer');
  const pn4 = await st3('Two');
  ok('Go to footer: the same page\'s footer (one not made yet), nothing changed', pn4.mode && pn4.mode.kind === 'ftr'
    && pn4.mode.i === 0 && pn4.depth === 1, pn4);
  await ev(() => { window.__doc('Two').d.markSaved(); window.__doc('Two').dw.close(); });

  // ------------------------------------------------ part 5 (P7 fixes): typing in a linked header edits the chain (I1)
  await ev(async () => {
    const d = await window.__open('Chain');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  const bytesC = await bytesNow('Chain');
  const last = await ev(() => { const P = window.__doc('Chain').dw.view.bodyL.place.pages;
    for (let k = 0; k < P.count; k++) if (P.at(k).s === 3) return k; return -1; });
  await dbl('Chain', last, 'hdr');
  const c0 = await st3('Chain'), cr0 = await rows('Chain'), ct0 = await tabs('Chain', last);
  await page.keyboard.type('L');
  await settle();
  const c1 = await st3('Chain'), cr1 = await rows('Chain'), ct1 = await tabs('Chain', last);
  const shownC = await ev(() => { const d = window.__doc('Chain'), P = d.dw.view.bodyL.place.pages, o = [];
    for (let k = 0; k < P.count; k++) { const pg = P.at(k); o.push([pg.s, !!pg.blank, pg.header && pg.header.part]); } return o; });
  const partC = c1.stories[0] && c1.stories[0][0];
  ok('a page of section 4 (linked, "Same as previous"): the letter typed makes ONE header shown on every section\'s pages',
    last > 0 && c0.mode && c0.mode.pending && ct0.includes('Same as previous') && cr0.rows[2][1] === true
      && c1.depth === 1 && c1.stories.length === 1 && partC && shownC.every(([, b, h]) => b || h === partC)
      && [0, 1, 2, 3].every((s) => shownC.some(([t, b]) => t === s && !b)), { last, c0, c1, shownC });
  ok('... still linked: the tab says "Same as previous", Link to previous ticked, the mode on it',
    ct1.includes('Same as previous') && cr1.rows[2][1] === true && c1.mode && c1.mode.part === partC && !c1.mode.pending, { ct1, cr1: cr1.rows, c1 });
  await press('Escape');
  await press('Control+z');
  await press('Escape');
  ok('... undone: the bytes as opened', await sameParts(bytesC, await bytesNow('Chain')), (await st3('Chain')).depth);
  await ev(() => { window.__doc('Chain').d.markSaved(); window.__doc('Chain').dw.close(); });

  // M1: the undo of a header command from the footer's mode goes to the header it put back
  await ev(async () => {
    const d = await window.__open('Rem');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  await dbl('Rem', 1, 'hdr');
  await pick('Rem', 'Remove header');
  await press('Escape');
  await dbl('Rem', 1, 'ftr');
  const r0 = await st4('Rem');
  await press('Control+z');
  const r1 = await st4('Rem');
  ok('Remove header undone from the footer\'s mode: the window goes to the header put back, on the same page, the caret in it',
    r0.mode && r0.mode.kind === 'ftr' && r1.mode && r1.mode.kind === 'hdr' && r1.mode.i === 1 && r1.inStory
      && r1.stories.some(([k, t]) => /header/.test(k) && t[0] === 'Head R') && r1.depth === 0, { r0, r1 });
  await ev(() => { window.__doc('Rem').d.markSaved(); window.__doc('Rem').dw.close(); });

  // ------------------------------------------------ part 6 (P8.3, D18): page numbers computed per page
  const n6 = await ev(async () => {
    const d = await window.__open('Nums'), w = d.win, L = d.view.layout, P = L.place.pages, S = L.place.sheet;
    for (let t = 0; t < 200 && !P.done; t++) await window.__frames(1);
    const res = { done: P.done, count: P.count, pages: [] };
    for (let i = 0; i < P.count; i++) {
      const pg = P.at(i), rc = S.rect(pg);
      w.scrollTo(0, rc.y + rc.h - w.h + 4);
      await window.__frames(2);
      const bot = await window.__drawn(d);
      res.pages.push(bot.filter(([, y]) => y > rc.y + pg.bodyTop + pg.frameH && y < rc.y + rc.h).map(([t]) => t).join(' '));
    }
    const ftr = [...d.dw.doc.stories.values()].find((s) => s.blocks.some((b) => b.text.includes('Page')));
    res.stored = ftr.blocks[0].text.replace(/\ufffc/g, '');
    d.dw.close();
    return res;
  });
  ok('page numbers computed on every page: "Page i of n" (the footer\'s PAGE and NUMPAGES fields)',
    n6.done && n6.count >= 3 && n6.pages.every((t, i) => t.replace(/\s+/g, ' ').includes(`Page ${i + 1} of ${n6.count}`)), n6);
  ok('... the stored results in the model unchanged ("1" and "1")', n6.stored === 'Page 1 of 1', n6.stored);

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
