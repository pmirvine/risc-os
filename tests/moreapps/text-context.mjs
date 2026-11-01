// The text elements of a saved part, each in the place Word allows:
// for the tests and the hand-off generators (not a test). Word
// writes deleted text in w:delText and every other text, the old
// place of a move too, in w:t; it will not open a file whose
// w:moveFrom holds w:delText (found in real Word, Batch F2).
//
//   misplaced(xml) -> {delText, t}  the counts in a part's XML text
//       of the w:delText with no w:del around it in its paragraph
//       (the w:del, of the main namespace, between it and the
//       nearest w:p above it) and of the w:t with one. Prefixes
//       are resolved through their declarations (transitional or
//       Strict main namespace)
//   newlyMisplaced(xml, was) -> [string]  'delText outside w:del:
//       n (was m)' and 't inside w:del: ...' for each count higher
//       than was's (an original part's XML, or null: none)
//   partsMisplaced(zip, was?) -> [string]  newlyMisplaced for every
//       XML part under word/ of a !WimpLib Zip readZip map (was:
//       the original's, or none), each prefixed by its part name
const W = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main']);
// an element tag (1 '/' for an end, 2 prefix:, 3 local name, 4 the
// attributes, 5 '/' for an empty one); or a comment, CDATA section,
// declaration or processing instruction (no name: skipped)
const TAG = new RegExp('<(\\/?)([A-Za-z_][\\w.-]*:)?' +
  '([A-Za-z_][\\w.-]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*?)(\\/?)>' +
  '|<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<[?!][^>]*>',
  'g');
const DECL = /xmlns(?::([\w.-]+))?\s*=\s*("[^"]*"|'[^']*')/g;
const dec = new TextDecoder();

/** See the header. */
export function misplaced(xml) {
  const got = {delText: 0, t: 0};
  // each open element: {map, w: local name if of W, else null}
  const stack = [];
  let map = new Map();
  for (const m of String(xml).matchAll(TAG)) {
    if (m[3] === undefined) continue;
    if (m[1]) {
      const top = stack.pop();
      if (top) map = top.outer;
      continue;
    }
    let mm = map;
    for (const d of m[4].matchAll(DECL)) {
      if (mm === map) mm = new Map(map);
      mm.set(d[1] || '', d[2].slice(1, -1));
    }
    const pfx = m[2] ? m[2].slice(0, -1) : '';
    const w = W.has(mm.get(pfx)) ? m[3] : null;
    if (w === 'delText' || w === 't') {
      let inDel = false;
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].w === 'p') break;
        if (stack[k].w === 'del') {
          inDel = true;
          break;
        }
      }
      if (w === 'delText' && !inDel) got.delText++;
      if (w === 't' && inDel) got.t++;
    }
    if (!m[5]) {
      stack.push({outer: map, w});
      map = mm;
    }
  }
  return got;
}

/** See the header. */
export function newlyMisplaced(xml, was) {
  const a = misplaced(xml);
  const b = was === null || was === undefined ? {delText: 0, t: 0}
    : misplaced(was);
  const out = [];
  if (a.delText > b.delText) out.push('delText outside w:del: ' +
    a.delText + ' (was ' + b.delText + ')');
  if (a.t > b.t) out.push('t inside w:del: ' + a.t + ' (was ' + b.t +
    ')');
  return out;
}

const text = (b) => (b ? dec.decode(b) : null);

/** See the header. */
export function partsMisplaced(zip, was = null) {
  const out = [];
  for (const [name, bytes] of zip) {
    if (!/^word\/.*\.xml$/.test(name)) continue;
    const old = was ? text(was.get(name)) : null;
    for (const k of newlyMisplaced(text(bytes), old)) {
      out.push(name + ': ' + k);
    }
  }
  return out;
}
