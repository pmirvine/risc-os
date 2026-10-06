// Styles: style table, inheritance, resolution, built-in styles.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, resolvePara, resolveRun, styleOf, addStyle,
  setDefault}
  from '../../tools/moreapps/!Word/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Word/StylesBuiltin';
import {newPara} from '../../tools/moreapps/!Word/Model';

const st = (id, o = {}) => ({id, type: 'paragraph', pPr: {extra: []},
  rPr: {extra: []}, extra: [], raw: null, ...o});
const add = (t, ...ss) => { for (const s of ss) t.styles.set(s.id, s); return t; };
const rp = (o) => ({extra: [], ...o});

describe('Styles', () => {
  it('newStyleTable is empty', () => {
    const t = newStyleTable();
    assert.deepEqual(t.docDefaults, {rPr: {extra: []}, pPr: {extra: []}});
    assert.equal(t.styles.size, 0);
    assert.deepEqual(t.defaults,
      {paragraph: null, character: null, table: null});
    assert.equal(t.latent, null);
  });

  it('docDefaults apply', () => {
    const t = newStyleTable();
    t.docDefaults.rPr = rp({sz: 22, rFonts: {ascii: 'Arial'}});
    t.docDefaults.pPr = rp({jc: 'left'});
    const p = newPara('hi');
    assert.equal(resolvePara(t, p).jc, 'left');
    const r = resolveRun(t, p, p.runs[0]);
    assert.equal(r.sz, 22);
    assert.equal(r.rFonts.ascii, 'Arial');
  });

  it('basedOn chain overrides in order', () => {
    const t = add(newStyleTable(),
      st('A', {pPr: rp({jc: 'left', keepNext: true})}),
      st('B', {basedOn: 'A', pPr: rp({jc: 'center'})}),
      st('C', {basedOn: 'B', pPr: rp({jc: 'right'})}));
    const r = resolvePara(t, newPara('x', {pStyle: 'C'}));
    assert.equal(r.jc, 'right');
    assert.equal(r.keepNext, true);
    assert.equal(resolvePara(t, newPara('x', {pStyle: 'B'})).jc, 'center');
  });

  it('a cycle in basedOn does not hang', () => {
    const t = add(newStyleTable(),
      st('A', {basedOn: 'B', pPr: rp({jc: 'left'})}),
      st('B', {basedOn: 'A', pPr: rp({keepNext: true})}));
    const r = resolvePara(t, newPara('x', {pStyle: 'A'}));
    assert.equal(r.jc, 'left');
    assert.equal(r.keepNext, true);
    add(t, st('S', {basedOn: 'S', pPr: rp({jc: 'right'})}));
    assert.equal(resolvePara(t, newPara('x', {pStyle: 'S'})).jc, 'right');
  });

  it('direct formatting beats the style', () => {
    const t = add(newStyleTable(), st('A', {pPr: rp({jc: 'center'}),
      rPr: rp({b: true, sz: 30})}));
    const p = newPara('x', {pStyle: 'A', pPr: rp({jc: 'right'}),
      rPr: rp({sz: 40})});
    assert.equal(resolvePara(t, p).jc, 'right');
    const r = resolveRun(t, p, p.runs[0]);
    assert.equal(r.sz, 40);
    assert.equal(r.b, true);
  });

  it('a character style applies to a run', () => {
    const t = add(newStyleTable(),
      st('Em', {type: 'character', rPr: rp({i: true, color: 'FF0000'})}));
    const p = newPara('x', {rStyle: 'Em'});
    const r = resolveRun(t, p, p.runs[0]);
    assert.equal(r.i, true);
    assert.equal(r.color, 'FF0000');
  });

  it('a missing style id falls back to the default paragraph style', () => {
    const t = add(newStyleTable(), st('Normal', {pPr: rp({jc: 'both'})}));
    t.defaults.paragraph = 'Normal';
    assert.equal(resolvePara(t, newPara('x', {pStyle: 'Nope'})).jc, 'both');
    assert.equal(resolvePara(t, newPara('x')).jc, 'both');
    const t2 = newStyleTable();
    t2.docDefaults.pPr = rp({jc: 'left'});
    assert.equal(resolvePara(t2, newPara('x', {pStyle: 'Nope'})).jc, 'left');
    const p = newPara('x', {rStyle: 'Nope'});
    assert.equal(resolveRun(t2, p, p.runs[0]).extra.length, 0);
  });

  it('nested objects merge key by key', () => {
    const t = add(newStyleTable(), st('A',
      {pPr: rp({spacing: {before: 240, after: 100}, ind: {left: 720}})}));
    const p = newPara('x', {pStyle: 'A',
      pPr: rp({spacing: {after: 0}, ind: {firstLine: 360}})});
    const r = resolvePara(t, p);
    assert.deepEqual(r.spacing, {before: 240, after: 0});
    assert.deepEqual(r.ind, {left: 720, firstLine: 360});
  });

  it('ind: firstLine and hanging are one value across layers', () => {
    const t = add(newStyleTable(), st('Hang',
      {pPr: rp({ind: {left: 720, hanging: 360}})}),
      st('First', {pPr: rp({ind: {firstLine: 200}})}),
      st('Sub', {basedOn: 'Hang', pPr: rp({ind: {firstLine: 100}})}));
    const ind = (pStyle, ind) => resolvePara(t, newPara('x',
      {pStyle, pPr: rp(ind ? {ind} : {})})).ind;
    // a direct left only keeps the style's hanging
    assert.deepEqual(ind('Hang', {left: 1440}),
      {left: 1440, hanging: 360});
    // a direct first line drops the style's hanging
    assert.deepEqual(ind('Hang', {firstLine: 0}),
      {left: 720, firstLine: 0});
    // a direct hanging drops the style's first line
    assert.deepEqual(ind('First', {hanging: 180}), {hanging: 180});
    // so does a style based on another
    assert.deepEqual(ind('Sub'), {left: 720, firstLine: 100});
    // both in one layer: kept as given (hanging wins when read)
    assert.deepEqual(ind('Hang', {firstLine: 5, hanging: 6}),
      {left: 720, firstLine: 5, hanging: 6});
    // nothing direct: the style's
    assert.deepEqual(ind('Hang'), {left: 720, hanging: 360});
  });

  it('rFonts merge', () => {
    const t = add(newStyleTable(),
      st('A', {rPr: rp({rFonts: {ascii: 'Times', cs: 'Arial'}})}));
    t.docDefaults.rPr = rp({rFonts: {ascii: 'Calibri', eastAsia: 'MS'}});
    const p = newPara('x', {pStyle: 'A', rPr: rp({rFonts: {hAnsi: 'H'}})});
    assert.deepEqual(resolveRun(t, p, p.runs[0]).rFonts,
      {ascii: 'Times', eastAsia: 'MS', cs: 'Arial', hAnsi: 'H'});
  });

  it('paragraph style run properties reach runs', () => {
    const t = add(newStyleTable(),
      st('H', {rPr: rp({b: true, sz: 32})}),
      st('K', {type: 'character', rPr: rp({sz: 20})}));
    const p = newPara('x', {pStyle: 'H'});
    assert.equal(resolveRun(t, p, p.runs[0]).b, true);
    // character style beats paragraph style, direct beats both
    const q = newPara('x', {pStyle: 'H', rStyle: 'K'});
    assert.equal(resolveRun(t, q, q.runs[0]).sz, 20);
    assert.equal(resolveRun(t, q, q.runs[0]).b, true);
    const d = newPara('x', {pStyle: 'H', rStyle: 'K', rPr: rp({sz: 50})});
    assert.equal(resolveRun(t, d, d.runs[0]).sz, 50);
  });

  it('extra arrays concatenate, defaults first', () => {
    const n1 = {name: 'w:a', attrs: [], children: []};
    const n2 = {name: 'w:b', attrs: [], children: []};
    const t = add(newStyleTable(), st('A', {pPr: {extra: [n2]}}));
    t.docDefaults.pPr = {extra: [n1]};
    const r = resolvePara(t, newPara('x', {pStyle: 'A'}));
    assert.deepEqual(r.extra.map((n) => n.name), ['w:a', 'w:b']);
  });

  it('a 50 level chain resolves', () => {
    const t = newStyleTable();
    add(t, st('S0', {pPr: rp({jc: 'center', keepLines: true})}));
    for (let i = 1; i < 50; i++)
      add(t, st('S' + i, {basedOn: 'S' + (i - 1),
        pPr: rp(i === 49 ? {keepNext: true} : {})}));
    const r = resolvePara(t, newPara('x', {pStyle: 'S49'}));
    assert.equal(r.jc, 'center');
    assert.equal(r.keepLines, true);
    assert.equal(r.keepNext, true);
  });

  it('10k resolutions are fast', () => {
    const t = ensureBuiltins(newStyleTable());
    const p = newPara('x', {pStyle: 'Heading3'});
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) {
      resolvePara(t, p);
      resolveRun(t, p, p.runs[0]);
    }
    assert.ok(performance.now() - t0 < 1000);
  });

  it('results are fresh objects', () => {
    const t = add(newStyleTable(), st('A', {pPr: rp({spacing: {before: 1}}),
      rPr: rp({rFonts: {ascii: 'X'}})}));
    t.docDefaults.pPr = rp({ind: {left: 5}});
    const p = newPara('x', {pStyle: 'A'});
    const r = resolvePara(t, p);
    r.spacing.before = 99; r.ind.left = 99; r.extra.push(1);
    const q = resolveRun(t, p, p.runs[0]);
    q.rFonts.ascii = 'Y';
    assert.equal(t.styles.get('A').pPr.spacing.before, 1);
    assert.equal(t.docDefaults.pPr.ind.left, 5);
    assert.equal(t.styles.get('A').rPr.rFonts.ascii, 'X');
    assert.equal(resolvePara(t, p).spacing.before, 1);
  });

  it('styleOf falls back to the default of the type', () => {
    const t = ensureBuiltins(newStyleTable());
    assert.equal(styleOf(t, 'Heading1', 'paragraph').id, 'Heading1');
    assert.equal(styleOf(t, 'Zzz', 'paragraph').id, 'Normal');
    assert.equal(styleOf(t, undefined, 'character').id,
      'DefaultParagraphFont');
    assert.equal(styleOf(t, 'Zzz', 'table'), null);
    assert.equal(styleOf(t, 'Heading1', 'character').id,
      'DefaultParagraphFont');
  });
});

