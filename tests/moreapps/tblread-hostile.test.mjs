// TblScan / TblRead / TblWrite: the C1 review's fidelity fixes
// (review C1 part A, I1-I3, M2, M4): what is not understood in a
// table's property containers or namespaces, and rows wider than the
// column cap, keep the whole table Opaque (reasons stray, ns, span;
// R3), written back byte for byte; the writer uses each element's
// own namespace scope. Batch C1 fix wave.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope, scope} from '../../tools/moreapps/!Letters/Ns';
import {readTable, REASONS}
  from '../../tools/moreapps/!Letters/TblRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {MAX_COLS} from '../../tools/moreapps/!Letters/TblCheck';
import {p, r, W_NS} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx} from './tbl-fixtures.mjs';
import {xmlEntries} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const isEl = (c) => typeof c === 'object' && c.name !== undefined;
const OTHER = 'urn:other';

/** Parse a w:tbl string inside a w:body; {node, map}. */
function parseTbl(xml) {
  const body = parseXml(`<w:body xmlns:w="${W_NS}">${xml}</w:body>`)
    .root;
  return {node: body.children.find(isEl),
    map: scope(rootScope(body), body)};
}
const reason = (xml) => {
  const {node, map} = parseTbl(xml);
  return readTable(node, map).opaque;
};
const one = (cell = tc()) => tbl([tr([cell])]);

/** The first element of the main part's w:body, serialised. */
async function firstXml(bytes) {
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  const body = root.children.find((c) => isEl(c) && c.name === 'w:body');
  return serialize(body.children.find(isEl));
}

/** The table in a document: Opaque, and written byte for byte. */
async function opaqueBack(xml) {
  const bytes = await tblDocx(xml + p(r('after')));
  const doc = await readDocx(bytes);
  const b = doc.sections[0].blocks[0];
  assert.equal(b.type, 'opaque', 'typed: ' + xml);
  const out = await writeDocx(doc, {date: DATE});
  assert.equal(await firstXml(out), await firstXml(bytes));
}

describe('R3: the new reasons ns and tail come after the others', () => {
  it('REASONS', () => {
    assert.deepEqual(REASONS, ['tracked', 'wrapped', 'hMerge', 'grid',
      'span', 'sectPr', 'propAttrs', 'order', 'stray', 'empty', 'ns',
      'tail']);
  });
});

describe('stray: no comment, PI or text in tblPr / trPr / tcPr (I1)',
  () => {
    const cases = {
      'a comment in w:tblPr': tbl([tr([tc()])], {tblPr: '<!--keep me-->' +
        '<w:tblW w:w="0" w:type="auto"/>'}),
      'text in w:tcPr': one(tc(p(), {tcPr: 'junk<w:tcW w:w="5" ' +
        'w:type="dxa"/>'})),
      'a PI in w:trPr': tbl([tr([tc()], {trPr: '<?pi x?><w:cantSplit/>'})]),
      'a comment in w:tcPr': one(tc(p(), {tcPr: '<w:noWrap/><!--c-->'})),
    };
    for (const [what, xml] of Object.entries(cases)) {
      it(what + ': Opaque stray, written byte for byte', async () => {
        assert.equal(reason(xml), 'stray');
        await opaqueBack(xml);
      });
    }
    it('blank text between property children still types', () => {
      const xml = tbl([tr([tc(p(), {tcPr: '\n <w:noWrap/>\n'})],
        {trPr: ' <w:cantSplit/> '})], {tblPr: '\n<w:tblW w:w="0" ' +
        'w:type="auto"/>\n'});
      assert.equal(reason(xml), undefined);
    });
  });

