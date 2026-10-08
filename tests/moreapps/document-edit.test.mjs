// Document: coalesced undo steps, saved marker, history cap.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Word/Document';
import {newDoc} from '../../tools/moreapps/!Word/NewDoc';
import {deepEqual, clone} from '../../tools/moreapps/!Word/Model';

const mk = (text = '') => {
  const d = new Document(newDoc());
  if (text) d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
    ins: text});
  d.clearHistory();
  d.markSaved();
  return d;
};
const text = (d) => d.doc.sections[0].blocks.map((b) => b.text);
const T = (d) => text(d)[0];
const ins = (at, s) => ({op: 'replaceText', block: [0, 0], at, del: 0,
  ins: s});
const typeAt = (d, at, s, key = 'typing') =>
  d.apply(ins(at, s), {coalesce: key});

describe('coalescing', () => {
  it('two keyed inserts are one undo step', () => {
    const d = mk('ab');
    typeAt(d, 2, 'c');
    typeAt(d, 3, 'd');
    assert.equal(T(d), 'abcd');
    assert.equal(d.undoDepth, 1);
    assert.ok(d.undo());
    assert.equal(T(d), 'ab');
    assert.equal(d.canUndo, false);
    assert.ok(d.redo());
    assert.equal(T(d), 'abcd');
  });
  it('a key change starts a new step', () => {
    const d = mk();
    typeAt(d, 0, 'a', 'k1');
    typeAt(d, 1, 'b', 'k2');
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.equal(T(d), 'a');
  });
  it('breakCoalesce starts a new step', () => {
    const d = mk();
    typeAt(d, 0, 'a');
    d.breakCoalesce();
    typeAt(d, 1, 'b');
    assert.equal(d.undoDepth, 2);
  });
  it('an unkeyed apply breaks the run', () => {
    const d = mk();
    typeAt(d, 0, 'a');
    d.apply(ins(1, 'x'));
    typeAt(d, 2, 'b');
    assert.equal(d.undoDepth, 3);
  });
  it('null key never merges', () => {
    const d = mk();
    typeAt(d, 0, 'a', null);
    typeAt(d, 1, 'b', null);
    assert.equal(d.undoDepth, 2);
  });
  it('keyed apply after undo does not merge', () => {
    const d = mk();
    typeAt(d, 0, 'a');
    typeAt(d, 1, 'b');
    d.undo();
    typeAt(d, 0, 'c');
    assert.equal(d.undoDepth, 1);
    assert.equal(d.canRedo, false);
    d.undo();
    assert.equal(T(d), '');
    d.redo();
    typeAt(d, 1, 'z');
    assert.equal(d.undoDepth, 2, 'redo breaks the run too');
  });
  it('new edits clear redo', () => {
    const d = mk();
    typeAt(d, 0, 'a');
    d.undo();
    assert.ok(d.canRedo);
    typeAt(d, 0, 'b');
    assert.equal(d.canRedo, false);
  });
  it('groups coalesce, nested groups are one step', () => {
    const d = mk('x');
    const edit = (at, s) => d.group(() => {
      d.apply(ins(at, s));
      d.group(() => d.apply(ins(at + 1, '!')));
    }, {coalesce: 'g'});
    edit(1, 'a');
    edit(3, 'b');
    assert.equal(T(d), 'xa!b!');
    assert.equal(d.undoDepth, 1);
    let n = 0;
    d.on('change', () => n++);
    d.undo();
    assert.equal(T(d), 'x');
    assert.equal(n, 1);
    d.redo();
    assert.equal(T(d), 'xa!b!');
  });
  it('a nested group key is ignored in favour of the outer', () => {
    const d = mk();
    d.group(() => d.group(() => d.apply(ins(0, 'a')), {coalesce: 'in'}),
      {coalesce: 'out'});
    d.group(() => d.apply(ins(1, 'b')), {coalesce: 'out'});
    assert.equal(d.undoDepth, 1);
  });
  it('failing ops leave history untouched', () => {
    const d = mk('ab');
    typeAt(d, 2, 'c');
    assert.throws(() => typeAt(d, 99, 'd'), RangeError);
    typeAt(d, 3, 'e');
    assert.equal(d.undoDepth, 1);
    assert.throws(() => d.group(() => d.apply(ins(99, 'q')),
      {coalesce: 'typing'}), RangeError);
    d.undo();
    assert.equal(T(d), 'ab');
  });
  it('a throwing listener does not break history', () => {
    const d = mk();
    const errs = [];
    d.onListenerError = (e) => errs.push(e);
    d.on('change', () => { throw new Error('boom'); });
    typeAt(d, 0, 'a');
    typeAt(d, 1, 'b');
    assert.equal(d.undoDepth, 1);
    assert.equal(errs.length, 2);
    d.undo();
    assert.equal(T(d), '');
  });
  it('undo and redo inside a group still throw', () => {
    const d = mk();
    d.apply(ins(0, 'a'));
    assert.throws(() => d.group(() => d.undo()), /inside a group/);
    d.undo();
    assert.throws(() => d.group(() => d.redo()), /inside a group/);
  });
  it('coalesced undo order is newest first (multi-op)', () => {
    const d = mk('ab');
    const split = {op: 'splitBlock', block: [0, 0], at: 1};
    d.group(() => d.apply(split), {coalesce: 'k'});
    d.group(() => d.apply(ins(0, 'Z')), {coalesce: 'k'});
    assert.deepEqual(text(d), ['Za', 'b']);
    d.undo();
    assert.deepEqual(text(d), ['ab']);
    d.redo();
    assert.deepEqual(text(d), ['Za', 'b']);
  });
});

