// The page-start oracle helper (pagestarts.mjs): where Word recorded
// page starts in a file (w:lastRenderedPageBreak, page break before)
// and how many of them a list of our starts matches: scoreStarts,
// the one scoring rule of both oracles (P5.1, review P3 M5).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {wordStarts, matchStarts, lineBase, ourStarts, onLines,
  scoreStarts, causeOf, placesOf} from './pagestarts.mjs';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {docLayout} from './page-fixtures.mjs';

const LRPB = '<w:r><w:lastRenderedPageBreak/><w:t>x</w:t></w:r>';
const STYLES = stylesXml(
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Chapter">' +
  '<w:name w:val="Chapter"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:pageBreakBefore/></w:pPr></w:style>');
// a table the reader types (Opaque without tblPr and tblGrid)
const TBL = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  'w:w="2000"/></w:tblGrid><w:tr><w:tc>' + inner +
  '</w:tc></w:tr></w:tbl>';
const read = (body) => buildDocx({'word/document.xml':
  documentXml(body), 'word/styles.xml': STYLES}).then(readDocx);
const ids = (d) => d.sections[0].blocks.map((b) => b.id);

describe('wordStarts', () => {
  it('finds the starts of a three-page document', async () => {
    // page 2 starts mid-paragraph (after 'ab'), page 3 at a
    // paragraph with a page break before from its style, which
    // Word also marked: one start, not two
    const d = await read(p(r('one')) + p(r('ab') + LRPB) +
      p(LRPB + r('c'), '<w:pStyle w:val="Chapter"/>'));
    const [, b, c] = ids(d);
    assert.deepEqual(wordStarts(d), [{id: b, off: 2}, {id: c, off: 0}]);
  });
  it('counts a page break before that Word did not mark', async () => {
    const d = await read(p(r('one')) +
      p(r('two'), '<w:pageBreakBefore/>'));
    assert.deepEqual(wordStarts(d), [{id: ids(d)[1], off: 0}]);
  });
  it('ignores a page break before on the first paragraph, an ' +
    'explicit off, and one in a table cell', async () => {
    const d = await read(p(r('one'), '<w:pageBreakBefore/>') +
      p(r('two'), '<w:pStyle w:val="Chapter"/>' +
        '<w:pageBreakBefore w:val="0"/>') +
      TBL(p(r('c'), '<w:pageBreakBefore/>')));
    assert.deepEqual(wordStarts(d), []);
  });
  it('finds a mark inside a table cell', async () => {
    const d = await read(p(r('one')) + TBL(p(r('c') + LRPB)));
    assert.equal(d.sections[0].blocks[1].type, 'tbl');
    const cell = d.sections[0].blocks[1].rows[0].cells[0].blocks[0];
    assert.deepEqual(wordStarts(d), [{id: cell.id, off: 1}]);
  });
  it('gives nothing for a document Word did not paginate', async () => {
    assert.deepEqual(wordStarts(await read(p(r('a')) + p(r('b')))),
      []);
    assert.deepEqual(wordStarts({sections: []}), []);
    assert.deepEqual(wordStarts(null), []);
  });
});

describe('matchStarts', () => {
  const W = [{id: 1, off: 0, line: 40}, {id: 5, off: 3, line: 80},
    {id: 9, off: 0, line: 120}];
  it('matches by line within the tolerance, one to one', () => {
    const ours = [{id: 1, off: 0, line: 41}, {id: 4, off: 0, line: 78},
      {id: 9, off: 2, line: 120}];
    assert.deepEqual(matchStarts(ours, W), {matched: 2, total: 3});
    assert.deepEqual(matchStarts(ours, W, 2), {matched: 3, total: 3});
    assert.deepEqual(matchStarts(ours, W, 0), {matched: 1, total: 3});
    // one of ours matches one of Word's at most
    assert.deepEqual(matchStarts([{id: 1, off: 0, line: 40}],
      [{id: 1, off: 0, line: 40}, {id: 1, off: 1, line: 40}]),
    {matched: 1, total: 2});
  });
  it('without lines, matches the same position only', () => {
    const w = [{id: 1, off: 0}, {id: 5, off: 3}];
    assert.deepEqual(matchStarts([{id: 5, off: 3}, {id: 1, off: 1}], w),
      {matched: 1, total: 2});
  });
  it('handles empty lists', () => {
    assert.deepEqual(matchStarts([], W), {matched: 0, total: 3});
    assert.deepEqual(matchStarts(W, []), {matched: 0, total: 0});
  });
});

