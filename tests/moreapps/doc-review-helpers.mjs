// .doc import, task 15: a spec-derived writer of .doc files with
// footnotes, endnotes, comments, bookmarks, fields and tracked
// changes ([MS-DOC] 2.3.2-2.3.5, 2.8.7-2.8.20 PlcfandRef / Txt,
// PlcffndRef / Txt, PlcfendRef / Txt, 2.8.25 PlcFld, 2.9.7 ATRDPre10,
// 2.9.6 ATRDPost10, 2.9.10 ATNBE, 2.9.18 BKF, 2.2.4 STTB), on top of
// doc-helpers.mjs. Not the output of any office program.
//
//   reviewDoc(opts) -> {bytes, streams, ccp}
//     main       [para]  the main text (para {text, istd?, prls?,
//                mark?}); its '\x02's are the note marks (the
//                footnotes' first, then the endnotes'), its '\x05's
//                the comment marks, in order
//     footnotes, endnotes  [[para]]  each note's paragraphs (a note
//                starts with '\x02', its number mark)
//     comments   [{paras, initials?, ibst?, dttm?, range?: [s, e],
//                parent?: k}]  (paras start with '\x05'); range CPs
//                of the commented text; parent the index of the
//                comment replied to (earlier)
//     owners     [name]  GrpXstAtnOwners
//     rmarks     [name]  SttbfRMark (the authors of changes)
//     bookmarks  [{name, start, end}]
//     runs       [{from, to, prls}]  character formatting (CPs of all
//                the stories together, as formattedDoc)
//     fld        true (default): PlcFld of each story from its text
//                (0x13 / 0x14 / 0x15); false: none; {drop: 'end'}
//                ends left out
//     plain      true: no formatting pages (makeDoc: any number of
//                paragraphs); runs and istd ignored
//     table      more table-stream blobs (they win: hostile lists)
//     lcb        lcbs that differ from the blobs' lengths
//     version    nFib (default 0x101 when a comment has a date or a
//                parent, else 0xC1)
//     stories, sections, facing  (task 16) the header document, the
//                sections' SEPXs and the DOP's fFacingPages, as
//                ./doc-helpers.mjs sectionDoc's (a section ends at a
//                main paragraph of mark '\x0C'; nFib 0xC1 only: the
//                SEPXs go between the FIB and the text); the header
//                document's fields get PlcfFldHdr
//
//   richDoc() -> {bytes, streams, ccp, text}  one .doc holding most of
//     what the reader reads (task 16: the hostile tests' fuzz seed):
//     styles (Normal, Heading 1, a character style), bold / italic
//     runs, a bookmark, a footnote, a numbered list, a 2 x 2 table, a
//     PNG picture (the Data stream), PAGE and HYPERLINK fields, an
//     insertion and a deletion by two authors, a comment over a
//     range, two sections (the first with a title page) with their
//     headers and footers (a PAGE field in one)
import {formattedDoc, makeDoc, docStreams, packDoc, u16le, i16le,
  u32le, prl, grpprl, listTable, lfoTable, defTable, tc80, picRecord,
  blipRec, SEPX_AT} from './doc-helpers.mjs';
import {pngBytes} from './pic-fixtures.mjs';

const cps = (list) => Uint8Array.from(list.flatMap((c) => u32le(c >>> 0)));
const xst = (s) => [...u16le(s.length),
  ...[...s].flatMap((c) => u16le(c.charCodeAt(0)))];
const textOf = (paras) => paras.map((p) => p.text + (p.mark ?? '\r'))
  .join('');

/** An extended STTB of names, each with cbExtra bytes extra(i). */
export function sttb(names, cbExtra = 0, extra = () => []) {
  const out = [0xFF, 0xFF, ...u16le(names.length), ...u16le(cbExtra)];
  names.forEach((n, i) => {
    out.push(...xst(n));
    const e = extra(i);
    for (let k = 0; k < cbExtra; k++) out.push(e[k] ?? 0);
  });
  return Uint8Array.from(out);
}

