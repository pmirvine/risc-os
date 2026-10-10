// InsertApply: Insert > Page break (Ctrl-Enter): the selection
// replaced, the break at the caret and the paragraph split after it
// (Word 2013's form), one undo step; the break written as
// <w:br w:type="page"/> in a run and read back; deleted by Backspace
// and Delete; copied and pasted within and across documents; the
// caret after undo and redo.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insert, pageBreak} from '../../tools/moreapps/!Word/InsertApply';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {keymap} from '../../tools/moreapps/!Word/Keymap';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {Document} from '../../tools/moreapps/!Word/Document';
import {mk, texts, ids, P, C, SEL, at, undoable, valid, box, O, snap}
  from './edit-docs.mjs';
import {listDoc, li} from './list-docs.mjs';
import {tm} from './word-docs.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {xmlEntries} from './docx-compare.mjs';

const PB = {kind: 'br', level: 'r', brType: 'page'};
const isPB = (x) => !!x && x.kind === 'br' && x.brType === 'page';
const DATE = new Date(Date.UTC(2026, 0, 1));

/** Ctrl-Enter through EditApply.run, checked: one step, exact undo. */
function ctrlEnter(d, sel, t = new Typing(d)) {
  const n = d.undoDepth;
  const out = undoable(d, () => run('pageBreak', d, t, sel));
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  return out;
}

