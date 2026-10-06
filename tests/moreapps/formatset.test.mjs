// FormatSet: the character and paragraph formatting commands.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FS from '../../tools/moreapps/!Word/FormatSet';
import * as F from '../../tools/moreapps/!Word/Format';
import * as Pd from '../../tools/moreapps/!Word/Pending';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {addStyle} from '../../tools/moreapps/!Word/Styles';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {mk, P, C, SEL, texts, undoable, valid, snap, box, raw, O,
  bold, plain} from './edit-docs.mjs';
import {mkDoc} from './word-docs.mjs';
import {runFmt, paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {buildDocx, documentXml} from './build-docx.mjs';
import {changes} from '../../tools/moreapps/!Word/FormatOps';

const two = (t1, t2, r2 = bold) => [t1 + t2, {runs: [
  {start: 0, end: t1.length, rPr: plain},
  {start: t1.length, end: t1.length + t2.length, rPr: r2}]}];
const T = (d) => new Typing(d);
/** Run a command over the selection; one undo step, undo exact. */
const run = (d, fn) => undoable(d, () => fn(T(d)));
const rPrs = (p) => p.runs.map((r) => [r.start, r.end, r.rPr]);

describe('FormatSet.toggle', () => {
  it('none bold -> all bold; all bold -> plain', () => {
    const d = mk(['abc']);
    const sel = SEL(d, 0, 0, 0, 3);
    const out = run(d, (t) => FS.toggle(d, t, sel, 'bold'));
    assert.equal(out.sel, sel);
    assert.deepEqual(out.pending, {});
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 3, rPr: bold}]);
    run(d, (t) => FS.toggle(d, t, sel, 'bold'));
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 3, rPr: plain}]);
    assert.equal(d.undoDepth, 2);
  });
  it('mixed -> all bold (Word rule)', () => {
    const d = mk([two('ab', 'cd')]);
    run(d, (t) => FS.toggle(d, t, SEL(d, 0, 1, 0, 4), 'bold'));
    assert.deepEqual(rPrs(P(d, 0)), [[0, 1, plain], [1, 4, bold]]);
  });
  it('a heading: un-bolding writes b:false, re-bolding removes it',
    () => {
      const d = mk([['Head', {pStyle: 'Heading1'}]]);
      const sel = SEL(d, 0, 0, 0, 4);
      run(d, (t) => FS.toggle(d, t, sel, 'bold'));
      assert.deepEqual(P(d, 0).runs[0].rPr, {b: false, extra: []});
      assert.equal(F.query(d.doc, sel).bold, false);
      run(d, (t) => FS.toggle(d, t, sel, 'bold'));
      assert.deepEqual(P(d, 0).runs[0].rPr, plain);
    });
  it('part of a paragraph: runs split, and toggling twice restores',
    () => {
      const d = mk([two('abc', 'def', {i: true, extra: []})]);
      const before = snap(d);
      const sel = SEL(d, 0, 2, 0, 4);
      run(d, (t) => FS.toggle(d, t, sel, 'bold'));
      assert.deepEqual(rPrs(P(d, 0)), [[0, 2, plain], [2, 3, bold],
        [3, 4, {i: true, b: true, extra: []}],
        [4, 6, {i: true, extra: []}]]);
      run(d, (t) => FS.toggle(d, t, sel, 'bold'));
      assert.deepEqual(snap(d), before);
    });
  it('underline, strike, italic', () => {
    const d = mk(['abc', ['x', {rPr: {u: 'double', extra: []}}]]);
    const sel = SEL(d, 0, 0, 0, 3);
    run(d, (t) => FS.toggle(d, t, sel, 'underline'));
    assert.deepEqual(P(d, 0).runs[0].rPr, {u: 'single', extra: []});
    run(d, (t) => FS.toggle(d, t, sel, 'underline'));
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
    run(d, (t) => FS.toggle(d, t, SEL(d, 1, 0, 1, 1), 'underline'));
    assert.deepEqual(P(d, 1).runs[0].rPr, plain);
    run(d, (t) => FS.toggle(d, t, sel, 'strike'));
    run(d, (t) => FS.toggle(d, t, sel, 'italic'));
    assert.deepEqual(P(d, 0).runs[0].rPr, {strike: true, i: true,
      extra: []});
  });
  it('superscript and subscript exclude each other', () => {
    const d = mk(['abc']);
    const sel = SEL(d, 0, 0, 0, 3);
    run(d, (t) => FS.toggle(d, t, sel, 'superscript'));
    assert.equal(P(d, 0).runs[0].rPr.vertAlign, 'superscript');
    run(d, (t) => FS.toggle(d, t, sel, 'subscript'));
    assert.equal(P(d, 0).runs[0].rPr.vertAlign, 'subscript');
    assert.equal(F.query(d.doc, sel).vert, 'subscript');
    run(d, (t) => FS.toggle(d, t, sel, 'subscript'));
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
  });
  it('across three paragraphs and a table: one undo step', () => {
    const d = mk(['abc', box(), 'def', 'ghi']);
    run(d, (t) => FS.toggle(d, t, SEL(d, 0, 1, 3, 1), 'bold'));
    assert.deepEqual(rPrs(P(d, 0)), [[0, 1, plain], [1, 3, bold]]);
    assert.deepEqual(rPrs(P(d, 2)), [[0, 3, bold]]);
    assert.deepEqual(rPrs(P(d, 3)), [[0, 1, bold], [1, 3, plain]]);
    assert.equal(d.undoDepth, 1);
  });
  it('inline wrappers and fields: raw nodes untouched', () => {
    const link = raw('hyperlink', 'p', 'link');
    const fld = raw('fldChar', 'r');
    const d = mk([['a' + O + 'b' + O, {inlines: {1: link, 3: fld}}]]);
    const nodes = [P(d, 0).inlines[1].node, P(d, 0).inlines[3].node];
    const before = structuredClone(P(d, 0).inlines);
    run(d, (t) => FS.toggle(d, t, SEL(d, 0, 0, 0, 4), 'bold'));
    assert.deepEqual(P(d, 0).inlines, before);
    assert.equal(P(d, 0).inlines[1].node, nodes[0]);
    assert.equal(P(d, 0).inlines[3].node, nodes[1]);
    // the link's U+FFFC (written outside any run) keeps its format:
    // the file could not hold it; the field's (inside a run) is bold
    assert.deepEqual(rPrs(P(d, 0)), [[0, 1, bold], [1, 2, plain],
      [2, 4, bold]]);
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 0, 4)).bold, true);
    // and the Word rule sees all bold: a second toggle clears it
    run(d, (t) => FS.toggle(d, t, SEL(d, 0, 0, 0, 4), 'bold'));
    assert.deepEqual(rPrs(P(d, 0)), [[0, 4, plain]]);
  });
  it('a hyperlink in a formatted selection: saved and read back the ' +
    'same (Task 7 round trip)', async () => {
    const xml = '<w:p><w:r><w:t xml:space="preserve">A </w:t></w:r>' +
      '<w:hyperlink w:anchor="x"><w:r><w:t>link</w:t></w:r>' +
      '</w:hyperlink><w:r><w:t xml:space="preserve"> b</w:t></w:r>' +
      '</w:p>';
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(xml)}));
    const d = new Document(doc);
    const id = d.doc.sections[0].blocks[0].id;
    const sel = {anchor: {id, off: 0}, head: {id, off: 5},
      affinity: 'down', goalX: null};
    for (const [key, v] of [['bold', 'b'], ['italic', 'i']]) {
      FS.toggle(d, T(d), sel, key);
      FS.setChar(d, T(d), sel, {sz: 40, color: 'FF0000'});
      const back = await readDocx(await writeDocx(d.doc));
      const runs = (x) => x.sections[0].blocks[0].runs.map((r) =>
        [r.start, r.end, r.rPr]);
      assert.deepEqual(runs(back), runs(d.doc), key);
      assert.equal(d.doc.sections[0].blocks[0].runs[0].rPr[v], true);
    }
  });
  it('a caret: pending, no document change', () => {
    const d = mk([two('ab', 'cd')]);
    const before = snap(d);
    const sel = C(d, 0, 1);
    let out = FS.toggle(d, T(d), sel, 'bold');
    assert.equal(out.sel, sel);
    assert.deepEqual(out.pending, {b: true});
    assert.deepEqual(snap(d), before);
    assert.equal(d.undoDepth, 0);
    out = FS.toggle(d, T(d), sel, 'italic', out.pending);
    assert.deepEqual(out.pending, {b: true, i: true});
    out = FS.toggle(d, T(d), sel, 'bold', out.pending);
    assert.deepEqual(out.pending, {i: true});
    // in bold text the caret's bold is turned off
    const p = FS.toggle(d, T(d), C(d, 0, 3), 'bold').pending;
    assert.deepEqual(p, {b: null});
  });
  it('pending carries into typing; plain typing then continues', () => {
    const d = mk(['ab']);
    const t = T(d);
    const sel = C(d, 0, 2);
    const {pending} = FS.toggle(d, t, sel, 'bold');
    let s = t.type(sel, 'X', {rPr: Pd.forTyping(pending),
      rStyle: Pd.styleFor(pending)});
    s = t.type(s, 'Y');
    assert.deepEqual(rPrs(P(d, 0)), [[0, 2, plain], [2, 4, bold]]);
    assert.equal(F.query(d.doc, s).bold, true);
    valid(d);
  });
  it('a selection clears pending', () => {
    const d = mk(['ab']);
    const out = FS.toggle(d, T(d), SEL(d, 0, 0, 0, 1), 'bold',
      {i: true});
    assert.deepEqual(out.pending, {});
  });
  it('bad key: RangeError', () => {
    const d = mk(['ab']);
    assert.throws(() => FS.toggle(d, T(d), SEL(d, 0, 0, 0, 1), 'x'),
      RangeError);
  });
});

