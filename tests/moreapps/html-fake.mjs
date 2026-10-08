// Test-only: a small, pure HTML tokenizer that builds a DOM-like tree
// for ClipRead (which is handed `parseHtml` by its caller: DOMParser
// in the browser). Nodes: {nodeType, nodeName, childNodes, data,
// getAttribute}. Like DOMParser it decodes entities (a subset: the
// common named ones and every numeric form), lower-cases names
// (nodeName upper case, as an HTML document gives it), knows void
// elements, raw-text elements (script, style...), comments and
// conditional comments, closes an open <p> when a block starts and
// ignores stray end tags. Iterative: deep nesting and huge input are
// fine.

const NAMED = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', copy: '©', reg: '®', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', bull: '•', euro: '€'};
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col',
  'area', 'base', 'wbr', 'source', 'embed', 'param', 'track']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp',
  'iframe', 'noscript']);
const CLOSES_P = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'ul', 'ol', 'li', 'pre', 'table', 'blockquote', 'hr']);

/** Decode character references. */
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16)
        : parseInt(e.slice(1), 10);
      if (!(n > 0 && n <= 0x10ffff) || (n >= 0xd800 && n <= 0xdfff))
        return '�';
      return String.fromCodePoint(n);
    }
    return Object.hasOwn(NAMED, e) ? NAMED[e] : m;
  });
}

function element(name, attrs) {
  const map = new Map(attrs);
  return {nodeType: 1, nodeName: name.toUpperCase(), childNodes: [],
    getAttribute: (k) => (map.has(k) ? map.get(k) : null)};
}
const text = (data) => ({nodeType: 3, nodeName: '#text', data});
const comment = (data) => ({nodeType: 8, nodeName: '#comment', data});

const ATTR = /\s*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;

/** Parse the attributes of a start tag from `at`; [attrs, end]. */
function attrsAt(html, at) {
  const out = [];
  let i = at;
  for (;;) {
    ATTR.lastIndex = i;
    const m = ATTR.exec(html);
    if (!m) break;
    const v = m[2] ?? m[3] ?? m[4] ?? '';
    out.push([m[1].toLowerCase(), decode(v)]);
    i = ATTR.lastIndex;
  }
  while (i < html.length && /\s/.test(html[i])) i++;
  let self = false;
  if (html[i] === '/') { self = true; i++; }
  const gt = html.indexOf('>', i);
  return [out, gt < 0 ? html.length : gt + 1, self];
}

/** The document node of `html`. */
export function parseHtml(html) {
  const doc = {nodeType: 9, nodeName: '#document', childNodes: []};
  const stack = [doc];
  const names = [''];
  const add = (n) => stack[stack.length - 1].childNodes.push(n);
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { add(text(decode(html.slice(i)))); break; }
    if (lt > i) add(text(decode(html.slice(i, lt))));
    i = lt;
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4);
      const end = e < 0 ? n : e;
      add(comment(html.slice(i + 4, end)));
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const e = html.indexOf('>', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    const close = /^<\/([a-zA-Z][^\s>/]*)\s*>/.exec(html.slice(i, i + 80));
    if (close) {
      const name = close[1].toLowerCase();
      const k = names.lastIndexOf(name);
      if (k > 0) { stack.length = k; names.length = k; }
      i += close[0].length;
      continue;
    }
    const open = /^<([a-zA-Z][^\s>/]*)/.exec(html.slice(i, i + 80));
    if (!open) { add(text('<')); i++; continue; }
    const name = open[1].toLowerCase();
    const [attrs, end, self] = attrsAt(html, i + open[0].length);
    i = end;
    if (CLOSES_P.has(name) && names[names.length - 1] === 'p') {
      stack.pop();
      names.pop();
    }
    const el = element(name, attrs);
    add(el);
    if (RAW.has(name)) {
      const e = html.toLowerCase().indexOf('</' + name, i);
      const stop = e < 0 ? n : e;
      if (stop > i) el.childNodes.push(text(html.slice(i, stop)));
      const gt = e < 0 ? n : html.indexOf('>', e);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (VOID.has(name) || self) continue;
    stack.push(el);
    names.push(name);
  }
  return doc;
}

/** A DOM-like element node made directly (for huge trees). */
export const mkEl = (name, kids = [], attrs = []) => {
  const e = element(name, attrs);
  e.childNodes = kids;
  return e;
};
export const mkText = text;
