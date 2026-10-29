// Endnotes on the pages of Print layout (Batch E2): EndnoteLayout's
// runs (a separator, then each note as flowing paragraphs) joined to
// the galley after the text of the document (docEnd) or of each
// section (sectEnd), on real documents (the fake measurer, 1000 px):
// where they go, numbering, hostile notes, footnotes placed at the
// end, reuse, painting, cost.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {tm, rng} from './word-docs.mjs';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley, hfHooks}
  from '../../tools/moreapps/!Letters/PageHF';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {noteHooks} from '../../tools/moreapps/!Letters/NoteHooks';
import {planOf, items as endItems, endHooks}
  from '../../tools/moreapps/!Letters/EndnoteLayout';
import {numbers, numbersByPage}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {OBJ, emptyNotes} from '../../tools/moreapps/!Letters/Model';
import {bump} from '../../tools/moreapps/!Letters/DocVersion';
import {p, r} from './build-docx.mjs';
import {noteDoc, mark, noteP, emark, enoteP, words}
  from './note-fixtures.mjs';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {RULE_W} from '../../tools/moreapps/!Letters/NoteLayout';

const M = tm();                        // (one: layouts are reused)
const doL = (doc) => {
  const L = new DocLayout(doc, M);
  L.layout(1000);
  return L;
};
const paged = (L, prev) => new Pages(printGalley(L), prev).finish();
/** n paragraphs 'para i' (one line each); marks {i: id} footnotes,
 *  ems {i: id} endnotes; sects {i: sectPr inner} a section ends
 *  with paragraph i. */
function bodyOf(n, ems = {}, marks = {}, sects = {}) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const pPr = sects[i] !== undefined ? '<w:sectPr>' + sects[i] +
      '</w:sectPr>' : '';
    out += p(r('para ' + i) + (marks[i] !== undefined ? mark(marks[i])
      : '') + (ems[i] !== undefined ? emark(ems[i]) : ''), pPr);
  }
  return out;
}
const SECT_END = '<w:endnotePr><w:pos w:val="sectEnd"/></w:endnotePr>';
/** The endnote items of galley G: [k, item]. */
const ends = (G) => G.items.map((it, k) => [k, it])
  .filter(([, it]) => it.en);
/** The note ids of the runs' items in order (the separator: 'sep',
 *  each note once at its first item). */
function order(G) {
  const out = [];
  for (const [, it] of ends(G)) {
    const x = it.en;
    if (x.sep) out.push('sep:' + x.kind);
    else if (x.first) out.push(x.kind + ':' + x.id);
  }
  return out;
}
/** The page index showing galley item k (its first line). */
const pageOfK = (P, k) => P.list.findIndex((pg) => !pg.blank &&
  (pg.start.k < k || (pg.start.k === k && !pg.start.line &&
    !pg.start.dy)) && (pg.end.k > k || (pg.end.k === k &&
    (pg.end.line > 0 || pg.end.dy > 0))));
/** Every line of every endnote item, over the pages' frames:
 *  [k, l] in order, each line once (a cut line's continuation not
 *  counted again). */
function linesShown(P) {
  const out = [];
  for (const pg of P.list) {
    if (pg.blank) continue;
    for (const fr of pg.frames) {
      fr.frags.forEach((f, j) => {
        const k = fr.start.k + j, it = P.G.items[k];
        if (!it.en) return;
        if (!it.lines) {
          if (!(j === 0 && fr.start.dy)) out.push([k, 0]);
          return;
        }
        const cont = j === 0 && fr.start.dy > 0 ? 1 : 0;
        for (let l = f.l0 + cont; l < f.l1; l++) out.push([k, l]);
      });
    }
  }
  return out;
}
/** The pages as plain values (frames left out). */
const plain = (P) => P.list.map((pg) => JSON.parse(JSON.stringify(pg)));

