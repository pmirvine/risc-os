// RtfRead (Batch G2, task 4): paragraph formatting, lists, sections,
// headers and footers, fields, hyperlinks and bookmarks.
// Fixtures: tests/moreapps/rtf-fixtures/ (05 and 09 are real textutil
// output; 15 and 16 are SPEC-DERIVED, see its README) and small
// strings. Every Doc read here must write as .docx and read back
// equal (docx-compare's assertSameDoc after expectedBack).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {refsOf, storyOfRef} from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {settingsOf} from '../../tools/moreapps/!Letters/SettingsRead';
import {of as bookmarks} from '../../tools/moreapps/!Letters/BookmarkIndex';
import {assertSameDoc, expectedBack, withNewParts, withNewStories}
  from './docx-compare.mjs';

const DIR = fileURLToPath(new URL('./rtf-fixtures/', import.meta.url));
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const R = (s, o = {}) => readRtf(enc(s), {date: DATE, ...o});
const fixture = (f) => readRtf(new Uint8Array(fs.readFileSync(DIR + f)),
  {date: DATE});
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
const pPr = (doc, k = 0) => {
  const {extra, ...f} = paras(doc)[k].pPr;
  assert.deepEqual(extra, []);
  return f;
};
const ch = (n) => String.fromCharCode(n);
const local = (n) => n.name.slice(n.name.indexOf(':') + 1);
const attr = (n, k) => {
  const a = n.attrs.find(([x]) => x === k);
  return a ? String(a[1]) : undefined;
};
/** The inlines of a paragraph as [offset, kind/local name, extra]. */
const marks = (p) => Object.keys(p.inlines).map(Number)
  .sort((a, b) => a - b).map((k) => {
    const x = p.inlines[k];
    return [k, x.node ? local(x.node) : x.kind];
  });

async function roundTrips(doc, what) {
  for (const s of doc.sections) for (const b of s.blocks) checkBlock(b);
  for (const st of doc.stories.values()) {
    for (const b of st.blocks) checkBlock(b);
  }
  const back = await readDocx(await writeDocx(doc, {date: DATE}));
  assertSameDoc(back, withNewStories(withNewParts(expectedBack(doc),
    back), back), what);
  return back;
}

const COLOURS = '{\\colortbl;\\red255\\green0\\blue0;' +
  '\\red0\\green255\\blue0;}';

