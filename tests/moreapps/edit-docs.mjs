// Test-only helpers for the !Letters editing command tests (Edit,
// EditDel): Documents built from paragraphs and kept blocks, and
// what to look at after a command.
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {checkBlock, deepEqual, newPara, sameStories}
  from '../../tools/moreapps/!Letters/Model';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {box, el, raw, O} from './word-docs.mjs';

export {box, el, raw, O, S};

const para = (x) => (typeof x === 'string' ? newPara(x)
  : newPara(x[0], x[1]));

/**
 * A Document over newDoc() (so it can be written, and has the built-in
 * styles) whose first section holds `blocks`: strings, [text, opts]
 * for newPara, or blocks. History cleared.
 */
export function mk(blocks, {styles = true} = {}) {
  const doc = newDoc({date: new Date(Date.UTC(2026, 0, 1))});
  doc.sections[0].blocks = blocks.map((b) => (b && b.type ? b
    : para(b)));
  if (!styles) doc.styles = null;
  const d = new Document(doc);
  d.clearHistory();
  return d;
}

export const blocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
/** Block texts; a kept block is '#'. */
export const texts = (d) => blocks(d).map((b) => (b.type === 'p'
  ? b.text : '#'));
export const ids = (d) => blocks(d).map(blockId);
export const P = (d, k) => blocks(d)[k];
/** Caret at block k, offset off. */
export const C = (d, k, off) => S.caret({id: blockId(P(d, k)), off});
/** Selection from (k1, o1) to (k2, o2). */
export const SEL = (d, k1, o1, k2, o2) => S.select(
  {id: blockId(P(d, k1)), off: o1}, {id: blockId(P(d, k2)), off: o2});
/** [block index, off] of the selection's head, collapsed asserted. */
export function at(d, sel) {
  assert.ok(S.collapsed(sel), 'collapsed');
  assert.equal(sel.affinity, 'down');
  assert.equal(sel.goalX, null);
  return [ids(d).indexOf(sel.head.id), sel.head.off];
}
export const snap = (d) => structuredClone(d.doc.sections);
/** A copy of the stories (headers and footers: Batch D, D9). */
export const snapStories = (d) => structuredClone(d.doc.stories);
/** Every block valid. */
export function valid(d) {
  for (const b of blocks(d)) checkBlock(b);
}
/** Undo everything and compare with a snapshot (and, given one,
 *  with snapStories' copy: ModelCheck sameStories). */
export function undoAll(d, before, stories) {
  while (d.undo());
  assert.ok(deepEqual(d.doc.sections, before), 'undo restores all');
  if (stories !== undefined)
    assert.ok(sameStories(d.doc.stories, stories), 'stories restored');
}
/** Run cmd, check one undo step (or none), undo restores exactly. */
export function undoable(d, cmd) {
  const before = snap(d), sb = snapStories(d);
  const n = d.undoDepth;
  const out = cmd();
  valid(d);
  const after = snap(d), sa = snapStories(d);
  if (d.undoDepth > n) {
    assert.equal(d.undoDepth, n + 1, 'one undo step');
    d.undo();
    assert.ok(deepEqual(d.doc.sections, before), 'undo exact');
    assert.ok(sameStories(d.doc.stories, sb), 'undo: stories exact');
    d.redo();
    assert.ok(deepEqual(d.doc.sections, after), 'redo exact');
    assert.ok(sameStories(d.doc.stories, sa), 'redo: stories exact');
  }
  return out;
}
export const bold = {b: true, extra: []};
export const plain = {extra: []};
