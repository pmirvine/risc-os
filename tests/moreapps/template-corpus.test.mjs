// Templates over the corpus and the files Word is asked to open (task 6).
//
// - every corpus .docx/.dotx (git-ignored, optional: one file in ten,
//   every one with WORD_EDIT_CORPUS=1 and
//   NODE_OPTIONS=--max-old-space-size=4096): asTemplate, written, read
//   (a template), toDocument, written, read: a document again, with
//   the body, the styles and the settings of the original's own
//   round trip; a file that IS a template opens as an untitled
//   document; counts are printed;
// - the files Word is asked to open (emit(); node
//   tools/word-open-check.mjs --emitted): a new document saved as a
//   template, the same opened back and saved as .docx, and a template
//   with an external attachedTemplate after toDocument.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {isTemplate, asTemplate, toDocument}
  from '../../tools/moreapps/!Letters/Template';
import {openDoc} from '../../tools/moreapps/!Letters/Open';
import {write, CORPUS, ALL, hash, nameOf} from './roundtrip-lib.mjs';
import {emit} from './word-emit.mjs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {loadStyles} from './word-docs.mjs';
import {buildDocx, documentXml, p, r, W_NS, REL}
  from './build-docx.mjs';

before(loadStyles);

const WML = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const DATE = new Date('2026-01-02T03:04:05Z');

function find(dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['handoff', 'word-check'].includes(path.relative(CORPUS, q)))
        find(q, out);
    } else if (/\.(docx|dotx)$/i.test(e.name) &&
      !e.name.startsWith('~$')) out.push(q);
  }
  return out;
}
const files = (fs.existsSync(CORPUS) ? find(CORPUS) : [])
  .filter((f) => ALL || hash(nameOf(f)) % 10 === 0);

const vfsOf = (bytes) => ({readFile: async () => bytes,
  stat: () => ({}), leaf: (q) => q.split('.').pop()});
const dropMain = (bytes, doc) => Buffer.from(bytes).toString('utf8')
  .replace(new RegExp('<Override PartName="/' + doc.meta.mainPart +
    '" ContentType="' + WML.replace(/\./g, '\\.') +
    'document\\.main\\+xml"/>', 'i'), '');
const mainType = (doc) => {
  const m = doc.meta;
  const ov = m.contentTypes.overrides.find(([n]) =>
    n.toLowerCase() === '/' + m.mainPart.toLowerCase());
  return ov ? ov[1] : null;
};

describe('templates: the corpus', {
  skip: files.length ? false : 'tests/moreapps/corpus is missing'},
() => {
  it('asTemplate / toDocument round trips; real templates open',
    async () => {
      const bad = [];
      let ok = 0, refused = 0, templates = 0, macros = 0, attached = 0;
      for (const f of files) {
        const name = nameOf(f);
        let a;
        try {
          a = await readDocx(new Uint8Array(fs.readFileSync(f)));
        } catch (e) {
          if (e instanceof DocxError) {
            refused++;
            continue;
          }
          bad.push(name + ': ' + e.message);
          continue;
        }
        try {
          if (/macroEnabled/.test(mainType(a) || '')) macros++;
          if (isTemplate(a)) {
            templates++;
            const got = await openDoc(vfsOf(
              new Uint8Array(fs.readFileSync(f))), f).catch((e) => e);
            if (got instanceof Error) throw got;
            assert.equal(got.imported, 'template');
            assert.equal(mainType(got.doc), WML + 'document.main+xml');
          }
          const base = await readDocx(await write(a));
          const t = await readDocx(await write(asTemplate(a)));
          assert.equal(mainType(t), WML + 'template.main+xml', 'template');
          const d = await readDocx(await write(toDocument(t)));
          assert.equal(mainType(d), WML + 'document.main+xml', 'document');
          // (body, styles, settings and every other part: the package
          // written from the document made from the template is the one
          // written from the original's own round trip)
          const want = await readZip(await write(base));
          const got = await readZip(await write(d));
          // (a file with an attachedTemplate: the setting and its
          // relationship are what toDocument takes out, so the
          // settings part and its .rels may differ, no other part)
          const att = /attachedTemplate/.test(JSON.stringify(
            base.rawSettings || ''));
          if (att) attached++;
          const sp = base.meta.settingsPart || '';
          const free = (n) => att && (n === sp ||
            n === sp.replace(/([^/]*)$/, '_rels/$1.rels'));
          assert.deepEqual([...got.keys()].filter((n) => !free(n)).sort(),
            [...want.keys()].filter((n) => !free(n)).sort(), 'parts');
          for (const [n, bytes] of want) {
            if (free(n)) continue;
            // (a main part typed only by the Default of its extension
            // gets an explicit Override of the same type: the same
            // package, so that one Override is set aside)
            const same = n === '[Content_Types].xml'
              ? dropMain(bytes, base) === dropMain(got.get(n), base)
              : Buffer.from(bytes).equals(Buffer.from(got.get(n)));
            assert.ok(same, 'part ' + n);
          }
          ok++;
        } catch (e) {
          bad.push(name + ': ' + (e.message || e).toString().slice(0, 200));
        }
      }
      console.log(`  template corpus: ${files.length} files, ${ok} round ` +
        `trips equal, ${refused} refused by the reader, ${templates} ` +
        `templates opened, ${macros} macro-enabled, ${attached} with an ` +
        'attachedTemplate setting');
      assert.deepEqual(bad, []);
    });
});

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
  'relationships';

