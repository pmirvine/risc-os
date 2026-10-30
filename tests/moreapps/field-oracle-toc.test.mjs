// Tables of contents against Word's stored entries (Batch E3): every
// TOC field of the corpus made again from its document (./TocBuild
// entries, the instruction read by ./TocSwitches) and compared with
// the entries Word stored (./TocUpdate entriesOf): the entry TEXT
// (a numbered heading's label, a space, its text) and LEVEL, exact;
// the page numbers separately (our pagination, stand-in fonts: a
// FLOOR, as the PAGEREF oracle).
//
// Measured 2026-10-30 (WORD_EDIT_CORPUS=1): 16 TOC instructions in
// document.xml of the corpus files. 5 are inside a content control
// (w:sdt, Word's gallery: kept whole by the reader, never updated: the
// known limit of Batch E3) and are counted UNREACHABLE; 11 found, 1
// skipped (switches not understood: '\t "_CustomImageCaption" \c'
// with no level and no identifier), 10 compared, 6 equal and 4
// differ, each for a reason listed in KNOWN, all stale stored
// entries: three copies of one file whose headings were edited after
// Word last updated the table, and complex2005, whose stored entries
// carry numbers ('1\tIntroduction') from a heading numbering the file
// no longer has (its styles and numbering give the headings no numPr:
// Word would also make the entries again without '1 '). Page
// numbers, in the 6 equal tables: 83 compared, 23 equal (PAGE_FLOOR;
// our pages break elsewhere: stand-in fonts).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {tocFields, entriesOf}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {parse, canRebuild}
  from '../../tools/moreapps/!Letters/TocSwitches';
import {entries} from '../../tools/moreapps/!Letters/TocBuild';
import {insertToc} from '../../tools/moreapps/!Letters/TocCmd';
import {run} from '../../tools/moreapps/!Letters/FieldPasses';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {caret} from '../../tools/moreapps/!Letters/Selection';
import {nameOf, ALL} from './roundtrip-lib.mjs';
import {oracleFiles} from './field-oracle.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';

// (WORD_EDIT_CORPUS=1, 2026-10-30)
const MEASURED = {instructions: 16, unreachable: 5, found: 11,
  skipped: 1, compared: 10, equal: 6};
// the TOCs that differ, by file, and why
const KNOWN = new Map([
  ['open-xml-sdk/v2FxTestFiles/ForTestCase/comment.docx', 'stale'],
  ['open-xml-sdk/v2FxTestFiles/ForTestCase/endnote.docx', 'stale'],
  ['open-xml-sdk/v2FxTestFiles/ForTestCase/footnote.docx', 'stale'],
  ['open-xml-sdk/v2FxTestFiles/bvt/complex2005_12rtm.docx',
    'stale (headings carry no numbering)'],
]);
// the page numbers equal of the first measured run (a floor)
const PAGE_FLOOR = 23;

before(loadStyles);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const dec = new TextDecoder();
const INSTR = /<w:instrText[^>]*>\s*TOC\b|w:instr="\s*TOC\b/g;

/** The built entries as Word stores them: [level|label text]. */
const builtOf = (es) => es.map((e) => e.level + '|' +
  norm((e.label ? e.label + ' ' : '') + e.text));
const storedOf = (st) => st.map((e) => e.level + '|' + norm(e.text));

/** The pages of doc as the PAGEREF oracle lays it out. */
function pagesOf(doc) {
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  return new Pages(printGalley(L)).finish();
}

