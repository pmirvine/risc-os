// Move range marks kept paired (Batch F2): a deletion, Accept or
// Reject, or a cut that removes one half of a w:moveFromRange or
// w:moveToRange (or a w:permStart / End) puts the other half back,
// as it does for bookmarks and comment ranges (./BookmarkKeep), so a
// saved file never has a range start with no end, or an end with
// no start (Word's "unreadable content": the tc-2 hand-off file).
// One undo puts everything back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {deleteSelection, deleteBack, deleteForward}
  from '../../tools/moreapps/!Letters/EditDel';
import {cutSelection, pasteBlocks}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {accept, reject, acceptAll, rejectAll}
  from '../../tools/moreapps/!Letters/RevCmd';
import {setTracking} from '../../tools/moreapps/!Letters/RevTrack';
import {deleteRowsCmd} from '../../tools/moreapps/!Letters/TblCmdRows';
import {deleteColsCmd} from '../../tools/moreapps/!Letters/TblCmdCols';
import {list} from '../../tools/moreapps/!Letters/RevMarks';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, settingsXml} from './build-docx.mjs';
import {unpaired, partsUnpaired} from './range-pairs.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const D = '2024-01-02T03:04:00Z';
const att = (id, au = 'Bo') => `w:id="${id}" w:author="${au}" ` +
  `w:date="${D}"`;
const run = (t, tag = 'w:t') => `<w:r><${tag} xml:space="preserve">` +
  `${t}</${tag}></w:r>`;
