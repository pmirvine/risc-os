// Footnotes on their pages (Batch E2): the foot of each page
// (NotePlace settle) on fake galleys (page-fixtures, frame 100 px,
// items 10 px, notes of fake lines, separators 5 px) and on real
// documents (the fake measurer): the body shortened by the notes of
// its marks, notes cut and continued, a mark's line moved with its
// note, columns, below the text, reuse, numbers by page, cost.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {MAX_TRIES, stats}
  from '../../tools/moreapps/!Letters/NotePlace';
import {galley} from './page-fixtures.mjs';
import {rng, tm, mkDoc, loadStyles} from './word-docs.mjs';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley, hfHooks}
  from '../../tools/moreapps/!Letters/PageHF';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {notePass, MAX_PASSES, stats as noteStats}
  from '../../tools/moreapps/!Letters/NoteHooks';
import {OBJ, emptyNotes} from '../../tools/moreapps/!Letters/Model';
import {bump} from '../../tools/moreapps/!Letters/DocVersion';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {noteDoc, mark, noteP, words} from './note-fixtures.mjs';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {RULE_W} from '../../tools/moreapps/!Letters/NoteLayout';
import {DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CORPUS, nameOf, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {wordStarts, lineBase, ourStarts, placesOf, scoreStarts,
  madeByWord} from './pagestarts.mjs';

/** The corpus's .docx files (optional, git-ignored). */
function find(dir, out = []) {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    const q = join(dir, e.name);
    if (e.isDirectory()) find(q, out);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) {
      out.push(q);
    }
  }
  return out.sort();
}
const corpusFiles = existsSync(CORPUS) ? find(CORPUS) : [];

const tens = (n) => Array(n).fill(10);
const ref = (id, line = 0) => ({line, id});
/** A fake note layout of lines hs (px each). */
function layOf(hs) {
  let b = 0;
  const lines = Object.freeze(hs.map((h) => (b += h)));
  return Object.freeze({lines, h: b});
}
/** spec as page-fixtures galley's, with notes {id: [line px]},
 *  seps {type: px} (separators 5, no notice) and pos. */
function galleyN(spec) {
  const G = galley(spec);
  const lays = new Map(Object.entries(spec.notes || {})
    .map(([id, hs]) => [Number(id), layOf(hs)]));
  const seps = {separator: 5, continuationSeparator: 5,
    continuationNotice: 0, ...(spec.seps || {})};
  G.notes = {note: (id) => lays.get(id) || null,
    sep: (t) => (seps[t] ? {h: seps[t]} : null),
    pos: () => spec.pos || 'pageBottom'};
  return G;
}
const pagesOf = (spec) => new Pages(galleyN(spec)).finish();
const ks = (P) => P.list.map((pg) => pg.start.k);
const feet = (P) => P.list.map((pg) => pg.notes || null);
/** Every note's lines over the pages: [id, from, to] in order. */
const shown = (P) => P.list.flatMap((pg) => (pg.notes
  ? pg.notes.pieces.map((x) => [x.id, x.from, x.to]) : []));

