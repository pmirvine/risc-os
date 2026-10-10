// AutoList: AutoFormat lists as you type. markerOf (every marker,
// start values, the refusals: '1.5', 'a.b', 'e.g.', '10000000000.',
// rounds that do not round-trip, mixed case, leading zeros); after a
// typed space or Tab (afterSpace, EditApply.run 'tab'): bullets and
// numbers made, continued or new, text after the caret kept; not in
// a list item, a style-numbered heading, numId 0, after an inline,
// after a link whose text is a marker, a space elsewhere, a
// selection; the two undo steps exact (the caret after the space);
// hostile numbering parts and a document with no package; written
// and read back; a 100,000-character paragraph.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {markerOf, afterSpace, MAX_MARKER, MAX_START}
  from '../../tools/moreapps/!Word/AutoList';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {addList} from '../../tools/moreapps/!Word/NumWrite';
import {entryOf, HIDDEN, matches}
  from '../../tools/moreapps/!Word/ListGallery';
import {listEntryOf} from '../../tools/moreapps/!Word/ListMake';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {formatNumber} from '../../tools/moreapps/!Word/NumFormat';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {Document} from '../../tools/moreapps/!Word/Document';
import {emptyDoc, newPara} from '../../tools/moreapps/!Word/Model';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {P, C, SEL, mk, blocks, S, O, raw} from './edit-docs.mjs';
import {listDocx, item, heading, lvl, STYLES_LIST}
  from './list-fixtures.mjs';
import {buildDocx, documentXml, numberingXml, p, r}
  from './build-docx.mjs';
import {entryText} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const state = (d) => structuredClone({sections: d.doc.sections,
  numbering: d.doc.numbering, rels: d.doc.rels, styles: d.doc.styles,
  meta: d.doc.meta});
const shown = (d) => {
  const m = labels(d.doc);
  return blocks(d).map((b) => (b.type !== 'p' ? '#'
    : m.has(b.id) ? m.get(b.id).text : null));
};
const texts = (d) => blocks(d).map((b) => (b.type === 'p' ? b.text
  : '#'));
const numId = (d, k) => (P(d, k).pPr.numPr || {}).numId ?? null;
const fromFile = async (bytes) => {
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  return d;
};

/**
 * Type s character by character at sel, as the window does: after a
 * single space, afterSpace (unless auto is false). The selection.
 */
function typeIn(d, t, sel, s, {auto = true} = {}) {
  for (const ch of s) {
    sel = t.type(sel, ch);
    if (auto && ch === ' ') sel = afterSpace(d, t, sel) || sel;
  }
  return sel;
}

