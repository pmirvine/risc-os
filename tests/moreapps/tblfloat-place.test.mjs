// Floating tables placed and edited (Batch D P12b fix wave): edges
// found where the table is drawn (I2); tblOverlap never on either
// table (I3); floating tables never hidden under each other (I4);
// kept on the sheet across (I5); the minor fixes. Letter page, 1 in
// margins: page 816 x 1056 px, text 96..720 x 96..960.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {p, r} from './build-docx.mjs';
import {loadStyles} from './word-docs.mjs';
import {M, docOf, settle, text, ftbl, tblUnder} from './wrap-fixtures.mjs';

const L_ = '../../tools/moreapps/!Letters/';
const {edgeAt} = await import(L_ + 'TblEdge');
const {PlaceDraft} = await import(L_ + 'Place');
const {splitTableCmd} = await import(L_ + 'TblCmdRows');
const {caret} = await import(L_ + 'Selection');
const {forEachBlock} = await import(L_ + 'Walk');
const {writeDocx} = await import(L_ + 'DocxWrite');
const {clean} = await import(L_ + 'ClipClean');
const {floatOf} = await import(L_ + 'TblFloat');
const {docMap} = await import(L_ + 'PicRead');
const {readZip} = await import('../../tools/moreapps/!WimpLib/Zip');

before(loadStyles);

/** The table Floats of page i of P. */
const tfloats = (P, i = 0) => P.floatsOf(P.at(i))
  .filter((f) => f.tbl !== undefined);

/** doc settled in Print layout, L.place its PlacePrint. */
async function placed(body) {
  const {L, P} = settle(await docOf(body));
  L.place = M.PlacePrint(L, P);
  return {L, P, o: L.place.sheet.rect(P.at(0))};
}

describe('I2: a table\'s edges are where it is drawn', () => {
  const body = p(r('intro')) + ftbl({horzAnchor: 'page',
    vertAnchor: 'page', tblpX: 2880, tblpY: 7200}, {n: 2, w: 6000}) +
    p(r(text(10))) + p(r(text(10)));

  it('a press on the text after a placed table (where the table is ' +
    'in the galley) finds no edge of it', async () => {
    const {L, o} = await placed(body);
    const after = L.items[2];
    const fr = L.place.pageFrags(0).find((x) => x.it === after);
    for (const dy of [0.5, 1, 2, 3]) {
      const y = o.y + after.y + fr.dy + dy;
      for (const dx of [10, 40, 200]) {
        const x = o.x + fr.dx + after.x + dx;
        assert.equal(L.place.hit(x, y).it, after);
        assert.equal(edgeAt(L, x, y, 1), null, `${dx}, ${dy}`);
      }
    }
  });

  it('its right edge, last row\'s bottom and inner borders are ' +
    'found where it is drawn, from inside and just outside',
  async () => {
    const {L, P, o} = await placed(body);
    const [F] = tfloats(P), it = L.byId.get(F.tbl);
    assert.equal(F.y, 480);
    const at = (x, y) => edgeAt(L, o.x + x, o.y + y, 1);
    const kind = (e) => e && [e.kind, e.index, e.table === it];
    const midY = F.y + it.rows[0].h / 2, midX = F.x + F.w / 2;
    for (const d of [-2, 0, 2]) {
      assert.deepEqual(kind(at(F.x + F.w + d, midY)), ['right', 1,
        true], `right ${d}`);
      assert.deepEqual(kind(at(midX, F.y + F.h + d)), ['row', 1,
        true], `bottom ${d}`);
      assert.deepEqual(kind(at(midX, F.y + it.rows[0].h + d)), ['row',
        0, true], `row 0 ${d}`);
    }
    // far from it: none
    assert.equal(at(F.x + F.w + 4, midY), null);
    assert.equal(at(midX, F.y + F.h + 4), null);
  });

  it('Draft: the table in the flow keeps its edges there', async () => {
    const {L} = settle(await docOf(body));
    const D = new M.DocLayout(L.doc, L.metrics, null, {});
    D.layout(1000);
    D.place = PlaceDraft(D);
    const it = D.items[1];
    const e = edgeAt(D, it.x + it.left + it.width, it.y + 5, 1);
    assert.equal(e && e.kind, 'right');
  });
});

const NEVER = '<w:tblOverlap w:val="never"/>';
const meets = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 &&
  a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** The pairs of table Floats on a page of P that overlap. */
