// PaneWheel: a pane's wheel goes to its parent window.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {forwardWheel} from '../../tools/moreapps/!WimpLib/Ui/PaneWheel';

function fake(extra = {}) {
  const h = {};
  return {h, scrollX: 0, scrollY: 0, opens: [], handled: false,
    on(t, fn) { h[t] = fn; },
    emit(t, ev) { if (h[t]?.(ev) === true) ev.handled = true; return ev; },
    requestOpen(o) { this.opens.push(o); }, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
    ...extra};
}

describe('PaneWheel.forwardWheel', () => {
  it('scrolls the parent, claims the event, Shift turns it sideways', () => {
    const pane = fake(), parent = fake({scrollX: 10, scrollY: 20});
    forwardWheel(pane, parent);
    assert.equal(pane.h.wheel({dx: 0, dy: 30, shift: false}), true);
    assert.deepEqual(parent.opens[0], {scrollX: 10, scrollY: 50, behind: 'keep'});
    pane.h.wheel({dx: 0, dy: 30, shift: true});
    assert.deepEqual(parent.opens[1], {scrollX: 40, scrollY: 20, behind: 'keep'});
    pane.h.wheel({dx: 7, dy: 0, shift: false});
    assert.deepEqual(parent.opens[2], {scrollX: 17, scrollY: 20, behind: 'keep'});
  });
  it("gives the parent's wheel listeners the event first; a taker means no scroll", () => {
    const pane = fake(), parent = fake();
    let seen = null;
    parent.on('wheel', (ev) => { seen = ev; return true; });
    forwardWheel(pane, parent);
    assert.equal(pane.h.wheel({dx: 0, dy: -100, shift: false}), true);
    assert.equal(seen.dy, -100);
    assert.equal(parent.opens.length, 0);
  });
  it('puts a pane that has scrolled back to 0', () => {
    const pane = fake({scrollX: 500}), parent = fake();
    forwardWheel(pane, parent);
    pane.h.moved({});
    assert.equal(pane.scrollX, 0);
  });
});
