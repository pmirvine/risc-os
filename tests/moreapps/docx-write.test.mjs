// DocxWrite: writing the Model as a .docx that Word opens cleanly.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {newPara, newSection, emptyDoc, OBJ}
  from '../../tools/moreapps/!Word/Model';
import {ORDER} from '../../tools/moreapps/!Word/Order';
import {NS} from '../../tools/moreapps/!Word/Wml';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, stylesXml, settingsXml, p, r, REL,
  STRICT_W_NS, STRICT_R_NS, W_NS} from './build-docx.mjs';
import {strictDocx, STYLES} from './docx-fixtures.mjs';
import {assertSameDoc, entries, xmlEntries, entryText}
  from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const isEl = (c) => typeof c === 'object' && c.name !== undefined;
const kids = (n, name) => n.children.filter((c) => isEl(c) &&
  (name === undefined || c.name === name));
const kid = (n, name) => kids(n, name)[0];
const local = (n) => n.slice(n.indexOf(':') + 1);

const fromXml = async (body, parts = {}, opts = {}) =>
  readDocx(await buildDocx({'word/document.xml': documentXml(body),
    ...parts}, opts));

/** The parsed word/document.xml of a written file. */
async function docTree(bytes, name = 'word/document.xml') {
  return (await xmlEntries(bytes)).get(name).root;
}

const bodyOf = (root) => kid(root, 'w:body');

async function rejects(promise, code) {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof DocxError, 'DocxError expected, got ' + e);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail('expected DocxError ' + code);
}

/** Assert that the children of `node` come in ORDER[kind] order. */
function assertOrdered(node, kind) {
  const order = ORDER[kind];
  let last = -1;
  for (const c of kids(node)) {
    const i = order.indexOf(local(c.name));
    if (i < 0) continue;
    assert.ok(i >= last, kind + ': ' + c.name + ' out of order in ' +
      kids(node).map((x) => x.name).join(' '));
    last = i;
  }
}

describe('DocxWrite: newDoc', () => {
  for (const [paper, w, h] of [['a4', 11906, 16838],
    ['letter', 12240, 15840]]) {
    it('a new ' + paper + ' document reads back equal', async () => {
      const doc = newDoc({paper, date: DATE});
      assert.equal(doc.sections.length, 1);
      const s = doc.sections[0];
      assert.deepEqual(s.props.pgSz, {w, h});
      assert.deepEqual(s.props.pgMar, {top: 1440, right: 1440,
        bottom: 1440, left: 1440, header: 708, footer: 708, gutter: 0});
      assert.deepEqual(s.props.cols, {space: 708});
      assert.equal(paras(doc).length, 1);
      assert.equal(paras(doc)[0].text, '');
      assert.equal(doc.meta.conformance, 'transitional');
      const t = doc.styles;
      assert.deepEqual(t.docDefaults.rPr.rFonts, {ascii: 'Calibri',
        hAnsi: 'Calibri', eastAsia: 'Calibri', cs: 'Calibri'});
      assert.equal(t.docDefaults.rPr.sz, 22);
      assert.deepEqual(t.docDefaults.pPr.spacing, {after: 160, line: 259,
        lineRule: 'auto'});
      for (const id of ['Normal', 'Heading1', 'Heading6', 'Title',
        'DefaultParagraphFont', 'ListParagraph']) {
        assert.ok(t.styles.has(id), id);
      }
      const bytes = await write(doc);
      const back = await readDocx(bytes);
      assertSameDoc(back, doc, paper);
      const x = await xmlEntries(bytes);
      assert.deepEqual([...x.keys()].sort(), ['[Content_Types].xml',
        '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml',
        'word/_rels/document.xml.rels', 'word/document.xml',
        'word/settings.xml', 'word/styles.xml']);
      const core = await entryText(bytes, 'docProps/core.xml');
      assert.match(core, new RegExp('<dcterms:created xsi:type="' +
        'dcterms:W3CDTF">' + DATE.toISOString().slice(0, 19)));
      const body = bodyOf(x.get('word/document.xml').root);
      const last = body.children[body.children.length - 1];
      assert.equal(last.name, 'w:sectPr');
      assertOrdered(last, 'sectPr');
    });
  }

  it('newDoc settings ask for Word 2013+ mode (no Compatibility Mode)',
    async () => {
      const root = await docTree(await write(newDoc()), 'word/settings.xml');
      assert.deepEqual(kids(root).map((c) => c.name),
        ['w:zoom', 'w:compat']);
      const cs = kid(kid(root, 'w:compat'), 'w:compatSetting');
      assert.deepEqual(cs.attrs, [['w:name', 'compatibilityMode'],
        ['w:uri', 'http://schemas.microsoft.com/office/word'],
        ['w:val', '15']]);
    });

  it('newDoc defaults to A4 and gives fresh objects', () => {
    const a = newDoc();
    const b = newDoc();
    assert.equal(a.sections[0].props.pgSz.w, 11906);
    assert.notEqual(a.styles, b.styles);
    assert.notEqual(a.sections[0], b.sections[0]);
  });

  it('a Model emptyDoc() can be written too', async () => {
    const back = await readDocx(await write(emptyDoc()));
    assert.equal(paras(back).length, 1);
    assert.ok(back.styles.styles.has('Normal'));
  });
});

