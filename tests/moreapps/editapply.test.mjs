// EditApply: the editing keys as commands, and the caret after an
// undo or redo (stepEnd); DocLayout keeping unchanged lines after an
// edit.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {mk, texts, ids, C, SEL, box} from './edit-docs.mjs';
import {tm} from './word-docs.mjs';

/** d with a layout, and a function: undo/redo -> [index, off]. */
function setup(blocks) {
  const d = mk(blocks);
  const t = new Typing(d);
  const m = tm();
  let L = new DocLayout(d.doc, m);
  L.layout(800);
  let ops = null;
  const relayout = () => {
    const old = L;
    L = new DocLayout(d.doc, m, old);
    L.layout(800);
    return L;
  };
  d.on('change', (ev) => { ops = ev.ops; });
  // (as EditView does: the layout is brought up to date first)
  const step = (kind) => {
    relayout();
    const old = L;
    d[kind]();
    const p = stepEnd(d.doc, ops, old);
    L = new DocLayout(d.doc, m, old);
    L.layout(800);
    return p && [ids(d).indexOf(p.id), p.off];
  };
  return {d, t, step, get L() { return L; }};
}

describe('EditApply.run', () => {
  it('runs the editing ids; others are undefined', () => {
    const {d, t} = setup(['ab']);
    assert.equal(run('undo', d, t, C(d, 0, 1)), undefined);
    assert.equal(run('nonsense', d, t, C(d, 0, 1)), undefined);
    run('enter', d, t, C(d, 0, 1));
    assert.deepEqual(texts(d), ['a', 'b']);
    run('backspace', d, t, C(d, 1, 0));
    assert.deepEqual(texts(d), ['ab']);
    run('tab', d, t, C(d, 0, 2));
    assert.equal(texts(d)[0], 'ab\t');
  });
});

describe('EditApply.stepEnd: the caret after undo and redo', () => {
  it('typing: undo -> where it began; redo -> after it', () => {
    const {d, t, step} = setup(['The fox']);
    t.type(C(d, 0, 4), 'quick ');
    assert.deepEqual(step('undo'), [0, 4]);
    assert.deepEqual(step('redo'), [0, 10]);
  });
  it('Backspace: undo -> after the character put back', () => {
    const {d, t, step} = setup(['abc']);
    run('backspace', d, t, C(d, 0, 2));
    assert.deepEqual(step('undo'), [0, 2]);
    assert.deepEqual(step('redo'), [0, 1]);
  });
  it('Enter: undo -> the split point; redo -> the new paragraph', () => {
    const {d, t, step} = setup(['Last paragraph.']);
    run('enter', d, t, C(d, 0, 4));
    assert.deepEqual(step('undo'), [0, 4]);
    assert.deepEqual(step('redo'), [1, 0]);
  });
  it('a join (Backspace at a start): undo -> start of the second', () => {
    const {d, t, step} = setup(['one', 'two']);
    run('backspace', d, t, C(d, 1, 0));
    assert.deepEqual(texts(d), ['onetwo']);
    assert.deepEqual(step('undo'), [1, 0]);
  });
  it('a surrogate pair is never split', () => {
    const {d, t, step} = setup(['a\u{1F600}b']);
    run('delete', d, t, C(d, 0, 0));
    assert.deepEqual(step('undo'), [0, 1]);
  });
  it('a table deleted: undo -> its edge', () => {
    const {d, t, step} = setup(['a', box(), 'b']);
    let s = run('delete', d, t, C(d, 0, 1));
    s = run('delete', d, t, s);
    assert.deepEqual(texts(d), ['a', 'b']);
    const p = step('undo');
    assert.equal(texts(d)[1], '#');
    assert.ok(p[0] === 1 || p[0] === 0, JSON.stringify(p));
  });
  it('a selection across paragraphs deleted: undo -> a valid place', () => {
    const {d, t, step} = setup(['one', 'two', 'three']);
    run('delete', d, t, SEL(d, 0, 1, 2, 2));
    assert.deepEqual(texts(d), ['oree']);
    const p = step('undo');
    assert.deepEqual(texts(d), ['one', 'two', 'three']);
    assert.ok(p && p[0] >= 0 && p[1] <= texts(d)[p[0]].length);
  });
  it('null for nothing', () => {
    const {d} = setup(['a']);
    assert.equal(stepEnd(d.doc, [], null), null);
    assert.equal(stepEnd(d.doc, [{op: 'compound', ops: []}], null), null);
  });
});

describe('DocLayout(doc, metrics, prev)', () => {
  it('keeps the lines of unchanged paragraphs, lays out the changed', () => {
    const {d, t, L: L0} = setup(['one', 'two', 'three']);
    const lines = L0.items.map((it) => it.lines);
    t.type(C(d, 1, 3), 'X');
    const L = new DocLayout(d.doc, L0.metrics, L0);
    L.layout(800);
    assert.equal(L.items[0].lines, lines[0]);
    assert.equal(L.items[2].lines, lines[2]);
    assert.notEqual(L.items[1].lines, lines[1]);
    assert.equal(L.items[1].block.text, 'twoX');
    assert.deepEqual(L.items.map((it) => it.id), d.doc.sections[0].blocks.map(blockId));
  });
  it('other metrics: nothing kept; invalidate() lays out all again', () => {
    const {d, L: L0} = setup(['one', 'two']);
    const L = new DocLayout(d.doc, tm(), L0);
    L.layout(800);
    assert.notEqual(L.items[0].lines, L0.items[0].lines);
    const before = L.items[1].lines;
    L.invalidate();
    L.layout(800);
    assert.notEqual(L.items[1].lines, before);
  });
});