describe('AutoList.markerOf', () => {
  const N = (entry, start) => ({kind: 'number', entry, start});
  const B = (entry) => ({kind: 'bullet', entry, start: 1});
  it('every marker, with its entry and start', () => {
    const want = {
      '*': B('disc'), '-': B('dash'), '>': B('arrow'),
      '1.': N('1.', 1), '1)': N('1)', 1), '(1)': N('(1)', 1),
      '3.': N('1.', 3), '0.': N('1.', 0), '12)': N('1)', 12),
      '(7)': N('(1)', 7), '10000.': N('1.', 10000),
      '32767.': N('1.', 32767),
      'a.': N('a.', 1), 'a)': N('a)', 1), 'c.': N('a.', 3),
      'z)': N('a)', 26), 'A.': N('A.', 1), 'M.': N('A.', 13),
      'v.': N('a.', 22), 'x.': N('a.', 24), 'C.': N('A.', 3),
      'i.': N('i.', 1), 'I.': N('I.', 1), 'ii.': N('i.', 2),
      'iv.': N('i.', 4), 'ix.': N('i.', 9), 'XIV.': N('I.', 14),
      'xxxix.': N('i.', 39), 'XXXIX.': N('I.', 39),
    };
    for (const [t, m] of Object.entries(want))
      assert.deepEqual(markerOf(t), m, t);
  });
  it('anything else is not a marker', () => {
    for (const t of ['', ' ', '1', 'a', '1.5', 'a.b', 'e.g.', 'e.g',
      '10000000000.', '99999.', '32768.', '01.', '00.', '-1.', '+1.',
      '1..', '(1', '1))', '(a)', 'A)', '(i)', 'i)', 'I)', 'ii)',
      'iiii.', 'ic.', 'IIII.', 'VV.', 'xl.', 'XL.', 'ivi.', 'Ii.',
      'iI.', 'ab.', 'mm.', 'dm.', '**', '--', '>>', '•', 'o',
      '1. ', '￼', '￼1.', '1.￼', '١.',
      '１.', '＊', '#', '1:', 'xxxviii)', '(xxxix.',
      'xxxviii.x', '12345678.', null, undefined, 42, {}]) {
      assert.equal(markerOf(t), null, JSON.stringify(t));
    }
    assert.equal(MAX_MARKER, 8);
    assert.equal(MAX_START, 32767);
    // 8 characters at most: '(32767)' (7) is one
    assert.deepEqual(markerOf('(32767)'), N('(1)', 32767));
    assert.deepEqual(markerOf('xxxviii.'), N('i.', 38), '8 in all');
    assert.equal(markerOf('(123456)'), null, 'more than 32767');
  });
  it('roman markers are exactly what NumFormat writes', () => {
    for (let n = 1; n <= 39; n++) {
      for (const [fmt, id] of [['lowerRoman', 'i.'],
        ['upperRoman', 'I.']]) {
        const t = formatNumber(n, fmt);
        const m = markerOf(t + '.');
        if (t.length + 1 > MAX_MARKER) assert.equal(m, null, t);
        else if (t.length === 1 && !/^[iI]$/.test(t))
          assert.equal(m.entry, t < 'a' ? 'A.' : 'a.', t);
        else assert.deepEqual(m, N(id, n), t);
      }
    }
  });
});

describe('ListGallery: the hidden entries', () => {
  it('dash, a. and (1) are entries, not in the galleries', () => {
    assert.deepEqual(HIDDEN.map((e) => e.id), ['dash', 'a.', '(1)']);
    assert.equal(entryOf('dash').levels[0].lvlText, '–');
    assert.equal(entryOf('a.').levels[0].numFmt, 'lowerLetter');
    assert.equal(entryOf('a.').levels[1].numFmt, 'lowerRoman');
    assert.equal(entryOf('(1)').levels[0].lvlText, '(%1)');
    assert.equal(entryOf('(1)').levels[1].lvlText, '(%2)');
    assert.equal(entryOf('(1)').name, '(1) (a) (i)');
    assert.ok(Object.isFrozen(HIDDEN) && Object.isFrozen(HIDDEN[0]));
  });
});

describe('NumWrite.addList opts.start', () => {
  it('level 0 starts there; bad values refused', () => {
    const a = addList(null, '1.', {start: 3, rand: () => 1});
    assert.equal(a.numbering.nums.get(a.numId).levels[0].start, 3);
    assert.equal(a.numbering.nums.get(a.numId).levels[1].start, 1);
    assert.ok(matches(a.numbering.nums.get(a.numId), '1.'));
    for (const s of [-1, 1.5, 2 ** 31, NaN, '3', null]) {
      assert.throws(() => addList(null, '1.', {start: s}), RangeError,
        String(s));
    }
  });
});

