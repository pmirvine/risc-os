// Spacing round trip: documents changed with !Word's paragraph
// spacing and flow commands, then written and read back. The commands
// are those of the keys, the Format menu and the toolbar
// (./FormatApply: lineSingle, lineDouble, line15, lineSpacing with a
// factor or {line, lineRule}, spaceBefore, spaceAfter, spaceBefore12),
// random paragraph patches (./FormatSet.setPara: spacing, the flow
// flags keepNext keepLines widowControl pageBreakBefore, and
// contextualSpacing), and the Paragraph dialog (./ParaPatch.patch of
// random field values against the query of the selection, applied as
// ./FormatApply paraBox), with absurd and refused values and bursts
// of undo and redo. The checks are those of roundtrip-lib.mjs: the
// model read back equals the changed model; the package linter and
// xmllint/wml.xsd (when available, for one seed) add no error; undo of
// everything gives back the opened model and its bytes. A command
// refused (RangeError) must change nothing.
//
// Documents: the reader fixtures, small documents with raw
// autospacing, absurd line values, List Paragraph (contextual
// spacing) and flow flags, and the corpus sample, gated as the other
// round trips (one file in ten by a hash of the name;
// WORD_EDIT_CORPUS=1 for every file). 40 seeded commands per file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FS from '../../tools/moreapps/!Word/FormatSet';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as F from '../../tools/moreapps/!Word/Format';
import {patch as dialogPatch, NAMES, ALIGNS, SPECIALS, LINES}
  from '../../tools/moreapps/!Word/ParaPatch';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {checkBlock, deepEqual} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {rng} from './word-docs.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';

const STEPS = 40;
const SPACING_MS = 3000;

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const int = (rd, lo, hi) => lo + Math.floor(rd() * (hi - lo + 1));

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.25) return S.caret(a);
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * (rd() < 0.15 ? bs.length : 4))));
  return S.select(a, posIn(rd, bs[k2]));
}

const KEYS = [['lineSingle'], ['lineDouble'], ['line15'],
  ['spaceBefore12'], ['lineSpacing', 1], ['lineSpacing', 1.15],
  ['lineSpacing', 2.5], ['lineSpacing', 3], ['lineSpacing', 7],
  ['lineSpacing', {line: 0, lineRule: 'exact'}],
  ['lineSpacing', {line: 1e9, lineRule: 'atLeast'}],
  ['lineSpacing', {line: 300, lineRule: 'exact'}],
  ['lineSpacing', {line: -5}], ['lineSpacing', 'x'],
  ['spaceBefore', 240], ['spaceBefore', null], ['spaceBefore', 1e9],
  ['spaceAfter', 0], ['spaceAfter', 200], ['spaceAfter', 'x']];

const FLOW = ['keepNext', 'keepLines', 'widowControl', 'pageBreakBefore',
  'contextualSpacing'];

function spacingPatch(rd) {
  const out = {};
  if (rd() < 0.7) {
    out.spacing = rd() < 0.1 ? null : {};
    if (out.spacing) {
      if (rd() < 0.5) out.spacing.before = pick(rd, [0, 120, 240, 5000,
        -20, null]);
      if (rd() < 0.5) out.spacing.after = pick(rd, [0, 160, 480, 31680,
        null]);
      if (rd() < 0.5) {
        out.spacing.line = pick(rd, [240, 276, 360, 480, 600, 1, 99999]);
        out.spacing.lineRule = pick(rd, ['auto', 'exact', 'atLeast']);
      }
    }
  }
  for (let n = int(rd, 0, 3); n > 0; n--) {
    out[pick(rd, FLOW)] = pick(rd, [true, false, null]);
  }
  return out;
}

