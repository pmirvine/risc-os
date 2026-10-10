// InsertApply: the no-break space (Ctrl-Shift-Space), the no-break
// hyphen (Ctrl-Shift--) and the optional hyphen (Insert > Special
// character): text U+00A0 / a raw inline w:noBreakHyphen or
// w:softHyphen, the selection replaced, one undo step each, the caret
// after, the format of the text before, written in a run as Word
// does and read back, shown as '-' / nothing, no AutoFormat list.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insert} from '../../tools/moreapps/!Word/InsertApply';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {keymap} from '../../tools/moreapps/!Word/Keymap';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {mk, texts, P, C, SEL, at, undoable, valid, box, O, snap}
  from './edit-docs.mjs';
import {tm} from './word-docs.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {xmlEntries} from './docx-compare.mjs';
import {text as selText} from '../../tools/moreapps/!Word/Selection';
import {search, replaceAll} from '../../tools/moreapps/!Word/Find';
import {paraPlain} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {hyphenText, inlineText} from '../../tools/moreapps/!Word/InlineText';

const NB = '\xA0';
const node = (d, k, off) => P(d, k).inlines[off];
const DATE = new Date(Date.UTC(2026, 0, 1));

/** A command through EditApply.run: one undo step, exact undo. */
function go(id, d, sel, t = new Typing(d)) {
  const n = d.undoDepth;
  const out = undoable(d, () => run(id, d, t, sel));
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  return out;
}

describe('the keys of the special characters', () => {
  const key = (k, o = {}) => keymap.lookup({code: k.length === 1 ?
    k.charCodeAt(0) : 0, key: k, ctrl: true, shift: true, ...o});
  it('Ctrl-Shift-Space is nbsp, Ctrl-Space still clears formatting', () => {
    assert.equal(key(' '), 'nbsp');
    assert.equal(key(' ', {shift: false}), 'clearFormat');
    assert.equal(key(' ', {ctrl: false}), null);
    assert.equal(keymap.labelFor('nbsp'), 'Ctrl+Shift+Space');
  });
  it('Ctrl-Shift-- is nbHyphen, as the browser names it: "_" with Shift', () => {
    assert.equal(key('_'), 'nbHyphen');
    assert.equal(key('-'), 'nbHyphen');
    assert.equal(key('-', {shift: false}), null);
    assert.equal(key('_', {shift: false}), null);
    assert.equal(key('-', {ctrl: false}), null);
    assert.equal(keymap.labelFor('nbHyphen'), 'Ctrl+Shift+-');
  });
  it('Optional hyphen has no key; none of the keys is taken twice', () => {
    assert.equal(keymap.labelFor('softHyphen'), '');
    assert.equal(keymap.row('softHyphen').menu, 'Insert');
    for (const [k, id] of [['l', 'bullets'], ['m', 'indentLess']]) assert.equal(key(k), id);
  });
});

