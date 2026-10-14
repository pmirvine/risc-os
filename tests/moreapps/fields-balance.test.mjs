// Edits never leave half a field (Batch D P8 fix I3): a range that
// takes some of a complex field's marks (begin, separate, end) and
// not the others is extended to the whole field (begin to end) before
// it is deleted, typed over, cut or pasted over (Word's rule: a
// selection crossing a field boundary takes the whole field), for
// every field (computed, unknown REF or TOC, spanning paragraphs);
// the computed-result refusal (PG21) still holds for a range that
// takes part of a result and no mark; Cut copies the extended range;
// a paste drops the marks of the pasted blocks that have no partner
// there (half a field copied). A range from outside a table into a
// cell takes whole rows (./RangeTbl): a field from before the table
// into the cell is taken whole too (P9 fix I1). Then a seeded
// property test: 200 seeds x 30 random edits placed near field marks
// (typing, Enter, Backspace, Delete, the word forms, range delete,
// cut, copy, paste, undo and redo, Insert field, Update field,
// Update all, Edit code) in the body (a field from a paragraph into
// a later table's cell among its fields), a header, a footer and a
// table cell:
// the model's and every written part's fldChars stay balanced, and
// undo of everything gives the bytes as opened.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {select, caret} from '../../tools/moreapps/!Letters/Selection';
import * as E from '../../tools/moreapps/!Letters/Edit';
import * as X from '../../tools/moreapps/!Letters/EditDel';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {pasteBlocks, cutSelection}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {marks} from '../../tools/moreapps/!Letters/FieldMarks';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {forEachIn} from '../../tools/moreapps/!Letters/Walk';
import {insertFieldCmd, updateCmd, updateAllCmd, editCodeCmd}
  from '../../tools/moreapps/!Letters/FieldCmd';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {loadStyles, rng} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {fld, fldSimple, begin, sep, end, instr}
  from './field-fixtures.mjs';

before(loadStyles);
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});

/** The paragraphs of doc in flow order (cells too). */
function paras(doc) {
  const out = [];
  forEachIn(doc.sections.flatMap((s) => s.blocks), [0], (b) => {
    if (b && b.type === 'p') out.push(b);
    return true;
  });
  return out;
}

/** Unbalanced fldChar marks of doc's paragraphs (flow order). */
function unbalanced(doc) {
  const st = [];
  let bad = 0;
  for (const b of paras(doc)) {
    for (const m of marks(b)) {
      if (m.t === 'b') st.push(false);
      else if (m.t === 's') {
        if (!st.length || st[st.length - 1]) bad++;
        else st[st.length - 1] = true;
      } else if (m.t === 'e') {
        if (st.length) st.pop();
        else bad++;
      }
    }
  }
  return bad + st.length;
}

/** Unbalanced fldChars in a written part's XML. */
function unbalancedXml(bytes) {
  const xml = new TextDecoder().decode(bytes);
  const st = [];
  let bad = 0;
  for (const m of xml.matchAll(/fldCharType="(\w+)"/g)) {
    if (m[1] === 'begin') st.push(false);
    else if (m[1] === 'separate') {
      if (!st.length || st[st.length - 1]) bad++;
      else st[st.length - 1] = true;
    } else if (m[1] === 'end') {
      if (st.length) st.pop();
      else bad++;
    }
  }
  return bad + st.length;
}

const texts = (doc) => paras(doc).map((b) => b.text
  .replace(/￼/g, '#'));

// 'Ref ###Sec#x' : begin 4, instr 5, sep 6, 'Sec' 7-9, end 10
// 'Page ###1# end': begin 5, instr 6, sep 7, '1' 8, end 9
const BODY = p(r('Ref ') + fld(' REF bm1 \\h ', 'Sec') + r('x')) +
  p(r('Page ') + fld(' PAGE ', '1') + r(' end')) +
  p(r('Span ') + begin() + instr(' TOC ') + sep() + r('one')) +
  p(r('two')) + p(r('three') + end() + r(' after')) +
  p(r('plain text'));

async function docOf(body = BODY) {
  return new Document(await readDocx(await withHeaders(body,
    {default: {hdr: p(r('h'))}})));
}

const ps = (d) => paras(d.doc);
const sel = (d, a, x, b, y) => select({id: ps(d)[a].id, off: x},
  {id: ps(d)[b].id, off: y});

