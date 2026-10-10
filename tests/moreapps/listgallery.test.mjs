// ListGallery: the bullet and numbering definitions !Word writes for
// a new list (Word's defaults), their labels through the real
// ListNumbers, kindOf and matches.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {BULLETS, NUMBERS, HIDDEN, ENTRIES, entryOf, kindOf, matches}
  from '../../tools/moreapps/!Word/ListGallery';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {readNumbering} from '../../tools/moreapps/!Word/ReadNumbering';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {NUMBERING} from './list-fixtures.mjs';

const SYM = {ascii: 'Symbol', hAnsi: 'Symbol', hint: 'default'};
const CN = {ascii: 'Courier New', hAnsi: 'Courier New',
  cs: 'Courier New', hint: 'default'};
const WD = {ascii: 'Wingdings', hAnsi: 'Wingdings', hint: 'default'};
const CYCLE = [['\uF0B7', SYM], ['o', CN], ['\uF0A7', WD]];

/** The labels of 9 paragraphs at ilvl 0..8 of a list using `levels`. */
function nine(levels) {
  const paras = Array.from({length: 9}, (_, k) =>
    newPara('x', {pPr: {numPr: {numId: 1, ilvl: k}}}));
  const doc = {sections: [{props: {extra: []}, blocks: paras,
    raw: null}], styles: null, numbering: {raw: null, nums: new Map([
    [1, {abstractNumId: 0, levels, overrides: new Map()}]])},
  parts: new Map(), rels: [], meta: {}, rawSettings: null};
  const m = labels(doc);
  return paras.map((p) => m.get(p.id).text);
}

describe('ListGallery: the entries', () => {
  it('six bullets and six numberings, in order, unique ids', () => {
    assert.deepEqual(BULLETS.map((e) => e.id),
      ['disc', 'circle', 'square', 'diamond', 'arrow', 'check']);
    assert.deepEqual(NUMBERS.map((e) => e.id),
      ['1.', '1)', 'I.', 'A.', 'a)', 'i.']);
    // (then the entries AutoFormat uses, not shown: ./AutoList)
    assert.deepEqual(ENTRIES, [...BULLETS, ...NUMBERS, ...HIDDEN]);
    assert.deepEqual(new Set(ENTRIES.map((e) => e.id)).size, 15);
    assert.ok(BULLETS.every((e) => e.kind === 'bullet'));
    assert.ok(NUMBERS.every((e) => e.kind === 'number'));
    for (const e of ENTRIES) {
      assert.equal(entryOf(e.id), e);
      assert.equal(typeof e.name, 'string');
    }
    assert.equal(entryOf('nope'), null);
    assert.equal(entryOf('__proto__'), null);
    assert.equal(entryOf(undefined), null);
  });

  it('9 levels each: start 1, indent 720 (k+1), hanging 360, tab', () => {
    for (const e of ENTRIES) {
      assert.equal(e.levels.length, 9, e.id);
      e.levels.forEach((l, k) => {
        assert.equal(l.ilvl, k);
        assert.equal(l.start, 1);
        assert.equal(l.suff, 'tab');
        assert.deepEqual(l.pPr, {ind: {left: 720 * (k + 1),
          hanging: 360}});
      });
    }
  });

  it('the bullets: their glyph, Word\'s cycle below it', () => {
    const disc = entryOf('disc').levels;
    disc.forEach((l, k) => {
      assert.equal(l.numFmt, 'bullet');
      assert.equal(l.lvlJc, 'left');
      assert.equal(l.lvlText, CYCLE[k % 3][0]);
      assert.deepEqual(l.rPr, {rFonts: CYCLE[k % 3][1]});
    });
    const at = (id, k) => [entryOf(id).levels[k].lvlText,
      entryOf(id).levels[k].rPr.rFonts];
    // every library bullet: its glyph at level 0, then Word's cycle at
    // level k (k mod 3), whatever the level-0 glyph (as Word does)
    for (const [id, ch] of [['circle', 'o'], ['square', '\uF0A7'],
      ['diamond', '\uF076'], ['arrow', '\uF0D8'], ['check', '\uF0FC']]) {
      assert.deepEqual(at(id, 0), [ch, ch === 'o' ? CN : WD]);
      for (let k = 1; k < 9; k++) assert.deepEqual(at(id, k), CYCLE[k % 3]);
    }
  });

  it('the numberings: formats cycling, roman right-aligned', () => {
    const want = {
      '1.': [['decimal', '.'], ['lowerLetter', '.'], ['lowerRoman', '.']],
      '1)': [['decimal', ')'], ['lowerLetter', ')'], ['lowerRoman', ')']],
      'I.': [['upperRoman', '.'], ['upperLetter', '.'], ['decimal', '.']],
      'A.': [['upperLetter', '.'], ['lowerLetter', '.'],
        ['lowerRoman', '.']],
      'a)': [['lowerLetter', ')'], ['lowerRoman', ')'], ['decimal', ')']],
      'i.': [['lowerRoman', '.'], ['lowerLetter', '.'], ['decimal', '.']],
    };
    for (const [id, cyc] of Object.entries(want)) {
      entryOf(id).levels.forEach((l, k) => {
        const [fmt, end] = cyc[k % 3];
        assert.equal(l.numFmt, fmt, id + ' ' + k);
        assert.equal(l.lvlText, `%${k + 1}${end}`);
        assert.equal(l.lvlJc, /Roman$/.test(fmt) ? 'right' : 'left');
        assert.equal(l.rPr, undefined);
      });
    }
  });

  it('frozen: nobody can change a definition', () => {
    assert.ok(Object.isFrozen(BULLETS) && Object.isFrozen(NUMBERS));
    const l = entryOf('disc').levels[0];
    assert.ok(Object.isFrozen(entryOf('disc')));
    assert.ok(Object.isFrozen(entryOf('disc').levels));
    assert.ok(Object.isFrozen(l) && Object.isFrozen(l.pPr.ind) &&
      Object.isFrozen(l.rPr.rFonts));
  });
});

