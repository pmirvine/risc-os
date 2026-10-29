// StyleTarget: the Format... boxes of the Modify Style box (Tabs,
// Borders, Numbering) against a style instead of a selection (Batch
// E1 Task 9). Each change is a pPr patch kept in the box's pending
// `more`, made a ./StyleCmd modifyStyle patch by ./StylePatch patch
// and written by ./StyleDoc run: one undo step. Pure.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle, paraNumPr}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';
import {patch} from '../../tools/moreapps/!Letters/StylePatch';
import {modifyStyle} from '../../tools/moreapps/!Letters/StyleCmd';
import {run} from '../../tools/moreapps/!Letters/StyleDoc';
import {resolveTabs} from '../../tools/moreapps/!Letters/TabStops';
import {paraBorders} from '../../tools/moreapps/!Letters/BorderResolve';
import {query} from '../../tools/moreapps/!Letters/Format';
import {rulerStops} from '../../tools/moreapps/!Letters/FormatTabs';
import {listFacts} from '../../tools/moreapps/!Letters/ListMake';
import {viewOf, preview, change, numOps, stale}
  from '../../tools/moreapps/!Letters/StyleTarget';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {emptyDoc, newPara} from '../../tools/moreapps/!Letters/Model';

const rp = (o) => ({extra: [], ...o});
const st = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, ...o});
const table = () => {
  const t = ensureBuiltins(newStyleTable());
  t.theme = parse(null);
  return t;
};
const docOf = (t) => {
  const doc = emptyDoc();
  doc.styles = t;
  doc.meta = {mainPart: 'word/document.xml'};
  return doc;
};
const add = (pos, val = 'left') => ({tabs: {edits: [{add: {val, pos}}]}});
const para = (pStyle, pPr = rp()) => ({pStyle, pPr});

/** Run fn(doc); doc (and its table) must be deeply unchanged. */
function pure(doc, fn) {
  const before = structuredClone(doc);
  const out = fn(doc);
  assert.deepEqual(doc, before);
  return out;
}

/** The table the Modify Style box's OK would write with `more`. */
function commit(t, id, more) {
  const r = patch(t, id, {}, more);
  assert.ok(!r.error, r.error);
  if (!Object.keys(r.patch).length) return {t, patch: r.patch};
  const out = modifyStyle(t, id, r.patch);
  assert.ok(out, 'modifyStyle accepts the patch');
  return {t: out, patch: r.patch};
}

describe('StyleTarget.viewOf', () => {
  it('one paragraph of the style; the query shows its values', () => {
    const doc = docOf(table());
    const v = pure(doc, (d) => viewOf(d, 'Heading1', {}));
    assert.equal(v.p.pStyle, 'Heading1');
    const q = query(v.doc, v.sel);
    assert.equal(q.style, 'Heading1');
    assert.equal(q.bold, true);
    assert.equal(q.keepNext, true);
  });
  it('null for a style the table (and the built-ins) lack', () => {
    assert.equal(viewOf(docOf(table()), 'Nope', {}), null);
  });
  it('a latent built-in is shown as if it were there', () => {
    const t = table();
    t.styles.delete('Heading3');
    const v = viewOf(docOf(t), 'Heading3', {});
    assert.ok(v && !t.styles.has('Heading3'));
    assert.equal(query(v.doc, v.sel).style, 'Heading3');
  });
  it('the pending changes show (tabs set in an earlier Tabs box)', () => {
    const doc = docOf(table());
    const more = change(doc, 'Heading1', {}, 'tabsBox', add(1440));
    const v = viewOf(doc, 'Heading1', more);
    assert.deepEqual(rulerStops(v.doc, v.p).map((s) => s.pos), [1440]);
    assert.equal(doc.styles.styles.get('Heading1').pPr.tabs, undefined);
  });
  it('the same object while nothing changed (the boxes\' stale ' +
    'check)', () => {
    const doc = docOf(table());
    const more = {};
    assert.equal(viewOf(doc, 'Heading1', more).doc,
      viewOf(doc, 'Heading1', more).doc);
  });
});

