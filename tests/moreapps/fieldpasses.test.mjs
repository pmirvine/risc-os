// Update all fields as a bounded series of passes (Batch E3):
// ./FieldPasses run in the spec's order (facts; SEQ; STYLEREF; REF,
// NOTEREF; the other fields; the tables of contents; the page
// fields with PAGEREF), the document laid out again after a pass
// whose page fields changed, at most MAX_PASSES (3) passes; ONE
// undo step for all of it (none when nothing changed); the fields
// left as stored listed with the reason. Real DocLayout, Pages and
// Document, the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {run, MAX_PASSES, STEPS, layoutPages}
  from '../../tools/moreapps/!Letters/FieldPasses';
import {updateAllCmd, updateCmd}
  from '../../tools/moreapps/!Letters/FieldCmd';
import {updateAll} from '../../tools/moreapps/!Letters/FieldUpdate';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {pageOf} from '../../tools/moreapps/!Letters/PageOfBookmark';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const BR = '<w:r><w:br w:type="page"/></w:r>';
const bm = (name, text, id = 1) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>` + r(text) + `<w:bookmarkEnd w:id="${id}"/>`;
const LONG = Array.from({length: 1400}, () => 'longer').join(' ');

/** A Document of doc, its Print layout and pages. */
function opened(doc, print = true) {
  const d = new Document(doc);
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  if (print) L.place = PlacePrint(L, P);
  return {d, L, P, t: new Typing(d)};
}
/** Update's context: the pages, and the layout to lay out again. */
const ctxOf = (o, more = {}) => ({now: NOW, pages: {finish: () => o.P},
  layout: {L: o.L, P: o.P}, ...more});
const storedOf = (doc, f) => findBlock(doc, f.sep.id).b.text
  .slice(f.sep.off + 1, f.end.off);
const results = (doc) => scan(doc).map((f) => storedOf(doc, f));
// (undo gives blocks equal to the ones before, not the same objects:
// an op's inverse makes new ones, as for every command)
const snap = (doc) => structuredClone(doc.sections);
const sameBody = (doc, s) => deepEqual(doc.sections, s);
/** The page of bookmark name in a fresh layout of doc. */
const freshPage = (doc, name) => {
  const L = new DocLayout(doc, tm());
  L.layout(800);
  return pageOf({doc, pages: new Pages(printGalley(L)).finish()},
    name).num;
};

describe('the steps', () => {
  it('in the spec\'s order: the tables of contents before PAGEREF',
    () => {
      assert.equal(MAX_PASSES, 3);
      assert.deepEqual(STEPS.map((s) => s.name), ['facts', 'seq',
        'chapters', 'refs', 'fields', 'toc', 'pages']);
      assert.deepEqual(STEPS.filter((s) => s.paged).map((s) => s.name),
        ['toc', 'pages']);
      assert.ok(Object.isFrozen(STEPS));
    });
});

describe('passes', () => {
  it('a PAGEREF whose update moves its target settles (<= 3 passes)',
    async () => {
      // Word's stored result runs over a page: the target starts on a
      // later page; once '2' is written it moves back to page 1
      const doc = await docWithFields(p(fld(' PAGEREF tgt \\h ', LONG)) +
        p(bm('tgt', 'target')) + p(r('after')));
      const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
      assert.ok(pageOf({doc, pages: o.P}, 'tgt').num >= 2, 'later');
      const res = o.t.command(() => run(o.d, ctxOf(o), null));
      assert.equal(res.changed, true);
      assert.ok(res.passes >= 2 && res.passes <= MAX_PASSES,
        'passes ' + res.passes);
      assert.deepEqual(res.messages, []);
      assert.deepEqual(results(o.d.doc), ['1']);
      assert.equal(freshPage(o.d.doc, 'tgt'), 1, 'what the pages say');
      assert.equal(o.d.undoDepth, n0 + 1, 'ONE undo step');
      await lintAfter(o.d.doc, 'passes');
      // the second run changes nothing and makes no step
      const o2 = {...o, ...opened(o.d.doc)};
      const again = o.t.command(() => run(o.d, ctxOf(o2), null));
      assert.equal(again.changed, false);
      assert.equal(again.passes, 1);
      assert.equal(o.d.undoDepth, n0 + 1, 'no second step');
      o.d.undo();
      assert.ok(sameBody(o.d.doc, s0), 'undo: everything back');
      assert.equal(o.d.undoDepth, n0);
    });

  it('SEQ and REF are updated before the page fields', async () => {
    const doc = await docWithFields(p(r('Fig ') + fld(' SEQ Fig ', '7')) +
      p(bm('cap', 'caption')) + p(fld(' REF cap ', 'old')) +
      p(fld(' PAGE ', '9')) + p(r('x') + BR) +
      p(fld(' PAGEREF cap ', '9')));
    const o = opened(doc);
    const res = o.t.command(() => run(o.d, ctxOf(o), null));
    assert.ok(res.changed);
    assert.deepEqual(results(o.d.doc), ['1', 'caption', '1', '1']);
  });

  it('the bound: a step that always changes stops at 3 passes',
    async () => {
      const doc = await docWithFields(p(r('n')));
      const d = new Document(doc), t = new Typing(d), n0 = d.undoDepth;
      const s0 = snap(doc);
      let lays = 0, runs = 0;
      const flip = {name: 'flip', paged: true, run(dd) {
        runs++;
        dd.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
          ins: 'x'});
        return {found: 1, changed: true, messages: []};
      }};
      const ctx = {now: NOW, relayout: () => {
        lays++;
        return null;
      }};
      const res = t.command(() => run(d, ctx, null, {steps: [flip]}));
      assert.equal(res.passes, MAX_PASSES);
      assert.equal(runs, MAX_PASSES, 'never loops');
      assert.equal(lays, MAX_PASSES - 1);
      assert.ok(res.messages.some((m) => /not settled/.test(m.reason)),
        JSON.stringify(res.messages));
      assert.equal(d.undoDepth, n0 + 1);
      d.undo();
      assert.ok(sameBody(d.doc, s0));
      const one = t.command(() => run(d, ctx, null, {steps: [flip],
        bound: 1}));
      assert.equal(one.passes, 1);
    });

  it('nothing to update: refused, no step; no layout for no page ' +
    'field', async () => {
    const d0 = new Document(await docWithFields(p(r('plain'))));
    assert.equal(run(d0, {now: NOW}).ok, false);
    assert.equal(updateAllCmd(d0, {now: NOW}), null);
    const doc = await docWithFields(p(fld(' DATE \\@ "yyyy" ', 'x')) +
      p(fld(' AUTHOR ', 'x')));
    const d = new Document(doc);
    let lays = 0, asked = 0;
    const ctx = {now: NOW, meta: {creator: 'P'},
      pages: {finish() { asked++; return null; }},
      relayout: () => { lays++; return null; }};
    const res = run(d, ctx);
    assert.ok(res.ok && res.changed);
    assert.equal(lays, 0, 'no layout made');
    assert.equal(asked, 0, 'no pages asked for');
    assert.deepEqual(results(d.doc), ['2026', 'P']);
  });

  it('a PAGE field already right: pages asked once, no layout',
    async () => {
      const doc = await docWithFields(p(fld(' PAGE ', '1')));
      const o = opened(doc);
      let lays = 0;
      const res = run(o.d, ctxOf(o, {relayout: () => {
        lays++;
        return o.P;
      }}));
      assert.ok(res.ok);
      assert.equal(res.changed, false);
      assert.equal(lays, 0);
      assert.equal(o.d.undoDepth, 0, 'no step');
    });
});

describe('messages: the fields left as stored', () => {
  it('missing bookmark, unsupported switch, locked', async () => {
    const doc = await docWithFields(p(bm('here', 'x')) +
      p(fld(' PAGEREF gone ', '4')) + p(fld(' PAGEREF here \\z ', '4')) +
      p(fld(' PAGEREF here ', '4', {lock: true})) +
      p(fld(' REF gone ', 'r')) + p(fld(' REF here \\q ', 'r')) +
      p(fld(' MERGEFIELD Name ', 'm')) + p(fld(' PAGEREF here ', '4')));
    const o = opened(doc);
    const res = o.t.command(() => run(o.d, ctxOf(o), null));
    assert.deepEqual(res.messages.map((m) => [m.instr, m.reason]), [
      ['PAGEREF gone', 'missing bookmark'],
      ['PAGEREF here \\z', 'unsupported switch'],
      ['PAGEREF here', 'locked'],
      ['REF gone', 'missing bookmark'],
      ['REF here \\q', 'unsupported switch']]);
    assert.equal(results(o.d.doc).pop(), '1', 'the good one updated');
  });

  it('a REF to a caption (a SEQ in the bookmark) reads the number ' +
    'the SEQ step made; another field in it: kept', async () => {
    const doc = await docWithFields(p('<w:bookmarkStart w:id="5" ' +
      'w:name="cap"/>' + r('Figure ') + fld(' SEQ Figure ', '7') +
      '<w:bookmarkEnd w:id="5"/>') + p(fld(' REF cap \\h ', 'old')) +
      p('<w:bookmarkStart w:id="6" w:name="pg"/>' + r('p ') +
        fld(' DATE ', 'd') + '<w:bookmarkEnd w:id="6"/>') +
      p(fld(' REF pg ', 'old')));
    const o = opened(doc);
    const res = o.t.command(() => run(o.d, ctxOf(o), null));
    assert.deepEqual(res.messages, [{instr: 'REF pg',
      reason: 'bookmark holds a field'}]);
    assert.deepEqual(results(o.d.doc).slice(0, 2), ['1', 'Figure 1']);
    assert.equal(results(o.d.doc)[3], 'old');
  });

  it('no pages at all: "needs Print layout"', async () => {
    const doc = await docWithFields(p(bm('here', 'x')) +
      p(fld(' PAGEREF here ', '4')) + p(fld(' NUMPAGES ', '4')));
    const d = new Document(doc);
    const res = run(d, {now: NOW});
    assert.equal(res.ok, false, 'nothing could be updated');
    assert.deepEqual(res.messages.map((m) => m.reason),
      ['needs Print layout', 'needs Print layout']);
    assert.deepEqual(results(d.doc), ['4', '4']);
  });
});

describe('cost: many PAGEREF fields', () => {
  /** ms of Update all fields over n PAGEREF fields (best of 3; the
   *  pages worked out before), each stored wrong once. */
  async function timed(n) {
    const per = 10, rows = Array.from({length: n / per}, () =>
      p(Array.from({length: per}, () => fld(' PAGEREF t \\h ', '9') +
        r(' ')).join('')));
    const doc0 = await docWithFields(p(bm('t', 'there')) +
      rows.join(''));
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const o = opened(structuredClone(doc0));
      const t0 = performance.now();
      const res = run(o.d, ctxOf(o), null);
      best = Math.min(best, performance.now() - t0);
      assert.ok(res.changed);
    }
    return best;
  }

  it('10,000 take about ten times 1,000 (not a hundred)', async () => {
    const a = await timed(1000), b = await timed(10000);
    console.log(`# Update all fields: 1,000 PAGEREF ${a.toFixed(0)} ` +
      `ms, 10,000 ${b.toFixed(0)} ms`);
    assert.ok(b < Math.max(a, 5) * 30, `${b} ms vs ${a} ms`);
    if (process.env.WORD_PERF === '1') assert.ok(b < 3000, b + ' ms');
  });
});