describe('FormatSet.setChar', () => {
  it('size, colour, family, highlight', () => {
    const d = mk(['abc']);
    const sel = SEL(d, 0, 0, 0, 3);
    run(d, (t) => FS.setChar(d, t, sel, {sz: 28, color: 'ff0000',
      rFonts: 'Arial', highlight: 'yellow'}));
    assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 28, szCs: 28,
      color: 'FF0000', rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
      highlight: 'yellow', extra: []});
    const q = F.query(d.doc, sel);
    assert.equal(q.size, 14);
    assert.equal(q.family, 'Arial');
    assert.equal(q.color, 'FF0000');
    assert.equal(q.highlight, 'yellow');
    // back to the inherited values: the keys go
    run(d, (t) => FS.setChar(d, t, sel, {sz: 22, color: 'auto',
      highlight: 'none'}));
    assert.deepEqual(P(d, 0).runs[0].rPr, {rFonts: {ascii: 'Arial',
      hAnsi: 'Arial'}, extra: []});
  });
  it('family keeps eastAsia, cs and hint', () => {
    const d = mk([['ab', {rPr: {rFonts: {ascii: 'X', hAnsi: 'X',
      eastAsia: 'E', cs: 'C', hint: 'eastAsia'}, extra: []}}]]);
    run(d, (t) => FS.setChar(d, t, SEL(d, 0, 0, 0, 2),
      {rFonts: 'Arial'}));
    assert.deepEqual(P(d, 0).runs[0].rPr.rFonts, {ascii: 'Arial',
      hAnsi: 'Arial', eastAsia: 'E', cs: 'C', hint: 'eastAsia'});
  });
  it('colour auto removes a direct colour', () => {
    const d = mk([['ab', {rPr: {color: '00FF00', extra: []}}]]);
    run(d, (t) => FS.setChar(d, t, SEL(d, 0, 0, 0, 2),
      {color: 'auto'}));
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
  });
  it('colour auto over a coloured style is written', () => {
    const d = mk([['ab', {rStyle: 'Red'}]]);
    addStyle(d.doc.styles, {id: 'Red', type: 'character',
      rPr: {color: 'FF0000', extra: []}});
    run(d, (t) => FS.setChar(d, t, SEL(d, 0, 0, 0, 2),
      {color: 'auto'}));
    assert.deepEqual(P(d, 0).runs[0].rPr, {color: 'auto', extra: []});
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 0, 2)).color, 'auto');
  });
  it('sizes are clamped to 1..400 pt', () => {
    const d = mk(['ab']);
    run(d, (t) => FS.setChar(d, t, SEL(d, 0, 0, 0, 2), {sz: 5000}));
    assert.equal(P(d, 0).runs[0].rPr.sz, 800);
    run(d, (t) => FS.setChar(d, t, SEL(d, 0, 0, 0, 2), {sz: 0}));
    assert.equal(P(d, 0).runs[0].rPr.sz, 2);
  });
  it('bad values: RangeError, nothing applied', () => {
    const d = mk(['ab']);
    const before = snap(d);
    const sel = SEL(d, 0, 0, 0, 2);
    for (const patch of [{color: 'red'}, {highlight: 'pink'},
      {vertAlign: 'up'}, {sz: 'big'}, {nope: 1}, {b: 'yes'},
      {rFonts: ''}]) {
      assert.throws(() => FS.setChar(d, T(d), sel, patch), RangeError,
        JSON.stringify(patch));
    }
    assert.deepEqual(snap(d), before);
    assert.equal(d.undoDepth, 0);
  });
  it('a caret: pending', () => {
    const d = mk(['ab']);
    const out = FS.setChar(d, T(d), C(d, 0, 1), {sz: 40});
    assert.deepEqual(out.pending, {sz: 40, szCs: 40});
    assert.equal(d.undoDepth, 0);
  });
});

