// RtfWrite (Batch G2, task 7): the writer core. A Doc -> RTF bytes
// (ASCII, deterministic) and the list of what RTF could not hold.
// The reader is the inverse: readRtf(writeRtf(doc).bytes) gives the
// same modelCore (./rtf-helpers.mjs) on text, runs and the covered
// properties. macOS textutil, where present, is an independent check
// of the text.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {LOST} from '../../tools/moreapps/!Letters/RtfLost';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara, newTable, newRow, newCell, OBJ}
  from '../../tools/moreapps/!Letters/Model';
import {newStyleTable, addStyle, setDefault}
  from '../../tools/moreapps/!Letters/Styles';
import {el} from '../../tools/moreapps/!WimpLib/Xml';
import {modelCore, assertSameCore} from './rtf-helpers.mjs';

const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const ascii = (bytes) => String.fromCharCode(...bytes);
const W = (doc) => {
  const r = writeRtf(doc);
  return {...r, s: ascii(r.bytes)};
};
const back = (doc) => readRtf(writeRtf(doc).bytes, {date: DATE}).doc;
const sameBack = (doc, what) =>
  assertSameCore(modelCore(back(doc)), modelCore(doc), what);

/** A doc from newDoc with these blocks in its one section. */
function docOf(blocks, opts = {}) {
  const d = newDoc({date: DATE, paper: opts.paper});
  d.sections[0].blocks = blocks;
  return d;
}

/** The smallest doc: one style, Arial 12 pt, A4. */
function tiny(blocks) {
  const t = newStyleTable();
  t.docDefaults = {rPr: {rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
    sz: 24, extra: []}, pPr: {extra: []}};
  addStyle(t, {id: 'Normal', type: 'paragraph', name: 'Normal'});
  setDefault(t, 'paragraph', 'Normal');
  return {sections: [{props: {pgSz: {w: 11906, h: 16838},
    pgMar: {top: 1440, right: 1440, bottom: 1440, left: 1440,
      header: 708, footer: 708, gutter: 0}, extra: []}, blocks,
  raw: null}], styles: t, numbering: null, parts: new Map(),
  rels: [], meta: {}, rawSettings: null, stories: new Map()};
}

/** A run group of text 'x' with these rPr, in a newDoc doc. */
const runRtf = (rPr) => W(docOf([newPara('x', {rPr})])).s;