/** The PlcFld of story text (CPs from its start). */
export function plcFld(text, drop) {
  const at = [], data = [], open = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x13) {
      open.push({sep: false});
      at.push(i);
      data.push(0x13, 0);
    } else if (c === 0x14) {
      if (open.length) open.at(-1).sep = true;
      at.push(i);
      data.push(0x14, 0);
    } else if (c === 0x15) {
      const f = open.pop();
      if (drop === 'end') continue;
      at.push(i);
      data.push(0x15, f && f.sep ? 0x80 : 0);
    }
  }
  if (!at.length) return null;
  return Uint8Array.from([...cps([...at, text.length + 1]), ...data]);
}

/** CPs of '\x02' / '\x05' in text. */
const marksOf = (text, ch) => [...text].flatMap((c, i) =>
  (c === ch ? [i] : []));

/** A note document: its text and PlcfTxt CPs. */
function notesOf(notes) {
  const starts = [];
  let text = '';
  for (const n of notes) {
    starts.push(text.length);
    text += textOf(n);
  }
  if (!notes.length) return {text: '', txt: null};
  return {text: text + '\r', txt: cps([...starts, text.length,
    text.length + 1])};
}

/** See the header. */
export function reviewDoc(opts) {
  const {main, footnotes = [], endnotes = [], comments = [],
    owners = [], rmarks, bookmarks = [], runs = [], fld = true,
    plain = false, table: more = {}, stories = [], sections = [],
    facing = false, ...rest} = opts;
  const mainText = textOf(main);
  const T = mainText.length;
  const refs = marksOf(mainText, '\x02');
  const fn = notesOf(footnotes), en = notesOf(endnotes);
  const cm = notesOf(comments.map((c) => c.paras));
  const t = {};
  const fRefs = refs.slice(0, footnotes.length);
  const eRefs = refs.slice(footnotes.length);
  if (footnotes.length) {
    t.PlcffndRef = Uint8Array.from([...cps([...fRefs, T]),
      ...fRefs.flatMap(() => i16le(1))]);
    t.PlcffndTxt = fn.txt;
  }
  if (endnotes.length) {
    t.PlcfendRef = Uint8Array.from([...cps([...eRefs, T]),
      ...eRefs.flatMap(() => i16le(1))]);
    t.PlcfendTxt = en.txt;
  }
  const dated = comments.some((c) => c.dttm !== undefined ||
    c.parent !== undefined);
  if (comments.length) {
    const cRefs = marksOf(mainText, '\x05');
    const withRange = comments.map((c, i) => [c, i])
      .filter(([c]) => c.range);
    const atrd = comments.flatMap((c, i) => {
      const ini = (c.initials ?? '').slice(0, 9);
      const units = [...ini].flatMap((x) => u16le(x.charCodeAt(0)));
      const k = withRange.findIndex(([, j]) => j === i);
      return [...u16le(ini.length), ...units,
        ...new Array(18 - units.length).fill(0), ...i16le(c.ibst ?? 0),
        0, 0, 0, 0, ...u32le(k < 0 ? -1 : 100 + k)];
    });
    t.PlcfandRef = Uint8Array.from([...cps([...cRefs, T]), ...atrd]);
    t.PlcfandTxt = cm.txt;
    t.GrpXstAtnOwners = Uint8Array.from(owners.flatMap(xst));
    if (withRange.length) {
      t.SttbfAtnBkmk = sttb(withRange.map(() => ''), 10, (k) =>
        [0, 1, ...u32le(100 + k), 0, 0, 0, 0]);
      t.PlcfAtnBkf = Uint8Array.from([...cps([...withRange.map(([c]) =>
        c.range[0]), T + 1]), ...withRange.flatMap((_, k) =>
        [...i16le(k), 0, 0])]);
      t.PlcfAtnBkl = cps([...withRange.map(([c]) => c.range[1]), T + 1]);
    }
    if (dated) {
      t.AtrdExtra = Uint8Array.from(comments.flatMap((c, i) => {
        const up = c.parent === undefined ? 0 : c.parent - i;
        return [...u32le(c.dttm ?? 0), 0, 0, ...u32le(up ? 1 : 0),
          ...u32le(up), 0, 0, 0, 0];
      }));
    }
  }
  if (bookmarks.length) {
    t.SttbfBkmk = sttb(bookmarks.map((b) => b.name));
    t.PlcfBkf = Uint8Array.from([...cps([...bookmarks.map((b) =>
      b.start), T + 1]), ...bookmarks.flatMap((_, k) =>
      [...i16le(k), 0, 0])]);
    t.PlcfBkl = cps([...bookmarks.map((b) => b.end), T + 1]);
  }
  if (rmarks) t.SttbfRMark = sttb(rmarks);
  const hd = headerDoc(main, stories, sections, facing, t);
  if (fld) {
    const drop = fld.drop;
    const f = [['PlcfFldMom', mainText], ['PlcfFldFtn', fn.text],
      ['PlcfFldHdr', hd.text], ['PlcfFldAtn', cm.text],
      ['PlcfFldEdn', en.text]];
    for (const [name, text] of f) {
      const b = text && plcFld(text, drop);
      if (b) t[name] = b;
    }
  }
  Object.assign(t, more);
  const all = [...main, ...footnotes.flat(), ...(fn.text ? [{text: ''}]
    : []), ...hd.paras, ...comments.flatMap((c) => c.paras),
  ...(cm.text ? [{text: ''}] : []), ...endnotes.flat(),
  ...(en.text ? [{text: ''}] : [])];
  const ccp = {Text: T, Ftn: fn.text.length, Hdd: hd.text.length,
    Atn: cm.text.length, Edn: en.text.length};
  const version = rest.version ?? (dated ? 0x101 : 0xC1);
  const o = {...rest, version, table: t, ccp};
  if (plain) {
    const text = textOf(all);
    const s = docStreams({...o, pieces: [{text, unicode: true}]});
    return {bytes: makeDoc({...o, pieces: [{text, unicode: true}]}),
      streams: s, ccp};
  }
  const got = formattedDoc({...o, paras: all, runs});
  if (!hd.blob.length) return {...got, ccp};
  got.streams.word.set(hd.blob, SEPX_AT);
  return {...got, bytes: packDoc(got.streams), ccp};
}

