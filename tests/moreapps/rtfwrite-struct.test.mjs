// RtfWrite (Batch G2, task 8): the structures. Tables (merges,
// borders, shading, nested), lists, pictures, fields, links,
// bookmarks, sections with headers and footers, footnotes and
// endnotes. Each is written, read back by readRtf and compared
// (./rtf-helpers.mjs modelCore, tableCore, notesCore, storiesCore);
// small cases also as exact text. macOS textutil, where present, is
// an independent reader.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {LOST} from '../../tools/moreapps/!Letters/RtfLost';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {newPara, newTable, newRow, newCell, OBJ}
  from '../../tools/moreapps/!Letters/Model';
import {newStyleTable, addStyle, setDefault}
  from '../../tools/moreapps/!Letters/Styles';
import {pictureOf, docMap} from '../../tools/moreapps/!Letters/PicRead';
import {mediaOf} from '../../tools/moreapps/!Letters/PicMedia';
import {inside} from '../../tools/moreapps/!Letters/LinkParts';
import {labels} from '../../tools/moreapps/!Letters/ListNumbers';
import {of as bookmarksOf}
  from '../../tools/moreapps/!Letters/BookmarkIndex';
import {el} from '../../tools/moreapps/!WimpLib/Xml';
import {modelCore, assertSameCore, tableCore, notesCore, storiesCore}
  from './rtf-helpers.mjs';
import {buildDocx, documentXml, stylesXml, numberingXml, REL, p, r}
  from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, nestedTable} from './tbl-fixtures.mjs';
import {LIST_DOCS, lvl} from './list-fixtures.mjs';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {noteDoc, mark, noteP, emark, enoteP} from './note-fixtures.mjs';
import {picDocx, pngBytes, jpegBytes, gifBytes}
  from './pic-fixtures.mjs';

const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const FIX = path.join(import.meta.dirname, 'rtf-fixtures');
const ascii = (bytes) => Buffer.from(bytes).toString('latin1');
const W = (doc) => {
  const x = writeRtf(doc);
  return {...x, s: ascii(x.bytes)};
};
const read = (bytes) => readRtf(bytes, {date: DATE}).doc;
const back = (doc) => read(writeRtf(doc).bytes);
const fixture = (f) => read(fs.readFileSync(path.join(FIX, f)));
const rtf = (s) => read(new TextEncoder().encode(s));
/** The body from \sectd on. */
const body = (s) => s.slice(s.indexOf('\\sectd'));

/** The braces of RTF text s balance (escapes and hex data aside). */
function balanced(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/** modelCore of both, the info and the page a .docx without them
 *  leaves to RTF's defaults taken from `want`. */
function sameBack(doc, what) {
  const got = back(doc);
  const a = modelCore(doc), b = modelCore(got);
  b.info = a.info;
  a.sections.forEach((s, i) => {
    const pg = b.sections[i] && b.sections[i].page;
    for (const k of Object.keys(pg || {})) {
      if (!(k in s.page)) delete pg[k];
    }
  });
  assertSameCore(b, a, what);
  return got;
}

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

const cell = (t, tcPr) => newCell([newPara(t)], tcPr);
const raw = (name, attrs, level = 'r', ...kids) => ({kind: 'raw',
  level, text: '', node: el(name, attrs, ...kids)});
const fc = (t) => raw('w:fldChar', [['w:fldCharType', t]]);
const instr = (code) => raw('w:instrText', [['xml:space', 'preserve']],
  'r', code);
/** A paragraph: text, then a field of code with result res. */
function fieldPara(before, code, res, after = '') {
  const i = before.length;
  return newPara(before + OBJ + OBJ + OBJ + res + OBJ + after,
    {inlines: {[i]: fc('begin'), [i + 1]: instr(code),
      [i + 2]: fc('separate'), [i + 3 + res.length]: fc('end')}});
}
const textutil = fs.existsSync('/usr/bin/textutil');
function tu(doc, fmt = 'txt') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtfs-'));
  const f = path.join(dir, 'a.rtf');
  fs.writeFileSync(f, writeRtf(doc).bytes);
  const out = execFileSync('/usr/bin/textutil', ['-convert', fmt,
    '-stdout', f]).toString('utf8');
  fs.rmSync(dir, {recursive: true});
  return out;
}

