// Tab stops round trip: documents changed with !Word's tab stop
// commands, the ids the ruler and the Tabs dialog run (./FormatApply
// 'tabs': add, remove, move, set; 'tabsBox': {edits} and the default
// tab stop of settings.xml), mixed with typing (tabs included),
// Enter, deleting, paragraph styles and bursts of undo and redo; then
// written and read back.
// The checks are those of roundtrip-lib.mjs: the model read back
// equals the changed model; every block passes ModelCheck; the
// package linter and xmllint/wml.xsd (when available, for one seed)
// add no error; undo of everything gives back the opened model and
// its bytes (the settings part included). Besides: a command that
// the rules refuse (a paragraph whose w:tabs is kept raw, a bad
// position, a default tab outside 36..31680, a document with no
// settings part) throws RangeError and changes nothing (no undo
// step); a stop set reads back from the file as the resolved stop of
// the paragraph; and the settings part changes only in its
// w:defaultTabStop element.
//
// Documents: the reader fixtures, the list fixtures, plain documents,
// documents with tab stops in styles and docDefaults, Strict stops
// (start / end), a raw w:tabs (257 stops), a settings part with and
// without w:defaultTabStop, and the corpus sample, gated as the other
// round trips (one file in ten by a hash of the name;
// WORD_EDIT_CORPUS=1 for every file, which needs
// NODE_OPTIONS=--max-old-space-size=4096). 40 seeded commands per file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, settingsXml, p, r} from './build-docx.mjs';
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
import {resolveTabs, defaultStop} from '../../tools/moreapps/!Word/TabStops';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';

export const STEPS = 40;
const TABS_MS = 3000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const VALS = ['left', 'center', 'right', 'decimal', 'bar'];
const LEADERS = [undefined, 'none', 'dot', 'hyphen', 'underscore',
  'heavy', 'middleDot'];

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
  if (rd() < 0.5) return S.caret(a);
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * (rd() < 0.1 ? bs.length : 4))));
  return S.select(a, posIn(rd, bs[k2]));
}

/** A position in twips: usual, odd, at the limits, hostile. */
const twips = (rd) => pick(rd, [0, 1, 360, 720, 1440, 2880, 4321, 8640,
  rd() * 9000, 31680, 31681, -5, -720, 1e9, NaN, '720', null]);

const stopArg = (rd) => ({val: rd() < 0.05 ? pick(rd, ['wavy', 3, null])
  : pick(rd, VALS), pos: twips(rd), leader: pick(rd, LEADERS)});

/** The tabs argument of one random ruler / dialog command. */
function tabsArg(rd, d, sel) {
  const x = rd();
  const here = allBlocks(d).find((b) => b.type === 'p' && b.pPr &&
    b.pPr.tabs && b.pPr.tabs.length);
  const known = () => here ? pick(rd, here.pPr.tabs).pos : twips(rd);
  if (x < 0.3) return ['tabs', {add: stopArg(rd)}];
  if (x < 0.45) return ['tabs', {remove: rd() < 0.7 ? known() : twips(rd)}];
  if (x < 0.65) {
    return ['tabs', {move: {from: known(), to: twips(rd),
      ...(rd() < 0.5 ? {val: pick(rd, VALS)} : {})}}];
  }
  if (x < 0.72) {
    return ['tabs', {set: Array.from({length: Math.floor(rd() * 6)},
      () => stopArg(rd))}];
  }
  const edits = Array.from({length: 1 + Math.floor(rd() * 4)}, () => {
    const y = rd();
    if (y < 0.5) return {add: stopArg(rd)};
    if (y < 0.85) return {remove: known()};
    return {set: Array.from({length: Math.floor(rd() * 4)},
      () => stopArg(rd))};
  });
  const box = {tabs: {edits}};
  if (rd() < 0.35) box.defaultTab = pick(rd, [360, 720, 1440, 567, 36,
    31680, 35, 31681, 0, -1, 1.5, '720']);
  return ['tabsBox', box];
}