describe('DocxWrite: package', () => {
  it('unknown parts are byte-identical; content types cover all',
    async () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
      const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8]);
      const bin = new Uint8Array([1, 2, 3]);
      const ct = '<?xml version="1.0"?><Types xmlns="http://schemas.' +
        'openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.' +
        'openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>';
      const doc = await fromXml(p(r('x')), {'[Content_Types].xml': ct,
        'word/media/image1.png': png, 'word/media/image2.jpeg': jpg,
        'word/embeddings/oleObject1.bin': bin, 'word/odd': bin});
      const bytes = await write(doc);
      const z = await entries(bytes);
      assert.deepEqual(z.get('word/media/image1.png'), png);
      assert.deepEqual(z.get('word/media/image2.jpeg'), jpg);
      assert.deepEqual(z.get('word/odd'), bin);
      const back = await readDocx(bytes);
      const {defaults, overrides} = back.meta.contentTypes;
      const defs = new Map(defaults);
      assert.equal(defs.get('png'), 'image/png');
      assert.equal(defs.get('jpeg'), 'image/jpeg');
      const ovs = new Map(overrides);
      assert.match(ovs.get('/word/document.xml'), /document\.main\+xml$/);
      for (const n of z.keys()) {
        if (n === '[Content_Types].xml') continue;
        const ext = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1)
          .toLowerCase() : null;
        assert.ok(ovs.has('/' + n) || (ext && defs.has(ext)),
          'content type for ' + n);
      }
      assert.equal([...z.keys()][0], '[Content_Types].xml');
    });

  it('zip order: content types, original order, then new parts',
    async () => {
      const doc = await fromXml(p(r('x')), {'a/one.xml': '<a/>',
        'b/two.xml': '<b/>'});
      const z = await entries(await write(doc));
      assert.deepEqual([...z.keys()], ['[Content_Types].xml',
        '_rels/.rels', 'word/document.xml', 'a/one.xml', 'b/two.xml',
        'word/_rels/document.xml.rels', 'word/styles.xml']);
    });

  it('a document without styles gets a styles part, typed and linked',
    async () => {
      const doc = await fromXml(p(r('x')), {}, {docRels: [
        ['rId1', REL('hyperlink'), 'http://e.invalid/', 'External'],
        ['rId2', REL('image'), 'media/x.png']]});
      assert.equal(doc.meta.stylesGenerated, true);
      const back = await readDocx(await write(doc));
      assert.equal(back.meta.stylesPart, 'word/styles.xml');
      assert.equal(back.meta.stylesGenerated, undefined);
      const ids = back.rels.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids.length, 3);
      assert.ok(new Map(back.meta.contentTypes.overrides)
        .get('/word/styles.xml').endsWith('styles+xml'));
      assert.ok(back.styles.styles.get('Heading1').raw);
    });

  it('relationships: ids unique, every reference present', async () => {
    const doc = await fromXml(p('<w:hyperlink r:id="rId7"><w:r><w:t>h' +
      '</w:t></w:r></w:hyperlink>'), {'word/styles.xml': STYLES},
    {docRels: [['rId7', REL('hyperlink'), 'http://e.invalid/a?b&c',
      'External']]});
    const bytes = await write(doc);
    const back = await readDocx(bytes);
    assert.deepEqual(back.rels, doc.rels);
    const h = back.rels.find((x) => x.id === 'rId7');
    assert.equal(h.target, 'http://e.invalid/a?b&c');
    assert.equal(h.mode, 'External');
  });

  it('writing twice gives the same bytes', async () => {
    const doc = await fromXml(p(r('x')) + '<w:tbl/>',
      {'word/styles.xml': STYLES});
    const a = await write(doc);
    const b = await write(doc);
    assert.deepEqual(a, b);
    assert.ok(a.length > 200);
  });

  it('a UTF-16 part is written as UTF-8 with a corrected declaration',
    async () => {
      const xml = '<?xml version="1.0" encoding="UTF-16" ' +
        'standalone="yes"?>\n<w:settings xmlns:w="' + W_NS + '">' +
        '<w:zoom w:percent="100"/></w:settings>';
      const u16 = new Uint8Array(2 + xml.length * 2);
      u16[0] = 0xff; u16[1] = 0xfe;
      for (let i = 0; i < xml.length; i++) {
        u16[2 + 2 * i] = xml.charCodeAt(i) & 255;
        u16[3 + 2 * i] = xml.charCodeAt(i) >> 8;
      }
      const doc = await fromXml(p(r('x')), {'word/settings.xml': u16});
      const bytes = await write(doc);
      const text = await entryText(bytes, 'word/settings.xml');
      assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8" ' +
        'standalone="yes"?>'), text.slice(0, 60));
      const back = await readDocx(bytes);
      assert.deepEqual(back.rawSettings, doc.rawSettings);
    });

  it('w bound to another namespace on the root -> unsupported',
    async () => {
      const doc = await fromXml(p(r('x')));
      doc.meta.documentRoot.attrs.push(['xmlns:w', 'urn:not-wml']);
      doc.meta.documentRoot.attrs.shift();
      await rejects(write(doc), 'unsupported');
    });

  it('an invalid model -> bad-model, nothing written', async () => {
    const doc = await fromXml(p(r('abc')));
    const q = paras(doc)[0];
    q.runs = [{start: 0, end: 2, rPr: {extra: []}}];
    const e = await rejects(write(doc), 'bad-model');
    assert.match(e.message, /section 0 block 0/);
    const d2 = newDoc();
    d2.sections[0].blocks[0].pPr.jc = 7;
    await rejects(write(d2), 'bad-model');
    const d3 = newDoc();
    d3.sections[0].blocks[0] = newPara('a\u0001b');
    await rejects(write(d3), 'bad-model');
  });
});

