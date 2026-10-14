// Keep rules at page ends (Batch D P2.2, D6): widow/orphan control,
// keep lines together, keep with next (chains, bounded), tables kept
// with the next block (PG7), and their resolution through styles.
// Fake galleys (page-fixtures galley: frame 100 px unless said, the
// first item at galley y 24) and real documents (docLayout).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {linesHere, chainStart, keepTable, keepOf}
  from '../../tools/moreapps/!Letters/PageKeep';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galley, docLayout} from './page-fixtures.mjs';
import {p, r, stylesXml} from './build-docx.mjs';

const pagesOf = (spec) => new Pages(galley(spec)).finish();
const tens = (n) => Array(n).fill(10);
const end0 = (spec) => pagesOf(spec).at(0).end;

describe('PageKeep: widow and orphan control', () => {
  it('a 5-line paragraph with room for 4: 3 placed (widow)', () => {
    assert.deepEqual(end0({items: [60, {lines: tens(5)}]}),
      {k: 1, line: 3});
  });

  it('room for 1: none placed (orphan)', () => {
    assert.deepEqual(end0({items: [90, {lines: tens(5)}]}),
      {k: 1, line: 0});
  });

  it('a 2-line paragraph with room for 1 moves whole', () => {
    assert.deepEqual(end0({items: [90, {lines: tens(2)}]}),
      {k: 1, line: 0});
  });

  it('a 3-line paragraph with room for 2 moves whole', () => {
    assert.deepEqual(end0({items: [80, {lines: tens(3)}]}),
      {k: 1, line: 0});
  });

  it('widowControl off: 4 and 1', () => {
    assert.deepEqual(end0({items: [60, {lines: tens(5),
      widow: false}]}), {k: 1, line: 4});
    assert.deepEqual(end0({items: [90, {lines: tens(5),
      widow: false}]}), {k: 1, line: 1});
  });

  it('a split leaving 2 and 2 or more is kept as it is', () => {
    assert.deepEqual(end0({items: [70, {lines: tens(5)}]}),
      {k: 1, line: 3});
    assert.deepEqual(end0({items: [80, {lines: tens(5)}]}),
      {k: 1, line: 2});
  });

  it('the rest of a paragraph continued from the page before', () => {
    // 12 lines from the top: 10 fit, 2 left; the 12th must not be
    // alone; page 2 holds the last 2
    const P = pagesOf({items: [{lines: tens(11)}, 10]});
    assert.deepEqual(P.at(0).end, {k: 0, line: 9});
    assert.deepEqual(P.at(1).start, {k: 0, line: 9});
  });

  it('never moves the first line of a page: a 1-line frame', () => {
    // (MIN_FRAME 48: lines of 30 px, one a frame)
    const P = pagesOf({frame: 48, items: [{lines: [30, 30, 30]}]});
    assert.equal(P.count, 3);
    assert.deepEqual(P.at(0).end, {k: 0, line: 1});
  });

  it('linesHere directly', () => {
    const it = (n, o = {}) => ({from: 0, count: n, widow: true, ...o});
    assert.equal(linesHere(it(5), 4, 9), 3);
    assert.equal(linesHere(it(5), 1, 9), 0);
    assert.equal(linesHere(it(2), 1, 9), 0);
    assert.equal(linesHere(it(3), 2, 9), 0);
    assert.equal(linesHere(it(4), 2, 9), 2);
    assert.equal(linesHere(it(5, {widow: false}), 4, 9), 4);
    assert.equal(linesHere(it(5), 5, 9), 5);
    assert.equal(linesHere(it(5, {from: 3}), 1, 9), 0);
    assert.equal(linesHere(it(6, {from: 2}), 1, 9), 1);
    assert.equal(linesHere(it(5), 0, 9), 0);
    assert.equal(linesHere(it(5, {keepLines: true}), 4, 9), 0);
    assert.equal(linesHere(it(12, {keepLines: true}), 4, 9), 4);
    assert.equal(linesHere(it(10, {keepLines: true}), 9, 9), 8);
  });
});

describe('PageKeep: keep lines together', () => {
  it('moves the paragraph unless it is taller than a frame', () => {
    assert.deepEqual(end0({items: [60, {lines: tens(5),
      keepLines: true}]}), {k: 1, line: 0});
    const P = pagesOf({items: [60, {lines: tens(12),
      keepLines: true}]});
    assert.deepEqual(P.at(0).end, {k: 1, line: 4});
  });

  it('with widow control off too', () => {
    assert.deepEqual(end0({items: [90, {lines: tens(5),
      keepLines: true, widow: false}]}), {k: 1, line: 0});
  });
});

