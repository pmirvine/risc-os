// A click on text over a picture behind the text puts the caret
// there (Batch D P12a fix I2): ./PicFind picAt finds a float behind
// the text only where the point is on no text of a line (Word's
// rule); one in front of the text is found wherever it is drawn;
// the behind one is still selected where there is no text, and from
// the keyboard (its anchor selected: ./PicFind selectedPic).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {p, r} from './build-docx.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {M, off, anchorRun, docOf, text} from './wrap-fixtures.mjs';

before(loadStyles);

/** A page with a 600 x 600 px float at its top left (behind the
 *  text, or in front) and ten lines of text over it. */
async function pageOf(behind) {
  const doc = await docOf(p(anchorRun({behind, w: 600, ht: 600,
    wrap: '<wp:wrapNone/>', h: ['page', off(0)], v: ['page', off(0)]}) +
    r(text(10))));
  const L = new M.DocLayout(doc, tm(), null, {floats: true});
  L.layout(1000);
  const P = new M.Pages(M.printGalley(L)).finish();
  L.place = M.PlacePrint(L, P);
  L.layout(1000);
  return {L, P, o: L.place.sheet.rect(P.at(0))};
}

describe('I2: a click on text over a float behind it', () => {
  it('on a word of the first line: no picture (the caret goes ' +
    'there)', async () => {
    const {L, o} = await pageOf(true);
    assert.equal(M.picAt(L, o.x + 150, o.y + 100), null);
    // (the space after 'alpha', 40..48 px with the test measurer:
    // the gap between two words is text too)
    const at = L.place.lineAt(L.items[0], 0);
    assert.equal(M.picAt(L, at.x + 44, at.y + 2), null);
  });

  it('where there is no text (beside a short line, below the text): ' +
    'the float', async () => {
    const {L, o} = await pageOf(true);
    const it = L.items[0], k = it.lines.length - 1;
    const at = L.place.lineAt(it, k), ln = it.lines[k];
    const end = Math.max(...ln.items.map((x) => x.x + x.w));
    const beside = M.picAt(L, at.x + end + 20, at.y + 4);
    assert.ok(beside && beside.float, 'beside the last line');
    const below = M.picAt(L, o.x + 300, o.y + 500);
    assert.ok(below && below.float && below.float.behind);
  });

  it('a float in front of the text is found over the text', async () => {
    const {L, o} = await pageOf(false);
    const f = M.picAt(L, o.x + 150, o.y + 100);
    assert.ok(f && f.float && !f.float.behind);
  });

  it('the behind float is selected from the keyboard: its anchor ' +
    'selected (Shift+Right over it)', async () => {
    const {L} = await pageOf(true);
    const id = L.items[0].id;
    const s = M.selectedPic(L, M.select({id, off: 0}, {id, off: 1}));
    assert.ok(s && s.float && s.float.behind);
  });
});
