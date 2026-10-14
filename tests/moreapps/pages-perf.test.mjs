// The page budgets (Batch D P5.1, D37): fixed ceilings that catch a
// gross regression (the +5 ms comparisons with the main branch are
// made by hand: docs/apps/Letters.md). One 50,000-paragraph document
// (about 1,600 pages at 800 px, the fake measurer word-docs tm), laid
// out once and shared:
//   * opening in Print layout costs Draft's open + the full cursor
//     pagination (PageHF printGalley, the galley Print layout uses,
//     Pages, PlacePrint, finish) < +150 ms;
//   * a keystroke in a paragraph on page ~800 (convergent): Print
//     layout's relayout + new Pages from the last + the caret's page
//     worked out is within +5 ms of Draft's relayout, and the slices
//     left are none (it converged);
//   * a line added at the top (no convergence): the first pages
//     (what shows) < 5 ms, the rest in 2 ms slices, finished
//     < 300 ms, the same pages as a fresh pagination;
//   * painting a screen (EditPaint paintView, 1000 px at page 800,
//     before and after a keystroke) builds the frames of 2 pages at
//     most.
// Every budget is asserted twice (P7 fix M7): on the plain document,
// and on the same paragraphs with headers and footers on (titlePg: a
// two-line first-page header and a default header; a default footer
// holding a PAGE field with its placeholder result), so the header
// and footer hooks (PageHF) are inside the budgets too.
// Timings: medians of 20 or more after 3 warm-up runs; the
// keystroke's +5 ms is the median of the differences of paired runs
// (each Print layout run less the Draft run just before it), the
// best of three attempts (P8.3: robust under the parallel unit run);
// the open and the line at the top are the best of three attempts
// too (final fix B, review 3 M32: a real cost is in every attempt,
// load from tests running beside this one is not), and the open is
// paired with Draft's (at most half of it); its 150 ms ceiling is
// asserted with WORD_PERF=1 only (a quiet machine).
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley as galleyOf}
  from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintView} from '../../tools/moreapps/!Letters/EditPaint';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {p, r} from './build-docx.mjs';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const N = 50000, W = 800, RUNS = 21, WARM = 3;
const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
const TEXTS = Array.from({length: N}, (_, i) => `${i} ` +
  WORDS[i % 10] + ' words');
const PAGE = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + r('1') +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
let HF = null;

/** A Document of TEXTS's paragraphs (mk's, its styles and page)
 *  with HF's headers and footers on (stories, relationships, the
 *  section's references and titlePg). */
function withHf() {
  const base = mk(TEXTS).doc, sec = base.sections[0];
  const hfRels = HF.rels.filter((x) => /header|footer/.test(x.type));
  const doc = {...base, stories: HF.stories,
    rels: [...base.rels, ...hfRels],
    sections: [{...sec, props: {...sec.props, titlePg: true,
      extra: HF.sections[0].props.extra}}]};
  const x = new Document(doc);
  x.clearHistory();
  return x;
}

/** A 2D context that does nothing (paint calls counted). */
function nullG() {
  let n = 0;
  const t = {get calls() { return n; },
    measureText: (s) => ({width: 6 * s.length})};
  return new Proxy(t, {
    get: (o, k) => (k in o ? o[k] : () => { n++; }),
    set: () => true,
  });
}

before(async () => {
  loadStyles();
  HF = await readDocx(await withHeaders(p(r('x')), {
    default: {hdr: p(r('Running head')), ftr: p(r('Page ') + PAGE)},
    first: {hdr: p(r('First page head')) + p(r('its second line'))}},
  {titlePg: true}));
});

budgets('a plain document', () => mk(TEXTS), false);
budgets('headers and footers on (M7)', withHf, true);

/** The four budgets on the document make() gives (hf: it has
 *  headers and footers). */
