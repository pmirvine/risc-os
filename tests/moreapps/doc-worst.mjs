// doc-worst (.doc import, task 16): one spec-derived .doc made to
// reach several of the reader's budgets at once, for the combined
// worst-case probe (docprobe.test.mjs). Built on
// ./doc-review-helpers.mjs reviewDoc (from [MS-DOC]); not the output
// of any office program.
//
//   worstDoc(o?) -> {bytes, counts}  o (all optional, defaults in
//       WORST): fields (PAGE fields in the main text, ten a
//       paragraph), comments (each over one character), notes
//       (footnotes), pictures (anchors, each its own Data-stream
//       record of a compressed EMF of emfSize bytes, inflating to
//       it), rows (2-cell table rows), sections (section breaks,
//       each section with its own header story), bookmarks, piece
//       (the characters a piece: the text is cut into pieces of that
//       many characters) and prcs (the pieces' Prm1s cycle through
//       that many different Prc grpprls). counts says what it holds
import {deflateSync} from 'node:zlib';
import {reviewDoc} from './doc-review-helpers.mjs';
import {packDoc, prl, u16le, u32le, defTable, tc80, picRecord, blipRec,
  grpprl} from './doc-helpers.mjs';

export const WORST = {fields: 60000, comments: 10005, notes: 10005,
  pictures: 1100, emfSize: 1 << 20, rows: 2000, sections: 600,
  bookmarks: 60000, piece: 2, prcs: 15000};

/** An EMF of n bytes: its header record ([MS-EMF] 2.3.4.2, n in
 *  nBytes) and an EOF record, then zeros. */
function emf(n) {
  const b = new Uint8Array(n);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 1, true);
  dv.setUint32(4, 88, true);
  dv.setUint32(16, 100, true);
  dv.setUint32(20, 50, true);
  b.set([0x20, 0x45, 0x4D, 0x46], 40);
  dv.setUint32(44, 0x10000, true);
  dv.setUint32(48, n, true);
  dv.setUint32(52, 2, true);
  dv.setUint32(88, 14, true);
  dv.setUint32(92, 20, true);
  dv.setUint32(104, 20, true);
  return b;
}

/** The Clx of pieces of `piece` characters over CPs 0..total of the
 *  unicode text at fc0, with Prm1s through prcs Prc grpprls. */
function piecesClx(total, fc0, piece, prcs) {
  const n = Math.ceil(total / piece);
  const prc = [];
  for (let k = 0; k < prcs; k++) {
    // (sprmCHps of 2..3001 and sprmCKul 0..7: every grpprl differs)
    const g = grpprl(prl(0x4A43, u16le(2 + (k % 3000))),
      prl(0x2A3E, Math.floor(k / 3000) % 8));
    prc.push(1, ...u16le(g.length), ...g);
  }
  const lcb = 4 * (n + 1) + 8 * n;
  const clx = new Uint8Array(prc.length + 5 + lcb);
  clx.set(prc);
  const at = prc.length;
  const dv = new DataView(clx.buffer);
  clx[at] = 2;
  dv.setUint32(at + 1, lcb, true);
  for (let i = 0; i < n; i++) {
    dv.setInt32(at + 5 + 4 * i, i * piece, true);
    const o = at + 5 + 4 * (n + 1) + 8 * i;
    dv.setUint32(o + 2, fc0 + 2 * i * piece, true);
    dv.setUint16(o + 6, prcs ? ((i % prcs) << 1) | 1 : 0, true);
  }
  dv.setInt32(at + 5 + 4 * n, total, true);
  return clx;
}

/** See the header. */
export function worstDoc(o = {}) {
  const w = {...WORST, ...o};
  const P = (text, x = {}) => ({text, ...x});
  const main = [];
  const runs = [];
  let cp = 0;
  const add = (p) => {
    main.push(p);
    const at = cp;
    cp += p.text.length + (p.mark ?? '\r').length;
    return at;
  };
  // fields: ten a paragraph, the paragraphs in one PAPX run
  const ten = '\x13 PAGE \x141\x15'.repeat(10);
  const nf = Math.ceil(w.fields / 10);
  if (nf) add(P((ten + '\r').repeat(nf - 1) + ten));
  // comments and footnotes: their marks, each after one character
  const cAt = add(P('c\x05\r'.repeat(w.comments) + 'end'));
  const nAt = add(P('n\x02\r'.repeat(w.notes) + 'end'));
  // pictures: each its own run (its own Data offset)
  const pAt = add(P('\x01'.repeat(w.pictures)));
  // the table
  const inT = prl(0x2416, 1);
  for (let r = 0; r < w.rows; r++) {
    add(P('a', {mark: '\x07', prls: [inT]}));
    add(P('b', {mark: '\x07', prls: [inT]}));
    add(P('', {mark: '\x07', prls: [inT, prl(0x2417, 1),
      defTable([0, 1500, 3000], [tc80(), tc80()])]}));
  }
  // the sections
  for (let s = 0; s < w.sections; s++) add(P('s', {mark: '\x0C'}));
  add(P('last'));
  // pictures' data: a record each
  const data = [];
  const ats = [];
  const rec = Uint8Array.from(picRecord({blip: blipRec('emf',
    deflateSync(emf(w.emfSize)), {size: w.emfSize})}));
  for (let i = 0; i < w.pictures; i++) {
    ats.push(data.length * rec.length);
    data.push(rec);
  }
  const dataBytes = new Uint8Array(data.length * rec.length);
  data.forEach((d, i) => dataBytes.set(d, i * rec.length));
  for (let i = 0; i < w.pictures; i++) {
    runs.push({from: pAt + i, to: pAt + i + 1, prls: [prl(0x0855, 1),
      prl(0x6A03, u32le(ats[i]))]});
  }
  const comments = [];
  for (let i = 0; i < w.comments; i++) {
    comments.push({paras: [P('\x05 c')], range: [cAt + 3 * i,
      cAt + 3 * i + 1]});
  }
  const footnotes = Array.from({length: w.notes}, () => [P('\x02 n')]);
  const stories = [null, null, null, null, null, null];
  for (let s = 0; s <= w.sections; s++) {
    stories.push(null, [P('h' + s)], null, null, null, null);
  }
  const bookmarks = Array.from({length: w.bookmarks}, (_, i) => ({
    name: 'b' + i, start: i % cp, end: Math.min(cp, i % cp + 10)}));
  const got = reviewDoc({main, runs, comments, footnotes, stories,
    sections: [grpprl(prl(0xB021, u16le(1300)))], version: 0xC1,
    owners: ['A'], bookmarks, streams: {Data: dataBytes}});
  // the pieces: the whole text cut into short pieces with Prm1s
  const s = got.streams;
  const total = Object.values(got.ccp).reduce((a, b) => a + (b || 0), 0);
  const clx = piecesClx(total, s.layout.textAt, w.piece, w.prcs);
  const table = new Uint8Array(s.table.length + clx.length);
  table.set(s.table);
  table.set(clx, s.table.length);
  const dv = new DataView(s.word.buffer);
  dv.setUint32(s.layout.fib.pair('Clx'), s.table.length, true);
  dv.setUint32(s.layout.fib.pair('Clx') + 4, clx.length, true);
  const bytes = packDoc({...s, table});
  return {bytes, counts: {...w, characters: total,
    pieces: Math.ceil(total / w.piece), paragraphs: main.length,
    nAt}};
}
