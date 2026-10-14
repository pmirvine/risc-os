// The header and footer mode while the pages are not settled (Batch
// D final fix A, F1-I1): ./HdrEdit keeps the mode's page while the
// window says its pages are still being put right (v.settling():
// ./ViewMode, column or wrap passes due or running), as it does
// while they are still being made (P.done false): a page list that
// is an approximation must not take the window out of the mode.
// Once settled, a page that no longer shows the story still lets it
// go (the mode left). A document of three sections, each with its
// own header: the second, continuous, holds two paragraphs and starts
// page 2; a paragraph deleted from the first makes it start on page
// 1, so no page shows its header. And ./FieldUpdate (the field
// commands): the mode left while the command's layout is made (the
// pages show the story on no page) leaves the body's selection, never
// the story's selection in the body. Real DocLayout, Pages and
// Document, the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {enterMode, leaveMode}
  from '../../tools/moreapps/!Letters/HdrEdit';
import {afterChange} from '../../tools/moreapps/!Letters/HdrStep';
import {updateField} from '../../tools/moreapps/!Letters/FieldUpdate';
import {p, r} from './build-docx.mjs';
import {wordHf, BODY} from './hf-fixtures.mjs';
import {fld} from './field-fixtures.mjs';
import {tm} from './word-docs.mjs';

const MAR = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" ' +
  'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" ' +
  'w:footer="708" w:gutter="0"/>';
const H2 = 'word/header3.xml';        // (section 2's: wordHf's even)

/** Three sections: n paragraphs (header 1), two in a continuous
 *  one (header 2, with a PAGE field), then 10 (header 3). */
const docOf = async (n) => readDocx(await wordHf({
  first: {hdr: p(r('Head one'))},
  even: {hdr: p(r('Head two ') + fld(' PAGE ', '1'))},
  default: {hdr: p(r('Head three'))},
  body: BODY(n) + p(r('end of one'), '<w:sectPr>' +
    '<w:headerReference w:type="default" r:id="rIdH2"/>' + MAR +
    '</w:sectPr>') + p(r('two a')) + p(r('end of two'), '<w:sectPr>' +
    '<w:headerReference w:type="default" r:id="rIdH3"/>' +
    '<w:type w:val="continuous"/>' + MAR + '</w:sectPr>') +
    BODY(10)}));

/** A window's view (./EditView's fields ./HdrEdit uses) over d in
 *  Print layout; settling: what the window says (v.settling). */
function viewOf(d) {
  const v = {real: d, hdr: null, pending: null, selRev: 0, busy: false,
    formatListeners: [], typing: new Typing(d),
    settling() { return this.busy; },
    get d() { return this.hdr ? this.hdr.facade : this.real; },
    get bodyL() { this.ensure(); return this._L; },
    get L() {
      this.ensure();
      const L = this.hdr && this.hdr.layout();
      if (!L && this.hdr) leaveMode(this);
      return L || this._L;
    },
    ensure() {
      if (!this._stale) return;
      this._stale = false;
      this.relaid();
    },
    relaid() {
      const L = new DocLayout(d.doc, tm(), this._L, {top: 40});
      L.layout(900);
      L.place = PlacePrint(L, new Pages(printGalley(L)).finish());
      L.layout(900);
      this._L = L;
    },
    refused() { this.beeps = (this.beeps || 0) + 1; },
    edited(sel) { this.sel = sel; }};
  v.relaid();
  v.sel = S.caret(v._L.docStart());
  d.on('change', (ev) => {
    v._stale = true;
    afterChange(v, ev);
  });
  return v;
}

/** The page whose top is in section 2 (s 1), or -1. */
const where = (L) => {
  const P = L.place.pages;
  return P.list.findIndex((pg) => pg.s === 1);
};

describe('the mode while the pages are not settled (fix A F1-I1)',
  () => {
    let n = 0, opened = null;
    before(async () => {
      // the least n whose section 2 starts a page (n - 1: it does not)
      for (let k = 4; k < 40 && !opened; k++) {
        const doc = await docOf(k), v = viewOf(new Document(doc));
        if (where(v._L) >= 0) {
          n = k;
          opened = doc;
        }
      }
    });
    const fresh = () => new Document(structuredClone(opened));

    it('the document: section 2 starts page 2 (header 2 there only)',
      () => {
        assert.ok(opened, 'found');
        const v = viewOf(fresh());
        const i = where(v._L);
        assert.ok(i >= 1, `page ${i}`);
        const m = enterMode(v, {kind: 'hdr', i});
        assert.ok(m && m.part === H2, 'header 2 entered');
      });

    it('settled: a body edit that leaves header 2 on no page leaves ' +
      'the mode', () => {
      const d = fresh(), v = viewOf(d), i = where(v._L);
      enterMode(v, {kind: 'hdr', i});
      d.apply({op: 'replaceText', block: [0, 0], at: 0,
        del: d.doc.sections[0].blocks[0].text.length, ins: 'x'});
      assert.equal(where(v.bodyL), -1, 'no page starts section 2');
      assert.ok(v.L, 'laid out');
      assert.ok(v.hdr === null, 'left');
    });

    it('not settled (column or wrap passes due): the mode kept on its ' +
      'page', () => {
      const d = fresh(), v = viewOf(d), i = where(v._L);
      enterMode(v, {kind: 'hdr', i});
      v.busy = true;
      d.apply({op: 'replaceText', block: [0, 0], at: 0,
        del: d.doc.sections[0].blocks[0].text.length, ins: 'x'});
      assert.equal(where(v.bodyL), -1, 'no page starts section 2');
      assert.ok(v.L);
      assert.ok(v.hdr && v.hdr.part === H2 && v.hdr.i === i,
        'the mode kept');
      v.busy = false;                  // (settled: the page list true)
      assert.ok(v.L);
      assert.ok(v.hdr === null, 'left once settled');
    });

    it('Update field leaving the mode under it: the body\'s selection, ' +
      'not the story\'s', () => {
      const d = fresh(), v = viewOf(d), i = where(v._L);
      const body = S.caret({id: d.doc.sections[1].blocks[0].id,
        off: 1});
      v.sel = body;
      enterMode(v, {kind: 'hdr', i});
      const st = d.doc.stories.get(H2), id = st.blocks[0].id;
      v.sel = S.caret({id, off: st.blocks[0].text.length});
      v.ensure = () => {};
      const dw = {view: v, fields: {now: new Date(2000, 0, 1)},
        L: {fields: {now: null}}, rebuild() { leaveMode(v); }};
      assert.ok(updateField(dw) === true, 'updated');
      assert.ok(v.hdr === null, 'left');
      const ids = new Set(d.doc.sections.flatMap((s) => s.blocks)
        .map((b) => b.id));
      assert.ok(ids.has(v.sel.head.id) && ids.has(v.sel.anchor.id),
        `the selection in the body (${v.sel.head.id})`);
      assert.ok(S.equal ? S.equal(v.sel, body) : JSON.stringify(v.sel) === JSON.stringify(body), 'the body\'s');
    });
  });
