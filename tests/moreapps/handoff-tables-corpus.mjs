// The local corpus (tests/moreapps/corpus, git-ignored) for the Batch C
// hand-off generator: its .docx files, and the Word-made files with
// the tables the roundtrip files (tb-13) are made of.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {tables} from './handoff-tables-lib.mjs';

export const CORPUS_DIR = fileURLToPath(new URL('./corpus/',
  import.meta.url));

/** Every corpus .docx (not the hand-off folder), sorted; [] if absent. */
export function corpusFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const q = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'handoff') walk(q);
      } else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) {
        out.push(q);
      }
    }
  };
  if (fs.existsSync(CORPUS_DIR)) walk(CORPUS_DIR);
  return out.sort();
}

const KINDS = {
  merged: (x) => x.merged && x.n >= 6 && !x.nested,
  nested: (x) => x.nested && x.n >= 4,
  styled: (x) => x.sty && !/^(TableGrid|TableNormal)$/.test(x.sty) &&
    x.n >= 6,
};

/** The smallest Word-made file for each kind (merged, nested, styled):
 *  {kind: path}. */
export async function pickTables() {
  const best = {};
  for (const f of corpusFiles()) {
    let doc;
    try {
      doc = await readDocx(new Uint8Array(fs.readFileSync(f)));
    } catch {
      continue;
    }
    const ts = doc.sections.flatMap((s) => tables(s.blocks));
    for (const {t} of ts) {
      const cells = t.rows.flatMap((row) => row.cells);
      const x = {n: cells.length, sty: t.tblPr && t.tblPr.tblStyle,
        merged: cells.some((c) => c.tcPr && (c.tcPr.vMerge ||
          c.tcPr.gridSpan > 1)),
        nested: cells.some((c) => c.blocks.some((b) => b.type === 'tbl'))};
      for (const [k, ok] of Object.entries(KINDS)) {
        if (ok(x) && (!best[k] || x.n < best[k].n)) best[k] = {f, n: x.n};
      }
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.f]));
}