function hidden(P) {
  const out = [];
  for (let i = 0; i < P.count; i++) {
    const fs = tfloats(P, i);
    fs.forEach((a, j) => fs.slice(j + 1).forEach((b) => {
      if (meets(a, b)) out.push([i, a.tbl, b.tbl]);
    }));
  }
  return out;
}

describe('I3: tblOverlap never keeps the tables after it off it', () => {
  const at = {horzAnchor: 'page', vertAnchor: 'page', tblpX: 2880,
    tblpY: 2880};
  for (const [a, b] of [[NEVER, ''], ['', NEVER], [NEVER, NEVER]]) {
    it(`A ${a ? 'never' : 'allowed'}, then B ${b ? 'never' :
      'allowed'}, at one place: B below A`, async () => {
      const {P} = settle(await docOf(p(r('x')) + ftbl(at, {n: 3,
        more: a}) + p(r('y')) + ftbl(at, {n: 3, more: b}) +
        p(r(text(3)))));
      const [A, B] = tfloats(P);
      assert.equal(A.y, 192);
      assert.equal(B.x, A.x);
      assert.ok(Math.abs(B.y - (A.y + A.h)) < 0.01, `${B.y}`);
    });
  }

  it('both allowed and at different places: they may overlap',
    async () => {
      const {P} = settle(await docOf(p(r('x')) + ftbl(at, {n: 3}) +
        p(r('y')) + ftbl({...at, tblpY: 3000}, {n: 3}) + p(r('z'))));
      const [A, B] = tfloats(P);
      assert.equal(B.y, 200);
      assert.ok(meets(A, B));
    });
});

describe('I4: floating tables never hidden under each other', () => {
  const t = (n, more = '') => ftbl({horzAnchor: 'margin', vertAnchor:
    'text', tblpXSpec: 'left'}, {n, more});

  it('(a) three in a row at one flow place, overlap allowed: ' +
    'stacked, each below the one before', async () => {
    const {P} = settle(await docOf(p(r('intro')) + t(3) + t(3) + t(3) +
      p(r(text(10)))));
    const fs = tfloats(P);
    assert.equal(fs.length, 3);
    for (let j = 1; j < 3; j++) {
      assert.ok(Math.abs(fs[j].y - (fs[j - 1].y + fs[j - 1].h)) < 0.01,
        `${j}: ${fs[j].y}`);
    }
    assert.deepEqual(hidden(P), []);
  });

  it('(b) six of 10 rows in a row (never): the one that does not fit ' +
    'goes to the next page, none hidden', async () => {
    const {P} = settle(await docOf(p(r('intro')) +
      t(10, NEVER).repeat(6) + p(r(text(10)))));
    assert.ok(P.count >= 2, `${P.count} pages`);
    let n = 0;
    for (let i = 0; i < P.count; i++) {
      for (const f of tfloats(P, i)) {
        n++;
        assert.ok(f.y + f.h <= 960 + 0.01, `${i}: ${f.y} + ${f.h}`);
      }
    }
    assert.equal(n, 6);
    assert.deepEqual(hidden(P), []);
  });

  it('(c) Split Table on a page-anchored table: the halves do not ' +
    'coincide; the first keeps its tblpPr byte for byte, the second ' +
    'never overlaps it', async () => {
    const d = new M.Document(await docOf(p(r('a')) + ftbl({horzAnchor:
      'page', vertAnchor: 'page', tblpX: 2880, tblpY: 2880,
    leftFromText: 180}, {n: 4, t: (k) => 'row' + k}) +
      p(r(text(10)))));
    let id;
    forEachBlock(d.doc, (b) => {
      if (b.type === 'p' && b.text === 'row2') id = b.id;
    });
    splitTableCmd(d, caret({id, off: 0}));
    const {P} = settle(d.doc);
    const fs = tfloats(P);
    assert.equal(fs.length, 2);
    assert.deepEqual(hidden(P), []);
    assert.ok(Math.abs(fs[1].y - (fs[0].y + fs[0].h)) < 0.01);
    const z = await readZip(await writeDocx(d.doc,
      {date: new Date(2024, 0, 1)}));
    const xml = new TextDecoder().decode(z.get
      ? await z.get('word/document.xml') : z['word/document.xml']);
    const prs = xml.match(/<w:tblPr>.*?<\/w:tblPr>/g);
    assert.equal(prs.length, 2);
    const PR = '<w:tblpPr w:horzAnchor="page" w:vertAnchor="page" ' +
      'w:tblpX="2880" w:tblpY="2880" w:leftFromText="180"/>';
    assert.ok(prs[0].includes(PR) && !/tblOverlap/.test(prs[0]),
      prs[0]);
    assert.ok(prs[1].includes(PR + NEVER), prs[1]);
  });

  it('(c) a floating table pasted in its own document never overlaps ' +
    'the one it was copied from; from another document as it was',
  async () => {
    const doc = await docOf(p(r('a')) + ftbl({horzAnchor: 'page',
      vertAnchor: 'page', tblpX: 2880, tblpY: 2880}, {n: 2}));
    const tb = doc.sections[0].blocks[1], map = docMap(doc);
    assert.equal(floatOf(tb.tblPr, map).overlap, true);
    const [same] = clean([tb], doc, {sameDoc: true});
    const f = floatOf(same.tblPr, map);
    assert.equal(f.overlap, false);
    assert.equal(f.unknown, false);
    assert.equal(f.x, 2880);
    // a table already never: kept never, one tblOverlap
    const [twice] = clean([same], doc, {sameDoc: true});
    assert.equal(twice.tblPr.extra.filter((n) => /tblOverlap/
      .test(n.name)).length, 1);
    // not floating: unchanged
    const plain = {...tb, tblPr: {...tb.tblPr, extra: []}};
    assert.equal(clean([plain], doc, {sameDoc: true})[0].tblPr.extra
      .length, 0);
  });
});