/** Every TOC of files compared: the counts and rows. */
async function oracle(files) {
  const out = {instructions: 0, unreachable: 0, found: 0, skipped: [],
    rows: [], pages: {compared: 0, equal: 0}};
  for (const f of files) {
    const bytes = readFileSync(f), file = nameOf(f);
    let raw = 0;
    try {
      const z = await readZip(bytes), x = z.get('word/document.xml');
      raw = x ? (dec.decode(x).match(INSTR) || []).length : 0;
    } catch (e) {
      continue;
    }
    if (!raw) continue;
    out.instructions += raw;
    let doc;
    try {
      doc = await readDocx(bytes);
    } catch (e) {
      out.unreachable += raw;
      continue;
    }
    const ts = tocFields(doc);
    out.found += ts.length;
    out.unreachable += Math.max(0, raw - ts.length);
    let P = null;
    for (const t of ts) {
      const sw = parse(t.instr);
      if (!canRebuild(sw)) {
        out.skipped.push({file, instr: t.instr.trim(),
          why: sw.tcEntries ? 'TC entries' : 'unsupported switch'});
        continue;
      }
      const stored = entriesOf(doc, t), es = entries(doc, sw, {});
      const a = storedOf(stored), b = builtOf(es || []);
      const equal = JSON.stringify(a) === JSON.stringify(b);
      const diff = [];
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        if (a[k] !== b[k]) diff.push([a[k], b[k]]);
      }
      out.rows.push({file, instr: t.instr.trim(), equal, diff});
      // page numbers: where the entries are the same
      if (!equal) continue;
      try {
        P = P || pagesOf(doc);
        const got = entries(doc, sw, {pages: P});
        got.forEach((e, k) => {
          if (stored[k].page === null || e.page === null) return;
          out.pages.compared++;
          if (norm(stored[k].page) === norm(e.page)) out.pages.equal++;
        });
      } catch (e) {
        // (no pages for this file)
      }
    }
  }
  return out;
}

describe('TOC oracle', () => {
  it('entries equal Word\'s stored ones (text and level)', async () => {
    const res = await oracle(oracleFiles());
    const eq = res.rows.filter((x) => x.equal).length;
    console.log(`# TOC: ${res.instructions} instructions, ` +
      `${res.unreachable} unreachable (in a content control), ` +
      `${res.found} found, ${res.skipped.length} skipped, ` +
      `${res.rows.length} compared, ${eq} equal`);
    for (const s of res.skipped)
      console.log(`#   skipped ${s.file}: ${s.instr} (${s.why})`);
    for (const x of res.rows.filter((y) => !y.equal)) {
      console.log(`#   differs ${x.file} (${KNOWN.get(x.file) ||
        'NEW'}): ${x.diff.length} entries, first ` +
        JSON.stringify(x.diff[0]));
    }
    console.log(`# TOC page numbers: ${res.pages.compared} compared, ` +
      `${res.pages.equal} equal (stand-in fonts: a floor)`);
    // every TOC that differs differs for a known reason
    for (const x of res.rows.filter((y) => !y.equal))
      assert.ok(KNOWN.has(x.file), 'unexplained: ' + x.file);
    if (!ALL) return;
    assert.deepEqual({instructions: res.instructions,
      unreachable: res.unreachable, found: res.found,
      skipped: res.skipped.length, compared: res.rows.length,
      equal: eq}, MEASURED);
    assert.ok(res.pages.equal >= PAGE_FLOOR, 'page floor');
  });

  it('a table made by insertToc, saved and read back, is what ' +
    'its document makes again (entries and page numbers)',
  async () => {
    const sty = (id, name) => '<w:style w:type="paragraph" ' +
      `w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;
    const H = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);
    const BR = p('<w:r><w:br w:type="page"/></w:r>');
    const doc = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p('') + H(1, 'Alpha') + BR +
        H(2, 'Beta') + H(3, 'Gamma') + BR + H(1, 'Delta')),
      'word/styles.xml': stylesXml(sty('Normal', 'Normal') +
        sty('Heading1', 'heading 1') + sty('Heading2', 'heading 2') +
        sty('Heading3', 'heading 3'))}));
    const d = new Document(doc);
    assert.ok(insertToc(d, null, caret({id: doc.sections[0].blocks[0]
      .id, off: 0}), {}));
    const P = pagesOf(d.doc);
    run(d, {pages: {finish: () => P}}, null);
    const back = await readDocx(await writeDocx(d.doc));
    const [t] = tocFields(back);
    const stored = entriesOf(back, t);
    const es = entries(back, parse(t.instr), {pages: pagesOf(back)});
    assert.deepEqual(storedOf(stored), builtOf(es));
    assert.deepEqual(stored.map((e) => e.page), es.map((e) => e.page));
    assert.deepEqual(builtOf(es), ['1|Alpha', '2|Beta', '3|Gamma',
      '1|Delta']);
  });
});
