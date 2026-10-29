// StyleId and StyleCmd: pure style-table commands (Batch E1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {idFor, nameOk} from '../../tools/moreapps/!Letters/StyleId';
import {createStyle, modifyStyle, renameStyle, deleteStyle,
  resetBuiltin} from '../../tools/moreapps/!Letters/StyleCmd';

const rp = (o) => ({extra: [], ...o});
const base = () => ensureBuiltins(newStyleTable());
const st = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, ...o});

/** Run fn(table); the input must be deeply unchanged afterwards. */
function pure(t, fn) {
  const before = structuredClone(t);
  const out = fn(t);
  assert.deepEqual(t, before);
  return out;
}

describe('StyleId', () => {
  it('idFor strips, falls back and suffixes', () => {
    const t = base();
    assert.equal(idFor(t, 'My style!'), 'Mystyle');
    assert.equal(idFor(t, '<>&'), 'Style');
    assert.equal(idFor(t, 'normal'), 'normal1');
    addStyle(t, st('Mystyle'));
    addStyle(t, st('Mystyle1'));
    assert.equal(idFor(t, 'My style'), 'Mystyle2');
  });
  it('nameOk rules', () => {
    const t = base();
    assert.equal(nameOk(t, 'Fancy'), true);
    assert.equal(nameOk(t, '  '), false);
    assert.equal(nameOk(t, 'a\u0001b'), false);
    assert.equal(nameOk(t, 'x'.repeat(100)), true);
    assert.equal(nameOk(t, 'x'.repeat(101)), false);
    assert.equal(nameOk(t, 'NORMAL'), false);
    assert.equal(nameOk(t, 'NORMAL', 'Normal'), true);
    assert.equal(nameOk(t, 5), false);
  });
});

