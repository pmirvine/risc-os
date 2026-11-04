// A Table of Contents inside a content control (./TocSdt): the body
// w:sdt Word's References > Table of Contents puts in (sdtPr with a
// docPartObj of the 'Table of Contents' gallery) is read as the
// paragraphs and tables it holds, each one carrying the one wrapper
// marker {name, attrs, pre, post, seq} (equal, seq included), written
// back around them: byte for byte as read, around what remains after
// an edit, and around blocks put in between. Any other w:sdt (no
// gallery, a section break inside, a child that is not a paragraph
// or a table) stays Opaque as before. Every written file goes to the
// real-Word check (emit).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {tocSdt, wrapBlocks} from '../../tools/moreapps/!Letters/TocSdt';
import {checkBlock, checkPara}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {rootScope} from '../../tools/moreapps/!Letters/Ns';
import {readBody} from '../../tools/moreapps/!Letters/ReadBody';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {begin, instr, sep, end} from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {emit} from './word-emit.mjs';
import {rng} from './word-docs.mjs';
import {splitPara, typeText} from '../../tools/moreapps/!Letters/Edit';
import {deleteBack, deleteForward}
  from '../../tools/moreapps/!Letters/EditDel';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {pasteBlocks, cutSelection}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {caret, select} from '../../tools/moreapps/!Letters/Selection';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {insertSection} from '../../tools/moreapps/!Letters/SectBreak';

const dec = new TextDecoder();
const DATE = new Date(2026, 10, 4, 9, 0);
const H = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);
const SDT_PR = '<w:sdtPr><w:id w:val="-1234567"/><w:docPartObj>' +
  '<w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/>' +
  '</w:docPartObj></w:sdtPr>';
const SDT_END = '<w:sdtEndPr><w:rPr><w:b/><w:bCs/></w:rPr>' +
  '</w:sdtEndPr>';
