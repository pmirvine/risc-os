// A float that spans two newspaper columns wraps the lines of both
// (Batch D P12a fix I3): each column's paragraphs get a part for
// their frame; a paragraph that its wrap splits across the two
// columns and its unwrapped self does not (the columns' end moving
// back and forth) is kept whole (./WrapPage: a 'k:' pin, ./PageGalley
// keepLines), as Word lays a column out once.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {p, r} from './build-docx.mjs';
import {loadStyles} from './word-docs.mjs';
import {M, off, al, anchorRun, docOf, settle, sigOf, overlaps, text,
  COLS2} from './wrap-fixtures.mjs';

before(loadStyles);

// 2 columns of 288 px (x 96..384 and 432..720); a 300 x 200 float
// centred in the margin box: page x 258..558, y 146..346
const body = (n = 30) => p(anchorRun({w: 300, ht: 200,
  h: ['margin', al('center')], v: ['paragraph', off(50)]}) +
  r(text(2))) + Array.from({length: n}, () => p(r(text(2)))).join('');

describe('I3: a float across two columns', () => {
  it('the lines of both columns beside it are wrapped: none under ' +
    'it, those in column 2 start right of it', async () => {
    const {L, P} = settle(await docOf(body(), COLS2));
    assert.deepEqual(overlaps(L, P), []);
    assert.equal(M.wrapPass(L, P), null);
    const [c1, c2] = P.framesOf(P.at(0));
    const beside = (fr) => fr.frags.flatMap((f) => {
      const it = L.byId.get(f.id);
      return it.lines.slice(f.l0, f.l1).filter((ln) => f.y + ln.y +
        ln.h > 146 && f.y + ln.y < 346).map((ln) => fr.x + ln.x);
    });
    const l1 = beside(c1), l2 = beside(c2);
    assert.ok(l1.length >= 5 && l2.length >= 5, `${l1} / ${l2}`);
    for (const x of l2) assert.ok(x >= 558 + 12 - 0.5, `x ${x}`);
    for (const x of l1) assert.equal(x, 96);
  });

  it('settles the same after edits as from a fresh open', async () => {
    const d = new M.Document(await docOf(body(), COLS2));
    let {L, P} = settle(d.doc);
    for (const [b, ins] of [[3, 'one two three '], [10, 'four '],
      [14, text(1) + ' ']]) {
      d.apply({op: 'replaceText', block: [0, b], at: 0, del: 0, ins});
      ({L, P} = settle(d.doc, {L, P}));
      const fr = settle(d.doc);
      assert.deepEqual(sigOf(L, P), sigOf(fr.L, fr.P), `block ${b}`);
      assert.deepEqual(overlaps(L, P), []);
    }
  });
});
