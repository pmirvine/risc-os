// Typing: undo coalescing decisions (fake clock).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as D from '../../tools/moreapps/!Word/EditDel';
import {mk, texts, C, SEL, S} from './edit-docs.mjs';

function setup(blocks = ['']) {
  const d = mk(blocks);
  const clock = {t: 0};
  const t = new Typing(d, {now: () => clock.t});
  return {d, t, clock};
}
/** Type each character of s in turn from sel; the final selection. */
function typeAll(t, sel, s, clock, gap = 50) {
  for (const ch of s) {
    clock.t += gap;
    sel = t.type(sel, ch);
  }
  return sel;
}

describe('Typing', () => {
  it('"hello" is one step', () => {
    const {d, t, clock} = setup();
    typeAll(t, C(d, 0, 0), 'hello', clock);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.deepEqual(texts(d), ['']);
  });
  it('"hello world" is two steps: "hello " and "world"', () => {
    const {d, t, clock} = setup();
    typeAll(t, C(d, 0, 0), 'hello world', clock);
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.deepEqual(texts(d), ['hello ']);
    d.undo();
    assert.deepEqual(texts(d), ['']);
    d.redo(); d.redo();
    assert.deepEqual(texts(d), ['hello world']);
  });
  it('several spaces stay with the word before', () => {
    const {d, t, clock} = setup();
    typeAll(t, C(d, 0, 0), 'a   b', clock);
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.deepEqual(texts(d), ['a   ']);
  });
  it('a pause of more than pauseMs starts a new step', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    clock.t += 1000;
    s = t.type(s, 'c');
    assert.equal(d.undoDepth, 1);
    clock.t += 1001;
    t.type(s, 'd');
    assert.equal(d.undoDepth, 2);
    assert.deepEqual(texts(d), ['abcd']);
  });
  it('pauseMs is settable', () => {
    const d = mk(['']);
    let now = 0;
    const t = new Typing(d, {now: () => now, pauseMs: 10});
    let s = t.type(C(d, 0, 0), 'a');
    now = 11;
    s = t.type(s, 'b');
    assert.equal(d.undoDepth, 2);
  });
  it('a caret move between keystrokes starts a new step', () => {
    const {d, t, clock} = setup(['xyz']);
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    clock.t += 50;
    s = t.type(C(d, 0, 4), 'c');
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.deepEqual(texts(d), ['abxyz']);
  });
  it('a selection made at the typing end starts a new step', () => {
    const {d, t, clock} = setup();
    typeAll(t, C(d, 0, 0), 'abc', clock);
    clock.t += 50;
    t.type(SEL(d, 0, 3, 0, 3 - 1), 'X');
    assert.equal(d.undoDepth, 2);
    assert.deepEqual(texts(d), ['abX']);
  });
  it('Enter and Backspace are separate steps', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    s = t.command(() => E.splitPara(d, s));
    assert.equal(d.undoDepth, 2);
    s = typeAll(t, s, 'cd', clock);
    assert.equal(d.undoDepth, 3);
    s = t.command(() => D.deleteBack(d, s));
    s = t.command(() => D.deleteBack(d, s));
    assert.equal(d.undoDepth, 5);
    assert.deepEqual(texts(d), ['ab', '']);
  });
  it('Backspace then typing is a new step', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'abc', clock);
    s = t.command(() => D.deleteBack(d, s));
    s = typeAll(t, s, 'XY', clock);
    assert.equal(d.undoDepth, 3);
    d.undo();
    assert.deepEqual(texts(d), ['ab']);
  });
  it('typing over a selection is a step of its own', () => {
    const {d, t, clock} = setup(['hello']);
    let s = t.type(SEL(d, 0, 1, 0, 4), 'X');
    assert.deepEqual(texts(d), ['hXo']);
    s = typeAll(t, s, 'yz', clock);
    assert.deepEqual(texts(d), ['hXyzo']);
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.deepEqual(texts(d), ['hXo']);
    d.undo();
    assert.deepEqual(texts(d), ['hello']);
  });
  it('text with \\n or \\t is not coalesced', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    s = t.type(s, 'c\nd');
    assert.equal(d.undoDepth, 2);
    s = t.type(s, 'e');
    assert.equal(d.undoDepth, 3);
    s = t.type(s, '\t');
    assert.equal(d.undoDepth, 4);
    s = t.type(s, 'f');
    assert.equal(d.undoDepth, 5);
    assert.deepEqual(texts(d), ['abc', 'de\tf']);
  });
  it('"\\n" typed is Enter', () => {
    const {d, t} = setup(['ab']);
    const s = t.type(C(d, 0, 1), '\n');
    assert.deepEqual(texts(d), ['a', 'b']);
    assert.equal(s.head.off, 0);
  });
  it('undo after "hello world" removes "world" first', () => {
    const {d, t, clock} = setup();
    typeAll(t, C(d, 0, 0), 'hello world', clock);
    d.undo();
    assert.deepEqual(texts(d), ['hello ']);
  });
  it('reset breaks, and the first call is a new step', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    t.reset();
    clock.t += 50;
    t.type(s, 'c');
    assert.equal(d.undoDepth, 2);
  });
  it('another Typing on the same Document does not merge', () => {
    const {d, t, clock} = setup();
    const s = typeAll(t, C(d, 0, 0), 'ab', clock);
    const t2 = new Typing(d, {now: () => clock.t});
    t2.type(s, 'c');
    assert.equal(d.undoDepth, 2);
  });
  it('empty text changes nothing and keeps the step open', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    assert.equal(t.type(s, ''), s);
    clock.t += 50;
    t.type(s, 'c');
    assert.equal(d.undoDepth, 1);
  });
  it('a pasted run starting with a letter after a space is new', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'a ', clock);
    clock.t += 50;
    s = t.type(s, 'bcd');
    assert.equal(d.undoDepth, 2);
    clock.t += 50;
    s = t.type(s, 'ef');
    assert.equal(d.undoDepth, 2);
  });
  it('command returns what fn returns', () => {
    const {d, t} = setup(['ab']);
    assert.equal(t.command(() => 42), 42);
  });
  it('overwrite typing is one step; undo restores the text', () => {
    const {d, t, clock} = setup(['wxyz']);
    let s = C(d, 0, 0);
    for (const ch of 'abc') {
      clock.t += 50;
      s = t.type(s, ch, {overwrite: true});
    }
    assert.deepEqual(texts(d), ['abcz']);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.deepEqual(texts(d), ['wxyz']);
  });
  it('switching overwrite on or off starts a new step', () => {
    const {d, t, clock} = setup(['wxyz']);
    let s = t.type(C(d, 0, 0), 'a', {overwrite: true});
    clock.t += 50;
    s = t.type(s, 'b', {overwrite: true});
    assert.equal(d.undoDepth, 1);
    clock.t += 50;
    s = t.type(s, 'c');
    assert.equal(d.undoDepth, 2);
    clock.t += 50;
    s = t.type(s, 'd', {overwrite: true});
    assert.equal(d.undoDepth, 3);
    assert.deepEqual(texts(d), ['abcdz']);
  });
  it('typing after undo is a new step', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    d.undo();
    s = C(d, 0, 0);
    clock.t += 50;
    s = t.type(s, 'c');
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(texts(d), ['c']);
    d.undo();
    assert.deepEqual(texts(d), ['']);
    assert.ok(d.canRedo);
  });
  it('same head but another affinity or goalX still joins', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    clock.t += 50;
    const head = s.head;
    s = t.type(S.caret(head, 'up'), 'c');
    assert.equal(d.undoDepth, 1);
    clock.t += 50;
    t.type({...s, goalX: 99}, 'd');
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(texts(d), ['abcd']);
  });
  it('CRLF and CR are Enter-like text, never joined', () => {
    const {d, t, clock} = setup();
    let s = typeAll(t, C(d, 0, 0), 'ab', clock);
    s = t.type(s, '\r\n');
    assert.equal(d.undoDepth, 2);
    s = t.type(s, 'c');
    assert.equal(d.undoDepth, 3);
    s = t.type(s, '\r');
    assert.equal(d.undoDepth, 4);
    s = t.type(s, 'd');
    assert.equal(d.undoDepth, 5);
    assert.deepEqual(texts(d), ['ab', 'c', 'd']);
  });
});
