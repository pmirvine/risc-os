// Zoom: the view transform of a document's window (!Word Zoom): the
// layout stays at 100%, the part below the toolbar and ruler (top px,
// not scaled) is drawn z times as large. Clamping, the menu's steps,
// the wheel's step, layout <-> screen (work area) round trips with
// the inset, rects, carets, the extent and the centre kept by
// zoomScroll.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as Z from '../../tools/moreapps/!Word/Zoom';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e,
  `${a} != ${b}`);

describe('Zoom: percentages', () => {
  it('the steps of the menu', () => {
    assert.deepEqual(Z.ZOOMS, [50, 75, 100, 125, 150, 200]);
    assert.equal(Z.MIN, 10);
    assert.equal(Z.MAX, 500);
  });

  it('clampZoom: whole percent, 10..500, junk is 100', () => {
    assert.equal(Z.clampZoom(150), 150);
    assert.equal(Z.clampZoom(1), 10);
    assert.equal(Z.clampZoom(-50), 10);
    assert.equal(Z.clampZoom(9000), 500);
    assert.equal(Z.clampZoom(1e300), 500);
    assert.equal(Z.clampZoom(Infinity), 100);
    assert.equal(Z.clampZoom(NaN), 100);
    assert.equal(Z.clampZoom('150'), 100);
    assert.equal(Z.clampZoom(undefined), 100);
    assert.equal(Z.clampZoom(124.6), 125);
  });

  it('step: the next step up or down; none further: unchanged', () => {
    assert.equal(Z.step(100, 1), 125);
    assert.equal(Z.step(100, -1), 75);
    assert.equal(Z.step(200, 1), 200);
    assert.equal(Z.step(50, -1), 50);
    assert.equal(Z.step(110, 1), 125);
    assert.equal(Z.step(110, -1), 100);
    assert.equal(Z.step(300, -1), 200);
    assert.equal(Z.step(300, 1), 300);
    assert.equal(Z.step(10, 1), 50);
    assert.equal(Z.step(30, -1), 30);
    assert.equal(Z.step(100, 0), 100);
    assert.equal(Z.step(NaN, 1), 125);
  });

  it('wheelStep: up (dy < 0) zooms in, down out, none unchanged', () => {
    assert.equal(Z.wheelStep(100, -120), 125);
    assert.equal(Z.wheelStep(100, -1), 125);
    assert.equal(Z.wheelStep(100, 53), 75);
    assert.equal(Z.wheelStep(100, 0), 100);
    assert.equal(Z.wheelStep(100, NaN), 100);
    assert.equal(Z.wheelStep(200, -3), 200);
  });
});

describe('Zoom: layout <-> screen', () => {
  it('toScreen: x scaled; y below top scaled, top kept', () => {
    assert.deepEqual(Z.toScreen(100, 58, 2, 58), {x: 200, y: 58});
    assert.deepEqual(Z.toScreen(100, 158, 2, 58), {x: 200, y: 258});
    assert.deepEqual(Z.toScreen(100, 158, 0.5, 58), {x: 50, y: 108});
    assert.deepEqual(Z.toScreen(7, 9, 1, 58), {x: 7, y: 9});
  });

  it('toLayout inverts toScreen (zooms, inset, points)', () => {
    for (const z of [0.1, 0.5, 0.75, 1, 1.25, 1.5, 2, 5]) {
      for (const top of [0, 34, 58]) {
        for (const [x, y] of [[0, 0], [10, 20], [333.5, 1e5],
          [-5, 3], [800, top]]) {
          const s = Z.toScreen(x, y, z, top);
          const l = Z.toLayout(s.x, s.y, z, top);
          near(l.x, x, 1e-6);
          near(l.y, y, 1e-6);
          const b = Z.toLayout(x, y, z, top);
          const s2 = Z.toScreen(b.x, b.y, z, top);
          near(s2.x, x, 1e-6);
          near(s2.y, y, 1e-6);
        }
      }
    }
  });

  it('layoutRect: a screen rect in layout px', () => {
    assert.deepEqual(Z.layoutRect({x0: 0, y0: 58, x1: 400, y1: 458},
      2, 58), {x0: 0, y0: 58, x1: 200, y1: 258});
    assert.deepEqual(Z.layoutRect({x0: 10, y0: 0, x1: 20, y1: 8},
      1, 58), {x0: 10, y0: 0, x1: 20, y1: 8});
  });

  it('caretOf: place and height scaled; null stays null', () => {
    assert.deepEqual(Z.caretOf({x: 100, y: 158, h: 20}, 1.5, 58),
      {x: 150, y: 208, h: 30});
    assert.equal(Z.caretOf(null, 2, 58), null);
  });

  it('extentOf: layout extent scaled below top, whole px', () => {
    assert.deepEqual(Z.extentOf({w: 842, h: 1058}, 2, 58),
      {w: 1684, h: 2058});
    assert.deepEqual(Z.extentOf({w: 841, h: 1057}, 0.5, 58),
      {w: 421, h: 558});
    assert.deepEqual(Z.extentOf({w: 842, h: 1058}, 1, 58),
      {w: 842, h: 1058});
  });
});

