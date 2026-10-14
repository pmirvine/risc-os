// !Letters' pages against hostile input in the real desktop (Batch D
// P5.1, D37, Review Focus 5). Documents open in Print layout and are
// paginated to the end without an error, an error box or a hang:
// page sizes 0, -1, 1e9 and "abc"; margins larger than the page; a
// top margin of -31680; 10,000 page breaks; a 20,000 px picture;
// keepNext chains over 100 pages; a 63-column table over 50 pages;
// 500 sections of alternating sizes; oddPage breaks back to back.
// For each: every page's geometry finite, the window's extent holds
// the last page, the end of the document painted, a character typed
// there and undone. Then 200 seeded random actions in Print layout
// (typing, Enter, Delete, Backspace, page breaks, caret moves, Page
// setup values good and bad through the box, zoom, view switches,
// undo, redo, scrolling): after each the selection is valid and
// nothing is reported; undoing everything gives back the opened
// model. Save while paginating (Review Focus 5): the parts saved
// (saveBytes, and the file written by Save) while the slices still
// run are the parts saved once they are done (the zip's time stamps
// are the time of saving); the pages go on and finish after it. Close while paginating: the slices stop (the count frozen, no
// frame pending), nothing reported. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { picDocx, pngBytes } from './pic-fixtures.mjs';
import { rng } from './word-docs.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const words = (i, n = 12) => Array.from({ length: n }, (_, j) => WORDS[(i + j) % 10]).join(' ');
const TEXT = (n, k = 0) => Array.from({ length: n }, (_, i) => p(r(`${i + k} ` + words(i + k)))).join('');
const MAR = ({ top = 1440, bottom = 1440, left = 1440, right = 1440 } = {}) => `<w:pgMar w:top="${top}" w:right="${right}" `
  + `w:bottom="${bottom}" w:left="${left}" w:header="720" w:footer="720" w:gutter="0"/>`;
const SECT = (w = 12240, h = 15840, mar = {}, type = '') => `<w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}`
  + `<w:pgSz w:w="${w}" w:h="${h}"/>${MAR(mar)}</w:sectPr>`;
const BR = '<w:r><w:br w:type="page"/></w:r>';
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });

// a 63-column table over 50 pages (800 rows, the first cell three lines)
const COLS = 63, GRID = '<w:tblGrid>' + '<w:gridCol w:w="148"/>'.repeat(COLS) + '</w:tblGrid>';
const ROW = (i) => '<w:tr><w:tc>' + p(r('r' + i)) + p(r('x')) + p(r('y')) + '</w:tc>'
  + '<w:tc><w:p/></w:tc>'.repeat(COLS - 1) + '</w:tr>';
const WIDE = p(r('Before.')) + '<w:tbl><w:tblPr><w:tblW w:w="9324" w:type="dxa"/></w:tblPr>' + GRID
  + Array.from({ length: 800 }, (_, i) => ROW(i)).join('') + '</w:tbl>' + p(r('After.')) + SECT();
// 500 sections, letter portrait and A4 landscape in turn
const SECTS = Array.from({ length: 500 }, (_, i) => p(r('section ' + i)) + (i < 499 ? p(r('end ' + i),
  i % 2 ? SECT(12240, 15840, {}, 'nextPage') : SECT(16838, 11906, {}, 'nextPage')) : SECT())).join('');
// oddPage breaks back to back: 40 sections, each one paragraph
const ODD = Array.from({ length: 40 }, (_, i) => p(r('odd ' + i), i < 39 ? SECT(12240, 15840, {}, 'oddPage') : ''))
  .join('') + SECT(12240, 15840, {}, 'oddPage');

