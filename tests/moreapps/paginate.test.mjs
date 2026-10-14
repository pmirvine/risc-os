// Pagination: the frame fill (Batch D P2.1, D5) and the Pages object
// (D2 + R6, the cursor pass). Fake galleys (page-fixtures galley:
// frame 100 px unless said) and a few real documents (docLayout).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {nextPage, PAGE_GAP, sameCursor}
  from '../../tools/moreapps/!Letters/Paginate';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galley, docLayout} from './page-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {rng, tm} from './word-docs.mjs';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {wordHf} from './hf-fixtures.mjs';

const pagesOf = (spec) => new Pages(galley(spec)).finish();
const starts = (P) => Array.from({length: P.count},
  (_, i) => P.at(i).start);
const ks = (P) => starts(P).map((c) => c.k);
const tens = (n) => Array(n).fill(10);

describe('Paginate: frames', () => {
  it('30 items of 10 px: 3 pages starting at 0, 10, 20', () => {
    const P = pagesOf({items: tens(30)});
    assert.equal(P.count, 3);
    assert.deepEqual(ks(P), [0, 10, 20]);
    assert.ok(P.done);
    assert.deepEqual(P.at(2).end, {k: 30, line: 0});
  });

  it('a paragraph crossing the bottom splits after the line that ' +
    'fits', () => {
    const P = pagesOf({items: [...tens(8), {lines: tens(5)}]});
    assert.equal(P.count, 2);
    assert.deepEqual(P.at(0).end, {k: 8, line: 2});
    assert.deepEqual(P.at(1).start, {k: 8, line: 2});
    assert.deepEqual(P.at(1).end, {k: 9, line: 0});
  });

  it('space after the last paragraph is not carried over', () => {
    const P = pagesOf({items: [...tens(9), {lines: [10], after: 30},
      10]});
    assert.deepEqual(P.at(0).end, {k: 10, line: 0});
    assert.equal(P.count, 2);
  });

  it('an item of 250 px on a 100 px frame is cut on 3 pages', () => {
    for (const kind of ['box', 'p']) {
      const P = pagesOf({items: [{kind, h: 250}, 10]});
      assert.equal(P.count, 3, kind);
      assert.deepEqual(starts(P).map((c) => c.dy || 0), [0, 100, 200]);
      assert.deepEqual(P.at(2).end, {k: 2, line: 0}, kind);
    }
  });

  it('zero-height items and an empty galley', () => {
    assert.deepEqual(ks(pagesOf({items: [0, 0, 0, 0, 0, ...tens(30)]})),
      [0, 15, 25]);
    assert.equal(pagesOf({items: [0, 0, 0]}).count, 1);
    const P = pagesOf({items: []});
    assert.equal(P.count, 1);
    assert.deepEqual(P.at(0).start, {k: 0, line: 0});
    assert.equal(P.num(0), '1');
  });

  it('a header taller than its margin pushes the body down', () => {
    assert.equal(pagesOf({items: tens(30), hdrH: () => 30}).count, 4);
    const ex = pagesOf({items: tens(30), hdrH: () => 30,
      sections: [{exactTop: true}]});
    assert.equal(ex.count, 3);
  });

  it('the footnote hook: a non-zero reserve shortens the frame',
    () => {
      const items = tens(30);
      items[0] = {h: 10, refs: ['n1']};
      const seen = [];
      const P = pagesOf({items, reserve: (frame, refs) => {
        seen.push(refs);
        return 30;
      }});
      assert.deepEqual(ks(P), [0, 7, 17, 27]);
      assert.deepEqual(seen, [['n1']]);
      assert.equal(pagesOf({items}).count, 3);
    });
});

