// Keymap: key events -> command ids, labels.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {keymap, Keymap, ROWS} from '../../tools/moreapps/!Word/Keymap';
import {keyCode} from '../../src/core/input.js';
import {command} from '../../tools/moreapps/!Word/Keys';

/** What the desktop gives for a browser key: the lookup event. */
function ev(key, mods = {}) {
  const k = keyCode({key, shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt});
  if (!k) return null;
  return {code: k.code, key, shift: !!mods.shift, ctrl: !!mods.ctrl,
    alt: !!mods.alt};
}
const id = (key, mods) => keymap.lookup(ev(key, mods));

describe('Keymap.lookup from real key events', () => {
  const cases = [
    ['Enter', {}, 'enter'],
    ['Enter', {shift: true}, 'shiftEnter'],
    ['Backspace', {}, 'backspace'],
    ['Backspace', {shift: true}, 'backspace'],
    ['Backspace', {ctrl: true}, 'ctrlBackspace'],
    ['Delete', {}, 'delete'],
    ['Delete', {ctrl: true}, 'ctrlDelete'],
    ['Tab', {}, 'tab'],
    ['Tab', {shift: true}, 'shiftTab'],
    ['Insert', {}, 'insert'],
    ['z', {ctrl: true}, 'undo'],
    ['Z', {ctrl: true}, 'undo'],
    ['y', {ctrl: true}, 'redo'],
    ['z', {ctrl: true, shift: true}, 'redo'],
    ['Z', {ctrl: true, shift: true}, 'redo'],
    ['a', {ctrl: true}, 'selectAll'],
  ];
  for (const [key, mods, want] of cases) {
    it(`${key} ${JSON.stringify(mods)} -> ${want}`, () => {
      assert.equal(id(key, mods), want);
    });
  }
  it('uses the codes keyCode really gives', () => {
    assert.equal(ev('Enter').code, 13);
    assert.equal(ev('Backspace', {ctrl: true}).code, 8);
    assert.equal(ev('Delete', {ctrl: true}).code, 127);
    assert.equal(ev('Tab').code, 0x18A);
    assert.equal(ev('Insert').code, 0x1CD);
    assert.equal(ev('z', {ctrl: true}).code, 26);
    assert.equal(ev('y', {ctrl: true}).code, 25);
  });
  it('unmapped keys, plain letters and Alt combos are null', () => {
    for (const [key, mods] of [['a', {}], ['z', {}], ['F5', {}],
      ['Escape', {}], ['ArrowLeft', {}], ['Home', {}],
      ['PageDown', {}], ['x', {ctrl: true}], ['c', {ctrl: true}],
      ['Tab', {ctrl: true}], ['Tab', {ctrl: true, shift: true}],
      ['Tab', {alt: true}], ['Tab', {alt: true, shift: true}],
      ['Enter', {ctrl: true}], ['Delete', {shift: true}],
      ['Insert', {ctrl: true}], ['Insert', {shift: true}],
      ['y', {ctrl: true, shift: true}],
      ['Enter', {alt: true}], ['Backspace', {alt: true}],
      ['z', {alt: true}], ['z', {ctrl: true, alt: true}],
      ['Dead', {}]]) {
      const e = ev(key, mods);
      assert.equal(e && keymap.lookup(e), null,
        key + JSON.stringify(mods));
    }
  });
  it('bad events give null', () => {
    for (const e of [null, undefined, {}, {code: 'x'}, {code: -1},
      {code: 13.5}, {key: 7}])
      assert.equal(keymap.lookup(e), null);
  });
});

describe('Keymap.lookup from a bare Wimp code', () => {
  const L = (code, mods = {}) => keymap.lookup({code, ...mods});
  it('plain codes', () => {
    assert.equal(L(13), 'enter');
    assert.equal(L(8), 'backspace');
    assert.equal(L(127), 'delete');
    assert.equal(L(0x18A), 'tab');
    assert.equal(L(9), 'tab');
    assert.equal(L(0x1CD), 'insert');
  });
  it('Ctrl-letter codes 1..26', () => {
    assert.equal(L(26), 'undo');
    assert.equal(L(25), 'redo');
    assert.equal(L(1), 'selectAll');
    assert.equal(L(24), null);
    assert.equal(L(26, {shift: true}), 'redo');
  });
  it('modifiers from the flags, or the bits of the code', () => {
    assert.equal(L(13, {shift: true}), 'shiftEnter');
    assert.equal(L(8, {ctrl: true}), 'ctrlBackspace');
    assert.equal(L(127, {ctrl: true}), 'ctrlDelete');
    assert.equal(L(0x18A + 0x10), 'shiftTab');
    assert.equal(L(0x18A + 0x20), null);
    assert.equal(L(0x18A + 0x30), null);
    assert.equal(L(0x18A + 0x10, {alt: true}), null);
    assert.equal(L(9, {shift: true}), 'shiftTab');
    assert.equal(L(9, {ctrl: true}), null);
    assert.equal(L(0x1CD + 0x20), null);
    assert.equal(L(13, {alt: true}), null);
  });
  it('movement keys are not ours (Keys decides)', () => {
    for (const c of [0x18C, 0x18D, 0x18E, 0x18F, 0x18B, 30, 0x19E,
      27]) assert.equal(L(c), null);
  });
});

