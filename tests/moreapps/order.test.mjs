import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {el} from '../../tools/moreapps/!WimpLib/Xml';
import {ORDER, sortChildren, localName} from '../../tools/moreapps/!Word/Order';
import {W, onOff, NS, STRICT_TO_TRANSITIONAL}
  from '../../tools/moreapps/!Word/Wml';
import {sequences, DEFAULT_XSD} from '../../tools/moreapps-xsdorder.mjs';

const names = (kids) => kids.map((k) => (k.name ?? JSON.stringify(k)));
const w = (n) => el(n);

describe('ORDER tables', () => {
  it('has the six containers, each with unique strings', () => {
    assert.deepEqual(Object.keys(ORDER).sort(),
      ['pPr', 'rPr', 'sectPr', 'tblPr', 'tcPr', 'trPr']);
    for (const [k, a] of Object.entries(ORDER)) {
      assert.ok(a.every((s) => typeof s === 'string' && !s.includes(':')), k);
      assert.equal(new Set(a).size, a.length, k + ' has duplicates');
    }
  });
  it('pPr begins and ends as the schema says', () => {
    const p = ORDER.pPr;
    assert.deepEqual(p.slice(0, 4),
      ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore']);
    assert.deepEqual(p.slice(-3), ['rPr', 'sectPr', 'pPrChange']);
    const lt = (a, b) => assert.ok(p.indexOf(a) < p.indexOf(b), a + '<' + b);
    lt('numPr', 'pBdr'); lt('pBdr', 'shd'); lt('shd', 'tabs');
    lt('tabs', 'spacing'); lt('spacing', 'ind'); lt('ind', 'contextualSpacing');
    lt('contextualSpacing', 'jc'); lt('jc', 'outlineLvl');
  });
  it('rPr begins and ends as the schema says', () => {
    const r = ORDER.rPr;
    assert.deepEqual(r.slice(0, 8),
      ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps']);
    assert.equal(r.at(-1), 'rPrChange');
    const lt = (a, b) => assert.ok(r.indexOf(a) < r.indexOf(b), a + '<' + b);
    lt('color', 'spacing'); lt('spacing', 'w'); lt('w', 'kern');
    lt('kern', 'position'); lt('position', 'sz'); lt('sz', 'szCs');
    lt('szCs', 'highlight'); lt('highlight', 'u'); lt('u', 'effect');
    lt('effect', 'bdr'); lt('bdr', 'shd'); lt('shd', 'fitText');
    lt('fitText', 'vertAlign'); lt('vertAlign', 'lang');
  });
  it('tcPr, trPr, tblPr, sectPr have their fixed ends', () => {
    assert.deepEqual(ORDER.tcPr.slice(0, 3), ['cnfStyle', 'tcW', 'gridSpan']);
    assert.equal(ORDER.tcPr.at(-1), 'tcPrChange');
    assert.equal(ORDER.trPr[0], 'cnfStyle');
    assert.equal(ORDER.trPr.at(-1), 'trPrChange');
    assert.equal(ORDER.tblPr[0], 'tblStyle');
    assert.ok(ORDER.tblPr.indexOf('tblW') < ORDER.tblPr.indexOf('jc'));
    assert.ok(ORDER.tblPr.indexOf('tblBorders') < ORDER.tblPr.indexOf('tblLayout'));
    assert.equal(ORDER.tblPr.at(-1), 'tblPrChange');
    assert.deepEqual(ORDER.sectPr.slice(0, 3),
      ['headerReference', 'footerReference', 'footnotePr']);
    assert.ok(ORDER.sectPr.indexOf('pgSz') < ORDER.sectPr.indexOf('pgMar'));
    assert.equal(ORDER.sectPr.at(-1), 'sectPrChange');
  });

  const have = existsSync(DEFAULT_XSD);
  it('equals the ECMA-376 wml.xsd sequences', {
    skip: have ? false : 'wml.xsd not cached in tools/moreapps/.cache ' +
      '(see tools/moreapps-xsdorder.mjs)',
  }, () => {
    const seq = sequences(readFileSync(DEFAULT_XSD, 'utf8'));
    for (const k of Object.keys(ORDER))
      assert.deepEqual(ORDER[k], seq[k], k);
  });
});

describe('localName', () => {
  it('strips only the first prefix', () => {
    assert.equal(localName('w:b'), 'b');
    assert.equal(localName('b'), 'b');
    assert.equal(localName('w14:a:b'), 'a:b');
  });
});

describe('sortChildren', () => {
  it('reorders into schema order', () =>
    assert.deepEqual(names(sortChildren('pPr', [w('w:jc'), w('w:pStyle')])),
      ['w:pStyle', 'w:jc']));
  it('accepts a prefixed parent name', () =>
    assert.deepEqual(names(sortChildren('w:rPr', [w('w:i'), w('w:b')])),
      ['w:b', 'w:i']));
  it('does not mutate its input and returns a new array', () => {
    const inp = [w('w:jc'), w('w:pStyle')];
    const out = sortChildren('pPr', inp);
    assert.deepEqual(names(inp), ['w:jc', 'w:pStyle']);
    assert.notEqual(out, inp);
  });
  it('keeps duplicates of a known name in relative order', () => {
    const a = W('b', {val: 'a'}), b = W('b', {val: 'b'});
    const out = sortChildren('rPr', [w('w:i'), a, w('w:rStyle'), b]);
    assert.deepEqual(names(out), ['w:rStyle', 'w:b', 'w:b', 'w:i']);
    assert.equal(out[1], a); assert.equal(out[2], b);
  });
  it('keeps an unknown after the nearest preceding known child', () => {
    const x = el('w14:ext');
    // input: jc, X, pStyle  -> pStyle first; X travels with jc
    assert.deepEqual(
      names(sortChildren('pPr', [w('w:jc'), x, w('w:pStyle')])),
      ['w:pStyle', 'w:jc', 'w14:ext']);
  });
  it('keeps a leading unknown w: element first', () => {
    const x = el('w:notInSchema');
    assert.deepEqual(
      names(sortChildren('pPr', [x, w('w:jc'), w('w:pStyle')])),
      ['w:notInSchema', 'w:pStyle', 'w:jc']);
  });
  it('puts an extension element that comes first in the slot', () => {
    const x = el('w14:ext');
    assert.deepEqual(
      names(sortChildren('pPr', [x, w('w:jc'), w('w:pStyle')])),
      ['w:pStyle', 'w:jc', 'w14:ext']);
  });
  it('puts extensions after the base elements, before the Change', () => {
    assert.deepEqual(names(sortChildren('rPr', [w('w:b'),
      el('w14:ligatures'), w('w:rPrChange')])),
    ['w:b', 'w14:ligatures', 'w:rPrChange']);
    assert.deepEqual(names(sortChildren('rPr', [w('w:kern'),
      el('w14:ligatures'), w('w:sz'), w('w:szCs')])),
    ['w:kern', 'w:sz', 'w:szCs', 'w14:ligatures']);
    assert.deepEqual(names(sortChildren('pPr', [w('w:pPrChange'),
      el('w14:x'), w('w:jc'), w('w:spacing')])),
    ['w:spacing', 'w:jc', 'w14:x', 'w:pPrChange']);
    assert.deepEqual(names(sortChildren('sectPr', [el('w15:fc'),
      w('w:sectPrChange'), w('w:pgMar'), w('w:pgSz')])),
    ['w:pgSz', 'w:pgMar', 'w15:fc', 'w:sectPrChange']);
  });
  it('keeps several extensions in their input order', () => {
    assert.deepEqual(names(sortChildren('rPr', [el('w14:b'), w('w:i'),
      el('w14:a'), w('w:b')])), ['w:b', 'w:i', 'w14:b', 'w14:a']);
  });
  it('an unknown w: element stays behind its known one', () => {
    assert.deepEqual(names(sortChildren('rPr', [w('w:sz'),
      el('w:sz-cs'), el('w14:x'), w('w:b')])),
    ['w:b', 'w:sz', 'w:sz-cs', 'w14:x']);
  });
  it('keeps several unknowns in order behind their known child', () => {
    const x = el('w14:a'), y = el('mc:b'), z = el('w:notInSchema');
    assert.deepEqual(
      names(sortChildren('rPr', [w('w:i'), x, y, w('w:b'), z])),
      ['w:b', 'w:notInSchema', 'w:i', 'w14:a', 'mc:b']);
  });
  it('treats text and comments as unknown', () => {
    const out = sortChildren('pPr',
      [w('w:jc'), 'text', {comment: 'c'}, w('w:pStyle')]);
    assert.deepEqual(out.map((k) => k.name ?? k.comment ?? k),
      ['w:pStyle', 'w:jc', 'text', 'c']);
  });
  it('treats a known local name with another prefix as unknown', () =>
    assert.deepEqual(
      names(sortChildren('pPr', [w('w:jc'), el('w14:pStyle')])),
      ['w:jc', 'w14:pStyle']));
  it('leaves children alone for an unknown parent', () =>
    assert.deepEqual(names(sortChildren('foo', [w('w:jc'), w('w:b')])),
      ['w:jc', 'w:b']));
  it('is idempotent and never drops or duplicates, for every container',
    () => {
      for (const [k, order] of Object.entries(ORDER)) {
        const kids = [];
        [...order].reverse().forEach((n, i) => {
          kids.push(W(n));
          if (i % 3 === 0) kids.push(el('w14:x' + i));
          if (i % 5 === 0) kids.push('t' + i);
        });
        kids.unshift(el('w:first'));
        const once = sortChildren(k, kids);
        assert.equal(once.length, kids.length);
        assert.deepEqual(new Set(once), new Set(kids));
        assert.deepEqual(sortChildren(k, once), once);
        const known = once.filter((c) => c.name?.startsWith('w:'))
          .map((c) => order.indexOf(localName(c.name)));
        assert.deepEqual(known, [...known].sort((a, b) => a - b), k);
        assert.equal(once[0].name, 'w:first');
        const ext = once.map((c, i) => c.name?.startsWith('w14:') ? i : -1)
          .filter((i) => i >= 0);
        const change = once.findIndex((c) => c.name === 'w:' +
          order[order.length - 1]);
        assert.ok(ext.every((i) => i < change), k + ': before Change');
        let lastBase = -1;
        once.forEach((c, i) => {
          if (c.name?.startsWith('w:') && i !== change) lastBase = i;
        });
        assert.ok(ext.every((i) => i > lastBase), k + ': after base');
      }
    });
});

describe('Wml', () => {
  it('W builds a w: node from an attrs object', () => {
    assert.deepEqual(W('sz', {'w:val': 24, x: undefined, y: null}),
      {name: 'w:sz', attrs: [['w:val', '24']], children: []});
    const t = W('t', undefined, 'hi');
    assert.deepEqual(t.children, ['hi']);
    assert.equal(W('p', {}, W('r')).children[0].name, 'w:r');
  });
  it('onOff writes true as bare and false as val=0', () => {
    assert.deepEqual(onOff('b', true), {name: 'w:b', attrs: [], children: []});
    assert.deepEqual(onOff('b', false).attrs, [['w:val', '0']]);
    assert.equal(onOff('b', undefined), null);
    assert.equal(onOff('b', null), null);
  });
  it('NS has the transitional URIs', () => {
    assert.equal(NS.w,
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    assert.equal(NS.r,
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
    assert.equal(NS.a,
      'http://schemas.openxmlformats.org/drawingml/2006/main');
    assert.equal(NS.wp,
      'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing');
    assert.equal(NS.pic,
      'http://schemas.openxmlformats.org/drawingml/2006/picture');
    assert.equal(NS.mc,
      'http://schemas.openxmlformats.org/markup-compatibility/2006');
    assert.equal(NS.w14, 'http://schemas.microsoft.com/office/word/2010/wordml');
  });
  it('STRICT_TO_TRANSITIONAL maps strict URIs onto NS values', () => {
    const t = Object.values(NS);
    for (const [s, v] of Object.entries(STRICT_TO_TRANSITIONAL)) {
      assert.ok(s.startsWith('http://purl.oclc.org/ooxml/'), s);
      assert.ok(t.includes(v), v);
    }
    assert.equal(STRICT_TO_TRANSITIONAL[
      'http://purl.oclc.org/ooxml/wordprocessingml/main'], NS.w);
  });
});
