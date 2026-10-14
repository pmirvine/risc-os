// Test-only: galleys for the pagination tests (Batch D P2.1, D5).
//
//   galley(spec) -> G   a fake galley built without layout:
//     spec.frame   the frame height of every page (px, 100)
//     spec.items   [h | {h?, kind?, lines?, before?, after?,
//                  gapAbove?, gapBelow?, brPage?, brCol?,
//                  breakBefore?,
//                  sectStart?, refs?, keepNext?, keepLines?,
//                  widow?, id?, rows?}] stacked from y 24 as
//                  DocStack does: y += gapAbove; it.y = y; y += h +
//                  gapBelow. lines: their heights (a 'p' item; one
//                  line of h when not given; a 'box' has none), the
//                  first at `before`, h = before + lines + after.
//                  sectStart: a new section starts at the item, of
//                  that w:type ('nextPage', 'continuous', ...); the
//                  item before it gets the band (BAND px) below it;
//                  keepNext, keepLines (false) and widow (widow
//                  control, true) the keep flags (P2.2), which a
//                  real galley resolves through styles (PageKeep);
//                  rows (kind 'tbl', P4.1): a table item as
//                  ./TblLayout lays one out (rowTable, below)
//                  brCol: the lines of brPage that end in a column
//                  break (P10.1)
//     spec.sections [{size?: {w, h} px, frame?, pgNumType?,
//                  vAlign?, exactTop?, cols?: [{x, w}] px (one
//                  column, the text width, when not given)}] by
//                  section index (the type comes from sectStart)
//     spec.hdrH, spec.ftrH, spec.reserve: G's hooks (0 when not
//                  given)
//   G = {items, geom(s), geomTw(s), sect(s), hdrH, ftrH, reserve}
//     (the items carry their facts: brPage, brCol, breakBefore, band,
//     refs, keepNext, keepLines, widow: Paginate reads them when G
//     has no facts(k))
//   rowTable(rows, y) -> the rows, tops and h of a fake table at y:
//     rows [[cell] | {cells, cantSplit?, header?, exact?, min?,
//     mar?: {top, bottom}}], a cell [line h] (one paragraph) or
//     {items: [[line h] | {h}], mar?} ({h}: a nested table, one
//     block); a row's h is its cells' most need (content + mar),
//     exact sets it, min raises it; geo {row: {trPr: {cantSplit,
//     tblHeader}}, trH} as ./TblGeo's
//   docLayout(blocksXml, parts?) -> {L, G, doc}: a real document
//     (the inside of w:body; parts: more package parts, e.g.
//     word/styles.xml) read, laid out by DocLayout with the fake
//     measurer (word-docs tm) at 1000 px, and its galley
//     (PageGalley)
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {buildDocx, documentXml} from './build-docx.mjs';
import {tm} from './word-docs.mjs';

export const BAND = 18;
const MAR = 10;

const zero = () => 0;

/** A fake cell's column at row-relative ry (see rowTable). */
function cellOf(spec, mar0, r) {
  const o = Array.isArray(spec) ? {items: [spec]} : spec;
  const mar = {top: 0, bottom: 0, ...(mar0 || {}), ...(o.mar || {})};
  let ry = 0;
  const items = o.items.map((x) => {
    let it;
    if (Array.isArray(x)) {
      let ly = 0;
      const lines = x.map((h) => {
        const l = {y: ly, h};
        ly += h;
        return l;
      });
      it = {kind: 'p', lines, ry, h: ly};
    } else it = {kind: 'tbl', ry, h: x.h};
    ry += it.h;
    return it;
  });
  return {col: {items}, mar, cont: false, rowSpan: 1, r, dy: 0,
    need: mar.top + ry + mar.bottom};
}