/** The sections and the header document (sectionDoc's rules): its
 *  paragraphs and text, the SEPX blob; PlcfSed, PlcfHdd and Dop put
 *  in t. */
function headerDoc(main, stories, sections, facing, t) {
  const none = {paras: [], text: '', blob: []};
  if (!stories.length && !sections.length) return none;
  const blob = [], fcs = [], seen = new Map();
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
  const ends = [];
  let cp = 0;
  for (const p of main) {
    cp += p.text.length + (p.mark ?? '\r').length;
    if (p.mark === '\x0C') ends.push(cp);
  }
  if (ends.at(-1) !== cp) ends.push(cp);
  const sedCps = [0, ...ends];
  const sed = [...cps(sedCps)];
  for (let i = 0; i < sedCps.length - 1; i++) {
    sed.push(0, 0, ...u32le(fcs[Math.min(i, fcs.length - 1)] ??
      0xFFFFFFFF), 0, 0, 0, 0, 0, 0);
  }
  t.PlcfSed = Uint8Array.from(sed);
  t.Dop = Uint8Array.from([facing ? 1 : 0, ...new Array(43).fill(0)]);
  if (!stories.length) return {...none, blob};
  const paras = [], starts = [];
  let h = 0;
  for (const st of stories) {
    starts.push(h);
    if (!st) continue;
    for (const p of st) {
      paras.push(p);
      h += p.text.length + (p.mark ?? '\r').length;
    }
    paras.push({text: ''});
    h += 1;
  }
  paras.push({text: ''});
  t.PlcfHdd = cps([...starts, h, h + 1]);
  return {paras, text: textOf(paras), blob};
}

