// Edit / EditDel property test: random command sequences on random
// documents against a reference model (paragraph texts and a caret),
// keeping the model invariants; undoing everything gives back the
// original exactly (paragraph ids included), redoing the result.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {deepEqual} from '../../tools/moreapps/!Word/Model';
import {nextBoundary, prevBoundary, graphemes, nextWord, prevWord}
  from '../../tools/moreapps/!WimpLib/Segment';
import {rng} from './word-docs.mjs';
import {mk, texts, ids, valid, snap, raw, O, S, bold, plain}
  from './edit-docs.mjs';

const PIECES = ['a', 'b', ' ', '\u00e9', '\u{1F600}', 'e\u0301', '.',
  '\u{1F469}\u200d\u{1F4BB}', '\t', '\n', 'xyz'];

/** A random paragraph: runs plain/bold, maybe a link inline. */
function randPara(r) {
  const n = Math.floor(r() * 4);
  let text = '';
  const runs = [], inlines = {};
  for (let k = 0; k < n; k++) {
    let t = ['ab', 'c d', '\u{1F600}', 'hello', O][Math.floor(r() * 5)];
    if (t === O) inlines[text.length] = raw('hyperlink', 'p', 'l');
    const rPr = r() < 0.5 ? bold : plain;
    const last = runs[runs.length - 1];
    if (last && deepEqual(last.rPr, rPr)) last.end += t.length;
    else runs.push({start: text.length, end: text.length + t.length,
      rPr});
    text += t;
  }
  return [text, {runs, inlines, pPr: {jc: r() < 0.5 ? 'left'
    : 'right', extra: []}}];
}

/**
 * Reference: paragraph texts, their ids (null: a new paragraph, its
 * id not known yet) and the caret [k, off]. Merge rule: the first
 * paragraph's id survives unless it is left empty and the second
 * is not.
 */
class Ref {
  constructor(list, ids) {
    this.p = list.slice();
    this.ids = ids.slice();
  }
  del(k1, o1, k2, o2) {
    const p = this.p;
    const a = p[k1].slice(0, o1), b = p[k2].slice(o2);
    const id = !a && b ? this.ids[k2] : this.ids[k1];
    p.splice(k1, k2 - k1 + 1, a + b);
    this.ids.splice(k1, k2 - k1 + 1, id);
    return [k1, o1];
  }
  /** t typed at [k, off] (a \\n splits); br: a line break. */
  type([k, off], t, br = false) {
    if (br) {
      this.p[k] = this.p[k].slice(0, off) + '\n' + this.p[k].slice(off);
      return [k, off + 1];
    }
    const lines = t.split('\n');
    const s = this.p[k];
    const tail = s.slice(off);
    const out = [s.slice(0, off) + lines[0], ...lines.slice(1)];
    const n = out.length - 1;
    const end = out[n].length;
    out[n] += tail;
    this.p.splice(k, 1, ...out);
    this.ids.splice(k + 1, 0, ...out.slice(1).map(() => null));
    return [k + n, end];
  }
}

/** A random grapheme boundary in text. */
const randOff = (r, t) => {
  const g = graphemes(t);
  return g[Math.floor(r() * g.length)];
};

