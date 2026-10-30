// SEQ against Word's stored results (Batch E3): every SEQ field of
// the corpus (41 in all with WORD_EDIT_CORPUS=1) is numbered by
// ./FieldSeq and compared with what Word last showed. Fields whose
// switches are not supported (no entry) are 'not evaluated' and
// not scored.
// Exception: a SEQ inside the CODE of another field (the open-xml-sdk
// complex*.docx files: seq Appendix, Figure and Tabel inside a TC
// field's text) shows nothing and Word keeps its number in
// w:instrText, which a stored result does not read: left out by the
// filter below, except the mixed-case `\* Alphabetic` ones. Word
// stores 'A' for those, ./FieldFormat would give 'a', so FieldSeq
// computes nothing (reason: mixed-case format) and the rows show as
// 'not evaluated' - never as matched by accident.
import {describe, it} from 'node:test';
import {fieldOracle, report, floor} from './field-oracle.mjs';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {counters} from '../../tools/moreapps/!Letters/FieldSeq';
import {cmpPath} from '../../tools/moreapps/!Letters/Path';
import assert from 'node:assert/strict';

const MIXED = /\\\*\s*Alphabetic/;

/** Whether f lies in the code of a field (all of it when the
 *  field has no separate). */
function inCode(doc, f) {
  for (const g of scan(doc)) {
    if (!g.children.includes(f)) continue;
    if (!g.sep) return true;           // (all of it is code)
    const c = cmpPath(f.begin.at, g.sep.at);
    if (c < 0 || (c === 0 && f.begin.off < g.sep.off)) return true;
  }
  return false;
}

describe('SEQ oracle', () => {
  it('matches Word on the corpus', async () => {
    const res = await fieldOracle({names: ['SEQ'], stories: true,
      filter: (f, doc) => !inCode(doc, f) || MIXED.test(f.instr),
      evaluate: (doc, f) => {
        const s = counters(doc).get(f.begin);
        return s === undefined ? null : s;
      }});
    report(res, 'SEQ', 20);
    const bad = res.rows.filter((x) => x.match === false);
    assert.deepEqual(bad.map((x) => [x.file, x.instr, x.stored,
      x.computed]), []);
    const none = res.rows.filter((x) => x.match === null);
    console.log('# SEQ not evaluated (mixed-case format): ' +
      none.length);
    assert.ok(none.every((x) => MIXED.test(x.instr) &&
      x.reason === 'not evaluated'));
    if (res.rows.length) floor(res.rows, 'SEQ', 1);
  });
});
