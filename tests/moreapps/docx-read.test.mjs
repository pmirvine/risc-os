// DocxRead: reading .docx files into the Model, keeping everything.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync}
  from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {checkBlock, OBJ} from '../../tools/moreapps/!Word/Model';
import {resolvePara, resolveRun} from '../../tools/moreapps/!Word/Styles';
import {writeZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {mapNamespaces, mapNamespacesCopy, NS_PAIRS}
  from '../../tools/moreapps/!Word/NsMap';
import {ZipError} from '../../tools/moreapps/!WimpLib/ZipError';
import {buildDocx, documentXml, stylesXml, numberingXml, settingsXml,
  p, r, REL, STRICT_W_NS, STRICT_R_NS, W_NS} from './build-docx.mjs';

const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
// Every document read here must hold only valid blocks.
const read = async (body, parts = {}, opts = {}) => {
  const doc = await readDocx(await buildDocx(
    {'word/document.xml': documentXml(body), ...parts}, opts));
  for (const b of blocks(doc)) checkBlock(b);
  return doc;
};
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const E = (o) => ({extra: [], ...o});

function allValid(doc) {
  for (const b of blocks(doc)) checkBlock(b);
}

async function rejects(promise, code, part) {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof DocxError, 'DocxError expected, got ' + e);
    assert.equal(e.name, 'DocxError');
    assert.equal(e.code, code);
    if (part !== undefined) assert.equal(e.part, part);
    return e;
  }
  assert.fail('expected DocxError ' + code);
}

describe('DocxRead: package', () => {
  it('reads a minimal docx (document.xml only)', async () => {
    const doc = await read(p(r('Hello')));
    assert.equal(doc.sections.length, 1);
    assert.deepEqual(doc.sections[0].props, {extra: []});
    const [q] = paras(doc);
    assert.equal(q.text, 'Hello');
    assert.deepEqual(q.runs, [{start: 0, end: 5, rPr: E()}]);
    assert.equal(doc.meta.mainPart, 'word/document.xml');
    assert.equal(doc.numbering, null);
    assert.equal(doc.rawSettings, null);
    assert.equal(doc.meta.stylesGenerated, true);
    assert.ok(doc.styles.styles.has('Normal'));
    assert.equal(doc.parts.size, 0);
    assert.deepEqual(doc.meta.zipOrder, ['[Content_Types].xml',
      '_rels/.rels', 'word/document.xml',
      'word/_rels/document.xml.rels']);
    assert.deepEqual(doc.meta.contentTypes.defaults[1],
      ['xml', 'application/xml']);
    assert.equal(doc.meta.contentTypes.overrides[0][0],
      '/word/document.xml');
    assert.equal(doc.meta.packageRels[0].type, REL('officeDocument'));
    assert.equal(doc.meta.packageRels[0].target, 'word/document.xml');
    assert.equal(doc.meta.prolog.get('word/document.xml').decl,
      'xml version="1.0" encoding="UTF-8" standalone="yes"');
    allValid(doc);
  });

  it('accepts an ArrayBuffer', async () => {
    const z = await buildDocx({'word/document.xml': documentXml(p(r('x')))});
    const doc = await readDocx(z.buffer.slice(z.byteOffset,
      z.byteOffset + z.length));
    assert.equal(paras(doc)[0].text, 'x');
  });

  it('keeps the document root, its attributes and non-body children',
    async () => {
      const doc = await read(p(r('a')), {}, {});
      assert.equal(doc.meta.documentRoot.name, 'w:document');
      assert.deepEqual(doc.meta.documentRoot.attrs.map((a) => a[0]),
        ['xmlns:w', 'xmlns:r']);
      const d2 = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('a')), {before: '<w:background w:color="FF0000"/>',
          rootAttrs: ' xmlns:mc="x" mc:Ignorable="w14"'})}));
      assert.deepEqual(d2.meta.documentRoot.attrs.slice(2),
        [['xmlns:mc', 'x'], ['mc:Ignorable', 'w14']]);
      assert.equal(d2.meta.beforeBody[0].name, 'w:background');
      assert.deepEqual(d2.meta.afterBody, []);
    });

  it('finds the main part at a non-default name', async () => {
    const doc = await readDocx(await buildDocx({'word/document2.xml':
      documentXml(p(r('Two')))}, {main: 'word/document2.xml'}));
    assert.equal(doc.meta.mainPart, 'word/document2.xml');
    assert.equal(paras(doc)[0].text, 'Two');
    assert.ok(!doc.parts.has('word/document2.xml'));
    assert.ok(!doc.parts.has('word/_rels/document2.xml.rels'));
  });

  it('accepts an absolute Target in _rels/.rels', async () => {
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('abs')))}, {pkgRels:
      [['rId1', REL('officeDocument'), '/word/document.xml']]}));
    assert.equal(doc.meta.mainPart, 'word/document.xml');
    assert.equal(paras(doc)[0].text, 'abs');
  });

  it('keeps unknown parts byte-identical', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
    const extra = {
      'customXml/item1.xml': '<?xml version="1.0"?><x a="1">é</x>',
      'word/media/image1.png': png,
      'word/header1.xml': '<w:hdr xmlns:w="' + W_NS + '"/>',
      'word/footnotes.xml': '<w:footnotes xmlns:w="' + W_NS + '"/>',
      'docProps/core.xml': '<cp:coreProperties xmlns:cp="c"/>',
      'word/_rels/header1.xml.rels': '<Relationships/>',
    };
    const z = await buildDocx({'word/document.xml': documentXml(p(r('x'))),
      ...extra});
    const doc = await readDocx(z);
    const enc = new TextEncoder();
    for (const [n, v] of Object.entries(extra)) {
      const want = typeof v === 'string' ? enc.encode(v) : v;
      assert.deepEqual(doc.parts.get(n), want, n);
    }
    assert.ok(!doc.parts.has('[Content_Types].xml'));
    assert.ok(!doc.parts.has('_rels/.rels'));
    assert.ok(!doc.parts.has('word/document.xml'));
    assert.ok(!doc.parts.has('word/_rels/document.xml.rels'));
    assert.deepEqual([...doc.parts.keys()], Object.keys(extra));
  });

  it('keeps relationships (External too) untouched; never fetches',
    async () => {
      const saved = globalThis.fetch;
      let fetched = 0;
      globalThis.fetch = () => { fetched++; throw new Error('no'); };
      try {
        const doc = await read(p(r('x')), {}, {docRels: [
          ['rId7', REL('hyperlink'), 'http://example.invalid/a?b&c',
            'External'],
          ['rId8', REL('image'), 'media/none.png'],
        ]});
        assert.equal(fetched, 0);
        const h = doc.rels.find((x) => x.id === 'rId7');
        assert.equal(h.target, 'http://example.invalid/a?b&c');
        assert.equal(h.mode, 'External');
        assert.equal(h.type, REL('hyperlink'));
        assert.deepEqual(h.attrs.map((a) => a[0]),
          ['Id', 'Type', 'Target', 'TargetMode']);
        const i = doc.rels.find((x) => x.id === 'rId8');
        assert.equal(i.mode, undefined);
        assert.equal(i.target, 'media/none.png');
      } finally {
        globalThis.fetch = saved;
      }
    });

  it('parses styles, numbering and settings parts and records names',
    async () => {
      const doc = await read(p(r('x')), {
        'word/styles.xml': stylesXml(''),
        'word/numbering.xml': numberingXml(''),
        'word/settings.xml': settingsXml('<w:zoom w:percent="100"/>'),
      });
      assert.equal(doc.meta.stylesPart, 'word/styles.xml');
      assert.equal(doc.meta.numberingPart, 'word/numbering.xml');
      assert.equal(doc.meta.settingsPart, 'word/settings.xml');
      assert.equal(doc.rawSettings.name, 'w:settings');
      assert.equal(doc.rawSettings.children[0].name, 'w:zoom');
      assert.equal(doc.meta.stylesGenerated, undefined);
      assert.equal(doc.parts.size, 0);
    });
});

