// Shared by the round-trip tests (edit-roundtrip.test.mjs,
// format-roundtrip.test.mjs): open a .docx, change it with !Word's
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
//   unchanged document was written as.
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
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {assertSameDoc, expectedBack, sameBytes, sameTree}
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

const errs = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/**
 * Open bytes, change(d, seed, {every}) -> stats, check (see the
 * header). Returns {refused: code} when the reader refuses the file,
 * else {...stats, blocks, schema}.
 */
export async function roundTrip(bytes, what, seed, change,
  {xsd = null, every} = {}) {
  let a;
  try {
    a = await readDocx(bytes);
  } catch (e) {
    if (e instanceof DocxError) return {refused: e.code};
    throw e;
  }
  const out0 = await write(a);
  const before = structuredClone(a.sections);
  const d = new Document(a);
  const st = await change(d, seed, {every});
  // the changed model round-trips
  const out1 = await write(d.doc);
  assertSameDoc(await readDocx(out1), expectedBack(d.doc),
    what + ' (changed, seed ' + seed + ')');
  // no package error the original did not have
  const z = await readZip(out1);
  const had = new Set(errs(await readZip(bytes)));
  assert.deepEqual(errs(z).filter((k) => !had.has(k)), [],
    what + ': package errors added');
  // no schema error in the main part the original did not have
  let schemaDone = 'skipped';
  const main = d.doc.meta.mainPart;
  const orig = xsd && main ? (await readZip(bytes)).get(main) : null;
  if (orig && z.get(main)) {
    if (!schemaOf.has(bytes)) schemaOf.set(bytes, xsd.errors(orig));
    const was = schemaOf.get(bytes);
    const added = [...xsd.errors(z.get(main))].filter((m) => !was.has(m));
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
    assertSameDoc(await readDocx(outU), await readDocx(out0),
      what + ': undone and written');
    assert.fail(what + ': undone, written: bytes differ');
  }
  const blocks = d.doc.sections.reduce((n, s) => n + s.blocks.length, 0);
  return {...st, blocks, schema: schemaDone};
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

export const EXPECTED = JSON.parse(readFileSync(join(HERE,
  'corpus-expected.json'), 'utf8'));
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
export async function corpusRun(files, change, xsd, xsdNote, label) {
  const failures = [], times = [], capped = [];
  let ok = 0, refused = 0, blocks = 0, checked = 0;
  const totals = {};
  for (const f of files) {
    const name = nameOf(f);
    const t0 = Date.now();
    try {
      const res = await roundTrip(readFileSync(f), name, hash(name),
        change, {xsd});
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
  if (Object.keys(totals).length)
    console.log('# commands: ' + JSON.stringify(totals));
  if (capped.length) console.log('# capped: ' + capped.join('; '));
  console.log('# slowest: ' + times.slice(0, 5)
    .map(([ms, n]) => `${n} ${ms} ms`).join('; '));
  for (const x of failures) console.log('# FAIL ' + x);
  assert.deepEqual(failures, []);
}
