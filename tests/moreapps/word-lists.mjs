// !Word's lists in the real desktop, checked against the pixels on
// the window's canvas: a bullet list's glyph drawn in the hanging
// space, a numbered list's '1.' there (the label text from the test
// hook's labels()), nothing there for a paragraph that is not in a
// list; Ctrl-A's selection never covers a label; a click on the
// label puts the caret at the start of the text; typing in a list
// item keeps its label; at 200% the label is drawn twice as large;
// a Wingdings bullet is drawn with ink;
// a 50,000-paragraph list opens and paints within the budgets
// (open < 3 s, logged; a frame < 100 ms); no page errors.
// Editing lists (a three-level list, real keys): Tab at the start of
// an item demotes it (labels renumber at once, the label moves a
// level's step), Tab in the middle types a tab, Shift-Tab promotes in
// a list and goes on elsewhere (Ctrl-Tab, Alt-Tab, F5 untouched);
// Backspace at an item's start takes the number away with the text
// left where it was, a second one joins; deleting an item and Enter
// renumber; Enter in an empty heading numbered by its style ends
// the list, a second Enter splits; undo and redo bring the labels
// back; Format > List
// (shaded outside lists; Demote, Promote, Remove from list); the
// ruler's markers on the drawn indents of a list item, a drag of its
// left marker; Ctrl-M and the toolbar's indent buttons move a list
// item's text and label together; open/close cycles leave nothing.
// Positions come from the layout the test hook gives
// (task.word.docs[i].view, ./EditView hook()).
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, numberingXml, p, r } from './build-docx.mjs';
import { listDocx, heading } from './list-fixtures.mjs';

const lvl = (fmt, text, rPr = '') => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>`
  + `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${rPr}</w:lvl>`;
const NUMBERING = numberingXml(
  `<w:abstractNum w:abstractNumId="0">${lvl('bullet', '', '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>')}</w:abstractNum>`
  + `<w:abstractNum w:abstractNumId="1">${lvl('decimal', '%1.')}</w:abstractNum>`
  + `<w:abstractNum w:abstractNumId="2">${lvl('bullet', '\uF0A7', '<w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:hint="default"/></w:rPr>')}</w:abstractNum>`
  + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>'
  + '<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>');
const LI = (id) => `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`;
const PARAS = [
  p(r('First bullet item'), LI(1)),                                     // 0
  p(r('Second bullet item'), LI(1)),                                    // 1
  p(r('A plain paragraph, indented like the list text.'), '<w:ind w:left="720"/>'),  // 2
  ...Array.from({ length: 12 }, (_, i) => p(r(`Numbered item ${i + 1}`), LI(2))),     // 3..14
  p(r('A Wingdings square bullet'), LI(3)),                             // 15
];
const docx = (paras, numbering = NUMBERING) => buildDocx({ 'word/document.xml': documentXml(paras.join('')), 'word/numbering.xml': numbering });
// a three-level decimal list (1. / 1.1. / 1.1.1.; left 720 per level, hanging 360) as numId 4
const lvlN = (k) => `<w:lvl w:ilvl="${k}"><w:start w:val="1"/><w:numFmt w:val="decimal"/>`
  + `<w:lvlText w:val="${Array.from({ length: k + 1 }, (_, j) => `%${j + 1}.`).join('')}"/><w:lvlJc w:val="left"/>`
  + `<w:pPr><w:ind w:left="${720 * (k + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
const NUMBERING_M = numberingXml(`<w:abstractNum w:abstractNumId="3">${[0, 1, 2].map(lvlN).join('')}</w:abstractNum>`
  + '<w:num w:numId="4"><w:abstractNumId w:val="3"/></w:num>');
const MPARAS = [p(r('A plain paragraph first.')), ...['A', 'B', 'C', 'D'].map((x) => p(r(`Item ${x}`), LI(4))),
  p(r('A plain paragraph last.'))];