describe('FormatSet.setPara', () => {
  it('alignment, indents and spacing; null clears', () => {
    const d = mk(['ab', 'cd']);
    const sel = SEL(d, 0, 1, 1, 1);
    run(d, (t) => FS.setPara(d, t, sel, {jc: 'center',
      ind: {left: 720}, spacing: {before: 120}}));
    for (const k of [0, 1]) {
      assert.deepEqual(P(d, k).pPr, {jc: 'center', ind: {left: 720},
        spacing: {before: 120}, extra: []});
    }
    assert.equal(d.undoDepth, 1);
    run(d, (t) => FS.setPara(d, t, sel, {jc: null, ind: {left: null}}));
    assert.deepEqual(P(d, 0).pPr, {spacing: {before: 120}, extra: []});
  });
  it('a caret: its paragraph, pending kept', () => {
    const d = mk(['ab', 'cd']);
    const out = run(d, (t) => FS.setPara(d, t, C(d, 1, 0),
      {jc: 'right'}, {b: true}));
    assert.deepEqual(out.pending, {b: true});
    assert.equal(P(d, 1).pPr.jc, 'right');
    assert.equal(P(d, 0).pPr.jc, undefined);
  });
  it('a selection ending at the start of a paragraph leaves it', () => {
    const d = mk(['ab', 'cd']);
    run(d, (t) => FS.setPara(d, t, SEL(d, 0, 0, 1, 0), {jc: 'right'}));
    assert.equal(P(d, 0).pPr.jc, 'right');
    assert.equal(P(d, 1).pPr.jc, undefined);
  });
  it('firstLine and hanging exclude each other', () => {
    const d = mk([['ab', {pPr: {ind: {hanging: 360, left: 720},
      extra: []}}]]);
    const sel = C(d, 0, 0);
    run(d, (t) => FS.setPara(d, t, sel, {ind: {firstLine: 200}}));
    assert.deepEqual(P(d, 0).pPr.ind, {left: 720, firstLine: 200});
    run(d, (t) => FS.setPara(d, t, sel, {ind: {hanging: 100}}));
    assert.deepEqual(P(d, 0).pPr.ind, {left: 720, hanging: 100});
  });
  it('alignment equal to the style\'s is removed; tables skipped',
    () => {
      const d = mk([['ab', {pPr: {jc: 'center', extra: []}}], box()]);
      run(d, (t) => FS.setPara(d, t, SEL(d, 0, 0, 1, 1), {jc: 'left'}));
      assert.deepEqual(P(d, 0).pPr, plain);
    });
  it('bad values: RangeError', () => {
    const d = mk(['ab']);
    for (const patch of [{jc: 'middle'}, {ind: {left: 'x'}},
      {spacing: {lineRule: 'odd'}}, {other: 1}, {ind: 5}]) {
      assert.throws(() => FS.setPara(d, T(d), C(d, 0, 0), patch),
        RangeError, JSON.stringify(patch));
    }
    assert.equal(d.undoDepth, 0);
  });
  it('indentBy steps to multiples, never below 0', () => {
    const d = mk([['ab', {pPr: {ind: {left: 100}, extra: []}}], 'cd']);
    const sel = SEL(d, 0, 0, 1, 1);
    run(d, (t) => FS.indentBy(d, t, sel, 720));
    assert.equal(P(d, 0).pPr.ind.left, 720);
    assert.equal(P(d, 1).pPr.ind.left, 720);
    run(d, (t) => FS.indentBy(d, t, sel, 720));
    assert.equal(P(d, 0).pPr.ind.left, 1440);
    run(d, (t) => FS.indentBy(d, t, sel, -720));
    run(d, (t) => FS.indentBy(d, t, sel, -720));
    assert.deepEqual(P(d, 0).pPr, plain);
    run(d, (t) => FS.indentBy(d, t, sel, -720));
    assert.deepEqual(P(d, 0).pPr, plain);
  });
  it('clearParaFormat', () => {
    const d = mk([['ab', {pPr: {jc: 'center', ind: {left: 5},
      spacing: {after: 0}, keepNext: true, extra: []}}]]);
    run(d, (t) => FS.clearParaFormat(d, t, C(d, 0, 1)));
    assert.deepEqual(P(d, 0).pPr, {keepNext: true, extra: []});
  });
});

