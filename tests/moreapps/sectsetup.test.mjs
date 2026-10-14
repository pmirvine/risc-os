// !Letters SectSetup (Batch D P4.3, D21): the Page setup box's commands.
// PAPERS; valuesOf (the sections in scope; mixed -> null); whyNot
// (ranges, a text width or height under 0.1 inch); setupCmd: Letter
// -> A4 on one section of three, Landscape swaps w and h and sets
// orient, 'all' changes every section, 'forward' splits at the caret
// (a next-page break) then changes the new and later sections, all
// one undo step and undo gives the opened doc deep-equal; mixed
// values left as they are; gutterAtTop written in settings.xml;
// refused values change nothing and make no step; untouched values
// keep their unit strings (review P1 M7) and changed ones are
// written in twips. The Layout box's (P4.4): layoutOf (the caret
// section's start, titlePg, header and footer distances, vAlign, and
// the document's evenAndOddHeaders); layoutCmd: Odd page writes type
// oddPage on the current section, vAlign bottom, a header distance of
// 0.3 in -> 432 twips (units kept for the rest, a raw pgMar edited in
// place), Different odd and even toggles settings, each one undo
// step; refused values change nothing. The Columns box's (P10.4,
// D23): presetOf (Left and Right as Word makes them: the narrow one
// a third of the text less two spacings, the wide one two narrow
// ones and a spacing); colsOf; columnsCmd writes cols as Word does
// (Two: num 2 space 720; Left: equalWidth 0 and two w:col; One:
// space only), one undo step, nothing changed no step; Number 46,
// a column under 0.5 inch, columns wider than the text refused;
// 'forward' splits at the caret with a continuous break. The Line
// numbers box's (P11.2, D24): lineNumOf (off: count by 1, start 1,
// Auto, restart each page; typed values; a raw lnNumType on, its
// values blank); lineNumCmd writes w:lnNumType as P1.2 types it
// (countBy always, start when not 1, distance unless Auto, restart
// unless newPage) on the current section only, adds the "Line
// Number" character style once if absent (Word's definition), one
// undo step; off removes it (a raw one too); Count by 0 refused and
// the other hostile values; nothing changed no step; a distance's
// unit kept while it is not changed; the saved file reads back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {PAPERS, paperOf, valuesOf, whyNot, setupWhy, setupCmd,
  layoutOf, layoutWhy, layoutCmd, PRESETS, presetOf, colsOf,
  columnsWhy, columnsCmd, lineNumOf, lineNumWhy, lineNumCmd}
  from '../../tools/moreapps/!Letters/SectSetup';
import {NEAR_TW} from '../../tools/moreapps/!Letters/PageValues';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {sectPrNode} from '../../tools/moreapps/!Letters/WriteProps';
import {onOffOf} from '../../tools/moreapps/!Letters/SettingsRead';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {W} from '../../tools/moreapps/!Letters/Ns';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, settingsXml, stylesXml, p, r,
  STRICT_W_NS,
  STRICT_R_NS} from './build-docx.mjs';

const MAR = '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
  'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>';
const LETTER = '<w:pgSz w:w="12240" w:h="15840"/>';
const sect = (inner = LETTER + MAR) => `<w:sectPr>${inner}</w:sectPr>`;

/** A Document of three sections (a, b / c, d / e, f), each `inner`. */
async function three(inners = [], settings = '') {
  const s = (k) => sect(inners[k]);
  const body = p(r('a')) + p(r('b'), s(0)) + p(r('c')) +
    p(r('d'), s(1)) + p(r('e')) + p(r('f')) + s(2);
  const parts = {'word/document.xml': documentXml(body)};
  if (settings !== null) parts['word/settings.xml'] = settingsXml(settings);
  const d = new Document(await readDocx(await buildDocx(parts)));
  d.clearHistory();
  return d;
}
const blocks = (d) => d.doc.sections.flatMap((x) => x.blocks);
const C = (d, k, off = 0) => S.caret({id: blockId(blocks(d)[k]), off});
const SEL = (d, k1, k2) => S.select({id: blockId(blocks(d)[k1]), off: 0},
  {id: blockId(blocks(d)[k2]), off: 1});
const sizes = (d) => d.doc.sections.map((x) => x.props.pgSz &&
  [x.props.pgSz.w, x.props.pgSz.h, x.props.pgSz.orient]);
const snap = (d) => structuredClone({s: d.doc.sections,
  t: d.doc.rawSettings});
const blank = (o = {}) => ({paper: null, w: null, h: null, orient: null,
  top: null, bottom: null, left: null, right: null, gutter: null,
  gutterTop: null, ...o});

/** setupCmd through typing.command: one undo step (or none), undo and
 *  redo exact against the doc before and after. */
function run(d, sel, values, scope) {
  const before = snap(d), n = d.undoDepth;
  const out = new Typing(d).command(() => setupCmd(d, sel, values, scope));
  if (d.undoDepth > n) {
    assert.equal(d.undoDepth, n + 1, 'one undo step');
    const after = snap(d);
    d.undo();
    assert.ok(deepEqual(snap(d), before), 'undo gives the doc deep-equal');
    d.redo();
    assert.ok(deepEqual(snap(d), after), 'redo exact');
  }
  return out;
}

