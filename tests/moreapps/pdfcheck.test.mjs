// tools/pdf-check.mjs (Batch G1, task 9): poppler's pdfinfo and
// pdftotext, an independent reader, on a PDF the export wrote. A
// three-page document exported with the real fonts reads back as
// three pages with their text and nothing on stderr (exit 0); the
// same file cut short is reported (exit 1); without the tools it
// says so on one line and exits 0 (PDF_CHECK_BIN an empty
// directory: run everywhere). The corpus test's independent check,
// pdftotext's text of each page against the text drawn
// (pdf-read popplerMismatches), passes on the file and fails on
// text dropped and on the file with one ToUnicode entry changed
// (e read as x: pdf-read withCmapEntry, the file rebuilt). The
// tests and the tool find poppler by one rule (tools/lib/
// poppler.mjs). The poppler cases are skipped when pdftotext is
// not installed.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {loadStyles} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {bundled, windowOf, ROOT} from './pdf-docs.mjs';
import {HAVE_PDFTOTEXT, popplerMismatches, withCmapEntry, readPdf}
  from './pdf-read.mjs';
import {popplerDir} from '../../tools/lib/poppler.mjs';

const TOOL = path.join(ROOT, 'tools/pdf-check.mjs');
const OUT = path.join(ROOT, 'tests/moreapps/word-check-out/pdfcheck');
const TEXTS = ['Alpha first page', 'Bravo: café crème',
  'Charlie third page'];

const check = (args, env = {}) => spawnSync(process.execPath,
  [TOOL, ...args], {encoding: 'utf8', env: {...process.env, ...env}});

describe('pdf-check', () => {
  let file, bytes;
  before(async () => {
    await loadStyles();
    const d = mk(TEXTS.map((t, i) => (i ? [t, {pPr: {pageBreakBefore:
      true}}] : t)));
    const res = await exportPdf(windowOf(d.doc), {loader: bundled(),
      raf: (cb) => setImmediate(cb)});
    fs.mkdirSync(OUT, {recursive: true});
    file = path.join(OUT, 'three.pdf');
    fs.writeFileSync(file, res.bytes);
    bytes = res.bytes;
    fs.writeFileSync(path.join(OUT, 'cut.pdf'),
      res.bytes.subarray(0, res.bytes.length >> 1));
  });

  it('an exported file: OK, its pages and their text', {skip:
    !HAVE_PDFTOTEXT && 'pdftotext not installed'}, () => {
    const r = check([file]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.stdout.split('\n');
    assert.equal(lines[0], `OK ${file}: 3 pages`);
    TEXTS.forEach((t, i) => {
      assert.equal(lines[i + 1], `  page ${i + 1}: ${t}`);
    });
    assert.ok(r.stdout.includes('pdf-check: 1 file, 0 with problems'));
  });

  it('a file cut short: a problem, exit 1', {skip:
    !HAVE_PDFTOTEXT && 'pdftotext not installed'}, () => {
    const r = check([path.join(OUT, 'cut.pdf')]);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stdout.startsWith('PROBLEM '), r.stdout);
    assert.ok(r.stdout.includes('  reported: '), r.stdout);
  });

  it('a missing file: a problem, exit 1; no arguments: usage, 2',
    () => {
      const r = check([path.join(OUT, 'none.pdf')]);
      assert.equal(r.status, HAVE_PDFTOTEXT ? 1 : 0, r.stdout);
      assert.equal(check([]).status, 2);
    });

  it('the tests and the tool find poppler by one rule', () => {
    assert.equal(HAVE_PDFTOTEXT, popplerDir() !== null);
    const r = check([file]);
    assert.equal(r.stdout.startsWith('pdf-check: skipped'),
      !HAVE_PDFTOTEXT, r.stdout);
  });

  it('pdftotext against the text drawn: equal; a character dropped' +
    ' or a ToUnicode entry changed is found', {skip: !HAVE_PDFTOTEXT &&
    'pdftotext not installed'}, () => {
    assert.deepEqual(popplerMismatches(file, TEXTS), []);
    // text the painters drew that the file lacks
    assert.deepEqual(popplerMismatches(file, [TEXTS[0], TEXTS[1] + 'Z',
      TEXTS[2]]), ['page 2: pdftotext lacks "Z", has more ""']);
    assert.deepEqual(popplerMismatches(file, TEXTS.slice(0, 2)),
      ['pdftotext read 3 pages, not 2']);
    // the mutation: the CMap says the glyph drawn for e is x
    const mut = withCmapEntry(bytes, '0065', '0078');
    const f = path.join(OUT, 'mutated.pdf');
    fs.writeFileSync(f, mut);
    assert.equal(check([f]).status, 0);       // (a valid file)
    assert.equal(readPdf(mut).pages[0].text, 'Alpha first pagx');
    assert.deepEqual(popplerMismatches(f, TEXTS), [
      'page 1: pdftotext lacks "e", has more "x"',
      'page 2: pdftotext lacks "e", has more "x"',
      'page 3: pdftotext lacks "ee", has more "xx"']);
    // the same rebuild with no entry changed reads as the original
    const same = path.join(OUT, 'rebuilt.pdf');
    fs.writeFileSync(same, withCmapEntry(bytes, 'FFFF', 'FFFF'));
    assert.deepEqual(popplerMismatches(same, TEXTS), []);
  });

  it('the tools missing: one skip line, exit 0', () => {
    const empty = fs.mkdtempSync(path.join(OUT, 'nobin-'));
    try {
      const r = check([file], {PDF_CHECK_BIN: empty});
      assert.equal(r.status, 0);
      assert.equal(r.stdout, 'pdf-check: skipped: pdfinfo / ' +
        'pdftotext not installed (brew install poppler)\n');
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });
});
