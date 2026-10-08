// Documents round trip through !Word's real save path (./DocSave:
// save, saveAsTo, writeTo; the Save box's save for an untitled
// document), not just writeDocx: the desktop services DocSave
// imports from 'riscos' (vfs, wimp, saveAs, reportError) are
// replaced by small stand-ins (a Map for the disc, a Save box whose
// OK is its save callback), and the window by the fields DocSave
// uses. Checked for each document saved:
//
// - save() / saveAsTo() report true, and the document is clean;
// - the file read back equals the document (docx-compare's
//   assertSameDoc after expectedBack);
// - the package linter (lint-package.mjs) finds no error (a corpus
//   file: none the original did not have);
// - xmllint against wml.xsd (tools/moreapps/.cache, as validate.mjs)
//   finds no schema error in the main part (a corpus file: none
//   added), skipped politely when xmllint or the schemas are
//   missing.
//
// Documents: new documents (./NewDoc, A4 and Letter) saved untouched
// and after typing, Enter and Backspace, and saved again (Save after
// Save as); and the corpus sample (tests/moreapps/corpus, git-ignored),
// gated as the other round trips (one file in ten by a hash of the
// name; WORD_EDIT_CORPUS=1 for every file): opened, edited, saved
// with Save to its own path and read back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {newDoc} from '../../tools/moreapps/!Word/NewDoc';
import * as S from '../../tools/moreapps/!Word/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {rng} from './word-docs.mjs';
import {schema, hash, corpusFiles, nameOf, EXPECTED, ALL, SKIP_CORPUS}
  from './roundtrip-lib.mjs';

// ------------------------------------------------------------ 'riscos'

const disc = new Map();                // path -> {bytes, filetype}
const reported = [];
const leaf = (p) => String(p).slice(Math.max(String(p).lastIndexOf('.'),
  String(p).lastIndexOf(':')) + 1);
globalThis.__docStub = {
  wimp: {textInput: null, menus: {isOpen: false}},
  vfs: {
    writeFile(path, bytes, {filetype} = {}) {
      if (!/^RAM::/.test(String(path)) || !leaf(path)) {
        throw new Error('Bad name');
      }
      disc.set(path, {bytes: new Uint8Array(bytes), filetype});
      return path;
    },
    canonical: (p) => String(p),
    leaf,
    exists: (p) => disc.has(p),
  },
  /** A Save box: OK is its save(path) (the core box's writeTo). */
  saveAs(opts) {
    const on = {};
    return {opts, isOpen: false, name: opts.filename,
      setFilename(n) { this.name = n; },
      openCentred() { this.isOpen = true; },
      on(e, fn) { (on[e] ||= []).push(fn); },
      async ok(path) {
        await opts.save(path);
        this.isOpen = false;
        if (opts.onSaved) opts.onSaved(path, {});
      },
      delete() { for (const fn of on.deleted || []) fn(); }};
  },
  reportError: (m) => { reported.push(String(m)); },
};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__docStub;' +
  'export const wimp = s.wimp, vfs = s.vfs;' +
  'export const saveAs = (o) => s.saveAs(o);' +
  'export const reportError = (m, o) => s.reportError(m, o);');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {save, saveAsTo, saveBox, saving, bytesOf} =
  await import('../../tools/moreapps/!Word/DocSave');

// ------------------------------------------------------------ windows

const app = {docs: new Map(), keyOf: (p) => String(p).toLowerCase(),
  recent: [], noteRecent(p) { app.recent.unshift(p); },
  rekey(dw) {
    for (const [k, v] of app.docs) if (v === dw) app.docs.delete(k);
    app.docs.set(dw.path ? app.keyOf(dw.path) : 'untitled:' + dw.n, dw);
  }};
let count = 0;

/** What DocSave uses of a DocWindow (./AppWin). */
function windowFor(doc, path = null) {
  const d = new Document(doc);
  const dw = {app, d, doc, path, n: ++count,
    leaf: path ? leaf(path) : 'Untitled', closed: false,
    boxes: new Map(), title: '',
    view: {comp: null, hasFocus: false, compose() {}, input() {},
      flush() {}, focus() {}},
    retitle() { dw.title = dw.leaf + (d.dirty ? ' *' : ''); },
    saveBytes: () => bytesOf(dw)};
  app.rekey(dw);
  return dw;
}

const PIECES = ['a', 'word ', '\u00e9', '\u{1F600}', '\t', 'x\ny',
  '<&>"\'', '\u4e2d\u6587'];
const blocks = (d) => d.doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');

/** n seeded edits (typing, Enter, Backspace) at paragraph carets. */
function edit(d, seed, n) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  for (let k = 0; k < n; k++) {
    const ps = blocks(d);
    if (!ps.length) break;
    const b = ps[Math.floor(rd() * ps.length)];
    const sel = S.caret({id: b.id, off: Math.floor(rd() *
      (b.text.length + 1))});
    const x = rd();
    if (x < 0.6) t.type(sel, PIECES[Math.floor(rd() * PIECES.length)]);
    else if (x < 0.8) run('enter', d, t, sel);
    else run('backspace', d, t, sel);
  }
}