/** See the header. */
export function richDoc() {
  const P = (text, o = {}) => ({text, ...o});
  const C = {bold: 0x0835, italic: 0x0836, spec: 0x0855, pic: 0x6A03,
    ins: 0x0801, ibst: 0x4804, dttm: 0x6805, del: 0x0800,
    ibstDel: 0x4863, dttmDel: 0x6864, ilfo: 0x460B, ilvl: 0x260A,
    inTable: 0x2416, ttp: 0x2417, jc: 0x2461, cistd: 0x4A30};
  const inT = prl(C.inTable, 1);
  const cell = (text) => P(text, {mark: '\x07', prls: [inT]});
  const ttp = P('', {mark: '\x07', prls: [inT, prl(C.ttp, 1),
    defTable([0, 2000, 4000], [tc80(), tc80()])]});
  const item = (text) => P(text, {prls: [prl(C.ilfo, i16le(1)),
    prl(C.ilvl, 0)]});
  const main = [
    P('A rich document', {istd: 1}),
    P('Bold and italic text\x02 with a note.', {prls: [prl(C.jc, 1)]}),
    item('item one'), item('item two'),
    cell('a'), cell('b'), ttp, cell('c'), cell('d'), ttp,
    P('a picture \x01 here'),
    P('page \x13 PAGE \x14 1\x15 and \x13 HYPERLINK ' +
      '"http://example.org/" \x14a link\x15.'),
    P('inserted text, deleted text\x05'),
    P('the end of section one', {mark: '\x0C'}),
    P('Section two')];
  const text = main.map((p) => p.text + (p.mark ?? '\r')).join('');
  const at = (s) => text.indexOf(s);
  const D = 0x2C8460D1;          // (a DTTM: 2024-05-06 03:17)
  const runs = [
    {from: at('Bold'), to: at('Bold') + 4, prls: [prl(C.bold, 1)]},
    {from: at('italic'), to: at('italic') + 6, prls: [prl(C.italic,
      1), prl(C.cistd, u16le(2))]},
    {from: at('\x01'), to: at('\x01') + 1, prls: [prl(C.spec, 1),
      prl(C.pic, u32le(0))]},
    {from: at('inserted'), to: at('inserted') + 13, prls: [prl(C.ins,
      1), prl(C.ibst, u16le(1)), prl(C.dttm, u32le(D))]},
    {from: at('deleted'), to: at('deleted') + 12, prls: [prl(C.del, 1),
      prl(C.ibstDel, u16le(2)), prl(C.dttmDel, u32le(D))]}];
  const {PlfLst, lcb} = listTable([{lsid: 7, levels: Array.from(
    {length: 9}, (_, k) => ({nfc: 0, xst: [k, 0x2E]}))}]);
  const sections = [grpprl(prl(0x300A, 1), prl(0xB021, u16le(1300))),
    grpprl(prl(0xB021, u16le(1500)))];
  const hdr = (s) => [P(s)];
  const stories = [null, null, null, null, null, null,
    null, hdr('Header one, page \x13 PAGE \x14 1\x15'), null,
    hdr('Footer one'), hdr('First page header'), null,
    null, hdr('Header two'), null, null, null, null];
  const data = picRecord({blip: blipRec('png', pngBytes(4, 2))});
  const got = reviewDoc({main, runs, stories, sections, version: 0xC1,
    footnotes: [[P('\x02 The note.')]],
    comments: [{paras: [P('\x05 A comment.')], initials: 'AB', ibst: 0,
      range: [at('inserted'), at('\x05')]}],
    owners: ['Ann Bell'], rmarks: ['Unknown', 'Ann', 'Bob'],
    bookmarks: [{name: 'top', start: 0, end: 15}],
    styles: {ftc: 0, stds: [{sti: 0, name: 'Normal'},
      {sti: 1, base: 0, next: 0, name: 'heading 1',
        chpx: grpprl(prl(C.bold, 1))},
      {sti: 0x0FFE, stk: 2, base: 0x0FFF, name: 'Emphasis Char',
        chpx: grpprl(prl(C.italic, 1))}]},
    fonts: ['Times New Roman', 'Arial'],
    table: {PlfLst, PlfLfo: lfoTable([{lsid: 7}])}, lcb: {PlfLst: lcb},
    streams: {Data: Uint8Array.from(data)}});
  return {...got, text};
}
