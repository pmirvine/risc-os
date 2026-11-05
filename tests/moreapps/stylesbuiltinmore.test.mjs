// Word's quick styles (Subtitle, Quote, Emphasis...) and the Word
// 2013+ look of Heading 1-6 and Title, as built-ins: the pinned
// definitions, adding one (and its linked half) on first use, the
// gallery, protection, and that styles a document has are kept.
// The values follow Word-made files of the Office 2013-2022 theme
// (stylesbuiltin-corpus.test.mjs compares them with the corpus).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {builtinStyle, galleryIds, isBuiltin, isBuiltinStyle,
  ensureBuiltins} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {moreIds, moreStyle}
  from '../../tools/moreapps/!Letters/StylesBuiltinMore';
import {ensureBuiltin, deleteStyle, renameStyle}
  from '../../tools/moreapps/!Letters/StyleCmd';
import {newStyleTable} from '../../tools/moreapps/!Letters/Styles';
import * as SL from '../../tools/moreapps/!Letters/StyleList';
import * as SA from '../../tools/moreapps/!Letters/StyleApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {resolver, charOf, paraOf}
  from '../../tools/moreapps/!Letters/FormatEff';
import {paraNumPr} from '../../tools/moreapps/!Letters/Styles';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {mk, P, SEL, C} from './edit-docs.mjs';
import {emit} from './word-emit.mjs';

const DATE = new Date(Date.UTC(2026, 10, 4, 12));
const xml = (n) => serialize(n);

/** The key fields of a style, its raw children as XML text. */
function pin(s) {
  const props = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) {
      out[k] = k === 'extra' ? v.map(xml) : v;
    }
    return out;
  };
  const o = {id: s.id, name: s.name, type: s.type};
  for (const k of ['basedOn', 'next', 'link', 'uiPriority', 'qFormat',
    'unhideWhenUsed', 'semiHidden', 'custom', 'isDefault']) {
    if (s[k] !== undefined) o[k] = s[k];
  }
  o.pPr = props(s.pPr);
  o.rPr = props(s.rPr);
  o.extra = (s.extra || []).map(xml);
  return o;
}

const MAJOR = '<w:rFonts w:asciiTheme="majorHAnsi" ' +
  'w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" ' +
  'w:cstheme="majorBidi"/>';
const color = (val, theme, k, v) => '<w:color w:val="' + val +
  '" w:themeColor="' + theme + '"' + (k ? ' w:' + k + '="' + v + '"'
  : '') + '/>';
const A1 = color('4472C4', 'accent1');
const A1BF = color('2F5496', 'accent1', 'themeShade', 'BF');
const A17F = color('1F3763', 'accent1', 'themeShade', '7F');
const T1BF = color('404040', 'text1', 'themeTint', 'BF');
const T1A5 = color('5A5A5A', 'text1', 'themeTint', 'A5');
const SP = (n) => '<w:spacing w:val="' + n + '"/>';
const P0 = {extra: []};
const para = (id, name, o) => ({id, name, type: 'paragraph',
  basedOn: 'Normal', next: 'Normal', ...o, extra: []});
const char = (id, name, o) => ({id, name, type: 'character',
  basedOn: 'DefaultParagraphFont', ...o, pPr: P0, extra: []});
const mate = (id, name, link, ui, rPr) => char(id, name, {link,
  uiPriority: ui, custom: true, rPr});

const SUB_R = {sz: 22, szCs: 22, extra: [
  '<w:rFonts w:eastAsiaTheme="minorEastAsia"/>', T1A5, SP(15)]};
const QUOTE_R = {i: true, extra: ['<w:iCs/>', T1BF]};
const IQ_R = {i: true, extra: ['<w:iCs/>', A1]};
const BORDER = (side) => '<w:' + side + ' w:val="single" w:sz="4" ' +
  'w:space="10" w:color="4472C4" w:themeColor="accent1"/>';

