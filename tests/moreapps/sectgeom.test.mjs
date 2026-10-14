// SectGeom (Batch D, D3): a section's page geometry in twips (the
// model's meaning: unclamped) and in px for display (clamped as
// DocLayout always did: text width 80..4000 px, page height
// 200..20000 px, margins 0..1000 px). The one rule for section
// geometry; SectWidth.columnTw goes through it, with the document's
// gutterAtTop (P1 fix M1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {geomOf, pxOf, MIN_TEXT, MAX_TEXT} from
  '../../tools/moreapps/!Letters/SectGeom';
import {columnTw} from '../../tools/moreapps/!Letters/SectWidth';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {W} from '../../tools/moreapps/!Letters/Ns';

const sec = (props = {}) => ({props: {extra: [], ...props}, blocks: [],
  raw: null});
const el = (name, attrs = []) => ({name, attrs, children: []});
const A4 = {w: 11906, h: 16838};

describe('SectGeom geomOf: page size and margins', () => {
  it('A4 portrait by default, Word\'s default margins', () => {
    const g = geomOf(sec(), {});
    assert.deepEqual(g.size, A4);
    assert.deepEqual(g.mar, {top: 1440, right: 1440, bottom: 1440,
      left: 1440, header: 720, footer: 720, gutter: 0});
    assert.equal(g.exactTop, false);
    assert.equal(g.exactBottom, false);
    assert.equal(g.textW, 9026);
    assert.deepEqual(g.cols, [{x: 1440, w: 9026}]);
    // (no section at all, no settings: the same)
    assert.deepEqual(geomOf(null), g);
    assert.deepEqual(geomOf({props: null}), g);
  });
  it('Letter landscape: w > h, orient only a label', () => {
    const g = geomOf(sec({pgSz: {w: 15840, h: 12240, orient:
      'landscape'}, pgMar: {top: 1800, right: 1440, bottom: 1800,
      left: 1440, header: 708, footer: 709, gutter: 0}}), {});
    assert.deepEqual(g.size, {w: 15840, h: 12240});
    assert.ok(g.size.w > g.size.h);
    assert.equal(g.textW, 15840 - 2880);
    assert.equal(g.mar.header, 708);
    assert.equal(g.mar.footer, 709);
    // (orient alone changes nothing: Word uses w and h)
    const p = geomOf(sec({pgSz: {orient: 'landscape'}}), {});
    assert.deepEqual(p.size, A4);
  });
  it('pgSz absent: the first section\'s, else A4', () => {
    const first = sec({pgSz: {w: 12240, h: 15840}});
    assert.deepEqual(geomOf(sec(), {}, first).size,
      {w: 12240, h: 15840});
    assert.deepEqual(geomOf(sec({pgSz: {w: 15840, h: 12240}}), {},
      first).size, {w: 15840, h: 12240});
    assert.deepEqual(geomOf(sec(), {}, sec()).size, A4);
  });
  it('a gutter is added to the left margin', () => {
    const g = geomOf(sec({pgMar: {top: 1440, right: 1440, bottom: 1440,
      left: 1440, gutter: 720}}), {});
    assert.equal(g.mar.left, 2160);
    assert.equal(g.mar.right, 1440);
    assert.equal(g.mar.top, 1440);
    assert.equal(g.mar.gutter, 720);
    assert.equal(g.textW, 11906 - 2160 - 1440);
    assert.equal(g.cols[0].x, 2160);
  });
  it('rtlGutter: to the right margin (a w:rtlGutter in extra)', () => {
    for (const node of [el('w:rtlGutter'),
      el('w:rtlGutter', [['w:val', '1']])]) {
      const g = geomOf(sec({pgMar: {left: 1440, right: 1440,
        gutter: 720}, extra: [node]}), {});
      assert.equal(g.mar.left, 1440);
      assert.equal(g.mar.right, 2160);
      assert.equal(g.textW, 11906 - 3600);
    }
    // (off, or another namespace's element: left as before)
    for (const node of [el('w:rtlGutter', [['w:val', '0']]),
      el('x:rtlGutter', [['xmlns:x', 'urn:other']])]) {
      const g = geomOf(sec({pgMar: {left: 1440, right: 1440,
        gutter: 720}, extra: [node]}), {});
      assert.equal(g.mar.left, 2160, JSON.stringify(node));
    }
  });
  it('gutterAtTop (settings): to the top margin', () => {
    const s = sec({pgMar: {top: 1440, left: 1440, right: 1440,
      gutter: 720}, extra: [el('w:rtlGutter')]});
    const g = geomOf(s, {gutterAtTop: true});
    assert.equal(g.mar.top, 2160);
    assert.equal(g.mar.left, 1440);
    assert.equal(g.mar.right, 1440);
    assert.equal(g.textW, 9026);
  });
  it('a negative top or bottom margin: exact, its absolute value',
    () => {
      const g = geomOf(sec({pgMar: {top: -2000, bottom: -1000,
        left: 1440, right: 1440}}), {});
      assert.equal(g.mar.top, 2000);
      assert.equal(g.mar.bottom, 1000);
      assert.equal(g.exactTop, true);
      assert.equal(g.exactBottom, true);
      const h = geomOf(sec({pgMar: {top: 2000, bottom: 0}}), {});
      assert.equal(h.exactTop, false);
      assert.equal(h.exactBottom, false);
    });
  it('sizes read in points (P1.2: twips in the model)', async () => {
    const {readSect} = await import(
      '../../tools/moreapps/!Letters/ReadSect');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/' +
      '2006/main';
    const node = {name: 'w:sectPr', attrs: [['xmlns:w', W]], children: [
      el('w:pgSz', [['w:w', '612pt'], ['w:h', '792pt']]),
      el('w:pgMar', [['w:top', '72pt'], ['w:right', '1in'],
        ['w:bottom', '72pt'], ['w:left', '2.54cm']])]};
    const props = readSect(node, new Map([['w', W]]));
    const g = geomOf({props, blocks: [], raw: node}, {});
    assert.deepEqual(g.size, {w: 12240, h: 15840});
    assert.equal(g.mar.left, 1440);
    assert.equal(g.textW, 12240 - 2880);
  });
});

