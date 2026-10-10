// Test-only helpers for the .docx writer tests: comparing documents,
// unpacking written files, finding real .docx files on this machine.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {isDeepStrictEqual, inspect} from 'node:util';
import {statSync, readFileSync, writeFileSync, existsSync}
  from 'node:fs';
import {tmpdir} from 'node:os';
import {join, basename} from 'node:path';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {sortChildren} from '../../tools/moreapps/!Word/Order';
import {NS} from '../../tools/moreapps/!Word/Wml';
import {repairs} from '../../tools/moreapps/!Word/PartTypes';
import {findPart} from '../../tools/moreapps/!Word/Rels';
import {sectPrNode, hasProps} from '../../tools/moreapps/!Word/WriteProps';
import {docScope} from '../../tools/moreapps/!Word/WriteBody';
import {readSect} from '../../tools/moreapps/!Word/ReadSect';
import {deepEqual, newPara} from '../../tools/moreapps/!Word/Model';

// the Default types ./WriteParts gives an extension it adds (its
// BY_EXT, which it does not export)
const BY_EXT = {png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff',
  tiff: 'image/tiff', svg: 'image/svg+xml', emf: 'image/x-emf',
  wmf: 'image/x-wmf', xml: 'application/xml',
  bin: 'application/vnd.openxmlformats-officedocument.oleObject',
  odttf: 'application/vnd.openxmlformats-officedocument.' +
    'obfuscatedFont'};

/**
 * Put the `extra` nodes of a property object in the order the
 * writer's contract gives them (Order.sortChildren: schema order,
 * extension elements in one slot before the *Change element, other
 * unknown nodes behind the known node before them). The writer puts
 * the extra nodes before the fields, so read back they come in
 * exactly this order.
 */
function sortExtra(o, parent) {
  if (!o || !Array.isArray(o.extra)) return;
  o.extra = sortChildren(parent, o.extra);
}

/**
 * A copy of `doc` in canonical form: paragraph ids 0, 1, 2...; the
 * extra nodes of pPr/rPr/section props in the order of the
 * documented contract (files from Word already are);
 * [Content_Types].xml first in zipOrder (the writer puts it first).
 */
export function canon(doc) {
  const d = structuredClone(doc);
  let k = 0;
  for (const s of d.sections) {
    sortExtra(s.props, 'sectPr');
    if (s.raw) s.raw = {...s.raw, children: sortChildren('sectPr',
      s.raw.children)};
    for (const b of s.blocks) {
      if (b.type !== 'p') continue;
      b.id = k++;
      sortExtra(b.pPr, 'pPr');
      for (const r of b.runs) sortExtra(r.rPr, 'rPr');
    }
  }
  const z = d.meta.zipOrder;
  if (z) {
    const i = z.indexOf('[Content_Types].xml');
    if (i > 0) z.unshift(...z.splice(i, 1));
  }
  return d;
}

/** The styles of a table without the original XML (for comparing). */
export function styleFields(t) {
  return {
    docDefaults: t.docDefaults,
    defaults: t.defaults,
    styles: [...t.styles.values()].map(({raw, ...s}) => s),
  };
}

/**
 * Assert that `got` (read back from what the writer wrote for
 * `want`) equals `want`, both canonical. A document whose styles
 * were generated (no styles part in the file) gets a styles part
 * when written: then the styles must agree field by field and the
 * additions (part, relationship, content type) are taken out first.
 */
export function assertSameDoc(got, want, what = '') {
  const g = canon(got);
  const w = canon(want);
  if (w.meta.stylesGenerated && !g.meta.stylesGenerated) {
    assert.deepEqual(styleFields(g.styles), styleFields(w.styles),
      what + ': generated styles');
    const name = g.meta.stylesPart;
    assert.ok(name, what + ': a styles part was written');
    g.styles = w.styles;
    delete g.meta.stylesPart;
    g.meta.stylesGenerated = true;
    g.meta.prolog.delete(name);
    const main = w.meta.mainPart;
    const dir = main.slice(0, main.lastIndexOf('/') + 1);
    const relsName = dir + '_rels/' + main.slice(dir.length) + '.rels';
    g.meta.zipOrder = g.meta.zipOrder.filter((n) => n !== name &&
      (n !== relsName || w.meta.zipOrder.includes(n)));
    // (unless the file already had an Override for the missing part)
    if (!w.meta.contentTypes.overrides.some(([n]) => n === '/' + name)) {
      g.meta.contentTypes.overrides = g.meta.contentTypes.overrides
        .filter(([n]) => n !== '/' + name);
    }
    const tail = name.slice(name.lastIndexOf('/') + 1);
    g.rels = g.rels.filter((r) => !(r.type.endsWith('/styles') &&
      r.target.endsWith(tail) && !w.rels.some((x) => x.id === r.id)));
  }
  // bytes compared quickly (deepEqual on big arrays is very slow)
  assert.deepEqual([...g.parts.keys()], [...w.parts.keys()], what);
  for (const [n, b] of w.parts) {
    assert.ok(sameBytes(g.parts.get(n), b), what + ': part ' + n);
  }
  g.parts = w.parts = null;
  sameTree(g, w, what);
}

