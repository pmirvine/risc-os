// Edit > Update field and Update all fields (Batch D P9.1, D19, PG22,
// R2; Review Focus 3): a field with an evaluator and no lock gets its
// computed value as its stored result, in the first result run's
// format (MERGEFORMAT: per character where the lengths allow), one
// undo step for the command; a fldSimple gets a new node (instruction
// and attributes kept); every other field, and every field inside a
// kept node, is left exactly as read. Nothing evaluable: null (the
// window beeps), no step. Display and save never change a stored
// result. The corpus pass (gated) updates every field of every file
// and checks that each field without an evaluator is identical inline
// by inline (a changed file written and read back, undo back to the
// document read).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateCmd, updateAllCmd}
  from '../../tools/moreapps/!Letters/FieldCmd';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {entryOf} from '../../tools/moreapps/!Letters/Fields';
import {fieldText} from '../../tools/moreapps/!Letters/FieldShow';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocxError} from '../../tools/moreapps/!Letters/DocxError';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {deepEqual, sameStories} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, begin, sep, end, instr, fldSimple, docWithFields}
  from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {corpusFiles, nameOf, SKIP_CORPUS, ALL} from './roundtrip-lib.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 11, 14, 5);
const F1 = 'word/footer1.xml';
const BR = '<w:r><w:br w:type="page"/></w:r>';
const breaks = (n) => Array.from({length: n},
  (_, i) => p(r('page ' + i) + BR)).join('');
const META = Object.freeze({creator: 'Paul'});
const caret = (pos) => ({anchor: pos, head: pos});

/** A Document of doc and its pages (laid out with tm(), not done). */
function opened(doc) {
  const d = new Document(doc);
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L));
  L.place = PlacePrint(L, P);
  return {d, L, P, t: new Typing(d)};
}
/** ctx with the pages of o (finish() counted). */
function ctxOf(o, more = {}) {
  const pages = {calls: 0, finish() { this.calls++; return o.P.finish(); }};
  return {now: NOW, meta: META, pages, ...more};
}
/** The text of the body paragraph holding the n-th field's sep. */
const paraOf = (doc, f) => findBlock(doc, (f.sep || f.begin).id).b;
/** The stored result of field f of doc (one paragraph). */
function stored(doc, f) {
  if (f.simple) return f.simple.node;
  const q = paraOf(doc, f);
  return q.text.slice(f.sep.off + 1, f.end.off);
}
// (the ops change the body's arrays in place: a copy of each)
const snap = (doc) => ({sections: doc.sections.map((x) => ({...x,
  blocks: x.blocks.slice()})), stories: doc.stories});
/** doc's body holds the very blocks of snapshot s. */
const sameBody = (doc, s) => doc.sections.length === s.sections.length &&
  doc.sections.every((x, k) => x.blocks.length ===
    s.sections[k].blocks.length && x.blocks.every((b, j) =>
    b === s.sections[k].blocks[j]));
function undoneTo(d, s) {
  d.undo();
  assert.ok(deepEqual(d.doc.sections, s.sections), 'body undone');
  assert.ok(sameStories(d.doc.stories, s.stories), 'stories undone');
}
/** The runs of p over [a, b): [[text, bold, italic]]. */
const fmts = (q, a, b) => q.runs.filter((x) => x.end > a && x.start < b)
  .map((x) => [q.text.slice(Math.max(a, x.start), Math.min(b, x.end)),
    !!x.rPr.b, !!x.rPr.i]);