describe('Zoom: zoomScroll keeps the centre', () => {
  it('without an inset', () => {
    // centre at screen 300 + 200 = 500 -> layout 500 -> 1000 at 2
    assert.equal(Z.zoomScroll(300, 400, 1, 2), 800);
    assert.equal(Z.zoomScroll(800, 400, 2, 1), 300);
  });

  it('with an inset: the centre of what is below it', () => {
    const top = 58, view = 500, s = 1000;
    for (const [a, b] of [[1, 2], [2, 0.5], [1.5, 1], [0.1, 5]]) {
      const c = s + (top + view) / 2;          // screen centre
      const l = Z.toLayout(0, c, a, top).y;   // in layout px
      const n = Z.zoomScroll(s, view, a, b, top);
      const c2 = Z.toScreen(0, l, b, top).y;
      near(n, Math.max(0, Math.round(c2 - (top + view) / 2)));
      if (n > 0) near(n + (top + view) / 2, c2, 0.5);
    }
  });

  it('never below 0; junk scroll is 0', () => {
    assert.equal(Z.zoomScroll(0, 400, 2, 0.5), 0);
    assert.equal(Z.zoomScroll(NaN, 400, 1, 2), 0);
    assert.equal(Z.zoomScroll(100, 400, 1, 1), 100);
  });
});

describe('Zoom: zoomScrollX keeps the page-relative centre', () => {
  it('a window wider than the page: the page moves as the layout does', () => {
    // 1400 px window: at 100% the page starts at 292 (layout 1400),
    // at 200% the layout is 700 wide and the page starts at 48
    const w = 1400, pl1 = 292, pl2 = 48;
    const s = Z.zoomScrollX(0, w, 1, 2, pl1, pl2);
    // the centre (700 at 100%) is 408 px into the page: 816 at 200%
    const lx = (0 + w / 2) / 1 - pl1;
    assert.equal(s, Math.round((lx + pl2) * 2 - w / 2));
    assert.equal(s, 212);
    // and back: the same page place at the centre again, scroll 0
    assert.equal(Z.zoomScrollX(s, w, 2, 1, pl2, pl1), 0);
  });

  it('the page place at the centre is the same before and after', () => {
    for (const [s, w, a, b, p1, p2] of [[0, 1400, 1, 0.5, 292, 992],
      [300, 900, 1, 1.5, 24, 24], [1000, 600, 2, 1.25, 24, 24]]) {
      const n = Z.zoomScrollX(s, w, a, b, p1, p2);
      const before = (s + w / 2) / a - p1;
      const after = (n + w / 2) / b - p2;
      if (n > 0) near(after, before, 0.5 / b + 1e-9);
      else assert.ok(after <= before + 1e-9);
    }
  });

  it('never below 0; junk is 0', () => {
    assert.equal(Z.zoomScrollX(0, 1400, 1, 0.5, 292, 992), 0);
    assert.equal(Z.zoomScrollX(NaN, 1400, 1, 2, 292, 48), 0);
  });
});

describe('Zoom: wheelAcc (Ctrl+wheel steps)', () => {
  const run = (events) => {
    let st = Z.WHEEL0;
    const steps = [];
    for (const [dy, t] of events) {
      const r = Z.wheelAcc(st, dy, t);
      st = r.state;
      if (r.dir) steps.push([r.dir, t]);
    }
    return steps;
  };

  it('a notch (100) steps once: up in, down out', () => {
    assert.deepEqual(run([[-100, 1000]]), [[1, 1000]]);
    assert.deepEqual(run([[120, 1000]]), [[-1, 1000]]);
  });

  it('a burst of 20 small events within 100 ms: one step at most', () => {
    const ev = Array.from({length: 20}, (_, i) => [-10, 1000 + i * 5]);
    assert.equal(run(ev).length, 1);
  });

  it('a long trackpad scroll steps slowly (not 50% -> 200% at once)', () => {
    // 60 events a second of 5 px for half a second: 150 px
    const ev = Array.from({length: 30}, (_, i) => [-5, 1000 + i * 16]);
    assert.ok(run(ev).length <= 1);
  });

  it('two notches 150 ms apart: two steps; small moves add up', () => {
    assert.equal(run([[-100, 1000], [-100, 1150]]).length, 2);
    assert.deepEqual(run([[-40, 1000], [-40, 1020], [-40, 1040]]),
      [[1, 1040]]);
  });

  it('a pause or a change of direction starts again', () => {
    assert.deepEqual(run([[-60, 1000], [-60, 2000]]), []);
    assert.deepEqual(run([[-60, 1000], [60, 1020]]), []);
    assert.deepEqual(run([[0, 1000], [NaN, 1010]]), []);
  });
});