describe('AutoList.afterSpace: lists made as you type', () => {
  const cases = [
    ['* ', '•', 'disc'], ['- ', '–', 'dash'],
    ['> ', '➢', 'arrow'], ['1. ', '1.', '1.'], ['1) ', '1)', '1)'],
    ['(1) ', '(1)', '(1)'], ['a. ', 'a.', 'a.'], ['a) ', 'a)', 'a)'],
    ['A. ', 'A.', 'A.'], ['i. ', 'i.', 'i.'], ['I. ', 'I.', 'I.'],
    ['3. ', '3.', '1.'], ['iv. ', 'iv.', 'i.'], ['M. ', 'M.', 'A.'],
    ['(12) ', '(12)', '(1)'], ['0. ', '0.', '1.'],
  ];
  for (const [typed, label, entry] of cases) {
    it(`'${typed}' at a paragraph's start`, () => {
      const d = mk(['']);
      const t = new Typing(d);
      const sel = typeIn(d, t, C(d, 0, 0), typed);
      assert.deepEqual(texts(d), ['']);
      assert.deepEqual(shown(d), [label]);
      assert.equal(listEntryOf(d.doc, P(d, 0)), entry);
      assert.equal(P(d, 0).pStyle, 'ListParagraph');
      assert.deepEqual(sel, C(d, 0, 0));
      assert.equal(d.undoDepth, 2, 'typing, then the conversion');
    });
  }

  it('text after the caret stays; typing goes on in the item', () => {
    const d = mk(['Hello world']);
    const t = new Typing(d);
    let sel = typeIn(d, t, C(d, 0, 0), '1. ');
    assert.deepEqual(texts(d), ['Hello world']);
    assert.deepEqual(shown(d), ['1.']);
    sel = typeIn(d, t, sel, 'Say ');
    assert.deepEqual(texts(d), ['Say Hello world']);
    assert.deepEqual(shown(d), ['1.']);
  });

  it('a Title paragraph keeps its style', () => {
    const d = mk([['', {pStyle: 'Title'}]]);
    typeIn(d, new Typing(d), C(d, 0, 0), '* ');
    assert.equal(P(d, 0).pStyle, 'Title');
    assert.deepEqual(shown(d), ['•']);
  });

  it('the next number continues the list, after a gap too', () => {
    const d = mk(['', '', 'gap', '', '']);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '1. one');
    typeIn(d, t, C(d, 1, 0), '2. two');
    typeIn(d, t, C(d, 3, 0), '3. three');
    assert.deepEqual(shown(d), ['1.', '2.', null, '3.', null]);
    assert.equal(numId(d, 1), numId(d, 0));
    assert.equal(numId(d, 3), numId(d, 0));
    // another number: a new list starting there
    typeIn(d, t, C(d, 4, 0), '7. seven');
    assert.deepEqual(shown(d), ['1.', '2.', null, '3.', '7.']);
    assert.notEqual(numId(d, 4), numId(d, 0));
    assert.deepEqual(texts(d), ['one', 'two', 'gap', 'three', 'seven']);
  });

  it('1. again after a list: a new list at 1', () => {
    const d = mk(['', '']);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '1. a');
    typeIn(d, t, C(d, 1, 0), '1. b');
    assert.deepEqual(shown(d), ['1.', '1.']);
    assert.notEqual(numId(d, 1), numId(d, 0));
  });

  it('lists of another format between are passed over', () => {
    const d = mk(['', '', '', '']);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '1. a');
    typeIn(d, t, C(d, 1, 0), 'a) b');
    typeIn(d, t, C(d, 2, 0), '* c');
    typeIn(d, t, C(d, 3, 0), '2. d');
    assert.deepEqual(shown(d), ['1.', 'a)', '•', '2.']);
    assert.equal(numId(d, 3), numId(d, 0));
    // letters continue too: b) after a)
    const e = mk(['', '']);
    const u = new Typing(e);
    typeIn(e, u, C(e, 0, 0), 'a) x');
    typeIn(e, u, C(e, 1, 0), 'b) y');
    assert.deepEqual(shown(e), ['a)', 'b)']);
    assert.equal(numId(e, 1), numId(e, 0));
  });

  it('bullets continue the previous list of that bullet', () => {
    const d = mk(['', '', '', '']);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '* a');
    typeIn(d, t, C(d, 1, 0), '- b');
    typeIn(d, t, C(d, 2, 0), '* c');
    typeIn(d, t, C(d, 3, 0), '- d');
    assert.deepEqual(shown(d), ['•', '–', '•', '–']);
    assert.equal(numId(d, 2), numId(d, 0));
    assert.equal(numId(d, 3), numId(d, 1));
    assert.notEqual(numId(d, 1), numId(d, 0));
  });

  it('not across sections', () => {
    const d = mk(['', '']);
    const doc = d.doc;
    const s2 = {props: {extra: []}, blocks: [doc.sections[0].blocks
      .pop()], raw: null};
    doc.sections.push(s2);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '1. a');
    typeIn(d, t, C(d, 1, 0), '2. b');
    assert.deepEqual(shown(d), ['1.', '2.']);
    assert.notEqual(numId(d, 1), numId(d, 0), 'a new list at 2');
  });

  it('a Tab after the marker does it too (EditApply.run)', () => {
    const d = mk(['']);
    const t = new Typing(d);
    let sel = t.type(C(d, 0, 0), '1');
    sel = t.type(sel, '.');
    const before = state(d);
    sel = run('tab', d, t, sel, {autoList: true});
    assert.deepEqual(texts(d), ['']);
    assert.deepEqual(shown(d), ['1.']);
    assert.deepEqual(sel, C(d, 0, 0));
    d.undo();
    assert.deepEqual(texts(d), ['1.\t']);
    d.undo();
    assert.deepEqual(state(d), before);
    // without autoList: a plain tab
    const e = mk(['']);
    const u = new Typing(e);
    let s2 = u.type(C(e, 0, 0), '*');
    s2 = run('tab', e, u, s2);
    assert.deepEqual(texts(e), ['*\t']);
    assert.deepEqual(shown(e), [null]);
    // Tab in a list item still demotes it
    const f = mk(['']);
    const w = new Typing(f);
    let s3 = typeIn(f, w, C(f, 0, 0), '1. x');
    s3 = run('tab', f, w, C(f, 0, 0), {autoList: true});
    assert.deepEqual(shown(f), ['a.']);
    assert.deepEqual(texts(f), ['x']);
  });
});

