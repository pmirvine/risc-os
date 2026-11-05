// StyleDefaults: the document's defaults (w:docDefaults) changed by
// Format > Document defaults... (./DefaultsBox). modifyDefaults on a
// table with and without the original w:docDefaults (raw): the size,
// a font name over theme fonts, the space after, the line spacing;
// the raw node PATCHED (w:lang, unknown children and the other
// scripts' theme fonts kept, compared as written XML); an ambiguous
// original refused; one undo step; written and read back; the layout
// of a document whose Normal inherits the defaults follows them. The
// box's values (fillDefaults) and their checking (defaultsPatch).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {readStyles} from '../../tools/moreapps/!Letters/ReadStyles';
import {stylesTree} from '../../tools/moreapps/!Letters/WriteStyles';
import {rootScope} from '../../tools/moreapps/!Letters/Ns';
import {newStyleTable} from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins}
  from '../../tools/moreapps/!Letters/StylesBuiltin';
import {modifyDefaults}
  from '../../tools/moreapps/!Letters/StyleDefaults';
import {fillDefaults, defaultsPatch}
  from '../../tools/moreapps/!Letters/DefaultsPatch';
import * as SC from '../../tools/moreapps/!Letters/StyleCmd';
import {run} from '../../tools/moreapps/!Letters/StyleDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {tm, loadStyles} from './word-docs.mjs';
import {emit} from './word-emit.mjs';

const DATE = new Date(Date.UTC(2026, 10, 4, 12));
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NSS = 'xmlns:mc="http://schemas.openxmlformats.org/' +
  'markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats' +
  '.org/officeDocument/2006/relationships" xmlns:w="' + W + '" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/' +
  'wordml" mc:Ignorable="w14"';

// (Word 365's docDefaults: theme fonts, w:kern, w:lang, w14:ligatures)
const RPR = '<w:rFonts w:asciiTheme="minorHAnsi" ' +
  'w:eastAsiaTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" ' +
  'w:cstheme="minorBidi"/><w:kern w:val="2"/><w:sz w:val="22"/>' +
  '<w:szCs w:val="22"/><w:lang w:val="en-GB" w:eastAsia="en-US" ' +
  'w:bidi="ar-SA"/><w14:ligatures w14:val="standardContextual"/>';
const PPR = '<w:spacing w:after="160" w:line="259" ' +
  'w:lineRule="auto"/>';
const DEFAULTS = (rpr = RPR, ppr = PPR) => '<w:docDefaults>' +
  '<w:rPrDefault><w:rPr>' + rpr + '</w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr>' + ppr + '</w:pPr></w:pPrDefault>' +
  '</w:docDefaults>';
const NORMAL = '<w:style w:type="paragraph" w:default="1" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>';
const STYLES = (dd = DEFAULTS()) => '<?xml version="1.0" ' +
  'encoding="UTF-8" standalone="yes"?>\r\n<w:styles ' + NSS + '>' +
  dd + '<w:latentStyles w:defLockedState="0" w:defUIPriority="99" ' +
  'w:defSemiHidden="0" w:defUnhideWhenUsed="0" w:defQFormat="0" ' +
  'w:count="376"/>' + NORMAL + '</w:styles>';

function tableOf(xml) {
  const root = parseXml(xml).root;
  return readStyles(root, rootScope(root));
}
/** The written w:docDefaults of a table, as XML text. */
const ddXml = (t) => /<w:docDefaults>.*<\/w:docDefaults>/
  .exec(serialize(stylesTree(t)))?.[0] ?? null;

/** A table with no original w:docDefaults (as NewDoc's draft). */
function modelOnly() {
  const t = ensureBuiltins(newStyleTable());
  t.docDefaults = {
    rPr: {rFonts: {ascii: 'Calibri', hAnsi: 'Calibri',
      eastAsia: 'Calibri', cs: 'Calibri'}, sz: 22, szCs: 22, extra: []},
    pPr: {spacing: {after: 160, line: 259, lineRule: 'auto'},
      extra: []}};
  return t;
}

