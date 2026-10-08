// Keymap: key events -> command ids, labels.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {keymap, Keymap, ROWS, WINDOW} from '../../tools/moreapps/!Word/Keymap';
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
      ['PageDown', {}], ['q', {ctrl: true}], ['w', {ctrl: true}],
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
    assert.equal(L(24), 'cut', 'Ctrl-X: the Edit menu label row');
    assert.equal(L(17), null);
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
    assert.equal(P(24), 'cut');
    assert.equal(P(17), null);
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
  it('cut, copy and paste rows (Edit menu labels); no Ctrl+Shift', () => {
    const k = (key, o = {}) => keymap.lookup({key, ctrl: true,
      shift: !!o.shift, code: key.toUpperCase().charCodeAt(0) - 64});
    assert.deepEqual(['cut', 'copy', 'paste'].map((i) =>
      [keymap.labelFor(i), keymap.row(i).label, keymap.row(i).menu]),
    [['Ctrl+X', 'Cut', 'Edit'], ['Ctrl+C', 'Copy', 'Edit'],
      ['Ctrl+V', 'Paste', 'Edit']]);
    assert.equal(k('x'), 'cut');
    assert.equal(k('c'), 'copy');
    assert.equal(k('v'), 'paste');
    for (const c of ['x', 'c', 'v', 'X', 'C', 'V']) {
      assert.equal(k(c, {shift: true}), null, c);
    }
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
    for (const bad of ['Ctrl+', 'Ctrl+Space+', 'Alt+B', 'Ctrl+F13',
      'F0', 'F13', 'Ctrl+é'])
      assert.throws(() => new Keymap().bind([{id: 'x', keys: [bad]}]),
        bad);
  });
});