describe('DocxRead: errors', () => {
  it('not a zip -> not-docx with a ZipError cause', async () => {
    const e = await rejects(readDocx(new TextEncoder().encode('hello')),
      'not-docx');
    assert.ok(e.cause instanceof ZipError);
  });

  it('a zip that is not a package -> not-docx', async () => {
    const z = await writeZip([['a.txt', new Uint8Array([1])]]);
    await rejects(readDocx(z), 'not-docx');
  });

  it('no main document part -> no-document', async () => {
    const z = await buildDocx({'word/other.xml': '<a/>'});
    await rejects(readDocx(z), 'no-document');
  });

  it('no officeDocument relationship -> no-document', async () => {
    const z = await buildDocx({'word/document.xml': documentXml(p())},
      {pkgRels: [['rId1', REL('styles'), 'word/document.xml']]});
    await rejects(readDocx(z), 'no-document');
  });

  it('malformed document.xml -> bad-xml with the part', async () => {
    const z = await buildDocx({'word/document.xml': '<w:document><w:body>'});
    const e = await rejects(readDocx(z), 'bad-xml', 'word/document.xml');
    assert.equal(e.cause.name, 'XmlError');
  });

  it('malformed styles.xml -> bad-xml for word/styles.xml', async () => {
    await rejects(read(p(r('x')), {'word/styles.xml': '<w:styles>'}),
      'bad-xml', 'word/styles.xml');
  });

  it('5 million empty paragraphs are refused before parsing',
    async () => {
      const z = await buildDocx({'word/document.xml':
        documentXml('<w:p/>'.repeat(5000001))});
      const h0 = process.memoryUsage().heapUsed;
      const t = Date.now();
      await rejects(readDocx(z), 'unsupported', 'word/document.xml');
      const ms = Date.now() - t;
      const mb = (process.memoryUsage().heapUsed - h0) / 1048576;
      assert.ok(ms < 1000, 'took ' + ms + ' ms');
      assert.ok(mb < 200, 'heap grew ' + mb + ' MB');
    });

  it('1,000,001 paragraphs are refused before parsing', async () => {
    const z = await buildDocx({'word/document.xml':
      documentXml('<w:p><w:pPr/></w:p>'.repeat(1000001))});
    const t = Date.now();
    const e = await rejects(readDocx(z), 'unsupported',
      'word/document.xml');
    assert.match(e.message, /paragraphs/);
    assert.ok(Date.now() - t < 1000, 'took ' + (Date.now() - t));
  });

  it('a paragraph bomb within the element limit -> unsupported',
    async () => {
      const body = '<w:p/>'.repeat(5000);
      const z = await buildDocx({'word/document.xml': documentXml(body)});
      await rejects(readDocx(z, {maxParagraphs: 1000}), 'unsupported',
        'word/document.xml');
      assert.equal(paras(await readDocx(z)).length, 5000);
    });

  it('an element bomb -> unsupported; the limits can be raised',
    async () => {
      const body = p('<w:r>' + '<w:tab/>'.repeat(5000) + '</w:r>');
      const z = await buildDocx({'word/document.xml': documentXml(body)});
      await rejects(readDocx(z, {maxElements: 1000}), 'unsupported',
        'word/document.xml');
      assert.equal(paras(await readDocx(z, {maxElements: 6000}))[0]
        .text.length, 5000);
    });

  it('a part larger than maxXmlBytes -> unsupported', async () => {
    const z = await buildDocx({'word/document.xml':
      documentXml(p(r('x'.repeat(5000))))});
    await rejects(readDocx(z, {maxXmlBytes: 4096}), 'unsupported',
      'word/document.xml');
    assert.equal(paras(await readDocx(z, {maxXmlBytes: 1e6})).length, 1);
    const z2 = await buildDocx({'word/document.xml':
      documentXml(p(r('x'))), 'word/styles.xml':
      stylesXml('<w:style/>'.repeat(200))});
    await rejects(readDocx(z2, {maxXmlBytes: 1000}), 'unsupported',
      'word/styles.xml');
  });

  it('200,000 paragraphs still read quickly', async () => {
    const z = await buildDocx({'word/document.xml':
      documentXml(p(r('x')).repeat(200000))});
    const t = Date.now();
    const doc = await readDocx(z);
    const ms = Date.now() - t;
    assert.equal(paras(doc).length, 200000);
    assert.ok(ms < 3000, 'took ' + ms + ' ms');
    console.log('# 200k paragraphs read in ' + ms + ' ms');
  });
});

