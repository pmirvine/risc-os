// NoteOpts (Batch E2): how notes are placed and numbered, read from
// settings.xml and a section's own properties; and the note styles.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as NO from '../../tools/moreapps/!Letters/NoteOpts';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {builtinStyle, galleryIds, ensureBuiltins} from
  '../../tools/moreapps/!Letters/StylesBuiltin';
import {ensureBuiltin} from '../../tools/moreapps/!Letters/StyleCmd';
import {newStyleTable} from '../../tools/moreapps/!Letters/Styles';
import {displayName} from '../../tools/moreapps/!Letters/StyleName';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, settingsXml, p, r}
  from './build-docx.mjs';
import {mk} from './edit-docs.mjs';

const dec = (b) => new TextDecoder().decode(b);

async function load(settings, sect = '') {
  const parts = {'word/document.xml': documentXml(p(r('x')) + sect)};
  if (settings !== null) parts['word/settings.xml'] =
    settingsXml(settings);
  return readDocx(await buildDocx(parts, {docRels: settings === null
    ? [] : [['rIdS', 'http://schemas.openxmlformats.org/' +
      'officeDocument/2006/relationships/settings', 'settings.xml']]}));
}
const FPR = '<w:footnotePr><w:pos w:val="beneathText"/>' +
  '<w:numFmt w:val="lowerRoman"/><w:numStart w:val="3"/>' +
  '<w:numRestart w:val="eachPage"/>' +
  '<w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>';
const EPR = '<w:endnotePr><w:pos w:val="sectEnd"/>' +
  '<w:numFmt w:val="upperLetter"/><w:numStart w:val="2"/>' +
  '<w:numRestart w:val="eachSect"/></w:endnotePr>';

describe('NoteOpts', () => {
  it('Word defaults without settings', async () => {
    const o = NO.read(await load(null));
    assert.deepEqual(o, {
      footnotes: {pos: 'pageBottom', numFmt: 'decimal', numStart: 1,
        numRestart: 'continuous'},
      endnotes: {pos: 'docEnd', numFmt: 'decimal', numStart: 1,
        numRestart: 'continuous'}});
  });
  it('NoteOpts reads pos numFmt numStart numRestart at both ' +
    'levels and a section override', async () => {
    const sect = '<w:sectPr><w:endnotePr><w:pos w:val="docEnd"/>' +
      '<w:numStart w:val="5"/></w:endnotePr></w:sectPr>';
    const doc = await load(FPR + EPR, sect);
    const o = NO.read(doc);
    assert.deepEqual(o.footnotes, {pos: 'beneathText',
      numFmt: 'lowerRoman', numStart: 3, numRestart: 'eachPage'});
    assert.deepEqual(o.endnotes, {pos: 'sectEnd',
      numFmt: 'upperLetter', numStart: 2, numRestart: 'eachSect'});
    const s = NO.forSection(doc, doc.sections[0]);
    assert.deepEqual(s.footnotes, o.footnotes);
    assert.deepEqual(s.endnotes, {pos: 'docEnd',
      numFmt: 'upperLetter', numStart: 5, numRestart: 'eachSect'});
  });
  it('unknown children of footnotePr survive', async () => {
    const doc = await load(FPR);
    const bytes = await writeDocx(doc, {date: new Date(2024, 1, 1)});
    const x = dec((await readZip(bytes)).get('word/settings.xml'));
    assert.ok(x.includes('<w:footnote w:id="-1"/><w:footnote ' +
      'w:id="0"/>'));
    assert.equal(NO.read(doc).footnotes.numStart, 3);
  });
  it('hostile values (bad enums, huge numStart) fall back to ' +
    'Word\'s defaults without throwing', async () => {
    const bad = '<w:footnotePr><w:pos w:val="sideways"/>' +
      '<w:numFmt w:val="bogus"/><w:numStart w:val="99999999999"/>' +
      '<w:numRestart w:val="never"/></w:footnotePr>' +
      '<w:endnotePr><w:pos w:val="pageBottom"/><w:numStart ' +
      'w:val="-4"/></w:endnotePr>';
    const o = NO.read(await load(bad));
    assert.deepEqual(o.footnotes, NO.DEFAULTS.footnotes);
    assert.deepEqual(o.endnotes, NO.DEFAULTS.endnotes);
    const zero = await load('<w:footnotePr><w:numStart w:val="0"/>' +
      '</w:footnotePr>');
    assert.equal(NO.read(zero).footnotes.numStart, 1);
    const top = await load('<w:footnotePr><w:numStart w:val="16383"/>' +
      '</w:footnotePr>');
    assert.equal(NO.read(top).footnotes.numStart, 16383);
    const over = await load('<w:footnotePr><w:numStart w:val="16384"/>' +
      '</w:footnotePr>');
    assert.equal(NO.read(over).footnotes.numStart, 1);
    assert.doesNotThrow(() => NO.read(null));
    assert.doesNotThrow(() => NO.forSection({}, null));
  });
});

describe('note styles', () => {
  it('definitions are Word\'s', () => {
    const t = builtinStyle('FootnoteText');
    assert.equal(t.name, 'footnote text');
    assert.equal(t.type, 'paragraph');
    assert.equal(t.basedOn, 'Normal');
    assert.equal(t.link, 'FootnoteTextChar');
    assert.equal(t.rPr.sz, 20);
    assert.equal(t.pPr.spacing.line, 240);
    assert.equal(t.pPr.spacing.lineRule, 'auto');
    const ref = builtinStyle('EndnoteReference');
    assert.equal(ref.name, 'endnote reference');
    assert.equal(ref.type, 'character');
    assert.equal(ref.rPr.vertAlign, 'superscript');
    assert.equal(ref.semiHidden, true);
    const ch = builtinStyle('EndnoteTextChar');
    assert.equal(ch.type, 'character');
    assert.equal(ch.link, 'EndnoteText');
    assert.equal(builtinStyle('EndnoteText').link, 'EndnoteTextChar');
    assert.equal(builtinStyle('FootnoteReference').rPr.vertAlign,
      'superscript');
  });
  it('display names are title-cased', () => {
    for (const [a, b] of [['footnote text', 'Footnote Text'],
      ['footnote reference', 'Footnote Reference'],
      ['endnote text', 'Endnote Text'],
      ['endnote reference', 'Endnote Reference']])
      assert.equal(displayName(a), b);
  });
  it('are latent: not in ensureBuiltins or the gallery, added on ' +
    'first use with the linked style', () => {
    const t = ensureBuiltins(newStyleTable());
    assert.ok(!t.styles.has('FootnoteText'));
    assert.ok(!galleryIds().some((i) => /note/.test(i)));
    const u = ensureBuiltin(t, 'FootnoteText');
    assert.ok(u.styles.has('FootnoteText'));
    assert.ok(u.styles.has('FootnoteTextChar'));
    assert.ok(!t.styles.has('FootnoteText'));
    const v = ensureBuiltin(t, 'EndnoteReference');
    assert.equal(v.styles.get('EndnoteReference').basedOn,
      'DefaultParagraphFont');
  });
  it('a document that never uses them keeps its styles part',
    async () => {
      const d = mk(['a']);
      const bytes = await writeDocx(d.doc, {date: new Date(2024, 1, 1)});
      const x = dec((await readZip(bytes)).get('word/styles.xml'));
      assert.ok(!/note/i.test(x));
    });
});
