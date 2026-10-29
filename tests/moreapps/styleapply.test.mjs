// StyleApply: linked styles by Word's rule, update to match.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as SA from '../../tools/moreapps/!Letters/StyleApply';
import * as FS from '../../tools/moreapps/!Letters/FormatSet';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import {createStyle, modifyStyle}
  from '../../tools/moreapps/!Letters/StyleCmd';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {mk, P, C, SEL, undoable, bold, plain} from './edit-docs.mjs';

const T = (d) => new Typing(d);
const run = (d, fn) => undoable(d, () => fn(T(d)));

/** A document with a linked pair Quote / Quote Char. */
function linked(blocks) {
  const d = mk(blocks);
  const r = createStyle(d.doc.styles, {type: 'paragraph',
    name: 'Quote', basedOn: 'Normal', link: true,
    rPr: {i: true, extra: []}});
  assert.ok(r);
  d.doc.styles = r.table;
  return {d, pid: r.id, cid: r.id + 'Char'};
}

describe('StyleApply.applyStyle', () => {
  it('linked style over a whole paragraph applies the paragraph half',
    () => {
      const {d, pid} = linked(['abcd', 'ef']);
      run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 0, 4), pid));
      assert.equal(P(d, 0).pStyle, pid);
      assert.equal(P(d, 0).runs.some((r) => r.rStyle), false);
      assert.equal(d.undoDepth, 1);
    });
  it('the character id over a whole paragraph also takes it', () => {
    const {d, pid, cid} = linked(['abcd']);
    run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 0, 4), cid));
    assert.equal(P(d, 0).pStyle, pid);
  });
  it('linked style over part of a paragraph applies the character half',
    () => {
      const {d, cid} = linked(['abcd']);
      run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 1, 0, 3), pidOf(d)));
      assert.equal(P(d, 0).pStyle, undefined);
      assert.deepEqual(P(d, 0).runs.map((r) => r.rStyle),
        [undefined, cid, undefined]);
    });
  it('collapsed caret + character style goes into pending', () => {
    // a linked style at a caret is the paragraph half (Word's rule)
    const {d, cid, pid} = linked(['abcd']);
    run(d, (t) => SA.applyStyle(d, t, C(d, 0, 2), cid));
    assert.equal(P(d, 0).pStyle, pid);
    const d2 = mk(['abcd']);
    d2.doc.styles = createStyle(d2.doc.styles, {type: 'character',
      name: 'Loud', rPr: {b: true, extra: []}}).table;
    const o2 = SA.applyStyle(d2, T(d2), C(d2, 0, 2), 'Loud');
    assert.deepEqual(o2.pending, {rStyle: 'Loud'});
    assert.equal(d2.undoDepth, 0);
    // and the text typed next is styled
    const t2 = T(d2);
    t2.type(C(d2, 0, 2), 'XY', {rStyle: o2.pending.rStyle});
    assert.equal(P(d2, 0).text, 'abXYcd');
    assert.deepEqual(P(d2, 0).runs.map((r) => [r.start, r.end,
      r.rStyle]), [[0, 2, undefined], [2, 4, 'Loud'],
      [4, 6, undefined]]);
  });
  it('applying the default style removes pStyle', () => {
    const {d, pid} = linked(['abcd']);
    run(d, (t) => SA.applyStyle(d, t, C(d, 0, 0), pid));
    assert.equal(P(d, 0).pStyle, pid);
    run(d, (t) => SA.applyStyle(d, t, C(d, 0, 0), 'Normal'));
    assert.equal(P(d, 0).pStyle, undefined);
  });
  it('unknown ids are refused; FormatSet re-exports', () => {
    const d = mk(['ab']);
    assert.equal(FS.applyStyle, SA.applyStyle);
    assert.throws(() => SA.applyStyle(d, T(d), C(d, 0, 0), 'Nope'),
      RangeError);
  });
});

function pidOf(d) {
  for (const s of d.doc.styles.styles.values())
    if (s.name === 'Quote') return s.id;
  return null;
}