describe('Footnotes on a page (fake galleys)', () => {
  it('one note shortens the body of its page by separator plus ' +
    'its lines', () => {
    const items = tens(30);
    items[2] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: [10, 10]}});
    const pg = P.at(0);
    assert.deepEqual(pg.end, {k: 7, line: 0});
    assert.equal(pg.notes.bodyH, 75);
    assert.equal(pg.notes.h, 25);
    assert.equal(pg.notes.y, 75);
    assert.equal(pg.notes.sep, 'separator');
    assert.deepEqual(pg.notes.pieces, [{id: 1, from: 0, to: 2, y: 5,
      h: 20, s: 0}]);
    assert.deepEqual(pg.notes.left, []);
    assert.equal(P.at(1).notes, undefined);
    assert.deepEqual(ks(pagesOf({items: tens(30)})), [0, 10, 20]);
    assert.deepEqual(ks(P), [0, 7, 17, 27]);
    assert.equal(pg.frames[0].h, 75);
  });

  it('two notes on a page', () => {
    const items = tens(30);
    items[1] = {h: 10, refs: [ref(1)]};
    items[3] = {h: 10, refs: [ref(2)]};
    const pg = pagesOf({items, notes: {1: [10], 2: [10]}}).at(0);
    assert.deepEqual(pg.end, {k: 7, line: 0});
    assert.deepEqual(pg.notes.pieces.map((x) => [x.id, x.y, x.h]),
      [[1, 5, 10], [2, 15, 10]]);
    const two = tens(30);
    two[1] = {lines: [10], refs: [ref(2), ref(1)]};
    const q = pagesOf({items: two, notes: {1: [10], 2: [10]}}).at(0);
    assert.deepEqual(q.notes.pieces.map((x) => x.id), [2, 1]);
  });

  it('a note longer than the page continues on the next page with ' +
    'the continuation separator', () => {
    const items = tens(30);
    items[0] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: tens(15)}});
    const f = feet(P);
    // the mark's page: its line, then the note to the frame's foot
    assert.deepEqual(P.at(0).end, {k: 1, line: 0});
    assert.equal(f[0].sep, 'separator');
    assert.deepEqual(f[0].left, [{id: 1, from: 8, s: 0}]);
    assert.equal(f[0].y + f[0].h, 100);
    assert.equal(f[1].sep, 'continuationSeparator');
    assert.equal(f[1].pieces[0].from, 8);
    assert.deepEqual(shown(P), [[1, 0, 8], [1, 8, 15]]);
    assert.ok(P.at(1).end.k > P.at(1).start.k, 'the body goes on');
    assert.equal(P.list.filter((pg) => pg.notes).length, 2);
  });

  it('the continuation notice appears on the cut page', () => {
    const items = tens(30);
    items[0] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: tens(15)},
      seps: {continuationNotice: 8}});
    const [a, b] = feet(P);
    assert.equal(a.notice, 8);
    assert.equal(a.h, 5 + a.pieces[0].h + 8);
    assert.equal(a.y + a.h, 100);
    assert.ok(b.left.length ? b.notice === 8 : b.notice === 0);
    const last = feet(P).filter(Boolean).pop();
    assert.equal(last.notice, 0);
    assert.deepEqual(last.left, []);
  });

  it('a mark on the last body line pushes the line to the next page ' +
    'when the note cannot fit with it', () => {
    const items = tens(30);
    items[9] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: [10]}});
    assert.deepEqual(P.at(0).end, {k: 9, line: 0});
    // (no note shown: a foot of no height records the note looked at)
    assert.deepEqual([P.at(0).notes.pieces, P.at(0).notes.h], [[], 0]);
    assert.equal(P.at(1).start.k, 9);
    assert.deepEqual(P.at(1).notes.pieces.map((x) => x.id), [1]);
    // a paragraph: its line with the mark goes, the lines above stay
    const p = [...tens(5), {lines: tens(5), refs: [ref(1, 4)]}];
    const Q = pagesOf({items: p, notes: {1: [10]}});
    assert.deepEqual(Q.at(0).end, {k: 5, line: 3});
    assert.deepEqual(Q.at(1).notes.pieces.map((x) => x.id), [1]);
  });

  it('notes with keepNext chains', () => {
    const items = tens(30);
    items[8] = {h: 10, keepNext: true};
    items[9] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: [10]}});
    assert.deepEqual(P.at(0).end, {k: 8, line: 0});
    assert.equal(P.at(1).start.k, 8);
    assert.deepEqual(P.at(1).notes.pieces.map((x) => x.id), [1]);
  });

  it('notes in two columns take the page width below the columns',
    () => {
      const TWO = [{x: 10, w: 85}, {x: 105, w: 85}];
      const items = tens(40);
      items[3] = {h: 10, refs: [ref(1)]};
      const P = pagesOf({items, notes: {1: [10, 10]},
        sections: [{cols: TWO, size: {w: 200, h: 120}}]});
      const pg = P.at(0);
      assert.equal(pg.cols.length, 2);
      assert.deepEqual(pg.cols.map((c) => c.h), [75, 75]);
      assert.deepEqual(pg.end, {k: 14, line: 0});
      assert.equal(pg.notes.y, 75);
      // a mark in the second column counts as well
      const late = tens(40);
      late[12] = {h: 10, refs: [ref(1)]};
      const Q = pagesOf({items: late, notes: {1: [10, 10]},
        sections: [{cols: TWO, size: {w: 200, h: 120}}]});
      assert.deepEqual(Q.at(0).notes.pieces.map((x) => x.id), [1]);
      assert.deepEqual(Q.at(0).end, {k: 14, line: 0});
    });

  it('beneathText position', () => {
    const items = tens(5);
    items[0] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: [10]}, pos: 'beneathText'});
    assert.equal(P.at(0).notes.y, 50);
    const B = pagesOf({items, notes: {1: [10]}});
    assert.equal(B.at(0).notes.y, 85);
  });

  it('a missing/unknown note does not break pagination', () => {
    const items = tens(30);
    items[2] = {h: 10, refs: [ref(99)]};
    const P = pagesOf({items, notes: {1: [10]}});
    assert.deepEqual(ks(P), [0, 10, 20]);
    assert.ok(P.list.every((pg) => !pg.notes ||
      (!pg.notes.pieces.length && !pg.notes.h)));
  });

  it('a note on the last line: the pages go on until it is all ' +
    'shown', () => {
    const P = pagesOf({items: [{h: 10, refs: [ref(1)]}],
      notes: {1: tens(35)}});
    assert.ok(P.done);
    assert.deepEqual(shown(P).reduce((n, x) => n + x[2] - x[1], 0), 35);
    assert.equal(P.list[P.count - 1].notes.left.length, 0);
    assert.ok(P.count >= 4);
  });

  it('a note marked twice on a page is placed once', () => {
    const items = tens(30);
    items[2] = {h: 10, refs: [ref(1)]};
    items[4] = {h: 10, refs: [ref(1)]};
    const P = pagesOf({items, notes: {1: [10]}});
    assert.deepEqual(shown(P), [[1, 0, 1]]);
  });
});

