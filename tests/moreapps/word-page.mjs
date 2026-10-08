// !Word's page in the real desktop: a new (Untitled) document shows a
// whole white page, as Word does, not a page that ends with its text.
// Opened from the icon bar's New (task.word.newUntitled) at the
// default window size: the window is as tall as the page where the
// screen has room (never under 560 px), and the canvas is white down a
// column inside the page from just below the bars to the bottom of
// the work area (no grey desk inside the page); the page is pgSz.h /
// 15 px high (A4 1123, Letter 1056), its white bottom then the grey
// desk at the end of the extent; at 50% the whole page shows with grey
// below it, at 200% it scrolls and ends the same way. A click (the
// real mouse) low in the empty page puts the caret at the end of the
// document, on an empty one and on one of 3 paragraphs; typing goes
// there; a double click there selects in the last paragraph, a triple
// click selects it; Ctrl-End and Page Down keep the caret at the end
// and in view; a click in the grey desk below the page, or at the very
// bottom after scrolling to the end, is the end too, and a drag from
// the text to below the page selects to the end. Needs the disc
// built by tools/disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const A4H = 16838 / 15, LETTERH = 15840 / 15;

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async () => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__d = null;
    /** A new Untitled document (paper 'a4' or 'letter') -> its test view, kept as window.__d. */
    window.__new = async (paper) => {
      const t = window.__word();
      const dw = await t.word.newUntitled(paper);
      await window.__frames(3);
      window.__d = t.word.docs.find((x) => x.dw === dw);
      return window.__d;
    };
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__client = (win, x, y) => { const s = win.workToScreen(x, y); return window.__screen(s.x, s.y); };
    /** Layout -> the work area at the document's zoom. */
    window.__ws = (x, y) => {
      const d = window.__d, z = d.zoom / 100, t = d.view.layout.top;
      return { x: x * z, y: t + (y - t) * z };
    };
    /** The colour of the canvas at a work-area point (visible) -> [r, g, b]. */
    window.__px = (x, y) => {
      const w = window.__d.win, cv = w._canvas, k = cv.width / w.w;
      const p = cv.getContext('2d').getImageData(Math.round((x - w.scrollX) * k), Math.round((y - w.scrollY) * k), 1, 1).data;
      return [p[0], p[1], p[2]];
    };
    window.__white = (c) => c[0] === 255 && c[1] === 255 && c[2] === 255;
    window.__grey = (c) => c[0] === 0x88 && c[1] === 0x88 && c[2] === 0x88;
    /** The visible rows (work area, below the bars) of screen column x: first and last white, and any non-white
     *  between rows a and b. */
    window.__column = (x, a, b) => {
      const w = window.__d.win, t = window.__d.view.layout.top;
      const y0 = w.scrollY + t, y1 = w.scrollY + w.h - 1;
      let first = null, last = null;
      const bad = [];
      for (let y = y0; y <= y1; y++) {
        const c = window.__px(x, y);
        if (window.__white(c)) { first ??= y; last = y; } else if (a !== undefined && y >= a && y <= b) bad.push([y, c]);
      }
      return { first, last, bad: bad.slice(0, 5), nBad: bad.length };
    };
    /** At the document's zoom: the page's top row (scrolled to 0) and bottom row (scrolled to the end) in column x
     *  (layout px), and what is below the bottom. */
    window.__pageRun = async (lx) => {
      const d = window.__d, w = d.win, x = window.__ws(lx, 0).x;
      w.scrollTo(0, 0);
      await window.__frames(2);
      const top = window.__column(x).first;
      w.scrollTo(0, w.extent.y1);
      await window.__frames(2);
      const c = window.__column(x);
      const off = Math.round(5 * d.zoom / 100) + 1;      // (past the page's shadow)
      const below = c.last !== null && c.last + off < w.scrollY + w.h ? window.__px(x, c.last + off) : null;
      return { top, bottom: c.last, below, sy: w.scrollY, max: w.extent.y1 - w.h, eh: w.extent.y1 - w.extent.y0 };
    };
    window.__head = () => { const v = window.__d.view, s = v.selection, L = v.layout;
      return { i: L.byId.get(s.head.id).index, off: s.head.off, ai: L.byId.get(s.anchor.id).index, aoff: s.anchor.off,
        n: L.items.length, len: L.items.at(-1).block.text.length }; };
    window.__caretSeen = () => {
      const d = window.__d, w = d.win, c = d.view.caretRect(), t = d.view.layout.top;
      return !!c && c.y >= w.scrollY + t && c.y + c.h <= w.scrollY + w.h;
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  });

  // ------------------------------------------------ a new A4 document at the default window size
  const n1 = await ev(async () => {
    const d = await window.__new();
    const w = d.win, L = d.view.layout;
    const res = { wh: w.h, wy: w.y, sh: os.wimp.height, top: L.top, pageH: L.pageH, lh: L.height,
      eh: w.extent.y1 - w.extent.y0, pageLeft: L.pageLeft, pageW: L.pageW, sy: w.scrollY, zoom: d.zoom,
      lines: d.view.lines() };
    const t = L.top;
    res.left = window.__column(L.pageLeft + 12, t + 10, w.scrollY + w.h - 1);
    res.right = window.__column(L.pageLeft + L.pageW - 12, t + 10, w.scrollY + w.h - 1);
    res.mid = window.__column(L.pageLeft + L.pageW / 2, t + 10, w.scrollY + w.h - 1);
    res.desk = window.__px(Math.max(2, L.pageLeft - 10), t + 300);
    res.gap = window.__px(L.pageLeft + 12, t + 3);
    return res;
  });
  ok('a new document: one empty paragraph at 100%, A4 (pageH = 16838 / 15)', n1.zoom === 100 && n1.lines.length === 1
    && n1.lines[0] === '' && Math.abs(n1.pageH - A4H) < 1e-6, n1);
  ok('the extent holds the whole page: bars + 8 + pageH + 8', Math.abs(n1.lh - (n1.top + 16 + A4H)) < 1e-6
    && n1.eh === Math.ceil(n1.lh), n1);
  ok('the default window is as tall as the page where the screen has room (never under 560)',
    n1.wh === Math.max(560, Math.min(n1.sh - n1.wy - 92, Math.ceil(n1.top + A4H + 16))) && n1.wh < n1.eh, n1);
  ok('white down the page\'s left margin from the page top to the bottom of the window (no grey strip)',
    n1.left.first === n1.top + 8 && n1.left.nBad === 0 && n1.left.last === n1.sy + n1.wh - 1, n1.left);
  ok('... and down its right margin and its middle', n1.right.nBad === 0 && n1.right.last === n1.sy + n1.wh - 1
    && n1.mid.nBad === 0 && n1.mid.last === n1.sy + n1.wh - 1, [n1.right, n1.mid]);
  ok('grey desk beside the page and in the 8 px above it', JSON.stringify(n1.desk) === '[136,136,136]'
    && JSON.stringify(n1.gap) === '[136,136,136]', n1);

  // ------------------------------------------------ the page's height and its end
  const r1 = await ev(() => window.__pageRun(window.__d.view.layout.pageLeft + 12));
  ok('the page is pgSz.h / 15 px high (A4: 1123 rows of white)', r1.top !== null && r1.bottom - r1.top + 1 === Math.round(A4H), r1);
  ok('scrolled to the end: the page\'s white bottom margin, then grey desk', r1.sy === r1.max && r1.sy > 0
    && JSON.stringify(r1.below) === '[136,136,136]' && r1.eh - r1.bottom > 0 && r1.eh - r1.bottom <= 10, r1);

  // ------------------------------------------------ zoom
  const z50 = await ev(async () => {
    const d = window.__d, w = d.win;
    d.setZoom(50);
    await window.__frames(3);
    w.scrollTo(0, 0);
    await window.__frames(2);
    const L = d.view.layout, t = L.top, x = window.__ws(L.pageLeft + 12, 0).x;
    const c = window.__column(x);
    const bottom = window.__ws(0, t + 8 + L.pageH).y;
    return { eh: w.extent.y1 - w.extent.y0, wh: w.h, c, bottom, t, below: window.__px(x, Math.min(w.h - 1, c.last + 6)),
      sy: w.scrollY, end: window.__px(x, w.h - 1) };
  });
  ok('at 50% the whole page is in the window, grey below it', z50.eh <= z50.wh && z50.c.first === z50.t + 4
    && Math.abs(z50.c.last - z50.bottom) <= 1.5 && JSON.stringify(z50.below) === '[136,136,136]'
    && JSON.stringify(z50.end) === '[136,136,136]', z50);
  const z200 = await ev(async () => {
    const d = window.__d;
    d.setZoom(200);
    await window.__frames(3);
    const r = await window.__pageRun(d.view.layout.pageLeft + 12);
    d.setZoom(100);
    await window.__frames(3);
    return r;
  });
  ok('at 200% the page scrolls: it is 2 x pageH rows, then grey desk', z200.eh > 2 * A4H && z200.sy === z200.max
    && Math.abs(z200.bottom - z200.top + 1 - 2 * A4H) <= 2 && JSON.stringify(z200.below) === '[136,136,136]', z200);

  // ------------------------------------------------ clicks low in the empty page (the real mouse)
  const lowPoint = () => ev(() => {
    const d = window.__d, w = d.win, L = d.view.layout;
    w.scrollTo(0, 0);
    return window.__client(w, L.pageLeft + L.pageW / 2, w.h - 40);
  });
  await ev(() => window.__frames(2));
  let at = await lowPoint();
  await ev(() => window.__frames(2));
  await page.mouse.click(at.x, at.y);
  await ev(() => window.__frames(2));
  const c1 = await ev(() => ({ h: window.__head(), focus: os.wimp.caret?.window === window.__d.win }));
  ok('an empty document: a click low in the page puts the caret at the end', c1.h.i === 0 && c1.h.off === 0
    && c1.h.off === c1.h.len && c1.focus, c1);
  await page.keyboard.type('One');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Three');
  await ev(() => window.__frames(2));
  await page.keyboard.press('Control+Home');
  await ev(() => window.__frames(2));
  const c2a = await ev(() => ({ lines: window.__d.view.lines(), h: window.__head() }));
  ok('... typing goes there: 3 paragraphs', JSON.stringify(c2a.lines) === '["One","Two","Three"]' && c2a.h.i === 0 && c2a.h.off === 0, c2a);
  await ev(() => window.__frames(2));
  at = await lowPoint();
  await new Promise((res) => setTimeout(res, 500));     // (not a double click)
  await page.mouse.click(at.x, at.y);
  await ev(() => window.__frames(2));
  const c2 = await ev(() => window.__head());
  ok('3 paragraphs: a click low in the page puts the caret at the end', c2.i === 2 && c2.off === 5 && c2.off === c2.len
    && c2.ai === 2 && c2.aoff === 5, c2);
  await page.keyboard.type(' four');
  await ev(() => window.__frames(2));
  const c3 = await ev(() => window.__d.view.lines());
  ok('... and typing goes there', JSON.stringify(c3) === '["One","Two","Three four"]', c3);
  await new Promise((res) => setTimeout(res, 500));
  await page.mouse.dblclick(at.x, at.y);
  await ev(() => window.__frames(2));
  const c4 = await ev(() => ({ ...window.__head(), text: window.__d.view.text() }));
  await page.mouse.click(at.x, at.y);                  // (a triple click: within the double-click time)
  await ev(() => window.__frames(2));
  const c5 = await ev(() => ({ h: window.__head(), text: window.__d.view.text() }));
  ok('a double click low in the page selects the last word (a selection, not a caret)', c4.i === 2 && c4.ai === 2
    && c4.off !== c4.aoff && Math.max(c4.off, c4.aoff) === c4.len && c4.text === 'four', c4);
  ok('a triple click there selects the last paragraph', c5.h.i === 2 && c5.h.ai === 2 && /^Three four/.test(c5.text)
    && Math.min(c5.h.off, c5.h.aoff) === 0, c5);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+End');
  await ev(() => window.__frames(2));
  const k1 = await ev(() => ({ h: window.__head(), seen: window.__caretSeen() }));
  ok('Ctrl-End: the caret at the end, in view', k1.h.i === 2 && k1.h.off === 10 && k1.h.ai === 2 && k1.h.aoff === 10 && k1.seen, k1);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('PageDown');
  await ev(() => window.__frames(2));
  const k2 = await ev(() => ({ h: window.__head(), seen: window.__caretSeen(), sy: window.__d.win.scrollY }));
  ok('Page Down from the start: the caret at the end (the empty page below it), in view', k2.h.i === 2 && k2.h.off === 10 && k2.seen, k2);
  await page.keyboard.press('PageUp');
  await ev(() => window.__frames(2));
  const k3 = await ev(() => ({ h: window.__head(), seen: window.__caretSeen() }));
  ok('... Page Up back to the start', k3.h.i === 0 && k3.h.off === 0 && k3.seen, k3);

  // ------------------------------------------------ clicks in the desk below the page, and a drag to there
  /** The client point of layout (x, y) in the window (scrolled first to sy: 'end' for the end). */
  const pt = (x, y, sy) => ev(async (a) => {
    const d = window.__d, w = d.win;
    if (a.sy !== undefined) { w.scrollTo(0, a.sy === 'end' ? w.extent.y1 : a.sy); await window.__frames(2); }
    const L = d.view.layout, f = new Function('L', 'return [' + a.x + ', ' + a.y + '];')(L);
    const s = window.__ws(f[0], f[1]);
    return { ...window.__client(w, s.x, s.y), wy: s.y, sy: w.scrollY, h: w.h, eh: w.extent.y1 };
  }, { x, y, sy });
  const toStart = async () => {
    await new Promise((res) => setTimeout(res, 500));    // (no double click)
    await ev(() => { const v = window.__d.view, L = v.layout; v.setSelection(L.docStart()); return window.__frames(2); });
  };
  await toStart();
  const g1p = await pt('L.pageLeft + L.pageW / 2', 'L.top + 8 + L.pageH + 4', 'end');
  await page.mouse.click(g1p.x, g1p.y);
  await ev(() => window.__frames(2));
  const g1 = { p: g1p, h: await ev(() => window.__head()) };
  ok('a click in the grey desk just below the page\'s bottom: the caret at the end', g1.p.wy > g1.p.sy && g1.p.wy < g1.p.sy + g1.p.h
    && g1.h.i === 2 && g1.h.off === g1.h.len && g1.h.aoff === g1.h.len, g1);
  await toStart();
  const g2p = await pt('L.pageLeft + 40', 'L.height - 2', 'end');
  await page.mouse.click(g2p.x, g2p.y);
  await ev(() => window.__frames(2));
  const g2 = { p: g2p, h: await ev(() => window.__head()) };
  ok('scrolled to the end, a click at the very bottom: the caret at the end', g2.p.wy < g2.p.sy + g2.p.h && g2.h.i === 2
    && g2.h.off === g2.h.len && g2.h.aoff === g2.h.len, g2);
  // a drag from the middle of 'Two' to below the page's bottom (50%: the whole page is in the window)
  await toStart();
  await ev(async () => { window.__d.setZoom(50); await window.__frames(3); window.__d.win.scrollTo(0, 0); await window.__frames(2); });
  const d0 = await pt('L.caretRect({id: L.items[1].id, off: 1}).x + 1', 'L.caretRect({id: L.items[1].id, off: 1}).y + 6');
  const d1 = await pt('L.pageLeft + L.pageW / 2', 'L.top + 8 + L.pageH + 4');
  await page.mouse.move(d0.x, d0.y);
  await page.mouse.down();
  await page.mouse.move((d0.x + d1.x) / 2, (d0.y + d1.y) / 2, { steps: 4 });
  await page.mouse.move(d1.x, d1.y, { steps: 4 });
  await page.mouse.up();
  await ev(() => window.__frames(2));
  const dr = await ev(async () => {
    const r = { ...window.__head(), text: window.__d.view.text() };
    window.__d.setZoom(100);
    await window.__frames(3);
    return r;
  });
  ok('a drag from the middle of the text to below the page\'s bottom selects to the end', dr.ai === 1 && dr.aoff === 1
    && dr.i === 2 && dr.off === dr.len && /^wo/.test(dr.text) && /Three four$/.test(dr.text), { dr, d0, d1 });

  // an empty document: Page Down and Ctrl-End leave the caret where it is, in view
  await ev(() => window.__new());
  at = await lowPoint();
  await new Promise((res) => setTimeout(res, 500));
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('PageDown');
  await page.keyboard.press('Control+End');
  await ev(() => window.__frames(2));
  const e1 = await ev(() => ({ h: window.__head(), seen: window.__caretSeen(), msgs: [...window.__msgs],
    focus: os.wimp.caret?.window === window.__d.win }));
  ok('an empty document: Page Down and Ctrl-End keep the caret at its start, in view', e1.focus && e1.h.i === 0 && e1.h.off === 0
  && e1.seen && !e1.msgs.length, e1);

  // ------------------------------------------------ Letter paper
  const l1 = await ev(async () => {
    const d = await window.__new('letter');
    const L = d.view.layout;
    return { pageH: L.pageH, lh: L.height, top: L.top, w: L.pageW, run: await window.__pageRun(L.pageLeft + 12) };
  });
  ok('Letter paper: the page is 15840 / 15 = 1056 px high', Math.abs(l1.pageH - LETTERH) < 1e-6 && Math.abs(l1.w - 816) < 1e-6
    && Math.abs(l1.lh - (l1.top + 16 + LETTERH)) < 1e-6 && l1.run.bottom - l1.run.top + 1 === LETTERH
    && JSON.stringify(l1.run.below) === '[136,136,136]', l1);
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