describe('EndnoteLayout: what goes where', () => {
  it('planOf: the notes in their marks\' order, each once, at the ' +
    'document\'s end; orphans and missing notes left out', async () => {
    const doc = await noteDoc(bodyOf(8, {1: 3, 4: 1, 6: 3, 7: 9}), {},
      {endnotes: {1: enoteP('one'), 3: enoteP('three'),
        5: enoteP('orphan')}});
    const plan = planOf(doc);
    assert.deepEqual([...plan.keys()], [0]);
    assert.deepEqual(plan.get(0), {fn: [], en: [3, 1]});
    assert.ok(doc.notes.endnotes.has(5), 'the orphan is kept');
    assert.equal(planOf(doc), plan, 'memoised');
  });

  it('items(doc, s, opts): the separator, then each note\'s ' +
    'paragraphs as flowing items', async () => {
    const doc = await noteDoc(bodyOf(3, {0: 1, 2: 2}), {},
      {endnotes: {1: enoteP('one'), 2: enoteP(words(80))}});
    const its = endItems(doc, 0, {metrics: M, width: 600, y0: 100});
    assert.ok(its[0].en.sep, 'the separator first');
    assert.equal(its[0].en.kind, 'endnote');
    assert.ok(its[0].y >= 100);
    const ps = its.filter((x) => !x.en.sep);
    assert.deepEqual([...new Set(ps.map((x) => x.en.id))], [1, 2]);
    assert.ok(ps.every((x) => x.kind === 'p' && x.lines.length));
    assert.ok(ps[1].lines.length > 3, 'a long note: many lines');
    for (let k = 1; k < its.length; k++) {
      assert.ok(its[k].y >= its[k - 1].y + its[k - 1].h,
        'stacked in order');
    }
    assert.ok(its.every((x) => x.s === 0 && x.ci === -1));
    assert.ok(Object.isFrozen(its));
  });

  it('endnotes after the last text of the document', async () => {
    const doc = await noteDoc(bodyOf(6, {1: 2, 4: 1}), {},
      {endnotes: {1: enoteP('one'), 2: enoteP('two')}});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    const n = L.items.length;
    assert.ok(G.items.slice(0, n).every((it, k) => it === L.items[k]),
      'the body as it was');
    assert.deepEqual(order(G), ['sep:endnote', 'endnote:2',
      'endnote:1']);
    assert.ok(G.items.slice(n).every((it) => it.en));
    assert.equal(P.count, 1);
    const fr = P.at(0).frames[0];
    const last = fr.frags[n - 1], sep = fr.frags[n];
    assert.ok(sep.en && sep.y >= last.y + L.items[n - 1].h,
      'below the last line');
    assert.equal(fr.frags.length, G.items.length);
  });

  it('at the end of each section (sectEnd)', async () => {
    const doc = await noteDoc(bodyOf(10, {1: 1, 3: 2, 7: 3}, {},
      {4: SECT_END}) + '<w:sectPr>' + SECT_END + '</w:sectPr>', {},
    {endnotes: {1: enoteP('one'), 2: enoteP('two'),
      3: enoteP('three')}});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    assert.deepEqual(order(G), ['sep:endnote', 'endnote:1',
      'endnote:2', 'sep:endnote', 'endnote:3']);
    const s1 = G.items.findIndex((it) => !it.en && it.s === 1);
    assert.ok(G.items[s1 - 1].en, 'section 0\'s notes before 1\'s text');
    assert.equal(G.items[s1 - 1].s, 0);
    assert.ok(G.items[G.items.length - 1].en);
    assert.ok(G.items.filter((it) => !it.en)
      .every((it, k) => it === L.items[k]), 'the body in its order');
    // a nextPage break: section 1 starts its own page
    assert.equal(P.count, 2);
    assert.equal(P.at(1).start.k, s1);
  });

  it('with a section break following: continuous, the next ' +
    'section\'s text goes on below the notes', async () => {
    const doc = await noteDoc(bodyOf(10, {1: 1, 7: 2}, {},
      {4: SECT_END}) + '<w:sectPr><w:type w:val="continuous"/>' +
      SECT_END + '</w:sectPr>', {},
    {endnotes: {1: enoteP('one ' + words(30)), 2: enoteP('two')}});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    assert.equal(P.count, 1);
    const fr = P.at(0).frames[0];
    const s1 = G.items.findIndex((it) => !it.en && it.s === 1);
    const before = fr.frags[s1 - 1], at = fr.frags[s1];
    const e = G.items[s1 - 1];
    assert.ok(at.y >= before.y + e.h, `${at.y} ${before.y} ${e.h}`);
    assert.ok(at.y - (before.y + e.h) < 40, 'right below them');
    // every frag below the one before it
    for (let j = 1; j < fr.frags.length; j++) {
      assert.ok(fr.frags[j].y > fr.frags[j - 1].y);
    }
    // the same pages as a fresh pagination after a reuse
    const L2 = new DocLayout(doc, M, L);
    L2.layout(1000);
    assert.deepEqual(plain(paged(L2, P)), plain(P));
  });

  it('a continuous section after a run fills the page to its ' +
    'bottom, then goes on; reused as fresh after edits', async () => {
    const doc = await noteDoc(bodyOf(70, {1: 1, 3: 2, 25: 3}, {},
      {4: SECT_END}) + '<w:sectPr><w:type w:val="continuous"/>' +
      SECT_END + '</w:sectPr>', {}, {endnotes: {1: enoteP('one ' +
        words(60)), 2: enoteP('two'), 3: enoteP('three')}});
    let L = doL(doc), P = paged(L);
    const G = printGalley(L);
    assert.ok(P.count >= 2);
    const pg = P.at(0), fr = pg.frames[0];
    let bottom = 0;
    fr.frags.forEach((f, j) => {
      const it = G.items[fr.start.k + j];
      const h = it.lines ? it.lines[f.l1 - 1].y + it.lines[f.l1 - 1].h
        : it.h;
      bottom = Math.max(bottom, f.y + h);
    });
    assert.ok(bottom <= pg.bodyTop + pg.frameH + 1e-6, 'in the frame');
    assert.ok(bottom > pg.bodyTop + pg.frameH - 40, `full: ${bottom}`);
    // a note of section 0 edited, then a paragraph of section 1
    const n = doc.notes.endnotes.get(2), b = n.blocks[0];
    const more = ' ' + words(40);
    doc.notes = {...doc.notes, endnotes: new Map(doc.notes.endnotes)
      .set(2, {...n, blocks: [{...b, text: b.text + more,
        runs: b.runs.map((x, k, a) => k === a.length - 1
          ? {...x, end: x.end + more.length} : x)}]})};
    bump(doc);
    let L2 = new DocLayout(doc, M, L);
    L2.layout(1000);
    let Q = paged(L2, P);
    assert.deepEqual(plain(Q), plain(paged(doL(doc))));
    const s1 = doc.sections[1], q = s1.blocks[10];
    doc.sections = [doc.sections[0], {...s1, blocks: [
      ...s1.blocks.slice(0, 10), {...q, text: q.text + more,
        runs: q.runs.map((x, k, a) => k === a.length - 1
          ? {...x, end: x.end + more.length} : x)},
      ...s1.blocks.slice(11)]}];
    bump(doc);
    L = L2;
    P = Q;
    L2 = new DocLayout(doc, M, L);
    L2.layout(1000);
    Q = paged(L2, P);
    assert.deepEqual(plain(Q), plain(paged(doL(doc))));
  });

  it('on a new page when the last page is full', async () => {
    // the most paragraphs that still fit on one page
    let n = 20;
    const one = async (k) => paged(doL(await noteDoc(bodyOf(k))));
    while ((await one(n + 1)).count === 1) n++;
    const doc = await noteDoc(bodyOf(n, {[n - 1]: 1}), {},
      {endnotes: {1: enoteP('one')}});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    assert.equal(P.count, 2);
    assert.equal(P.at(1).start.k, L.items.length, 'the separator ' +
      'starts the next page');
    assert.ok(G.items[P.at(1).start.k].en.sep);
    assert.ok(P.done);
  });

  it('an endnote longer than a page flows on over the pages, ' +
    'every line once', async () => {
    const doc = await noteDoc(bodyOf(5, {2: 1, 3: 2}), {},
      {endnotes: {1: enoteP('long ' + words(3000)),
        2: enoteP('after')}});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    assert.ok(P.count >= 3, `${P.count}`);
    const shown = linesShown(P);
    const want = ends(G).flatMap(([k, it]) => it.lines
      ? it.lines.map((_, l) => [k, l]) : [[k, 0]]);
    assert.deepEqual(shown, want);
    assert.ok(P.list.slice(1).every((pg) => G.items[pg.start.k].en));
  });

  it('a note without a mark is not shown but kept; a mark with a ' +
    'missing note shows [?] and has no endnote', async () => {
    const doc = await noteDoc(bodyOf(4, {1: 1, 2: 7}), {},
      {endnotes: {1: enoteP('one'), 5: enoteP('orphan')}});
    const L = doL(doc), G = printGalley(L);
    assert.deepEqual(order(G), ['sep:endnote', 'endnote:1']);
    assert.ok(doc.notes.endnotes.has(5));
    const q = L.items[2].block, off = q.text.indexOf(OBJ);
    assert.equal(L.fieldText(q, off).text, '[?]');
    // only missing ones: no run at all, the galley the body's
    const bad = await noteDoc(bodyOf(4, {1: 7}), {},
      {endnotes: {5: enoteP('orphan')}});
    const B = doL(bad), GB = printGalley(B);
    assert.equal(GB.items, B.items);
  });
});