describe('StyleTarget tabs', () => {
  it('a stop added lands in style.pPr.tabs and shows in a ' +
    'paragraph of that style', () => {
    const doc = docOf(table());
    const more = pure(doc, (d) => change(d, 'Heading1', {}, 'tabsBox',
      add(1440, 'center')));
    assert.deepEqual(more.pPr.tabs, [{val: 'center', pos: 1440}]);
    const {t, patch: pt} = commit(doc.styles, 'Heading1', more);
    assert.deepEqual(pt.pPr.tabs, [{val: 'center', pos: 1440}]);
    assert.deepEqual(resolveTabs(t, para('Heading1')).map((s) =>
      [s.pos, s.val]), [[1440, 'center']]);
    assert.deepEqual(resolveTabs(t, para('Normal')), []);
  });
  it('clear takes the style\'s own stop away (tabs removed)', () => {
    const t0 = table();
    addStyle(t0, st('Tabbed', {basedOn: 'Normal',
      pPr: rp({tabs: [{val: 'left', pos: 720}]})}));
    const doc = docOf(t0);
    const more = change(doc, 'Tabbed', {}, 'tabsBox',
      {tabs: {edits: [{remove: 720}]}});
    const {t, patch: pt} = commit(t0, 'Tabbed', more);
    assert.equal(pt.pPr.tabs, null);
    assert.equal(t.styles.get('Tabbed').pPr.tabs, undefined);
    assert.deepEqual(resolveTabs(t, para('Tabbed')), []);
  });
  it('a stop the base style gives is cleared with a clear stop, as ' +
    'a paragraph clears its style\'s', () => {
    const t0 = table();
    addStyle(t0, st('Base', {pPr: rp({tabs: [{val: 'left',
      pos: 720}, {val: 'right', pos: 2880}]})}));
    addStyle(t0, st('Kid', {basedOn: 'Base'}));
    const doc = docOf(t0);
    const more = change(doc, 'Kid', {}, 'tabsBox',
      {tabs: {edits: [{remove: 720}]}});
    assert.deepEqual(more.pPr.tabs, [{val: 'clear', pos: 720}]);
    const {t} = commit(t0, 'Kid', more);
    assert.deepEqual(resolveTabs(t, para('Kid')).map((s) => s.pos),
      [2880]);
    assert.deepEqual(resolveTabs(t, para('Base')).map((s) => s.pos),
      [720, 2880], 'the base keeps its stops');
  });
  it('clear all: the style\'s own go, the base\'s are cleared', () => {
    const t0 = table();
    addStyle(t0, st('Base', {pPr: rp({tabs: [{val: 'left',
      pos: 720}]})}));
    addStyle(t0, st('Kid', {basedOn: 'Base', pPr: rp({tabs: [
      {val: 'left', pos: 1440}]})}));
    const doc = docOf(t0);
    const more = change(doc, 'Kid', {}, 'tabsBox',
      {tabs: {edits: [{set: []}]}});
    const {t} = commit(t0, 'Kid', more);
    assert.deepEqual(t.styles.get('Kid').pPr.tabs,
      [{val: 'clear', pos: 720}]);
    assert.deepEqual(resolveTabs(t, para('Kid')), []);
  });
  it('a style with no Based on does not inherit the default ' +
    'style\'s stops', () => {
    const t0 = table();
    const n = t0.styles.get('Normal');
    t0.styles.set('Normal', {...n, pPr: rp({...n.pPr,
      tabs: [{val: 'left', pos: 720}]})});
    addStyle(t0, st('Alone'));
    const more = change(docOf(t0), 'Alone', {}, 'tabsBox',
      {tabs: {edits: [{remove: 720}]}});
    assert.equal(more.pPr, undefined, 'no stop of its own to remove');
  });
  it('a stop the same as the base\'s is not written', () => {
    const t0 = table();
    addStyle(t0, st('Base', {pPr: rp({tabs: [{val: 'left',
      pos: 720}]})}));
    addStyle(t0, st('Kid', {basedOn: 'Base'}));
    const more0 = {};
    const more = change(docOf(t0), 'Kid', more0, 'tabsBox', add(720));
    assert.equal(more, more0, 'unchanged: the same more');
  });
  it('a second Tabs OK builds on the first', () => {
    const doc = docOf(table());
    const m1 = change(doc, 'Heading1', {}, 'tabsBox', add(1440));
    const m2 = change(doc, 'Heading1', m1, 'tabsBox', add(2880));
    assert.deepEqual(m2.pPr.tabs.map((s) => s.pos), [1440, 2880]);
    const m3 = change(doc, 'Heading1', m2, 'tabsBox',
      {tabs: {edits: [{remove: 1440}, {remove: 2880}]}});
    assert.equal(m3.pPr.tabs, null);
    assert.deepEqual(commit(doc.styles, 'Heading1', m3).patch, {},
      'back where it was: no patch');
  });
  it('a paragraph with its own stops keeps them', () => {
    const doc = docOf(table());
    const more = change(doc, 'Heading1', {}, 'tabsBox', add(1440));
    const {t} = commit(doc.styles, 'Heading1', more);
    const own = para('Heading1', rp({tabs: [{val: 'clear',
      pos: 1440}, {val: 'right', pos: 4320}]}));
    assert.deepEqual(resolveTabs(t, own).map((s) => s.pos), [4320]);
  });
  it('the default tab stop is a document setting: refused', () => {
    assert.throws(() => change(docOf(table()), 'Heading1', {},
      'tabsBox', {defaultTab: 360}), RangeError);
  });
  it('a style whose own w:tabs is kept raw is refused', () => {
    const t0 = table();
    const raw = {name: 'w:tabs', attrs: [], children: [{name: 'w:tab',
      attrs: [['w:val', 'left'], ['w:pos', '720']], children: []}]};
    addStyle(t0, st('Raw', {pPr: rp({extra: [raw]})}));
    assert.throws(() => change(docOf(t0), 'Raw', {}, 'tabsBox',
      add(1440)), RangeError);
  });
});

