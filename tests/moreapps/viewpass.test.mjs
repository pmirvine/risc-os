// ViewPass (Batch D P12.3; P12a fix M6): the passes after an edit and
// in the slices share one time budget (dw.colEnd); a step that finds
// it spent sets the flag of its OWN kind (colStep dw.colDue, wrapStep
// dw.wrapDue), so the slices go on for that kind only.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {colStep, wrapStep} = await import(
  '../../tools/moreapps/!Letters/ViewPass');

/** A window whose shared budget ran out (a pass inside another). */
const spent = () => ({colEnd: 1, colDue: false, wrapDue: false,
  L: {}, pages: {}, newLayout() { throw new Error('no layout'); }});

describe('ViewPass: the budget spent (M6)', () => {
  it('wrapStep sets wrapDue, not colDue', () => {
    const dw = spent();
    assert.equal(wrapStep(dw, 40), false);
    assert.deepEqual([dw.wrapDue, dw.colDue], [true, false]);
  });

  it('colStep sets colDue, not wrapDue', () => {
    const dw = spent();
    assert.equal(colStep(dw, 40), false);
    assert.deepEqual([dw.colDue, dw.wrapDue], [true, false]);
  });
});