describe('RtfWrite: the document', () => {
  it('a minimal document is exactly this', () => {
    const {s, lost} = W(tiny([newPara('Hello')]));
    assert.equal(s, '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
      '{\\fonttbl{\\f0\\fswiss\\fcharset0\\fprq2 Arial;}}\n' +
      '{\\colortbl;}\n' +
      '{\\*\\defchp\\fs24}\n' +
      '{\\stylesheet{\\widctlpar\\fs24 Normal;}}\n' +
      '\\paperw11906\\paperh16838\\margl1440\\margr1440' +
      '\\margt1440\\margb1440\n' +
      '\\sectd\\headery708\\footery708\n' +
      '\\pard\\plain\\widctlpar{\\fs24 Hello}\n}');
    assert.deepEqual(lost, []);
  });

  it('is ASCII, deterministic, has no NaN or undefined, and never ' +
    'changes the doc', () => {
    const d = docOf([newPara('caf\u00e9 \u2603 \ud83d\ude00',
      {rPr: {b: true, color: 'FF0000', extra: []}}),
    newPara('two', {pPr: {jc: 'center', extra: []}})]);
    const before = structuredClone(d);
    const a = W(d), b = W(d);
    assert.deepEqual(a.bytes, b.bytes);
    assert.ok([...a.bytes].every((x) => x < 0x80));
    assert.ok(!a.s.includes('NaN') && !a.s.includes('undefined'));
    assert.deepEqual(d, before);
  });

  it('non-ASCII text as \\uN? (signed; a surrogate pair is two)',
    () => {
      const {s} = W(tiny([newPara('caf\u00e9 \u2603 \ud83d\ude00 ' +
        '\\{}')]));
      assert.ok(s.includes('{\\fs24 caf\\u233? \\u9731? ' +
        '\\u-10179?\\u-8704? \\\\\\{\\}}'), s);
      assert.equal(back(tiny([newPara('caf\u00e9 \ud83d\ude00')]))
        .sections[0].blocks[0].text, 'caf\u00e9 \ud83d\ude00');
    });

  it('tabs, line breaks, page and column breaks', () => {
    const p = newPara('a\tb\nc' + OBJ + 'd' + OBJ + 'e', {inlines: {
      5: {kind: 'br', level: 'r', brType: 'page'},
      7: {kind: 'br', level: 'r', brType: 'column'}}});
    const {s, lost} = W(tiny([p]));
    assert.ok(s.includes('{\\fs24 a\\tab b\\line c\\page d\\column e}'),
      s);
    assert.deepEqual(lost, []);
    sameBack(docOf([p]));
  });

  it('empty paragraphs are kept, the last one too', () => {
    const d = tiny([newPara('a'), newPara(''), newPara('')]);
    const {s} = W(d);
    assert.ok(s.endsWith('{\\fs24 a}\\par\n\\pard\\plain\\widctlpar' +
      '\\fs24\\par\n\\pard\\plain\\widctlpar\\fs24\\par\n}'), s);
    assert.deepEqual(back(d).sections[0].blocks.map((b) => b.text),
      ['a', '', '']);
  });

  it('an empty paragraph keeps its style\'s character format on ' +
    'its mark', () => {
    const d = docOf([newPara('x'), newPara('', {pStyle: 'Heading1'})]);
    // Heading 1's Word 2013+ look: 16 pt in the accent colour
    assert.ok(W(d).s.includes('\\outlinelevel0\\fs32\\cf1\\par\n}'),
      W(d).s);
    sameBack(d);
  });

  it('a size that is no size is the document\'s default size', () => {
    const p = newPara('x', {rPr: {sz: 7.5, extra: []}});
    assert.ok(W(tiny([p])).s.includes('{\\fs24 x}'), W(tiny([p])).s);
  });

  it('\\info from the core properties (dates as given, UTC)', () => {
    const src = readRtf(new TextEncoder().encode('{\\rtf1{\\info' +
      '{\\title A \\{T\\}}{\\subject S}{\\author Ann}{\\keywords k}' +
      '{\\creatim\\yr2023\\mo2\\dy3\\hr4\\min5\\sec6}' +
      '{\\revtim\\yr2024\\mo12\\dy31\\hr23\\min59}}x}'),
    {date: DATE}).doc;
    const {s} = W(src);
    assert.ok(s.includes('{\\info{\\title A \\{T\\}}{\\subject S}' +
      '{\\author Ann}{\\keywords k}{\\operator Letters}' +
      '{\\creatim\\yr2023\\mo2\\dy3\\hr4\\min5\\sec6}' +
      '{\\revtim\\yr2024\\mo12\\dy31\\hr23\\min59\\sec0}}'), s);
    sameBack(src);
  });

  it('page size and margins from the first section; a section ' +
    'break; landscape', () => {
    const d = docOf([newPara('one')]);
    d.sections.push({props: {pgSz: {w: 16838, h: 11906,
      orient: 'landscape'}, pgMar: {top: 720, right: 720, bottom: 720,
      left: 720, header: 360, footer: 360, gutter: 0},
    type: 'nextPage', extra: []}, blocks: [newPara('two'),
      newPara('')], raw: null});
    const {s} = W(d);
    assert.ok(s.includes('\\paperw11906\\paperh16838\\margl1440' +
      '\\margr1440\\margt1440\\margb1440\n'), s);
    assert.ok(s.includes('{\\fs22 one}\\sect\n\\sectd\\sbkpage' +
      '\\lndscpsxn\\pgwsxn16838\\pghsxn11906\\marglsxn720' +
      '\\margrsxn720\\margtsxn720\\margbsxn720\\guttersxn0' +
      '\\headery360\\footery360\n'), s);
    sameBack(d);
    // a gutter in the first section only: the second keeps none
    const g = structuredClone(d);
    g.sections[0].props.pgMar.gutter = 720;
    sameBack(g, 'gutter');
  });
});

