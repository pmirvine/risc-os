// REF, NOTEREF and STYLEREF (Batch E3): the text or list number of a
// bookmark, the number of a note mark in one, the nearest paragraph
// in a style (body, and per page in a header or footer); what makes
// each keep its stored result; the Fields entries; hostile input.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {evaluate, REGISTRY}
  from '../../tools/moreapps/!Letters/Fields';
import {MAX_REF_DEPTH, REF, NOTEREF}
  from '../../tools/moreapps/!Letters/FieldRef';
import {STYLEREF} from '../../tools/moreapps/!Letters/FieldStyleRef';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r,
  REL} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';

const style = (id, name, inner = '', based = '') =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val=` +
  `"${name}"/>${based ? `<w:basedOn w:val="${based}"/>` : ''}` +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const STYLES = stylesXml(style('Normal', 'Normal')
  .replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"') +
  style('Heading1', 'heading 1', '<w:outlineLvl w:val="0"/>', 'Normal') +
  style('Heading2', 'heading 2', '<w:outlineLvl w:val="1"/>', 'Normal') +
  style('Kapitel', 'heading 1', '', 'Normal') +
  style('Sub', 'Sub', '', 'Heading1') +
  style('Product', 'Product Head,ph', '', 'Normal') +
  style('berschrift3', 'berschrift 3', '', 'Normal'));
const lvl = (n, fmt, text) => `<w:lvl w:ilvl="${n}"><w:start w:val=` +
  `"1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/></w:lvl>`;
const NUMBERING = numberingXml(
  '<w:abstractNum w:abstractNumId="0">' + lvl(0, 'decimal', '%1.') +
  lvl(1, 'decimal', '%1.%2') + lvl(2, 'decimal', '%1.%2.%3') +
  '</w:abstractNum><w:abstractNum w:abstractNumId="1">' +
  lvl(0, 'decimal', '%1.') + lvl(1, 'lowerLetter', '(%2)') +
  lvl(2, 'lowerRoman', '(%3)') + '</w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');
