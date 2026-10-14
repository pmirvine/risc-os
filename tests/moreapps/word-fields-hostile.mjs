// !Letters' fields, headers and footers against hostile input in the
// real desktop (Batch D P9.3, D37, Review Focus). Each document opens
// in Print layout and is paginated to the end without an exception,
// an error box or a hang (every step raced against a time limit):
// 10,000 fields nested in one another's codes and 10,000 nested in
// one another's results; a field whose instruction is 1 MB; unbalanced
// fields (a begin with no end, an end and a separate with no begin, a
// begin and separate with no end, two ends); fields across table
// cells (begin before a table, separate in a cell, end in the next
// cell; begin in a cell, end after the table); 271 header parts (271
// sections, each with a header of its own); a header holding every
// kind of block (paragraphs with fields, a fldSimple, a tab, a break,
// a hyperlink, a picture, a table with a table in it, a content
// control and a bookmark kept as blocks); a header part of bad XML
// (kept as bytes: the grey band '[header - preserved, not shown]'
// drawn, the mode refused with a beep, the part saved byte for byte);
// a header reference to a part that is not in the package and one to
// a relationship that does not exist. For each: field codes shown and
// hidden, Update all fields, the header and footer mode entered where
// there is one and a letter typed in it, a letter typed at the end of
// the body; undoing everything gives back the opened model, and
// every header and footer part is saved byte for byte. Then 300 seeded random actions in the
// header and footer mode of a three-section document (first page,
// odd and even, a linked section, fields in a table cell and nested):
// typing, Enter, Backspace, Delete, caret moves and selections in the
// story, copy, cut and paste, Insert > Page number / Number of pages /
// Date, Edit > Update field, View > Field codes, the mode's menu
// (Different first page, Different odd and even pages, Link to
// previous, Go to header or footer, Previous and Next section,
// Remove), another page's header or footer entered, Escape and back,
// undo and redo, scrolling (SEED=n runs another sequence; every
// sixth action is a menu item, undo, redo, another page's header or
// footer or the clipboard in turn, so each comes at least 10 times
// whatever the seed: P9 fix M6): after each
// nothing is reported and the selection is valid in the story the
// window edits; undoing
// everything gives back the opened model. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, relsXml, REL, W_NS, R_NS, p, r } from './build-docx.mjs';
import { fld, fldSimple, begin, sep, end, instr } from './field-fixtures.mjs';
import { drawingXml, URIS, pngBytes } from './pic-fixtures.mjs';
import { rng } from './word-docs.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const ROOT = (name, body) => DECL + `<w:${name} xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${URIS.wp}" `
  + `xmlns:a="${URIS.a}" xmlns:pic="${URIS.pic}">${body}</w:${name}>`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const words = (i, n = 30) => Array.from({ length: n }, (_, j) => WORDS[(i + j) % 10]).join(' ');
const TEXT = (n, k = 0) => Array.from({ length: n }, (_, i) => p(r(`${i + k} ` + words(i + k)))).join('');
const BR = '<w:r><w:br w:type="page"/></w:r>';
const TBL = (cells, inner = '') => '<w:tbl><w:tblPr/><w:tblGrid>' + cells.map(() => '<w:gridCol w:w="3000"/>').join('')
  + '</w:tblGrid><w:tr>' + cells.map((c, i) => `<w:tc>${c}${i === 0 ? inner : ''}</w:tc>`).join('') + '</w:tr></w:tbl>';
const SECT = (refs = '', more = '') => `<w:sectPr>${refs}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" `
  + 'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' + more + '</w:sectPr>';

/**
 * A .docx of sections [{body, hdr: {type: xml}, ftr: {type: xml}, bad: {type: xml}, refs, titlePg}]: each header or
 * footer its own part (word/header<n>.xml, rIdH<n>; bad: the part's bytes as given); refs: more references as
 * written; o.pic: the first header's picture (rIdP1); o.rels: more main relationships; o.evenAndOdd.
 */
