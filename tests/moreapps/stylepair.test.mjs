// StylePair: a linked paragraph / character style pair is deleted
// and renamed together.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {createStyle, modifyStyle, renameStyle, deleteStyle}
  from '../../tools/moreapps/!Letters/StyleCmd';
import {mateOf, deletePlan, renamePlan}
  from '../../tools/moreapps/!Letters/StylePair';
import {usedBy, usedByPair, remove}
  from '../../tools/moreapps/!Letters/StyleDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {emptyDoc, newPara}
  from '../../tools/moreapps/!Letters/Model';
import {deleteQuestion}
  from '../../tools/moreapps/!Letters/StylesState';

const rp = (o) => ({extra: [], ...o});
const sty = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, custom: true, ...o});

function pairTable() {
  const t = ensureBuiltins(newStyleTable());
  const r = createStyle(t, {name: 'Foo', type: 'paragraph', link: true});
  return r.table;
}

function build() {
  const doc = emptyDoc();
  doc.styles = pairTable();
  const runs = [{start: 0, end: 2, rPr: rp({}), rStyle: 'FooChar'},
    {start: 2, end: 5, rPr: rp({})}];
  doc.sections[0].blocks = [newPara('body', {pStyle: 'Foo'}),
    newPara('hello', {runs}), newPara('plain')];
  const d = new Document(doc);
  return {d, typing: new Typing(d)};
}

describe('StylePair', () => {
  it('mateOf only when the mate links back', () => {
    const t = pairTable();
    assert.equal(mateOf(t, 'Foo'), 'FooChar');
    assert.equal(mateOf(t, 'FooChar'), 'Foo');
    addStyle(t, sty('One', {link: 'Oc'}));
    addStyle(t, sty('Oc', {type: 'character'}));
    assert.equal(mateOf(t, 'One'), null);
    assert.equal(mateOf(t, 'Normal'), null);
  });
  it('deletePlan names the mate unless it is built-in or default', () => {
    const t = pairTable();
    assert.deepEqual(deletePlan(t, 'Foo').ids, ['Foo', 'FooChar']);
    assert.deepEqual(deletePlan(t, 'FooChar').ids, ['FooChar', 'Foo']);
    t.defaults.character = 'FooChar';
    assert.deepEqual(deletePlan(t, 'Foo').ids, ['Foo']);
  });
  it('delete removes both halves and re-bases their children', () => {
    const t = pairTable();
    addStyle(t, sty('Kid', {basedOn: 'Foo', next: 'Foo'}));
    addStyle(t, sty('KidC', {type: 'character', basedOn: 'FooChar'}));
    const o = deleteStyle(t, 'Foo');
    assert.ok(!o.styles.has('Foo') && !o.styles.has('FooChar'));
    assert.equal('basedOn' in o.styles.get('Kid'), false);
    assert.equal('next' in o.styles.get('Kid'), false);
    assert.equal('basedOn' in o.styles.get('KidC'), false);
    const c = deleteStyle(t, 'FooChar');
    assert.ok(!c.styles.has('Foo') && !c.styles.has('FooChar'));
  });
  it('a one-way link or a mate linked elsewhere stays', () => {
    const t = pairTable();
    addStyle(t, sty('P1', {link: 'C1'}));
    addStyle(t, sty('C1', {type: 'character'}));        // one-way
    addStyle(t, sty('P2', {link: 'C2'}));
    addStyle(t, sty('C2', {type: 'character', link: 'Foo'}));
    const a = deleteStyle(t, 'P1');
    assert.ok(!a.styles.has('P1') && a.styles.has('C1'));
    const b = deleteStyle(t, 'P2');
    assert.ok(!b.styles.has('P2') && b.styles.has('C2'));
    assert.equal(b.styles.get('C2').link, 'Foo');
  });
  it('remove strips both halves in one undo step', () => {
    const {d, typing} = build();
    const before = structuredClone(d.doc);
    assert.deepEqual(usedByPair(d.doc, 'Foo'), {paragraphs: 1, runs: 1});
    assert.deepEqual(usedBy(d.doc, 'Foo'), {paragraphs: 1, runs: 0});
    assert.equal(remove(d, typing, 'Foo'), true);
    assert.equal(d.undoDepth, 1);
    assert.ok(!d.doc.styles.styles.has('FooChar'));
    const bl = d.doc.sections[0].blocks;
    assert.equal(bl[0].pStyle, undefined);
    assert.ok(bl[1].runs.every((r) => r.rStyle === undefined));
    assert.ok(d.undo());
    assert.deepEqual(d.doc, before);
  });
  it('removing the character half also takes the paragraph half', () => {
    const {d, typing} = build();
    assert.equal(remove(d, typing, 'FooChar'), true);
    assert.ok(!d.doc.styles.styles.has('Foo'));
    assert.equal(d.doc.sections[0].blocks[0].pStyle, undefined);
  });
  it('confirmation text counts uses of both halves', () => {
    const {d} = build();
    const q = deleteQuestion({id: 'Foo', name: 'Foo'},
      usedByPair(d.doc, 'Foo'));
    assert.match(q, /1 paragraph\b/);
    assert.match(q, /1 text range\b/);
  });
  it('rename renames the mate Foo Char to Bar Char', () => {
    const t = pairTable();
    const o = renameStyle(t, 'Foo', 'Bar');
    assert.equal(o.styles.get('Foo').name, 'Bar');
    assert.equal(o.styles.get('FooChar').name, 'Bar Char');
    assert.equal(o.styles.get('FooChar').raw, null);
    assert.ok(o.styles.has('Foo') && o.styles.has('FooChar'));
    assert.equal(t.styles.get('FooChar').name, 'Foo Char');
    const m = modifyStyle(t, 'Foo', {name: 'Baz', rPr: {b: true}});
    assert.equal(m.styles.get('FooChar').name, 'Baz Char');
    assert.equal(m.styles.get('FooChar').rPr.b, true);
  });
  it('a differently named mate or a taken name is left alone', () => {
    const t = pairTable();
    t.styles.get('FooChar').name = 'Foo Text';
    assert.equal(renameStyle(t, 'Foo', 'Bar').styles.get('FooChar').name,
      'Foo Text');
    const u = pairTable();
    addStyle(u, sty('Taken', {name: 'bar char', type: 'character'}));
    const o = renameStyle(u, 'Foo', 'Bar');
    assert.equal(o.styles.get('Foo').name, 'Bar');
    assert.equal(o.styles.get('FooChar').name, 'Foo Char');
    assert.equal(renamePlan(u, 'Foo', 'Bar'), null);
    assert.deepEqual(renamePlan(pairTable(), 'Foo', 'Bar'),
      {mateName: 'Bar Char'});
  });
  it('built-ins still cannot be renamed', () => {
    const t = pairTable();
    assert.equal(renameStyle(t, 'Heading1', 'Big'), null);
    assert.equal(renamePlan(t, 'Heading1', 'Big'), null);
  });
});
