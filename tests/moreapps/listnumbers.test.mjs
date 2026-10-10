// ListNumbers: the list labels of a document (numbers and bullets)
// in one pass: templates, counters, restarts, overrides, styles.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {newStyleTable, addStyle, setDefault}
  from '../../tools/moreapps/!Word/Styles';

const lv = (ilvl, o = {}) => ({ilvl, numFmt: 'decimal',
  lvlText: `%${ilvl + 1}.`, start: 1, ...o});
let absIds = 100;
/**
 * A Num: levels given as an array (holes allowed), overrides; its
 * own abstractNum unless one is given (numIds over one abstractNum
 * share counters).
 */
const N = (levels, overrides = [], abstractNumId = ++absIds) =>
  ({abstractNumId, levels, overrides: new Map(overrides)});
const multi = (o = {}) => N(Array.from({length: 9}, (_, k) =>
  lv(k, {lvlText: Array.from({length: k + 1}, (_, j) => `%${j + 1}.`)
    .join(''), ...o})));
const opaque = () => ({type: 'opaque',
  node: {name: 'w:tbl', attrs: [], children: []}});
const docOf = (sections, nums, styles = null) => ({
  sections: sections.map((blocks) => ({props: {extra: []}, blocks,
    raw: null})),
  styles, numbering: nums ? {raw: null, nums: new Map(nums)} : null,
  parts: new Map(), rels: [], meta: {}, rawSettings: null});
/** A list paragraph (ilvl left out when undefined). */
const li = (numId, ilvl, o = {}) => newPara('x', {...o, pPr: {
  ...(o.pPr || {}), numPr: ilvl === undefined ? {numId}
    : {numId, ilvl}}});
const plain = (o) => newPara('x', o);
/** Label texts of every paragraph, null for none. */
function texts(doc) {
  const m = labels(doc);
  return doc.sections.flatMap((s) => s.blocks)
    .filter((b) => b.type === 'p')
    .map((p) => (m.has(p.id) ? m.get(p.id).text : null));
}
const one = (lvlText, ilvls, num = null) => texts(docOf([ilvls.map(
  (k) => li(1, k))], [[1, num || N([0, 1, 2].map((k) =>
  lv(k, {lvlText})))]]));

describe('ListNumbers: lvlText templates', () => {
  it('the common forms', () => {
    assert.deepEqual(one('%1.', [0, 0]), ['1.', '2.']);
    assert.deepEqual(one('(%1)', [0, 0]), ['(1)', '(2)']);
    assert.deepEqual(one('%1)', [0]), ['1)']);
    assert.deepEqual(one('Article %1', [0, 0]),
      ['Article 1', 'Article 2']);
    assert.deepEqual(one('Step %1 of many:', [0]), ['Step 1 of many:']);
    assert.deepEqual(one('%1.%2.', [0, 1, 1]), ['1.1.', '1.1.', '1.2.']);
    assert.deepEqual(one('%1.%2.%3', [0, 1, 2, 2]),
      ['1.1.1', '1.1.1', '1.1.1', '1.1.2']);
    assert.deepEqual(one('%1%2', [0, 1, 1]), ['11', '11', '12']);
  });
  it('each %n takes that level\'s own format', () => {
    const num = N([lv(0, {numFmt: 'upperRoman'}),
      lv(1, {numFmt: 'lowerLetter', lvlText: '%1.%2)'})]);
    assert.deepEqual(one('', [0, 1, 1, 0, 1], num),
      ['I.', 'I.a)', 'I.b)', 'II.', 'II.a)']);
  });
  it('%0, %x and a lone % stay literal; %9 is level 9', () => {
    assert.deepEqual(one('%0 %x %% %', [0]), ['%0 %x %% %']);
    assert.deepEqual(one('[%9]', [0]), ['[1]']);
  });
  it('a level that is used first shows its start in deeper labels',
    () => {
      assert.deepEqual(one('%1.%2.', [1, 1, 0]), ['1.1.', '1.2.', '1.1.']);
    });
});