describe('RtfRead: paragraph formatting', () => {
  it('alignment, indents, spacing, keep and widow words', () => {
    const {doc} = R('{\\rtf1\\pard\\qc\\li720\\ri360\\fi-360\\sb120' +
      '\\sa240\\sl360\\slmult1\\keep\\keepn\\pagebb\\widctlpar a\\par' +
      '\\pard\\fi240\\sl-280\\slmult0\\outlinelevel1 b\\par' +
      '\\pard\\sl300 c\\par\\pard d\\par}');
    assert.deepEqual(pPr(doc, 0), {jc: 'center', keepNext: true,
      keepLines: true, pageBreakBefore: true, widowControl: true,
      spacing: {before: 120, after: 240, line: 360, lineRule: 'auto'},
      ind: {left: 720, right: 360, hanging: 360}});
    assert.deepEqual(pPr(doc, 1), {ind: {firstLine: 240},
      spacing: {line: 280, lineRule: 'exact'}, outlineLvl: 1});
    assert.deepEqual(pPr(doc, 2), {spacing: {line: 300,
      lineRule: 'atLeast'}});
    assert.deepEqual(pPr(doc, 3), {});
  });

  it('\\nowidctlpar is widow control off, also where nothing ' +
    'turned it on (in the Model, nothing means on)', () => {
    const {doc} = R('{\\rtf1{\\stylesheet{\\nowidctlpar Normal;}' +
      '{\\s1\\widctlpar W;}}\\pard\\nowidctlpar a\\par' +
      '\\pard\\s1\\nowidctlpar b\\par\\pard c\\par}');
    assert.equal(doc.styles.styles.get('Normal').pPr.widowControl,
      false);
    assert.equal(doc.styles.styles.get('W').pPr.widowControl, true);
    assert.deepEqual(pPr(doc, 0), {});
    assert.deepEqual(pPr(doc, 1), {widowControl: false});
    assert.deepEqual(pPr(doc, 2), {});
  });

  it('tab stops with kinds and leaders, sorted', () => {
    const {doc} = R('{\\rtf1\\pard\\tqr\\tldot\\tx5000\\tx720' +
      '\\tqc\\tx3000\\tqdec\\tlhyph\\tx4000\\tb6000 a\\par}');
    assert.deepEqual(pPr(doc).tabs, [{val: 'left', pos: 720},
      {val: 'center', pos: 3000},
      {val: 'decimal', pos: 4000, leader: 'hyphen'},
      {val: 'right', pos: 5000, leader: 'dot'},
      {val: 'bar', pos: 6000}]);
  });

  it('borders and shading', () => {
    const {doc} = R('{\\rtf1' + COLOURS + '\\pard\\brdrt\\brdrs' +
      '\\brdrw20\\brsp40\\brdrcf1 \\brdrb\\brdrdb\\brdrw10 a\\par' +
      '\\pard\\box\\brdrdot b\\par' +
      '\\pard\\cbpat1\\cfpat2\\shading2000 c\\par' +
      '\\pard\\cbpat2 d\\par}');
    assert.deepEqual(pPr(doc, 0), {pBdr: {
      top: {val: 'single', sz: 8, space: 2, color: 'FF0000'},
      bottom: {val: 'double', sz: 4}}});
    const d = {val: 'dotted'};
    assert.deepEqual(pPr(doc, 1), {pBdr: {top: d, left: d, bottom: d,
      right: d}});
    assert.deepEqual(pPr(doc, 2), {shd: {val: 'pct20',
      color: '00FF00', fill: 'FF0000'}});
    assert.deepEqual(pPr(doc, 3), {shd: {val: 'clear', color: 'auto',
      fill: '00FF00'}});
    // solid with no pattern colour: the fill shows
    const solid = (s) => pPr(R('{\\rtf1' + COLOURS + '\\pard' + s +
      ' a\\par}').doc).shd;
    assert.deepEqual(solid('\\cbpat1\\shading10000'), {val: 'clear',
      color: 'auto', fill: 'FF0000'});
    assert.deepEqual(solid('\\cfpat2\\shading10000'), {val: 'solid',
      color: '00FF00', fill: 'auto'});
  });

  it('table and character border words do not become paragraph ' +
    'borders', () => {
    const {doc} = R('{\\rtf1\\pard\\brdrb\\brdrs\\trbrdrt\\brdrdb ' +
      '\\clbrdrl\\brdrs\\chbrdr\\brdrdot a\\par}');
    assert.deepEqual(pPr(doc), {pBdr: {bottom: {val: 'single'}}});
  });

  it('\\pard resets; a group restores', () => {
    const {doc} = R('{\\rtf1\\pard\\li500\\tx100 a\\par' +
      '{\\li900 b\\par}c\\par\\pard d\\par}');
    assert.deepEqual(pPr(doc, 0), {ind: {left: 500},
      tabs: [{val: 'left', pos: 100}]});
    assert.deepEqual(pPr(doc, 1).ind, {left: 900});
    assert.deepEqual(pPr(doc, 2).ind, {left: 500});
    assert.deepEqual(pPr(doc, 3), {});
  });

  it('measured against the paragraph style', () => {
    const {doc} = R('{\\rtf1{\\stylesheet{\\s0 Normal;}' +
      '{\\s1\\sb240\\keepn\\tx720 heading 1;}}' +
      '\\pard\\s1\\sb240\\keepn\\tx720 a\\par' +
      '\\pard\\s1\\tx1440 b\\par}');
    assert.deepEqual(pPr(doc, 0), {});
    assert.deepEqual(pPr(doc, 1), {spacing: {before: 0},
      keepNext: false, tabs: [{val: 'clear', pos: 720},
        {val: 'left', pos: 1440}]});
  });
});

/** The levels of list numId as [numFmt, lvlText, start]. */
const levels = (doc, numId) => doc.numbering.nums.get(numId).levels
  .map((l) => [l.numFmt, l.lvlText, l.start]);