const STARTS = ['nextPage', 'continuous', 'evenPage', 'oddPage'];
/** A random galley spec: lines with marks (half of them), notes of
 *  random lines, section breaks of every type (parity ones too). */
function randomSpec(rand) {
  const notes = {}, items = [];
  const count = 5 + Math.floor(rand() * 40);
  for (let k = 0; k < count; k++) {
    const lines = Array.from({length: 1 + Math.floor(rand() * 6)},
      () => 5 + Math.floor(rand() * 20));
    const refs = [];
    lines.forEach((_, j) => {
      if (rand() < 0.5) {
        const id = Object.keys(notes).length + 1;
        notes[id] = Array.from({length: 1 + Math.floor(rand() * 12)},
          () => 3 + Math.floor(rand() * 30));
        refs.push(ref(id, j));
      }
    });
    const it = {lines, refs, keepNext: rand() < 0.1,
      widow: rand() < 0.7};
    if (k && rand() < 0.08) {
      it.sectStart = STARTS[Math.floor(rand() * STARTS.length)];
    }
    items.push(it);
  }
  return {items, notes, seps: {continuationNotice: rand() < 0.5 ? 6
    : 0}};
}

/** Every line of every note in spec shown once, in order, on no
 *  blank page (the pages P). */
function allOnce(P, spec) {
  const got = new Map();
  P.list.forEach((pg) => {
    const xs = pg.notes ? pg.notes.pieces : [];
    if (pg.blank) assert.equal(xs.length, 0, 'blank');
    for (const x of xs) {
      const was = got.get(x.id) || 0;
      assert.equal(x.from, was, `note ${x.id} in order`);
      got.set(x.id, x.to);
    }
  });
  for (const [id, hs] of Object.entries(spec.notes)) {
    assert.equal(got.get(Number(id)), hs.length, `note ${id} all`);
  }
}

describe('Footnotes on a page: settling is bounded', () => {
  it('settling is bounded: a pathological note layout stops', () => {
    // every line a mark, notes of random heights, section breaks:
    // each page tries at most MAX_TRIES fills, every note line is
    // shown once, in order, never before its mark's page
    const rand = rng(7);
    for (let n = 0; n < 200; n++) {
      const spec = randomSpec(rand), {items, notes} = spec;
      const count = items.length;
      const G = galleyN(spec);
      const P = new Pages(G);
      let pages = 0, last = stats.fills;
      while (P.more()) {
        assert.ok(++pages < 2000, 'stops');
        assert.ok(stats.fills - last <= MAX_TRIES, 'tries');
        last = stats.fills;
      }
      const got = new Map();
      P.list.forEach((pg, i) => {
        for (const x of pg.notes ? pg.notes.pieces : []) {
          const g = got.get(x.id) || {to: 0, page: i};
          assert.equal(x.from, g.to, `note ${x.id} in order`);
          got.set(x.id, {to: x.to, page: g.page});
        }
      });
      const markPage = new Map();
      P.list.forEach((pg, i) => {
        for (let k = pg.start.k; k <= Math.min(pg.end.k, count - 1);
          k++) {
          for (const r of items[k].refs) {
            const on = (k > pg.start.k || r.line >= pg.start.line) &&
              (k < pg.end.k || r.line < pg.end.line);
            if (on && !markPage.has(r.id)) markPage.set(r.id, i);
          }
        }
      });
      for (const [id, hs] of Object.entries(notes)) {
        const g = got.get(Number(id));
        assert.ok(g, `note ${id} shown`);
        assert.equal(g.to, hs.length, `note ${id} all shown`);
        assert.ok(g.page >= markPage.get(Number(id)), `note ${id}`);
      }
      allOnce(P, spec);
    }
  });

  it('the rest of a cut note goes over a parity blank page to the ' +
    'next page with text', () => {
    for (const [type, at] of [['evenPage', 5], ['oddPage', 4]]) {
      const items = tens(20);
      items[3] = {h: 10, refs: [ref(1)]};
      items[at] = {h: 10, sectStart: type};
      const spec = {items, notes: {1: tens(15)}};
      const P = pagesOf(spec);
      const b = P.list.findIndex((pg) => pg.blank);
      assert.ok(b > 0, type);
      const before = P.at(b - 1).notes;
      assert.ok(before.left.length, 'cut before the blank page');
      assert.deepEqual(P.at(b).notes.left, before.left);
      const after = P.at(b + 1).notes;
      assert.equal(after.sep, 'continuationSeparator');
      assert.equal(after.pieces[0].from, before.left[0].from);
      allOnce(P, spec);
    }
  });
});

