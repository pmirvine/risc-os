// !Word's pictures against hostile input in the real desktop (Batch B,
// B8.1): 100 pictures in one paragraph (laid out, only those in view
// decoded, select-all + Delete + undo); 1000 pictures in 1000
// paragraphs scrolled end to end (decodes never more than the pictures
// seen, the cache under 128 MB all the way); a 50 MB PNG part and IHDR
// / SOF / GIF-frame bombs shown as labelled boxes of their extent with
// no decode and their bytes untouched; a PNG whose data is corrupt:
// decoded once, a box, never retried; 1000 resize drags with a real
// mouse (no leak, sizes in range, undo all); everything selected in a
// 50,000-paragraph document with 100 pictures, Delete and undo under
// 5 s; a copy between two documents; and 500 seeded random actions
// (keys, typing, clicks, handle drags, double-clicks, the Picture and
// Insert picture boxes with hostile text, dropped and pasted files,
// copy and paste, undo and redo) after each of which the selection is
// valid, the model passes ModelCheck and nothing was fetched; undoing
// everything gives back the opened model, its parts and relationships.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { picDocx, pngBytes, jpegBytes, gifBytes } from './pic-fixtures.mjs';
import { buildDocx, documentXml, p, r, REL } from './build-docx.mjs';
import { drawingXml } from './pic-fixtures.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const IN = 914400, HALF = 457200;
const RED = [220, 20, 30];
const arr = async (x) => Array.from(await x);
const rgbOf = (i) => [i & 255, (i >> 8) & 255, 90];

// 100 distinct pictures in ONE paragraph
const hundred = async () => {
  const parts = {}, rels = [];
  let body = '';
  for (let i = 0; i < 100; i++) {
    parts[`word/media/image${i + 1}.png`] = pngBytes(8 + (i % 40), 8, { rgb: rgbOf(i) });
    rels.push([`rId${100 + i}`, REL('image'), `media/image${i + 1}.png`]);
    body += '<w:r>' + drawingXml({ id: i + 1, cx: HALF, cy: HALF, embed: `rId${100 + i}`, decl: false }) + '</w:r>';
  }
  const root = ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  parts['word/document.xml'] = documentXml(p(body) + p(r('The end.')), { rootAttrs: root });
  return buildDocx(parts, { docRels: rels });
};
const thousand = () => picDocx({ pics: Array.from({ length: 1000 }, (_, i) =>
  ({ bytes: pngBytes(300, 300, { rgb: rgbOf(i) }), cx: 2 * IN, cy: 2 * IN })), body: p(r('The end.')) });
// (a repeated block of noise: the package's unpacking ratio limit is 1000)
const big = new Uint8Array(50 * 1024 * 1024);
{
  const rd = rng(7), noise = Uint8Array.from({ length: 4096 }, () => Math.floor(rd() * 256));
  for (let i = 0; i < big.length; i += noise.length) big.set(noise, i);
  big.set(pngBytes(10, 10));
}
const corrupt = (() => {
  const b = pngBytes(40, 20, { rgb: RED });
  const at = Buffer.from(b).indexOf('IDAT');
  for (let i = at + 6; i < at + 14; i++) b[i] = 0xff;
  return b;
})();
const bombs = () => picDocx({ pics: [
  { bytes: big, cx: IN, cy: IN },                                              // 50 MB part
  { bytes: pngBytes(100000, 100000), cx: IN, cy: IN },                         // IHDR 100000 x 100000
  { ext: 'jpeg', bytes: jpegBytes(65535, 65535), cx: IN, cy: IN },             // SOF 65535 x 65535
  { ext: 'gif', bytes: gifBytes(10, 10, { frameW: 20000, frameH: 20000 }), cx: IN, cy: IN },
  { bytes: corrupt, cx: IN, cy: IN },                                          // decode rejects
  { bytes: pngBytes(40, 20, { rgb: RED }), cx: IN, cy: IN },                   // a control
] });
const huge = async () => {
  const n = 50000, parts = {}, rels = [];
  let body = '';
  for (let i = 0; i < n; i++) {
    const k = i % 500 === 250 ? Math.floor(i / 500) : -1;
    let pics = '';
    if (k >= 0) {
      parts[`word/media/image${k + 1}.png`] = pngBytes(6 + (k % 9), 6, { rgb: rgbOf(k * 7) });
      rels.push([`rId${100 + k}`, REL('image'), `media/image${k + 1}.png`]);
      pics = '<w:r>' + drawingXml({ id: k + 1, cx: HALF, cy: HALF, embed: `rId${100 + k}`, decl: false }) + '</w:r>';
    }
    body += p(r(`${i}: the quick brown fox jumps over the lazy dog.`) + pics);
  }
  const root = ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  parts['word/document.xml'] = documentXml(body, { rootAttrs: root });
  return buildDocx(parts, { docRels: rels });
};
const PNG1 = pngBytes(40, 20, { rgb: RED });
const files = {
  Hundred: await arr(hundred()), Thousand: await arr(thousand()), Bombs: await arr(bombs()), Huge: await arr(huge()),
  Mix: await arr(picDocx({
    pics: [
      { bytes: PNG1, cx: 1828800, cy: 914400, descr: 'red' },
      { bytes: pngBytes(8, 8, { rgb: RED }), kind: 'anchor', cx: IN, cy: HALF },
      { bytes: pngBytes(30, 30, { rgb: [10, 200, 10], dpi: 300 }), cx: IN, cy: IN, xfrm: false },
      { bytes: pngBytes(40, 40, { rgb: [10, 10, 200] }), cx: 6 * IN, cy: 3 * IN, srcRect: { l: 10000, t: 20000 } },
      { bytes: null, cx: IN, cy: HALF },
    ],
    body: p(r('Some text to type in and select.')) + p(r('A second paragraph of text.')) + p(r('The end.')),
  })),
  Other: await arr(picDocx({ pics: [], body: p(r('Other document')) })),
  Pic1: Array.from(PNG1),
  Jpg: Array.from(jpegBytes(1, 1)),
  Gif: Array.from(gifBytes(12, 12)),
  Fake: Array.from(new TextEncoder().encode('This is only text, not a picture at all.')),
};
const D = 'RAM::RamDisc0.$.';

