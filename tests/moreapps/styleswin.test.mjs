// StylesState: the list model of the Styles window (Batch E1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins}
  from '../../tools/moreapps/!Letters/StylesBuiltin';
import {emptyDoc} from '../../tools/moreapps/!Letters/Model';
import {FILTERS, newState, listFor, reconcile, setFilter, selectId,
  step, scrollBy, rowAt, buttons, deleteQuestion}
  from '../../tools/moreapps/!Letters/StylesState';

const rp = (o) => ({extra: [], ...o});
const sty = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, ...o});

function build(extra = []) {
  const doc = emptyDoc();
  const t = ensureBuiltins(newStyleTable());
  for (const s of extra) addStyle(t, s);
  doc.styles = t;
  return doc;
}
const ids = (es) => es.map((e) => e.id);
const E = (n) => Array.from({length: n}, (_, i) => ({id: 's' + i,
  name: 'S' + i}));

describe('StylesState', () => {
  it('filters: Gallery is the default, All styles lists more', () => {
    assert.deepEqual(FILTERS.map((f) => f.text),
      ['Gallery', 'All styles']);
    const doc = build([sty('Plain')]);
    const s = newState();
    assert.equal(s.filter, 'gallery');
    assert.ok(!ids(listFor(doc, s.filter)).includes('Plain'));
    assert.ok(ids(listFor(doc, 'all')).includes('Plain'));
  });

  it('selection survives a refresh while the style is there', () => {
    const s = newState();
    const es = E(5);
    assert.ok(selectId(s, es, 's3', 3));
    assert.equal(s.sel, 's3');
    assert.equal(s.top, 1);              // scrolled into view
    reconcile(s, es.slice(1), 3);
    assert.equal(s.sel, 's3');
    reconcile(s, es.filter((e) => e.id !== 's3'), 3);
    assert.equal(s.sel, null);
    assert.ok(!selectId(s, es, 'nope', 3));
  });

  it('top is clamped when the list shrinks', () => {
    const s = newState();
    s.top = 8;
    reconcile(s, E(4), 3);
    assert.equal(s.top, 1);
    reconcile(s, E(2), 3);
    assert.equal(s.top, 0);
  });

  it('changing the filter keeps a selection that is still listed', () => {
    const s = newState();
    const g = E(3), a = E(6);
    selectId(s, g, 's1', 3);
    setFilter(s, 'all', a, 3);
    assert.equal(s.filter, 'all');
    assert.equal(s.sel, 's1');
    selectId(s, a, 's5', 3);
    setFilter(s, 'gallery', g, 3);
    assert.equal(s.sel, null);
    assert.equal(s.top, 0);
    setFilter(s, 'bogus', g, 3);
    assert.equal(s.filter, 'gallery');
  });

  it('step moves the selection and stays in range', () => {
    const s = newState();
    const es = E(5);
    step(s, es, 1, 3);
    assert.equal(s.sel, 's0');
    step(s, es, 1, 3); step(s, es, 1, 3); step(s, es, 1, 3);
    assert.equal(s.sel, 's3');
    assert.equal(s.top, 1);
    step(s, es, 99, 3);
    assert.equal(s.sel, 's4');
    step(s, es, -99, 3);
    assert.equal(s.sel, 's0');
    assert.equal(s.top, 0);
    const n = newState();
    step(n, es, -1, 3);
    assert.equal(n.sel, 's4');
    step(n, [], 1, 3);
    assert.equal(n.sel, null);
  });

  it('scrollBy and rowAt', () => {
    const s = newState();
    const es = E(10);
    scrollBy(s, es, 3, 4);
    assert.equal(s.top, 3);
    scrollBy(s, es, 99, 4);
    assert.equal(s.top, 6);
    scrollBy(s, es, -99, 4);
    assert.equal(s.top, 0);
    s.top = 2;
    assert.equal(rowAt(s, es, 0, 30, 4).id, 's2');
    assert.equal(rowAt(s, es, 65, 30, 4).id, 's4');
    assert.equal(rowAt(s, es, -1, 30, 4), null);
    assert.equal(rowAt(s, es, 120, 30, 4), null);   // below 4 rows
    assert.equal(rowAt(s, E(3), 65, 30, 4), null);  // past the end
  });

  it('buttons: nothing selected shades everything', () => {
    const doc = build();
    const b = buttons(doc, null, {canApply: true, newStyle: true,
      modify: true, rename: true});
    assert.deepEqual(b, {apply: false, newStyle: true, modify: false,
      rename: false, del: false});
  });

  it('buttons: Delete is shaded for built-in and latent styles', () => {
    const doc = build([sty('Mine')]);
    const es = listFor(doc, 'all');
    const by = (id) => es.find((e) => e.id === id);
    const o = {canApply: true};
    assert.equal(buttons(doc, by('Mine'), o).del, true);
    assert.equal(buttons(doc, by('Normal'), o).del, false);
    assert.equal(buttons(doc, {id: 'Heading7', latent: true}, o).del,
      false);
  });

  it('buttons: Delete and Rename are shaded for built-ins by name',
    () => {
      const doc = build([sty('Standard', {name: 'Normal'}),
        sty('Mine')]);
      const o = {canApply: true, rename: true};
      const e = (id) => ({id});
      assert.equal(buttons(doc, e('Standard'), o).del, false);
      assert.equal(buttons(doc, e('Standard'), o).rename, false);
      assert.equal(buttons(doc, e('Mine'), o).rename, true);
    });

  it('buttons: Apply needs the document selection; New / Modify / ' +
    'Rename need their callbacks', () => {
    const doc = build([sty('Mine')]);
    const e = listFor(doc, 'all').find((x) => x.id === 'Mine');
    assert.deepEqual(buttons(doc, e, {}), {apply: false,
      newStyle: false, modify: false, rename: false, del: true});
    const b = buttons(doc, e, {canApply: true, modify: true});
    assert.equal(b.apply, true);
    assert.equal(b.modify, true);
    assert.equal(b.rename, false);
  });

  it('deleteQuestion asks only for a style in use', () => {
    const e = {id: 'Mine', name: 'My style'};
    assert.equal(deleteQuestion(e, {paragraphs: 0, runs: 0}), null);
    const q = deleteQuestion(e, {paragraphs: 2, runs: 1});
    assert.match(q, /My style/);
    assert.match(q, /2 paragraphs/);
    assert.match(q, /1 text range\b/);
    assert.match(deleteQuestion(e, {paragraphs: 1, runs: 0}),
      /1 paragraph\b/);
    assert.ok(!/text range/.test(
      deleteQuestion(e, {paragraphs: 1, runs: 0})));
  });
});
