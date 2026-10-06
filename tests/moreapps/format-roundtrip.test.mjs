// Formatting round trip: documents formatted with !Word's real
// formatting commands (./FormatSet and ./FormatPara: the B I U S,
// superscript and subscript toggles; character sets of bold, italic,
// underline, size, colour, highlight, font and vertical alignment,
// with absurd and refused values; paragraph sets of alignment,
// indents and spacing; ruler drags; paragraph and character styles
// (and an unknown style, refused); clear formatting of characters
// and of paragraphs; Ctrl+Shift+> / < steps; indent more / less;
// typing with a pending format; bursts of undo and redo), then
// written and read back. The checks are those of roundtrip-lib.mjs:
// the model read back equals the formatted model; the package linter
// and xmllint/wml.xsd (when available, for one seed) add no error;
// undoing everything gives back the opened model and its bytes. A
// refused command (RangeError) must change nothing.
//
// Documents: the reader fixtures, the rich generated document, small
// documents with styles, headings, hyperlinks, tables and sections,
// and the corpus sample, gated as edit-roundtrip.test.mjs (one file
// in ten by a hash of its name; WORD_EDIT_CORPUS=1 for every file).
// 40 seeded commands per file (FORMAT_MS caps the time per file).
// The commands run per kind are counted and printed; each kind must
// have run and changed a document.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FS from '../../tools/moreapps/!Word/FormatSet';
import {dragIndents} from '../../tools/moreapps/!Word/FormatPara';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {forTyping, styleFor} from '../../tools/moreapps/!Word/Pending';
import {checkBlock, deepEqual} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {FIXTURES} from './docx-fixtures.mjs';
import {richDocx} from './edit-rich.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {STYLES} from './word-docs.mjs';
import {rng} from './word-docs.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';

const STEPS = 40;
const FORMAT_MS = 3000;

// ------------------------------------------------------------ commands

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const int = (rd, lo, hi) => lo + Math.floor(rd() * (hi - lo + 1));

/** A random position in block b (a grapheme boundary, or a box edge). */
function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

/** A random caret, or a selection (often across a few blocks). */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.25) return S.caret(a);
  const far = rd() < 0.15 ? bs.length : 4;
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * far)));
  return S.select(a, posIn(rd, bs[k2]));
}

const TOGGLES = ['bold', 'italic', 'underline', 'strike', 'superscript',
  'subscript'];
// values, some refused (RangeError) on purpose: 'NaN size', 'zz'
const CHAR = {
  b: [true, false, null], i: [true, false, null],
  strike: [true, false, null],
  u: ['single', 'double', 'wave', 'none', true, false, null],
  sz: [2, 16, 22, 23, 48, 144, 800, 0, -5, 1e6, 99.5, null, NaN],
  color: ['FF0000', '00b050', 'DD0000', 'auto', null, 'zz'],
  highlight: ['yellow', 'darkBlue', 'lightGray', 'none', null, 'pink'],
  vertAlign: ['superscript', 'subscript', 'baseline', null],
  rFonts: ['Arial', 'Times New Roman', {ascii: 'Courier New'},
    'Calibri', null, ''],
};
const tw = (rd) => pick(rd, [0, 360, 720, 1440, -720, 100000,
  int(rd, -2000, 12000)]);

function charPatch(rd) {
  const out = {};
  const keys = Object.keys(CHAR);
  for (let n = int(rd, 1, 3); n > 0; n--) {
    const k = pick(rd, keys);
    out[k] = pick(rd, CHAR[k]);
  }
  return out;
}

function paraPatch(rd) {
  const out = {};
  const x = rd();
  if (x < 0.4) out.jc = pick(rd, ['left', 'center', 'right', 'both',
    null]);
  else if (x < 0.75) {
    out.ind = rd() < 0.1 ? null : {};
    if (out.ind) {
      if (rd() < 0.6) out.ind.left = tw(rd);
      if (rd() < 0.3) out.ind.right = tw(rd);
      const f = rd();
      if (f < 0.3) out.ind.firstLine = Math.abs(tw(rd));
      else if (f < 0.6) out.ind.hanging = Math.abs(tw(rd));
      else if (f < 0.7) out.ind.firstLine = null;
    }
  } else {
    out.spacing = rd() < 0.1 ? null : {};
    if (out.spacing) {
      if (rd() < 0.5) out.spacing.before = pick(rd, [0, 120, 240, null]);
      if (rd() < 0.5) out.spacing.after = pick(rd, [0, 160, 480]);
      if (rd() < 0.4) {
        out.spacing.line = pick(rd, [240, 276, 360, 480]);
        out.spacing.lineRule = pick(rd, ['auto', 'exact', 'atLeast']);
      }
    }
  }
  return out;
}

/** Style ids of type (and, now and then, one that does not exist). */
function styleIds(d, type) {
  const st = d.doc.styles;
  if (!st || !(st.styles instanceof Map)) return [];
  return [...st.styles.values()].filter((s) => s.type === type)
    .map((s) => s.id);
}

/**
 * One random command on d; returns [kind, sel, pending]. A command
 * refused (RangeError) must change nothing: checked here.
 */
