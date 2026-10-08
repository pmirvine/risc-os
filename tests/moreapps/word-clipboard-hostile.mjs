// !Word's copy, paste and Find against hostile input in the real
// desktop: everything in a 50,000-paragraph document selected and
// copied (the HTML over 2,000,000 characters left out: only the
// copy's marker as HTML, the plain text whole, under 3 s) and pasted
// whole into another document by the exact route (not cut at the
// 100,000 characters a plain paste brings); a paste of 5 MB of text (cut to the Wimp's
// 100,000 characters) and of 100,000 paragraphs of HTML; 10,000-deep
// and script-laden HTML (no script runs, nothing is fetched); a
// clipboard holding only files; a paste into a document whose first
// block is a table; a paste while an input method is composing (a
// real input method through the DevTools protocol, then a real
// Ctrl-V during it); 1000 rapid real Ctrl-V presses; Replace all
// over 50,000 paragraphs (under 5 s, one undo step); regular
// expression characters found as typed; and 500 seeded random
// actions mixing typing, real copy and cut keys, pastes (synthetic
// ClipboardEvents with random plain and HTML payloads, and real
// Ctrl-V), Find and Replace, undo and redo, and Save (after each:
// the selection valid; the model passes ModelCheck.checkBlock; no
// error box), then undoing everything gives back the opened model.
// No page errors; no network request from any paste.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r, REL } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' + p(r('a cell')) + '</w:tc></w:tr></w:tbl>';
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const LINK = '<w:hyperlink r:id="rIdL"><w:r><w:t>a link</w:t></w:r></w:hyperlink>';
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) },
  { docRels: [['rIdL', REL('hyperlink'), 'http://example.com/', 'External']] });
const BIGP = (i) => `${i}: the quick brown fox jumps over the lazy dog.`;
const BIGP29999 = BIGP(29999);
const files = {
  Big: Array.from(await docx(Array.from({ length: 50000 }, (_, i) => p(r(BIGP(i)))).join(''))),
  Plain: Array.from(await docx(Array.from({ length: 30 }, (_, i) => p(r(`${i}: ` + WORDS.slice(0, 3 + (i % 5)).join(' ')))).join(''))),
  TableFirst: Array.from(await docx(TBL + p(r('after the table')) + TBL)),
  Regex: Array.from(await docx([p(r('a.*b (x) [y] $1 ^start end$ back\\slash a|b {2} +? axb')), p(r('a.b and a.*b again'))].join(''))),
  Mixed: Array.from(await docx(p(r('Bold ', '<w:b/>') + r('plain text with words.')) + p(r('A ') + LINK + r(' after.')) +
    TBL + p(r('Tab') + '<w:r><w:tab/></w:r>' + r('stop') + '<w:r><w:br/></w:r>' + r('line two')) +
    p(r('Emoji \u{1F600} e\u0301 here, the end.')) + p(r('Last paragraph of the document.')))),
};

