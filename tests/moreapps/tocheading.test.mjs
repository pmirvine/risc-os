// The Table of Contents box's Heading and Formats choices in TocCmd
// (./TocHeading, ./TocFormats): a TOC Heading paragraph put before a
// new table, changed or taken away by Update, removed with the table;
// a design put into the TOC styles; each in the one undo step of the
// insert, the update or the removal; the heading never an entry of
// its own table. Real Document, DocLayout and Pages with the fake
// measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {insertToc, editToc, removeToc, updateToc, tocAt, insertWhy,
  IN_HEADING} from '../../tools/moreapps/!Letters/TocCmd';
import {fill, itemShaded} from '../../tools/moreapps/!Letters/TocPatch';
import {entriesOf, tocFields}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {HEADINGS, headingText, choiceOf, headingOf}
  from '../../tools/moreapps/!Letters/TocHeading';
import {lookOf} from '../../tools/moreapps/!Letters/TocFormats';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {caret, select}
  from '../../tools/moreapps/!Letters/Selection';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {deepEqual, OBJ, newPara}
  from '../../tools/moreapps/!Letters/Model';
import {styleIdByName} from '../../tools/moreapps/!Letters/TocBuild';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {lintAfter} from './lint-after.mjs';
import {emit} from './word-emit.mjs';

