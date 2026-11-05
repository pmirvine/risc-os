// Opening a Word template (task 3): an untitled copy made a plain
// document, never the template's own file; macro-enabled packages
// refused before the body is read; nothing fetched from an external
// attachedTemplate target.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDoc, openDocx, openNotice, describe as why, ImportError,
  formatOfType, TEMPLATE_TYPE} from '../../tools/moreapps/!Letters/Open';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {isTemplate} from '../../tools/moreapps/!Letters/Template';
import {fileOf, importName}
  from '../../tools/moreapps/!Letters/SaveState';
import {emit} from './word-emit.mjs';
import {buildDocx, documentXml, p, r, W_NS, REL}
  from './build-docx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const APP = path.join(ROOT, 'tools/moreapps/!Letters');
const WML = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const TPL = WML + 'template.main+xml';
const DOC = WML + 'document.main+xml';
const DATE = new Date('2026-01-02T03:04:05Z');
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
  'relationships';

const CT = (main) => '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/' +
  'package/2006/content-types"><Default Extension="rels" ContentType=' +
  '"application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  `<Override PartName="/word/document.xml" ContentType="${main}"/>` +
  `<Override PartName="/word/settings.xml" ContentType="${WML}` +
  'settings+xml"/></Types>';
const SETTINGS = '<?xml version="1.0" encoding="UTF-8" standalone=' +
  `"yes"?><w:settings xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
  '<w:zoom w:percent="100"/><w:attachedTemplate r:id="rId9"/>' +
  '</w:settings>';
const EXT_TARGET = 'file:///C:/Users/x/Normal.dotm';
const SRELS = '<?xml version="1.0" encoding="UTF-8" standalone=' +
  '"yes"?><Relationships xmlns="http://schemas.openxmlformats.org/' +
  `package/2006/relationships"><Relationship Id="rId9" Type="` +
  `${REL('attachedTemplate')}" Target="${EXT_TARGET}" ` +
  'TargetMode="External"/></Relationships>';

const pkg = (main, body, opts = {}) => buildDocx({
  '[Content_Types].xml': CT(main),
  'word/document.xml': body || documentXml(p(r('Hello'))),
  'word/settings.xml': SETTINGS,
  'word/_rels/settings.xml.rels': SRELS,
}, opts);
const template = () => pkg(TPL, null,
  {broken: 'template main type in a .docx (the input)'});

/** A stub vfs that records every call. */
function vfsOf(files, types = {}) {
  const calls = [];
  return {calls,
    async readFile(p2) { calls.push(['readFile', p2]);
      return files[p2]; },
    stat(p2) { calls.push(['stat', p2]);
      return {filetype: types[p2]}; },
    leaf: (p2) => p2.split('.').pop()};
}
const mainOf = (d) => d.meta.contentTypes.overrides.find(
  ([n]) => n === '/' + d.meta.mainPart)[1];