export const KINDS = ['ruler add', 'ruler remove', 'ruler move',
  'ruler set', 'dialog', 'dialog default', 'tab typed', 'enter',
  'delete range', 'style', 'undo/redo'];

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
  const before = every ? structuredClone([d.doc.sections,
    d.doc.rawSettings]) : null;
  let kind, res;
  const refuses = [];
  if (x < 0.6) {
    const [id, arg] = tabsArg(rd, d, sel);
    kind = id === 'tabs' ? 'ruler ' + Object.keys(arg)[0] : 'dialog';
    if (arg.defaultTab !== undefined) kind = 'dialog default';
    try {
      res = FA.apply(id, d, t, sel, arg);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      res = null;
      refuses.push(e.message);
    }
  } else if (x < 0.72) {
    kind = 'tab typed';
    res = {sel: t.type(sel, pick(rd, ['\t', 'a\tb', '\t\t', '1.5\t']))};
  } else if (x < 0.8) {
    kind = 'enter';
    res = run('enter', d, t, sel);
  } else if (x < 0.9) {
    kind = 'delete range';
    const to = randSel(rd, d);
    res = run('delete', d, t, to ? S.select(sel.anchor, to.head) : sel);
  } else {
    kind = 'style';
    try {
      res = FA.apply('style', d, t, sel, pick(rd, ['Heading1', 'Normal',
        'TabStyle', 'Title']));
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      res = null;
    }
  }
  if (res === undefined || res === null) {
    if (refuses.length || kind.startsWith('dialog')) {
      assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
      if (before) assert.deepEqual([d.doc.sections, d.doc.rawSettings],
        before, kind + ' refused: unchanged');
    }
    return [kind + ' none', sel];
  }
  return [kind, res.sel || res || sel];
}

/** STEPS commands on d. */
export function tabsAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > TABS_MS) break;
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

const tabbed = (...parts) => '<w:r>' + parts.map((s, i) => (i ?
  '<w:tab/>' : '') + `<w:t>${s}</w:t>`).join('') + '</w:r>';
const SETTINGS = (extra = '') => settingsXml('<w:zoom w:percent="100"/>' +
  extra + '<w:characterSpacingControl w:val="doNotCompress"/>');
const doc = (body, parts = {}, opts = {}) => () => buildDocx(
  {'word/document.xml': documentXml(body), ...parts}, opts);
const raw = '<w:tabs>' + Array.from({length: 257}, (_, k) =>
  `<w:tab w:val="left" w:pos="${20 * (k + 1)}"/>`).join('') + '</w:tabs>';
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main"><w:docDefaults><w:pPrDefault><w:pPr>' +
  '<w:tabs><w:tab w:val="left" w:pos="1000"/></w:tabs></w:pPr>' +
  '</w:pPrDefault></w:docDefaults><w:style w:type="paragraph" ' +
  'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TabStyle"><w:name ' +
  'w:val="TabStyle"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs>' +
  '<w:tab w:val="right" w:leader="dot" w:pos="5000"/>' +
  '<w:tab w:val="clear" w:pos="1000"/></w:tabs></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name ' +
  'w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs>' +
  '<w:tab w:val="center" w:pos="3000"/></w:tabs></w:pPr></w:style>' +
  '</w:styles>';
const STRICT_TABS = '<w:tabs><w:tab w:val="start" w:pos="1440"/>' +
  '<w:tab w:val="end" w:pos="7200"/></w:tabs>';

const MORE = [
  ['plain paragraphs with a settings part', doc(Array.from({length: 8},
    (_, i) => p(tabbed('Item ' + i, '1.50', 'x'))).join(''),
  {'word/settings.xml': SETTINGS('<w:defaultTabStop w:val="720"/>')})],
  ['settings part without a default tab stop', doc(Array.from(
    {length: 6}, (_, i) => p(tabbed('Row', String(i), '2'))).join(''),
  {'word/settings.xml': SETTINGS()})],
  ['no settings part', doc(p(tabbed('a', 'b')) + p(tabbed('c', 'd')))],
  ['tab stops in styles and docDefaults', doc(
    p(tabbed('Style', 'stops'), '<w:pStyle w:val="TabStyle"/>') +
    p(tabbed('Head', 'ing'), '<w:pStyle w:val="Heading1"/>') +
    p(tabbed('Plain', 'one')) +
    p(tabbed('Direct', 'over'), '<w:pStyle w:val="TabStyle"/>' +
      '<w:tabs><w:tab w:val="left" w:pos="5000"/></w:tabs>'),
  {'word/styles.xml': STYLES, 'word/settings.xml':
    SETTINGS('<w:defaultTabStop w:val="1440"/>')})],
  ['direct stops of every kind with leaders', doc(
    p(tabbed('One', 'two', 'three', 'four'), '<w:tabs>' +
      '<w:tab w:val="left" w:pos="1000"/><w:tab w:val="center" ' +
      'w:leader="hyphen" w:pos="3000"/><w:tab w:val="right" ' +
      'w:leader="underscore" w:pos="6000"/><w:tab w:val="decimal" ' +
      'w:leader="middleDot" w:pos="8000"/><w:tab w:val="bar" ' +
      'w:pos="9000"/></w:tabs>') + p(tabbed('Two', 'x')),
  {'word/settings.xml': SETTINGS('<w:defaultTabStop w:val="720"/>')})],
  ['a raw w:tabs (257 stops) and a clear stop', doc(
    p(tabbed('Raw', 'stops'), raw) + p(tabbed('Plain', 'one'),
      '<w:tabs><w:tab w:val="clear" w:pos="720"/></w:tabs>') +
    p(r('third')),
  {'word/settings.xml': SETTINGS('<w:defaultTabStop w:val="720"/>')})],
  ['Strict stops (start, end)', doc(p(tabbed('S', 'T'), STRICT_TABS) +
    p(tabbed('U', 'V')),
  {'word/settings.xml': SETTINGS('<w:defaultTabStop w:val="720"/>')})],
  ['hanging indent with stops', doc(p(tabbed('Term', 'Definition'),
    '<w:ind w:left="2160" w:hanging="2160"/><w:tabs><w:tab ' +
    'w:val="left" w:pos="720"/></w:tabs>') + p(tabbed('Cat', 'Purrs'),
    '<w:ind w:left="1440" w:hanging="1440"/>'),
  {'word/settings.xml': SETTINGS('<w:defaultTabStop w:val="720"/>')})],
  ['empty document', doc('')],
];