describe('SectSetup: papers and values', () => {
  it('PAPERS, in twips, and paperOf either way round', () => {
    assert.deepEqual(PAPERS.map((x) => [x.name, x.w, x.h]), [
      ['A4', 11906, 16838], ['A5', 8391, 11906], ['A3', 16838, 23811],
      ['Letter', 12240, 15840], ['Legal', 12240, 20160],
      ['Executive', 10440, 15120], ['B5 (JIS)', 10319, 14571]]);
    assert.ok(Object.isFrozen(PAPERS));
    assert.equal(paperOf(12240, 15840), 'Letter');
    assert.equal(paperOf(15840, 12240), 'Letter');
    assert.equal(paperOf(11906, 16838), 'A4');
    assert.equal(paperOf(null, 16838), null);
  });
  it('paperOf: within NEAR_TW (7 twips, half a hundredth of an ' +
    'inch) of a paper is that paper (review P5 I1)', () => {
    assert.equal(NEAR_TW, 7);
    // every paper as a field shows it (1/100 inch) and reads it back
    const shown = (tw) => Math.round(Math.round(tw / 14.4) * 14.4);
    for (const x of PAPERS) {
      assert.equal(paperOf(shown(x.w), shown(x.h)), x.name, x.name);
      assert.equal(paperOf(shown(x.h), shown(x.w)), x.name, x.name);
    }
    assert.equal(paperOf(11909, 16834), 'A4');
    assert.equal(paperOf(16838 + 7, 23811 + 7), 'A3');
    assert.equal(paperOf(11906 + 7, 16838 - 7), 'A4');
    assert.equal(paperOf(11906 + 8, 16838), 'Custom');
    assert.equal(paperOf(11906, 16838 - 8), 'Custom');
    assert.equal(paperOf(NaN, 16838), 'Custom');
    assert.equal(paperOf(1e9, 1e9), 'Custom');
  });
  it('valuesOf: the caret section; mixed values null', async () => {
    const d = await three([undefined, '<w:pgSz w:w="11906" w:h="16838"/>' +
      MAR.replace('w:left="1440"', 'w:left="1800"')]);
    const v = valuesOf(d.doc, C(d, 0), 'section');
    assert.deepEqual(v, {paper: 'Letter', w: 12240, h: 15840,
      orient: 'portrait', top: 1440, bottom: 1440, left: 1440,
      right: 1440, gutter: 0, gutterTop: false});
    const all = valuesOf(d.doc, C(d, 0), 'all');
    assert.deepEqual(all, {...v, paper: null, w: null, h: null,
      left: null});
    const fw = valuesOf(d.doc, C(d, 2), 'forward');
    assert.deepEqual(fw, {...v, paper: null, w: null, h: null,
      left: null});
    assert.deepEqual(valuesOf(d.doc, C(d, 4), 'forward'), v);
    // a selection over two sections: both
    assert.deepEqual(valuesOf(d.doc, SEL(d, 1, 2), 'section'), all);
    assert.equal(valuesOf(d.doc, null, 'section'), null);
    assert.equal(valuesOf(d.doc, C(d, 0), '__proto__'), null);
  });
  it('valuesOf: landscape by orient or by w > h; defaults', async () => {
    const d = await three(['<w:pgSz w:w="15840" w:h="12240" ' +
      'w:orient="landscape"/>', '<w:pgSz w:w="15840" w:h="12240"/>', '']);
    assert.equal(valuesOf(d.doc, C(d, 0), 'section').orient, 'landscape');
    assert.equal(valuesOf(d.doc, C(d, 2), 'section').orient, 'landscape');
    const v = valuesOf(d.doc, C(d, 4), 'section');
    // no pgSz: the first section's; no pgMar: Word's defaults
    assert.deepEqual([v.w, v.h, v.top, v.left, v.gutter],
      [15840, 12240, 1440, 1440, 0]);
  });
});

describe('SectSetup: whyNot', () => {
  const ok = blank({w: 11906, h: 16838, top: 1440, bottom: 1440,
    left: 1440, right: 1440, gutter: 0, gutterTop: false});
  it('good values, and blanks, pass', () => {
    assert.equal(whyNot(ok), null);
    assert.equal(whyNot(blank()), null);
    assert.equal(whyNot({...ok, top: -1440, bottom: -720}), null);
  });
  it('ranges: 1..22 in for the page, 0..22 for margins', () => {
    for (const [k, v] of [['w', 1439], ['w', 31681], ['h', 0],
      ['h', -1440], ['w', NaN], ['w', 1e9], ['h', 1440.5],
      ['left', -1], ['right', 31681], ['gutter', -20],
      ['top', 31681], ['bottom', -31681], ['left', '1440'],
      ['orient', 'sideways'], ['gutterTop', 'yes']]) {
      assert.equal(typeof whyNot({...ok, [k]: v}), 'string', k + v);
    }
    assert.equal(whyNot({...ok, w: 1440, left: 0, right: 0}), null);
    assert.equal(whyNot({...ok, w: 31680, h: 31680}), null);
  });
  it('a text width or height under 0.1 inch', () => {
    const wide = whyNot({...ok, left: 8640, right: 8640});
    assert.match(wide, /0\.1 inch/);
    // 11906 - 1440 - 10322 = 144: just enough
    assert.equal(whyNot({...ok, right: 10322}), null);
    assert.equal(typeof whyNot({...ok, right: 10323}), 'string');
    assert.equal(typeof whyNot({...ok, gutter: 8883}), 'string');
    assert.equal(typeof whyNot({...ok, top: -8000, bottom: 8800}),
      'string');
    assert.equal(whyNot({...ok, gutter: 13814, gutterTop: true}), null);
    assert.equal(typeof whyNot({...ok, gutter: 13815, gutterTop: true}),
      'string');
  });
});