describe('Footnotes: pages kept only while their notes are the same',
  () => {
    /** spec's galley as a layout's after an edit of notes only. */
    const edited = (spec) => {
      const G = galleyN(spec);
      G.dirtyFrom = Infinity;
      G.cleanFrom = 0;
      return G;
    };
    const same = (Q, F) => assert.deepEqual(
      JSON.parse(JSON.stringify(Q.list)),
      JSON.parse(JSON.stringify(F.list)));

    it('a note made shorter brings its mark\'s line back to the page ' +
      'before', () => {
      const items = tens(30);
      items[8] = {h: 10, refs: [ref(1)]};
      const P = pagesOf({items, notes: {1: [10]}});
      assert.equal(P.at(0).end.k, 8);
      const spec = {items, notes: {1: [4]}};
      const Q = new Pages(edited(spec), P).finish();
      const F = pagesOf(spec);
      assert.equal(F.at(0).end.k, 9);
      same(Q, F);
    });

    it('a note made longer pushes its mark\'s line off the page',
      () => {
      const items = tens(30);
      items[7] = {h: 10, refs: [ref(1)]};
      const P = pagesOf({items, notes: {1: [10]}});
      assert.equal(P.at(0).end.k, 8);
      const spec = {items, notes: {1: [10, 10, 10]}};
      const Q = new Pages(edited(spec), P).finish();
      same(Q, pagesOf(spec));
    });

    it('any note edited (random galleys): the pages kept and the ' +
      'rest equal a fresh pagination', () => {
      const rand = rng(11);
      for (let n = 0; n < 200; n++) {
        const spec = randomSpec(rand);
        const ids = Object.keys(spec.notes);
        if (!ids.length) continue;
        const P = pagesOf(spec);
        const id = ids[Math.floor(rand() * ids.length)];
        const hs = spec.notes[id];
        const now = rand() < 0.5 ? hs.slice(0, Math.max(1,
          hs.length - 1 - Math.floor(rand() * 4)))
          : [...hs, ...Array.from({length: 1 + Math.floor(rand() * 8)},
            () => 3 + Math.floor(rand() * 30))];
        if (rand() < 0.3) now[0] = 2 + Math.floor(rand() * 40);
        const spec2 = {...spec, notes: {...spec.notes, [id]: now}};
        const Q = new Pages(edited(spec2), P).finish();
        same(Q, pagesOf(spec2));
      }
    });
  });

// ---- real documents (the fake measurer, 1000 px) ----

const M = tm();                        // (one: layouts are reused)
const doL = (doc) => {
  const L = new DocLayout(doc, M);
  L.layout(1000);
  return L;
};
const paged = (L, prev) => new Pages(printGalley(L), prev).finish();
/** n paragraphs 'para i' (one line each); marks: {i: note id}. */
function bodyOf(n, marks = {}) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += p(r('para ' + i) + (marks[i] !== undefined ? mark(marks[i])
      : ''));
  }
  return out;
}
/** The pages as plain values (frames left out). */
const plain = (P) => JSON.parse(JSON.stringify(P.list));