describe('ListGallery: labels through ListNumbers', () => {
  it('numberings: 1. a. i. 1. ... and the others', () => {
    assert.deepEqual(nine(entryOf('1.').levels),
      ['1.', 'a.', 'i.', '1.', 'a.', 'i.', '1.', 'a.', 'i.']);
    assert.deepEqual(nine(entryOf('1)').levels).slice(0, 3),
      ['1)', 'a)', 'i)']);
    assert.deepEqual(nine(entryOf('I.').levels).slice(0, 4),
      ['I.', 'A.', '1.', 'I.']);
    assert.deepEqual(nine(entryOf('A.').levels).slice(0, 3),
      ['A.', 'a.', 'i.']);
    assert.deepEqual(nine(entryOf('a)').levels).slice(0, 3),
      ['a)', 'i)', '1)']);
    assert.deepEqual(nine(entryOf('i.').levels).slice(0, 3),
      ['i.', 'a.', '1.']);
  });

  it('bullets: U+2022, U+25E6, U+25AA cycling (owner: level 1 '
    + 'drawn as U+25E6)', () => {
    const B = ['\u2022', '\u25E6', '\u25AA'];
    assert.deepEqual(nine(entryOf('disc').levels),
      [0, 1, 2, 0, 1, 2, 0, 1, 2].map((k) => B[k]));
    assert.deepEqual(nine(entryOf('circle').levels).slice(0, 3),
      ['\u25E6', '\u25E6', '\u25AA']);
    assert.deepEqual(nine(entryOf('square').levels).slice(0, 3),
      ['\u25AA', '\u25E6', '\u25AA']);
    assert.deepEqual(nine(entryOf('diamond').levels).slice(0, 3),
      ['\u25C6', '\u25E6', '\u25AA']);
    assert.equal(nine(entryOf('arrow').levels)[0], '\u27A2');
    assert.equal(nine(entryOf('check').levels)[0], '\u2713');
  });
});

describe('ListGallery: kindOf and matches', () => {
  it('kindOf', () => {
    assert.equal(kindOf(entryOf('disc').levels[0]), 'bullet');
    assert.equal(kindOf(entryOf('1.').levels[0]), 'number');
    assert.equal(kindOf({numFmt: 'none'}), 'number');
    assert.equal(kindOf({}), 'number');
    assert.equal(kindOf(null), 'number');
  });

  it('matches compares level 0 (override first) with the entry', () => {
    const num = (e) => ({abstractNumId: 0, levels: e.levels,
      overrides: new Map()});
    for (const e of ENTRIES) {
      for (const f of ENTRIES)
        assert.equal(matches(num(e), f.id), e === f, e.id + ' ' + f.id);
    }
    // Word's own part (list-fixtures): numId 1 bullets (Symbol F0B7),
    // 2 multilevel 1. a. i., 3 the same with a startOverride
    const root = parseXml(NUMBERING).root;
    const nums = readNumbering(root, rootScope(root)).nums;
    assert.ok(matches(nums.get(1), 'disc'));
    assert.ok(matches(nums.get(2), '1.'));
    assert.ok(matches(nums.get(3), '1.'));
    assert.ok(!matches(nums.get(4), 'I.'), 'Article %1. is not I.');
    assert.ok(!matches(nums.get(2), '1)'));
    // a level-0 override decides
    const ov = {...num(entryOf('1.')), overrides: new Map([[0,
      {level: entryOf('I.').levels[0]}]])};
    assert.ok(matches(ov, 'I.') && !matches(ov, '1.'));
    // a legal level is not the gallery's
    assert.ok(!matches({levels: [{...entryOf('1.').levels[0],
      isLgl: true}]}, '1.'));
    // a Symbol middle dot shows a bullet: the disc
    assert.ok(matches({levels: [{numFmt: 'bullet', lvlText: '\u00B7',
      rPr: {rFonts: {ascii: 'Symbol'}}}]}, 'disc'));
    for (const bad of [null, undefined, 1, 'x', {}, {levels: null},
      {levels: []}, {levels: [null]}])
      assert.equal(matches(bad, 'disc'), false);
    assert.equal(matches(num(entryOf('disc')), 'nope'), false);
    assert.equal(matches(num(entryOf('disc')), '__proto__'), false);
  });
});
