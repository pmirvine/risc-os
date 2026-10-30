// Cross-references (Batch E3): Insert > Cross-reference... as
// ./XrefCmd insertXref (a hidden _Ref bookmark round the target,
// reused when one spans it already, and the REF / PAGEREF / NOTEREF
// field Word writes, its result filled at once, one undo step) over
// the targets ./XrefTargets lists (numbered items, headings,
// bookmarks, footnotes, endnotes, the captions of each label); the
// update message of a reference whose bookmark is gone
// (./FieldPasses messageText); and the Table of Figures mode of the
// Table of Contents box (./TocPatch, ./TocCmd instrOf with seqId).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {insertXref, xrefWhy, codeOf, ABOVE_OK}
  from '../../tools/moreapps/!Letters/XrefCmd';
import {MAX_REF_DEPTH} from '../../tools/moreapps/!Letters/FieldRef';
import {list, typesOf, whatsOf, TYPES}
  from '../../tools/moreapps/!Letters/XrefTargets';
import {run, messageText}
  from '../../tools/moreapps/!Letters/FieldPasses';
import {updateCmd} from '../../tools/moreapps/!Letters/FieldCmd';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {of as bookmarks}
  from '../../tools/moreapps/!Letters/BookmarkIndex';
import {marks, storyMarks, noteMarks}
  from '../../tools/moreapps/!Letters/BookmarkMarks';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {caret, select} from '../../tools/moreapps/!Letters/Selection';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {deepEqual, OBJ} from '../../tools/moreapps/!Letters/Model';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {insertNote} from '../../tools/moreapps/!Letters/NoteCmd';
import {insertCaption} from '../../tools/moreapps/!Letters/CaptionCmd';
import {instrOf, insertToc} from '../../tools/moreapps/!Letters/TocCmd';
import {entriesOf} from '../../tools/moreapps/!Letters/TocUpdate';
import {fill as tocFill, patch as tocPatch}
  from '../../tools/moreapps/!Letters/TocPatch';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r}
  from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, noteP, mark, emark, enoteP}
  from './note-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const sty = (id, name, inner = '', based = '', def = '') =>
  `<w:style w:type="paragraph"${def} w:styleId="${id}"><w:name ` +
  `w:val="${name}"/>` + (based ? `<w:basedOn w:val="${based}"/>`
    : '') + `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = sty('Normal', 'Normal', '', '', ' w:default="1"') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal') +
  sty('Caption', 'caption', '', 'Normal');
const lvl = (n, text) => `<w:lvl w:ilvl="${n}"><w:start w:val="1"/>` +
  `<w:numFmt w:val="decimal"/><w:lvlText w:val="${text}"/></w:lvl>`;
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0">' +
  lvl(0, '%1.') + lvl(1, '%1.%2') + '</w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="1">' + lvl(0, '(%1)') +
  '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>' +
  '</w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');
const NUM = (l, id = 1) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId ` +
  `w:val="${id}"/></w:numPr>`;
const H = (n, t, extra = '') => p(r(t),
  `<w:pStyle w:val="Heading${n}"/>${extra}`);
const CAP = (inner) => p(inner, '<w:pStyle w:val="Caption"/>');
const S = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const E = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body),
  'word/styles.xml': stylesXml(STYLES),
  'word/numbering.xml': NUMBERING}));
const BR = '<w:r><w:br w:type="page"/></w:r>';

/** A Document of doc, its Print layout and pages, and a ctx. */
function opened(doc) {
  const d = new Document(doc);
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  L.place = PlacePrint(L, P);
  const ctx = {now: NOW, pages: {finish: () => P}, layout: {L, P}};
  return {d, t: new Typing(d), ctx};
}
const plain = (b) => b.text.split(OBJ).join('');
const blocks = (d) => d.doc.sections[0].blocks;
/** The first paragraph (any depth) whose plain text is text. */
function paraOf(doc, text) {
  let got = null;
  forEachBlock(doc, (b) => {
    if (!got && b.type === 'p' && plain(b) === text) got = b;
    return !got;
  });
  return got;
}
const end = (doc, text) => {
  const b = paraOf(doc, text);
  return caret({id: b.id, off: b.text.length});
};
const storedOf = (doc, f) => findBlock(doc, f.sep.id).b.text
  .slice(f.sep.off + 1, f.end.off);
/** The REF / PAGEREF / NOTEREF fields: [instr, result]. */
const refs = (doc) => scan(doc).filter((f) =>
  /^\s*(REF|PAGEREF|NOTEREF)\b/.test(f.instr)).map((f) =>
  [f.instr.trim(), storedOf(doc, f)]);
const target = (doc, type, text) => list(doc, type).find((x) =>
  x.text === text);
