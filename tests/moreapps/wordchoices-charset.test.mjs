// Choices:Letters keeps every character: the core writes the JSON as
// ASCII (src/core/charset.js asciiJSON, a \uXXXX escape for anything
// past 0x7E) and the file goes through RISC OS Latin-1 as the core's
// vfs does (encodeLatin1 on write, decodeLatin1 for readText), so a
// personal word or an author's name outside Latin-1 is never '?',
// and a file written before (Latin-1 bytes, a curly apostrophe as
// 0x91) still reads as it was meant. ('riscos' replaced by a
// stand-in that stores the bytes the core would.)
import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {encodeLatin1, decodeLatin1, asciiJSON}
  from '../../src/core/charset.js';

const disc = new Map();                // path -> Uint8Array
const W = 'Choices:Letters';
globalThis.__wcStub = {
  vfs: {
    exists: (p) => disc.has(p),
    async readText(p) { return decodeLatin1(disc.get(p)); },
    readFileSync(p) { return disc.get(p); },
  },
  choices: {
    write(name, value) {             // (as src/core/choices.js)
      disc.set('Choices:' + name, encodeLatin1(asciiJSON(value, 2) +
        '\n'));
    },
  },
};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__wcStub;' +
  'export const vfs = s.vfs, choices = s.choices;');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const L = '../../tools/moreapps/!Letters/';
const {loadChoices, choiceOf, setChoice} = await import(L + 'WordChoices');
const {addPersonal, personalWords} = await import(L + 'SpellOpts');

const WORDS = ['Łukasz', 'Dvořák', 'O’Hara',
  '\u{1F600}', 'Zoë', '€5', 'café—x'];
const NAME = 'Łukasz O’Hara \u{1F600}';

beforeEach(() => disc.clear());

describe('asciiJSON', () => {
  it('pure ASCII, and JSON.parse gives the value back', () => {
    const v = {userWords: WORDS, userName: NAME, k: 'a~\u007F\u0080',
      lone: '\uD800x', n: [1, true, null]};
    const t = asciiJSON(v, 2);
    for (let i = 0; i < t.length; i++) {
      assert.ok(t.charCodeAt(i) <= 0x7E, 'at ' + i);
    }
    assert.deepEqual(JSON.parse(t), v);
    assert.equal(asciiJSON({a: 'plain'}), '{"a":"plain"}');
    assert.equal(asciiJSON(undefined), undefined);
  });
  it('is linear: a long string of escapes', () => {
    const big = 'Ł'.repeat(400000);
    const t0 = performance.now();
    const t = asciiJSON([big]);
    assert.ok(performance.now() - t0 < 1000);
    assert.equal(JSON.parse(t)[0], big);
  });
});

describe('Choices:Letters keeps every character', () => {
  it('userWords and userName round trip, through another key\'s ' +
    'write and a new run', async () => {
    const app = {};
    await loadChoices(app);
    await setChoice(app, 'userWords', WORDS);
    await setChoice(app, 'userName', NAME);
    await setChoice(app, 'recent', ['RAM::R.$.A']);   // (re-reads)
    await setChoice(app, 'view', 'draft');
    assert.deepEqual(choiceOf(app, 'userWords'), WORDS);
    assert.equal(choiceOf(app, 'userName'), NAME);
    for (const b of disc.get(W)) assert.ok(b <= 0x7E);
    const again = {};
    await loadChoices(again);
    assert.deepEqual(choiceOf(again, 'userWords'), WORDS);
    assert.equal(choiceOf(again, 'userName'), NAME);
    await setChoice(again, 'spell', false);
    assert.deepEqual(choiceOf(again, 'userWords'), WORDS);
  });
  it('Add to Dictionary of words outside Latin-1 survives later ' +
    'writes', async () => {
    const app = {};
    await loadChoices(app);
    await addPersonal(app, 'Łukasz');
    await addPersonal(app, 'Dvořák');
    await setChoice(app, 'recent', ['RAM::R.$.B']);
    assert.deepEqual(personalWords(app), ['Łukasz',
      'Dvořák']);
    const again = {};
    await loadChoices(again);
    assert.deepEqual(personalWords(again), ['Łukasz',
      'Dvořák']);
  });
  it('a file written before (Latin-1 bytes) is read as meant, ' +
    'also when re-read for a write', async () => {
    const old = {userWords: ['Zoë', 'O’Hara'],
      userName: 'Renée ‘R’', recent: []};
    disc.set(W, encodeLatin1(JSON.stringify(old, null, 2)));
    assert.equal(disc.get(W).includes(0x91), true);
    const app = {};
    await loadChoices(app);
    assert.deepEqual(app.choices, old);
    await setChoice(app, 'view', 'web');
    assert.deepEqual(choiceOf(app, 'userWords'), old.userWords);
    assert.equal(choiceOf(app, 'userName'), old.userName);
    const again = {};
    await loadChoices(again);
    assert.deepEqual(choiceOf(again, 'userWords'), old.userWords);
    assert.equal(choiceOf(again, 'userName'), old.userName);
  });
});
