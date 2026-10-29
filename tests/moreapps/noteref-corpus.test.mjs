// Note marks (Batch E2): the document and header / footer parts of
// files with footnote or endnote references are written byte for
// byte as they are with the marks kept opaque (readDocx
// noteMarks: false, the way they were read before they were
// modelled), and the whole file re-reads and re-writes the same.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {buildDocx, documentXml, p, r, REL, R_NS, W_NS}
  from './build-docx.mjs';
import {corpusFiles, nameOf, ALL, SKIP_CORPUS} from
  './roundtrip-lib.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const MARK = /<w:(footnote|endnote)Reference\b/g;
const dec = (b) => new TextDecoder().decode(b);

/** Compare the two writes of `bytes`; returns {marks, hdr, fails}. */
async function compare(bytes, name) {
  const on = await readDocx(bytes);
  const off = await readDocx(bytes, {noteMarks: false});
  const a = await writeDocx(on, {date: DATE});
  const b = await writeDocx(off, {date: DATE});
  const za = await readZip(a);
  const zb = await readZip(b);
  const fails = [];
  let marks = 0, hdr = 0, modelled = 0;
  const orig = await readZip(bytes);
  marks = (dec(orig.get('word/document.xml') || new Uint8Array())
    .match(MARK) || []).length;
  for (const n of zb.keys()) {
    const x = za.get(n);
    if (!x || Buffer.compare(Buffer.from(x), Buffer.from(zb.get(n))))
      fails.push(name + ': ' + n + ' differs');
    if (/^word\/(header|footer)\d*\.xml$/.test(n)) hdr++;
  }
  if (za.size !== zb.size) fails.push(name + ': part lists differ');
  // the marks really are modelled in the normal read
  scan(on, (blk) => {
    if (blk.type !== 'p') return;
    for (const x of Object.values(blk.inlines))
      if (x.kind === 'noteRef') modelled++;
  });
  // the whole file re-reads and re-writes the same
  const again = await writeDocx(await readDocx(a), {date: DATE});
  const zc = await readZip(again);
  for (const [n, x] of za) {
    const y = zc.get(n);
    if (!y || Buffer.compare(Buffer.from(x), Buffer.from(y)))
      fails.push(name + ': ' + n + ' changes on a second round trip');
  }
  return {marks, hdr, modelled, fails};
}

const FN = (a) => `<w:r><w:footnoteReference w:id="${a}"/></w:r>`;
const TC = (inner) => '<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/>' +
  `</w:tcPr>${inner}</w:tc>`;
const TBL = (cell) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  `w:w="100"/></w:tblGrid><w:tr>${cell}</w:tr></w:tbl>`;
const HDR = `<?xml version="1.0"?><w:hdr xmlns:w="${W_NS}" ` +
  `xmlns:r="${R_NS}">${p(FN(1))}</w:hdr>`;
const SYN = {
  custom: p('<w:r><w:footnoteReference w:customMarkFollows="1" ' +
    'w:id="1"/><w:t>*</w:t></w:r>' + r('x', '<w:b/>')),
  two: p('<w:r><w:rPr><w:b/></w:rPr><w:footnoteReference w:id="1"/>' +
    '<w:endnoteReference w:id="2"/></w:r>'),
  cell: TBL(TC(p(FN(1)))) + p(''),
  nested: TBL(TC(TBL(TC(p(FN(2)))) + p(''))) + p(''),
  link: p('<w:hyperlink w:anchor="a">' + FN(1) + '</w:hyperlink>'),
};

describe('note marks write back as before', () => {
  it('synthetic files', async () => {
    let marks = 0, modelled = 0;
    for (const [k, body] of Object.entries(SYN)) {
      const bytes = await buildDocx({'word/document.xml':
        documentXml(body), 'word/header1.xml': HDR},
      {docRels: [['rIdH1', REL('header'), 'header1.xml']]});
      const res = await compare(bytes, k);
      assert.deepEqual(res.fails, []);
      assert.equal(res.hdr, 1);
      marks += res.marks;
      modelled += res.modelled;
    }
    assert.ok(marks >= 5);
    // all but the one inside a hyperlink are modelled
    assert.ok(modelled >= 5, String(modelled));
  });
  const files = corpusFiles();
  it('corpus files with marks', {skip: files.length ? false
    : SKIP_CORPUS}, async () => {
    let docs = 0, eligible = 0, marks = 0, modelled = 0, hdr = 0;
    const fails = [];
    for (const f of files) {
      const name = nameOf(f);
      const bytes = readFileSync(f);
      let z;
      try {
        z = await readZip(bytes);
      } catch (e) {
        continue;
      }
      const d = z.get('word/document.xml');
      if (!d || !/<w:(foot|end)noteReference\b/.test(dec(d))) continue;
      eligible++;
      try {
        const res = await compare(bytes, name);
        docs++;
        marks += res.marks;
        modelled += res.modelled;
        hdr += res.hdr;
        fails.push(...res.fails);
      } catch (e) {
        if (e && e.name === 'DocxError') eligible--;
        else fails.push(name + ': ' + String(e.message).slice(0, 200));
      }
    }
    console.log(`# note marks corpus${ALL ? '' : ' (sample)'}: ` +
      `${docs} files with marks compared, ${marks} marks (${modelled} ` +
      `modelled), ${hdr} header/footer parts, ${fails.length} failures`);
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    // a mass skip must not go unnoticed
    assert.ok(docs >= eligible * 0.8, `${docs} of ${eligible}`);
    if (ALL) assert.ok(docs >= 10 && marks >= 50, `${docs}/${marks}`);
  });
});