/** See the header. */
export function rowTable(specs, y) {
  let ry = 0;
  const rows = specs.map((x, r) => {
    const o = Array.isArray(x) ? {cells: x} : x;
    const cells = o.cells.map((c) => cellOf(c, o.mar, r));
    const need = Math.max(0, ...cells.map((c) => c.need));
    const h = o.exact ?? Math.max(need, o.min || 0);
    const trH = o.exact !== undefined ? {px: o.exact, rule: 'exact'}
      : o.min ? {px: o.min, rule: 'atLeast'} : null;
    const row = {ry, y: y + ry, h, cells, geo: {row: {trPr:
      {cantSplit: !!o.cantSplit, tblHeader: !!o.header}}, trH}};
    for (const c of cells) {
      c.ry = ry + c.mar.top;
      for (const it of c.col.items) it.y = y + c.ry + it.ry;
    }
    ry += h;
    return row;
  });
  return {rows, tops: Float64Array.from(rows, (row) => row.y), h: ry};
}

/** The px geometry of a fake section. */
function geomOf(sec, frame) {
  const f = sec.frame ?? frame;
  const size = sec.size || {w: 200, h: f + 2 * MAR};
  const mar = {top: MAR, right: MAR, bottom: MAR, left: MAR,
    header: 0, footer: 0, gutter: 0};
  return {size, mar, exactTop: !!sec.exactTop, exactBottom: false,
    cols: sec.cols || [{x: MAR, w: size.w - 2 * MAR}],
    textW: size.w - 2 * MAR};
}

/** See the header. */
export function galley(spec = {}) {
  const frame = spec.frame ?? 100;
  const secs = (spec.sections || []).map((x) => ({...x}));
  const items = [];
  let y = 24, s = 0;
  if (!secs[0]) secs[0] = {};
  (spec.items || []).forEach((x, k) => {
    const o = typeof x === 'number' ? {h: x} : x;
    if (o.sectStart && k > 0) {
      s++;
      secs[s] = {...(secs[s] || {}), type: o.sectStart};
      const pr = items[k - 1];
      pr.band = BAND;
      pr.gapBelow += BAND;
      y += BAND;
    }
    const kind = o.kind || 'p';
    const before = o.before || 0, after = o.after || 0;
    const hs = o.lines || (kind === 'p' ? [o.h ?? 10] : []);
    const ga0 = o.gapAbove || 0;
    const tb = kind === 'tbl' && o.rows ? rowTable(o.rows, y + ga0)
      : null;
    let ly = before;
    const lines = hs.map((h) => {
      const l = {y: ly, h};
      ly += h;
      return l;
    });
    const h = tb ? tb.h : kind === 'p' ? ly + after : (o.h ?? 10);
    const ga = ga0;
    y += ga;
    const it = {id: o.id || 'i' + k, s, kind, y, h, gapAbove: ga,
      gapBelow: o.gapBelow || 0, lines, brPage: o.brPage || null,
      brCol: o.brCol || null,
      breakBefore: !!o.breakBefore, band: 0, refs: o.refs || null,
      keepNext: !!o.keepNext, keepLines: !!o.keepLines,
      widow: o.widow !== false};
    if (tb) Object.assign(it, {rows: tb.rows, tops: tb.tops});
    if (o.tfloat) it.tfloat = o.tfloat;      // (P12.6: a float)
    items.push(it);
    y += h + it.gapBelow;
  });
  const geoms = secs.map((x) => geomOf(x || {}, frame));
  return {items,
    geom: (i) => geoms[i] || null,
    geomTw: (i) => {
      const g = geoms[i];
      return g && {size: {w: g.size.w * 15, h: g.size.h * 15},
        mar: Object.fromEntries(Object.entries(g.mar)
          .map(([k, v]) => [k, v * 15]))};
    },
    sect: (i) => secs[i] || null,
    hdrH: spec.hdrH || zero, ftrH: spec.ftrH || zero,
    reserve: spec.reserve || zero};
}

/** See the header. */
export async function docLayout(body, parts = {}) {
  const doc = await readDocx(await buildDocx({'word/document.xml':
    documentXml(body), ...parts}));
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  return {L, G: galleyOf(L), doc};
}
