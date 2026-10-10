// WimpLib/DialogLayout (pure): a dialog's rows of controls laid out as
// icon rectangles: a label column as wide as the longest label, field
// widths from their text (options, popups, buttons), rows stacked, the
// buttons in a row at the bottom right; the window's size. Nothing
// overlaps and everything is inside the window. DialogIcons: the icon
// specs; DialogValues: what each kind of control reads and shows
// (over fake icons).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {layout, controls, KINDS, PAD}
  from '../../tools/moreapps/!WimpLib/DialogLayout';
import {iconSpecs, esgOf} from '../../tools/moreapps/!WimpLib/DialogIcons';
import {store, readField, showField, choiceText}
  from '../../tools/moreapps/!WimpLib/DialogValues';

const measure = (t) => String(t).length * 10;     // a fake font

const PARA = [
  {kind: 'label', text: 'Indents and spacing'},
  [{kind: 'popup', name: 'align', label: 'Alignment',
    choices: [{id: 'left', text: 'Left'}, {id: 'both', text: 'Justify'}]}],
  [{kind: 'length', name: 'left', label: 'Left'},
    {kind: 'length', name: 'right', label: 'Right'}],
  [{kind: 'popup', name: 'special', label: 'Special', choices: [
    {id: 'none', text: '(none)'}, {id: 'first', text: 'First line'}]},
  {kind: 'length', name: 'by', label: 'By'}],
  [{kind: 'number', name: 'at', label: 'At', after: 'lines'}],
  {kind: 'option', name: 'keep', text: 'Keep with next'},
  [{kind: 'radio', name: 'r1', group: 'g', text: 'One'},
    {kind: 'radio', name: 'r2', group: 'g', text: 'Two'}],
  [{kind: 'text', name: 'url', label: 'Address', w: 300},
    {kind: 'button', name: 'browse', text: 'Browse'}],
  [{kind: 'colour', name: 'col', label: 'Colour'}],
];

/** Do two rectangles overlap? */
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w &&
  a.y < b.y + b.h && b.y < a.y + a.h;

