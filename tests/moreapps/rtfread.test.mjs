// RtfRead (Batch G2, task 3): the reader core. RTF bytes -> a Doc
// built from ./NewDoc and the Model builders, plus notes.
// Fixtures: tests/moreapps/rtf-fixtures/ (real textutil output, see
// its README); small strings for the rest. Every Doc read here must
// write as .docx and read back equal (docx-compare's assertSameDoc
// after expectedBack, as the docx tests check their models; with
// withNewParts, withNewStories and withNewReview for the parts the
// reader makes).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {fontName} from '../../tools/moreapps/!Letters/RtfTables';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview}
  from './docx-compare.mjs';

const DIR = fileURLToPath(new URL('./rtf-fixtures/', import.meta.url));
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const R = (s, o = {}) => readRtf(enc(s), {date: DATE, ...o});
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
const texts = (doc) => paras(doc).map((p) => p.text);
/** The runs of paragraph k as [text, rPr without extra, rStyle?]. */
const runs = (doc, k = 0) => {
  const p = paras(doc)[k];
  return p.runs.map((r) => {
    const {extra, ...f} = r.rPr;
    const o = [p.text.slice(r.start, r.end), f];
    if (extra.length) o.push(extra.map((n) => n.name));
    if (r.rStyle !== undefined) o.push('style ' + r.rStyle);
    return o;
  });
};
const fixtures = () => fs.readdirSync(DIR).filter((f) =>
  f.endsWith('.rtf')).sort();
const fixture = (f) => new Uint8Array(fs.readFileSync(DIR + f));

/** writeDocx then readDocx gives the same Doc back. */
async function roundTrips(doc, what) {
  for (const s of doc.sections) for (const b of s.blocks) checkBlock(b);
  const back = await readDocx(await writeDocx(doc, {date: DATE}));
  // (a numbering part, header, notes or comments made by the reader:
  // as a command's)
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
}

describe('RtfRead: text and paragraphs', () => {
  it('plain text and paragraphs', () => {
    const {doc, notes} = R('{\\rtf1\\ansi Hello\\par World}');
    assert.deepEqual(texts(doc), ['Hello', 'World']);
    assert.deepEqual(notes, []);
  });

  it('the plain-text fixture', () => {
    const {doc, notes} = readRtf(fixture('01-plain-text.rtf'));
    assert.deepEqual(texts(doc), ['Plain text file.',
      'Second line with a tab:\there.']);
    assert.deepEqual(notes, []);
  });

  it('\\line, \\tab, \\page and the specials', () => {
    const {doc} = R('{\\rtf1 a\\line b\\tab c\\page d' +
      '\\emdash\\endash\\~\\bullet\\lquote\\rquote\\ldblquote' +
      '\\rdblquote\\-\\_e}');
    const p = paras(doc)[0];
    assert.equal(p.text, 'a\nb\tc\ufffcd\u2014\u2013\u00a0\u2022' +
      '\u2018\u2019\u201c\u201d\ufffc\ufffce');
    assert.deepEqual(p.inlines['5'], {kind: 'br', level: 'r',
      brType: 'page'});
    assert.equal(p.inlines['15'].node.name, 'w:softHyphen');
    assert.equal(p.inlines['16'].node.name, 'w:noBreakHyphen');
  });

  it('a last paragraph without \\par is kept; a final \\par ' +
    'makes no empty one', () => {
    assert.deepEqual(texts(R('{\\rtf1 a\\par b}').doc), ['a', 'b']);
    assert.deepEqual(texts(R('{\\rtf1 a\\par b\\par }').doc),
      ['a', 'b']);
    assert.deepEqual(texts(R('{\\rtf1 a\\par \\par b}').doc),
      ['a', '', 'b']);
  });

  it('text after the document group ends is ignored', () => {
    assert.deepEqual(texts(R('{\\rtf1 a}junk{b}').doc), ['a']);
  });
});

