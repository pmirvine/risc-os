// StyleList: gallery and full style lists with previews (Batch E1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {gallery, all} from '../../tools/moreapps/!Letters/StyleList';
import {usedAll, usedBy}
  from '../../tools/moreapps/!Letters/StyleDoc';
import {emptyDoc, newPara}
  from '../../tools/moreapps/!Letters/Model';

const rp = (o) => ({extra: [], ...o});
const sty = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, ...o});

function build(extra = []) {
  const doc = emptyDoc();
  const t = ensureBuiltins(newStyleTable());
  for (const s of extra) addStyle(t, s);
  doc.styles = t;
  return doc;
}

describe('StyleList', () => {
  it('gallery is qFormat styles by uiPriority then name', () => {
    const doc = build([
      sty('Zed', {qFormat: true, uiPriority: 1}),
      sty('apple', {qFormat: true, name: 'apple', uiPriority: 50}),
      sty('Bee', {qFormat: true, uiPriority: 50}),
      sty('NoQ')]);
    const names = gallery(doc).map((e) => e.id);
    assert.ok(!names.includes('NoQ'));
    assert.ok(names.indexOf('Zed') < names.indexOf('apple'));
    assert.ok(names.indexOf('apple') < names.indexOf('Bee'));
    assert.ok(names.indexOf('Zed') < names.indexOf('Heading1'));
  });

  it('semiHidden only when in use; table styles never', () => {
    const doc = build([sty('Hid', {semiHidden: true}),
      sty('Tbl', {type: 'table'}), sty('Plain')]);
    let ids = all(doc).map((e) => e.id);
    assert.ok(!ids.includes('Hid'));
    assert.ok(!ids.includes('Tbl'));
    assert.ok(ids.includes('Plain'));
    assert.ok(all(doc, {hidden: true}).some((e) => e.id === 'Hid'));
    doc.sections[0].blocks = [newPara('x', {pStyle: 'Hid'})];
    ids = all(doc).map((e) => e.id);
    assert.ok(ids.includes('Hid'));
    assert.ok(!gallery(doc).some((e) => e.id === 'Hid'));
  });

  it('preview of Heading1 has size, bold and theme font', () => {
    const doc = build([sty('Pretty', {qFormat: true,
      rPr: rp({sz: 40, i: true, u: 'single', color: 'FF0000'})})]);
    doc.styles.theme = {major: 'Cambria', minor: 'Arial',
      colors: new Map()};
    doc.styles.styles.get('Heading1').rPr = rp({sz: 32, b: true,
      rFonts: {asciiTheme: 'majorHAnsi'}});
    const e = all(doc).find((x) => x.id === 'Heading1');
    assert.equal(e.preview.sizePt, 16);
    assert.equal(e.preview.bold, true);
    assert.equal(e.preview.font, 'Cambria');
    const p = all(doc).find((x) => x.id === 'Pretty').preview;
    assert.deepEqual(p, {font: 'Calibri', sizePt: 20, bold: false,
      italic: true, underline: true, color: 'FF0000'});
  });

  it('linked pair is one entry; character style previews', () => {
    const doc = build([
      sty('H1c', {type: 'character', link: 'H1p', qFormat: true,
        rPr: rp({b: true})}),
      sty('H1p', {link: 'H1c', qFormat: true}),
      sty('Strong2', {type: 'character', qFormat: true,
        rPr: rp({b: true, sz: 30})})]);
    const l = all(doc);
    assert.equal(l.filter((e) => e.id === 'H1c').length, 0);
    const p = l.find((e) => e.id === 'H1p');
    assert.equal(p.linked, true);
    assert.equal(p.type, 'paragraph');
    const c = l.find((e) => e.id === 'Strong2');
    assert.equal(c.type, 'character');
    assert.equal(c.linked, false);
    assert.equal(c.preview.sizePt, 15);
  });

  it('name falls back to id; list does not change the table', () => {
    const doc = build([sty('NoName', {name: undefined})]);
    const before = JSON.stringify([...doc.styles.styles]);
    assert.equal(all(doc).find((e) => e.id === 'NoName').name,
      'NoName');
    assert.equal(JSON.stringify([...doc.styles.styles]), before);
  });

  it('a basedOn cycle gives a preview', () => {
    const doc = build([sty('A', {basedOn: 'B', rPr: rp({sz: 28})}),
      sty('B', {basedOn: 'A'})]);
    const e = all(doc).find((x) => x.id === 'A');
    assert.equal(e.preview.sizePt, 14);
  });

  it('10000 styles list in time (200 ms with WORD_PERF=1)', () => {
    const make = (n) => {
      const doc = build();
      const blocks = [];
      for (let i = 0; i < n; i++) {
        doc.styles.styles.set('S' + i, sty('S' + i, {
          qFormat: i % 2 === 0, uiPriority: i % 7}));
        if (i % 10 === 0) blocks.push(newPara('x', {pStyle: 'S' + i}));
      }
      doc.sections[0].blocks = blocks;
      return doc;
    };
    const best = (doc) => {
      let b = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        const n = all(doc).length;
        b = Math.min(b, performance.now() - t0);
        assert.ok(n >= doc.styles.styles.size - 10);
      }
      return b;
    };
    const small = best(make(1000)), big = best(make(10000));
    console.log('# 10000 styles: ' + big.toFixed(1) + ' ms (1000: ' +
      small.toFixed(1) + ' ms)');
    if (process.env.WORD_PERF) assert.ok(big < 200, 'took ' + big);
    else assert.ok(big < Math.max(small, 1) * 30, 'not linear');
  });

  it('one-sided, dangling, wrong-type and cyclic links', () => {
    const doc = build([
      sty('C1', {type: 'character', link: 'P1'}),   // one-sided
      sty('P1'),
      sty('C2', {type: 'character', link: 'Nope'}), // dangling
      sty('P2', {link: 'Nope'}),
      sty('P3', {link: 'P1'}),                      // wrong type
      sty('PA', {link: 'PB'}), sty('PB', {link: 'PC'}),
      sty('PC', {link: 'PA'}),                      // cycle
      sty('CA', {type: 'character', link: 'CB'}),
      sty('CB', {type: 'character', link: 'CA'}),
      sty('PS', {link: 'CS'}),
      sty('CS', {type: 'character', link: 'PS'})]);   // a real pair
    const l = all(doc);
    const count = (id) => l.filter((e) => e.id === id).length;
    for (const id of ['C1', 'P1', 'C2', 'P2', 'P3', 'PA', 'PB', 'PC',
      'CA', 'CB', 'PS']) {
      assert.equal(count(id), 1, id);
      assert.equal(l.find((e) => e.id === id).linked, id === 'PS', id);
    }
    assert.equal(count('CS'), 0);
  });

  it('hidden paragraph half shows when its character half is used',
    () => {
      const doc = build([sty('HP', {link: 'HC', semiHidden: true}),
        sty('HC', {type: 'character', link: 'HP'})]);
      assert.ok(!all(doc).some((e) => e.id === 'HP'));
      const runs = [{start: 0, end: 1, rPr: rp({}), rStyle: 'HC'}];
      doc.sections[0].blocks = [newPara('a', {runs})];
      const e = all(doc).find((x) => x.id === 'HP');
      assert.ok(e && e.linked);
    });

  it('equal names are ordered by id; hostile uiPriority', () => {
    const q = {qFormat: true, name: 'Same'};
    const doc = build([sty('b2', {...q, uiPriority: 5}),
      sty('a1', {...q, uiPriority: 5}),
      sty('nan', {...q, uiPriority: NaN}),
      sty('str', {...q, uiPriority: '3'}),
      sty('neg', {...q, uiPriority: -5}),
      sty('big', {...q, uiPriority: 1e300})]);
    const ids = gallery(doc).map((e) => e.id)
      .filter((i) => ['b2', 'a1', 'nan', 'str', 'neg', 'big']
        .includes(i));
    assert.deepEqual(ids.slice(0, 3), ['neg', 'a1', 'b2']);
    assert.deepEqual(ids.slice(3).sort(), ['big', 'nan', 'str']
      .sort());
    assert.equal(ids[5], 'big');
  });

  it('character preview ignores the paragraph; qFormat+semiHidden',
    () => {
      const doc = build([sty('Big', {rPr: rp({sz: 60})}),
        sty('Ch', {type: 'character', qFormat: true,
          rPr: rp({i: true})}),
        sty('QH', {qFormat: true, semiHidden: true})]);
      doc.styles.defaults.paragraph = 'Normal';
      const e = all(doc).find((x) => x.id === 'Ch');
      assert.equal(e.preview.sizePt, 11);
      assert.equal(e.preview.italic, true);
      assert.ok(all(doc).some((x) => x.id === 'QH'));
      assert.ok(gallery(doc).some((x) => x.id === 'QH'));
    });
});

describe('StyleDoc.usedAll', () => {
  it('counts paragraphs and runs in one pass', () => {
    const doc = build([sty('Hid')]);
    const runs = [{start: 0, end: 1, rPr: rp({}), rStyle: 'Em'}];
    doc.sections[0].blocks = [newPara('a', {pStyle: 'Hid'}),
      newPara('b', {pStyle: 'Hid', runs})];
    const m = usedAll(doc);
    assert.equal(m.get('Hid'), 2);
    assert.equal(m.get('Em'), 1);
    const u = usedBy(doc, 'Hid');
    assert.equal(m.get('Hid'), u.paragraphs + u.runs);
  });
});