const snap = (doc) => structuredClone({s: doc.sections,
  st: [...(doc.stories || new Map())].map(([k, v]) => [k, v.blocks])});
const same = (doc, s) => deepEqual(snap(doc), s);
const REFNAME = /_Ref\d{9}/;

const MAIN = H(1, 'Intro', NUM(0)) + p(r('Body.')) +
  H(2, 'Methods') + p(r('Apples'), NUM(0, 2)) +
  p(r('Pears'), NUM(0, 2)) +
  p(r('Some ') + S(1, 'Mine') + r('marked') + E(1) + r(' text.')) +
  CAP(r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '1') +
    r(': A cat')) +
  CAP(r('Table ') + fld(' SEQ Table \\* ARABIC ', '1') +
    r(' Sums')) +
  p(r('See '));

describe('XrefTargets', () => {
  it('the types: Word\'s five and each caption label', async () => {
    const doc = await read(MAIN + CAP(r('Plate ') +
      fld(' SEQ My_Plate ', '1')));
    assert.deepEqual(TYPES.map((t) => t.id), ['numbered', 'heading',
      'bookmark', 'footnote', 'endnote']);
    const ts = typesOf(doc).map((t) => t.id);
    assert.deepEqual(ts.slice(0, 5), TYPES.map((t) => t.id));
    assert.deepEqual(ts.slice(5), ['seq:Figure', 'seq:Table',
      'seq:Equation', 'seq:My_Plate']);
    assert.equal(typesOf(doc).find((t) => t.id === 'seq:My_Plate').text,
      'My Plate');
  });

  it('the lists: headings, numbered items, bookmarks, captions',
    async () => {
      const doc = await read(MAIN);
      const hs = list(doc, 'heading');
      assert.deepEqual(hs.map((x) => [x.label, x.text, x.level]),
        [['1. Intro', 'Intro', 1], ['Methods', 'Methods', 2]]);
      assert.ok(hs.every((x) => typeof x.id === 'string' &&
        x.para !== undefined));
      assert.deepEqual(list(doc, 'numbered').map((x) => x.label),
        ['1. Intro', '(1) Apples', '(2) Pears']);
      const bs = list(doc, 'bookmark');
      assert.deepEqual(bs.map((x) => [x.label, x.bookmark, x.text]),
        [['Mine', 'Mine', 'marked']]);
      assert.deepEqual(list(doc, 'seq:Figure').map((x) => x.label),
        ['Figure 1: A cat']);
      assert.deepEqual(list(doc, 'seq:Table').map((x) => x.text),
        ['Table 1 Sums']);
      assert.deepEqual(list(doc, 'seq:Equation'), []);
      assert.deepEqual(list(doc, 'nonsense'), []);
      assert.deepEqual(list(null, 'heading'), []);
    });

  it('hidden bookmarks are not listed', async () => {
    const doc = await read(p(S(1, '_Ref123456789') + r('x') + E(1) +
      S(2, 'Shown') + r('y') + E(2)));
    assert.deepEqual(list(doc, 'bookmark').map((x) => x.bookmark),
      ['Shown']);
  });

  it('footnotes and endnotes: the number and the first words',
    async () => {
      const doc = await noteDoc(p(r('a') + mark(2) + r(' b') +
        emark(3)) + p(r('c') + mark(5)), {2: noteP('First note words'),
        5: noteP('Second')}, {endnotes: {3: enoteP('An end note')}});
      assert.deepEqual(list(doc, 'footnote').map((x) => x.label),
        ['1 First note words', '2 Second']);
      assert.deepEqual(list(doc, 'endnote').map((x) => x.label),
        ['1 An end note']);
      assert.deepEqual(list(doc, 'footnote')[0].note,
        {kind: 'footnote', id: 2});
    });

  it('the what choices per type', () => {
    assert.deepEqual(whatsOf('heading').map((x) => x.id), ['text',
      'page', 'number', 'numberNoContext', 'numberFullContext',
      'above']);
    assert.deepEqual(whatsOf('numbered').map((x) => x.id), ['page',
      'number', 'numberNoContext', 'numberFullContext', 'text',
      'above']);
    assert.deepEqual(whatsOf('footnote').map((x) => x.id), [
      'noteNumber', 'page', 'above', 'noteNumberFormatted']);
    assert.deepEqual(whatsOf('seq:Figure').map((x) => x.id), [
      'caption', 'labelNumber', 'captionText', 'page', 'above']);
  });
});

