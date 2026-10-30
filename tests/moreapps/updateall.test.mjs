// Edit > Update all fields end to end (Batch E3, Task 11): a document
// with a stale caption number (SEQ), a REF to that caption, a table
// of contents, a PAGEREF behind the table, NUMPAGES and a STYLEREF in
// the header, through ./FieldUpdate updateAll on a stub window (real
// Document, DocLayout, Pages; the fake measurer). Word's order of
// dependency (caption renumber -> REF -> TOC -> PAGEREF), ONE undo
// step that restores everything, a second run changes nothing (no
// step), Draft gives what Print layout gives, Outline and Web layout
// keep the page numbers ('page numbers need Print layout'), the one
// summary message (./FieldPasses summaryText: the count, the fields
// kept as stored with their reasons, at most 5 named), locked fields
// untouched, w:dirty read and ignored on open but cleared on update,
// the 3-pass bound with a stub step, 10,000 fields within the ratio.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {run, summaryText, MAX_PASSES}
  from '../../tools/moreapps/!Letters/FieldPasses';
import {updateAll} from '../../tools/moreapps/!Letters/FieldUpdate';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {pageOf} from '../../tools/moreapps/!Letters/PageOfBookmark';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {entriesOf, tocFields}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {updateToc} from '../../tools/moreapps/!Letters/TocCmd';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {loadStyles, tm} from './word-docs.mjs';
import {stylesXml, p, r} from './build-docx.mjs';
import {fld, fldSimple, docWithFields} from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const sty = (id, name, inner = '', based = '') => '<w:style ' +
  `w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (based ? `<w:basedOn w:val="${based}"/>` : '') +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(sty('Normal', 'Normal') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal'));
const H = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);
const BR = '<w:r><w:br w:type="page"/></w:r>';
const bm = (name, inner, id) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>` + inner + `<w:bookmarkEnd w:id="${id}"/>`;
const read = (body, hdr) => docWithFields(body,
  hdr ? {default: {hdr}} : {}, {parts: {'word/styles.xml': STYLES}});
const storedOf = (doc, f) => {
  if (f.simple) return findBlock(doc, f.begin.id).b.inlines[f.begin.off]
    .text;
  const b = findBlock(doc, f.sep.id).b;
  return f.sep.id === f.end.id ? b.text.slice(f.sep.off + 1, f.end.off)
    : null;
};
/** The stored result of the first body field whose code matches. */
const res = (doc, re) => {
  const f = scan(doc).find((x) => re.test(x.instr));
  return f ? storedOf(doc, f) : undefined;
};
const snap = (doc) => structuredClone({s: doc.sections,
  t: [...doc.stories.values()]});
const same = (doc, s) => deepEqual(snap(doc), s);

/** A window over d (./FieldUpdate's fields) in view: its body
 *  layout made as the view makes it, laid out again on a change. */
function windowOf(d, view = 'print') {
  const v = {real: d, hdr: null, pending: null, typing: new Typing(d),
    get d() { return d; },
    get bodyL() { this.ensure(); return this._L; },
    ensure() {
      if (this._L && this._L.doc === d.doc && !this._stale) return;
      this._stale = false;
      const opts = {fields: {now: NOW}};
      if (view === 'outline') opts.outline = new Set();
      if (view === 'web') opts.web = 500;
      const L = new DocLayout(d.doc, tm(), this._L || null, opts);
      L.layout(800);
      if (view === 'print') {
        L.place = PlacePrint(L, new Pages(printGalley(L)).finish());
      }
      this._L = L;
    },
    refused() { this.beeps = (this.beeps || 0) + 1; },
    edited(sel) { this.sel = sel; }};
  d.on('change', () => { v._stale = true; });
  v.ensure();
  const id = d.doc.sections[0].blocks[0].id;
  v.sel = {anchor: {id, off: 0}, head: {id, off: 0}};
  return {view: v, viewName: view, fields: {now: NOW},
    L: {fields: {now: NOW}}, rebuild() {}};
}

