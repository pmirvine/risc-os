// .doc import, task 11: the FIB (DocFib), the piece table and its
// text (DocPieces), the driver and its plain-text handlers (DocRead,
// DocText) and Open's .doc importer. Inputs are spec-derived
// fixtures (doc-helpers.mjs makeDoc, written from [MS-DOC] and
// [MS-CFB]), not files from an office program; the corpus test reads
// the real ones of the uncommitted corpus and skips when it is
// missing. Every Doc read must pass the Model checks, write as .docx
// and read back equal; emit() hands the .docx to the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDoc, sniffDoc, IMPORTER}
  from '../../tools/moreapps/!Letters/DocRead';
import {parseFib, slice, FC_NAMES, DocError}
  from '../../tools/moreapps/!Letters/DocFib';
import {readPieces, textOf, segments, chunks, COMPRESSED, MAX_PIECES}
  from '../../tools/moreapps/!Letters/DocPieces';
import {MAX_PARA_CHARS} from '../../tools/moreapps/!Letters/DocRead';
import * as O from '../../tools/moreapps/!Letters/Open';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {makeDoc, docStreams, packDoc, clxOf, makeCfb, makeCfbLayout}
  from './doc-helpers.mjs';
import {CORPUS, statsOf, ratio} from './odt-corpus.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const read = (o, opts = {}) => readDoc(makeDoc(o), {date: DATE,
  ...opts});
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
const texts = (doc) => paras(doc).map((p) => p.text);
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.equal(e.name, 'ImportError', e.stack);
    return e.code;
  }
  return 'ok';
};

