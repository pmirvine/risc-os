// StylePatch: the Modify / New Style box's values and the patch they
// make (Batch E1 Task 8). Pure.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';
import {fill, patch, basedChoices, nextChoices}
  from '../../tools/moreapps/!Letters/StylePatch';
import {createStyle, modifyStyle}
  from '../../tools/moreapps/!Letters/StyleCmd';
import {parseLength} from '../../tools/moreapps/!WimpLib/Units';

const rp = (o) => ({extra: [], ...o});
const st = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, ...o});
const table = () => {
  const t = ensureBuiltins(newStyleTable());
  t.theme = parse(null);
  return t;
};
const themed = {name: 'w:color', attrs: [['w:val', '2F5496'],
  ['w:themeColor', 'accent1']], children: []};

/** Run fn(table); the table must be deeply unchanged afterwards. */
function pure(t, fn) {
  const before = structuredClone(t);
  const out = fn(t);
  assert.deepEqual(t, before);
  return out;
}

describe('StylePatch.fill', () => {
  it('Heading 1: its own resolved values', () => {
    const v = pure(table(), (t) => fill(t, 'Heading1'));
    assert.equal(v.name, 'Heading 1');
    assert.equal(v.type, 'paragraph');
    assert.equal(v.basedOn, 'Normal');
    assert.equal(v.next, 'Normal');
    assert.equal(v.qFormat, true);
    assert.equal(v.size, 16);
    assert.equal(v.bold, true);
    assert.equal(v.italic, false);
    assert.equal(v.before, 240);
    assert.equal(v.after, 60);
    assert.equal(v.align, 'left');
    assert.equal(v.spacing, 'single');
  });
  it('a New style: Normal as its base, empty name', () => {
    const v = pure(table(), (t) => fill(t, null));
    assert.equal(v.name, '');
    assert.equal(v.type, 'paragraph');
    assert.equal(v.basedOn, 'Normal');
    assert.equal(v.size, 11);
  });
  it('a character style leaves the paragraph fields out', () => {
    const t = table();
    addStyle(t, st('Loud', {type: 'character', rPr: rp({b: true})}));
    const v = fill(t, 'Loud');
    assert.equal(v.type, 'character');
    assert.equal(v.bold, true);
    assert.equal(v.align, undefined);
  });
  it('the based-on chain is applied', () => {
    const t = table();
    addStyle(t, st('Sub', {basedOn: 'Heading1',
      rPr: rp({i: true})}));
    const v = fill(t, 'Sub');
    assert.equal(v.size, 16);
    assert.equal(v.bold, true);
    assert.equal(v.italic, true);
    assert.equal(v.after, 60);
  });
  it('a latent built-in is filled as if in the table', () => {
    const t = table();
    t.styles.delete('Heading2');
    const v = pure(t, (x) => fill(x, 'Heading2'));
    assert.equal(v.name, 'Heading 2');
    assert.equal(v.latent, true);
    assert.equal(fill(t, 'Nope'), null);
  });
});

