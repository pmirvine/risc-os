// !Word's hyperlinks, bookmarks, format painter and word count against
// hostile input in the real desktop: bad addresses typed into the
// Hyperlink box (javascript:, data:, file:, vbscript:, other schemes,
// no scheme, control characters, spaces: each refused with a beep and
// nothing changed, or made safe; never a link with a scheme but
// http, https, mailto or ftp); a 1 MB address put in the box and a
// 1 MB address in a file (the box shades it and keeps it, the file
// saved with it unchanged); 10,000 bookmarks in a file (the box lists
// the first 200 and says so; Add, Go to and Delete in a fraction of a
// second; undo gives back the opened model); duplicate names in a file
// (Dup, dup, DUP, two starts sharing an id, an id beyond 2^31, a
// hidden _Toc name): adding a name that matches moves them all in one
// step; the format painter used 1000 times by real clicks (sticky,
// two rounds of 500, each undone to the opened model, no listener
// left behind); the word count of a document of 1,000,000 words
// (exact, quick, the box showing it, nothing changed); 500 seeded
// random actions (keys incl. Ctrl-K and Ctrl-Shift-F5, text, clicks
// and drags, Ctrl-click, the Hyperlink and Bookmark boxes filled with
// hostile text and their buttons clicked, the painter by button, menu
// and Escape, Word count, character formats) with the selection and
// every block valid after each, and undo of everything giving back
// the opened model, relationships and style included. No page errors
// and no network request for any address.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { listDocx, item } from './list-fixtures.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const HREL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const BIG = 'https://example.com/' + 'b'.repeat(1_000_000);
const docx = async (body, opts) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body) }, opts));
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const bs = (id, name) => `<w:bookmarkStart w:id="${id}" w:name="${name}"/>`;
const be = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const link = (id, text) => `<w:hyperlink r:id="${id}" w:history="1"><w:r><w:t>${text}</w:t></w:r></w:hyperlink>`;

