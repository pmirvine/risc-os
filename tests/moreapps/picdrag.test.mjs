// P12.5 (D27): a floating picture moved and resized by dragging. The
// pure parts: ./AnchorMove moveAnchor (posOffset + the move in EMU:
// 48 px = 457200, one undo step, an align turned into the offset
// that puts it where it was shown, an axis that did not move left
// alone, refusals) and ./PicOps setPicture on an understood anchor
// (the extent changes, the position does not; an anchor not
// understood is still refused). P12a fix I4: a float moves from where
// it is SHOWN (a float kept on the page, PG30), and a move that
// leaves its offsets as they were makes no step. The mouse part is word-pictures-
// edit.mjs and word-anchor-drag.mjs in the browser.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {moveAnchor, canMove} from '../../tools/moreapps/!Letters/AnchorMove';
import {setPicture} from '../../tools/moreapps/!Letters/PicOps';
import {pictureOf, docMap} from '../../tools/moreapps/!Letters/PicRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {select} from '../../tools/moreapps/!Letters/Selection';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';
import {write} from './roundtrip-lib.mjs';

const EMU = 9525;
const off = (v) => `<wp:posOffset>${v}</wp:posOffset>`;

/** A floating picture's run: h, v [relativeFrom, inner]. */
function anchorRun(h, v, extra = (s) => s) {
  let s = drawingXml({kind: 'anchor', id: 2, descr: 'fl'});
  s = s.replace(/<wp:positionH[^]*<\/wp:positionV>/,
    `<wp:positionH relativeFrom="${h[0]}">${h[1]}</wp:positionH>` +
    `<wp:positionV relativeFrom="${v[0]}">${v[1]}</wp:positionV>`);
  return `<w:r>${extra(s)}</w:r>`;
}

const ODD = (s) => s.replace('simplePos="0"', 'simplePos="1"');
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const WP14 = 'http://schemas.microsoft.com/office/word/2010/' +
  'wordprocessingDrawing';
/** positionH in an mc:AlternateContent (a wp14 Choice, a Fallback
 *  with its offset), as Word writes a percent position. */
const ALT = (s) => s.replace(/<wp:positionH[^]*?<\/wp:positionH>/,
  `<mc:AlternateContent xmlns:mc="${MC}" xmlns:wp14="${WP14}">` +
  '<mc:Choice Requires="wp14"><wp:positionH relativeFrom="page">' +
  '<wp14:pctPosHOffset>40000</wp14:pctPosHOffset></wp:positionH>' +
  '</mc:Choice><mc:Fallback><wp:positionH relativeFrom="page">' +
  off(1000) + '</wp:positionH></mc:Fallback></mc:AlternateContent>');
const bytes = picDocx({pics: [{id: 1}], body:
  p(anchorRun(['column', off(100000)], ['paragraph', off(200000)])) +
  p(anchorRun(['margin', '<wp:align>right</wp:align>'],
    ['page', '<wp:align>bottom</wp:align>'])) +
  p(anchorRun(['column', off(1)], ['paragraph', off(1)], ODD)) +
  p(r('text')) +
  p(anchorRun(['page', off(100 * EMU)], ['page', off(2000 * EMU)])) +
  p(anchorRun(['page', off(1)], ['page', off(1)], ALT))});
const load = async () => new Document(await readDocx(await bytes));
const para = (d, k) => d.doc.sections[0].blocks[k];
const sel = (d, k) => select({id: para(d, k).id, off: 0},
  {id: para(d, k).id, off: 1});
const info = (d, k) => pictureOf(para(d, k).inlines[0].node,
  docMap(d.doc));
const XML = async (d) => new TextDecoder().decode((await readZip(
  await write(d.doc))).get('word/document.xml'));

