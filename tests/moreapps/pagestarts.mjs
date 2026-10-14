// The page-start oracle (spec D7): where Word broke the pages of a
// file it saved, to compare with where !Letters breaks them.
//
//   wordStarts(doc) -> [{id, off}]  the page starts Word recorded, in
//       document order: every w:lastRenderedPageBreak (a raw inline:
//       the start is at its offset, at any depth, in tables too), and
//       every top-level paragraph after the first block with page break
//       before (direct or from its style; Word ignores it in a table
//       cell) at offset 0. A position is listed once (Word marks a
//       paragraph with page break before as well). Starts of pages
//       2..n only: page 1 has none.
//   matchStarts(ours, word, tolLines = 1) -> {matched, total}
//       how many of Word's starts one of ours matches, each of ours
//       used once. When both carry `line` (the index of the galley
//       line the position is on, worked out by the caller: P2.4),
//       a match is within tolLines lines; otherwise the same id and
//       offset. total is word.length.
//   lineBase(items) -> [n]  the galley line index of each root
//       item's first line (lines counted from the first item; a
//       table: one line a row, P4.1; a block without lines: one
//       line)
//   ourStarts(P, items, base) -> [{id, off, line}]  where our pages
//       2..n start (Pages P, finished as far as wanted), and, on a
//       page with columns (pg.cols, P10.1), where each column after
//       its first starts (Word records a lastRenderedPageBreak at a
//       column's start too: columns2.docx, 51 in 18 pages of 3
//       columns): the start cursor's item and the offset of its
//       line (0 for a block or a table: its line is the start's
//       row); blank pages and the empty page after a final page
//       break (P2.4) are left out. pagesOnly: page starts alone
//       (the score before columns were counted, P10 fix M2)
//   onLines(G, base, starts) -> the starts with `line` added: the
//       galley line of the position (./PageFind placeOf: a cell's
//       position is on its row's line); one not in the galley
//       is left as it was (it matches nothing with a line)
//   causeOf(G, c) -> why Word's start at galley place c ({k, line}:
//       ./PageFind placeOf's, or null) is there: 'columns' (its
//       section has columns), 'table/block' (in a table or block, or
//       not in the galley), 'forced' (after a page break, page break
//       before, a section that starts a page) or 'natural'.
//       Self-contained (word-pages-oracle.mjs runs its source in the
//       page): it reads G.items, G.facts, G.geom and G.sect only
//   placesOf(G, base, starts) -> the starts with `line` (as onLines;
//       NaN when not in the galley) and `cause` (causeOf)
//   scoreStarts(ours, word) -> {matched, total, starts, causes,
//       ours, unmatched}
//       THE scoring rule of both oracles (pages-corpus.test.mjs and
//       word-pages-oracle.mjs; P5.1, review P3 M5): Word's starts
//       ([{line, cause}], document order) are counted once per
//       galley line (a table's row is a line: the cells of one row,
//       and a page break before with a lastRenderedPageBreak a few
//       zero-width inlines on, are one start), the first on a line
//       giving the cause; a start not in the galley (line not
//       finite) counts on its own and matches nothing. Each is then
//       matched, in document order, by the first of ours ([{line}])
//       within one line not used yet (each of ours used once).
//       total: the starts counted; starts: Word's list as given;
//       causes {cause: [matched, total]}, tallied inside the match,
//       so they add up to matched and total; ours: how many starts
//       of ours there were, unmatched: how many of them matched
//       none of Word's (the score never counts against extra starts
//       of ours, so these are printed and pinned beside it: P10 fix
//       M2)
//   madeByWord(path) -> false for every file in corpus/handoff (the
//       real-Word hand-off files: our generators or !Letters wrote them,
//       and which are present depends on the generators this machine
//       ran), so the pin is hermetic: it scores only the fetched
//       corpus (P5.3)
//
// Test helper only (not on the disc).
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {localName} from '../../tools/moreapps/!Letters/Kinds';
import {resolvePara} from '../../tools/moreapps/!Letters/Styles';
import {placeOf} from '../../tools/moreapps/!Letters/PageFind';

/** See the header. */
export const madeByWord = (path) =>
  !/[\\/]corpus[\\/]handoff[\\/]/.test(path);

