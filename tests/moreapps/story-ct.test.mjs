// A header or footer part the program makes gets the header or
// footer content type (Batch D final fix A, F1-I2): ./DocxWrite lists
// every story part not in the file as opened among the parts it
// types, so [Content_Types].xml gains an Override with
// wordprocessingml.header+xml (footer+xml) even when the package's
// Default for the xml extension is a specific type (five corpus files
// type every xml part document.main+xml by Default: Word would refuse
// or repair a header typed so). Made on the first edit
// (./StoryFacade pendingFacade, ./HdrCmd createOnEdit) and by Link to
// previous off (./HdrCmd linkCmd: a copy in a new part). lintPackage
// finds no new error; an untouched save is unchanged (no Override
// added for a story the file had). The corpus files when present.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {pendingFacade} from '../../tools/moreapps/!Letters/StoryFacade';
import {linkCmd, ownRef} from '../../tools/moreapps/!Letters/HdrCmd';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {readZip, writeZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {wordHf, BODY} from './hf-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {CORPUS} from './roundtrip-lib.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const WML = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const MAIN = WML + 'document.main+xml';
const dec = (b) => new TextDecoder().decode(b);
const enc = (s) => new TextEncoder().encode(s);
const MAR = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" ' +
  'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" ' +
  'w:footer="708" w:gutter="0"/>';

/** bytes with every xml part typed document.main+xml by Default (no
 *  Override for an xml part). */
async function mainDefault(bytes) {
  const zip = await readZip(bytes);
  const ct = dec(zip.get('[Content_Types].xml'))
    .replace(/<Default Extension="xml"[^>]*\/>/, '')
    .replace(/<Override PartName="[^"]*\.xml"[^>]*\/>/g, '')
    .replace(/(<Types[^>]*>)/, `$1<Default Extension="xml" ` +
      `ContentType="${MAIN}"/>`);
  zip.set('[Content_Types].xml', enc(ct));
  return writeZip([...zip], {date: DATE});
}

/** The content type [Content_Types].xml gives part n. */
function typeOf(zip, n) {
  const ct = dec(zip.get('[Content_Types].xml'));
  const o = ct.match(new RegExp('<Override PartName="/' +
    n.replace(/\./g, '\\.') + '" ContentType="([^"]*)"'));
  if (o) return o[1];
  const e = n.slice(n.lastIndexOf('.') + 1);
  const d = ct.match(new RegExp(`<Default Extension="${e}" ` +
    'ContentType="([^"]*)"'));
  return d ? d[1] : null;
}

const errors = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/** d with a header and a footer made on the first edit (type 'X'),
 *  of the first type section 0 has none of its own of. */
function made(d) {
  const parts = [], s = 0;
  for (const kind of ['hdr', 'ftr']) {
    const type = ['default', 'first', 'even'].find((t) =>
      ownRef(d.doc, s, kind, t) === undefined);
    const f = pendingFacade(d, {s, kind, type});
    new Typing(f).type(S.caret({id: f.doc.sections[0].blocks[0].id,
      off: 0}), 'X');
    parts.push(f.part);
  }
  return parts;
}

/** Saved d: its zip, and the new errors against the untouched save. */
async function saved(d, before) {
  const zip = await readZip(await writeDocx(d.doc, {date: DATE}));
  const old = new Set(errors(before));
  return {zip, fresh: errors(zip).filter((e) => !old.has(e))};
}

describe('a header or footer made gets its own content type (F1-I2)',
  () => {
    let bare, two;
    before(async () => {
      bare = await mainDefault(await wordHf({body: BODY(3)}));
      two = await mainDefault(await wordHf({first: {hdr:
        p(r('Head one'))}, body: BODY(2) + p(r('end of one'),
        '<w:sectPr><w:headerReference w:type="default" ' +
        'r:id="rIdH1"/>' + MAR + '</w:sectPr>') + BODY(2)}));
    });

    it('the fixtures: every xml part typed main by Default', async () => {
      const z = await readZip(bare);
      assert.equal(typeOf(z, 'word/styles.xml'), MAIN);
    });

    it('made on the first edit: header+xml and footer+xml, lint clean',
      async () => {
        const doc = await readDocx(bare), d = new Document(doc);
        const z0 = await readZip(await writeDocx(doc, {date: DATE}));
        const [h, f] = made(d);
        const {zip, fresh} = await saved(d, z0);
        assert.equal(typeOf(zip, h), WML + 'header+xml');
        assert.equal(typeOf(zip, f), WML + 'footer+xml');
        assert.deepEqual(fresh, []);
      });

    it('Link to previous off: the copy typed as a header', async () => {
      const doc = await readDocx(two), d = new Document(doc);
      const z0 = await readZip(await writeDocx(doc, {date: DATE}));
      const n0 = new Set(doc.stories.keys());
      assert.ok(linkCmd(d, 1, 'hdr', 'default', false), 'linked off');
      const add = [...d.doc.stories.keys()].filter((n) => !n0.has(n));
      assert.equal(add.length, 1, 'a new part');
      const {zip, fresh} = await saved(d, z0);
      assert.equal(typeOf(zip, add[0]), WML + 'header+xml');
      assert.deepEqual(fresh, []);
    });

    it('an untouched save adds no Override for a story it had',
      async () => {
        const doc = await readDocx(two);
        const z = await readZip(await writeDocx(doc, {date: DATE}));
        assert.equal(typeOf(z, 'word/header1.xml'), MAIN);
        assert.ok(doc.stories.has('word/header1.xml'));
      });

    const FILES = ['poi/55733.docx', 'poi/Bug60341.docx',
      ...['InvalidDocProps', 'InvalidDocPropsct', 'NoDocProps'].map(
        (n) => 'open-xml-sdk/test/DocumentFormat.OpenXml.Tests.Assets/' +
        `assets/TestFiles/${n}.docx`)];
    for (const f of FILES) {
      const path = join(CORPUS, f);
      it(`corpus ${f.split('/').pop()}: a header and footer made`,
        {skip: !existsSync(path) && 'corpus missing'}, async () => {
          const bytes = readFileSync(path);
          const doc = await readDocx(bytes), d = new Document(doc);
          const z0 = await readZip(await writeDocx(doc, {date: DATE}));
          const [h, ft] = made(d);
          const {zip, fresh} = await saved(d, z0);
          assert.equal(typeOf(zip, h), WML + 'header+xml');
          assert.equal(typeOf(zip, ft), WML + 'footer+xml');
          assert.deepEqual(fresh, []);
        });
    }
  });