/**
 * assert.deepEqual for big models: when they differ, the message is
 * short and names the first difference by its path. (Node's own
 * message is util.inspect of both whole values plus a diff of the
 * two texts, which for a big document takes seconds and gigabytes.)
 */
export function sameTree(got, want, what = '') {
  if (isDeepStrictEqual(got, want)) return;
  const at = firstDiff(got, want, 'doc');
  throw new assert.AssertionError({message: `${what}: differs at ` +
    `${at.path}:\n  got  ${brief(at.got)}\n  want ${brief(at.want)}`});
}

const brief = (v) => {
  let s;
  try { s = inspect(v, {depth: 2, breakLength: Infinity}); }
  catch (e) { s = String(v); }
  return s.length > 300 ? s.slice(0, 300) + '...' : s;
};

/** The first place where a and b differ (a and b differ). */
function firstDiff(a, b, path) {
  for (;;) {
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b ||
      Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
      return {path, got: a, want: b};
    }
    let next = null;
    if (a instanceof Map) {
      const ka = [...a.keys()], kb = [...b.keys()];
      if (!isDeepStrictEqual(ka, kb)) {
        return {path: path + ' keys', got: ka, want: kb};
      }
      for (const k of ka) {
        if (!isDeepStrictEqual(a.get(k), b.get(k))) {
          next = [a.get(k), b.get(k), `${path}.get(${inspect(k)})`];
          break;
        }
      }
    } else {
      // (key order does not matter to isDeepStrictEqual: nor here)
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      if (!isDeepStrictEqual(ka, kb)) {
        return {path: path + ' keys', got: ka, want: kb};
      }
      for (const k of ka) {
        if (!isDeepStrictEqual(a[k], b[k])) {
          const step = Array.isArray(a) ? `[${k}]` : `.${k}`;
          next = [a[k], b[k], path + step];
          break;
        }
      }
    }
    if (!next) return {path, got: a, want: b};
    [a, b, path] = next;
  }
}

/** True when two byte arrays hold the same bytes. */
export const sameBytes = (a, b) => a !== undefined && b !== undefined &&
  Buffer.from(a.buffer, a.byteOffset, a.length)
    .equals(Buffer.from(b.buffer, b.byteOffset, b.length));

/** Map name -> bytes of a written file. */
export const entries = (bytes) => readZip(bytes);

/** Map name -> parsed root (or the XmlError) of every XML entry. */
export async function xmlEntries(bytes) {
  const out = new Map();
  const dec = new TextDecoder('utf-8', {fatal: true});
  for (const [n, b] of await readZip(bytes)) {
    if (!/\.(xml|rels)$/i.test(n)) continue;
    out.set(n, parseXml(dec.decode(b)));
  }
  return out;
}

/** The text of one entry. */
export async function entryText(bytes, name) {
  const z = await readZip(bytes);
  const b = z.get(name);
  return b ? new TextDecoder().decode(b) : undefined;
}

const SYSTEM = ['/Applications', '/System/Library', '/Library',
  '/usr/share'];

/**
 * The folders searched for real .docx files: none unless
 * MOREAPPS_REAL_DOCX=1; then the system folders (SYSTEM: never the
 * home folder) and the folders in MOREAPPS_REAL_DOCX_DIRS
 * (colon-separated). The corpus test and the fixtures cover real
 * files without this.
 */
export function realDocxRoots(env = process.env, {system = true} = {}) {
  if (env.MOREAPPS_REAL_DOCX !== '1') return [];
  const dirs = String(env.MOREAPPS_REAL_DOCX_DIRS || '').split(':')
    .filter(Boolean);
  return [...(system ? SYSTEM : []), ...dirs];
}

let found = null;
const CACHE = join(tmpdir(), 'moreapps-real-docx.txt');
const DAY = 24 * 3600 * 1000;

/** .docx files under `roots` (at most 80; Word lock files left out). */
function findDocx(roots) {
  if (!roots.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile('find', [...roots, '-name', '*.docx'],
      {maxBuffer: 1 << 24, timeout: 300000},
      (err, stdout) => {
        resolve((stdout || '').split('\n')
          .filter((f) => f && !basename(f).startsWith('~$'))
          .slice(0, 80));
      });
  });
}