describe('Paginate: forced breaks', () => {
  it('a page break in line 2 ends the page after it', () => {
    const P = pagesOf({items: [{lines: tens(5), brPage: [2]}]});
    assert.equal(P.count, 2);
    assert.deepEqual(P.at(0).end, {k: 0, line: 3});
    assert.deepEqual(P.at(1).start, {k: 0, line: 3});
  });

  it('a break on the last line of a paragraph: next item next page',
    () => {
      const P = pagesOf({items: [{lines: tens(2), brPage: [1]}, 10]});
      assert.deepEqual(ks(P), [0, 1]);
      assert.deepEqual(P.at(1).start, {k: 1, line: 0});
    });

  it('a page break as the last thing in the document: one empty ' +
    'page after it (Word: app.xml Pages counts it, P2.4)', () => {
    const P = pagesOf({items: [10, {lines: tens(2), brPage: [1]}]});
    assert.equal(P.count, 2);
    assert.ok(P.done);
    const t = P.at(1);
    assert.deepEqual([t.start, t.end], [{k: 2, line: 0},
      {k: 2, line: 0}]);
    assert.equal(t.num, 2);
    assert.equal(t.blank, false);
    assert.equal(t.why, 'end');
    assert.equal(t.top, P.at(0).h + PAGE_GAP);
    assert.deepEqual(t.frames[0].frags, []);
    // a break that is not the last line: no empty page
    assert.equal(pagesOf({items: [{lines: tens(3), brPage: [1]}]})
      .count, 2);
    // asked page by page, as the slices do
    const Q = new Pages(galley({items: [{lines: [10], brPage: [0]}]}));
    while (!Q.step(0));
    assert.equal(Q.count, 2);
  });

  it('page break before: a new page, none when already first', () => {
    const mid = tens(6);
    mid[3] = {h: 10, breakBefore: true};
    assert.deepEqual(ks(pagesOf({items: mid})), [0, 3]);
    const top = tens(20);
    top[10] = {h: 10, breakBefore: true};
    assert.deepEqual(ks(pagesOf({items: top})), [0, 10]);
    const first = tens(3);
    first[0] = {h: 10, breakBefore: true};
    assert.equal(pagesOf({items: first}).count, 1);
  });

  it('nextPage (and absent) sections start a page; continuous ' +
    'does not, its band skipped', () => {
    for (const t of ['nextPage', 'nextColumn', 'foo']) {
      const items = tens(5);
      items[3] = {h: 10, sectStart: t};
      const P = pagesOf({items});
      assert.deepEqual(ks(P), [0, 3], t);
      assert.equal(P.at(1).s, 1);
      assert.ok(P.at(1).first);
    }
    const c = tens(10);
    c[5] = {h: 10, sectStart: 'continuous'};
    const P = pagesOf({items: c});
    assert.equal(P.count, 1);
    assert.equal(P.at(0).s, 0);
  });

  it('a continuous section of another page size starts a page',
    () => {
      const c = tens(10);
      c[5] = {h: 10, sectStart: 'continuous'};
      const P = pagesOf({items: c,
        sections: [{}, {size: {w: 300, h: 120}}]});
      assert.deepEqual(ks(P), [0, 5]);
      assert.equal(P.at(1).w, 300);
      assert.equal(P.at(1).h, 120);
      assert.deepEqual(P.at(1).size, {w: 4500, h: 1800});
    });

  it('a continuous section starting mid-page: the page after is not '
    + 'its first (I2): no first header, no number restart', () => {
    const c = tens(25);
    c[5] = {h: 10, sectStart: 'continuous'};
    const asked = [];
    const G = galley({items: c, sections: [{},
      {pgNumType: {start: 7}}]});
    G.typeOf = (s, first, num) => {
      asked.push([s, first]);
      return first ? 'first' : 'default';
    };
    G.hdrH = (s, type) => (type === 'first' ? 40 : 0);
    const P = new Pages(G).finish();
    assert.equal(P.at(0).s, 0);
    assert.equal(P.at(1).s, 1, 'page 2 starts in section 1');
    assert.ok(P.at(0).first, 'page 1 is section 0\'s first');
    assert.equal(P.at(1).first, false, 'page 2 starts mid-section');
    assert.equal(P.at(2).first, false);
    assert.deepEqual([0, 1, 2].map((i) => P.num(i)), ['1', '2', '3'],
      'no restart on a page that is not the section\'s first');
    assert.equal(P.at(1).bodyTop, P.at(2).bodyTop, 'the default frame');
    assert.ok(!asked.some(([s, f]) => s === 1 && f), 'never first');
    // a continuous section that starts a page (another size) is first
    const d = tens(25);
    d[10] = {h: 10, sectStart: 'continuous'};
    const Q = pagesOf({items: d, sections: [{},
      {size: {w: 300, h: 120}, pgNumType: {start: 7}}]});
    assert.deepEqual(ks(Q).slice(0, 2), [0, 10]);
    assert.ok(Q.at(1).first, 'it starts at the section\'s first item');
    assert.equal(Q.num(1), '7');
  });

  it('oddPage from page 1 adds a blank page 2: not shown, its ' +
    'number skipped', () => {
    const items = tens(5);
    items[3] = {h: 10, sectStart: 'oddPage'};
    const P = pagesOf({items});
    assert.equal(P.count, 3);
    assert.ok(P.at(1).blank);
    assert.equal(P.at(1).s, 0);
    assert.deepEqual(P.at(1).start, P.at(1).end);
    assert.equal(P.num(1), '2');
    assert.equal(P.num(2), '3');
    assert.equal(P.at(2).parity, 'odd');
    assert.ok(P.at(2).first && !P.at(2).blank);
    // not shown: it takes no room on the sheet
    assert.equal(P.at(2).top, P.at(1).top);
  });

  it('evenPage from page 2 adds a blank; from page 1 none', () => {
    const items = tens(15);
    items[13] = {h: 10, sectStart: 'evenPage'};
    const P = pagesOf({items});
    assert.deepEqual(P.at(2).blank, true);
    assert.deepEqual(['1', '2', '3', '4'],
      [0, 1, 2, 3].map((i) => P.num(i)));
    assert.equal(P.at(3).parity, 'even');
    const one = tens(5);
    one[3] = {h: 10, sectStart: 'evenPage'};
    const Q = pagesOf({items: one});
    assert.equal(Q.count, 2);
    assert.ok(!Q.at(1).blank);
    const odd = tens(5);
    odd[3] = {h: 10, sectStart: 'oddPage'};
    odd[4] = {h: 10, sectStart: 'oddPage'};
    // never two blanks in a row, never a loop
    assert.equal(pagesOf({items: odd}).count, 5);
  });
});

