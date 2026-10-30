// Shared by the round-trip tests (edit-roundtrip.test.mjs,
// format-roundtrip.test.mjs): open a .docx, change it with !Letters'
// commands, then check
//
// - the model read back equals the changed model (docx-compare's
//   assertSameDoc after expectedBack, as the corpus test compares);
// - the package linter (lint-package.mjs) finds no error the
//   original did not have;
// - xmllint against wml.xsd (tools/moreapps/.cache, as validate.mjs)
//   finds no schema error in the main part the original did not have
//   (skipped when xmllint or the schemas are missing);
// - undoing every change gives back the opened model exactly
//   (paragraph ids included), and writing it gives the very bytes the
//   unchanged document was written as;
// - with {keep: ['numberingPart', ...]} (meta keys naming parts):
//   each such part is written with the very bytes of the unchanged
//   document's (the edits never touch it), and holds the same XML
//   tree as the file as it was opened (parsed: the writer writes its
//   own prolog, line ends and empty tags, so the bytes themselves
//   match the file's only when it was written that way: counted as
//   keptAsRead). When the change reports {grows: true} (it made list
//   definitions), that rule is relaxed for the part: every child of
//   its root in the unchanged write must come back serialized
//   identically and in the same order, the new children only in
//   between and after (counted as grown), and the root's attributes
//   and the order of kinds (numPicBullet, abstractNum, num,
//   numIdMacAtCleanup) kept.
//
// {read} is passed to readDocx as its options. {stories: true} lets
// the bytes of a header / footer part differ from the model's when
// the commands changed that story (the model read back is compared
// all the same: its blocks are part of the document). {notes: true}
// (off by default) lets a note that was edited, moved to the other
// kind or renumbered come back with the element it was written as
// (its children are its blocks, compared; its attributes but w:id
// must be the ones it was read with).
//
// Also the corpus sample (tests/moreapps/corpus, git-ignored): one
// file in ten, chosen by a hash of the name, or every one with
// WORD_EDIT_CORPUS=1.
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync} from 'node:fs';
import {join, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readDocx, DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {lintPackage} from './lint-package.mjs';
import {assertSameDoc, expectedBack, withNewParts, sameBytes, sameTree}
  from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
export const write = (doc) => writeDocx(doc, {date: DATE});
const HERE = fileURLToPath(new URL('./', import.meta.url));
export const CORPUS = join(HERE, 'corpus');

// ------------------------------------------------------------ xmllint

const CACHE = fileURLToPath(new URL('../../tools/moreapps/.cache/',
  import.meta.url));
const NEEDED = ['wml.xsd', 'shared-commonSimpleTypes.xsd',
  'shared-math.xsd', 'shared-relationshipReference.xsd',
  'dml-wordprocessingDrawing.xsd', 'dml-main.xsd'];
const XML_XSD = '<xs:schema xmlns:xs="http://www.w3.org/2001/' +
  'XMLSchema" targetNamespace="http://www.w3.org/XML/1998/namespace">' +
  '<xs:attribute name="space"><xs:simpleType><xs:restriction base=' +
  '"xs:NCName"><xs:enumeration value="default"/><xs:enumeration ' +
  'value="preserve"/></xs:restriction></xs:simpleType>' +
  '</xs:attribute><xs:attribute name="lang" type="xs:language"/>' +
  '</xs:schema>';
const IMPORT = '<xsd:import namespace="http://www.w3.org/XML/1998/' +
  'namespace"/>';

/** A schema checker (as validate.mjs), or a reason it cannot run. */
export function schemaChecker() {
  try {
    execFileSync('xmllint', ['--version'], {stdio: 'ignore'});
  } catch (e) {
    return 'xmllint not found';
  }
  const missing = NEEDED.filter((f) => !existsSync(join(CACHE, f)));
  if (missing.length) return 'not in tools/moreapps/.cache: ' + missing;
  const dir = mkdtempSync(join(tmpdir(), 'edit-rt-xsd-'));
  for (const f of readdirSync(CACHE).filter((n) => n.endsWith('.xsd'))) {
    writeFileSync(join(dir, f), readFileSync(join(CACHE, f), 'utf8')
      .replace(IMPORT, IMPORT.replace('/>', ' schemaLocation="xml.xsd"/>')));
  }
  writeFileSync(join(dir, 'xml.xsd'), XML_XSD);
  const schema = join(dir, 'wml.xsd'), file = join(dir, 'part.xml');
  return {
    /** The set of xmllint's messages (no line numbers) for bytes. */
    errors(bytes) {
      writeFileSync(file, bytes);
      try {
        execFileSync('xmllint', ['--noout', '--nonet', '--schema',
          schema, file], {stdio: 'pipe', maxBuffer: 1 << 28});
        return new Set();
      } catch (e) {
        return new Set(String(e.stderr).split('\n')
          .filter((l) => l && !l.endsWith('fails to validate') &&
            !l.endsWith('validates'))
          .map((l) => l.replace(file + ':', '').replace(/^\d+:\s*/, '')));
      }
    },
    done() { rmSync(dir, {recursive: true, force: true}); },
  };
}

const extOf = new WeakMap();
const EXT = /Element '(\{[^}]*\}[^']*)', attribute '(\{http:\/\/schemas\.microsoft\.com\/[^}]*\}[^']*)': The attribute .* is not allowed/;

/** The element and attribute of an extension "not allowed" message
 * ('{ns}el|{ns}attr'), or null. */
export const extKey = (m) => {
  const x = EXT.exec(m);
  return x ? x[1] + '|' + x[2] : null;
};

/** Every '{ns}el|{ns}attr' pair of Microsoft extension attributes in
 * an XML part's bytes (as extKey names them). */
export function extAttrs(bytes) {
  const out = new Set();
  const walk = (n, map) => {
    if (!n || typeof n !== 'object' || !Array.isArray(n.attrs)) return;
    let m = map;
    for (const [k, v] of n.attrs) {
      if (k !== 'xmlns' && !k.startsWith('xmlns:')) continue;
      if (m === map) m = new Map(map);
      m.set(k === 'xmlns' ? '' : k.slice(6), v);
    }
    const q = (name, dflt) => {
      const i = name.indexOf(':');
      const ns = i < 0 ? (dflt ? m.get('') : '') : m.get(name.slice(0, i));
      return '{' + (ns || '') + '}' + name.slice(i + 1);
    };
    const el = q(n.name, true);
    for (const [k] of n.attrs) {
      if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
      const a = q(k, false);
      if (a.startsWith('{http://schemas.microsoft.com/')) {
        out.add(el + '|' + a);
      }
    }
    for (const c of n.children || []) walk(c, m);
  };
  walk(parseXml(new TextDecoder().decode(bytes)).root, new Map());
  return out;
}

/** {xsd, note}: a checker, or null and why not (once per process). */
export function schema() {
  const x = schemaChecker();
  if (typeof x === 'string') return {xsd: null, note: x};
  process.on('exit', () => x.done());
  return {xsd: x, note: null};
}

// ------------------------------------------------------------ one file

/** The schema errors of an original's main part, by its bytes. */
const schemaOf = new WeakMap();

const dec = new TextDecoder();
/** A part's parsed tree (BOM dropped). */
const xmlOf = (b) => parseXml(dec.decode(b).replace(/^\uFEFF/, ''));

const errs = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

const RANK = {numPicBullet: 0, abstractNum: 1, num: 2,
  numIdMacAtCleanup: 3};
const rankOf = (n) => RANK[String(n.name).replace(/^.*:/, '')] ?? -1;

/**
 * `now` (a numbering root) only adds children to `was`: every one of
 * was's children is in now, serialized as it was and in order, the
 * root's attributes are the same, and (when was's kinds were in the
 * order Word keeps) the kinds stay in that order.
 */
function grownOnly(now, was, what) {
  assert.deepEqual(now.attrs, was.attrs, what + ': root attributes');
  const a = was.children, b = now.children;
  let at = 0;
  for (const [i, kid] of a.entries()) {
    let found = false;
    while (at < b.length && !found) {
      found = JSON.stringify(b[at]) === JSON.stringify(kid);
      at++;
    }
    assert.ok(found, what + ': an original child was changed, moved ' +
      'or lost (child ' + i + ')');
  }
  assert.ok(b.length >= a.length, what + ': children lost');
  const ranks = (x) => x.map(rankOf);
  const sorted = (x) => x.every((v, i) => i === 0 || v >= x[i - 1]);
  if (sorted(ranks(a)) && !ranks(a).includes(-1)) {
    assert.ok(sorted(ranks(b)), what + ': kinds out of order ' +
      ranks(b));
  }
}

/**
 * want (expectedBack of the changed Doc doc, opened with notes0) made
 * comparable with back, the file read back, for the notes parts the
 * changes rewrote (see roundTrip's header; notes: its option).
 */
export function notesBack(want, back, doc, notes0, what,
  notes = false) {
  // (a deletion that took a footnote's or endnote's mark took the
  // note too, ./NoteKeep: that notes part is written anew, its notes
  // compared through the model)
  const np = (doc.meta && doc.meta.noteParts) || {};
  for (const k of ['footnotes', 'endnotes']) {
    const n = np[k], was = notes0 ? notes0[k] : undefined;
    if (typeof n !== 'string' || !doc.notes || doc.notes[k] === was
      || !back.parts.has(n)) continue;
    want.parts.set(n, back.parts.get(n));
    // (a note made in the editor, a paste's copy: ./ClipNotes, has
    // no node and no orig until written: the ones read back)
    const wm = want.notes[k], bm = back.notes[k];
    for (const [id, x] of wm instanceof Map ? wm : []) {
      const y = bm instanceof Map ? bm.get(id) : null;
      if (x.node === null && y) {
        x.node = y.node;
        x.orig = x.blocks;
      } else if (notes && y && x.node && y.node) {
        // ({notes: true}: a note edited, moved to the other kind or
        // given another id keeps the element it was read as for its
        // name and attributes; its children are its blocks, compared
        // in full: the attributes but w:id must be kept)
        const own = (n) => n.attrs.filter(([a]) => a !== 'w:id');
        assert.deepEqual(own(y.node), own(x.node), what + ': ' + k +
          ' ' + id + ' keeps its attributes');
        x.node = y.node;
        x.orig = x.blocks;
      }
    }
    // (the snapshot of the part as read is the new file's: not
    // compared)
    if (want.notes.read && back.notes.read) {
      want.notes.read = {...want.notes.read, [k]: null};
      back.notes.read = {...back.notes.read, [k]: null};
    }
  }
}

/**
 * The comments as a step that removed some writes them (a deletion
 * took their marks: ./CommentKeep, Batch F1): their parts, written
 * anew, are the new file's, compared through the model (the comments
 * that stay are the very ones read); the snapshot of the parts as
 * read and the companions' entries are the new file's. So this
 * does not check the comment parts' bytes: that fidelity rests on
 * comment-roundtrip.test.mjs.
 */
export function commentsBack(want, back, doc, comments0) {
  if (!doc.comments || doc.comments === comments0) return;
  const cp = (doc.meta && doc.meta.commentParts) || {};
  for (const n of Object.values(cp)) {
    if (typeof n === 'string' && back.parts.has(n))
      want.parts.set(n, back.parts.get(n));
  }
  if (want.comments && back.comments) {
    want.comments.read = back.comments.read = null;
    want.comments.raw = back.comments.raw;
    // (a comments part made by a command, ./CommentParts, has no
    // prolog until written)
    if (!comments0 || !comments0.root)
      want.comments.prolog = back.comments.prolog;
    // (a comment made or changed by a command, ./CommentCmd, is
    // written from its fields and blocks: it reads back with its
    // node, its w14:paraId on its last paragraph and none of the
    // fields only the companions keep (durableId, dateUtc): compared
    // by what it says, then taken as read back)
    const wm = want.comments.map, bm = back.comments.map;
    const now = doc.comments.map;
    const was = comments0 && comments0.map instanceof Map
      ? comments0.map : new Map();
    // (each paragraph's text, style, pPr, runs with their rPr and
    // character style, and the kinds of its inlines; extraP holds
    // the written w14:paraId, so it is left out)
    const para = (b) => (b.type !== 'p' ? b.type : {text: b.text,
      pStyle: b.pStyle ?? null, pPr: b.pPr, runs: b.runs.map((u) =>
        [u.start, u.end, u.rPr, u.rStyle ?? null]),
      kinds: Object.entries(b.inlines).map(([k, x]) => [k, x.kind,
        x.level, x.node ? x.node.name : null])});
    const say = (c) => [c.author, c.initials, c.date, c.paraId,
      c.parent, c.done, c.blocks.map(para)];
    for (const [id, x] of wm instanceof Map ? wm : []) {
      const y = bm instanceof Map ? bm.get(id) : null;
      if (!y || (now instanceof Map && now.get(id) === was.get(id)))
        continue;
      assert.deepEqual(say(y), say(x), 'comment ' + id + ' read back');
      wm.set(id, y);
    }
  }
}

/**
 * Open bytes, change(d, seed, {every}) -> stats, check (see the
 * header). Returns {refused: code} when the reader refuses the file,
 * else {...stats, blocks, schema}.
 */
export async function roundTrip(bytes, what, seed, change,
  {xsd = null, every, keep = [], read, stories = false, notes = false}
  = {}) {
  let a;
  try {
    a = await readDocx(bytes, read);
  } catch (e) {
    if (e instanceof DocxError) return {refused: e.code};
    throw e;
  }
  const out0 = await write(a);
  const before = structuredClone(a.sections);
  const notes0 = a.notes, comments0 = a.comments;
  const d = new Document(a);
  const st = await change(d, seed, {every});
  // the changed model round-trips
  const out1 = await write(d.doc);
  const back = await readDocx(out1, read);
  const want = withNewParts(expectedBack(d.doc), back);
  // (a changed story is checked through its blocks, compared in full
  // below; the XML written for it is pinned by the callers' own tests)
  if (stories && want.stories instanceof Map) {
    for (const [n, st] of want.stories) {
      if (back.parts.has(n)) want.parts.set(n, back.parts.get(n));
      const b = back.stories instanceof Map ? back.stories.get(n) : null;
      if (b && 'bytes' in st) st.bytes = b.bytes;
      if (b && 'orig' in st) st.orig = st.blocks;
    }
  }
  notesBack(want, back, d.doc, notes0, what, notes);
  commentsBack(want, back, d.doc, comments0);
  assertSameDoc(back, want, what + ' (changed, seed ' + seed + ')');
  // no package error the original did not have
  const z = await readZip(out1);
  const zin = await readZip(bytes);
  let kept = 0, keptAsRead = 0, grown = 0;
  if (keep.length) {
    const z0 = await readZip(out0);
    for (const k of keep) {
      const name = d.doc.meta[k];
      if (!name) continue;
      if (!z0.get(name)) {
        // a part made by the commands (no original to keep)
        if (z.get(name)) grown++;
        continue;
      }
      if (st && st.grows && !sameBytes(z.get(name), z0.get(name))) {
        grownOnly(xmlOf(z.get(name)).root, xmlOf(z0.get(name)).root,
          what + ': ' + name + ' (seed ' + seed + ')');
        grown++;
        continue;
      }
      assert.ok(sameBytes(z.get(name), z0.get(name)), what + ': ' +
        name + ' bytes changed (seed ' + seed + ')');
      kept++;
      if (sameBytes(z.get(name), zin.get(name))) keptAsRead++;
      else {
        sameTree(xmlOf(z.get(name)), xmlOf(zin.get(name)), what + ': ' +
          name + ' tree changed');
      }
    }
  }
  const had = new Set(errs(zin));
  assert.deepEqual(errs(z).filter((k) => !had.has(k)), [],
    what + ': package errors added');
  // no schema error in the main part the original did not have
  let schemaDone = 'skipped';
  const main = d.doc.meta.mainPart;
  const orig = xsd && main ? (await readZip(bytes)).get(main) : null;
  if (orig && z.get(main)) {
    if (!schemaOf.has(bytes)) schemaOf.set(bytes, xsd.errors(orig));
    const was = schemaOf.get(bytes);
    // (xmllint stops checking a content model at its first error, so
    // an original whose first error hides a later paragraph's w14:
    // attributes reports them only once an edit moves that paragraph
    // up: such a "not allowed" Microsoft attribute is passed over,
    // but only one the opened part already has on that element)
    if (!extOf.has(bytes)) extOf.set(bytes, extAttrs(orig));
    const ext = extOf.get(bytes);
    const added = [...xsd.errors(z.get(main))].filter((m) => !was.has(m) &&
      !ext.has(extKey(m)));
    assert.deepEqual(added.slice(0, 5), [], what + ': schema errors ' +
      'added (seed ' + seed + ')');
    schemaDone = 'checked';
  }
  // undo everything: the opened model, the same bytes
  while (d.undo());
  sameTree(d.doc.sections, before, what + ': undo all (seed ' + seed +
    ')');
  const outU = await write(d.doc);
  if (!sameBytes(outU, out0)) {
    assertSameDoc(await readDocx(outU, read), await readDocx(out0, read),
      what + ': undone and written');
    assert.fail(what + ': undone, written: bytes differ');
  }
  const blocks = d.doc.sections.reduce((n, s) => n + s.blocks.length, 0);
  return {...st, blocks, schema: schemaDone, kept, keptAsRead, grown};
}

// ------------------------------------------------------------ corpus

export const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i),
    16777619);
  return h >>> 0;
};

