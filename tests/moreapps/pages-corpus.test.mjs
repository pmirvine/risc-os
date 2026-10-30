// The page-start oracle over the corpus (spec D7, P2.4; the files are
// optional and git-ignored: tests/moreapps/corpus, see
// tools/moreapps-corpus.mjs). Every file the reader opens is laid out
// (DocLayout, the fake measurer word-docs tm, 1000 px) and paginated
// (Pages, with its headers and footers as Print layout has them:
// PageHF printGalley, P7.2) with no error, in under 5 s, and never
// into more pages than its paragraphs (at every depth) + forced
// breaks (page and column breaks, page break before, section starts,
// blank pages) + 1. For
// the files where Word recorded page starts (pagestarts.mjs
// wordStarts: each w:lastRenderedPageBreak and page break before; not
// the files in corpus/handoff, madeByWord: the pin is hermetic) our
// page starts are scored against Word's by pagestarts.mjs
// scoreStarts, the one rule word-pages-oracle.mjs uses too (P5.1):
// Word's starts counted once a galley line (a table counts a line a
// row, and a position in a cell is on its row's line, P4.1), each
// matched by one of ours within one line. The totals must EQUAL the
// pin in corpus-expected.json (Batch F1: matched 325 -> 328, a
// comment reference draws nothing, as in Word, reviewed) (pageStarts:
// {matched, total, files};
// R10; P10 fix M2: and ourCount, how many starts of ours were
// scored, as the score never counts against extra starts of ours;
// how many of them match none and the score of page starts alone
// are printed): a drift either way is a reviewed change of the pin. The
// score per cause (causeOf: Word's start in a section with columns,
// in a table or block, at a forced break, or natural; the causes add
// up to the totals) and the worst files are printed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readDocx, DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {CORPUS, nameOf, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {wordStarts, lineBase, ourStarts, placesOf, scoreStarts,
  madeByWord}
  from './pagestarts.mjs';
import {tm} from './word-docs.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const PIN = JSON.parse(readFileSync(join(HERE, 'corpus-expected.json'),
  'utf8')).pageStarts;

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

/** Page breaks, page break before, section starts, blank pages. */
function forcedOf(L, G, P) {
  let n = P.list.filter((pg) => pg.blank).length;
  L.items.forEach((it, k) => {
    const f = G.facts(k);
    n += (f.brPage ? f.brPage.length : 0) + (f.breakBefore ? 1 : 0) +
      (k > 0 && it.s !== L.items[k - 1].s ? 1 : 0);
  });
  return n;
}

describe('page starts: ours against Word\'s, over the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it('every file paginates; the score equals the pin', async () => {
    let read = 0, refused = 0, matched = 0, total = 0, withStarts = 0;
    let recorded = 0, ourCount = 0, unmatched = 0, pageOnly = 0;
    let slowest = 0, pages = 0;
    const worst = [], causes = {};
    for (const f of files) {
      let doc;
      try {
        doc = await readDocx(readFileSync(f));
      } catch (e) {
        if (!(e instanceof DocxError)) throw e;
        refused++;
        continue;
      }
      read++;
      const name = nameOf(f), t0 = performance.now();
      const L = new DocLayout(doc, tm());
      L.layout(1000);
      const G = printGalley(L), P = new Pages(G).finish();
      const ms = performance.now() - t0;
      slowest = Math.max(slowest, ms);
      assert.ok(ms < 5000, `${name}: ${ms} ms`);
      assert.ok(P.done && P.count >= 1, name);
      pages += P.count;
      let paras = 0;
      for (const x of L.byId.values()) if (x.kind === 'p') paras++;
      const most = paras + forcedOf(L, G, P) + 1;
      assert.ok(P.count <= most, `${name}: ${P.count} > ${most}`);
      const ws = madeByWord(f) ? wordStarts(doc) : [];
      if (!ws.length) continue;
      withStarts++;
      const base = lineBase(L.items);
      const m = scoreStarts(ourStarts(P, L.items, base),
        placesOf(G, base, ws));
      matched += m.matched;
      total += m.total;
      recorded += m.starts;
      ourCount += m.ours;
      unmatched += m.unmatched;
      pageOnly += scoreStarts(ourStarts(P, L.items, base, true),
        placesOf(G, base, ws)).matched;
      worst.push([m.total - m.matched, name, m.matched, m.total]);
      for (const [k, [a, b]] of Object.entries(m.causes)) {
        const c = causes[k] || (causes[k] = [0, 0]);
        c[0] += a;
        c[1] += b;
      }
    }
    worst.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
    console.log(`# page starts: ${files.length} files, ${read} read, ` +
      `${refused} refused, ${pages} pages; Word recorded ${recorded} ` +
      `starts in ${withStarts} files, ${total} once a galley line; ` +
      `ours match ${matched} (within one line) of ${ourCount} ` +
      `starts of ours (${unmatched} matching none); page starts ` +
      `alone match ${pageOnly}; slowest file ` +
      `${slowest.toFixed(0)} ms`);
    console.log('# by cause (matched/total): ' + Object.entries(causes)
      .map(([k, [a, b]]) => `${k} ${a}/${b}`).join(', '));
    console.log('# most missed: ' + worst.slice(0, 5)
      .map(([, name, a, b]) => `${name} (${a}/${b})`).join(', '));
    assert.ok(read > 0);
    assert.deepEqual({matched, total, files: withStarts, ourCount},
      PIN);
  });
});