describe('codeOf', () => {
  it('the instruction Word writes', () => {
    const c = (o) => codeOf({name: '_Ref1', ...o});
    assert.equal(c({what: 'text'}), 'REF _Ref1 \\h');
    assert.equal(c({what: 'text', hyperlink: false}), 'REF _Ref1');
    assert.equal(c({what: 'number'}), 'REF _Ref1 \\r \\h');
    assert.equal(c({what: 'numberNoContext'}), 'REF _Ref1 \\n \\h');
    assert.equal(c({what: 'numberFullContext'}), 'REF _Ref1 \\w \\h');
    assert.equal(c({what: 'above'}), 'REF _Ref1 \\p \\h');
    assert.equal(c({what: 'page'}), 'PAGEREF _Ref1 \\h');
    assert.equal(c({what: 'page', above: true}),
      'PAGEREF _Ref1 \\p \\h');
    assert.equal(c({what: 'noteNumber'}), 'NOTEREF _Ref1 \\h');
    assert.equal(c({what: 'noteNumberFormatted'}),
      'NOTEREF _Ref1 \\f \\h');
    assert.equal(c({what: 'above', type: 'footnote'}),
      'NOTEREF _Ref1 \\p \\h');
    assert.equal(c({what: 'caption'}), 'REF _Ref1 \\h');
    assert.equal(c({what: 'nonsense'}), null);
  });
});

describe('insertXref: each type and what', () => {
  const put = async (type, text, what, more = {}, body = MAIN) => {
    const o = opened(await read(body));
    const t = target(o.d.doc, type, text);
    assert.ok(t, `target ${text}`);
    const n0 = o.d.undoDepth;
    const res = insertXref(o.d, o.t, end(o.d.doc, 'See '), {type,
      target: t.id, what, ...more}, o.ctx);
    assert.ok(res, `${type} ${what}`);
    assert.equal(o.d.undoDepth, n0 + 1, 'one undo step');
    return {...o, res, refs: refs(o.d.doc)};
  };
  const one = (x) => {
    assert.equal(x.refs.length, 1);
    return [x.refs[0][0].replace(REFNAME, '_Ref'), x.refs[0][1]];
  };

  it('heading: text, number (three ways), page, above/below',
    async () => {
      assert.deepEqual(one(await put('heading', 'Intro', 'text')),
        ['REF _Ref \\h', 'Intro']);
      assert.deepEqual(one(await put('heading', 'Intro', 'number')),
        ['REF _Ref \\r \\h', '1']);
      assert.deepEqual(one(await put('heading', 'Intro',
        'numberNoContext')), ['REF _Ref \\n \\h', '1']);
      assert.deepEqual(one(await put('heading', 'Intro',
        'numberFullContext')), ['REF _Ref \\w \\h', '1']);
      assert.deepEqual(one(await put('heading', 'Intro', 'page')),
        ['PAGEREF _Ref \\h', '1']);
      assert.deepEqual(one(await put('heading', 'Methods', 'above')),
        ['REF _Ref \\p \\h', 'above']);
      assert.deepEqual(one(await put('heading', 'Methods', 'text',
        {hyperlink: false})), ['REF _Ref', 'Methods']);
    });

  it('the hidden bookmark spans the heading text; the caret after ' +
    'the field', async () => {
      const x = await put('heading', 'Intro', 'text');
      const name = REFNAME.exec(x.refs[0][0])[0];
      const e = bookmarks(x.d.doc).find(name);
      assert.ok(e);
      assert.equal(e.plain, 'Intro');
      assert.equal(e.para, paraOf(x.d.doc, 'Intro').id);
      const q = paraOf(x.d.doc, 'See Intro');
      assert.equal(x.res.sel.head.id, q.id);
      assert.equal(x.res.sel.head.off, q.text.length);
      await lintAfter(x.d.doc, 'xref heading');
    });

  it('numbered item: number and text', async () => {
    assert.deepEqual(one(await put('numbered', 'Pears', 'number')),
      ['REF _Ref \\r \\h', '(2)']);
    assert.deepEqual(one(await put('numbered', 'Pears', 'text')),
      ['REF _Ref \\h', 'Pears']);
  });

  it('bookmark: its own name, no hidden bookmark', async () => {
    const x = await put('bookmark', 'marked', 'text');
    assert.deepEqual(x.refs, [['REF Mine \\h', 'marked']]);
    assert.equal(bookmarks(x.d.doc).list.length, 1);
    assert.deepEqual(one(await put('bookmark', 'marked', 'page')),
      ['PAGEREF Mine \\h', '1']);
  });

  it('captions: entire, label and number, text only, page',
    async () => {
      const c = 'Figure 1: A cat';
      assert.deepEqual(one(await put('seq:Figure', c, 'caption')),
        ['REF _Ref \\h', 'Figure 1: A cat']);
      assert.deepEqual(one(await put('seq:Figure', c, 'labelNumber')),
        ['REF _Ref \\h', 'Figure 1']);
      assert.deepEqual(one(await put('seq:Figure', c, 'captionText')),
        ['REF _Ref \\h', 'A cat']);
      assert.deepEqual(one(await put('seq:Figure', c, 'page')),
        ['PAGEREF _Ref \\h', '1']);
      assert.deepEqual(one(await put('seq:Table', 'Table 1 Sums',
        'labelNumber')), ['REF _Ref \\h', 'Table 1']);
      const x = await put('seq:Figure', c, 'labelNumber');
      await lintAfter(x.d.doc, 'xref caption');
    });

  it('page numbers follow the pages', async () => {
    const body = p(r('a')) + p(BR) + H(1, 'Late') + p(r('See '));
    assert.deepEqual(one(await put('heading', 'Late', 'page', {},
      body)), ['PAGEREF _Ref \\h', '2']);
    assert.deepEqual(one(await put('heading', 'Late', 'page',
      {above: true}, body)), ['PAGEREF _Ref \\p \\h', 'above']);
  });
});