function find(dir, out = []) {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    const q = join(dir, e.name);
    if (e.isDirectory()) find(q, out);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) {
      out.push(q);
    }
  }
  return out.sort();
}

// (file name -> DocxError code; entries whose value is not a string,
// such as opaqueTables, are not files: R1)
export const EXPECTED = Object.fromEntries(Object.entries(JSON.parse(
  readFileSync(join(HERE, 'corpus-expected.json'), 'utf8')))
  .filter(([, v]) => typeof v === 'string'));
export const ALL = process.env.WORD_EDIT_CORPUS === '1';
/** A file's name in the corpus ('/' separated). */
export const nameOf = (f) => relative(CORPUS, f).split('\\').join('/');
// a deterministic sample (one file in ten, by name) unless
// WORD_EDIT_CORPUS=1 asks for every file
export const corpusFiles = () => (existsSync(CORPUS) ? find(CORPUS)
  : []).filter((f) => ALL || hash(nameOf(f)) % 10 === 0);
export const SKIP_CORPUS = 'tests/moreapps/corpus is missing or ' +
  'empty (optional, git-ignored: run node tools/moreapps-corpus.mjs)';

/**
 * Run roundTrip over files (seeded by name); prints counts, the
 * capped files and the slowest; asserts no failures.
 */
