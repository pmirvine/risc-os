// Regression tests for faults the corpus test (corpus.test.mjs) found
// in the .docx writer, each with a minimal synthetic package.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {describe as describe_} from '../../tools/moreapps/!Word/Open';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {assertSameDoc} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const MAIN = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.document.main+xml';
const STY = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.styles+xml';
const types = (inner) => '<?xml version="1.0"?><Types xmlns="http://' +
  'schemas.openxmlformats.org/package/2006/content-types"><Default ' +
  'Extension="rels" ContentType="application/vnd.openxmlformats-' +
  `package.relationships+xml"/>${inner}</Types>`;
const build = (ct) => buildDocx({'word/document.xml':
  documentXml(p(r('x'))), '[Content_Types].xml': ct});

describe('content types of a written package', () => {
  it('no Override for a part its extension Default already types',
    async () => {
      const doc = await readDocx(await build(types(
        `<Default Extension="xml" ContentType="${MAIN}"/>`)));
      const back = await readDocx(await writeDocx(doc, {date: DATE}));
      const ov = new Map(back.meta.contentTypes.overrides);
      assert.equal(ov.has('/word/document.xml'), false);
      assert.equal(ov.get('/word/styles.xml'), STY);
      assertSameDoc(back, doc, 'default-typed main part');
    });

  it('a dangling Override for the missing styles part is not doubled',
    async () => {
      const doc = await readDocx(await build(types(
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/word/document.xml" ContentType="${MAIN}"/>` +
        `<Override PartName="/word/styles.xml" ContentType="${STY}"/>`)));
      assert.equal(doc.meta.stylesGenerated, true);
      const back = await readDocx(await writeDocx(doc, {date: DATE}));
      const names = back.meta.contentTypes.overrides.map(([n]) => n);
      assert.equal(names.filter((n) => n === '/word/styles.xml').length,
        1);
      assertSameDoc(back, doc, 'dangling styles override');
    });
});

describe('OLE2 files (older .doc, password-protected .docx)', () => {
  const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const MSG = /older Word \(\.doc\) or a password-protected file/;
  const ole = (n = 512) => {
    const b = new Uint8Array(n);
    b.set(SIG);
    return b;
  };

  it('readDocx says so, with code not-docx and kind ole2', async () => {
    for (const bytes of [ole(), ole(8), ole().buffer]) {
      await assert.rejects(readDocx(bytes), (e) => {
        assert.ok(e instanceof DocxError);
        assert.equal(e.code, 'not-docx');
        assert.equal(e.kind, 'ole2');
        assert.match(e.message, MSG);
        return true;
      });
    }
  });

  it('other junk keeps the zip message and no kind', async () => {
    await assert.rejects(readDocx(new Uint8Array(200).fill(7)), (e) => {
      assert.equal(e.code, 'not-docx');
      assert.equal(e.kind, undefined);
      assert.match(e.message, /not a \.docx file/);
      return true;
    });
  });

  it('the error box names the file and the reason', async () => {
    const err = await readDocx(ole()).catch((e) => e);
    assert.equal(describe_(err, 'Old'), "'Old' is an older Word (.doc) " +
      'or password-protected file; !Word opens .docx files only.');
  });
});