describe('RtfRead: character formatting', () => {
  const HEAD = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Arial;}' +
    '{\\f1\\froman Times New Roman;}}' +
    '{\\colortbl;\\red255\\green0\\blue0;\\red255\\green255\\blue0;}';

  it('bold, italic, underline, size, colour and font runs', () => {
    const {doc} = R(HEAD + 'a\\b b\\b0 \\i c\\i0 \\ul d\\ulnone ' +
      '\\fs32 e\\fs24 \\cf1 f\\cf0 \\f1 g\\f0 \\strike h\\strike0 ' +
      '\\super i\\nosupersub \\sub j\\nosupersub \\highlight2 k' +
      '\\highlight0 \\uldb l\\ul0 m}');
    assert.deepEqual(runs(doc), [
      ['a', {}], ['b', {b: true}], ['c', {i: true}],
      ['d', {u: 'single'}], ['e', {sz: 32}], ['f', {color: 'FF0000'}],
      ['g', {rFonts: {ascii: 'Times New Roman',
        hAnsi: 'Times New Roman'}}],
      ['h', {strike: true}], ['i', {vertAlign: 'superscript'}],
      ['j', {vertAlign: 'subscript'}], ['k', {highlight: 'yellow'}],
      ['l', {u: 'double'}], ['m', {}]]);
  });

  it('the defaults: \\deff font and 12 pt in docDefaults', () => {
    const {doc} = R(HEAD + 'a}');
    assert.deepEqual(doc.styles.docDefaults.rPr, {rFonts: {
      ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial'},
    sz: 24, szCs: 24, extra: []});
    assert.deepEqual(doc.styles.docDefaults.pPr, {extra: []});
  });

  it('\\chcbpat is shading; \\cb is ignored, as Word does', () => {
    const {doc} = R(HEAD + '\\cb2 a\\chcbpat2 b}');
    assert.deepEqual(runs(doc), [['a', {}], ['b', {shd: {val: 'clear',
      color: 'auto', fill: 'FFFF00'}}]]);
  });

  it('caps, small caps, hidden and double strike go to extra', () => {
    const {doc} = R(HEAD + '\\caps a\\caps0 \\scaps b\\scaps0 ' +
      '\\v c\\v0 \\striked1 d\\striked0 e}');
    assert.deepEqual(runs(doc), [['a', {}, ['w:caps']],
      ['b', {}, ['w:smallCaps']], ['c', {}, ['w:vanish']],
      ['d', {}, ['w:dstrike']], ['e', {}]]);
  });

  it('\\plain resets character formatting', () => {
    const {doc} = R(HEAD + '\\b\\i\\fs40\\cf1\\f1 a\\plain b}');
    assert.deepEqual(runs(doc), [['a', {b: true, i: true, sz: 40,
      color: 'FF0000', rFonts: {ascii: 'Times New Roman',
        hAnsi: 'Times New Roman'}}], ['b', {}]]);
  });

  it('groups restore the formatting outside them', () => {
    const {doc} = R(HEAD + 'a{\\b b{\\i c}d}e}');
    assert.deepEqual(runs(doc), [['a', {}], ['b', {b: true}],
      ['c', {b: true, i: true}], ['d', {b: true}], ['e', {}]]);
  });

  it('\\pard resets paragraph formatting', () => {
    const {doc} = R(HEAD + '\\qc a\\par b\\par\\pard c\\par\\qr d}');
    assert.deepEqual(paras(doc).map((p) => p.pPr.jc),
      ['center', 'center', undefined, 'right']);
  });

  it('the formatting fixture: runs as textutil wrote them', () => {
    const {doc} = readRtf(fixture('02-formatting-docx.rtf'));
    const first = runs(doc, 0);
    // f0 (Times-Roman) is the default font; Times-Bold and
    // Times-Italic are the same family
    assert.deepEqual(first.slice(0, 4).map((r) => r.slice(0, 2)), [
      ['Plain, ', {}], ['bold ', {b: true}], ['italic ', {i: true}],
      ['underlined ', {u: 'single'}]]);
    assert.equal(doc.styles.docDefaults.rPr.rFonts.ascii, 'Times');
  });
});

