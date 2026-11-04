// .doc import, task 14: pictures (DocPict, DocArt) and sections,
// page settings, headers and footers (DocSect, DocSep, DocHdr).
// Inputs are spec-derived fixtures (doc-helpers.mjs picRecord,
// blipRec, sectionDoc: written from [MS-DOC] and [MS-ODRAW]), not
// files from an office program. Every Doc read must pass the Model
// checks, write as .docx and read back equal; emit() hands each .docx
// to the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {OPS as C} from '../../tools/moreapps/!Letters/DocSprm';
import {MAX_SECTIONS} from '../../tools/moreapps/!Letters/DocSect';
import {MAX_PICTURES} from '../../tools/moreapps/!Letters/RtfPict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {pictureOf as readPicture, docMap}
  from '../../tools/moreapps/!Letters/PicRead';
import {mediaOf, imageInfo} from '../../tools/moreapps/!Letters/PicMedia';
import {refsOf, storyOfRef} from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {pngBytes, jpegGray} from './pic-fixtures.mjs';
import {deflateSync, deflateRawSync} from 'node:zlib';
import {WORK} from '../../tools/moreapps/!Letters/DocPict';
import {SECT_WORK} from '../../tools/moreapps/!Letters/DocSect';
import {CORPUS} from './odt-corpus.mjs';
import {partStats, PART_KEYS} from './docparts-measure.mjs';
import {prl, grpprl, u16le, i16le, u32le, picRecord, blipRec, artRec,
  sectionDoc, defTable, packDoc} from './doc-helpers.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const texts = (bs) => bs.filter((b) => b.type === 'p').map((b) => b.text);

