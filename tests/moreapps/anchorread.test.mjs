// AnchorRead: what a floating picture's wp:anchor says (Batch D
// P12.1, D25). Pure: positions, wrap, flags; anything not understood
// -> unknown: true (shown inline as today). The corpus part is gated
// like the other corpus tests (tests/moreapps/corpus, optional).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {anchorOf, H_FROM, V_FROM, H_ALIGN, V_ALIGN, WRAP_TEXT,
  MAX_POINTS, MAX_OFFSET, MIN_OFFSET, MAX_UINT}
  from '../../tools/moreapps/!Letters/AnchorRead';
import {pictureOf, docMap} from '../../tools/moreapps/!Letters/PicRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {mapNamespaces} from '../../tools/moreapps/!Letters/NsMap';
import {rootScope, scope, isEl} from '../../tools/moreapps/!Letters/Ns';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {drawingXml, picDocx, URIS} from './pic-fixtures.mjs';
import {madeByWord} from './pagestarts.mjs';
import {corpusFiles, nameOf, SKIP_CORPUS, ALL}
  from './roundtrip-lib.mjs';

const WP14 =
  'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing';
const MC =
  'http://schemas.openxmlformats.org/markup-compatibility/2006';

const DEF = {distT: 0, distB: 0, distL: 114300, distR: 114300,
  simplePos: 0, relativeHeight: 251659264, behindDoc: 0, locked: 0,
  layoutInCell: 1, allowOverlap: 1};

const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined)
  .map(([k, v]) => ` ${k}="${v}"`).join('');
const pos = (hv, from, inner) => `<wp:position${hv}` +
  (from === undefined ? '' : ` relativeFrom="${from}"`) + `>${inner}` +
  `</wp:position${hv}>`;
const off = (n) => `<wp:posOffset>${n}</wp:posOffset>`;
const al = (s) => `<wp:align>${s}</wp:align>`;
const H = (from, inner = off(0)) => pos('H', from, inner);
const V = (from, inner = off(0)) => pos('V', from, inner);
const SQUARE = '<wp:wrapSquare wrapText="bothSides"/>';

/** One wp:anchor element (Word's order), parts replaceable. */
function anchorXml({at = {}, simple = '<wp:simplePos x="0" y="0"/>',
  posH = H('column'), posV = V('paragraph'), wrap = SQUARE,
  effect = '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
  extra = '', head = ''} = {}) {
  return `<wp:anchor xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}"` +
    ` xmlns:wp14="${WP14}" xmlns:mc="${MC}"` +
    attrs({...DEF, ...at}) + '>' + head + simple + posH + posV +
    '<wp:extent cx="914400" cy="457200"/>' + effect + wrap +
    '<wp:docPr id="1" name="Picture 1"/><wp:cNvGraphicFramePr/>' +
    '<a:graphic/>' + extra + '</wp:anchor>';
}

const node = (xml) => parseXml(xml).root;
const read = (o) => anchorOf(node(anchorXml(o)));
const known = (o) => {
  const x = read(o);
  assert.equal(x.unknown, false, JSON.stringify(x));
  return x;
};
const unknown = (o, why) => assert.equal(read(o).unknown, true, why);

const DEFAULT = {
  simplePos: {on: false, x: 0, y: 0},
  posH: {from: 'column', offset: 0},
  posV: {from: 'paragraph', offset: 0},
  wrap: {kind: 'square', text: 'bothSides',
    dist: {t: 0, b: 0, l: 114300, r: 114300}},
  behindDoc: false, allowOverlap: true, layoutInCell: true,
  locked: false, relativeHeight: 251659264,
  effectExtent: {l: 0, t: 0, r: 0, b: 0}, unknown: false,
};