describe('dirty and saved marker', () => {
  it('fresh doc is clean, edit dirties, undo cleans', () => {
    const d = mk();
    assert.equal(d.dirty, false);
    d.apply(ins(0, 'a'));
    assert.equal(d.dirty, true);
    d.undo();
    assert.equal(d.dirty, false);
    d.redo();
    assert.equal(d.dirty, true);
  });
  it('change events carry dirty', () => {
    const d = mk();
    const seen = [];
    d.on('change', (e) => seen.push([e.kind, e.dirty]));
    d.apply(ins(0, 'a'));
    d.undo();
    d.redo();
    assert.deepEqual(seen,
      [['apply', true], ['undo', false], ['redo', true]]);
  });
  it('markSaved, edit, undo past it, redo back', () => {
    const d = mk();
    d.apply(ins(0, 'a'));
    d.apply(ins(1, 'b'));
    d.markSaved();
    assert.equal(d.dirty, false);
    d.apply(ins(2, 'c'));
    assert.equal(d.dirty, true);
    d.undo();
    assert.equal(d.dirty, false);
    d.undo();
    assert.equal(d.dirty, true);
    d.redo();
    assert.equal(d.dirty, false);
  });
  it('markSaved ends the run: the saved state stays reachable', () => {
    const d = mk();
    for (const [i, c] of [...'abc'].entries()) typeAt(d, i, c);
    d.markSaved();
    for (const [i, c] of [...'def'].entries()) typeAt(d, 3 + i, c);
    assert.equal(d.undoDepth, 2);
    assert.equal(d.dirty, true);
    d.undo();
    assert.equal(T(d), 'abc');
    assert.equal(d.dirty, false);
  });
  it('an edit that drops redo steps past the saved one is dirty', () => {
    const d = mk();
    d.apply(ins(0, 'a'));
    d.markSaved();
    d.undo();
    d.apply(ins(0, 'b'));
    d.undo();
    d.redo();
    assert.equal(d.dirty, true);
    d.undo();
    assert.equal(d.dirty, true);
  });
  it('clearHistory keeps the saved state', () => {
    const d = mk();
    d.apply(ins(0, 'a'));
    d.markSaved();
    d.clearHistory();
    assert.equal(d.dirty, false);
    assert.equal(d.canUndo, false);
    d.apply(ins(1, 'b'));
    assert.equal(d.dirty, true);
    d.clearHistory();
    assert.equal(d.dirty, true);
  });
});