describe('templates: files for real Word', () => {
  it('a template, the document made from it, one with an attachedTemplate',
    async () => {
      const doc = newDoc({date: DATE});
      doc.sections[0].blocks.splice(0, 1,
        newPara('A template for letters'),
        newPara('Dear Sir or Madam,'));
      const tpl = await write(asTemplate(doc));
      assert.ok(isTemplate(await readDocx(tpl)));
      emit('template-new', tpl, {ext: '.dotx'});
      const back = await readDocx(tpl);
      const out = await write(toDocument(back));
      assert.ok(!isTemplate(await readDocx(out)));
      emit('template-saved-as-docx', out, {from: tpl});
      // an external attachedTemplate, as Word writes one
      const settings = '<?xml version="1.0" encoding="UTF-8" ' +
        `standalone="yes"?><w:settings xmlns:w="${W_NS}" ` +
        `xmlns:r="${R_NS}"><w:zoom w:percent="100"/>` +
        '<w:attachedTemplate r:id="rId9"/></w:settings>';
      const srels = '<?xml version="1.0" encoding="UTF-8" standalone=' +
        '"yes"?><Relationships xmlns="http://schemas.openxmlformats.org/' +
        `package/2006/relationships"><Relationship Id="rId9" Type="` +
        `${REL('attachedTemplate')}" Target="file:///C:/Users/x/N.dotm" ` +
        'TargetMode="External"/></Relationships>';
      const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/' +
        'content-types"><Default Extension="rels" ContentType=' +
        '"application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/word/document.xml" ContentType="${WML}` +
        'template.main+xml"/>' +
        `<Override PartName="/word/settings.xml" ContentType="${WML}` +
        'settings+xml"/></Types>';
      const att = await buildDocx({
        '[Content_Types].xml': ct,
        'word/document.xml': documentXml(p(r('From an attached template'))),
        'word/settings.xml': settings,
        'word/_rels/settings.xml.rels': srels},
      {broken: 'template main type in a .docx (the input)'});
      const got = await openDoc(vfsOf(att), '$.T.dotx').catch((e) => e);
      assert.ok(!(got instanceof Error), String(got));
      const o2 = await write(got.doc);
      const again = await readDocx(o2);
      assert.ok(!isTemplate(again));
      assert.ok(!(again.rawSettings && /attachedTemplate/.test(
        JSON.stringify(again.rawSettings))));
      emit('template-attached-removed', o2, {from: att});
    });
});
