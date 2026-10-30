// Test-only: the field oracle over the corpus (Batch E3). Word
// stores the result it last showed for every field; a field
// evaluator can be scored against it.
//
//   await fieldOracle({names, evaluate, filter?, stories?, files?})
//     -> {rows, skipped}
//     names     field names (the first word of the instruction,
//               compared with case ignored), e.g. ['REF', 'PAGEREF']
//     evaluate  (doc, field, ctx) -> string | null: the computed
//               result; null: not evaluated. ctx is {file, name,
//               story (the part name, null for the body), stored}
//               and may be async
//     filter    (field, doc) -> boolean: false leaves a field out
//               (not counted at all)
//     stories   true: the headers and footers too (default: body)
//     files     the files to read (default: oracleFiles(): one in
//               ten by a hash of the name, every file with
//               WORD_EDIT_CORPUS=1)
//   rows: [{file, name, instr, stored, computed, match, reason}]
//     stored    Word's result: the plain text between the separate
//               mark and the end mark (a w:fldSimple: its shown
//               text), paragraphs joined by '\n',
//               nested fields' results included as text (their
//               codes are not text), tabs and breaks as written
//     computed  evaluate's string, or null
//     match     computed equals stored after collapsing every run
//               of white space to one space and trimming both ends
//               (same()); null when computed is null
//     reason    why a row did not match or was not evaluated: ''
//               for a match, else 'differs' or 'not evaluated'
//   skipped: [{file, name, instr, reason}] fields (or whole files,
//     name null) left out: 'unreadable' (the reader refused the
//     file or it threw), 'no separate' (a field with no stored
//     result), 'over cap' (more than CAPS.fields fields of the
//     names in one file: the rest are skipped; or a file larger
//     than CAPS.bytes)
//   report(res, label, limit = 5)  prints per name: fields,
//     evaluated, matched, mismatched, not evaluated, skipped; and
//     the first `limit` mismatches with their reason. res is
//     fieldOracle's result (or a bare rows array)
//   floor(rows, name, fraction)  asserts that at least `fraction`
//     of the evaluated fields called `name` matched (and that
//     there are some when fraction > 0)
//   same(a, b)  the comparison above
//   oracleFiles()  corpusFiles() without the hand-off files of Batch
//     E3 (corpus/handoff/en3-*: made and updated by !Letters, so
//     their stored results are ours, not Word's) and of Batch F1
//     (corpus/handoff/cm-*: made by !Letters, some from corpus
//     files, which would then be counted twice)
//   resultsOf(doc, story?) -> [{instr, stored}]  every field of the
//     body (story: that header's or footer's part) with its stored
//     result as fieldOracle reads it (null: none)
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {basename} from 'node:path';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {forEachBlock, forEachIn}
  from '../../tools/moreapps/!Letters/Walk';
import {inlineText} from '../../tools/moreapps/!Letters/InlineText';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {corpusFiles, nameOf, ALL} from './roundtrip-lib.mjs';

export const CAPS = {fields: 2000, bytes: 30e6};

/** See the header. */
export const oracleFiles = () => corpusFiles().filter((f) =>
  !/(^|[\\/])handoff[\\/](en3|cm)-/.test(f));

/** Compare two results: white space collapsed, ends trimmed. */
export const same = (a, b) => norm(a) === norm(b);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const word = (instr) => (/^\s*(\S+)/.exec(instr) || [])[1] || '';

/** The text of p from..to as a stored result reads. */
function textOf(p, from, to) {
  let out = '';
  for (let k = from; k < to; k++) {
    const c = p.text[k];
    if (c !== OBJ) {
      out += c;
      continue;
    }
    const x = p.inlines && p.inlines[k];
    if (!x) continue;
    if (x.kind === 'tab' || x.kind === 'br') out += inlineText(x);
    else if (x.level === 'p' && typeof x.text === 'string')
      out += x.text;
  }
  return out;
}

/** The stored result of field f: text from its separate to end. */
function storedOf(paras, f) {
  const key = (at) => at.join(',');
  if (f.simple) {
    const b = paras.get(key(f.begin.at));
    const x = b && paras.list[b.n].inlines[f.begin.off];
    return x && typeof x.text === 'string' ? x.text : null;
  }
  const i = paras.get(key(f.sep.at)), j = paras.get(key(f.end.at));
  if (!i || !j || j.n < i.n) return null;
  const out = [];
  for (let n = i.n; n <= j.n; n++) {
    const p = paras.list[n];
    out.push(textOf(p, n === i.n ? f.sep.off + 1 : 0,
      n === j.n ? f.end.off : p.text.length));
  }
  return out.join('\n');
}

/** The paragraphs of a body or story by path key (+ list). */
function parasOf(doc, story) {
  const m = new Map();
  m.list = [];
  const fn = (b, at) => {
    if (b && b.type === 'p') {
      m.set(at.join(','), {n: m.list.length});
      m.list.push(b);
    }
    return true;
  };
  if (story === null) forEachBlock(doc, fn);
  else forEachIn(doc.stories.get(story).blocks, [0], fn);
  return m;
}