describe('SectSetup: setupCmd', () => {
  it('Letter -> A4 on one section of three', async () => {
    const d = await three();
    const sel = C(d, 2);
    const out = run(d, sel, blank({w: 11906, h: 16838}), 'section');
    assert.equal(out, sel);
    assert.deepEqual(sizes(d), [[12240, 15840, undefined],
      [11906, 16838, undefined], [12240, 15840, undefined]]);
    assert.equal(d.doc.sections[1].props.pgMar.left, 1440);
  });
  it('Landscape swaps w and h and sets orient', async () => {
    const d = await three();
    run(d, C(d, 0), blank({orient: 'landscape'}), 'section');
    assert.deepEqual(sizes(d)[0], [15840, 12240, 'landscape']);
    run(d, C(d, 0), blank({orient: 'portrait'}), 'section');
    assert.deepEqual(sizes(d)[0], [12240, 15840, undefined]);
    assert.ok(!('orient' in d.doc.sections[0].props.pgSz));
  });
  it("'all' changes every section", async () => {
    const d = await three();
    run(d, C(d, 2), blank({left: 1800, top: -1080}), 'all');
    for (const x of d.doc.sections) {
      assert.equal(x.props.pgMar.left, 1800);
      assert.equal(x.props.pgMar.top, -1080);
      assert.equal(x.props.pgMar.right, 1440);
    }
  });
  it("'forward' splits at the caret, then the new and later ones",
    async () => {
      const d = await three();
      const before = snap(d);
      const sel = C(d, 3, 0);            // start of d, in section 1
      const out = run(d, sel, blank({w: 11906, h: 16838}), 'forward');
      assert.equal(d.doc.sections.length, 4);
      assert.deepEqual(sizes(d).map((x) => x[0]),
        [12240, 12240, 11906, 11906]);
      assert.equal(d.doc.sections[2].props.type, 'nextPage');
      assert.notEqual(out, sel);
      assert.equal(out.head.id, blockId(d.doc.sections[2].blocks[0]));
      d.undo();
      assert.ok(deepEqual(snap(d), before));
    });
  it("'forward' at a section's start does not split", async () => {
    const d = await three();
    run(d, C(d, 2, 0), blank({left: 2000}), 'forward');
    assert.equal(d.doc.sections.length, 3);
    assert.deepEqual(d.doc.sections.map((x) => x.props.pgMar.left),
      [1440, 2000, 2000]);
  });
  it('mixed (null) values are left as they are', async () => {
    const d = await three([undefined, '<w:pgSz w:w="11906" ' +
      'w:h="16838"/>' + MAR.replace('w:right="1440"', 'w:right="900"')]);
    run(d, C(d, 0), blank({top: 2160}), 'all');
    assert.deepEqual(sizes(d).map((x) => x[0]), [12240, 11906, 12240]);
    assert.deepEqual(d.doc.sections.map((x) => x.props.pgMar.right),
      [1440, 900, 1440]);
    assert.deepEqual(d.doc.sections.map((x) => x.props.pgMar.top),
      [2160, 2160, 2160]);
  });
  it('nothing changed: no step, no split', async () => {
    const d = await three();
    const sel = C(d, 3, 0);
    const v = valuesOf(d.doc, sel, 'forward');
    assert.equal(run(d, sel, v, 'forward'), sel);
    assert.equal(run(d, sel, blank(), 'all'), sel);
    assert.equal(d.undoDepth, 0);
    assert.equal(d.doc.sections.length, 3);
  });
  it('gutterAtTop is written in settings.xml', async () => {
    const d = await three([], '<w:zoom w:percent="100"/>' +
      '<w:defaultTabStop w:val="720"/>');
    const t0 = d.doc.rawSettings;
    run(d, C(d, 0), blank({gutter: 720, gutterTop: true}), 'section');
    assert.equal(onOffOf(d.doc, 'gutterAtTop'), true);
    assert.notEqual(d.doc.rawSettings, t0);
    assert.equal(d.doc.sections[0].props.pgMar.gutter, 720);
    assert.equal(d.doc.sections[1].props.pgMar.gutter, 0);
    // the gutter position alone is one step too
    run(d, C(d, 0), blank({gutterTop: false}), 'section');
    assert.equal(onOffOf(d.doc, 'gutterAtTop'), false);
  });
  it('no settings part: the gutter position is refused', async () => {
    const d = await three([], null);
    const v = blank({gutterTop: true});
    assert.equal(typeof setupWhy(d.doc, C(d, 0), v, 'all'), 'string');
    assert.equal(run(d, C(d, 0), v, 'all'), null);
    assert.equal(d.undoDepth, 0);
  });
  it('refused: left 6 in + right 6 in on A4 (message, no change)',
    async () => {
      const d = await three(['<w:pgSz w:w="11906" w:h="16838"/>' + MAR]);
      const before = snap(d);
      const v = blank({left: 8640, right: 8640});
      assert.match(setupWhy(d.doc, C(d, 0), v, 'section'), /0\.1 inch/);
      assert.equal(run(d, C(d, 0), v, 'section'), null);
      assert.equal(d.undoDepth, 0);
      assert.ok(deepEqual(snap(d), before));
      // one margin a section cannot take refuses the whole command
      const w = blank({left: 5000});
      assert.equal(setupWhy(d.doc, C(d, 0), w, 'all'), null);
      // 5000 + 6800: A4 (section 0) too narrow, Letter not
      const x = blank({right: 6800, left: 5000});
      assert.equal(typeof setupWhy(d.doc, C(d, 0), x, 'all'), 'string');
      assert.equal(setupWhy(d.doc, C(d, 2), x, 'section'), null);
      assert.equal(typeof setupWhy(d.doc, C(d, 0), blank({w: 0}),
        'all'), 'string');
      assert.equal(typeof setupWhy(d.doc, null, blank(), 'all'),
        'string');
      assert.equal(typeof setupWhy(d.doc, C(d, 0), blank(), 'x'),
        'string');
    });
  it("'forward' with the caret in a table cell is refused", async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
      '<w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
    const body = p(r('a')) + tbl + p(r('b')) + sect();
    const d = new Document(await readDocx(await buildDocx(
      {'word/document.xml': documentXml(body)})));
    d.clearHistory();
    const cell = d.doc.sections[0].blocks[1].rows[0].cells[0].blocks[0];
    const sel = S.caret({id: blockId(cell), off: 1});
    const v = blank({left: 2000});
    assert.equal(typeof setupWhy(d.doc, sel, v, 'forward'), 'string');
    assert.equal(run(d, sel, v, 'forward'), null);
    // 'section' from a cell is fine
    run(d, sel, v, 'section');
    assert.equal(d.doc.sections[0].props.pgMar.left, 2000);
  });
});

describe('SectSetup: units kept for untouched values (P1 M7)', () => {
  const MAP = new Map([['w', W]]);
  const out = (sec) => serialize(sectPrNode({props: sec.props,
    raw: sec.raw}, MAP));
  it('a changed field in twips, the rest as read', async () => {
    const d = await three(['<w:pgSz w:w="612pt" w:h="11in"/>' +
      '<w:pgMar w:top="1in" w:right="72pt" w:bottom="2.54cm" ' +
      'w:left="1in" w:header="36pt" w:footer="720" w:gutter="0"/>']);
    assert.deepEqual(d.doc.sections[0].props.units, {pgSz: {w: '612pt',
      h: '11in'}, pgMar: {top: '1in', right: '72pt', bottom: '2.54cm',
      left: '1in', header: '36pt'}});
    run(d, C(d, 0), blank({left: 1800}), 'section');
    const x = out(d.doc.sections[0]);
    assert.match(x, /w:w="612pt" w:h="11in"/);
    assert.match(x, /w:top="1in" w:right="72pt" w:bottom="2\.54cm" w:left="1800" w:header="36pt"/);
    assert.deepEqual(d.doc.sections[0].props.units.pgMar, {top: '1in',
      right: '72pt', bottom: '2.54cm', header: '36pt'});
    // Landscape: both sizes changed, so both in twips; units.pgSz gone
    run(d, C(d, 0), blank({orient: 'landscape'}), 'section');
    assert.equal(d.doc.sections[0].props.units.pgSz, undefined);
    assert.match(out(d.doc.sections[0]),
      /w:w="15840" w:h="12240" w:orient="landscape"/);
  });
  // (review P4 M3: one rule with the Layout box, PageValues setPart)
  const rawOf = (sec, name) => {
    const n = (sec.props.extra || []).find((x) =>
      x.name.endsWith(name));
    return n && Object.fromEntries(n.attrs);
  };
  it('a raw pgSz keeps its unknown attributes; only the changed ' +
    'values are written in it', async () => {
    const d = await three(['<w:pgSz w:w="12240" w:h="15840" ' +
      'w:foo="1"/>' + MAR]);
    assert.equal(d.doc.sections[0].props.pgSz, undefined);
    run(d, C(d, 0), blank({w: 12240, h: 20160}), 'section');
    const sec = d.doc.sections[0];
    assert.equal(sec.props.pgSz, undefined);
    assert.deepEqual(rawOf(sec, 'pgSz'), {'w:w': '12240',
      'w:h': '20160', 'w:foo': '1'});
    assert.match(out(sec), /<w:pgSz w:w="12240" w:h="20160" w:foo="1"\/>/);
    // Landscape (the sizes given: a raw pgSz's values are not read,
    // the box shows the defaults) adds w:orient to it
    run(d, C(d, 0), blank({orient: 'landscape', w: 20160, h: 12240}),
      'section');
    assert.deepEqual(rawOf(d.doc.sections[0], 'pgSz'), {'w:w': '20160',
      'w:h': '12240', 'w:foo': '1', 'w:orient': 'landscape'});
  });
  it('a raw pgMar keeps its unknown attributes and the units of the ' +
    'values not changed', async () => {
    const d = await three([LETTER + '<w:pgMar w:top="1in" ' +
      'w:right="1440" w:bottom="1440" w:left="1440" w:header="720" ' +
      'w:footer="720" w:gutter="0" w:foo="1"/>']);
    assert.equal(d.doc.sections[0].props.pgMar, undefined);
    run(d, C(d, 0), blank({left: 2000}), 'section');
    const sec = d.doc.sections[0];
    assert.equal(sec.props.pgMar, undefined);
    assert.deepEqual(rawOf(sec, 'pgMar'), {'w:top': '1in',
      'w:right': '1440', 'w:bottom': '1440', 'w:left': '2000',
      'w:header': '720', 'w:footer': '720', 'w:gutter': '0',
      'w:foo': '1'});
  });
  it('an attribute of another namespace on pgSz is kept', async () => {
    const d = await three(['<w:pgSz w:w="12240" w:h="15840" ' +
      'w14:x="1" xmlns:w14="http://schemas.microsoft.com/office/' +
      'word/2010/wordml"/>' + MAR]);
    run(d, C(d, 0), blank({h: 20160}), 'section');
    const x = out(d.doc.sections[0]);
    assert.match(x, /w14:x="1"/);
    assert.match(x, /w:h="20160"/);
  });
});