describe('ListNumbers: counters and restarts', () => {
  it('a higher level restarts the lower ones', () => {
    const d = docOf([[0, 1, 1, 0, 1, 2, 1, 2].map((k) => li(1, k))],
      [[1, multi()]]);
    assert.deepEqual(texts(d), ['1.', '1.1.', '1.2.', '2.', '2.1.',
      '2.1.1.', '2.2.', '2.2.1.']);
  });
  it('lvlRestart 0: never restarts', () => {
    const num = multi();
    num.levels[1] = lv(1, {lvlText: '%1.%2.', lvlRestart: 0});
    const d = docOf([[0, 1, 1, 0, 1].map((k) => li(1, k))], [[1, num]]);
    assert.deepEqual(texts(d), ['1.', '1.1.', '1.2.', '2.', '2.3.']);
  });
  it('lvlRestart n: restarts only after level n or above', () => {
    const num = multi();
    num.levels[2] = lv(2, {lvlText: '%3', lvlRestart: 1});
    const d = docOf([[0, 2, 2, 1, 2, 0, 2].map((k) => li(1, k))],
      [[1, num]]);
    assert.deepEqual(texts(d), ['1.', '1', '2', '1.1.', '3', '2.',
      '1']);
  });
  it('a numId continues across plain paragraphs, kept blocks, '
    + 'other lists and sections', () => {
    const d = docOf([[li(1, 0), plain(), opaque(), li(2, 0), li(1, 0)],
      [opaque(), li(1, 0)]], [[1, multi()], [2, multi()]]);
    assert.deepEqual(texts(d), ['1.', null, '1.', '2.', '3.']);
  });
  it('numIds over the same abstractNum continue one count', () => {
    const a = multi();
    const b = {...multi(), abstractNumId: a.abstractNumId};
    const d = docOf([[li(1, 0), li(2, 0), li(1, 0), li(2, 0)]],
      [[1, a], [2, b]]);
    assert.deepEqual(texts(d), ['1.', '2.', '3.', '4.']);
  });
  it('a startOverride restarts a shared count once per numId', () => {
    const a = multi();
    const b = {...multi(), abstractNumId: a.abstractNumId,
      overrides: new Map([[0, {start: 1}]])};
    const d = docOf([[li(1, 0), li(1, 0), li(2, 0), li(2, 0),
      li(1, 0), li(2, 0)]], [[1, a], [2, b]]);
    assert.deepEqual(texts(d), ['1.', '2.', '1.', '2.', '3.', '4.']);
  });
  it('startOverride: first count only; restarts use the start', () => {
    const num = multi();
    num.overrides = new Map([[0, {start: 5}], [1, {start: 3}]]);
    const d = docOf([[0, 0, 1, 1, 0, 1].map((k) => li(2, k)),
      [li(1, 0)]], [[1, multi()], [2, num]]);
    assert.deepEqual(texts(d), ['5.', '6.', '6.3.', '6.4.', '7.',
      '7.1.', '1.']);
  });
  it('an unused level shows its start, not a pending override', () => {
    const num = N([lv(0, {start: 2}), lv(1, {lvlText: '%1.%2'})],
      [[0, {start: 9}]]);
    const d = docOf([[li(1, 1), li(1, 0)]], [[1, num]]);
    assert.deepEqual(texts(d), ['2.1', '9.']);
  });
  it('an override level replaces format and text', () => {
    const num = multi();
    num.overrides = new Map([[0, {level: lv(0, {numFmt: 'lowerRoman',
      lvlText: '%1:', start: 4})}]]);
    const d = docOf([[li(1, 0), li(1, 0)]], [[1, num]]);
    assert.deepEqual(texts(d), ['iv:', 'v:']);
  });
  it('legal numbering (isLgl) shows every level in decimal', () => {
    const num = N([lv(0, {numFmt: 'upperRoman', lvlText: 'Art. %1'}),
      lv(1, {numFmt: 'lowerLetter', lvlText: '%1.%2', isLgl: true}),
      lv(2, {numFmt: 'lowerLetter', lvlText: '%1.%2.%3'})]);
    const d = docOf([[0, 1, 1, 2].map((k) => li(1, k))], [[1, num]]);
    assert.deepEqual(texts(d), ['Art. I', '1.1', '1.2', 'I.b.a']);
  });
  it('none: no text, the indent stays, the counter counts', () => {
    const num = N([lv(0, {numFmt: 'none', lvlText: '',
      pPr: {ind: {left: 720, hanging: 360}}}),
    lv(1, {lvlText: '%1.%2'})]);
    const d = docOf([[li(1, 0), li(1, 0), li(1, 1)]], [[1, num]]);
    const m = labels(d);
    const ps = d.sections[0].blocks;
    assert.equal(m.get(ps[0].id).text, '');
    assert.deepEqual(m.get(ps[0].id).indent, {left: 720, hanging: 360});
    assert.equal(m.get(ps[0].id).fmt, 'none');
    assert.equal(m.get(ps[2].id).text, '.1');
  });
  it('a level ind with both hanging and firstLine: hanging wins',
    () => {
      const num = N([lv(0, {pPr: {ind: {left: 720, hanging: 360,
        firstLine: 100}}}), lv(1, {pPr: {ind: {firstLine: 200}}}),
      lv(2, {pPr: {ind: {right: 5}}})]);
      const d = docOf([[li(1, 0), li(1, 1), li(1, 2)]], [[1, num]]);
      const m = labels(d);
      const ps = d.sections[0].blocks;
      assert.deepEqual(m.get(ps[0].id).indent, {left: 720,
        hanging: 360});
      assert.deepEqual(m.get(ps[1].id).indent, {firstLine: 200});
      assert.equal(m.get(ps[2].id).indent, undefined);
    });
  it('unknown numFmt is decimal', () => {
    assert.deepEqual(one('%1.', [0, 0], N([lv(0, {numFmt: 'hebrew2',
      lvlText: '%1.'})])), ['1.', '2.']);
  });
  it('absurd start: 2^31 counts on exactly', () => {
    const num = N([lv(0, {start: 2 ** 31})]);
    assert.deepEqual(one('', [0, 0], num), ['2147483648.',
      '2147483649.']);
    const neg = N([lv(0, {start: -(2 ** 31), numFmt: 'lowerLetter'})]);
    assert.deepEqual(one('', [0], neg), ['-2147483648.']);
  });
  it('a missing start is 0 (the schema default)', () => {
    const num = N([{ilvl: 0, numFmt: 'decimal', lvlText: '%1'}]);
    assert.deepEqual(one('', [0, 0], num), ['0', '1']);
  });
});

