// Endnotes at the end of a section that is not the last (Batch E2):
// the galley's indices are then not L's after the run, and every
// module that reads pages by their cursors (the wrap pass, the
// column pass, floats, frames) must go through ./EndGalley's
// translations. Over a few seeds, a document whose endnotes are at
// the end of its first section (sectEnd) is laid out, wrapped and
// column-settled, and its BODY must come out as the same document's
// with the endnotes at the end (docEnd): no line under a float, no
// paragraph at another column's width, and, when the next section
// starts a page, every body item broken alike and on the same page
// but for the run's own pages. Cases: square-wrapped floats at
// alternate margins, floating tables, unequal and equal columns (a
// paragraph ./ColPass gives up on, its widths going back and forth,
// is let be as it is without notes), a
// drawing anchored on the run's page, two runs, footnotes placed at
// the section's end.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {M, al, off, anchorRun, overlaps, tblUnder, text, ftbl, rng,
  SECT} from './wrap-fixtures.mjs';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {URIS} from './pic-fixtures.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {bodyK, rootK, runsOf}
  from '../../tools/moreapps/!Letters/EndGalley';

import {placeOf} from '../../tools/moreapps/!Letters/PageFind';
import {lineOf} from '../../tools/moreapps/!Letters/PositionMap';

const {colPass} = await import('../../tools/moreapps/!Letters/ColPass');
await loadStyles();

const ROOT = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}"`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SEPS = (tag) => `<w:${tag} w:type="separator" w:id="-1">` +
  p('<w:r><w:separator/></w:r>') + `</w:${tag}>` +
  `<w:${tag} w:type="continuationSeparator" w:id="0">` +
  p('<w:r><w:continuationSeparator/></w:r>') + `</w:${tag}>`;
const UNEQUAL = '<w:cols w:num="2" w:space="720" w:equalWidth="0">' +
  '<w:col w:w="2640" w:space="720"/><w:col w:w="6000"/></w:cols>';
const EQUAL = '<w:cols w:num="2" w:space="720"/>';

/** A sectPr: Letter, 1 in margins, start type, more inside. */
const sect = (type, more = '') => SECT.replace('<w:sectPr>',
  '<w:sectPr>' + (type ? `<w:type w:val="${type}"/>` : ''))
  .replace('</w:sectPr>', more + '</w:sectPr>');

/** The document of a case: sections [{paras, more}] (more: inside
 *  the section's sectPr), the notes {en: {id: paras}, fn: ...}, the
 *  notes' position pos and the start type of the sections after the
 *  first. */
async function build(secs, notes, pos, type) {
  const enPr = `<w:endnotePr><w:pos w:val="${pos}"/></w:endnotePr>`;
  const fnPr = `<w:footnotePr><w:pos w:val="${pos}"/></w:footnotePr>`;
  const prs = enPr + (notes.fn ? fnPr : '');
  let body = '';
  secs.forEach((s, i) => {
    const last = i === secs.length - 1;
    const sp = sect(i ? type : null, s.more + prs);
    s.paras.forEach((x, j) => {
      body += j === s.paras.length - 1 && !last
        ? x.replace('</w:p>', '').replace(/^<w:p>/, '<w:p><w:pPr>' +
          sp + '</w:pPr>') + '</w:p>' : x;
    });
    if (last) body += sp;
  });
  const parts = {'word/document.xml': documentXml(body,
    {rootAttrs: ROOT})};
  const rels = [];
  for (const [kind, tag, key] of [['endnotes', 'endnote', 'en'],
    ['footnotes', 'footnote', 'fn']]) {
    if (!notes[key]) continue;
    let x = SEPS(tag);
    for (const [id, ps] of Object.entries(notes[key])) {
      x += `<w:${tag} w:id="${id}">${ps}</w:${tag}>`;
    }
    parts[`word/${kind}.xml`] = DECL + `<w:${kind} xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">${x}</w:${kind}>`;
    rels.push(['rIdN' + key, REL(kind), kind + '.xml']);
  }
  return M.readDocx(await buildDocx(parts, {docRels: rels}));
}

/** Laid out in Print layout, then the column and wrap passes run
 *  until none is due. */
function settled(doc, max = 400) {
  const m = tm();
  let L = new M.DocLayout(doc, m, null, {floats: true});
  L.layout(1000);
  let P = new M.Pages(M.printGalley(L)).finish(), n = 0;
  for (; n < max; n++) {
    const c = colPass(L, P);
    const w = c ? null : M.wrapPass(L, P);
    if (!c && !w) break;
    const N = new M.DocLayout(doc, m, L, c ? {colW: c} : {wrap: w});
    N.layout(1000);
    P = new M.Pages(M.printGalley(N), P).finish();
    L = N;
  }
  return {L, P, n};
}

/** The paragraphs ./ColPass gave up on (its records' left: a page
 *  whose widths go back and forth), as a set of id strings. */
function leftOf(L) {
  const cw = L.colW, left = new Set();
  for (const x of cw && cw.known ? cw.known.values() : []) {
    for (const id of x.left ? String(x.left).split(',') : []) {
      left.add(id);
    }
  }
  return left;
}