describe('a range cutting a field takes the whole field (I3)', () => {
  it('typing over a range that takes the begin of an unknown field',
    async () => {
      const d = await docOf();
      E.typeText(d, sel(d, 0, 2, 0, 6), 'Z');
      assert.deepEqual(texts(d.doc)[0], 'ReZx');
      assert.equal(unbalanced(d.doc), 0);
    });
  it('the range backwards (head before anchor) too', async () => {
    const d = await docOf();
    E.typeText(d, sel(d, 0, 8, 0, 2), 'Z');
    assert.deepEqual(texts(d.doc)[0], 'ReZx');
  });
  it('deleting a range that takes the end and text after', async () => {
    const d = await docOf();
    X.deleteSelection(d, sel(d, 0, 10, 0, 12));
    assert.deepEqual(texts(d.doc)[0], 'Ref ');
    assert.equal(unbalanced(d.doc), 0);
  });
  it('one character over a computed field\'s begin: the whole field',
    async () => {
      const d = await docOf();
      X.deleteBack(d, sel(d, 1, 5, 1, 6));
      assert.deepEqual(texts(d.doc)[1], 'Page  end');
      assert.equal(unbalanced(d.doc), 0);
    });
  it('part of a computed result and no mark: still refused', async () => {
    const d = await docOf(p(r('Page ') + fld(' PAGE ', '12') + r(' e')));
    const s = sel(d, 0, 9, 0, 10);
    assert.equal(X.deleteBack(d, s), null);
    E.typeText(d, s, 'Z');
    assert.deepEqual(texts(d.doc)[0], 'Page ###12# e');
    assert.equal(d.canUndo, false);
  });
  it('a range into a field spanning paragraphs: begin to end',
    async () => {
      const d = await docOf();
      E.typeText(d, sel(d, 3, 1, 4, 7), 'Z');
      assert.deepEqual(texts(d.doc).slice(2),
        ['Span Zafter', 'plain text']);
      assert.equal(unbalanced(d.doc), 0);
    });
  it('Enter over a range cutting a field', async () => {
    const d = await docOf();
    E.splitPara(d, sel(d, 1, 3, 1, 7));
    assert.deepEqual(texts(d.doc).slice(1, 3), ['Pag', ' end']);
    assert.equal(unbalanced(d.doc), 0);
  });
  it('Cut copies and deletes the whole field', async () => {
    const d = await docOf();
    const c = cutSelection(d, sel(d, 0, 2, 0, 6));
    assert.deepEqual(texts(d.doc)[0], 'Rex');
    assert.equal(c.slice.blocks[0].text.replace(/￼/g, '#'),
      'f ###Sec#');
    assert.equal(unbalanced({sections: [{blocks: c.slice.blocks}]}),
      0);
  });
  it('a paste drops the marks with no partner in what is pasted',
    async () => {
      const d = await docOf();
      const half = slice(d.doc, sel(d, 0, 2, 0, 8));   // begin, no end
      assert.equal(unbalanced({sections: [{blocks: half.blocks}]}), 1);
      pasteBlocks(d, caret({id: ps(d)[5].id, off: 0}), half.blocks,
        {sameDoc: true, styleNames: half.styleNames});
      assert.deepEqual(texts(d.doc)[5], 'f Splain text');
      assert.equal(unbalanced(d.doc), 0);
      assert.equal(scan(d.doc).length, 3);
    });
  it('a whole field pasted is kept whole', async () => {
    const d = await docOf();
    const s = slice(d.doc, sel(d, 0, 0, 0, 11));
    pasteBlocks(d, caret({id: ps(d)[5].id, off: 0}), s.blocks,
      {sameDoc: true, styleNames: s.styleNames});
    assert.deepEqual(texts(d.doc)[5], 'Ref ###Sec#plain text');
    assert.equal(scan(d.doc).length, 4);
  });
});

// a field from before a table into its cell (P9 fix I1): a range
// that enters the table takes whole rows (./RangeTbl), so the
// field's marks in those rows count as taken
const cell = (x) => '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>' +
  `</w:tcPr>${x}</w:tc>`;
const TBL1 = (x) => '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
  '</w:tblPr><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid><w:tr>' +
  cell(x) + '</w:tr></w:tbl>';
// 'X ###res' / 'in' / cell 'c#d' / 'z': the TOC ends in the cell
const XBODY = p(r('X ') + begin() + instr(' TOC ') + sep() + r('res')) +
  p(r('in')) + TBL1(p(r('c') + end() + r('d'))) + p(r('z'));

