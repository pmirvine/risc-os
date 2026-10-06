// !Word's zoom in the real desktop: the layout stays at 100%, the window shows it scaled (Zoom: screen x = x * z,
// screen y = top + (y - top) * z, top = the toolbar and ruler, not scaled). At 50, 100 and 200%: a click picks the
// same character, drags, double and triple clicks select as at 100%, the selection is painted where the text is, the
// Wimp's caret (and the input method's proxy field) are at the zoomed caret, typing places it, the caret is scrolled
// into view, Page Down steps the visible height, Ctrl-A, clicks above and below everything, the ruler's ticks and
// markers scale and an indent drag works, the toolbar is unchanged. Zooming keeps the centre line; Ctrl+wheel steps
// the zoom while the plain wheel scrolls; the range is clamped; the Zoom menu; resizing and laying out again keep the
// zoom; zoom is per window; a 50,000-paragraph document at 200% paints in under 100 ms; hiDPI (DPR 2) with zoom 150
// draws at backing scale 2 (no double scaling); no page errors; 30 open/zoom/close cycles leave nothing behind.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { zoomScroll } from '../../tools/moreapps/!Word/Zoom';

const PARAS = [
  p(r('First paragraph, indented with a first line.'), '<w:ind w:left="720" w:firstLine="360"/>'),   // 0
  p(r('Second paragraph, plain words.')),                                                            // 1
  p(r('Wide WWMMWW letters here for clicking, and more text after them.')),                         // 2
  p(r('Fourth paragraph, plain.')),                                                                  // 3
  ...Array.from({ length: 200 }, (_, i) => p(r(`Filler ${i} with a few words in it.`))),
];
const docx = async (body) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body) }));
const files = { T: await docx(PARAS.join('')) };
const HUGE = await docx(Array.from({ length: 50000 }, (_, i) => p(r(`${i} some words in a paragraph`))).join(''));
const TOP = 58;

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function start(page) {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  return page.evaluate(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf = 'T') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__client = (win, x, y) => { const s = win.workToScreen(x, y); return window.__screen(s.x, s.y); };
    /** Layout -> the window's work area at the document's zoom. */
    window.__ws = (x, y, leaf) => {
      const d = window.__doc(leaf), z = d.zoom / 100, t = d.view.layout.top;
      return { x: x * z, y: t + (y - t) * z };
    };
    /** The client point of the caret place (item i, off) + dx screen px, half way down the line. */
    window.__at = (i, off, dx = 0.5) => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      const s = window.__ws(c.x, c.y + c.h / 2);
      return window.__client(d.win, s.x + dx, s.y);
    };
    /** The zoomed caret of the selection's head (what the Wimp's caret must be). */
    window.__want = () => {
      const d = window.__doc(), v = d.view, L = v.layout, s = v.selection, c = L.caretRect(s.head, s.affinity);
      const z = d.zoom / 100, p = window.__ws(c.x, c.y);
      return { x: p.x, y: p.y, h: c.h * z };
    };
    window.__caretOk = () => {
      const a = os.wimp.caret?.pos, b = window.__want();
      return !!a && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.h - b.h) < 0.01;
    };
    window.__sel = (i, o, j = i, o2 = o) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    window.__head = () => { const v = window.__doc().view, s = v.selection, L = v.layout;
      return { i: L.byId.get(s.head.id).index, off: s.head.off, ai: L.byId.get(s.anchor.id).index, aoff: s.anchor.off }; };
    window.__mark = (id) => {
      const ru = window.__doc().ruler, m = ru.markers.find((k) => k.id === id);
      return window.__client(ru.pane, ru._x(m.twips), ru.height - 2);
    };
    await os.filer.run('RAM::RamDisc0.$.T');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d && d.zoom === 100, msgs: window.__msgs };
  }, files);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const setZoom = async (z) => { await ev(async (z) => { const d = window.__doc(); d.setZoom(z); await window.__frames(3); }, z); };
