// WrapCmd (Batch D P12.4, D28): Format > Wrap text > on the selected
// picture. In line -> an anchor with Word's defaults (column offset
// = the picture's x, paragraph offset its line's: P12a fix M3,
// distL/R 114300,
// relativeHeight the document's largest + 1, layoutInCell and
// allowOverlap 1, simplePos 0 0, Tight's rectangle polygon); an
// anchor -> in line keeps docPr, extent, graphic and alt; between
// wraps only the wrap element (and behindDoc) changes. Each change
// one undo step, written in schema order (xmllint clean when the
// schemas are there); anchors not understood refused.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {wrapCmd, kindOf, maxZ, placeOf, KINDS}
  from '../../tools/moreapps/!Letters/WrapCmd';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {selectedPic} from '../../tools/moreapps/!Letters/PicFind';
import {tm, loadStyles} from './word-docs.mjs';
import {pictureOf, docMap} from '../../tools/moreapps/!Letters/PicRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {select, caret} from '../../tools/moreapps/!Letters/Selection';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';
import {write, schema} from './roundtrip-lib.mjs';

const {xsd, note} = schema();
const dec = new TextDecoder();
const Z = 251659264;            // the fixtures' relativeHeight
const UNKNOWN = drawingXml({kind: 'anchor', id: 4, embed: 'rId11',
  decl: false}).replace('simplePos="0"', 'simplePos="1"');
let bytes;
before(loadStyles);
before(async () => {
  bytes = await picDocx({pics: [{id: 1, descr: 'one'},
    {kind: 'anchor', id: 2, descr: 'two'}, {kind: 'anchor', id: 3}],
  body: p('<w:r>' + UNKNOWN + '</w:r>') + p(r('Text.'))});
});

const load = async () => new Document(await readDocx(bytes));
const para = (d, k) => d.doc.sections[0].blocks[k];
const picSel = (d, k) => select({id: para(d, k).id, off: 0},
  {id: para(d, k).id, off: 1});
const info = (d, k) => pictureOf(para(d, k).inlines[0].node,
  docMap(d.doc));
const frame = (d, k) => para(d, k).inlines[0].node.children
  .find((c) => typeof c === 'object');

/** The w:drawing XML of each paragraph as written (and the schema's
 *  messages for the main part). */
async function written(d) {
  const z = await readZip(await write(d.doc));
  const main = z.get('word/document.xml');
  const errs = xsd ? [...xsd.errors(main)] : [];
  return {draw: dec.decode(main).match(/<w:drawing>.*?<\/w:drawing>/g),
    errs};
}

const HEAD = (z, x, behind = 0) => '<w:drawing><wp:anchor distT="0" ' +
  'distB="0" distL="114300" distR="114300" simplePos="0" ' +
  `relativeHeight="${z}" behindDoc="${behind}" locked="0" ` +
  'layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
  '<wp:positionH relativeFrom="column"><wp:posOffset>' + x +
  '</wp:posOffset></wp:positionH><wp:positionV ' +
  'relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset>' +
  '</wp:positionV><wp:extent cx="914400" cy="457200"/>' +
  '<wp:effectExtent l="0" t="0" r="0" b="0"/>';
const POLY = '<wp:wrapPolygon edited="0"><wp:start x="0" y="0"/>' +
  '<wp:lineTo x="0" y="21600"/><wp:lineTo x="21600" y="21600"/>' +
  '<wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/>' +
  '</wp:wrapPolygon>';
const WRAP = {square: '<wp:wrapSquare wrapText="bothSides"/>',
  tight: '<wp:wrapTight wrapText="bothSides">' + POLY +
    '</wp:wrapTight>',
  topBottom: '<wp:wrapTopAndBottom/>', behind: '<wp:wrapNone/>',
  inFront: '<wp:wrapNone/>'};
/** What follows the wrap in a picture: docPr .. the frame's end. */
const tail = (s) => s.slice(s.indexOf('<wp:docPr'))
  .replace(/<\/wp:(inline|anchor)><\/w:drawing>$/, '');