describe('opening a template', () => {
  it('gives an untitled document copy with the notice', async () => {
    const v = vfsOf({'A.$.Letter': await template()});
    const got = await openDoc(v, 'A.$.Letter');
    assert.equal(got.imported, 'template');
    assert.equal(got.format, 'docx');
    assert.deepEqual(got.notes, []);
    assert.equal(mainOf(got.doc), DOC);
    assert.equal(openNotice('Letter', got), "'Letter' is a template; " +
      'this is a new document made from it.');
    assert.equal(openNotice('L', {...got, notes: ['x y']}),
      "'L' is a template; this is a new document made from it. " +
      'Also: x y.');
  });
  it('is untitled: never the template file as save target', () => {
    assert.deepEqual(fileOf('A.$.Letter/dotx', 'template'),
      {path: null, imported: 'template',
        importedFrom: 'A.$.Letter/dotx'});
    // the offered name is a .docx beside it, never the template itself
    assert.equal(importName('A.$.Letter/dotx'), 'A.$.Letter/docx');
    assert.equal(importName('A.$.Letter', undefined, () => false),
      'A.$.Letter/docx');
  });
  it('saves as a plain docx, re-read has the document type',
    async () => {
      const got = await openDoc(vfsOf({f: await template()}), 'f');
      const out = await writeDocx(got.doc, {date: DATE});
      const back = await readDocx(out);
      assert.equal(mainOf(back), DOC);
      assert.equal(isTemplate(back), false);
      assert.equal((await openDoc(vfsOf({f: out}), 'f')).imported,
        undefined);
      emit('tpl3-opened-saved', out);
    });
  it('drops the external attachedTemplate and never fetches it',
    async () => {
      const v = vfsOf({'A.$.T': await template()});
      const got = await openDoc(v, 'A.$.T');
      // (its type is asked, then it is read: nothing else, above all
      // not the external target)
      assert.deepEqual(v.calls, [['stat', 'A.$.T'], ['readFile', 'A.$.T']]);
      assert.equal(got.doc.rels.some((x) =>
        /attachedTemplate/.test(x.type)), false);
      const back = await readDocx(await writeDocx(got.doc));
      const text = JSON.stringify(back.rawSettings);
      assert.doesNotMatch(text, /attachedTemplate/);
      assert.ok(![...back.parts.keys()].some((n) =>
        n.endsWith('settings.xml.rels')));
      for (const [n, b] of back.parts) {
        assert.ok(!new TextDecoder('latin1').decode(b)
          .includes(EXT_TARGET), n);
      }
    });
  it('opened twice gives independent documents', async () => {
    const v = vfsOf({f: await template()});
    const a = await openDoc(v, 'f'), b = await openDoc(v, 'f');
    assert.notEqual(a.doc, b.doc);
    assert.notEqual(a.doc.sections, b.doc.sections);
    a.doc.meta.contentTypes.overrides.length = 0;
    assert.equal(mainOf(b.doc), DOC);
  });
  it('a plain docx still opens as before', async () => {
    const got = await openDoc(vfsOf({f: await pkg(DOC)}), 'f');
    assert.equal(got.imported, undefined);
    assert.equal(openNotice('f', got), null);
  });
});

describe('macro-enabled packages', () => {
  const MSG = "'F' has macros; !Letters does not open " +
    'macro-enabled Word files.';
  const kinds = {docm: WML + 'document.macroEnabled.main+xml',
    dotm: WML + 'template.macroEnabled.main+xml'};
  for (const [k, type] of Object.entries(kinds)) {
    it(`${k} is refused before the body is parsed`, async () => {
      // (a body that is not XML: parsing it would say bad-xml)
      const bytes = await pkg(type, '<w:document <<< poison',
        {broken: 'macro-enabled package, refused by design'});
      for (const open of [openDoc, openDocx]) {
        await assert.rejects(open(vfsOf({f: bytes}), 'f'), (e) => {
          assert.ok(e instanceof ImportError, String(e));
          assert.equal(e.code, 'macros');
          assert.equal(why(e, 'F'), MSG);
          return true;
        });
      }
    });
  }
  // (the main part's type from the Default of its extension, and an
  // Override whose type and part name differ in case)
  const ctDefault = (type) => CT(DOC).replace(
    /<Override PartName="\/word\/document.xml"[^>]*\/>/, '')
    .replace('ContentType="application/xml"', `ContentType="${type}"`);
  const variants = {
    'Default extension': ctDefault(kinds.dotm),
    'mixed-case Override': CT(DOC).replace(
      `PartName="/word/document.xml" ContentType="${DOC}"`,
      `PartName="/WORD/Document.xml" ContentType="${
        kinds.docm.replace('wordprocessingml', 'WordprocessingML')
          .replace('macroEnabled', 'MACROENABLED')}"`),
  };
  for (const [k, ct] of Object.entries(variants)) {
    it(`a macro type by ${k} is refused before the body`, async () => {
      const bytes = await buildDocx({'[Content_Types].xml': ct,
        'word/document.xml': '<w:document <<< poison'},
      {broken: 'macro-enabled package, refused by design'});
      await assert.rejects(openDoc(vfsOf({f: bytes}), 'f'), (e) => {
        assert.ok(e instanceof ImportError, String(e));
        assert.equal(e.code, 'macros');
        return true;
      });
    });
  }
  it('the poison body does fail when it is not a macro file',
    async () => {
      const bytes = await pkg(DOC, '<w:document <<< poison',
        {broken: 'poison body'});
      await assert.rejects(openDoc(vfsOf({f: bytes}), 'f'),
        (e) => e.name === 'DocxError' && e.code === 'bad-xml');
    });
});

