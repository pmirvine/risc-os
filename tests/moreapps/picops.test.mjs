// PicOps and PicFind (Batch B, B3.1): a picture's size and alt text
// set as one undo step (one replaceText of its U+FFFC, the run's
// format kept), refused for floating / unsupported pictures and out
// of range values; finding the picture under a point or selected,
// and its handles at any zoom.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {setPicture, stepSel} from '../../tools/moreapps/!Word/PicOps';
import {picAt, selectedPic, handleAt, handleRects}
  from '../../tools/moreapps/!Word/PicFind';
import {pictureOf, docMap} from '../../tools/moreapps/!Word/PicRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {deepEqual} from '../../tools/moreapps/!Word/Model';
import {select, caret} from '../../tools/moreapps/!Word/Selection';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {p} from './build-docx.mjs';
import {tm} from './word-docs.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';

const DATE = new Date(Date.UTC(2026, 0, 1));
let bytes;
before(async () => {
  bytes = await picDocx({pics: [{id: 1}, {kind: 'anchor', id: 2},
    {xfrm: false, id: 3}], body: p('<w:r><w:rPr><w:b/></w:rPr>' +
      drawingXml({id: 4, embed: 'rId11', decl: false}) + '</w:r>' +
      '<w:r><w:t>after</w:t></w:r>')});
});

/** A Document of: inline, floating, unsupported, bold picture. */
const load = async () => new Document(await readDocx(bytes));
const para = (d, k) => d.doc.sections[0].blocks[k];
const picSel = (d, k) => select({id: para(d, k).id, off: 0},
  {id: para(d, k).id, off: 1});
const info = (d, k) => pictureOf(para(d, k).inlines[0].node,
  docMap(d.doc));
const snap = (d) => structuredClone(d.doc.sections);

/** fn throws RangeError `msg`; nothing changed, no step. */
async function refused(k, o, msg) {
  const d = await load();
  const s = snap(d), n = d.undoDepth;
  assert.throws(() => setPicture(d, picSel(d, k), o),
    (e) => e instanceof RangeError && e.message === msg);
  assert.ok(deepEqual(d.doc.sections, s));
  assert.equal(d.undoDepth, n);
}

