// An RTF's default font: with a font table it is that (literal, no
// theme attributes); with none the new document's theme body font
// stays (Calibri through the theme), also in the saved docx.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {fontName} from '../../tools/moreapps/!Letters/Fmt';
import {resolveRun} from '../../tools/moreapps/!Letters/Styles';
import {loadStyles} from './word-docs.mjs';
import {emit} from './word-emit.mjs';

before(loadStyles);
const DATE = new Date(Date.UTC(2026, 0, 1));
const read = (s) => readRtf(new TextEncoder().encode(s),
  {date: DATE}).doc;
const bodyFont = (doc) => {
  const p = doc.sections[0].blocks.find((b) => b.type === 'p');
  return fontName(resolveRun(doc.styles, p, p.runs[0]),
    doc.styles.theme);
};
const stylesXml = async (doc) => {
  const bytes = await writeDocx(doc, {date: DATE});
  emit('rtf-import-fonts', bytes);
  return new TextDecoder().decode((await readZip(bytes)).get(
    'word/styles.xml'));
};
const defaultsOf = (xml) => /<w:rPrDefault>(.*?)<\/w:rPrDefault>/s
  .exec(xml)[1];

describe('RTF default font', () => {
  it('no font table: Calibri through the theme, kept when saved',
    async () => {
      const doc = read('{\\rtf1\\ansi hello\\par}');
      assert.equal(bodyFont(doc), 'Calibri');
      const d = defaultsOf(await stylesXml(doc));
      assert.match(d, /w:asciiTheme="minorHAnsi"/);
      assert.match(d, /w:hAnsiTheme="minorHAnsi"/);
    });
  it('a font table: that font, literal, no theme attributes',
    async () => {
      const doc = read('{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}' +
        'hello\\par}');
      assert.equal(bodyFont(doc), 'Arial');
      const d = defaultsOf(await stylesXml(doc));
      assert.match(d, /w:ascii="Arial"/);
      assert.doesNotMatch(d, /Theme|cstheme/);
    });
});