describe('DialogLayout', () => {
  it('nothing overlaps; everything is inside the window', () => {
    const L = layout(PARA, {buttons: ['Cancel', 'OK'], measure});
    assert.ok(L.boxes.length > 20);
    for (const b of L.boxes) {
      assert.ok(b.w > 0 && b.h > 0, JSON.stringify(b));
      assert.ok(b.x >= PAD && b.y >= PAD, JSON.stringify(b));
      assert.ok(b.x + b.w <= L.w - PAD, JSON.stringify(b));
      assert.ok(b.y + b.h <= L.h - PAD, JSON.stringify(b));
    }
    for (let i = 0; i < L.boxes.length; i++) {
      for (let j = i + 1; j < L.boxes.length; j++) {
        const a = L.boxes[i], b = L.boxes[j];
        assert.ok(!hits(a, b), JSON.stringify([a, b]));
      }
    }
  });

  it('each control has its parts, named', () => {
    const L = layout(PARA, {buttons: ['Cancel', 'OK'], measure});
    const part = (name, p) => L.boxes.find((b) => b.name === name &&
      b.part === p);
    for (const n of ['align', 'left', 'right', 'special', 'by', 'at',
      'keep', 'r1', 'r2', 'url', 'browse', 'col']) {
      assert.ok(part(n, 'field'), n);
    }
    assert.ok(part('align', 'arrow') && part('special', 'arrow'));
    assert.ok(part('align', 'label') && part('by', 'label'));
    assert.ok(part('at', 'after'));
    assert.equal(part('at', 'after').text, 'lines');
    assert.ok(part('Cancel', 'button') && part('OK', 'button'));
    // the arrow is just right of its display field, the same height
    const f = part('align', 'field'), a = part('align', 'arrow');
    assert.ok(a.x > f.x + f.w && a.x - (f.x + f.w) <= 8);
    // the after text is right of its field
    assert.ok(part('at', 'after').x > part('at', 'field').x);
  });

  it('the label column is as wide as the longest first label', () => {
    const one = layout([[{kind: 'text', name: 'a', label: 'Ab'}],
      [{kind: 'text', name: 'b', label: 'Abcd'}]], {measure});
    const two = layout([[{kind: 'text', name: 'a', label: 'Ab'}],
      [{kind: 'text', name: 'b', label: 'Abcdefgh'}]], {measure});
    const fx = (L, n) => L.boxes.find((b) => b.name === n &&
      b.part === 'field').x;
    assert.equal(fx(one, 'a'), fx(one, 'b'));
    assert.equal(fx(two, 'a') - fx(one, 'a'), 40);
    // labels are right-justified up to the column's edge
    const la = two.boxes.find((b) => b.name === 'a' && b.part === 'label');
    const lb = two.boxes.find((b) => b.name === 'b' && b.part === 'label');
    assert.equal(la.x + la.w, lb.x + lb.w);
    assert.ok(la.rjustify && lb.rjustify);
    assert.equal(lb.w, 80);
  });

  it('widths come from the text', () => {
    const w = (spec, part = 'field') => layout([spec], {measure})
      .boxes.find((b) => b.part === part).w;
    assert.equal(w({kind: 'option', name: 'o', text: 'Keep'}) + 60,
      w({kind: 'option', name: 'o', text: 'Keep it all'}) - 10);
    assert.ok(w({kind: 'popup', name: 'p', choices: [{id: 1,
      text: 'A very long choice indeed'}]}) > 250);
    assert.ok(w({kind: 'button', name: 'b', text: 'X'.repeat(30)}) >=
      300);
    assert.equal(w({kind: 'label', text: 'Hello'}), 50 + 8);
    assert.equal(w({kind: 'text', name: 't', w: 123}), 123);
    // a heading label (first in its row, no label) starts at PAD
    const L = layout([{kind: 'label', text: 'Head'},
      [{kind: 'text', name: 't', label: 'Name'}]], {measure});
    assert.equal(L.boxes[0].x, PAD);
    assert.ok(L.boxes.find((b) => b.name === 't' && b.part === 'field')
      .x > PAD + 40);
  });

  it('rows are stacked; buttons at the bottom right in order', () => {
    const L = layout(PARA, {buttons: ['Cancel', 'Apply', 'OK'],
      measure});
    const ys = [...new Set(L.boxes.filter((b) => b.part === 'field')
      .map((b) => b.row))];
    assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
    const tops = ys.map((r) => Math.min(...L.boxes.filter((b) =>
      b.row === r).map((b) => b.y)));
    for (let i = 1; i < tops.length; i++) assert.ok(tops[i] > tops[i - 1]);
    const bs = L.boxes.filter((b) => b.part === 'button');
    assert.deepEqual(bs.map((b) => b.name), ['Cancel', 'Apply', 'OK']);
    assert.equal(bs[2].x + bs[2].w, L.w - PAD);
    assert.ok(bs.every((b) => b.y === bs[0].y));
    assert.ok(bs[0].x + bs[0].w < bs[1].x && bs[1].x + bs[1].w < bs[2].x);
    assert.equal(bs[0].y + bs[0].h, L.h - PAD);
    const other = L.boxes.filter((b) => b.part !== 'button');
    assert.ok(other.every((b) => b.y + b.h < bs[0].y));
  });

  it('the window is wide enough for the buttons, and minW', () => {
    const L = layout([[{kind: 'text', name: 't', w: 40}]],
      {buttons: ['One', 'Two', 'Three', 'Four'], measure});
    const bs = L.boxes.filter((b) => b.part === 'button');
    assert.ok(bs[0].x >= PAD);
    assert.equal(layout([], {measure, minW: 500}).w, 500);
    const none = layout([], {measure});
    assert.ok(none.w >= 2 * PAD && none.h >= 2 * PAD);
  });

  it('maxW: the window no wider; the buttons kept inside it', () => {
    const L = layout(PARA, {buttons: ['Cancel', 'OK'], measure,
      minW: 2000, maxW: 600});
    assert.equal(L.w, 600);
    assert.equal(L.extent, 2000);
    const bs = L.boxes.filter((b) => b.part === 'button');
    assert.equal(bs[1].x + bs[1].w, 600 - PAD);
    assert.ok(bs.every((b) => b.x >= PAD));
    // a button row wider than maxW starts at PAD (the rest scrolls)
    const N = layout([], {buttons: ['One', 'Two', 'Three', 'Four'],
      measure, maxW: 200});
    const nb = N.boxes.filter((b) => b.part === 'button');
    assert.equal(N.w, 200);
    assert.equal(nb[0].x, PAD);
    assert.ok(N.extent >= nb[3].x + nb[3].w + PAD);
    // without maxW, or a larger one: as before
    const A = layout(PARA, {buttons: ['OK'], measure});
    const B = layout(PARA, {buttons: ['OK'], measure, maxW: 1e6});
    assert.deepEqual(A, B);
    assert.equal(A.extent, A.w);
  });

  it('controls(): rows of controls, checked', () => {
    const c = controls(PARA);
    assert.equal(c.find((x) => x.name === 'by').row, 3);
    assert.equal(c.filter((x) => x.kind === 'radio').length, 2);
    assert.deepEqual(KINDS, ['label', 'text', 'length', 'number',
      'option', 'radio', 'popup', 'colour', 'button']);
    const bad = [
      [[{kind: 'nope', name: 'a'}]],
      [[{kind: 'text'}]],
      [[{kind: 'text', name: 'a'}, {kind: 'option', name: 'a'}]],
      [[{kind: 'radio', name: 'a'}]],
      [[{kind: 'radio', name: 'a', group: 'a'}]],
      [[{kind: 'text', name: 'button:OK'}]],
      [[{kind: 'popup', name: 'p', choices: 'x'}]],
      [null], 'rows', [[42]],
      [[{kind: 'text', name: '__proto__'}]],
    ];
    for (const rows of bad) {
      assert.throws(() => controls(rows), TypeError, JSON.stringify(rows));
    }
    const many = Array.from({length: 32}, (_, i) => ({kind: 'radio',
      name: `r${i}`, group: `g${i}`, text: 'x'}));
    assert.throws(() => controls([many]), TypeError);
    assert.throws(() => layout(PARA, {buttons: ['OK', 'OK'], measure}),
      TypeError);
  });

  it('a default measure exists (no font given)', () => {
    const L = layout(PARA, {buttons: ['OK']});
    assert.ok(L.w > 200 && L.h > 200);
  });
});