describe('StyleCmd', () => {
  it('createStyle gives a unique valid id', () => {
    const t = base();
    const r = pure(t, (x) => createStyle(x, {name: 'Normal Plus',
      type: 'paragraph', basedOn: 'Normal', rPr: {b: true},
      qFormat: true}));
    assert.equal(r.id, 'NormalPlus');
    const s = r.table.styles.get('NormalPlus');
    assert.equal(s.custom, true);
    assert.equal(s.raw, null);
    assert.equal(s.basedOn, 'Normal');
    assert.equal(s.rPr.b, true);
    assert.equal(s.qFormat, true);
    assert.equal(r.table.styles.get('Normal'), t.styles.get('Normal'));
    const r2 = createStyle(r.table, {name: 'Normal-Plus!',
      type: 'character'});
    assert.equal(r2.id, 'NormalPlus1');
    assert.equal(createStyle(t, {name: 'X', type: 'table'}), null);
    assert.equal(createStyle(t, {name: 'X', type: 'paragraph',
      basedOn: 'Nope'}), null);
    assert.equal(createStyle(t, {name: 'X', type: 'paragraph',
      basedOn: 'DefaultParagraphFont'}), null);
  });

  it('createStyle refuses a duplicate name ignoring case', () => {
    const t = base();
    assert.equal(pure(t, (x) => createStyle(x, {name: 'HEADING 1',
      type: 'paragraph'})), null);
  });

  it('modifyStyle drops raw and keeps extra', () => {
    const t = base();
    const ex = {tag: 'w:unknown'};
    addStyle(t, st('Custom', {raw: {x: 1}, extra: [ex],
      rPr: rp({i: true})}));
    const o = pure(t, (x) => modifyStyle(x, 'Custom',
      {rPr: {b: true, i: null}, pPr: {jc: 'center'}}));
    const s = o.styles.get('Custom');
    assert.equal(s.raw, null);
    assert.deepEqual(s.extra, [ex]);
    assert.equal(s.rPr.b, true);
    assert.equal('i' in s.rPr, false);
    assert.equal(s.pPr.jc, 'center');
    assert.notEqual(t.styles.get('Custom').raw, null);
  });

  it('modifyStyle returns null when nothing changes', () => {
    const t = base();
    addStyle(t, st('Custom', {rPr: rp({b: true})}));
    assert.equal(pure(t, (x) => modifyStyle(x, 'Custom',
      {rPr: {b: true}, name: 'Custom'})), null);
    assert.equal(modifyStyle(t, 'Missing', {name: 'Q'}), null);
    assert.equal(modifyStyle(t, 'Custom', {name: 'Normal'}), null);
  });

  it('modifyStyle refuses basedOn a descendant (cycle)', () => {
    const t = base();
    addStyle(t, st('A', {basedOn: 'Normal'}));
    addStyle(t, st('B', {basedOn: 'A'}));
    assert.equal(pure(t, (x) => modifyStyle(x, 'A', {basedOn: 'B'})),
      null);
    assert.equal(modifyStyle(t, 'A', {basedOn: 'A'}), null);
    const ok = modifyStyle(t, 'B', {basedOn: 'Normal'});
    assert.equal(ok.styles.get('B').basedOn, 'Normal');
    // hostile existing cycle must not hang
    const h = newStyleTable();
    addStyle(h, st('P', {basedOn: 'Q'}));
    addStyle(h, st('Q', {basedOn: 'P'}));
    addStyle(h, st('R'));
    assert.equal(modifyStyle(h, 'R', {basedOn: 'P'}).styles.get('R')
      .basedOn, 'P');
    assert.equal(modifyStyle(h, 'P', {basedOn: 'P'}), null);
  });

  it('modifyStyle refuses a basedOn that does not exist', () => {
    const t = base();
    addStyle(t, st('A'));
    assert.equal(pure(t, (x) => modifyStyle(x, 'A',
      {basedOn: 'Ghost'})), null);
    assert.equal(modifyStyle(t, 'A', {next: 'Ghost'}), null);
  });

  it('a linked pair is modified together', () => {
    const t = base();
    const r = createStyle(t, {name: 'Quote', type: 'paragraph',
      link: true});
    assert.equal(r.table.styles.get('Quote').link, 'QuoteChar');
    assert.equal(r.table.styles.get('QuoteChar').link, 'Quote');
    const o = pure(r.table, (x) => modifyStyle(x, 'Quote',
      {rPr: {i: true}, pPr: {jc: 'center'}}));
    assert.equal(o.styles.get('QuoteChar').rPr.i, true);
    assert.equal(o.styles.get('QuoteChar').raw, null);
    assert.equal(o.styles.get('Quote').pPr.jc, 'center');
    assert.equal('jc' in o.styles.get('QuoteChar').pPr, false);
    const o2 = modifyStyle(r.table, 'QuoteChar', {rPr: {b: true}});
    assert.equal(o2.styles.get('Quote').rPr.b, true);
  });

  it('deleteStyle re-bases children on the parent and clears defaults',
    () => {
      const t = base();
      addStyle(t, st('A', {basedOn: 'Normal', next: 'A'}));
      addStyle(t, st('B', {basedOn: 'A', next: 'A', raw: {x: 1}}));
      addStyle(t, st('C', {basedOn: 'A', link: 'A'}));
      t.defaults.table = 'A';
      const o = pure(t, (x) => deleteStyle(x, 'A'));
      assert.equal(o.styles.has('A'), false);
      assert.equal(o.styles.get('B').basedOn, 'Normal');
      assert.equal('next' in o.styles.get('B'), false);
      assert.equal(o.styles.get('B').raw, null);
      assert.equal('link' in o.styles.get('C'), false);
      assert.equal(o.defaults.table, null);
      assert.equal(o.defaults.paragraph, 'Normal');
      assert.equal(deleteStyle(t, 'Missing'), null);
    });

  it('deleteStyle refuses a built-in', () => {
    const t = base();
    assert.equal(pure(t, (x) => deleteStyle(x, 'Normal')), null);
    assert.equal(deleteStyle(t, 'Heading1'), null);
    assert.equal(renameStyle(t, 'Heading1', 'Big'), null);
  });

  it('modifyStyle refuses to rename a built-in', () => {
    const t = base();
    assert.equal(pure(t, (x) => modifyStyle(x, 'Heading1',
      {name: 'Big'})), null);
    assert.equal(modifyStyle(t, 'Heading1',
      {name: 'Big', rPr: {sz: 99}}), null);
    const o = modifyStyle(t, 'Heading1',
      {name: 'heading 1', rPr: {sz: 99}});
    assert.equal(o.styles.get('Heading1').name, 'heading 1');
  });

  it("resetBuiltin restores StylesBuiltin's definition", () => {
    const t = base();
    const m = modifyStyle(t, 'Heading1', {rPr: {sz: 99}});
    assert.equal(m.styles.get('Heading1').rPr.sz, 99);
    const r = pure(m, (x) => resetBuiltin(x, 'Heading1'));
    assert.deepEqual(r.styles.get('Heading1'),
      t.styles.get('Heading1'));
    assert.equal(resetBuiltin(t, 'Custom'), null);
    assert.equal(resetBuiltin(t, '__proto__'), null);
  });

  it('names with markup characters and 10000 characters', () => {
    const t = base();
    const r = pure(t, (x) => createStyle(x, {name: '<b>"&</b>',
      type: 'paragraph'}));
    assert.equal(r.id, 'bb');
    assert.equal(r.table.styles.get('bb').name, '<b>"&</b>');
    assert.equal(createStyle(t, {name: 'x'.repeat(10000),
      type: 'paragraph'}), null);
    addStyle(t, st('A'));
    assert.equal(modifyStyle(t, 'A', {name: 'y'.repeat(10000)}), null);
  });

  it('__proto__ as a name', () => {
    const t = base();
    const r = pure(t, (x) => createStyle(x, {name: '__proto__',
      type: 'paragraph', pPr: {__proto__: null, jc: 'left'}}));
    assert.equal(r.id, 'proto');
    assert.equal(r.table.styles.get('proto').name, '__proto__');
    assert.equal(({}).jc, undefined);
    const m = modifyStyle(r.table, 'proto', {pPr: JSON.parse(
      '{"__proto__": {"polluted": 1}, "keepNext": true}')});
    assert.equal(m.styles.get('proto').pPr.keepNext, true);
    assert.equal(({}).polluted, undefined);
    assert.equal(r.table.styles.get('__proto__'), undefined);
    assert.equal(modifyStyle(t, '__proto__', {name: 'Q'}), null);
    assert.equal(deleteStyle(t, '__proto__'), null);
  });
});

