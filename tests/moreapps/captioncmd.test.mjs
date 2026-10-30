// Captions (Batch E3): Insert > Caption... as ./CaptionCmd
// insertCaption (a Caption paragraph 'Label ' + SEQ (+ STYLEREF n \s
// and a separator) + text, above or below the selected paragraph,
// table or picture, every SEQ of the document numbered again and the
// REFs to captions made again, one undo step) and ./CaptionPatch (the
// box's values, the labels list kept in the choices). Also REF over
// a caption's bookmark (./FieldRef: the text the SEQ shows).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {insertCaption, captionWhy, labelWhy, seqIdOf, codesOf,
  targetOf, labelsIn, LABELS, clip, TEXT_MAX}
  from '../../tools/moreapps/!Letters/CaptionCmd';
import {fill, patch, labelChoices, savedLabels, addLabel, KEY,
  MAX_SAVED, SEPARATORS, FORMATS}
  from '../../tools/moreapps/!Letters/CaptionPatch';
import {run} from '../../tools/moreapps/!Letters/FieldPasses';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {evaluate} from '../../tools/moreapps/!Letters/Fields';
import {REF} from '../../tools/moreapps/!Letters/FieldRef';
import {hasWords}
  from '../../tools/moreapps/!Letters/FieldStyleRef';
import {parse} from '../../tools/moreapps/!Letters/FieldParse';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {caret, select} from '../../tools/moreapps/!Letters/Selection';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {deepEqual, OBJ} from '../../tools/moreapps/!Letters/Model';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {styleIdByName} from '../../tools/moreapps/!Letters/TocBuild';
import {loadStyles} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r}
  from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {picDocx, drawingXml} from './pic-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const sty = (id, name, inner = '', based = '', def = '') =>
  `<w:style w:type="paragraph"${def} w:styleId="${id}"><w:name ` +
  `w:val="${name}"/>` + (based ? `<w:basedOn w:val="${based}"/>`
    : '') + `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const BASE = sty('Normal', 'Normal', '', '', ' w:default="1"') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal');
const lvl = (n, text) => `<w:lvl w:ilvl="${n}"><w:start w:val="1"/>` +
  `<w:numFmt w:val="decimal"/><w:lvlText w:val="${text}"/></w:lvl>`;
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0">' +
  lvl(0, '%1.') + lvl(1, '%1.%2') + '</w:abstractNum><w:num ' +
  'w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
const NUM = (l) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId ` +
  'w:val="1"/></w:numPr>';
const H = (n, t, extra = '') => p(r(t),
  `<w:pStyle w:val="Heading${n}"/>${extra}`);
const CAP = (inner) => p(inner, '<w:pStyle w:val="Caption"/>');
const read = async (body, styles = BASE) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body),
  'word/styles.xml': stylesXml(styles),
  'word/numbering.xml': NUMBERING}));
const open = (doc) => {
  const d = new Document(doc);
  return {d, t: new Typing(d)};
};
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
const at = (doc, text, off = 0) => caret({id: paraOf(doc, text).id,
  off});
/** The plain text of every paragraph (any depth), in order. */
function texts(doc) {
  const out = [];
  forEachBlock(doc, (b) => {
    if (b.type === 'p') out.push(plain(b));
    return true;
  });
  return out;
}
const instrs = (doc) => scan(doc).map((f) => f.instr.trim());
const snap = (doc) => ({sections: structuredClone(doc.sections),
  styles: doc.styles});
const same = (doc, s) => deepEqual(doc.sections, s.sections) &&
  doc.styles === s.styles;
const capStyle = (doc) => styleIdByName(doc, 'caption', 'paragraph');

describe('labels and codes', () => {
  it('Word\'s labels; the label checked; the codes', () => {
    assert.deepEqual(LABELS, ['Figure', 'Table', 'Equation']);
    assert.equal(labelWhy('Figure'), null);
    assert.equal(labelWhy('My Plate'), null);
    for (const bad of ['', '   ', 'a"b', 'x'.repeat(41), 'a\tb',
      'a\u0001', 'a\\b', 'a\ufffcb', null, 7, {}])
      assert.ok(labelWhy(bad), JSON.stringify(bad));
    assert.match(labelWhy('x'.repeat(41)), /40/);
    assert.equal(seqIdOf(' My  Plate '), 'My_Plate');
    assert.deepEqual(codesOf({label: 'Figure'}),
      {seq: 'SEQ Figure \\* ARABIC', chapter: null});
    assert.deepEqual(codesOf({label: 'Table', format: 'roman',
      chapter: {level: 2, separator: '.'}}),
    {seq: 'SEQ Table \\* roman \\s 2', chapter: 'STYLEREF 2 \\s'});
    assert.equal(codesOf({label: 'X', format: 'Hex'}).seq,
      'SEQ X \\* ARABIC');
  });
});

