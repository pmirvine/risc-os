// Editing round trip: documents edited with !Word's real editing
// commands (./Edit, ./EditDel: typing with emoji, accents, combining
// marks, tabs and line breaks; Enter; Backspace and Delete; their
// word forms; deleting and typing over selections, also across
// paragraphs, tables and section breaks; bursts of undo and redo),
// then written and read back:
//
// - the model read back equals the edited model (docx-compare's
//   assertSameDoc after expectedBack, as the corpus test compares);
// - every block passes ModelCheck.checkBlock;
// - the package linter (lint-package.mjs) finds no error the
//   original did not have;
// - xmllint against wml.xsd (tools/moreapps/.cache, as validate.mjs)
//   finds no schema error in the main part the original did not have
//   (skipped when xmllint or the schemas are missing);
// - undoing every edit gives back the opened model exactly
//   (paragraph ids included), and writing it gives the very bytes the
//   unedited document was written as.
//
// Documents: the reader fixtures, a rich generated document
// (edit-rich.mjs), small documents with tables and sections, and
// the files of the optional corpus (tests/moreapps/corpus, git-
// ignored; skipped politely when absent): one in ten, chosen by a
// hash of the name, or every one with WORD_EDIT_CORPUS=1 (about two
// minutes). 50 seeded edits each; a file stops editing after EDIT_MS
// (and says so). A file the reader refuses must be refused with the
// code corpus-expected.json gives. The counts printed depend on the
// files present locally (the real-Word hand-off files in
// corpus/handoff included).
import {describe, it} from 'node:test';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {FIXTURES} from './docx-fixtures.mjs';
import {richDocx} from './edit-rich.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {rng} from './word-docs.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';

const EDITS = 50;
const EDIT_MS = 4000;

// ------------------------------------------------------------ edits

const PIECES = ['a', 'b', ' ', 'word ', '\u00e9', 'e\u0301', '\u0301',
  '\u{1F600}', '\u{1F469}\u200d\u{1F4BB}', '\t', '\n', 'x\ny', '.',
  '\u4e2d\u6587', '<&>"\''];

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pick = (rd, a) => a[Math.floor(rd() * a.length)];

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
  if (rd() < 0.55) return S.caret(a);
  const far = rd() < 0.15 ? bs.length : 4;
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * far)));
  return S.select(a, posIn(rd, bs[k2]));
}

function randText(rd) {
  let t = '';
  for (let n = 1 + Math.floor(rd() * 3); n > 0; n--) t += pick(rd, PIECES);
  return t;
}

/** One random edit; returns [name, the selection after it]. */
function edit(rd, d, sel) {
  const x = rd();
  if (x < 0.06) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  if (x < 0.36) {
    if (rd() < 0.2) d.breakCoalesce();
    const t = randText(rd);
    const over = rd() < 0.1;
    return ['type', E.typeText(d, sel, t, {key: 'typing',
      overwrite: over})];
  }
  if (x < 0.44) return ['enter', E.splitPara(d, sel)];
  if (x < 0.48) return ['lineBreak', E.lineBreak(d, sel)];
  if (x < 0.52) return ['tab', E.insertTab(d, sel)];
  if (x < 0.64) return ['back', X.deleteBack(d, sel)];
  if (x < 0.74) return ['forward', X.deleteForward(d, sel)];
  if (x < 0.78) return ['wordBack', X.deleteWordBack(d, sel)];
  if (x < 0.82) return ['wordForward', X.deleteWordForward(d, sel)];
  return ['selection', X.deleteSelection(d, sel)];
}

/**
 * EDITS random edits on d. Throws (naming the step) when a command
 * throws or leaves an invalid block (checked after every step when
 * `every`, else at the end). Returns {steps, capped}.
 */
function editAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let sel = null;
  const t0 = Date.now();
  let k = 0;
  for (; k < EDITS; k++) {
    if (Date.now() - t0 > EDIT_MS) break;
    if (!sel || rd() < 0.5) sel = randSel(rd, d);
    let name = '?';
    try {
      [name, sel] = edit(rd, d, sel);
      if (every) for (const b of allBlocks(d)) checkBlock(b);
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${name}): ${e.message}`;
      throw e;
    }
  }
  for (const b of allBlocks(d)) checkBlock(b);
  return {steps: k, capped: k < EDITS};
}

// ------------------------------------------------------------ documents

const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const doc = (body) => () => buildDocx({'word/document.xml':
  documentXml(body)});
const MORE = [
  ['rich (edit-rich.mjs)', richDocx],
  ['table first', doc(TBL + p(r('after')) + TBL)],
  ['tables only', doc(TBL + TBL + SECT)],
  ['sections, some empty', doc(p(r('one'), SECT) + p('', SECT) +
    p(r('three'), SECT) + p(r('four')) + SECT)],
  ['many short paragraphs', doc(Array.from({length: 60}, (_, i) =>
    p(r('Para ' + i + ' ') + r('bold', '<w:b/>'))).join(''))],
  ['no paragraphs', doc('')],
];

const {xsd, note: xsdNote} = schema();

describe('editing round trip: generated documents', () => {
  for (const [name, make] of [...FIXTURES, ...MORE]) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        // (the schema check, slow on some fixtures, for one seed)
        await roundTrip(bytes, name, hash(name) + k, editAll,
          {xsd: k === 0 ? xsd : null, every: true});
      }
    });
  }
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('editing round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`50 edits in ${ALL ? 'every' : 'one in ten'} corpus file ` +
    'round-trip; undo restores', () => corpusRun(files, editAll, xsd,
    xsdNote, 'edited corpus'));
});
