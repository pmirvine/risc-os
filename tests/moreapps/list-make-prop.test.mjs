// ListMake property test: random Bullets / Numbering toggles (with
// and without a gallery entry), Restart / Start at, Continue and
// Tab / Shift-Tab on random documents (kept blocks among the
// paragraphs), compared after every command with a reference model
// written here independently: which paragraphs share a list, and the
// labels a simple counter gives them (one count per definition, as
// ruling G4: Restart's new list shares its definition's count and
// starts again once; a restart that changes no label does nothing;
// a new list takes an unused one of the same definition whose
// definition no list in use shares). Undo of everything gives the
// opened document back exactly (numbering, relationships, styles and
// meta too).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {toggleList, restart, continueList}
  from '../../tools/moreapps/!Word/ListMake';
import {setList} from '../../tools/moreapps/!Word/FormatList';
import {entryOf} from '../../tools/moreapps/!Word/ListGallery';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {formatNumber} from '../../tools/moreapps/!Word/NumFormat';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {mk, box, blocks, C, SEL} from './edit-docs.mjs';

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

const ENTRIES = [null, 'disc', 'square', '1.', 'a)', 'I.'];
const DEFAULT = {bullet: 'disc', number: '1.'};
const kindOf = (id) => entryOf(id).kind;

/**
 * The reference: paras [{num, ilvl}] (num a list object or null);
 * a list {abs: {entry}, over: Map(level -> start)}.
 */
class Model {
  constructor(n) {
    this.paras = Array.from({length: n}, () => ({num: null, ilvl: 0}));
    this.lists = [];                     // every list made, in order
  }

  /** A new list, remembered. */
  make(abs, over) {
    const l = {abs, over};
    this.lists.push(l);
    return l;
  }

  /** An unused list of entry e, no override, its abs unused. */
  unused(e) {
    const used = new Set(this.paras.map((p) => p.num).filter(Boolean));
    const abs = new Set([...used].map((l) => l.abs));
    return this.lists.find((l) => l.abs.entry === e && !l.over.size &&
      !used.has(l) && !abs.has(l.abs)) || null;
  }

  toggle(kind, entry, a, b) {
    const sel = this.paras.slice(a, b + 1);
    const inIt = (p) => p.num && kindOf(p.num.abs.entry) === kind &&
      (!entry || p.num.abs.entry === entry);
    if (sel.every(inIt)) {
      for (const p of sel) p.num = null;
      return;
    }
    const e = entry || DEFAULT[kind];
    let to = null;
    const prev = this.paras.slice(0, a).reverse().find((p) => p.num);
    if (prev) {
      if (prev.num.abs.entry === e) to = prev.num;
    } else {
      const own = sel.find((p) => p.num && p.num.abs.entry === e);
      if (own) to = own.num;
    }
    if (!to) to = this.unused(e);
    if (!to) to = this.make({entry: e}, new Map());
    for (const p of sel) {
      if (!p.num) p.ilvl = 0;
      p.num = to;
    }
  }

  restart(k, start) {
    const old = this.paras[k].num;
    if (!old) return;
    const before = JSON.stringify(this.labels());
    const was = this.paras.map((p) => p.num);
    // only this level starts again (never a parent level)
    const to = {abs: old.abs, over: new Map([[this.paras[k].ilvl,
      start]])};
    for (let i = k; i < this.paras.length; i++) {
      if (this.paras[i].num === old) this.paras[i].num = to;
    }
    // no label changed: nothing done (no new list)
    if (JSON.stringify(this.labels()) === before) {
      this.paras.forEach((p, i) => { p.num = was[i]; });
    } else this.lists.push(to);
  }

  continue(k) {
    const ps = this.paras;
    const old = ps[k].num;
    if (!old) return;
    // the paragraphs of old around k, up to another list each side
    const run = [k];
    for (let i = k - 1; i >= 0; i--) {
      if (ps[i].num !== null && ps[i].num !== old) break;
      if (ps[i].num === old) run.unshift(i);
    }
    for (let i = k + 1; i < ps.length; i++) {
      if (ps[i].num !== null && ps[i].num !== old) break;
      if (ps[i].num === old) run.push(i);
    }
    const kind = kindOf(old.abs.entry);
    let to = null;
    for (let i = run[0] - 1; i >= 0 && !to; i--) {
      const q = ps[i].num;
      if (q && q !== old && kindOf(q.abs.entry) === kind) to = q;
    }
    if (to) for (const i of run) ps[i].num = to;
  }

  tab(by, a, b) {
    for (const p of this.paras.slice(a, b + 1)) {
      if (p.num) p.ilvl = Math.min(8, Math.max(0, p.ilvl + by));
    }
  }