describe('insertCaption: numbers', () => {
  it('the first caption is 1, below the paragraph; one step; the ' +
    'Caption style added', async () => {
    const doc = await read(H(1, 'One') + p(r('Body')));
    const {d, t} = open(doc);
    assert.equal(capStyle(d.doc), null, 'not there before');
    const n0 = d.undoDepth;
    const res = insertCaption(d, t, at(d.doc, 'Body', 2),
      {label: 'Figure', text: ' A cat'});
    assert.ok(res);
    assert.equal(d.undoDepth, n0 + 1);
    assert.deepEqual(texts(d.doc), ['One', 'Body', 'Figure 1 A cat']);
    const cap = paraOf(d.doc, 'Figure 1 A cat');
    assert.equal(res.para.id, cap.id);
    const id = capStyle(d.doc);
    assert.ok(id, 'the caption style is there now');
    assert.equal(cap.pStyle, id);
    assert.deepEqual(instrs(d.doc), ['SEQ Figure \\* ARABIC']);
    assert.equal(res.sel.head.id, cap.id);
    assert.equal(res.sel.head.off, cap.text.length);
    await lintAfter(d.doc, 'caption');
  });

  it('a caption before others numbers them all again', async () => {
    const doc = await read(p(r('Top')) + p(r('Pic')) +
      CAP(r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '1') +
        r(' old one')) +
      CAP(r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '2') +
        r(' old two')), BASE + sty('Caption', 'caption'));
    const {d, t} = open(doc);
    assert.ok(insertCaption(d, t, at(d.doc, 'Top'),
      {label: 'Figure', text: ': new'}));
    assert.deepEqual(texts(d.doc), ['Top', 'Figure 1: new', 'Pic',
      'Figure 2 old one', 'Figure 3 old two']);
    assert.equal(paraOf(d.doc, 'Figure 1: new').pStyle, 'Caption');
  });

  it('Table and Figure count apart', async () => {
    const doc = await read(p(r('A')) +
      CAP(r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '1')) +
      CAP(r('Table ') + fld(' SEQ Table \\* ARABIC ', '1')));
    const {d, t} = open(doc);
    assert.ok(insertCaption(d, t, at(d.doc, 'A'), {label: 'Table'}));
    assert.deepEqual(texts(d.doc), ['A', 'Table 1', 'Figure 1',
      'Table 2']);
  });

  it('chapter numbers: STYLEREF 1 \\s, the separator, SEQ \\s 1',
    async () => {
      const doc = await read(H(1, 'One', NUM(0)) + p(r('a')) +
        p(r('b')) + H(1, 'Two', NUM(0)) + p(r('c')));
      const {d, t} = open(doc);
      const ch = {level: 1, separator: '-'};
      assert.ok(insertCaption(d, t, at(d.doc, 'c'),
        {label: 'Figure', chapter: ch, text: ' C'}));
      assert.ok(insertCaption(d, t, at(d.doc, 'b'),
        {label: 'Figure', chapter: ch, text: ' B'}));
      assert.ok(insertCaption(d, t, at(d.doc, 'a'),
        {label: 'Figure', chapter: {level: 1, separator: '\u2014'},
          text: ' A'}));
      assert.deepEqual(texts(d.doc), ['One', 'a', 'Figure 1\u20141 A',
        'b', 'Figure 1-2 B', 'Two', 'c', 'Figure 2-1 C']);
      assert.deepEqual(instrs(d.doc).slice(0, 2),
        ['STYLEREF 1 \\s', 'SEQ Figure \\* ARABIC \\s 1']);
      await lintAfter(d.doc, 'chapters');
    });

  it('a heading numbered with words ("Chapter 1"): refused with ' +
    'that reason, nothing written; 1-1 still fine', async () => {
      const chap = numberingXml('<w:abstractNum w:abstractNumId="0">' +
        lvl(0, 'Chapter %1') + '</w:abstractNum><w:num w:numId="1">' +
        '<w:abstractNumId w:val="0"/></w:num>');
      const doc = await readDocx(await buildDocx({
        'word/document.xml': documentXml(H(1, 'One', NUM(0)) +
          p(r('a'))),
        'word/styles.xml': stylesXml(BASE),
        'word/numbering.xml': chap}));
      const {d, t} = open(doc);
      const s0 = snap(d.doc), n0 = d.undoDepth, why = {};
      assert.equal(insertCaption(d, t, at(d.doc, 'a'), {label: 'Figure',
        chapter: {level: 1, separator: '-'}}, why), null);
      assert.equal(why.reason, 'words');
      assert.ok(same(d.doc, s0));
      assert.equal(d.undoDepth, n0);
      const ok = open(await read(H(1, 'One', NUM(0)) + p(r('a'))));
      const why2 = {};
      assert.ok(insertCaption(ok.d, ok.t, at(ok.d.doc, 'a'),
        {label: 'Figure', chapter: {level: 1, separator: '-'}}, why2));
      assert.equal(texts(ok.d.doc)[2], 'Figure 1-1');
      assert.equal(why2.reason, undefined);
    });

  it('hasWords: words, not numbers, roman or repeated letters', () => {
    for (const w of ['Chapter 1', 'Part IV', 'Annex-A', 'ab'])
      assert.equal(hasWords(w), true, w);
    for (const n of ['1', '1.2', 'A', 'AA', 'iv', 'XIV', '(a)', 'B.3',
      ''])
      assert.equal(hasWords(n), false, n);
  });

  it('chapter numbers with no numbered heading: refused, nothing ' +
    'changed', async () => {
    const doc = await read(H(1, 'One') + p(r('a')));
    const {d, t} = open(doc);
    const s0 = snap(d.doc), n0 = d.undoDepth;
    const why = {};
    assert.equal(insertCaption(d, t, at(d.doc, 'a'), {label: 'Figure',
      chapter: {level: 1, separator: '-'}}, why), null);
    assert.equal(why.reason, 'chapter');
    assert.ok(same(d.doc, s0));
    assert.equal(d.undoDepth, n0);
  });

  it('exclude label: the number and the text only; formats',
    async () => {
      const doc = await read(p(r('a')) + p(r('b')));
      const {d, t} = open(doc);
      assert.ok(insertCaption(d, t, at(d.doc, 'b'), {label: 'Figure',
        excludeLabel: true, text: ' only'}));
      assert.ok(insertCaption(d, t, at(d.doc, 'a'), {label: 'Plate',
        format: 'ROMAN', text: ''}));
      assert.deepEqual(texts(d.doc), ['a', 'Plate I', 'b', '1 only']);
      assert.ok(instrs(d.doc).includes('SEQ Plate \\* ROMAN'));
    });
});

