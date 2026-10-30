// The field oracle harness (Batch E3): counts on a synthetic
// two-file corpus, and a census of the field names of the real
// corpus (one file in ten, every file with WORD_EDIT_CORPUS=1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fieldOracle, report, floor, same}
  from './field-oracle.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {corpusFiles, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {withHeaders} from './story-fixtures.mjs';

const fc = (t) => `<w:r><w:fldChar w:fldCharType="${t}"/></w:r>`;
const it_ = (s) => `<w:r><w:instrText xml:space="preserve">${s}` +
  '</w:instrText></w:r>';
/** A complex field with a stored result (null: no separate). */
const fld = (instr, result) => fc('begin') + it_(instr) +
  (result === null ? '' : fc('separate') + result) + fc('end');

describe('fieldOracle', () => {
  it('counts a synthetic two-file corpus', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    try {
      const one = await buildDocx({'word/document.xml': documentXml(
        p(fld(' REF a \\h ', r('Hello  world')) + r(' tail')) +
        p(fld(' ref b ', r('Two')) + fld(' PAGEREF a ', r('3'))) +
        p(fld(' REF c ', null)) +
        p(fld(' DATE ', r('today'))) +
        p(fc('begin') + it_(' REF d ') + fc('separate') + r('line1')) +
        p(r('x') + fc('end')) +
        p('<w:fldSimple w:instr=" REF s "><w:r><w:t>Simple</w:t>' +
          '</w:r></w:fldSimple>'))});
      const two = await withHeaders(
        p(fld(' REF e ', r('Wrong'))),
        {default: {hdr: p(fld(' REF h ', r('Head')))}});
      const a = join(dir, 'one.docx'), b = join(dir, 'two.docx');
      const bad = join(dir, 'bad.docx');
      writeFileSync(a, one);
      writeFileSync(b, two);
      writeFileSync(bad, 'not a zip');
      const seen = [];
      const evaluate = (doc, f, ctx) => {
        seen.push(ctx.name + ':' + ctx.stored);
        if (ctx.name === 'PAGEREF') return null;
        if (f.instr.includes(' b ')) return ' Two ';
        if (f.instr.includes(' e ')) return 'Right';
        return ctx.stored.replace(/\s+/g, ' ');
      };
      const res = await fieldOracle({names: ['ref', 'PAGEREF'],
        evaluate, files: [a, b, bad]});
      const by = (n) => res.rows.filter((x) => x.name === n);
      assert.equal(by('REF').length, 5);
      assert.equal(by('PAGEREF').length, 1);
      assert.equal(res.rows.filter((x) => x.match === true).length, 4);
      assert.deepEqual(res.rows.filter((x) => x.match === false)
        .map((x) => [x.file, x.stored, x.computed, x.reason]),
      [['two.docx', 'Wrong', 'Right', 'differs']]);
      assert.deepEqual(by('PAGEREF').map((x) => [x.match, x.computed,
        x.reason]), [[null, null, 'not evaluated']]);
      assert.equal(by('REF')[0].stored, 'Hello  world');
      assert.deepEqual(res.skipped.map((x) => [x.file, x.name,
        x.reason]), [['one.docx', 'REF', 'no separate'],
        ['bad.docx', null, 'unreadable']]);
      assert.ok(!seen.some((s) => s.startsWith('DATE')));
      // the stored result spans paragraphs, joined by '\n'
      assert.ok(seen.includes('REF:line1\nx'), seen.join('|'));
      // headers and footers only when asked for
      assert.ok(!seen.some((s) => s.endsWith(':Head')));
      const more = await fieldOracle({names: ['REF'], stories: true,
        evaluate: () => null, files: [b]});
      assert.deepEqual(more.rows.map((x) => x.stored),
        ['Wrong', 'Head']);
      const only = await fieldOracle({names: ['REF'],
        filter: (f) => f.instr.includes(' e '), evaluate: () => 'x',
        files: [a, b]});
      assert.equal(only.rows.length, 1);
      report(res, 'synthetic oracle');
      floor(res, 'ref', 0.5);
      assert.throws(() => floor(res, 'ref', 1), /only 4 of 5/);
      assert.throws(() => floor(res, 'DATE', 0.1), /no DATE/);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('same() collapses white space and trims', () => {
    assert.ok(same(' a \n b\t', 'a b'));
    assert.ok(!same('a b', 'ab'));
  });

  it('census of the corpus fields', async (t) => {
    const files = corpusFiles();
    if (!files.length) return t.skip(SKIP_CORPUS);
    const res = await fieldOracle({files: undefined,
      names: ['REF', 'PAGEREF', 'NOTEREF', 'SEQ', 'TOC', 'TC', 'XE',
        'STYLEREF', 'HYPERLINK', 'PAGE', 'NUMPAGES', 'DATE', 'TIME',
        'AUTHOR', 'TITLE', 'FILENAME', 'SECTION', 'SECTIONPAGES',
        'DOCPROPERTY', 'MERGEFIELD', 'IF', 'SET', 'BOOKMARK'],
      stories: true, evaluate: () => null});
    report(res, 'field census');
    const reasons = new Set(res.skipped.map((x) => x.reason));
    for (const x of reasons) assert.ok(['unreadable', 'no separate',
      'over cap'].includes(x), x);
  });
});
