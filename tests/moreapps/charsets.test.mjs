// WimpLib/CharSets: the symbol sets hold only characters that Carlito,
// Liberation Sans and Liberation Serif have (read from the fonts' cmap
// tables, all 12 files: four styles each; Caladea and Liberation Mono
// are not asked, see CharSets), none twice in a set, no controls or
// spaces; the labels the grid shows; the special characters of Insert
// > Special character.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {SETS, setById, setOf, codeLabel, statusText}
  from '../../tools/moreapps/!WimpLib/CharSets';
import {SPECIAL, specialFor}
  from '../../tools/moreapps/!Word/SpecialChars';

const ot = createRequire(new URL('../../tools/', import.meta.url))('opentype.js');
const dir = new URL('../../tools/moreapps/!Word/Fonts/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /-(Regular|Bold|Italic|BoldItalic)$/.test(f));
const asked = (f) => /^(Carlito|LiberationSans|LiberationSerif)-/.test(f);
const load = (f) => {
  const b = fs.readFileSync(new URL(f, dir));
  return {f, font: ot.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))};
};
const caladea = files.filter((f) => f.startsWith('Caladea-')).map(load);
const fonts = files.filter(asked)
  .map((f) => {
    const b = fs.readFileSync(new URL(f, dir));
    return {f, font: ot.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))};
  });
const lacks = (set, ch) => set.filter((x) => x.font.charToGlyphIndex(ch) <= 0).map((x) => x.f);
const missing = (ch) => fonts.filter((x) => x.font.charToGlyphIndex(ch) <= 0).map((x) => x.f);

describe('CharSets', () => {
  it('the 12 font files of Carlito, Liberation Sans and Liberation Serif are read (of 20 bundled)', () => {
    assert.equal(fonts.length, 12);
    assert.equal(files.length, 20);
    assert.equal(caladea.length, 4);
  });
  it('every character of every set is in all 12 asked font files', () => {
    for (const s of SETS) {
      for (const ch of s.chars) {
        assert.deepEqual(missing(ch), [], `${s.id} ${codeLabel(ch)}`);
      }
    }
  });
  it('the check itself works: characters the fonts lack are found missing', () => {
    for (const ch of ['✓', '■', '中', 'ก']) assert.ok(missing(ch).length > 0, ch);
    assert.deepEqual(missing('e'), []);
    assert.deepEqual(missing('α'), []);
  });
  it('why Caladea is not asked: it has no Greek, Cyrillic or most geometric shapes (the browser falls back)', () => {
    for (const ch of ['α', 'Ж', '●']) assert.equal(lacks(caladea, ch).length, 4, ch);
  });
  it('sets: unique ids and names, no duplicate character in a set, nothing blank or a control', () => {
    assert.equal(new Set(SETS.map((s) => s.id)).size, SETS.length);
    assert.equal(new Set(SETS.map((s) => s.name)).size, SETS.length);
    for (const s of SETS) {
      assert.ok(s.chars.length > 0, s.id);
      assert.equal(new Set(s.chars).size, s.chars.length, `${s.id} has a duplicate`);
      for (const ch of s.chars) {
        const c = ch.charCodeAt(0);
        assert.ok(c > 0xA0 && c !== 0xAD && !(c >= 0x2000 && c <= 0x200F) && !(c >= 0x2028 && c <= 0x202F) && c !== 0xFFFC, `${s.id} ${codeLabel(ch)}`);
        assert.ok(!(ch >= '\uD800' && ch <= '\uDFFF'), s.id);
      }
    }
  });
  it('the sets asked for are there, in order', () => {
    assert.deepEqual(SETS.map((s) => s.id), ['latin1', 'latinA', 'greek', 'cyrillic', 'punct', 'currency', 'letterlike', 'arrows', 'maths', 'shapes']);
    assert.ok(setById('greek').chars.includes('Ω') && setById('cyrillic').chars.includes('Ж'));
    assert.ok(setById('shapes').chars.includes('●'));
    assert.ok(setById('latin1').chars.includes('é'));
    assert.ok(setById('punct').chars.includes('—'));
    assert.equal(setById('__proto__'), null);
    assert.equal(setById('constructor'), null);
    assert.equal(setById(undefined), null);
  });
  it('the source file is Latin-1 (ASCII), 72 columns, 250 lines', () => {
    for (const p of ['../../tools/moreapps/!WimpLib/CharSets', '../../tools/moreapps/!Word/SpecialChars']) {
      const t = fs.readFileSync(new URL(p, import.meta.url), 'latin1');
      assert.ok(!/[^\n\x20-\x7e]/.test(t), p);
      const lines = t.replace(/\n$/, '').split('\n');
      assert.ok(lines.length <= 250 && lines.every((l) => l.length <= 72), p);
    }
  });
  it('labels: U+00E9 and the status line', () => {
    assert.equal(codeLabel('é'), 'U+00E9');
    assert.equal(codeLabel('€'), 'U+20AC');
    assert.equal(codeLabel('\u0007'), 'U+0007');
    assert.equal(statusText('é'), 'U+00E9  Latin-1');
    assert.equal(statusText('é', 'latin1'), 'U+00E9  Latin-1');
    assert.equal(statusText('¢', 'currency'), 'U+00A2  Currency');
    assert.equal(statusText('¢'), 'U+00A2  Latin-1');
    assert.equal(statusText('z'), 'U+007A');
  });
  it('setOf: the first set, or the given one first; nothing for odd input', () => {
    assert.equal(setOf('—').id, 'punct');
    assert.equal(setOf('±').id, 'latin1');
    assert.equal(setOf('±', 'maths').id, 'maths');
    assert.equal(setOf('±', 'nonsense').id, 'latin1');
    for (const bad of ['', 'ab', null, undefined, 5, '😀', {}]) assert.equal(setOf(bad), null);
  });
  it('Special character: every typed character is in a set (so in every font); the items are what the plan lists', () => {
    assert.deepEqual(SPECIAL.map((x) => x.text), ['Em dash', 'En dash', 'Non-breaking space',
      'Non-breaking hyphen', 'Optional hyphen', 'Copyright', 'Registered', 'Trademark', 'Section', 'Paragraph',
      'Ellipsis', 'Single opening quote', 'Single closing quote', 'Double opening quote', 'Double closing quote', 'Degree']);
    for (const x of SPECIAL) {
      assert.ok(Boolean(x.ch) !== Boolean(x.cmd), x.text);
      if (x.ch) {
        assert.ok(setOf(x.ch), x.text);
        assert.deepEqual(missing(x.ch), [], x.text);
      }
    }
    assert.deepEqual(SPECIAL.filter((x) => x.cmd).map((x) => x.cmd), ['nbsp', 'nbHyphen', 'softHyphen']);
    assert.equal(specialFor('Degree').ch, '°');
    assert.equal(specialFor('nothing'), null);
    assert.equal(new Set(SPECIAL.map((x) => x.ch).filter(Boolean)).size, SPECIAL.filter((x) => x.ch).length);
  });
});