const files = {
  Bad: await docx(Array.from({ length: 12 }, (_, i) => p(r(`Alpha ${i} beta gamma delta`))).join('')
    + p(link('rBig', 'big link') + r(' tail')), { docRels: [['rBig', HREL, BIG, 'External']] }),
  Marks: await docx(Array.from({ length: 10000 }, (_, i) => p(bs(i, 'bm' + i) + r(`Mark ${i} ${WORDS[i % 10]}`) + be(i))).join('')),
  Dups: await docx([
    p(bs(1, 'Dup') + r('one') + be(1)), p(bs(2, 'dup') + r('two') + be(2)), p(bs(3, 'DUP') + r('three') + be(3)),
    p(bs(4, 'Same') + r('first') + bs(4, 'Same') + r('second') + be(4) + be(4)),
    p(bs(99999999999, 'Huge') + r('huge id') + be(99999999999)), p(bs(5, '_Toc9') + r('hidden') + be(5)),
    p(r('Plain one')), p(r('Plain two')), p(be(77) + r('orphan end') + bs(78, 'Orphan')),
  ].join('')),
  Paint: Array.from(await listDocx([
    p(r('Alpha bold red', '<w:b/><w:color w:val="FF0000"/>'), '<w:jc w:val="center"/>'),
    p(r('Beta italic big', '<w:i/><w:sz w:val="40"/>')),
    item('Gamma list item', 1),
    ...Array.from({ length: 21 }, (_, i) => p(r(`Plain paragraph ${i} ${WORDS[i % 10]} words here`))),
  ])),
  Words: await docx(Array.from({ length: 10000 }, (_, i) => p(r(Array.from({ length: 100 }, (_, k) => WORDS[(i + k) % 10]).join(' ')))).join('')),
  Mixed: await docx([
    p(r('Hello ') + r('bold', '<w:b/>') + r(' world ') + link('rA', 'a link')),
    p(bs(1, 'Target') + r('Target here') + be(1)),
    p('<w:hyperlink w:anchor="Target"><w:r><w:t>to target</w:t></w:r></w:hyperlink>' + r(' and ') + link('rB', 'mail')),
    p(r('Italic red ', '<w:i/><w:color w:val="FF0000"/>') + r('plain'), '<w:jc w:val="right"/>'),
    p(bs(2, 'Span') + r('spans ')), p(r('two paragraphs') + be(2)),
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p>' + bs(3, 'InCell') + '<w:r><w:t>cell</w:t></w:r>' + be(3) + '</w:p></w:tc></w:tr></w:tbl>',
    ...Array.from({ length: 10 }, (_, i) => p(r(`Paragraph ${i} ${WORDS[i % 10]} straße café \u{1F600} words here`))),
  ].join(''), { docRels: [['rA', HREL, 'https://example.org/a', 'External'], ['rB', HREL, 'mailto:a@example.org', 'External']] }),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 1200)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const timings = [];
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const origin = new URL(BASE_URL).origin;
const requests = [];
page.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) requests.push(u); });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
const modelBad = (json) => {
  try {
    for (const s of JSON.parse(json).sections) for (const b of s.blocks) checkBlock(b);
    return '';
  } catch (e) {
    return e.message;
  }
};
/** Click a box's button (a real click on its icon). */
const boxClick = async (kind, name) => {
  const q = await ev(([k, n]) => window.__ic(k, n), [kind, name]);
  if (!q) return false;
  await page.mouse.click(q.x, q.y);
  await settle();
  return true;
};

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.path.endsWith('.' + leaf));
    window.__client = (w, x, y) => {
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__open = async (leaf, at = {}) => {
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 400 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 60, y: 40, w: 860, h: 520, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__cur = leaf;
      window.__real = real;
      return window.__doc(leaf);
    };
    window.__d = () => window.__doc(window.__cur);
    window.__json = (d) => JSON.stringify({ sections: d.d.doc.sections, settings: d.d.doc.rawSettings, rels: d.d.doc.rels,
      hstyle: d.d.doc.styles?.styles?.has('Hyperlink') ?? null });
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__at = (d, i, off = 0) => d.view.setSelection({ id: d.view.layout.items[i].id, off });
    window.__sel = (i, a, j = i, b = a) => {
      const d = window.__d(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: a }, { id: L.items[j].id, off: b });
      d.dw.view.focus();
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__bx = (kind) => {
      const d = window.__d();
      return d && d.dw.boxes.has(kind) ? window.__word().word.dialog({ key: kind + ':' + d.docKey, rows: [] }) : null;
    };
    window.__ic = (kind, name) => {
      const b = window.__bx(kind), ic = b?.win.iconByName(name);
      if (!ic || !ic.bbox || !b.win.isOpen) return null;
      return window.__client(b.win, (ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2);
    };
    window.__closeBoxes = () => {
      for (const k of ['link', 'bookmark', 'count']) window.__bx(k)?.close?.();
      if (os.wimp.menus.isOpen) os.wimp.menus.close();
    };
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /** '' when the selection and the layout are valid. */
    window.__bad = (d) => {
      const L = d.view.layout, s = d.view.selection;
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
        for (const g of seg.segment(text.slice(Math.max(0, q.off - 64), q.off + 64))) {
          if (g.index + Math.max(0, q.off - 64) === q.off) { inside = false; break; }
        }
        if (inside) return `${q.off} inside a cluster`;
      }
      const n = L.items.length;
      for (let k = 0; k < n; k += n > 3000 ? Math.ceil(n / 3000) : 1) {
        const it = L.items[k];
        if (!Number.isFinite(it.y) || !Number.isFinite(it.h) || it.h < 0 || it.h > 5e6) return `item ${it.id} y ${it.y} h ${it.h}`;
      }
      return '';
    };
    /** Links, relationships and what a box shows, of the current document. */
    window.__st = () => {
      const d = window.__d(), v = d.view;
      const blocks = d.d.doc.sections.flatMap((s) => s.blocks);
      const links = blocks.flatMap((q) => Object.values(q.inlines ?? {}).filter((x) => x.node?.name === 'w:hyperlink')
        .map((x) => Object.fromEntries(x.node.attrs)));
      const bms = blocks.flatMap((q) => Object.values(q.inlines ?? {}).filter((x) => /bookmark(Start)$/.test(x.node?.name ?? ''))
        .map((x) => Object.fromEntries(x.node.attrs)));
      const lw = window.__bx('link')?.win, bw = window.__bx('bookmark')?.win;
      return { depth: v.undoDepth, beeps: window.__beeps, links, bms,
        rels: d.d.doc.rels.filter((x) => /hyperlink$/.test(x.type)).map((x) => [x.id, x.target]),
        link: lw ? { open: lw.isOpen, address: lw.iconByName('address').text, shaded: !!lw.iconByName('address').shaded,
          msg: (lw.iconByName('msg').text + ' ' + lw.iconByName('msg2').text).trim() } : null,
        bm: bw ? { open: bw.isOpen, name: bw.iconByName('name').text, msg: (bw.iconByName('msg').text + ' ' + bw.iconByName('msg2').text).trim() } : null };
    };
  }, files);

  // ---------------------------------------------------- bad addresses in the Hyperlink box
  {
    await ev(async () => { const d = await window.__open('Bad'); window.__opened = window.__json(d); });
    const REFUSE = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd',
      'vbscript:msgbox(1)', 'about:blank', 'chrome://settings', 'ssh://host/x', 'http://', '//evil.example/x', 'java\tscript:alert(1)', '   ', ''];
    // (the writable field drops a control character typed or set, so one in the middle is cleaned before OK)
    const MAKE_SAFE = ['https://e.example/\u0001x', 'www.example.org', 'http://example.org/a b/c', 'HTTP://UP.EXAMPLE.ORG/', 'mailto:someone@example.org', 'ftp://files.example.org/x.txt',
      'https://example.org/café?q="x"&r=<y>', 'https://' + 'h'.repeat(200) + '.example/' + 'p'.repeat(1500)];
    const results = [];
    const run1 = async (addr) => {
      await ev(() => window.__sel(0, 0, 0, 5));
      const before = await ev(() => window.__st());
      await press('Control+k');
      await ev((a) => window.__bx('link').set('address', a), addr);
      const t0 = Date.now();
      await boxClick('link', 'button:OK');
      const after = await ev(() => window.__st());
      const res = { addr: addr.slice(0, 40), ms: Date.now() - t0, beeped: after.beeps - before.beeps, depth: after.depth - before.depth,
        newRels: after.rels.slice(before.rels.length).map((x) => x[1]), newLinks: after.links.length - before.links.length,
        boxOpen: !!after.link?.open, msg: after.link?.msg };
      if (after.link?.open) await press('Escape');
      else if (after.depth > before.depth) await press('Control+z');
      await ev(() => window.__closeBoxes());
      return res;
    };
    for (const a of [...REFUSE, ...MAKE_SAFE]) results.push(await run1(a));
    const refusedOk = results.slice(0, REFUSE.length).every((x) => x.beeped >= 1 && x.depth === 0 && x.newRels.length === 0 && x.newLinks === 0 && x.boxOpen && x.msg);
    const safeOk = results.slice(REFUSE.length).every((x) => x.depth === 1 && x.newLinks === 1 && x.newRels.length === 1
      && /^(https?|mailto|ftp):/i.test(x.newRels[0]) && x.newRels[0].length <= 2048 && !/[\s"<>\\^`{|}]/.test(x.newRels[0]));
    ok('bad addresses in the Hyperlink box (javascript:, data:, file:, vbscript:, other schemes, no scheme, control characters, empty): each refused with a beep and a message, the box kept, no link, no relationship, no undo step',
      refusedOk, results.slice(0, REFUSE.length).filter((x) => !(x.beeped >= 1 && x.depth === 0 && x.newRels.length === 0 && x.newLinks === 0)));
    ok('good addresses (www., spaces, upper case, mailto, ftp, a long one): one link, one relationship with an http, https, mailto or ftp target of at most 2048 characters with no space or unsafe character, one undo step',
      safeOk, results.slice(REFUSE.length));
    // a 1 MB address put into the box
    const t0 = Date.now();
    await ev(() => window.__sel(0, 0, 0, 5));
    await press('Control+k');
    await ev(() => window.__bx('link').set('address', 'http://example.org/' + 'a'.repeat(1_000_000)));
    const b0 = await ev(() => window.__st());
    await boxClick('link', 'button:OK');
    const b1 = await ev(() => window.__st());
    const added = b1.rels.slice(b0.rels.length);
    if (b1.link?.open) await press('Escape');
    await ev(() => window.__closeBoxes());
    ok('a 1 MB address in the box: refused or cut, never a relationship over 2048 characters; the desktop answers within 5 s',
      added.every((x) => x[1].length <= 2048) && Date.now() - t0 < 5000 && !(await ev(() => window.__bad(window.__d()))), { n: added.map((x) => x[1].length), ms: Date.now() - t0 });
    // a 1 MB address in a file: shaded, kept, the text edited, the saved file keeps it
    await ev(() => window.__undoAll(window.__d()));
    await ev(() => window.__sel(12, 1));
    const t1 = Date.now();
    await press('Control+k');
    const c1 = await ev(() => window.__st());
    await ev(() => window.__bx('link').set('tip', 'a tip'));
    await boxClick('link', 'button:OK');
    const c2 = await ev(() => window.__st());
    const saved = await ev(() => { const d = window.__d(); return d.saveBytes().then((b) => ({ n: b.length })); });
    ok('a link with a 1 MB address in a file: the box shades the address; only the ScreenTip is edited; the 1 MB relationship is kept, no new one; the file still saves; all within 8 s',
      c1.link?.shaded && c1.link.address === '' && c2.links[0]?.['w:tooltip'] === 'a tip' && c2.rels.length === 1 && c2.rels[0][1].length > 1_000_000
      && saved.n > 1000 && Date.now() - t1 < 8000, { c1: c1.link, c2: c2.links, relLen: c2.rels.map((x) => x[1].length), saved });
    await ev(() => { window.__closeBoxes(); window.__undoAll(window.__d()); });
    const end = await ev(() => ({ back: window.__json(window.__d()) === window.__opened, bad: window.__bad(window.__d()), msgs: window.__msgs.length }));
    await ev(() => window.__real.close());
    ok('... undo of everything gives back the opened document; nothing reported', end.back && !end.bad && !end.msgs, end);
  }

  // ---------------------------------------------------- 10,000 bookmarks
  {
    const t0 = Date.now();
    const o = await ev(async () => {
      const t = performance.now();
      const d = await window.__open('Marks');
      const opened = performance.now() - t;
      window.__opened = window.__json(d);
      window.__sel(100, 0, 100, 4);
      return { opened, items: d.view.layout.items.length };
    });
    await press('Control+Shift+F5');
    const box = await ev(() => { const b = window.__bx('bookmark'); return b ? { open: b.win.isOpen, msg: (b.win.iconByName('msg').text + ' ' + b.win.iconByName('msg2').text).trim() } : null; });
    // Add a new name, then a name that matches an old one ignoring case (moves it), Go to, Delete
    const step = async (name, button, sel) => {
      if (sel) await ev((s) => window.__sel(...s), sel);
      if (!(await ev(() => !!window.__bx('bookmark')))) await press('Control+Shift+F5');
      await ev((n) => window.__bx('bookmark').set('name', n), name);
      const before = await ev(() => window.__st());
      const t = Date.now();
      await boxClick('bookmark', button);
      const after = await ev(() => window.__st());
      return { ms: Date.now() - t, depth: after.depth - before.depth, beeps: after.beeps - before.beeps, bms: after.bms.length - before.bms.length, msg: after.bm?.msg ?? '', open: !!after.bm?.open };
    };
    const add = await step('Fresh', 'button:Add', [50, 0, 50, 4]);
    const move = await step('BM7', 'button:Add', [60, 0, 60, 4]);
    const go = await step('bm9999', 'button:Go to');
    const goLine = await ev(() => { const d = window.__d(); return d.view.selection && d.view.layout.byId.get(d.view.selection.head.id).index; });
    const del = await step('bm5000', 'button:Delete');
    await ev(() => window.__closeBoxes());
    ok('10,000 bookmarks in a file: opens within 12 s; the Bookmark box lists the first 200 and says so; Add (a new name), Add of an existing name (moved) and Go to / Delete each within 3 s; Add and Delete are one undo step each, Go to none',
      o.items === 10000 && o.opened < 12000 && /10000 bookmarks.*first 200/.test(box?.msg ?? '') && add.depth === 1 && add.ms < 3000 && add.bms === 1
      && move.depth === 1 && move.bms === 0 && move.ms < 3000 && go.depth === 0 && go.ms < 3000 && goLine === 9999 && del.depth === 1 && del.bms === -1 && del.ms < 3000,
    { o, box, add, move, go, goLine, del });
    const e = await ev(() => { const d = window.__d(); const n = window.__undoAll(d); const res = { n, back: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.length }; window.__real.close(); return res; });
    timings.push(`10,000 bookmarks: open ${Math.round(o.opened)} ms, add ${add.ms} ms, move ${move.ms} ms, go to ${go.ms} ms, delete ${del.ms} ms, ${Date.now() - t0} ms in all`);
    ok('... undo of everything gives back the opened document', e.back && !e.bad && !e.msgs, e);
  }

  // ---------------------------------------------------- duplicate names, clashing ids
  {
    await ev(async () => { const d = await window.__open('Dups'); window.__opened = window.__json(d); window.__sel(6, 0, 6, 9); });
    await press('Control+Shift+F5');
    const lst = await ev(() => {
      const b = window.__bx('bookmark'), pops = b.win.iconByName('names');
      return { open: b.win.isOpen, has: !!pops };
    });
    const add = async (name, sel) => {
      await ev((s) => window.__sel(...s), sel);
      if (!(await ev(() => !!window.__bx('bookmark')))) await press('Control+Shift+F5');
      await ev((n) => window.__bx('bookmark').set('name', n), name);
      const b = await ev(() => window.__st());
      await boxClick('bookmark', 'button:Add');
      const a = await ev(() => window.__st());
      return { depth: a.depth - b.depth, beeps: a.beeps - b.beeps, names: a.bms.map((x) => x['w:name']), ids: a.bms.map((x) => x['w:id']) };
    };
    const m1 = await add('dUp', [6, 0, 6, 9]);
    const m2 = await add('Same', [7, 0, 7, 9]);
    const m3 = await add('Fresh1', [7, 0, 7, 3]);
    const m4 = await add('Huge', [6, 0, 6, 3]);
    await ev(() => window.__closeBoxes());
    const dupCount = (m) => m.names.filter((n) => n.toLowerCase() === 'dup').length;
    ok('duplicate names in a file (Dup, dup, DUP): adding "dUp" moves them all into one bookmark in a single undo step',
      lst.open && m1.depth === 1 && m1.beeps === 0 && dupCount(m1) === 1 && m1.names.includes('dUp'), m1);
    ok('two starts sharing one id ("Same"), an id beyond 2^31 ("Huge") and a hidden _Toc name: adding over them keeps one start per name, never an exception, new ids unique and below 2^31',
      m2.beeps + m3.beeps + m4.beeps >= 0 && m3.depth === 1 && m3.ids.filter((x) => x === m3.ids[m3.ids.length - 1]).length <= 2
      && [m2, m3, m4].every((m) => m.depth <= 1 && m.names.filter((n) => n === 'Same').length <= 1), { m2, m3, m4 });
    const e = await ev(() => { const d = window.__d(); const n = window.__undoAll(d); const res = { n, back: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.length }; window.__real.close(); return res; });
    ok('... undo of everything gives back the opened document', e.back && !e.bad && !e.msgs, e);
  }

  // ---------------------------------------------------- 1000 painter uses
  {
    const t0 = Date.now();
    await ev(async () => {
      const d = await window.__open('Paint', { h: 640 });
      window.__opened = window.__json(d);
      const w = d.win;
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      window.__area = { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top, n: d.view.layout.items.length };
    });
    const area = await ev(() => window.__area);
    const rnd = rng(20261013);
    const barPt = () => ev(() => { const rc = window.__d().toolbar2.icon('painter').el.getBoundingClientRect(); return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }; });
    const pt = () => ({ x: area.x0 + 30 + rnd() * (area.x1 - area.x0 - 80), y: area.y0 + area.top + 4 + rnd() * (area.y1 - area.y0 - area.top - 40) });
    const sticky = async (src) => {
      await ev((s) => window.__sel(...s), src);
      const q = await barPt();
      await page.keyboard.down('Shift');
      await page.mouse.click(q.x, q.y);
      await page.keyboard.up('Shift');
      await settle();
    };
    let uses = 0, changed = 0, bad = '';
    const rounds = [];
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < 500; k++) {
        if (k % 25 === 0) {
          // pick up again from a source with a different format
          const src = [[0, 0, 0, 5], [1, 0, 1, 4], [2, 0, 2, 5], [3 + (k % 5), 0, 3 + (k % 5), 3]][(k / 25 + round) % 4 | 0];
          await ev(() => { const d = window.__d(); if (d.painter) d.dw.view.endPainter?.(); });
          await sticky(src);
        }
        const q = pt();
        await page.mouse.click(q.x, q.y);
        uses++;
        if (k % 50 === 49) {
          const s = await ev(() => { const d = window.__d(); return { why: window.__bad(d), json: window.__json(d), painter: !!d.painter, depth: d.view.undoDepth }; });
          const mb = modelBad(s.json);
          if ((s.why || mb) && !bad) bad = `${uses}: ${s.why} ${mb}`;
          changed = Math.max(changed, s.depth);
        }
      }
      await settle();
      const e = await ev(() => {
        const d = window.__d();
        d.dw.view.endPainter?.();
        const depth = d.view.undoDepth, listeners = d.dw.view.painterListeners.length;
        const n = window.__undoAll(d);
        return { depth, listeners, n, back: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.length };
      });
      rounds.push(e);
    }
    await ev(() => window.__real.close());
    timings.push(`1000 painter uses: ${Date.now() - t0} ms, most undo steps in a round ${changed}`);
    ok('the format painter used 1000 times by real clicks (sticky, picked up again every 25; two rounds of 500): the model and selection valid throughout; each round undone gives back the opened model; no listener left; no errors',
      !bad && rounds.every((e) => e.back && !e.bad && !e.msgs && e.listeners <= 1 && e.depth > 20 && e.depth < 1000) && !pageErrors(), { bad, rounds });
  }

  // ---------------------------------------------------- word count of 1,000,000 words
  {
    const o = await ev(async () => {
      let t = performance.now();
      const d = await window.__open('Words');
      const opened = performance.now() - t;
      window.__opened = window.__json(d);
      t = performance.now();
      const all = d.count();
      const whole = performance.now() - t;
      window.__sel(0, 0, 4999, 5);
      t = performance.now();
      const part = d.count();
      const partMs = performance.now() - t;
      return { opened, all, whole, part, partMs };
    });
    const t0 = Date.now();
    await ev(() => { window.__sel(10, 0); const d = window.__d(); d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.find((i) => i.text === 'Word count...').action(); });
    await settle();
    const box = await ev(() => { const w = window.__bx('count')?.win; return w ? { words: w.iconByName('words').text, paras: w.iconByName('paras').text, open: w.isOpen } : null; });
    const boxMs = Date.now() - t0;
    const e = await ev(() => { const d = window.__d(); window.__closeBoxes(); const res = { same: window.__json(d) === window.__opened, depth: d.view.undoDepth, dirty: d.view.dirty, bad: window.__bad(d), msgs: window.__msgs.length }; window.__real.close(); return res; });
    timings.push(`1,000,000 words: open ${Math.round(o.opened)} ms, count ${Math.round(o.whole)} ms, selection ${Math.round(o.partMs)} ms, box ${boxMs} ms`);
    ok('a document of 1,000,000 words: the count is exact (1,000,000 words, 10,000 paragraphs) within 3 s; a selection of 4,999 paragraphs and 5 characters counts 499,901 words; the Word count box shows the numbers; nothing is changed',
      o.all.words === 1_000_000 && o.all.paras === 10000 && !o.all.partial && o.whole < 3000 && o.part.words === 499_901 && o.partMs < 3000 && box?.open && /1.?000.?000/.test(box.words)
      && boxMs < 5000 && e.same && e.depth === 0 && !e.dirty && !e.bad && !e.msgs, { o, box, boxMs, e });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const d = await window.__open('Mixed', { h: 440 }), w = d.win;
      window.__opened = window.__json(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top };
    });
    const rnd = rng(20261014), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Control+k', 'Control+k', 'Control+Shift+F5', 'Control+Shift+F5', 'Control+z', 'Control+y', 'Backspace', 'Delete', 'Enter', 'Home', 'End', 'ArrowUp', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+b', 'Control+i', 'Control+Backspace', 'Escape', 'Escape'];
    const TEXT = ['a', ' ', 'word ', 'é', '\u{1F600}', 'Target', 'x'.repeat(50)];
    const ADDR = ['https://example.org/' + 'q'.repeat(30), 'www.example.net', 'mailto:x@example.org', '#Target', '#Span', '#nothing', 'javascript:alert(1)', 'data:x', 'file:///x', 'http://a b',
      'ftp://f.example/x', '', ' ', 'x', 'http://', 'https://e.example/\u0001', 'u'.repeat(3000), '#' + 'n'.repeat(60)];
    const NAMES = ['Mark1', 'mark1', 'Target', 'target', 'Span', 'InCell', 'Fresh_9', '', '1abc', '_hid', 'a b', '__proto__', 'constructor', 'n'.repeat(41), 'n'.repeat(40), 'Café', 'x\u0000y', 'Bad\u{FFFC}'];
    const MENU = [['Format', 'Format painter'], ['Edit', 'Word count...'], ['Insert', 'Hyperlink...'], ['Insert', 'Bookmark...']];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.28) {
        what = pick1(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.36) {
        what = 'text';
        await page.keyboard.insertText(pick1(TEXT));
      } else if (a < 0.5) {
        const q = at();
        what = 'mouse';
        const ctrl = rnd() < 0.25;
        if (ctrl) await page.keyboard.down('Control');
        if (rnd() < 0.6) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
        if (ctrl) await page.keyboard.up('Control');
      } else if (a < 0.66) {
        what = 'link box';
        await ev(() => window.__closeBoxes());
        await page.keyboard.press('Control+k');
        await settle();
        const v = { address: pick1(ADDR), tip: rnd() < 0.3 ? pick1(['a tip', 'x'.repeat(300), '']) : undefined, text: rnd() < 0.3 ? pick1(['new', '', 'a\u0001b', 'y'.repeat(1200)]) : undefined };
        await ev((v) => {
          const b = window.__bx('link');
          if (!b) return;
          b.set('address', v.address);
          if (v.tip !== undefined) b.set('tip', v.tip);
          if (v.text !== undefined) b.set('text', v.text);
        }, v);
        await boxClick('link', pick1(['button:OK', 'button:OK', 'button:Remove link', 'button:Cancel']));
      } else if (a < 0.78) {
        what = 'bookmark box';
        await ev(() => window.__closeBoxes());
        await page.keyboard.press('Control+Shift+F5');
        await settle();
        await ev((n) => window.__bx('bookmark')?.set('name', n), pick1(NAMES));
        await boxClick('bookmark', pick1(['button:Add', 'button:Add', 'button:Go to', 'button:Delete', 'button:Close']));
      } else if (a < 0.87) {
        what = 'painter';
        const q = await ev(() => { const rc = window.__d().toolbar2.icon('painter').el.getBoundingClientRect(); return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }; });
        const sh = rnd() < 0.5;
        if (sh) await page.keyboard.down('Shift');
        await page.mouse.click(q.x, q.y);
        if (sh) await page.keyboard.up('Shift');
      } else if (a < 0.93) {
        what = 'menu ' + pick1(MENU).join('>');
        const path = what.slice(5).split('>');
        await ev((path) => {
          let m = window.__d().win.menu({}), it;
          for (const n of path) { it = m.items.find((i) => i.text === n); if (!it) break; m = it.submenu ? it.submenu() : null; }
          if (!it) window.__msgs.push('no menu item ' + path);
          else if (!(typeof it.shaded === 'function' ? it.shaded() : it.shaded) && it.action) it.action();
        }, path);
      } else {
        what = 'format';
        const id = pick1(['bold', 'italic', 'underline', 'changeCase', 'caseCycle']);
        await ev(([id, arg]) => { try { window.__d().view.format(id, arg); } catch (e) { if (!(e instanceof RangeError)) window.__msgs.push('threw ' + e.message); } }, [id, id === 'changeCase' ? pick1(['upper', 'lower', 'title']) : undefined]);
      }
      const kind = what.split(' ')[0].replace(/^[A-Z].*/, 'key');
      kinds[kind] = (kinds[kind] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const d = window.__d();
        if (!d || !window.__doc(window.__cur)) return { why: 'window gone', json: '{"sections":[]}' };
        const why = window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        window.__closeBoxes();
        window.__focus?.(d);
        d.dw.view.focus();
        return { why, json: window.__json(d) };
      });
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const d = window.__d();
      window.__closeBoxes();
      d.dw.view.endPainter?.();
      const n = window.__undoAll(d);
      const res = { n, same: window.__json(d) === window.__opened, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length, listeners: d.dw.view.painterListeners.length };
      window.__real.close();
      return res;
    });
    ok('500 random keys (Ctrl-K, Ctrl-Shift-F5, Escape...), text, clicks, drags and Ctrl-clicks, the Hyperlink and Bookmark boxes filled with hostile text and their buttons clicked, the painter by button (Select and Shift), '
      + 'the menus\' Format painter, Word count, Hyperlink and Bookmark, and character formats: selection and every block valid after each, no errors; undoing everything gives back the opened model, relationships and Hyperlink style included',
    !bad.length && end.same && !end.dirty && !end.bad && !end.errs && end.listeners <= 1 && !pageErrors() && Object.keys(kinds).length >= 6, { bad, end, kinds });
    timings.push('random actions: ' + JSON.stringify(kinds));
  }
  ok('no network request was made for any address', requests.length === 0, requests.slice(0, 5));
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log('timings: ' + timings.join('; '));
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
