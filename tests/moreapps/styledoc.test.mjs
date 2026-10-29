// StyleDoc: style-table changes on a Document (Batch E1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {createStyle} from '../../tools/moreapps/!Letters/StyleCmd';
import {usedBy, run, remove}
  from '../../tools/moreapps/!Letters/StyleDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {emptyDoc, newPara, newCell, newRow, newTable}
  from '../../tools/moreapps/!Letters/Model';

const H = 'word/header1.xml', F = 'word/footer1.xml';
const rp = (o) => ({extra: [], ...o});
const sty = (id, type = 'paragraph') => ({id, type, name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null});

function build() {
  const doc = emptyDoc();
  const t = ensureBuiltins(newStyleTable());
  addStyle(t, sty('Fancy'));
  addStyle(t, sty('Em', 'character'));
  doc.styles = t;
  const cellP = newPara('cell', {pStyle: 'Fancy'});
  const tbl = newTable({grid: [1000], rows: [newRow([
    newCell([cellP])])]});
  const runs = [{start: 0, end: 2, rPr: rp({}), rStyle: 'Em'},
    {start: 2, end: 5, rPr: rp({})}];
  doc.sections[0].blocks = [newPara('body', {pStyle: 'Fancy'}),
    newPara('hello', {runs}), tbl, newPara('plain')];
  const story = (kind, part, p) => ({part, kind, root: {name: 'w:' +
    kind, attrs: []}, prolog: null, blocks: [p], rels: null,
  relsPart: null, orig: [], bytes: null});
  doc.stories = new Map([
    [H, story('hdr', H, newPara('head', {pStyle: 'Fancy'}))],
    [F, story('ftr', F, newPara('foot', {pStyle: 'Fancy',
      runs: [{start: 0, end: 4, rPr: rp({}), rStyle: 'Em'}]}))]]);
  const d = new Document(doc);
  return {d, typing: new Typing(d)};
}

describe('StyleDoc', () => {
  it('run applies createStyle and undo removes it', () => {
    const {d, typing} = build();
    const r = run(d, typing, (t) => createStyle(t, {name: 'Brand New',
      type: 'paragraph'}));
    assert.ok(r && r.id);
    assert.ok(d.doc.styles.styles.has(r.id));
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.ok(!d.doc.styles.styles.has(r.id));
  });
  it('run with a null change adds no undo step', () => {
    const {d, typing} = build();
    assert.equal(run(d, typing, () => null), null);
    assert.equal(d.undoDepth, 0);
  });
  it('remove clears pStyle in body, cell, header and footer', () => {
    const {d, typing} = build();
    assert.equal(remove(d, typing, 'Fancy'), true);
    assert.deepEqual(usedBy(d.doc, 'Fancy'), {paragraphs: 0, runs: 0});
    assert.ok(!d.doc.styles.styles.has('Fancy'));
    assert.equal(d.doc.stories.get(H).blocks[0].pStyle, undefined);
    assert.equal(d.doc.stories.get(F).blocks[0].pStyle, undefined);
    const cell = d.doc.sections[0].blocks[2].rows[0].cells[0];
    assert.equal(cell.blocks[0].pStyle, undefined);
    assert.equal(d.doc.sections[0].blocks[0].pStyle, undefined);
  });
  it('remove clears rStyle on runs', () => {
    const {d, typing} = build();
    assert.deepEqual(usedBy(d.doc, 'Em'), {paragraphs: 0, runs: 2});
    assert.equal(remove(d, typing, 'Em'), true);
    assert.deepEqual(usedBy(d.doc, 'Em'), {paragraphs: 0, runs: 0});
    const p = d.doc.sections[0].blocks[1];
    assert.ok(p.runs.every((r) => r.rStyle === undefined));
    assert.equal(p.text, 'hello');
  });
  it('undo of remove restores table and paragraphs in one step', () => {
    const {d, typing} = build();
    remove(d, typing, 'Fancy');
    assert.equal(d.undoDepth, 1);
    assert.ok(d.undo());
    assert.ok(d.doc.styles.styles.has('Fancy'));
    assert.deepEqual(usedBy(d.doc, 'Fancy'), {paragraphs: 4, runs: 0});
    assert.equal(d.doc.stories.get(H).blocks[0].pStyle, 'Fancy');
    assert.equal(d.canUndo, false);
  });
  it('remove refuses what deleteStyle refuses', () => {
    const {d, typing} = build();
    assert.equal(remove(d, typing, 'NoSuch'), false);
    assert.equal(d.undoDepth, 0);
  });
  it('usedBy counts across stories', () => {
    const {d} = build();
    assert.deepEqual(usedBy(d.doc, 'Fancy'), {paragraphs: 4, runs: 0});
    assert.deepEqual(usedBy(d.doc, 'Em'), {paragraphs: 0, runs: 2});
    assert.deepEqual(usedBy(d.doc, 'None'), {paragraphs: 0, runs: 0});
  });
});