describe('ensureBuiltins', () => {
  it('adds the built-in styles', () => {
    const t = ensureBuiltins(newStyleTable());
    for (const id of ['Normal', 'Heading1', 'Heading2', 'Heading3',
      'Heading4', 'Heading5', 'Heading6', 'Title', 'ListParagraph',
      'DefaultParagraphFont']) assert.ok(t.styles.has(id), id);
    assert.equal(t.defaults.paragraph, 'Normal');
    assert.equal(t.defaults.character, 'DefaultParagraphFont');
    const h = t.styles.get('Heading1');
    assert.equal(h.basedOn, 'Normal');
    assert.equal(h.next, 'Normal');
    assert.equal(h.rPr.b, true);
    assert.equal(h.rPr.sz, 32);
    assert.equal(t.styles.get('Heading6').rPr.sz, 22);
    assert.equal(t.styles.get('Title').rPr.sz, 56);
    assert.equal(t.styles.get('ListParagraph').pPr.ind.left, 720);
    assert.equal(t.styles.get('DefaultParagraphFont').type, 'character');
  });

  it('is idempotent and returns the same table', () => {
    const t = newStyleTable();
    assert.equal(ensureBuiltins(t), t);
    const snap = structuredClone([...t.styles]);
    const objs = [...t.styles.values()];
    ensureBuiltins(t);
    assert.deepEqual([...t.styles], snap);
    assert.deepEqual([...t.styles.values()].map((s, i) => s === objs[i]),
      objs.map(() => true));
  });

  it('does not overwrite an existing style', () => {
    const t = newStyleTable();
    const mine = st('Heading1', {rPr: rp({sz: 99})});
    t.styles.set('Heading1', mine);
    ensureBuiltins(t);
    assert.equal(t.styles.get('Heading1'), mine);
    assert.equal(t.styles.get('Heading1').rPr.sz, 99);
    t.defaults.paragraph = 'Other';
    ensureBuiltins(t);
    assert.equal(t.defaults.paragraph, 'Other');
  });
});

