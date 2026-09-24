#!/usr/bin/env node
// Convert RISC OS outline fonts (Outlines + IntMetrics) to OpenType CFF (.otf) with opentype.js.
//   (cd tools && npm i) ; node tools/fonts.mjs
// Output: assets/fonts/<Family>-<Style>.otf, assets/fonts/fonts.css, assets/fonts/fonts.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, V } from './lib/sources.mjs';
import { parseOutlines, parseIntMetrics, parseEncoding } from './lib/riscosfont.mjs';
import { buildOpenType, NAME2U } from '../src/core/fontbuild.js';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

const OUT = process.env.FONTS_OUT || path.join(ROOT, 'assets/fonts');
const ROM = 'Sources/OS_Core/Video/Render/Fonts/ROMFonts/Fonts/';
const RES = 'Sources/SystemRes/Fonts/';

const FAMILY_FALLBACK = {
  Homerton: 'Helvetica, Arial, sans-serif', Trinity: '"Times New Roman", Times, serif', Corpus: '"Courier New", Courier, monospace',
  NewHall: '"Century Schoolbook", Georgia, serif', Sassoon: '"Comic Sans MS", sans-serif', Selwyn: '"Zapf Dingbats", sans-serif',
  Sidney: 'Symbol, serif', 'RISCOS System': 'monospace', 'RISCOS System Fixed': 'monospace',
};

// [RISC OS name, family, weight, style, outlines path, intmetrics path, obliqueFrom?]
const FONTS = [
  ['Homerton.Medium', 'Homerton', 400, 'normal', ROM + 'Homerton/Medium/Outlines0,ff6', ROM + 'Homerton/Medium/IntMetric0,ff6'],
  ['Homerton.Bold', 'Homerton', 700, 'normal', ROM + 'Homerton/Bold/Outlines0,ff6', ROM + 'Homerton/Bold/IntMetric0,ff6'],
  ['Homerton.Medium.Oblique', 'Homerton', 400, 'italic', ROM + 'Homerton/Medium/Oblique/Outlines0', ROM + 'Homerton/Medium/Oblique/IntMetric0,ff6'],
  ['Homerton.Bold.Oblique', 'Homerton', 700, 'italic', ROM + 'Homerton/Bold/Oblique/Outlines0', ROM + 'Homerton/Bold/Oblique/IntMetric0,ff6'],
  ['Trinity.Medium', 'Trinity', 400, 'normal', ROM + 'Trinity/Medium/Outlines0,ff6', ROM + 'Trinity/Medium/IntMetric0,ff6'],
  ['Trinity.Bold', 'Trinity', 700, 'normal', ROM + 'Trinity/Bold/Outlines0,ff6', ROM + 'Trinity/Bold/IntMetric0,ff6'],
  ['Trinity.Medium.Italic', 'Trinity', 400, 'italic', ROM + 'Trinity/Medium/Italic/Outlines0,ff6', ROM + 'Trinity/Medium/Italic/IntMetric0,ff6'],
  ['Trinity.Bold.Italic', 'Trinity', 700, 'italic', ROM + 'Trinity/Bold/Italic/Outlines0,ff6', ROM + 'Trinity/Bold/Italic/IntMetric0,ff6'],
  ['Corpus.Medium', 'Corpus', 400, 'normal', ROM + 'Corpus/Medium/Outlines0,ff6', ROM + 'Corpus/Medium/IntMetric0,ff6'],
  ['Corpus.Bold', 'Corpus', 700, 'normal', ROM + 'Corpus/Bold/Outlines0,ff6', ROM + 'Corpus/Bold/IntMetric0,ff6'],
  ['Corpus.Medium.Oblique', 'Corpus', 400, 'italic', ROM + 'Corpus/Medium/Oblique/Outlines0', ROM + 'Corpus/Medium/Oblique/IntMetric0,ff6'],
  ['Corpus.Bold.Oblique', 'Corpus', 700, 'italic', ROM + 'Corpus/Bold/Oblique/Outlines0', ROM + 'Corpus/Bold/Oblique/IntMetric0,ff6'],
  ['NewHall.Medium', 'NewHall', 400, 'normal', RES + 'NewHall/Medium/Outlines,ff6', RES + 'NewHall/Medium/IntMetrics,ff6'],
  ['NewHall.Bold', 'NewHall', 700, 'normal', RES + 'NewHall/Bold/Outlines,ff6', RES + 'NewHall/Bold/IntMetrics,ff6'],
  ['NewHall.Medium.Italic', 'NewHall', 400, 'italic', RES + 'NewHall/Medium/Italic/Outlines,ff6', RES + 'NewHall/Medium/Italic/IntMetrics,ff6'],
  ['NewHall.Bold.Italic', 'NewHall', 700, 'italic', RES + 'NewHall/Bold/Italic/Outlines,ff6', RES + 'NewHall/Bold/Italic/IntMetrics,ff6'],
  ['Sassoon.Primary', 'Sassoon', 400, 'normal', RES + 'Sassoon/Primary/Outlines0,ff6', RES + 'Sassoon/Primary/Intmetric0,ff6'],
  ['Sassoon.Primary.Bold', 'Sassoon', 700, 'normal', RES + 'Sassoon/Primary/Bold/Outlines0,ff6', RES + 'Sassoon/Primary/Bold/Intmetric0,ff6'],
  ['Selwyn', 'Selwyn', 400, 'normal', RES + 'Selwyn/Outlines,ff6', RES + 'Selwyn/IntMetrics,ff6'],
  ['Sidney', 'Sidney', 400, 'normal', RES + 'Sidney/Outlines,ff6', RES + 'Sidney/IntMetrics,ff6'],
  ['System.Medium', 'RISCOS System', 400, 'normal', RES + 'System/Medium/Outlines,ff6', RES + 'System/Medium/IntMetrics,ff6'],
  ['System.Fixed', 'RISCOS System Fixed', 400, 'normal', RES + 'System/Fixed/Outlines,ff6', RES + 'System/Fixed/IntMetrics,ff6'],
];