describe('Endnotes: numbering', () => {
  it('endnotes numbered independently of footnotes; their own ' +
    'mark shows the number', async () => {
    const doc = await noteDoc(bodyOf(6, {1: 4, 3: 8, 5: 9}, {2: 1,
      4: 2}), {1: noteP('f1'), 2: noteP('f2')},
    {endnotes: {4: enoteP('e4'), 8: enoteP('e8'), 9: enoteP('e9')}});
    const nums = numbers(doc);
    assert.deepEqual([...nums.endnotes], [[4, '1'], [8, '2'],
      [9, '3']]);
    assert.deepEqual([...nums.footnotes], [[1, '1'], [2, '2']]);
    const L = doL(doc), G = printGalley(L);
    const first = ends(G).find(([, it]) => it.en.id === 8)[1];
    const lay = first.en.lay, q = lay.L.items[0].block;
    assert.equal(lay.L.fieldText(q, q.text.indexOf(OBJ)).text, '2');
  });

  it('restart per section numbering', async () => {
    const pr = '<w:endnotePr><w:pos w:val="sectEnd"/>' +
      '<w:numRestart w:val="eachSect"/></w:endnotePr>';
    const doc = await noteDoc(bodyOf(8, {1: 1, 2: 2, 6: 3}, {},
      {3: pr}) + '<w:sectPr>' + pr + '</w:sectPr>', {},
    {endnotes: {1: enoteP('a'), 2: enoteP('b'), 3: enoteP('c')}});
    assert.deepEqual([...numbers(doc).endnotes], [[1, '1'], [2, '2'],
      [3, '1']]);
    const G = printGalley(doL(doc));
    const shows = ends(G).filter(([, it]) => it.en.first)
      .map(([, it]) => {
        const q = it.en.lay.L.items[0].block;
        return it.en.lay.L.fieldText(q, q.text.indexOf(OBJ)).text;
      });
    assert.deepEqual(shows, ['1', '2', '1']);
  });

  it('numRestart eachPage is continuous for endnotes (Word offers ' +
    'it for footnotes only)', async () => {
    const doc = await noteDoc(bodyOf(120, {1: 1, 100: 2}), {},
      {endnotes: {1: enoteP('a'), 2: enoteP('b')},
        settings: '<w:endnotePr><w:numRestart w:val="eachPage"/>' +
          '</w:endnotePr>'});
    const by = numbersByPage(doc, (x) => x.pid);   // (each its own)
    assert.deepEqual([...by.endnotes], [[1, '1'], [2, '2']]);
  });
});