describe('StyleTarget borders', () => {
  const side = {val: 'single', sz: 4, space: 1, color: 'auto'};
  it('sides and shading land in pPr.pBdr / shd', () => {
    const doc = docOf(table());
    const more = pure(doc, (d) => change(d, 'Heading1', {}, 'borders',
      {pBdr: {top: side, bottom: side, left: side, right: side,
        between: side}, shd: {val: 'clear', color: 'auto',
        fill: 'D9D9D9'}}));
    const {t} = commit(doc.styles, 'Heading1', more);
    const b = paraBorders(t, para('Heading1'));
    for (const k of ['top', 'bottom', 'left', 'right', 'between']) {
      assert.equal(b.pBdr[k].val, 'single', k);
    }
    assert.equal(b.shd.fill, 'D9D9D9');
    assert.equal(paraBorders(t, para('Normal')).pBdr.top, undefined);
  });
  it('a bar side too', () => {
    const doc = docOf(table());
    const more = change(doc, 'Heading1', {}, 'borders',
      {pBdr: {bar: side}});
    const {t} = commit(doc.styles, 'Heading1', more);
    assert.equal(t.styles.get('Heading1').pPr.pBdr.bar.val, 'single');
  });
  it('a side the base gives is not written; turned off it is nil', () => {
    const t0 = table();
    addStyle(t0, st('Base', {pPr: rp({pBdr: {top: side}})}));
    addStyle(t0, st('Kid', {basedOn: 'Base'}));
    const doc = docOf(t0);
    const same = change(doc, 'Kid', {}, 'borders', {pBdr: {top: side}});
    assert.deepEqual(commit(t0, 'Kid', same).patch, {});
    const off = change(doc, 'Kid', {}, 'borders', {pBdr: {top: null}});
    const {t} = commit(t0, 'Kid', off);
    assert.equal(t.styles.get('Kid').pPr.pBdr.top.val, 'nil');
    assert.equal(paraBorders(t, para('Kid')).pBdr.top.val, 'nil');
  });
  it('a second Borders OK keeps the sides of the first', () => {
    const doc = docOf(table());
    const m1 = change(doc, 'Heading1', {}, 'borders',
      {pBdr: {top: side}});
    const m2 = change(doc, 'Heading1', m1, 'borders',
      {pBdr: {bottom: side}});
    const {t} = commit(doc.styles, 'Heading1', m2);
    const b = t.styles.get('Heading1').pPr.pBdr;
    assert.equal(b.top.val, 'single');
    assert.equal(b.bottom.val, 'single');
  });
  it('the query of the view shows them before OK', () => {
    const doc = docOf(table());
    const more = change(doc, 'Heading1', {}, 'borders',
      {pBdr: {top: side}});
    const v = viewOf(doc, 'Heading1', more);
    assert.equal(query(v.doc, v.sel).borders.top.val, 'single');
  });
  it('a bad side and the text\'s shading are refused', () => {
    const doc = docOf(table());
    assert.throws(() => change(doc, 'Heading1', {}, 'borders',
      {pBdr: {top: {val: 'wobbly'}}}), RangeError);
    assert.throws(() => change(doc, 'Heading1', {}, 'charShade',
      {val: 'clear', fill: 'FF0000'}), RangeError);
  });
});