describe('Update all fields (D19)', () => {
  it('PAGE stored 1 on page 3 -> 3, one undo step; undone', async () => {
    const doc = await docWithFields(breaks(2) +
      p(r('Here ') + fld(' PAGE ', '1') + r(' end')));
    const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
    const ctx = ctxOf(o);
    const out = o.t.command(() => updateAllCmd(o.d, ctx));
    assert.ok(out, 'updated');
    const [f] = scan(o.d.doc);
    assert.equal(stored(o.d.doc, f), '3');
    assert.equal(paraOf(o.d.doc, f).text.replace(/\ufffc/g, '#'),
      'Here ###3# end');
    assert.equal(o.d.undoDepth, n0 + 1, 'one undo step');
    assert.ok(ctx.pages.calls >= 1, 'pagination finished first');
    undoneTo(o.d, s0);
  });

  it('NUMPAGES counts every page once pagination is finished',
    async () => {
      const doc = await docWithFields(p(r('of ') +
        fld(' NUMPAGES ', '1')) + breaks(4));
      const o = opened(doc);
      assert.equal(o.P.done, false, 'not done yet');
      updateAllCmd(o.d, ctxOf(o));
      assert.equal(stored(o.d.doc, scan(o.d.doc)[0]), '5');
    });

  it('SECTION with no pages (Draft): the field\'s own section', async () => {
    const doc = await docWithFields(p(fld(' SECTION ', '9')) +
      p(r('end of one'), '<w:sectPr/>') + p(fld(' SECTION ', '9')));
    const d = new Document(doc);
    assert.ok(updateAllCmd(d, {now: NOW}));
    assert.deepEqual(scan(d.doc).map((f) => stored(d.doc, f)),
      ['1', '2']);
  });

  it('NUMWORDS counts the words typed since the last update', async () => {
    const doc = await docWithFields(p(r('one two ') +
      fld(' NUMWORDS ', '0')));
    const d = new Document(doc);
    updateAllCmd(d, {now: NOW});
    assert.equal(stored(d.doc, scan(d.doc)[0]), '3');
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'zero and '});
    updateAllCmd(d, {now: NOW});
    assert.equal(stored(d.doc, scan(d.doc)[0]), '5', 'not the old count');
  });

  it('DATE: the date now (\\@ and the default picture)', async () => {
    const doc = await docWithFields(p(fld(' DATE ', '01/01/2000')) +
      p(fld(' DATE \\@ "d MMMM yyyy" ', 'x')) +
      p(fld(' TIME ', '00:00')));
    const o = opened(doc);
    updateAllCmd(o.d, ctxOf(o));
    assert.deepEqual(scan(o.d.doc).map((f) => stored(o.d.doc, f)),
      ['11/10/2026', '11 October 2026', '14:05']);
  });

  it('a locked field and fields with no evaluator are untouched',
    async () => {
      const doc = await docWithFields(breaks(2) +
        p(fld(' PAGE ', '1', {lock: true})) +
        p(fld(' MERGEFIELD Name ', '<<Name>>')) +
        p(fld(' PAGEREF _Toc1 \\h ', '7')) + p(fld(' PAGE ', '1')));
      const o = opened(doc);
      const before = scan(o.d.doc).map((f) => paraOf(o.d.doc, f));
      updateAllCmd(o.d, ctxOf(o));
      const after = scan(o.d.doc).map((f) => paraOf(o.d.doc, f));
      for (const k of [0, 1, 2]) {
        assert.equal(after[k], before[k], 'same paragraph object ' + k);
      }
      assert.equal(stored(o.d.doc, scan(o.d.doc)[3]), '3');
    });

  it('nothing evaluable: null, no step, nothing changed', async () => {
    const doc = await docWithFields(p(fld(' MERGEFIELD A ', 'a')) +
      p(fld(' PAGE ', '1', {lock: true})) + p(r('text')));
    const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
    assert.equal(o.t.command(() => updateAllCmd(o.d, ctxOf(o))), null);
    assert.equal(o.d.undoDepth, n0);
    assert.ok(sameBody(o.d.doc, s0));
    const none = await docWithFields(p(r('no fields at all')));
    const q = opened(none);
    assert.equal(updateAllCmd(q.d, ctxOf(q)), null);
  });

  it('fields in one paragraph whose lengths change: the last first',
    async () => {
      const doc = await docWithFields(p(r('a ') + fld(' DATE ', 'x') +
        r(' b ') + fld(' AUTHOR ', 'someone long') + r(' c ') +
        fld(' TIME ', '')));
      const o = opened(doc);
      updateAllCmd(o.d, ctxOf(o));
      const q = o.d.doc.sections[0].blocks[0];
      assert.equal(q.text.replace(/￼/g, '#'),
        'a ###11/10/2026# b ###Paul# c ###14:05#');
    });

  it('a value already stored: no step, not refused', async () => {
    const doc = await docWithFields(p(fld(' PAGE ', '1')));
    const o = opened(doc), n0 = o.d.undoDepth;
    const out = updateAllCmd(o.d, ctxOf(o));
    assert.ok(out, 'not refused');
    assert.equal(o.d.undoDepth, n0, 'no step');
  });

  it('the first result run\'s format; MERGEFORMAT per character (PG22)',
    async () => {
      const res = r('X', '<w:b/>') + r('yz', '<w:i/>');
      const two = (code) => p(begin() + instr(code) + sep() + res + end());
      const doc = await docWithFields(two(' AUTHOR ') +
        two(' AUTHOR \\* MERGEFORMAT ') + two(' AUTHOR \\* mergeformat '));
      const o = opened(doc);
      updateAllCmd(o.d, ctxOf(o, {meta: {creator: 'Paula'}}));
      const [a, b, c] = scan(o.d.doc);
      const fa = fmts(paraOf(o.d.doc, a), a.sep.off + 1, a.end.off);
      assert.deepEqual(fa, [['Paula', true, false]]);
      const fb = fmts(paraOf(o.d.doc, b), b.sep.off + 1, b.end.off);
      assert.deepEqual(fb, [['P', true, false], ['aula', false, true]]);
      const fc = fmts(paraOf(o.d.doc, c), c.sep.off + 1, c.end.off);
      assert.deepEqual(fc, fb, 'the switch in any case');
      const short = await docWithFields(two(' AUTHOR \\* MERGEFORMAT '));
      const q = opened(short);
      updateAllCmd(q.d, ctxOf(q, {meta: {creator: 'Q'}}));
      const [g] = scan(q.d.doc);
      assert.deepEqual(fmts(paraOf(q.d.doc, g), g.sep.off + 1,
        g.end.off), [['Q', true, false]]);
    });

  it('an empty result takes the separate\'s format; no separate gets one',
    async () => {
      const doc = await docWithFields(breaks(2) +
        p(fld(' PAGE ', '', {rPr: '<w:b/>'})) + p(fld(' PAGE ', null)));
      const o = opened(doc), s0 = snap(doc);
      updateAllCmd(o.d, ctxOf(o));
      const [a, b] = scan(o.d.doc);
      assert.deepEqual(fmts(paraOf(o.d.doc, a), a.sep.off + 1,
        a.end.off), [['3', true, false]]);
      assert.ok(b.sep, 'a separate put in');
      assert.equal(stored(o.d.doc, b), '3');
      const back = await readDocx(await writeDocx(o.d.doc));
      assert.deepEqual(scan(back).map((f) => stored(back, f)),
        ['3', '3']);
      await lintAfter(o.d.doc, 'separate added');
      undoneTo(o.d, s0);
    });

  it('fldSimple: a new node, its instruction and attributes kept',
    async () => {
      const doc = await docWithFields(breaks(2) +
        p(r('p. ') + fldSimple(' PAGE \\* MERGEFORMAT ', '1')));
      const o = opened(doc), s0 = snap(doc);
      const [f0] = scan(o.d.doc), n0 = f0.simple.node;
      updateAllCmd(o.d, ctxOf(o));
      const [f] = scan(o.d.doc), n = f.simple.node;
      assert.notEqual(n, n0, 'a new node');
      assert.deepEqual(n.attrs, n0.attrs);
      assert.equal(f.instr, f0.instr);
      const q = paraOf(o.d.doc, f);
      assert.equal(q.inlines[f.begin.off].text, '3');
      const bytes = await writeDocx(o.d.doc);
      const xml = new TextDecoder().decode(
        (await readZip(bytes)).get('word/document.xml'));
      assert.match(xml, /<w:fldSimple w:instr=" PAGE \\\* MERGEFORMAT ">/);
      assert.match(xml, /<w:t[^>]*>3<\/w:t><\/w:r><\/w:fldSimple>/);
      await lintAfter(o.d.doc, 'fldSimple');
      undoneTo(o.d, s0);
    });
});

