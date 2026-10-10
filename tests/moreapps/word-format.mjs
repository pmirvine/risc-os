// !Word's formatting in the real desktop, checked against the pixels
// drawn on the window's canvas: a yellow highlight behind its text,
// superscript drawn higher than the text on the baseline, and a
// justified paragraph reaching the right margin (a left-aligned copy
// does not). Then the keys (Ctrl-B/I/U, Ctrl-L/E/R/J, Ctrl-Shift->,
// Ctrl-Space; Ctrl-I at a caret typing no Tab, Ctrl-M / Ctrl-Shift-M
// typing no Enter, Ctrl-= / Ctrl-Shift-=), the pending format at a
// caret, the Format menu (opened
// with the Menu button, its ticks, Size, Font, Colour, Highlight,
// Align, Style, Clear formatting) keeping the caret and the focus,
// keys passed on, undo steps, the dirty star, a saved copy read back,
// a 5000-paragraph document and leaks over open/close. Later tasks
// add the toolbar, ruler and zoom here.
// Positions come from the layout the test hook gives
// (task.word.docs[i].view, ./EditView hook()).
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';

const LONG = 'Justified text spreads the free width of every wrapped line over the spaces between its words, ' +
  'so that each line but the last ends at the right margin of the page, as Word shows it on the screen.';