/** Body paragraphs that start in a column not at its width, but
 *  those ./ColPass gave up on (as without notes: the test ties how
 *  many to the docEnd control). */
function wrongWidths(L, P) {
  const left = leftOf(L);
  return widthsOff(P).filter((id) => !left.has(String(id)));
}

/** Body paragraphs that start in a column not at its width. */
function widthsOff(P) {
  const items = P.G.items, bad = [];
  for (const pg of P.list) {
    for (const c of pg.cols || []) {
      const a = c.start, b = c.end;
      const k0 = a.line || a.dy ? a.k + 1 : a.k;
      const k1 = Math.min(b.line || b.dy ? b.k + 1 : b.k, items.length);
      for (let k = k0; k < k1; k++) {
        const it = items[k];
        if (it.kind === 'p' && !it.en && it.w !== c.w) bad.push(it.id);
      }
    }
  }
  return bad;
}

/** Each body item: its section, page, width and lines. */
const bodyOf = (L, P) => L.items.map((it) => ({s: it.s,
  page: P.ofPos({id: it.id, off: 0}), w: it.w,
  lines: (it.lines || []).map((l) => [l.from, l.to,
    Math.round(l.x)].join(':')).join(' ')}));

const note = (n, rnd) => p('<w:r><w:endnoteRef/></w:r>' +
  r(' note')) + Array.from({length: n}, () =>
  p(r(text(1 + Math.floor(rnd() * 3))))).join('');
const fnote = (n, rnd) => p('<w:r><w:footnoteRef/></w:r>' +
  r(' fn')) + Array.from({length: n}, () =>
  p(r(text(1 + Math.floor(rnd() * 3))))).join('');
