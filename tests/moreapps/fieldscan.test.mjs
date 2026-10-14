// FieldScan (Batch D P8.1, D15): fields found in the model, a pure
// view (nothing in the Doc changes): complex fields begin..end across
// paragraphs and cells, nested by a stack, a nested field's current
// result in its parent's instruction; fldSimple; unbalanced -> none;
// memoised per paragraph object. The corpus (optional, gated) scans
// and parses without an exception.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scan, fieldAt, work}
  from '../../tools/moreapps/!Letters/FieldScan';
import {parse} from '../../tools/moreapps/!Letters/FieldParse';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {at, blocksOf} from '../../tools/moreapps/!Letters/Walk';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {p, r} from './build-docx.mjs';
import {fld, fldSimple, begin, sep, end, instr, docWithFields}
  from './field-fixtures.mjs';
import {freeze} from './story-fixtures.mjs';
import {corpusFiles, nameOf, SKIP_CORPUS, ALL}
  from './roundtrip-lib.mjs';

const F1 = 'word/footer1.xml';
const cell = (body) => `<w:tc><w:tcPr><w:tcW w:w="2000" ` +
  `w:type="dxa"/></w:tcPr>${body}</w:tc>`;
const tbl = (...cells) => '<w:tbl><w:tblPr/><w:tblGrid>' +
  cells.map(() => '<w:gridCol w:w="2000"/>').join('') +
  `</w:tblGrid><w:tr>${cells.map(cell).join('')}</w:tr></w:tbl>`;
const mark = (m) => ({at: m.at, off: m.off});
const read = async (body, hdrs) => freeze(await docWithFields(body,
  hdrs));