const {xsd, note: xsdNote} = schema();
const errs = async (bytes) => lintPackage(await readZip(bytes)).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/** The saved file of dw: read back equal, lint and schema clean
 *  (beyond what the original had). */
async function check(dw, what, original = null) {
  const f = disc.get(dw.path);
  assert.ok(f, what + ': no file');
  assert.equal(f.filetype, 0xA7E, what + ': file type');
  assert.equal(dw.d.dirty, false, what + ': still dirty');
  assert.equal(dw.title, dw.leaf, what + ': title');
  assert.equal(saving(dw), false, what + ': still saving');
  assertSameDoc(await readDocx(f.bytes), expectedBack(dw.doc), what);
  const had = new Set(original ? await errs(original) : []);
  assert.deepEqual((await errs(f.bytes)).filter((k) => !had.has(k)),
    [], what + ': package errors');
  const main = dw.doc.meta.mainPart;
  if (!xsd || !main) return false;
  const was = original ? xsd.errors((await readZip(original)).get(main))
    : new Set();
  const added = [...xsd.errors((await readZip(f.bytes)).get(main))]
    .filter((m) => !was.has(m));
  assert.deepEqual(added.slice(0, 5), [], what + ': schema errors');
  return true;
}

describe('documents round trip: new documents saved by DocSave', () => {
  for (const paper of ['a4', 'letter']) {
    it(`a new ${paper} document: untouched, through the Save box`,
      async () => {
        const dw = windowFor(newDoc({paper}));
        const p = save(dw);            // (untitled: the Save box)
        const box = saveBox(dw);
        assert.equal(box.isOpen, true);
        // (the directory of the last file saved, else the hard disc)
        assert.match(box.name,
          /^(ADFS::HardDisc4|RAM::RamDisc0)\.\$\.Untitled$/);
        await box.ok(`RAM::RamDisc0.$.New${paper}`);
        assert.equal(await p, true);
        assert.equal(dw.path, `RAM::RamDisc0.$.New${paper}`);
        assert.ok(app.docs.get(app.keyOf(dw.path)) === dw);
        await check(dw, 'new ' + paper);
      });
    for (const seed of [1, 2, 3]) {
      it(`a new ${paper} document, edited (seed ${seed}), Save as ` +
        'then Save', async () => {
        const dw = windowFor(newDoc({paper}));
        edit(dw.d, seed, 30);
        const to = `RAM::RamDisc0.$.Ed${paper}${seed}`;
        assert.equal(await saveAsTo(dw, to), true);
        await check(dw, `edited ${paper} ${seed}`);
        edit(dw.d, seed + 100, 20);
        assert.equal(dw.d.dirty, true);
        assert.equal(await save(dw), true);
        await check(dw, `edited again ${paper} ${seed}`);
      });
    }
  }
  it('nothing was reported', () => assert.deepEqual(reported, []));
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('documents round trip: the corpus, saved by DocSave', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${ALL ? 'every' : 'one in ten'} corpus file opened, edited, ` +
    'saved with Save and read back', async () => {
    let ok = 0, refused = 0, schemaChecked = 0;
    const failures = [];
    for (const f of files) {
      const name = nameOf(f), bytes = readFileSync(f);
      let doc;
      try {
        doc = await readDocx(bytes);
      } catch (e) {
        if (!(e instanceof DocxError)) throw e;
        refused++;
        if (EXPECTED[name] !== e.code) {
          failures.push(`${name}: refused (${e.code})`);
        }
        continue;
      }
      try {
        const path = 'RAM::RamDisc0.$.C' + hash(name);
        disc.set(path, {bytes, filetype: 0xA7E});
        const dw = windowFor(doc, path);
        edit(dw.d, hash(name), 8);
        assert.equal(await save(dw), true, name + ': Save');
        if (await check(dw, name, bytes)) schemaChecked++;
        disc.delete(path);
        ok++;
      } catch (e) {
        failures.push(`${name}: ${String(e.message).split('\n')
          .slice(0, 3).join(' | ').slice(0, 300)}`);
      }
    }
    console.log(`# documents saved by DocSave${ALL ? '' : ' (sample; ' +
      'WORD_EDIT_CORPUS=1 for all)'}: ${files.length} files, ${ok} ok, ` +
      `${refused} refused by the reader, ${failures.length} failures, ` +
      `${schemaChecked} main parts schema-checked` +
      (xsdNote ? ` (schema check skipped: ${xsdNote})` : ''));
    for (const x of failures) console.log('# FAIL ' + x);
    assert.deepEqual(failures, []);
    assert.deepEqual(reported, []);
  });
});
