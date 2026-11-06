// Automatic colour (the colour menu's Automatic: FormatApply 'color'
// 'auto') over a style with a colour of its own: a literal one, and a
// theme colour (Heading 1 and 2 in the Office theme; Title has none). The run
// keeps color 'auto' (Word writes w:color w:val="auto"), it is black
// on screen, the menu's query says 'auto' (Automatic ticked), and it
// is written and read back so. A run not touched keeps the style's.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import {query} from '../../tools/moreapps/!Letters/Format';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {colorOf} from '../../tools/moreapps/!Letters/ThemeRead';
import {addStyle} from '../../tools/moreapps/!Letters/Styles';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {mk, P, C, SEL, undoable} from './edit-docs.mjs';
import {write} from './roundtrip-lib.mjs';
import {emit} from './word-emit.mjs';

const T = (d) => new Typing(d);
const go = (d, id, sel, arg, pending) =>
  undoable(d, () => FA.apply(id, d, T(d), sel, arg, pending));
const whole = (d, k) => SEL(d, k, 0, k, P(d, k).text.length);
const fmt = (d, k, i = 0) => runFmt(d.doc.styles, P(d, k),
  P(d, k).runs[i]);
const H1 = (d) => colorOf(d.doc.styles.theme,
  {themeColor: 'accent1', themeShade: 'BF'});
const colourEls = (xml) => xml.match(/<w:color [^>]*\/>/g) || [];

function redStyle(d) {
  addStyle(d.doc.styles, {id: 'Red', type: 'paragraph', name: 'Red',
    pPr: {extra: []}, rPr: {color: 'FF0000', extra: []}, extra: [],
    raw: null});
}

describe('Automatic colour over a style colour', () => {
  it('Heading 1 (theme colour): the run stays automatic', () => {
    const d = mk([['Head', {pStyle: 'Heading1'}], 'body']);
    assert.equal(query(d.doc, whole(d, 0)).color, H1(d));
    go(d, 'color', whole(d, 0), 'auto');
    assert.equal(P(d, 0).runs[0].rPr.color, 'auto');
    assert.equal(query(d.doc, whole(d, 0)).color, 'auto');
    assert.equal(query(d.doc, whole(d, 0)).colorRef, null);
    assert.equal(fmt(d, 0).colour, '#000000');
    assert.equal(d.undoDepth, 1);
  });

  it('Heading 2 (theme colour) and a literal-colour style alike', () => {
    const d = mk([['Sub', {pStyle: 'Heading2'}], ['abc', {pStyle: 'Red'}]]);
    redStyle(d);
    for (const k of [0, 1]) {
      go(d, 'color', whole(d, k), 'auto');
      assert.equal(P(d, k).runs[0].rPr.color, 'auto', 'para ' + k);
      assert.equal(query(d.doc, whole(d, k)).color, 'auto');
      assert.equal(fmt(d, k).colour, '#000000');
    }
  });

  it('Title (no colour of its own): nothing to write', () => {
    const d = mk([['Big', {pStyle: 'Title'}]]);
    assert.equal(query(d.doc, whole(d, 0)).color, 'auto');
    go(d, 'color', whole(d, 0), 'auto');
    assert.equal(P(d, 0).runs[0].rPr.color, undefined);
    assert.equal(d.undoDepth, 0);
  });

  it('part of a heading: the rest keeps the style colour', () => {
    const d = mk([['Heading', {pStyle: 'Heading1'}]]);
    go(d, 'color', SEL(d, 0, 0, 0, 4), 'auto');
    const rs = P(d, 0).runs;
    assert.equal(rs.length, 2);
    assert.equal(rs[0].rPr.color, 'auto');
    assert.equal(rs[1].rPr.color, undefined);
    assert.equal(query(d.doc, SEL(d, 0, 4, 0, 7)).color, H1(d));
    assert.equal(fmt(d, 0, 1).colour, '#' + H1(d));
    assert.equal(query(d.doc, whole(d, 0)).color, null, 'mixed');
  });

  it('Automatic again is no new step; a colour then replaces it', () => {
    const d = mk([['Head', {pStyle: 'Heading1'}]]);
    go(d, 'color', whole(d, 0), 'auto');
    go(d, 'color', whole(d, 0), 'auto');
    assert.equal(d.undoDepth, 1);
    go(d, 'color', whole(d, 0), '123456');
    assert.equal(query(d.doc, whole(d, 0)).color, '123456');
  });

  it('a plain paragraph: Automatic still removes the colour', () => {
    const d = mk(['abc']);
    go(d, 'color', whole(d, 0), 'DD0000');
    go(d, 'color', whole(d, 0), 'auto');
    assert.equal(P(d, 0).runs[0].rPr.color, undefined);
    go(d, 'themeColor', whole(d, 0), {themeColor: 'accent2'});
    go(d, 'color', whole(d, 0), 'auto');
    assert.equal(P(d, 0).runs[0].rPr.color, undefined);
    assert.equal(P(d, 0).runs[0].rPr.extra.length, 0);
  });

  it('at a caret in a heading: typed text is automatic', () => {
    const d = mk([['Head', {pStyle: 'Heading1'}]]);
    const got = FA.apply('color', d, T(d), C(d, 0, 2), 'auto');
    assert.equal(query(d.doc, C(d, 0, 2), got.pending).color, 'auto');
  });

  it('written as w:color w:val="auto" and read back', async () => {
    const d = mk([['Head', {pStyle: 'Heading1'}],
      ['Kept', {pStyle: 'Heading1'}], ['abc', {pStyle: 'Red'}]]);
    redStyle(d);
    go(d, 'color', whole(d, 0), 'auto');
    go(d, 'color', whole(d, 2), 'auto');
    const bytes = await write(d.doc);
    emit('colour-auto-heading', bytes);
    const xml = new TextDecoder().decode(
      (await readZip(bytes)).get('word/document.xml'));
    const autos = colourEls(xml).filter((e) => /w:val="auto"/.test(e));
    assert.equal(autos.length, 2, xml);
    const back = await readDocx(bytes);
    const ps = back.sections[0].blocks;
    assert.equal(ps[0].runs[0].rPr.color, 'auto');
    assert.equal(ps[1].runs[0].rPr.color, undefined);
    assert.equal(ps[2].runs[0].rPr.color, 'auto');
    const b = new Document(back);
    assert.equal(query(back, whole(b, 0)).color, 'auto');
    assert.equal(query(back, whole(b, 1)).color, H1(d));
    assert.equal(runFmt(back.styles, ps[0], ps[0].runs[0]).colour,
      '#000000');
  });
});
