// !Letters' views in the real desktop (Batch D P3.5, D33, D34), part 2:
// the caret, clicks and selections across Print layout's pages. Real
// clicks: in page 2's top margin -> its first line; in the desk just
// below page 1 -> page 1's last line, just above page 2 -> page 2's
// first line; in page 2's header area -> nothing; on a line -> that
// line. A real drag from page 1 to page 3 auto-scrolls and lights
// all three pages (by pixel) and never the desk between them. Real
// keys: Down from page 1's last line -> page 2's first line at the
// same x; Ctrl+PageDown twice -> page 3's first line, Ctrl+PageUp ->
// page 2's; Edit > Next page / Previous page the same (the route when
// a browser keeps the keys; in Draft a window down, as Page Down);
// Ctrl+PageDown through a table continued over page tops moves on
// with every press to the last page (P3 fix wave). A landscape
// section: the caret on its page puts the ruler at that page's width.
// Zoom 50 and 200 (Review Focus 4): the same clicks land on the same
// places; at 50, 100 and 200 the extent is the pages' scaled
// (word-zoom.mjs's rule in Print layout). D34: typing far down a long
// document keeps the caret on the screen while the pages are worked
// out again. Needs the disc built by tools/disc-wimplib.mjs and
// disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const MAR = 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"';
const SECT = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${MAR}/></w:sectPr>`;
const LAND = `<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar ${MAR}/></w:sectPr>`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const para = (i, n = 30) => p(r(Array.from({ length: n }, (_, j) => WORDS[(i + j) % 10]).join(' ')));
const MANY = Array.from({ length: 120 }, (_, i) => para(i)).join('') + SECT;
const LONG = Array.from({ length: 900 }, (_, i) => para(i)).join('') + SECT;
const MIXED = para(1) + p(r('End of the portrait section.'), `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${MAR}/></w:sectPr>`)
  + para(2) + para(3) + LAND;
// (Consumer Confidence Report's shape: text, a table over several page tops, text)
const ROWS = Array.from({ length: 200 }, (_, i) => `<w:tr><w:tc>${p(r('row ' + i))}</w:tc></w:tr>`).join('');
const TALL = Array.from({ length: 40 }, (_, i) => para(i)).join('') + '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/>'
  + '</w:tblGrid>' + ROWS + '</w:tbl>' + Array.from({ length: 120 }, (_, i) => para(i + 5)).join('') + SECT;
const files = {
  Tall: await buildDocx({ 'word/document.xml': documentXml(TALL) }),
  Many: await buildDocx({ 'word/document.xml': documentXml(MANY) }),
  Long: await buildDocx({ 'word/document.xml': documentXml(LONG) }),
  Mixed: await buildDocx({ 'word/document.xml': documentXml(MIXED) }),
};
for (const k of Object.keys(files)) files[k] = Array.from(files[k]);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DESK = [136, 136, 136];

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
/** A real click at layout point (x, y) of leaf's window (scrolled to show it first). */
const clickAt = async (leaf, x, y, opts) => {
  const q = await ev(async ([leaf, x, y]) => window.__show(leaf, x, y), [leaf, x, y]);
  await page.mouse.click(q.x, q.y, opts);
  await ev(() => window.__frames(2));
};
const here = (leaf) => ev((leaf) => window.__here(leaf), leaf);
const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(2)); };
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
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__open = async (leaf) => {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      await window.__frames(3);
      const d = window.__doc(leaf);
      d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(3);
      return d;
    };
    /** Layout point -> the window's work area (at its zoom). */
    window.__work = (d, x, y) => { const z = d.view.zoom, t = d.view.layout.top; return { x: x * z, y: t + (y - t) * z }; };
    /** Work-area point -> client (page) coordinates. */
    window.__client = (d, x, y) => {
      const s = d.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Scroll so that layout point (x, y) shows, then its client point. */
    window.__show = async (leaf, x, y) => {
      const d = window.__doc(leaf), w = d.win, q = window.__work(d, x, y);
      w.scrollTo(Math.max(0, Math.round(q.x - w.w / 2)), Math.max(0, Math.round(q.y - w.h / 2)));
      await window.__frames(2);
      return window.__client(d, q.x, q.y);
    };
    /** Page i's rectangle (layout px). */
    window.__rect = (leaf, i) => { const Pl = window.__doc(leaf).view.layout.place; return Pl.sheet.rect(Pl.pages.at(i)); };
    /** Page i's first and last line: {first: {id, off, k}, last: {id, k}}. */
    window.__ends = (leaf, i) => {
      const fs = window.__doc(leaf).view.layout.place.pageFrags(i), a = fs[0], b = fs[fs.length - 1];
      return { first: { id: a.it.id, off: a.it.lines[a.l0].from, k: a.l0 }, last: { id: b.it.id, k: b.l1 - 1 } };
    };
    /** Where the head is: {id, off, k (its line), page, x (layout)}. */
    window.__here = (leaf) => {
      const d = window.__doc(leaf), L = d.view.layout, s = d.view.selection, h = s.head, it = L.byId.get(h.id);
      let k = 0;
      if (it.kind === 'p') {
        const c = L.caretRect(h, s.affinity);
        k = it.lines.findIndex((ln, j) => Math.abs(L.place.lineAt(it, j).y - c.y) < 0.5);
      }
      return { id: h.id, off: h.off, k, page: L.place.pageOf(it, k), x: Math.round(L.caretRect(h, s.affinity).x),
        collapsed: s.anchor.id === h.id && s.anchor.off === h.off };
    };
    /** The canvas colour at layout point (x, y) (scrolled into view first). */
    window.__px = async (leaf, x, y) => {
      const d = window.__doc(leaf), w = d.win, q = window.__work(d, x, y);
      if (q.y < w.scrollY + 40 || q.y > w.scrollY + w.h - 10) {
        w.scrollTo(w.scrollX, Math.max(0, Math.round(q.y - w.h / 2)));
        await window.__frames(2);
      }
      const cv = w._canvas, k = cv.width / w.w;
      const a = cv.getContext('2d').getImageData(Math.round((q.x - w.scrollX) * k), Math.round((q.y - w.scrollY) * k), 1, 1).data;
      return [a[0], a[1], a[2]];
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__open('Many');
  }, files);

  // ------------------------------------------------ clicks: margins, the desk, the header area, a line
  const clicks = async (leaf) => {
    const g = await ev((leaf) => ({ r0: window.__rect(leaf, 0), r1: window.__rect(leaf, 1), e0: window.__ends(leaf, 0),
      e1: window.__ends(leaf, 1), view: window.__doc(leaf).viewName }), leaf);
    const x = g.r1.x + 300, res = { view: g.view };
    await clickAt(leaf, x, g.r1.y + 20);
    res.margin = await here(leaf);
    await page.waitForTimeout(450);
    await clickAt(leaf, x, g.r0.y + g.r0.h + 3);
    res.below = await here(leaf);
    await page.waitForTimeout(450);
    await clickAt(leaf, x, g.r1.y - 3);
    res.above = await here(leaf);
    await page.waitForTimeout(450);
    await clickAt(leaf, g.r0.x + 3, g.r0.y + g.r0.h - 30);
    res.bottom = await here(leaf);
    await page.waitForTimeout(450);
    const mid = await ev((leaf) => {
      const L = window.__doc(leaf).view.layout, all = [];
      for (const f of L.place.pageFrags(1)) for (let k = f.l0; k < f.l1; k++) all.push([f.it, k]);
      const [it, k] = all[5], a = L.place.lineAt(it, k);
      return { y: a.y + it.lines[k].h / 2, k, id: it.id };
    }, leaf);
    await clickAt(leaf, x, mid.y);
    res.line = await here(leaf);
    await page.waitForTimeout(450);
    await clickAt(leaf, x, g.r1.y + 70);
    res.header = await here(leaf);
    return { g, mid, res };
  };
  const want = (c) => ({
    margin: c.res.margin.id === c.g.e1.first.id && c.res.margin.k === c.g.e1.first.k && c.res.margin.page === 1,
    below: c.res.below.id === c.g.e0.last.id && c.res.below.k === c.g.e0.last.k && c.res.below.page === 0,
    above: c.res.above.id === c.g.e1.first.id && c.res.above.k === c.g.e1.first.k && c.res.above.page === 1,
    bottom: c.res.bottom.id === c.g.e0.last.id && c.res.bottom.k === c.g.e0.last.k && c.res.bottom.page === 0,
    line: c.res.line.id === c.mid.id && c.res.line.k === c.mid.k && c.res.line.page === 1,
    header: same(c.res.header, c.res.line),
  });
  // (the places hit: the page's centring at another zoom moves its x)
  const key = (res) => Object.values(res).filter((v) => typeof v === 'object').map((v) => [v.id, v.off, v.k, v.page]);
  const c100 = await clicks('Many');
  const w100 = want(c100);
  ok('Print layout: a click in page 2\'s top margin puts the caret at its first line', c100.res.view === 'print' && w100.margin, c100);
  ok('a click in the desk just below page 1: page 1\'s last line; just above page 2: page 2\'s first line',
    w100.below && w100.above, c100);
  ok('a click left of the text low in page 1\'s bottom margin: page 1\'s last line', w100.bottom, c100);
  ok('a click on a line of page 2 puts the caret on that line', w100.line, c100);
  ok('a click in page 2\'s header area does nothing', w100.header, c100);

  // ------------------------------------------------ zoom 50 and 200: the same clicks, the same places
  for (const z of [50, 200]) {
    await ev((z) => window.__doc('Many').setZoom(z), z);
    await ev(() => window.__frames(3));
    await page.waitForTimeout(450);
    const c = await clicks('Many');
    const w = want(c);
    ok(`zoom ${z}%: the same clicks land on the same places (margin, desk both sides, bottom margin, a line, header area)`,
      Object.values(w).every(Boolean) && same(key(c.res), key(c100.res)), { w, res: c.res });
  }
  // (word-zoom.mjs's extent rule, in Print layout: the pages' extent, scaled below the bars, every page in it)
  for (const z of [50, 100, 200]) {
    const e = await ev(async (z) => {
      const d = window.__doc('Many'), w = d.win;
      d.setZoom(z);
      await window.__frames(3);
      for (let i = 0; i < 300 && !d.view.pages().done; i++) await window.__frames(1);
      await window.__frames(2);
      const L = d.view.layout, Pl = L.place, P = Pl.pages, last = Pl.sheet.rect(P.at(P.count - 1));
      return { z: d.view.zoom, top: L.top, eh: w.extent.y1 - w.extent.y0, ew: w.extent.x1 - w.extent.x0, ph: Pl.extent().h,
        pw: Pl.extent().w, bottom: last.y + last.h, width: L.width, ww: w.w };
    }, z);
    const k = z / 100;
    ok(`zoom ${z}%: the extent is the pages' scaled below the bars (every page in it); laid out for the width / z`,
      e.z === k && e.ph >= e.bottom && e.eh === Math.max(64, Math.ceil(e.top + (e.ph - e.top) * k))
      && e.top + (e.bottom - e.top) * k <= e.eh && e.ew >= Math.ceil(e.pw * k) && Math.abs(e.width - e.ww / k) < 1e-9, e);
  }
  await ev(() => window.__doc('Many').setZoom(100));
  await ev(() => window.__frames(3));

  // ------------------------------------------------ Down across a page; Ctrl+PageDown / Ctrl+PageUp
  const k0 = await ev(() => {
    const d = window.__doc('Many'), L = d.view.layout, e = window.__ends('Many', 0), it = L.byId.get(e.last.id);
    d.view.setSelection({ id: it.id, off: it.lines[e.last.k].from + 9 });
    return window.__here('Many');
  });
  await press('ArrowDown');
  const k1 = await here('Many');
  const e1 = await ev(() => window.__ends('Many', 1));
  ok('Down from page 1\'s last line: page 2\'s first line at the same x', k0.page === 0 && k1.page === 1
    && k1.id === e1.first.id && k1.k === e1.first.k && Math.abs(k1.x - k0.x) < 10, { k0, k1, e1 });
  await press('ArrowUp');
  const k2 = await here('Many');
  ok('Up comes back to the same place', k2.id === k0.id && k2.off === k0.off, { k0, k2 });
  await ev(() => { const d = window.__doc('Many'); d.view.setSelection({ id: d.view.layout.items[2].id, off: 4 }); });
  await press('Control+PageDown');
  const n1 = await here('Many');
  await press('Control+PageDown');
  const n2 = await here('Many');
  await press('Control+PageUp');
  const n3 = await here('Many');
  const pe = await ev(() => [1, 2].map((i) => window.__ends('Many', i).first));
  const vis = await ev(() => { const d = window.__doc('Many'), c = d.view.caretRect(), w = d.win; return c.y >= w.scrollY && c.y + c.h <= w.scrollY + w.h; });
  ok('Ctrl+PageDown: page 2\'s first line; again: page 3\'s first line, shown', n1.page === 1 && n1.id === pe[0].id
    && n1.off === pe[0].off && n2.page === 2 && n2.id === pe[1].id && n2.off === pe[1].off, { n1, n2, pe });
  ok('Ctrl+PageUp: back to page 2\'s first line, the caret on the screen', n3.page === 1 && n3.id === pe[0].id
    && n3.off === pe[0].off && vis, { n3, vis });

  // ------------------------------------------------ Edit > Next page / Previous page: the route when a browser keeps the keys
  const editRow = (text) => ev((text) => {
    const m = window.__doc('Many').win.menu({}).items.find((i) => i.text === 'Edit').submenu();
    const i = m.items.find((x) => x.text === text);
    return i && { key: i.key, shaded: !!(typeof i.shaded === 'function' ? i.shaded(i) : i.shaded), at: m.items.indexOf(i),
      replace: m.items.findIndex((x) => x.text === 'Replace...') };
  }, text);
  const editPick = async (text) => {
    await ev((text) => {
      const m = window.__doc('Many').win.menu({}).items.find((i) => i.text === 'Edit').submenu();
      const i = m.items.find((x) => x.text === text);
      i.action(i);
    }, text);
    await ev(() => window.__frames(2));
  };
  const rn = await editRow('Next page'), rp = await editRow('Previous page');
  ok('Edit has Next page (Ctrl+PgDn) and Previous page (Ctrl+PgUp) after Replace..., not shaded', rn && rp
    && rn.key === 'Ctrl+PgDn' && rp.key === 'Ctrl+PgUp' && !rn.shaded && !rp.shaded && rn.at === rn.replace + 1
    && rp.at === rn.at + 1, { rn, rp });
  await ev(() => { const d = window.__doc('Many'); d.view.setSelection({ id: d.view.layout.items[2].id, off: 4 }); });
  await editPick('Next page');
  const m1 = await here('Many');
  await editPick('Next page');
  const m2 = await here('Many');
  await editPick('Previous page');
  const m3 = await here('Many');
  ok('Edit > Next page twice: page 3\'s first line; Previous page: page 2\'s (as the keys)', m1.page === 1
    && m1.id === pe[0].id && m1.off === pe[0].off && m2.page === 2 && m2.id === pe[1].id && m2.off === pe[1].off
    && m3.page === 1 && m3.id === pe[0].id && m3.off === pe[0].off, { m1, m2, m3, pe });
  const dr = await ev(async () => {
    const d = window.__doc('Many'), L = () => d.view.layout;
    const pick = (t) => { const i = d.win.menu({}).items.find((x) => x.text === 'View').submenu().items.find((x) => x.text === t); i.action(i); };
    pick('Draft');
    await window.__frames(3);
    d.view.setSelection({ id: L().items[2].id, off: 4 });
    await window.__frames(2);
    const y0 = d.view.caretRect().y;
    const m = d.win.menu({}).items.find((i) => i.text === 'Edit').submenu(), i = m.items.find((x) => x.text === 'Next page');
    const shaded = !!(typeof i.shaded === 'function' ? i.shaded(i) : i.shaded);
    i.action(i);
    await window.__frames(2);
    const y1 = d.view.caretRect().y;
    pick('Print layout');
    await window.__frames(3);
    return { y0, y1, shaded, h: d.win.h, view: d.viewName };
  });
  ok('Draft: Next page is not shaded and moves the caret a window down, as Page Down', !dr.shaded
    && dr.y1 - dr.y0 > dr.h / 2 && dr.view === 'print', dr);

  // ------------------------------------------------ Ctrl+PageDown through a table continued over page tops
  const tl = await ev(async () => {
    const d = await window.__open('Tall');
    for (let i = 0; i < 300 && !d.view.pages().done; i++) await window.__frames(1);
    d.view.setSelection({ id: d.view.layout.items[0].id, off: 0 });
    await window.__frames(2);
    return { count: d.view.pages().count };
  });
  const seen = [];
  for (let i = 0; i < tl.count + 1; i++) {
    await press('Control+PageDown');
    seen.push((await here('Tall')).page);
  }
  ok('Ctrl+PageDown through a long table over page tops: every press moves on until the last page (never stuck)',
    tl.count >= 9 && seen.at(-1) === tl.count - 1 && seen.every((x, i) => i === 0 || x > seen[i - 1]
      || (x === tl.count - 1 && seen[i - 1] === x)), { tl, seen });
  await ev(() => { window.__doc('Tall').dw.close(); });

  // ------------------------------------------------ a drag from page 1 to page 3: auto-scroll, lit pages, no lit desk
  const d0 = await ev(async () => {
    const d = window.__doc('Many'), L = d.view.layout, e = window.__ends('Many', 0), it = L.byId.get(e.first.id);
    d.win.scrollTo(0, 0);
    await window.__frames(2);
    const a = L.place.lineAt(it, 1), w = d.win;
    return { at: window.__client(d, a.x + 40, a.y + it.lines[1].h / 2),
      below: window.__client(d, a.x + 200, w.scrollY + w.h + 30) };
  });
  await page.waitForTimeout(450);
  await page.mouse.move(d0.at.x, d0.at.y);
  await page.mouse.down();
  await page.mouse.move(d0.at.x + 30, d0.at.y + 30, { steps: 3 });
  await page.mouse.move(d0.below.x, d0.below.y, { steps: 4 });
  // (until the head is a few lines down page 3; the window scrolls on until the button is up)
  await page.waitForFunction(() => {
    const h = window.__here('Many'), c = window.__doc('Many').view.layout.caretRect(window.__doc('Many').view.selection.head);
    return h.page === 2 && c.y > window.__rect('Many', 2).y + 160;
  }, null, { timeout: 30000 });
  await page.mouse.up();
  await ev(() => window.__frames(3));
  const d1 = await here('Many');
  const lit = await ev(async () => {
    const d = window.__doc('Many'), L = d.view.layout, res = { pages: [], gaps: [] };
    const sel = d.view.selection, rs = L.selectionRects(sel);
    for (let i = 0; i < 3; i++) {
      const rc = window.__rect('Many', i), q = rs.find((x) => x.y > rc.y && x.y + x.h < rc.y + rc.h && x.w > 40);
      res.pages.push(q ? await window.__px('Many', q.x + 10, q.y + q.h / 2) : null);
      if (i < 2) {
        const n = window.__rect('Many', i + 1);
        res.gaps.push(await window.__px('Many', rc.x + 300, (rc.y + rc.h + n.y) / 2));
      }
    }
    res.inGap = rs.filter((x) => [0, 1].some((i) => {
      const a = window.__rect('Many', i), b = window.__rect('Many', i + 1);
      return x.y < b.y && x.y + x.h > a.y + a.h;
    })).length;
    return res;
  });
  const isLit = (c) => !!c && c[2] > c[0] + 10 && !same(c, [255, 255, 255]);
  ok('a drag from page 1 down past the window auto-scrolls to page 3; the head is there', d1.page >= 2 && !d1.collapsed, d1);
  ok('the selection is lit on all three pages (pixels) and never in the desk between them',
    lit.pages.every(isLit) && lit.gaps.every((c) => same(c, DESK)) && lit.inGap === 0, lit);

  // ------------------------------------------------ a landscape section: the ruler at its page's width
  const l1 = await ev(async () => {
    const d = await window.__open('Mixed'), L = d.view.layout, Pl = L.place;
    d.view.setSelection({ id: L.items[0].id, off: 3 });
    await window.__frames(3);
    const s0 = { ...d.ruler.scale, page: [...d.ruler.scale.page], text: [...d.ruler.scale.text] };
    d.view.setSelection({ id: L.items[3].id, off: 3 });
    await window.__frames(3);
    const s1 = { page: [...d.ruler.scale.page], text: [...d.ruler.scale.text] };
    const r0 = Pl.sheet.rect(Pl.pages.at(0)), r1 = Pl.sheet.rect(Pl.pages.at(1));
    return { s0: { page: s0.page, text: s0.text }, s1, r0, r1, info: d.pageInfo, page: d.view.pages().caretPage };
  });
  ok('a landscape section\'s page: the caret there puts the ruler at its width (11 in, 9 in of text)', l1.page === 1
    && l1.r1.w === 1056 && l1.s1.page[1] - l1.s1.page[0] === 1056 && Math.round(l1.s1.text[1] - l1.s1.text[0]) === 864, l1);
  ok('... and back on the portrait page, its width (8.5 in, 6.5 in of text)', l1.s0.page[1] - l1.s0.page[0] === 816
    && Math.round(l1.s0.text[1] - l1.s0.text[0]) === 624 && /Section 2/.test(l1.info), l1);

  // ------------------------------------------------ D34: typing far down while the pages are worked out again
  const t1 = await ev(async () => {
    const d = await window.__open('Long'), w = d.win;
    for (let i = 0; i < 900 && !d.view.pages().done; i++) await window.__frames(1);
    const L = d.view.layout, it = L.items[700];
    d.view.setSelection({ id: it.id, off: 5 });
    await window.__frames(3);
    const res = { page: d.view.pages().caretPage, ys: [], sy: [] };
    const onScreen = () => { const c = d.view.caretRect(); return c.y >= w.scrollY && c.y + c.h <= w.scrollY + w.h; };
    res.before = onScreen();
    for (let i = 0; i < 5; i++) {
      d.view.type('Q');
      await window.__frames(1);
      res.ys.push(onScreen());
      res.sy.push(w.scrollY);
    }
    for (let i = 0; i < 900 && !d.view.pages().done; i++) {
      await window.__frames(1);
      if (!onScreen()) res.ys.push(false);
    }
    res.after = onScreen();
    res.done = d.view.pages().done;
    res.ext = w.extent.y1 - w.extent.y0;
    const P = d.view.layout.place.pages, last = d.view.layout.place.sheet.rect(P.at(P.count - 1));
    res.bottom = last.y + last.h;
    return res;
  });
  ok('typing on page ~30 of a long document: the caret stays on the screen while the pages are worked out again (D34)',
    t1.page > 20 && t1.before && t1.ys.every(Boolean) && t1.after && t1.done && t1.ext >= t1.bottom
    && Math.max(...t1.sy) - Math.min(...t1.sy) < 40, t1);

  await ev(() => { window.__doc('Long').dw.close(); });
  await ev(() => window.__open('Long'));
  await press('Control+End');
  const t2 = await ev(async () => {
    const d = window.__doc('Long'), w = d.win, res = { done0: d.view.pages().done, off: [] };
    const onScreen = () => { const c = d.view.caretRect(); return c.y >= w.scrollY && c.y + c.h <= w.scrollY + w.h; };
    res.start = onScreen();
    for (let i = 0; i < 900 && !d.view.pages().done; i++) {
      await window.__frames(1);
      if (!onScreen()) res.off.push(i);
    }
    res.end = onScreen();
    res.page = d.view.pages();
    return res;
  });
  ok('Ctrl-End straight after opening (the caret\'s pages worked out for it): the caret on the last page, on the screen',
    t2.start && !t2.off.length && t2.end && t2.page.caretPage === t2.page.count - 1, t2);

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