describe('Footnotes placed at the end (pos sectEnd / docEnd)', () => {
  it('footnotes with pos docEnd flow after the text, under the ' +
    'footnote separator, before the endnotes; none at the foot',
  async () => {
    const doc = await noteDoc(bodyOf(6, {3: 1}, {1: 1, 4: 2}),
      {1: noteP('f1'), 2: noteP('f2')},
      {endnotes: {1: enoteP('e1')}, settings: '<w:footnotePr>' +
        '<w:pos w:val="docEnd"/></w:footnotePr>'});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    assert.deepEqual(order(G), ['sep:footnote', 'footnote:1',
      'footnote:2', 'sep:endnote', 'endnote:1']);
    assert.ok(P.list.every((pg) => !pg.notes ||
      !pg.notes.pieces.length), 'no foot');
  });

  it('footnotes with pos sectEnd at the end of their section',
    async () => {
      const fp = '<w:footnotePr><w:pos w:val="sectEnd"/></w:footnotePr>';
      const doc = await noteDoc(bodyOf(6, {}, {1: 1, 4: 2},
        {2: fp}) + '<w:sectPr>' + fp + '</w:sectPr>',
      {1: noteP('f1'), 2: noteP('f2')});
      const L = doL(doc), G = printGalley(L);
      assert.deepEqual(order(G), ['sep:footnote', 'footnote:1',
        'sep:footnote', 'footnote:2']);
      const s1 = G.items.findIndex((it) => !it.en && it.s === 1);
      assert.equal(G.items[s1 - 1].en.id, 1);
      const P = paged(L);
      assert.ok(P.list.every((pg) => !pg.notes ||
        !pg.notes.pieces.length), 'no footnote at a page foot');
    });

  it('footnotes AND endnotes; a footnote carried over a page that ' +
    'also holds the first endnote lines', async () => {
    let n = 20;
    const one = async (k) => paged(doL(await noteDoc(bodyOf(k))));
    while ((await one(n + 1)).count === 1) n++;
    // the long footnote's mark on the last lines: the rest of it
    // goes on at the foot of page 2, where the endnotes start
    const doc = await noteDoc(bodyOf(n - 3, {1: 1}, {[n - 5]: 1}),
      {1: noteP('fn ' + words(400))},
      {endnotes: {1: enoteP('end ' + words(20))}});
    const L = doL(doc), G = printGalley(L), P = paged(L);
    const k0 = L.items.length;
    const i = pageOfK(P, k0);
    assert.ok(i >= 0);
    const ft = P.list.flatMap((pg) => pg.notes ? pg.notes.pieces : []);
    const lay = G.notes.note(1, 0);
    let at = 0;
    for (const pc of ft) {
      assert.equal(pc.from, at, 'each footnote line once, in order');
      at = pc.to;
    }
    assert.equal(at, lay.lines.length);
    const carried = P.list.findIndex((pg) => pg.notes &&
      pg.notes.pieces.some((x) => x.from > 0));
    assert.ok(carried >= 1, 'the footnote is cut');
    assert.ok(P.list.some((pg, j) => j >= carried && pg.notes &&
      pg.notes.pieces.length && pg.end.k > k0 && pg.start.k <= k0 + 1),
    'a page with the carried footnote and endnote lines');
    assert.deepEqual(linesShown(P), ends(G).flatMap(([k, it]) =>
      it.lines ? it.lines.map((_, l) => [k, l]) : [[k, 0]]));
  });
});