describe('Keymap: RISC OS function keys and Ctrl-S, Ctrl-N', () => {
  const cases = [
    ['F2', {}, 'new'],
    ['n', {ctrl: true}, 'new'],
    ['N', {ctrl: true}, 'new'],
    ['F2', {ctrl: true}, 'close'],
    ['F3', {}, 'saveBox'],
    ['s', {ctrl: true}, 'save'],
    ['S', {ctrl: true}, 'save'],
    ['F4', {}, 'find'],
    ['f', {ctrl: true}, 'find'],
    ['F', {ctrl: true}, 'find'],
    ['h', {ctrl: true}, 'replace'],
    ['g', {ctrl: true}, 'findNext'],
    ['G', {ctrl: true, shift: true}, 'findPrev'],
    ['g', {ctrl: true, shift: true}, 'findPrev'],
    ['F8', {}, 'undo'],
    ['F9', {}, 'redo'],
    ['F10', {ctrl: true}, 'sendToBack'],
  ];
  for (const [key, mods, want] of cases) {
    it(`${key} ${JSON.stringify(mods)} -> ${want}`,
      () => assert.equal(id(key, mods), want));
  }
  it('keyCode gives the Wimp codes (Shift +&10, Ctrl +&20)', () => {
    assert.equal(ev('F2').code, 0x182);
    assert.equal(ev('F3').code, 0x183);
    assert.equal(ev('F4').code, 0x184);
    assert.equal(ev('F8').code, 0x188);
    assert.equal(ev('F9').code, 0x189);
    assert.equal(ev('F10').code, 0x1CA);
    assert.equal(ev('F2', {shift: true}).code, 0x192);
    assert.equal(ev('F2', {ctrl: true}).code, 0x1A2);
    assert.equal(ev('F10', {ctrl: true}).code, 0x1EA);
    assert.equal(ev('s', {ctrl: true}).code, 19);
    assert.equal(ev('n', {ctrl: true}).code, 14);
  });
  it('unmapped function keys, Shift and Alt forms are null', () => {
    for (const [key, mods] of [['F1', {}], ['F5', {}], ['F6', {}],
      ['F7', {}], ['F10', {}], ['F11', {}], ['F12', {}],
      ['F2', {shift: true}], ['F3', {shift: true}],
      ['F3', {ctrl: true}], ['F2', {ctrl: true, shift: true}],
      ['F5', {ctrl: true}], ['F8', {shift: true}],
      ['F12', {ctrl: true}], ['F12', {shift: true}],
      ['F2', {alt: true}], ['F3', {alt: true}],
      ['F2', {ctrl: true, alt: true}], ['s', {alt: true}],
      ['s', {ctrl: true, alt: true}], ['s', {ctrl: true, shift: true}],
      ['n', {ctrl: true, shift: true}], ['s', {}], ['n', {}],
      ['f', {}], ['g', {}], ['h', {}], ['f', {ctrl: true, alt: true}],
      ['h', {ctrl: true, shift: true}], ['F4', {shift: true}],
      ['F4', {ctrl: true}]]) {
      assert.equal(id(key, mods), null, key + JSON.stringify(mods));
    }
  });
  it('a bare Wimp code: the bits of the code are the modifiers', () => {
    const P = (code, mods = {}) => keymap.lookup({code, char: '',
      key: '', shift: false, ctrl: false, alt: false, ...mods});
    assert.equal(P(0x182), 'new');
    assert.equal(P(0x1A2), 'close');
    assert.equal(P(0x183), 'saveBox');
    assert.equal(P(0x184), 'find');
    // Ctrl-F and Ctrl-G as bare codes; Ctrl-H's code 8 is Backspace
    assert.equal(P(6), 'find');
    assert.equal(P(7), 'findNext');
    assert.equal(P(8), 'backspace');
    assert.equal(P(0x188), 'undo');
    assert.equal(P(0x189), 'redo');
    assert.equal(P(0x1EA), 'sendToBack');
    assert.equal(P(19), 'save');
    assert.equal(P(14), 'new');
    assert.equal(P(0x182, {ctrl: true}), 'close');
    assert.equal(keymap.lookup({code: 0x182}), 'new');
    assert.equal(keymap.lookup({code: 0x1A2}), 'close');
    for (const c of [0x181, 0x185, 0x186, 0x187, 0x192, 0x193, 0x1A5,
      0x1B2, 0x1CA, 0x1CB, 0x1CC, 0x1DC, 0x1EC, 0x1FC, 0x180,
      0x18A + 0x20]) assert.equal(P(c), null, c.toString(16));
    assert.equal(P(0x182, {alt: true}), null);
    assert.equal(P(0x183, {alt: true}), null);
  });
  it('function keys are not movement keys', () => {
    for (const c of [0x181, 0x182, 0x183, 0x184, 0x188, 0x189, 0x1A2,
      0x1CA, 0x1EA]) assert.equal(command(c), null, c.toString(16));
  });
  it('labels: the first key', () => {
    assert.equal(keymap.labelFor('new'), 'F2');
    assert.equal(keymap.labelFor('close'), 'Ctrl+F2');
    assert.equal(keymap.labelFor('saveBox'), 'F3');
    assert.equal(keymap.labelFor('save'), 'Ctrl+S');
    assert.equal(keymap.labelFor('find'), 'Ctrl+F');
    assert.deepEqual(keymap.row('find').keys, ['Ctrl+F', 'F4']);
    assert.equal(keymap.labelFor('replace'), 'Ctrl+H');
    assert.equal(keymap.labelFor('findNext'), 'Ctrl+G');
    assert.equal(keymap.labelFor('findPrev'), 'Ctrl+Shift+G');
    assert.equal(keymap.labelFor('sendToBack'), 'Ctrl+F10');
    assert.equal(keymap.labelFor('undo'), 'Ctrl+Z');
    assert.equal(keymap.labelFor('redo'), 'Ctrl+Y');
    assert.deepEqual(keymap.row('undo').keys, ['Ctrl+Z', 'F8']);
    assert.ok(keymap.row('redo').keys.includes('F9'));
    for (const i of ['new', 'close', 'saveBox', 'save', 'find',
      'replace', 'findNext', 'findPrev', 'sendToBack'])
      assert.equal(keymap.row(i).menu, 'Window', i);
  });
  it('WINDOW lists the window commands', () => {
    assert.deepEqual([...WINDOW].sort(), ['close', 'find', 'findNext',
      'findPrev', 'new', 'replace', 'save', 'saveBox', 'sendToBack']);
  });
  it('function key names bind: F1..F12 with Ctrl and Shift', () => {
    const k = new Keymap().bind([{id: 'a', keys: ['F1']},
      {id: 'b', keys: ['Ctrl+Shift+F12']}, {id: 'c', keys: ['Shift+F5']}]);
    assert.equal(k.lookup({code: 0x181, key: 'F1'}), 'a');
    assert.equal(k.lookup({code: 0x1FC, key: 'F12', ctrl: true,
      shift: true}), 'b');
    assert.equal(k.lookup({code: 0x1FC, key: ''}), 'b');
    assert.equal(k.lookup({code: 0x195, key: 'F5', shift: true}), 'c');
    assert.equal(k.lookup({code: 0x195}), 'c');
    assert.equal(k.lookup({code: 0x185, key: 'F5'}), null);
  });
});