describe('moveAnchor (D27)', () => {
  it('48 px: posOffset + 457200 (48 x 15 twips x 635), one step',
    async () => {
      const d = await load();
      assert.equal(48 * 15 * 635, 457200);
      const out = moveAnchor(d, sel(d, 1), {dx: 48, dy: 0});
      assert.equal(d.undoDepth, 1);
      assert.deepEqual([out.anchor.off, out.head.off], [0, 1]);
      const a = info(d, 1).anchor;
      assert.equal(a.posH.offset, 100000 + 457200);
      assert.equal(a.posV.offset, 200000);
      assert.equal(a.posH.from, 'column');
      assert.ok(!a.unknown);
      d.undo();
      assert.equal(info(d, 1).anchor.posH.offset, 100000);
    });

  it('both axes, negative; the XML carries the numbers', async () => {
    const d = await load();
    assert.ok(moveAnchor(d, sel(d, 1), {dx: -10, dy: 20.4}));
    const a = info(d, 1).anchor;
    assert.equal(a.posH.offset, 100000 - 10 * EMU);
    assert.equal(a.posV.offset, 200000 + Math.round(20.4 * EMU));
    const x = await XML(d);
    assert.ok(x.includes(off(100000 - 10 * EMU)), x.slice(0, 600));
  });

  it('only the position changes: the rest is the same', async () => {
    const d = await load();
    const was = para(d, 1).inlines[0].node.children[0];
    moveAnchor(d, sel(d, 1), {dx: 5, dy: 5});
    const now = para(d, 1).inlines[0].node.children[0];
    const keep = (n) => n.children.filter((c) => typeof c === 'object' &&
      !/position[HV]$/.test(c.name));
    assert.deepEqual(keep(now).map((c) => c.name),
      keep(was).map((c) => c.name));
    keep(was).forEach((c, i) => assert.deepEqual(keep(now)[i], c));
    assert.deepEqual(now.attrs, was.attrs);
  });

  it('an axis that did not move is left as it is', async () => {
    const d = await load();
    moveAnchor(d, sel(d, 2), {dx: 0, dy: 10,
      from: {x: 600, y: 900, bx: 96, by: 0}});
    const a = info(d, 2).anchor;
    assert.equal(a.posH.align, 'right');
    assert.equal(a.posV.offset, Math.round((900 - 0 + 10) * EMU));
    assert.equal(a.posV.from, 'page');
  });

  it('an align becomes the offset it showed plus the move',
    async () => {
      const d = await load();
      moveAnchor(d, sel(d, 2), {dx: -20, dy: -30,
        from: {x: 500, y: 950, bx: 96, by: 0}});
      const a = info(d, 2).anchor;
      assert.equal(a.posH.offset, (500 - 96 - 20) * EMU);
      assert.equal(a.posV.offset, (950 - 30) * EMU);
      assert.equal(a.posH.align, undefined);
      assert.equal(d.undoDepth, 1);
    });

  it('an align without where it was shown: refused', async () => {
    const d = await load();
    assert.equal(moveAnchor(d, sel(d, 2), {dx: 5, dy: 0}), null);
    assert.equal(d.undoDepth, 0);
  });

  it('kept within 32 bits', async () => {
    const d = await load();
    moveAnchor(d, sel(d, 1), {dx: 1e9, dy: -1e9});
    const a = info(d, 1).anchor;
    assert.equal(a.posH.offset, 2147483647);
    assert.equal(a.posV.offset, -2147483648);
  });

  it('no move (under half an EMU): the same selection, no step',
    async () => {
      const d = await load();
      const s = sel(d, 1);
      assert.equal(moveAnchor(d, s, {dx: 0, dy: 1e-6}), s);
      assert.equal(d.undoDepth, 0);
    });

  it('a float shown elsewhere than its offset (kept on the page, ' +
    'PG30: page offset 2000 px, shown at 1008) moves from where it ' +
    'is shown (P12a fix I4)', async () => {
    const d = await load(), at = {x: 100, y: 1008, bx: 0, by: 0};
    assert.ok(moveAnchor(d, sel(d, 5), {dx: 0, dy: -50, from: at}));
    assert.equal(info(d, 5).anchor.posV.offset, 958 * EMU);
    assert.equal(info(d, 5).anchor.posH.offset, 100 * EMU);
    assert.equal(d.undoDepth, 1);
  });

  it('a move that leaves both offsets as they were: the same ' +
    'selection, no step (P12a fix I4)', async () => {
    const d = await load(), s = sel(d, 5);
    // (shown at 1008, 992 px down: offset 2000 px, as stored)
    assert.equal(moveAnchor(d, s, {dx: 0, dy: 992, from: {x: 100,
      y: 1008, bx: 0, by: 0}}), s);
    assert.equal(d.undoDepth, 0);
  });

  it('canMove (P12a fix M4): a float whose positions are its own ' +
    'children; not one in an mc:AlternateContent, nor one not ' +
    'understood, in line or no picture (the drag beeps at the ' +
    'press)', async () => {
    const d = await load();
    assert.equal(info(d, 6).anchor.unknown, false);
    assert.equal(canMove(d, sel(d, 1)), true);
    assert.equal(canMove(d, sel(d, 5)), true);
    for (const s of [sel(d, 6), sel(d, 3), sel(d, 0), null,
      select({id: para(d, 4).id, off: 0})]) {
      assert.equal(canMove(d, s), false);
    }
    assert.equal(moveAnchor(d, sel(d, 6), {dx: 5, dy: 0, from: {x: 0,
      y: 0, bx: 0, by: 0}}), null);
  });

  it('refused, nothing changed: an anchor not understood, in line,' +
    ' not a picture, bad numbers', async () => {
    const d = await load(), snap = structuredClone(d.doc.sections);
    for (const [s, o] of [[sel(d, 3), {dx: 5, dy: 5}],
      [sel(d, 0), {dx: 5, dy: 5}],
      [select({id: para(d, 4).id, off: 0}), {dx: 5, dy: 5}],
      [null, {dx: 5, dy: 5}], [sel(d, 1), {dx: NaN, dy: 0}],
      [sel(d, 1), {dx: 0, dy: Infinity}], [sel(d, 1), {dx: '5', dy: 0}],
      [sel(d, 1), {}]]) {
      assert.equal(moveAnchor(d, s, o), null);
    }
    assert.ok(deepEqual(d.doc.sections, snap));
    assert.equal(d.undoDepth, 0);
  });
});

describe('resize of a floating picture (D27)', () => {
  it('an understood anchor: the extent changes, the place does not',
    async () => {
      const d = await load();
      const before = info(d, 1).anchor;
      setPicture(d, sel(d, 1), {cx: 1905000, cy: 952500});
      const i = info(d, 1);
      assert.deepEqual([i.cx, i.cy], [1905000, 952500]);
      assert.deepEqual(i.anchor.posH, before.posH);
      assert.deepEqual(i.anchor.posV, before.posV);
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.equal(info(d, 1).cx, 914400);
    });

  it('an anchor not understood: still refused', async () => {
    const d = await load();
    assert.throws(() => setPicture(d, sel(d, 3), {cx: 1905000}),
      (e) => e instanceof RangeError && e.message === 'floating');
    assert.equal(d.undoDepth, 0);
  });
});
