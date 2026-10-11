// The Batch C hand-off files (tb-*.docx in the git-ignored
// corpus/handoff, written by handoff-tables.mjs) hold no element out
// of schema order and no value outside its enumeration in any part
// xmllint can check: Word may refuse such a file or offer to repair
// it, which would spoil the owner's session (final fix wave: a
// `thinThickThin` border and two orders out of place were found).
// The attributes Word's own extensions add (w14 ids, mc:Ignorable)
// and the Strict root, which the Transitional schemas do not know,
// are not counted. Skipped without the files or without xmllint and
// the schemas (tools/moreapps/.cache).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {schema} from './roundtrip-lib.mjs';

const DIR = join(import.meta.dirname, 'corpus', 'handoff');
const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => /^tb-.*\.docx$/.test(f)) : [];
const {xsd, note} = files.length ? schema() : {note: 'no files'};
const PART = /^word\/(document|styles|numbering|comments|footnotes|endnotes|header\d*|footer\d*)\.xml$/;
const BAD = /not expected|not an element of the set|is not a valid value/;

describe('hand-off files: schema order and values', () => {
  it('no element out of order and no unknown value', {skip: xsd
    ? false : note}, async () => {
    const bad = [];
    for (const f of files) {
      const z = await readZip(readFileSync(join(DIR, f)));
      for (const [k, v] of z) {
        if (!PART.test(k)) continue;
        for (const e of xsd.errors(v)) {
          if (BAD.test(e)) bad.push(`${f} ${k}: ${e.slice(0, 200)}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});
