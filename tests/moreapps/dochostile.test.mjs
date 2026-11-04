// .doc import, task 16: hostile files (as ./odthostile.test.mjs for
// ODT). Each must read (with notes) or be refused with an
// ImportError, never throw anything else, never hang (under 2 s each,
// MAX_MS), never hold much memory (the process's peak RSS grows by
// less than MAX_RSS in a case), and what it reads must be a sound Doc
// (checkBlock) with no "could not be read" note (a handler that
// threw). The inputs are spec-derived fixtures (./doc-helpers.mjs,
// ./doc-review-helpers.mjs, from [MS-CFB] and [MS-DOC]) broken on
// purpose, and a seeded fuzz of 300 mutated copies of one rich
// document (richDoc: styles, runs, a list, a table, a picture, two
// sections with headers, a footnote, a comment, fields, tracked
// changes, a bookmark; ./doc-corpus.mjs mutateDoc says how they are
// mutated). The structure-by-structure bounds are in the task 16
// findings; the probes for the budgets are in docprobe.test.mjs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {MAX_PIECES} from '../../tools/moreapps/!Letters/DocPieces';
import {MAX_PARAGRAPHS} from '../../tools/moreapps/!Letters/Open';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {makeCfbLayout, packDoc, docStreams, makeDoc, clxOf, prl,
  u32le, chpxPage, papxPage} from './doc-helpers.mjs';
import {reviewDoc, richDoc} from './doc-review-helpers.mjs';
import {mulberry32, mutateDoc} from './doc-corpus.mjs';
import {emit} from './word-emit.mjs';

const MAX_MS = 2000;
const MAX_RSS = 400 * 1048576;
const DATE = new Date(2024, 4, 6, 7, 8, 10);
// (toocomplex is the ODT reader's alone, never a .doc's)
const CODES = ['bad', 'not-word', 'old', 'encrypted', 'too-big'];
const peak = () => process.resourceUsage().maxRSS * 1024;

/** Every block of the Doc: the body's and the stories', notes' and
 *  comments'. */
function allBlocks(doc) {
  const out = doc.sections.flatMap((s) => s.blocks);
  for (const s of doc.stories.values()) out.push(...s.blocks);
  for (const k of ['footnotes', 'endnotes']) {
    for (const n of doc.notes[k].values()) out.push(...n.blocks);
  }
  for (const c of doc.comments.map.values()) out.push(...c.blocks);
  return out;
}

/** Read bytes: {doc, notes, ms} or {err, ms}; anything else thrown,
 *  too slow or too big fails. */
function attempt(bytes, what, opts = {}) {
  const rss = peak();
  const t0 = performance.now();
  let r;
  try {
    r = readDoc(bytes, {date: DATE, ...opts});
  } catch (e) {
    assert.equal(e && e.name, 'ImportError', `${what}: ${e && e.stack}`);
    assert.ok(CODES.includes(e.code), `${what}: ${e.code}`);
    r = {err: e};
  }
  r.ms = performance.now() - t0;
  assert.ok(r.ms < MAX_MS, `${what}: ${Math.round(r.ms)} ms`);
  assert.ok(peak() - rss < MAX_RSS, `${what}: ${peak() - rss} bytes`);
  if (r.doc) {
    assert.ok(!r.notes.some((n) => /could not be read/.test(n)),
      `${what}: ${r.notes.join('; ')}`);
    for (const b of allBlocks(r.doc)) checkBlock(b);
  }
  return r;
}

const texts = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p').map((b) => b.text);
const has = (r, re) => r.notes.some((n) => re.test(n));

/** The rich document's streams packed with its WordDocument padded
 *  past the mini stream cutoff, and the container's layout. */
function richLayout() {
  const s = richDoc().streams;
  const word = new Uint8Array(s.word.length + 4096);
  word.set(s.word);
  const all = [['WordDocument', word], [s.tableName, s.table],
    ...Object.entries(s.streams)];
  return makeCfbLayout({streams: all});
}