/** The pages Print layout shows for doc. */
function printPages(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  return new Pages(printGalley(L)).finish();
}

const PARTS = 40;
/** The whole document: TOC (stale), the caption, REF, PAGEREF,
 *  NUMPAGES, headings, the target; STYLEREF in the header. */
async function whole() {
  let body = p(fld(' TOC \\o "1-3" \\h \\z \\u ', 'old table')) +
    H(1, 'Intro') +
    p(bm('_Ref1', r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '7'),
      1)) +
    p(fld(' REF _Ref1 \\h ', 'Figure 7')) +
    p(r('see page ') + fld(' PAGEREF tgt \\h ', '9')) +
    p(r('of ') + fld(' NUMPAGES ', '9')) +
    p(fld(' AUTHOR ', 'kept', {lock: true}));
  for (let k = 1; k <= PARTS; k++) body += H(2, 'Part ' + k);
  body += p(bm('tgt', r('target'), 2)) + p(r('x') + BR) + p(r('end'));
  return read(body, p(fld(' STYLEREF "Heading 1" ', 'old hdr')));
}
const hdrPart = (doc) => [...doc.stories.keys()]
  .find((k) => /header/.test(k));

describe('the whole document', () => {
  it('order, one step, undo, idempotent (Print layout)', async () => {
    const doc = await whole();
    const d = new Document(doc), dw = windowOf(d);
    const before = pageOf({doc, pages: printPages(doc)}, 'tgt').num;
    const s0 = snap(d.doc), n0 = d.undoDepth;
    assert.equal(updateAll(dw), true);
    assert.equal(d.undoDepth, n0 + 1, 'ONE undo step');
    // caption renumbered, REF reads the new number
    assert.equal(res(d.doc, /SEQ/), '1');
    assert.equal(res(d.doc, /REF _Ref1/), 'Figure 1');
    // the table made from the headings
    const [toc] = tocFields(d.doc);
    const es = entriesOf(d.doc, toc);
    assert.deepEqual(es.map((e) => e.text), ['Intro',
      ...Array.from({length: PARTS}, (_, k) => 'Part ' + (k + 1))]);
    // PAGEREF after the table: the page the target is on now
    const P = printPages(d.doc);
    const now = pageOf({doc: d.doc, pages: P}, 'tgt').num;
    assert.notEqual(now, before, 'the table moved the target');
    assert.equal(res(d.doc, /PAGEREF tgt/), String(now));
    assert.equal(res(d.doc, /NUMPAGES/), String(P.list.length));
    assert.deepEqual(es.map((e) => e.page), es.map((e) =>
      String(pageOf({doc: d.doc, pages: P}, e.anchor).num)));
    // locked field and the header (Update all: the body only)
    assert.equal(res(d.doc, /AUTHOR/), 'kept');
    const hf = facadeOf(d, hdrPart(d.doc));
    assert.equal(res(hf.doc, /STYLEREF/), 'old hdr');
    // the one message
    const u = dw.fieldUpdate;
    assert.equal(typeof u.text, 'string');
    assert.match(u.text, /fields updated/);
    assert.match(u.text, /1 field kept as stored: AUTHOR: locked/);
    await lintAfter(d.doc, 'updated');
    // again: nothing changes, no step
    assert.equal(updateAll(dw), true);
    assert.equal(dw.fieldUpdate.changed, false);
    assert.equal(d.undoDepth, n0 + 1, 'no second step');
    d.undo();
    assert.ok(same(d.doc, s0), 'undo: everything back');
  });

  it('Draft: page numbers worked out from the same galley as Print',
    async () => {
      const a = new Document(await whole());
      const b = new Document(await whole());
      updateAll(windowOf(a, 'print'));
      updateAll(windowOf(b, 'draft'));
      const all = (doc) => scan(doc).map((f) => storedOf(doc, f));
      assert.deepEqual(all(b.doc), all(a.doc));
    });

  for (const view of ['outline', 'web']) {
    it(`${view}: what needs no pages updated, page numbers kept`,
      async () => {
        const d = new Document(await whole()), dw = windowOf(d, view);
        const n0 = d.undoDepth;
        assert.equal(updateAll(dw), true);
        assert.equal(d.undoDepth, n0 + 1);
        assert.equal(res(d.doc, /SEQ/), '1');
        assert.equal(res(d.doc, /REF _Ref1/), 'Figure 1');
        assert.equal(res(d.doc, /PAGEREF tgt/), '9', 'kept');
        assert.equal(res(d.doc, /NUMPAGES/), '9', 'kept');
        const es = entriesOf(d.doc, tocFields(d.doc)[0]);
        assert.equal(es.length, PARTS + 1, 'the table made again');
        assert.match(dw.fieldUpdate.text,
          /[Pp]age numbers need Print layout/);
        assert.ok(!/NUMPAGES/.test(dw.fieldUpdate.text),
          'page fields not listed one by one: ' + dw.fieldUpdate.text);
      });
  }
});