describe('SectGeom geomOf: columns', () => {
  it('3 equal columns, space 720, on A4', () => {
    const g = geomOf(sec({cols: {num: 3, space: 720}}), {});
    const w = (9026 - 1440) / 3;
    assert.equal(g.cols.length, 3);
    g.cols.forEach((c, i) => {
      assert.equal(c.w, w);
      assert.equal(c.x, 1440 + i * (w + 720));
    });
    assert.equal(g.textW, 9026);
    // (space defaults to 720)
    assert.deepEqual(geomOf(sec({cols: {num: 3}}), {}).cols, g.cols);
  });
  it('typed unequal columns (equalWidth off, w:col)', () => {
    const g = geomOf(sec({cols: {num: 2, equalWidth: false, col: [
      {w: 2000, space: 500}, {w: 6526}]}}), {});
    assert.deepEqual(g.cols, [{x: 1440, w: 2000},
      {x: 1440 + 2500, w: 6526}]);
    // (equalWidth on: the col children are ignored)
    const e = geomOf(sec({cols: {num: 2, space: 0, equalWidth: true,
      col: [{w: 2000}, {w: 7026}]}}), {});
    assert.deepEqual(e.cols, [{x: 1440, w: 4513}, {x: 5953, w: 4513}]);
  });
  it('num 1 or none: one column the text width', () => {
    for (const cols of [{}, {num: 1, space: 425}, {num: 1, sep: true}])
      assert.deepEqual(geomOf(sec({cols}), {}).cols,
        [{x: 1440, w: 9026}]);
  });
});

describe('SectGeom pxOf', () => {
  it('A4: px is twips / 15', () => {
    const p = pxOf(geomOf(sec(), {}));
    assert.ok(Math.abs(p.size.w - 11906 / 15) < 1e-9);
    assert.ok(Math.abs(p.size.h - 16838 / 15) < 1e-9);
    assert.equal(p.mar.left, 96);
    assert.equal(p.mar.header, 48);
    assert.ok(Math.abs(p.textW - 9026 / 15) < 1e-9);
    assert.deepEqual(p.cols, [{x: 96, w: p.textW}]);
    assert.equal(p.exactTop, false);
  });
  it('3 columns: x and w in px', () => {
    const p = pxOf(geomOf(sec({cols: {num: 3, space: 720}}), {}));
    const w = (9026 - 1440) / 3 / 15;
    p.cols.forEach((c, i) => {
      assert.ok(Math.abs(c.w - w) < 1e-9);
      assert.ok(Math.abs(c.x - (96 + i * (w + 48))) < 1e-9);
    });
  });
  it('the clamps are the ones DocLayout had', () => {
    assert.equal(MIN_TEXT, 80);
    assert.equal(MAX_TEXT, 4000);
    const p = pxOf(geomOf(sec({pgSz: {w: 1e9, h: 1e9}}), {}));
    assert.equal(p.textW, 4000);
    assert.equal(p.size.h, 20000);
  });
});

