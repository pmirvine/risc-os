// EditStep stepTo (Batch D P7.5, D14, Review Focus 2): where an undo
// or redo step leaves the window, read in the story the step was in:
// a body step gives {story: null, sel} (stepEnd's caret in the body);
// a header op gives {story: part, sel} with the caret read in that
// story's blocks (never as a body path); the undo of the step that
// CREATED a header (its setStory null applied last) gives that story,
// gone (no sel); its redo the story again with the caret after the
// letter typed; a step that names no place (a setSection, a setStory
// alone) gives null; lastLeaf skips setStory as it skips setDocPart
// and setSection.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {stepTo, stepEnd, lastLeaf}
  from '../../tools/moreapps/!Letters/EditStep';
import {facadeOf, pendingFacade}
  from '../../tools/moreapps/!Letters/StoryFacade';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {p, r} from './build-docx.mjs';
import {withHeaders, freeze} from './story-fixtures.mjs';
import {wordHf, BODY} from './hf-fixtures.mjs';

const H = 'word/header1.xml';
let heads, bare;
before(async () => {
  heads = freeze(await readDocx(await withHeaders(
    p(r('body one')) + p(r('body two')),
    {default: {hdr: p(r('Head one')) + p(r('Head two'))}})));
  bare = freeze(await readDocx(await wordHf({body: BODY(3)})));
});
const fresh = (doc) => new Document({...doc, sections: doc.sections
  .map((s) => ({...s, blocks: s.blocks.slice()}))});
/** The ops of the next 'change' event of d while fn runs. */
function opsOf(d, fn) {
  let got = null;
  const off = d.on('change', (ev) => { got = ev.ops; });
  try { fn(); } finally { off(); }
  return got;
}

describe('EditStep stepTo: the step\'s story and its caret', () => {
  it('a body step: story null, the caret where stepEnd puts it', () => {
    const d = fresh(heads), t = new Typing(d);
    const b0 = d.doc.sections[0].blocks[0];
    t.type(S.caret({id: b0.id, off: 4}), 'XY');
    const ops = opsOf(d, () => d.undo());
    const got = stepTo(d.doc, ops, null);
    assert.equal(got.story, null);
    assert.equal(got.gone, false);
    assert.deepEqual(got.sel, S.caret({id: b0.id, off: 4}));
    assert.deepEqual(got.sel.head, stepEnd(d.doc, ops, null));
  });

  it('an undo of a header op: {story: part, sel} read in the story',
    () => {
      const d = fresh(heads), f = facadeOf(d, H, 0), t = new Typing(f);
      const h1 = d.doc.stories.get(H).blocks[1];
      t.type(S.caret({id: h1.id, off: 4}), 'Q');
      const ops = opsOf(d, () => d.undo());
      // (a body path [0, 1] would be 'body two': never read as one)
      assert.equal(stepEnd(d.doc, ops, null).id,
        d.doc.sections[0].blocks[1].id, 'stepEnd alone misreads it');
      const got = stepTo(d.doc, ops, null);
      assert.equal(got.story, H);
      assert.equal(got.gone, false);
      assert.deepEqual(got.sel, S.caret({id: h1.id, off: 4}));
      assert.equal(got.doc.sections[0].blocks[1].id, h1.id, 'the view');
      const redo = opsOf(d, () => d.redo());
      assert.deepEqual(stepTo(d.doc, redo, null).sel,
        S.caret({id: h1.id, off: 5}));
    });

  it('the undo of the step that created the header: that story,'
    + ' gone; its redo: the story, the caret after the letter', () => {
    const d = fresh(bare);
    const f = pendingFacade(d, {s: 0, kind: 'hdr', type: 'default'});
    const t = new Typing(f);
    t.type(S.caret({id: f.doc.sections[0].blocks[0].id, off: 0}), 'A');
    const part = f.part;
    assert.ok(d.doc.stories.has(part));
    const undo = opsOf(d, () => d.undo());
    assert.equal(d.doc.stories.size, 0);
    const u = stepTo(d.doc, undo, null);
    assert.deepEqual([u.story, u.gone, u.sel], [part, true, null]);
    const redo = opsOf(d, () => d.redo());
    const rr = stepTo(d.doc, redo, null);
    const b = d.doc.stories.get(part).blocks[0];
    assert.deepEqual([rr.story, rr.gone], [part, false]);
    assert.deepEqual(rr.sel, S.caret({id: b.id, off: 1}));
  });

  it('a step that names no place: null; setStory skipped', () => {
    assert.equal(stepTo(heads, [{op: 'setSection', at: 0}], null),
      null);
    assert.equal(stepTo(heads, [{op: 'setStory', part: H,
      story: null}], null), null);
    assert.equal(stepTo(heads, null, null), null);
    const leaf = {op: 'spliceText', story: H, block: [0, 0]};
    assert.equal(lastLeaf([{op: 'compound', ops: [leaf,
      {op: 'setStory', part: H, story: null},
      {op: 'setDocPart', key: 'rels'}]}]), leaf);
  });

  it('a story the document does not have: gone', () => {
    const got = stepTo(heads, [{op: 'spliceText',
      story: 'word/header9.xml', block: [0, 0], at: 0, del: 0}], null);
    assert.deepEqual([got.story, got.gone, got.sel],
      ['word/header9.xml', true, null]);
  });
});
