// RTF over the corpus (Batch G2, task 12): every .docx under
// tests/moreapps/corpus (git-ignored, optional: the tests skip when it
// is missing) read by readDocx, written by writeRtf and read back by
// readRtf.
//
//   - writeRtf never throws; its output is ASCII only, its braces
//     balance, and a second write of the same Doc gives the same
//     bytes; readRtf of it never throws;
//   - the text comes back: the visible text of the body (paragraphs
//     and table cells in reading order, joined by '\n'; an inline's
//     text as the model holds it, a line break '\n', a page or column
//     break nothing) is equal when nothing that holds text was lost
//     (writeRtf's `lost` names only kinds in TEXT_KEPT), else the
//     text read back is a subsequence of it (lost items only take
//     text away);
//   - paragraph and table counts equal (an empty body reads back as
//     one empty paragraph; tables next to each other read back as
//     one: RTF has nothing between their rows), picture counts equal
//     once the lost pictures and text boxes are allowed for;
//   - run formatting equal (./rtf-helpers.mjs runs, inlines taken
//     out) on a deterministic sample of the documents with nothing
//     lost;
//   - macOS textutil (when present) reads our RTF to the same words
//     on a sample; and textutil's own RTF of a sample .docx reads
//     (readRtf never throws) to the words textutil's text of that
//     .docx has;
//   - a time budget (warm-up, then the best of several) over a
//     sample;
//   - the totals of writeRtf's `lost` kinds are printed.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {readDocx, DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {LOST} from '../../tools/moreapps/!Letters/RtfLost';
import {modelCore} from './rtf-helpers.mjs';
import {hash} from './roundtrip-lib.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CORPUS = path.join(HERE, 'corpus');
const SKIP = 'tests/moreapps/corpus is missing (optional, git-ignored: ' +
  'run node tools/moreapps-corpus.mjs)';
const TEXTUTIL = '/usr/bin/textutil';
const HAVE_TEXTUTIL = fs.existsSync(TEXTUTIL);
const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));

// lost kinds whose items hold no text of their own (or keep it)
const TEXT_KEPT = new Set([LOST.pictures, LOST.crops, LOST.positions,
  LOST.tableStyles, LOST.diagonals, LOST.columns, LOST.lineNumbers,
  LOST.listLevels, LOST.links, LOST.bookmarks, LOST.lists]);

function find(dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'word-check') find(q, out);
    } else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) {
      out.push(q);
    }
  }
  return out.sort();
}
const FILES = fs.existsSync(CORPUS) ? find(CORPUS) : [];
const nameOf = (f) => path.relative(CORPUS, f).split(path.sep).join('/');

// ------------------------------------------------------------ helpers

const HIDDEN = new Set(['w:drawing', 'w:pict', 'w:object',
  'mc:AlternateContent', 'w:instrText', 'w:delInstrText', 'm:oMath',
  'm:oMathPara', 'w:fldChar', 'w:footnoteReference',
  'w:endnoteReference', 'w:commentReference', 'w:annotationRef',
  'w:footnoteRef', 'w:endnoteRef', 'w:sym', 'w:rPr', 'w:pPr',
  'w:sdtPr', 'w:sdtEndPr']);

/** The text a kept-whole node shows (w:t, tabs, line breaks). */
function nodeText(n, out) {
  if (!n || typeof n !== 'object' || HIDDEN.has(n.name)) return;
  if (n.name === 'w:t' || n.name === 'w:delText') {
    for (const c of n.children || []) if (typeof c === 'string') out.push(c);
    return;
  }
  if (n.name === 'w:tab' || n.name === 'w:ptab') return void out.push('\t');
  if (n.name === 'w:br' || n.name === 'w:cr') {
    const t = (n.attrs || []).find((a) => a[0] === 'w:type');
    if (!t || t[1] === 'textWrapping') out.push('\n');
    return;
  }
  if (n.name === 'w:noBreakHyphen') return void out.push('\u2011');
  for (const c of n.children || []) nodeText(c, out);
}

const REFUSED_REV = new Set(['w:ins', 'w:moveTo']);

/** A paragraph's visible text (not a field's code, as Word shows
 *  it). A refused insertion (raw w:ins) is
 *  written with all its text, a text box's too (task 9): the model's
 *  own text of it is taken. */
