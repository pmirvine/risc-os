// Generates the real-Word hand-off files for !Word's pictures (Batch
// B; questions PI1..PI9, PI* and P1..P6, those with no file marked
// "(No file)"; local only, never committed:
// tests/moreapps/corpus/ is git-ignored). Not a test:
//
//   node tests/moreapps/handoff-pictures.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   pic-1-inserted.docx  a new document: a PNG, a JPEG and a GIF put
//                        in with Insert > Picture..., the JPEG and GIF
//                        then made bigger with the Picture box
//   pic-2-resized.docx   two pictures in Word's form: one resized by
//                        a corner (proportions kept), one by an edge,
//                        both given alt text
//   pic-2b-real.docx     (when the corpus holds a Word-made file with
//                        a picture) its picture resized by a corner,
//                        then an edge, alt text set
//   pic-3-strict.docx    a Strict document: a picture inserted,
//                        resized, given alt text
//   pic-4-dpi.docx       a PNG at 300 dpi, a JPEG at 72 dpi (JFIF dpi),
//                        a JPEG in dots per cm, a PNG without density,
//                        each put in at its natural size
//   pic-5-floating.docx  a floating picture (a Word-made one when the
//                        corpus has it): alt text set, a resize refused
//   pic-6-pasted.docx    a document with two pictures that share a
//                        docPr id (kept), one picture pasted from
//                        pic-6-source.docx (crop and alt text), one
//                        copied and pasted within the document
//   pic-6-source.docx    the document that picture came from
//   pic-7-deleted.docx   two pictures, one deleted: its media part and
//                        relationship stay
//   pic-README.txt       the steps in Word, what !Word did, questions
// Everything is done with !Word's own commands (./InsertPicture,
// ./PicOps, ./PicSize, ./ClipSlice / ./ClipPick / ./ClipPaste, delete)
// on a Document; a file is written only when its bytes change, and
// each is read back and its pictures listed in the README.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {run} from '../../tools/moreapps/!Word/EditApply';
import * as S from '../../tools/moreapps/!Word/Selection';
import {insert} from '../../tools/moreapps/!Word/InsertPicture';
import {setPicture} from '../../tools/moreapps/!Word/PicOps';
import {dragSize, pxToEmu} from '../../tools/moreapps/!Word/PicSize';
import {pictureOf, docMap, EMU_PX} from '../../tools/moreapps/!Word/PicRead';
import {mediaOf, imageInfo} from '../../tools/moreapps/!Word/PicMedia';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {p, r} from './build-docx.mjs';
import {picDocx, pngBytes, jpegGray, gifBytes} from './pic-fixtures.mjs';
import {mk} from './edit-docs.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const CORPUS = fileURLToPath(new URL('./corpus/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 10, 12));
fs.mkdirSync(OUT, {recursive: true});
const IN = 914400;
const REAL = 'open-xml-sdk/v2FxTestFiles/wordprocessing/';

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}
const realFile = (rel) => {
  const f = path.join(CORPUS, REAL + rel);
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
};

const all = (d) => d.doc.sections.flatMap((s) => s.blocks);
const open = async (bytes) => new Document(await readDocx(bytes));
const inch = (emu) => (emu / IN).toFixed(2) + ' in';

/** A session: the Document and a Typing (its command breaks undo). */
function session(d) {
  d.clearHistory();
  return {d, t: new Typing(d, {now: () => 0})};
}
/** Every picture of d: [{block, off, info}]. */
function pics(d) {
  const m = docMap(d.doc), out = [];
  all(d).forEach((b, k) => {
    for (const [off, x] of Object.entries(b.inlines || {})) {
      const info = x && x.node ? pictureOf(x.node, m) : null;
      if (info) out.push({k, off: +off, id: b.id, info});
    }
  });
  return out;
}
const picSel = (d, n) => {
  const q = pics(d)[n];
  return S.select({id: q.id, off: q.off}, {id: q.id, off: q.off + 1});
};
const caret = (d, k, off) => S.caret({id: all(d)[k].id, off});
const endOf = (d, k) => caret(d, k, all(d)[k].text.length);

