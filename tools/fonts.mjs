#!/usr/bin/env node
// Convert RISC OS outline fonts (Outlines + IntMetrics) to OpenType CFF (.otf) with opentype.js.
//   (cd tools && npm i) ; node tools/fonts.mjs
// Output: assets/fonts/<Family>-<Style>.otf, assets/fonts/fonts.css, assets/fonts/fonts.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, V } from './lib/sources.mjs';
import { parseOutlines, parseIntMetrics, parseEncoding } from './lib/riscosfont.mjs';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

const OUT = path.join(ROOT, 'assets/fonts');
const ROM = 'Sources/OS_Core/Video/Render/Fonts/ROMFonts/Fonts/';
const RES = 'Sources/SystemRes/Fonts/';

// RISC OS Latin1 (alphabet 101) positions 0x80-0x9F → Unicode, by glyph name.
const NAME2U = {
  Wcircumflex: 0x174, wcircumflex: 0x175, Ycircumflex: 0x176, ycircumflex: 0x177, ellipsis: 0x2026, trademark: 0x2122,
  perthousand: 0x2030, bullet: 0x2022, quoteleft: 0x2018, quoteright: 0x2019, guilsinglleft: 0x2039, guilsinglright: 0x203a,
  quotedblleft: 0x201c, quotedblright: 0x201d, quotedblbase: 0x201e, endash: 0x2013, emdash: 0x2014, minus: 0x2212,
  OE: 0x152, oe: 0x153, dagger: 0x2020, daggerdbl: 0x2021, fi: 0xfb01, fl: 0xfb02,
};

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

// ---- geometry helpers ----
function flatten(contour) {
  const pts = []; let cur = [0, 0];
  for (const s of contour) {
    if (s.t === 'M' || s.t === 'L') { cur = s.pts[0]; pts.push(cur); }
    else {
      const [p1, p2, p3] = s.pts, p0 = cur;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
      }
      cur = p3;
    }
  }
  return pts;
}
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function reverseContour(contour) {
  // contour: M p0, then segments. Build list of points & reverse.
  const segs = []; let start = contour[0].pts[0], cur = start;
  for (const s of contour.slice(1)) { segs.push({ from: cur, s }); cur = s.pts[s.pts.length - 1]; }
  const out = [{ t: 'M', pts: [cur] }];
  for (let i = segs.length - 1; i >= 0; i--) {
    const { from, s } = segs[i];
    if (s.t === 'L') out.push({ t: 'L', pts: [from] });
    else out.push({ t: 'C', pts: [s.pts[1], s.pts[0], from] });
  }
  return out;
}

/** Resolve a glyph's contours including composite inclusions, returning absolute contours. */
function resolve(outl, code, dx = 0, dy = 0, depth = 0) {
  const g = outl.glyphs.get(code);
  if (!g || depth > 4) return [];
  const mv = (c) => c.map((s) => ({ t: s.t, pts: s.pts.map(([x, y]) => [x + dx, y + dy]) }));
  let out = g.contours.filter((c) => c.length > 1 && c[0].t === 'M').map(mv);
  for (const inc of g.includes) out = out.concat(resolve(outl, inc.code, dx + inc.dx, dy + inc.dy, depth + 1));
  return out;
}

function orient(contours) {
  // Emulate even-odd fill with non-zero: contours at even nesting depth anticlockwise, odd depth clockwise.
  const polys = contours.map(flatten);
  return contours.map((c, i) => {
    let depth = 0;
    const probe = polys[i][0];
    for (let j = 0; j < polys.length; j++) if (j !== i && polys[j].length > 2 && inside(probe, polys[j])) depth++;
    const a = area(polys[i]);
    const wantCCW = depth % 2 === 0;
    return (a > 0) === wantCCW ? c : reverseContour(c);
  });
}

function buildFont([roName, family, weight, style, outRel, metRel]) {
  const { outl, matrix, via } = loadOutlines(outRel);
  const met = parseIntMetrics(fs.readFileSync(findFile(metRel)));
  const isBase0 = /Outlines0/i.test(outRel) || via;
  const s = 1000 / outl.designSize;
  const tx = ([x, y]) => {
    let X = x, Y = y;
    if (matrix) { X = matrix[0] * x + matrix[2] * y; Y = matrix[1] * x + matrix[3] * y; }
    return [Math.round(X * s), Math.round(Y * s)];
  };
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 500, path: new opentype.Path() })];
  const seen = new Set();
  const map = [];
  const symbol = family === 'Selwyn' || family === 'Sidney'; // symbol fonts: glyph code = char code, mapped 1:1
  for (let c = 32; c < 256; c++) {
    const name = symbol ? 'g' + c : latin1[c];
    if (symbol && !outl.glyphs.has(c)) continue;
    if (!name || name === '.notdef') continue;
    const u = symbol || c < 0x80 || c >= 0xa0 ? c : NAME2U[name];
    if (u === undefined || seen.has(u)) continue;
    let gi = c;
    if (isBase0) { gi = base0.indexOf(name); if (gi < 0) continue; }
    if (c === 0xa0) { /* nbsp = space */ }
    let contours = resolve(outl, gi);
    if (!outl.nonZero) contours = orient(contours);
    const p = new opentype.Path();
    for (const cont of contours) {
      for (const seg of cont) {
        const pts = seg.pts.map(tx);
        if (seg.t === 'M') p.moveTo(...pts[0]);
        else if (seg.t === 'L') p.lineTo(...pts[0]);
        else p.curveTo(...pts[0], ...pts[1], ...pts[2]);
      }
      p.close();
    }
    let w = met.widthOf(gi);
    if (w == null) { const g = outl.glyphs.get(gi); w = g && g.bbox ? Math.round((g.bbox.x1) * s) : 500; }
    seen.add(u);
    glyphs.push(new opentype.Glyph({ name: name === 'space' && c === 0xa0 ? 'nbspace' : name, unicode: u, advanceWidth: w, path: p }));
    map.push([c, u]);
  }
  const asc = Math.round(outl.bbox.y1 * s), desc = Math.round(outl.bbox.y0 * s);
  const font = new opentype.Font({
    familyName: family, styleName: (weight === 700 ? 'Bold' : 'Regular').replace('Regular', style === 'italic' ? 'Italic' : 'Regular') + (weight === 700 && style === 'italic' ? ' Italic' : ''),
    unitsPerEm: 1000, ascender: asc, descender: desc, glyphs,
  });
  font.tables.os2 = font.tables.os2 || {};
  const file = `${family.replace(/\s+/g, '')}-${weight === 700 ? 'Bold' : 'Medium'}${style === 'italic' ? 'Italic' : ''}.otf`;
  fs.writeFileSync(path.join(OUT, file), Buffer.from(font.toArrayBuffer()));
  return { roName, family, weight, style, file, glyphs: glyphs.length, designSize: outl.designSize, version: outl.version, ascender: asc, descender: desc, source: outRel };
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