const num = (id, l) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId ` +
  `w:val="${id}"/></w:numPr>`;
const S = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const E = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const H = (n, t, extra = '') => p(r(t),
  `<w:pStyle w:val="Heading${n}"/>${extra}`);
const NS = 'xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main"';
const note = (tag, id, text) => `<w:${tag} w:id="${id}"><w:p><w:r>` +
  `<w:${tag}Ref/></w:r>${r(text)}</w:p></w:${tag}>`;
const notes = (kind, inner) => ({[`word/${kind}s.xml`]: `<w:${kind}s ` +
  `${NS}>${inner}</w:${kind}s>`});
const rel = (kind) => [`rId${kind}`, REL(kind + 's'), kind + 's.xml'];

const read = async (body, parts = {}, docRels = []) => readDocx(
  await buildDocx({'word/document.xml': documentXml(body),
    'word/styles.xml': STYLES, 'word/numbering.xml': NUMBERING,
    ...parts}, {docRels}));
/** The text each field named `name` of the body shows. */
const shown = (doc, name, ctx = {}) => scan(doc)
  .filter((f) => new RegExp('^\\s*' + name, 'i').test(f.instr))
  .map((f) => evaluate({doc, ...ctx}, f));
const ref = (code, res = 'old') => p(fld(code, res));

describe('REF: the text of a bookmark', () => {
  it('plain text, case-insensitive name, hidden _Ref name', async () => {
    const d = await read(
      p(r('a ') + S(1, 'Mark') + r('some text') + E(1) + r(' z')) +
      p(S(2, '_Ref123') + r('hid') + E(2)) +
      ref(' REF mark \\h ') + ref(' REF MARK ') + ref(' REF _ref123 ') +
      ref(' REF nothere '));
    assert.deepEqual(shown(d, 'REF'), ['some text', 'some text', 'hid',
      null]);
  });

  it('spans paragraphs (joined by a paragraph break) and keeps tabs ' +
    'and line breaks', async () => {
    const d = await read(
      p(r('one ') + S(1, 'b') + r('two')) +
      p('<w:r><w:t>three</w:t><w:tab/><w:t>x</w:t><w:br/>' +
        '<w:t>y</w:t></w:r>' + E(1)) + ref(' REF b '));
    assert.deepEqual(shown(d, 'REF'), ['two\rthree\tx\ny']);
  });

  it('a caret bookmark, and one taking in the paragraph mark, keep ' +
    'the stored result', async () => {
    const d = await read(p(S(1, 'c') + E(1) + r('x')) +
      p(S(2, 'm') + r('whole')) + p(E(2) + r('next')) +
      ref(' REF c ') + ref(' REF m '));
    assert.deepEqual(shown(d, 'REF'), [null, null]);
  });

  it('a bookmark in a header and one in a note', async () => {
    const d = await read(p(r('x') + '<w:r><w:footnoteReference ' +
      'w:id="1"/></w:r>') + ref(' REF fn ') + ref(' REF hd '),
    notes('footnote', note('footnote', 1, 'ignore') +
      `<w:footnote w:id="2"><w:p>${S(5, 'fn')}${r('in note')}` +
      `${E(5)}</w:p></w:footnote>`), [rel('footnote')]);
    assert.deepEqual(shown(d, 'REF'), ['in note', null]);
  });

  it('\\* formats go through FieldFormat', async () => {
    const d = await read(p(S(1, 'b') + r('hello wORLD') + E(1)) +
      ref(' REF b \\* Upper ') + ref(' REF b \\* Lower ') +
      ref(' REF b \\* FirstCap ') + ref(' REF b \\* Caps ') +
      ref(' REF b \\* MERGEFORMAT ') + ref(' REF b \\* CHARFORMAT ') +
      ref(' REF b \\* Hex '));
    assert.deepEqual(shown(d, 'REF'), ['HELLO WORLD', 'hello world',
      'Hello wORLD', 'Hello WORLD', 'hello wORLD', 'hello wORLD',
      null]);
  });

  it('\\f \\d \\t are read and the text is the same', async () => {
    const d = await read(p(S(1, 'b') + r('t') + E(1)) +
      ref(' REF b \\f ') + ref(' REF b \\d "." ') + ref(' REF b \\t '));
    assert.deepEqual(shown(d, 'REF'), ['t', 't', 't']);
  });

  it('keeps the stored result: picture, field, note mark, table, ' +
    'unknown switch, two names, no name, mixed number switches',
  async () => {
    const d = await read(
      p(S(1, 'pic') + '<w:r><w:drawing/></w:r>' + E(1)) +
      p(S(2, 'fl') + fld(' PAGE ', '1') + E(2)) +
      p(S(3, 'nm') + r('a') + '<w:r><w:footnoteReference w:id="1"/>' +
        '</w:r>' + E(3)) +
      p(S(4, 'ok') + r('fine') + E(4)) +
      ref(' REF pic ') + ref(' REF fl ') + ref(' REF nm ') +
      ref(' REF ok \\x ') + ref(' REF ok other ') + ref(' REF ') +
      ref(' REF ok \\n \\w ') + ref(' REF ok \\@ "x" '));
    assert.deepEqual(shown(d, 'REF'), Array(8).fill(null));
  });

  it('a REF inside its own bookmark (a cycle) keeps its result',
    async () => {
      const d = await read(p(S(1, 'cyc') + r('see ') +
        fld(' REF cyc ', 'old') + E(1)));
      assert.deepEqual(shown(d, 'REF'), [null]);
      assert.equal(MAX_REF_DEPTH, 0);
    });

  it('a locked field keeps its result', async () => {
    const d = await read(p(S(1, 'b') + r('t') + E(1)) +
      p(fld(' REF b ', 'old', {lock: true})));
    assert.deepEqual(shown(d, 'REF'), [null]);
  });

  it('the first of a duplicated name wins', async () => {
    const d = await read(p(S(1, 'dup') + r('first') + E(1)) +
      p(S(2, 'dup') + r('second') + E(2)) + ref(' REF dup '));
    assert.deepEqual(shown(d, 'REF'), ['first']);
  });
});

describe('REF \\n \\r \\w: the list number', () => {
  const body = (extra = '') =>
    p(r('A'), num(1, 0)) + p(r('B'), num(1, 1)) +
    p(S(1, 'c') + r('C') + E(1), num(1, 2)) +
    p(r('D') + extra, num(1, 2)) +
    p(S(2, 'e') + r('E') + E(2), num(1, 0)) +
    p(r('P'), num(2, 0)) + p(S(3, 'q') + r('Q') + E(3), num(2, 1)) +
    p(S(4, 'ri') + r('R') + E(4), num(2, 2)) +
    p(r('S') + '{S}', num(2, 2)) + p(r('plain') + '{T}') +
    p(S(5, 'plainbm') + r('x') + E(5));

  it('a legal label shows all its levels in every mode', async () => {
    const d = await read(body() + ref(' REF c \\n ') +
      ref(' REF c \\w ') + ref(' REF c \\r ') + ref(' REF e \\n ') +
      ref(' REF e \\w \\h '));
    assert.deepEqual(shown(d, 'REF'), ['1.1.1', '1.1.1', '1.1.1', '2',
      '2']);
  });

  it('(a) (i) labels: \\n alone, \\w with context, \\r relative',
    async () => {
      const inS = fld(' REF ri \\r ', 'old');
      const d = await read(body().replace('{S}', inS)
        .replace('{T}', fld(' REF ri \\r ', 'old')) +
        ref(' REF ri \\n ') + ref(' REF ri \\w ') +
        ref(' REF q \\w ') + ref(' REF q \\n '));
      assert.deepEqual(shown(d, 'REF'), ['(i)', null, '(i)', null,
        null, '(a)']);
    });

  it('ancestors that would need joining in front give null: ' +
    '%1. %2. %3. and Chapter %1 / %1-%2; \\d with a number', async () => {
    const lv = (n, fmt, t) => lvl(n, fmt, t);
    const nb = numberingXml(
      '<w:abstractNum w:abstractNumId="0">' +
      lv(0, 'decimal', '%1.') + lv(1, 'lowerLetter', '%2.') +
      lv(2, 'lowerRoman', '%3.') + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1">' +
      lv(0, 'decimal', 'Chapter %1') + lv(1, 'decimal', '%1-%2') +
      '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>' +
      '</w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');
    const d = await read(
      p(r('a'), num(1, 0)) + p(r('b'), num(1, 1)) +
      p(S(1, 'c') + r('c') + E(1), num(1, 2)) +
      p(r('ch1'), num(2, 0)) + p(S(2, 'ch2') + r('x') + E(2), num(2, 1)) +
      p(S(3, 'top') + r('t') + E(3), num(1, 0)) +
      ref(' REF c \\w ') + ref(' REF c \\r ') + ref(' REF c \\n ') +
      ref(' REF ch2 \\w ') + ref(' REF ch2 \\n ') +
      ref(' REF top \\w ') + ref(' REF top \\n \\d "-" '),
    {'word/numbering.xml': nb});
    assert.deepEqual(shown(d, 'REF'), [null, null, 'i', null, '1-1',
      '2', null]);
  });

  it('\\r leaves out the context the field\'s own paragraph shares',
    async () => {
      const d = await read(body().replace('{S}',
        fld(' REF ri \\r ', 'old') + fld(' REF q \\r ', 'old') +
        fld(' REF c \\r ', 'old')));
      assert.deepEqual(shown(d, 'REF'), ['(i)', '(a)', '1.1.1']);
    });

  it('a paragraph with no number, \\t, \\p with a number, a bookmark ' +
    'in a header: kept', async () => {
    const d = await read(body() + ref(' REF plainbm \\n ') +
      ref(' REF c \\n \\t ') + ref(' REF c \\n \\p '));
    assert.deepEqual(shown(d, 'REF'), [null, null, null]);
  });

  it('follows the numbers as they are now (new paragraph before)',
    async () => {
      const a = await read(body() + ref(' REF e \\n '));
      const b = await read(p(r('new'), num(1, 0)) + body() +
        ref(' REF e \\n '));
      assert.deepEqual([shown(a, 'REF'), shown(b, 'REF')],
        [['2'], ['3']]);
    });
});

describe('REF \\p: above and below', () => {
  it('before the field is above, after it below, same paragraph by ' +
    'offset', async () => {
    const d = await read(
      p(S(1, 'up') + r('u') + E(1)) + ref(' REF up \\p ') +
      p(r('x ') + fld(' REF same \\p ', 'old') + r(' y') +
        S(2, 'same') + r('s') + E(2)) +
      p(S(3, 'before') + r('b') + E(3) + fld(' REF before \\p ', 'o')) +
      p(fld(' REF down \\p ', 'old')) + p(S(4, 'down') + r('d') + E(4)) +
      ref(' REF up \\p \\* Upper '));
    assert.deepEqual(shown(d, 'REF'), ['above', 'below', 'above',
      'below', 'ABOVE']);
  });
});

describe('NOTEREF', () => {
  const FN = notes('footnote', note('footnote', 1, 'one') +
    note('footnote', 2, 'two'));
  const both = {...FN, ...notes('endnote', note('endnote', 1, 'e'))};
  const rels = [rel('footnote'), rel('endnote')];
  const mark = (kind, id) => `<w:r><w:${kind}Reference w:id="${id}"/>` +
    '</w:r>';

  it('the number of a footnote and of an endnote mark', async () => {
    const d = await read(
      p(r('a') + S(1, 'f1') + mark('footnote', 1) + E(1)) +
      p(r('b') + S(2, 'f2') + mark('footnote', 2) + E(2) +
        S(3, 'e1') + mark('endnote', 1) + E(3)) +
      ref(' NOTEREF f1 \\h ') + ref(' NOTEREF f2 \\f \\h ') +
      ref(' NOTEREF e1 ') + ref(' NOTEREF F2 \\* roman '),
    both, rels);
    assert.deepEqual(shown(d, 'NOTEREF'), ['1', '2', '1', 'ii']);
  });

  it('the number follows an earlier note inserted', async () => {
    const mk = (extra) => read(extra +
      p(r('a') + S(1, 'f1') + mark('footnote', 1) + E(1)) +
      ref(' NOTEREF f1 '), FN, [rel('footnote')]);
    const a = await mk(''), b = await mk(p(mark('footnote', 2)));
    assert.deepEqual([shown(a, 'NOTEREF'), shown(b, 'NOTEREF')],
      [['1'], ['2']]);
  });

  it('a custom mark shows its text', async () => {
    const d = await read(p(S(1, 'f1') + '<w:r><w:footnoteReference ' +
      'w:customMarkFollows="1" w:id="1"/><w:t>*</w:t></w:r>' + E(1)) +
      ref(' NOTEREF f1 '), FN, [rel('footnote')]);
    assert.deepEqual(shown(d, 'NOTEREF'), ['*']);
  });

  it('\\p gives above or below', async () => {
    const d = await read(
      p(S(1, 'f1') + mark('footnote', 1) + E(1)) +
      ref(' NOTEREF f1 \\p ') + ref(' NOTEREF f1 \\p \\h '),
    FN, [rel('footnote')]);
    assert.deepEqual(shown(d, 'NOTEREF'), ['above', 'above']);
  });

  it('no mark in it, no bookmark, a missing note, a bad switch: ' +
    'kept', async () => {
    const d = await read(
      p(S(1, 'plain') + r('x') + E(1)) +
      p(S(2, 'orphan') + mark('footnote', 9) + E(2)) +
      p(S(3, 'f1') + mark('footnote', 1) + E(3)) +
      ref(' NOTEREF plain ') + ref(' NOTEREF nothere ') +
      ref(' NOTEREF orphan ') + ref(' NOTEREF f1 \\n ') +
      ref(' NOTEREF '), FN, [rel('footnote')]);
    assert.deepEqual(shown(d, 'NOTEREF'), [null, null, null, null,
      null]);
  });

  it('a bookmark in a note is kept', async () => {
    const d = await read(p(r('x') + mark('footnote', 1)) +
      ref(' NOTEREF fn '),
    notes('footnote', `<w:footnote w:id="1"><w:p>${S(5, 'fn')}` +
      `${mark('footnote', 2)}${E(5)}</w:p></w:footnote>`),
    [rel('footnote')]);
    assert.deepEqual(shown(d, 'NOTEREF'), [null]);
  });
});

describe('STYLEREF in the body', () => {
  const body = H(1, 'First') + p(r('b1')) + H(2, 'Sub A') +
    p(r('x ') + fld(' STYLEREF "Heading 1" ', 'old')) +
    H(1, 'Second') + p(fld(' STYLEREF 1 ', 'old') + r(' in text')) +
    p(fld(' STYLEREF 2 ', 'old'));

  it('the nearest before, by quoted name, number', async () => {
    const d = await read(body + ref(' STYLEREF Heading1 ') +
      ref(' STYLEREF "heading 1" \\* Upper '));
    assert.deepEqual(shown(d, 'STYLEREF'), ['First', 'Second', 'Sub A',
      'Second', 'SECOND']);
  });

  it('a field before every match takes the nearest after; one in ' +
    'its own matching paragraph (a cycle), or with no match, is kept', async () => {
    const d = await read(
      p(fld(' STYLEREF "Heading 1" ', 'o')) + H(1, 'Later') +
      p(fld(' STYLEREF 1 ', 'old') + r('Own'),
        '<w:pStyle w:val="Heading1"/>') +
      ref(' STYLEREF 3 ') + ref(' STYLEREF Nothing '));
    assert.deepEqual(shown(d, 'STYLEREF'), ['Later', null, null,
      null]);
  });

  it('a localized id whose name is heading 1, a name with an alias, ' +
    'an id derived from a translated name', async () => {
    const d = await read(
      p(r('Kap'), '<w:pStyle w:val="Kapitel"/>') +
      p(r('Prod'), '<w:pStyle w:val="Product"/>') +
      p(r('Drei'), '<w:pStyle w:val="berschrift3"/>') +
      ref(' STYLEREF "Heading 1" ') + ref(' STYLEREF "Product Head,ph" ') +
      ref(' STYLEREF Product ') + ref(' STYLEREF "Überschrift 3" '));
    assert.deepEqual(shown(d, 'STYLEREF'), ['Kap', 'Prod', 'Prod',
      'Drei']);
  });

  it('a style based on it does not match; the default style does',
    async () => {
      const d = await read(H(1, 'Real') +
        p(r('subtle'), '<w:pStyle w:val="Sub"/>') + p(r('body text')) +
        p(fld(' STYLEREF Normal ', 'old'),
          '<w:pStyle w:val="Heading2"/>') +
        p(fld(' STYLEREF Heading1 ', 'old'),
          '<w:pStyle w:val="Heading2"/>') +
        p(fld(' STYLEREF Sub ', 'old'), '<w:pStyle w:val="Heading2"/>'));
      assert.deepEqual(shown(d, 'STYLEREF'), ['body text', 'Real',
        'subtle']);
    });

  it('a paragraph with no text is skipped; a tab or line break in ' +
    'the match keeps the stored result', async () => {
    const d = await read(H(1, 'Has') + p('', '<w:pStyle ' +
      'w:val="Heading1"/>') + p('<w:r><w:t>a</w:t><w:tab/><w:t>b' +
      '</w:t><w:br/><w:t>c</w:t></w:r>', '<w:pStyle w:val=' +
      '"Heading2"/>') + ref(' STYLEREF 1 ') + ref(' STYLEREF 2 '));
    assert.deepEqual(shown(d, 'STYLEREF'), ['Has', null]);
  });

  it('\\n \\r \\w \\s give the list number; \\p above or below',
    async () => {
      const n = (t) => H(1, t, num(1, 0));
      const d = await read(n('One') + p(r('x')) +
        H(2, 'Two', num(1, 1)) + n('Three') + p(r('plain')) +
        ref(' STYLEREF 1 \\s ') + ref(' STYLEREF 2 \\n ') +
        ref(' STYLEREF 2 \\w ') + ref(' STYLEREF 1 \\r ') +
        ref(' STYLEREF 1 \\p ') + ref(' STYLEREF 1 \\n \\p ') +
        ref(' STYLEREF 1 \\n \\t ') + ref(' STYLEREF 3 \\n ') +
        H(1, 'No number') + ref(' STYLEREF 1 \\n '));
      assert.deepEqual(shown(d, 'STYLEREF'), ['2', '1.1', '1.1', '2',
        'above', null, null, null, null]);
    });

  it('numbers: ancestors to join in front give null, legal labels ' +
    'and \\n still evaluate', async () => {
    const nb = numberingXml('<w:abstractNum w:abstractNumId="0">' +
      lvl(0, 'decimal', '%1.') + lvl(1, 'lowerLetter', '%2.') +
      '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>' +
      '</w:num>');
    const d = await read(H(1, 'Top', num(1, 0)) +
      H(2, 'Sub', num(1, 1)) + ref(' STYLEREF 2 \\w ') +
      ref(' STYLEREF 2 \\r ') + ref(' STYLEREF 2 \\n ') +
      ref(' STYLEREF 2 \\s ') + ref(' STYLEREF 1 \\w '),
    {'word/numbering.xml': nb});
    assert.deepEqual(shown(d, 'STYLEREF'), [null, null, 'a', 'a',
      '1']);
  });

  it('unknown switch, no argument, two arguments: kept', async () => {
    const d = await read(H(1, 'H') + ref(' STYLEREF 1 \\x ') +
      ref(' STYLEREF ') + ref(' STYLEREF 1 2 ') +
      ref(' STYLEREF 1 \\# "0" '));
    assert.deepEqual(shown(d, 'STYLEREF'), [null, null, null, null]);
  });

  it('is a page-dependent entry', () => {
    assert.equal(REGISTRY.get('STYLEREF').pageDependent, true);
    assert.equal(REGISTRY.get('REF').pageDependent, false);
    assert.equal(REGISTRY.get('NOTEREF').pageDependent, false);
  });
});

describe('STYLEREF in a header or footer: per page', () => {
  const FTR = p(fld(' STYLEREF "Heading 1" ', 'old')) +
    p(fld(' STYLEREF "Heading 1" \\l ', 'old'));
  const BODY = H(1, 'Alpha') + p(r('a')) + H(1, 'Beta') + p(r('b')) +
    p(r('c')) + p(r('d')) + H(1, 'Gamma') + p(r('e'));
  const ids = (doc) => doc.sections[0].blocks.map((b) => b.id);
  /** [first, last] value on the page spanning blocks i..j. */
  const on = (doc, i, j) => {
    const b = ids(doc), st = [...doc.stories.keys()][0];
    const ctx = {doc, page: {num: 1, s: 0, span: {first: b[i],
      last: b[j]}}};
    return scan(doc, st).map((f) => evaluate(ctx, f));
  };
  const make = () => docWithFields(BODY, {default: {ftr: FTR}});

  it('the first match on the page, the last with \\l', async () => {
    const d = await make();
    assert.deepEqual(on(d, 0, 4), ['Alpha', 'Beta']);
    assert.deepEqual(on(d, 2, 7), ['Beta', 'Gamma']);
  });

  it('none on the page: the nearest before, then the nearest after',
    async () => {
      const d = await make();
      assert.deepEqual(on(d, 3, 5), ['Beta', 'Beta']);
      assert.deepEqual(on(d, 7, 7), ['Gamma', 'Gamma']);
      const e = await docWithFields(p(r('x')) + BODY,
        {default: {ftr: FTR}});
      assert.deepEqual(on(e, 0, 0), ['Alpha', 'Alpha']);
    });

  it('needs ctx.page.span: null without a page, without a span, ' +
    'with ids that are not in the body', async () => {
    const d = await make(), st = [...d.stories.keys()][0];
    const [f] = scan(d, st);
    assert.equal(evaluate({doc: d}, f), null);
    assert.equal(evaluate({doc: d, page: {num: 1, s: 0}}, f), null);
    assert.equal(evaluate({doc: d, page: {num: 1, s: 0,
      span: {first: -5, last: -4}}}, f), null);
    assert.equal(evaluate({doc: d, page: {num: 1, s: 0,
      span: {first: ids(d)[3], last: ids(d)[1]}}}, f), null);
  });

  it('the number and \\p are for the body (\\n is the number of the ' +
    'match on the page)', async () => {
    const n = (t) => H(1, t, num(1, 0));
    const d = await docWithFields(n('A') + p(r('x')) + n('B'),
      {default: {ftr: p(fld(' STYLEREF 1 \\n ', 'o')) +
        p(fld(' STYLEREF 1 \\p ', 'o'))}},
      {parts: {'word/numbering.xml': NUMBERING}});
    const b = ids(d), st = [...d.stories.keys()][0];
    const ctx = {doc: d, page: {num: 2, s: 0, span: {first: b[1],
      last: b[2]}}};
    assert.deepEqual(scan(d, st).map((f) => evaluate(ctx, f)),
      ['2', null]);
  });
});

describe('hostile', () => {
  it('names like __proto__ and constructor are just names',
    async () => {
      const d = await read(p(S(1, '__proto__') + r('p') + E(1)) +
        ref(' REF __proto__ ') + ref(' REF constructor ') +
        ref(' NOTEREF __proto__ ') + ref(' STYLEREF __proto__ ') +
        ref(' STYLEREF constructor '));
      assert.deepEqual([shown(d, 'REF'), shown(d, 'NOTEREF'),
        shown(d, 'STYLEREF')], [['p', null], [null], [null, null]]);
    });

  it('a huge instruction and odd evaluator input give null',
    async () => {
      const d = await read(p(S(1, 'b') + r('t') + E(1)) +
        ref(' REF b ' + '\\h '.repeat(20000)) + ref(' REF b "unclosed'));
      assert.deepEqual(shown(d, 'REF'), [null, null]);
      const f = scan(d)[0];
      for (const m of [REF, NOTEREF, STYLEREF]) {
        assert.equal(m.eval({doc: null}, f, {args: [], switches: []}),
          null);
        assert.equal(m.eval({}, f, {args: ['x'], switches: []}), null);
      }
    });

  it('10,000 REF fields cost linear time', async () => {
    const make = async (n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += fld(' REF b \\h ', 'x');
      return read(p(S(1, 'b') + r('t') + E(1)) + p(s));
    };
    const time = (d) => {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        const out = shown(d, 'REF');
        best = Math.min(best, performance.now() - t0);
        assert.ok(out.every((v) => v === 't'));
      }
      return best;
    };
    const small = time(await make(2500)), big = time(await make(10000));
    assert.ok(big < Math.max(small, 5) * 12, `${small} -> ${big}`);
    assert.ok(big < 2000, String(big));
  });
});
