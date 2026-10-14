// Hostile page geometry and galley values (Batch D P2 fix wave,
// review I3): a frame is never less than Paginate's MIN_FRAME (margins
// at or over the page height cannot make a 1 px frame and a page per
// 1 px of text), and a frame height, item y, block height or line
// height that is not a finite number never stops a page moving on.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {MIN_FRAME} from '../../tools/moreapps/!Letters/Paginate';
import {loadStyles} from './word-docs.mjs';
import {galley, docLayout} from './page-fixtures.mjs';

before(loadStyles);

/** All pages of G, checking each starts past the one before (cap:
 *  more pages than that is a runaway). */
function run(G, cap = 100000) {
  const P = new Pages(G);
  let last = null;
  while (P.more()) {
    const pg = P.list[P.count - 1];
    if (last && !last.blank && !pg.blank) {
      const a = last.start, b = pg.start;
      assert.ok(b.k > a.k || (b.k === a.k && (b.line > a.line ||
        (b.line === a.line && (b.dy || 0) > (a.dy || 0)))),
      `page ${pg.i} moves on`);
    }
    last = pg;
    assert.ok(P.count <= cap, 'runaway: ' + P.count);
  }
  assert.ok(P.done);
  return P;
}

/** G whose every page has frame height h (the page h - 20). */
function framed(h, items = Array(50).fill(10)) {
  const G = galley({items});
  const g = G.geom(0);
  const gg = {...g, size: {...g.size, h: h + 20}};
  G.geom = () => gg;
  return G;
}

const MAR = (top, bottom) => '<w:sectPr><w:pgSz w:w="11906" ' +
  `w:h="16838"/><w:pgMar w:top="${top}" w:right="1440" ` +
  `w:bottom="${bottom}" w:left="1440" w:header="708" ` +
  'w:footer="708" w:gutter="0"/></w:sectPr>';
const paras = (n) => Array.from({length: n}, (_, i) =>
  `<w:p><w:r><w:t>para ${i} words words words</w:t></w:r></w:p>`)
  .join('');

describe('MIN_FRAME (review I3)', () => {
  it('is half an inch (720 twips, 48 px)', () => {
    assert.equal(MIN_FRAME, 48);
  });

  it('a frame at MIN_FRAME is kept, one under or absurd is raised ' +
    'to it, a bigger one is kept', () => {
    for (const [h, want] of [[MIN_FRAME, MIN_FRAME],
      [MIN_FRAME - 1, MIN_FRAME], [MIN_FRAME + 1, MIN_FRAME + 1],
      [1, MIN_FRAME], [0, MIN_FRAME], [-5, MIN_FRAME],
      [0.001, MIN_FRAME], [-1e9, MIN_FRAME], [1e9, 1e9]]) {
      const P = run(framed(h));
      assert.equal(P.at(0).frameH, want, `frame ${h}`);
    }
  });

  it('a frame height not finite is MIN_FRAME', () => {
    for (const h of [NaN, Infinity, -Infinity]) {
      const P = run(framed(h));
      assert.equal(P.at(0).frameH, MIN_FRAME, `frame ${h}`);
      assert.ok(P.count <= 50, `frame ${h}: ${P.count} pages`);
    }
  });

  for (const [top, bottom] of [[16000, 16000], [-16000, -16000],
    [15000, 2000], [31680, 31680]]) {
    it(`margins ${top} / ${bottom} on A4: MIN_FRAME, a page per ` +
      'paragraph at most', async () => {
      const {G} = await docLayout(paras(300) + MAR(top, bottom));
      const P = run(G);
      assert.equal(P.at(0).frameH, MIN_FRAME);
      assert.ok(P.count <= 301, `${P.count} pages`);
    });
  }

  it('50,000 paragraphs with margins over the page: < 2 s, ' +
    '< 100,000 pages', async () => {
    const {G} = await docLayout(paras(50000) + MAR(-16000, -16000));
    const t0 = performance.now();
    const P = new Pages(G).finish();
    const ms = performance.now() - t0;
    console.log(`# ${P.count} pages in ${ms.toFixed(0)} ms`);
    assert.ok(ms < 2000, `${ms} ms`);
    assert.ok(P.count < 100000 && P.count <= 50001, `${P.count}`);
  });
});

describe('values not finite (review I3)', () => {
  const cases = {
    'a block of NaN height': (G) => { G.items[5].h = NaN; },
    'a block of Infinity height': (G) => { G.items[5].h = Infinity; },
    'an item at NaN y': (G) => { G.items[6].y = NaN; },
    'an item at Infinity y': (G) => { G.items[6].y = Infinity; },
    'a line of NaN height': (G) => { G.items[7].lines[1].h = NaN; },
    'a line at NaN y': (G) => { G.items[7].lines[1].y = NaN; },
    'every item at NaN y': (G) => {
      for (const it of G.items) it.y = NaN;
    },
    'a negative block': (G) => { G.items[8].h = -50; },
  };
  for (const [what, spoil] of Object.entries(cases)) {
    it(`${what}: every page moves on, the pages end`, () => {
      const items = Array.from({length: 30}, (_, k) =>
        (k === 5 ? {kind: 'box', h: 30} : k === 7
          ? {lines: [10, 10, 10]} : 10));
      const G = galley({items});
      spoil(G);
      const P = run(G, 200);
      assert.ok(P.count <= 40, `${P.count} pages`);
      assert.ok(P.list.every((pg) => Number.isFinite(pg.vShift) &&
        Number.isFinite(pg.frameH)));
    });
  }

  it('a NaN frame and NaN items in vAlign sections end, vShift ' +
    'finite', () => {
    const items = Array.from({length: 40}, (_, k) => (k % 7 === 3
      ? {kind: 'box', h: NaN} : k % 5 === 1 ? {lines: [NaN, 10]}
        : k === 20 ? {h: 10, sectStart: 'nextPage'} : 10));
    const G = galley({items, sections: [{vAlign: 'center'},
      {vAlign: 'bottom'}]});
    const geom = G.geom;
    G.geom = (s) => ({...geom(s), size: {w: 200, h: NaN}});
    const P = run(G, 200);
    assert.ok(P.list.every((pg) => Number.isFinite(pg.vShift)));
  });
});
