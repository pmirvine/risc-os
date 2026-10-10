// Pictures round trip (Batch B, B8.1): documents changed with !Word's
// picture commands (./InsertPicture insert, ./PicOps setPicture for
// the size and alt text, delete, copy and paste within one document
// and between documents through ./ClipSlice, ./ClipPick and
// ./ClipPaste), mixed with typing, Enter, deleting and bursts of undo
// and redo, then written and read back.
// The checks are those of roundtrip-lib.mjs: the model read back
// equals the changed model; every block passes ModelCheck; the
// package linter and xmllint/wml.xsd (when available, for one seed)
// add no error; undo of everything gives back the opened model and
// its bytes. Besides: a command that is refused (RangeError) changes
// nothing (no undo step, no change to the model); undo of everything
// gives back the same parts Map and the same relationships array;
// every media part the opened file had is written with its bytes
// (a picture deleted leaves its part: plan R7).
//
// Documents: the reader fixtures, the picture fixtures (inline, a
// floating one, one without an a:xfrm, a crop, duplicate docPr ids,
// Strict, a missing part), plain text, and the corpus sample, gated
// as the other round trips (one file in ten by a hash of the name;
// WORD_EDIT_CORPUS=1 for every file, which needs
// NODE_OPTIONS=--max-old-space-size=4096). With WORD_EDIT_CORPUS=1
// also: every corpus file untouched writes the same bytes twice over
// (written, read, written), media parts and all.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIXTURES} from './docx-fixtures.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {picDocx, pngBytes, jpegBytes, gifBytes} from './pic-fixtures.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS, write, nameOf} from './roundtrip-lib.mjs';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {Document} from '../../tools/moreapps/!Word/Document';
import {rng} from './word-docs.mjs';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as S from '../../tools/moreapps/!Word/Selection';
import {insert} from '../../tools/moreapps/!Word/InsertPicture';
import {setPicture} from '../../tools/moreapps/!Word/PicOps';
import {pictureOf, docMap} from '../../tools/moreapps/!Word/PicRead';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {lintPackage} from './lint-package.mjs';
import {sameBytes, sameTree} from './docx-compare.mjs';

export const STEPS = 40;
const PICS_MS = 3000;
const pickOf = (rd, a) => a[Math.floor(rd() * a.length)];
const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pickOf(rd, graphemes(b.text))};
}

/** A random caret or selection (often within one paragraph). */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.35) return S.caret(a);
  if (rd() < 0.5 && bs[k].type === 'p') return S.select(a, posIn(rd, bs[k]));
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * (rd() < 0.1 ? bs.length : 3))));
  return S.select(a, posIn(rd, bs[k2]));
}

/** Every picture of d: selections of its one character. */
function picSels(d) {
  const m = docMap(d.doc), out = [];
  for (const b of allBlocks(d)) {
    if (b.type !== 'p') continue;
    for (const [off, x] of Object.entries(b.inlines || {})) {
      if (x && x.node && pictureOf(x.node, m)) {
        out.push(S.select({id: b.id, off: +off},
          {id: b.id, off: +off + 1}));
      }
    }
  }
  return out;
}
const onePic = (rd, d) => {
  const l = picSels(d);
  return l.length ? pickOf(rd, l) : null;
};

const BYTES = () => [pngBytes(96, 48), pngBytes(10, 10, {dpi: 300}),
  jpegBytes(1, 1), jpegBytes(1, 1, {density: 118, units: 2}),
  gifBytes(8, 8), new Uint8Array(0), new Uint8Array(100).fill(7),
  pngBytes(100000, 100000), jpegBytes(65535, 65535),
  gifBytes(10, 10, {frameW: 2000, frameH: 2000}),
  new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  null, 'png', 5];
const EXTENTS = [undefined, 9525, 20116800, 914400, 457200, 123457, 0, -1,
  1e9, 12.5, 2 ** 31, NaN, Infinity, 'x', null, {}, 9524, 20116801];
const ALTS = [undefined, '', 'a cat', 'A < & " > é', 'x'.repeat(1024),
  'x'.repeat(1025), 'a\u0001b', 'a\tb', null, 5, {}, 'line\nbreak'];

export const KINDS = ['insert', 'resize', 'alt', 'delete picture',
  'copy paste', 'paste across', 'type', 'enter', 'delete range',
  'undo/redo'];
const CHANGES = ['insert', 'resize', 'alt', 'delete picture',
  'copy paste', 'paste across', 'type'];

/** The picture source documents paste across come from. */
let SRC = null;
async function source() {
  if (!SRC) {
    SRC = new Document(await readDocx(await picDocx({pics: [
      {descr: 'one', srcRect: {l: 1000, t: 2000}},
      {ext: 'jpeg', bytes: jpegBytes(1, 1), cx: 123456, cy: 654321},
      {kind: 'anchor', id: 3, bytes: gifBytes(4, 4), ext: 'gif'}]})));
  }
  return SRC;
}