describe('DocxRead: text and runs', () => {
  it('bold and italic runs with exact offsets', async () => {
    const doc = await read(p(r('Plain ') + r('bold', '<w:b/>') +
      r(' both', '<w:b/><w:i/>') + r('!')));
    const [q] = paras(doc);
    assert.equal(q.text, 'Plain bold both!');
    assert.deepEqual(q.runs, [
      {start: 0, end: 6, rPr: E()},
      {start: 6, end: 10, rPr: E({b: true})},
      {start: 10, end: 15, rPr: E({b: true, i: true})},
      {start: 15, end: 16, rPr: E()},
    ]);
  });

  it('merges adjacent runs with the same formatting', async () => {
    const doc = await read(p(r('a', '<w:b/>') + r('b', '<w:b/>') +
      '<w:r w:rsidR="00AB"><w:rPr><w:b/></w:rPr><w:t>c</w:t></w:r>'));
    assert.deepEqual(paras(doc)[0].runs,
      [{start: 0, end: 3, rPr: E({b: true})}]);
  });

  it('keeps leading and trailing spaces', async () => {
    const doc = await read(p(r('  two  ') +
      '<w:r><w:t xml:space="preserve"> x </w:t></w:r>'));
    assert.equal(paras(doc)[0].text, '  two   x ');
  });

  it('emoji, surrogates and CJK', async () => {
    const s = 'A\u{1F600}中文\u{20BB7}z';
    const doc = await read(p(r(s) + r('\u{1F44D}', '<w:i/>')));
    const [q] = paras(doc);
    assert.equal(q.text, s + '\u{1F44D}');
    assert.equal(q.runs[0].end, s.length);
    allValid(doc);
  });

  it('tab and line break are characters', async () => {
    const doc = await read(p('<w:r><w:t>a</w:t><w:tab/><w:t>b</w:t>' +
      '<w:br/><w:t>c</w:t></w:r>'));
    assert.equal(paras(doc)[0].text, 'a\tb\nc');
    assert.deepEqual(paras(doc)[0].inlines, {});
  });

  it('page and column breaks become br inlines', async () => {
    const doc = await read(p('<w:r><w:t>a</w:t><w:br w:type="page"/>' +
      '<w:br w:type="column"/><w:br w:clear="all"/></w:r>'));
    const [q] = paras(doc);
    assert.equal(q.text, 'a' + OBJ + OBJ + OBJ);
    assert.equal(q.inlines[1].kind, 'br');
    assert.equal(q.inlines[1].brType, 'page');
    assert.equal(q.inlines[1].node.name, 'w:br');
    assert.equal(q.inlines[2].brType, 'column');
    assert.equal(q.inlines[3].kind, 'br');
    assert.equal(q.inlines[3].brType, undefined);
    assert.deepEqual(q.inlines[3].node.attrs, [['w:clear', 'all']]);
  });

  it('run-level unknown elements are raw inlines without text',
    async () => {
      const doc = await read(p('<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t>' +
        '<w:drawing><wp:inline xmlns:wp="x"/></w:drawing><w:t>b</w:t>' +
        '<w:fldChar w:fldCharType="begin"/><w:sym w:char="F04A"/></w:r>'));
      const [q] = paras(doc);
      assert.equal(q.text, 'a' + OBJ + 'b' + OBJ + OBJ);
      assert.deepEqual(q.runs, [{start: 0, end: 5, rPr: E({b: true})}]);
      assert.equal(q.inlines[1].kind, 'raw');
      assert.equal(q.inlines[1].node.name, 'w:drawing');
      assert.ok(!('text' in q.inlines[1]));
      assert.equal(q.inlines[3].node.name, 'w:fldChar');
      assert.equal(q.inlines[4].node.name, 'w:sym');
    });

  it('a hyperlink is one inline holding its text', async () => {
    const doc = await read(p(r('See ') +
      '<w:hyperlink r:id="rId9"><w:r><w:t>the </w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>link</w:t></w:r></w:hyperlink>' +
      r('.')));
    const [q] = paras(doc);
    assert.equal(q.text, 'See ' + OBJ + '.');
    assert.equal(q.inlines[4].kind, 'raw');
    assert.equal(q.inlines[4].text, 'the link');
    assert.equal(q.inlines[4].node.name, 'w:hyperlink');
    assert.deepEqual(q.runs, [{start: 0, end: 6, rPr: E()}]);
  });

  it('fldSimple and bookmarks are inlines', async () => {
    const doc = await read(p('<w:bookmarkStart w:id="0" w:name="bm"/>' +
      '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r>' +
      '</w:fldSimple><w:bookmarkEnd w:id="0"/>'));
    const [q] = paras(doc);
    assert.equal(q.text, OBJ + OBJ + OBJ);
    assert.equal(q.inlines[0].node.name, 'w:bookmarkStart');
    assert.equal(q.inlines[0].text, '');
    assert.equal(q.inlines[1].text, '1');
    assert.equal(q.inlines[2].node.name, 'w:bookmarkEnd');
  });

  it('keeps paragraph attributes in extraP', async () => {
    const doc = await read('<w:p w14:paraId="1A" xmlns:w14="x">' +
      r('a') + '</w:p>');
    assert.deepEqual(paras(doc)[0].extraP,
      [['w14:paraId', '1A'], ['xmlns:w14', 'x']]);
  });

  it('an empty paragraph has no runs', async () => {
    const doc = await read(p() + '<w:p/>');
    assert.equal(paras(doc).length, 2);
    assert.deepEqual(paras(doc)[0].runs, []);
  });

  it('literal U+FFFC, tab or newline in w:t stays lossless', async () => {
    const doc = await read(p(r('a￼b')));
    const [q] = paras(doc);
    assert.equal(q.text, 'a' + OBJ + 'b');
    assert.equal(q.inlines[1].node.children[0], '￼');
    allValid(doc);
  });

  it('a run with unknown attributes becomes one inline', async () => {
    const doc = await read(p('<w:r w:foo="1"><w:t>hi</w:t></w:r>'));
    const [q] = paras(doc);
    assert.equal(q.text, OBJ);
    assert.equal(q.inlines[0].node.name, 'w:r');
    assert.equal(q.inlines[0].text, 'hi');
  });
});