/** The fldChar counts of the written body. */
async function written(d) {
  const z = await readZip(await write(d.doc));
  const xml = new TextDecoder().decode(z.get('word/document.xml'));
  const n = (t) => (xml.match(new RegExp(`fldCharType="${t}"`, 'g')) ||
    []).length;
  return [n('begin'), n('separate'), n('end')];
}

describe('a range into a table cell takes the whole field (I1)', () => {
  for (const [name, fn] of [
    ['Delete', (d, s) => X.deleteSelection(d, s)],
    ['typing over', (d, s) => E.typeText(d, s, 'Q')],
    ['Cut', (d, s) => cutSelection(d, s)],
    ['a paste over', (d, s) => {
      const c = slice(d.doc, sel(d, 3, 0, 3, 1));
      return pasteBlocks(d, s, c.blocks, {sameDoc: true,
        styleNames: c.styleNames});
    }],
  ]) {
    it(`${name}: no half field, in the model or written`, async () => {
      const d = await docOf(XBODY);
      fn(d, sel(d, 1, 1, 2, 1));
      assert.equal(unbalanced(d.doc), 0, JSON.stringify(texts(d.doc)));
      const [b, s, e] = await written(d);
      assert.equal(b, e);
      assert.ok(s <= b);
      assert.ok(!texts(d.doc).some((t) => t.includes('res')),
        JSON.stringify(texts(d.doc)));
    });
  }
  it('backwards, and from the cell out of the table', async () => {
    const d = await docOf(XBODY);
    X.deleteSelection(d, sel(d, 2, 1, 1, 1));
    assert.equal(unbalanced(d.doc), 0, JSON.stringify(texts(d.doc)));
    // (after the end mark in the cell to 'z': the row goes, the end
    // mark with it)
    const d2 = await docOf(XBODY);
    X.deleteBack(d2, sel(d2, 3, 1, 2, 2));
    assert.equal(unbalanced(d2.doc), 0, JSON.stringify(texts(d2.doc)));
  });
  it('a plain range into a cell holding a whole field is unchanged',
    async () => {
      const d = await docOf(p(r('in')) +
        TBL1(p(r('c') + fld(' PAGE ', '1') + r('d'))) + p(r('z')));
      X.deleteSelection(d, sel(d, 0, 1, 1, 1));
      assert.deepEqual(texts(d.doc), ['i', 'z']);
    });
});

// ------------------------------------------------ the property test
const TBL = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/>' +
  '</w:tblGrid><w:tr>' +
  cell(p(r('Cell ') + fld(' PAGE ', '1') + r(' end'))) +
  cell(p(fld(' MERGEFIELD Name ', 'Name') + r(' x ') +
    fld(' DATE \\@ "d MMMM" ', '1 May'))) + '</w:tr></w:tbl>';
const PBODY = p(r('Page ') + fld(' PAGE ', '1') + r(' of ') +
  fld(' NUMPAGES ', '3') + r(' pages.')) +
  p(r('Today ') + fld(' DATE ', '01/01/2020') + r(' see ') +
    fld(' REF bm1 \\h ', 'Section 2') + r(' ok')) +
  p(r('If ') + fld('IF {} = 1 "one" "many"', 'one',
    {nested: fld(' PAGE ', '1')}) + r(' done')) +
  p(r('Span ') + begin() + instr(' TOC \\o "1-3" ') + sep() +
    r('Entry one')) + p(r('Entry two')) +
  p(r('Entry three') + end() + r(' after')) +
  p(r('Simple ') + fldSimple(' PAGE ', '1') + r(' and ') +
    fldSimple(' AUTHOR ', 'me')) +
  TBL + p(r('Locked ') + fld(' PAGE ', '1', {lock: true}) + r(' tail')) +
  p(r('X ') + begin() + instr(' TOC ') + sep() + r('res')) +
  p(r('in')) + TBL1(p(r('c') + end() + r('d'))) + p(r('z'));
const HDR = p(r('Header ') + fld(' PAGE \\* roman ', 'i') + r(' ') +
  fld(' FILENAME ', 'a.docx'));
const FTR = p(r('Page ') + fld(' PAGE ', '1') + r(' of ') +
  fld(' NUMPAGES ', '1') + r(' ') + fld(' DATE \\@ "yyyy" ', '2020'));
const PIECES = ['a', ' ', 'word ', 'é', '\n', 'x\ny', '\t'];
const PARTS = ['word/document.xml', 'word/header1.xml',
  'word/footer1.xml'];
const pick = (rd, a) => a[Math.floor(rd() * a.length)];

