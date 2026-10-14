// Test-only: a real table split across pages for the Print layout
// table tests (Batch D P4.2, D8, PG8-PG10, PG35): read from XML,
// laid out with the fake measurer at 1000 px, in Print layout.
//
//   splitTable({rows, tall, heads, centre}) -> {L, P, Pl, t, tallRow}
//     a paragraph, then a 2-column table with single borders: `heads`
//     header rows (tblHeader, text 'H<r>'), then `rows` rows of one
//     line ('r<r>a', 'r<r>b'); row `tallRow` (when tall > 0) holds
//     `tall` paragraphs ('t<j>') in its first cell and, when centre,
//     one vAlign center paragraph 'mid' in its second; P finished
//   cellItem(L, text) -> the cell paragraph item whose text is text
//   pieceFrags(Pl, t) -> [{i, f}] the table's fragments, page by page
import {docLayout} from './page-fixtures.mjs';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';

const B = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right',
  'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" ` +
  'w:sz="8" w:space="0" w:color="000000"/>').join('') +
  '</w:tblBorders>';
const P = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const tc = (body, pr = '') => '<w:tc><w:tcPr><w:tcW w:w="3000" ' +
  `w:type="dxa"/>${pr}</w:tcPr>${body}</w:tc>`;

/** See the header. */
export async function splitTable({rows = 60, tall = 0, heads = 1,
  centre = false, tallRow = 3} = {}) {
  let x = '<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/>' + B +
    '</w:tblPr><w:tblGrid><w:gridCol w:w="3000"/>' +
    '<w:gridCol w:w="3000"/></w:tblGrid>';
  for (let r = 0; r < heads; r++) {
    x += '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + tc(P('H' + r)) +
      tc(P('H' + r + 'b')) + '</w:tr>';
  }
  for (let r = 0; r < rows; r++) {
    if (tall && r === tallRow) {
      const ps = Array.from({length: tall}, (_, j) => P('t' + j))
        .join('');
      x += '<w:tr>' + tc(ps) + tc(P(centre ? 'mid' : 'r' + r + 'b'),
        centre ? '<w:vAlign w:val="center"/>' : '') + '</w:tr>';
      continue;
    }
    x += '<w:tr>' + tc(P('r' + r + 'a')) + tc(P('r' + r + 'b')) +
      '</w:tr>';
  }
  x += '</w:tbl>';
  const {L} = await docLayout(P('before') + x + P('after'));
  const Pp = new Pages(galleyOf(L));
  L.place = PlacePrint(L, Pp);
  L.layout(1000);
  Pp.finish();
  const t = L.items.find((it) => it.kind === 'tbl');
  return {L, P: Pp, Pl: L.place, t, tallRow: heads + tallRow};
}

/** See the header. */
export function cellItem(L, text) {
  for (const it of L.byId.values()) {
    if (it.kind === 'p' && it.para && it.para.text === text) return it;
  }
  return null;
}

/** See the header. */
export function tableFrags(Pl, t) {
  const out = [];
  for (let i = 0; Pl.pages.at(i); i++) {
    const f = Pl.pageFrags(i).find((x) => x.it === t);
    if (f) out.push({i, f});
  }
  return out;
}

// ---- (P4 fix wave) documents built from XML, every cell line
//
//   X  XML helpers: tc(body, pr, w), tr(cells, trPr), tbl(rows, cols,
//      w), paras(n, tag, pPr) (n paragraphs of long text 'tag<i> ...'),
//      uparas(n, tag, words) (n paragraphs of words 'tag<i>w<j>': each
//      line's text unique)
//   printDoc(body) -> {L, P, Pl}  body (the inside of w:body, an A4
//      section added) laid out with the fake measurer at 1000 px in
//      Print layout, P finished
//   cellLines(L, t) -> [{it, k, r, c, u}]  every line of every
//      paragraph directly in a cell of root table t: row r, cell c
//      (row.cells index), unit u (./PageCells: a line each, one for
//      any other item), counted by walking the cell's items
//   unitPages(Pl, t) -> (r, c, u) -> page | null  the page unit u of
//      cell c of row r of t is shown on, from the fragments' r0..r1,
//      from and cuts
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar ' +
  'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
  'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
const text = (i) => ('word lorem ipsum dolor sit amet ' + i).repeat(6);