  /** [kind, level, text] per paragraph (text null for bullets). */
  labels() {
    const counts = new Map(); // abs -> counters by level
    const started = new Map(); // list -> levels started once
    return this.paras.map((p) => {
      if (!p.num) return null;
      const k = p.ilvl;
      let c = counts.get(p.num.abs);
      if (!c) counts.set(p.num.abs, c = []);
      for (let j = k + 1; j < 9; j++) c[j] = undefined;
      let once = started.get(p.num);
      if (!once) started.set(p.num, once = new Set());
      if (!once.has(k) && p.num.over.has(k)) c[k] = p.num.over.get(k);
      else c[k] = c[k] === undefined ? 1 : c[k] + 1;
      once.add(k);
      const e = entryOf(p.num.abs.entry);
      if (e.kind === 'bullet') return ['bullet', k, null];
      const l = e.levels[k];
      return ['number', k, l.lvlText.replace('%' + (k + 1),
        formatNumber(c[k], l.numFmt))];
    });
  }
}

/** What the document shows, in the model's terms. */
function actual(d) {
  const m = labels(d.doc);
  return blocks(d).filter((b) => b.type === 'p').map((b) => {
    const l = m.get(b.id);
    if (!l) return null;
    return [l.bullet ? 'bullet' : 'number', l.level,
      l.bullet ? null : l.text];
  });
}

/** Paragraphs sharing a model list share a numId, and only they. */
function sameLists(d, model) {
  const ps = blocks(d).filter((b) => b.type === 'p');
  const byNum = new Map(), byId = new Map();
  ps.forEach((b, i) => {
    const num = model.paras[i].num;
    const id = num ? b.pPr.numPr.numId : null;
    if (!num) return;
    if (byNum.has(num)) assert.equal(byNum.get(num), id, 'one numId');
    byNum.set(num, id);
    if (byId.has(id)) assert.equal(byId.get(id), num, 'one list');
    byId.set(id, num);
  });
}

const whole = (d) => structuredClone({sections: d.doc.sections,
  numbering: d.doc.numbering, rels: d.doc.rels, styles: d.doc.styles,
  meta: d.doc.meta});

/** One random run: n paragraphs, `steps` commands. */
function runOnce(seed, steps) {
  const R = rng(seed);
  const n = 3 + Math.floor(R() * 14);
  const items = [];
  for (let i = 0; i < n; i++) {
    if (R() < 0.15) items.push(box());
    items.push('p' + i);
  }
  const d = mk(items);
  d.maxSteps = 10000;
  const opened = whole(d);
  const model = new Model(n);
  // block index of paragraph k
  const at = blocks(d).map((b, i) => [b, i]).filter(([b]) =>
    b.type === 'p').map(([, i]) => i);
  const pick = () => Math.floor(R() * n);
  const range = () => {
    const a = pick(), b = pick();
    return [Math.min(a, b), Math.max(a, b)];
  };
  const sel = (a, b) => SEL(d, at[a], 0, at[b], 1);
  const log = [];
  for (let s = 0; s < steps; s++) {
    const t = new Typing(d);
    const r = R();
    if (r < 0.5) {
      const kind = R() < 0.5 ? 'bullet' : 'number';
      const ok = ENTRIES.filter((e) => !e || kindOf(e) === kind);
      const entry = ok[Math.floor(R() * ok.length)];
      const [a, b] = range();
      log.push(['toggle', kind, entry, a, b]);
      toggleList(d, t, sel(a, b), entry ? {kind, entry} : {kind});
      model.toggle(kind, entry, a, b);
    } else if (r < 0.65) {
      const k = pick(), start = R() < 0.5 ? 1 : Math.floor(R() * 7);
      log.push(['restart', k, start]);
      restart(d, t, C(d, at[k], 0), start);
      model.restart(k, start);
    } else if (r < 0.8) {
      const k = pick();
      log.push(['continue', k]);
      continueList(d, t, C(d, at[k], 0));
      model.continue(k);
    } else {
      const by = R() < 0.6 ? 1 : -1;
      const [a, b] = range();
      log.push(['tab', by, a, b]);
      setList(d, t, sel(a, b), {by});
      model.tab(by, a, b);
    }
    const what = 'seed ' + seed + ' ' + JSON.stringify(log);
    assert.deepEqual(actual(d), model.labels(), what);
    sameLists(d, model);
  }
  while (d.undo());
  assert.deepStrictEqual(whole(d), opened, 'undo all: seed ' + seed);
}

describe('ListMake against a reference model', () => {
  it('300 random runs of 30 commands; undo all exact', () => {
    for (let seed = 1; seed <= 300; seed++) runOnce(seed, 30);
  });
});