describe('insertCaption: where it goes', () => {
  const TBL = tbl([tr([tc(p(r('c1'))), tc(p(r('c2')))])]);

  it('a table: above by default, outside it; below when asked',
    async () => {
      const doc = await read(p(r('before')) + TBL + p(r('after')));
      const {d, t} = open(doc);
      const k = at(d.doc, 'c2', 1);
      assert.equal(targetOf(d.doc, k).kind, 'table');
      assert.ok(insertCaption(d, t, k, {label: 'Table'}));
      assert.deepEqual(blocks(d).map((b) => b.type), ['p', 'p', 'tbl',
        'p']);
      assert.equal(plain(blocks(d)[1]), 'Table 1');
      assert.equal(blocks(d)[1].pPr.keepNext, true,
        'kept with the table');
      assert.ok(insertCaption(d, t, at(d.doc, 'c1'), {label: 'Table',
        position: 'below'}));
      assert.deepEqual(blocks(d).map((b) => b.type === 'tbl' ? 'T'
        : plain(b)), ['before', 'Table 1', 'T', 'Table 2', 'after']);
      await lintAfter(d.doc, 'table captions');
    });

  it('a picture paragraph: below by default, above when asked; in a ' +
    'cell, in that cell', async () => {
    const pic = (id) => p('<w:r>' + drawingXml({id, embed: 'rId11',
      decl: false}) + '</w:r>');
    const bytes = await picDocx({pics: [{}], body: p(r('text')) +
      tbl([tr([tc(pic(2) + p(r('under')))])]) + p(r('end')),
    parts: {'word/styles.xml': stylesXml(BASE)}});
    const doc = await readDocx(bytes);
    const {d, t} = open(doc);
    const top = blocks(d)[0];
    const k = select({id: top.id, off: 0}, {id: top.id, off: 1});
    assert.equal(targetOf(d.doc, k).kind, 'picture');
    assert.ok(insertCaption(d, t, k, {label: 'Figure', text: ' P'}));
    assert.equal(plain(blocks(d)[1]), 'Figure 1 P');
    // a caret in the picture's paragraph is the picture too
    assert.ok(insertCaption(d, t, caret({id: top.id, off: 0}),
      {label: 'Figure', position: 'above', text: ' Q'}));
    assert.equal(plain(blocks(d)[0]), 'Figure 1 Q');
    assert.equal(plain(blocks(d)[2]), 'Figure 2 P');
    // the picture in a cell: the caption in the cell, below it
    const cell = blocks(d).find((b) => b.type === 'tbl')
      .rows[0].cells[0];
    const cp = cell.blocks[0];
    assert.equal(targetOf(d.doc, caret({id: cp.id, off: 0})).kind,
      'picture');
    assert.ok(insertCaption(d, t, caret({id: cp.id, off: 0}),
      {label: 'Figure', text: ' in cell'}));
    const cell2 = blocks(d).find((b) => b.type === 'tbl')
      .rows[0].cells[0];
    assert.deepEqual(cell2.blocks.map(plain), ['', 'Figure 3 in cell',
      'under']);
    await lintAfter(d.doc, 'picture captions');
  });

  it('a plain paragraph: below, or above; a range: around it',
    async () => {
      const doc = await read(p(r('one')) + p(r('two')) + p(r('three')));
      const {d, t} = open(doc);
      assert.equal(targetOf(d.doc, at(d.doc, 'two')).kind, 'para');
      assert.ok(insertCaption(d, t, at(d.doc, 'two'), {label: 'Figure',
        position: 'above'}));
      assert.deepEqual(texts(d.doc), ['one', 'Figure 1', 'two',
        'three']);
      const a = paraOf(d.doc, 'two'), z = paraOf(d.doc, 'three');
      assert.ok(insertCaption(d, t, select({id: a.id, off: 1},
        {id: z.id, off: 2}), {label: 'Figure'}));
      assert.deepEqual(texts(d.doc), ['one', 'Figure 1', 'two',
        'three', 'Figure 2']);
    });

  it('a caret in an empty paragraph: the caption there', async () => {
    const doc = await read(p(r('one')) + p('') + p(r('two')));
    const {d, t} = open(doc);
    const e = blocks(d)[1], n = blocks(d).length;
    assert.equal(targetOf(d.doc, caret({id: e.id, off: 0})).kind,
      'empty');
    assert.ok(insertCaption(d, t, caret({id: e.id, off: 0}),
      {label: 'Equation', text: ' E'}));
    assert.equal(blocks(d).length, n);
    assert.equal(blocks(d)[1].id, e.id);
    assert.equal(plain(blocks(d)[1]), 'Equation 1 E');
    assert.equal(blocks(d)[1].pStyle, capStyle(d.doc));
  });

  it('caret in a cell\'s text: the table', async () => {
    const doc = await read(tbl([tr([tc(p(r('x')))])]) + p(r('after')));
    const {d, t} = open(doc);
    assert.ok(insertCaption(d, t, at(d.doc, 'x'), {label: 'Table'}));
    assert.equal(plain(blocks(d)[0]), 'Table 1');
    assert.equal(blocks(d)[1].type, 'tbl');
  });
});

