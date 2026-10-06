// Edit: typing, Enter, line break, tab, overwrite (pure commands over
// a Document, no layout).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {entryText} from './docx-compare.mjs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {mk, texts, ids, P, C, SEL, at, undoable, valid, box, raw, O, S,
  bold, plain} from './edit-docs.mjs';

const two = (t1, t2) => ['' + t1 + t2, {runs: [
  {start: 0, end: t1.length, rPr: plain},
  {start: t1.length, end: t1.length + t2.length, rPr: bold}]}];
const DATE = new Date(Date.UTC(2026, 0, 1));
const roundTrip = async (d) => readDocx(await writeDocx(d.doc,
  {date: DATE}));

describe('typeText', () => {
  it('at the start, middle and end', () => {
    for (const [off, want] of [[0, 'Xabc'], [1, 'aXbc'],
      [3, 'abcX']]) {
      const d = mk(['abc']);
      const s = undoable(d, () => E.typeText(d, C(d, 0, off), 'X'));
      assert.deepEqual(texts(d), [want]);
      assert.deepEqual(at(d, s), [0, off + 1]);
    }
  });
  it('in an empty paragraph', () => {
    const d = mk(['']);
    const s = undoable(d, () => E.typeText(d, C(d, 0, 0), 'hi'));
    assert.deepEqual(texts(d), ['hi']);
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 2, rPr: plain}]);
    assert.deepEqual(at(d, s), [0, 2]);
  });
  it('takes the preceding character\'s format', () => {
    const d = mk([two('ab', 'cd')]);
    E.typeText(d, C(d, 0, 4), 'X');
    assert.deepEqual(P(d, 0).runs[1], {start: 2, end: 5, rPr: bold});
  });
  it('over a selection: the first selected character\'s format', () => {
    const d = mk([two('ab', 'cd')]);
    const s = undoable(d, () => E.typeText(d, SEL(d, 0, 4, 0, 2), 'X'));
    assert.deepEqual(texts(d), ['abX']);
    assert.deepEqual(P(d, 0).runs[1], {start: 2, end: 3, rPr: bold});
    assert.deepEqual(at(d, s), [0, 3]);
    const e = mk([two('ab', 'cd')]);
    E.typeText(e, SEL(e, 0, 1, 0, 3), 'X');
    assert.deepEqual(texts(e), ['aXd']);
    assert.deepEqual(P(e, 0).runs[0], {start: 0, end: 2, rPr: plain});
  });
  it('over a selection across paragraphs: one undo step', () => {
    const d = mk(['abc', 'def', 'ghi']);
    const id0 = ids(d)[0];
    const s = undoable(d, () => E.typeText(d, SEL(d, 0, 1, 2, 2), 'X'));
    assert.deepEqual(texts(d), ['aXi']);
    assert.equal(ids(d)[0], id0);
    assert.deepEqual(at(d, s), [0, 2]);
  });
  it('surrogate pairs and ZWJ sequences', () => {
    const d = mk(['ab']);
    let s = E.typeText(d, C(d, 0, 1), '\u{1F600}');
    assert.deepEqual(at(d, s), [0, 3]);
    s = E.typeText(d, s, '\u{1F469}\u200d\u{1F4BB}');
    assert.deepEqual(texts(d), ['a\u{1F600}\u{1F469}\u200d\u{1F4BB}b']);
    assert.deepEqual(at(d, s), [0, 8]);
    valid(d);
  });
  it('\\n splits paragraphs, \\t is a tab character', () => {
    const d = mk([['ab', {pPr: {jc: 'center', extra: []}}]]);
    const id0 = ids(d)[0];
    const s = undoable(d, () => E.typeText(d, C(d, 0, 1), 'x\ny\tz'));
    assert.deepEqual(texts(d), ['ax', 'y\tzb']);
    assert.equal(ids(d)[0], id0);
    assert.ok(ids(d)[1] > id0);
    assert.deepEqual(P(d, 1).inlines, {});
    assert.deepEqual(P(d, 1).pPr, {jc: 'center', extra: []});
    assert.deepEqual(at(d, s), [1, 3]);
  });
  it('several \\n, \\r\\n, and dropped control characters', () => {
    const d = mk(['ab']);
    const s = E.typeText(d, C(d, 0, 2),
      '1\r\n2\n\n3\u0007\ufffc\u0000');
    assert.deepEqual(texts(d), ['ab1', '2', '', '3']);
    assert.deepEqual(at(d, s), [3, 1]);
    assert.equal(new Set(ids(d)).size, 4);
    valid(d);
  });
  it('a lone surrogate becomes U+FFFD', () => {
    const d = mk(['']);
    E.typeText(d, C(d, 0, 0), 'a\ud800b');
    assert.deepEqual(texts(d), ['a\ufffdb']);
  });
  it('nothing to type: no change, sel returned', () => {
    const d = mk(['ab']);
    const c = C(d, 0, 1);
    assert.equal(E.typeText(d, c, '\u0001'), c);
    assert.equal(d.undoDepth, 0);
  });
  it('100k characters in linear time (< 1 s)', () => {
    const d = mk(['ab']);
    const t = 'abcdefghij'.repeat(10000);
    const t0 = performance.now();
    const s = E.typeText(d, C(d, 0, 1), t);
    assert.ok(performance.now() - t0 < 1000);
    assert.equal(P(d, 0).text.length, 100002);
    assert.deepEqual(at(d, s), [0, 100001]);
  });
  it('after a hyperlink: text lands outside the link', async () => {
    const link = raw('hyperlink', 'p', 'link');
    const d = mk([['a' + O, {runs: [{start: 0, end: 1, rPr: bold},
      {start: 1, end: 2, rPr: plain}], inlines: {1: link}}]]);
    const s = undoable(d, () => E.typeText(d, C(d, 0, 2), 'X'));
    assert.deepEqual(texts(d), ['a' + O + 'X']);
    assert.deepEqual(P(d, 0).inlines, {1: link});
    assert.deepEqual(at(d, s), [0, 3]);
    const back = await roundTrip(d);
    const p = back.sections[0].blocks[0];
    assert.equal(p.text, 'a' + O + 'X');
    assert.equal(p.inlines[1].node.name, 'w:hyperlink');
    assert.deepEqual(p.inlines[1].node.children, []);
  });
  it('in a paragraph made only of inlines', () => {
    const link = raw('hyperlink', 'p', 'l');
    const d = mk([[O, {inlines: {0: link}}]]);
    E.typeText(d, C(d, 0, 1), 'x');
    E.typeText(d, C(d, 0, 0), 'y');
    assert.deepEqual(texts(d), ['y' + O + 'x']);
    assert.deepEqual(P(d, 0).inlines, {1: link});
    valid(d);
  });
  it('an empty document (no blocks): refused', () => {
    const d = mk([]);
    const c = S.caret({id: 1, off: 0});
    assert.equal(E.typeText(d, c, 'x'), c);
    assert.equal(d.undoDepth, 0);
  });
  it('a position not in the document: refused', () => {
    const d = mk(['ab']);
    const c = S.caret({id: 999999, off: 0});
    assert.equal(E.typeText(d, c, 'x'), c);
    assert.equal(E.splitPara(d, c), c);
  });
  it('next to a kept block: a new paragraph there', () => {
    const d = mk([box()]);
    const b = ids(d)[0];
    let s = undoable(d, () => E.typeText(d, S.caret({id: b, off: 1}),
      'x'));
    assert.deepEqual(texts(d), ['#', 'x']);
    assert.deepEqual(at(d, s), [1, 1]);
    s = E.typeText(d, S.caret({id: b, off: 0}), 'y');
    assert.deepEqual(texts(d), ['y', '#', 'x']);
    assert.deepEqual(at(d, s), [0, 1]);
  });
  it('coalesces with a key, not with \\n or \\t', () => {
    const d = mk(['']);
    let s = E.typeText(d, C(d, 0, 0), 'a', {key: 'k'});
    s = E.typeText(d, s, 'b', {key: 'k'});
    assert.equal(d.undoDepth, 1);
    s = E.typeText(d, s, '\t', {key: 'k'});
    E.typeText(d, s, 'c', {key: 'k'});
    assert.equal(d.undoDepth, 3);
  });
});