describe('FieldScan', () => {
  it('PAGE in a footer: the story is scanned, the body is not',
    async () => {
      const doc = await read(p(r('body')),
        {default: {ftr: p(r('Page ') + fld(' PAGE ', '1'))}});
      assert.deepEqual(scan(doc), []);
      const fs = scan(doc, F1);
      assert.equal(fs.length, 1);
      const f = fs[0];
      assert.equal(f.instr, ' PAGE ');
      assert.deepEqual(mark(f.begin), {at: [0, 0], off: 5});
      assert.deepEqual(mark(f.sep), {at: [0, 0], off: 7});
      assert.deepEqual(mark(f.end), {at: [0, 0], off: 9});
      assert.equal(blocksOf(doc, F1)[0].text[8], '1');
      assert.equal(f.lock, false);
      assert.equal(f.dirty, false);
      assert.deepEqual(f.children, []);
      assert.equal(f.simple, undefined);
      const id = blocksOf(doc, F1)[0].id;
      assert.equal(fieldAt(doc, {id, off: 8}, F1), f);
      assert.equal(fieldAt(doc, {id, off: 8}), null, 'not the body');
      assert.equal(fieldAt(doc, {id, off: 4}, F1), null);
      assert.equal(fieldAt(doc, {id, off: 10}, F1), null);
      assert.deepEqual(scan(doc, 'word/nope.xml'), []);
    });

  it('the instruction joins every instrText; no result: sep null',
    async () => {
      const doc = await read(p(begin() + instr(' DATE ') +
        instr('\\@ "yyyy" ') + end()));
      const [f] = scan(doc);
      assert.equal(f.instr, ' DATE \\@ "yyyy" ');
      assert.equal(f.sep, null);
      assert.deepEqual(mark(f.end), {at: [0, 0], off: 3});
    });

  it('a field across two paragraphs', async () => {
    const doc = await read(p(r('a') + begin() + instr(' TOC \\o ') +
      sep() + r('x')) + p(r('y') + end()) + p(r('after')));
    const fs = scan(doc);
    assert.equal(fs.length, 1);
    assert.deepEqual(mark(fs[0].begin), {at: [0, 0], off: 1});
    assert.deepEqual(mark(fs[0].end), {at: [0, 1], off: 1});
    const p2 = at(doc, [0, 1]), p3 = at(doc, [0, 2]);
    assert.equal(fieldAt(doc, {id: p2.id, off: 0}), fs[0]);
    assert.equal(fieldAt(doc, {id: p3.id, off: 0}), null);
  });

  it('a field in a cell and one across cells', async () => {
    const doc = await read(tbl(p(fld(' PAGE ', '2')),
      p(begin() + instr(' REF x ') + sep() + r('one'))) +
      tbl(p(r('two') + end())) +
      p(r('z')) + tbl(p(r('a')), p(r('b') + end())));
    const fs = scan(doc);
    assert.equal(fs.length, 2, 'a stray end is no field');
    assert.deepEqual(mark(fs[0].begin), {at: [0, 0, 0, 0, 0], off: 0});
    assert.deepEqual(mark(fs[0].end), {at: [0, 0, 0, 0, 0], off: 4});
    assert.equal(fs[1].instr, ' REF x ');
    assert.deepEqual(mark(fs[1].begin), {at: [0, 0, 0, 1, 0], off: 0});
    assert.deepEqual(mark(fs[1].end), {at: [0, 1, 0, 0, 0], off: 3});
  });

  it('nested IF { PAGE } = 1: the inner result in the instruction',
    async () => {
      const doc = await read(p(fld('IF {} = 1 "a" "b"', 'a',
        {nested: fld(' PAGE ', '1')})));
      const fs = scan(doc);
      assert.equal(fs.length, 2);
      const [outer, inner] = fs;
      assert.equal(outer.instr, 'IF 1 = 1 "a" "b"');
      assert.equal(inner.instr, ' PAGE ');
      assert.deepEqual(outer.children, [inner]);
      assert.equal(parse(outer.instr).name, 'IF');
      const id = at(doc, [0, 0]).id;
      // begin, IF, begin(2) PAGE(3) sep(4) 1(5) end(6), ' = 1...'(7)
      assert.equal(fieldAt(doc, {id, off: 5}), inner);
      assert.equal(fieldAt(doc, {id, off: 7}), outer);
    });

  it('a nested result over paragraphs and nested twice', async () => {
    const doc = await read(p(begin() + instr('A ') + begin() +
      instr('B ') + sep() + r('x') + fld('C', 'y') + r('z')) +
      p(r('w') + end() + instr(' tail') + sep() + r('res') + end()));
    const [a, b, c] = scan(doc);
    assert.equal(a.instr, 'A xyz\rw tail');
    assert.equal(b.instr, 'B ');
    assert.equal(c.instr, 'C');
    assert.deepEqual(a.children, [b]);
    assert.deepEqual(b.children, [c]);
  });

  it('fldSimple, alone and nested in an instruction', async () => {
    const doc = await read(p(r('x') + fldSimple(' DATE ', '1/1/20')) +
      p(begin() + instr('IF ') + fldSimple('PAGE', '3') + instr(' > 2') +
      sep() + r('yes') + end()));
    const fs = scan(doc);
    assert.equal(fs.length, 3);
    const [s, outer, inner] = fs;
    assert.equal(s.instr, ' DATE ');
    assert.equal(s.sep, null);
    assert.deepEqual(mark(s.begin), {at: [0, 0], off: 1});
    assert.deepEqual(mark(s.end), {at: [0, 0], off: 1});
    assert.equal(s.simple.node, at(doc, [0, 0]).inlines[1].node);
    assert.equal(outer.instr, 'IF 3 > 2');
    assert.deepEqual(outer.children, [inner]);
    assert.ok(inner.simple);
  });

  it('unbalanced fields are no fields; balanced ones inside are',
    async () => {
      const doc = await read(p(begin() + instr(' PAGE ') + sep() +
        r('1')) + p(r('x')));
      assert.deepEqual(scan(doc), []);
      const d2 = await read(p(begin() + instr('X ') +
        fld(' PAGE ', '1') + sep() + r('?')));
      const fs = scan(d2);
      assert.equal(fs.length, 1);
      assert.equal(fs[0].instr, ' PAGE ');
      const d3 = await read(p(end() + sep() + r('a') + end()));
      assert.deepEqual(scan(d3), []);
    });

  it('fldLock and dirty', async () => {
    const doc = await read(p(fld(' DATE ', 'd', {lock: true}) +
      fld(' TIME ', 't', {dirty: true}) + fldSimple(' PAGE ', '1')));
    const [a, b, c] = scan(doc);
    assert.equal(a.lock, true);
    assert.equal(a.dirty, false);
    assert.equal(b.lock, false);
    assert.equal(b.dirty, true);
    assert.equal(c.lock, false);
  });

  it('a whole run kept raw still gives its fldChar', async () => {
    const doc = await read(p('<w:r w:foo="1" xmlns:w="' +
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:fldChar w:fldCharType="begin"/></w:r>' + instr(' PAGE ') +
      sep() + r('4') + end()));
    const [f] = scan(doc);
    assert.equal(f.instr, ' PAGE ');
    assert.equal(f.begin.off, 0);
  });

  it('memo: an unchanged paragraph is not looked at again',
    async () => {
      const doc = await read(p(fld(' PAGE ', '1')) + p(r('plain')) +
        p(fld(' DATE ', 'd')));
      const n0 = work.paras;
      const fs = scan(doc);
      assert.equal(work.paras - n0, 3);
      assert.equal(scan(doc), fs, 'the same answer, no walk');
      assert.equal(work.paras - n0, 3);
      const secs = [{...doc.sections[0],
        blocks: [...doc.sections[0].blocks]}];
      const old = secs[0].blocks[1];
      secs[0].blocks[1] = {...old, text: 'other',
        runs: [{...old.runs[0], end: 5}]};
      const d2 = {...doc, sections: secs};
      const fs2 = scan(d2);
      assert.equal(work.paras - n0, 4, 'only the new paragraph');
      assert.equal(fs2.length, 2);
      assert.deepEqual(fs2.map((f) => f.instr), [' PAGE ', ' DATE ']);
      assert.equal(doc.sections[0].blocks[1], old, 'model untouched');
    });

  it('memo: a body edit through the ops (arrays changed in place) is seen',
    async () => {
      const doc = await docWithFields(p(r('ab') + fld(' PAGE ', '1')) +
        p(r('plain')) + '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
        'w:w="2000"/></w:tblGrid><w:tr><w:tc>' + p(fld(' DATE ', 'd')) +
        '</w:tc></w:tr></w:tbl>' + p(r('end')));
      const d = new Document(doc);
      const fs = scan(d.doc);
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
        ins: 'xyz'});
      const fs2 = scan(d.doc);
      assert.notEqual(fs2, fs);
      assert.deepEqual(fs2.map((f) => f.begin.off), [5, 0]);
      d.apply({op: 'insertBlock', at: [0, 0], block: {type: 'p',
        id: 9999, text: '', runs: [], inlines: {}, pPr: {extra: []},
        extraP: []}});
      assert.deepEqual(scan(d.doc).map((f) => f.begin.at),
        [[0, 1], [0, 3, 0, 0, 0]]);
      d.apply({op: 'replaceText', block: [0, 3, 0, 0, 0], at: 0,
        del: 0, ins: 'q'});
      assert.deepEqual(scan(d.doc).map((f) => f.begin.off), [5, 1],
        'an edit in a cell');
      const same = scan(d.doc);
      assert.equal(scan(d.doc), same, 'unchanged: the same answer');
    });

  it('hostile input: never throws', () => {
    for (const d of [null, undefined, 1, {}, {sections: 3},
      {sections: [null, {blocks: [null, 7, {type: 'p'}]}]},
      {sections: [{blocks: [{type: 'p', text: '\ufffc', inlines: {}}]}]},
      {sections: [{blocks: [{type: 'p', text: '\ufffc',
        inlines: {0: {kind: 'raw', node: {name: 'w:fldChar'}}}}]}]}]) {
      assert.deepEqual(scan(d), []);
      assert.equal(fieldAt(d, {id: 1, off: 0}), null);
      assert.equal(fieldAt(d, null), null);
    }
  });
});