describe('stateId and markSavedAt (saving while editing)', () => {
  it('stateId is the state: same after undo and redo back', () => {
    const d = mk();
    const a = d.stateId;
    d.apply(ins(0, 'a'));
    const b = d.stateId;
    assert.notEqual(a, b);
    d.undo();
    assert.equal(d.stateId, a);
    d.redo();
    assert.equal(d.stateId, b);
  });
  it('markSavedAt the current state is markSaved', () => {
    const d = mk();
    d.apply(ins(0, 'a'));
    d.markSavedAt(d.stateId);
    assert.equal(d.dirty, false);
  });
  it('an edit after the capture stays dirty; undo to it is clean',
    () => {
      const d = mk();
      typeAt(d, 0, 'a');
      d.breakCoalesce();                // (as a save does)
      const id = d.stateId;
      typeAt(d, 1, 'b');                // typed during the write
      d.markSavedAt(id);
      assert.equal(d.dirty, true);
      d.undo();
      assert.equal(T(d), 'a');
      assert.equal(d.dirty, false);
      d.redo();
      assert.equal(d.dirty, true);
    });
  it('markSavedAt keeps the saved state addressable', () => {
    const d = mk();
    typeAt(d, 0, 'a');
    d.markSavedAt(d.stateId);
    typeAt(d, 1, 'b');
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.equal(d.dirty, false);
  });
  it('an undo during the write: redo back is clean', () => {
    const d = mk();
    d.apply(ins(0, 'a'));
    const id = d.stateId;
    d.undo();
    d.markSavedAt(id);
    assert.equal(d.dirty, true);
    d.redo();
    assert.equal(d.dirty, false);
  });
});

describe('bounded merged steps', () => {
  it('a long typing run splits into steps of <= 128 ops', () => {
    const d = mk('start');
    const before = clone(d.doc.sections);
    for (let i = 0; i < 1000; i++) typeAt(d, 5 + i, 'x');
    const after = clone(d.doc.sections);
    assert.ok(d.undoDepth >= 8 && d.undoDepth <= 10, d.undoDepth);
    for (const st of d._h.undo) assert.ok(st.n <= 128, 'n ' + st.n);
    while (d.undo());
    assert.ok(deepEqual(d.doc.sections, before));
    while (d.redo());
    assert.ok(deepEqual(d.doc.sections, after));
  });
  it('maxMerge is settable', () => {
    const d = mk();
    d._h.maxMerge = 2;
    for (let i = 0; i < 6; i++) typeAt(d, i, 'x');
    assert.equal(d.undoDepth, 3);
  });
  it('typing 5000 chars stays fast', () => {
    const d = mk();
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) typeAt(d, i, 'x');
    while (d.undo());
    assert.ok(performance.now() - t0 < 10000);   // (loose: a loaded machine)
    assert.equal(T(d), '');
  });
  it('maxSteps ignores junk and trims when lowered', () => {
    const d = mk();
    for (let i = 0; i < 10; i++) d.apply(ins(i, 'x'));
    d.maxSteps = NaN;
    d.maxSteps = 'a';
    assert.equal(d.maxSteps, 1000);
    d.maxSteps = 4;
    assert.equal(d.undoDepth, 4);
  });
});

describe('history cap', () => {
  it('keeps 1000 steps and stays dirty when saved was dropped', () => {
    const d = mk();
    assert.equal(d.maxSteps, 1000);
    for (let i = 0; i < 1010; i++) d.apply(ins(i, 'x'));
    assert.equal(d.undoDepth, 1000);
    assert.equal(d.dirty, true);
    while (d.undo());
    assert.equal(T(d).length, 10);
    assert.equal(d.dirty, true, 'saved state is gone');
    d.markSaved();
    assert.equal(d.dirty, false);
    d.redo();
    assert.equal(d.dirty, true);
  });
  it('saved state at the oldest kept step stays reachable', () => {
    const d = mk();
    d.maxSteps = 3;
    d.apply(ins(0, 'a'));
    d.apply(ins(1, 'b'));
    d.markSaved();
    d.apply(ins(2, 'c'));
    d.apply(ins(3, 'd'));
    d.apply(ins(4, 'e'));
    assert.equal(d.undoDepth, 3);
    d.undo();
    d.undo();
    assert.equal(d.dirty, true);
    d.undo();
    assert.equal(T(d), 'ab');
    assert.equal(d.dirty, false);
  });
  it('coalescing still obeys the cap', () => {
    const d = mk();
    d.maxSteps = 5;
    for (let i = 0; i < 3000; i++) typeAt(d, i, 'x');
    assert.equal(d.undoDepth, 5);
  });
});