describe('FormatSet.applyStyle, clearFormat, sizeBy', () => {
  it('a paragraph style', () => {
    const d = mk(['ab', 'cd']);
    run(d, (t) => FS.applyStyle(d, t, SEL(d, 0, 1, 1, 1), 'Heading2'));
    assert.equal(P(d, 0).pStyle, 'Heading2');
    assert.equal(P(d, 1).pStyle, 'Heading2');
    run(d, (t) => FS.applyStyle(d, t, C(d, 0, 0), 'Normal'));
    assert.equal(P(d, 0).pStyle, undefined);
  });
  it('a character style, at a caret pending', () => {
    const d = mk(['abcd']);
    addStyle(d.doc.styles, {id: 'Strong', type: 'character',
      rPr: {b: true, extra: []}});
    run(d, (t) => FS.applyStyle(d, t, SEL(d, 0, 1, 0, 3), 'Strong'));
    assert.deepEqual(P(d, 0).runs.map((r) => r.rStyle),
      [undefined, 'Strong', undefined]);
    assert.equal(F.query(d.doc, SEL(d, 0, 1, 0, 3)).bold, true);
    const out = FS.applyStyle(d, T(d), C(d, 0, 0), 'Strong');
    assert.deepEqual(out.pending, {rStyle: 'Strong'});
  });
  it('an unknown style is refused, nothing applied', () => {
    const d = mk(['ab']);
    const before = snap(d);
    for (const id of ['Nope', '', null, 'TableNormalX']) {
      assert.throws(() => FS.applyStyle(d, T(d), SEL(d, 0, 0, 0, 2),
        id), RangeError);
    }
    assert.deepEqual(snap(d), before);
    assert.equal(d.undoDepth, 0);
  });
  it('clearFormat removes direct character formatting', () => {
    const raw1 = {name: 'w:caps', attrs: [], children: []};
    const d = mk([['abcd', {runs: [{start: 0, end: 2, rPr: {b: true,
      i: true, sz: 30, color: '00FF00', rFonts: {ascii: 'A'},
      extra: [raw1]}, rStyle: 'X'}, {start: 2, end: 4, rPr: plain}],
    pPr: {jc: 'center', extra: []}}]]);
    run(d, (t) => FS.clearFormat(d, t, SEL(d, 0, 0, 0, 4)));
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 2,
      rPr: {extra: [raw1]}}, {start: 2, end: 4, rPr: plain}]);
    assert.equal(P(d, 0).pPr.jc, 'center');
    const out = FS.clearFormat(d, T(d), C(d, 0, 1), {b: true});
    assert.deepEqual(out.pending, {});
  });
  it('stepSize follows Word\'s list', () => {
    const up = [[1, 2], [7, 8], [8, 9], [11, 12], [12, 14], [13, 14],
      [28, 36], [48, 72], [72, 80], [75, 80], [80, 90], [400, 400]];
    for (const [a, b] of up) assert.equal(FS.stepSize(a, 1), b, a);
    const down = [[1, 1], [8, 7], [9, 8], [14, 12], [13, 12],
      [36, 28], [72, 48], [80, 72], [75, 72], [90, 80], [85, 80],
      [10.5, 10]];
    for (const [a, b] of down) assert.equal(FS.stepSize(a, -1), b, a);
  });
  it('sizeBy each run by its own size', () => {
    const d = mk([two('ab', 'cd', {sz: 24, extra: []})]);
    run(d, (t) => FS.sizeBy(d, t, SEL(d, 0, 0, 0, 4), 1));
    assert.deepEqual(rPrs(P(d, 0)), [[0, 2, {sz: 24, szCs: 24,
      extra: []}], [2, 4, {sz: 28, szCs: 28, extra: []}]]);
    run(d, (t) => FS.sizeBy(d, t, SEL(d, 0, 0, 0, 4), -1));
    assert.deepEqual(rPrs(P(d, 0)), [[0, 2, plain],
      [2, 4, {sz: 24, szCs: 24, extra: []}]]);
    const out = FS.sizeBy(d, T(d), C(d, 0, 1), 1);
    assert.deepEqual(out.pending, {sz: 24, szCs: 24});
  });
});

