// doc-helpers (.doc import, tasks 10+): spec-derived fixtures for
// Word 97-2003 files, written by hand from [MS-CFB] (Compound File
// Binary File Format: 2.2 the header, 2.3 sectors and the FAT, 2.5
// the DIFAT, 2.6 the directory and its red-black trees, 2.7 the
// mini stream). Not the output of any office program: real files
// are in the uncommitted corpus only.
//
//   makeCfb({streams, sectorSize?}) -> Uint8Array
//   makeCfbLayout({streams, sectorSize?}) -> {bytes, layout}
//     streams: a Map, an object or an array of [path, bytes] pairs
//       (an array may repeat a path); a path is 'Name' at the root
//       or 'Storage/Name' (storages made as needed). Streams of
//       under 4096 bytes go in the mini stream, the rest in sectors
//       of their own.
//     sectorSize: 512 (version 3, the default) or 4096 (version 4)
//     layout: where things went, for tests that break them:
//       ss, nFat, nDifat, fatIds, difatIds, dirStart, dirSectors,
//       miniFatStart, miniStart (the mini stream's first sector),
//       entries: [{sid, path, type, start, size, mini}] (sid 0 is
//       the root), sectorOffset(id), fatOffset(id),
//       miniFatOffset(id), entryOffset(sid)
//
// Layout: the FAT sectors first, then the DIFAT, the directory, the
// miniFAT, the mini stream and the big streams, each chain in
// consecutive sectors. Each storage's children are a balanced
// binary tree in [MS-CFB] order (shorter names first, then by upper
// case); its deepest level is red, the rest black, which keeps the
// red-black rules (2.6.4).
export const END = 0xFFFFFFFE, FREE = 0xFFFFFFFF;
export const FATSECT = 0xFFFFFFFD, DIFSECT = 0xFFFFFFFC;
export const NONE = 0xFFFFFFFF;
export const SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A,
  0xE1];
const CUTOFF = 4096, MINI = 64;

const pairsOf = (s) => Array.isArray(s) ? s
  : s instanceof Map ? [...s] : Object.entries(s);
const cmp = (a, b) => a.name.length - b.name.length ||
  (a.name.toUpperCase() < b.name.toUpperCase() ? -1
    : a.name.toUpperCase() > b.name.toUpperCase() ? 1 : 0);

/** The directory entries: root first, then each storage's children
 *  in the order they were met. */
function entriesOf(streams) {
  const root = {name: 'Root Entry', type: 5, kids: [], path: ''};
  const all = [root];
  for (const [path, data] of pairsOf(streams)) {
    const parts = path.split('/');
    let at = root;
    for (const p of parts.slice(0, -1)) {
      let s = at.kids.find((k) => k.type === 1 && k.name === p);
      if (!s) {
        s = {name: p, type: 1, kids: [], path: at.path + p + '/'};
        at.kids.push(s);
        all.push(s);
      }
      at = s;
    }
    const e = {name: parts.at(-1), type: 2, data, path};
    at.kids.push(e);
    all.push(e);
  }
  all.forEach((e, i) => { e.sid = i; });
  for (const e of all) {
    if (e.name.length > 31) throw new Error('name too long: ' + e.name);
    e.left = e.right = e.child = NONE;
    e.colour = 1;
  }
  for (const e of all) {
    if (!e.kids) continue;
    const kids = e.kids.slice().sort(cmp);
    let deepest = 0;
    const build = (lo, hi, depth) => {
      if (lo > hi) return NONE;
      const mid = (lo + hi) >> 1, k = kids[mid];
      k.depth = depth;
      deepest = Math.max(deepest, depth);
      k.left = build(lo, mid - 1, depth + 1);
      k.right = build(mid + 1, hi, depth + 1);
      return k.sid;
    };
    e.child = build(0, kids.length - 1, 0);
    for (const k of kids) k.colour = k.depth === deepest &&
      deepest > 0 ? 0 : 1;
  }
  return all;
}

export function makeCfb(opts) { return makeCfbLayout(opts).bytes; }