const home = () => ev(async () => { const w = window.__doc().win; w.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 }); await window.__frames(3); });
const at = (i, off, dx) => ev((a) => window.__at(...a), [i, off, dx]);
const head = () => ev(() => window.__head());
const caretOk = () => ev(() => window.__caretOk());
/** Pick Zoom > text from the window's menu (real mouse); -> the item's tick before. */
async function pickZoom(text) {
  const p0 = await ev(() => { const w = window.__doc().win; return window.__screen(w.x + 300, w.y + 300); });
  await page.mouse.click(p0.x, p0.y, { button: 'middle' });
  await wait(250);
  const f = page.locator('.menu').nth(0).locator('.mitem', { hasText: /^Zoom/ }).first();
  const b = await f.boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
  await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
  await wait(250);
  const rows = await ev(() => (os.wimp.menus.levels[1]?.rows ?? []).map((x) => [String(x.item.text),
    typeof x.item.ticked === 'function' ? !!x.item.ticked(x.item) : !!x.item.ticked]));
  const it = page.locator('.menu').nth(1).locator('.mitem', { hasText: new RegExp('^' + text.replace('%', '%')) }).first();
  const bb = await it.boundingBox();
  await page.mouse.click(bb.x + 30, bb.y + bb.height / 2);
  await wait(100);
  await settle();
  return rows;
}
/** Fractions of SEL-coloured pixels in a work-area rect of the document's canvas, and the SEL columns of row y. */
const selPixels = (rc) => ev((rc) => {
  const d = window.__doc(), w = d.win, cv = w._canvas, k = cv.width / w.w, g = cv.getContext('2d');
  const isSel = (r, gg, b) => Math.abs(r - 0xb3) < 14 && Math.abs(gg - 0xd4) < 14 && Math.abs(b - 0xfc) < 14;
  const X = (x) => Math.round((x - w.scrollX) * k), Y = (y) => Math.round((y - w.scrollY) * k);
  const x0 = X(rc.x0), y0 = Y(rc.y0), W = Math.max(1, X(rc.x1) - x0), H = Math.max(1, Y(rc.y1) - y0);
  const px = g.getImageData(x0, y0, W, H).data;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (isSel(px[i], px[i + 1], px[i + 2])) n++;
  let lo = null, hi = null;
  if (rc.row !== undefined) {
    const row = g.getImageData(0, Y(rc.row), cv.width, 1).data;
    for (let i = 0; i < row.length; i += 4) if (isSel(row[i], row[i + 1], row[i + 2])) { const x = i / 4 / k + w.scrollX; lo ??= x; hi = x; }
  }
  return { frac: n / (W * H), lo, hi };
}, rc);

