// ChangeCase: Format > Change case and Shift-F3. Lengths never change
// (sharp s, Turkish dotted capital I, ligatures left as they are), the
// final sigma, surrogate pairs and emoji, inlines and runs kept, the
// sentence rule (. ! ? then white space, closers, digits), title case
// with apostrophes and hyphens, toggle, the cycle upper -> lower ->
// title, a caret takes the word it is in, one undo step, none when
// nothing changes, 50,000 paragraphs, through FormatApply and Keymap.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {changeCase, caseState, MODES} from '../../tools/moreapps/!Word/ChangeCase';
import {apply, isFormat} from '../../tools/moreapps/!Word/FormatApply';
import {keymap} from '../../tools/moreapps/!Word/Keymap';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {mk, texts, P, C, SEL, undoable, valid, box, O, snap, S} from './edit-docs.mjs';
import {blockId} from '../../tools/moreapps/!Word/DocPos';

const bold = {b: true, extra: []}, plain = {extra: []};

/** Run mode over the whole text of a one-paragraph document. */
function one(text, mode, opts) {
  const d = mk([text]);
  undoable(d, () => changeCase(d, new Typing(d), SEL(d, 0, 0, 0, text.length), mode));
  return d.doc.sections[0].blocks[0].text;
}
const cases = (text, mode) => one(text, mode);

describe('ChangeCase: upper, lower, toggle', () => {
  it('ASCII and accented letters', () => {
    assert.equal(cases('Hello World 123', 'upper'), 'HELLO WORLD 123');
    assert.equal(cases('Hello World 123', 'lower'), 'hello world 123');
    assert.equal(cases('café ÉCOLE', 'upper'), 'CAFÉ ÉCOLE');
    assert.equal(cases('café ÉCOLE', 'lower'), 'café école');
    assert.equal(cases('Hello wORLD', 'toggle'), 'hELLO World');
    assert.equal(cases('', 'upper'), '');
  });
  it('the sharp s stays when capitals are asked for (no change of length)', () => {
    assert.equal(cases('straße', 'upper'), 'STRAßE');
    assert.equal(cases('STRASSE', 'lower'), 'strasse');
    assert.equal(cases('Straße', 'toggle'), 'sTRAßE');
    for (const m of MODES) assert.equal(cases('Straße', m).length, 6);
  });
  it('the Turkish dotted capital I and the dotless i; ligatures; an apostrophe-n', () => {
    assert.equal(cases('İSTANBUL', 'lower'), 'İstanbul');
    assert.equal(cases('ısı', 'upper'), 'ISI');
    assert.equal(cases('ﬁnd', 'upper'), 'ﬁND');
    assert.equal(cases('ŉ', 'upper'), 'ŉ');
    assert.equal(cases('ǅ', 'lower'), 'ǆ');
  });
  it('Greek: a capital sigma at the end of a word becomes the final sigma, elsewhere sigma', () => {
    assert.equal(cases('ΟΔΟΣ', 'lower'), 'οδος');
    assert.equal(cases('ΣΟΦΟΣ Σ', 'lower'), 'σοφος σ');
    assert.equal(cases('οδος', 'upper'), 'ΟΔΟΣ');
    // the context is the whole paragraph: a selection ending mid-word does not make a final sigma
    const d = mk(['ΟΔΟΣΑ']);
    changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 4), 'lower');
    assert.equal(P(d, 0).text, 'οδοσΑ');
  });
  it('emoji, surrogate pairs and marks are not broken', () => {
    assert.equal(cases('a\u{1F600}b', 'upper'), 'A\u{1F600}B');
    assert.equal(cases('\u{1F44D}\u{1F3FD} ok', 'upper'), '\u{1F44D}\u{1F3FD} OK');
    assert.equal(cases('x\u{10428}y', 'upper'), 'X\u{10400}Y');
    assert.equal(cases('\u{10428}\u{10429}', 'upper'), '\u{10400}\u{10401}');
    assert.equal(cases('\u{10400}', 'lower'), '\u{10428}');
    assert.equal(cases('é', 'upper'), 'É');
    const d = mk(['x\u{10428}\u{10429}y']);
    undoable(d, () => changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 6), 'upper'));
    valid(d);
  });
  it('no-op: nothing changes, no undo step, no dirty mark', () => {
    const d = mk(['ABC 123', '中文']);
    const t = new Typing(d), n = d.undoDepth;
    const sel = SEL(d, 0, 0, 1, 2);
    const r = changeCase(d, t, sel, 'upper');
    assert.equal(d.undoDepth, n);
    assert.equal(d.dirty, false);
    assert.equal(r.sel, sel);
  });
  it('a bad mode is a RangeError and changes nothing', () => {
    const d = mk(['abc']);
    for (const m of ['', 'Upper', undefined, null, 5, '__proto__', 'toString']) {
      assert.throws(() => changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 3), m), RangeError, String(m));
    }
    assert.equal(d.undoDepth, 0);
  });
});