function command(rd, d, t, sel, pending, every) {
  const x = rd();
  if (x < 0.07) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null, null];
  }
  if (!sel) return ['none', null, null];
  let kind, run;
  if (x < 0.27) {
    kind = 'toggle';
    const key = pick(rd, TOGGLES);
    run = () => FS.toggle(d, t, sel, key, pending);
  } else if (x < 0.43) {
    kind = 'setChar';
    const patch = charPatch(rd);
    run = () => FS.setChar(d, t, sel, patch, pending);
  } else if (x < 0.55) {
    kind = 'setPara';
    const patch = paraPatch(rd);
    run = () => FS.setPara(d, t, sel, patch, pending);
  } else if (x < 0.62) {
    kind = 'paraStyle';
    const ids = styleIds(d, 'paragraph');
    const id = rd() < 0.1 || !ids.length ? 'NoSuchStyle' : pick(rd, ids);
    run = () => FS.applyStyle(d, t, sel, id, pending);
  } else if (x < 0.66) {
    kind = 'charStyle';
    const ids = styleIds(d, 'character');
    const id = rd() < 0.1 || !ids.length ? 'NoSuchStyle' : pick(rd, ids);
    run = () => FS.applyStyle(d, t, sel, id, pending);
  } else if (x < 0.71) {
    kind = 'clearFormat';
    run = () => FS.clearFormat(d, t, sel, pending);
  } else if (x < 0.74) {
    kind = 'clearParaFormat';
    run = () => FS.clearParaFormat(d, t, sel, pending);
  } else if (x < 0.81) {
    kind = 'sizeBy';
    const n = pick(rd, [1, -1, 2, -3, 50]);
    run = () => FS.sizeBy(d, t, sel, n, pending);
  } else if (x < 0.86) {
    kind = 'indentBy';
    const n = pick(rd, [720, -720, 360]);
    run = () => FS.indentBy(d, t, sel, n, pending);
  } else if (x < 0.91) {
    kind = 'ruler';
    const marker = pick(rd, ['left', 'first', 'hanging', 'right']);
    const at = pick(rd, [0, 720, 1500, -1e9, 1e9, int(rd, -500, 9000)]);
    run = () => dragIndents(d, t, sel, {marker, at, textW: 9026,
      free: rd() < 0.3}, pending);
  } else {
    // typing at a caret with the pending format (Ctrl-B, then text)
    kind = 'typePending';
    const c = S.caret(sel.head);
    const res = FS.toggle(d, t, c, pick(rd, TOGGLES), pending);
    const pend = res.pending;
    run = () => {
      const s = t.type(c, pick(rd, ['x', 'word ', '\u00e9']),
        {rPr: forTyping(pend), rStyle: styleFor(pend)});
      return {sel: s, pending: null};
    };
  }
  const depth = d.undoDepth;
  const before = every ? structuredClone(d.doc.sections) : null;
  try {
    const res = run();
    return [kind, res.sel, res.pending];
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
    if (before) {
      assert.ok(deepEqual(d.doc.sections, before),
        kind + ' refused: nothing changed');
    }
    return [kind + ' refused', sel, pending];
  }
}

/**
 * STEPS random commands on d. Throws (naming the step) when a
 * command throws or leaves an invalid block (checked after every
 * step when `every`, else at the end). Returns {steps, capped,
 * counts}: commands run per kind, and per kind + ' changed' those
 * that made an undo step.
 */
function formatAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null, pending = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > FORMAT_MS) break;
    if (!sel || rd() < 0.5) { sel = randSel(rd, d); pending = null; }
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel, pending] = command(rd, d, t, sel, pending, every);
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

const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const HYPER = '<w:hyperlink w:anchor="x"><w:r><w:t>link</w:t></w:r>' +
  '</w:hyperlink>';
const doc = (body, styles) => () => buildDocx({'word/document.xml':
  documentXml(body), ...(styles ? {'word/styles.xml': STYLES} : {})});
const H = (t, lvl = 1) => p(r(t), `<w:pStyle w:val="Heading${lvl}"/>`);
const MORE = [
  ['rich (edit-rich.mjs)', richDocx],
  ['styled: headings, formats, a link, a table', doc(H('Title') +
    p(r('Plain ') + r('bold', '<w:b/>') + r(' big', '<w:sz w:val="40"/>') +
      r(' red', '<w:color w:val="FF0000"/>') + r(' mark',
      '<w:highlight w:val="yellow"/>')) +
    '<w:p><w:r><w:t xml:space="preserve">A </w:t></w:r>' + HYPER +
    '<w:r><w:t xml:space="preserve"> after</w:t></w:r></w:p>' + TBL +
    H('Sub', 2) + p(r('Indented'), '<w:ind w:left="720" ' +
      'w:hanging="360"/><w:jc w:val="both"/>') + SECT, true)],
  ['no styles part', doc(p(r('one ') + r('two', '<w:i/>')) +
    p(r('three')) + TBL + p(''))],
  ['sections, some empty', doc(p(r('one'), SECT) + p('', SECT) +
    p(r('three'), SECT) + p(r('four')) + SECT, true)],
  ['many short paragraphs', doc(Array.from({length: 60}, (_, i) =>
    p(r('Para ' + i + ' ') + r('bold', '<w:b/>'))).join(''), true)],
  ['no paragraphs', doc('')],
];

const {xsd, note: xsdNote} = schema();
const KINDS = ['toggle', 'setChar', 'setPara', 'paraStyle', 'charStyle',
  'clearFormat', 'clearParaFormat', 'sizeBy', 'indentBy', 'ruler',
  'typePending', 'undo/redo'];

describe('formatting round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of [...FIXTURES, ...MORE]) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        // (the schema check, slow on some fixtures, for one seed)
        const res = await roundTrip(bytes, name, hash(name) + k,
          formatAll, {xsd: k === 0 ? xsd : null, every: true});
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran, and changed documents', () => {
    console.log('# formatting commands (generated): ' +
      JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
      if (kind !== 'undo/redo') {
        assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
      }
    }
    for (const kind of ['setChar', 'paraStyle'])
      assert.ok(total[kind + ' refused'] > 0, kind + ' refused');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('formatting round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} formatting commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () => corpusRun(files,
    formatAll, xsd, xsdNote, 'formatted corpus'));
});
