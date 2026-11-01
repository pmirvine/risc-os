// The text of a move, in the element Word writes it in (Batch F2):
// w:t in an insertion and in both places of a move, w:delText only
// in a deletion. Word will not open a document whose w:moveFrom
// holds w:delText (tried in real Word); both corpus files written by
// Word with a move have w:t in w:moveFrom. So:
//   - a w:moveFrom holding w:t is read as a modelled move (the old
//     place: hidden in Final, shown in All Markup and Original) and
//     written back the same;
//   - one holding w:delText, a w:del holding w:t, a w:ins or
//     w:moveTo holding w:delText stay raw, exactly as read;
//   - the writer writes w:delText for a 'del' tag only, so a move
//     half made a deletion (./RevKeep), a tracked deletion
//     (./RevTrack) and Accept or Reject (./RevCmd) write the element
//     of the kind the text now has;
//   - the text-context.mjs guard: counts and the opened-file rule;
//   - on the corpus (when present): the two Word files with moves
//     round trip with every revision as read, and their move halves
//     modelled are counted.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {deleteSelection}
  from '../../tools/moreapps/!Letters/EditDel';
import {accept, reject} from '../../tools/moreapps/!Letters/RevCmd';
import {list} from '../../tools/moreapps/!Letters/RevMarks';
import {hiddenSpans} from '../../tools/moreapps/!Letters/Kinds';
import {textName} from '../../tools/moreapps/!Letters/RevWrite';
import {count as findCount} from '../../tools/moreapps/!Letters/Find';
import {count as wordCount}
  from '../../tools/moreapps/!Letters/WordCount';
import {paraPlain} from '../../tools/moreapps/!Letters/ClipSlice';
import {paraText} from '../../tools/moreapps/!Letters/HeadingOutline';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, settingsXml} from './build-docx.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {misplaced, newlyMisplaced, partsMisplaced}
  from './text-context.mjs';
import {revEls} from './rev-canon.mjs';
import {CORPUS, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {markBroken} from './word-emit.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const NOW = new Date(2025, 0, 2, 3, 4, 5);
const D = '2024-01-02T03:04:00Z';
const dec = new TextDecoder();
const att = (id, au = 'Bo') => `w:id="${id}" w:author="${au}" ` +
  `w:date="${D}"`;
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, tag = 'w:t') => `<w:r><${tag}${sp(t)}>${t}</${tag}>` +
  '</w:r>';
const el = (name, id, inner) => `<w:${name} ${att(id)}>${inner}` +
  `</w:${name}>`;