describe('RtfRead: lists', () => {
  it('textutil lists: bullets and three numbered levels', () => {
    const {doc} = fixture('05-lists-html.rtf');
    assert.deepEqual(levels(doc, 1), [['bullet', ch(0x2022), 0],
      ['bullet', ch(0x25e6), 0], ['bullet', ch(0x25aa), 0]]);
    assert.deepEqual(levels(doc, 2), [['decimal', '%1', 1],
      ['lowerLetter', '%2', 1], ['lowerRoman', '%3', 1]]);
    assert.deepEqual(levels(doc, 3), [['upperLetter', '%1', 5]]);
    const l = doc.numbering.nums.get(2).levels[1];
    assert.deepEqual(l.pPr.ind, {left: 1440, hanging: 360});
    const ps = paras(doc);
    const num = (t) => ps.find((p) => p.text === t).pPr.numPr;
    assert.deepEqual(num('Apple'), {numId: 1, ilvl: 0});
    assert.deepEqual(num('Sub item'), {numId: 1, ilvl: 1});
    assert.deepEqual(num('Sub sub'), {numId: 1, ilvl: 2});
    assert.deepEqual(num('Roman'), {numId: 2, ilvl: 2});
    assert.deepEqual(num('Six'), {numId: 3, ilvl: 0});
    assert.equal(doc.meta.numberingPart, 'word/numbering.xml');
  });

  it('Word lists (spec-derived): placeholders, suffix, ' +
    'alignment, a Symbol bullet, a start-at override', () => {
    const {doc, notes} = fixture('15-spec-word-lists.rtf');
    assert.deepEqual(notes, []);
    assert.deepEqual(levels(doc, 1), [['decimal', '%1.', 1],
      ['lowerLetter', '%2)', 1], ['lowerRoman', '%1.%3.', 1]]);
    const l2 = doc.numbering.nums.get(1).levels[2];
    assert.equal(l2.suff, 'space');
    assert.equal(l2.lvlJc, 'right');
    assert.deepEqual(l2.pPr.ind, {left: 2160, hanging: 180});
    const b = doc.numbering.nums.get(2);
    assert.deepEqual(b.levels.map((l) => [l.numFmt, l.lvlText]),
      [['bullet', ch(0xf0b7)]]);
    assert.equal(b.levels[0].rPr.rFonts.ascii, 'Symbol');
    assert.equal(b.multiLevelType, 'singleLevel');
    const o = doc.numbering.nums.get(3);
    assert.equal(o.abstractNumId, doc.numbering.nums.get(1)
      .abstractNumId);
    assert.deepEqual(o.overrides.get(0), {start: 4});
    const ps = paras(doc);
    const num = (t) => ps.find((p) => p.text === t).pPr.numPr;
    assert.deepEqual(num('One a i'), {numId: 1, ilvl: 2});
    assert.deepEqual(num('Bullet'), {numId: 2, ilvl: 0});
    assert.deepEqual(num('Restarted at four'), {numId: 3, ilvl: 0});
  });

  it('old-style \\pn paragraphs (best effort)', () => {
    const {doc} = fixture('15-spec-word-lists.rtf');
    const ps = paras(doc);
    const a = ps.find((p) => p.text === 'Old style number').pPr.numPr;
    const b = ps.find((p) => p.text === 'Old style bullet').pPr.numPr;
    assert.ok(a && b && a.numId !== b.numId);
    assert.deepEqual(levels(doc, a.numId), [['decimal', '%1.', 1]]);
    assert.deepEqual(levels(doc, b.numId), [['bullet', ch(0xf0b7),
      1]]);
    assert.equal(doc.numbering.nums.get(b.numId).levels[0].rPr
      .rFonts.ascii, 'Symbol');
  });

  it('\\ls naming no list, and no list table: no numbering', () => {
    const {doc} = R('{\\rtf1\\pard\\ls7\\ilvl1 a\\par}');
    assert.equal(doc.numbering, null);
    assert.deepEqual(pPr(doc), {});
  });

  it('a \\list with no \\listlevel is skipped', () => {
    const {doc} = R('{\\rtf1{\\*\\listtable{\\list\\listid5}}' +
      '{\\*\\listoverridetable{\\listoverride\\listid5\\ls1}}' +
      '\\pard\\ls1 b\\par}');
    assert.equal(doc.numbering, null);
    assert.deepEqual(pPr(doc), {});
  });

  it('a hostile list table: caps hold, nothing throws', () => {
    let s = '{\\rtf1{\\*\\listtable';
    for (let k = 0; k < 1200; k++) {
      s += '{\\list\\listid' + k + '{\\listlevel\\levelnfc99' +
        '\\levelstartat-5{\\leveltext\\\'09\\\'00\\\'0a;}}}';
    }
    s += '}{\\*\\listoverridetable';
    for (let k = 0; k < 1200; k++) {
      s += '{\\listoverride\\listid' + k + '\\ls' + (k + 1) + '}';
    }
    s += '}\\pard\\ls1\\ilvl44 a\\par}';
    const {doc} = R(s);
    assert.ok(doc.numbering.nums.size <= 1000);
    const l = doc.numbering.nums.get(1).levels[0];
    assert.equal(l.numFmt, 'decimal');
    assert.deepEqual(pPr(doc).numPr, {numId: 1, ilvl: 8});
  });
});

