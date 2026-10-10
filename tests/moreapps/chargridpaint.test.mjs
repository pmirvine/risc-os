// WimpLib Ui/CharGridPaint: the geometry the grid window and the
// tests agree on, the key targets, and the painting on a fake canvas.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COLS, ROWS, RECENT, CW, CH, PAD, RY, GY, SY, BY, W, H, icons, paint, target}
  from '../../tools/moreapps/!WimpLib/Ui/CharGridPaint';

const LEFT = 0x18C, RIGHT = 0x18D, DOWN = 0x18E, UP = 0x18F, END = 0x18B, HOME = 30, PGDN = 0x19E, PGUP = 0x19F;

describe('CharGridPaint geometry', () => {
  it('16 columns, 8 rows; rows stack without overlap; the window fits a 1024 x 768 desktop', () => {
    assert.deepEqual([COLS, ROWS, RECENT, CW, CH], [16, 8, 16, 32, 30]);
    assert.ok(RY + CH < GY && GY + ROWS * CH < SY && SY < BY && BY + 36 < H);
    assert.ok(W <= 1024 - 40 && H <= 768 - 40, `${W}x${H}`);
    assert.ok(PAD + COLS * CW + PAD < W);
  });
  it('the icons: named, inside the window, Insert is the default button, Close the other', () => {
    const list = icons();
    const names = list.map((i) => i.name);
    assert.deepEqual(names, ['label', 'set', 'arrow', 'recentlabel', 'status', 'button:Close', 'button:Insert']);
    assert.equal(new Set(names).size, names.length);
    for (const i of list) assert.ok(i.x >= 0 && i.y >= 0 && i.x + i.w <= W && i.y + i.h <= H, i.name);
    assert.equal(list.find((i) => i.name === 'button:Insert').validation, 'R6,3');
    assert.equal(list.find((i) => i.name === 'button:Close').validation, 'R5,3');
    // none covers the recent row or the grid
    for (const i of list) assert.ok(i.y + i.h <= RY || i.y >= GY + ROWS * CH, i.name);
  });
});

describe('CharGridPaint target (keys)', () => {
  it('arrows move one character or one row of 16, clamped', () => {
    assert.equal(target(RIGHT, 5, 100), 6);
    assert.equal(target(LEFT, 5, 100), 4);
    assert.equal(target(DOWN, 5, 100), 21);
    assert.equal(target(UP, 20, 100), 4);
    assert.equal(target(LEFT, 0, 100), 0);
    assert.equal(target(UP, 3, 100), 0);
    assert.equal(target(RIGHT, 99, 100), 99);
    assert.equal(target(DOWN, 95, 100), 99);
  });
  it('shift and ctrl forms of the arrows do the same', () => {
    assert.equal(target(RIGHT + 0x10, 5, 100), 6);
    assert.equal(target(LEFT + 0x20, 5, 100), 4);
    assert.equal(target(UP + 0x30, 40, 100, 'ArrowUp'), 24);
    assert.equal(target(DOWN + 0x10, 40, 100, 'ArrowDown'), 56);
  });
  it('with nothing chosen (-1) an arrow chooses the first; Home the first, End the last', () => {
    for (const k of [LEFT, RIGHT, DOWN, UP]) assert.equal(target(k, -1, 50), 0);
    assert.equal(target(HOME, 30, 50), 0);
    assert.equal(target(END, 3, 50), 49);
    assert.equal(target(END, -1, 50), 49);
  });
  it('Page Down / Up are scrolls; other keys are none; an empty set does not break', () => {
    assert.deepEqual(target(PGDN, 3, 50), {page: 1});
    assert.deepEqual(target(PGUP, 3, 50), {page: -1});
    assert.deepEqual(target(PGDN + 0x20, 3, 50), {page: 1});
    assert.deepEqual(target(PGDN, 3, 50, 'PageDown'), {page: 1});
    assert.deepEqual(target(PGUP, 3, 50, 'PageUp'), {page: -1});
    assert.equal(target(PGDN, 3, 50, 'ArrowDown'), 19);
    assert.equal(target(PGUP, 20, 50, 'ArrowUp'), 4);
    assert.equal(target(0, 3, 50, 'Home'), 0);
    assert.equal(target(0, 3, 50, 'End'), 49);
    for (const k of ['__proto__', 'constructor', 'toString', 'a', 'Enter']) assert.equal(target(13, 3, 50, k), null, k);
    for (const k of [0, 13, 27, 65, 0x181, 0x1CD, -1]) assert.equal(target(k, 3, 50), null, String(k));
    assert.equal(target(RIGHT, -1, 0), 0);
  });
});

