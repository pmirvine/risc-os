// Insert > Column break (Batch D P10.3, D22): a column break, a
// U+FFFC with {kind: 'br', level: 'r', brType: 'column'}, put in as
// the page break is (Batch A's rules: the selection deleted first,
// the paragraph split after it, one undo step), written as
// <w:br w:type="column"/> in a run and read back; refused in a
// table's cell and in a header or footer (./StoryFacade REFUSED);
// Ctrl+Shift+Enter outside a table runs it, inside a table it stays
// Split table (./EditKeys decides by the caret's place); shown with
// the label 'Column break'; in Print layout the text after it goes
// to the next column.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {insert, columnBreak}
  from '../../tools/moreapps/!Letters/InsertApply';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {keymap} from '../../tools/moreapps/!Letters/Keymap';
import {keyFor} from '../../tools/moreapps/!Letters/EditKeys';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {breakLabel} from '../../tools/moreapps/!Letters/BreakMarks';
import {sameStories} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {mk, texts, P, C, SEL, at, undoable, valid, box, O, snap}
  from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';
import {withHeaders, freeze as freezeDoc} from './story-fixtures.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {xmlEntries} from './docx-compare.mjs';
import {loadStyles, tm} from './word-docs.mjs';

before(loadStyles);
const CB = {kind: 'br', level: 'r', brType: 'column'};
const DATE = new Date(Date.UTC(2026, 0, 1));
const ENTER = {code: 13, key: 'Enter', ctrl: true, shift: true};

/** The column break through EditApply.run: one step, exact undo. */
function colBreak(d, sel, t = new Typing(d)) {
  const n = d.undoDepth;
  const out = undoable(d, () => run('columnBreak', d, t, sel));
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  return out;
}