function budgets(label, make, hf) {
  describe('the page budgets (D37): ' + label, () => {
    let d, m, L0, P0;

    before(() => {
      d = make();
      m = tm();
      L0 = new DocLayout(d.doc, m);
      L0.layout(W);
      P0 = new Pages(galleyOf(L0)).finish();
      if (hf) {
        assert.equal(P0.at(0).header.type, 'first');
        assert.ok(P0.list.every((pg) => pg.header && pg.footer),
          'every page has its header and footer');
      }
    });
    after(() => { d = m = L0 = P0 = null; });

    it('opening in Print layout: the pagination of ~1,600 pages ' +
      'adds < 150 ms to Draft\'s open', () => {
      assert.ok(P0.count >= 1500, `${P0.count} pages`);
      // paired with Draft's open (the same document laid out afresh),
      // run in turn so that a busy spell slows both: the pagination
      // costs at most half Draft's open, asserted always; the
      // 150 ms ceiling is the best of three medians, printed always
      // and asserted with WORD_PERF=1 (a quiet machine; final fix B,
      // review 3 M32)
      const pair = () => {
        const pg = [], dr = [];
        for (let k = 0; k < RUNS + WARM; k++) {
          let t0 = performance.now();
          new DocLayout(d.doc, m).layout(W);
          const t1 = performance.now();
          if (k >= WARM) dr.push(t1 - t0);
          t0 = performance.now();
          const P = new Pages(galleyOf(L0));
          L0.place = PlacePrint(L0, P);
          P.finish();
          if (k >= WARM) pg.push(performance.now() - t0);
          assert.equal(P.count, P0.count);
        }
        return {pg: median(pg), dr: median(dr)};
      };
      let got = null;
      for (let t = 0; t < 3 && !(got && got.pg < 150 &&
        got.pg < got.dr / 2); t++) {
        const x = pair();
        console.log(`# open: pagination of ${P0.count} pages ` +
          `${x.pg.toFixed(1)} ms, Draft's open ${x.dr.toFixed(1)} ms ` +
          `(attempt ${t + 1})`);
        if (!got || x.pg / x.dr < got.pg / got.dr) got = x;
      }
      assert.ok(got.pg < got.dr / 2, `${got.pg.toFixed(1)} ms against ` +
        `Draft's ${got.dr.toFixed(1)} ms`);
      if (process.env.WORD_PERF) {
        assert.ok(got.pg < 150, `${got.pg.toFixed(1)} ms`);
      }
    });

    it('a keystroke on page ~800 (convergent) is within +5 ms of ' +
      'Draft\'s; nothing left to work out', () => {
      const i = N >> 1, id = d.doc.sections[0].blocks[i].id;
      let L = L0, P = P0, page = -1, left = 0;
      /** One measurement: RUNS keystrokes in Draft and RUNS in Print
       *  layout, alternating; each Print one paired with the Draft
       *  one just before it (the same load on the machine). */
      const attempt = () => {
        const draft = [], print = [], diff = [];
        for (let k = 0; k < 2 * (RUNS + WARM); k++) {
          d.apply({op: 'replaceText', block: [0, i], at: 0, del: 0,
            ins: 'x'});
          const t0 = performance.now();
          const L1 = new DocLayout(d.doc, m, L);
          L1.layout(W);
          const t1 = performance.now();
          if (k % 2) {
            const P1 = new Pages(galleyOf(L1), P);
            L1.place = PlacePrint(L1, P1);
            page = P1.ofPos({id, off: 1});
            P1.ensure(page + 1);
            if (k >= 2 * WARM) {
              print.push(performance.now() - t0);
              diff.push(print[print.length - 1] -
                draft[draft.length - 1]);
            }
            left = P1.done ? 0 : 1;
            P1.step(2);
            if (!P1.done) left++;
            P = P1;
          } else if (k >= 2 * WARM) {
            draft.push(t1 - t0);
          }
          L = L1;
        }
        return {a: median(draft), b: median(print), e: median(diff)};
      };
      // the median of the paired differences, best of three attempts
      // (P8.3): a real cost of 5 ms is in every pair of every attempt;
      // load from tests running beside this one (the parallel unit
      // run) is in some pairs, or in one attempt, not in all three
      let got = null;
      for (let t = 0; t < 3 && !(got && got.e < 5); t++) {
        const x = attempt();
        console.log(`# keystroke on page ${page}: Draft ` +
          `${x.a.toFixed(2)} ms, Print layout ${x.b.toFixed(2)} ms, ` +
          `paired difference ${x.e.toFixed(2)} ms (attempt ${t + 1})`);
        if (!got || x.e < got.e) got = x;
        assert.ok(page > 700, `page ${page}`);
        assert.ok(left <= 1, 'converged: one slice finishes it');
        assert.ok(P.done && P.count === P0.count, `${P.count}`);
      }
      assert.ok(got.e < 5, `Print layout ${got.e.toFixed(2)} ms ` +
        `over Draft's (${got.b.toFixed(2)} against ` +
        `${got.a.toFixed(2)} ms)`);
    });

    it('a line added at the top: the first pages < 5 ms, the rest in ' +
      '2 ms slices, finished < 300 ms, as a fresh pagination', () => {
      const e = make();
      const La = new DocLayout(e.doc, m);
      La.layout(W);
      const Pa = new Pages(galleyOf(La)).finish();
      e.apply({op: 'insertBlock', at: [0, 0], block: newPara('top')});
      const L = new DocLayout(e.doc, m, La);
      L.layout(W);
      let P = null;
      /** {ens, tot}: the medians of the first pages and of all. */
      const attempt = () => {
        const ens = [], tot = [];
        for (let run = 0; run < RUNS + WARM; run++) {
          P = new Pages(galleyOf(L), Pa);
          const t0 = performance.now();
          P.ensure(2);
          const t1 = performance.now();
          let n = 0;
          while (!P.step(2)) assert.ok(++n < 10000, 'the slices end');
          if (run >= WARM) {
            ens.push(t1 - t0);
            tot.push(performance.now() - t0);
          }
        }
        return {ens: median(ens), tot: median(tot)};
      };
      let got = null;
      for (let t = 0; t < 3 && !(got && got.ens < 5 && got.tot < 300);
        t++) {
        const x = attempt();
        console.log(`# a line at the top: first pages ` +
          `${x.ens.toFixed(2)} ms, all ${x.tot.toFixed(1)} ms ` +
          `(attempt ${t + 1})`);
        if (!got || x.tot < got.tot) got = x;
      }
      assert.ok(got.ens < 5, `${got.ens} ms`);
      assert.ok(got.tot < 300, `${got.tot} ms`);
      const F = new Pages(galleyOf(L)).finish();
      assert.equal(P.count, F.count);
      assert.ok(P.list.every((pg, j) => pg.start.k === F.list[j].start.k
        && pg.start.line === F.list[j].start.line), 'as fresh');
    });

    it('painting a screen at page 800 builds the frames of 2 pages ' +
      'at most, and again after a keystroke', () => {
      const i = N >> 1, id = d.doc.sections[0].blocks[i].id;
      let L = new DocLayout(d.doc, m, L0);
      L.layout(W);
      let P = new Pages(galleyOf(L));
      L.place = PlacePrint(L, P);
      const pg = P.ofPos({id, off: 0});
      const top = L.place.sheet.rect(P.at(pg)).y;
      const rect = {x0: 0, y0: top, x1: 1200, y1: top + 1000};
      const sel = {anchor: {id, off: 0}, head: {id, off: 0}};
      const g = nullG();
      paintView(L, g, rect, sel, true);
      assert.ok(g.calls > 20, 'it drew');
      assert.ok(P.fragsBuilt >= 1 && P.fragsBuilt <= 2,
        `${P.fragsBuilt}`);
      d.apply({op: 'replaceText', block: [0, i], at: 0, del: 0,
        ins: 'y'});
      const L1 = new DocLayout(d.doc, m, L);
      L1.layout(W);
      const P1 = new Pages(galleyOf(L1), P);
      L1.place = PlacePrint(L1, P1);
      paintView(L1, nullG(), rect, sel, true);
      assert.ok(P1.fragsBuilt >= 1 && P1.fragsBuilt <= 2,
        `${P1.fragsBuilt}`);
      L = L1;
      P = P1;
    });
  });
}