const files = corpusFiles();

describe('FieldScan corpus', {skip: files.length ? false : SKIP_CORPUS},
  () => {
    it('every file scans and every instruction parses', async () => {
      const n = {files: 0, fields: 0, simple: 0, nested: 0, spans: 0,
        stories: 0};
      const failures = [];
      for (const f of files) {
        let doc;
        try {
          doc = await readDocx(readFileSync(f));
        } catch (e) {
          if (!(e instanceof DocxError)) failures.push(nameOf(f));
          continue;
        }
        try {
          n.files++;
          const all = [scan(doc)];
          for (const part of doc.stories.keys()) {
            all.push(scan(doc, part));
          }
          for (const fs of all) {
            for (const x of fs) {
              n.fields++;
              if (x.simple) n.simple++;
              if (x.children.length) n.nested++;
              if (x.begin.at.join() !== x.end.at.join()) n.spans++;
              const q = parse(x.instr);
              assert.equal(typeof q.name, 'string');
            }
          }
          n.stories += all.length - 1;
        } catch (e) {
          failures.push(nameOf(f) + ': ' + e.message);
        }
      }
      console.log(`# fieldscan corpus${ALL ? '' : ' (sample)'}: ` +
        `${n.files} files, ${n.fields} fields (${n.simple} fldSimple, ` +
        `${n.nested} with nested fields, ${n.spans} across ` +
        `paragraphs or cells)`);
      assert.deepEqual(failures, []);
    });
  });