describe('describe', () => {
  it('still gives every ImportError code its message', () => {
    const table = {
      'too-big': 'it is too big (more than 16 MB)',
      'old': 'it is a Word 6/95 file, which !Letters cannot read',
      'encrypted': 'it is password-protected',
      'not-word': 'it is not a Word document',
      'toocomplex': 'it is too large or complex for !Letters to open',
      'bad': 'it is not an OpenDocument text file',
    };
    for (const [code, m] of Object.entries(table)) {
      assert.equal(why(new ImportError(code, 'odt'), 'F'),
        `'F' could not be opened: ${m}.`, code);
    }
    assert.equal(why(new ImportError('bad', 'doc'), 'F'),
      "'F' could not be opened: the file is damaged.");
  });
  it('a template-typed file that is not a package', async () => {
    for (const bytes of [new Uint8Array([1, 2, 3, 4]),
      new TextEncoder().encode('plain text, not a zip')]) {
      let err;
      try { await openDoc(vfsOf({f: bytes}), 'f'); } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.equal(why(err, 'F', TEMPLATE_TYPE),
        "'F' could not be opened: it is not a Word template.");
    }
  });
});

describe('the template type is opened by Letters', () => {
  it('formatOfType gives template', () => {
    assert.equal(formatOfType(TEMPLATE_TYPE), 'template');
  });
  it('!RunImage forwards and accepts it through formatOfType', () => {
    const run = fs.readFileSync(path.join(APP, '!RunImage'), 'latin1');
    assert.match(run, /filetype: formatOfType\(t\) \? t : FILETYPES/);
    assert.match(run, /if \(!formatOfType\(msg\.filetype\)\)/);
    assert.ok(run.includes('got.imported)'));
  });
});

describe('a template whatever its content says', () => {
  const plainDocx = () => buildDocx({
    'word/document.xml': documentXml(p(r('Hello')))});
  it('a file of the template type is one, though its content is a ' +
    'plain document', async () => {
    const v = vfsOf({f: await plainDocx()}, {f: TEMPLATE_TYPE});
    const got = await openDoc(v, 'f');
    assert.equal(got.imported, 'template');
    assert.equal(got.format, 'docx');
    assert.equal(mainOf(got.doc), DOC);
    // untitled: no path as the save target, the file never written
    assert.deepEqual(fileOf('f', got.imported),
      {path: null, imported: 'template', importedFrom: 'f'});
    assert.equal(openNotice('f', got), "'f' is a template; this is " +
      'a new document made from it.');
  });
  it('openDoc with {template: true} (File > New from template)',
    async () => {
      const got = await openDoc(vfsOf({f: await plainDocx()}), 'f',
        {template: true});
      assert.equal(got.imported, 'template');
      assert.equal(mainOf(got.doc), DOC);
      // (without it, and without the type: an ordinary document)
      assert.equal((await openDoc(vfsOf({f: await plainDocx()}),
        'f')).imported, undefined);
    });
  it('RTF content in a template-typed file is an untitled copy, ' +
    'never a titled RTF', async () => {
    const rtf = new TextEncoder().encode(
      '{\\rtf1\\ansi hello\\par}');
    const typed = await openDoc(vfsOf({f: rtf}, {f: TEMPLATE_TYPE}),
      'f');
    const picked = await openDoc(vfsOf({f: rtf}), 'f',
      {template: true});
    for (const got of [typed, picked]) {
      assert.equal(got.imported, 'template');
      assert.equal(got.format, 'docx');
      assert.equal(mainOf(got.doc), DOC);
      assert.deepEqual(fileOf('f', got.imported),
        {path: null, imported: 'template', importedFrom: 'f'});
    }
    // (an ordinary RTF file is unchanged)
    const plain = await openDoc(vfsOf({f: rtf}), 'f');
    assert.equal(plain.format, 'rtf');
    assert.equal(plain.imported, undefined);
  });
  it('a template-typed file that is not a package is still refused',
    async () => {
      await assert.rejects(openDoc(vfsOf({f: new Uint8Array([1, 2, 3, 4])},
        {f: TEMPLATE_TYPE}), 'f', {template: true}),
      (e) => /not a Word template/.test(why(e, 'F', TEMPLATE_TYPE)));
    });
  it('the content type is compared without regard to case',
    async () => {
      const up = TPL.toUpperCase();
      const bytes = await pkg(up, null,
        {broken: 'upper-case template type'});
      const doc = await readDocx(bytes);
      assert.equal(isTemplate(doc), true);
      const got = await openDoc(vfsOf({f: bytes}), 'f');
      assert.equal(got.imported, 'template');
      assert.equal(mainOf(got.doc), DOC);
    });
  it('!RunImage: a template is never keyed by its file, so opening ' +
    'it again makes a new document', () => {
    const run = fs.readFileSync(path.join(APP, '!RunImage'), 'latin1');
    assert.match(run, /openDoc\(vfs, path, \{template\}\)/);
    assert.match(run, /got\.imported === 'template'[^]*?untitled:/);
    assert.match(run, /load\(path, `untitled:\$\{\+\+untitled\}`, true, true\)/);
  });
});