const out = [];
const live = (s) => { if (process.env.LIVE) console.error(s.slice(0, 600)); };
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); live(out.at(-1)); };
const info = (s) => { out.push('INFO ' + s); live(out.at(-1)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
/** Every block of a JSON model passes checkBlock: '' or the error. */
const modelBad = (json) => {
  try {
    for (const s of JSON.parse(json)) for (const b of s.blocks) checkBlock(b);
    return '';
  } catch (e) {
    return e.message;
  }
};

const { browser, page, logs } = await launch();
const requests = [];
page.on('request', (q) => requests.push(q.url()));
const ev = (fn, arg) => page.evaluate(fn, arg);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
const timings = [];

try {
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Linux x86_64', configurable: true }); });
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
  await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__frameMs = () => new Promise((res) => { const t = performance.now(); requestAnimationFrame(() => res(performance.now() - t)); });
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__client = (w, x, y) => {
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Open leaf in Word, its window at a known place, the caret in it: the test hook's entry (window.__dw). */
    window.__open = async (leaf, h = 400) => {
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 200 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 760, h, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      const dw = window.__word().word.docs.find((d) => d.win === real.win);
      dw.close = () => real.close();
      window.__dw = dw;
      return dw;
    };
    /** Close every open document, discarding changes. */
    window.__closeAll = async () => {
      for (const d of window.__word()?.word.docs ?? []) d.dw.close?.();
      await window.__frames(2);
    };
    window.__at = (dw, i, off) => ({ id: dw.view.layout.items[i].id, off });
    window.__sel = (dw, i, o, j = i, o2 = o) => dw.view.setSelection(window.__at(dw, i, o), window.__at(dw, j, o2));
    window.__json = (dw) => JSON.stringify(dw.d.doc.sections);
    window.__undoAll = (dw) => { let n = 0; while (dw.d.canUndo && n < 5000) { dw.view.press('undo'); n++; } dw.view.flush(); return n; };
    window.__dt = ({ text, html, files = 0 } = {}) => {
      const dt = new DataTransfer();
      if (text != null) dt.setData('text/plain', text);
      if (html != null) dt.setData('text/html', html);
      for (let i = 0; i < files; i++) dt.items.add(new File(['x' + i], 'pic' + i + '.png', { type: 'image/png' }));
      return dt;
    };
    /** A paste as the browser fires it, into dw's window: whether it was prevented. */
    window.__fire = (dw, o) => {
      if (os.wimp.caret?.window !== dw.win) dw.dw.view.focus();
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
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /** '' if the selection of dw is valid, else what is wrong. */
    window.__bad = (dw) => {
      const L = dw.view.layout, s = dw.view.selection;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const q of [s.anchor, s.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'box') { if (q.off > 1) return 'box off'; continue; }
        const text = it.block.text;
        if (q.off > text.length) return `off ${q.off} > ${text.length}`;
        if (q.off === text.length || q.off === 0) continue;
        let inside = true;
        const base = Math.max(0, q.off - 64);
        for (const g of seg.segment(text.slice(base, q.off + 64))) {
          if (g.index + base === q.off) { inside = false; break; }
        }
        if (inside) return `${q.off} inside a cluster`;
      }
      return '';
    };
  }, files);

  // ---------------------------------------------------- 50,000 paragraphs: select all, copy; Replace all
  {
    await ev(() => window.__open('Big'));
    await press('Control+a');
    const t0 = Date.now();
    await press(MOD + '+c');
    const frame = await ev(() => window.__frameMs());
    const ms = Date.now() - t0;
    const bc = await ev(async () => { const c = await window.__read(); return { types: c.types, html: c['text/html'], len: c['text/plain']?.length, n: c['text/plain']?.split('\n').length }; });
    timings.push(`select-all copy of 50,000 paragraphs: ${ms} ms`);
    ok('50,000 paragraphs: Ctrl-A, Ctrl-C puts the plain text (over 2,000,000 characters) on the clipboard and no HTML (too big even as plain <pre>); under 3 s, responsive',
      bc.n === 50000 && bc.len > 2000000 && !bc.types.includes('text/html') && ms < 3000 && frame < 1000, { ...bc, html: bc.html?.slice(0, 80), ms, frame });
    const CUT = 'Only the first 100,000 characters were pasted: the clipboard held more.';
    /** Paste the clipboard into Plain with a real key; its state, then undone and closed. */
    const pasteIntoPlain = async () => {
      await ev(() => { window.__msgs.length = 0; return window.__open('Plain'); });
      const t1 = Date.now();
      await press(MOD + '+v');
      await settle();
      return ev(async (t1) => {
        const dw = window.__dw, n = dw.view.lines().length, res = { n, last: dw.clipboard.last, status: dw.clipboard.status, msgs: [...window.__msgs], steps: dw.view.undoDepth, ms: Date.now() - t1 };
        dw.view.press('undo');
        dw.view.flush();
        res.back = dw.view.lines().length;
        dw.close();
        window.__msgs.length = 0;
        return res;
      }, t1);
    };
    // beyond the HTML cap: !Word pastes the plain text, cut at 100,000 characters, and says so
    const bp = await pasteIntoPlain();
    timings.push(`paste of the 50,000-paragraph copy (plain): ${bp.ms} ms`);
    ok('... pasted in another document: the plain text, cut at 100,000 characters, one undo step, a message says it was cut',
      bp.last === 'plain' && bp.n > 2000 && bp.n < 2200 && bp.steps === 1 && bp.back === 30 && bp.status === CUT && bp.msgs.length === 1 && bp.msgs[0] === CUT, bp);
    // 30,000 paragraphs: the formatted HTML is over 2,000,000 characters, the plain text is not: the HTML is the
    // marker and the text in a <pre> (usable by other programs); !Word pastes it whole by the exact route
    await ev(async (end) => {
      window.__dw = window.__word().word.docs.find((d) => d.leaf === 'Big');
      window.__dw.dw.view.focus();
      window.__sel(window.__dw, 0, 0, 29999, end);
    }, BIGP29999.length);
    await press(MOD + '+c');
    const mc = await ev(async () => {
      const c = await window.__read(), html = c['text/html'] ?? '';
      const doc = new DOMParser().parseFromString(html, 'text/html'), pre = doc.querySelector('pre');
      return { types: c.types, len: html.length, marker: /^<!--word-clip:[0-9a-f]{16}--><pre>/.test(html),
        same: !!pre && pre.textContent === c['text/plain'], n: c['text/plain']?.split('\n').length,
        noScript: !doc.querySelector('script,img,iframe') };
    });
    ok('30,000 paragraphs (plain text under 2,000,000 characters, formatted HTML over): text/html is the marker and the text in <pre>, which reads back (DOMParser) as exactly the plain text',
      mc.n === 30000 && mc.types.includes('text/html') && mc.marker && mc.same && mc.len <= 2000000 && mc.noScript, mc);
    const bx = await pasteIntoPlain();
    timings.push(`paste of the 30,000-paragraph copy (exact): ${bx.ms} ms`);
    ok('... pasted in another document whole by the exact route (30,000 paragraphs, not cut at 100,000 characters), one undo step, no message',
      bx.last === 'exact' && bx.n === 30 + 29999 && bx.steps === 1 && bx.back === 30 && !bx.status && !bx.msgs.length, bx);
    await ev(() => { window.__dw = window.__word().word.docs.find((d) => d.leaf === 'Big'); window.__dw.dw.view.focus(); });

    const ra = await ev(async () => {
      const dw = window.__dw, before = window.__json(dw), d0 = dw.view.undoDepth;
      window.__sel(dw, 0, 0);
      const t0 = performance.now();
      const msg = window.__word().word.find.run('all', { find: 'fox', replace: 'cat', matchCase: false, whole: true });
      dw.view.flush();
      const ms = performance.now() - t0;
      const frame = await window.__frameMs();
      const res = { msg, ms, frame, steps: dw.view.undoDepth - d0, l: [dw.view.lines()[0], dw.view.lines()[49999]], bad: window.__bad(dw) };
      const u0 = performance.now();
      dw.view.press('undo');
      dw.view.flush();
      res.undoMs = performance.now() - u0;
      res.restored = window.__json(dw) === before;
      return res;
    });
    timings.push(`Replace all over 50,000 paragraphs: ${Math.round(ra.ms)} ms, undo ${Math.round(ra.undoMs)} ms`);
    ok('Replace all over 50,000 paragraphs: 50000 replaced in under 5 s, one undo step that restores it all, responsive',
      ra.msg === '50000 replaced' && ra.ms < 5000 && ra.steps === 1 && ra.l[0] === '0: the quick brown cat jumps over the lazy dog.' &&
      ra.l[1] === '49999: the quick brown cat jumps over the lazy dog.' && ra.restored && !ra.bad && ra.frame < 1000, ra);
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- 5 MB of text; 100,000 paragraphs of HTML
  {
    const big = await ev(async () => {
      const dw = await window.__open('Plain'), before = window.__json(dw), d0 = dw.view.undoDepth;
      window.__sel(dw, 3, 2);
      const line = 'x'.repeat(49) + '\n';
      const text = line.repeat(100000);               // 5,000,000 characters
      let t0 = performance.now();
      const pv = window.__fire(dw, { text });
      dw.view.flush();
      const ms = performance.now() - t0, frame = await window.__frameMs();
      const n = dw.view.lines().length, chars = dw.view.lines().reduce((k, l) => k + (l?.length ?? 0), 0);
      const r1 = { pv, ms, frame, n, steps: dw.view.undoDepth - d0, last: dw.clipboard.last, bad: window.__bad(dw), status: dw.clipboard.status, msgs: [...window.__msgs] };
      window.__msgs.length = 0;
      dw.view.press('undo');
      dw.view.flush();
      r1.restored = window.__json(dw) === before;
      // 100,000 paragraphs of HTML
      const html = Array.from({ length: 100000 }, (_, i) => `<p>${i}</p>`).join('');
      t0 = performance.now();
      window.__fire(dw, { text: 'fallback', html });
      dw.view.flush();
      const r2 = { len: html.length, ms: performance.now() - t0, frame: await window.__frameMs(), n: dw.view.lines().length, last: dw.clipboard.last,
        steps: dw.view.undoDepth - d0, bad: window.__bad(dw), first: dw.view.lines()[3], tail: dw.view.lines().slice(-2) };
      const u0 = performance.now();
      dw.view.press('undo');
      dw.view.flush();
      r2.undoMs = performance.now() - u0;
      r2.restored = window.__json(dw) === before;
      return { r1: { ...r1, chars }, r2 };
    });
    timings.push(`5 MB text paste: ${Math.round(big.r1.ms)} ms; 100,000-paragraph HTML paste: ${Math.round(big.r2.ms)} ms, undo ${Math.round(big.r2.undoMs)} ms`);
    // (the Wimp cuts the text at 100,000 characters: 2000 lines of 49 x and a new line; the last is joined to the paragraph)
    const CUT = 'Only the first 100,000 characters were pasted: the clipboard held more.';
    ok('a paste of 5 MB of text: cut to 100,000 characters (2000 new paragraphs), one undo step, quick and responsive; a message says it was cut',
      big.r1.pv && big.r1.n === 30 + 2000 && big.r1.steps === 1 && big.r1.last === 'plain' && big.r1.restored && !big.r1.bad &&
      big.r1.status === CUT && big.r1.msgs.length === 1 && big.r1.msgs[0] === CUT &&
      big.r1.ms < 5000 && big.r1.frame < 1000, big.r1);
    info(`100,000 paragraphs of HTML (${big.r2.len} characters) gave ${big.r2.n - 30} new paragraphs (the reader stops at 200,000 nodes)`);
    ok('a paste of 100,000 paragraphs of HTML: read up to the reader\'s node limit, one undo step that restores it, under 10 s',
      big.r2.last === 'html' && big.r2.n - 30 >= 90000 && big.r2.steps === 1 && big.r2.restored && !big.r2.bad &&
      big.r2.ms < 10000 && big.r2.undoMs < 5000 && big.r2.frame < 1000, big.r2);
    // the message only when something was lost: 99,999, 100,000 and 100,001 characters; an emoji across the cap
    const edge = await ev(() => {
      const dw = window.__dw, E = '\u{1F600}', out = {};
      const cases = { '99999': 'x'.repeat(99999), '100000': 'x'.repeat(100000), '100001': 'x'.repeat(100001),
        'emoji ends at 100000': 'x'.repeat(99998) + E, 'emoji across the cap': 'x'.repeat(99999) + E,
        '100000 with CR LF': 'x'.repeat(99998) + '\r\n' + 'y', '100000 and controls': 'x'.repeat(100000) + '\u0007\u0001' };
      for (const [k, text] of Object.entries(cases)) {
        window.__msgs.length = 0;
        window.__sel(dw, 3, 2);
        window.__fire(dw, { text });
        dw.view.flush();
        out[k] = { msg: window.__msgs.length, status: dw.clipboard.status, last: dw.clipboard.last };
        dw.view.press('undo');
        dw.view.flush();
      }
      window.__msgs.length = 0;
      return out;
    });
    const said = Object.fromEntries(Object.entries(edge).map(([k, v]) => [k, v.msg === 1 && v.status === CUT]));
    ok('the "cut" message only when text was lost: not for 99,999 / 100,000 characters (also an emoji ending at the cap, CR LF, dropped controls), but for 100,001 and an emoji across the cap',
      same(said, { '99999': false, '100000': false, '100001': true, 'emoji ends at 100000': false, 'emoji across the cap': true,
        '100000 with CR LF': false, '100000 and controls': false }) && Object.values(edge).every((v) => v.last === 'plain'), edge);
  }

  // ---------------------------------------------------- 10,000-deep and script-laden HTML; files only
  {
    const req0 = requests.length;
    const HOSTILE = '<p>safe <a href="javascript:window.__pwned=3" onclick="window.__pwned=5">click</a></p><script>window.__pwned=1</script>' +
      '<img src="/hostile-a.png" onerror="window.__pwned=2"><iframe src="/hostile-b.html" onload="window.__pwned=6"></iframe>' +
      '<svg onload="window.__pwned=4"><image href="/hostile-c.png"/><text>svgtext</text></svg><math><mi>m</mi></math>' +
      '<style>@import url(/hostile-d.css); p { background: url(/hostile-e.png) }</style><link rel="stylesheet" href="/hostile-f.css">' +
      '<object data="/hostile-g.swf"></object><embed src="/hostile-h.swf"><video src="/hostile-i.mp4" poster="/hostile-j.png"></video>' +
      '<base href="http://evil.example/"><meta http-equiv="refresh" content="0;url=/hostile-k">' +
      '<form action="/hostile-l"><input value="v" autofocus onfocus="window.__pwned=7"></form>' +
      '<p style="background:url(/hostile-m.png);color:expression(alert(1))">styled</p>' +
      '<div>'.repeat(10000) + '<b>deep</b>' + '</div>'.repeat(10000) + '<p>end</p>';
    const hz = await ev(async (h) => {
      const dw = window.__dw, before = window.__json(dw), n0 = document.querySelectorAll('*').length;
      window.__sel(dw, 1, 0);
      const t0 = performance.now();
      window.__fire(dw, { text: 'safe click', html: h });
      dw.view.flush();
      const ms = performance.now() - t0;
      await window.__sleep(500);
      const L = dw.view.lines().slice(1, 8);
      const inl = dw.d.doc.sections[0].blocks.slice(0, 8).map((b) => Object.keys(b.inlines || {}).length);
      dw.view.press('undo');
      dw.view.flush();
      return { ms, L, inl, restored: window.__json(dw) === before, pwned: window.__pwned ?? null, added: document.querySelectorAll('*').length - n0, msgs: window.__msgs.length };
    }, HOSTILE);
    await wait(300);
    const hreq = requests.slice(req0);
    ok('10,000-deep, script-laden HTML: its text only, links as text, one undo step; no script ran, no element added, no request, no error box',
      hz.L[0] === 'safe click' && hz.L.includes('styled') && hz.L.some((l) => /deep/.test(l)) && hz.L.some((l) => /end/.test(l)) &&
      !hz.L.some((l) => /pwned|svgtext|import/.test(l)) && hz.inl.every((n) => n === 0) && hz.restored && hz.pwned === null &&
      Math.abs(hz.added) <= 2 && hreq.length === 0 && !hz.msgs && hz.ms < 3000, { hz, hreq });

    const fo = await ev(() => {
      const dw = window.__dw, before = window.__json(dw), b0 = window.__beeps;
      window.__msgs.length = 0;
      const pv = window.__fire(dw, { files: 3 });
      const pv2 = window.__fire(dw, { files: 9 });
      return { pv, pv2, beeps: window.__beeps - b0, msgs: [...window.__msgs], same: window.__json(dw) === before, last: dw.clipboard.last };
    });
    ok('a clipboard with only files (3, then 9): nothing pasted, a beep and the message each time',
      fo.pv && fo.pv2 && fo.beeps === 2 && fo.msgs.length === 2 && /Pictures and files cannot be pasted/.test(fo.msgs[0]) && fo.same && fo.last === 'files', fo);
    await ev(() => { window.__msgs.length = 0; });
  }

  // ---------------------------------------------------- a table first
  {
    const t = await ev(async () => {
      const dw = await window.__open('TableFirst'), before = window.__json(dw);
      dw.view.setSelection(window.__at(dw, 0, 0));
      window.__fire(dw, { text: 'one\ntwo', html: '<p>one</p><p><b>two</b></p>' });
      dw.view.flush();
      const l1 = dw.view.lines(), bad1 = window.__bad(dw);
      dw.view.press('undo');
      dw.view.flush();
      const back1 = window.__json(dw) === before;
      // after the table (its end), plain text
      dw.view.setSelection(window.__at(dw, 0, 1));
      window.__fire(dw, { text: 'x\ny' });
      dw.view.flush();
      const l2 = dw.view.lines(), bad2 = window.__bad(dw);
      // the whole document selected (tables in it) and pasted over
      dw.view.press('selectAll');
      window.__fire(dw, { text: 'all gone' });
      dw.view.flush();
      const l3 = dw.view.lines(), json = window.__json(dw), bad3 = window.__bad(dw);
      window.__undoAll(dw);
      return { l1, l2, l3, bad: bad1 + bad2 + bad3, back1, json, restored: window.__json(dw) === before };
    });
    ok('a document whose first block is a table: a paste at its start goes in paragraphs before it, after its end in one after it; over everything; undo exact',
      same(t.l1.slice(0, 3), ['one', 'two', null]) && t.back1 && t.l2[0] === null && same(t.l2.slice(1, 3), ['x', 'y']) &&
      t.l3.includes('all gone') && !t.bad && !modelBad(t.json) && t.restored, { ...t, json: undefined });
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- a paste while an input method is composing (real IME, CDP)
  {
    const cdp = await page.context().newCDPSession(page);
    const pt = await ev(async () => {
      const dw = await window.__open('Plain'), c = dw.view.layout.caretRect(window.__at(dw, 2, 2));
      window.__opened = window.__json(dw);
      return window.__client(dw.win, c.x + 1, c.y + c.h / 2);
    });
    await page.mouse.click(pt.x, pt.y);
    await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 });
    await settle();
    const c1 = await ev(() => {
      const dw = window.__dw, b0 = window.__beeps;
      const comp = dw.view.composing;
      const pv = window.__fire(dw, { text: 'zz', html: '<p>zz</p>' });
      return { comp, pv, beeps: window.__beeps - b0, last: dw.clipboard.last, same: window.__json(dw) === window.__opened, comp2: dw.view.composing };
    });
    ok('real input method composing: a paste is refused with a beep, the document unchanged, the composition goes on',
      c1.comp === '\u306b' && c1.pv && c1.beeps === 1 && c1.last === 'composing' && c1.same && c1.comp2 === '\u306b', c1);
    // a real Ctrl-V during the composition
    await ev(() => navigator.clipboard.writeText('PASTED'));
    await press(MOD + '+v');
    await settle();
    const c2 = await ev(() => { const dw = window.__dw; return { comp: dw.view.composing, last: dw.clipboard.last, line: dw.view.lines()[2], bad: window.__bad(dw), json: window.__json(dw) }; });
    info(`a real ${MOD}-V during a composition: route ${c2.last}, composing ${JSON.stringify(c2.comp)}, line ${JSON.stringify(c2.line)}`);
    await cdp.send('Input.insertText', { text: '\u65e5' });
    await settle();
    const c3 = await ev(async () => {
      const dw = window.__dw, line = dw.view.lines()[2];
      window.__fire(dw, { text: 'ok' });
      dw.view.flush();
      const res = { line, after: dw.view.lines()[2], comp: dw.view.composing, bad: window.__bad(dw), json: window.__json(dw), last: dw.clipboard.last };
      window.__undoAll(dw);
      res.restored = window.__json(dw) === window.__opened;
      return res;
    });
    ok('... a real Ctrl-V during it pastes nothing into the composition; after the commit a paste works; undo restores; valid',
      (c2.last === 'composing' || !c2.line.includes('PASTED\u306b')) && !c2.bad && !modelBad(c2.json) &&
      c3.line.includes('\u65e5') && c3.comp === null && c3.after.includes('\u65e5ok') && c3.last === 'plain' && !c3.bad && !modelBad(c3.json) && c3.restored,
      { c2: { ...c2, json: undefined }, c3: { ...c3, json: undefined } });
    await cdp.detach();
  }

  // ---------------------------------------------------- 1000 rapid real Ctrl-V presses
  {
    await ev(async () => {
      const dw = window.__dw;
      window.__sel(dw, 4, 0);
      dw.dw.view.focus();
      window.__d0 = dw.view.undoDepth;
      window.__l0 = dw.view.lines()[4];
      await navigator.clipboard.writeText('ab');
    });
    const t0 = Date.now();
    await press(MOD + '+v', 1000);
    await settle();
    const ms = Date.now() - t0;
    const rp = await ev(async () => {
      const dw = window.__dw, l = dw.view.lines()[4];
      return { ok: l === 'ab'.repeat(1000) + window.__l0, len: l.length, steps: dw.view.undoDepth - window.__d0, frame: await window.__frameMs(), bad: window.__bad(dw) };
    });
    timings.push(`1000 real ${MOD}-V presses: ${ms} ms`);
    ok(`1000 rapid real ${MOD}-V presses: every one pasted, one undo step each (the last 1000 kept), still responsive`,
      rp.ok && rp.steps >= 999 && rp.frame < 1000 && !rp.bad, { ...rp, ms });
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- regular expression characters
  {
    const rx = await ev(async () => {
      const dw = await window.__open('Regex'), f = window.__word().word.find, before = window.__json(dw);
      const opts = { matchCase: false, whole: false };
      window.__sel(dw, 0, 0);
      const res = {};
      for (const n of ['a.*b', '(x)', '[y]', '$1', '^start', 'end$', 'back\\slash', 'a|b', '{2}', '+?', 'a.b', '.']) {
        window.__sel(dw, 0, 0);
        const m = f.run('next', { ...opts, find: n });
        res[n] = [m, dw.view.text()];
      }
      window.__sel(dw, 0, 0);
      const all = f.run('all', { ...opts, find: 'a.*b', replace: '$&' });
      const lines = dw.view.lines();
      const none = f.run('all', { ...opts, find: 'a.c', replace: 'Q' });
      window.__undoAll(dw);
      return { res, all, lines, none, restored: window.__json(dw) === before };
    });
    const found = Object.entries(rx.res).every(([n, [, t]]) => t === n);
    ok('regular expression characters are found as typed (a.*b, (x), [y], $1, ^, $, \\, |, {2}, +?, .): never as patterns',
      found && rx.res['a.b'][1] === 'a.b' && rx.all === '2 replaced' && rx.lines[0].startsWith('$&') && rx.lines[1] === 'a.b and $& again' &&
      /Not found/.test(rx.none) && rx.restored, rx);
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- 500 seeded random actions
  {
    const box = await ev(async () => {
      const dw = await window.__open('Mixed', 360), w = dw.win;
      window.__opened = window.__json(dw);
      window.__msgs.length = 0;
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    });
    const req0 = requests.length;
    const rnd = rng(20261008), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Shift+ArrowLeft', 'Shift+ArrowRight',
      'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Enter', 'Backspace', 'Delete', 'Control+z', 'Control+y', 'F8', 'F9'];
    const TEXT = ['a', ' ', 'word ', '\u00e9', 'e\u0301', '\u{1F600}', '\u4e2d', 'the '];
    const HTML = ['<p><b>bold</b> <i>it</i></p><p>two</p>', '<h2>Head</h2><ul><li>x</li><li>y</li></ul>',
      '<table><tr><td>c1</td><td>c2</td></tr></table>', '<a href="javascript:alert(1)">js</a><img src="/hostile-r.png" onerror="window.__pwned=9">',
      '<div>'.repeat(500) + 'deep' + '</div>'.repeat(500), '<p style="color:#f00;font-size:30pt">red</p><br><pre>a\n b</pre>',
      '<b style="font-weight:normal" id="docs-internal-guid-x"><span>gdocs</span></b>', 'plain &amp; &lt;html&gt; \u{1F600}', ''];
    const PLAIN = ['p', 'two\nlines', 'tab\there', '', '\u{1F469}\u200d\u{1F4BB}', 'x'.repeat(300), 'a\r\nb'];
    const NEEDLES = ['the', 'a', 'e', '.', 'link', 'Tab', '\u{1F600}', 'zz', 'a.*b'];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + 2 + rnd() * (box.y1 - box.y0 - 4) });
    const bad = [], kinds = {};
    let checked = 0;
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.2) {
        what = 'key';
        await page.keyboard.press(pick(KEYS));
      } else if (a < 0.35) {
        what = 'type';
        await page.keyboard.insertText(pick(TEXT));
      } else if (a < 0.45) {
        what = rnd() < 0.6 ? 'copy' : 'cut';
        await page.keyboard.press(MOD + (what === 'copy' ? '+c' : '+x'));
      } else if (a < 0.65) {
        what = 'paste event';
        const o = { text: pick(PLAIN) };
        if (rnd() < 0.6) o.html = pick(HTML);
        if (rnd() < 0.05) o.files = 1;
        await ev((o) => window.__fire(window.__dw, o), o);
      } else if (a < 0.7) {
        what = 'real paste';
        await page.keyboard.press(MOD + '+v');
      } else if (a < 0.8) {
        what = 'find';
        const action = pick(['next', 'next', 'prev', 'replace', 'all']);
        await ev(([action, f]) => window.__word().word.find.run(action, f),
          [action, { find: pick(NEEDLES), replace: pick(['', 'R', 'two words', '\u00e9']), matchCase: rnd() < 0.3, whole: rnd() < 0.3 }]);
      } else if (a < 0.83) {
        what = 'save';
        await page.keyboard.press('Control+s');
        await wait(30);
      } else if (a < 0.9) {
        what = 'undo/redo';
        await ev((n) => { const v = window.__dw.view; for (let i = 0; i < n; i++) v.press(i % 3 === 2 ? 'redo' : 'undo'); v.flush(); }, 1 + Math.floor(rnd() * 4));
      } else {
        what = 'mouse';
        const q = at(), b = rnd();
        if (b < 0.5) await page.mouse.click(q.x, q.y);
        else if (b < 0.7) await page.mouse.dblclick(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      }
      kinds[what] = (kinds[what] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const dw = window.__dw;
        // the Find box is never left with the caret, so keys go to the document
        if (os.wimp.caret?.window !== dw.win && !os.wimp.menus.isOpen) dw.dw.view.focus();
        return { why: window.__bad(dw) + (window.__msgs.length ? ' msgs: ' + window.__msgs.join('|') : '') + (os.wimp.menus.isOpen ? ' menu' : ''), json: window.__json(dw) };
      });
      const m = modelBad(s.json);
      checked++;
      if ((s.why.replace(' menu', '') || m) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${m}`);
      if (s.why.includes('menu')) await ev(() => os.wimp.menus.close());
      if (s.why.includes('msgs')) await ev(() => { window.__msgs.length = 0; });
    }
    await wait(300);
    const end = await ev(async () => {
      const dw = window.__dw, n = window.__undoAll(dw);
      await window.__frames(2);
      const res = { n, same: window.__json(dw) === window.__opened, bad: window.__bad(dw), errs: window.__msgs.length, pwned: window.__pwned ?? null };
      return res;
    });
    // (the desktop's own sprites, such as the Find box's option icons drawn the first time, are not from a paste)
    const own = (u) => u.startsWith(new URL('assets/sprites/', BASE_URL).href);
    const rreq = requests.slice(req0).filter((u) => !own(u));
    info('random actions: ' + JSON.stringify(kinds) + '; the desktop\'s own sprites loaded meanwhile: ' + requests.slice(req0).filter(own).length);
    ok('500 random typing, copy, cut, paste, Find / Replace, undo, Save and mouse actions: selection and model valid after each; undoing everything gives the opened model; no request',
      !bad.length && checked === 500 && end.same && !end.bad && !end.errs && end.pwned === null && !rreq.length && !pageErrors(), { bad, end, rreq: rreq.slice(0, 5) });
    await ev(() => window.__closeAll());
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log('timings: ' + timings.join('; '));
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
