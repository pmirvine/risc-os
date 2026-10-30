// REF, NOTEREF and STYLEREF against Word's stored results (Batch E3):
// every such field of the corpus (with WORD_EDIT_CORPUS=1: REF 13;
// STYLEREF 26 found by the harness, 3 evaluated, 21 not, and 2 with
// no separate result skipped; 6 of them in headers and footers;
// NOTEREF none) is evaluated by ./Fields and compared with what Word last
// showed. Fields of no evaluation are 'not evaluated' and not
// scored; each is listed here with its reason:
//  - complex2005_12rtm.docx: 18 'STYLEREF 1 \s' and 1 'REF ... \r':
//    the stored numbers (chapter 1, 3, 4) come from a numbering the
//    file no longer has (Heading 1 has no list: Word would show 0),
//    so there is no number to compute;
//  - bookmark.docx: STYLEREF "Heading 1"\n \* MERGEFORMAT 26 (a
//    stray argument 26: Word stored its 'Error! Use the Home tab...'
//    text);
//  - complexity - part 2.docx: STYLEREF with no paragraph in the
//    style (Word stored 'Error! No text of specified style in
//    document.', which is not produced);
//  - the VWS file's second footer (footer1.xml) is shown on no page
//    of ours.
// A header or footer STYLEREF depends on the page: its story is
// shown on several pages, Word stored the value of ONE of them
// (unknown), so the field matches when the value on some page where
// the story is shown equals the stored one (the pages: ./field-ref-
// pages). The unsupported switches found in the corpus: none beyond
// the stray argument above; \s, \r, \w are the number switches.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fieldOracle, report, floor, same} from './field-oracle.mjs';
import {evaluate} from '../../tools/moreapps/!Letters/Fields';
import {pagesOf} from './field-ref-pages.mjs';
import {ALL} from './roundtrip-lib.mjs';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const pagesFor = new WeakMap();

/** Evaluate f the way a layout would (a story: page by page). */
function shown(doc, f, ctx) {
  if (ctx.story === null || !/^\s*STYLEREF/i.test(f.instr))
    return evaluate({doc}, f);
  let pages = pagesFor.get(doc);
  if (!pages) pagesFor.set(doc, pages = pagesOf(doc));
  const out = [];
  for (const pg of pages) {
    if (pg.header !== ctx.story && pg.footer !== ctx.story) continue;
    out.push(evaluate({doc, page: {num: pg.num, s: pg.s,
      span: pg.span}}, f));
  }
  return out.find((v) => v !== null && same(v, ctx.stored)) ??
    out.find((v) => v !== null) ?? null;
}

describe('REF, NOTEREF, STYLEREF oracle', () => {
  it('matches Word on the corpus', async () => {
    const res = await fieldOracle({names: ['REF', 'NOTEREF',
      'STYLEREF'], stories: true, evaluate: shown});
    report(res, 'REF/NOTEREF/STYLEREF', 20);
    const bad = res.rows.filter((x) => x.match === false);
    assert.deepEqual(bad.map((x) => [x.file, x.instr, x.stored,
      x.computed]), []);
    for (const r of res.rows.filter((x) => x.match === null))
      console.log(`# not evaluated ${r.file}: {${r.instr.trim()}} ` +
        JSON.stringify(r.stored.slice(0, 40)));
    for (const n of ['REF', 'STYLEREF']) {
      // (the default sample may hold none that can be evaluated)
      if (ALL || res.rows.some((x) => x.name === n && x.match !== null))
        floor(res.rows, n, 1);
    }
    if (ALL) {
      const n = (name) => res.rows.filter((x) => x.name === name &&
        x.match === true).length;
      assert.ok(n('REF') >= 12, 'REF evaluated: ' + n('REF'));
      assert.ok(n('STYLEREF') >= 3, 'STYLEREF: ' + n('STYLEREF'));
    }
  });

  it('evaluates and matches built files (any run)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'refor-'));
    const file = join(dir, 'made.docx');
    const S = '<w:bookmarkStart w:id="1" w:name="_Ref1"/>';
    const body = p(r('Head'), '<w:pStyle w:val="Heading1"/>') +
      p(S + r('target') + '<w:bookmarkEnd w:id="1"/>') +
      p(fld(' REF _Ref1 \\h ', 'target')) +
      p(fld(' STYLEREF 1 ', 'Head')) +
      p(fld(' REF _Ref1 \\* Upper ', 'TARGET'));
    writeFileSync(file, await buildDocx({
      'word/document.xml': documentXml(body),
      'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
        'w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>')}));
    try {
      const res = await fieldOracle({names: ['REF', 'STYLEREF'],
        files: [file], evaluate: (doc, f) => evaluate({doc}, f)});
      assert.equal(res.rows.length, 3);
      assert.ok(res.rows.every((x) => x.match === true),
        JSON.stringify(res.rows.map((x) => [x.instr, x.computed])));
      floor(res.rows, 'REF', 1);
      floor(res.rows, 'STYLEREF', 1);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