describe('ns: no table element re-declares the prefix w (I2)', () => {
  const D = `xmlns="${W_NS}" xmlns:w="${OTHER}"`;
  const cases = {
    'w:tbl': `<tbl ${D} xmlns:q="${W_NS}"><tblPr/><tblGrid>` +
      '<gridCol q:w="5"/></tblGrid><tr><tc><p/></tc></tr></tbl>',
    'w:tr': tbl([`<tr ${D}><tc><p/></tc></tr>`], {grid: [2000]}),
    'w:tc': tbl([tr([`<tc ${D}><p/></tc>`])], {grid: [2000]}),
    'w:tblGrid': tbl([tr([tc()])]).replace(/<w:tblGrid>.*<\/w:tblGrid>/,
      `<tblGrid ${D} xmlns:q="${W_NS}"><gridCol q:w="5"/></tblGrid>`),
    'a cell w:p': one(`<w:tc><p ${D}/></w:tc>`),
    'w re-declared as WML': tbl([tr([tc()])]).replace('<w:tbl>',
      `<w:tbl xmlns:w="${W_NS}">`),
  };
  for (const [what, xml] of Object.entries(cases)) {
    it(what + ': Opaque ns, written byte for byte', async () => {
      assert.equal(reason(xml), 'ns');
      await opaqueBack(xml);
    });
  }
  it('other prefixes bound to WML still type', () => {
    const xml = `<w:tbl xmlns:x="${W_NS}"><x:tblPr/><w:tblGrid>` +
      '<w:gridCol w:w="5"/></w:tblGrid><x:tr><w:tc><x:p/></w:tc>' +
      '</x:tr></w:tbl>';
    assert.equal(reason(xml), undefined);
  });
});

describe('span: a row is at most MAX_COLS grid columns wide (I3)', () => {
  const g63 = Array(MAX_COLS).fill(100);
  const cells = (n) => Array.from({length: n}, () => tc());
  it('64 cells on a 63-column grid', async () => {
    const xml = tbl([tr(cells(64))], {grid: g63});
    assert.equal(reason(xml), 'span');
    await opaqueBack(xml);
  });
  it('grid 1, gridBefore / gridSpan / gridAfter 63 each', async () => {
    const xml = tbl([tr([tc(p(), {tcPr: '<w:gridSpan w:val="63"/>'})],
      {trPr: '<w:gridBefore w:val="63"/><w:gridAfter w:val="63"/>'})],
    {grid: [2000]});
    assert.equal(reason(xml), 'span');
    await opaqueBack(xml);
  });
  it('thousands of cells in a row on a 1-column grid', () => {
    const t0 = performance.now();
    assert.equal(reason(tbl([tr(cells(5000))], {grid: [2000]})), 'span');
    assert.ok(performance.now() - t0 < 2000);
  });
  it('a row exactly 63 wide types, past a 1-column grid (D2)', () => {
    const xml = tbl([tr([tc(p(), {tcPr: '<w:gridSpan w:val="61"/>'})],
      {trPr: '<w:gridBefore w:val="1"/><w:gridAfter w:val="1"/>'}),
    tr(cells(MAX_COLS))], {grid: [2000]});
    assert.equal(reason(xml), undefined);
  });
});

describe('grid: w:gridCol w:w written as it was, or Opaque (M2)', () => {
  it('"-0" stays Opaque grid, byte for byte', async () => {
    const xml = tbl([tr([tc()])], {grid: ['-0']});
    assert.equal(reason(xml), 'grid');
    await opaqueBack(xml);
  });
  it('"0" types', () => {
    assert.equal(reason(tbl([tr([tc()])], {grid: ['0']})), undefined);
  });
});

describe('TblWrite: cell content in the cell\'s own scope (M4)', () => {
  it('a prefix bound on w:tc orders its tcPr children', async () => {
    const xml = tbl([tr([`<w:tc xmlns:x="${W_NS}"><w:tcPr>` +
      '<w:tcW w:w="5" w:type="dxa"/><x:shd x:val="clear" ' +
      'x:themeFill="accent1"/><w:vAlign w:val="center"/></w:tcPr>' +
      p(r('a')) + '</w:tc>'])]);
    const bytes = await tblDocx(xml);
    const doc = await readDocx(bytes);
    const t = doc.sections[0].blocks[0];
    assert.equal(t.type, 'tbl');
    checkBlock(t);
    const out = await writeDocx(doc, {date: DATE});
    const got = await firstXml(out);
    // in the document's scope x:shd would be an extension element,
    // moved to the extensions' slot behind w:vAlign
    assert.match(got, new RegExp('<w:tcPr><w:tcW w:w="5" ' +
      'w:type="dxa"/><x:shd [^>]*/><w:vAlign w:val="center"/></w:tcPr>'));
  });
});