describe('RtfWrite: character formatting', () => {
  // [rPr, the run's group] (newDoc: Calibri 11 pt, font 0)
  const CASES = [
    [{b: true}, '{\\b\\fs22 x}'],
    [{i: true}, '{\\i\\fs22 x}'],
    [{strike: true}, '{\\strike\\fs22 x}'],
    [{u: 'single'}, '{\\ul\\fs22 x}'],
    [{u: 'double'}, '{\\uldb\\fs22 x}'],
    [{u: 'wave'}, '{\\ulwave\\fs22 x}'],
    [{sz: 32}, '{\\fs32 x}'],
    [{rFonts: {ascii: 'Courier New', hAnsi: 'Courier New'}},
      '{\\f1\\fs22 x}'],
    [{color: 'FF0000'}, '{\\fs22\\cf1 x}'],
    [{highlight: 'yellow'}, '{\\fs22\\highlight1 x}'],
    [{shd: {val: 'clear', color: 'auto', fill: '00FF00'}},
      '{\\fs22\\chcbpat1 x}'],
    [{vertAlign: 'superscript'}, '{\\fs22\\super x}'],
    [{vertAlign: 'subscript'}, '{\\fs22\\sub x}'],
    [{extra: [el('w:caps')]}, '{\\caps\\fs22 x}'],
    [{extra: [el('w:smallCaps')]}, '{\\scaps\\fs22 x}'],
    [{extra: [el('w:vanish')]}, '{\\v\\fs22 x}'],
    [{extra: [el('w:dstrike')]}, '{\\striked1\\fs22 x}'],
    [{extra: [el('w:position', [['w:val', '6']])]},
      '{\\fs22\\up6 x}'],
    [{extra: [el('w:position', [['w:val', '-4']])]},
      '{\\fs22\\dn4 x}'],
  ];
  for (const [rPr, want] of CASES) {
    it(JSON.stringify(rPr) + ' -> ' + want, () => {
      const r = {extra: [], ...rPr};
      assert.ok(runRtf(r).includes('\\pard\\plain\\sa160\\sl259' +
        '\\slmult1\\widctlpar' + want), runRtf(r));
      sameBack(docOf([newPara('x', {rPr: r})]));
    });
  }

  it('the font table: families, \\fprq, fonts in use only', () => {
    const d = docOf([newPara('ab', {runs: [
      {start: 0, end: 1, rPr: {rFonts: {ascii: 'Times New Roman'},
        extra: []}},
      {start: 1, end: 2, rPr: {rFonts: {ascii: 'My Font;{x}'},
        extra: []}}]})]);
    const {s} = W(d);
    assert.ok(s.includes('{\\fonttbl{\\f0\\fswiss\\fcharset0\\fprq2 ' +
      'Calibri;}{\\f1\\froman\\fcharset0\\fprq2 Times New Roman;}' +
      '{\\f2\\fnil\\fcharset0\\fprq2 My Font\\{x\\};}}'), s);
  });

  it('a style\'s formatting turned off in a run', () => {
    const p = newPara('Head', {pStyle: 'Heading1',
      rPr: {color: 'auto', sz: 22, extra: []}});
    sameBack(docOf([p]));
  });
});

