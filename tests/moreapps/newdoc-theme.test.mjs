// NewDoc carries the standard Office theme (word/theme/theme1.xml);
// a document opened from a file is not given one.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {parse, fontOf, colorOf}
  from '../../tools/moreapps/!Letters/ThemeRead';
import {THEME_XML, themeBytes}
  from '../../tools/moreapps/!Letters/ThemeDefault';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {emit} from './word-emit.mjs';

const DATE = new Date('2026-01-02T03:04:05Z');
const PART = 'word/theme/theme1.xml';
const THEME_REL = 'http://schemas.openxmlformats.org/officeDocument/' +
  '2006/relationships/theme';
const THEME_CT = 'application/vnd.openxmlformats-officedocument.' +
  'theme+xml';
const text = (b) => new TextDecoder().decode(b);

describe('NewDoc theme', () => {
  it('has the part, the relationship and the content type', () => {
    const d = newDoc({date: DATE});
    assert.ok(d.parts.has(PART));
    assert.equal(text(d.parts.get(PART)), THEME_XML);
    const rel = d.rels.find((x) => x.type === THEME_REL);
    assert.equal(rel.target, 'theme/theme1.xml');
    assert.ok(d.meta.contentTypes.overrides.some(
      ([n, t]) => n === '/' + PART && t === THEME_CT));
    assert.ok(d.meta.zipOrder.includes(PART));
  });

  it('styles.theme is what ThemeRead makes of the part', () => {
    const d = newDoc({date: DATE});
    assert.deepEqual(d.styles.theme, parse(themeBytes()));
    assert.deepEqual(d.styles.theme, parse(null));
    assert.equal(d.styles.theme.major, 'Calibri Light');
    assert.equal(colorOf(d.styles.theme, {themeColor: 'accent1'}),
      '4472C4');
  });

  it('writes the part and reads it back', async () => {
    const bytes = await writeDocx(newDoc({date: DATE}),
      {date: DATE});
    emit('newdoc-theme', bytes);
    const back = await readDocx(bytes);
    assert.ok(back.parts.has(PART));
    assert.equal(text(back.parts.get(PART)), THEME_XML);
    assert.deepEqual(back.styles.theme, newDoc({date: DATE}).styles.theme);
    const again = await readDocx(await writeDocx(back, {date: DATE}));
    assert.deepEqual(again.styles.theme, back.styles.theme);
    assert.equal(text(again.parts.get(PART)), THEME_XML);
  });

  it('the body font still resolves to Calibri 11 pt', () => {
    const d = newDoc({date: DATE});
    const dd = d.styles.docDefaults.rPr;
    assert.equal(dd.rFonts.ascii, 'Calibri');
    assert.equal(dd.sz, 22);
    assert.equal(fontOf(d.styles.theme, {asciiTheme: 'minorHAnsi'}),
      'Calibri');
  });

  it('a document opened without a theme has none', async () => {
    const bytes = await buildDocx({
      'word/document.xml': documentXml(p(r('x'))),
      'word/styles.xml': stylesXml(),
    });
    const d = await readDocx(bytes);
    assert.equal(d.parts.has(PART), false);
    assert.equal(d.styles.theme, undefined);
    const back = await readDocx(await writeDocx(d, {date: DATE}));
    assert.equal(back.parts.has(PART), false);
  });
});