describe('Insert > Column break: the command', () => {
  it('mid-paragraph: the break ends the first part; one step', () => {
    const d = mk(['abcdef']);
    const before = snap(d);
    const s = colBreak(d, C(d, 0, 3));
    assert.deepEqual(texts(d), ['abc' + O, 'def']);
    assert.deepEqual(P(d, 0).inlines, {3: CB});
    assert.deepEqual(at(d, s), [1, 0]);
    valid(d);
    d.undo();
    assert.deepEqual(snap(d), before);
  });
  it('over a selection: deleted first, in the same step', () => {
    const d = mk(['abc', 'mid', 'def']);
    const s = colBreak(d, SEL(d, 0, 1, 2, 2));
    assert.deepEqual(texts(d), ['a' + O, 'f']);
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('by a table: an empty paragraph there first', () => {
    const d = mk(['a', box()]);
    colBreak(d, C(d, 1, 1));
    assert.deepEqual(texts(d), ['a', '#', O, '']);
  });
  it('refused in a table\'s cell: null, no step', () => {
    const T = modelTable([['c0', 'c1']]);
    const d = mk(['p0', freeze(T), 'p2']);
    const cell = T.rows[0].cells[0].blocks[0];
    const sel = S.caret({id: cell.id, off: 1});
    assert.equal(run('columnBreak', d, new Typing(d), sel), null);
    assert.equal(columnBreak(d, sel), null);
    assert.equal(d.undoDepth, 0);
  });
  it('no document place: nothing; unknown selection: no step', () => {
    const d = mk(['ab']);
    assert.equal(insert('columnBreak', d, new Typing(d), null),
      undefined);
    const bad = {anchor: {id: 999, off: 0}, head: {id: 999, off: 0}};
    assert.equal(columnBreak(d, bad), bad);
    assert.equal(d.undoDepth, 0);
  });
  it('its label on the screen is Column break', () => {
    assert.equal(breakLabel(CB), 'Column break');
  });
});

describe('Column break: written and read', () => {
  it('<w:br w:type="column"/> in a run; read back', async () => {
    const d = mk(['abc']);
    colBreak(d, C(d, 0, 3));
    const bytes = await writeDocx(d.doc, {date: DATE});
    const root = (await xmlEntries(bytes)).get('word/document.xml')
      .root;
    const brs = [];
    const find = (x, parent) => {
      if (!x || typeof x !== 'object') return;
      if (x.name === 'w:br') brs.push({x, parent});
      for (const c of x.children || []) find(c, x);
    };
    find(root, null);
    assert.equal(brs.length, 1);
    assert.deepEqual(brs[0].x.attrs, [['w:type', 'column']]);
    assert.equal(brs[0].parent.name, 'w:r');
    const back = await readDocx(bytes);
    const q = back.sections[0].blocks;
    assert.deepEqual(q.map((b) => b.text), ['abc' + O, '']);
    assert.equal(q[0].inlines[3].brType, 'column');
  });
});

describe('Column break: in a header or footer', () => {
  it('refused: null (a beep), nothing changed, no step', async () => {
    const opened = freezeDoc(await readDocx(await withHeaders(
      p(r('body')), {default: {hdr: p(r('Head one'))}})));
    const d = new Document({...opened, sections: opened.sections.map(
      (s) => ({...s, blocks: s.blocks.slice()}))});
    const H = 'word/header1.xml';
    const f = facadeOf(d, H, 0);
    assert.equal(f.refuses('columnBreak'), true);
    const sel = S.caret({id: d.doc.stories.get(H).blocks[0].id,
      off: 2});
    assert.equal(run('columnBreak', f, new Typing(f), sel), null);
    assert.equal(d.undoDepth, 0);
    assert.ok(sameStories(d.doc.stories, opened.stories));
  });
});

describe('Column break: Ctrl+Shift+Enter', () => {
  const view = (d, sel) => {
    const v = {d, sel, ran: [], mac: false,
      run(id) { v.ran.push(id); return true; },
      setSelection() {}, input() { throw new Error('typed'); }};
    return v;
  };
  it('the Keymap: a row in the Insert menu; the key is still ' +
    'splitTable\'s (EditKeys routes it)', () => {
    const row = keymap.row('columnBreak');
    assert.ok(row);
    assert.equal(row.menu, 'Insert');
    assert.equal(row.label, 'Column break');
    assert.equal(keymap.lookup(ENTER), 'splitTable');
  });
  it('outside a table: columnBreak', () => {
    const d = mk(['abc', 'def']);
    const v = view(d, C(d, 0, 1));
    assert.equal(keyFor(v, ENTER), true);
    assert.deepEqual(v.ran, ['columnBreak']);
    const w = view(d, SEL(d, 0, 1, 1, 2));
    keyFor(w, ENTER);
    assert.deepEqual(w.ran, ['columnBreak']);
  });
  it('in a table (either end of the selection): Split table', () => {
    const T = modelTable([['c0', 'c1'], ['d0', 'd1']]);
    const d = mk(['p0', freeze(T), 'p2']);
    const cell = T.rows[1].cells[0].blocks[0];
    const v = view(d, S.caret({id: cell.id, off: 1}));
    keyFor(v, ENTER);
    assert.deepEqual(v.ran, ['splitTable']);
    const w = view(d, S.select({id: P(d, 0).id, off: 0},
      {id: cell.id, off: 1}));
    keyFor(w, ENTER);
    assert.deepEqual(w.ran, ['splitTable']);
    // (and Split table itself still splits the table)
    const out = run('splitTable', d, new Typing(d),
      S.caret({id: cell.id, off: 0}));
    assert.ok(out);
    assert.deepEqual(d.doc.sections[0].blocks.map((b) => b.type),
      ['p', 'tbl', 'p', 'tbl', 'p']);
  });
});

describe('Column break: in Print layout', () => {
  it('the text after it goes to the next column', async () => {
    const COLS2 = '<w:sectPr><w:cols w:num="2" w:space="720"/>' +
      '</w:sectPr>';
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('alpha beta gamma delta')) +
        p(r('epsilon zeta')) + COLS2)}));
    const d = new Document(doc);
    colBreak(d, C(d, 0, 6));
    assert.deepEqual(texts(d).slice(0, 2), ['alpha ' + O,
      'beta gamma delta']);
    const L = new DocLayout(d.doc, tm());
    L.layout(1000);
    const pg = new Pages(galleyOf(L)).finish().at(0);
    assert.equal(pg.cols.length, 2);
    assert.equal(pg.cols[0].why, 'break');
    assert.deepEqual([pg.cols[1].start.k, pg.cols[1].start.line],
      [1, 0]);
    assert.equal(L.items[1].block.text, 'beta gamma delta');
  });
});
