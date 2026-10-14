// A paragraph with many fields lays out in linear time (Batch D P8
// fix I2): LineTokens puts each computed result in as one token in
// one merge pass, FieldShow finds a show by its offset in a Map, and
// FieldCodes finds a code (and whether an offset is inside one)
// without a walk of the paragraph's codes per mark. PAGE fields,
// DATE fields and the codes view: 4 times the fields take well under
// 16 times as long (quadratic was about 16), and 10,000 fields in one
// paragraph lay out within a second (main: about 90 ms; before the
// fix 35 s). Real DocLayout, the fake measurer (word-docs tm).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 11, 14, 5);
const docs = new Map();

/** A doc of one paragraph: n fields of code (stored 'r'), memoised. */
async function docOf(code, n) {
  const k = code + n;
  if (!docs.has(k)) {
    let s = r('Start ');
    for (let i = 0; i < n; i++) s += fld(code, 'r') + r(' ');
    docs.set(k, await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(s))})));
  }
  return docs.get(k);
}

/** ms to lay doc out (best of 3), and the layout. */
function lay(doc, codes) {
  let best = Infinity, L = null;
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    L = new DocLayout(doc, tm(), null, {fields: {now: NOW, codes}});
    L.layout(800);
    best = Math.min(best, performance.now() - t0);
  }
  return {ms: best, L};
}

const fieldToks = (L) => L.items[0].lines.flatMap((l) => l.items)
  .filter((x) => x.field);

const CASES = [
  ['PAGE fields', ' PAGE ', false, 'r'],
  ['DATE fields', ' DATE ', false, '11/10/2026'],
  ['the codes view', ' PAGE ', true, '{ PAGE }'],
];

describe('many fields in one paragraph: linear (I2)', () => {
  for (const [name, code, codes, text] of CASES) {
    it(name, async () => {
      const a = lay(await docOf(code, 1000), codes);
      const b = lay(await docOf(code, 4000), codes);
      const ts = fieldToks(b.L);
      assert.equal(ts.length, 4000);
      assert.ok(ts.every((x) => x.text === text), ts[0].text);
      assert.ok(b.ms < 8 * a.ms + 40,
        `1,000: ${a.ms.toFixed(0)} ms, 4,000: ${b.ms.toFixed(0)} ms`);
      const c = lay(await docOf(code, 10000), codes);
      assert.equal(fieldToks(c.L).length, 10000);
      assert.ok(c.ms < 1000, `10,000: ${c.ms.toFixed(0)} ms`);
    });
  }
});