describe('DocxRead: properties', () => {
  it('run properties', async () => {
    const doc = await read(p(r('x', '<w:rStyle w:val="Em"/>' +
      '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b w:val="0"/>' +
      '<w:i w:val="true"/><w:strike w:val="off"/><w:color w:val="FF0000"/>' +
      '<w:sz w:val="24"/><w:szCs w:val="24"/><w:highlight w:val="yellow"/>' +
      '<w:u w:val="single"/><w:vertAlign w:val="superscript"/>')));
    const run = paras(doc)[0].runs[0];
    assert.equal(run.rStyle, 'Em');
    assert.deepEqual(run.rPr, E({rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
      b: false, i: true, strike: false, color: 'FF0000', sz: 24, szCs: 24,
      highlight: 'yellow', u: 'single', vertAlign: 'superscript'}));
  });

  it('lossless rule: unknown attributes, themes, duplicates -> extra',
    async () => {
      const doc = await read(p(r('x',
        '<w:rFonts w:asciiTheme="minorHAnsi" w:ascii="Arial"/>' +
        '<w:b/><w:b/><w:color w:val="auto" w:themeColor="accent1"/>' +
        '<w:sz w:val="1.5"/><w:i w:val="maybe"/><w:lang w:val="en-GB"/>' +
        '<w14:glow xmlns:w14="z"/>')));
      const {rPr} = paras(doc)[0].runs[0];
      assert.deepEqual(Object.keys(rPr), ['extra']);
      assert.deepEqual(rPr.extra.map((n) => n.name), ['w:rFonts', 'w:b',
        'w:b', 'w:color', 'w:sz', 'w:i', 'w:lang', 'w14:glow']);
      assert.deepEqual(rPr.extra[3].attrs,
        [['w:val', 'auto'], ['w:themeColor', 'accent1']]);
    });

  it('paragraph properties', async () => {
    const doc = await read(p(r('x'), '<w:pStyle w:val="Heading1"/>' +
      '<w:keepNext/><w:keepLines w:val="1"/><w:pageBreakBefore/>' +
      '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>' +
      '<w:spacing w:before="120" w:after="0" w:line="276" ' +
      'w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/>' +
      '<w:jc w:val="center"/><w:outlineLvl w:val="0"/>' +
      '<w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs>' +
      '<w:rPr><w:b/></w:rPr>'));
    const [q] = paras(doc);
    assert.equal(q.pStyle, 'Heading1');
    const {extra, ...rest} = q.pPr;
    assert.deepEqual(rest, {keepNext: true, keepLines: true,
      pageBreakBefore: true, numPr: {ilvl: 1, numId: 3},
      spacing: {before: 120, after: 0, line: 276, lineRule: 'auto'},
      ind: {left: 720, hanging: 360}, jc: 'center', outlineLvl: 0,
      tabs: [{val: 'left', pos: 1440}]});
    assert.deepEqual(extra.map((n) => n.name), ['w:rPr']);
  });

  it('numPr with something else inside stays raw', async () => {
    const doc = await read(p(r('x'), '<w:numPr><w:ilvl w:val="0"/>' +
      '<w:ins w:id="1"/></w:numPr><w:ind w:start="5"/>'));
    const {pPr} = paras(doc)[0];
    assert.equal(pPr.numPr, undefined);
    assert.deepEqual(pPr.extra.map((n) => n.name), ['w:numPr', 'w:ind']);
  });

  it('prototype pollution attempts are inert', async () => {
    const doc = await read(p(r('x',
      '<w:rFonts w:__proto__="x" w:ascii="A"/>' +
      '<w:color w:constructor="y" w:val="1"/><w:__proto__ w:val="1"/>' +
      '<w:constructor/><w:toString w:val="2"/><w:hasOwnProperty/>'),
    '<w:__proto__ w:polluted="1"/><w:spacing w:__proto__="1" ' +
      'w:polluted="1"/><w:ind w:toString="1"/>') +
      '<w:p w:__proto__="1" w:polluted="yes">' + r('y') + '</w:p>');
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(typeof ({}).toString, 'function');
    const [q, q2] = paras(doc);
    assert.deepEqual(Object.keys(q.runs[0].rPr), ['extra']);
    assert.deepEqual(Object.keys(q.pPr), ['extra']);
    assert.equal(Object.getPrototypeOf(q.pPr), Object.prototype);
    assert.equal(Object.getPrototypeOf(q.runs[0].rPr), Object.prototype);
    assert.equal(q.runs[0].rPr.extra.length, 6);
    assert.equal(q2.text, 'y');
    assert.equal(({}).polluted, undefined);
    allValid(doc);
  });
});

