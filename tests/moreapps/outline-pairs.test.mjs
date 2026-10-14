// Outline's Move up and Move down keep paired marks whole (Batch D P13
// fix I2): a complex field (a TOC whose result is two paragraphs), a
// comment range or a bookmark from one paragraph to another is moved
// whole (the unit widened to take both ends), so the marks saved stay
// begin..end in order and the field is still one field; a unit that
// cannot be widened (it would reach the top or bottom) is refused
// (null, a beep); a pair inside one paragraph changes nothing.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {moveCmd} from '../../tools/moreapps/!Letters/OutlineCmd';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {caret} from '../../tools/moreapps/!Letters/Selection';
import {Fold} from '../../tools/moreapps/!Letters/OutlineFold';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {loadStyles} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {docWithFields, begin, sep, end, instr} from './field-fixtures.mjs';
import {undoable, snap} from './edit-docs.mjs';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';

before(loadStyles);
const H = (t) => p(r(t), '<w:outlineLvl w:val="0"/>');
const open = async (body) => new Document(await docWithFields(body));
const bs = (d) => d.doc.sections.flatMap((s) => s.blocks);
const texts = (d) => bs(d).map((b) => b.text.replace(/￼/g, ''));
const at = (d, k, off = 1) => caret({id: bs(d)[k].id, off});
async function xml(d) {
  const z = await readZip(await writeDocx(d.doc, {date: new Date(2024, 0, 1)}));
  return new TextDecoder().decode(z.get('word/document.xml'));
}
const order = (x, re) => [...x.matchAll(re)].map((m) => m[1]);

// Top | [begin TOC sep] entry one | entry two [end] | Next | after
const TOC = H('Top') + p(begin() + instr(' TOC \\o ') + sep() + r('entry one'))
  + p(r('entry two') + end()) + H('Next') + p(r('after'));
const CMT = H('Top') + p('<w:commentRangeStart w:id="1"/>' + r('c one'))
  + p(r('c two') + '<w:commentRangeEnd w:id="1"/>') + H('Next') + p(r('after'));
const BMK = H('Top') + p('<w:bookmarkStart w:id="5" w:name="bm"/>' + r('b one'))
  + p(r('b two') + '<w:bookmarkEnd w:id="5"/>') + H('Next') + p(r('after'));

describe('Move keeps a field across paragraphs whole (I2)', () => {
  it('Move down from its first paragraph moves both, the field stays one field', async () => {
    const d = await open(TOC);
    assert.equal(scan(d.doc).length, 1);
    const out = undoable(d, () => moveCmd(d, at(d, 1), 1, null));
    assert.ok(out);
    assert.deepEqual(texts(d), ['Top', 'Next', 'entry one', 'entry two', 'after']);
    assert.deepEqual(order(await xml(d), /fldCharType="(\w+)"/g), ['begin', 'separate', 'end']);
    assert.equal(scan(d.doc).length, 1);
  });

  it('Move up from its last paragraph moves both', async () => {
    const d = await open(TOC);
    assert.ok(moveCmd(d, at(d, 2), -1, null));
    assert.deepEqual(texts(d), ['entry one', 'entry two', 'Top', 'Next', 'after']);
    assert.deepEqual(order(await xml(d), /fldCharType="(\w+)"/g), ['begin', 'separate', 'end']);
  });

  it('Move past a field whole: the unit is not put inside it', async () => {
    const d = await open(TOC);
    assert.ok(moveCmd(d, at(d, 3), -1, null));     // Next up past "entry two"
    assert.deepEqual(order(await xml(d), /fldCharType="(\w+)"/g), ['begin', 'separate', 'end']);
  });
});

describe('Move keeps comment ranges and bookmarks whole (I2)', () => {
  it('a comment range: Move up from its end paragraph, start..end saved in order', async () => {
    const d = await open(CMT);
    assert.ok(moveCmd(d, at(d, 2), -1, null));
    assert.deepEqual(texts(d), ['c one', 'c two', 'Top', 'Next', 'after']);
    assert.deepEqual(order(await xml(d), /<w:(commentRange\w+)/g), ['commentRangeStart', 'commentRangeEnd']);
  });

  it('a bookmark: Move down from its start paragraph, start..end saved in order', async () => {
    const d = await open(BMK);
    assert.ok(moveCmd(d, at(d, 1), 1, null));
    assert.deepEqual(texts(d), ['Top', 'Next', 'b one', 'b two', 'after']);
    assert.deepEqual(order(await xml(d), /<w:(bookmark\w+)/g), ['bookmarkStart', 'bookmarkEnd']);
  });

  it('a pair that cannot be widened (it reaches the top): refused, nothing changed', async () => {
    const d = await open(p('<w:bookmarkStart w:id="7" w:name="all"/>' + r('first')) + p(r('second'))
      + p(r('third') + '<w:bookmarkEnd w:id="7"/>') + p(r('z')));
    const before = snap(d), n = d.undoDepth;
    assert.equal(moveCmd(d, at(d, 2), -1, null), null);   // widened to all three: the top
    assert.ok(deepEqual(d.doc.sections, before));
    assert.equal(d.undoDepth, n);
  });

  it('a pair inside one paragraph moves as before (only that paragraph)', async () => {
    const d = await open(H('Top') + p('<w:bookmarkStart w:id="2" w:name="in"/>' + r('own') + '<w:bookmarkEnd w:id="2"/>')
      + p(r('x')) + p(r('y')));
    assert.ok(moveCmd(d, at(d, 1), 1, null));
    assert.deepEqual(texts(d), ['Top', 'x', 'own', 'y']);
  });

  it('with a collapsed heading the widened unit still takes the hidden rows after it', async () => {
    const d = await open(BMK);
    const f = new Fold([bs(d)[3].id]);   // Next collapsed: "after" hidden
    assert.ok(moveCmd(d, at(d, 2), 1, f));
    assert.deepEqual(texts(d), ['Top', 'Next', 'after', 'b one', 'b two']);
    assert.deepEqual(order(await xml(d), /<w:(bookmark\w+)/g), ['bookmarkStart', 'bookmarkEnd']);
  });
});

describe('Move and paired marks against hostile input (I2)', () => {
  it('half a field (an end with no begin anywhere): refused', async () => {
    const d = await open(H('Top') + p(r('x') + end()) + p(r('y')));
    assert.equal(moveCmd(d, at(d, 1), 1, null), null);
  });

  it('a bookmark whose end is missing: moved as before (it cannot be put out of order)', async () => {
    const d = await open(H('Top') + p('<w:bookmarkStart w:id="9" w:name="lost"/>' + r('x')) + p(r('y')));
    assert.ok(moveCmd(d, at(d, 1), 1, null));
    assert.deepEqual(texts(d), ['Top', 'y', 'x']);
  });

  it('100,000 headings: a move stays quick (median of 20 after 3 warm-ups, < 100 ms)', async () => {
    const d = await open(H('a'));
    const proto = bs(d)[0], sec = d.doc.sections[0];
    const {newPara} = await import('../../tools/moreapps/!Letters/Model');
    sec.blocks = Array.from({length: 100000}, (_, i) => newPara('h' + i, {pPr: proto.pPr}));
    d.clearHistory();
    const ms = [];
    for (let i = 0; i < 23; i++) {
      const t0 = performance.now();
      assert.ok(moveCmd(d, at(d, 50000 + (i % 2)), i % 2 ? -1 : 1, null));
      if (i >= 3) ms.push(performance.now() - t0);
    }
    ms.sort((x, y) => x - y);
    assert.ok(ms[10] < 100, `median ${ms[10]} ms`);
  });
});
