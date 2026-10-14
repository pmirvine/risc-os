// Test-only: the real-font oracle's scoring over a live document
// (word-pages-oracle.mjs runs this function's source in the page,
// as it does causeOf's; final fix B F2-I3).
//
//   liveStarts(L, P, doc, causeOf, ourStarts) -> {word, ours, pages}
//       L the document's layout, P its finished Pages (P.G its
//       galley), doc the document; causeOf and ourStarts are
//       pagestarts.mjs's (passed in: the function is
//       self-contained, it closes over nothing). word: Word's
//       starts ([{line, cause}], pagestarts.mjs wordStarts and
//       placesOf, ported to the live document); ours: our starts
//       by pagestarts.mjs ourStarts itself ([{line}]), so a column
//       start counts as in pages-corpus.test.mjs: ONE rule (P5.1,
//       R10). The score is scoreStarts(ours, word), in Node.

/** See the header. */
export function liveStarts(L, P, doc, causeOf, ourStarts) {
  const G = P.G;
  const base = [];
  let n = 0;
  const rowsOf = (it) => (it.kind === 'tbl' && it.rows &&
    it.rows.length ? it.rows.length : 1);
  for (const it of L.items) {
    base.push(n);
    n += it.lines && it.lines.length ? it.lines.length : rowsOf(it);
  }
  const lineOf = (it, off) => {
    let k = 0;
    while (k + 1 < it.lines.length && it.lines[k + 1].from <= off) k++;
    return k;
  };
  // {k, line} of a position: its root item and line (a cell's: its
  // table, the row its line is in)
  const placeOf = (pos) => {
    const it = L.byId.get(pos.id);
    if (!it) return null;
    if (G.items[it.ci] === it) {
      return {k: it.ci, line: it.kind === 'p' && it.lines ?
        lineOf(it, pos.off) : 0};
    }
    let lo = 0, hi = G.items.length - 1, r = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (G.items[m].index <= it.index) {
        r = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    if (r < 0) return null;
    const t = G.items[r];
    const ln = it.kind === 'p' && it.lines && it.lines.length ?
      it.lines[lineOf(it, pos.off)] : null;
    const y = it.y + (ln ? ln.y : 0);
    let row = 0;
    if (t.kind === 'tbl' && t.rows) {
      while (row + 1 < t.rows.length && t.rows[row + 1].y <= y) row++;
    }
    return {k: r, line: row};
  };
  const word = [], seen = new Set();
  const add = (id, off) => {
    if (seen.has(id + ':' + off)) return;
    seen.add(id + ':' + off);
    const c = placeOf({id, off});
    word.push({line: c ? base[c.k] + c.line : NaN, cause: causeOf(G, c)});
  };
  let first = true;
  const local = (nd) => String(nd && nd.name || '').replace(/^.*:/, '');
  const visit = (blocks, depth) => {
    for (const b of blocks || []) {
      if (!b || b.type !== 'p') {
        if (b && b.type === 'tbl') {
          for (const row of b.rows || []) {
            for (const c of row.cells || []) visit(c.blocks, depth + 1);
          }
        }
        if (!depth) first = false;
        continue;
      }
      const marks = Object.entries(b.inlines || {})
        .filter(([, x]) => x && x.kind === 'raw' &&
          local(x.node) === 'lastRenderedPageBreak')
        .map(([k]) => Number(k)).sort((x, y) => x - y);
      const it = !depth && L.byId.get(b.id);
      if (!depth && !first && it && G.items[it.ci] === it &&
        G.facts(it.ci).breakBefore) add(b.id, 0);
      for (const off of marks) add(b.id, off);
      if (!depth) first = false;
    }
  };
  for (const s of doc.sections) visit(s.blocks, 0);
  const ours = ourStarts(P, L.items, base).map((s) => ({line: s.line}));
  return {word, ours, pages: P.count};
}