const r = (t) => run(t);
const p = (inner) => `<w:p>${inner}</w:p>`;
const range = (side, id, name, inner) =>
  `<w:move${side}RangeStart ${att(id)} w:name="${name}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
const mvFrom = (id, t, name, rid) => range('From', rid, name,
  `<w:moveFrom ${att(id)}>${run(t)}</w:moveFrom>`);
const mvTo = (id, t, name, rid) => range('To', rid, name,
  `<w:moveTo ${att(id)}>${run(t)}</w:moveTo>`);
const ins = (id, inner, au) => `<w:ins ${att(id, au)}>${inner}</w:ins>`;
const del = (id, inner, au) => `<w:del ${att(id, au)}>${inner}</w:del>`;
const dr = (t) => run(t, 'w:delText');
const bmS = (id) => `<w:bookmarkStart w:id="${id}" w:name="b${id}"/>`;
const bmE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const permS = (id) => `<w:permStart w:id="${id}" w:edGrp="everyone"/>`;
const permE = (id) => `<w:permEnd w:id="${id}"/>`;

/** The three moves of the tc-2 hand-off file (Word-shaped). */
const THREE = p(r('A old: ') + mvFrom(1, 'alpha words', 'moveA', 101) +
  r(' end.')) +
  p(r('B old: ') + mvFrom(2, 'beta words', 'moveB', 102) + r(' end.')) +
  p(r('C old: ') + mvFrom(3, 'gamma words', 'moveC', 103) +
    r(' end.')) +
  p(r('New places: ') + mvTo(4, 'alpha words', 'moveA', 104) +
    r(' / ') + mvTo(5, 'beta words', 'moveB', 105) + r(' / ') +
    mvTo(6, 'gamma words', 'moveC', 106) + r(' end.'));

const plain = (b) => b.text.split(OBJ).join('');
const paras = (doc) => {
  const out = [];
  scan(doc, (b) => { if (b.type === 'p') out.push(b); });
  return out;
};

/** A session on body: {d, t}, All Markup. */
async function open(body) {
  const d = new Document(await readDocx(await buildDocx(
    {'word/document.xml': documentXml(body),
      'word/settings.xml': settingsXml()})));
  d.markup = 'all';
  d.reviewer = () => ({name: 'Me', now: new Date(2026, 0, 2, 3, 4)});
  return {d, t: new Typing(d, {now: () => 0})};
}

/** The offset in b.text of plain-text offset n: just after the n-th
 *  character, so before the marks that follow it. */
function offOf(b, n) {
  let k = 0, m = 0;
  for (; k < b.text.length && m < n; k++) if (b.text[k] !== OBJ) m++;
  return k;
}

/** The selection of word in the paragraph whose text starts with
 *  start: with the marks just before it (lead, as the hand-off's
 *  selections), and those just after it (tail). */
function sel(d, start, word, {lead = true, tail = false} = {}) {
  const b = paras(d.doc).find((x) => plain(x).startsWith(start));
  const i = plain(b).indexOf(word);
  assert.ok(i >= 0, 'no ' + word);
  let a = offOf(b, i), z = offOf(b, i + word.length);
  if (!lead) while (b.text[a] === OBJ) a++;
  if (tail) while (z < b.text.length && b.text[z] === OBJ) z++;
  return S.select({id: b.id, off: a}, {id: b.id, off: z});
}

/** A caret in word of the paragraph whose text starts with start. */
function at(d, start, word) {
  const b = paras(d.doc).find((x) => plain(x).startsWith(start));
  return S.caret({id: b.id, off: offOf(b, plain(b).indexOf(word) + 1)});
}

const main = async (doc) => {
  const z = await readZip(await writeDocx(doc, {date: DATE}));
  return new TextDecoder().decode(z.get('word/document.xml'));
};

/** doc's saved file has every range paired, and reads back so. */
async function pairedOut(doc, what) {
  const bytes = await writeDocx(doc, {date: DATE});
  const z = await readZip(bytes);
  assert.deepEqual(partsUnpaired(z), [], what + ': saved XML');
  const back = await readDocx(bytes);
  assert.deepEqual(unpaired(await main(back)), [],
    what + ': read back');
}

/** Undo all: the saved main part as it was at the start. */
async function undoesAll(d, xml0, what) {
  while (d.undo());
  assert.equal(await main(d.doc), xml0, what + ': undo all');
}

describe('move range marks kept paired', () => {
  it('the helper finds an orphan move range end, and none in the ' +
    'shaped input', async () => {
    const {d} = await open(THREE);
    assert.deepEqual(unpaired(await main(d.doc)), []);
    assert.deepEqual(unpaired('<w:moveToRangeEnd w:id="106"/>' +
      '<w:bookmarkStart w:id="1" w:name="x"/>' + permS(4)),
    ['bookmark start 1', 'moveToRange end 106', 'perm start 4']);
    assert.deepEqual(unpaired('<w:customXmlInsRangeStart w:id="3" ' +
      'w:author="a"/><w:customXmlMoveToRangeEnd w:id="8"/>' +
      '<w:customXmlDelRangeStart w:id="5"/>' +
      '<w:customXmlDelRangeEnd w:id="5"/>'),
    ['customXmlInsRange start 3', 'customXmlMoveToRange end 8']);
  });

  it('deleting a move\'s new place with its range start (Track ' +
    'Changes off) puts the start back: tc-2', async () => {
    const {d, t} = await open(THREE);
    const xml0 = await main(d.doc);
    t.command(() => deleteSelection(d, sel(d, 'New places',
      'gamma words')));
    assert.ok(!plain(paras(d.doc)[3]).includes('gamma'));
    await pairedOut(d.doc, 'tracking off');
    // move C's old place lost its partner: a plain deletion now
    const kinds = list(d.doc).map((e) => e.kind + e.id);
    assert.ok(kinds.includes('del3'), kinds.join(' '));
    await undoesAll(d, xml0, 'tracking off');
  });

  it('the same with the range end taken and the start left',
    async () => {
    const {d, t} = await open(THREE);
    const xml0 = await main(d.doc);
    t.command(() => deleteSelection(d, sel(d, 'New places',
      'gamma words', {lead: false, tail: true})));
    await pairedOut(d.doc, 'end taken');
    await undoesAll(d, xml0, 'end taken');
  });

  it('the old place deleted with its range start: paired', async () => {
    const {d, t} = await open(THREE);
    const xml0 = await main(d.doc);
    t.command(() => deleteSelection(d, sel(d, 'C old',
      'gamma words')));
    await pairedOut(d.doc, 'old place');
    await undoesAll(d, xml0, 'old place');
  });

  it('a range wholly in the deletion goes with it', async () => {
    const {d, t} = await open(THREE);
    t.command(() => deleteSelection(d, sel(d, 'New places',
      'gamma words', {tail: true})));
    const x = await main(d.doc);
    assert.ok(!x.includes('w:id="106"'), 'range 106 gone whole');
    await pairedOut(d.doc, 'whole');
  });

  it('across paragraphs: one half of each of two moves taken',
    async () => {
      const {d, t} = await open(THREE);
      const xml0 = await main(d.doc);
      const ps = paras(d.doc);
      const a = ps[2], b = ps[3];
      const i = plain(a).indexOf('gamma');
      const j = plain(b).indexOf('alpha') + 2;
      t.command(() => deleteSelection(d, S.select(
        {id: a.id, off: offOf(a, i) - 1}, {id: b.id,
          off: offOf(b, j)})));
      await pairedOut(d.doc, 'across');
      await undoesAll(d, xml0, 'across');
    });

  it('Track Changes on: the new place is refused or tagged, never ' +
    'unpaired', async () => {
    const {d, t} = await open(THREE);
    setTracking(d, t, true);
    assert.throws(() => t.command(() => deleteSelection(d,
      sel(d, 'New places', 'gamma words'))),
    /Moved text cannot be deleted/);
    t.command(() => deleteSelection(d, sel(d, 'New places',
      ' / ')));
    await pairedOut(d.doc, 'tracking on');
  });

  it('Track Changes on: one\'s own insertion holding a range start ' +
    'removed for real keeps the pair', async () => {
    const {d, t} = await open(
      p(r('Lead ') + ins(7, r('own ') + '<w:moveFromRangeStart ' +
        att(201) + ' w:name="m"/>' + r('text'), 'Me') + r(' tail') +
        '<w:moveFromRangeEnd w:id="201"/>'));
    setTracking(d, t, true);
    const xml0 = await main(d.doc);
    t.command(() => deleteSelection(d, sel(d, 'Lead', 'own text')));
    assert.ok(!plain(paras(d.doc)[0]).includes('own'));
    await pairedOut(d.doc, 'own insertion');
    await undoesAll(d, xml0, 'own insertion');
  });

  it('Accept and Reject of a move keep the marks paired', async () => {
    for (const fn of [accept, reject]) {
      for (const where of ['New places', 'C old']) {
        const {d, t} = await open(THREE);
        t.command(() => fn(d, t, at(d, where, 'gamma')));
        await pairedOut(d.doc, fn.name + ' at ' + where);
      }
    }
    for (const fn of [acceptAll, rejectAll]) {
      const {d, t} = await open(THREE);
      fn(d, t);
      await pairedOut(d.doc, fn.name);
    }
  });

  for (const fn of [accept, reject]) {
    it(fn.name + ' of a revision holding one half of a move range, ' +
      'a bookmark and a permission range keeps each pair', async () => {
      // (starts inside a revision, their ends after it)
      const starts = (m, b, q) => '<w:moveToRangeStart ' + att(m) +
        ' w:name="m"/>' + bmS(b) + permS(q);
      const ends = (m, b, q) => `<w:moveToRangeEnd w:id="${m}"/>` +
        bmE(b) + permE(q);
      const body = p(r('Lead ') +
        ins(7, r('new ') + starts(301, 5, 9) + r('words'), 'Al') +
        r(' and ') +
        del(8, dr('old ') + starts(302, 6, 10) + dr('text'), 'Al') +
        r(' tail') + ends(301, 5, 9) + ends(302, 6, 10)) +
        p(r('Old: ') + mvFrom(11, 'words', 'm', 300));
      const {d, t} = await open(body);
      const xml0 = await main(d.doc);
      t.command(() => fn(d, t, at(d, 'Lead', 'new')));
      t.command(() => fn(d, t, at(d, 'Lead', 'old')));
      const left = plain(paras(d.doc)[0]);
      assert.ok(fn === accept ? !left.includes('old')
        : !left.includes('new'), left);
      await pairedOut(d.doc, fn.name + ' revision');
      await undoesAll(d, xml0, fn.name + ' revision');
    });
  }

  it('Cut of a move\'s new place with its range start keeps the ' +
    'pair', async () => {
    const {d, t} = await open(THREE);
    const xml0 = await main(d.doc);
    t.command(() => cutSelection(d, sel(d, 'New places',
      'gamma words')));
    await pairedOut(d.doc, 'cut');
    await undoesAll(d, xml0, 'cut');
  });

  it('Backspace and Delete next to a move range mark step over it: ' +
    'never deleted alone', async () => {
    const body = p(r('ab') + mvTo(6, 'cd', 'm', 5) + r('ef')) +
      p(r('Old: ') + mvFrom(7, 'cd', 'm', 4));
    for (const [key, off] of [[deleteForward, 2], [deleteBack, 6]]) {
      const {d, t} = await open(body);
      const b = paras(d.doc)[0];
      assert.equal(b.text, 'ab' + OBJ + 'cd' + OBJ + 'ef');
      t.command(() => key(d, S.caret({id: b.id, off})));
      const now = paras(d.doc)[0].text;
      assert.equal(now.split(OBJ).length, 3, key.name + ': ' + now);
      await pairedOut(d.doc, key.name);
    }
  });

  it('a range mark between paragraphs (a block of its own, as Word ' +
    'writes a move of whole paragraphs) is kept by a deletion over ' +
    'it', async () => {
    const body = '<w:moveToRangeStart ' + att(401) + ' w:name="w"/>' +
      bmS(3) + p(`<w:moveTo ${att(12)}>${run('Moved paragraph.')}` +
      '</w:moveTo>') + '<w:moveToRangeEnd w:id="401"/>' + bmE(3) +
      p(r('After it.')) + p(r('Old: ') + mvFrom(13, 'Moved paragraph.',
        'w', 400));
    const {d, t} = await open(body);
    const xml0 = await main(d.doc);
    const [a, b] = paras(d.doc);
    t.command(() => deleteSelection(d, S.select({id: a.id, off: 3},
      {id: b.id, off: 2})));
    await pairedOut(d.doc, 'block marks');
    await undoesAll(d, xml0, 'block marks');
  });

  it('the tc-2 steps: accept move B, delete move C\'s new place, ' +
    'all paired', async () => {
    const {d, t} = await open(THREE);
    t.command(() => accept(d, t, at(d, 'New places', 'beta')));
    t.command(() => deleteSelection(d, sel(d, 'New places',
      'gamma words')));
    await pairedOut(d.doc, 'tc-2');
  });
});

// --------------------------------------------- marks in and by tables

const tc = (x) => '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>' +
  `</w:tcPr>${x}</w:tc>`;
const tr = (...cs) => `<w:tr>${cs.map(tc).join('')}</w:tr>`;
const tbl = (...rows) => '<w:tbl><w:tblPr><w:tblW w:w="0" ' +
  'w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/>' +
  `<w:gridCol w:w="2000"/></w:tblGrid>${rows.join('')}</w:tbl>`;

/** The range kinds tried: a mark pair maker each. */
const KINDS = {
  bookmark: [bmS, bmE],
  moveTo: [(id) => '<w:moveToRangeStart ' + att(id) + ' w:name="q"/>',
    (id) => `<w:moveToRangeEnd w:id="${id}"/>`],
  perm: [permS, permE]};

/** The paragraph whose text starts with start. */
const pb = (d, start) => paras(d.doc).find((x) =>
  plain(x).startsWith(start));
const span = (d, a, x, b, y) => S.select({id: pb(d, a).id, off: x},
  {id: pb(d, b).id, off: y});
const caretIn = (d, a) => S.caret({id: pb(d, a).id, off: 1});

/**
 * Each case: [name, body(S, E) with a range of id 71 whose start or
 * end is a block of its own (between paragraphs, maybe in a cell),
 * act(d, t)]: the act removes that block but not its partner.
 */
const CASES = [
  ['a range from a cell into the paragraph after the table, taking ' +
    'a start block', (S, E) => tbl(tr(p(r('cellA text')),
    p(r('cellB')))) + S(71) + p(r('Moved para.')) + E(71) +
    p(r('After here')),
  (d, t) => t.command(() => deleteSelection(d,
    span(d, 'cellA', 2, 'Moved', 2)))],
  ['a range from a paragraph into a cell, taking an end block',
    (S, E) => S(71) + p(r('Moved para.')) + E(71) +
    tbl(tr(p(r('cellA text')), p(r('cellB')))) + p(r('After')),
    (d, t) => t.command(() => deleteSelection(d,
      span(d, 'Moved', 2, 'cellA', 2)))],
  ['Delete Columns on a column whose cell holds a start block',
    (S, E) => p(r('x')) + tbl(tr(p(r('c1')) + S(71) + p(r('mv')),
      p(r('c2') + E(71)))) + p(r('y')),
    (d, t) => t.command(() => deleteColsCmd(d, caretIn(d, 'c1')))],
  ['Delete Columns on a column whose cell holds an end block',
    (S, E) => p(r('x')) + tbl(tr(p(S(71) + r('c1')),
      p(r('c2')) + E(71) + p(r('c2b')))) + p(r('y')),
    (d, t) => t.command(() => deleteColsCmd(d, caretIn(d, 'c2')))],
  ['a selection in a cell over a start block',
    (S, E) => p(r('x')) + tbl(tr(p(r('c1')) + S(71) + p(r('mv')),
      p(r('c2') + E(71)))) + p(r('y')),
    (d, t) => t.command(() => deleteSelection(d,
      span(d, 'c1', 1, 'mv', 1)))],
  ['a selection in a cell over an end block',
    (S, E) => p(r('x')) + tbl(tr(p(S(71) + r('c1')),
      p(r('mv')) + E(71) + p(r('c2b')))) + p(r('y')),
    (d, t) => t.command(() => deleteSelection(d,
      span(d, 'mv', 1, 'c2b', 1)))],
  ['Delete Rows on a row whose cell holds a start block',
    (S, E) => tbl(tr(p(r('c1')) + S(71) + p(r('c1b')), p(r('c2'))),
      tr(p(r('d1') + E(71)), p(r('d2')))) + p(r('y')),
    (d, t) => t.command(() => deleteRowsCmd(d, caretIn(d, 'c1b')))],
  ['Delete Rows on a row whose cell holds an end block',
    (S, E) => tbl(tr(p(S(71) + r('c1')), p(r('c2'))),
      tr(p(r('d1')) + E(71) + p(r('d1b')), p(r('d2')))) + p(r('y')),
    (d, t) => t.command(() => deleteRowsCmd(d, caretIn(d, 'd1b')))],
  ['Delete Rows on a row whose cell holds a nested table with a ' +
    'start between its rows',
  (S, E) => tbl(tr(p(r('c1')) + tbl(tr(p(r('n1')), p(r('n2'))), S(71),
    tr(p(r('n3')), p(r('n4')))) + p(r('c1b')), p(r('c2'))),
  tr(p(r('d1') + E(71)), p(r('d2')))) + p(r('y')),
  (d, t) => t.command(() => deleteRowsCmd(d, caretIn(d, 'c1b')))],
  ['cells cleared over a nested table with a start between its rows',
    (S, E) => tbl(tr(p(r('c1')) + tbl(tr(p(r('n1')), p(r('n2'))),
      S(71), tr(p(r('n3')), p(r('n4')))) + p(r('c1b')), p(r('c2'))),
    tr(p(r('d1') + E(71)), p(r('d2')))) + p(r('y')),
    (d, t) => t.command(() => deleteSelection(d,
      span(d, 'c1', 0, 'c2', 2)))],
  ['a range from a cell to after the table, its row holding a ' +
    'nested table with a start between its rows',
  (S, E) => p(r('x')) + tbl(tr(p(r('c1')),
    tbl(tr(p(r('n1')), p(r('n2'))), S(71), tr(p(r('n3')),
      p(r('n4')))) + p(r('c2b')))) + p(r('After here') + E(71)),
  (d, t) => t.command(() => deleteSelection(d,
    span(d, 'c1', 1, 'After', 2)))],
  ['cells cleared over a start block',
    (S, E) => tbl(tr(p(r('c1')) + S(71) + p(r('c1b')), p(r('c2'))),
      tr(p(r('d1') + E(71)), p(r('d2')))) + p(r('y')),
    (d, t) => t.command(() => deleteSelection(d,
      span(d, 'c1', 0, 'c2', 2)))],
  ['cells cleared over an end block',
    (S, E) => tbl(tr(p(S(71) + r('c1')), p(r('c2'))),
      tr(p(r('d1')) + E(71) + p(r('d1b')), p(r('d2')))) + p(r('y')),
    (d, t) => t.command(() => deleteSelection(d,
      span(d, 'd1', 0, 'd2', 2)))],
  ['a table pasted over cells holding a start block (overwrite)',
    (S, E) => tbl(tr(p(r('c1')) + S(71) + p(r('c1b')), p(r('c2'))),
      tr(p(r('d1') + E(71)), p(r('d2')))) + p(r('y')),
    (d, t) => {
      const tb = d.doc.sections[0].blocks[0];
      const sl = slice(d.doc, S.select({id: tb.id, off: 0},
        {id: tb.id, off: 1}));
      const blocks = sl.blocks.filter((b) => b.type === 'tbl')
        .map((b) => ({...b, rows: b.rows.slice(1)}));
      t.command(() => pasteBlocks(d, span(d, 'c1', 0, 'c2', 2), blocks,
        {sameDoc: true, styleNames: sl.styleNames, lists: sl.lists,
          pics: sl.pics, picScope: sl.picScope, styles: sl.styles}));
    }],
  ['Cut of a range from the body over a body-level end block',
    (S, E) => p(S(71) + r('Whole text')) + E(71) + p(r('After')),
    (d, t) => t.command(() => cutSelection(d,
      span(d, 'Whole', 3, 'After', 2)))],
];

describe('range marks that are blocks of their own, by the table ' +
  'commands', () => {
  for (const [name, body, act] of CASES) {
    for (const [kind, [S, E]] of Object.entries(KINDS)) {
      it(name + ' (' + kind + '): the other half stays paired',
        async () => {
          const {d, t} = await open(body(S, E));
          const xml0 = await main(d.doc);
          assert.deepEqual(unpaired(xml0), []);
          act(d, t);
          assert.notEqual(await main(d.doc), xml0, 'changed');
          await pairedOut(d.doc, name);
          await undoesAll(d, xml0, name);
        });
    }
  }
});
