// Keys: the Wimp key codes (src/core/input.js keyCode) of !Word's
// document window -> caret and selection commands. Shift adds &10 and
// Ctrl &20 to the arrows and Copy (End); Home is 30 and Page Up/Down
// &19F/&19E (+&20 with Ctrl) whatever Shift does, so the modifiers
// held, and the browser's key name, are passed as well.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {command} from '../../tools/moreapps/!Word/Keys';

const LEFT = 0x18C, RIGHT = 0x18D, DOWN = 0x18E, UP = 0x18F;
const END = 0x18B, HOME = 30, PGDN = 0x19E, PGUP = 0x19F;
const S = 0x10, C = 0x20;
const c = (cmd, extend = false) => ({cmd, extend});

describe('Keys.command: from the browser key (as the Wimp sends)', () => {
  // [key name, plain code, plain, ctrl]
  const rows = [
    ['ArrowLeft', LEFT, 'left', 'wordLeft'],
    ['ArrowRight', RIGHT, 'right', 'wordRight'],
    ['ArrowUp', UP, 'up', 'paraStart'],
    ['ArrowDown', DOWN, 'down', 'paraEnd'],
    ['Home', HOME, 'home', 'docHome'],
    ['End', END, 'end', 'docEnd'],
    ['PageUp', PGUP, 'pageUp', 'pageUp'],
    ['PageDown', PGDN, 'pageDown', 'pageDown'],
  ];
  // the codes keyCode() gives with Shift and Ctrl
  const code = (key, base, shift, ctrl) => {
    if (key === 'Home') return HOME;
    if (key === 'PageUp' || key === 'PageDown') return base + (ctrl ? C : 0);
    return base + (shift ? S : 0) + (ctrl ? C : 0);
  };
  for (const [key, base, plain, ctl] of rows) {
    it(`${key}: plain, Shift, Ctrl, Ctrl-Shift`, () => {
      for (const shift of [false, true]) {
        for (const ctrl of [false, true]) {
          const k = code(key, base, shift, ctrl);
          assert.deepEqual(command(k, {shift, ctrl, key}),
            c(ctrl ? ctl : plain, shift), `${key} ${shift} ${ctrl}`);
        }
      }
    });
  }
  it('Shift-Down is not Page Down, though both are &19E', () => {
    assert.deepEqual(command(DOWN + S, {shift: true, key: 'ArrowDown'}),
      c('down', true));
    assert.deepEqual(command(PGDN, {shift: true, key: 'PageDown'}),
      c('pageDown', true));
    assert.deepEqual(command(UP + S, {shift: true, key: 'ArrowUp'}),
      c('up', true));
    assert.deepEqual(command(UP + S + C,
      {shift: true, ctrl: true, key: 'ArrowUp'}), c('paraStart', true));
  });
  it('Ctrl-A selects all; Escape collapses', () => {
    assert.deepEqual(command(1, {ctrl: true, key: 'a'}), c('selectAll'));
    assert.deepEqual(command(1, {ctrl: true, shift: true, key: 'A'}),
      c('selectAll'));
    assert.deepEqual(command(27, {key: 'Escape'}), c('collapse'));
  });
});

describe('Keys.command: from the code alone (Wimp_ProcessKey)', () => {
  it('arrows and Copy with Shift and Ctrl in the code', () => {
    assert.deepEqual(command(LEFT), c('left'));
    assert.deepEqual(command(LEFT + S), c('left', true));
    assert.deepEqual(command(LEFT + C), c('wordLeft'));
    assert.deepEqual(command(LEFT + S + C), c('wordLeft', true));
    assert.deepEqual(command(RIGHT + C), c('wordRight'));
    assert.deepEqual(command(UP), c('up'));
    assert.deepEqual(command(DOWN), c('down'));
    assert.deepEqual(command(UP + C), c('paraStart'));
    assert.deepEqual(command(DOWN + C), c('paraEnd'));
    // (&1BF is Ctrl-Page Up too: without a key name, the page)
    assert.deepEqual(command(UP + S + C), c('pageUp'));
    assert.deepEqual(command(LEFT + S + C, {shift: true, ctrl: true}),
      c('wordLeft', true));
    assert.deepEqual(command(END), c('end'));
    assert.deepEqual(command(END + S), c('end', true));
    assert.deepEqual(command(END + C), c('docEnd'));
    assert.deepEqual(command(END + S + C), c('docEnd', true));
  });
  it('&19E/&19F are Page Down/Up (as Shift-Down/Up are in RISC OS)',
    () => {
      assert.deepEqual(command(PGDN), c('pageDown'));
      assert.deepEqual(command(PGUP), c('pageUp'));
      assert.deepEqual(command(PGDN + C), c('pageDown'));
      assert.deepEqual(command(PGUP + C), c('pageUp'));
      assert.deepEqual(command(PGDN, {shift: true}), c('pageDown', true));
    });
  it('Home takes Shift and Ctrl from the flags', () => {
    assert.deepEqual(command(HOME), c('home'));
    assert.deepEqual(command(HOME, {shift: true}), c('home', true));
    assert.deepEqual(command(HOME, {ctrl: true}), c('docHome'));
    assert.deepEqual(command(HOME, {ctrl: true, shift: true}),
      c('docHome', true));
  });
  it('an unknown key name falls back to the code', () => {
    assert.deepEqual(command(LEFT, {key: ''}), c('left'));
    assert.deepEqual(command(END, {key: 'Copy'}), c('end'));
  });
});

describe('Keys.command: keys the window does not use', () => {
  it('give null (passed on to the desktop)', () => {
    const keys = [
      [0x185, {key: 'F5'}], [0x1EC, {ctrl: true, key: 'F12'}],
      [0x1CC, {key: 'F12'}], [65, {key: 'A'}], [97, {key: 'a'}],
      [13, {key: 'Enter'}], [8, {key: 'Backspace'}],
      [127, {key: 'Delete'}], [0x18A, {key: 'Tab'}],
      [0x1CD, {key: 'Insert'}], [2, {ctrl: true, key: 'b'}],
      [26, {ctrl: true, key: 'z'}], [32, {key: ' '}],
      [0x180, {}], [0x18A + S, {}], [0x19A, {}], [0x1CA, {}],
      [-1, {}], [NaN, {}], [undefined, {}], ['x', {}],
    ];
    for (const [k, m] of keys) {
      assert.equal(command(k, m), null, `${k} ${JSON.stringify(m)}`);
    }
    assert.equal(command(0x185), null);
  });
  it('a key name does not make an unrelated code a command', () => {
    assert.equal(command(65, {key: 'ArrowLeft'}), null);
    assert.equal(command(0x185, {key: 'Home'}), null);
  });
});
