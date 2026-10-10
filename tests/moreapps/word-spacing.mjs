// !Word's line spacing and space before / after in the real desktop:
// Word's keys (Ctrl-2 double, Ctrl-5 one and a half, Ctrl-1 single,
// Ctrl-0 12 pt before on and off) with real key presses, each one
// undo step with the dirty star; the line pitch drawn on the canvas
// at 1.0 against 2.0 (ink rows of a wrapped paragraph); the Format
// menu's Line spacing submenu (its ticks and the space items'
// shading, a choice applied); the toolbar's line spacing button on
// row 2 opening the same menu with a real click (the caret kept in
// the document); the keys doing nothing in a document with no
// paragraph to format; on a Mac, Ctrl-1 (not Cmd-1) works; and in a
// 50,000-paragraph document select all + Ctrl-2 under 5 s and its
// undo under 5 s, one step each. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const LONG = 'Line spacing moves the lines of a paragraph further apart or closer together, and Word ' +
  'measures it from one baseline to the next, so a paragraph set double takes twice the room on the page.';
const PARAS = [p(r(LONG + ' ' + LONG)), p(r('Second paragraph.')), p(r('Third paragraph.')),
  ...Array.from({ length: 20 }, (_, i) => p(r(`Filler ${i} with a few words.`)))];
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' + p(r('cell')) +
  '</w:tc></w:tr></w:tbl>';
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const files = {
  Sp: Array.from(await docx(PARAS.join(''))),
  Tbl: Array.from(await docx(TBL)),
  Huge: Array.from(await docx(Array.from({ length: 50000 }, (_, i) => p(r(`${i} some words`))).join(''))),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf = 'Sp') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off, leaf = 'Sp') => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__icon = (name, leaf = 'Sp') => {
      const d = window.__doc(leaf), ic = d.toolbar2.icon(name), rc = ic.el.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    };
    window.__pPr = (i, leaf = 'Sp') => {
      const b = window.__doc(leaf).d.doc.sections[0].blocks[i];
      const o = { ...(b.pPr || {}) };
      delete o.extra;
      return o;
    };
    window.__state = (leaf = 'Sp') => {
      const d = window.__doc(leaf);
      return { depth: d.view.undoDepth, title: d.win.title, caret: os.wimp.caret?.window === d.win,
        msgs: window.__msgs.length };
    };
    /** The canvas rows (work-area y, rounded) where paragraph i's first two lines start to have ink. */
    window.__pitch = (i, leaf = 'Sp') => {
      const d = window.__doc(leaf), L = d.view.layout, it = L.items[i], win = d.win, cv = win._canvas, k = cv.width / win.w;
      const y0 = it.y + it.lines[0].y, y1 = it.y + it.lines[2].y + it.lines[2].h;
      const img = cv.getContext('2d').getImageData(Math.round((L.left - win.scrollX) * k),
        Math.round((y0 - win.scrollY) * k), Math.round(L.textW * k), Math.round((y1 - y0) * k));
      const rows = [];
      for (let j = 0; j < img.height; j++) {
        let ink = false;
        for (let q = 0; q < img.width && !ink; q++) {
          const a = (j * img.width + q) * 4;
          if (img.data[a] + img.data[a + 1] + img.data[a + 2] < 300) ink = true;
        }
        rows.push(ink);
      }
      // the starts of the runs of inked rows, in canvas pixels
      const starts = [];
      rows.forEach((v, j) => { if (v && !rows[j - 1]) starts.push(j); });
      return { starts, k, layout: it.lines[1].y - it.lines[0].y, n: it.lines.length };
    };
    await os.filer.run('RAM::RamDisc0.$.Sp');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 60, y: 40, w: 900, h: 560, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d && !!d.toolbar2, msgs: window.__msgs };
  }, files);
  ok('the document opens with two toolbar rows', s0.ok && !s0.msgs.length, s0);

  // ---------------------------------------------------- keys
  const c = await ev(() => window.__point(0, 3));
  await page.mouse.click(c.x, c.y);
  await settle();
  const st0 = await ev(() => window.__state());
  const p1 = await ev(() => window.__pitch(0));
  await press('Control+2');
  const k2 = await ev(() => window.__pPr(0)), st2 = await ev(() => window.__state());
  const p2 = await ev(() => window.__pitch(0));
  ok('Ctrl-2: double line spacing written (line 480, lineRule auto), one undo step, the dirty star', same(k2.spacing, { line: 480, lineRule: 'auto' })
    && st2.depth === st0.depth + 1 && st2.title.endsWith(' *') && st2.caret && !st2.msgs, { k2, st0, st2 });
  const gap = (x) => x.starts[1] - x.starts[0];
  ok('... the lines drawn twice as far apart (canvas ink rows; layout pitch doubled)', p1.n >= 3 && p2.n >= 3
    && p1.starts.length >= 2 && p2.starts.length >= 2 && Math.abs(gap(p2) - 2 * gap(p1)) <= 2 * p1.k
    && Math.abs(p2.layout - 2 * p1.layout) < 0.01, { p1, p2 });
  await press('Control+5');
  const k5 = await ev(() => window.__pPr(0));
  await press('Control+1');
  const k1 = await ev(() => window.__pPr(0)), st1 = await ev(() => window.__state());
  ok('Ctrl-5 one and a half (360), Ctrl-1 single (the default: nothing written)', same(k5.spacing, { line: 360, lineRule: 'auto' })
    && k1.spacing === undefined && st1.depth === st0.depth + 3, { k5, k1, st1 });
  await press('Control+0');
  const z1 = await ev(() => window.__pPr(0)), q1 = await ev(() => window.__doc().view.query().spaceBefore);
  await press('Control+0');
  const z2 = await ev(() => window.__pPr(0)), st3 = await ev(() => window.__state());
  ok('Ctrl-0: 12 pt before, again: none (one step each)', same(z1.spacing, { before: 240 }) && q1 === 240
    && z2.spacing === undefined && st3.depth === st0.depth + 5, { z1, z2, st3 });
  await press('Control+z', 4);
  const u = await ev(() => window.__pPr(0));
  ok('undo: one key press per command (back to double after 4)', same(u.spacing, { line: 480, lineRule: 'auto' }), u);
  await press('Control+z');
  const u0 = await ev(() => ({ p: window.__pPr(0), s: window.__state() }));
  ok('... and back to the opened paragraph', u0.p.spacing === undefined && u0.s.depth === st0.depth, u0);

  // ---------------------------------------------------- the Format menu
  const levelItems = (n) => ev((n) => {
    const lv = os.wimp.menus.levels[n];
    const v = (x, it) => (typeof x === 'function' ? !!x(it) : !!x);
    return lv ? lv.rows.map((r) => [String(r.item.text), v(r.item.ticked, r.item), r.shaded]) : null;
  }, n);
  const pick = async (level, text, { hover = false } = {}) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text.replace('.', '\\.'), 'i') }).first();
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
    await settle();
  };
  await press('Control+2');
  const pt = await ev(() => window.__point(1, 2));
  await page.mouse.click(pt.x, pt.y + 30, { button: 'middle' });
  await wait(250);
  await pick(0, 'Format', { hover: true });
  await pick(1, 'Line spacing', { hover: true });
  const m = await levelItems(2);
  const ticked = m ? m.filter((x) => x[1]).map((x) => x[0]) : null;
  const shaded = m ? Object.fromEntries(m.map((x) => [x[0], x[2]])) : {};
  ok('Format > Line spacing: 1.0 .. 3.0, the paragraph\'s 2.0 ticked; Add space before open, Remove shaded; options open (the Paragraph box)',
    m && same(m.slice(0, 6).map((x) => x[0]), ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0']) && same(ticked, ['2.0'])
    && shaded['Add space before'] === false && shaded['Remove space before'] === true
    && shaded['Line spacing options...'] === false, m);
  await pick(2, '1.15');
  const mm = await ev(() => ({ p: window.__pPr(0), s: window.__state(), open: os.wimp.menus.isOpen }));
  ok('... choosing 1.15: line 276, one step, the caret still in the document', same(mm.p.spacing, { line: 276, lineRule: 'auto' })
    && mm.s.depth === st0.depth + 2 && mm.s.caret, mm);
  await page.mouse.click(pt.x, pt.y + 30, { button: 'middle' });
  await wait(250);
  await pick(0, 'Format', { hover: true });
  await pick(1, 'Line spacing', { hover: true });
  await pick(2, 'Add space after');
  const sa = await ev(() => window.__pPr(0));
  ok('... Add space after: 12 pt below (after 240)', same(sa.spacing, { line: 276, lineRule: 'auto', after: 240 }), sa);
  await ev(() => os.wimp.menus.close());

  // ---------------------------------------------------- the toolbar's button (row 2)
  const ic = await ev(() => window.__icon('lineSpacing'));
  await page.mouse.click(ic.x, ic.y);
  await wait(200);
  await settle();
  const tm = await levelItems(0);
  ok('the line spacing button on row 2 opens the same menu (1.15 ticked)', tm && tm[0][0] === '1.0'
    && same(tm.filter((x) => x[1]).map((x) => x[0]), ['1.15']), tm);
  await pick(0, '3.0');
  const tb = await ev(() => ({ p: window.__pPr(0), s: window.__state() }));
  ok('... choosing 3.0: line 720; the caret kept in the document', same(tb.p.spacing, { line: 720, lineRule: 'auto', after: 240 })
    && tb.s.caret && tb.s.depth === st0.depth + 4, tb);
  const sh = await ev(async () => {
    const ic2 = window.__doc().toolbar2.icon('lineSpacing'), img = ic2.el.querySelector('img');
    if (!img) return { sprite: String(ic2.spriteName ?? ''), img: false };
    if (!img.complete) await new Promise((res) => { img.onload = res; img.onerror = res; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] + d[i + 1] + d[i + 2] < 384) ink++;
    return { sprite: String(ic2.spriteName ?? ''), img: true, w: c.width, ink };
  });
  ok('... it draws the wb_spacing sprite (an image with ink in it)', sh.sprite === 'wb_spacing' && sh.img && sh.w >= 16
    && sh.ink >= 8, sh);

  // ---------------------------------------------------- Mac: Ctrl-1, not Cmd-1
  await ev(() => { window.__doc().dw.view.mac = true; });
  await press('Meta+1');
  const mc = await ev(() => window.__pPr(0));
  await press('Control+1');
  const mc1 = await ev(() => ({ p: window.__pPr(0), s: window.__state() }));
  ok('Mac: Cmd-1 is not ours; Ctrl-1 sets single spacing', same(mc.spacing, { line: 720, lineRule: 'auto', after: 240 })
    && same(mc1.p.spacing, { after: 240 }) && mc1.s.depth === st0.depth + 5, { mc, mc1 });
  await ev(() => { window.__doc().dw.view.mac = false; });

  // ---------------------------------------------------- no paragraph: nothing
  const nt = await ev(async () => {
    const dw = await window.__word().word.open('RAM::RamDisc0.$.Tbl');
    dw.win.open({ x: 120, y: 80, w: 700, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(2);
    dw.view.focus();
    await window.__frames(1);
    return { sel: dw.view.sel, depth: dw.d.undoDepth };
  });
  for (const k of ['Control+1', 'Control+2', 'Control+5', 'Control+0']) await press(k);
  const nt1 = await ev(() => { const d = window.__doc('Tbl'); return { depth: d.view.undoDepth, title: d.win.title, msgs: window.__msgs.length }; });
  ok('a document with no paragraph (a table only): Ctrl-1/2/5/0 change nothing', nt1.depth === 0
    && !nt1.title.endsWith(' *') && !nt1.msgs, { nt, nt1 });
  await ev(() => window.__doc('Tbl').dw.close());

  // ---------------------------------------------------- 50,000 paragraphs
  const o = await ev(async () => {
    const t0 = performance.now();
    const dw = await window.__word().word.open('RAM::RamDisc0.$.Huge');
    dw.win.open({ x: 100, y: 60, w: 860, h: 480, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(2);
    dw.view.focus();
    return { open: Math.round(performance.now() - t0), n: dw.d.doc.sections[0].blocks.length };
  });
  await page.keyboard.press('Control+a');
  const steps = [];
  for (const [what, key] of [['Ctrl-2', 'Control+2'], ['undo', 'Control+z']]) {
    const depth = await ev(() => window.__doc('Huge').view.undoDepth);
    const t0 = Date.now();
    await page.keyboard.press(key);
    const s = await ev(async () => {
      const d = window.__doc('Huge');
      d.view.flush();
      await window.__frames(1);
      const bs = d.d.doc.sections[0].blocks;
      return { depth: d.view.undoDepth, line: [bs[0], bs[25000], bs[49999]].map((b) => b.pPr.spacing?.line ?? null),
        h: d.view.layout.items[49999].lines[0].h, msgs: window.__msgs.length };
    });
    steps.push({ what, ms: Date.now() - t0, step: s.depth - depth, ...s });
  }
  const [c2, cu] = steps;
  console.log(`# 50,000 paragraphs opened in ${o.open} ms; select all + Ctrl-2 ${c2.ms} ms, undo ${cu.ms} ms`);
  ok('50,000 paragraphs: select all + Ctrl-2 under 5 s, one step, every paragraph double (laid out too)', o.n === 50000
    && c2.ms < 5000 && c2.step === 1 && same(c2.line, [480, 480, 480]) && Math.abs(c2.h - 2 * cu.h) < 0.01 && !c2.msgs, { o, c2 });
  ok('... undo under 5 s, one step, all single again', cu.ms < 5000 && cu.step === -1 && same(cu.line, [null, null, null]), cu);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