const HOSTILE = {
  Size0: { body: TEXT(80) + SECT(0, 0), what: 'page size 0' },
  SizeNeg: { body: TEXT(80) + SECT(-1, -1), what: 'page size -1' },
  SizeHuge: { body: TEXT(80) + SECT(1e9, 1e9), what: 'page size 1e9' },
  SizeAbc: { body: TEXT(80) + SECT('abc', 'abc'), what: 'page size "abc"' },
  MarOver: { body: TEXT(80) + SECT(12240, 15840, { top: 9000, bottom: 9000, left: 7000, right: 7000 }),
    what: 'margins larger than the page' },
  TopNeg: { body: TEXT(200) + SECT(12240, 15840, { top: -31680 }), what: 'a top margin of -31680' },
  Breaks: { body: Array.from({ length: 10000 }, (_, i) => p(r('b' + i) + BR)).join('') + SECT(),
    what: '10,000 page breaks', least: 10000 },
  Pic: { what: 'a 20,000 px picture' },
  Keep: { body: Array.from({ length: 5200 }, (_, i) => p(r(`${i} ` + words(i, 4)), '<w:keepNext/>')).join('') + SECT(),
    what: 'a keepNext chain over 100 pages', least: 100 },
  Wide: { body: WIDE, what: 'a 63-column table over 50 pages', least: 50 },
  Sects: { body: SECTS, what: '500 sections of alternating sizes', least: 500 },
  Odd: { body: ODD, what: 'oddPage breaks back to back', least: 40 },
};
const files = {};
for (const [k, h] of Object.entries(HOSTILE)) {
  files[k] = Array.from(k === 'Pic'
    ? await picDocx({ pics: [{ cx: 914400, cy: 20000 * 9525, bytes: pngBytes(4, 40) }], body: TEXT(40) + SECT() })
    : await docx(h.body));
}
// random actions: text, a table, a page break; long: slices to save and close during
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>'
  + Array.from({ length: 6 }, (_, i) => `<w:tr><w:tc>${p(r('cell ' + i))}</w:tc><w:tc>${p(r(words(i, 20)))}</w:tc></w:tr>`)
    .join('') + '</w:tbl>';
