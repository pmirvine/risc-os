// Borders, shading, symbols and change case round trip: documents
// changed with !Word's A5 commands (./FormatApply 'borders',
// 'paraShade', 'charShade', 'changeCase', 'caseCycle', the ids the
// Borders and shading box and the Format menu run; the nbsp,
// nbHyphen and softHyphen commands of Insert > Special character;
// symbols typed as text), mixed with typing, Enter, deleting,
// paragraph styles and bursts of undo and redo; then written and read
// back.
// The checks are those of roundtrip-lib.mjs: the model read back
// equals the changed model; every block passes ModelCheck; the
// package linter and xmllint/wml.xsd (when available, for one seed)
// add no error; undo of everything gives back the opened model and
// its bytes. Besides: a command that the rules refuse (a bad border
// name or width, a paragraph whose own w:pBdr or w:shd is kept raw,
// a run whose own w:shd is kept raw) throws RangeError and changes
// nothing (no undo step); a side set reads back as the very side; and
// a raw themed pBdr / shd of a paragraph is still in the file after
// everything else was done.
//
// Documents: the reader fixtures, the list fixtures, plain documents,
// boxes (also with between), shading in styles, a raw themed pBdr and
// shd, Strict start / end sides, run shading, a character style, and
// the corpus sample, gated as the other round trips (one file in ten
// by a hash of the name; WORD_EDIT_CORPUS=1 for every file, which
// needs NODE_OPTIONS=--max-old-space-size=4096). 40 seeded commands
// per file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS, write} from './roundtrip-lib.mjs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {rng} from './word-docs.mjs';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as S from '../../tools/moreapps/!Word/Selection';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {MODES} from '../../tools/moreapps/!Word/ChangeCase';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {entryText} from './docx-compare.mjs';

export const STEPS = 40;
const BORDERS_MS = 3000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const SIDES = ['top', 'left', 'bottom', 'right', 'between', 'bar'];
const STYLE_NAMES = [...new Set(['single', 'double', 'dotted', 'dashed',
  'thick', 'wave', 'triple', 'nil', 'none', 'dashSmallGap', 'outset',
  'threeDEmboss'])];
const SHD_NAMES = ['clear', 'solid', 'pct10', 'pct50', 'diagStripe',
  'horzCross', 'nil'];
const COLOURS = ['auto', 'FF0000', '00FF00', '0000FF', 'ffff00',
  'D9D9D9', '000000'];

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

/** A random caret or selection (often over several paragraphs). */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.4) return S.caret(a);
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * (rd() < 0.1 ? bs.length : 4))));
  return S.select(a, posIn(rd, bs[k2]));
}

/** A width in eighths of a point: usual, at the limits, hostile. */
const sz = (rd) => pick(rd, [2, 4, 6, 8, 12, 18, 24, 0, 1, 96, 97, -1,
  1000, 4.5, NaN, '4', null]);
const space = (rd) => pick(rd, [0, 1, 4, 24, 31, 32, -1, 1e9, NaN, '1']);

/** A side: usually good, sometimes hostile. */
function sideArg(rd) {
  const x = rd();
  if (x < 0.2) return null;
  const s = {val: x < 0.9 ? pick(rd, STYLE_NAMES.slice(0, 5)) :
    pick(rd, ['madeUp', '', 7, null, 'pct10'])};
  if (rd() < 0.8) s.sz = rd() < 0.85 ? pick(rd, [2, 4, 8, 12, 24, 48]) :
    sz(rd);
  if (rd() < 0.5) s.space = rd() < 0.85 ? pick(rd, [0, 1, 4, 12]) :
    space(rd);
  if (rd() < 0.8) s.color = rd() < 0.9 ? pick(rd, COLOURS) :
    pick(rd, ['red', '#fff', 'GGGGGG', '12345', 5, null]);
  if (rd() < 0.1) s.shadow = pick(rd, [true, false, 'yes']);
  return s;
}

const shdArg = (rd) => {
  const x = rd();
  if (x < 0.25) return null;
  return {val: x < 0.95 ? pick(rd, SHD_NAMES) : pick(rd, ['wavy', 3, '']),
    color: pick(rd, ['auto', 'FF0000', '000000']),
    fill: rd() < 0.9 ? pick(rd, COLOURS) : pick(rd, ['red', 5, '12'])};
};

