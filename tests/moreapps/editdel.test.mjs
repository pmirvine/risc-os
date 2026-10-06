// EditDel: Backspace, Delete, deleting a selection, word deletes
// (pure commands over a Document, no layout).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {orderedPos} from '../../tools/moreapps/!Word/EditPos';
import {newPara, newSection, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {mk, texts, ids, P, C, SEL, at, undoable, valid, snap, box, S}
  from './edit-docs.mjs';

/** Sections [ab][cd][ef] (the last one newDoc's, with its page). */
function three() {
  const d = mk(['ef']);
  const mkSec = (t) => {
    const s = newSection();
    s.blocks.push(newPara(t));
    return s;
  };
  d.doc.sections.unshift(mkSec('ab'), mkSec('cd'));
  return d;
}
const counts = (d) => d.doc.sections.map((s) => s.blocks.length);
const secTexts = (doc) => doc.sections.map((s) =>
  s.blocks.map((b) => b.text));
/** Make the n-th d.apply throw (before applying). */
function failAt(d, n) {
  const real = d.apply.bind(d);
  let k = 0;
  d.apply = (op, o) => {
    if (++k === n) throw new Error('injected');
    return real(op, o);
  };
}

const pp = (jc) => ({pPr: {jc, extra: []}});

describe('deleteBack and deleteForward: graphemes', () => {
  it('a surrogate pair, a combining sequence, a ZWJ sequence', () => {
    for (const [t, off, want, wantOff] of [
      ['a\u{1F600}', 3, 'a', 1], ['ae\u0301b', 3, 'ab', 1],
      ['x\u{1F469}\u200d\u{1F4BB}', 6, 'x', 1], ['abc', 2, 'ac', 1]]) {
      const d = mk([t]);
      const s = undoable(d, () => X.deleteBack(d, C(d, 0, off)));
      assert.deepEqual(texts(d), [want], t);
      assert.deepEqual(at(d, s), [0, wantOff]);
    }
    for (const [t, off, want] of [['\u{1F600}a', 0, 'a'],
      ['ae\u0301b', 1, 'ab'], ['abc', 1, 'ac']]) {
      const d = mk([t]);
      const s = undoable(d, () => X.deleteForward(d, C(d, 0, off)));
      assert.deepEqual(texts(d), [want], t);
      assert.deepEqual(at(d, s), [0, off]);
    }
  });
  it('whole clusters in one press: skin tone, flag, marks, family',
    () => {
      const CLUSTERS = {
        'skin tone': '\u{1F44D}\u{1F3FD}',
        'flag': '\u{1F1EB}\u{1F1F7}',
        'double combining mark': 'e\u0301\u0323',
        'ZWJ family': '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}',
      };
      for (const [name, c] of Object.entries(CLUSTERS)) {
        for (const back of [true, false]) {
          const d = mk(['x' + c + 'y', 'z']);
          const [id0, id1] = ids(d);
          const s = undoable(d, () => (back
            ? X.deleteBack(d, C(d, 0, 1 + c.length))
            : X.deleteForward(d, C(d, 0, 1))));
          const msg = name + (back ? ' Backspace' : ' Delete');
          assert.deepEqual(texts(d), ['xy', 'z'], msg);
          assert.deepEqual(ids(d), [id0, id1], msg);
          assert.deepEqual(P(d, 0).runs,
            [{start: 0, end: 2, rPr: {extra: []}}], msg);
          assert.deepEqual(at(d, s), [0, 1], msg);
          assert.equal(d.undoDepth, 1, msg);
          d.undo();
          assert.deepEqual(texts(d), ['x' + c + 'y', 'z'], msg);
        }
      }
    });
  it('document start and end: no change, sel returned', () => {
    const d = mk(['ab', 'cd']);
    const a = C(d, 0, 0), b = C(d, 1, 2);
    assert.equal(X.deleteBack(d, a), a);
    assert.equal(X.deleteForward(d, b), b);
    assert.equal(X.deleteWordBack(d, a), a);
    assert.equal(X.deleteWordForward(d, b), b);
    assert.equal(d.undoDepth, 0);
  });
});

describe('merging paragraphs', () => {
  it('Backspace: the first paragraph\'s properties win', () => {
    const d = mk([['ab', pp('left')], ['cd', pp('right')]]);
    const [a] = ids(d);
    const s = undoable(d, () => X.deleteBack(d, C(d, 1, 0)));
    assert.deepEqual(texts(d), ['abcd']);
    assert.deepEqual(ids(d), [a]);
    assert.equal(P(d, 0).pPr.jc, 'left');
    assert.deepEqual(at(d, s), [0, 2]);
  });
  it('Backspace: an empty first paragraph is removed', () => {
    const d = mk([['', pp('left')], ['cd', pp('right')]]);
    const [, b] = ids(d);
    const s = undoable(d, () => X.deleteBack(d, C(d, 1, 0)));
    assert.deepEqual(ids(d), [b]);
    assert.equal(P(d, 0).pPr.jc, 'right');
    assert.deepEqual(at(d, s), [0, 0]);
  });
  it('Backspace: both empty, the first stays', () => {
    const d = mk([['', pp('left')], ['', pp('right')]]);
    const [a] = ids(d);
    X.deleteBack(d, C(d, 1, 0));
    assert.deepEqual(ids(d), [a]);
  });
  it('Delete: merges the next paragraph in', () => {
    const d = mk([['ab', pp('left')], ['cd', pp('right')]]);
    const [a] = ids(d);
    const s = undoable(d, () => X.deleteForward(d, C(d, 0, 2)));
    assert.deepEqual(texts(d), ['abcd']);
    assert.deepEqual(ids(d), [a]);
    assert.equal(P(d, 0).pPr.jc, 'left');
    assert.deepEqual(at(d, s), [0, 2]);
  });
  it('Delete in an empty paragraph: it goes, the next stays', () => {
    const d = mk([['', pp('left')], ['cd', pp('right')]]);
    const [, b] = ids(d);
    const s = undoable(d, () => X.deleteForward(d, C(d, 0, 0)));
    assert.deepEqual(ids(d), [b]);
    assert.equal(P(d, 0).pPr.jc, 'right');
    assert.deepEqual(at(d, s), [0, 0]);
  });
  it('not across a section break', () => {
    const d = mk(['ab']);
    const s2 = newSection();
    s2.blocks.push(newPara('cd'));
    d.doc.sections.push(s2);
    const c = C(d, 1, 0), e = C(d, 0, 2);
    assert.equal(X.deleteBack(d, c), c);
    assert.equal(X.deleteForward(d, e), e);
    assert.equal(d.undoDepth, 0);
  });
});

describe('kept blocks (tables): select, then delete', () => {
  it('Backspace after a table selects it, again deletes it', () => {
    const d = mk(['ab', box(), 'cd']);
    const [, t, c] = ids(d);
    const s = X.deleteBack(d, C(d, 2, 0));
    assert.deepEqual(s, S.select({id: t, off: 0}, {id: t, off: 1}));
    assert.equal(d.undoDepth, 0);
    const s2 = undoable(d, () => X.deleteBack(d, s));
    assert.deepEqual(texts(d), ['ab', 'cd']);
    assert.deepEqual(at(d, s2), [1, 0]);
    assert.equal(s2.head.id, c);
  });
  it('Delete before a table selects it', () => {
    const d = mk(['ab', box(), 'cd']);
    const t = ids(d)[1];
    const s = X.deleteForward(d, C(d, 0, 2));
    assert.deepEqual(s, S.select({id: t, off: 0}, {id: t, off: 1}));
    X.deleteForward(d, s);
    assert.deepEqual(texts(d), ['ab', 'cd']);
  });
  it('carets on the table itself', () => {
    const d = mk(['ab', box(), 'cd']);
    const t = ids(d)[1];
    const sel = S.select({id: t, off: 0}, {id: t, off: 1});
    assert.deepEqual(X.deleteBack(d, S.caret({id: t, off: 1})), sel);
    assert.deepEqual(X.deleteForward(d, S.caret({id: t, off: 0})),
      sel);
    assert.equal(d.undoDepth, 0);
  });
  it('the only block: an empty paragraph is left', () => {
    const d = mk([box()]);
    const t = ids(d)[0];
    const s = undoable(d, () => X.deleteSelection(d,
      S.select({id: t, off: 0}, {id: t, off: 1})));
    assert.deepEqual(texts(d), ['']);
    assert.deepEqual(at(d, s), [0, 0]);
    valid(d);
  });
});

describe('deleteSelection', () => {
  it('inside one paragraph', () => {
    const d = mk(['abcdef']);
    const s = undoable(d, () => X.deleteSelection(d,
      SEL(d, 0, 4, 0, 1)));
    assert.deepEqual(texts(d), ['aef']);
    assert.deepEqual(at(d, s), [0, 1]);
  });
  it('across 3 paragraphs and a table: survivors keep ids', () => {
    const d = mk(['abc', 'def', box(), 'ghi', 'jkl']);
    const [a, , , , e] = ids(d);
    const s = undoable(d, () => X.deleteSelection(d,
      SEL(d, 3, 2, 0, 1)));
    assert.deepEqual(texts(d), ['ai', 'jkl']);
    assert.deepEqual(ids(d), [a, e]);
    assert.deepEqual(at(d, s), [0, 1]);
  });
  it('a whole paragraph exactly (with its mark)', () => {
    const d = mk(['abc', 'def', 'ghi']);
    const [a, , c] = ids(d);
    let s = undoable(d, () => X.deleteSelection(d, SEL(d, 1, 0, 2, 0)));
    assert.deepEqual(texts(d), ['abc', 'ghi']);
    assert.deepEqual(ids(d), [a, c]);
    assert.deepEqual(at(d, s), [1, 0]);
    const e = mk(['abc', 'def', 'ghi']);
    const [x, , z] = ids(e);
    s = X.deleteSelection(e, SEL(e, 0, 3, 1, 3));
    assert.deepEqual(texts(e), ['abc', 'ghi']);
    assert.deepEqual(ids(e), [x, z]);
    assert.deepEqual(at(e, s), [0, 3]);
  });
  it('from a table to a paragraph', () => {
    const d = mk(['ab', box(), 'cd', 'ef']);
    const t = ids(d)[1];
    const s = X.deleteSelection(d, S.select({id: t, off: 0},
      {id: ids(d)[2], off: 1}));
    assert.deepEqual(texts(d), ['ab', 'd', 'ef']);
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('across a section break', () => {
    const d = mk(['ab', 'cd']);
    const s2 = newSection();
    s2.blocks.push(newPara('ef'), newPara('gh'));
    d.doc.sections.push(s2);
    const s = undoable(d, () => X.deleteSelection(d,
      SEL(d, 1, 1, 2, 1)));
    assert.deepEqual(texts(d), ['ab', 'cf', 'gh']);
    assert.deepEqual(at(d, s), [1, 1]);
  });
  it('across 3 sections: emptied sections get a paragraph', async () => {
    const DATE = new Date(Date.UTC(2026, 0, 1));
    for (const [k1, o1, k2, o2, want, caret] of [
      [0, 1, 2, 1, [['af'], [''], ['']], [0, 1]],
      [0, 0, 2, 1, [[''], [''], ['f']], [2, 0]],
      [0, 1, 2, 2, [['a'], [''], ['']], [0, 1]]]) {
      const d = three();
      const before = ids(d);
      const s = undoable(d, () => X.deleteSelection(d,
        SEL(d, k1, o1, k2, o2)));
      assert.deepEqual(counts(d), [1, 1, 1]);
      assert.deepEqual(secTexts(d.doc), want);
      assert.deepEqual(at(d, s), caret);
      const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
      assert.deepEqual(secTexts(back), want);
      d.undo();
      assert.deepEqual(ids(d), before);
    }
  });
  it('from after a table to the next section: the table\'s section ' +
    'keeps a last paragraph (it carries the section break)', async () => {
    // found by edit-roundtrip.test.mjs: the section ended with the
    // table, so the writer added a paragraph to carry its sectPr and
    // the file read back with one paragraph more than the model
    const d = three();
    d.doc.sections[0].blocks.push(box(), newPara('xy'));
    const t = ids(d)[1];
    const s = undoable(d, () => X.deleteSelection(d,
      S.select({id: t, off: 1}, {id: ids(d)[3], off: 1})));
    assert.deepEqual(secTexts(d.doc), [['ab', undefined, ''], ['d'],
      ['ef']]);
    assert.deepEqual(at(d, s), [3, 0]);
    const back = await readDocx(await writeDocx(d.doc,
      {date: new Date(Date.UTC(2026, 0, 1))}));
    assert.deepEqual(secTexts(back), secTexts(d.doc));
  });
  it('emptying a section of only a table', () => {
    const d = three();
    d.doc.sections[1].blocks = [box()];
    const t = ids(d)[1];
    const s = undoable(d, () => X.deleteSelection(d,
      S.select({id: t, off: 0}, {id: t, off: 1})));
    assert.deepEqual(secTexts(d.doc), [['ab'], [''], ['ef']]);
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('a failing op mid-command changes nothing', () => {
    const d = mk(['abc', 'def', box(), 'ghi']);
    X.deleteBack(d, C(d, 0, 1));
    d.undo();
    d.redo();
    const before = snap(d), n = d.undoDepth;
    failAt(d, 2);
    assert.throws(() => X.deleteSelection(d, SEL(d, 0, 1, 3, 1)),
      /injected/);
    assert.ok(deepEqual(d.doc.sections, before));
    assert.equal(d.undoDepth, n);
    assert.equal(d.canRedo, false);
  });
  it('collapsed: no change', () => {
    const d = mk(['ab']);
    const c = C(d, 0, 1);
    assert.equal(X.deleteSelection(d, c), c);
  });
  it('orderedPos orders without a layout', () => {
    const d = mk(['ab', box(), 'cd']);
    const o = orderedPos(d.doc, SEL(d, 2, 1, 0, 1));
    assert.deepEqual([o.from.id, o.to.id], [ids(d)[0], ids(d)[2]]);
  });
});

describe('deleteWordBack and deleteWordForward', () => {
  it('over spaces and punctuation', () => {
    for (const [t, off, want, o] of [['hello world', 11, 'hello ', 6],
      ['hello world', 6, 'world', 0], ['one, two', 5, 'two', 0],
      ['one, two', 8, 'one, ', 5], ['ab', 1, 'b', 0]]) {
      const d = mk([t]);
      const s = undoable(d, () => X.deleteWordBack(d, C(d, 0, off)));
      assert.deepEqual(texts(d), [want], t + '@' + off);
      assert.deepEqual(at(d, s), [0, o]);
    }
    for (const [t, off, want] of [['hello world', 0, 'world'],
      ['one, two', 3, 'onetwo'], ['one, two', 5, 'one, '],
      ['ab', 1, 'a']]) {
      const d = mk([t]);
      const s = undoable(d, () => X.deleteWordForward(d,
        C(d, 0, off)));
      assert.deepEqual(texts(d), [want], t + '@' + off);
      assert.deepEqual(at(d, s), [0, off]);
    }
  });
  it('at a paragraph edge: as Backspace / Delete', () => {
    const d = mk(['ab', 'cd']);
    X.deleteWordBack(d, C(d, 1, 0));
    assert.deepEqual(texts(d), ['abcd']);
    const e = mk(['ab', 'cd']);
    X.deleteWordForward(e, C(e, 0, 2));
    assert.deepEqual(texts(e), ['abcd']);
  });
});

describe('50k paragraphs', () => {
  it('deleting 40k of them: < 3 s, one undo step, ids back', () => {
    const list = [];
    for (let k = 0; k < 50000; k++) list.push('para ' + k);
    const d = mk(list);
    const before = snap(d);
    const t0 = performance.now();
    const s = X.deleteSelection(d, SEL(d, 5000, 2, 45000, 3));
    const t1 = performance.now();
    assert.ok(t1 - t0 < 3000, 'delete took ' + (t1 - t0));
    assert.equal(texts(d).length, 10000);
    assert.equal(P(d, 5000).text, 'paa 45000');
    assert.deepEqual(at(d, s), [5000, 2]);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.ok(performance.now() - t1 < 3000, 'undo');
    assert.ok(deepEqual(d.doc.sections, before));
  });
});