describe('FormatSet: undo, redo, rollback', () => {
  it('undo restores ids and runs exactly, redo reapplies', () => {
    const d = mk([two('ab', 'cd'), box(), 'ef']);
    const before = snap(d);
    FS.toggle(d, T(d), SEL(d, 0, 1, 2, 1), 'italic');
    const after = snap(d);
    d.undo();
    assert.deepEqual(snap(d), before);
    d.redo();
    assert.deepEqual(snap(d), after);
  });
  it('a failing op rolls everything back', () => {
    const d = mk(['ab', 'cd', 'ef']);
    const before = snap(d);
    const real = d.apply.bind(d);
    let n = 0;
    d.apply = (op, o) => {
      if (++n === 2) throw new RangeError('stub');
      return real(op, o);
    };
    assert.throws(() => FS.toggle(d, T(d), SEL(d, 0, 0, 2, 2), 'bold'),
      RangeError);
    assert.deepEqual(snap(d), before);
    assert.equal(d.undoDepth, 0);
    valid(d);
  });
  it('nothing to change: no undo step', () => {
    const d = mk([['ab', {rPr: bold}]]);
    FS.setChar(d, T(d), SEL(d, 0, 0, 0, 2), {b: true});
    assert.equal(d.undoDepth, 0);
    assert.deepEqual(texts(d), ['ab']);
  });
});

