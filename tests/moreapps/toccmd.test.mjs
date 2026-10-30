// TocCmd (Batch E3): a table of contents put in at the caret, updated
// (the entire table, or its page numbers only) and removed, each one
// undo step; the TOC step of Update all fields (./FieldPasses: SEQ,
// then REF, then the tables of contents, then PAGEREF), bounded by
// MAX_PASSES when a table pushes its own page numbers. Real Document,
// DocLayout and Pages with the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {insertToc, insertWhy, updateToc, removeToc, instrOf, tocAt}
  from '../../tools/moreapps/!Letters/TocCmd';
import {entriesOf, tocFields}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {run, STEPS, MAX_PASSES}
  from '../../tools/moreapps/!Letters/FieldPasses';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {of as bookmarks}
  from '../../tools/moreapps/!Letters/BookmarkIndex';
import {deleteBookmark} from '../../tools/moreapps/!Letters/Bookmarks';
import {caret, select} from '../../tools/moreapps/!Letters/Selection';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {deepEqual, OBJ} from '../../tools/moreapps/!Letters/Model';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {styleIdByName} from '../../tools/moreapps/!Letters/TocBuild';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const sty = (id, name, inner = '', based = '') => '<w:style ' +
  `w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (based ? `<w:basedOn w:val="${based}"/>` : '') +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLE_XML = sty('Normal', 'Normal') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal') +
  sty('Heading3', 'heading 3', OL(2), 'Normal');
const STYLES = stylesXml(STYLE_XML);
const H = (n, text, runs) => p(runs || r(text),
  `<w:pStyle w:val="Heading${n}"/>`);
const BR = '<w:r><w:br w:type="page"/></w:r>';
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES}));

const open = (doc) => {
  const d = new Document(doc);
  return {d, t: new Typing(d)};
};
/** The Print layout pages of doc. */
function pagesOf(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  return {L, P: new Pages(printGalley(L)).finish()};
}
/** Update's context for doc as it is now (pages, layout again). */
const ctxOf = (doc) => {
  const o = pagesOf(doc);
  return {now: NOW, pages: {finish: () => o.P}, layout: o};
};
const blocks = (d) => d.doc.sections[0].blocks;
const plain = (b) => b.text.split(OBJ).join('');
/** The first paragraph whose plain text is text. */
function paraOf(doc, text) {
  let got = null;
  forEachBlock(doc, (b) => {
    if (!got && b.type === 'p' && plain(b) === text) got = b;
    return !got;
  });
  return got;
}
const brief = (doc, f) => entriesOf(doc, f).map((e) => [e.level,
  e.text]);
const tocOf = (doc, k = 0) => tocFields(doc)[k];
const snap = (doc) => ({sections: structuredClone(doc.sections),
  styles: doc.styles});
const same = (doc, s) => deepEqual(doc.sections, s.sections) &&
  doc.styles === s.styles;
/** Page number shown by a fresh layout for paragraph id. */
function pageNum(doc, id) {
  const {P} = pagesOf(doc);
  return String(P.list[P.ofPos({id, off: 0})].num);
}
const pageBreakAt = (block, at) => ({op: 'replaceText', block, at,
  del: 0, ins: OBJ, inlines: {0: {kind: 'br', level: 'r',
    brType: 'page'}}});
const tocNames = (doc) => bookmarks(doc).list.map((e) => e.name)
  .filter((n) => n.startsWith('_Toc'));

/** Text old of a paragraph made new (one command). */
function rename(d, t, old, now) {
  const b = paraOf(d.doc, old), loc = findBlock(d.doc, b.id);
  t.command(() => d.apply({op: 'replaceText', block: loc.at,
    at: b.text.indexOf(old), del: old.length, ins: now}));
}

const THREE = () => read(p('') + H(1, 'One') + p(r('body')) +
  H(2, 'Two') + H(3, 'Three'));

describe('instrOf: the instruction Word writes', () => {
  it('defaults, levels, no links, outline, styles, figures', () => {
    assert.equal(instrOf({}), 'TOC \\o "1-3" \\h \\z \\u');
    assert.equal(instrOf({levels: 2, hyperlinks: false,
      outline: false}), 'TOC \\o "1-2"');
    assert.equal(instrOf({pageNumbers: false}),
      'TOC \\o "1-3" \\n "1-3" \\h \\z \\u');
    assert.equal(instrOf({extraStyles: [{style: 'Appendix',
      level: 1}]}), 'TOC \\o "1-3" \\h \\z \\t "Appendix,1" \\u');
    assert.equal(instrOf({seqId: 'Figure'}),
      'TOC \\h \\z \\c "Figure"');
    assert.equal(instrOf({levels: 99}), 'TOC \\o "1-9" \\h \\z \\u');
    assert.equal(instrOf({rightAlign: false}),
      'TOC \\o "1-3" \\p " " \\h \\z \\u');
  });
});

describe('insertToc', () => {
  it('an unexpected error is not taken for a refusal', async () => {
    const doc = await THREE(), {d, t} = open(doc);
    const s0 = snap(d.doc);
    const at = caret({id: blocks(d)[0].id, off: 0});
    const boom = {command() { throw new TypeError('boom'); }};
    assert.throws(() => insertToc(d, boom, at, {}), TypeError);
    const bad = {command: (fn) => {
      d.apply = () => { throw new TypeError('inside'); };
      return fn();
    }};
    assert.throws(() => insertToc(d, bad, at, {}), /inside/);
    delete d.apply;
    assert.ok(same(d.doc, s0));
    assert.ok(insertToc(d, t, at, {}), 'still works');
  });

  it('in an empty paragraph: entries, bookmarks, styles, one step',
    async () => {
      const doc = await THREE(), {d, t} = open(doc);
      const s0 = snap(d.doc), n0 = d.undoDepth;
      const at = blocks(d)[0];
      const res = insertToc(d, t, caret({id: at.id, off: 0}), {});
      assert.ok(res, 'inserted');
      assert.equal(d.undoDepth, n0 + 1, 'one undo step');
      const f = tocOf(d.doc);
      assert.equal(f.instr.trim(), 'TOC \\o "1-3" \\h \\z \\u');
      assert.deepEqual(brief(d.doc, f), [[1, 'One'], [2, 'Two'],
        [3, 'Three']]);
      assert.equal(res.field.begin.id, f.begin.id);
      // a hidden _Toc bookmark on each heading, the anchors of links
      const names = tocNames(d.doc);
      assert.equal(names.length, 3);
      assert.deepEqual(entriesOf(d.doc, f).map((e) => e.anchor), names);
      for (const name of names) {
        const e = bookmarks(d.doc).find(name);
        const h = findBlock(d.doc, e.start.id).b;
        assert.match(h.pStyle, /^Heading/);
        assert.equal(e.plain, plain(h));
      }
      // the styles, found by name afterwards
      for (const n of ['toc 1', 'toc 2', 'toc 3'])
        assert.ok(styleIdByName(d.doc, n, 'paragraph'), n);
      assert.ok(styleIdByName(d.doc, 'Hyperlink', 'character'));
      // the caret after the table
      const end = findBlock(d.doc, f.end.id);
      assert.deepEqual(res.sel.head, {id: f.end.id,
        off: f.end.off + 1});
      assert.ok(end, 'end paragraph');
      await lintAfter(d.doc, 'toc inserted');
      const after = structuredClone(d.doc.sections);
      d.undo();
      assert.ok(same(d.doc, s0), 'undo: as before');
      d.redo();
      assert.ok(deepEqual(d.doc.sections, after), 'redo: as after');
    });

  it('in the middle of a paragraph: split, the rest after the end',
    async () => {
      const doc = await read(p(r('abcdef')) + H(1, 'One'));
      const {d, t} = open(doc), id = blocks(d)[0].id;
      const res = insertToc(d, t, caret({id, off: 3}), {});
      assert.ok(res);
      assert.equal(plain(blocks(d)[0]), 'abc');
      const f = tocOf(d.doc);
      assert.notEqual(f.begin.id, id);
      const B = findBlock(d.doc, f.end.id).b;
      assert.equal(B.text.slice(f.end.off + 1), 'def');
      assert.deepEqual(brief(d.doc, f), [[1, 'One']]);
      await lintAfter(d.doc, 'split');
    });

  it('at the start of the document, before a heading: the heading ' +
    'holds the end and is still an entry; Update again: no step',
  async () => {
    const doc = await read(H(1, 'One') + H(2, 'Two'));
    const {d, t} = open(doc), id = blocks(d)[0].id;
    assert.ok(insertToc(d, t, caret({id, off: 0}), {}));
    const f = tocOf(d.doc);
    assert.equal(blocks(d)[0].id, f.begin.id, 'the table first');
    const B = findBlock(d.doc, f.end.id).b;
    assert.equal(B.pStyle, 'Heading1');
    assert.equal(plain(B), 'One');
    assert.deepEqual(brief(d.doc, f), [[1, 'One'], [2, 'Two']]);
    const n = d.undoDepth;
    const u = updateToc(d, t, f, 'entire');
    assert.ok(u);
    assert.equal(u.changed, false);
    assert.equal(d.undoDepth, n, 'nothing changed: no step');
    await lintAfter(d.doc, 'start');
  });

  it('levels 2 and no hyperlinks: plain entries, PAGEREF fields',
    async () => {
      const doc = await THREE(), {d, t} = open(doc);
      const id = blocks(d)[0].id;
      assert.ok(insertToc(d, t, caret({id, off: 0}), {levels: 2,
        hyperlinks: false}));
      const f = tocOf(d.doc);
      assert.equal(f.instr.trim(), 'TOC \\o "1-2" \\u');
      assert.deepEqual(brief(d.doc, f), [[1, 'One'], [2, 'Two']]);
      let links = 0;
      forEachBlock(d.doc, (b) => {
        if (b.type === 'p') {
          for (const x of Object.values(b.inlines || {})) {
            if (x.kind === 'raw' && x.level === 'p' &&
              /hyperlink$/.test(x.node.name)) links++;
          }
        }
        return true;
      });
      assert.equal(links, 0);
      const refs = scan(d.doc).filter((x) => /PAGEREF/.test(x.instr));
      assert.equal(refs.length, 2);
      assert.ok(!styleIdByName(d.doc, 'Hyperlink', 'character'));
    });

  it('the leader and right alignment: the entries\' tabs',
    async () => {
      const tabsOf = async (opts) => {
        const {d, t} = open(await THREE());
        assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
          opts));
        const f = tocOf(d.doc);
        return findBlock(d.doc, f.sep.id).b.pPr.tabs;
      };
      assert.deepEqual(await tabsOf({}), [{val: 'right', pos: 9026,
        leader: 'dot'}]);
      assert.deepEqual(await tabsOf({leader: 'dashes'}), [{val: 'right',
        pos: 9026, leader: 'hyphen'}]);
      assert.deepEqual(await tabsOf({leader: 'none'}), [{val: 'right',
        pos: 9026}]);
      assert.equal(await tabsOf({rightAlign: false}), undefined);
    });

  it('page numbers from the pages when a context is given',
    async () => {
      const doc = await read(p('') + H(1, 'One') + p(r('x') + BR) +
        H(1, 'Two'));
      const {d, t} = open(doc), id = blocks(d)[0].id;
      assert.ok(insertToc(d, t, caret({id, off: 0}), {},
        ctxOf(d.doc)));
      const f = tocOf(d.doc), es = entriesOf(d.doc, f);
      assert.deepEqual(es.map((e) => e.page), [
        pageNum(d.doc, paraOf(d.doc, 'One').id),
        pageNum(d.doc, paraOf(d.doc, 'Two').id)]);
      assert.deepEqual(es.map((e) => e.page), ['1', '2']);
    });

  it('no headings: Word\'s text', async () => {
    const doc = await read(p('') + p(r('text')));
    const {d, t} = open(doc), id = blocks(d)[0].id;
    assert.ok(insertToc(d, t, caret({id, off: 0}), {}));
    const f = tocOf(d.doc);
    const A = findBlock(d.doc, f.sep.id).b;
    assert.equal(A.text.slice(f.sep.off + 1),
      'No table of contents entries found.');
    await lintAfter(d.doc, 'none');
  });

  it('a second table: its entries are not the first one\'s; ' +
    'Update all fields rebuilds both and then changes nothing',
  async () => {
    const doc = await read(p('') + p('') + H(1, 'One') + H(2, 'Two'));
    const {d, t} = open(doc);
    const [a, b] = blocks(d);
    assert.ok(insertToc(d, t, caret({id: b.id, off: 0}), {}));
    assert.ok(insertToc(d, t, caret({id: a.id, off: 0}), {}));
    assert.equal(tocFields(d.doc).length, 2);
    for (const f of tocFields(d.doc))
      assert.deepEqual(brief(d.doc, f), [[1, 'One'], [2, 'Two']]);
    assert.equal(tocNames(d.doc).length, 2, 'bookmarks shared');
    const n = d.undoDepth;
    const res = t.command(() => run(d, ctxOf(d.doc), null));
    assert.ok(res.ok);
    const n1 = d.undoDepth;
    assert.ok(n1 <= n + 1);
    const again = t.command(() => run(d, ctxOf(d.doc), null));
    assert.equal(again.changed, false);
    assert.equal(d.undoDepth, n1, 'no second step');
    await lintAfter(d.doc, 'two tocs');
  });

  it('refused inside a table of contents, a field code, a header ' +
    'and a note', async () => {
    const doc = await THREE(), {d, t} = open(doc);
    assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
      {}));
    const f = tocOf(d.doc), n = d.undoDepth;
    const inside = caret({id: f.sep.id, off: f.sep.off + 2});
    assert.match(insertWhy(d, inside), /table of contents|field/);
    assert.equal(insertToc(d, t, inside, {}), null);
    assert.equal(d.undoDepth, n);
    // in a field's code
    const d2 = open(await read(p(fld(' DATE ', 'x')) + H(1, 'One'))).d;
    const q = blocks(d2)[0];
    assert.ok(insertWhy(d2, caret({id: q.id, off: 2})));
    assert.equal(insertToc(d2, null, caret({id: q.id, off: 2}), {}),
      null);
    // just before a field is fine
    assert.equal(insertWhy(d2, caret({id: q.id, off: 0})), null);
    // a header
    const hd = new Document(await readDocx(await withHeaders(
      p(r('body')), {default: p(r('head'))})));
    const fa = facadeOf(hd, 'word/header1.xml', 0);
    const hp = fa.doc.sections[0].blocks[0];
    assert.match(insertWhy(fa, caret({id: hp.id, off: 0})),
      /header|footer|note/);
    assert.equal(insertToc(fa, null, caret({id: hp.id, off: 0}), {}),
      null);
    // a note
    const nd = new Document(await noteDoc(p(r('x') + mark(2)),
      {2: noteP('note')}));
    const fn = facadeOf(nd, {note: {kind: 'footnote', id: 2}});
    const np = fn.doc.sections[0].blocks[0];
    assert.ok(insertWhy(fn, caret({id: np.id, off: 1})));
    assert.equal(insertToc(fn, null, caret({id: np.id, off: 1}), {}),
      null);
  });

  it('tocAt finds the table at a caret in it', async () => {
    const doc = await THREE(), {d, t} = open(doc);
    assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
      {}));
    const f = tocOf(d.doc);
    const g = tocAt(d.doc, caret({id: f.sep.id, off: f.sep.off + 1}));
    assert.equal(g.begin.id, f.begin.id);
    assert.equal(tocAt(d.doc, caret({id: paraOf(d.doc, 'body').id,
      off: 0})), null);
  });

  it('a heading with a footnote mark: the entry has no mark; the ' +
    'note stays; removing the table keeps it', async () => {
    const doc = await noteDoc(p('') + H(1, '', r('Intro') + mark(2)),
      {2: noteP('the note')}, {styles: STYLES});
    const {d, t} = open(doc);
    assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
      {}));
    const f = tocOf(d.doc);
    assert.deepEqual(brief(d.doc, f), [[1, 'Intro']]);
    assert.ok(d.doc.notes.footnotes.has(2) ||
      d.doc.notes.footnotes.has('2'), 'the note stays');
    assert.ok(removeToc(d, t, tocOf(d.doc)));
    assert.ok(d.doc.notes.footnotes.has(2) ||
      d.doc.notes.footnotes.has('2'), 'still');
    await lintAfter(d.doc, 'note heading');
  });
});

describe('updateToc', () => {
  /** A document with a table of contents inserted, and its parts. */
  async function withToc(body, opts = {}) {
    const doc = await read(p('') + body);
    const o = open(doc);
    assert.ok(insertToc(o.d, o.t, caret({id: blocks(o.d)[0].id,
      off: 0}), opts));
    return o;
  }
  const BODY = H(1, 'One') + p(r('x')) + H(2, 'Two') + H(1, 'Three');

  it('entire, after a heading is added, removed and renamed',
    async () => {
      const {d, t} = await withToc(BODY);
      // rename Two, Three becomes Four, x a heading
      rename(d, t, 'Two', 'Deux');
      rename(d, t, 'Three', 'Four');
      const one = findBlock(d.doc, paraOf(d.doc, 'One').id);
      t.command(() => d.apply({op: 'setProps', block: one.at,
        pStyle: null}));
      const x = findBlock(d.doc, paraOf(d.doc, 'x').id);
      t.command(() => d.apply({op: 'setProps', block: x.at,
        pStyle: 'Heading3'}));
      const n = d.undoDepth, s0 = snap(d.doc);
      const res = updateToc(d, t, tocOf(d.doc), 'entire');
      assert.equal(res.changed, true);
      assert.equal(d.undoDepth, n + 1);
      assert.deepEqual(brief(d.doc, tocOf(d.doc)), [[3, 'x'],
        [2, 'Deux'], [1, 'Four']]);
      await lintAfter(d.doc, 'entire');
      d.undo();
      assert.ok(same(d.doc, s0), 'undo');
    });

  it('pages: the entry text kept as it is, numbers rewritten; a ' +
    'heading added is reported', async () => {
      const {d, t} = await withToc(BODY);
      rename(d, t, 'Two', 'Deux');
      // a page break before Three
      const x = findBlock(d.doc, paraOf(d.doc, 'x').id);
      t.command(() => d.apply(pageBreakAt(x.at, 1)));
      const n = d.undoDepth;
      const res = updateToc(d, t, tocOf(d.doc), 'pages',
        ctxOf(d.doc));
      assert.ok(res);
      assert.equal(res.message, null);
      const es = entriesOf(d.doc, tocOf(d.doc));
      assert.deepEqual(es.map((e) => e.text), ['One', 'Two', 'Three']);
      assert.deepEqual(es.map((e) => e.page), ['One', 'Deux', 'Three']
        .map((s) => pageNum(d.doc, paraOf(d.doc, s).id)));
      assert.ok(d.undoDepth <= n + 1);
      // a new heading: the numbers still, and the message
      const y = findBlock(d.doc, paraOf(d.doc, 'x').id);
      t.command(() => d.apply({op: 'setProps', block: y.at,
        pStyle: 'Heading2'}));
      const res2 = updateToc(d, t, tocOf(d.doc), 'pages',
        ctxOf(d.doc));
      assert.equal(res2.message,
        'headings changed: update the entire table');
      assert.equal(entriesOf(d.doc, tocOf(d.doc)).length, 3);
    });

  it('pages keeps what the user typed in an entry (no links), and ' +
    'its format', async () => {
      const {d, t} = await withToc(H(1, 'One') + p(r('x')) +
        H(1, 'Two'), {hyperlinks: false});
      const f = tocOf(d.doc);
      const A = findBlock(d.doc, f.sep.id);
      t.command(() => d.apply({op: 'replaceText', block: A.at,
        at: f.sep.off + 1, del: 0, ins: 'My '}));
      const x = findBlock(d.doc, paraOf(d.doc, 'x').id);
      t.command(() => d.apply(pageBreakAt(x.at, 1)));
      const res = updateToc(d, t, tocOf(d.doc), 'pages',
        ctxOf(d.doc));
      assert.ok(res.changed);
      const es = entriesOf(d.doc, tocOf(d.doc));
      assert.deepEqual(es.map((e) => e.text), ['My One', 'Two']);
      assert.deepEqual(es.map((e) => e.page), ['One', 'Two'].map((s) =>
        pageNum(d.doc, paraOf(d.doc, s).id)));
      await lintAfter(d.doc, 'pages plain');
    });

  it('entire with no pages: each entry keeps its page number',
    async () => {
      const doc = await read(p('') + H(1, 'One') + p(r('x')) +
        p(r('y') + BR) + H(1, 'Two'));
      const {d, t} = open(doc);
      assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
        {}, ctxOf(doc)));
      const was = entriesOf(d.doc, tocOf(d.doc)).map((e) => e.page);
      assert.deepEqual(was, ['1', '2']);
      rename(d, t, 'Two', 'Deux');
      const x = findBlock(d.doc, paraOf(d.doc, 'x').id);
      t.command(() => d.apply({op: 'setProps', block: x.at,
        pStyle: 'Heading2'}));
      assert.ok(updateToc(d, t, tocOf(d.doc), 'entire').changed);
      const es = entriesOf(d.doc, tocOf(d.doc));
      assert.deepEqual(es.map((e) => [e.text, e.page]), [['One', '1'],
        ['x', null], ['Deux', '2']]);
    });

  it('pages without pages: refused (null), nothing changed',
    async () => {
      const {d, t} = await withToc(BODY);
      const n = d.undoDepth;
      assert.equal(updateToc(d, t, tocOf(d.doc), 'pages'), null);
      assert.equal(d.undoDepth, n);
    });

  it('a TOC with an unknown switch or \\f is kept as stored, with a ' +
    'message in Update all fields', async () => {
    for (const code of [' TOC \\o "1-3" \\q ', ' TOC \\f \\o "1-3" ']) {
      const doc = await read(p(fld(code, 'Stored entry')) +
        H(1, 'One'));
      const {d, t} = open(doc), s0 = snap(d.doc);
      assert.equal(updateToc(d, t, tocOf(d.doc), 'entire'), null);
      const res = t.command(() => run(d, ctxOf(d.doc), null));
      assert.ok(same(d.doc, s0), code);
      assert.ok(res.messages.some((m) => /TOC/.test(m.instr)),
        JSON.stringify(res.messages));
    }
  });

  it('a document whose bookmark marks are past the walk\'s limit: ' +
    'refused, nothing changed (as Insert > Bookmark)', async () => {
      const doc = await read(p('') + H(1, 'One'));
      // a kept block of 1,000,001 nodes: the marks' walk stops
      const kid = {name: 'w:r', attrs: [], children: []};
      doc.sections[0].blocks.push({type: 'opaque', node: {name:
        'w:customXml', attrs: [], children: new Array(1000001)
          .fill(kid)}});
      const {d, t} = open(doc), s0 = snap(d.doc), n = d.undoDepth;
      assert.equal(insertToc(d, t, caret({id: blocks(d)[0].id,
        off: 0}), {}), null);
      assert.ok(same(d.doc, s0));
      assert.equal(d.undoDepth, n);
    });

  it('a _Toc bookmark deleted by the user: rebuilt with a new one',
    async () => {
      const {d, t} = await withToc(BODY);
      const [first] = tocNames(d.doc);
      const del = deleteBookmark(d, t, first);
      assert.ok(!del.error, del.error);
      const res = updateToc(d, t, tocOf(d.doc), 'entire');
      assert.ok(res.changed);
      const names = tocNames(d.doc);
      assert.equal(names.length, 3);
      assert.ok(!names.includes(first) || names.length === 3);
      assert.deepEqual(entriesOf(d.doc, tocOf(d.doc)).map((e) =>
        e.anchor), names);
      await lintAfter(d.doc, 'bookmark again');
    });

  it('a heading deleted between update and undo', async () => {
    const {d, t} = await withToc(BODY);
    const s0 = snap(d.doc);
    const x = findBlock(d.doc, paraOf(d.doc, 'x').id);
    t.command(() => d.apply({op: 'setProps', block: x.at,
      pStyle: 'Heading1'}));
    const s1 = snap(d.doc);
    assert.ok(updateToc(d, t, tocOf(d.doc), 'entire').changed);
    const s2 = snap(d.doc);
    const two = findBlock(d.doc, paraOf(d.doc, 'Two').id);
    t.command(() => d.apply({op: 'removeBlocks', at: two.at,
      count: 1}));
    d.undo();
    assert.ok(deepEqual(d.doc.sections, s2.sections));
    d.undo();
    assert.ok(deepEqual(d.doc.sections, s1.sections));
    d.undo();
    assert.ok(deepEqual(d.doc.sections, s0.sections));
    d.redo();
    d.redo();
    assert.ok(deepEqual(d.doc.sections, s2.sections));
    // Update with the heading gone: no throw, one entry less
    const two2 = findBlock(d.doc, paraOf(d.doc, 'Two').id);
    t.command(() => d.apply({op: 'removeBlocks', at: two2.at,
      count: 1}));
    updateToc(d, t, tocOf(d.doc), 'entire');
    assert.deepEqual(brief(d.doc, tocOf(d.doc)), [[1, 'One'],
      [1, 'x'], [1, 'Three']]);
    await lintAfter(d.doc, 'deleted heading');
  });

  it('a TOC inside a content control is kept as stored (known ' +
    'limit)', async () => {
    const sdt = '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery ' +
      'w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj>' +
      '</w:sdtPr><w:sdtContent>' + p(fld(' TOC \\o "1-3" \\h \\z \\u ',
      'Old')) + '</w:sdtContent></w:sdt>';
    const doc = await read(sdt + H(1, 'One'));
    const {d, t} = open(doc), s0 = snap(d.doc);
    assert.equal(tocFields(d.doc).length, 0);
    t.command(() => run(d, ctxOf(d.doc), null));
    assert.ok(same(d.doc, s0));
  });
});

describe('removeToc', () => {
  it('the whole field goes; the hidden bookmarks stay; one step',
    async () => {
      const doc = await read(p(r('before')) + p('') + H(1, 'One') +
        H(2, 'Two'));
      const {d, t} = open(doc);
      assert.ok(insertToc(d, t, caret({id: blocks(d)[1].id, off: 0}),
        {}));
      const names = tocNames(d.doc), s1 = snap(d.doc);
      const n = d.undoDepth;
      const res = removeToc(d, t, tocOf(d.doc));
      assert.ok(res && res.sel);
      assert.equal(d.undoDepth, n + 1);
      assert.equal(tocFields(d.doc).length, 0);
      assert.equal(scan(d.doc).length, 0, 'no PAGEREF left either');
      assert.deepEqual(blocks(d).map(plain), ['before', '', 'One',
        'Two']);
      assert.deepEqual(tocNames(d.doc), names);
      await lintAfter(d.doc, 'removed');
      d.undo();
      assert.ok(same(d.doc, s1), 'undo');
    });

  it('before a heading that holds the end: the heading stays, in ' +
    'its style', async () => {
    const doc = await read(H(1, 'One') + H(2, 'Two'));
    const {d, t} = open(doc);
    assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
      {}));
    assert.ok(removeToc(d, t, tocOf(d.doc)));
    assert.deepEqual(blocks(d).map((b) => [plain(b), b.pStyle]),
      [['One', 'Heading1'], ['Two', 'Heading2']]);
  });
});

describe('Update all fields: the TOC step', () => {
  it('in order: SEQ, STYLEREF, REF, then the tables, then PAGEREF',
    () => {
      assert.deepEqual(STEPS.map((s) => s.name), ['facts', 'seq',
        'chapters', 'refs', 'fields', 'toc', 'pages']);
    });

  it('a heading with a SEQ and a REF: the entry has their new values',
    async () => {
      const bm = '<w:bookmarkStart w:id="1" w:name="tgt"/>' +
        r('Target') + '<w:bookmarkEnd w:id="1"/>';
      const doc = await read(p('') + H(1, '', r('Part ') +
        fld(' SEQ part ', '7') + r(' ') + fld(' REF tgt ', 'old')) +
        p(bm) + p(fld(' PAGEREF tgt \\h ', '9')));
      const {d, t} = open(doc);
      assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
        {}));
      const res = t.command(() => run(d, ctxOf(d.doc), null));
      assert.ok(res.changed);
      assert.deepEqual(brief(d.doc, tocOf(d.doc)),
        [[1, 'Part 1 Target']]);
      const ref = scan(d.doc).find((f) => /PAGEREF tgt/.test(f.instr));
      const B = findBlock(d.doc, ref.sep.id).b;
      assert.equal(B.text.slice(ref.sep.off + 1, ref.end.off),
        pageNum(d.doc, findBlock(d.doc, ref.sep.id).b.id));
    });

  it('a table long enough to push its own page numbers settles ' +
    '(the bound)', async () => {
      let body = '';
      for (let k = 1; k <= 70; k++)
        body += H(1, 'Heading ' + k) + p(BR);
      // Word's stored result is one line: made again, the table runs
      // over pages and every heading moves on
      const doc = await read(p(fld(' TOC \\o "1-3" \\h \\z \\u ',
        'Old')) + body);
      const {d, t} = open(doc);
      const n = d.undoDepth;
      const res = t.command(() => run(d, ctxOf(d.doc), null));
      assert.ok(res.changed);
      assert.equal(res.passes, MAX_PASSES, 'made again on new pages');
      assert.equal(d.undoDepth, n + 1, 'one step');
      const es = entriesOf(d.doc, tocOf(d.doc));
      assert.equal(es.length, 70);
      const {P} = pagesOf(d.doc);
      const want = es.map((e) => String(P.list[P.ofPos({id:
        findBlock(d.doc, paraOf(d.doc, e.text).id).b.id, off: 0})]
        .num));
      assert.deepEqual(res.messages, []);
      assert.deepEqual(es.map((e) => e.page), want, 'written = shown');
      assert.ok(Number(es[0].page) > 1, 'pushed past the table');
      const again = t.command(() => run(d, ctxOf(d.doc), null));
      assert.equal(again.changed, false);
      assert.equal(d.undoDepth, n + 1);
    });

  it('a TOC in a table cell is rebuilt', async () => {
    const cell = (x) => `<w:tc><w:tcPr><w:tcW w:w="4000" ` +
      `w:type="dxa"/></w:tcPr>${x}</w:tc>`;
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>' +
      `<w:tr>${cell(p(fld(' TOC \\o "1-3" \\h \\z \\u ', 'Old')))}` +
      '</w:tr></w:tbl>';
    const doc = await read(tbl + p('') + H(1, 'One'));
    const {d, t} = open(doc);
    const res = updateToc(d, t, tocOf(d.doc), 'entire');
    assert.ok(res && res.changed);
    assert.deepEqual(brief(d.doc, tocOf(d.doc)), [[1, 'One']]);
    await lintAfter(d.doc, 'cell');
  });

  it('a selection: the table goes in before it, the text stays',
    async () => {
      const doc = await read(p(r('keep me')) + H(1, 'One'));
      const {d, t} = open(doc), id = blocks(d)[0].id;
      const res = insertToc(d, t, select({id, off: 0}, {id, off: 4}),
        {});
      assert.ok(res);
      const f = tocOf(d.doc);
      const B = findBlock(d.doc, f.end.id).b;
      assert.equal(B.text.slice(f.end.off + 1), 'keep me');
    });
});

describe('cost', () => {
  it('10,000 headings: insert, update, remove grow linearly',
    async () => {
      const time = async (n) => {
        let body = p('');
        for (let k = 0; k < n; k++)
          body += H(1, 'Heading ' + k) + p(r('t'));
        const {d} = open(await read(body));
        const t0 = performance.now();
        const at = caret({id: blocks(d)[0].id, off: 0});
        assert.ok(insertToc(d, null, at, {}));
        assert.ok(updateToc(d, null, tocOf(d.doc), 'entire'));
        assert.ok(removeToc(d, null, tocOf(d.doc)));
        return performance.now() - t0;
      };
      const a = await time(1000), b = await time(10000);
      assert.ok(b < 25 * a + 100, `1,000: ${a} ms, 10,000: ${b} ms`);
      if (process.env.WORD_PERF === '1') assert.ok(b < 5000, b + ' ms');
    });
});
