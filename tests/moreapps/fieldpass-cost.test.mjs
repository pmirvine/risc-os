// FieldPass on a keystroke (Batch D P8 fix M1, D37): the records of
// the paragraphs whose fields were shown are shared by a layout made
// from the last one with the same fields (no walk of them to carry
// them), and passOf looks only at the records made since the last
// pass and those of the pages that are new objects (a page kept by
// identity was looked at already for this count); every record again
// only when the page count changed. A field-heavy document: a
// keystroke in a paragraph without fields carries none and looks at
// a few; the values still come out right: NUMPAGES on a kept page
// after the count changed, a field pasted into a paragraph on page
// 2, a paragraph moved to another page. Real DocLayout and Pages,
// the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {passOf, work} from '../../tools/moreapps/!Letters/FieldPass';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {select, caret} from '../../tools/moreapps/!Letters/Selection';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Letters/ClipPaste';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 11, 14, 5);
const FX = Object.freeze({now: NOW});

/** doc laid out (from prev) and paginated to the end: {L, P}. */
function printed(doc, prev, fields, P0) {
  const L = new DocLayout(doc, prev ? prev.metrics : tm(), prev,
    fields ? {fields} : prev ? {} : {fields: FX});
  L.layout(800);
  const P = new Pages(printGalley(L), P0);
  L.place = PlacePrint(L, P);
  P.finish();
  return {L, P};
}

/** Layouts as the window makes them until no pass is due. */
function settle(doc, s) {
  let n = 0;
  for (let fx = passOf(s.L, s.P); fx && n < 10; fx = passOf(s.L, s.P)) {
    s = printed(doc, s.L, fx, s.P);
    n++;
  }
  return s;
}

/** The texts of item k's computed results. */
const shown = (L, k) => L.items[k].lines.flatMap((l) => l.items)
  .filter((x) => x.field).map((x) => x.text);

const plain = (i) => p(r('line ' + i));
const paged = (i) => p(r('line ' + i + ' ') + fld(' PAGE ', '1'));

describe('FieldPass on a keystroke: no walk of every record (M1)',
  () => {
    it('2,000 field paragraphs: a keystroke elsewhere carries none ' +
      'and looks at few', async () => {
        const body = Array.from({length: 2000}, (_, i) => paged(i))
          .join('') + Array.from({length: 20}, (_, i) => plain(i))
          .join('');
        const d = new Document(await docWithFields(body));
        let s = settle(d.doc, printed(d.doc));
        assert.ok(s.P.count > 20, `${s.P.count} pages`);
        const k = 2010, w0 = {...work};
        d.apply({op: 'replaceText', block: [0, k], at: 0, del: 0,
          ins: 'x'});
        s = printed(d.doc, s.L, null, s.P);
        assert.equal(passOf(s.L, s.P), null);
        assert.equal(work.carried - w0.carried, 0, 'records carried');
        assert.ok(work.looked - w0.looked < 100,
          `${work.looked - w0.looked} records looked at`);
        const last = s.L.items[1999];
        assert.deepEqual(shown(s.L, 1999),
          [String(s.P.at(s.P.ofPos({id: last.id, off: 0})).num)]);
      });

    it('NUMPAGES on a page kept by identity shows the new count',
      async () => {
        const body = p(r('of ') + fld(' NUMPAGES ', '1')) +
          Array.from({length: 120}, (_, i) => plain(i)).join('');
        const d = new Document(await docWithFields(body));
        let s = settle(d.doc, printed(d.doc));
        const n0 = s.P.count;
        assert.deepEqual(shown(s.L, 0), [String(n0)]);
        const P0 = s.P, pg0 = P0.at(0);
        assert.ok(n0 >= 3, `${n0} pages`);
        d.apply({op: 'replaceText', block: [0, 120], at: 0, del: 0,
          ins: 'word '.repeat(4000)});
        s = printed(d.doc, s.L, null, P0);
        assert.equal(s.P.at(0), pg0, 'page 1 kept by identity');
        s = settle(d.doc, s);
        assert.ok(s.P.count > n0);
        assert.deepEqual(shown(s.L, 0), [String(s.P.count)]);
      });

    it('a field pasted into a paragraph on page 2: worked out',
      async () => {
        const body = Array.from({length: 120}, (_, i) => plain(i))
          .join('') + paged(999);
        const d = new Document(await docWithFields(body));
        let s = settle(d.doc, printed(d.doc));
        const k = 80, b = d.doc.sections[0].blocks;
        const pi = s.P.ofPos({id: b[k].id, off: 0});
        assert.ok(pi >= 1, 'not on page 1');
        const src = b[120], clip = slice(d.doc, select(
          {id: src.id, off: 9}, {id: src.id, off: src.text.length}));
        pasteBlocks(d, caret({id: b[k].id, off: 0}), clip.blocks,
          {sameDoc: true, styleNames: clip.styleNames});
        s = settle(d.doc, printed(d.doc, s.L, null, s.P));
        assert.equal(s.P.ofPos({id: b[k].id, off: 0}), pi);
        assert.deepEqual(shown(s.L, k), [String(pi + 1)]);
      });

    it('a paragraph an edit moves to the next page gets its value',
      async () => {
        const body = Array.from({length: 120}, (_, i) => plain(i))
          .join('') + paged(999) + plain(1000);
        const d = new Document(await docWithFields(body));
        let s = settle(d.doc, printed(d.doc));
        const id = d.doc.sections[0].blocks[120].id;
        const i0 = s.P.ofPos({id, off: 0});
        assert.deepEqual(shown(s.L, 120), [String(i0 + 1)]);
        d.apply({op: 'replaceText', block: [0, 3], at: 0, del: 0,
          ins: 'word '.repeat(1500)});
        s = settle(d.doc, printed(d.doc, s.L, null, s.P));
        const i1 = s.P.ofPos({id, off: 0});
        assert.ok(i1 > i0);
        assert.deepEqual(shown(s.L, 120), [String(i1 + 1)]);
      });
  });