describe('Keymap.lookup from Wimp_ProcessKey events', () => {
  // wimp.js gives key: char, which is '' below 32 and for &18A
  const P = (code, mods = {}) => keymap.lookup({code, char: '',
    key: '', shift: false, ctrl: false, alt: false, ...mods});
  it('empty key name falls back to the code', () => {
    assert.equal(P(13), 'enter');
    assert.equal(P(8), 'backspace');
    assert.equal(P(26), 'undo');
    assert.equal(P(25), 'redo');
    assert.equal(P(0x18A), 'tab');
    assert.equal(P(0x19A), 'shiftTab');
    assert.equal(P(0x1AA), null);
    assert.equal(P(127), 'delete');
    assert.equal(P(0x1CD), 'insert');
    assert.equal(P(1), 'selectAll');
  });
  it('modifiers still count; unknown names fall back too', () => {
    assert.equal(P(13, {shift: true}), 'shiftEnter');
    assert.equal(P(8, {ctrl: true}), 'ctrlBackspace');
    assert.equal(P(13, {alt: true}), null);
    assert.equal(keymap.lookup({code: 13, key: 'Unidentified'}),
      'enter');
    assert.equal(P(24), null);
  });
});

describe('Keymap table', () => {
  it('selectAll agrees with Keys', () => {
    assert.equal(command(1).cmd, 'selectAll');
  });
  it('labels are Word style', () => {
    assert.equal(keymap.labelFor('undo'), 'Ctrl+Z');
    assert.equal(keymap.labelFor('redo'), 'Ctrl+Y');
    assert.equal(keymap.labelFor('selectAll'), 'Ctrl+A');
    assert.equal(keymap.labelFor('shiftEnter'), 'Shift+Enter');
    assert.equal(keymap.labelFor('ctrlBackspace'), 'Ctrl+Backspace');
    assert.equal(keymap.labelFor('enter'), 'Enter');
    assert.equal(keymap.labelFor('nothing'), '');
  });
  it('rows carry label and menu', () => {
    const u = ROWS.find((r) => r.id === 'undo');
    assert.equal(u.label, 'Undo');
    assert.equal(u.menu, 'Edit');
    assert.equal(keymap.row('redo').label, 'Redo');
    assert.equal(keymap.row('nothing'), null);
  });
  it('every id of the deliverable has a row', () => {
    for (const i of ['enter', 'shiftEnter', 'backspace', 'delete',
      'ctrlBackspace', 'ctrlDelete', 'tab', 'shiftTab', 'insert',
      'undo', 'redo', 'selectAll']) assert.ok(keymap.row(i), i);
    assert.equal(keymap.labelFor('tab'), 'Tab');
    assert.equal(keymap.labelFor('shiftTab'), 'Shift+Tab');
  });
  it('bind replaces the table; a new Keymap starts empty', () => {
    const k = new Keymap();
    assert.equal(k.lookup({code: 13}), null);
    k.bind([{id: 'x', keys: ['Ctrl+Shift+Q', 'Tab'], label: 'X'}]);
    assert.equal(k.lookup({code: 17, key: 'q', ctrl: true,
      shift: true}), 'x');
    assert.equal(k.lookup({code: 13}), null);
    assert.equal(k.labelFor('x'), 'Ctrl+Shift+Q');
  });
  it('bind rejects a bad key name', () => {
    assert.throws(() => new Keymap().bind([{id: 'x',
      keys: ['Ctrl+']}]));
  });
});

