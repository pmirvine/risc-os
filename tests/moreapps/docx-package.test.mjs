// The package around the parts: the writer gives every part reached
// through a relationship of a known kind its own content type when
// the file typed it only generically (application/xml), leaves every
// other content type as it was, and what it writes passes the package
// linter (lint-package.mjs).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, p, r, REL, CT_NS}
  from './build-docx.mjs';
import {FIXTURES} from './docx-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const OX = 'application/vnd.openxmlformats-';
const WML = OX + 'officedocument.wordprocessingml.';
const CORE = 'http://schemas.openxmlformats.org/package/2006/' +
  'relationships/metadata/core-properties';
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const FOOTNOTES = DECL + '<w:footnotes xmlns:w="http://schemas.' +
  'openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/>' +
  '</w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator"' +
  ' w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p>' +
  '</w:footnote><w:footnote w:id="1"><w:p><w:r><w:t>A note.</w:t>' +
  '</w:r></w:p></w:footnote></w:footnotes>';
const CORE_XML = DECL + '<cp:coreProperties xmlns:cp="http://schemas.' +
  'openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title>' +
  '</cp:coreProperties>';
const MAIN_CT = WML + 'document.main+xml';

/** [Content_Types].xml with the given extra entries. */
const types = (extra = '') => DECL + `<Types xmlns="${CT_NS}">` +
  '<Default Extension="rels" ContentType="application/vnd.' +
  'openxmlformats-package.relationships+xml"/><Default Extension="xml"' +
  ' ContentType="application/xml"/><Override PartName="/word/' +
  `document.xml" ContentType="${MAIN_CT}"/><Override PartName="/word/` +
  `styles.xml" ContentType="${WML}styles+xml"/>${extra}</Types>`;

/** A file with footnotes and core properties, typed by `ct`. */
const notesDocx = (ct) => buildDocx({
  '[Content_Types].xml': ct,
  'word/document.xml': documentXml(p(r('a') +
    '<w:r><w:footnoteReference w:id="1"/></w:r>')),
  'word/styles.xml': stylesXml(''),
  'word/footnotes.xml': FOOTNOTES,
  'docProps/core.xml': CORE_XML,
}, {docRels: [['rIdF', REL('footnotes'), 'footnotes.xml']],
  pkgRels: [['rId1', REL('officeDocument'), 'word/document.xml'],
    ['rId2', CORE, 'docProps/core.xml']]});

/** Map part name (lower case, with '/') -> written content type. */
async function writtenTypes(bytes) {
  const doc = await readDocx(bytes);
  const out = await readZip(await write(doc));
  const back = await readDocx(await write(doc));
  const {defaults, overrides} = back.meta.contentTypes;
  const typeOf = (n) => (overrides.find(([q]) => q.toLowerCase() ===
    '/' + n.toLowerCase()) || [])[1] ?? (defaults.find(([e]) =>
    n.toLowerCase().endsWith('.' + e.toLowerCase())) || [])[1];
  return {typeOf, out, back, overrides};
}

const errors = (zip) => lintPackage(zip).problems
  .filter((x) => x.level === 'error');
const key = (x) => x.rule + ' ' + x.part + ' ' + x.detail;

