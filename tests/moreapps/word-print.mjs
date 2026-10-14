// !Letters' editing in Print layout, the view a document opens in (Batch
// D P3.5, D33): the older suites run in Draft (word-draft.mjs) and
// word-edit, word-tables-edit and word-pictures-edit run in Print
// layout too (index.mjs, WORD_VIEW=print); this suite covers what
// those leave to Draft, on page 2 of a document, by real keys, real
// clicks and pixels: typing at page 2's first line; Enter there and
// Backspace at the start of page 2's first paragraph (joined with page
// 1's last), each one undo step, the caret on its page and on the
// screen, the pages worked out again; a boxed paragraph's red edges
// and a shaded paragraph's yellow drawn where its page puts them; a
// numbered list's labels drawn in the hanging space on page 2, and a
// click on a label puts the caret at the start of its text; Ctrl+Enter
// and Insert > Section break > Next page on page 1 (P3 fix wave): the
// caret's paragraph moved to start page 2, the info line, one
// undo step and Ctrl-Z. Needs the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, numberingXml, p, r } from './build-docx.mjs';

const MAR = 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"';
const SECT = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${MAR}/></w:sectPr>`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const para = (i, n = 30) => p(r(Array.from({ length: n }, (_, j) => WORDS[(i + j) % 10]).join(' ')));
const BOX = '<w:pBdr>' + ['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="single" w:sz="16" w:space="4" w:color="FF0000"/>`)
  .join('') + '</w:pBdr>';
const NUM = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>'
  + '<w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'
  + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
// (page 1 full of text; on page 2: a boxed paragraph, a shaded one, a numbered list of three)
const BODY = Array.from({ length: 40 }, (_, i) => para(i)).join('')
  + p(r('A boxed paragraph with red edges.'), BOX)
  + p(r('A shaded paragraph on yellow.'), '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>')
  + ['First item', 'Second item', 'Third item'].map((t) => p(r(t), NUM)).join('')
  + Array.from({ length: 30 }, (_, i) => para(i + 3)).join('') + SECT;
