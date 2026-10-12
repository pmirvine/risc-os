// Test helper for the per-table equivalence of Batch C (D14b, C1.3):
// a w:tbl subtree in canonical form, so that what TblWrite wrote for
// a typed table can be compared with the file's w:tbl.
//
//   canonTbl(node, map) -> a plain tree (name, attrs, children)
//   firstDiff(a, b) -> null, or the path of the first difference
//
// The documented normalisations, and nothing else:
// - a w:p is replaced by its canonical write: paraNode(readPara(p)
//   .para, null, map) (the normalisations every body paragraph has:
//   run rsid attributes dropped, runs of equal format merged, w:t
//   joined, empty pPr / rPr not written, xml:space as the writer
//   puts it, pPr / rPr children in schema order); a w:p ReadPara
//   keeps raw stays as it is;
// - w:tblPr, w:trPr, w:tcPr: children in schema order (WriteProps
//   ordered, Order.sortChildren); an EMPTY w:trPr / w:tcPr is left
//   out (the reader reads none and an empty one alike);
// - white space text between elements is dropped (in w:tbl, w:tr,
//   w:tc, w:tblGrid and below the property containers);
// - a nested w:tbl recursively.
// Element names, attributes and their order, marks, w:tblPrEx and
// every other cell block (an Opaque one: w:sdt...) are compared as
// they are.
import {isEl, blank, scope, wName} from
  '../../tools/moreapps/!Letters/Ns';
import {readPara} from '../../tools/moreapps/!Letters/ReadPara';
import {paraNode} from '../../tools/moreapps/!Letters/WritePara';
import {ordered} from '../../tools/moreapps/!Letters/WriteProps';

const inside = (node, m) => node.attrs.length ? scope(m, node) : m;
const pairs = (node) => node.attrs.map(([n, v]) => [n, v]);

/** A copy without white space text, at every depth. */
function strip(node) {
  if (!isEl(node)) return node;
  return {name: node.name, attrs: pairs(node), children: node.children
    .filter((c) => !(typeof c === 'string' && blank(c))).map(strip)};
}

/** A plain copy of a node (text, comments and all). */
function copy(node) {
  if (!isEl(node)) return node;
  return {name: node.name, attrs: pairs(node),
    children: node.children.map(copy)};
}

const PROPS = new Set(['tblPr', 'trPr', 'tcPr']);

/** A property container: children in schema order, no blanks. */
function props(node, kind, m) {
  const pm = inside(node, m);
  const kids = node.children.filter((c) =>
    !(typeof c === 'string' && blank(c)));
  return {name: node.name, attrs: pairs(node),
    children: ordered(kind, kids, pm).map(strip)};
}

/** One child of w:tbl, w:tr or w:tc in canonical form, or null. */
function child(c, m) {
  const l = wName(c, m);
  if (l === 'tbl') return canonTbl(c, m);
  if (l === 'p') {
    const got = readPara(c, m);
    return got ? copy(paraNode(got.para, null, m)) : copy(c);
  }
  if (l !== null && PROPS.has(l)) {
    const n = props(c, l, m);
    return l !== 'tblPr' && !n.children.length && !n.attrs.length
      ? null : n;
  }
  if (l === 'tr' || l === 'tc') return level(c, m);
  if (l === 'tblGrid') return strip(c);
  return copy(c);
}

/** w:tr or w:tc: its children in canonical form. */
function level(node, map) {
  const m = inside(node, map);
  const children = [];
  for (const c of node.children) {
    if (typeof c === 'string' && blank(c)) continue;
    const n = isEl(c) ? child(c, m) : c;
    if (n !== null) children.push(n);
  }
  return {name: node.name, attrs: pairs(node), children};
}

/** See the header. */
export const canonTbl = (node, map) => level(node, map);

const label = (n, i) => isEl(n) ? `${n.name}[${i}]` : `#text[${i}]`;

/** See the header (a and b canonical trees). */
export function firstDiff(a, b, path = isEl(a) ? a.name : '') {
  const stack = [[a, b, path]];
  while (stack.length) {
    const [x, y, at] = stack.pop();
    if (!isEl(x) || !isEl(y)) {
      if (x !== y) return `${at}: ${short(x)} != ${short(y)}`;
      continue;
    }
    if (x.name !== y.name) return `${at}: ${x.name} != ${y.name}`;
    if (JSON.stringify(x.attrs) !== JSON.stringify(y.attrs)) {
      return `${at}: attributes ${JSON.stringify(x.attrs)} != ` +
        JSON.stringify(y.attrs);
    }
    const n = Math.max(x.children.length, y.children.length);
    for (let i = n - 1; i >= 0; i--) {
      const cx = x.children[i], cy = y.children[i];
      if (cx === undefined || cy === undefined) {
        const has = cx === undefined ? cy : cx;
        return `${at}/${label(has, i)}: only in the ` +
          (cx === undefined ? 'second ' : 'first ') + short(has);
      }
      stack.push([cx, cy, `${at}/${label(cx, i)}`]);
    }
  }
  return null;
}

const short = (v) => {
  const s = JSON.stringify(v);
  return s && s.length > 200 ? s.slice(0, 200) + '...' : s;
};