export async function corpusRun(files, change, xsd, xsdNote, label,
  {keep = [], read, stories = false, notes = false} = {}) {
  const failures = [], times = [], capped = [];
  let ok = 0, refused = 0, blocks = 0, checked = 0, kept = 0,
    keptAsRead = 0, grown = 0;
  const totals = {};
  for (const f of files) {
    const name = nameOf(f);
    const t0 = Date.now();
    try {
      const res = await roundTrip(readFileSync(f), name, hash(name),
        change, {xsd, keep, read, stories, notes});
      if (res.refused) {
        refused++;
        if (EXPECTED[name] !== res.refused) {
          failures.push(`${name}: refused (${res.refused}), expected ` +
            (EXPECTED[name] || 'to read'));
        }
      } else {
        ok++;
        blocks += res.blocks;
        if (res.schema === 'checked') checked++;
        kept += res.kept;
        keptAsRead += res.keptAsRead;
        grown += res.grown;
        if (res.capped) capped.push(`${name} (${res.steps} steps)`);
        for (const [k, n] of Object.entries(res.counts || {}))
          totals[k] = (totals[k] || 0) + n;
      }
    } catch (e) {
      failures.push(`${name}: ${e.name} ` +
        String(e.message).split('\n').slice(0, 3).join(' | ')
          .slice(0, 400));
    }
    times.push([Date.now() - t0, name]);
  }
  times.sort((x, y) => y[0] - x[0]);
  console.log(`# ${label}${ALL ? '' : ' (sample; ' +
    'WORD_EDIT_CORPUS=1 for all)'}: ${files.length} files, ${ok} ok, ` +
    `${refused} refused by the reader, ${failures.length} failures, ` +
    `${blocks} blocks, ${checked} main parts schema-checked` +
    (xsdNote ? ` (schema check skipped: ${xsdNote})` : ''));
  if (keep.length) {
    console.log(`# kept parts (${keep}): ${kept} byte-identical to ` +
      `the unedited write, ${keptAsRead} also to the file as read, ` +
      `${grown} only grown (originals kept in order)`);
  }
  if (Object.keys(totals).length)
    console.log('# commands: ' + JSON.stringify(totals));
  if (capped.length) console.log('# capped: ' + capped.join('; '));
  console.log('# slowest: ' + times.slice(0, 5)
    .map(([ms, n]) => `${n} ${ms} ms`).join('; '));
  for (const x of failures) console.log('# FAIL ' + x);
  assert.deepEqual(failures, []);
}