describe('PicOps', () => {
  it('resize: one undo step, the picture selected again', async () => {
    const d = await load();
    const old = para(d, 0).inlines[0], s = snap(d);
    const sel = setPicture(d, picSel(d, 0), {cx: 1905000, cy: 952500});
    assert.equal(d.undoDepth, 1);
    const id = para(d, 0).id;
    assert.deepEqual([sel.anchor, sel.head], [{id, off: 0},
      {id, off: 1}]);
    assert.equal(info(d, 0).cx, 1905000);
    assert.equal(info(d, 0).cy, 952500);
    d.undo();
    assert.ok(deepEqual(d.doc.sections, s));
    assert.equal(para(d, 0).inlines[0].node, old.node, 'old object');
  });

  it('alt text and size together, then only alt text', async () => {
    const d = await load();
    setPicture(d, picSel(d, 0), {cx: 19050, descr: 'A cat'});
    assert.equal(d.undoDepth, 1);
    assert.equal(info(d, 0).alt, 'A cat');
    assert.equal(info(d, 0).cx, 19050);
    assert.equal(info(d, 0).cy, 457200);
    setPicture(d, picSel(d, 0), {descr: ''});
    assert.equal(info(d, 0).alt, '');
    assert.equal(d.undoDepth, 2);
  });

  it('nothing changes: no step, the same selection', async () => {
    const d = await load();
    const sel = picSel(d, 0);
    assert.equal(setPicture(d, sel, {cx: 914400, cy: 457200,
      descr: ''}), sel);
    assert.equal(setPicture(d, sel, {}), sel);
    assert.equal(d.undoDepth, 0);
  });

  it('floating: alt text yes, size refused', async () => {
    await refused(1, {cx: 19050}, 'floating');
    const d = await load();
    setPicture(d, picSel(d, 1), {descr: 'float'});
    assert.equal(info(d, 1).alt, 'float');
  });

  it('unsupported: alt text yes, size refused', async () => {
    await refused(2, {cy: 19050}, 'unsupported');
    const d = await load();
    setPicture(d, picSel(d, 2), {descr: 'u'});
    assert.equal(info(d, 2).alt, 'u');
  });

  it('out of range and bad alt text refused', async () => {
    await refused(0, {cx: 9524}, 'range');
    await refused(0, {cx: 20116801}, 'range');
    await refused(0, {cy: 12.5}, 'range');
    await refused(0, {cx: 19050, descr: 'x'.repeat(1025)}, 'alt');
    await refused(0, {descr: 'a\u0007b'}, 'alt');
    await refused(0, {descr: 'a\u000bb'}, 'alt');
    await refused(0, {descr: 'a\u0085b'}, 'alt');
    const d = await load();
    setPicture(d, picSel(d, 0), {cx: 9525, cy: 20116800,
      descr: 'x'.repeat(1024)});
    assert.equal(info(d, 0).cy, 20116800);
  });

  it('not a picture: the selection back, nothing done', async () => {
    const d = await load();
    const t = para(d, 3).id;
    for (const sel of [null, caret({id: t, off: 0}),
      select({id: t, off: 1}, {id: t, off: 3}),
      select({id: t, off: 1}, {id: t, off: 2}),
      select({id: 99999, off: 0}, {id: 99999, off: 1})]) {
      assert.equal(setPicture(d, sel, {cx: 19050}), sel);
    }
    assert.equal(d.undoDepth, 0);
  });

  it('a backwards selection works; the run\'s bold kept', async () => {
    const d = await load();
    const id = para(d, 3).id;
    const run = para(d, 3).runs[0];
    assert.equal(run.rPr.b, true);
    setPicture(d, select({id, off: 1}, {id, off: 0}), {cx: 19050});
    assert.deepEqual(para(d, 3).runs[0], run);
    assert.equal(para(d, 3).text, '￼after');
  });

  it('alt text with tab, newline and CR is accepted and survives a save', async () => {
    const d = await load();
    const t = 'a\tb\nc\r\nd';
    setPicture(d, picSel(d, 0), {descr: t});
    assert.equal(info(d, 0).alt, t);
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    const x = pictureOf(back.sections[0].blocks[0].inlines[0].node,
      docMap(back));
    assert.equal(x.alt, t);
  });

  it('written and read back: the new size and alt text', async () => {
    const d = await load();
    setPicture(d, picSel(d, 0), {cx: 1905000, cy: 952500,
      descr: 'Bob'});
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    const x = pictureOf(back.sections[0].blocks[0].inlines[0].node,
      docMap(back));
    assert.equal(x.cx, 1905000);
    assert.equal(x.cy, 952500);
    assert.equal(x.alt, 'Bob');
    assert.equal(x.embed, 'rId11');
  });
});

