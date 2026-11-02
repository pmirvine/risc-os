// SpellSuggest on the bundled en_GB.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {parseDict} from '../../tools/moreapps/!Letters/SpellDict';
import {loadDict, DICT_DIR} from '../../tools/moreapps/!Letters/SpellLoad';
import {suggest} from '../../tools/moreapps/!Letters/SpellSuggest';

const ROOT = new URL('../../tools/moreapps/!Letters/', import.meta.url);
const HAVE = existsSync(new URL('Dict/en_GB_dic', ROOT));
const fsReader = async (p) =>
  new Uint8Array(readFileSync(new URL(p.split('.').join('/'), ROOT)));
const opts = {skip: !HAVE && 'no Dict/'};

// One warm-up call, then the fastest of six: load only adds time.
const timed = (f, tries = 6) => {
  let r = f(), best = Infinity;
  for (let i = 0; i < tries; i++) {
    const t = performance.now();
    r = f();
    best = Math.min(best, performance.now() - t);
  }
  return {r, ms: best};
};

describe('SpellSuggest', opts, () => {
  let d;
  it('loads', async () => {
    d = parseDict(await loadDict(fsReader, DICT_DIR));
  });
  it('finds the intended word in the first five', () => {
    for (const [bad, good] of [['teh', 'the'], ['recieve', 'receive'],
      ['colur', 'colour'], ['wich', 'which'],
      ['definately', 'definitely'], ['seperate', 'separate'],
      ['Londn', 'London']]) {
      const s = suggest(d, bad);
      assert.ok(s.includes(good), bad + ' -> ' + s.join());
      assert.ok(s.length <= 5);
    }
  });
  it('is empty for a valid word', () => {
    assert.deepEqual(suggest(d, 'ORGANISE'), []);
    assert.deepEqual(suggest(d, 'colour'), []);
  });
  it('results are valid, distinct, not the input', () => {
    for (const w of ['teh', 'recieve', 'wrnog', 'Colur', 'xyzzyq']) {
      const s = suggest(d, w, 8);
      assert.equal(new Set(s).size, s.length);
      for (const x of s) assert.ok(d.has(x) && x !== w, x);
    }
  });
  it('carries case over', () => {
    assert.ok(suggest(d, 'Teh').includes('The'));
    assert.ok(suggest(d, 'Teh').every((x) => /^[A-Z]/.test(x)));
    const up = suggest(d, 'RECIEVE');
    assert.ok(up.includes('RECEIVE'));
    assert.ok(up.every((x) => x === x.toUpperCase()));
    assert.ok(suggest(d, 'teh').every((x) => x === x.toLowerCase()));
  });
  it('bounds long nonsense', () => {
    const {r, ms} = timed(() => suggest(d, 'q'.repeat(50)));
    assert.deepEqual(r, []);
    assert.ok(ms < 100, ms + ' ms');
    suggest(d, 'x'.repeat(5000));
  });
  it('plausible long misspellings are quick and right', () => {
    for (const [bad, good] of [['goverment', 'government'],
      ['accomodate', 'accommodate'], ['occured', 'occurred'],
      ['untill', 'until'],
      ['internationalisatoin', 'internationalisation'],
      ["o'clok", "o'clock"], ['tink', 'think'], ['wen', 'when']]) {
      const {r: s, ms} = timed(() => suggest(d, bad));
      assert.ok(ms < 50, bad + ' ' + ms + ' ms');
      assert.ok(s.slice(0, 5).includes(good), bad + ' -> ' + s.join());
    }
  });
  it('invents no hyphens', () => {
    for (const w of ['occured', 'untill', 'internationalisatoin']) {
      assert.ok(suggest(d, w, 8).every((x) => !x.includes('-')), w);
    }
  });
  it('stray punctuation does not cost the right word', () => {
    for (const [bad, good] of [['recieve-', 'receive'],
      ['goverment-', 'government'], ['wrnog.', 'wrong']]) {
      const {r: s, ms} = timed(() => suggest(d, bad));
      assert.ok(ms < 50, bad + ' ' + ms + ' ms');
      assert.ok(s.slice(0, 5).includes(good), bad + ' -> ' + s.join());
    }
    for (const w of ['ther-', 'co-oprate']) {
      assert.ok(suggest(d, w).every((x) =>
        x.split('-').every((q) => q && d.has(q))), w);
    }
  });
  it('keeps REP abbreviations', () => {
    assert.ok(suggest(d, 'eg').includes('e.g.'));
    assert.ok(suggest(d, 'ie').includes('i.e.'));
    assert.ok(suggest(d, 'ie.').includes('i.e.'));
    assert.ok(suggest(d, 'eg.').includes('e.g.'));
  });
  it('tries no dot in a word without one', () => {
    const f = suggest(d, 'flcght');
    assert.ok(f.includes('flat') && f.includes('fact'), f.join());
    assert.ok(suggest(d, 'namiety').includes('amity'));
    assert.ok(suggest(d, 'halgow').includes('halo'));
    for (const w of ['ming', 'edzc', 'etc', 'flcght', 'namiety']) {
      const s = suggest(d, w);
      assert.ok(s.every((x) => !x.includes('.')), w + ' -> ' + s);
    }
    // a dot from REP stays
    assert.ok(suggest(d, 'eg').filter((x) => x.includes('.'))
      .every((x) => x === 'e.g.'));
  });
  it('refuses input that is not a word', () => {
    for (const w of ['', ' ', 'a b', '\ud800', '123', '\u0001x',
      "'", "''", "'''", '\u00a0', '\u2003']) {
      assert.deepEqual(suggest(d, w), [], JSON.stringify(w));
    }
  });
  it('200 calls under 2 s', () => {
    const ws = ['teh', 'recieve', 'wich'];
    const {ms} = timed(() => {
      for (let i = 0; i < 200; i++) suggest(d, ws[i % 3]);
    }, 3);
    assert.ok(ms < 2000, ms + ' ms');
  });
});
