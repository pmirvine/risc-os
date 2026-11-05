// Template: telling a template or macro package from a document, and
// the copies made to open one as a document / save a document as one.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {isTemplate, isMacro, toDocument, asTemplate}
  from '../../tools/moreapps/!Letters/Template';
import {emit} from './word-emit.mjs';
import {buildDocx, documentXml, p, r, W_NS, REL}
  from './build-docx.mjs';

const WML = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const TPL = WML + 'template.main+xml';
const DOC = WML + 'document.main+xml';
const DATE = new Date('2026-01-02T03:04:05Z');
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
  'relationships';
const dec = (b) => new TextDecoder().decode(b);

const CT_XML = (main) => '<?xml version="1.0" encoding="UTF-8" ' +
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
const rel = (id, kind, target, ext) => `<Relationship Id="${id}" ` +
  `Type="${REL(kind)}" Target="${target}"` +
  (ext ? ' TargetMode="External"' : '') + '/>';
const rels = (...l) => '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?><Relationships xmlns="http://schemas.' +
  'openxmlformats.org/package/2006/relationships">' + l.join('') +
  '</Relationships>';

/** A package whose main part has content type `main`, settings with an
 *  attachedTemplate, and the relationship in settings.xml.rels. */
const pkg = (main, settingsRels, extra = {}) => buildDocx({
  '[Content_Types].xml': CT_XML(main),
  'word/document.xml': documentXml(p(r('Hello'))),
  'word/settings.xml': SETTINGS,
  'word/_rels/settings.xml.rels': settingsRels, ...extra,
}, main === TPL ? {broken: 'template main type in a .docx (input)'} : {});
const EXT = rels(rel('rId9', 'attachedTemplate',
  'file:///C:/Users/x/Normal.dotm', true));
const mainOf = (d) => d.meta.contentTypes.overrides.find(
  ([n]) => n === '/' + d.meta.mainPart)[1];
const names = (el) => el.children.filter((c) => c.name)
  .map((c) => c.name);

describe('isTemplate', () => {
  it('is true for a template and false for a document', async () => {
    assert.equal(isTemplate(await readDocx(await pkg(TPL, EXT))), true);
    assert.equal(isTemplate(await readDocx(await pkg(DOC, EXT))), false);
    assert.equal(isTemplate(newDoc({date: DATE})), false);
  });
  it('reads a Default entry when the main part has no Override', () => {
    const doc = {meta: {mainPart: 'word/document.xml', contentTypes:
      {defaults: [['xml', TPL]], overrides: []}}};
    assert.equal(isTemplate(doc), true);
  });
});

describe('isMacro', () => {
  const ct = (t) => ({defaults: [], overrides:
    [['/word/document.xml', t]]});
  it('is true for macro-enabled documents and templates', () => {
    for (const k of ['document', 'template'])
      assert.equal(isMacro(ct(WML + k + '.macroEnabled.main+xml'),
        'word/document.xml'), true, k);
  });
  it('is false for the plain types and for no data', () => {
    assert.equal(isMacro(ct(DOC), 'word/document.xml'), false);
    assert.equal(isMacro(ct(TPL), 'word/document.xml'), false);
    assert.equal(isMacro({defaults: [], overrides: []}, 'a.xml'), false);
    assert.equal(isMacro(undefined, undefined), false);
  });
});

