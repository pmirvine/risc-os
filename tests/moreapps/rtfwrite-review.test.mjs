// RtfWrite (Batch G2, task 9): comments, tracked changes and the
// list of what RTF cannot hold (lost). The reader (./RtfRead with
// RtfComments, RtfRevs) is the authority on the shapes: RTF -> Doc
// -> RTF -> Doc gives the same modelCore and reviewCore
// (./rtf-helpers.mjs), and the second RTF is the first, byte for
// byte. Fixture: rtf-fixtures/19-spec-word-review.rtf.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {LOST} from '../../tools/moreapps/!Letters/RtfLost';
import {dttmOf} from '../../tools/moreapps/!Letters/RtfWriteReview';
import {dttm} from '../../tools/moreapps/!Letters/RtfRevs';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara, OBJ} from '../../tools/moreapps/!Letters/Model';
import {el} from '../../tools/moreapps/!WimpLib/Xml';
import {modelCore, assertSameCore, reviewCore, notesCore}
  from './rtf-helpers.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {commentDoc, range} from './comment-fixtures.mjs';
import {noteDoc, mark, noteP} from './note-fixtures.mjs';

const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const FIX = path.join(import.meta.dirname, 'rtf-fixtures',
  '19-spec-word-review.rtf');
const ascii = (b) => Buffer.from(b).toString('latin1');
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const R = (bytes) => readRtf(bytes, {date: DATE}).doc;
const W = (doc) => {
  const x = writeRtf(doc);
  return {...x, s: ascii(x.bytes)};
};
const doc0 = (body, head = '') => '{\\rtf1\\ansi\\deff0{\\fonttbl' +
  '{\\f0 Times;}}' + head + body + '}';

/** DTTM by its fields (the RTF spec's bit layout), as a signed
 *  32-bit number: written independently of the writer. */
function wantDttm(y, mo, d, h, mi) {
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return (mi | (h << 6) | (d << 11) | (mo << 16) | ((y - 1900) << 20) |
    (wd << 29)) | 0;
}