describe('stale references and the message', () => {
  it('a REF whose bookmark is gone: source not found', async () => {
    const d = new Document(await read(p(fld(' REF gone \\h ', 'old')) +
      p(fld(' SEQ T ', '4'))));
    const dw = windowOf(d);
    assert.equal(updateAll(dw), true);
    assert.equal(res(d.doc, /REF/), 'old', 'stored result kept');
    assert.equal(dw.fieldUpdate.text, '1 field updated. 1 field ' +
      'kept as stored: source not found: REF gone \\h.');
  });

  it('summaryText: at most 5 named, then "and N more"', () => {
    const m = (k) => ({instr: 'REF b' + k, reason: 'missing bookmark'});
    const t = summaryText({updated: 3, messages: [1, 2, 3, 4, 5, 6, 7]
      .map(m)});
    assert.equal(t, '3 fields updated. 7 fields kept as stored: ' +
      'source not found: REF b1; source not found: REF b2; source ' +
      'not found: REF b3; source not found: REF b4; source not ' +
      'found: REF b5 and 2 more.');
    assert.equal(summaryText({updated: 0, messages: []}),
      'There are no fields to update.');
    assert.equal(summaryText({updated: 2, messages: [{instr: '',
      reason: 'pages not settled after 3 passes'}]}),
    '2 fields updated. Pages not settled after 3 passes.');
    assert.equal(summaryText({updated: 1, messages: [
      {instr: 'PAGE', reason: 'needs Print layout'},
      {instr: 'NUMPAGES', reason: 'needs Print layout'}]}),
    '1 field updated. Page numbers need Print layout: 2 page ' +
      'fields kept as stored.');
    assert.equal(summaryText({updated: 1, messages: [],
      noPages: true}), '1 field updated. Page numbers need Print ' +
      'layout: kept as they were.');
  });

  it('nothing could be updated: a beep and the message', async () => {
    const d = new Document(await read(p(fld(' PAGE ', '3',
      {lock: true}))));
    const dw = windowOf(d);
    assert.equal(updateAll(dw), false);
    assert.equal(dw.view.beeps, 1);
    assert.equal(dw.fieldUpdate.text,
      '0 fields updated. 1 field kept as stored: PAGE: locked.');
    const e = new Document(await read(p(r('plain'))));
    const ew = windowOf(e);
    assert.equal(updateAll(ew), false);
    assert.equal(ew.fieldUpdate.text, 'There are no fields to update.');
  });
});

