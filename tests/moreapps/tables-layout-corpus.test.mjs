// Every table of the real-world corpus (tests/moreapps/corpus,
// optional and git-ignored) laid out (Batch C2.4, D20): each file
// holding a typed table is laid out at a 600 px view with no error;
// every row is as high as its cells' content needs (content + the
// cell's top and bottom margins), its trHeight (exact sets it,
// atLeast or no rule raises it, auto ignores it, R24's cap) and a vertical merge
// ending in it ask, and no higher; a table is its rows' sum; every
// place finite; every id at every depth in L.byId; the slowest file
// laid out in under 5 s; the work area reaches every top-level
// table's right edge (D18 step 4) and a layout after it (every table
// reused, D20) places everything alike. Skipped without the corpus.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {ids, scan} from '../../tools/moreapps/!Letters/Walk';
import {MAX_LINE} from '../../tools/moreapps/!Letters/ParaSpace';
import {MARGIN} from '../../tools/moreapps/!Letters/DocStack';
import {CORPUS, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {tm} from './word-docs.mjs';

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
const files = existsSync(CORPUS) ? find(CORPUS) : [];
const EPS = 1e-6;

/** The rows' heights checked against D19 (see the header). */
function checkTable(it, where) {
  const n = it.rows.length;
  let sum = 0;
  const ends = new Map();
  it.rows.forEach((row, r) => {
    for (const c of row.cells) {
      if (c.rowSpan > 1) {
        const last = Math.min(n, r + c.rowSpan) - 1;
        if (!ends.has(last)) ends.set(last, []);
        ends.get(last).push({c, r0: r});
      }
    }
  });
  it.rows.forEach((row, r) => {
    assert.ok(Number.isFinite(row.y) && Number.isFinite(row.h) &&
      row.h >= 0, `${where} row ${r}`);
    assert.ok(Math.abs(row.y - (it.y + sum)) < EPS, `${where} row ${r} y`);
    let need = 0;
    for (const c of row.cells) {
      assert.ok(Number.isFinite(c.need) && c.need >= 0, where);
      if (!c.cont && c.rowSpan === 1) need = Math.max(need, c.need);
    }
    const th = row.geo.trH;
    if (th && th.rule === 'exact') {
      assert.ok(Math.abs(row.h - th.px) < EPS, `${where} exact ${r}`);
      assert.ok(th.px <= MAX_LINE);
    } else {
      // hRule auto: the height is the content's (OOXML), ignored
      let want = th && th.rule !== 'auto' ? Math.max(need, th.px) : need;
      for (const {c, r0} of ends.get(r) || []) {
        want = Math.max(want, c.need - (row.y - it.rows[r0].y));
      }
      assert.ok(Math.abs(row.h - want) < EPS,
        `${where} row ${r}: ${row.h} for a need of ${want}`);
    }
    sum += row.h;
  });
  assert.ok(Math.abs(it.h - sum) < EPS, `${where} table h`);
}

/** Every place of L, at every depth. */
const shape = (L) => JSON.stringify([...L.byId.values()].map((x) =>
  [x.id, x.x, x.y, x.h, x.rows ? x.rows.map((r) => [r.y, r.h]) : 0]));

/** Every 'tbl' item of L (every depth). */
const tblItems = (L) => [...L.byId.values()].filter((x) =>
  x.kind === 'tbl');

describe('every corpus table laid out (D20)', {skip: files.length ? false
  : SKIP_CORPUS}, () => {
  it('no error; rows as high as their content; < 5 s a file', async () => {
    let docs = 0, tablesN = 0, rows = 0, slowest = 0, slowName = '';
    let wide = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await readDocx(new Uint8Array(readFileSync(f)));
      } catch {
        continue;
      }
      let has = false;
      scan(doc, (b) => { if (b.type === 'tbl') has = true; });
      if (!has) continue;
      docs++;
      const t0 = performance.now();
      const m = tm();
      const L = new DocLayout(doc, m);
      const ext = L.layout(600);
      const ms = performance.now() - t0;
      if (ms > slowest) { slowest = ms; slowName = f; }
      const name = f.slice(CORPUS.length + 1);
      for (const id of ids(doc)) assert.ok(L.byId.has(id), `${name} ${id}`);
      for (const it of tblItems(L)) {
        tablesN++;
        rows += it.rows.length;
        checkTable(it, `${name} table ${it.id}`);
      }
      for (const x of L.byId.values()) {
        assert.ok(Number.isFinite(x.x) && Number.isFinite(x.y) &&
          Number.isFinite(x.h), `${name} item ${x.id}`);
      }
      const page = L.pageLeft + Math.max(L.pageW, L.marL + L.textW);
      for (const it of L.items) {
        if (it.kind !== 'tbl') continue;
        const right = L.left + it.left + it.width;
        if (right > page) wide++;
        assert.ok(ext.w >= Math.ceil(right + MARGIN),
          `${name} table ${it.id}: extent ${ext.w}, right ${right}`);
      }
      // laid out again after itself (every table reused): the same
      const before = shape(L);
      const L2 = new DocLayout(doc, m, L);
      L2.layout(600);
      assert.deepEqual(shape(L2), before, `${name}: reused`);
    }
    console.log(`# ${wide} top-level tables wider than their page`);
    console.log(`# ${docs} files, ${tablesN} typed tables, ${rows} ` +
      `rows; slowest ${slowest.toFixed(0)} ms (${slowName.slice(
        CORPUS.length + 1)})`);
    assert.ok(docs > 0);
    assert.ok(slowest < 5000, `slowest ${slowest} ms`);
  });
});