describe('PageKeep: keep with next', () => {
  it('a heading moves with the first line of its body', () => {
    const P = pagesOf({items: [80, {lines: [10], keepNext: true},
      {lines: tens(5)}]});
    assert.deepEqual(P.at(0).end, {k: 1, line: 0});
    assert.deepEqual(P.at(1).start, {k: 1, line: 0});
  });

  it('a heading stays when two lines of the body fit', () => {
    assert.deepEqual(end0({items: [70, {lines: [10], keepNext: true},
      {lines: tens(5)}]}), {k: 2, line: 2});
  });

  it('a heading before a whole item that does not fit', () => {
    assert.deepEqual(end0({items: [80, {lines: [10], keepNext: true},
      {kind: 'box', h: 30}]}), {k: 1, line: 0});
  });

  it('a chain of 3 headings moves together', () => {
    const h = {lines: [10], keepNext: true};
    assert.deepEqual(end0({items: [10, 50, h, h, h,
      {lines: tens(5)}]}), {k: 2, line: 0});
  });

  it('a chain stops at an item without keepNext', () => {
    const h = {lines: [10], keepNext: true};
    assert.deepEqual(end0({items: [50, 20, h, h, {lines: tens(5)}]}),
      {k: 2, line: 0});
    assert.deepEqual(end0({items: [50, 20, 10, h, {lines: tens(5)}]}),
      {k: 3, line: 0});
  });

  it('a chain holding the page top is ignored (no loop)', () => {
    const h = {lines: [10], keepNext: true};
    const P = pagesOf({items: [h, h, h, h, h, h, h, h, h,
      {lines: tens(5)}]});
    assert.deepEqual(P.at(0).end, {k: 9, line: 0});
    assert.equal(P.count, 2);
  });

  it('200 keepNext paragraphs over 3 frames: break at the frame ' +
    'bottom', () => {
    const items = Array.from({length: 200},
      () => ({lines: [15], keepNext: true}));
    const P = pagesOf({frame: 1005, items});
    assert.equal(P.count, 3);
    assert.deepEqual(P.at(1).start, {k: 67, line: 0});
    assert.deepEqual(P.at(2).start, {k: 134, line: 0});
  });

  it('chainStart is bounded: one frame of items + 1 visits', () => {
    const items = Array.from({length: 200},
      () => ({lines: [15], keepNext: true}));
    const G0 = galley({frame: 1000, items});
    let visits = 0;
    const G = {...G0, facts: (k) => {
      visits++;
      return G0.items[k];
    }};
    assert.equal(chainStart(G, 150, 1000), 150);
    assert.ok(visits <= Math.floor(1000 / 15) + 1, visits + ' visits');
    visits = 0;
    assert.equal(chainStart(G, 150, 1000, 140), 150);
    assert.ok(visits <= 10, visits + ' visits');
    const G2 = galley({items: [10, 10, {lines: [10], keepNext: true},
      {lines: [10], keepNext: true}, 10]});
    assert.equal(chainStart(G2, 4, 100), 2);
    assert.equal(chainStart(G2, 4, 100, 2), 4);
    assert.equal(chainStart(G2, 4, 15), 4);
    assert.equal(chainStart(G2, 2, 100), 2);
  });

  it('a keepNext table is kept with the next block', () => {
    assert.deepEqual(end0({items: [60, {kind: 'tbl', h: 30,
      keepNext: true}, {lines: tens(5)}]}), {k: 1, line: 0});
    assert.deepEqual(end0({items: [60, {kind: 'tbl', h: 30},
      {lines: tens(5)}]}), {k: 2, line: 0});
  });

  it('never zero progress (random galleys with keep flags)', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) /
      2147483647);
    for (let t = 0; t < 200; t++) {
      const items = [];
      const n = 1 + Math.floor(rand() * 40);
      for (let k = 0; k < n; k++) {
        const nl = 1 + Math.floor(rand() * 8);
        const o = rand() < 0.2 ? {kind: rand() < 0.5 ? 'box' : 'tbl',
          h: Math.floor(rand() * 200)} : {lines: Array.from(
          {length: nl}, () => 1 + Math.floor(rand() * 40)),
        before: Math.floor(rand() * 10)};
        o.keepNext = rand() < 0.5;
        o.keepLines = rand() < 0.3;
        o.widow = rand() < 0.8;
        if (rand() < 0.05) o.breakBefore = true;
        if (rand() < 0.05 && o.lines) {
          o.brPage = [Math.floor(rand() * nl)];
        }
        if (rand() < 0.05) o.sectStart = rand() < 0.5 ? 'continuous'
          : 'oddPage';
        items.push(o);
      }
      const frame = 1 + Math.floor(rand() * 150);
      const P = pagesOf({items, frame});
      for (let i = 0; i < P.count; i++) {
        const pg = P.at(i);
        // (blank pages; the empty page after a page break that ends
        // the galley takes nothing)
        if (pg.blank || pg.start.k === items.length) continue;
        assert.ok(pg.end.k > pg.start.k || pg.end.line > pg.start.line
          || (pg.end.dy || 0) > (pg.start.dy || 0), 't' + t + ' p' + i);
      }
      assert.equal(P.at(P.count - 1).end.k, items.length);
    }
  });
});