describe('FormatSet: a 50,000 paragraph document', () => {
  it('bold and alignment of everything, undo, redo: seconds', () => {
    const N = 50000;
    const d = mk(Array.from({length: N}, (_, k) => 'paragraph ' + k));
    const sel = SEL(d, 0, 0, N - 1, 5);
    let t0 = performance.now();
    FS.toggle(d, T(d), sel, 'bold');
    FS.setPara(d, T(d), sel, {jc: 'center'});
    const set = performance.now() - t0;
    assert.equal(d.undoDepth, 2);
    assert.equal(P(d, N - 1).pPr.jc, 'center');
    assert.deepEqual(rPrs(P(d, N - 1))[0], [0, 5, bold]);
    t0 = performance.now();
    d.undo();
    d.undo();
    const undo = performance.now() - t0;
    assert.equal(P(d, 0).pPr.jc, undefined);
    t0 = performance.now();
    d.redo();
    const redo = performance.now() - t0;
    assert.ok(set < 5000, 'set ' + set);
    assert.ok(undo < 5000, 'undo ' + undo);
    assert.ok(redo < 5000, 'redo ' + redo);
  });
  it('restoreBlock still refuses a duplicate id', () => {
    const doc = mkDoc(['a', 'b']);
    const id = doc.sections[0].blocks[1].id;
    assert.throws(() => apply(doc, {op: 'restoreBlock', block: [0, 0],
      snapshot: newPara('x', {id})}), RangeError);
    apply(doc, {op: 'restoreBlock', block: [0, 1],
      snapshot: newPara('y', {id})});
    assert.equal(doc.sections[0].blocks[1].text, 'y');
  });
});

/**
 * d's styles without any size: docDefaults and Heading1 lose sz,
 * szCs and b, so a Heading1 is bold only by ./Fmt's heading rule.
 */
function noSize(d) {
  const st = structuredClone(d.doc.styles);
  delete st.docDefaults.rPr.sz;
  delete st.docDefaults.rPr.szCs;
  const h = st.styles.get('Heading1');
  for (const k of ['sz', 'szCs', 'b']) delete h.rPr[k];
  d.doc.styles = st;
  return d;
}
const drawn = (d, k) => runFmt(d.doc.styles, P(d, k), P(d, k).runs[0]);

