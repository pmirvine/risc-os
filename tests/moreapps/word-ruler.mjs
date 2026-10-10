// !Word's ruler in the real desktop: a pane under the toolbar
// (WimpLib Ui/Ruler, !Word RulerBind) marked in inches from the text's
// left edge, with the indent markers of the selection's first
// paragraph. Checked with real mouse drags: the left box moves left
// and first line together, the hanging triangle the left indent only,
// the first-line triangle the first line only (left of the left
// indent: a hanging indent, firstLine deleted), the right triangle the
// right indent; every selected paragraph gets the value, one undo
// step on release, nothing changed while dragging; snapping to 1/16
// inch and Shift for free; drags past the window's edge and absurd
// values clamp; the ruler follows horizontal scrolling; Format > Ruler
// hides and shows it with the page moving (clicks, Page Down and the
// caret consistent); the caret stays in the document; hover help; the
// window closing in the middle of a drag; a drag ending with no place
// (the markers put back); the inch numbers unsigned, none at the
// margin; 30 open/close cycles; hiDPI. Tab stops (A4.2): a click adds a
// stop of the selector's kind (snapped), the selector cycles left ->
// centre -> right -> decimal, a stop drags (snapped, Shift free), dragged
// down off the ruler it goes, a style's stop is grey and removing it writes
// a clear stop, a mixed selection shows the first paragraph's stops and
// each paragraph gets the change, one undo step each; at zoom 50% and 200%.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, stylesXml, p, r } from './build-docx.mjs';

const PARAS = [
  p(r('First paragraph, indented with a first line.'), '<w:ind w:left="720" w:firstLine="360"/>'),   // 0
  p(r('Second paragraph with a hanging indent.'), '<w:ind w:left="1440" w:hanging="720"/>'),         // 1
  p(r('Third paragraph, plain.')),                                                                   // 2
  p(r('Fourth paragraph, plain.')),                                                                  // 3
  ...Array.from({ length: 80 }, (_, i) => p(r(`Filler ${i} with a few words in it.`))),
  p(r('Styled with a stop at 1 inch.'), '<w:pStyle w:val="TabStyle"/>'),                              // 84
  // 85: stops where indent markers are (a right stop at the right margin, a left one at the hanging indent)
  p(r('Stops on the markers.'), '<w:tabs><w:tab w:val="left" w:pos="720"/><w:tab w:val="right" w:pos="9026"/></w:tabs><w:ind w:left="720" w:hanging="720"/>'),
  // 86: 70 stops of its own (more than a command may set)
  p(r('Seventy stops.'), `<w:tabs>${Array.from({ length: 70 }, (_, k) => `<w:tab w:val="left" w:pos="${100 * (k + 1)}"/>`).join('')}</w:tabs>`),
  // 87: 257 stops: a w:tabs the model keeps raw
  p(r('Raw stops.'), `<w:tabs>${Array.from({ length: 257 }, (_, k) => `<w:tab w:val="left" w:pos="${20 * (k + 1)}"/>`).join('')}</w:tabs>`),
];
const STYLES = stylesXml('<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="TabStyle"><w:name w:val="Tab Style"/><w:basedOn w:val="Normal"/>'
  + '<w:pPr><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs></w:pPr></w:style>');
const files = { T: Array.from(await buildDocx({ 'word/document.xml': documentXml(PARAS.join('')), 'word/styles.xml': STYLES })) };
const TW = 9026;
let RUL = 0;                           // (the ruler's height, from the hook)
let BAR = 0;                           // (the toolbar rows: dw.inset() less the ruler)

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function start(page, at = { x: 60, y: 40, w: 900, h: 500 }) {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  return page.evaluate(async ([files, at]) => {
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
    /** The client point on marker id (its band: top, bottom triangle, box). */
    window.__mark = (id) => {
      const ru = window.__doc().ruler, m = ru.markers.find((k) => k.id === id);
      const y = m.kind === 'down' ? 3 : m.kind === 'up' || m.kind.startsWith('tab') ? Math.round(ru.height * 0.62) : ru.height - 2;
      return window.__client(ru.pane, ru._x(m.twips), y);
    };
    window.__marks = () => Object.fromEntries(window.__doc().ruler.markers.map((m) => [m.id, m.twips]));
    window.__sel = (i, o, j = i, o2 = o) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    window.__ind = (i) => window.__doc().doc.sections[0].blocks[i].pPr?.ind ?? null;
    await os.filer.run('RAM::RamDisc0.$.T');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ ...at, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d && !!d.ruler, msgs: window.__msgs };
  }, [files, at]);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const marks = () => ev(() => window.__marks());
const ind = (i) => ev((i) => window.__ind(i), i);
const sel = async (...a) => { await ev((a) => window.__sel(...a), a); await settle(); };
/** Drag marker id by dx client px (shift: held); between(): checked while still down. */
async function drag(id, dx, { shift = false, between, to } = {}) {
  const m = await ev((id) => window.__mark(id), id);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  await page.mouse.move(to?.x ?? m.x + dx, to?.y ?? m.y, { steps: 6 });
  await wait(30);
  const mid = between ? await between() : null;
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await wait(30);
  await settle();
  return mid;
}

