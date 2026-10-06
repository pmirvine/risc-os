// !Word's toolbar in the real desktop: a pane across the top of a
// document's window (WimpLib Ui/Toolbar, !Word ToolbarBind) with the
// style, font and size fields and their popups, B I U S, superscript,
// subscript, the colour (swatches: Ui/ColourPopup) and highlight
// popups, the alignment radio buttons, indents and clear formatting.
// Checked with real mouse clicks on the icons and real keys: each
// control changes the model and shows the selection's formatting
// (mixed: let out / empty); clicks keep the document's caret and
// selection; Return in a field gives the caret back. The page starts
// below the toolbar (DocLayout top): clicks just under it, Page Down,
// keeping the caret out from under it. A narrow window, hiDPI, the
// formatListeners called once a frame and never after closing, the
// refresh cost on 5000 paragraphs, popups (the colour swatches too)
// closing on an outside click, every wb_* button sprite really drawn,
// 60 random clicks over the toolbar, and 30 open/close cycles leaving
// nothing behind.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const B = '<w:b/>';
const PARAS = [
  p(r('Plain words to format here.')),                         // 0
  p(r('The ') + r('bold', B) + r(' word.')),                   // 1
  p(r('Mixed ') + r('big', '<w:sz w:val="48"/>')),             // 2
  p(r('Centred paragraph.'), '<w:jc w:val="center"/>'),        // 3
  p(r('Style target.')),                                       // 4
  ...Array.from({ length: 80 }, (_, i) => p(r(`Filler ${i} with a few words in it.`))),
];
const docx = () => buildDocx({ 'word/document.xml': documentXml(PARAS.join('')) });
const big = () => buildDocx({ 'word/document.xml': documentXml(Array.from({ length: 5000 }, (_, i) =>
  p(r(`${i}: some words in a paragraph of the big document`))).join('')) });
const files = { T: Array.from(await docx()), Big: Array.from(await big()) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** Boot, put the files on the RAM disc, open T in Word at (x, y, w, h). */
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
    /** The client point at the centre of toolbar icon name (or its left + dx). */
    window.__icon = (name, leaf = 'T') => {
      const ic = window.__doc(leaf).toolbar.icon(name), rc = ic.el.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2, w: rc.width, h: rc.height };
    };
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__screen = (sx, sy) => {
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sx * k, y: rc.top + sy * k };
    };
    window.__point = (i, off, leaf = 'T') => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__sel = (i, o, j = i, o2 = o, leaf = 'T') => {
      const d = window.__doc(leaf), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    window.__para = (i, leaf = 'T') => {
      const b = window.__doc(leaf).doc.sections[0].blocks[i];
      return { text: b.text, jc: b.pPr?.jc ?? null, pStyle: b.pStyle ?? null, ind: b.pPr?.ind ?? null,
        runs: b.runs.map((x) => { const o = { ...x.rPr }; delete o.extra; return [b.text.slice(x.start, x.end), o]; }) };
    };
    /** The toolbar's state: pressed buttons, field texts, the caret's owner. */
    window.__bar = (leaf = 'T') => {
      const d = window.__doc(leaf), tb = d.toolbar;
      const pressed = ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'alignLeft', 'alignCenter',
        'alignRight', 'alignJustify'].filter((n) => tb.pressed(n));
      const s = d.view.selection;
      return { pressed, size: tb.text('size'), font: tb.text('font'), style: tb.text('style'),
        sel: s && [s.anchor.id, s.anchor.off, s.head.id, s.head.off], caretDoc: os.wimp.caret?.window === d.win,
        caretPane: os.wimp.caret?.window === tb.pane, lit: d.view.lit, focused: !!os.wimp.textInput?.focused, swatch: [...tb.swatches.entries()] };
    };
    await os.filer.run('RAM::RamDisc0.$.T');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ ...at, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d && !!d.toolbar, msgs: window.__msgs };
  }, [files, at]);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const bar = () => ev(() => window.__bar());
