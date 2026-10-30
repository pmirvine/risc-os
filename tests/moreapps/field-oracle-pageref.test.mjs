// PAGEREF against Word's stored results (Batch E3): every PAGEREF of
// the corpus (the body and the headers and footers; most stand in
// the tables of contents, 'PAGEREF _Toc... \h') evaluated by
// ./Fields with the real pagination (./DocLayout with the fake
// measurer, 1000 px, ./PageHF printGalley, ./Pages all worked out:
// as pages-corpus.test.mjs paginates; ctx.page the page of the
// field's begin) and compared with what Word last showed. The fonts
// are stand-ins, so our pages break elsewhere than Word's and a page
// number can differ: the match count is a FLOOR, not exact.
//
// Measured 2026-10-30 (WORD_EDIT_CORPUS=1): 29 PAGEREF fields in the
// files the reader opens (the earlier census of 215 counted first
// words in every file, the unreadable ones too), all 29 evaluated, 4
// matched (FLOOR); the 25 others are all on a LATER page of ours
// than the page Word recorded for the bookmark (+1 to +6: our
// stand-in fonts make longer pages; bookmark.docx's table of
// contents most of them). The mismatches are printed with how far
// our number is from Word's, and their cause.
//
// Word's own page of the bookmark is known where Word recorded its
// page starts (w:lastRenderedPageBreak, pagestarts.mjs wordStarts:
// the files Word saved): the starts on lines up to the bookmark's,
// plus one. A field whose bookmark is on that same page index in our
// pagination ('page agrees') must then show Word's number exactly
// (the lookup and the numbering are right; only page breaks differ
// elsewhere): asserted, every one of them.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {fieldOracle, report} from './field-oracle.mjs';
import {evaluate} from '../../tools/moreapps/!Letters/Fields';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {parse} from '../../tools/moreapps/!Letters/FieldParse';
import {of as bookmarks}
  from '../../tools/moreapps/!Letters/BookmarkIndex';
import {wordStarts, lineBase, placesOf} from './pagestarts.mjs';
import {tm, loadStyles} from './word-docs.mjs';
import {ALL} from './roundtrip-lib.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// the matched count of the first measured run (all files, 2026-10-30):
// a drop is a regression to look at, a rise may move it up
const FLOOR = 4;
// fields whose bookmark is on the page Word recorded (2026-10-30: 1)
const AGREE = 1;

const paged = new WeakMap();           // doc -> {L, G, P, base, ws}

/** doc paginated as pages-corpus.test.mjs does, with Word's starts. */
function pagesOf(doc, file) {
  let o = paged.get(doc);
  if (!o) {
    const L = new DocLayout(doc, tm());
    L.layout(1000);
    const G = printGalley(L), P = new Pages(G).finish();
    const base = lineBase(L.items);
    const handoff = /(^|[\\/])handoff[\\/]/.test(file);
    const ws = handoff ? [] : placesOf(G, base, wordStarts(doc))
      .filter((w) => Number.isFinite(w.line));
    o = {L, G, P, base, ws};
    paged.set(doc, o);
  }
  return o;
}

/** Word's page index of position pos (from its starts), or null. */
function wordIndex(o, pos) {
  if (!o.ws.length) return null;
  const [w] = placesOf(o.G, o.base, [pos]);
  if (!Number.isFinite(w.line)) return null;
  const lines = new Set(o.ws.filter((x) => x.line <= w.line)
    .map((x) => x.line));
  return lines.size;
}

before(loadStyles);
const infos = [];                      // per evaluate call, in order

/** PAGEREF f evaluated on the real pages (the oracle's evaluate). */
function pageref(doc, f, ctx) {
  const o = pagesOf(doc, ctx.file);
  const i = ctx.story === null ? o.P.ofPos({id: f.begin.id,
    off: f.begin.off}) : -1;
  const v = evaluate({doc, pages: o.P, page: i >= 0 ? o.P.list[i]
    : undefined}, f);
  const q = parse(f.instr), e = q.args.length === 1
    ? bookmarks(doc).find(q.args[0]) : null;
  const info = {ours: null, word: null, plain: false};
  if (e && e.story === null && !e.inNote) {
    info.ours = o.P.ofPos(e.start);
    info.word = wordIndex(o, e.start);
    const pg = o.P.list[info.ours];
    info.plain = !!pg && pg.fmt === 'decimal' &&
      o.P.list.every((x) => x.fmt === 'decimal') &&
      o.P.list.every((x, k) => x.num === k + 1);
    info.num = pg ? pg.num : null;
  }
  infos.push(info);
  return v;
}