/**
 * Real .docx files on this machine (read only), in the folders of
 * realDocxRoots: none unless MOREAPPS_REAL_DOCX=1. With the default
 * folders the list is kept for a day in the system's temporary
 * directory (moreapps-real-docx.txt there; delete it to search
 * again), never in the repository.
 */
export function realDocxFiles(env = process.env, opts = {}) {
  const roots = realDocxRoots(env, opts);
  const plain = env === process.env && opts.system !== false;
  if (!plain) return findDocx(roots);
  if (found) return found;
  if (!roots.length) return (found = Promise.resolve([]));
  try {
    const c = JSON.parse(readFileSync(CACHE, 'utf8'));
    if (Date.now() - statSync(CACHE).mtimeMs < DAY &&
      JSON.stringify(c.roots) === JSON.stringify(roots)) {
      found = Promise.resolve(c.list.filter((f) => existsSync(f)));
      return found;
    }
  } catch (e) {
    // no cache yet
  }
  found = findDocx(roots).then((list) => {
    try {
      writeFileSync(CACHE, JSON.stringify({roots, list}));
    } catch (e) {
      // the cache is only a convenience
    }
    return list;
  });
  return found;
}

/**
 * The documented normalisations of the writer, applied to a model
 * `doc` read from a file: what reading back what it wrote must give
 * (the w namespace declared on the root; known parts typed
 * application/xml get their own type; a part nothing types gets
 * application/octet-stream).
 */
export function expectedBack(doc) {
  const d = structuredClone(doc);
  const at = d.meta.documentRoot.attrs;
  if (!at.some(([n]) => n === 'xmlns:w')) at.push(['xmlns:w', NS.w]);
  // a document that gained section properties (a break made the last
  // section one with a w:type) has its sectPr written at the body's
  // end (WriteBody.placeOf) and reads back as having one there
  const ls = d.sections[d.sections.length - 1];
  if (ls && !d.meta.bodySectPr && !ls.raw && hasProps(ls.props)) {
    d.meta.bodySectPr = true;
  }
  const {map} = docScope(d);
  // a section whose props no longer read as its raw sectPr (a section
  // break command gave it a type) is written from its props with the
  // raw node's name and attributes: that node reads back. Only those:
  // every other raw sectPr is compared as it is.
  // (a section with no raw node that is written anyway, a break's
  // copy of a section that had none, reads back with the node)
  d.sections.forEach((s, k) => {
    const written = s.raw || k < d.sections.length - 1 ||
      d.meta.bodySectPr || hasProps(s.props);
    if (s.raw ? !deepEqual(readSect(s.raw, map), s.props) : written)
      s.raw = sectPrNode(s, map);
  });
  // a section that ends with a kept block (a table: Delete at its end
  // removed the empty paragraph that carried the section's break) is
  // written with an empty paragraph to carry its sectPr
  // (WriteBody.bodyNode), which reads back as a block of its own
  d.sections.forEach((s, k) => {
    const last = s.blocks[s.blocks.length - 1];
    if (k < d.sections.length - 1 && (!last || last.type !== 'p')) {
      s.blocks.push(newPara(''));
    }
  });
  // a br made by editing (no node: a page break) reads back with the
  // <w:br w:type="..."/> the writer wrote for it
  for (const s of d.sections) {
    for (const b of s.blocks) {
      if (b.type !== 'p') continue;
      for (const x of Object.values(b.inlines)) {
        if (x.kind === 'br' && (x.node === undefined || x.node === null)) {
          x.node = {name: 'w:br', attrs: [['w:type', x.brType]],
            children: []};
        }
      }
    }
  }
  // a known part typed application/xml gets its own type (PartTypes)
  const {defaults, overrides} = d.meta.contentTypes;
  const m = d.meta;
  const names = new Map([...d.parts.keys(), m.mainPart, m.stylesPart,
    m.numberingPart, m.settingsPart].filter(Boolean).map((n) => [n, 1]));
  const fix = repairs(m.contentTypes, [['', m.packageRels],
    [m.mainPart, d.rels]], (n) => findPart(names, n));
  for (const [n, t] of fix) {
    const o = overrides.find(([q]) => q.toLowerCase() === '/' +
      n.toLowerCase());
    if (o) o[1] = t; else overrides.push(['/' + n, t]);
  }
  // the writer types a part nothing covers: a Default for its
  // extension (./WriteParts BY_EXT), else an Override
  for (const n of d.parts.keys()) {
    const leaf = n.slice(n.lastIndexOf('/') + 1);
    const e = leaf.includes('.') ? leaf.slice(leaf.lastIndexOf('.') + 1)
      .toLowerCase() : null;
    if (overrides.some(([p]) => p.toLowerCase() === '/' +
      n.toLowerCase()) || (e && defaults.some(([x]) =>
      x.toLowerCase() === e))) continue;
    if (e) defaults.push([e, BY_EXT[e] || 'application/octet-stream']);
    else overrides.push(['/' + n, 'application/octet-stream']);
  }
  return d;
}