describe('RtfWrite: tables', () => {
  it('a 1 x 2 table is exactly this, and reads back as a table', () => {
    const d = tiny([newTable({grid: [2000, 2000], rows: [
      newRow([cell('a'), cell('b')])]}), newPara('after')]);
    const {s, lost} = W(d);
    assert.equal(body(s), '\\sectd\\headery708\\footery708\n' +
      '\\trowd\\trgaph108\\trleft-108\n\\cellx1892\n\\cellx3892\n' +
      '\\pard\\plain\\widctlpar\\intbl\\itap1{\\fs24 a}\\cell\n' +
      '\\pard\\plain\\widctlpar\\intbl\\itap1{\\fs24 b}\\cell\n' +
      '\\row\n' +
      '\\pard\\plain\\widctlpar{\\fs24 after}\n}');
    assert.deepEqual(lost, []);
    sameBack(d);
  });

  const MERGES = tbl([
    tr([tc(p(r('wide')), {tcPr: '<w:gridSpan w:val="2"/>' +
      '<w:vAlign w:val="center"/><w:shd w:val="clear" ' +
      'w:color="auto" w:fill="FFFF00"/>'}),
    tc(p(r('down')), {tcPr: '<w:vMerge w:val="restart"/>' +
      '<w:tcBorders><w:top w:val="double" w:sz="6" ' +
      'w:color="FF0000"/><w:left w:val="nil"/></w:tcBorders>'})],
    {trPr: '<w:trHeight w:val="400" w:hRule="exact"/><w:tblHeader/>'}),
    tr([tc(p(r('x'))), tc(p(r('y')), {tcPr: '<w:shd w:val="pct25" ' +
      'w:color="0000FF" w:fill="00FF00"/><w:vAlign w:val="bottom"/>'}),
    tc(p(), {tcPr: '<w:vMerge/>'})], {trPr: '<w:cantSplit/>'}),
  ], {grid: [1500, 2500, 3000], tblPr: '<w:jc w:val="center"/>' +
    '<w:tblInd w:w="360" w:type="dxa"/><w:tblBorders><w:top ' +
    'w:val="single" w:sz="4" w:color="000000"/><w:insideH ' +
    'w:val="dashed" w:sz="8"/><w:insideV w:val="single" w:sz="4"/>' +
    '</w:tblBorders><w:tblCellMar><w:left w:w="72" w:type="dxa"/>' +
    '<w:right w:w="72" w:type="dxa"/></w:tblCellMar>'});

  it('merges, borders, shading, heights, alignment and indent read ' +
    'back equal', async () => {
    const d = await readDocx(await tblDocx(MERGES + p(r('after'))));
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    for (const word of ['\\clmgf', '\\clmrg', '\\clvmgf', '\\clvmrg',
      '\\clvertalc', '\\clvertalb', '\\clcbpat', '\\clshdng2500',
      '\\trrh-400', '\\trhdr', '\\trkeep', '\\trqc', '\\trgaph72',
      '\\trleft288', '\\trbrdrt\\brdrs\\brdrw10', '\\trbrdrh\\brdrdash',
      '\\clbrdrt\\brdrdb\\brdrw15', '\\clbrdrl\\brdrnone']) {
      assert.ok(s.includes(word), word);
    }
    assert.ok(balanced(s));
    const got = sameBack(d);
    const t = got.sections[0].blocks[0];
    assert.deepEqual(t.grid, [1500, 2500, 3000]);
    assert.equal(t.rows[0].cells.length, 2);
  });

  it('nested tables (three deep) as RTF 1.9 writes them', async () => {
    const d = await readDocx(await tblDocx(nestedTable(3) + p()));
    const {s} = W(d);
    assert.ok(s.includes('\\intbl\\itap2'), s);
    assert.ok(s.includes('\\intbl\\itap3'), s);
    assert.ok(s.includes('\\nestcell'), s);
    assert.ok(s.includes('{\\*\\nesttableprops\\trowd'), s);
    assert.ok(s.includes('\\nestrow}\n'), s);
    assert.ok(balanced(s));
    const got = sameBack(d);
    const t = tableCore(got.styles, got.sections[0].blocks[0]);
    assert.equal(t.rows[0].cells[0].blocks[1].rows[0].cells[0]
      .blocks[1].type, 'tbl');
  });

  it('a table style\'s borders are written; its other formatting ' +
    'counts once', async () => {
    const styles = '<w:style w:type="paragraph" w:default="1" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="table" w:styleId="Grid"><w:name w:val=' +
      '"Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" ' +
      'w:sz="4"/><w:bottom w:val="single" w:sz="4"/></w:tblBorders>' +
      '</w:tblPr></w:style><w:style w:type="table" ' +
      'w:styleId="Fancy"><w:name w:val="Fancy"/><w:tblStylePr ' +
      'w:type="firstRow"><w:rPr><w:b/></w:rPr></w:tblStylePr>' +
      '</w:style>';
    const t = (id) => tbl([tr([tc(p(r(id)))])], {tblPr:
      `<w:tblStyle w:val="${id}"/>`});
    const d = await readDocx(await tblDocx(t('Grid') + p() +
      t('Fancy') + p(), {styles}));
    const {s, lost} = W(d);
    assert.ok(s.includes('\\trbrdrt\\brdrs\\brdrw10\\trbrdrb'), s);
    assert.deepEqual(lost, [{what: LOST.tableStyles, count: 1}]);
    const got = back(d);
    assert.deepEqual(Object.keys(got.sections[0].blocks[0].tblPr
      .tblBorders), ['top', 'bottom']);
  });

  it('the fixtures\' tables (textutil and Word shapes) read back ' +
    'equal', () => {
    for (const f of ['07-table-merges-html.rtf', '08-table-docx.rtf',
      '13-letter-docx.rtf', '18-spec-word-tables.rtf']) {
      const d = fixture(f);
      assert.deepEqual(W(d).lost, [], f);
      sameBack(d, f);
    }
  });

  it('textutil reads the nested table as nested tables', {skip:
    !textutil}, async () => {
    const d = await readDocx(await tblDocx(nestedTable(2) +
      p(r('mid')) + tbl([tr([tc(p(r('a'))), tc(p(r('b')))])]) +
      p(r('end'))));
    const html = tu(d, 'html');
    const tags = html.split('\n').map((l) => l.trim()).filter((l) =>
      l.startsWith('<table') || l === '</table>' ||
      l.startsWith('<p')).map((l) => (l.startsWith('<p') ? 'p'
      : l === '</table>' ? ')' : '('));
    assert.equal(tags.join(''), '(p(p)p)p(pp)p', html);
    const txt = tu(d);
    for (const t of ['L1', 'L2', 'a', 'b', 'end']) {
      assert.ok(txt.includes(t), txt);
    }
  });
});