describe('Update field: the selection, the caret, a story (D19)', () => {
  const two = () => docWithFields(breaks(2) +
    p(r('a ') + fld(' PAGE ', '1') + r(' b ') + fld(' PAGE ', '1')) +
    p(r('plain')));

  it('at the caret (just before or after it); elsewhere: null',
    async () => {
      const o = opened(await two());
      const [f, g] = scan(o.d.doc);
      const id = f.begin.id;
      const out = updateCmd(o.d, caret({id, off: f.end.off + 1}),
        ctxOf(o));
      assert.ok(out);
      const [f1, g1] = scan(o.d.doc);
      assert.equal(stored(o.d.doc, f1), '3');
      assert.equal(stored(o.d.doc, g1), '1', 'the other one not');
      assert.deepEqual(out.head, {id, off: f1.end.off + 1},
        'the caret kept after the field');
      const plain = o.d.doc.sections[0].blocks[3].id;
      assert.equal(updateCmd(o.d, caret({id: plain, off: 2}),
        ctxOf(o)), null);
      assert.ok(updateCmd(o.d, caret({id, off: g.begin.off}),
        ctxOf(o)));
      assert.equal(stored(o.d.doc, scan(o.d.doc)[1]), '3');
    });

  it('a selection over both: both, one step', async () => {
    const o = opened(await two());
    const [f, g] = scan(o.d.doc), n0 = o.d.undoDepth;
    const sel = {anchor: {id: f.begin.id, off: 0},
      head: {id: g.end.id, off: g.end.off + 1}};
    const out = o.t.command(() => updateCmd(o.d, sel, ctxOf(o)));
    assert.deepEqual(scan(o.d.doc).map((x) => stored(o.d.doc, x)),
      ['3', '3']);
    assert.equal(o.d.undoDepth, n0 + 1);
    assert.deepEqual(out.anchor, sel.anchor);
    assert.equal(out.head.off, scan(o.d.doc)[1].end.off + 1);
  });

  it('in a footer (header mode): the story\'s fields, the mode\'s page',
    async () => {
      const doc = await docWithFields(breaks(4),
        {default: {ftr: p(r('Page ') + fld(' PAGE ', '1') + r(' of ') +
          fld(' NUMPAGES ', '1'))}});
      const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
      const body0 = snap(doc);
      const fa = facadeOf(o.d, F1, 0);
      const id = fa.doc.sections[0].blocks[0].id;
      const ctx = ctxOf(o, {page: o.P.at(2)});
      const out = o.t.command(() => updateCmd(fa, caret({id, off: 0}),
        ctx));
      assert.ok(out);
      assert.ok(sameBody(o.d.doc, body0), 'the body untouched');
      const fs = scan(o.d.doc, F1);
      const q = o.d.doc.stories.get(F1).blocks[0];
      assert.deepEqual(fs.map((f) => q.text.slice(f.sep.off + 1,
        f.end.off)), ['3', '5']);
      assert.equal(o.d.undoDepth, n0 + 1);
      await lintAfter(o.d.doc, 'footer updated');
      undoneTo(o.d, s0);
      assert.equal(updateAllCmd(fa, ctx) !== null, true,
        'Update all on the facade: its story');
    });
});