describe('RtfWrite: paragraph formatting', () => {
  // [pPr, the paragraph's words after \pard\plain] (newDoc Normal)
  const CASES = [
    [{jc: 'center'}, '\\qc\\sa160\\sl259\\slmult1\\widctlpar{'],
    [{jc: 'right'}, '\\qr\\sa160'],
    [{jc: 'both'}, '\\qj\\sa160'],
    [{ind: {left: 720, right: 360, hanging: 360}},
      '\\li720\\ri360\\fi-360\\sa160'],
    [{ind: {firstLine: 283}}, '\\fi283\\sa160'],
    [{spacing: {before: 120, after: 0}}, '\\sb120\\sl259\\slmult1'],
    [{spacing: {line: 360, lineRule: 'exact'}},
      '\\sa160\\sl-360\\slmult0'],
    [{spacing: {line: 300, lineRule: 'atLeast'}},
      '\\sa160\\sl300\\slmult0'],
    [{spacing: {line: 240, lineRule: 'auto'}}, '\\sa160\\widctlpar'],
    [{keepNext: true, keepLines: true, pageBreakBefore: true},
      '\\slmult1\\widctlpar\\keep\\keepn\\pagebb{'],
    [{widowControl: false}, '\\slmult1\\nowidctlpar{'],
    [{contextualSpacing: true, suppressLineNumbers: true},
      '\\widctlpar\\contextualspace\\noline'],
    [{outlineLvl: 2}, '\\widctlpar\\outlinelevel2'],
    [{tabs: [{val: 'left', pos: 720}, {val: 'right', pos: 9000,
      leader: 'dot'}, {val: 'center', pos: 4000},
    {val: 'decimal', pos: 5000, leader: 'hyphen'},
    {val: 'bar', pos: 6000}]},
    '\\widctlpar\\tx720\\tqc\\tx4000\\tqdec\\tlhyph\\tx5000\\tb6000' +
      '\\tqr\\tldot\\tx9000{'],
    [{pBdr: {top: {val: 'single', sz: 4, space: 1, color: 'FF0000'},
      bottom: {val: 'double', sz: 12}, between: {val: 'dotted',
        sz: 8, shadow: true}}},
    '\\brdrt\\brdrs\\brdrw10\\brsp20\\brdrcf1' +
      '\\brdrb\\brdrdb\\brdrw30\\brdrbtw\\brdrdot\\brdrw20\\brdrsh{'],
    [{shd: {val: 'clear', color: 'auto', fill: 'FFFF00'}},
      '\\widctlpar\\cbpat1{'],
    [{shd: {val: 'pct25', color: '0000FF', fill: 'FFFF00'}},
      '\\widctlpar\\shading2500\\cfpat1\\cbpat2{'],
    [{shd: {val: 'solid', color: '0000FF', fill: 'auto'}},
      '\\widctlpar\\shading10000\\cfpat1{'],
  ];
  for (const [pPr, want] of CASES) {
    it(JSON.stringify(pPr), () => {
      const d = docOf([newPara('x', {pPr: {extra: [], ...pPr}})]);
      assert.ok(W(d).s.includes(want), W(d).s);
      sameBack(d);
    });
  }

  it('a style\'s tab stop cleared and its spacing turned off', () => {
    const d = docOf([newPara('x', {pStyle: 'Heading1',
      pPr: {spacing: {before: 0}, keepNext: false, extra: []}})]);
    sameBack(d);
  });
});

describe('RtfWrite: the style sheet', () => {
  function styled() {
    const d = docOf([
      newPara('Title', {pStyle: 'Heading1'}),
      newPara('a strong word', {runs: [
        {start: 0, end: 2, rPr: {extra: []}},
        {start: 2, end: 8, rPr: {extra: []}, rStyle: 'Strong'},
        {start: 8, end: 13, rPr: {extra: []}}]}),
      newPara('mine', {pStyle: 'Mine'})]);
    const t = structuredClone(d.styles);
    addStyle(t, {id: 'Strong', type: 'character', name: 'Strong',
      rPr: {b: true, color: '00FF00', extra: []}});
    addStyle(t, {id: 'Mine', type: 'paragraph', name: 'Mine',
      basedOn: 'Heading1', next: 'Normal',
      pPr: {jc: 'right', extra: []}, rPr: {i: true, extra: []}});
    d.styles = t;
    return d;
  }

  it('paragraph styles \\s with \\sbasedon \\snext, character ' +
    'styles \\cs', () => {
    const {s} = W(styled());
    assert.ok(s.includes('{\\stylesheet{\\sa160\\sl259\\slmult1' +
      '\\widctlpar\\fs22 Normal;}'), s);
    const h1 = s.indexOf(' heading 1;}');
    assert.ok(h1 > 0 && s.lastIndexOf('{\\s', h1) > 0, s);
    const strong = s.indexOf(' Strong;}');
    const open = s.lastIndexOf('{\\*\\cs', strong);
    assert.ok(open > 0, s);
    const n = s.slice(open + 6, s.indexOf(' ', open));
    assert.ok(s.slice(open, strong).includes('\\additive\\b'), s);
    assert.ok(s.includes('{\\cs' + n + '\\b\\fs22\\cf'), s);
    const mine = s.slice(s.lastIndexOf('{\\s', s.indexOf(' Mine;}')),
      s.indexOf(' Mine;}'));
    assert.ok(mine.includes('\\qr') && mine.includes('\\i') &&
      mine.includes('\\sbasedon') && mine.includes('\\snext0'), mine);
  });

  it('reads back: names, Based on, Next and the resolved ' +
    'formatting', () => {
    sameBack(styled());
  });
});