const WANT = {
  Subtitle: para('Subtitle', 'Subtitle', {link: 'SubtitleChar',
    uiPriority: 11, qFormat: true,
    pPr: {numPr: {ilvl: 1}, extra: []}, rPr: SUB_R}),
  SubtitleChar: mate('SubtitleChar', 'Subtitle Char', 'Subtitle', 11,
    SUB_R),
  Quote: para('Quote', 'Quote', {link: 'QuoteChar', uiPriority: 29,
    qFormat: true, pPr: {jc: 'center', spacing: {before: 200},
      ind: {left: 864, right: 864}, extra: []}, rPr: QUOTE_R}),
  QuoteChar: mate('QuoteChar', 'Quote Char', 'Quote', 29, QUOTE_R),
  IntenseQuote: para('IntenseQuote', 'Intense Quote', {
    link: 'IntenseQuoteChar', uiPriority: 30, qFormat: true,
    pPr: {jc: 'center', spacing: {before: 360, after: 360},
      ind: {left: 864, right: 864},
      extra: ['<w:pBdr>' + BORDER('top') + BORDER('bottom') +
        '</w:pBdr>']}, rPr: IQ_R}),
  IntenseQuoteChar: mate('IntenseQuoteChar', 'Intense Quote Char',
    'IntenseQuote', 30, IQ_R),
  Emphasis: char('Emphasis', 'Emphasis', {uiPriority: 20,
    qFormat: true, rPr: {i: true, extra: ['<w:iCs/>']}}),
  Strong: char('Strong', 'Strong', {uiPriority: 22, qFormat: true,
    rPr: {b: true, extra: ['<w:bCs/>']}}),
  SubtleEmphasis: char('SubtleEmphasis', 'Subtle Emphasis', {
    uiPriority: 19, qFormat: true,
    rPr: {i: true, extra: ['<w:iCs/>', T1BF]}}),
  IntenseEmphasis: char('IntenseEmphasis', 'Intense Emphasis', {
    uiPriority: 21, qFormat: true,
    rPr: {i: true, extra: ['<w:iCs/>', A1]}}),
  SubtleReference: char('SubtleReference', 'Subtle Reference', {
    uiPriority: 31, qFormat: true,
    rPr: {extra: ['<w:smallCaps/>', T1A5]}}),
  IntenseReference: char('IntenseReference', 'Intense Reference', {
    uiPriority: 32, qFormat: true,
    rPr: {b: true, extra: ['<w:bCs/>', '<w:smallCaps/>', A1,
      SP(5)]}}),
  BookTitle: char('BookTitle', 'Book Title', {uiPriority: 33,
    qFormat: true, rPr: {b: true, i: true,
      extra: ['<w:bCs/>', '<w:iCs/>', SP(5)]}}),
  NoSpacing: {id: 'NoSpacing', name: 'No Spacing', type: 'paragraph',
    uiPriority: 1, qFormat: true,
    pPr: {spacing: {after: 0, line: 240, lineRule: 'auto'},
      extra: []}, rPr: P0, extra: []},
  BodyText: {id: 'BodyText', name: 'Body Text', type: 'paragraph',
    basedOn: 'Normal', link: 'BodyTextChar', uiPriority: 99,
    unhideWhenUsed: true, pPr: {spacing: {after: 120}, extra: []},
    rPr: P0, extra: []},
  BodyTextChar: mate('BodyTextChar', 'Body Text Char', 'BodyText', 99,
    P0),
};

const HEAD = (n, sz, before, col, more = {}) => para('Heading' + n,
  'heading ' + n, {uiPriority: 9, qFormat: true,
    ...(n > 1 ? {unhideWhenUsed: true} : {}),
    pPr: {keepNext: true, keepLines: true, outlineLvl: n - 1,
      spacing: {before, after: 0}, extra: []},
    rPr: {...(sz ? {sz, szCs: sz} : {}), ...more,
      extra: [MAJOR, ...(more.i ? ['<w:iCs/>'] : []), col]}});