function balanced(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === '{') depth++;
    if (s[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

const isAscii = (b) => b.every((c) => c < 0x80);

/** RTF -> Doc -> RTF -> Doc: equal cores; the RTFs byte-identical
 *  (stability). Returns the two Docs and the first RTF. */
function roundTrip(doc1, what) {
  const a = W(doc1);
  assert.ok(isAscii(a.bytes) && balanced(a.s), what);
  const doc2 = R(a.bytes);
  assertSameCore(modelCore(doc2), modelCore(doc1), what);
  assert.deepEqual(reviewCore(doc2), reviewCore(doc1), what);
  assert.deepEqual(notesCore(doc2), notesCore(doc1), what);
  const b = W(doc2);
  assert.equal(b.s, a.s, what + ': stable');
  return {doc1, doc2, a};
}

describe('RtfWrite: the lost strings (the Save as box shows them)',
  () => {
    it('are exactly these', () => {
      assert.deepEqual({...LOST}, {
        unknown: 'items of an unknown kind',
        tables: 'tables',
        pictures: 'pictures',
        drawings: 'drawings',
        textBoxes: 'text boxes',
        objects: 'embedded objects',
        equations: 'equations',
        links: 'links',
        fields: 'fields of other kinds',
        bookmarks: 'bookmarks',
        controls: 'content controls',
        symbols: 'symbols',
        lists: 'list numbers',
        notes: 'footnotes and endnotes',
        comments: 'comments',
        revisions: 'tracked changes',
        stories: 'headers and footers',
        damaged: 'damaged items',
        crops: 'picture cropping',
        positions: 'picture positions',
        tableStyles: 'table style formatting',
        diagonals: 'diagonal cell borders',
        columns: 'uneven columns',
        lineNumbers: 'line numbers',
        listLevels: 'list level settings',
        nested: 'nested fields',
        other: 'other items',
      });
      assert.ok(Object.isFrozen(LOST));
    });
  });

const NS = ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/' +
  '2006/wordprocessingDrawing" xmlns:wps="http://schemas.microsoft' +
  '.com/office/word/2010/wordprocessingShape" xmlns:mc="http://' +
  'schemas.openxmlformats.org/markup-compatibility/2006" xmlns:v=' +
  '"urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-' +
  'com:office:office" xmlns:m="http://schemas.openxmlformats.org/' +
  'officeDocument/2006/math" xmlns:a="http://schemas.openxmlformats' +
  '.org/drawingml/2006/main"';
const BOX = '<w:r><mc:AlternateContent><mc:Choice Requires="wps">' +
  '<w:drawing><wp:anchor><wp:extent cx="1" cy="1"/><a:graphic>' +
  '<a:graphicData><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>' +
  'in box</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>' +
  '</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>' +
  '<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent><w:p>' +
  '<w:r><w:t>in box</w:t></w:r></w:p></w:txbxContent></v:textbox>' +
  '</v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>';
const SHAPES = [
  ['text box', BOX, LOST.textBoxes, 'before  after'],
  ['drawing', '<w:r><w:pict><v:line from="0,0" to="1,1"/></w:pict>' +
    '</w:r>', LOST.drawings, 'before  after'],
  ['content control', '<w:sdt><w:sdtPr/><w:sdtContent><w:r><w:t>cc' +
    '</w:t></w:r></w:sdtContent></w:sdt>', LOST.controls,
  'before cc after'],
  ['embedded object', '<w:r><w:object><v:shape/><o:OLEObject ' +
    'ProgID="Excel"/></w:object></w:r>', LOST.objects, 'before  after'],
  ['equation', '<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>',
    LOST.equations, 'before  after'],
  ['equation paragraph', '<m:oMathPara><m:oMath><m:r><m:t>y</m:t>' +
    '</m:r></m:oMath></m:oMathPara>', LOST.equations, 'before  after'],
  ['unknown raw inline', '<w:foo/>', LOST.other, 'before  after'],
  ['unknown run child', '<w:r><w:foo/></w:r>', LOST.other,
    'before  after'],
];
const shapeDoc = async (x) => readDocx(await buildDocx({
  'word/document.xml': documentXml(p(r('before ') + x + r(' after')),
    {rootAttrs: NS})}));

describe('RtfWrite: every kind left out is counted once', () => {
  for (const [what, xml, lost, text] of SHAPES) {
    it(what + ' (from a .docx) reports "' + lost + '" once and keeps ' +
      'the text around it', async () => {
      const d = await shapeDoc(xml);
      const {lost: got, bytes} = writeRtf(d);
      assert.deepEqual(got, [{what: lost, count: 1}]);
      assert.equal(R(bytes).sections[0].blocks[0].text, text);
    });
  }

  it('a wrapper kept whole (smart tag, unsplittable run) counts what ' +
    'it holds', () => {
    const tag = el('w:smartTag', null, el('w:r', null,
      el('w:drawing', null, el('wps:txbx'))));
    const run = el('w:r', [['w:foo', '1']], el('w:object'));
    const pa = newPara('a' + OBJ + 'b' + OBJ + 'c', {inlines: {
      1: {kind: 'raw', level: 'p', node: tag, text: ''},
      3: {kind: 'raw', level: 'p', node: run, text: ''}}});
    const d = newDoc({date: DATE});
    d.sections[0].blocks = [pa];
    assert.deepEqual(W(d).lost, [{what: LOST.textBoxes, count: 1},
      {what: LOST.objects, count: 1}]);
  });

  it('an inline of an unknown kind is counted', () => {
    const d = newDoc({date: DATE});
    const pa = newPara('a' + OBJ, {inlines: {1: {kind: 'tab'}}});
    // (not a valid Doc: the writer still counts it)
    d.sections[0].blocks = [{...pa, inlines: {1: {kind: 'weird',
      level: 'r'}}}];
    assert.deepEqual(W(d).lost, [{what: LOST.other, count: 1}]);
  });
});

describe('RtfWrite: tracked changes', () => {
  const A = wantDttm(2024, 5, 6, 7, 8);
  const B = wantDttm(2025, 12, 31, 23, 59);

  it('insertion and deletion by two authors with dates: exact words, ' +
    '\\revtbl, read back equal and stable', () => {
    const s = doc0('\\pard\\plain Kept {\\revised\\revauth1' +
      '\\revdttm' + A +
      ' inserted }{\\deleted\\revauthdel2\\revdttmdel' + B +
      ' removed }text.\\par', '{\\*\\revtbl {Unknown;}{Alice Author;}' +
      '{Bob Builder;}}');
    const {a, doc2} = roundTrip(R(enc(s)), 'revisions');
    assert.ok(a.s.includes('{\\*\\revtbl {Unknown;}{Alice Author;}' +
      '{Bob Builder;}}\n'), a.s);
    assert.ok(a.s.includes('\\revised\\revauth1\\revdttm' + A +
      ' inserted }'), a.s);
    assert.ok(a.s.includes('\\deleted\\revauthdel2\\revdttmdel' + B +
      ' removed }'), a.s);
    assert.deepEqual(a.lost, []);
    assert.deepEqual(reviewCore(doc2).revs, [
      ['inserted ', 'ins', 'Alice Author', '2024-05-06T07:08:00Z'],
      ['removed ', 'del', 'Bob Builder', '2025-12-31T23:59:00Z']]);
  });

  it('from a .docx: dates to the minute, moves as insertion and ' +
    'deletion, no author or date where none', async () => {
    const ins = (id, attrs, t) => `<w:ins w:id="${id}"${attrs}>` +
      r(t) + '</w:ins>';
    const del = (id, attrs, t) => `<w:del w:id="${id}"${attrs}>` +
      `<w:r><w:delText xml:space="preserve">${t}</w:delText></w:r>` +
      '</w:del>';
    const d = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('a ') + ins(1, ' w:author="Al" w:date=' +
        '"2024-05-06T07:08:59Z"', 'new ') + del(2, ' w:author="Bo"',
        'old ') + ins(3, '', 'anon ') + del(4, ' w:date="bad"', 'x ') +
        '<w:moveFrom w:id="5" w:author="Al"><w:r><w:t>moved</w:t>' +
        '</w:r></w:moveFrom>' + r(' b ') + '<w:moveTo w:id="6" ' +
        'w:author="Al"><w:r><w:t>moved</w:t></w:r></w:moveTo>'))}));
    const {s, lost, bytes} = W(d);
    assert.deepEqual(lost, []);
    assert.ok(s.includes('{\\*\\revtbl {Unknown;}{Al;}{Bo;}}'), s);
    assert.deepEqual(reviewCore(R(bytes)).revs, [
      ['new ', 'ins', 'Al', '2024-05-06T07:08:00Z'],
      ['old ', 'del', 'Bo', null], ['anon ', 'ins', null, null],
      ['x ', 'del', null, null], ['moved', 'del', 'Al', null],
      ['moved', 'ins', 'Al', null]]);
  });

  it('deleted text is never live text: in the body, a note and a ' +
    'comment', async () => {
    const rev = {id: 1, kind: 'del', author: 'A', attrs: [],
      extra: []};
    const gone = () => newPara('keep gone', {runs: [
      {start: 0, end: 5, rPr: {extra: []}},
      {start: 5, end: 9, rPr: {extra: []}, rev}]});
    const d = await noteDoc(p(r('body') + mark(1)),
      {1: noteP('note')});
    d.sections[0].blocks.push(gone());
    d.notes.footnotes.get(1).blocks = [gone()];
    const c = await commentDoc(p(range(0, r('x'))), {0: 'c'});
    c.comments.map.get(0).blocks = [gone()];
    for (const [doc, count] of [[d, 2], [c, 1]]) {
      const {s, lost} = W(doc);
      assert.deepEqual(lost, []);
      // every 'gone' is in a run group with \deleted
      let n = 0;
      for (let at = s.indexOf('gone'); at >= 0;
        at = s.indexOf('gone', at + 1)) {
        n++;
        const group = s.slice(s.lastIndexOf('{', at), at);
        assert.ok(group.includes('\\deleted'), group);
      }
      assert.equal(n, count, s);
    }
    const back = R(W(d).bytes);
    const q = back.sections[0].blocks.find((b) =>
      b.text === 'keep gone');
    assert.equal(q.runs.find((x) => x.start === 5).rev.kind, 'del');
    assert.equal(notesCore(back).footnotes[0][0].text.split(OBJ)
      .join(''), 'keep ');
    assert.equal(reviewCore(R(W(c).bytes)).comments[0].text, 'keep ');
  });

  it('dates: the reader\'s DTTM gives the date back to the minute ' +
    '(1900..2100, leap days, Word\'s weekday)', () => {
    const z = (n, w = 2) => String(n).padStart(w, '0');
    for (let t = Date.UTC(1900, 0, 1); t < Date.UTC(2101, 0, 1);
      t += 86400000 * 37 + 3600000 * 5 + 60000 * 7) {
      const d = new Date(t);
      const iso = z(d.getUTCFullYear(), 4) + '-' +
        z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()) + 'T' +
        z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
      assert.equal(dttmOf(iso + ':42Z'), wantDttm(d.getUTCFullYear(),
        d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(),
        d.getUTCMinutes()), iso);
      assert.equal(dttm(dttmOf(iso + ':42Z')), iso + ':00Z');
    }
    assert.equal(dttm(dttmOf('2024-02-29T23:59:00Z')),
      '2024-02-29T23:59:00Z');
    for (const bad of ['2023-02-29T00:00Z', '2101-01-01T00:00Z',
      '1899-12-31T23:59Z', '2024-13-01', '2024-00-01', '2024-01-32',
      '2024-01-01T24:00Z', '2024-01-01T23:60Z', '2024-01-01 10:00',
      '2024-1-01', '20240101', '', 'x', null, 5]) {
      assert.equal(dttmOf(bad), undefined, String(bad));
    }
  });

  it('a paragraph mark\'s revision is written and read back', () => {
    const s = doc0('\\pard\\plain one{\\deleted\\revauthdel1' +
      '\\revdttmdel' +
      A + '\\par}\\pard\\plain two\\par\\pard\\plain three',
    '{\\*\\revtbl {Unknown;}{Alice;}}');
    const {a, doc2} = roundTrip(R(enc(s)), 'mark');
    assert.ok(a.s.includes('{\\deleted\\revauthdel1\\revdttmdel' + A +
      '\\par}'), a.s);
    assert.deepEqual(reviewCore(doc2).revs,
      [['\u00b6', 'del', 'Alice', '2024-05-06T07:08:00Z']]);
  });

  it('author names escaped; \';\' in the table replaced; bad dates ' +
    'left out', () => {
    const rev = (id, kind, author, date) => ({id, kind, author, date,
      attrs: [], extra: []});
    const d = newDoc({date: DATE});
    d.sections[0].blocks = [newPara('abcd', {runs: [
      {start: 0, end: 1, rPr: {extra: []},
        rev: rev(1, 'ins', 'A\\{b};c\u00e9',
          '2024-02-30T00:00:00Z')},
      {start: 1, end: 2, rPr: {extra: []},
        rev: rev(2, 'del', 'Unknown', '1899-12-31T00:00:00Z')},
      {start: 2, end: 3, rPr: {extra: []},
        rev: rev(3, 'ins', 'B', '2024-05-06')},
      {start: 3, end: 4, rPr: {extra: []},
        rev: rev(4, 'ins', 'B', 'nonsense')}]})];
    const {s, lost, bytes} = W(d);
    assert.deepEqual(lost, []);
    assert.ok(s.includes('{\\*\\revtbl {Unknown;}{A\\\\\\{b\\},c' +
      '\\u233?;}{B;}}'), s);
    assert.ok(s.includes('\\revised\\revauth1 a}'), s);
    assert.ok(s.includes('\\deleted\\revauthdel0 b}'), s);
    assert.ok(s.includes('\\revauth2\\revdttm' + wantDttm(2024, 5, 6,
      0, 0) + ' c}'), s);
    assert.ok(s.includes('\\revised\\revauth2 d}'), s);
    assert.deepEqual(reviewCore(R(bytes)).revs.map((x) => x[2]),
      ['A\\{b},c\u00e9', 'Unknown', 'B', 'B']);
  });
});