try {
  const s0 = await start(page);
  ok('the document opens with a ruler', s0.ok && !s0.msgs.length, s0);
  RUL = await ev(() => window.__doc().ruler.height);
  BAR = (await ev(() => window.__doc().inset)) - RUL;

  // ---------------------------------------------------- where it is
  const geo = await ev(() => {
    const d = window.__doc(), ru = d.ruler, pane = ru.pane, w = d.win, L = d.view.layout;
    return { pane: [pane.isOpen, pane.x, pane.y, pane.w, pane.h], win: [w.x, w.y, w.w, w.h], top: L.top, first: L.items[0].y,
      front: +pane.el.style.zIndex > +w.el.style.zIndex, bar: d.toolbar2.pane.y + d.toolbar2.pane.h, on: d.rulerOn };
  });
  ok('the ruler is a pane under the toolbar rows, as wide as the window, its height', geo.pane[0] && geo.pane[1] === geo.win[0]
    && geo.pane[2] === geo.win[1] + BAR && geo.pane[2] === geo.bar && geo.pane[3] === geo.win[2] && geo.pane[4] === RUL && geo.front && geo.on, geo);
  ok('... the page starts below them (L.top = dw.inset(): the first line 24 below)', geo.top === BAR + RUL && geo.first === 24 + BAR + RUL, geo);

  // ---------------------------------------------------- the markers show the caret paragraph
  await sel(1, 2);
  const m1 = await marks();
  ok('markers of a hanging indent: first line 720, hanging and left 1440, right at the text\'s width', same(m1, { first: 720, hanging: 1440, left: 1440, right: TW }), m1);
  await sel(0, 2);
  const m0 = await marks();
  ok('the caret moved: markers of a first-line indent (first 1080, left 720)', same(m0, { first: 1080, hanging: 720, left: 720, right: TW }), m0);
  await sel(1, 3, 0, 1);
  ok('a selection: its first paragraph\'s markers (backwards too)', same(await marks(), m0), await marks());
  const lineUp = await ev(() => {
    const d = window.__doc(), ru = d.ruler, L = d.view.layout, c = L.caretRect({ id: L.items[0].id, off: 0 });
    const m = ru.markers.find((k) => k.id === 'first');
    return { mark: ru.pane.workToScreen(ru._x(m.twips), 0).x, caret: d.win.workToScreen(c.x, c.y).x };
  });
  ok('the first-line marker is where the first line starts on screen', Math.abs(lineUp.mark - lineUp.caret) <= 1, lineUp);

  // ---------------------------------------------------- the left box: all selected paragraphs, one undo step
  await sel(0, 0, 2, 3);
  const u0 = await ev(() => window.__doc().view.undoDepth);
  const during = await drag('left', 96, { between: () => ev(() => ({ dragging: window.__doc().ruler.dragging, marks: window.__marks(),
    ind: window.__ind(0), caret: os.wimp.caret?.window === window.__doc().win })) });
  ok('while dragging: the marker and the first line move, a line marks it, the text is unchanged',
    during.dragging === 'left' && during.marks.left === 2160 && during.marks.first === 2520 && same(during.ind, { left: 720, firstLine: 360 }), during);
  const after = [await ind(0), await ind(1), await ind(2)];
  const u1 = await ev(() => ({ n: window.__doc().view.undoDepth, dragging: window.__doc().ruler.dragging, caret: os.wimp.caret?.window === window.__doc().win }));
  ok('let go: every selected paragraph gets left 2160, each keeping its own first line', same(after, [{ left: 2160, firstLine: 360 },
    { left: 2160, hanging: 720 }, { left: 2160 }]), after);
  ok('... one undo step; the drag has ended; the caret is still the document\'s', u1.n === u0 + 1 && u1.dragging === null && u1.caret, { u0, u1 });
  await page.keyboard.press('Control+z');
  await settle();
  ok('... Ctrl-Z undoes it, all three', same([await ind(0), await ind(1), await ind(2)], [{ left: 720, firstLine: 360 },
    { left: 1440, hanging: 720 }, null]), [await ind(0), await ind(1), await ind(2)]);

  // ---------------------------------------------------- the first-line triangle left of the left indent
  await sel(0, 1);
  await drag('first', -48);
  ok('the first-line triangle dragged left of the left indent: a hanging indent, firstLine deleted', same(await ind(0), { left: 720, hanging: 360 }), await ind(0));
  ok('... the markers show it', same(await marks(), { first: 360, hanging: 720, left: 720, right: TW }), await marks());

  // ---------------------------------------------------- the hanging triangle
  await sel(2, 1);
  await drag('hanging', 48);
  ok('the hanging triangle moves the left indent only; the first line stays at 0', same(await ind(2), { left: 720, hanging: 720 }), await ind(2));

  // ---------------------------------------------------- the right triangle
  await sel(3, 1);
  await drag('right', -96);
  ok('the right triangle: right indent 1440', same(await ind(3), { right: 1440 }), await ind(3));

  // ---------------------------------------------------- snapping, Shift
  await sel(3, 1);
  await drag('left', 37);
  ok('snapped to 1/16 inch: 37 px (555 twips) -> 540', (await ind(3)).left === 540, await ind(3));
  await drag('left', 37, { shift: true });
  const free = (await ind(3)).left;
  ok('Shift held: free (not a multiple of 90, about 1095)', free % 90 !== 0 && Math.abs(free - 1095) <= 15, free);

  // ---------------------------------------------------- past the window's edge; absurd values
  await sel(2, 1);
  await drag('left', 0, { to: { x: 2, y: 600 } });
  ok('dragged out of the window to the left: let go there, clamped to 0 (the first line too)', same(await ind(2), null)
    && (await ev(() => window.__doc().ruler.dragging)) === null, await ind(2));
  const ext = await ev(async () => {
    const ru = window.__doc().ruler, res = {};
    ru._emit('drag', { id: 'left', twips: 1e9, free: false });
    res.live = window.__marks();
    ru._emit('commit', { id: 'left', twips: 1e9, free: false });
    await window.__frames(3);
    res.big = window.__ind(2);
    ru._emit('commit', { id: 'right', twips: -1e9, free: true });
    await window.__frames(3);
    res.right = window.__ind(2);
    ru._emit('commit', { id: 'first', twips: -1e9, free: false });
    await window.__frames(3);
    res.first = window.__ind(2);
    ru._emit('commit', { id: 'left', twips: -1e9, free: false });
    await window.__frames(3);
    res.small = window.__ind(2);
    return res;
  });
  ok('1e9 / -1e9 clamp: left to the text width less a quarter inch, right to what is left, first line to the margin',
    ext.live.left === TW - 360 && ext.big.left === TW - 360 && same(ext.right, { left: TW - 360 }) && same(ext.first, { left: TW - 360, hanging: TW - 360 })
    && same(ext.small, null), ext);

  // ---------------------------------------------------- the caret stays in the document; clicks on the ruler; help
  await sel(3, 2);
  const mk = await ev(() => window.__mark('left'));
  const left3 = (await ind(3)).left;
  await page.mouse.click(mk.x + 200, mk.y);
  await settle();
  await page.keyboard.type('Q');
  await settle();
  const typed = await ev(() => ({ text: window.__doc().doc.sections[0].blocks[3].text, caret: os.wimp.caret?.window === window.__doc().win,
    tabs: window.__doc().doc.sections[0].blocks[3].pPr.tabs }));
  ok('a click on the ruler adds a left tab stop there (snapped) and keys still type into the document', typed.text.startsWith('FoQurth')
    && typed.caret && typed.tabs?.length === 1 && typed.tabs[0].val === 'left' && typed.tabs[0].pos % 90 === 0
    && Math.abs(typed.tabs[0].pos - left3 - 3000) <= 60, { typed, left3 });
  const help = await ev(() => {
    const ru = window.__doc().ruler, m = ru.markers.find((k) => k.id === 'left');
    const s = ru.pane.workToScreen(ru._x(m.twips), ru.height - 2), s2 = ru.pane.workToScreen(ru._x(m.twips) + 150, 8);
    return [os.wimp.helpAt(s.x, s.y), os.wimp.helpAt(s2.x, s2.y)];
  });
  ok('hover help names the marker; elsewhere the ruler', /left indent/i.test(help[0] ?? '') && /ruler/i.test(help[1] ?? ''), help);
  const rm = await ev(() => window.__mark('right'));
  await page.mouse.click(rm.x, rm.y, { button: 'middle' });
  await wait(250);
  const menu = await ev(() => os.wimp.menus.levels[0]?.rows?.map((r) => String(r.item.text)) ?? null);
  await page.keyboard.press('Escape');
  await settle();
  ok('Menu on the ruler opens the window\'s menu', menu?.includes('Format'), menu);

  // ---------------------------------------------------- horizontal scroll
  const hs = await ev(async () => {
    const d = window.__doc(), w = d.win, ru = d.ruler;
    w.open({ x: 60, y: 40, w: 400, h: 400, behind: 'top', scrollX: 150, scrollY: 0 });
    await window.__frames(3);
    const L = d.view.layout, c = L.caretRect({ id: L.items[3].id, off: 0 }), m = ru.markers.find((k) => k.id === 'left');
    return { sx: w.scrollX, scale: ru.scale.scrollX, w: ru.pane.w, mark: ru.pane.workToScreen(ru._x(m.twips), 0).x, caret: w.workToScreen(c.x, 0).x };
  });
  ok('the ruler follows a horizontal scroll (markers still over the text)', hs.sx === 150 && hs.scale === 150 && hs.w === 400
    && Math.abs(hs.mark - hs.caret) <= 1, hs);
  const cost = await ev(async () => {
    const d = window.__doc(), ru = d.ruler, L = d.view.layout;
    await window.__frames(2);
    const p0 = ru.paints;
    await window.__frames(20);
    const idle = ru.paints - p0;
    for (let i = 0; i < 10; i++) { d.view.setSelection({ id: L.items[3].id, off: i }); await window.__frames(1); }
    return { idle, moves: ru.paints - p0 - idle };
  });
  ok('no repaint while idle, nor for caret moves in the same paragraph', cost.idle === 0 && cost.moves === 0, cost);
  await ev(async () => { const w = window.__doc().win; w.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 }); await window.__frames(2); });

  // ---------------------------------------------------- Format > Ruler hides and shows it
  await sel(0, 1);
  const pickRuler = async () => {
    const at = await ev(() => { const w = window.__doc().win; return window.__screen(w.x + 300, w.y + 300); });
    await page.mouse.click(at.x, at.y, { button: 'middle' });
    await wait(250);
    const f = page.locator('.menu').nth(0).locator('.mitem', { hasText: /^Format/ }).first();
    const b = await f.boundingBox();
    await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
    await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
    await wait(250);
    const ticked = await ev(() => {
      const r = os.wimp.menus.levels[1]?.rows.find((x) => x.item.text === 'Ruler');
      return r ? (typeof r.item.ticked === 'function' ? !!r.item.ticked(r.item) : !!r.item.ticked) : 'none';
    });
    const it = page.locator('.menu').nth(1).locator('.mitem', { hasText: /^Ruler/ }).first();
    const bb = await it.boundingBox();
    await page.mouse.click(bb.x + 30, bb.y + bb.height / 2);
    await wait(100);
    await settle();
    return ticked;
  };
  const tick1 = await pickRuler();
  const off = await ev(async () => {
    const d = window.__doc(), w = d.win, L = d.view.layout;
    const res = { on: d.rulerOn, open: d.ruler.pane.isOpen, top: L.top, first: L.items[0].y, caret: os.wimp.caret?.window === w,
      focused: !!os.wimp.textInput?.focused };
    w.open({ x: 70, y: 50, w: 900, h: 500, behind: 'top' });
    await window.__frames(2);
    res.moved = d.ruler.pane.isOpen;
    w.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(2);
    return res;
  });
  ok('Format > Ruler (ticked) hides it: the page moves up (L.top = the rows), the caret and focus stay in the document',
    tick1 === true && !off.on && !off.open && off.top === BAR && off.first === 24 + BAR && off.caret && off.focused, { tick1, off });
  ok('... and it stays hidden when the window moves', off.moved === false, off);
  const clickBelow = async (y) => {
    const at = await ev((y) => { const w = window.__doc().win; return window.__screen(w.x + 300, w.y + y); }, y);
    await page.mouse.click(at.x, at.y);
    await settle();
    return ev(() => { const v = window.__doc().view, L = v.layout; return v.selection.head.id === L.items[0].id && v.selection.head.off === 0; });
  };
  ok('... a click just below the toolbar is the start of the first line', await clickBelow(BAR + 3));
  const pd = async () => {
    const h = await ev(async () => { const w = window.__doc().win; w.scrollTo(0, 0); await window.__frames(2); return w.h; });
    await page.keyboard.press('PageDown');
    await settle();
    return { h, ...(await ev(() => ({ sy: window.__doc().win.scrollY, cy: window.__doc().view.caretRect().y }))) };
  };
  const pdOff = await pd();
  // (exact: the caret lands on a line that is in view, so the view does not move again)
  const pgOk = (r, top) => r.sy === r.h - top - 32 && r.cy >= r.sy + top;
  ok('... Page Down: the visible height less the toolbar and 32; the caret below the toolbar', pgOk(pdOff, BAR), pdOff);
  await sel(40, 2);
  const tick2 = await pickRuler();
  const on = await ev(() => {
    const d = window.__doc(), w = d.win, L = d.view.layout, c = d.view.caretRect(), pane = d.ruler.pane;
    return { on: d.rulerOn, open: pane.isOpen, y: pane.y - w.y, top: L.top, caretY: c.y, sy: w.scrollY, h: w.h, marks: window.__marks() };
  });
  ok('Format > Ruler (not ticked) shows it again under the toolbar, the page below it, the caret in view under it',
    tick2 === false && on.on && on.open && on.y === BAR && on.top === BAR + RUL && on.caretY >= on.sy + BAR + RUL
    && on.caretY < on.sy + on.h && on.marks.left === 0, { tick2, on });
  await ev(async () => { window.__doc().win.scrollTo(0, 0); await window.__frames(2); });
  ok('... a click just below the ruler is the start of the first line', await clickBelow(BAR + RUL + 3));
  const pdOn = await pd();
  ok('... Page Down: the visible height less the toolbar, the ruler and 32; the caret below the ruler', pgOk(pdOn, BAR + RUL), pdOn);

  // ---------------------------------------------------- tab stops (A4.2)
  const tabs = (i) => ev((i) => window.__doc().doc.sections[0].blocks[i].pPr?.tabs ?? null, i);
  const rulerAt = (twips) => ev((t) => { const ru = window.__doc().ruler; return window.__client(ru.pane, ru._x(t), Math.round(ru.height * 0.62)); }, twips);
  const click = async (pt) => { await page.mouse.click(pt.x, pt.y); await wait(30); await settle(); };
  const depth = () => ev(() => window.__doc().view.undoDepth);
  const tabMarks = () => ev(() => window.__doc().ruler.markers.filter((m) => m.id.startsWith('tab:')).map((m) => [m.twips, m.kind, !!m.grey]));
  const T = (val, pos, leader) => (leader ? { val, pos, leader } : { val, pos });
  await sel(10, 1);
  let u = await depth();
  await click(await rulerAt(2900));
  ok('tabs: a click in the text part of the ruler adds a left stop, snapped to 1/16 inch; one undo step; a black L marker',
    same(await tabs(10), [T('left', 2880)]) && (await depth()) === u + 1 && same(await tabMarks(), [[2880, 'tabL', false]]),
    { tabs: await tabs(10), marks: await tabMarks() });
  const selPt = await ev(() => { const ru = window.__doc().ruler; return window.__client(ru.pane, 12, Math.round(ru.height / 2)); });
  const kinds = [];
  u = await depth();
  for (let i = 0; i < 4; i++) { await click(selPt); kinds.push(await ev(() => window.__doc().ruler.selector)); }
  const selHelp = await ev(() => { const ru = window.__doc().ruler, s = ru.pane.workToScreen(12, Math.round(ru.height / 2)); return os.wimp.helpAt(s.x, s.y); });
  ok('... the selector (left end) cycles centre, right, decimal, left; it changes nothing in the document; its help says what it adds',
    same(kinds, ['center', 'right', 'decimal', 'left']) && (await depth()) === u && /left tab stop/.test(selHelp ?? '')
    && (await ev(() => os.wimp.caret?.window === window.__doc().win)), { kinds, selHelp });
  await click(selPt);
  await click(selPt);
  await click(await rulerAt(5760));
  ok('... with the selector at right: a right stop (marker kind tabR)', same(await tabs(10), [T('left', 2880), T('right', 5760)])
    && same(await tabMarks(), [[2880, 'tabL', false], [5760, 'tabR', false]]), await tabs(10));
  await click(await rulerAt(-720));
  await click(await rulerAt(TW + 300));
  ok('... clicks in the margins add nothing', same(await tabs(10), [T('left', 2880), T('right', 5760)]), await tabs(10));
  u = await depth();
  const mid = await drag('tab:2880', 48, { between: () => ev(() => ({ marks: window.__doc().ruler.markers.filter((m) => m.id.startsWith('tab:'))
    .map((m) => [m.id, m.twips]), tabs: window.__doc().doc.sections[0].blocks[10].pPr.tabs })) });
  ok('... a stop dragged 48 px: shown moving (the text unchanged), let go: 3600; one undo step',
    same(mid.marks, [['tab:2880', 3600], ['tab:5760', 5760]]) && same(mid.tabs, [T('left', 2880), T('right', 5760)])
    && same(await tabs(10), [T('left', 3600), T('right', 5760)]) && (await depth()) === u + 1, { mid, tabs: await tabs(10) });
  await drag('tab:3600', 37, { shift: true });
  const freeTab = (await tabs(10))[0].pos;
  ok('... Shift held: free (about 4155, not a multiple of 90)', freeTab % 90 !== 0 && Math.abs(freeTab - 4155) <= 15, await tabs(10));
  u = await depth();
  const rt = await ev(() => window.__mark('tab:5760'));
  const offMid = await drag('tab:5760', 0, { to: { x: rt.x, y: rt.y + RUL + 30 }, between: () => tabMarks() });
  ok('... dragged down off the ruler: gone from the ruler while there, removed on release; one undo step',
    offMid.length === 1 && same((await tabs(10)).map((t) => t.val), ['left']) && (await depth()) === u + 1, { offMid, tabs: await tabs(10) });
  await page.keyboard.press('Control+z');
  await settle();
  ok('... Ctrl-Z brings it back', same((await tabs(10))[1], T('right', 5760)), await tabs(10));
  const rn = await ev(() => window.__mark('tab:5760'));
  await drag('tab:5760', 0, { to: { x: rn.x, y: rn.y + 10 } });
  ok('... dragged only a little below the ruler (not 16 px): it stays', same((await tabs(10))[1], T('right', 5760)), await tabs(10));

  // a mixed selection: the first paragraph's stops shown, the change on each paragraph's own stops
  await click(selPt);
  await click(selPt);
  ok('the selector is kept (per window): right -> decimal -> left', (await ev(() => window.__doc().ruler.selector)) === 'left');
  await sel(12, 1);
  await click(await rulerAt(1440));
  await sel(11, 0, 12, 3);
  const mixMarks = await tabMarks();
  u = await depth();
  await click(await rulerAt(4320));
  ok('a selection of two paragraphs: the first one\'s stops shown (none); a click adds the stop to each, one undo step',
    same(mixMarks, []) && same(await tabs(11), [T('left', 4320)]) && same(await tabs(12), [T('left', 1440), T('left', 4320)])
    && (await depth()) === u + 1, { mixMarks, t11: await tabs(11), t12: await tabs(12) });
  await drag('tab:4320', -96);
  ok('... a stop dragged: moved in each paragraph', same(await tabs(11), [T('left', 2880)])
    && same(await tabs(12), [T('left', 1440), T('left', 2880)]), [await tabs(11), await tabs(12)]);

  // a stop from the paragraph's style
  await sel(84, 1);
  const grey = await tabMarks();
  const greyHelp = await ev(() => { const ru = window.__doc().ruler, m = ru.markers.find((k) => k.id === 'tab:1440'), s = ru.pane.workToScreen(ru._x(m.twips), Math.round(ru.height * 0.62)); return os.wimp.helpAt(s.x, s.y); });
  ok('a style\'s stop is shown grey (help: from the style); the paragraph has no stops of its own', same(grey, [[1440, 'tabL', true]])
    && (await tabs(84)) === null && /style/.test(greyHelp ?? ''), { grey, greyHelp });
  const gm = await ev(() => window.__mark('tab:1440'));
  await drag('tab:1440', 0, { to: { x: gm.x, y: gm.y + RUL + 30 } });
  ok('... dragged off: a clear stop written in the paragraph\'s own stops; no marker', same(await tabs(84), [T('clear', 1440)])
    && same(await tabMarks(), []), await tabs(84));
  await page.keyboard.press('Control+z');
  await settle();
  await drag('tab:1440', 96);
  ok('... (undone) dragged to 2 inches: clear at 1 inch, a black stop at 2', same(await tabs(84), [T('clear', 1440), T('left', 2880)])
    && same(await tabMarks(), [[2880, 'tabL', false]]), await tabs(84));

  // a stop where an indent marker is: both can be grabbed (the lower part of the band: the stop)
  const dragAt = async (twips, yk, dx) => {
    const pt = await ev(([t, yk]) => { const ru = window.__doc().ruler; return window.__client(ru.pane, ru._x(t), Math.round(ru.height * yk)); }, [twips, yk]);
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.move(pt.x + dx, pt.y, { steps: 6 });
    await page.mouse.up();
    await wait(30);
    await settle();
  };
  await sel(85, 1);
  await dragAt(TW, 0.45, -48);
  ok('a right stop at the right margin: pressed in the upper part of the band, the right indent moves (the stop stays)',
    (await ind(85))?.right === 720 && same(await tabs(85), [T('left', 720), T('right', TW)]), [await ind(85), await tabs(85)]);
  await page.keyboard.press('Control+z');
  await settle();
  await dragAt(TW, 0.75, -48);
  ok('... pressed in the lower part: the stop moves (the right indent stays)', (await ind(85))?.right === undefined
    && same(await tabs(85), [T('left', 720), T('right', 8280)]), [await ind(85), await tabs(85)]);
  await dragAt(720, 0.75, 48);
  ok('a stop at the hanging indent: the lower part moves the stop', same(await ind(85), { left: 720, hanging: 720 })
    && same(await tabs(85), [T('left', 1440), T('right', 8280)]), [await ind(85), await tabs(85)]);
  await page.keyboard.press('Control+z');
  await settle();
  await dragAt(720, 0.45, 48);
  ok('... the upper part moves the hanging triangle (the stop stays)', same(await ind(85), { left: 1440, hanging: 1440 })
    && same(await tabs(85), [T('left', 720), T('right', 8280)]), [await ind(85), await tabs(85)]);
  await page.keyboard.press('Control+z');
  await settle();
  await dragAt(720, 0.95, 48);
  ok('... and the box under it (bottom) the left indent with the first line', same(await ind(85), { left: 1440, hanging: 720 }) && same(await tabs(85), [T('left', 720), T('right', 8280)]),
    [await ind(85), await tabs(85)]);

  // refused gestures beep and change nothing
  await ev(() => { window.__beeps = 0; window.__realBeep = os.wimp.beep; os.wimp.beep = () => { window.__beeps++; }; });
  const beeps = () => ev(() => window.__beeps);
  await sel(86, 1);
  u = await depth();
  await click(await rulerAt(8100));
  ok('70 stops of its own: a click (a 71st) is refused with a beep, nothing changed',
    (await beeps()) === 1 && (await tabs(86)).length === 70 && (await depth()) === u, { beeps: await beeps(), n: (await tabs(86)).length });
  await sel(87, 1);
  const rawBefore = await ev(() => { const p = window.__doc().doc.sections[0].blocks[87]; return { tabs: p.pPr.tabs, extra: p.pPr.extra.length }; });
  const rawMarks = (await tabMarks()).length;
  await click(await rulerAt(7200));
  const rm1 = await ev(() => window.__mark('tab:20'));
  await drag('tab:20', 0, { to: { x: rm1.x, y: rm1.y + RUL + 30 } });
  await drag('tab:40', 96);
  const rawAfter = await ev(() => { const p = window.__doc().doc.sections[0].blocks[87]; return { tabs: p.pPr.tabs, extra: p.pPr.extra.length }; });
  ok('a w:tabs kept raw (257 stops): shown, but a click, a drag off and a move are each refused with a beep; it stays raw',
    rawMarks === 64 && rawBefore.tabs === undefined && rawBefore.extra === 1 && same(rawAfter, rawBefore) && (await beeps()) === 4
    && (await depth()) === u && (await tabMarks()).length === 64, { rawMarks, rawBefore, rawAfter, beeps: await beeps() });
  await ev(() => { os.wimp.beep = window.__realBeep; });
  await sel(15, 1);
  u = await depth();
  const ap = await rulerAt(2880);
  await page.mouse.click(ap.x, ap.y, { button: 'right' });
  await wait(30);
  await settle();
  await page.mouse.move(ap.x, ap.y);
  await page.mouse.down();
  await page.mouse.move(ap.x + 40, ap.y, { steps: 6 });
  await page.mouse.up();
  await wait(30);
  await settle();
  ok('an Adjust click, and a drag started away from the markers, add nothing', (await tabs(15)) === null && (await depth()) === u,
    { t: await tabs(15), u, d: await depth() });

  // zoom 200% and 50%
  for (const [z, p, dx, to] of [[200, 13, 48, 1800], [50, 14, 48, 4320]]) {
    await ev(async (z) => { window.__doc().setZoom(z); await window.__frames(3); }, z);
    await sel(p, 1);
    await click(await rulerAt(1440 * (z === 50 ? 2 : 1)));
    const at = await tabs(p);
    await drag(`tab:${at?.[0]?.pos}`, dx);
    const lineUp = await ev((p) => {
      const d = window.__doc(), ru = d.ruler, m = ru.markers.find((k) => k.id.startsWith('tab:'));
      return { mark: ru.pane.workToScreen(ru._x(m.twips), 0).x, page: d.win.workToScreen(d.view.layout.left * d.view.zoom + m.twips / 15 * d.view.zoom, 0).x };
    }, p);
    ok(`zoom ${z}%: a click adds the stop at the place clicked; a 48 px drag moves it ${to - (z === 50 ? 2880 : 1440)} twips; the marker over its place on the page`,
      same(at, [T('left', z === 50 ? 2880 : 1440)]) && same(await tabs(p), [T('left', to)]) && Math.abs(lineUp.mark - lineUp.page) <= 1,
      { at, now: await tabs(p), lineUp });
  }
  await ev(async () => { window.__doc().setZoom(100); await window.__frames(3); });

  // ---------------------------------------------------- the window closes in the middle of a drag
  const mc = await ev(async () => {
    os.vfs.writeFile('RAM::RamDisc0.$.Mid', await os.vfs.readFile('RAM::RamDisc0.$.T'), { filetype: 0xA7E });
    const dw = await window.__word().word.open('RAM::RamDisc0.$.Mid');
    dw.win.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    window.__mid = dw;
    const ru = dw.rb.ruler, m = ru.markers.find((k) => k.id === 'left');
    return window.__client(ru.pane, ru._x(m.twips), ru.height - 2);
  });
  await page.mouse.move(mc.x, mc.y);
  await page.mouse.down();
  await page.mouse.move(mc.x + 30, mc.y, { steps: 4 });
  const closed = await ev(async () => { const dw = window.__mid; dw.win.emit('close', { preventDefault() {} }); await window.__frames(2); return dw.rb.ruler.dragging; });
  await page.mouse.move(mc.x + 80, mc.y, { steps: 4 });
  await page.mouse.up();
  await settle();
  const mcr = await ev(() => ({ docs: window.__word().word.docs.length, msgs: window.__msgs }));
  ok('the window closed in the middle of a drag: no errors, the drag ends on release', closed === 'left' && mcr.docs === 1 && !mcr.msgs.length, { closed, mcr });

  // ---------------------------------------------------- a drag that ends with no place
  // (the core's drag always reports a place today; a drop with none, as a cancelled pointer could
  // give, is made here by standing in for wimp.drag: the Ruler's end path must still put the
  // markers back to the paragraph's)
  await sel(3, 1);
  const cn0 = await ev(() => {
    const ru = window.__doc().ruler, real = os.wimp.drag;
    window.__dragOpts = null;
    os.wimp.drag = (o) => { window.__dragOpts = o; return new Promise(() => {}); };
    window.__undrag = () => { os.wimp.drag = real; };
    return { marks: window.__marks(), ind: window.__ind(3), depth: window.__doc().view.undoDepth, own: ru !== null };
  });
  const cm = await ev(() => window.__mark('left'));
  await page.mouse.move(cm.x, cm.y);
  await page.mouse.down();
  await page.mouse.move(cm.x + 12, cm.y, { steps: 3 });
  await page.mouse.up();
  await settle();
  const cn1 = await ev(async () => {
    const o = window.__dragOpts, ru = window.__doc().ruler;
    window.__undrag();
    if (!o) return { started: false };
    const p = ru.pane.workToScreen(ru._x(window.__doc().ruler.markers.find((m) => m.id === 'left').twips) + 60, 20);
    o.onMove({ sx: p.x, sy: p.y });
    const mid = window.__marks(), dragging = ru.dragging;
    o.onEnd({});
    await window.__frames(2);
    return { started: true, mid, dragging, marks: window.__marks(), ind: window.__ind(3), depth: window.__doc().view.undoDepth,
      after: ru.dragging };
  });
  ok('a drag ended with no place: nothing applied, the markers go back to the paragraph\'s (Task 7)', cn1.started
    && cn1.dragging === 'left' && cn1.mid.left > cn0.marks.left && same(cn1.marks, cn0.marks) && same(cn1.ind, cn0.ind)
    && cn1.depth === cn0.depth && cn1.after === null, { cn0, cn1 });

  // ---------------------------------------------------- the inch numbers: unsigned, none at the margin
  const lab = await ev(async () => {
    const ru = window.__doc().ruler, texts = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { texts.push(String(t)); return fill.call(this, t, ...a); };
    ru.pane.invalidate();
    await window.__frames(3);
    CanvasRenderingContext2D.prototype.fillText = fill;
    return { texts };
  });
  ok('the ruler\'s inch numbers are unsigned, none at the left margin (as Word: 1 left of it, 1 2 3... right)',
    lab.texts.join() === '1,1,2,3,4,5,6,7', lab);

  // ---------------------------------------------------- 30 open/close cycles
  const lk = await ev(async () => {
    const t = window.__word();
    const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length];
    let views = [];
    const cycle = async (i) => {
      os.vfs.writeFile('RAM::RamDisc0.$.Cyc', await os.vfs.readFile('RAM::RamDisc0.$.T'), { filetype: 0xA7E });
      const dw = await t.word.open('RAM::RamDisc0.$.Cyc');
      await window.__frames(1);
      if (i % 3 === 1) dw.setRuler(false);
      if (i % 3 === 2) { dw.setRuler(false); dw.setRuler(true); }
      dw.rb.ruler._emit('commit', { id: 'left', twips: 720 * (i % 4), free: false });
      await window.__frames(1);
      views.push(dw.view);
      dw.close();
    };
    await cycle(0);
    await window.__frames(2);
    const before = count();
    views = [];
    for (let i = 1; i <= 30; i++) await cycle(i);
    await window.__frames(3);
    return { before, after: count(), listeners: views.reduce((n, v) => n + v.formatListeners.length + v._panes.length + (v._fraf ? 1 : 0), 0) };
  });
  ok('30 open/ruler/drag/close cycles leave no windows, listeners or panes behind', same(lk.after.slice(0, 2), lk.before.slice(0, 2))
    && Math.abs(lk.after[2] - lk.before[2]) <= 5 && lk.listeners === 0, lk);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ---------------------------------------------------- hiDPI (deviceScaleFactor 2)
{
  const { browser: b2, page: p2, logs: l2 } = await launch({ zoom: 2 });
  try {
    const s = await start(p2);
    await p2.evaluate(async () => { window.__sel(2, 1); await window.__frames(2); });
    const m = await p2.evaluate(() => window.__mark('left'));
    await p2.mouse.move(m.x, m.y);
    await p2.mouse.down();
    await p2.mouse.move(m.x + 48, m.y, { steps: 6 });
    await p2.mouse.up();
    await p2.evaluate(() => window.__frames(3));
    const h = await p2.evaluate(() => {
      const ru = window.__doc().ruler, cv = ru.pane._canvas, k = cv.width / ru.pane.w;
      // the inch number '1' is drawn black at double resolution
      const x = Math.round(ru._x(1440) * k), g = cv.getContext('2d');
      let dark = 0;
      const d = g.getImageData(x - 6, 0, 12, cv.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 80) dark++;
      return { k, dark, ind: window.__ind(2) };
    });
    ok('hiDPI: the ruler is drawn at double resolution and a drag works', s.ok && h.k === 2 && h.dark > 4 && same(h.ind, { left: 720 }), h);
  } catch (e) {
    out.push('FAIL hiDPI exception ' + (e.stack ?? e));
  }
  await b2.close();
  logs.push(...l2);
}

console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