describe('RtfRead: characters', () => {
  it('\\uN? with the default skip of one', () => {
    const {doc} = R('{\\rtf1 a\\u8364?b\\u-3913?c}');
    assert.deepEqual(texts(doc), ['a\u20acb\uf0b7c']);
  });

  it('\\uc0 and \\uc2 skip counts', () => {
    assert.deepEqual(texts(R('{\\rtf1\\uc0\\u8364 x}').doc),
      ['\u20acx']);
    assert.deepEqual(texts(R('{\\rtf1\\uc2\\u8364ab c}').doc),
      ['\u20ac c']);
    assert.deepEqual(texts(R("{\\rtf1\\uc2\\u8364\\'80\\'80x}").doc),
      ['\u20acx']);
    // \uc is group-scoped; the end of a group ends the skipping
    assert.deepEqual(texts(R('{\\rtf1{\\uc2 a}\\u8364?b}').doc),
      ['a\u20acb']);
    assert.deepEqual(texts(R('{\\rtf1 {\\uc3\\u8364}xy}').doc),
      ['\u20acxy']);
  });

  it('surrogate pairs in two \\u escapes (Cocoa, Word)', () => {
    assert.deepEqual(texts(R('{\\rtf1\\uc0\\u55357 \\u56832 }').doc),
      ['\ud83d\ude00']);
    assert.deepEqual(texts(R('{\\rtf1\\u-10179?\\u-8704?}').doc),
      ['\ud83d\ude00']);
    // a lone half becomes U+FFFD
    assert.deepEqual(texts(R('{\\rtf1\\u-10179?x}').doc),
      ['\ufffdx']);
  });

  it('U+FFFE and U+FFFF become U+FFFD; the Doc writes', async () => {
    const {doc} = R('{\\rtf1 a\\u-2?b\\u-1?c\\u65534?d}');
    assert.deepEqual(texts(doc), ['a\ufffdb\ufffdc\ufffdd']);
    await roundTrips(doc, 'fffe');
  });

  it("\\'e9 by the font's code page: cp1252 and cp1251", () => {
    const {doc} = R("{\\rtf1\\ansi\\ansicpg1252{\\fonttbl" +
      "{\\f0\\fcharset0 Arial;}{\\f1\\fcharset204 Arial Cyr;}}" +
      "\\f0\\'e9\\f1\\'e9\\f0 \\'80}");
    assert.equal(texts(doc)[0], '\u00e9\u0439\u20ac');
  });

  it('\\ansicpg gives the page of fonts with no charset', () => {
    const {doc} = R("{\\rtf1\\ansi\\ansicpg1251{\\fonttbl" +
      "{\\f0 Arial;}}\\f0\\'e9}");
    assert.equal(texts(doc)[0], '\u0439');
  });

  it('an unknown code page: characters replaced and counted', () => {
    const {doc, notes} = R("{\\rtf1\\ansi{\\fonttbl" +
      "{\\f0\\fcharset128 MS Mincho;}}\\f0\\'82\\'a0\\'82\\'a2 a}");
    assert.equal(texts(doc)[0], '?? a');
    assert.deepEqual(notes,
      ['unknown code page 932: 2 characters replaced']);
  });

  it('the non-ASCII fixture', () => {
    const {doc} = readRtf(fixture('11-non-ascii-docx.rtf'));
    const t = texts(doc);
    assert.equal(t[0], 'Caf\u00e9 na\u00efve r\u00e9sum\u00e9, ' +
      '\u00fcber, \u00c5ngstr\u00f6m, \u00f1, \u00df, ' +
      '\u00e6\u00f8\u00e5.');
    assert.ok(t[2].includes('\u03b1\u03b2\u03b3'));
    assert.ok(t[2].includes('\ud83d\ude00'));
    assert.equal(t[3], 'Backslash \\ and braces { } and a ' +
      '{nested {group}} text.');
  });
});