describe('relationship ids are per part', () => {
  it('an attachedTemplate id that a hyperlink in the main part shares ' +
    'leaves the hyperlink alone', async () => {
    const R = `xmlns:r="${R_NS}"`;
    const rels = (list) => '<?xml version="1.0" encoding="UTF-8" ' +
      'standalone="yes"?><Relationships xmlns="http://schemas.' +
      'openxmlformats.org/package/2006/relationships">' + list +
      '</Relationships>';
    const body = `<w:p><w:hyperlink r:id="rId9" ${R}><w:r><w:t>link` +
      '</w:t></w:r></w:hyperlink></w:p>';
    const bytes = await buildDocx({
      '[Content_Types].xml': CT(TPL),
      'word/document.xml': documentXml(body),
      'word/settings.xml': SETTINGS,
      'word/_rels/settings.xml.rels': SRELS,
      'word/_rels/document.xml.rels': rels(
        `<Relationship Id="rId1" Type="${REL('settings')}" ` +
        'Target="settings.xml"/>' +
        `<Relationship Id="rId9" Type="${REL('hyperlink')}" ` +
        'Target="https://example.com/" TargetMode="External"/>'),
    }, {broken: 'template main type in a .docx (the input)'});
    const got = await openDoc(vfsOf({f: bytes}), 'f');
    assert.ok(got.doc.rels.some((x) => x.id === 'rId9' &&
      x.mode === 'External' && /hyperlink$/.test(x.type)));
    const out = await writeDocx(got.doc, {date: DATE});
    const back = await readDocx(out);
    assert.ok(back.rels.some((x) => x.id === 'rId9' &&
      /hyperlink$/.test(x.type)));
    const z = await (await import('../../tools/moreapps/!WimpLib/Zip'))
      .readZip(out);
    const text = (n) => Buffer.from(z.get(n)).toString('utf8');
    assert.match(text('word/_rels/document.xml.rels'),
      /Id="rId9"[^>]*hyperlink|hyperlink[^>]*Id="rId9"/);
    assert.match(text('word/document.xml'), /r:id="rId9"/);
    // (the attached template itself is gone)
    assert.doesNotMatch(Object.keys(Object.fromEntries(z)).join(' '),
      /settings\.xml\.rels/);
    emit('tpl-collide-rid', out);
  });
});