const sdt = (inner, pr = SDT_PR, endPr = SDT_END) =>
  `<w:sdt>${pr}${endPr}<w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
const TOC_IN = p(r('Contents'), '<w:pStyle w:val="TOCHeading"/>') +
  p(begin() + instr(' TOC \\o "1-3" \\h \\z \\u ') + sep() +
    r('Old entry')) + p(end());
const BODY = H(1, 'One') + sdt(TOC_IN) + H(1, 'Two');

const bytesOf = (body) => buildDocx({
  'word/document.xml': documentXml(body)});
const read = async (body) => readDocx(await bytesOf(body));
const blocks = (doc) => doc.sections[0].blocks;

/** The w:body element of a document.xml's bytes. */
function bodyOf(xml) {
  const {root} = parseXml(dec.decode(xml).replace(/^﻿/, ''));
  return root.children.find((c) => c && c.name === 'w:body');
}
const docXml = async (bytes) =>
  (await readZip(bytes)).get('word/document.xml');
/** The serialised w:body of a docx. */
const bodyText = async (bytes) =>
  serialize(bodyOf(await docXml(bytes)));
/** Write doc (fixed date), emitted for the real-Word check. */
async function save(doc, name) {
  const out = await writeDocx(doc, {date: DATE});
  emit('tocsdt-' + name, out);
  return out;
}
const sdtCount = (s) => (s.match(/<w:sdt>/g) || []).length;

describe('a TOC content control is read as its blocks', () => {
  it('(a) the three inner blocks share one marker', async () => {
    const doc = await read(BODY);
    const bs = blocks(doc);
    assert.deepEqual(bs.map((b) => b.type), ['p', 'p', 'p', 'p', 'p']);
    const W = bs[1].sdt;
    assert.ok(W && typeof W === 'object');
    assert.equal(bs[2].sdt, W);
    assert.equal(bs[3].sdt, W);
    assert.equal(bs[0].sdt, undefined);
    assert.equal(bs[4].sdt, undefined);
    assert.equal(W.name, 'w:sdt');
    // (Word's order: sdtPr, sdtEndPr, then the content)
    assert.deepEqual(W.pre.map((n) => n.name), ['w:sdtPr',
      'w:sdtEndPr']);
    assert.deepEqual(W.post, []);
    assert.deepEqual(W.attrs, []);
    assert.equal(W.seq, 1);
  });

  it('(b) written back byte for byte (sdtPr, sdtEndPr included)',
    async () => {
      // what the writer makes of the same blocks unwrapped, with
      // the w:sdt as read around the three
      const flat = await save(await read(H(1, 'One') + TOC_IN +
        H(1, 'Two')), 'flat');
      const f = await bodyText(flat);
      const a = f.indexOf('</w:p>') + 6, z = f.lastIndexOf('<w:p>');
      const want = f.slice(0, a) + '<w:sdt>' + SDT_PR + SDT_END +
        '<w:sdtContent>' + f.slice(a, z) + '</w:sdtContent></w:sdt>' +
        f.slice(z);
      const out = await save(await read(BODY), 'roundtrip');
      assert.equal(await bodyText(out), want);
      // and again: stable
      const again = await save(await readDocx(out), 'again');
      assert.equal(await bodyText(again), want);
    });

  it('the gallery name in any case; a wrapper in a later section',
    async () => {
      const pr = SDT_PR.replace('Table of Contents',
        'table of CONTENTS');
      const sect = p('', '<w:sectPr/>');
      const body = H(1, 'One') + sect + sdt(TOC_IN, pr) + H(1, 'Two');
      const bytes = await bytesOf(body);
      const doc = await readDocx(bytes);
      assert.equal(doc.sections.length, 2);
      assert.ok(doc.sections[1].blocks[0].sdt);
      const out = await save(doc, 'second-section');
      const got = await bodyText(out);
      assert.ok(got.includes('<w:sdt>' + pr + SDT_END +
        '<w:sdtContent><w:p><w:pPr><w:pStyle w:val="TOCHeading"/>'));
      assert.ok(got.indexOf('<w:sectPr/>') < got.indexOf('<w:sdt>'));
      const again = await save(await readDocx(out), 'second-again');
      assert.equal(await bodyText(again), got);
    });

  it('tocSdt and wrapBlocks, the helpers', () => {
    const {root} = parseXml('<w:document xmlns:w="http://schemas.' +
      'openxmlformats.org/wordprocessingml/2006/main">' +
      sdt(p(r('x'))) + '</w:document>');
    const map = rootScope(root);
    const got = tocSdt(root.children[0], map);
    assert.equal(got.name, 'w:sdt');
    assert.equal(got.content.length, 1);
    assert.equal(got.content[0].name, 'w:p');
    const W = {name: 'w:sdt', attrs: [['a', '1']], pre: ['P'],
      post: ['E']};
    const bs = [1, 2, 3, 4, 5].map((n) => ({type: 'p', n,
      sdt: n === 2 || n === 4 ? W : undefined}));
    const nodes = wrapBlocks(bs, (b) => b.n);
    assert.deepEqual(nodes, [1, {name: 'w:sdt', attrs: [['a', '1']],
      children: ['P', {name: 'w:sdtContent', attrs: [],
        children: [2, 3, 4]}, 'E']}, 5]);
  });
});

describe('other content controls stay Opaque', () => {
  const cases = [
    ['a plain sdt (no docPartObj)', sdt(TOC_IN,
      '<w:sdtPr><w:alias w:val="Box"/><w:id w:val="5"/></w:sdtPr>',
      '')],
    ['another gallery', sdt(TOC_IN, SDT_PR.replace(
      'Table of Contents', 'Cover Pages'))],
    ['a TOC sdt holding a section break', sdt(TOC_IN +
      p('', '<w:sectPr/>'))],
    ['an empty TOC sdt', sdt('')],
    ['a TOC sdt holding w:customXml', sdt(TOC_IN +
      '<w:customXml w:element="x">' + p(r('in xml')) +
      '</w:customXml>')],
  ];
  for (const [name, s] of cases) {
    it('(c) ' + name, async () => {
      const body = H(1, 'One') + s + H(1, 'Two');
      const bytes = await bytesOf(body);
      const doc = await readDocx(bytes);
      const bs = doc.sections.flatMap((x) => x.blocks);
      assert.ok(bs.some((b) => b.type === 'opaque' &&
        b.node.name === 'w:sdt'), 'kept Opaque');
      assert.ok(bs.every((b) => b.sdt === undefined));
      const out = await save(doc, 'opaque');
      const orig = bodyOf(await docXml(bytes)).children.find((c) =>
        c && c.name === 'w:sdt');
      assert.ok((await bodyText(out)).includes(serialize(orig)),
        'the w:sdt as read');
    });
  }
});

describe('limits and tables', () => {
  it('a wrapper that would pass the paragraph limit stays Opaque',
    () => {
      // (readDocx counts every w:p first: readBody's own limit)
      const {root} = parseXml(documentXml(BODY));
      const body = root.children.find((c) => c.name === 'w:body');
      const map = rootScope(root);
      const got = readBody(body, map, {maxParagraphs: 3});
      assert.deepEqual(got.sections[0].blocks.map((b) => b.type),
        ['p', 'opaque', 'p']);
      assert.equal(readBody(body, map, {maxParagraphs: 5}).sections[0]
        .blocks.length, 5);
      assert.throws(() => readBody(body, map, {maxParagraphs: 1}));
    });

  it('a table inside: typed, marked, written back inside', async () => {
    const t = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
      '</w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2000" ' +
      'w:type="dxa"/></w:tcPr>' + p(r('cell')) +
      '</w:tc></w:tr></w:tbl>';
    const doc = await read(H(1, 'One') + sdt(TOC_IN + t + p('')) +
      H(1, 'Two'));
    const bs = blocks(doc);
    assert.equal(bs[4].type, 'tbl');
    assert.equal(bs[4].sdt, bs[1].sdt);
    for (const b of bs) checkBlock(b);
    assert.throws(() => checkBlock({...bs[4], sdt: 1}), RangeError);
    const xml = dec.decode(await docXml(await save(doc, 'table')));
    const inner = xml.slice(xml.indexOf('<w:sdtContent>'),
      xml.indexOf('</w:sdtContent>'));
    assert.ok(inner.includes('<w:tbl>') && inner.includes('cell'));
  });

  it('many revisions and many wrappers: no copy of the ids each',
    () => {
      // Each wrapper once copied the body's revision ids and merged
      // them back: Map sets grew as revisions x wrappers.
      const N = 5000;
      let x = '';
      for (let i = 0; i < N; i++) {
        x += `<w:p><w:ins w:id="${i}" w:author="a" ` +
          'w:date="2026-01-01T00:00:00Z"><w:r><w:t>x</w:t></w:r>' +
          '</w:ins></w:p>';
      }
      for (let i = 0; i < N; i++) x += sdt(p(r('t')));
      x += `<w:sdt>${SDT_PR}<w:sdtContent><w:p><w:ins w:id="1" ` +
        'w:author="b" w:date="2026-01-01T00:00:00Z"><w:r><w:t>y' +
        '</w:t></w:r></w:ins></w:p></w:sdtContent></w:sdt>';
      const {root} = parseXml(documentXml(x));
      const body = root.children.find((c) => c.name === 'w:body');
      const map = rootScope(root);
      const set = Map.prototype.set;
      let sets = 0;
      Map.prototype.set = function (k, v) {
        sets++;
        return set.call(this, k, v);
      };
      let got;
      const t0 = Date.now();
      try {
        got = readBody(body, map, {});
      } finally {
        Map.prototype.set = set;
      }
      const ms = Date.now() - t0;
      const bs = got.sections[0].blocks;
      assert.equal(bs.length, 2 * N + 1);
      assert.equal(bs.filter((b) => b.sdt).length, N + 1);
      // the last wrapper reuses id 1 with another author: still seen
      // through the overlay, so that w:ins stays raw
      assert.ok(bs[1].runs.some((u) => u.rev));
      assert.ok(!bs[2 * N].runs.some((u) => u.rev));
      assert.ok(sets < 20 * N, `${sets} Map sets`);
      assert.ok(ms < 5000, `${ms} ms`);
    });
});

describe('the wrapper after an edit', () => {
  /** Remove count blocks at index i of the body; save; re-read. */
  async function removed(i, count, name) {
    const d = new Document(await read(BODY));
    d.apply({op: 'removeBlocks', at: [0, i], count});
    for (const b of blocks(d.doc)) checkBlock(b);
    const {bytes} = await lintAfter(d.doc, name);
    emit('tocsdt-' + name, bytes);
    const xml = dec.decode(await docXml(bytes));
    const back = await readDocx(bytes);
    return {xml, back: blocks(back)};
  }

  it('(d) the first wrapped block removed', async () => {
    const {xml, back} = await removed(1, 1, 'first-gone');
    assert.equal(sdtCount(xml), 1);
    assert.ok(xml.includes(SDT_PR) && xml.includes(SDT_END));
    assert.equal(back.length, 4);
    assert.ok(back[1].sdt && back[1].sdt === back[2].sdt);
    assert.equal(back[3].sdt, undefined);
  });

  it('(d) the last wrapped block removed', async () => {
    const {xml, back} = await removed(3, 1, 'last-gone');
    assert.equal(sdtCount(xml), 1);
    assert.equal(back.length, 4);
    assert.ok(back[1].sdt && back[1].sdt === back[2].sdt);
    assert.equal(back[3].sdt, undefined);
  });

  it('(d) every wrapped block removed: no wrapper', async () => {
    const {xml, back} = await removed(1, 3, 'all-gone');
    assert.equal(sdtCount(xml), 0);
    assert.equal(back.length, 2);
    assert.ok(back.every((b) => b.sdt === undefined));
  });

  it('(e) a block put in between lands inside the wrapper',
    async () => {
      const d = new Document(await read(BODY));
      const np = newPara('Inserted');
      d.apply({op: 'insertBlocks', at: [0, 2],
        blocks: [np]});
      assert.equal(blocks(d.doc)[2].sdt, undefined);
      const {bytes} = await lintAfter(d.doc, 'inserted');
      emit('tocsdt-inserted', bytes);
      const xml = dec.decode(await docXml(bytes));
      assert.equal(sdtCount(xml), 1);
      const inner = xml.slice(xml.indexOf('<w:sdtContent>'),
        xml.indexOf('</w:sdtContent>'));
      assert.ok(inner.includes('Inserted'));
      const back = blocks(await readDocx(bytes));
      assert.equal(back.length, 6);
      assert.ok(back.slice(1, 5).every((b) => b.sdt === back[1].sdt &&
        b.sdt));
    });

  it('a block put before or after the wrapper stays outside',
    async () => {
      const d = new Document(await read(BODY));
      d.apply({op: 'insertBlocks', at: [0, 1],
        blocks: [newPara('Before')]});
      d.apply({op: 'insertBlocks', at: [0, 5],
        blocks: [newPara('After')]});
      const {bytes} = await lintAfter(d.doc, 'outside');
      const xml = dec.decode(await docXml(bytes));
      const inner = xml.slice(xml.indexOf('<w:sdtContent>'),
        xml.indexOf('</w:sdtContent>'));
      assert.ok(!inner.includes('Before') && !inner.includes('After'));
    });

  it('a copy of the marker (deep-equal, not the same object) joins ' +
    'the same wrapper', async () => {
    const doc = await read(BODY);
    const bs = blocks(doc);
    bs[2] = {...bs[2], sdt: structuredClone(bs[2].sdt)};
    const xml = dec.decode(await docXml(await save(doc, 'copied')));
    assert.equal(sdtCount(xml), 1);
  });

  it('two wrappers with equal sdtPr (no w:id) and a paragraph ' +
    'between stay two, also with a block copied', async () => {
    const pr = '<w:sdtPr><w:docPartObj><w:docPartGallery ' +
      'w:val="Table of Contents"/></w:docPartObj></w:sdtPr>';
    const two = sdt(p(r('A')), pr, '') + p(r('Between')) +
      sdt(p(r('B')), pr, '') + p(r('end'));
    const doc = await read(two);
    const bs = blocks(doc);
    assert.notEqual(bs[0].sdt, bs[2].sdt);
    const check = async (d, name) => {
      const xml = dec.decode(await docXml(await save(d, name)));
      assert.equal(sdtCount(xml), 2, name);
      const i = xml.indexOf('Between');
      assert.ok(xml.lastIndexOf('</w:sdt>', i) > 0 &&
        xml.indexOf('<w:sdt>', i) > i, 'Between outside: ' + name);
    };
    await check(doc, 'two');
    bs[0] = {...bs[0], sdt: structuredClone(bs[0].sdt)};
    bs[2] = {...bs[2], sdt: structuredClone(bs[2].sdt)};
    await check(doc, 'two-copied');
  });
});

describe('ModelCheck and the marker', () => {
  it('(g) a document with the marker passes', async () => {
    const doc = await read(BODY);
    for (const b of blocks(doc)) checkBlock(b);
  });

  it('(g) a bad marker is refused', async () => {
    const doc = await read(BODY);
    const b = blocks(doc)[1];
    for (const bad of [5, null, 'x', {pre: [], post: 1},
      {pre: 'a', post: []}, {post: []},
      {...b.sdt, seq: 'one'}]) {
      assert.throws(() => checkPara({...b, sdt: bad}), RangeError,
        JSON.stringify(bad));
    }
  });
});

// ------------------------------------------------ editing (Task 4)
// Return, Backspace, typed lines, copy, cut and paste at and around
// the first and last wrapped paragraph: the wrapper stays one valid
// w:sdt; a copy on the clipboard drops the marker (pasted blocks are
// plain, never re-wrapped); undo gives back the model as it was.

const ENTRIES = p(r('Contents'), '<w:pStyle w:val="TOCHeading"/>') +
  p(r('Entry one')) + p(r('Entry two'));
const SIMPLE = H(1, 'One') + sdt(ENTRIES) + H(1, 'Two');
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2000" ' +
  'w:type="dxa"/></w:tcPr>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
const WITH_TBL = H(1, 'One') + sdt(p(r('Contents')) +
  p(r('Entry one')) + TBL + p(r('Entry two'))) + H(1, 'Two');

const textOf = (b) => (b.type === 'p' ? b.text : '[' + b.type + ']');
/** Save d's doc (lint clean, emitted), re-read: {xml, all, inside}
 *  (the texts of every block and of the wrapped ones). */
async function saved(doc, name) {
  for (const b of blocks(doc)) checkBlock(b);
  const {bytes} = await lintAfter(doc, name);
  emit('tocsdt-' + name, bytes);
  const xml = dec.decode(await docXml(bytes));
  parseXml(xml);
  const back = (await readDocx(bytes)).sections.flatMap((s) =>
    s.blocks);
  return {xml, all: back.map(textOf),
    inside: back.filter((b) => b.sdt).map(textOf)};
}
const idAt = (d, i) => blocks(d.doc)[i].id;
const at = (d, i, off) => caret({id: idAt(d, i), off});

describe('editing around a wrapped contents table', () => {
  it('Return in a wrapped paragraph keeps one wrapper around both ' +
    'halves', async () => {
    for (const [i, off, want, name] of [
      [3, 9, ['Contents', 'Entry one', 'Entry two', ''], 'last-end'],
      [3, 5, ['Contents', 'Entry one', 'Entry', ' two'], 'last-mid'],
      [1, 0, ['', 'Contents', 'Entry one', 'Entry two'],
        'first-start'],
      [1, 8, ['Contents', '', 'Entry one', 'Entry two'], 'first-end'],
    ]) {
      const d = new Document(await read(SIMPLE));
      splitPara(d, at(d, i, off));
      const bs = blocks(d.doc);
      assert.equal(bs[i + 1].sdt, bs[i].sdt, 'same marker');
      const {xml, inside, all} = await saved(d.doc,
        'return-' + name);
      assert.equal(sdtCount(xml), 1);
      assert.deepEqual(inside, want, `Return at ${i}/${off}`);
      assert.equal(all[0], 'One');
      assert.equal(all[all.length - 1], 'Two');
    }
  });

  it('typed lines in the last wrapped paragraph stay inside',
    async () => {
      const d = new Document(await read(SIMPLE));
      typeText(d, at(d, 3, 5), 'A\nB\nC');
      const {xml, inside} = await saved(d.doc, 'lines');
      assert.equal(sdtCount(xml), 1);
      assert.deepEqual(inside, ['Contents', 'Entry one', 'EntryA', 'B',
        'C two']);
    });

  it('Backspace joining wrapped paragraphs keeps the wrapper',
    async () => {
      for (const [i, want, all] of [
        // into the last wrapped one: its marker, "Two" goes in
        [4, ['Contents', 'Entry one', 'Entry twoTwo'],
          ['One', 'Contents', 'Entry one', 'Entry twoTwo']],
        // inside
        [3, ['Contents', 'Entry oneEntry two'], null],
        // the first wrapped one into "One" (unmarked: the first's
        // marker): its text leaves the wrapper
        [1, ['Entry one', 'Entry two'],
          ['OneContents', 'Entry one', 'Entry two', 'Two']],
      ]) {
        const d = new Document(await read(SIMPLE));
        deleteBack(d, at(d, i, 0));
        const s = await saved(d.doc, 'join-' +
          {4: 'after', 3: 'inside', 1: 'first'}[i]);
        assert.equal(sdtCount(s.xml), 1);
        assert.deepEqual(s.inside, want, `join at ${i}`);
        if (all) assert.deepEqual(s.all, all);
      }
    });

  it('Delete joining the paragraph after into the last wrapped one',
    async () => {
      const d = new Document(await read(SIMPLE));
      deleteForward(d, at(d, 3, 9));
      const s = await saved(d.doc, 'join-forward');
      assert.equal(sdtCount(s.xml), 1);
      assert.deepEqual(s.all, ['One', 'Contents', 'Entry one',
        'Entry twoTwo']);
    });

  /** A copy of [from, to] of d (slice), as ./ClipPick hands it. */
  const copy = (d, from, to) => {
    const s = slice(d.doc, select(from, to));
    assert.ok(s);
    const {blocks: bl, ...rest} = s;
    return {blocks: bl, opts: rest};
  };

  it('copy and paste of wrapped paragraphs into the same and ' +
    'another document gives plain paragraphs', async () => {
    const src = new Document(await read(WITH_TBL));
    // Entry one, the table, "Entry" of Entry two
    const c = copy(src, {id: idAt(src, 2), off: 0},
      {id: idAt(src, 4), off: 5});
    assert.ok(c.blocks.every((b) => b.sdt === undefined),
      'the clipboard holds no marker');
    // the same document, after the wrapper (end of "Two")
    const d = new Document(await read(WITH_TBL));
    pasteBlocks(d, at(d, 5, 3), c.blocks, {...c.opts, sameDoc: true});
    const n = blocks(d.doc).length;
    assert.ok(blocks(d.doc).slice(5).every((b) => !b.sdt));
    let s = await saved(d.doc, 'paste-same');
    assert.equal(sdtCount(s.xml), 1);
    assert.deepEqual(s.inside, ['Contents', 'Entry one', '[tbl]',
      'Entry two']);
    assert.equal(s.all.length, n);
    // another document
    const o = new Document(await read(H(1, 'Other') + p(r('end'))));
    pasteBlocks(o, at(o, 0, 5), c.blocks, {...c.opts, sameDoc: false});
    assert.ok(blocks(o.doc).every((b) => !b.sdt));
    s = await saved(o.doc, 'paste-other');
    assert.equal(sdtCount(s.xml), 0);
    assert.deepEqual(s.all, ['OtherEntry one', '[tbl]', 'Entry',
      'end']);
  });

  it('paste into the last wrapped paragraph: its head and tail ' +
    'stay inside, the pasted blocks between them too', async () => {
    const d = new Document(await read(SIMPLE));
    const c = copy(d, {id: idAt(d, 0), off: 0}, {id: idAt(d, 1),
      off: 3});
    pasteBlocks(d, at(d, 3, 5), c.blocks, {...c.opts, sameDoc: true});
    const s = await saved(d.doc, 'paste-into');
    assert.equal(sdtCount(s.xml), 1);
    assert.deepEqual(s.inside, ['Contents', 'Entry one', 'EntryOne',
      'Con two']);
    assert.equal(s.all[s.all.length - 1], 'Two');
  });

  it('cut of wrapped paragraphs and paste in the same document',
    async () => {
      const d = new Document(await read(WITH_TBL));
      const from = {id: idAt(d, 1), off: 4}, to = {id: idAt(d, 4),
        off: 5};
      const c = copy(d, from, to);
      const out = cutSelection(d, select(from, to)).sel;
      let s = await saved(d.doc, 'cut');
      assert.ok(sdtCount(s.xml) <= 1);
      assert.deepEqual(s.all, ['One', 'Cont two', 'Two']);
      pasteBlocks(d, out, c.blocks, {...c.opts, sameDoc: true});
      s = await saved(d.doc, 'cut-paste');
      assert.ok(sdtCount(s.xml) <= 1);
      assert.deepEqual(s.all, ['One', 'Contents', 'Entry one', '[tbl]',
        'Entry two', 'Two']);
    });

  it('undo after each edit restores deepEqual', async () => {
    const edits = [
      ['return last', (d) => splitPara(d, at(d, 3, 9))],
      ['return first', (d) => splitPara(d, at(d, 1, 0))],
      ['lines', (d) => typeText(d, at(d, 3, 5), 'x\ny')],
      ['join after', (d) => deleteBack(d, at(d, 4, 0))],
      ['join first', (d) => deleteBack(d, at(d, 1, 0))],
      ['paste', (d) => {
        const c = copy(d, {id: idAt(d, 0), off: 1},
          {id: idAt(d, 2), off: 2});
        pasteBlocks(d, at(d, 3, 5), c.blocks, {...c.opts,
          sameDoc: true});
      }],
      ['cut', (d) => cutSelection(d, select({id: idAt(d, 1), off: 2},
        {id: idAt(d, 4), off: 1}))],
    ];
    const orig = await read(SIMPLE);
    const want = await bodyText(await writeDocx(orig, {date: DATE}));
    for (const [name, fn] of edits) {
      const d = new Document(await read(SIMPLE));
      const before = structuredClone(blocks(d.doc));
      fn(d);
      const after = structuredClone(blocks(d.doc));
      while (d.undo());
      assert.deepEqual(blocks(d.doc), before, 'undo: ' + name);
      assert.equal(await bodyText(await writeDocx(d.doc,
        {date: DATE})), want, 'undo written: ' + name);
      while (d.redo());
      assert.deepEqual(blocks(d.doc), after, 'redo: ' + name);
    }
  });

  it('a section break inside the wrapper: a control per section, ' +
    'both read back as contents tables', async () => {
    const d = new Document(await read(SIMPLE));
    const got = insertSection(d, new Typing(d), at(d, 2, 5),
      'nextPage');
    assert.ok(got);
    assert.equal(d.doc.sections.length, 2);
    const {bytes} = await lintAfter(d.doc, 'sect-inside');
    emit('tocsdt-sect-inside', bytes);
    const xml = dec.decode(await docXml(bytes));
    parseXml(xml);
    assert.equal(sdtCount(xml), 2);
    const back = await readDocx(bytes);
    assert.equal(back.sections.length, 2);
    const all = back.sections.flatMap((s) => s.blocks);
    const seqs = [...new Set(all.filter((b) => b.sdt)
      .map((b) => b.sdt.seq))];
    assert.equal(seqs.length, 2, 'two controls, both typed');
    assert.deepEqual(all.filter((b) => b.sdt).map(textOf),
      ['Contents', 'Entry', ' one', 'Entry two']);
    assert.deepEqual(all.map(textOf), ['One', 'Contents', 'Entry', '',
      ' one', 'Entry two', 'Two']);
    for (const b of all) checkBlock(b);
  });
});

describe('seeded edit fuzz around the wrapper', () => {
  // FUZZ_SEEDS=n (as tables-fuzz): seeds 1..n, default 200
  const SEEDS = Number(process.env.FUZZ_SEEDS || 200);
  const STEPS = 12;

  /** One random edit at or next to the first / last wrapped block. */
  function step(rd, d) {
    const bs = blocks(d.doc);
    const marked = bs.map((b, i) => (b.sdt ? i : -1))
      .filter((i) => i >= 0);
    const ends = marked.length ? [marked[0],
      marked[marked.length - 1]] : [0, bs.length - 1];
    const pick = (a) => a[Math.floor(rd() * a.length)];
    const i = Math.max(0, Math.min(bs.length - 1, pick(ends) +
      pick([-1, 0, 0, 1])));
    const b = bs[i];
    if (b.type !== 'p') return 'skip';
    const off = pick([0, b.text.length,
      Math.floor(rd() * (b.text.length + 1))]);
    const sel = caret({id: b.id, off});
    const x = rd();
    if (x < 0.2) { typeText(d, sel, pick(['z', 'ab', 'q\nr'])); }
    else if (x < 0.4) splitPara(d, sel);
    else if (x < 0.55) deleteBack(d, sel);
    else if (x < 0.7) deleteForward(d, sel);
    else if (x < 0.82 && bs.length > 2) {
      d.apply({op: 'removeBlocks', at: [0, i], count: 1});
    } else if (x < 0.92) {
      const j = Math.min(bs.length - 1, i + 1);
      const c = slice(d.doc, select({id: b.id, off: 0},
        {id: bs[j].id, off: bs[j].type === 'p' ? bs[j].text.length
          : 1}));
      if (c) {
        const {blocks: bl, ...rest} = c;
        const k = pick(ends);
        const to = blocks(d.doc)[k];
        if (to.type === 'p') pasteBlocks(d, caret({id: to.id,
          off: pick([0, to.text.length])}), bl, {...rest,
          sameDoc: true});
      }
    } else d.undo();
    return 'ok';
  }

  it(`${SEEDS} seeds of ${STEPS} edits: well-formed, one wrapper ` +
    'at most, the same text, re-readable', async () => {
    const start = await read(WITH_TBL);
    let wrapped = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rd = rng(seed);
      const d = new Document(structuredClone(start));
      for (let k = 0; k < STEPS; k++) step(rd, d);
      for (const b of blocks(d.doc)) checkBlock(b);
      const bytes = await writeDocx(d.doc, {date: DATE});
      if (seed <= 4) emit('tocsdt-fuzz-' + ['first', 'second',
        'third', 'fourth'][seed - 1], bytes);
      const xml = dec.decode(await docXml(bytes));
      assert.doesNotThrow(() => parseXml(xml), 'seed ' + seed);
      const n = sdtCount(xml);
      assert.ok(n <= 1, `seed ${seed}: ${n} wrappers`);
      wrapped += n;
      const back = (await readDocx(bytes)).sections.flatMap((s) =>
        s.blocks);
      const mine = d.doc.sections.flatMap((s) => s.blocks).map(textOf);
      let got = back.map(textOf);
      // (a wrapper ending the section gains one empty carrier)
      if (got.length === mine.length + 1 && got[got.length - 1] === '')
        got = got.slice(0, -1);
      assert.deepEqual(got, mine, 'seed ' + seed);
      assert.equal(back.filter((b) => b.sdt).length > 0, n === 1,
        'seed ' + seed + ': read back as wrapped');
    }
    assert.ok(wrapped > SEEDS / 4, 'most runs keep a wrapper');
  });
});