describe('StyleApply: the whole-paragraph rule', () => {
  it('a selection from an empty paragraph to the next start: ' +
    'paragraph half', () => {
    const {d, pid} = linked(['', 'efgh']);
    run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 1, 0), pid));
    assert.equal(P(d, 0).pStyle, pid);
    assert.equal(P(d, 1).pStyle, undefined);
  });
  const kinds = (d, k) => [P(d, k).pStyle, P(d, k).runs.map(
    (r) => r.rStyle)];
  it('an empty paragraph gets the paragraph half', () => {
    const {d, pid} = linked(['']);
    run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 0, 0), pid));
    assert.equal(P(d, 0).pStyle, pid);
  });
  it('a multi-paragraph selection partial at the start: character',
    () => {
      const {d, pid, cid} = linked(['abcd', 'efgh']);
      run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 1, 1, 4), pid));
      assert.equal(P(d, 0).pStyle, undefined);
      assert.equal(P(d, 1).pStyle, undefined);
      assert.deepEqual(kinds(d, 0)[1], [undefined, cid]);
      assert.deepEqual(kinds(d, 1)[1], [cid]);
    });
  it('partial at the end: character', () => {
    const {d, pid, cid} = linked(['abcd', 'efgh']);
    run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 1, 2), pid));
    assert.equal(P(d, 0).pStyle, undefined);
    assert.equal(P(d, 1).pStyle, undefined);
    assert.deepEqual(kinds(d, 0)[1], [cid]);
  });
  it('ending exactly at a paragraph end: paragraph half', () => {
    const {d, pid} = linked(['abcd', 'efgh']);
    run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 1, 4), pid));
    assert.equal(P(d, 0).pStyle, pid);
    assert.equal(P(d, 1).pStyle, pid);
  });
  it('ending at offset 0 of the next paragraph: it is not counted',
    () => {
      const {d, pid} = linked(['abcd', 'efgh']);
      run(d, (t) => SA.applyStyle(d, t, SEL(d, 0, 0, 1, 0), pid));
      assert.equal(P(d, 0).pStyle, pid);
      assert.equal(P(d, 1).pStyle, undefined);
    });
});

describe('StyleApply.updateToMatch', () => {
  const sty = (d, id) => d.doc.styles.styles.get(id);
  it('moves direct bold and centring into the style and clears them',
    () => {
      const d = mk([['abcd', {pStyle: 'Heading2', pPr: {jc: 'center',
        extra: []}, runs: [{start: 0, end: 4, rPr: {...bold,
          i: true}}]}]]);
      const out = run(d, (t) => SA.updateToMatch(d, t, C(d, 0, 1)));
      assert.equal(out.sel.head.off, 1);
      assert.equal(sty(d, 'Heading2').pPr.jc, 'center');
      assert.equal(sty(d, 'Heading2').rPr.i, true);
      assert.equal(P(d, 0).pPr.jc, undefined);
      assert.deepEqual(P(d, 0).runs[0].rPr, plain);
      assert.equal(d.undoDepth, 1);
    });
  it('the default style when no pStyle', () => {
    const d = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}]]);
    run(d, (t) => SA.updateToMatch(d, t, C(d, 0, 0)));
    assert.equal(sty(d, 'Normal').rPr.b, true);
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
  });
  it('disagreeing runs change nothing', () => {
    const d = mk([['abcd', {pStyle: 'Heading2', runs: [
      {start: 0, end: 2, rPr: plain},
      {start: 2, end: 4, rPr: bold}]}]]);
    const before = JSON.stringify([d.doc.styles.styles.get('Heading2'),
      P(d, 0)]);
    SA.updateToMatch(d, T(d), C(d, 0, 0));
    assert.equal(d.undoDepth, 0);
    assert.equal(JSON.stringify([d.doc.styles.styles.get('Heading2'),
      P(d, 0)]), before);
  });
  it('a linked pair stays in step; styles never mutated', () => {
    const {d, pid, cid} = linked([]);
    d.doc.sections[0].blocks = [newPara('abcd', {pStyle: pid,
      runs: [{start: 0, end: 4, rPr: bold}]})];
    const before = d.doc.styles;
    run(d, (t) => SA.updateToMatch(d, t, C(d, 0, 0)));
    assert.equal(sty(d, pid).rPr.b, true);
    assert.equal(sty(d, cid).rPr.b, true);
    assert.notEqual(d.doc.styles, before);
    assert.equal(before.styles.get(pid).rPr.b, undefined);
    assert.equal(d.undoDepth, 1);
  });
  it('direct values equal to the style: cleared, table untouched',
    () => {
      const d = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}]]);
      d.doc.styles = modifyStyle(d.doc.styles, 'Normal',
        {rPr: {b: true}});
      const table = d.doc.styles;
      run(d, (t) => SA.updateToMatch(d, t, C(d, 0, 0)));
      assert.equal(d.doc.styles, table);
      assert.deepEqual(P(d, 0).runs[0].rPr, plain);
      assert.equal(d.undoDepth, 1);
    });
  it('no style table: a RangeError like applyStyle, not a TypeError',
    () => {
      const d = mk([['abcd', {pStyle: 'Quote'}]]);
      d.doc.styles = null;
      assert.throws(() => SA.updateToMatch(d, T(d), C(d, 0, 0)),
        RangeError);
    });
  it('nothing direct: no step', () => {
    const d = mk(['abcd']);
    SA.updateToMatch(d, T(d), C(d, 0, 0));
    assert.equal(d.undoDepth, 0);
  });
  it('FormatApply ids styleUpdate and styleClear', () => {
    const d = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}]]);
    assert.ok(FA.isFormat('styleUpdate') && FA.isFormat('styleClear'));
    FA.apply('styleUpdate', d, T(d), C(d, 0, 0));
    assert.equal(sty(d, 'Normal').rPr.b, true);
    const e = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}]]);
    FA.apply('styleClear', e, T(e), SEL(e, 0, 0, 0, 4));
    assert.deepEqual(P(e, 0).runs[0].rPr, plain);
  });
});