describe('Footnotes on the pages of a real document', () => {
  it('a document without notes paginates exactly as before',
    async () => {
    const plainDoc = await readDocx(await buildDocx({
      'word/document.xml': documentXml(bodyOf(130))}));
    const seps = await noteDoc(bodyOf(130), {});
    const marked = await noteDoc(bodyOf(130, {5: 9}), {});
    for (const doc of [plainDoc, seps, marked]) {
      const L = doL(doc), G = printGalley(L);
      assert.equal(G.notes, undefined);
      assert.equal('reserve' in G, false);
      const old = new Pages(galleyOf(L, hfHooks(L))).finish();
      const P = new Pages(G).finish();
      assert.deepEqual(plain(P), plain(old));
      assert.ok(P.list.every((pg) => !('notes' in pg)));
      // reuse: a keystroke keeps the pages as it did (identity)
      const f0 = stats.fills;
      const L2 = new DocLayout(doc, M, L);
      L2.layout(1000);
      const Q = paged(L2, P);
      assert.equal(Q.kept, P.count);
      assert.ok(Q.list.every((pg, i) => pg === P.list[i]));
      assert.equal(stats.fills, f0, 'no fill of NotePlace');
    }
  });

  it('a page with notes: the body above them, the note at the foot',
    async () => {
      const doc = await noteDoc(bodyOf(130, {3: 1, 60: 2}),
        {1: noteP('one'), 2: noteP(words(200))});
      const L = doL(doc), G = printGalley(L), P = paged(L);
      const a = P.at(0), F = a.frameH;
      assert.deepEqual(a.notes.pieces.map((x) => x.id), [1]);
      assert.ok(Math.abs(a.notes.y + a.notes.h - F) < 1e-9);
      const lay = G.notes.note(1, 0);
      assert.equal(a.notes.h, a.notes.sepH + lay.h);
      const plainP = new Pages(galleyOf(L, hfHooks(L))).finish();
      assert.ok(a.end.k < plainP.at(0).end.k);
      // note 2 is long: cut at the foot of its page, then on
      const i2 = P.list.findIndex((pg) => pg.notes &&
        pg.notes.pieces.some((x) => x.id === 2));
      const f = P.at(i2).notes, g = P.at(i2 + 1).notes;
      assert.ok(f.left.length === 1 || g === undefined);
      const all = P.list.flatMap((pg) => pg.notes ? pg.notes.pieces
        .filter((x) => x.id === 2) : []);
      assert.equal(all[all.length - 1].to,
        G.notes.note(2, 0).lines.length);
    });

  it('notes in two columns take the page width below the columns',
    async () => {
      const cols = '<w:sectPr><w:cols w:num="2" w:space="720"/>' +
        '</w:sectPr>';
      const doc = await noteDoc(bodyOf(150, {70: 1}) + cols,
        {1: noteP(words(30))});
      const L = doL(doc), G = printGalley(L), P = paged(L);
      const g = L.geom(0), lay = G.notes.note(1, 0);
      assert.equal(g.cols.length, 2);
      assert.equal(lay.L.items[0].w, g.textW);
      const pg = P.list.find((x) => x.notes);
      assert.ok(pg.cols && pg.cols.length === 2);
      assert.ok(pg.cols.every((c) => c.h === pg.notes.bodyH));
    });

  it('beneathText position', async () => {
    const doc = await noteDoc(bodyOf(5, {1: 1}), {1: noteP('n')},
      {settings: '<w:footnotePr><w:pos w:val="beneathText"/>' +
        '</w:footnotePr>'});
    const L = doL(doc), P = paged(L), f = P.at(0).notes;
    const last = L.items[4];
    assert.ok(Math.abs(f.y - (last.y + last.h - last.gapBelow -
      P.at(0).y0)) < 30, `${f.y}`);
    assert.ok(f.y < P.at(0).frameH / 2);
  });

  it('a mark in a table cell: the note is on the page of its row',
    async () => {
      const cell = (x) => `<w:tc><w:p><w:r><w:t>${x}</w:t></w:r>` +
        '</w:p></w:tc>';
      const rows = Array.from({length: 80}, (_, i) => '<w:tr>' +
        cell('r' + i) + (i === 60 ? '<w:tc>' + p(r('m') + mark(1)) +
          '</w:tc>' : cell('x')) + '</w:tr>').join('');
      const doc = await noteDoc('<w:tbl><w:tblPr><w:tblW w:w="0" ' +
        'w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/>' +
        '<w:gridCol w:w="3000"/></w:tblGrid>' + rows + '</w:tbl>' +
        p(r('end')), {1: noteP('in a cell')});
      const L = doL(doc), G = printGalley(L), P = paged(L);
      assert.equal(L.items[0].kind, 'tbl');
      assert.deepEqual(G.facts(0).refs, [{line: 60, id: 1}]);
      const i = P.list.findIndex((pg) => pg.notes);
      const pg = P.at(i);
      assert.ok(i > 0, 'not on the first page');
      assert.ok(pg.start.line <= 60 && (pg.end.k > 0 ||
        pg.end.line > 60), JSON.stringify([pg.start, pg.end]));
    });

  it('a note marked twice is placed once, on its first mark\'s page',
    async () => {
      const doc = await noteDoc(bodyOf(130, {2: 1, 90: 1}),
        {1: noteP('once')});
      const P = paged(doL(doc));
      const at = P.list.flatMap((pg, i) => pg.notes ? [i] : []);
      assert.deepEqual(at, [0]);
    });

  it('a missing/unknown note does not break pagination', async () => {
    const doc = await noteDoc(bodyOf(130, {2: 7, 9: 1}),
      {1: noteP('there')});
    const P = paged(doL(doc));
    assert.deepEqual(P.at(0).notes.pieces.map((x) => x.id), [1]);
    // a notes part that is no notes (kept as bytes): no foot at all
    const bad = await noteDoc(bodyOf(30, {2: 1}), {1: noteP('x') +
      '<w:sectPr/>'});
    const L = doL(bad);
    assert.equal(printGalley(L).notes, undefined);
    assert.ok(paged(L).done);
  });

  it('a note over several pages: no line cut by rounding; the body ' +
    'keeps its first line on each page the note goes on over',
    async () => {
      // (the frame F - cap came out a hair short of the first line,
      // which was then cut at its foot; the pages after started in
      // it, with no line of the body left to keep)
      const doc = await noteDoc(bodyOf(130, {0: 1}),
        {1: noteP(words(3000))}, {notice: p(r('(continued)'))});
      const P = paged(doL(doc));
      assert.deepEqual(P.at(0).end, {k: 1, line: 0});
      const cont = P.list.filter((pg) => pg.notes &&
        pg.notes.sep === 'continuationSeparator');
      assert.ok(cont.length >= 3, 'over several pages');
      for (const pg of P.list) {
        assert.ok(!pg.start.dy && !pg.end.dy, 'no line cut');
        if (pg.start.k < 130) assert.ok(pg.end.k > pg.start.k);
        if (pg.notes && pg.notes.left.length)
          assert.ok(pg.notes.pieces.length, 'a line of the note shown');
      }
    });
});