describe('SectSetup: the Layout box (layoutCmd, P4.4)', () => {
  const lay = (o = {}) => ({type: null, titlePg: null, evenOdd: null,
    header: null, footer: null, vAlign: null, ...o});
  /** layoutCmd through typing.command, checked as run() does. */
  function runL(d, sel, values) {
    const before = snap(d), n = d.undoDepth;
    const out = new Typing(d).command(() => layoutCmd(d, sel, values));
    if (d.undoDepth > n) {
      assert.equal(d.undoDepth, n + 1, 'one undo step');
      const after = snap(d);
      d.undo();
      assert.ok(deepEqual(snap(d), before), 'undo deep-equal');
      d.redo();
      assert.ok(deepEqual(snap(d), after), 'redo exact');
    }
    return out;
  }
  it('layoutOf: the caret section; defaults; settings', async () => {
    const d = await three([undefined, '<w:titlePg/><w:vAlign ' +
      'w:val="center"/><w:type w:val="evenPage"/>' + LETTER +
      MAR.replace('w:header="720"', 'w:header="360"')],
    '<w:evenAndOddHeaders/>');
    assert.deepEqual(layoutOf(d.doc, C(d, 0)), {type: 'nextPage',
      titlePg: false, evenOdd: true, header: 720, footer: 720,
      vAlign: 'top'});
    assert.deepEqual(layoutOf(d.doc, C(d, 2)), {type: 'evenPage',
      titlePg: true, evenOdd: true, header: 360, footer: 720,
      vAlign: 'center'});
    // a selection: the section at its start
    assert.equal(layoutOf(d.doc, SEL(d, 2, 4)).type, 'evenPage');
    assert.equal(layoutOf(d.doc, null), null);
  });
  it('layoutOf: what is not understood reads null', async () => {
    const d = await three(['<w:type w:val="odd"/>' + LETTER +
      MAR.replace('w:gutter="0"', 'w:gutter="0" w:foo="1"')]);
    const v = layoutOf(d.doc, C(d, 0));
    assert.equal(v.type, null);
    assert.equal(v.header, null);
    assert.equal(v.footer, null);
    assert.equal(v.vAlign, 'top');
  });
  it('Odd page writes type oddPage on the current section', async () => {
    const d = await three();
    const sel = C(d, 2);
    assert.equal(runL(d, sel, lay({type: 'oddPage'})), sel);
    assert.deepEqual(d.doc.sections.map((x) => x.props.type),
      [undefined, 'oddPage', undefined]);
    const MAP = new Map([['w', W]]);
    const x = serialize(sectPrNode({props: d.doc.sections[1].props,
      raw: d.doc.sections[1].raw}, MAP));
    assert.match(x, /<w:type w:val="oddPage"\/>/);
  });
  it('a raw w:type is replaced when the start changes', async () => {
    const d = await three(['<w:type w:val="odd"/>' + LETTER + MAR]);
    runL(d, C(d, 0), lay({type: 'evenPage'}));
    const pr = d.doc.sections[0].props;
    assert.equal(pr.type, 'evenPage');
    assert.ok(!pr.extra.some((n) => /type$/.test(n.name)));
  });
  it('vAlign bottom; top drops it; titlePg on and off', async () => {
    const d = await three();
    runL(d, C(d, 0), lay({vAlign: 'bottom'}));
    assert.equal(d.doc.sections[0].props.vAlign, 'bottom');
    runL(d, C(d, 0), lay({vAlign: 'top'}));
    assert.ok(!('vAlign' in d.doc.sections[0].props));
    runL(d, C(d, 4), lay({titlePg: true}));
    assert.equal(d.doc.sections[2].props.titlePg, true);
    runL(d, C(d, 4), lay({titlePg: false}));
    assert.ok(!('titlePg' in d.doc.sections[2].props));
    assert.equal(d.undoDepth, 4);
  });
  it('header distance 0.3 in -> 432 twips; units kept', async () => {
    const d = await three(['<w:pgSz w:w="612pt" w:h="11in"/>' +
      '<w:pgMar w:top="1in" w:right="72pt" w:bottom="2.54cm" ' +
      'w:left="1in" w:header="36pt" w:footer="36pt" w:gutter="0"/>']);
    runL(d, C(d, 0), lay({header: 432}));
    const pr = d.doc.sections[0].props;
    assert.equal(pr.pgMar.header, 432);
    assert.equal(pr.pgMar.footer, 720);
    assert.deepEqual(pr.units.pgMar, {top: '1in', right: '72pt',
      bottom: '2.54cm', left: '1in', footer: '36pt'});
    const x = serialize(sectPrNode({props: pr, raw: d.doc.sections[0]
      .raw}, new Map([['w', W]])));
    assert.match(x, /w:header="432" w:footer="36pt"/);
    // no pgMar at all: one with every value
    const e = await three(['']);
    runL(e, C(e, 0), lay({footer: 1000}));
    assert.deepEqual(e.doc.sections[0].props.pgMar, {top: 1440,
      right: 1440, bottom: 1440, left: 1440, header: 720,
      footer: 1000, gutter: 0});
  });
  it('a raw pgMar keeps its unknown attributes', async () => {
    const d = await three([LETTER + MAR.replace('w:gutter="0"',
      'w:gutter="0" w:foo="1"')]);
    runL(d, C(d, 0), lay({header: 432}));
    const pr = d.doc.sections[0].props;
    assert.equal(pr.pgMar, undefined);
    const n = pr.extra.find((x) => /pgMar$/.test(x.name));
    const at = Object.fromEntries(n.attrs);
    assert.equal(at['w:header'], '432');
    assert.equal(at['w:foo'], '1');
    assert.equal(at['w:footer'], '720');
  });
  it('Different odd and even toggles settings', async () => {
    const d = await three([], '<w:zoom w:percent="100"/>' +
      '<w:defaultTabStop w:val="720"/>');
    runL(d, C(d, 0), lay({evenOdd: true}));
    assert.equal(onOffOf(d.doc, 'evenAndOddHeaders'), true);
    assert.deepEqual(d.doc.sections.map((x) => x.props.titlePg),
      [undefined, undefined, undefined]);
    runL(d, C(d, 0), lay({evenOdd: false}));
    assert.equal(onOffOf(d.doc, 'evenAndOddHeaders'), false);
    assert.equal(d.undoDepth, 2);
    // with a section change: still one step
    runL(d, C(d, 2), lay({evenOdd: true, type: 'continuous'}));
    assert.equal(d.undoDepth, 3);
    assert.equal(d.doc.sections[1].props.type, 'continuous');
  });
  it('nothing changed: no step; refused: nothing changed', async () => {
    const d = await three([], null);
    const sel = C(d, 0);
    assert.equal(runL(d, sel, layoutOf(d.doc, sel)), sel);
    assert.equal(runL(d, sel, lay()), sel);
    assert.equal(d.undoDepth, 0);
    const before = snap(d);
    for (const v of [{type: 'odd'}, {type: '__proto__'},
      {vAlign: 'middle'}, {header: -1}, {header: 31681},
      {footer: NaN}, {footer: 1e9}, {header: 1.5}, {titlePg: 'yes'},
      {evenOdd: true}, {header: 15840}]) {
      assert.equal(typeof layoutWhy(d.doc, sel, lay(v)), 'string',
        JSON.stringify(v));
      assert.equal(runL(d, sel, lay(v)), null);
    }
    assert.equal(typeof layoutWhy(d.doc, null, lay()), 'string');
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(snap(d), before));
    // turning it off where there is no settings part is no change
    assert.equal(layoutWhy(d.doc, sel, lay({evenOdd: false})), null);
  });
});