export function makeCfbLayout({streams, sectorSize = 512}) {
  const ss = sectorSize;
  if (ss !== 512 && ss !== 4096) throw new Error('sector size');
  const per = ss / 4;
  const all = entriesOf(streams);
  let miniSecs = 0, bigSecs = 0;
  for (const e of all) {
    if (e.type !== 2) continue;
    e.size = e.data.length;
    e.mini = e.size < CUTOFF;
    const n = Math.ceil(e.size / (e.mini ? MINI : ss));
    e.start = n ? (e.mini ? miniSecs : bigSecs) : END;
    e.count = n;
    if (e.mini) miniSecs += n; else bigSecs += n;
  }
  const miniLen = miniSecs * MINI;
  const nMiniFat = Math.ceil(miniSecs * 4 / ss);
  const nMiniStream = Math.ceil(miniLen / ss);
  const nDir = Math.ceil(all.length * 128 / ss);
  const data = nDir + nMiniFat + nMiniStream + bigSecs;
  let nFat = 1, nDifat = 0;
  for (;; nFat++) {
    nDifat = nFat > 109 ? Math.ceil((nFat - 109) / (per - 1)) : 0;
    if (nFat * per >= data + nFat + nDifat) break;
  }
  const total = nFat + nDifat + data;
  const dirStart = nFat + nDifat, miniFatStart = dirStart + nDir;
  const miniStart = miniFatStart + nMiniFat;
  const bigStart = miniStart + nMiniStream;
  const bytes = new Uint8Array(ss * (1 + total));
  const dv = new DataView(bytes.buffer);
  const sectorOffset = (id) => (id + 1) * ss;
  const fatOffset = (id) => sectorOffset(Math.floor(id / per)) +
    (id % per) * 4;
  const miniFatOffset = (id) => sectorOffset(miniFatStart +
    Math.floor(id / per)) + (id % per) * 4;
  const entryOffset = (sid) => sectorOffset(dirStart +
    Math.floor(sid * 128 / ss)) + (sid * 128) % ss;
  const put = (at, v) => dv.setUint32(at, v, true);

  // The FAT: every sector free, then the chains.
  for (let id = 0; id < nFat * per; id++) put(fatOffset(id), FREE);
  const chain = (first, n, offset) => {
    for (let i = 0; i < n; i++)
      put(offset(first + i), i === n - 1 ? END : first + i + 1);
  };
  for (let i = 0; i < nFat; i++) put(fatOffset(i), FATSECT);
  for (let i = 0; i < nDifat; i++) put(fatOffset(nFat + i), DIFSECT);
  chain(dirStart, nDir, fatOffset);
  chain(miniFatStart, nMiniFat, fatOffset);
  chain(miniStart, nMiniStream, fatOffset);
  for (let id = 0; id < nMiniFat * per; id++)
    put(miniFatOffset(id), FREE);
  for (const e of all) {
    if (e.type !== 2 || !e.count) continue;
    if (e.mini) {
      chain(e.start, e.count, miniFatOffset);
      bytes.set(e.data, sectorOffset(miniStart) + e.start * MINI);
    } else {
      e.start += bigStart;
      chain(e.start, e.count, fatOffset);
      bytes.set(e.data, sectorOffset(e.start));
    }
  }

  // The header and the DIFAT.
  bytes.set(SIGNATURE, 0);
  dv.setUint16(24, 0x3E, true);
  dv.setUint16(26, ss === 512 ? 3 : 4, true);
  dv.setUint16(28, 0xFFFE, true);
  dv.setUint16(30, ss === 512 ? 9 : 12, true);
  dv.setUint16(32, 6, true);
  put(40, ss === 512 ? 0 : nDir);
  put(44, nFat);
  put(48, dirStart);
  put(56, CUTOFF);
  put(60, nMiniFat ? miniFatStart : END);
  put(64, nMiniFat);
  put(68, nDifat ? nFat : END);
  put(72, nDifat);
  const fatIds = [], difatIds = [];
  for (let i = 0; i < nFat; i++) fatIds.push(i);
  for (let i = 0; i < nDifat; i++) difatIds.push(nFat + i);
  for (let i = 0; i < 109; i++) put(76 + 4 * i, i < nFat ? i : FREE);
  for (let d = 0; d < nDifat; d++) {
    const at = sectorOffset(nFat + d);
    for (let k = 0; k < per - 1; k++) {
      const i = 109 + d * (per - 1) + k;
      put(at + 4 * k, i < nFat ? i : FREE);
    }
    put(at + 4 * (per - 1), d === nDifat - 1 ? END : nFat + d + 1);
  }

  // The directory: unused slots have no links.
  for (let sid = all.length; sid < nDir * ss / 128; sid++) {
    const at = entryOffset(sid);
    put(at + 68, NONE); put(at + 72, NONE); put(at + 76, NONE);
  }
  for (const e of all) {
    const at = entryOffset(e.sid);
    for (let i = 0; i < e.name.length; i++)
      dv.setUint16(at + 2 * i, e.name.charCodeAt(i), true);
    dv.setUint16(at + 64, (e.name.length + 1) * 2, true);
    bytes[at + 66] = e.type;
    bytes[at + 67] = e.colour;
    put(at + 68, e.left); put(at + 72, e.right); put(at + 76, e.child);
    if (e.type === 5) {
      put(at + 116, miniLen ? miniStart : END);
      put(at + 120, miniLen);
    } else if (e.type === 2) {
      put(at + 116, e.start);
      put(at + 120, e.size);
    }
  }
  const entries = all.map((e) => ({sid: e.sid, path: e.path,
    type: e.type, start: e.start, size: e.size, mini: e.mini}));
  return {bytes, layout: {ss, nFat, nDifat, fatIds, difatIds, dirStart,
    dirSectors: nDir, miniFatStart, miniStart, entries, sectorOffset,
    fatOffset, miniFatOffset, entryOffset}};
}