const para = (inner) => `<w:p>${inner}</w:p>`;
const range = (side, id, name, inner) =>
  `<w:move${side}RangeStart w:id="${id}" w:name="${name}" ` +
  `w:author="Bo" w:date="${D}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
/** A move's old place (tag: the element its text is in). */
const mvFrom = (id, t, tag = 'w:t', name = 'move1', rid = 90) =>
  range('From', rid, name, el('moveFrom', id, run(t, tag)));
const mvTo = (id, t, tag = 'w:t', name = 'move1', rid = 91) =>
  range('To', rid, name, el('moveTo', id, run(t, tag)));
/** Word's shape: the move's text is w:t in both places. */
const MOVE = para(run('Start ') + mvFrom(1, 'moved') + run(' end.')) +
  para(run('Here: ') + mvTo(2, 'moved'));
const TRACK = '<w:zoom w:percent="100"/><w:trackRevisions/>' +
  '<w:defaultTabStop w:val="720"/>';

const bytesOf = (body, settings) => buildDocx({
  'word/document.xml': documentXml(body),
  ...(settings ? {'word/settings.xml': settingsXml(settings)} : {})});
const docOf = async (body, settings, opts) => readDocx(
  await bytesOf(body, settings), opts);
const write = (doc) => writeDocx(doc, {date: DATE});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const tags = (p) => p.runs.map((r) => (r.rev ? r.rev.kind + r.rev.id
  : '-'));
const rawNames = (p) => Object.values(p.inlines).filter((x) =>
  x.kind === 'raw').map((x) => x.node.name);
const mainXml = async (bytes) => dec.decode((await readZip(bytes))
  .get('word/document.xml'));
/** The run text elements written inside each revision element of
 *  xml: ['moveFrom:t', 'del:delText', ...] in order. */
const REV = /<w:(ins|del|moveFrom|moveTo)\b[^>/]*>([\s\S]*?)<\/w:\1>/g;
const TXT = /<w:(t|delText)[ >]/g;
const inside = (xml) => [...xml.matchAll(REV)].flatMap((m) =>
  [...m[2].matchAll(TXT)].map((q) => m[1] + ':' + q[1]));
const sel = (p, a, b) => S.select({id: p.id, off: a}, {id: p.id,
  off: b});
const car = (p, off) => S.caret({id: p.id, off});

describe('move text: read', () => {
  it('a w:moveFrom holding w:t (as Word writes it) is a modelled ' +
    'move: tagged, written back the same, hidden in Final only',
  async () => {
    const bytes = await bytesOf(MOVE);
    const doc = await readDocx(bytes);
    const [p, q] = blocks(doc);
    assert.deepEqual(rawNames(p).filter((n) => /:moveFrom$/.test(n)),
      [], 'no raw w:moveFrom');
    assert.ok(tags(p).includes('mvFrom1'), JSON.stringify(tags(p)));
    assert.ok(tags(q).includes('mvTo2'), JSON.stringify(tags(q)));
    assert.deepEqual(list(doc).map((e) => [e.kind, e.id, e.text,
      e.move]), [['mvFrom', 1, 'moved', 2], ['mvTo', 2, 'moved', 1]]);
    const k = p.text.indexOf('moved');
    assert.deepEqual(hiddenSpans(p, 'final'), [[k, k + 5]]);
    assert.deepEqual(hiddenSpans(p, 'all'), []);
    assert.deepEqual(hiddenSpans(p, 'original'), []);
    assert.deepEqual(hiddenSpans(q, 'original').length, 1);
    const out = await write(doc);
    assert.deepEqual(revEls((await readZip(out))
      .get('word/document.xml')), revEls((await readZip(bytes))
      .get('word/document.xml')));
    assert.deepEqual(inside(await mainXml(out)), ['moveFrom:t',
      'moveTo:t']);
    assertSameDoc(await readDocx(out), expectedBack(doc));
  });

  it('text in the element Word does not write there keeps the ' +
    'revision raw, exactly as read: w:delText in w:moveFrom, ' +
    'w:moveTo or w:ins, w:t in w:del', async () => {
    for (const [what, inner] of [
      ['moveFrom/delText', mvFrom(1, 'gone', 'w:delText')],
      ['moveTo/delText', mvTo(2, 'come', 'w:delText')],
      ['ins/delText', el('ins', 3, run('new', 'w:delText'))],
      ['del/t', el('del', 4, run('old'))],
    ]) {
      const body = para(run('a ') + inner + run(' b'));
      const bytes = markBroken(await bytesOf(body), 'hostile: ' + what +
        ' (Word refuses delText outside a w:del, t inside one)');
      const doc = await readDocx(bytes);
      const p = blocks(doc)[0];
      assert.ok(p.runs.every((r) => !r.rev), what + ': not tagged');
      const name = 'w:' + what.split('/')[0];
      assert.ok(rawNames(p).includes(name), what + ': raw ' +
        JSON.stringify(rawNames(p)));
      const out = await write(doc);
      assert.equal(await mainXml(out), await mainXml(bytes),
        what + ': written as read');
    }
  });
});

describe('move text: a raw w:moveFrom', () => {
  it('its w:t text is left out of the paragraph, as a raw w:del\'s ' +
    'w:delText is: Find, the word count, plain text and headings',
  async () => {
    // nested as Word nests it (Tika-792): kept raw
    const nested = para(run('Head ') + el('moveFrom', 1, el('ins', 2,
      run('away'))) + run('line'));
    for (const [what, body, opts] of [
      ['switched off', MOVE, {revisionMarks: false}],
      ['nested', nested, undefined]]) {
      const doc = await docOf(body, undefined, opts);
      const p = blocks(doc)[0];
      assert.ok(rawNames(p).includes('w:moveFrom'), what);
      assert.equal(findCount(doc, 'moved'), what === 'nested' ? 0 : 1,
        what + ': Find sees the new place only');
      assert.equal(findCount(doc, 'away'), 0, what);
      assert.doesNotMatch(paraPlain(p), /moved|away/, what);
      assert.doesNotMatch(paraText(p), /moved|away/, what);
    }
    const n = await docOf(nested);
    assert.equal(wordCount(n).words, 2);
  });
});

describe('move text: written', () => {
  it('textName: w:delText for a deletion only', () => {
    const r = (kind) => ({rev: {id: 1, kind}});
    assert.deepEqual(['ins', 'del', 'mvFrom', 'mvTo'].map((k) =>
      textName(r(k))), ['w:t', 'w:delText', 'w:t', 'w:t']);
    assert.equal(textName({}), 'w:t');
    assert.equal(textName(null), 'w:t');
  });

  it('a move half losing its partner (./RevKeep) writes the ' +
    'element of its new kind', async () => {
    // the new place taken: the old place becomes a deletion
    const d = new Document(await docOf(MOVE));
    const q = blocks(d.doc)[1];
    const k = q.text.indexOf('moved');
    assert.ok(deleteSelection(d, sel(q, k, k + 5)));
    assert.deepEqual(list(d.doc).map((e) => e.kind), ['del']);
    const xml = await mainXml(await write(d.doc));
    assert.deepEqual(inside(xml), ['del:delText']);
    assert.deepEqual(misplaced(xml), {delText: 0, t: 0});
    // the old place taken: the new place becomes an insertion
    const e = new Document(await docOf(MOVE));
    const p = blocks(e.doc)[0];
    e.apply({op: 'replaceText', block: [0, 0],
      at: p.text.indexOf('moved'), del: 5, ins: ''});
    assert.deepEqual(list(e.doc).map((x) => x.kind), ['ins']);
    assert.deepEqual(inside(await mainXml(await write(e.doc))),
      ['ins:t']);
  });

  it('a tracked deletion (./RevTrack) beside a move writes ' +
    'w:delText for the deletion, w:t for the move', async () => {
    const d = new Document(await docOf(MOVE, TRACK));
    d.reviewer = () => ({name: 'Ann', now: NOW});
    const p = blocks(d.doc)[0];
    assert.ok(deleteSelection(d, sel(p, 0, 5)));
    assert.deepEqual(tags(blocks(d.doc)[0]).filter((t) => t !== '-')
      .map((t) => t.replace(/\d+$/, '')), ['del', 'mvFrom']);
    const xml = await mainXml(await write(d.doc));
    assert.deepEqual(inside(xml), ['del:delText', 'moveFrom:t',
      'moveTo:t']);
  });

  it('Accept and Reject write w:t for the text they keep', async () => {
    for (const [cmd, at] of [[accept, 0], [reject, 0], [reject, 1]]) {
      const d = new Document(await docOf(MOVE + para(run('x ') +
        el('del', 7, run('old', 'w:delText')))));
      d.markup = 'all';
      const p = blocks(d.doc)[at];
      cmd(d, null, car(p, p.text.indexOf('moved') + 1));
      const xml = await mainXml(await write(d.doc));
      assert.deepEqual(inside(xml), ['del:delText'], cmd.name + at);
      assert.deepEqual(misplaced(xml), {delText: 0, t: 0});
      // the deletion rejected: its text is plain w:t again
      const r = blocks(d.doc)[2];
      reject(d, null, car(r, r.text.indexOf('old') + 1));
      const x2 = await mainXml(await write(d.doc));
      assert.deepEqual(inside(x2), []);
      assert.match(x2, /old<\/w:t>/);
    }
  });
});

describe('move text: the text-context guard', () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/' +
    'wordprocessingml/2006/main"';
  const part = (body) => `<w:document ${W}><w:body>${body}` +
    '</w:body></w:document>';

  it('counts w:delText outside a w:del and w:t inside one, in its ' +
    'own paragraph, by namespace', () => {
    assert.deepEqual(misplaced(part(MOVE)), {delText: 0, t: 0});
    assert.deepEqual(misplaced(part(para(mvFrom(1, 'x',
      'w:delText')))), {delText: 1, t: 0});
    assert.deepEqual(misplaced(part(para(el('del', 1, run('x'))))),
      {delText: 0, t: 1});
    // nested as Word nests them (Tika-792): fine
    assert.deepEqual(misplaced(part(para(el('moveTo', 1, el('del', 2,
      run('x', 'w:delText'))) + el('moveFrom', 3, el('ins', 4,
      run('y')))))), {delText: 0, t: 0});
    // a paragraph inside a deleted run (a text box) is its own
    const box = '<w:r><w:drawing><w:txbxContent>' + para(run('in')) +
      '</w:txbxContent></w:drawing></w:r>';
    assert.deepEqual(misplaced(part(para(el('del', 1, box)))),
      {delText: 0, t: 0});
    // another prefix of the main namespace; another namespace's t
    const x = '<x:document xmlns:x="http://schemas.openxmlformats.' +
      'org/wordprocessingml/2006/main" xmlns:m="urn:m"><x:p><x:del>' +
      '<x:r><x:t>a</x:t></x:r><m:t>b</m:t></x:del><m:delText/>' +
      '</x:p></x:document>';
    assert.deepEqual(misplaced(x), {delText: 0, t: 1});
    // an empty w:del (a paragraph mark's) is no ancestor
    assert.deepEqual(misplaced(part('<w:p><w:pPr><w:rPr><w:del ' +
      'w:id="1"/></w:rPr></w:pPr>' + run('x') + '</w:p>')),
    {delText: 0, t: 0});
  });

  it('fails only what the saved file has more of than the opened',
    async () => {
      const bad = part(para(mvFrom(1, 'x', 'w:delText')));
      assert.deepEqual(newlyMisplaced(bad, bad), []);
      assert.deepEqual(newlyMisplaced(bad, null),
        ['delText outside w:del: 1 (was 0)']);
      assert.deepEqual(newlyMisplaced(part(para(el('del', 1,
        run('x')))), part('')), ['t inside w:del: 1 (was 0)']);
      const z = await readZip(markBroken(await bytesOf(para(mvFrom(1, 'x',
        'w:delText'))), 'hostile: w:delText in a w:moveFrom'));
      assert.deepEqual(partsMisplaced(z), ['word/document.xml: ' +
        'delText outside w:del: 1 (was 0)']);
      assert.deepEqual(partsMisplaced(z, z), []);
    });
});

// ------------------------------------------------------------ corpus

const WORD_MOVES = ['libreoffice/uiwriter/data/TC-table-DnD-move.docx',
  'poi/Tika-792.docx'];

describe('move text: the Word files with moves (corpus)', {
  skip: WORD_MOVES.every((f) => existsSync(join(CORPUS, f))) ? false
    : SKIP_CORPUS}, () => {
  it('saved with no edit: every revision as read, no text element ' +
    'out of place; the move halves modelled counted', async () => {
    const counts = {};
    for (const f of WORD_MOVES) {
      const bytes = readFileSync(join(CORPUS, f));
      const doc = await readDocx(bytes);
      const out = await write(doc);
      const z = await readZip(out), zin = await readZip(bytes);
      const main = doc.meta.mainPart;
      assert.deepEqual(revEls(z.get(main)), revEls(zin.get(main)),
        f + ': the revisions');
      assert.deepEqual(partsMisplaced(z, zin), [], f);
      assertSameDoc(await readDocx(out), expectedBack(doc), f);
      const c = {modelled: 0, raw: 0};
      const halves = new Set();
      forEachBlock(doc, (b) => {
        if (b.type !== 'p' || !Array.isArray(b.runs)) return;
        for (const r of b.runs) {
          if (r.rev && /^mv/.test(r.rev.kind)) halves.add(r.rev.id);
        }
        for (const x of Object.values(b.inlines)) {
          if (x.kind === 'raw' && /:move(From|To)$/.test(x.node.name))
            c.raw++;
        }
      });
      c.modelled = halves.size;
      counts[f] = c;
    }
    console.log('# Word move halves: ' + JSON.stringify(counts));
    // TC-table-DnD-move: four cells moved, each half plain w:t
    assert.deepEqual(counts[WORD_MOVES[0]], {modelled: 8, raw: 0});
    // Tika-792: each half holds a nested revision: raw
    assert.equal(counts[WORD_MOVES[1]].modelled, 0);
  });
});