describe('AutoList: a single letter that is roman or a letter', () => {
  const list = (marks) => {
    const d = mk(marks.map(() => '').concat(['']));
    const t = new Typing(d);
    marks.forEach((m, k) => typeIn(d, t, C(d, k, 0), m + ' x' + k));
    return {d, t, k: marks.length};
  };
  it('i. ii. iii. iv. then v.: roman 5, the same list', () => {
    const {d, t, k} = list(['i.', 'ii.', 'iii.', 'iv.']);
    typeIn(d, t, C(d, k, 0), 'v. five');
    assert.deepEqual(shown(d), ['i.', 'ii.', 'iii.', 'iv.', 'v.']);
    assert.equal(numId(d, k), numId(d, 0));
    assert.equal(P(d, k).text, 'five');
  });
  it('I. II. III. IV. then V.: upper roman 5, the same list', () => {
    const {d, t, k} = list(['I.', 'II.', 'III.', 'IV.']);
    typeIn(d, t, C(d, k, 0), 'V. five');
    assert.deepEqual(shown(d), ['I.', 'II.', 'III.', 'IV.', 'V.']);
    assert.equal(numId(d, k), numId(d, 0));
  });
  it('a. .. h. then i.: the letter i (9), the same list', () => {
    const {d, t, k} = list([...'abcdefgh'].map((c) => c + '.'));
    typeIn(d, t, C(d, k, 0), 'i. nine');
    assert.deepEqual(shown(d), [...'abcdefghi'].map((c) => c + '.'));
    assert.equal(numId(d, k), numId(d, 0));
  });
  it('a) .. h) then i): the letter i, the same list', () => {
    const {d, t, k} = list([...'abcdefgh'].map((c) => c + ')'));
    typeIn(d, t, C(d, k, 0), 'i) nine');
    assert.equal(shown(d)[k], 'i)');
    assert.equal(numId(d, k), numId(d, 0));
  });
  it('A. .. H. then I.: the letter I, the same list', () => {
    const {d, t, k} = list([...'ABCDEFGH'].map((c) => c + '.'));
    typeIn(d, t, C(d, k, 0), 'I. nine');
    assert.equal(shown(d)[k], 'I.');
    assert.equal(numId(d, k), numId(d, 0));
  });
  it('a. .. u. then v.: still a letter (22), the same list', () => {
    const {d, t, k} = list([...'abcdefghijklmnopqrstu']
      .map((c) => c + '.'));
    typeIn(d, t, C(d, k, 0), 'v. x');
    assert.equal(shown(d)[k], 'v.');
    assert.equal(numId(d, k), numId(d, 0));
  });
  it('otherwise the rule: i. roman 1, v. letter 22, i) none', () => {
    const {d, t, k} = list(['a.', 'b.']);
    typeIn(d, t, C(d, k, 0), 'i. new');
    assert.equal(shown(d)[k], 'i.');
    assert.notEqual(numId(d, k), numId(d, 0));
    assert.equal(listEntryOf(d.doc, P(d, k)), 'i.');
    const e = mk(['']);
    typeIn(e, new Typing(e), C(e, 0, 0), 'v. x');
    assert.deepEqual(shown(e), ['v.']);
    assert.equal(listEntryOf(e.doc, P(e, 0)), 'a.');
    const f = mk(['']);
    typeIn(f, new Typing(f), C(f, 0, 0), 'i) x');
    assert.deepEqual(shown(f), [null]);
    assert.deepEqual(texts(f), ['i) x']);
    // a roman list whose next label is not the letter typed
    const g = list(['i.', 'ii.']);
    typeIn(g.d, g.t, C(g.d, g.k, 0), 'v. x');
    assert.equal(listEntryOf(g.d.doc, P(g.d, g.k)), 'a.');
    assert.notEqual(numId(g.d, g.k), numId(g.d, 0));
  });
});