const files = { Print: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY), 'word/numbering.xml': NUMBERING })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(2)); };
const st = () => ev(() => window.__st());
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
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Print');
    window.__client = (d, x, y) => {
      const s = d.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Scroll so that work-area y shows (in the middle), then the client point of (x, y). */
    window.__show = async (x, y) => {
      const d = window.__doc(), w = d.win;
      w.scrollTo(0, Math.max(0, Math.round(y - w.h / 2)));
      await window.__frames(2);
      return window.__client(d, x, y);
    };
    /** Canvas pixels [r, g, b] at work-area points (shown first). */
    window.__pxs = async (pts) => {
      const d = window.__doc(), w = d.win, res = [];
      for (const [x, y] of pts) {
        if (y < w.scrollY + 40 || y > w.scrollY + w.h - 10) { w.scrollTo(0, Math.max(0, Math.round(y - w.h / 2))); await window.__frames(2); }
        const cv = w._canvas, k = cv.width / w.w;
        const a = cv.getContext('2d').getImageData(Math.round((x - w.scrollX) * k), Math.round((y - w.scrollY) * k), 1, 1).data;
        res.push([a[0], a[1], a[2]]);
      }
      return res;
    };
    window.__item = (text) => window.__doc().view.layout.items.find((x) => x.kind === 'p' && x.block.text.startsWith(text));
    window.__st = () => {
      const d = window.__doc(), v = d.view, L = v.layout, s = v.selection, it = L.byId.get(s.head.id), w = d.win;
      const c = v.caretRect();
      return { idx: it.index, off: s.head.off, page: v.pages().caretPage, count: v.pages().count, depth: v.undoDepth,
        onScreen: c.y >= w.scrollY && c.y + c.h <= w.scrollY + w.h, text: it.block ? it.block.text.slice(0, 24) : null,
        n: L.items.length };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Print');
    await window.__frames(3);
    window.__doc().win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, files);

  // ------------------------------------------------ typing at page 2's first line (a real click there first)
  const a0 = await ev(async () => {
    const d = window.__doc(), L = d.view.layout, f = L.place.pageFrags(1)[0], it = f.it;
    const c = L.caretRect({ id: it.id, off: it.lines[f.l0].from });
    const q = await window.__show(c.x + 1, c.y + c.h / 2);
    return { q, view: d.viewName, id: it.id, off: it.lines[f.l0].from, idx: it.index };
  });
  await page.mouse.click(a0.q.x, a0.q.y);
  await ev(() => window.__frames(2));
  const a1 = await st();
  await page.keyboard.type('XYZ ');
  await ev(() => window.__frames(2));
  const a2 = await ev(() => ({ ...window.__st(), line: window.__doc().view.lines()[window.__st().idx].slice(0, 30) }));
  ok('Print layout: a real click at page 2\'s first line puts the caret there (page 2)', a0.view === 'print'
    && a1.idx === a0.idx && a1.off === a0.off && a1.page === 1, { a0, a1 });
  ok('typing there: the text goes in at that place, the caret stays on page 2 and on the screen',
    a2.page === 1 && a2.onScreen && a2.off === a0.off + 4 && a2.idx === a0.idx, a2);
  await press('Control+z');

  // ------------------------------------------------ Enter and Backspace across the page boundary
  const b0 = await ev(() => {
    const d = window.__doc(), L = d.view.layout, f = L.place.pageFrags(1)[0];
    // (the first paragraph that STARTS on page 2)
    const fr = L.place.pageFrags(1).find((x) => x.l0 === 0 && x.it.kind === 'p');
    d.view.setSelection({ id: fr.it.id, off: 0 });
    return { idx: fr.it.index, text: fr.it.block.text.slice(0, 24), prev: L.items[fr.it.index - 1].block.text.length, split: f !== fr };
  });
  const b1 = await st();
  await press('Enter');
  const b2 = await st();
  ok('Enter at the start of page 2\'s first paragraph: an empty paragraph before it, one undo step; the caret '
    + 'in the paragraph, on its page and on the screen', b2.n === b1.n + 1 && b2.idx === b0.idx + 1 && b2.off === 0
    && b2.text === b0.text && b2.depth === b1.depth + 1 && b2.onScreen && b2.page >= 1, { b0, b1, b2 });
  await press('Control+z');
  const b3 = await st();
  ok('... Ctrl-Z: as it was', b3.n === b1.n && b3.idx === b1.idx && b3.off === 0 && b3.depth === b1.depth, b3);
  await press('Backspace');
  const b4 = await st();
  ok('Backspace there joins it to the paragraph before (on page 1): the caret at the join, on the screen, the pages '
    + 'worked out again', b4.n === b1.n - 1 && b4.idx === b0.idx - 1 && b4.off === b0.prev && b4.onScreen
    && b4.depth === b1.depth + 1 && (b4.page === 0 || b4.page === 1), { b0, b4 });
  await press('Control+z');
  const b5 = await st();
  ok('... Ctrl-Z: the two paragraphs again, the caret at the second\'s start', b5.n === b1.n && b5.idx === b0.idx
    && b5.off === 0 && b5.text === b0.text, b5);

  // ------------------------------------------------ borders and shading where page 2 puts them
  const c0 = await ev(async () => {
    const d = window.__doc(), L = d.view.layout, bx = window.__item('A boxed'), sh = window.__item('A shaded');
    const pb = L.place.pageOf(bx, 0), ps = L.place.pageOf(sh, 0);
    const rb = L.place.rects(bx, 0, 1)[0], rs = L.place.rects(sh, 0, 1)[0];
    const pg = L.place.sheet.rect(L.place.pages.at(pb));
    // a column of pixels above the text's top (the top edge), a row left of it (the left edge)
    const up = await window.__pxs(Array.from({ length: 14 }, (_, i) => [rb.x + 60, rb.y - 1 - i]));
    const left = await window.__pxs(Array.from({ length: 14 }, (_, i) => [rb.x - 1 - i, rb.y + rb.h / 2]));
    const fill = await window.__pxs([[rs.x + rs.w - 8, rs.y + rs.h / 2]]);
    // where Draft would have them (the galley): no red there
    const g = await window.__pxs([[bx.x + 60, bx.y + bx.lines[0].y - 6]]);
    return { pb, ps, up, left, fill, g, inPage: rb.y > pg.y && rb.y < pg.y + pg.h };
  });
  const red = (c) => c[0] > 200 && c[1] < 60 && c[2] < 60;
  ok('a boxed paragraph on page 2: its red top and left edges drawn just outside its text, on its page',
    c0.pb >= 1 && c0.inPage && c0.up.some(red) && c0.left.some(red), c0);
  ok('a shaded paragraph on page 2: yellow beside its text', c0.ps >= 1 && same(c0.fill[0], [255, 255, 0]), c0);

  // ------------------------------------------------ list labels on page 2; a click on one
  const d0 = await ev(async () => {
    const d = window.__doc(), L = d.view.layout, it = window.__item('Second item'), rc = L.place.rects(it, 0, 1)[0];
    const c = L.caretRect({ id: it.id, off: 0 });
    // the hanging space: from 0.25 in left of the text to the text
    const pts = [];
    for (let x = c.x - 24; x < c.x - 2; x += 1) for (let y = rc.y + 3; y < rc.y + rc.h - 3; y += 2) pts.push([x, y]);
    const px = await window.__pxs(pts);
    const ink = px.filter((q) => q[0] + q[1] + q[2] < 300).length;
    const q = await window.__show(c.x - 14, rc.y + rc.h / 2);
    return { page: L.place.pageOf(it, 0), labels: d.view.labels().filter(Boolean), ink, q, idx: it.index };
  });
  ok('a numbered list on page 2: 1. 2. 3. drawn in the hanging space (ink there)', d0.page >= 1
    && same(d0.labels, ['1.', '2.', '3.']) && d0.ink > 3, d0);
  const q1 = await ev(async () => {
    const d = window.__doc(), L = d.view.layout, it = window.__item('Second item');
    d.view.setSelection({ id: L.items[0].id, off: 0 });
    await window.__frames(2);
    const rc = L.place.rects(it, 0, 1)[0], c = L.caretRect({ id: it.id, off: 0 });
    return window.__show(c.x - 14, rc.y + rc.h / 2);
  });
  await page.waitForTimeout(450);
  await page.mouse.click(q1.x, q1.y);
  await ev(() => window.__frames(2));
  const d1 = await st();
  ok('a real click on the label "2." puts the caret at the start of its text', d1.idx === d0.idx && d1.off === 0, d1);

  // ------------------------------------------------ Ctrl+Enter and Insert > Section break > Next page (P3 fix wave)
  const brk = async (how) => {
    const e0 = await ev(async () => {
      const d = window.__doc(), L = d.view.layout, it = L.items[10];
      d.view.setSelection({ id: it.id, off: 0 });
      await window.__frames(3);
      for (let i = 0; i < 300 && !d.view.pages().done; i++) await window.__frames(1);
      return { ...window.__st(), info: d.pageInfo, id: it.id };
    });
    if (how === 'key') await press('Control+Enter');
    else {
      await ev(() => {
        const ins = window.__doc().win.menu({}).items.find((i) => i.text === 'Insert').submenu();
        const sb = ins.items.find((i) => i.text === 'Section break').submenu();
        const it = sb.items.find((i) => i.text === 'Next page');
        it.action(it);
      });
      await ev(() => window.__frames(2));
    }
    const e1 = await ev(async () => {
      const d = window.__doc();
      for (let i = 0; i < 300 && !d.view.pages().done; i++) await window.__frames(1);
      await window.__frames(2);
      const L = d.view.layout, f = L.place.pageFrags(1)[0];
      return { ...window.__st(), info: d.pageInfo, first: f.it.id, l0: f.l0, head: d.view.selection.head };
    });
    await press('Control+z');
    const e2 = await ev(async () => {
      const d = window.__doc();
      for (let i = 0; i < 300 && !d.view.pages().done; i++) await window.__frames(1);
      await window.__frames(2);
      return { ...window.__st(), info: d.pageInfo };
    });
    return { e0, e1, e2 };
  };
  const g1 = await brk('key');
  ok('Ctrl+Enter on page 1: the caret\'s paragraph starts page 2 (its text pushed on), on the screen, "Page 2 of N"; '
    + 'one undo step', g1.e0.page === 0 && g1.e1.page === 1 && g1.e1.count >= g1.e0.count
    && g1.e1.first === g1.e1.head.id && g1.e1.l0 === 0 && g1.e1.text === g1.e0.text && g1.e1.n === g1.e0.n + 1
    && g1.e1.onScreen && g1.e1.depth === g1.e0.depth + 1 && g1.e1.info === `Page 2 of ${g1.e1.count}`, g1);
  ok('... Ctrl-Z: as it was, the caret on page 1', g1.e2.count === g1.e0.count && g1.e2.page === 0
    && g1.e2.depth === g1.e0.depth && g1.e2.info === g1.e0.info, g1.e2);
  const g2 = await brk('menu');
  ok('Insert > Section break > Next page on page 1: section 2 starts page 2 with the caret\'s paragraph, the info '
    + 'line says so; one undo step', g2.e0.page === 0 && g2.e1.page === 1 && g2.e1.count >= g2.e0.count
    && g2.e1.first === g2.e1.head.id && g2.e1.l0 === 0 && g2.e1.onScreen && g2.e1.depth === g2.e0.depth + 1
    && /^Page 2 of /.test(g2.e1.info) && /Section 2/.test(g2.e1.info), g2);
  ok('... Ctrl-Z: as it was', g2.e2.count === g2.e0.count && g2.e2.page === 0 && g2.e2.info === g2.e0.info
    && g2.e2.n === g2.e0.n, g2.e2);

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