/** See the header. */
export function resultsOf(doc, story = null) {
  const paras = parasOf(doc, story);
  return scan(doc, story === null ? undefined : story).map((f) =>
    ({instr: f.instr, stored: f.sep || f.simple ? storedOf(paras, f)
      : null}));
}

/** See the header. */
export async function fieldOracle({names, evaluate, filter,
  stories = false, files} = {}) {
  const want = new Set(names.map((n) => n.toUpperCase()));
  const rows = [], skipped = [];
  for (const f of files || oracleFiles()) {
    const file = files ? basename(f) : nameOf(f);
    let doc;
    try {
      if (statSync(f).size > CAPS.bytes) {
        skipped.push({file, name: null, instr: '',
          reason: 'over cap'});
        continue;
      }
      doc = await readDocx(readFileSync(f));
    } catch (e) {
      skipped.push({file, name: null, instr: '',
        reason: 'unreadable'});
      continue;
    }
    const parts = [null];
    if (stories && doc.stories instanceof Map)
      parts.push(...doc.stories.keys());
    let n = 0;
    for (const story of parts) {
      let fields;
      try {
        fields = scan(doc, story === null ? undefined : story);
      } catch (e) {
        skipped.push({file, name: null, instr: '',
          reason: 'unreadable'});
        continue;
      }
      let paras = null;
      for (const fld of fields) {
        const name = word(fld.instr).toUpperCase();
        if (!want.has(name) || (filter && !filter(fld, doc))) continue;
        const rec = {file, name, instr: fld.instr};
        if (++n > CAPS.fields) {
          skipped.push({...rec, reason: 'over cap'});
          continue;
        }
        if (!fld.sep && !fld.simple) {
          skipped.push({...rec, reason: 'no separate'});
          continue;
        }
        paras = paras || parasOf(doc, story);
        const stored = storedOf(paras, fld);
        if (stored === null) {
          skipped.push({...rec, reason: 'no separate'});
          continue;
        }
        const ctx = {file, name, story, stored};
        let computed = null, reason = '';
        try {
          computed = await evaluate(doc, fld, ctx);
        } catch (e) {
          computed = null;
          reason = 'threw: ' + String(e && e.message).slice(0, 80);
        }
        if (computed === undefined) computed = null;
        const match = computed === null ? null : same(computed, stored);
        if (match === null) reason = reason || 'not evaluated';
        else if (!match) reason = 'differs';
        rows.push({...rec, stored, computed, match, reason});
      }
    }
  }
  return {rows, skipped};
}

/** Print the counts per name and the first mismatches. */
export function report(res, label, limit = 5) {
  const rows = Array.isArray(res) ? res : res.rows;
  const skipped = Array.isArray(res) ? [] : res.skipped;
  const by = new Map();
  const at = (name) => {
    if (!by.has(name)) by.set(name, {fields: 0, evaluated: 0,
      matched: 0, mismatched: 0, none: 0, skipped: 0});
    return by.get(name);
  };
  for (const r of rows) {
    const c = at(r.name);
    c.fields++;
    if (r.match === null) c.none++;
    else {
      c.evaluated++;
      if (r.match) c.matched++;
      else c.mismatched++;
    }
  }
  const why = new Map();
  for (const s of skipped) {
    if (s.name) {
      at(s.name).skipped++;
      at(s.name).fields++;
    }
    why.set(s.reason, (why.get(s.reason) || 0) + 1);
  }
  const sample = ALL ? '' : ' (sample; WORD_EDIT_CORPUS=1 for all)';
  console.log(`# ${label}${sample}: ${rows.length} fields ` +
    `compared, ${skipped.length} skipped` + (why.size ? ' (' + [...why]
      .map(([k, v]) => v + ' ' + k).join(', ') + ')' : ''));
  for (const [name, c] of [...by].sort()) {
    console.log(`# ${name}: ${c.fields} fields, ${c.evaluated} ` +
      `evaluated, ${c.matched} matched, ${c.mismatched} mismatched, ` +
      `${c.none} not evaluated, ${c.skipped} skipped`);
  }
  let shown = 0;
  for (const r of rows) {
    if (r.match !== false || shown++ >= limit) continue;
    console.log(`# mismatch ${r.file}: { ${r.instr.trim()} } stored ` +
      `${JSON.stringify(r.stored.slice(0, 80))}, computed ` +
      `${JSON.stringify(String(r.computed).slice(0, 80))} ` +
      `(${r.reason})`);
  }
}

/** Assert that `fraction` of the evaluated `name` fields matched. */
export function floor(rows, name, fraction) {
  const list = (Array.isArray(rows) ? rows : rows.rows).filter(
    (r) => r.name === name.toUpperCase() && r.match !== null);
  const n = list.filter((r) => r.match).length;
  if (fraction > 0) assert.ok(list.length > 0,
    `no ${name} fields were evaluated`);
  assert.ok(n >= Math.floor(list.length * fraction), `only ${n} of ` +
    `${list.length} ${name} fields matched Word's result`);
}