describe('Paginate: space before at the top of a page', () => {
  const before = (k, o = {}) => {
    const items = tens(20);
    items[k] = {lines: [10], before: 6, ...o};
    return items;
  };

  it('dropped after a natural break (the fragment shifted)', () => {
    const G = galley({items: before(10)});
    const P = new Pages(G).finish();
    assert.deepEqual(ks(P), [0, 10]);
    assert.equal(P.at(1).y0, G.items[10].y + 6);
    assert.equal(G.items[10].y + 0, G.items[9].y + 10);
  });

  it('kept after page break before, a page break, a section start',
    () => {
      const a = galley({items: before(10, {breakBefore: true})});
      const P = new Pages(a).finish();
      assert.equal(P.at(1).y0, a.items[10].y);
      assert.deepEqual(ks(P), [0, 10, 19]);
      const items = before(3);
      items[2] = {lines: [10], brPage: [0]};
      const b = galley({items});
      assert.equal(new Pages(b).finish().at(1).y0, b.items[3].y);
      const c = galley({items: before(3, {sectStart: 'nextPage'})});
      assert.equal(new Pages(c).finish().at(1).y0, c.items[3].y);
    });
});

describe('Paginate: page numbers and vertical alignment', () => {
  it('pgNumType lowerRoman start 3: iii, iv; a restart', () => {
    const items = tens(30);
    items[20] = {h: 10, sectStart: 'nextPage'};
    const P = pagesOf({items, sections: [
      {pgNumType: {fmt: 'lowerRoman', start: 3}},
      {pgNumType: {fmt: 'upperLetter', start: 1}}]});
    assert.deepEqual([0, 1, 2].map((i) => P.num(i)),
      ['iii', 'iv', 'A']);
    assert.equal(P.at(0).fmt, 'lowerRoman');
    assert.equal(P.at(0).num, 3);
  });

  it('thaiNumbers and other formats are shown decimal (PG16)', () => {
    for (const fmt of ['thaiNumbers', 'ordinal', 'none', 'bullet',
      'decimalZero', 42, null]) {
      const P = pagesOf({items: tens(5),
        sections: [{pgNumType: {fmt, start: 7}}]});
      assert.equal(P.num(0), '7', String(fmt));
      assert.equal(P.at(0).fmt, 'decimal');
    }
  });

  it('numbering without a restart runs on across sections', () => {
    const items = tens(30);
    items[20] = {h: 10, sectStart: 'nextPage'};
    const P = pagesOf({items});
    assert.deepEqual([0, 1, 2].map((i) => P.num(i)), ['1', '2', '3']);
    assert.ok(P.at(0).first && !P.at(1).first && P.at(2).first);
  });

  it('vAlign center/bottom shifts the last page of the section',
    () => {
      const items = Array(15).fill(9);
      const c = pagesOf({items, sections: [{vAlign: 'center'}]});
      assert.equal(c.count, 2);
      assert.equal(c.at(0).vShift, 0);
      assert.equal(c.at(1).vShift, (100 - 36) / 2);
      const b = pagesOf({items, sections: [{vAlign: 'bottom'}]});
      assert.equal(b.at(1).vShift, 64);
      const t = pagesOf({items, sections: [{vAlign: 'top'}]});
      assert.equal(t.at(1).vShift, 0);
      const two = Array(6).fill(10);
      two[3] = {h: 10, sectStart: 'nextPage'};
      const s = pagesOf({items: two, sections: [{vAlign: 'center'}]});
      assert.equal(s.at(0).vShift, 35);
      assert.equal(s.at(1).vShift, 0);
    });
});