const hex = (b) => Buffer.from(b).toString('hex');
const picsOf = (doc) => {
  const out = [];
  for (const b of doc.sections[0].blocks) {
    if (b.type !== 'p') continue;
    for (const x of Object.values(b.inlines)) {
      const pic = x.node && pictureOf(x.node, docMap(doc));
      if (pic) out.push({pic, media: mediaOf(doc, pic.embed)});
    }
  }
  return out;
};

describe('RtfWrite: pictures', () => {
  it('a PNG is exactly this; its bytes and size survive', async () => {
    const png = pngBytes(4, 2);
    const d = await readDocx(await picDocx({pics: [{bytes: png,
      cx: 609600, cy: 304800}]}));
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    const h = hex(png);
    assert.ok(s.includes('{\\pict\\picscalex100\\picscaley100\\picw4' +
      '\\pich2\\picwgoal960\\pichgoal480\\pngblip\n' +
      h.slice(0, 128) + '\n' + h.slice(128) + '}'), s);
    const [x] = picsOf(back(d));
    assert.equal(hex(x.media.bytes), hex(png));
    assert.deepEqual([x.pic.cx, x.pic.cy], [609600, 304800]);
    sameBack(d);
  });

  it('JPEG, EMF and WMF from the fixture and the reader: bytes ' +
    'exact', () => {
    const d = fixture('17-spec-word-pictures.rtf');
    assert.deepEqual(W(d).lost, []);
    const a = picsOf(d), b = picsOf(back(d));
    assert.equal(b.length, a.length);
    a.forEach((x, i) => {
      assert.equal(hex(b[i].media.bytes), hex(x.media.bytes));
      assert.deepEqual([b[i].pic.cx, b[i].pic.cy],
        [x.pic.cx, x.pic.cy]);
    });
    assert.ok(W(d).s.includes('\\jpegblip'));
    assert.ok(W(d).s.includes('\\emfblip'));
    const wmf = '010009000003' + '0c000000' + '0000' + '03000000' +
      '0000' + '030000000000';
    const m = rtf('{\\rtf1 a{\\pict\\picwgoal720\\pichgoal720' +
      '\\wmetafile8 ' + wmf + '}b\\par}');
    const s = W(m).s;
    assert.ok(s.includes('\\wmetafile8\n' + wmf + '}'), s);
    assert.equal(hex(picsOf(back(m))[0].media.bytes),
      hex(picsOf(m)[0].media.bytes));
  });

  it('hex lines are at most 128 digits; a large picture is exact',
    async () => {
      const png = pngBytes(300, 200, {rgb: [10, 200, 30]});
      const d = await readDocx(await picDocx({pics: [{bytes: png}]}));
      const s = W(d).s;
      const lines = s.split('\n');
      const digits = (l) => [...l].every((c) =>
        '0123456789abcdef'.includes(c));
      assert.ok(lines.some((l) => l.length === 128 && digits(l)));
      assert.ok(lines.every((l) => l.length <= 128 || !digits(l)));
      assert.equal(hex(picsOf(back(d))[0].media.bytes), hex(png));
    });

  it('other formats, missing media, floating and cropped pictures ' +
    'and alt text', async () => {
    const d = await readDocx(await picDocx({pics: [
      {bytes: gifBytes(2, 2), ext: 'gif'}, {bytes: null},
      {kind: 'anchor', bytes: jpegBytes(1, 1), ext: 'jpeg'},
      {srcRect: {l: 10000}, descr: 'A "red" box'}]}));
    const {s, lost} = W(d);
    assert.deepEqual(lost, [{what: LOST.pictures, count: 2},
      {what: LOST.positions, count: 1}, {what: LOST.crops, count: 1}]);
    assert.ok(s.includes('{\\*\\picprop{\\sp{\\sn wzDescription}' +
      '{\\sv A "red" box}}}'), s);
    assert.equal(picsOf(back(d)).length, 2);
  });

  it('a picture in a header: its own relationships', async () => {
    const png = pngBytes(4, 2);
    const d = await readDocx(await wordHf({body: p(r('x')),
      default: {hdr: p(picRun('rIdP1'))}, pic: png}));
    assert.deepEqual(W(d).lost, []);
    const got = back(d);
    assert.deepEqual(storiesCore(got), storiesCore(d));
    const st = [...got.stories.values()][0];
    const parts = [...got.parts.keys()].filter((k) =>
      k.startsWith('word/media/'));
    assert.equal(parts.length, 1);
    assert.equal(hex(got.parts.get(parts[0])), hex(png));
    assert.equal(st.rels.length, 1);
  });
});