function paraText(p) {
  let s = '';
  // (complex fields open in this paragraph: true while in a code;
  // text in a field's code, a field there included, is not shown)
  const open = [];
  for (let i = 0; i < p.text.length; i++) {
    const c = p.text[i];
    const inCode = open.includes(true);
    if (c !== OBJ) {
      if (!inCode) s += c;
      continue;
    }
    const x = p.inlines[String(i)];
    if (!x) continue;
    if (x.kind === 'raw' && x.node && x.node.name === 'w:fldChar') {
      const t = (x.node.attrs || []).find((a) => a[0] ===
        'w:fldCharType');
      const v = t && t[1];
      if (v === 'begin') open.push(true);
      else if (v === 'separate' && open.length) {
        open[open.length - 1] = false;
      } else if (v === 'end') open.pop();
      continue;
    }
    if (inCode) continue;
    if (x.kind === 'br') {
      if (!x.brType || x.brType === 'textWrapping') s += '\n';
    } else if (x.kind === 'raw' && x.node) {
      if (REFUSED_REV.has(x.node.name) && typeof x.text === 'string') {
        s += x.text;
      } else {
        const o = [];
        nodeText(x.node, o);
        s += o.join('');
      }
    }
  }
  return s;
}

/** {text, paras, tables, wrapped} of a Doc's body (wrapped: some
 *  text is inside a kept-whole inline: a link, smart tag, simple
 *  field..., whose runs modelCore does not see). */
function statsOf(doc) {
  const st = {text: [], paras: 0, tables: 0, wrapped: false};
  const walk = (blocks) => {
    let prevTbl = false;
    for (const b of blocks) {
      if (b.type === 'tbl') {
        if (!prevTbl) st.tables++;
        for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
      } else if (b.type === 'p') {
        st.paras++;
        st.text.push(paraText(b));
        if (Object.values(b.inlines).some((x) => x.text)) st.wrapped = true;
      }
      prevTbl = b.type === 'tbl';
    }
  };
  for (const s of doc.sections) walk(s.blocks);
  st.paras = Math.max(st.paras, 1);
  st.text = st.text.join('\n');
  return st;
}

/** Every w:drawing inline: body, headers and footers, notes,
 *  comments. */
function drawings(doc) {
  let n = 0;
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b.type === 'p') {
        for (const x of Object.values(b.inlines || {})) {
          if (x.kind === 'raw' && x.node && x.node.name === 'w:drawing') n++;
        }
      } else if (b.type === 'tbl') {
        for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
      }
    }
  };
  for (const s of doc.sections) walk(s.blocks);
  for (const st of (doc.stories || new Map()).values()) walk(st.blocks);
  for (const k of ['footnotes', 'endnotes']) {
    for (const x of ((doc.notes && doc.notes[k]) || new Map()).values()) {
      walk(x.blocks);
    }
  }
  for (const c of ((doc.comments && doc.comments.map) || new Map())
    .values()) walk(c.blocks);
  return n;
}

const isSubsequence = (small, big) => {
  let i = 0;
  for (const ch of small) {
    i = big.indexOf(ch, i);
    if (i < 0) return false;
    i += ch.length;
  }
  return true;
};

/** Where two texts part: a few characters of each. */
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return JSON.stringify(a.slice(Math.max(0, i - 20), i + 30)) + ' -> ' +
    JSON.stringify(b.slice(Math.max(0, i - 20), i + 30));
}

const ascii = (b) => b.every((c) => c < 0x80);

/** Braces balance (outside \\x escapes; our writer has no \\bin). */
function balanced(b) {
  let d = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0x5c) i++;
    else if (c === 0x7b) d++;
    else if (c === 0x7d && --d < 0) return false;
  }
  return d === 0;
}

/** The paragraphs' runs (text without inlines, adjacent equal runs
 *  merged), in reading order, from modelCore. */
function runsOf(doc) {
  const out = [];
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.runs) {
        const rs = [];
        for (const [t, core] of b.runs) {
          const text = t.split(OBJ).join('');
          if (!text) continue;
          const last = rs[rs.length - 1];
          if (last && JSON.stringify(last[1]) === JSON.stringify(core)) {
            last[0] += text;
          } else rs.push([text, core]);
        }
        out.push(rs);
      } else if (b.rows) {
        for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
      }
    }
  };
  for (const s of modelCore(doc).sections) walk(s.blocks);
  // (an empty body reads back as one empty paragraph)
  return out.length === 1 && !out[0].length ? [] : out;
}

/** The words of a text, sorted (whitespace split; the direction
 *  marks textutil adds out; a bullet alone out: textutil's text shows
 *  list bullets, the Model's text has no list labels). */