const para = (i) => ev((i) => window.__para(i), i);
const q = () => ev(() => window.__doc().view.query());
const clickIcon = async (name) => { const c = await ev((n) => window.__icon(n), name); await page.mouse.click(c.x, c.y); await wait(60); await settle(); };
const clickAt = async (i, off) => { const c = await ev(([i, o]) => window.__point(i, o), [i, off]); await page.mouse.click(c.x, c.y); await settle(); };
const pick = async (level, text) => {
  const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text, 'i') }).first();
  const b = await item.boundingBox();
  if (!b) throw new Error(`no menu item '${text}' at level ${level}`);
  await page.mouse.click(b.x + 30, b.y + b.height / 2);
  await wait(120);
  await settle();
};
const levelTexts = (n) => ev((n) => os.wimp.menus.levels[n]?.rows?.map((r) => String(r.item.text)) ?? null, n);
const menusOpen = () => ev(() => os.wimp.menus.isOpen);

try {
  const s0 = await start(page);
  ok('the document opens with a toolbar', s0.ok && !s0.msgs.length, s0);

  // ---------------------------------------------------- where it is
  const geo = await ev(() => {
    const d = window.__doc(), tb = d.toolbar, pane = tb.pane, w = d.win, L = d.view.layout;
    return { pane: [pane.isOpen, pane.x, pane.y, pane.w, pane.h], win: [w.x, w.y, w.w, w.h], top: L.top,
      first: L.items[0].y, width: tb.width, front: pane.el.style.zIndex >= w.el.style.zIndex };
  });
  ok('the toolbar is a pane across the window\'s top, BAR_H high', geo.pane[0] && geo.pane[1] === geo.win[0] && geo.pane[2] === geo.win[1]
    && geo.pane[3] === geo.win[2] && geo.pane[4] === 34, geo);
  ok('... the page starts below it and the ruler (L.top = 34 + 24: the first line at 24 + 58)', geo.top === 58 && geo.first === 82, geo);
  ok('... all the buttons fit in a page-wide window', geo.width <= 842, geo);

  // ---------------------------------------------------- B on a selection
  await clickAt(0, 2);
  await ev(() => window.__sel(0, 0, 0, 5));
  await settle();
  const b0 = await bar();
  await clickIcon('bold');
  const b1 = await bar(), p0 = await para(0);
  ok('clicking B bolds the selection', same(p0.runs[0], ['Plain', { b: true }]), p0);
  ok('... B is pressed in; the selection and the document\'s caret and focus are kept', same(b1.pressed, ['bold', 'alignLeft'])
    && same(b1.sel, b0.sel) && b1.caretDoc && b1.focused, { b0, b1 });
  await page.keyboard.press('ArrowRight');
  await settle();
  const b2 = await bar();
  ok('... the keys still go to the document (Right collapsed the selection: B still pressed, at its end)', b2.sel[3] === 5
    && b2.pressed.includes('bold'), b2);
  await clickAt(0, 12);
  ok('a caret in plain text lets B out', !(await bar()).pressed.includes('bold'), await bar());
  await clickAt(1, 6);
  ok('moving the caret into bold text presses B in', (await bar()).pressed.includes('bold'), await bar());
  for (const [n, k] of [['italic', 'i'], ['underline', 'u'], ['strike', 'strike']]) {
    await ev(() => window.__sel(0, 6, 0, 11));
    await clickIcon(n);
    const pp = await para(0), bb = await bar();
    ok(`clicking ${n} sets it (pressed in)`, pp.runs[2]?.[0] === 'words' && pp.runs[2][1][k] !== undefined && bb.pressed.includes(n), { pp, bb });
    await clickIcon(n);
    ok(`... and again clears it`, !(await bar()).pressed.includes(n), await bar());
  }
  await ev(() => window.__sel(0, 6, 0, 11));
  await clickIcon('superscript');
  const sp1 = await bar();
  await clickIcon('subscript');
  const sp2 = await bar(), sq = await q();
  ok('superscript then subscript: exclusive (only subscript pressed)', sp1.pressed.includes('superscript') && sp2.pressed.includes('subscript')
    && !sp2.pressed.includes('superscript') && sq.vert === 'subscript', { sp1, sp2 });
  await clickIcon('subscript');

  // ---------------------------------------------------- the size field
  await clickAt(0, 20);
  const sz0 = await bar();
  await ev(() => window.__sel(2, 0, 2, 9));
  await settle();
  const sz1 = await bar();
  ok('the size field shows the caret\'s size (11) and is empty for a mixed selection', sz0.size === '11' && sz1.size === '', { sz0, sz1 });
  await ev(() => window.__sel(0, 0, 0, 5));
  await settle();
  await clickIcon('size');
  const ed = await bar();
  await page.keyboard.press('Control+u');
  await page.keyboard.type('24');
  await page.keyboard.press('Enter');
  await settle();
  const ed2 = await bar(), pz = await para(0);
  ok('clicking the size field gives it the caret; the selection stays lit (view.lit)', ed.caretPane && !ed.caretDoc && ed.lit, ed);
  ok('typing 24 + Return applies 48 half-points; the caret goes back to the document', pz.runs[0][1].sz === 48 && ed2.caretDoc
    && ed2.focused && ed2.size === '24', { pz, ed2 });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('Z');
  await settle();
  ok('... typing continues in the document', (await para(0)).text.startsWith('PlainZ'), await para(0));
  await page.keyboard.press('Control+z');
  await ev(() => window.__sel(0, 0, 0, 5));
  await settle();
  await clickIcon('size');
  await page.keyboard.press('Control+u');
  await page.keyboard.type('99');
  await page.keyboard.press('Escape');
  await settle();
  const esc = await bar();
  ok('Escape in the size field restores it (24) and gives the caret back, applying nothing', esc.size === '24' && esc.caretDoc
    && (await para(0)).runs[0][1].sz === 48, esc);
  await clickIcon('size');
  await page.keyboard.press('Control+u');
  await page.keyboard.type('...');
  await page.keyboard.press('Enter');
  await settle();
  ok('a size that is not a number changes nothing (the field shows 24 again)', (await bar()).size === '24' && (await para(0)).runs[0][1].sz === 48, await bar());

  // ---------------------------------------------------- size popup, bigger / smaller
  await clickIcon('sizeMenu');
  const at = await ev(() => { const tb = window.__doc().toolbar, lv = os.wimp.menus.levels[0]; return { at: tb.popupAt('size'), x: lv?.win.x, y: lv?.win.y }; });
  const items = await levelTexts(0);
  ok('the size arrow opens Word\'s sizes under the size field', items?.includes('16') && items.includes('72') && Math.abs(at.x - at.at.x) <= 2, { items, at });
  await pick(0, '16');
  ok('... choosing 16 sets sz 32; the caret is still the document\'s', (await para(0)).runs[0][1].sz === 32 && (await bar()).caretDoc, await para(0));
  await clickIcon('fontBigger');
  const big1 = (await para(0)).runs[0][1].sz;
  await clickIcon('fontSmaller');
  await clickIcon('fontSmaller');
  const big2 = (await para(0)).runs[0][1].sz;
  ok('the up and down arrows step along Word\'s sizes (16 -> 18 -> 16 -> 14)', big1 === 36 && big2 === 28, { big1, big2 });

  // ---------------------------------------------------- fonts
  await clickIcon('fontMenu');
  const fonts = await levelTexts(0);
  ok('the font arrow lists the document\'s fonts, Word\'s, then Desktop fonts', fonts && fonts.indexOf('Calibri') >= 0
    && fonts.indexOf('Arial') > fonts.indexOf('Calibri') && fonts.at(-1) === 'Desktop fonts', fonts);
  await pick(0, 'Arial');
  const pf = await para(0), bf = await bar();
  ok('... choosing Arial sets rFonts Arial and the field shows it', same(pf.runs[0][1].rFonts, { ascii: 'Arial', hAnsi: 'Arial' }) && bf.font === 'Arial', { pf, bf });
  await clickIcon('font');
  await page.keyboard.press('Control+u');
  await page.keyboard.type('times  new roman');
  await page.keyboard.press('Enter');
  await settle();
  const pf2 = await para(0), bf2 = await bar();
  ok('typing a font name (any case) + Return applies the font list\'s name', pf2.runs[0][1].rFonts?.ascii === 'Times New Roman'
    && bf2.font === 'Times New Roman' && bf2.caretDoc, { pf2, bf2 });

  // ---------------------------------------------------- colour
  await clickIcon('color');
  const cp = await ev(() => { const lv = os.wimp.menus.levels[0]; return lv ? { title: lv.win.title, dbox: lv.isDbox, icons: lv.win.icons.map((i) => i.name) } : null; });
  ok('the colour button opens the swatches (a menu dialogue: Automatic and a hex field)', cp?.dbox && cp.title === 'Colour'
    && cp.icons.includes('auto') && cp.icons.includes('hex'), cp);
  const red = await ev(() => {
    const w = os.wimp.menus.levels[0].win, i = 9;                // FF0000: row 1, column 1
    return window.__client(w, 8 + (i % 8) * 22 + 11, 8 + Math.floor(i / 8) * 22 + 11);
  });
  await page.mouse.click(red.x, red.y);
  await wait(80);
  await settle();
  const pc = await para(0), bc = await bar();
  ok('clicking the red swatch sets FF0000; the popup closes; the caret is the document\'s', pc.runs[0][1].color === 'FF0000' && !(await menusOpen())
    && bc.caretDoc && bc.focused, { pc, bc });
  const sw = await ev(() => {
    const tb = window.__doc().toolbar, ic = tb.icon('color'), cv = tb.pane._canvas, k = cv.width / tb.pane.w;
    const d = cv.getContext('2d').getImageData(Math.round((ic.bbox.x0 + ic.bbox.x1) / 2 * k), Math.round((ic.bbox.y1 - 6) * k), 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  ok('... the bar under the A is red', sw[0] > 200 && sw[1] < 40 && sw[2] < 40, sw);
  await clickIcon('color');
  const auto = await ev(() => window.__client(os.wimp.menus.levels[0].win, 8 + 44, 8 + 110 + 8 + 14));
  await page.mouse.click(auto.x, auto.y);
  await settle();
  ok('Automatic: the colour is auto', (await q()).color === 'auto' && !(await menusOpen()), await q());
  await clickIcon('color');
  const hasCaret = await ev(() => os.wimp.caret?.icon?.name);
  await page.keyboard.press('Control+u');
  await page.keyboard.type('00b050');
  await page.keyboard.press('Enter');
  await settle();
  const ph = await para(0);
  ok('the hex field (it has the caret): 00b050 + Return sets 00B050', hasCaret === 'hex' && ph.runs[0][1].color === '00B050' && !(await menusOpen()), { hasCaret, ph });

  // ---------------------------------------------------- highlight
  await clickIcon('highlight');
  const hl = await levelTexts(0);
  await pick(0, 'Yellow');
  ok('the highlight button lists None and Word\'s colours; Yellow sets it', hl?.[0] === 'None' && hl.length === 17
    && (await para(0)).runs[0][1].highlight === 'yellow', hl);

  // ---------------------------------------------------- alignment
  await clickAt(0, 3);
  await clickIcon('alignCenter');
  const al1 = await bar(), pa = await para(0);
  await clickIcon('alignJustify');
  const al2 = await bar();
  await clickAt(3, 2);
  const al3 = await bar();
  await clickAt(4, 2);
  const al4 = await bar();
  ok('alignment buttons: one pressed at a time, set jc', pa.jc === 'center' && same(al1.pressed.filter((x) => x.startsWith('align')), ['alignCenter'])
    && same(al2.pressed.filter((x) => x.startsWith('align')), ['alignJustify']), { pa, al1, al2 });
  ok('... and show the caret paragraph\'s (centred, then left)', al3.pressed.includes('alignCenter') && al4.pressed.includes('alignLeft')
    && al4.pressed.filter((x) => x.startsWith('align')).length === 1, { al3, al4 });

  // ---------------------------------------------------- indent, clear, style
  await clickAt(4, 2);
  await clickIcon('indentMore');
  const in1 = (await para(4)).ind;
  await clickIcon('indentLess');
  const in2 = (await para(4)).ind;
  ok('indent more / less (720 twips)', in1?.left === 720 && (!in2 || !in2.left), { in1, in2 });
  await ev(() => window.__sel(0, 0, 0, 5));
  await clickIcon('clearFormat');
  const pcl = await para(0);
  ok('clear formatting removes the character formatting', same(pcl.runs[0][1], {}) && pcl.jc === 'both', pcl);
  await clickAt(4, 1);
  await clickIcon('styleMenu');
  const st = await levelTexts(0);
  await pick(0, 'Heading 1');
  const p4 = await para(4), bs = await bar();
  ok('the style arrow lists the document\'s paragraph styles; Heading 1 applies it; the field shows it', st?.some((t) => /heading 1/i.test(t))
    && p4.pStyle === 'Heading1' && /heading 1/i.test(bs.style), { st, p4, bs });
  await clickAt(1, 1);
  ok('... a Normal paragraph shows Normal', /normal/i.test((await bar()).style), await bar());

  // ---------------------------------------------------- popups close on an outside click
  await clickIcon('sizeMenu');
  const open1 = await menusOpen();
  const far = await ev(() => window.__point(10, 3));
  await page.mouse.click(far.x, far.y);
  await settle();
  ok('a popup closes on a click outside it', open1 && !(await menusOpen()), open1);

  // ---------------------------------------------------- the colour swatches close on an outside click (Task 7)
  await ev(() => window.__sel(0, 0, 0, 5));
  await clickIcon('color');
  const cpOpen = await ev(() => ({ open: os.wimp.menus.isOpen, title: os.wimp.menus.levels[0]?.win.title, color: window.__para(0).runs[0][1].color ?? null }));
  const far2 = await ev(() => window.__point(12, 3));
  await page.mouse.click(far2.x, far2.y);
  await settle();
  const cpShut = await ev(() => ({ open: os.wimp.menus.isOpen, color: window.__para(0).runs[0][1].color ?? null,
    caret: os.wimp.caret?.window === window.__doc().win, wins: os.wimp.windows.size }));
  ok('the colour swatches close on a click outside them, choosing nothing; the caret is the document\'s', cpOpen.open
    && cpOpen.title === 'Colour' && !cpShut.open && cpShut.color === cpOpen.color && cpShut.caret, { cpOpen, cpShut });

  // ---------------------------------------------------- the button sprites are really drawn (Task 7)
  const spr = await ev(async () => {
    const tb = window.__doc().toolbar, out = {};
    for (const ic of tb.pane.icons) {
      const img = ic.el.querySelector('img');
      if (!String(ic.spriteName ?? '').startsWith('wb_')) continue;
      if (!img) { out[ic.name] = 'no img'; continue; }
      if (!img.complete) await new Promise((res) => { img.onload = res; img.onerror = res; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] + d[i + 1] + d[i + 2] < 384) ink++;
      out[ic.name] = { w: c.width, h: c.height, ink, sum: c.toDataURL().length };
    }
    return out;
  });
  const sprites = Object.entries(spr);
  ok('every wb_* button sprite is drawn (an image of its size with ink in it), and they differ', sprites.length >= 14
    && sprites.every(([, v]) => v.w >= 16 && v.h >= 16 && v.ink >= 8)
    && new Set(sprites.map(([, v]) => v.sum + ':' + v.ink)).size >= sprites.length - 2, spr);

  // ---------------------------------------------------- random clicks over the toolbar (Task 7)
  {
    const tbBox = await ev(() => { const pane = window.__doc().toolbar.pane, a = window.__client(pane, 0, 0);
      return { x: a.x, y: a.y, w: pane.w, h: pane.h }; });
    let seed = 7, bad = [];
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 60; k++) {
      const x = tbBox.x + 2 + rnd() * (Math.min(tbBox.w, 860) - 4), y = tbBox.y + 2 + rnd() * (tbBox.h - 4);
      const b = rnd();
      await page.mouse.click(x, y, { button: b < 0.8 ? 'left' : b < 0.9 ? 'right' : 'middle' });
      if (rnd() < 0.3) await page.keyboard.press(rnd() < 0.5 ? 'Escape' : 'Enter');
      const st = await ev(async () => {
        await window.__frames(1);
        const d = window.__doc(), v = d.view, s = v.selection;
        const errs = window.__msgs.length;
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        // a field left with the caret: Escape gives it back
        return { errs, sel: !!s && !!v.layout.byId.get(s.head.id), editing: d.toolbar.editing };
      });
      if (st.editing) await page.keyboard.press('Escape');
      if (st.errs || !st.sel) bad.push([k, st]);
    }
    const end = await ev(async () => {
      const d = window.__doc();
      await window.__frames(2);
      return { msgs: window.__msgs.length, menus: os.wimp.menus.isOpen, editing: d.toolbar.editing };
    });
    ok('60 random clicks (Select, Adjust, Menu) over the toolbar, with Return / Escape: no errors, the selection valid',
      !bad.length && !end.msgs && !end.menus && !end.editing, { bad: bad.slice(0, 5), end });
  }

  // ---------------------------------------------------- the inset
  await ev(() => { const d = window.__doc(); d.win.scrollTo(0, 0); });
  await settle();
  // (the inset: the toolbar's 34 px and the ruler's 24)
  const under = await ev(() => { const w = window.__doc().win; return window.__screen(w.x + 300, w.y + 58 + 3); });
  await page.mouse.click(under.x, under.y);
  await settle();
  const first = await ev(() => { const v = window.__doc().view, L = v.layout; return { head: v.selection.head, id: L.items[0].id }; });
  ok('a click just below the toolbar and ruler puts the caret at the start of the first line', first.head.id === first.id && first.head.off === 0, first);
  const pd = await ev(() => { const w = window.__doc().win; return { h: w.h, sy: w.scrollY }; });
  await page.keyboard.press('PageDown');
  await settle();
  const pd2 = await ev(() => window.__doc().win.scrollY);
  ok('Page Down scrolls by the visible height less the toolbar, the ruler and 32 px', pd2 - pd.sy === pd.h - 58 - 32, { pd, pd2 });
  const hidden = await ev(async () => {
    const d = window.__doc(), v = d.view, L = v.layout, w = d.win;
    const it = L.items[30];
    w.scrollTo(0, it.y - 58 - 2);
    await window.__frames(2);
    return { y: it.y, sy: w.scrollY };
  });
  await clickAt(30, 2);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await settle();
  const cv = await ev(() => { const d = window.__doc(), c = d.view.caretRect(); return { c, sy: d.win.scrollY }; });
  // (24 px inside what can be seen: EditScroll's margin)
  ok('the caret moved up under the toolbar is scrolled back into view below it and the ruler', cv.c.y >= cv.sy + 58 + 24
    && cv.c.y <= cv.sy + 58 + 24 + 1, { hidden, cv });

  // ---------------------------------------------------- formatListeners: once a frame, never after closing
  const fl = await ev(async () => {
    os.vfs.writeFile('RAM::RamDisc0.$.L1', await os.vfs.readFile('RAM::RamDisc0.$.T'), { filetype: 0xA7E });
    const dw = await window.__word().word.open('RAM::RamDisc0.$.L1');
    await window.__frames(2);
    const v = dw.view, L = v.L, h = v.hook();
    let n = 0;
    v.formatListeners.push(() => n++);
    for (let i = 0; i < 6; i++) h.setSelection({ id: L.items[i].id, off: 0 }, { id: L.items[i].id, off: 1 });
    await window.__frames(3);
    const once = n;
    // the document's fonts are found once per change of the document,
    // not each time the font list opens
    const tb = dw.bar.tb, fontList = () => { tb.pane.emit('click', { button: 'select', icon: tb.icon('fontMenu') }); os.wimp.menus.close(); return v._fonts; };
    const f1 = fontList(), f2 = fontList();
    h.type('x');
    const f3 = v._fonts, f4 = fontList();
    const fonts = { same: !!f1 && f1 === f2, dropped: f3 === null, again: !!f4 && f4 !== f1 && f4.join() === f1.join() };
    n = 0;
    for (let i = 0; i < 3; i++) h.setSelection({ id: L.items[i].id, off: 0 }, { id: L.items[i].id, off: 2 });
    dw.close();
    await window.__frames(3);
    return { once, after: n, left: v.formatListeners.length, fonts };
  });
  ok('the font list: the document\'s fonts found once, again only after an edit', fl.fonts.same && fl.fonts.dropped && fl.fonts.again, fl);
  ok('formatListeners: 6 selection changes in one frame -> one call', fl.once === 1, fl);
  ok('... and none after the window closes (listeners cleared)', fl.after === 0 && fl.left === 0, fl);

  // ---------------------------------------------------- a narrow window
  const nar = await ev(async () => {
    const d = window.__doc(), w = d.win;
    w.open({ x: 100, y: 100, w: 240, h: 300, behind: 'top' });
    await window.__frames(3);
    const tb = d.toolbar;
    return { w: w.w, pane: tb.pane.w, width: tb.width };
  });
  ok('in a narrow window (240) the toolbar is as wide as the window, its last buttons cut off', nar.w === 240 && nar.pane === 240 && nar.width > 240, nar);
  await clickIcon('styleMenu');
  const ns = await levelTexts(0);
  await page.keyboard.press('Escape');
  await settle();
  ok('... the buttons that show still work (the style list opens)', ns?.length > 0, ns);
  await ev(() => { window.__doc().win.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top' }); });
  await settle();

  // ---------------------------------------------------- 5000 paragraphs: the refresh cost
  const perf = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Big');
    for (let i = 0; i < 200 && !window.__doc('Big'); i++) await window.__sleep(50);
    const d = window.__doc('Big');
    d.win.open({ x: 120, y: 80, w: 800, h: 400, behind: 'top' });
    await window.__frames(3);
    const dw = window.__word().word.open('RAM::RamDisc0.$.Big');
    const bar = (await dw).bar, v = d.view;
    const times = [];
    for (let i = 0; i < 40; i++) {
      const L = v.layout, it = L.items[(i * 997) % L.items.length];
      if (i % 2) v.setSelection({ id: it.id, off: 3 });
      else { v.type('a'); v.flush(); }
      const t0 = performance.now();
      bar.refresh();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    d.win.emit('close', { preventDefault() {} });
    return { median: times[20], max: times[39] };
  });
  ok('5000 paragraphs: the toolbar\'s refresh after a caret move or a keystroke < 20 ms (median)', perf.median < 20, perf);

  // ---------------------------------------------------- 30 open/close cycles
  const lk = await ev(async () => {
    const t = window.__word();
    const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length];
    let views = [];
    const cycle = async (i) => {
      os.vfs.writeFile('RAM::RamDisc0.$.Cyc', await os.vfs.readFile('RAM::RamDisc0.$.T'), { filetype: 0xA7E });
      const dw = await t.word.open('RAM::RamDisc0.$.Cyc');
      await window.__frames(1);
      const tb = dw.bar.tb;
      dw.view.setSelection(dw.view.sel);
      tb.pane.emit('click', { button: 'select', icon: tb.icon('bold') });
      if (i % 2) tb.pane.emit('click', { button: 'select', icon: tb.icon('color') });
      else tb.pane.emit('click', { button: 'select', icon: tb.icon('sizeMenu') });
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
    return { before, after: count(), menus: os.wimp.menus.isOpen,
      listeners: views.reduce((n, v) => n + v.formatListeners.length + v._panes.length + (v._fraf ? 1 : 0) + (v._raf ? 1 : 0), 0) };
  });
  ok('30 open/format/popup/close cycles leave no windows, popups, listeners or frames behind', same(lk.after.slice(0, 2), lk.before.slice(0, 2))
    && Math.abs(lk.after[2] - lk.before[2]) <= 5 && !lk.menus && lk.listeners === 0, lk);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ---------------------------------------------------- hiDPI (deviceScaleFactor 2)
{
  const { browser: b2, page: p2, logs: l2 } = await launch({ zoom: 2 });
  try {
    const s = await start(p2);
    const r = await p2.evaluate(async () => {
      const d = window.__doc(), v = d.view, L = v.layout;
      v.setSelection({ id: L.items[0].id, off: 0 }, { id: L.items[0].id, off: 5 });
      await window.__frames(2);
      return window.__icon('bold');
    });
    await p2.mouse.click(r.x, r.y);
    await p2.evaluate(() => window.__frames(3));
    await p2.evaluate(() => window.__doc().view.format('color', 'FF0000'));
    await p2.evaluate(() => window.__frames(3));
    const h = await p2.evaluate(() => {
      const tb = window.__doc().toolbar, ic = tb.icon('color'), cv = tb.pane._canvas, k = cv.width / tb.pane.w;
      const px = cv.getContext('2d').getImageData(Math.round((ic.bbox.x0 + ic.bbox.x1) / 2 * k), Math.round((ic.bbox.y1 - 6) * k), 1, 1).data;
      return { k, px: [px[0], px[1], px[2]], bold: tb.pressed('bold'), run: window.__para(0).runs[0] };
    });
    ok('hiDPI: the toolbar works (B clicked) and its colour bar is drawn at double resolution', s.ok && h.k === 2 && h.bold
      && h.run[1].b === true && h.px[0] > 200 && h.px[1] < 40, h);
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
