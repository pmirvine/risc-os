// Strict documents: w:jc is start / end for the alignments !Word
// makes, a w:jc read is written back as it was, a paste is spelled
// as its target spells it.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {EMPTY} from '../../tools/moreapps/!Word/Pending';
import {clean} from '../../tools/moreapps/!Word/ClipClean';
import {jcName} from '../../tools/moreapps/!Word/JcName';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {alignOf} from '../../tools/moreapps/!Word/FormatEff';
import {buildDocx, documentXml, stylesXml, p, r, STRICT_W_NS,
  STRICT_R_NS} from './build-docx.mjs';
import {mk, P, SEL} from './edit-docs.mjs';
import {write} from './roundtrip-lib.mjs';
import {entryText} from './docx-compare.mjs';

const strictMk = (strict) => {
  const d = mk(['one', 'two']);
  d.doc.meta.conformance = strict ? 'strict' : 'transitional';
  return d;
};
const sel = (d) => SEL(d, 0, 0, 1, 1);
const align = (strict, id) => {
  const d = strictMk(strict);
  FA.apply(id, d, new Typing(d), sel(d), undefined, EMPTY);
  return [P(d, 0).pPr.jc, P(d, 1).pPr.jc];
};

describe('jcName', () => {
  it('start / end in Strict, left / right otherwise', () => {
    assert.equal(jcName('left', true), 'start');
    assert.equal(jcName('end', false), 'right');
    assert.equal(jcName('right', true), 'end');
    assert.equal(jcName('start', false), 'left');
    assert.equal(jcName('center', true), 'center');
    assert.equal(jcName('both', true), 'both');
    assert.equal(jcName(null, true), null);
  });
});

describe('alignment commands', () => {
  it('a Strict document gets end; alignOf reads it as right', () => {
    assert.deepEqual(align(true, 'alignRight'), ['end', 'end']);
    assert.equal(alignOf('end'), 'right');
    assert.equal(alignOf('start'), 'left');
  });
  it('a Transitional document keeps right', () => {
    assert.deepEqual(align(false, 'alignRight'), ['right', 'right']);
  });
  it('centre and justify are the same in both', () => {
    assert.deepEqual(align(true, 'alignCenter'), ['center', 'center']);
    assert.deepEqual(align(true, 'alignJustify'), ['both', 'both']);
  });
  it('left on a right paragraph is start in Strict', () => {
    const d = strictMk(true);
    FA.apply('alignRight', d, new Typing(d), sel(d), undefined, EMPTY);
    FA.apply('alignLeft', d, new Typing(d), sel(d), undefined, EMPTY);
    assert.equal(alignOf(P(d, 0).pPr.jc), 'left');
  });
});

describe('Strict files', () => {
  const file = (jcs) => buildDocx({'word/document.xml': documentXml(
    jcs.map((j, k) => p(r('p' + k), `<w:jc w:val="${j}"/>`)).join(''),
    {ns: STRICT_W_NS, rNs: STRICT_R_NS,
      rootAttrs: ' w:conformance="strict"'}),
  'word/styles.xml': stylesXml('', {ns: STRICT_W_NS})},
  {strict: true});
  it('start, end, left and right write back as read', async () => {
    const doc = await readDocx(await file(['start', 'end', 'left',
      'right']));
    const xml = await entryText(await write(doc), 'word/document.xml');
    assert.deepEqual([...xml.matchAll(/<w:jc w:val="(\w+)"/g)]
      .map((m) => m[1]), ['start', 'end', 'left', 'right']);
  });
  it('start shows as left and end as right', async () => {
    const doc = await readDocx(await file(['start', 'end']));
    const [a, b] = doc.sections[0].blocks;
    assert.equal(alignOf(a.pPr.jc), 'left');
    assert.equal(alignOf(b.pPr.jc), 'right');
  });
});

describe('paste across conformance', () => {
  const para = (jc) => ({type: 'p', text: 'x', inlines: {},
    runs: [{start: 0, end: 1, rPr: {extra: []}}],
    pPr: {jc, extra: []}});
  it('is spelled as the target spells it', () => {
    const s = strictMk(true).doc, t = strictMk(false).doc;
    assert.equal(clean([para('right')], s, {})[0].pPr.jc, 'end');
    assert.equal(clean([para('left')], s, {})[0].pPr.jc, 'start');
    assert.equal(clean([para('end')], t, {})[0].pPr.jc, 'right');
    assert.equal(clean([para('center')], s, {})[0].pPr.jc, 'center');
  });
  it('the same document keeps what it has', () => {
    const s = strictMk(true).doc;
    assert.equal(clean([para('right')], s, {sameDoc: true})[0].pPr.jc,
      'right');
  });
});