describe('toDocument', () => {
  it('writes as a document: type fixed, external template gone',
    async () => {
      const t = await readDocx(await pkg(TPL, EXT));
      assert.equal(mainOf(t), TPL);
      const d = toDocument(t);
      assert.equal(mainOf(d), DOC);
      assert.equal(isTemplate(d), false);
      const back = await readDocx(await writeDocx(d, {date: DATE}));
      assert.equal(mainOf(back), DOC);
      emit('tpl-to-document', await writeDocx(d, {date: DATE}));
      assert.deepEqual(names(back.rawSettings), ['w:zoom']);
      assert.ok(![...back.parts.keys()].some((n) =>
        n.endsWith('settings.xml.rels')));
      assert.equal(back.rels.some((x) => /attachedTemplate/.test(x.type)),
        false);
    });
  it('removes an external attachedTemplate rel of the main part',
    async () => {
      const t = await readDocx(await pkg(TPL, EXT));
      t.rels.push({id: 'rId77', type: REL('attachedTemplate'),
        target: 'http://example.com/x.dotx', mode: 'External'});
      t.rels.push({id: 'rId78', type: REL('attachedTemplate'),
        target: 'word/in.dotx'});
      const d = toDocument(t);
      assert.deepEqual(d.rels.filter((x) =>
        /attachedTemplate/.test(x.type)).map((x) => x.id), ['rId78']);
    });
  it('keeps an INTERNAL attachedTemplate relationship (only the setting '
    + 'element is removed: nothing is fetched, and an internal part is '
    + 'harmless data)', async () => {
    const internal = rels(rel('rId9', 'attachedTemplate', 'in.dotx'));
    const t = await readDocx(await pkg(TPL, internal));
    const d = toDocument(t);
    assert.deepEqual(names(d.rawSettings), ['w:zoom']);
    const back = await readDocx(await writeDocx(d, {date: DATE}));
    const text = dec(back.parts.get('word/_rels/settings.xml.rels'));
    assert.match(text, /attachedTemplate/);
    assert.match(text, /in\.dotx/);
  });
  it('keeps other settings relationships', async () => {
    const two = rels(rel('rId9', 'attachedTemplate', 'file:///a.dotm',
      true), rel('rId5', 'hyperlink', 'http://example.com/', true));
    const d = toDocument(await readDocx(await pkg(TPL, two)));
    const text = dec(d.parts.get('word/_rels/settings.xml.rels'));
    assert.match(text, /rId5/);
    assert.doesNotMatch(text, /rId9|a\.dotm/);
  });
  it('leaves the input Doc untouched and shares the rest', async () => {
    const t = await readDocx(await pkg(TPL, EXT));
    const before = structuredClone(t);
    const parts = new Map(t.parts);
    const d = toDocument(t);
    assert.deepEqual(t, before);
    assert.notEqual(d, t);
    assert.equal(d.sections, t.sections);
    for (const [n, v] of parts) {
      if (n.endsWith('settings.xml.rels')) continue;
      assert.equal(d.parts.get(n), v, n);
    }
  });
  it('does not throw without settings or relationships', () => {
    const d = toDocument({sections: [], parts: new Map(), meta: {
      mainPart: 'word/document.xml', contentTypes: {defaults: [],
        overrides: [['/word/document.xml', TPL]]}}});
    assert.equal(mainOf(d), DOC);
    const bare = toDocument({meta: {mainPart: 'word/document.xml'}});
    assert.equal(mainOf(bare), DOC);
  });
  it('adds an Override when the type came from a Default', () => {
    const d = toDocument({meta: {mainPart: 'word/document.xml',
      contentTypes: {defaults: [['xml', TPL]], overrides: []}}});
    assert.equal(mainOf(d), DOC);
  });
});

describe('asTemplate', () => {
  it('writes the main part as a template, the input untouched',
    async () => {
      const doc = newDoc({date: DATE});
      const before = structuredClone(doc);
      const t = asTemplate(doc);
      assert.deepEqual(doc, before);
      assert.equal(isTemplate(t), true);
      assert.equal(isTemplate(doc), false);
      const back = await readDocx(await writeDocx(t, {date: DATE}));
      assert.equal(mainOf(back), TPL);
      emit('tpl-as-template', await writeDocx(t, {date: DATE}),
        {ext: '.dotx'});
      for (const [n, v] of doc.parts) assert.equal(t.parts.get(n), v, n);
    });
  it('round trips: template to document and back', async () => {
    const t = await readDocx(await pkg(TPL, EXT));
    const d = toDocument(t);
    const again = asTemplate(d);
    assert.equal(mainOf(await readDocx(await writeDocx(again,
      {date: DATE}))), TPL);
    assert.equal(mainOf(d), DOC);
  });
});