describe('RtfWrite: comments', () => {
  const A = wantDttm(2024, 5, 6, 7, 8);

  it('the fixture: comments, reply, ranges across runs and ' +
    'paragraphs, notes, revisions: equal and stable', () => {
    const d = R(new Uint8Array(fs.readFileSync(FIX)));
    const {a, doc2} = roundTrip(d, 'fixture 19');
    assert.deepEqual(a.lost, []);
    const c = reviewCore(doc2).comments;
    assert.deepEqual(c.map((x) => [x.author, x.initials, x.date,
      x.parent, x.text, x.range]), [
      ['Alice Author', 'AA', '2024-05-06T07:08:00Z', null,
        'First comment.', 'Commented bold words'],
      ['Bob Builder', 'BB', '2025-12-31T23:59:00Z', null,
        'Second comment.', 'a range that\ncrosses paragraphs'],
      ['Alice Author', 'AA', '2024-05-06T07:09:00Z', 1, 'A reply.',
        null]]);
  });

  it('exact shape: range marks, the mark in its run\'s format, the ' +
    'annotation with ref, date and parent', () => {
    const s = doc0('\\pard\\plain {\\*\\atrfstart 7}x{\\*\\atrfend 7}' +
      '{\\*\\atnid A\\{}{\\*\\atnauthor Al\\\\i}{\\b \\chatn }' +
      '{\\*\\annotation {\\*\\atnref 7}{\\*\\atndate ' + A + '}\\pard' +
      '\\plain {\\chatn }One.\\par}' +
      '{\\*\\atnid B}{\\*\\atnauthor Bo}\\chatn {\\*\\annotation ' +
      '{\\*\\atnref 9}{\\*\\atnparent 7}\\pard\\plain Two.\\par}.');
    const {a} = roundTrip(R(enc(s)), 'shape');
    assert.ok(a.s.includes('{\\*\\atrfstart 0}'), a.s);
    assert.ok(a.s.includes('{\\*\\atrfend 0}'), a.s);
    assert.ok(a.s.includes('{\\*\\atnid A\\{}' +
      '{\\*\\atnauthor Al\\\\i}\\chatn {\\*\\annotation ' +
      '{\\*\\atnref 0}{\\*\\atndate ' + A + '}\n'), a.s);
    assert.ok(a.s.includes('{\\*\\atnid B}{\\*\\atnauthor Bo}\\chatn ' +
      '{\\*\\annotation {\\*\\atnref 1}{\\*\\atnparent 0}\n'), a.s);
  });

  it('ids are fresh sequential numbers; done is not kept (not ' +
    'counted)', async () => {
    const d = await commentDoc(p(range(57, r('first'))) +
      p(range(3, r('second')) + range(12, r('third'))),
    {57: {text: 'c57', author: 'Ann'}, 3: {text: 'c3', author: 'Bob',
      done: true}, 12: {text: 'r12', author: 'Cy', parent: 3}});
    const {s, lost, bytes} = W(d);
    assert.deepEqual(lost, []);
    for (const n of [0, 1, 2]) {
      assert.ok(s.includes('{\\*\\atrfstart ' + n + '}'), s);
      assert.ok(s.includes('{\\*\\atnref ' + n + '}'), s);
    }
    assert.ok(!s.includes('atrfstart 57'), s);
    assert.ok(s.includes('{\\*\\atnparent 1}'), s);
    const back = R(bytes);
    assert.deepEqual(reviewCore(back).comments.map((x) => [x.author,
      x.initials, x.parent, x.text, x.range]), [
      ['Ann', 'A', null, 'c57', 'first'],
      ['Bob', 'B', null, 'c3', 'second'],
      ['Cy', 'C', 1, 'r12', 'third']]);
    roundTrip(back, 'from docx');
  });

  it('a comment with no mark in the body is counted', async () => {
    const d = await commentDoc(p(r('text') + range(1, r('x'))),
      {1: 'kept', 2: 'nowhere'});
    assert.deepEqual(W(d).lost, [{what: LOST.comments, count: 1}]);
  });

  it('a comment inside a deletion keeps its text; the mark is ' +
    'deleted', () => {
    const s = doc0('\\pard\\plain a {\\deleted\\revauthdel1 gone' +
      '{\\*\\atnid X}{\\*\\atnauthor Y}\\chatn ' +
      '{\\*\\annotation \\pard' +
      '\\plain hi\\par}}ok', '{\\*\\revtbl {Unknown;}{Del;}}');
    const {doc2} = roundTrip(R(enc(s)), 'in deletion');
    const rc = reviewCore(doc2);
    assert.equal(rc.comments[0].text, 'hi');
    assert.deepEqual(rc.revs, [['gone', 'del', 'Del', null]]);
  });

  it('odd review data never throws; output ASCII, balanced; the doc ' +
    'is not changed', () => {
    const d = newDoc({date: DATE});
    const odd = {...newPara('abcdef'),
      text: 'a' + OBJ + 'b' + OBJ + 'c' + OBJ,
      inlines: {1: {kind: 'cmtStart', level: 'p', id: 5},
        3: {kind: 'cmtRef', level: 'r', id: 5},
        5: {kind: 'cmtEnd', level: 'p', id: 99}}};
    // (not a valid tag: the writer still must not throw)
    d.sections[0].blocks = [{...odd, runs: [{start: 0, end: 6,
      rPr: {extra: []}, rev: {id: 1, kind: 'del', author: 7, date: {},
        attrs: [], extra: []}}], pPr: {extra: [el('w:rPr', null,
      el('w:ins', [['w:author', '{;}']]))]}}];
    d.comments = {map: new Map([[5, {id: 5, author: null,
      initials: undefined, date: 3, blocks: [null, newPara('t')],
      parent: 5, done: 'x'}]]), order: [5]};
    const before = structuredClone(d);
    const {s, bytes} = W(d);
    assert.ok(isAscii(bytes) && balanced(s), s);
    assert.deepEqual(d, before);
    assert.equal(W(d).s, s);
  });
});