describe('Endnotes: no endnotes, reuse, cost, bounds', () => {
  it('a document with no endnotes paginates exactly as before',
    async () => {
      const docs = [await noteDoc(bodyOf(130, {}, {3: 1}),
        {1: noteP('f')}), await noteDoc(bodyOf(130), {}, {endnotes: {}}),
      await noteDoc(bodyOf(130, {2: 7}), {}, {endnotes: {}})];
      for (const doc of docs) {
        const L = doL(doc);
        assert.deepEqual(endHooks(L), {});
        const G = printGalley(L);
        assert.equal(G.items, L.items, 'the body\'s own array');
        assert.equal(G.runs, undefined);
        const before = new Pages(galleyOf(L, {...hfHooks(L),
          ...noteHooks(L)})).finish();
        assert.deepEqual(plain(paged(L)), plain(before));
      }
    });

  it('reuse: editing an endnote re-lays out from there', async () => {
    const ems = {}, notes = {};
    for (let i = 3; i < 400; i += 7) {
      ems[i] = i;
      notes[i] = enoteP('note ' + i + ' ' + words(i % 3 ? 20 : 120));
    }
    const doc = await noteDoc(bodyOf(400, ems), {}, {endnotes: notes});
    let L = doL(doc), P = paged(L);
    const k0 = L.items.length;
    const first = pageOfK(P, k0);
    assert.ok(P.count - first > 4, `${P.count} ${first}`);
    const firstOf = (G, id) => G.items.findIndex((it) => it.en &&
      it.en.id === id && it.en.first);
    for (const [id, more, grows] of [[290, 'x'], [10, 'y'],
      [290, ' ' + words(200), true], [3, ' ' + words(300), true]]) {
      const G0 = printGalley(L);
      const at = pageOfK(P, firstOf(G0, id));
      const n = doc.notes.endnotes.get(id), b = n.blocks[0];
      const blocks = [{...b, text: b.text + more,
        runs: b.runs.map((x, k, a) => k === a.length - 1
          ? {...x, end: x.end + more.length} : x)}];
      doc.notes = {...doc.notes, endnotes: new Map(doc.notes
        .endnotes).set(id, {...n, blocks})};
      bump(doc);
      const L2 = new DocLayout(doc, M, L);
      L2.layout(1000);
      const Q = paged(L2, P);
      assert.deepEqual(plain(Q), plain(paged(doL(doc))), `${id}`);
      assert.ok(Q.kept >= at, `${id}: kept ${Q.kept} of ${at}`);
      assert.ok(Q.list.slice(0, at).every((pg, i) => pg === P.list[i]));
      if (!grows) {
        assert.ok(Q.count - Q.kept <= 2, `${id}: ${Q.count - Q.kept}`);
      }
      L = L2;
      P = Q;
    }
    // a body edit before the notes: the pages after it as fresh
    const s0 = doc.sections[0], b = s0.blocks[1];
    doc.sections = [{...s0, blocks: [s0.blocks[0], {...b,
      text: b.text + ' ' + words(30), runs: b.runs.map((x, k, a) =>
        k === a.length - 1 ? {...x, end: x.end + 6 * 30} : x)},
    ...s0.blocks.slice(2)]}];
    bump(doc);
    const L3 = new DocLayout(doc, M, L);
    L3.layout(1000);
    assert.deepEqual(plain(paged(L3, P)), plain(paged(doL(doc))));
  });

  it('reuse equals a fresh pagination after random edits (random ' +
    'documents: runs at section ends and at the end)', async () => {
    /** Block b with more words, or (cut) its last words dropped. */
    const grown = (b, more, cut) => {
      const text = cut ? b.text.slice(0, Math.max(1,
        b.text.length - cut)) : b.text + more;
      const d = text.length - b.text.length;
      return {...b, text, runs: b.runs.map((x, k, a) =>
        k === a.length - 1 ? {...x, end: Math.max(x.start,
          x.end + d)} : x)};
    };
    let mid = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rnd = rng(seed * 101);
      const pick = (n) => Math.floor(rnd() * n);
      const ems = {}, fms = {}, sects = {}, ens = {}, fns = {};
      const n = 60 + pick(80);
      let id = 1;
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.15) {
          ems[i] = id;
          ens[id] = enoteP('e' + id + ' ' + words(2 + pick(60)));
          id++;
        }
        if (rnd() < 0.05) {
          fms[i] = id;
          fns[id] = noteP('f' + id + ' ' + words(2 + pick(30)));
          id++;
        }
        if (i > 5 && i < n - 5 && rnd() < 0.04) {
          sects[i] = (rnd() < 0.6 ? SECT_END : '') + (rnd() < 0.5
            ? '<w:type w:val="continuous"/>' : '');
        }
      }
      const doc = await noteDoc(bodyOf(n, ems, fms, sects) +
        '<w:sectPr>' + (rnd() < 0.5 ? SECT_END : '') + '</w:sectPr>',
      fns, {endnotes: ens});
      let L = doL(doc), P = paged(L);
      const rs = P.G.runs || [];
      if (rs.some((x) => x.after < L.items.length)) mid++;
      for (let e = 0; e < 5; e++) {
        const what = pick(3), cut = rnd() < 0.4 ? 1 + pick(40) : 0;
        const more = ' ' + words(1 + pick(50));
        if (what < 2) {                // (an endnote or a footnote)
          const key = what ? 'footnotes' : 'endnotes';
          const ids = [...doc.notes[key].keys()].filter((k) => k > 0);
          if (!ids.length) continue;
          const k = ids[pick(ids.length)], x = doc.notes[key].get(k);
          doc.notes = {...doc.notes, [key]: new Map(doc.notes[key])
            .set(k, {...x, blocks: [grown(x.blocks[0], more, cut),
              ...x.blocks.slice(1)]})};
        } else {                       // (a body paragraph)
          const s = pick(doc.sections.length), sec = doc.sections[s];
          const j = pick(sec.blocks.length);
          const bs = [...sec.blocks];
          bs[j] = grown(bs[j], more, cut);
          doc.sections = doc.sections.map((x, t) => t === s
            ? {...x, blocks: bs} : x);
        }
        bump(doc);
        const L2 = new DocLayout(doc, M, L);
        L2.layout(1000);
        const Q = paged(L2, P);
        assert.deepEqual(plain(Q), plain(paged(doL(doc))),
          `seed ${seed} edit ${e}`);
        L = L2;
        P = Q;
      }
    }
    assert.ok(mid >= 2, `runs mid-document in ${mid} documents`);
  });

  it('10,000 endnotes paginate within a load-robust ratio',
    async () => {
      const N = 10000, ems = {}, notes = {};
      for (let i = 0; i < N; i++) {
        ems[i] = i + 1;
        notes[i + 1] = enoteP('note ' + (i + 1));
      }
      const doc = await noteDoc(bodyOf(N, ems), {}, {endnotes: notes});
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
      const a = time(doc), b = time(none);
      assert.ok(first.count > b.P.count);
      const ratio = a.best / b.best;
      console.log(`# 10,000 endnotes: ${a.best.toFixed(1)} ms against ` +
        `${b.best.toFixed(1)} ms (ratio ${ratio.toFixed(2)}); first ` +
        `${cold.toFixed(0)} ms`);
      assert.ok(ratio < 3, `ratio ${ratio}`);
      if (process.env.WORD_PERF) assert.ok(cold < 1500, `${cold} ms`);
    });

  it('bounded: pathological endnote sizes terminate, every line ' +
    'shown once', async () => {
    const big = 'x'.repeat(4000);
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>' +
      Array.from({length: 120}, (_, i) => '<w:tr><w:tc>' +
        p(r('row ' + i)) + '</w:tc></w:tr>').join('') + '</w:tbl>';
    const notes = {1: enoteP(''), 2: enoteP(big),
      3: enoteP('t') + tbl, 4: p(''), 5: enoteP(words(5000, 1)),
      6: '', 7: enoteP('a') + p(r('b'), '<w:pageBreakBefore/>')};
    const ems = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7};
    for (const pr of ['', '<w:pgSz w:w="2000" w:h="1500"/>' +
      '<w:pgMar w:top="700" w:bottom="700" w:left="200" ' +
      'w:right="200"/>']) {
      const doc = await noteDoc(bodyOf(8, ems) + '<w:sectPr>' + pr +
        '</w:sectPr>', {}, {endnotes: notes});
      const L = doL(doc), G = printGalley(L);
      const P = new Pages(G);
      let guard = 0;
      while (P.more()) assert.ok(++guard < 20000, 'terminates');
      assert.ok(P.done);
      assert.deepEqual(linesShown(P), ends(G).flatMap(([k, it]) =>
        it.lines ? it.lines.map((_, l) => [k, l]) : [[k, 0]]));
    }
  });
});