describe('insertCaption: text, style, undo, refusals', () => {
  it('markup characters in the text are kept as text; controls go',
    async () => {
      const doc = await read(p(r('a')));
      const {d, t} = open(doc);
      const odd = ' <b>&amp; "x" \'y\'</b>';
      assert.ok(insertCaption(d, t, at(d.doc, 'a'), {label: 'Figure',
        text: odd + '\u0007\ufffc'}));
      assert.equal(texts(d.doc)[1], 'Figure 1' + odd);
      const {bytes} = await lintAfter(d.doc, 'markup');
      const back = await readDocx(bytes);
      assert.ok(paraOf(back, 'Figure 1' + odd), 'read back the same');
    });

  it('long text: cut on a character boundary; lone surrogates go',
    async () => {
      const doc = await read(p(r('a')) + p(r('b')));
      const {d, t} = open(doc);
      const long = 'x'.repeat(TEXT_MAX - 1) + '\u{1F600}';
      assert.equal(clip(long), 'x'.repeat(TEXT_MAX - 1));
      assert.equal(clip('a\ud800b\udc00c\u{1F600}'), 'abc\u{1F600}');
      assert.ok(insertCaption(d, t, at(d.doc, 'a'), {label: 'Figure',
        text: long}), 'not a silent null');
      assert.equal(texts(d.doc)[1], 'Figure 1' + 'x'.repeat(TEXT_MAX -
        1));
      assert.ok(insertCaption(d, t, at(d.doc, 'b'), {label: 'Figure',
        text: ' a\ud800b'}));
      assert.ok(texts(d.doc).includes('Figure 2 ab'));
      const bigger = patch({label: 'label:Figure', text: 'y'.repeat(
        TEXT_MAX)}).opts.text;
      assert.equal(bigger.length, TEXT_MAX);
      assert.equal(bigger[0], ' ');
      await lintAfter(d.doc, 'long');
    });

  it('an unexpected error is not taken for a refusal', async () => {
    const doc = await read(p(r('a')));
    const d = new Document(doc);
    const s0 = snap(d.doc);
    const typing = {command() { throw new TypeError('boom'); }};
    assert.throws(() => insertCaption(d, typing, at(d.doc, 'a'),
      {label: 'Figure'}), TypeError);
    const bad = {command: (fn) => {
      d.apply = () => { throw new TypeError('inside'); };
      return fn();
    }};
    assert.throws(() => insertCaption(d, bad, at(d.doc, 'a'),
      {label: 'Figure'}), /inside/);
    delete d.apply;
    assert.ok(same(d.doc, s0));
  });

  it('undo is one step: the document and styles as they were; redo',
    async () => {
      const doc = await read(p(r('a')) +
        CAP(r('Figure ') + fld(' SEQ Figure ', '1')));
      const {d, t} = open(doc);
      const s0 = snap(d.doc);
      assert.ok(insertCaption(d, t, at(d.doc, 'a'), {label: 'Figure'}));
      const after = texts(d.doc);
      assert.deepEqual(after, ['a', 'Figure 1', 'Figure 2']);
      d.undo();
      assert.ok(deepEqual(d.doc.sections, s0.sections));
      assert.equal(d.doc.styles, s0.styles);
      d.redo();
      assert.deepEqual(texts(d.doc), after);
    });

  it('a bad label: refused, nothing changed', async () => {
    const doc = await read(p(r('a')));
    const {d, t} = open(doc);
    const s0 = snap(d.doc), n0 = d.undoDepth;
    for (const label of ['', 'a"b', 'x'.repeat(41), 'a\nb', 'a\\b',
      undefined]) {
      assert.equal(insertCaption(d, t, at(d.doc, 'a'), {label}), null,
        String(label));
    }
    assert.equal(insertCaption(d, t, at(d.doc, 'a'), null), null);
    assert.ok(same(d.doc, s0));
    assert.equal(d.undoDepth, n0);
  });

  it('the caption style is found by name; added only when used',
    async () => {
      const own = BASE + sty('Beschriftung', 'caption', '', 'Normal');
      const doc = await read(p(r('a')), own);
      const {d, t} = open(doc);
      const st0 = d.doc.styles;
      assert.ok(insertCaption(d, t, at(d.doc, 'a'), {label: 'Figure'}));
      assert.equal(paraOf(d.doc, 'Figure 1').pStyle, 'Beschriftung');
      assert.equal(d.doc.styles, st0, 'no style added');
      assert.equal(d.doc.styles.styles.has('Caption'), false);
      // a document never captioned has no caption style written
      const plainDoc = await read(p(r('x')));
      const {bytes} = await lintAfter(plainDoc, 'none');
      const again = await readDocx(bytes);
      assert.equal(capStyle(again), null);
    });

  it('refused in a header, a note, a field\'s code or result',
    async () => {
      const doc = await read(p(r('x ') + fld(' DATE ', 'today')));
      const {d, t} = open(doc);
      const q = blocks(d)[0];
      for (const off of [3, 5, 9]) {
        assert.match(captionWhy(d, caret({id: q.id, off})), /field/);
        assert.equal(insertCaption(d, t, caret({id: q.id, off}),
          {label: 'Figure'}), null);
      }
      assert.equal(captionWhy(d, caret({id: q.id, off: 0})), null);
      const hd = new Document(await readDocx(await withHeaders(
        p(r('body')), {default: p(r('head'))})));
      const fa = facadeOf(hd, 'word/header1.xml', 0);
      const hp = fa.doc.sections[0].blocks[0];
      assert.match(captionWhy(fa, caret({id: hp.id, off: 0})),
        /header|footer|note/);
      assert.equal(insertCaption(fa, null, caret({id: hp.id, off: 0}),
        {label: 'Figure'}), null);
      const nd = new Document(await noteDoc(p(r('x') + mark(2)),
        {2: noteP('note')}));
      const fn = facadeOf(nd, {note: {kind: 'footnote', id: 2}});
      const np = fn.doc.sections[0].blocks[0];
      assert.ok(captionWhy(fn, caret({id: np.id, off: 1})));
      assert.equal(insertCaption(fn, null, caret({id: np.id, off: 1}),
        {label: 'Figure'}), null);
      assert.ok(captionWhy(d, null));
    });
});