describe('SectSetup: the Columns box (columnsCmd, P10.4)', () => {
  // Letter, 1 inch margins: the text 9360 twips wide
  const runC = (d, sel, values, scope) => {
    const before = snap(d), n = d.undoDepth;
    const out = new Typing(d).command(() => columnsCmd(d, sel, values,
      scope));
    if (d.undoDepth > n) {
      assert.equal(d.undoDepth, n + 1, 'one undo step');
      const after = snap(d);
      d.undo();
      assert.ok(deepEqual(snap(d), before), 'undo deep-equal');
      d.redo();
      assert.ok(deepEqual(snap(d), after), 'redo exact');
    }
    return out;
  };
  const xmlOf = (d, s) => serialize(sectPrNode({props: d.doc.sections[s]
    .props, raw: d.doc.sections[s].raw}, new Map([['w', W]])));
  const colsXml = (d, s) => (xmlOf(d, s).match(/<w:cols[^>]*\/>|<w:cols.*?<\/w:cols>/)
    || [''])[0];
  const pre = (name, tw = 9360, sp = 720) => presetOf(name, tw, sp);
  const none = {num: null, equal: null, space: null, col: null,
    sep: null};
  it('PRESETS, and presetOf as Word makes them', () => {
    assert.deepEqual(PRESETS, ['one', 'two', 'three', 'left', 'right']);
    assert.ok(Object.isFrozen(PRESETS));
    assert.deepEqual(pre('two'), {num: 2, equal: true, space: 720,
      col: [{w: 4320, space: 720}, {w: 4320, space: 0}]});
    assert.deepEqual(pre('left'), {num: 2, equal: false, space: 720,
      col: [{w: 2640, space: 720}, {w: 6000, space: 0}]});
    // Word 12's Columns-Right.docx (A4, 1.25 in margins, 0.75 cm)
    assert.deepEqual(pre('right', 8306, 425).col, [{w: 5395, space: 425},
      {w: 2485, space: 0}]);
    // and columns1.docx's Left
    assert.deepEqual(pre('left', 8312, 425).col.map((c) => c.w),
      [2487, 5399]);
    assert.equal(pre('one').num, 1);
    assert.equal(pre('three').col.length, 3);
    assert.equal(presetOf('__proto__', 9360, 720), null);
  });
  it('Left and Right fit any text width: the narrow column is cut ' +
    'down to the twip (P14.1: on A4 with 1 inch margins, 9026 twips, ' +
    'the box refused them as wider than the text)', async () => {
    const A4 = '<w:pgSz w:w="11906" w:h="16838"/>' + MAR;
    for (const name of ['left', 'right']) {
      assert.deepEqual(pre(name, 9026).col.map((c) => c.w).sort(),
        [2528, 5776]);
      for (let tw = 2900; tw <= 9100; tw += 1) {
        const c = pre(name, tw).col;
        assert.ok(c[0].w + c[0].space + c[1].w <= tw, `${name} ${tw}`);
      }
      const d = await three([A4, A4, A4]);
      assert.ok(runC(d, C(d, 0), pre(name, 9026), 'section'), name);
      assert.equal(colsOf(d.doc, C(d, 0), 'section').preset, name);
    }
  });
  it('colsOf: the section in scope; mixed values null', async () => {
    const d = await three([LETTER + MAR + '<w:cols w:num="2" ' +
      'w:sep="1" w:space="360"/>', LETTER + MAR + '<w:cols w:num="2" ' +
      'w:space="720" w:equalWidth="0"><w:col w:w="2640" w:space="720"/>' +
      '<w:col w:w="6000"/></w:cols>']);
    assert.deepEqual(colsOf(d.doc, C(d, 0), 'section'), {num: 2,
      equal: true, space: 360, sep: true, textW: 9360, preset: 'two',
      col: [{w: 4500, space: 360}, {w: 4500, space: 0}]});
    assert.deepEqual(colsOf(d.doc, C(d, 2), 'section'), {num: 2,
      equal: false, space: 720, sep: false, textW: 9360, preset: 'left',
      col: [{w: 2640, space: 720}, {w: 6000, space: 0}]});
    const e = colsOf(d.doc, C(d, 4), 'section');
    assert.equal(e.num, 1);
    assert.equal(e.preset, 'one');
    const all = colsOf(d.doc, C(d, 0), 'all');
    assert.deepEqual([all.num, all.equal, all.space, all.sep, all.col],
      [null, null, null, null, null]);
    assert.equal(colsOf(d.doc, null, 'all'), null);
    assert.equal(colsOf(d.doc, C(d, 0), 'x'), null);
  });
  it('presets write cols as Word does, one undo step each',
    async () => {
      const d = await three();
      const sel = C(d, 0);
      assert.equal(runC(d, sel, pre('two'), 'section'), sel);
      assert.equal(colsXml(d, 0), '<w:cols w:num="2" w:space="720"/>');
      assert.equal(colsXml(d, 1), '');
      runC(d, sel, pre('left'), 'section');
      assert.equal(colsXml(d, 0), '<w:cols w:num="2" w:space="720" ' +
        'w:equalWidth="0"><w:col w:w="2640" w:space="720"/>' +
        '<w:col w:w="6000"/></w:cols>');
      runC(d, sel, pre('right'), 'section');
      assert.deepEqual(d.doc.sections[0].props.cols.col,
        [{w: 6000, space: 720}, {w: 2640}]);
      runC(d, sel, {...pre('three'), sep: true}, 'section');
      assert.equal(colsXml(d, 0),
        '<w:cols w:num="3" w:sep="1" w:space="720"/>');
      runC(d, sel, {...pre('one'), sep: false}, 'section');
      assert.equal(colsXml(d, 0), '<w:cols w:space="720"/>');
      assert.equal(d.undoDepth, 5);
    });
  it('typed widths, Line between alone, the whole document',
    async () => {
      const d = await three();
      runC(d, C(d, 2), {...none, num: 3, equal: false,
        col: [{w: 2000, space: 360}, {w: 3000, space: 500},
          {w: 3000, space: 0}]}, 'section');
      assert.deepEqual(d.doc.sections[1].props.cols, {num: 3,
        space: 720, equalWidth: false, col: [{w: 2000, space: 360},
          {w: 3000, space: 500}, {w: 3000}]});
      runC(d, C(d, 2), {...none, sep: true}, 'section');
      assert.equal(d.doc.sections[1].props.cols.sep, true);
      assert.equal(d.doc.sections[1].props.cols.col.length, 3);
      runC(d, C(d, 0), {...none, num: 2}, 'all');
      assert.deepEqual(d.doc.sections.map((x) => x.props.cols.num),
        [2, 2, 2]);
      // section 1 kept unequal: its widths split evenly, typed
      assert.equal(d.doc.sections[1].props.cols.equalWidth, false);
      assert.equal(d.undoDepth, 3);
    });
  it('columns with units (P10 fix I3, Strict files): shown as read; ' +
    'Line between alone keeps their number and spacing as written',
  async () => {
    for (const sp of ['18pt', '0.25in']) {
      const d = await three([LETTER + MAR +
        `<w:cols w:num="2" w:space="${sp}"/>`]);
      const sel = C(d, 0);
      const v = colsOf(d.doc, sel, 'section');
      assert.deepEqual([v.num, v.equal, v.space, v.preset],
        [2, true, 360, 'two']);
      runC(d, sel, {...none, sep: true}, 'section');
      assert.equal(colsXml(d, 0),
        `<w:cols w:num="2" w:sep="1" w:space="${sp}"/>`);
      // a spacing the box changes is written in twips
      runC(d, sel, {...none, space: 720}, 'section');
      assert.equal(colsXml(d, 0),
        '<w:cols w:num="2" w:sep="1" w:space="720"/>');
    }
    const d = await three([LETTER + MAR + '<w:cols w:num="2" ' +
      'w:space="0.5in" w:equalWidth="0"><w:col w:w="2in" ' +
      'w:space="0.5in"/><w:col w:w="4in"/></w:cols>']);
    runC(d, C(d, 0), {...none, sep: true}, 'section');
    assert.equal(colsXml(d, 0), '<w:cols w:num="2" w:sep="1" ' +
      'w:space="0.5in" w:equalWidth="0"><w:col w:w="2in" ' +
      'w:space="0.5in"/><w:col w:w="4in"/></w:cols>');
  });
  it('a Strict document of two columns 18pt apart (P10 fix I3): Line ' +
    'between alone, saved: still two columns 18pt apart', async () => {
    const z = await buildDocx({'word/document.xml': documentXml(p(r('a')) +
      p(r('b')) + '<w:sectPr><w:pgSz w:w="612pt" w:h="792pt"/>' +
      '<w:cols w:num="2" w:space="18pt"/></w:sectPr>', {ns: STRICT_W_NS,
      rNs: STRICT_R_NS, rootAttrs: ' w:conformance="strict"'})},
    {strict: true});
    const d = new Document(await readDocx(z));
    d.clearHistory();
    assert.equal(colsOf(d.doc, C(d, 0), 'all').num, 2);
    runC(d, C(d, 0), {...none, sep: true}, 'all');
    const out = await readZip(await writeDocx(d.doc, {date: new Date(0)}));
    const xml = new TextDecoder().decode(out.get('word/document.xml'));
    assert.ok(xml.includes('<w:cols w:num="2" w:sep="1" w:space="18pt"/>'),
      xml.slice(xml.indexOf('<w:sectPr')));
  });
  it('Line between alone on columns already narrower than 0.5 in ' +
    '(P10 fix M4): taken, the columns kept; a change of them still ' +
    'refused', async () => {
    const d = await three([LETTER + MAR + '<w:cols w:num="2" ' +
      'w:space="720" w:equalWidth="0"><w:col w:w="500" w:space="720"/>' +
      '<w:col w:w="8140"/></w:cols>', LETTER + MAR +
      '<w:cols w:num="13" w:space="720"/>']);
    for (const k of [0, 2]) {
      const sel = C(d, k);
      assert.equal(columnsWhy(d.doc, sel, {...none, sep: true},
        'section'), null);
      runC(d, sel, {...none, sep: true}, 'section');
    }
    assert.deepEqual(d.doc.sections[0].props.cols, {num: 2, sep: true,
      space: 720, equalWidth: false, col: [{w: 500, space: 720},
        {w: 8140}]});
    assert.deepEqual(d.doc.sections[1].props.cols, {num: 13, sep: true,
      space: 720});
    assert.equal(d.undoDepth, 2);
    assert.match(columnsWhy(d.doc, C(d, 0), {...none, space: 700},
      'section'), /0\.5 inch/);
    assert.match(columnsWhy(d.doc, C(d, 2), {...none, num: 13},
      'section'), /0\.5 inch/);
  });
  it('a w:cols still not understood (P10 fix I3): refused, kept',
    async () => {
      const e = await three([LETTER + MAR + '<w:cols w:num="2" ' +
        'w:foo="1"/>']);
      assert.equal(e.doc.sections[0].props.cols, undefined);
      const se = C(e, 0), before = snap(e);
      assert.equal(runC(e, se, none, 'section'), se);
      for (const v of [{...none, num: 3}, {...none, sep: true}]) {
        assert.match(columnsWhy(e.doc, se, v, 'section'),
          /cannot be changed here/);
        assert.equal(runC(e, se, v, 'section'), null);
        assert.match(columnsWhy(e.doc, se, v, 'all'),
          /cannot be changed here/);
      }
      assert.equal(e.undoDepth, 0);
      assert.ok(deepEqual(snap(e), before));
    });
  it('nothing changed: no step', async () => {
    const d = await three([LETTER + MAR + '<w:cols w:num="2"/>']);
    const sel = C(d, 0);
    assert.equal(runC(d, sel, none, 'all'), sel);
    const v = colsOf(d.doc, sel, 'section');
    assert.equal(runC(d, sel, v, 'section'), sel);
    assert.equal(runC(d, sel, {...none, num: 2, space: 720}, 'section'),
      sel);
    assert.equal(d.undoDepth, 0);
  });
  it('refused: Number 46, a column under 0.5 in, too wide', async () => {
    const d = await three();
    const sel = C(d, 0), before = snap(d);
    for (const n of [46, 0, -1, 1.5, NaN, 1e9, '2', '__proto__']) {
      assert.match(columnsWhy(d.doc, sel, {...none, num: n}, 'section'),
        /1 to 45/, String(n));
      assert.equal(runC(d, sel, {...none, num: n}, 'section'), null);
    }
    // 45 is a number Word takes, but not 45 columns of 9360 twips
    assert.doesNotMatch(columnsWhy(d.doc, sel, {...none, num: 45},
      'section'), /1 to 45/);
    assert.match(columnsWhy(d.doc, sel, {...none, num: 13}, 'section'),
      /0\.5 inch/);
    assert.equal(columnsWhy(d.doc, sel, {...none, num: 12, space: 0},
      'section'), null);
    const two = (w1, s1, w2) => ({...none, num: 2, equal: false,
      col: [{w: w1, space: s1}, {w: w2, space: 0}]});
    assert.match(columnsWhy(d.doc, sel, two(719, 720, 7000), 'section'),
      /0\.5 inch/);
    assert.equal(columnsWhy(d.doc, sel, two(720, 720, 7920), 'section'),
      null);
    assert.match(columnsWhy(d.doc, sel, two(720, 720, 7921), 'section'),
      /wider than the text/);
    for (const v of [two(1000, -1, 1000), two(1000, NaN, 1000),
      two(1e9, 0, 1000), {...none, num: 3, equal: false,
        col: [{w: 1000, space: 0}]}, {...none, col: '__proto__',
        equal: false, num: 2}, {...none, equal: 'yes'},
      {...none, sep: 1}, {...none, space: -720}, {...none, space: 1e9}]) {
      assert.equal(typeof columnsWhy(d.doc, sel, v, 'section'), 'string',
        JSON.stringify(v));
      assert.equal(runC(d, sel, v, 'section'), null);
    }
    assert.equal(typeof columnsWhy(d.doc, null, none, 'all'), 'string');
    assert.equal(typeof columnsWhy(d.doc, sel, none, 'x'), 'string');
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(snap(d), before));
  });
  it("'forward' splits at the caret with a continuous break",
    async () => {
      const d = await three();
      const before = snap(d);
      const sel = C(d, 3, 0);            // start of d, in section 1
      const out = runC(d, sel, pre('two'), 'forward');
      assert.equal(d.doc.sections.length, 4);
      assert.deepEqual(d.doc.sections.map((x) => x.props.cols &&
        x.props.cols.num), [undefined, undefined, 2, 2]);
      assert.equal(d.doc.sections[2].props.type, 'continuous');
      assert.equal(out.head.id, blockId(d.doc.sections[2].blocks[0]));
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.ok(deepEqual(snap(d), before));
      // at a section's start: no split
      runC(d, C(d, 2, 0), pre('three'), 'forward');
      assert.equal(d.doc.sections.length, 3);
      assert.deepEqual(d.doc.sections.map((x) => x.props.cols &&
        x.props.cols.num), [undefined, 3, 3]);
    });
});

