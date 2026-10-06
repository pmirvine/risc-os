// The pure parts of the !Word stub's window: the info line (Info), the
// look of runs and paragraphs (Fmt) and line breaking (LineLayout).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {summary, facts, kindOf} from '../../tools/moreapps/!Word/Info';
import {runFmt, paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {describe as why, openDocx}
  from '../../tools/moreapps/!Word/Open';
import {DocxError} from '../../tools/moreapps/!Word/DocxError';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';

const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
  '<w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr>' +
  '<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:b/>' +
  '<w:sz w:val="32"/></w:rPr></w:style>');
const TBL = '<w:tbl><w:tr><w:tc>' + p(r('x')) + '</w:tc></w:tr></w:tbl>';
const doc = (body) => buildDocx({'word/document.xml': documentXml(body),
  'word/styles.xml': STYLES}).then(readDocx);
const paras = (d) => d.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
// every character 10 px wide, whatever the font
const measure = new TextMetrics((t) => t.length * 10);

describe('Info', () => {
  it('counts paragraphs, kept items and fonts', async () => {
    const d = await doc(p(r('Title'), '<w:pStyle w:val="Heading1"/>') +
      TBL + TBL + p('<w:hyperlink><w:r><w:t>l</w:t></w:r></w:hyperlink>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText>PAGE</w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>'));
    const f = facts(d);
    assert.equal(f.paragraphs, 2);
    // a field's codes (fldChar, instrText) are not drawn and not
    // counted: its result is shown as text
    assert.deepEqual(f.kinds, [['table', 2], ['link', 1]]);
    assert.deepEqual(f.fonts, ['Caladea', 'Carlito']);
    assert.equal(summary(d), '2 paragraphs, 3 preserved items ' +
      '(2 tables, 1 link), fonts: Caladea, Carlito');
  });
  it('proofing marks and bookmarks are not preserved items', async () => {
    const d = await doc(p('<w:bookmarkStart w:id="0" w:name="b"/>' +
      '<w:proofErr w:type="spellStart"/>' + r('Helo') +
      '<w:proofErr w:type="spellEnd"/><w:bookmarkEnd w:id="0"/>' +
      '<w:commentRangeStart w:id="1"/><w:commentRangeEnd w:id="1"/>' +
      '<w:permStart w:id="2"/><w:permEnd w:id="2"/>' +
      '<w:r><w:lastRenderedPageBreak/></w:r>'));
    assert.equal(facts(d).preserved, 0);
    assert.equal(summary(d),
      '1 paragraph, no preserved items, fonts: Carlito');
  });
  it('says so when nothing is kept', async () => {
    assert.equal(summary(await doc(p(r('a')))),
      '1 paragraph, no preserved items, fonts: Carlito');
  });
  it('names kinds', () => {
    assert.equal(kindOf({name: 'w:sdt', attrs: [], children: []}),
      'content control');
    assert.equal(kindOf({name: 'w:foo', attrs: [], children: []}), 'foo');
    assert.equal(kindOf('text'), 'item');
  });
});

describe('Fmt', () => {
  it('resolves headings from the styles', async () => {
    const d = await doc(p(r('T'), '<w:pStyle w:val="Heading1"/>') +
      p(r('b', '<w:i/>'),
        '<w:ind w:left="720" w:hanging="360"/><w:jc w:val="both"/>'));
    const [ph, b] = paras(d);
    const f = runFmt(d.styles, ph, ph.runs[0]);
    assert.equal(f.bold, true);
    assert.equal(f.px, 21.33);             // 16 pt
    assert.equal(f.family, 'Caladea');
    assert.equal(paraFmt(d.styles, ph).heading, 1);
    assert.equal(runFmt(d.styles, b, b.runs[0]).italic, true);
    const pf = paraFmt(d.styles, b);
    assert.equal(pf.left, 48);
    assert.equal(pf.first, -24);
    assert.equal(pf.align, 'left');
  });
});