describe('PAGEREF oracle', () => {
  it('matches Word on the corpus (a floor: stand-in fonts)',
    async () => {
      infos.length = 0;
      const res = await fieldOracle({names: ['PAGEREF'], stories: true,
        evaluate: pageref});
      report(res, 'PAGEREF', 10);
      const rows = res.rows;
      const ev = rows.filter((x) => x.match !== null);
      const matched = ev.filter((x) => x.match).length;
      // the mismatches: how far our number is from Word's
      const far = new Map(), why = new Map();
      for (const x of rows) {
        if (x.match === null) {
          why.set(x.reason, (why.get(x.reason) || 0) + 1);
          continue;
        }
        if (x.match) continue;
        const a = Number(x.computed), b = Number(x.stored);
        const k = Number.isFinite(a) && Number.isFinite(b)
          ? (a - b > 0 ? '+' : '') + (a - b) : 'not a number';
        far.set(k, (far.get(k) || 0) + 1);
      }
      console.log('# PAGEREF: ' + rows.length + ' compared, ' +
        ev.length + ' evaluated, ' + matched + ' matched (' +
        (ev.length ? (100 * matched / ev.length).toFixed(1) : 0) +
        '%); mismatches by our page - Word\'s: ' + [...far].sort()
        .map(([k, n]) => k + ' x' + n).join(', '));
      console.log('# PAGEREF not evaluated: ' + [...why]
        .map(([k, n]) => k + ' x' + n).join(', '));
      // where our page of the bookmark is Word's page (its starts)
      // (one evaluate call per row, in order)
      assert.equal(infos.length, rows.length);
      const agree = rows.filter((x, k) => {
        const info = infos[k];
        return info.word !== null && info.ours === info.word &&
          info.plain && x.match !== null;
      });
      const bad = agree.filter((x) => !x.match);
      // the cause of each mismatch: our page index of the bookmark
      // against Word's (from its starts), when Word recorded them
      const cause = new Map();
      rows.forEach((x, k) => {
        if (x.match !== false) return;
        const info = infos[k];
        const c = info.word === null ? 'no Word starts to tell'
          : info.ours !== info.word ? 'our page breaks differ (' +
            (info.ours > info.word ? 'later' : 'earlier') + ')'
            : !info.plain ? 'page numbering not plain' : 'numbering';
        cause.set(c, (cause.get(c) || 0) + 1);
      });
      // Word's stored number against its own recorded page
      const known = rows.filter((x, k) => infos[k].word !== null &&
        infos[k].plain);
      const own = known.filter((x) => Number(x.stored) ===
        infos[rows.indexOf(x)].word + 1).length;
      console.log('# PAGEREF: Word\'s stored number is its recorded ' +
        `page for ${own} of ${known.length} (plain numbering)`);
      console.log('# PAGEREF mismatch causes: ' + [...cause]
        .map(([k, n]) => k + ' x' + n).join(', '));
      console.log('# PAGEREF where our page is Word\'s (its recorded ' +
        'starts): ' + agree.length + ', ' + (agree.length -
        bad.length) + ' matched');
      for (const x of bad.slice(0, 5)) {
        console.log(`# page agrees, differs ${x.file}: ` +
          `{${x.instr.trim()}} ${x.stored} vs ${x.computed}`);
      }
      assert.deepEqual(bad.map((x) => [x.file, x.instr, x.stored,
        x.computed]), [], 'a page that agrees shows Word\'s number');
      if (ALL) {
        assert.ok(matched >= FLOOR, `PAGEREF matched ` +
          `${matched} < floor ${FLOOR}`);
        assert.ok(agree.length >= AGREE, `pages that agree with ` +
          `Word's: ${agree.length} < ${AGREE}`);
      }
    });

  it('evaluates and matches a built file (any run)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgref-'));
    const file = join(dir, 'made.docx');
    const BR = '<w:r><w:br w:type="page"/></w:r>';
    const body = p(fld(' PAGEREF _Toc1 \\h ', '2')) +
      p(fld(' PAGEREF _Toc1 \\* roman ', 'ii')) + p(r('x') + BR) +
      p('<w:bookmarkStart w:id="1" w:name="_Toc1"/>' + r('there') +
        '<w:bookmarkEnd w:id="1"/>');
    writeFileSync(file, await buildDocx({
      'word/document.xml': documentXml(body)}));
    try {
      const res = await fieldOracle({names: ['PAGEREF'], files: [file],
        evaluate: pageref});
      assert.equal(res.rows.length, 2);
      assert.ok(res.rows.every((x) => x.match === true),
        JSON.stringify(res.rows.map((x) => [x.instr, x.computed])));
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