describe('insertXref: bookmarks', () => {
  it('a second reference to the same heading reuses its _Ref; ' +
    'ids and names unique', async () => {
    const o = opened(await read(MAIN));
    const h = target(o.d.doc, 'heading', 'Intro');
    assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
      'heading', target: h.id, what: 'text'}, o.ctx));
    const b1 = bookmarks(o.d.doc).list.length;
    assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See Intro'), {type:
      'heading', target: h.id, what: 'page'}, o.ctx));
    assert.equal(bookmarks(o.d.doc).list.length, b1, 'reused');
    const names = refs(o.d.doc).map(([i]) => REFNAME.exec(i)[0]);
    assert.equal(names[0], names[1]);
    // other targets: new bookmarks, ids and names unique
    for (const [type, text, what] of [['heading', 'Methods', 'text'],
      ['numbered', 'Apples', 'number'],
      ['seq:Figure', 'Figure 1: A cat', 'labelNumber'],
      ['seq:Figure', 'Figure 1: A cat', 'captionText']]) {
      const t = target(o.d.doc, type, text);
      const q = blocks(o.d).at(-1);
      assert.ok(insertXref(o.d, o.t, caret({id: q.id,
        off: q.text.length}), {type, target: t.id, what}, o.ctx), text);
    }
    const ms = [...marks(o.d.doc), ...storyMarks(o.d.doc),
      ...noteMarks(o.d.doc)].filter((m) => m.kind === 'start');
    assert.equal(new Set(ms.map((m) => m.id)).size, ms.length);
    assert.equal(new Set(ms.map((m) => m.name.toLowerCase())).size,
      ms.length);
    assert.equal(ms.length, 6, 'Mine and five _Ref');
    await lintAfter(o.d.doc, 'xref ids');
  });

  it('an existing _Ref round the heading is reused', async () => {
    const doc = await read(p(S(7, '_Ref200000000') + r('Head') + E(7),
      '<w:pStyle w:val="Heading1"/>') + p(r('See ')));
    const x = opened(doc);
    const h = target(x.d.doc, 'heading', 'Head');
    assert.ok(insertXref(x.d, x.t, end(x.d.doc, 'See '), {type:
      'heading', target: h.id, what: 'text'}, x.ctx));
    assert.deepEqual(refs(x.d.doc), [['REF _Ref200000000 \\h',
      'Head']]);
    assert.equal(bookmarks(x.d.doc).list.length, 1);
  });
});