describe('InsertApply: nbsp', () => {
  it('puts U+00A0 in as text, the caret after it', () => {
    const d = mk(['abcd']);
    const s = go('nbsp', d, C(d, 0, 2));
    assert.deepEqual(texts(d), ['ab' + NB + 'cd']);
    assert.deepEqual(at(d, s), [0, 3]);
    assert.deepEqual(P(d, 0).inlines, {});
    valid(d);
  });
  it('replaces a selection (across paragraphs), one step', () => {
    const d = mk(['abc', 'mid', 'def']);
    const s = go('nbsp', d, SEL(d, 0, 1, 2, 2));
    assert.deepEqual(texts(d), ['a' + NB + 'f']);
    assert.deepEqual(at(d, s), [0, 2]);
  });
  it('keeps the format of the text before it, and a list item', () => {
    const bold = {b: true, extra: []};
    const d = mk([['ab', {runs: [{start: 0, end: 2, rPr: bold}]}]]);
    go('nbsp', d, C(d, 0, 2));
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 3, rPr: bold}]);
  });
  it('by a table: an empty paragraph there first', () => {
    const d = mk(['a', box()]);
    go('nbsp', d, C(d, 1, 1));
    assert.deepEqual(texts(d), ['a', '#', NB]);
  });
  it('after "1." it is not a Space: the paragraph stays plain', () => {
    const d = mk(['1.']);
    go('nbsp', d, C(d, 0, 2));
    assert.deepEqual(texts(d), ['1.' + NB]);
    assert.equal(P(d, 0).pPr.numPr, undefined);
  });
  it('a position that is not in the document changes nothing', () => {
    const d = mk(['ab']);
    const t = new Typing(d);
    const bad = {anchor: {id: 999, off: 0}, head: {id: 999, off: 0}};
    const n = d.undoDepth;
    assert.equal(insert('nbsp', d, t, bad), bad);
    assert.equal(insert('nbsp', d, t, null), undefined);
    assert.equal(d.undoDepth, n);
    assert.equal(d.dirty, false);
  });
  it('500 in a row make 500 steps and undo exactly', () => {
    const d = mk(['x']);
    const t = new Typing(d), before = snap(d);
    let s = C(d, 0, 1);
    for (let i = 0; i < 500; i++) s = run('nbsp', d, t, s);
    assert.equal(P(d, 0).text.length, 501);
    for (let i = 0; i < 500; i++) d.undo();
    assert.deepEqual(snap(d), before);
  });
});

