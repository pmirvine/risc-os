// .doc import over the corpus (task 16, as ./odtcorpus.test.mjs for
// ODT): every .doc under tests/moreapps/corpus (the POI files and
// the LibreOffice-made twins of the .docx corpus) and the files real
// Word saved in tests/moreapps/word-check-out/doc-from-word (all
// git-ignored, optional: the tests skip when they are absent; see
// ./doc-corpus.mjs).
//
//   - each opens (readDoc) or is refused with an ImportError in
//     under 5 s, never another throw, never a "could not be read"
//     note (a handler that threw); the refusals are exactly those
//     in REFUSED (old: Word 6/95, encrypted, not-word, bad); every
//     file real Word saved opens; the counts are within a range;
//   - the round trip: the Doc read, written by DocxWrite and read
//     back by readDocx, has the same text, paragraph, table, list
//     paragraph, comment, picture and note counts
//     (./doc-corpus.mjs docStats), no package errors (lint-package),
//     and reads back exactly (./docx-compare.mjs assertSameDoc);
//   - SAMPLE (30 documents, chosen for their variety) go to emit()
//     for the real-Word check (./word-emit.mjs, tools/
//     word-open-check.mjs).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {docFiles, docName, wordMade, docStats, readTimed}
  from './doc-corpus.mjs';

const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const FILES = docFiles();
const SKIP = FILES.length ? false : 'no .doc corpus (optional, ' +
  'git-ignored: run node tools/moreapps-corpus.mjs and ' +
  'tools/moreapps-convert.mjs)';

const P = 'corpus/poi-doc/';
/** The files refused, and why (the task 16 findings list them):
 *  Word 6/95 documents, password-protected ones, files that are not
 *  Word 97-2003 documents and damaged containers (all POI's test
 *  files, most of them made broken on purpose by its fuzzer). */
const REFUSED = {
  [P + '52117.doc']: 'old', [P + '57843.doc']: 'old',
  [P + 'Bug49933.doc']: 'old', [P + 'Bug50955.doc']: 'old',
  [P + 'Bug60936.doc']: 'old', [P + 'Bug60942.doc']: 'old',
  [P + 'Bug60942b.doc']: 'old', [P + 'Word6.doc']: 'old',
  [P + 'Word6_sections.doc']: 'old', [P + 'Word6_sections2.doc']: 'old',
  [P + 'Word95.doc']: 'old', [P + 'word95err.doc']: 'old',
  [P + 'cn.orthodox.www_divenbog_APRIL_30-APRIL.DOC']: 'old',
  [P + 'PasswordProtected.doc']: 'encrypted',
  [P + 'password_password_cryptoapi.doc']: 'encrypted',
  [P + 'password_tika_binaryrc4.doc']: 'encrypted',
  // (a Word 6-era wIdent 0xA699; not an OLE file at all)
  [P + 'Bug51944.doc']: 'not-word', [P + 'word2.doc']: 'not-word',
  [P + 'clusterfuzz-testcase-minimized-POIHWPFFuzzer-' +
    '5074346559012864.doc']: 'not-word',
  [P + 'clusterfuzz-testcase-minimized-POIHWPFFuzzer-' +
    '5418937293340672.doc']: 'not-word',
  [P + 'clusterfuzz-testcase-minimized-POIHWPFFuzzer-' +
    '4892412469968896.doc']: 'bad',
  [P + 'clusterfuzz-testcase-minimized-POIHWPFFuzzer-' +
    '5440721166139392.doc']: 'bad',
  [P + 'clusterfuzz-testcase-minimized-POIHWPFFuzzer-' +
    '5832867957309440.doc']: 'bad',
};

const C = 'corpus/converted/doc/';
const X = C + 'open-xml-sdk/v2FxTestFiles/';
/** For the real-Word check: POI's real Word files (tables, lists,
 *  tracked changes, fast saves, cropped pictures, a DIB, headers that
 *  are damaged, a fuzzed header) and LibreOffice's twins with the
 *  most comments, notes, pictures, sections, fields, links,
 *  bookmarks, paragraphs and bytes. */
const SAMPLE = [P + 'ProblemExtracting.doc', P + '53379.doc',
  P + 'Bug50936_3.doc', P + 'parentinvguid.doc', P + '53446.doc',
  P + 'Bug52032_3.doc', P + 'ob_is.doc', P + 'o_kurs.doc',
  P + 'Bug33519.doc', P + 'rasp.doc', P + 'testCroppedPictures.doc',
  P + 'Bug51890.doc', P + 'HeaderFooterProblematic.doc',
  P + 'clusterfuzz-testcase-POIHWPFFuzzer-5696094627495936.doc',
  X + 'wordprocessing/footer & header/BackgroundReport - THE WORKING ' +
    'GROUP ON INTERNET GOVERNANCE.doc',
  C + 'open-xml-sdk/O15Conformance/WD/CommentExTest/Comments-Sample-' +
    '15-12-01/Comment033.doc',
  C + 'open-xml-sdk/O15Conformance/WD/CommentExTest/Comments-Sample-' +
    '15-12-01/Comment020.doc',
  C + 'open-xml-sdk/test/DocumentFormat.OpenXml.Tests.Assets/assets/' +
    'TestFiles/complex0.doc',
  C + 'open-xml-sdk/test/DocumentFormat.OpenXml.Tests.Assets/assets/' +
    'TestFiles/May_12_04.doc',
  X + 'wordprocessing/equation/equation-1.doc',
  X + 'bvt/complex2005_12rtm.doc',
  X + 'wordprocessing/bookmark/bookmark.doc',
  X + 'wordprocessing/hyperlink/632399964516872542 1.doc',
  X + 'wordprocessing/columns/columns2.doc',
  X + 'wordprocessing/table/TableFntEdnt/TableFntEdnt.doc',
  C + 'poi/bug59058.doc', C + 'poi/bug65649.doc',
  C + 'poi/deep-table-cell.doc', C + 'poi/issue_51265_2.doc',
  C + 'poi/61470.doc'];

