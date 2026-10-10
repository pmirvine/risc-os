// !Word SettingsEdit: settings.xml's w:defaultTabStop read and changed
// (a new root with only that child replaced, or inserted in schema
// order), and the Tabs dialog's default through FormatApply 'tabsBox'
// (TabsCommand): only that element differs in the written part, Strict
// settings, a root with mc:Ignorable and unknown children, one undo
// step with the tab edits, undo restores the old root object.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import * as SE from '../../tools/moreapps/!Word/SettingsEdit';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import {defaultStop} from '../../tools/moreapps/!Word/TabStops';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import * as S from '../../tools/moreapps/!Word/Selection';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {index, flatten, DEFAULT_XSD}
  from '../../tools/moreapps-xsdorder.mjs';
import {buildDocx, documentXml, stylesXml, p, r, W_NS, STRICT_W_NS}
  from './build-docx.mjs';
import {schemaChecker} from './roundtrip-lib.mjs';

const DATE = new Date(Date.UTC(2026, 0, 1));
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const dts = (v) => `<w:defaultTabStop w:val="${v}"/>`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

// a settings part as Word writes it: mc:Ignorable, w14 / w15 children,
// rsids, compat with its own settings, an mc:AlternateContent
const wordSettings = (dt, ns = W_NS) => DECL +
  `<w:settings xmlns:w="${ns}" xmlns:mc="${MC}" xmlns:w14="${W14}"` +
  ` xmlns:w15="${W15}" xmlns:o="urn:schemas-microsoft-com:office:office"` +
  ' mc:Ignorable="w14 w15">' +
  '<w:zoom w:percent="120"/><w:proofState w:spelling="clean"/>' +
  dt + '<w:characterSpacingControl w:val="doNotCompress"/>' +
  '<w:compat><w:compatSetting w:name="compatibilityMode" ' +
  'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
  '</w:compat><w:rsids><w:rsidRoot w:val="00A1B2C3"/></w:rsids>' +
  '<mc:AlternateContent><mc:Choice Requires="w14"><w14:x/></mc:Choice>' +
  '</mc:AlternateContent><w14:docId w14:val="1A2B3C4D"/>' +
  '<w15:chartTrackingRefBased/><o:shapelayout/>' +
  '<w:decimalSymbol w:val="."/></w:settings>';

const open = async (settings, o = {}) => {
  const parts = {'word/document.xml': documentXml(p(r('One')) +
    p(r('Two')), o), 'word/styles.xml': stylesXml('', o)};
  if (settings !== null) parts['word/settings.xml'] = settings;
  const d = new Document(await readDocx(await buildDocx(parts,
    {strict: o.ns === STRICT_W_NS})));
  d.clearHistory();
  return d;
};
const settingsBytes = async (doc) => new TextDecoder().decode(
  (await readZip(await writeDocx(doc, {date: DATE})))
    .get('word/settings.xml'));
const caret = (d) => S.caret({id: blockId(d.doc.sections[0].blocks[0]),
  off: 0});
const tabsBox = (d, arg, sel = caret(d)) =>
  FA.apply('tabsBox', d, new Typing(d), sel, arg);
const root = (xml) => parseXml(xml).root;
const kids = (n) => n.children.filter((c) => typeof c === 'object');

describe('SettingsEdit.defaultTabOf', () => {
  it('the first w:defaultTabStop in twips; null for none or junk', () => {
    const s = (inner) => root(`<w:settings xmlns:w="${W_NS}">${inner}` +
      '</w:settings>');
    assert.equal(SE.defaultTabOf(s(dts('720'))), 720);
    assert.equal(SE.defaultTabOf(s(dts('0.5in'))), 720);
    assert.equal(SE.defaultTabOf(s(dts('360') + dts('1440'))), 360);
    assert.equal(SE.defaultTabOf(s('<w:zoom w:percent="100"/>')), null);
    assert.equal(SE.defaultTabOf(s(dts('abc'))), null);
    assert.equal(SE.defaultTabOf(null), null);
    assert.equal(SE.defaultTabOf(root('<x:settings xmlns:x="urn:x">' +
      '<x:defaultTabStop x:val="360"/></x:settings>')), null);
  });
});