describe('DocxRead: sections and blocks', () => {
  const sect = (inner, a = '') => `<w:sectPr${a}>${inner}</w:sectPr>`;

  it('splits sections at pPr/sectPr and the final sectPr', async () => {
    const doc = await read(p(r('one')) +
      p(r('two'), sect('<w:pgSz w:w="12240" w:h="15840"/>' +
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
        'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
        '<w:cols w:space="720"/>')) +
      p(r('three')) +
      sect('<w:headerReference w:type="default" r:id="rId3"/>' +
        '<w:type w:val="continuous"/>' +
        '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>' +
        '<w:cols w:num="2" w:space="708"/><w:titlePg/>' +
        '<w:docGrid w:linePitch="360"/>', ' w:rsidR="00A1"'));
    assert.equal(doc.sections.length, 2);
    const [a, b] = doc.sections;
    assert.deepEqual(a.blocks.map((x) => x.text), ['one', 'two']);
    assert.deepEqual(b.blocks.map((x) => x.text), ['three']);
    assert.deepEqual(a.props, {pgSz: {w: 12240, h: 15840},
      pgMar: {top: 1440, right: 1440, bottom: 1440, left: 1440,
        header: 720, footer: 720, gutter: 0}, cols: {space: 720},
      extra: []});
    assert.deepEqual(b.props.pgSz, {w: 15840, h: 12240,
      orient: 'landscape'});
    assert.deepEqual(b.props.cols, {num: 2, space: 708});
    assert.equal(b.props.titlePg, true);
    assert.equal(b.props.type, 'continuous');
    assert.deepEqual(b.props.extra.map((n) => n.name),
      ['w:headerReference', 'w:docGrid']);
    assert.equal(a.raw.name, 'w:sectPr');
    assert.deepEqual(b.raw.attrs, [['w:rsidR', '00A1']]);
    assert.equal(doc.meta.bodySectPr, true);
    assert.deepEqual(a.blocks[1].pPr, {extra: []});
  });

  it('without a final sectPr, the rest is a default section', async () => {
    const doc = await read(p(r('a'), sect('')) + p(r('b')));
    assert.equal(doc.sections.length, 2);
    assert.deepEqual(doc.sections[1].props, {extra: []});
    assert.equal(doc.sections[1].raw, null);
    assert.equal(doc.meta.bodySectPr, false);
  });

  it('a table and a body-level sdt become Opaque in place', async () => {
    const doc = await read(p(r('a')) +
      '<w:tbl><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>' +
      p(r('b')) + '<w:sdt><w:sdtContent>' + p(r('c')) +
      '</w:sdtContent></w:sdt><w:bookmarkEnd w:id="1"/>');
    const bs = blocks(doc);
    assert.deepEqual(bs.map((x) => x.type),
      ['p', 'opaque', 'p', 'opaque', 'opaque']);
    assert.equal(bs[1].node.name, 'w:tbl');
    assert.equal(bs[3].node.name, 'w:sdt');
    allValid(doc);
  });

  it('a pPr with attributes keeps the whole paragraph raw', async () => {
    const doc = await read(p(r('a'), '').replace('<w:p>',
      '<w:p><w:pPr w:odd="1"><w:jc w:val="left"/></w:pPr>') + p(r('b')));
    assert.deepEqual(blocks(doc).map((x) => x.type), ['opaque', 'p']);
  });

  it('a second pPr, or one after content, is an inline', async () => {
    const doc = await read('<w:p>' + r('a') + '<w:pPr/></w:p>');
    const [q] = paras(doc);
    assert.equal(q.text, 'a' + OBJ);
    assert.equal(q.inlines[1].node.name, 'w:pPr');
  });

  it('a body sectPr that is not last is Opaque', async () => {
    const doc = await read('<w:sectPr/>' + p(r('a')));
    assert.deepEqual(blocks(doc).map((x) => x.type), ['opaque', 'p']);
    assert.equal(doc.meta.bodySectPr, false);
  });

  it('a last paragraph with sectPr and no body sectPr', async () => {
    const doc = await read(p(r('a')) + p(r('b'), '<w:sectPr/>'));
    assert.equal(doc.sections.length, 1);
    assert.equal(doc.sections[0].raw.name, 'w:sectPr');
    assert.equal(doc.meta.bodySectPr, false);
  });

  it('a document without w:body has one empty section', async () => {
    const z = await buildDocx({'word/document.xml':
      '<w:document xmlns:w="' + W_NS + '"/>'});
    const doc = await readDocx(z);
    assert.deepEqual(doc.sections,
      [{props: {extra: []}, blocks: [], raw: null}]);
    assert.equal(doc.meta.bodyName, null);
  });

  it('a main part that is not w:document -> no-document', async () => {
    const z = await buildDocx({'word/document.xml': '<html/>'});
    await rejects(readDocx(z), 'no-document', 'word/document.xml');
  });

  it('every paragraph passes checkBlock', async () => {
    const doc = await read(p(r('a') + '<w:hyperlink/>' + r('b', '<w:b/>') +
      '<w:r><w:br w:type="page"/></w:r>') + '<w:p/>');
    allValid(doc);
  });
});

