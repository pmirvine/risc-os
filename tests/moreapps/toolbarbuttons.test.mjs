// !Word ToolbarButtons: the toolbar's buttons are formatting commands
// the view knows, with sprites that exist (!Word's own, drawn by
// tools/moreapps/icon.mjs, or the Wimp's), help text, and unique
// names; and the sprites themselves are 20 x 20 and fit the pool.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {BUTTONS, ACTIONS, TOGGLES, ALIGNS, BAR_H}
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
    for (const b of BUTTONS) {
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
});
