// !Word's typing, deleting and undo in the real desktop: text typed
// through the Wimp's text-input caret (insertText, key presses, an
// input method through CDP), Enter, Shift-Enter, Tab, Backspace,
// Delete, Ctrl-Backspace, Insert (overwrite), typing over a
// selection, a table selected then deleted, Ctrl-Z / Ctrl-Y and
// where the caret goes after them, the dirty star in the title, the
// Edit menu, keys passed on, a saved copy read back, an empty
// document, hostile input (a storm of 5000 events, 100,000
// characters in one, events after the window closed), a 5000-
// paragraph document, leaks over 30 open-type-close cycles, and a
// hiDPI screen.
// Positions come from the layout the test hook gives
// (task.word.docs[i].view, ./EditView hook()).
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, numberingXml, p, r, REL } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';

const LINK = '<w:hyperlink r:id="rIdL"><w:r><w:t>link</w:t></w:r></w:hyperlink>';
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/>' +
  '<w:lvlText w:val="*"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
const PARAS = [
  p(r('Typing here'), '<w:pStyle w:val="Heading1"/>'),                        // 0
  p(r('The quick brown fox.')),                                               // 1
  p(r('Emoji \u{1F600} and é here.')),                                  // 2
  p(r('Tab') + '<w:r><w:tab/></w:r>' + r('stop')),                            // 3
  p(r('A ') + LINK + r(' after.')),                                           // 4
  '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' +
    p(r('a cell')) + '</w:tc></w:tr></w:tbl>',                                // 5
  p(r('List item'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'), // 6
  p(r('Last paragraph.')),                                                    // 7
  ...Array.from({ length: 20 }, (_, i) => p(r(`Filler ${i} with words.`))),
];
const fixture = () => buildDocx({ 'word/document.xml': documentXml(PARAS.join('')), 'word/numbering.xml': NUMBERING },
  { docRels: [['rIdL', REL('hyperlink'), 'http://example.com/', 'External'], ['rIdN', REL('numbering'), 'numbering.xml']] });
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const big = () => buildDocx({ 'word/document.xml': documentXml(Array.from({ length: 5000 }, (_, i) =>
  p(r(`${i}: ` + Array.from({ length: 8 + (i % 7) }, (_, k) => WORDS[(i + k) % 10]).join(' ')))).join('')) });
const empty = () => buildDocx({ 'word/document.xml': documentXml('') });

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const files = { Typing: Array.from(await fixture()), Big: Array.from(await big()), Empty: Array.from(await empty()) };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Boot, put the files on the RAM disc, open Typing in Word. */
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
    window.__doc = (leaf = 'Typing') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__client = (d, x, y) => {
      const s = d.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Client point just inside the caret place of (block i, off). */
    window.__point = (i, off, leaf) => {
      const d = window.__doc(leaf), L = d.view.layout, it = L.items[i], c = L.caretRect({ id: it.id, off });
      return window.__client(d, c.x + 1, c.y + c.h / 2);
    };
    window.__set = (i, off, j = i, off2 = off) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off }, { id: L.items[j].id, off: off2 });
    };
    /** The selection as [index, off] pairs, the texts, title, dirty. */
    window.__state = () => {
      const d = window.__doc(), L = d.view.layout, s = d.view.selection;
      const ix = (q) => L.byId.get(q.id)?.index;
      return { a: [ix(s.anchor), s.anchor.off], h: [ix(s.head), s.head.off], lines: d.view.lines(), title: d.win.title,
        dirty: d.view.dirty, depth: d.view.undoDepth };
    };
    await os.filer.run('RAM::RamDisc0.$.Typing');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 100, y: 60, w: 860, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!d, n: d?.view.lines().length, msgs: window.__msgs, help: String(d?.win.helpText ?? '') };
  }, files);
}

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const click = async (i, off) => { const q = await ev(([i, o]) => window.__point(i, o), [i, off]); await page.mouse.click(q.x, q.y); };
const state = () => ev(() => window.__state());
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
const settle = () => ev(() => window.__frames(2));
try {
  const s0 = await start(page);
  ok('the document opens; the help says it can be typed in', s0.ok && s0.n === 28 && !s0.msgs.length && /type/i.test(s0.help) && !/cannot be edited/.test(s0.help), s0);

  // ---------------------------------------------------- typing
  await click(1, 4);
  await page.keyboard.insertText('hello é\u{1F600}');
  await settle();
  const t1 = await state();
  ok('insertText types at the caret, the caret after it', t1.lines[1] === 'The hello é\u{1F600}quick brown fox.' && same(t1.h, [1, 13]) && same(t1.a, t1.h), t1);
  ok('the title has the dirty star', t1.title === 'Typing *' && t1.dirty, t1);
  const cr = await ev(() => {
    const d = window.__doc(), c = d.view.caretRect(), el = document.querySelector('.caret');
    return { c, el: el && el.parentElement === d.win.work ? [parseFloat(el.style.left), parseFloat(el.style.top)] : null, text: os.wimp.caret?.text === true };
  });
  ok('the Wimp caret is a text caret at the new place', cr.text && cr.el && cr.el[0] === Math.round(cr.c.x) && cr.el[1] === Math.round(cr.c.y), cr);
  await page.keyboard.type('abc');
  await settle();
  const t2 = await state();
  ok('keyboard.type abc types it exactly once', t2.lines[1] === 'The hello é\u{1F600}abcquick brown fox.' && same(t2.h, [1, 16]), t2);

  // ---------------------------------------------------- deleting
  await press('Backspace', 3);
  await press('Backspace');
  const d1 = await state();
  ok('Backspace deletes one character, an emoji whole', d1.lines[1] === 'The hello équick brown fox.' && same(d1.h, [1, 11]), d1);
  await press('Control+Backspace');
  const d2 = await state();
  ok('Ctrl-Backspace deletes the word before', d2.lines[1] === 'The hello quick brown fox.' && same(d2.h, [1, 10]), d2);
  await press('Delete', 5);
  const d3 = await state();
  ok('Delete deletes forward', d3.lines[1] === 'The hello  brown fox.' && same(d3.h, [1, 10]), d3);
  // e + combining acute is one character for Backspace
  await ev(() => window.__set(2, 'Emoji \u{1F600} and é'.length));
  await press('Backspace');
  const d4 = await state();
  ok('Backspace deletes a letter with its accent', d4.lines[2] === 'Emoji \u{1F600} and  here.' && same(d4.h, [2, 13]), d4);
  // Backspace at the start of a paragraph joins it to the one before
  await ev(() => window.__set(2, 0));
  await press('Backspace');
  const d5 = await state();
  ok('Backspace at a paragraph start joins the paragraphs', d5.lines[1] === 'The hello  brown fox.Emoji \u{1F600} and  here.' && d5.lines.length === 27 && same(d5.h, [1, 21]), d5);
  await press('Control+z');
  const d6 = await state();
  ok('... and undo splits them again, the caret at the start of the second', d6.lines[2] === 'Emoji \u{1F600} and  here.' && d6.lines.length === 28 && same(d6.h, [2, 0]), d6);

  // ---------------------------------------------------- Enter, Shift-Enter, Tab
  await ev(() => window.__set(7, 4));
  await press('Enter');
  const e1 = await state();
  ok('Enter splits the paragraph, the caret at the new one', e1.lines[7] === 'Last' && e1.lines[8] === ' paragraph.' && same(e1.h, [8, 0]), e1);
  await press('Control+z');
  const e2 = await state();
  ok('undoing Enter joins them, the caret where it was split', e2.lines[7] === 'Last paragraph.' && same(e2.h, [7, 4]), e2);
  await press('Control+y');
  const e3 = await state();
  ok('redoing Enter splits again, the caret at the new paragraph', e3.lines[8] === ' paragraph.' && same(e3.h, [8, 0]), e3);
  await press('Shift+Enter');
  const e4 = await ev(() => { const d = window.__doc(), b = d.doc.sections[0].blocks[8]; return { s: window.__state(), inl: b.inlines?.[0]?.kind, text: b.text }; });
  ok('Shift-Enter puts a line break (a \\n character) in the paragraph', e4.inl === undefined && e4.text === '\n paragraph.' && same(e4.s.h, [8, 1]), e4);
  await press('Tab');
  const e5 = await ev(() => { const d = window.__doc(), b = d.doc.sections[0].blocks[8]; return { s: window.__state(), inl: b.inlines?.[1]?.kind, text: b.text }; });
  ok('Tab puts a tab (a \\t character) in', e5.inl === undefined && e5.text === '\n\t paragraph.' && same(e5.s.h, [8, 2]), e5);

  // ---------------------------------------------------- a selection replaced
  await ev(() => window.__set(7, 0));
  await press('Shift+ArrowRight', 3);
  await page.keyboard.insertText('F');
  const r1 = await state();
  ok('typing over a selection (Shift-arrows) replaces it', r1.lines[7] === 'Ft' && same(r1.h, [7, 1]) && same(r1.a, [7, 1]), r1);

  // ---------------------------------------------------- undo, redo, the dirty star
  {
    const depth0 = await ev(() => window.__doc().view.undoDepth);
    await ev(() => window.__set(3, 0));
    await page.keyboard.insertText('hello ');
    await page.keyboard.insertText('world');
    const u0 = await state();
    await press('Control+z');
    const u1 = await state();
    await press('Control+z');
    const u2 = await state();
    await press('Control+y');
    const u3 = await state();
    ok('a word and its space are one undo step, the next word another', u0.depth === depth0 + 2 && u0.lines[3].startsWith('hello worldTab'), { depth0, u0 });
    ok('Ctrl-Z undoes "world", the caret where it began', u1.lines[3].startsWith('hello Tab') && same(u1.h, [3, 6]), u1);
    ok('Ctrl-Z again undoes "hello ", the caret at the start', u2.lines[3].startsWith('Tab') && same(u2.h, [3, 0]), u2);
    ok('Ctrl-Y redoes "hello ", the caret after it', u3.lines[3].startsWith('hello Tab') && same(u3.h, [3, 6]), u3);
    // undo all the way: the star goes
    for (let i = 0; i < 60 && (await ev(() => window.__doc().d.canUndo)); i++) await press('Control+z');
    const u4 = await state();
    ok('undone to the opened state the star goes', u4.title === 'Typing' && !u4.dirty && u4.lines[1] === 'The quick brown fox.' && u4.lines.length === 28, u4);
    await press('Control+y');
    const u5 = await state();
    ok('... and comes back with a redo', u5.title === 'Typing *' && u5.dirty, u5);
    for (let i = 0; i < 5; i++) await press('Control+z');
  }

  // ---------------------------------------------------- overwrite
  {
    await ev(() => window.__set(1, 4));
    await press('Insert');
    await page.keyboard.insertText('QUI');
    await settle();
    const o1 = await ev(() => {
      const d = window.__doc(), w = d.win, c = d.view.caretRect(), cv = w._canvas, k = cv.width / w.w;
      const g = cv.getContext('2d'), img = g.getImageData(Math.round((c.x - w.scrollX + 1) * k), Math.round((c.y - w.scrollY + 1) * k), 1, Math.round((c.h - 2) * k)).data;
      let grey = 0;
      for (let q = 0; q < img.length; q += 4) if (Math.abs(img[q] - 160) < 12 && Math.abs(img[q + 2] - 160) < 12) grey++;
      return { s: window.__state(), over: d.view.overwrite, grey };
    });
    ok('Insert: typing overwrites, a block shades the next character', o1.over && o1.s.lines[1] === 'The QUIck brown fox.' && same(o1.s.h, [1, 7]) && o1.grey > 3, o1);
    await press('Insert');
    await page.keyboard.insertText('x');
    const o2 = await state();
    ok('Insert again: typing inserts', o2.lines[1] === 'The QUIxck brown fox.', o2);
  }

  // ---------------------------------------------------- after a hyperlink; the table
  {
    const after = await ev(() => window.__doc().view.lines()[4].indexOf('￼') + 1);
    await ev((n) => window.__set(4, n), after);
    await page.keyboard.insertText('X');
    const h1 = await ev(() => { const b = window.__doc().doc.sections[0].blocks[4]; return { text: b.text, inl: Object.keys(b.inlines), raw: JSON.stringify(b.inlines[2]?.node ?? null) }; });
    ok('typing after a hyperlink does not extend it', h1.text === 'A ￼X after.' && same(h1.inl, ['2']) && h1.raw.includes('link') && !h1.raw.includes('X'), h1);
    const len = await ev(() => window.__doc().view.lines()[4].length);
    await ev((n) => window.__set(4, n), len);
    await press('Delete');
    const t1s = await state();
    await press('Delete');
    const t2s = await state();
    ok('Delete before a table selects it', t1s.lines[5] === null && same(t1s.a, [5, 0]) && same(t1s.h, [5, 1]), t1s);
    ok('... and Delete again deletes it', t2s.lines.length === t1s.lines.length - 1 && t2s.lines[5] === 'List item', t2s);
    await press('Control+z');
    const t3s = await state();
    ok('undo puts the table back', t3s.lines[5] === null && t3s.lines.length === t1s.lines.length, t3s);
  }

  // ---------------------------------------------------- an input method
  {
    const cdp = await page.context().newCDPSession(page);
    await click(7, 2);
    const base = await state();
    await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    await settle();
    const c1 = await ev(() => {
      const d = window.__doc(), w = d.win, c = d.view.caretRect(), cv = w._canvas, k = cv.width / w.w, g = cv.getContext('2d');
      const img = g.getImageData(Math.round((c.x - w.scrollX) * k), Math.round((c.y - w.scrollY) * k), Math.round(20 * k), Math.round(c.h * k)).data;
      let line = 0;
      for (let q = 0; q < img.length; q += 4) if (img[q] < 40 && Math.abs(img[q + 1] - 80) < 30 && img[q + 2] > 170) line++;
      return { comp: d.view.composing, line, lines: d.view.lines() };
    });
    ok('composing: the text is shown underlined at the caret, not in the document', c1.comp === 'にほ' && c1.line > 10 && same(c1.lines, base.lines), c1);
    await cdp.send('Input.insertText', { text: '日本' });
    await settle();
    const c2 = await ev(() => ({ s: window.__state(), comp: window.__doc().view.composing }));
    ok('the commit types the text, once', c2.comp === null && c2.s.lines[7] === base.lines[7].slice(0, 2) + '\u65e5\u672c' + base.lines[7].slice(2) && same(c2.s.h, [7, 4]), c2);
    await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await settle();
    const c3 = await ev(() => ({ s: window.__state(), comp: window.__doc().view.composing }));
    ok('a cancelled composition leaves the text as it was', c3.comp === null && same(c3.s.lines, c2.s.lines), c3);
    // composing over a selection: replaced only on the commit
    await ev(() => window.__set(7, 0, 7, 2));
    const s0 = await state();
    await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 });
    await settle();
    const s1 = await ev(() => ({ s: window.__state(), comp: window.__doc().view.composing }));
    await cdp.send('Input.insertText', { text: '\u306b' });
    await settle();
    const s2 = await state();
    ok('composing over a selection keeps it until the commit, which replaces it', s1.comp === '\u306b' && same(s1.s.lines, s0.lines)
      && same(s1.s.a, [7, 0]) && same(s1.s.h, [7, 2]) && s2.lines[7] === '\u306b' + s0.lines[7].slice(2) && same(s2.h, [7, 1]), { s0: s0.lines[7], s1, s2: s2.lines[7] });
    // a window closed mid-composition
    const c4 = await ev(async () => {
      os.vfs.writeFile('RAM::RamDisc0.$.Copy', await os.vfs.readFile('RAM::RamDisc0.$.Typing'), { filetype: 0xA7E });
      const dw = await window.__word().word.open('RAM::RamDisc0.$.Copy');
      dw.view.focus();
      window.__dwc = dw;
      return !!dw;
    });
    await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
    await settle();
    const c5 = await ev(async () => {
      const dw = window.__dwc, comp = dw.view.comp, w = dw.win;
      dw.close();
      w.emit('textinput', { text: 'late', window: w });
      w.emit('composition', { text: 'late', window: w });
      await window.__frames(2);
      return { comp, after: dw.view.comp, text: dw.d.doc.sections[0].blocks[1].text, open: w.isOpen };
    });
    await cdp.send('Input.insertText', { text: 'z' });
    await settle();
    ok('closing the window mid-composition: no state left, late events ignored', c4 && c5.comp === 'に' && c5.after === null && c5.text === 'The quick brown fox.' && !c5.open, c5);
    await click(7, 0);
  }

  // ---------------------------------------------------- keys passed on; the Edit menu
  {
    const pass = await ev(() => {
      const w = window.__doc().win;
      const k = (code, key, extra = {}) => { const e = w.emit('key', { code, key, shift: false, ctrl: false, ...extra }); return !!(e.handled || e.defaultPrevented); };
      const res = { F5: k(0x185, 'F5'), ctrlB: k(2, 'b', { ctrl: true }), ctrlF12: k(0x1EC, 'F12', { ctrl: true }), left: k(0x18C, 'ArrowLeft') };
      const seen = [];
      window.__off = os.wimp.on('key', (e) => { seen.push(e.code); });
      window.__seen = seen;
      return res;
    });
    await press('F5');
    await page.waitForFunction(() => window.__seen.includes(0x185), null, { timeout: 2000 }).catch(() => {});
    const seen = await ev(() => { window.__off(); return [...window.__seen]; });
    ok('keys it does not use go on (F5, Ctrl-B, Ctrl-F12) and reach the desktop', !pass.F5 && !pass.ctrlB && !pass.ctrlF12 && pass.left && seen.includes(0x185), { pass, seen });
    // a printable key that comes as a key (the text field lost the focus) is typed
    const fb = await ev(() => {
      const d = window.__doc(), w = d.win, before = d.view.lines()[7];
      const e = w.emit('key', { code: 113, char: 'q', key: 'q', shift: false, ctrl: false });
      return { handled: !!e.handled, before, after: d.view.lines()[7] };
    });
    ok('a printable key arriving as a key event is typed', fb.handled && fb.after === 'q' + fb.before, fb);
    await press('Control+z');

    // Cmd (Meta) and Ctrl shortcuts are never text; Ctrl ones go on to the desktop
    {
      await click(7, 1);
      const before = await state();
      const seenM = [];
      await ev(() => { window.__seenM = []; window.__offM = os.wimp.on('key', (e) => { window.__seenM.push(e.code); }); });
      for (const k of ['Meta+c', 'Meta+x', 'Meta+z', 'Meta+s', 'Meta+v']) await press(k);
      await settle();
      const afterMeta = await state();
      for (const k of ['Control+c', 'Control+v', 'Control+x']) await press(k);
      await page.waitForFunction(() => [3, 22, 24].every((c) => window.__seenM.includes(c)), null, { timeout: 2000 }).catch(() => {});
      await settle();
      const afterCtrl = await state();
      seenM.push(...await ev(() => { window.__offM(); return window.__seenM; }));
      ok('Cmd-C, Cmd-X, Cmd-Z, Cmd-S, Cmd-V type nothing and change nothing', same(afterMeta.lines, before.lines) && same(afterMeta.h, before.h)
        && afterMeta.depth === before.depth, { before: before.lines[7], after: afterMeta.lines[7], depth: [before.depth, afterMeta.depth] });
      ok('Ctrl-C, Ctrl-V, Ctrl-X change nothing and reach the desktop', same(afterCtrl.lines, before.lines) && [3, 22, 24].every((c) => seenM.includes(c)),
        { after: afterCtrl.lines[7], seenM });
      // a printable key that comes as a key from the focused text field is not text either
      const fp = await ev(() => {
        const d = window.__doc(), w = d.win, t = os.wimp.textInput, before = d.view.lines()[7];
        const e = w.emit('key', { code: 99, char: 'c', key: 'c', shift: false, ctrl: false, domEvent: { target: t.el, metaKey: false } });
        return { focused: t.focused, handled: !!e.handled, before, after: d.view.lines()[7] };
      });
      ok('a printable key event from the focused text field is not typed (passed on)', fp.focused && !fp.handled && fp.after === fp.before, fp);
    }

    // a relayout (fonts arrived, a resize) never takes the focus from a page field outside the desktop
    {
      await click(7, 1);
      await ev(() => {
        const i = document.createElement('input');
        i.id = 'outside';
        document.body.appendChild(i);
        i.focus();
      });
      const r = await ev(async () => {
        const d = window.__doc();
        d.win.open({ w: d.win.w - 60 });
        await window.__frames(3);
        d.win.open({ w: d.win.w + 60 });
        await window.__frames(3);
        const a = document.activeElement;
        return { outside: a && a.id === 'outside', proxy: os.wimp.textInput.focused, caret: !!os.wimp.caret?.text };
      });
      ok('a window resize leaves the focus in a page field outside the desktop', r.outside && !r.proxy && r.caret, r);
      await click(7, 1);
      const f = await ev(() => ({ proxy: os.wimp.textInput.focused }));
      const b4 = await state();
      await page.keyboard.insertText('Z');
      await settle();
      const af = await state();
      ok('a click in the window focuses the field again and typing works', f.proxy && af.lines[7].includes('Z') && af.depth === b4.depth + 1,
        { f, b4: b4.lines[7], after: af.lines[7], depth: [b4.depth, af.depth] });
      await ev(() => document.getElementById('outside').remove());
      await press('Control+z');
      await ev(async () => { const d = window.__doc(); d.win.open({ w: d.win.w - 40 }); await window.__frames(2); });
      const b5 = (await state()).lines[7];
      await page.keyboard.insertText('Y');
      await settle();
      ok('typing after a resize still works', (await state()).lines[7].includes('Y') && (await state()).lines[7].length === b5.length + 1, b5);
      await press('Control+z');
    }

    // the Edit menu: Undo and Redo shaded by what there is to undo and redo
    const shades = await ev(async () => {
      os.vfs.writeFile('RAM::RamDisc0.$.Fresh', await os.vfs.readFile('RAM::RamDisc0.$.Typing'), { filetype: 0xA7E });
      const dw = await window.__word().word.open('RAM::RamDisc0.$.Fresh');
      const look = () => {
        const menu = dw.win.menu({}), sub = menu.items.find((i) => i.text === 'Edit').submenu();
        const v = (x) => (typeof x === 'function' ? x() : !!x);
        return { top: menu.items.map((i) => i.text), items: sub.items.map((i) => [i.text, i.key, v(i.shaded)]) };
      };
      const fresh = look();
      dw.view.focus();
      dw.win.emit('textinput', { text: 'x', window: dw.win });
      const edited = look();
      dw.view.undo();
      const undone = look();
      dw.close();
      return { fresh, edited, undone };
    });
    ok('window menu: Save copy as .docx, Info, Edit, Close', same(shades.fresh.top, ['Save copy as .docx', 'Info', 'Edit', 'Close']), shades.fresh);
    ok('Edit menu on a fresh document: Undo Ctrl+Z and Redo Ctrl+Y shaded, Select all Ctrl+A', same(shades.fresh.items,
      [['Undo', 'Ctrl+Z', true], ['Redo', 'Ctrl+Y', true], ['Select all', 'Ctrl+A', false]]), shades.fresh);
    ok('Edit menu after an edit: Undo enabled, Redo shaded', same(shades.edited.items.map((i) => i[2]), [false, true, false]), shades.edited);
    ok('Edit menu after an undo: Undo shaded again, Redo enabled', same(shades.undone.items.map((i) => i[2]), [true, false, false]), shades.undone);
    const m2 = await ev(() => {
      const d = window.__doc(), sub = d.win.menu({}).items.find((i) => i.text === 'Edit').submenu();
      const before = d.view.lines()[7];
      sub.items[0].action({});
      const undone = d.view.lines()[7];
      const redo = sub.items[1].shaded();
      sub.items[1].action({});
      return { before, undone, redo, after: d.view.lines()[7] };
    });
    ok('Edit menu Undo and Redo work; Redo is enabled after an undo', m2.undone !== m2.before && m2.after === m2.before && m2.redo === false, m2);
  }

  // ---------------------------------------------------- a saved copy
  {
    await click(0, 0);           // (the caret back in this window: the Fresh one had it)
    await page.keyboard.insertText('Saved: ');
    const bytes = await ev(async () => Array.from(await window.__doc().saveBytes()));
    const back = await readDocx(new Uint8Array(bytes));
    const texts = back.sections[0].blocks.filter((b) => b.type === 'p').map((b) => b.text);
    ok('Save copy writes the edited text, read back by readDocx', texts[0] === 'Saved: Typing here', texts.slice(0, 3));
    const st = await state();
    ok('a saved copy leaves the star (it is a copy)', st.title === 'Typing *' && st.dirty, st);
  }

  // ---------------------------------------------------- an empty document
  {
    const e = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.Empty');
      let beeps = 0;
      const b = os.wimp.beep;
      os.wimp.beep = () => { beeps++; };
      dw.view.focus();
      dw.win.emit('textinput', { text: 'x', window: dw.win });
      dw.win.emit('key', { code: 13, key: 'Enter' });
      os.wimp.beep = b;
      const res = { beeps, blocks: dw.d.doc.sections.reduce((n, s) => n + s.blocks.length, 0), title: dw.win.title };
      dw.close();
      return res;
    });
    ok('typing in a document with no paragraph beeps and changes nothing', e.beeps === 1 && e.blocks === 0 && e.title === 'Empty', e);
  }

  // ---------------------------------------------------- hostile input
  {
    const h = await ev(async () => {
      const d = window.__doc(), w = d.win;
      window.__set(9, 0);
      const depth = d.view.undoDepth;
      const t0 = performance.now();
      w.emit('textinput', { text: 'z'.repeat(100000), window: w });
      d.view.flush();
      await window.__frames(1);
      const ms = performance.now() - t0;
      const res = { ms, steps: d.view.undoDepth - depth, len: d.view.lines()[9].length };
      d.view.press('undo');
      res.back = d.view.lines()[9];
      return res;
    });
    console.log(`timings: 100,000 characters in one event ${Math.round(h.ms)} ms`);
    ok('100,000 characters in one event: one undo step, under 2 s', h.steps === 1 && h.len === 100000 + 'Filler 1 with words.'.length && h.ms < 2000 && h.back === 'Filler 1 with words.', h);
  }

  // ---------------------------------------------------- 5000 paragraphs
  {
    const b = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.Big');
      const w = dw.win;
      w.open({ x: 100, y: 60, w: 860, h: 500, behind: 'top' });
      await window.__frames(2);
      const L = dw.view.L, it = L.items[2500];
      dw.view.setSelection({ anchor: { id: it.id, off: 3 }, head: { id: it.id, off: 3 }, affinity: 'down', goalX: null });
      dw.view.focus();
      await window.__frames(2);
      let paintMs = 0;
      const paint = dw.paint.bind(dw);
      dw.paint = (g, rc) => { const s = performance.now(); paint(g, rc); paintMs += performance.now() - s; };
      const keys = [];
      for (let k = 0; k < 5; k++) {
        paintMs = 0;
        const t0 = performance.now();
        w.emit('textinput', { text: 'k', window: w });
        dw.view.flush();
        const sync = performance.now() - t0;
        await window.__frames(1);
        keys.push(Math.round(sync + paintMs));
      }
      // a storm: 5000 events in a loop, then the frame after
      const s0 = performance.now();
      for (let k = 0; k < 5000; k++) w.emit('textinput', { text: 'y', window: w });
      await window.__frames(2);
      const storm = performance.now() - s0;
      const text = dw.d.doc.sections[0].blocks[2500].text;
      const c = dw.view.caretRect(), shown = c && c.y >= w.scrollY && c.y + c.h <= w.scrollY + w.h;
      const res = { keys, storm: Math.round(storm), ys: (text.match(/y/g) || []).length, shown, title: w.title };
      dw.close();
      return res;
    });
    ok('5000 paragraphs: a keystroke with its new layout and drawing under 100 ms', b.keys.every((x) => x < 100), b);
    ok('5000 paragraphs: a storm of 5000 typed events in under 5 s, all typed, caret in view', b.storm < 5000 && b.ys === 5000 && b.shown && b.title === 'Big *', b);
    console.log(`timings: keystrokes ${b.keys.join('/')} ms, storm ${b.storm} ms`);
  }

  // ---------------------------------------------------- leaks
  {
    const lk = await ev(async () => {
      const t = window.__word();
      const lis = new Set(), ae = window.addEventListener, re = window.removeEventListener;
      window.addEventListener = function (ty, f, o) { lis.add(f); return ae.call(this ?? window, ty, f, o); };
      window.removeEventListener = function (ty, f, o) { lis.delete(f); return re.call(this ?? window, ty, f, o); };
      const live = new Set(), si = window.setInterval, ci = window.clearInterval;
      window.setInterval = (f, ...a) => { const id = si(f, ...a); live.add(id); return id; };
      window.clearInterval = (id) => { live.delete(id); return ci(id); };
      const proxies = () => [...document.querySelectorAll('textarea')].filter((e) => !e.closest('.screen')).length;
      const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length, lis.size, live.size, proxies()];
      const cycle = async () => {
        os.vfs.writeFile('RAM::RamDisc0.$.Copy', await os.vfs.readFile('RAM::RamDisc0.$.Typing'), { filetype: 0xA7E });
        const dw = await t.word.open('RAM::RamDisc0.$.Copy');
        const L = dw.view.L, c = L.caretRect({ id: L.items[1].id, off: 3 });
        dw.win.emit('click', { button: 'select', x: c.x, y: c.y + 2, window: dw.win, kind: 'click' });
        dw.win.emit('textinput', { text: 'typed', window: dw.win });
        dw.win.emit('key', { code: 8, key: 'Backspace' });
        dw.win.emit('composition', { text: 'x', start: true, window: dw.win });
        await window.__frames(1);
        dw.close();
      };
      await cycle();
      await window.__frames(2);
      const base = count();
      for (let i = 0; i < 30; i++) await cycle();
      await window.__frames(2);
      window.addEventListener = ae; window.removeEventListener = re; window.setInterval = si; window.clearInterval = ci;
      return { base, after: count() };
    });
    ok('30 open-type-close cycles leave no windows, elements, listeners or timers; one text field', same(lk.base.slice(0, 2), lk.after.slice(0, 2))
      && Math.abs(lk.after[2] - lk.base[2]) <= 5 && lk.after[3] === lk.base[3] && lk.after[4] === lk.base[4] && lk.after[5] === 1, lk);
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();

// ---------------------------------------------------- hiDPI
{
  const { browser: b2, page: p2, logs: l2 } = await launch({ zoom: 2 });
  try {
    await start(p2);
    const q = await p2.evaluate(() => window.__point(1, 4));
    await p2.mouse.click(q.x, q.y);
    await p2.keyboard.insertText('wide ');
    await p2.evaluate(() => window.__frames(2));
    const hc = await p2.evaluate(() => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[1].id, off: 9 });
      const el = document.querySelector('.caret'), r = el?.getBoundingClientRect(), want = window.__client(d, c.x, c.y);
      return { s: window.__state(), r: r && [r.left, r.top, r.height], want: [want.x, want.y, c.h], dpr: window.devicePixelRatio };
    });
    ok('hiDPI: typing puts the text and the caret where they belong', hc.dpr === 2 && hc.s.lines[1] === 'The wide quick brown fox.' && same(hc.s.h, [1, 9])
      && hc.r && Math.abs(hc.r[0] - hc.want[0]) <= 1.5 && Math.abs(hc.r[1] - hc.want[1]) <= 1.5, hc);
  } catch (e) {
    out.push('FAIL exception (hiDPI) ' + (e.stack ?? e));
  }
  logs.push(...l2);
  await b2.close();
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