describe('InsertApply: the page break command', () => {
  it('Ctrl-Enter is pageBreak in the Keymap', () => {
    assert.equal(keymap.lookup({code: 13, key: 'Enter', ctrl: true}),
      'pageBreak');
    assert.equal(keymap.lookup({code: 13, ctrl: true}), 'pageBreak');
    assert.equal(keymap.lookup({code: 13, key: 'Enter'}), 'enter');
    assert.equal(keymap.lookup({code: 13, key: 'Enter', ctrl: true,
      shift: true}), null);
    assert.equal(keymap.labelFor('pageBreak'), 'Ctrl+Enter');
  });
  it('mid-paragraph: the break ends the first part', () => {
    const d = mk(['abcdef']);
    const s = ctrlEnter(d, C(d, 0, 3));
    assert.deepEqual(texts(d), ['abc' + O, 'def']);
    assert.deepEqual(P(d, 0).inlines, {3: PB});
    assert.deepEqual(at(d, s), [1, 0]);
    valid(d);
  });
  it('at the end, at the start, in an empty paragraph', () => {
    const d = mk(['abc', 'xyz', '']);
    ctrlEnter(d, C(d, 0, 3));
    assert.deepEqual(texts(d), ['abc' + O, '', 'xyz', '']);
    const s = ctrlEnter(d, C(d, 2, 0));
    assert.deepEqual(texts(d), ['abc' + O, '', O, 'xyz', '']);
    assert.deepEqual(at(d, s), [3, 0]);
    const s2 = ctrlEnter(d, C(d, 4, 0));
    assert.deepEqual(texts(d), ['abc' + O, '', O, 'xyz', O, '']);
    assert.deepEqual(at(d, s2), [5, 0]);
    assert.ok([0, 2, 4].every((k) => isPB(Object.values(
      P(d, k).inlines)[0])));
  });
  it('the new paragraph keeps the properties (and the list)', () => {
    const d = listDoc([li('one'), ['two', {pPr: {jc: 'center',
      extra: []}, pStyle: 'Indented'}]]);
    ctrlEnter(d, C(d, 0, 1));
    assert.deepEqual(texts(d), ['o' + O, 'ne', 'two']);
    assert.deepEqual(P(d, 0).pPr.numPr, {numId: 1, ilvl: 0});
    assert.deepEqual(P(d, 1).pPr.numPr, {numId: 1, ilvl: 0});
    ctrlEnter(d, C(d, 2, 1));
    assert.equal(P(d, 3).pStyle, 'Indented');
    assert.equal(P(d, 3).pPr.jc, 'center');
    assert.notEqual(P(d, 3).id, P(d, 2).id);
  });
  it('over a selection across paragraphs: deleted first', () => {
    const d = mk(['abc', 'mid', 'def']);
    const s = ctrlEnter(d, SEL(d, 0, 1, 2, 2));
    assert.deepEqual(texts(d), ['a' + O, 'f']);
    assert.deepEqual(at(d, s), [1, 0]);
    const e = mk(['abc']);
    ctrlEnter(e, SEL(e, 0, 3, 0, 1));
    assert.deepEqual(texts(e), ['a' + O, '']);
  });
  it('the break takes the format of the text before it', () => {
    const bold = {b: true, extra: []};
    const d = mk([['ab', {runs: [{start: 0, end: 2, rPr: bold}]}]]);
    ctrlEnter(d, C(d, 0, 2));
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 3, rPr: bold}]);
  });
  it('by a table: an empty paragraph there first', () => {
    const d = mk(['a', box()]);
    ctrlEnter(d, C(d, 1, 1));
    assert.deepEqual(texts(d), ['a', '#', O, '']);
    const e = mk([box(), 'z']);
    ctrlEnter(e, C(e, 0, 0));
    assert.deepEqual(texts(e), [O, '', '#', 'z']);
  });
  it('one undo step after typing; undo and redo put the caret back',
    () => {
      const d = mk(['abcdef']);
      const t = new Typing(d);
      const s = t.type(C(d, 0, 6), 'gh');
      const before = snap(d), n = d.undoDepth;
      let ops = null;
      d.on('change', (ev) => { ops = ev.ops; });
      const m = tm();
      const L = new DocLayout(d.doc, m);
      L.layout(800);
      run('pageBreak', d, t, s);
      assert.equal(d.undoDepth, n + 1);
      d.undo();
      assert.deepEqual(snap(d), before);
      const u = stepEnd(d.doc, ops, L);
      assert.deepEqual([ids(d).indexOf(u.id), u.off], [0, 8]);
      d.redo();
      const rd = stepEnd(d.doc, ops, L);
      assert.deepEqual([ids(d).indexOf(rd.id), rd.off], [1, 0]);
    });
  it('insert(): unknown ids are undefined; no document, no step', () => {
    const d = mk(['ab']);
    const t = new Typing(d);
    assert.equal(insert('nonsense', d, t, C(d, 0, 1)), undefined);
    assert.equal(insert('__proto__', d, t, C(d, 0, 1)), undefined);
    assert.equal(insert('toString', d, t, C(d, 0, 1)), undefined);
    assert.equal(insert('pageBreak', d, t, null), undefined);
    const bad = {anchor: {id: 999, off: 0}, head: {id: 999, off: 0}};
    const n = d.undoDepth;
    assert.equal(pageBreak(d, bad), bad);
    assert.equal(d.undoDepth, n);
    assert.equal(d.dirty, false);
  });
});