describe('DocxWrite: content types of known parts', () => {
  it('a footnotes part and core properties typed application/xml ' +
    'get their own types', async () => {
    const {typeOf, out} = await writtenTypes(await notesDocx(types()));
    assert.equal(typeOf('word/footnotes.xml'), WML + 'footnotes+xml');
    assert.equal(typeOf('docProps/core.xml'),
      OX + 'package.core-properties+xml');
    assert.deepEqual(errors(out).map(key), []);
  });

  it('core properties reached through the lower-case legacy ' +
    'relationship type are repaired and linted', async () => {
    const legacy = 'http://schemas.openxmlformats.org/officedocument/' +
      '2006/relationships/metadata/core-properties';
    const src = await buildDocx({
      '[Content_Types].xml': types(),
      'word/document.xml': documentXml(p(r('a'))),
      'word/styles.xml': stylesXml(''),
      'docProps/core.xml': CORE_XML,
    }, {pkgRels: [['rId1', REL('officeDocument'), 'word/document.xml'],
      ['rId2', legacy, 'docProps/core.xml']]});
    const before = errors(await readZip(src))
      .filter((x) => x.rule === 'ct-generic');
    assert.equal(before.length, 1, 'the linter flags it');
    const {typeOf, out} = await writtenTypes(src);
    assert.equal(typeOf('docProps/core.xml'),
      OX + 'package.core-properties+xml');
    assert.deepEqual(errors(out).map(key), []);
  });

  it('a generic Override is corrected in place, not duplicated',
    async () => {
      const ct = types('<Override PartName="/word/footnotes.xml" ' +
        'ContentType="application/xml"/><Override PartName="/docProps/' +
        'core.xml" ContentType="text/xml"/>');
      const {typeOf, overrides} = await writtenTypes(await notesDocx(ct));
      assert.equal(typeOf('word/footnotes.xml'), WML + 'footnotes+xml');
      assert.equal(typeOf('docProps/core.xml'),
        OX + 'package.core-properties+xml');
      const names = overrides.map(([q]) => q.toLowerCase());
      assert.equal(new Set(names).size, names.length);
      assert.equal(names.indexOf('/word/footnotes.xml'), 2,
        'the Override keeps its place');
    });

  it('a specific type that is not the usual one is left alone',
    async () => {
      const ct = types('<Override PartName="/word/footnotes.xml" ' +
        'ContentType="application/x-own+xml"/>');
      const {typeOf, out} = await writtenTypes(await notesDocx(ct));
      assert.equal(typeOf('word/footnotes.xml'), 'application/x-own+xml');
      assert.deepEqual(errors(out).map((x) => x.rule), ['ct-wrong']);
    });

  it('every reader fixture: content types unchanged unless generic',
    async () => {
      for (const [name, make] of FIXTURES) {
        const src = await make();
        let doc;
        try { doc = await readDocx(src); } catch (e) { continue; }
        const before = errors(await readZip(src));
        const out = await readZip(await write(doc));
        const back = await readDocx(await write(doc));
        if (!before.some((x) => /^ct-(generic|none)$/.test(x.rule)) &&
          !doc.meta.stylesGenerated) {
          // the writer adds octet-stream for untyped parts (documented)
          const want = doc.meta.contentTypes.overrides;
          assert.deepEqual(back.meta.contentTypes.overrides
            .slice(0, want.length), want, name + ': overrides');
          assert.deepEqual(back.meta.contentTypes.defaults.slice(0,
            doc.meta.contentTypes.defaults.length),
          doc.meta.contentTypes.defaults, name + ': defaults');
        }
        // the writer adds no package error the source did not have
        const had = new Set(before.map(key));
        const added = errors(out).filter((x) => !had.has(key(x)) &&
          x.rule !== 'ct-none');
        assert.deepEqual(added.map(key), [], name);
      }
    });

  it('newDoc output passes the linter with no warnings', async () => {
    for (const paper of ['a4', 'letter']) {
      const zip = await readZip(await write(newDoc({paper, date: DATE})));
      assert.deepEqual(lintPackage(zip).problems.map(key), []);
    }
  });
});

describe('lintPackage', () => {
  it('names the generic types, the missing parts and references',
    async () => {
      const zip = await readZip(await notesDocx(types()));
      const got = errors(zip).map(key).sort();
      assert.deepEqual(got, [
        'ct-generic docProps/core.xml core typed application/xml',
        'ct-generic word/footnotes.xml footnotes typed application/xml',
      ]);
      zip.delete('word/footnotes.xml');
      const rules = errors(zip).map((x) => x.rule).sort();
      assert.deepEqual(rules, ['ct-generic', 'note-ref-missing',
        'rel-missing']);
    });

  it('finds unresolved r:ids, duplicate ids and orphan Overrides',
    async () => {
      const zip = await readZip(await buildDocx({
        '[Content_Types].xml': types('<Override PartName="/word/gone.xml"' +
          ' ContentType="application/xml"/>'),
        'word/document.xml': documentXml(p('<w:hyperlink r:id="rId9"/>')),
        'word/styles.xml': stylesXml(''),
        'word/_rels/document.xml.rels': DECL + '<Relationships xmlns="' +
          'http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="a" Type="${REL('styles')}" Target="styles.xml"/>` +
          `<Relationship Id="a" Type="${REL('hyperlink')}" Target="x" ` +
          'TargetMode="External"/></Relationships>',
      }));
      assert.deepEqual(errors(zip).map((x) => x.rule).sort(),
        ['ct-orphan', 'rel-id-dup', 'rid-unresolved']);
    });
});