const BULLETS = new Set(['\u2022', '\u25e6', '\u25aa', '\u00b7',
  '\uf0b7']);
const words = (s) => s.split('\u200e').join('').split('\u200f').join('')
  .split(/\s+/).filter((w) => w && !BULLETS.has(w)).sort();

function textutil(args, input) {
  return execFileSync(TEXTUTIL, [...args, '-stdout', input],
    {maxBuffer: 256 * 1024 * 1024}).toString('utf8');
}

// ------------------------------------------------------------ the sweep

const results = [];
const lostTotals = new Map();
let refused = 0;

describe('RTF over the corpus', {skip: FILES.length ? false : SKIP}, () => {
  before(async () => {
    for (const f of FILES) {
      const name = nameOf(f);
      let doc;
      try {
        doc = await readDocx(fs.readFileSync(f), {date: DATE});
      } catch (e) {
        if (!(e instanceof DocxError)) throw e;
        refused++;
        continue;
      }
      const r = {name, h: hash(name)};
      try {
        const out = writeRtf(doc);
        r.bytes = out.bytes;
        r.lost = out.lost;
        r.same = Buffer.from(writeRtf(doc).bytes).equals(
          Buffer.from(out.bytes));
      } catch (e) {
        r.threw = 'writeRtf: ' + (e && e.stack || e);
        results.push(r);
        continue;
      }
      let back;
      try {
        back = readRtf(r.bytes, {date: DATE}).doc;
      } catch (e) {
        r.threw = 'readRtf: ' + (e && e.stack || e);
        results.push(r);
        continue;
      }
      for (const l of r.lost) {
        const t = lostTotals.get(l.what) || {count: 0, docs: 0};
        t.count += l.count;
        t.docs++;
        lostTotals.set(l.what, t);
      }
      const L = (w) => (r.lost.find((l) => l.what === w) || {count: 0})
        .count;
      r.textKept = r.lost.every((l) => TEXT_KEPT.has(l.what));
      r.a = statsOf(doc);
      r.b = statsOf(back);
      r.pics = [drawings(doc), drawings(back),
        L(LOST.pictures) + L(LOST.textBoxes)];
      r.sections = doc.sections.length;
      if (!r.lost.length && !r.a.wrapped && r.h % 4 === 0) {
        r.runs = [runsOf(doc), runsOf(back)];
      }
      results.push(r);
    }
    const rows = [...lostTotals].sort((x, y) => y[1].count - x[1].count)
      .map(([w, t]) => w + ' ' + t.count + '/' + t.docs);
    console.log('rtfcorpus: ' + results.length + ' written (' + refused +
      ' refused by readDocx); lost (items/documents): ' +
      (rows.join(', ') || 'none'));
  });

  it('writeRtf and readRtf never throw', () => {
    const bad = results.filter((r) => r.threw);
    assert.deepEqual(bad.map((r) => r.name + ': ' + r.threw), []);
    assert.ok(results.length > 0);
  });

  it('every output is ASCII, balanced and deterministic', () => {
    const bad = [];
    for (const r of results) {
      if (r.threw) continue;
      if (!ascii(r.bytes)) bad.push(r.name + ': not ASCII');
      if (!balanced(r.bytes)) bad.push(r.name + ': braces');
      if (!r.same) bad.push(r.name + ': a second write differs');
    }
    assert.deepEqual(bad, []);
  });

  it('the text comes back (equal when nothing holding text was lost)',
    () => {
      const bad = [];
      let equal = 0;
      for (const r of results) {
        if (r.threw) continue;
        if (r.a.text === r.b.text) {
          equal++;
          continue;
        }
        if (r.textKept) {
          bad.push(r.name + ': text differs ' +
            firstDiff(r.a.text, r.b.text));
        }
        else if (!isSubsequence(r.b.text, r.a.text)) {
          bad.push(r.name + ': text gained something');
        }
      }
      console.log('rtfcorpus: text equal in ' + equal + ' of ' +
        results.length + ' (the rest lost items that hold text)');
      assert.deepEqual(bad, []);
    });

  it('paragraph, table and picture counts', () => {
    const bad = [];
    for (const r of results) {
      if (r.threw) continue;
      if (r.a.paras !== r.b.paras) {
        bad.push(r.name + ': paragraphs ' + r.a.paras + ' -> ' + r.b.paras);
      }
      if (r.a.tables !== r.b.tables) {
        bad.push(r.name + ': tables ' + r.a.tables + ' -> ' + r.b.tables);
      }
      const [was, now, lost] = r.pics;
      if (now > was || now < was - lost || (!lost && now !== was)) {
        bad.push(r.name + ': pictures ' + was + ' -> ' + now + ' (' +
          lost + ' lost)');
      }
    }
    assert.deepEqual(bad, []);
  });

  it('run formatting comes back (a sample with nothing lost)', () => {
    const sample = results.filter((r) => r.runs);
    const bad = [];
    for (const r of sample) {
      const [a, b] = r.runs;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      const i = a.findIndex((x, k) => JSON.stringify(x) !==
        JSON.stringify(b[k]));
      const at = i < 0 ? a.length : i;
      bad.push(r.name + ': paragraph ' + at + ' ' +
        String(JSON.stringify(a[at])).slice(0, 300) + ' -> ' +
        String(JSON.stringify(b[at])).slice(0, 300));
    }
    console.log('rtfcorpus: run formatting compared in ' + sample.length +
      ' documents');
    assert.ok(sample.length >= 20, 'a sample of at least 20');
    assert.deepEqual(bad, []);
  });

  it('macOS textutil reads our RTF to the same words (a sample)',
    {skip: !HAVE_TEXTUTIL && 'no /usr/bin/textutil'}, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtfcorpus-'));
      const bad = [];
      let n = 0;
      try {
        for (const r of results) {
          if (r.threw || r.h % 16 !== 0 || !r.textKept ||
            r.sections !== 1) continue;
          const f = path.join(dir, 'a.rtf');
          fs.writeFileSync(f, r.bytes);
          const got = words(textutil(['-convert', 'txt'], f));
          const want = words(r.a.text);
          n++;
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            bad.push(r.name);
          }
        }
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
      console.log('rtfcorpus: textutil read ' + n + ' of our files, ' +
        bad.length + ' with other words: ' + bad.join(', '));
      assert.ok(n >= 10, 'a sample of at least 10');
      assert.ok(bad.length <= KNOWN_TEXTUTIL, bad.join('\n'));
    });

  it('textutil\u2019s own RTF of a .docx reads to its text (a sample)',
    {skip: !HAVE_TEXTUTIL && 'no /usr/bin/textutil'}, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtfcorpus-'));
      const bad = [];
      let n = 0;
      try {
        for (const r of results) {
          if (r.threw || r.h % 16 !== 1) continue;
          const src = path.join(CORPUS, r.name);
          let rtf, txt;
          try {
            rtf = execFileSync(TEXTUTIL, ['-convert', 'rtf', '-stdout', src],
              {maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe',
                'ignore']});
            txt = textutil(['-convert', 'txt'], src);
          } catch {
            continue; // (textutil cannot read every .docx)
          }
          const back = readRtf(new Uint8Array(rtf), {date: DATE}).doc;
          n++;
          const got = words(statsOf(back).text);
          if (JSON.stringify(got) !== JSON.stringify(words(txt))) {
            bad.push(r.name);
          }
        }
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
      console.log('rtfcorpus: textutil RTF read ' + n + ', ' + bad.length +
        ' with other words: ' + bad.join(', '));
      assert.ok(n >= 10, 'a sample of at least 10');
      assert.ok(bad.length <= KNOWN_TEXTUTIL_RTF, bad.join('\n'));
    });

  it('a time budget: write and read back a sample', () => {
    const sample = results.filter((r) => !r.threw && r.h % 8 === 0);
    const docs = [];
    for (const r of sample) docs.push(readRtf(r.bytes, {date: DATE}).doc);
    const once = () => {
      const t0 = performance.now();
      for (const d of docs) readRtf(writeRtf(d).bytes, {date: DATE});
      return performance.now() - t0;
    };
    once();
    const best = Math.min(once(), once(), once());
    const bytes = sample.reduce((n, r) => n + r.bytes.length, 0);
    console.log('rtfcorpus: ' + docs.length + ' documents (' +
      (bytes / 1e6).toFixed(1) + ' MB of RTF) written and read in ' +
      best.toFixed(0) + ' ms (best of 3)');
    assert.ok(best < BUDGET_MS, best.toFixed(0) + ' ms, budget ' +
      BUDGET_MS);
  });
});

// (textutil differences examined in task 12: see the counts printed)
const KNOWN_TEXTUTIL = 0;
const KNOWN_TEXTUTIL_RTF = 0;
const BUDGET_MS = 10000;