// ---------------------------------------------------------------------
// makeDoc (task 11+): a Word 97-2003 .doc written by hand from
// [MS-DOC] (2.5 the Fib: FibBase, FibRgW97, FibRgLw97, the
// FibRgFcLcb blob, FibRgCswNew; 2.9.38 Clx, 2.9.178 Pcdt, 2.8.35
// PlcPcd, 2.9.177 Pcd, 2.9.73 FcCompressed). Spec-derived, not the
// output of any office program. Built from parts so later tasks
// can add theirs (formatting FKPs, style sheets...):
//
//   makeDoc(opts) -> Uint8Array           packDoc(docStreams(opts))
//   docStreams(opts) -> {word, table, tableName, streams, layout}
//     the WordDocument and table streams before they are packed
//     (patch them, then packDoc); layout {fib: offsets of the FIB's
//     fields (nFib, flags, csw, cslw, lw, ccpText, cbRgFcLcb, blob,
//     cswNew, pair(name) -> the offset of its fc), pieces: [{cpStart,
//     cpEnd, fc, unicode}], textAt, tableAt: {name: fc}}
//   packDoc({word, table, tableName, streams?}) -> Uint8Array
//     (makeCfb; table null leaves it out)
//   opts:
//     text      the main story's text ('\r' the paragraph mark)
//     pieces    [{text, unicode?}] in CP order instead (text is
//               then their join); unicode default: true unless every
//               character fits a compressed byte
//     fast      the pieces' text is written in the Word stream in
//               reverse order (fc order not CP order), as a fast save
//     version   nFib (0xC1 default; above it FibBase says 0xC1 and
//               FibRgCswNew nFibNew; below it FibBase says it)
//     wIdent    (0xA5EC), encrypted (fEncrypted), whichTbl (1)
//     codepage  of the compressed pieces (1252), for encoding them
//     ccp       {Text?, Ftn?, Hdd?, Atn?, Edn?, Txbx?, HdrTxbx?}
//               (Text default: the text's length)
//     table     {name: bytes}: blobs put in the table stream before
//               the Clx, their fc/lcb pairs set
//     prc       [Uint8Array] Prc grpprls written before the Pcdt
//     wordTail  bytes put after the text in the Word stream (its
//               offset: layout.tailAt)
//     streams   more streams for the container ({name: bytes})
//     cbRgFcLcb pairs in the blob (by version: 0x5D for 97)
export const NFIB_PAIRS = {0xC1: 0x5D, 0xD9: 0x6C, 0x101: 0x88,
  0x10C: 0xA4, 0x112: 0xB7};
const CSW_NEW = {0xD9: 2, 0x101: 2, 0x10C: 2, 0x112: 5};
const FC_ORDER = ('StshfOrig Stshf PlcffndRef PlcffndTxt PlcfandRef ' +
  'PlcfandTxt PlcfSed PlcPad PlcfPhe SttbfGlsy PlcfGlsy PlcfHdd ' +
  'PlcfBteChpx PlcfBtePapx PlcfSea SttbfFfn PlcfFldMom PlcfFldHdr ' +
  'PlcfFldFtn PlcfFldAtn PlcfFldMcr SttbfBkmk PlcfBkf PlcfBkl Cmds ' +
  'Unused1 SttbfMcr PrDrvr PrEnvPort PrEnvLand Wss Dop SttbfAssoc ' +
  'Clx PlcfPgdFtn AutosaveSource GrpXstAtnOwners SttbfAtnBkmk ' +
  'Unused2 Unused3 PlcSpaMom PlcSpaHdr PlcfAtnBkf PlcfAtnBkl Pms ' +
  'FormFldSttbs PlcfendRef PlcfendTxt PlcfFldEdn Unused4 DggInfo ' +
  'SttbfRMark SttbfCaption SttbfAutoCaption PlcfWkb PlcfSpl ' +
  'PlcftxbxTxt PlcfFldTxbx PlcfHdrtxbxTxt PlcffldHdrTxbx StwUser ' +
  'SttbTtmbd CookieData PgdMotherOldOld BkdMotherOldOld ' +
  'PgdFtnOldOld BkdFtnOldOld PgdEdnOldOld BkdEdnOldOld ' +
  'SttbfIntlFld RouteSlip SttbSavedBy SttbFnm PlfLst PlfLfo ' +
  'PlcfTxbxBkd PlcfTxbxHdrBkd DocUndoWord9 RgbUse Usp Uskf ' +
  'PlcupcRgbUse PlcupcUsp SttbGlsyStyle Plgosl Plcocx PlcfBteLvc ' +
  'FtModified PlcfLvcPre10 PlcfAsumy PlcfGram SttbListNames ' +
  'SttbfUssr ' +
  // (task 15: FibRgFcLcb2000's 15, then 2002's first 5, to AtrdExtra)
  'PlcfTch RmdThreading Mid SttbRgtplc MsoEnvelope PlcfLad RgDofr ' +
  'Plcosl PlcfCookieOld PgdMotherOld BkdMotherOld PgdFtnOld ' +
  'BkdFtnOld PgdEdnOld BkdEdnOld Unused1of2002 PlcfPgp Plcfuim ' +
  'PlfguidUim AtrdExtra')
  .split(' ');      // ([MS-DOC] 2.5.6-2.5.8 in order, to pair 112)
const SPEC_8BIT = new Map([[0x201A, 0x82], [0x0192, 0x83],
  [0x201E, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B],
  [0x0152, 0x8C], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x0178, 0x9F]]);
// (1252's three more: the euro, Z and z with caron)
const CP1252 = new Map([...SPEC_8BIT, [0x20AC, 0x80], [0x017D, 0x8E],
  [0x017E, 0x9E]]);

/** The byte of character c in a compressed piece, or -1. */
function byteOf(c, codepage) {
  const u = c.charCodeAt(0);
  if (codepage === 1252 && CP1252.has(u)) return CP1252.get(u);
  if (SPEC_8BIT.has(u)) return SPEC_8BIT.get(u);
  if (u < 0x80 || (u >= 0xA0 && u < 0x100)) return u;
  return -1;
}

const fits = (s, cpg) => [...s].every((c) => byteOf(c, cpg) >= 0);

