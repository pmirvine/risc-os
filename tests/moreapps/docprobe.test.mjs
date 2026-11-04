// .doc import, task 16: the systematic work pass. Each probe builds
// the worst case of one count-, offset- or length-driven structure of
// the reader (the table of them is in the task 16 findings) and reads
// it, printing its time and the growth of the process's peak memory
// and asserting a bound. The spec-derived builders are
// ./doc-helpers.mjs, ./doc-review-helpers.mjs and ./doc-worst.mjs
// (the combined probe: one ~16 MB file reaching the piece, field,
// comment, note, section, header, picture, bookmark and table
// budgets at once). Probes of structures an earlier task bounded
// live with that task's tests (docread, docprops, doctables,
// docparts, docreview, cfb); these are the ones task 16 added, each
// with the fix it led to.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {MAX_PARAGRAPHS} from '../../tools/moreapps/!Letters/Open';
import {MAX_FIELDS} from '../../tools/moreapps/!Letters/DocFldKind';
import {FORMAT_WORK} from '../../tools/moreapps/!Letters/DocPrm';
import {makeDoc, docStreams, packDoc, clxOf, formattedDoc, prl, u16le,
  i16le, u32le, grpprl, listTable, lfoTable} from './doc-helpers.mjs';
import {worstDoc} from './doc-worst.mjs';

const MB = 1048576;
const READER = new URL('../../tools/moreapps/!Letters/DocRead',
  import.meta.url).href;
// (a child process reads the file and reports: its peak RSS is the
// reading's own, with nothing else of the tests in it. grow is how
// far the peak rose above the RSS just before the reading, kept the
// heap still in use once it is over and collected. The peak depends
// on when the collector runs (the same read of 300,000 tracked runs
// peaked at 585-656 MB on one machine, with 105 MB kept), so the
// bounds are on grow, about one and a half times what was measured,
// and kept, which does not vary)
const CHILD = `import fs from 'node:fs';
const {readDoc} = await import(${JSON.stringify(READER)});
const b = new Uint8Array(fs.readFileSync(process.argv[1]));
globalThis.gc();
const base = process.memoryUsage().rss;
const t = performance.now();
const r = readDoc(b, {maxParagraphs: ${MAX_PARAGRAPHS}});
const ms = performance.now() - t;
const rss = process.resourceUsage().maxRSS * 1024;
globalThis.gc();
const kept = process.memoryUsage().heapUsed;
const n = r.doc.sections.reduce((k, s) => k + s.blocks.length, 0);
process.stdout.write(JSON.stringify({ms, rss, grow: rss - base, kept,
  notes: r.notes, blocks: n,
  sections: r.doc.sections.length, comments: r.doc.comments.map.size,
  tables: r.doc.sections.some((s) => s.blocks.some((x) =>
    x.type === 'tbl'))}));`;

/** Read bytes in a child process: {ms, rss (its peak RSS, bytes),
 *  grow (the peak's rise during the reading), kept (heap in use
 *  after it), notes, blocks, sections, comments, tables}; prints the
 *  line for the findings. */
