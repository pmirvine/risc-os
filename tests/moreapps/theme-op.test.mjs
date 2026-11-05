// setTheme op and ThemeDoc: theme edits undo exactly, and are saved.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newDoc, writeDocx}
  from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {COLOR_SCHEMES, FONT_PAIRS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';
import {themeBytes} from '../../tools/moreapps/!Letters/ThemeDefault';
import {emit} from './word-emit.mjs';

const P = 'word/theme/theme1.xml';
const snap = (doc) => ({parts: new Map(doc.parts), rels: doc.rels,
  theme: doc.styles.theme});
const same = (a, b) => {
  assert.deepEqual([...a.parts.keys()], [...b.parts.keys()]);
  for (const [k, v] of a.parts) assert.equal(b.parts.get(k), v, k);
  assert.deepEqual(a.rels, b.rels);
  assert.deepEqual(a.theme, b.theme);
};
const make = () => new Document(newDoc());
const bare = () => {
  const doc = newDoc();
  doc.parts.delete(P);
  doc.rels = doc.rels.filter((r) => r.target !== 'theme/theme1.xml');
  delete doc.styles.theme;
  return new Document(doc);
};
const pair = FONT_PAIRS.find((f) => f.name === 'Garamond');
const scheme = COLOR_SCHEMES.find((s) => s.name === 'Paper');

describe('setTheme', () => {
  it('applies, undoes and redoes with identity kept', () => {
    const d = make(), before = snap(d.doc);
    assert.deepEqual(TD.setFonts(d, pair), {ok: true});
    const after = snap(d.doc);
    assert.equal(parse(d.doc.parts.get(P)).major, 'Garamond');
    assert.deepEqual(d.doc.styles.theme, parse(d.doc.parts.get(P)));
    for (const [k, v] of before.parts) {
      if (k !== P) assert.equal(d.doc.parts.get(k), v, k);
    }
    d.undo();
    same(snap(d.doc), before);
    d.redo();
    same(snap(d.doc), after);
  });
  it('raw op returns its inverse', () => {
    const doc = newDoc(), old = doc.parts.get(P);
    const inv = apply(doc, {op: 'setTheme', value: themeBytes()});
    assert.equal(inv.value, old);
    assert.throws(() => apply(doc, {op: 'setTheme', value: 'x'}));
    assert.throws(() => apply(doc,
      {op: 'setTheme', value: themeBytes(), story: 'x'}));
  });
  it('adds part and relationship when absent; undo removes', () => {
    const d = bare(), before = snap(d.doc);
    assert.deepEqual(TD.setColors(d, scheme), {ok: true});
    assert.ok(d.doc.parts.has(P));
    const r = d.doc.rels.filter((x) => x.target === 'theme/theme1.xml');
    assert.equal(r.length, 1);
    assert.match(r[0].type, /\/theme$/);
    assert.equal(new Set(d.doc.rels.map((x) => x.id)).size,
      d.doc.rels.length);
    d.undo();
    same(snap(d.doc), before);
    assert.equal(d.doc.styles.theme, undefined);
  });
  it('refusal changes nothing', () => {
    const d = make(), before = snap(d.doc);
    const r = TD.setFonts(d, {major: '<x>', minor: 'Arial'});
    assert.equal(typeof r.refused, 'string');
    assert.equal(TD.setColors(d, {name: 'x', slots: {}}).ok, undefined);
    same(snap(d.doc), before);
    d.undo();
    same(snap(d.doc), before);
  });
  it('recognises presets and Custom', () => {
    const d = make();
    for (const s of COLOR_SCHEMES) {
      TD.setColors(d, s);
      assert.equal(TD.colorsOf(d).name, s.name);
    }
    for (const f of FONT_PAIRS) {
      TD.setFonts(d, f);
      assert.equal(TD.fontsOf(d).name, f.name);
    }
    TD.setColors(d, {...scheme, slots: {...scheme.slots,
      accent1: '123456'}});
    assert.equal(TD.colorsOf(d).name, 'Custom');
    TD.setFonts(d, {major: 'Arial', minor: 'Verdana'});
    assert.equal(TD.fontsOf(d).name, 'Custom');
    TD.reset(d);
    assert.equal(TD.colorsOf(d).name, 'Office 2013 - 2022');
    assert.equal(TD.fontsOf(d).major, 'Calibri Light');
  });
  it('is one undo step per edit', () => {
    const d = bare(), before = snap(d.doc);
    TD.setFonts(d, pair);
    d.undo();
    same(snap(d.doc), before);
  });
  it('is saved and read back byte for byte', async () => {
    for (const mk of [make, bare]) {
      const d = mk();
      if (mk === bare) {
        // rId3 taken: the added theme relationship gets rId4
        const t = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
          'relationships/hyperlink';
        d.doc.rels = [...d.doc.rels, {id: 'rId3', type: t,
          target: 'https://example.com/', mode: 'External',
          attrs: [['Id', 'rId3'], ['Type', t],
            ['Target', 'https://example.com/'],
            ['TargetMode', 'External']]}];
      }
      TD.setFonts(d, pair);
      TD.setColors(d, scheme);
      const out = await writeDocx(d.doc);
      emit(mk === bare ? 'theme-absent-added' : 'theme-both', out);
      const back = {doc: await readDocx(out)};
      assert.deepEqual(back.doc.parts.get(P), d.doc.parts.get(P));
      assert.deepEqual(back.doc.styles.theme, d.doc.styles.theme);
      if (mk === bare) assert.ok(d.doc.rels.some((r) => r.id === 'rId4'));
      assert.equal(back.doc.parts.get(P).length > 0, true);
      assert.ok(back.doc.rels.some((r) => r.target === 'theme/theme1.xml'));
    }
  });
  it('writes the content type of an added part', async () => {
    const d = bare();
    d.doc.meta = {...d.doc.meta, contentTypes: {...d.doc.meta.contentTypes,
      overrides: d.doc.meta.contentTypes.overrides.filter(
        (o) => o[0] !== '/' + P)}};
    TD.setFonts(d, pair);
    const back = await readDocx(await writeDocx(d.doc));
    assert.ok(back.meta.contentTypes.overrides.some(
      ([n, t]) => n === '/' + P && /theme\+xml$/.test(t)));
  });
  it('emits each edit for Word', async () => {
    const f = make(), c = make(), r = make();
    TD.setFonts(f, pair);
    TD.setColors(c, scheme);
    TD.setFonts(r, pair);
    TD.reset(r);
    emit('theme-fonts', await writeDocx(f.doc));
    emit('theme-colours', await writeDocx(c.doc));
    emit('theme-reset', await writeDocx(r.doc));
  });
});

describe('asking for the theme the document already has', () => {
  const quiet = (d, call) => {
    d.markSaved();
    const depth = d.undoDepth, p = d.doc.parts;
    const r = call();
    assert.deepEqual(r, {ok: true, unchanged: true});
    assert.equal(d.undoDepth, depth, 'no undo step');
    assert.equal(d.dirty, false, 'not marked modified');
    assert.equal(d.doc.parts, p, 'parts untouched');
  };
  it('the same font pair twice: the second does nothing', () => {
    const d = make();
    assert.deepEqual(TD.setFonts(d, pair), {ok: true});
    d.clearHistory();
    quiet(d, () => TD.setFonts(d, pair));
  });
  it('the same colour scheme twice: the second does nothing', () => {
    const d = make();
    assert.deepEqual(TD.setColors(d, scheme), {ok: true});
    d.clearHistory();
    quiet(d, () => TD.setColors(d, scheme));
  });
  it('a pair or scheme the document has from the start', () => {
    const d = make();
    const f = TD.fontsOf(d), c = TD.colorsOf(d);
    quiet(d, () => TD.setFonts(d, f));
    quiet(d, () => TD.setColors(d, c));
  });
  it('reset on an Office theme does nothing; after a change it does',
    () => {
      const d = make();
      quiet(d, () => TD.reset(d));
      TD.setFonts(d, pair);
      assert.deepEqual(TD.reset(d), {ok: true});
      quiet(d, () => TD.reset(d));
    });
  it('same colours under a new name is a change', () => {
    const d = make(), c = TD.colorsOf(d);
    assert.deepEqual(TD.setColors(d, {name: 'Mine', slots: c.slots}),
      {ok: true});
    const xml = new TextDecoder().decode(d.doc.parts.get(P));
    assert.match(xml, /<a:clrScheme name="Mine"/);
  });
  it('refusals are sentences the user can act on', () => {
    const d = make();
    const sentence = /^[A-Z][^]*\.$/;
    for (const r of [TD.setFonts(d, {major: '', minor: 'x'}),
      TD.setFonts(d, {major: 'a<b', minor: 'x'}),
      TD.setColors(d, {name: 'x', slots: {}}),
      TD.setColors(d, {name: '', slots: {}})]) {
      assert.match(r.refused, sentence);
      assert.ok(r.refused.length > 20, r.refused);
    }
  });
});