describe('StyleCmd: a set field replaces its raw twin', () => {
  const rawEl = (name, attrs = [], more = {}) => ({name, attrs,
    children: [], ...more});
  const names = (x) => x.extra.map((n) => n.name);

  it('pPr: a raw w:spacing goes when spacing is set', () => {
    const t = base();
    const raw = rawEl('w:spacing', [['w:beforeAutospacing', '1']]);
    addStyle(t, st('Auto', {raw: {x: 1},
      pPr: rp({extra: [raw, rawEl('w:wordWrap')]})}));
    const o = pure(t, (x) => modifyStyle(x, 'Auto',
      {pPr: {spacing: {after: 120}}}));
    const s = o.styles.get('Auto');
    assert.deepEqual(names(s.pPr), ['w:wordWrap']);
    assert.deepEqual(s.pPr.spacing, {after: 120});
    // removing the field drops the raw element too
    const r = modifyStyle(t, 'Auto', {pPr: {spacing: null}});
    assert.deepEqual(names(r.styles.get('Auto').pPr), ['w:wordWrap']);
    // a field of another name leaves it
    const k = modifyStyle(t, 'Auto', {pPr: {jc: 'center'}});
    assert.deepEqual(names(k.styles.get('Auto').pPr),
      ['w:spacing', 'w:wordWrap']);
  });

  it('look-alike raw elements survive', () => {
    const t = base();
    const alike = [
      rawEl('w:spacingX'),
      rawEl('w14:spacing'),
      rawEl('w:spacing', [['xmlns:w', 'urn:other']]),
      rawEl('spacing', [['xmlns', 'urn:other']]),
      rawEl('x:spacing', [['xmlns:x', 'urn:other']]),
    ];
    addStyle(t, st('Alike', {raw: {x: 1},
      pPr: rp({extra: [...alike, rawEl('w:spacing')]}),
      rPr: rp({extra: [rawEl('w:colorX'), rawEl('w14:color'),
        rawEl('w:color', [['xmlns:w', 'urn:other']]),
        rawEl('w:color', [['w:themeColor', 'accent1']])]})}));
    const o = pure(t, (x) => modifyStyle(x, 'Alike',
      {pPr: {spacing: {before: 10}}, rPr: {color: 'FF0000'}}));
    const s = o.styles.get('Alike');
    assert.deepEqual(s.pPr.extra, alike);
    assert.deepEqual(names(s.rPr), ['w:colorX', 'w14:color', 'w:color']);
    assert.deepEqual(s.rPr.extra[2].attrs, [['xmlns:w', 'urn:other']]);
    // an unprefixed element in the WordprocessingML default namespace
    const u = base();
    addStyle(u, st('Plain', {raw: {x: 1},
      pPr: rp({extra: [rawEl('spacing')]})}));
    assert.deepEqual(modifyStyle(u, 'Plain', {pPr: {spacing: {after: 1}}})
      .styles.get('Plain').pPr.extra, []);
  });

  it('a linked pair: both halves lose the raw twin', () => {
    const t = base();
    const themed = () => rawEl('w:color', [['w:val', '2F5496'],
      ['w:themeColor', 'accent1']]);
    addStyle(t, st('Lk', {link: 'LkChar', raw: {x: 1},
      rPr: rp({extra: [themed(), rawEl('w:effect')]})}));
    addStyle(t, st('LkChar', {type: 'character', link: 'Lk',
      raw: {x: 1}, rPr: rp({extra: [themed(), rawEl('w:effect')]})}));
    const o = pure(t, (x) => modifyStyle(x, 'Lk',
      {rPr: {color: '00FF00'}}));
    for (const id of ['Lk', 'LkChar']) {
      const s = o.styles.get(id);
      assert.equal(s.rPr.color, '00FF00', id);
      assert.deepEqual(names(s.rPr), ['w:effect'], id);
      assert.equal(s.raw, null, id);
    }
    // the same from the character half
    const c = modifyStyle(t, 'LkChar', {rPr: {color: null}});
    for (const id of ['Lk', 'LkChar'])
      assert.deepEqual(names(c.styles.get(id).rPr), ['w:effect'], id);
  });
});