describe('InsertApply: the break deleted, copied and saved', () => {
  it('Backspace after it and Delete before it remove it', () => {
    const d = mk(['abc']);
    const t = new Typing(d);
    ctrlEnter(d, C(d, 0, 3), t);
    const b = undoable(d, () => run('backspace', d, t, C(d, 0, 4)));
    assert.deepEqual(texts(d), ['abc', '']);
    assert.deepEqual(at(d, b), [0, 3]);
    d.undo();
    undoable(d, () => run('delete', d, t, C(d, 0, 3)));
    assert.deepEqual(texts(d), ['abc', '']);
    assert.deepEqual(P(d, 0).inlines, {});
  });
  it('copy and paste within the document keeps it', () => {
    const d = mk(['abc']);
    ctrlEnter(d, C(d, 0, 2));
    const c = slice(d.doc, SEL(d, 0, 1, 1, 1));
    undoable(d, () => pasteBlocks(d, C(d, 1, 1), c.blocks,
      {sameDoc: true}));
    assert.deepEqual(texts(d), ['ab' + O, 'cb' + O, 'c']);
    assert.ok(isPB(P(d, 1).inlines[2]));
    valid(d);
  });
  it('pasted into another document it is still a page break', () => {
    const d = mk(['abc']);
    ctrlEnter(d, C(d, 0, 2));
    const c = slice(d.doc, SEL(d, 0, 1, 0, 3));
    const e = mk(['xy']);
    undoable(e, () => pasteBlocks(e, C(e, 0, 1), c.blocks,
      {sameDoc: false, styleNames: c.styleNames}));
    assert.deepEqual(texts(e), ['xb' + O + 'y']);
    assert.deepEqual(P(e, 0).inlines, {2: PB});
    valid(e);
  });
  it('written as <w:br w:type="page"/> in a run; read back', async () => {
    const d = mk(['abc']);
    ctrlEnter(d, C(d, 0, 3));
    const bytes = await writeDocx(d.doc, {date: DATE});
    const root = (await xmlEntries(bytes)).get('word/document.xml')
      .root;
    const find = (x, out = []) => {
      if (x && typeof x === 'object') {
        if (x.name === 'w:br') out.push(x);
        for (const c of x.children || []) {
          if (c && typeof c === 'object') c.parent = x;
          find(c, out);
        }
      }
      return out;
    };
    const brs = find(root);
    assert.equal(brs.length, 1);
    assert.deepEqual(brs[0].attrs, [['w:type', 'page']]);
    assert.equal(brs[0].parent.name, 'w:r');
    const back = await readDocx(bytes);
    const q = back.sections[0].blocks;
    assert.deepEqual(q.map((b) => b.text), ['abc' + O, '']);
    assert.equal(q[0].inlines[3].brType, 'page');
  });
  it('a Word file: lastRenderedPageBreak and page breaks', async () => {
    const lr = '<w:r><w:lastRenderedPageBreak/><w:t>top</w:t></w:r>';
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(lr + r('one')) + p('<w:r><w:br w:type="page"/>' +
      '</w:r>') + p(r('x') + '<w:r><w:br w:type="page"/><w:t>y</w:t>' +
      '</w:r>') + p('<w:r><w:br w:type="column"/></w:r>'))}));
    const L = new DocLayout(doc, tm());
    L.layout(800);
    const rules = L.items.map((it) => it.lines.flatMap((l) => l.items)
      .filter((x) => x.kind === 'pagebreak').map((x) => x.label));
    assert.deepEqual(rules, [[], ['Page break'], ['Page break'],
      ['Column break']]);
    assert.equal(L.items[2].lines.length, 2);
    // saved again: the breaks and lastRenderedPageBreak written as
    // they were read, each in its run
    const d = new Document(doc);
    const bytes = await writeDocx(d.doc, {date: DATE});
    const marks = (root) => {
      const out = [];
      const walk = (x, run) => {
        if (!x || typeof x !== 'object') return;
        if (x.name === 'w:br' || x.name === 'w:lastRenderedPageBreak') {
          out.push([x.name, JSON.stringify(x.attrs), x.children.length,
            run]);
        }
        for (const c of x.children || []) walk(c, x.name === 'w:r');
      };
      walk(root, false);
      return out;
    };
    const got = marks((await xmlEntries(bytes)).get('word/document.xml')
      .root);
    assert.deepEqual(got, [
      ['w:lastRenderedPageBreak', '[]', 0, true],
      ['w:br', '[["w:type","page"]]', 0, true],
      ['w:br', '[["w:type","page"]]', 0, true],
      ['w:br', '[["w:type","column"]]', 0, true]]);
    const again = await readDocx(bytes);
    assert.deepEqual(again.sections[0].blocks.map((b) => [b.text,
      Object.values(b.inlines).map((x) => x.brType ?? x.node.name)]),
    doc.sections[0].blocks.map((b) => [b.text,
      Object.values(b.inlines).map((x) => x.brType ?? x.node.name)]));
  });
});