describe('LineLayout', () => {
  it('breaks lines at spaces to fit the width', async () => {
    const d = await doc(p(r('aaaa bbbb cccc dddd')));
    const l = layoutPara(paras(d)[0], d.styles, 100, measure, new Map());
    assert.deepEqual(l.lines.map((x) => x.items.map((i) => i.text).join('')),
      ['aaaa bbbb ', 'cccc dddd']);
  });
  it('centres, keeps runs apart and shows kept items', async () => {
    const d = await doc(p(r('ab') + r('cd', '<w:b/>') +
      '<w:r><w:drawing/></w:r>', '<w:jc w:val="center"/>'));
    const l = layoutPara(paras(d)[0], d.styles, 200, measure, new Map());
    const items = l.lines[0].items;
    assert.deepEqual(items.map((i) => [i.text, i.kind]),
      [['ab', 'text'], ['cd', 'text'], ['[...]', 'box']]);
    assert.ok(items[0].x > 0);
  });
});

describe('Open', () => {
  it('says why a file could not be read', () => {
    assert.equal(why(new DocxError('not-docx', 'x'), 'Doc'),
      "'Doc' could not be opened: it is not a Word .docx file.");
    assert.match(why(new Error('boom'), 'D'), /'D' could not be opened: boom/);
  });
  it('opens 200,000 paragraphs and refuses one more, quickly',
    async () => {
      const file = (n) => buildDocx({'word/document.xml':
        documentXml('<w:p/>'.repeat(n))});
      const vfsOf = (bytes) => ({readFile: async () => bytes});
      const big = await file(200001);
      const t0 = Date.now();
      const err = await openDocx(vfsOf(big), 'HD.$.Big').then(
        () => null, (e) => e);
      const took = Date.now() - t0;
      assert.ok(err, 'refused');
      assert.equal(why(err, 'Big'), "'Big' could not be opened: it is " +
        'too big, encrypted or uses a kind of zip file that Word ' +
        'cannot read.');
      assert.ok(took < 1000, `refused in ${took} ms`);
      const d = await openDocx(vfsOf(await file(200000)), 'HD.$.Ok');
      assert.equal(paras(d).length, 200000);
    });
});