describe('REF to a caption', () => {
  const S = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
    `w:name="${name}"/>`;
  const E = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
  const refOf = (doc, name) => scan(doc).find((f) =>
    new RegExp('^\\s*REF ' + name).test(f.instr));

  it('REF over a bookmark holding a SEQ shows its text', async () => {
    const doc = await read(CAP(S(1, '_Ref1') + r('Figure ') +
      fld(' SEQ Figure ', '4') + E(1) + r(' cat')) +
      p(fld(' REF _Ref1 \\h ', 'old')) +
      p(S(2, 'pg') + r('x ') + fld(' PAGE ', '1') + E(2)) +
      p(fld(' REF pg ', 'old')) +
      p(r('a ') + S(3, 'half') + r('Figure ') + '<w:r><w:fldChar ' +
        'w:fldCharType="begin"/></w:r>' + E(3) + '<w:r><w:instrText>' +
        ' SEQ Figure </w:instrText></w:r><w:r><w:fldChar ' +
        'w:fldCharType="separate"/></w:r>' + r('5') + '<w:r>' +
        '<w:fldChar w:fldCharType="end"/></w:r>') +
      p(fld(' REF half ', 'old')));
    const ctx = {doc};
    const ev = (name) => evaluate(ctx, refOf(doc, name));
    assert.equal(ev('_Ref1'), 'Figure 4');
    assert.equal(ev('pg'), null, 'a PAGE inside: kept');
    assert.equal(REF.why(ctx, refOf(doc, 'pg'),
      parse(refOf(doc, 'pg').instr)), 'bookmark holds a field');
    assert.equal(ev('half'), null, 'half a field inside: kept');
  });

  it('a caption put in before renumbers it and its REF in the same ' +
    'step', async () => {
    const doc = await read(p(r('top')) + CAP(S(1, '_Ref9') +
      r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '1') + E(1) +
      r(' cat')) + p(r('See ') + fld(' REF _Ref9 \\h ', 'Figure 1')) +
      p(fld(' REF plain ', 'kept')) + p(S(4, 'plain') + r('words') +
        E(4)), BASE + sty('Caption', 'caption'));
    const {d, t} = open(doc);
    const n0 = d.undoDepth;
    assert.ok(insertCaption(d, t, at(d.doc, 'top'),
      {label: 'Figure'}));
    assert.equal(d.undoDepth, n0 + 1);
    assert.deepEqual(texts(d.doc), ['top', 'Figure 1', 'Figure 2 cat',
      'See Figure 2', 'kept', 'words']);
  });

  it('Update all fields: chapter caption and its REF agree in one ' +
    'run', async () => {
    const doc = await read(H(1, 'One', NUM(0)) + H(1, 'Two', NUM(0)) +
      CAP(S(1, '_Ref2') + r('Figure ') + fld(' STYLEREF 1 \\s ', '1') +
        r('-') + fld(' SEQ Figure \\* ARABIC \\s 1 ', '1') + E(1)) +
      p(fld(' REF _Ref2 \\h ', 'Figure 1-1')),
    BASE + sty('Caption', 'caption'));
    const {d, t} = open(doc);
    const res = t.command(() => run(d, {now: NOW}, null));
    assert.ok(res.ok);
    assert.deepEqual(texts(d.doc).slice(2), ['Figure 2-1',
      'Figure 2-1']);
  });
});

