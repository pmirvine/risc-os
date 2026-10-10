// Breaks round trip: documents changed with !Word's page and section
// break commands (./EditApply Ctrl-Enter, Insert > Section break >
// Next page / Continuous, ./InsertApply and ./SectBreak) mixed with
// what undoes them or goes beside them: Backspace, Delete and the
// Ctrl forms at section edges (a break removed), Enter, typing,
// selections deleted over breaks, page break before (./FormatApply
// paraBox) and bursts of undo and redo; then written and read back.
// The checks are those of roundtrip-lib.mjs: the model read back
// equals the changed model; every block passes ModelCheck; the
// package linter and xmllint/wml.xsd (when available, for one seed)
// add no error; undo of everything gives back the opened model and
// its bytes. Besides: every document is written with a sectPr for
// each section (the paragraph that ends it or the body), the number
// of sections read back is the number in the model, and a command
// that does nothing (a key with no break to remove) makes no undo
// step.
//
// Documents: the reader fixtures (sections, a last-paragraph sectPr,
// no final sectPr...), the list fixtures, plain documents, one with
// many sections (alternating types, a landscape one, header
// references) and the corpus sample, gated as the other round trips
// (one file in ten by a hash of the name; WORD_EDIT_CORPUS=1 for
// every file, which needs NODE_OPTIONS=--max-old-space-size=4096).
// 40 seeded commands per file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';
import {rng} from './word-docs.mjs';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as S from '../../tools/moreapps/!Word/Selection';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';

export const STEPS = 40;
const BREAKS_MS = 3000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const sectionsOf = (d) => d.doc.sections.length;

// ------------------------------------------------------------ commands

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
}

/** The blocks that start or end a section (not the first / last). */
function edges(d) {
  const out = [];
  d.doc.sections.forEach((s, i) => {
    if (i > 0 && s.blocks.length) out.push({b: s.blocks[0], end: false});
    if (i < d.doc.sections.length - 1 && s.blocks.length)
      out.push({b: s.blocks.at(-1), end: true});
  });
  return out;
}

/** A random caret or selection; often at a section's edge. */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const es = edges(d);
  if (es.length && rd() < 0.35) {
    const e = pick(rd, es);
    if (e.b.type === 'p') {
      return S.caret({id: e.b.id, off: e.end ? e.b.text.length : 0});
    }
    return S.caret({id: blockId(e.b), off: e.end ? 1 : 0});
  }
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.55) return S.caret(a);
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * (rd() < 0.1 ? bs.length : 4))));
  return S.select(a, posIn(rd, bs[k2]));
}

export const KINDS = ['pageBreak', 'sectionNext', 'sectionContinuous',
  'edge key', 'enter', 'type', 'delete range', 'page break before',
  'undo/redo'];
const EDGE_KEYS = ['delete', 'backspace', 'ctrlDelete', 'ctrlBackspace'];

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
  const secs = sectionsOf(d);
  const before = every ? structuredClone(d.doc.sections) : null;
  let kind, res;
  if (x < 0.3) {
    kind = pick(rd, ['pageBreak', 'sectionNext', 'sectionContinuous']);
    res = run(kind, d, t, sel);
  } else if (x < 0.6) {
    // a key where a break may be: at an edge (made by randSel)
    kind = 'edge key';
    const id = pick(rd, EDGE_KEYS);
    res = run(id, d, t, sel);
    if (sectionsOf(d) !== secs) kind = 'break removed';
  } else if (x < 0.7) {
    kind = 'enter';
    res = run('enter', d, t, sel);
  } else if (x < 0.8) {
    kind = 'type';
    res = {sel: t.type(sel, pick(rd, ['x', 'word ', 'é', '\t']))};
  } else if (x < 0.9) {
    kind = 'delete range';
    const to = randSel(rd, d);
    const s2 = to ? S.select(sel.anchor, to.head) : sel;
    res = run('delete', d, t, s2);
  } else {
    kind = 'page break before';
    const v = pick(rd, [true, true, false, null]);
    res = FA.apply('paraBox', d, t, sel, {pageBreakBefore: v});
  }
  if (res === undefined || res === null) {
    // not done: nothing may have changed
    assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
    if (before) assert.deepEqual(d.doc.sections, before, kind +
      ' refused: unchanged');
    return [kind + ' none', sel];
  }
  if (kind === 'sectionNext' || kind === 'sectionContinuous') {
    assert.equal(sectionsOf(d), secs + 1, kind + ' adds a section');
  }
  return [kind, res.sel || res || sel];
}

