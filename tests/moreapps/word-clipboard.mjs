// !Word's copy, cut and paste in the real desktop (./EditClip): real
// Ctrl-C / Cmd-C, Ctrl-X, Ctrl-V through the system clipboard
// (clipboard permissions granted), pastes of other programs' HTML as
// synthetic ClipboardEvents, the exact copy between two documents and
// within one, the stale-token rule, Revert, files only, composing (a
// paste and a cut refused),
// the Edit menu, the Mac Cmd keys (navigator.platform injected),
// 50,000 paragraphs, 1000 rapid pastes, hostile HTML (no request, no
// script), undo/redo exactness, leaks, and a DOMParser round trip of
// the HTML read back from the system clipboard. Pictures (Batch B,
// B7): a picture copied in one window and pasted in another is drawn
// there, saved with its media part, and Ctrl-Z takes it and its part
// away.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, numberingXml, p, r, REL } from './build-docx.mjs';
import { picDocx, pngBytes } from './pic-fixtures.mjs';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const RICH = '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:i/><w:color w:val="C00000"/><w:sz w:val="32"/>';
const LINK = '<w:hyperlink r:id="rIdL"><w:r><w:t>link</w:t></w:r></w:hyperlink>';
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/>' +
  '<w:lvlText w:val="*"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
const ALPHA = [
  p(r('Rich ', RICH) + r('plain tail.')),                                                   // 0
  p(r('A ') + LINK + r(' after.')),                                                         // 1
  p(r('List item'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),         // 2
  p(r('Third paragraph.')),                                                                 // 3
  p(r('Last.')),                                                                            // 4
];
const RT = [
  p(r('Rich ', RICH) + r('plain ') + r('u', '<w:u w:val="single"/>') + r('s', '<w:strike/>') +
    r('sup', '<w:vertAlign w:val="superscript"/>') + r('sub', '<w:vertAlign w:val="subscript"/>')),
  p(r('Less &lt; &amp; "quoted" \'single\' \u{1F600}', '<w:color w:val="0070C0"/><w:sz w:val="28"/>')),
  p(r('Centred', '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'), '<w:jc w:val="center"/>'),
  p(r('End.')),          // (the last pasted paragraph takes the target's paragraph properties: ClipPaste)
];
const withLink = (paras) => buildDocx({ 'word/document.xml': documentXml(paras.join('')), 'word/numbering.xml': NUMBERING },
  { docRels: [['rIdL', REL('hyperlink'), 'http://example.com/', 'External'], ['rIdN', REL('numbering'), 'numbering.xml']] });
const plainDoc = (texts) => buildDocx({ 'word/document.xml': documentXml(texts.map((t) => p(r(t))).join('')) });
const BIGP = (i) => `${i}: the quick brown fox jumps over the lazy dog.`;
const files = {
  Alpha: Array.from(await withLink(ALPHA)), Gamma: Array.from(await withLink(ALPHA)), Rt: Array.from(await withLink(RT)),
  Beta: Array.from(await plainDoc(['Target one.', 'Target two.', 'Target three.'])),
  Big: Array.from(await plainDoc(Array.from({ length: 50000 }, (_, i) => BIGP(i)))),
  PicSrc: Array.from(await picDocx({ pics: [{ bytes: pngBytes(40, 20, { rgb: [220, 20, 30] }) }], body: p(r('Under the picture.')) })),
  PicDst: Array.from(await plainDoc(['Pictures go here.', 'Second.'])),
};

const out = [];
const live = (s) => { if (process.env.LIVE) console.error(s.slice(0, 600)); };
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); live(out.at(-1)); };
const info = (s) => { out.push('INFO ' + s); live(out.at(-1)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** Boot with navigator.platform = platform, put the files on the RAM disc, open the given ones. */
async function start(page, platform, open) {
  await page.addInitScript((pf) => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => pf, configurable: true }); }, platform);
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
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
    window.__client = (d, x, y) => {
      const s = d.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (leaf, i, off) => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      d.win.bringToFront();
      return window.__client(d, c.x + 1, c.y + c.h / 2);
    };
    window.__sel = (leaf, i, o, j = i, o2 = o) => {
      const d = window.__doc(leaf), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    window.__st = (leaf) => {
      const d = window.__doc(leaf), v = d.view, L = v.layout, s = v.selection, ix = (q) => L.byId.get(q.id)?.index;
      return { lines: v.lines(), a: [ix(s.anchor), s.anchor.off], h: [ix(s.head), s.head.off], depth: v.undoDepth,
        clip: d.clipboard, key: d.docKey, dirty: v.dirty };
    };
    window.__para = (leaf, i) => {
      const b = window.__doc(leaf).d.doc.sections[0].blocks[i];
      return { text: b.text, numPr: !!b.pPr?.numPr, inl: Object.values(b.inlines || {}).map((x) => x.kind + ':' + (x.node?.name ?? '')) };
    };
    /** The resolved formatting of [a, b) of block i. */
    window.__fmt = (leaf, i, a, b) => {
      window.__sel(leaf, i, a, i, b);
      const q = window.__doc(leaf).view.query();
      return [q.bold, q.italic, q.underline, q.strike, q.size, q.family, q.color, q.vert];
    };
    window.__snap = (leaf) => JSON.stringify(window.__doc(leaf).d.doc.sections);
    window.__dt = ({ text, html, files = 0 } = {}) => {
      const dt = new DataTransfer();
      if (text != null) dt.setData('text/plain', text);
      if (html != null) dt.setData('text/html', html);
      for (let i = 0; i < files; i++) dt.items.add(new File(['x' + i], 'doc' + i + '.pdf', { type: 'application/pdf' }));
      return dt;
    };
    /** A paste (as the browser fires it) into leaf's window: whether it was prevented. */
    window.__fire = (leaf, o) => {
      const d = window.__doc(leaf);
      if (os.wimp.caret?.window !== d.win) d.dw.view.focus();
      const e = new ClipboardEvent('paste', { clipboardData: window.__dt(o), bubbles: true, cancelable: true });
      os.wimp.textInput.el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    window.__read = async () => {
      const o = { types: [] };
      for (const it of await navigator.clipboard.read()) {
        for (const t of it.types) {
          o.types.push(t);
          if (t === 'text/plain' || t === 'text/html') o[t] = await (await it.getType(t)).text();
        }
      }
      return o;
    };
    let x = 30;
    for (const n of open) {
      await os.filer.run(`RAM::RamDisc0.$.${n}`);
      for (let i = 0; i < 200 && !window.__doc(n); i++) await window.__sleep(50);
      const d = window.__doc(n);
      d.win.open({ x, y: 60, w: 470, h: 380, behind: 'top', scrollX: 0, scrollY: 0 });
      x += 490;
    }
    await window.__frames(3);
    return { ok: open.every((n) => window.__doc(n)), msgs: window.__msgs };
  }, [files, open]);
}