function hfDocx(secs, o = {}) {
  const parts = {}, docRels = [...(o.rels || [])];
  let nh = 0, nf = 0, body = '';
  secs.forEach((s, i) => {
    let refs = '';
    for (const [kind, map] of [['hdr', s.hdr], ['ftr', s.ftr]]) {
      for (const [type, xml] of Object.entries(map || {})) {
        const n = kind === 'hdr' ? ++nh : ++nf, base = kind === 'hdr' ? 'header' : 'footer';
        const name = `${base}${n}.xml`, id = `rId${kind === 'hdr' ? 'H' : 'F'}${n}`;
        parts['word/' + name] = (s.bad || {})[type] ?? ROOT(kind, xml);
        docRels.push([id, REL(base), name]);
        refs += `<w:${base}Reference w:type="${type}" r:id="${id}"/>`;
        if (o.pic && n === 1 && kind === 'hdr') {
          parts[`word/_rels/${name}.rels`] = relsXml([['rIdP1', REL('image'), 'media/image1.png']]);
          parts['word/media/image1.png'] = o.pic;
        }
      }
    }
    const sp = SECT(refs + (s.refs || ''), s.titlePg ? '<w:titlePg/>' : '');
    body += s.body + (i < secs.length - 1 ? p(r('end of section ' + i), sp) : sp);
  });
  parts['word/document.xml'] = documentXml(body);
  if (o.evenAndOdd) parts['word/settings.xml'] = settingsXml('<w:evenAndOddHeaders/>');
  return buildDocx(parts, { docRels });
}

// 10,000 fields nested in codes: QUOTE { QUOTE { ... { PAGE } ... } }; and in results
const N = 10000;
let inCode = fld(' PAGE ', '9'), inResult = fld(' PAGE ', '9');
for (let i = 1; i < N; i++) {
  inCode = begin() + instr(' QUOTE ') + inCode + sep() + r('q') + end();
  inResult = begin() + instr(' QUOTE "x" ') + sep() + inResult + end();
}
const MB = 1024 * 1024;
const HUGE = begin() + instr(' QUOTE "' + 'x'.repeat(MB) + '" ') + sep() + r('huge') + end();
const UNBAL = p(r('begin alone ') + begin() + instr(' PAGE ') + r(' tail')) + p(r('end alone ') + end() + r(' tail'))
  + p(r('separate alone ') + sep() + r(' tail')) + p(r('no end ') + begin() + instr(' PAGE ') + sep() + r('7'))
  + p(r('two ends ') + fld(' PAGE ', '1') + end() + r(' tail')) + p(r('then ') + fld(' NUMPAGES ', '9'));
const CELLS = p(r('before ') + begin() + instr(' PAGE ')) + TBL([p(sep() + r('5')), p(r('in cell 2 ') + end())])
  + p(r('after the first table'))
  + TBL([p(r('cell ') + begin() + instr(' NUMPAGES ') + sep()), p(r('3'))]) + p(r('9') + end() + r(' after'))
  + TBL([p(r('own ') + fld(' PAGE ', '1')), p(r('x'))]);
const pic = pngBytes(4, 4);
const EVERY = p(r('Head ') + fld(' PAGE ', '1') + r(' of ') + fldSimple(' NUMPAGES ', '1') + '<w:r><w:tab/></w:r>' + r('tab')
  + '<w:r><w:br/></w:r>' + r('line two')) + p('<w:hyperlink w:anchor="top">' + r('link ') + fld(' PAGE ', '1') + '</w:hyperlink>')
  + p('<w:r>' + drawingXml({ embed: 'rIdP1', decl: false }) + '</w:r>' + r(' picture'))
  + TBL([p(r('cell ') + fld(' DATE \\@ "yyyy" ', '2000')), p(r('cell two'))], TBL([p(r('nested cell'))]) + p(r('after nested')))
  + '<w:sdt><w:sdtPr/><w:sdtContent>' + p(r('in a content control')) + '</w:sdtContent></w:sdt>'
  + '<w:bookmarkStart w:id="1" w:name="mark"/>' + p(r('marked')) + '<w:bookmarkEnd w:id="1"/>' + p('');

