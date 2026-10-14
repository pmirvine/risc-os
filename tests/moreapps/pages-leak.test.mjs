// Pages keep no earlier Pages alive (Batch D P8 fix C1): P.counts,
// what NUMPAGES and SECTIONPAGES show while P is not done, holds the
// page count and each page's section only, never the earlier Pages'
// Page objects (PageFrames' OWNER map would keep every earlier Pages,
// its galley and its DocLayout reachable through them). Real
// DocLayout and Pages, the fake measurer (word-docs tm); gc through
// v8 flags (no --expose-gc needed on the command line).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import {runInNewContext} from 'node:vm';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {countsOf} from '../../tools/moreapps/!Letters/FieldShow';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

before(loadStyles);
v8.setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc');
const heap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed / 1e6;
};
const doc = (n) => mk(Array.from({length: n},
  (_, i) => `${i} alpha beta gamma words`));

describe('Pages keep no earlier Pages (C1)', () => {
  it('counts hold the count and sections, not Page objects', () => {
    const d = doc(300), m = tm();
    let L = new DocLayout(d.doc, m);
    L.layout(800);
    const P0 = new Pages(printGalley(L), null);
    P0.finish();
    d.apply({op: 'replaceText', block: [0, 5], at: 0, del: 0,
      ins: 'x'});
    L = new DocLayout(d.doc, m, L);
    L.layout(800);
    const P1 = new Pages(printGalley(L), P0);
    const c = countsOf(P1);
    assert.equal(c.list.length, P0.list.length);
    assert.ok(P0.list.length > 1);
    for (let i = 0; i < c.list.length; i++) {
      assert.equal(c.list[i].s, P0.list[i].s);
      assert.ok(!P0.list.includes(c.list[i]), 'no Page kept');
      assert.deepEqual(Object.keys(c.list[i]), ['s']);
    }
  });

  it('a done Pages is collected once the next one is made',
    async () => {
    const d = doc(300), m = tm();
    let L = new DocLayout(d.doc, m);
    L.layout(800);
    let P = new Pages(printGalley(L), null);
    P.finish();
    const first = new WeakRef(P);
    for (let k = 0; k < 3; k++) {
      d.apply({op: 'replaceText', block: [0, 10 + k], at: 0, del: 0,
        ins: 'x'});
      L = new DocLayout(d.doc, m, L);
      L.layout(800);
      P = new Pages(printGalley(L), P);
      P.finish();
    }
    // (a WeakRef keeps its target to the end of the job: a tick)
    await new Promise((res) => setTimeout(res, 0));
    heap();
    assert.ok(first.deref() === undefined, 'the first Pages is kept');
  });

  it('5,000 paragraphs, 60 keystrokes: the heap does not grow', () => {
    const d = doc(5000), m = tm();
    let L = new DocLayout(d.doc, m);
    L.layout(800);
    let P = new Pages(printGalley(L), null);
    P.finish();
    const step = (k) => {
      d.apply({op: 'replaceText', block: [0, 10 + k], at: 0, del: 0,
        ins: 'x'});
      L = new DocLayout(d.doc, m, L);
      L.layout(800);
      P = new Pages(printGalley(L), P);
      P.finish();
    };
    for (let k = 0; k < 5; k++) step(k);
    const h0 = heap();
    for (let k = 5; k < 65; k++) step(k);
    const h1 = heap();
    // (before the fix: about 1.5 MB a keystroke, 90 MB in all)
    assert.ok(h1 - h0 < 15, `heap grew ${(h1 - h0).toFixed(1)} MB`);
  });
});