describe('insertXref: updates', () => {
  it('renumbered captions: Update all fields updates every REF',
    async () => {
      const o = opened(await read(CAP(r('Figure ') +
        fld(' SEQ Figure \\* ARABIC ', '1') + r(' one')) +
        CAP(r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '2') +
          r(' two')) + p(r('See '))));
      const t = target(o.d.doc, 'seq:Figure', 'Figure 2 two');
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
        'seq:Figure', target: t.id, what: 'labelNumber'}, o.ctx));
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See Figure 2'),
        {type: 'seq:Figure', target: t.id, what: 'caption'}, o.ctx));
      assert.deepEqual(refs(o.d.doc).map((x) => x[1]), ['Figure 2',
        'Figure 2 two']);
      // the first caption deleted
      o.d.apply({op: 'removeBlock', at: [0, 0]});
      const res = o.t.command(() => run(o.d, {now: NOW}, null));
      assert.ok(res.ok);
      assert.deepEqual(refs(o.d.doc).map((x) => x[1]), ['Figure 1',
        'Figure 1 two']);
    });

  it('a caption put in before renumbers the REF at once', async () => {
    const o = opened(await read(p(r('top')) + CAP(r('Figure ') +
      fld(' SEQ Figure \\* ARABIC ', '1') + r(' cat')) +
      p(r('See '))));
    const t = target(o.d.doc, 'seq:Figure', 'Figure 1 cat');
    assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
      'seq:Figure', target: t.id, what: 'labelNumber'}, o.ctx));
    assert.ok(insertCaption(o.d, o.t, end(o.d.doc, 'top'),
      {label: 'Figure'}));
    assert.deepEqual(refs(o.d.doc).map((x) => x[1]), ['Figure 2']);
  });

  it('heading text edited: Update all fields shows the new text',
    async () => {
      const o = opened(await read(MAIN));
      const h = target(o.d.doc, 'heading', 'Intro');
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
        'heading', target: h.id, what: 'text'}, o.ctx));
      const q = paraOf(o.d.doc, 'Intro');
      const k = q.text.indexOf('Intro') + 5;
      o.d.apply({op: 'replaceText', block: findBlock(o.d.doc, q.id).at,
        at: k, del: 0, ins: 'duction'});
      const res = o.t.command(() => run(o.d, {now: NOW}, null));
      assert.ok(res.changed);
      assert.equal(refs(o.d.doc)[0][1], 'Introduction');
    });

  it('a target deleted: the result kept, the message names it',
    async () => {
      const o = opened(await read(MAIN));
      const h = target(o.d.doc, 'heading', 'Methods');
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
        'heading', target: h.id, what: 'text'}, o.ctx));
      const instr = refs(o.d.doc)[0][0];
      const at = findBlock(o.d.doc, paraOf(o.d.doc, 'Methods').id).at;
      o.d.apply({op: 'removeBlock', at});
      const res = run(o.d, {now: NOW}, null);
      assert.deepEqual(refs(o.d.doc), [[instr, 'Methods']]);
      const m = res.messages.find((x) => x.instr === instr);
      assert.deepEqual(m, {instr, reason: 'missing bookmark'});
      assert.equal(messageText(m), 'source not found: ' + instr);
      assert.equal(messageText({instr: 'PAGE', reason: 'locked'}),
        'PAGE: locked');
      assert.equal(messageText({instr: '', reason: 'pages not ' +
        'settled after 3 passes'}), 'pages not settled after 3 passes');
    });

  it('NOTEREF: a footnote and an endnote; numbers follow a note put ' +
    'in before', async () => {
      const doc = await noteDoc(p(r('a') + mark(2)) +
        p(r('b') + emark(3)) + p(r('See ')),
      {2: noteP('First')}, {endnotes: {3: enoteP('End')}});
      const o = opened(doc);
      const f = list(o.d.doc, 'footnote')[0];
      const e = list(o.d.doc, 'endnote')[0];
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
        'footnote', target: f.id, what: 'noteNumber'}, o.ctx));
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See 1'), {type:
        'footnote', target: f.id, what: 'noteNumberFormatted'},
      o.ctx));
      const q = blocks(o.d).at(-1);
      assert.ok(insertXref(o.d, o.t, caret({id: q.id,
        off: q.text.length}), {type: 'endnote', target: e.id,
        what: 'noteNumber'}, o.ctx));
      assert.deepEqual(refs(o.d.doc).map(([i, v]) =>
        [i.replace(REFNAME, '_Ref'), v]), [['NOTEREF _Ref \\h', '1'],
        ['NOTEREF _Ref \\f \\h', '1'], ['NOTEREF _Ref \\h', '1']]);
      // the bookmark wraps the note's mark in the body
      const name = REFNAME.exec(refs(o.d.doc)[0][0])[0];
      const bm = bookmarks(o.d.doc).find(name);
      assert.equal(bm.para, blocks(o.d)[0].id);
      assert.equal(bm.end.off - bm.start.off, 1);
      // a footnote and an endnote put in before: Update all fields
      const a = blocks(o.d)[0];
      assert.ok(insertNote(o.d, o.t, caret({id: a.id, off: 0}),
        'footnote'));
      assert.ok(insertNote(o.d, o.t, caret({id: a.id, off: 0}),
        'endnote'));
      o.t.command(() => run(o.d, {now: NOW}, null));
      assert.deepEqual(refs(o.d.doc).map((x) => x[1]), ['2', '2',
        '2']);
      await lintAfter(o.d.doc, 'xref notes');
    });
});