describe('SectGeom pxOf: columns off the page fitted in (P10 fix ' +
  'M5)', () => {
  const inside = (p) => p.cols.every((c) => c.x >= p.mar.left - 1e-9 &&
    c.x + c.w <= p.size.w + 1e-9);
  it('45 equal columns on Letter: each 80 px (as laid out), their ' +
    'left edges spread over the page, none off it', () => {
    const g = geomOf(sec({pgSz: {w: 12240, h: 15840},
      cols: {num: 45, space: 0}}), {});
    const p = pxOf(g);
    assert.equal(p.cols.length, 45);
    assert.ok(p.cols.every((c) => c.w === 80));
    assert.ok(inside(p), JSON.stringify(p.cols.at(-1)));
    assert.equal(p.cols[0].x, p.mar.left);
    for (let i = 1; i < 45; i++) assert.ok(p.cols[i].x > p.cols[i - 1].x);
    // the model's geometry untouched
    assert.equal(g.cols.length, 45);
  });
  it('three w:col of 9000 twips: widths kept, x fitted; a column ' +
    'wider than the page at the left margin', () => {
    const p = pxOf(geomOf(sec({pgSz: {w: 12240, h: 15840},
      cols: {num: 3, equalWidth: false, col: [{w: 9000, space: 0},
        {w: 9000, space: 0}, {w: 9000}]}}), {}));
    assert.deepEqual(p.cols.map((c) => c.w), [600, 600, 600]);
    assert.ok(inside(p));
    const q = pxOf(geomOf(sec({pgSz: {w: 12240, h: 15840},
      cols: {num: 2, equalWidth: false, col: [{w: 20000, space: 0},
        {w: 20000}]}}), {}));
    assert.ok(q.cols.every((c) => c.x === q.mar.left));
  });
  it('columns that fit are not moved', () => {
    const p = pxOf(geomOf(sec({cols: {num: 3, space: 720}}), {}));
    assert.ok(inside(p));
    assert.ok(Math.abs(p.cols[1].x - (96 + p.cols[0].w + 48)) < 1e-9);
  });
});

