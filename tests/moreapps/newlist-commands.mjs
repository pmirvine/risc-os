// Random list-making commands for the round-trip tests
// (newlist-roundtrip.test.mjs, list-roundtrip.test.mjs): what the
// toolbar, the gallery, the list menu and AutoFormat run. Commands
// refused (RangeError) must change nothing: no undo step and the
// document, numbering, relationships, styles and meta as they were.
//
//   makeCommand(rd, d, t, sel, every) -> [kind, sel after]
//   newListAll(d, seed, {every}) -> {steps, capped, counts, grows}
//               STEPS (40) random commands: these and the list keys
//   MAKE_KINDS  the kinds: bullets, numbering, restart, continue,
//               autoformat (each also 'changed' / 'refused')
import assert from 'node:assert/strict';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {setList} from '../../tools/moreapps/!Word/FormatSet';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {listOf} from '../../tools/moreapps/!Word/ParaInd';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {rng} from './word-docs.mjs';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import {afterSpace} from '../../tools/moreapps/!Word/AutoList';
import {ENTRIES} from '../../tools/moreapps/!Word/ListGallery';
import * as S from '../../tools/moreapps/!Word/Selection';
import {deepEqual} from '../../tools/moreapps/!Word/ModelCheck';

const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const BULLET_IDS = ENTRIES.filter((e) => e.kind === 'bullet')
  .map((e) => e.id);
const NUMBER_IDS = ENTRIES.filter((e) => e.kind === 'number')
  .map((e) => e.id);
const STARTS = [1, 1, 5, 0, 9, 32767, 2 ** 31 - 1, 2 ** 31, -1, 1.5,
  'x', null];
const MARKERS = ['* ', '- ', '> ', '1. ', '2) ', '(3) ', 'a. ', 'B. ',
  'i. ', 'IV. ', 'v. ', '10. ', '1.5 ', 'a) ', 'x '];

export const MAKE_KINDS = ['bullets', 'numbering', 'restart', 'continue',
  'autoformat'];

const whole = (d) => structuredClone({sections: d.doc.sections,
  numbering: d.doc.numbering, rels: d.doc.rels, styles: d.doc.styles,
  meta: d.doc.meta});

/** One random list-making command (see the header). */
export function makeCommand(rd, d, t, sel, every) {
  const x = rd();
  let kind, run;
  if (x < 0.3) {
    kind = 'bullets';
    const id = pick(rd, [undefined, undefined, ...BULLET_IDS, 'zzz',
      '1.']);
    run = () => FA.apply('bullets', d, t, sel, id);
  } else if (x < 0.6) {
    kind = 'numbering';
    const id = pick(rd, [undefined, undefined, ...NUMBER_IDS, 'zzz',
      'disc']);
    run = () => FA.apply('numbering', d, t, sel, id);
  } else if (x < 0.75) {
    kind = 'restart';
    const a = pick(rd, STARTS);
    run = () => FA.apply('listRestart', d, t, sel, a);
  } else if (x < 0.85) {
    kind = 'continue';
    run = () => FA.apply('listContinue', d, t, sel);
  } else {
    kind = 'autoformat';
    const text = pick(rd, MARKERS);
    const para = d.doc.sections.flatMap((q) => q.blocks)
      .find((b) => b.type === 'p' && b.id === sel.head.id);
    if (!para) return ['autoformat none', sel];
    run = () => {
      // type the marker at the start of the caret's paragraph, then
      // the converting space
      let s = S.caret({id: para.id, off: 0});
      for (const ch of text.slice(0, -1)) s = t.type(s, ch);
      s = t.type(s, ' ');
      return {sel: afterSpace(d, t, s, {typed: ' '}) || s};
    };
  }
  const depth = d.undoDepth;
  const before = every ? whole(d) : null;
  try {
    const res = run();
    return [kind, res && res.sel ? res.sel : sel];
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    if (kind === 'autoformat') throw e;
    assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
    if (before) {
      const now = whole(d);
      for (const k of Object.keys(before)) {
        assert.ok(deepEqual(now[k], before[k]), kind +
          ' refused: ' + k + ' unchanged');
      }
    }
    return [kind + ' refused', sel];
  }
}

export const STEPS = 40;
const NEWLIST_MS = 3000;

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

/** A random caret or selection (often over a few paragraphs). */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  if (rd() < 0.25) {
    const lists = bs.filter((b) => b.type === 'p' && listOf(d.doc, b));
    if (lists.length) return S.caret({id: pick(rd, lists).id, off: 0});
  }
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.3) return S.caret(a);
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * (rd() < 0.1 ? bs.length : 5))));
  return S.select(a, posIn(rd, bs[k2]));
}

/** Other commands: the list keys, typing, undo and redo. */
function other(rd, d, t, sel) {
  const x = rd();
  if (x < 0.25) {
    let n = 1 + Math.floor(rd() * 4);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 3);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  const key = (id) => run(id, d, t, sel) || sel;
  if (x < 0.4) return ['tab', key('tab')];
  if (x < 0.55) return ['shiftTab', key('shiftTab')];
  if (x < 0.7) return ['backspace', key('backspace')];
  if (x < 0.8) return ['enter', key('enter')];
  if (x < 0.9)
    return ['type', t.type(sel, pick(rd, ['x', 'word ', 'é', '\t']))];
  const patch = pick(rd, [{level: Math.floor(rd() * 10) - 1},
    {by: 1}, {by: -1}, {off: true}]);
  return [patch.off ? 'listOff' : 'setLevel', setList(d, t, sel, patch).sel];
}

/** STEPS commands on d (see the header). */
export function newListAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  let grows = false;
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > NEWLIST_MS) break;
    if (!sel || rd() < 0.5) sel = randSel(rd, d);
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel] = sel && rd() < 0.6 ? makeCommand(rd, d, t, sel, every)
        : other(rd, d, t, sel);
      if (every) {
        for (const b of allBlocks(d)) checkBlock(b);
        labels(d.doc);
      }
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
    if (d.undoDepth > depth) {
      counts[kind + ' changed'] = (counts[kind + ' changed'] || 0) + 1;
      if (MAKE_KINDS.includes(kind)) grows = true;
    }
  }
  for (const b of allBlocks(d)) checkBlock(b);
  labels(d.doc);
  return {steps: k, capped: k < STEPS, counts, grows};
}