describe('Spanning and nested fields (Review Focus 3)', () => {
  it('a field across paragraphs: updated when evaluable, else whole',
    async () => {
      const span = (code) => p(r('a ') + begin() + instr(code) + sep() +
        r('old')) + p(r('more')) + p(r('rest') + end() + r(' z'));
      const doc = await docWithFields(span(' AUTHOR ') +
        span(' MERGEFIELD x '));
      const o = opened(doc), s0 = snap(doc);
      const blocks0 = s0.sections[0].blocks;
      updateAllCmd(o.d, ctxOf(o));
      const bs = o.d.doc.sections[0].blocks;
      assert.equal(bs.length, blocks0.length - 2, 'merged into one');
      const [f, g] = scan(o.d.doc);
      assert.equal(f.sep.id, f.end.id);
      assert.equal(stored(o.d.doc, f), 'Paul');
      assert.equal(paraOf(o.d.doc, f).text.replace(/\ufffc/g, '#'),
        'a ###Paul# z');
      assert.equal(paraOf(o.d.doc, f).id, blocks0[0].id);
      for (let k = 3; k < 6; k++) {
        assert.equal(bs[k - 2], blocks0[k], 'the other left whole');
      }
      assert.notEqual(g.sep.id, g.end.id);
      undoneTo(o.d, s0);
    });

  it('a field across cells, or with a table in its result: untouched',
    async () => {
      const tc = (x) => `<w:tc><w:p>${x}</w:p></w:tc>`;
      const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
        '<w:gridCol w:w="2000"/></w:tblGrid><w:tr>' +
        tc(begin() + instr(' AUTHOR ') + sep() + r('x')) +
        tc(r('y') + end()) + '</w:tr></w:tbl>';
      const doc = await docWithFields(tbl + p(r('after')));
      const o = opened(doc), s0 = snap(doc);
      assert.equal(scan(o.d.doc).length, 1);
      assert.equal(updateAllCmd(o.d, ctxOf(o)), null);
      assert.ok(sameBody(o.d.doc, s0));
    });

  it('IF { PAGE } (the caret at the IF): the inner PAGE updates, IF '+
    'untouched', async () => {
    const doc = await docWithFields(breaks(2) + p(fld(
      ' IF {} = 1 "one" "other" ', 'other',
      {nested: fld(' PAGE ', '1')})));
    const o = opened(doc);
    const [outer] = scan(o.d.doc), q0 = paraOf(o.d.doc, outer);
    const before = q0.text.slice(outer.sep.off);
    updateCmd(o.d, caret({id: q0.id, off: 0}), ctxOf(o));
    const [o1, inner] = scan(o.d.doc);
    assert.equal(stored(o.d.doc, inner), '3');
    assert.equal(o1.instr, ' IF 3 = 1 "one" "other" ');
    const q = paraOf(o.d.doc, o1);
    assert.equal(q.text.slice(o1.sep.off), before, 'IF\'s result kept');
    assert.equal(stored(o.d.doc, o1), 'other');
    for (let k = o1.sep.off; k < q.text.length; k++) {
      assert.equal(q.inlines[k], q0.inlines[k - o1.sep.off +
        outer.sep.off], 'IF\'s inlines kept ' + k);
    }
  });

  it('a result holding another field, or any kept inline: untouched',
    async () => {
      const doc = await docWithFields(p(begin() + instr(' AUTHOR ') +
        sep() + fld(' MERGEFIELD x ', 'x') + end()) +
        p(begin() + instr(' TITLE ') + sep() + r('a') +
          '<w:bookmarkStart w:id="0" w:name="b"/>' + r('b') + end()));
      const o = opened(doc);
      assert.equal(updateAllCmd(o.d, ctxOf(o)), null);
    });
});