/**
 * `want` (from expectedBack) for a document that GAINED a styles or
 * numbering part since it was opened (ListMake makes a numbering part
 * and the List Paragraph style): the writer records the new part in
 * the zip order, the content types, the prolog and the relationships
 * as it writes. These are taken from `got` (what was read back) after
 * checking they are only additions: every entry `want` has is in
 * `got` in the same order, the extra parts are the styles and
 * numbering parts or parts `want.parts` holds (a picture's media),
 * and the extra relationships are a styles or a numbering one to
 * such an added part. Anything else stays for
 * assertSameDoc to find.
 */
export function withNewParts(want, got) {
  want = withWrittenStyles(want, got);
  const w = want.meta, g = got.meta;
  // (a styles part written for generated styles: assertSameDoc's own
  // rule, which takes it out of `got`, so it is not added to `want`)
  const skip = w.stylesGenerated ? g.stylesPart : null;
  const ctFirst = (z) => {
    const i = z.indexOf('[Content_Types].xml');
    return i > 0 ? [z[i], ...z.slice(0, i), ...z.slice(i + 1)] : z;
  };
  const wz = ctFirst(w.zipOrder);
  const extra = g.zipOrder.filter((n) => !wz.includes(n) && n !== skip);
  if (!extra.length) return want;
  // (a document with no relationships gets its rels part)
  const main = w.mainPart;
  const relsName = main.slice(0, main.lastIndexOf('/') + 1) + '_rels/' +
    main.slice(main.lastIndexOf('/') + 1) + '.rels';
  const allowed = [g.stylesPart, g.numberingPart, relsName]
    .filter(Boolean);
  // (a part the model holds that the file had not: a picture's media
  // put in by a command, Batch B)
  const held = (n) => want.parts instanceof Map && want.parts.has(n);
  if (!extra.every((n) => allowed.includes(n) || held(n))) return want;
  const inOrder = (a, b) => {
    let at = 0;
    return a.every((x) => {
      while (at < b.length && !isDeepStrictEqual(b[at], x)) at++;
      return at++ < b.length;
    });
  };
  const out = structuredClone(want);
  const o = out.meta;
  const zip = g.zipOrder.filter((n) => n !== skip);
  if (inOrder(wz, zip)) o.zipOrder = zip;
  const ov = g.contentTypes.overrides
    .filter(([n]) => !skip || n !== '/' + skip);
  if (inOrder(w.contentTypes.overrides, ov)) {
    o.contentTypes.overrides = structuredClone(ov);
  }
  for (const n of extra) {
    if (g.prolog.has(n)) o.prolog.set(n, structuredClone(g.prolog.get(n)));
  }
  const tail = skip ? skip.slice(skip.lastIndexOf('/') + 1) : null;
  const rels = got.rels.filter((r) => !(skip &&
    r.type.endsWith('/styles') && r.target.endsWith(tail) &&
    !want.rels.some((x) => x.id === r.id)));
  // the relationships added: only a styles or numbering one, to a
  // part that was added (anything else stays for assertSameDoc)
  const dir = main.slice(0, main.lastIndexOf('/') + 1);
  const partOf = (t) => typeof t !== 'string' ? null
    : t.startsWith('/') ? t.slice(1) : t.includes('..') ? null : dir + t;
  const newRel = (r) => !want.rels.some((x) => isDeepStrictEqual(x, r));
  const okRel = (r) => /\/(styles|numbering)$/.test(r.type) &&
    !r.mode && extra.includes(partOf(r.target)) &&
    (r.type.endsWith('/styles') ? partOf(r.target) === g.stylesPart
      : partOf(r.target) === g.numberingPart);
  if (inOrder(want.rels, rels) && rels.filter(newRel).every(okRel)) {
    out.rels = structuredClone(rels);
  }
  return out;
}

/**
 * A style added by a command (List Paragraph, ./ListMake) has no
 * original XML in the model (raw null); read back, it has the node
 * the writer wrote. `want` with that node taken from `got` for those
 * styles (every other field is still compared).
 */
function withWrittenStyles(want, got) {
  const t = want.styles && want.styles.styles;
  if (!(t instanceof Map) || ![...t.values()].some((x) => !x.raw))
    return want;
  const out = structuredClone(want);
  for (const [id, st] of out.styles.styles) {
    const back = got.styles && got.styles.styles.get(id);
    if (!st.raw && back && back.raw) st.raw = structuredClone(back.raw);
  }
  return out;
}
