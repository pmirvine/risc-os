// ODT import, task 6: the body (spaces, tabs, breaks), lists and
// tables. Inputs are spec-derived fixtures (odt-helpers.mjs, from
// OpenDocument 1.3), not files from an office program. Every Doc
// read must pass the Model checks, write as .docx and read back
// equal; emit() hands the .docx to the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {makeOdt} from './odt-helpers.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const read = (o, opts = {}) => readOdt(makeOdt(o), {date: DATE,
  ...opts});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const tables = (doc) => blocks(doc).filter((b) => b.type === 'tbl');

async function roundTrips(doc, what) {
  for (const b of blocks(doc)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('odt-body-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

const go = async (o, what, opts) => {
  const r = await read(o, opts);
  await roundTrips(r.doc, what);
  return r;
};
const P = (t, extra = '') => `<text:p${extra}>${t}</text:p>`;
const num = (p) => p.pPr && p.pPr.numPr;

const BULLETS = '<text:list-style style:name="L1">' +
  '<text:list-level-style-bullet text:level="1" ' +
  'text:bullet-char="-"><style:list-level-properties ' +
  'text:space-before="0.5cm" text:min-label-width="0.5cm"/>' +
  '</text:list-level-style-bullet></text:list-style>';
const NUMBERED = '<text:list-style style:name="L2">' +
  '<text:list-level-style-number text:level="1" ' +
  'style:num-format="1" style:num-suffix=")" text:start-value="3">' +
  '<style:list-level-properties><style:list-level-label-alignment ' +
  'text:label-followed-by="listtab" fo:text-indent="-0.6cm" ' +
  'fo:margin-left="1.2cm"/></style:list-level-properties>' +
  '</text:list-level-style-number>' +
  '<text:list-level-style-number text:level="2" ' +
  'style:num-format="a" style:num-suffix="." text:display-levels="2"/>' +
  '<text:list-level-style-number text:level="3" ' +
  'style:num-format="I"/></text:list-style>';

describe('ODT body: spaces, tabs and breaks', () => {
  it('spaces tabs and line breaks keep their count', async () => {
    const {doc, notes} = await go({content: P(
      'a<text:s text:c="3"/>b<text:tab/>c<text:line-break/>d' +
      '<text:s/>e<text:soft-page-break/>f<text:s text:c="0"/>g')},
    'spaces');
    assert.equal(paras(doc)[0].text, 'a   b\tc\nd ef' + 'g');
    assert.deepEqual(notes, []);
  });

  it('a repeated-spaces count of a billion is capped with a note',
    async () => {
      const {doc, notes} = await go({content: P('a<text:s ' +
        'text:c="1000000000"/>b')}, 'billion spaces');
      assert.equal(paras(doc)[0].text.length, 10002);
      assert.ok(notes.some((n) => n.includes('10000')), notes.join());
    });

  it('20000 runs of 10000 spaces stay within the budget', async () => {
    const n = 20000;
    const paras20 = P('<text:s text:c="10000"/>'.repeat(n));
    const t0 = Date.now();
    const one = await read({content: paras20});
    const len = (d) => paras(d).reduce((a, p) => a + p.text.length, 0);
    assert.ok(len(one.doc) <= 100000 + n, String(len(one.doc)));
    assert.equal(one.notes.filter((x) => x.includes('shortened'))
      .length, 1);
    const many = await read({content: Array.from({length: 30}, () =>
      P('<text:s text:c="10000"/>'.repeat(40))).join('')});
    assert.ok(len(many.doc) <= 1000000 + 30 * 40, String(len(many.doc)));
    assert.ok(many.notes.some((x) => x.includes('shortened')));
    assert.ok(Date.now() - t0 < 5000);
  });

  it('several hundred ordinary text:s are unaffected', async () => {
    const {doc, notes} = await go({content: Array.from({length: 300},
      () => P('a<text:s text:c="4"/>b')).join('')}, 'many spaces');
    assert.ok(paras(doc).every((p) => p.text === 'a    b'));
    assert.deepEqual(notes, []);
  });

  it('a trailing break-after in a table does not leak out', async () => {
    const auto = '<style:style style:name="PA" ' +
      'style:family="paragraph"><style:paragraph-properties ' +
      'fo:break-after="page"/></style:style>';
    const {doc} = await go({auto, content: tbl(cols(1) +
      row('<table:table-cell>' + P('in', ' text:style-name="PA"') +
      '</table:table-cell>')) + P('out')}, 'break in table');
    assert.equal(paras(doc)[0].pPr.pageBreakBefore, undefined);
  });

  it('a bad text:s count is one space or capped', async () => {
    for (const [c, len] of [['NaN', 3], ['-1', 3], ['', 3], ['2.5', 3],
      ['abc', 3], ['1e30', 3], ['99999999999999999999', 10002], ['Infinity', 3], ['0x10', 3]]) {
      const {doc} = await read({content: P(
        `a<text:s text:c="${c}"/>b`)});
      assert.equal(paras(doc)[0].text.length, len, c);
    }
  });

  it('a page break after and a column break before', async () => {
    const auto = '<style:style style:name="PA" ' +
      'style:family="paragraph"><style:paragraph-properties ' +
      'fo:break-after="page"/></style:style>' +
      '<style:style style:name="PB" style:family="paragraph">' +
      '<style:paragraph-properties fo:break-before="column"/>' +
      '</style:style>' +
      '<style:style style:name="PC" style:family="paragraph">' +
      '<style:paragraph-properties fo:break-before="page"/>' +
      '</style:style>';
    const {doc} = await go({auto, content: P('one', ' text:style-name' +
      '="PA"') + P('two') + P('three', ' text:style-name="PB"') +
      P('four', ' text:style-name="PC"')}, 'breaks');
    const ps = paras(doc);
    assert.equal(ps[1].pPr.pageBreakBefore, true);
    assert.equal(ps[2].inlines[0].brType, 'column');
    assert.equal(ps[2].text[1], 'three'[0]);
    assert.equal(ps[3].pPr.pageBreakBefore, true);
  });
});

describe('ODT body: lists', () => {
  it('a bulleted list and a numbered list with start value',
    async () => {
      const {doc, notes} = await go({styles: BULLETS + NUMBERED,
        content: '<text:list text:style-name="L1"><text:list-item>' +
        P('one') + '</text:list-item><text:list-item>' + P('two') +
        '</text:list-item></text:list>' + P('plain') +
        '<text:list text:style-name="L2"><text:list-item>' +
        P('three') + '</text:list-item><text:list-item ' +
        'text:start-value="9">' + P('nine') + '</text:list-item>' +
        '</text:list>'}, 'lists');
      const ps = paras(doc);
      assert.equal(num(ps[0]).ilvl, 0);
      assert.equal(num(ps[0]).numId, num(ps[1]).numId);
      assert.equal(num(ps[2]), undefined);
      assert.notEqual(num(ps[3]).numId, num(ps[0]).numId);
      assert.notEqual(num(ps[4]).numId, num(ps[3]).numId, 'restart');
      const xml = JSON.stringify(doc.numbering.raw);
      for (const want of ['%1)', '"w:left","680"', '"w:hanging","340"',
        '"w:val","9"', 'startOverride', '%1.%2.', 'lowerLetter',
        '"w:val","-"']) assert.ok(xml.includes(want), want);
      assert.deepEqual(notes, []);
    });

  it('a nested list restarts after a paragraph', async () => {
    const item = (t, inner = '') => '<text:list-item>' + P(t) + inner +
      '</text:list-item>';
    const {doc} = await go({styles: NUMBERED, content:
      '<text:list text:style-name="L2">' + item('a', '<text:list>' +
        item('a1') + item('a2') + '</text:list>') + item('b') +
      '</text:list>' + P('between') + '<text:list ' +
      'text:style-name="L2">' + item('c') + '</text:list>' +
      '<text:list text:style-name="L2" text:continue-numbering=' +
      '"true">' + item('d') + '</text:list>'}, 'nested');
    const ps = paras(doc);
    assert.deepEqual(ps.map((p) => num(p) && num(p).ilvl),
      [0, 1, 1, 0, undefined, 0, 0]);
    assert.equal(num(ps[1]).numId, num(ps[0]).numId);
    assert.notEqual(num(ps[5]).numId, num(ps[0]).numId, 'restarted');
    assert.equal(num(ps[6]).numId, num(ps[5]).numId, 'continued');
  });

  it('a list item without a paragraph and a list header',
    async () => {
      const {doc} = await go({content: '<text:list><text:list-header>' +
        P('head') + '</text:list-header><text:list-item/>' +
        '<text:list-item><text:list><text:list-item/></text:list>' +
        '</text:list-item><text:list-item>' + P('x') +
        '</text:list-item></text:list>' + P('after')}, 'empty items');
      const ps = paras(doc);
      assert.equal(ps[0].text, 'head');
      assert.equal(num(ps[0]), undefined);
      assert.equal(num(ps[1]).ilvl, 0);
    });

  it('lists nested 12 deep are cut at 9 levels with a note',
    async () => {
      let x = '<text:list-item>' + P('deep') + '</text:list-item>';
      for (let i = 0; i < 11; i++) {
        x = '<text:list-item>' + P('l' + i) + '<text:list>' + x +
          '</text:list></text:list-item>';
      }
      const {doc, notes} = await go({content: '<text:list>' + x +
        '</text:list>'}, 'deep lists');
      const ps = paras(doc);
      assert.equal(ps.length, 12);
      assert.equal(Math.max(...ps.map((p) => num(p).ilvl)), 8);
      assert.ok(notes.some((n) => n.includes('9 deep')), notes.join());
    });

  it('a paragraph style that names a list style numbers outside a ' +
    'list; an outline style numbers headings', async () => {
    const styles = BULLETS + '<style:style style:name="Hd" ' +
      'style:family="paragraph" style:list-style-name="L1"/>' +
      '<text:outline-style style:name="Outline">' +
      '<text:outline-level-style text:level="1" ' +
      'style:num-format="1" style:num-suffix="."/>' +
      '</text:outline-style>';
    const {doc} = await go({styles, content: P('a', ' text:style-' +
      'name="Hd"') + '<text:h text:outline-level="1">T</text:h>' +
      '<text:h text:outline-level="2">U</text:h>'}, 'style lists');
    const ps = paras(doc);
    assert.ok(num(ps[0]) && num(ps[1]) && num(ps[2]));
    assert.equal(num(ps[2]).ilvl, 1);
  });

  it('a missing list style, huge start values and symbol bullets',
    async () => {
      const styles = '<text:list-style style:name="S">' +
        '<text:list-level-style-bullet text:level="1" ' +
        'text:bullet-char="l" ><style:text-properties ' +
        'style:font-name="Wingdings"/></text:list-level-style-bullet>' +
        '<text:list-level-style-bullet text:level="2" ' +
        'text:bullet-char=""><style:text-properties ' +
        'style:font-name="OpenSymbol"/></text:list-level-style-bullet>' +
        '<text:list-level-style-image text:level="3"/>' +
        '<text:list-level-style-number text:level="4" ' +
        'style:num-format="а" text:start-value="1e9"/>' +
        '<text:list-level-style-number text:level="12"/>' +
        '<text:list-level-style-number text:level="x"/></text:list-style>';
      const {doc, notes} = await go({styles, content:
        '<text:list text:style-name="S"><text:list-item ' +
        'text:start-value="1000000000">' + P('a') + '</text:list-item>' +
        '</text:list><text:list text:style-name="Nope">' +
        '<text:list-item>' + P('b') + '</text:list-item></text:list>'},
      'odd lists');
      assert.equal(paras(doc).length, 2);
      assert.ok(notes.some((n) => n.includes('not in the file')));
    });
});

const cellP = (t, a = '') => `<table:table-cell${a}>${P(t)}` +
  '</table:table-cell>';
const COVER = '<table:covered-table-cell/>';
const row = (...cs) => '<table:table-row>' + cs.join('') +
  '</table:table-row>';
const cols = (n, a = '') => `<table:table-column${a} ` +
  `table:number-columns-repeated="${n}"/>`;
const tbl = (inner, a = '') => `<table:table table:name="T"${a}>` +
  inner + '</table:table>';

describe('ODT body: tables', () => {
  it('a table with a column span and a row span passes ModelCheck',
    async () => {
      const {doc, notes} = await go({content: tbl(cols(3) +
        row(cellP('a', ' table:number-columns-spanned="2"'), COVER,
          cellP('b', ' table:number-rows-spanned="2"')) +
        row(cellP('c'), cellP('d'), COVER) + row(cellP('e'),
          cellP('f'), cellP('g')))}, 'spans');
      const t = tables(doc)[0];
      assert.equal(t.rows.length, 3);
      assert.equal(t.rows[0].cells.length, 2);
      assert.equal(t.rows[0].cells[0].tcPr.gridSpan, 2);
      assert.equal(t.rows[0].cells[1].tcPr.vMerge, 'restart');
      assert.equal(t.rows[1].cells[2].tcPr.vMerge, 'continue');
      assert.equal(t.rows[1].cells.length, 3);
      assert.deepEqual(notes, []);
    });

  it('repeated columns of 1e9 are capped', async () => {
    const {doc, notes} = await go({content: tbl(cols('1000000000') +
      row(cellP('a'), cellP('b')))}, 'billion columns');
    assert.equal(tables(doc)[0].grid.length, 63);
    assert.ok(notes.some((n) => n.includes('1000 columns')),
      notes.join());
  });

  it('repeated rows of 1e9 are capped', async () => {
    const {doc, notes} = await go({content: tbl(cols(1) +
      '<table:table-row table:number-rows-repeated="1000000000">' +
      cellP('r') + '</table:table-row>')}, 'billion rows');
    assert.equal(tables(doc)[0].rows.length, 1000);
    assert.ok(notes.some((n) => n.includes('repeated table rows')));
  });

  it('repeated cells and a spanned count larger than the grid',
    async () => {
      const {doc} = await go({content: tbl(cols(2) +
        row(cellP('a', ' table:number-columns-spanned="99999"'),
          COVER) + '<table:table-row><table:table-cell ' +
        'table:number-columns-repeated="1000000000"/>' +
        '</table:table-row>' + row(cellP('b', ' table:number-rows-' +
        'spanned="1000000000"'), cellP('c')))}, 'big spans');
      const t = tables(doc)[0];
      assert.equal(t.rows[0].cells[0].tcPr.gridSpan, 2);
      assert.ok(t.rows[1].cells.length <= 2);
    });

  it('a table in a table cell', async () => {
    const inner = tbl(cols(1) + row(cellP('in')));
    const {doc} = await go({content: tbl(cols(2) + row(
      '<table:table-cell>' + P('out') + inner + '</table:table-cell>',
      cellP('side'))) + P('after')}, 'nested table');
    const t = tables(doc)[0];
    assert.equal(t.rows[0].cells[0].blocks[1].type, 'tbl');
    assert.equal(t.rows[0].cells[0].blocks[2].type, 'p');
  });

  it('tables nested 12 deep are read at the Model depth', async () => {
    let x = cellP('core');
    for (let i = 0; i < 12; i++) {
      x = '<table:table-cell>' + tbl(cols(1) + row(x)) +
        '</table:table-cell>';
    }
    const {doc, notes} = await go({content: tbl(cols(1) + row(x))},
      'deep tables');
    assert.equal(tables(doc).length, 1);
    assert.ok(notes.some((n) => n.includes('deep')), notes.join());
  });

  it('a header row is marked tblHeader', async () => {
    const {doc} = await go({content: tbl(cols(2) +
      '<table:table-header-rows>' + row(cellP('h1'), cellP('h2')) +
      '</table:table-header-rows><table:table-rows>' +
      row(cellP('a'), cellP('b')) + '</table:table-rows>' +
      '<table:table-row-group>' + row(cellP('c'), cellP('d')) +
      '</table:table-row-group>')}, 'header row');
    const t = tables(doc)[0];
    assert.deepEqual(t.rows.map((r) => r.trPr.tblHeader), [true,
      undefined, undefined]);
  });

  it('cell borders, shading, alignment, widths and the table style',
    async () => {
      const auto = '<style:style style:name="Tb" ' +
        'style:family="table"><style:table-properties ' +
        'style:width="10cm" table:align="center"/></style:style>' +
        '<style:style style:name="Ca" style:family="table-column">' +
        '<style:table-column-properties style:column-width="4cm"/>' +
        '</style:style><style:style style:name="Cb" ' +
        'style:family="table-column"><style:table-column-properties ' +
        'style:rel-column-width="3*"/></style:style>' +
        '<style:style style:name="Rh" style:family="table-row">' +
        '<style:table-row-properties style:min-row-height="1cm"/>' +
        '</style:style>' +
        '<style:style style:name="Ce" style:family="table-cell">' +
        '<style:table-cell-properties fo:border="0.5pt solid ' +
        '#ff0000" fo:border-bottom="none" fo:background-color=' +
        '"#00ff00" style:vertical-align="middle"/></style:style>';
      const {doc} = await go({auto, content: tbl(cols(1,
        ' table:style-name="Ca"') + cols(1, ' table:style-name="Cb"') +
        '<table:table-row table:style-name="Rh">' +
        cellP('x', ' table:style-name="Ce"') + cellP('y') +
        '</table:table-row>', ' table:style-name="Tb"')}, 'cell props');
      const t = tables(doc)[0];
      const c = t.rows[0].cells[0].tcPr;
      assert.equal(c.shd.fill, '00FF00');
      assert.equal(c.vAlign, 'center');
      assert.equal(c.tcBorders.top.color, 'FF0000');
      assert.equal(c.tcBorders.bottom.val, 'none');
      assert.equal(t.tblPr.jc, 'center');
      assert.equal(t.tblPr.tblW.w, 5669);
      assert.equal(t.grid[0], 2268);
      assert.equal(t.rows[0].trPr.trHeight.hRule, 'atLeast');
    });

  it('zero columns, a covered cell with nothing to cover and a ' +
    'table with no rows', async () => {
    const {doc} = await go({content: tbl(row(COVER, cellP('a'))) +
      tbl('') + tbl(cols(0)) + P('end')}, 'odd tables');
    const t = tables(doc);
    assert.equal(t.length, 1);
    assert.equal(t[0].rows[0].cells.length, 2);
    assert.equal(t[0].rows[0].cells[0].tcPr.vMerge, undefined);
  });

  it('unsupported table children are one note per kind', async () => {
    const {notes} = await go({content: tbl(
      '<table:table-source/><table:table-source/><table:scenario/>' +
      cols(1) + row(cellP('a')))}, 'table sources');
    assert.equal(notes.filter((n) => n.includes('table-source'))
      .length, 1);
    assert.equal(notes.filter((n) => n.includes('scenario')).length,
      1);
  });

  it('a list in a table cell starts at level 1, and a table in a ' +
    'list item', async () => {
    const {doc} = await go({content: '<text:list><text:list-item>' +
      P('x') + '<text:list><text:list-item>' + tbl(cols(1) +
      row('<table:table-cell><text:list><text:list-item>' + P('c') +
      '</text:list-item></text:list></table:table-cell>')) +
      '</text:list-item></text:list></text:list-item></text:list>'},
    'lists and tables');
    const c = tables(doc)[0].rows[0].cells[0].blocks[0];
    assert.equal(c.pPr.numPr.ilvl, 0);
  });

  it('the paragraph cap stops the reader inside tables and lists',
    async () => {
      const rows = Array.from({length: 50}, () => row(cellP('r'),
        cellP('s'))).join('');
      const {doc, notes} = await read({content: '<text:list>' +
        Array.from({length: 20}, () => '<text:list-item>' + P('i') +
        '</text:list-item>').join('') + '</text:list>' +
        tbl(cols(2) + rows) + P('late')}, {maxParagraphs: 30});
      assert.ok(notes.some((n) => n.includes('more than 30')));
      assert.ok(paras(doc).length + tables(doc).length > 0);
      assert.ok(!JSON.stringify(doc.sections).includes('late'));
    });
});

describe('ODT tables found in the corpus (task 9)', () => {
  it('a soft page break between table rows is quiet', async () => {
    const {doc, notes} = await go({content: tbl(cols(1) + row(cellP('a')) +
      '<text:soft-page-break/>' + '<table:table-rows>' + row(cellP('b')) +
      '<text:soft-page-break/></table:table-rows>')}, 'soft break rows');
    assert.deepEqual(notes, []);
    assert.equal(tables(doc)[0].rows.length, 2);
  });
});