describe('ChangeCase: sentence case', () => {
  it('capitals after . ! ? and white space, the rest small', () => {
    assert.equal(cases('hELLO wORLD. tHIS is a test! wHAT? yes.', 'sentence'), 'Hello world. This is a test! What? Yes.');
    assert.equal(cases('ONE.  TWO.\tTHREE.', 'sentence'), 'One.  Two.\tThree.');
  });
  it('no white space after the stop, no new sentence', () => {
    assert.equal(cases('A.B C. d', 'sentence'), 'A.b c. D');
    assert.equal(cases('PI IS 3.14. OK', 'sentence'), 'Pi is 3.14. Ok');
  });
  it('quotes and brackets before the letter and after the stop do not matter', () => {
    assert.equal(cases('"hello." she said. (nice) ok', 'sentence'), '"Hello." She said. (Nice) ok');
    assert.equal(cases('“why?” he asked', 'sentence'), '“Why?” He asked');
  });
  it('a digit ends the wait', () => {
    assert.equal(cases('3 APPLES. 4 PEARS', 'sentence'), '3 apples. 4 pears');
    assert.equal(cases('1. first. 2. second', 'sentence'), '1. First. 2. Second');
  });
  it('each paragraph starts a sentence; the start of a partial selection does too', () => {
    const d = mk(['alpha. beta', 'gamma. delta', 'eps. zeta']);
    undoable(d, () => changeCase(d, new Typing(d), SEL(d, 0, 3, 2, 6), 'sentence'));
    assert.deepEqual(texts(d), ['alpHa. Beta', 'Gamma. Delta', 'Eps. Zeta']);
  });
  it('an inline between the stop and the word is white space? no: it is neutral', () => {
    const d = mk([['a. ' + O + 'b', {inlines: {3: {kind: 'raw', level: 'r', node: {name: 'w:x', attrs: [], children: []}}}}]]);
    changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 5), 'sentence');
    assert.equal(P(d, 0).text, 'A. ' + O + 'B');
  });
});

describe('ChangeCase: title case', () => {
  it('a capital at the start of each word, the rest small', () => {
    assert.equal(cases('the QUICK brown fOX', 'title'), 'The Quick Brown Fox');
    assert.equal(cases('  two  spaces ', 'title'), '  Two  Spaces ');
  });
  it('apostrophes inside a word stay in it; hyphens and slashes start words', () => {
    assert.equal(cases("don't STOP me", 'title'), "Don't Stop Me");
    assert.equal(cases('o’neil’s book', 'title'), 'O’neil’s Book');
    assert.equal(cases("'tis the 'season'", 'title'), "'Tis The 'Season'");
    assert.equal(cases('well-known a/b', 'title'), 'Well-Known A/B');
  });
  it('a word that starts with a digit keeps its letters small', () => {
    assert.equal(cases('3RD place, 1st DAY', 'title'), '3rd Place, 1st Day');
  });
});

describe('ChangeCase: the cycle', () => {
  it('capitals -> small -> Title -> capitals, from what the text is now', () => {
    const d = mk(['hello wORLD']);
    const t = new Typing(d), sel = SEL(d, 0, 0, 0, 11);
    const seq = [];
    for (let i = 0; i < 5; i++) {
      changeCase(d, t, sel, 'cycle');
      seq.push(P(d, 0).text);
    }
    assert.deepEqual(seq, ['HELLO WORLD', 'hello world', 'Hello World', 'HELLO WORLD', 'hello world']);
  });
  it('caseState', () => {
    assert.equal(caseState(['ABC', 'DEF']), 'upper');
    assert.equal(caseState(['abc']), 'lower');
    assert.equal(caseState(['Abc Def']), 'title');
    assert.equal(caseState(['Abc def']), 'mixed');
    assert.equal(caseState(['abC']), 'mixed');
    assert.equal(caseState(['123 ...']), 'mixed');
    assert.equal(caseState(['Don’t']), 'title');
    assert.equal(caseState(['A']), 'upper');
    assert.equal(caseState(['', 'x']), 'lower');
  });
  it('over several paragraphs the state is of all of them; one undo step', () => {
    const d = mk(['ABC', 'def']);
    undoable(d, () => changeCase(d, new Typing(d), SEL(d, 0, 0, 1, 3), 'cycle'));
    assert.deepEqual(texts(d), ['ABC', 'DEF']);
  });
  it('no letters: nothing happens', () => {
    const d = mk(['12 34']);
    changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 5), 'cycle');
    assert.equal(d.undoDepth, 0);
  });
});