describe('FormatSet: a heading bold only by the display rule', () => {
  it('query says bold, as the screen draws it', () => {
    const d = noSize(mk([['Head', {pStyle: 'Heading1'}], 'body']));
    assert.equal(drawn(d, 0).bold, true);
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 0, 4)).bold, true);
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 0, 4)).size, 16);
    assert.equal(F.query(d.doc, SEL(d, 1, 0, 1, 4)).bold, false);
  });
  it('toggle writes b:false, then removes it; setChar b:false', () => {
    const d = noSize(mk([['Head', {pStyle: 'Heading1'}]]));
    const sel = SEL(d, 0, 0, 0, 4);
    run(d, (t) => FS.toggle(d, t, sel, 'bold'));
    assert.deepEqual(P(d, 0).runs[0].rPr, {b: false, extra: []});
    assert.equal(drawn(d, 0).bold, false);
    assert.equal(F.query(d.doc, sel).bold, false);
    run(d, (t) => FS.toggle(d, t, sel, 'bold'));
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
    assert.equal(drawn(d, 0).bold, true);
    run(d, (t) => FS.setChar(d, t, sel, {b: false}));
    assert.deepEqual(P(d, 0).runs[0].rPr, {b: false, extra: []});
    assert.equal(drawn(d, 0).bold, false);
  });
  it('a size keeps the heading bold (b:true written)', () => {
    const d = noSize(mk([['Head', {pStyle: 'Heading1'}]]));
    const sel = SEL(d, 0, 0, 0, 4);
    run(d, (t) => FS.setChar(d, t, sel, {sz: 40}));
    assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 40, szCs: 40, b: true,
      extra: []});
    assert.equal(drawn(d, 0).bold, true);
    // no size again: the rule makes it bold, so b:true goes too
    run(d, (t) => FS.setChar(d, t, sel, {sz: null}));
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
    assert.equal(drawn(d, 0).bold, true);
    run(d, (t) => FS.sizeBy(d, t, sel, -1));
    assert.equal(P(d, 0).runs[0].rPr.sz, 28);
    assert.equal(drawn(d, 0).bold, true);
    assert.equal(F.query(d.doc, sel).bold, true);
  });
});

describe('FormatSet: Task 7 minors', () => {
  it('no default size: back to 11 pt keeps an explicit sz 22', () => {
    // intended (controller ruling, Task 7 fix round 1): with no size
    // in the style chain Word shows 10 pt where !Word assumes 11 pt,
    // so a size chosen there is always written; it is removed only
    // when a style gives that very size
    const d = noSize(mk(['abcd']));
    const sel = SEL(d, 0, 0, 0, 4);
    run(d, (t) => FS.sizeBy(d, t, sel, 1));
    assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 24, szCs: 24,
      extra: []});
    run(d, (t) => FS.sizeBy(d, t, sel, -1));
    assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 22, szCs: 22,
      extra: []});
    assert.equal(F.query(d.doc, sel).size, 11);
    // with a default size (22) in the styles, back to it removes sz
    const d2 = mk(['abcd']);
    const sel2 = SEL(d2, 0, 0, 0, 4);
    run(d2, (t) => FS.sizeBy(d2, t, sel2, 1));
    run(d2, (t) => FS.sizeBy(d2, t, sel2, -1));
    assert.deepEqual(P(d2, 0).runs[0].rPr, plain);
  });
  it('no default size: a heading set to 16 pt writes sz 32 (and b)',
    () => {
      // intended: no style gives the heading a size, so 16 pt is
      // written; the explicit size turns the heading rule off, so b
      // keeps it bold
      const d = noSize(mk([['Head', {pStyle: 'Heading1'}]]));
      const sel = SEL(d, 0, 0, 0, 4);
      run(d, (t) => FS.setChar(d, t, sel, {sz: 40}));
      run(d, (t) => FS.setChar(d, t, sel, {sz: 32}));
      assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 32, szCs: 32, b: true,
        extra: []});
      assert.equal(drawn(d, 0).bold, true);
      assert.equal(F.query(d.doc, sel).size, 16);
    });
  it('a size change drops a b the rest gives anyway', () => {
    const d = mk([['ab', {pStyle: 'Heading1', runs: [{start: 0, end: 2,
      rPr: {b: true, sz: 40, szCs: 40, extra: []}}]}]]);
    run(d, (t) => FS.sizeBy(d, t, SEL(d, 0, 0, 0, 2), 1));
    // Heading 1 is bold by its style: the run's own b:true goes
    assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 44, szCs: 44,
      extra: []});
    assert.equal(drawn(d, 0).bold, true);
  });
  it('FormatOps.changes: a raw w:rStyle / w:pStyle is a change', () => {
    const rs = {name: 'w:rStyle', attrs: [['w:val', 'X']], children: []};
    const ps = {name: 'w:pStyle', attrs: [['w:val', 'Y']], children: []};
    const run1 = {start: 0, end: 1, rPr: {extra: [rs]}};
    assert.equal(changes(run1, 'rPr', {rStyle: null}, 'rStyle'), true);
    assert.equal(changes({start: 0, end: 1, rPr: plain}, 'rPr',
      {rStyle: null}, 'rStyle'), false);
    const para = {pPr: {extra: [ps]}};
    assert.equal(changes(para, 'pPr', {pStyle: null}, 'pStyle'), true);
    assert.equal(changes({pPr: plain}, 'pPr', {pStyle: null},
      'pStyle'), false);
    // so removing a character style removes the raw element (one step)
    const d = mk([['ab', {runs: [{start: 0, end: 2, rPr: {extra: [rs]}}]}]]);
    run(d, (t) => FS.applyStyle(d, t, SEL(d, 0, 0, 0, 2),
      'DefaultParagraphFont'));
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
    assert.equal(d.undoDepth, 1);
  });
});

