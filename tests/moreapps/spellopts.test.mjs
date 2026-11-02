// SpellOpts: the spell check settings and the personal word list.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const disc = new Map();
globalThis.__soStub = {
  vfs: {
    exists: (q) => disc.has(q),
    async readText(q) { return disc.get(q); },
    readFileSync(q) {
      return Uint8Array.from(disc.get(q), (c) => c.charCodeAt(0));
    },
  },
  choices: {write(name, value) {
    disc.set('Choices:' + name, JSON.stringify(value));
  }},
};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__soStub;' +
  'export const vfs = s.vfs, choices = s.choices;' +
  'export const reportError = () => {};');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const L = '../../tools/moreapps/!Letters/';
const O = await import(L + 'SpellOpts');
const {loadChoices, setChoice} = await import(L + 'WordChoices');

const fresh = async (stored) => {
  disc.clear();
  if (stored !== undefined) {
    disc.set('Choices:Letters', typeof stored === 'string' ? stored
      : JSON.stringify(stored));
  }
  const app = {};
  await loadChoices(app);
  return app;
};

describe('SpellOpts', () => {
  it('defaults: on, no words', async () => {
    const app = await fresh();
    assert.equal(O.spellOn(app), true);
    assert.deepEqual(O.personalWords(app), []);
  });
  it('corrupt values give the defaults', async () => {
    for (const bad of ['not json', {spell: 'no', userWords: 7},
      {spell: null, userWords: {a: 1}}, {userWords: 'zork'}]) {
      const app = await fresh(bad);
      assert.equal(O.spellOn(app), true);
      assert.deepEqual(O.personalWords(app), []);
    }
  });
  it('off is kept, the other keys stay', async () => {
    const app = await fresh({recent: ['x']});
    await O.setSpellOn(app, false);
    assert.equal(O.spellOn(app), false);
    const saved = JSON.parse(disc.get('Choices:Letters'));
    assert.deepEqual(saved, {recent: ['x'], spell: false});
    const again = await fresh(saved);
    assert.equal(O.spellOn(again), false);
    await O.setSpellOn(again, true);
    assert.equal(O.spellOn(again), true);
  });
  it('words are cleaned: strings, no spaces, bounded', async () => {
    const big = Array.from({length: 6000}, (_, i) => 'w' + i);
    const app = await fresh({userWords: ['Zork', 7, '', 'a b', null,
      ' blarg ', 'x'.repeat(100), ...big]});
    const got = O.personalWords(app);
    assert.deepEqual(got.slice(0, 2), ['Zork', 'blarg']);
    assert.equal(got.length, O.MAX_WORDS);
    assert.equal(O.personalWords(app), got);
  });
  it('addPersonal appends once, any case, and persists', async () => {
    const app = await fresh({userWords: ['Zork']});
    await O.addPersonal(app, 'blarg');
    await O.addPersonal(app, 'ZORK');
    await O.addPersonal(app, 'two words');
    await O.addPersonal(app, '');
    await O.addPersonal(app, 42);
    assert.deepEqual(O.personalWords(app), ['Zork', 'blarg']);
    assert.deepEqual(JSON.parse(disc.get('Choices:Letters')).userWords,
      ['Zork', 'blarg']);
  });
  it('addPersonal before the choices are read waits for them',
    async () => {
      disc.clear();
      disc.set('Choices:Letters', JSON.stringify({userWords: ['a1']}));
      const app = {};
      loadChoices(app);
      await O.addPersonal(app, 'b2');
      assert.deepEqual(O.personalWords(app), ['a1', 'b2']);
    });
});

describe('SpellOpts: the word as it is looked up', () => {
  it('addPersonal keeps the plain form: straight apostrophe, no ' +
    'format characters; one entry whichever form', async () => {
    const app = await fresh();
    await O.addPersonal(app, 'O’Hara');
    await O.addPersonal(app, "o'hara");
    await O.addPersonal(app, 'zo­rk');
    await O.addPersonal(app, 'ZO​RK');
    assert.deepEqual(O.personalWords(app), ["O'Hara", 'zork']);
    assert.deepEqual(JSON.parse(disc.get('Choices:Letters')).userWords,
      ["O'Hara", 'zork']);
  });
});

describe('SpellOpts: another choice written', () => {
  it('the list keeps its identity, and a state checks nothing again',
    async () => {
      const {readDocx} = await import(L + 'DocxRead');
      const {Document} = await import(L + 'Document');
      const {buildDocx, documentXml, p, r} =
        await import('./build-docx.mjs');
      const {SpellState} = await import(L + 'SpellState');
      const {checkPara} = await import(L + 'SpellCheck');
      const app = await fresh({userWords: ['Zork', 'blarg']});
      const a = O.personalWords(app);
      await setChoice(app, 'recent', ['RAM::R.$.A']);
      await setChoice(app, 'view', 'draft');
      assert.notEqual(app.choices.userWords, undefined);
      assert.equal(O.personalWords(app), a);
      const d = new Document(await readDocx(await buildDocx(
        {'word/document.xml': documentXml(p(r('zork teh')))})));
      let n = 0;
      const dict = {has: (w) => w === 'zork'};
      const st = new SpellState({d, app}, {dict, now: () => 0,
        check: (...x) => { n++; return checkPara(...x); }});
      const q = d.doc.sections[0].blocks[0];
      st.ensure([q]);
      assert.equal(n, 1);
      const gen = st._gen;
      await setChoice(app, 'recent', ['RAM::R.$.B']);
      await O.setSpellOn(app, true);
      assert.notEqual(st.flagsOf(q), null);
      assert.equal(st._gen, gen);
      st.ensure([q]);
      assert.equal(n, 1);
      await O.addPersonal(app, 'teh');  // (a real change: checked)
      assert.equal(st.flagsOf(q), null);
      st.ensure([q]);
      assert.equal(n, 2);
      assert.deepEqual(st.flagsOf(q), []);
      st.stop();
    });
});