describe('Display and save never update (OD3)', () => {
  it('a PAGE shown 3 is saved as 1', async () => {
    const doc = await docWithFields(breaks(2) + p(fld(' PAGE ', '1')),
      {default: {ftr: p(fld(' PAGE ', '1'))}});
    const o = opened(doc);
    o.P.finish();
    const [f] = scan(doc);
    const L = new DocLayout(doc, tm(), o.L, {fields: {now: NOW,
      pageOf: new Map([[f.sep.id, o.P.at(2)]]), pages: o.P}});
    L.layout(800);
    const shown = fieldText(L, paraOf(doc, f), f.sep.off);
    assert.equal(shown.text, '3', 'shown computed');
    const back = await readDocx(await writeDocx(o.d.doc));
    assert.equal(stored(back, scan(back)[0]), '1');
    const ft = scan(back, F1)[0], fq = back.stories.get(F1).blocks[0];
    assert.equal(fq.text.slice(ft.sep.off + 1, ft.end.off), '1');
  });
});

describe('Hostile input', () => {
  it('odd selections and contexts: no throw, null', async () => {
    const o = opened(await docWithFields(p(fld(' PAGE ', '1'))));
    for (const sel of [null, undefined, {}, {anchor: null, head: null},
      caret({id: -1, off: 0}), caret({id: '__proto__', off: NaN})]) {
      assert.equal(updateCmd(o.d, sel, ctxOf(o)), null);
    }
    for (const ctx of [null, undefined, {}, {pages: {}},
      {pages: {finish: () => null}}, {now: 'x'}]) {
      assert.equal(updateAllCmd(o.d, ctx), null);
    }
  });
});