/** Section k's props without extra. */
const sect = (doc, k) => {
  const {extra, ...p} = doc.sections[k].props;
  return p;
};

describe('RtfRead: sections', () => {
  it('no page size given: US Letter and the RTF default margins',
    () => {
      const {doc} = R('{\\rtf1 a}');
      assert.deepEqual(sect(doc, 0), {pgSz: {w: 12240, h: 15840},
        pgMar: {top: 1440, right: 1800, bottom: 1440, left: 1800,
          header: 720, footer: 720, gutter: 0}, cols: {space: 720}});
    });

  it('document page size, then two sections with different sizes',
    () => {
      const {doc} = R('{\\rtf1\\paperw11906\\paperh16838\\margl1000' +
        '\\margr900\\margt800\\margb700\\gutter100 \\sectd a\\par b' +
        '\\sect\\sectd\\sbknone\\lndscpsxn\\pgwsxn15840\\pghsxn12240' +
        '\\marglsxn500\\cols2\\colsx360\\linebetcol\\titlepg' +
        '\\pgnrestart\\pgnstarts3\\pgnucrm\\vertalc c\\par}');
      assert.equal(doc.sections.length, 2);
      assert.deepEqual(doc.sections.map((s) => s.blocks.map((p) =>
        p.text)), [['a', 'b'], ['c']]);
      assert.deepEqual(sect(doc, 0), {pgSz: {w: 11906, h: 16838},
        pgMar: {top: 800, right: 900, bottom: 700, left: 1000,
          header: 720, footer: 720, gutter: 100}, cols: {space: 720}});
      assert.deepEqual(sect(doc, 1), {
        pgSz: {w: 15840, h: 12240, orient: 'landscape'},
        pgMar: {top: 800, right: 900, bottom: 700, left: 500,
          header: 720, footer: 720, gutter: 100},
        cols: {num: 2, space: 360, sep: true}, titlePg: true,
        type: 'continuous', pgNumType: {start: 3, fmt: 'upperRoman'},
        vAlign: 'center'});
    });

  it('\\landscape with a portrait size swaps it', () => {
    const {doc} = R('{\\rtf1\\paperw11906\\paperh16838\\landscape a}');
    assert.deepEqual(sect(doc, 0).pgSz, {w: 16838, h: 11906,
      orient: 'landscape'});
  });

  it('values out of range are ignored', () => {
    const {doc} = R('{\\rtf1\\paperw-5\\paperh99999999\\margl-10' +
      '\\sectd\\cols900 a}');
    const p = sect(doc, 0);
    assert.deepEqual(p.pgSz, {w: 12240, h: 15840});
    assert.equal(p.pgMar.left, 1800);
    assert.deepEqual(p.cols, {space: 720});
  });
});