export const X = {
  tc: (body, pr = '', w = 4000) => `<w:tc><w:tcPr><w:tcW w:w="${w}" ` +
    `w:type="dxa"/>${pr}</w:tcPr>${body}</w:tc>`,
  tr: (cells, pr = '') => '<w:tr>' + (pr ? `<w:trPr>${pr}</w:trPr>`
    : '') + cells.join('') + '</w:tr>',
  tbl: (rows, cols, w = 4000) => '<w:tbl><w:tblPr><w:tblW w:w="0" ' +
    'w:type="auto"/>' + B + '</w:tblPr><w:tblGrid>' +
    Array(cols).fill(`<w:gridCol w:w="${w}"/>`).join('') +
    '</w:tblGrid>' + rows.join('') + '</w:tbl>',
  paras: (n, tag = 'l', pPr = '') => Array.from({length: n}, (_, i) =>
    `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r><w:t>` +
    `${text(tag + i)}</w:t></w:r></w:p>`).join(''),
  // (every word its own: tag<i>w<j>, so each line's text is unique)
  uparas: (n, tag = 'u', words = 24) => Array.from({length: n},
    (_, i) => '<w:p><w:r><w:t>' + Array.from({length: words}, (_, j) =>
      `${tag}${i}w${j}`).join(' ') + '</w:t></w:r></w:p>').join(''),
  P,
};

/** See above. */
export async function printDoc(body) {
  const {L} = await docLayout(body + SECT);
  const Pp = new Pages(galleyOf(L));
  L.place = PlacePrint(L, Pp);
  L.layout(1000);
  Pp.finish();
  return {L, P: Pp, Pl: L.place};
}

/** See above. */
export function cellLines(L, t) {
  const out = [];
  t.rows.forEach((row, r) => row.cells.forEach((c, ci) => {
    if (c.cont || !c.col) return;
    let u = 0;
    for (const x of c.col.items) {
      if (x.kind === 'p' && x.lines && x.lines.length) {
        x.lines.forEach((_, k) => out.push({it: x, k, r, c: ci,
          u: u++}));
      } else u++;
    }
  }));
  return out;
}

/** See above. */
export function unitPages(Pl, t) {
  const fs = tableFrags(Pl, t);
  return (r, c, u) => {
    for (const {i, f} of fs) {
      if (r < f.r0 || r >= f.r1) continue;
      const lo = f.from && r === f.r0 ? f.from[c] : 0;
      const hi = f.cuts && r === f.r1 - 1 ? f.cuts[c] : Infinity;
      if (u >= lo && u < hi) return i;
    }
    return null;
  };
}

// ---- painting recorded (moved from tblpagepaint.test.mjs) and
// every cell line checked (tblpage-lines.test.mjs)
//
//   clipG(), painted(S, i), bars(g), near(ys, y, tol): see below
//   frameOf(S, i) -> {y0, y1}  page i's frame on the sheet
//   misplaced(S, t, lines?) -> [text]  each cell line of t not on
//      the page whose fragment shows its unit, or outside its frame

/** A 2D context recording, in device space (translate and clip
 *  followed), the texts drawn inside the clip and the fillRects. */
export function clipG() {
  const texts = [], fills = [], stack = [];
  let tx = 0, ty = 0, clip = [-Infinity, -Infinity, Infinity, Infinity];
  let path = null;
  const props = {};
  const t = {texts, fills,
    save: () => stack.push([tx, ty, clip, props.fillStyle]),
    restore: () => { [tx, ty, clip, props.fillStyle] = stack.pop(); },
    translate: (x, y) => { tx += x; ty += y; },
    beginPath: () => { path = null; },
    rect: (x, y, w, h) => { path = [x + tx, y + ty, x + tx + w, y + ty + h]; },
    clip: () => {
      if (path) {
        clip = [Math.max(clip[0], path[0]), Math.max(clip[1], path[1]),
          Math.min(clip[2], path[2]), Math.min(clip[3], path[3])];
      }
    },
    fillText: (s, x, y) => {
      const X = x + tx, Y = y + ty;
      if (Y >= clip[1] && Y <= clip[3] && X >= clip[0] - 1 &&
        X < clip[2]) texts.push([s, X, Y]);
    },
    fillRect: (x, y, w, h) => {
      const a = Math.max(y + ty, clip[1]), b = Math.min(y + ty + h, clip[3]);
      if (b > a) fills.push([props.fillStyle, x + tx, a, w, b - a]);
    },
    measureText: (s) => ({width: 6 * s.length}),
  };
  return new Proxy(t, {
    get: (o, k) => (k in o ? o[k] : k in props ? props[k] : () => {}),
    set: (o, k, v) => { props[k] = v; return true; },
  });
}

