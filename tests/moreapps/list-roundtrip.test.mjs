// List round trip: documents with lists edited with !Word's real
// keys and commands (./EditApply.run: Enter, Tab and Shift-Tab (a
// level deeper or higher at the start of an item), Backspace (at an
// item's start: the number taken away, then a join), Delete, the
// deletion of selections; ./FormatSet.setList: a level given
// outright, a step, Remove from list; typing; bursts of undo and
// redo), then written and read back. The checks are those of
// roundtrip-lib.mjs: the model read back equals the edited model;
// every block passes ModelCheck.checkBlock; the package linter and
// xmllint/wml.xsd (when available, for one seed) add no error; undo
// of everything gives back the opened model and its bytes. Also: the
// numbering part is written with the very bytes it had (editing
// changes only paragraphs' numPr, never the definitions), except in a
// run that made lists (Bullets, Numbering, Restart: ./newlist-
// commands.mjs, a few in the mix of the seeds with bit 1 set): there every original child of the
// numbering root must come back serialized identically and in order,
// the new ones only added (roundtrip-lib's "grown" rule). And the
// labels (./ListNumbers) can be worked out after every step.
//
// Documents: the list fixtures (list-fixtures.mjs: bullets,
// multilevel, two numIds on one abstractNum with a startOverride,
// legal, headings tied to a list, sparse levels, lvlRestart 0,
// sections and a table) and the corpus sample, gated as the other
// round trips (one file in ten by a hash of the name;
// WORD_EDIT_CORPUS=1 for every file). 40 seeded commands per file,
// carets often at the start of a list item (LIST_MS caps the time
// per file). Each kind of command must have run and changed a
// document.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {setList} from '../../tools/moreapps/!Word/FormatSet';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {listOf} from '../../tools/moreapps/!Word/ParaInd';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {makeCommand, MAKE_KINDS} from './newlist-commands.mjs';
import {rng} from './word-docs.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';

const STEPS = 40;
const LIST_MS = 3000;
const KEEP = ['numberingPart'];

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pick = (rd, a) => a[Math.floor(rd() * a.length)];

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

/**
 * A random caret or selection; half the carets at the start of a
 * list item (when there is one), where the list keys act.
 */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  if (rd() < 0.45) {
    const lists = bs.filter((b) => b.type === 'p' &&
      listOf(d.doc, b));
    if (lists.length) return S.caret({id: pick(rd, lists).id, off: 0});
  }
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.5) return S.caret(a);
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * 4)));
  return S.select(a, posIn(rd, bs[k2]));
}

/** One random command; returns [kind, sel after]. */
function command(rd, d, t, sel, every, makes) {
  const x = rd();
  if (x < 0.07) {
    let n = 1 + Math.floor(rd() * 4);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 3);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  if (makes && x < 0.2) return makeCommand(rd, d, t, sel, every);
  const key = (id) => run(id, d, t, sel) || sel;
  if (x < 0.22) return ['tab', key('tab')];
  if (x < 0.34) return ['shiftTab', key('shiftTab')];
  if (x < 0.48) return ['backspace', key('backspace')];
  if (x < 0.56) return ['enter', key('enter')];
  if (x < 0.62) return ['delete', key('delete')];
  if (x < 0.74) {
    const s = t.type(sel, pick(rd, ['x', 'word ', 'é', '\t']));
    return ['type', s];
  }
  const patch = pick(rd, [{level: Math.floor(rd() * 10) - 1},
    {by: 1}, {by: -1}, {off: true}, {off: true, keep: true}]);
  const kind = patch.off ? 'listOff' : 'setLevel';
  return [kind, setList(d, t, sel, patch).sel];
}

/** STEPS commands on d (see the header); {steps, capped, counts}. */
function listAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  let grows = false;
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > LIST_MS) break;
    if (!sel || rd() < 0.6) sel = randSel(rd, d);
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel] = command(rd, d, t, sel, every, (seed >>> 1) & 1);
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

const {xsd, note: xsdNote} = schema();
const KINDS = ['tab', 'shiftTab', 'backspace', 'enter', 'delete', 'type',
  'setLevel', 'listOff', 'undo/redo'];
const NUMBERED = FIXTURES.filter(([n]) => /numbering/.test(n));

describe('list round trip: generated documents', () => {
  const total = {};
  let kept = 0, asRead = 0, grown = 0;
  for (const [name, make] of [...LIST_DOCS, ...NUMBERED]) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          listAll, {xsd: k === 0 ? xsd : null, every: true,
            keep: KEEP});
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
        kept += res.kept;
        asRead += res.keptAsRead;
        grown += res.grown;
      }
    });
  }
  it('every kind of command ran and changed documents; the ' +
    'numbering part kept byte for byte', () => {
    console.log('# list commands (generated): ' + JSON.stringify(total));
    console.log(`# numbering part: ${kept} writes identical to the ` +
      `unedited write, ${asRead} also to the file as read, ${grown} ` +
      'grown by list-making commands (originals kept in order)');
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
      if (kind !== 'undo/redo')
        assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
    }
    const runs = (LIST_DOCS.length + NUMBERED.length) * 4;
    assert.equal(kept + grown, runs, 'every run had a numbering part');
    assert.ok(grown > 0 && kept > 0, 'both rules were used');
    assert.equal(asRead, kept, 'generated parts: as read too');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('list round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} list commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; numbering kept; undo restores', () =>
    corpusRun(files, listAll, xsd, xsdNote, 'list-edited corpus',
      {keep: KEEP}));
});
