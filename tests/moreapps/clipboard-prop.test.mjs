// Clipboard property test: 200 sequences of a random slice of a
// random document copied (ClipSlice) and pasted (ClipPaste) at a
// random place in the same document, against a reference model of
// block texts; the model stays valid with unique ids, and undoing
// everything gives back the original exactly.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {midPair} from '../../tools/moreapps/!Word/ModelCheck';
import {rng} from './word-docs.mjs';
import {mk, texts, ids, valid, snap, undoAll, at, box, raw, O, S, bold,
  plain} from './edit-docs.mjs';
import {blockId} from '../../tools/moreapps/!Word/DocPos';

const PIECES = ['ab', 'c d', '\u{1F600}', 'x\ty', 'l\nm', O, 'hello'];

function randPara(r) {
  let text = '';
  const runs = [], inlines = {};
  const n = Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const t = PIECES[Math.floor(r() * PIECES.length)];
    if (t === O) inlines[text.length] = raw('hyperlink', 'p', 'link');
    const rPr = r() < 0.5 ? bold : plain;
    const last = runs[runs.length - 1];
    if (last && last.rPr === rPr) last.end += t.length;
    else runs.push({start: text.length, end: text.length + t.length,
      rPr});
    text += t;
  }
  return [text, {runs, inlines, pPr: {jc: r() < 0.5 ? 'left'
    : 'right', extra: []}}];
}

/** A random position [k, off] of the reference list `ref`. */
function randPos(r, ref) {
  const k = Math.floor(r() * ref.length);
  const t = ref[k];
  if (t === null) return [k, r() < 0.5 ? 0 : 1];
  const ok = [];
  for (let i = 0; i <= t.length; i++) if (!midPair(t, i)) ok.push(i);
  return [k, ok[Math.floor(r() * ok.length)]];
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];

/** The blocks a selection from..to copies (null: a table). */
function refSlice(ref, f, t) {
  const out = [];
  for (let k = f[0]; k <= t[0]; k++) {
    const x = ref[k];
    if (x === null) {
      if ((k !== f[0] || f[1] === 0) && (k !== t[0] || t[1] === 1))
        out.push(null);
      continue;
    }
    out.push(x.slice(k === f[0] ? f[1] : 0, k === t[0] ? t[1]
      : x.length));
  }
  return out;
}

/** Paste L at [k, off] of ref (in place); the caret [k, off]. */
function refPaste(ref, [k, off], L) {
  if (ref[k] === null) {
    k += off;
    ref.splice(k, 0, '');
    off = 0;
  }
  const p = ref[k], n = L.length;
  if (n === 1 && L[0] !== null) {
    ref[k] = p.slice(0, off) + L[0] + p.slice(off);
    return [k, off + L[0].length];
  }
  const first = L[0], last = L[n - 1];
  const head = p.slice(0, off) + (first === null ? '' : first);
  const mids = L.slice(first === null ? 0 : 1,
    last === null ? n : n - 1);
  const tail = (last === null ? '' : last) + p.slice(off);
  const drop = !head && first === null;
  const rep = [...(drop ? [] : [head]), ...mids, tail];
  ref.splice(k, 1, ...rep);
  const e = k + rep.length - 1;
  return [e, last === null ? 0 : last.length];
}

const show = (ref) => ref.map((x) => (x === null ? '#' : x));
const posOf = (d, [k, off]) => ({id: blockId(d.doc.sections[0]
  .blocks[k]), off});

describe('copy and paste in the same document (property)', () => {
  it('200 random sequences', () => {
    const r = rng(7077);
    for (let n = 0; n < 200; n++) {
      const list = Array.from({length: 1 + Math.floor(r() * 5)},
        () => (r() < 0.15 ? box() : randPara(r)));
      const d = mk(list);
      const before = snap(d);
      const ref = d.doc.sections[0].blocks.map((b) => (b.type === 'p'
        ? b.text : null));
      const steps = 1 + Math.floor(r() * 3);
      for (let st = 0; st < steps; st++) {
        const a = randPos(r, ref), b = randPos(r, ref);
        const sel = S.select(posOf(d, a), posOf(d, b));
        const s = slice(d.doc, sel);
        const [f, t] = cmp(a, b) <= 0 ? [a, b] : [b, a];
        const L = cmp(a, b) === 0 ? [] : refSlice(ref, f, t);
        if (!s) {
          assert.ok(!L.length || L.every((x) => x === ''), 'no slice');
          continue;
        }
        assert.deepEqual(show(L), s.blocks.map((x) => (x.type === 'p'
          ? x.text : '#')));
        const c = randPos(r, ref);
        const out = pasteBlocks(d, S.caret(posOf(d, c)), s.blocks,
          {sameDoc: true, styleNames: s.styleNames});
        const want = refPaste(ref, c, L);
        assert.deepEqual(texts(d), show(ref), 'seq ' + n);
        valid(d);
        const all = ids(d);
        assert.equal(new Set(all).size, all.length, 'unique ids');
        assert.deepEqual(at(d, out), want);
      }
      undoAll(d, before);
    }
  });
});