function probe(what, bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docprobe-'));
  const f = path.join(dir, 'probe.doc');
  try {
    fs.writeFileSync(f, bytes);
    const c = spawnSync(process.execPath, ['--expose-gc',
      '--input-type=module', '-e', CHILD, f], {encoding: 'utf8',
      maxBuffer: 64 * MB});
    assert.equal(c.status, 0, what + ': ' + c.stderr.slice(0, 2000));
    const r = JSON.parse(c.stdout);
    console.log(`# probe ${what}: ${(bytes.length / MB).toFixed(1)} ` +
      `MB, ${Math.round(r.ms)} ms, peak RSS ${Math.round(r.rss / MB)} ` +
      `MB (grew ${Math.round(r.grow / MB)} MB, kept ` +
      `${Math.round(r.kept / MB)} MB); notes: ${r.notes.join('; ')}`);
    return r;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
/** The room given a measured figure (MB): half as much again, and
 *  at least 50 MB more. */
const room = (mb) => Math.max(1.5 * mb, mb + 50) * MB;
/** Assert a probe's time (under ms) and memory: grow and kept within
 *  the room of the figures measured (MB) when the probe was made. */
function within(r, ms, grow, kept) {
  const got = `${Math.round(r.ms)} ms, grew ${Math.round(r.grow /
    MB)} MB, kept ${Math.round(r.kept / MB)} MB`;
  assert.ok(r.ms < ms, got);
  assert.ok(r.grow < room(grow), got + ' (measured ' + grow + ')');
  assert.ok(r.kept < room(kept), got + ' (measured kept ' + kept +
    ')');
}

describe('.doc work probes (task 16)', () => {
  it('2,000,000 PAGE fields: at most MAX_FIELDS kept as fields',
    () => {
      // (14 MB of 8-bit text; before the cap: 13 s and 3 GB in
      // paragraphs of 70 characters, out of memory in one paragraph)
      const f = '\x13PAGE\x14\x15';
      const text = (f.repeat(10) + '\r').repeat(200000);
      const r = probe('fields', makeDoc({pieces: [{text,
        unicode: false}]}));
      within(r, 5000, 208, 147);
      assert.ok(r.notes.includes('more than ' + MAX_FIELDS + ' fields: ' +
        'the rest are kept as their results'));
      // (and all of them in one paragraph)
      const one = probe('fields in one paragraph', makeDoc({pieces: [{
        text: f.repeat(150000), unicode: false}]}));
      within(one, 5000, 312, 87);
    });

  it('a long Prc grpprl on every run: the formatting budget', () => {
    // (one piece whose Prm1 names a 30,000-byte Prc grpprl: 10,000
    // Prls on each of 300,000 one-character runs; before the budget,
    // 6 s for 20,000 of them)
    const N = 300000;
    let text = '';
    for (let i = 0; i < N; i++) text += i % 50 === 49 ? '\r' : 'x';
    const runs = [];
    for (let i = 0; i < N; i++) {
      runs.push({from: i, to: i + 1, prls: [prl(0x0835, i & 1)]});
    }
    const g = new Uint8Array(30000);
    for (let i = 0; i + 3 <= g.length; i += 3) g.set([0x35, 0x08, 1], i);
    const f = formattedDoc({paras: [{text: text.slice(0, -1)}], runs,
      prc: [g]});
    const s = f.streams;
    const pcd = s.layout.tableAt.Clx + 3 + g.length + 5 + 8;
    new DataView(s.table.buffer).setUint16(pcd + 6, 1, true);
    const bytes = packDoc(s);
    const r = probe('Prc on every run', bytes);
    within(r, 4000, 244, 27);
    assert.ok(r.notes.some((n) => /more formatting than !Letters/
      .test(n)));
    assert.equal(r.blocks, N / 50);
    // (the runs read before the budget ran out are bold, from the
    // Prc: a smaller one reads whole)
    const small = readDoc(formattedDoc({paras: [{text: 'xyz'}],
      runs: [{from: 0, to: 1, prls: [prl(0x0835, 0)]}], prc: [g]})
      .bytes);
    assert.ok(blocks(small.doc).length === 1 && bytes.length > 0);
  });

  it('a 64 KB PrcData on every paragraph\'s own PAPX: the budget',
    () => {
      // (190,000 paragraphs, each its own FKP entry, all naming one
      // PrcData of 21,000 Prls; before: 2.6 s and 984 MB for 5,000)
      const g = [];
      for (let i = 0; i + 3 <= 65000; i += 3) g.push(0x61, 0x24, 1);
      const data = Uint8Array.from([...u16le(g.length), ...g]);
      const huge = prl(0x6646, u32le(0));
      const paras = Array.from({length: 190000}, () => ({text: 'x',
        prls: [huge]}));
      const r = probe('PrcData on every paragraph',
        formattedDoc({paras, streams: {Data: data}}).bytes);
      within(r, 4000, 389, 125);
      assert.equal(r.blocks, 190000);
    });

  it('the formatting budget: one note, the text kept', () => {
    const keep = FORMAT_WORK.max;
    FORMAT_WORK.max = 5;
    try {
      const paras = Array.from({length: 10}, (_, i) => ({text: 'p' + i,
        prls: [prl(0x2461, 1), prl(0x2461, 2)]}));
      const r = readDoc(formattedDoc({paras, runs: [{from: 0, to: 30,
        prls: [prl(0x0835, 1)]}]}).bytes);
      assert.deepEqual(r.notes, ['more formatting than !Letters ' +
        'reads in one document: the rest of the text is read without ' +
        'its own formatting']);
      assert.deepEqual(blocks(r.doc).map((b) => b.text),
        paras.map((p) => p.text));
    } finally {
      FORMAT_WORK.max = keep;
    }
  });

  it('400,000 pieces with a gap after each: no scan per paragraph',
    () => {
      // (each paragraph starts in a gap left by a piece past the
      // stream; before: quadratic, 4.3 s for 100,000)
      const s = docStreams({pieces: [{text: 'x\r', unicode: false}],
        wordTail: new Uint8Array(4 * MB)});
      const fc = s.layout.pieces[0].fc;
      const pcs = [];
      for (let i = 0; i < 400000; i++) {
        pcs.push({cpStart: 3 * i, cpEnd: 3 * i + 2, fc, unicode: false},
          {cpStart: 3 * i + 2, cpEnd: 3 * i + 3, fc: 0x1FFFFFF0,
            unicode: false});
      }
      const clx = clxOf(pcs);
      s.table = clx;
      const dv = new DataView(s.word.buffer);
      dv.setUint32(s.layout.fib.pair('Clx'), 0, true);
      dv.setUint32(s.layout.fib.pair('Clx') + 4, clx.length, true);
      dv.setInt32(s.layout.fib.ccpText, 1200000, true);
      const r = probe('gaps', packDoc(s));
      within(r, 3000, 247, 130);
      assert.equal(r.blocks, MAX_PARAGRAPHS);
    });

  it('65,000 styles, 4,000 lists, 300,000 tracked runs: their caps',
    () => {
      const chpx = grpprl(...Array.from({length: 40}, (_, k) =>
        prl(0x4A43, u16le(20 + k))));
      const stds = [{sti: 0, name: 'Normal'}];
      for (let i = 1; i < 65000; i++) {
        stds.push({sti: 0x0FFE, base: i - 1, next: 0, name: 'Style ' + i,
          chpx});
      }
      const a = probe('styles', formattedDoc({paras: Array.from(
        {length: 2000}, (_, i) => ({text: 'x', istd: 1 + i * 31})),
      styles: {stds}}).bytes);
      within(a, 4000, 101, 16);
      const lists = Array.from({length: 4000}, (_, i) => ({lsid: i + 1,
        levels: Array.from({length: 9}, (_, k) => ({nfc: 0,
          xst: [k, 0x2E, ...new Array(200).fill(0x41)]}))}));
      const {PlfLst, lcb} = listTable(lists);
      const b = probe('lists', formattedDoc({paras: Array.from(
        {length: 4000}, (_, i) => ({text: 'i', prls: [prl(0x460B,
          i16le(i + 1))]})), table: {PlfLst, PlfLfo: lfoTable(lists
        .map((l) => ({lsid: l.lsid})))}, lcb: {PlfLst: lcb}}).bytes);
      // (before task 19: 722 ms, grew 488 MB; the levels of lists
      // past the builder's 1,000 are no longer built)
      within(b, 4000, 110, 34);
      let text = '';
      for (let i = 0; i < 300000; i++) text += i % 60 === 59 ? '\r' : 'r';
      const runs = [];
      for (let i = 0; i < 300000; i++) {
        runs.push({from: i, to: i + 1, prls: [prl(i & 1 ? 0x0801 : 0x0800,
          1), prl(0x4804, u16le(i % 2000)), prl(0x6805, u32le(i))]});
      }
      const c = probe('tracked runs', formattedDoc({paras: [{text:
        text.slice(0, -1)}], runs}).bytes);
      // (its peak RSS, 585-656 MB on one machine, is mostly garbage
      // not yet collected: the reading allocates about 1.5 GB in
      // all for its 300,000 different runs, 105 MB of it kept)
      within(c, 4000, 524, 105);
    });

  it('the combined worst case: ~16 MB at several budgets at once',
    () => {
      // (1.38 million one-character pieces with Prm1s through 15,000
      // Prc grpprls, 60,000 fields, 10,005 comments and footnotes,
      // 1,100 pictures each inflating to 1 MB, 2,000 table rows, 600
      // sections each with its header, 60,000 bookmarks)
      const {bytes, counts} = worstDoc({piece: 1});
      assert.ok(bytes.length > 15 * MB, String(bytes.length));
      const r = probe('combined', bytes);
      within(r, 10000, 981, 256);
      assert.equal(r.sections, 500);
      assert.equal(r.comments, 10000);
      assert.ok(counts.pieces > 700000);
      for (const re of [/more than 500 sections/, /more than 50000 fields/,
        /more than 10000 comments/, /more than 10000 footnotes/,
        /more than 1000 pictures or 64 MB/]) {
        assert.ok(r.notes.some((n) => re.test(n)), String(re));
      }
      assert.ok(r.tables);
    });
});