describe('merge safety', () => {
  it('nested extra does not crash and concatenates', () => {
    const t = newStyleTable();
    assert.doesNotThrow(() => resolvePara(t,
      {pPr: {extra: [], spacing: {extra: [1]}}}));
    t.docDefaults.pPr = {extra: [], spacing: {extra: [{a: 1}]}};
    const r = resolvePara(t, {pPr: {extra: [], spacing: {extra: [{a: 2}]}}});
    assert.deepEqual(r.spacing.extra, [{a: 1}, {a: 2}]);
  });

  it('results never alias the table or the paragraph', () => {
    const t = newStyleTable();
    const node = {name: 'w:x', attrs: [['a', '1']], children: []};
    t.docDefaults.pPr = {extra: [node], tabs: [{pos: 1}]};
    const para = {pPr: {extra: [], tabs: [{pos: 7}]}};
    const r = resolvePara(t, t.docDefaults && {});
    r.tabs[0].pos = 99; r.extra[0].attrs[0][1] = 'z';
    const r2 = resolvePara(t, {});
    assert.equal(r2.tabs[0].pos, 1);
    assert.equal(r2.extra[0].attrs[0][1], '1');
    const r3 = resolvePara(t, para);
    r3.tabs[0].pos = 5;
    assert.equal(para.pPr.tabs[0].pos, 7);
  });

  it('null in a higher layer overwrites a lower value', () => {
    const t = newStyleTable();
    t.docDefaults.pPr = {extra: [], jc: 'left'};
    assert.equal(resolvePara(t, {pPr: {extra: [], jc: null}}).jc, null);
  });

  it('undefined layers count as empty', () => {
    const t = add(newStyleTable(), {id: 'A', type: 'paragraph'});
    assert.doesNotThrow(() => resolvePara(t, {pStyle: 'A'}));
    assert.doesNotThrow(() => resolveRun(t, {pStyle: 'A'}, {}));
  });
});

