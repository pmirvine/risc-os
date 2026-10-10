// !Word's Paragraph dialogue box in the real desktop (Format >
// Paragraph..., Line spacing options... in the Format menu and in
// the toolbar's line spacing popup), with real clicks and keys: the
// box shows the values of one paragraph and empty fields / off
// options for a mixed selection; changing Before and Keep with next
// then OK is one undo step (Ctrl-Z restores both); a Multiple 1.15
// is line 276 auto; At least / Exactly in points; Escape and Cancel
// change nothing; text that is not a value (and an At the screen
// cannot draw) beeps and keeps the box; an untouched mixed field is
// left as it is; one box per document ('para:<docKey>'), each
// applying to its own document, deleted when the document closes;
// the caret returns to the document; 30 open / close cycles leave
// nothing behind. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const body = () => [p(r('First paragraph of the test.')),
  p(r('Second paragraph, centred.'), '<w:jc w:val="center"/><w:spacing w:before="120"/>'),
  p(r('Third paragraph.')), p(r('Fourth paragraph.'))].join('');
const docx = async () => Array.from(await buildDocx({ 'word/document.xml': documentXml(body()) }));
const files = { Pa: await docx(), Pb: await docx() };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const click = async (q, opts) => { await page.mouse.click(q.x, q.y, opts); await wait(60); await settle(); };

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
    window.__doc = (leaf = 'Pa') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off, leaf = 'Pa') => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    /** The open Paragraph box's api of a document (not made if there is none). */
    window.__box = (leaf = 'Pa') => {
      const d = window.__doc(leaf);
      return d && d.dw.boxes.has('para') ? window.__word().word.dialog({ key: 'para:' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name, leaf = 'Pa') => {
      const w = window.__box(leaf).win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__pPr = (i, leaf = 'Pa') => {
      const o = { ...(window.__doc(leaf).d.doc.sections[0].blocks[i].pPr || {}) };
      delete o.extra;
      return o;
    };
    window.__state = (leaf = 'Pa') => {
      const d = window.__doc(leaf);
      return { depth: d.view.undoDepth, title: d.win.title, caret: os.wimp.caret?.window === d.win, msgs: window.__msgs.length };
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    for (const [leaf, x] of [['Pa', 40], ['Pb', 260]]) {
      await os.filer.run('RAM::RamDisc0.$.' + leaf);
      for (let i = 0; i < 100 && !window.__doc(leaf); i++) await window.__sleep(50);
      window.__doc(leaf).win.open({ x, y: 40, w: 640, h: 420, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(3);
    }
    return { ok: !!window.__doc('Pa') && !!window.__doc('Pb'), msgs: window.__msgs };
  }, files);
  ok('two documents open', s0.ok && !s0.msgs.length, s0);

  const levelItems = (n) => ev((n) => {
    const lv = os.wimp.menus.levels[n];
    const v = (x, it) => (typeof x === 'function' ? !!x(it) : !!x);
    return lv ? lv.rows.map((r) => [String(r.item.text), v(r.item.ticked, r.item), r.shaded]) : null;
  }, n);
  const pick = async (level, text, { hover = false } = {}) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
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
  /** The window menu by a Menu click on a toolbar row (the selection stays). */
  const winMenu = async (leaf = 'Pa') => {
    const ic = await ev((l) => { const rc = window.__doc(l).toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: rc.left + 4, y: rc.top + 4 }; }, leaf);
    await click(ic, { button: 'middle' });
    await wait(200);
  };
  const openBox = async (leaf = 'Pa') => {
    await winMenu(leaf);
    await pick(0, 'Format', { hover: true });
    await pick(1, 'Paragraph...');
    await wait(100);
    await settle();
  };
  const vals = () => ev(() => window.__box().values());
  /** Replace the text of a field with real keys. */
  const field = async (name, text, leaf = 'Pa') => {
    await click(await ev(([n, l]) => window.__icon(n, l), [name, leaf]));
    await press('End');
    await press('Backspace', 24);
    if (text) { await page.keyboard.type(text); await settle(); }
  };
  const choose = async (name, text, leaf = 'Pa') => {
    await click(await ev(([n, l]) => window.__icon('arrow:' + n, l), [name, leaf]));
    await wait(150);
    await pick(0, text);
  };

  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, stack: os.wimp.stack.length };
  });
  // ---------------------------------------------------- one paragraph: the values shown
  const c0 = await ev(() => window.__point(0, 3));
  await click(c0);
  const st0 = await ev(() => window.__state());
  const q0 = await ev(() => window.__doc().view.query());
  await openBox();
  const b1 = await ev(() => { const b = window.__box(); return b && { open: b.isOpen, title: b.win.title, v: b.values(),
    invalid: b.invalid(), byShaded: b.win.iconByName('by').shaded, atShaded: b.win.iconByName('at').shaded }; });
  ok('Format > Paragraph... opens the box, titled Paragraph', b1 && b1.open && b1.title === 'Paragraph', b1);
  ok('... it shows the paragraph: left aligned, no indents, no special, single-ish line spacing, widow control on, others off',
    b1 && b1.v.align === 'left' && b1.v.left === 0 && b1.v.right === 0 && b1.v.special === 'none' && b1.v.by === undefined
    && b1.v.before === q0.spaceBefore && b1.v.after === q0.spaceAfter && b1.v.widow === true && b1.v.keepnext === false
    && b1.v.keeplines === false && b1.v.pagebreak === false && b1.v.noctx === false && !b1.invalid.length, b1);
  ok('... By is shaded for None; At for a fixed line spacing or shown in lines', b1 && b1.byShaded
    && (b1.v.spacing === 'multiple' ? !b1.atShaded : b1.atShaded), b1);
  const own = await ev(() => os.wimp.stack.at(-1) === window.__box().win);
  ok('... the box is at the front', own);

  // ---------------------------------------------------- Escape changes nothing
  await press('Escape');
  const e1 = await ev(() => ({ s: window.__state(), gone: window.__box(), boxes: window.__word().word.docs.map((d) => d.dw.boxes.has('para')) }));
  ok('Escape: the box goes, nothing changed (no undo step, no star), the caret back in the document', e1.s.depth === st0.depth
    && !e1.s.title.endsWith(' *') && e1.s.caret && !e1.gone, { e1, st0 });

  // ---------------------------------------------------- Before + Keep with next -> OK: one undo step
  const before0 = await ev(() => window.__pPr(0));
  await openBox();
  await field('before', '12');
  await click(await icon('keepnext'));
  const m1 = await vals();
  ok('typed 12 in Before (points) and clicked Keep with next: read back 240 twips, on', m1.before === 240 && m1.keepnext === true, m1);
  await click(await icon('button:OK'));
  const o1 = await ev(() => ({ p: window.__pPr(0), s: window.__state(), gone: !window.__box() }));
  ok('OK: spacing.before 240 and keepNext written, ONE undo step, the star, the box gone, the caret in the document',
    o1.p.spacing?.before === 240 && o1.p.keepNext === true && o1.s.depth === st0.depth + 1 && o1.s.title.endsWith(' *')
    && o1.gone && o1.s.caret && !o1.s.msgs, { o1, st0 });
  await press('Control+z');
  const u1 = await ev(() => ({ p: window.__pPr(0), s: window.__state() }));
  ok('one Ctrl-Z restores both', same(u1.p, before0) && u1.s.depth === st0.depth, { u1, before0 });
  await press('Control+y');

  // ---------------------------------------------------- reopened: shows the new values; OK unchanged = no step
  await openBox();
  const b2 = await vals();
  ok('opened again it shows Before 12 pt and Keep with next on', b2.before === 240 && b2.keepnext === true, b2);
  const d2 = (await ev(() => window.__state())).depth;
  await click(await icon('button:OK'));
  const o2 = await ev(() => window.__state());
  ok('OK with nothing changed: no undo step', o2.depth === d2 && o2.caret, { o2, d2 });

  // ---------------------------------------------------- Multiple 1.15 -> 276 auto; At least, Exactly
  await openBox();
  await choose('spacing', 'Multiple');
  const mu = await ev(() => { const b = window.__box(); return { v: b.values(), shaded: b.win.iconByName('at').shaded, unit: b.win.iconByName('atunit').text }; });
  ok('picking Multiple enables At (shown in lines, 3 to start)', mu.v.spacing === 'multiple' && mu.v.at === 3 && !mu.shaded && mu.unit === 'lines', mu);
  await field('at', '1.15');
  await press('Enter');
  const o3 = await ev(() => ({ p: window.__pPr(0), s: window.__state(), gone: !window.__box() }));
  ok('Return (OK): line 276, lineRule auto; one step', same(o3.p.spacing, { before: 240, line: 276, lineRule: 'auto' }) && o3.gone
    && o3.s.depth === d2 + 1, o3);
  await openBox();
  const b3 = await vals();
  ok('... shown again as Multiple 1.15', b3.spacing === 'multiple' && b3.at === 1.15, b3);
  await choose('spacing', 'At least');
  const al = await ev(() => { const b = window.__box(); return { v: b.values(), unit: b.win.iconByName('atunit').text }; });
  ok('picking At least: At in points (12), unit pt', al.v.spacing === 'atleast' && al.v.at === 12 && al.unit === 'pt', al);
  await field('at', '14');
  await click(await icon('button:OK'));
  const o4 = await ev(() => window.__pPr(0));
  ok('At least 14 pt: line 280, lineRule atLeast', same(o4.spacing, { before: 240, line: 280, lineRule: 'atLeast' }), o4);
  await openBox();
  await choose('spacing', 'Exactly');
  await field('at', '13.5');
  await click(await icon('button:OK'));
  const o5 = await ev(() => window.__pPr(0));
  ok('Exactly 13.5 pt: line 270, lineRule exact', same(o5.spacing, { before: 240, line: 270, lineRule: 'exact' }), o5);
  await openBox();
  await choose('spacing', 'Double');
  const dbl = await ev(() => ({ shaded: window.__box().win.iconByName('at').shaded, v: window.__box().values() }));
  await click(await icon('button:OK'));
  const o6 = await ev(() => window.__pPr(0));
  ok('Double: At shaded; line 480 auto', dbl.shaded && same(o6.spacing, { before: 240, line: 480, lineRule: 'auto' }), { dbl, o6 });

  // ---------------------------------------------------- Special: hanging / first line
  await openBox();
  await choose('special', 'Hanging');
  const hg = await ev(() => ({ v: window.__box().values(), shaded: window.__box().win.iconByName('by').shaded }));
  await field('left', '1');
  await field('by', '0.5');
  await click(await icon('button:OK'));
  const o7 = await ev(() => window.__pPr(0));
  ok('Hanging 0.5" with Left 1": ind left 1440, hanging 720 (By starts at half an inch)', hg.v.special === 'hanging' && hg.v.by === 720
    && !hg.shaded && same(o7.ind, { left: 1440, hanging: 720 }), { hg, o7 });
  await openBox();
  await choose('special', 'First line');
  await click(await icon('button:OK'));
  const o8 = await ev(() => window.__pPr(0));
  ok('First line (By kept): firstLine 720 and hanging gone (one property)', same(o8.ind, { left: 1440, firstLine: 720 }), o8);
  await openBox();
  await choose('special', '(none)');
  const nn = await ev(() => ({ by: window.__box().values().by, shaded: window.__box().win.iconByName('by').shaded }));
  await click(await icon('button:OK'));
  const o9 = await ev(() => window.__pPr(0));
  ok('(none): By emptied and shaded; the first line is 0', nn.by === undefined && nn.shaded && o9.ind?.firstLine === undefined
    && o9.ind?.hanging === undefined && o9.ind?.left === 1440, { nn, o9 });

  // ---------------------------------------------------- bad text: beep, the box stays
  await openBox();
  const dBad = (await ev(() => window.__state())).depth;
  await field('left', '1.5.5');
  const bp0 = await ev(() => window.__beeps);
  const bv = await vals();
  await click(await icon('button:OK'));
  const bad1 = await ev(() => ({ open: !!window.__box() && window.__box().isOpen, beeps: window.__beeps, s: window.__state(),
    caretIn: os.wimp.caret?.icon?.name }));
  ok('Left "1.5.5": reads null; OK beeps, the box stays with the caret in Left, nothing changed', bv.left === null && bad1.open
    && bad1.beeps === bp0 + 1 && bad1.s.depth === dBad && bad1.caretIn === 'left', { bv, bad1, bp0 });
  await field('left', '0');
  await choose('spacing', 'Multiple');
  await field('at', '9');
  await click(await icon('button:OK'));
  const bad2 = await ev(() => ({ open: !!window.__box(), beeps: window.__beeps, s: window.__state(), at: window.__box().values().at }));
  ok('Multiple 9 lines (more than the screen draws, 0.5..4): beeps, the box stays', bad2.open && bad2.beeps === bp0 + 2
    && bad2.s.depth === dBad, bad2);
  await field('at', '0.4');
  await click(await icon('button:OK'));
  const bad3 = await ev(() => ({ open: !!window.__box(), beeps: window.__beeps }));
  ok('... 0.4 lines too', bad3.open && bad3.beeps === bp0 + 3, bad3);
  await click(await icon('button:Cancel'));
  const cx = await ev(() => ({ gone: !window.__box(), s: window.__state() }));
  ok('Cancel: nothing changed, the box goes', cx.gone && cx.s.depth === dBad && cx.s.caret, cx);

  // ---------------------------------------------------- At up to 1584 pt; more is refused, not clamped
  await openBox();
  await choose('spacing', 'Exactly');
  await field('at', '2000');
  const bpA = await ev(() => window.__beeps);
  const rd = await ev(() => window.__box().values().at);
  await click(await icon('button:OK'));
  const at1 = await ev(() => ({ open: !!window.__box(), beeps: window.__beeps, s: window.__state(), p: window.__pPr(0) }));
  ok('Exactly 2000 pt: read back as 2000 (not clamped), OK beeps, the box stays, nothing written', rd === 2000
    && at1.open && at1.beeps === bpA + 1 && at1.s.depth === dBad && at1.p.spacing?.lineRule !== 'exact', { rd, at1, bpA });
  await field('at', '1584');
  await click(await icon('button:OK'));
  const at2 = await ev(() => ({ open: !!window.__box(), p: window.__pPr(0), s: window.__state() }));
  ok('... 1584 pt is accepted: line 31680 exact, one step', !at2.open && at2.p.spacing?.line === 31680 && at2.p.spacing?.lineRule === 'exact'
    && at2.s.depth === dBad + 1, at2);
  await press('Control+z');

  // ---------------------------------------------------- the selection moved while the box was open
  await click(await ev(() => window.__point(0, 3)));
  await openBox();
  await field('after', '7');
  await ev(() => { const d = window.__doc(), bs = d.d.doc.sections[0].blocks; d.view.setSelection({ id: bs[2].id, off: 1 }); });
  await settle();
  const sd = (await ev(() => window.__state())).depth;
  const sb = await ev(() => window.__beeps);
  await click(await icon('button:OK'));
  const st1 = await ev(() => ({ open: !!window.__box(), beeps: window.__beeps, s: window.__state(), after: window.__box().values().after,
    q: window.__doc().view.query().spaceAfter }));
  ok('selection changed while open: OK beeps, nothing written, the box stays filled from the new paragraph', st1.open && st1.beeps === sb + 1
    && st1.s.depth === sd && st1.after === st1.q, st1);
  await click(await icon('button:Cancel'));

  // ---------------------------------------------------- a mixed selection
  await ev(() => { const d = window.__doc(), bs = d.d.doc.sections[0].blocks; d.view.setSelection({ id: bs[0].id, off: 3 }, { id: bs[1].id, off: 4 }); });
  await settle();
  const mq = await ev(() => window.__doc().view.query());
  const mp0 = await ev(() => [window.__pPr(0), window.__pPr(1)]);
  await openBox();
  const mx = await ev(() => { const b = window.__box(); return { v: b.values(), text: ['align', 'before'].map((n) => b.win.iconByName(n).text) }; });
  ok('two paragraphs that differ: Alignment and Before are empty (undefined), the agreeing fields shown', mq.align === null
    && mx.v.align === undefined && mx.v.before === undefined && mx.text[0] === '' && mx.text[1] === ''
    && mx.v.widow === true && mx.v.left === undefined && mx.v.right === 0, { mq, mx });
  await click(await icon('keeplines'));
  await click(await icon('button:OK'));
  const mo = await ev(() => ({ p: [window.__pPr(0), window.__pPr(1)], s: window.__state() }));
  ok('OK after Keep lines together only: both get keepLines; Alignment and Before left as they were (one step)',
    mo.p[0].keepLines === true && mo.p[1].keepLines === true && mo.p[1].jc === 'center' && mo.p[0].jc === undefined
    && mo.p[0].spacing?.before === 240 && mo.p[1].spacing?.before === 120 && mo.s.depth === dBad + 1, { mo, mp0 });
  // an empty mixed field filled in applies to both
  await openBox();
  await choose('align', 'Right');
  await click(await icon('button:OK'));
  const ma = await ev(() => [window.__pPr(0).jc, window.__pPr(1).jc]);
  ok('... picking an alignment for the mixed selection sets it for both', same(ma, ['right', 'right']), ma);

  // ---------------------------------------------------- the Format menu, the toolbar popup
  await click(await ev(() => window.__point(2, 3)));
  await winMenu();
  await pick(0, 'Format', { hover: true });
  await pick(1, 'Line spacing', { hover: true });
  const ls = await levelItems(2);
  ok('Format > Line spacing: "Line spacing options..." is no longer shaded', ls && ls.find((x) => x[0] === 'Line spacing options...')[2] === false, ls);
  await pick(2, 'Line spacing options');
  await wait(100);
  await settle();
  const via = await ev(() => !!window.__box() && window.__box().isOpen);
  ok('... choosing it opens the Paragraph box', via);
  await press('Escape');
  const ic = await ev(() => { const rc = window.__doc().toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }; });
  await click(ic);
  await wait(200);
  await pick(0, 'Line spacing options');
  await wait(100);
  await settle();
  const via2 = await ev(() => ({ open: !!window.__box() && window.__box().isOpen, s: window.__state() }));
  ok('the toolbar\'s line spacing popup has the same item and opens the box too; the caret then in the box', via2.open, via2);
  await press('Escape');

  // ---------------------------------------------------- one box per document
  await click(await ev(() => window.__point(3, 2)));
  await openBox('Pa');
  await ev(() => { const d = window.__doc('Pb'); d.win.bringToFront?.(); });
  await click(await ev(() => window.__point(0, 2, 'Pb')));
  await openBox('Pb');
  const two = await ev(() => ({ a: !!window.__box('Pa'), b: !!window.__box('Pb'), same: window.__box('Pa') !== window.__box('Pb'),
    keys: [window.__doc('Pa').docKey, window.__doc('Pb').docKey] }));
  ok('a second document has a box of its own beside the first (keys para:<docKey>)', two.a && two.b && two.same && two.keys[0] !== two.keys[1], two);
  const pbBefore = await ev(() => window.__pPr(0, 'Pb'));
  await field('before', '6', 'Pb');
  await click(await icon('button:OK', 'Pb'));
  const pa2 = await ev(() => ({ pb: window.__pPr(0, 'Pb'), pa3: window.__pPr(3, 'Pa'), still: !!window.__box('Pa'), pbBox: !!window.__box('Pb') }));
  ok('OK in the second applies to the second document only; the first box stays open', pa2.pb.spacing?.before === 120 && pa2.pa3.spacing === undefined
    && pa2.still && !pa2.pbBox && pbBefore.spacing === undefined, { pa2, pbBefore });
  const pre = await counts();
  const closed = await ev(async () => {
    const bx = window.__box('Pa'), w = bx.win;
    window.__doc('Pa').dw.close();
    await window.__frames(3);
    return { docs: window.__word().word.docs.length, gone: bx.gone, inWimp: [...os.wimp.windows].includes(w),
      inTask: [...window.__word().windows].includes(w), wins: os.wimp.windows.size };
  });
  const post = await counts();
  ok('closing a document deletes its box: the box is gone, its window in no list, windows and icons fewer, no listeners added', closed.docs === 1
    && closed.gone && !closed.inWimp && !closed.inTask && post.win <= pre.win - 2 && post.task <= pre.task - 2 && post.wl <= pre.wl
    && post.tl <= pre.tl && post.icons < pre.icons, { closed, pre, post });

  // ---------------------------------------------------- the remaining document, a caret in its second paragraph
  await ev(() => window.__doc('Pb').dw.view.focus());
  await click(await ev(() => window.__point(1, 2, 'Pb')));

  // ---------------------------------------------------- leaks: 30 cycles
  const base = await counts();
  for (let i = 0; i < 30; i++) {
    await openBox('Pb');
    const how = i % 3;
    if (how === 0) {
      await click(await ev(() => window.__icon('keepnext', 'Pb')));
      await press('Enter');
    } else if (how === 1) await press('Escape');
    else await click(await ev(() => window.__icon('button:Cancel', 'Pb')));
  }
  await ev(() => window.__frames(4));
  const end = await counts();
  ok('30 open / close cycles of the box (Return with a change, Escape, Cancel): no windows, icons, listeners or menus left',
    end.win === base.win && end.task === base.task && end.icons === base.icons && end.wl === base.wl && end.tl === base.tl
    && !end.menus && end.stack === base.stack, { base, end });
  const fin = await ev(() => ({ kk: window.__pPr(1, 'Pb').keepNext, msgs: window.__msgs }));
  ok('... the ten Returns toggled Keep with next on and off, and no errors were reported', fin.kk === undefined && !fin.msgs.length, fin);

  async function icon(name, leaf = 'Pa') { return ev(([n, l]) => window.__icon(n, l), [name, leaf]); }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