describe('ListNumbers: what has no label', () => {
  it('numId 0, an unknown numId, no numbering part', () => {
    const d = docOf([[li(0, 0), li(9, 0), li(1, 0), li(9, 1),
      li(1, 0)]], [[1, multi()]]);
    assert.deepEqual(texts(d), [null, null, '1.', null, '2.']);
    const none = docOf([[li(1, 0)]], null);
    assert.equal(labels(none).size, 0);
  });
  it('a numId with no levels at all', () => {
    const d = docOf([[li(1, 0)]], [[1, N([])]]);
    assert.deepEqual(texts(d), [null]);
  });
  it('levels beyond the defined ones use the last defined level',
    () => {
      const num = N([lv(0, {lvlText: '%1.'}), lv(1, {numFmt: 'lowerLetter',
        lvlText: '(%2)'}), , lv(3, {lvlText: '<%4>'})]);
      const d = docOf([[0, 1, 2, 2, 5, 3].map((k) => li(1, k))],
        [[1, num]]);
      // ilvl 2 is a hole: level 1's form, counting at level 2 (b is
      // level 1's own counter, which level 2 does not move); ilvl 5
      // uses level 3's form; counters stay per ilvl
      assert.deepEqual(texts(d), ['1.', '(a)', '(a)', '(a)', '<1>',
        '<1>']);
    });
});

describe('ListNumbers: label fields', () => {
  it('number label shape', () => {
    const num = N([lv(0, {lvlText: '%1.', suff: 'space',
      pPr: {ind: {left: 720, hanging: 360}}, rPr: {b: true}})]);
    const p = li(1, 0);
    const got = labels(docOf([[p]], [[1, num]])).get(p.id);
    assert.deepEqual(got, {text: '1.', level: 0, numId: 1,
      indent: {left: 720, hanging: 360}, suff: 'space', jc: 'left',
      rPr: {b: true}, bullet: false, fmt: 'decimal'});
  });
  it('bullet label, firstLine indent, defaults', () => {
    const num = N([lv(0, {numFmt: 'bullet', lvlText: '\uF0B7',
      rPr: {rFonts: {ascii: 'Symbol', hAnsi: 'Symbol'}},
      pPr: {ind: {left: 100, firstLine: 50}}}),
    lv(1, {numFmt: 'bullet', lvlText: 'o',
      rPr: {rFonts: {ascii: 'Courier New'}}}),
    {ilvl: 2}]);
    const ps = [li(1, 0), li(1, 1), li(1, 2)];
    const m = labels(docOf([ps], [[1, num]]));
    assert.deepEqual(m.get(ps[0].id), {text: '\u2022', level: 0,
      numId: 1, indent: {left: 100, firstLine: 50},
      suff: 'tab', jc: 'left',
      rPr: {rFonts: {ascii: 'Symbol', hAnsi: 'Symbol'}},
      bullet: true, fmt: 'bullet'});
    assert.equal(m.get(ps[1].id).text, '\u25E6');
    // a bare level: decimal, no text (no lvlText), no indent
    assert.deepEqual(m.get(ps[2].id), {text: '', level: 2, numId: 1,
      suff: 'tab', jc: 'left', rPr: null, bullet: false,
      fmt: 'decimal'});
  });
  it('jc from lvlJc (Strict start/end), default left', () => {
    const num = N(['center', 'right', 'start', 'end', 'middle']
      .map((j, k) => lv(k, {lvlJc: j})));
    const ps = [0, 1, 2, 3, 4].map((k) => li(1, k));
    const m = labels(docOf([ps], [[1, num]]));
    assert.deepEqual(ps.map((p) => m.get(p.id).jc),
      ['center', 'right', 'left', 'right', 'left']);
  });
  it('label length is capped at 40', () => {
    const t = one('%1'.repeat(1000), [0]);
    assert.equal(t[0], '1'.repeat(40));
    const t2 = one('x'.repeat(1000) + '%1', [0]);
    assert.equal(t2[0].length, 40);
  });
});