describe('StyleTarget numbering', () => {
  it('a bullet makes a NEW list (numbering part made) and the ' +
    'style\'s numPr names it', () => {
    const doc = docOf(table());
    const more = pure(doc, (d) => change(d, 'Heading1', {}, 'bullets',
      'disc'));
    const id = more.pPr.numPr.numId;
    assert.ok(Number.isInteger(id) && id > 0);
    assert.equal(more.pPr.numPr.ilvl, 0);
    const ops = numOps(doc, more);
    assert.ok(ops.some((o) => o.key === 'numbering'));
    const v = viewOf(doc, 'Heading1', more);
    assert.deepEqual(listFacts(v.doc, v.p),
      {listKind: 'bullet', listEntry: 'disc'});
    const {t} = commit(doc.styles, 'Heading1', more);
    assert.deepEqual(t.styles.get('Heading1').pPr.numPr,
      {numId: id, ilvl: 0});
    assert.equal(paraNumPr(t, para('Heading1')).numId, id);
  });
  it('never edits another list: a list in use is not taken', () => {
    const doc = docOf(table());
    const m1 = change(doc, 'Heading1', {}, 'numbering', '1.');
    const ops = numOps(doc, m1);
    // the document now has that list, used by a paragraph
    const d2 = {...doc, numbering: ops.find((o) => o.key ===
      'numbering').value, meta: {...doc.meta, numberingPart:
      ops.find((o) => o.key === 'numberingPart').value},
    rels: ops.find((o) => o.key === 'rels').value};
    const p = newPara('x', {pPr: {numPr: {numId: m1.pPr.numPr.numId,
      ilvl: 0}}});
    d2.sections = [{...doc.sections[0], blocks: [p]}];
    const before = structuredClone(d2.numbering.nums);
    const m2 = change(d2, 'Heading2', {}, 'numbering', '1.');
    assert.notEqual(m2.pPr.numPr.numId, m1.pPr.numPr.numId);
    const n2 = numOps(d2, m2).find((o) => o.key === 'numbering').value;
    assert.deepEqual(n2.nums.get(m1.pPr.numPr.numId),
      before.get(m1.pPr.numPr.numId), 'the old list is as it was');
  });
  it('the same entry again takes the style out of the list', () => {
    const doc = docOf(table());
    const m1 = change(doc, 'Heading1', {}, 'bullets', 'disc');
    const m2 = change(doc, 'Heading1', m1, 'bullets', 'disc');
    assert.equal(m2.pPr.numPr, null);
    assert.equal(numOps(doc, m2).length, 0, 'no new list kept');
    assert.deepEqual(commit(doc.styles, 'Heading1', m2).patch, {});
  });
  it('None over a base style\'s list: numId 0', () => {
    const t0 = table();
    addStyle(t0, st('Base', {pPr: rp({numPr: {numId: 5, ilvl: 0}})}));
    addStyle(t0, st('Kid', {basedOn: 'Base'}));
    const more = change(docOf(t0), 'Kid', {}, 'listOff');
    assert.deepEqual(more.pPr.numPr, {numId: 0});
    const {t} = commit(t0, 'Kid', more);
    assert.equal(paraNumPr(t, para('Kid')), null);
  });
  it('None with no list: nothing changes', () => {
    const more0 = {};
    assert.equal(change(docOf(table()), 'Heading1', more0, 'listOff'),
      more0);
  });
  it('a paragraph with its own numPr keeps it', () => {
    const doc = docOf(table());
    const more = change(doc, 'Heading1', {}, 'bullets', 'disc');
    const {t} = commit(doc.styles, 'Heading1', more);
    assert.equal(paraNumPr(t, para('Heading1', rp({numPr: {numId: 9,
      ilvl: 2}}))).numId, 9);
  });
  it('stale when the document\'s numbering changed since', () => {
    const doc = docOf(table());
    const more = change(doc, 'Heading1', {}, 'bullets', 'disc');
    assert.equal(stale(doc, more), false);
    assert.equal(stale({...doc, numbering: {raw: null, nums: new Map()}},
      more), true);
    assert.equal(stale(doc, {}), false);
  });
  it('a reused numbering is guarded too: stale once it changes',
    () => {
      const doc = docOf(table());
      const m1 = change(doc, 'Heading1', {}, 'bullets', 'disc');
      const ops = numOps(doc, m1);
      const get = (k) => ops.find((o) => o.key === k).value;
      // the list exists but no paragraph uses it
      const d2 = {...doc, numbering: get('numbering'), rels: get('rels'),
        meta: {...doc.meta, numberingPart: get('numberingPart')}};
      const m2 = change(d2, 'Heading2', {}, 'bullets', 'disc');
      assert.equal(m2.pPr.numPr.numId, m1.pPr.numPr.numId, 'reused');
      assert.equal(numOps(d2, m2).length, 0);
      assert.equal(stale(d2, m2), false);
      // undone in the document, or another paragraph took it
      assert.equal(stale(doc, m2), true);
      assert.equal(stale({...d2, numbering: {...d2.numbering,
        nums: new Map(d2.numbering.nums)}}, m2), true);
    });
  it('a bad entry is refused', () => {
    assert.throws(() => change(docOf(table()), 'Heading1', {},
      'bullets', '1.'), RangeError);
  });
});