try {
  const s0 = await start(page);
  ok('the document opens at 100%', s0.ok && !s0.msgs.length, s0);
  const bar0 = await ev(() => { const d = window.__doc(); return [d.toolbar.pane.x - d.win.x, d.toolbar.pane.y - d.win.y, d.toolbar.pane.w, d.toolbar.pane.h]; });

  for (const Z of [50, 100, 200]) {
    const z = Z / 100;
    await setZoom(Z);
    await home();
    const st = await ev(() => { const d = window.__doc(), w = d.win, L = d.view.layout;
      return { zoom: d.zoom, vz: d.view.zoom, top: L.top, eh: w.extent.y1 - w.extent.y0, lh: L.height, width: L.width, ww: w.w }; });
    ok(`${Z}%: the view's zoom; the extent is the layout's scaled below the bars; laid out for the width / z`,
      st.zoom === Z && st.vz === z && st.top === TOP && st.eh === Math.max(64, Math.ceil(TOP + (st.lh - TOP) * z))
      && Math.abs(st.width - st.ww / z) < 1e-9, st);

    // a click on the boundary between W and M (offset 7): the same character at every zoom
    const c7 = await at(2, 7);
    await page.mouse.click(c7.x, c7.y);
    await settle();
    const h7 = await head();
    ok(`${Z}%: a click picks the place it is on (item 2, offset 7)`, h7.i === 2 && h7.off === 7 && h7.ai === 2 && h7.aoff === 7, h7);
    ok(`${Z}%: the Wimp's caret is the layout's caret zoomed (place and height)`, await caretOk(), await ev(() => [os.wimp.caret?.pos, window.__want()]));
    const ime = await ev(() => {
      const t = os.wimp.textInput, ce = os.wimp.caretEl.getBoundingClientRect(), d = window.__doc(), c = window.__want();
      const want = window.__client(d.win, c.x, c.y);
      return { focused: !!t?.focused, left: parseFloat(t.el.style.left), top: parseFloat(t.el.style.top), ce: [ce.left, ce.top, ce.height], want, h: c.h * os.wimp.scale };
    });
    ok(`${Z}%: the input method's proxy field and the caret element are at the zoomed caret`, ime.focused
      && Math.abs(ime.left - ime.ce[0]) <= 1 && Math.abs(ime.top - ime.ce[1]) <= 1 && Math.abs(ime.ce[0] - ime.want.x) <= 2
      && Math.abs(ime.ce[1] - ime.want.y) <= 2 && Math.abs(ime.ce[2] - ime.h) <= 2, ime);

    // drag-select from offset 5 to 11
    const a5 = await at(2, 5), a11 = await at(2, 11);
    await page.mouse.move(a5.x, a5.y);
    await page.mouse.down();
    await page.mouse.move(a11.x, a11.y, { steps: 6 });
    await page.mouse.up();
    await settle();
    const hd = await head();
    ok(`${Z}%: a drag selects from where it started to where it ends`, same(hd, { i: 2, off: 11, ai: 2, aoff: 5 }), hd);

    // the selection is painted over the selected text, not beyond it
    const pr = await ev(() => {
      const d = window.__doc(), v = d.view, L = v.layout, r = L.selectionRects(v.selection)[0];
      const a = window.__ws(r.x, r.y), b = window.__ws(r.x + r.w, r.y + r.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    });
    const inside = await selPixels({ x0: pr.x0 + 1, y0: pr.y0 + 1, x1: pr.x1 - 1, y1: pr.y1 - 1, row: pr.y0 + 1 });
    const beyond = await selPixels({ x0: pr.x1 + 2, y0: pr.y0 + 1, x1: pr.x1 + 30, y1: pr.y1 - 1 });
    ok(`${Z}%: the selection is painted over its zoomed rectangle (edges within 1.5 px), nothing past it`,
      inside.frac > 0.3 && Math.abs(inside.lo - pr.x0) <= 1.5 && Math.abs(inside.hi - pr.x1) <= 2 && beyond.frac === 0, { pr, inside, beyond });

    // double and triple click
    const m8 = await at(2, 8);
    await page.mouse.dblclick(m8.x, m8.y);
    await settle();
    const dbl = await head();
    await page.mouse.dblclick(m8.x, m8.y);
    await page.mouse.click(m8.x, m8.y);
    await settle();
    const tri = await ev(() => { const v = window.__doc().view, s = v.selection; return [s.anchor.off, s.head.off, v.layout.items[2].block.text.length]; });
    ok(`${Z}%: double-click selects the word, triple-click the paragraph`, same(dbl, { i: 2, off: 11, ai: 2, aoff: 5 })
      && tri[0] === 0 && tri[1] === tri[2], { dbl, tri });

    // typing places the caret (a click after the double-click time: not a third click)
    await wait(500);
    await page.mouse.click(c7.x, c7.y);
    await settle();
    await page.keyboard.type('Q');
    await settle();
    const ty = await ev(() => ({ text: window.__doc().doc.sections[0].blocks[2].text, h: window.__head(), ok: window.__caretOk() }));
    ok(`${Z}%: typing: the text goes in and the caret is after it, zoomed`, ty.text.startsWith('Wide WWQMMWW') && ty.h.off === 8 && ty.ok, ty);
    await page.keyboard.press('Control+z');
    await settle();

    // scroll to the caret
    const sc = await ev(async () => {
      window.__sel(150, 3);
      await window.__frames(3);
      const d = window.__doc(), w = d.win, c = os.wimp.caret.pos;
      return { sy: w.scrollY, h: w.h, c, ok: window.__caretOk() };
    });
    ok(`${Z}%: the caret is scrolled into view below the bars`, sc.ok && sc.c.y >= sc.sy + TOP && sc.c.y + sc.c.h <= sc.sy + sc.h, sc);

    // Page Down
    const pd = await ev(async () => {
      const d = window.__doc(), w = d.win;
      w.scrollTo(0, 0);
      window.__sel(0, 0);
      await window.__frames(2);
      return { h: w.h, cy: os.wimp.caret.pos.y };
    });
    await page.keyboard.press('PageDown');
    await settle();
    const pd2 = await ev(() => ({ sy: window.__doc().win.scrollY, cy: os.wimp.caret.pos.y, ok: window.__caretOk() }));
    const step = pd.h - TOP - 32;
    ok(`${Z}%: Page Down scrolls the visible height less the bars and 32; the caret goes as far (on the screen)`,
      pd2.sy === step && pd2.cy >= pd2.sy + TOP && Math.abs((pd2.cy - pd.cy) - step) <= 30 * z + 1 && pd2.ok, { pd, pd2, step });

    // Ctrl-A
    const sy0 = await ev(() => window.__doc().win.scrollY);
    await page.keyboard.press('Control+a');
    await settle();
    const all = await ev(() => { const v = window.__doc().view, L = v.layout, s = v.selection;
      return { a: same(s.anchor, L.docStart()) || same(s.head, L.docStart()), b: same(s.head, L.docEnd()) || same(s.anchor, L.docEnd()), sy: window.__doc().win.scrollY };
      function same(p, q) { return p.id === q.id && p.off === q.off; } });
    ok(`${Z}%: Ctrl-A selects everything without scrolling`, all.a && all.b && all.sy === sy0, { all, sy0 });

    // above and below everything
    await home();
    const up = await ev((top) => { const w = window.__doc().win; return window.__screen(w.x + 300, w.y + top + 3); }, TOP);
    await page.mouse.click(up.x, up.y);
    await settle();
    const hu = await head();
    const dn = await ev(async () => { const w = window.__doc().win; w.scrollTo(0, 1e9); await window.__frames(2); return window.__screen(w.x + 300, w.y + w.h - 4); });
    await page.mouse.click(dn.x, dn.y);
    await settle();
    const hb = await ev(() => { const v = window.__doc().view, L = v.layout, e = L.docEnd(); return v.selection.head.id === e.id && v.selection.head.off === e.off; });
    ok(`${Z}%: a click just below the bars is the document's start, one below everything its end`, hu.i === 0 && hu.off === 0 && hb, { hu, hb });

    // the ruler
    await home();
    await ev(async () => { window.__sel(0, 2); await window.__frames(3); });
    const ru = await ev(() => {
      const d = window.__doc(), ru = d.ruler, L = d.view.layout, c = L.caretRect({ id: L.items[0].id, off: 0 });
      const m = ru.markers.find((k) => k.id === 'first'), s = window.__ws(c.x, c.y);
      return { zoom: ru.scale.zoom, inch: ru._x(1440) - ru._x(0), mark: ru.pane.workToScreen(ru._x(m.twips), 0).x, caret: d.win.workToScreen(s.x, 0).x };
    });
    ok(`${Z}%: the ruler's inch is 96 x zoom px; the first-line marker is over the first line's start`, ru.zoom === z
      && Math.abs(ru.inch - 96 * z) < 1e-6 && Math.abs(ru.mark - ru.caret) <= 1, ru);
    await ev(async () => { window.__sel(3, 1); await window.__frames(2); });
    const mk = await ev(() => window.__mark('left'));
    await page.mouse.move(mk.x, mk.y);
    await page.mouse.down();
    await page.mouse.move(mk.x + 48 * z, mk.y, { steps: 6 });
    await page.mouse.up();
    await settle();
    const ind = await ev(() => window.__doc().doc.sections[0].blocks[3].pPr?.ind ?? null);
    ok(`${Z}%: dragging the left indent half an inch on the zoomed ruler sets 720 twips`, same(ind, { left: 720 }), ind);
    await page.keyboard.press('Control+z');
    await settle();

    // the toolbar: unchanged
    const bar = await ev(() => { const d = window.__doc(); return [d.toolbar.pane.x - d.win.x, d.toolbar.pane.y - d.win.y, d.toolbar.pane.w, d.toolbar.pane.h]; });
    ok(`${Z}%: the toolbar is as at 100%`, same(bar, bar0), { bar, bar0 });
  }

  // ---------------------------------------------------- zoom keeps the centre line
  await home();
  await setZoom(100);
  const cen = await ev(async () => {
    const d = window.__doc(), w = d.win;
    window.__sel(120, 0);
    await window.__frames(2);
    w.scrollTo(0, 1500);
    await window.__frames(2);
    const mid = () => { const L = d.view.layout, z = d.zoom / 100, y = w.scrollY + (L.top + w.h) / 2;
      return L.top + (y - L.top) / z; };
    const res = [mid()];
    for (const Z of [200, 50, 150, 100]) {
      d.setZoom(Z);
      await window.__frames(3);
      res.push(mid());
    }
    return { res, line: d.view.layout.items[100].lines[0].h, ok: window.__caretOk() };
  }).catch((e) => ({ err: String(e) }));
  ok('zooming keeps the line at the centre of the view (within a line), the caret consistent', cen.res
    && cen.res.every((y) => Math.abs(y - cen.res[0]) <= cen.line) && cen.ok, cen);

  // ---------------------------------------------------- Ctrl-Home / Ctrl-End at 50% and 200%
  for (const Z of [50, 200]) {
    await setZoom(Z);
    await home();
    await ev(async () => { window.__sel(5, 2); await window.__frames(2); });
    await page.keyboard.press('Control+End');
    await settle();
    const end = await ev(() => { const d = window.__doc(), w = d.win, v = d.view, L = v.layout, e = L.docEnd(), c = os.wimp.caret.pos;
      return { sy: w.scrollY, max: w.extent.y1 - w.h, at: v.selection.head.id === e.id && v.selection.head.off === e.off, ok: window.__caretOk(),
        seen: c.y >= w.scrollY + L.top && c.y + c.h <= w.scrollY + w.h }; });
    await page.keyboard.press('Control+Home');
    await settle();
    const top = await ev(() => { const d = window.__doc(), w = d.win, v = d.view, s0 = v.layout.docStart();
      return { sy: w.scrollY, at: v.selection.head.id === s0.id && v.selection.head.off === 0, ok: window.__caretOk() }; });
    ok(`${Z}%: Ctrl-End scrolls to the very bottom (the caret at the end, in view), Ctrl-Home to the very top`,
      end.sy === end.max && end.at && end.ok && end.seen && top.sy === 0 && top.at && top.ok, { end, top });
  }

  // ---------------------------------------------------- a drag past the window's bottom at 200% scrolls
  await setZoom(200);
  await home();
  const d5 = await at(2, 5);
  const below = await ev(() => { const w = window.__doc().win; return window.__screen(w.x + 300, w.y + w.h + 30); });
  await page.mouse.move(d5.x, d5.y);
  await page.mouse.down();
  await page.mouse.move(below.x, below.y, { steps: 4 });
  await wait(700);
  const as = await ev((pt) => {
    const d = window.__doc(), w = d.win, v = d.view, L = v.layout, z = d.zoom / 100;
    const sp = { x: (pt.x - os.wimp.screen.getBoundingClientRect().left) / os.wimp.scale, y: (pt.y - os.wimp.screen.getBoundingClientRect().top) / os.wimp.scale };
    const wp = w.screenToWork(sp.x, sp.y), lp = { x: wp.x / z, y: L.top + (wp.y - L.top) / z }, h = L.hitTest(lp.x, lp.y);
    return { sy: w.scrollY, head: window.__head(), hit: L.byId.get(h.pos.id).index === window.__head().i && h.pos.off === v.selection.head.off };
  }, below);
  await page.mouse.up();
  await settle();
  ok('200%: a drag below the window scrolls it (20 screen px steps) and the selection follows the pointer\'s zoomed place',
    as.sy > 0 && as.sy % 20 === 0 && as.head.ai === 2 && as.head.aoff === 5 && as.head.i > 2 && as.hit, as);

  // ---------------------------------------------------- the composition is drawn at the zoomed caret
  await home();
  const cp = await ev(async () => {
    const d = window.__doc(), w = d.win, L = d.view.layout;
    window.__sel(2, 5);
    await window.__frames(2);
    d.view.compose('\u6f22\u5b57');
    await window.__frames(3);
    const cv = w._canvas, k = cv.width / w.w, g = cv.getContext('2d');
    const count = (x0, y0, ww, hh) => {
      const px = g.getImageData(Math.round((x0 - w.scrollX) * k), Math.round((y0 - w.scrollY) * k), Math.round(ww * k), Math.round(hh * k)).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - 0x00) < 30 && Math.abs(px[i + 1] - 0x50) < 30 && Math.abs(px[i + 2] - 0xc8) < 30) n++;
      return n;
    };
    const c = window.__want(), l = L.caretRect({ id: L.items[2].id, off: 5 });
    const res = { zoomed: count(c.x, c.y, 120, c.h), plain: count(l.x, l.y, 60, l.h), comp: d.view.composing };
    d.view.compose(null);
    await window.__frames(2);
    return res;
  });
  ok('200%: the composing text is drawn (underlined) at the zoomed caret, not at the layout\'s place', cp.zoomed > 10 && cp.plain === 0 && cp.comp, cp);

  // ---------------------------------------------------- a wide window: the place on the page stays at the centre
  const wide = await ev(async () => {
    const d = window.__doc(), w = d.win, W = Math.min(1400, os.wimp.width - 20), res = [];
    d.setZoom(100);
    w.open({ x: 8, y: 40, w: W, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    const L0 = d.view.layout, lx = (w.scrollX + w.w / 2) - L0.pageLeft;   // page px at the centre, at 100%
    for (const Z of [200, 50, 100, 200, 100]) {
      d.setZoom(Z);
      await window.__frames(3);
      const L = d.view.layout, z = Z / 100;
      res.push({ Z, centre: (lx + L.pageLeft) * z - w.scrollX, half: w.w / 2, text: L.left * z - w.scrollX, sx: w.scrollX, page: L.pageW * z });
    }
    w.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(2);
    return { W, lx, res };
  });
  ok('a window wider than the page: after each zoom the same place on the page is at the window\'s centre (2 px); the text\'s left edge in view whenever the page fits',
    wide.res.every((r) => Math.abs(r.centre - r.half) <= 2 && r.text < wide.W && (r.page > wide.W || r.text >= 0)) && wide.res.some((r) => r.page <= wide.W), wide);

  // ---------------------------------------------------- Ctrl+wheel scrolls only as zoomScroll says; a burst is one step
  await setZoom(100);
  const cw = await ev(async () => { const d = window.__doc(), w = d.win; w.scrollTo(0, 1500); await window.__frames(2);
    return { sy: w.scrollY, h: w.h, at: window.__screen(w.x + 400, w.y + 300) }; });
  await page.mouse.move(cw.at.x, cw.at.y);
  await wait(400);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await wait(150);
  const cw2 = await ev(() => ({ zoom: window.__doc().zoom, sy: window.__doc().win.scrollY }));
  const burst = await ev(async () => {
    const d = window.__doc(), z0 = d.zoom, el = document.elementFromPoint(...Object.values(window.__screen(d.win.x + 400, d.win.y + 300)));
    await window.__sleep(150);
    for (let i = 0; i < 20; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true }));
    await window.__frames(2);
    const z1 = d.zoom;
    await window.__sleep(150);
    for (let i = 0; i < 200; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, ctrlKey: true, bubbles: true, cancelable: true }));
    await window.__frames(2);
    return { z0, z1, z2: d.zoom };
  });
  await page.keyboard.up('Control');
  ok('Ctrl+wheel scrolls the document only as far as keeping the centre needs (zoomScroll), not the wheel\'s own scroll too',
    cw2.zoom === 125 && cw2.sy === zoomScroll(cw.sy, cw.h, 1, 1.25, TOP), { cw, cw2 });
  ok('a burst of 20 (or 200) small Ctrl+wheel events within a frame: one step at most', burst.z0 === 125 && burst.z1 === 150
    && burst.z2 === 125, burst);

  // ---------------------------------------------------- Ctrl+wheel; the plain wheel
  await wait(400);                     // (the burst's wheel steps forgotten)
  await home();
  await setZoom(100);
  const mid = await ev(() => { const w = window.__doc().win; return window.__screen(w.x + 400, w.y + 300); });
  await page.mouse.move(mid.x, mid.y);
  const sy1 = await ev(() => window.__doc().win.scrollY);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await wait(200);
  const zin = await ev(() => window.__doc().zoom);
  await page.mouse.wheel(0, 100);
  await wait(200);
  await page.mouse.wheel(0, 100);
  await wait(200);
  await page.keyboard.up('Control');
  const zout = await ev(() => window.__doc().zoom);
  await page.mouse.wheel(0, 200);
  await wait(200);
  const plain = await ev(() => ({ zoom: window.__doc().zoom, sy: window.__doc().win.scrollY }));
  ok('Ctrl+wheel up zooms in a step, down out (one step per notch); the plain wheel scrolls and keeps the zoom',
    zin === 125 && zout === 75 && plain.zoom === 75 && plain.sy > sy1, { zin, zout, plain, sy1 });

  // ---------------------------------------------------- the wheel over the toolbar and the ruler (panes)
  await wait(400);
  await home();
  await setZoom(100);
  const paneAt = (which) => ev((w) => { const d = window.__doc(), p = d[w].pane;
    return window.__client(p, 60, p.h / 2); }, which);
  const paneState = () => ev(() => { const d = window.__doc(); return { t: d.toolbar.pane.scrollX, r: d.ruler.pane.scrollX,
    ty: d.toolbar.pane.scrollY, ry: d.ruler.pane.scrollY, zoom: d.zoom, sx: d.win.scrollX, sy: d.win.scrollY }; });
  const panes = {};
  for (const which of ['toolbar', 'ruler']) {
    const at0 = await paneAt(which);
    await page.mouse.move(at0.x, at0.y);
    await page.mouse.wheel(300, 0);
    await wait(150);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 200);
    await page.keyboard.up('Shift');
    await wait(150);
    const sideways = await paneState();
    const before = await paneState();
    await page.mouse.wheel(0, 150);
    await wait(150);
    const down = await paneState();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await wait(200);
    await page.keyboard.up('Control');
    const zoomed = await paneState();
    panes[which] = { sideways, before, down, zoomed };
    await wait(400);
    await home();
    await setZoom(100);
  }
  ok('a sideways or Shift wheel over the toolbar or the ruler leaves the pane unscrolled; a vertical wheel scrolls the document; Ctrl+wheel steps the zoom once',
    Object.values(panes).every((s) => s.sideways.t === 0 && s.sideways.r === 0 && s.down.t === 0 && s.down.r === 0
      && s.zoomed.t === 0 && s.zoomed.r === 0 && s.zoomed.ty === 0 && s.zoomed.ry === 0
      && s.down.sy > s.before.sy && s.down.zoom === 100 && s.zoomed.zoom === 125), panes);

  // ---------------------------------------------------- clamped
  const cl = await ev(async () => { const d = window.__doc(), res = [];
    for (const z of [1, 9999, -5, NaN, 333]) { d.setZoom(z); await window.__frames(1); res.push(d.zoom); }
    return res; });
  ok('the zoom is kept to 10%..500% (junk: 100%)', same(cl, [10, 500, 10, 100, 333]), cl);

  // ---------------------------------------------------- the Zoom menu
  await setZoom(100);
  const rows = await pickZoom('200%');
  const z200 = await ev(() => window.__doc().zoom);
  const rows2 = await pickZoom('Zoom out');
  const zo = await ev(() => window.__doc().zoom);
  const rows3 = await pickZoom('Zoom in');
  const zi = await ev(() => ({ zoom: window.__doc().zoom, caret: os.wimp.caret?.window === window.__doc().win, focused: !!os.wimp.textInput?.focused }));
  await pickZoom('100%');
  const z100 = await ev(() => window.__doc().zoom);
  const ticked = (rs) => rs.filter((x) => x[1]).map((x) => x[0]);
  ok('the window menu\'s Zoom: 50% to 200% (the zoom ticked), Zoom in, Zoom out; the caret stays',
    same(rows.map((x) => x[0]).slice(0, 6), ['50%', '75%', '100%', '125%', '150%', '200%']) && same(ticked(rows), ['100%'])
    && z200 === 200 && same(ticked(rows2), ['200%']) && zo === 150 && same(ticked(rows3), ['150%']) && zi.zoom === 200
    && zi.caret && zi.focused && z100 === 100, { rows, z200, rows2, zo, rows3, zi, z100 });

  // ---------------------------------------------------- resizing, laying out again, per window
  await setZoom(150);
  const rs = await ev(async () => {
    const d = window.__doc(), w = d.win;
    w.open({ x: 60, y: 40, w: 600, h: 400, behind: 'top' });
    await window.__frames(3);
    const L = d.view.layout, res = { width: L.width, ext: w.extent.x1 - w.extent.x0, zoom: d.zoom };
    res.page = L.pageLeft * 1.5;
    d.relayout();
    await window.__frames(3);
    res.after = { zoom: d.zoom, width: d.view.layout.width, ok: window.__caretOk(), eh: w.extent.y1 - w.extent.y0, lh: d.view.layout.height };
    os.vfs.writeFile('RAM::RamDisc0.$.U', await os.vfs.readFile('RAM::RamDisc0.$.T'), { filetype: 0xA7E });
    const u = await window.__word().word.open('RAM::RamDisc0.$.U');
    await window.__frames(2);
    res.other = window.__doc('U').zoom;
    res.mine = d.zoom;
    u.close();
    await window.__frames(2);
    return res;
  });
  ok('resized at 150%: laid out for 600 / 1.5 px, the extent at least as wide; laying out again keeps the zoom',
    rs.zoom === 150 && Math.abs(rs.width - 400) < 1e-9 && rs.ext >= 600 && rs.after.zoom === 150 && Math.abs(rs.after.width - 400) < 1e-9
    && rs.after.ok && rs.after.eh === Math.ceil(TOP + (rs.after.lh - TOP) * 1.5), rs);
  ok('zoom is per window: another document opens at 100%', rs.other === 100 && rs.mine === 150, rs);

  // ---------------------------------------------------- 50,000 paragraphs at 200%
  const big = await ev(async (bytes) => {
    os.vfs.writeFile('RAM::RamDisc0.$.Huge', new Uint8Array(bytes), { filetype: 0xA7E });
    const t0 = performance.now();
    const dw = await window.__word().word.open('RAM::RamDisc0.$.Huge');
    const d = window.__doc('Huge');
    d.setZoom(200);
    await window.__frames(2);
    const opened = performance.now() - t0;
    const w = d.win, times = [], texts = [];
    const f = w._onRedraw, g0 = w._canvas.getContext('2d'), ft = g0.fillText;
    let nt = 0;
    g0.fillText = function (...a) { nt++; return ft.apply(this, a); };
    w._onRedraw = (g, rc) => { const t = performance.now(); nt = 0; f(g, rc); times.push(performance.now() - t); texts.push(nt); };
    for (const y of [0, w.extent.y1 / 2, w.extent.y1 - 600, w.extent.y1 / 3]) {
      w.scrollTo(0, Math.round(y));
      w.invalidate();
      await window.__frames(2);
    }
    w._onRedraw = f;
    g0.fillText = ft;
    const res = { opened, times, texts, eh: w.extent.y1, n: d.view.layout.items.length };
    dw.close();
    await window.__frames(2);
    return res;
  }, HUGE);
  ok('a 50,000-paragraph document at 200%: every frame paints in well under a second (and only the lines in view are drawn: a few dozen fillText calls)', big.n === 50000 && big.times.length >= 4
    && big.texts.every((n) => n > 5 && n < 200) && Math.max(...big.times) < 400, { max: Math.max(...big.times), ...big });

  // ---------------------------------------------------- 30 open/zoom/close cycles
  const lk = await ev(async () => {
    const t = window.__word();
    const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length];
    const cycle = async (i) => {
      os.vfs.writeFile('RAM::RamDisc0.$.Cyc', await os.vfs.readFile('RAM::RamDisc0.$.T'), { filetype: 0xA7E });
      const dw = await t.word.open('RAM::RamDisc0.$.Cyc');
      await window.__frames(1);
      dw.setZoom([50, 75, 125, 150, 200][i % 5]);
      dw.win.emit('wheel', { dx: 0, dy: -1 });
      await window.__frames(1);
      dw.close();
    };
    await cycle(0);
    await window.__frames(2);
    const before = count();
    for (let i = 1; i <= 30; i++) await cycle(i);
    await window.__frames(3);
    return { before, after: count(), msgs: window.__msgs };
  });
  ok('30 open/zoom/close cycles leave no windows behind', same(lk.after.slice(0, 2), lk.before.slice(0, 2))
    && Math.abs(lk.after[2] - lk.before[2]) <= 5 && !lk.msgs.length, lk);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ---------------------------------------------------- hiDPI (deviceScaleFactor 2) at 150%
{
  const { browser: b2, page: p2, logs: l2 } = await launch({ zoom: 2 });
  try {
    const s = await start(p2);
    await p2.evaluate(async () => {
      const d = window.__doc(), g = d.win._canvas.getContext('2d'), ft = g.fillText;
      window.__ks = [];
      g.fillText = function (...a) { window.__ks.push(this.getTransform().a); return ft.apply(this, a); };
      d.setZoom(150);
      window.__sel(0, 2);
      await window.__frames(3);
    });
    const c7 = await p2.evaluate(() => window.__at(2, 7));
    await p2.mouse.click(c7.x, c7.y);
    await p2.evaluate(() => window.__frames(3));
    const h = await p2.evaluate(() => {
      const d = window.__doc(), w = d.win, cv = w._canvas, ru = d.ruler, L = d.view.layout;
      const c = L.caretRect({ id: L.items[2].id, off: 0 }), m = ru.markers.find((k) => k.id === 'first'), sc = window.__ws(c.x, c.y);
      return { k: cv.width / w.w, ks: [...new Set(window.__ks)], head: window.__head(), caret: window.__caretOk(),
        ruler: [ru.scale.zoom, ru.pane.workToScreen(ru._x(m.twips), 0).x, w.workToScreen(sc.x, 0).x], rk: ru.pane._canvas.width / ru.pane.w };
    });
    ok('hiDPI at 150%: the backing store is at the device scale (2), text drawn at 2 x 1.5 (no double scaling)',
      s.ok && h.k === 2 && h.rk === 2 && h.ks.length && h.ks.every((a) => Math.abs(a - 3) < 1e-9), h);
    ok('hiDPI at 150%: a click picks the place, the caret and the ruler\'s marker are where the text is',
      h.head.i === 2 && h.head.off === 7 && h.caret && h.ruler[0] === 1.5 && Math.abs(h.ruler[1] - h.ruler[2]) <= 1, h);
  } catch (e) {
    out.push('FAIL hiDPI exception ' + (e.stack ?? e));
  }
  await b2.close();
  logs.push(...l2);
}

const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
ok('no page errors', !errs.length, errs);
console.log(out.join('\n'));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