describe('RtfRead: headers and footers', () => {
  it('a PAGE field in a footer', () => {
    const {doc} = R('{\\rtf1\\sectd{\\footer\\pard\\qc Page ' +
      '{\\field{\\*\\fldinst { PAGE }}{\\fldrslt 1}}\\par}a\\par}');
    assert.equal(doc.stories.size, 1);
    const [part, st] = [...doc.stories][0];
    assert.equal(part, 'word/footer1.xml');
    assert.equal(st.kind, 'ftr');
    assert.equal(st.blocks.length, 1);
    const p = st.blocks[0];
    assert.equal(p.text, 'Page ' + OBJ + OBJ + OBJ + '1' + OBJ);
    assert.equal(p.pPr.jc, 'center');
    assert.deepEqual(marks(p), [[5, 'fldChar'], [6, 'instrText'],
      [7, 'fldChar'], [9, 'fldChar']]);
    assert.equal(attr(p.inlines[5].node, 'w:fldCharType'), 'begin');
    assert.deepEqual(p.inlines[6].node.children, [' PAGE ']);
    assert.equal(attr(p.inlines[9].node, 'w:fldCharType'), 'end');
    const map = docScope(doc).map;
    const refs = refsOf(doc.sections[0], map);
    assert.equal(storyOfRef(doc, refs.ftr.default), part);
    assert.deepEqual(Object.keys(refs.hdr), []);
    assert.deepEqual(paras(doc).map((q) => q.text), ['a']);
  });

  it('first, left and right headers (spec-derived fixture)',
    async () => {
      const {doc, notes} = fixture('16-spec-word-sections.rtf');
      assert.deepEqual(notes, []);
      const map = docScope(doc).map;
      const refs = refsOf(doc.sections[0], map);
      const text = (rId) => doc.stories.get(storyOfRef(doc, rId))
        .blocks.map((p) => p.text);
      assert.deepEqual(text(refs.hdr.first), ['First page header']);
      assert.deepEqual(text(refs.hdr.default), ['Right header']);
      assert.deepEqual(text(refs.hdr.even), ['Left header']);
      assert.equal(text(refs.ftr.default)[0].replaceAll(OBJ, ''),
        'Page 1 of 3');
      assert.equal(doc.sections[0].props.titlePg, true);
      assert.equal(doc.sections[0].props.pgMar.header, 567);
      assert.equal(settingsOf(doc).evenAndOddHeaders, true);
      assert.deepEqual(doc.sections.map((s) => [s.props.pgSz,
        s.props.type]), [[{w: 11906, h: 16838}, undefined],
        [{w: 16838, h: 11906, orient: 'landscape'}, 'nextPage'],
        [{w: 11906, h: 16838}, 'continuous']]);
      assert.deepEqual(doc.sections[1].props.pgNumType, {start: 1,
        fmt: 'lowerRoman'});
      // the later sections have none of their own: they inherit
      const r1 = refsOf(doc.sections[1], map);
      assert.deepEqual([Object.keys(r1.hdr), Object.keys(r1.ftr)],
        [[], []]);
      await roundTrips(doc, '16');
    });
});