describe('SectSetup: the Line numbers box (lineNumCmd, P11.2)', () => {
  const STY = '<w:style w:type="paragraph" w:default="1" ' +
    'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="character" w:default="1" ' +
    'w:styleId="DefaultParagraphFont"><w:name w:val="Default ' +
    'Paragraph Font"/></w:style>';
  /** Three sections (a, b / c, d / e, f), with a styles part. */
  async function threeS(inners = [], styles = STY) {
    const s = (k) => sect(inners[k]);
    const body = p(r('a')) + p(r('b'), s(0)) + p(r('c')) +
      p(r('d'), s(1)) + p(r('e')) + p(r('f')) + s(2);
    const d = new Document(await readDocx(await buildDocx({
      'word/document.xml': documentXml(body),
      'word/styles.xml': stylesXml(styles)})));
    d.clearHistory();
    return d;
  }
  const snapS = (d) => ({...snap(d), y: [...d.doc.styles.styles]});
  /** lineNumCmd through typing.command, checked as run() does. */
  function runN(d, sel, values) {
    const before = snapS(d), n = d.undoDepth;
    const out = new Typing(d).command(() => lineNumCmd(d, sel, values));
    if (d.undoDepth > n) {
      assert.equal(d.undoDepth, n + 1, 'one undo step');
      const after = snapS(d);
      d.undo();
      assert.ok(deepEqual(snapS(d), before), 'undo deep-equal');
      d.redo();
      assert.ok(deepEqual(snapS(d), after), 'redo exact');
    } else {
      assert.ok(deepEqual(snapS(d), before), 'no step: nothing changed');
    }
    return out;
  }
  const ln = (o = {}) => ({on: null, countBy: null, start: null,
    distance: null, restart: null, ...o});
  const xmlOf = (d, s) => serialize(sectPrNode({props: d.doc.sections[s]
    .props, raw: d.doc.sections[s].raw}, new Map([['w', W]])));
  const lnXml = (d, s) => (xmlOf(d, s).match(/<w:lnNumType[^>]*\/>/)
    || [''])[0];
  const LNS = (a) => LETTER + MAR + `<w:lnNumType ${a}/>`;

  it('lineNumOf: off, typed, and a raw lnNumType', async () => {
    const d = await threeS([undefined, LNS('w:countBy="5" w:start="3" ' +
      'w:distance="720" w:restart="newSection"'),
    LNS('w:countBy="2" w:foo="1"')]);
    assert.deepEqual(lineNumOf(d.doc, C(d, 0)), {on: false, countBy: 1,
      start: 1, distance: 'auto', restart: 'newPage'});
    assert.deepEqual(lineNumOf(d.doc, C(d, 2)), {on: true, countBy: 5,
      start: 3, distance: 720, restart: 'newSection'});
    assert.deepEqual(lineNumOf(d.doc, C(d, 4)), {on: true, countBy: null,
      start: null, distance: null, restart: null});
    assert.equal(lineNumOf(d.doc, null), null);
  });
  it('on: <w:lnNumType w:countBy="1"/> on the current section only, ' +
    'the Line Number style added, one undo step', async () => {
    const d = await threeS();
    const sel = C(d, 2);
    assert.equal(runN(d, sel, ln({on: true})), sel);
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(d.doc.sections.map((x) => x.props.lnNumType),
      [undefined, {countBy: 1}, undefined]);
    assert.equal(lnXml(d, 1), '<w:lnNumType w:countBy="1"/>');
    const st = d.doc.styles.styles.get('LineNumber');
    assert.equal(st.type, 'character');
    assert.equal(st.name, 'line number');
    assert.equal(st.basedOn, 'DefaultParagraphFont');
    assert.equal(st.uiPriority, 99);
    assert.equal(st.semiHidden, true);
    assert.equal(st.unhideWhenUsed, true);
    assert.deepEqual(lineNumOf(d.doc, sel), {on: true, countBy: 1,
      start: 1, distance: 'auto', restart: 'newPage'});
  });
  it('every value written as P1.2 types it', async () => {
    const d = await threeS();
    runN(d, C(d, 0), ln({on: true, countBy: 5, start: 3,
      distance: 720, restart: 'continuous'}));
    assert.deepEqual(d.doc.sections[0].props.lnNumType, {countBy: 5,
      start: 3, distance: 720, restart: 'continuous'});
    assert.equal(lnXml(d, 0), '<w:lnNumType w:countBy="5" w:start="3" ' +
      'w:distance="720" w:restart="continuous"/>');
    // start 1, Auto and Restart each page are Word's defaults: not written
    runN(d, C(d, 0), ln({start: 1, distance: 'auto',
      restart: 'newPage'}));
    assert.equal(lnXml(d, 0), '<w:lnNumType w:countBy="5"/>');
    assert.equal(d.undoDepth, 2);
    // the saved file reads back the same
    const back = await readDocx(await writeDocx(d.doc));
    assert.deepEqual(back.sections[0].props.lnNumType, {countBy: 5});
    assert.ok(back.styles.styles.has('LineNumber'));
  });
  it('off removes it, typed or raw; the style stays', async () => {
    const d = await threeS([LNS('w:countBy="3"'),
      LNS('w:countBy="2" w:foo="1"')]);
    runN(d, C(d, 0), ln({on: true, countBy: 4}));
    runN(d, C(d, 0), ln({on: false}));
    assert.ok(!('lnNumType' in d.doc.sections[0].props));
    assert.equal(lnXml(d, 0), '');
    runN(d, C(d, 2), ln({on: false}));
    assert.equal(lnXml(d, 1), '');
    assert.ok(!d.doc.sections[1].props.extra.some((n) =>
      /lnNumType$/.test(n.name)));
    assert.equal(d.undoDepth, 3);
    assert.ok(d.doc.styles.styles.has('LineNumber'));
    // off when it is off: no step
    runN(d, C(d, 4), ln({on: false}));
    assert.equal(d.undoDepth, 3);
  });
  it('the Line Number style is added once: an existing one is kept',
    async () => {
      const d = await threeS([], STY + '<w:style w:type="character" ' +
        'w:styleId="ZeilenNr"><w:name w:val="Line Number"/></w:style>');
      const was = d.doc.styles;
      runN(d, C(d, 0), ln({on: true}));
      assert.equal(d.doc.styles, was, 'no styles op');
      assert.ok(!d.doc.styles.styles.has('LineNumber'));
      const e = await threeS();
      runN(e, C(e, 0), ln({on: true}));
      const one = e.doc.styles;
      runN(e, C(e, 2), ln({on: true}));
      assert.equal(e.doc.styles, one, 'added once');
    });
  it('Count by 0 refused, and the other hostile values', async () => {
    const d = await threeS();
    const bad = [{countBy: 0}, {countBy: -1}, {countBy: 101},
      {countBy: 1.5}, {countBy: NaN}, {countBy: 1e9}, {countBy: '5'},
      {start: 0}, {start: -1}, {start: 32768}, {start: 1e9},
      {start: NaN}, {distance: -1}, {distance: 31681},
      {distance: 0.5}, {distance: NaN}, {distance: 'Auto'},
      {restart: 'never'}, {restart: '__proto__'}, {on: 'yes'},
      {on: 1}];
    for (const b of bad) {
      const v = ln({on: true, ...b});
      assert.ok(lineNumWhy(d.doc, C(d, 0), v), JSON.stringify(b));
      assert.equal(runN(d, C(d, 0), v), null, JSON.stringify(b));
    }
    assert.match(lineNumWhy(d.doc, C(d, 0), ln({on: true, countBy: 0})),
      /Count by: 1 to 100/);
    assert.equal(d.undoDepth, 0);
    assert.ok(!d.doc.sections[0].props.lnNumType);
    // at the caps
    assert.equal(lineNumWhy(d.doc, C(d, 0), ln({on: true, countBy: 100,
      start: 32767, distance: 31680})), null);
    assert.ok(lineNumWhy(d.doc, null, ln({on: true})));
    assert.equal(runN(d, null, ln({on: true})), null);
  });
  it('nothing changed: no step', async () => {
    const d = await threeS([LNS('w:countBy="5"')]);
    const sel = C(d, 0);
    assert.equal(runN(d, sel, ln()), sel);
    assert.equal(runN(d, sel, ln({on: true, countBy: 5, start: 1,
      distance: 'auto', restart: 'newPage'})), sel);
    assert.equal(runN(d, sel, ln({countBy: 5})), sel);
    assert.equal(d.undoDepth, 0);
  });
  it('values without on: taken only when numbering is on', async () => {
    const d = await threeS();
    // off, Count by given: not turned on
    runN(d, C(d, 0), ln({countBy: 3}));
    assert.ok(!d.doc.sections[0].props.lnNumType);
    assert.equal(d.undoDepth, 0);
  });
  it('a distance\'s unit kept while it is not changed', async () => {
    const d = await threeS([LNS('w:countBy="1" w:distance="0.5in"')]);
    assert.equal(lineNumOf(d.doc, C(d, 0)).distance, 720);
    runN(d, C(d, 0), ln({countBy: 2}));
    assert.equal(lnXml(d, 0), '<w:lnNumType w:countBy="2" ' +
      'w:distance="0.5in"/>');
    runN(d, C(d, 0), ln({distance: 360}));
    assert.equal(lnXml(d, 0), '<w:lnNumType w:countBy="2" ' +
      'w:distance="360"/>');
  });
  it('a raw lnNumType: values refused, off allowed', async () => {
    const d = await threeS([LNS('w:countBy="2" w:foo="1"')]);
    assert.match(lineNumWhy(d.doc, C(d, 0), ln({countBy: 3})),
      /cannot be changed here/);
    assert.equal(runN(d, C(d, 0), ln({countBy: 3})), null);
    assert.equal(lnXml(d, 0), '<w:lnNumType w:countBy="2" w:foo="1"/>');
    const sel = C(d, 0);
    assert.equal(runN(d, sel, ln({on: true})), sel);
    assert.equal(d.undoDepth, 0);
  });
});
