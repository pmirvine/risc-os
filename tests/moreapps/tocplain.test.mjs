// Table of contents entries drawn plain by the field (as real Word
// draws them, checked by a PDF Word made, 2026-11): a link to a _Toc
// bookmark in a paragraph inside a TOC field's result is drawn in the
// format there, whatever the paragraph's style (an entry restyled
// Normal too); a _Toc link outside any table of contents, in a Normal
// paragraph, is drawn as a link. The style rule (TOC n, Table of
// Figures) still holds alone. One set of paragraph ids per document
// (./TocParas), so the screen, print and PDF (./LineTokens feeds all)
// agree, and a big document pays once per layout.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {tokens} from '../../tools/moreapps/!Letters/LineTokens';
import {tocParas} from '../../tools/moreapps/!Letters/TocParas';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {begin, instr, sep, end} from './field-fixtures.mjs';

before(loadStyles);
const STYLES = stylesXml('<w:style w:type="paragraph" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOC1"><w:name ' +
  'w:val="toc 1"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name ' +
  'w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/>' +
  '<w:u w:val="single"/></w:rPr></w:style>');
const HR = (t) => r(t, '<w:rStyle w:val="Hyperlink"/>');
const lk = (a, t) => `<w:hyperlink w:anchor="${a}">` + HR(t) +
  '</w:hyperlink>';
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES}));
const TOC1 = '<w:pStyle w:val="TOC1"/>';
/** A TOC whose three entries are Normal, then a _Toc link outside,
 *  then a TOC 1 entry with no field. */
const DOC = () => read(p(begin() + instr(' TOC \\o "1-3" \\h ') + sep() +
  lk('_Toc1', 'One')) + p(lk('_Toc2', 'Two')) +
  p(lk('_Toc3', 'Three') + end()) + p(lk('_Toc4', 'Outside')) +
  p(lk('_Toc5', 'Styled'), TOC1) + p(lk('Other', 'Plainlink')));
const linkToks = (b, styles, toc) => tokens(b, styles, new Map(),
  undefined, undefined, undefined, undefined, toc).filter((t) =>
  t.kind === 'link');
const isPlain = (t) => !t.f.under && t.f.colour === '#000000';

describe('TOC entries drawn plain by the field', () => {
  it('tocParas: the ids of the paragraphs in a TOC result, once per ' +
    'document', async () => {
    const d = await DOC(), bs = d.sections[0].blocks;
    const s = tocParas(d);
    assert.deepEqual(bs.map((b) => s.has(b.id)),
      [true, true, true, false, false, false]);
    assert.equal(tocParas(d), s, 'memoised');
    assert.equal(tocParas(null).size, 0);
  });
  it('tokens: an entry (a Normal paragraph) inside the field is ' +
    'plain; outside it a link; the style rule alone still plain',
  async () => {
    const d = await DOC(), bs = d.sections[0].blocks, st = d.styles;
    const s = tocParas(d);
    const [a, b, c, out, styled, other] = bs.map((x) =>
      linkToks(x, st, s.has(x.id)));
    for (const t of [...a, ...b, ...c, ...styled]) {
      assert.ok(isPlain(t), t.text);
    }
    for (const t of [...out, ...other]) {
      assert.equal(t.f.under, true, t.text);
      assert.notEqual(t.f.colour, '#000000');
    }
    // the same widths: one css
    assert.equal(a[0].f.css, out[0].f.css);
  });
  it('a function toc is asked only at a _Toc link (a keystroke ' +
    'elsewhere never looks for the fields)', async () => {
    const d = await DOC(), bs = d.sections[0].blocks;
    let asked = 0;
    const ask = () => { asked++; return true; };
    linkToks(bs[5], d.styles, ask);           // a link to 'Other'
    tokens(bs[5], d.styles, new Map(), undefined, undefined, undefined,
      undefined, () => { throw new Error('no'); }).length;
    assert.equal(asked, 0);
    assert.ok(linkToks(bs[3], d.styles, ask).every(isPlain));
    assert.equal(asked, 1);
  });
  it('the layout: the entry lines drawn plain, the link outside not',
    async () => {
      const d = await DOC(), bs = d.sections[0].blocks;
      const L = new DocLayout(d, tm(), null, {});
      L.layout(800);
      const items = (b) => L.byId.get(b.id).lines.flatMap((ln) =>
        ln.items).filter((q) => q.kind === 'link');
      for (const b of bs.slice(0, 3)) {
        assert.ok(items(b).length && items(b).every(isPlain));
      }
      assert.ok(items(bs[3]).length &&
        items(bs[3]).every((q) => q.f.under));
    });
});