describe('RtfWrite: lists', () => {
  it('the list and override tables, \\ls \\ilvl and the label',
    async () => {
      const d = await readDocx(await LIST_DOCS[2][1]());
      const {s, lost} = W(d);
      assert.deepEqual(lost, []);
      assert.ok(s.includes('{\\*\\listoverridetable\n' +
        '{\\listoverride\\listid1\\listoverridecount0\\ls2}\n' +
        '{\\listoverride\\listid1\\listoverridecount9{\\lfolevel' +
        '\\listoverridestartat\\levelstartat5}' +
        '{\\lfolevel}'.repeat(8) + '\\ls3}\n'), s);
      assert.ok(s.includes('{\\listlevel\\levelnfc0\\levelnfcn0' +
        '\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat1' +
        "{\\leveltext\\'02\\'00.;}{\\levelnumbers\\'01;}" +
        '\\fi-360\\li720}'),
      s);
      assert.ok(s.includes('\\ls3\\ilvl0{\\listtext\\fs22 6.\\tab }' +
        '{\\fs22 six}'), s);
      // a heading style's list in the style sheet
      assert.ok(s.includes('\\outlinelevel0\\ls5\\ilvl0'), s);
    });

  for (const [name, make] of LIST_DOCS) {
    it('reads back with the same numbers: ' + name, async () => {
      const d = await readDocx(await make());
      sameBack(d, name);
      assert.ok(labels(d).size > 0);
    });
  }

  it('the fixtures\' lists (textutil and Word shapes)', () => {
    for (const f of ['05-lists-html.rtf', '06-lists-docx.rtf',
      '15-spec-word-lists.rtf']) sameBack(fixture(f), f);
  });

  it('the reader takes \\levellegal and \\levelnorestart', () => {
    const d = rtf('{\\rtf1{\\*\\listtable{\\list{\\listlevel' +
      "\\levelnfc0\\levelstartat1{\\leveltext\\'02\\'00.;}}" +
      "{\\listlevel\\levelnfc0\\levellegal1\\levelnorestart1" +
      "{\\leveltext\\'03\\'00.\\'01;}}\\listid7}}" +
      '{\\*\\listoverridetable{\\listoverride\\listid7\\ls1}}' +
      '\\pard\\ls1\\ilvl1 x\\par}');
    const lv = d.numbering.nums.get(1).levels[1];
    assert.equal(lv.isLgl, true);
    assert.equal(lv.lvlRestart, 0);
  });

  it('a list turned off under a style that has one: \\ls0',
    async () => {
    const styles = '<w:style w:type="paragraph" w:default="1" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Item"><w:name w:val=' +
      '"Item"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>' +
      '</w:style>';
    const num = numberingXml('<w:abstractNum w:abstractNumId="0">' +
      lvl(0) + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId ' +
      'w:val="0"/></w:num>');
    const d = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('on'), '<w:pStyle w:val="Item"/>') + p(r('off'),
        '<w:pStyle w:val="Item"/><w:numPr><w:numId w:val="0"/>' +
        '</w:numPr>')), 'word/styles.xml': stylesXml(styles),
    'word/numbering.xml': num}));
    const s = W(d).s;
    assert.ok(s.includes('\\ls0{\\fs'), s);
    const got = sameBack(d);
    assert.equal(labels(got).size, 1);
  });

  it('a list paragraph is written at its level\'s indent (style < ' +
    'level < its own), and reads back with no indent of its own',
  async () => {
    const styles = '<w:style w:type="paragraph" w:default="1" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name ' +
      'w:val="List Paragraph"/><w:pPr><w:ind w:left="720"/></w:pPr>' +
      '</w:style>';
    const num = numberingXml('<w:abstractNum w:abstractNumId="0">' +
      lvl(0) + lvl(1) + lvl(2) + '</w:abstractNum><w:num w:numId="1">' +
      '<w:abstractNumId w:val="0"/></w:num>');
    const item = (k, own = '') => p(r('L' + k), '<w:pStyle ' +
      'w:val="ListParagraph"/><w:numPr><w:ilvl w:val="' + k + '"/>' +
      '<w:numId w:val="1"/></w:numPr>' + own);
    const d = await readDocx(await buildDocx({'word/document.xml':
      documentXml(item(0) + item(1) + item(2) +
        item(1, '<w:ind w:left="3000"/>') +
        item(2, '<w:ind w:left="720"/>')),
    'word/styles.xml': stylesXml(styles), 'word/numbering.xml': num}));
    const paras = body(W(d).s).split('\\pard').slice(1);
    const ind = (s) => (s.match(/\\li\d+|\\fi-?\d+/g) || []).join('');
    assert.deepEqual(paras.map(ind), ['\\li720\\fi-360',
      '\\li1440\\fi-360', '\\li2160\\fi-360', '\\li3000\\fi-360',
      '\\li720\\fi-360']);
    const got = sameBack(d);
    const own = got.sections[0].blocks.map((b) => b.pPr.ind || null);
    assert.deepEqual(own, [null, null, null, {left: 3000},
      {left: 720}]);
    assert.deepEqual(labels(got).size, 5);
  });

  it('an override that replaces a level counts', async () => {
    const num = numberingXml('<w:abstractNum w:abstractNumId="0">' +
      lvl(0) + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId ' +
      'w:val="0"/><w:lvlOverride w:ilvl="0">' + lvl(0, {fmt:
        'upperRoman'}) + '</w:lvlOverride></w:num>');
    const d = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('x'), '<w:numPr><w:ilvl w:val="0"/><w:numId ' +
        'w:val="1"/></w:numPr>')), 'word/numbering.xml': num}));
    assert.deepEqual(W(d).lost, [{what: LOST.listLevels, count: 1}]);
  });

  it('textutil sees the lists', {skip: !textutil}, async () => {
    const d = await readDocx(await LIST_DOCS[2][1]());
    const html = tu(d, 'html');
    assert.equal(html.split('<ol').length - 1, 3, html);
    assert.ok(html.includes('<li class="li1">six</li>'), html);
  });
});

