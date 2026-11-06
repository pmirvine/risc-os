// TocFormats: the six table of contents designs of the Table of
// Contents box's Formats choice, as data, and apply(table, id): every
// design gives valid styles for TOC 1..9 and TOC Heading, differs from
// the others, is the same put over another, leaves everything else,
// round-trips through DocxWrite / readDocx, and is written for real
// Word (emit).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {FORMATS, apply, applyNotes, lookOf}
  from '../../tools/moreapps/!Letters/TocFormats';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {resolvePara} from '../../tools/moreapps/!Letters/Styles';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {ensureBuiltin} from '../../tools/moreapps/!Letters/StyleCmd';
import {emit} from './word-emit.mjs';

const DESIGNS = FORMATS.map((f) => f.id).filter((x) => x !==
  'template');
const byName = (t, name) => [...t.styles.values()].find((s) =>
  s.name.toLowerCase() === name.toLowerCase());
const plain = (s) => ({...s, raw: null});
/** A JSON text with the keys sorted (order not compared). */
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v ===
  'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)
    .sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const tocOf = (t) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
  plain(byName(t, n ? 'toc ' + n : 'TOC Heading')));
const fresh = () => newDoc().styles;

describe('TocFormats: the choices', () => {
  it('From template first, then the six designs', () => {
    assert.deepEqual(FORMATS.map((f) => f.text), ['From template',
      'Classic', 'Formal', 'Modern', 'Simple', 'Distinctive',
      'Elegant']);
    assert.equal(lookOf('template', 1), null);
    assert.equal(lookOf('nope', 1), null);
    assert.equal(lookOf('classic', 10), null);
  });
  it('From template and an unknown id leave the table itself', () => {
    const t = fresh();
    assert.equal(apply(t, 'template'), t);
    assert.equal(apply(t, 'nope'), t);
    assert.equal(apply(null, 'modern'), null);
  });
});

