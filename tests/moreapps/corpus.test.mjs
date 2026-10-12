// Round trip of a corpus of real-world .docx files (see
// tools/moreapps-corpus.mjs; the files are optional and git-ignored:
// tests/moreapps/corpus/<source>/...). For each file readDocx either
// resolves (then the document must pass checkBlock, write -> read must
// give the same model, the second generation must be byte-stable,
// unparsed parts must come out byte-identical and every XML part must
// parse: ./corpus-check.mjs) or rejects with a DocxError. The latter
// is acceptable only for the files listed in corpus-expected.json
// (name -> DocxError code; entries whose value is not a string, such
// as opaqueTables, are not files).
// Tables are read typed (the default since Batch C1.7); the tables'
// own checks (per table equivalence, the Opaque histogram) are in
// tables-corpus.test.mjs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {checkFile, tablesOf} from './corpus-check.mjs';

const DIR = fileURLToPath(new URL('./corpus/', import.meta.url));
const EXPECTED = Object.fromEntries(Object.entries(JSON.parse(
  readFileSync(new URL('./corpus-expected.json', import.meta.url),
    'utf8'))).filter(([, v]) => typeof v === 'string'));

function find(dir, out = []) {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) find(p, out);
    else if (/\.docx$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

let props = 0; // property elements whose written order was checked
let tabled = 0; // files holding a body table
const linted = {generic: 0, sourceErrors: 0};

/** Checks one file; the blocks. Its time goes into `times`. */
async function check(bytes, what, times) {
  const t0 = Date.now();
  const r = await checkFile(bytes, what);
  times.push([Date.now() - t0, what]);
  props += r.props;
  linted.generic += r.generic;
  linted.sourceErrors += r.sourceErrors;
  if (tablesOf(r.doc).length) tabled++;
  return r.blocks;
}

const files = existsSync(DIR) ? find(DIR) : [];

describe('corpus of real-world .docx files', {
  skip: files.length ? false : 'tests/moreapps/corpus is missing or ' +
    'empty (optional, git-ignored: run node tools/moreapps-corpus.mjs)',
}, () => {
  it('round-trips every file, refuses only the expected ones', async () => {
    const times = [];
    const failures = [];
    let ok = 0, refused = 0, blocks = 0;
    const seen = new Set();
    for (const f of files) {
      const name = relative(DIR, f).split('\\').join('/');
      seen.add(name);
      const want = EXPECTED[name];
      try {
        const bytes = readFileSync(f);
        blocks += await check(bytes, name, times);
        if (want) failures.push(`${name}: expected ${want}, but it read`);
        else ok++;
      } catch (e) {
        if (e instanceof DocxError && want === e.code) refused++;
        else if (e instanceof DocxError && want) {
          failures.push(`${name}: expected ${want}, got ${e.code}`);
        } else {
          failures.push(`${name}: ${e.name} ${e.code || ''} ` +
            String(e.message).split('\n')[0].slice(0, 300));
        }
      }
    }
    for (const n of Object.keys(EXPECTED)) {
      if (!seen.has(n)) console.log('# note: expected-failure entry ' +
        'for a file not in the corpus: ' + n);
    }
    times.sort((p, q) => q[0] - p[0]);
    console.log(`# corpus: ${files.length} files, ${ok} ok, ${refused} ` +
      `expected-fail, ${failures.length} failures, ${blocks} blocks, ` +
      `${tabled} with tables, ` +
      `${props} property elements in written order; package errors ` +
      `in the originals: ${linted.sourceErrors} (none added; ` +
      `${linted.generic} generic content types repaired)`);
    console.log('# slowest: ' + times.slice(0, 5)
      .map(([ms, n]) => `${n} ${ms} ms`).join('; '));
    assert.deepEqual(failures, []);
    // (a guard against hangs: the slowest file, a 15 MB styles-heavy
    // POI document, takes about 7 s per pass with all the checks above)
    assert.ok(times[0][0] < 20000, 'slowest pass under 20 s: ' + times[0]);
  });
});
