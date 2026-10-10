// !Word ToolbarButtons: the toolbar's buttons are formatting commands
// the view knows, with sprites that exist (!Word's own, drawn by
// tools/moreapps/icon.mjs, or the Wimp's), help text, and unique
// names; and the sprites themselves are 20 x 20 and fit the pool.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {BUTTONS, BUTTONS2, ROWS, ROW_BUTTONS, ACTIONS, TOGGLES, ALIGNS, BAR_H,
  LIST_TOGGLES}
  from '../../tools/moreapps/!Word/ToolbarButtons';
import {isFormat} from '../../tools/moreapps/!Word/FormatApply';
import {barSprites, iconFiles} from '../../tools/moreapps/icon.mjs';

const WIMP = new Set(['up', 'down', 'gright']);

describe('ToolbarButtons', () => {
  it('names are unique; every button has help', () => {
    const names = BUTTONS.map((b) => b.name);
    assert.equal(new Set(names).size, names.length);
    for (const b of BUTTONS) assert.ok(b.help && b.help.length > 8, b.name);
  });

  it('actions, toggles and alignments are FormatApply ids', () => {
    for (const id of ACTIONS) assert.ok(isFormat(id), id);
    for (const [n] of TOGGLES) assert.ok(ACTIONS.includes(n), n);
    for (const [n] of ALIGNS) assert.ok(ACTIONS.includes(n), n);
    for (const id of ACTIONS) {
      assert.ok(BUTTONS.some((b) => b.name === id), id);
    }
  });

  it('the alignment buttons are one radio group', () => {
    const r = BUTTONS.filter((b) => b.kind === 'radio');
    assert.deepEqual(r.map((b) => b.name), ALIGNS.map((a) => a[0]));
    assert.ok(r.every((b) => b.group === 'align'));
  });

  it('sprites exist: wb_* drawn by icon.mjs, or the Wimp\'s', () => {
    const own = new Set(barSprites().map(([n]) => n));
    for (const b of [...BUTTONS, ...BUTTONS2]) {
      if (!b.sprite) continue;
      assert.ok(own.has(b.sprite) || WIMP.has(b.sprite), b.sprite);
    }
  });

  it('the toolbar sprites: 20 x 20, names of 12 characters or fewer,' +
    ' in !Word.!Sprites', () => {
    const list = barSprites();
    assert.ok(list.length >= 16);
    for (const [n, rows] of list) {
      assert.ok(/^wb_[a-z]+$/.test(n) && n.length <= 12, n);
      assert.equal(rows.length, 20, n);
      assert.ok(rows.every((r) => r.length === 20), n);
      assert.ok(rows.join('').replace(/\./g, '').length > 10, n);
    }
    const file = iconFiles()['!Sprites'];
    assert.equal(file.readUInt32LE(0), 6 + list.length);
    for (const [n] of list) assert.ok(file.includes(Buffer.from(n)), n);
  });

  it('BAR_H fits a 26 px button with room around it', () => {
    assert.ok(BAR_H >= 30 && BAR_H <= 48);
  });

  // Ui/Toolbar's rule: x from 2, each button's gap before it, then its
  // width (w, else 22 for a popup, 26) and 2 px
  const xs = (list) => {
    let x = 2;
    return list.map((b) => {
      x += b.gap ?? 0;
      const at = x;
      x += (b.w ?? (b.kind === 'popup' ? 22 : 26)) + 2;
      return [b.name, at];
    });
  };

  it('row 1 is as it was: the same names, order and x positions', () => {
    assert.deepEqual(xs(BUTTONS), [['style', 2], ['styleMenu', 100],
      ['font', 130], ['fontMenu', 240], ['size', 270], ['sizeMenu', 308],
      ['fontBigger', 332], ['fontSmaller', 360], ['bold', 394],
      ['italic', 422], ['underline', 450], ['strike', 478],
      ['superscript', 506], ['subscript', 534], ['color', 568],
      ['highlight', 596], ['alignLeft', 630], ['alignCenter', 658],
      ['alignRight', 686], ['alignJustify', 714], ['indentLess', 748],
      ['indentMore', 776], ['clearFormat', 810]]);
  });

  it('two rows; row 2\'s names are unique and not row 1\'s', () => {
    assert.equal(ROWS, 2);
    assert.equal(ROW_BUTTONS.length, ROWS);
    assert.equal(ROW_BUTTONS[0], BUTTONS);
    assert.equal(ROW_BUTTONS[1], BUTTONS2);
    assert.ok(Array.isArray(BUTTONS2) && Object.isFrozen(BUTTONS2));
    const names = BUTTONS2.map((b) => b.name);
    assert.equal(new Set(names).size, names.length);
    for (const n of names) {
      assert.ok(!BUTTONS.some((b) => b.name === n), n);
    }
    for (const b of BUTTONS2) assert.ok(b.help && b.help.length > 8);
  });

  it('row 2: line spacing first, an action button with wb_spacing ' +
    '(its popup: ToolbarBind), not run as a format', () => {
    const b = BUTTONS2[0];
    assert.equal(b.name, 'lineSpacing');
    assert.equal(b.kind, 'action');
    assert.equal(b.sprite, 'wb_spacing');
    assert.ok(Object.isFrozen(b));
    assert.ok(!ACTIONS.includes('lineSpacing'));
    assert.deepEqual(xs(BUTTONS2).slice(0, 1), [['lineSpacing', 2]]);
    assert.ok(barSprites().some(([n]) => n === 'wb_spacing'));
  });

  it('row 2: line spacing, then bullets and numbers, each a toggle ' +
    'with a popup; the toggles follow listKind', () => {
    assert.deepEqual(BUTTONS2.map((b) => [b.name, b.kind]),
      [['lineSpacing', 'action'], ['bullets', 'toggle'],
        ['bulletsMenu', 'popup'], ['numbers', 'toggle'],
        ['numbersMenu', 'popup'], ['painter', 'toggle']]);
    assert.equal(BUTTONS2[1].sprite, 'wb_bullets');
    assert.equal(BUTTONS2[3].sprite, 'wb_numbers');
    assert.ok(BUTTONS2[1].help.includes('Ctrl-Shift-L'));
    assert.deepEqual(LIST_TOGGLES, [
      ['bullets', 'listKind', 'bullet', 'bullets'],
      ['numbers', 'listKind', 'number', 'numbering']]);
    for (const [n, , , id] of LIST_TOGGLES) {
      assert.ok(isFormat(id), id);
      assert.ok(BUTTONS2.some((b) => b.name === n && b.kind === 'toggle'));
      // run by ToolbarBind with the FormatApply id, not by its name
      assert.ok(!ACTIONS.includes(n));
    }
    for (const n of ['wb_bullets', 'wb_numbers']) {
      assert.ok(barSprites().some(([s]) => s === n), n);
    }
    // the room the toolbar needs: both rows fit the first A4 window
    const fit = (list) => xs(list).at(-1)[1] + 28;
    assert.ok(fit(BUTTONS) <= 842, fit(BUTTONS));
    assert.ok(fit(BUTTONS2) <= 842, fit(BUTTONS2));
    assert.deepEqual(xs(BUTTONS2).map((x) => x[0]),
      ['lineSpacing', 'bullets', 'bulletsMenu', 'numbers',
        'numbersMenu', 'painter']);
  });

  it('row 2: the format painter is a toggle with wb_painter after ' +
    'the lists, run by ./PaintBind (not a FormatApply id)', () => {
    const b = BUTTONS2.at(-1);
    assert.equal(b.name, 'painter');
    assert.equal(b.kind, 'toggle');
    assert.equal(b.sprite, 'wb_painter');
    assert.ok(Object.isFrozen(b));
    assert.ok(b.help.includes('ADJUST') && b.help.includes('Escape'));
    assert.ok(!ACTIONS.includes('painter'));
    assert.ok(!LIST_TOGGLES.some((t) => t[0] === 'painter'));
    assert.ok(barSprites().some(([n]) => n === 'wb_painter'));
    assert.deepEqual(xs(BUTTONS2).at(-1), ['painter', 146]);
  });
});