const emark = (id) => `<w:r><w:endnoteReference w:id="${id}"/></w:r>`;
const fmark = (id) => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`;

/** Paragraphs with floating pictures at alternate margins. */
const floats = (rnd, k, id0 = 1) => Array.from({length: k}, (_, i) =>
  p(anchorRun({id: id0 + i, ht: 80 + Math.floor(rnd() * 80), w: 200,
    h: ['margin', al(i % 2 ? 'right' : 'left')]}) +
    r(text(2 + Math.floor(rnd() * 2)))));
const plain = (rnd, k) => Array.from({length: k}, (_, i) =>
  p(r(i + ' ' + text(1 + Math.floor(rnd() * 4)))));

/** The cases: (rnd) -> {secs, notes}. */
const CASES = {
  'square-wrapped floats at alternate margins': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + emark(1)), p(r(text(2)))],
      more: ''}, {paras: floats(rnd, 8 + Math.floor(rnd() * 10)),
      more: ''}],
    notes: {en: {1: note(3 + Math.floor(rnd() * 10), rnd)}}}),
  'floating tables': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + emark(1))], more: ''},
      {paras: [...plain(rnd, 3), ftbl({horzAnchor: 'margin',
        vertAnchor: 'text', tblpXSpec: 'right'}, {n: 3}),
      p(r(text(14))), ...plain(rnd, 6), ftbl({horzAnchor: 'margin',
        vertAnchor: 'text', tblpXSpec: 'left'}, {n: 4}),
      p(r(text(20))), ...plain(rnd, 30)], more: ''}],
    notes: {en: {1: note(4 + Math.floor(rnd() * 12), rnd)}}}),
  'unequal columns': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + emark(1)), ...plain(rnd, 3)],
      more: ''}, {paras: plain(rnd, 60 + Math.floor(rnd() * 60)),
      more: UNEQUAL}],
    notes: {en: {1: note(3 + Math.floor(rnd() * 12), rnd)}}}),
  'equal columns': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + emark(1))], more: ''},
      {paras: plain(rnd, 60 + Math.floor(rnd() * 40)), more: EQUAL}],
    notes: {en: {1: note(3 + Math.floor(rnd() * 12), rnd)}}}),
  'a drawing anchored on the run\'s page': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + emark(1)), ...plain(rnd, 2),
      p(anchorRun({id: 1, ht: 140, w: 220, h: ['column', off(0)],
        v: ['paragraph', off(0)]}) + r(text(6)))], more: ''},
    {paras: floats(rnd, 6, 2), more: ''}],
    notes: {en: {1: note(2 + Math.floor(rnd() * 8), rnd)}}}),
  'two runs': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + emark(1))], more: ''},
      {paras: [p(r(text(2)) + emark(2)), ...floats(rnd, 5)], more: ''},
      {paras: floats(rnd, 6, 10), more: ''}],
    notes: {en: {1: note(2 + Math.floor(rnd() * 10), rnd),
      2: note(2 + Math.floor(rnd() * 10), rnd)}}}),
  'footnotes placed at the section\'s end': (rnd) => ({
    secs: [{paras: [p(r(text(3)) + fmark(1)), p(r(text(2)))],
      more: ''}, {paras: floats(rnd, 6 + Math.floor(rnd() * 8)),
      more: ''}],
    notes: {fn: {1: fnote(3 + Math.floor(rnd() * 10), rnd)}}}),
};

describe('EndGalley: the translations', () => {
  it('rootK and bodyK: inverse on the body, -1 on a run\'s items',
    () => {
      const runs = [{s: 0, at: 3, n: 4, after: 3},
        {s: 1, at: 10, n: 2, after: 6}];
      const body = [0, 1, 2, 3, 4, 5, 6, 7];
      const g = body.map((k) => rootK(runs, k));
      assert.deepEqual(g, [0, 1, 2, 7, 8, 9, 12, 13]);
      assert.deepEqual(g.map((k) => bodyK(runs, k)), body);
      for (const k of [3, 4, 5, 6, 10, 11]) {
        assert.equal(bodyK(runs, k), -1);
      }
      assert.equal(rootK([], 5), 5);
      assert.equal(bodyK([], 5), 5);
      assert.equal(rootK(runs, Infinity), Infinity);
      assert.deepEqual(runsOf({}), []);
    });
});

describe('PageFind placeOf after a run mid-document', () => {
  it('a position past line 0 of a paragraph after the run: its own ' +
    'line, at the galley index', async () => {
    const rnd = rng(5);
    const doc = await build([{paras: [p(r(text(3)) + emark(1))],
      more: ''}, {paras: [p(r('x')), p(r(text(12)))], more: ''}],
    {en: {1: note(4, rnd)}}, 'sectEnd', 'nextPage');
    const {L, P} = settled(doc);
    const G = P.G, runs = runsOf(G);
    assert.ok(runs.length === 1 && runs[0].n > 0, 'a run');
    const it = L.items.at(-1);
    assert.ok(it.lines.length >= 3, 'lines: ' + it.lines.length);
    const off = it.lines[2].from + 1;
    const k = rootK(runs, L.items.length - 1);
    assert.notEqual(k, L.items.length - 1, 'the galley index differs');
    assert.equal(G.items[k], it, 'the galley holds the item at k');
    const c = placeOf(G, {id: it.id, off});
    assert.deepEqual(c, {k, line: lineOf(it, off, 'down')});
    assert.equal(c.line, 2, 'not line 0');
  });
});

describe('A run of notes mid-document: the body as without it', () => {
  for (const [name, make] of Object.entries(CASES)) {
    for (const type of ['nextPage', 'continuous']) {
      it(`${name} (${type})`, async () => {
        for (const seed of [1, 2, 3]) {
          const spec = make(rng(seed * 7919 + name.length));
          const at = await build(spec.secs, spec.notes, 'sectEnd', type);
          const ctl = await build(spec.secs, spec.notes, 'docEnd', type);
          const a = settled(at), c = settled(ctl);
          const tag = `${name} ${type} seed ${seed}`;
          assert.ok(a.P.G.runs && a.P.G.runs.length >= 1 &&
            a.P.G.runs[0].after < a.L.items.length, `${tag}: mid run`);
          assert.ok(a.n < 400 && c.n < 400, `${tag}: settles`);
          assert.deepEqual(overlaps(a.L, a.P), [], `${tag}: overlaps`);
          assert.deepEqual(overlaps(c.L, c.P), []);
          assert.deepEqual(tblUnder(a.L, a.P), [], `${tag}: tables`);
          assert.deepEqual(wrongWidths(a.L, a.P), [], `${tag}: widths`);
          assert.deepEqual(wrongWidths(c.L, c.P), []);
          // what ColPass gives up on, against the control's: the same
          // when each section starts a page (the body is alike); in a
          // continuous section the run moves the body on its pages,
          // so another paragraph may be the one, but never more
          // than one besides the control's
          const la = leftOf(a.L), lc = leftOf(c.L);
          if (type !== 'nextPage') {
            assert.ok(la.size <= lc.size + 1 &&
              lc.size <= la.size + 1,
            `${tag}: given up on ${[...la]} / control ${[...lc]}`);
            continue;
          }
          assert.deepEqual([...la].sort(), [...lc].sort(),
            `${tag}: given up on, as the control`);
          // each section starts a page: the body alike, its pages
          // moved by the runs' own pages only
          const A = bodyOf(a.L, a.P), C = bodyOf(c.L, c.P);
          assert.equal(A.length, C.length);
          const d = new Map();
          A.forEach((x, k) => {
            const y = C[k];
            assert.equal(x.w, y.w, `${tag}: item ${k} width`);
            assert.equal(x.lines, y.lines, `${tag}: item ${k} lines`);
            if (!d.has(x.s)) d.set(x.s, x.page - y.page);
            assert.equal(x.page - y.page, d.get(x.s),
              `${tag}: item ${k} page`);
          });
          assert.equal(d.get(0), 0, 'before the run: the same pages');
          const extra = a.P.count - c.P.count;
          assert.ok([...d.values()].every((v) => v >= 0 && v <= extra +
            a.P.G.items.length), `${tag}: pages`);
        }
      });
    }
  }
});
