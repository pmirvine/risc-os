// EditScroll: keeping the caret in view in a document's window whose
// top inset px are hidden by a toolbar pane; Page Up / Page Down's
// step; the scrolling while a drag is outside the visible part.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {visible, scrollToCaret, pageStep, dragStep}
  from '../../tools/moreapps/!Word/EditScroll';

/** A view: a window w x h at (100, 50) scrolled to sx, sy. */
function view({w = 400, h = 300, sx = 0, sy = 0, inset = 0, caret}) {
  const win = {isOpen: true, x: 100, y: 50, w, h, scrollX: sx,
    scrollY: sy, scrolls: [],
    scrollTo(x, y) { this.scrolls.push([x, y]); this.scrollX = x;
      this.scrollY = y; }};
  return {win, inset, caretRect: () => caret};
}

describe('EditScroll', () => {
  it('visible: below the inset', () => {
    const v = view({sy: 100, inset: 40});
    assert.deepEqual(visible(v), {x0: 0, y0: 140, x1: 400, y1: 400});
    assert.deepEqual(visible(view({sy: 10})),
      {x0: 0, y0: 10, x1: 400, y1: 310});
  });

  it('a caret under the toolbar scrolls up to 24 px below it', () => {
    const v = view({sy: 100, inset: 40,
      caret: {x: 50, y: 150, h: 20}});
    scrollToCaret(v);
    assert.deepEqual(v.win.scrolls, [[0, 150 - 24 - 40]]);
    const c = v.caretRect();
    assert.ok(c.y >= v.win.scrollY + v.inset);
  });

  it('no inset: as before (24 px inside the edges)', () => {
    const v = view({sy: 100, caret: {x: 50, y: 110, h: 20}});
    scrollToCaret(v);
    assert.deepEqual(v.win.scrolls, [[0, 86]]);
    const b = view({sy: 0, caret: {x: 50, y: 400, h: 20}});
    scrollToCaret(b);
    assert.deepEqual(b.win.scrolls, [[0, 400 + 20 + 24 - 300]]);
  });

  it('a caret already in view does not scroll; nor a closed window',
    () => {
      const v = view({sy: 0, inset: 40, caret: {x: 50, y: 80, h: 20}});
      scrollToCaret(v);
      assert.deepEqual(v.win.scrolls, []);
      const c = view({sy: 300, inset: 40, caret: {x: 0, y: 0, h: 9}});
      c.win.isOpen = false;
      scrollToCaret(c);
      assert.deepEqual(c.win.scrolls, []);
      scrollToCaret(view({caret: null}));
    });

  it('never scrolls above 0; across too', () => {
    const v = view({sy: 50, sx: 30, inset: 40,
      caret: {x: 10, y: 30, h: 20}});
    scrollToCaret(v);
    assert.deepEqual(v.win.scrolls, [[0, 0]]);
    const r = view({caret: {x: 600, y: 100, h: 20}});
    scrollToCaret(r);
    assert.deepEqual(r.win.scrolls, [[600 + 24 - 400, 0]]);
  });

  it('a window not tall enough for the inset and margins', () => {
    const v = view({h: 60, sy: 0, inset: 40,
      caret: {x: 0, y: 500, h: 20}});
    scrollToCaret(v);
    const c = v.caretRect();
    // the caret's top is not under the toolbar
    assert.ok(c.y >= v.win.scrollY + v.inset, v.win.scrollY);
  });

  it('pageStep: the visible height less 32, at least 20', () => {
    assert.equal(pageStep(view({h: 300})), 268);
    assert.equal(pageStep(view({h: 300, inset: 40})), 228);
    assert.equal(pageStep(view({h: 50, inset: 40})), 20);
  });

  it('dragStep: towards the pointer when outside the visible part',
    () => {
      const v = view({inset: 40});
      // screen: window top 50, visible from 90
      assert.deepEqual(dragStep(v, 200, 70), {dx: 0, dy: -20});
      assert.deepEqual(dragStep(v, 200, 95), {dx: 0, dy: 0});
      assert.deepEqual(dragStep(v, 200, 351), {dx: 0, dy: 20});
      assert.deepEqual(dragStep(v, 90, 200), {dx: -16, dy: 0});
      assert.deepEqual(dragStep(v, 501, 200), {dx: 16, dy: 0});
      assert.deepEqual(dragStep(view({}), 200, 70), {dx: 0, dy: 0});
    });
});