/** See the header. */
export function wordStarts(doc) {
  const out = [], seen = new Set();
  let first = true;
  const add = (id, off) => {
    const k = `${id}:${off}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({id, off});
  };
  if (!doc || !Array.isArray(doc.sections)) return out;
  forEachBlock(doc, (b, at, depth) => {
    const top = depth === 0;
    if (!b || b.type !== 'p') {
      if (top) first = false;
      return;
    }
    const marks = Object.entries(b.inlines || {})
      .filter(([, x]) => x && x.kind === 'raw' &&
        localName(x.node) === 'lastRenderedPageBreak')
      .map(([k]) => Number(k)).sort((x, y) => x - y);
    if (top && !first &&
      resolvePara(doc.styles, b).pageBreakBefore === true) {
      add(b.id, 0);
    }
    for (const off of marks) add(b.id, off);
    if (top) first = false;
  });
  return out;
}

/** See the header. */
export function matchStarts(ours, word, tolLines = 1) {
  const free = [...(ours || [])];
  let matched = 0;
  for (const w of word || []) {
    const i = free.findIndex((o) =>
      Number.isFinite(o.line) && Number.isFinite(w.line)
        ? Math.abs(o.line - w.line) <= tolLines
        : o.id === w.id && o.off === w.off);
    if (i < 0) continue;
    matched++;
    free.splice(i, 1);
  }
  return {matched, total: (word || []).length};
}

const nLines = (it) => (it.lines && it.lines.length ? it.lines.length
  : it.kind === 'tbl' && it.rows && it.rows.length ? it.rows.length
    : 1);

/** See the header. */
export function lineBase(items) {
  const out = [];
  let n = 0;
  for (const it of items) {
    out.push(n);
    n += nLines(it);
  }
  return out;
}

/** See the header. */
export function ourStarts(P, items, base, pagesOnly = false) {
  const out = [];
  P.list.forEach((pg, i) => {
    if (pg.blank) return;
    const cs = pg.cols && !pagesOnly ? pg.cols.map((c) => c.start)
      : [pg.start];
    cs.forEach((c, j) => {
      const it = items[c.k];
      if (!it || (i === 0 && j === 0)) return;
      const ln = it.lines && it.lines[c.line];
      out.push({id: it.id, off: ln ? ln.from : 0,
        line: base[c.k] + c.line});
    });
  });
  return out;
}

/** See the header. */
export function onLines(G, base, starts) {
  return starts.map((w) => {
    const c = placeOf(G, w);
    return c ? {...w, line: base[c.k] + c.line} : w;
  });
}

/** See the header. */
export function causeOf(G, c) {
  if (!c) return 'table/block';
  const items = G.items, it = items[c.k], f = G.facts(c.k);
  if ((G.geom(it.s).cols || []).length > 1) return 'columns';
  if (it.kind !== 'p') return 'table/block';
  if (c.line > 0) {
    return (f.brPage || []).includes(c.line - 1) ? 'forced' : 'natural';
  }
  const pr = items[c.k - 1];
  if (!pr) return 'natural';
  const pb = G.facts(c.k - 1).brPage || [];
  return f.breakBefore || pb.includes((pr.lines || []).length - 1) ||
    (pr.s !== it.s && G.sect(it.s).type !== 'continuous') ? 'forced'
    : 'natural';
}

/** See the header. */
export function placesOf(G, base, starts) {
  return starts.map((w) => {
    const c = placeOf(G, w);
    return {...w, line: c ? base[c.k] + c.line : NaN,
      cause: causeOf(G, c)};
  });
}

/** See the header. */
export function scoreStarts(ours, word) {
  const lines = new Set(), counted = [];
  for (const w of word || []) {
    if (Number.isFinite(w.line)) {
      if (lines.has(w.line)) continue;
      lines.add(w.line);
    }
    counted.push(w);
  }
  const free = [...(ours || [])], causes = {};
  let matched = 0;
  for (const w of counted) {
    const c = causes[w.cause] || (causes[w.cause] = [0, 0]);
    c[1]++;
    const i = Number.isFinite(w.line) ? free.findIndex((o) =>
      Math.abs(o.line - w.line) <= 1) : -1;
    if (i < 0) continue;
    matched++;
    c[0]++;
    free.splice(i, 1);
  }
  return {matched, total: counted.length,
    starts: (word || []).length, causes, ours: (ours || []).length,
    unmatched: free.length};
}
