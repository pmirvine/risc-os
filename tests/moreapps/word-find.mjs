// !Word's Find and Replace in the real desktop (./EditFind, WimpLib
// Ui/FindBox): Ctrl-F, F4 and Ctrl-H by real key presses open the one
// Find box (a short one-line selection put in Find); typing and
// Return find and select the next match, scrolled into view; Find
// previous, the wrap message, Replace (the current match, then the
// next), Replace all (a count, one undo step), Match case and Whole
// words clicked; Escape and Close give the caret back to the document
// (typing works); the box works on the document last clicked in, and
// says so when that document is gone; Ctrl-G / Ctrl-Shift-G in the
// document and in the box; the Edit menu items; link text found but
// not replaced; messages; hostile: Replace all of 10,000 matches,
// regular expression characters, a 1 MB needle cut to 1000
// characters, a long paste into the field; leaks over 30 open / close
// cycles; Cmd-F, Cmd-G on a Mac (navigator.platform injected), Cmd-H
// not Replace. Needs the disc built by tools/disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r, REL } from './build-docx.mjs';

const LINK = '<w:hyperlink r:id="rIdL"><w:r><w:t>cat link</w:t></w:r></w:hyperlink>';
const ALPHA = [
  p(r('The cat sat on the mat.')),                 // 0
  p(r('A Cat and a concat cat.')),                 // 1
  p(r('See the ') + LINK + r(' here.')),           // 2
  p(r('Regex a.*b (x) [y] and a.b.')),             // 3
  ...Array.from({ length: 200 }, (_, i) => p(r(`Filler line ${i}.`))),
  p(r('The far needle is here.')),                 // 204
];
const files = {
  Alpha: Array.from(await buildDocx({ 'word/document.xml': documentXml(ALPHA.join('')) },
    { docRels: [['rIdL', REL('hyperlink'), 'http://example.com/', 'External']] })),
  Beta: Array.from(await buildDocx({ 'word/document.xml': documentXml([p(r('Beta has a cat too.')), p(r('And a dog.'))].join('')) })),
  Many: Array.from(await buildDocx({ 'word/document.xml': documentXml(Array.from({ length: 1000 }, () =>
    p(r('ab ab ab ab ab ab ab ab ab ab'))).join('')) })),
};

const out = [];
const live = (s) => { if (process.env.LIVE) console.error(s.slice(0, 600)); };
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); live(out.at(-1)); };
const info = (s) => { out.push('INFO ' + s); live(out.at(-1)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** Boot with navigator.platform = platform, the files on the RAM disc, open the given ones side by side. */
async function start(page, platform, open) {
  await page.addInitScript((pf) => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => pf, configurable: true }); }, platform);
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  return page.evaluate(async ([files, open]) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__find = () => window.__word().word.find;
    window.__box = () => window.__find().box;
    window.__boxes = () => [...os.wimp.windows].filter((w) => w.iconByName?.('button:Replace all'));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (leaf, i, off) => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      d.win.bringToFront();
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    /** The middle of a named icon of the Find box. */
    window.__icon = (name) => {
      const w = window.__box().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__sel = (leaf, i, o, j = i, o2 = o) => {
      const d = window.__doc(leaf), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    window.__st = (leaf) => {
      const d = window.__doc(leaf), v = d.view, L = v.layout, s = v.selection, ix = (q) => L.byId.get(q.id)?.index;
      return { a: [ix(s.anchor), s.anchor.off], h: [ix(s.head), s.head.off], text: v.text(), depth: v.undoDepth, dirty: v.dirty };
    };
    window.__state = () => {
      const b = window.__box(), c = os.wimp.caret;
      return { open: b.isOpen, find: b.find, replace: b.replace, matchCase: b.matchCase, whole: b.whole, msg: b.message,
        caretIn: c?.window === b.win ? (c.icon?.name ?? 'win') : (c?.window?.title ?? null), boxes: window.__boxes().length };
    };
    let x = 20;
    for (const n of open) {
      await os.filer.run(`RAM::RamDisc0.$.${n}`);
      for (let i = 0; i < 200 && !window.__doc(n); i++) await window.__sleep(50);
      window.__doc(n).win.open({ x, y: 60, w: 470, h: 380, behind: 'top', scrollX: 0, scrollY: 0 });
      x += 490;
    }
    await window.__frames(3);
    return { ok: open.every((n) => window.__doc(n)), msgs: window.__msgs };
  }, [files, open]);
}