const base0 = parseEncoding(fs.readFileSync(path.join(V, ROM + 'Encodings/.Base0'), 'latin1'));
const latin1 = parseEncoding(fs.readFileSync(path.join(V, ROM + 'Encodings/Latin1'), 'latin1'));

function findFile(rel) {
  const p = path.join(V, rel);
  if (fs.existsSync(p)) return p;
  // case-insensitive fallback
  const dir = path.dirname(p), want = path.basename(p).toLowerCase();
  const hit = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.toLowerCase() === want);
  return hit ? path.join(dir, hit) : null;
}

/** Load an Outlines file, following a transformed-font text stub ("Base.Name\M a b c d e f"). */
function loadOutlines(rel) {
  const f = findFile(rel);
  const buf = fs.readFileSync(f);
  if (buf.subarray(0, 4).toString() === 'FONT') return { outl: parseOutlines(buf), matrix: null };
  const txt = buf.toString('latin1').trim();
  const m = txt.match(/^([\w.]+)\\M\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
  if (!m) throw new Error('unknown outline stub ' + txt);
  const [fam, wt] = m[1].split('.');
  const target = ROM + `${fam}/${wt}/Outlines0,ff6`;
  const matrix = m.slice(2, 8).map(Number).map((v, i) => (i < 4 ? v / 65536 : v));
  return { outl: parseOutlines(fs.readFileSync(findFile(target))), matrix, via: m[1] };
}

function buildFont([roName, family, weight, style, outRel, metRel]) {
  const { outl, matrix, via } = loadOutlines(outRel);
  const met = parseIntMetrics(fs.readFileSync(findFile(metRel)));
  const isBase0 = /Outlines0/i.test(outRel) || via;
  const symbol = family === 'Selwyn' || family === 'Sidney'; // symbol fonts: glyph code = char code, mapped 1:1
  const styleName = (weight === 700 ? 'Bold' : 'Regular').replace('Regular', style === 'italic' ? 'Italic' : 'Regular') + (weight === 700 && style === 'italic' ? ' Italic' : '');
  const { font, glyphs, ascender: asc, descender: desc } = buildOpenType(opentype, { outl, met, matrix, family, styleName, isBase0, latin1, base0, symbol });
  const file = `${family.replace(/\s+/g, '')}-${weight === 700 ? 'Bold' : 'Medium'}${style === 'italic' ? 'Italic' : ''}.otf`;
  fs.writeFileSync(path.join(OUT, file), Buffer.from(font.toArrayBuffer()));
  return { roName, family, weight, style, file, glyphs, designSize: outl.designSize, version: outl.version, ascender: asc, descender: desc, source: outRel };
}

fs.mkdirSync(OUT, { recursive: true });
const results = [];
for (const f of FONTS) {
  try { const r = buildFont(f); results.push(r); console.log(`${r.roName.padEnd(26)} → ${r.file} (${r.glyphs} glyphs, v${r.version}, design ${r.designSize})`); }
  catch (e) { console.warn('FAILED', f[0], e.message); }
}
let css = '/* Generated by tools/fonts.mjs from RISC OS 3.71 outline fonts. */\n';
for (const r of results) css += `@font-face { font-family: "${r.family}"; src: url("${r.file}") format("opentype"); font-weight: ${r.weight}; font-style: ${r.style}; }\n`;
fs.writeFileSync(path.join(OUT, 'fonts.css'), css);
const json = {
  note: 'RISC OS font name → CSS font. Use `${weight} ${style} ${size} "${family}", ${fallback}`. Text is Unicode; map RISC OS Latin-1 bytes 0x80-0x9F with latin1ToUnicode.',
  desktopFont: { riscos: 'Homerton.Medium', size: '12pt', css: '12pt "Homerton", Helvetica, Arial, sans-serif' },
  fonts: Object.fromEntries(results.map((r) => [r.roName, { family: r.family, weight: r.weight, style: r.style, file: r.file, fallback: FAMILY_FALLBACK[r.family], ascender: r.ascender, descender: r.descender }])),
  latin1ToUnicode: Object.fromEntries(latin1.map((n, c) => [c, c >= 0x80 && c < 0xa0 ? NAME2U[n] : undefined]).filter(([c, u]) => u !== undefined)),
};
fs.writeFileSync(path.join(OUT, 'fonts.json'), JSON.stringify(json, null, 1));