/** Copy sel in src, paste at `at` in dst as ./EditClip does. */
function copyPaste(src, sel, dst, at, sameDoc) {
  const store = new ClipStore();
  const s = slice(src.doc, sel);
  if (!s || !s.blocks.length) return null;
  const token = store.put(s, 1);
  const html = toHtml(src.doc, s, {token});
  const x = pick({text: s.plain, html}, {store,
    docKey: sameDoc ? 1 : 2, parseHtml: null});
  if (!x || x.route !== 'exact') return null;
  return pasteBlocks(dst, at, x.blocks, x.opts);
}

const attempt = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return {error: e.message};
  }
};

/** One random command; [kind, selection after]. */
function command(rd, d, t, sel, every, src) {
  const x = rd();
  if (x < 0.1) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (!sel) return ['none', null];
  const depth = d.undoDepth;
  const before = every ? structuredClone(d.doc.sections) : null;
  const parts = d.doc.parts, rels = d.doc.rels;
  let kind, res;
  if (x < 0.25) {
    kind = 'insert';
    const bytes = pickOf(rd, BYTES());
    res = attempt(() => t.command(() => insert(d, sel, {bytes})));
  } else if (x < 0.4) {
    kind = 'resize';
    const ps = onePic(rd, d) || sel;
    const o = {};
    if (rd() < 0.8) o.cx = pickOf(rd, EXTENTS);
    if (rd() < 0.8) o.cy = pickOf(rd, EXTENTS);
    res = attempt(() => t.command(() => setPicture(d, ps, o)));
  } else if (x < 0.52) {
    kind = 'alt';
    const ps = onePic(rd, d) || sel;
    res = attempt(() => t.command(() => setPicture(d, ps,
      {descr: pickOf(rd, ALTS)})));
  } else if (x < 0.6) {
    kind = 'delete picture';
    res = run('delete', d, t, onePic(rd, d) || sel);
  } else if (x < 0.72) {
    kind = 'copy paste';
    const from = onePic(rd, d) || randSel(rd, d);
    res = attempt(() => ({sel: copyPaste(d, from, d, sel, true)}));
    if (res && res.sel === null) res = null;
  } else if (x < 0.8) {
    kind = 'paste across';
    const all = S.select({id: blockId(allBlocks(src)[0]), off: 0},
      {id: blockId(allBlocks(src).at(-1)), off: allBlocks(src).at(-1)
        .text.length});
    res = attempt(() => ({sel: copyPaste(src, all, d, sel, false)}));
    if (res && res.sel === null) res = null;
  } else if (x < 0.88) {
    kind = 'type';
    res = {sel: t.type(sel, pickOf(rd, ['a', ' ', 'word ', 'é']))};
  } else if (x < 0.94) {
    kind = 'enter';
    res = run('enter', d, t, sel);
  } else {
    kind = 'delete range';
    const to = randSel(rd, d);
    res = run('delete', d, t, to ? S.select(sel.anchor, to.head) : sel);
  }
  if (res && res.error !== undefined) {
    assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
    assert.equal(d.doc.parts, parts, kind + ' refused: same parts');
    assert.equal(d.doc.rels, rels, kind + ' refused: same rels');
    if (before) assert.deepEqual(d.doc.sections, before,
      kind + ' refused: unchanged');
    return [kind + ' refused', sel];
  }
  if (res === undefined || res === null) return [kind + ' none', sel];
  return [kind, res.sel || res || sel];
}

/** STEPS commands on d. */
export async function picsAll(d, seed, {every = false, steps = STEPS} = {}) {
  const rd = rng(seed);
  const src = await source();
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < steps; k++) {
    if (Date.now() - t0 > PICS_MS) break;
    if (!sel || rd() < 0.5) sel = randSel(rd, d);
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel] = command(rd, d, t, sel, every, src);
      if (every) for (const b of allBlocks(d)) checkBlock(b);
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
    if (d.undoDepth > depth) {
      counts[kind + ' changed'] = (counts[kind + ' changed'] || 0) + 1;
    }
  }
  for (const b of allBlocks(d)) checkBlock(b);
  return {steps: k, capped: k < steps, counts};
}

// ------------------------------------------------------------ documents

const DUP = {id: 7};
const doc = (o) => () => picDocx(o);
const PICS = [
  ['pictures: inline, floating, no xfrm, crop, missing part, ' +
    'duplicate ids', doc({body: p(r('text after')), pics: [
    {descr: 'first', id: 7}, {kind: 'anchor', id: 7, bytes:
      jpegBytes(1, 1), ext: 'jpeg'}, {xfrm: false, ext: 'gif',
      bytes: gifBytes(4, 4)}, {srcRect: {l: 1000, r: 2000}},
    {bytes: null}, {...DUP, embed: 'rId11', rel: false, bytes: null}]})],
  ['a Strict document with a picture', doc({strict: true, pics: [
    {descr: 'strict', cx: 1828800, cy: 914400}]})],
  ['one picture and text', doc({body: p(r('one two three')) +
    p(r('four')), pics: [{}]})],
  ['plain text only', () => buildDocx({'word/document.xml':
    documentXml(p(r('hello world')) + p(r('second')))})],
  ['empty document', () => buildDocx({'word/document.xml':
    documentXml('')})],
];