async function roundTrips(doc, what) {
  for (const b of blocks(doc)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('doc-parts-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

// pictures: one 0x01 (or more) whose run has sprmCFSpec and
// sprmCPicLocation, the Data stream holding the records
const PNG = pngBytes(4, 2);
const pic = (at) => [prl(C.CFSpec, 1), prl(C.CPicLocation, u32le(at))];
/** A .doc of 'a', pictures at the offsets `ats`, 'b'; data the
 *  Data stream. */
function picDoc(data, ats = [0], more = {}) {
  const text = 'a' + '\x01'.repeat(ats.length) + 'b';
  // (one run when every offset is the same: an FKP holds few)
  const one = ats.every((x) => x === ats[0]);
  return sectionDoc({main: [{text}], data,
    runs: one ? [{from: 1, to: 1 + ats.length, prls: pic(ats[0])}]
      : ats.map((at, i) => ({from: 1 + i, to: 2 + i,
        prls: pic(at)})), ...more});
}
const read = (o) => readDoc(o.bytes, {date: DATE});
const inlinesOf = (doc) => paras(doc).flatMap((p) =>
  Object.values(p.inlines || {}));
const pictures = (doc) => inlinesOf(doc).map((x) =>
  readPicture(x.node)).filter(Boolean);
/** A small EMF: its header record (88 bytes, ' EMF' at 40) and an
 *  EOF record, made from [MS-EMF] 2.3.4.2. */
function emfBytes() {
  const b = new Uint8Array(108);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 1, true);
  dv.setUint32(4, 88, true);
  dv.setUint32(8, 0, true);
  dv.setUint32(16, 100, true);
  dv.setUint32(20, 50, true);
  b.set([0x20, 0x45, 0x4D, 0x46], 40);
  dv.setUint32(44, 0x10000, true);
  dv.setUint32(48, 108, true);
  dv.setUint32(52, 2, true);
  dv.setUint32(88, 14, true);
  dv.setUint32(92, 20, true);
  dv.setUint32(104, 20, true);
  return b;
}
/** A small bare WMF ([MS-WMF] 2.3.2.2 META_HEADER, then META_EOF). */
function wmfBytes() {
  return Uint8Array.from([1, 0, 9, 0, 0, 3, 12, 0, 0, 0, 0, 0, 3, 0,
    0, 0, 0, 0, 3, 0, 0, 0, 0, 0]);
}
const PNG_REC = (o = {}) => picRecord({blip: blipRec('png', PNG), ...o});

describe('.doc: pictures (DocPict, DocArt)', () => {
  it('an inline PNG with scaling', async () => {
    const {doc, notes} = read(picDoc(PNG_REC({dxaGoal: 1440,
      dyaGoal: 720, mx: 1500, my: 500})));
    assert.deepEqual(notes, []);
    const [p] = pictures(doc);
    assert.equal(p.cx, 1440 * 1.5 * 635);
    assert.equal(p.cy, 720 * 0.5 * 635);
    assert.equal(paras(doc)[0].text, 'a￼b');
    const media = [...doc.parts].find(([k]) => /media\//.test(k));
    assert.deepEqual([...media[1]], [...PNG]);
    await roundTrips(doc, 'inline png scaled');
  });

  it('a JPEG with two UIDs, straight in the record (no FBSE)',
    async () => {
      const jpg = jpegGray(8, 8);
      const {doc, notes} = read(picDoc(picRecord({fbse: false,
        blip: blipRec('jpeg', jpg, {uids: 2})})));
      assert.deepEqual(notes, []);
      const media = [...doc.parts].find(([k]) => /media\//.test(k));
      assert.ok(/\.jpe?g$/.test(media[0]));
      assert.deepEqual([...media[1]], [...jpg]);
      await roundTrips(doc, 'jpeg two uids');
    });

  it('a picture offset beyond the Data stream notes', () => {
    const rec = PNG_REC();
    for (const at of [rec.length - 10, 1e9, -5]) {
      const {doc, notes} = read(picDoc(rec, [at]));
      assert.equal(pictures(doc).length, 0);
      assert.ok(notes.some((n) => /outside the file/.test(n)), at);
      assert.equal(paras(doc)[0].text, 'ab');
    }
    const {notes} = read(sectionDoc({main: [{text: 'a\x01b'}],
      runs: [{from: 1, to: 2, prls: pic(0)}]}));
    assert.ok(notes.some((n) => /outside the file/.test(n)));
  });

  it('a 0x01 without sprmCFSpec, or with sprmCFData, is left out',
    () => {
      const data = PNG_REC();
      const a = sectionDoc({main: [{text: 'a\x01b\x01c'}], data,
        runs: [{from: 1, to: 2, prls: [prl(C.CPicLocation, u32le(0))]},
          {from: 3, to: 4, prls: [...pic(0), prl(C.CFData, 1)]}]});
      const {doc, notes} = read(a);
      assert.equal(paras(doc)[0].text, 'abc');
      assert.deepEqual(notes, []);
    });

  it('a floating shape notes once', () => {
    const {doc, notes} = read(sectionDoc({main: [{text: 'a\x08b\x08c'}],
      runs: [{from: 1, to: 2, prls: [prl(C.CFSpec, 1)]},
        {from: 3, to: 4, prls: [prl(C.CFSpec, 1)]}]}));
    assert.equal(paras(doc)[0].text, 'abc');
    assert.equal(notes.filter((n) => /floating pictures/.test(n))
      .length, 1);
  });

  it('a cropped picture: the shape\'s crops, and the PICF\'s',
    async () => {
      // cropFromLeft 1/4, cropFromRight 1/4 (16.16 fractions)
      const {doc} = read(picDoc(PNG_REC({dxaGoal: 2000, dyaGoal: 1000,
        props: [[0x102, 0x4000], [0x103, 0x4000]]})));
      // (the size is the goal x the scale: Word sets the scale to
      // keep the cropped size, real-Word fixture 'parts')
      const [p] = pictures(doc);
      assert.equal(p.cx, 2000 * 635);
      assert.equal(p.cy, 1000 * 635);
      assert.deepEqual(p.srcRect, {l: 25000, t: 0, r: 25000, b: 0});
      await roundTrips(doc, 'cropped');
      const {doc: d2} = read(picDoc(PNG_REC({dxaGoal: 2000,
        dyaGoal: 1000, crop: [0, 250, 0, 250]})));
      const [q] = pictures(d2);
      assert.equal(q.cy, 1000 * 635);
      assert.deepEqual(q.srcRect, {l: 0, t: 25000, r: 0, b: 25000});
      // crops past the whole picture: uncropped
      const {doc: d3} = read(picDoc(PNG_REC({dxaGoal: 2000,
        props: [[0x102, 0xC000], [0x103, 0xC000]]})));
      assert.equal(pictures(d3)[0].srcRect, undefined);
    });

  it('the shape\'s name and alt text are kept', async () => {
    const str = (s) => [...s].flatMap((c) => u16le(c.charCodeAt(0)))
      .concat([0, 0]);
    const name = str('Logo'), alt = str('A red square');
    const props = [[0x8380, name.length], [0x8381, alt.length]];
    const fopt = artRec(0xF00B, [...props.flatMap(([p, v]) =>
      [...u16le(p), ...u32le(v)]), ...name, ...alt],
    {ver: 3, inst: 2});
    const sp = artRec(0xF004, fopt, {ver: 15});
    const {doc} = read(picDoc(picRecord({art: grpprl(sp,
      blipRec('png', PNG))})));
    const node = JSON.stringify(inlinesOf(doc)[0].node);
    assert.ok(node.includes('"Logo"') && node.includes('A red square'));
    await roundTrips(doc, 'name alt');
  });

  it('PICF lcb and cbHeader nonsense: a note, no picture', () => {
    for (const o of [{lcb: 0}, {lcb: 10}, {lcb: -1}, {cbHeader: 0},
      {cbHeader: 70}]) {
      const {doc, notes} = read(picDoc(PNG_REC(o)));
      assert.equal(pictures(doc).length, 0, JSON.stringify(o));
      assert.ok(notes.some((n) => /damaged picture/.test(n)));
    }
    // lcb past the stream: read to its end
    const {doc} = read(picDoc(PNG_REC({lcb: 0x7FFFFFFF})));
    assert.equal(pictures(doc).length, 1);
  });

  it('scales and goals 0, negative or huge: own size or 22 inches',
    async () => {
      const cases = [[{mx: 0, my: 0}, 1440 * 635, 1440 * 635],
        [{mx: 65535, my: 65535}, 22 * 914400, 22 * 914400],
        [{dxaGoal: 32767, dyaGoal: 100, mx: 65535}, 22 * 914400,
          Math.round(100 * 635 * 22 * 914400 /
            (32767 * 65.535 * 635))]];
      for (const [o, cx, cy] of cases) {
        const {doc} = read(picDoc(PNG_REC(o)));
        const [p] = pictures(doc);
        assert.equal(p.cx, cx, JSON.stringify(o));
        assert.ok(Math.abs(p.cy - cy) <= 1, JSON.stringify(o));
      }
      for (const o of [{dxaGoal: 0}, {dyaGoal: -100}]) {
        const {doc, notes} = read(picDoc(PNG_REC(o)));
        const [p] = pictures(doc);
        assert.equal(p.cx, 4 * 9525);
        assert.ok(notes.some((n) => /own size/.test(n)));
        await roundTrips(doc, 'own size ' + Object.keys(o)[0]);
      }
    });

  it('BLIP record sizes past the data are cut there', () => {
    const b = blipRec('png', PNG);
    new DataView(b.buffer).setUint32(4, 0xFFFFFFF0, true);
    const {doc} = read(picDoc(picRecord({blip: b})));
    assert.equal(pictures(doc).length, 1);
    const f = picRecord({blip: blipRec('png', PNG)});
    // the FBSE's length too
    new DataView(f.buffer).setUint32(68 + 8 + 16 + 4 + 8 + 4 + 18 + 4,
      0xFFFFFFF0, true);
    assert.doesNotThrow(() => read(picDoc(f)));
  });

  it('OfficeArt containers 10,000 deep are walked flat', () => {
    const blip = blipRec('png', PNG);
    const n = 10000;
    const art = new Uint8Array(8 * n + blip.length);
    for (let i = 0; i < n; i++) {
      art.set([0x0F, 0, 0x04, 0xF0, ...u32le(8 * (n - i - 1) +
        blip.length)], 8 * i);
    }
    art.set(blip, 8 * n);
    const t = performance.now();
    const {doc} = read(picDoc(picRecord({art})));
    assert.ok(performance.now() - t < 2000);
    assert.equal(pictures(doc).length, 1);
  });

  it('10,000 pictures: MAX_PICTURES of them and one note', () => {
    const t = performance.now();
    const {doc, notes} = read(picDoc(PNG_REC(),
      new Array(10000).fill(0)));
    assert.ok(performance.now() - t < 15000);
    assert.equal(pictures(doc).length, MAX_PICTURES);
    assert.equal(notes.filter((x) => /more than 1000 pictures/.test(x))
      .length, 1);
  });

  it('image bytes that are not images: a damaged picture', () => {
    const junk = new Uint8Array(300).fill(0x41);
    for (const k of ['png', 'jpeg']) {
      const {doc, notes} = read(picDoc(picRecord({blip: blipRec(k,
        junk)})));
      assert.equal(pictures(doc).length, 0);
      assert.ok(notes.some((n) => /damaged picture/.test(n)), k);
    }
  });

  it('DIB, TIFF, PICT and compressed PICT: one note per kind',
    async () => {
      // a DIB header claiming 1e9 x 1e9 pixels: nothing is decoded
      const dib = Uint8Array.from([...u32le(40), ...u32le(1e9),
        ...u32le(1e9), ...u16le(1), ...u16le(32),
        ...new Array(24).fill(0)]);
      const recs = [blipRec('dib', dib), blipRec('dib', dib),
        blipRec('tiff', PNG), blipRec('pict', PNG),
        blipRec('pict', deflateSync(PNG), {size: PNG.length})];
      const data = [];
      const ats = [];
      for (const r of recs) {
        ats.push(data.length);
        data.push(...picRecord({blip: r}));
      }
      const {doc, notes} = read(picDoc(Uint8Array.from(data), ats));
      assert.equal(pictures(doc).length, 0);
      for (const k of ['DIB', 'TIFF', 'PICT']) {
        assert.equal(notes.filter((n) => n.includes('in ' + k)).length,
          1, k);
      }
      await roundTrips(doc, 'skipped kinds');
    });

  it('compressed EMF and WMF are inflated and kept (fix 3)',
    async () => {
      const emf = emfBytes(), wmf = wmfBytes();
      const recs = [blipRec('emf', deflateSync(emf), {size: emf.length}),
        blipRec('wmf', deflateRawSync(wmf), {size: wmf.length,
          uids: 2})];
      const data = [];
      const ats = [];
      for (const r of recs) {
        ats.push(data.length);
        data.push(...picRecord({blip: r}));
      }
      const {doc, notes} = read(picDoc(Uint8Array.from(data), ats));
      assert.deepEqual(notes, []);
      assert.equal(pictures(doc).length, 2);
      const media = [...doc.parts].filter(([k]) => /media\//.test(k));
      const emfPart = media.find(([k]) => /\.emf$/.test(k));
      assert.deepEqual([...emfPart[1]], [...emf]);
      // (a bare WMF gets its placeable header, as RTF's does)
      const wmfPart = media.find(([k]) => /\.wmf$/.test(k));
      assert.deepEqual([...wmfPart[1].subarray(22)], [...wmf]);
      await roundTrips(doc, 'inflated metafiles');
    });

  it('a metafile filter byte other than 0xFE: kept, one note (task 16)',
    () => {
      const emf = emfBytes();
      const data = [];
      const ats = [];
      for (const f of [0x00, 0x01, 0xFE]) {
        ats.push(data.length);
        data.push(...picRecord({blip: blipRec('emf', deflateSync(emf),
          {size: emf.length, filter: f})}));
      }
      const {doc, notes} = read(picDoc(Uint8Array.from(data), ats));
      assert.equal(pictures(doc).length, 3);
      assert.deepEqual(notes, ['a picture\'s header is not as Word ' +
        'writes it: it is kept as it is']);
    });

  it('compressed metafiles that do not add up: damaged, checked first',
    () => {
      const emf = emfBytes(), z = deflateSync(emf);
      const bad = (blip) => {
        const {doc, notes} = read(picDoc(picRecord({blip})));
        assert.equal(pictures(doc).length, 0);
        return notes;
      };
      const t = performance.now();
      for (const blip of [
        blipRec('emf', z, {size: emf.length + 1}),
        blipRec('emf', z, {size: emf.length - 1}),
        blipRec('emf', z, {size: 0}),
        blipRec('emf', z, {size: 0xFFFFFFFF}),
        blipRec('emf', z, {size: 1033 * z.length + 100}),
        blipRec('emf', z, {compression: 7}),
        blipRec('emf', z.subarray(0, z.length >> 1),
          {size: emf.length}),
        blipRec('emf', new Uint8Array(40).fill(0xFF),
          {size: emf.length})]) {
        assert.ok(bad(blip).some((n) => /damaged|larger than/.test(n)));
      }
      assert.ok(performance.now() - t < 1000);
      // a bomb: 1 MB of zeros in about 1 KB, cbSize claiming 64 KB
      const zeros = deflateSync(new Uint8Array(1 << 20));
      assert.ok(bad(blipRec('emf', zeros, {size: 65536}))
        .includes('a damaged picture is skipped'));
      // a checksum that does not match: kept, one note
      const wrong = Uint8Array.from(z);
      wrong[wrong.length - 1] ^= 1;
      const {doc, notes} = read(picDoc(picRecord({blip: blipRec('emf',
        wrong, {size: emf.length})})));
      assert.equal(pictures(doc).length, 1);
      assert.ok(notes.some((n) => /checksum/.test(n)));
    });

  it('a delayed FBSE (its BLIP elsewhere) has a note of its own', () => {
    const f = [6, 6, ...new Array(16).fill(0x11), 0, 0, ...u32le(500),
      ...u32le(1), ...u32le(1234), 0, 0, 0, 0];
    const fbse = artRec(0xF007, f, {ver: 2, inst: 6});
    const sp = artRec(0xF004, [], {ver: 15});
    const {notes} = read(picDoc(picRecord({art: grpprl(sp, fbse)})));
    assert.ok(notes.includes('a picture kept outside its record is ' +
      'not read'));
  });

  it('anchors to one 15 MB picture: copied once, caps first (fix 2)',
    () => {
      const j = jpegGray(8, 8);
      const jpg = new Uint8Array(15 * 1048576);
      jpg.set(j);
      const before = WORK.copies, recs = WORK.records;
      const t = performance.now();
      const {doc, notes} = read(picDoc(picRecord({blip: blipRec('jpeg',
        jpg)}), new Array(3000).fill(0)));
      assert.ok(performance.now() - t < 3000);
      assert.equal(WORK.copies - before, 1);
      assert.equal(WORK.records - recs, 1);
      const media = [...doc.parts.keys()].filter((k) => /media\//.test(k));
      assert.equal(media.length, 1);
      const pics = inlinesOf(doc);
      assert.equal(pics.length, MAX_PICTURES);
      const ids = new Set(pics.map((x) => JSON.stringify(x.node)
        .match(/docPr","attrs":\[\["id","(\d+)"/)[1]));
      assert.equal(ids.size, MAX_PICTURES);
      assert.equal(notes.filter((x) => /more than 1000/.test(x)).length,
        1);
    });

  it('a stored (uncompressed) EMF is kept as it is', async () => {
    const emf = new Uint8Array(108);
    const dv = new DataView(emf.buffer);
    dv.setUint32(0, 1, true);
    dv.setUint32(4, 108, true);
    emf.set([0x20, 0x45, 0x4D, 0x46], 40);
    const {doc, notes} = read(picDoc(picRecord({blip: blipRec('emf',
      emf, {stored: true})})));
    assert.deepEqual(notes, []);
    assert.ok([...doc.parts.keys()].some((k) => /\.emf$/.test(k)));
    await roundTrips(doc, 'stored emf');
  });

  it('a record with no BLIP (a line, a drawing): one note', () => {
    const {doc, notes} = read(picDoc(picRecord({}), [0, 0]));
    assert.equal(pictures(doc).length, 0);
    assert.equal(notes.filter((n) => /inline drawings/.test(n)).length,
      1);
  });
});

// sections: a paragraph with mark '\x0C' ends each but the last
const S = {
  w: (v) => prl(0xB01F, u16le(v)), h: (v) => prl(0xB020, u16le(v)),
  left: (v) => prl(0xB021, u16le(v)), right: (v) => prl(0xB022,
    u16le(v)), top: (v) => prl(0x9023, i16le(v)),
  bottom: (v) => prl(0x9024, i16le(v)), gutter: (v) => prl(0xB025,
    u16le(v)), hdr: (v) => prl(0xB017, u16le(v)),
  ftr: (v) => prl(0xB018, u16le(v)), bkc: (v) => prl(0x3009, v),
  title: () => prl(0x300A, 1), orient: (v) => prl(0x301D, v),
  cols: (n) => prl(0x500B, u16le(n - 1)), space: (v) => prl(0x900C,
    u16le(v)), even: (v) => prl(0x3005, v),
  colW: (i, w) => prl(0xF203, [i, ...u16le(w)], {raw: true}),
  colS: (i, w) => prl(0xF204, [i, ...u16le(w)], {raw: true}),
  nfc: (v) => prl(0x300E, v), restart: () => prl(0x3011, 1),
  start: (v) => prl(0x501C, u16le(v)), vjc: (v) => prl(0x301A, v),
  line: () => prl(0x3019, 1)};
const sep = (...p) => grpprl(...p);
const brk = (text) => ({text, mark: '\x0C'});
const EMPTY6 = [null, null, null, null, null, null];

/** The header / footer text of section i: kind hdr | ftr, type. */
function hf(doc, i, kind, type) {
  const refs = refsOf(doc.sections[i], docScope(doc).map);
  const id = refs[kind][type];
  if (!id) return undefined;
  const st = doc.stories.get(storyOfRef(doc, id));
  return st.blocks.map((b) => (b.type === 'p' ? b.text : '[table]'));
}

describe('.doc: sections (DocSect, DocSep)', () => {
  it('two sections with different margins', async () => {
    const {doc, notes} = read(sectionDoc({main: [brk('one'),
      {text: 'two'}], sections: [sep(S.left(1000), S.right(1100),
      S.top(1200), S.bottom(-1300), S.hdr(500), S.ftr(600),
      S.gutter(100)), sep(S.left(2000), S.bkc(0))]}));
    assert.deepEqual(notes, []);
    assert.equal(doc.sections.length, 2);
    const [a, b] = doc.sections.map((s) => s.props);
    assert.deepEqual(a.pgMar, {top: 1200, right: 1100, bottom: -1300,
      left: 1000, header: 500, footer: 600, gutter: 100});
    assert.deepEqual(a.pgSz, {w: 12240, h: 15840});
    assert.equal(a.type, undefined);
    assert.deepEqual(b.pgMar, {top: 1440, right: 1800, bottom: 1440,
      left: 2000, header: 720, footer: 720, gutter: 0});
    assert.equal(b.type, 'continuous');
    assert.deepEqual(doc.sections.map((s) => texts(s.blocks)),
      [['one'], ['two']]);
    await roundTrips(doc, 'two sections margins');
  });

  it('landscape section swaps width and height', async () => {
    const {doc} = read(sectionDoc({main: [brk('p'), brk('l'),
      {text: 'w'}], sections: [sep(S.w(11906), S.h(16838)),
      sep(S.w(11906), S.h(16838), S.orient(2)),
      sep(S.w(16838), S.h(11906), S.orient(2))]}));
    const z = doc.sections.map((s) => s.props.pgSz);
    assert.deepEqual(z, [{w: 11906, h: 16838},
      {w: 16838, h: 11906, orient: 'landscape'},
      {w: 16838, h: 11906, orient: 'landscape'}]);
    await roundTrips(doc, 'landscape');
  });

  it('columns, page numbers, vertical alignment, break types',
    async () => {
      const {doc} = read(sectionDoc({main: [brk('a'), brk('b'),
        {text: 'c'}], sections: [
        sep(S.cols(3), S.space(360), S.line(), S.nfc(2), S.restart(),
          S.start(5), S.vjc(1), S.bkc(4)),
        sep(S.cols(2), S.even(0), S.colW(0, 3000), S.colS(0, 500),
          S.colW(1, 5000), S.bkc(3)),
        sep(S.cols(2), S.even(0), S.colW(0, 3000), S.bkc(1))]}));
      const [a, b, c] = doc.sections.map((s) => s.props);
      assert.deepEqual(a.cols, {space: 360, num: 3, sep: true});
      assert.deepEqual(a.pgNumType, {fmt: 'lowerRoman', start: 5});
      assert.equal(a.vAlign, 'center');
      assert.equal(a.type, 'oddPage');
      assert.deepEqual(b.cols, {space: 720, num: 2, equalWidth: false,
        col: [{w: 3000, space: 500}, {w: 5000}]});
      assert.equal(b.type, 'evenPage');
      // (a width missing: even columns)
      assert.deepEqual(c.cols, {space: 720, num: 2});
      assert.equal(c.type, 'nextColumn');
      await roundTrips(doc, 'columns');
    });

  it('page sizes, margins and SEPXs out of range', () => {
    const {doc, notes} = read(sectionDoc({main: [brk('a'), brk('b'),
      brk('c'), {text: 'd'}], sections: [
      sep(S.w(0), S.h(65535)),
      sep(S.left(40000), S.top(-32000)),
      sep(S.w(1000), S.left(900), S.right(900)),
      Uint8Array.from([0x1F, 0xB0, 0x10])]}));
    const p = doc.sections.map((s) => s.props);
    assert.deepEqual(p[0].pgSz, {w: 12240, h: 15840});
    assert.equal(p[1].pgMar.left, 1800);
    assert.equal(p[1].pgMar.top, 1440);
    assert.ok(p[2].pgMar.left + p[2].pgMar.right <= 1000 - 144);
    assert.deepEqual(p[3].pgSz, {w: 12240, h: 15840});
    for (const re of [/out of range/, /cut to fit/, /damaged/]) {
      assert.ok(notes.some((n) => re.test(n)), String(re));
    }
  });

  it('line numbers and page borders: a note each', () => {
    const {notes} = read(sectionDoc({main: [{text: 'a'}], sections: [
      sep(prl(0x5015, u16le(1)), prl(0x702B, u32le(0x01080000)))]}));
    assert.ok(notes.includes('line numbers are not read'));
    assert.ok(notes.includes('page borders are not read'));
    const {notes: none} = read(sectionDoc({main: [{text: 'a'}],
      sections: [sep(prl(0x5015, u16le(0)))]}));
    assert.deepEqual(none, []);
  });

  it('fcSepx past the stream, or none: the defaults', () => {
    const a = sectionDoc({main: [brk('a'), {text: 'b'}],
      sections: [sep(S.left(1000)), null]});
    const dv = new DataView(a.streams.table.buffer,
      a.streams.table.byteOffset);
    // (the first Sed's fcSepx, after the 3 CPs)
    dv.setUint32(a.streams.layout.tableAt.PlcfSed + 12 + 2, 0x7FFFFF00,
      true);
    const s = a.streams;
    const {doc, notes} = readDoc(packDoc(s), {date: DATE});
    assert.equal(doc.sections[0].props.pgMar.left, 1800);
    assert.equal(doc.sections[1].props.pgMar.left, 1800);
    assert.ok(notes.some((n) => /page settings lie outside/.test(n)));
  });

  it('PlcfSed damaged: n = 1e6 outside the table, CPs backwards',
    () => {
      const big = sectionDoc({main: [brk('a'), {text: 'b'}],
        sections: [null, null], table: {}});
      const lay = big.streams.layout;
      const dv = new DataView(big.streams.word.buffer);
      dv.setUint32(lay.fib.pair('PlcfSed') + 4, 16e6 + 4, true);
      const r1 = readDoc(packDoc(big.streams), {date: DATE});
      assert.equal(r1.doc.sections.length, 1);
      assert.ok(r1.notes.some((n) => /outside its table/.test(n)));
      const back = read(sectionDoc({main: [brk('a'), brk('b'),
        {text: 'c'}], sections: [null, null, null],
      sedCps: [0, 4, 2, 6]}));
      // (the Seds from the backward CP are left out: one section,
      // whose end is CP 4; the 0x0C at CP 1 is then a page break)
      assert.equal(back.doc.sections.length, 1);
      assert.ok(back.notes.some((n) => /list of sections is damaged/
        .test(n)));
      assert.deepEqual(texts(blocks(back.doc)), ['a\uFFFCb', 'c']);
    });

  it('1,000 sections: MAX_SECTIONS and one note', async () => {
    // (one PAPX run for every paragraph: an FKP holds few)
    let text = '';
    const cps = [0];
    for (let i = 0; i < 999; i++) {
      text += 's' + i + '\x0C';
      cps.push(text.length);
    }
    text += 'last';
    cps.push(text.length + 1);
    const t = performance.now();
    const {doc, notes} = read(sectionDoc({main: [{text}],
      sections: [sep(S.left(1000))], sedCps: cps}));
    assert.ok(performance.now() - t < 5000);
    assert.equal(doc.sections.length, MAX_SECTIONS);
    assert.equal(notes.filter((n) => /more than 500 sections/.test(n))
      .length, 1);
    assert.equal(paras(doc).length, 1000);
  });

  it('100,000 Seds sharing a 32 KB SEPX, no breaks: decoded once ' +
    '(fix 1)', () => {
    const n = 100000;
    const cps = [0, ...new Array(n - 1).fill(0), 2];
    const d = sectionDoc({main: [{text: 'x'}], sections: [null],
      sedCps: cps});
    const s = d.streams;
    // one SEPX of 10,922 sprmSBkc after the Word stream's end
    const fc = s.word.length;
    const g = new Uint8Array(2 + 3 * 10922);
    new DataView(g.buffer).setUint16(0, g.length - 2, true);
    for (let i = 0; i < 10922; i++) g.set([0x09, 0x30, 2], 2 + 3 * i);
    const w = new Uint8Array(fc + g.length);
    w.set(s.word);
    w.set(g, fc);
    s.word = w;
    const at = s.layout.tableAt.PlcfSed;
    const dv = new DataView(s.table.buffer, s.table.byteOffset);
    for (let i = 0; i < n; i++) dv.setUint32(at + 4 * (n + 1) + 12 * i + 2, fc, true);
    const before = SECT_WORK.decodes;
    const t = performance.now();
    const {doc, notes} = readDoc(packDoc(s), {date: DATE});
    assert.ok(performance.now() - t < 2000);
    assert.ok(SECT_WORK.decodes - before <= 1);
    assert.equal(doc.sections.length, 1);
    assert.ok(notes.some((x) => /more than 500 sections/.test(x)));
  });

  it('distinct SEPXs past the decode budget: the last ones read, one ' +
    'note (fix 1)', () => {
    let text = '';
    const cps = [0];
    for (let i = 0; i < 1200; i++) {
      text += 'a\x0C';
      cps.push(text.length);
    }
    text += 'z';
    cps.push(text.length + 1);
    const d = sectionDoc({main: [{text}], sections: [null],
      sedCps: cps});
    const s = d.streams;
    // every Sed its own SEPX (sprmSDxaLeft 1000 + i), after the stream
    const fc = s.word.length;
    const w = new Uint8Array(fc + 6 * cps.length);
    w.set(s.word);
    const at = s.layout.tableAt.PlcfSed, n = cps.length - 1;
    const dv = new DataView(s.table.buffer, s.table.byteOffset);
    for (let i = 0; i < n; i++) {
      w.set([4, 0, 0x21, 0xB0, ...u16le(1000 + i)], fc + 6 * i);
      dv.setUint32(at + 4 * (n + 1) + 12 * i + 2, fc + 6 * i, true);
    }
    s.word = w;
    const before = SECT_WORK.decodes;
    const {doc, notes} = readDoc(packDoc(s), {date: DATE});
    assert.ok(SECT_WORK.decodes - before <= 2 * MAX_SECTIONS);
    assert.equal(doc.sections.length, MAX_SECTIONS);
    assert.equal(doc.sections[0].props.pgMar.left, 1000);
    // (499 breaks close their sections; the last one catches up the
    // 701 no break closed: 1,200 decodes asked, 1,000 made)
    assert.equal(notes.filter((x) => /more section settings/.test(x))
      .length, 1);
  });

  it('a section break mid-table ends the table there', async () => {
    const inT = prl(C.PFInTable, 1);
    const ttp = (more = []) => ({text: '', mark: '\x07',
      prls: [inT, prl(C.PFTtp, 1), defTable([0, 2000]), ...more]});
    const {doc, notes} = read(sectionDoc({main: [
      {text: 'r1', mark: '\x07', prls: [inT]}, ttp(),
      {text: 'mid', mark: '\x0C', prls: [inT]},
      {text: 'r2', mark: '\x07', prls: [inT]}, ttp(),
      {text: 'after'}], sections: [null, null]}));
    assert.equal(doc.sections.length, 2);
    assert.ok(notes.some((n) => /section break inside a table/.test(n)));
    assert.equal(doc.sections[0].blocks[0].type, 'tbl');
    await roundTrips(doc, 'break mid table');
  });
});

describe('.doc: headers and footers (DocHdr)', () => {
  it('a header and footer for section 2 only', async () => {
    const {doc, notes} = read(sectionDoc({main: [brk('one'),
      {text: 'two'}], sections: [null, null], stories: [...EMPTY6,
      ...EMPTY6, null, [{text: 'Head 2'}], null, [{text: 'Foot 2'}],
      null, null]}));
    assert.deepEqual(notes, []);
    assert.equal(hf(doc, 0, 'hdr', 'default'), undefined);
    assert.deepEqual(hf(doc, 1, 'hdr', 'default'), ['Head 2']);
    assert.deepEqual(hf(doc, 1, 'ftr', 'default'), ['Foot 2']);
    assert.deepEqual(doc.sections.map((s) => texts(s.blocks)),
      [['one'], ['two']]);
    await roundTrips(doc, 'header section 2');
  });

  it('first-page header with title page flag', async () => {
    const {doc} = read(sectionDoc({main: [{text: 'body'}],
      sections: [sep(S.title())], stories: [...EMPTY6, null,
        [{text: 'Odd'}], null, null, [{text: 'First'}],
        [{text: 'First foot'}]]}));
    assert.equal(doc.sections[0].props.titlePg, true);
    assert.deepEqual(hf(doc, 0, 'hdr', 'first'), ['First']);
    assert.deepEqual(hf(doc, 0, 'ftr', 'first'), ['First foot']);
    assert.deepEqual(hf(doc, 0, 'hdr', 'default'), ['Odd']);
    await roundTrips(doc, 'first page header');
  });

  it('even headers only with the DOP\'s fFacingPages', async () => {
    const stories = [...EMPTY6, [{text: 'Even'}], [{text: 'Odd'}],
      [{text: 'Even foot'}], null, null, null];
    const a = read(sectionDoc({main: [{text: 'x'}], sections: [null],
      stories}));
    assert.equal(hf(a.doc, 0, 'hdr', 'even'), undefined);
    const b = read(sectionDoc({main: [{text: 'x'}], sections: [null],
      stories, facing: true}));
    assert.deepEqual(hf(b.doc, 0, 'hdr', 'even'), ['Even']);
    assert.deepEqual(hf(b.doc, 0, 'ftr', 'even'), ['Even foot']);
    assert.ok(JSON.stringify(b.doc.rawSettings)
      .includes('evenAndOddHeaders'));
    await roundTrips(b.doc, 'even headers');
  });

  it('a header with formatted text, a table and a picture',
    async () => {
      const inT = prl(C.PFInTable, 1);
      const main = [{text: 'body'}];
      // header CPs: 'Bold head\r' (0..9), cells, row, then the guard
      const story = [{text: 'Bold head', prls: [prl(0x2403, 1)]},
        {text: 'c1', mark: '\x07', prls: [inT]},
        {text: 'c2', mark: '\x07', prls: [inT]},
        {text: '', mark: '\x07', prls: [inT, prl(C.PFTtp, 1),
          defTable([0, 1500, 3000])]},
        {text: 'pic \x01'}];
      const base = 5;   // ('body\r')
      const picAt = base + 10 + 3 + 3 + 1 + 4;
      const {doc, notes} = read(sectionDoc({main, sections: [null],
        stories: [...EMPTY6, null, story, null, null, null, null],
        data: PNG_REC(), runs: [{from: base, to: base + 4,
          prls: [prl(C.CFBold, 1)]}, {from: picAt, to: picAt + 1,
          prls: pic(0)}]}));
      assert.deepEqual(notes, []);
      assert.deepEqual(hf(doc, 0, 'hdr', 'default'),
        ['Bold head', '[table]', 'pic ￼']);
      const st = doc.stories.get(storyOfRef(doc,
        refsOf(doc.sections[0], docScope(doc).map).hdr.default));
      const [p0, t] = st.blocks;
      assert.equal(p0.pPr.jc, 'center');
      assert.equal(p0.runs[0].rPr.b, true);
      assert.equal(t.rows[0].cells.length, 2);
      assert.equal(st.rels.length, 1);
      assert.deepEqual(texts(blocks(doc)), ['body']);
      await roundTrips(doc, 'header table picture');
    });

  it('an empty story inherits; a blank one hides the one before',
    async () => {
      const {doc} = read(sectionDoc({main: [brk('a'), brk('b'),
        {text: 'c'}], sections: [null, null, null], stories: [
        ...EMPTY6, null, [{text: 'H1'}], null, null, null, null,
        null, null, null, null, null, null,
        null, [], null, [], null, null]}));
      assert.deepEqual(hf(doc, 0, 'hdr', 'default'), ['H1']);
      assert.equal(hf(doc, 1, 'hdr', 'default'), undefined);
      assert.deepEqual(hf(doc, 2, 'hdr', 'default'), ['']);
      // (a blank footer with none before it is the same as none)
      assert.equal(hf(doc, 2, 'ftr', 'default'), undefined);
      await roundTrips(doc, 'inherit blank');
    });

  it('PlcfHdd too short, backwards, outside the header text', () => {
    const stories = [...EMPTY6, null, [{text: 'H1'}], null, null,
      null, null, null, [{text: 'H2'}], null, null, null, null];
    const main = [brk('a'), {text: 'b'}];
    const short = read(sectionDoc({main, sections: [null, null],
      stories, hddCps: [0, 0, 0, 0, 0, 0, 0, 0, 3]}));
    assert.ok(short.notes.some((n) => /fewer headers/.test(n)));
    const bad = read(sectionDoc({main, sections: [null, null], stories,
      hddCps: [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 1e6, 1e6 + 5,
        2, 2, 2, 2, 2, 2]}));
    assert.ok(bad.notes.some((n) => /outside its header text/.test(n)));
    assert.equal(hf(bad.doc, 1, 'hdr', 'default'), undefined);
    const back = read(sectionDoc({main, sections: [null, null],
      stories, hddCps: [0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 1,
        1, 1, 1, 1, 3, 4]}));
    assert.ok(back.notes.some((n) => /outside its header text/.test(n)));
  });

  it('a header range larger than the stream is cut to the text', () => {
    const a = sectionDoc({main: [{text: 'x'}], sections: [null],
      stories: [...EMPTY6, null, [{text: 'H'}], null, null, null,
        null]});
    const dv = new DataView(a.streams.word.buffer);
    dv.setUint32(a.streams.layout.fib.lw + 4 * 5, 1e8, true);
    const {doc} = readDoc(packDoc(a.streams), {date: DATE});
    assert.deepEqual(hf(doc, 0, 'hdr', 'default'), ['H']);
  });
});

// ---------------------------------------------------------------------
// Real Word: fix-parts.doc, which Word saved from docword-fixtures.mjs
// 'parts' (tools/doc-word-fixtures.mjs parts), against its .docx;
// and the corpus (both uncommitted: skipped when absent)
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORD = path.join(HERE, 'word-check-out', 'doc-from-word');
const haveWord = fs.existsSync(path.join(WORD, 'fix-parts.doc')) &&
  fs.existsSync(path.join(WORD, 'fix-parts.docx'));
const SECT_KEYS = ['pgSz', 'pgMar', 'cols', 'titlePg', 'type',
  'pgNumType', 'vAlign'];
const localName = (n) => String(n && n.name || '').split(':').pop();
const rawText = (n) => (typeof n === 'string' ? n : (n.children || [])
  .map((c) => (localName(n) === 't' || typeof c !== 'string'
    ? rawText(c) : '')).join(''));
/** A block's look: a paragraph's text, jc and run formatting, a
 *  table's cell texts (one kept whole too). */
function blockLook(b) {
  if (b.type === 'tbl') {
    return {table: b.rows.flatMap((r) => r.cells.map((c) =>
      c.blocks.map((x) => x.text).join('/')))};
  }
  if (b.type === 'opaque') {
    const cells = [];
    const walk = (n) => {
      if (localName(n) === 'tc') cells.push(rawText(n));
      else for (const c of n.children || []) walk(c);
    };
    walk(b.node);
    return {table: cells};
  }
  return {text: b.text, jc: b.pPr.jc || 'left', runs: b.runs.map((r) =>
    [r.rPr.b || false, r.rPr.i || false, r.rPr.color || 'auto'])};
}
/** The comparable look: each section's props (SECT_KEYS, units
 *  left out) and the headers / footers it shows, and the pictures. */
function wordLook(doc) {
  const map = docScope(doc).map, eff = {};
  const sections = doc.sections.map((s) => {
    const out = {};
    for (const k of SECT_KEYS) {
      if (s.props[k] !== undefined) out[k] = s.props[k];
    }
    const refs = refsOf(s, map);
    for (const kind of ['hdr', 'ftr']) {
      for (const type of ['default', 'first', 'even']) {
        const id = refs[kind][type];
        if (id) eff[kind + type] = storyOfRef(doc, id);
        const st = doc.stories.get(eff[kind + type]);
        if (st) out[kind + ' ' + type] = st.blocks.map(blockLook);
      }
    }
    return out;
  });
  const m = docMap(doc), pics = [];
  const walk = (bs) => {
    for (const b of bs) {
      if (b.type === 'tbl') {
        b.rows.forEach((r) => r.cells.forEach((c) => walk(c.blocks)));
      }
      for (const x of Object.values(b.inlines || {})) {
        const q = x.node && readPicture(x.node, m);
        if (!q) continue;
        const md = mediaOf(doc, q.embed);
        pics.push({cx: q.cx, cy: q.cy, srcRect: q.srcRect || null,
          info: md && imageInfo(md.bytes), sha: md && createHash('sha1')
            .update(md.bytes).digest('hex')});
      }
    }
  };
  doc.sections.forEach((s) => walk(s.blocks));
  return {sections, pics};
}

describe('.doc pictures and sections saved by real Word', {skip: haveWord
  ? false : 'no Word-made fixtures (tools/doc-word-fixtures.mjs parts)'},
() => {
  it('fix-parts: page settings, headers, footers and pictures are ' +
    'Word\'s', async () => {
    const {doc, notes} = readDoc(new Uint8Array(fs.readFileSync(
      path.join(WORD, 'fix-parts.doc'))));
    const src = await readDocx(new Uint8Array(fs.readFileSync(
      path.join(WORD, 'fix-parts.docx'))));
    assert.deepEqual(notes, []);
    const want = wordLook(src);
    assert.equal(want.pics.length, 4);
    assert.equal(want.sections.length, 3);
    assert.deepEqual(wordLook(doc), want);
    const back = await roundTrips(doc, 'word parts');
    assert.deepEqual(wordLook(back), want);
  });
});

const FILES = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].flatMap((d) =>
  find(path.join(HERE, d), '.doc')).sort();
function find(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}

describe('.doc corpus: pictures, sections, headers', {skip: FILES.length
  ? false : 'no .doc corpus (optional, git-ignored)'}, () => {
  it('every .doc reads or is refused with an ImportError in 5 s', () => {
    const counts = {};
    let slow = [0, ''];
    for (const f of FILES) {
      const t = performance.now();
      let got = 'ok';
      try {
        readDoc(new Uint8Array(fs.readFileSync(f)));
      } catch (e) {
        assert.equal(e.name, 'ImportError', f + ': ' + e.stack);
        got = e.code;
      }
      const ms = performance.now() - t;
      assert.ok(ms < 5000, f);
      if (ms > slow[0]) slow = [ms, path.basename(f)];
      counts[got] = (counts[got] || 0) + 1;
    }
    console.log('# doc corpus (parts): ' + JSON.stringify(counts) +
      `, slowest ${Math.round(slow[0])} ms (${slow[1]})`);
  });

  it('VariousPictures.doc (Word): all 5 pictures, the .docx\'s bytes ' +
    '(fix 3)', {skip: fs.existsSync(path.join(WORD,
    'VariousPictures.doc')) && fs.existsSync(path.join(CORPUS, 'poi',
    'VariousPictures.docx')) ? false : 'absent'}, async () => {
    const hashes = (doc) => [...doc.parts].filter(([k]) =>
      /media\//.test(k)).map(([k, b]) => k.split('.').pop() + ' ' +
      createHash('sha1').update(b).digest('hex')).sort();
    const {doc, notes} = readDoc(new Uint8Array(fs.readFileSync(
      path.join(WORD, 'VariousPictures.doc'))));
    assert.deepEqual(notes, []);
    const src = await readDocx(new Uint8Array(fs.readFileSync(
      path.join(CORPUS, 'poi', 'VariousPictures.docx'))));
    assert.deepEqual(hashes(doc), hashes(src));
    assert.equal(hashes(doc).filter((x) => /^(emf|wmf) /.test(x))
      .length, 3);
    await roundTrips(doc, 'various pictures');
  });

  it('pictures, sections and headers against the .docx twins',
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
        const own = f.replace(/\.doc$/i, '.docx');
        const base = path.basename(own);
        const x = fs.existsSync(own) ? own
          : docx.find((p) => path.basename(p) === base);
        if (x) pairs.push([f, x, 'Word']);
      }
      const by = {};
      for (const [f, x, who] of pairs) {
        let a, b;
        try {
          a = partStats(readDoc(new Uint8Array(fs.readFileSync(f))).doc);
        } catch (e) {
          if (e.name !== 'ImportError') throw e;
          continue;
        }
        try {
          b = partStats(await readDocx(new Uint8Array(
            fs.readFileSync(x))));
        } catch (e) {
          continue;     // (a twin the .docx reader refuses)
        }
        const t = by[who] ||= {n: 0, same: 0, text: 0,
          ...Object.fromEntries(PART_KEYS.map((k) => [k, [0, 0]]))};
        t.n++;
        if (PART_KEYS.every((k) => a[k] === b[k])) t.same++;
        if (a.hfText === b.hfText) t.text++;
        for (const k of PART_KEYS) {
          t[k][0] += a[k];
          t[k][1] += b[k];
        }
      }
      for (const [who, t] of Object.entries(by)) {
        console.log(`# doc parts (${who}): ${t.n} compared, ${t.same} ` +
          `the same, header text the same ${t.text}, ` +
          PART_KEYS.map((k) => `${k} ${t[k][0]}/${t[k][1]}`).join(', '));
        // (the pictures the .doc reader skips, compressed metafiles
        // and drawings, are most of the rest: task-14 findings)
        assert.ok(t.same / t.n > 0.8, who);
        assert.ok(t.sections[0] >= t.sections[1] * 0.97, who);
      }
      assert.ok(Object.keys(by).length > 0);
    });
});