describe('TocFormats: each design', () => {
  for (const id of DESIGNS) {
    it(`${id}: TOC 1..9 and TOC Heading, valid and in order`, () => {
      const t0 = fresh(), before = plain(byName(t0, 'Normal'));
      const t = apply(t0, id);
      assert.notEqual(t, t0);
      assert.equal(byName(t0, 'toc 1'), undefined, 'given unchanged');
      assert.deepEqual(plain(byName(t, 'Normal')), before);
      let left = -1;
      for (let n = 1; n <= 9; n++) {
        const s = byName(t, 'toc ' + n);
        assert.ok(s, `toc ${n}`);
        assert.equal(s.basedOn, 'Normal');
        assert.equal(s.next, 'Normal');
        const pPr = resolvePara(t, newPara('x', {pStyle: s.id}));
        const ind = (pPr.ind && pPr.ind.left) || 0;
        assert.ok(ind >= left, `${id} toc ${n} indent ${ind}`);
        if (n > 1) assert.ok(ind > 0, `${id} toc ${n} indented`);
        left = ind;
        const f = runFmt(t, newPara('x', {pStyle: s.id}), {rPr:
          {extra: []}});
        assert.ok(f.px >= 12 && f.px <= 40, `${id} ${n} ${f.px}`);
      }
      const h = byName(t, 'TOC Heading');
      assert.equal(h.basedOn, 'Heading1');
      assert.equal(h.next, 'Normal');
      const hp = resolvePara(t, newPara('x', {pStyle: h.id}));
      assert.equal(hp.outlineLvl, 9, 'never listed in a table');
    });
  }
  it('the designs differ from each other', () => {
    const seen = new Map();
    for (const id of DESIGNS) {
      const k = canon(tocOf(apply(fresh(), id)));
      assert.ok(!seen.has(k), `${id} = ${seen.get(k)}`);
      seen.set(k, id);
    }
  });
  it('a design put over another is the design alone; again: the ' +
    'same table', () => {
    for (const a of DESIGNS) {
      const one = apply(fresh(), a);
      assert.equal(apply(one, a), one, `${a} again`);
      for (const b of DESIGNS) {
        assert.deepEqual(tocOf(apply(one, b)),
          tocOf(apply(fresh(), b)), `${b} over ${a}`);
      }
    }
  });
  it('Modern draws its first level in accent 1, the headings\' font',
    () => {
      const t = apply(fresh(), 'modern');
      const f = runFmt(t, newPara('x', {pStyle: 'TOC1'}),
        {rPr: {extra: []}});
      assert.equal(f.colour.toUpperCase(), '#4472C4');
      assert.equal(f.px, 18.67);
      const g = runFmt(t, newPara('x', {pStyle: 'TOC2'}),
        {rPr: {extra: []}});
      assert.equal(g.colour.toUpperCase(), '#404040');
    });
  it('keeps what a design does not own: tabs, line spacing, names; ' +
    'a style called toc 1 under another id is restyled', () => {
    let t = fresh();
    t = ensureBuiltin(t, 'TOC1');
    const s = structuredClone(t.styles.get('TOC1'));
    t.styles.delete('TOC1');
    s.id = '10';
    s.pPr.tabs = [{val: 'right', pos: 9000, leader: 'dot'}];
    s.pPr.spacing = {after: 100, line: 360, lineRule: 'auto'};
    s.pPr.ind = {left: 99, right: 720, hanging: 360};
    t.styles.set('10', s);
    const u = apply(t, 'formal');
    assert.equal(u.styles.has('TOC1'), false, 'not added again');
    const v = u.styles.get('10');
    assert.equal(v.name, 'toc 1');
    assert.deepEqual(v.pPr.tabs, s.pPr.tabs);
    assert.deepEqual(v.pPr.spacing, {before: 180, after: 60,
      line: 360, lineRule: 'auto'}, 'the line spacing kept');
    assert.deepEqual(v.pPr.ind, {right: 720, hanging: 360},
      'level 1: no left indent; right and hanging kept');
    assert.equal(v.rPr.rFonts.ascii, 'Times New Roman');
    const w = apply(t, 'simple').styles.get('10');
    assert.deepEqual(w.pPr.spacing, {before: 0, after: 40, line: 360,
      lineRule: 'auto'});
  });
  it('a raw w:spacing (autospacing): its line spacing kept, the ' +
    'autospacing gone', () => {
    const t = ensureBuiltin(fresh(), 'TOC2');
    const s = t.styles.get('TOC2');
    delete s.pPr.spacing;
    s.pPr.extra = [{name: 'w:spacing', attrs: [['w:beforeAutospacing',
      '1'], ['w:after', '100'], ['w:line', '276'],
    ['w:lineRule', 'auto']], children: []}];
    const v = apply(t, 'classic').styles.get('TOC2');
    assert.deepEqual(v.pPr.spacing, {before: 0, after: 40, line: 276,
      lineRule: 'auto'});
    assert.ok(!v.pPr.extra.some((n) => n.name === 'w:spacing'));
  });
  it('not bold or italic is written off: a bold Heading 1 does not ' +
    'make the Modern or Elegant heading bold', () => {
    const t0 = fresh(), h1 = t0.styles.get('Heading1');
    h1.rPr = {...h1.rPr, b: true, i: true};
    for (const id of ['modern', 'elegant']) {
      const t = apply(t0, id);
      const f = runFmt(t, newPara('x', {pStyle: 'TOCHeading'}),
        {rPr: {extra: []}});
      assert.equal(f.bold, false, id);
      assert.equal(f.italic, id === 'elegant', id);
      assert.equal(t.styles.get('TOCHeading').rPr.b, false);
    }
  });
  it('a theme colour caches the document theme\'s value', () => {
    const t0 = fresh();
    const theme = {...t0.theme, colors: new Map(t0.theme.colors)};
    theme.colors.set('accent1', '112233');
    const t = apply({...t0, theme}, 'modern');
    const c = t.styles.get('TOC1').rPr.extra.find((n) =>
      n.name === 'w:color');
    assert.deepEqual(c.attrs, [['w:val', '112233'],
      ['w:themeColor', 'accent1']]);
    const c0 = apply(t0, 'modern').styles.get('TOC1').rPr.extra
      .find((n) => n.name === 'w:color');
    assert.equal(c0.attrs[0][1], '4472C4', 'the Office theme');
  });
  it('a style that cannot be made is named, not skipped silently',
    () => {
      const t = fresh();
      t.styles.set('TOC3', {id: 'TOC3', type: 'paragraph',
        name: 'Mine', pPr: {extra: []}, rPr: {extra: []}, extra: [],
        raw: null});
      const {table, notes} = applyNotes(t, 'simple');
      assert.deepEqual(notes, ['The style TOC 3 could not be made: ' +
        'the document has another style, Mine, under its id TOC3.']);
      assert.equal(table.styles.get('TOC3').name, 'Mine', 'untouched');
      assert.ok(byName(table, 'toc 4'));
      assert.deepEqual(applyNotes(fresh(), 'simple').notes, []);
    });
});

describe('TocFormats: in a file', () => {
  for (const id of DESIGNS) {
    it(`${id}: written and read back the same`, async () => {
      const doc = newDoc();
      doc.styles = apply(doc.styles, id);
      const blocks = doc.sections[0].blocks;
      blocks.length = 0;
      blocks.push(newPara('Contents', {pStyle: 'TOCHeading'}));
      for (let n = 1; n <= 9; n++) {
        blocks.push(newPara(`Entry at level ${n}`,
          {pStyle: 'TOC' + n}));
      }
      const bytes = await writeDocx(doc);
      emit('tocformats-' + id, bytes);
      const back = await readDocx(bytes);
      const key = (o) => [o.name, o.basedOn, o.pPr, o.rPr];
      assert.deepEqual(tocOf(back.styles).map(key),
        tocOf(doc.styles).map(key));
    });
  }
});