describe('WrapCmd', () => {
  it('kindOf: inline, each wrap, unknown', async () => {
    const d = await load();
    assert.equal(kindOf(info(d, 0)), 'inline');
    assert.equal(kindOf(info(d, 1)), 'square');
    assert.equal(kindOf(info(d, 3)), null);
    assert.equal(kindOf(null), null);
    assert.deepEqual([...KINDS], ['inline', 'square', 'tight',
      'topBottom', 'behind', 'inFront']);
  });

  for (const kind of ['square', 'tight', 'topBottom', 'behind',
    'inFront']) {
    it(`in line -> ${kind}: Word's defaults, schema order, one step`,
      async () => {
        const d = await load();
        const was = await written(d);
        const s = structuredClone(d.doc.sections);
        const sel = wrapCmd(d, picSel(d, 0), kind, {x: 914400});
        assert.equal(d.undoDepth, 1);
        const id = para(d, 0).id;
        assert.deepEqual([sel.anchor, sel.head], [{id, off: 0},
          {id, off: 1}]);
        const now = await written(d);
        assert.equal(now.draw[0], HEAD(Z + 1, 914400,
          kind === 'behind' ? 1 : 0) + WRAP[kind] + tail(was.draw[0]) +
          '</wp:anchor></w:drawing>');
        assert.deepEqual(now.draw.slice(1), was.draw.slice(1));
        assert.deepEqual(now.errs, was.errs, 'no new schema message');
        const a = info(d, 0).anchor;
        assert.equal(a.unknown, false);
        assert.equal(kindOf(info(d, 0)), kind);
        assert.deepEqual(a.posH, {from: 'column', offset: 914400});
        assert.deepEqual(a.posV, {from: 'paragraph', offset: 0});
        assert.deepEqual(a.wrap.dist, {t: 0, b: 0, l: 114300,
          r: 114300});
        assert.equal(a.relativeHeight, Z + 1);
        assert.equal(a.layoutInCell && a.allowOverlap, true);
        assert.equal(info(d, 0).alt, 'one');
        d.undo();
        assert.ok(deepEqual(d.doc.sections, s));
      });
  }

  it('the schema check ran', {skip: note || false}, async () => {
    const d = await load();
    for (const k of ['square', 'tight', 'topBottom', 'behind']) {
      wrapCmd(d, picSel(d, 0), k, {x: 0});
      wrapCmd(d, picSel(d, 1), k);
    }
    wrapCmd(d, picSel(d, 2), 'inline');
    assert.deepEqual((await written(d)).errs, []);
  });

  it('anchor -> in line: docPr, extent, effectExtent, graphic kept',
    async () => {
      const d = await load();
      const was = await written(d), f = frame(d, 1);
      wrapCmd(d, picSel(d, 1), 'inline');
      assert.equal(d.undoDepth, 1);
      const now = await written(d);
      assert.equal(now.draw[1], '<w:drawing><wp:inline distT="0" ' +
        'distB="0" distL="0" distR="0"><wp:extent cx="914400" ' +
        'cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
        tail(was.draw[1]) + '</wp:inline></w:drawing>');
      const g = frame(d, 1);
      for (const k of [3, 4, 6, 7, 8]) {
        assert.ok(g.children.some((c) => deepEqual(c, f.children[k])),
          String(k));
      }
      assert.equal(info(d, 1).floating, false);
      assert.equal(info(d, 1).alt, 'two');
      assert.equal(info(d, 1).docPrId, 2);
    });

  it('anchor -> inline -> anchor keeps the docPr id and alt',
    async () => {
      const d = await load();
      wrapCmd(d, picSel(d, 1), 'inline');
      wrapCmd(d, picSel(d, 1), 'tight', {x: 19050});
      assert.equal(d.undoDepth, 2);
      const x = info(d, 1);
      assert.equal(x.docPrId, 2);
      assert.equal(x.alt, 'two');
      assert.equal(x.anchor.wrap.kind, 'tight');
      assert.equal(x.anchor.relativeHeight, Z + 1);
      const back = await readDocx(await write(d.doc));
      const y = pictureOf(back.sections[0].blocks[1].inlines[0].node,
        docMap(back));
      assert.equal(y.docPrId, 2);
      assert.equal(y.alt, 'two');
      assert.equal(y.anchor.unknown, false);
      assert.deepEqual(y.anchor.wrap.polygon.points, [[0, 0],
        [0, 21600], [21600, 21600], [21600, 0], [0, 0]]);
    });

  it('between wraps only the wrap element and behindDoc change',
    async () => {
      const d = await load();
      const f = frame(d, 1);
      const wi = f.children.findIndex((c) => /wrapSquare/.test(c.name));
      for (const [k, el, behind] of [['tight', 'wrapTight', '0'],
        ['behind', 'wrapNone', '1'], ['inFront', 'wrapNone', '0'],
        ['topBottom', 'wrapTopAndBottom', '0'],
        ['square', 'wrapSquare', '0']]) {
        const n = d.undoDepth;
        wrapCmd(d, picSel(d, 1), k);
        assert.equal(d.undoDepth, n + 1, k + ': one step');
        const g = frame(d, 1);
        assert.equal(g.children.length, f.children.length);
        g.children.forEach((c, i) => {
          if (i === wi) assert.equal(c.name, 'wp:' + el);
          else assert.deepEqual(c, f.children[i], k + ' child ' + i);
        });
        assert.deepEqual(g.attrs, f.attrs.map(([a, v]) =>
          [a, a === 'behindDoc' ? behind : v]), k);
        assert.equal(kindOf(info(d, 1)), k);
      }
    });

  it('the same wrap again: no step, the selection back', async () => {
    const d = await load();
    const s0 = picSel(d, 0), s1 = picSel(d, 1);
    assert.equal(wrapCmd(d, s0, 'inline'), s0);
    assert.equal(wrapCmd(d, s1, 'square'), s1);
    assert.equal(d.undoDepth, 0);
  });

  it('refused (null, nothing changed): an anchor not understood, ' +
    'no picture, a kind not known', async () => {
    const d = await load();
    const s = structuredClone(d.doc.sections);
    const t = para(d, 4).id;
    assert.equal(info(d, 3).anchor.unknown, true);
    for (const k of KINDS) assert.equal(wrapCmd(d, picSel(d, 3), k), null);
    for (const sel of [null, caret({id: t, off: 0}),
      select({id: t, off: 0}, {id: t, off: 2}),
      select({id: 99999, off: 0}, {id: 99999, off: 1})]) {
      assert.equal(wrapCmd(d, sel, 'square'), null);
    }
    for (const k of ['', 'through', 'none', '__proto__', 'toString',
      null, undefined, 1]) {
      assert.equal(wrapCmd(d, picSel(d, 0), k), null, String(k));
    }
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(d.doc.sections, s));
  });

  it('x: rounded, kept in posOffset\'s range, 0 when not a number',
    async () => {
      for (const [x, want] of [[NaN, 0], [undefined, 0], [-5.4, -5],
        [1e12, 2147483647], [-1e12, -2147483648], ['12', 0],
        [Infinity, 0]]) {
        const d = await load();
        wrapCmd(d, picSel(d, 0), 'square', {x});
        assert.equal(info(d, 0).anchor.posH.offset, want, String(x));
      }
    });

  it('y (P12a fix M3): the paragraph offset, rounded and kept in ' +
    'range like x', async () => {
      for (const [y, want] of [[381000, 381000], [-5.4, -5],
        [1e12, 2147483647], [NaN, 0], [undefined, 0]]) {
        const d = await load();
        wrapCmd(d, picSel(d, 0), 'square', {x: 0, y});
        assert.equal(info(d, 0).anchor.posV.offset, want, String(y));
        assert.equal(info(d, 0).anchor.posV.from, 'paragraph');
      }
    });

  it('placeOf (P12a fix M3): a picture in line 3 made floating where ' +
    'it was, its line\'s offset in its paragraph', async () => {
      const words = Array.from({length: 40}, () => 'word').join(' ');
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r(words + ' ') + '<w:r>' + drawingXml({id: 1}) +
          '</w:r>'))}));
      const L = new DocLayout(doc, tm(), null);
      L.layout(1000);
      const it = L.items.find((x) => x.lines.some((ln) =>
        ln.items.some((t) => t.kind === 'pic')));
      const k = it.lines.findIndex((ln) => ln.items.some((t) =>
        t.kind === 'pic'));
      assert.ok(k >= 1, `the picture on line ${k}`);
      const off = it.lines[k].items.find((t) => t.kind === 'pic').from;
      const f = selectedPic(L, select({id: it.id, off},
        {id: it.id, off: off + 1}));
      const ln = it.lines[k], pic = f.item.pic;
      assert.deepEqual(placeOf(f), {x: Math.round(f.item.x * 9525),
        y: Math.round((ln.y + ln.base - pic.h) * 9525)});
      assert.ok(placeOf(f).y > 0);
    });

  it('relativeHeight: the largest in the document + 1, at most ' +
    '4294967295', async () => {
    const d = await load();
    assert.equal(maxZ(d.doc), Z);
    const hi = await picDocx({pics: [{id: 1}, {kind: 'anchor', id: 2}]});
    const big = new Document(await readDocx(new Uint8Array(hi)));
    assert.equal(maxZ(big.doc), Z);
    const top = (v) => picDocx({pics: [{id: 1}], body: p('<w:r>' +
      drawingXml({kind: 'anchor', id: 2, embed: 'rId11', decl: false})
        .replace(String(Z), v) + '</w:r>')});
    for (const [v, want] of [['4294967294', 4294967295],
      ['4294967295', 4294967295], ['99999999999', 1], ['-3', 1],
      ['0', 1]]) {
      const e = new Document(await readDocx(await top(v)));
      wrapCmd(e, picSel(e, 0), 'inFront');
      assert.equal(info(e, 0).anchor.relativeHeight, want, v);
    }
  });
});