describe('I5: a placed table is kept on the sheet across', () => {
  for (const [x, want] of [[-31680, 0], [31680, 816 - 2000 / 15]]) {
    it(`tblpX ${x} (page): x ${want.toFixed(1)}, its left cell on the ` +
      'sheet; tblpPr unchanged', async () => {
      const {P, L} = settle(await docOf(p(r('a')) + ftbl({horzAnchor:
        'page', vertAnchor: 'page', tblpX: x, tblpY: 1440}) + p(r('b'))));
      const [F] = tfloats(P);
      assert.ok(Math.abs(F.x - want) < 0.01, `${F.x}`);
      assert.equal(floatOf(L.items[1].block.tblPr, L.ns).x, x);
    });
  }

  it('a left cell wider than the page: its left edge at the sheet\'s',
    async () => {
      const {P} = settle(await docOf(p(r('a')) + ftbl({horzAnchor:
        'page', vertAnchor: 'page', tblpX: 31680, tblpY: 1440},
      {w: 20000}) + p(r('b'))));
      const [F] = tfloats(P);
      assert.equal(F.x, 0);
    });
});

describe('Minor: placed from the flow, kept in the frame', () => {
  const t = (a, n = 3) => ftbl({horzAnchor: 'margin', vertAnchor: 'text',
    tblpXSpec: 'left', ...a}, {n});

  it('a table placed from its flow place that would end past the ' +
    'frame\'s bottom goes whole to the next page with the text after ' +
    'it, not over the bottom margin or footer; no line under it',
  async () => {
    const body = Array.from({length: 46}, (_, k) => p(r('line ' + k)))
      .join('') + t({}) + p(r(text(3)));
    const {L, P} = settle(await docOf(body));
    assert.equal(tfloats(P, 0).length, 0);
    const [F] = tfloats(P, 1);
    assert.ok(F, 'placed on page 2');
    assert.equal(F.y, 96);
    assert.ok(F.y + F.h <= 960 + 0.01, `${F.y} + ${F.h}`);
    assert.equal(P.at(1).start.k, 46);
    assert.deepEqual(tblUnder(L, P), []);
    // with tblpY 1440 (96 px) it goes earlier: its bottom there
    const Q = settle(await docOf(Array.from({length: 40}, (_, k) =>
      p(r('line ' + k))).join('') + t({tblpY: 1440}) +
      p(r(text(3))))).P;
    assert.equal(tfloats(Q, 0).length, 0);
    const [G] = tfloats(Q, 1);
    assert.ok(G && G.y + G.h <= 960 + 0.01);
  });

  for (const ys of ['center', 'bottom', 'outside', 'inside', 'top',
    'inline']) {
    it(`tblpYSpec ${ys} with vertAnchor text: at its flow place (as ` +
      'top: the box has no height)', async () => {
      const {L, P} = settle(await docOf(p(r(text(3))) +
        t({tblpYSpec: ys}) + p(r(text(3)))));
      const [F] = tfloats(P);
      const fr = P.framesOf(P.at(0))[0];
      const f = fr.frags.find((x) => x.id === F.tbl);
      assert.equal(F.y, f.y);
      assert.deepEqual(tblUnder(L, P), []);
    });
  }
});