describe('AutoList: invisible marks before the marker', () => {
  const docOf = (inner) => buildDocx({'word/document.xml':
    documentXml('<w:p>' + inner + '<w:r><w:t xml:space="preserve">' +
      '* </w:t></w:r></w:p>')});
  it('a _GoBack bookmark and a proofing mark first: converts, kept',
    async () => {
      const d = await fromFile(await docOf('<w:bookmarkStart w:id="0" ' +
        'w:name="_GoBack"/><w:bookmarkEnd w:id="0"/><w:proofErr ' +
        'w:type="spellStart"/>'));
      assert.equal(P(d, 0).text, O + O + O + '* ');
      const before = state(d);
      const t = new Typing(d);
      const sel = afterSpace(d, t, C(d, 0, 5));
      assert.deepEqual(sel, C(d, 0, 3));
      assert.equal(P(d, 0).text, O + O + O);
      assert.deepEqual(shown(d), ['\u2022']);
      assert.deepEqual(Object.keys(P(d, 0).inlines), ['0', '1', '2']);
      let ops = null;
      d.on('change', (ev) => { ops = ev.ops; });
      d.undo();
      assert.deepEqual(state(d), before);
      assert.deepEqual(stepEnd(d.doc, ops, null), {id: P(d, 0).id,
        off: 5});
      const back = await fromFile(await writeDocx((d.redo(), d.doc),
        {date: DATE}));
      assert.deepEqual(shown(back), ['\u2022']);
      assert.match(await entryText(await writeDocx(d.doc, {date: DATE}),
        'word/document.xml'), /_GoBack/);
    });
  it('a field, a link, a drawing or a tab first still refuse',
    async () => {
      for (const inner of [
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
        '<w:r><w:instrText>PAGE</w:instrText></w:r>',
        '<w:hyperlink w:anchor="x"><w:r><w:t>a</w:t></w:r></w:hyperlink>',
        '<w:r><w:drawing/></w:r>', '<w:r><w:tab/></w:r>',
        '<w:bookmarkStart w:id="0" w:name="b"/><w:r><w:drawing/></w:r>']) {
        const d = await fromFile(await docOf(inner));
        const p0 = P(d, 0), off = p0.text.length;
        const before = state(d);
        assert.equal(afterSpace(d, new Typing(d), C(d, 0, off)),
          undefined, inner);
        assert.deepEqual(state(d), before);
      }
    });
  it('a mark inside the marker refuses', async () => {
    const d = await fromFile(await buildDocx({'word/document.xml':
      documentXml('<w:p><w:r><w:t>1</w:t></w:r><w:bookmarkStart ' +
        'w:id="0" w:name="b"/><w:r><w:t xml:space="preserve">. </w:t>' +
        '</w:r></w:p>')}));
    assert.equal(P(d, 0).text, '1' + O + '. ');
    assert.equal(afterSpace(d, new Typing(d), C(d, 0, 4)), undefined);
  });
});

