// TocChoice: what the Update Table of Contents choice (./TocBox
// tocUpdateBox) starts with: Update entire table for a table with no
// entries ("No table of contents entries found.") or in a view with
// no pages (Outline, Web layout), else page numbers only (Word's);
// and the message when page numbers only cannot run for want of
// pages. Real Document, NewDoc and TocCmd.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {insertToc} from '../../tools/moreapps/!Letters/TocCmd';
import {tocFields} from '../../tools/moreapps/!Letters/TocUpdate';
import {run} from '../../tools/moreapps/!Letters/FieldPasses';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {caret} from '../../tools/moreapps/!Letters/Selection';
import {applyStyle} from '../../tools/moreapps/!Letters/StyleApply';
import {modeFor, pagesWhy, NO_PAGES}
  from '../../tools/moreapps/!Letters/TocChoice';
import {loadStyles} from './word-docs.mjs';

before(loadStyles);
const blocks = (d) => d.doc.sections[0].blocks;

/** A new document with a table, empty or (full) with one entry. */
function withToc(full) {
  const d = new Document(newDoc()), t = new Typing(d);
  const res = insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
    {});
  if (full) {
    const s = t.type(res.sel, 'Introduction');
    applyStyle(d, t, s, 'Heading1');
    run(d, {now: new Date(2026, 10, 6)}, null);
  }
  return {d, f: tocFields(d.doc)[0]};
}

describe('TocChoice', () => {
  it('a table with entries in a view with pages: page numbers only',
    () => {
      const {d, f} = withToc(true);
      assert.equal(modeFor(d.doc, f, true), 'pages');
    });

  it('a table with no entries: the entire table', () => {
    const {d, f} = withToc(false);
    assert.equal(modeFor(d.doc, f, true), 'entire');
    assert.equal(modeFor(d.doc, f, false), 'entire');
  });

  it('no pages (Outline, Web layout): the entire table', () => {
    const {d, f} = withToc(true);
    assert.equal(modeFor(d.doc, f, false), 'entire');
  });

  it('page numbers only without pages: the message, else none', () => {
    assert.equal(pagesWhy(false), NO_PAGES);
    assert.equal(NO_PAGES,
      'Page numbers need Print layout: choose Update entire table.');
    assert.equal(pagesWhy(true), null);
  });

  it('a field that is no table: page numbers only (Word\'s default)',
    () => {
      const d = new Document(newDoc());
      assert.equal(modeFor(d.doc, null, true), 'pages');
    });
});
