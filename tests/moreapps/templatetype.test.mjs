// The Word template file type (&A83, MSWordT): in the type tables, the
// boot files, !Letters' Open and the sprites; no other type uses it.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {iconFiles} from '../../tools/moreapps/icon.mjs';
import {typeFromExtension as ext} from '../../src/core/hostfs/mimemap.js';
import * as O from '../../tools/moreapps/!Letters/Open';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'latin1');
const count = (s, re) => (s.match(re) || []).length;

describe('template file type &A83', () => {
  it('is in tools/misc.mjs once, as MSWordT', () => {
    const s = read('tools/misc.mjs');
    assert.equal(count(s, /\ba83: 'MSWordT'/g), 1);
    assert.equal(count(s, /\ba83\b/gi), 1);
  });
  it('is the type of .dotx and of nothing else', () => {
    assert.equal(ext('a.dotx'), 0xa83);
    assert.equal(ext('a.DOTX'), 0xa83);
    assert.equal(ext('a.docx'), 0xa7e);
    assert.equal(ext('a.odt'), 0xa81);
    assert.equal(ext('a.doc'), 0xae6);
    const src = read('src/core/hostfs/mimemap.js');
    assert.equal(count(src, /0xa83/gi), 1);
  });
  for (const f of ['!Boot', '!Run']) {
    it(`${f} claims it and keeps the others`, () => {
      const lines = read('tools/moreapps/!Letters/' + f).split(/\r?\n/);
      assert.equal(lines.filter((l) => l === 'Set File$Type_A83 MSWordT').length, 1);
      assert.equal(lines.filter((l) => l ===
        'Set Alias$@RunType_A83 Run <Letters$Dir>.!Run %%*0').length, 1);
      for (const t of ['A7E', 'C32', 'A81', 'AE6']) {
        assert.equal(count(lines.join('\n'), new RegExp(`File\\$Type_${t} `, 'g')), 1, t);
      }
    });
  }
  it('Open exports TEMPLATE_TYPE and formatOfType names it', () => {
    assert.equal(O.TEMPLATE_TYPE, 0xA83);
    assert.equal(O.formatOfType(0xA83), 'template');
    assert.equal(O.formatOfType(0xA7E), 'docx');
    assert.equal(O.formatOfType(0xA81), 'odt');
    assert.equal(O.formatOfType(0xAE6), 'doc');
    assert.equal(O.formatOfType(0xC32), 'rtf');
    assert.equal(O.formatOfType(0xFFF), null);
    assert.ok(!Object.values(O.IMPORT_TYPES).includes(0xA83));
    assert.ok(!Object.values(O.FILETYPES).includes(0xA83));
  });
  it('has file_a83 (34 x 34) and small_a83 (18 x 18), unlike the others', () => {
    const f = iconFiles()['!Sprites'];
    const out = {};
    for (let o = 12; o < f.length;) {
      const n = f.readUInt32LE(o);
      out[f.subarray(o + 4, o + 16).toString('latin1').replace(/\0+$/, '')] =
        [f.readUInt32LE(o + 20) + 1, f.subarray(o, o + n).toString('hex')];
      o += n;
    }
    assert.equal(out.file_a83?.[0], 34);
    assert.equal(out.small_a83?.[0], 18);
    for (const t of ['a7e', 'ae6', 'a81']) {
      assert.notEqual(out.file_a83[1].slice(40), out['file_' + t][1].slice(40));
      assert.notEqual(out.small_a83[1].slice(40), out['small_' + t][1].slice(40));
    }
  });
});