describe('modifyDefaults: a table without the original node', () => {
  it('size: sz and szCs, the table new, the old one as it was', () => {
    const t = modelOnly(), was = structuredClone(t.docDefaults);
    const out = modifyDefaults(t, {rPr: {sz: 24}});
    assert.notEqual(out, t);
    assert.equal(out.docDefaults.rPr.sz, 24);
    assert.equal(out.docDefaults.rPr.szCs, 24);
    assert.deepEqual(t.docDefaults, was, 'copy-on-write');
    assert.equal(out.styles, t.styles, 'the styles shared');
    assert.equal(out.docDefaultsRaw ?? null, null);
  });
  it('font: ascii, hAnsi and cs set, eastAsia kept', () => {
    const out = modifyDefaults(modelOnly(), {rPr: {font: 'Arial'}});
    assert.deepEqual(out.docDefaults.rPr.rFonts, {ascii: 'Arial',
      hAnsi: 'Arial', eastAsia: 'Calibri', cs: 'Arial'});
  });
  it('space after and line spacing: w:spacing merged', () => {
    const out = modifyDefaults(modelOnly(), {pPr: {after: 0}});
    assert.deepEqual(out.docDefaults.pPr.spacing, {after: 0,
      line: 259, lineRule: 'auto'});
    const two = modifyDefaults(modelOnly(), {pPr: {line: 300,
      lineRule: 'exact'}});
    assert.deepEqual(two.docDefaults.pPr.spacing, {after: 160,
      line: 300, lineRule: 'exact'});
  });
  it('nothing changed: the table itself', () => {
    const t = modelOnly();
    assert.equal(modifyDefaults(t, {rPr: {sz: 22}, pPr: {after: 160}}),
      t);
    assert.equal(modifyDefaults(t, {}), t);
  });
  it('a table with no defaults at all gets them', () => {
    const t = ensureBuiltins(newStyleTable());
    const out = modifyDefaults(t, {rPr: {sz: 20}, pPr: {after: 100}});
    assert.equal(out.docDefaults.rPr.sz, 20);
    assert.equal(out.docDefaults.pPr.spacing.after, 100);
    assert.match(ddXml(out), /<w:sz w:val="20"\/>/);
  });
  it('StyleCmd re-exports it', () => {
    assert.equal(SC.modifyDefaults, modifyDefaults);
  });
});