const WANT_LOOK = {
  Heading1: HEAD(1, 32, 240, A1BF),
  Heading2: HEAD(2, 26, 40, A1BF),
  Heading3: HEAD(3, 24, 40, A17F),
  Heading4: HEAD(4, 0, 40, A1BF, {i: true}),
  Heading5: HEAD(5, 0, 40, A1BF),
  Heading6: HEAD(6, 0, 40, A17F),
  Title: para('Title', 'Title', {uiPriority: 10, qFormat: true,
    pPr: {spacing: {after: 0, line: 240, lineRule: 'auto'},
      contextualSpacing: true, extra: []},
    rPr: {sz: 56, szCs: 56, extra: [MAJOR, SP(-10),
      '<w:kern w:val="28"/>']}}),
};

describe('StylesBuiltinMore: pinned definitions', () => {
  it('moreIds lists every quick style and linked half', () => {
    assert.deepEqual([...moreIds].sort(), Object.keys(WANT).sort());
  });
  for (const id of Object.keys(WANT)) {
    it(id + ' is Word\'s definition', () => {
      assert.deepEqual(pin(moreStyle(id)), WANT[id]);
      assert.deepEqual(pin(builtinStyle(id)), WANT[id]);
    });
  }
  for (const id of Object.keys(WANT_LOOK)) {
    it(id + ' has the Word 2013+ look', () => {
      assert.deepEqual(pin(builtinStyle(id)), WANT_LOOK[id]);
    });
  }
  it('each call gives a fresh copy', () => {
    const a = builtinStyle('Quote');
    a.rPr.extra.length = 0;
    assert.equal(builtinStyle('Quote').rPr.extra.length, 2);
  });
  it('Heading 7-9 keep their look (not part of the gallery)', () => {
    const h = builtinStyle('Heading7');
    assert.equal(h.rPr.b, true);
    assert.equal(h.rPr.sz, 22);
    assert.equal(h.pPr.outlineLvl, 6);
  });
  it('unknown ids give null', () => {
    assert.equal(moreStyle('Nope'), null);
    assert.equal(moreStyle(undefined), null);
    assert.equal(moreStyle('__proto__'), null);
  });
});

describe('quick styles: gallery', () => {
  const ORDER = ['Normal', 'NoSpacing', 'Heading1', 'Heading2',
    'Heading3', 'Heading4', 'Heading5', 'Heading6', 'Title',
    'Subtitle', 'SubtleEmphasis', 'Emphasis', 'IntenseEmphasis',
    'Strong', 'Quote', 'IntenseQuote', 'SubtleReference',
    'IntenseReference', 'BookTitle', 'ListParagraph'];
  it('galleryIds is Word\'s quick-style set in Word\'s order', () => {
    assert.deepEqual(galleryIds(), ORDER);
  });
  it('a new document lists them in that order, the new ones latent',
    () => {
      const d = mk(['x']);
      const g = SL.gallery(d.doc);
      assert.deepEqual(g.map((e) => e.id), ORDER);
      const latent = g.filter((e) => e.latent).map((e) => e.id);
      assert.deepEqual(latent, ORDER.filter((id) =>
        !d.doc.styles.styles.has(id)));
      assert.deepEqual(g.slice(0, 3).map((e) => e.name),
        ['Normal', 'No Spacing', 'Heading 1']);
      assert.equal(g.find((e) => e.id === 'Quote').linked, true);
      assert.equal(g.find((e) => e.id === 'Strong').type,
        'character');
    });
  it('Body Text is not in the gallery but in the full list', () => {
    const d = mk(['x']);
    assert.ok(!SL.gallery(d.doc).some((e) => e.id === 'BodyText'));
    assert.ok(!galleryIds().includes('BodyText'));
  });
  it('the previews show the new look', () => {
    const d = mk(['x']);
    const g = SL.gallery(d.doc);
    const e = (id) => g.find((x) => x.id === id).preview;
    assert.equal(e('Quote').italic, true);
    assert.equal(e('Strong').bold, true);
    assert.equal(e('Heading1').sizePt, 16);
    assert.equal(e('Heading1').bold, false);
    assert.equal(e('IntenseQuote').color, '4472C4');
    assert.equal(e('Title').sizePt, 28);
  });
});