/** Fake icons for specs: text, selected, setText, setState. */
function fakeIcons(specs) {
  const m = new Map();
  for (const s of specs) {
    m.set(s.name, {name: s.name, text: s.text ?? '', selected: false,
      setText(t) { this.text = String(t); },
      setState(o) { if ('selected' in o) this.selected = o.selected; }});
  }
  return m;
}

describe('DialogIcons', () => {
  it('names, kinds and borders of the icons', () => {
    const list = controls(PARA);
    const L = layout(PARA, {buttons: ['Cancel', 'OK'], measure});
    const s = iconSpecs(L.boxes, list, {enter: 'OK'});
    const by = new Map(s.map((x) => [x.name, x]));
    assert.equal(s.length, L.boxes.length);
    assert.equal(by.size, s.length, 'names unique');
    assert.equal(by.get('button:OK').validation, 'R6,3');
    assert.equal(by.get('button:Cancel').validation, 'R5,3');
    assert.equal(by.get('left').button, 'writable');
    assert.match(by.get('left').validation, /^R7;A/);
    assert.equal(by.get('url').validation, 'R7');
    assert.equal(by.get('keep').validation, 'Soptoff,opton');
    assert.equal(by.get('keep').esg, 0);
    assert.equal(by.get('r1').validation, 'Sradiooff,radioon');
    assert.ok(by.get('r1').esg === 1 && by.get('r2').esg === 1);
    assert.equal(by.get('arrow:align').sprite, 'gright');
    assert.equal(by.get('align').button, 'click');
    assert.equal(by.get('label:align').text, 'Alignment');
    assert.equal(by.get('after:at').text, 'lines');
    assert.equal(by.get('text:0').text, 'Indents and spacing');
    assert.deepEqual([...esgOf([{kind: 'radio', group: 'a'},
      {kind: 'radio', group: 'b'}, {kind: 'radio', group: 'a'}])],
    [['a', 1], ['b', 2]]);
  });

  it("a number field allows '-' only when its min is below 0", () => {
    const spec = (c) => iconSpecs(layout([[c]], {measure}).boxes,
      controls([[c]]))[0].validation;
    assert.match(spec({kind: 'number', name: 'n', min: -5}), /^R7;A-0-9/);
    assert.equal(spec({kind: 'number', name: 'n', min: 0}), 'R7;A0-9.');
    assert.equal(spec({kind: 'number', name: 'n'}), 'R7;A0-9.');
  });

  it('a text field: validation kept after R7, maxLen capped', () => {
    const rows = [[{kind: 'text', name: 't', validation: 'A0-9',
      maxLen: 1e9}]];
    const s = iconSpecs(layout(rows, {measure}).boxes, controls(rows));
    assert.equal(s[0].validation, 'R7;A0-9');
    assert.equal(s[0].maxLen, 1000);
  });
});

