// SpellLoad: the bundled en_GB dictionary read through a reader.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadDict, DICT_DIR} from '../../tools/moreapps/!Letters/SpellLoad';

const ROOT = new URL('../../tools/moreapps/!Letters/', import.meta.url);
const fsReader = async (p) =>
  new Uint8Array(readFileSync(new URL(p.split('.').join('/'), ROOT)));
const KEY = Symbol.for('letters.spell.dict');

describe('SpellLoad', () => {
  it('reads dic and aff, decoded, no BOM', async () => {
    delete globalThis[KEY];
    const d = await loadDict(fsReader, DICT_DIR);
    assert.match(d.dic.split('\n')[0], /^\d+$/);
    assert.ok(d.aff.includes('SET UTF-8'));
    assert.ok(!d.dic.startsWith('﻿'));
    assert.ok(!d.aff.startsWith('﻿'));
  });
  it('is memoised', async () => {
    const a = loadDict(fsReader, DICT_DIR);
    assert.equal(loadDict(fsReader, DICT_DIR), a);
  });
  it('rejects with an Error when the reader fails, and retries', async () => {
    delete globalThis[KEY];
    const bad = async () => { throw new Error('no disc'); };
    await assert.rejects(loadDict(bad, DICT_DIR), Error);
    const d = await loadDict(fsReader, DICT_DIR);
    assert.ok(d.dic.length > 1e6);
  });
});
