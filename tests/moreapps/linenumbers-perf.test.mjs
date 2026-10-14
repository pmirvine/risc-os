// The line numbers' keystroke budget (Batch D P11 fix I2, D37): on a
// 50,000-paragraph document (about 1,667 pages at 800 px, the fake
// measurer word-docs tm) numbered with restart newSection or
// continuous, the first LineNumbers numbersOf on the caret's page
// after a keystroke costs <= 1 ms (median of 21 after 3 warm-ups):
// the counts of the pages kept from the last pagination are carried
// over (not walked again), and a newSection walk starts at its
// section's first page (an edit at the top, the numbers of page
// ~800 of a 100-section document, nothing carried). The numbers are
// those of a fresh pagination.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley as galleyOf}
  from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {numbersOf} from '../../tools/moreapps/!Letters/LineNumbers';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const N = 50000, W = 800, RUNS = 21, WARM = 3, BUDGET = 1;
const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
const TEXTS = Array.from({length: N}, (_, i) => `${i} ` +
  WORDS[i % 10] + ' words');

/** TEXTS in n sections (each a new page) numbered with restart. */
function numbered(n, restart) {
  const base = mk(TEXTS).doc, sec = base.sections[0];
  const props = {...sec.props, lnNumType: {countBy: 1, restart}};
  const per = Math.ceil(N / n), sections = [];
  for (let s = 0; s < n; s++) {
    sections.push({...sec, props,
      blocks: sec.blocks.slice(s * per, (s + 1) * per)});
  }
  const d = new Document({...base, sections});
  d.clearHistory();
  return d;
}

/** Where block k of all is: [s, index in its section]. */
function placeOf(d, k) {
  let s = 0;
  while (k >= d.doc.sections[s].blocks.length) {
    k -= d.doc.sections[s].blocks.length;
    s++;
  }
  return [s, k];
}

const fresh = (L, i) => numbersOf(new Pages(galleyOf(L)), i)
  .map((x) => x.text).join();

/** Median ms of the first numbersOf on the page of block view after
 *  a keystroke in block edit; the numbers checked against a fresh
 *  pagination's at the end. */
function keystrokes(d, m, edit, view) {
  let L = new DocLayout(d.doc, m);
  L.layout(W);
  let P = new Pages(galleyOf(L)).finish();
  const [s, k] = placeOf(d, edit);
  const vb = placeOf(d, view);
  const id = d.doc.sections[vb[0]].blocks[vb[1]].id;
  let page = P.ofPos({id, off: 0});
  numbersOf(P, page);
  const ms = [];
  let got = '';
  for (let r = 0; r < RUNS + WARM; r++) {
    d.apply({op: 'replaceText', block: [s, k], at: 0, del: 0,
      ins: 'x'});
    const L1 = new DocLayout(d.doc, m, L);
    L1.layout(W);
    const P1 = new Pages(galleyOf(L1), P);
    page = P1.ofPos({id, off: 0});
    P1.ensure(page + 1);
    const t0 = performance.now();
    got = numbersOf(P1, page).map((x) => x.text).join();
    if (r >= WARM) ms.push(performance.now() - t0);
    P1.finish();
    L = L1;
    P = P1;
  }
  assert.ok(page > 700, `page ${page}`);
  assert.ok(got.length > 0, 'numbers drawn');
  assert.equal(got, fresh(L, page), 'as a fresh pagination');
  return median(ms);
}

describe('line numbers: the keystroke budget (P11 fix I2)', () => {
  let m;
  before(() => {
    loadStyles();
    m = tm();
  });
  for (const [n, restart] of [[1, 'newSection'], [100, 'newSection'],
    [1, 'continuous'], [100, 'continuous']]) {
    it(`${restart}, ${n} section(s): a keystroke on page ~800 ` +
      `adds <= ${BUDGET} ms`, () => {
      const d = numbered(n, restart), mid = N >> 1;
      const ms = keystrokes(d, m, mid, mid);
      console.log(`# ${restart}, ${n} sections: first numbersOf ` +
        `${ms.toFixed(3)} ms`);
      assert.ok(ms <= BUDGET, `${ms.toFixed(3)} ms`);
    });
  }
  it(`newSection, 100 sections: an edit at the top, the numbers of ` +
    `page ~800 <= ${BUDGET} ms (its section's pages only)`, () => {
    const d = numbered(100, 'newSection');
    const ms = keystrokes(d, m, 0, N >> 1);
    console.log(`# newSection, edit at the top: first numbersOf ` +
      `${ms.toFixed(3)} ms`);
    assert.ok(ms <= BUDGET, `${ms.toFixed(3)} ms`);
  });
});