const {xsd, note: xsdNote} = schema();
const DOCS = [...FIXTURES.filter(([n]) => n !== 'lossless rule'), ...PICS];

describe('pictures round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 2; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k, picsAll,
          {xsd: k === 0 ? xsd : null, every: true});
        if (res.refused) continue;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# picture commands (generated): ' + JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 3, kind + ' ran: ' + JSON.stringify(total));
    }
    for (const kind of CHANGES) {
      assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
    }
    assert.ok(Object.keys(total).some((k) => k.endsWith(' refused')),
      'a refused command ran');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

// ------------------------------------------------------------ pinned

const text = (zip, n) => new TextDecoder().decode(zip.get(n));
const problems = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error');
const mediaOf = (zip) => [...zip.keys()].filter((k) => /\/media\//
  .test(k)).sort();

describe('pictures round trip: pinned cases', () => {
  it('several seeds: undo of everything gives back the same parts Map ' +
    'and relationships array, and the bytes of the opened document',
  async () => {
    const bytes = await picDocx({pics: [{descr: 'a'}, {ext: 'jpeg',
      bytes: jpegBytes(1, 1)}]});
    for (let seed = 1; seed <= 12; seed++) {
      const d = new Document(await readDocx(bytes));
      const {parts, rels} = d.doc;
      const out0 = await write(d.doc);
      const before = structuredClone(d.doc.sections);
      const st = await picsAll(d, seed, {steps: 60});
      assert.ok(st.steps > 0);
      while (d.undo());
      assert.equal(d.doc.parts, parts, 'seed ' + seed + ': same Map');
      assert.equal(d.doc.rels, rels, 'seed ' + seed + ': same array');
      sameTree(d.doc.sections, before, 'seed ' + seed);
      assert.ok(sameBytes(await write(d.doc), out0), 'seed ' + seed);
    }
  });
  it('a picture deleted leaves its media part and relationship; ' +
    'everything the file had is written as it was', async () => {
    const bytes = await picDocx({pics: [{descr: 'a'}, {ext: 'jpeg',
      bytes: jpegBytes(1, 1)}]});
    const was = await readZip(bytes);
    const d = new Document(await readDocx(bytes));
    const t = new Typing(d, {now: () => 0});
    const first = picSels(d)[0];
    run('delete', d, t, first);
    assert.equal(picSels(d).length, 1);
    const z = await readZip(await write(d.doc));
    assert.deepEqual(mediaOf(z), mediaOf(was));
    for (const n of mediaOf(was)) {
      assert.ok(sameBytes(z.get(n), was.get(n)), n);
    }
    assert.match(text(z, 'word/_rels/document.xml.rels'),
      /media\/image1\.png/);
    assert.deepEqual(problems(z), []);
  });
  it('Strict: an inserted picture has a Strict relationship and no ' +
    'Transitional drawing namespace in the main part', async () => {
    const d = new Document(await readDocx(await picDocx({strict: true,
      body: p(r('text')), pics: []})));
    const t = new Typing(d, {now: () => 0});
    const b = allBlocks(d)[0];
    t.command(() => insert(d, S.caret({id: b.id, off: 2}),
      {bytes: pngBytes(20, 10)}));
    const z = await readZip(await write(d.doc));
    const main = text(z, 'word/document.xml');
    assert.match(main, /<w:drawing/);
    assert.ok(!/schemas\.openxmlformats\.org\/drawingml/.test(main),
      'no Transitional drawing URI');
    assert.match(text(z, 'word/_rels/document.xml.rels'),
      /purl\.oclc\.org\/ooxml\/officeDocument\/relationships\/image/);
    assert.deepEqual(problems(z), []);
  });
});

// ------------------------------------------------------------ corpus

const files = corpusFiles();

describe('pictures round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} picture commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () =>
    corpusRun(files, picsAll, xsd, xsdNote, 'pictures-edited corpus'));
  it('untouched, every file writes the same bytes twice over, media ' +
    'parts as they were', {skip: ALL ? false : 'WORD_EDIT_CORPUS=1'},
  async () => {
    const bad = [];
    let n = 0, media = 0;
    for (const f of files) {
      const name = nameOf(f);
      let a;
      try {
        a = await readDocx(readFileSync(f));
      } catch (e) {
        if (e instanceof DocxError) continue;
        throw e;
      }
      const out1 = await write(a);
      const out2 = await write(await readDocx(out1));
      n++;
      if (!sameBytes(out1, out2)) bad.push(name + ': not stable');
      const z = await readZip(out1);
      const zin = await readZip(readFileSync(f));
      for (const k of mediaOf(zin)) {
        media++;
        if (!z.get(k) || !sameBytes(z.get(k), zin.get(k))) {
          bad.push(name + ': ' + k + ' changed');
        }
      }
    }
    console.log(`# untouched corpus: ${n} files byte-stable, ${media} ` +
      `media parts identical, ${bad.length} failures`);
    assert.deepEqual(bad.slice(0, 10), []);
  });
});