describe('Endnotes painted on their pages', () => {
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
      };
    }, set: () => true});
  }

  it('the separator rule, then each note with its number; a click ' +
    'there is the body\'s', async () => {
    const doc = await noteDoc(bodyOf(5, {1: 1}), {},
      {endnotes: {1: enoteP('endnote text')}});
    const L = doL(doc), P = paged(L);
    L.place = PlacePrint(L, P);
    L.layout(1000);
    const g = rec();
    paintPage(P, 0, g, {place: L.place});
    const fr = P.at(0).frames[0], n = L.items.length;
    const sy = Math.round(fr.frags[n].y);
    const rule = g.calls.find((c) => c[0] === 'rect' &&
      c[3] === RULE_W && c[4] === 1);
    assert.ok(rule && rule[2] >= sy, 'the rule');
    const ts = g.calls.filter((c) => c[0] === 'text' && c[3] > sy);
    assert.equal(ts[0][1], '1', 'its own mark shows its number');
    assert.ok(ts.some((c) => c[1].includes('endnote')), 'the note');
    // the body's fragments only, for the caret and hits
    assert.ok(L.place.pageFrags(0).every((f) => L.byId.get(f.it.id) ===
      f.it));
    const sr = L.place.sheet.rect(P.at(0));
    const hit = L.hitTest(sr.x + 120, sr.y + sy + 20);
    assert.ok(hit && hit.pos && L.byId.has(hit.pos.id));
  });
});