describe('DocxWrite: paragraphs and runs', () => {
  it('pPr and rPr children obey the schema order', async () => {
    const doc = await fromXml(p(r('x', '<w:vertAlign w:val="subscript"/>' +
      '<w:u w:val="single"/><w:highlight w:val="red"/><w:sz w:val="20"/>' +
      '<w:lang w:val="fr-FR"/><w:color w:val="00FF00"/><w:strike/>' +
      '<w:i/><w:b/><w:rFonts w:ascii="A"/><w:rStyle w:val="E"/>'),
    '<w:rPr><w:i/></w:rPr><w:outlineLvl w:val="1"/><w:jc w:val="both"/>' +
      '<w:ind w:left="1"/><w:spacing w:after="2"/><w:tabs/>' +
      '<w:numPr><w:numId w:val="1"/><w:ilvl w:val="0"/></w:numPr>' +
      '<w:pageBreakBefore w:val="0"/><w:keepLines/><w:keepNext/>' +
      '<w:pStyle w:val="H"/>'));
    const bytes = await write(doc);
    const wp = kid(bodyOf(await docTree(bytes)), 'w:p');
    const pPr = kid(wp, 'w:pPr');
    assertOrdered(pPr, 'pPr');
    assert.deepEqual(kids(pPr).map((c) => local(c.name)), ['pStyle',
      'keepNext', 'keepLines', 'pageBreakBefore', 'numPr', 'tabs',
      'spacing', 'ind', 'jc', 'outlineLvl', 'rPr']);
    assert.deepEqual(kids(kid(pPr, 'w:numPr')).map((c) => c.name),
      ['w:ilvl', 'w:numId']);
    const rPr = kid(kid(wp, 'w:r'), 'w:rPr');
    assertOrdered(rPr, 'rPr');
    assert.equal(kids(rPr)[0].name, 'w:rStyle');
    const back = await readDocx(bytes);
    assertSameDoc(back, doc);
    assert.deepEqual(paras(back)[0].pPr.extra.map((n) => n.name),
      ['w:rPr']);
    assert.deepEqual(paras(back)[0].pPr.tabs, []);
    assert.equal(paras(back)[0].pPr.pageBreakBefore, false);
  });

  it('text with markup characters, emoji, CJK, tabs, newlines, spaces',
    async () => {
      const d = new Document(newDoc());
      const s = '  a & b < c > d "e" \u{1F600}\u{20BB7}中文' +
        '\tx\ny  ';
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0, ins: s});
      const bytes = await write(d.doc);
      const back = await readDocx(bytes);
      assert.equal(paras(back)[0].text, s);
      assertSameDoc(back, d.doc);
      const xml = await entryText(bytes, 'word/document.xml');
      assert.match(xml, /a &amp; b &lt; c &gt; d/);
      assert.match(xml, /<w:tab\/>/);
      assert.match(xml, /<w:br\/>/);
    });

  it('xml:space="preserve" only where it is needed', async () => {
    const doc = await fromXml(p(r('plain') + r(' lead', '<w:b/>') +
      r('trail ', '<w:i/>') + r(' ', '<w:u w:val="single"/>') +
      r('in  side', '<w:strike/>')));
    const wp = kid(bodyOf(await docTree(await write(doc))), 'w:p');
    const ts = kids(wp, 'w:r').map((x) => kid(x, 'w:t'));
    const pres = ts.map((t) => t.attrs.some(([n, v]) =>
      n === 'xml:space' && v === 'preserve'));
    assert.deepEqual(ts.map((t) => t.children[0]),
      ['plain', ' lead', 'trail ', ' ', 'in  side']);
    assert.deepEqual(pres, [false, true, true, true, false]);
  });

  it('level p inlines go directly in w:p, level r inside a w:r',
    async () => {
      const doc = await fromXml(p(r('a') + '<w:hyperlink r:id="x">' +
        '<w:r><w:t>h</w:t></w:r></w:hyperlink><w:r><w:rPr><w:b/>' +
        '<w:sz w:val="30"/></w:rPr><w:t>b</w:t><w:drawing/>' +
        '<w:br w:type="page"/><w:instrText>I</w:instrText></w:r>'));
      const wp = kid(bodyOf(await docTree(await write(doc))), 'w:p');
      assert.deepEqual(kids(wp).map((c) => c.name),
        ['w:r', 'w:hyperlink', 'w:r']);
      const run = kids(wp)[2];
      assert.deepEqual(kids(run).map((c) => c.name),
        ['w:rPr', 'w:t', 'w:drawing', 'w:br', 'w:instrText']);
      assert.deepEqual(kids(kid(run, 'w:rPr')).map((c) => c.name),
        ['w:b', 'w:sz']);
    });

  it('an Opaque table is written unchanged', async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tr><w:tc><w:tcPr/>' + p(r('cell &amp; more')) +
      '<!--c--></w:tc></w:tr></w:tbl>';
    const doc = await fromXml(p(r('a')) + tbl + p(r('b')));
    const op = blocks(doc)[1];
    assert.equal(op.type, 'opaque');
    const xml = await entryText(await write(doc), 'word/document.xml');
    assert.ok(xml.includes(serialize(op.node)));
    assert.ok(xml.includes(tbl));
  });

  it('an edited document writes the edits and reads back equal',
    async () => {
      const doc = await fromXml(p(r('Hello world')) + p(r('second')),
        {'word/styles.xml': STYLES});
      const d = new Document(doc);
      d.apply({op: 'replaceText', block: [0, 0], at: 6, del: 5,
        ins: 'there'});
      d.apply({op: 'setProps', block: [0, 0], range: {start: 0, end: 5},
        rPr: {b: true}});
      d.apply({op: 'setProps', block: [0, 1], pPr: {jc: 'center'},
        pStyle: 'Heading1'});
      d.apply({op: 'splitBlock', block: [0, 1], at: 3});
      const bytes = await write(d.doc);
      const back = await readDocx(bytes);
      assert.deepEqual(paras(back).map((x) => x.text),
        ['Hello there', 'sec', 'ond']);
      assert.deepEqual(paras(back)[0].runs[0].rPr, {b: true, extra: []});
      assert.equal(paras(back)[1].pStyle, 'Heading1');
      assertSameDoc(back, d.doc);
    });
});

