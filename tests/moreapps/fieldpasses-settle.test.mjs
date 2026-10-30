// Update all fields reads the pages Print layout shows once settled
// (Batch E3): the layouts ./FieldPasses makes between its passes run
// the window's own passes (./ViewPass settle: page fields, footnote
// numbers, column widths, wrap round floats), so a PAGEREF written by
// Update is the page the window shows after settling, and a second
// Update changes nothing (no undo step). Floats with square wrap,
// unequal newspaper columns, the same document without floats, and a
// stale SEQ before the PAGEREF (pass 1 then lays the document out
// again as well). The reference: the real ./ViewMode driving a stub
// window (wrap-fixtures windowOf) until no slice is left.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {off, anchorRun, docOf, text, windowOf, SECT, M}
  from './wrap-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {loadStyles} from './word-docs.mjs';
import {updateAll} from '../../tools/moreapps/!Letters/FieldUpdate';
import {pageOf} from '../../tools/moreapps/!Letters/PageOfBookmark';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {Typing} from '../../tools/moreapps/!Letters/Typing';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const bm = (name, t) => `<w:bookmarkStart w:id="1" w:name="${name}"/>` +
  r(t) + '<w:bookmarkEnd w:id="1"/>';
const results = (doc) => scan(doc).map((f) => findBlock(doc, f.sep.id)
  .b.text.slice(f.sep.off + 1, f.end.off));
const UNEQUAL = SECT.replace('</w:sectPr>', '<w:cols w:num="2" ' +
  'w:space="720" w:equalWidth="0"><w:col w:w="2640" w:space="720"/>' +
  '<w:col w:w="6000"/></w:cols></w:sectPr>');

/** The window of d settled (the real ViewMode's slices run out). */
function settled(d) {
  const pos = {id: d.doc.sections[0].blocks[0].id, off: 0};
  const w = windowOf(d, pos);
  w.frames(100000);
  return w;
}

/** FieldUpdate's window over d, its body layout w's (settled). */
function fieldWindow(d, w) {
  const id = d.doc.sections[0].blocks[0].id;
  const v = {hdr: null, pending: null, typing: new Typing(d),
    get d() { return d; }, bodyL: w.L, ensure() {},
    sel: {anchor: {id, off: 0}, head: {id, off: 0}},
    refused() { this.beeps = (this.beeps || 0) + 1; },
    edited(sel) { this.sel = sel; }};
  return {view: v, fields: {now: NOW}, L: {fields: {now: NOW}},
    rebuild() {}};
}

/** Update all fields on d (window settled first); then the page the
 *  settled window shows and a second Update. */
function check(d) {
  const w0 = settled(d), n0 = d.undoDepth;
  const dw = fieldWindow(d, w0);
  assert.equal(updateAll(dw), true);
  const written = results(d.doc);
  const w1 = settled(d);
  const shown = pageOf({doc: d.doc, pages: w1.pages}, 'tgt').num;
  const steps = d.undoDepth;
  const dw2 = fieldWindow(d, w1);
  assert.equal(updateAll(dw2), true);
  return {written, shown, again: dw2.fieldUpdate.changed,
    stepsAgain: d.undoDepth - steps, steps: steps - n0,
    passes: dw.fieldUpdate.passes, after: results(d.doc)};
}

/** The body: a PAGEREF (stored stored), n blocks with a float each
 *  (none when h is 0), the bookmark. */
function body(stored, n, h, lead = '') {
  let s = lead + p(fld(' PAGEREF tgt ', stored));
  for (let k = 0; k < n; k++) {
    s += p(r(text(4)) + (h ? anchorRun({id: k + 1, w: 400, ht: h,
      v: ['paragraph', off(0)]}) : '') + r(text(12)));
    s += p(r(text(10)));
  }
  return s + p(bm('tgt', 'target')) + p(r('after'));
}

describe('Update all fields on settled pages', () => {
  it('floats with square wrap: the page the window shows', async () => {
    const d = new M.Document(await docOf(body(text(300), 20, 300)));
    const o = check(d);
    assert.equal(o.written[0], String(o.shown), JSON.stringify(o));
    assert.equal(o.steps, 1);
    assert.equal(o.again, false, 'a second Update changes nothing');
    assert.equal(o.stepsAgain, 0, 'and makes no undo step');
  });

  it('the same document without floats', async () => {
    const d = new M.Document(await docOf(body(text(300), 20, 0)));
    const o = check(d);
    assert.equal(o.written[0], String(o.shown), JSON.stringify(o));
    assert.equal(o.again, false);
    assert.equal(o.stepsAgain, 0);
  });

  it('unequal newspaper columns before the bookmark', async () => {
    const d = new M.Document(await docOf(body(text(300), 30, 0),
      UNEQUAL));
    const o = check(d);
    assert.equal(o.written[0], String(o.shown), JSON.stringify(o));
    assert.equal(o.again, false);
    assert.equal(o.stepsAgain, 0);
  });

  it('a changed SEQ first: pass 1 lays out again, settled', async () => {
    const lead = p(r('Figure ') + fld(' SEQ Figure ', '7')) +
      p(fld(' DATE \\@ "yyyy" ', '1999'));
    const d = new M.Document(await docOf(body(text(300), 20, 300,
      lead)));
    const o = check(d);
    assert.equal(o.written[0], '1');
    assert.equal(o.written[1], String(new Date().getFullYear()));
    assert.equal(o.written[2], String(o.shown), JSON.stringify(o));
    assert.equal(o.again, false);
    assert.equal(o.stepsAgain, 0);
  });
});
