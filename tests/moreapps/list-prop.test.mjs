// ListNumbers property test: random documents and random edits,
// labels compared with a slow reference written here independently
// (each counter found by scanning back to its last restart).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {formatNumber} from '../../tools/moreapps/!Word/NumFormat';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {newStyleTable, addStyle, setDefault}
  from '../../tools/moreapps/!Word/Styles';

/** Small seeded generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FMTS = ['decimal', 'lowerLetter', 'upperRoman', 'decimalZero'];

/** Random levels (with the heading pStyles when `heads`). */
function randomLevels(R, heads) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const levels = [];
  for (let k = 0; k < 9; k++) {
    let t = '';
    for (let j = 0; j <= k; j++) if (R() < 0.6 || j === k)
      t += `%${j + 1}` + pick(['.', ')', '-', '']);
    const l = {ilvl: k, numFmt: pick(FMTS), lvlText: t,
      start: Math.floor(R() * 3)};
    const r = R();
    if (r < 0.15) l.lvlRestart = 0;
    else if (r < 0.35 && k > 0) l.lvlRestart = 1 + Math.floor(R() * k);
    if (R() < 0.1) l.isLgl = true;
    if (heads && k < 2) l.pStyle = 'Heading' + (k + 1);
    levels.push(l);
  }
  return levels;
}

/** A Num over `levels` (copied) with random startOverrides. */
function randomNum(R, abstractNumId, levels) {
  const overrides = new Map();
  for (let k = 0; k < 9; k++)
    if (R() < 0.15) overrides.set(k, {start: Math.floor(R() * 9)});
  return {abstractNumId, levels: structuredClone(levels), overrides};
}

function styles() {
  const t = newStyleTable();
  const sty = (id, o) => addStyle(t, {id, type: 'paragraph',
    pPr: {extra: [], ...o}, rPr: {extra: []}, extra: [], raw: null,
    basedOn: id === 'Normal' ? undefined : 'Normal'});
  sty('Normal', {});
  setDefault(t, 'paragraph', 'Normal');
  sty('Heading1', {numPr: {numId: 1}});
  sty('Heading2', {numPr: {numId: 1}});
  return t;
}

/** A random block: plain, kept, list (numId 0..4) or heading. */
function randomBlock(R) {
  const r = R();
  if (r < 0.1) return {type: 'opaque', node: {name: 'w:tbl',
    attrs: [], children: []}};
  if (r < 0.2) return newPara('p');
  if (r < 0.3) return newPara('h', {pStyle: R() < 0.5 ? 'Heading1'
    : 'Heading2'});
  if (r < 0.33) return newPara('h', {pStyle: 'Heading1',
    pPr: {numPr: {numId: 0}}});
  return newPara('l', {pPr: {numPr: {numId: Math.floor(R() * 5),
    ilvl: Math.floor(R() * 9)}}});
}

/** The reference: (numId, ilvl) of a paragraph, or null. */
function refNumPr(p, nums) {
  let np = p.pPr.numPr;
  if (!np && p.pStyle) np = {numId: 1,
    ilvl: p.pStyle === 'Heading1' ? 0 : 1};
  if (!np || np.numId === 0 || !nums.has(np.numId)) return null;
  return np;
}

/**
 * Reference labels: a counter is found by scanning backwards over
 * the paragraphs of the same abstractNum to its last restart, or to
 * the paragraph where a numId's startOverride took effect (the first
 * paragraph of that numId at that level).
 */
function reference(doc) {
  const nums = doc.numbering.nums;
  const seq = [];
  for (const s of doc.sections) for (const b of s.blocks) {
    if (b.type !== 'p') continue;
    const np = refNumPr(b, nums);
    if (!np) continue;
    const it = {id: b.id, numId: np.numId, ilvl: np.ilvl,
      abs: nums.get(np.numId).abstractNumId};
    const first = !seq.some((q) => q.numId === it.numId &&
      q.ilvl === it.ilvl);
    const o = nums.get(np.numId).overrides.get(np.ilvl);
    if (first && o) it.override = o.start;
    seq.push(it);
  }
  const out = new Map();
  for (let i = 0; i < seq.length; i++) {
    const {numId, ilvl, abs} = seq[i];
    const num = nums.get(numId);
    const startOf = (j) => num.levels[j].start;
    const restarts = (j, k) => {
      const r = num.levels[j].lvlRestart;
      return r === undefined || (r > 0 && k < r);
    };
    const value = (j) => {
      let n = 0;
      for (let q = i; q >= 0; q--) {
        const it = seq[q];
        if (it.abs !== abs) continue;
        if (it.ilvl === j) {
          n++;
          if (it.override !== undefined) return it.override + n - 1;
        } else if (it.ilvl < j && restarts(j, it.ilvl)) break;
      }
      return n === 0 ? startOf(j) : startOf(j) + n - 1;
    };
    const lvl = num.levels[ilvl];
    const text = lvl.lvlText.replace(/%([1-9])/g, (_, d) => {
      const j = Number(d) - 1;
      return formatNumber(value(j), lvl.isLgl ? 'decimal'
        : num.levels[j].numFmt);
    });
    out.set(seq[i].id, text.slice(0, 40));
  }
  return out;
}

function check(doc, why) {
  const got = labels(doc);
  const want = reference(doc);
  assert.equal(got.size, want.size, why + ' size');
  for (const [id, t] of want)
    assert.equal(got.has(id) && got.get(id).text, t, why + ' id ' + id);
}

describe('ListNumbers property: matches the reference', () => {
  it('random documents and random edits', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const R = rng(seed);
      // numIds 1 and 2 share abstractNum 0 (and so its counters),
      // with their own startOverrides; numId 3 has abstractNum 1
      const shared = randomLevels(R, true);
      const nums = new Map([[1, randomNum(R, 0, shared)],
        [2, randomNum(R, 0, shared)],
        [3, randomNum(R, 1, randomLevels(R, false))]]);
      const sec = () => Array.from({length: Math.floor(R() * 25)},
        () => randomBlock(R));
      const doc = {sections: [{props: {extra: []}, blocks: sec(),
        raw: null}, {props: {extra: []}, blocks: sec(), raw: null}],
      styles: styles(), numbering: {raw: null, nums},
      parts: new Map(), rels: [], meta: {}, rawSettings: null};
      check(doc, `seed ${seed}`);
      for (let e = 0; e < 25; e++) {
        const bs = doc.sections[Math.floor(R() * 2)].blocks;
        const at = Math.floor(R() * (bs.length + 1));
        const r = R();
        if (r < 0.4) bs.splice(at, 0, randomBlock(R));
        else if (r < 0.6 && bs.length) bs.splice(at % bs.length, 1);
        else if (bs.length) {
          const old = bs[at % bs.length];
          const np = old.type === 'p' && old.pPr.numPr;
          if (np && np.numId) bs[at % bs.length] = newPara('l',
            {pPr: {numPr: {numId: np.numId,
              ilvl: Math.floor(R() * 9)}}});
        }
        check(doc, `seed ${seed} edit ${e}`);
      }
    }
  });
});
