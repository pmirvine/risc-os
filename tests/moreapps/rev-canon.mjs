// The revision elements of a main part as comparable: for the
// tracked-changes round trips (rev-roundtrip-corpus, movetext; not a
// test). A no-edit save must write every revision element as read,
// once the normalisation the writer gives every run is applied to
// both sides.
//
//   REV_EL           the local names compared: insertions, deletions,
//                    moves and their range marks, paragraph-mark and
//                    row revisions, the *PrChange elements
//   canonRev(n) -> string  one element: its name, attributes (run
//                    rsids dropped, in name order) and children, a
//                    w:r's text joined with its neighbours' of the
//                    same format and element name (as the model's
//                    runs are)
//   revEls(bytes) -> [string]  every REV_EL element of an XML part,
//                    outermost only, in document order, canonRev'd
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';

const dec = new TextDecoder();
const xmlOf = (b) => parseXml(dec.decode(b).replace(/^﻿/, ''));
const loc = (n) => String(n.name).split(':').pop();
const isEl = (n) => !!n && typeof n === 'object' && !!n.name;

/** See the header. */
export const REV_EL = new Set(['ins', 'del', 'moveFrom', 'moveTo',
  'rPrChange', 'pPrChange', 'tblPrChange', 'trPrChange', 'tcPrChange',
  'tblGridChange', 'sectPrChange', 'numberingChange', 'cellIns',
  'cellDel', 'cellMerge', 'moveFromRangeStart', 'moveFromRangeEnd',
  'moveToRangeStart', 'moveToRangeEnd']);

/** n with the normalisation the writer gives every run: rsid
 *  attributes dropped, attributes in name order. */
function norm(n) {
  if (!isEl(n)) return n;
  const attrs = (n.attrs || []).filter(([k]) => !/^w:rsid/.test(k))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {...n, attrs, children: (n.children || []).map(norm)};
}

/** See the header. */
export function canonRev(n0) {
  const n = norm(n0);
  const kids = [];
  for (const c of n.children || []) {
    if (!isEl(c) || loc(c) !== 'r') {
      kids.push(isEl(c) ? canonRev(c) : c);
      continue;
    }
    const rPr = c.children.find((k) => isEl(k) && loc(k) === 'rPr');
    const key = rPr ? serialize(rPr) : '';
    for (const k of c.children) {
      if (k === rPr || !isEl(k)) continue;
      if (/^(t|delText)$/.test(loc(k))) {
        const t = k.children.filter((x) => typeof x === 'string')
          .join('');
        const last = kids[kids.length - 1];
        if (last && last.t !== undefined && last.key === key &&
          last.tag === loc(k)) last.t += t;
        else kids.push({key, tag: loc(k), t});
      } else kids.push({key, el: serialize(k)});
    }
  }
  return JSON.stringify([n.name, n.attrs, kids]);
}

/** See the header. */
export function revEls(bytes) {
  if (!bytes) return [];
  const out = [];
  const walk = (n) => {
    if (!isEl(n)) return;
    if (REV_EL.has(loc(n))) {
      out.push(canonRev(n));
      return;
    }
    for (const c of n.children || []) walk(c);
  };
  walk(xmlOf(bytes).root);
  return out;
}