const HUGE = Array.from(await docx(Array.from({ length: 50000 }, (_, i) => p(r(`List item ${i}`), LI(1 + (i % 2))))));
// headings numbered by their style (Heading1 gives numId 5), the last one empty
const SNUM = await listDocx([heading('One'), heading('Two'), p('', '<w:pStyle w:val="Heading1"/>')]);
const files = { L: Array.from(await docx(PARAS)), M: Array.from(await docx(MPARAS, NUMBERING_M)), S: Array.from(SNUM) };

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
    window.__doc = (leaf = window.__leaf || 'L') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    /** Layout -> the window's work area at the document's zoom. */
    window.__ws = (x, y) => {
      const d = window.__doc(), z = d.zoom / 100, t = d.view.layout.top;
      return { x: x * z, y: t + (y - t) * z };
    };
    window.__client = (x, y) => {
      const d = window.__doc(), q = window.__ws(x, y), s = d.win.workToScreen(q.x, q.y);
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /**
     * Counts over a layout rectangle (x, y, w, h) of the canvas: ink (dark), blue (the selection colour multiplied
     * into white: blue well above red), n pixels.
     */
    window.__scan = (x, y, w, h) => {
      const d = window.__doc(), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const a = window.__ws(x, y), b = window.__ws(x + w, y + h);
      const img = cv.getContext('2d').getImageData(Math.round((a.x - win.scrollX) * k), Math.round((a.y - win.scrollY) * k),
        Math.max(1, Math.round((b.x - a.x) * k)), Math.max(1, Math.round((b.y - a.y) * k)));
      let ink = 0, blue = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const [R, G, B] = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (R + G + B < 300) ink++;
        if (B > 200 && B - R > 40) blue++;
      }
      return { ink, blue, n: img.data.length / 4 };
    };
    /** The label box of item i's first line, in layout coordinates. */
    window.__box = (i) => {
      const L = window.__doc().view.layout, it = L.items[i], ln = it.lines[0], lb = ln.label;
      return lb ? { x: L.left + lb.x, y: it.y + ln.y, w: lb.w, h: ln.h, text: lb.text }
        : { x: L.left + 24, y: it.y + ln.y, w: 24, h: ln.h, text: null };
    };
    await os.filer.run('RAM::RamDisc0.$.L');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 60, y: 40, w: 900, h: 600, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d, n: d?.view.lines().length, labels: d?.view.labels(), msgs: window.__msgs };
  }, files);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  const s0 = await start(page);
  const want = ['\u2022', '\u2022', null, ...Array.from({ length: 12 }, (_, i) => `${i + 1}.`), '\u25AA'];
  ok('the document opens; the labels are the bullets, 1. to 12. and a square', s0.ok && s0.n === 16 && same(s0.labels, want) && !s0.msgs.length, s0);

  // ---------------------------------------------------- ink in the label box
  const ink = await ev(() => [0, 2, 3, 13].map((i) => {
    const b = window.__box(i);
    return { i, text: b.text, ...window.__scan(b.x, b.y, b.w, b.h) };
  }));
  ok('a bullet list: the bullet glyph is drawn in the hanging space', ink[0].text === '•' && ink[0].ink > 4, ink[0]);
  ok('a numbered list: its number (1., 11.) is drawn in the hanging space', ink[2].text === '1.' && ink[2].ink > 8
    && ink[3].text === '11.' && ink[3].ink > ink[2].ink, ink);
  ok('a paragraph not in a list: nothing in that space', ink[1].text === null && ink[1].ink === 0, ink[1]);

  // ---------------------------------------------------- Ctrl-A: the label is not selected
  const p0 = await ev(() => { const L = window.__doc().view.layout, c = L.caretRect({ id: L.items[5].id, off: 3 }); return window.__client(c.x, c.y + c.h / 2); });
  await page.mouse.click(p0.x, p0.y);
  await page.keyboard.press('Control+a');
  await ev(() => window.__frames(2));
  const sel = await ev(() => {
    const L = window.__doc().view.layout, it = L.items[3], ln = it.lines[0], b = window.__box(3);
    const t = ln.items[0];
    return { label: window.__scan(b.x, b.y, b.w, b.h), text: window.__scan(L.left + t.x, it.y + ln.y, t.w, ln.h),
      all: window.__doc().view.text().length };
  });
  ok('Ctrl-A: the text is lit, the label is not', sel.text.blue > sel.text.n * 0.3 && sel.label.blue === 0, sel);

  // ---------------------------------------------------- a click on the label
  const pl = await ev(() => { const b = window.__box(4); return window.__client(b.x + b.w / 2, b.y + b.h / 2); });
  await page.mouse.click(pl.x, pl.y);
  await ev(() => window.__frames(2));
  const ck = await ev(() => {
    const v = window.__doc().view, L = v.layout, s = v.selection;
    return { idx: L.byId.get(s.head.id).index, off: s.head.off, anchor: s.anchor.off, caret: v.caretRect(),
      start: L.caretRect({ id: L.items[4].id, off: 0 }), textX: L.left + L.items[4].lines[0].x };
  });
  ok('a click on the label puts the caret at the start of the text', ck.idx === 4 && ck.off === 0 && ck.anchor === 0
    && Math.abs(ck.start.x - ck.textX) < 1e-9, ck);

  // ---------------------------------------------------- typing in a list item
  await page.keyboard.type('New ');
  await ev(() => window.__frames(3));
  const ty = await ev(() => {
    const v = window.__doc().view, b = window.__box(4);
    return { line: v.lines()[4], labels: v.labels().slice(3, 6), scan: window.__scan(b.x, b.y, b.w, b.h), box: b };
  });
  ok('typing in a list item: the text goes in, the labels stay (2. drawn)', ty.line === 'New Numbered item 2'
    && same(ty.labels, ['1.', '2.', '3.']) && ty.box.text === '2.' && ty.scan.ink > 8, ty);
  await page.keyboard.press('Enter');
  await ev(() => window.__frames(3));
  const en = await ev(() => window.__doc().view.labels().slice(3, 8));
  ok('Enter in a list item: the new paragraph continues the list, the followers renumber', same(en, ['1.', '2.', '3.', '4.', '5.']), en);
  await page.keyboard.press('Control+z');
  await ev(() => window.__frames(3));
  const un = await ev(() => window.__doc().view.labels().slice(3, 7));
  ok('... undo renumbers them back', same(un, ['1.', '2.', '3.', '4.']), un);

  // ---------------------------------------------------- 200%
  const zm = await ev(async () => {
    const d = window.__doc();
    const at = () => { const b = window.__box(3); return window.__scan(b.x, b.y, b.w, b.h); };
    d.win.scrollTo(0, 0);
    await window.__frames(2);
    const a = at();
    d.setZoom(200);
    d.win.scrollTo(0, 0);
    await window.__frames(3);
    const b = at();
    d.setZoom(100);
    await window.__frames(2);
    return { a, b };
  });
  ok('at 200% the label is drawn twice as large (about four times the ink)', zm.b.ink > zm.a.ink * 2.5 && zm.b.n > zm.a.n * 3, zm);

  // ---------------------------------------------------- a Wingdings bullet (U+F0A7 -> U+25AA) is drawn, not blank
  const sq = await ev(async () => {
    const d = window.__doc(), L = d.view.layout, it = L.items[15];
    d.win.scrollTo(0, Math.max(0, Math.round(it.y - 100)));
    await window.__frames(3);
    const b = window.__box(15);
    return { text: b.text, css: it.lines[0].label.f.css, ...window.__scan(b.x, b.y, b.w, b.h) };
  });
  ok('a Wingdings square bullet is drawn as U+25AA with ink (a font with the glyph is found)', sq.text === '\u25AA'
    && !sq.css.includes('Wingdings') && sq.ink > 4, sq);

  // ==================================================== editing lists (document M: a three-level list)
  const m0 = await ev(async () => {
    const dw = await window.__word().word.open('RAM::RamDisc0.$.M');
    dw.win.open({ x: 60, y: 40, w: 900, h: 600, behind: 'top', scrollX: 0, scrollY: 0 });
    window.__leaf = 'M';
    await window.__frames(3);
    return { labels: window.__doc().view.labels(), msgs: window.__msgs.length };
  });
  ok('a three-level list opens: 1. to 4., the plain paragraphs unlabelled', same(m0.labels, [null, '1.', '2.', '3.', '4.', null]) && !m0.msgs, m0);
  const settle = (n = 3) => ev((n) => window.__frames(n), n);
  const clickAt = async (i, off) => {
    const c = await ev(([i, o]) => { const L = window.__doc().view.layout, q = L.caretRect({ id: L.items[i].id, off: o }); return window.__client(q.x + 1, q.y + q.h / 2); }, [i, off]);
    await page.mouse.click(c.x, c.y);
    await settle();
  };
  const press = async (k) => { await page.keyboard.press(k); await settle(); };
  /** What the view shows: labels, lines, the caret [item, off], undo depth, item i's text and label x. */
  const state = (i = 2) => ev((i) => {
    const v = window.__doc().view, L = v.layout, s = v.selection, ln = L.items[i].lines[0];
    return { labels: v.labels(), lines: v.lines(), at: [L.byId.get(s.head.id).index, s.head.off], depth: v.undoDepth,
      textX: ln.x, labelX: ln.label ? ln.label.x : null, ind: window.__doc().doc.sections[0].blocks[i].pPr?.ind ?? null,
      ilvl: window.__doc().doc.sections[0].blocks[i].pPr?.numPr?.ilvl };
  }, i);
  const LINES = ['A plain paragraph first.', 'Item A', 'Item B', 'Item C', 'Item D', 'A plain paragraph last.'];

  // ---------------------------------------------------- Tab / Shift-Tab
  await clickAt(2, 0);
  const t0 = await state();
  await press('Tab');
  const t1 = await state();
  ok('Tab at the start of an item demotes it: 1. 1.1. 2. 3., the text unchanged, the label a level\'s step (48 px) right',
    same(t0.at, [2, 0]) && same(t1.labels, [null, '1.', '1.1.', '2.', '3.', null]) && same(t1.lines, LINES)
    && t1.labelX - t0.labelX === 48 && t1.ilvl === 1 && t1.depth === t0.depth + 1 && same(t1.at, [2, 0]), { t0, t1 });
  await press('Control+z');
  const t2 = await state();
  await press('Control+y');
  const t3 = await state();
  ok('... undo renumbers back (1. to 4.), redo demotes again', same(t2.labels, m0.labels) && t2.labelX === t0.labelX
    && same(t3.labels, t1.labels), { t2, t3 });
  await clickAt(2, 3);
  await press('Shift+Tab');
  const t4 = await state();
  ok('Shift-Tab in the middle of an item promotes it: 1. to 4. again, the text unchanged', same(t4.labels, m0.labels)
    && same(t4.lines, LINES) && t4.ilvl === 0 && t4.labelX === t0.labelX, t4);
  await clickAt(3, 4);
  await press('Tab');
  const t5 = await state(3);
  ok('Tab in the middle of an item types a tab (the labels stay)', t5.lines[3] === 'Item\t C' && same(t5.labels, m0.labels)
    && same(t5.at, [3, 5]), t5);
  await press('Control+z');
  ok('... undone', same((await state()).lines, LINES), await state());

  // ---------------------------------------------------- Shift-Tab outside a list goes on
  await clickAt(0, 3);
  const pass = await ev(() => {
    const w = window.__doc().win;
    const k = (code, key, extra = {}) => { const e = w.emit('key', { code, key, shift: false, ctrl: false, ...extra }); return !!(e.handled || e.defaultPrevented); };
    const res = { shiftTab: k(0x19A, 'Tab', { shift: true }), bare: k(0x19A, ''), ctrlTab: k(0x1AA, 'Tab', { ctrl: true }),
      altTab: k(0x18A, 'Tab', { alt: true }), F5: k(0x185, 'F5') };
    window.__seen = [];
    window.__off = os.wimp.on('key', (e) => { window.__seen.push(e.code); });
    return res;
  });
  const q0 = await state(0);
  await press('Shift+Tab');
  await page.waitForFunction(() => window.__seen.includes(0x19A), null, { timeout: 2000 }).catch(() => {});
  const q9 = { ...(await state(0)), seen: await ev(() => { window.__off(); return [...window.__seen]; }) };
  ok('Shift-Tab outside a list is not used and reaches the desktop; Ctrl-Tab, Alt-Tab, F5 go on too',
    !pass.shiftTab && !pass.bare && !pass.ctrlTab && !pass.altTab && !pass.F5 && q9.seen.includes(0x19A)
    && same(q9.lines, LINES) && q9.depth === q0.depth, { pass, q9 });

  // ---------------------------------------------------- Backspace at an item's start
  await clickAt(3, 0);
  const b0 = await state(3);
  await press('Backspace');
  const b1 = await state(3);
  ok('Backspace at the start of an item: the number goes, the text stays where it was, the followers renumber',
    same(b1.lines, LINES) && same(b1.labels, [null, '1.', '2.', null, '3.', null]) && b1.labelX === null
    && Math.abs(b1.textX - b0.textX) < 0.01 && same(b1.at, [3, 0]) && b1.depth === b0.depth + 1, { b0, b1 });
  await press('Backspace');
  const b2 = await state(2);
  ok('... a second Backspace joins it to the item before', b2.lines[2] === 'Item BItem C' && same(b2.labels, [null, '1.', '2.', '3.', null])
    && same(b2.at, [2, 6]), b2);
  await press('Control+z');
  await press('Control+z');
  const b3 = await state(3);
  ok('... undone twice: the item and its number are back', same(b3.lines, LINES) && same(b3.labels, m0.labels), b3);

  // ---------------------------------------------------- deleting an item, Enter
  await ev(() => { const v = window.__doc().view, L = v.layout; v.setSelection({ id: L.items[1].id, off: 6 }, { id: L.items[2].id, off: 6 }); });
  await settle();
  await press('Delete');
  const d1 = await state();
  ok('deleting a whole item renumbers the followers', same(d1.lines, [LINES[0], 'Item A', 'Item C', 'Item D', LINES[5]])
    && same(d1.labels, [null, '1.', '2.', '3.', null]), d1);
  await press('Control+z');
  await clickAt(4, 6);
  await press('Enter');
  const e1 = await state();
  ok('Enter at the end of the last item continues the list (5.)', same(e1.labels, [null, '1.', '2.', '3.', '4.', '5.', null]), e1);
  await press('Control+z');
  ok('... undone', same((await state()).labels, m0.labels), await state());

  // ---------------------------------------------------- Ctrl-M, the toolbar's indent buttons
  await clickAt(1, 2);
  const i0 = await state(1);
  await press('Control+m');
  const i1 = await state(1);
  const q1 = await ev(() => window.__doc().view.query().indentLeft);
  await press('Control+Shift+M');
  const i2 = await state(1);
  ok('Ctrl-M in a list item moves its text and label 720 twips (48 px) right; Ctrl-Shift-M back to the level\'s',
    i1.textX - i0.textX === 48 && i1.labelX - i0.labelX === 48 && same(i1.ind, { left: 1440 }) && q1 === 1440
    && i2.textX === i0.textX && i2.labelX === i0.labelX && i2.ind === null && same(i2.labels, m0.labels), { i0, i1, q1, i2 });
  const icon = (n) => ev((n) => { const ic = window.__doc().toolbar.icon(n), rc = ic.el.getBoundingClientRect(); return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }; }, n);
  const ti = await icon('indentMore');
  await page.mouse.click(ti.x, ti.y);
  await settle();
  const i3 = await state(1);
  const tl = await icon('indentLess');
  await page.mouse.click(tl.x, tl.y);
  await settle();
  const i4 = await state(1);
  ok('the toolbar\'s indent buttons do the same in a list item', i3.textX - i0.textX === 48 && i3.labelX - i0.labelX === 48
    && i4.textX === i0.textX && i4.ind === null, { i3, i4 });

  // ---------------------------------------------------- the ruler on a list item
  await clickAt(1, 2);
  const ru0 = await ev(() => {
    const d = window.__doc(), ru = d.ruler, L = d.view.layout, it = L.items[1], ln = it.lines[0];
    const m = Object.fromEntries(ru.markers.map((k) => [k.id, k.twips]));
    const at = (id) => ru.pane.workToScreen(ru._x(m[id]), 0).x;
    const c = L.caretRect({ id: it.id, off: 0 });
    return { m, left: at('left'), first: at('first'), text: d.win.workToScreen(c.x, c.y).x,
      label: d.win.workToScreen(L.left + ln.label.x, 0).x };
  });
  ok('the ruler\'s markers of a list item are its drawn indents: left at the text, the first line at the label',
    ru0.m.left === 720 && ru0.m.first === 360 && ru0.m.hanging === 720 && Math.abs(ru0.left - ru0.text) <= 1
    && Math.abs(ru0.first - ru0.label) <= 1, ru0);
  const mk = await ev(() => {
    const ru = window.__doc().ruler, m = ru.markers.find((k) => k.id === 'left');
    const s = ru.pane.workToScreen(ru._x(m.twips), ru.height - 2), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k, k };
  });
  await page.mouse.move(mk.x, mk.y);
  await page.mouse.down();
  await page.mouse.move(mk.x + 48 * mk.k, mk.y, { steps: 6 });
  await page.mouse.up();
  await settle(4);
  const r1 = await state(1);
  const ru1 = await ev(() => Object.fromEntries(window.__doc().ruler.markers.map((k) => [k.id, k.twips])));
  ok('dragging a list item\'s left marker half an inch: left 1440 from its level\'s 720, the label (hanging kept) moves along',
    same(r1.ind, { left: 1440 }) && r1.textX - i0.textX === 48 && r1.labelX - i0.labelX === 48 && ru1.left === 1440
    && ru1.first === 1080, { r1, ru1 });
  await press('Control+z');

  // ---------------------------------------------------- Format > List
  const menuAt = async (i) => {
    await clickAt(i, 2);
    const c = await ev((i) => { const L = window.__doc().view.layout, q = L.caretRect({ id: L.items[i].id, off: 2 }); return window.__client(q.x + 1, q.y + q.h / 2); }, i);
    await page.mouse.click(c.x, c.y, { button: 'middle' });
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
      await settle();
    }
  };
  const rows = (n) => ev((n) => {
    const lv = os.wimp.menus.levels[n];
    return lv ? lv.rows.map((r) => [String(r.item.text), r.item.key ?? '', r.shaded]) : null;
  }, n);
  await menuAt(0);
  await pick(0, 'Format', { hover: true });
  const fm0 = (await rows(1))?.find((x) => x[0] === 'List');
  await ev(() => os.wimp.menus.close());
  await menuAt(2);
  await pick(0, 'Format', { hover: true });
  const fm1 = (await rows(1))?.find((x) => x[0] === 'List');
  await pick(1, 'List', { hover: true });
  const lm = await rows(2);
  ok('Format > List: shaded in a plain paragraph; in a list item Demote (Tab), Promote (Shift+Tab), Remove from list',
    fm0?.[2] === true && fm1?.[2] === false && same(lm, [['Demote', 'Tab', false], ['Promote', 'Shift+Tab', false],
      ['Remove from list', '', false]]), { fm0, fm1, lm });
  await pick(2, 'Demote');
  const f1 = await state();
  await menuAt(2);
  await pick(0, 'Format', { hover: true });
  await pick(1, 'List', { hover: true });
  await pick(2, 'Remove from list');
  const f2 = await state();
  ok('... Demote makes it 1.1.; Remove from list takes its number away (the followers renumber), one undo step each',
    same(f1.labels, [null, '1.', '1.1.', '2.', '3.', null]) && same(f2.labels, [null, '1.', null, '2.', '3.', null])
    && f2.depth === f1.depth + 1 && same(f2.lines, LINES), { f1, f2 });
  await press('Control+z');
  await press('Control+z');
  ok('... both undone', same((await state()).labels, m0.labels), await state());

  // ---------------------------------------------------- Enter in an empty item numbered by its style
  const sn = await ev(async () => {
    const dw = await window.__word().word.open('RAM::RamDisc0.$.S');
    dw.win.open({ x: 60, y: 40, w: 900, h: 600, behind: 'top', scrollX: 0, scrollY: 0 });
    window.__leaf = 'S';
    window.__sdw = dw;
    await window.__frames(3);
    return { labels: window.__doc().view.labels() };
  });
  await clickAt(2, 0);
  await press('Enter');
  const sn1 = await state(2);
  await press('Enter');
  const sn2 = await state(2);
  await press('Control+z');
  await press('Control+z');
  const sn3 = await state(2);
  ok('Enter in an empty heading numbered by its style ends the list (no label, numId 0, no new paragraph); a second Enter '
    + 'splits; undo restores', same(sn.labels, ['1', '2', '3']) && same(sn1.labels, ['1', '2', null]) && sn1.lines.length === 3
    && sn2.lines.length === 4 && same(sn2.labels, ['1', '2', null, null]) && same(sn3.labels, sn.labels) && sn3.lines.length === 3,
  { sn, sn1, sn2, sn3 });
  await ev(async () => { window.__sdw.close(); window.__leaf = 'M'; await window.__frames(2); });

  // ---------------------------------------------------- open/close cycles
  const lk = await ev(async () => {
    const t = window.__word();
    const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length];
    let views = [];
    const cycle = async () => {
      os.vfs.writeFile('RAM::RamDisc0.$.Cyc', await os.vfs.readFile('RAM::RamDisc0.$.M'), { filetype: 0xA7E });
      const dw = await t.word.open('RAM::RamDisc0.$.Cyc');
      await window.__frames(1);
      const v = dw.view, L = v.L;
      v.setSelection({ anchor: { id: L.items[2].id, off: 0 }, head: { id: L.items[2].id, off: 0 }, affinity: 'down', goalX: null });
      v.run('tab');
      v.run('shiftTab');
      v.run('backspace');
      v.format('listOff');
      await window.__frames(1);
      views.push(v);
      dw.close();
    };
    await cycle();
    await window.__frames(2);
    const before = count();
    views = [];
    for (let i = 0; i < 20; i++) await cycle();
    await window.__frames(3);
    return { before, after: count(), listeners: views.reduce((n, v) => n + v.formatListeners.length + v._panes.length, 0),
      msgs: window.__msgs.length };
  });
  ok('20 open/edit lists/close cycles leave no windows, listeners or panes behind; no errors', same(lk.after.slice(0, 2), lk.before.slice(0, 2))
    && Math.abs(lk.after[2] - lk.before[2]) <= 5 && lk.listeners === 0 && !lk.msgs, lk);
  await ev(() => { window.__leaf = 'L'; });

  // ---------------------------------------------------- 50,000 list paragraphs
  const big = await ev(async (bytes) => {
    os.vfs.writeFile('RAM::RamDisc0.$.Huge', new Uint8Array(bytes), { filetype: 0xA7E });
    const t0 = performance.now();
    const dw = await window.__word().word.open('RAM::RamDisc0.$.Huge');
    await window.__frames(2);
    const opened = performance.now() - t0;
    const w = dw.win, times = [], texts = [];
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
    const v = window.__word().word.docs.find((x) => x.path.endsWith('.Huge')).view;
    const labels = v.labels();
    // typing at the end of the last item, laid out again
    const L = v.layout, last = L.items[L.items.length - 1];
    v.setSelection({ id: last.id, off: last.block.text.length });
    const t1 = performance.now();
    v.type('!');
    v.flush();
    const typed = performance.now() - t1;
    const res = { opened, times, texts, n: L.items.length, last: labels.slice(-2), typed, errs: window.__msgs.length };
    dw.close();
    await window.__frames(2);
    return res;
  }, HUGE);
  console.log(`timings: 50,000 list paragraphs opened in ${Math.round(big.opened)} ms, typing ${Math.round(big.typed)} ms`);
  ok('a 50,000-paragraph list opens in under 3 s; each frame paints in under 100 ms, only the lines in view (labels too)',
    big.n === 50000 && big.opened < 3000 && big.times.length >= 4 && Math.max(...big.times) < 100
    && big.texts.every((n) => n > 5 && n < 300) && same(big.last, ['\u2022', '25000.']) && !big.errs,
    { max: Math.max(...big.times), ...big, times: big.times.map(Math.round) });
  ok('... typing in it (with its layout) stays under 500 ms', big.typed < 500, big.typed);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