describe('Keymap: formatting rows', () => {
  const cases = [
    ['b', {ctrl: true}, 'bold'],
    ['B', {ctrl: true}, 'bold'],
    ['i', {ctrl: true}, 'italic'],
    ['u', {ctrl: true}, 'underline'],
    ['l', {ctrl: true}, 'alignLeft'],
    ['e', {ctrl: true}, 'alignCenter'],
    ['r', {ctrl: true}, 'alignRight'],
    ['j', {ctrl: true}, 'alignJustify'],
    [' ', {ctrl: true}, 'clearFormat'],
    ['=', {ctrl: true}, 'subscript'],
    ['+', {ctrl: true, shift: true}, 'superscript'],
    ['=', {ctrl: true, shift: true}, 'superscript'],
    ['>', {ctrl: true, shift: true}, 'fontBigger'],
    ['.', {ctrl: true, shift: true}, 'fontBigger'],
    ['<', {ctrl: true, shift: true}, 'fontSmaller'],
    [',', {ctrl: true, shift: true}, 'fontSmaller'],
    ['m', {ctrl: true}, 'indentMore'],
    ['M', {ctrl: true, shift: true}, 'indentLess'],
  ];
  for (const [key, mods, want] of cases) {
    it(`${JSON.stringify(key)} ${JSON.stringify(mods)} -> ${want}`,
      () => assert.equal(id(key, mods), want));
  }
  it('real codes: Ctrl-I is 9, Ctrl-M 13, yet the name decides', () => {
    assert.equal(ev('i', {ctrl: true}).code, 9);
    assert.equal(ev('m', {ctrl: true}).code, 13);
    assert.equal(ev('b', {ctrl: true}).code, 2);
    assert.equal(ev(' ', {ctrl: true}).code, 32);
    assert.equal(id('Tab'), 'tab');
    assert.equal(id('Enter'), 'enter');
    assert.equal(id('Backspace'), 'backspace');
  });
  it('plain symbols, letters and space are not commands', () => {
    for (const [key, mods] of [['b', {}], ['=', {}], [' ', {}],
      ['>', {shift: true}], ['+', {shift: true}], ['m', {}],
      ['b', {ctrl: true, alt: true}], ['=', {ctrl: true, alt: true}]])
      assert.equal(id(key, mods), null, key + JSON.stringify(mods));
  });
  it('a bare Wimp code: Ctrl-letters, but 8, 9 and 13 stay', () => {
    const P = (code, mods = {}) => keymap.lookup({code, key: '',
      shift: false, ctrl: false, alt: false, ...mods});
    assert.equal(P(2), 'bold');
    assert.equal(P(21), 'underline');
    assert.equal(P(12), 'alignLeft');
    assert.equal(P(5), 'alignCenter');
    assert.equal(P(18), 'alignRight');
    assert.equal(P(10), 'alignJustify');
    assert.equal(P(9), 'tab');
    assert.equal(P(13), 'enter');
    assert.equal(P(8), 'backspace');
    assert.equal(keymap.lookup({code: 2}), 'bold');
    assert.equal(keymap.lookup({code: 9}), 'tab');
    assert.equal(keymap.lookup({code: 13}), 'enter');
  });
  it('labels and menu', () => {
    assert.equal(keymap.labelFor('bold'), 'Ctrl+B');
    assert.equal(keymap.labelFor('clearFormat'), 'Ctrl+Space');
    assert.equal(keymap.labelFor('superscript'), 'Ctrl+Shift+=');
    assert.equal(keymap.labelFor('subscript'), 'Ctrl+=');
    assert.equal(keymap.labelFor('fontBigger'), 'Ctrl+Shift+>');
    assert.equal(keymap.labelFor('indentLess'), 'Ctrl+Shift+M');
    assert.equal(keymap.row('bold').menu, 'Format');
    assert.equal(keymap.row('bold').label, 'Bold');
  });
  it('key names with symbols bind', () => {
    const k = new Keymap().bind([{id: 'p', keys: ['Ctrl++']},
      {id: 'm', keys: ['Ctrl+-']}, {id: 'z', keys: ['Ctrl+0']},
      {id: 's', keys: ['Shift+Space']}]);
    assert.equal(k.lookup({code: 43, key: '+', ctrl: true}), 'p');
    assert.equal(k.lookup({code: 45, key: '-', ctrl: true}), 'm');
    assert.equal(k.lookup({code: 48, key: '0', ctrl: true}), 'z');
    assert.equal(k.lookup({code: 32, key: ' ', shift: true}), 's');
    for (const bad of ['Ctrl+', 'Ctrl+Space+', 'Alt+B', 'Ctrl+F5',
      'Ctrl+é'])
      assert.throws(() => new Keymap().bind([{id: 'x', keys: [bad]}]),
        bad);
  });
});