describe('Pages: the shape (D2 + R6)', () => {
  it('pages carry i, s, num, fmt, parity, first, size, mar, top, w, h',
    () => {
      const P = pagesOf({items: tens(30)});
      const pg = P.at(1);
      assert.equal(pg.i, 1);
      assert.equal(pg.s, 0);
      assert.equal(pg.num, 2);
      assert.equal(pg.parity, 'even');
      assert.equal(pg.first, false);
      assert.equal(pg.blank, false);
      assert.deepEqual(pg.size, {w: 3000, h: 1800});
      assert.equal(pg.mar.top, 150);
      assert.equal(pg.w, 200);
      assert.equal(pg.h, 120);
      assert.equal(pg.top, 120 + PAGE_GAP);
      assert.equal(P.at(2).top, 2 * (120 + PAGE_GAP));
      assert.equal(PAGE_GAP, 16);
      assert.ok(Object.isFrozen(pg));
      assert.equal(P.at(3), null);
      assert.equal(P.at(-1), null);
    });

  it('at(i) computes on demand; versions differ', () => {
    const G = galley({items: tens(300)});
    const P = new Pages(G);
    assert.equal(P.done, false);
    assert.equal(P.at(4).start.k, 40);
    assert.ok(P.count >= 5 && !P.done);
    P.finish();
    assert.equal(P.count, 30);
    assert.ok(new Pages(G, P).version !== P.version);
  });

  it('10,000 page breaks in one paragraph: 10,001 pages, < 200 ms',
    () => {
      const n = 10000;
      const G = galley({items: [{lines: Array(n).fill(12),
        brPage: Array.from({length: n}, (_, j) => j)}]});
      const t0 = performance.now();
      const P = new Pages(G).finish();
      const ms = performance.now() - t0;
      assert.equal(P.count, n + 1);      // (the last: empty, P2.4)
      assert.deepEqual(P.at(n - 1).start, {k: 0, line: n - 1});
      assert.deepEqual(P.at(n).start, {k: 1, line: 0});
      assert.ok(ms < 200, ms + ' ms');
    });

  it('never zero progress (random galleys)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      const items = [];
      const n = 1 + Math.floor(rand() * 40);
      for (let k = 0; k < n; k++) {
        const nl = Math.floor(rand() * 6);
        const lines = Array.from({length: nl},
          () => Math.floor(rand() * 160));
        const o = rand() < 0.3 ? {kind: 'box',
          h: Math.floor(rand() * 300)} : {lines,
          before: Math.floor(rand() * 20)};
        if (rand() < 0.1) o.breakBefore = true;
        if (rand() < 0.1 && nl) o.brPage = [Math.floor(rand() * nl)];
        if (rand() < 0.1) o.sectStart = ['continuous', 'oddPage',
          'evenPage', 'nextPage'][Math.floor(rand() * 4)];
        if (rand() < 0.1) o.gapAbove = -Math.floor(rand() * 5);
        items.push(o);
      }
      const frame = 1 + Math.floor(rand() * 150);
      const G = galley({items, frame});
      const P = new Pages(G).finish();
      let most = 1;
      for (const it of G.items) {
        most += 2 * (Math.ceil(it.h / frame) + it.lines.length + 2);
      }
      assert.ok(P.count <= most, 'seed ' + seed);
      for (let i = 0; i < P.count; i++) {
        const pg = P.at(i);
        // (blank pages; the empty page after a page break that ends
        // the galley takes nothing)
        if (pg.blank || pg.start.k === G.items.length) continue;
        assert.ok(!sameCursor(pg.start, pg.end), seed + ' p' + i);
      }
      assert.equal(P.at(P.count - 1).end.k, G.items.length);
    }
  });

  it('nextPage: no more pages at the end', () => {
    const G = galley({items: tens(3)});
    const a = nextPage(G, {k: 0, line: 0}, null);
    assert.deepEqual(a.end, {k: 3, line: 0});
    assert.equal(nextPage(G, a.end, a), null);
  });
});