describe('RtfWrite: fields', () => {
  it('a PAGE field is exactly this; its marks keep the run\'s format',
    () => {
      const d = tiny([fieldPara('p ', ' PAGE ', '7', '.')]);
      const {s, lost} = W(d);
      assert.deepEqual(lost, []);
      assert.equal(body(s), '\\sectd\\headery708\\footery708\n' +
        '\\pard\\plain\\widctlpar{\\fs24 p }{\\field\\fs24' +
        '{\\*\\fldinst {\\fs24  PAGE }}{\\fldrslt {\\fs24 7}}}' +
        '{\\fs24 .}\n}');
      sameBack(d);
    });

  // { IF { PAGE } = 1 "one" "more" } as Word writes it: the inner
  // field's marks, code and result inside the outer's code region
  const ifPage = (inner = ' PAGE ', tail = 'x') => {
    const t = 'a' + OBJ + OBJ + OBJ + OBJ + OBJ + '1' + OBJ + OBJ + OBJ +
      'one' + OBJ + tail;
    return newPara(t, {inlines: {1: fc('begin'), 2: instr(' IF '),
      3: fc('begin'), 4: instr(inner), 5: fc('separate'),
      7: fc('end'), 8: instr(' = 1 "one" "more" '), 9: fc('separate'),
      13: fc('end')}});
  };

  it('a field in a field\u2019s code is written inside \\fldinst ' +
    '(task 12): no stray text, nothing lost', () => {
    const d = tiny([ifPage()]);
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    assert.equal(body(s), '\\sectd\\headery708\\footery708\n' +
      '\\pard\\plain\\widctlpar{\\fs24 a}{\\field\\fs24{\\*\\fldinst ' +
      '{\\fs24  IF {\\field{\\*\\fldinst { PAGE }}{\\fldrslt {1}}} = 1 ' +
      '"one" "more" }}{\\fldrslt {\\fs24 one}}}{\\fs24 x}\n}');
    assert.ok(balanced(s));
    // (our reader takes a field in a code as its result text)
    const p = back(d).sections[0].blocks[0];
    assert.equal(p.text.split(OBJ).join(''), 'aonex');
    const codes = Object.values(p.inlines).filter((x) => x.node &&
      x.node.name === 'w:instrText').map((x) => x.node.children.join(''));
    assert.deepEqual(codes, [' IF 1 = 1 "one" "more" ']);
  });

  it('a field in a code of a kind not kept: its result as code text; ' +
    'a code field not whole in the paragraph: counted', () => {
    const d = tiny([ifPage(' MERGEFIELD Name ')]);
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    assert.ok(s.includes('{\\*\\fldinst {\\fs24  IF 1 = 1 "one" ' +
      '"more" }}{\\fldrslt {\\fs24 one}}'), s);
    assert.ok(!s.includes('MERGEFIELD'));
    // the inner field's end in the next paragraph
    const p = ifPage();
    const cut = newPara(p.text.slice(0, 7), {inlines: {1: p.inlines[1],
      2: p.inlines[2], 3: p.inlines[3], 4: p.inlines[4],
      5: p.inlines[5]}});
    const d2 = tiny([cut, newPara('next')]);
    const w2 = W(d2);
    assert.deepEqual(w2.lost, [{what: LOST.nested, count: 1}]);
    assert.ok(balanced(w2.s));
    assert.equal(back(d2).sections[0].blocks.map((b) =>
      b.text.split(OBJ).join('')).join('|'), 'a|next');
  });

  it('a field of another kind keeps its result, counted once each',
    () => {
      for (const code of [' MERGEFIELD Name ', ' INCLUDETEXT "x" ',
        ' FOO ', ' HYPERLINK "javascript:alert(1)" ', ' PAGE1 ',
        ' "PAGE" ']) {
        const d = tiny([fieldPara('a', code, 'res', 'b')]);
        const {s, lost} = W(d);
        assert.deepEqual(lost, [{what: LOST.fields, count: 1}], code);
        assert.ok(!s.includes('\\field'), code);
        assert.equal(back(d).sections[0].blocks[0].text, 'aresb', code);
      }
    });

  it('locked and dirty; a TOC over paragraphs; a field left open is ' +
    'closed', () => {
    const p1 = fieldPara('', ' TOC \\o "1-3" ', 'One');
    const res = p1.inlines[String(p1.text.length - 1)];
    delete p1.inlines[String(p1.text.length - 1)];
    p1.text = p1.text.slice(0, -1);
    p1.runs = [{start: 0, end: p1.text.length, rPr: {extra: []}}];
    p1.inlines['0'] = raw('w:fldChar', [['w:fldCharType', 'begin'],
      ['w:fldLock', '1'], ['w:dirty', 'true']]);
    const p2 = newPara('Two' + OBJ, {inlines: {3: res}});
    const open = fieldPara('x', ' PAGE ', '1');
    delete open.inlines[String(open.text.length - 1)];
    open.text = open.text.slice(0, -1);
    open.runs = [{start: 0, end: open.text.length, rPr: {extra: []}}];
    const d = tiny([p1, p2, open]);
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    assert.ok(s.includes('{\\field\\fldlock\\flddirty\\fs24'), s);
    assert.ok(balanced(s), s);
    const got = back(d).sections[0].blocks;
    assert.equal(got[0].text, OBJ + OBJ + OBJ + 'One');
    assert.equal(got[1].text, 'Two' + OBJ);
    assert.equal(got[2].text, 'x' + OBJ + OBJ + OBJ + '1' + OBJ);
    const lock = got[0].inlines['0'].node.attrs;
    assert.ok(lock.some(([k]) => k === 'w:fldLock'));
  });

  it('a link inside a field\'s result leaves the field open until ' +
    'its end', () => {
    const link = {kind: 'raw', level: 'p', text: 'Aim',
      node: el('w:hyperlink', [['w:anchor', 'Aim']], el('w:r', null,
        el('w:t', null, 'Aim')))};
    const p1 = newPara(OBJ + OBJ + OBJ + 'x' + OBJ, {inlines: {
      0: fc('begin'), 1: instr(' TOC '), 2: fc('separate'), 4: link}});
    const d = tiny([p1, newPara('y' + OBJ, {inlines: {1: fc('end')}})]);
    const {s} = W(d);
    assert.ok(balanced(s), s);
    const got = back(d).sections[0].blocks;
    assert.equal(got[1].text, 'y' + OBJ);
    assert.equal(got[1].inlines['1'].node.name, 'w:fldChar');
  });

  it('a simple field; one of another kind keeps its runs', () => {
    const f = (code) => newPara('a' + OBJ, {inlines: {1: {kind: 'raw',
      level: 'p', text: '3', node: el('w:fldSimple', [['w:instr',
        code]], el('w:r', null, el('w:t', null, '3')))}}});
    const ok = W(tiny([f(' NUMPAGES ')]));
    assert.ok(ok.s.includes('{\\field{\\*\\fldinst  NUMPAGES }' +
      '{\\fldrslt {\\fs24 3}}}'), ok.s);
    assert.deepEqual(ok.lost, []);
    const no = W(tiny([f(' DDE x ')]));
    assert.deepEqual(no.lost, [{what: LOST.fields, count: 1}]);
    assert.equal(back(tiny([f(' DDE x ')])).sections[0].blocks[0].text,
      'a3');
  });
});