describe('DialogValues', () => {
  it('readField / showField / choiceText', () => {
    const len = {kind: 'length'}, pt = {kind: 'length', unit: 'pt'};
    const num = {kind: 'number', min: 0, max: 10, unit: 'lines'};
    assert.equal(readField(len, ''), undefined);
    assert.equal(readField(len, '   '), undefined);
    assert.equal(readField(len, '0.5"'), 720);
    assert.equal(readField(len, '1cm'), null);
    assert.equal(readField(pt, '12'), 240);
    assert.equal(readField(num, '1.5 lines'), 1.5);
    assert.equal(readField(num, '99'), 10);
    assert.equal(readField(num, 'x'), null);
    assert.equal(readField({kind: 'text'}, 'a\u0007b'), 'ab');
    const neg = {kind: 'number', min: -10, max: 10, step: 0.5};
    assert.equal(readField(neg, '-2.5'), -2.5);
    assert.equal(readField(neg, ' - 2.4'), -2.5);
    assert.equal(readField(neg, '-20'), -10);
    assert.equal(readField(neg, '3'), 3);
    assert.ok(Object.is(readField(neg, '-0'), 0));
    assert.equal(readField(neg, '--1'), null);
    assert.equal(readField(neg, '-'), null);
    assert.equal(readField(num, '-1'), null);         // min 0
    assert.equal(readField({kind: 'number'}, '-1'), null);
    assert.equal(showField(len, 720), '0.5"');
    assert.equal(showField(pt, 240), '12 pt');
    assert.equal(showField(num, 1.5), '1.5 lines');
    assert.equal(showField(len, undefined), '');
    assert.equal(showField(len, null), '');
    const p = {choices: [{id: 'a', text: 'Ay'}, {id: 0, text: 'Zero'}]};
    assert.equal(choiceText(p, 'a'), 'Ay');
    assert.equal(choiceText(p, 0), 'Zero');
    assert.equal(choiceText(p, 'zz'), '');
  });

  it('get, set and values() over the icons; mixed is undefined', () => {
    const list = controls(PARA);
    const L = layout(PARA, {buttons: ['OK'], measure});
    const icons = fakeIcons(iconSpecs(L.boxes, list));
    let paints = 0;
    const v = store({list, groups: esgOf(list), icon: (n) => icons.get(n),
      repaint: () => paints++});
    v.set('left', 720);
    assert.equal(icons.get('left').text, '0.5"');
    assert.equal(v.get('left'), 720);
    assert.equal(v.get('right'), undefined);
    icons.get('right').text = 'junk';
    assert.equal(v.get('right'), null);
    assert.deepEqual(v.invalid(), ['right']);
    v.set('align', 'both');
    assert.equal(icons.get('align').text, 'Justify');
    assert.equal(v.get('align'), 'both');
    v.set('keep', undefined);
    assert.equal(v.get('keep'), undefined);
    assert.equal(icons.get('keep').selected, false);
    v.set('keep', true);
    assert.equal(v.get('keep'), true);
    icons.get('keep').selected = false;       // clicked
    assert.equal(v.get('keep'), false);
    v.set('g', 'r2');
    assert.ok(!icons.get('r1').selected && icons.get('r2').selected);
    assert.equal(v.get('g'), 'r2');
    assert.equal(v.get('r2'), true);
    v.set('r1', true);
    assert.equal(v.get('g'), 'r1');
    v.set('g', undefined);
    assert.equal(v.get('g'), undefined);
    v.set('col', 'FF0000');
    assert.equal(v.colour('col'), 'FF0000');
    assert.equal(paints, 1);
    const all = v.values();
    assert.deepEqual(Object.keys(all).sort(), ['align', 'at', 'by', 'col',
      'g', 'keep', 'left', 'r1', 'r2', 'right', 'special', 'url'].sort());
    assert.equal(all.special, undefined);
    assert.equal(all.left, 720);
    assert.equal(all.url, undefined);
  });
});