describe('ourStarts and onLines (P2.4)', () => {
  it('our page starts and Word\'s on galley lines', async () => {
    // a paragraph with a page break after 'ab' (page 2 from 'cd'),
    // a table, a paragraph with page break before (page 3)
    const {L, G, doc} = await docLayout(p(r('one')) +
      p(r('ab') + '<w:r><w:br w:type="page"/></w:r>' + r('cd')) +
      TBL(p(r('cell'))) + p(r('two'), '<w:pageBreakBefore/>'));
    const P = new Pages(G).finish();
    assert.equal(P.count, 3);
    const base = lineBase(L.items);
    assert.deepEqual(base, [0, 1, 3, 4]);
    const [, b, t, c] = L.items.map((x) => x.id);
    assert.deepEqual(ourStarts(P, L.items, base), [
      {id: b, off: L.items[1].lines[1].from, line: 2},
      {id: c, off: 0, line: 4}]);
    const cell = [...L.byId.values()].find((x) => x.kind === 'p' &&
      x.para.text === 'cell');
    assert.deepEqual(onLines(G, base, [{id: cell.id, off: 1},
      {id: c, off: 0}, {id: 'nope', off: 0}]), [
      {id: cell.id, off: 1, line: 3}, {id: c, off: 0, line: 4},
      {id: 'nope', off: 0}]);
    assert.ok(t);
    assert.equal(wordStarts(doc).length, 1);
  });
});

describe('scoreStarts: the one scoring rule (P5.1)', () => {
  const W = (line, cause) => ({line, cause});

  it('Word\'s starts on one galley line count once, with the ' +
    'first one\'s cause', () => {
    const s = scoreStarts([{line: 10}], [W(10, 'forced'),
      W(10, 'natural'), W(30, 'natural')]);
    assert.deepEqual(s, {matched: 1, total: 2, starts: 3,
      causes: {forced: [1, 1], natural: [0, 1]}, ours: 1,
      unmatched: 0});
  });

  it('each of ours matches one start (consuming, document order, ' +
    'within one line)', () => {
    const s = scoreStarts([{line: 11}], [W(10, 'natural'),
      W(12, 'forced')]);
    assert.deepEqual(s.causes, {natural: [1, 1], forced: [0, 1]});
    assert.equal(s.matched, 1);
    assert.equal(scoreStarts([{line: 12}], [W(10, 'natural')])
      .matched, 0);
  });

  it('a start not in the galley counts on its own, unmatched', () => {
    const s = scoreStarts([{line: 0}], [W(NaN, 'table/block'),
      W(NaN, 'table/block'), W(0, 'natural')]);
    assert.deepEqual(s, {matched: 1, total: 3, starts: 3,
      causes: {'table/block': [0, 2], natural: [1, 1]}, ours: 1,
      unmatched: 0});
  });

  it('the causes add up to the totals; empty lists', () => {
    const word = Array.from({length: 40}, (_, i) =>
      W(Math.floor(i / 3) * 5, ['natural', 'forced'][i % 2]));
    const ours = Array.from({length: 9}, (_, i) => ({line: i * 6}));
    const s = scoreStarts(ours, word);
    const sum = (j) => Object.values(s.causes)
      .reduce((a, c) => a + c[j], 0);
    assert.equal(sum(0), s.matched);
    assert.equal(sum(1), s.total);
    assert.equal(s.total, 14);
    assert.deepEqual(scoreStarts([], []), {matched: 0, total: 0,
      starts: 0, causes: {}, ours: 0, unmatched: 0});
  });

  it('our starts are counted, and those matching none (P10 fix M2: ' +
    'the score never counts against extra starts of ours)', () => {
    const s = scoreStarts([{line: 10}, {line: 20}, {line: 40},
      {line: 41}], [W(10, 'natural'), W(41, 'natural')]);
    assert.deepEqual([s.matched, s.ours, s.unmatched], [2, 4, 2]);
  });
});

describe('placesOf and causeOf (P5.1)', () => {
  it('a page break, page break before, a natural start, a cell; ' +
    'cells of one row on one line', async () => {
    const TR = (a, b) => '<w:tr><w:tc>' + p(r(a)) + '</w:tc><w:tc>' +
      p(r(b)) + '</w:tc></w:tr>';
    const {L, G} = await docLayout(p(r('one two three')) +
      p(r('ab') + '<w:r><w:br w:type="page"/></w:r>' + r('cd')) +
      '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol ' +
      'w:w="2000"/></w:tblGrid>' + TR('a1', 'b1') + TR('a2', 'b2') +
      '</w:tbl>' + p(r('two'), '<w:pageBreakBefore/>'));
    const base = lineBase(L.items);
    const byText = (t) => [...L.byId.values()].find((x) =>
      x.kind === 'p' && x.para.text === t);
    const [a, b] = L.items, d = L.items[3];
    const pos = [{id: a.id, off: 4}, {id: b.id, off: 3},
      {id: byText('a2').id, off: 0}, {id: byText('b2').id, off: 1},
      {id: d.id, off: 0}, {id: 'gone', off: 0}];
    const w = placesOf(G, base, pos);
    assert.deepEqual(w.map((x) => x.cause), ['natural', 'forced',
      'table/block', 'table/block', 'forced', 'table/block']);
    assert.equal(w[2].line, w[3].line, 'one row, one line');
    assert.equal(w[2].line, base[2] + 1);
    assert.ok(Number.isNaN(w[5].line));
    assert.equal(causeOf(G, null), 'table/block');
  });
});
