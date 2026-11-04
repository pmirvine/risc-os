// ODT import over the corpus (task 9): every .odt under
// tests/moreapps/corpus (git-ignored, optional: the tests skip when
// it is missing; see tools/moreapps-corpus.mjs for the real files
// from the LibreOffice repository and tools/moreapps-convert.mjs for
// the LibreOffice-made twins of the .docx corpus in converted/odt).
//
//   - each opens (readOdt) without a throw other than an expected
//     ImportError, without a "could not be read" note (a handler
//     that threw), in under 5 s; one whose content.xml holds text
//     reads to a document with text;
//   - the round trip: the Doc read, written by DocxWrite and read
//     back by readDocx, has the same text, paragraph, table, list
//     paragraph, comment and picture counts (./odt-corpus.mjs
//     statsOf), and no package errors (lint-package);
//   - SAMPLE (20 documents, chosen for their variety) go to emit()
//     for the real-Word check (word-emit.mjs, tools/word-open-check).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {odtFiles, nameOf, statsOf, hasText} from './odt-corpus.mjs';

const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const FILES = odtFiles();
const SKIP = FILES.length ? false : 'tests/moreapps/corpus has no ' +
  '.odt (optional, git-ignored: run node tools/moreapps-corpus.mjs ' +
  'and tools/moreapps-convert.mjs)';

/** Files refused on purpose: name -> ImportError code. (None: the
 *  one non-standard package, htmlexport/data/HTMLImage.odt with
 *  its mimetype entry not first, is read since task 9.) */
const REFUSED = {};

/** For the real-Word check: real LibreOffice documents (fields,
 *  frames, tables, CJK, bullets, comments on pictures) and twins
 *  with comments, tracked changes, notes, text boxes, big tables. */
const SAMPLE = [
  'libreoffice-odt/cjk/data/tdf101729.odt',
  'libreoffice-odt/globalfilter/data/SimpleTOC.odt',
  'libreoffice-odt/htmlexport/data/HTMLImage.odt',
  'libreoffice-odt/htmlexport/data/URLs.odt',
  'libreoffice-odt/layout/data/TextBoxFrame.odt',
  'libreoffice-odt/mailmerge/data/10-testing-addresses-writer.odt',
  'libreoffice-odt/odfimport/data/BibliographyEntryField.odt',
  'libreoffice-odt/txtexport/data/bullets.odt',
  'libreoffice-odt/unowriter/data/image-comment-at-char.odt',
  'libreoffice-odt/ww8export/data/cell-bg-color.odt',
  'converted/odt/poi/delins.odt',
  'converted/odt/poi/bug56075-changeTracking_on.odt',
  'converted/odt/poi/form_footnotes.odt',
  'converted/odt/poi/shapes-with-text.odt',
  'converted/odt/poi/60316.odt',
  'converted/odt/open-xml-sdk/O15Conformance/WD/CommentExTest/' +
    'Comments-Sample-15-12-01/Comment033.odt',
  'converted/odt/open-xml-sdk/v2FxTestFiles/ForTestCase/comment.odt',
  'converted/odt/open-xml-sdk/v2FxTestFiles/wordprocessing/' +
    'complexDocx/complexity.odt',
  'converted/odt/open-xml-sdk/v2FxTestFiles/wordprocessing/table/' +
    '2007.odt',
  'converted/odt/libreoffice/docbookexport/data/tdf91095.odt',
];

/** Whether any paragraph (in cells too) has a character that is not
 *  white space or an item's mark (a link's text: statsOf). */
function anyText(doc) {
  const stack = doc.sections.flatMap((s) => s.blocks);
  while (stack.length) {
    const b = stack.pop();
    if (b.type === 'tbl') {
      for (const r of b.rows) for (const c of r.cells) stack.push(...c.blocks);
    } else if (b.type === 'p' && [...b.text].some((c) => c !== OBJ &&
      c.trim())) return true;
  }
  return false;
}

// (each file read once; both tests use the results)
let readAll = null;
async function results() {
  if (readAll) return readAll;
  readAll = [];
  for (const f of FILES) {
    const name = nameOf(f);
    const bytes = new Uint8Array(fs.readFileSync(f));
    const t0 = Date.now();
    let r = null, err = null;
    try {
      r = await readOdt(bytes, {date: DATE});
    } catch (e) {
      err = e;
    }
    readAll.push({name, bytes, r, err, ms: Date.now() - t0});
  }
  return readAll;
}

describe('ODT corpus', {skip: SKIP}, () => {
  it('every .odt opens without a throw or a hang, with its text',
    async () => {
      const failures = [];
      let ok = 0, refused = 0;
      const all = await results();
      for (const {name, bytes, r, err, ms} of all) {
        if (ms > 5000) failures.push(`${name}: ${ms} ms`);
        if (err) {
          if (err.name === 'ImportError' && REFUSED[name] === err.code) {
            refused++;
          } else {
            failures.push(`${name}: ${err.name} ${err.code || ''} ` +
              String(err.message).slice(0, 200));
          }
          continue;
        }
        if (REFUSED[name]) failures.push(`${name}: expected a refusal`);
        const broke = r.notes.find((n) => /could not be read/.test(n));
        if (broke) failures.push(`${name}: ${broke}`);
        if (!anyText(r.doc) && !statsOf(r.doc).text &&
          await hasText(bytes)) {
          failures.push(`${name}: its text was not read`);
        }
        ok++;
      }
      all.sort((p, q) => q.ms - p.ms);
      console.log(`# odt corpus: ${all.length} files, ${ok} read, ` +
        `${refused} refused as expected, ${failures.length} failures; ` +
        'slowest: ' + all.slice(0, 3).map((x) => `${x.name} ${x.ms} ms`)
        .join('; '));
      assert.deepEqual(failures, []);
    });

  it('round-trips through DocxWrite and readDocx with the same text ' +
    'and blocks', async () => {
    const failures = [];
    let n = 0, emitted = 0;
    const want = new Set(SAMPLE);
    for (const {name, r} of await results()) {
      if (!r) continue;
      let bytes, back;
      try {
        bytes = await writeDocx(r.doc, {date: DATE});
        back = await readDocx(bytes);
      } catch (e) {
        failures.push(`${name}: ${e.name} ${String(e.message)
          .slice(0, 200)}`);
        continue;
      }
      n++;
      if (want.has(name)) {
        emitted++;
        emit('odt-corpus-' + path.basename(name, '.odt'), bytes,
          {stem: 'odt-corpus-' + name});
      }
      const errors = lintPackage(await readZip(bytes)).problems
        .filter((q) => q.level === 'error').map((q) => q.message || q);
      if (errors.length) {
        failures.push(`${name}: package errors ${JSON.stringify(
          errors.slice(0, 3))}`);
      }
      const a = statsOf(r.doc), b = statsOf(back);
      for (const k of ['text', 'paras', 'tables', 'lists', 'comments',
        'pictures']) {
        if (a[k] !== b[k]) {
          failures.push(`${name}: ${k} ` + (k === 'text'
            ? `${a.text.length} -> ${b.text.length} characters`
            : `${a[k]} -> ${b[k]}`));
        }
      }
    }
    console.log(`# odt round trip: ${n} documents, ${failures.length} ` +
      `differences; ${emitted} of the ${SAMPLE.length} sampled here`);
    const names = new Set(FILES.map(nameOf));
    assert.equal(emitted, SAMPLE.filter((s) => names.has(s)).length);
    assert.deepEqual(failures, []);
  });
});