describe('modifyDefaults: the original node patched', () => {
  it('Word\'s styles.xml: lang, kern, ligatures and the East Asian ' +
    'theme font kept', () => {
    const t = tableOf(STYLES());
    const before = ddXml(t);
    const out = modifyDefaults(t, {rPr: {font: 'Arial', sz: 24},
      pPr: {after: 120, line: 360, lineRule: 'auto'}});
    assert.equal(ddXml(t), before, 'the old table unchanged');
    assert.equal(ddXml(out), DEFAULTS('<w:rFonts w:ascii="Arial" ' +
      'w:eastAsiaTheme="minorHAnsi" w:hAnsi="Arial" w:cs="Arial"/>' +
      '<w:kern w:val="2"/><w:sz w:val="24"/><w:szCs w:val="24"/>' +
      '<w:lang w:val="en-GB" w:eastAsia="en-US" w:bidi="ar-SA"/>' +
      '<w14:ligatures w14:val="standardContextual"/>',
    '<w:spacing w:after="120" w:line="360" w:lineRule="auto"/>'));
    assert.ok(out.docDefaultsRaw, 'still written as the node');
    // the model follows the node
    assert.equal(out.docDefaults.rPr.sz, 24);
    assert.deepEqual(out.docDefaults.pPr.spacing, {after: 120,
      line: 360, lineRule: 'auto'});
    // the rest of styles.xml as it was
    const rest = (x) => serialize(stylesTree(x))
      .replace(/<w:docDefaults>.*<\/w:docDefaults>/, '');
    assert.equal(rest(out), rest(t));
  });
  it('only the size: the theme fonts stay', () => {
    const out = modifyDefaults(tableOf(STYLES()), {rPr: {sz: 28}});
    assert.equal(ddXml(out), DEFAULTS(RPR.replace(/"22"/g, '"28"')));
  });
  it('the font over theme fonts, without other scripts\' themes', () => {
    const out = modifyDefaults(tableOf(STYLES(DEFAULTS(
      '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"' +
      ' w:cstheme="minorBidi" w:hint="eastAsia"/>'))),
    {rPr: {font: 'Georgia'}});
    assert.ok(ddXml(out).includes('<w:rFonts w:ascii="Georgia" ' +
      'w:hAnsi="Georgia" w:cs="Georgia" w:hint="eastAsia"/>'),
    ddXml(out));
    assert.deepEqual(out.docDefaults.rPr.rFonts, {ascii: 'Georgia',
      hAnsi: 'Georgia', cs: 'Georgia', hint: 'eastAsia'});
  });
  it('a missing child or part is added in schema order', () => {
    const out = modifyDefaults(tableOf(STYLES(DEFAULTS(
      '<w:b/><w:lang w:val="en-US"/>', '<w:jc w:val="left"/>'))),
    {rPr: {font: 'Arial', sz: 20}, pPr: {after: 0}});
    assert.equal(ddXml(out), DEFAULTS('<w:rFonts w:ascii="Arial" ' +
      'w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="20"/>' +
      '<w:szCs w:val="20"/><w:lang w:val="en-US"/>',
    '<w:spacing w:after="0"/><w:jc w:val="left"/>'));
    const none = modifyDefaults(tableOf(STYLES('<w:docDefaults>' +
      '<w:pPrDefault/></w:docDefaults>')), {rPr: {sz: 20},
      pPr: {after: 0}});
    assert.equal(ddXml(none), '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="0"/></w:pPr>' +
      '</w:pPrDefault></w:docDefaults>');
  });
  it('w:spacing\'s other attributes kept; afterAutospacing and ' +
    'afterLines go with a new after', () => {
    const out = modifyDefaults(tableOf(STYLES(DEFAULTS(RPR,
      '<w:spacing w:before="40" w:after="160" w:afterLines="50" ' +
      'w:afterAutospacing="1" w:line="259" w:lineRule="auto"/>'))),
    {pPr: {after: 200}});
    assert.ok(ddXml(out).includes('<w:spacing w:before="40" ' +
      'w:after="200" w:line="259" w:lineRule="auto"/>'), ddXml(out));
  });
  it('nothing changed: the table itself', () => {
    const t = tableOf(STYLES());
    assert.equal(modifyDefaults(t, {rPr: {sz: 22},
      pPr: {after: 160, line: 259, lineRule: 'auto'}}), t);
  });
});