const linkDoc = (inner, rels) => buildDocx({'word/document.xml':
  documentXml(p(r('see ') + inner + r(' end')) + p(r('target'),
    '') .replace('<w:p>', '<w:p><w:bookmarkStart w:id="0" ' +
    'w:name="Aim"/>').replace('</w:p>', '<w:bookmarkEnd w:id="0"/>' +
    '</w:p>'))}, {docRels: rels});

describe('RtfWrite: links and bookmarks', () => {
  it('an external link, an anchor link with a tip, and a bookmark',
    async () => {
      const d = await readDocx(await linkDoc('<w:hyperlink ' +
        'r:id="rIdL1">' + r('site', '<w:b/>') + '</w:hyperlink>' +
        '<w:hyperlink w:anchor="Aim" w:tooltip=\'say "hi"\'>' +
        r('here') + '</w:hyperlink>',
      [['rIdL1', REL('hyperlink'), 'https://example.com/a?b=1&c=2',
        'External']]));
      const {s, lost} = W(d);
      assert.deepEqual(lost, []);
      assert.ok(s.includes('{\\field{\\*\\fldinst {HYPERLINK ' +
        '"https://example.com/a?b=1&c=2"}}{\\fldrslt {\\b\\fs'), s);
      assert.ok(s.includes('{HYPERLINK \\\\l "Aim" \\\\o ' +
        '"say \\\\"hi\\\\""}'), s);
      assert.ok(s.includes('{\\*\\bkmkstart Aim}'), s);
      assert.ok(s.includes('{\\*\\bkmkend Aim}'), s);
      const got = sameBack(d);
      const links = Object.values(got.sections[0].blocks[0].inlines);
      const rel = got.rels.find((x) => x.id === links[0].node.attrs
        .find(([k]) => k === 'r:id')[1]);
      assert.equal(rel.target, 'https://example.com/a?b=1&c=2');
      assert.equal(inside(links[0].node, docMap(got)).runs[0].rPr.b,
        true);
      assert.ok(links[1].node.attrs.some(([k, v]) =>
        k === 'w:tooltip' && v === 'say "hi"'));
      assert.deepEqual([...bookmarksOf(got).byName.keys()], ['Aim']);
    });

  it('a link to an address not allowed, or with no relationship: ' +
    'its text, counted', async () => {
    const d = await readDocx(await linkDoc('<w:hyperlink ' +
      'r:id="rIdL1">' + r('bad') + '</w:hyperlink><w:hyperlink ' +
      'r:id="rIdNone">' +
      r('gone') + '</w:hyperlink>', [['rIdL1', REL('hyperlink'),
      'javascript:alert(1)', 'External']]));
    const {s, lost} = W(d);
    assert.deepEqual(lost, [{what: LOST.links, count: 2}]);
    assert.ok(!s.includes('HYPERLINK'), s);
    assert.equal(back(d).sections[0].blocks[0].text, 'see badgone end');
  });

  it('bookmarks whose names cannot be kept count once each', () => {
    const bm = (id, name) => raw('w:bookmarkStart', [['w:id', id],
      ['w:name', name]], 'p');
    const d = tiny([newPara(OBJ + OBJ + OBJ + 'x' + OBJ, {inlines: {
      0: bm('1', 'has space'), 1: bm('2', 'ok'), 2: bm('3', 'ok'),
      4: raw('w:bookmarkEnd', [['w:id', '2']], 'p')}})]);
    const {s, lost} = W(d);
    assert.deepEqual(lost, [{what: LOST.bookmarks, count: 2}]);
    assert.ok(body(s).includes('{\\*\\bkmkstart ok}x{\\*\\bkmkend ok}'),
      s);
  });
});