const HOSTILE = {
  Nest: { what: '10,000 fields nested in codes and 10,000 in results (the innermost PAGE stored 9: Update all fields '
    + 'is one step)', updates: true, secs: [{ body: p(r('codes ') + inCode) + p(r('results ')
    + inResult) + TEXT(10), ftr: { default: p(r('Foot ') + fld(' PAGE ', '1')) } }] },
  Huge: { what: 'a field with a 1 MB instruction', secs: [{ body: p(r('huge ') + HUGE + r(' after')) + TEXT(10),
    hdr: { default: p(r('Head ') + HUGE) } }] },
  Unbal: { what: 'unbalanced fields', secs: [{ body: UNBAL + TEXT(10), hdr: { default: UNBAL } }] },
  Cells: { what: 'fields across table cells', secs: [{ body: CELLS + TEXT(10), hdr: { default: CELLS } }] },
  Many: { what: '271 header parts (271 sections)', least: 271, secs: Array.from({ length: 271 }, (_, i) => ({
    body: p(r('section text ' + i)), hdr: { default: p(r(`Head ${i} `) + fld(' PAGE ', '1')) } })) },
  Every: { what: 'a header with every kind of block', pic, secs: [{ body: TEXT(60), hdr: { default: EVERY },
    ftr: { default: EVERY } }] },
  Bad: { what: 'a header part of bad XML (kept as bytes)', bad: true, secs: [{ body: TEXT(60), hdr: { default: '' },
    bad: { default: DECL + '<w:hdr xmlns:w="' + W_NS + '"><w:p><w:r><w:t>broken</w:r></w:p>' }, ftr: { default: p(r('Foot')) } }] },
  Missing: { what: 'header references to a missing part and to no relationship', none: true, secs: [{ body: TEXT(60),
    refs: '<w:headerReference w:type="default" r:id="rIdGone"/><w:footerReference w:type="default" r:id="rIdNone"/>' }],
  rels: [['rIdGone', REL('header'), 'header99.xml']] },
};
const files = {}, zips = {};
for (const [k, h] of Object.entries(HOSTILE)) {
  const bytes = await hfDocx(h.secs, { pic: h.pic, rels: h.rels });
  files[k] = Array.from(bytes);
  zips[k] = await readZip(bytes);
}
// the random actions: three sections, first page, odd and even, a linked section
const RAND = [
  { body: TEXT(50), titlePg: true, hdr: { default: p(r('Odd head ') + fld(' PAGE \\* roman ', 'i') + r(' of ')
    + fld(' NUMPAGES ', '1')), first: p(r('First head ') + fld(' PAGE ', '1')) + TBL([p(r('cell ') + fld(' PAGE ', '1')),
    p(r('two'))]), even: p(r('Even head ') + fld(' IF {} = 2 "two" "other" ', 'other', { nested: fld(' PAGE ', '1') })) },
  ftr: { default: p(r('Foot ') + fld(' DATE \\@ "dd/MM/yyyy" ', '01/01/2000')) } },
  { body: TEXT(30, 50) },
  { body: TEXT(30, 80), hdr: { default: p(r('Third head ') + fld(' SECTION ', '3')) } },
];
files.Rand = Array.from(await hfDocx(RAND, { evenAndOdd: true }));

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const { browser, page, logs } = await launch({ height: 900 });
const LIMIT = 120000;
/** page.evaluate raced against LIMIT ms: a hang is a failure, not a stuck run. */
const ev = (fn, arg, ms = LIMIT) => Promise.race([page.evaluate(fn, arg),
  new Promise((_, no) => setTimeout(() => no(new Error(`hang: no answer in ${ms} ms`)), ms).unref())]);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf && !d.closed);
    window.__key = (w, code, key, extra = {}) => w.emit('key', { code, key, shift: false, ctrl: false, ...extra });
    window.__open = async (leaf) => {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      const d = window.__doc(leaf);
      if (d.viewName !== 'print') d.setView('print');
      d.win.open({ x: 60, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      d.dw.view.focus();
      return d;
    };
    window.__done = async (d, ms) => {
      const t0 = performance.now();
      while (!d.dw.view.bodyL.place.pages.done) {
        if (performance.now() - t0 > ms) return -1;
        await window.__frames(1);
      }
      return Math.round(performance.now() - t0);
    };
    /** '' when the window's selection is valid in the layout it edits (the story's in the mode), else what is wrong. */
    window.__bad = (d) => {
      const v = d.dw.view, L = v.L, s = v.sel, m = v.hdr;
      if (!L) return 'no layout';
      if (!s) return L.items.length ? 'no selection' : '';
      const doc = v.d.doc;
      const blocks = m ? (doc.stories ? null : 'facade') : null;
      for (const q of [s.anchor, s.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}${m ? ' in the ' + m.kind + ' ' + m.part : ''}${blocks ? '' : ''}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'p' && q.off > it.block.text.length) return `off ${q.off} > ${it.block.text.length}`;
      }
      return '';
    };
    /** The model: the body's sections and every story's blocks. */
    window.__json = (d) => JSON.stringify([d.dw.view.real ? d.dw.view.real.doc.sections : d.d.doc.sections,
      [...(d.dw.doc.stories || new Map())].map(([k, s]) => [k, s.blocks])]);
    window.__menu = (d, path) => {
      let items = d.win.menu({}).items;
      for (let i = 0; i < path.length; i++) {
        const it = items.find((x) => x.text === path[i]);
        if (!it) return 'none';
        const shaded = typeof it.shaded === 'function' ? it.shaded() : it.shaded;
        if (shaded) return 'shaded';
        if (i < path.length - 1) items = (typeof it.submenu === 'function' ? it.submenu() : it.submenu).items;
        else it.action(it);
      }
      return 'ok';
    };
    /** The texts d's window draws in one redraw (fillText spied on, put back). */
    window.__drawn = async (d) => {
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      const cv = d.win._canvas;
      proto.fillText = function (t, ...a) {
        if (this.canvas === cv) seen.push(String(t));
        return real.call(this, t, ...a);
      };
      try {
        d.win.invalidate();
        await window.__frames(2);
      } finally {
        proto.fillText = real;
      }
      return seen;
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  // ------------------------------------------------ hostile documents
  for (const [leaf, h] of Object.entries(HOSTILE)) {
    let res;
    try {
      res = await ev(async ({ leaf, bad, none }) => {
        const t0 = performance.now(), res = { steps: [] };
        const step = (s) => res.steps.push(s);
        const d = await window.__open(leaf), v = d.dw.view;
        step('opened');
        res.wait = await window.__done(d, 60000);
        res.ms = Math.round(performance.now() - t0);
        const P = v.bodyL.place.pages;
        res.count = P.count;
        res.finite = P.list.every((pg) => [pg.top, pg.w, pg.h, pg.bodyTop, pg.frameH].every(Number.isFinite));
        const opened = window.__json(d);
        // the first page drawn, its header region too
        d.win.scrollTo(0, 0);
        const drawn = await window.__drawn(d);
        res.band = drawn.includes('[header - preserved, not shown]');
        step('drawn');
        // field codes shown and hidden (display only)
        res.codes = [window.__menu(d, ['View', 'Field codes'])];
        await window.__frames(2);
        await window.__drawn(d);
        res.codes.push(window.__menu(d, ['View', 'Field codes']));
        await window.__frames(2);
        res.codesSame = window.__json(d) === opened;
        step('codes');
        // Update all fields
        const u0 = d.d.undoDepth;
        res.update = window.__menu(d, ['Edit', 'Update all fields']);
        v.flush && v.flush();
        await window.__frames(2);
        res.updated = d.d.undoDepth - u0;
        step('update');
        // a letter at the end of the body
        const L = v.L, endIt = L.items[L.items.length - 1];
        d.view.setSelection({ id: endIt.id, off: endIt.kind === 'p' ? endIt.block.text.length : 0 });
        d.view.type('Z');
        d.view.flush();
        await window.__frames(2);
        step('typed');
        // the header and footer mode on the last page
        const b0 = window.__beeps;
        res.enter = d.enterHdr(P.count - 1, 'hdr');
        await window.__frames(2);
        res.mode = !!v.hdr;
        res.beeped = window.__beeps > b0;
        if (v.hdr) {
          d.view.type('Q');
          d.view.flush();
          await window.__frames(2);
          res.inMode = window.__bad(d);
          d.view.press('undo');
          d.view.flush();
          d.view.type('W');
          d.view.flush();
          await window.__frames(2);
          window.__key(d.win, 27, 'Escape');
          await window.__frames(2);
        }
        res.left = !v.hdr;
        step('mode');
        // undo everything
        let n = 0;
        while (d.d.canUndo && n < 100) { d.view.press('undo'); n++; }
        d.view.flush();
        await window.__frames(2);
        res.undone = window.__json(d) === opened;
        res.bad = window.__bad(d);
        res.saved = Array.from(await d.saveBytes());
        res.msgs = window.__msgs.splice(0);
        d.dw.close();
        await window.__frames(1);
        res.total = Math.round(performance.now() - t0);
        return res;
      }, { leaf, bad: !!h.bad, none: !!h.none });
    } catch (e) {
      res = { exception: String(e.stack || e) };
    }
    if (res.saved) {
      const z = await readZip(new Uint8Array(res.saved)), orig = zips[leaf];
      delete res.saved;
      // every header and footer part saved byte for byte (nothing changed after the undo)
      const hf = [...orig.keys()].filter((k) => /^word\/(header|footer)\d+\.xml$/.test(k));
      res.parts = hf.length;
      res.partsSame = hf.every((k) => { const a = orig.get(k), b = z.get(k); return b && a.length === b.length && a.every((x, i) => x === b[i]); });
      res.docBack = z.has('word/document.xml');
    }
    const okMode = h.bad || h.none ? !res.mode && res.beeped : res.mode && !res.inMode && res.left;
    ok(`${h.what}: opens in Print layout, paginates to the end (${res.count} pages, ${res.ms} ms), field codes shown `
      + 'and hidden (no change), Update all fields, typing in the body' + (h.bad || h.none ? ', the mode refused with a beep'
      : ', the header mode entered and typed in') + '; undoing everything gives the opened model; every header and footer '
      + 'part saved byte for byte; nothing reported', !res.exception && res.wait >= 0 && res.count >= (h.least || 1)
      && res.finite && res.codes.every((c) => c === 'ok') && res.codesSame && okMode && res.undone && !res.bad
      && res.partsSame && res.docBack && !res.msgs.length && !pageErrors() && (!h.updates || res.updated === 1), res);
    if (h.bad) ok('a header part of bad XML: the grey band "[header - preserved, not shown]" drawn', res.band, res);
    if (res.exception) break;
  }

  // ------------------------------------------------ 300 random actions in the header and footer mode
  {
    const o = await ev(async () => {
      const d = await window.__open('Rand');
      await window.__done(d, 30000);
      window.__opened = window.__json(d);
      d.enterHdr(0, 'hdr');
      await window.__frames(2);
      return { count: d.dw.view.bodyL.place.pages.count, mode: !!d.dw.view.hdr };
    });
    const rnd = rng(Number(process.env.SEED) || 20261014), pick = (a) => a[Math.floor(rnd() * a.length)];
    const TEXTS = ['a', 'word ', ' ', 'é', 'x y z', 'a longer run of text to wrap the header line further along '];
    const MENUS = [['Insert', 'Page number'], ['Insert', 'Number of pages'], ['Insert', 'Date'], ['Edit', 'Update field'],
      ['View', 'Field codes'], ['View', 'Header and footer options', 'Different first page'],
      ['View', 'Header and footer options', 'Different odd and even pages'],
      ['View', 'Header and footer options', 'Link to previous'], ['View', 'Header and footer options', 'Go to'],
      ['View', 'Header and footer options', 'Previous section'], ['View', 'Header and footer options', 'Next section'],
      ['View', 'Header and footer options', 'Remove']];
    const bad = [], counts = {};
    // every sixth action is one of FORCED in turn (10 of each in 300,
    // whatever the seed: P9 fix M6), the others drawn at random
    const FORCED = [0.5, 0.8, 0.9, 0.65, 0.95];   // menu undo redo enter clip
    for (let k = 0; k < 300; k++) {
      const a = k % 6 === 5 ? FORCED[Math.floor(k / 6) % FORCED.length] : rnd();
      let act;
      if (a < 0.2) act = ['type', pick(TEXTS)];
      else if (a < 0.26) act = ['key', 13, 'Enter'];
      else if (a < 0.32) act = ['key', 8, 'Backspace'];
      else if (a < 0.37) act = ['key', 127, 'Delete'];
      else if (a < 0.47) act = ['move', rnd(), rnd(), rnd() < 0.4 ? rnd() : -1];
      else if (a < 0.62) act = ['menu', pick(MENUS)];
      else if (a < 0.7) act = ['enter', rnd(), pick(['hdr', 'ftr'])];
      else if (a < 0.74) act = ['escape'];
      else if (a < 0.85) act = ['undo'];
      else if (a < 0.92) act = ['redo'];
      else if (a < 0.97) act = ['clip', pick(['copy', 'cut', 'paste', 'paste'])];
      else act = ['scroll', rnd()];
      counts[act[0]] = (counts[act[0]] || 0) + 1;
      let s;
      try {
        s = await ev(async (act) => {
          const d = window.__doc('Rand'), w = d.win, v = d.dw.view;
          try {
            const [what, x, y, z] = act;
            if (what === 'type') d.view.type(x);
            else if (what === 'key') window.__key(w, x, y);
            else if (what === 'move') {
              const ps = [...v.L.byId.values()].filter((it) => it.kind === 'p');
              if (ps.length) {
                const it = ps[Math.floor(x * ps.length)], at = Math.floor(y * (it.block.text.length + 1));
                if (z < 0) d.view.setSelection({ id: it.id, off: at });
                else {
                  const jt = ps[Math.floor(z * ps.length)];
                  d.view.setSelection({ id: it.id, off: at }, { id: jt.id, off: Math.floor(z * (jt.block.text.length + 1)) });
                }
              }
            } else if (what === 'menu') {
              if (!v.hdr) d.toggleHdr();
              const W = { hdr: 'header', ftr: 'footer' }, k = v.hdr ? v.hdr.kind : 'hdr';
              const path = x.map((t) => (t === 'Go to' ? 'Go to ' + W[k === 'hdr' ? 'ftr' : 'hdr'] : t === 'Remove'
                ? 'Remove ' + W[k] : t));
              if (window.__menu(d, path) === 'none') return { why: 'no menu item ' + path.join(' > ') };
            } else if (what === 'enter') d.enterHdr(Math.floor(x * v.bodyL.place.pages.count), y);
            else if (what === 'escape') { window.__key(w, 27, 'Escape'); d.toggleHdr(); }
            else if (what === 'undo') d.view.press('undo');
            else if (what === 'redo') d.view.press('redo');
            else if (what === 'clip') {
              if (x === 'paste') { if (window.__clip) d.paste({ text: window.__clip.plain, html: window.__clip.html || '' }); }
              else window.__clip = (x === 'cut' ? d.cut() : d.copy()) || window.__clip;
            }
            else if (what === 'scroll') w.scrollTo(0, Math.round(x * (w.extent.y1 - w.extent.y0)));
            d.view.flush();
            await window.__frames(1);
            for (const b of d.dw.boxes ? d.dw.boxes.values() : []) if (b && b.isOpen && b.close) b.close();
            return { why: window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.splice(0).join('|') : '')
              + (os.wimp.menus.isOpen ? ' menu' : ''), mode: v.hdr ? v.hdr.kind : '' };
          } catch (e) {
            return { why: 'exception ' + (e.stack || e) };
          }
        }, act, 30000);
      } catch (e) {
        s = { why: String(e) };
      }
      if ((s.why || pageErrors()) && bad.length < 5) bad.push(`${k} ${JSON.stringify(act)}: ${s.why} ${pageErrors()}`);
      if (s.why.includes('hang')) break;
      if (s.why.includes('menu')) await ev(() => os.wimp.menus.close());
    }
    let end;
    try {
      end = await ev(async () => {
        const d = window.__doc('Rand'), v = d.dw.view;
        if (v.hdr) window.__key(d.win, 27, 'Escape');
        const wait = await window.__done(d, 30000);
        let n = 0;
        while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; }
        d.view.flush();
        await window.__frames(2);
        const res = { wait, n, same: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.splice(0),
          mode: !!v.hdr };
        d.dw.close();
        await window.__frames(1);
        return res;
      });
    } catch (e) {
      end = { exception: String(e) };
    }
    ok('300 random actions in the header and footer mode (typing, keys, selections, copy, cut, paste, Insert > Page number / Date, '
      + 'Update field, Field codes, the mode\'s menu, other pages\' headers and footers, Escape, undo, redo): nothing '
      + 'reported, the selection valid in the story after each; undoing everything gives the opened model',
    o.mode && !bad.length && !end.exception && end.wait >= 0 && end.same && !end.bad && !end.msgs.length && !pageErrors()
      && ['menu', 'undo', 'redo', 'enter', 'clip'].every((x) => counts[x] >= 10), { o, bad, end, counts });
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
process.exit();
