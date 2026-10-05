// FontLoad with fake vfs, document and FontFace.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {loadFonts} from '../../tools/moreapps/!Word/FontLoad';
import {fontsToLoad} from '../../tools/moreapps/!Word/FontMap';

const MOD = '../../tools/moreapps/!Word/FontLoad';

function fakes(missing = []) {
  const added = [], reads = [];
  class FF {
    constructor(family, bytes, desc) {
      Object.assign(this, {family, bytes, desc, status: 'unloaded',
        weight: desc.weight, style: desc.style});
    }
    async load() { this.status = 'loaded'; return this; }
  }
  const vfs = {async readFile(p) {
    reads.push(p);
    if (missing.some((m) => p.endsWith(m))) throw new Error('nf ' + p);
    return new Uint8Array([0, 1, 0, 0]);
  }};
  // a FontFaceSet: add and iteration
  const doc = {fonts: {add: (f) => added.push(f),
    [Symbol.iterator]: () => added[Symbol.iterator]()}};
  return {FF, vfs, doc, added, reads};
}

describe('FontLoad', () => {
  it('loads a family in four styles with weight and style', async () => {
    const {FF, vfs, doc, added, reads} = fakes();
    const r = await loadFonts(vfs, 'HD.MoreApps.!Word.Fonts', doc,
      ['Carlito'], FF);
    assert.equal(r.loaded.length, 4);
    assert.deepEqual(r.failed, []);
    assert.ok(reads.includes('HD.MoreApps.!Word.Fonts.Carlito-BoldItalic'));
    const bi = added.find((f) => f.desc.weight === 'bold' &&
      f.desc.style === 'italic');
    assert.equal(bi.family, 'Carlito');
    assert.ok(added.some((f) => f.desc.weight === 'normal' &&
      f.desc.style === 'normal'));
  });
  it('is idempotent', async () => {
    const {FF, vfs, doc, added} = fakes();
    await loadFonts(vfs, 'd', doc, ['Carlito'], FF);
    const r = await loadFonts(vfs, 'd', doc, ['Carlito'], FF);
    assert.equal(added.length, 4);
    assert.equal(r.loaded.length, 4);
  });
  it('collects failures without throwing', async () => {
    const {FF, vfs, doc, added} = fakes(['Caladea-Bold']);
    const r = await loadFonts(vfs, 'd', doc, ['Caladea'], FF);
    assert.deepEqual(r.failed, ['Caladea-Bold']);
    assert.equal(r.loaded.length, 3);
    assert.equal(added.length, 3);
    const again = await loadFonts(vfs, 'd', doc, ['Caladea'], FF);
    assert.deepEqual(again.failed, ['Caladea-Bold']);
  });
  it('defaults to all five families', async () => {
    const {FF, vfs, doc, added} = fakes();
    await loadFonts(vfs, 'd', doc, undefined, FF);
    assert.equal(added.length, 20);
  });
  it('skips families that are not bundled without reporting them', async () => {
    const {FF, vfs, doc, added, reads} = fakes();
    const r = await loadFonts(vfs, 'd', doc, ['Homerton', 'Comic'], FF);
    assert.deepEqual(r, {loaded: [], failed: []});
    assert.equal(added.length + reads.length, 0);
  });
  it('parallel calls share one read and one FontFace per leaf', async () => {
    const {FF, vfs, doc, added, reads} = fakes();
    const [a, b] = await Promise.all([
      loadFonts(vfs, 'd', doc, ['Carlito'], FF),
      loadFonts(vfs, 'd', doc, ['Carlito'], FF)]);
    assert.equal(reads.length, 4);
    assert.equal(added.length, 4);
    assert.equal(a.loaded.length, 4);
    assert.equal(b.loaded.length, 4);
  });
  it('a failed leaf can be retried', async () => {
    const miss = ['Caladea-Bold'];
    const {FF, vfs, doc, added} = fakes(miss);
    await loadFonts(vfs, 'd', doc, ['Caladea'], FF);
    miss.length = 0;
    const r = await loadFonts(vfs, 'd', doc, ['Caladea'], FF);
    assert.deepEqual(r.failed, []);
    assert.equal(added.length, 4);
  });
  it('a new run of !Word (a fresh module) adds no face twice',
    async () => {
      const {FF, vfs, doc, added, reads} = fakes();
      const one = (await import(MOD + '?run1')).loadFonts;
      const two = (await import(MOD + '?run2')).loadFonts;
      assert.notEqual(one, two);
      await one(vfs, 'd', doc, ['Carlito'], FF);
      await two(vfs, 'd', doc, ['Carlito'], FF);
      assert.equal(added.length, 4);
      assert.equal(reads.length, 4);
      // and in parallel: the second run joins the first one's work
      const f2 = fakes();
      const three = (await import(MOD + '?run3')).loadFonts;
      const [a, b] = await Promise.all([
        three(f2.vfs, 'd', f2.doc, ['Caladea'], f2.FF),
        (await import(MOD + '?run4')).loadFonts(f2.vfs, 'd', f2.doc,
          ['Caladea'], f2.FF)]);
      assert.equal(f2.added.length, 4);
      assert.equal(f2.reads.length, 4);
      assert.equal(a.loaded.length + b.loaded.length, 8);
    });
  it('reuses a face the page already has', async () => {
    const {FF, vfs, doc, added, reads} = fakes();
    // as a browser reports them: quoted family, numeric weight
    for (const [weight, style] of [['400', 'normal'], ['700', 'normal'],
      ['normal', 'italic'], ['bold', 'italic']]) {
      added.push({family: '"Carlito"', weight, style, status: 'loaded'});
    }
    const r = await loadFonts(vfs, 'd', doc, ['Carlito'], FF);
    assert.equal(r.loaded.length, 4);
    assert.equal(reads.length, 0);
    assert.equal(added.length, 4);
  });
  it('does not reuse a face that failed', async () => {
    const {FF, vfs, doc, added, reads} = fakes();
    added.push({family: 'Carlito', weight: 'normal', style: 'normal',
      status: 'error'});
    await loadFonts(vfs, 'd', doc, ['Carlito'], FF);
    assert.equal(reads.length, 4);
    assert.equal(added.length, 5);
  });
});

describe('fontsToLoad', () => {
  it('the bundled families used, and the fallbacks of the others', () => {
    assert.deepEqual(fontsToLoad(['Carlito', 'Caladea']),
      ['Caladea', 'Carlito']);
    assert.deepEqual(fontsToLoad(['Carlito', 'Verdana']),
      ['Carlito', 'Liberation Sans']);
    assert.deepEqual(fontsToLoad(['Trinity']), ['Liberation Serif']);
    assert.deepEqual(fontsToLoad([]), []);
    assert.deepEqual(fontsToLoad(['Liberation Sans', 'Comic']),
      ['Liberation Sans']);
  });
});