describe('ChangeCase: the cycle is never stuck on a step that changes nothing', () => {
  it('3rd: no Title Case form, so small goes straight on to capitals, then small again', () => {
    const d = mk(['a 3rd b']);
    const seq = [];
    for (let i = 0; i < 4; i++) {
      changeCase(d, new Typing(d), C(d, 0, 3), 'cycle');
      seq.push(P(d, 0).text);
    }
    assert.deepEqual(seq, ['a 3RD b', 'a 3rd b', 'a 3RD b', 'a 3rd b']);
  });
  it('the fi ligature at the start of a word: Title Case cannot capitalise it, capitals go on', () => {
    const d = mk(['\uFB01nd it']);
    const seq = [];
    for (let i = 0; i < 4; i++) {
      changeCase(d, new Typing(d), C(d, 0, 2), 'cycle');
      seq.push(P(d, 0).text);
    }
    assert.deepEqual(seq, ['\uFB01ND it', '\uFB01nd it', '\uFB01ND it', '\uFB01nd it']);
  });
  it('a text with no case at all still does nothing, whichever step', () => {
    const d = mk(['12 \u00DF']);
    changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 4), 'cycle');
    assert.equal(d.undoDepth, 0);
  });
});

describe('ChangeCase: a caret takes its word', () => {
  it('in a word, at its start, at its end; the caret stays', () => {
    for (const off of [4, 5, 7, 9]) {
      const d = mk(['the quick fox']);
      const sel = C(d, 0, off);
      const r = undoable(d, () => changeCase(d, new Typing(d), sel, 'upper'));
      assert.equal(P(d, 0).text, 'the QUICK fox', String(off));
      assert.equal(r.sel, sel);
    }
  });
  it('not in a word (between spaces, an empty paragraph, a table): nothing', () => {
    const d = mk(['a   b', '', box()]);
    const t = new Typing(d);
    for (const [k, off] of [[0, 2], [1, 0], [2, 0]]) {
      const r = changeCase(d, t, C(d, k, off), 'upper');
      assert.ok(r.sel);
    }
    assert.deepEqual(texts(d), ['a   b', '', '#']);
    assert.equal(d.undoDepth, 0);
  });
  it('the cycle works on the word at the caret', () => {
    const d = mk(['say hello now']);
    const t = new Typing(d);
    const seq = [];
    for (let i = 0; i < 4; i++) {
      changeCase(d, t, C(d, 0, 6), 'cycle');
      seq.push(P(d, 0).text);
    }
    assert.deepEqual(seq, ['say Hello now', 'say HELLO now', 'say hello now', 'say Hello now']);
  });
  it('sentence on a caret word capitalises it', () => {
    const d = mk(['say hELLO now']);
    changeCase(d, new Typing(d), C(d, 0, 5), 'sentence');
    assert.equal(P(d, 0).text, 'say Hello now');
  });
});

describe('ChangeCase: structure is kept', () => {
  it('runs and inlines: only the text changes, the model is otherwise the same', () => {
    const link = {kind: 'raw', level: 'p', node: {name: 'w:hyperlink', attrs: [], children: []}, text: 'a link'};
    const d = mk([['Hello ' + O + ' wor ld', {runs: [{start: 0, end: 3, rPr: bold}, {start: 3, end: 8, rPr: plain}, {start: 8, end: 14, rPr: bold}],
      inlines: {6: link}}]]);
    const before = P(d, 0);
    undoable(d, () => changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 14), 'upper'));
    const after = P(d, 0);
    assert.equal(after.text, 'HELLO ' + O + ' WOR LD');
    assert.deepEqual(after.runs, before.runs);
    assert.deepEqual(after.inlines, before.inlines);
    assert.equal(after.id, before.id);
    assert.deepEqual(after.pPr, before.pPr);
  });
  it('only the changed stretch is touched: one spliceText from the first to the last change', () => {
    const d = mk([['ab CD ef', {runs: [{start: 0, end: 3, rPr: bold}, {start: 3, end: 8, rPr: plain}]}]]);
    let ops = null;
    d.on('change', (ev) => { ops = ev.ops; });
    changeCase(d, new Typing(d), SEL(d, 0, 0, 0, 8), 'upper');
    const flat = (o) => (o.op === 'compound' ? o.ops.flatMap(flat) : [o]);
    const list = ops.flatMap(flat);
    assert.deepEqual(list.map((o) => [o.op, o.at, o.del, o.content.text]), [['spliceText', 0, 8, 'AB CD EF']]);
  });
  it('kept blocks and paragraphs outside the selection are untouched', () => {
    const d = mk(['one', box(), 'two', 'three']);
    const b = snap(d);
    undoable(d, () => changeCase(d, new Typing(d), SEL(d, 0, 0, 2, 3), 'upper'));
    assert.deepEqual(texts(d), ['ONE', '#', 'TWO', 'three']);
    assert.deepEqual(snap(d)[0].blocks[1], b[0].blocks[1]);
  });
  it('the selection is returned as it was; a pending format with a selection is gone', () => {
    const d = mk(['abc']);
    const sel = SEL(d, 0, 2, 0, 0);
    const r = changeCase(d, new Typing(d), sel, 'upper', {i: true});
    assert.equal(r.sel, sel);
    assert.deepEqual(r.pending, {});
    const c = C(d, 0, 1);
    assert.deepEqual(changeCase(d, new Typing(d), c, 'lower', {i: true}).pending, {i: true});
  });
  it('it ends the typing step: typed text and the change are two undo steps', () => {
    const d = mk(['ab']);
    const t = new Typing(d);
    const s = t.type(C(d, 0, 2), 'cd');
    changeCase(d, t, SEL(d, 0, 0, 0, 4), 'upper');
    assert.equal(d.undoDepth, 2);
    d.undo();
    assert.equal(P(d, 0).text, 'abcd');
  });
});