describe('DocxRead: styles and numbering', () => {
  const styles = stylesXml(
    '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/>' +
    '<w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault>' +
    '<w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults><w:latentStyles w:count="1"/>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1">' +
    '<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/><w:link w:val="H1Char"/>' +
    '<w:uiPriority w:val="9"/><w:qFormat/><w:rsid w:val="00AA"/>' +
    '<w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="H2x">' +
    '<w:basedOn w:val="Heading1"/><w:rPr><w:i/></w:rPr></w:style>' +
    '<w:style w:type="character" w:default="1" w:customStyle="1" ' +
    'w:styleId="DPF"><w:semiHidden/><w:unhideWhenUsed/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="dup"/>' +
    '</w:style>' +
    '<w:style w:type="table" w:styleId="TT"><w:tblPr/></w:style>');

  it('reads the style table', async () => {
    const doc = await read(p(r('x'), '<w:pStyle w:val="H2x"/>'),
      {'word/styles.xml': styles});
    const t = doc.styles;
    assert.deepEqual(t.docDefaults.rPr.sz, 22);
    assert.equal(t.docDefaults.rPr.extra[0].name, 'w:lang');
    assert.deepEqual(t.docDefaults.pPr, E({spacing: {after: 160}}));
    assert.equal(t.docDefaultsRaw.name, 'w:docDefaults');
    assert.equal(t.latent.name, 'w:latentStyles');
    assert.equal(t.rootName, 'w:styles');
    assert.deepEqual(t.rootAttrs, [['xmlns:w', W_NS]]);
    assert.equal(t.defaults.paragraph, 'Normal');
    assert.equal(t.defaults.character, 'DPF');
    const h = t.styles.get('Heading1');
    assert.equal(h.name, 'heading 1');
    assert.equal(h.basedOn, 'Normal');
    assert.equal(h.next, 'Normal');
    assert.equal(h.link, 'H1Char');
    assert.equal(h.uiPriority, 9);
    assert.equal(h.qFormat, true);
    assert.deepEqual(h.pPr, E({keepNext: true, outlineLvl: 0}));
    assert.deepEqual(h.rPr, E({b: true, sz: 32}));
    assert.deepEqual(h.extra.map((n) => n.name), ['w:rsid']);
    assert.equal(h.raw.name, 'w:style');
    const d = t.styles.get('DPF');
    assert.equal(d.custom, true);
    assert.equal(d.isDefault, true);
    assert.equal(d.semiHidden, true);
    assert.equal(t.styles.get('Normal').name, 'Normal');
    assert.equal(t.extraStyles.length, 1);
    assert.equal(t.styles.get('TT').extra[0].name, 'w:tblPr');
    const q = paras(doc)[0];
    const rp = resolvePara(t, q);
    assert.equal(rp.keepNext, true);
    assert.equal(rp.spacing.after, 160);
    const rr = resolveRun(t, q, q.runs[0]);
    assert.equal(rr.b, true);
    assert.equal(rr.i, true);
    assert.equal(rr.sz, 32);
  });

  it('reads numbering definitions', async () => {
    const doc = await read(p(r('x')), {'word/numbering.xml': numberingXml(
      '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0">' +
      '<w:start w:val="1"/><w:numFmt w:val="decimal"/>' +
      '<w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1">' +
      '<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>' +
      '</w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="0"/>' +
      '</w:num>')});
    const n = doc.numbering;
    assert.equal(n.raw.name, 'w:numbering');
    assert.deepEqual(n.nums.get(5), {abstractNumId: 0, levels: [
      {ilvl: 0, numFmt: 'decimal', lvlText: '%1.', start: 1},
      {ilvl: 1, numFmt: 'bullet', lvlText: '•'}],
      overrides: new Map()});
  });
});

