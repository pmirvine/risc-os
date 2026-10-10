// MacKeys: Cmd as Ctrl for !Word's editing and format keys on a Mac
// (never Cmd-R, Cmd-L, nor the clipboard's Cmd-C, Cmd-X, Cmd-V).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {isMac, macKey, macLabel, CMD} from '../../tools/moreapps/!Word/MacKeys';
import {keymap} from '../../tools/moreapps/!Word/Keymap';

/** A 'key' event as the Wimp gives it for Cmd + key on a Mac. */
const cmd = (key, o = {}) => ({code: key.codePointAt(0), key,
  shift: !!o.shift, ctrl: !!o.ctrl, alt: !!o.alt,
  domEvent: {metaKey: true, ctrlKey: !!o.ctrl, altKey: !!o.alt,
    shiftKey: !!o.shift}});

describe('MacKeys', () => {
  it('isMac reads navigator.platform', () => {
    for (const p of ['MacIntel', 'Macintosh', 'MacPPC', 'iPad',
      'iPhone']) assert.equal(isMac(p), true, p);
    for (const p of ['Win32', 'Linux x86_64', 'Linux armv8l', '', null,
      undefined, 42, 'X11; Mac']) assert.equal(isMac(p), false,
      String(p));
  });
  it('on a Mac, Cmd + an editing letter is Ctrl + it', () => {
    const want = {z: 'undo', y: 'redo', b: 'bold', i: 'italic',
      u: 'underline', e: 'alignCenter', j: 'alignJustify'};
    for (const [k, id] of Object.entries(want)) {
      const e = macKey(cmd(k), true);
      assert.equal(e.ctrl, true, k);
      assert.equal(e.code, k.toUpperCase().charCodeAt(0) - 64, k);
      assert.equal(keymap.lookup(e), id, k);
    }
    assert.equal(keymap.lookup(macKey(cmd('a'), true)), 'selectAll');
    assert.equal(keymap.lookup(macKey(cmd('z', {shift: true}), true)),
      'redo');
    assert.equal(keymap.lookup(macKey(cmd('Z', {shift: true}), true)),
      'redo');
  });
  it('never Cmd-R, Cmd-L, Cmd-C, Cmd-X, Cmd-V, nor other keys', () => {
    for (const k of ['r', 'l', 'c', 'x', 'v', 'm', 'q', 'w', 't',
      'h', 'p', 'o', '=', '+', '-', '.', ',', ' ', '1', 'ArrowLeft',
      'Backspace', 'Enter']) {
      const ev = cmd(k);
      assert.equal(macKey(ev, true), ev, k);
      // (Cmd-Backspace, Cmd-Enter: as before, their plain keys' rows)
      if (k.length === 1) {
        assert.equal(keymap.lookup(macKey(ev, true)), null, k);
      }
    }
    assert.ok(!CMD.has('r') && !CMD.has('l') && !CMD.has('c') &&
      !CMD.has('x') && !CMD.has('v') && !CMD.has('m'));
    // Cmd-M (macOS minimises; the page never sees it), Cmd-Shift-M
    assert.equal(keymap.lookup(macKey(cmd('m', {shift: true}), true)),
      null);
  });
  it('Cmd-Shift-L (Safari\'s sidebar) is never bullets: Ctrl-Shift-L ' +
    'is, on a Mac too', () => {
    const e = cmd('L', {shift: true});
    assert.equal(macKey(e, true), e);
    assert.equal(keymap.lookup(macKey(e, true)), null);
    assert.ok(!CMD.has('l'));
    assert.equal(macLabel(keymap.labelFor('bullets'), true),
      'Ctrl+Shift+L');
    const c = {code: 'L'.codePointAt(0), key: 'L', shift: true,
      ctrl: true, alt: false,
      domEvent: {metaKey: false, ctrlKey: true, shiftKey: true}};
    assert.equal(keymap.lookup(macKey(c, true)), 'bullets');
  });
  it('the Insert menu\'s Page break label is Ctrl+Enter on a Mac ' +
    'too; Hyperlink is Ctrl+K (Cmd+K); Bookmark is Ctrl+Shift+F5 (Ctrl ' +
    'on a Mac too)', () => {
    assert.equal(keymap.labelFor('pageBreak'), 'Ctrl+Enter');
    assert.equal(macLabel(keymap.labelFor('pageBreak'), true),
      'Ctrl+Enter');
    for (const id of ['sectionNext', 'sectionContinuous']) {
      assert.equal(macLabel(keymap.labelFor(id), true), '');
    }
    // Ctrl+K: hyperlink (Cmd+K on a Mac); Ctrl+Shift+F5 bookmark
    assert.equal(keymap.lookup({code: 11, key: 'k', ctrl: true}),
      'hyperlink');
    assert.equal(keymap.lookup(macKey(cmd('k'), true)), 'hyperlink');
    assert.equal(macLabel(keymap.labelFor('hyperlink'), true), 'Cmd+K');
    assert.equal(keymap.lookup({code: 0x1B5, key: 'F5', ctrl: true,
      shift: true}), 'bookmark');
    assert.equal(macLabel(keymap.labelFor('bookmark'), true),
      'Ctrl+Shift+F5');
  });
  it('not on other platforms, nor with Alt or Ctrl held, nor w/o Cmd',
    () => {
      const ev = cmd('z');
      assert.equal(macKey(ev, false), ev);
      assert.equal(keymap.lookup(macKey(ev, false)), null);
      const alt = cmd('z', {alt: true});
      assert.equal(macKey(alt, true), alt);
      const both = cmd('z', {ctrl: true});
      assert.equal(macKey(both, true), both);
      const plain = {code: 122, key: 'z', shift: false, ctrl: false,
        domEvent: {metaKey: false}};
      assert.equal(macKey(plain, true), plain);
      const sent = {code: 122, key: 'z'};          // Wimp_ProcessKey
      assert.equal(macKey(sent, true), sent);
      assert.equal(macKey(null, true), null);
    });
  it('macLabel: Cmd+ on a Mac for the mapped and clipboard keys', () => {
    const ids = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll',
      'bold', 'alignRight', 'alignLeft', 'indentMore', 'enter'];
    assert.deepEqual(ids.map((i) => macLabel(keymap.labelFor(i), true)),
      ['Cmd+Z', 'Cmd+Y', 'Cmd+X', 'Cmd+C', 'Cmd+V', 'Cmd+A', 'Cmd+B',
        'Ctrl+R', 'Ctrl+L', 'Ctrl+M', 'Enter']);
    assert.deepEqual(ids.map((i) => macLabel(keymap.labelFor(i), false)),
      ids.map((i) => keymap.labelFor(i)));
    assert.equal(macLabel('Ctrl+Shift+Z', true), 'Cmd+Shift+Z');
    assert.equal(macLabel('Ctrl+Shift+M', true), 'Ctrl+Shift+M');
    assert.equal(macLabel('Ctrl+=', true), 'Ctrl+=');
    assert.equal(macLabel('', true), '');
  });
  it('Cmd-S saves, Cmd-N makes a new document', () => {
    for (const [k, id, code] of [['s', 'save', 19], ['n', 'new', 14],
      ['S', 'save', 19], ['N', 'new', 14]]) {
      const e = macKey(cmd(k), true);
      assert.equal(e.ctrl, true, k);
      assert.equal(e.code, code, k);
      assert.equal(keymap.lookup(e), id, k);
      assert.equal(keymap.lookup(macKey(cmd(k), false)), null, k);
    }
    assert.ok(CMD.has('s') && CMD.has('n'));
    // Cmd-Shift-S, Cmd-Alt-S: no row
    assert.equal(keymap.lookup(macKey(cmd('s', {shift: true}), true)),
      null);
    assert.equal(keymap.lookup(macKey(cmd('s', {alt: true}), true)),
      null);
    assert.equal(macLabel(keymap.labelFor('save'), true), 'Cmd+S');
    assert.equal(macLabel('Ctrl+N', true), 'Cmd+N');
    assert.equal(macLabel(keymap.labelFor('new'), true), 'F2');
    assert.equal(macLabel('Ctrl+F2', true), 'Ctrl+F2');
    assert.equal(macLabel(keymap.labelFor('save'), false), 'Ctrl+S');
  });
  it('Cmd-F finds, Cmd-G and Cmd-Shift-G find again; never Cmd-H',
    () => {
      for (const [k, o, id] of [['f', {}, 'find'], ['F', {}, 'find'],
        ['g', {}, 'findNext'], ['G', {shift: true}, 'findPrev'],
        ['g', {shift: true}, 'findPrev']]) {
        assert.equal(keymap.lookup(macKey(cmd(k, o), true)), id, k);
        assert.equal(keymap.lookup(macKey(cmd(k, o), false)), null, k);
      }
      // Cmd-H hides the program on a Mac: never Replace
      const h = cmd('h');
      assert.equal(macKey(h, true), h);
      assert.equal(keymap.lookup(macKey(h, true)), null);
      assert.ok(!CMD.has('h'));
      // Ctrl-H is Replace on a Mac too
      assert.equal(keymap.lookup(macKey({code: 8, key: 'h', ctrl: true,
        shift: false, domEvent: {ctrlKey: true}}, true)), 'replace');
      assert.equal(macLabel(keymap.labelFor('find'), true), 'Cmd+F');
      assert.equal(macLabel(keymap.labelFor('findNext'), true), 'Cmd+G');
      assert.equal(macLabel(keymap.labelFor('findPrev'), true),
        'Cmd+Shift+G');
      assert.equal(macLabel(keymap.labelFor('replace'), true), 'Ctrl+H');
    });
  it('the event given is never changed', () => {
    const ev = cmd('b');
    const copy = JSON.stringify(ev);
    const e = macKey(ev, true);
    assert.notEqual(e, ev);
    assert.equal(JSON.stringify(ev), copy);
    assert.equal(e.domEvent, ev.domEvent);
  });
});

describe('MacKeys: the line spacing keys', () => {
  it('Ctrl+1 (not Cmd) works on a Mac; Cmd+digit is never mapped',
    () => {
      for (const [key, want] of [['1', 'lineSingle'], ['2', 'lineDouble'],
        ['5', 'line15'], ['0', 'spaceBefore12']]) {
        const ctrl = {code: key.charCodeAt(0), key, shift: false,
          ctrl: true, alt: false, domEvent: {metaKey: false,
            ctrlKey: true, altKey: false, shiftKey: false}};
        assert.equal(macKey(ctrl, true), ctrl);
        assert.equal(keymap.lookup(macKey(ctrl, true)), want);
        const c = cmd(key);
        assert.equal(macKey(c, true), c, 'Cmd+' + key + ' as it is');
        assert.equal(keymap.lookup(macKey(c, true)), null);
      }
      assert.ok(![...CMD].some((k) => /[0-9]/.test(k)));
    });
});