describe('SectGeom hostile', () => {
  it('w 0, h -1: no throw; text 80 px, page 200 px high', () => {
    const g = geomOf(sec({pgSz: {w: 0, h: -1}}), {});
    assert.equal(g.size.w, 0);
    assert.equal(g.textW, -2880);
    const p = pxOf(g);
    assert.equal(p.textW, 80);
    assert.equal(p.size.h, 200);
    assert.ok(p.size.w >= 80);
    assert.equal(p.cols[0].w, 80);
  });
  it('margins over the page: text width clamped to 80 px', () => {
    const g = geomOf(sec({pgMar: {left: 9000, right: 9000, top: 1e9,
      bottom: -1e9, gutter: 1e9}}), {});
    assert.ok(g.textW < 0);
    const p = pxOf(g);
    assert.equal(p.textW, 80);
    assert.equal(p.mar.left, 1000);
    assert.equal(p.mar.top, 1000);
    assert.equal(p.mar.bottom, 1000);
    assert.equal(p.exactBottom, true);
    for (const v of Object.values(p.mar)) assert.ok(Number.isFinite(v));
  });
  it('NaN, strings, __proto__ and absurd values: the defaults', () => {
    const g = geomOf(sec({pgSz: {w: NaN, h: '5'}, pgMar: {left: 'x',
      top: Infinity, header: null}, cols: {num: NaN, space: -5,
      col: '__proto__'}}), {gutterAtTop: 'yes'});
    assert.deepEqual(g.size, A4);
    assert.equal(g.mar.left, 1440);
    assert.equal(g.mar.top, 1440);
    assert.equal(g.mar.header, 720);
    assert.deepEqual(g.cols, [{x: 1440, w: 9026}]);
    const proto = JSON.parse('{"__proto__": {"w": 1}}');
    assert.doesNotThrow(() => pxOf(geomOf(sec({pgSz: proto,
      pgMar: proto, cols: proto}), {})));
  });
  it('cols num 45 on a narrow page: 45 columns, finite, no throw',
    () => {
      const g = geomOf(sec({pgSz: {w: 3000, h: 3000}, cols: {num: 45}}),
        {});
      assert.equal(g.cols.length, 45);
      assert.ok(g.cols[0].w < 0);
      const p = pxOf(g);
      assert.equal(p.cols.length, 45);
      for (const c of p.cols) {
        assert.equal(c.w, 80);
        assert.ok(Number.isFinite(c.x));
      }
      for (let i = 1; i < 45; i++) assert.ok(p.cols[i].x > p.cols[i - 1].x);
      // (a num past the reader's cap: capped, never more columns)
      assert.equal(geomOf(sec({cols: {num: 1e9}}), {}).cols.length, 45);
      assert.equal(geomOf(sec({cols: {num: 2, equalWidth: false,
        col: new Array(100).fill({w: 10})}}), {}).cols.length, 45);
    });
  it('a negative gutter counts as none (P1 fix M6)', () => {
    for (const gutter of [-720, -1e9, -1]) {
      const g = geomOf(sec({pgMar: {left: 1440, right: 1440, gutter}}));
      assert.equal(g.mar.gutter, 0, String(gutter));
      assert.equal(g.mar.left, 1440);
      assert.equal(g.textW, 9026);
      const t = geomOf(sec({pgMar: {top: 1440, gutter}}),
        {gutterAtTop: true});
      assert.equal(t.mar.top, 1440);
    }
  });
  it('orient other than portrait or landscape: only w and h count',
    () => {
      for (const orient of ['sideways', '__proto__', '', 'landscape',
        'portrait', 42]) {
        const g = geomOf(sec({pgSz: {w: 15840, h: 12240, orient}}));
        assert.deepEqual(g.size, {w: 15840, h: 12240}, String(orient));
        assert.equal(g.textW, 15840 - 2880);
      }
    });
  it('the input is not changed (deep-frozen)', () => {
    const s = sec({pgSz: {w: 12240, h: 15840}, pgMar: {left: 1440,
      gutter: 360}, cols: {num: 2, equalWidth: false, col: [{w: 4000,
      space: 300}, {w: 4000}]}, extra: [el('w:rtlGutter')]});
    const freeze = (o) => {
      if (o && typeof o === 'object') {
        Object.values(o).forEach(freeze);
        Object.freeze(o);
      }
      return o;
    };
    freeze(s);
    assert.doesNotThrow(() => pxOf(geomOf(s, {gutterAtTop: false},
      freeze(sec()))));
  });
});

describe('SectWidth.columnTw with the document (P1 fix M1)', () => {
  const G = {pgMar: {left: 1440, right: 1440, gutter: 720}};
  const set = (inner) => ({rawSettings: parseXml(
    `<w:settings xmlns:w="${W}">${inner}</w:settings>`).root});
  it('gutterAtTop on: the gutter is not taken off the width', () => {
    assert.equal(columnTw(G, set('<w:gutterAtTop/>')), 9026);
    assert.equal(columnTw(G, set('<w:gutterAtTop w:val="off"/>')),
      9026 - 720);
    assert.equal(columnTw(G, set('')), 9026 - 720);
    assert.equal(columnTw(G, null), 9026 - 720);
    assert.equal(columnTw(G, {}), 9026 - 720);
  });
});

describe('SectWidth.columnTw through geomOf', () => {
  it('the same widths as before, a gutter now taken off', () => {
    assert.equal(columnTw({}), 9026);
    assert.equal(columnTw({cols: {num: 2, space: 720}}), 4153);
    assert.equal(columnTw({cols: {num: 3}}), (9026 - 1440) / 3);
    assert.ok(columnTw({pgSz: {w: 100}}) < 0);
    assert.equal(columnTw({pgMar: {left: 1440, right: 1440,
      gutter: 720}}), 9026 - 720);
    assert.equal(columnTw({cols: {num: 2, equalWidth: false, col: [
      {w: 2000, space: 500}, {w: 6526}]}}), 2000);
  });
});
