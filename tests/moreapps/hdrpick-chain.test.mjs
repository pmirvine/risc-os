// Headers and footers of many sections resolved in linear time (Batch
// D final fix A, F2-I1): ./HdrPick chainOf resolves a kind's and
// type's references section by section (each section's own, else the
// one before it: "linked to previous") once per layout, filled as far
// as the pages asked, where refOf walked back to section 0 for every
// section and page (pagination O(sections^2): 500 sections took 4 ms a
// keystroke, 100,000 sections never finished). chainOf gives exactly
// refOf's answers (the one rule); a layout looks at each section's
// references at most once a kind and type (./HdrPick work: counted, so
// the rule is checked on a busy machine too). Print layout keystrokes
// as the window makes them (relayout, the Pages from the last ones,
// the pages worked out through the caret's; the rest, timed apart, is
// the slices'): 500 sections <= 1.5 ms, 10,000 <= 50 ms (medians of 20
// after 3, the least of three rounds; asserted with
// WORD_SECTIONS_PERF=1, their references counted always: final fix
// B); undoing 1,000 section breaks
// one by one, each laid out to the caret's page, <= 1 s in all (the
// least of three runs; asserted with WORD_SECTIONS_PERF=1, printed
// always); 100,000 sections paginate in 2 ms slices to the end, a
// keystroke in the middle then <= 500 ms (the least of three; asserted,
// with the worst slice < 250 ms, with WORD_SECTIONS_PERF=1). Real
// DocLayout and Pages, the fake
// measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {refOf, chainOf, work} from '../../tools/moreapps/!Letters/HdrPick';
import {TYPES} from '../../tools/moreapps/!Letters/SectRefs';
import {nextId} from '../../tools/moreapps/!Letters/Model';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {insertSection} from '../../tools/moreapps/!Letters/SectBreak';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {wordHf} from './hf-fixtures.mjs';

before(loadStyles);
const MAR = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" ' +
  'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" ' +
  'w:footer="708" w:gutter="0"/>';
const KINDS = ['hdr', 'ftr'];
const PERF = !!process.env.WORD_SECTIONS_PERF;

/** A sectPr: own references (ids of wordHf's parts), its type. */
const sect = (refs, type) => '<w:sectPr>' + refs.map(([k, t, id]) =>
  `<w:${k}Reference w:type="${t}" r:id="${id}"/>`).join('') +
  (type ? `<w:type w:val="${type}"/>` : '') + MAR + '</w:sectPr>';

/** A Document of n sections, two paragraphs each; header 1 (default)
 *  in section 0 only, the others linked to it, as a mail merge's. */
async function many(n) {
  const one = await readDocx(await wordHf({
    default: {hdr: p(r('Letter head')), ftr: p(r('Foot'))},
    body: p(r('to 0')) + p(r('end 0'), sect([['header', 'default',
      'rIdH1'], ['footer', 'default', 'rIdF1']], 'nextPage')) +
      p(r('the end'))}));
  const [s0, last] = one.sections;
  const sections = [s0];
  for (let k = 1; k < n - 1; k++) {
    sections.push({...s0, props: refsOff(s0.props), blocks:
      s0.blocks.map((x) => ({...structuredClone(x), id: nextId()}))});
  }
  sections.push(last);
  const d = new Document({...one, sections});
  d.clearHistory();
  return d;
}

/** props without its own header and footer references. */
function refsOff(props) {
  const out = structuredClone(props);
  out.extra = (out.extra || []).filter((n) => !/Reference$/.test(
    n && n.name ? n.name : ''));
  return out;
}

/** {L, P} of doc in Print layout from prev, as the window makes it
 *  after an edit: the pages worked out through the caret's (pos; no
 *  pos: none; true: to the end), the rest left to the slices. */
function printed(doc, prev, pos = true) {
  const L = new DocLayout(doc, prev ? prev.L.metrics : tm(),
    prev ? prev.L : null);
  L.layout(800);
  const P = new Pages(printGalley(L), prev ? prev.P : null);
  L.place = PlacePrint(L, P);
  if (pos === true) P.finish();
  else if (pos) P.ofPos(pos);
  return {L, P};
}

/** The least of three medians of 20 keystrokes (after 3) in
 *  section s's first paragraph, as the window makes them (printed:
 *  the caret's page), and of working out the rest (the slices'):
 *  a busy machine slows a round, not all three. */
function keystroke(d, s) {
  const r = [0, 1, 2].map(() => round(d, s));
  return {key: Math.min(...r.map((x) => x.key)),
    rest: Math.min(...r.map((x) => x.rest)),
    refs: Math.max(...r.map((x) => x.refs))};
}

/** One round (see keystroke). */
function round(d, s) {
  let w = printed(d.doc);
  const ms = [], rest = [], r0 = work.refs;
  for (let j = 0; j < 23; j++) {
    const t0 = performance.now();
    d.apply({op: 'replaceText', block: [s, 0], at: 0, del: j % 2,
      ins: j % 2 ? '' : 'x'});
    w = printed(d.doc, w, {id: d.doc.sections[s].blocks[0].id,
      off: 0});
    const t1 = performance.now();
    w.P.finish();
    if (j >= 3) {
      ms.push(t1 - t0);
      rest.push(performance.now() - t1);
    }
  }
  ms.sort((a, b) => a - b);
  rest.sort((a, b) => a - b);
  return {key: ms[ms.length >> 1], rest: rest[rest.length >> 1],
    refs: (work.refs - r0) / 23};
}