const sty = (id, o = {}) => ({id, type: 'paragraph',
  pPr: {extra: [], ...(o.pPr || {})}, rPr: {extra: []}, extra: [],
  raw: null, ...(o.basedOn ? {basedOn: o.basedOn} : {})});
function headings() {
  const t = newStyleTable();
  addStyle(t, sty('Normal'));
  setDefault(t, 'paragraph', 'Normal');
  addStyle(t, sty('Heading1', {basedOn: 'Normal',
    pPr: {numPr: {numId: 4}}}));
  addStyle(t, sty('Heading2', {basedOn: 'Heading1'}));
  addStyle(t, sty('Heading3', {basedOn: 'Heading2'}));
  addStyle(t, sty('Fixed', {basedOn: 'Heading1',
    pPr: {numPr: {ilvl: 2}}}));
  addStyle(t, sty('Loop', {basedOn: 'Loop2', pPr: {numPr: {numId: 4}}}));
  addStyle(t, sty('Loop2', {basedOn: 'Loop'}));
  return t;
}
const HNUM = N([lv(0, {pStyle: 'Heading1', lvlText: '%1'}),
  lv(1, {pStyle: 'Heading2', lvlText: '%1.%2'}),
  lv(2, {lvlText: '%1.%2.%3'})]);
const H = (pStyle, o = {}) => newPara('x', {pStyle, ...o});

describe('ListNumbers: numbering from the paragraph style', () => {
  it('heading numbering through w:lvl pStyle, with restarts', () => {
    const d = docOf([[H('Heading1'), H('Heading2'), H('Normal'),
      H('Heading2'), H('Heading1'), H('Heading2')]], [[4, HNUM]],
    headings());
    assert.deepEqual(texts(d), ['1', '1.1', null, '1.2', '2', '2.1']);
  });
  it('no level names the style: level 0; a given ilvl wins', () => {
    const d = docOf([[H('Heading1'), H('Heading3'), H('Fixed'),
      H('Heading2', {pPr: {numPr: {ilvl: 2}}})]], [[4, HNUM]],
    headings());
    assert.deepEqual(texts(d), ['1', '2', '2.1.1', '2.1.2']);
  });
  it('direct numPr wins; numId 0 removes the style numbering', () => {
    const d = docOf([[H('Heading1'), H('Heading1', {pPr: {numPr:
      {numId: 0}}}), H('Heading1', {pPr: {numPr: {numId: 1}}}),
    H('Heading2', {pPr: {numPr: {numId: 1}}})]],
    [[4, HNUM], [1, multi()]], headings());
    // numId 1 has no level naming Heading2: level 0
    assert.deepEqual(texts(d), ['1', null, '1.', '2.']);
  });
  it('a basedOn loop does not hang', () => {
    const d = docOf([[H('Loop'), H('Loop2')]], [[4, HNUM]], headings());
    assert.deepEqual(texts(d), ['1', '2']);
  });
  it('an unknown style falls back to the default style', () => {
    const d = docOf([[H('Nope'), li(4, 0)]], [[4, HNUM]], headings());
    assert.deepEqual(texts(d), [null, '1']);
  });
});

const X = (name, attrs = [], children = []) => ({name, attrs, children});
const rawNumPr = (...kids) => X('w:numPr', [], kids);
const val = (n, v) => X(n, [['w:val', String(v)]]);

