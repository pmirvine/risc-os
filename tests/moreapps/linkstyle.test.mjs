// Links drawn run by run (./LinkRuns, ./LineTokens), as Word draws
// them: only the runs styled Hyperlink are blue and underlined (by
// that style); a run with no such style is plain. The font, size,
// bold and italic stay the link's one format there, as before: a
// run's own would change widths and move pages (the pages-corpus pin
// fell from 327 to 323 when they were tried), so that is a known
// limit, and every run of a link has the same css.
// So every link !Letters makes styles its runs Hyperlink: Insert >
// Hyperlink (./LinkOps), and the importers (./RtfFields, ./ImpFields:
// RTF, ODT, .doc) on each run that has no character style, colour or
// underline of its own (the Hyperlink style added to the document
// when it has none), so imported links still look like links.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {ImpBuild} from '../../tools/moreapps/!Letters/ImpBuild';
import {insertLink} from '../../tools/moreapps/!Letters/LinkOps';
import {inside} from '../../tools/moreapps/!Letters/LinkParts';
import {linkRuns} from '../../tools/moreapps/!Letters/LinkRuns';
import {tokens} from '../../tools/moreapps/!Letters/LineTokens';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {mk, P, SEL} from './edit-docs.mjs';
import {emit} from './word-emit.mjs';
import {buildDocx, documentXml, stylesXml} from './build-docx.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
const linkOf = (b) => Object.values(b.inlines).find((x) => x.node &&
  /hyperlink$/.test(x.node.name));
/** The rStyle of each run of link x (in doc's scope). */
const styles = (doc, x) => inside(x.node, docScope(doc).map).runs
  .map((r) => r.rStyle ?? null);
const linkToks = (doc, b) => tokens(b, doc.styles, new Map(),
  docScope(doc).map).filter((t) => t.kind === 'link' && t.text.trim());
const blue = (t) => t.f.under && t.f.colour.toLowerCase() === '#0563c1';

describe('a link\'s runs, read back to its text', () => {
  it('linkRuns: the pieces in order with their runs; null when ' +
    'they do not make the text', async () => {
    const doc = readRtf(enc('{\\rtf1 {\\field{\\*\\fldinst HYPERLINK ' +
      '"https://e.example/"}{\\fldrslt ab{\\b cd}}}}'), {date: DATE}).doc;
    const x = linkOf(paras(doc)[0]);
    const segs = linkRuns(x, docScope(doc).map);
    assert.deepEqual(segs.map((g) => [g.text, g.run.rPr.b === true]),
      [['ab', false], ['cd', true]]);
    assert.equal(linkRuns(x), segs, 'memoised');
    assert.equal(linkRuns({...x, text: 'other'}), null);
  });
});