before(loadStyles);
const NOW = new Date(2026, 10, 6, 9, 0);
const sty = (id, name, inner = '', based = '') => '<w:style ' +
  `w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (based ? `<w:basedOn w:val="${based}"/>` : '') +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(sty('Normal', 'Normal') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal'));
const H = (n, text) => p(r(text), `<w:pStyle w:val="Heading${n}"/>`);
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES}));
const DOC = () => read(p('') + H(1, 'One') + p(r('body')) +
  H(2, 'Two'));

const open = (doc) => {
  const d = new Document(doc);
  return {d, t: new Typing(d)};
};
function ctxOf(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  return {now: NOW, pages: {finish: () => P}, layout: {L, P}};
}
const blocks = (d) => d.doc.sections[0].blocks;
const snap = (doc) => ({sections: structuredClone(doc.sections),
  styles: doc.styles});
const same = (doc, s) => deepEqual(doc.sections, s.sections) &&
  doc.styles === s.styles;
const tocOf = (doc) => tocFields(doc)[0];
const texts = (doc) => entriesOf(doc, tocOf(doc)).map((e) => e.text);
const styleOf = (doc, name) => doc.styles.styles.get(
  styleIdByName(doc, name, 'paragraph'));
const at0 = (d) => caret({id: blocks(d)[0].id, off: 0});

describe('TocHeading: the choices', () => {
  it('None, Contents, Table of Contents; a text read back', () => {
    assert.deepEqual(HEADINGS.map((h) => h.text), ['None', 'Contents',
      'Table of Contents']);
    assert.equal(headingText('none'), '');
    assert.equal(headingText('contents'), 'Contents');
    assert.equal(headingText('toc'), 'Table of Contents');
    assert.equal(headingText('x'), '');
    assert.equal(choiceOf(null), 'none');
    assert.equal(choiceOf(' contents '), 'contents');
    assert.equal(choiceOf('Table of Contents'), 'toc');
    assert.equal(choiceOf('Inhalt'), 'kept');
  });
});

describe('insertToc with a heading and a format', () => {
  it('Contents + Modern: the heading before the table in TOC ' +
    'Heading, TOC 1 restyled, one undo step', async () => {
    const doc = await DOC(), {d, t} = open(doc);
    const s0 = snap(d.doc), n0 = d.undoDepth;
    const res = insertToc(d, t, at0(d), {heading: 'Contents',
      format: 'modern'}, ctxOf(d.doc));
    assert.ok(res);
    assert.equal(d.undoDepth, n0 + 1, 'one undo step');
    const f = tocOf(d.doc);
    const h = headingOf(d.doc, f);
    assert.ok(h, 'a heading');
    assert.equal(h.text, 'Contents');
    const hb = findBlock(d.doc, h.id);
    assert.equal(hb.b.pStyle, 'TOCHeading');
    assert.equal(blocks(d)[0].id, h.id, 'first, before the table');
    assert.equal(styleOf(d.doc, 'TOC Heading').basedOn, 'Heading1');
    const t1 = styleOf(d.doc, 'toc 1');
    assert.deepEqual(t1.rPr.sz, lookOf('modern', 1).rPr.sz);
    assert.deepEqual(t1.rPr.extra, lookOf('modern', 1).rPr.extra);
    assert.deepEqual(texts(d.doc), ['One', 'Two']);
    await lintAfter(d.doc, 'toc with heading');
    emit('tocheading-modern', await writeDocx(d.doc));
    d.undo();
    assert.ok(same(d.doc, s0), 'undo: as before');
  });
  it('None and From template: no heading, no TOC Heading style, the ' +
    'TOC styles Word\'s own', async () => {
    const doc = await DOC(), {d, t} = open(doc);
    assert.ok(insertToc(d, t, at0(d), {heading: '',
      format: 'template'}, ctxOf(d.doc)));
    assert.equal(headingOf(d.doc, tocOf(d.doc)), null);
    assert.equal(styleIdByName(d.doc, 'TOC Heading'), null);
    assert.deepEqual(styleOf(d.doc, 'toc 2').pPr,
      {spacing: {after: 100}, ind: {left: 220}, extra: []});
  });
  it('in the middle of a paragraph: the heading between its halves',
    async () => {
      const doc = await read(p(r('abcdef')) + H(1, 'One'));
      const {d, t} = open(doc);
      assert.ok(insertToc(d, t, caret({id: blocks(d)[0].id, off: 3}),
        {heading: 'Table of Contents'}, ctxOf(d.doc)));
      const bs = blocks(d).map((b) => b.text.split(OBJ).join(''));
      assert.equal(bs[0], 'abc');
      assert.equal(bs[1], 'Table of Contents');
      assert.equal(headingOf(d.doc, tocOf(d.doc)).id, blocks(d)[1].id);
    });
  for (const id of ['classic', 'formal', 'simple', 'distinctive',
    'elegant']) {
    it(`${id}: written for Word with its heading`, async () => {
      const doc = await DOC(), {d, t} = open(doc);
      assert.ok(insertToc(d, t, at0(d), {heading: 'Contents',
        format: id}, ctxOf(d.doc)));
      emit('tocheading-' + id, await writeDocx(d.doc));
      const back = await readDocx(await writeDocx(d.doc));
      assert.equal(headingOf(back, tocOf(back)).text, 'Contents');
      assert.deepEqual(styleOf(back, 'toc 1').rPr,
        styleOf(d.doc, 'toc 1').rPr);
    });
  }
});

describe('the heading on Update and Remove', () => {
  const made = async (heading = 'Contents') => {
    const doc = await DOC(), o = open(doc);
    assert.ok(insertToc(o.d, o.t, at0(o.d), {heading},
      ctxOf(o.d.doc)));
    return o;
  };
  it('never an entry of its own table, with \\u or without', async () => {
    const {d, t} = await made();
    assert.ok(updateToc(d, t, tocOf(d.doc), 'entire', ctxOf(d.doc)));
    assert.deepEqual(texts(d.doc), ['One', 'Two']);
    const f = tocOf(d.doc);
    assert.ok(editToc(d, t, f, {instr: 'TOC \\o "1-9" \\h \\z \\u'},
      ctxOf(d.doc)));
    assert.deepEqual(texts(d.doc), ['One', 'Two']);
  });
  it('changed: Table of Contents, one step; taken away: one step',
    async () => {
      const {d, t} = await made();
      const n = d.undoDepth, s0 = snap(d.doc);
      assert.ok(editToc(d, t, tocOf(d.doc), {instr: null,
        heading: 'Table of Contents'}, ctxOf(d.doc)));
      assert.equal(d.undoDepth, n + 1);
      assert.equal(headingOf(d.doc, tocOf(d.doc)).text,
        'Table of Contents');
      assert.ok(editToc(d, t, tocOf(d.doc), {instr: null, heading: ''},
        ctxOf(d.doc)));
      assert.equal(d.undoDepth, n + 2);
      assert.equal(headingOf(d.doc, tocOf(d.doc)), null);
      assert.equal(blocks(d)[0].id, tocOf(d.doc).begin.id);
      d.undo();
      d.undo();
      assert.ok(deepEqual(d.doc.sections, s0.sections), 'undo twice');
    });
  it('added by Update to a table with none; left when not asked',
    async () => {
      const {d, t} = await made('');
      assert.equal(headingOf(d.doc, tocOf(d.doc)), null);
      assert.ok(editToc(d, t, tocOf(d.doc), {instr: null},
        ctxOf(d.doc)));
      assert.equal(headingOf(d.doc, tocOf(d.doc)), null);
      assert.ok(editToc(d, t, tocOf(d.doc), {instr: null,
        heading: 'Contents'}, ctxOf(d.doc)));
      assert.equal(headingOf(d.doc, tocOf(d.doc)).text, 'Contents');
    });
  it('a heading typed by hand is kept by an Update not asked to ' +
    'change it', async () => {
    const {d, t} = await made();
    const h = findBlock(d.doc, headingOf(d.doc, tocOf(d.doc)).id);
    t.command(() => d.apply({op: 'replaceText', block: h.at, at: 0,
      del: 8, ins: 'Inhalt'}));
    assert.ok(editToc(d, t, tocOf(d.doc), {instr: null,
      format: 'simple'}, ctxOf(d.doc)));
    assert.equal(headingOf(d.doc, tocOf(d.doc)).text, 'Inhalt');
    assert.equal(choiceOf('Inhalt'), 'kept');
  });
  it('a format on Update: the styles changed in the same one step',
    async () => {
      const {d, t} = await made();
      const n = d.undoDepth, st = d.doc.styles;
      assert.ok(editToc(d, t, tocOf(d.doc), {instr: null,
        format: 'elegant'}, ctxOf(d.doc)));
      assert.equal(d.undoDepth, n + 1);
      assert.equal(styleOf(d.doc, 'toc 1').rPr.rFonts.ascii, 'Cambria');
      d.undo();
      assert.equal(d.doc.styles, st, 'undo: the styles as they were');
    });
  it('Remove takes the heading with the table, one step', async () => {
    const {d, t} = await made();
    const n = d.undoDepth, s0 = snap(d.doc);
    assert.ok(removeToc(d, t, tocOf(d.doc)));
    assert.equal(d.undoDepth, n + 1);
    assert.equal(tocFields(d.doc).length, 0);
    assert.ok(!blocks(d).some((b) => b.text === 'Contents'));
    d.undo();
    assert.ok(deepEqual(d.doc.sections, s0.sections), 'undo');
  });
  it('a TOC Heading paragraph not directly above stays; a Normal ' +
    'paragraph above is no heading', async () => {
    const {d, t} = await made();
    const f = tocOf(d.doc), h = headingOf(d.doc, f);
    const loc = findBlock(d.doc, f.begin.id);
    t.command(() => d.apply({op: 'insertBlocks', at: loc.at,
      blocks: [newPara('between')]}));
    assert.equal(headingOf(d.doc, tocOf(d.doc)), null);
    assert.ok(removeToc(d, t, tocOf(d.doc)));
    assert.ok(findBlock(d.doc, h.id), 'the heading stays');
  });
});

describe('a caret in the heading is in its table', () => {
  const made = async () => {
    const doc = await DOC(), o = open(doc);
    assert.ok(insertToc(o.d, o.t, at0(o.d), {heading: 'Contents'},
      ctxOf(o.d.doc)));
    return o;
  };
  it('tocAt and fill: a caret and a range in the heading give the ' +
    'table; the box edits it, its heading shown', async () => {
    const {d} = await made();
    const f = tocOf(d.doc), h = headingOf(d.doc, f);
    for (const sel of [caret({id: h.id, off: 4}), caret({id: h.id,
      off: 0}), select({id: h.id, off: 1}, {id: h.id, off: 6})]) {
      const g = tocAt(d.doc, sel);
      assert.ok(g, 'a table');
      assert.equal(g.begin.id, f.begin.id);
      const v = fill(d.doc, sel);
      assert.equal(v.editing, true);
      assert.equal(v.heading, 'contents');
    }
  });
  it('insertWhy refuses a new table in the heading; the Table of ' +
    'Figures item is shaded there, Table of Contents live', async () => {
    const {d, t} = await made();
    const h = headingOf(d.doc, tocOf(d.doc));
    const sel = caret({id: h.id, off: 4});
    assert.equal(insertWhy(d, sel), IN_HEADING);
    assert.equal(insertToc(d, t, sel, {}), null, 'never a table there');
    assert.equal(tocFields(d.doc).length, 1);
    assert.equal(itemShaded(d, sel), false);
    assert.equal(itemShaded(d, sel, true), true);
  });
  it('Remove from the heading takes the table and the heading',
    async () => {
      const {d, t} = await made();
      const h = headingOf(d.doc, tocOf(d.doc));
      assert.ok(removeToc(d, t, tocAt(d.doc, caret({id: h.id,
        off: 4}))));
      assert.equal(tocFields(d.doc).length, 0);
      assert.ok(!findBlock(d.doc, h.id));
    });
  it('a TOC Heading paragraph holding a field mark is no heading',
    async () => {
      const {d} = await made();
      const f = tocOf(d.doc);
      const begin = findBlock(d.doc, f.begin.id).b;
      const h = blocks(d)[0];
      h.inlines = {...h.inlines, 8: begin.inlines[f.begin.off]};
      h.text += OBJ;
      h.runs[h.runs.length - 1].end += 1;
      assert.equal(headingOf(d.doc, f), null);
    });
});

describe('the heading\'s marks and styles that cannot be made', () => {
  it('a new heading text keeps a bookmark in the heading', async () => {
    const doc = await DOC(), {d, t} = open(doc);
    assert.ok(insertToc(d, t, at0(d), {heading: 'Contents'},
      ctxOf(d.doc)));
    const h = findBlock(d.doc, headingOf(d.doc, tocOf(d.doc)).id);
    const bm = (name, n) => ({kind: 'raw', level: 'p', node: {name,
      attrs: [['w:id', '7'], ...(n ? [['w:name', n]] : [])],
      children: []}});
    t.command(() => {
      d.apply({op: 'replaceText', block: h.at, at: 0, del: 0, ins: OBJ,
        inlines: {0: bm('w:bookmarkStart', 'top')}});
      d.apply({op: 'replaceText', block: h.at, at: 9, del: 0, ins: OBJ,
        inlines: {0: bm('w:bookmarkEnd')}});
    });
    assert.ok(editToc(d, t, tocOf(d.doc), {instr: null,
      heading: 'Table of Contents'}, ctxOf(d.doc)));
    const b = findBlock(d.doc, h.b.id).b;
    assert.equal(b.text, OBJ + 'Table of Contents' + OBJ);
    assert.deepEqual(Object.values(b.inlines).map((x) => x.node.name),
      ['w:bookmarkStart', 'w:bookmarkEnd']);
  });
  it('TOCHeading or TOC1 under another name: named in notes, not ' +
    'taken over', async () => {
    const doc = await DOC(), {d, t} = open(doc);
    const mine = (id) => ({id, type: 'paragraph', name: 'Mine ' + id,
      pPr: {extra: []}, rPr: {extra: []}, extra: [], raw: null});
    doc.styles.styles.set('TOCHeading', mine('TOCHeading'));
    doc.styles.styles.set('TOC1', mine('TOC1'));
    const r1 = insertToc(d, t, at0(d), {heading: 'Contents',
      format: 'simple'}, ctxOf(d.doc));
    assert.ok(r1);
    assert.deepEqual(r1.notes, ['The style TOC Heading could not be ' +
      'made: the document has another style, Mine TOCHeading, under ' +
      'its id TOCHeading. No heading was put in.', 'The style TOC 1 ' +
      'could not be made: the document has another style, Mine TOC1, ' +
      'under its id TOC1.']);
    assert.equal(headingOf(d.doc, tocOf(d.doc)), null);
    assert.equal(d.doc.styles.styles.get('TOC1').name, 'Mine TOC1');
    const r2 = editToc(d, t, tocOf(d.doc), {instr: null,
      format: 'classic'}, ctxOf(d.doc));
    assert.equal(r2.notes.length, 2);
  });
});