describe('Pages: real documents (PageGalley)', () => {
  const body = (n, t) => Array.from({length: n},
    (_, k) => p(r(t + ' ' + k))).join('');
  const sect = (type) => `<w:sectPr><w:type w:val="${type}"/>` +
    '<w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';

  it('a page break, page break before and an odd page section',
    async () => {
      const {L, G} = await docLayout(
        p(r('one') + '<w:r><w:br w:type="page"/></w:r>' + r('two')) +
        p(r('three'), '<w:pageBreakBefore/>') +
        p(r('four'), sect('nextPage')) +
        p(r('five')) + sect('oddPage'));
      const P = new Pages(G).finish();
      const ids = (i) => L.items[P.at(i).start.k].id;
      assert.equal(P.count, 5);
      assert.deepEqual(P.at(1).start, {k: 0, line: 1});
      assert.equal(ids(2), L.items[1].id);
      assert.ok(P.at(3).blank);
      assert.equal(P.at(4).s, 1);
      assert.equal(P.num(4), '5');
      assert.equal(P.at(0).w, L.geom(0).size.w);
      assert.deepEqual(P.at(0).size, {w: 11906, h: 16838});
    });

  it('a long document fills A4 pages; a continuous band skipped',
    async () => {
      const {L, G} = await docLayout(body(200, 'Line') +
        p(r('end'), sect('continuous')) + body(5, 'More') +
        '<w:sectPr><w:type w:val="continuous"/></w:sectPr>');
      const P = new Pages(G).finish();
      const frame = P.at(0).h - 96 - 96;
      for (let i = 0; i + 1 < P.count; i++) {
        const a = L.items[P.at(i).start.k];
        const b = L.items[P.at(i).end.k];
        assert.ok(b.y - a.y <= frame + 18.01, 'page ' + i);
        assert.ok(L.items[P.at(i).end.k - 1].y - a.y > frame - 40,
          'page ' + i + ' full');
      }
      assert.ok(P.count > 2);
      assert.equal(P.at(P.count - 1).end.k, L.items.length);
      assert.ok(G.facts(200).band > 0);
    });
});

/** A Word-shaped document with headers (hf-fixtures wordHf),
 *  paginated with its headers and footers: {L, G, P}. */
