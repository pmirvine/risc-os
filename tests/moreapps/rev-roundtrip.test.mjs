// Tracked changes read into the model (Batch F2): a w:ins, w:del,
// w:moveFrom or w:moveTo directly in a body paragraph becomes runs
// tagged run.rev (./RevRead), written back inside the same element
// (./RevWrite), so an untouched revision is the same XML tree; one
// it cannot model stays the raw inline it was. Deleted text is drawn
// as nothing and taken out of a paragraph's text as the raw w:del
// was (Find, the word count, the clipboard, headings, Info). On the
// corpus (WORD_EDIT_CORPUS=1): every modelled revision element is
// written back with its attributes and text, the main part's
// revisions in the same order, and a file reads back to the same
// model.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newPara, emptyDoc} from '../../tools/moreapps/!Letters/Model';
import {normRuns, checkPara}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {cut, join} from '../../tools/moreapps/!Letters/OpsUtil';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {tokens} from '../../tools/moreapps/!Letters/LineTokens';
import {unseenAt, sameRev, hiddenAt, shownRanges}
  from '../../tools/moreapps/!Letters/Kinds';
import {count as wordCount}
  from '../../tools/moreapps/!Letters/WordCount';
import {count as findCount} from '../../tools/moreapps/!Letters/Find';
import {paraPlain} from '../../tools/moreapps/!Letters/ClipSlice';
import {clean} from '../../tools/moreapps/!Letters/ClipClean';
import {paraText} from '../../tools/moreapps/!Letters/HeadingOutline';
import {facts} from '../../tools/moreapps/!Letters/Info';
import {newStyleTable} from '../../tools/moreapps/!Letters/Styles';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml} from './build-docx.mjs';
import {revFiles} from './rev-oracle.mjs';
import {revNode} from '../../tools/moreapps/!Letters/RevWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import {changeCase} from '../../tools/moreapps/!Letters/ChangeCase';
import {removeLink} from '../../tools/moreapps/!Letters/LinkOps';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Letters/ClipPaste';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {ALL, SKIP_CORPUS} from './roundtrip-lib.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const dec = new TextDecoder();
const write = (doc) => writeDocx(doc, {date: DATE});
const D = '2024-01-02T03:04:00Z';
const at = (id, au = 'Ann', d = D) => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) +
  (d === null ? '' : ` w:date="${d}"`);
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, rPr = '', tag = 'w:t') =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<${tag}${sp(t)}>${t}` +
  `</${tag}></w:r>`;
const dRun = (t, rPr) => run(t, rPr, 'w:delText');
const ins = (id, inner, au, d) => `<w:ins ${at(id, au, d)}>${inner}` +
  '</w:ins>';
const del = (id, inner, au, d) => `<w:del ${at(id, au, d)}>${inner}` +
  '</w:del>';
const para = (inner) => `<w:p>${inner}</w:p>`;

const bytesOf = (body) => buildDocx({'word/document.xml':
  documentXml(body)});
const docOf = async (body, opts) => readDocx(await bytesOf(body), opts);
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);

/** The w:p elements of the main part of a package. */
async function mainParas(bytes) {
  const z = await readZip(bytes);
  const root = parseXml(dec.decode(z.get('word/document.xml'))).root;
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object' || !n.name) return;
    if (n.name === 'w:p') out.push(n);
    else for (const c of n.children || []) walk(c);
  };
  walk(root);
  return out;
}

/** The body read, written, and its paragraphs as written beside the
 *  ones read: each as XML text. */
async function trip(body, opts) {
  const bytes = await bytesOf(body);
  const doc = await readDocx(bytes, opts);
  const out = await write(doc);
  const a = (await mainParas(bytes)).map((n) => serialize(n));
  const b = (await mainParas(out)).map((n) => serialize(n));
  return {doc, a, b, out, back: await readDocx(out, opts)};
}

const tags = (p) => p.runs.map((r) => (r.rev ? r.rev.kind + r.rev.id
  : '-'));
const rawNames = (p) => Object.values(p.inlines).filter((x) =>
  x.kind === 'raw').map((x) => x.node.name);

describe('revisions read and written', () => {
  it('an ins/del/moveFrom/moveTo with plain runs round trips ' +
    'tree-identical', async () => {
    const body = para(run('Keep ') +
      ins(1, run('bold', '<w:b/>') + run(' new')) + run(' and ') +
      del(2, dRun('gone', '<w:i/>') + dRun(' too')) +
      `<w:moveFrom ${at(3, 'Bo')}>${run('moved')}</w:moveFrom>` +
      `<w:moveTo ${at(4, 'Bo')}>${run('moved')}</w:moveTo>`) +
      para(ins(5, run('all new')));
    const {doc, a, b, back} = await trip(body);
    assert.deepEqual(b, a);
    const [p, q] = blocks(doc);
    checkPara(p);
    assert.equal(p.text, 'Keep bold new and gone toomovedmoved');
    assert.deepEqual(tags(p), ['-', 'ins1', 'ins1', '-', 'del2', 'del2',
      'mvFrom3', 'mvTo4']);
    assert.deepEqual(p.runs[1].rev, {id: 1, kind: 'ins', author: 'Ann',
      date: D, attrs: [['w:id', '1'], ['w:author', 'Ann'],
        ['w:date', D]], extra: []});
    assert.deepEqual(rawNames(p), []);
    assert.deepEqual(tags(q), ['ins5']);
    assertSameDoc(back, expectedBack(doc));
  });

  it('unknown attributes and children on the revision element are ' +
    'kept', async () => {
    const W16 = 'http://schemas.microsoft.com/office/word/2023/' +
      'wordml/word16du';
    const body = para(`<w:ins ${at(7)} w16du:dateUtc="${D}" ` +
      `xmlns:w16du="${W16}"><w:proofErr w:type="spellStart"/>` +
      run('Teh') + '<w:proofErr w:type="spellEnd"/>' +
      '<w:bookmarkStart w:id="0" w:name="x"/>' + run('end', '<w:b/>') +
      '<w:bookmarkEnd w:id="0"/></w:ins>');
    const {doc, a, b} = await trip(body);
    assert.deepEqual(b, a);
    const [p] = blocks(doc);
    assert.ok(p.runs.every((r) => r.rev && r.rev.id === 7));
    assert.deepEqual(p.runs[0].rev.attrs.map(([n]) => n),
      ['w:id', 'w:author', 'w:date', 'w16du:dateUtc', 'xmlns:w16du']);
    // an unknown childless element in it (not a mark a tag may hold,
    // ./Kinds REV_MARKS): the revision stays raw, written as read
    const odd = body.replace('</w:ins>', '<w16du:mark/></w:ins>');
    const t2 = await trip(odd);
    assert.deepEqual(t2.b, t2.a);
    const [q] = blocks(t2.doc);
    assert.ok(q.runs.every((r) => !r.rev));
    assert.ok(Object.values(q.inlines).some((x) => x.kind === 'raw' &&
      /:ins$/.test(x.node.name)));
  });

  it('a revision around a field, a picture or a hyperlink stays raw ' +
    'and round trips', async () => {
    const fld = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText>' +
      '</w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      run('1') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const pic = '<w:r><w:drawing><wp:inline xmlns:wp="urn:x"/>' +
      '</w:drawing></w:r>';
    const link = '<w:hyperlink w:anchor="a">' + run('link') +
      '</w:hyperlink>';
    const body = para(ins(1, fld)) + para(del(2, pic)) +
      para(ins(3, link)) + para(ins(4, run('a') +
        '<w:r><w:footnoteReference w:id="1"/></w:r>'));
    const {doc, a, b} = await trip(body);
    assert.deepEqual(b, a);
    for (const p of blocks(doc)) {
      assert.ok(p.runs.every((r) => !r.rev));
      assert.equal(rawNames(p).length, 1);
    }
  });

  it('nested ins in del, a duplicate id, a missing author, a ' +
    'malformed date: raw, or kept as read; never a throw',
  async () => {
    const body = para(del(1, dRun('a') + ins(2, run('b')))) +
      para(ins(3, run('first')) + ins(3, run('again'))) +
      para(ins(14, run('who'), null)) + para(ins(15, run('when'), 'A',
        null)) +
      para(ins(16, run('bad'), 'A', '2024-13')) +
      para(ins('07', run('zero'))) + para(ins('-1', run('neg'))) +
      para(ins('x', run('word'))) + para(ins(8, '')) +
      para(`<w:ins ${at(9)} xmlns:o="urn:o" o:date="x">` +
        `${run('foreign date')}</w:ins>`) +
      para(del(11, run('t in a del'))) + para(ins(12, dRun('dt'))) +
      para(ins(13, 'loose text'));
    const {doc, a, b, back} = await trip(body);
    assert.deepEqual(b, a);
    const ps = blocks(doc);
    assert.deepEqual(tags(ps[1]), ['ins3', '-']);
    assert.deepEqual([2, 3, 4].map((k) => tags(ps[k])),
      [['ins14'], ['ins15'], ['ins16']], 'kept, not raw');
    assert.equal(ps[4].runs[0].rev.date, '2024-13', 'as read');
    for (const k of [0, 5, 6, 7, 8, 9, 10, 11, 12]) {
      assert.ok(ps[k].runs.every((r) => !r.rev), 'para ' + k);
      assert.equal(rawNames(ps[k]).length, 1, 'para ' + k);
    }
    assertSameDoc(back, expectedBack(doc));
  });

  it('a revision split in two (text put in its middle) is written as ' +
    'two elements of one id and reads back as one revision',
  async () => {
    const body = para(ins(3, run('a')) + run('x') + ins(3, run('b'))) +
      para(ins(3, run('cd'))) + para(ins(3, run('other'), 'Bo'));
    const {doc, a, b, back} = await trip(body);
    assert.deepEqual(b, a);
    const ps = blocks(doc);
    assert.deepEqual(tags(ps[0]), ['ins3', '-', 'ins3']);
    assert.deepEqual(tags(ps[1]), ['ins3']);
    assert.deepEqual(tags(ps[2]), ['-'], 'same id, another author');
    assertSameDoc(back, expectedBack(doc));
    const d = emptyDoc();
    d.sections[0].blocks = [ps[1]];
    apply(d, {op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'new '});
    apply(d, {op: 'replaceText', block: [0, 0], at: 5, del: 0,
      ins: 'mid'});
    const p = d.sections[0].blocks[0];
    assert.equal(p.text, 'new cmidd');
    assert.deepEqual(tags(p), ['-', 'ins3', '-', 'ins3']);
    const again = await readDocx(await write(d));
    assert.deepEqual(tags(blocks(again)[0]), tags(p));
  });

  it('a missing author, a missing date or both: kept as a revision ' +
    'with none, written as read', async () => {
    const body = para(ins(1, run('no author'), null)) +
      para(del(2, dRun('no date'), 'Ann', null)) +
      para(ins(3, run('neither'), null, null)) +
      para(`<w:moveTo w:id="4">${run('bare move')}</w:moveTo>`);
    const {doc, a, b, back} = await trip(body);
    assert.deepEqual(b, a);
    const revs = blocks(doc).map((p) => p.runs[0].rev);
    assert.deepEqual(revs.map((r) => [r.kind, r.author, r.date]), [
      ['ins', undefined, D], ['del', 'Ann', undefined],
      ['ins', undefined, undefined], ['mvTo', undefined, undefined]]);
    assert.ok(!('author' in revs[0]) && !('date' in revs[2]));
    blocks(doc).forEach((p) => checkPara(p));
    assertSameDoc(back, expectedBack(doc));
    const made = revNode({id: 9, kind: 'ins', author: 'Me', date: D,
      attrs: [], extra: []}, []);
    assert.deepEqual(made.attrs, [['w:id', '9'], ['w:author', 'Me'],
      ['w:date', D]], 'a tag made by editing gets all three');
  });

  it('10,000 revisions read and write in linear time', async () => {
    const many = (n) => para(Array.from({length: n}, (_, k) =>
      (k % 2 ? del(k, dRun('x' + k)) : ins(k, run('y' + k))))
      .join(''));
    const time = async (n) => {
      const t0 = performance.now();
      const {doc, a, b} = await trip(many(n));
      assert.deepEqual(b, a);
      assert.equal(blocks(doc)[0].runs.length, n);
      return performance.now() - t0;
    };
    await time(500);
    const small = await time(1000), big = await time(10000);
    assert.ok(big < small * 40 + 2000, `${small} / ${big} ms`);
  });

  it('splitting a tagged run keeps both halves tagged and merging ' +
    'never joins different tags', () => {
    const rev = (id, kind = 'ins') => ({id, kind, author: 'A', date: D,
      attrs: [], extra: []});
    const fmt = {rPr: {extra: []}};
    const p = newPara('abcdefgh', {runs: [
      {start: 0, end: 2, ...fmt}, {start: 2, end: 5, ...fmt,
        rev: rev(1)}, {start: 5, end: 8, ...fmt, rev: rev(2, 'del')}]});
    assert.equal(p.runs.length, 3, 'same rPr, different tags');
    assert.deepEqual(normRuns([{start: 0, end: 1, ...fmt, rev: rev(1)},
      {start: 1, end: 2, ...fmt, rev: rev(1)}]).length, 1);
    assert.ok(!sameRev(rev(1), rev(1, 'del')) && !sameRev(rev(1),
      undefined) && sameRev(undefined, undefined));
    const c = cut(p, 3, 6);
    assert.deepEqual(c.runs.map((r) => r.rev.kind), ['ins', 'del']);
    const j = join(cut(p, 0, 3), cut(p, 3, 8));
    assert.deepEqual(j.runs.map((r) => r.rev && r.rev.id),
      [undefined, 1, 2]);
    const d = emptyDoc();
    d.sections[0].blocks = [p];
    apply(d, {op: 'replaceText', block: [0, 0], at: 3, del: 0,
      ins: 'XY'});
    let q = d.sections[0].blocks[0];
    assert.equal(q.text, 'abcXYdefgh');
    assert.deepEqual(tags(q), ['-', 'ins1', '-', 'ins1', 'del2']);
    apply(d, {op: 'setProps', block: [0, 0], range: {start: 8,
      end: 9}, rPr: {b: true}});
    q = d.sections[0].blocks[0];
    assert.deepEqual(tags(q), ['-', 'ins1', '-', 'ins1', 'del2', 'del2',
      'del2']);
    checkPara(q);
  });

  it('a document with no revisions reads and writes as before',
    async () => {
      const body = para(run('Plain ') + run('bold', '<w:b/>')) +
        para('<w:hyperlink w:anchor="a">' + run('x') +
          '</w:hyperlink>');
      const a = await docOf(body);
      const b = await docOf(body, {revisionMarks: false});
      assertSameDoc(a, b);
      const [x, y] = [await write(a), await write(b)];
      assert.deepEqual(x, y);
    });

  it('revisions outside body paragraphs (or switched off) stay raw',
    async () => {
      const body = para(ins(1, run('new')));
      const doc = await docOf(body, {revisionMarks: false});
      assert.deepEqual(rawNames(blocks(doc)[0]), ['w:ins']);
    });
});

describe('deleted text is unseen, as the raw w:del was', () => {
  const body = para(run('Heading ') + del(1, dRun('old ')) +
    ins(2, run('new', '<w:b/>')) + run(' text') +
    `<w:moveFrom ${at(3)}>${run(' away')}</w:moveFrom>`);
  const both = async () => [await docOf(body),
    await docOf(body, {revisionMarks: false})];

  it('layout draws deleted text as one zero-width item and ' +
    'inserted text in its own format', async () => {
    const [d] = await both();
    const p = blocks(d)[0];
    const ts = tokens(p, newStyleTable(), new Map());
    const z = ts.filter((t) => t.t === 'z');
    assert.deepEqual(z.map((t) => [t.from, t.to]), [[8, 12], [20, 25]]);
    const word = ts.find((t) => t.text === 'new');
    assert.ok(word && word.f.bold, 'inserted text in its format');
    assert.ok(!ts.some((t) => /old|away/.test(t.text)));
  });

  it('every offset of deleted text is unseen to the keys', async () => {
    const p = blocks((await both())[0])[0];
    for (let k = 0; k < p.text.length; k++) {
      const hid = (k >= 8 && k < 12) || k >= 20;
      assert.equal(unseenAt(p, k), hid, 'offset ' + k);
      assert.equal(hiddenAt(p, k), hid, 'offset ' + k);
    }
    assert.deepEqual(shownRanges(p, 0, p.text.length),
      [[0, 8], [12, 20]]);
  });

  it('word count, Find, plain text, headings and Info see what they ' +
    'saw before', async () => {
    const [d, raw] = await both();
    assert.deepEqual(wordCount(d), wordCount(raw));
    for (const n of ['old', 'away', 'Heading new', 'new text'])
      assert.equal(findCount(d, n), findCount(raw, n), n);
    assert.equal(findCount(d, 'old'), 0);
    const [p, q] = [blocks(d)[0], blocks(raw)[0]];
    assert.equal(paraPlain(p), paraPlain(q));
    assert.equal(paraPlain(p), 'Heading new text');
    assert.equal(paraText(p), paraText(q));
    assert.deepEqual(facts(d), facts(raw));
  });

  it('a paste takes inserted text as plain text and leaves deleted ' +
    'text out', async () => {
    const [d] = await both();
    const p = blocks(d)[0];
    const [got] = clean([{type: 'p', text: p.text, runs: p.runs,
      inlines: p.inlines, pPr: p.pPr}], d, {sameDoc: true});
    assert.equal(got.text, 'Heading new text');
    assert.ok(got.runs.every((r) => !r.rev));
  });
});

describe('commands over deleted text act as on the raw w:del', () => {
  // (each hidden stretch as the one U+FFFC the raw element was)
  const shown = (p) => {
    let out = '', at = 0;
    for (const [x, y] of shownRanges(p, 0, p.text.length).concat(
      [[p.text.length, p.text.length]])) {
      if (x > at) out += '\ufffc';
      out += p.text.slice(x, y);
      at = y;
    }
    return out;
  };
  const body = para(run('ab ') + del(1, dRun('old')) + run('new cd'));
  const both = async () => [await docOf(body),
    await docOf(body, {revisionMarks: false})];
  const layout = (d) => ({locate: (pos) => {
    let b = null;
    forEachBlock(d.doc, (x) => { if (blockId(x) === pos.id) b = x; });
    return {item: {id: pos.id, kind: 'p', block: b}, off: pos.off};
  }});
  const word = (d, off) => {
    const p = blocks(d.doc)[0];
    const s = S.selectWord(layout(d), {id: blockId(p), off});
    return p.text.slice(s.anchor.off, s.head.off);
  };

  it('a double-click on a word selects it, not the deleted text ' +
    'next to it; one on deleted text selects it alone', async () => {
    const [m, r] = (await both()).map((x) => new Document(x));
    assert.equal(word(m, 7), 'new');
    assert.equal(word(r, 5), 'new');
    assert.equal(word(m, 4), 'old', 'the whole deleted stretch');
    assert.equal(word(r, 3), '\ufffc', 'the raw element');
    assert.equal(word(m, 1), word(r, 1));
  });

  it('change case (a word, a selection, Shift+F3) leaves deleted ' +
    'text as it is, as the raw w:del', async () => {
    for (const [mode, sel] of [['upper', null], ['title', null],
      ['cycle', null], ['upper', 'all'], ['cycle', 'all'],
      ['toggle', 'all']]) {
      const out = [];
      for (const doc of await both()) {
        const d = new Document(doc), p = blocks(d.doc)[0];
        const id = blockId(p);
        const at = p.text.indexOf('new') + 1;
        const s = sel ? S.select({id, off: 0}, {id,
          off: p.text.length}) : S.caret({id, off: at});
        changeCase(d, new Typing(d), s, mode);
        const q = blocks(d.doc)[0];
        if (q.runs.some((x) => x.rev))
          assert.ok(q.text.includes('old'), mode + ': deleted kept');
        out.push(shown(q));
      }
      assert.equal(out[0], out[1], mode + ' ' + sel);
    }
  });
});

describe('remove link and paste over revisions', () => {
  const link = (inner) => '<w:hyperlink w:anchor="a">' + inner +
    '</w:hyperlink>';
  const unlink = async (body) => {
    const doc = await docOf(body);
    const d = new Document(doc);
    const k = blocks(d.doc).length - 1, p = blocks(d.doc)[k];
    const off = p.text.indexOf('\ufffc');
    const got = removeLink(d, new Typing(d),
      S.caret({id: blockId(p), off: off + 1}));
    assert.ok(!got.error, String(got.error));
    const back = await readDocx(await write(d.doc));
    assertSameDoc(back, expectedBack(d.doc));
    return blocks(d.doc)[k];
  };

  it('a revision inside a link becomes tagged runs when the link is ' +
    'taken apart, as the file read again gives', async () => {
    const p = await unlink(para(run('a ') + link(del(5, dRun('gone')) +
      run('kept'))));
    assert.deepEqual(tags(p), ['-', 'del5', '-']);
  });

  it('one whose id another revision of the document has (other ' +
    'attributes) stays raw, as the file read again gives', async () => {
    const p = await unlink(para(ins(5, run('x'), 'Bo')) +
      para(link(del(5, dRun('gone')) + run('kept'))));
    assert.ok(p.runs.every((r) => !r.rev));
    assert.ok(rawNames(p).includes('w:del'));
  });

  it('a typed table with tagged cells pasted in the same document: ' +
    'inserted text as text, deleted text left out', async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr>' +
      '<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>' +
      para(run('cell ') + del(7, dRun('old')) + ins(8, run('new'))) +
      '</w:tc></w:tr></w:tbl>';
    const doc = await docOf(para(run('before')) + tbl +
      para(run('after')));
    assert.equal(blocks(doc)[1].type, 'tbl', 'the table is typed');
    const d = new Document(doc);
    const [p0, , p2] = blocks(d.doc);
    const s = slice(d.doc, S.select({id: blockId(p0), off: 0},
      {id: blockId(p2), off: 0}));
    pasteBlocks(d, S.caret({id: blockId(p2), off: p2.text.length}),
      s.blocks, {sameDoc: true, styleNames: s.styleNames,
        styles: s.styles, lists: s.lists, pics: s.pics,
        picScope: s.picScope, notes: s.notes, comments: s.comments});
    const tables = blocks(d.doc).filter((b) => b.type === 'tbl');
    assert.equal(tables.length, 2);
    for (const b of blocks(d.doc)) checkBlock(b);
    const cellP = (t) => t.rows[0].cells[0].blocks[0];
    assert.deepEqual(tags(cellP(tables[0])), ['-', 'del7', 'ins8']);
    const copy = cellP(tables[1]);
    assert.equal(copy.text, 'cell new');
    assert.ok(copy.runs.every((r) => !r.rev));
    const back = await readDocx(await write(d.doc));
    assertSameDoc(back, expectedBack(d.doc));
  });
});

// ------------------------------------------------------------ corpus

/** The run-level revision elements of a main part, in order, as
 *  [name, attrs, text] (text: of every w:t and w:delText). */
function revsOf(root) {
  const out = [];
  const text = (n) => (typeof n === 'string' ? '' : /(^|:)(t|delText)$/
    .test(n.name) ? n.children.filter((c) => typeof c === 'string')
      .join('') : (n.children || []).map(text).join(''));
  const walk = (n, parent) => {
    if (!n || typeof n !== 'object' || !n.name) return;
    const l = n.name.split(':').pop();
    if (/^(ins|del|moveFrom|moveTo)$/.test(l) && parent === 'p') {
      out.push(JSON.stringify([l, n.attrs, text(n)]));
    }
    for (const c of n.children || []) walk(c, l);
  };
  walk(root, '');
  return out;
}

describe('revisions over the corpus', () => {
  it('every revision is written back with its attributes and text, ' +
    'and each file reads back the same', {skip: ALL ? false
    : SKIP_CORPUS}, async () => {
    const files = await revFiles();
    let modelled = 0, n = 0;
    for (const {file, path} of files) {
      const bytes = readFileSync(path);
      let doc;
      try { doc = await readDocx(bytes); } catch (e) { continue; }
      n++;
      for (const b of blocks(doc)) {
        if (b.type === 'p') modelled += b.runs.filter((r) => r.rev)
          .length;
      }
      const out = await write(doc);
      const main = async (x) => parseXml(dec.decode((await readZip(x))
        .get('word/document.xml')).replace(/^﻿/, '')).root;
      assert.deepEqual(revsOf(await main(out)), revsOf(await main(bytes)),
        file);
      assertSameDoc(await readDocx(out), expectedBack(doc), file);
    }
    assert.ok(n >= 18 && modelled > 50, `${n} files, ${modelled} runs`);
  });
});
