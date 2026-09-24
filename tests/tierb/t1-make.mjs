// Builds a genuine Adobe Type 1 font (PFA and PFB) from one of the converted OpenType fonts in
// assets/fonts, for testing !T1ToFont (there are no Type 1 fonts on the disc or this machine).
//
//   import { makeType1 } from './t1-make.mjs';
//   const { pfa, pfb, fontName } = makeType1({ otf: 'Trinity-Medium.otf', fontName: 'Sample-Medium' });
//   node tests/tierb/t1-make.mjs [out-dir]      → writes Sample-Medium.pfa / .pfb
//
// The font uses StandardEncoding, lenIV 4, the four standard flex / hint replacement Subrs, hsbw +
// rmoveto / rlineto / rrcurveto / closepath / endchar charstrings, a flex feature (in "hyphen"), hint
// replacement (in "I") and a seac accented character ("Aacute" = A + acute), all eexec-encrypted.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

// Adobe StandardEncoding (from the disc's T1ToFont Encodings.Specials.Adobe)
function adobeNames() {
  const t = fs.readFileSync(path.join(ROOT, 'assets/disc/HardDisc4/Utilities/=21T1ToFont/Encodings/Specials/Adobe'), 'latin1');
  const names = [];
  for (const line of t.split('\n')) for (const w of line.replace(/%.*/, '').split(/\s+/)) if (w.startsWith('/')) names.push(w.slice(1));
  return names;
}

