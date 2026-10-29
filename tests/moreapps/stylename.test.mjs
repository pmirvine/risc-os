// StyleName: Word's display names for its built-in styles.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {display, displayName}
  from '../../tools/moreapps/!Letters/StyleName';

describe('StyleName', () => {
  it('title-cases the built-ins Word stores in lower case', () => {
    for (const [stored, shown] of [['heading 1', 'Heading 1'],
      ['heading 9', 'Heading 9'], ['toc 1', 'TOC 1'],
      ['index 3', 'Index 3'], ['footnote text', 'Footnote Text'],
      ['footnote reference', 'Footnote Reference'],
      ['header', 'Header'], ['footer', 'Footer'],
      ['caption', 'Caption'], ['annotation text', 'Annotation Text'],
      ['balloon text', 'Balloon Text'],
      ['table of figures', 'Table of Figures'],
      ['toa heading', 'TOA Heading']]) {
      assert.equal(displayName(stored), shown, stored);
      assert.equal(display({id: 'x', name: stored}), shown, stored);
    }
  });
  it('shows any other name as stored', () => {
    for (const n of ['Normal', 'List Paragraph', 'heading 1x',
      'my style', 'heading 10', 'Heading 1', 'headers', 'macro']) {
      assert.equal(displayName(n), n, n);
    }
  });
  it('falls back to the id, never changes the style', () => {
    const s = {id: 'Heading1', name: 'heading 1'};
    assert.equal(display(s), 'Heading 1');
    assert.equal(s.name, 'heading 1');
    assert.equal(display({id: 'Odd'}), 'Odd');
    assert.equal(display({id: 'Odd', name: ''}), 'Odd');
    assert.equal(display(null), '');
  });
});