/** Put a picture in at sel (one undo step, as the command runs). */
const put1 = (s, sel, bytes) => s.t.command(() => insert(s.d, sel,
  {bytes}));
/** Resize picture n by a drag of a handle, as ./PicDrag works it out. */
function drag(s, n, handle, dx, dy) {
  const i = pics(s.d)[n].info;
  const start = {w: i.cx / EMU_PX, h: i.cy / EMU_PX};
  const g = dragSize(start, handle, dx, dy);
  s.t.command(() => setPicture(s.d, picSel(s.d, n), {
    cx: pxToEmu(g.w), cy: pxToEmu(g.h)}));
}
const alt = (s, n, descr) => s.t.command(() => setPicture(s.d,
  picSel(s.d, n), {descr}));

/** Save d; read it back; its pictures listed for the README. */
async function save(name, d) {
  const bytes = await writeDocx(d.doc, {date: DATE});
  return finish(name, bytes);
}
async function finish(name, bytes) {
  const zip = await readZip(bytes);
  const errs = lintPackage(zip).problems.filter((q) => q.level ===
    'error');
  if (errs.length) throw new Error(name + ': ' + JSON.stringify(errs));
  const back = await open(bytes);
  console.log(name + ': ' + put(name, bytes));
  const media = [...zip.keys()].filter((k) => /\/media\//.test(k));
  const rows = pics(back).map((q, n) => {
    const m = mediaOf(back.doc, q.info.embed);
    const im = m ? imageInfo(m.bytes) : null;
    return `    ${n + 1}. ${q.info.floating ? 'floating' : 'inline'} ` +
      `${inch(q.info.cx)} x ${inch(q.info.cy)}, docPr id ` +
      `${q.info.docPrId}, alt ${JSON.stringify(q.info.alt)}` +
      (q.info.srcRect ? ', crop ' + JSON.stringify(q.info.srcRect) : '') +
      (m ? `, ${m.name} (${m.mime || 'not PNG/JPEG/GIF'}` +
        (im ? `, ${im.w} x ${im.h} px, ${im.dpiX.toFixed(1)} dpi` : '') +
        ')' : ', no media');
  });
  return [...rows, `    parts: ${media.map((k) => k.replace('word/', ''))
    .join(', ') || 'none'}; ${back.doc.rels.length} relationships`];
}
const natural = (d, n) => {
  const i = pics(d)[n].info;
  return inch(i.cx) + ' x ' + inch(i.cy);
};

/** Copy sel in src, paste at `at` in dst as ./EditClip does. */
function copyPaste(src, sel, dst, at, sameDoc) {
  const store = new ClipStore();
  const c = slice(src.doc, sel);
  const token = store.put(c, 1);
  const html = toHtml(src.doc, c, {token});
  const x = pick({text: c.plain, html}, {store,
    docKey: sameDoc ? 1 : 2, parseHtml: null});
  if (!x || x.route !== 'exact') throw new Error('not an exact copy');
  return pasteBlocks(dst, at, x.blocks, x.opts);
}

const RED = [220, 20, 30], BLUE = [20, 120, 220], GREEN = [20, 180, 40];

// ------------------------------------------------------------ pic-1
const d1 = mk(['Pictures put in with Insert > Picture...', 'PNG:', 'JPEG:',
  'GIF:', 'The end.']);
let s1 = session(d1);
put1(s1, endOf(d1, 1), pngBytes(192, 96, {rgb: RED}));
put1(s1, endOf(d1, 2), jpegGray(240, 120));
put1(s1, endOf(d1, 3), gifBytes(12, 12));
drag(s1, 2, 'se', 84, 84);                  // the GIF, 1 in wide
const L1 = await save('pic-1-inserted.docx', d1);

// ------------------------------------------------------------ pic-2
const d2 = await open(await picDocx({pics: [
  {id: 1, bytes: pngBytes(192, 96, {rgb: RED}), cx: 2 * IN, cy: IN},
  {id: 2, ext: 'jpeg', bytes: jpegGray(288, 192), cx: 3 * IN, cy: 2 * IN}],
body: p(r('Two pictures to resize'))}));
const s2 = session(d2);
drag(s2, 0, 'se', 96, 48);                  // corner: 3 in x 1.5 in
drag(s2, 1, 'e', -96, 0);                   // edge: 2 in x 2 in
alt(s2, 0, 'A red box, resized by its corner');
alt(s2, 1, 'A grey box, resized by its edge');
const L2 = await save('pic-2-resized.docx', d2);
let L2b = null;
const real = realFile('bookmark/bookmark-pic.docx');
if (real) {
  const d = await open(real);
  const s = session(d);
  drag(s, 0, 'se', 48, 48);
  drag(s, 0, 'e', 24, 0);
  alt(s, 0, 'A Word-made picture resized in !Word');
  L2b = await save('pic-2b-real.docx', d);
}

// ------------------------------------------------------------ pic-3
const d3 = await open(await picDocx({strict: true, pics: [],
  body: p(r('A Strict document: the picture goes after this text.'))}));
const s3 = session(d3);
put1(s3, endOf(d3, 0), pngBytes(192, 96, {rgb: GREEN}));
drag(s3, 0, 'se', 48, 24);
alt(s3, 0, 'A green box in a Strict document');
const L3 = await save('pic-3-strict.docx', d3);

// ------------------------------------------------------------ pic-4
const d4 = mk(['PNG 300 dpi (600 x 300 px):', 'JPEG 72 dpi JFIF ' +
  '(288 x 144 px):', 'JPEG 118 dots per cm (240 x 120 px):',
'PNG without density (192 x 96 px):', 'The end.']);
const s4 = session(d4);
put1(s4, endOf(d4, 0), pngBytes(600, 300, {dpi: 300, rgb: RED}));
put1(s4, endOf(d4, 1), jpegGray(288, 144, {density: 72, units: 1}));
put1(s4, endOf(d4, 2), jpegGray(240, 120, {density: 118, units: 2}));
put1(s4, endOf(d4, 3), pngBytes(192, 96, {rgb: BLUE}));
const L4 = await save('pic-4-dpi.docx', d4);

// ------------------------------------------------------------ pic-5
const real5 = realFile('picture/pic-5.docx');
const d5 = await open(real5 || await picDocx({pics: [{kind: 'anchor',
  id: 5, bytes: pngBytes(192, 96, {rgb: BLUE}), cx: 2 * IN, cy: IN}],
body: p(r('Text the floating picture wraps around. '.repeat(8)))}));
const s5 = session(d5);
alt(s5, 0, 'A floating picture with alt text set in !Word');
let refused = 'NOT REFUSED';
try {
  setPicture(d5, picSel(d5, 0), {cx: 2 * IN});
} catch (e) {
  refused = e.message;
}
const L5 = await save('pic-5-floating.docx', d5);

// ------------------------------------------------------------ pic-6
const srcBytes = await picDocx({pics: [{id: 7, descr: 'Blue box (source)',
  bytes: pngBytes(192, 96, {rgb: BLUE}), cx: 2 * IN, cy: IN,
  srcRect: {l: 10000, t: 20000}}], body: p(r('Source document'))});
const L6s = await finish('pic-6-source.docx', srcBytes);
const src6 = await open(srcBytes);
const d6 = await open(await picDocx({pics: [
  {id: 7, descr: 'Own one', bytes: pngBytes(96, 96, {rgb: RED}),
    cx: IN, cy: IN},
  {id: 7, descr: 'Own two (same id 7)', bytes: pngBytes(96, 96,
    {rgb: GREEN}), cx: IN, cy: IN}],
body: p(r('Target document: pasted pictures follow. '))}));
const end6 = all(d6).length - 1;
d6.clearHistory();
copyPaste(src6, picSel(src6, 0), d6, endOf(d6, end6), false);
copyPaste(d6, picSel(d6, 0), d6, endOf(d6, end6), true);
const L6 = await save('pic-6-pasted.docx', d6);

// ------------------------------------------------------------ pic-7
const d7 = await open(await picDocx({pics: [{id: 1, descr: 'Deleted',
  bytes: pngBytes(96, 96, {rgb: RED}), cx: IN, cy: IN},
{id: 2, descr: 'Kept', ext: 'jpeg', bytes: jpegGray(96, 96), cx: IN,
  cy: IN}], body: p(r('Two pictures, the first deleted in !Word'))}));
const s7 = session(d7);
run('delete', d7, s7.t, picSel(d7, 0));
const L7 = await save('pic-7-deleted.docx', d7);

const README = [
  'Pictures in !Word (Batch B)',
  '(16 questions: PI1..PI9, PI* and P1..P6; those marked (No file)',
  'are tried in Word on a document of your own. !Word shows PNG, JPEG',
  'and GIF; everything else in a file is kept as it is)',
  '',
  'Files (made by node tests/moreapps/handoff-pictures.mjs):',
  '  pic-1-inserted.docx  new document: PNG, JPEG, GIF inserted',
  '  pic-2-resized.docx   two pictures resized (corner, edge), alt text',
  '  pic-2b-real.docx     ' + (L2b ? 'a Word-made picture resized'
    : '(not made: no Word-made file with a picture in the corpus)'),
  '  pic-3-strict.docx    Strict document, picture inserted and resized',
  '  pic-4-dpi.docx       PNG 300 dpi, JPEG 72 dpi, JPEG dpcm, PNG none',
  '  pic-5-floating.docx  ' + (real5 ? 'a Word-made floating picture'
    : 'a floating picture (made by !Word\'s test fixtures)') +
    ', alt text set',
  '  pic-6-source.docx    where the pasted picture came from',
  '  pic-6-pasted.docx    pictures pasted between and within documents',
  '  pic-7-deleted.docx   a picture deleted; its media part stays',
  '',
  'Steps in Word (open each file; "any repair prompt?" is the first',
  'question for every one):',
  '  1. pic-1: three pictures after PNG:, JPEG:, GIF:. Right-click each,',
  '     Size and Position: the sizes below? (PI1)',
  '  2. pic-2: picture 1 is 3 x 1.5 in (was 2 x 1, dragged by its',
  '     corner), picture 2 is 2 x 2 in (was 3 x 2, dragged by its',
  '     edge). Size and Position > Size: the same absolute Width and',
  '     Height in Word? Alt Text: the texts below? (PI2)',
  '  3. pic-2b-real (' + (L2b ? 'made' : 'not made this time') +
    '): the Word-made picture, resized by a',
  '     corner then an edge in !Word, alt text set: opens without',
  '     repair, Size and Alt Text as listed below? (PI2)',
  '  4. pic-3: opens; Save As .docx (Strict Open XML Document) and look',
  '     at word/document.xml: still Strict? (PI3)',
  '  5. pic-4: for each picture Size tab > Reset: do Word\'s "original',
  '     size" values equal the sizes below? (PI4)',
  '  6. pic-5: is the picture still at its place, wrapped as before,',
  '     with the alt text set? (PI5)',
  '  7. pic-6: Own one and Own two both have docPr id 7 (as in the',
  '     file). Opens without repair? The pasted pictures follow the',
  '     text: first the blue one from pic-6-source (cropped from the',
  '     left and top, alt text), then a copy of "Own one". In Word copy',
  '     the blue picture from pic-6-source.docx and paste it into a new',
  '     document: same size, crop and alt text? (PI6, PI8, P6)',
  '  8. pic-7: opens without repair? Save in Word and unzip: is the',
  '     deleted picture\'s image still in word/media? (PI7)',
  '',
  'What !Word wrote (read back from each file):',
  '  pic-1-inserted.docx', ...L1,
  '  pic-2-resized.docx', ...L2,
  ...(L2b ? ['  pic-2b-real.docx', ...L2b] : []),
  '  pic-3-strict.docx', ...L3,
  '  pic-4-dpi.docx', ...L4,
  '    (natural sizes: ' + [0, 1, 2, 3].map((n) => natural(d4, n))
    .join('; ') + ')',
  '  pic-5-floating.docx', ...L5,
  '    (a resize was refused: ' + refused + ')',
  '  pic-6-source.docx', ...L6s,
  '  pic-6-pasted.docx', ...L6,
  '  pic-7-deleted.docx', ...L7,
  '',
  'Questions (!Word\'s belief after the dash):',
  '  PI1 Do the inserted PNG, JPEG and GIF (pic-1) open without a',
  '      repair prompt? - yes',
  '  PI2 After a resize do wp:extent and a:ext agree, and does Word show',
  '      that size (pic-2)? - yes',
  '  PI3 Does a Strict document with an inserted picture (pic-3) open',
  '      and stay Strict on save? - yes',
  '  PI4 Pictures with 300 dpi, 72 dpi and dpcm density: does Word\'s',
  '      "original size" equal !Word\'s Reset size (pic-4)? - yes',
  '  PI5 Does the floating picture keep its place and wrap after its',
  '      alt text was set (pic-5)? - yes',
  '  PI6 Do duplicate docPr ids in a file (pic-6, id 7 twice) open',
  '      without repair, and do pasted pictures have fresh ids (8, 9)?',
  '      - accepted; fresh',
  '  PI7 An orphan media part and relationship after a delete (pic-7):',
  '      no repair, and does Word drop them on save? - yes',
  '  PI8 A picture pasted between documents keeps its size, crop and',
  '      alt text (pic-6)? - yes',
  '  PI9 (No file: make it in Word) A picture in the same run as text',
  '      (<w:r><w:t>x</w:t><w:drawing/></w:r>) takes the run\'s rPr:',
  '      with w:vanish text before it, is the picture hidden; do',
  '      w:position / w:vertAlign move it? In a hyperlink run is it a',
  '      linked picture; in a field result is it lost on update? - it',
  '      takes the format of the text before it, nothing dropped',
  '  PI* (No file) Real drag and drop of a picture from the host, and',
  '      paste of an image copied in a browser or a paint program, in',
  '      Chrome, Firefox and Safari: not testable with synthetic',
  '      events; the menu (Insert > Picture...) always works.',
  '  P1 (No file: make it in Word) A picture on a line with 1.5 or',
  '      double (auto) line spacing: is the whole line, picture',
  '      included, scaled, leaving a gap above the picture? - no: the',
  '      extra spacing is for the text part only',
  '  P2 (No file: make it in Word) A picture in a raised or lowered run',
  '      (w:position, superscript, subscript): does it move? - !Word',
  '      puts its bottom on the baseline (the shift ignored)',
  '  P3 (No file: a phone photo taken upright) A JPEG with an EXIF',
  '      orientation inserted or opened: does Word turn it, and is its',
  '      original size the turned one? - !Word draws it turned but',
  '      sizes it unturned (it may look squashed)',
  '  P4 (No file: try it in Word) A resize drag that ends where it',
  '      began, then Ctrl-Z: is there an undo step? - none in !Word',
  '  P5 (No file: try it in Word) An edge drag on a picture wider',
  '      than the column: the size Word gives it? - !Word scales the',
  '      file\'s width by the box\'s change; it shows such a picture',
  '      fitted to the column',
  '  P6 pic-6: the picture pasted within the document keeps its',
  '      wp14:anchorId / editId (two drawings share them), and the one',
  '      pasted from pic-6-source may declare xmlns:wp14 on its',
  '      w:drawing while mc:Ignorable does not list wp14: does Word',
  '      open it without repair and keep both pictures? - yes',
];
console.log('pic-README.txt: ' + put('pic-README.txt',
  new TextEncoder().encode(README.join('\n') + '\n')));
