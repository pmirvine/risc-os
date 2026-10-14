// The page-start oracle with real fonts (Batch D P3.5, D7, D35): the
// corpus files that carry Word's recorded page starts (each
// w:lastRenderedPageBreak, and page break before: pagestarts.mjs
// wordStarts; not corpus/handoff, madeByWord) are opened in the real desktop, in Print layout, with
// the bundled fonts loaded (Carlito for Calibri, Liberation for Arial
// and Times...), and our page starts are scored against Word's by
// pagestarts.mjs scoreStarts, the ONE rule pages-corpus.test.mjs
// uses too (P5.1): Word's starts counted once a galley line (a table
// counts a line a row and a start in a table's cell is on its row's
// line, P4.1), each matched by one of ours within one line, the
// causes (pagestarts.mjs causeOf, its source run in the page)
// tallied inside the match so they add up. Ours are pagestarts.mjs
// ourStarts, its source run in the page too (pagelive.mjs
// liveStarts), so each column's start counts as in Node; and a file
// is scored once its pages, column and wrap passes have settled, as
// the user sees it (final fix B F2-I3: before, column starts were
// not counted and the passes not waited for). The page gives the
// lines and causes; the score is worked out here. Printed per cause beside
// the score of the same files laid out in Node with the fake
// measurer (pages-corpus.test.mjs's), so the gain from real fonts
// and metrics shows. A MEASUREMENT, not a pin: it prints and fails
// only when a file cannot be opened or paginated. It is in
// index.mjs (about 25 s with the corpus); it needs the git-ignored
// corpus (tests/moreapps/corpus, fetched by
// tools/moreapps-corpus.mjs): without it, it prints SKIP and passes.
//
//   node tests/moreapps/word-pages-oracle.mjs [N]   N files at most
//                         (default all that carry starts), taken in
//                         name order; DETAIL=1 prints every file
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { launch, BASE_URL } from '../core/pw.mjs';
import { readDocx } from '../../tools/moreapps/!Letters/DocxRead';
import { DocLayout } from '../../tools/moreapps/!Letters/DocLayout';
import { printGalley } from '../../tools/moreapps/!Letters/PageHF';
import { Pages } from '../../tools/moreapps/!Letters/Pages';
import { wordStarts, lineBase, ourStarts, placesOf, scoreStarts, causeOf, madeByWord } from './pagestarts.mjs';
import { liveStarts } from './pagelive.mjs';
import { tm } from './word-docs.mjs';
import { CORPUS } from './roundtrip-lib.mjs';

const find = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const q = join(dir, e.name);
    if (e.isDirectory()) find(q, out);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) out.push(q);
  }
  return out.sort();
};
if (!existsSync(CORPUS)) {
  console.log('SKIP no corpus (tools/moreapps-corpus.mjs fetches it)');
  process.exit(0);
}
const LIMIT = Number(process.argv[2]) || Infinity;

// ------------------------------------------------ Node: the files with Word's starts, and the fake measurer's score
const picked = [];
for (const f of find(CORPUS).filter(madeByWord)) {
  if (picked.length >= LIMIT) break;
  let doc;
  try {
    doc = await readDocx(readFileSync(f));
  } catch (e) {
    continue;
  }
  const ws = wordStarts(doc);
  if (!ws.length) continue;
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  const G = printGalley(L), P = new Pages(G).finish(), base = lineBase(L.items);
  const m = scoreStarts(ourStarts(P, L.items, base), placesOf(G, base, ws));
  picked.push({ file: f, name: relative(CORPUS, f), fake: m });
}