// ===================================================================== main run (not a Mac)
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const clickDoc = async (leaf, i, off) => { const q = await ev(([l, i, o]) => window.__point(l, i, o), [leaf, i, off]); await page.mouse.click(q.x, q.y); await wait(60); };
const clickIcon = async (name) => { const q = await ev((n) => window.__icon(n), name); await page.mouse.click(q.x, q.y); await wait(60); await settle(); };
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const st = (leaf) => ev((l) => window.__st(l), leaf);
const state = () => ev(() => window.__state());
const run = (action, f) => ev(([a, f]) => window.__find().run(a, f), [action, f]);
const sel = (leaf, i, o, j = i, o2 = o) => ev((a) => window.__sel(...a), [leaf, i, o, j, o2]);
const snap = (leaf) => ev((l) => JSON.stringify(window.__doc(l).d.doc.sections), leaf);
try {
  const s0 = await start(page, 'Linux x86_64', ['Alpha', 'Beta']);
  ok('Alpha and Beta open', s0.ok && !s0.msgs.length, s0);
  const base = await ev(() => ({ windows: os.wimp.windows.size }));

  // ---------------------------------------------------- Ctrl-F: the box, the selection put in Find
  await clickDoc('Alpha', 0, 1);
  await sel('Alpha', 0, 4, 0, 7);
  await press('Control+f');
  const f1 = await state();
  ok('Ctrl-F opens the one Find box with the caret in Find and the selection ("cat") in it', f1.open && f1.boxes === 1
    && f1.caretIn === 'find' && f1.find === 'cat' && f1.msg === '', f1);
  ok('... one more window only', (await ev(() => os.wimp.windows.size)) === base.windows + 1);

  // ---------------------------------------------------- Return finds the next and selects it
  await press('Enter');
  const n1 = await st('Alpha');
  ok('Return finds the next "cat" after the selection (ignoring case: "Cat") and selects it', same(n1.a, [1, 2]) && same(n1.h, [1, 5])
    && n1.text === 'Cat', n1);
  const vis = await ev(() => {
    const d = window.__doc('Alpha'), b = window.__box().win, w = d.win, c = d.dw.view.caretRect(), q = w.workToScreen(c.x, c.y);
    const stk = os.wimp.stack;
    return { lit: d.view.lit, inBox: os.wimp.caret?.window === b, docOverBox: stk.indexOf(w) > stk.indexOf(b),
      boxOverDoc: stk.indexOf(b) > stk.indexOf(w), covered: q.y + c.h > b.y - 44 && q.y < b.y + b.h && q.x >= b.x && q.x <= b.x + b.w };
  });
  ok('... the match keeps the selection colour (the box is a pane of the document), the box in front and not over it',
    vis.lit && vis.inBox && vis.boxOverDoc && !vis.covered, vis);
  // Ctrl-G and Ctrl-Shift-G with the caret in the box
  await press('Control+g');
  const cg = await st('Alpha');
  await press('Control+Shift+g');
  const cs = await st('Alpha');
  ok('Ctrl-G and Ctrl-Shift-G in the box find the next and the one before', same(cg.a, [1, 15]) && same(cs.a, [1, 2])
    && (await state()).caretIn === 'find', { cg, cs });
  await press('Enter');
  await press('Enter');
  const n2 = await st('Alpha');
  ok('... then "concat" (not whole words), then the last "cat"', same(n2.a, [1, 19]) && n2.text === 'cat', n2);
  await press('Enter');
  const n3 = await st('Alpha');
  ok('... then the link text: found and selected as the whole link', same(n3.a, [2, 8]) && same(n3.h, [2, 9]) && n3.text === 'cat link', n3);
  await press('Enter');
  const n4 = await st('Alpha');
  const m4 = (await state()).msg;
  ok('... at the end it goes round from the top, saying so', same(n4.a, [0, 4]) && m4 === 'Reached the end: continuing from the top', { n4, m4 });

  // ---------------------------------------------------- Find previous (a real click), going round backwards
  await clickIcon('button:Find previous');
  const p1 = await st('Alpha');
  ok('Find previous (clicked) goes back from the start, round to the link: the message says so', same(p1.a, [2, 8])
    && (await state()).msg === 'Reached the start: continuing from the end', { p1, s: await state() });
  await clickIcon('button:Find previous');
  ok('... and back again to the last plain "cat"', same((await st('Alpha')).a, [1, 19]));

  // ---------------------------------------------------- Match case and Whole words, clicked
  await clickIcon('whole');
  await clickIcon('matchCase');
  const o1 = await state();
  ok('Match case and Whole words are on when clicked', o1.matchCase && o1.whole, o1);
  await sel('Alpha', 0, 0);
  const found = [];
  for (let i = 0; i < 4; i++) { await clickIcon('button:Find next'); found.push((await st('Alpha')).a); }
  ok('... whole words, matching case: "cat" in line 0, line 1\'s last, the link\'s, then round (not "Cat", not "concat")',
    same(found, [[0, 4], [1, 19], [2, 8], [0, 4]]), found);
  await clickIcon('whole');
  await clickIcon('matchCase');
  ok('... clicked again: off', !(await state()).matchCase && !(await state()).whole);

  // ---------------------------------------------------- far down: scrolled into view
  await ev(() => { const b = window.__box(); b.find = 'far needle'; });
  await sel('Alpha', 0, 0);
  await ev(() => window.__doc('Alpha').win.scrollTo(0, 0));
  await clickIcon('button:Find next');
  await wait(100);
  const sc = await ev(() => {
    const d = window.__doc('Alpha'), w = d.win, L = d.view.layout, s = d.view.selection;
    const c = L.caretRect(s.head);
    return { y: c.y, top: w.scrollY, h: w.h, idx: L.byId.get(s.head.id).index };
  });
  ok('a match far down is selected and scrolled into view', sc.idx === 204 && sc.top > 0 && sc.y >= sc.top && sc.y <= sc.top + sc.h, sc);

  // ---------------------------------------------------- Escape: the caret back in the document, typing works
  await press('Escape');
  const e1 = await state();
  ok('Escape closes the box and gives the caret back to the document', !e1.open && e1.caretIn === 'Alpha', e1);
  await sel('Alpha', 0, 0);
  await page.keyboard.type('Q');
  await settle();
  ok('... typing goes into the document', (await ev(() => window.__doc('Alpha').text[0])) === 'QThe cat sat on the mat.');
  await press('Control+z');

  // ---------------------------------------------------- F4: the box again, its text kept
  await press('F4');
  const g1 = await state();
  ok('F4 opens the box again, keeping its text and the caret in Find', g1.open && g1.find === 'far needle' && g1.caretIn === 'find', g1);
  await clickIcon('button:Close');
  const g2 = await state();
  ok('Close closes it, the caret back in the document', !g2.open && g2.caretIn === 'Alpha', g2);

  // ---------------------------------------------------- Ctrl-G / Ctrl-Shift-G in the document
  await ev(() => { window.__box().find = 'cat'; });
  await sel('Alpha', 0, 0);
  await press('Control+g');
  const k1 = await st('Alpha');
  await press('Control+g');
  const k2 = await st('Alpha');
  await press('Control+Shift+g');
  const k3 = await st('Alpha');
  ok('Ctrl-G finds the next, Ctrl-Shift-G the one before, from the document (the box stays shut)', same(k1.a, [0, 4])
    && same(k2.a, [1, 2]) && same(k3.a, [0, 4]) && !(await state()).open, { k1, k2, k3 });
  await sel('Alpha', 3, 0);
  await press('Control+g');
  const kw = { st: await st('Alpha'), s: await state() };
  ok('Ctrl-G that goes round with the box shut opens it to say so, the caret left in the document', same(kw.st.a, [0, 4])
    && kw.s.open && kw.s.msg === 'Reached the end: continuing from the top' && kw.s.caretIn === 'Alpha', kw);
  await ev(() => window.__box().close());

  // ---------------------------------------------------- Ctrl-H: Replace, caret in Replace
  await sel('Alpha', 0, 4, 0, 7);
  await press('Control+h');
  const h1 = await state();
  ok('Ctrl-H opens the box with the caret in Replace (Find has "cat")', h1.open && h1.caretIn === 'replace' && h1.find === 'cat', h1);
  await page.keyboard.type('dog');
  await settle();
  // Return in the Replace field: Find next (it never replaces)
  await press('Enter');
  const re = await st('Alpha');
  ok('Return in the Replace field finds the next and replaces nothing', same(re.a, [1, 2]) && re.depth === 0
    && (await state()).caretIn === 'replace', re);
  await sel('Alpha', 0, 4, 0, 7);
  // the selection is "cat" in line 0: Replace replaces it, then finds the next
  await clickIcon('button:Replace');
  const r1 = await st('Alpha');
  const rm = (await state()).msg;
  ok('Replace replaces the selected match (one undo step) and selects the next', (await ev(() => window.__doc('Alpha').text[0]))
    === 'The dog sat on the mat.' && same(r1.a, [1, 2]) && r1.depth === 1 && rm === '1 replaced' && r1.dirty, { r1, rm });
  const ttl = await ev(() => window.__doc('Alpha').win.title);
  ok('... the title shows the change', /\*$/.test(ttl), ttl);
  await sel('Alpha', 3, 0);
  await clickIcon('button:Replace');
  const r2 = await st('Alpha');
  ok('Replace with a selection that is not a match only finds (round to line 1\'s "Cat")', same(r2.a, [1, 2]) && r2.depth === 1
    && (await state()).msg === 'Reached the end: continuing from the top', { r2, s: await state() });
  await ev(() => window.__doc('Alpha').dw.view.undo());

  // ---------------------------------------------------- Replace on link text: kept, the next found
  await sel('Alpha', 2, 8, 2, 9);
  const lr = await run('replace', { find: 'cat', replace: 'dog' });
  ok('Replace with the link text selected keeps it, says so and finds the next', lr.startsWith('Link text is kept. ')
    && (await ev(() => window.__doc('Alpha').dw.text[2])) === 'See the \uFFFC here.' && (await st('Alpha')).depth === 0
    && same((await st('Alpha')).a, [0, 4]), { lr, st: await st('Alpha') });

  // ---------------------------------------------------- Replace all: count, links skipped, one undo
  const before = await snap('Alpha');
  const ra = await run('all', { find: 'cat', replace: 'dog' });
  const t1 = await ev(() => window.__doc('Alpha').text.slice(0, 3));
  ok('Replace all: count, the link text left (said so)', ra === '4 replaced; 1 in links not replaced'
    && same(t1, ['The dog sat on the mat.', 'A dog and a condog dog.', 'See the \uFFFC here.']), { ra, t1 });
  const ac = await st('Alpha');
  ok('... one undo step; the caret after the last text put in', ac.depth === 1 && same(ac.a, [1, 22]) && same(ac.h, [1, 22]), ac);
  await clickDoc('Alpha', 0, 1);
  await press('Control+z');
  ok('... Ctrl-Z in the document puts it all back exactly (ids too)', (await snap('Alpha')) === before);

  // ---------------------------------------------------- messages
  ok('an empty Find field: refused, said', (await run('next', { find: '' })) === 'Type the text to find.');
  const b0 = await ev(() => window.__beeps);
  ok('not found: said, and a beep', (await run('next', { find: 'zebra' })) === 'Not found' && (await ev(() => window.__beeps)) > b0);
  ok('regular expression characters are literal', (await run('all', { find: 'a.*b', replace: 'R' })) === '1 replaced'
    && (await ev(() => window.__doc('Alpha').text[3])) === 'Regex R (x) [y] and a.b.'
    && (await run('next', { find: '[y]' })) === '' && (await st('Alpha')).text === '[y]');
  await ev(() => window.__doc('Alpha').dw.view.undo());
  const big = await run('next', { find: 'x'.repeat(1 << 20) });
  ok('a 1 MB needle is cut to 1000 characters, said so', big === 'Only the first 1000 characters are looked for. Not found'
    && (await state()).find.length === 1000, { big: big.slice(0, 100), len: (await state()).find.length });
  // a long paste into the Find field: the field holds 1000 at most
  await ev(() => { window.__find().open(false); window.__box().find = ''; });
  const pst = await ev(async () => {
    const t0 = performance.now(), dt = new DataTransfer();
    dt.setData('text/plain', 'y'.repeat(3000));
    os.wimp.textInput.el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await window.__frames(2);
    return { len: window.__box().find.length, ms: performance.now() - t0 };
  });
  ok('a 3000-character paste into the Find field leaves exactly 1000 characters there', pst.len === 1000, pst);
  info(`paste of 3000 characters into the Find field: ${pst.len} kept, ${Math.round(pst.ms)} ms`);
  // a real Ctrl-V in the Find field: the box lets the browser paste (Ctrl-V is not cancelled), so the
  // clipboard's text goes in (Cmd-V on a Mac, where Ctrl-V is not the browser's paste)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
  await ev(async () => {
    await navigator.clipboard.writeText('pasted cat');
    window.__find().open(false);
    window.__box().find = '';
    window.__kd = [];
    document.addEventListener('keydown', (e) => { if (e.key === 'v' || e.key === 'V') window.__kd.push([e.ctrlKey, e.metaKey, e.defaultPrevented]); });
  });
  await page.keyboard.press('Control+v');
  await ev(() => window.__frames(2));
  if (process.platform === 'darwin') {
    await page.keyboard.press('Meta+v');
    await ev(() => window.__frames(2));
  }
  const cv = await ev(() => ({ find: window.__box().find, kd: window.__kd, inBox: os.wimp.caret?.window === window.__box().win }));
  ok('a real Ctrl-V (Cmd-V on a Mac) in the Find field pastes the clipboard\'s text there; Ctrl-V is not cancelled',
    cv.find === 'pasted cat' && cv.inBox && cv.kd.length >= 1 && cv.kd[0][0] === true && cv.kd[0][2] === false, cv);

  // ---------------------------------------------------- the box works on the document last clicked in
  await ev(() => window.__box().close());
  await clickDoc('Beta', 0, 1);
  await sel('Beta', 0, 0);
  const sw = await run('next', { find: 'cat' });
  const bs = await st('Beta');
  ok('the box works on the document last clicked in (Beta): its "cat" selected', sw === '' && same(bs.a, [0, 11])
    && (await ev(() => window.__find().active?.leaf)) === 'Beta', { sw, bs });
  await clickDoc('Alpha', 0, 1);
  await sel('Alpha', 0, 0);
  await run('next', { find: 'cat' });
  ok('... and back in Alpha, Alpha\'s', same((await st('Alpha')).a, [0, 4]) && same((await st('Beta')).a, [0, 11]));
  ok('... still one box', (await ev(() => window.__boxes().length)) === 1);

  // ---------------------------------------------------- the Edit menu
  const em = await ev(() => window.__doc('Alpha').win.menu({}).items.find((i) => i.text === 'Edit').submenu().items
    .map((i) => [i.text, i.key ?? '', typeof i.shaded === 'function' ? !!i.shaded() : !!i.shaded]).slice(6));
  ok('the Edit menu: Find... Ctrl+F, Find next Ctrl+G, Find previous Ctrl+Shift+G, Replace... Ctrl+H, Word count... (no key), none shaded', same(em,
    [['Find...', 'Ctrl+F', false], ['Find next', 'Ctrl+G', false], ['Find previous', 'Ctrl+Shift+G', false],
      ['Replace...', 'Ctrl+H', false], ['Word count...', '', false]]), em);
  await ev(() => window.__box().close());
  await ev(() => { const it = window.__doc('Alpha').win.menu({}).items.find((i) => i.text === 'Edit').submenu().items; it.find((i) => i.text === 'Replace...').action(); });
  await settle();
  const mr = await state();
  ok('... Replace... opens the box with the caret in Replace', mr.open && mr.caretIn === 'replace', mr);

  // ---------------------------------------------------- the document closed under the box
  await ev(async () => { window.__doc('Beta').dw.close(); });
  await clickDoc('Alpha', 0, 1);
  await ev(async () => { window.__doc('Alpha').dw.close(); await window.__frames(2); });
  const gone = await run('next', { find: 'cat' });
  ok('with its document closed the box says so', gone === 'No document to search: click in one first.', gone);

  // ---------------------------------------------------- hostile: 10,000 matches, Replace all
  const hm = await ev(async () => {
    await window.__word().word.open('RAM::RamDisc0.$.Many');
    for (let i = 0; i < 100 && !window.__doc('Many'); i++) await window.__sleep(50);
    const d = window.__doc('Many');
    d.dw.view.focus();
    await window.__frames(2);
    const before = JSON.stringify(d.d.doc.sections);
    const t0 = performance.now();
    const msg = window.__find().run('all', { find: 'ab', replace: 'a.*b' });
    await window.__frames(2);
    const ms = performance.now() - t0;
    const after = d.dw.text[999];
    d.dw.view.undo();
    await window.__frames(2);
    return { msg, ms, after, back: JSON.stringify(d.d.doc.sections) === before, depth: d.view.undoDepth };
  });
  ok('Replace all of 10,000 matches: counted, regex characters as text, quick, one undo step back', hm.msg === '10000 replaced'
    && hm.after === Array(10).fill('a.*b').join(' ') && hm.back && hm.depth === 0 && hm.ms < 5000, hm);
  info(`Replace all of 10,000 matches: ${Math.round(hm.ms)} ms`);

  // ---------------------------------------------------- the box's close icon (a real click)
  await ev(() => { window.__doc('Many').dw.view.focus(); window.__find().open(false); });
  await settle();
  const ci = await ev(() => { const r = window.__box().win.tools.close.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(ci.x, ci.y);
  await wait(60);
  await settle();
  const cl = await state();
  ok('the box\'s close icon closes it, the caret back in the document', !cl.open && cl.caretIn === 'Many', cl);

  // ---------------------------------------------------- leaks over 30 open / close cycles
  const lk = await ev(async () => {
    const t = window.__word(), b = window.__box();
    const lis = new Set(), ae = window.addEventListener, re = window.removeEventListener;
    window.addEventListener = function (ty, f, o) { lis.add(f); return ae.call(this ?? window, ty, f, o); };
    window.removeEventListener = function (ty, f, o) { lis.delete(f); return re.call(this ?? window, ty, f, o); };
    const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length, lis.size];
    const cycle = async () => {
      window.__doc('Many').dw.view.focus();
      window.__find().open(false);
      window.__find().run('next', { find: 'ab' });
      window.__find().open(true);
      b.close();
      await window.__frames(1);
    };
    await cycle();
    await window.__frames(2);
    const base = count();
    for (let i = 0; i < 30; i++) await cycle();
    await window.__frames(2);
    window.addEventListener = ae; window.removeEventListener = re;
    return { base, after: count(), same: window.__box() === b };
  });
  ok('30 open / find / close cycles leak nothing (windows, DOM, listeners); the same box', same(lk.base, lk.after) && lk.same, lk);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ===================================================================== a Mac (navigator.platform MacIntel)
{
  const { browser: b2, page: p2, logs: l2 } = await launch();
  const e2 = (fn, arg) => p2.evaluate(fn, arg);
  try {
    await start(p2, 'MacIntel', ['Beta']);
    const q = await e2(() => window.__point('Beta', 0, 1));
    await p2.mouse.click(q.x, q.y);
    await wait(60);
    await e2(() => window.__sel('Beta', 0, 11, 0, 14));
    await p2.keyboard.press('Meta+f');
    await e2(() => window.__frames(2));
    const m1 = await e2(() => window.__state());
    ok('Mac: Cmd-F opens the Find box with the selection in it', m1.open && m1.find === 'cat' && m1.caretIn === 'find', m1);
    await e2(() => { window.__box().find = 'a'; window.__box().close(); window.__doc('Beta').dw.view.focus(); window.__sel('Beta', 0, 0); });
    await p2.keyboard.press('Meta+g');
    await e2(() => window.__frames(2));
    const m2 = await e2(() => window.__st('Beta'));
    ok('Mac: Cmd-G finds the next', same(m2.a, [0, 3]) && m2.text === 'a', m2);
    await p2.keyboard.press('Meta+h');
    await e2(() => window.__frames(2));
    const m3 = await e2(() => window.__state());
    ok('Mac: Cmd-H is not Replace (macOS hides the program with it): the box stays shut', !m3.open, m3);
    const ml = await e2(() => window.__doc('Beta').win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.map((i) => i.key ?? '').slice(6));
    ok('Mac: the Edit menu shows Cmd+F, Cmd+G, Cmd+Shift+G and Ctrl+H (Word count... has no key)', same(ml, ['Cmd+F', 'Cmd+G', 'Cmd+Shift+G', 'Ctrl+H', '']), ml);
  } catch (e) {
    out.push('FAIL exception (Mac) ' + (e.stack ?? e));
  }
  logs.push(...l2);
  await b2.close();
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