files.Mixed = Array.from(await docx(TEXT(40) + p(r('broken') + BR + r('after')) + TBL + TEXT(60, 40) + SECT()));
files.Long = Array.from(await docx(Array.from({ length: 20000 }, (_, i) => p(r(words(i, 30)))).join('') + SECT()));

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const { browser, page, logs } = await launch({ height: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf && !d.closed);
    window.__key = (w, code, key, extra = {}) => w.emit('key', { code, key, shift: false, ctrl: false, ...extra });
    /** Open leaf in Print layout, the window at a known place. */
    window.__open = async (leaf) => {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      const d = window.__doc(leaf);
      if (d.viewName !== 'print') d.setView('print');
      d.win.open({ x: 60, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      d.dw.view.focus();
      return d;
    };
    /** Frames until d's pages are done (or ms pass): the ms taken, or -1. */
    window.__done = async (d, ms) => {
      const t0 = performance.now();
      while (!d.view.pages().done) {
        if (performance.now() - t0 > ms) return -1;
        await window.__frames(1);
      }
      return Math.round(performance.now() - t0);
    };
    /** '' when d's selection is valid, else what is wrong. */
    window.__bad = (d) => {
      const L = d.view.layout, s = d.view.selection;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const q of [s.anchor, s.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'p' && q.off > it.block.text.length) return `off ${q.off} > ${it.block.text.length}`;
      }
      return '';
    };
    window.__json = (d) => JSON.stringify(d.d.doc.sections);
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  // ------------------------------------------------ hostile documents open and paginate
  for (const [leaf, h] of Object.entries(HOSTILE)) {
    const res = await ev(async ({ leaf }) => {
      const t0 = performance.now();
      const d = await window.__open(leaf);
      const res = { view: d.viewName, wait: await window.__done(d, 30000) };
      res.ms = Math.round(performance.now() - t0);
      const L = d.view.layout, P = L.place.pages, S = L.place.sheet;
      res.count = P.count;
      res.blank = P.list.filter((pg) => pg.blank).length;
      res.finite = P.list.every((pg) => [pg.top, pg.w, pg.h, pg.bodyTop, pg.frameH].every(Number.isFinite) && pg.h > 0);
      const last = S.rect(P.at(P.count - 1)), w = d.win;
      res.extent = w.extent.y1 - w.extent.y0 >= last.y + last.h;
      // the end painted, a character typed there and undone
      const end = L.items[L.items.length - 1];
      d.view.setSelection({ id: end.id, off: end.kind === 'p' ? end.block.text.length : 0 });
      d.view.flush();
      const c = d.view.caretRect();
      w.scrollTo(0, Math.max(0, Math.round(c.y - 200)));
      w.invalidate();
      await window.__frames(2);
      const before = window.__json(d);
      d.view.type('Z');
      d.view.flush();
      await window.__frames(2);
      res.typed = window.__json(d) !== before && d.view.pages() !== null;
      await window.__done(d, 30000);
      d.view.press('undo');
      d.view.flush();
      await window.__frames(2);
      res.undone = window.__json(d) === before;
      res.bad = window.__bad(d);
      res.msgs = window.__msgs.splice(0);
      d.dw.close();
      await window.__frames(1);
      return res;
    }, { leaf });
    ok(`${h.what}: opens in Print layout, paginates to the end (${res.count} pages, ${res.ms} ms), every page finite, `
      + 'the extent holds the last page, typing at the end and undo work, nothing reported',
    res.view === 'print' && res.wait >= 0 && res.count >= (h.least || 1) && res.finite && res.extent && res.typed
      && res.undone && !res.bad && !res.msgs.length && !pageErrors(), res);
  }
  {
    const odd = await ev(async () => {
      const d = await window.__open('Odd');
      await window.__done(d, 30000);
      const P = d.view.layout.place.pages, n = P.count, blank = P.list.filter((pg) => pg.blank).length;
      const odd = P.list.filter((pg) => !pg.blank).every((pg) => pg.num % 2 === 1);
      d.dw.close();
      return { n, blank, odd };
    });
    ok('oddPage breaks back to back: every section on an odd page, the even pages between them blank (PG3)',
      odd.odd && odd.blank >= 38 && odd.n === 40 + odd.blank, odd);
  }

  // ------------------------------------------------ 200 random actions in Print layout
  {
    await ev(async () => {
      const d = await window.__open('Mixed');
      window.__opened = window.__json(d);
      window.__beeps = 0;
    });
    const rnd = rng(20261012), pick = (a) => a[Math.floor(rnd() * a.length)];
    const TEXTS = ['a', 'word ', ' ', 'é', 'x y z', 'longer text to wrap the line further along '];
    const FIELDS = [['top', [0, 720, 1440, 2880, -1440, 30000, 20000]], ['bottom', [720, 1440, 14000]],
      ['left', [0, 1440, 5000, 11000]], ['right', [720, 1440, 6000]], ['w', [1440, 12240, 16838, 31680, 40000]],
      ['h', [1440, 15840, 11906, 31680]], ['gutter', [0, 720, 9000]]];
    const bad = [];
    const counts = {};
    for (let k = 0; k < 200; k++) {
      const a = rnd();
      let act;
      if (a < 0.25) act = ['type', pick(TEXTS)];
      else if (a < 0.33) act = ['key', 13, 'Enter'];
      else if (a < 0.41) act = ['key', 127, 'Delete'];
      else if (a < 0.47) act = ['key', 8, 'Backspace'];
      else if (a < 0.54) act = ['break'];
      else if (a < 0.64) act = ['move', rnd(), rnd()];
      else if (a < 0.72) act = ['setup', ...pick(FIELDS).map((x, i) => (i ? pick(x) : x)), pick(['section', 'all', 'forward'])];
      else if (a < 0.79) act = ['zoom', pick([50, 75, 100, 150, 200, 33])];
      else if (a < 0.85) act = ['view', pick(['draft', 'print', 'print'])];
      else if (a < 0.91) act = ['undo'];
      else if (a < 0.95) act = ['redo'];
      else act = ['scroll', rnd()];
      counts[act[0]] = (counts[act[0]] || 0) + 1;
      const s = await ev(async (act) => {
        const d = window.__doc('Mixed'), w = d.win, v = d.view;
        try {
          const [what, x, y, z] = act;
          if (what === 'type') v.type(x);
          else if (what === 'key') window.__key(w, x, y);
          else if (what === 'break') window.__key(w, 13, 'Enter', { ctrl: true });
          else if (what === 'move') {
            const ps = [...v.layout.byId.values()].filter((it) => it.kind === 'p');
            const it = ps[Math.floor(x * ps.length)];
            v.setSelection({ id: it.id, off: Math.floor(y * (it.block.text.length + 1)) });
          } else if (what === 'setup') {
            const m = d.win.menu({}).items.find((i) => i.text === 'Format').submenu();
            const it = m.items.find((i) => i.text === 'Page setup...');
            it.action(it);
            const box = window.__word().word.dialog({ key: 'page:' + d.docKey, rows: [] });
            box.set('scope', z);
            box.set(x, y);
            box.win.emit('key', { code: 13 });
            if (d.dw.boxes.has('page') && box.isOpen) box.win.emit('key', { code: 27 });
          } else if (what === 'zoom') d.setZoom(x);
          else if (what === 'view') d.setView(x);
          else if (what === 'undo') v.press('undo');
          else if (what === 'redo') v.press('redo');
          else if (what === 'scroll') w.scrollTo(0, Math.round(x * (w.extent.y1 - w.extent.y0)));
          v.flush();
          await window.__frames(1);
          const pg = v.pages();
          return { why: window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.join('|') : '')
            + (pg && !(pg.count >= 1) ? ' no pages' : '') + (os.wimp.menus.isOpen ? ' menu' : '') };
        } catch (e) {
          return { why: 'exception ' + (e.stack || e) };
        }
      }, act);
      if ((s.why || pageErrors()) && bad.length < 5) bad.push(`${k} ${JSON.stringify(act)}: ${s.why} ${pageErrors()}`);
      if (s.why.includes('menu')) await ev(() => os.wimp.menus.close());
    }
    const end = await ev(async () => {
      const d = window.__doc('Mixed');
      d.setView('print');
      d.setZoom(100);
      const wait = await window.__done(d, 30000);
      let n = 0;
      while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; }
      d.view.flush();
      await window.__frames(2);
      const res = { wait, n, same: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.splice(0) };
      d.dw.close();
      await window.__frames(1);
      return res;
    });
    ok('200 random actions in Print layout (typing, Enter, Delete, page breaks, Page setup values, zoom, views, undo): '
      + 'the selection valid after each, nothing reported; undoing everything gives the opened model',
    !bad.length && end.wait >= 0 && end.same && !end.bad && !end.msgs.length && !pageErrors()
      && counts.setup > 5 && counts.view > 5 && counts.zoom > 5, { bad, end, counts });
  }

  // ------------------------------------------------ save while paginating (Review Focus 5)
  {
    const s = await ev(async () => {
      const d = await window.__open('Long'), P0 = d.view.layout.place.pages;
      const res = { done0: P0.done, count0: P0.count };
      // both begun while the slices run (they go on while it zips)
      const [a] = await Promise.all([d.saveBytes(), d.save()]);
      res.doneA = P0.done;
      res.saved = !d.view.dirty;
      const written = await os.vfs.readFile('RAM::RamDisc0.$.Long');
      res.wait = await window.__done(d, 30000);
      const P = d.view.layout.place.pages;
      res.count = P.count;
      res.same = P === P0;
      const b = await d.saveBytes();
      res.zips = [a, written, b].map((x) => Array.from(x));
      res.msgs = window.__msgs.splice(0);
      d.dw.close();
      await window.__frames(1);
      return res;
    });
    // (the parts compared: the zip's time stamps are the time saved)
    const [za, zw, zb] = await Promise.all(s.zips.map((x) => readZip(new Uint8Array(x))));
    delete s.zips;
    const same = (x, y) => x.size === y.size && [...x].every(([n, v]) => {
      const u = y.get(n);
      return u && u.length === v.length && u.every((q, i) => q === v[i]);
    });
    s.ab = same(za, zb);
    s.file = same(zw, zb);
    s.parts = zb.size;
    ok('save while the pages are still being worked out: the same bytes as once they are done (saveBytes and the '
      + 'file Save writes); the slices go on and finish', !s.done0 && s.saved && s.wait >= 0 && s.count > s.count0
      && s.ab && s.file && !s.msgs.length, s);
  }

  // ------------------------------------------------ close while paginating
  {
    const c = await ev(async () => {
      const d = await window.__open('Long'), dw = d.dw, P = d.view.layout.place.pages;
      const res = { done0: P.done, n0: P.count };
      dw.close();
      res.raf = dw.raf;
      await window.__frames(8);
      res.n1 = P.count;
      res.closed = d.closed;
      res.msgs = window.__msgs.splice(0);
      // closed by its close icon (the request path) while paginating
      const e = await window.__open('Long'), Q = e.view.layout.place.pages, m0 = Q.count;
      await e.requestClose();
      await window.__frames(8);
      res.request = { done: Q.done, m0, m1: Q.count, closed: e.closed, raf: e.dw.raf };
      return res;
    });
    ok('a window closed while its pages are worked out: the slices stop (count frozen, no frame pending), nothing reported',
      !c.done0 && !c.raf && c.n1 === c.n0 && c.closed && !c.msgs.length && !c.request.done && c.request.m1 === c.request.m0
        && c.request.closed && !c.request.raf && !pageErrors(), c);
  }
  const msgs = await ev(() => window.__msgs);
  ok('nothing reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