async function hfPages(opts) {
  const L = new DocLayout(await readDocx(await wordHf(opts)), tm());
  L.layout(1000);
  const G = printGalley(L);
  return {L, G, P: new Pages(G).finish()};
}
const lines = (n, w = 'Head') => Array.from({length: n},
  (_, i) => p(r(w + ' ' + i))).join('');
const H1 = 'word/header1.xml', H2 = 'word/header2.xml';

describe('headers and footers on pages (P7.2, D5, D13)', () => {
  it('a 5-line header pushes the body down on every page using it',
    async () => {
      const plain = await hfPages({});
      const {L, G, P} = await hfPages({default: {hdr: lines(5)}});
      const g = L.geom(0), hh = G.hdrH(0, 'default');
      assert.ok(g.mar.header + hh > g.mar.top + 20, `${hh}`);
      const e0 = P.at(0).end, p0 = plain.P.at(0).end;
      assert.ok(e0.k < p0.k || (e0.k === p0.k && e0.line < p0.line),
        JSON.stringify([e0, p0]));
      for (const pg of P.list) {
        assert.equal(pg.bodyTop, g.mar.header + hh);
        assert.equal(pg.frameH, g.size.h - pg.bodyTop - g.mar.bottom);
        assert.deepEqual(pg.header, {part: H1, type: 'default', s: 0});
        assert.equal(pg.footer, null);
      }
      for (const pg of plain.P.list) {
        assert.equal(pg.bodyTop, g.mar.top);
        assert.equal(pg.header, null);
      }
    });

  it('a 5-line footer pushes the body up', async () => {
    const {L, G, P} = await hfPages({default: {ftr: lines(5, 'Foot')}});
    const g = L.geom(0), fh = G.ftrH(0, 'default');
    assert.ok(g.mar.footer + fh > g.mar.bottom + 20);
    for (const pg of P.list) {
      assert.equal(pg.bodyTop, g.mar.top);
      assert.equal(pg.frameH, g.size.h - g.mar.top - g.mar.footer - fh);
      assert.equal(pg.footer.part, 'word/footer1.xml');
    }
  });

  it('an exact (negative) top margin is not pushed', async () => {
    const {L, P} = await hfPages({default: {hdr: lines(5)},
      pgMar: {top: -1440}});
    const g = L.geom(0);
    assert.ok(g.exactTop);
    for (const pg of P.list) {
      assert.equal(pg.bodyTop, 96);
      assert.equal(pg.header.part, H1);
    }
  });

  it('a first-page header taller than the default: only page 1\'s ' +
    'frame is shorter', async () => {
    const plain = await hfPages({});
    const {P} = await hfPages({titlePg: true,
      default: {hdr: lines(1)}, first: {hdr: lines(8)}});
    const f0 = plain.P.at(0).frameH;
    assert.ok(P.count >= 3);
    assert.ok(P.at(0).frameH < f0 - 60, `${P.at(0).frameH}`);
    for (const pg of P.list.slice(1)) assert.equal(pg.frameH, f0);
    assert.deepEqual(P.list.map((pg) => pg.header.type),
      ['first', ...Array(P.count - 1).fill('default')]);
    assert.equal(P.at(0).header.part, H2);
    assert.equal(P.at(1).header.part, H1);
  });

  it('even pages (evenAndOddHeaders) show the even header', async () => {
    const {P} = await hfPages({evenAndOdd: true,
      default: {hdr: lines(1)}, even: {hdr: lines(6)}});
    assert.ok(P.count >= 3);
    for (const pg of P.list) {
      const even = pg.num % 2 === 0;
      assert.equal(pg.header.type, even ? 'even' : 'default');
      assert.equal(pg.header.part, even ? H2 : H1);
      assert.ok(even ? pg.frameH < P.at(0).frameH
        : pg.frameH === P.at(0).frameH);
    }
  });

  it('a header part that is no story: kept, shown as preserved, ' +
    'not pushing the body', async () => {
    const bad = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/' +
      'wordprocessingml/2006/main"><w:p><w:pPr><w:sectPr/></w:pPr>' +
      '</w:p></w:hdr>';
    const {L, P} = await hfPages({default: {hdr: lines(5)},
      bad: {default: bad}});
    assert.equal(L.doc.stories.has(H1), false);
    for (const pg of P.list) {
      assert.deepEqual(pg.header, {part: null, type: 'default', s: 0,
        kept: H1});
      assert.equal(pg.bodyTop, L.geom(0).mar.top);
    }
  });

  it('a header taller than the page: the frame is MIN_FRAME, every ' +
    'page moves on', async () => {
    const {MIN_FRAME} = await import(
      '../../tools/moreapps/!Letters/Paginate');
    const {L, P} = await hfPages({body: lines(30, 'Body'),
      default: {hdr: lines(120), ftr: lines(80, 'Foot')}});
    assert.ok(P.done && P.count >= 2 && P.count <= 31, `${P.count}`);
    for (const pg of P.list) assert.equal(pg.frameH, MIN_FRAME);
    assert.equal(P.at(P.count - 1).end.k, L.items.length);
  });

  it('a fake galley\'s typeOf names the type hdrH and refOf get',
    () => {
      const asked = [];
      const G = galley({items: tens(30)});
      G.typeOf = (s, first, num) => (num === 2 ? 'even' : 'default');
      G.hdrH = (s, type) => {
        asked.push(type);
        return type === 'even' ? 60 : 0;
      };
      G.refOf = (s, type, kind) => (kind === 'hdr'
        ? Object.freeze({part: 'h', type, s}) : null);
      const P = new Pages(G).finish();
      assert.deepEqual(P.list.map((pg) => pg.header.type),
        P.list.map((pg) => (pg.num === 2 ? 'even' : 'default')));
      assert.ok(asked.includes('even') && !asked.includes('first'));
      assert.ok(P.at(1).frameH < P.at(0).frameH);
      assert.equal(P.at(0).footer, null);
    });
});

