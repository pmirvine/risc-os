// ListMenu: the hint characters of the bullet menu are in the desktop
// font (Homerton), as the menus draw with it; the real bullets of
// BulletGlyph (U+25E6 and others) are not, which is why the menu uses
// look-alikes. Also the set is one per bullet of the gallery.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {BULLETS} from '../../tools/moreapps/!Word/ListGallery';
import {MENU_GLYPHS} from '../../tools/moreapps/!Word/BulletGlyph';

const ot = createRequire(new URL('../../tools/', import.meta.url))('opentype.js');
const b = fs.readFileSync(new URL('../../assets/fonts/Homerton-Medium.otf', import.meta.url));
const font = ot.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const has = (ch) => font.charToGlyphIndex(ch) > 0;

describe('ListMenu hint glyphs', () => {
  it('one covered single character per gallery bullet', () => {
    assert.deepEqual(Object.keys(MENU_GLYPHS), BULLETS.map((e) => e.id));
    for (const [id, ch] of Object.entries(MENU_GLYPHS)) {
      assert.equal([...ch].length, 1, id);
      assert.ok(has(ch), `${id} ${ch.codePointAt(0).toString(16)} missing in Homerton`);
    }
  });
  it('the check itself works: the real shapes are not in Homerton', () => {
    for (const ch of ['◦', '▪', '➢', '➔', '✓']) assert.ok(!has(ch), ch);
    assert.ok(has('•'));
  });
});