describe('RtfWrite: what RTF cannot hold (lost)', () => {
  it('an opaque block is counted; the text around it is kept', () => {
    const d = tiny([newPara('a'), {type: 'opaque',
      node: el('w:customXml')}, newPara('b')]);
    const {lost} = W(d);
    assert.deepEqual(lost, [{what: LOST.unknown, count: 1}]);
    assert.deepEqual(back(d).sections[0].blocks.map((b) => b.text),
      ['a', 'b']);
  });

  it('unknown raw inlines: a picture counted, a link keeps its text',
    () => {
      const p = newPara('a' + OBJ + 'b' + OBJ + 'c', {inlines: {
        1: {kind: 'raw', level: 'r', node: el('w:drawing')},
        3: {kind: 'raw', level: 'p', node: el('w:hyperlink'),
          text: 'link'}}});
      const {lost} = W(tiny([p]));
      assert.deepEqual(lost, [{what: LOST.pictures, count: 1},
        {what: LOST.links, count: 1}]);
      assert.equal(back(tiny([p])).sections[0].blocks[0].text,
        'ablinkc');
    });

  it('a bookmark with no name counts once; a PAGE field is kept ' +
    '(task 8); proofing marks count nothing', () => {
    const fc = (t) => ({kind: 'raw', level: 'r', node: el('w:fldChar',
      [['w:fldCharType', t]])});
    const p = newPara(OBJ + 'a' + OBJ + OBJ + OBJ + '1' + OBJ + OBJ +
      OBJ, {inlines: {
      0: {kind: 'raw', level: 'p', node: el('w:bookmarkStart'),
        text: ''},
      2: fc('begin'), 3: {kind: 'raw', level: 'r',
        node: el('w:instrText', null, ' PAGE ')}, 4: fc('separate'),
      6: fc('end'),
      7: {kind: 'raw', level: 'p', node: el('w:bookmarkEnd'), text: ''},
      8: {kind: 'raw', level: 'p', node: el('w:proofErr'), text: ''}}});
    assert.deepEqual(W(tiny([p])).lost, [{what: LOST.bookmarks,
      count: 1}]);
    assert.equal(back(tiny([p])).sections[0].blocks[0].text,
      'a' + OBJ + OBJ + OBJ + '1' + OBJ);
  });

  it('a border of width 0 has no \\brdrw; a huge drawing is ' +
    'looked at without overflowing', () => {
    const d = tiny([newPara('x', {pPr: {pBdr: {top: {val: 'single',
      sz: 0}}, extra: []}})]);
    assert.ok(W(d).s.includes('\\brdrt\\brdrs{'), W(d).s);
    const kids = [];
    for (let i = 0; i < 300000; i++) kids.push(el('w:x'));
    const big = newPara(OBJ, {inlines: {0: {kind: 'raw', level: 'r',
      node: {name: 'w:drawing', attrs: [], children: kids}}}});
    assert.deepEqual(W(tiny([big])).lost,
      [{what: LOST.pictures, count: 1}]);
  });

  it('a text box is a text box, not a picture', () => {
    const box = el('w:drawing', null, el('wp:anchor', null,
      el('wps:txbx', null, el('w:txbxContent'))));
    const p = newPara(OBJ, {inlines: {0: {kind: 'raw', level: 'r',
      node: box}}});
    assert.deepEqual(W(tiny([p])).lost,
      [{what: LOST.textBoxes, count: 1}]);
  });

  it('tracked deletions are never live text: written as tracked ' +
    'deletions (task 9); insertions as insertions', () => {
    const rev = (id, kind) => ({id, kind, author: 'A', attrs: [],
      extra: []});
    const p = newPara('keep gone added', {runs: [
      {start: 0, end: 5, rPr: {extra: []}},
      {start: 5, end: 10, rPr: {extra: []}, rev: rev(1, 'del')},
      {start: 10, end: 15, rPr: {extra: []}, rev: rev(2, 'ins')}]});
    const {s, lost} = W(tiny([p]));
    assert.ok(s.includes('{\\fs24\\deleted\\revauthdel1 gone }'), s);
    assert.ok(s.includes('{\\fs24\\revised\\revauth1 added}'), s);
    assert.deepEqual(lost, []);
    const q = back(tiny([p])).sections[0].blocks[0];
    assert.equal(q.text, 'keep gone added');
    assert.deepEqual(q.runs.map((r) => r.rev && r.rev.kind),
      [undefined, 'del', 'ins']);
  });

  it('a table is written as a table (task 8), nothing lost', () => {
    const cell = (t) => newCell([newPara(t)]);
    const t = newTable({grid: [2000, 2000], rows: [
      newRow([cell('a'), cell('b')])]});
    const d = tiny([t, newPara('after')]);
    const {lost} = W(d);
    assert.deepEqual(lost, []);
    assert.deepEqual(back(d).sections[0].blocks.map((b) => b.type),
      ['tbl', 'p']);
  });

  it('never throws on odd content; nothing undefined is written',
    () => {
      const p = newPara('x' + OBJ, {inlines: {1: {kind: 'raw',
        level: 'r', node: el('w:weird')}},
      rPr: {sz: 7.5, color: 'zzz', highlight: 'nope', u: 'what',
        rFonts: {ascii: ''}, shd: {val: 'solid'}, extra: [null, 3,
          {name: 'w:position', attrs: [['w:val', 'big']]}]},
      pPr: {jc: 'sideways', ind: {left: 'a'}, spacing: {line: -5},
        tabs: [{val: 'left'}, null], pBdr: {top: null, left:
          {val: 'nope', sz: 'x'}}, outlineLvl: 99, extra: []}});
      const d = tiny([p]);
      d.styles = null;
      const {s, lost} = W(d);
      assert.ok(s.startsWith('{\\rtf1') && s.endsWith('}'), s);
      assert.ok(!s.includes('NaN') && !s.includes('undefined'), s);
      assert.deepEqual(lost, [{what: LOST.other, count: 1}]);
    });
});

