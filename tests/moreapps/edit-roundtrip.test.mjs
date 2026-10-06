// Editing round trip: documents edited with !Word's real editing
// commands (./Edit, ./EditDel: typing with emoji, accents, combining
// marks, tabs and line breaks; Enter; Backspace and Delete; their
// word forms; deleting and typing over selections, also across
// paragraphs, tables and section breaks; bursts of undo and redo),
// then written and read back:
//
// - the model read back equals the edited model (docx-compare's
//   assertSameDoc after expectedBack, as the corpus test compares);
// - every block passes ModelCheck.checkBlock;
// - the package linter (lint-package.mjs) finds no error the
//   original did not have;
// - xmllint against wml.xsd (tools/moreapps/.cache, as validate.mjs)
//   finds no schema error in the main part the original did not have
//   (skipped when xmllint or the schemas are missing);
// - undoing every edit gives back the opened model exactly
//   (paragraph ids included), and writing it gives the very bytes the
//   unedited document was written as.
//
// Documents: the reader fixtures, a rich generated document
// (edit-rich.mjs), small documents with tables and sections, and
// the files of the optional corpus (tests/moreapps/corpus, git-
// ignored; skipped politely when absent): one in ten, chosen by a
// hash of the name, or every one with WORD_EDIT_CORPUS=1 (about two
// minutes). 50 seeded edits each; a file stops editing after EDIT_MS
// (and says so). A file the reader refuses must be refused with the
// code corpus-expected.json gives. The counts printed depend on the
// files present locally (the real-Word hand-off files in
// corpus/handoff included).
import {describe, it} from 'node:test';
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
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {FIXTURES} from './docx-fixtures.mjs';
import {richDocx} from './edit-rich.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {assertSameDoc, expectedBack, sameBytes, sameTree}
  from './docx-compare.mjs';
import {rng} from './word-docs.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const EDITS = 50;
const EDIT_MS = 4000;
const HERE = fileURLToPath(new URL('./', import.meta.url));
const CORPUS = join(HERE, 'corpus');

// ------------------------------------------------------------ edits

const PIECES = ['a', 'b', ' ', 'word ', '\u00e9', 'e\u0301', '\u0301',
  '\u{1F600}', '\u{1F469}\u200d\u{1F4BB}', '\t', '\n', 'x\ny', '.',
  '\u4e2d\u6587', '<&>"\''];

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pick = (rd, a) => a[Math.floor(rd() * a.length)];

/** A random position in block b (a grapheme boundary, or a box edge). */
function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

/** A random caret, or a selection (often across a few blocks). */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.55) return S.caret(a);
  const far = rd() < 0.15 ? bs.length : 4;
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * far)));
  return S.select(a, posIn(rd, bs[k2]));
}

function randText(rd) {
  let t = '';
  for (let n = 1 + Math.floor(rd() * 3); n > 0; n--) t += pick(rd, PIECES);
  return t;
}

/** One random edit; returns [name, the selection after it]. */
function edit(rd, d, sel) {
  const x = rd();
  if (x < 0.06) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  if (x < 0.36) {
    if (rd() < 0.2) d.breakCoalesce();
    const t = randText(rd);
    const over = rd() < 0.1;
    return ['type', E.typeText(d, sel, t, {key: 'typing',
      overwrite: over})];
  }
  if (x < 0.44) return ['enter', E.splitPara(d, sel)];
  if (x < 0.48) return ['lineBreak', E.lineBreak(d, sel)];
  if (x < 0.52) return ['tab', E.insertTab(d, sel)];
  if (x < 0.64) return ['back', X.deleteBack(d, sel)];
  if (x < 0.74) return ['forward', X.deleteForward(d, sel)];
  if (x < 0.78) return ['wordBack', X.deleteWordBack(d, sel)];
  if (x < 0.82) return ['wordForward', X.deleteWordForward(d, sel)];
  return ['selection', X.deleteSelection(d, sel)];
}

/**
 * EDITS random edits on d. Throws (naming the step) when a command
 * throws or leaves an invalid block (checked after every step when
 * `every`, else at the end). Returns {steps, capped}.
 */
function editAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let sel = null;
  const t0 = Date.now();
  let k = 0;
  for (; k < EDITS; k++) {
    if (Date.now() - t0 > EDIT_MS) break;
    if (!sel || rd() < 0.5) sel = randSel(rd, d);
    let name = '?';
    try {
      [name, sel] = edit(rd, d, sel);
      if (every) for (const b of allBlocks(d)) checkBlock(b);
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${name}): ${e.message}`;
      throw e;
    }
  }
  for (const b of allBlocks(d)) checkBlock(b);
  return {steps: k, capped: k < EDITS};
}

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
function schemaChecker() {
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

// ------------------------------------------------------------ one file

/** The schema errors of an original's main part, by its bytes. */
const schemaOf = new WeakMap();

const errs = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/**
 * Open bytes, edit, check (see the header). Returns {refused: code}
 * when the reader refuses the file, else {steps, capped, blocks,
 * schema}.
 */
async function roundTrip(bytes, what, seed, {xsd = null, every} = {}) {
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
  const st = await editAll(d, seed, {every});
  // the edited model round-trips
  const out1 = await write(d.doc);
  assertSameDoc(await readDocx(out1), expectedBack(d.doc),
    what + ' (edited, seed ' + seed + ')');
  // no package error the original did not have
  const z = await readZip(out1);
  const had = new Set(errs(await readZip(bytes)));
  assert.deepEqual(errs(z).filter((k) => !had.has(k)), [],
    what + ': package errors added');
  // no schema error in the main part the original did not have
  let schema = 'skipped';
  const main = d.doc.meta.mainPart;
  const orig = xsd && main ? (await readZip(bytes)).get(main) : null;
  if (orig && z.get(main)) {
    if (!schemaOf.has(bytes)) schemaOf.set(bytes, xsd.errors(orig));
    const was = schemaOf.get(bytes);
    const added = [...xsd.errors(z.get(main))].filter((m) => !was.has(m));
    assert.deepEqual(added.slice(0, 5), [], what + ': schema errors ' +
      'added (seed ' + seed + ')');
    schema = 'checked';
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
  return {...st, blocks, schema};
}

// ------------------------------------------------------------ documents

const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const doc = (body) => () => buildDocx({'word/document.xml':
  documentXml(body)});
const MORE = [
  ['rich (edit-rich.mjs)', richDocx],
  ['table first', doc(TBL + p(r('after')) + TBL)],
  ['tables only', doc(TBL + TBL + SECT)],
  ['sections, some empty', doc(p(r('one'), SECT) + p('', SECT) +
    p(r('three'), SECT) + p(r('four')) + SECT)],
  ['many short paragraphs', doc(Array.from({length: 60}, (_, i) =>
    p(r('Para ' + i + ' ') + r('bold', '<w:b/>'))).join(''))],
  ['no paragraphs', doc('')],
];

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i),
    16777619);
  return h >>> 0;
};

let xsd = schemaChecker();
const xsdNote = typeof xsd === 'string' ? xsd : null;
if (xsdNote) xsd = null;

describe('editing round trip: generated documents', () => {
  for (const [name, make] of [...FIXTURES, ...MORE]) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        // (the schema check, slow on some fixtures, for one seed)
        await roundTrip(bytes, name, hash(name) + k,
          {xsd: k === 0 ? xsd : null, every: true});
      }
    });
  }
  it('schema check available', {skip: xsdNote || false}, () => {});
});

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
const EXPECTED = JSON.parse(readFileSync(join(HERE,
  'corpus-expected.json'), 'utf8'));
const ALL = process.env.WORD_EDIT_CORPUS === '1';
// a deterministic sample (one file in ten, by name) unless
// WORD_EDIT_CORPUS=1 asks for every file
const files = (existsSync(CORPUS) ? find(CORPUS) : []).filter((f) =>
  ALL || hash(relative(CORPUS, f).split('\\').join('/')) % 10 === 0);

describe('editing round trip: the corpus', {
  skip: files.length ? false : 'tests/moreapps/corpus is missing or ' +
    'empty (optional, git-ignored: run node tools/moreapps-corpus.mjs)',
}, () => {
  it(`50 edits in ${ALL ? 'every' : 'one in ten'} corpus file ` +
    'round-trip; undo restores', async () => {
    const failures = [], times = [], capped = [];
    let ok = 0, refused = 0, blocks = 0, schema = 0;
    for (const f of files) {
      const name = relative(CORPUS, f).split('\\').join('/');
      const t0 = Date.now();
      try {
        const res = await roundTrip(readFileSync(f), name, hash(name),
          {xsd});
        if (res.refused) {
          refused++;
          if (EXPECTED[name] !== res.refused) {
            failures.push(`${name}: refused (${res.refused}), expected ` +
              (EXPECTED[name] || 'to read'));
          }
        } else {
          ok++;
          blocks += res.blocks;
          if (res.schema === 'checked') schema++;
          if (res.capped) capped.push(`${name} (${res.steps} edits)`);
        }
      } catch (e) {
        failures.push(`${name}: ${e.name} ` +
          String(e.message).split('\n').slice(0, 3).join(' | ')
            .slice(0, 400));
      }
      times.push([Date.now() - t0, name]);
    }
    times.sort((x, y) => y[0] - x[0]);
    console.log(`# edited corpus${ALL ? '' : ' (sample; ' +
      'WORD_EDIT_CORPUS=1 for all)'}: ${files.length} files, ${ok} ok, ` +
      `${refused} refused by the reader, ${failures.length} failures, ` +
      `${blocks} blocks, ${schema} main parts schema-checked` +
      (xsdNote ? ` (schema check skipped: ${xsdNote})` : ''));
    if (capped.length) console.log('# edits capped: ' + capped.join('; '));
    console.log('# slowest: ' + times.slice(0, 5)
      .map(([ms, n]) => `${n} ${ms} ms`).join('; '));
    for (const x of failures) console.log('# FAIL ' + x);
    assert.deepEqual(failures, []);
  });
});

process.on('exit', () => xsd && xsd.done());