describe('RtfWrite: sections, headers and footers', () => {
  it('columns, title page, page numbers, vertical alignment', () => {
    const d = tiny([newPara('a')]);
    Object.assign(d.sections[0].props, {cols: {num: 2, space: 540,
      sep: true}, titlePg: true, pgNumType: {start: 4,
      fmt: 'lowerRoman'}, vAlign: 'center'});
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    assert.ok(s.includes('\\sectd\\headery708\\footery708\\cols2' +
      '\\colsx540\\linebetcol\\titlepg\\pgnrestart\\pgnstarts4' +
      '\\pgnlcrm\\vertalc\n'), s);
    const pr = back(d).sections[0].props;
    assert.deepEqual(pr.cols, {num: 2, space: 540, sep: true});
    assert.equal(pr.titlePg, true);
    assert.deepEqual(pr.pgNumType, {start: 4, fmt: 'lowerRoman'});
    assert.equal(pr.vAlign, 'center');
  });

  it('uneven columns and line numbers count', () => {
    const d = tiny([newPara('a')]);
    Object.assign(d.sections[0].props, {cols: {num: 2, equalWidth:
      false, col: [{w: 3000, space: 300}, {w: 5000}]},
    lnNumType: {countBy: 1}});
    assert.deepEqual(W(d).lost, [{what: LOST.columns, count: 1},
      {what: LOST.lineNumbers, count: 1}]);
  });

  it('default, first and even headers and footers, odd and even ' +
    'pages', async () => {
    const d = await readDocx(await wordHf({body: p(r('x')),
      default: {hdr: p(r('Head')) + p(r('two')), ftr: p(r('Foot'))},
      first: {hdr: p(r('First'))}, even: {ftr: p(r('Even'))},
      titlePg: true, evenAndOdd: true}));
    const {s, lost} = W(d);
    assert.deepEqual(lost, []);
    assert.ok(s.includes('\\facingp\n'), s);
    for (const g of ['{\\headerr\n', '{\\headerf\n', '{\\footerr\n',
      '{\\footerl\n']) assert.ok(s.includes(g), g);
    const got = back(d);
    assert.deepEqual(storiesCore(got), storiesCore(d));
    assert.equal(got.sections[0].props.titlePg, true);
  });

  it('the fixture\'s sections with their own headers, a PAGE field ' +
    'in a footer', () => {
    const d = fixture('16-spec-word-sections.rtf');
    assert.deepEqual(W(d).lost, []);
    const got = sameBack(d);
    assert.deepEqual(storiesCore(got), storiesCore(d));
    assert.ok(balanced(W(d).s));
  });
});

describe('RtfWrite: footnotes and endnotes', () => {
  const notes = () => noteDoc(p(r('Body') + mark(2) + r(' more') +
    emark(2) + r('.')), {2: noteP('A footnote.')}, {endnotes:
    {2: enoteP('An endnote.')}});

  it('as {\\footnote ...} after \\chftn, an endnote with \\ftnalt',
    async () => {
      const d = await notes();
      const {s, lost} = W(d);
      assert.deepEqual(lost, []);
      assert.ok(s.includes('\\chftn{\\footnote\n\\pard\\plain'), s);
      assert.ok(s.includes('\\chftn{\\footnote\\ftnalt\n\\pard\\plain'),
        s);
      const got = sameBack(d);
      assert.deepEqual(notesCore(got), notesCore(d));
    });

  it('\\fetN in the header: 0 footnotes only, 1 endnotes only, 2 ' +
    'both; none without notes; each reads back the same', async () => {
      const fet = (s) => {
        const m = s.match(/\\fet(\d)/g) || [];
        assert.ok(m.length <= 1, s);
        assert.ok(!m.length || s.indexOf(m[0]) < s.indexOf('\\pard'), s);
        return m.length ? Number(m[0].slice(4)) : null;
      };
      const both = await notes();
      assert.equal(fet(W(both).s), 2);
      const foot = await noteDoc(p(r('Body') + mark(2)),
        {2: noteP('A footnote.')});
      assert.equal(fet(W(foot).s), 0);
      const end = await noteDoc(p(r('Body') + emark(2)), {},
        {endnotes: {2: enoteP('An endnote.')}});
      assert.equal(fet(W(end).s), 1);
      assert.equal(fet(W(tiny([newPara('a')])).s), null);
      for (const d of [both, foot, end]) {
        assert.deepEqual(notesCore(sameBack(d)), notesCore(d));
      }
    });

  it('the fixture\'s notes read back the same', () => {
    const d = fixture('19-spec-word-review.rtf');
    assert.deepEqual(notesCore(back(d)), notesCore(d));
  });

  it('a mark with no note, or in a header, is left out and counted',
    async () => {
      const d = await notes();
      const p0 = d.sections[0].blocks[0];
      const i = Object.keys(p0.inlines).find((k) =>
        p0.inlines[k].kind === 'noteRef');
      const bad = structuredClone(d);
      bad.sections[0].blocks[0].inlines[i] = {...p0.inlines[i], id: 99};
      assert.deepEqual(W(bad).lost, [{what: LOST.notes, count: 1}]);
      const hd = await readDocx(await wordHf({body: p(r('x')),
        default: {hdr: p(r('H') + mark(1))}}));
      assert.deepEqual(W(hd).lost, [{what: LOST.notes, count: 1}]);
    });
});