describe('.doc hostile files (task 16)', () => {
  it('the rich document reads whole', async () => {
    const r = attempt(richDoc().bytes, 'rich');
    assert.deepEqual(r.notes, []);
    emit('doc-hostile-rich', await writeDocx(r.doc, {date: DATE}));
    assert.equal(texts(r.doc)[0].replaceAll('￼', ''),
      'A rich document');
    assert.equal(r.doc.sections.length, 2);
    assert.equal(r.doc.comments.map.size, 1);
  });

  it('FAT loop', () => {
    const {bytes, layout} = richLayout();
    const w = layout.entries.find((e) => e.path === 'WordDocument');
    assert.ok(!w.mini);
    const dv = new DataView(bytes.buffer);
    // (the WordDocument's second sector points back at its first)
    dv.setUint32(layout.fatOffset(w.start + 1), w.start, true);
    assert.equal(attempt(bytes, 'loop').err.code, 'bad');
    // (the mini stream's chain loops on itself)
    const b2 = richLayout();
    new DataView(b2.bytes.buffer).setUint32(b2.layout.fatOffset(
      b2.layout.miniStart), b2.layout.miniStart, true);
    assert.ok(attempt(b2.bytes, 'mini loop').err);
    // (the directory's own chain)
    const b3 = richLayout();
    new DataView(b3.bytes.buffer).setUint32(b3.layout.fatOffset(
      b3.layout.dirStart), b3.layout.dirStart, true);
    assert.equal(attempt(b3.bytes, 'dir chain').err.code, 'bad');
  });

  it('directory loop', () => {
    for (const k of [68, 72]) {
      for (const to of ['self', 'root']) {
        const {bytes, layout} = richLayout();
        const w = layout.entries.find((e) => e.path === 'WordDocument');
        // (a sibling link back to the entry itself, or to the root)
        new DataView(bytes.buffer).setUint32(layout.entryOffset(w.sid) +
          k, to === 'self' ? w.sid : 0, true);
        assert.equal(attempt(bytes, `${to} ${k}`).err.code, 'bad');
      }
    }
    // (the root's child is the root; a stream's child link, which
    // [MS-CFB] says is none, is not followed: read)
    const a = richLayout();
    new DataView(a.bytes.buffer).setUint32(a.layout.entryOffset(0) + 76,
      0, true);
    assert.equal(attempt(a.bytes, 'root child').err.code, 'bad');
    const b = richLayout();
    const w = b.layout.entries.find((e) => e.path === 'WordDocument');
    new DataView(b.bytes.buffer).setUint32(b.layout.entryOffset(w.sid) +
      76, 0, true);
    assert.ok(attempt(b.bytes, 'stream child').doc);
  });

  it('piece table with 1e6 pieces', () => {
    const s = docStreams({text: 'abcdefgh\r'.repeat(100)});
    const fc = s.layout.pieces[0].fc;
    const n = MAX_PIECES;
    // (a piece a character, all over the same 900 characters: the
    // pieces are cut at the stream's length in all)
    const pcs = new Array(n);
    for (let i = 0; i < n; i++) {
      pcs[i] = {cpStart: i, cpEnd: i + 1, fc: fc + (i % 900),
        unicode: false};
    }
    const clx = clxOf(pcs);
    s.table = clx;
    const dv = new DataView(s.word.buffer);
    dv.setUint32(s.layout.fib.pair('Clx'), 0, true);
    dv.setUint32(s.layout.fib.pair('Clx') + 4, clx.length, true);
    dv.setInt32(s.layout.fib.ccpText, n, true);
    const r = attempt(packDoc(s), '1e6 pieces');
    const chars = texts(r.doc).reduce((k, t) => k + t.length, 0);
    assert.ok(chars <= s.word.length, String(chars));
    assert.ok(has(r, /more text than the file holds/), r.notes.join());
  });

  it('a piece with cp backwards', () => {
    for (const at of [1, 2, 3]) {
      const s = docStreams({pieces: [{text: 'One\r'}, {text: 'Two\r'},
        {text: 'Three\r'}]});
      const dv = new DataView(s.table.buffer);
      dv.setInt32(s.layout.tableAt.Clx + 5 + 4 * at, -7, true);
      const r = attempt(packDoc(s), 'backwards ' + at);
      assert.ok(r.err || has(r, /out of order/), r.notes && r.notes
        .join());
    }
  });

  it('FKP crun 255 on a short page', () => {
    const b = reviewDoc({main: [{text: 'abc'}, {text: 'def'}],
      runs: [{from: 0, to: 3, prls: [prl(0x0835, 1)]}]});
    const s = b.streams;
    for (const [name, page] of [['chp', b.pn], ['pap', b.pn + 1]]) {
      const w = s.word.slice();
      w[page * 512 + 511] = 255;
      // (and the page cut short: the stream ends inside it)
      const short = w.slice(0, page * 512 + 300);
      attempt(packDoc({...s, word: w}), name + ' crun 255');
      attempt(packDoc({...s, word: short}), name + ' short page');
    }
  });

  it('sprm length 0 loops', () => {
    // (spra 6 ops with a count byte of 0; a TDefTable cb of 0; 64 KB
    // of zero bytes as a grpprl; a PChgTabs of cb 255 and nothing)
    const prls = [Uint8Array.from([0x08, 0xD6, 0, 0]),
      Uint8Array.from([0x15, 0xC6, 0]), Uint8Array.from([0x15, 0xC6,
        255]), new Uint8Array(400)];
    for (const g of prls) {
      const b = reviewDoc({main: [{text: 'x', prls: [g]}, {text: 'y'}],
        runs: [{from: 0, to: 1, prls: [Uint8Array.from([0x03, 0x6A,
          0])]}]});
      attempt(b.bytes, 'sprm ' + g.slice(0, 3));
    }
  });

  it('PlcfBte n=1e9', () => {
    const b = reviewDoc({main: [{text: 'abc'}]});
    for (const name of ['PlcfBteChpx', 'PlcfBtePapx']) {
      const s = {...b.streams, word: b.streams.word.slice()};
      // (an lcb of 8e9 + 4: n = 1e9 entries, far past the table)
      new DataView(s.word.buffer).setUint32(s.layout.fib.pair(name) + 4,
        1e9 * 8 + 4 >>> 0, true);
      const r = attempt(packDoc(s), name);
      assert.ok(r.err || r.notes.length, name);
    }
  });

  it('ccpText 2^31', () => {
    for (const v of [0x80000000, 0x7FFFFFFF, 0xFFFFFFFF]) {
      const s = richDoc().streams;
      new DataView(s.word.buffer).setUint32(s.layout.fib.ccpText, v,
        true);
      attempt(packDoc(s), 'ccpText ' + v);
    }
  });

  it('truncated mid-WordDocument at every 256 bytes', () => {
    const s = richDoc().streams;
    const counts = {};
    for (let n = 0; n <= s.word.length; n += 256) {
      const r = attempt(packDoc({...s, word: s.word.slice(0, n)}),
        'cut ' + n);
      const k = r.err ? r.err.code : 'ok';
      counts[k] = (counts[k] || 0) + 1;
    }
    assert.ok(counts.bad && counts.ok, JSON.stringify(counts));
  });

  it('1,000,000 paragraph marks hit the cap', () => {
    const b = makeDoc({pieces: [{text: '\r'.repeat(1000000),
      unicode: false}]});
    const r = attempt(b, 'million', {maxParagraphs: MAX_PARAGRAPHS});
    assert.ok(texts(r.doc).length <= MAX_PARAGRAPHS + 1);
    assert.ok(has(r, /paragraphs: the rest is not read/), r.notes.join());
  });

  it('field nesting depth 100000', () => {
    const r = attempt(reviewDoc({plain: true, main: [{text:
      '\x13'.repeat(100000) + ' PAGE \x14x' + '\x15'.repeat(100000)},
    {text: 'after'}]}).bytes, 'deep');
    assert.equal(texts(r.doc).at(-1), 'after');
    assert.ok(has(r, /nested more than/), r.notes.join());
    // (the same with separators everywhere: results inside results)
    const r2 = attempt(reviewDoc({plain: true, main: [{text:
      '\x13 IF \x14'.repeat(100000) + 'y' + '\x15'.repeat(100000)},
    {text: 'after'}]}).bytes, 'deep results');
    assert.equal(texts(r2.doc).at(-1), 'after');
  });

  it('cell marks without table props', () => {
    const r = attempt(reviewDoc({main: [{text: 'a', mark: '\x07'},
      {text: 'b', mark: '\x07'}, {text: '', mark: '\x07'},
      {text: 'c'}]}).bytes, 'cells');
    assert.deepEqual(texts(r.doc), ['a', 'b', '', 'c']);
    assert.ok(has(r, /cell mark outside a table/), r.notes.join());
    // (and 100,000 of them)
    attempt(makeDoc({pieces: [{text: 'x\x07'.repeat(100000),
      unicode: false}]}), 'many cells');
  });

  it('the Data stream missing', () => {
    const s = richDoc().streams;
    const r = attempt(packDoc({...s, streams: {}}), 'no Data');
    assert.ok(has(r, /outside the file/), r.notes.join());
    assert.equal(r.doc.sections.length, 2);
  });

  it('random bytes after a valid header', () => {
    const r0 = mulberry32(7);
    const s = richDoc().streams;
    const keep = s.layout.textAt;
    const counts = {};
    for (let i = 0; i < 40; i++) {
      const w = s.word.slice();
      for (let k = keep; k < w.length; k++) w[k] = Math.floor(r0() * 256);
      const t = i % 2 ? s.table.slice() : s.table.map(() =>
        Math.floor(r0() * 256));
      const r = attempt(packDoc({...s, word: w, table: t,
        streams: {Data: s.streams.Data.map(() =>
          Math.floor(r0() * 256))}}), 'random ' + i);
      const k = r.err ? r.err.code : 'ok';
      counts[k] = (counts[k] || 0) + 1;
    }
    assert.ok(counts.ok, JSON.stringify(counts));
    assert.equal(counts.toocomplex, undefined, JSON.stringify(counts));
  });

  it('a seeded fuzz of 300 mutated copies of the rich document',
    async () => {
      const built = richDoc();
      // (DOC_FUZZ_SEED=n runs another 300; the default is 16)
      const seed = Number(process.env.DOC_FUZZ_SEED || 16);
      const r = mulberry32(seed);
      const counts = {};
      let worst = 0;
      for (let i = 0; i < 300; i++) {
        const {bytes, how} = mutateDoc(built, r);
        const got = attempt(bytes, `copy ${i} (${how})`);
        const k = got.err ? got.err.code : 'ok';
        counts[k] = (counts[k] || 0) + 1;
        worst = Math.max(worst, got.ms);
        // (every tenth document read writes as .docx)
        if (got.doc && i % 10 === 0) {
          emit('doc-hostile-fuzz-' + i, await writeDocx(got.doc,
            {date: DATE}), {stem: 'doc-hostile-fuzz'});
        }
      }
      console.log('# doc fuzz (seed ' + seed + '): ' +
        JSON.stringify(counts) +
        `, slowest ${Math.round(worst)} ms`);
      assert.equal(counts.toocomplex, undefined, JSON.stringify(counts));
      assert.ok(counts.ok > 150 && counts.bad > 10,
        seed + ': ' + JSON.stringify(counts));
    });

  it('runs and pages pointing at each other: one CHPX page for every ' +
    'run', () => {
    // (a bin table of 5,000 entries all naming one page: each page
    // is read once)
    const b = reviewDoc({main: [{text: 'abc'}]});
    const s = {...b.streams, table: b.streams.table.slice(),
      word: b.streams.word.slice()};
    const n = 5000;
    const fcs = Array.from({length: n + 1}, (_, i) => s.layout.textAt +
      i);
    const bte = Uint8Array.from([...fcs.flatMap(u32le),
      ...new Array(n).fill(b.pn).flatMap(u32le)]);
    const t = new Uint8Array(s.table.length + bte.length);
    t.set(s.table);
    t.set(bte, s.table.length);
    const dv = new DataView(s.word.buffer);
    dv.setUint32(s.layout.fib.pair('PlcfBteChpx'), s.table.length, true);
    dv.setUint32(s.layout.fib.pair('PlcfBteChpx') + 4, bte.length, true);
    attempt(packDoc({...s, table: t}), 'shared pages');
    assert.ok(chpxPage([]) && papxPage([]));
  });
});