/** STEPS commands on d. */
export function breaksAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > BREAKS_MS) break;
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
  counts.sections = sectionsOf(d);
  return {steps: k, capped: k < STEPS, counts};
}

// ------------------------------------------------------------ documents

const doc = (body, parts = {}, opts = {}) => () => buildDocx(
  {'word/document.xml': documentXml(body), ...parts}, opts);
const sect = (inner, a = '') => `<w:sectPr${a}>${inner}</w:sectPr>`;
const HDR = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main"><w:p><w:r><w:t>Head</w:t></w:r></w:p>' +
  '</w:hdr>';
const REF = '<w:headerReference w:type="default" r:id="rId9"/>';
const LAND = '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>';
const A4 = '<w:pgSz w:w="11906" w:h="16838"/>';
const HEADER_PARTS = {'word/header1.xml': HDR};
const HEADER_REL = {docRels: [['rId9', REL('header'), 'header1.xml']]};
/** Many sections: types alternate, every fifth is landscape. */
const many = (n) => Array.from({length: n}, (_, i) => p(r('Section ' +
  i + ' text ' + i), sect((i % 3 === 0 ? REF : '') + '<w:type w:val="' +
  ['nextPage', 'continuous', 'evenPage'][i % 3] + '"/>' +
  (i % 5 === 4 ? LAND : A4)))).join('');

const MORE = [
  ['plain paragraphs', doc(Array.from({length: 12}, (_, i) =>
    p(r('Para ' + i + ' the'))).join(''))],
  ['empty paragraphs', doc(p('') + p(r('x')) + p('') + p(''))],
  ['no paragraphs', doc('')],
  ['many sections, header references, landscape', doc(many(24) +
    sect(REF + LAND + '<w:cols w:space="708"/>', ' w:rsidR="00A1"'),
  HEADER_PARTS, HEADER_REL)],
  ['one landscape section with headers in the original', doc(
    p(r('First')) + p(r('Second')) + p(r('Third')) +
    sect(REF + '<w:pgNumType w:start="3"/>' + LAND +
      '<w:titlePg/>'), HEADER_PARTS, HEADER_REL)],
  ['page breaks and flow flags', doc(
    p(r('a') + '<w:r><w:br w:type="page"/></w:r>') +
    p(r('b'), '<w:pageBreakBefore/>') +
    p('<w:r><w:t>c</w:t><w:br w:type="column"/><w:t>d</w:t></w:r>',
      '<w:keepNext/><w:keepLines/><w:widowControl w:val="0"/>') +
    p('<w:r><w:lastRenderedPageBreak/><w:t>e</w:t></w:r>'))],
  ['section properties kept raw', doc(p(r('a'), sect(
    '<w:footnotePr><w:numFmt w:val="lowerRoman"/></w:footnotePr>' +
    '<w:type w:val="oddPage"/><w:lnNumType w:countBy="1"/>' + A4,
    ' w:rsidR="00B2" w:rsidSect="00C3"')) + p(r('b')) +
    sect('<w:vAlign w:val="center"/><w:bidi/>' + A4))],
];

const {xsd, note: xsdNote} = schema();
const DOCS = [...FIXTURES, ...LIST_DOCS, ...MORE];

describe('breaks round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          breaksAll, {xsd: k === 0 ? xsd : null, every: true});
        if (res.refused) continue;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# breaks commands (generated): ' +
      JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
      if (kind !== 'undo/redo') {
        assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
      }
    }
    assert.ok(total['break removed'] > 5, 'breaks removed by keys: ' +
      total['break removed']);
    assert.ok(total['edge key'] > total['edge key changed'],
      'a key that changed nothing');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('breaks round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} break commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () => corpusRun(files,
    breaksAll, xsd, xsdNote, 'breaks-edited corpus'));
});