describe('RtfWrite: Word conformance', () => {
  it('a multilevel list has nine levels, a simple one its own',
    async () => {
      const num = (type) => numberingXml('<w:abstractNum ' +
        'w:abstractNumId="0"><w:multiLevelType w:val="' + type + '"/>' +
        lvl(0) + lvl(1, {fmt: 'lowerLetter', text: '%2)'}) +
        '</w:abstractNum><w:num w:numId="1"><w:abstractNumId ' +
        'w:val="0"/></w:num>');
      const doc = (type) => buildDocx({'word/document.xml':
        documentXml(['a', 'b', 'c'].map((t, i) => p(r(t),
          '<w:numPr><w:ilvl w:val="' + (i % 2) + '"/><w:numId ' +
          'w:val="1"/></w:numPr>')).join('')),
      'word/numbering.xml': num(type)});
      const count = (s) => s.split('{\\listlevel').length - 1;
      const multi = await readDocx(await doc('hybridMultilevel'));
      assert.equal(count(W(multi).s), 9);
      sameBack(multi);
      const one = await readDocx(await doc('singleLevel'));
      assert.equal(count(W(one).s), 2);
      sameBack(one);
    });

  it('a \';\' and a tab in level text: the length counts them and ' +
    'the text after survives', async () => {
    const num = numberingXml('<w:abstractNum w:abstractNumId="0">' +
      lvl(0, {text: '%1;&#9;-'}) + '</w:abstractNum><w:num w:numId="1">' +
      '<w:abstractNumId w:val="0"/></w:num>');
    const d = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('x'), '<w:numPr><w:ilvl w:val="0"/><w:numId ' +
        'w:val="1"/></w:numPr>')), 'word/numbering.xml': num}));
    const s = W(d).s;
    assert.ok(s.includes("{\\leveltext\\'04\\'00\\'3b\\tab -;}"), s);
    const lv = back(d).numbering.nums.get(1).levels[0];
    // (the reader keeps no control characters: the tab is dropped)
    assert.equal(lv.lvlText, '%1;-');
  });

  it('headers, footers and notes end their last paragraph with ' +
    '\\par, with no empty paragraph more', async () => {
    const h = await readDocx(await wordHf({body: p(r('x')),
      default: {hdr: p(r('Head')), ftr: p(r('Foot')) + p()}}));
    const s = W(h).s;
    assert.ok(s.includes('{\\fs20 Head}\\par\n}'), s);
    assert.deepEqual(storiesCore(back(h)), storiesCore(h));
    const n = await noteDoc(p(r('Body') + mark(2)),
      {2: noteP('A note.')});
    assert.ok(W(n).s.includes(' A note.}\\par\n}'), W(n).s);
    assert.deepEqual(notesCore(back(n)), notesCore(n));
  });

  it('a row with no cells is left out', () => {
    const t = newTable({grid: [2000], rows: [newRow([cell('a')])]});
    const d = tiny([{...t, rows: [{cells: [], trPr: {extra: []}},
      t.rows[0], {cells: null}]}, newPara('after')]);
    const s = W(d).s;
    assert.equal(s.split('\\trowd').length - 1, 1, s);
    assert.equal(s.split('\\row\n').length - 1, 1, s);
    assert.equal(back(d).sections[0].blocks[0].rows.length, 1);
  });

  it('picture goals at most 31680; past MAX_PICTURES pictures the ' +
    'rest count', async () => {
    const d = await readDocx(await picDocx({pics: [{cx: 914400 * 30,
      cy: 914400}]}));
    assert.ok(W(d).s.includes('\\picwgoal31680\\pichgoal1440'),
      W(d).s);
    const x = d.sections[0].blocks[0];
    const i = x.text.indexOf(OBJ);
    const many = newPara(OBJ.repeat(1003), {inlines: Object.fromEntries(
      Array.from({length: 1003}, (_, k) => [k, x.inlines[String(i)]]))});
    const m = {...d, sections: [{...d.sections[0], blocks: [many]}]};
    assert.deepEqual(W(m).lost, [{what: LOST.pictures, count: 3}]);
  });
});

describe('RtfWrite: the structures together', () => {
  async function mixed() {
    return noteDoc(tbl([tr([tc(p(r('cell') + mark(2))),
      tc(tbl([tr([tc(p(r('inner')))])]) + p())])]) +
      p(r('end')), {2: noteP('In a cell.')});
  }

  it('ASCII, deterministic, balanced, the doc unchanged', async () => {
    const d = await mixed();
    const before = structuredClone(d);
    const a = W(d), b = W(d);
    assert.deepEqual(a.bytes, b.bytes);
    assert.ok(a.bytes.every((c) => c < 0x80));
    assert.ok(balanced(a.s));
    assert.ok(!a.s.includes('undefined') && !a.s.includes('NaN'));
    assert.deepEqual(d, before);
    const got = sameBack(d);
    assert.deepEqual(notesCore(got), notesCore(d));
  });

  it('never throws on broken structures; braces still balance',
    async () => {
      const d = await mixed();
      const t = d.sections[0].blocks[0];
      const cases = [
        (x) => { x.rows[0].cells[0].blocks = []; },
        (x) => { x.rows[0].cells = null; },
        (x) => { x.grid = ['a', -5]; },
        (x) => {
          x.rows[0].trPr = {gridBefore: 99, trHeight: {val: 'x'}};
        },
        (x) => { x.rows[0].cells[0].tcPr = {gridSpan: 1e9}; },
        (x) => { x.rows = [null, 3]; },
      ];
      for (const f of cases) {
        const x = structuredClone(t);
        f(x);
        const doc = {...d, sections: [{...d.sections[0], blocks: [x,
          newPara('after')]}]};
        const {s} = W(doc);
        assert.ok(balanced(s), f.toString());
        assert.ok(s.endsWith('}'));
      }
      const odd = tiny([newPara(OBJ + OBJ + OBJ, {inlines: {
        0: fc('end'), 1: fc('separate'), 2: fc('begin')}})]);
      assert.ok(balanced(W(odd).s));
    });

  it('textutil reads the text of a table, a field, a link and a ' +
    'note', {skip: !textutil}, async () => {
    const d = await mixed();
    const txt = tu(d);
    for (const t of ['cell', 'inner', 'end']) {
      assert.ok(txt.includes(t), txt);
    }
    const f = tiny([fieldPara('p ', ' PAGE ', '7', '.')]);
    assert.equal(tu(f), 'p 7.');
    const l = await readDocx(await linkDoc('<w:hyperlink ' +
      'r:id="rIdL1">' + r('site') + '</w:hyperlink>', [['rIdL1',
      REL('hyperlink'), 'https://example.com/', 'External']]));
    assert.equal(tu(l), 'see site end\ntarget');
    assert.ok(tu(l, 'html').includes('href="https://example.com/"'));
  });
});