/** The id and argument of one random A5 format command. */
function formatArg(rd) {
  const x = rd();
  if (x < 0.25) {
    // a whole box, as Format > Borders and shading > Box makes it
    const s = sideArg(rd) || {val: 'single', sz: 4};
    const box = {};
    for (const k of ['top', 'left', 'bottom', 'right']) box[k] = {...s};
    if (rd() < 0.4) box.between = {...s};
    return ['borders', {pBdr: box}, 'border box'];
  }
  if (x < 0.5) {
    const pBdr = {};
    for (let n = 1 + Math.floor(rd() * 3); n-- > 0;)
      pBdr[pick(rd, SIDES)] = sideArg(rd);
    const arg = {pBdr};
    if (rd() < 0.3) arg.shd = shdArg(rd);
    return ['borders', arg, 'border sides'];
  }
  if (x < 0.58) {
    const pBdr = {};
    for (const k of SIDES) pBdr[k] = null;
    return ['borders', {pBdr}, 'border none'];
  }
  if (x < 0.72) return ['paraShade', shdArg(rd), 'paragraph shading'];
  if (x < 0.9) return ['charShade', shdArg(rd), 'text shading'];
  if (x < 0.95) return ['borders', pick(rd, [{bogus: 1}, null, [], 'x',
    {pBdr: 5}, {pBdr: {bogus: {val: 'single'}}}]), 'border bad'];
  return ['charShade', undefined, 'border bad'];
}

export const KINDS = ['border box', 'border sides', 'border none',
  'paragraph shading', 'text shading', 'change case', 'case cycle',
  'symbol', 'special', 'enter', 'delete range', 'style', 'undo/redo'];
const CHANGES = ['border box', 'border sides', 'paragraph shading',
  'text shading', 'change case', 'case cycle', 'symbol', 'special',
  'enter'];

const SYMBOLS = ['©', '€', 'é', '→', '≠',
  'Ω', '—', '°', '☺', 'ß', 'σ', 'İ'];

/** One random command; [kind, selection after]. */
function command(rd, d, t, sel, every) {
  const x = rd();
  if (x < 0.1) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  const depth = d.undoDepth;
  const before = every ? structuredClone(d.doc.sections) : null;
  let kind, res;
  let refused = false;
  const attempt = (fn) => {
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      refused = true;
      return null;
    }
  };
  if (x < 0.5) {
    const [id, arg, k] = formatArg(rd);
    kind = k;
    res = attempt(() => FA.apply(id, d, t, sel, arg));
  } else if (x < 0.6) {
    kind = 'change case';
    res = attempt(() => FA.apply('changeCase', d, t, sel,
      pick(rd, [...MODES.filter((m) => m !== 'cycle'), 'bogus'])));
  } else if (x < 0.66) {
    kind = 'case cycle';
    res = attempt(() => FA.apply('caseCycle', d, t, sel));
  } else if (x < 0.76) {
    kind = 'symbol';
    res = {sel: t.type(sel, pick(rd, SYMBOLS))};
  } else if (x < 0.82) {
    kind = 'special';
    res = attempt(() => run(pick(rd, ['nbsp', 'nbHyphen', 'softHyphen']),
      d, t, sel));
  } else if (x < 0.88) {
    kind = 'enter';
    res = run('enter', d, t, sel);
  } else if (x < 0.94) {
    kind = 'delete range';
    const to = randSel(rd, d);
    res = run('delete', d, t, to ? S.select(sel.anchor, to.head) : sel);
  } else {
    kind = 'style';
    res = attempt(() => FA.apply('style', d, t, sel, pick(rd,
      ['Heading1', 'Normal', 'Boxed', 'Title'])));
  }
  if (refused) {
    assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
    if (before) assert.deepEqual(d.doc.sections, before,
      kind + ' refused: unchanged');
    return [kind + ' refused', sel];
  }
  if (res === undefined || res === null) return [kind + ' none', sel];
  return [kind, res.sel || res || sel];
}

/** STEPS commands on d. */
export function bordersAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > BORDERS_MS) break;
    if (!sel || rd() < 0.6) sel = randSel(rd, d);
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel] = command(rd, d, t, sel, every);
      if (every) for (const b of allBlocks(d)) checkBlock(b);
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
    if (d.undoDepth > depth) {
      counts[kind + ' changed'] = (counts[kind + ' changed'] || 0) + 1;
    }
  }
  for (const b of allBlocks(d)) checkBlock(b);
  return {steps: k, capped: k < STEPS, counts};
}

// ------------------------------------------------------------ documents

const side = (n, c, v = 'single', sz = 12) =>
  `<w:${n} w:val="${v}" w:sz="${sz}" w:space="4" w:color="${c}"/>`;
const box = (c, between, v) => '<w:pBdr>' + side('top', c, v) +
  side('left', c, v) + side('bottom', c, v) + side('right', c, v) +
  (between ? side('between', c, v) : '') + '</w:pBdr>';
const SHD = (fill, v = 'clear') =>
  `<w:shd w:val="${v}" w:color="auto" w:fill="${fill}"/>`;
const THEMED = '<w:pBdr><w:top w:val="single" w:sz="12" w:color="00FF00"' +
  ' w:themeColor="accent6"/><w:left w:val="double"/></w:pBdr>' +
  '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00" ' +
  'w:themeFill="accent4"/>';
