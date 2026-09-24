// node tests/tierb/t1-convert.test.mjs : !T1ToFont's converter (src/apps/T1ToFont/type1.js) on a generated
// Type 1 font (t1-make.mjs), checked by parsing the Outlines / IntMetrics back with tools/lib/riscosfont.mjs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeType1 } from './t1-make.mjs';
import { parseOutlines, parseIntMetrics } from '../../tools/lib/riscosfont.mjs';
import * as T1 from '../../src/apps/T1ToFont/type1.js';
import base0 from '../../src/apps/T1ToFont/base0.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENC = path.join(ROOT, 'assets/disc/HardDisc4/Utilities/=21T1ToFont/Encodings');
const load = async (name) => {
  if (name === '/Base0') return base0;
  const p = path.join(ENC, ...name.split('.'));
  return fs.existsSync(p) ? fs.readFileSync(p, 'latin1') : null;
};
let fails = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`); if (!ok) fails++; };

const font = makeType1();
check('generated PFA is Type 1', T1.isType1(font.pfa) && T1.guessType(font.pfa) === T1.FILETYPE_TYPE1);
check('generated PFB detected as PC format', T1.guessType(font.pfb) === T1.FILETYPE_PC && T1.isType1(font.pfb));
check('FontName read', T1.getFontName(font.pfa) === 'Sample-Medium' && T1.getFontName(font.pfb) === 'Sample-Medium');
check('guessed Acorn name', T1.guessAcornFontName('Sample-Medium') === 'Sample.Medium' && T1.guessAcornFontName('Times-BoldItalic') === 'Times.Bold.Italic', T1.guessAcornFontName('Times-BoldItalic'));

const adobe = await T1.readEncoding('Specials.Adobe', load);
const specials = { dummies: await T1.readEncoding('Specials.Dummies', load, false), up: await T1.readEncoding('Specials.Accents_Up', load, false), down: await T1.readEncoding('Specials.Accents_Dn', load, false) };
const base = await T1.readEncoding('/Base0', load);
check('Base0 encoding', base.alphabet === 0 && base.nchars > 256 && base.matchname('A') === 65, `nchars ${base.nchars} alphabet ${base.alphabet}`);
check('file leaf names', T1.fontFileLeaf('Outlines', 0) === 'Outlines0' && T1.fontFileLeaf('IntMetrics', 0) === 'IntMetric0' && T1.fontFileLeaf('Outlines', -1) === 'Outlines');

for (const [label, bytes] of [['PFA', font.pfa], ['PFB', font.pfb]]) {
  const r = T1.convertType1(bytes, { encoding: base, adobe, fontName: 'Sample.Medium' });
  const o = parseOutlines(Buffer.from(r.outlines));
  const A = o.glyphs.get(65), O = o.glyphs.get(79), hy = o.glyphs.get(base.matchname('hyphen'));
  check(`${label}: Outlines v8, design size 1000`, o.version === 8 && o.designSize === 1000 && o.nonZero);
  check(`${label}: 'A' has outline contours`, A && A.contours.length >= 1 && A.contours.flat().length > 3, JSON.stringify(A?.bbox));
  check(`${label}: 'O' has curves`, O && O.contours.flat().some((s) => s.t === 'C'));
  check(`${label}: flexed hyphen flattened to lines`, hy && hy.contours.length === 1 && hy.contours[0].every((s) => s.t !== 'C'), JSON.stringify(hy?.contours));
  const aac = o.glyphs.get(base.matchname('Aacute'));
  check(`${label}: Aacute is a composite A + acute`, aac && aac.includes.length === 2 && aac.includes[0].code === 65 && aac.includes[1].code === base.matchname('acute'), JSON.stringify(aac));
  check(`${label}: font bbox`, o.bbox.x1 > o.bbox.x0 && o.bbox.y1 > o.bbox.y0, JSON.stringify(o.bbox));
  check(`${label}: generated AFM`, /UnderlinePosition -?\d+/.test(r.genAfm) && /\nC 65 ; WX \d+ ; N A ; B/.test(r.genAfm) && /FontBBox/.test(r.genAfm));
  const mbytes = T1.makeIntMetrics(r.genAfm, r.encoding, 'Sample.Medium', specials);
  const m = parseIntMetrics(Buffer.from(mbytes));
  const idx = (c) => (m.map ? (m.flags & 32 && m.map.length === 0 ? c : m.map[c]) : c);
  const xw = (c) => m.xoff[idx(c)];
  const genA = +/\nC 65 ; WX (\d+)/.exec(r.genAfm)[1];
  check(`${label}: IntMetrics name / flags`, m.name.startsWith('Sample.Medium') && (m.flags & 8) && m.misc, `flags ${m.flags}`);
  check(`${label}: IntMetrics width of A`, xw(65) === genA, `${xw(65)} vs ${genA}`);
  check(`${label}: IntMetrics width of space`, xw(32) === +/\nC 32 ; WX (\d+)/.exec(r.genAfm)[1]);
}

// "As specified in Type 1 file": StandardEncoding in the font -> Adobe Standard, no alphabet
let warned = null;
const r2 = T1.convertType1(font.pfa, { encoding: null, adobe, fontName: 'Sample.Medium', warn: (t) => { warned = t; } });
check('font-specific encoding falls back to Adobe (with warning)', warned === 'AdobeEnc' && r2.encoding.alphabet === -1 && /\/A\n/.test(r2.encoding.toText()));
const o2 = parseOutlines(Buffer.from(r2.outlines));
check('font-specific: acute at Adobe code 194', o2.glyphs.get(194)?.contours.length > 0);

// A user-supplied AFM with kerns
const afm = 'StartFontMetrics 2.0\nFontName Sample-Medium\nItalicAngle -12\nIsFixedPitch false\nUnderlinePosition -100\nUnderlineThickness 50\nFontBBox -50 -200 1000 900\nCapHeight 650\nXHeight 450\nAscender 700\nDescender -200\nStartCharMetrics 3\nC 32 ; WX 250 ; N space ; B 0 0 0 0 ;\nC 65 ; WX 700 ; N A ; B 10 0 690 650 ;\nC 86 ; WX 680 ; N V ; B 10 0 670 650 ;\nEndCharMetrics\nStartKernData\nStartKernPairs 2\nKPX A V -80\nKPX V A -70\nEndKernPairs\nEndKernData\nEndFontMetrics\n';
check('AFM validated', T1.isAFM(Buffer.from(afm)) && !T1.isAFM(font.pfa));
const m3 = parseIntMetrics(Buffer.from(T1.makeIntMetrics(afm, base, 'Sample.Medium', specials)));
check('AFM metrics: widths, shear, cap height', m3.xoff[m3.map[65]] === 700 && m3.misc.italicH === Math.trunc(-1000 * Math.tan(-12 * 3.1415926 / 180)) && m3.misc.capHeight === 650, JSON.stringify(m3.misc));

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