describe('typeText: undo steps and failures', () => {
  it('a replaced selection is a step of its own', () => {
    const d = mk(['']);
    let s = E.typeText(d, C(d, 0, 0), 'a', {key: 'k'});
    s = E.typeText(d, s, 'b', {key: 'k'});
    assert.equal(d.undoDepth, 1);
    E.typeText(d, SEL(d, 0, 0, 0, 1), 'X', {key: 'k'});
    assert.deepEqual(texts(d), ['Xb']);
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.deepEqual(texts(d), ['ab']);
  });
  it('a failing op mid-command changes nothing', () => {
    const d = mk(['abc', 'def', 'ghi']);
    E.typeText(d, C(d, 0, 0), 'z', {key: 'k'});
    const before = structuredClone(d.doc.sections), n = d.undoDepth;
    const real = d.apply.bind(d);
    let k = 0;
    d.apply = (op, o) => {
      if (++k === 3) throw new Error('injected');
      return real(op, o);
    };
    assert.throws(() => E.typeText(d, SEL(d, 0, 2, 2, 1), 'X',
      {key: 'k'}), /injected/);
    assert.deepEqual(d.doc.sections, before);
    assert.equal(d.undoDepth, n);
    assert.equal(d.canRedo, false);
    d.apply = real;
    E.typeText(d, C(d, 0, 1), 'y', {key: 'k'});
    assert.equal(d.undoDepth, n);
  });
});