describe('modifyDefaults: an ambiguous original is refused', () => {
  const cases = [
    ['two w:rPrDefault', '<w:docDefaults><w:rPrDefault><w:rPr/>' +
      '</w:rPrDefault><w:rPrDefault><w:rPr/></w:rPrDefault>' +
      '</w:docDefaults>', {rPr: {sz: 24}}],
    ['two w:pPrDefault', '<w:docDefaults><w:pPrDefault><w:pPr/>' +
      '</w:pPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault>' +
      '</w:docDefaults>', {pPr: {after: 0}}],
    ['an attribute on w:rPr', '<w:docDefaults><w:rPrDefault>' +
      '<w:rPr w:rsidR="00AB"><w:sz w:val="22"/></w:rPr>' +
      '</w:rPrDefault></w:docDefaults>', {rPr: {sz: 24}}],
    ['an attribute on w:docDefaults', '<w:docDefaults ' +
      'xmlns:x="urn:x" x:a="1"><w:rPrDefault><w:rPr/></w:rPrDefault>' +
      '</w:docDefaults>', {rPr: {sz: 24}}],
    ['two w:sz', DEFAULTS('<w:sz w:val="22"/><w:sz w:val="24"/>'),
      {rPr: {sz: 20}}],
    ['two w:spacing', DEFAULTS(RPR, '<w:spacing w:after="1"/>' +
      '<w:spacing w:after="2"/>'), {pPr: {after: 0}}],
  ];
  for (const [what, dd, patch] of cases) {
    it(what, () => {
      const t = tableOf(STYLES(dd));
      const out = modifyDefaults(t, patch);
      assert.equal(typeof out.refused, 'string', what);
      assert.ok(out.refused.length > 10);
      assert.ok(!out.styles, 'no table');
    });
  }
  it('WML only as the default namespace: no prefix, refused', () => {
    const t = tableOf('<styles xmlns="' + W + '"><docDefaults>' +
      '<rPrDefault><rPr><sz val="22"/></rPr></rPrDefault>' +
      '</docDefaults></styles>');
    assert.ok(t.docDefaultsRaw);
    const out = modifyDefaults(t, {rPr: {sz: 24}});
    assert.match(out.refused, /without a prefix/);
    assert.equal(modifyDefaults(t, {}), t, 'nothing asked: no refusal');
  });
  it('the part not asked for may be ambiguous', () => {
    const t = tableOf(STYLES('<w:docDefaults><w:rPrDefault><w:rPr/>' +
      '</w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault>' +
      '<w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults>'));
    const out = modifyDefaults(t, {rPr: {sz: 24}});
    assert.equal(out.refused, undefined);
    assert.equal(out.docDefaults.rPr.sz, 24);
  });
});

describe('the box\'s values: fillDefaults and defaultsPatch', () => {
  it('fill: the theme font read, the size, after and spacing', () => {
    assert.deepEqual(fillDefaults(tableOf(STYLES())), {font: 'Calibri',
      size: 11, after: 160, spacing: 'multiple', at: 259 / 240});
    assert.deepEqual(fillDefaults(modifyDefaults(modelOnly(),
      {rPr: {font: 'Arial', sz: 21}, pPr: {line: 240}})),
    {font: 'Arial', size: 10.5, after: 160, spacing: 'single',
      at: undefined});
  });
  it('patch: only what changed', () => {
    const was = fillDefaults(tableOf(STYLES()));
    assert.deepEqual(defaultsPatch({...was}, was), {patch: {}});
    assert.deepEqual(defaultsPatch({...was, font: ' Arial ', size: 12},
      was), {patch: {rPr: {font: 'Arial', sz: 24}}});
    assert.deepEqual(defaultsPatch({...was, after: 0,
      spacing: 'double'}, was), {patch: {pPr: {after: 0, line: 480,
      lineRule: 'auto'}}});
    assert.deepEqual(defaultsPatch({...was, spacing: 'exactly',
      at: 14}, was), {patch: {pPr: {line: 280, lineRule: 'exact'}}});
  });
  it('patch: a value that is not one is refused, the field named',
    () => {
      const was = fillDefaults(tableOf(STYLES()));
      for (const [k, v] of [['size', null], ['size', 0.5],
        ['size', 401], ['font', ''], ['font', '  '], ['font', null],
        ['after', null], ['after', -20], ['after', 31700],
        ['at', null]]) {
        const vals = {...was, [k]: v};
        if (k === 'at') vals.spacing = 'exactly';
        const out = defaultsPatch(vals, was);
        assert.ok(out.error, `${k} ${v}`);
        assert.deepEqual(out.bad, [k], `${k} ${v}`);
        assert.match(out.error, /^Check the .* value\.$/);
      }
      const both = defaultsPatch({...was, size: null, after: null}, was);
      assert.equal(both.error, 'Check the Size, After values.');
    });
});

// ------------------------------------------------------- documents

const BODY = documentXml(p(r('Body text that inherits the ' +
  'defaults, long enough to wrap in a narrow column. '.repeat(4))) +
  p(r('Second paragraph.')));

