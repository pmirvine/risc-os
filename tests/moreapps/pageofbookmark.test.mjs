// The page of a bookmark (Batch E3): ./PageOfBookmark pageOf, the
// page holding the START of a bookmark as the pagination has it (the
// line holding its start offset; a table cell's row; a footnote's
// foot piece; an endnote run's page), numbered as PAGE numbers it
// (the section's pgNumType format and start); and PAGEREF, the field
// that shows it (\h, \p, \* formats). Real DocLayout and Pages, the
// fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {pageOf} from '../../tools/moreapps/!Letters/PageOfBookmark';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {evaluate, REGISTRY}
  from '../../tools/moreapps/!Letters/Fields';
import {of as bookmarks}
  from '../../tools/moreapps/!Letters/BookmarkIndex';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {noteDoc, mark, noteP, emark, enoteP, words}
  from './note-fixtures.mjs';

before(loadStyles);
const BR = '<w:r><w:br w:type="page"/></w:r>';
const bm = (name, text, id = 1) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>` + r(text) + `<w:bookmarkEnd w:id="${id}"/>`;
const sect = (inner) => p(r('end'), '<w:sectPr>' + inner +
  '</w:sectPr>');

/** doc paginated: {doc, L, P} (Print layout's galley, all done). */
function paged(doc) {
  const L = new DocLayout(doc, tm());
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  return {doc, L, P};
}
const ctxOf = (o) => ({doc: o.doc, pages: o.P});
const numOf = (o, name) => {
  const x = pageOf(ctxOf(o), name);
  return x && x.num;
};

describe('pageOf: the page of a bookmark\'s start', () => {
  it('page 1 and page 2 (after a page break)', async () => {
    const o = paged(await docWithFields(p(bm('one', 'first')) +
      p(r('more') + BR) + p(bm('two', 'second', 2))));
    assert.equal(o.P.list.length, 2);
    const a = pageOf(ctxOf(o), 'one');
    assert.equal(a.num, 1);
    assert.equal(a.fmt, 'decimal');
    assert.equal(a.page, o.P.list[0]);
    assert.equal(numOf(o, 'two'), 2);
    assert.equal(numOf(o, 'TWO'), 2, 'names: case ignored');
    assert.equal(pageOf(ctxOf(o), 'none'), null);
  });

  it('a bookmark in a table cell: the page of its row', async () => {
    const o = paged(await docWithFields(p(r('x') + BR) +
      tbl([tr([tc(p(r('a'))), tc(p(bm('cell', 'b')))])]) +
      p(r('after'))));
    assert.equal(o.doc.sections[0].blocks[1].type, 'tbl');
    assert.equal(numOf(o, 'cell'), 2);
    // a long table: its first row on page 1, a late row's page
    const rows = Array.from({length: 300}, (_, k) => tr([tc(p(
      k === 0 ? bm('top', 'r0', 3) : k === 299 ? bm('low', 'r', 4)
        : r('row ' + k)))]));
    const q = paged(await docWithFields(tbl(rows)));
    assert.equal(numOf(q, 'top'), 1);
    assert.equal(numOf(q, 'low'), q.P.list.length);
    assert.ok(q.P.list.length > 1, 'the table runs over pages');
  });

  it('a split paragraph: the page of the line holding the start',
    async () => {
      // the least number of words before the mark that puts it on
      // page 2 while the paragraph starts on page 1
      let found = null;
      for (let n = 200; n < 6000 && !found; n += 200) {
        const doc = await docWithFields(p(r(words(n)) +
          bm('late', 'here') + r(words(50))) + p(bm('early', 'x', 2)));
        const o = paged(doc);
        const id = doc.sections[0].blocks[0].id;
        if (o.P.ofPos({id, off: 0}) === 0 && numOf(o, 'late') === 2)
          found = o;
      }
      assert.ok(found, 'a paragraph split over pages 1 and 2');
      const e = bookmarks(found.doc).find('late');
      assert.equal(found.P.ofPos(e.start), 1, 'the start line: page 2');
    });

  it('a bookmark in a footnote: the page its text starts on',
    async () => {
      const doc = await noteDoc(p(r('a')) + p(r('b') + BR) +
        p(r('see') + mark(2)), {2: p('<w:r><w:footnoteRef/></w:r>' +
          bm('fnb', ' note text'))});
      const o = paged(doc);
      const e = bookmarks(doc).find('fnb');
      assert.ok(e && e.inNote, 'indexed in the note');
      assert.equal(numOf(o, 'fnb'), 2);
    });

  it('a bookmark in an endnote: the page of its run', async () => {
    const doc = await noteDoc(p(r('a') + emark(3)) + p(r('b') + BR) +
      p(r('c')), {}, {endnotes: {3: p('<w:r><w:endnoteRef/></w:r>' +
        bm('enb', ' end text'))}});
    const o = paged(doc);
    assert.equal(o.P.list.length, 2);
    assert.equal(numOf(o, 'enb'), 2, 'the run after the text');
    assert.ok(enoteP);
  });

  it('pgNumType: roman, and a section starting at 5', async () => {
    const o = paged(await docWithFields(p(r('i')) + p(r('x') + BR) +
      p(bm('rom', 'two')) + sect('<w:pgNumType w:fmt="lowerRoman"/>') +
      p(bm('five', 'five', 2)) +
      sect('<w:pgNumType w:start="5"/>') + p(r('last'))));
    const a = pageOf(ctxOf(o), 'rom');
    assert.equal(a.num, 2);
    assert.equal(a.fmt, 'lowerRoman');
    const b = pageOf(ctxOf(o), 'five');
    assert.equal(b.num, 5);
    assert.equal(b.fmt, 'decimal');
  });

  it('null without pages, a bookmark in a header, no doc', async () => {
    const doc = await docWithFields(p(bm('a', 'x')),
      {default: {hdr: p(bm('inhdr', 'head', 7))}});
    assert.equal(pageOf({doc}, 'a'), null, 'Draft: no pages');
    assert.equal(pageOf({doc, pages: {list: []}}, 'a'), null,
      'counts only (no galley)');
    const o = paged(doc);
    assert.equal(numOf(o, 'a'), 1);
    assert.ok(bookmarks(doc).find('inhdr'), 'indexed');
    assert.equal(pageOf(ctxOf(o), 'inhdr'), null, 'a header');
    assert.equal(pageOf({pages: o.P}, 'a'), null);
    assert.equal(pageOf(null, 'a'), null);
  });
});

describe('PAGEREF', () => {
  /** The value of the n-th field of o under its page (Update's). */
  const valueOf = (o, n = 0) => {
    const f = scan(o.doc)[n];
    const i = o.P.ofPos({id: f.begin.id, off: f.begin.off});
    return evaluate({doc: o.doc, pages: o.P, page: o.P.list[i]}, f);
  };

  it('is registered page-dependent, never drawn computed', () => {
    const e = REGISTRY.get('PAGEREF');
    assert.ok(e, 'registered');
    assert.equal(e.pageDependent, true);
    assert.equal(e.shown, false);
  });

  it('the page number, \\h, formats, the section format', async () => {
    const o = paged(await docWithFields(p(fld(' PAGEREF t \\h ', '9')) +
      p(fld(' PAGEREF t ', '9')) + p(fld(' PAGEREF t \\* roman ',
        '9')) + p(fld(' PAGEREF t \\# "00" ', '9')) +
      p(r('x') + BR) + p(bm('t', 'target'))));
    assert.equal(valueOf(o, 0), '2');
    assert.equal(valueOf(o, 1), '2');
    assert.equal(valueOf(o, 2), 'ii');
    assert.equal(valueOf(o, 3), '02');
    const q = paged(await docWithFields(p(fld(' PAGEREF t ', '9')) +
      p(r('x') + BR) + p(bm('t', 'target')) +
      sect('<w:pgNumType w:fmt="upperRoman"/>') + p(r('z'))));
    assert.equal(valueOf(q), 'II');
  });

  it('\\p: above or below on the same page, else "on page N"',
    async () => {
      const o = paged(await docWithFields(p(bm('up', 'above it')) +
        p(fld(' PAGEREF up \\p ', 'x')) + p(fld(' PAGEREF down \\p ',
          'x')) + p(bm('down', 'below it', 2)) + p(r('x') + BR) +
        p(fld(' PAGEREF up \\p ', 'x')) + p(fld(' PAGEREF far \\p \\h ',
          'x')) + p(r('y') + BR) + p(bm('far', 'far', 3))));
      assert.equal(valueOf(o, 0), 'above');
      assert.equal(valueOf(o, 1), 'below');
      assert.equal(valueOf(o, 2), 'on page 1');
      assert.equal(valueOf(o, 3), 'on page 3');
    });

  it('null: no bookmark, a bad switch, two names, locked, no pages',
    async () => {
      const o = paged(await docWithFields(p(bm('t', 'x')) +
        p(fld(' PAGEREF nothere ', '9')) + p(fld(' PAGEREF t \\z ',
          '9')) + p(fld(' PAGEREF t u ', '9')) +
        p(fld(' PAGEREF t ', '9', {lock: true})) +
        p(fld(' PAGEREF ', '9'))));
      for (let n = 0; n < 5; n++) assert.equal(valueOf(o, n), null, n);
      const f = scan(o.doc)[0];
      assert.equal(evaluate({doc: o.doc}, f), null, 'no pages');
    });
});