/** The begin fldChars' w:dirty in the saved document.xml. */
async function dirtyIn(doc) {
  const {zip} = await lintAfter(doc, 'saved');
  const xml = new TextDecoder().decode(zip.get('word/document.xml'));
  return (xml.match(/w:dirty="[^"]*"/g) || []).length;
}

describe('w:dirty', () => {
  const body = () => read(p(fld(' SEQ A ', '1', {dirty: true})) +
    p(fld(' SEQ A ', '5', {dirty: true})) +
    p(fld(' TOC \\o "1-3" ', 'old', {dirty: true})) + H(1, 'Head') +
    p(fld(' AUTHOR ', 'x', {dirty: true, lock: true})));

  it('read and ignored on open: saved as it was', async () => {
    const doc = await body();
    assert.equal(scan(doc).filter((f) => f.dirty).length, 4);
    assert.equal(await dirtyIn(doc), 4);
    assert.equal(res(doc, /SEQ/), '1');
  });

  it('cleared on update (a value already right too); a locked ' +
    'field keeps it', async () => {
    const d = new Document(await body()), dw = windowOf(d);
    const n0 = d.undoDepth;
    assert.equal(updateAll(dw), true);
    assert.equal(d.undoDepth, n0 + 1);
    const fs = scan(d.doc);
    assert.deepEqual(fs.filter((f) => f.dirty).map((f) =>
      f.instr.trim()), ['AUTHOR'], 'only the locked one');
    assert.equal(await dirtyIn(d.doc), 1);
    assert.equal(updateAll(dw), true);
    assert.equal(d.undoDepth, n0 + 1, 'idempotent');
    d.undo();
    assert.equal(scan(d.doc).filter((f) => f.dirty).length, 4);
  });

  it('a table of contents\' page numbers only: cleared too',
    async () => {
      const d = new Document(await body());
      const g = tocFields(d.doc)[0];
      assert.equal(g.dirty, true);
      const P = printPages(d.doc);
      const n0 = d.undoDepth;
      assert.ok(updateToc(d, new Typing(d), g, 'pages', {now: NOW,
        pages: {finish: () => P}}));
      assert.equal(tocFields(d.doc)[0].dirty, false);
      assert.equal(d.undoDepth, n0 + 1);
    });

  it('a fldSimple: cleared too', async () => {
    const doc = await read(p(fldSimple(' SEQ A ', '1')
      .replace('<w:fldSimple ', '<w:fldSimple w:dirty="true" ')));
    const d = new Document(doc), dw = windowOf(d);
    assert.equal(scan(d.doc)[0].dirty, true);
    assert.equal(updateAll(dw), true);
    assert.equal(scan(d.doc)[0].dirty, false);
    assert.equal(await dirtyIn(d.doc), 0);
  });
});

describe('the bound and the cost', () => {
  it('a stub step that always changes stops at 3 passes, one step',
    async () => {
      const d = new Document(await read(p(r('n'))));
      const t = new Typing(d), n0 = d.undoDepth;
      let runs = 0;
      const flip = {name: 'flip', paged: true, run(dd) {
        runs++;
        dd.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
          ins: 'x'});
        return {found: 1, changed: true, messages: []};
      }};
      const out = t.command(() => run(d, {now: NOW,
        relayout: () => null}, null, {steps: [flip]}));
      assert.equal(out.passes, MAX_PASSES);
      assert.equal(runs, MAX_PASSES);
      assert.equal(d.undoDepth, n0 + 1);
      assert.match(summaryText(out), /Pages not settled after 3/);
    });

  /** ms of Update all fields over n fields (SEQ, REF, AUTHOR; best
   *  of 3), each stored wrong. */
  async function timed(n) {
    const per = 10, rows = Array.from({length: n / per}, () =>
      p(Array.from({length: per / 2}, () => fld(' SEQ F ', '0') +
        r(' ') + fld(' REF b ', 'old') + r(' ')).join('')));
    const doc0 = await read(p(bm('b', r('there'), 1)) + rows.join(''));
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const d = new Document(structuredClone(doc0));
      const t0 = performance.now();
      const out = run(d, {now: NOW}, null);
      best = Math.min(best, performance.now() - t0);
      assert.ok(out.changed);
      assert.equal(out.updated, n);
    }
    return best;
  }

  it('10,000 fields take about ten times 1,000', async () => {
    const a = await timed(1000), b = await timed(10000);
    console.log(`# Update all fields: 1,000 ${a.toFixed(0)} ms, ` +
      `10,000 ${b.toFixed(0)} ms`);
    assert.ok(b < Math.max(a, 5) * 30, `${b} ms vs ${a} ms`);
  });
});