describe('PageKeep: real documents (styles, tables)', () => {
  const STY = stylesXml(
    '<w:docDefaults><w:pPrDefault><w:pPr><w:widowControl/>' +
    '</w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="H"><w:name w:val="H"/>' +
    '<w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/>' +
    '</w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Loose">' +
    '<w:name w:val="Loose"/><w:basedOn w:val="H"/><w:pPr>' +
    '<w:keepNext w:val="0"/><w:widowControl w:val="0"/></w:pPr>' +
    '</w:style>');
  const sty = (id) => `<w:pStyle w:val="${id}"/>`;

  it('keepOf: styles, direct formatting, widowControl default on',
    async () => {
      const {doc, G} = await docLayout(p(r('a')) + p(r('h'), sty('H')) +
        p(r('l'), sty('Loose')) +
        p(r('d'), sty('Loose') + '<w:keepNext/>') +
        p(r('w'), '<w:widowControl w:val="0"/>'),
      {'word/styles.xml': STY});
      const bs = doc.sections[0].blocks;
      const k = (i) => keepOf(doc.styles, bs[i]);
      assert.deepEqual(k(0), {keepNext: false, keepLines: false,
        widow: true});
      assert.deepEqual(k(1), {keepNext: true, keepLines: true,
        widow: true});
      assert.deepEqual(k(2), {keepNext: false, keepLines: true,
        widow: false});
      assert.equal(k(3).keepNext, true);
      assert.equal(k(4).widow, false);
      assert.deepEqual(keepOf(null, {pPr: {}}), {keepNext: false,
        keepLines: false, widow: true});
      assert.equal(G.facts(1).keepNext, true);
      assert.equal(G.facts(1).keepLines, true);
      assert.equal(G.facts(4).widow, false);
    });

  it('keepTable: every row\'s paragraphs keepNext (PG7)', async () => {
    const kn = '<w:keepNext/>';
    const tbl = (a, b) => '<w:tbl><w:tblPr><w:tblW w:w="0" ' +
      'w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/>' +
      '<w:gridCol w:w="2000"/></w:tblGrid>' +
      `<w:tr><w:tc>${p(r('a'), kn)}</w:tc><w:tc>${p(r('b'), a)}` +
      `</w:tc></w:tr><w:tr><w:tc>${p(r('c'), kn)}${p(r('d'), b)}` +
      `</w:tc><w:tc>${p(r('e'), kn)}</w:tc></w:tr></w:tbl>`;
    const {L, G} = await docLayout(tbl(kn, kn) + p(r('x')) +
      tbl(kn, '') + p(r('y')));
    const ts = L.items.filter((x) => x.kind === 'tbl');
    assert.equal(ts.length, 2);
    assert.equal(keepTable(ts[0]), true);
    assert.equal(keepTable(ts[1]), false);
    assert.equal(keepTable(L.items[1]), false);
    assert.equal(G.facts(0).keepNext, true);
    assert.equal(G.facts(2).keepNext, false);
  });

  it('a heading style moves with its body on A4', async () => {
    const body = Array.from({length: 200}, (_, k) => p(r('L' + k)))
      .join('');
    const probe = await docLayout(body, {'word/styles.xml': STY});
    const P0 = new Pages(probe.G).finish();
    const n = P0.at(0).end.k;
    const many = Array.from({length: n - 1}, (_, k) => p(r('L' + k)))
      .join('');
    const {G} = await docLayout(many + p(r('Head'), sty('H')) +
      p(r('Body')) + p(r('More')), {'word/styles.xml': STY});
    const P = new Pages(G).finish();
    assert.deepEqual(P.at(1).start, {k: n - 1, line: 0});
  });
});