// ===================================================================== main run (not a Mac)
const { browser, page, logs } = await launch();
const requests = [];
page.on('request', (q) => requests.push(q.url()));
const ev = (fn, arg) => page.evaluate(fn, arg);
const click = async (leaf, i, off) => { const q = await ev(([l, i, o]) => window.__point(l, i, o), [leaf, i, off]); await page.mouse.click(q.x, q.y); await wait(60); };
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
const settle = () => ev(() => window.__frames(2));
const st = (leaf) => ev((l) => window.__st(l), leaf);
const para = (leaf, i) => ev(([l, i]) => window.__para(l, i), [leaf, i]);
const sel = (leaf, i, o, j = i, o2 = o) => ev((a) => window.__sel(...a), [leaf, i, o, j, o2]);
const fire = (leaf, o) => ev(([l, o]) => window.__fire(l, o), [leaf, o]);
const snap = (leaf) => ev((l) => window.__snap(l), leaf);
const beeps = () => ev(() => window.__beeps);
try {
  const s0 = await start(page, 'Linux x86_64', ['Alpha', 'Beta']);
  ok('Alpha and Beta open', s0.ok && !s0.msgs.length, s0);
  const caretOpts = await ev(() => ({ text: os.wimp.caret?.text, blink: !!os.wimp.caret?.blink }));
  ok('the caret is a blinking text caret', caretOpts.text === true && caretOpts.blink, caretOpts);

  // ---------------------------------------------------- real copy: text/plain and text/html
  await click('Alpha', 0, 1);
  await sel('Alpha', 0, 0, 0, 16);
  await press(MOD + '+c');
  await settle();
  const c1 = await ev(() => window.__read());
  const h1 = c1['text/html'] ?? '';
  ok(`real ${MOD}-C puts text/plain and text/html on the system clipboard`, c1['text/plain'] === 'Rich plain tail.' && /<b>/.test(h1)
    && /<i>/.test(h1) && /color:#C00000/i.test(h1) && /font-size:16pt/.test(h1) && /Georgia/.test(h1), c1);
  info(`HTML read back with navigator.clipboard.read() ${/word-clip:/.test(h1) ? 'keeps' : 'has lost'} the copy's marker comment`);
  const a1 = await st('Alpha');
  ok('... copying changes nothing (no undo step, not dirty)', a1.depth === 0 && !a1.dirty && a1.lines[0] === 'Rich plain tail.', a1);

  // ---------------------------------------------------- real paste in another document: formatting kept
  await click('Beta', 0, 11);
  await press(MOD + '+v');
  await settle();
  const b1 = await st('Beta');
  const f1 = await ev(() => window.__fmt('Beta', 0, 11, 16));
  const f1b = await ev(() => window.__fmt('Beta', 0, 16, 27));
  ok(`real ${MOD}-V pastes the copy at the caret in another document, one undo step`, b1.lines[0] === 'Target one.Rich plain tail.' && b1.depth === 1, b1);
  ok('... the exact copy (marker and text match), across documents', b1.clip.last === 'exact', b1.clip);
  ok('... bold, italic, colour, size and font kept; the plain part stays plain', same(f1.slice(0, 2), [true, true]) && f1[4] === 16
    && f1[5] === 'Georgia' && f1[6] === 'C00000' && f1b[0] === false && f1b[1] === false, { f1, f1b });
  await press('Control+z');

  // ---------------------------------------------------- foreign HTML (another program)
  await sel('Beta', 1, 0);
  const pv = await fire('Beta', { text: 'foreign text\nsecond', html: '<meta charset="utf-8"><p><b>foreign</b> <i>text</i></p><p style="color:#0000ff">second</p>' });
  const b2 = await st('Beta');
  const fb = await ev(() => [window.__fmt('Beta', 1, 0, 7), window.__fmt('Beta', 2, 0, 6)]);
  ok('foreign HTML pasted: two paragraphs, the second joined to the paragraph it went into; prevented', pv && b2.lines[1] === 'foreign text'
    && b2.lines[2] === 'secondTarget two.' && b2.depth === 1 && b2.clip.last === 'html', b2);
  ok('... bold kept on "foreign", the colour on "second"', fb[0][0] === true && fb[1][6] === '0000FF', fb);
  await press('Control+z');
  ok('... one undo removes it all', same((await st('Beta')).lines, ['Target one.', 'Target two.', 'Target three.']), await st('Beta'));

  // ---------------------------------------------------- hyperlink across documents: text; with its URL in the HTML
  await click('Alpha', 1, 1);
  await sel('Alpha', 1, 0, 1, 10);
  await press(MOD + '+c');
  await settle();
  const c2 = await ev(() => window.__read());
  ok('a copied hyperlink reaches other programs as <a href> (URL from the document\'s relationships)',
    /<a href="http:\/\/example\.com\/">link<\/a>/.test(c2['text/html'] ?? '') && c2['text/plain'] === 'A link after.', c2);
  await click('Beta', 2, 13);
  await press(MOD + '+v');
  await settle();
  const p2 = await para('Beta', 2);
  ok('pasted into another document the hyperlink becomes its text', p2.text === 'Target three.A link after.' && !p2.inl.length, p2);
  await press('Control+z');

  // ---------------------------------------------------- within one document: hyperlink and list item exact
  await click('Alpha', 3, 0);
  await sel('Alpha', 3, 0);
  await press(MOD + '+v');
  await settle();
  const p3 = await para('Alpha', 3);
  ok('pasted in the same document the hyperlink stays a hyperlink', p3.text === 'A ￼ after.Third paragraph.' && same(p3.inl, ['raw:w:hyperlink'])
    && (await st('Alpha')).clip.last === 'exact', p3);
  await sel('Alpha', 2, 0, 3, 0);
  await press(MOD + '+c');
  await sel('Alpha', 4, 0);
  await press(MOD + '+v');
  await settle();
  const p4 = await para('Alpha', 4), p5 = await para('Alpha', 5), lab = await ev(() => window.__doc('Alpha').view.labels());
  ok('a list item copied with its paragraph mark stays a list item (numbering kept)', p4.text === 'List item' && p4.numPr && p5.text === 'Last.'
    && !p5.numPr && lab[4] === lab[2] && lab[4], { p4, p5, lab });
  await press('Control+z', 2);
  ok('... undone', same((await st('Alpha')).lines, ['Rich plain tail.', 'A ￼ after.', 'List item', 'Third paragraph.', 'Last.']), await st('Alpha'));

  // ---------------------------------------------------- cut: one undo step
  const sb0 = await snap('Beta');
  await click('Beta', 0, 2);
  await sel('Beta', 0, 0, 0, 7);
  await press(MOD + '+x');
  await settle();
  const cx = await st('Beta'), cxc = await ev(() => window.__read());
  ok(`real ${MOD}-X cuts: removed, on the clipboard, one undo step`, cx.lines[0] === 'one.' && cxc['text/plain'] === 'Target ' && cx.depth === 1
    && same(cx.h, [0, 0]), { cx, cxc });
  await press('Control+z');
  ok('... one undo restores the document exactly', (await snap('Beta')) === sb0);

  // ---------------------------------------------------- paste over a selection, undo/redo exact
  await sel('Beta', 1, 0, 1, 6);
  await fire('Beta', { text: 'XY' });
  const ov = await st('Beta');
  ok('paste over a selection replaces it, one undo step, caret after', ov.lines[1] === 'XY two.' && ov.depth === 1 && same(ov.h, [1, 2]), ov);
  await press('Control+z');
  ok('... undo restores exactly', (await snap('Beta')) === sb0);
  await sel('Beta', 0, 3, 2, 4);
  await fire('Beta', { text: '', html: '<p>h1</p><h2>h2</h2><p><b>h3</b></p>' });
  const after = await snap('Beta');
  await press('Control+z');
  const undone = await snap('Beta');
  await press('Control+y');
  const redone = await snap('Beta');
  ok('multi-paragraph HTML paste over paragraphs: undo exact (ids too), redo exact', undone === sb0 && redone === after
    && same((await st('Beta')).lines, ['Tarh1', 'h2', 'h3et three.']), await st('Beta'));
  await press('Control+z');

  // ---------------------------------------------------- start, middle, end; several paragraphs
  await sel('Beta', 0, 0); await fire('Beta', { text: 'S-' });
  await sel('Beta', 1, 6); await fire('Beta', { text: '-M-' });
  await sel('Beta', 2, 13); await fire('Beta', { text: '-E' });
  await sel('Beta', 0, 2); await fire('Beta', { text: 'm1\nm2\nm3' });
  const pos = await st('Beta');
  ok('paste at the start, middle and end of paragraphs, and several paragraphs (plain text)',
    same(pos.lines, ['S-m1', 'm2', 'm3Target one.', 'Target-M- two.', 'Target three.-E']) && pos.depth === 4 && same(pos.h, [2, 2]), pos);
  await press('Control+z', 4);
  ok('... undone', (await snap('Beta')) === sb0);

  // ---------------------------------------------------- an empty new document
  const nd = await ev(async () => {
    const dw = await window.__word().word.new();
    await window.__frames(2);
    const leaf = dw.leaf;
    window.__fire(leaf, { text: 'one\ntwo', html: '<p>one</p><p><i>two</i></p>' });
    const s = { leaf, ...window.__st(leaf) };
    dw.close();
    return s;
  });
  ok('paste into an empty new document', same(nd.lines, ['one', 'two']) && nd.clip.last === 'html' && nd.depth === 1, nd);

  // ---------------------------------------------------- stale marker: the clipboard changed by another program
  const stale = await ev(() => {
    window.__sel('Alpha', 0, 0, 0, 4);
    const c = window.__doc('Alpha').copy();
    const mark = /<!--word-clip:[0-9a-f]{16}-->/.exec(c.html)[0];
    window.__sel('Beta', 0, 0);
    window.__fire('Beta', { text: 'NEW TEXT', html: mark + '<p>NEW TEXT</p>' });
    return { mark, ...window.__st('Beta') };
  });
  ok('stale marker (text no longer the copy\'s): the new text is pasted, read from the HTML', stale.lines[0] === 'NEW TEXTTarget one.'
    && stale.clip.last === 'html', stale);
  await press('Control+z');

  // ---------------------------------------------------- Revert: an old copy then counts as another document's
  const rv = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Gamma');
    for (let i = 0; i < 100 && !window.__doc('Gamma'); i++) await window.__sleep(50);
    const g = window.__doc('Gamma'), key0 = g.docKey;
    window.__sel('Gamma', 1, 0, 1, 10);
    const c = g.copy();
    window.__sel('Gamma', 3, 0);
    window.__fire('Gamma', { text: c.plain, html: c.html });
    const before = window.__para('Gamma', 3);
    g.view.press('undo');               // (not dirty: Revert asks nothing)
    const dirty = g.view.dirty;
    await g.revert();
    for (let i = 0; i < 100 && window.__doc('Gamma')?.docKey === key0; i++) await window.__sleep(50);
    const g2 = window.__doc('Gamma');
    window.__sel('Gamma', 3, 0);
    window.__fire('Gamma', { text: c.plain, html: c.html });
    const res = { key0, key1: g2.docKey, before, dirty, after: window.__para('Gamma', 3), clip: g2.clipboard, msgs: window.__msgs };
    g2.dw.close();
    return res;
  });
  ok('before Revert the copy pastes exactly (hyperlink kept)', same(rv.before.inl, ['raw:w:hyperlink']), rv);
  ok('Revert gives a new document key; the old copy then pastes as from another document (link as text)', rv.key0 !== rv.key1
    && rv.after.text === 'A link after.Third paragraph.' && !rv.after.inl.length && rv.clip.last === 'exact', rv);

  // ---------------------------------------------------- files only; composing
  const be0 = await beeps(), sn0 = await snap('Beta');
  await sel('Beta', 0, 3);
  await ev(() => { window.__msgs.length = 0; });
  const fp = await fire('Beta', { files: 2 });
  const fs1 = await st('Beta'), fmsg = await ev(() => [...window.__msgs]);
  const FILES = 'Only PNG, JPEG and GIF pictures can be pasted: other files cannot.';
  ok('a paste of files only: no change, a beep, the message shown (reportError), prevented', (await snap('Beta')) === sn0
    && (await beeps()) === be0 + 1 && fp && fs1.clip.last === 'files' && fs1.clip.status === FILES && same(fmsg, [FILES]), { fs1, fmsg });
  await ev(() => window.__doc('Beta').view.compose('か'));
  const cp = await fire('Beta', { text: 'zz' });
  const cs = await st('Beta');
  ok('a paste while an input method is composing: refused with a beep', cp && (await snap('Beta')) === sn0 && (await beeps()) === be0 + 2
    && cs.clip.last === 'composing', cs);
  // a cut while composing: refused too (nothing copied, nothing deleted, a beep), as the paste is
  const cutc = await ev(() => {
    const h = window.__doc('Beta'), s0 = window.__snap('Beta'), b0 = window.__beeps;
    window.__sel('Beta', 1, 0, 1, 6);
    h.view.compose('\u304b');
    const hook = h.cut();
    h.dw.view.focus();
    const dt = new DataTransfer();
    const e = new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true });
    os.wimp.textInput.el.dispatchEvent(e);
    const res = { hook, set: dt.getData('text/plain'), same: window.__snap('Beta') === s0, beeps: window.__beeps - b0, line: h.view.lines()[1] };
    h.view.compose(null);
    return res;
  });
  ok('a cut while an input method is composing: refused with a beep, nothing copied or deleted (the hook and a cut event)',
    cutc.hook === null && cutc.set === '' && cutc.same && cutc.beeps === 2 && cutc.line === 'Target two.', cutc);
  await ev(() => window.__doc('Beta').view.compose(null));

  // ---------------------------------------------------- content the model refuses; other errors are not hidden
  const refuse = await ev(() => {
    const h = window.__doc('Beta'), s0 = window.__snap('Beta');
    window.__sel('Beta', 0, 0);
    // runs that do not cover the text: the same-document route refuses it (RangeError)
    const bad = [{ type: 'p', text: 'abc', runs: [{ start: 0, end: 1, rPr: { extra: [] } }], inlines: {}, pPr: { extra: [] } }];
    const mark = h.stash(bad, 'fallback text');
    h.paste({ text: 'fallback text', html: mark + '<p>abc</p>' });
    const r1 = { line: window.__doc('Beta').view.lines()[0], last: h.clipboard.last };
    h.view.press('undo');
    const undone = window.__snap('Beta') === s0;
    // a bug (here a TypeError) is thrown to the caller, the document untouched
    const odd = { type: 'p', text: 'abc', inlines: {}, pPr: { extra: [] } };
    Object.defineProperty(odd, 'runs', { get() { throw new TypeError('boom'); } });
    const mark2 = h.stash([odd], 'abc');
    let err = null;
    try { h.paste({ text: 'abc', html: mark2 + '<p>abc</p>' }); } catch (e) { err = e.constructor.name + ': ' + e.message; }
    return { r1, undone, err, same2: window.__snap('Beta') === s0 };
  });
  ok('content the model refuses (RangeError) is pasted as the plain text instead, one undo step', refuse.r1.line === 'fallback textTarget one.'
    && refuse.r1.last === 'plain' && refuse.undone, refuse);
  ok('any other error in a paste is thrown on, not hidden; the document is unchanged', refuse.err === 'TypeError: boom' && refuse.same2, refuse);
  // the same through a real paste event: the error reaches the page's error handling (seen with a listener)
  const pe = await ev(async () => {
    const h = window.__doc('Beta'), errs = [];
    const onErr = (e) => { errs.push(String(e.message ?? e.error?.message)); e.preventDefault(); };
    window.addEventListener('error', onErr);
    const ce = console.error, logged = [];
    console.error = (...a) => logged.push(a.map((x) => String(x?.message ?? x)).join(' '));
    const odd = { type: 'p', text: 'abc', inlines: {}, pPr: { extra: [] } };
    Object.defineProperty(odd, 'runs', { get() { throw new TypeError('boom2'); } });
    const mark = h.stash([odd], 'abc');
    try { window.__fire('Beta', { text: 'abc', html: mark + '<p>abc</p>' }); } catch (e) { errs.push('thrown ' + e.message); }
    await window.__sleep(50);
    console.error = ce;
    window.removeEventListener('error', onErr);
    // the core reports a handler's error in an error box: read it, then close it (Escape)
    const box = os.wimp.stack.find((w) => w._errorBox && w.isOpen);
    const boxText = box ? box.icons.map((i) => String(i?.text ?? '')).join(' ') : null;
    if (os.wimp.modal) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    for (let i = 0; i < 40 && (os.wimp.modal || os.wimp.stack.some((w) => w._errorBox && w.isOpen)); i++) await window.__sleep(50);
    return { errs, logged, boxText, closed: !os.wimp.modal && !os.wimp.stack.some((w) => w._errorBox && w.isOpen),
      line: window.__doc('Beta').view.lines()[0] };
  });
  ok('... through a real paste event the error is reported (console and the error box), not swallowed; nothing pasted',
    pe.logged.some((x) => /boom2/.test(x)) && /boom2/.test(pe.boxText ?? '') && pe.closed && pe.line === 'Target one.', pe);

  // ---------------------------------------------------- paste breaks the typing's step and drops a pending format
  const co = await ev(async () => {
    const h = window.__doc('Beta'), v = h.view, w = h.win;
    window.__sel('Beta', 1, 0);
    h.dw.view.focus();
    const d0 = v.undoDepth;
    w.emit('textinput', { text: 'ab', window: w });
    window.__fire('Beta', { text: 'P' });
    w.emit('textinput', { text: 'cd', window: w });
    await window.__frames(1);
    const steps = v.undoDepth - d0, line = v.lines()[1];
    for (let i = 0; i < steps; i++) v.press('undo');
    window.__sel('Beta', 1, 0);
    v.format('bold');                       // Ctrl-B at a caret: a pending format
    const pend = { ...v.pending };
    window.__fire('Beta', { text: 'xy' });
    const after = { ...v.pending };
    w.emit('textinput', { text: 'z', window: w });
    await window.__frames(1);
    const f = [window.__fmt('Beta', 1, 0, 2)[0], window.__fmt('Beta', 1, 2, 3)[0]];
    v.press('undo'); v.press('undo');
    return { steps, line, pend, after, f, back: v.lines()[1] };
  });
  ok('type, paste, type: three undo steps (paste breaks the typing\'s step)', co.steps === 3 && co.line === 'abPcdTarget two.', co);
  ok('Ctrl-B at a caret then paste: the pasted text is not bold, the pending format is gone (typing after it plain too)', co.pend.b === true
    && !co.after.b && co.f[0] === false && co.f[1] === false && co.back === 'Target two.', co);

  // ---------------------------------------------------- copy with nothing selected leaves the clipboard alone
  await ev(() => navigator.clipboard.writeText('keep me'));
  await click('Beta', 0, 3);
  await sel('Beta', 0, 3);
  await press(MOD + '+c');
  await press(MOD + '+x');
  await settle();
  const keep = await ev(() => window.__read());
  ok(`${MOD}-C and ${MOD}-X at a caret put nothing on the clipboard (it keeps what it had), change nothing`, keep['text/plain'] === 'keep me'
    && !keep.types.includes('text/html') && (await snap('Beta')) === sn0, keep);

  // ---------------------------------------------------- the Edit menu
  const em = await ev(() => {
    const look = () => {
      const sub = window.__doc('Beta').win.menu({}).items.find((i) => i.text === 'Edit').submenu();
      return sub.items.map((i) => [i.text, i.key ?? '', typeof i.shaded === 'function' ? !!i.shaded() : !!i.shaded]);
    };
    window.__sel('Beta', 0, 2);
    const caret = look();
    window.__sel('Beta', 0, 0, 0, 6);
    return { caret, sel: look() };
  });
  ok('Edit menu: Undo, Redo, Cut, Copy, Paste, Select all, Find..., Find next, Find previous, Replace..., Word count... with their keys (none for the count)',
    same(em.caret.map((x) => x.slice(0, 2)), [['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y'], ['Cut', 'Ctrl+X'], ['Copy', 'Ctrl+C'],
      ['Paste', 'Ctrl+V'], ['Select all', 'Ctrl+A'], ['Find...', 'Ctrl+F'], ['Find next', 'Ctrl+G'],
      ['Find previous', 'Ctrl+Shift+G'], ['Replace...', 'Ctrl+H'], ['Word count...', '']]), em);
  ok('... Cut and Copy shaded at a caret, not with a selection; Paste and the Find items never',
    same(em.caret.map((x) => x[2]).slice(2), [true, true, false, false, false, false, false, false, false])
    && same(em.sel.map((x) => x[2]).slice(2), [false, false, false, false, false, false, false, false, false]), em);
  const menuAt = async (leaf) => {
    const pt = await ev((l) => window.__point(l, 1, 2), leaf);
    await page.mouse.click(pt.x, pt.y, { button: 'middle' });
    await wait(250);
  };
  const pick = async (level, text, hover = false) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text.replace('.', '\\.'), 'i') }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item '${text}' at level ${level}`);
    if (hover) {
      await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
      await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
      await wait(250);
    } else { await page.mouse.click(b.x + 30, b.y + b.height / 2); await wait(200); }
  };
  await click('Beta', 0, 2);
  await sel('Beta', 0, 0, 0, 6);
  await ev(() => navigator.clipboard.writeText('-'));
  await menuAt('Beta');
  await pick(0, 'Edit', true);
  const diag = await ev(() => ({ levels: os.wimp.menus.levels.map((l) => l.rows.map((r) => r.item.text + (r.shaded ? '(s)' : ''))),
    caret: os.wimp.caret?.window?.title, sel: window.__st('Beta').h, a: window.__st('Beta').a }));
  await pick(1, 'Copy');
  const mc = await ev(() => window.__read());
  ok('menu Copy (a real click) puts the selection on the system clipboard', mc['text/plain'] === 'Target' && /Target/.test(mc['text/html'] ?? ''), { mc, diag });
  await ev(() => os.wimp.menus?.close());
  await sel('Beta', 2, 13);
  await menuAt('Beta');
  await pick(0, 'Edit', true);
  await pick(1, 'Paste');
  await page.waitForFunction(() => window.__doc('Beta').view.lines()[2].length > 13, null, { timeout: 3000 }).catch(() => {});
  const mp = await st('Beta');
  ok('menu Paste (a real click, permission granted) reads the clipboard and pastes', mp.lines[2] === 'Target three.Target' && mp.depth >= 1, mp);
  info(`menu Paste took the ${mp.clip.last} route`);
  await ev(() => os.wimp.menus?.close());
  await press('Control+z');
  await sel('Beta', 0, 0, 0, 6);
  await menuAt('Beta');
  await pick(0, 'Edit', true);
  await pick(1, 'Cut');
  const mx = await st('Beta');
  ok('menu Cut removes the selection (one undo step) and puts it on the clipboard', mx.lines[0] === ' one.' && (await ev(() => window.__read()))['text/plain'] === 'Target', mx);
  await ev(() => os.wimp.menus?.close());
  await press('Control+z');
  const denied = await ev(async () => {
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { read: () => Promise.reject(new Error('denied')), readText: () => Promise.reject(new Error('denied')) }, configurable: true });
    window.__msgs.length = 0;
    const sub = window.__doc('Beta').win.menu({}).items.find((i) => i.text === 'Edit').submenu();
    sub.items.find((i) => i.text === 'Paste').action({});
    await window.__sleep(100);
    delete navigator.clipboard;
    return { msgs: [...window.__msgs], restored: !!real && typeof navigator.clipboard?.read === 'function' };
  });
  ok('menu Paste refused by the browser: a message says to press Ctrl-V', denied.msgs.length === 1 && /Press Ctrl-V to paste/.test(denied.msgs[0]) && denied.restored, denied);

  // ---------------------------------------------------- Cmd is not Ctrl off a Mac
  await click('Beta', 0, 2);
  const nm0 = await st('Beta');
  await page.keyboard.insertText('q');
  await press('Meta+z');
  await sel('Beta', 1, 0, 1, 6);
  await press('Meta+b');
  const nm1 = await st('Beta'), nmb = await ev(() => window.__fmt('Beta', 1, 0, 6));
  ok('not a Mac: Cmd-Z and Cmd-B do nothing (Ctrl is the key)', nm1.lines[0] === 'Taqrget one.' && nm1.depth === nm0.depth + 1 && nmb[0] === false, { nm0, nm1, nmb });
  await press('Control+z');

  // ---------------------------------------------------- 1000 rapid pastes; real repeated Ctrl-V
  const rapid = await ev(async () => {
    window.__sel('Beta', 2, 0);
    const d0 = window.__doc('Beta').view.undoDepth, t0 = performance.now();
    for (let i = 0; i < 1000; i++) window.__fire('Beta', { text: 'ab' });
    const ms = performance.now() - t0;
    await window.__frames(2);
    const s = window.__st('Beta');
    return { ms, len: s.lines[2].length, steps: s.depth - d0, frame: await new Promise((r) => { const t = performance.now(); requestAnimationFrame(() => r(performance.now() - t)); }) };
  });
  ok('1000 rapid pastes: all in, each its own undo step, the desktop still responsive', rapid.len === 13 + 2000 && rapid.steps === 1000 && rapid.ms < 20000 && rapid.frame < 1000, rapid);
  info(`1000 pastes in ${Math.round(rapid.ms)} ms`);
  await ev(() => navigator.clipboard.writeText('k'));
  await sel('Beta', 0, 0);
  await ev(() => window.__doc('Beta').dw.view.focus());
  const rr0 = (await st('Beta')).lines[0];
  await press(MOD + '+v', 50);
  await settle();
  const r50 = await st('Beta');
  ok(`50 real ${MOD}-V presses paste 50 times`, r50.lines[0] === 'k'.repeat(50) + rr0, { l0: r50.lines[0], c: r50.clip, h: r50.h, clip: await ev(() => navigator.clipboard.readText()),
    caret: await ev(() => [os.wimp.caret?.window?.title, document.activeElement === os.wimp.textInput.el]) });

  // ---------------------------------------------------- hostile HTML
  const req0 = requests.length;
  const HOSTILE = '<p>safe <a href="javascript:window.__pwned=3" onclick="window.__pwned=5">click</a></p><script>window.__pwned=1</script>' +
    '<img src="/hostile.png" onerror="window.__pwned=2"><iframe src="/hostile-frame.html" onload="window.__pwned=6"></iframe><svg onload="window.__pwned=4"><text>svgtext</text></svg>' +
    '<style>@import url(/hostile.css); p { background: url(/hostile-bg.png) }</style><link rel="stylesheet" href="/hostile2.css"><object data="/hostile.swf"></object>' +
    '<video src="/v.mp4" poster="/poster.png"></video><p style="background:url(/bg2.png);color:expression(alert(1))">styled</p>' +
    '<div>'.repeat(10000) + 'deep' + '</div>'.repeat(10000) + '<p>end</p>';
  const hz = await ev(async (h) => {
    const n0 = document.querySelectorAll('img,iframe,object,video,script').length;
    window.__sel('Beta', 1, 0);
    const s0 = window.__snap('Beta');
    window.__fire('Beta', { text: '', html: h });
    await window.__sleep(500);
    const L = window.__doc('Beta').view.lines();
    const inl = [1, 2, 3, 4].map((i) => window.__para('Beta', i).inl.length);
    window.__doc('Beta').view.press('undo');
    const one = window.__snap('Beta') === s0;
    window.__doc('Beta').view.press('redo');
    return { lines: L.slice(1, 5), one, inl, pwned: window.__pwned ?? null, n: document.querySelectorAll('img,iframe,object,video,script').length - n0,
    };
  }, HOSTILE);
  await wait(300);
  const hreq = requests.slice(req0);
  ok('hostile HTML: text only (link as text, script/iframe/svg/style dropped, deep nesting read), one step', hz.lines[0] === 'safe click'
    && hz.lines.includes('styled') && hz.lines.some((l) => /deep/.test(l)) && hz.lines.some((l) => /end/.test(l))
    && !hz.lines.some((l) => /pwned|svgtext|import/.test(l)) && hz.one && hz.inl.every((n) => n === 0), hz);
  ok('... no script ran, no element was added to the page, no network request', hz.pwned === null && hz.n === 0 && hreq.length === 0, { hz, hreq });
  await press('Control+z');

  // ---------------------------------------------------- the DOMParser round trip of the system clipboard's HTML
  const rt = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Rt');
    for (let i = 0; i < 100 && !window.__doc('Rt'); i++) await window.__sleep(50);
    await window.__frames(2);
    return true;
  });
  await click('Rt', 1, 2);
  await ev(() => { const d = window.__doc('Rt'), L = d.view.layout, n = L.items.length; window.__sel('Rt', 0, 0, n - 1, d.view.lines()[n - 1].length); });
  await press(MOD + '+c');
  await settle();
  const rtr = await ev(async () => {
    const c = await window.__read(), html = c['text/html'] ?? '';
    const dw = await window.__word().word.new();
    await window.__frames(2);
    window.__fire(dw.leaf, { text: '', html });
    await window.__frames(2);
    const src = window.__doc('Rt').view.lines(), dst = window.__doc(dw.leaf).view.lines();
    const runs = (leaf) => window.__doc(leaf).d.doc.sections[0].blocks.map((b, i) => b.runs.map((r) => [r.start, r.end]));
    const cmp = [];
    for (const [i, rs] of runs('Rt').entries()) {
      for (const [a, b] of rs) cmp.push([i, a, b, window.__fmt('Rt', i, a, b), window.__fmt(dw.leaf, i, a, b)]);
    }
    const jc = [2].map((i) => [window.__doc('Rt').d.doc.sections[0].blocks[i].pPr.jc, window.__doc(dw.leaf).d.doc.sections[0].blocks[i]?.pPr.jc]);
    return { html: html.slice(0, 300), src, dst, cmp, jc, last: window.__doc(dw.leaf).clipboard.last };
  });
  const diff = rtr.cmp.filter(([, , , s, d]) => !same(s, d));
  ok('round trip: copy -> system clipboard HTML -> DOMParser (ClipDom) -> ClipRead -> paste: same text (<, &, quotes, emoji)',
    rt && rtr.last === 'html' && same(rtr.src, rtr.dst), rtr);
  ok('... same bold, italic, underline, strike, size, font, colour, super/subscript on every run; alignment', !diff.length
    && same(rtr.jc, [['center', 'center']]), { diff, jc: rtr.jc });

  // ---------------------------------------------------- B7: a picture pasted into another document
  await ev(async () => {
    for (const n of ['PicSrc', 'PicDst']) {
      await os.filer.run('RAM::RamDisc0.$.' + n);
      for (let i = 0; i < 200 && !window.__doc(n); i++) await window.__sleep(50);
    }
    window.__doc('PicSrc').win.open({ x: 30, y: 60, w: 470, h: 300, behind: 'top', scrollX: 0, scrollY: 0 });
    window.__doc('PicDst').win.open({ x: 520, y: 60, w: 470, h: 300, behind: 'top', scrollX: 0, scrollY: 0 });
    window.__picsOf = (leaf) => {
      const d = window.__doc(leaf), L = d.view.layout, res = [];
      for (const it of L.items) for (const ln of it.lines || []) for (const x of ln.items) {
        if (x.kind !== 'pic') continue;
        const base = it.y + ln.y + ln.base + (x.dy || 0);
        res.push({ x: L.left + x.x, y: base - x.pic.h, w: x.pic.w, h: x.pic.h });
      }
      return res;
    };
    window.__pxOf = (leaf, x, y) => {
      const d = window.__doc(leaf), w = d.win, cv = w._canvas, k = cv.width / w.w, z = d.view.zoom, t = d.view.layout.top;
      const c = cv.getContext('2d').getImageData(Math.floor((x * z - w.scrollX) * k), Math.floor((t + (y - t) * z - w.scrollY) * k), 1, 1).data;
      return [c[0], c[1], c[2]];
    };
    window.__media = (leaf) => [...window.__doc(leaf).d.doc.parts.keys()].filter((k) => /media\//.test(k));
    await window.__frames(4);
  });
  await click('PicSrc', 1, 3);
  await sel('PicSrc', 0, 0, 0, 1);
  await press(MOD + '+c');
  await settle();
  await click('PicDst', 0, 17);
  await press(MOD + '+v');
  await wait(300);
  const pv1 = await ev(async () => {
    await window.__frames(6);
    await window.__sleep(200);
    await window.__frames(4);
    const d = window.__doc('PicDst'), b = window.__picsOf('PicDst')[0];
    return { media: window.__media('PicDst'), n: window.__picsOf('PicDst').length, depth: d.view.undoDepth, line: d.view.lines()[0],
      c: b ? window.__pxOf('PicDst', b.x + b.w / 2, b.y + b.h / 2) : null, w: b?.w, h: b?.h, src: window.__media('PicSrc') };
  });
  ok('B7: a picture copied in one window and pasted in another: drawn there in its colours, one undo step, its media part made',
    pv1.n === 1 && pv1.depth === 1 && pv1.media.length === 1 && pv1.line === 'Pictures go here.\ufffc' && pv1.c
    && Math.abs(pv1.c[0] - 220) < 12 && Math.abs(pv1.c[1] - 20) < 12 && Math.abs(pv1.c[2] - 30) < 12 && pv1.w === 96 && pv1.h === 48, pv1);
  await press('Control+s');
  await wait(400);
  const pv2 = await ev(async () => {
    const b = await os.vfs.readFile('RAM::RamDisc0.$.PicDst');
    const s = new TextDecoder('latin1').decode(b);
    return { media: s.includes('word/media/image1.png'), dirty: window.__doc('PicDst').view.dirty };
  });
  ok('... saved, the file holds the media part', pv2.media && !pv2.dirty, pv2);
  await click('PicDst', 1, 2);
  await press('Control+z');
  await settle();
  const pv3 = await ev(async () => {
    await window.__frames(3);
    const d = window.__doc('PicDst');
    return { media: window.__media('PicDst'), n: window.__picsOf('PicDst').length, depth: d.view.undoDepth, line: d.view.lines()[0] };
  });
  ok('... Ctrl-Z removes the picture and its part', pv3.n === 0 && pv3.media.length === 0 && pv3.depth === 0
    && pv3.line === 'Pictures go here.', pv3);
  // a picture alone into a document with no docPr id left: refused with a message
  const pf0 = await ev(() => {
    const d = window.__doc('PicDst').d;
    window.__partsWas = d.doc.parts;
    d.doc.parts = new Map(d.doc.parts).set('word/header9.xml', new TextEncoder().encode('<w:hdr xmlns:wp="y"><wp:docPr id="2147483647"/></w:hdr>'));
    window.__msgs.length = 0;
    return { beeps: window.__beeps ?? 0 };
  });
  await click('PicSrc', 1, 3);
  await sel('PicSrc', 0, 0, 0, 1);
  await press(MOD + '+c');
  await settle();
  await click('PicDst', 0, 17);
  await press(MOD + '+v');
  await wait(300);
  const pf1 = await ev(() => {
    const d = window.__doc('PicDst');
    const r = { beeps: window.__beeps, msgs: [...window.__msgs], depth: d.view.undoDepth, line: d.view.lines()[0], media: window.__media('PicDst') };
    d.d.doc.parts = window.__partsWas;
    return r;
  });
  ok('A4: a lone picture pasted where no id is free: the message "could not be pasted: no free name or id", nothing changed',
    pf1.msgs.length === 1 && /could not be pasted: no free name or id/.test(pf1.msgs[0]) && pf1.depth === 0
    && pf1.line === 'Pictures go here.' && pf1.media.length === 0 && pf1.beeps > pf0.beeps, [pf0, pf1]);

  // ---------------------------------------------------- 50,000 paragraphs: select all, copy
  await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Big');
    for (let i = 0; i < 400 && !window.__doc('Big'); i++) await window.__sleep(50);
    window.__doc('Big').win.open({ x: 60, y: 80, w: 600, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  });
  await click('Big', 1, 2);
  await press('Control+a');
  const t0 = Date.now();
  await press(MOD + '+c');
  const frame = await ev(() => new Promise((r) => { const t = performance.now(); requestAnimationFrame(() => r(performance.now() - t)); }));
  const ms = Date.now() - t0;
  const bc = await ev(async () => { const c = await window.__read(); return { types: c.types, html: c['text/html'], len: c['text/plain']?.length, n: c['text/plain']?.split('\n').length, last: c['text/plain']?.split('\n').pop() }; });
  ok('50,000 paragraphs (over 2,000,000 characters), select all, copy: plain text on the clipboard, no HTML (too big even as <pre>), < 3 s, the desktop responsive',
    bc.n === 50000 && bc.len > 2000000 && bc.last === BIGP(49999) && !bc.types.includes('text/html') && ms < 3000 && frame < 1000, { ...bc, html: bc.html?.slice(0, 80), ms, frame });
  info(`select-all copy of 50,000 paragraphs: ${ms} ms`);

  // ---------------------------------------------------- leaks over 30 copy/paste cycles
  const lk = await ev(async () => {
    const t = window.__word();
    for (const d of t.word.docs) if (d.leaf === 'Big') d.dw.close();
    const lis = new Set(), ae = window.addEventListener, re = window.removeEventListener;
    window.addEventListener = function (ty, f, o) { lis.add(f); return ae.call(this ?? window, ty, f, o); };
    window.removeEventListener = function (ty, f, o) { lis.delete(f); return re.call(this ?? window, ty, f, o); };
    const count = () => [t.windows.size, os.wimp.windows.size, document.querySelectorAll('*').length, lis.size,
      [...document.querySelectorAll('textarea')].filter((e) => !e.closest('.screen')).length];
    const cycle = async () => {
      os.vfs.writeFile('RAM::RamDisc0.$.Copy', await os.vfs.readFile('RAM::RamDisc0.$.Alpha'), { filetype: 0xA7E });
      const dw = await t.word.open('RAM::RamDisc0.$.Copy');
      const h = t.word.docs.find((d) => d.dw === dw);
      window.__sel('Copy', 0, 0, 1, 3);
      const c = h.copy();
      window.__fire('Copy', { text: c.plain, html: c.html });
      window.__fire('Copy', { text: 'x', html: '<p><b>y</b></p>' });
      dw.view.focus();
      const e = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
      os.wimp.textInput.el.dispatchEvent(e);
      await window.__frames(1);
      dw.close();
    };
    await cycle();
    await window.__frames(2);
    const base = count();
    for (let i = 0; i < 30; i++) await cycle();
    await window.__frames(2);
    window.addEventListener = ae; window.removeEventListener = re;
    return { base, after: count() };
  });
  ok('30 open-copy-paste-close cycles leave no windows, elements or listeners; one text field', same(lk.base.slice(0, 2), lk.after.slice(0, 2))
    && Math.abs(lk.after[2] - lk.base[2]) <= 5 && lk.after[3] === lk.base[3] && lk.after[4] === 1, lk);
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
    const q = await e2(() => window.__point('Beta', 0, 6));
    await p2.mouse.click(q.x, q.y);
    await wait(60);
    const m0 = await e2(() => window.__st('Beta'));
    await p2.keyboard.insertText('QQ');
    await p2.keyboard.press('Meta+z');
    await e2(() => window.__frames(2));
    const m1 = await e2(() => window.__st('Beta'));
    ok('Mac: Cmd-Z undoes', m1.lines[0] === 'Target one.' && m1.depth === m0.depth, { m0, m1 });
    await p2.keyboard.press('Meta+Shift+z');
    ok('Mac: Cmd-Shift-Z redoes', (await e2(() => window.__st('Beta'))).lines[0] === 'TargetQQ one.');
    await e2(() => window.__sel('Beta', 1, 0, 1, 6));
    await p2.keyboard.press('Meta+b');
    const mb = await e2(() => window.__fmt('Beta', 1, 0, 6));
    ok('Mac: Cmd-B bolds the selection', mb[0] === true, mb);
    const ml = await e2(() => window.__doc('Beta').win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.map((i) => i.key ?? ''));
    ok('Mac: the Edit menu shows Cmd+Z, Cmd+Y, Cmd+X, Cmd+C, Cmd+V, Cmd+A', same(ml.slice(0, 6), ['Cmd+Z', 'Cmd+Y', 'Cmd+X', 'Cmd+C', 'Cmd+V', 'Cmd+A']), ml);
    await e2(() => { window.__alive = 'yes'; });
    const url0 = p2.url();
    await p2.keyboard.press('Meta+r');
    await p2.keyboard.press('Meta+l');
    await wait(700);
    const alive = await e2(() => ({ alive: window.__alive, title: window.__doc('Beta')?.win.title })).catch((e) => ({ err: String(e) }));
    ok('Mac: Cmd-R and Cmd-L leave the page alone (no reload, no right-align or left-align)', alive.alive === 'yes' && p2.url() === url0
      && (await e2(() => window.__doc('Beta').d.doc.sections[0].blocks[1].pPr.jc ?? null)) === null, alive);
    if (process.platform === 'darwin') {
      await e2(() => window.__sel('Beta', 2, 0, 2, 6));
      await p2.keyboard.press('Meta+c');
      const mc = await e2(() => window.__read());
      await e2(() => window.__sel('Beta', 2, 13));
      await p2.keyboard.press('Meta+v');
      await e2(() => window.__frames(2));
      const mv = await e2(() => window.__st('Beta'));
      ok('Mac: Cmd-C and Cmd-V are the browser\'s own copy and paste', mc['text/plain'] === 'Target' && mv.lines[2] === 'Target three.Target', { mc, mv });
      await p2.keyboard.press('Meta+x');
      ok('Mac: Cmd-X cuts (nothing selected: nothing)', (await e2(() => window.__st('Beta'))).lines[2] === 'Target three.Target');
    } else info('Cmd-C / Cmd-V on a Mac not tried: this host is not a Mac');
  } catch (e) {
    out.push('FAIL exception (Mac) ' + (e.stack ?? e));
  }
  logs.push(...l2);
  await b2.close();
}
console.log(out.join('\n'));
// (boom2: the error thrown on purpose to see that a paste does not hide it)
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l) && !/boom2/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