describe('StylePatch.patch', () => {
  it('unchanged values give no patch', () => {
    const t = table();
    const r = pure(t, (x) => patch(x, 'Heading1', fill(x, 'Heading1')));
    assert.deepEqual(r, {patch: {}});
  });
  it('a changed size alone is an rPr sz', () => {
    const t = table();
    const r = pure(t, (x) => patch(x, 'Heading1',
      {...fill(x, 'Heading1'), size: 20}));
    assert.deepEqual(Object.keys(r.patch), ['rPr']);
    assert.equal(r.patch.rPr.sz, 40);
    assert.deepEqual(Object.keys(r.patch.rPr).sort(), ['sz', 'szCs']);
    const out = modifyStyle(t, 'Heading1', r.patch);
    assert.equal(out.styles.get('Heading1').rPr.sz, 40);
    assert.equal(out.styles.get('Heading1').rPr.b, true);
    assert.equal(t.styles.get('Heading1').rPr.sz, 32);
  });
  it('a value changed back to the base\'s is removed', () => {
    const t = table();
    addStyle(t, st('Sub', {basedOn: 'Heading1',
      rPr: rp({sz: 40, szCs: 40, i: true}),
      pPr: rp({jc: 'center'})}));
    const v = fill(t, 'Sub');
    assert.equal(v.size, 20);
    const r = patch(t, 'Sub', {...v, size: 16, italic: false,
      align: 'left'});
    assert.equal(r.patch.rPr.sz, null);
    assert.equal(r.patch.rPr.i, null);
    assert.equal(r.patch.pPr.jc, null);
    const out = modifyStyle(t, 'Sub', r.patch).styles.get('Sub');
    assert.equal(out.rPr.sz, undefined);
    assert.equal(out.pPr.jc, undefined);
  });
  it('a value the base already gives is not written', () => {
    const t = table();
    addStyle(t, st('Sub', {basedOn: 'Heading1'}));
    const v = fill(t, 'Sub');
    assert.deepEqual(patch(t, 'Sub', {...v, after: 60, bold: true}),
      {patch: {}});
    const r = patch(t, 'Sub', {...v, bold: false});
    assert.equal(r.patch.rPr.b, false);
  });
  it('inches convert to twips exactly', () => {
    const t = table();
    const half = parseLength('0.5');
    assert.equal(half, 720);
    const r = patch(t, 'Heading1', {...fill(t, 'Heading1'),
      left: half, special: 'first', by: parseLength('0.25')});
    assert.equal(r.patch.pPr.ind.left, 720);
    assert.equal(r.patch.pPr.ind.firstLine, 360);
    assert.equal(r.patch.pPr.keepNext, undefined);
    const out = modifyStyle(t, 'Heading1', r.patch).styles
      .get('Heading1');
    assert.equal(out.pPr.keepNext, true);
    assert.equal(out.pPr.ind.left, 720);
  });
  it('alignment, spacing and line spacing', () => {
    const t = table();
    const r = patch(t, 'Heading1', {...fill(t, 'Heading1'),
      align: 'center', before: 120, spacing: 'double'});
    assert.equal(r.patch.pPr.jc, 'center');
    assert.deepEqual(r.patch.pPr.spacing,
      {before: 120, after: 60, line: 480, lineRule: 'auto'});
  });
  it('colour: shown as RGB, written only when edited', () => {
    const t = table();
    addStyle(t, st('Fancy', {rPr: rp({extra: [themed]})}));
    const v = pure(t, (x) => fill(x, 'Fancy'));
    assert.equal(v.colour, '4472C4');
    assert.deepEqual(patch(t, 'Fancy', v), {patch: {}});
    const r = patch(t, 'Fancy', {...v, colour: 'FF0000'});
    assert.equal(r.patch.rPr.color, 'FF0000');
    const out = modifyStyle(t, 'Fancy', r.patch).styles.get('Fancy');
    assert.equal(out.rPr.color, 'FF0000');
    assert.deepEqual(out.rPr.extra, []);       // the themed one goes
  });
  it('font: written as ascii and hAnsi; the base\'s removes it', () => {
    const t = table();
    addStyle(t, st('Sub', {basedOn: 'Heading1'}));
    const v = fill(t, 'Sub');
    const r = patch(t, 'Sub', {...v, font: 'Arial'});
    assert.equal(r.patch.rPr.rFonts.ascii, 'Arial');
    const t2 = modifyStyle(t, 'Sub', r.patch);
    assert.equal(fill(t2, 'Sub').font, 'Arial');
    const back = patch(t2, 'Sub', {...fill(t2, 'Sub'), font: v.font});
    assert.equal(back.patch.rPr.rFonts, null);
  });
  it('a duplicate name is an error', () => {
    const t = table();
    addStyle(t, st('Memo'));
    const r = pure(t, (x) => patch(x, 'Memo',
      {...fill(x, 'Memo'), name: 'normal'}));
    assert.match(r.error, /already a style/);
    assert.equal(r.patch, undefined);
  });
  it('empty and too long names are errors', () => {
    const t = table();
    assert.match(patch(t, null, {...fill(t, null), name: '  '}).error,
      /name/i);
    assert.match(patch(t, null,
      {...fill(t, null), name: 'x'.repeat(101)}).error, /too long/);
  });
  it('a cycle in Based on is an error', () => {
    const t = table();
    const r = pure(t, (x) => patch(x, 'Heading1',
      {...fill(x, 'Heading1'), basedOn: 'Heading2'}));
    assert.equal(r.error, undefined);   // Heading2 is not based on 1
    addStyle(t, st('Kid', {basedOn: 'Heading1'}));
    const c = patch(t, 'Heading1', {...fill(t, 'Heading1'),
      basedOn: 'Kid'});
    assert.match(c.error, /based on/i);
    assert.match(patch(t, 'Kid', {...fill(t, 'Kid'),
      basedOn: 'Kid'}).error, /based on/i);
  });
  it('a built-in cannot be renamed', () => {
    const t = table();
    const r = patch(t, 'Heading1', {...fill(t, 'Heading1'),
      name: 'Big'});
    assert.match(r.error, /built-in/);
  });
  it('text that is not a value names the field', () => {
    const t = table();
    const r = patch(t, 'Heading1', {...fill(t, 'Heading1'),
      size: null});
    assert.ok(r.error);
    assert.deepEqual(r.bad, ['size']);
    assert.deepEqual(patch(t, 'Heading1', {...fill(t, 'Heading1'),
      left: null}).bad, ['left']);
  });
  it('a New style\'s values make a createStyle spec', () => {
    const t = table();
    const v = {...fill(t, null), name: 'Mine', size: 14,
      qFormat: true, align: 'center'};
    const r = pure(t, (x) => patch(x, null, v));
    assert.equal(r.patch.name, 'Mine');
    assert.equal(r.patch.type, 'paragraph');
    assert.equal(r.patch.basedOn, 'Normal');
    assert.equal(r.patch.qFormat, true);
    assert.equal(r.patch.rPr.sz, 28);
    assert.equal(r.patch.pPr.jc, 'center');
    const c = createStyle(t, r.patch);
    assert.equal(c.table.styles.get(c.id).rPr.sz, 28);
    assert.equal(fill(c.table, c.id).size, 14);
  });
  it('a New style of type Linked makes the pair', () => {
    const t = table();
    const r = patch(t, null, {...fill(t, null), name: 'Pair',
      type: 'linked', bold: true});
    assert.equal(r.patch.link, true);
    assert.equal(r.patch.type, 'paragraph');
    const c = createStyle(t, r.patch);
    assert.equal(c.table.styles.get(c.id).link, 'PairChar');
    const dup = patch(c.table, null, {...fill(t, null),
      name: 'Pair2', type: 'linked'});
    assert.equal(dup.error, undefined);
  });
  it('a New character style has no paragraph part', () => {
    const t = table();
    const r = patch(t, null, {...fill(t, null), name: 'Chr',
      type: 'character', basedOn: '', italic: true, align: 'center'});
    assert.equal(r.patch.type, 'character');
    assert.equal(r.patch.pPr, undefined);
    assert.equal(r.patch.rPr.i, true);
    assert.equal(r.patch.basedOn, undefined);
  });
  it('latent entry: the patch applies once it is ensured', () => {
    const t = table();
    t.styles.delete('Heading2');
    const v = fill(t, 'Heading2');
    const r = pure(t, (x) => patch(x, 'Heading2', {...v, size: 30}));
    assert.equal(r.patch.rPr.sz, 60);
    assert.equal(r.latent, true);
  });
  it('more: a pPr patch from outside joins the box\'s', () => {
    const t = table();
    const r = patch(t, 'Heading1', fill(t, 'Heading1'),
      {pPr: {keepNext: false}});
    assert.equal(r.patch.pPr.keepNext, null);
    assert.equal(r.patch.pPr.keepLines, undefined);
  });
  it('based on changed, next changed, add to gallery', () => {
    const t = table();
    const r = patch(t, 'Heading2', {...fill(t, 'Heading2'),
      basedOn: 'Heading1', next: '', qFormat: false});
    assert.equal(r.patch.basedOn, 'Heading1');
    assert.equal(r.patch.next, null);
  });
});