describe('DocxWrite: sections', () => {
  it('pPr/sectPr for a non-final section, body sectPr last', async () => {
    const doc = await fromXml(p(r('one')) + p(r('two'), '<w:sectPr ' +
      'w:rsidR="00B2"><w:cols w:space="720"/><w:pgSz w:w="12240" ' +
      'w:h="15840"/></w:sectPr>') + p(r('three')) +
      '<w:sectPr><w:titlePg/><w:pgSz w:w="15840" w:h="12240"/>' +
      '<w:headerReference w:type="default" r:id="rId3"/></w:sectPr>');
    const body = bodyOf(await docTree(await write(doc)));
    const ch = kids(body);
    assert.deepEqual(ch.map((c) => c.name),
      ['w:p', 'w:p', 'w:p', 'w:sectPr']);
    const s1 = kid(kid(ch[1], 'w:pPr'), 'w:sectPr');
    assert.deepEqual(s1.attrs, [['w:rsidR', '00B2']]);
    assertOrdered(s1, 'sectPr');
    assertOrdered(ch[3], 'sectPr');
    assert.equal(kids(ch[3])[0].name, 'w:headerReference');
    assert.equal(kid(ch[0], 'w:pPr'), undefined);
    assert.equal(kid(ch[2], 'w:pPr'), undefined);
  });

  it('an Opaque last block of a non-final section gets a paragraph',
    async () => {
      const doc = newDoc();
      const first = newSection();
      first.props = {pgSz: {w: 12240, h: 15840, orient: 'portrait'},
        cols: {num: 2, space: 300}, titlePg: true, extra: []};
      first.blocks.push(newPara('x'), {type: 'opaque', node:
        {name: 'w:tbl', attrs: [], children: []}});
      doc.sections.unshift(first);
      const bytes = await write(doc);
      const body = bodyOf(await docTree(bytes));
      const ch = kids(body);
      assert.deepEqual(ch.map((c) => c.name),
        ['w:p', 'w:tbl', 'w:p', 'w:p', 'w:sectPr']);
      const s1 = kid(kid(ch[2], 'w:pPr'), 'w:sectPr');
      assertOrdered(s1, 'sectPr');
      assert.deepEqual(kids(s1).map((c) => c.name),
        ['w:pgSz', 'w:cols', 'w:titlePg']);
      assert.equal(kids(ch[2]).length, 1, 'only the pPr');
      const all = JSON.stringify(body).split('"w:sectPr"').length - 1;
      assert.equal(all, 2, 'two sections, two sectPr');
      const back = await readDocx(bytes);
      assert.equal(back.sections.length, 2);
      assert.deepEqual(back.sections[0].props, first.props);
      assert.equal(back.sections[0].blocks.length, 3);
    });

  it('no sectPr in the original, none written', async () => {
    const doc = await fromXml(p(r('a')));
    const body = bodyOf(await docTree(await write(doc)));
    assert.deepEqual(kids(body).map((c) => c.name), ['w:p']);
  });

  it('a final section from the last paragraph stays there', async () => {
    const doc = await fromXml(p(r('a')) + p(r('b'),
      '<w:sectPr><w:titlePg/></w:sectPr>'));
    const body = bodyOf(await docTree(await write(doc)));
    assert.deepEqual(kids(body).map((c) => c.name), ['w:p', 'w:p']);
    assert.ok(kid(kid(kids(body)[1], 'w:pPr'), 'w:sectPr'));
  });

  it('edited section props are written from the fields', async () => {
    const doc = await fromXml(p(r('a')) + '<w:sectPr><w:pgSz ' +
      'w:w="1" w:h="2"/><w:docGrid w:linePitch="360"/></w:sectPr>');
    doc.sections[0].props = {...doc.sections[0].props,
      pgSz: {w: 11906, h: 16838}, pgMar: {top: 1, bottom: 2}};
    const back = await readDocx(await write(doc));
    assert.deepEqual(back.sections[0].props.pgSz, {w: 11906, h: 16838});
    assert.deepEqual(back.sections[0].props.pgMar, {top: 1, bottom: 2});
    assert.equal(back.sections[0].props.extra[0].name, 'w:docGrid');
  });
});