describe('Footnotes: reuse, numbers by page, cost', () => {
  it('PageReuse: editing a note\'s text re-lays out only its page ' +
    'and the next', async () => {
    // (a note that grows moves the body after it, as any edit does:
    // the pages before its page are kept, the rest as fresh ones)
    const marks = {};
    for (let i = 3; i < 2000; i += 37) marks[i] = i;
    const notes = {};
    for (const id of Object.values(marks)) {
      notes[id] = noteP('note ' + id + ' ' + words(id % 3 ? 4 : 30));
    }
    const doc = await noteDoc(bodyOf(2000, marks), notes);
    let L = doL(doc), P = paged(L);
    assert.ok(P.count > 30, `${P.count}`);
    const on = (id) => P.list.findIndex((pg) => pg.notes &&
      pg.notes.pieces.some((x) => x.id === id));
    for (const [id, more, grows] of [[1002, 'x'], [3, 'y'],
      [1002, ' ' + words(60), true]]) {
      const at = on(id);
      const n = doc.notes.footnotes.get(id);
      const blocks = [{...n.blocks[0], text: n.blocks[0].text + more,
        runs: n.blocks[0].runs.map((x, k, a) => k === a.length - 1
          ? {...x, end: x.end + more.length} : x)}];
      doc.notes = {...doc.notes, footnotes: new Map(doc.notes
        .footnotes).set(id, {...n, blocks})};
      bump(doc);
      const L2 = new DocLayout(doc, M, L);
      L2.layout(1000);
      const Q = paged(L2, P);
      const fresh = paged(doL(doc));
      assert.deepEqual(plain(Q), plain(fresh));
      if (!grows) {                    // (the same height)
        assert.ok(Q.count - Q.kept <= 2, `${id}: ${Q.count - Q.kept}`);
      } else {                         // (the body moves: as an edit)
        assert.ok(Q.kept >= at, `${Q.kept} ${at}`);
        assert.ok(Q.list.slice(0, at).every((pg, i) => pg ===
          P.list[i]));
      }
      L = L2;
      P = Q;
    }
  });

  it('restart each page numbers are right after settle', async () => {
    const marks = {}, notes = {};
    for (let i = 2; i < 160; i += 9) {
      marks[i] = i;
      notes[i] = noteP('n' + i);
    }
    const doc = await noteDoc(bodyOf(160, marks), notes,
      {settings: '<w:footnotePr><w:numRestart w:val="eachPage"/>' +
        '</w:footnotePr>'});
    let L = doL(doc), P = paged(L), n = 0;
    for (let fx; (fx = notePass(L, P));) {
      assert.ok(++n <= MAX_PASSES);
      const L2 = new DocLayout(doc, M, L, {fields: fx});
      L2.layout(1000);
      P = paged(L2, P);
      L = L2;
    }
    assert.ok(n >= 1);
    assert.ok(P.count >= 3, `${P.count}`);
    const G = printGalley(L);
    for (const pg of P.list) {
      const ids = pg.notes ? pg.notes.pieces.filter((x) => !x.from)
        .map((x) => x.id) : [];
      ids.forEach((id, k) => {
        const it = L.byId.get(L.items[marks[id] ? id : 0].id);
        const para = it.block, off = para.text.indexOf(OBJ);
        assert.equal(L.fieldText(para, off).text, String(k + 1),
          `mark ${id}`);
        const lay = G.notes.note(id, 0), q = lay.L.items[0].block;
        assert.equal(lay.L.fieldText(q, q.text.indexOf(OBJ)).text,
          String(k + 1), `note ${id}`);
      });
    }
    assert.equal(notePass(L, P), null);
  });

  it('10,000 notes paginate within a load-robust ratio', async () => {
    const N = 10000, marks = {}, notes = {};
    for (let i = 0; i < N; i++) {
      marks[i] = i + 1;
      notes[i + 1] = noteP('note ' + (i + 1));
    }
    const doc = await noteDoc(bodyOf(N, marks), notes);
    const none = {...doc, notes: emptyNotes()};
    const time = (d) => {
      let best = Infinity, P = null;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        P = paged(doL(d));
        best = Math.min(best, performance.now() - t0);
      }
      return {best, P};
    };
    const t0 = performance.now();
    const first = paged(doL(doc));
    const cold = performance.now() - t0;
    const a = time(none), b = time(doc);
    assert.equal(first.count, b.P.count);
    const shownIds = new Set(b.P.list.flatMap((pg) => pg.notes
      ? pg.notes.pieces.map((x) => x.id) : []));
    assert.equal(shownIds.size, N);
    const ratio = b.best / a.best;
    console.log(`# 10,000 notes: ${b.P.count} pages; layout and ` +
      `pages ${b.best.toFixed(0)} ms against ${a.best.toFixed(0)} ms ` +
      `without notes (x${ratio.toFixed(2)}); the first, laying the ` +
      `notes out, ${cold.toFixed(0)} ms`);
    assert.ok(ratio < 3, `ratio ${ratio}`);
    if (process.env.WORD_PERF) assert.ok(cold < 1500, `${cold} ms`);
  });
});