/** A position in b near a field mark (60%) or anywhere. */
function posIn(rd, b) {
  const ms = [];
  for (let k = 0; k < b.text.length; k++) {
    if (b.text[k] === '￼') ms.push(k);
  }
  if (ms.length && rd() < 0.6) {
    const k = pick(rd, ms) + Math.floor(rd() * 5) - 2;
    return {id: b.id, off: Math.max(0, Math.min(b.text.length, k))};
  }
  return {id: b.id, off: Math.floor(rd() * (b.text.length + 1))};
}

function randSel(rd, d) {
  const list = paras(d.doc);
  if (!list.length) return null;
  const k = Math.floor(rd() * list.length);
  const a = posIn(rd, list[k]);
  if (rd() < 0.5) return caret(a);
  const k2 = Math.max(0, Math.min(list.length - 1,
    k + Math.floor(rd() * 5) - 2));
  return select(a, posIn(rd, list[k2]));
}

const CTX = {now: new Date(2026, 9, 14, 9, 30), meta: {}};
const CODES = ['PAGE', 'DATE \\@ "yyyy"', 'FOO bar', 'NUMWORDS',
  'AUTHOR \\* Upper'];

/** One random edit of t at s; its selection after (or null). */
function edit(rd, d, t, s, st) {
  const x = rd();
  if (s && x < 0.04)
    return insertFieldCmd(t, s, pick(rd, CODES), CTX) || s;
  if (s && x < 0.06) return updateCmd(t, s, CTX) || s;
  if (s && x < 0.07)
    return editCodeCmd(t, s, pick(rd, CODES), CTX) || s;
  if (s && x < 0.075) {
    updateAllCmd(t, CTX, s);
    return s;
  }
  if (x < 0.10) {
    let n = 1 + Math.floor(rd() * 4);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 3);
    while (m-- > 0 && d.redo());
    return null;
  }
  if (!s) return null;
  if (x < 0.30) return E.typeText(t, s, pick(rd, PIECES),
    {key: 'typing'});
  if (x < 0.38) return E.splitPara(t, s);
  if (x < 0.50) return X.deleteBack(t, s);
  if (x < 0.62) return X.deleteForward(t, s);
  if (x < 0.66) return X.deleteWordBack(t, s);
  if (x < 0.72) return X.deleteSelection(t, s);
  if (x < 0.80) {
    const c = cutSelection(t, s);
    if (c.slice) st.clip = c.slice;
    return c.sel;
  }
  if (x < 0.86) {
    const c = slice(t.doc, s);
    if (c) st.clip = c;
    return s;
  }
  return st.clip ? pasteBlocks(t, s, st.clip.blocks, {sameDoc: true,
    styleNames: st.clip.styleNames}) : s;
}

describe('random edits near fields keep them balanced (I3)', () => {
  it('200 seeds x 30 edits: body, header, footer, a cell', async () => {
    const bytes = await withHeaders(PBODY,
      {default: {hdr: HDR, ftr: FTR}});
    const bad = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rd = rng(seed * 7919), doc = await readDocx(bytes);
      const out0 = await write(doc), d = new Document(doc);
      const targets = () => [d, facadeOf(d, 'word/header1.xml', 0),
        facadeOf(d, 'word/footer1.xml', 0)];
      const st = {clip: null};
      let s = null, t = d;
      for (let step = 0; step < 30; step++) {
        if (!s || rd() < 0.4) {
          const ts = targets();
          t = rd() < 0.5 ? ts[0] : pick(rd, ts);
          if (t.gone) t = d;
          s = randSel(rd, t);
        }
        const was = JSON.stringify(s);
        const s2 = edit(rd, d, t, s, st);
        for (const x of targets()) {
          if (!x.gone && unbalanced(x.doc)) {
            bad.push(`seed ${seed} step ${step} ${x.part || 'body'} ` +
              was);
          }
        }
        if (bad.length) break;
        s = s2 && s2.head ? s2 : null;
      }
      if (bad.length) break;
      const z = await readZip(await write(d.doc));
      for (const k of PARTS) {
        if (z.get(k) && unbalancedXml(z.get(k))) {
          bad.push(`seed ${seed} ${k}`);
        }
      }
      while (d.undo());
      const outU = await write(d.doc);
      if (Buffer.compare(Buffer.from(outU), Buffer.from(out0))) {
        bad.push(`seed ${seed} undo-all bytes differ`);
      }
      if (bad.length) break;
    }
    assert.deepEqual(bad, []);
  });
});