describe('DocxWrite: styles and Strict', () => {
  it('styles read from a file are written verbatim', async () => {
    const doc = await fromXml(p(r('x')), {'word/styles.xml': STYLES});
    const xml = await entryText(await write(doc), 'word/styles.xml');
    for (const s of doc.styles.styles.values()) {
      assert.ok(xml.includes(serialize(s.raw)), s.id);
    }
    assert.ok(xml.includes(serialize(doc.styles.docDefaultsRaw)));
    assert.ok(xml.includes(serialize(doc.styles.latent)));
    for (const n of doc.styles.extraStyles) {
      assert.ok(xml.includes(serialize(n)));
    }
  });

  it('built styles: children in CT_Style order', async () => {
    const doc = newDoc();
    const root = await docTree(await write(doc), 'word/styles.xml');
    const h1 = kids(root, 'w:style').find((s) => s.attrs.some(
      ([n, v]) => n === 'w:styleId' && v === 'Heading1'));
    assert.deepEqual(kids(h1).map((c) => c.name), ['w:name',
      'w:basedOn', 'w:next', 'w:uiPriority', 'w:qFormat', 'w:pPr',
      'w:rPr']);
    assert.equal(kids(root)[0].name, 'w:docDefaults');
    assertOrdered(kid(h1, 'w:pPr'), 'pPr');
  });

  it('a Strict document is written back as Strict', async () => {
    const doc = await readDocx(await strictDocx());
    assert.equal(doc.meta.conformance, 'strict');
    const bytes = await write(doc);
    const x = await xmlEntries(bytes);
    const root = x.get('word/document.xml').root;
    const ns = new Map(root.attrs);
    assert.equal(ns.get('xmlns:w'), STRICT_W_NS);
    assert.equal(ns.get('xmlns:r'), STRICT_R_NS);
    assert.equal(ns.get('w:conformance'), 'strict');
    const xml = await entryText(bytes, 'word/document.xml');
    assert.ok(!xml.includes('schemas.openxmlformats.org'), xml);
    assert.match(xml, /graphicData uri="http:\/\/purl\.oclc\.org\/ooxml\/drawingml\/picture"/);
    for (const n of ['word/styles.xml', 'word/settings.xml']) {
      assert.equal(new Map(x.get(n).root.attrs).get('xmlns:w'),
        STRICT_W_NS, n);
    }
    assert.match(await entryText(bytes, '_rels/.rels'),
      /purl\.oclc\.org\/ooxml\/officeDocument\/relationships\/officeDocument/);
    const back = await readDocx(bytes);
    assert.equal(back.meta.conformance, 'strict');
    assertSameDoc(back, doc);
    assert.equal(NS.w, W_NS);
  });
});