function encode(text, unicode, codepage) {
  if (unicode) {
    const b = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      b[2 * i] = text.charCodeAt(i) & 0xFF;
      b[2 * i + 1] = text.charCodeAt(i) >> 8;
    }
    return b;
  }
  const b = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const v = byteOf(text[i], codepage);
    if (v < 0) throw new Error('not 8-bit: ' + text[i]);
    b[i] = v;
  }
  return b;
}

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** The Clx: Prc entries, then the Pcdt (PlcPcd of the pieces). */
export function clxOf(pieces, prc = []) {
  const parts = [];
  for (const g of prc) {
    const h = new Uint8Array(3);
    h[0] = 1;
    new DataView(h.buffer).setInt16(1, g.length, true);
    parts.push(h, g);
  }
  const n = pieces.length, lcb = 4 * (n + 1) + 8 * n;
  const plc = new Uint8Array(5 + lcb);
  const dv = new DataView(plc.buffer);
  plc[0] = 2;
  dv.setUint32(1, lcb, true);
  pieces.forEach((p, i) => {
    dv.setInt32(5 + 4 * i, p.cpStart, true);
    const raw = p.unicode ? p.fc : (p.fc * 2) | 0x40000000;
    dv.setUint32(5 + 4 * (n + 1) + 8 * i + 2, raw >>> 0, true);
  });
  dv.setInt32(5 + 4 * n, n ? pieces[n - 1].cpEnd : 0, true);
  parts.push(plc);
  return concat(parts);
}

export function docStreams(opts = {}) {
  const version = opts.version ?? 0xC1;
  const codepage = opts.codepage ?? 1252;
  const specs = opts.pieces || [{text: opts.text ?? ''}];
  const nPairs = opts.cbRgFcLcb ?? NFIB_PAIRS[version] ?? 0x5D;
  const cswNew = version > 0xC1 ? (CSW_NEW[version] ?? 2) : 0;
  // FIB: 32 + 2 + 28 + 2 + 88 + 2 + 8 pairs + 2 + 2 cswNew
  const fibLen = 154 + nPairs * 8 + 2 + cswNew * 2;
  const textAt = Math.max(0x400, fibLen);
  const pieces = [];
  let cp = 0;
  for (const s of specs) {
    const unicode = s.unicode ?? !fits(s.text, codepage);
    pieces.push({cpStart: cp, cpEnd: cp + s.text.length, unicode,
      bytes: encode(s.text, unicode, codepage)});
    cp += s.text.length;
  }
  const order = opts.fast ? pieces.slice().reverse() : pieces;
  let at = textAt;
  for (const p of order) {
    p.fc = at;
    at += p.bytes.length;
  }
  const tailAt = at;
  const tail = opts.wordTail || new Uint8Array(0);
  const word = new Uint8Array(tailAt + tail.length);
  for (const p of pieces) word.set(p.bytes, p.fc);
  word.set(tail, tailAt);
  // the table stream: the blobs, then the Clx
  const blobs = Object.entries(opts.table || {});
  const tableAt = {};
  const tparts = [];
  let tlen = 0;
  for (const [name, bytes] of blobs) {
    tableAt[name] = tlen;
    tparts.push(bytes);
    tlen += bytes.length;
  }
  const clx = clxOf(pieces, opts.prc);
  tableAt.Clx = tlen;
  tparts.push(clx);
  const table = concat(tparts);
  // the FIB
  const dv = new DataView(word.buffer);
  const u16 = (o, v) => dv.setUint16(o, v, true);
  const u32 = (o, v) => dv.setUint32(o, v >>> 0, true);
  u16(0, opts.wIdent ?? 0xA5EC);
  u16(2, Math.min(version, 0xC1));
  u16(6, 0x0409);
  const whichTbl = opts.whichTbl ?? 1;
  u16(10, (whichTbl ? 0x200 : 0) | (opts.encrypted ? 0x100 : 0) |
    (opts.flags ?? 0));
  u16(12, 0xBF);
  u16(32, 14);
  u16(62, 22);
  const lw = 64;
  u32(lw, word.length);
  const ccp = {Text: cp, ...(opts.ccp || {})};
  const LW = {Text: 3, Ftn: 4, Hdd: 5, Atn: 7, Edn: 8, Txbx: 9,
    HdrTxbx: 10};
  for (const [k, i] of Object.entries(LW)) u32(lw + 4 * i, ccp[k] || 0);
  u16(152, nPairs);
  const blob = 154;
  const pair = (name) => blob + 8 * FC_ORDER.indexOf(name);
  for (const [name, bytes] of blobs) {
    if (!FC_ORDER.includes(name)) throw new Error('pair ' + name);
    u32(pair(name), tableAt[name]);
    u32(pair(name) + 4, (opts.lcb || {})[name] ?? bytes.length);
  }
  u32(pair('Clx'), tableAt.Clx);
  u32(pair('Clx') + 4, clx.length);
  const cswAt = blob + nPairs * 8;
  u16(cswAt, cswNew);
  if (cswNew) u16(cswAt + 2, version);
  const tableName = opts.tableName ?? (whichTbl ? '1Table' : '0Table');
  return {word, table, tableName, streams: opts.streams || {},
    layout: {fib: {nFib: 2, flags: 10, csw: 32, cslw: 62, lw,
      ccpText: lw + 12, cbRgFcLcb: 152, blob, cswNew: cswAt, pair},
    pieces: pieces.map(({cpStart, cpEnd, fc, unicode}) =>
      ({cpStart, cpEnd, fc, unicode})), textAt, tailAt, tableAt}};
}