describe('quick styles: added on first use', () => {
  it('Quote and Quote Char come in ONE undo step', () => {
    const d = mk(['abcd', 'efgh']);
    const before = d.doc.styles;
    assert.equal(before.styles.has('Quote'), false);
    SA.applyStyle(d, new Typing(d), C(d, 0, 1), 'Quote');
    assert.equal(P(d, 0).pStyle, 'Quote');
    const s = d.doc.styles.styles;
    assert.deepEqual(pin(s.get('Quote')), WANT.Quote);
    assert.deepEqual(pin(s.get('QuoteChar')), WANT.QuoteChar);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(d.doc.styles.styles.has('Quote'), false);
    assert.equal(d.doc.styles.styles.has('QuoteChar'), false);
    assert.equal(d.doc.styles.styles.size, before.styles.size);
    d.redo();
    assert.ok(d.doc.styles.styles.has('QuoteChar'));
  });
  for (const [id, half] of [['Subtitle', 'SubtitleChar'],
    ['IntenseQuote', 'IntenseQuoteChar'],
    ['BodyText', 'BodyTextChar']]) {
    it(id + ' brings ' + half, () => {
      const t = ensureBuiltin(mk(['a']).doc.styles, id);
      assert.equal(t.styles.get(id).link, half);
      assert.equal(t.styles.get(half).link, id);
    });
  }
  it('a character style on a selection, one undo step', () => {
    const d = mk(['abcd']);
    SA.applyStyle(d, new Typing(d), SEL(d, 0, 1, 0, 3), 'Strong');
    assert.ok(d.doc.styles.styles.has('Strong'));
    assert.ok(P(d, 0).runs.some((r) => r.rStyle === 'Strong'));
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(d.doc.styles.styles.has('Strong'), false);
  });
  it('No Spacing has no Based on and adds nothing else', () => {
    const t0 = mk(['a']).doc.styles;
    const t = ensureBuiltin(t0, 'NoSpacing');
    assert.equal(t.styles.size, t0.styles.size + 1);
  });
  it('a character style without Default Paragraph Font brings it',
    () => {
      const t0 = mk(['a']).doc.styles;
      const m = new Map(t0.styles);
      m.delete('DefaultParagraphFont');
      const t = ensureBuiltin({...t0, styles: m,
        defaults: {...t0.defaults, character: null}}, 'Emphasis');
      assert.ok(t.styles.has('DefaultParagraphFont'));
      assert.equal(t.defaults.character, 'DefaultParagraphFont');
    });
  it('Subtitle\'s level (ilvl 1, no list) gives no numbering', () => {
    const d = mk(['a']);
    SA.applyStyle(d, null, C(d, 0, 0), 'Subtitle');
    assert.equal(paraNumPr(d.doc.styles, P(d, 0)), null);
  });
});

