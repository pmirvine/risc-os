// Test-only: a shifted placement for the Place tests (Batch D P3.1,
// P3.2, D4): the Draft galley moved by (dx, dy). Every consumer that
// asks L.place for a screen position (the caret, hits, selection,
// painting, the pointer's finders) answers moved by exactly that.
import {PlaceDraft} from '../../tools/moreapps/!Letters/Place';

/** A test Place: the galley of L moved by (dx, dy). */
export function shifted(L, dx, dy) {
  const D = PlaceDraft(L);
  return {
    lineAt: (it, k) => {
      const p = D.lineAt(it, k);
      return {x: p.x + dx, y: p.y + dy, page: null};
    },
    itemTop: (it) => D.itemTop(it) + dy,
    rects: (it, l0, l1) => D.rects(it, l0, l1).map((r) =>
      ({...r, x: r.x + dx, y: r.y + dy})),
    hit: (x, y) => D.hit(x - dx, y - dy),
    visible: (y0, y1) => D.visible(y0 - dy, y1 - dy).map((v) =>
      ({...v, dx, dy})),
    extent: () => D.extent(),
    pageOf: () => null,
  };
}
