// !Word's caret and selection in the real desktop: clicks, drags
// (with auto-scroll), Shift/Adjust clicks, double and triple clicks,
// the keys (arrows by grapheme, the goal column, Home/End, Ctrl-
// arrows, Page Down, Shift to extend, Ctrl-A, Escape), the table box
// as one thing, keys it does not use passed on, the Menu button, a
// hiDPI canvas (and a click on it), no leaks (windows, elements, and
// a document closed mid-drag: timers, pointer listeners, drawing),
// and a 5000-paragraph document.
// Positions are worked out from the layout the test hook gives
// (task.word.docs[i].view) and checked against the pixels drawn.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r, REL } from './build-docx.mjs';

const LINK = '<w:hyperlink r:id="rIdL"><w:r><w:t>link text</w:t></w:r></w:hyperlink>';
const LONG = 'This paragraph is long enough to be wrapped onto several lines ' +
  'in the window, so that the line breaking can be seen to work: it goes on ' +
  'and on, word after word, until it has filled three or four lines at least.';
const PARAS = [
  p(r('Selecting text'), '<w:pStyle w:val="Heading1"/>'),
  p(r('The quick brown fox jumps over the lazy dog, again and again.')),
  p(r('Short')),
  p(r('Another line of text that is long enough to reach far right.')),
  p(r('Emoji \u{1F600} here and é there.')),
  p(r('Tab') + '<w:r><w:tab/></w:r>' + r('stop, a ') + LINK + r(' and the end.')),
  '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' +
    p(r('a cell')) + '</w:tc></w:tr></w:tbl>',
  p(r(LONG), '<w:ind w:left="720"/>'),
  p(r('Last of the text.')),
  ...Array.from({ length: 30 }, (_, i) => p(r(`Filler paragraph ${i} with some words in it.`))),
];
const fixture = () => buildDocx({ 'word/document.xml': documentXml(PARAS.join('')) },
  { docRels: [['rIdL', REL('hyperlink'), 'http://example.com/', 'External']] });
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const big = () => buildDocx({ 'word/document.xml': documentXml(Array.from({ length: 5000 }, (_, i) =>
  p(r(`${i}: ` + Array.from({ length: 8 + (i % 7) }, (_, k) => WORDS[(i + k) % 10]).join(' ')))).join('')) });

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const bytes = Array.from(await fixture());
const bigBytes = Array.from(await big());