/** Page i of S painted: the recorder. */
export function painted(S, i) {
  const g = clipG();
  paintPage(S.P, i, g, {place: S.Pl});
  return g;
}

/** Horizontal border bars (black, wider than 300 px) at device y. */
export const bars = (g) => g.fills.filter(([s, , , w, h]) =>
  /^#0{6}$/i.test(String(s)) && w > 300 && h < 4).map((f) => f[2]);
export const near = (ys, y, tol = 2.5) => ys.some((v) => Math.abs(v - y) <= tol);

/** The frame of page i on the sheet: {y0, y1}. */
export function frameOf(S, i) {
  const r = S.Pl.sheet.rect(S.P.at(i)), fr = S.P.at(i).frames[0];
  return {y0: r.y + fr.y, y1: r.y + fr.y + fr.h};
}

/** Each line of each cell of table t in S: its page and place (see
 *  the header); the misplaced ones as text. */
export function misplaced(S, t, lines = cellLines(S.L, t)) {
  const pageOf = unitPages(S.Pl, t), bad = [];
  for (const {it, k, r, c, u} of lines) {
    const want = pageOf(r, c, u), q = S.Pl.lineAt(it, k);
    const tag = `${it.para.text.slice(0, 40)}#${k} (r${r} c${c} u${u})`;
    if (want === null) {
      bad.push(`${tag}: on no page`);
      continue;
    }
    if (q.page !== want) {
      bad.push(`${tag}: page ${q.page}, shown on ${want}`);
      continue;
    }
    const of = S.P.ofPos({id: it.id, off: it.lines[k].from});
    if (of !== want) bad.push(`${tag}: ofPos ${of}, shown on ${want}`);
    const fr = frameOf(S, want), h = it.lines[k].h;
    if (q.y < fr.y0 - 0.5 || q.y + h > fr.y1 + 0.5) {
      bad.push(`${tag}: y ${q.y} outside ${fr.y0}..${fr.y1}`);
    }
  }
  return bad;
}


/** Every line of every paragraph directly in a cell of a table of
 *  S's layout (merged cells too): placed on a page (lineAt) inside
 *  its frame, drawn there once (its text at its place, and no text
 *  of a cell line drawn twice over the pages), hit back. -> [text]
 *  of what is wrong. */
export function shownOnce(S) {
  const bad = [], pg = new Map(), count = new Map();
  const texts = (i) => {
    if (!pg.has(i)) pg.set(i, painted(S, i).texts);
    return pg.get(i);
  };
  for (let i = 0; i < S.P.count; i++) {
    for (const [s] of texts(i)) count.set(s, (count.get(s) || 0) + 1);
  }
  for (const it of S.L.byId.values()) {
    if (it.kind !== 'p' || it.col === S.L.root || !it.lines) continue;
    it.lines.forEach((ln, k) => {
      if (!(ln.to > ln.from)) return;
      const tag = `${it.para.text.slice(0, 12)}#${k}`;
      const q = S.Pl.lineAt(it, k);
      if (q.page === null) return bad.push(`${tag}: no page`);
      const o = S.Pl.sheet.rect(S.P.at(q.page)), fr = frameOf(S, q.page);
      if (q.y < fr.y0 - 0.5 || q.y + ln.h > fr.y1 + 0.5) {
        return bad.push(`${tag}: outside page ${q.page}'s frame`);
      }
      const top = q.y - o.y, x = q.x - o.x;
      const here = texts(q.page).filter(([s, tx, ty]) => ty >= top &&
        ty <= top + ln.h + 1 && Math.abs(tx - x) < 40 &&
        it.para.text.includes(s.trim()));
      if (here.length !== 1) {
        return bad.push(`${tag}: drawn ${here.length} times on page ` +
          q.page);
      }
      if (count.get(here[0][0]) !== 1) {
        bad.push(`${tag}: its text drawn ${count.get(here[0][0])} ` +
          'times over the pages');
      }
      const h = S.L.hitTest(q.x + 3, q.y + ln.h / 2);
      const got = h && S.L.locate(h.pos).item;
      if (got !== it) bad.push(`${tag}: hit ${got && got.id}`);
    });
  }
  return bad;
}