const {xsd, note: xsdNote} = schema();
const DOCS = [...FIXTURES, ...LIST_DOCS, ...MORE];

describe('tabs round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          tabsAll, {xsd: k === 0 ? xsd : null, every: true});
        if (res.refused) continue;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# tabs commands (generated): ' + JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
      if (kind !== 'undo/redo') {
        assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
      }
    }
    assert.ok(total['ruler add none'] > 0 || total['dialog none'] > 0,
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
    caret: (i) => S.caret({id: allBlocks(d)[i].id, off: 0})};
}

describe('tabs round trip: pinned cases', () => {
  it('a stop set reads back as the resolved stop', async () => {
    const s = await open(await buildDocx({'word/document.xml':
      documentXml(p(tabbed('a', 'b')) + p(tabbed('c', 'd'),
        '<w:pStyle w:val="TabStyle"/>')), 'word/styles.xml': STYLES,
    'word/settings.xml': SETTINGS('<w:defaultTabStop w:val="720"/>')}));
    FA.apply('tabs', s.d, s.t, s.caret(0), {add: {val: 'decimal',
      pos: 2880, leader: 'dot'}});
    FA.apply('tabs', s.d, s.t, s.caret(1), {remove: 5000});
    const back = await readDocx(await write(s.d.doc));
    const got = (i) => resolveTabs(back.styles, allBlocks({doc: back})[i])
      .map((x) => [x.val, x.pos, x.leader]);
    assert.deepEqual(got(0), resolveTabs(s.d.doc.styles, s.p(0))
      .map((x) => [x.val, x.pos, x.leader]), 'as in the model');
    assert.ok(got(0).some((x) => x[0] === 'decimal' && x[1] === 2880 &&
      x[2] === 'dot'));
    assert.ok(!got(1).some((x) => x[1] === 5000), 'style stop cleared');
  });
  it('the settings part changes only in w:defaultTabStop', async () => {
    const mk = (v) => buildDocx({'word/document.xml': documentXml(
      p(tabbed('a', 'b'))), 'word/settings.xml': SETTINGS(
      '<w:defaultTabStop w:val="' + v + '"/>')});
    const s = await open(await mk(720));
    const sameDoc = await readDocx(await mk(1440));
    FA.apply('tabsBox', s.d, s.t, s.caret(0), {defaultTab: 1440});
    assert.equal(defaultStop(s.d.doc), 1440);
    assert.deepEqual(s.d.doc.rawSettings, sameDoc.rawSettings);
    const back = await readDocx(await write(s.d.doc));
    assert.equal(defaultStop(back), 1440);
    assert.equal(s.d.undoDepth, 1);
    while (s.d.undo());
    assert.equal(defaultStop(s.d.doc), 720);
  });
  it('refusals change nothing', async () => {
    const s = await open(await buildDocx({'word/document.xml':
      documentXml(p(tabbed('a', 'b'), raw) + p(tabbed('c', 'd')))}));
    const attempts = [
      ['tabs', {add: {val: 'left', pos: 100}}, 0],
      ['tabs', {remove: 20}, 0],
      ['tabs', {add: {val: 'left', pos: 'x'}}, 1],
      ['tabs', {add: {val: 'wavy', pos: 100}}, 1],
      ['tabs', {add: {val: 'left', pos: 100}, remove: 3}, 1],
      ['tabsBox', {defaultTab: 1440}, 1],
      ['tabsBox', {tabs: {edits: [{add: {val: 'left', pos: 100}}]}}, 0],
      ['tabsBox', {bogus: 1}, 1]];
    for (const [id, arg, i] of attempts) {
      assert.throws(() => FA.apply(id, s.d, s.t, s.caret(i), arg),
        RangeError, id + ' ' + JSON.stringify(arg));
      assert.equal(s.d.undoDepth, 0);
    }
  });
});

const files = corpusFiles();

describe('tabs round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} tab commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () => corpusRun(files,
    tabsAll, xsd, xsdNote, 'tabs-edited corpus'));
});
