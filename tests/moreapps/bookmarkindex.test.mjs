// BookmarkIndex (Batch E3): every bookmark of a document with the
// text between its marks, found in the body, tables, headers,
// footers and notes; the first of a duplicate name wins; memoised
// per document state; hostile marks give nothing.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {of} from '../../tools/moreapps/!Letters/BookmarkIndex';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {buildDocx, documentXml, p, r}
  from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';

const S = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const E = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const TC = (inner) => '<w:tc><w:tcPr><w:tcW w:w="100" ' +
  `w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const TBL = (...cells) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  `w:w="100"/></w:tblGrid><w:tr>${cells.map(TC).join('')}</w:tr>` +
  '</w:tbl>';
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body)}));
const names = (ix) => ix.list.map((e) => e.name);

describe('byName', () => {
  it('finds names in body, table cells, nested tables, headers ' +
    'and notes', async () => {
    const body = p(S(1, 'inBody') + r('one') + E(1)) +
      TBL(p(S(2, 'inCell') + r('two') + E(2)),
        TBL(p(S(3, 'nested') + r('three') + E(3))) + p('')) +
      p(r('x') + mark(1)) + p('');
    const bytes = await withHeaders(body,
      {default: {hdr: p(S(4, 'inHdr') + r('head') + E(4)),
        ftr: p(S(5, 'inFtr') + r('foot') + E(5))}});
    const hd = await readDocx(bytes);
    let ix = of(hd);
    assert.deepEqual(names(ix), ['inBody', 'inCell', 'nested',
      'inHdr', 'inFtr']);
    assert.equal(ix.byName.get('inCell').plain, 'two');
    assert.equal(ix.byName.get('nested').plain, 'three');
    assert.equal(ix.byName.get('inHdr').story !== null, true);
    assert.equal(ix.byName.get('inBody').story, null);
    assert.equal(ix.byName.get('inBody').inNote, false);
    const nd = await noteDoc(p(r('a') + mark(1)), {
      1: noteP('see') .replace('</w:p>', S(7, 'inNote') +
        r('note text') + E(7) + '</w:p>')});
    ix = of(nd);
    const e = ix.byName.get('inNote');
    assert.ok(e && e.inNote && e.note.kind === 'footnote');
    assert.equal(e.plain, 'note text');
    assert.equal(e.story, null);
  });

  it('first of duplicate names wins; find ignores case', async () => {
    const d = await read(p(S(1, 'Dup') + r('first') + E(1)) +
      p(S(2, 'Dup') + r('second') + E(2)) +
      p(S(3, 'dup') + r('third') + E(3)));
    const ix = of(d);
    assert.equal(ix.list.length, 3);
    assert.equal(ix.byName.get('Dup').plain, 'first');
    assert.equal(ix.byName.get('dup').plain, 'third');
    assert.equal(ix.find('DUP').plain, 'first');
    assert.equal(ix.find('missing'), undefined);
  });
});

describe('text between the marks', () => {
  it('plain text and runs, across paragraphs', async () => {
    const d = await read(
      p(r('before ') + S(1, 'bm') + r('abc', '<w:b/>') + r('def')) +
      p(r('middle')) + p('') +
      p(r('ghi') + E(1) + r(' after')));
    const e = of(d).byName.get('bm');
    assert.equal(e.plain, 'abcdef\nmiddle\n\nghi');
    assert.deepEqual(e.runs.map((x) => x.text),
      ['abc', 'def', 'middle', 'ghi']);
    assert.ok(e.runs[0].rPr.b);
    assert.ok(!e.runs[1].rPr.b);
    assert.equal(e.hasNonText, false);
    const blocks = d.sections[0].blocks;
    assert.equal(e.para, blocks[0].id);
    assert.deepEqual(e.start, {id: blocks[0].id, off: 8});
    assert.equal(e.end.id, blocks[3].id);
    assert.equal(e.end.off, 3);
  });

  it('tabs, line breaks and a caret', async () => {
    const d = await read(p(S(1, 'a') + r('x') + '<w:r><w:tab/></w:r>' +
      '<w:r><w:br/></w:r>' + r('y') + E(1) + S(2, 'caret') + E(2)));
    const ix = of(d);
    assert.equal(ix.byName.get('a').plain, 'x\t\ny');
    assert.equal(ix.byName.get('a').hasNonText, false);
    assert.equal(ix.byName.get('caret').plain, '');
    assert.equal(ix.byName.get('caret').start.off,
      ix.byName.get('caret').end.off);
  });

  it('hasNonText for a picture, a field, a table or a note ' +
    'mark inside', async () => {
    const d = await read(
      p(S(1, 'pic') + r('a') + '<w:r><w:pict/></w:r>' + E(1)) +
      p(S(2, 'fld') + '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText> PAGE </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + r('1') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>' + E(2)) +
      p(S(3, 'tbl') + r('t')) + TBL(p(r('cell'))) + p(E(3)) +
      p(S(4, 'note') + r('n') + mark(9) + E(4)) +
      p(S(5, 'plain') + r('ok') + S(6, 'other') + E(6) + E(5)));
    const ix = of(d);
    for (const n of ['pic', 'fld', 'tbl', 'note'])
      assert.equal(ix.byName.get(n).hasNonText, true, n);
    assert.equal(ix.byName.get('plain').hasNonText, false);
    assert.equal(ix.byName.get('plain').plain, 'ok');
  });
});

describe('memo', () => {
  it('memoised per DocVersion, recomputed after an edit and ' +
    'after undo', async () => {
    const doc = await read(p(S(1, 'bm') + r('abc') + E(1)));
    const d = new Document(doc);
    const a = of(d.doc);
    assert.equal(of(d.doc), a);
    const path = [0, 0];
    d.apply({op: 'replaceText', block: path, at: 2, del: 0,
      ins: 'ZZ'});
    const b = of(d.doc);
    assert.notEqual(b, a);
    assert.equal(b.byName.get('bm').plain, 'aZZbc');
    assert.equal(of(d.doc), b);
    d.undo();
    const c = of(d.doc);
    assert.notEqual(c, b);
    assert.equal(c.byName.get('bm').plain, 'abc');
  });
});

describe('hostile', () => {
  it('end before start, start without end, no id, __proto__',
    async () => {
      const d = await read(
        p(E(1) + r('a') + S(1, 'backwards')) +
        p(S(2, 'open') + r('b')) +
        p('<w:bookmarkStart w:name="noid"/>' + r('c') +
          '<w:bookmarkEnd/>') +
        p(S(3, '__proto__') + r('d') + E(3)) +
        p(S(4, 'constructor') + r('e') + E(4)) +
        p(S(5, 'toString') + r('f') + E(5)));
      const ix = of(d);
      assert.deepEqual(names(ix), ['__proto__', 'constructor',
        'toString']);
      assert.equal(ix.byName.get('__proto__').plain, 'd');
      assert.equal(ix.byName.has('open'), false);
      assert.equal(ix.byName.has('backwards'), false);
      assert.equal(ix.find('__PROTO__').plain, 'd');
      assert.deepEqual(of({}).list, []);
      assert.deepEqual(of(null).list, []);
    });

  const many = async (n) => {
    let body = '';
    for (let i = 0; i < n; i++)
      body += p(S(i, 'b' + i) + r('text ' + i) + E(i));
    return read(body);
  };
  const bestOf = (doc, k = 3) => {
    let best = Infinity;
    for (let i = 0; i < k; i++) {
      doc.sections = [...doc.sections];   // forget the memo
      const t = performance.now();
      of(doc);
      best = Math.min(best, performance.now() - t);
    }
    return best;
  };

  it('10,000 bookmarks: linear (ratio; ceiling only under ' +
    'WORD_PERF=1)', async () => {
    const small = await many(1000), big = await many(10000);
    assert.equal(of(big).list.length, 10000);
    const a = bestOf(small), b = bestOf(big);
    console.log(`# bookmark index: 1,000 ${a.toFixed(1)} ms, ` +
      `10,000 ${b.toFixed(1)} ms`);
    if (process.env.WORD_PERF) assert.ok(b < 2000, 'took ' + b);
    else assert.ok(b < Math.max(a, 5) * 30,
      'not linear: ' + (b / a).toFixed(1));
  });
});