describe('ChangeCase: through FormatApply and the keys', () => {
  it('changeCase and caseCycle are format ids; the arg is the mode', () => {
    assert.ok(isFormat('changeCase') && isFormat('caseCycle'));
    const d = mk(['abc def']);
    const t = new Typing(d);
    let r = apply('changeCase', d, t, SEL(d, 0, 0, 0, 7), 'title');
    assert.equal(P(d, 0).text, 'Abc Def');
    assert.ok(r.sel && r.pending);
    apply('caseCycle', d, t, SEL(d, 0, 0, 0, 7));
    assert.equal(P(d, 0).text, 'ABC DEF');
    assert.throws(() => apply('changeCase', d, t, SEL(d, 0, 0, 0, 7), 'nope'), RangeError);
    assert.throws(() => apply('changeCase', d, t, SEL(d, 0, 0, 0, 7)), RangeError);
  });
  it('Shift-F3 is caseCycle (the Wimp code &193 with a name, or F3 with Shift), not Find', () => {
    assert.equal(keymap.lookup({code: 0x193, key: 'F3', shift: true}), 'caseCycle');
    assert.equal(keymap.lookup({code: 0x183, key: 'F3'}), 'saveBox');
    assert.equal(keymap.lookup({code: 0x193, shift: true}), 'caseCycle');
    assert.equal(keymap.lookup({code: 0x1A3, key: 'F3', ctrl: true}), null);
    assert.equal(keymap.labelFor('caseCycle'), 'Shift+F3');
    assert.equal(keymap.row('caseCycle').menu, 'Format');
  });
});

describe('ChangeCase: many paragraphs, each mode', () => {
  for (const mode of ['sentence', 'title', 'toggle', 'cycle']) {
    it(`50,000 paragraphs: ${mode} in under 2 s, one step, undo exact`, () => {
      const words = ['alpha beta gamma.', 'Delta EPSILON zeta', 'eta, theta! iota?', "don't \u00DFeta \u00C9clair"];
      const d = mk(Array.from({length: 50000}, (_, i) => words[i % 4]));
      const before = snap(d), t = new Typing(d);
      const t0 = performance.now();
      changeCase(d, t, SEL(d, 0, 0, 49999, P(d, 49999).text.length), mode);
      assert.ok(performance.now() - t0 < 2000, `${mode} ${performance.now() - t0} ms`);
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.deepEqual(snap(d), before);
    });
  }
});

describe('ChangeCase: many paragraphs', () => {
  it('50,000 paragraphs: upper in under 2 s, one undo step, undo exact', () => {
    const words = ['alpha beta gamma.', 'Delta EPSILON zeta', 'eta, theta! iota?', 'kappa ßeta Éclair'];
    const d = mk(Array.from({length: 50000}, (_, i) => words[i % 4]));
    const t = new Typing(d), before = snap(d);
    const last = P(d, 49999);
    const t0 = performance.now();
    changeCase(d, t, SEL(d, 0, 0, 49999, last.text.length), 'upper');
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `${ms} ms`);
    assert.equal(d.undoDepth, 1);
    assert.equal(P(d, 3).text, 'KAPPA ßETA ÉCLAIR');
    const t1 = performance.now();
    d.undo();
    assert.ok(performance.now() - t1 < 2000);
    assert.deepEqual(snap(d), before);
  });
});
