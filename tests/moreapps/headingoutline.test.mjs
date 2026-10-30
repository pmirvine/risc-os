// HeadingOutline (Batch E3): the body's headings with level, text,
// list label and spanning bookmark, from Heading n styles and from
// outlineLvl (style and paragraph).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {of, levelOf} from '../../tools/moreapps/!Letters/HeadingOutline';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r}
  from './build-docx.mjs';

const style = (id, name, inner = '', based = '') => `<w:style ` +
  `w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (based ? `<w:basedOn w:val="${based}"/>` : '') +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(
  style('Normal', 'Normal') +
  style('Heading1', 'heading 1', OL(0), 'Normal') +
  style('Heading2', 'heading 2', OL(1), 'Normal') +
  style('Kopf2', 'heading 2', '', 'Normal') +
  style('Chapter', 'Chapter', OL(0), 'Normal') +
  style('SubChapter', 'SubChapter', '', 'Chapter') +
  style('Plain', 'Plain', OL(9), 'Heading1') +
  style('Titel3', 'Titel', '', 'Normal'));
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0">' +
  '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>' +
  '<w:lvlText w:val="%1."/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
const H = (id, text, extra = '', runs = '') => p(runs || r(text),
  `<w:pStyle w:val="${id}"/>${extra}`);
const S = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const E = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const TC = (inner) => '<w:tc><w:tcPr><w:tcW w:w="100" ' +
  `w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const TBL = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  `w:w="100"/></w:tblGrid><w:tr>${TC(inner)}</w:tr></w:tbl>`;
const read = async (body, parts = {}) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES,
  ...parts}));
const brief = (hs) => hs.map((h) => [h.level, h.text]);

describe('levels', () => {
  it('from Heading n styles, outlineLvl in style and paragraph; ' +
    'body text excluded', async () => {
    const d = await read(
      H('Heading1', 'One') + p(r('body')) + H('Heading2', 'Two') +
      H('Chapter', 'Chap') + H('SubChapter', 'Sub') +
      p(r('para ol'), OL(2)) + H('Plain', 'not') +
      H('Titel3', 'no'));
    assert.deepEqual(brief(of(d)), [[1, 'One'], [2, 'Two'],
      [1, 'Chap'], [1, 'Sub'], [3, 'para ol']]);
    const h = of(d)[0];
    assert.equal(h.style, 'Heading1');
    assert.equal(h.outlineLvl, null);
    assert.deepEqual(h.path, [0, 0]);
    assert.equal(h.para, d.sections[0].blocks[0].id);
    assert.equal(of(d)[4].outlineLvl, 2);
  });

  it('direct outlineLvl overrides the style; 9 is body text',
    async () => {
      const d = await read(H('Heading1', 'Down', OL(3)) +
        H('Heading1', 'Gone', OL(9)) + p(r('Up'), OL(0)));
      assert.deepEqual(brief(of(d)), [[4, 'Down'], [1, 'Up']]);
    });

  it('a localized style id whose name is heading 2, ids by case, ' +
    'no styles part', async () => {
    const d = await read(H('Kopf2', 'Zwei') + H('HEADING3', 'Three'));
    assert.deepEqual(brief(of(d)), [[2, 'Zwei'], [3, 'Three']]);
    assert.equal(levelOf(null, {type: 'p', pStyle: 'Heading4',
      pPr: {extra: []}}), 4);
    assert.equal(levelOf(null, {type: 'tbl'}), 0);
  });

  it('headings in table cells are included', async () => {
    const d = await read(H('Heading1', 'Top') +
      TBL(H('Heading2', 'Cell') + TBL(H('Heading3', 'Deep')) + p('')));
    const hs = of(d);
    assert.deepEqual(brief(hs), [[1, 'Top'], [2, 'Cell'],
      [3, 'Deep']]);
    assert.equal(hs[1].path.length, 5);
  });

  it('empty headings are skipped; text of tabs, breaks and marks',
    async () => {
      const d = await read(H('Heading1', '') + H('Heading1', '   ') +
        H('Heading1', '', '', S(1, 'bm') + E(1)) +
        H('Heading1', '', '', r('a') + '<w:r><w:tab/></w:r>' + r('b') +
          '<w:r><w:br/></w:r>' + r('c')));
      assert.deepEqual(brief(of(d)), [[1, 'a b c']]);
    });
});

describe('labels and bookmarks', () => {
  it('numbered headings give their list label', async () => {
    const d = await read(
      H('Heading1', 'One', '<w:numPr><w:numId w:val="1"/></w:numPr>') +
      H('Heading1', 'Two', '<w:numPr><w:numId w:val="1"/></w:numPr>') +
      H('Heading1', 'Plain'),
      {'word/numbering.xml': NUMBERING});
    assert.deepEqual(of(d).map((h) => h.label), ['1.', '2.', '']);
  });

  it('an existing bookmark spanning the heading is picked ' +
    '(_Toc preferred)', async () => {
    const d = await read(
      H('Heading1', '', '', S(1, 'mine') + S(2, '_Toc123') +
        r('Spanned') + E(2) + E(1)) +
      H('Heading1', '', '', S(3, 'first') + r('Both') + E(3) +
        S(4, 'second') + r('') + E(4)) +
      H('Heading1', '', '', S(5, 'partial') + r('Par') + E(5) +
        r('tial')) +
      H('Heading1', '', '', S(6, 'dup') + r('A') + E(6)) +
      H('Heading1', '', '', S(7, 'dup') + r('B') + E(7)) +
      H('Heading1', 'None'));
    assert.deepEqual(of(d).map((h) => h.bookmark), ['_Toc123',
      'first', null, 'dup', null, null]);
  });

  it('memoised per version, recomputed after an edit and undo',
    async () => {
      const d = new Document(await read(H('Heading1', 'One')));
      const a = of(d.doc);
      assert.equal(of(d.doc), a);
      d.apply({op: 'replaceText', block: [0, 0], at: 3, del: 0,
        ins: '!'});
      const b = of(d.doc);
      assert.equal(b[0].text, 'One!');
      d.undo();
      assert.equal(of(d.doc)[0].text, 'One');
    });
});

describe('hostile', () => {
  it('10,000 headings: linear (ratio; ceiling only under ' +
    'WORD_PERF=1)', async () => {
    const many = async (n) => {
      let body = '';
      for (let i = 0; i < n; i++) body += H('Heading1', 'h' + i);
      return read(body);
    };
    const best = (doc) => {
      let m = Infinity;
      for (let i = 0; i < 3; i++) {
        doc.sections = [...doc.sections];
        const t = performance.now();
        of(doc);
        m = Math.min(m, performance.now() - t);
      }
      return m;
    };
    const small = await many(1000), big = await many(10000);
    assert.equal(of(big).length, 10000);
    const a = best(small), b = best(big);
    console.log(`# heading outline: 1,000 ${a.toFixed(1)} ms, ` +
      `10,000 ${b.toFixed(1)} ms`);
    if (process.env.WORD_PERF) assert.ok(b < 2000, 'took ' + b);
    else assert.ok(b < Math.max(a, 5) * 30,
      'not linear: ' + (b / a).toFixed(1));
  });
});