export function packDoc({word, table, tableName = '1Table',
  streams = {}}) {
  const all = [['WordDocument', word]];
  if (table) all.push([tableName, table]);
  all.push(...Object.entries(streams));
  return makeCfb({streams: all});
}

export const makeDoc = (opts) => packDoc(docStreams(opts));

// ---------------------------------------------------------------------
// Formatting (task 12+): property modifiers, FKP pages, bin tables, the
// style sheet and the font table, written from [MS-DOC] (2.2.5 Sprm /
// Prl, 2.9.44 ChpxFkp, 2.9.183 PapxFkp, 2.8.6-7 PlcBteChpx / Papx,
// 2.9.271 STSH, 2.9.260 STD, 2.9.284 SttbfFfn / 2.9.82 FFN).
//
//   prl(op, operand)  one Prl: op (16 bits) and its operand bytes (an
//     array or Uint8Array; a number is one byte); spra 6 ops get their
//     count byte in front unless opts {raw: true}
//   u16le(v), i16le(v), u32le(v)  operand bytes
//   grpprl(...prls)   their concatenation
//   chpxPage(runs)    a 512-byte CHPX FKP of [{fcFirst, fcLim, grpprl?}]
//     (contiguous: each fcLim is the next one's fcFirst)
//   papxPage(runs)    a PAPX FKP of [{fcFirst, fcLim, istd, grpprl?}]
//   plcBte(fcs, pns)  a bin table (n + 1 fcs, n page numbers)
//   stsh({stds, ftc?, cbStshi?})  a style sheet: stds by istd (null:
//     an empty slot), each {sti, stk (1 | 2), base?, next?, name,
//     papx?, chpx?} (grpprl bytes); ftc the default font index
//   sttbfFfn(names)   a font table
//   formattedDoc({paras, runs?, styles?, fonts?, ...opts}) -> {bytes,
//     streams}  a .doc of the paragraphs paras [{text, istd?, prls?}]
//     (one unicode piece, '\r' after each), character runs runs
//     [{from, to, prls}] (CPs; the rest has no CHPX), styles stsh's
//     options, fonts names; one CHPX and one PAPX page after the text
//     (more when the runs do not fit one: the CHPX pages first).
//     A para's mark is p.mark (default '\r'; '\x07' a cell mark).
//     The rest of opts go to docStreams (opts.lcb {name: lcb}: a blob
//     whose lcb is less than its bytes, as PlfLst's LVLs need)
export const u16le = (v) => [v & 0xFF, (v >> 8) & 0xFF];
export const i16le = (v) => u16le(v & 0xFFFF);
export const u32le = (v) => [v & 0xFF, (v >>> 8) & 0xFF,
  (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];

export function prl(op, operand = [], opts = {}) {
  const v = typeof operand === 'number' ? [operand] : [...operand];
  const head = [op & 0xFF, op >> 8];
  if (op >> 13 === 6 && !opts.raw) head.push(v.length);
  return Uint8Array.from([...head, ...v]);
}

export const grpprl = (...prls) => concat(prls.map((p) =>
  p instanceof Uint8Array ? p : Uint8Array.from(p)));

function fkpBase(runs) {
  const page = new Uint8Array(512);
  const dv = new DataView(page.buffer);
  runs.forEach((r, i) => {
    dv.setUint32(4 * i, r.fcFirst >>> 0, true);
    dv.setUint32(4 * i + 4, r.fcLim >>> 0, true);
  });
  page[511] = runs.length;
  return page;
}

export function chpxPage(runs) {
  const page = fkpBase(runs);
  let top = 511;
  const at = 4 * (runs.length + 1);
  runs.forEach((r, i) => {
    if (!r.grpprl) return;
    top = (top - 1 - r.grpprl.length) & ~1;
    page[top] = r.grpprl.length;
    page.set(r.grpprl, top + 1);
    page[at + i] = top / 2;
  });
  return page;
}

export function papxPage(runs) {
  const page = fkpBase(runs);
  let top = 511;
  const at = 4 * (runs.length + 1);
  runs.forEach((r, i) => {
    const g = r.grpprl || new Uint8Array(0);
    const data = Uint8Array.from([...u16le(r.istd || 0), ...g]);
    const head = data.length & 1 ? [(data.length + 1) / 2]
      : [0, data.length / 2];
    top = (top - head.length - data.length) & ~1;
    page.set(head, top);
    page.set(data, top + head.length);
    page[at + 13 * i] = top / 2;
  });
  return page;
}

export function plcBte(fcs, pns) {
  return Uint8Array.from([...fcs.flatMap(u32le), ...pns.flatMap(u32le)]);
}

const xstz = (s) => [...u16le(s.length),
  ...[...s].flatMap((c) => u16le(c.charCodeAt(0))), 0, 0];
const upx = (b) => [...u16le(b.length), ...b, ...(b.length & 1 ? [0] : [])];

export function stsh({stds, ftc = 0, cbStshi = 18}) {
  const shi = new Uint8Array(cbStshi);
  const sv = new DataView(shi.buffer);
  sv.setUint16(0, stds.length, true);
  sv.setUint16(2, 10, true);                 // cbSTDBaseInFile
  if (cbStshi >= 18) sv.setUint16(12, ftc, true);
  const parts = [...u16le(cbStshi), ...shi];
  for (const s of stds) {
    if (!s) {
      parts.push(0, 0);
      continue;
    }
    const stk = s.stk || 1;
    const ups = stk === 1 ? [[...u16le(s.istdPapx ?? 0),
      ...(s.papx || [])], [...(s.chpx || [])]] : [[...(s.chpx || [])]];
    const std = [...u16le(s.sti ?? 0x0FFE), ...u16le(stk |
      ((s.base ?? 0x0FFF) << 4)), ...u16le(ups.length |
      ((s.next ?? 0x0FFF) << 4)), 0, 0, 0, 0, ...xstz(s.name || ''),
    ...ups.flatMap((u) => upx(u))];
    parts.push(...u16le(std.length), ...std);
  }
  return Uint8Array.from(parts);
}

export function sttbfFfn(names) {
  const parts = [...u16le(names.length), 0, 0];
  for (const n of names) {
    const ffn = [0, 0x90, 0x01, 0, 0, ...new Array(10).fill(0),
      ...new Array(24).fill(0),
      ...[...n].flatMap((c) => u16le(c.charCodeAt(0))), 0, 0];
    parts.push(ffn.length, ...ffn);
  }
  return Uint8Array.from(parts);
}

/** Runs in groups that fit a 512-byte FKP (cost(r) bytes each). */
function pagesOf(runs, cost) {
  const out = [[]];
  let used = 5;
  for (const r of runs) {
    const c = cost(r);
    if (out.at(-1).length && used + c > 510) {
      out.push([]);
      used = 5;
    }
    out.at(-1).push(r);
    used += c;
  }
  return out;
}

export function formattedDoc({paras, runs = [], styles, fonts,
  chpPage, papPage, ...opts}) {
  const text = paras.map((p) => p.text + (p.mark ?? '\r')).join('');
  const base = {...opts, pieces: [{text, unicode: true}]};
  const first = docStreams(base);
  const textAt = first.layout.textAt;
  const fc = (cp) => textAt + 2 * cp;
  const pn = Math.ceil(first.layout.tailAt / 512);
  const pad = pn * 512 - first.layout.tailAt;
  // (FKP runs are contiguous: the gaps are runs with no CHPX)
  const chp = [];
  let at = 0;
  for (const r of [...runs].sort((a, b) => a.from - b.from)) {
    if (r.from > at) chp.push({fcFirst: fc(at), fcLim: fc(r.from)});
    chp.push({fcFirst: fc(r.from), fcLim: fc(r.to),
      grpprl: grpprl(...r.prls)});
    at = r.to;
  }
  if (at < text.length) chp.push({fcFirst: fc(at), fcLim: fc(text.length)});
  let cp = 0;
  const pap = paras.map((p) => {
    const from = cp;
    cp += p.text.length + (p.mark ?? '\r').length;
    return {fcFirst: fc(from), fcLim: fc(cp), istd: p.istd || 0,
      grpprl: grpprl(...(p.prls || []))};
  });
  // (runs that do not fit one page go on more pages, CHPX pages
  // first: pn is the first)
  const cps = chpPage ? [chp] : pagesOf(chp, (r) => 5 +
    (r.grpprl ? r.grpprl.length + 2 : 0));
  const pps = papPage ? [pap] : pagesOf(pap, (r) => 22 +
    (r.grpprl ? r.grpprl.length : 0));
  const tail = new Uint8Array(pad + 512 * (cps.length + pps.length));
  cps.forEach((g, i) => tail.set(chpPage || chpxPage(g), pad + 512 * i));
  pps.forEach((g, i) => tail.set(papPage || papxPage(g), pad + 512 *
    (cps.length + i)));
  const table = {...(opts.table || {})};
  const end = fc(cp);
  const bte = (groups, pn0) => plcBte([...groups.map((g, i) => i ? g[0]
    .fcFirst : textAt), end], groups.map((_, i) => pn0 + i));
  table.PlcfBteChpx ??= bte(cps, pn);
  table.PlcfBtePapx ??= bte(pps, pn + cps.length);
  if (styles) table.Stshf ??= stsh(styles);
  if (fonts) table.SttbfFfn ??= sttbfFfn(fonts);
  // (docStreams puts the blobs in FC_ORDER-independent order)
  const s = docStreams({...base, wordTail: tail, table});
  return {bytes: packDoc(s), streams: s, pn, textAt};
}

// ---------------------------------------------------------------------
// Lists and tables (task 13), from [MS-DOC] (PlfLst, LSTF, LVL, LVLF,
// PlfLfo, LFO, LFOData, LFOLVL; TDefTableOperand, TC80, TCGRF).
//
//   lvlBytes({start, nfc, jc, follow, papx, chpx, xst, cch?})  one LVL
//     (xst a string or an array of units; cch overrides its count)
//   listTable(lists) -> {PlfLst, lcb}  the PlfLst blob with its LVLs
//     after it (lcb: the PlfLst's own length, for opts.lcb). lists
//     [{lsid, simple?, levels: [level]}]; cLst overrides the count
//   lfoTable(lfos) -> PlfLfo bytes  lfos [{lsid, over?: [{ilvl,
//     start?, lvl?}]}]; lfoMac overrides the count
//   tc80({horz, vert, va, flow, brc: [4 Brc80 u32s]}) -> 20 bytes
//   defTable(centers, tcs) -> the sprmTDefTable Prl
export function lvlBytes(l = {}) {
  const papx = [...(l.papx || [])], chpx = [...(l.chpx || [])];
  const units = typeof l.xst === 'string'
    ? [...l.xst].map((c) => c.charCodeAt(0)) : l.xst || [];
  const f = new Uint8Array(28);
  const dv = new DataView(f.buffer);
  dv.setInt32(0, l.start ?? 1, true);
  f[4] = l.nfc ?? 0;
  f[5] = (l.jc ?? 0) & 3;
  f[15] = l.follow ?? 0;
  f[24] = chpx.length;
  f[25] = papx.length;
  return Uint8Array.from([...f, ...papx, ...chpx,
    ...u16le(l.cch ?? units.length), ...units.flatMap(u16le)]);
}

export function listTable(lists, {cLst} = {}) {
  const head = [...i16le(cLst ?? lists.length)];
  const lvls = [];
  for (const L of lists) {
    const f = new Uint8Array(28);
    new DataView(f.buffer).setInt32(0, L.lsid, true);
    for (let k = 0; k < 9; k++) f.set(u16le(0x0FFF), 8 + 2 * k);
    f[26] = L.simple ? 1 : 0;
    head.push(...f);
    const n = L.simple ? 1 : 9;
    for (let k = 0; k < n; k++) {
      lvls.push(...(L.raw ? L.raw[k] || [] : lvlBytes(L.levels[k] ||
        {nfc: 0, xst: [k, 0x2E]})));
    }
  }
  return {PlfLst: Uint8Array.from([...head, ...lvls]), lcb: head.length};
}

export function lfoTable(lfos, {lfoMac} = {}) {
  const out = [...u32le(lfoMac ?? lfos.length)];
  for (const f of lfos) {
    out.push(...u32le(f.lsid >>> 0), 0, 0, 0, 0, 0, 0, 0, 0,
      (f.over || []).length, 0, 0, 0);
  }
  for (const f of lfos) {
    out.push(0, 0, 0, 0);
    for (const o of f.over || []) {
      const flags = (o.ilvl & 15) | (o.start !== undefined ? 16 : 0) |
        (o.lvl ? 32 : 0);
      out.push(...u32le((o.start ?? 0) >>> 0), ...u32le(flags));
      if (o.lvl) out.push(...lvlBytes(o.lvl));
    }
  }
  return Uint8Array.from(out);
}

export function tc80({horz = 0, vert = 0, va = 0, flow = 0, brc} = {}) {
  const g = (horz & 3) | ((flow & 7) << 2) | ((vert & 3) << 5) |
    ((va & 3) << 7);
  const b = brc || [0, 0, 0, 0];
  return [...u16le(g), 0, 0, ...b.flatMap((x) => u32le(x >>> 0))];
}

export function defTable(centers, tcs = []) {
  const body = [centers.length - 1, ...centers.flatMap(i16le),
    ...tcs.flat()];
  return Uint8Array.from([0x08, 0xD6, ...u16le(body.length + 1),
    ...body]);
}

// ---------------------------------------------------------------------
// Pictures and sections (task 14), from [MS-DOC] (2.9.192
// PICFAndOfficeArtData, 2.9.190 PICF, 2.8.26 PlcfSed, 2.9.253 SEPX,
// 2.8.22 PlcfHdd, 2.3.3 Headers) and [MS-ODRAW] (2.2.1 the record
// header, 2.2.13 OfficeArtSpContainer, 2.2.9 OfficeArtFOPT, 2.2.32
// OfficeArtFBSE, 2.2.23-31 the BLIPs).
//
//   artRec(type, body, {ver, inst})  one OfficeArt record
//   blipRec(kind, data, {uids, stored, size, compression})  a BLIP
//     record of kind 'png' 'jpeg' 'dib' 'tiff' 'emf' 'wmf' (metafiles
//     with a 34-byte header: cbSize size (default data's length),
//     cbSave data's length, compression 0 (deflate: data is then the
//     compressed bytes) unless stored (0xFE) or compression given;
//     filter the byte after it, 0xFE unless given)
//   picRecord({blip, dxaGoal, dyaGoal, mx, my, crop, props, fbse,
//     lcb, cbHeader, mm, art})  a PICFAndOfficeArtData: PICF (68
//     bytes), then an OfficeArtSpContainer (FSP and an FOPT of props
//     [[pid, value]]) and the BLIP (in an FBSE with fbse); art
//     replaces the records after the PICF
//   SEPX_AT  where sectionDoc puts the SEPXs: the Word stream's gap
//     between the FIB (900 bytes) and the text (0x400)
//   sectionDoc({main, sections, stories, facing, data, runs,
//     styles, fonts, sedCps, hddCps, ...opts}) -> {bytes, streams}
//     a formattedDoc of the paragraphs `main` (a section ends with
//     a paragraph of mark '\x0C'; the last at the text's end), then
//     the header document: stories (by PlcfHdd index; 6 separators
//     first, then 6 a section; each [paras] or null: empty) with
//     their guard marks. sections [grpprl | null] (null: fcSepx
//     0xFFFFFFFF); facing: the DOP's fFacingPages; data: the Data
//     stream. sedCps / hddCps override the CPs written
export function artRec(type, body = [], {ver = 0, inst = 0} = {}) {
  const b = body instanceof Uint8Array ? body : Uint8Array.from(body);
  return Uint8Array.from([...u16le(ver | (inst << 4)), ...u16le(type),
    ...u32le(b.length), ...b]);
}

const BLIP = {emf: [0xF01A, 0x3D4], wmf: [0xF01B, 0x216],
  pict: [0xF01C, 0x542], jpeg: [0xF01D, 0x46A], png: [0xF01E, 0x6E0],
  dib: [0xF01F, 0x7A8], tiff: [0xF029, 0x6E4]};

export function blipRec(kind, data, {uids = 1, stored = false, size,
  compression, filter = 0xFE} = {}) {
  const [type, inst] = BLIP[kind];
  const uid = new Array(16 * uids).fill(0x11);
  const meta = ['emf', 'wmf', 'pict'].includes(kind);
  const head = meta ? [...u32le(size ?? data.length),
    ...new Array(16).fill(0), ...new Array(8).fill(0),
    ...u32le(data.length), stored ? 0xFE : compression ?? 0,
    filter] : [0xFF];
  return artRec(type, [...uid, ...head, ...data],
    {inst: inst + (uids - 1)});
}

export function picRecord({blip, dxaGoal = 1440, dyaGoal = 1440,
  mx = 1000, my = 1000, crop = [0, 0, 0, 0], props = [], fbse = true,
  lcb, cbHeader = 68, mm = 0x64, art} = {}) {
  let records = art;
  if (!records) {
    const fopt = artRec(0xF00B, props.flatMap(([pid, v]) =>
      [...u16le(pid), ...u32le(v >>> 0)]), {ver: 3,
      inst: props.length});
    const sp = artRec(0xF004, [...artRec(0xF00A, new Array(8).fill(0),
      {ver: 2, inst: 75}), ...fopt], {ver: 15});
    let b = blip || new Uint8Array(0);
    if (blip && fbse) {
      const f = [6, 6, ...new Array(16).fill(0x11), 0, 0,
        ...u32le(blip.length), ...u32le(1), 0, 0, 0, 0, 0, 0, 0, 0];
      b = artRec(0xF007, [...f, ...blip], {ver: 2, inst: 6});
    }
    records = grpprl(sp, b);
  }
  const head = new Uint8Array(68);
  const dv = new DataView(head.buffer);
  dv.setInt32(0, lcb ?? 68 + records.length, true);
  dv.setUint16(4, cbHeader, true);
  dv.setUint16(6, mm, true);
  dv.setInt16(28, dxaGoal, true);
  dv.setInt16(30, dyaGoal, true);
  dv.setUint16(32, mx, true);
  dv.setUint16(34, my, true);
  crop.forEach((c, i) => dv.setInt16(36 + 2 * i, c, true));
  return grpprl(head, records);
}

export const SEPX_AT = 900;

export function sectionDoc({main, sections = [], stories = [],
  facing = false, data, sedCps, hddCps, table = {}, streams = {},
  ...opts}) {
  const mainLen = main.reduce((n, p) => n + p.text.length +
    (p.mark ?? '\r').length, 0);
  // the SEPXs, each once, in the gap before the text
  const blob = [], fcs = [];
  const seen = new Map();
  for (const g of sections) {
    if (!g) {
      fcs.push(0xFFFFFFFF);
      continue;
    }
    const key = [...g].join(',');
    if (!seen.has(key)) {
      seen.set(key, SEPX_AT + blob.length);
      blob.push(...i16le(g.length), ...g);
    }
    fcs.push(seen.get(key));
  }
  if (blob.length > 0x400 - SEPX_AT) throw new Error('SEPXs too long');
  // section ends: after each '\x0C' mark, and the text's end
  const ends = [];
  let cp = 0;
  for (const p of main) {
    cp += p.text.length + (p.mark ?? '\r').length;
    if (p.mark === '\x0C') ends.push(cp);
  }
  if (ends.at(-1) !== mainLen) ends.push(mainLen);
  const cps = sedCps || [0, ...ends];
  const n = cps.length - 1;
  const sed = [...cps.flatMap((c) => u32le(c >>> 0))];
  for (let i = 0; i < n; i++) {
    sed.push(0, 0, ...u32le(fcs[Math.min(i, fcs.length - 1)] ??
      0xFFFFFFFF), 0, 0, 0, 0, 0, 0);
  }
  // the header document
  const hparas = [];
  const starts = [];
  let h = 0;
  for (const s of stories) {
    starts.push(h);
    if (!s) continue;
    for (const p of s) {
      hparas.push(p);
      h += p.text.length + (p.mark ?? '\r').length;
    }
    hparas.push({text: ''});
    h += 1;
  }
  hparas.push({text: ''});
  const hdd = hddCps || [...starts, h, h + 1];
  const t = {...table, PlcfSed: Uint8Array.from(sed)};
  if (stories.length) t.PlcfHdd = Uint8Array.from(hdd.flatMap(u32le));
  t.Dop = Uint8Array.from([facing ? 1 : 0, ...new Array(43).fill(0)]);
  const all = stories.length ? [...main, ...hparas] : main;
  const got = formattedDoc({...opts, paras: all, table: t,
    ccp: {Text: mainLen, Hdd: stories.length ? h + 1 : 0},
    streams: {...streams, ...(data ? {Data: data} : {})}});
  const s = got.streams;
  s.word.set(blob, SEPX_AT);
  return {...got, bytes: packDoc(s), streams: s};
}