describe('AutoList.afterSpace: when it does not apply', () => {
  const none = (d, sel, opts) => {
    const before = state(d), n = d.undoDepth;
    assert.equal(afterSpace(d, new Typing(d), sel, opts), undefined);
    assert.deepEqual(state(d), before);
    assert.equal(d.undoDepth, n);
  };
  it('a space elsewhere, a marker not at the start, a selection', () => {
    for (const [text, off] of [['ab * ', 5], [' * ', 3], ['x1. ', 4],
      ['1.5 ', 4], ['e.g. ', 5], ['10000000000. ', 13], ['iiii. ', 6],
      ['* x ', 4], ['*  ', 3], ['1. ', 3]]) {
      const d = mk([text]);
      none(d, C(d, 0, off));
    }
    const d = mk(['* ']);
    none(d, SEL(d, 0, 0, 0, 2));
    none(d, C(d, 0, 1));
    none(d, C(d, 0, 2), {typed: '\t'});
    none(d, C(d, 0, 2), {typed: 'x'});
    none(d, null);
    none(d, S.caret({id: 99999999, off: 2}));
  });
  it('in a list item, a style-numbered heading, numId 0', async () => {
    const d = await fromFile(await listDocx([item('* x', 1),
      heading('1. Intro'), p(r('* y'), '<w:pStyle w:val="Heading1"/>' +
        '<w:numPr><w:numId w:val="0"/></w:numPr>'),
      p(r('* z'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="77"/>' +
        '</w:numPr>')]));
    for (let k = 0; k < 4; k++) {
      const pa = P(d, k), off = pa.text.indexOf(' ') + 1;
      none(d, C(d, k, off));
    }
  });
  it('after an inline, after a link whose text is the marker',
    async () => {
      const d = mk([newPara(O + '1. ', {inlines: {0: raw('bookmark',
        'p')}})]);
      none(d, C(d, 0, 4));
      const e = await fromFile(await buildDocx({'word/document.xml':
        documentXml('<w:p><w:hyperlink w:anchor="x"><w:r><w:t>1.' +
          '</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> ' +
          '</w:t></w:r></w:p>')}));
      assert.equal(P(e, 0).text, O + ' ');
      none(e, C(e, 0, 2));
    });
  it('a document with no package data: nothing, no error', () => {
    const doc = emptyDoc();
    doc.sections[0].blocks[0] = newPara('* ');
    const d = new Document(doc);
    none(d, C(d, 0, 2));
  });
  it('hostile numbering parts: a refused part changes nothing',
    async () => {
      const NUM = (id, a) => `<w:num w:numId="${id}"><w:abstractNumId ` +
        `w:val="${a}"/></w:num>`;
      const ABS = (id) => `<w:abstractNum w:abstractNumId="${id}">` +
        lvl(0) + '</w:abstractNum>';
      const make = async (inner) => fromFile(await buildDocx({
        'word/document.xml': documentXml(p(r('1. '))),
        'word/styles.xml': STYLES_LIST,
        'word/numbering.xml': numberingXml(inner)}));
      const d = await make(ABS(0) + NUM(1, 0) + NUM(2147483647, 0));
      none(d, C(d, 0, 3));
      const e = await make(ABS(2147483647) + NUM(1, 2147483647));
      none(e, C(e, 0, 3));
      // a num naming a missing abstract: a new list, old nodes kept
      const f = await make(ABS(0) + NUM(1, 9) + NUM(2, 0));
      const kids = f.doc.numbering.raw.children.slice();
      assert.ok(afterSpace(f, new Typing(f), C(f, 0, 3)));
      assert.deepEqual(shown(f), ['1.']);
      for (const k of kids)
        assert.ok(f.doc.numbering.raw.children.includes(k));
      assert.equal(numId(f, 0), 6, 'past the headings\' numId 5');
    });
});

describe('AutoList: undo', () => {
  it('Ctrl-Z gives back the typed marker, then the typing', () => {
    for (const typed of ['* ', '1. ', '(3) ', 'iv. ']) {
      const d = mk(['', 'after']);
      const t = new Typing(d);
      const s0 = state(d);
      let sel = C(d, 0, 0);
      for (const ch of typed) sel = t.type(sel, ch);
      const s1 = state(d);
      const out = afterSpace(d, t, sel);
      assert.ok(out, typed);
      const s2 = state(d);
      assert.equal(d.undoDepth, 2, typed);
      let ops = null;
      const off = d.on('change', (ev) => { ops = ev.ops; });
      d.undo();
      assert.deepEqual(state(d), s1, 'the marker back: ' + typed);
      assert.deepEqual(texts(d), [typed, 'after']);
      assert.deepEqual(stepEnd(d.doc, ops, null),
        {id: P(d, 0).id, off: typed.length}, 'caret after the space');
      d.undo();
      assert.deepEqual(state(d), s0, 'the typing undone: ' + typed);
      d.redo();
      assert.deepEqual(state(d), s1);
      d.redo();
      assert.deepEqual(state(d), s2);
      assert.deepEqual(stepEnd(d.doc, ops, null) !== null, true);
      off();
    }
  });
  it('after the undo, typing on does not convert again', () => {
    const d = mk(['']);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '* ');
    d.undo();
    t.reset();
    typeIn(d, t, C(d, 0, 2), 'x y');
    assert.deepEqual(texts(d), ['* x y']);
    assert.deepEqual(shown(d), [null]);
  });
});