describe('StyleTarget and StyleDoc: one undo step', () => {
  it('tabs, borders and a new list written by one run, undone by ' +
    'one undo', () => {
    const doc = docOf(table());
    doc.sections[0].blocks = [newPara('head', {pStyle: 'Heading1'})];
    const d = new Document(doc), typing = new Typing(d);
    let more = change(d.doc, 'Heading1', {}, 'tabsBox', add(1440));
    more = change(d.doc, 'Heading1', more, 'borders',
      {pBdr: {top: {val: 'single', sz: 4}}});
    more = change(d.doc, 'Heading1', more, 'bullets', 'disc');
    const before = structuredClone({styles: d.doc.styles,
      numbering: d.doc.numbering, meta: d.doc.meta, rels: d.doc.rels});
    const r = patch(d.doc.styles, 'Heading1', {}, more);
    const out = run(d, typing, (t) => ({table: modifyStyle(t,
      'Heading1', r.patch), ops: numOps(d.doc, more)}));
    assert.ok(out);
    assert.equal(d.undoDepth, 1);
    const p = d.doc.sections[0].blocks[0];
    assert.deepEqual(resolveTabs(d.doc.styles, p).map((s) => s.pos),
      [1440]);
    assert.ok(d.doc.numbering.nums.has(more.pPr.numPr.numId));
    assert.equal(d.doc.styles.styles.get('Heading1').pPr.pBdr.top.val,
      'single');
    d.undo();
    assert.deepEqual(structuredClone({styles: d.doc.styles,
      numbering: d.doc.numbering, meta: d.doc.meta, rels: d.doc.rels}),
    before);
  });
});

describe('StyleTarget.preview', () => {
  it('the table itself when there is nothing pending', () => {
    const t = table();
    assert.equal(preview(t, 'Heading1', {}), t);
  });
});