const out = [];
const live = (s) => { if (process.env.LIVE) console.error(s.slice(0, 600)); };
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); live(out.at(-1)); };
const info = (s) => { out.push('INFO ' + s); live(out.at(-1)); };
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const modelBad = (json) => {
  try {
    for (const s of JSON.parse(json)) for (const b of s.blocks) checkBlock(b);
    return '';
  } catch (e) {
    return e.message;
  }
};
const { browser, page, logs } = await launch();
const origin = new URL(BASE_URL).origin;
const requests = [];
page.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) requests.push(u); });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;

try {
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Linux x86_64', configurable: true }); });
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile('RAM::RamDisc0.$.' + n, new Uint8Array(b), { filetype: /^(Pic|Jpg|Gif|Fake)/.test(n) ? 0xFF9 : 0xA7E });
    os.vfs.mkdir('RAM::RamDisc0.$.Dir');
    os.vfs.writeFile('RAM::RamDisc0.$.Big', new Uint8Array(21 * 1024 * 1024 + 1), { filetype: 0xFF9 });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    // reads in flight (a file read, a pasted File's bytes): waited for, never slept for
    window.__inflight = 0;
    const rf = os.vfs.readFile.bind(os.vfs);
    os.vfs.readFile = async (q) => { window.__inflight++; try { return await rf(q); } finally { window.__inflight--; } };
    window.__quiet = async () => {
      for (let i = 0; i < 100 && window.__inflight; i++) await window.__sleep(20);
      await window.__frames(4);
    };
    window.__net = 0;
    for (const tgt of [window, document]) {
      const add = tgt.addEventListener.bind(tgt), rem = tgt.removeEventListener.bind(tgt);
      const seen = new Set();
      tgt.addEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|'); if (!seen.has(f + key)) { seen.add(f + key); window.__net++; } return add(t, f, o); };
      tgt.removeEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|'); if (seen.delete(f + key)) window.__net--; return rem(t, f, o); };
    }
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__at = (d, x, y) => { const z = d.view.zoom, t = d.view.layout.top; return window.__client(d.win, x * z, t + (y - t) * z); };
    /** Open leaf in Word: its window at a known place, the caret in it. */
    window.__open = async (leaf, h = 700) => {
      if (!window.__word()?.word) { await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word'); for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50); }
      const t0 = performance.now();
      await os.filer.run('RAM::RamDisc0.$.' + leaf);
      for (let i = 0; i < 400 && !window.__doc(leaf); i++) await window.__sleep(25);
      const d = window.__doc(leaf);
      // (the window first opens, and is drawn, at its own size)
      d.__h0 = d.win.isOpen ? d.win.h : 0;
      d.win.open({ x: 40, y: 40, w: 860, h, behind: 'top', scrollX: 0, scrollY: 0 });
      d.dw.view.focus();
      await window.__frames(3);
      d.__openMs = performance.now() - t0;
      return d;
    };
    window.__closeAll = async () => { for (const d of [...(window.__word()?.word.docs ?? [])]) if (!d.closed) d.dw.close(); await window.__frames(2); };
    window.__pics = (d) => {
      const L = d.view.layout, res = [];
      for (const it of L.items) for (const ln of it.lines || []) for (const x of ln.items) {
        if (x.kind !== 'pic') continue;
        const base = it.y + ln.y + ln.base + (x.dy || 0);
        res.push({ x: L.left + x.x, y: base - x.pic.h, w: x.pic.w, h: x.pic.h });
      }
      return res;
    };
    window.__inView = (d, hh = d.win.h) => {
      const w = d.win, z = d.view.zoom, t = d.view.layout.top, y0 = t + (w.scrollY) / z - t / z + 0, y1 = y0 + hh / z;
      return window.__pics(d).map((b, i) => (b.y + b.h > y0 && b.y < y1 ? i : -1)).filter((i) => i >= 0);
    };
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w, z = d.view.zoom, t = d.view.layout.top;
      const c = cv.getContext('2d').getImageData(Math.floor((x * z - w.scrollX) * k), Math.floor((t + (y - t) * z - w.scrollY) * k), 1, 1).data;
      return [c[0], c[1], c[2]];
    };
    window.__json = (d) => JSON.stringify(d.d.doc.sections);
    window.__shape = (d) => JSON.stringify([[...d.d.doc.parts.keys()], d.d.doc.rels.length, d.d.doc.parts.size]);
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__st = (d) => ({ depth: d.view.undoDepth, dirty: d.view.dirty, pics: window.__pics(d).length, stats: { ...window.__word().word.pics }, msgs: window.__msgs.slice() });
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
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
        const base = Math.max(0, q.off - 64);
        let inside = true;
        for (const g of seg.segment(text.slice(base, q.off + 64))) if (g.index + base === q.off) { inside = false; break; }
        if (inside) return `${q.off} inside a cluster`;
      }
      return '';
    };
  }, files);
  const base = await ev(() => ({ net: window.__net }));

  // ---------------------------------------------------- 100 pictures in one paragraph
  {
    const a = await ev(async () => {
      const n0 = window.__word()?.word.pics.decodes ?? 0;
      const d = await window.__open('Hundred', 500);
      await window.__quiet();
      // in view of the window as first opened (its own size) or as set
      const w = window.__word().word, inView = window.__inView(d, Math.max(d.__h0, d.win.h)).length, pics = window.__pics(d).length;
      const decodes = w.pics.decodes - n0;
      for (let i = 0; i < 5; i++) { d.win.invalidate(); await window.__frames(2); }
      return { h0: d.__h0, pics, inView, decodes, more: w.pics.decodes - n0 - decodes, ms: d.__openMs, msgs: window.__msgs.length, lines: d.view.lines().length };
    });
    ok('100 pictures in one paragraph: laid out, decodes at most those in view, repaints decode nothing, no message',
      a.pics === 100 && a.decodes > 0 && a.decodes <= a.inView && a.more === 0 && !a.msgs && a.ms < 3000, a);
    const before = await ev(() => window.__json(window.__doc('Hundred')));
    const t0 = Date.now();
    await press('Control+a');
    await press('Delete');
    const gone = await ev(() => window.__st(window.__doc('Hundred')));
    await press('Control+z');
    const back = await ev(() => window.__st(window.__doc('Hundred')));
    const same = await ev((b) => window.__json(window.__doc('Hundred')) === b, before);
    ok('... select all, Delete (no picture left, one step) and undo: all 100 back, the model as it was, under 5 s',
      gone.pics === 0 && gone.depth === 1 && back.pics === 100 && same && Date.now() - t0 < 5000, { gone, back, same, ms: Date.now() - t0 });
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- 1000 pictures scrolled end to end
  {
    const m = await ev(async () => {
      const w = window.__word().word, n0 = w.pics.decodes;
      const d = await window.__open('Thousand', 700);
      await window.__quiet();
      const seen = new Set(window.__inView(d)), res = { steps: 0, over: 0, maxBytes: 0, maxCount: 0, ms: d.__openMs };
      const total = window.__pics(d).length, end = d.view.layout.height ?? 0;
      let last = -1;
      for (let i = 0; i < 2000; i++) {
        d.win.scrollTo(0, d.win.scrollY + d.win.h * 0.9);
        await window.__frames(2);
        for (const k of window.__inView(d)) seen.add(k);
        const s = w.pics;
        res.maxBytes = Math.max(res.maxBytes, s.bytes);
        res.maxCount = Math.max(res.maxCount, s.count);
        if (w.pics.decodes - n0 > seen.size) res.over++;
        res.steps++;
        if (d.win.scrollY === last) break;
        last = d.win.scrollY;
      }
      await window.__quiet();
      for (const k of window.__inView(d)) seen.add(k);
      await window.__sleep(1300);          // (the timed trim)
      return { ...res, total, seen: seen.size, decodes: w.pics.decodes - n0, stats: { ...w.pics }, end, msgs: window.__msgs.length };
    });
    ok('1000 pictures open under 2 s; scrolled end to end every one was seen and no more was decoded than seen', m.total === 1000 && m.ms < 2000 && m.seen === 1000 && m.over === 0 && m.decodes <= m.seen, m);
    ok('... the decoded pictures never passed 128 MB, and the timed trim leaves at most 32 bitmaps', m.maxBytes <= 128 * 1024 * 1024 && m.stats.bytes <= 128 * 1024 * 1024 && m.stats.count <= 32 && !m.msgs, m);
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- bombs: boxes, no decode
  {
    const a = await ev(async () => {
      const w = window.__word().word, n0 = w.pics.decodes;
      const d = await window.__open('Bombs', 900);
      await window.__quiet();
      const b = window.__pics(d);
      const ink = (bx) => { let n = 0; for (let y = bx.y + 3; y < bx.y + bx.h - 3; y += 1) for (let x = bx.x + 3; x < bx.x + bx.w - 3; x += 1) { const c = window.__px(d, x, y); if (c[0] < 200) n++; } return n; };
      const red = (c) => c[0] > 180 && c[1] < 70 && c[2] < 70;
      const mid = (i) => window.__px(d, b[i].x + b[i].w / 2, b[i].y + b[i].h / 2);
      const decodes1 = w.pics.decodes - n0;
      for (let i = 0; i < 5; i++) { d.win.invalidate(); await window.__frames(2); }
      d.win.scrollTo(0, 400); await window.__quiet(); d.win.scrollTo(0, 0); await window.__quiet();
      const decodes2 = w.pics.decodes - n0;
      const doc = d.d.doc, sizes = [...doc.parts.entries()].filter(([k]) => /media/.test(k)).map(([k, v]) => [k, v.length]);
      return { n: b.length, sizes: b.map((x) => [x.w, x.h]), ink: b.map(ink), mids: [0, 1, 2, 3, 4].map((i) => red(mid(i))), control: red(mid(5)), decodes1, decodes2,
        parts: sizes, dirty: d.view.dirty, depth: d.view.undoDepth, msgs: window.__msgs.slice(), pending: w.pics.pending };
    });
    ok('a 50 MB part, IHDR 100000 x 100000, SOF 65535 x 65535 and a GIF frame of 20000 x 20000: six pictures, each of its extent (96 x 96)',
      a.n === 6 && a.sizes.every(([w, h]) => w === 96 && h === 96), a.sizes);
    ok('... the four bombs are labelled boxes (ink, not the picture), the control picture is drawn red', a.ink.slice(0, 4).every((n) => n > 10) && a.mids.slice(0, 4).every((v) => !v) && a.control, a);
    ok('... only the corrupt PNG and the control were decoded (2), once each, never retried (repaints, scrolling away and back)', a.decodes1 === 2 && a.decodes2 === 2 && a.pending === 0, a);
    ok('... the corrupt PNG is a labelled box too; no message, nothing changed, the part bytes as they were',
      a.ink[4] > 10 && !a.mids[4] && !a.msgs.length && !a.dirty && a.depth === 0 && a.parts[0][1] === 50 * 1024 * 1024 && a.parts.length === 6, a);
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- 1000 resize drags
  {
    await ev(() => window.__open('Mix', 780));
    const target = async () => ev(() => { const d = window.__doc('Mix'), b = window.__pics(d)[0]; return { ...window.__at(d, b.x + b.w / 2, b.y + b.h / 2), w: b.w, h: b.h }; });
    const handle = (n) => ev((n) => { const d = window.__doc('Mix'), q = d.view.pic(), h = q?.handles.find((x) => x.name === n); return h ? window.__at(d, h.x + h.w / 2, h.y + h.h / 2) : null; }, n);
    const stOf = () => ev(() => { const d = window.__doc('Mix'), q = d.view.pic(); return { depth: d.view.undoDepth, cx: q?.cx, cy: q?.cy, w: window.__pics(d)[0]?.w, msgs: window.__msgs.length, net: window.__net, windows: os.wimp.windows.size }; });
    const t = await target();
    await page.mouse.click(t.x, t.y);
    await settle();
    // (a drag begins where the last one ended: for the wimp that is a double-click unless it is slower)
    await ev(() => { window.__dcMs = os.input.config.doubleClickMs; os.input.config.doubleClickMs = 1; });
    const rnd = rng(20261010), s0 = await stOf(), d0 = await ev(() => window.__json(window.__doc('Mix')));
    let bad = 0, drags = 0, skipped = 0;
    const times = [];
    const t0 = Date.now();
    for (let k = 0; k < 1000; k++) {
      const s = await stOf();
      if (s.cx === undefined) { bad++; break; }
      const name = rnd() < 0.5 ? 'se' : (rnd() < 0.5 ? 'e' : 's');
      const h = await handle(name);
      if (!h) { skipped++; continue; }
      const grow = s.w < 60 ? 1 : s.w > 420 ? -1 : (rnd() < 0.5 ? 1 : -1);
      const dx = Math.round(grow * (4 + rnd() * 50)), dy = Math.round(grow * (4 + rnd() * 30));
      const t1 = Date.now();
      await wait(0);
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x + dx, h.y + dy, { steps: 2 });
      await page.mouse.up();
      await ev(() => window.__frames(1));
      times.push(Date.now() - t1);
      drags++;
    }
    await settle();
    await ev(() => { os.input.config.doubleClickMs = window.__dcMs; });
    const s1 = await stOf();
    const first = times.slice(0, 100).reduce((a, b) => a + b, 0) / 100, lastAvg = times.slice(-100).reduce((a, b) => a + b, 0) / 100;
    ok('1000 real resize drags: the picture stays selected and valid, the extent within 0.01 to 22 in, the undo steps are the drags that changed it',
      bad === 0 && drags + skipped === 1000 && s1.cx >= 9525 && s1.cx <= 20116800 && s1.cy >= 9525 && s1.cy <= 20116800 && s1.depth > s0.depth && s1.depth <= s0.depth + drags && s1.msgs === s0.msgs,
      { bad, drags, skipped, s0, s1 });
    ok('... no windows or listeners leaked and the last 100 drags cost no more than three times the first 100', s1.windows === s0.windows && s1.net <= s0.net && lastAvg < first * 3 + 50, { s0, s1, first, lastAvg, ms: Date.now() - t0 });
    info(`1000 drags: ${drags} made, ${skipped} skipped, ${Date.now() - t0} ms, first 100 ${first.toFixed(0)} ms each, last 100 ${lastAvg.toFixed(0)} ms each`);
    const u = await ev(() => { const d = window.__doc('Mix'); const n = window.__undoAll(d); return { n, depth: d.view.undoDepth }; });
    const same = await ev((j) => window.__json(window.__doc('Mix')) === j, d0);
    ok('... undoing all of them gives back the opened model', u.depth === 0 && same && modelBad(await ev(() => window.__json(window.__doc('Mix')))) === '', u);
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- 50,000 paragraphs, 100 pictures
  {
    const n0 = await ev(() => window.__word().word.pics.decodes);
    await ev(() => window.__open('Huge', 500));
    await ev(() => window.__quiet());
    const before = await ev(() => { const d = window.__doc('Huge'); return { n: d.d.doc.sections.reduce((a, s) => a + s.blocks.length, 0), shape: window.__shape(d), json: window.__json(d).length }; });
    const t0 = Date.now();
    await press('Control+a');
    await press('Delete');
    const t1 = Date.now() - t0;
    const gone = await ev(() => { const d = window.__doc('Huge'); return { depth: d.view.undoDepth, blocks: d.d.doc.sections.reduce((a, s) => a + s.blocks.length, 0), pics: [...d.d.doc.sections[0].blocks.map((b) => Object.keys(b.inlines || {}).length)].reduce((a, b) => a + b, 0) }; });
    await press('Control+z');
    const total = Date.now() - t0;
    const after = await ev(() => { const d = window.__doc('Huge'); return { n: d.d.doc.sections.reduce((a, s) => a + s.blocks.length, 0), shape: window.__shape(d), json: window.__json(d).length, depth: d.view.undoDepth, msgs: window.__msgs.length }; });
    const pics = await ev(() => { const d = window.__doc('Huge'); let n = 0; for (const s of d.d.doc.sections) for (const b of s.blocks) n += Object.keys(b.inlines || {}).length; return n; });
    ok('50,000 paragraphs with 100 pictures: Ctrl-A, Delete (one step) and Ctrl-Z in under 5 s, the document and its parts as they were', before.n === 50000 && gone.depth === 1 && gone.pics === 0 && after.n === 50000
      && after.shape === before.shape && after.json === before.json && after.depth === 0 && pics === 100 && total < 5000 && !after.msgs, { before, gone, after, pics, t1, total });
    void n0;
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- a copy between two documents
  {
    await ev(() => window.__open('Other', 400));
    await ev(() => window.__open('Mix', 700));
    await press('Control+a');
    await press(MOD + '+c');
    const keys = await ev(() => window.__word().word.docs.filter((d) => !d.closed).map((d) => d.leaf));
    await ev(() => { const d = window.__doc('Other'); d.win.open({ x: 40, y: 40, w: 860, h: 400, behind: 'top', scrollX: 0, scrollY: 0 }); d.dw.view.focus(); });
    await settle();
    const o0 = await ev(() => { const d = window.__doc('Other'); return { shape: window.__shape(d), depth: d.view.undoDepth, json: window.__json(d) }; });
    await press(MOD + '+v');
    await ev(() => window.__quiet());
    const o1 = await ev(() => { const d = window.__doc('Other'); return { shape: JSON.parse(window.__shape(d)), depth: d.view.undoDepth, pics: window.__pics(d).length, msgs: window.__msgs.slice(), bad: window.__bad(d) }; });
    ok('Ctrl-A, Ctrl-C in a document with pictures and Ctrl-V in another: one undo step, the carried pictures (not the unmodelled ones) with their media and relationships, no message',
      o1.depth === o0.depth + 1 && o1.pics >= 3 && o1.shape[0].filter((k) => /media/.test(k)).length >= 3 && !o1.msgs.length && !o1.bad, { keys, o0: o0.depth, o1 });
    await press('Control+z');
    const o2 = await ev(() => { const d = window.__doc('Other'); return { shape: window.__shape(d), json: window.__json(d) }; });
    ok('... Ctrl-Z gives the other document back as it was (parts and relationships too)', o2.shape === o0.shape && o2.json === o0.json, o2);
    await ev(() => window.__closeAll());
  }

  // ---------------------------------------------------- 500 seeded random actions
  {
    const d = await ev(() => window.__open('Mix', 700).then((d) => { window.__msgs.length = 0; window.__mix = d; return 1; }));
    const opened = await ev(() => ({ json: window.__json(window.__mix), shape: window.__shape(window.__mix) }));
    const req0 = requests.length;
    const rnd = rng(20261010), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowDown', 'Shift+End',
      'Control+a', 'Enter', 'Backspace', 'Delete', 'Delete', 'Control+z', 'Control+y', 'Control+z'];
    const TEXT = ['a', ' ', 'word ', 'é', '\u{1F600}'];
    const PATHS = [D + 'Pic1', D + 'Jpg', D + 'Gif', D + 'Pic1', D + 'Nowhere', D + 'Dir', D + 'Fake', D + 'Big', 'http://x/a.png', '', '..', D + 'Hundred', 'x'.repeat(3000)];
    const DIMS = ['0', '-1', '1e9', 'abc', '', '3', '0.01', '22', '22.01', '1.5"', '99999999999999999999', 'NaN', '3 4', '0.5', '١٢', '1.234567'];
    const ALTS = ['', 'a cat', 'x'.repeat(2000), 'a\u0001b', '<b>&amp;</b>', '\u{1F600}', 'line\nbreak', 'tab\there'];
    const FILES = [
      { name: 'a.png', type: 'image/png', bytes: 'png' }, { name: 'b.jpg', type: 'image/jpeg', bytes: 'jpg' }, { name: 'c.gif', type: 'image/gif', bytes: 'gif' },
      { name: 'd.png', type: 'image/png', bytes: 'fake' }, { name: 'e.bmp', type: 'image/bmp', bytes: 'fake' }, { name: 'f.png', type: 'image/png', bytes: 'big' },
    ];
    const kinds = {}, stat = { msgs: 0, maxPics: 0, maxDepth: 0, maxParts: 0 };
    const bad = [];
    const box = await ev(() => { const w = window.__mix.win, a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; });
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + 2 + rnd() * (box.y1 - box.y0 - 4) });
    const doc = () => window.__doc('Mix');
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.17) { what = 'key'; await page.keyboard.press(pick(KEYS)); }
      else if (a < 0.24) { what = 'type'; await page.keyboard.insertText(pick(TEXT)); }
      else if (a < 0.32) {
        what = 'click a picture';
        const q = await ev((u) => { const d = window.__mix, ps = window.__pics(d); const b = ps[Math.floor(u * ps.length)]; return b ? window.__at(d, b.x + b.w / 2, b.y + b.h / 2) : null; }, rnd());
        if (q) { await page.mouse.click(q.x, q.y); await wait(30); }
      } else if (a < 0.42) {
        what = 'handle drag';
        const h = await ev((n) => { const d = window.__mix, q = d.view.pic?.(), h = q?.handles.find((x) => x.name === n); return h ? window.__at(d, h.x + h.w / 2, h.y + h.h / 2) : null; }, pick(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']));
        if (h) {
          await wait(420);
          await page.mouse.move(h.x, h.y); await page.mouse.down();
          const e = at(); await page.mouse.move(e.x, e.y, { steps: 3 });
          if (rnd() < 0.1) await page.keyboard.press('Escape');
          await page.mouse.up();
        }
      } else if (a < 0.47) {
        what = 'double-click a picture';
        const q = await ev((u) => { const d = window.__mix, ps = window.__pics(d); const b = ps[Math.floor(u * ps.length)]; return b ? window.__at(d, b.x + b.w / 2, b.y + b.h / 2) : null; }, rnd());
        if (q) { await wait(420); await page.mouse.dblclick(q.x, q.y); await wait(30); }
      } else if (a < 0.57) {
        what = 'Picture box';
        const ws = [pick(DIMS), pick(DIMS), pick(ALTS), rnd() < 0.5, rnd(), rnd(), rnd()];
        await ev(async ([w, h, alt, go, u1, u2, u3]) => {
          const d = window.__mix;
          if (!d.dw.boxes.has('pic')) d.win.menu({}).items.find((i) => i.text === 'Format')?.submenu().items.find((i) => i.text === 'Picture...')?.action?.();
          await window.__frames(2);
          if (!d.dw.boxes.has('pic')) return;
          const b = window.__word().word.dialog({ key: 'pic:' + d.docKey, rows: [] });
          if (!b.isOpen) return;
          if (u1 < 0.7) b.set('width', w);
          if (u2 < 0.7) b.set('height', h);
          if (u3 < 0.7) b.set('alt', alt);
          await window.__frames(1);
          if (go) b.win.iconByName('ok')?.click?.() ?? 0;
        }, ws);
        if (rnd() < 0.6) await page.keyboard.press(pick(['Enter', 'Escape']));
      } else if (a < 0.67) {
        what = 'Insert picture box';
        const path = pick(PATHS);
        await ev(async (path) => {
          const d = window.__mix;
          if (!d.dw.boxes.has('picins')) d.win.menu({}).items.find((i) => i.text === 'Insert')?.submenu().items.find((i) => i.text === 'Picture...')?.action?.();
          await window.__frames(2);
          if (!d.dw.boxes.has('picins')) return;
          const b = window.__word().word.dialog({ key: 'picins:' + d.docKey, rows: [] });
          if (b.isOpen) b.set('path', path);
        }, path);
        await page.keyboard.press(pick(['Enter', 'Enter', 'Escape']));
      } else if (a < 0.74) {
        what = 'drop';
        const fs = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick([
          { path: D + 'Pic1', filetype: 0xB60, size: 10 }, { path: D + 'Jpg', filetype: 0xC85, size: 10 }, { path: D + 'Gif', filetype: 0x695, size: 10 },
          { path: D + 'Fake', filetype: 0xB60, size: 10 }, { path: D + 'Nowhere', filetype: 0xC85, size: 10 }, { path: D + 'Big', filetype: 0xB60, size: 21 * 1048576 },
          { path: D + 'Dir', filetype: 0x1000, size: 0, type: 'dir' }]));
        await ev(([fs, u]) => {
          const d = window.__mix, L = d.view.layout, it = L.items[Math.floor(u * L.items.length)];
          os.wimp.dataLoad({ window: d.win, x: L.left + 2, y: it.y + 5, sx: 0, sy: 0 }, fs.map((f) => ({ name: f.path.split('.').pop(), type: 'file', ...f })));
        }, [fs, rnd()]);
      } else if (a < 0.8) {
        what = 'paste File';
        const f = pick(FILES);
        await ev(([f]) => {
          const d = window.__mix, bytes = { png: [137, 80, 78, 71, 13, 10, 26, 10], jpg: [0xff, 0xd8, 0xff], gif: [71, 73, 70, 56, 57, 97], fake: [116, 101, 120, 116] }[f.bytes];
          const file = new File([f.bytes === 'big' ? new Uint8Array(21 * 1048576 + 1) : new Uint8Array(bytes)], f.name, { type: f.type });
          const ab = file.arrayBuffer.bind(file);
          file.arrayBuffer = async () => { window.__inflight++; try { return await ab(); } finally { window.__inflight--; } };
          const h = window.__doc('Mix'); if (!h) throw new Error('Mix is gone: ' + window.__word().word.docs.map((x) => x.leaf + (x.closed ? ' closed' : '')).join(',') + ' / ' + d.closed); h.paste({ files: [file] });
        }, [f]);
      } else if (a < 0.87) {
        what = rnd() < 0.5 ? 'copy' : 'cut';
        await page.keyboard.press(MOD + (what === 'copy' ? '+c' : '+x'));
      } else if (a < 0.92) { what = 'real paste'; await page.keyboard.press(MOD + '+v'); }
      else if (a < 0.97) {
        what = 'undo/redo';
        await ev((n) => { const v = window.__mix.view; for (let i = 0; i < n; i++) v.press(i % 3 === 2 ? 'redo' : 'undo'); v.flush(); }, 1 + Math.floor(rnd() * 4));
      } else { what = 'zoom'; await ev((z) => window.__mix.setZoom(z), pick([50, 100, 150, 200])); await wait(30); }
      kinds[what] = (kinds[what] || 0) + 1;
      if (process.env.LIVE) console.error(k, what);
      const s = await ev(async () => {
        await window.__quiet();
        const d = window.__mix;
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        const m = window.__msgs.length;
        window.__msgs.length = 0;
        if (os.wimp.caret?.window !== d.win) { for (const b of ['picins', 'pic']) if (d.dw.boxes.has(b)) window.__word().word.dialog({ key: b + ':' + d.docKey, rows: [] }).win.close?.(); d.dw.view.focus(); }
        return { why: window.__bad(d), json: window.__json(d), m, pics: window.__pics(d).length, depth: d.view.undoDepth, parts: d.d.doc.parts.size };
      });
      stat.msgs += s.m; stat.maxPics = Math.max(stat.maxPics, s.pics); stat.maxDepth = Math.max(stat.maxDepth, s.depth); stat.maxParts = Math.max(stat.maxParts, s.parts);
      const m = modelBad(s.json);
      if ((s.why || m) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${m}`);
    }
    await wait(300);
    const end = await ev(async () => {
      const d = window.__mix, n = window.__undoAll(d);
      await window.__quiet();
      return { n, json: window.__json(d), shape: window.__shape(d), bad: window.__bad(d), depth: d.view.undoDepth };
    });
    info('random actions: ' + JSON.stringify(kinds) + ' ' + JSON.stringify(stat));
    ok('500 random keys, clicks, handle drags, dialogs with hostile text, dropped and pasted files, copy, cut, paste, undo and zoom: the selection valid and the model passing ModelCheck after each; no page error; no request',
      !bad.length && !pageErrors() && !requests.slice(req0).length, { bad, req: requests.slice(req0, req0 + 3), errs: pageErrors() });
    ok('... undoing everything gives back the opened model, its parts and its relationships', end.json === opened.json && end.shape === opened.shape && !end.bad && end.depth === 0, { n: end.n, shape: end.shape, was: opened.shape, bad: end.bad });
    void d;
    await ev(() => window.__closeAll());
  }
  const lk = await ev(() => ({ net: window.__net, windows: os.wimp.windows.size }));
  ok('no listeners left behind by all of it', lk.net <= base.net + 4, { lk, base });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