describe('AutoList: written, read back; big', () => {
  it('a list typed as 3. is saved starting at 3', async () => {
    const d = mk(['', '']);
    const t = new Typing(d);
    typeIn(d, t, C(d, 0, 0), '3. three');
    typeIn(d, t, C(d, 1, 0), '- dash');
    const bytes = await writeDocx(d.doc, {date: DATE});
    const xml = await entryText(bytes, 'word/numbering.xml');
    assert.match(xml, /<w:start w:val="3"\/>/);
    assert.match(xml, /<w:lvlText w:val="–"\/>/);
    const back = await fromFile(bytes);
    assert.deepEqual(shown(back), ['3.', '–']);
    assert.deepEqual(texts(back), ['three', 'dash']);
  });
  it('a 100,000-character paragraph starting * ', () => {
    const d = mk(['x'.repeat(100000)]);
    const t = new Typing(d);
    const t0 = performance.now();
    typeIn(d, t, C(d, 0, 0), '* ');
    const ms = performance.now() - t0;
    assert.deepEqual(shown(d), ['•']);
    assert.equal(P(d, 0).text.length, 100000);
    assert.ok(ms < 1000, ms + ' ms');
  });
  it('a marker typed in a 50,000-paragraph list document', () => {
    const d = mk(Array.from({length: 50000}, (_, k) => 'p' + k));
    const t = new Typing(d);
    for (let k = 0; k < 3; k++)
      typeIn(d, t, C(d, k, 0), (k + 1) + '. ');
    const t0 = performance.now();
    typeIn(d, t, C(d, 49999, 0), '4. ');
    const ms = performance.now() - t0;
    assert.deepEqual(shown(d).slice(0, 3), ['1.', '2.', '3.']);
    assert.equal(shown(d)[49999], '4.');
    assert.ok(ms < 1500, ms + ' ms');
  });
});