describe('quick styles: a document\'s own styles are kept', () => {
  const custom = (id, name, type = 'paragraph') => ({id, type, name,
    pPr: {extra: []}, rPr: {u: 'double', extra: []}, extra: [],
    raw: null});
  it('a same-named style under another id blocks the add', () => {
    for (const name of ['Quote', 'quote', 'QUOTE']) {
      const d = mk(['a']);
      const m = new Map(d.doc.styles.styles);
      m.set('Zitat', custom('Zitat', name));
      d.doc.styles = {...d.doc.styles, styles: m};
      assert.equal(ensureBuiltin(d.doc.styles, 'Quote'), null);
      const g = SL.gallery(d.doc);
      assert.equal(g.filter((e) => e.id === 'Quote').length, 0);
      assert.equal(g.filter((e) => e.id === 'Zitat').length, 0);
    }
  });
  it('a same-named Char half under another id is not duplicated',
    () => {
      const d = mk(['a']);
      const m = new Map(d.doc.styles.styles);
      m.set('Zc', custom('Zc', 'quote char', 'character'));
      d.doc.styles = {...d.doc.styles, styles: m};
      const t = ensureBuiltin(d.doc.styles, 'Quote');
      assert.equal(t.styles.has('QuoteChar'), false);
      assert.deepEqual(t.styles.get('Zc'), m.get('Zc'));
      assert.ok(!('link' in t.styles.get('Quote')));
    });
  it('a one-way Char style stays listed and applyable',
    () => {
      for (const id of ['QuoteChar', 'Zc']) {
        const d = mk(['a']);
        const m = new Map(d.doc.styles.styles);
        m.set(id, {...custom(id, 'Quote Char', 'character'),
          qFormat: true});
        d.doc.styles = {...d.doc.styles, styles: m};
        SA.applyStyle(d, null, C(d, 0, 0), 'Quote');
        const t = d.doc.styles;
        assert.ok(!('link' in t.styles.get('Quote')));
        assert.ok(SL.gallery(d.doc).some((e) => e.id === id));
        assert.ok(SL.all(d.doc).some((e) => e.id === id));
        assert.ok(SA.applyStyle(d, new Typing(d), SEL(d, 0, 0, 0, 1),
          id) !== false);
      }
    });
  it('a Char half that links back is still paired and hidden', () => {
    const d = mk(['a']);
    const m = new Map(d.doc.styles.styles);
    m.set('QuoteChar', {...custom('QuoteChar', 'Quote Char',
      'character'), link: 'Quote'});
    d.doc.styles = {...d.doc.styles, styles: m};
    SA.applyStyle(d, null, C(d, 0, 0), 'Quote');
    assert.equal(d.doc.styles.styles.get('Quote').link, 'QuoteChar');
    assert.ok(!SL.gallery(d.doc).some((e) => e.id === 'QuoteChar'));
    assert.ok(!SL.all(d.doc).some((e) => e.id === 'QuoteChar'));
  });
  it('an existing Heading 1 is never changed', () => {
    const d = mk(['a']);
    const old = {id: 'Heading1', type: 'paragraph', name: 'heading 1',
      basedOn: 'Normal', pPr: {outlineLvl: 0, extra: []},
      rPr: {b: true, sz: 40, extra: []}, extra: [], raw: null};
    const m = new Map(d.doc.styles.styles);
    m.set('Heading1', old);
    m.delete('Title');
    d.doc.styles = {...d.doc.styles, styles: m};
    assert.equal(ensureBuiltin(d.doc.styles, 'Heading1'), null);
    ensureBuiltins(d.doc.styles);
    assert.equal(d.doc.styles.styles.get('Heading1'), old);
    // the missing Title is added with the new look
    assert.deepEqual(pin(d.doc.styles.styles.get('Title')),
      WANT_LOOK.Title);
    SA.applyStyle(d, null, C(d, 0, 0), 'Heading1');
    assert.equal(d.doc.styles.styles.get('Heading1'), old);
  });
  it('a Word file\'s Heading 1 and Quote stay as read', async () => {
    const d = mk(['a', 'b']);
    SA.applyStyle(d, null, C(d, 0, 0), 'Quote');
    const m = new Map(d.doc.styles.styles);
    const h = structuredClone(m.get('Heading1'));
    h.rPr = {b: true, extra: []};
    h.raw = null;
    m.set('Heading1', h);
    const q = structuredClone(m.get('Quote'));
    q.pPr = {jc: 'right', extra: []};
    m.set('Quote', q);
    d.doc.styles = {...d.doc.styles, styles: m};
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    const b = back.styles.styles;
    assert.deepEqual(b.get('Heading1').rPr, {b: true, extra: []});
    assert.equal(b.get('Quote').pPr.jc, 'right');
    assert.equal(ensureBuiltin(back.styles, 'Quote'), null);
    assert.equal(ensureBuiltin(back.styles, 'Heading1'), null);
  });
  it('a new document gets the new Heading and Title look', () => {
    const d = mk(['a']);
    for (const id of Object.keys(WANT_LOOK)) {
      const s = d.doc.styles.styles.get(id);
      const want = structuredClone(WANT_LOOK[id]);
      assert.deepEqual(pin(s), want, id);
    }
  });
});

