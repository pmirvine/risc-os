// !Word's list buttons, keys and menus in the real desktop, with real
// clicks and key presses: the toolbar's row 2 Bullets and Numbering
// buttons (on a caret paragraph and on a selection; pressed state
// following the caret; the Numbering popup's gallery; one undo step
// each, redo); Ctrl-Shift-L (and on a Mac: Ctrl-Shift-L works, Cmd-
// Shift-L is not ours); Tab and Shift-Tab changing levels (1. a. i.),
// Enter continuing a list and ending it on an empty item, Backspace at
// an item's start taking the number away; Format > List (Bullets >,
// Numbering > with the entry ticked, Restart at 1, Continue numbering,
// Set numbering value... with its box: Start new list / Continue from
// previous list, bad values, Cancel); both toolbar rows showing every
// button at the A4 window's first width; a new document made a list,
// saved and opened again with the same labels; 30 open / close cycles
// leaking nothing. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const files = {
  Pl: Array.from(await docx(NAMES.map((n) => p(r(n))).join(''))),
  Cy: Array.from(await docx(NAMES.slice(0, 3).map((n) => p(r(n))).join(''))),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const NONE = (n) => Array(n).fill(null);

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
    window.__doc = (leaf = 'Pl') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off, leaf = 'Pl') => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__icon = (name, leaf = 'Pl') => {
      const d = window.__doc(leaf), ic = d.toolbar2.icon(name), rc = ic.el.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    };
    window.__labels = (leaf = 'Pl') => window.__doc(leaf).view.labels();
    window.__select = (a, b = a, leaf = 'Pl') => {
      const d = window.__doc(leaf), bs = d.d.doc.sections[0].blocks;
      d.view.setSelection({ id: bs[a[0]].id, off: a[1] }, { id: bs[b[0]].id, off: b[1] });
    };
    window.__state = (leaf = 'Pl') => {
      const d = window.__doc(leaf);
      return { depth: d.view.undoDepth, title: d.win.title, caret: os.wimp.caret?.window === d.win, msgs: window.__msgs.length,
        bullets: d.toolbar2.pressed('bullets'), numbers: d.toolbar2.pressed('numbers') };
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    await os.filer.run('RAM::RamDisc0.$.Pl');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 60, y: 40, w: 900, h: 560, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!window.__doc() && !!window.__doc().toolbar2.icon('bullets'), labels: window.__labels(), msgs: window.__msgs };
  }, files);
  ok('the document opens, no list; row 2 has the Bullets and Numbering buttons', s0.ok && same(s0.labels, NONE(6)) && !s0.msgs.length, s0);

  const levelItems = (n) => ev((n) => {
    const lv = os.wimp.menus.levels[n];
    const v = (x, it) => (typeof x === 'function' ? !!x(it) : !!x);
    return lv ? lv.rows.map((r) => [String(r.item.text), v(r.item.ticked, r.item), r.shaded, r.item.key ?? null]) : null;
  }, n);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pickRe = async (level, re, { hover = false } = {}) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: re }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item ${re} at level ${level}`);
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
  const pick = (level, text, o) => pickRe(level, new RegExp('^' + esc(text), 'i'), o);
  /** The window menu by a Menu click on a toolbar row (the selection stays), then Format > List. */
  const listMenu = async () => {
    await ev(() => os.wimp.menus.close());
    const ic = await ev(() => { const rc = window.__doc().toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: rc.left + 4, y: rc.top + 4 }; });
    await click(ic, { button: 'middle' });
    await wait(200);
    await pick(0, 'Format', { hover: true });
    await pick(1, 'List', { hover: true });
  };
  const caretAt = async (i, off = 0) => click(await ev(([i, off]) => window.__point(i, off), [i, off]));
  const undoAll = async () => { for (let i = 0; i < 40; i++) { if (!(await ev(() => window.__state().depth))) break; await press('Control+z'); } };

  // ---------------------------------------------------- both rows at the A4 window's first width
  const fit = await ev(async () => {
    const dw = await window.__word().word.newUntitled('A4');
    await window.__frames(3);
    const row = (tb) => [...tb.buttons.keys()].map((n) => [n, tb.icon(n).bbox.x1]);
    const res = { w: dw.win.w, rows: [dw.bar.tb, dw.bar2.tb].map((tb) => ({ need: tb.width, max: Math.max(...row(tb).map((x) => x[1])), n: row(tb).length })),
      names2: [...dw.bar2.tb.buttons.keys()] };
    dw.close();
    await window.__frames(2);
    return res;
  });
  ok('both toolbar rows show every button at the A4 window\'s first width', fit.rows.every((x) => x.max <= fit.w && x.need <= fit.w)
    && same(fit.names2, ['lineSpacing', 'bullets', 'bulletsMenu', 'numbers', 'numbersMenu', 'painter']), fit);

  // ---------------------------------------------------- Bullets: a caret paragraph, pressed state
  await caretAt(0, 2);
  const st0 = await ev(() => window.__state());
  await click(await ev(() => window.__icon('bullets')));
  const b1 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('Bullets on a caret paragraph: its label is a bullet, the others none; pressed in; one undo step; the caret kept',
    same(b1.l, ['•', ...NONE(5)]) && b1.s.bullets && !b1.s.numbers && b1.s.depth === st0.depth + 1 && b1.s.caret && !b1.s.msgs
    && b1.s.title.endsWith(' *'), b1);
  await caretAt(2, 1);
  const b2 = await ev(() => window.__state());
  await caretAt(0, 1);
  const b3 = await ev(() => window.__state());
  ok('... the button follows the caret: out in a plain paragraph, in again in the item', !b2.bullets && b3.bullets, { b2, b3 });
  await click(await ev(() => window.__icon('bullets')));
  const b4 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('... a second click takes the bullet away (one more step), the button out', same(b4.l, NONE(6)) && !b4.s.bullets
    && b4.s.depth === st0.depth + 2, b4);
  await undoAll();

  // ---------------------------------------------------- Bullets on a selection; undo, redo
  await ev(() => window.__select([1, 2], [3, 3]));
  await settle();
  await click(await ev(() => window.__icon('bullets')));
  const s1 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('Bullets on a selection of three paragraphs: all three get a bullet, in one step; pressed in',
    same(s1.l, [null, '•', '•', '•', null, null]) && s1.s.bullets && s1.s.depth === 1, s1);
  await press('Control+z');
  const s2 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  await press('Control+y');
  const s3 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('... undo takes them all away and the button out; redo brings them back', same(s2.l, NONE(6)) && !s2.s.bullets
    && same(s3.l, [null, '•', '•', '•', null, null]) && s3.s.bullets, { s2, s3 });
  await undoAll();

  // ---------------------------------------------------- the Numbering popup
  await ev(() => window.__select([0, 1], [1, 1]));
  await settle();
  await click(await ev(() => window.__icon('numbersMenu')));
  await wait(200);
  const nm = await levelItems(0);
  ok('the Numbering popup: None, then the six numberings as samples', nm && same(nm.map((x) => x[0]), ['None', '1. 2. 3.', '1) 2) 3)',
    'I. II. III.', 'A. B. C.', 'a) b) c)', 'i. ii. iii.']) && nm[0][2] === true && nm.slice(1).every((x) => !x[2] && !x[1]), nm);
  await pickRe(0, /^I\. II\. III\./);
  const n1 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('... choosing I. II. III.: the two paragraphs are I. and II.; one step; Numbering pressed in; the caret kept',
    same(n1.l, ['I.', 'II.', ...NONE(4)]) && n1.s.numbers && !n1.s.bullets && n1.s.depth === 1 && n1.s.caret, n1);
  await click(await ev(() => window.__icon('numbersMenu')));
  await wait(200);
  const nm2 = await levelItems(0);
  ok('... the popup shows I. II. III. ticked and None open', nm2 && same(nm2.filter((x) => x[1]).map((x) => x[0]), ['I. II. III.']) && nm2[0][2] === false, nm2);
  await pickRe(0, /^1\) 2\)/);
  const n2 = await ev(() => window.__labels());
  ok('... choosing 1) switches the list\'s format (a different entry)', same(n2, ['1)', '2)', ...NONE(4)]), n2);
  await click(await ev(() => window.__icon('numbersMenu')));
  await wait(200);
  await pickRe(0, /^None/);
  const n3 = await ev(() => window.__labels());
  ok('... None takes the numbers away', same(n3, NONE(6)), n3);
  await undoAll();
  await click(await ev(() => window.__icon('bulletsMenu')));
  await wait(200);
  const bm = await levelItems(0);
  ok('the Bullets popup: None, then the six bullets, each its glyph and name', bm && bm.length === 7 && bm[0][0] === 'None'
    && ['Disc', 'Circle', 'Square', 'Diamond', 'Arrow', 'Check mark'].every((n, i) => bm[i + 1][0].endsWith(n))
    && bm[1][0].startsWith('•') && bm[2][0].startsWith('o '), bm);
  await ev(() => os.wimp.menus.close());
  await ev(() => window.__select([0, 1], [1, 1]));
  await settle();
  await click(await ev(() => window.__icon('bulletsMenu')));
  await wait(200);
  await pickRe(0, /Circle/);
  const c1 = await ev(() => window.__labels());
  ok('... Circle: the white bullet (U+25E6) is written for the selection (the menu shows a covered hint, o)', same(c1, ['◦', '◦', ...NONE(4)]), c1);
  await undoAll();

  // ---------------------------------------------------- Ctrl-Shift-L
  await caretAt(4, 2);
  await press('Control+Shift+L');
  const k1 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  await press('Control+Shift+L');
  const k2 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('Ctrl-Shift-L makes a bullet list item and again takes it away (one step each; the button follows)',
    same(k1.l, [...NONE(4), '•', null]) && k1.s.bullets && k1.s.depth === 1 && same(k2.l, NONE(6)) && !k2.s.bullets && k2.s.depth === 2, { k1, k2 });
  await ev(() => { window.__doc().dw.view.mac = true; });
  await press('Meta+Shift+L');
  const m1 = await ev(() => window.__labels());
  await press('Control+Shift+L');
  const m2 = await ev(() => window.__labels());
  ok('on a Mac: Cmd-Shift-L is not ours (Safari\'s sidebar); Ctrl-Shift-L works', same(m1, NONE(6)) && same(m2, [...NONE(4), '•', null]), { m1, m2 });
  await ev(() => { window.__doc().dw.view.mac = false; });
  await undoAll();

  // ---------------------------------------------------- Tab, Shift-Tab, Enter, Backspace
  await ev(() => window.__select([0, 0], [2, 3]));
  await settle();
  await click(await ev(() => window.__icon('numbers')));
  const t0 = await ev(() => window.__labels());
  ok('Numbering on three paragraphs: 1. 2. 3.', same(t0, ['1.', '2.', '3.', null, null, null]), t0);
  await caretAt(1, 0);
  await press('Tab');
  const t1 = await ev(() => window.__labels());
  await press('Tab');
  const t2 = await ev(() => window.__labels());
  await press('Shift+Tab');
  const t3 = await ev(() => window.__labels());
  ok('Tab at the start of item 2 demotes it (a.), again (i.); Shift-Tab promotes it back', same(t1, ['1.', 'a.', '2.', null, null, null])
    && same(t2, ['1.', 'i.', '2.', null, null, null]) && same(t3, ['1.', 'a.', '2.', null, null, null]), { t1, t2, t3 });
  await press('Shift+Tab');
  await caretAt(2, 5);
  await press('End');
  await press('Enter');
  const e1 = await ev(() => window.__labels());
  ok('Enter at the end of an item: the new paragraph is item 4.', same(e1, ['1.', '2.', '3.', '4.', null, null, null]), e1);
  await press('Enter');
  const e2 = await ev(() => window.__labels());
  ok('Enter on the empty item ends the list: the empty paragraph has no number', same(e2, ['1.', '2.', '3.', null, null, null, null]), e2);
  await press('Control+z');
  await press('Backspace');
  const bk = await ev(() => ({ l: window.__labels(), n: window.__doc().view.lines().length }));
  ok('Backspace at the start of the empty item takes its number away (the paragraph stays)', same(bk.l, ['1.', '2.', '3.', null, null, null, null]) && bk.n === 7, bk);
  await undoAll();

  // ---------------------------------------------------- Format > List: Restart, Continue, Set numbering value
  await ev(() => window.__select([0, 0], [2, 3]));
  await settle();
  await click(await ev(() => window.__icon('numbers')));
  await ev(() => window.__select([4, 0], [5, 3]));
  await settle();
  await click(await ev(() => window.__icon('numbers')));
  const r0 = await ev(() => window.__labels());
  ok('Numbering again after a gap continues the list before: 1. 2. 3. then 4. 5.', same(r0, ['1.', '2.', '3.', null, '4.', '5.']), r0);
  await caretAt(4, 2);
  await listMenu();
  const lm = await levelItems(2);
  ok('Format > List: Bullets (Ctrl+Shift+L), Numbering, Restart at 1, Continue numbering, Set numbering value..., Demote, Promote, Remove from list; none shaded in a list',
    lm && same(lm.map((x) => x[0]), ['Bullets', 'Numbering', 'Restart at 1', 'Continue numbering', 'Set numbering value...', 'Demote', 'Promote',
      'Remove from list']) && lm[0][3] === 'Ctrl+Shift+L' && lm[5][3] === 'Tab' && lm[6][3] === 'Shift+Tab' && lm.every((x) => !x[2]), lm);
  await pick(2, 'Restart at 1');
  const r1 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('Restart at 1: the second part is 1. 2.; one undo step', same(r1.l, ['1.', '2.', '3.', null, '1.', '2.']) && r1.s.depth === 3, r1);
  await listMenu();
  await pick(2, 'Continue numbering');
  const r2 = await ev(() => window.__labels());
  ok('Continue numbering: 4. 5. again', same(r2, ['1.', '2.', '3.', null, '4.', '5.']), r2);

  // the box
  const box = () => ev(() => { const d = window.__doc(); return d.dw.boxes.has('listvalue') ? window.__word().word.dialog({ key: 'listvalue:' + d.docKey, rows: [] }) : null; });
  const boxIcon = (name) => ev((n) => {
    const d = window.__doc(), w = window.__word().word.dialog({ key: 'listvalue:' + d.docKey, rows: [] }).win, b = w.iconByName(n).bbox;
    return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, name);
  const bvals = () => ev(() => {
    const d = window.__doc(), b = window.__word().word.dialog({ key: 'listvalue:' + d.docKey, rows: [] });
    return { v: b.values(), shaded: b.win.iconByName('value').shaded };
  });
  const setValue = async (text) => {
    await click(await boxIcon('value'));
    await press('End');
    await press('Backspace', 12);
    if (text) { await page.keyboard.type(text); await settle(); }
  };
  await listMenu();
  await pick(2, 'Set numbering value');
  await wait(100);
  await settle();
  const bx = await bvals();
  ok('Set numbering value...: the box opens with Start new list, Value 1', bx.v.mode === 'new' && bx.v.value === 1 && !bx.shaded, bx);
  await setValue('5');
  await click(await boxIcon('button:OK'));
  const v1 = await ev(() => ({ l: window.__labels(), s: window.__state(), open: !!window.__doc().dw.boxes.size && !!document.querySelector('.window.dialog') }));
  ok('... Value 5 and OK: the list restarts at 5. 6.; one more step; the caret back in the document', same(v1.l, ['1.', '2.', '3.', null, '5.', '6.'])
    && v1.s.depth === 5 && v1.s.caret, v1);
  await listMenu();
  await pick(2, 'Set numbering value');
  await wait(100);
  await settle();
  await click(await boxIcon('modeCont'));
  const bc = await bvals();
  ok('... Continue from previous list: Value is shaded', bc.v.mode === 'continue' && bc.shaded, bc);
  await click(await boxIcon('button:OK'));
  const v2 = await ev(() => ({ l: window.__labels(), s: window.__state() }));
  ok('... OK: 4. 5. again', same(v2.l, ['1.', '2.', '3.', null, '4.', '5.']) && v2.s.depth === 6, v2);
  await listMenu();
  await pick(2, 'Set numbering value');
  await wait(100);
  await settle();
  const reopened = await bvals();
  await setValue('abc');
  const bp = await ev(() => window.__beeps);
  await click(await boxIcon('button:OK'));
  const v3 = await ev(() => ({ s: window.__state(), beeps: window.__beeps, open: true, box: !!window.__doc().dw.boxes.get('listvalue').isOpen }));
  ok('... it opens again with Start new list / 1; a Value that is not a number beeps and keeps the box, nothing written',
    reopened.v.mode === 'new' && reopened.v.value === 1 && v3.beeps === bp + 1 && v3.s.depth === 6 && v3.box, { reopened, v3 });
  await setValue('1.2.3');
  await click(await boxIcon('button:OK'));
  const v4 = await ev(() => ({ s: window.__state(), box: !!window.__doc().dw.boxes.get('listvalue')?.isOpen }));
  ok('... a Value like 1.2.3 is refused too', v4.s.depth === 6 && v4.box, v4);
  await setValue('7');
  await click(await boxIcon('button:Cancel'));
  const v5 = await ev(() => ({ l: window.__labels(), s: window.__state(), box: window.__doc().dw.boxes.has('listvalue') }));
  ok('... Cancel changes nothing, the caret goes back to the document', same(v5.l, ['1.', '2.', '3.', null, '4.', '5.']) && v5.s.depth === 6 && v5.s.caret, v5);
  // Word's limit for Start at is 32767: more, and a fraction, are refused (no clamping, no rounding); 32767 is accepted
  const tryValue = async (text) => {
    await listMenu();
    await pick(2, 'Set numbering value');
    await wait(100);
    await settle();
    await setValue(text);
    const got = await bvals();
    const bp = await ev(() => window.__beeps);
    await click(await boxIcon('button:OK'));
    return ev((bp) => ({ shown: window.__doc().dw.boxes.get('listvalue')?.isOpen ?? false, beeps: window.__beeps - bp, l: window.__labels(),
      s: window.__state() }), bp).then((r) => ({ ...r, read: got.v.value }));
  };
  const refused = [];
  for (const t of ['99999999999', '32768', '5.7']) {
    const r = await tryValue(t);
    refused.push([t, r.read, r.shown, r.beeps, r.s.depth, r.l[4]]);
    await click(await boxIcon('button:Cancel'));
  }
  const acc = await tryValue('32767');
  await press('Control+z');
  ok('... 99999999999, 32768 and 5.7 are read as typed (not clamped or rounded) and refused: a beep, the box stays, nothing written',
    same(refused, [['99999999999', 99999999999, true, 1, 6, '4.'], ['32768', 32768, true, 1, 6, '4.'], ['5.7', 5.7, true, 1, 6, '4.']]), refused);
  ok('... 32767 is accepted: the item is 32767., one step (undone)', acc.read === 32767 && !acc.shown && acc.l[4] === '32767.' && acc.s.depth === 7, acc);

  // ---------------------------------------------------- the gallery ticks; Remove from list; Demote
  await listMenu();
  await pick(2, 'Bullets', { hover: true });
  await pickRe(3, /Square/);
  const g1 = await ev(() => window.__labels());
  ok('Format > List > Bullets > Square: the caret paragraph becomes a square bullet (U+25AA); the next item of the old list is 4.', same(g1, ['1.', '2.', '3.', null, '\u25AA', '4.']), g1);
  await listMenu();
  await pick(2, 'Bullets', { hover: true });
  const gi = await levelItems(3);
  ok('... the menu ticks Square (the entry the whole selection has)', gi && same(gi.filter((x) => x[1]).map((x) => x[0].replace(/^\S+\s+/, '')), ['Square']), gi);
  await listMenu();
  await pick(2, 'Numbering', { hover: true });
  const ni = await levelItems(3);
  ok('... and no numbering', ni && ni.every((x) => !x[1]), ni);
  await ev(() => os.wimp.menus.close());
  await undoAll();

  // ---------------------------------------------------- a new document: list, Save, reopen
  const sv = await ev(async () => {
    const w = window.__word().word, dw = await w.newUntitled('A4');
    dw.win.open({ x: 80, y: 60, w: 800, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    const h = dw.view.hook();
    dw.view.focus();
    h.type('One');
    h.press('enter');
    h.type('Two');
    h.press('enter');
    h.type('Three');
    h.flush();
    h.setSelection({ id: dw.d.doc.sections[0].blocks[0].id, off: 0 }, { id: dw.d.doc.sections[0].blocks[1].id, off: 2 });
    h.format('numbering');
    h.setSelection({ id: dw.d.doc.sections[0].blocks[2].id, off: 1 });
    h.format('bullets');
    await window.__frames(2);
    const before = h.labels();
    const res = await dw.saveAs('RAM::RamDisc0.$.Out');
    await window.__frames(3);
    dw.close();
    await window.__frames(3);
    const re = await w.open('RAM::RamDisc0.$.Out');
    await window.__frames(3);
    return { before, res, after: re.view.hook().labels(), lines: re.view.hook().lines(), msgs: window.__msgs.length };
  });
  ok('a new document made a numbered and a bullet list, saved and opened again keeps the labels', same(sv.before, ['1.', '2.', '•'])
    && same(sv.after, sv.before) && same(sv.lines, ['One', 'Two', 'Three']) && !sv.msgs, sv);
  await ev(() => window.__doc('Out')?.dw.close());

  // ---------------------------------------------------- 30 cycles leak nothing
  await ev(() => window.__doc('Pl').dw.close());
  await settle();
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, stack: os.wimp.stack.length };
  });
  const c0 = await counts();
  for (let i = 0; i < 30; i++) {
    await ev(async (i) => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.Cy');
      dw.win.open({ x: 100, y: 60, w: 700, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      dw.view.focus();
      const h = dw.view.hook();
      h.setSelection({ id: dw.d.doc.sections[0].blocks[0].id, off: 0 }, { id: dw.d.doc.sections[0].blocks[2].id, off: 2 });
      h.format(i % 2 ? 'bullets' : 'numbering');
      await window.__frames(1);
    }, i);
    const ic = await ev(() => window.__icon('numbersMenu', 'Cy'));
    await click(ic);
    await wait(60);
    await ev(() => os.wimp.menus.close());
    await listMenu_(i);
    await ev(() => window.__doc('Cy').dw.close());
    await settle();
  }
  async function listMenu_(i) {
    // the Set numbering value box, opened and cancelled (every 3rd), through the menu path
    if (i % 3) return;
    const rc = await ev(() => { const r = window.__doc('Cy').toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; });
    await click(rc, { button: 'middle' });
    await wait(150);
    await pick(0, 'Format', { hover: true });
    await pick(1, 'List', { hover: true });
    await pick(2, 'Set numbering value');
    await wait(100);
    await settle();
    const ic = await ev(() => {
      const d = window.__doc('Cy'), w = window.__word().word.dialog({ key: 'listvalue:' + d.docKey, rows: [] }).win, b = w.iconByName('button:Cancel').bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    });
    await click(ic);
  }
  const c1b = await counts();
  ok('30 open / list / close cycles (a quarter with the Set numbering value box): windows, icons, listeners, menus back to the start', same(c0, c1b), { c0, c1b });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