const STRICT = '<w:pBdr><w:start w:val="single" w:sz="8" w:space="4"/>' +
  '<w:end w:val="single" w:sz="8" w:space="4"/></w:pBdr>';
const doc = (body, parts = {}) => () => buildDocx(
  {'word/document.xml': documentXml(body), ...parts});
const STYLES = stylesXml(
  '<w:style w:type="paragraph" w:styleId="Boxed"><w:name w:val="Boxed"/>' +
  '<w:basedOn w:val="Normal"/><w:pPr>' + box('FF0000', true) +
  SHD('FFFF00') + '</w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name ' +
  'w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr>' +
  side('bottom', '0000FF', 'double', 6) + '</w:pBdr></w:pPr></w:style>' +
  '<w:style w:type="character" w:styleId="Shaded"><w:name ' +
  'w:val="Shaded"/><w:rPr>' + SHD('D9D9D9') + '</w:rPr></w:style>');

const TEXTS = ['hello world', 'Straße STRASSE', 'it’s a o’clock',
  'one. two! three? four', 'ΑΣ ΣΑΣ', 'i̇ İstanbul', 'ﬁne ﬂow',
  '3rd 1st well-known', '', '😀 x'];
const MORE = [
  ['paragraphs for case and symbols', doc(TEXTS.map((s) => p(r(s)))
    .join(''))],
  ['a box, a group with between, a lone shaded paragraph', doc(
    p(r('Boxed'), box('FF0000')) + p(r('Group one'), box('0000FF', true)) +
    p(r('Group two'), box('0000FF', true)) + p(r('Plain')) +
    p(r('Shaded'), SHD('FFFF00')) + p(r('Runs ') +
      r('shaded', SHD('00FFFF')) + r(' both', SHD('00FFFF') +
      '<w:highlight w:val="green"/>')))],
  ['borders and shading in styles', doc(
    p(r('In a Boxed style'), '<w:pStyle w:val="Boxed"/>') +
    p(r('Heading'), '<w:pStyle w:val="Heading1"/>') +
    p(r('Boxed, own sides'), '<w:pStyle w:val="Boxed"/>' +
      '<w:pBdr><w:top w:val="nil"/></w:pBdr>') +
    p(r('Plain') + r('shaded run', '<w:rStyle w:val="Shaded"/>')),
  {'word/styles.xml': STYLES})],
  ['a raw themed pBdr and shd (kept raw)', doc(
    p(r('Themed'), THEMED) + p(r('Plain')) + p(r('Themed 2'), THEMED))],
  ['Strict start / end sides', doc(p(r('Strict'), STRICT) +
    p(r('Strict two'), STRICT) + p(r('Plain')))],
  ['a run with a raw themed shd', doc(p(r('a ') + r('themed',
    '<w:shd w:val="clear" w:color="auto" w:fill="FF0000" ' +
    'w:themeFill="accent2"/>') + r(' b')) + p(r('Plain')))],
  ['hostile existing values (madeUp names, sz 0 and 96)', doc(
    p(r('Odd'), '<w:pBdr>' + side('top', 'auto', 'madeUp', 0) +
      side('bottom', 'FF00FF', 'single', 96) + '</w:pBdr>' +
      SHD('00FF00', 'pct13')) + p(r('Odd 2'), box('000000', false,
      'nil')))],
  ['empty document', doc('')],
];

const {xsd, note: xsdNote} = schema();
const DOCS = [...FIXTURES, ...LIST_DOCS, ...MORE];

describe('borders round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          bordersAll, {xsd: k === 0 ? xsd : null, every: true});
        if (res.refused) continue;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# borders commands (generated): ' +
      JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
    }
    for (const kind of CHANGES) {
      assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
    }
    assert.ok(Object.keys(total).some((k) => k.endsWith(' refused')),
      'a refused command ran');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

// ------------------------------------------------------------ pinned

/** A session on bytes. */
async function open(bytes) {
  const {Document} = await import('../../tools/moreapps/!Word/Document');
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  return {d, t, p: (i) => allBlocks(d)[i],
    caret: (i, off = 0) => S.caret({id: allBlocks(d)[i].id, off}),
    all: (i) => S.select({id: allBlocks(d)[i].id, off: 0},
      {id: allBlocks(d)[i].id, off: allBlocks(d)[i].text.length})};
}
const docXml = async (d) => entryText(await write(d.doc),
  'word/document.xml');