describe('SettingsEdit.withDefaultTab', () => {
  it('a new root: only that child replaced, the rest the same objects',
    () => {
      const old = root(wordSettings(dts('720')));
      const before = JSON.stringify(old);
      const now = SE.withDefaultTab(old, 1440);
      assert.notEqual(now, old);
      assert.equal(JSON.stringify(old), before, 'old root unchanged');
      assert.equal(now.attrs, old.attrs);
      assert.equal(now.children.length, old.children.length);
      const i = old.children.findIndex((c) => c.name ===
        'w:defaultTabStop');
      old.children.forEach((c, k) => {
        if (k !== i) assert.equal(now.children[k], c, 'child ' + k);
      });
      assert.deepEqual(now.children[i].attrs, [['w:val', '1440']]);
      assert.equal(SE.defaultTabOf(now), 1440);
    });
  it('the same value (also written with a unit) gives the same root',
    () => {
      const a = root(wordSettings(dts('720')));
      assert.equal(SE.withDefaultTab(a, 720), a);
      const b = root(wordSettings(dts('0.5in')));
      assert.equal(SE.withDefaultTab(b, 720), b);
    });
  it('a value written with a unit is written in points', () => {
    const a = root(wordSettings(dts('0.5in')));
    const i = a.children.findIndex((c) => c.name === 'w:defaultTabStop');
    assert.deepEqual(SE.withDefaultTab(a, 1440).children[i].attrs,
      [['w:val', '72pt']]);
    assert.deepEqual(SE.withDefaultTab(a, 721).children[i].attrs,
      [['w:val', '36.05pt']]);
    assert.equal(SE.defaultTabOf(SE.withDefaultTab(a, 721)), 721);
  });
  it('other attributes kept; repeated: only the first changes', () => {
    const a = root(`<w:settings xmlns:w="${W_NS}"><w:defaultTabStop ` +
      'w:val="720" w14:x="1" xmlns:w14="urn:w14"/>' + dts('360') +
      '</w:settings>');
    const n = SE.withDefaultTab(a, 1080);
    assert.deepEqual(n.children[0].attrs, [['w:val', '1080'],
      ['w14:x', '1'], ['xmlns:w14', 'urn:w14']]);
    assert.equal(n.children[1], a.children[1]);
  });
  it('none: inserted in schema order (after the last child before it)',
    () => {
      const a = root(wordSettings(''));
      const n = SE.withDefaultTab(a, 1440);
      const names = kids(n).map((c) => c.name);
      assert.deepEqual(names.slice(0, 4), ['w:zoom', 'w:proofState',
        'w:defaultTabStop', 'w:characterSpacingControl']);
      assert.equal(n.children.length, a.children.length + 1);
      // none of the children before it: first
      const b = root(`<w:settings xmlns:w="${W_NS}"><w:compat/>` +
        '</w:settings>');
      assert.deepEqual(kids(SE.withDefaultTab(b, 1440))
        .map((c) => c.name), ['w:defaultTabStop', 'w:compat']);
      // an empty root
      const e = root(`<w:settings xmlns:w="${W_NS}"/>`);
      assert.equal(SE.defaultTabOf(SE.withDefaultTab(e, 900)), 900);
    });
  it('a root with WordprocessingML only as the default namespace', () => {
    const a = root(`<settings xmlns="${W_NS}"><zoom/></settings>`);
    const n = SE.withDefaultTab(a, 1440);
    assert.equal(SE.defaultTabOf(n), 1440);
    assert.deepEqual(n.children[1].attrs, [['xmlns:w', W_NS],
      ['w:val', '1440']]);
  });
  it('refuses bad values and roots (RangeError)', () => {
    const a = root(wordSettings(dts('720')));
    for (const v of [35, 31681, 720.5, NaN, '720', -720, null]) {
      assert.throws(() => SE.withDefaultTab(a, v), RangeError, String(v));
    }
    assert.throws(() => SE.withDefaultTab(null, 720), RangeError);
    assert.equal(SE.withDefaultTab(a, 36).children.length,
      a.children.length);
    assert.equal(SE.defaultTabOf(SE.withDefaultTab(a, 31680)), 31680);
  });
  const have = existsSync(DEFAULT_XSD);
  it('BEFORE is the CT_Settings sequence up to defaultTabStop (wml.xsd)',
    {skip: have ? false : 'wml.xsd not cached'}, () => {
      const defs = index(readFileSync(DEFAULT_XSD, 'utf8'));
      const seq = flatten(defs, defs.get('complexType:CT_Settings'));
      assert.deepEqual([...SE.BEFORE], seq.slice(0,
        seq.indexOf('defaultTabStop')));
      // an insertion keeps a part in schema order
      const n = SE.withDefaultTab(root(wordSettings('')), 1440);
      const at = kids(n).filter((c) => c.name.startsWith('w:'))
        .map((c) => seq.indexOf(c.name.slice(2)));
      assert.ok(at.every((x, k) => x >= 0 && (!k || x >= at[k - 1])), at);
    });
});

