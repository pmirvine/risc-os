// RISC OS outline font -> OpenType (CFF) with opentype.js. Shared by tools/fonts.mjs (the pre-converted ROM and
// !Fonts fonts in assets/fonts) and the desktop's font registry (fontreg.js), which converts outline fonts found
// on the virtual disc (e.g. written by !T1ToFont) at run time. Pure JS: pass the opentype.js module in.
//
// Characters are the RISC OS Latin-1 codes 32-255 (alphabet 101). Code c maps to the glyph named by the Latin1
// encoding (Base0 fonts: its index in /Base0), by the font's own Encoding file (font-specific encodings), or to
// glyph c (symbol fonts). Unicode = c, except 0x80-0x9F, which take the Unicode of the Latin1 glyph name there
// (so text converted with fonts.json's latin1ToUnicode finds them).

// RISC OS Latin1 (alphabet 101) positions 0x80-0x9F → Unicode, by glyph name.
export const NAME2U = {
  Wcircumflex: 0x174, wcircumflex: 0x175, Ycircumflex: 0x176, ycircumflex: 0x177, ellipsis: 0x2026, trademark: 0x2122,
  perthousand: 0x2030, bullet: 0x2022, quoteleft: 0x2018, quoteright: 0x2019, guilsinglleft: 0x2039, guilsinglright: 0x203a,
  quotedblleft: 0x201c, quotedblright: 0x201d, quotedblbase: 0x201e, endash: 0x2013, emdash: 0x2014, minus: 0x2212,
  OE: 0x152, oe: 0x153, dagger: 0x2020, daggerdbl: 0x2021, fi: 0xfb01, fl: 0xfb02,
};

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
  const segs = []; const start = contour[0].pts[0]; let cur = start;
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

/**
 * Build an opentype.Font.
 *   outl, met: parsed Outlines / IntMetrics (riscosfont.js); matrix: [a b c d e f] of a transformed font or null
 *   latin1: Latin1 encoding glyph names by code; base0: /Base0 names (isBase0: Outlines0 fonts)
 *   encoding: the font's own Encoding (names by code) or null; symbol: glyph code = character code
 *   keepUnmapped: map 0x80-0x9F codes with no Latin1 Unicode to themselves (disc fonts) instead of dropping them
 *   uniqueNames: suffix repeated glyph names (Latin1 has two 'hyphen's; the pre-built fonts keep both names)
 * Returns { font, glyphs (count), ascender, descender }.
 */
export function buildOpenType(opentype, { outl, met, matrix = null, family, styleName = 'Regular', isBase0 = false, latin1, base0 = null,
  encoding = null, symbol = false, keepUnmapped = false, uniqueNames = false }) {
  const s = 1000 / outl.designSize;
  const tx = ([x, y]) => {
    let X = x, Y = y;
    if (matrix) { X = matrix[0] * x + matrix[2] * y; Y = matrix[1] * x + matrix[3] * y; }
    return [Math.round(X * s), Math.round(Y * s)];
  };
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 500, path: new opentype.Path() })];
  const seen = new Set(), names = new Set(['.notdef']);
  for (let c = 32; c < 256; c++) {
    let name = symbol ? 'g' + c : (encoding ?? latin1)[c];
    if ((symbol || encoding) && !outl.glyphs.has(c)) continue;
    if (!name || name === '.notdef') continue;
    let u = symbol || c < 0x80 || c >= 0xa0 ? c : NAME2U[latin1[c]];
    if (u === undefined && keepUnmapped) u = c;
    if (u === undefined || seen.has(u)) continue;
    let gi = c;
    if (isBase0) { gi = base0.indexOf(name); if (gi < 0) continue; }
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
    if (name === 'space' && c === 0xa0) name = 'nbspace';
    if (uniqueNames) for (let k = 1; names.has(name); k++) name = name.replace(/\.\d+$/, '') + '.' + k;
    names.add(name);
    glyphs.push(new opentype.Glyph({ name, unicode: u, advanceWidth: w, path: p }));
  }
  const ascender = Math.round(outl.bbox.y1 * s), descender = Math.round(outl.bbox.y0 * s);
  const font = new opentype.Font({ familyName: family, styleName, unitsPerEm: 1000, ascender, descender, glyphs });
  font.tables.os2 = font.tables.os2 || {};
  return { font, glyphs: glyphs.length, ascender, descender };
}