describe('Footnotes painted at the foot of their page', () => {
  /** A context recording fillRect and fillText in device space. */
  function rec() {
    const calls = [], st = [];
    let tx = 0, ty = 0;
    const t = {calls, save: () => st.push([tx, ty]),
      restore: () => { [tx, ty] = st.pop(); },
      translate: (x, y) => { tx += x; ty += y; },
      measureText: (s) => ({width: 6 * s.length})};
    return new Proxy(t, {get(o, k) {
      if (k in o) return o[k];
      return (...a) => {
        if (k === 'fillRect') calls.push(['rect', a[0] + tx, a[1] + ty,
          a[2], a[3]]);
        if (k === 'fillText') calls.push(['text', a[0], a[1] + tx,
          a[2] + ty]);
        if (k === 'rect') calls.push(['clip', a[1] + ty, a[3]]);
      };
    }, set: () => true});
  }

  it('the separator rule, then the note\'s text, inside the foot; a ' +
    'continued note from its first line left', async () => {
    const doc = await noteDoc(bodyOf(120, {40: 1}),
      {1: noteP('first ' + words(400))});
    const L = doL(doc), P = paged(L);
    L.place = PlacePrint(L, P);
    L.layout(1000);
    const i = P.list.findIndex((pg) => pg.notes);
    const pg = P.at(i), f = pg.notes;
    assert.ok(f.left.length, 'cut');
    const g = rec();
    paintPage(P, i, g, {place: L.place});
    const y0 = Math.round(pg.bodyTop + f.y);
    const rule = g.calls.find((c) => c[0] === 'rect' &&
      c[3] === RULE_W && c[4] === 1);
    assert.ok(rule && rule[2] >= y0 && rule[2] <= y0 + f.sepH, 'rule');
    const ts = g.calls.filter((c) => c[0] === 'text' && c[3] > y0);
    assert.equal(ts[0][1], '1', 'its own mark shows its number');
    assert.ok(ts.some((c) => c[1].includes('first')), 'the note');
    const pc = f.pieces[0];             // (cut to the piece)
    assert.ok(g.calls.some((c) => c[0] === 'clip' &&
      c[1] === y0 + Math.round(pc.y) && c[2] === pc.h), 'clipped');
    // a click in the notes: the body's place below its last line
    const sr = L.place.sheet.rect(pg);
    const hit = L.hitTest(sr.x + 120, sr.y + y0 + f.h / 2);
    assert.ok(hit && hit.pos && L.byId.has(hit.pos.id));
    assert.equal(P.ofPos(hit.pos, hit.affinity), i);
    // the next page: the continuation separator, the width long
    const g2 = rec(), nx = P.at(i + 1);
    paintPage(P, i + 1, g2, {place: L.place});
    const y1 = Math.round(nx.bodyTop + nx.notes.y);
    assert.equal(nx.notes.sep, 'continuationSeparator');
    assert.ok(g2.calls.some((c) => c[0] === 'rect' &&
      c[3] === Math.round(L.geom(0).textW) && c[2] >= y1));
    const t2 = g2.calls.filter((c) => c[0] === 'text' && c[3] > y1);
    assert.ok(t2.length && t2.every((c) => !c[1].includes('first') &&
      c[1] !== '1'));
  });
});

