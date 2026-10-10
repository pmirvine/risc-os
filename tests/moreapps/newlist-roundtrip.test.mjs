// New-list round trip: documents changed with !Word's list-making
// commands (./FormatApply bullets and numbering with every gallery
// entry and bad ones, listRestart with starts good and absurd,
// listContinue; AutoFormat as you type: a marker typed at a
// paragraph's start and the space (./AutoList.afterSpace)) mixed
// with the list keys' commands (Tab, Shift-Tab, Backspace, Enter,
// ./FormatSet setList), typing and bursts of undo and redo, then
// written and read back. The checks are those of roundtrip-lib.mjs:
// the model read back equals the changed model; every block passes
// ModelCheck; the package linter and xmllint/wml.xsd (when available,
// for one seed) add no error; undo of everything gives back the
// opened model and its bytes. And the numbering part: when the
// commands made definitions, every child of its root as written for
// the unchanged document is in the changed part, serialized the same
// and in the same order, the new ones only added (the "grown" rule);
// otherwise the very bytes (the "kept" rule). A refused command
// changes nothing.
//
// Documents: the reader fixtures, the list fixtures, plain documents
// (no numbering part at all), one with a Word-style part, and the
// corpus sample, gated as the other round trips (one file in ten by a
// hash of the name; WORD_EDIT_CORPUS=1 for every file). 40 seeded
// commands per file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {newListAll, MAKE_KINDS, STEPS} from './newlist-commands.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';


const KEEP = ['numberingPart'];

// ------------------------------------------------------------ documents

const doc = (body) => () => buildDocx({'word/document.xml':
  documentXml(body)});
const MORE = [
  ['plain paragraphs, no numbering part', doc(Array.from({length: 12},
    (_, i) => p(r('Para ' + i + ' the'))).join(''))],
  ['empty paragraphs and one word', doc(p('') + p(r('x')) + p('') +
    p(''))],
  ['no paragraphs', doc('')],
];

const {xsd, note: xsdNote} = schema();
const DOCS = [...FIXTURES, ...LIST_DOCS, ...MORE];

describe('new list round trip: generated documents', () => {
  const total = {};
  let kept = 0, grown = 0, runs = 0;
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          newListAll, {xsd: k === 0 ? xsd : null, every: true,
            keep: KEEP});
        if (res.refused) continue;
        runs++;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
        kept += res.kept;
        grown += res.grown;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# new list commands (generated): ' +
      JSON.stringify(total));
    console.log(`# numbering part: ${grown} runs grew it (originals ` +
      `kept in order), ${kept} left it byte for byte, of ${runs}`);
    for (const kind of [...MAKE_KINDS, 'tab', 'enter', 'undo/redo']) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
      if (kind !== 'undo/redo')
        assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
    }
    assert.ok(total['bullets refused'] > 0, 'a bullets refused');
    assert.ok(grown > 20, 'parts grown: ' + grown);
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('new list round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} list commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; originals kept; undo restores', () =>
    corpusRun(files, newListAll, xsd, xsdNote, 'new-list corpus',
      {keep: KEEP}));
});
