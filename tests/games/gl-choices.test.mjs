import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choicesStore } from '../../tools/games/!GameLib/Choices';
import { fakeChoices, fakeVfs, fakeSysvars } from './fakes.mjs';

const make = (vars = {}) => {
  const choices = fakeChoices(), vfs = fakeVfs();
  const store = choicesStore(
    { choices, vfs, sysvars: fakeSysvars(vars) }, 'Pacman');
  return { choices, vfs, store };
};

test('dir comes from Choices$Write or a fallback, and is made', () => {
  const a = make({ 'Choices$Write': '<Choices$Write>' });
  assert.equal(a.store.dir(), '<Choices$Write>.Pacman');
  assert.deepEqual(a.vfs.made[0], ['<Choices$Write>.Pacman',
    { parents: true }]);
  const b = make();
  assert.equal(b.store.dir(), 'ADFS::HardDisc4.$.!Boot.Choices.Pacman');
});

test('dir swallows a mkdir failure', () => {
  const a = make();
  a.vfs.fail = true;
  assert.equal(a.store.dir(), 'ADFS::HardDisc4.$.!Boot.Choices.Pacman');
});

test('read names the file and returns what is saved', async () => {
  const a = make();
  a.choices.files['Pacman.Settings'] = { look: 'x' };
  assert.deepEqual(await a.store.read('Settings', {}), { look: 'x' });
  assert.deepEqual(a.choices.reads, ['Pacman.Settings']);
});

test('a bad read gives a copy of the defaults', async () => {
  const defaults = { a: 1 };
  const a = make();
  a.choices.failRead = true;
  for (const v of ['str', null, [1]]) {
    a.choices.failRead = false;
    a.choices.files['Pacman.Settings'] = v;
    const r = await a.store.read('Settings', defaults);
    assert.deepEqual(r, defaults);
    assert.notEqual(r, defaults);
    r.a = 2;
    assert.equal(defaults.a, 1);
  }
  a.choices.failRead = true;
  assert.deepEqual(await a.store.read('Settings', defaults), defaults);
});

test('write returns true, or false without throwing', async () => {
  const a = make();
  assert.equal(await a.store.write('Scores', { x: 1 }), true);
  assert.deepEqual(a.choices.files['Pacman.Scores'], { x: 1 });
  a.choices.failWrite = true;
  assert.equal(await a.store.write('Scores', {}), false);
  a.choices.failWrite = false;
  a.vfs.fail = true;
  assert.equal(await a.store.write('Scores', {}), false);
});

test('dir survives a throwing system variable lookup', () => {
  const choices = fakeChoices(), vfs = fakeVfs();
  const store = choicesStore({ choices, vfs,
    sysvars: { get: () => { throw new Error('sysvar'); } } }, 'Pacman');
  assert.equal(store.dir(), 'ADFS::HardDisc4.$.!Boot.Choices.Pacman');
});

test('write survives a throwing system variable lookup', async () => {
  const choices = fakeChoices(), vfs = fakeVfs();
  const store = choicesStore({ choices, vfs,
    sysvars: { get: () => { throw new Error('sysvar'); } } }, 'Pacman');
  assert.equal(await store.write('Scores', {}), true);
});

test('defaults come back as an independent deep copy', async () => {
  const defaults = { a: 1, nest: { b: [1, 2] } };
  const a = make();
  const r = await a.store.read('Settings', defaults);
  assert.deepEqual(r, defaults);
  assert.notEqual(r.nest, defaults.nest);
  r.nest.b.push(3);
  r.nest.c = 1;
  assert.deepEqual(defaults, { a: 1, nest: { b: [1, 2] } });
});