describe('RtfWrite: read back', () => {
  it('a mixed document reads back equal (modelCore)', () => {
    const d = docOf([
      newPara('Heading', {pStyle: 'Heading1'}),
      newPara('plain bold red big', {runs: [
        {start: 0, end: 6, rPr: {extra: []}},
        {start: 6, end: 11, rPr: {b: true, extra: []}},
        {start: 11, end: 15, rPr: {color: 'C00000', i: true,
          extra: []}},
        {start: 15, end: 18, rPr: {sz: 36, u: 'single', extra: []}}],
      pPr: {jc: 'both', ind: {left: 360}, extra: []}}),
      newPara(''),
      newPara('Title text', {pStyle: 'Title'}),
      newPara('\u00e9t\u00e9\ttab', {pPr: {tabs: [{val: 'center',
        pos: 4513}], extra: []}})]);
    sameBack(d);
  });

  it('macOS textutil reads the same text', {skip:
    !fs.existsSync('/usr/bin/textutil')}, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtfw-'));
    const d = docOf([newPara('Hello caf\u00e9 \u2603'),
      newPara('two\tcols', {rPr: {b: true, extra: []}}),
      newPara(''), newPara('end \ud83d\ude00')]);
    const f = path.join(dir, 'a.rtf');
    fs.writeFileSync(f, writeRtf(d).bytes);
    const out = execFileSync('/usr/bin/textutil', ['-convert', 'txt',
      '-stdout', f]).toString('utf8');
    fs.rmSync(dir, {recursive: true});
    assert.equal(out, 'Hello caf\u00e9 \u2603\ntwo\tcols\n\n' +
      'end \ud83d\ude00');
  });
});