function step(r, d, ref, cur) {
  const p = ref.p;
  const [k, off] = cur;
  const id = (i) => ids(d)[i];
  const c = S.caret({id: id(k), off});
  const pick = r();
  if (pick < 0.3) {
    const n = 1 + Math.floor(r() * 3);
    let t = '';
    for (let j = 0; j < n; j++) t += PIECES[Math.floor(r() * 11)];
    const key = r() < 0.5 ? 'typing' : undefined;
    if (r() < 0.15 && !t.includes('\n')) {
      let e = off, m = graphemes(t).length - 1;
      while (m-- > 0 && e < p[k].length && !/[\t\n\ufffc]/.test(p[k][e]))
        e = nextBoundary(p[k], e);
      ref.del(k, off, k, e);
      return [E.typeText(d, c, t, {overwrite: true}),
        ref.type([k, off], t)];
    }
    return [E.typeText(d, c, t, {key}), ref.type(cur, t)];
  }
  if (pick < 0.4) return [E.splitPara(d, c), ref.type(cur, '\n')];
  if (pick < 0.45) return [E.lineBreak(d, c), ref.type(cur, '', true)];
  if (pick < 0.55) {
    if (off > 0) {
      const b = prevBoundary(p[k], off);
      return [X.deleteBack(d, c), ref.del(k, b, k, off)];
    }
    if (k === 0) return [X.deleteBack(d, c), cur];
    const keep = p[k - 1] !== '' || p[k] === '';
    const at = ref.del(k - 1, p[k - 1].length, k, 0);
    return [X.deleteBack(d, c), keep ? at : [k - 1, 0]];
  }
  if (pick < 0.65) {
    if (off < p[k].length) {
      const b = nextBoundary(p[k], off);
      return [X.deleteForward(d, c), ref.del(k, off, k, b)];
    }
    if (k === p.length - 1) return [X.deleteForward(d, c), cur];
    const at = ref.del(k, off, k + 1, 0);
    return [X.deleteForward(d, c), at];
  }
  if (pick < 0.7) {
    if (off === 0) return null;
    const b = prevWord(p[k], off);
    return [X.deleteWordBack(d, c), ref.del(k, b, k, off)];
  }
  if (pick < 0.75) {
    if (off === p[k].length) return null;
    const b = nextWord(p[k], off);
    return [X.deleteWordForward(d, c), ref.del(k, off, k, b)];
  }
  // a random selection: delete it, type over it, or Enter
  let k2 = Math.floor(r() * p.length);
  let o2 = randOff(r, p[k2]);
  let [k1, o1] = cur;
  const sel = S.select({id: id(k2), off: o2}, {id: id(k1), off: o1});
  if (k2 < k1 || (k2 === k1 && o2 < o1)) [k1, o1, k2, o2] = [k2, o2,
    k1, o1];
  const what = r();
  if (k1 === k2 && o1 === o2) return null;
  const at = ref.del(k1, o1, k2, o2);
  if (what < 0.5) return [X.deleteSelection(d, sel), at];
  if (what < 0.8) return [E.typeText(d, sel, 'Q'), ref.type(at, 'Q')];
  return [E.splitPara(d, sel), ref.type(at, '\n')];
}

describe('editing commands: random sequences', () => {
  it('300 sequences keep invariants, text and undo', () => {
    const r = rng(20261006);
    for (let seq = 0; seq < 300; seq++) {
      const list = [];
      const n = 1 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) list.push(randPara(r));
      const d = mk(list);
      const before = snap(d);
      const ref = new Ref(texts(d), ids(d));
      let cur = [Math.floor(r() * n), 0];
      cur[1] = randOff(r, ref.p[cur[0]]);
      for (let j = 0; j < 25; j++) {
        if (r() < 0.2) d.breakCoalesce();
        const mv = r() < 0.3;
        if (mv) {
          cur = [Math.floor(r() * ref.p.length), 0];
          cur[1] = randOff(r, ref.p[cur[0]]);
        }
        const res = step(r, d, ref, cur);
        if (!res) continue;
        const [sel, want] = res;
        const msg = 'seq ' + seq + ' step ' + j;
        valid(d);
        assert.deepEqual(texts(d), ref.p, msg);
        ref.ids = ref.ids.map((x, i) => (x === null ? ids(d)[i] : x));
        assert.deepEqual(ids(d), ref.ids, msg);
        assert.ok(S.collapsed(sel), msg);
        cur = [ids(d).indexOf(sel.head.id), sel.head.off];
        assert.deepEqual(cur, want, msg);
      }
      const after = snap(d);
      while (d.undo());
      assert.ok(deepEqual(d.doc.sections, before), 'undo ' + seq);
      while (d.redo());
      assert.ok(deepEqual(d.doc.sections, after), 'redo ' + seq);
    }
  });
});