describe('AnchorRead', () => {
  it('constants', () => {
    assert.deepEqual(H_FROM, ['character', 'column', 'margin', 'page',
      'insideMargin', 'outsideMargin', 'leftMargin', 'rightMargin']);
    assert.deepEqual(V_FROM, ['line', 'paragraph', 'margin', 'page',
      'topMargin', 'bottomMargin']);
    assert.deepEqual(H_ALIGN, ['left', 'center', 'right', 'inside',
      'outside']);
    assert.deepEqual(V_ALIGN, ['top', 'center', 'bottom', 'inside',
      'outside']);
    assert.deepEqual(WRAP_TEXT, ['bothSides', 'left', 'right',
      'largest']);
    assert.equal(MAX_POINTS, 4096);
    assert.equal(MAX_OFFSET, 2147483647);
    assert.equal(MIN_OFFSET, -2147483648);
    assert.equal(MAX_UINT, 4294967295);
  });

  it('Word\'s anchor: every field', () => {
    assert.deepEqual(read(), DEFAULT);
  });

  it('pictureOf: anchor for wp:anchor, none for wp:inline', () => {
    const f = pictureOf(node(drawingXml({kind: 'anchor', id: 3})));
    assert.deepEqual(f.anchor, DEFAULT);
    assert.ok(Object.isFrozen(f.anchor));
    const i = pictureOf(node(drawingXml({id: 3})));
    assert.equal('anchor' in i, false);
  });

  it('every relativeFrom of D25', () => {
    for (const from of H_FROM) {
      assert.equal(known({posH: H(from)}).posH.from, from);
    }
    for (const from of V_FROM) {
      assert.equal(known({posV: V(from)}).posV.from, from);
    }
    for (const bad of ['', 'Column', 'line', 'bogus', '__proto__']) {
      unknown({posH: H(bad)}, 'H ' + bad);
    }
    for (const bad of ['insideMargin', 'outsideMargin', 'column', '']) {
      unknown({posV: V(bad)}, 'V ' + bad);
    }
    unknown({posH: H(undefined)}, 'no relativeFrom');
    unknown({posH: ''}, 'no positionH');
    unknown({posV: ''}, 'no positionV');
    unknown({posH: H('page') + H('page')}, 'two positionH');
  });

  it('every align of D25', () => {
    for (const a of H_ALIGN) {
      assert.deepEqual(known({posH: H('margin', al(a))}).posH,
        {from: 'margin', align: a});
    }
    for (const a of V_ALIGN) {
      assert.deepEqual(known({posV: V('page', al(a))}).posV,
        {from: 'page', align: a});
    }
    unknown({posH: H('page', al('top'))}, 'H top');
    unknown({posV: V('page', al('left'))}, 'V left');
    unknown({posH: H('page', al('middle'))}, 'middle');
    unknown({posH: H('page', al(''))}, 'empty');
    unknown({posH: H('page', al('left') + off(5))}, 'align + offset');
    unknown({posH: H('page', '')}, 'neither');
    unknown({posH: H('page', al('left') + al('left'))}, 'two aligns');
  });

  it('posOffset in EMU, signed 32-bit', () => {
    assert.equal(known({posH: H('page', off(914400))}).posH.offset,
      914400);
    assert.equal(known({posV: V('page', off(-457200))}).posV.offset,
      -457200);
    assert.equal(known({posH: H('page', off(MAX_OFFSET))}).posH.offset,
      MAX_OFFSET);
    assert.equal(known({posH: H('page', off(MIN_OFFSET))}).posH.offset,
      MIN_OFFSET);
    assert.equal(known({posH: H('page', off('-0'))}).posH.offset, 0);
    for (const bad of [MAX_OFFSET + 1, MIN_OFFSET - 1, '1e9', '1.5',
      '', 'NaN', ' 5', '+5', '99999999999999999999', '0x10']) {
      unknown({posH: H('page', off(bad))}, 'offset ' + bad);
    }
  });

  it('wp14:pctPosHOffset kept, not used', () => {
    const ac = (hv, pct, fb) => '<mc:AlternateContent>' +
      '<mc:Choice Requires="wp14">' + pos(hv, 'page',
        `<wp14:pctPos${hv}Offset>${pct}</wp14:pctPos${hv}Offset>`) +
      '</mc:Choice><mc:Fallback>' + pos(hv, 'page', fb) +
      '</mc:Fallback></mc:AlternateContent>';
    const x = known({posH: ac('H', '45500', off(3429000)),
      posV: ac('V', '2.5%', al('top'))});
    assert.deepEqual(x.posH, {from: 'page', offset: 3429000,
      pct: '45500'});
    assert.deepEqual(x.posV, {from: 'page', align: 'top', pct: '2.5%'});
    // directly in positionH, with no align or offset: not placeable
    const y = read({posH: H('page',
      '<wp14:pctPosHOffset>40000</wp14:pctPosHOffset>')});
    assert.equal(y.unknown, true);
    assert.equal(y.posH.pct, '40000');
    // an AlternateContent of another shape
    unknown({posH: '<mc:AlternateContent><mc:Choice Requires="x">' +
      '<wp:foo/></mc:Choice></mc:AlternateContent>'}, 'other AC');
    unknown({posH: '<mc:AlternateContent></mc:AlternateContent>'},
      'empty AC');
    // choice only, with an offset of its own: used
    assert.deepEqual(known({posH: '<mc:AlternateContent>' +
      '<mc:Choice Requires="wp14">' + H('page', off(7)) +
      '</mc:Choice></mc:AlternateContent>'}).posH,
      {from: 'page', offset: 7});
  });

  it('wrap kinds with dist', () => {
    const none = known({wrap: '<wp:wrapNone/>'});
    assert.deepEqual(none.wrap, {kind: 'none', text: null,
      dist: {t: 0, b: 0, l: 114300, r: 114300}});
    assert.equal(none.behindDoc, false);
    const behind = known({wrap: '<wp:wrapNone/>', at: {behindDoc: 1}});
    assert.equal(behind.behindDoc, true);
    for (const t of WRAP_TEXT) {
      assert.equal(known({wrap: `<wp:wrapSquare wrapText="${t}"/>`})
        .wrap.text, t);
    }
    const tb = known({wrap: '<wp:wrapTopAndBottom/>',
      at: {distT: 12700, distB: 25400}});
    assert.deepEqual(tb.wrap, {kind: 'topAndBottom', text: null,
      dist: {t: 12700, b: 25400, l: 114300, r: 114300}});
    // the wrap element's own distances win over the anchor's
    const sq = known({wrap: '<wp:wrapSquare wrapText="left" ' +
      'distT="1" distB="2" distL="3" distR="4"/>'});
    assert.deepEqual(sq.wrap.dist, {t: 1, b: 2, l: 3, r: 4});
    const tb2 = known({wrap: '<wp:wrapTopAndBottom distT="9"/>'});
    assert.deepEqual(tb2.wrap.dist, {t: 9, b: 0, l: 114300, r: 114300});
    // absent distances are 0
    const z = known({at: {distT: undefined, distL: undefined}});
    assert.deepEqual(z.wrap.dist, {t: 0, b: 0, l: 0, r: 114300});
    assert.equal(known({at: {distT: MAX_UINT}}).wrap.dist.t, MAX_UINT);
    for (const bad of [-1, MAX_UINT + 1, 'x', '1.5', '']) {
      unknown({at: {distL: bad}}, 'distL ' + bad);
    }
    unknown({wrap: '<wp:wrapSquare wrapText="left" distR="-5"/>'});
  });

  it('wrapText and wrap element errors', () => {
    unknown({wrap: '<wp:wrapSquare/>'}, 'no wrapText');
    unknown({wrap: '<wp:wrapSquare wrapText="both"/>'}, 'bad');
    unknown({wrap: ''}, 'no wrap');
    unknown({wrap: SQUARE + '<wp:wrapNone/>'}, 'two wraps');
    unknown({wrap: '<wp:wrapNone>x</wp:wrapNone>'}, 'text in wrap');
    unknown({wrap: '<wp:wrapNone><wp:foo/></wp:wrapNone>'}, 'child');
    unknown({wrap: '<wp:wrapBogus/>'}, 'unknown wrap');
    unknown({wrap: '<wp:wrapSquare wrapText="left" foo="1"/>'},
      'unknown wrap attribute');
    const ee = '<wp:wrapSquare wrapText="left"><wp:effectExtent ' +
      'l="0" t="0" r="0" b="0"/></wp:wrapSquare>';
    assert.equal(known({wrap: ee}).wrap.kind, 'square');
  });

  it('Tight and Through: the polygon', () => {
    const poly = (pts, edited = '0') => `<wp:wrapPolygon ` +
      `edited="${edited}"><wp:start x="${pts[0][0]}" ` +
      `y="${pts[0][1]}"/>` + pts.slice(1).map(([x, y]) =>
        `<wp:lineTo x="${x}" y="${y}"/>`).join('') + '</wp:wrapPolygon>';
    const sq = [[0, 0], [0, 21600], [21600, 21600], [21600, 0], [0, 0]];
    for (const k of ['Tight', 'Through']) {
      const x = known({wrap: `<wp:wrap${k} wrapText="bothSides" ` +
        `distL="114300" distR="114300">${poly(sq)}</wp:wrap${k}>`});
      assert.deepEqual(x.wrap, {kind: k.toLowerCase(),
        text: 'bothSides', dist: {t: 0, b: 0, l: 114300, r: 114300},
        polygon: {edited: false, points: sq}});
    }
    const e = known({wrap: '<wp:wrapTight wrapText="left">' +
      poly([[-5, 3], [7, 8], [9, -10]], '1') + '</wp:wrapTight>'});
    assert.deepEqual(e.wrap.polygon, {edited: true,
      points: [[-5, 3], [7, 8], [9, -10]]});
    assert.equal(known({wrap: '<wp:wrapTight wrapText="left">' +
      poly([[0, 0], [1, 1], [2, 2]]).replace(' edited="0"', '') +
      '</wp:wrapTight>'}).wrap.polygon.edited, false);
    unknown({wrap: '<wp:wrapTight wrapText="left"/>'}, 'no polygon');
    unknown({wrap: '<wp:wrapTight wrapText="left">' +
      poly([[0, 0], [1, 1]]) + '</wp:wrapTight>'}, 'one lineTo');
    unknown({wrap: '<wp:wrapTight wrapText="left">' +
      poly([[0, 0], [1, 'x'], [2, 2]]) + '</wp:wrapTight>'}, 'bad y');
    unknown({wrap: '<wp:wrapTight wrapText="left">' +
      poly([[0, 0], [1, 1], [2, 2]], 'maybe') + '</wp:wrapTight>'},
    'bad edited');
    unknown({wrap: '<wp:wrapTight wrapText="left">' +
      '<wp:wrapPolygon><wp:lineTo x="0" y="0"/><wp:lineTo x="1" ' +
      'y="1"/><wp:start x="0" y="0"/></wp:wrapPolygon></wp:wrapTight>'},
    'start not first');
    // the cap: MAX_POINTS points read, one more not understood
    const many = (n) => Array.from({length: n}, (_, i) => [i, i]);
    assert.equal(known({wrap: '<wp:wrapTight wrapText="left">' +
      poly(many(MAX_POINTS)) + '</wp:wrapTight>'}).wrap.polygon
      .points.length, MAX_POINTS);
    unknown({wrap: '<wp:wrapTight wrapText="left">' +
      poly(many(MAX_POINTS + 1)) + '</wp:wrapTight>'}, 'past the cap');
  });

  it('flags', () => {
    for (const [v, b] of [['1', true], ['0', false], ['true', true],
      ['false', false]]) {
      const x = known({at: {behindDoc: v, locked: v, layoutInCell: v,
        allowOverlap: v}});
      assert.equal(x.behindDoc, b);
      assert.equal(x.locked, b);
      assert.equal(x.layoutInCell, b);
      assert.equal(x.allowOverlap, b);
    }
    const absent = known({at: {behindDoc: undefined, locked: undefined,
      layoutInCell: undefined, allowOverlap: undefined}});
    assert.equal(absent.behindDoc, false);
    assert.equal(absent.allowOverlap, false);
    for (const bad of ['on', 'yes', '2', '', 'True']) {
      unknown({at: {allowOverlap: bad}}, 'allowOverlap ' + bad);
    }
    unknown({at: {hidden: 1}}, 'hidden');
    assert.equal(known({at: {hidden: 0}}).unknown, false);
  });

  it('relativeHeight', () => {
    assert.equal(known({at: {relativeHeight: 0}}).relativeHeight, 0);
    assert.equal(known({at: {relativeHeight: MAX_UINT}})
      .relativeHeight, MAX_UINT);
    assert.equal(known({at: {relativeHeight: undefined}})
      .relativeHeight, 0);
    for (const bad of [MAX_UINT + 1, -1, 'NaN', '1e3']) {
      unknown({at: {relativeHeight: bad}}, 'relativeHeight ' + bad);
    }
  });

  it('simplePos', () => {
    const x = known({simple: '<wp:simplePos x="5486400" y="-8229600"/>'});
    assert.deepEqual(x.simplePos, {on: false, x: 5486400, y: -8229600});
    const on = read({at: {simplePos: 1}});
    assert.equal(on.unknown, true, 'simplePos used: not placed');
    assert.equal(on.simplePos.on, true);
    assert.deepEqual(known({simple: ''}).simplePos,
      {on: false, x: 0, y: 0});
    unknown({simple: '<wp:simplePos x="1in" y="0"/>'}, 'units');
    unknown({at: {simplePos: 'x'}}, 'bad simplePos flag');
  });

  it('effectExtent', () => {
    assert.deepEqual(known({effect: '<wp:effectExtent l="1" t="-2" ' +
      'r="3" b="4"/>'}).effectExtent, {l: 1, t: -2, r: 3, b: 4});
    assert.deepEqual(known({effect: ''}).effectExtent,
      {l: 0, t: 0, r: 0, b: 0});
    unknown({effect: '<wp:effectExtent l="x" t="0" r="0" b="0"/>'});
    unknown({effect: '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>'}, 'two');
  });

  it('anything else not understood', () => {
    unknown({extra: '<wp:foo/>'}, 'unknown child');
    unknown({extra: '<x:foo xmlns:x="urn:x"/>'}, 'foreign child');
    unknown({extra: 'text'}, 'text');
    unknown({at: {foo: 1}}, 'unknown attribute');
    unknown({at: {'x:foo': 1}}, 'foreign attribute');
    assert.equal(known({at: {'wp14:anchorId': '1A2B3C4D',
      'wp14:editId': '5E6F7A8B'}}).unknown, false);
    assert.equal(known({extra: '<wp14:sizeRelH relativeFrom="page">' +
      '<wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH>' +
      '<wp14:sizeRelV relativeFrom="page"><wp14:pctHeight>0' +
      '</wp14:pctHeight></wp14:sizeRelV>'}).unknown, false);
    assert.equal(known({extra: '<!-- c -->'}).unknown, false);
    unknown({posH: H('page', off(0) + '<wp:foo/>')}, 'child in pos');
    unknown({posH: H('page', 'x' + off(0))}, 'text in pos');
  });

  it('hostile input never throws', () => {
    for (const n of [null, undefined, 5, 'x', {}, {name: 'wp:anchor'},
      {name: 'wp:anchor', attrs: [], children: null},
      {name: 'w:p', attrs: [], children: []}]) {
      const x = anchorOf(n);
      assert.equal(x.unknown, true);
    }
    const proto = anchorOf(node(anchorXml().replace('<wp:anchor ',
      '<wp:anchor __proto__="1" ')));
    assert.equal(proto.unknown, true);
    assert.equal(Object.getPrototypeOf(proto), Object.prototype);
    assert.equal(read({posH: H('__proto__')}).unknown, true);
    assert.equal(read({posH: H('page', al('__proto__'))}).unknown, true);
    assert.equal(read({wrap: '<wp:wrapSquare wrapText="__proto__"/>'})
      .unknown, true);
    assert.equal(read({wrap: '<wp:wrapSquare wrapText="constructor"/>'})
      .unknown, true);
  });

  it('frozen and cached per node', () => {
    const n = node(anchorXml());
    const x = anchorOf(n);
    assert.equal(anchorOf(n), x);
    assert.ok(Object.isFrozen(x));
    assert.ok(Object.isFrozen(x.posH));
    assert.ok(Object.isFrozen(x.wrap.dist));
    assert.ok(Object.isFrozen(x.effectExtent));
  });

  it('Strict document: read through pictureOf', async () => {
    const doc = await readDocx(await picDocx({strict: true,
      pics: [{id: 4, kind: 'anchor'}]}));
    const para = doc.sections[0].blocks[0];
    const x = pictureOf(para.inlines[0].node, docMap(doc));
    assert.deepEqual(x.anchor, DEFAULT);
  });
});