describe('DocxRead: namespaces', () => {
  it('reads a Strict document', async () => {
    const body = p(r('strict', '<w:b/>'), '<w:jc w:val="center"/>');
    const z = await buildDocx({
      'word/document.xml': documentXml(body, {ns: STRICT_W_NS,
        rNs: STRICT_R_NS, rootAttrs: ' w:conformance="strict"'}),
      'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
        'w:styleId="S"><w:rPr><w:i/></w:rPr></w:style>',
      {ns: STRICT_W_NS}),
    }, {strict: true});
    const doc = await readDocx(z);
    const [q] = paras(doc);
    assert.equal(q.text, 'strict');
    assert.deepEqual(q.runs[0].rPr, E({b: true}));
    assert.equal(q.pPr.jc, 'center');
    assert.equal(doc.styles.styles.get('S').rPr.i, true);
    assert.equal(doc.meta.conformance, 'strict');
    assert.deepEqual(doc.meta.documentRoot.attrs.slice(0, 2),
      [['xmlns:w', W_NS], ['xmlns:r', REL('').slice(0, -1)]]);
  });

  it('Strict: graphicData and dataBinding mapped; maps back exactly',
    async () => {
      const S = 'http://purl.oclc.org/ooxml/';
      const T = 'http://schemas.openxmlformats.org/';
      const drawing = '<w:drawing><wp:inline xmlns:wp="' + S +
        'drawingml/wordprocessingDrawing"><a:graphic xmlns:a="' + S +
        'drawingml/main"><a:graphicData uri="' + S + 'drawingml/picture">' +
        '<pic:pic xmlns:pic="' + S + 'drawingml/picture"/></a:graphicData>' +
        '</a:graphic></wp:inline></w:drawing>';
      const sdt = '<w:sdt><w:sdtPr><w:dataBinding w:prefixMappings="' +
        "xmlns:ns0='" + S + "officeDocument/extendedProperties' " +
        "xmlns:ns1='urn:x'\" w:xpath=\"/ns0:P\"/></w:sdtPr>" +
        '<w:sdtContent>' + p(r('in')) + '</w:sdtContent></w:sdt>';
      const docXml = documentXml(p('<w:r>' + drawing + '</w:r>') + sdt,
        {ns: STRICT_W_NS, rNs: STRICT_R_NS, rootAttrs: ' xmlns:m="' + S +
          'officeDocument/math" xmlns:c="' + S + 'drawingml/chart" ' +
          'w:conformance="strict"'}).replace('?>\n', '?>\n<!--pre-->\n');
      const stXml = stylesXml('<w:style w:type="paragraph" w:styleId="S">' +
        '<w:name w:val="S"/></w:style>', {ns: STRICT_W_NS});
      const setXml = settingsXml('<w:zoom w:percent="90"/>',
        {ns: STRICT_W_NS});
      const doc = await readDocx(await buildDocx({
        'word/document.xml': docXml, 'word/styles.xml': stXml,
        'word/settings.xml': setXml}, {strict: true}));
      allValid(doc);
      assert.equal(doc.meta.conformance, 'strict');
      const [q] = paras(doc);
      const inl = q.inlines[0];
      assert.equal(inl.level, 'r');
      const gd = inl.node.children[0].children[0].children[0];
      assert.equal(gd.name, 'a:graphicData');
      assert.deepEqual(gd.attrs, [['uri', T + 'drawingml/2006/picture']]);
      const op = blocks(doc)[1];
      assert.equal(op.type, 'opaque');
      const db = op.node.children[0].children[0];
      assert.equal(db.attrs[0][1], "xmlns:ns0='" + T +
        "officeDocument/2006/extended-properties' xmlns:ns1='urn:x'");
      assert.ok(doc.meta.documentRoot.attrs.some(([n, v]) =>
        n === 'xmlns:c' && v === T + 'drawingml/2006/chart'));
      // ...and every kept tree maps back to the original exactly
      const orig = parseXml(docXml);
      const back = (n) => mapNamespacesCopy(n, 'toStrict');
      const root = doc.meta.documentRoot;
      assert.deepEqual(back({name: root.name, attrs: root.attrs,
        children: []}).attrs, orig.root.attrs);
      const oBody = orig.root.children[0];
      assert.deepEqual(back(inl.node),
        oBody.children[0].children[0].children[0]);
      assert.deepEqual(back(op.node), oBody.children[1]);
      assert.equal(gd.attrs[0][1], T + 'drawingml/2006/picture',
        'the copy left the model alone');
      const pro = doc.meta.prolog.get('word/document.xml');
      assert.deepEqual(pro.before, [{comment: 'pre'}]);
      assert.deepEqual(pro.before, orig.before);
      const oSt = parseXml(stXml).root;
      assert.deepEqual(back(doc.styles.styles.get('S').raw),
        oSt.children[0]);
      assert.deepEqual(back({name: 'x', attrs: doc.styles.rootAttrs,
        children: []}).attrs, oSt.attrs);
      assert.deepEqual(back(doc.rawSettings), parseXml(setXml).root);
      assert.equal(doc.meta.packageRels[0].type,
        STRICT_R_NS + '/officeDocument', 'rel types stay Strict');
    });

  it('Transitional input is unchanged and flagged', async () => {
    const xml = documentXml(p(r('t')), {rootAttrs:
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'});
    const doc = await readDocx(await buildDocx({'word/document.xml': xml}));
    assert.equal(doc.meta.conformance, 'transitional');
    assert.deepEqual(doc.meta.documentRoot.attrs, parseXml(xml).root.attrs);
  });

  it('the namespace table is a bijection and maps both ways', () => {
    const s = new Set(NS_PAIRS.map((x) => x[0]));
    const t = new Set(NS_PAIRS.map((x) => x[1]));
    assert.equal(s.size, NS_PAIRS.length);
    assert.equal(t.size, NS_PAIRS.length);
    for (const [strict, trans] of NS_PAIRS) {
      assert.ok(strict.startsWith('http://purl.oclc.org/ooxml/'));
      const n = {name: 'x', attrs: [['xmlns:q', strict]], children: [
        {name: 'a:graphicData', attrs: [['uri', strict]], children: []}]};
      assert.equal(mapNamespaces(n, 'toTransitional'), true);
      assert.equal(n.attrs[0][1], trans);
      assert.equal(n.children[0].attrs[0][1], trans);
      assert.equal(mapNamespaces(n, 'toStrict'), true);
      assert.equal(n.attrs[0][1], strict);
      assert.equal(n.children[0].attrs[0][1], strict);
    }
    assert.throws(() => mapNamespaces({name: 'x', attrs: [],
      children: []}, 'sideways'), RangeError);
  });

  it('leaves out the pairs whose Strict URI is not a PURL', () => {
    const strict = NS_PAIRS.map((x) => x[0]);
    for (const bad of ['officeDocument/customXmlDataProps',
      'drawingml/compatibility']) {
      assert.ok(!strict.includes('http://purl.oclc.org/ooxml/' + bad),
        bad);
    }
    assert.equal(NS_PAIRS.length, 18);
  });

  it('WML bound to another prefix', async () => {
    const body = '<x:p><x:pPr><x:jc x:val="right"/></x:pPr><x:r><x:rPr>' +
      '<x:b/></x:rPr><x:t>other</x:t><x:tab/></x:r></x:p>';
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(body, {prefix: 'x'})}));
    const [q] = paras(doc);
    assert.equal(q.text, 'other\t');
    assert.equal(q.pPr.jc, 'right');
    assert.deepEqual(q.runs[0].rPr, E({b: true}));
  });

  it('w: bound to another namespace is not WML', async () => {
    const body = '<w:p xmlns:w="urn:other"><w:r><w:t>z</w:t></w:r></w:p>';
    const doc = await read(body);
    assert.equal(blocks(doc)[0].type, 'opaque');
  });
});