describe('formatting on the screen', () => {
  const lay = (d, w = 400) =>
    layoutPara(paras(d)[0], d.styles, w, measure, new Map());
  it('runs keep their colour', async () => {
    const d = await doc(p(r('a') + r('b', '<w:color w:val="C00000"/>') +
      r('c', '<w:color w:val="auto"/>')));
    const it = lay(d).lines[0].items;
    assert.deepEqual(it.map((x) => x.f.colour),
      ['#000000', '#C00000', '#000000']);
  });
  it('links are blue and underlined', async () => {
    const d = await doc(p(r('see ') +
      '<w:hyperlink><w:r><w:t>here</w:t></w:r></w:hyperlink>'));
    const link = lay(d).lines[0].items.find((x) => x.kind === 'link');
    assert.equal(link.text, 'here');
    assert.equal(link.f.colour, '#0000c0');
    assert.equal(link.f.under, true);
  });
  const drawn = (d) => lay(d, 2000).lines.flatMap((l) => l.items)
    .map((x) => x.text).join('');
  it('proofing marks, bookmarks and field codes draw nothing',
    async () => {
      const d = await doc(p('<w:bookmarkStart w:id="0" w:name="b"/>' +
        r('The ') + '<w:proofErr w:type="spellStart"/>' + r('Helo') +
        '<w:proofErr w:type="spellEnd"/><w:bookmarkEnd w:id="0"/>' +
        r(' page ') + '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText>' +
        '</w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        r('3') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
        '<w:r><w:lastRenderedPageBreak/></w:r>' + r('.')));
      assert.equal(drawn(d), 'The Helo page 3.');
      assert.ok(!lay(d, 2000).lines[0].items.some((x) => x.kind === 'box'));
    });
  for (const el of ['<w:proofErr w:type="gramStart"/>',
    '<w:bookmarkStart w:id="1" w:name="x"/>', '<w:bookmarkEnd w:id="1"/>',
    '<w:commentRangeStart w:id="1"/>', '<w:commentRangeEnd w:id="1"/>',
    '<w:permStart w:id="1"/>', '<w:permEnd w:id="1"/>',
    '<w:r><w:lastRenderedPageBreak/></w:r>',
    '<w:r><w:instrText>PAGE</w:instrText></w:r>',
    '<w:r><w:delText>gone</w:delText></w:r>',
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
    '<w:del w:id="1" w:author="A"><w:r><w:delText>old</w:delText>' +
      '</w:r></w:del>']) {
    it(`draws nothing for ${el.slice(0, 30)}`, async () => {
      assert.equal(drawn(await doc(p(r('a') + el + r('b')))), 'ab');
    });
  }
  it('a non-breaking hyphen is -, a soft hyphen nothing', async () => {
    const d = await doc(p(r('e') + '<w:r><w:noBreakHyphen/></w:r>' +
      r('mail co') + '<w:r><w:softHyphen/></w:r>' + r('operate')));
    assert.equal(drawn(d), 'e-mail cooperate');
  });
  it('other kept items still show a box', async () => {
    for (const el of ['<w:r><w:drawing/></w:r>', '<w:r><w:pict/></w:r>',
      '<w:r><w:footnoteReference w:id="1"/></w:r>',
      '<w:r><w:commentReference w:id="1"/></w:r>',
      '<w:r><w:sym w:font="Wingdings" w:char="F04A"/></w:r>']) {
      const it = lay(await doc(p(r('a') + el))).lines[0].items;
      assert.deepEqual(it.map((x) => x.kind), ['text', 'box'], el);
    }
  });
  it('only hyperlinks are links; other wrappers are plain text',
    async () => {
      const wrap = (n, a = '') => `<w:${n}${a}><w:r><w:t>${n}</w:t>` +
        `</w:r></w:${n}>`;
      const d = await doc(p(r('x ') + wrap('ins', ' w:id="1" w:author="A"') +
        wrap('fldSimple', ' w:instr="PAGE"') + wrap('smartTag') +
        wrap('customXml') + '<w:sdt><w:sdtContent><w:r><w:t>sdt</w:t>' +
        '</w:r></w:sdtContent></w:sdt>' + wrap('hyperlink')));
      const items = lay(d, 2000).lines[0].items;
      assert.equal(items.map((x) => x.text).join(''),
        'x insfldSimplesmartTagcustomXmlsdthyperlink');
      const kinds = items.map((x) => [x.text, x.kind]);
      assert.deepEqual(kinds.filter(([, k]) => k === 'link'),
        [['hyperlink', 'link']]);
      for (const x of items.filter((i) => i.kind !== 'link')) {
        assert.equal(x.f.colour, '#000000', x.text);
        assert.equal(x.f.under, false, x.text);
      }
    });
  it('a tab jumps to the next half inch', async () => {
    const d = await doc(p(r('ab\tc\td')));
    const it = lay(d).lines[0].items;
    // 'ab' is 20 px: the tab goes to 48; 'c' ends at 58: on to 96
    assert.deepEqual(it.filter((x) => x.text).map((x) => [x.text, x.x]),
      [['ab', 0], ['c', 48], ['d', 96]]);
  });
  it('line spacing makes lines taller', async () => {
    const one = lay(await doc(p(r('aaaa bbbb cccc'))), 60);
    const two = lay(await doc(p(r('aaaa bbbb cccc'),
      '<w:spacing w:line="480" w:lineRule="auto"/>')), 60);
    assert.equal(one.lines.length, 3);
    assert.ok(Math.abs(two.lines[1].h - 2 * one.lines[1].h) < 0.01);
    assert.ok(Math.abs(two.h - 2 * one.h) < 0.01);
  });
  it('space before and after a paragraph', async () => {
    const l = lay(await doc(p(r('a'),
      '<w:spacing w:before="240" w:after="120"/>')));
    assert.equal(l.lines[0].y, 16);
    assert.equal(l.h, 16 + l.lines[0].h + 8);
  });
  it('limits hostile spacing and indents', async () => {
    const d = await doc(p(r('a'), '<w:spacing w:before="2000000000" ' +
      'w:after="2000000000" w:line="2000000000"/><w:ind ' +
      'w:left="2000000000" w:right="2000000000" ' +
      'w:firstLine="2000000000"/>') + p(r('b'),
      '<w:ind w:left="100" w:hanging="99999999"/>'));
    const [a, b] = paras(d);
    const f = paraFmt(d.styles, a);
    assert.ok(f.before <= 5000 / 15 && f.after <= 5000 / 15, JSON.stringify(f));
    assert.ok(f.left <= 2000 && f.right <= 2000 && f.first <= 2000, JSON.stringify(f));
    assert.ok(f.factor <= 4);
    const fb = paraFmt(d.styles, b);
    assert.ok(fb.left + fb.first >= 0, JSON.stringify(fb));
    const l = layoutPara(a, d.styles, 400, measure, new Map());
    assert.ok(l.h < 1000, l.h);
  });
});