const num = (v) => {
  v = Math.round(v);
  if (v >= -107 && v <= 107) return [v + 139];
  if (v >= 108 && v <= 1131) { v -= 108; return [(v >> 8) + 247, v & 255]; }
  if (v >= -1131 && v <= -108) { v = -v - 108; return [(v >> 8) + 251, v & 255]; }
  return [255, (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
};
const OP = { hstem: [1], vstem: [3], rlineto: [5], rrcurveto: [8], closepath: [9], callsubr: [10], return: [11], hsbw: [13], endchar: [14], rmoveto: [21], seac: [12, 6], callothersubr: [12, 16], pop: [12, 17], setcurrentpoint: [12, 33] };
const cs = (...items) => items.flatMap((x) => (typeof x === 'number' ? num(x) : OP[x]));

function encrypt(bytes, R, skip) {
  const out = [];
  const src = [...new Array(skip).fill(0).map((_, i) => (i * 37 + 11) & 255), ...bytes];
  for (const p of src) { const c = (p ^ (R >> 8)) & 255; R = ((c + R) * 52845 + 22719) & 0xFFFF; out.push(c); }
  return out;
}

/** Glyph → charstring (absolute font units, y up). */
function glyphCharstring(glyph, extra = {}) {
  const out = [...cs(0, Math.round(glyph.advanceWidth), 'hsbw')];
  if (extra.hints) out.push(...extra.hints);
  let cx = 0, cy = 0, open = false;
  const P = (x, y) => [Math.round(x), Math.round(y)];
  for (const c of glyph.path.commands) {
    if (c.type === 'M') {
      if (open) out.push(...cs('closepath'));
      const [x, y] = P(c.x, c.y); out.push(...cs(x - cx, y - cy, 'rmoveto')); cx = x; cy = y; open = true;
    } else if (c.type === 'L') {
      const [x, y] = P(c.x, c.y); if (x === cx && y === cy) continue; out.push(...cs(x - cx, y - cy, 'rlineto')); cx = x; cy = y;
    } else if (c.type === 'C' || c.type === 'Q') {
      let x1, y1, x2, y2;
      if (c.type === 'Q') { x1 = cx + (2 / 3) * (c.x1 - cx); y1 = cy + (2 / 3) * (c.y1 - cy); x2 = c.x + (2 / 3) * (c.x1 - c.x); y2 = c.y + (2 / 3) * (c.y1 - c.y); }
      else { x1 = c.x1; y1 = c.y1; x2 = c.x2; y2 = c.y2; }
      const [ax, ay] = P(x1, y1), [bx, by] = P(x2, y2), [x, y] = P(c.x, c.y);
      out.push(...cs(ax - cx, ay - cy, bx - ax, by - ay, x - bx, y - by, 'rrcurveto')); cx = x; cy = y;
    } else if (c.type === 'Z') { if (open) out.push(...cs('closepath')); open = false; }
  }
  if (open) out.push(...cs('closepath'));
  out.push(...cs('endchar'));
  return out;
}

/** A hyphen drawn with a flex feature on its top edge (flattened to a line by T1ToFont). */
function flexHyphen(glyph) {
  const bb = glyph.getBoundingBox();
  const x0 = Math.round(bb.x1), x1 = Math.round(bb.x2), y0 = Math.round(bb.y1), y1 = Math.round(bb.y2);
  const mid = Math.round((x0 + x1) / 2);
  const out = [...cs(0, Math.round(glyph.advanceWidth), 'hsbw')];
  out.push(...cs(x0, y0, 'rmoveto', x1 - x0, 0, 'rlineto', 0, y1 - y0, 'rlineto'));
  // flex from (x1,y1) to (x0,y1) via (mid, y1+4): reference point then 6 points, all relative moves
  out.push(...cs(1, 'callsubr'));
  const pts = [[mid, y1], [x1 - 20, y1], [mid + 20, y1 + 4], [mid, y1 + 4], [mid - 20, y1 + 4], [x0 + 20, y1], [x0, y1]];
  let px = x1, py = y1;
  for (const [x, y] of pts) { out.push(...cs(x - px, y - py, 'rmoveto', 2, 'callsubr')); px = x; py = y; }
  out.push(...cs(50, x0, y1, 0, 'callsubr', 'closepath', 'endchar'));
  return out;
}

export function makeType1({ otf = 'Trinity-Medium.otf', fontName = 'Sample-Medium', familyName = 'Sample' } = {}) {
  const opentype = require(path.join(ROOT, 'tools/node_modules/opentype.js'));
  const font = opentype.loadSync(path.join(ROOT, 'assets/fonts', otf));
  const std = adobeNames();
  const glyphs = new Map();                         // name → charstring bytes
  glyphs.set('.notdef', cs(0, 250, 'hsbw', 'endchar'));
  for (let code = 32; code < 256; code++) {
    const name = std[code];
    if (!name || name === '.notdef' || glyphs.has(name)) continue;
    const uni = { quoteright: 0x2019, quoteleft: 0x2018, acute: 0xB4, grave: 0x60 }[name] ?? (code < 127 ? code : null);
    if (uni == null) continue;
    const g = font.charToGlyph(String.fromCharCode(uni));
    if (!g || g.index === 0) continue;
    if (name === 'hyphen') glyphs.set(name, flexHyphen(g));
    else if (name === 'I') {
      // hint replacement: Subr 4 holds a second set of stems, called via othersubr 3
      glyphs.set(name, glyphCharstring(g, { hints: cs(0, 20, 'hstem', 4, 1, 3, 'callothersubr', 'pop', 'callsubr') }));
    } else glyphs.set(name, glyphCharstring(g));
  }
  // Aacute by seac: A (65) + acute (194), accent centred over the A
  const A = font.charToGlyph('A'), acute = font.charToGlyph('´');
  const adx = Math.round((A.advanceWidth - acute.advanceWidth) / 2), ady = Math.round((A.getBoundingBox().y2 - 480));
  glyphs.set('Aacute', cs(0, Math.round(A.advanceWidth), 'hsbw', 0, adx, Math.max(0, ady), 65, 194, 'seac'));

  const subrs = [
    cs(3, 0, 'callothersubr', 'pop', 'pop', 'setcurrentpoint', 'return'),
    cs(0, 1, 'callothersubr', 'return'),
    cs(0, 2, 'callothersubr', 'return'),
    cs('return'),
    cs(0, 30, 'hstem', 100, 40, 'vstem', 'return'),
  ];
  const upos = font.tables.post?.underlinePosition || -100, uthick = font.tables.post?.underlineThickness || 50;
  const clear = `%!PS-AdobeFont-1.0: ${fontName} 001.000
%%Title: ${fontName}
%%CreationDate: generated by tests/tierb/t1-make.mjs
11 dict begin
/FontInfo 9 dict dup begin
/version (001.000) readonly def
/FullName (${fontName.replace(/-/g, ' ')}) readonly def
/FamilyName (${familyName}) readonly def
/Weight (Medium) readonly def
/ItalicAngle 0 def
/isFixedPitch false def
/UnderlinePosition ${upos} def
/UnderlineThickness ${uthick} def
end readonly def
/FontName /${fontName} def
/PaintType 0 def
/FontType 1 def
/FontMatrix [0.001 0 0 0.001 0 0] readonly def
/Encoding StandardEncoding def
/FontBBox {-100 -250 1100 950} readonly def
currentdict end
currentfile eexec
`;
  // private part
  const parts = [];
  const txt = (s) => parts.push(...Buffer.from(s, 'latin1'));
  const bin = (b) => parts.push(...b);
  txt('dup /Private 9 dict dup begin\n/RD {string currentfile exch readstring pop} executeonly def\n/ND {noaccess def} executeonly def\n/NP {noaccess put} executeonly def\n');
  txt('/BlueValues [-15 0 480 495 650 665] def\n/BlueScale 0.039625 def\n/StdHW [30] def\n/StdVW [85] def\n/lenIV 4 def\n/password 5839 def\n/MinFeature {16 16} def\n');
  txt(`/Subrs ${subrs.length} array\n`);
  subrs.forEach((s, i) => { const e = encrypt(s, 4330, 4); txt(`dup ${i} ${e.length} RD `); bin(e); txt(' NP\n'); });
  txt('ND\n2 index /CharStrings ' + glyphs.size + ' dict dup begin\n');
  for (const [n, s] of glyphs) { const e = encrypt(s, 4330, 4); txt(`/${n} ${e.length} RD `); bin(e); txt(' ND\n'); }
  txt('end\nend\nreadonly put\nnoaccess put\ndup /FontName get exch definefont pop\nmark currentfile closefile\n');
  const eexec = encrypt(parts, 55665, 4);
  const zeros = ('0'.repeat(64) + '\n').repeat(8) + 'cleartomark\n';
  // PFA: hex eexec section
  let hex = '';
  eexec.forEach((b, i) => { hex += b.toString(16).padStart(2, '0'); if (i % 32 === 31) hex += '\n'; });
  const pfa = Buffer.from(clear + hex + '\n' + zeros, 'latin1');
  // PFB: segments (1 = ASCII, 2 = binary, 3 = EOF)
  const seg = (t, data) => { const h = Buffer.alloc(6); h[0] = 0x80; h[1] = t; h.writeUInt32LE(data.length, 2); return Buffer.concat([h, data]); };
  const pfb = Buffer.concat([seg(1, Buffer.from(clear, 'latin1')), seg(2, Buffer.from(eexec)), seg(1, Buffer.from(zeros, 'latin1')), Buffer.from([0x80, 3])]);
  return { pfa: new Uint8Array(pfa), pfb: new Uint8Array(pfb), fontName, glyphNames: [...glyphs.keys()] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2] ?? '.';
  const r = makeType1();
  fs.writeFileSync(path.join(dir, r.fontName + '.pfa'), r.pfa);
  fs.writeFileSync(path.join(dir, r.fontName + '.pfb'), r.pfb);
  console.log(`${r.fontName}: ${r.glyphNames.length} glyphs, pfa ${r.pfa.length} bytes, pfb ${r.pfb.length} bytes`);
}