describe('DocxRead: inline levels and part names', () => {
  it('every inline has a level: wrappers p, run content r', async () => {
    const doc = await read(p(r('a') +
      '<w:hyperlink r:id="x"><w:r><w:t>h</w:t></w:r></w:hyperlink>' +
      '<w:r><w:drawing/><w:br w:type="page"/><w:instrText>I</w:instrText>' +
      '<w:t>\ufffc</w:t></w:r><w:r w:odd="1"><w:t>w</w:t></w:r>' +
      '<w:fldSimple w:instr="X"/>stray'));
    const [q] = paras(doc);
    const got = Object.values(q.inlines).map((x) =>
      [x.kind, x.level, typeof x.node === 'string' ? '#text' :
        x.node.name]);
    assert.deepEqual(got, [['raw', 'p', 'w:hyperlink'],
      ['raw', 'r', 'w:drawing'], ['br', 'r', 'w:br'],
      ['raw', 'r', 'w:instrText'], ['raw', 'r', 'w:t'],
      ['raw', 'p', 'w:r'], ['raw', 'p', 'w:fldSimple'],
      ['raw', 'p', '#text']]);
    assert.equal(q.inlines[1].text, 'h');
  });

  it('prolog is a Map: a part named __proto__ is harmless', async () => {
    // a computed key: a literal '__proto__': would set the prototype
    const doc = await readDocx(await buildDocx({['__proto__']:
      documentXml(p(r('x')))}, {main: '__proto__'}));
    assert.equal(doc.meta.mainPart, '__proto__');
    assert.ok(doc.meta.prolog instanceof Map);
    assert.equal(doc.meta.prolog.get('__proto__').decl,
      'xml version="1.0" encoding="UTF-8" standalone="yes"');
    assert.equal(Object.getPrototypeOf({}), Object.prototype);
    assert.equal(({}).decl, undefined);
    assert.equal(paras(doc)[0].text, 'x');
  });
});

describe('DocxRead: determinism', () => {
  it('reading twice gives the same model apart from ids', async () => {
    const z = await buildDocx({'word/document.xml': documentXml(
      p(r('a') + '<w:hyperlink><w:r><w:t>h</w:t></w:r></w:hyperlink>') +
      '<w:tbl/>' + p(r('b', '<w:b/>')))});
    const norm = (d) => {
      let k = 0;
      for (const s of d.sections) for (const b of s.blocks)
        if (b.type === 'p') b.id = k++;
      return d;
    };
    assert.deepEqual(norm(await readDocx(z)), norm(await readDocx(z)));
  });
});

const TEXTUTIL = '/usr/bin/textutil';

describe('DocxRead: real-world files from textutil', () => {
  it('reads documents converted by textutil',
    {skip: existsSync(TEXTUTIL) ? false : 'no /usr/bin/textutil'},
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'docx-read-'));
      try {
        const html = '<html><body><h1 style="font-size:24pt">Heading ' +
          'Alpha</h1><p>Plain <b>bold</b> and <i>italic</i> text with ' +
          '<a href="http://example.invalid/">a link</a>.</p><ul><li>Item ' +
          'one</li><li>Item two</li></ul><table border="1"><tr><td>Cell ' +
          'A</td><td>Cell B</td></tr></table><p>Final words.</p>' +
          '</body></html>';
        const rtf = '{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0\\fs48 ' +
          'Big Heading\\par\\fs24 Plain {\\b bold} and {\\i italic}.\\par ' +
          'Last line.\\par}';
        writeFileSync(join(dir, 'a.html'), html);
        writeFileSync(join(dir, 'b.rtf'), rtf);
        const want = {
          a: ['Heading', 'Alpha', 'bold', 'italic', 'Item', 'two', 'Final'],
          b: ['Big', 'Heading', 'bold', 'italic', 'Last'],
        };
        for (const [n, src] of [['a', 'a.html'], ['b', 'b.rtf']]) {
          execFileSync(TEXTUTIL, ['-convert', 'docx', '-output',
            join(dir, n + '.docx'), join(dir, src)]);
          const doc = await readDocx(readFileSync(join(dir, n + '.docx')));
          allValid(doc);
          const all = [];
          let opaque = 0, inl = 0;
          for (const b of blocks(doc)) {
            if (b.type === 'opaque') { opaque++; continue; }
            inl += Object.keys(b.inlines).length;
            all.push(b.text);
            for (const x of Object.values(b.inlines)) {
              if (x.text) all.push(x.text);
            }
          }
          const text = all.join(' ');
          let at = 0;
          for (const w of want[n]) {
            const i = text.indexOf(w, at);
            assert.ok(i >= 0, n + ': "' + w + '" in order');
            at = i + w.length;
          }
          console.log(`# textutil ${src}: ${blocks(doc).length} blocks, ` +
            `${opaque} opaque blocks, ${inl} inlines, ` +
            `${doc.parts.size} kept parts`);
        }
      } finally {
        rmSync(dir, {recursive: true, force: true});
      }
    });
});