const out = [];
const { browser, page, logs } = await launch({ height: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const t0 = performance.now();
const rows = [];
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.evaluate(`window.__causeOf = ${causeOf.toString()}`);
  await page.evaluate(`window.__ourStarts = ${ourStarts.toString()}`);
  await page.evaluate(`window.__liveStarts = ${liveStarts.toString()}`);
  await ev(async () => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;

    /** Word's starts and ours over the live document, settled
     *  (pagelive.mjs liveStarts: pagestarts.mjs ourStarts itself, so
     *  column starts count as in Node); scored in Node. */
    window.__score = (d) => {
      const L = d.view.layout, P = L.place.pages;
      return window.__liveStarts(L, P, d.doc, window.__causeOf, window.__ourStarts);
    };
    /** Waits until d's pages, column and wrap passes have settled (as a
     *  user sees the document after the slices stop, final fix B F2-I3). */
    window.__settled = async (d, ms = 60000) => {
      const end = performance.now() + ms;
      for (;;) {
        const dw = d.dw, P = d.view.pages && d.view.pages();
        if (P && P.done && !dw.raf && !dw.colDue && !dw.wrapDue && !dw.colEnd) return true;
        if (performance.now() > end) return false;
        await window.__frames(1);
      }
    };
  });

  for (const pk of picked) {
    const bytes = Array.from(readFileSync(pk.file));
    const r = await ev(async (bytes) => {
      os.vfs.writeFile('RAM::RamDisc0.$.Oracle', new Uint8Array(bytes), { filetype: 0xA7E });
      const t = window.__word(), a = performance.now();
      const dw = await t.word.open('RAM::RamDisc0.$.Oracle');
      const d = t.word.docs.find((x) => !x.closed && x.dw === dw);
      if (!d) return { error: 'not opened: ' + window.__msgs.slice(-1)[0] };
      await document.fonts.ready;
      d.relayout();
      await window.__frames(2);
      if (d.viewName !== 'print') d.setView('print');
      if (!(await window.__settled(d))) return { error: 'not settled in 60 s' };
      const s = window.__score(d);
      s.ms = Math.round(performance.now() - a);
      d.dw.close();
      await window.__frames(1);
      return s;
    }, bytes);
    if (!r.error) Object.assign(r, scoreStarts(r.ours, r.word));
    rows.push({ ...pk, real: r });
    if (r.error) out.push(`FAIL ${pk.name}: ${r.error}`);
    else if (process.env.DETAIL) {
      out.push(`# ${pk.name}: real ${r.matched}/${r.total}, fake ${pk.fake.matched}/${pk.fake.total}, ${r.pages} pages, ${r.ms} ms`);
    }
  }
  const fams = await ev(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))].sort());
  out.push('# bundled fonts loaded in the page: ' + fams.join(', '));
  if (!fams.length) out.push('FAIL no bundled font loaded: the score would be the fallback fonts\'');
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
const sum = (f) => rows.reduce((a, x) => a + (x.real.error ? 0 : f(x)), 0);
const causes = {};
for (const x of rows) for (const [k, [a, b]] of Object.entries(x.real.causes || {})) {
  const c = causes[k] || (causes[k] = [0, 0]);
  c[0] += a;
  c[1] += b;
}
const realM = sum((x) => x.real.matched), realT = sum((x) => x.real.total), realS = sum((x) => x.real.starts);
const fakeC = {};
for (const x of rows) for (const [k, [a, b]] of Object.entries(x.fake.causes || {})) {
  const c = fakeC[k] || (fakeC[k] = [0, 0]);
  c[0] += a;
  c[1] += b;
}
const fakeM = sum((x) => x.fake.matched), fakeT = sum((x) => x.fake.total);
const diffTotal = rows.filter((x) => !x.real.error && x.real.starts !== x.fake.starts).length;
const worst = rows.filter((x) => !x.real.error).sort((a, b) => (b.real.total - b.real.matched) - (a.real.total - a.real.matched))
  .slice(0, 6).map((x) => `${x.name} (${x.real.matched}/${x.real.total})`);
out.push(`# real-font oracle: ${rows.length} files, ${realS} of Word's page starts, ${realT} once a galley line; ours match ${realM} within one line `
  + `(${(100 * realM / Math.max(1, realT)).toFixed(1)}%); the same files with the fake measurer: ${fakeM}/${fakeT}`
  + `; ${Math.round((performance.now() - t0) / 1000)} s`);
out.push('# by cause (matched/total): ' + Object.entries(causes).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(', '));
out.push('# fake measurer by cause: ' + Object.entries(fakeC).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(', '));
out.push('# most missed: ' + worst.join(', '));
if (diffTotal) out.push(`# ${diffTotal} files count Word's starts differently in the page and in Node (page break before)`);
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