describe('DocxWrite: inlines', () => {
  it('br and tab inlines without a node', async () => {
    const doc = newDoc();
    doc.sections[0].blocks[0] = newPara('a' + OBJ + OBJ, {inlines: {
      1: {kind: 'br', level: 'r', brType: 'page'},
      2: {kind: 'tab', level: 'r'}}});
    const wp = kid(bodyOf(await docTree(await write(doc))), 'w:p');
    const run = kid(wp, 'w:r');
    assert.deepEqual(kids(run).map((c) => [c.name, c.attrs]), [
      ['w:t', []], ['w:br', [['w:type', 'page']]], ['w:tab', []]]);
  });

  it('a level p raw pPr first in the paragraph stays an inline',
    async () => {
      const doc = await fromXml('<w:p>' + r('a') + '<w:pPr/></w:p>');
      const d = new Document(doc);
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 1, ins: ''});
      const back = await readDocx(await write(d.doc));
      assertSameDoc(back, d.doc);
    });

  it('settings and numbering are written verbatim', async () => {
    const doc = await fromXml(p(r('x')), {'word/settings.xml':
      settingsXml('<w:zoom w:percent="90"/><!--k-->')});
    const back = await readDocx(await write(doc));
    assert.deepEqual(back.rawSettings, doc.rawSettings);
    assert.equal(stylesXml('').length > 0, true);
  });
});