describe('StyleCmd: built-in by name (localized documents)', () => {
  const local = () => {
    const t = newStyleTable();
    addStyle(t, st('Standard', {name: 'Normal', isDefault: true}));
    addStyle(t, st('berschrift1', {name: 'heading 1',
      basedOn: 'Standard'}));
    addStyle(t, st('Fancy', {basedOn: 'Standard'}));
    addStyle(t, st('Body', {name: 'Custom body'}));
    t.defaults.paragraph = 'Standard';
    return t;
  };
  it('Normal and Heading 1 under other ids cannot be deleted or ' +
    'renamed', () => {
    const t = local();
    assert.equal(deleteStyle(t, 'Standard'), null);
    assert.equal(deleteStyle(t, 'berschrift1'), null);
    assert.equal(modifyStyle(t, 'Standard', {name: 'Foo'}), null);
    assert.equal(renameStyle(t, 'berschrift1', 'Foo'), null);
    assert.ok(modifyStyle(t, 'Standard', {rPr: {b: true}}));
  });
  it('the default style of a type is never deleted, even ' +
    'custom-named', () => {
    const t = local();
    t.defaults.paragraph = 'Body';
    assert.equal(deleteStyle(t, 'Body'), null);
  });
  it('a user style can still be deleted', () => {
    const r = deleteStyle(local(), 'Fancy');
    assert.ok(r && !r.styles.has('Fancy'));
  });
});