describe('RtfRead: fields', () => {
  const field = (inst, rslt) => '{\\field{\\*\\fldinst ' + inst +
    '}{\\fldrslt ' + rslt + '}}';

  it('complex fields keep their code and result', () => {
    const {doc, notes} = R('{\\rtf1 a' + field('{ NUMPAGES }', '3') +
      field('DATE \\\\@ "d MMMM"', '6 May') +
      field(' page ', '1') + field('REF intro \\\\h', 'r') +
      field('TOC \\\\o "1-3"', 't') + field('= 2 + 3', '5') + 'z}');
    assert.deepEqual(notes, []);
    const p = paras(doc)[0];
    assert.equal(p.text.replaceAll(OBJ, ''), 'a36 May1rt5z');
    const codes = Object.values(p.inlines).filter((x) =>
      local(x.node) === 'instrText').map((x) => x.node.children[0]);
    assert.deepEqual(codes, [' NUMPAGES ', ' DATE \\@ "d MMMM" ',
      ' page ', ' REF intro \\h ', ' TOC \\o "1-3" ', ' = 2 + 3 ']);
  });

  it('only known safe kinds stay fields; the rest keep their ' +
    'result as text, with a note', () => {
    for (const code of ['FOO bar', 'DATABASE \\\\d "x.mdb"',
      'MACROBUTTON Run Click', 'RD "other.doc"', 'PRINT "x"',
      'EMBED Package', 'MERGEFIELD Name', 'PAGE1', 'PAGE\\\\* x',
      'HYPERLINK"https://e.example/"', 'HYPERLINK\\\\l "a"',
      '"PAGE"']) {
      const {doc, notes} = R('{\\rtf1 ' + field(code, 'shown') + '}');
      const p = paras(doc)[0];
      assert.equal(p.text, 'shown', code);
      assert.deepEqual(p.inlines, {}, code);
      assert.equal(notes.length, 1, code);
    }
  });

  it('a field with no code keeps only its result text', () => {
    const {doc} = R('{\\rtf1 a' + field('', 'x') + '}');
    assert.equal(paras(doc)[0].text, 'ax');
  });

  it('a field with no result has an empty one', () => {
    const {doc} = R('{\\rtf1 {\\field{\\*\\fldinst PAGE}}}');
    assert.deepEqual(marks(paras(doc)[0]).map((m) => m[1]),
      ['fldChar', 'instrText', 'fldChar', 'fldChar']);
  });

  it('codes that fetch from outside keep only their result', () => {
    for (const code of ['DDE excel "a.xls" R1C1',
      'DDEAUTO cmd "/c calc"', 'INCLUDETEXT "c:\\\\x.txt"',
      'INCLUDEPICTURE "http://e.example/p.png"', 'LINK Excel x',
      'IMPORT x.wmf', 'AUTOTEXT Name', ' includetext x']) {
      const {doc, notes} = R('{\\rtf1 ' + field(code, 'shown') + '}');
      const p = paras(doc)[0];
      assert.equal(p.text, 'shown', code);
      assert.deepEqual(p.inlines, {}, code);
      assert.equal(notes.length, 1, code);
    }
  });

  it('a locked field', () => {
    const {doc} = R('{\\rtf1 {\\field\\fldlock{\\*\\fldinst DATE}' +
      '{\\fldrslt d}}}');
    const p = paras(doc)[0];
    assert.equal(attr(p.inlines[0].node, 'w:fldLock'), '1');
  });

  it('a result over two paragraphs (a TOC)', () => {
    const {doc} = R('{\\rtf1 ' + field('TOC \\\\o "1-3"',
      'One\\tab 1\\par Two\\tab 2') + '\\par after}');
    const ps = paras(doc);
    assert.deepEqual(ps.map((p) => p.text.replaceAll(OBJ, '')),
      ['One\t1', 'Two\t2', 'after']);
    assert.equal(marks(ps[0]).length, 3);
    assert.deepEqual(marks(ps[1]), [[5, 'fldChar']]);
  });
});