describe('ListNumbers: a numPr kept raw', () => {
  it('numId and ilvl are read from the raw node', () => {
    const p = newPara('x', {pPr: {extra: [rawNumPr(val('w:ilvl', 1),
      X('w:ins', [['w:id', '1']]), val('w:numId', 1))]}});
    const d = docOf([[li(1, 0), p]], [[1, multi()]]);
    assert.deepEqual(texts(d), ['1.', '1.1.']);
  });
  it('the raw node wins over the style; junk is ignored', () => {
    const own = newPara('x', {pStyle: 'Heading1', pPr: {extra: [
      rawNumPr(val('w:numId', 1), X('w:numberingChange'))]}});
    const zero = newPara('x', {pStyle: 'Heading1', pPr: {extra: [
      rawNumPr(val('w:numId', 0), X('w:ins'))]}});
    const junk = newPara('x', {pPr: {extra: [rawNumPr(val('w:numId',
      'abc'), X('w:ins')), X('w:other')]}});
    const d = docOf([[own, zero, junk, H('Heading1')]],
      [[4, HNUM], [1, multi()]], headings());
    assert.deepEqual(texts(d), ['1.', null, null, '1']);
  });
});

describe('ListNumbers: size and hostile data', () => {
  it('100k list paragraphs in one pass, well under a second', () => {
    const ps = [];
    for (let i = 0; i < 100000; i++) ps.push(li(1, i % 3));
    const d = docOf([ps], [[1, multi()]], headings());
    const t0 = performance.now();
    const m = labels(d);
    const ms = performance.now() - t0;
    assert.equal(m.size, 100000);
    assert.equal(m.get(ps[99999].id).text, '33334.');
    assert.equal(m.get(ps[99998].id).text, '33333.1.1.');
    assert.ok(ms < 1000, `${ms} ms`);
  });
  it('a flood of placeholders that show nothing stays cheap', () => {
    // level 0 is 'none': each %1 adds nothing to the label, so the
    // output cap never stops the scan; the template bound (255
    // characters, read once per numId and level) does
    const flood = (n, paras) => {
      const num = N([lv(0, {numFmt: 'none'}), lv(1, {lvlText:
        '%2' + '%1'.repeat(n) + '%2'})]);
      const ps = [];
      for (let i = 0; i < paras; i++) ps.push(li(1, 1));
      const d = docOf([ps], [[1, num]]);
      const t0 = performance.now();
      const m = labels(d);
      return [performance.now() - t0, m.get(ps[paras - 1].id).text];
    };
    const [ms1, t1] = flood(1000, 100000);
    // the trailing %2 is past the bound: one number shows
    assert.equal(t1, '100000');
    // 2 s bounds by the controller's ruling (Task 2 re-review: the
    // old 300/200 ms bounds flaked at 1117 ms under parallel load);
    // alone both floods take about 280 ms. The quadratic cases this
    // guards against took 1.7 s and 16 s, so the 2 s bound alone
    // catches them only in part: see the scale test below.
    assert.ok(ms1 < 2000, `1000 x 100k: ${ms1} ms`);
    const [ms2, t2] = flood(100000, 10000);
    assert.equal(t2, '10000');
    assert.ok(ms2 < 2000, `100k x 10k: ${ms2} ms`);
  });
  it('a template 10 times longer costs no more (read to 255 chars)',
    () => {
      // scale invariance, not absolute times: a template rescanned
      // per paragraph, or read past the bound, grows with it
      const flood = (n) => {
        const num = N([lv(0, {numFmt: 'none'}), lv(1, {lvlText:
          '%2' + '%1'.repeat(n) + '%2'})]);
        const ps = [];
        for (let i = 0; i < 10000; i++) ps.push(li(1, 1));
        const d = docOf([ps], [[1, num]]);
        let best = Infinity;
        for (let k = 0; k < 3; k++) {
          const t0 = performance.now();
          labels(d);
          best = Math.min(best, performance.now() - t0);
        }
        return best;
      };
      flood(10000);                    // warm up
      const small = flood(10000), big = flood(100000);
      assert.ok(big < 1000, `100k placeholders x 10k: ${big} ms`);
      // 3 times, plus 5 ms for timer noise on runs of a few ms
      assert.ok(big <= 3 * small + 5, `${big} ms vs ${small} ms`);
    });
  it('odd model data never throws', () => {
    const bad = N([lv(0, {lvlText: 42, numFmt: {}}), null,
      {ilvl: 2, lvlText: '%3', start: 'x', lvlRestart: -1}]);
    const ps = [li(1, 0), li(1, 1), li(1, 2), newPara('x',
      {pPr: {numPr: {numId: 1, ilvl: 40}}}), newPara('x',
      {pPr: {numPr: 'junk'}})];
    const d = docOf([ps], [[1, bad]]);
    const t = texts(d);
    assert.equal(t[3], null);
    assert.equal(t[4], null);
    for (const s of t.slice(0, 3)) assert.equal(typeof s, 'string');
    d.numbering.nums = null;
    assert.equal(labels(d).size, 0);
  });
});