describe('addStyle and setDefault', () => {
  it('stores a normalised copy', () => {
    const t = newStyleTable();
    const src = {id: 'X', type: 'paragraph', qFormat: true,
      isDefault: true, custom: true, uiPriority: 9, semiHidden: true,
      unhideWhenUsed: true, locked: true};
    const s = addStyle(t, src);
    assert.notEqual(s, src);
    assert.equal(t.styles.get('X'), s);
    assert.deepEqual(s.pPr, {extra: []});
    assert.deepEqual(s.rPr, {extra: []});
    assert.deepEqual(s.extra, []);
    assert.equal(s.raw, null);
    assert.equal(s.qFormat, true);
    assert.equal(s.uiPriority, 9);
    assert.equal(s.custom, true);
    assert.equal(s.locked, true);
    src.pPr = {extra: [], tabs: [{pos: 1}]};
    const c = addStyle(t, src, {replace: true});
    src.pPr.tabs[0].pos = 2;
    assert.equal(c.pPr.tabs[0].pos, 1);
  });

  it('validates', () => {
    const t = newStyleTable();
    assert.throws(() => addStyle(t, {id: '', type: 'paragraph'}), RangeError);
    assert.throws(() => addStyle(t, {type: 'paragraph'}), RangeError);
    assert.throws(() => addStyle(t, {id: 'a', type: 'bogus'}), RangeError);
    addStyle(t, {id: 'a', type: 'character'});
    assert.throws(() => addStyle(t, {id: 'a', type: 'character'}),
      RangeError);
    assert.equal(addStyle(t, {id: 'a', type: 'table'}, {replace: true}).type,
      'table');
  });

  it('setDefault needs an existing style', () => {
    const t = newStyleTable();
    assert.throws(() => setDefault(t, 'paragraph', 'N'), RangeError);
    addStyle(t, {id: 'N', type: 'paragraph'});
    setDefault(t, 'paragraph', 'N');
    assert.equal(t.defaults.paragraph, 'N');
    assert.throws(() => setDefault(t, 'bogus', 'N'), RangeError);
  });

  it('built-ins carry Word flags and outline levels', () => {
    const t = ensureBuiltins(newStyleTable());
    assert.equal(t.styles.get('Normal').isDefault, true);
    assert.equal(t.styles.get('DefaultParagraphFont').isDefault, true);
    assert.equal(t.styles.get('Heading1').qFormat, true);
    assert.equal(t.styles.get('Heading1').uiPriority, 9);
    assert.equal(t.styles.get('Title').uiPriority, 10);
    assert.equal(t.styles.get('ListParagraph').uiPriority, 34);
    for (let n = 1; n <= 6; n++)
      assert.equal(t.styles.get('Heading' + n).pPr.outlineLvl, n - 1);
    assert.equal(t.styles.get('Normal').raw, null);
  });
});