const PARAS = [
  p(r('Plain ') + r('highlighted words', '<w:highlight w:val="yellow"/>') + r(' plain again.')),   // 0
  p(r('E = mc') + r('2', '<w:vertAlign w:val="superscript"/>') + r(' and H') +
    r('2', '<w:vertAlign w:val="subscript"/>') + r('O.')),                                          // 1
  p(r(LONG), '<w:jc w:val="both"/>'),                                                                // 2
  p(r(LONG)),                                                                                        // 3
];
const fixture = () => buildDocx({ 'word/document.xml': documentXml(PARAS.join('')) });
const B = '<w:b/>';
const KEYS = [
  p(r('Bold me here and more words.')),                       // 0
  p(r('The ') + r('bold', B) + r(' word.')),                  // 1
  p(r('Mixed ') + r('half', B)),                              // 2
  p(r('Caret paragraph.')),                                   // 3
  p(r('Menu target text.')),                                  // 4
  p(r('Second menu line.')),                                  // 5
  ...Array.from({ length: 10 }, (_, i) => p(r(`Filler ${i} with words.`))),
];
const keysDoc = () => buildDocx({ 'word/document.xml': documentXml(KEYS.join('')) });
const big = () => buildDocx({ 'word/document.xml': documentXml(Array.from({ length: 5000 }, (_, i) =>
  p(r(`${i}: some words in a paragraph of the big document`))).join('')) });

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const files = { Fmt: Array.from(await fixture()), Keys: Array.from(await keysDoc()), Big: Array.from(await big()) };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** Boot, put the file on the RAM disc, open it in Word. */
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
    window.__doc = (leaf = 'Fmt') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    /** The canvas pixels of a work-area rectangle: {k, w, h, at(x, y) -> [r, g, b]} (x, y in canvas pixels). */
    window.__pixels = (x, y, w, h) => {
      const d = window.__doc(), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const img = cv.getContext('2d').getImageData(Math.round((x - win.scrollX) * k), Math.round((y - win.scrollY) * k),
        Math.round(w * k), Math.round(h * k));
      return { k, w: img.width, h: img.height, at: (i, j) => [...img.data.slice((j * img.width + i) * 4, (j * img.width + i) * 4 + 3)] };
    };
    await os.filer.run('RAM::RamDisc0.$.Fmt');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d, n: d?.view.lines().length, msgs: window.__msgs };
  }, files);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  const s0 = await start(page);
  ok('the document opens', s0.ok && s0.n === 4 && !s0.msgs.length, s0);

  // ---------------------------------------------------- highlight
  const hl = await ev(() => {
    const L = window.__doc().view.layout, it = L.items[0], ln = it.lines[0];
    const x = ln.items.find((i) => i.hl);
    const px = window.__pixels(L.left + x.x, it.y + ln.y, x.w, ln.h);
    let yellow = 0, ink = 0, n = 0;
    for (let j = 0; j < px.h; j++) {
      for (let i = 0; i < px.w; i++) {
        const [r, g, b] = px.at(i, j);
        n++;
        if (r > 230 && g > 230 && b < 60) yellow++;
        else if (r + g + b < 300) ink++;
      }
    }
    // plain text next to it: no yellow
    const plain = ln.items.find((i) => !i.hl && i.text.trim());
    // inset 2 px from the item's edges (antialiasing at the highlight's edge)
    const q = window.__pixels(L.left + plain.x + 2, it.y + ln.y + 2, plain.w - 4, ln.h - 4);
    let py = 0;
    for (let j = 0; j < q.h; j++) for (let i = 0; i < q.w; i++) { const [r, g, b] = q.at(i, j); if (r > 230 && g > 230 && b < 60) py++; }
    return { hl: x.hl, text: x.text, yellow, ink, n, py };
  });
  ok('a yellow highlight is drawn behind its text (the text drawn over it)', hl.hl === '#ffff00' && hl.yellow > hl.n * 0.5 && hl.ink > 20, hl);
  ok('... and not behind the plain text beside it', hl.py === 0, hl);

  // ---------------------------------------------------- super/subscript
  const sv = await ev(() => {
    const L = window.__doc().view.layout, it = L.items[1], ln = it.lines[0];
    /** The lowest and highest canvas rows with ink in item x. */
    const rows = (x) => {
      const px = window.__pixels(L.left + x.x, it.y + ln.y, x.w, ln.h);
      let top = -1, bottom = -1;
      for (let j = 0; j < px.h; j++) {
        for (let i = 0; i < px.w; i++) {
          const [r, g, b] = px.at(i, j);
          if (r + g + b < 300) { if (top < 0) top = j; bottom = j; break; }
        }
      }
      return { top, bottom, k: px.k };
    };
    const sup = ln.items.find((i) => i.dy < 0), sub = ln.items.find((i) => i.dy > 0);
    const base = ln.items.find((i) => i.text.includes('mc'));
    return { sup: rows(sup), sub: rows(sub), base: rows(base), dy: [sup.dy, sub.dy], px: [sup.f.px, base.f.px] };
  });
  ok('superscript is drawn smaller, its bottom higher than the baseline text', sv.sup.bottom >= 0 && sv.base.bottom >= 0
    && sv.sup.bottom < sv.base.bottom - 3 * sv.sup.k && sv.px[0] < sv.px[1], sv);
  ok('subscript is drawn lower than the baseline text', sv.sub.bottom > sv.base.bottom + 1 * sv.sub.k, sv);

  // ---------------------------------------------------- justified
  const js = await ev(() => {
    const L = window.__doc().view.layout;
    /** The rightmost ink column (work-area x) of line i of item n. */
    const edge = (n, i) => {
      const it = L.items[n], ln = it.lines[i];
      const px = window.__pixels(L.left, it.y + ln.y, L.textW + 20, ln.h);
      let last = -1;
      for (let x = 0; x < px.w; x++) {
        for (let j = 0; j < px.h; j++) { const [r, g, b] = px.at(x, j); if (r + g + b < 300) { last = x; break; } }
      }
      return last < 0 ? null : L.left + last / px.k;
    };
    const it = L.items[2], margin = L.left + L.textW;
    return { margin, lines: it.lines.length, just: it.lines.slice(0, -1).map((_, i) => edge(2, i)),
      lastJ: edge(2, it.lines.length - 1), left: edge(3, 0) };
  });
  ok('a justified paragraph\'s wrapped lines reach the right margin', js.lines >= 2
    && js.just.every((e) => e !== null && e > js.margin - 3 && e <= js.margin + 1), js);
  ok('... its last line does not; nor does the same paragraph left-aligned', js.lastJ < js.margin - 20 && js.left < js.margin - 6, js);

  // ==================================================== keys, the Format menu
  const k0 = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Keys');
    for (let i = 0; i < 100 && !window.__doc('Keys'); i++) await window.__sleep(50);
    const d = window.__doc('Keys');
    d.win.open({ x: 80, y: 60, w: 860, h: 460, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    const v = d.view;
    /** Paragraph i: its runs as [text, rPr without extra], its pPr jc, pStyle. */
    window.__para = (i, leaf = 'Keys') => {
      const b = window.__doc(leaf).doc.sections[0].blocks[i];
      return { text: b.text, jc: b.pPr?.jc ?? null, pStyle: b.pStyle ?? null,
        runs: b.runs.map((x) => { const o = { ...x.rPr }; delete o.extra; return [b.text.slice(x.start, x.end), o]; }) };
    };
    window.__sel = (i, o, j = i, o2 = o, leaf = 'Keys') => {
      const dd = window.__doc(leaf), L = dd.view.layout;
      dd.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    window.__client = (dd, x, y) => {
      const s = dd.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off, leaf = 'Keys') => {
      const dd = window.__doc(leaf), L = dd.view.layout, it = L.items[i], c = L.caretRect({ id: it.id, off });
      return window.__client(dd, c.x + 1, c.y + c.h / 2);
    };
    /** Ink pixels in the text of paragraph i from a to b (its first line). */
    window.__ink = (i, a, b) => {
      const dd = window.__doc('Keys'), L = dd.view.layout, it = L.items[i];
      const ca = L.caretRect({ id: it.id, off: a }), cb = L.caretRect({ id: it.id, off: b });
      const win = dd.win, cv = win._canvas, k = cv.width / win.w;
      const img = cv.getContext('2d').getImageData(Math.round((ca.x - win.scrollX) * k), Math.round((ca.y - win.scrollY) * k),
        Math.max(1, Math.round((cb.x - ca.x) * k)), Math.round(ca.h * k));
      let n = 0;
      for (let q = 0; q < img.data.length; q += 4) if (img.data[q] + img.data[q + 1] + img.data[q + 2] < 300) n++;
      return n;
    };
    window.__ks = () => {
      const dd = window.__doc('Keys');
      return { pending: dd.view.pending, depth: dd.view.undoDepth, title: dd.win.title, rev: dd.view.selRev,
        caret: os.wimp.caret?.window === dd.win, focused: !!os.wimp.textInput?.focused };
    };
    return { ok: !!d, hook: typeof v.format === 'function' && typeof v.query === 'function' && 'pending' in v && 'selRev' in v };
  });
  ok('the Keys document opens; the hook has format, query, pending, selRev', k0.ok && k0.hook, k0);
  const kclick = async (i, off) => { const q = await ev(([i, o]) => window.__point(i, o), [i, off]); await page.mouse.click(q.x, q.y); };
  const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
  const settle = () => ev(() => window.__frames(2));
  const para = (i) => ev((i) => window.__para(i), i);
  const ks = () => ev(() => window.__ks());
  const q = () => ev(() => window.__doc('Keys').view.query());

  // ---------------------------------------------------- Ctrl-B / I / U on a selection
  await kclick(0, 1);
  await ev(() => window.__sel(0, 0, 0, 4));
  await settle();
  const ink0 = await ev(() => window.__ink(0, 0, 4));
  const d0 = (await ks()).depth;
  await press('Control+b');
  await settle();
  const b1 = await para(0), ink1 = await ev(() => window.__ink(0, 0, 4)), s1 = await ks();
  ok('Ctrl-B bolds the selected word: a bold run in the model', same(b1.runs[0], ['Bold', { b: true }]) && same(b1.runs[1][1], {}), b1);
  ok('... and more ink on the canvas (bold drawn)', ink1 > ink0 * 1.1, { ink0, ink1 });
  ok('... one undo step; the title has the dirty star; query says bold', s1.depth === d0 + 1 && s1.title.endsWith(' *') && (await q()).bold === true, s1);
  await press('Control+b');
  await settle();
  const b2 = await para(0);
  ok('Ctrl-B again clears it', b2.runs.length === 1 && same(b2.runs[0][1], {}) && (await q()).bold === false, b2);
  await press('Control+i');
  const i1 = await para(0), qi = await q();
  await press('Control+i');
  const i2 = await para(0);
  await press('Control+u');
  const u1 = await para(0), qu = await q();
  await press('Control+u');
  const u2 = await para(0);
  ok('Ctrl-I sets and clears italic', same(i1.runs[0], ['Bold', { i: true }]) && qi.italic === true && same(i2.runs[0][1], {}), { i1, i2 });
  ok('Ctrl-U sets and clears underline', same(u1.runs[0], ['Bold', { u: 'single' }]) && qu.underline === true && same(u2.runs[0][1], {}), { u1, u2 });

  // ---------------------------------------------------- alignment keys
  const al = {};
  for (const [k, v] of [['e', 'center'], ['r', 'right'], ['j', 'both'], ['l', 'left']]) {
    await press('Control+' + k);
    al[k] = [(await para(0)).jc, (await q()).align];
  }
  ok('Ctrl-E, Ctrl-R, Ctrl-J, Ctrl-L set jc (left: the style\'s, so none)', same(al,
    { e: ['center', 'center'], r: ['right', 'right'], j: ['both', 'both'], l: [null, 'left'] }), al);

  // ---------------------------------------------------- sizes, Ctrl-Space
  await press('Control+Shift+Period');
  const z1 = await para(0), qz1 = (await q()).size;
  await press('Control+Shift+Period');
  const qz2 = (await q()).size;
  await press('Control+Shift+Comma', 2);
  const z3 = await para(0), qz3 = (await q()).size;
  // (11 pt is the size shown when none is given: going back writes it, sz 22)
  ok('Ctrl-Shift-> steps the size up Word\'s list (11 -> 12 -> 14), Ctrl-Shift-< back to 11', z1.runs[0][1].sz === 24 && qz1 === 12 && qz2 === 14
    && qz3 === 11, { z1, qz1, qz2, z3, qz3 });
  await press('Control+b');
  await press('Control+i');
  const cs0 = await para(0), depth0 = (await ks()).depth;
  await press('Control+Space');
  await settle();
  const cs1 = await para(0), t1 = (await ev(() => window.__doc('Keys').view.lines()))[0], depth1 = (await ks()).depth;
  const bi = (x) => x.runs[0][1].b === true && x.runs[0][1].i === true;
  ok('Ctrl-Space clears the formatting (one step) and types no space', bi(cs0) && same(cs1.runs[0][1], {})
    && cs1.runs.length === 1 && depth1 === depth0 + 1 && t1 === 'Bold me here and more words.', { cs0, cs1, t1, depth0, depth1 });
  await press('Control+z');
  const un = await para(0);
  ok('Ctrl-Z once undoes the clear', bi(un) && same(un, cs0), un);
  await press('Control+z', 6);
  const back0 = await para(0);
  ok('... and undoing step by step goes back to plain text', same(back0.runs, [['Bold me here and more words.', {}]]), back0);

  // ---------------------------------------------------- the pending format at a caret
  await kclick(3, 0);
  const pd0 = await ks();
  await press('Control+b');
  const pd1 = await ks(), pq = await q();
  await page.keyboard.type('abc');
  await settle();
  const pd2 = await ks(), p3 = await para(3);
  ok('Ctrl-B at a caret changes nothing, sets the pending format (query: bold)', pd1.depth === pd0.depth && same(pd1.pending, { b: true }) && pq.bold === true, { pd0, pd1, pq });
  ok('... typing abc then types bold text, as one undo step; pending used up', same(p3.runs[0], ['abc', { b: true }]) && same(p3.runs[1], ['Caret paragraph.', {}])
    && pd2.depth === pd0.depth + 1 && same(pd2.pending, {}), { p3, pd2 });
  await press('Control+z');
  const p3u = await para(3);
  ok('... Ctrl-Z once removes the word', p3u.text === 'Caret paragraph.' && p3u.runs.length === 1, p3u);
  await press('Control+b');
  await press('ArrowRight');
  const mv = await ks();
  await page.keyboard.type('x');
  await settle();
  const p3x = await para(3);
  ok('moving the caret first drops the pending format (x typed plain)', same(mv.pending, {}) && p3x.text === 'Cxaret paragraph.' && p3x.runs.length === 1, { mv, p3x });
  await press('Control+z');
  await kclick(3, 16);
  await press('Control+b');
  await press('Enter');
  const en = await ks();
  await page.keyboard.type('y');
  await settle();
  const p4 = await para(4);
  ok('Ctrl-B then Enter drops it: the new paragraph\'s y is plain', same(en.pending, {}) && p4.text === 'y' && same(p4.runs[0][1], {}), { en, p4 });
  await press('Control+z', 2);
  await kclick(1, 6);
  await page.keyboard.type('Q');
  await settle();
  const p1 = await para(1), p1s = await ks();
  ok('typing inside a bold word is bold with no pending format', same(p1.runs[1], ['boQld', { b: true }]) && same(p1s.pending, {}), p1);
  await press('Control+z');

  // ---------------------------------------------------- keys passed on
  const pass = await ev(() => {
    const w = window.__doc('Keys').win;
    const k = (code, key, extra = {}) => { const e = w.emit('key', { code, key, shift: false, ctrl: false, ...extra }); return !!(e.handled || e.defaultPrevented); };
    return { F5: k(0x185, 'F5'), ctrlF12: k(0x1EC, 'F12', { ctrl: true }), altA: k(97, 'a', { alt: true }),
      metaB: k(98, 'b', { domEvent: { metaKey: true } }), ctrlQ: k(17, 'q', { ctrl: true }), ctrlB: k(2, 'b', { ctrl: true }),
      mac: /^(Mac|iPhone|iPad|iPod)/.test(navigator.platform) };
  });
  // (on a Mac Cmd-B is Bold: ./MacKeys)
  ok(`keys it does not use go on (F5, Ctrl-F12, Alt-A, Ctrl-Q${pass.mac ? '' : ', Cmd-B'}); Ctrl-B is used${pass.mac ? ', and Cmd-B on a Mac' : ''}`,
    !pass.F5 && !pass.ctrlF12 && !pass.altA && pass.metaB === pass.mac && !pass.ctrlQ && pass.ctrlB, pass);
  await press('Control+z', pass.mac ? 2 : 1);

  // ---------------------------------------------------- Ctrl-I, Ctrl-M, Ctrl-= at a caret and on a selection (Task 7)
  await kclick(3, 0);
  const ci0 = await ks(), ct0 = (await para(3)).text;
  await press('Control+i');
  const ci1 = await ks(), ct1 = (await para(3)).text;
  ok('Ctrl-I at a caret: pending italic, no Tab typed (code 9 is Tab), no undo step', same(ci1.pending, { i: true }) && ct1 === ct0
    && ci1.depth === ci0.depth, { ci0, ci1, ct1 });
  await press('ArrowRight');
  await press('Control+m');
  await settle();
  const cm1 = await ev(() => window.__doc('Keys').doc.sections[0].blocks[3].pPr.ind ?? null), cmt = (await para(3)).text;
  await press('Control+m');
  const cm2 = await ev(() => window.__doc('Keys').doc.sections[0].blocks[3].pPr.ind ?? null);
  await press('Control+Shift+m');
  await press('Control+Shift+m');
  await settle();
  const cm3 = await ev(() => window.__doc('Keys').doc.sections[0].blocks[3].pPr.ind ?? null), cmd = await ks();
  ok('Ctrl-M indents the caret\'s paragraph by half an inch (no Enter: code 13), Ctrl-Shift-M back; one step each',
    cm1?.left === 720 && cm2?.left === 1440 && !cm3 && cmt === ct0 && cmd.depth === ci0.depth + 4, { cm1, cm2, cm3, cmt, cmd });
  await ev(() => window.__sel(3, 0, 3, 5));
  await settle();
  await press('Control+Equal');
  const sb = await para(3), qsb = await q();
  await press('Control+Shift+Equal');
  const sp = await para(3), qsp = await q();
  await press('Control+Shift+Equal');
  const sp2 = await para(3);
  ok('Ctrl-= subscript, Ctrl-Shift-= superscript (exclusive), again: back to the baseline', sb.runs[0][1].vertAlign === 'subscript'
    && qsb.vert === 'subscript' && sp.runs[0][1].vertAlign === 'superscript' && qsp.vert === 'superscript'
    && same(sp2.runs, [['Caret paragraph.', {}]]), { sb, sp, sp2 });
  await press('Control+z', 7);
  await settle();
  const cback = await ks();
  ok('... undone step by step back to the start', cback.depth === ci0.depth && (await para(3)).runs.length === 1, cback);

  // ---------------------------------------------------- the Format menu
  /** Open the window menu with the Menu button over paragraph i. */
  const menuAt = async (i) => {
    const pt = await ev((i) => window.__point(i, 2), i);
    await page.mouse.click(pt.x, pt.y + 30, { button: 'middle' });
    await wait(250);
  };
  const pick = async (level, text, { hover = false } = {}) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text, 'i') }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item '${text}' at level ${level}`);
    if (hover) {
      await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
      await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
      await wait(250);
    } else {
      await page.mouse.click(b.x + 30, b.y + b.height / 2);
      await wait(150);
    }
  };
  /** The items of open menu level n: [text, ticked, shaded]. */
  const levelItems = (n) => ev((n) => {
    const lv = os.wimp.menus.levels[n];
    const v = (x, it) => (typeof x === 'function' ? !!x(it) : !!x);
    return lv ? lv.rows.map((r) => [String(r.item.text), v(r.item.ticked, r.item), r.shaded]) : null;
  }, n);
  const closeMenus = () => ev(() => os.wimp.menus.close());

  await kclick(1, 5);
  await ev(() => window.__sel(1, 4, 1, 8));
  await menuAt(4);
  const top = await levelItems(0);
  await pick(0, 'Format', { hover: true });
  const fm = await levelItems(1);
  ok('the window menu: Save, Save as, Revert, Save a copy, Info, Edit, Insert, Format, Zoom, New, Close', same(top?.map((x) => x[0]), ['Save', 'Save as', 'Revert', 'Save a copy', 'Info', 'Edit', 'Insert', 'Format', 'Zoom', 'New', 'Close']), top);
  const tick = (list, t) => list?.find((x) => x[0] === t)?.[1];
  ok('the Format menu opens; Bold is ticked in a bold selection, Italic not', fm && tick(fm, 'Bold') === true && tick(fm, 'Italic') === false
    && ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Superscript', 'Subscript', 'Font', 'Size', 'Colour', 'Highlight', 'Align', 'Indent',
      'Style', 'Clear formatting'].every((t) => fm.some((x) => x[0] === t)), fm);
  await closeMenus();
  await ev(() => window.__sel(2, 0, 2, 10));
  await menuAt(4);
  await pick(0, 'Format', { hover: true });
  const fm2 = await levelItems(1);
  ok('... in a mixed selection Bold is not ticked', tick(fm2, 'Bold') === false, fm2);
  await closeMenus();
  const em = await ev(() => {
    const d = window.__doc('Keys'), sub = d.win.menu({}).items.find((i) => i.text === 'Edit').submenu();
    return { items: sub.items.map((i) => [i.text, i.key]), mac: /^(Mac|iPhone|iPad|iPod)/.test(navigator.platform) };
  });
  const K = em.mac ? 'Cmd+' : 'Ctrl+';   // (on a Mac the labels are Cmd+: MacKeys.macLabel)
  ok('the Edit menu: Undo, Redo, Cut, Copy, Paste, Select all, Find..., Find next, Find previous, Replace..., Word count... (no format items)',
    same(em.items, [['Undo', K + 'Z'], ['Redo', K + 'Y'], ['Cut', K + 'X'], ['Copy', K + 'C'], ['Paste', K + 'V'],
      ['Select all', K + 'A'], ['Find...', K + 'F'], ['Find next', K + 'G'], ['Find previous', K + 'Shift+G'],
      ['Replace...', 'Ctrl+H'], ['Word count...', undefined]]), em);

  /** Select paragraph i whole, then Format > sub > item from the menu. */
  const choose = async (i, sub, item) => {
    await ev((i) => window.__sel(i, 0, i, window.__para(i).text.length), i);
    await menuAt(i);
    await pick(0, 'Format', { hover: true });
    if (sub) { await pick(1, sub, { hover: true }); await pick(2, item); } else await pick(1, item);
    await settle();
  };
  const dm = (await ks()).depth;
  await choose(4, 'Size', '24');
  const m1 = await para(4);
  ok('Format > Size > 24 sets sz 48 (one undo step)', m1.runs[0][1].sz === 48 && (await ks()).depth === dm + 1, m1);
  await choose(4, 'Font', 'Arial');
  const m2 = await para(4);
  ok('Format > Font > Arial sets rFonts ascii/hAnsi Arial', same(m2.runs[0][1].rFonts, { ascii: 'Arial', hAnsi: 'Arial' }), m2);
  await choose(4, 'Colour', 'Red');
  const m3 = await para(4);
  ok('Format > Colour > Red sets the desktop\'s red, DD0000', m3.runs[0][1].color === 'DD0000' && (await q()).color === 'DD0000', m3);
  await choose(4, 'Highlight', 'Yellow');
  const m4 = await para(4);
  ok('Format > Highlight > Yellow', m4.runs[0][1].highlight === 'yellow', m4);
  await choose(4, 'Align', 'Right');
  const m5 = await para(4);
  ok('Format > Align > Right sets jc right', m5.jc === 'right', m5);
  await choose(4, 'Style', 'Heading 1');
  const m6 = await para(4), q6 = await q();
  ok('Format > Style > Heading 1 sets pStyle; query shows it', m6.pStyle === 'Heading1' && q6.style === 'Heading1', { m6, q6 });
  await ev(() => window.__sel(4, 0, 4, 17));
  await menuAt(4);
  await pick(0, 'Format', { hover: true });
  const ticks = { size: null, align: null };
  await pick(1, 'Size', { hover: true });
  ticks.size = (await levelItems(2))?.filter((x) => x[1]).map((x) => x[0]);
  await pick(1, 'Align', { hover: true });
  ticks.align = (await levelItems(2))?.filter((x) => x[1]).map((x) => x[0]);
  await pick(1, 'Clear formatting');
  await settle();
  const m7 = await para(4);
  ok('the submenus tick the current size (24) and alignment (Right)', same(ticks, { size: ['24'], align: ['Right'] }), ticks);
  ok('Format > Clear formatting removes the run formatting (paragraph kept)', same(m7.runs[0][1], {}) && m7.jc === 'right' && m7.pStyle === 'Heading1', m7);
  const mc = await ks();
  await ev(() => { const d = window.__doc('Keys'); const L = d.view.layout; d.view.setSelection({ id: L.items[5].id, off: 0 }); });
  await page.keyboard.insertText('Typed ');
  await settle();
  ok('after a menu choice the caret and the focus stay in the document: typing works at once', mc.caret && mc.focused
    && (await para(5)).text === 'Typed Second menu line.', { mc, p5: (await para(5)).text });
  // a menu choice at a caret: Bold sets the pending format and typing continues bold
  await kclick(5, 6);
  await menuAt(5);
  await pick(0, 'Format', { hover: true });
  await pick(1, 'Bold');
  await page.keyboard.type('bb');
  await settle();
  const m8 = await para(5);
  ok('Format > Bold at a caret: the next typing is bold', same(m8.runs[1], ['bb', { b: true }]), m8);
  // More colours... opens the swatches (WimpLib Ui/ColourPopup) as a submenu
  await menuAt(5);
  await pick(0, 'Format', { hover: true });
  await pick(1, 'Colour', { hover: true });
  const col = await levelItems(2);
  await pick(2, 'More colours', { hover: true });
  const more = await ev(() => { const lv = os.wimp.menus.levels[3]; return lv ? { dbox: lv.isDbox, title: lv.win.title, caret: os.wimp.caret?.icon?.name } : null; });
  ok('the Colour menu: 16 colours, Automatic, More colours...', col?.length === 18 && col[16][0] === 'Automatic'
    && col[17][0] === 'More colours...' && col[17][2] === false, col);
  ok('... More colours opens the swatches, the hex field with the caret', more?.dbox && more.title === 'Colour' && more.caret === 'hex', more);
  await ev(() => window.__sel(5, 0, 5, 5));
  await page.keyboard.press('Control+u');
  await page.keyboard.type('7030a0');
  await page.keyboard.press('Enter');
  await settle();
  const mc2 = await para(5), mcs = await ks();
  ok('... 7030a0 + Return there colours the selection; the menus close; the caret is the document\'s', mc2.runs[0][1].color === '7030A0'
    && !(await ev(() => os.wimp.menus.isOpen)) && mcs.caret && mcs.focused, { mc2, mcs });

  // ---------------------------------------------------- a saved copy reads back the same
  {
    const bytes = await ev(async () => Array.from(await window.__doc('Keys').saveBytes()));
    const back = await readDocx(new Uint8Array(bytes));
    const bs = back.sections[0].blocks;
    const live = await ev(() => window.__doc('Keys').doc.sections[0].blocks.slice(0, 6).map((b) => ({ t: b.text, s: b.pStyle ?? null,
      jc: b.pPr?.jc ?? null, r: b.runs.map((x) => { const o = { ...x.rPr }; delete o.extra; return [x.start, x.end, o]; }) })));
    const read = bs.slice(0, 6).map((b) => ({ t: b.text, s: b.pStyle ?? null, jc: b.pPr?.jc ?? null,
      r: b.runs.map((x) => { const o = { ...x.rPr }; delete o.extra; return [x.start, x.end, o]; }) }));
    ok('a saved copy reads back with the same formatting', same(live, read), { live, read });
  }

  // ---------------------------------------------------- 5000 paragraphs
  {
    const big = await ev(async () => {
      await os.filer.run('RAM::RamDisc0.$.Big');
      for (let i = 0; i < 200 && !window.__doc('Big'); i++) await window.__sleep(50);
      const d = window.__doc('Big');
      d.win.open({ x: 120, y: 80, w: 800, h: 400, behind: 'top' });
      await window.__frames(3);
      const v = d.view, L = v.layout, n = L.items.length;
      v.setSelection({ id: L.items[0].id, off: 0 }, { id: L.items[n - 1].id, off: 3 });
      const times = {};
      for (const id of ['bold', 'alignCenter', 'fontBigger', 'clearFormat']) {
        const t0 = performance.now();
        v.format(id);
        v.flush();
        times[id] = Math.round(performance.now() - t0);
      }
      const depth = v.undoDepth, last = d.doc.sections[0].blocks[n - 1];
      const t0 = performance.now();
      d.d.undo();
      v.flush();
      const undo = Math.round(performance.now() - t0);
      const centred = d.doc.sections[0].blocks.every((b) => b.pPr?.jc === 'center');
      const bigger = d.doc.sections[0].blocks[n - 1].runs[0].rPr.sz;
      d.win.emit('close', { preventDefault() {} });
      return { n, times, depth, undo, centred, bigger, lastRuns: last.runs.length };
    });
    ok('5000 paragraphs selected: each format command < 1 s, one undo step each', big.n === 5000 && Object.values(big.times).every((t) => t < 1000)
      && big.depth === 4, big);
    ok('... undo of the clear < 1 s restores the size; centred everywhere', big.undo < 1000 && big.bigger === 24 && big.centred, big);
  }

  // ---------------------------------------------------- no leaks over open/close
  {
    const lk = await ev(async () => {
      const t = window.__word();
      const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length];
      const cycle = async () => {
        os.vfs.writeFile('RAM::RamDisc0.$.Cyc', await os.vfs.readFile('RAM::RamDisc0.$.Keys'), { filetype: 0xA7E });
        const dw = await t.word.open('RAM::RamDisc0.$.Cyc');
        dw.view.formatListeners.push(() => {});
        dw.view.format('bold');
        const m = dw.win.menu({});
        os.wimp.menus.open(m, 300, 300, { task: t });
        os.wimp.menus.open(m.items.find((x) => x.text === 'Format').submenu(), 400, 300, { task: t });
        await window.__frames(2);
        os.wimp.menus.close();
        dw.close();
      };
      await cycle();
      await window.__frames(2);
      const before = count();
      for (let i = 0; i < 6; i++) await cycle();
      await window.__frames(2);
      return { before, after: count() };
    });
    ok('opening, formatting, a Format menu and closing 6 times leave no windows or elements behind', same(lk.after.slice(0, 2), lk.before.slice(0, 2)) && Math.abs(lk.after[2] - lk.before[2]) <= 5, lk);
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