describe('FormatApply tabsBox: the default tab stop', () => {
  it('only w:defaultTabStop differs in the written part', async () => {
    const d = await open(wordSettings(dts('720')));
    const was = await settingsBytes(d.doc);
    tabsBox(d, {defaultTab: 1440});
    const now = await settingsBytes(d.doc);
    assert.equal(now, was.replace(dts('720'), dts('1440')));
    assert.notEqual(now, was);
    assert.equal(defaultStop(d.doc), 1440);
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    assert.equal(defaultStop(back), 1440);
  });
  it('inserted where there was none; the rest byte for byte', async () => {
    const d = await open(wordSettings(''));
    const was = await settingsBytes(d.doc);
    tabsBox(d, {defaultTab: 1440});
    const at = was.indexOf('<w:characterSpacingControl');
    assert.equal(await settingsBytes(d.doc), was.slice(0, at) +
      dts('1440') + was.slice(at));
  });
  it('Strict settings: written Strict, in points, read back', async () => {
    const d = await open(wordSettings(dts('0.5in'), STRICT_W_NS),
      {ns: STRICT_W_NS});
    assert.equal(defaultStop(d.doc), 720);
    const was = await settingsBytes(d.doc);
    tabsBox(d, {defaultTab: 1440});
    const now = await settingsBytes(d.doc);
    assert.equal(now, was.replace(dts('0.5in'), dts('72pt')));
    assert.ok(now.includes(STRICT_W_NS));
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    assert.equal(back.meta.conformance, 'strict');
    assert.equal(defaultStop(back), 1440);
  });
  it('undo restores the old root object; redo the new one', async () => {
    const d = await open(wordSettings(dts('720')));
    const old = d.doc.rawSettings;
    tabsBox(d, {defaultTab: 360});
    const now = d.doc.rawSettings;
    assert.notEqual(now, old);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(d.doc.rawSettings, old);
    assert.equal(defaultStop(d.doc), 720);
    d.redo();
    assert.equal(d.doc.rawSettings, now);
  });
  it('with tab edits: one undo step; undo gives both back', async () => {
    const d = await open(wordSettings(dts('720')));
    const old = d.doc.rawSettings, p0 = d.doc.sections[0].blocks[0];
    const sel = S.select({id: blockId(p0), off: 0}, {id: blockId(
      d.doc.sections[0].blocks[1]), off: 1});
    tabsBox(d, {defaultTab: 1440, tabs: {edits: [{add: {val: 'right',
      pos: 4320}}]}}, sel);
    assert.equal(d.undoDepth, 1);
    for (const b of d.doc.sections[0].blocks) {
      assert.deepEqual(b.pPr.tabs, [{val: 'right', pos: 4320}]);
    }
    d.undo();
    assert.equal(d.doc.rawSettings, old);
    assert.equal(d.doc.sections[0].blocks[0], p0);
    assert.equal(d.doc.sections[0].blocks[0].pPr.tabs, undefined);
  });
  it('the same value: no op, no undo step', async () => {
    const d = await open(wordSettings(dts('720')));
    const old = d.doc.rawSettings;
    tabsBox(d, {defaultTab: 720});
    assert.equal(d.undoDepth, 0);
    assert.equal(d.doc.rawSettings, old);
  });
  it('refused (RangeError, nothing changed): no settings part, bad '
    + 'values, unknown keys', async () => {
    const none = await open(null);
    assert.equal(none.doc.rawSettings, null);
    assert.throws(() => tabsBox(none, {defaultTab: 1440}), RangeError);
    assert.equal(none.undoDepth, 0);
    const d = await open(wordSettings(dts('720')));
    for (const a of [{defaultTab: 10}, {defaultTab: 'x'}, {other: 1},
      null, [], {defaultTab: 1440, tabs: {move: {from: 1, to: 2}},
        x: 1}]) {
      assert.throws(() => tabsBox(d, a), RangeError, JSON.stringify(a));
    }
    // all or nothing: a good default with tabs refused
    assert.throws(() => tabsBox(d, {defaultTab: 1440, tabs: {edits:
      [{add: {val: 'nope', pos: 1}}]}}), RangeError);
    assert.equal(d.undoDepth, 0);
    assert.equal(defaultStop(d.doc), 720);
  });
  it('the part validates against wml.xsd after an insertion', async (t) => {
    const x = schemaChecker();
    if (typeof x === 'string') return t.skip(x);
    try {
      const plain = DECL + `<w:settings xmlns:w="${W_NS}">` +
        '<w:zoom w:percent="100"/><w:proofState w:spelling="clean"/>' +
        '<w:characterSpacingControl w:val="doNotCompress"/>' +
        '<w:compat/></w:settings>';
      const d = await open(plain);
      const enc = (s) => new TextEncoder().encode(s);
      assert.deepEqual([...x.errors(enc(await settingsBytes(d.doc)))], []);
      tabsBox(d, {defaultTab: 1440});
      assert.deepEqual([...x.errors(enc(await settingsBytes(d.doc)))], []);
    } finally {
      x.done();
    }
  });
});