/** Boot, put the files on the RAM disc, open Edit.docx in Word. */
async function start(page, { h = 300 } = {}) {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  return page.evaluate(async ([a, b, h]) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    os.vfs.writeFile('RAM::RamDisc0.$.Edit', new Uint8Array(a), { filetype: 0xA7E });
    os.vfs.writeFile('RAM::RamDisc0.$.Big', new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (title = 'Edit') => window.__word()?.word.docs.find((d) => d.win.title === title);
    const pos = (it, off) => ({ id: it.id, off });
    /** Client (page) coordinates of work-area point x, y of d's window. */
    window.__client = (d, x, y) => {
      const s = d.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Client point just inside the caret place of (item i, off). */
    window.__point = (i, off, dx = 1) => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect(pos(L.items[i], off));
      return window.__client(d, c.x + dx, c.y + c.h / 2);
    };
    window.__set = (i, off, j = i, off2 = off) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection(pos(L.items[i], off), pos(L.items[j], off2));
    };
    window.__sel = () => {
      const d = window.__doc(), L = d.view.layout, s = d.view.selection;
      const ix = (q) => L.byId.get(q.id)?.index;
      return { a: [ix(s.anchor), s.anchor.off], h: [ix(s.head), s.head.off], text: d.view.text(), aff: s.affinity };
    };
    await os.filer.run('RAM::RamDisc0.$.Edit');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    const first = { w: d?.win.w, want: d && Math.min(os.wimp.width - 40, Math.ceil(d.view.layout.pageW + 48)) };
    d.win.open({ x: 100, y: 60, w: 860, h, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d, items: d?.view.layout.items.length, msgs: window.__msgs, first };
  }, [bytes, bigBytes, h]);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const click = async (i, off, opts) => { const q = await ev(([i, o]) => window.__point(i, o), [i, off]); await page.mouse.click(q.x, q.y, opts); };
const sel = () => ev(() => window.__sel());
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
try {
  const s0 = await start(page);
  ok('the document opens in Word', s0.ok && s0.items === 39 && !s0.msgs.length, s0);
  ok('its window is as wide as the page and its edges', s0.first.w === s0.first.want && s0.first.w > 800, s0.first);

  // ---------------------------------------------------- the window
  const w0 = await ev(() => {
    const d = window.__doc(), w = d.win;
    return { ptr: w.pointer, hscroll: !!w.tool?.('hscroll'), help: String(w.helpText ?? ''), caret: d.view.selection,
      focus: os.wimp.caret?.window === w, L: { pageW: d.view.layout.pageW } };
  });
  ok('text pointer, horizontal scroll bar', w0.ptr === 'ptr_write' && w0.hscroll, w0);
  ok('the help says it can be selected and typed in', /select/i.test(w0.help) && /type/i.test(w0.help), w0.help);
  ok('it opens with the caret at the start, and the input focus', w0.focus && w0.caret?.anchor?.off === 0, w0);

  // ---------------------------------------------------- click
  await click(1, 4);
  const c1 = await ev(() => {
    const d = window.__doc(), w = d.win, L = d.view.layout, it = L.items[1];
    const c = L.caretRect({ id: it.id, off: 4 });
    const el = document.querySelector('.caret');
    const cv = w._canvas, k = cv.width / w.w, g = cv.getContext('2d');
    // ink by canvas column across the caret's line
    const x0 = Math.round((c.x - w.scrollX - 6) * k), y0 = Math.round((c.y - w.scrollY + 2) * k);
    const img = g.getImageData(x0, y0, Math.round(16 * k), Math.round((c.h - 4) * k));
    const cols = [];
    for (let x = 0; x < img.width; x++) {
      let n = 0;
      for (let y = 0; y < img.height; y++) { const q = (y * img.width + x) * 4; if (img.data[q] + img.data[q + 1] + img.data[q + 2] < 450) n++; }
      cols.push(n);
    }
    const at = Math.round(6 * k);
    return { sel: window.__sel(), c, caret: el && el.parentElement === w.work ? [parseFloat(el.style.left), parseFloat(el.style.top), parseFloat(el.style.height)] : null,
      gapBefore: cols.slice(at - Math.round(3 * k), at).some((n) => n === 0), inkAfter: cols.slice(at, at + Math.round(8 * k)).some((n) => n > 0), view: d.view.caretRect() };
  });
  ok('a click sets the caret to the place clicked', same(c1.sel.a, [1, 4]) && same(c1.sel.h, [1, 4]), c1.sel);
  ok('the Wimp caret is at the caret rectangle', c1.caret && c1.caret[0] === Math.round(c1.c.x) && c1.caret[1] === Math.round(c1.c.y) && c1.caret[2] === Math.round(c1.c.h)
    && same(c1.view, c1.c), c1);
  ok('... between the drawn words (a gap before it, ink after it)', c1.gapBefore && c1.inkAfter, c1);

  // a click far below the text (the bottom edge of the work area, at its far
  // left): the end of the document; at the very top: the start
  {
    await page.waitForTimeout(450);
    const q = await ev(async () => {
      const d = window.__doc(), w = d.win;
      w.scrollTo(0, w.extent.y1);
      await window.__frames(2);
      return window.__client(d, w.scrollX + 2, w.scrollY + w.h - 2);
    });
    await page.mouse.click(q.x, q.y);
    const below = await ev(() => { const L = window.__doc().view.layout; return { s: window.__sel(), n: L.items.length, end: L.docEnd().off }; });
    await page.waitForTimeout(450);
    const t = await ev(async () => {
      const d = window.__doc(), w = d.win;
      w.scrollTo(0, 0);
      await window.__frames(2);
      return window.__client(d, w.scrollX + w.w - 3, 2);
    });
    await page.mouse.click(t.x, t.y);
    const above = await sel();
    ok('a click far below is the end, far above the start', same(below.s.h, [below.n - 1, below.end]) && same(below.s.a, below.s.h)
      && same(above.h, [0, 0]) && same(above.a, [0, 0]), { below, above });
    await page.waitForTimeout(450);
  }

  // ---------------------------------------------------- drag
  {
    // (a press at the same place within the double-click time would be a double-click)
    await page.waitForTimeout(450);
    const a = await ev(() => window.__point(1, 4)), b = await ev(() => window.__point(1, 19));
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    const s = await sel();
    ok('a drag selects from A to B', same(s.a, [1, 4]) && same(s.h, [1, 19]) && s.text === 'quick brown fox', s);
    // backwards
    await page.waitForTimeout(450);
    await page.mouse.move(b.x, b.y); await page.mouse.down();
    await page.mouse.move(a.x, a.y, { steps: 6 }); await page.mouse.up();
    const t = await sel();
    ok('... and backwards', same(t.a, [1, 19]) && same(t.h, [1, 4]) && t.text === 'quick brown fox', t);
    // the selection is painted (light blue under the words)
    const lit = await ev(() => {
      const d = window.__doc(), w = d.win, L = d.view.layout, cv = w._canvas, k = cv.width / w.w;
      // the middle of the space after "quick", near the line's top
      const c = L.caretRect({ id: L.items[1].id, off: 9 }), e = L.caretRect({ id: L.items[1].id, off: 10 });
      const px = cv.getContext('2d').getImageData(Math.round(((c.x + e.x) / 2 - w.scrollX) * k), Math.round((c.y + 2 - w.scrollY) * k), 1, 1).data;
      return [...px].slice(0, 3);
    });
    ok('the selection is drawn light blue', lit[2] > 240 && lit[0] > 150 && lit[0] < 200 && lit[1] > 190 && lit[1] < 230, lit);
  }

  // ---------------------------------------------------- drag out of the window: auto-scroll
  {
    await ev(() => window.__doc().win.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const a = await ev(() => window.__point(1, 0));
    const box = await ev(() => { const w = window.__doc().win; return window.__client(window.__doc(), w.scrollX + 200, w.scrollY + w.h + 40); });
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + 20, { steps: 3 });
    await page.mouse.move(box.x, box.y, { steps: 4 });
    await page.waitForTimeout(500);
    const mid = await ev(() => ({ y: window.__doc().win.scrollY, s: window.__sel() }));
    await page.mouse.up();
    const y1 = await ev(() => window.__doc().win.scrollY);
    await page.waitForTimeout(400);
    const after = await ev(() => ({ y: window.__doc().win.scrollY, s: window.__sel() }));
    ok('dragging below the window scrolls it and extends the selection', mid.y > 40 && same(mid.s.a, [1, 0]) && mid.s.h[0] > 8, mid);
    ok('... and stops when the button is released', after.y === y1, { mid, y1, after });
    await ev(() => window.__doc().win.scrollTo(0, 0));
    await page.waitForTimeout(100);
  }

  // ---------------------------------------------------- Shift and Adjust clicks
  {
    await click(1, 4);
    await page.keyboard.down('Shift');
    await click(1, 16);
    await page.keyboard.up('Shift');
    const s = await sel();
    ok('Shift-click extends from the anchor', same(s.a, [1, 4]) && same(s.h, [1, 16]), s);
    await page.keyboard.down('Shift');
    await click(1, 10);
    await page.keyboard.up('Shift');
    const s2 = await sel();
    ok('... again, from the same anchor (shrinks)', same(s2.a, [1, 4]) && same(s2.h, [1, 10]) && s2.text === 'quick ', s2);
    // Adjust: the right button with the Acorn mapping (these pages start with
    // the two-button one, where right is Menu), so with no Shift held
    await page.waitForTimeout(450);
    await ev(() => { window.__set(1, 4); os.input.config.rightIsAdjust = true; });
    await click(3, 7, { button: 'right' });
    const s3 = await ev(() => { os.input.config.rightIsAdjust = false; return { ...window.__sel(), menu: os.wimp.menus.isOpen }; });
    ok('Adjust-click extends from the anchor too', same(s3.a, [1, 4]) && same(s3.h, [3, 7]) && !s3.menu, s3);
  }

  // ---------------------------------------------------- double and triple clicks
  {
    await page.waitForTimeout(450);
    const q = await ev(() => window.__point(1, 12));
    await page.mouse.dblclick(q.x, q.y);
    const s = await sel();
    ok('a double-click selects the word (not the space after it)', same(s.a, [1, 10]) && same(s.h, [1, 15]) && s.text === 'brown', s);
    await page.waitForTimeout(450);
    await page.mouse.click(q.x, q.y, { clickCount: 3 });
    const t = await sel();
    const len = await ev(() => window.__doc().view.layout.items[1].block.text.length);
    ok('a triple-click selects the paragraph', same(t.a, [1, 0]) && same(t.h, [1, len]) && /^The quick.*again\.$/.test(t.text), t);
    await page.waitForTimeout(450);
    // a click after the double-click time is a plain click again
    await page.mouse.click(q.x, q.y);
    const u = await sel();
    ok('a later click is a click', same(u.a, u.h) && u.a[0] === 1, u);
    // double-click on the table box: the whole box
    const tb = await ev(() => { const d = window.__doc(), L = d.view.layout, b = L.boxRect(L.items[6]); return window.__client(d, b.x + 40, b.y + b.h / 2); });
    await page.waitForTimeout(450);
    await page.mouse.dblclick(tb.x, tb.y);
    const v = await sel();
    ok('double-click on the table box selects it whole', same(v.a, [6, 0]) && same(v.h, [6, 1]), v);
    const blue = await ev(async () => {
      await window.__frames(2);
      const d = window.__doc(), w = d.win, L = d.view.layout, b = L.boxRect(L.items[6]), cv = w._canvas, k = cv.width / w.w;
      return [...cv.getContext('2d').getImageData(Math.round((b.x + b.w - 20 - w.scrollX) * k), Math.round((b.y + b.h / 2 - w.scrollY) * k), 1, 1).data].slice(0, 3);
    });
    ok('... and it is drawn selected', blue[2] > blue[0] + 20, blue);
    await page.waitForTimeout(450);
  }

  // ---------------------------------------------------- the Menu button
  {
    await ev(() => window.__set(1, 4, 1, 15));
    const q = await ev(() => window.__point(1, 8));
    await page.mouse.click(q.x, q.y, { button: 'right' });
    await page.waitForTimeout(100);
    const m = await ev(() => ({ open: os.wimp.menus.isOpen, s: window.__sel() }));
    ok('Menu opens the menu and leaves the selection', m.open && same(m.s.a, [1, 4]) && same(m.s.h, [1, 15]), m);
    await ev(() => os.wimp.menus.close());
    const q2 = await ev(() => window.__point(3, 20));
    await page.mouse.click(q2.x, q2.y, { button: 'right' });
    await page.waitForTimeout(100);
    const m2 = await ev(() => ({ open: os.wimp.menus.isOpen, s: window.__sel() }));
    ok('... also outside the selection (as in Edit)', m2.open && same(m2.s.a, [1, 4]) && same(m2.s.h, [1, 15]), m2);
    await ev(() => os.wimp.menus.close());
  }

  // ---------------------------------------------------- keys
  {
    // the window has the input focus after a click
    await click(4, 6);
    const e0 = await sel();
    await press('ArrowRight');
    const e1 = await sel();
    await press('ArrowLeft');
    const e2 = await sel();
    ok('Right and Left step over an emoji as one', same(e0.h, [4, 6]) && same(e1.h, [4, 8]) && same(e2.h, [4, 6]), [e0, e1, e2]);
    const ci = await ev(() => window.__doc().view.layout.items[4].block.text.indexOf('é'));
    await ev((o) => window.__set(4, o), ci);
    await press('ArrowRight');
    const e3 = await sel();
    ok('... and over a letter with a combining accent', same(e3.h, [4, ci + 2]), [ci, e3]);
    await press('Shift+ArrowLeft');
    const e4 = await sel();
    ok('Shift-Left selects the whole cluster', e4.text === 'é', e4);

    // Up/Down keep the goal column across a short line
    await ev(() => window.__set(1, 50));
    const gx = await ev(() => window.__doc().view.caretRect().x);
    await press('ArrowDown');
    const g1 = await ev(() => ({ s: window.__sel(), x: window.__doc().view.caretRect().x }));
    await press('ArrowDown');
    const g2 = await ev(() => ({ s: window.__sel(), x: window.__doc().view.caretRect().x }));
    await press('ArrowUp'); await press('ArrowUp');
    const g3 = await sel();
    ok('Down to a short line goes to its end', same(g1.s.h, [2, 5]), g1);
    ok('... and the next Down returns to the goal column', g2.s.h[0] === 3 && Math.abs(g2.x - gx) < 8, { gx, g2 });
    ok('... Up twice comes back to the start place', same(g3.h, [1, 50]), g3);

    // Home and End on a wrapped line
    const lines = await ev(() => window.__doc().view.layout.items[7].lines.map((l) => [l.from, l.to]));
    await ev((o) => window.__set(7, o), lines[1][0] + 5);
    await press('Home');
    const h1 = await sel();
    await press('End');
    const h2 = await ev(() => ({ s: window.__sel(), y: window.__doc().view.caretRect().y }));
    const ly = await ev(() => { const L = window.__doc().view.layout, it = L.items[7]; return it.y + it.lines[1].y; });
    ok('Home goes to the start of the line', same(h1.h, [7, lines[1][0]]), [lines, h1]);
    ok('End goes to its end (on the same line)', h2.s.h[0] === 7 && h2.s.h[1] > lines[1][0] && h2.s.h[1] <= lines[2][0] && Math.abs(h2.y - ly) < 2, [lines, h2, ly]);

    // Ctrl-arrows by words; Ctrl-Home / Ctrl-End
    await ev(() => window.__set(1, 4));
    await press('Control+ArrowRight');
    const k1 = await sel();
    await press('Control+ArrowRight');
    const k2 = await sel();
    await press('Control+ArrowLeft');
    const k3 = await sel();
    ok('Ctrl-Right / Ctrl-Left move by words', same(k1.h, [1, 10]) && same(k2.h, [1, 16]) && same(k3.h, [1, 10]), [k1, k2, k3]);
    await press('Control+End');
    const k4 = await ev(() => ({ s: window.__sel(), end: window.__doc().view.layout.docEnd(), n: window.__doc().view.layout.items.length, y: window.__doc().win.scrollY }));
    await press('Control+Home');
    const k5 = await ev(() => ({ s: window.__sel(), y: window.__doc().win.scrollY }));
    ok('Ctrl-End: the end of the document, scrolled to', same(k4.s.h, [k4.n - 1, k4.end.off]) && k4.y > 200, k4);
    ok('Ctrl-Home: the start, scrolled back', same(k5.s.h, [0, 0]) && k5.y === 0, k5);

    // Page Down moves the caret and the view together
    await ev(() => window.__set(1, 4));
    const p0 = await ev(() => ({ y: window.__doc().win.scrollY, c: window.__doc().view.caretRect(), h: window.__doc().win.h }));
    await press('PageDown');
    const p1 = await ev(() => ({ y: window.__doc().win.scrollY, c: window.__doc().view.caretRect(), s: window.__sel() }));
    const dy = p1.y - p0.y, dc = p1.c.y - p0.c.y;
    ok('Page Down scrolls by about a window', dy > p0.h / 2 && dy <= p0.h, [p0, p1]);
    ok('... and the caret moves with it', Math.abs(dc - dy) < 30 && p1.s.h[0] > 1, [p0, p1]);
    await press('PageUp');
    const p2 = await ev(() => ({ y: window.__doc().win.scrollY, s: window.__sel() }));
    ok('Page Up comes back', p2.y === p0.y && p2.s.h[0] === 1, p2);

    // Shift-arrows extend and shrink
    await ev(() => window.__set(1, 4));
    await press('Shift+ArrowRight', 5);
    const x1 = await sel();
    await press('Shift+ArrowLeft', 2);
    const x2 = await sel();
    await press('Shift+ArrowDown');
    const x3 = await sel();
    ok('Shift-Right extends', same(x1.a, [1, 4]) && x1.text === 'quick', x1);
    ok('Shift-Left shrinks', same(x2.a, [1, 4]) && x2.text === 'qui', x2);
    ok('Shift-Down extends a line (not a page)', same(x3.a, [1, 4]) && x3.h[0] === 2, x3);
    await press('Escape');
    const x4 = await sel();
    ok('Escape collapses to the head', same(x4.a, x3.h) && same(x4.h, x3.h), x4);
    await press('ArrowRight');
    await press('Shift+ArrowLeft');
    await press('ArrowLeft');
    const x5 = await sel();
    ok('Left on a selection goes to its left edge', same(x5.a, x5.h) && same(x5.h, x4.h), [x4, x5]);

    // the table box: arrows step over it
    const tlen = await ev(() => window.__doc().view.layout.items[5].block.text.length);
    await ev((n) => window.__set(5, n), tlen);
    const b = [];
    for (let i = 0; i < 3; i++) { await press('ArrowRight'); b.push((await sel()).h); }
    ok('Right steps: before the table, after it, the next paragraph', same(b, [[6, 0], [6, 1], [7, 0]]), b);
    await ev((n) => window.__set(5, n), tlen);
    await press('Shift+ArrowRight', 2);
    const b2 = await sel();
    ok('Shift-Right over the box selects it', same(b2.h, [6, 1]) && b2.text === '\n', b2);

    // Ctrl-A
    await press('Control+a');
    const all = await ev(() => {
      const d = window.__doc(), L = d.view.layout, s = window.__sel();
      return { s, end: L.docEnd(), n: L.items.length, start: L.docStart().off, lines: s.text.split('\n').length };
    });
    ok('Ctrl-A selects the whole document', same(all.s.a, [0, 0]) && same(all.s.h, [all.n - 1, all.end.off]) && all.lines === all.n
      && all.s.text.startsWith('Selecting text\nThe quick') && all.s.text.includes('Tab\tstop, a link text and the end.') && all.s.text.endsWith('Filler paragraph 29 with some words in it.'), all);

    // keys the view does not use reach the desktop
    const pass = await ev(async () => {
      const d = window.__doc(), w = d.win;
      const k = (code, key, extra = {}) => { const e = w.emit('key', { code, key, shift: false, ctrl: false, ...extra }); return !!(e.handled || e.defaultPrevented); };
      // (letters and Enter are typed now: tests/moreapps/word-typing.mjs)
      const res = { F5: k(0x185, 'F5'), ctrlB: k(2, 'b', { ctrl: true }), altA: k(97, 'a', { alt: true }), left: k(0x18C, 'ArrowLeft') };
      const seen = [];
      const off = os.wimp.on('key', (e) => { seen.push(e.code); });
      window.__seen = seen; window.__off = off;
      return res;
    });
    await press('F5'); await press('Control+F12');
    await page.waitForTimeout(100);
    const seen = await ev(() => { window.__off(); return [...window.__seen]; });
    ok('keys it does not use are passed on (F5, Ctrl-B, Alt-A)', !pass.F5 && !pass.altA && !pass.ctrlB && pass.left, pass);
    ok('... and real F5 reaches the desktop', seen.includes(0x185), seen);
    await ev(() => { for (const w of [...os.wimp.windows]) if (w.isOpen && /Task window|Command/.test(w.title ?? '')) w.close(); if (os.cli?.active) os.cli.close?.(); });
  }

  // ---------------------------------------------------- relayout keeps the selection
  {
    const r = await ev(async () => {
      const d = window.__doc(), w = d.win;
      window.__set(1, 4, 1, 15);
      w.open({ w: 500 });
      await window.__frames(3);
      const a = { s: window.__sel(), c: d.view.caretRect(), L: d.view.layout.left };
      w.open({ w: 860 });
      await window.__frames(3);
      return { a, b: { s: window.__sel(), c: d.view.caretRect(), L: d.view.layout.left } };
    });
    const f = await ev(async () => {
      const d = window.__doc(), dw = await window.__word().word.open('RAM::RamDisc0.$.Edit');
      window.__set(4, 6, 7, 30);
      const L0 = d.view.layout, a = window.__sel();
      dw.relayout();                 // (as when the fonts arrive)
      await window.__frames(2);
      return { a, b: window.__sel(), fresh: d.view.layout !== L0, focus: os.wimp.caret?.window === d.win };
    });
    ok('a new layout (fonts arrived) keeps the selection', f.fresh && same(f.a, f.b) && f.a.text.length > 20 && f.focus, f);
    ok('a new window width keeps the selection (the column moves)', same(r.a.s, r.b.s) && r.a.s.text === 'quick brown' && Math.abs((r.b.c.x - r.a.c.x) - (r.b.L - r.a.L)) < 1e-6 && r.b.L !== r.a.L, r);
  }

  // ---------------------------------------------------- leaks: 30 documents opened and closed
  {
    const lk = await ev(async () => {
      const t = window.__word();
      const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length];
      const base = count();
      for (let i = 0; i < 30; i++) {
        os.vfs.writeFile('RAM::RamDisc0.$.Copy', await os.vfs.readFile('RAM::RamDisc0.$.Edit'), { filetype: 0xA7E });
        const dw = await t.word.open('RAM::RamDisc0.$.Copy');
        const d = window.__doc('Copy');
        const L = d.view.layout, c = L.caretRect({ id: L.items[1].id, off: 3 });
        d.win.emit('click', { button: 'select', x: c.x, y: c.y + 2, window: d.win, kind: 'click' });
        d.win.emit('key', { code: 1, key: 'a', ctrl: true });
        dw.close();
      }
      await window.__frames(2);
      return { base, after: count(), caretWin: os.wimp.caret?.window?.title ?? null };
    });
    ok('30 documents opened, used and closed leave no windows or elements', lk.after[0] === lk.base[0] && lk.after[1] === lk.base[1] && Math.abs(lk.after[2] - lk.base[2]) <= 5, lk);

    // a document closed in the middle of a drag (pointer held outside the
    // window, auto-scrolling): no timer, no page listener, no drawing left
    await ev(async () => {
      const live = new Map(), si = window.setInterval, ci = window.clearInterval;
      window.setInterval = (f, ...a) => { const id = si(f, ...a); live.set(id, String(f)); return id; };
      window.clearInterval = (id) => { live.delete(id); return ci(id); };
      const lis = new Set(), ae = window.addEventListener, re = window.removeEventListener;
      const key = (t, f, o) => ({ t, f, c: !!(o === true || o?.capture) });
      const find = (k) => [...lis].find((x) => x.t === k.t && x.f === k.f && x.c === k.c);
      window.addEventListener = function (t, f, o) { if (this === window || this == null) { const k = key(t, f, o); if (!find(k)) lis.add(k); } return ae.call(this ?? window, t, f, o); };
      window.removeEventListener = function (t, f, o) { if (this === window || this == null) { const k = find(key(t, f, o)); if (k) lis.delete(k); } return re.call(this ?? window, t, f, o); };
      window.__live = () => ({ timers: [...live.values()].filter((f) => /STEP_Y/.test(f)).length, pointer: [...lis].filter((k) => /^pointer/.test(k.t)).length });
      os.vfs.writeFile('RAM::RamDisc0.$.Copy', await os.vfs.readFile('RAM::RamDisc0.$.Edit'), { filetype: 0xA7E });
      const dw = await window.__word().word.open('RAM::RamDisc0.$.Copy');
      dw.win.open({ x: 100, y: 60, w: 600, h: 300, behind: 'top', scrollX: 0, scrollY: 0 });
      window.__paints = 0;
      const paint = dw.paint.bind(dw);
      dw.paint = (g, r) => { window.__paints++; paint(g, r); };
      window.__dw = dw;
      await window.__frames(2);
    });
    const a = await ev(() => { const d = window.__dw, L = d.view.L, c = L.caretRect({ id: L.items[1].id, off: 2 }); return window.__client(d, c.x, c.y + c.h / 2); });
    const out = await ev(() => { const w = window.__dw.win; return window.__client(window.__dw, 100, w.scrollY + w.h + 60); });
    const base = await ev(() => window.__live());
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(a.x + 10, a.y + 10, { steps: 2 });
    await page.mouse.move(out.x, out.y, { steps: 3 });
    await page.waitForTimeout(300);
    const held = await ev(() => ({ ...window.__live(), y: window.__dw.win.scrollY }));
    await ev(() => window.__dw.close());
    await page.waitForTimeout(300);
    const closed = await ev(() => ({ ...window.__live(), paints: window.__paints }));
    await page.mouse.move(out.x, out.y + 20, { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const after = await ev(() => ({ ...window.__live(), paints: window.__paints, docs: window.__word().word.docs.length }));
    ok('a drag in progress has its timer and pointer listeners', held.timers === 1 && held.pointer > base.pointer && held.y > 0, { base, held });
    ok('closing the document mid-drag stops the timer at once', closed.timers === 0, closed);
    ok('... and after the release no listeners are left, nothing more is drawn', after.timers === 0 && after.pointer === base.pointer && after.paints === closed.paints, { base, closed, after });
  }

  // ---------------------------------------------------- 5000 paragraphs
  {
    const big = await ev(async () => {
      const t = window.__word();
      const t0 = performance.now();
      await t.word.open('RAM::RamDisc0.$.Big');
      await window.__frames(1);
      const ms = Math.round(performance.now() - t0);
      const d = window.__doc('Big'), w = d.win;
      w.open({ x: 100, y: 60, w: 860, h: 500, behind: 'top' });
      os.wimp.setCaret(w);
      const s0 = performance.now();
      w.emit('key', { code: 1, key: 'a', ctrl: true });
      await window.__frames(1);
      const selMs = Math.round(performance.now() - s0);
      const ext = w.extent.y1, steps = [];
      for (const y of [ext / 4, ext / 2, ext * 3 / 4, ext - w.h, 0]) {
        const s = performance.now();
        w.scrollTo(0, Math.round(y));
        await window.__frames(1);
        steps.push(Math.round(performance.now() - s));
      }
      const tx = performance.now();
      const len = d.view.text().length;
      const textMs = Math.round(performance.now() - tx);
      return { ms, selMs, steps, n: d.view.layout.items.length, len, textMs };
    });
    ok('a 5000-paragraph document opens in under 1.5 s', big.n === 5000 && big.ms < 1500, big);
    ok('Ctrl-A and scrolling stay quick (< 100 ms a step)', big.selMs < 100 && big.steps.every((x) => x < 100), big);
    console.log(`timings: open ${big.ms} ms, Ctrl-A ${big.selMs} ms, scrolls ${big.steps.join('/')} ms, text ${big.textMs} ms`);
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ---------------------------------------------------- hiDPI
{
  const { browser: b2, page: p2, logs: l2 } = await launch({ zoom: 2 });
  try {
    await start(p2, { h: 400 });
    const hd = await p2.evaluate(async () => {
      const d = window.__doc(), w = d.win, cv = w._canvas;
      await window.__frames(3);
      const g = cv.getContext('2d'), img = g.getImageData(0, 0, cv.width, cv.height).data;
      // dark (ink) pixels in the backing store: the text is drawn into it
      let ink = 0;
      for (let k = 0; k < img.length; k += 4) if (img[k] < 100) ink++;
      return { dpr: window.devicePixelRatio, cw: cv.width, ch: cv.height, w: w.w, h: w.h, css: cv.style.width, ink };
    });
    ok('hiDPI: the canvas backing store is twice the window size', hd.dpr === 2 && hd.cw === hd.w * 2 && hd.ch === hd.h * 2 && hd.css === hd.w + 'px', hd);
    ok('hiDPI: text is drawn', hd.ink > 2000, hd);
    // a click at a computed place gives that place, and the caret is drawn on it
    const q = await p2.evaluate(() => window.__point(1, 4));
    await p2.mouse.click(q.x, q.y);
    const hc = await p2.evaluate(() => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[1].id, off: 4 });
      const el = document.querySelector('.caret'), r = el?.getBoundingClientRect(), want = window.__client(d, c.x, c.y);
      return { sel: window.__sel(), r: r && [r.left, r.top, r.height], want: [want.x, want.y, c.h] };
    });
    ok('hiDPI: a click gives the place clicked', same(hc.sel.a, [1, 4]) && same(hc.sel.h, [1, 4]), hc);
    ok('hiDPI: the caret sits on the caret rectangle', hc.r && Math.abs(hc.r[0] - hc.want[0]) <= 1.5 && Math.abs(hc.r[1] - hc.want[1]) <= 1.5
      && Math.abs(hc.r[2] - hc.want[2]) <= 1.5, hc);
  } catch (e) {
    out.push('FAIL exception (hiDPI) ' + (e.stack ?? e));
  }
  logs.push(...l2);
  await b2.close();
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