describe('insertXref: where', () => {
  it('in a table cell', async () => {
    const o = opened(await read(H(1, 'Intro') +
      tbl([tr([tc(p(r('See ')))])])));
    const h = target(o.d.doc, 'heading', 'Intro');
    assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
      'heading', target: h.id, what: 'text'}, o.ctx));
    assert.ok(paraOf(o.d.doc, 'See Intro'));
    await lintAfter(o.d.doc, 'xref cell');
  });

  it('in a header: the field in the story, the bookmark in the body, ' +
    'one undo step', async () => {
      const d = new Document(await readDocx(await withHeaders(
        H(1, 'Intro') + p(r('body')), {default: p(r('See '))})));
      const fa = facadeOf(d, 'word/header1.xml', 0);
      const t = new Typing(d);
      const s0 = snap(d.doc), n0 = d.undoDepth;
      const h = target(d.doc, 'heading', 'Intro');
      const hp = fa.doc.sections[0].blocks[0];
      const res = insertXref(fa, t, caret({id: hp.id,
        off: hp.text.length}), {type: 'heading', target: h.id,
        what: 'text'}, {now: NOW});
      assert.ok(res);
      assert.equal(d.undoDepth, n0 + 1);
      const story = d.doc.stories.get('word/header1.xml');
      assert.equal(plain(story.blocks[0]), 'See Intro');
      const name = REFNAME.exec(refs(fa.doc)[0][0])[0];
      assert.equal(bookmarks(d.doc).find(name).story, null);
      d.undo();
      assert.ok(same(d.doc, s0), 'undo: both gone');
      await lintAfter(d.doc, 'xref header');
    });

  it('in a note\'s text', async () => {
    const d = new Document(await noteDoc(H(1, 'Intro') +
      p(r('x') + mark(2)), {2: noteP('See')}));
    const fn = facadeOf(d, {note: {kind: 'footnote', id: 2}});
    const t = new Typing(d);
    const h = target(d.doc, 'heading', 'Intro');
    const np = fn.doc.sections[0].blocks[0];
    assert.equal(xrefWhy(fn, caret({id: np.id, off: np.text.length})),
      null);
    assert.ok(insertXref(fn, t, caret({id: np.id,
      off: np.text.length}), {type: 'heading', target: h.id,
      what: 'text'}, {now: NOW}));
    const note = d.doc.notes.footnotes.get(2);
    assert.equal(plain(note.blocks[0]).trim(), 'SeeIntro');
    await lintAfter(d.doc, 'xref note');
  });

  it('a note\'s references are refreshed in the notes mode: Update ' +
    'field and run on its facade; a header\'s too', async () => {
    const d = new Document(await noteDoc(H(1, 'Intro') +
      p(r('x') + mark(2)) + p(r('y') + mark(5)),
    {2: noteP('See'), 5: noteP('Other')}));
    const t = new Typing(d);
    const key = {note: {kind: 'footnote', id: 2}};
    let fn = facadeOf(d, key);
    const np = () => facadeOf(d, key).doc.sections[0].blocks[0];
    const atEnd = () => caret({id: np().id, off: np().text.length});
    const h = target(d.doc, 'heading', 'Intro');
    const n5 = list(d.doc, 'footnote').find((x) => x.note.id === 5);
    assert.ok(insertXref(fn, t, atEnd(), {type: 'heading',
      target: h.id, what: 'text'}, {now: NOW}));
    assert.ok(insertXref(facadeOf(d, key), t, atEnd(), {type:
      'footnote', target: n5.id, what: 'noteNumber'}, {now: NOW}));
    const noteText = () => plain(d.doc.notes.footnotes.get(2).blocks[0])
      .trim();
    assert.equal(noteText(), 'SeeIntro2');
    // the heading edited inside its bookmark, a footnote put in
    // before the second mark
    const q = paraOf(d.doc, 'Intro');
    d.apply({op: 'replaceText', block: findBlock(d.doc, q.id).at,
      at: q.text.indexOf('Intro') + 5, del: 0, ins: 'duction'});
    const y = paraOf(d.doc, 'y');
    assert.ok(insertNote(d, t, caret({id: y.id, off: 0}), 'footnote'));
    fn = facadeOf(d, key);
    const sel = select({id: np().id, off: 0}, {id: np().id,
      off: np().text.length});
    assert.ok(t.command(() => updateCmd(fn, sel, {now: NOW})));
    assert.equal(noteText(), 'SeeIntroduction3');
    // run on the facade: the same (nothing left to change)
    const res = t.command(() => run(facadeOf(d, key), {now: NOW},
      null));
    assert.ok(res.ok);
    assert.deepEqual(res.messages, []);
    assert.equal(noteText(), 'SeeIntroduction3');
    // a header's REF as before
    const hd = new Document(await readDocx(await withHeaders(
      H(1, 'Top') + p(r('body')), {default: p(r('See '))})));
    const ht = new Typing(hd);
    const fa = facadeOf(hd, 'word/header1.xml', 0);
    const hp = fa.doc.sections[0].blocks[0];
    assert.ok(insertXref(fa, ht, caret({id: hp.id,
      off: hp.text.length}), {type: 'heading', target:
      target(hd.doc, 'heading', 'Top').id, what: 'text'}, {now: NOW}));
    const tq = paraOf(hd.doc, 'Top');
    hd.apply({op: 'replaceText', block: findBlock(hd.doc, tq.id).at,
      at: tq.text.indexOf('Top') + 3, del: 0, ins: 'ic'});
    const fa2 = facadeOf(hd, 'word/header1.xml', 0);
    assert.ok(ht.command(() => updateCmd(fa2, caret({id: hp.id,
      off: 0}), {now: NOW})));
    assert.equal(plain(hd.doc.stories.get('word/header1.xml')
      .blocks[0]), 'See Topic');
    await lintAfter(d.doc, 'xref note refresh');
  });

  it('refused inside a field\'s code or result; nothing changed',
    async () => {
      const o = opened(await read(MAIN + p(r('x ') +
        fld(' DATE ', 'today'))));
      const h = target(o.d.doc, 'heading', 'Intro');
      const q = blocks(o.d).at(-1), s0 = snap(o.d.doc);
      for (const off of [3, 5, 9]) {
        const sel = caret({id: q.id, off});
        assert.match(xrefWhy(o.d, sel), /field/);
        assert.equal(insertXref(o.d, o.t, sel, {type: 'heading',
          target: h.id, what: 'text'}, o.ctx), null);
      }
      assert.equal(xrefWhy(o.d, caret({id: q.id, off: 2})), null);
      assert.ok(same(o.d.doc, s0));
      assert.ok(xrefWhy(o.d, null));
    });

  it('bad options and unknown targets refused', async () => {
    const o = opened(await read(MAIN));
    const s0 = snap(o.d.doc), sel = end(o.d.doc, 'See ');
    const h = target(o.d.doc, 'heading', 'Intro');
    for (const opts of [null, 7, {}, {type: 'heading'},
      {type: 'heading', target: 'p:nope', what: 'text'},
      {type: 'heading', target: h.id, what: 'noteNumber'},
      {type: 'bogus', target: h.id, what: 'text'},
      {type: 'bookmark', target: 'b:Nope', what: 'text'},
      {type: 'footnote', target: 'n:footnote:9', what: 'noteNumber'}]) {
      assert.equal(insertXref(o.d, o.t, sel, opts, o.ctx), null,
        JSON.stringify(opts));
    }
    assert.ok(same(o.d.doc, s0));
  });

  it('a number asked of a heading with none: refused, the reason ' +
    'given', async () => {
    const o = opened(await read(MAIN));
    const h = target(o.d.doc, 'heading', 'Methods');
    const report = {};
    assert.equal(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
      'heading', target: h.id, what: 'number'}, o.ctx, report), null);
    assert.equal(report.reason, 'value');
    assert.equal(bookmarks(o.d.doc).list.length, 1, 'rolled back');
  });
});