describe('headers of many sections in linear time (F2-I1)', () => {
  it('chainOf gives refOf\'s answer for every section, kind and type',
    async () => {
      const d = await many(40);
      const doc = d.doc;
      for (const kind of KINDS) {
        for (const type of TYPES) {
          const c = chainOf(doc, type, kind);
          // (asked out of order: filled as far as asked)
          for (const s of [39, 3, 0, 20, 38, 1]) {
            assert.deepEqual(c(s), refOf(doc, s, type, kind),
              `${kind} ${type} ${s}`);
          }
        }
      }
      assert.throws(() => chainOf(doc, 'odd', 'hdr'), RangeError);
      assert.throws(() => chainOf(doc, 'default', 'x'), RangeError);
      assert.throws(() => chainOf(doc, 'default', 'hdr')(40),
        RangeError);
    });

  // (final fix B: a keystroke, and the slices after it, look at each
  // section's references at most once a kind and type, asserted
  // always; the times printed always and asserted with
  // WORD_SECTIONS_PERF=1: under a loaded parallel run 10,000 took 52)
  it('500 sections: a Print layout keystroke looks at the references ' +
    'linear in the sections; <= 1.5 ms (WORD_SECTIONS_PERF=1)',
  async () => {
    const d = await many(500);
    const {key, rest, refs} = keystroke(d, 250);
    console.log(`# 500 sections: ${key.toFixed(2)} ms (the rest ` +
      `of the pages ${rest.toFixed(2)} ms; ${refs} references a key)`);
    assert.ok(refs <= 6 * d.doc.sections.length, `${refs} references`);
    if (PERF) assert.ok(key <= 1.5, `${key.toFixed(2)} ms`);
  });

  it('10,000 sections: a Print layout keystroke looks at the ' +
    'references linear in the sections; <= 50 ms ' +
    '(WORD_SECTIONS_PERF=1)', async () => {
    const d = await many(10000);
    const {key, rest, refs} = keystroke(d, 5000);
    console.log(`# 10,000 sections: ${key.toFixed(1)} ms (the rest ` +
      `of the pages ${rest.toFixed(1)} ms; ${refs} references a key)`);
    assert.ok(refs <= 6 * d.doc.sections.length, `${refs} references`);
    if (PERF) assert.ok(key <= 50, `${key.toFixed(1)} ms`);
  });

  it('1,000 section breaks undone one by one, each laid out to the ' +
    'caret\'s page: references looked at linear in the sections; ' +
    '<= 1 s (WORD_SECTIONS_PERF=1)', async () => {
    const d = await many(2), t = new Typing(d);
    for (let k = 0; k < 1000; k++) {
      const secs = d.doc.sections, last = secs[secs.length - 1];
      const b = last.blocks[last.blocks.length - 1];
      insertSection(d, t, S.caret({id: b.id, off: b.text.length}),
        'nextPage');
    }
    assert.ok(d.doc.sections.length > 1000);
    /** ms to undo every break, laid out to the caret's page each. */
    const undoAll = () => {
      let w = printed(d.doc);
      const t0 = performance.now();
      while (d.canUndo) {
        d.undo();
        const secs = d.doc.sections, last = secs[secs.length - 1];
        w = printed(d.doc, w, {id: last.blocks[0].id, off: 0});
      }
      assert.equal(d.doc.sections.length, 2);
      assert.ok(w.P.count >= 2);
      return performance.now() - t0;
    };
    const r0 = work.refs;
    let ms = undoAll();
    // (each layout looks at each section's references at most once
    // per kind and type asked: 2 x 3 x 1,001 x 1,000 at most; the
    // walk back to section 0 for every page took ~ 2 x 500,000 x
    // 1,000 / 2)
    const refs = work.refs - r0;
    assert.ok(refs <= 6 * 1001 * 1000, `${refs} references looked at`);
    // (the least of three runs, redone between: a busy machine)
    for (let k = 0; k < 2 && ms > 1000; k++) {
      while (d.canRedo) d.redo();
      ms = Math.min(ms, undoAll());
    }
    console.log(`# undo of 1,000 section breaks: ${ms.toFixed(0)} ms` +
      ` (${refs} references looked at)`);
    if (PERF) assert.ok(ms <= 1000, `${ms.toFixed(0)} ms`);
  });

  it('100,000 sections: paginated in 2 ms slices to the end; a ' +
    'keystroke then looks at each section\'s references at most ' +
    'once a kind and type; <= 500 ms (WORD_SECTIONS_PERF=1)',
  async () => {
    const d = await many(100000);
    let w = printed(d.doc, null, null);
    let slices = 0, worst = 0;
    const t0 = performance.now();
    while (!w.P.done) {
      const a = performance.now();
      w.P.step(2);
      worst = Math.max(worst, performance.now() - a);
      slices++;
      assert.ok(performance.now() - t0 < 60000, 'no hang');
    }
    const all = performance.now() - t0;
    assert.ok(w.P.count >= 100000, `${w.P.count} pages`);
    let key = Infinity, refs = Infinity;
    for (let k = 0; k < 3; k++) {      // (the least of three)
      const r0 = work.refs;
      const k0 = performance.now();
      d.apply({op: 'replaceText', block: [50000, 0], at: 0,
        del: k % 2, ins: k % 2 ? '' : 'x'});
      w = printed(d.doc, w, {id: d.doc.sections[50000].blocks[0].id,
        off: 0});
      key = Math.min(key, performance.now() - k0);
      refs = Math.min(refs, work.refs - r0);
    }
    console.log(`# 100,000 sections: ${slices} slices in ` +
      `${all.toFixed(0)} ms (worst ${worst.toFixed(1)} ms); a ` +
      `keystroke ${key.toFixed(0)} ms`);
    if (PERF) assert.ok(worst < 250, `a slice took ${worst.toFixed(1)} ms`);
    assert.ok(refs <= 6 * 100000, `${refs} references looked at`);
    if (PERF) assert.ok(key <= 500, `${key.toFixed(0)} ms`);
  });
});