/** Random field values for the Paragraph dialog. */
function dialogValues(rd) {
  const v = {};
  const maybe = (k, val) => { if (rd() < 0.35) v[k] = val; };
  maybe('align', pick(rd, ALIGNS).id);
  maybe('left', pick(rd, [0, 360, 720, 1440, 99999]));
  maybe('right', pick(rd, [0, 360, 720]));
  maybe('special', pick(rd, SPECIALS).id);
  maybe('by', pick(rd, [720, 360, 1440, 0]));
  maybe('before', pick(rd, [0, 120, 240, 960]));
  maybe('after', pick(rd, [0, 160, 240]));
  maybe('spacing', pick(rd, LINES).id);
  maybe('at', pick(rd, [1, 1.15, 12, 18, 0.4, 9, 2000, null]));
  for (const k of ['noctx', 'widow', 'keepnext', 'keeplines',
    'pagebreak']) maybe(k, rd() < 0.5);
  if (rd() < 0.05) v[pick(rd, NAMES)] = null;
  return v;
}

function command(rd, d, t, sel, every) {
  const x = rd();
  if (x < 0.08) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  let kind, run;
  if (x < 0.45) {
    kind = 'key';
    const [id, arg] = pick(rd, KEYS);
    run = () => FA.apply(id, d, t, sel, arg);
  } else if (x < 0.7) {
    kind = 'setPara';
    const patch = spacingPatch(rd);
    run = () => FS.setPara(d, t, sel, patch);
  } else {
    kind = 'dialog';
    const q = F.query(d.doc, sel);
    const {patch, bad} = dialogPatch(dialogValues(rd), q);
    if (bad.length) {
      assert.deepEqual(patch, {}, 'a refused dialog changes nothing');
      return ['dialog refused', sel];
    }
    run = () => FA.apply('paraBox', d, t, sel, patch);
  }
  const depth = d.undoDepth;
  const before = every ? structuredClone(d.doc.sections) : null;
  try {
    const res = run();
    return [kind, res && res.sel ? res.sel : sel];
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
    if (before) {
      assert.ok(deepEqual(d.doc.sections, before),
        kind + ' refused: nothing changed');
    }
    return [kind + ' refused', sel];
  }
}

function spacingAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > SPACING_MS) break;
    if (!sel || rd() < 0.5) sel = randSel(rd, d);
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

const doc = (body) => () => buildDocx({'word/document.xml':
  documentXml(body)});
const SP = (a) => `<w:spacing ${a}/>`;
const MORE = [
  ['raw autospacing and absurd line values', doc(
    p(r('auto'), SP('w:beforeAutospacing="1" w:afterAutospacing="1"')) +
    p(r('lines'), SP('w:beforeLines="100" w:afterLines="50"')) +
    p(r('huge'), SP('w:line="999999" w:lineRule="exact" w:before="9999999"')) +
    p(r('neg'), SP('w:line="-240" w:lineRule="atLeast" w:after="-5"')) +
    p(r('junk'), SP('w:line="x" w:lineRule="zz" w:before=""')) +
    p(r('exact'), SP('w:line="240" w:lineRule="exact"')) +
    p(r('plain')))],
  ['flow flags', doc(
    p(r('a'), '<w:keepNext/><w:keepLines/><w:widowControl w:val="0"/>') +
    p(r('b'), '<w:pageBreakBefore/>') +
    p(r('c'), '<w:contextualSpacing w:val="0"/>') + p(r('d')))],
  ['many short paragraphs', doc(Array.from({length: 60}, (_, i) =>
    p(r('Para ' + i))).join(''))],
];

const {xsd, note: xsdNote} = schema();
const KINDS = ['key', 'setPara', 'dialog', 'undo/redo'];
const DOCS = [...FIXTURES, ...LIST_DOCS, ...MORE];

describe('spacing round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          spacingAll, {xsd: k === 0 ? xsd : null, every: true});
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# spacing commands (generated): ' +
      JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
      if (kind !== 'undo/redo') {
        assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
      }
    }
    assert.ok(total['key refused'] > 0, 'a key refused');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('spacing round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} spacing commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () => corpusRun(files,
    spacingAll, xsd, xsdNote, 'spacing-edited corpus'));
});