describe('insertXref: undo and hostile', () => {
  it('one undo step gives the document back', async () => {
    const o = opened(await read(MAIN));
    const s0 = snap(o.d.doc);
    const h = target(o.d.doc, 'heading', 'Intro');
    assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
      'heading', target: h.id, what: 'text'}, o.ctx));
    o.d.undo();
    assert.ok(same(o.d.doc, s0));
    o.d.redo();
    assert.equal(refs(o.d.doc)[0][1], 'Intro');
  });

  it('a reference inside the caption it points at (a cycle): ' +
    'refused, nothing changed', async () => {
    const o = opened(await read(CAP(r('Figure ') +
      fld(' SEQ Figure \\* ARABIC ', '1') + r(' cat'))));
    const t = target(o.d.doc, 'seq:Figure', 'Figure 1 cat');
    const s0 = snap(o.d.doc);
    for (const what of ['caption', 'captionText']) {
      assert.equal(insertXref(o.d, o.t, end(o.d.doc, 'Figure 1 cat'),
        {type: 'seq:Figure', target: t.id, what}, o.ctx), null, what);
    }
    assert.ok(same(o.d.doc, s0));
  });

  it('a bookmark holding a REF (depth bound): refused, the stored ' +
    'results kept, nothing followed', async () => {
    assert.equal(MAX_REF_DEPTH, 0);
    // Outer holds a REF to itself; A and B hold REFs to each other
    const o = opened(await read(p(S(1, 'Outer') + r('a ') +
      fld(' REF Outer ', 'a') + E(1)) +
      p(S(2, 'A') + r('x ') + fld(' REF B ', 'old b') + E(2)) +
      p(S(3, 'B') + r('y ') + fld(' REF A ', 'old a') + E(3)) +
      p(r('See '))));
    const t = target(o.d.doc, 'bookmark', 'a a');
    assert.ok(t);
    const s0 = snap(o.d.doc), report = {};
    assert.equal(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
      'bookmark', target: t.id, what: 'text'}, o.ctx, report), null);
    assert.deepEqual(report, {reason: 'value',
      why: 'bookmark holds a field'});
    assert.ok(same(o.d.doc, s0), 'nothing changed');
    const res = run(o.d, {now: NOW}, null);
    assert.equal(res.changed, false);
    assert.deepEqual(res.messages, [
      {instr: 'REF Outer', reason: 'bookmark holds a field'},
      {instr: 'REF B', reason: 'bookmark holds a field'},
      {instr: 'REF A', reason: 'bookmark holds a field'}]);
    assert.deepEqual(refs(o.d.doc).map((x) => x[1]), ['a', 'old b',
      'old a']);
  });

  it('Include above/below only with a page number', async () => {
    const o = opened(await read(MAIN));
    const h = target(o.d.doc, 'heading', 'Intro');
    for (const what of ['number', 'numberNoContext', 'text']) {
      const report = {};
      assert.equal(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
        'heading', target: h.id, what, above: true}, o.ctx, report),
      null, what);
      assert.equal(report.reason, 'what');
    }
    assert.ok(ABOVE_OK.has('page'));
    assert.equal(ABOVE_OK.size, 1);
  });

  it('many headings: the list right, the insert a handful of ops',
    async () => {
      let body = '';
      for (let k = 0; k < 2000; k++) body += H(1, 'H' + k);
      const o = opened(await read(body + p(r('See '))));
      const hs = list(o.d.doc, 'heading');
      assert.equal(hs.length, 2000);
      assert.deepEqual([hs[0].text, hs[1999].text], ['H0', 'H1999']);
      const ids = new Set(hs.map((x) => x.id));
      assert.equal(ids.size, 2000);
      let ops = 0;
      const apply = o.d.apply.bind(o.d);
      o.d.apply = (op, x) => {
        ops++;
        return apply(op, x);
      };
      assert.ok(insertXref(o.d, o.t, end(o.d.doc, 'See '), {type:
        'heading', target: hs[1999].id, what: 'text'}, {now: NOW}));
      assert.ok(ops <= 6, `${ops} ops`);
      assert.equal(refs(o.d.doc)[0][1], 'H1999');
      const name = REFNAME.exec(refs(o.d.doc)[0][0])[0];
      assert.equal(bookmarks(o.d.doc).find(name).para, hs[1999].para);
    });
});