describe('RtfRead: hyperlinks and bookmarks', () => {
  it('the textutil hyperlink: a w:hyperlink with an External rel',
    async () => {
      const {doc} = fixture('09-hyperlinks-html.rtf');
      const p = paras(doc)[0];
      assert.equal(p.text, 'See ' + OBJ + ' and the bookmark.');
      const x = p.inlines['4'];
      assert.equal(x.kind, 'raw');
      assert.equal(x.level, 'p');
      assert.equal(x.text, 'an example site');
      assert.equal(local(x.node), 'hyperlink');
      const rel = doc.rels.find((r) => r.id === attr(x.node, 'r:id'));
      assert.equal(rel.target, 'https://example.com/page?a=1&b=2');
      assert.equal(rel.mode, 'External');
      const back = await roundTrips(doc, '09');
      assert.equal(paras(back)[0].inlines['4'].text, 'an example site');
    });

  it('a link to a bookmark, and the bookmark pair', async () => {
    const {doc} = fixture('16-spec-word-sections.rtf');
    const ps = paras(doc);
    const bm = ps.find((p) => p.text.includes('Introduction'));
    assert.deepEqual(marks(bm), [[0, 'bookmarkStart'],
      [13, 'bookmarkEnd']]);
    assert.equal(attr(bm.inlines[0].node, 'w:name'), 'intro');
    assert.equal(attr(bm.inlines[0].node, 'w:id'),
      attr(bm.inlines[13].node, 'w:id'));
    assert.equal(bookmarks(doc).byName.get('intro').plain,
      'Introduction');
    const see = ps.find((p) => p.text.startsWith('See '));
    const links = Object.values(see.inlines);
    assert.equal(attr(links[0].node, 'w:anchor'), 'intro');
    assert.equal(links[0].text, 'the introduction');
    const rel = doc.rels.find((r) => r.id ===
      attr(links[1].node, 'r:id'));
    assert.equal(rel.target, 'https://example.com/');
  });

  it('a hyperlink in a header has its relationship in the header',
    async () => {
      const {doc} = R('{\\rtf1{\\header {\\field{\\*\\fldinst ' +
        'HYPERLINK "https://example.org/"}{\\fldrslt link}}\\par}a}');
      const st = [...doc.stories.values()][0];
      const x = Object.values(st.blocks[0].inlines)[0];
      assert.equal(st.rels.length, 1);
      assert.equal(st.rels[0].id, attr(x.node, 'r:id'));
      assert.equal(st.rels[0].target, 'https://example.org/');
      assert.ok(!doc.rels.some((r) => r.target ===
        'https://example.org/'));
      await roundTrips(doc, 'header link');
    });

  it('a bad address keeps the text only, with a note', () => {
    const {doc, notes} = R('{\\rtf1 {\\field{\\*\\fldinst HYPERLINK ' +
      '"javascript:alert(1)"}{\\fldrslt x}}}');
    assert.equal(paras(doc)[0].text, 'x');
    assert.equal(notes.length, 1);
  });

  it('a link inside a link gives its text only', async () => {
    const link = (u, r) => '{\\field{\\*\\fldinst HYPERLINK "' + u +
      '"}{\\fldrslt ' + r + '}}';
    const {doc} = R('{\\rtf1 ' + link('https://a.example/', 'x' +
      link('https://b.example/', 'y') + 'z') + '}');
    const p = paras(doc)[0];
    assert.equal(p.text, OBJ);
    assert.equal(p.inlines[0].text, 'xyz');
    await roundTrips(doc, 'nested link');
  });

  it('a HYPERLINK FieldParse cannot read: text kept, a note, no ' +
    'field', () => {
    const {doc, notes} = R('{\\rtf1 {\\field{\\*\\fldinst ' +
      'HYPERLINK "javascript:alert(1)}{\\fldrslt x}}}');
    const p = paras(doc)[0];
    assert.equal(p.text, 'x');
    assert.deepEqual(p.inlines, {});
    assert.equal(notes.length, 1);
  });

  it('a bookmark name a link could not name is skipped, noted',
    () => {
      const {doc, notes} = R('{\\rtf1 {\\*\\bkmkstart a b}x' +
        '{\\*\\bkmkend a b}{\\*\\bkmkstart ' + 'n'.repeat(300) +
        '}y}');
      assert.equal(paras(doc)[0].text, 'xy');
      assert.equal(notes.length, 1);
    });

  it('an end with no start, an empty name: skipped', () => {
    const {doc} = R('{\\rtf1 a{\\*\\bkmkend nope}{\\*\\bkmkstart  }b}');
    assert.equal(paras(doc)[0].text, 'ab');
  });
});

describe('RtfRead (task 4): each Doc writes as .docx, reads back ' +
  'equal', () => {
  for (const f of ['05-lists-html.rtf', '09-hyperlinks-html.rtf',
    '15-spec-word-lists.rtf', '16-spec-word-sections.rtf']) {
    it(f, async () => {
      await roundTrips(fixture(f).doc, f);
    });
  }

  it('paragraph formatting', async () => {
    const {doc} = R('{\\rtf1' + COLOURS + '{\\stylesheet{\\s0 Normal;}' +
      '{\\s1\\sb240\\tx720 heading 1;}}\\pard\\s1\\tx1440\\qj\\li720' +
      '\\fi-360\\sl360\\slmult1\\keepn\\brdrt\\brdrs\\brdrw20\\brdrcf1' +
      '\\cbpat2\\shading500 a\\par}');
    await roundTrips(doc, 'para');
  });

  it('never throws on mutated spec fixtures', () => {
    for (const f of ['15-spec-word-lists.rtf',
      '16-spec-word-sections.rtf']) {
      const src = fs.readFileSync(DIR + f);
      let seed = 777;
      const rnd = (n) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
      };
      for (let k = 0; k < 200; k++) {
        const b = new Uint8Array(src.slice(0, 1 + rnd(src.length)));
        for (let m = 0; m < 1 + rnd(20); m++) {
          b[rnd(b.length)] = '{}\\\'u0-9 ab'.charCodeAt(rnd(13));
        }
        const {doc} = readRtf(b, {date: DATE});
        for (const s of doc.sections) for (const x of s.blocks) {
          checkBlock(x);
        }
        for (const st of doc.stories.values()) {
          for (const x of st.blocks) checkBlock(x);
        }
      }
    }
  });
});