describe('CaptionPatch', () => {
  it('the labels: Word\'s, the document\'s, the saved ones',
    async () => {
    const doc = await read(CAP(r('Diagram ') + fld(' SEQ Diagram ',
      '1')) + CAP(fld(' SEQ My_Plate ', '1')) + CAP(fld(' SEQ figure ',
      '1')));
    assert.deepEqual(labelsIn(doc), ['Diagram', 'My Plate', 'figure']);
    const ch = labelChoices(doc, ['Plate', 'Diagram']);
    assert.deepEqual(ch.map((c) => c.text), ['Figure', 'Table',
      'Equation', 'Diagram', 'My Plate', 'Plate']);
    assert.ok(ch.every((c) => c.id === 'label:' + c.text));
    assert.ok(ch.every((c) => typeof c.id === 'string'));
    assert.equal(new Set(ch.map((c) => c.id)).size, ch.length);
  });

  it('the saved list: cleaned, added to, bounded', () => {
    assert.equal(KEY, 'captionLabels');
    assert.deepEqual(savedLabels(undefined), []);
    assert.deepEqual(savedLabels('Plate'), []);
    assert.deepEqual(savedLabels(['Plate', 7, 'a"b', '', 'plate',
      'x'.repeat(41), {}, 'Map']), ['Plate', 'Map']);
    assert.deepEqual(addLabel(['Plate'], ' Map '), ['Plate', 'Map']);
    assert.deepEqual(addLabel(['Plate'], 'plate'), ['Plate']);
    assert.deepEqual(addLabel(['Plate'], 'Figure'), ['Plate']);
    assert.equal(addLabel(['Plate'], 'a"b'), null);
    const many = Array.from({length: MAX_SAVED}, (_, k) => 'L' + k);
    const more = addLabel(many, 'New');
    assert.equal(more.length, MAX_SAVED);
    assert.equal(more[more.length - 1], 'New');
    assert.equal(more[0], 'L1');
  });

  it('fill: Word\'s defaults by what is selected', async () => {
    const doc = await read(p(r('a')) + tbl([tr([tc(p(r('x')))])]) +
      p(r('b')));
    const v = fill(doc, at(doc, 'a'));
    assert.equal(v.label, 'label:Figure');
    assert.equal(v.position, 'below');
    assert.equal(v.exclude, false);
    assert.equal(v.format, 'ARABIC');
    assert.equal(v.chapter, false);
    assert.equal(v.level, 1);
    assert.equal(v.separator, 'hyphen');
    const w = fill(doc, at(doc, 'x'));
    assert.equal(w.label, 'label:Table');
    assert.equal(w.position, 'above');
    assert.ok(FORMATS.some((f) => f.id === 'ARABIC'));
    assert.ok(SEPARATORS.some((s) => s.id === 'emdash'));
  });

  it('patch: the options, the text joined, refusals', () => {
    const base = {label: 'label:Figure', position: 'below',
      exclude: false, format: 'ARABIC', chapter: false, level: 1,
      separator: 'hyphen', text: 'A cat'};
    assert.deepEqual(patch(base).opts, {label: 'Figure',
      position: 'below', excludeLabel: false, format: 'ARABIC',
      chapter: null, text: ' A cat'});
    assert.equal(patch({...base, text: ': A cat'}).opts.text,
      ': A cat');
    assert.equal(patch({...base, text: ''}).opts.text, '');
    assert.deepEqual(patch({...base, chapter: true, level: 2,
      separator: 'colon'}).opts.chapter, {level: 2, separator: ':'});
    assert.match(patch({...base, label: undefined}).error, /label/i);
    assert.match(patch({...base, label: 'label:a"b'}).error, /quote/);
    assert.ok(patch({...base, chapter: true, level: 12}).error);
    assert.equal(patch({...base, format: 'Hex'}).opts.format,
      'ARABIC');
  });
});

describe('cost', () => {
  it('2,000 captions: one more is linear', async () => {
    const many = Array.from({length: 2000}, (_, k) => CAP(r('Figure ') +
      fld(' SEQ Figure ', String(k + 1)))).join('');
    const doc = await read(p(r('top')) + many,
      BASE + sty('Caption', 'caption'));
    const {d, t} = open(doc);
    const t0 = Date.now();
    assert.ok(insertCaption(d, t, at(d.doc, 'top'), {label: 'Figure'}));
    const ms = Date.now() - t0;
    assert.equal(texts(d.doc)[2001], 'Figure 2001');
    assert.ok(ms < 5000, ms + ' ms');
  });
});