describe('quick styles: built-in protection', () => {
  const all = [...Object.keys(WANT)];
  it('every one is a built-in', () => {
    for (const id of all) assert.equal(isBuiltin(id), true, id);
  });
  it('the main names are built-in names under any id', () => {
    for (const id of all.filter((x) => !/Char$/.test(x))) {
      const name = WANT[id].name;
      assert.equal(isBuiltinStyle({id: 'X1', name}), true, name);
      assert.equal(isBuiltinStyle({id: 'X1',
        name: name.toLowerCase()}), true, name);
    }
  });
  it('none can be deleted or renamed once in a document', () => {
    let t = mk(['a']).doc.styles;
    for (const id of all) t = ensureBuiltin(t, id) || t;
    for (const id of all) {
      assert.ok(t.styles.has(id), id);
      assert.equal(deleteStyle(t, id), null, 'delete ' + id);
      assert.equal(renameStyle(t, id, 'Mine ' + id), null,
        'rename ' + id);
    }
  });
});

describe('quick styles: in a file', () => {
  /** A new document with every quick style applied. */
  function every() {
    const lines = ['Title text', 'Subtitle text', 'Heading 1 text',
      'Heading 2 text', 'Heading 3 text', 'Heading 4 text',
      'Heading 5 text', 'Heading 6 text', 'Quote text',
      'Intense Quote text', 'No Spacing text', 'Body Text text',
      'Runs: Emphasis Strong Subtle Emphasis Intense Emphasis ' +
      'Subtle Reference Intense Reference Book Title'];
    const d = mk(lines);
    const paras = ['Title', 'Subtitle', 'Heading1', 'Heading2',
      'Heading3', 'Heading4', 'Heading5', 'Heading6', 'Quote',
      'IntenseQuote', 'NoSpacing', 'BodyText'];
    paras.forEach((id, k) => SA.applyStyle(d, null, C(d, k, 0), id));
    const k = lines.length - 1;
    const text = P(d, k).text;
    for (const name of ['Emphasis', 'Strong', 'Subtle Emphasis',
      'Intense Emphasis', 'Subtle Reference', 'Intense Reference',
      'Book Title']) {
      const at = text.indexOf(' ' + name) + 1;
      SA.applyStyle(d, null, SEL(d, k, at, k, at + name.length),
        name.replace(/ /g, ''));
    }
    return d;
  }
  it('writes, reads back equal and opens in Word', async () => {
    const d = every();
    const bytes = await writeDocx(d.doc, {date: DATE});
    emit('quickstyles-all', bytes);
    const back = await readDocx(bytes);
    for (const id of Object.keys(WANT)) {
      assert.deepEqual(pin(back.styles.styles.get(id)), WANT[id], id);
    }
    for (const id of Object.keys(WANT_LOOK)) {
      assert.deepEqual(pin(back.styles.styles.get(id)),
        WANT_LOOK[id], id);
    }
    const again = await writeDocx(back, {date: DATE});
    assert.deepEqual(again, bytes);
  });
  it('the theme colours and fonts resolve on screen', () => {
    const d = every();
    const res = resolver(d.doc);
    const runOf = (k, i = 0) => charOf(res.run(P(d, k),
      P(d, k).runs[i].rPr, P(d, k).runs[i].rStyle), P(d, k), res);
    assert.equal(runOf(8).italic, true);
    assert.equal(runOf(8).color, '404040');
    assert.equal(runOf(9).color, '4472C4');
    assert.equal(runOf(2).size, 16);
    assert.equal(runOf(2).color, '2F5496');
    const q = paraOf(res.para(P(d, 8)), P(d, 8), res);
    assert.equal(q.align, 'center');
    assert.equal(q.indentLeft, 864);
    const k = P(d, 12).runs.findIndex((r) => r.rStyle === 'Strong');
    assert.equal(runOf(12, k).bold, true);
  });
});