describe('Table of Figures', () => {
  it('instrOf: \\c, \\a, no page numbers, not right aligned', () => {
    assert.equal(instrOf({seqId: 'Figure'}),
      'TOC \\h \\z \\c "Figure"');
    assert.equal(instrOf({seqId: 'Figure', includeLabel: false}),
      'TOC \\h \\z \\a "Figure"');
    assert.equal(instrOf({seqId: 'Table', hyperlinks: false}),
      'TOC \\c "Table"');
    assert.equal(instrOf({seqId: 'Figure', pageNumbers: false}),
      'TOC \\n \\h \\z \\c "Figure"');
    assert.equal(instrOf({seqId: 'Figure', rightAlign: false}),
      'TOC \\p " " \\h \\z \\c "Figure"');
  });

  it('patch: the figures values give the options; fill reads them ' +
    'back', async () => {
    const r1 = tocPatch({...tocFill(null, null), seqId: 'Figure',
      includeLabel: true});
    assert.equal(r1.opts.instr, 'TOC \\h \\z \\c "Figure"');
    assert.equal(r1.opts.seqId, 'Figure');
    const r2 = tocPatch({...tocFill(null, null), seqId: 'My_Plate',
      includeLabel: false, pageNumbers: false});
    assert.equal(r2.opts.instr, 'TOC \\n \\h \\z \\a "My_Plate"');
    const o = opened(await read(CAP(r('Figure ') +
      fld(' SEQ Figure \\* ARABIC ', '1') + r(' cat')) + p('')));
    const sel = caret({id: blocks(o.d).at(-1).id, off: 0});
    const res = insertToc(o.d, o.t, sel, r1.opts, o.ctx);
    assert.ok(res);
    const v = tocFill(o.d.doc, caret({id: res.field.begin.id,
      off: res.field.begin.off + 1}));
    assert.equal(v.editing, true);
    assert.equal(v.seqId, 'Figure');
    assert.equal(v.includeLabel, true);
    assert.equal(v.exact, true);
    const same1 = tocPatch(v, res.field);
    assert.equal(same1.opts.instr, null, 'nothing asked: code kept');
    const off = tocPatch({...v, includeLabel: false}, res.field);
    assert.equal(off.opts.instr, 'TOC \\h \\z \\a "Figure"');
    assert.deepEqual(entriesOf(o.d.doc, res.field).map((e) =>
      [e.text, e.page]), [['Figure 1 cat', '1']]);
  });
});