const files = corpusFiles();
/** A field's content, inline by inline: [char, inline, rPr]. */
function content(doc, f) {
  const out = [];
  const a = findBlock(doc, f.begin.id), b = findBlock(doc, f.end.id);
  if (!a || !b) return null;
  if (a.b === b.b) {
    for (let k = f.begin.off; k <= f.end.off; k++) {
      out.push([a.b.text[k], a.b.inlines[k] || null]);
    }
    return out;
  }
  return [a.b, b.b];
}
/** Fields of `fs` with no evaluator (or locked) whose subtree has no
 *  field with one: those Update all must leave exactly as read. */
function frozen(fs) {
  const live = (f) => (!f.lock && entryOf(f)) ||
    f.children.some(live);
  return fs.filter((f) => !live(f));
}

describe('Update all over the corpus', {skip: files.length ? false
  : SKIP_CORPUS}, () => {
  it('every field without an evaluator identical inline by inline',
    async () => {
      const n = {files: 0, updated: 0, kept: 0, stories: 0,
        written: 0};
      const failures = [];
      const pg = {i: 0, s: 0, num: 1, fmt: 'decimal'};
      const P = {list: [pg], ofPos: () => 0, done: true};
      for (const file of files) {
        let doc;
        try {
          doc = await readDocx(readFileSync(file));
        } catch (e) {
          if (!(e instanceof DocxError)) failures.push(nameOf(file));
          continue;
        }
        try {
          n.files++;
          const d = new Document(doc), s0 = snap(doc);
          const ctx = {now: NOW, meta: META, page: pg,
            pages: {finish: () => P}, path: 'ADFS::HD4.$.Doc'};
          const parts = [null, ...doc.stories.keys()];
          for (const part of parts) {
            const dd = part ? facadeOf(d, part, 0) : d;
            const keep = frozen(scan(dd.doc));
            const was = keep.map((f) => content(dd.doc, f));
            const depth = d.undoDepth;
            if (updateAllCmd(dd, ctx)) n.updated++;
            if (part) n.stories++;
            const now = frozen(scan(dd.doc));
            assert.equal(now.length, keep.length, 'kept fields');
            now.forEach((f, k) => {
              assert.deepEqual(content(dd.doc, f), was[k]);
            });
            n.kept += keep.length;
            assert.ok(d.undoDepth - depth <= 1, 'one step at most');
          }
          if (d.canUndo) {
            const back = await readDocx(await writeDocx(d.doc));
            assert.equal(scan(back).length, scan(d.doc).length,
              'written and read back');
            n.written++;
          }
          while (d.canUndo) d.undo();
          assert.ok(deepEqual(d.doc.sections, s0.sections));
          assert.ok(sameStories(d.doc.stories, s0.stories));
        } catch (e) {
          failures.push(nameOf(file) + ': ' + e.message);
        }
      }
      console.log(`# fields-update corpus${ALL ? '' : ' (sample)'}: ` +
        `${n.files} files, ${n.stories} stories, ${n.updated} ` +
        `bodies or stories updated (${n.written} files written and ` +
        `read back), ${n.kept} fields kept as read`);
      assert.deepEqual(failures, []);
    });
});