describe('InsertApply: nbHyphen and softHyphen', () => {
  const cases = [['nbHyphen', 'w:noBreakHyphen'], ['softHyphen', 'w:softHyphen']];
  for (const [id, name] of cases) {
    it(`${id}: a raw level-r inline ${name}, one U+FFFC, the caret after it`, () => {
      const d = mk(['abcd']);
      const s = go(id, d, C(d, 0, 2));
      assert.deepEqual(texts(d), ['ab' + O + 'cd']);
      assert.equal(node(d, 0, 2).kind, 'raw');
      assert.equal(node(d, 0, 2).level, 'r');
      assert.equal(node(d, 0, 2).node.name, name);
      assert.deepEqual(node(d, 0, 2).node.children, []);
      assert.deepEqual(at(d, s), [0, 3]);
      valid(d);
    });
    it(`${id}: replaces a selection, takes the format before it`, () => {
      const bold = {b: true, extra: []};
      const d = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}], 'x']);
      go(id, d, SEL(d, 0, 1, 1, 1));
      assert.deepEqual(texts(d), ['a' + O + '']);
      assert.deepEqual(P(d, 0).runs, [{start: 0, end: 2, rPr: bold}]);
    });
    it(`${id}: by a table; at both ends; unknown position changes nothing`, () => {
      const d = mk([box(), 'z']);
      go(id, d, C(d, 0, 0));
      assert.deepEqual(texts(d), [O, '#', 'z']);
      const e = mk(['ab']);
      go(id, e, C(e, 0, 0));
      go(id, e, C(e, 0, 3));
      assert.deepEqual(texts(e), [O + 'ab' + O]);
      const bad = {anchor: {id: 999, off: 0}, head: {id: 999, off: 0}};
      assert.equal(insert(id, e, new Typing(e), bad), bad);
    });
    it(`${id}: written in the run as <${name}/> and read back`, async () => {
      const bold = {b: true, extra: []};
      const d = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}]]);
      go(id, d, C(d, 0, 2));
      const bytes = await writeDocx(d.doc, {date: DATE});
      const root = (await xmlEntries(bytes)).get('word/document.xml').root;
      const found = [];
      const walk = (x, par) => {
        if (!x || typeof x !== 'object') return;
        if (x.name === name) found.push([x.attrs.length, x.children.length, par && par.name,
          par && par.children.some((c) => c && c.name === 'w:rPr')]);
        for (const c of x.children || []) walk(c, x);
      };
      walk(root, null);
      assert.deepEqual(found, [[0, 0, 'w:r', true]]);
      const back = await readDocx(bytes);
      const q = back.sections[0].blocks[0];
      assert.equal(q.text, 'ab' + O + 'cd');
      assert.equal(q.inlines[2].node.name, name);
      assert.equal(q.inlines[2].level, 'r');
    });
  }
  it('drawn: the no-break hyphen as "-", the optional hyphen as nothing', () => {
    const d = mk(['ab', 'ab']);
    go('nbHyphen', d, C(d, 0, 1));
    go('softHyphen', d, C(d, 1, 1));
    const L = new DocLayout(d.doc, tm());
    L.layout(800);
    const shown = (i) => L.items[i].lines.flatMap((l) => l.items).map((x) => x.text ?? '').join('');
    assert.equal(shown(0).replace(/\s/g, ''), 'a-b');
    assert.equal(shown(1).replace(/\s/g, ''), 'ab');
  });
  it('copy and paste within and across documents keep the hyphen', () => {
    const d = mk(['abcd']);
    go('nbHyphen', d, C(d, 0, 2));
    const c = slice(d.doc, SEL(d, 0, 1, 0, 4));
    const e = mk(['xy']);
    undoable(e, () => pasteBlocks(e, C(e, 0, 1), c.blocks, {sameDoc: false, styleNames: c.styleNames}));
    assert.equal(P(e, 0).text.length, 5);
    const x = Object.values(P(e, 0).inlines);
    assert.deepEqual(x.map((y) => [y.kind, y.level, y.node.name]), [['raw', 'r', 'w:noBreakHyphen']]);
    valid(e);
    // and the same document
    undoable(d, () => pasteBlocks(d, C(d, 0, 4), c.blocks, {sameDoc: true}));
    assert.equal(Object.keys(P(d, 0).inlines).length, 2);
    // a hyphen with attributes or content is not ours: it goes across documents
    const odd = {kind: 'raw', level: 'r', node: {name: 'w:noBreakHyphen', attrs: [['w:x', '1']], children: []}};
    const f = mk(['ab']);
    const blk = [{...slice(f.doc, SEL(f, 0, 0, 0, 2)).blocks[0], text: 'a' + O, runs: [{start: 0, end: 2, rPr: {extra: []}}], inlines: {1: odd}}];
    const g = mk(['q']);
    undoable(g, () => pasteBlocks(g, C(g, 0, 1), blk, {sameDoc: false, styleNames: new Map()}));
    assert.deepEqual(texts(g), ['qa']);
  });
  it('a file with Word\'s own hyphens round-trips untouched', async () => {
    const xml = documentXml(p(r('a') + '<w:r><w:noBreakHyphen/></w:r>' + r('b') + '<w:r><w:softHyphen/></w:r>'));
    const doc = await readDocx(await buildDocx({'word/document.xml': xml}));
    const b = doc.sections[0].blocks[0];
    assert.equal(b.text, 'a' + O + 'b' + O);
    assert.deepEqual(Object.values(b.inlines).map((x) => x.node.name), ['w:noBreakHyphen', 'w:softHyphen']);
  });
});