describe('PageGalley: items read when asked (review M3)', () => {
  it('G.items is L.items now, not the array galleyOf saw', async () => {
    const {L, G} = await docLayout(p(r('a')) + p(r('b')) + p(r('c')));
    assert.equal(typeof Object.getOwnPropertyDescriptor(G, 'items').get,
      'function');
    const was = L.items;
    L.items = was.slice(0, 2);
    try {
      assert.equal(G.items, L.items);
      assert.equal(new Pages(G).finish().at(0).end.k, 2);
    } finally {
      L.items = was;
    }
    assert.equal(G.items, was);
  });
});

describe('PageCursor', () => {
  it('cursors, breakFrom and lastFit', async () => {
    const {cursor, breakFrom, lastFit} =
      await import('../../tools/moreapps/!Letters/PageCursor');
    assert.deepEqual(cursor(3, 1), {k: 3, line: 1});
    assert.deepEqual(cursor(3, 1, 0), {k: 3, line: 1});
    assert.deepEqual(cursor(3, 1, 5), {k: 3, line: 1, dy: 5});
    assert.ok(Object.isFrozen(cursor(0, 0)));
    assert.ok(sameCursor(cursor(1, 2), {k: 1, line: 2, dy: 0}));
    assert.ok(!sameCursor(cursor(1, 2), cursor(1, 2, 1)));
    assert.equal(breakFrom(null, 0), -1);
    assert.equal(breakFrom([1, 4, 9], 0), 1);
    assert.equal(breakFrom([1, 4, 9], 5), 9);
    assert.equal(breakFrom([1, 4, 9], 10), -1);
    const it = {y: 100};
    const ls = [{y: 0, h: 10}, {y: 10, h: 10}, {y: 20, h: 10}];
    assert.equal(lastFit(it, ls, 0, 125), 1);
    assert.equal(lastFit(it, ls, 0, 130), 2);
    assert.equal(lastFit(it, ls, 0, 109), -1);
    assert.equal(lastFit(it, ls, 2, 125), 1);
  });
});