describe('Footnotes on the corpus\'s pages (optional files)', {
  skip: corpusFiles.length ? false : SKIP_CORPUS,
}, () => {
  it('page starts against Word\'s: no worse with the notes on the ' +
    'pages; every note shown once, whole', async () => {
    let withNotes = 0, scored = 0;
    const was = [0, 0], now = [0, 0], pages = [0, 0];
    for (const f of corpusFiles) {
      let doc;
      try {
        doc = await readDocx(readFileSync(f));
      } catch (e) {
        if (!(e instanceof DocxError)) throw e;
        continue;
      }
      const L = doL(doc), G = printGalley(L);
      if (!G.notes) continue;
      withNotes++;
      const old = galleyOf(L, hfHooks(L));
      const P0 = new Pages(old).finish(), P = new Pages(G).finish();
      pages[0] += P0.count;
      pages[1] += P.count;
      const seen = new Map();
      for (const pg of P.list) {
        for (const x of pg.notes ? pg.notes.pieces : []) {
          const was = seen.get(x.id) || {to: 0, s: pg.s};
          assert.equal(x.from, was.to, nameOf(f));
          seen.set(x.id, {to: x.to, s: was.s});
        }
      }
      for (const [id, {to, s}] of seen) {
        assert.equal(to, G.notes.note(id, s).lines.length, nameOf(f));
      }
      const ws = madeByWord(f) ? wordStarts(doc) : [];
      if (!ws.length) continue;
      scored++;
      const base = lineBase(L.items);
      const a = scoreStarts(ourStarts(P0, L.items, base),
        placesOf(old, base, ws));
      const b = scoreStarts(ourStarts(P, L.items, base),
        placesOf(G, base, ws));
      was[0] += a.matched;
      was[1] += a.total;
      now[0] += b.matched;
      now[1] += b.total;
    }
    console.log(`# footnotes on the pages: ${withNotes} files with ` +
      `notes, ${pages[0]} pages without them, ${pages[1]} with; ` +
      `${scored} with Word's page starts: ${was[0]} of ${was[1]} ` +
      `matched without the notes, ${now[0]} with them`);
    assert.ok(now[0] >= was[0]);
  });
});

describe('Footnotes: a note-free document pays nothing', () => {
  it('50,000 paragraphs, no notes: no note hook, no refs, no fill ' +
    'of NotePlace, no settings read; as fast as before', async () => {
    await loadStyles();
    const doc = mkDoc(Array.from({length: 50000}, (_, i) =>
      'paragraph ' + i));
    const L = doL(doc);
    const h0 = {...noteStats}, f0 = stats.fills;
    const G = printGalley(L);
    assert.equal(G.notes, undefined);
    const P = new Pages(G).finish();
    for (let k = 0; k < L.items.length; k++) {
      assert.equal(G.facts(k).refs, null);
    }
    assert.equal(notePass(L, P), null);
    assert.deepEqual({...noteStats}, h0);
    assert.equal(stats.fills, f0);
    const time = (mkG) => {
      let best = Infinity;
      for (let n = 0; n < 5; n++) {
        const g = mkG(), t0 = performance.now();
        new Pages(g).finish();
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    const was = time(() => galleyOf(L, hfHooks(L)));
    const now = time(() => printGalley(L));
    console.log(`# note-free, 50,000 paragraphs (${P.count} pages): ` +
      `${now.toFixed(1)} ms with the note hooks, ` +
      `${was.toFixed(1)} ms ` +
      'without');
    assert.ok(now < was * 1.5 + 2, `${now} ${was}`);
  });

  it('the restart settings are read once per document state',
    async () => {
    const doc = await noteDoc(bodyOf(20, {2: 1}), {1: noteP('n')});
    const L = doL(doc), P = paged(L), n0 = noteStats.paged;
    notePass(L, P);
    notePass(L, P);
    assert.equal(noteStats.paged - n0, 1);
    bump(doc);
    notePass(L, P);
    assert.equal(noteStats.paged - n0, 2);
  });
});
