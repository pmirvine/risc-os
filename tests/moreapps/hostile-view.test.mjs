// !Word's view against hostile and odd documents (hostile-docs.mjs):
// a 100,000-character word, 50,000 runs, 5000 tabs, absurd indents
// and page sizes, a paragraph of only inlines, tables first and last,
// an empty document. Each call stays under 50 ms, the selection
// stays valid, and nothing hangs: the sweeps run in a worker that a
// 10 s watchdog stops. Also: grapheme steps in long paragraphs (over
// 4096 units, segmented in windows) agree with the whole text's.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {nextG, prevG, clampOff} from '../../tools/moreapps/!Word/DocPos';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {BODIES, laidOut, badSel} from './hostile-docs.mjs';
import * as S from '../../tools/moreapps/!Word/Selection';

const HELPER = new URL('./hostile-docs.mjs', import.meta.url).href;
const WORKER = `
const {parentPort, workerData: d} = require('node:worker_threads');
import(d.url).then((m) => m[d.fn](...d.args))
  .then((r) => parentPort.postMessage({r}),
    (e) => parentPort.postMessage({e: String(e && e.stack || e)}));`;

/** fn(...args) of hostile-docs.mjs in a worker, stopped after ms. */
function watched(fn, args, ms = 10000) {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER, {eval: true,
      workerData: {url: HELPER, fn, args}});
    const dog = setTimeout(() => {
      w.terminate();
      reject(new Error(`${fn}(${args}) still running after ${ms} ms`));
    }, ms);
    w.on('message', (m) => {
      clearTimeout(dog);
      w.terminate();
      if (m.e) reject(new Error(m.e)); else resolve(m.r);
    });
    w.on('error', (e) => { clearTimeout(dog); reject(e); });
  });
}

describe('long paragraphs: windowed grapheme steps', () => {
  const texts = {
    'a lone flag letter, then 3000 flags':
      '\u{1F1E6}' + '\u{1F1EB}\u{1F1F7}'.repeat(3000) + 'z',
    'flags after a letter, odd and even runs':
      ('x' + '\u{1F1E9}\u{1F1EA}'.repeat(700) + '\u{1F1E6} ')
        .repeat(4),
    'emoji, ZWJ, combining marks, Hangul, CJK': (
      'a\u{1F600}é\u{1F469}‍\u{1F4BB} 각' +
      '中\u{1F44D}\u{1F3FD}ọ̈ \r\n').repeat(300),
    'a long cluster': 'b' + '́'.repeat(5000) + 'c',
  };
  for (const [name, t] of Object.entries(texts)) {
    it(name, () => {
      assert.ok(t.length > 4096);
      const g = graphemes(t), set = new Set(g);
      let k = 0;
      for (let off = 0; off <= t.length; off++) {
        while (g[k] < off) k++;
        // next: the first boundary > off; prev: the last < off
        const next = g[k] === off ? g[k + 1] ?? t.length : g[k];
        const prev = g[k] === off ? g[k - 1] ?? 0 : g[k - 1];
        if (nextG(t, off) !== next || prevG(t, off) !== prev) {
          assert.fail(`at ${off}: next ${nextG(t, off)} (want ${next})` +
            `, prev ${prevG(t, off)} (want ${prev})`);
        }
        const c = clampOff({kind: 'p', block: {text: t}}, off);
        if (!set.has(c) || c > off) assert.fail(`clamp ${off} -> ${c}`);
      }
    });
  }
  it('the case seen: prevG(t, 12002) is 12000', () => {
    const t = '\u{1F1E6}' + '\u{1F1EB}\u{1F1F7}'.repeat(3000) + 'z';
    assert.equal(prevG(t, 12002), 12000);
    assert.equal(nextG(t, 11998), 12000);
  });
});

describe('hostile documents', () => {
  for (const name of Object.keys(BODIES)) {
    it(`${name}: every call < 50 ms, the selection valid, no hang`,
      async () => {
        const r = await watched('sweep', [name]);
        assert.deepEqual(r.bad, [], name);
        assert.ok(r.worst < 50,
          `${name}: ${r.what} took ${r.worst.toFixed(1)} ms`);
        assert.ok(name === 'empty' ? r.items === 0 : r.items > 0);
      });
  }
  it('absurd page sizes give a usable column', async () => {
    for (const name of ['pageZero', 'pageNeg', 'pageHuge', 'pageNone',
      'indents']) {
      const {L} = await laidOut(name);
      const ext = L.layout(800);
      for (const v of [L.textW, L.pageW, L.left, L.height, ext.w, ext.h]) {
        assert.ok(Number.isFinite(v) && v >= 0, `${name} ${v}`);
      }
      assert.ok(L.textW >= 80 && L.textW <= 4000, `${name} ${L.textW}`);
      assert.ok(ext.w < 10000 && ext.h < 1e6, `${name} ${ext.w}`);
      for (const it of L.items) {
        for (const ln of it.lines || []) {
          assert.ok(Number.isFinite(ln.x) && Math.abs(ln.x) < 1e5,
            `${name} line x ${ln.x}`);
        }
      }
    }
  });
  it('an empty document: no items, no selection, no throw',
    async () => {
      const {L} = await laidOut('empty');
      assert.equal(L.items.length, 0);
      assert.equal(L.hitTest(10, 10), null);
      assert.equal(S.selectAll(L), null);
      assert.equal(L.docStart(), null);
      assert.equal(S.move(null, L, 'right'), null);
    });
  it('tables first and last: the ends are their outer edges',
    async () => {
      const {doc, L} = await laidOut('opaqueEnds');
      const a = L.docStart(), b = L.docEnd();
      assert.equal(L.byId.get(a.id).kind, 'box');
      assert.deepEqual([a.off, b.off], [0, 1]);
      let s = S.caret(a);
      for (let k = 0; k < 20; k++) {
        s = S.move(s, L, k < 10 ? 'right' : 'up', false);
        assert.equal(badSel(L, doc, s), '');
      }
      assert.deepEqual(S.move(S.caret(b), L, 'right').head, b);
      assert.deepEqual(S.move(S.caret(a), L, 'left').head, a);
    });
});

describe('fuzz', () => {
  it('500 random key and mouse sequences keep the selection valid',
    async () => {
      const r = await watched('fuzz', [7, 500]);
      assert.deepEqual(r.bad, []);
      assert.ok(r.steps > 2000, `${r.steps} steps`);
      assert.ok(r.worst < 50, `${r.what} took ${r.worst} ms`);
    });
});