describe('borders round trip: pinned cases', () => {
  it('a box set reads back as the very sides and shading', async () => {
    const s = await open(await buildDocx({'word/document.xml':
      documentXml(p(r('one')) + p(r('two')))}));
    const e = (v) => ({val: v, sz: 12, space: 4, color: 'FF0000'});
    FA.apply('borders', s.d, s.t, s.caret(0), {pBdr: {top: e('double'),
      left: e('single'), bottom: e('dotted'), right: e('dashed'),
      between: null}, shd: {val: 'clear', color: 'auto', fill: 'FFFF00'}});
    assert.equal(s.d.undoDepth, 1);
    const back = await readDocx(await write(s.d.doc));
    const b = allBlocks({doc: back})[0];
    assert.deepEqual(['top', 'left', 'bottom', 'right'].map((k) =>
      [k, b.pPr.pBdr[k].val, b.pPr.pBdr[k].sz, b.pPr.pBdr[k].space,
        b.pPr.pBdr[k].color]),
    [['top', 'double', 12, 4, 'FF0000'], ['left', 'single', 12, 4,
      'FF0000'], ['bottom', 'dotted', 12, 4, 'FF0000'], ['right',
      'dashed', 12, 4, 'FF0000']]);
    assert.equal(b.pPr.shd.fill, 'FFFF00');
    assert.equal(allBlocks({doc: back})[1].pPr.pBdr, undefined);
  });
  it('refusals change nothing; raw themed elements stay in the file',
    async () => {
      const s = await open(await buildDocx({'word/document.xml':
        documentXml(p(r('themed'), THEMED) + p(r('a ') + r('themed',
          '<w:shd w:val="clear" w:color="auto" w:fill="FF0000" ' +
          'w:themeFill="accent2"/>') + r(' b')) + p(r('plain')))}));
      const xml0 = await docXml(s.d);
      const edge = {val: 'single', sz: 4};
      const attempts = [
        ['borders', {pBdr: {top: edge}}, s.caret(0)],
        ['borders', {pBdr: {top: null}}, s.caret(0)],
        ['paraShade', {val: 'clear', fill: 'FF0000'}, s.caret(0)],
        ['paraShade', null, s.caret(0)],
        ['charShade', {val: 'clear', fill: '00FF00'},
          S.select({id: s.p(1).id, off: 0}, {id: s.p(1).id, off: 6})],
        ['borders', {pBdr: {top: {val: 'madeUp'}}}, s.caret(2)],
        ['borders', {pBdr: {top: {val: 'single', sz: 'x'}}}, s.caret(2)],
        ['borders', {bogus: 1}, s.caret(2)],
        ['paraShade', {val: 'wavy'}, s.caret(2)],
        ['charShade', {val: 'nope'}, s.all(2)],
        ['changeCase', 'bogus', s.all(2)]];
      for (const [id, arg, sel] of attempts) {
        assert.throws(() => FA.apply(id, s.d, s.t, sel, arg), RangeError,
          id + ' ' + JSON.stringify(arg));
        assert.equal(s.d.undoDepth, 0);
      }
      // everything else still works, the raw elements stay
      FA.apply('borders', s.d, s.t, s.caret(2), {pBdr: {top: edge}});
      FA.apply('changeCase', s.d, s.t, s.all(2), 'upper');
      const xml = await docXml(s.d);
      for (const frag of ['w:themeColor="accent6"',
        'w:themeFill="accent4"', 'w:themeFill="accent2"'])
        assert.ok(xml.includes(frag), frag + ' kept');
      assert.equal(xml0.split('w:themeColor="accent6"').length,
        xml.split('w:themeColor="accent6"').length);
    });
  it('case, symbols and hyphens read back; one undo step each',
    async () => {
      const s = await open(await buildDocx({'word/document.xml':
        documentXml(p(r('hello world')))}));
      FA.apply('changeCase', s.d, s.t, s.all(0), 'upper');
      assert.equal(s.p(0).text, 'HELLO WORLD');
      s.t.type(S.caret({id: s.p(0).id, off: 5}), '©');
      run('nbHyphen', s.d, s.t, S.caret({id: s.p(0).id, off: 0}));
      run('softHyphen', s.d, s.t, S.caret({id: s.p(0).id, off: 3}));
      const n = s.d.undoDepth;
      assert.ok(n >= 3, 'depth ' + n);
      const xml = await docXml(s.d);
      assert.ok(xml.includes('<w:noBreakHyphen/>'));
      assert.ok(xml.includes('<w:softHyphen/>'));
      const back = await readDocx(await write(s.d.doc));
      assert.equal(allBlocks({doc: back})[0].text, s.p(0).text);
      while (s.d.undo());
      assert.equal(s.p(0).text, 'hello world');
    });
});

const files = corpusFiles();

describe('borders round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} border / case / symbol commands in ${ALL ? 'every' :
    'one in ten'} corpus file round-trip; undo restores`, () =>
    corpusRun(files, bordersAll, xsd, xsdNote, 'borders-edited corpus'));
});