/** A canvas that records what it is asked to draw. */
function fake() {
  const log = [];
  const g = {fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect: (...a) => log.push(['rect', g.fillStyle, ...a]), strokeRect: () => {},
    fillText: (t, x, y) => log.push(['text', t, x, y, g.fillStyle, g.font])};
  return {g, log};
}

describe('CharGridPaint paint', () => {
  const set = {id: 's', name: 'S', chars: 'abcdefghijklmnopqrstuvwxyz'};
  it('draws each shown character once at its cell, in the family; the chosen one white on blue', () => {
    const {g, log} = fake();
    paint(g, {set, top: 0, sel: 'c'}, [], '"Carlito"', 2);
    const t = log.filter((x) => x[0] === 'text');
    assert.equal(t.length, 26);
    assert.deepEqual(t.map((x) => x[1]).join(''), set.chars);
    assert.ok(t.every((x) => x[5].endsWith('"Carlito"')));
    assert.deepEqual([t[0][2], t[0][3]], [PAD + CW / 2, GY + CH / 2 + 1]);
    assert.deepEqual([t[16][2], t[16][3]], [PAD + CW / 2, GY + CH + CH / 2 + 1]);
    assert.equal(t[2][4], '#ffffff');
    assert.equal(t[1][4], '#000000');
  });
  it('the recent row is drawn above the grid; scrolled rows are skipped', () => {
    const {g, log} = fake();
    paint(g, {set, top: 1, sel: null}, ['z', 'y'], 'x', 2);
    const t = log.filter((x) => x[0] === 'text');
    assert.deepEqual(t.slice(0, 2).map((x) => [x[1], x[2], x[3]]), [['z', PAD + CW / 2, RY + CH / 2 + 1], ['y', PAD + CW + CW / 2, RY + CH / 2 + 1]]);
    assert.equal(t.length, 2 + 10);
    assert.equal(t[2][1], 'q');
  });
  it('a scroll bar only when there are more rows than shown', () => {
    const a = fake();
    paint(a.g, {set, top: 0, sel: null}, [], 'x', 8);
    assert.equal(a.log.filter((x) => x[0] === 'rect' && x[1] === '#bbbbbb').length, 0);
    const b = fake();
    paint(b.g, {set, top: 0, sel: null}, [], 'x', 20);
    assert.equal(b.log.filter((x) => x[0] === 'rect' && x[1] === '#bbbbbb').length, 1);
    const thumb = (top) => { const c = fake(); paint(c.g, {set, top, sel: null}, [], 'x', 20); return c.log.filter((x) => x[0] === 'rect' && x[1] === '#555555').at(-1); };
    assert.equal(thumb(0)[3], GY);
    assert.equal(thumb(12)[3] + thumb(12)[5], GY + ROWS * CH);
  });
  it('the source files are Latin-1 (ASCII), 72 columns, 250 lines', () => {
    for (const f of ['Ui/CharGrid', 'Ui/CharGridPaint']) {
      const t = fs.readFileSync(new URL('../../tools/moreapps/!WimpLib/' + f, import.meta.url), 'latin1');
      assert.ok(!/[^\n\x20-\x7e]/.test(t), f);
      const lines = t.replace(/\n$/, '').split('\n');
      assert.ok(lines.length <= 250 && lines.every((l) => l.length <= 72), f);
    }
  });
});