describe('RtfRead: destinations', () => {
  it('an unknown \\* destination is skipped and reported once', () => {
    const {doc, notes} = R('{\\rtf1 a{\\*\\foo b}c{\\*\\foo d}e}');
    assert.deepEqual(texts(doc), ['ace']);
    assert.deepEqual(notes, ['unknown destination \\foo skipped']);
  });

  it('known metadata destinations are skipped quietly', () => {
    const {doc, notes} = R('{\\rtf1{\\*\\expandedcolortbl;;}' +
      '{\\*\\generator Me;}a}');
    assert.deepEqual(texts(doc), ['a']);
    assert.deepEqual(notes, []);
  });

  it('a damaged picture: skipped with notes (a footnote is read: ' +
    'task 6, rtfread-review.test.mjs)', () => {
      const {doc, notes} = R('{\\rtf1 a{\\footnote b}{\\header c}' +
        '{\\pict\\pngblip 00}{\\NeXTGraphic x.png}d}');
      assert.deepEqual(texts(doc), ['a' + OBJ + 'd']);
      assert.equal(doc.notes.footnotes.size, 3);
      assert.equal(notes.length, 2);
      assert.equal(doc.stories.size, 1);
    });

  it("Cocoa's attachment: the group and its mark byte skipped", () => {
    const {doc, notes} = readRtf(fixture('10-picture-attachment.rtf'));
    assert.equal(texts(doc)[2], 'Picture: ');
    assert.equal(notes.length, 1);
    // directly in the document's group: only its own group goes
    assert.deepEqual(texts(R('{\\rtf1 a{\\NeXTGraphic x}b}').doc),
      ['ab']);
  });

  it('the info group: title and author to docProps/core.xml', () => {
    const {doc} = R('{\\rtf1{\\info{\\title A & B}{\\author Ann}' +
      '{\\creatim\\yr2020\\mo2\\dy3\\hr4\\min5}}x}');
    const core = new TextDecoder().decode(
      doc.parts.get('docProps/core.xml'));
    assert.ok(core.includes('<dc:title>A &amp; B</dc:title>'), core);
    assert.ok(core.includes('<dc:creator>Ann</dc:creator>'), core);
    assert.ok(core.includes('2020-02-03T04:05:00Z'), core);
    assert.deepEqual(texts(doc), ['x']);
  });

  it('the stylesheet: styles and their use', () => {
    const {doc} = R('{\\rtf1\\deff0{\\fonttbl{\\f0 Arial;}}' +
      '{\\stylesheet{\\fs24 Normal;}{\\s1\\b\\fs32\\sbasedon0' +
      '\\snext0 heading 1;}{\\s2\\i\\qc\\sbasedon0 My Style;}' +
      '{\\*\\cs3\\additive\\b Strong;}}' +
      '\\pard\\s1\\b\\fs32 Head\\b0 x\\par' +
      '\\pard\\plain\\s2\\qc\\i Mine\\par\\pard\\plain Body ' +
      '{\\cs3\\b strong}\\par}');
    const st = doc.styles.styles;
    assert.deepEqual(st.get('Heading1').rPr, {b: true, sz: 32,
      extra: []});
    assert.equal(st.get('Heading1').basedOn, 'Normal');
    const mine = st.get('MyStyle');
    assert.deepEqual([mine.type, mine.name, mine.basedOn,
      mine.pPr.jc, mine.rPr.i], ['paragraph', 'My Style', 'Normal',
      'center', true]);
    assert.equal(st.get('Strong').type, 'character');
    const ps = paras(doc);
    assert.deepEqual(ps.map((p) => p.pStyle),
      ['Heading1', 'MyStyle', undefined]);
    assert.deepEqual(runs(doc, 0), [['Head', {}], ['x', {b: false}]]);
    assert.deepEqual(runs(doc, 1), [['Mine', {}]]);
    assert.equal(ps[1].pPr.jc, undefined);
    assert.deepEqual(runs(doc, 2), [['Body ', {}],
      ['strong', {}, 'style Strong']]);
  });

  it('font names: PostScript names become families; a family with ' +
    'a dash stays whole', () => {
    const cases = [['Tele-Antiqua', 'Tele-Antiqua'],
      ['Arial-BoldMT', 'Arial'], ['ArialMT', 'Arial'],
      ['Helvetica-Bold', 'Helvetica'], ['Times-Roman', 'Times'],
      ['TimesNewRomanPS-BoldItalicMT', 'Times New Roman'],
      ['Helvetica-LightOblique', 'Helvetica'],
      ['Foo-Bar', 'Foo-Bar'], ['Courier New', 'Courier New'],
      ['X-', 'X-']];
    for (const [raw, want] of cases) assert.equal(fontName(raw), want,
      raw);
  });

  it('a style sheet entry starts from {\\*\\defchp}, not from the ' +
    'state around it', () => {
    const {doc} = R('{\\rtf1{\\*\\defchp\\fs22}\\b{\\stylesheet' +
      '{\\fs22 Normal;}{\\*\\cs1 \\additive\\i Emphasis;}}x}');
    const st = doc.styles.styles;
    assert.deepEqual(st.get('Emphasis').rPr, {i: true, extra: []});
    assert.deepEqual(st.get('Normal').rPr, {extra: []});
  });

  it('long text runs decode by table in chunks (task 12): every ' +
    'byte, control bytes dropped, pages by font', () => {
    const n = 20000;
    const bytes = new Uint8Array(n).map((_, i) => (i % 3 === 0 ? 0xe9
      : i % 3 === 1 ? 0x41 : i % 1000 === 2 ? 0x07 : 0x80));
    const head = enc('{\\rtf1\\ansi{\\fonttbl{\\f0 A;}{\\f1\\fcharset204 ' +
      'B;}}\\f0 ');
    const all = new Uint8Array(head.length + 2 * n + 8);
    all.set(head);
    all.set(bytes, head.length);
    all.set(enc('\\f1 '), head.length + n);
    all.set(bytes, head.length + n + 4);
    all.set(enc('}'), head.length + 2 * n + 4);
    const {doc} = readRtf(all.subarray(0, head.length + 2 * n + 5),
      {date: DATE});
    const want = (e9, x80) => [...bytes].map((b) => (b === 0xe9 ? e9
      : b === 0x41 ? 'A' : b === 0x80 ? x80 : '')).join('');
    assert.deepEqual(texts(doc), [want('é', '€') +
      want('й', 'Ђ')]);
  });

  it('a character style adds only what it sets to the paragraph ' +
    'style’s formatting (task 12, corpus)', () => {
    // (Normal 10 pt over a 11 pt default; a run of the character
    // style at 11 pt is 11 pt, not Normal's 10)
    const {doc} = R('{\\rtf1{\\*\\defchp\\fs22}{\\stylesheet' +
      '{\\fs20 Normal;}{\\*\\cs1 \\additive\\b Strong;}}' +
      '\\pard\\plain\\fs20 a{\\cs1\\b\\fs22 b}{\\cs1\\b\\fs20 c}}');
    assert.deepEqual(runs(doc), [['a', {}],
      ['b', {sz: 22}, 'style Strong'], ['c', {}, 'style Strong']]);
  });
});