describe('links !Letters makes look like links', () => {
  it('RTF: a link\'s plain runs take the Hyperlink style (added); ' +
    'a run with its own colour and underline keeps them', async () => {
    const {doc} = readRtf(enc('{\\rtf1{\\colortbl;\\red255\\green0' +
      '\\blue0;}{\\field{\\*\\fldinst HYPERLINK "https://e.example/"}' +
      '{\\fldrslt here {\\b bold}}} {\\field{\\*\\fldinst HYPERLINK ' +
      '"https://f.example/"}{\\fldrslt {\\cf1\\ul red}}}}'),
    {date: DATE});
    const st = doc.styles.styles.get('Hyperlink');
    assert.equal(st && st.type, 'character');
    const [p] = paras(doc);
    const [a, b] = Object.values(p.inlines).filter((x) => x.node &&
      /hyperlink$/.test(x.node.name));
    assert.deepEqual(styles(doc, a), ['Hyperlink', 'Hyperlink']);
    assert.deepEqual(styles(doc, b), [null]);
    const ts = linkToks(doc, p);
    assert.deepEqual(ts.map((t) => [t.text, blue(t), t.f.bold]),
      [['here', true, false], ['bold', true, false],
        ['red', false, false]]);
    assert.equal(ts[2].f.under, true);
    assert.equal(ts[2].f.colour.toLowerCase(), '#ff0000');
    assert.equal(new Set(ts.map((t) => t.f.css)).size, 1, 'one css');
    const bytes = await writeDocx(doc);
    emit('linkstyle-rtf', bytes);
    const back = await readDocx(bytes);
    assert.deepEqual(linkToks(back, paras(back)[0]).map(blue),
      [true, true, false]);
  });
  it('ODT and .doc (ImpBuild): a HYPERLINK field\'s plain text ' +
    'takes the style; coloured text keeps its own', async () => {
    const b = new ImpBuild({date: DATE});
    const plain = {rPr: {extra: []}};
    b.fieldStart({code: 'HYPERLINK "https://example.com/"'});
    b.text('see', plain);
    b.fieldEnd();
    b.text(' ', plain);
    b.fieldStart({code: 'HYPERLINK "https://example.org/"'});
    b.text('red', {rPr: {color: 'FF0000', extra: []}});
    b.fieldEnd();
    b.endPara({pPr: {extra: []}});
    const {doc} = b.finish();
    const [p] = paras(doc);
    const [x, y] = Object.values(p.inlines).filter((z) => z.node &&
      /hyperlink$/.test(z.node.name));
    assert.deepEqual(styles(doc, x), ['Hyperlink']);
    assert.deepEqual(styles(doc, y), [null]);
    assert.equal(doc.styles.styles.get('Hyperlink').type, 'character');
    assert.deepEqual(linkToks(doc, p).map(blue), [true, false]);
    emit('linkstyle-imp', await writeDocx(doc));
  });
  it('Insert > Hyperlink over a bold run: blue and underlined (in the ' +
    'link\'s one css, the known limit)',
    () => {
      const d = mk([['one two', {runs: [{start: 0, end: 4,
        rPr: {extra: []}}, {start: 4, end: 7,
        rPr: {b: true, extra: []}}]}]]);
      const out = insertLink(d, new Typing(d), SEL(d, 0, 0, 0, 7),
        {address: 'https://example.com/'});
      assert.ok(out && out.sel);
      const ts = linkToks(d.doc, P(d, 0));
      assert.deepEqual(ts.map((t) => [t.text, blue(t), t.f.bold]),
        [['one', true, false], ['two', true, false]]);
      assert.equal(ts[0].f.css, ts[1].f.css);
    });
});

// A wrapper inside a link (w:ins when Word tracks typing into a link,
// w:smartTag, w:sdt) has its own runs: they are drawn in their own
// look too, not plain; a w:del inside draws nothing.
describe('wrappers inside a link', () => {
  const STY = '<w:style w:type="paragraph" w:default="1" ' +
    'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name ' +
    'w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/>' +
    '<w:u w:val="single"/></w:rPr></w:style>';
  const HR = (t) => '<w:r><w:rPr><w:rStyle w:val="Hyperlink"/>' +
    `</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const REV = 'w:id="9" w:author="A" w:date="2026-01-01T00:00:00Z"';
  const docOf = async (inner) => readDocx(await buildDocx({
    'word/document.xml': documentXml('<w:p><w:hyperlink w:anchor="x">' +
      HR('one ') + inner + '</w:hyperlink></w:p>'),
    'word/styles.xml': stylesXml(STY)}));
  const shown = async (inner) => {
    const d = await docOf(inner), b = paras(d)[0];
    return linkToks(d, b).map((t) => [t.text, blue(t)]);
  };
  it('w:ins: its Hyperlink run is blue', async () => {
    assert.deepEqual(await shown(`<w:ins ${REV}>${HR('two')}</w:ins>`),
      [['one', true], ['two', true]]);
  });
  it('w:smartTag: its Hyperlink run is blue', async () => {
    assert.deepEqual(await shown('<w:smartTag w:uri="u" w:element="e">' +
      HR('two') + '</w:smartTag>'), [['one', true], ['two', true]]);
  });
  it('w:sdt: its Hyperlink run is blue', async () => {
    assert.deepEqual(await shown('<w:sdt><w:sdtPr/><w:sdtContent>' +
      HR('two') + '</w:sdtContent></w:sdt>'),
    [['one', true], ['two', true]]);
  });
  it('w:del: its text is not drawn', async () => {
    assert.deepEqual(await shown(`<w:del ${REV}><w:r><w:rPr><w:rStyle ` +
      'w:val="Hyperlink"/></w:rPr><w:delText>gone</w:delText></w:r>' +
      '</w:del>' + HR('two')), [['one', true], ['two', true]]);
  });
});