async function roundTrips(doc, what) {
  for (const b of doc.sections.flatMap((s) => s.blocks)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('doc-read-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

/** A vfs of one file, for Open. */
const vfsOf = (bytes) => ({readFile: async () => bytes,
  stat: () => ({filetype: 0xAE6})});

describe('.doc: the FIB, the pieces, the text', () => {
  it('plain unicode text .doc opens with its paragraphs', async () => {
    const {doc, notes} = read({pieces: [{text: 'First paragraph\r' +
      'Second 中文 été\r\rLast', unicode: true}]});
    assert.deepEqual(texts(doc), ['First paragraph',
      'Second 中文 été', '', 'Last']);
    assert.deepEqual(notes, []);
    await roundTrips(doc, 'plain unicode');
  });

  it('an 8-bit piece in codepage 1252 with smart quotes', async () => {
    const bytes = [0x91, 0x61, 0x92, 0x20, 0x93, 0x62, 0x94, 0x20,
      0x96, 0x97, 0x85, 0x80, 0x82, 0x9F, 0xE9, 0x0D];
    const s = docStreams({text: 'x'.repeat(bytes.length)});
    const p = s.layout.pieces[0];
    assert.equal(p.unicode, false);
    s.word.set(bytes, p.fc);
    const {doc, notes} = readDoc(packDoc(s), {date: DATE});
    assert.deepEqual(texts(doc), ['‘a’ “b” ' +
      '–—…€‚Ÿé']);
    assert.deepEqual(notes, []);
    // every byte of [MS-DOC]'s FcCompressed table, and the rest
    // through 1252
    const all = Uint8Array.from({length: 256}, (_, i) => i);
    const t = docStreams({text: 'x'.repeat(256)});
    t.word.set(all, t.layout.pieces[0].fc);
    const w = t.word, f = parseFib(w);
    const ps = readPieces(t.table, f, {wordLength: w.length});
    const got = textOf(ps, w, 0, 256);
    for (const [b, u] of COMPRESSED) assert.equal(got.charCodeAt(b), u);
    assert.equal(got.charCodeAt(0x80), 0x20AC);
    assert.equal(got.charCodeAt(0x41), 0x41);
    assert.equal(got.charCodeAt(0xFF), 0xFF);
    // makeDoc writes 1252 text as 8-bit pieces on its own
    const r = read({text: 'Café “ok” €5\r'});
    assert.deepEqual(texts(r.doc), ['Café “ok” €5']);
    await roundTrips(doc, 'smart quotes');
  });

  it('two pieces, fast-saved order (CP order not fc order)',
    async () => {
      const o = {pieces: [{text: 'Alpha one\rAl', unicode: false},
        {text: 'pha βeta\r', unicode: true},
        {text: 'Gamma\r', unicode: false}], fast: true};
      const s = docStreams(o);
      const fcs = s.layout.pieces.map((p) => p.fc);
      assert.ok(fcs[0] > fcs[1] && fcs[1] > fcs[2], String(fcs));
      const {doc, notes} = readDoc(packDoc(s), {date: DATE});
      assert.deepEqual(texts(doc), ['Alpha one', 'Alpha βeta',
        'Gamma']);
      assert.deepEqual(notes, []);
      // segments keep the CPs; a range inside pieces
      const w = s.word, f = parseFib(w);
      const ps = readPieces(s.table, f, {wordLength: w.length});
      assert.equal(textOf(ps, w, 10, 16), 'Alpha ');
      assert.deepEqual(segments(ps, w, 3, 12), [{cp: 3,
        text: 'ha one\rAl'}]);
      await roundTrips(doc, 'fast saved');
    });

  it('nFib 0x65 is old', () => {
    assert.equal(code(() => read({text: 'a\r', version: 0x65})), 'old');
    assert.equal(code(() => read({text: 'a\r', version: 0x68})), 'old');
    assert.equal(code(() => read({text: 'a\r', wIdent: 0xA5DC})),
      'old');
    assert.equal(code(() => read({text: 'a\r', version: 0xC0})), 'old');
    // Word 2000..2007: the real nFib is FibRgCswNew's
    for (const v of [0xC1, 0xD9, 0x101, 0x10C, 0x112]) {
      const s = docStreams({text: 'Hi\r', version: v});
      assert.equal(parseFib(s.word).nFib, v);
      assert.deepEqual(texts(readDoc(packDoc(s)).doc), ['Hi']);
    }
  });

  it('encrypted flag is encrypted', () => {
    assert.equal(code(() => read({text: 'a\r', encrypted: true})),
      'encrypted');
    // fObfuscated with fEncrypted (XOR) too
    assert.equal(code(() => read({text: 'a\r', encrypted: true,
      flags: 0x8000})), 'encrypted');
    // an encrypted .docx: an OLE file with an EncryptedPackage
    const enc = makeCfb({streams: {EncryptionInfo: new Uint8Array(8),
      EncryptedPackage: new Uint8Array(64)}});
    assert.equal(sniffDoc(enc), true);
    assert.equal(code(() => readDoc(enc)), 'encrypted');
    assert.equal(O.describe(new DocError('encrypted'), 'S'),
      "'S' could not be opened: it is password-protected.");
  });

  it('a Word stream without a table stream is not-word', () => {
    const s = docStreams({text: 'a\r'});
    assert.equal(code(() => readDoc(packDoc({...s, table: null}))),
      'not-word');
    // the FIB says 1Table, the file has 0Table
    assert.equal(code(() => readDoc(packDoc({...s,
      tableName: '0Table'}))), 'not-word');
    // whichTbl 0 reads 0Table
    assert.deepEqual(texts(read({text: 'z\r', whichTbl: 0}).doc), ['z']);
    // a bad wIdent: not-word (and the sniff passes it to the .docx
    // reader, which says not a Word document)
    const bad = makeDoc({text: 'a\r', wIdent: 0x1234});
    assert.equal(sniffDoc(bad), false);
    assert.equal(code(() => readDoc(bad)), 'not-word');
    // no WordDocument stream at all (an .xls)
    const xls = makeCfb({streams: {Workbook: new Uint8Array(100)}});
    assert.equal(sniffDoc(xls), false);
    assert.equal(code(() => readDoc(xls)), 'not-word');
    // a Word stream too short for a FIB
    const short = packDoc({word: new Uint8Array([0xEC, 0xA5, 0xC1]),
      table: new Uint8Array(4)});
    assert.equal(code(() => readDoc(short)), 'not-word');
    // not an OLE file
    assert.equal(sniffDoc(new Uint8Array(600)), false);
    for (const x of [null, undefined, 'abc', [0xD0], new ArrayBuffer(8),
      new Uint8Array(0)]) {
      assert.equal(sniffDoc(x), false);
      assert.equal(code(() => readDoc(x)), 'not-word');
    }
  });

  it('a piece beyond the stream is cut with a note', () => {
    const s = docStreams({pieces: [{text: 'Keep this\r', unicode: true},
      {text: 'Gone\r', unicode: true}]});
    // the second piece's fc moved to near the stream's end
    const at = s.table.length - 8 + 2;
    const dv = new DataView(s.table.buffer);
    dv.setUint32(at, s.word.length - 4, true);
    const {doc, notes} = readDoc(packDoc(s), {date: DATE});
    assert.deepEqual(texts(doc)[0], 'Keep this');
    assert.ok(notes.some((n) => /beyond the end of the file/.test(n)),
      notes.join('|'));
    // wholly outside: left out
    dv.setUint32(at, 0x3FFFFFF0, true);
    const r = readDoc(packDoc(s));
    assert.deepEqual(texts(r.doc), ['Keep this']);
    assert.ok(r.notes.some((n) => /beyond the end/.test(n)));
    // cut at a piece edge: two units of the 2nd piece kept
    dv.setUint32(at, s.word.length - 4, true);
    const w = s.word, f = parseFib(w);
    const ps = readPieces(s.table, f, {wordLength: w.length});
    assert.equal(ps[1].cpEnd - ps[1].cpStart, 2);
  });

  it('ccpText larger than the pieces gives a note', () => {
    const {doc, notes} = read({text: 'Short\r', ccp: {Text: 500}});
    assert.deepEqual(texts(doc), ['Short']);
    assert.deepEqual(notes, ['the text is shorter than the file says']);
    // the other stories count too; a smaller ccpText reads that much
    const r = read({text: 'One\rTwo\r', ccp: {Text: 4}});
    assert.deepEqual(texts(r.doc), ['One']);
    assert.deepEqual(r.notes, []);
    const r2 = read({text: 'One\r', ccp: {Text: 4, Ftn: 10}});
    assert.ok(r2.notes.includes('the text is shorter than the file ' +
      'says'));
  });

  it('open through Open gives imported doc', async () => {
    assert.equal(IMPORTER.format, 'doc');
    assert.equal(IMPORTER.label, '.doc');
    assert.ok(O.IMPORTERS.includes(IMPORTER));
    const bytes = makeDoc({text: 'Hello from Word\r'});
    const got = await O.openDoc(vfsOf(bytes), 'Letter');
    assert.equal(got.format, 'docx');
    assert.equal(got.imported, 'doc');
    assert.deepEqual(texts(got.doc), ['Hello from Word']);
    assert.equal(O.openNotice('Letter', got), "'Letter' was opened " +
      'from a .doc file; it will be saved as a .docx.');
    // the refusals, said in plain words
    const why = async (b) => {
      const e = await O.openDoc(vfsOf(b), 'F').catch((x) => x);
      return O.describe(e, 'F');
    };
    assert.equal(await why(makeDoc({text: 'a\r', version: 0x65})),
      "'F' could not be opened: it is a Word 6/95 file, which " +
      '!Letters cannot read.');
    assert.equal(await why(makeDoc({text: 'a\r', encrypted: true})),
      "'F' could not be opened: it is password-protected.");
    const NOT = "'F' could not be opened: it is not a Word document.";
    const s = docStreams({text: 'a\r'});
    assert.equal(await why(packDoc({...s, table: null})), NOT);
    // an OLE file that is not Word's goes to the .docx reader, whose
    // OLE message now says the same
    const xls = makeCfb({streams: {Workbook: new Uint8Array(100)}});
    assert.equal(await why(xls), NOT);
    // a damaged container
    const sig = new Uint8Array(512);
    sig.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const DAMAGED = "'F' could not be opened: the file is damaged.";
    assert.equal(await why(sig), DAMAGED);
    // a Cfb limit hit inside a small file is damage, not size
    const st = docStreams({text: 'a\r'});
    const {bytes: hb, layout} = makeCfbLayout({streams: [
      ['WordDocument', st.word], ['1Table', st.table]]});
    const sid = layout.entries.find((e) => e.path === '1Table').sid;
    new DataView(hb.buffer).setUint32(layout.entryOffset(sid) + 120,
      65 * 1024 * 1024, true);
    assert.equal(code(() => readDoc(hb)), 'bad');
    assert.equal(await why(hb), DAMAGED);
    // too big
    const big = new Uint8Array(O.MAX_IMPORT_BYTES + 1);
    big.set(makeDoc({text: 'a\r'}));
    assert.equal(await why(big), "'F' could not be opened: it is too " +
      'big (more than 16 MB).');
  });
});

describe('.doc: the FIB table and the driver', () => {
  it('every fc/lcb pair is named; absent ones are 0', () => {
    const blob = new Uint8Array([1, 2, 3, 4]);
    const s = docStreams({text: 'a\r', table: {PlcfSed: blob,
      Stshf: new Uint8Array(10)}});
    const f = parseFib(s.word);
    assert.equal(FC_NAMES.length, 93);
    assert.equal(f.pairs, 93);
    for (const n of ['Stshf', 'PlcfBteChpx', 'PlcfBtePapx', 'PlcfSed',
      'PlcffndRef', 'PlcffndTxt', 'PlcfendRef', 'PlcfendTxt',
      'PlcfandRef', 'PlcfandTxt', 'PlcfHdd', 'PlcfFldMom', 'PlcfFldHdr',
      'PlcfFldFtn', 'PlcfFldAtn', 'PlcfFldEdn', 'SttbfRMark', 'Clx',
      'PlfLst', 'PlfLfo', 'PlcSpaMom', 'Dop', 'SttbfFfn', 'PlcfBkf',
      'PlcfBkl', 'SttbfBkmk', 'GrpXstAtnOwners', 'StshF', 'PlcFld',
      'PlcfSpa', 'PlcfLst', 'Plcfhdd']) {
      assert.ok(f.fc[n] && typeof f.fc[n].fc === 'number', n);
    }
    assert.deepEqual(f.fc.Unheard, {fc: 0, lcb: 0});
    assert.deepEqual(f.fc.StshF, f.fc.Stshf);
    assert.equal(f.fc.Stshf.lcb, 10);
    const tbl = s.table;
    assert.deepEqual([...slice(tbl, f, 'PlcfSed')], [1, 2, 3, 4]);
    assert.equal(slice(tbl, f, 'PlcfBteChpx'), null);
    // out of the table: null and a note
    const notes = [];
    const g = {...f, fc: {...f.fc, Dop: {fc: 5, lcb: 0xFFFFFFFF}}};
    assert.equal(slice(tbl, g, 'Dop', (m) => notes.push(m)), null);
    assert.equal(notes.length, 1);
    assert.equal(f.ccpText, 2);
    assert.equal(f.flags.whichTbl, 1);
  });

  it('specials: tab, line break, page break, fields, marks', () => {
    const {doc, notes} = read({text: 'a\tb\x0Bc\x0Cd\x1Ee\x1Ff\r' +
      'x\x13 HYPERLINK "http://e.org" \x14link\x15y\x01z\x02\x05\r' +
      'cell\x07row\x07\r' +
      '\x13 open code\rafter\r\x13 F \x13 G \x14in\x15 \x14res\x15!\r'});
    const t = texts(doc);
    assert.equal(t[0], 'a\tb\nc￼d‑e­f');
    const br = paras(doc)[0].inlines;
    assert.equal(Object.values(br)[0].brType, 'page');
    // (task 15: the HYPERLINK is a link, one inline; a 0x02 / 0x05
    // no list names is left out with a note)
    assert.deepEqual(t.slice(1), ['x\uFFFCyz', 'cell', 'row', '',
      '', 'after', 'res!']);
    // (task 14: a 0x01 without sprmCFSpec is left out, no note)
    for (const re of [/a note mark/, /a comment mark/,
      /field code without its end/]) {
      assert.ok(notes.some((n) => re.test(n)), String(re));
    }
  });

  it('a section break at a PlcfSed end is a paragraph end', () => {
    // PlcfSed: CPs 0, 3, 6 and two 12-byte Seds
    const plc = new Uint8Array(12 + 24);
    const dv = new DataView(plc.buffer);
    [0, 3, 6].forEach((c, i) => dv.setInt32(4 * i, c, true));
    const {doc, notes} = read({text: 'ab\x0Ccd\x0Cef\x0Cg\r',
      table: {PlcfSed: plc}});
    const t = texts(doc);
    assert.deepEqual(t, ['ab', 'cd', 'ef￼g']);
    // (task 14: the sections are read; Seds with fcSepx 0 point at
    // the FIB, which is no SEPX: the defaults, a note)
    assert.deepEqual(doc.sections.map((x) => x.blocks.length), [1, 2]);
    assert.ok(notes.some((n) => /page settings lie outside/.test(n)));
  });

  it('maxParagraphs stops with a note', () => {
    const {doc, notes} = read({text: 'p\r'.repeat(50)},
      {maxParagraphs: 10});
    assert.ok(texts(doc).length <= 11);
    assert.ok(notes.length >= 1);
  });

  it('an empty main story gives one empty paragraph', async () => {
    const {doc} = read({text: ''});
    assert.deepEqual(texts(doc), ['']);
    await roundTrips(doc, 'empty');
  });

  it('Prc entries before the Pcdt are skipped', () => {
    const {doc} = read({text: 'Prc ok\r', prc: [new Uint8Array(6),
      new Uint8Array(0)]});
    assert.deepEqual(texts(doc), ['Prc ok']);
  });
});

/** mulberry32: a seeded random. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reads or refuses with an ImportError, quickly. */
function tries(bytes, what, ms = 2000) {
  const t = Date.now();
  let got;
  try {
    readDoc(bytes);
    got = 'ok';
  } catch (e) {
    assert.equal(e.name, 'ImportError', what + ': ' + e.stack);
    got = e.code;
  }
  assert.ok(Date.now() - t < ms, what + ' slow');
  return got;
}

describe('.doc: hostile files', () => {
  const BASE = {pieces: [{text: 'First “piece”\r'},
    {text: 'Second 中 piece\x13 PAGE \x141\x15\r', unicode: true},
    {text: 'Third\x07\x07\r'}], fast: true};

  it('a WordDocument stream cut at every 256 bytes', () => {
    const s = docStreams(BASE);
    const counts = {};
    for (let n = 0; n <= s.word.length; n += 256) {
      const got = tries(packDoc({...s, word: s.word.slice(0, n)}),
        'cut ' + n);
      counts[got] = (counts[got] || 0) + 1;
    }
    assert.ok(counts.bad || counts['not-word'], JSON.stringify(counts));
  });

  it('a seeded fuzz of 300 mutated copies', () => {
    const good = makeDoc(BASE);
    const r = rng(11);
    const counts = {};
    for (let i = 0; i < 300; i++) {
      const b = good.slice();
      const n = 1 + Math.floor(r() * 20);
      for (let k = 0; k < n; k++) {
        b[Math.floor(r() * b.length)] = Math.floor(r() * 256);
      }
      const got = tries(b, 'copy ' + i);
      counts[got] = (counts[got] || 0) + 1;
    }
    assert.ok(counts.ok > 0, JSON.stringify(counts));
  });

  it('nonsense FIB counts', () => {
    const fix = (fn) => {
      const s = docStreams(BASE);
      fn(new DataView(s.word.buffer), s.layout.fib, s);
      return tries(packDoc(s), String(fn));
    };
    // cswNew huge, beyond the stream: read what is there
    assert.equal(fix((dv, f) => dv.setUint16(f.cswNew, 0xFFFF, true)),
      'ok');
    // csw / cslw huge: the FIB runs past the stream
    assert.equal(fix((dv, f) => dv.setUint16(f.csw, 0xFFFF, true)),
      'bad');
    assert.equal(fix((dv, f) => dv.setUint16(f.cslw, 0xFFFF, true)),
      'bad');
    // cbRgFcLcb huge: the pairs that fit are read
    assert.equal(fix((dv, f) => dv.setUint16(f.cbRgFcLcb, 0xFFFF,
      true)), 'ok');
    // lcbClx 2^32 - 1, fcClx beyond the table: no text
    assert.equal(fix((dv, f) => dv.setUint32(f.pair('Clx') + 4,
      0xFFFFFFFF, true)), 'bad');
    assert.equal(fix((dv, f) => dv.setUint32(f.pair('Clx'),
      0xFFFFFFF0, true)), 'bad');
    // another pair out of range: unused here, harmless
    assert.equal(fix((dv, f) => dv.setUint32(f.pair('PlcfSed') + 4,
      0xFFFFFFFF, true)), 'ok');
    // ccpText 2^31 and negative
    assert.equal(fix((dv, f) => dv.setUint32(f.ccpText, 0x80000000,
      true)), 'ok');
    assert.equal(fix((dv, f) => dv.setUint32(f.ccpText, 0x7FFFFFFF,
      true)), 'ok');
    const s = docStreams(BASE);
    new DataView(s.word.buffer).setUint32(s.layout.fib.ccpText,
      0x7FFFFFFF, true);
    const {notes} = readDoc(packDoc(s));
    assert.ok(notes.includes('the text is shorter than the file says'));
  });

  it('a CLX of a million pieces, backwards CPs, no pieces', () => {
    const many = {pieces: Array.from({length: MAX_PIECES + 5},
      (_, i) => ({text: i % 1000 === 999 ? '\r' : 'a',
        unicode: false}))};
    const t = Date.now();
    const s = docStreams(many);
    const r = readDoc(packDoc(s), {maxParagraphs: 200000});
    assert.ok(r.notes.some((n) => /more than 1000000 pieces/.test(n)));
    assert.equal(texts(r.doc).length, 1000);
    assert.ok(Date.now() - t < 20000, 'million pieces slow');
    // a piece whose CP goes backwards ends the table
    const b = docStreams({pieces: [{text: 'One\r'}, {text: 'Two\r'},
      {text: 'Three\r'}]});
    const dv = new DataView(b.table.buffer);
    const plc = b.layout.tableAt.Clx + 5;
    dv.setInt32(plc + 8, 2, true);       // the 3rd CP before the 2nd
    const back = readDoc(packDoc(b));
    assert.deepEqual(texts(back.doc), ['One']);
    assert.ok(back.notes.some((n) => /out of order/.test(n)));
    // no pieces at all: an empty document with the note
    const z = docStreams({text: 'abc\r'});
    const clx = clxOf([]);
    z.table = clx;
    new DataView(z.word.buffer).setUint32(z.layout.fib.pair('Clx') + 4,
      clx.length, true);
    const e = readDoc(packDoc(z));
    assert.deepEqual(texts(e.doc), ['']);
    assert.ok(e.notes.includes('the text is shorter than the file ' +
      'says'));
    // a Clx of junk: an unknown clxt, a Prc past the end
    for (const junk of [[7, 0, 0], [1, 0xFF, 0x7F], [1, 0xFF, 0xFF],
      [2, 1, 0, 0, 0]]) {
      const j = docStreams({text: 'abc\r'});
      j.table = new Uint8Array(junk);
      new DataView(j.word.buffer).setUint32(j.layout.fib.pair('Clx') +
        4, junk.length, true);
      new DataView(j.word.buffer).setUint32(j.layout.fib.pair('Clx'),
        0, true);
      assert.equal(tries(packDoc(j), String(junk)), 'bad');
    }
  });
});

/** K pieces of L 8-bit characters, all at the same bytes, ccpText
 *  K * L, no paragraph marks: text amplified K times if believed. */
function amplified(L, K, run = 'a') {
  const s = docStreams({pieces: [{text: run.repeat(L / run.length),
    unicode: false}]});
  const fc = s.layout.pieces[0].fc;
  const pcs = [];
  for (let i = 0; i < K; i++) {
    pcs.push({cpStart: i * L, cpEnd: (i + 1) * L, fc, unicode: false});
  }
  const clx = clxOf(pcs);
  s.table = clx;
  const dv = new DataView(s.word.buffer);
  dv.setUint32(s.layout.fib.pair('Clx'), 0, true);
  dv.setUint32(s.layout.fib.pair('Clx') + 4, clx.length, true);
  dv.setInt32(s.layout.fib.ccpText, K * L, true);
  return {bytes: packDoc(s), word: s.word};
}

const lengthOf = (doc) => texts(doc).reduce((n, t) => n + t.length, 0);

describe('.doc: output is bounded by the file (fix round 1)', () => {
  for (const k of [300, 500, 2000]) {
    it(`${k} pieces sharing one 1 MB run read it once`, () => {
      const {bytes, word} = amplified(1000000, k);
      const t = Date.now();
      const {doc, notes} = readDoc(bytes);
      assert.ok(Date.now() - t < 1000, 'slow: ' + (Date.now() - t));
      assert.ok(lengthOf(doc) <= word.length);
      // (one paragraph: the paragraph cap is under the stream's size)
      assert.equal(lengthOf(doc), Math.min(word.length, MAX_PARA_CHARS));
      assert.equal(notes.filter((n) => /more text than the file/
        .test(n)).length, 1, notes.join('|'));
    });
  }

  it('shared bytes with paragraph marks: at most the stream', () => {
    const {bytes, word} = amplified(100000, 300, 'a'.repeat(99) + '\r');
    const t = Date.now();
    const {doc, notes} = readDoc(bytes);
    assert.ok(Date.now() - t < 1000, 'slow: ' + (Date.now() - t));
    // the characters plus one mark per paragraph (the last has none)
    assert.ok(lengthOf(doc) + texts(doc).length <= word.length + 1);
    assert.ok(texts(doc).length > 1000);
    assert.ok(notes.some((n) => /more text than the file/.test(n)));
  });

  it('pieces sharing bytes (as Word fast saves do) read both', () => {
    const s = docStreams({pieces: [{text: 'abcdef\r', unicode: false},
      {text: 'ghij\r', unicode: false}]});
    const [p0] = s.layout.pieces;
    // the second piece starts 3 bytes into the first's
    const pcs = [{cpStart: 0, cpEnd: 7, fc: p0.fc, unicode: false},
      {cpStart: 7, cpEnd: 12, fc: p0.fc + 3, unicode: false}];
    const w = s.word, f = parseFib(w);
    const notes = [];
    const ps = readPieces(clxOf(pcs), {...f, fc: {...f.fc,
      Clx: {fc: 0, lcb: clxOf(pcs).length}}},
    {wordLength: w.length, note: (m) => notes.push(m)});
    assert.deepEqual(ps.map((p) => [p.cpStart, p.cpEnd]),
      [[0, 7], [7, 12]]);
    assert.deepEqual(notes, []);
    assert.equal(textOf(ps, w, 0, 12), 'abcdef\rdef\rg');
  });

  it('many small adjacent pieces read as before', () => {
    const pieces = [];
    for (let i = 0; i < 5000; i++) {
      pieces.push({text: i % 50 === 49 ? 'z\r' : 'xy',
        unicode: i % 3 === 0});
    }
    for (const fast of [false, true]) {
      const {doc, notes} = read({pieces, fast});
      assert.deepEqual(notes, []);
      assert.equal(texts(doc).length, 100);
      assert.equal(texts(doc)[0], 'xy'.repeat(49) + 'z');
    }
  });

  it('a paragraph longer than MAX_PARA_CHARS is cut with a note', () => {
    const n = MAX_PARA_CHARS + 5000;
    const {doc, notes} = read({pieces: [{text: 'b'.repeat(n) + '\rok\r',
      unicode: false}]});
    assert.equal(texts(doc)[0].length, MAX_PARA_CHARS);
    assert.equal(texts(doc)[1], 'ok');
    assert.equal(notes.filter((m) => /paragraph of more/.test(m))
      .length, 1);
  });

  it('special characters inside a field code are not acted on', () => {
    const {doc, notes} = read({text: 'a\x13 FORMDROPDOWN \x01\x02\x05' +
      '\x0C\x14b\x15c\r'});
    assert.deepEqual(texts(doc), ['abc']);
    // (task 15: the form field's note only)
    assert.deepEqual(notes, ['form fields are kept as their text ' +
      '(check boxes and drop-down lists are left out)']);
  });

  it('chunks never split a surrogate pair', () => {
    const t = 'ab\uD83D\uDE00cd\uD83D\uDE01\r';
    const s = docStreams({pieces: [{text: t, unicode: true}]});
    const w = s.word, f = parseFib(w);
    const ps = readPieces(s.table, f, {wordLength: w.length});
    const got = [...chunks(ps, w, 0, t.length, {chunk: 3})];
    assert.equal(got.map((c) => c.text).join(''), t);
    for (const c of got) assert.ok(!c.text.includes('\uFFFD'));
  });
});

// ------------------------------------------------------------------
// The real files (the uncommitted corpus; skipped when absent)
const DIRS = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].map((d) =>
  path.join(path.dirname(new URL(import.meta.url).pathname), d));
function find(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}
const FILES = DIRS.flatMap((d) => find(d, '.doc')).sort();

describe('.doc corpus', {skip: FILES.length ? false :
  'no .doc corpus (optional, git-ignored: tools/moreapps-corpus.mjs)'},
() => {
  it('every .doc reads or is refused with an ImportError in 5 s', () => {
    const counts = {};
    for (const f of FILES) {
      const got = tries(new Uint8Array(fs.readFileSync(f)), f, 5000);
      counts[got] = (counts[got] || 0) + 1;
    }
    console.log('# doc corpus: ' + FILES.length + ' files: ' +
      JSON.stringify(counts));
    assert.ok(counts.ok >= FILES.length * 0.9, JSON.stringify(counts));
  });

  it('Word- and LibreOffice-made .doc text against its .docx twin',
    async () => {
      const docx = find(CORPUS, '.docx');
      const conv = path.join(CORPUS, 'converted', 'doc');
      const pairs = [];
      for (const f of find(conv, '.doc')) {
        const x = path.join(CORPUS, path.relative(conv, f)
          .replace(/\.doc$/i, '.docx'));
        if (fs.existsSync(x)) pairs.push([f, x, 'LibreOffice']);
      }
      for (const f of FILES.filter((p) => p.includes('doc-from-word'))) {
        const base = path.basename(f).replace(/\.doc$/i, '.docx');
        const x = docx.find((p) => path.basename(p) === base);
        if (x) pairs.push([f, x, 'Word']);
      }
      const by = {};
      for (const [f, x, who] of pairs) {
        let a, b;
        try {
          a = statsOf(readDoc(new Uint8Array(fs.readFileSync(f))).doc);
          b = statsOf(await readDocx(new Uint8Array(fs.readFileSync(x))));
        } catch (e) {
          continue;
        }
        const r = ratio(a.text, b.text);
        const s = by[who] ||= {n: 0, sum: 0, alike: 0};
        s.n++;
        s.sum += r;
        if (r >= 0.97) s.alike++;
      }
      for (const [who, s] of Object.entries(by)) {
        console.log(`# doc twins (${who}): ${s.n} compared, mean ` +
          `ratio ${(s.sum / s.n).toFixed(3)}, ${s.alike} at 0.97 or ` +
          'more');
      }
      assert.ok(Object.keys(by).length > 0);
    });
});