describe('property: undo/redo restore snapshots', () => {
  function rng(seed) {
    let s = seed;
    return (n) => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return Math.floor(s / 4294967296 * n);
    };
  }
  const snap = (d) => clone(d.doc.sections);
  for (let seed = 1; seed <= 200; seed++) {
    it('sequence ' + seed, () => {
      const R = rng(seed);
      const d = mk('hello');
      let tok = 0;
      const states = [{s: snap(d), t: 0}];
      let pos = 0, key = null, saved = 0, can = false;
      for (let i = 0; i < 40; i++) {
        const c = R(10);
        if (c < 5) {
          const blocks = d.doc.sections[0].blocks;
          const bi = R(blocks.length);
          const len = blocks[bi].text.length;
          const kd = R(3) ? ['a', 'b'][R(2)] : null;
          let op;
          const k = R(6);
          if (k < 3) op = {op: 'replaceText', block: [0, bi],
            at: R(len + 1), del: 0, ins: 'q'};
          else if (k === 3 && len) op = {op: 'replaceText',
            block: [0, bi], at: R(len), del: 1, ins: ''};
          else if (k === 4) op = {op: 'splitBlock', block: [0, bi],
            at: R(len + 1)};
          else if (bi < blocks.length - 1) op = {op: 'mergeBlock',
            block: [0, bi]};
          else op = {op: 'replaceText', block: [0, bi], at: 0, del: 0,
            ins: 'w'};
          const group = R(2);
          if (group) d.group(() => d.apply(op), {coalesce: kd});
          else d.apply(op, {coalesce: kd});
          states.length = pos + 1;
          const merge = kd !== null && kd === key && can && pos > 0;
          tok++;
          if (merge) states[pos] = {s: snap(d), t: tok};
          else { states.push({s: snap(d), t: tok}); pos++; }
          key = kd;
          can = true;
        } else if (c < 7) {
          if (d.undo()) { pos--; key = null; }
        } else if (c < 8) {
          if (d.redo()) { pos++; key = null; }
        } else if (c < 9) {
          d.breakCoalesce();
          key = null;
        } else {
          d.markSaved();
          saved = states[pos].t;
          key = null;
        }
        assert.ok(deepEqual(d.doc.sections, states[pos].s),
          'state at step ' + i);
        assert.equal(d.dirty, states[pos].t !== saved, 'dirty ' + i);
        assert.equal(d.canUndo, pos > 0);
        assert.equal(d.canRedo, pos < states.length - 1);
      }
    });
  }
});

describe('atomic', () => {
  it('a throw undoes the group\'s ops and records nothing', () => {
    const d = mk('ab');
    d.apply(ins(2, 'c'));
    d.undo();
    const n = d.undoDepth;
    assert.throws(() => d.atomic(() => {
      d.apply(ins(0, 'x'));
      d.apply(ins(1, 'y'));
      throw new Error('boom');
    }), /boom/);
    assert.equal(T(d), 'ab');
    assert.equal(d.undoDepth, n);
    assert.ok(d.canRedo);
  });
  it('a rollback that fails: nothing recorded, the first error', () => {
    const d = mk('ab');
    const n = d.undoDepth;
    let err;
    try {
      d.atomic(() => {
        d.apply(ins(0, 'x'));
        // break the doc so that undoing the insert fails
        d.doc.sections[0].blocks = [];
        throw new Error('first');
      });
    } catch (e) { err = e; }
    assert.equal(err.message, 'first');
    assert.ok(err.cause instanceof RangeError);
    assert.equal(d.undoDepth, n);
    assert.equal(d.canRedo, false);
  });
  it('nested in a group: only its own ops are undone', () => {
    const d = mk('ab');
    d.group(() => {
      d.apply(ins(0, 'x'));
      assert.throws(() => d.atomic(() => {
        d.apply(ins(0, 'y'));
        throw new Error('boom');
      }));
    });
    assert.equal(T(d), 'xab');
    assert.equal(d.undoDepth, 1);
  });
  it('returns fn\'s value and is one step', () => {
    const d = mk('ab');
    assert.equal(d.atomic(() => {
      d.apply(ins(0, 'x'));
      d.apply(ins(0, 'y'));
      return 7;
    }), 7);
    assert.equal(T(d), 'yxab');
    assert.equal(d.undoDepth, 1);
  });
});
