// TocSwitches (Batch E3): a TOC instruction read into what it asks
// for; unknown switches and TC entries keep the stored result;
// hostile input never throws.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parse, canRebuild, isFigures, MAX_STYLES}
  from '../../tools/moreapps/!Letters/TocSwitches';

describe('TocSwitches.parse', () => {
  it('the usual Word instruction', () => {
    const s = parse(' TOC \\o "1-3" \\h \\z \\u ');
    assert.deepEqual(s.levels, [1, 3]);
    assert.equal(s.outline, true);
    assert.equal(s.hyperlinks, true);
    assert.equal(s.hidePages, true);
    assert.deepEqual(s.unknown, []);
    assert.equal(s.valid, true);
    assert.equal(canRebuild(s), true);
    assert.equal(isFigures(s), false);
  });
  it('defaults', () => {
    const s = parse('TOC');
    assert.equal(s.levels, null);
    assert.deepEqual(s.styles, []);
    assert.equal(s.noPageLevels, null);
    assert.equal(s.separator, null);
    assert.equal(canRebuild(s), true);
  });
  it('\\t styles with either list separator', () => {
    assert.deepEqual(parse('TOC \\t "Appendix,1,Part;2"').styles,
      [{style: 'Appendix', level: 1}, {style: 'Part', level: 2}]);
    assert.deepEqual(parse('TOC \\t "A;1;B;3"').styles,
      [{style: 'A', level: 1}, {style: 'B', level: 3}]);
  });
  it('\\t with a bad list is unknown', () => {
    for (const t of ['A', 'A,x', ',1', 'A,1,B', '']) {
      const s = parse(`TOC \\t "${t}"`);
      assert.deepEqual(s.styles, [], t);
      assert.equal(s.unknown.length, 1, t);
      assert.equal(canRebuild(s), false);
    }
    assert.equal(parse('TOC \\t').unknown.length, 1);
  });
  it('\\n with and without levels', () => {
    assert.deepEqual(parse('TOC \\n').noPageLevels, [1, 9]);
    assert.deepEqual(parse('TOC \\n "2-3"').noPageLevels, [2, 3]);
    assert.equal(parse('TOC \\n "x"').unknown.length, 1);
  });
  it('\\p \\b \\c \\a \\w \\x', () => {
    const s = parse('TOC \\p " - " \\b Part1 \\c "Figure" \\w \\x');
    assert.equal(s.separator, ' - ');
    assert.equal(s.bookmark, 'Part1');
    assert.equal(s.seqId, 'Figure');
    assert.equal(s.keepTabs, true);
    assert.equal(s.keepBreaks, true);
    assert.equal(isFigures(s), true);
    assert.equal(isFigures(parse('TOC \\a "Table"')), true);
    assert.equal(parse('TOC \\a "Table"').captionsOnly, 'Table');
    assert.equal(parse('TOC \\b').unknown.length, 1);
  });
  it('\\f and \\l keep the stored result', () => {
    for (const q of ['TOC \\f', 'TOC \\f "A"', 'TOC \\l "1-2"']) {
      const s = parse(q);
      assert.equal(s.tcEntries, true, q);
      assert.equal(canRebuild(s), false, q);
    }
  });
  it('unknown switches keep the stored result', () => {
    for (const q of ['TOC \\o "1-3" \\d "-"', 'TOC \\s Chapter',
      'TOC \\q', 'TOC extra', 'TOC \\o "9-1"']) {
      const s = parse(q);
      assert.ok(s.unknown.length > 0, q);
      assert.equal(canRebuild(s), false, q);
    }
  });
  it('not a TOC field', () => {
    assert.equal(canRebuild(parse('PAGE')), false);
    assert.equal(canRebuild(parse('')), false);
    assert.equal(canRebuild(null), false);
  });
  it('\\* and case', () => {
    const s = parse('TOC \\O "2-4" \\H \\* MERGEFORMAT');
    assert.deepEqual(s.levels, [2, 4]);
    assert.equal(s.hyperlinks, true);
    assert.deepEqual(s.unknown, []);
  });
  it('ranges are clamped, backwards ones unknown', () => {
    assert.deepEqual(parse('TOC \\o "0-99"').levels, [1, 9]);
    assert.deepEqual(parse('TOC \\o "3"').levels, [3, 3]);
    assert.equal(parse('TOC \\o "9-1"').levels, null);
    assert.equal(parse('TOC \\o "a-b"').unknown.length, 1);
    assert.deepEqual(parse('TOC \\o').levels, [1, 9]);
    assert.deepEqual(parse('TOC \\t "S,0"').styles,
      [{style: 'S', level: 1}]);
    assert.deepEqual(parse('TOC \\t "S,99999"').styles,
      [{style: 'S', level: 9}]);
  });
  it('a switch given twice: the last counts', () => {
    assert.deepEqual(parse('TOC \\o "1-2" \\o "2-4"').levels, [2, 4]);
  });
  it('hostile input never throws', () => {
    const big = 'x'.repeat(100000);
    const odd = ['', ' ', '\\', '\\\\o', 'TOC "', 'TOC \\o "',
      `TOC \\t "${big}"`, `TOC \\b ${big}`,
      'TOC ' + '\\h '.repeat(5000),
      'TOC \\t "__proto__,1,constructor,2"',
      'TOC \\t "' + 'A,1,'.repeat(MAX_STYLES + 5) + 'A,1"', null,
      undefined, 42, {}, 'TOC \\o "1-3" \\o'.repeat(900)];
    for (const q of odd) {
      const s = parse(q);
      assert.ok(Array.isArray(s.unknown));
      assert.equal(typeof canRebuild(s), 'boolean');
    }
    const p = parse('TOC \\t "__proto__,1,constructor,2"');
    assert.deepEqual(p.styles.map((x) => x.style),
      ['__proto__', 'constructor']);
    assert.equal(parse('TOC \\t "' + 'A,1,'.repeat(MAX_STYLES + 5) +
      'A,1"').unknown.length, 1);
  });
});