describe('RtfRead: damage and limits', () => {
  it('an empty file: a valid empty document and a note', async () => {
    const {doc, notes} = readRtf(new Uint8Array(0), {date: DATE});
    assert.deepEqual(texts(doc), ['']);
    assert.equal(notes.length, 1);
    await roundTrips(doc, 'empty');
  });

  it('{\\rtf1} gives a valid empty document, no notes', async () => {
    const {doc, notes} = R('{\\rtf1}');
    assert.deepEqual(texts(doc), ['']);
    assert.deepEqual(notes, []);
    await roundTrips(doc, 'rtf1');
  });

  it('a truncated file: the text so far and a note', () => {
    const {doc, notes} = R('{\\rtf1 one\\par two{\\b three');
    assert.deepEqual(texts(doc), ['one', 'twothree']);
    assert.deepEqual(notes, ['the file ends inside a group: ' +
      'it may be cut short']);
  });

  it('the paragraph cap', () => {
    const {doc, notes} = R('{\\rtf1 a\\par b\\par c\\par d}',
      {maxParagraphs: 2});
    assert.deepEqual(texts(doc), ['a', 'b']);
    assert.deepEqual(notes,
      ['more than 2 paragraphs: the rest is not read']);
  });

  it('tables are tables (task 5: rtfread-table.test.mjs)', () => {
    const {doc} = R('{\\rtf1\\trowd\\cellx1000\\cellx2000' +
      '\\pard\\intbl a\\cell b\\cell\\row\\pard c}');
    const bs = doc.sections[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['tbl', 'p']);
    assert.deepEqual(bs[0].rows[0].cells.map((c) => c.blocks[0].text),
      ['a', 'b']);
    assert.equal(bs[1].text, 'c');
  });

  it('never throws, never changes its input', () => {
    const src = fs.readFileSync(DIR + '13-letter-docx.rtf');
    let seed = 12345;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let k = 0; k < 300; k++) {
      const b = new Uint8Array(src.slice(0, 1 + rnd(src.length)));
      for (let m = 0; m < 1 + rnd(20); m++) {
        b[rnd(b.length)] = '{}\\\'u0-9 ab'.charCodeAt(rnd(13));
      }
      const copy = b.slice();
      const {doc, notes} = readRtf(b, {date: DATE});
      assert.deepEqual(b, copy);
      assert.ok(Array.isArray(notes));
      for (const s of doc.sections) for (const x of s.blocks) {
        checkBlock(x);
      }
    }
  });
});

describe('RtfRead: each Doc writes as .docx, reads back equal', () => {
  for (const f of fixtures()) {
    it(f, async () => {
      const {doc} = readRtf(fixture(f), {date: DATE});
      assert.ok(paras(doc).length > 0);
      await roundTrips(doc, f);
    });
  }

  it('formatting, styles, specials and info', async () => {
    const {doc} = R('{\\rtf1\\deff0{\\fonttbl{\\f0 Arial;}' +
      '{\\f1 Courier New;}}{\\colortbl;\\red0\\green0\\blue255;}' +
      '{\\stylesheet{\\fs24 Normal;}{\\s1\\b\\fs32 heading 1;}' +
      '{\\*\\cs2\\additive\\i Emph;}}{\\info{\\title T}}' +
      '\\s1\\b\\fs32 H\\par\\pard\\plain\\f1\\cf1\\caps a\\tab b' +
      '\\line c\\page d\\- e {\\cs2\\i f}\\highlight1 g\\par}');
    await roundTrips(doc, 'mixed');
  });
});
