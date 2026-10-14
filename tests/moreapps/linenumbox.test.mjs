// The Line numbers box's OK (Batch D P11 fix I1, the Dialog
// contract): changes(values, shown) turns what the box holds into
// lineNumCmd's values, or names the field it refuses. A field whose
// text is not a value (DialogValues readField null: "1.2.3", "-",
// "5-", "1..5", ".", "3 in in") is refused like an emptied one: the
// box beeps and says why, and nothing is applied, not even the other
// changes made in the box. From text counts only when Auto is off.
// ('riscos' replaced by a stand-in: the box is never opened.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readField} from '../../tools/moreapps/!WimpLib/DialogValues';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {}, textWidth = () => 0;');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {changes} = await import('../../tools/moreapps/!Letters/LineNumBox');

const MAX = Number.MAX_SAFE_INTEGER;
const NUM = {kind: 'number', min: -MAX, max: MAX, decimals: 0};
const LEN = {kind: 'length', min: -MAX, max: MAX};
const SHOWN = {on: true, start: 1, countby: 1, dist: undefined,
  auto: true, restart: 'newPage'};
const st = (sh = {}) => ({shown: {...SHOWN, ...sh}});
const vals = (v = {}) => ({...SHOWN, ...v});

describe('the Line numbers box refuses malformed text (P11 fix I1)', () => {
  it('the texts read null in the box\'s fields', () => {
    for (const t of ['1.2.3', '-', '5-']) {
      assert.equal(readField(NUM, t), null, t);
    }
    for (const t of ['1..5', '.', '3 in in']) {
      assert.equal(readField(LEN, t), null, t);
    }
  });
  for (const [k, f, t] of [['countby', 'countBy', '1.2.3'],
    ['countby', 'countBy', '-'], ['start', 'start', '5-'],
    ['start', 'start', '.']]) {
    it(`${k} "${t}" is refused (NaN, the field named)`, () => {
      const out = changes(vals({[k]: readField(NUM, t)}), st());
      assert.equal(out.bad, k);
      assert.ok(Number.isNaN(out[f]));
    });
  }
  for (const t of ['1..5', '.', '3 in in']) {
    it(`From text "${t}" with Auto off is refused`, () => {
      const out = changes(vals({auto: false, dist: readField(LEN, t)}),
        st({auto: false, dist: 360}));
      assert.equal(out.bad, 'dist');
      assert.ok(Number.isNaN(out.distance));
    });
  }
  it('a refused field refuses the other changes too', () => {
    const out = changes(vals({countby: null, restart: 'continuous'}),
      st());
    assert.equal(out.bad, 'countby');
    assert.ok(Number.isNaN(out.countBy));
  });
  it('a malformed field is refused even when it showed no value', () => {
    const out = changes(vals({start: null}), st({start: undefined}));
    assert.equal(out.bad, 'start');
  });
  it('From text is not read with Auto on', () => {
    const out = changes(vals({dist: null}), st());
    assert.equal(out.bad, undefined);
    assert.equal(out.distance, null);
  });
  it('Add line numbering off sends only that', () => {
    assert.deepEqual(changes(vals({on: false, countby: null}), st()),
      {on: false});
  });
  it('an emptied field is still refused', () => {
    const out = changes(vals({countby: undefined}), st());
    assert.equal(out.bad, 'countby');
  });
  it('good values: only what changed', () => {
    assert.deepEqual(changes(vals({countby: 2}), st()),
      {on: null, start: null, countBy: 2, restart: null,
        distance: null});
  });
});