describe('overwrite', () => {
  it('replaces the next grapheme', () => {
    const d = mk(['a\u{1F600}c']);
    const s = undoable(d, () => E.typeText(d, C(d, 0, 1), 'X',
      {overwrite: true}));
    assert.deepEqual(texts(d), ['aXc']);
    assert.deepEqual(at(d, s), [0, 2]);
    E.overwrite(d, s, 'YZ');
    assert.deepEqual(texts(d), ['aXYZ']);
  });
  it('inserts at the paragraph end and before an inline', () => {
    const d = mk(['ab']);
    E.typeText(d, C(d, 0, 2), 'X', {overwrite: true});
    assert.deepEqual(texts(d), ['abX']);
    const link = raw('hyperlink', 'p', 'l');
    const e = mk([['a' + O, {inlines: {1: link}}]]);
    E.typeText(e, C(e, 0, 1), 'X', {overwrite: true});
    assert.deepEqual(texts(e), ['aX' + O]);
  });
  it('a selection is replaced, not overwritten further', () => {
    const d = mk(['abcd']);
    E.typeText(d, SEL(d, 0, 1, 0, 2), 'X', {overwrite: true});
    assert.deepEqual(texts(d), ['aXcd']);
  });
});

describe('splitPara (Enter)', () => {
  it('in the middle: carries pPr and pStyle, fresh id', () => {
    const pPr = {jc: 'right', extra: []};
    const d = mk([['abcd', {pPr, pStyle: 'Heading1'}]]);
    const [id0] = ids(d);
    const s = undoable(d, () => E.splitPara(d, C(d, 0, 2)));
    assert.deepEqual(texts(d), ['ab', 'cd']);
    assert.equal(ids(d)[0], id0);
    assert.ok(ids(d)[1] > id0);
    assert.deepEqual(P(d, 1).pPr, pPr);
    assert.equal(P(d, 1).pStyle, 'Heading1');
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('at the start and the end', () => {
    const d = mk(['ab']);
    let s = E.splitPara(d, C(d, 0, 0));
    assert.deepEqual(texts(d), ['', 'ab']);
    assert.deepEqual(at(d, s), [1, 0]);
    s = E.splitPara(d, C(d, 1, 2));
    assert.deepEqual(texts(d), ['', 'ab', '']);
    assert.deepEqual(at(d, s), [2, 0]);
  });
  it('at the end of a heading: its next style (Normal)', () => {
    const d = mk([['Head', {pStyle: 'Heading1'}]]);
    undoable(d, () => E.splitPara(d, C(d, 0, 4)));
    assert.equal(P(d, 0).pStyle, 'Heading1');
    assert.equal(P(d, 1).pStyle, undefined);
  });
  it('a style whose next is another style', () => {
    const d = mk([['x', {pStyle: 'A'}]]);
    d.doc.styles.styles.set('A', {id: 'A', type: 'paragraph',
      next: 'B', pPr: plain, rPr: plain, extra: [], raw: null});
    d.doc.styles.styles.set('B', {id: 'B', type: 'paragraph',
      pPr: plain, rPr: plain, extra: [], raw: null});
    E.splitPara(d, C(d, 0, 1));
    assert.equal(P(d, 1).pStyle, 'B');
  });
  it('no next in the style table: the style is kept', () => {
    const d = mk([['x', {pStyle: 'ListParagraph'}]]);
    E.splitPara(d, C(d, 0, 1));
    assert.equal(P(d, 1).pStyle, 'ListParagraph');
  });
  it('without a style table: Heading N and Title by name', () => {
    for (const [st, want] of [['Heading2', undefined],
      ['Title', undefined], ['Quote', 'Quote']]) {
      const d = mk([['x', {pStyle: st}]], {styles: false});
      E.splitPara(d, C(d, 0, 1));
      assert.equal(P(d, 1).pStyle, want, st);
    }
  });
  it('in an empty list item: removes the numbering', () => {
    const pPr = {numPr: {ilvl: 0, numId: 1}, jc: 'left', extra: []};
    const d = mk([['', {pPr}]]);
    const s = undoable(d, () => E.splitPara(d, C(d, 0, 0)));
    assert.deepEqual(texts(d), ['']);
    assert.deepEqual(P(d, 0).pPr, {jc: 'left', extra: []});
    assert.deepEqual(at(d, s), [0, 0]);
  });
  it('at the end of a list item: the next is numbered too', () => {
    const pPr = {numPr: {ilvl: 0, numId: 1}, extra: []};
    const d = mk([['item', {pPr}]]);
    E.splitPara(d, C(d, 0, 4));
    assert.deepEqual(P(d, 1).pPr, pPr);
  });
  it('deletes the selection, then splits', () => {
    const d = mk(['abcdef', 'gh']);
    const s = undoable(d, () => E.splitPara(d, SEL(d, 0, 2, 0, 4)));
    assert.deepEqual(texts(d), ['ab', 'ef', 'gh']);
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('next to a kept block: an empty paragraph there', () => {
    const d = mk([box()]);
    const b = ids(d)[0];
    let s = E.splitPara(d, S.caret({id: b, off: 1}));
    assert.deepEqual(texts(d), ['#', '']);
    assert.deepEqual(at(d, s), [1, 0]);
    s = E.splitPara(d, S.caret({id: b, off: 0}));
    assert.deepEqual(texts(d), ['', '#', '']);
    assert.deepEqual(at(d, s), [1, 0]);
  });
});

describe('lineBreak and insertTab', () => {
  it('a line break is a \\n character in the run; reads back equal',
    async () => {
      const d = mk([['ab', {rPr: bold}]]);
      const s = undoable(d, () => E.lineBreak(d, C(d, 0, 1)));
      assert.deepEqual(texts(d), ['a\nb']);
      assert.deepEqual(P(d, 0).inlines, {});
      assert.deepEqual(P(d, 0).runs, [{start: 0, end: 3, rPr: bold}]);
      assert.deepEqual(at(d, s), [0, 2]);
      const back = await roundTrip(d);
      const p = back.sections[0].blocks[0];
      assert.deepEqual([p.text, p.inlines, p.runs],
        [P(d, 0).text, P(d, 0).inlines, P(d, 0).runs]);
      const xml = await entryText(await writeDocx(d.doc, {date: DATE}),
        'word/document.xml');
      assert.match(xml, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t>a<\/w:t><w:br\/>/);
    });
  it('a tab is a \\t character in the run; reads back equal',
    async () => {
      const d = mk([['ab', {rPr: bold}]]);
      const s = undoable(d, () => E.insertTab(d, C(d, 0, 2)));
      assert.deepEqual(texts(d), ['ab\t']);
      assert.deepEqual(P(d, 0).inlines, {});
      assert.deepEqual(at(d, s), [0, 3]);
      const p = (await roundTrip(d)).sections[0].blocks[0];
      assert.deepEqual([p.text, p.inlines, p.runs],
        [P(d, 0).text, P(d, 0).inlines, P(d, 0).runs]);
      const xml = await entryText(await writeDocx(d.doc, {date: DATE}),
        'word/document.xml');
      assert.match(xml, /<w:b\/><\/w:rPr><w:t>ab<\/w:t><w:tab\/><\/w:r>/);
    });
  it('replace a selection', () => {
    const d = mk(['abc']);
    E.lineBreak(d, SEL(d, 0, 0, 0, 2));
    assert.deepEqual(texts(d), ['\nc']);
  });
});

describe('a typed tab and line break are the reopened ones', () => {
  /** d with 'one two' typed, a tab, ' three' (typed), and its copy
   * after a save and reopen, as a Document. */
  async function both() {
    const d = mk(['one two']);
    E.insertTab(d, C(d, 0, 7));
    E.typeText(d, C(d, 0, 8), ' three');
    const back = mk([]);
    back.doc.sections[0].blocks = (await roundTrip(d)).sections[0]
      .blocks;
    back.clearHistory();
    return [d, back];
  }
  it('typed Tab and Shift-Enter: save and read back equal', async () => {
    const d = mk(['ab']);
    E.insertTab(d, C(d, 0, 1));
    E.lineBreak(d, C(d, 0, 2));
    E.typeText(d, C(d, 0, 3), 'x\ty');
    const p = (await roundTrip(d)).sections[0].blocks[0];
    assert.equal(P(d, 0).text, 'a\t\nx\tyb');
    assert.deepEqual([p.text, p.inlines, p.runs],
      [P(d, 0).text, P(d, 0).inlines, P(d, 0).runs]);
  });
  it('Backspace after a tab removes it, one character', async () => {
    for (const d of await both()) {
      X.deleteBack(d, C(d, 0, 8));
      assert.deepEqual(texts(d), ['one two three']);
    }
  });
  it('overwrite stops at a tab and a line break', async () => {
    for (const d of await both()) {
      E.typeText(d, C(d, 0, 4), 'TWOX', {overwrite: true});
      assert.deepEqual(texts(d), ['one TWOX\t three']);
    }
    const d = mk(['ab']);
    E.lineBreak(d, C(d, 0, 1));
    E.typeText(d, C(d, 0, 0), 'QQ', {overwrite: true});
    assert.deepEqual(texts(d), ['QQ\nb']);
  });
  it('Ctrl-Backspace and Ctrl-Delete reach the same places',
    async () => {
      const got = [];
      for (const d of await both()) {
        const t0 = texts(d)[0];
        X.deleteWordBack(d, C(d, 0, 8));
        const a = texts(d)[0];
        d.undo();
        X.deleteWordForward(d, C(d, 0, 7));
        got.push([t0, a, texts(d)[0]]);
      }
      assert.deepEqual(got[0], got[1]);
    });
  it('a tab typed right after a hyperlink is not in it', async () => {
    const d = mk([['A ' + O + ' b', {inlines: {2: raw('hyperlink', 'p',
      'link')}}]]);
    const link = P(d, 0).inlines[2];
    E.insertTab(d, C(d, 0, 3));
    assert.equal(P(d, 0).text, 'A ' + O + '\t b');
    assert.deepEqual(P(d, 0).inlines, {2: link});
    const p = (await roundTrip(d)).sections[0].blocks[0];
    assert.equal(p.text, P(d, 0).text);
    assert.deepEqual(p.inlines[2].node, link.node);
  });
});
