// Text operations on an EditDocument, ported from RISC_OSLib txtmisc.c (RISC OS 3.71):
// paragraph formatting (wordwrap / Format text), Expand tabs, CR<->LF, indent region, goto line.
// All functions are pure document edits; callers deal with carets, titles and undo separation.

const NL = 10;

/** txtmisc_paraend: is index i the end of a paragraph? */
export function paraEnd(doc, i) {
  const n = doc.length;
  if (n <= i) return true;
  if (doc.charAt(i) !== NL) return false;
  if (i === 0) return true;
  if (doc.charAt(i - 1) === NL) return true;
  if (n === i + 1) return true;
  const ch = doc.charAt(i + 1);
  return ch === NL || ch === 32 || ch === 46;
}

/** txtmisc_eop: end of the paragraph containing i. */
export function eop(doc, i) {
  while (!paraEnd(doc, i)) i = doc.eol(i + 1);
  return i;
}

/**
 * txtmisc_normalisepara: from the start of the line containing `dot` to the end of the paragraph,
 * turn spaces into newlines (and newlines into spaces) so that no line exceeds `width` characters.
 * Only single characters are swapped, so text indices are unchanged. Returns true if modified.
 */
export function normalisePara(doc, dot, width) {
  if (!width) return false;
  const start = doc.bol(dot);
  let end = start;
  while (!paraEnd(doc, end)) end++;
  const c = [];
  for (let k = start; k < end; k++) c.push(doc.charAt(k));
  const max = c.length;
  let at = 0, col = 0, lo = max, hi = 0;
  const white = (x) => x === NL || x === 32;
  for (;;) {
    while (at < max && !white(c[at])) { at++; col++; }
    while (at < max && white(c[at])) { at++; col++; }
    if (at >= max) break;
    let nextwhite = at;
    while (nextwhite < max && !white(c[nextwhite])) nextwhite++;
    const nextwhitecol = col + nextwhite - at;
    at--;
    if (nextwhitecol > width) {
      if (c[at] === 32) { c[at] = NL; lo = Math.min(lo, at); hi = Math.max(hi, at + 1); }
    } else if (c[at] === NL) { c[at] = 32; lo = Math.min(lo, at); hi = Math.max(hi, at + 1); }
    if (c[at] === NL) col = 0;
    at++;
  }
  if (lo >= hi) return false;
  doc.replace(start + lo, hi - lo, String.fromCharCode(...c.slice(lo, hi)));
  return true;
}

/**
 * txtedit_donormalisepara (Format text, ^F6): format the paragraph at/after the caret.
 * Returns the new caret position (the start of the following line).
 */
export function formatParagraph(doc, dot, width) {
  if (dot === 0 || doc.charAt(dot - 1) === NL) while (dot < doc.length && doc.charAt(dot) === NL) dot++;
  normalisePara(doc, dot, width);
  return Math.min(doc.length, 1 + eop(doc, dot));
}

/** txtmisc_expandtabs: replace every TAB with spaces to the next multiple of 8 columns. Returns new dot. */
export function expandTabs(doc, dot) {
  const t = doc.text;
  if (!t.includes('\t')) return dot;
  let out = '', col = 0, newDot = dot;
  for (let i = 0; i < t.length; i++) {
    const ch = t.charCodeAt(i);
    if (ch === NL) { out += '\n'; col = 0; continue; }
    if (ch === 9) {
      const n = 8 - (col % 8);
      out += ' '.repeat(n);
      if (i < dot) newDot += n - 1;
      col += n;
      continue;
    }
    out += t[i]; col++;
  }
  doc.replace(0, t.length, out);
  return newDot;
}

/** txtmisc_exchangecrlf: swap all CR and LF characters (not undoable, like the original). */
export function exchangeCRLF(doc) {
  const t = doc.text;
  if (!/[\r\n]/.test(t)) return false;
  const out = t.replace(/[\r\n]/g, (m) => (m === '\n' ? '\r' : '\n'));
  doc.replace(0, t.length, out, { undo: false });
  doc.clearUndo();
  return true;
}

/**
 * txtmisc_indentregion: indent every non-blank line of [from, to). by > 0: insert the first `by`
 * characters of `withStr`; by < 0: delete up to -by characters from each line start.
 * Returns {start, end} of the adjusted region (for re-selecting).
 */
export function indentRegion(doc, from, to, by, withStr) {
  if (from !== 0) from = doc.eol(doc.bol(from - 1)) + 1;
  to = Math.min(to, doc.length);
  if (by === 0) return null;
  const cby = by > 0 ? Math.min(by, withStr.length) : 0;
  const del = by > 0 ? 0 : -by;
  const ins = withStr.slice(0, cby);
  const start = from;
  while (from < to) {
    if (doc.charAt(from) !== NL) {
      const linelen = doc.eol(from) - from;
      const d1 = Math.min(del, linelen);
      doc.replace(from, d1, ins);
      to += cby - d1;
    }
    from = doc.eol(from) + 1;
  }
  return { start, end: to };
}

/** txtmisc_gotoline: index of the start of line l (1-based); past the end = end of text. */
export function lineStart(doc, l) {
  if (l <= 1) return 0;
  return doc.lineStart(l);
}
