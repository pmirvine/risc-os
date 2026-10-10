// WordChoices, RecentFiles and AutoFormatOpt sharing Choices:Word
// ('riscos' replaced by stand-ins: a Map for the disc): each writes
// only its own key and keeps the others (also keys another writer
// put in the file meanwhile, and keys it does not know); missing,
// corrupt and hostile files; a write that fails; the menu item.
import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const disc = new Map();                // path -> text
let writes = 0, locked = false, inMemory = true;
const W = 'Choices:Word';
globalThis.__choiceStub = {
  vfs: {
    exists: (p) => disc.has(p) || /^RAM::/.test(p),
    async readText(p) {
      if (!disc.has(p)) throw new Error('not found');
      return disc.get(p);
    },
    readFileSync(p) {
      if (!inMemory) throw new Error('not loaded');
      return Uint8Array.from(disc.get(p), (c) => c.charCodeAt(0));
    },
    canonical: (p) => String(p),
  },
  choices: {
    write(name, value) {
      if (locked) throw new Error('locked');
      writes++;
      disc.set('Choices:' + name, JSON.stringify(value, null, 2) + '\n');
    },
  },
  Menu: class { constructor(t, items) { this.items = items; } },
};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__choiceStub;' +
  'export const vfs = s.vfs, choices = s.choices, Menu = s.Menu;');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {loadChoices, choiceOf, setChoice, mergeChoice} =
  await import('../../tools/moreapps/!Word/WordChoices');
const {loadRecent, noteRecent} =
  await import('../../tools/moreapps/!Word/RecentFiles');
const {autoListOn, setAutoList, autoListItem} =
  await import('../../tools/moreapps/!Word/AutoFormatOpt');

const file = () => JSON.parse(disc.get(W));
const start = async () => {
  const app = {};
  await loadRecent(app);
  return app;
};

beforeEach(() => {
  disc.clear();
  writes = 0;
  locked = false;
  inMemory = true;
});

describe('WordChoices', () => {
  it('mergeChoice: a new object, key set, others kept', () => {
    const a = {recent: ['x'], other: 1};
    const b = mergeChoice(a, 'autoList', false);
    assert.deepEqual(b, {recent: ['x'], other: 1, autoList: false});
    assert.deepEqual(a, {recent: ['x'], other: 1});
    for (const bad of [null, [], 'x', 3])
      assert.deepEqual(mergeChoice(bad, 'k', 1), {k: 1});
  });

  it('missing, corrupt and non-object files read as {}', async () => {
    for (const text of [undefined, 'not json {', '[1, 2]', '"x"',
      'null', '42']) {
      if (text === undefined) disc.delete(W);
      else disc.set(W, text);
      const app = {};
      await loadChoices(app);
      assert.deepEqual(app.choices, {}, String(text));
      assert.equal(autoListOn(app), true);
    }
  });

  it('one read per app; choiceOf own keys only', async () => {
    disc.set(W, '{"autoList": false, "__proto__": {"x": 1}}');
    const app = {};
    const p1 = loadChoices(app);
    assert.equal(loadChoices(app), p1);
    assert.deepEqual(app.choices, {}, 'empty until read');
    await p1;
    assert.equal(choiceOf(app, 'autoList'), false);
    assert.equal(choiceOf(app, 'toString'), undefined);
    assert.equal(choiceOf(app, 'x'), undefined);
    assert.equal(({}).x, undefined, 'no prototype changed');
  });
});

describe('Recent and AutoFormat lists share Choices:Word', () => {
  it('neither overwrites the other; unknown keys kept', async () => {
    disc.set(W, JSON.stringify({recent: ['RAM::R.$.A'], future: {a: 1}}));
    const app = await start();
    assert.deepEqual(app.recent, ['RAM::R.$.A']);
    assert.equal(autoListOn(app), true);
    await setAutoList(app, false);
    assert.deepEqual(file(), {recent: ['RAM::R.$.A'], future: {a: 1},
      autoList: false});
    noteRecent(app, 'RAM::R.$.B');
    assert.deepEqual(file(), {recent: ['RAM::R.$.B', 'RAM::R.$.A'],
      future: {a: 1}, autoList: false});
    // started again: both read back
    const again = await start();
    assert.equal(autoListOn(again), false);
    assert.deepEqual(again.recent, ['RAM::R.$.B', 'RAM::R.$.A']);
    await setAutoList(again, true);
    assert.deepEqual(file().recent, ['RAM::R.$.B', 'RAM::R.$.A']);
    assert.equal(file().autoList, true);
  });

  it('a key another writer put in the file meanwhile is kept',
    async () => {
      const app = await start();
      disc.set(W, JSON.stringify({recent: ['RAM::R.$.Z'], other: 2}));
      await setAutoList(app, false);
      assert.deepEqual(file(), {recent: ['RAM::R.$.Z'], other: 2,
        autoList: false});
      // the file not in memory: the cache is the base
      inMemory = false;
      noteRecent(app, 'RAM::R.$.C');
      inMemory = true;
      assert.deepEqual(file().other, 2);
      assert.deepEqual(file().recent, ['RAM::R.$.C']);
      assert.equal(file().autoList, false);
    });

  it('choices set before the read wait for it, in order',
    async () => {
      disc.set(W, JSON.stringify({recent: ['RAM::R.$.A']}));
      const app = {};
      const r = loadRecent(app);
      const p = setAutoList(app, false);
      noteRecent(app, 'RAM::R.$.B');
      assert.equal(writes, 0);
      await r;
      await p;
      await new Promise((res) => setTimeout(res, 0));
      assert.deepEqual(file(), {recent: ['RAM::R.$.B', 'RAM::R.$.A'],
        autoList: false});
    });

  it('a write that fails changes nothing else and never throws',
    async () => {
      const app = await start();
      locked = true;
      await setAutoList(app, false);
      assert.equal(autoListOn(app), false, 'kept for this run');
      assert.equal(disc.has(W), false);
    });

  it('hostile values: anything but false is on', async () => {
    for (const v of [0, null, 'false', [], {}, true]) {
      disc.set(W, JSON.stringify({autoList: v}));
      const app = {};
      await loadChoices(app);
      assert.equal(autoListOn(app), true, JSON.stringify(v));
    }
  });

  it('the menu item: ticked while on, choosing turns it over',
    async () => {
      const app = await start();
      const item = autoListItem(app);
      assert.equal(item.text, 'AutoFormat lists');
      assert.equal(item.ticked(), true);
      item.action();
      assert.equal(item.ticked(), false);
      assert.equal(file().autoList, false);
      item.action();
      assert.equal(item.ticked(), true);
      assert.equal(file().autoList, true);
    });
});
