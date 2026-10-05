// Performance regressions of the Model: typing in a long paragraph
// with many runs, and the memory its undo history keeps.
import {it} from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import {newPara, emptyDoc} from '../../tools/moreapps/!Word/Model';
import {Document} from '../../tools/moreapps/!Word/Document';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const MB = 1e6;

function bigDoc(chars, nRuns) {
  const text = 'abcdefghij'.repeat(chars / 10);
  const step = chars / nRuns;
  const runs = [];
  for (let k = 0; k < nRuns; k++) {
    runs.push({start: k * step, end: (k + 1) * step, rPr: {
      sz: k % 2 ? 20 : 22, rFonts: {ascii: 'Arial'},
      extra: [{name: 'w:x', attrs: [['w:val', String(k % 3)]],
        children: []}]}});
  }
  const d = emptyDoc();
  d.sections[0].blocks = [newPara(text, {runs})];
  for (let k = 0; k < 50; k++) d.sections[0].blocks.push(newPara('p' + k));
  return d;
}

function typeAndUndo(chars, nRuns, keys) {
  const doc = new Document(bigDoc(chars, nRuns));
  const m0 = heap();
  const t0 = performance.now();
  for (let k = 0; k < keys; k++) {
    doc.apply({op: 'replaceText', block: [0, 0], at: chars / 2 + k,
      del: 0, ins: 'x'});
  }
  const typed = performance.now() - t0;
  const m1 = heap();
  while (doc.undo());
  const all = performance.now() - t0;
  const m2 = heap();
  assert.equal(doc.doc.sections[0].blocks[0].text.length, chars);
  return {typed, all, grow1: (m1 - m0) / MB, grow2: (m2 - m0) / MB};
}

it('typing 1500 keys in a 20k-char, 2000-run paragraph, undo all', () => {
  const r = typeAndUndo(20000, 2000, 1500);
  const msg = JSON.stringify(r);
  assert.ok(r.all < 8000, 'too slow: ' + msg);
  assert.ok(r.grow1 < 150, 'undo history too big: ' + msg);
  assert.ok(r.grow2 < 150, 'redo history too big: ' + msg);
});

it('typing 5000 keys in a 2000-char, 50-run paragraph, undo all', () => {
  const r = typeAndUndo(2000, 50, 5000);
  const msg = JSON.stringify(r);
  assert.ok(r.all < 5000, 'too slow: ' + msg);
  assert.ok(r.grow1 < 150 && r.grow2 < 150, 'too much memory: ' + msg);
});