// (each file read once; the tests share the results)
let readAll = null;
function results() {
  if (readAll) return readAll;
  readAll = FILES.map((f) => {
    const t = readTimed(new Uint8Array(fs.readFileSync(f)), readDoc,
      {date: DATE});
    return {f, name: docName(f), ...t};
  });
  return readAll;
}

function allBlocks(doc) {
  const out = doc.sections.flatMap((s) => s.blocks);
  for (const s of doc.stories.values()) out.push(...s.blocks);
  for (const k of ['footnotes', 'endnotes']) {
    for (const n of doc.notes[k].values()) out.push(...n.blocks);
  }
  for (const c of doc.comments.map.values()) out.push(...c.blocks);
  return out;
}

describe('.doc corpus (task 16)', {skip: SKIP}, () => {
  it('every .doc opens or is refused with an ImportError in 5 s',
    () => {
      const failures = [], counts = {};
      let words = 0;
      const all = results();
      for (const {f, name, r, err, ms} of all) {
        if (ms > 5000) failures.push(`${name}: ${Math.round(ms)} ms`);
        const code = err ? err.code : 'ok';
        counts[code] = (counts[code] || 0) + 1;
        if (err) {
          if (err.name !== 'ImportError') {
            failures.push(`${name}: ${err.name} ${err.stack}`);
          } else if (REFUSED[name] !== err.code) {
            failures.push(`${name}: refused ${err.code} ${err.message}`);
          }
          continue;
        }
        if (REFUSED[name]) failures.push(`${name}: expected a refusal`);
        if (wordMade(f)) words++;
        const broke = r.notes.find((n) => /could not be read/.test(n));
        if (broke) failures.push(`${name}: ${broke}`);
        for (const b of allBlocks(r.doc)) checkBlock(b);
      }
      const slow = all.slice().sort((p, q) => q.ms - p.ms).slice(0, 3);
      console.log(`# doc corpus: ${all.length} files, ` +
        JSON.stringify(counts) + '; slowest: ' + slow.map((x) =>
        `${x.name} ${Math.round(x.ms)} ms`).join('; '));
      assert.deepEqual(failures, []);
      // (every file real Word saved opens)
      assert.equal(words, FILES.filter(wordMade).length);
      // (counts: the corpus may grow; the shares stay)
      assert.ok(all.length >= 780, String(all.length));
      assert.ok(counts.ok >= all.length - Object.keys(REFUSED).length,
        JSON.stringify(counts));
    });

  it('round-trips through DocxWrite and readDocx with the same text ' +
    'and blocks, exactly', async () => {
    const failures = [];
    let n = 0, emitted = 0;
    const want = new Set(SAMPLE);
    for (const {name, r} of results()) {
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
        emit('doc-corpus-' + path.basename(name, path.extname(name)),
          bytes, {stem: 'doc-corpus-' + name});
      }
      const errors = lintPackage(await readZip(bytes)).problems
        .filter((q) => q.level === 'error').map((q) => q.message || q);
      if (errors.length) {
        failures.push(`${name}: package errors ${JSON.stringify(
          errors.slice(0, 3))}`);
      }
      const a = docStats(r.doc), b = docStats(back);
      for (const k of ['text', 'paras', 'tables', 'lists', 'comments',
        'pictures', 'footnotes', 'endnotes']) {
        if (a[k] !== b[k]) {
          failures.push(`${name}: ${k} ` + (k === 'text'
            ? `${a.text.length} -> ${b.text.length} characters`
            : `${a[k]} -> ${b[k]}`));
        }
      }
      try {
        assertSameDoc(back, withNewReview(withNewStories(withNewParts(
          expectedBack(r.doc), back), back), back), name);
      } catch (e) {
        failures.push(`${name}: ${String(e.message).slice(0, 300)}`);
      }
    }
    console.log(`# doc round trip: ${n} documents, ${failures.length} ` +
      `differences; ${emitted} of the ${SAMPLE.length} sampled here`);
    const names = new Set(FILES.map(docName));
    assert.equal(emitted, SAMPLE.filter((s) => names.has(s)).length);
    assert.deepEqual(failures, []);
  });
});