// The corpus: every wp:anchor of every body, header and footer part
// read with no throw; counts by wrap kind printed and (every file)
// held within 2 each to the counts of the corpus without the
// hand-off folder (final fix B): None-in-front 51, Square 24,
// None-behind 13, TopAndBottom 16 (with the Batch B hand-off files
// they were the spec's regex counts, 66 / 30 / 16 / 16).
const SPEC = {front: 51, square: 24, behind: 13, topAndBottom: 16,
  tight: 0, through: 0};
// hermetic, as the page-start pin (P5.3): the git-ignored hand-off
// files our generators wrote (corpus/handoff) are not counted, so
// which of them a machine has does not move the counts (final fix B:
// Batch D's cl-* and hf-2 files added 12 square anchors)
const files = corpusFiles().filter(madeByWord);

describe('anchor corpus', {skip: files.length ? false : SKIP_CORPUS},
  () => {
    it('every anchor reads; counts by wrap kind', async () => {
      const n = {files: 0, anchors: 0, unknown: 0, front: 0, square: 0,
        behind: 0, topAndBottom: 0, tight: 0, through: 0, pictures: 0,
        picUnknown: 0};
      const PART = /^word\/(document|header\d*|footer\d*)\.xml$/;
      const dec = new TextDecoder();
      for (const f of files) {
        let z;
        try {
          z = await readZip(readFileSync(f));
        } catch {
          continue;
        }
        n.files++;
        for (const [p, b] of z) {
          if (!PART.test(p)) continue;
          let root;
          try {
            root = parseXml(dec.decode(b)).root;
          } catch {
            continue;
          }
          mapNamespaces(root, 'toTransitional');
          const walk = (el, m) => {
            const s = el.attrs.length ? scope(m, el) : m;
            const i = el.name.indexOf(':');
            const uri = s.get(i < 0 ? '' : el.name.slice(0, i));
            if (uri === URIS.wp && el.name.slice(i + 1) === 'anchor') {
              let x;
              assert.doesNotThrow(() => (x = anchorOf(el, m)),
                nameOf(f) + ' ' + p);
              n.anchors++;
              if (x.unknown) n.unknown++;
              const k = x.wrap && x.wrap.kind;
              if (k === 'none') n[x.behindDoc ? 'behind' : 'front']++;
              else if (k) n[k]++;
            }
            const pic = el.name.endsWith('drawing') &&
              pictureOf(el, m);
            if (pic && pic.floating) {
              n.pictures++;
              if (pic.anchor.unknown) n.picUnknown++;
            }
            for (const c of el.children) if (isEl(c)) walk(c, s);
          };
          walk(root, rootScope(root));
        }
      }
      console.log(`# anchor corpus${ALL ? '' : ' (sample)'}: ` +
        JSON.stringify(n));
      if (!ALL) return;
      for (const k of Object.keys(SPEC)) {
        assert.ok(Math.abs(n[k] - SPEC[k]) <= 2,
          `${k}: ${n[k]} (spec ${SPEC[k]})`);
      }
    });
  });