describe('PicFind', () => {
  let d, L, pi, line, item, rect;
  before(async () => {
    d = await load();
    L = new DocLayout(d.doc, tm());
    L.layout(800);
    pi = L.items[0];
    line = pi.lines[0];
    item = line.items.find((x) => x.kind === 'pic');
    rect = {x: L.left + item.x, y: pi.y + line.y + line.base - 48,
      w: 96, h: 48};
  });

  it('picAt: the picture under a point, in layout coordinates', () => {
    const hit = picAt(L, rect.x + 10, rect.y + 10);
    assert.deepEqual(hit.pos, {id: pi.id, off: 0});
    assert.equal(hit.item, item);
    assert.equal(hit.line, line);
    assert.equal(hit.pi, pi);
    assert.deepEqual(hit.rect, rect);
    assert.equal(picAt(L, rect.x - 2, rect.y + 10), null);
    assert.equal(picAt(L, rect.x + 10, rect.y - 2), null);
    assert.equal(picAt(L, rect.x + 97, rect.y + 10), null);
    assert.equal(picAt(L, NaN, NaN), null);
    const t = L.items[3], ln = t.lines[0];
    assert.equal(picAt(L, L.left + ln.items.at(-1).x + 2,
      t.y + ln.y + ln.base - 2), null, 'text is not a picture');
  });

  it('selectedPic: exactly [off, off + 1] of a picture', () => {
    const id = pi.id;
    const s = selectedPic(L, select({id, off: 0}, {id, off: 1}));
    assert.deepEqual(s.rect, rect);
    assert.equal(s.item, item);
    assert.deepEqual(selectedPic(L, select({id, off: 1},
      {id, off: 0})).pos, {id, off: 0});
    assert.equal(selectedPic(L, caret({id, off: 0})), null);
    assert.equal(selectedPic(L, null), null);
    const t = L.items[3].id;
    assert.equal(selectedPic(L, select({id: t, off: 1}, {id: t,
      off: 2})), null);
    assert.equal(selectedPic(L, select({id: t, off: 0}, {id: t,
      off: 1})).pos.id, t);
  });

  it('handles: 7 px on screen, hit 5 px around, at every zoom', () => {
    const r = {x: 100, y: 200, w: 96, h: 48};
    for (const z of [0.5, 1, 2, 4]) {
      const hs = handleRects(r, z);
      assert.deepEqual(hs.map((h) => h.name), ['nw', 'n', 'ne', 'e',
        'se', 's', 'sw', 'w']);
      for (const h of hs) {
        assert.equal(h.w, 7 / z);
        assert.equal(handleAt(r, h.x + h.w / 2, h.y + h.h / 2, z),
          h.name, h.name + ' at ' + z);
      }
      const at = (px) => handleAt(r, 196 + px / z, 248, z);
      assert.equal(at(8), 'se');
      assert.equal(at(9), null);
      assert.equal(handleAt(r, 148, 224, z), null, 'the middle');
    }
    assert.equal(handleAt(r, 196, 248, 0), 'se', 'bad zoom: 1');
  });

  it('a tiny picture: the nearest handle wins', () => {
    const r = {x: 0, y: 0, w: 2, h: 2};
    assert.equal(handleAt(r, 2, 2, 1), 'se');
    assert.equal(handleAt(r, 0, 0, 1), 'nw');
  });
});

describe('PicOps stepSel', () => {
  /** The ops of d's next undo or redo (its 'change' event). */
  const step = (d, kind) => {
    let ops = null;
    const off = d.on('change', (e) => { ops = e.ops; });
    d[kind]();
    off();
    return ops;
  };

  it('undo and redo of a resize select the picture', async () => {
    const d = await load();
    setPicture(d, picSel(d, 0), {cx: 1905000, cy: 952500});
    const id = para(d, 0).id;
    for (const kind of ['undo', 'redo']) {
      const sel = stepSel(d.doc, step(d, kind));
      assert.deepEqual([sel.anchor, sel.head], [{id, off: 0},
        {id, off: 1}], kind);
    }
  });

  it('other steps: null', async () => {
    const d = await load();
    d.apply({op: 'replaceText', block: [0, 3], at: 1, del: 1,
      ins: 'X'});
    assert.equal(stepSel(d.doc, step(d, 'undo')), null);
    d.apply({op: 'replaceText', block: [0, 3], at: 1, del: 0,
      ins: 'Z'});
    assert.equal(stepSel(d.doc, step(d, 'undo')), null, 'typed');
    assert.equal(stepSel(d.doc, null), null);
    assert.equal(stepSel(d.doc, []), null);
    assert.equal(stepSel(d.doc, [{op: 'compound', ops: []}]), null);
  });

  it('undo of a deleted picture selects it; redo: null', async () => {
    const d = await load();
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 1,
      ins: ''});
    const id = para(d, 0).id;
    const sel = stepSel(d.doc, step(d, 'undo'));
    assert.deepEqual([sel.anchor, sel.head], [{id, off: 0},
      {id, off: 1}]);
    assert.equal(stepSel(d.doc, step(d, 'redo')), null);
  });

  it('a compound: its last op decides', async () => {
    const d = await load();
    d.atomic(() => {
      d.apply({op: 'replaceText', block: [0, 3], at: 1, del: 1,
        ins: 'Y'});
      setPicture(d, picSel(d, 0), {cx: 1905000});
    });
    const sel = stepSel(d.doc, step(d, 'undo'));
    assert.equal(sel, null, 'the text op is the last undone');
  });
});