describe('StylePatch choices', () => {
  it('based on: same type, not itself nor its descendants', () => {
    const t = table();
    addStyle(t, st('Kid', {basedOn: 'Heading1'}));
    const ids = basedChoices(t, 'paragraph', 'Heading1')
      .map((c) => c.id);
    assert.ok(ids.includes('') && ids.includes('Normal'));
    assert.ok(!ids.includes('Heading1') && !ids.includes('Kid'));
    assert.ok(!ids.includes('DefaultParagraphFont'));
  });
  it('next: paragraph styles, (same style) first', () => {
    const c = nextChoices(table());
    assert.equal(c[0].id, '');
    assert.ok(c.some((x) => x.id === 'Heading1'));
  });
});

describe('StylePatch: fonts of other scripts', () => {
  it('rFonts eastAsia / cs survive an ascii-only change', () => {
    const t = table();
    addStyle(t, st('Mixed', {basedOn: 'Normal', rPr: rp({rFonts: {
      ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'MS Mincho',
      cs: 'Tahoma'}})}));
    const v = pure(t, (x) => fill(x, 'Mixed'));
    const r = pure(t, (x) => patch(x, 'Mixed', {...v, font: 'Courier'}));
    const out = modifyStyle(t, 'Mixed', r.patch);
    assert.ok(out, 'a change was made');
    const f = out.styles.get('Mixed').rPr.rFonts;
    assert.equal(f.ascii, 'Courier');
    assert.equal(f.eastAsia, 'MS Mincho');
    assert.equal(f.cs, 'Tahoma');
  });
});

describe('StylePatch: built-in by name', () => {
  it('a localized Normal cannot be renamed', () => {
    const t = newStyleTable();
    addStyle(t, st('Standard', {name: 'Normal'}));
    addStyle(t, st('Fancy'));
    const r = patch(t, 'Standard', {...fill(t, 'Standard'),
      name: 'Foo'});
    assert.ok(r.error);
    assert.deepEqual(r.bad, ['name']);
    assert.ok(!patch(t, 'Fancy', {...fill(t, 'Fancy'),
      name: 'Foo'}).error);
  });
  it('basedChoices on the root of a deep chain is not quadratic',
    () => {
      const make = (n) => {
        const t = newStyleTable();
        for (let i = 0; i < n; i++)
          addStyle(t, st('S' + i, i ? {basedOn: 'S' + (i - 1)} : {}));
        return t;
      };
      const best = (t) => {
        let b = Infinity;
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          basedChoices(t, 'paragraph', 'S0');
          b = Math.min(b, performance.now() - t0);
        }
        return b;
      };
      const small = best(make(1000)), big = best(make(10000));
      console.log('# basedChoices 10000: ' + big.toFixed(1) +
        ' ms (1000: ' + small.toFixed(1) + ' ms)');
      if (process.env.WORD_PERF) assert.ok(big < 200, 'took ' + big);
      else assert.ok(big < Math.max(small, 1) * 30, 'not linear');
    });
});
