// The tracked-change facts helpers (Batch F2): the synthetic cases
// always, the corpus ones only when tests/moreapps/corpus is there.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {revFiles, factsOf, sumFacts} from './rev-oracle.mjs';
import {CORPUS, ALL, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {existsSync} from 'node:fs';

const HAVE = existsSync(CORPUS);
const at = (id, au = 'Ann', d = '2024-01-02T03:04:05Z') =>
  `w:id="${id}"` + (au ? ` w:author="${au}"` : '') +
  (d ? ` w:date="${d}"` : '');
const ins = (id, inner, au, d) =>
  `<w:ins ${at(id, au, d)}>${inner}</w:ins>`;
const del = (id, inner, au, d) => `<w:del ${at(id, au, d)}>` +
  inner.replace(/w:t( |>)/g, 'w:delText$1').replace(
    /<\/w:t>/g, '</w:delText>') + '</w:del>';

describe('revision facts', () => {
  it('revFiles finds the corpus files and is empty without the ' +
    'corpus', async () => {
    const list = await revFiles();
    if (!HAVE) return assert.deepEqual(list, []);
    assert.ok(list.length > 0);
    assert.ok(list.every((x) => x.file && x.path &&
      !/^handoff\/tc-/.test(x.file)));
  });

  it('factsOf counts ins, del, moves and authors', async () => {
    const a = await buildDocx({'word/document.xml': documentXml(
      p(r('a') + ins(1, r('b')) + del(2, r('c'), 'Bob') +
        '<w:moveFrom ' + at(3) + '>' + r('d') + '</w:moveFrom>' +
        '<w:moveTo ' + at(4, 'Bob') + '>' + r('d') + '</w:moveTo>') +
      p(ins(5, r('e'), null, null)))});
    const f = await factsOf(a);
    assert.equal(f.ins, 2);
    assert.equal(f.del, 1);
    assert.equal(f.moveFrom, 1);
    assert.equal(f.moveTo, 1);
    assert.equal(f.authors, 2);
    assert.equal(f.noAuthorOrDate, 1);
    assert.equal(f.nested, 0);
    assert.equal(f.otherChange, 0);
    assert.equal(sumFacts([f, f]).ins, 4);
  });

  it('factsOf sees fields, pictures, tables, nesting, other ' +
    'changes and parts', async () => {
    const fld = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText>PAGE</w:instrText></w:r>';
    const pic = '<w:r><w:drawing/></w:r>';
    const tbl = '<w:tbl><w:tr><w:tc>' + p(ins(1, r('t'))) +
      '</w:tc></w:tr></w:tbl>';
    const mark = '<w:rPr>' + `<w:ins ${at(9)}/>` + '</w:rPr>';
    const chg = '<w:pPrChange ' + at(8) + '><w:pPr/></w:pPrChange>';
    const b = await buildDocx({
      'word/document.xml': documentXml(
        p(ins(2, fld) + ins(3, pic) +
          ins(4, del(5, r('n')))) + tbl +
        p(r('x') + `<w:fldSimple w:instr="DATE">${ins(6, r('d'))}` +
          '</w:fldSimple>', mark + chg)),
      'word/header1.xml': documentXml(p(ins(7, r('h')))
        ).replace('w:document', 'w:hdr').replace('/w:document', '/w:hdr'),
      'word/footnotes.xml': documentXml(p(del(10, r('n')))
        ).replace('w:document', 'w:footnotes').replace(
          '/w:document', '/w:footnotes')});
    const f = await factsOf(b);
    assert.equal(f.ins, 6);
    assert.equal(f.del, 2);
    assert.equal(f.insideField, 2);
    assert.equal(f.insidePicture, 1);
    assert.equal(f.insideTable, 1);
    assert.equal(f.nested, 1);
    assert.equal(f.otherChange, 1);
    assert.equal(f.markRev, 1);
    assert.equal(f.inHeaderFooter, 1);
    assert.equal(f.inNotes, 1);
  });

  it('factsOf on a real corpus file', {skip: HAVE ? false :
    SKIP_CORPUS}, async () => {
    const list = await revFiles();
    assert.ok(list.length > 0);
    const f = await factsOf(list[0].path);
    assert.ok(f.ins + f.del + f.moveFrom + f.moveTo > 0);
  });

  it('the pinned corpus counts', {skip: ALL && HAVE ? false :
    'WORD_EDIT_CORPUS=1 and the corpus'}, async () => {
    const list = await revFiles();
    const facts = [];
    for (const x of list) facts.push(await factsOf(x.path));
    const t = sumFacts(facts);
    // measured floors (24 files, five of them hand-off copies)
    // (exact values, the hand-off copies left out: the oracle of
    // ./rev-roundtrip-corpus.test.mjs)
    const floors = {files: 24, ins: 67, del: 79, moveFrom: 5,
      moveTo: 7, authors: 31, insideField: 14, insidePicture: 3,
      insideTable: 23, inNotes: 7, inHeaderFooter: 1, nested: 20,
      noAuthorOrDate: 7, otherChange: 69, markRev: 160,
      moveMarks: 8};
    for (const [k, v] of Object.entries(floors))
      assert.ok(t[k] >= v, `${k}: ${t[k]} < ${v}`);
  });
});