describe('FormatSet: review fixes', () => {
  it('szCs is compared with the inherited szCs', () => {
    const d = mk([['ab', {rStyle: 'Big'}]]);
    addStyle(d.doc.styles, {id: 'Big', type: 'character',
      rPr: {sz: 28, szCs: 22, extra: []}});
    run(d, (t) => FS.setChar(d, t, SEL(d, 0, 0, 0, 2), {sz: 22}));
    assert.deepEqual(P(d, 0).runs[0].rPr, {sz: 22, extra: []});
  });
  it('first line 0 over a style\'s hanging: firstLine 0, round trip',
    async () => {
      const d = mk([['ab', {pStyle: 'Hang'}]]);
      addStyle(d.doc.styles, {id: 'Hang', type: 'paragraph',
        name: 'Hang', basedOn: 'Normal',
        pPr: {ind: {left: 720, hanging: 360}, extra: []}});
      const sel = C(d, 0, 0);
      assert.equal(F.query(d.doc, sel).indentFirst, -360);
      run(d, (t) => FS.setPara(d, t, sel, {ind: {firstLine: 0}}));
      assert.deepEqual(P(d, 0).pPr, {ind: {firstLine: 0}, extra: []});
      assert.equal(F.query(d.doc, sel).indentFirst, 0);
      assert.equal(paraFmt(d.doc.styles, P(d, 0)).first, 0);
      const back = await readDocx(await writeDocx(d.doc,
        {date: new Date(Date.UTC(2026, 0, 1))}));
      const p = back.sections[0].blocks[0];
      assert.equal(p.pStyle, 'Hang');
      assert.equal(p.pPr.ind.firstLine, 0);
      assert.equal(paraFmt(back.styles, p).first, 0);
      // back to the style's value: both keys go
      run(d, (t) => FS.setPara(d, t, sel, {ind: {hanging: 360}}));
      assert.deepEqual(P(d, 0).pPr, plain);
      run(d, (t) => FS.setPara(d, t, sel, {ind: {firstLine: 200}}));
      assert.deepEqual(P(d, 0).pPr.ind, {firstLine: 200});
      assert.equal(F.query(d.doc, sel).indentFirst, 200);
    });
  it('firstLine and hanging together are refused', () => {
    const d = mk(['ab']);
    assert.throws(() => FS.setPara(d, T(d), C(d, 0, 0),
      {ind: {firstLine: 1, hanging: 2}}), RangeError);
    assert.equal(d.undoDepth, 0);
  });
  it('a value equal to the style\'s still replaces a raw element', () => {
    const rawJc = {name: 'w:jc', attrs: [['w:val', 'start']],
      children: []};
    const d = mk([['ab', {pPr: {extra: [rawJc]}}]]);
    run(d, (t) => FS.setPara(d, t, C(d, 0, 0), {jc: 'left'}));
    assert.deepEqual(P(d, 0).pPr, plain);
    assert.equal(d.undoDepth, 1);
  });
  it('table and numbering styles are refused', () => {
    const d = mk(['ab']);
    addStyle(d.doc.styles, {id: 'TableGrid', type: 'table'});
    addStyle(d.doc.styles, {id: 'NumList', type: 'numbering'});
    const before = snap(d);
    for (const id of ['TableGrid', 'NumList']) {
      assert.throws(() => FS.applyStyle(d, T(d), SEL(d, 0, 0, 0, 2),
        id), RangeError, id);
    }
    assert.deepEqual(snap(d), before);
  });
});