describe('the text of a hyphen inline: one rule for Selection, clipboard and Find', () => {
  const well = () => {
    const d = mk(['well', 'known fact']);
    run('nbHyphen', d, new Typing(d), C(d, 0, 4));
    run('softHyphen', d, new Typing(d), C(d, 1, 5));
    return d;
  };
  it('InlineText: - for a no-break hyphen, nothing for an optional one, tabs and breaks as ever', () => {
    const d = well();
    assert.equal(hyphenText(node(d, 0, 4)), '-');
    assert.equal(hyphenText(node(d, 1, 5)), '');
    assert.equal(inlineText(node(d, 0, 4)), '-');
    assert.equal(inlineText({kind: 'tab'}), '\t');
    assert.equal(inlineText({kind: 'br'}), '\n');
    assert.equal(inlineText({kind: 'raw', level: 'p', text: 'link'}), 'link');
    assert.equal(inlineText(undefined), '');
    for (const x of [{kind: 'raw', level: 'r', node: {name: 'w:noBreakHyphen', attrs: [['w:x', '1']], children: []}},
      {kind: 'raw', level: 'r', node: {name: 'w:noBreakHyphen', attrs: [], children: ['x']}},
      {kind: 'raw', level: 'p', node: {name: 'w:noBreakHyphen', attrs: [], children: []}},
      {kind: 'raw', level: 'r', node: {name: 'w:t', attrs: [], children: []}}, null, undefined, {}]) assert.equal(hyphenText(x), null);
  });
  it('copying "well-known" gives a hyphen (plain text and HTML); the optional hyphen is nothing', () => {
    const d = well();
    const c = slice(d.doc, SEL(d, 0, 0, 1, 11));
    assert.equal(paraPlain(c.blocks[0]), 'well-');
    assert.equal(paraPlain(c.blocks[1]), 'known fact');
    const html = toHtml(d.doc, c);
    assert.ok(html.includes('well-'), html);
    assert.ok(!html.includes(O));
  });
  it('Selection.text has the hyphen too', () => {
    const d = well();
    const L = new DocLayout(d.doc, tm());
    L.layout(800);
    assert.equal(selText(SEL(d, 0, 0, 0, 5), L), 'well-');
    assert.equal(selText(SEL(d, 1, 0, 1, 6), L), 'known');
  });
  it('Find: "-" and "well-known" match the no-break hyphen inline; a match holding it is never replaced', () => {
    const d = mk(['well', 'known']);
    const t = new Typing(d);
    run('nbHyphen', d, t, C(d, 0, 4));
    const m = search(d.doc, {s: 0, i: 0, off: 0}, '-', {});
    assert.deepEqual([m.i, m.from, m.to, m.inInline], [0, 4, 5, true]);
    const w = search(d.doc, {s: 0, i: 0, off: 0}, 'well-', {});
    assert.deepEqual([w.from, w.to, w.inInline], [0, 5, true]);
    assert.equal(search(d.doc, {s: 0, i: 0, off: 0}, 'wellknown', {}), null);
    const before = snap(d);
    const r = replaceAll(d, '-', '_', {});
    assert.deepEqual([r.count, r.skipped], [0, 1]);
    assert.deepEqual(snap(d), before);
  });
});

describe('the hyphens take the pending format (Ctrl-B, hyphen, type)', () => {
  for (const id of ['nbHyphen', 'softHyphen']) {
    it(`${id}: the inline is bold, and so is what is typed next`, () => {
      const d = mk(['ab']);
      const t = new Typing(d);
      const arg = {rPr: {b: true}, rStyle: undefined};
      const s = undoable(d, () => run(id, d, t, C(d, 0, 1), {arg}));
      const r = P(d, 0).runs;
      assert.deepEqual(r.map((x) => [x.start, x.end, !!x.rPr.b]), [[0, 1, false], [1, 2, true], [2, 3, false]]);
      const s2 = t.type(s, 'x', {});
      assert.equal(P(d, 0).text, 'a' + O + 'xb');
      assert.deepEqual(P(d, 0).runs.map((x) => [x.start, x.end, !!x.rPr.b]), [[0, 1, false], [1, 3, true], [3, 4, false]]);
      assert.ok(s2);
    });
    it(`${id}: no pending format is the text before it, as ever`, () => {
      const d = mk([['ab', {runs: [{start: 0, end: 2, rPr: {b: true, extra: []}}]}]]);
      run(id, d, new Typing(d), C(d, 0, 1), {arg: {rPr: undefined, rStyle: undefined}});
      assert.ok(P(d, 0).runs.every((x) => x.rPr.b));
    });
  }
});