describe('PAGEREF \\p through Update', () => {
  it('above, below, on page N', async () => {
    const doc = await docWithFields(p(bm('up', 'up')) +
      p(fld(' PAGEREF up \\p ', 'x')) + p(fld(' PAGEREF dn \\p ', 'x')) +
      p(bm('dn', 'down', 2)) + p(r('x') + BR) +
      p(fld(' PAGEREF up \\p \\h ', 'x')));
    const o = opened(doc);
    o.t.command(() => run(o.d, ctxOf(o), null));
    assert.deepEqual(results(o.d.doc), ['above', 'below', 'on page 1']);
  });
});

describe('single fields and the window', () => {
  it('Update field on a PAGEREF uses the same evaluator', async () => {
    const doc = await docWithFields(p(fld(' PAGEREF t ', '7')) +
      p(r('x') + BR) + p(bm('t', 'there')));
    const o = opened(doc);
    const f = scan(doc)[0], at = {id: f.begin.id, off: f.begin.off};
    assert.ok(o.t.command(() => updateCmd(o.d, {anchor: at, head: at},
      ctxOf(o))));
    assert.deepEqual(results(o.d.doc), ['2']);
  });

  /** A window (./FieldUpdate's fields) over d: Draft or Print. */
  function windowOf(d, print, lazy = false) {
    const v = {real: d, hdr: null, pending: null, typing: new Typing(d),
      get d() { return d; },
      get bodyL() { this.ensure(); return this._L; },
      ensure() {
        if (this._L && this._L.doc === d.doc && !this._stale) return;
        this._stale = false;
        const L = new DocLayout(d.doc, tm(), this._L || null,
          {fields: {now: NOW}});
        L.layout(800);
        if (print) {
          const P = new Pages(printGalley(L));
          L.place = PlacePrint(L, lazy ? P : P.finish());
        }
        this._L = L;
      },
      refused() { this.beeps = (this.beeps || 0) + 1; },
      edited(sel) { this.sel = sel; }};
    d.on('change', () => { v._stale = true; });
    v.ensure();
    const id = d.doc.sections[0].blocks[0].id;
    v.sel = {anchor: {id, off: 0}, head: {id, off: 0}};
    return {view: v, fields: {now: NOW}, L: {fields: {now: NOW}},
      rebuild() {}};
  }

  for (const print of [true, false]) {
    it(`Update all fields in ${print ? 'Print layout' : 'Draft'}`,
      async () => {
        const doc = await docWithFields(p(fld(' PAGEREF tgt ', LONG)) +
          p(bm('tgt', 'target')) + p(fld(' NUMPAGES ', '9')));
        const d = new Document(doc), dw = windowOf(d, print);
        const n0 = d.undoDepth;
        assert.equal(updateAll(dw), true);
        assert.deepEqual(results(d.doc), ['1', '1']);
        assert.equal(d.undoDepth, n0 + 1);
        assert.ok(dw.fieldUpdate && dw.fieldUpdate.passes >= 2,
          'laid out again');
        assert.deepEqual(dw.fieldUpdate.messages, []);
        assert.equal(updateAll(dw), true, 'again: nothing to change');
        assert.equal(d.undoDepth, n0 + 1);
      });
  }

  // documents with no page field never have their pages finished
  const COST = [
    ['AUTHOR only', p(fld(' AUTHOR ', 'x'))],
    ['SEQ and REF only', p(bm('b', 'text')) + p(fld(' SEQ F ', '9')) +
      p(fld(' REF b ', 'old'))],
    ['no fields', p(r('plain'))]];
  for (const print of [true, false]) {
    for (const [name, xml] of COST) {
      it(`no pages worked out: ${name} (${print ? 'Print' : 'Draft'})`,
        async () => {
          const body = Array.from({length: 300}, (_, k) =>
            p(r('para ' + k + ' words to fill the line'))).join('');
          const d = new Document(await docWithFields(xml + body));
          const dw = windowOf(d, print, true);
          const f0 = Pages.prototype.finish;
          let n = 0;
          Pages.prototype.finish = function (...a) {
            n++;
            return f0.apply(this, a);
          };
          try {
            updateAll(dw);
          } finally {
            Pages.prototype.finish = f0;
          }
          assert.equal(n, 0, 'Pages finish calls');
        });
    }
  }

  it('layoutPages: the pages of another doc from a layout', async () => {
    const doc = await docWithFields(p(r('a') + BR) + p(r('b')));
    const o = opened(doc);
    const {L, P} = layoutPages(doc, {L: o.L, P: o.P});
    assert.ok(L !== o.L && P.done);
    assert.equal(P.list.length, 2);
    assert.equal(o.L.doc, doc, 'the base layout untouched');
  });
});