async function open(bytes) {
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  return {d, typing: new Typing(d)};
}
const set = (d, typing, patch) => run(d, typing, (t) => {
  const out = modifyDefaults(t, patch);
  return out && !out.refused && out !== t ? {table: out} : null;
});

describe('Document defaults on a document', () => {
  before(loadStyles);
  it('one undo step; undo gives the table back deepEqual', async () => {
    const {d, typing} = await open(await buildDocx({
      'word/document.xml': BODY, 'word/styles.xml': STYLES()}));
    const was = structuredClone(d.doc.styles);
    assert.ok(set(d, typing, {rPr: {sz: 32}, pPr: {after: 0}}));
    assert.equal(d.undoDepth, 1);
    assert.equal(d.doc.styles.docDefaults.rPr.sz, 32);
    d.undo();
    assert.deepEqual(d.doc.styles, was);
    d.redo();
    assert.equal(d.doc.styles.docDefaults.rPr.sz, 32);
  });
  it('written and read back: the changes there, the rest kept',
    async () => {
      const {d, typing} = await open(await buildDocx({
        'word/document.xml': BODY, 'word/styles.xml': STYLES()}));
      set(d, typing, {rPr: {font: 'Arial', sz: 24}, pPr: {after: 120,
        line: 360, lineRule: 'auto'}});
      const bytes = await writeDocx(d.doc, {date: DATE});
      emit('docdefaults-word', bytes);
      const back = await readDocx(bytes);
      assert.equal(ddXml(back.styles), ddXml(d.doc.styles));
      assert.equal(back.styles.docDefaults.rPr.sz, 24);
      assert.deepEqual(back.styles.docDefaults.pPr.spacing,
        {after: 120, line: 360, lineRule: 'auto'});
      assert.equal(fillDefaults(back.styles).font, 'Arial');
      assert.match(ddXml(back.styles), /<w:lang w:val="en-GB"/);
    });
  it('a new document: written, read back, opens in Word', async () => {
    const d = new Document(newDoc({date: DATE}));
    const typing = new Typing(d);
    d.clearHistory();
    assert.ok(set(d, typing, {rPr: {font: 'Georgia', sz: 24},
      pPr: {after: 240, line: 276, lineRule: 'auto'}}));
    const bytes = await writeDocx(d.doc, {date: DATE});
    emit('docdefaults-new', bytes);
    const back = await readDocx(bytes);
    assert.deepEqual(fillDefaults(back.styles), {font: 'Georgia',
      size: 12, after: 240, spacing: 'multiple', at: 276 / 240});
  });
  it('the layout shows the new default size and spacing (Normal ' +
    'inherits them)', async () => {
    const {d, typing} = await open(await buildDocx({
      'word/document.xml': BODY, 'word/styles.xml': STYLES()}));
    const L1 = new DocLayout(d.doc, tm());
    L1.layout(400);
    const para = d.doc.sections[0].blocks[0];
    const px1 = runFmt(d.doc.styles, para, para.runs[0]).px;
    const h1 = L1.items.map((it) => it.h);
    set(d, typing, {rPr: {sz: 44}});
    const L2 = new DocLayout(d.doc, tm(), L1);
    L2.layout(400);
    const px2 = runFmt(d.doc.styles, para, para.runs[0]).px;
    assert.ok(px2 > px1 * 1.9, `${px1} -> ${px2}`);
    assert.ok(L2.items[0].h > h1[0], 'taller lines');
    // the space after alone: the second paragraph (one line) is
    // taller by it (Word's space after is in the item's height)
    const one = L2.items[1].h;
    set(d, typing, {pPr: {after: 600}});
    const L2b = new DocLayout(d.doc, tm(), L2);
    L2b.layout(400);
    assert.ok(L2b.items[1].h > one, `space after: ${one} -> ` +
      L2b.items[1].h);
    d.undo();
    // and back
    d.undo();
    const L3 = new DocLayout(d.doc, tm(), L2);
    L3.layout(400);
    assert.deepEqual(L3.items.map((it) => it.h), h1);
  });
});
