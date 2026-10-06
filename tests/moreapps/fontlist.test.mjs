// WimpLib/FontList: the font names a font menu or a font field
// offers: the document's, then Word's, then the desktop's, each name
// once (compared ignoring case), names cleaned, and the current
// family found whatever its case.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {WORD_FONTS, cleanFont, fontList, findFont, allFonts}
  from '../../tools/moreapps/!WimpLib/FontList';

describe('FontList', () => {
  it('Word\'s fonts', () => {
    assert.deepEqual(WORD_FONTS, ['Calibri', 'Cambria', 'Arial',
      'Times New Roman', 'Courier New']);
    assert.ok(Object.isFrozen(WORD_FONTS));
  });

  it('cleanFont trims, collapses spaces, drops controls, max 31', () => {
    assert.equal(cleanFont('  Times   New\tRoman '), 'Times New Roman');
    assert.equal(cleanFont('Ar\u0000ial'), 'Arial');
    assert.equal(cleanFont(''), null);
    assert.equal(cleanFont('   '), null);
    assert.equal(cleanFont(null), null);
    assert.equal(cleanFont(12), null);
    assert.equal(cleanFont('x'.repeat(40)), 'x'.repeat(31));
    assert.equal(cleanFont('Café Sans'), 'Café Sans');
  });

  it('fontList: document fonts first, then Word, then desktop', () => {
    const l = fontList(['Georgia', 'Cambria'],
      ['Corpus', 'arial', 'Homerton', 'Georgia']);
    assert.deepEqual(l.doc, ['Georgia', 'Cambria']);
    assert.deepEqual(l.word, ['Calibri', 'Arial', 'Times New Roman',
      'Courier New']);
    assert.deepEqual(l.desktop, ['Corpus', 'Homerton']);
  });

  it('fontList: no repeats in any case; junk ignored', () => {
    const l = fontList(['calibri', 'CALIBRI', '', null, 7, ' Arial '],
      ['Trinity', 'trinity', {}]);
    assert.deepEqual(l.doc, ['calibri', 'Arial']);
    assert.deepEqual(l.word, ['Cambria', 'Times New Roman',
      'Courier New']);
    assert.deepEqual(l.desktop, ['Trinity']);
    const e = fontList(null, undefined);
    assert.deepEqual(e, {doc: [], word: [...WORD_FONTS], desktop: []});
  });

  it('findFont ignores case and spacing; null when absent', () => {
    const l = fontList(['Georgia'], ['Homerton']);
    assert.equal(findFont(l, 'georgia'), 'Georgia');
    assert.equal(findFont(l, ' times  new roman'), 'Times New Roman');
    assert.equal(findFont(l, 'HOMERTON'), 'Homerton');
    assert.equal(findFont(l, 'Wingdings'), null);
    assert.equal(findFont(l, ''), null);
    assert.equal(findFont(l, null), null);
    assert.equal(findFont(['A', 'b'], 'B'), 'b');
  });

  it('allFonts: the three lists in order', () => {
    const l = fontList(['Georgia'], ['Homerton']);
    assert.deepEqual(allFonts(l), ['Georgia', ...WORD_FONTS,
      'Homerton']);
  });

  it('a thousand desktop fonts: linear', () => {
    const many = Array.from({length: 20000}, (_, i) => `F${i % 10000}`);
    const t0 = performance.now();
    const l = fontList(many, many);
    assert.equal(l.doc.length, 10000);
    assert.equal(l.desktop.length, 0);
    assert.ok(performance.now() - t0 < 200);
  });
});
