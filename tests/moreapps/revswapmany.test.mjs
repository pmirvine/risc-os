// RevTrack swapMany (./RevSwapMany): many tracked replacements in one
// paragraph made in one pass. The rule it is held to: the very same
// document (text, runs, formatting, revision tags and their ids, the
// comments and notes, the docx written) and the same undo and redo
// (the caret they leave included) as Session.swap once a range, from
// the last range to the first. Checked on seeded random paragraphs
// holding tracked insertions and deletions of the author and of
// another, moves, revisions holding only marks, bookmarks (inside
// revisions too), comment ranges and references, a footnote mark,
// tabs and fields, formatting, text outside the BMP and right to
// left; ranges at the ends, adjacent ranges, ranges inside
// insertions; empty, longer and non-BMP replacements.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {piece} from '../../tools/moreapps/!Letters/Find';
import {list} from '../../tools/moreapps/!Letters/RevMarks';
import {stepEnd} from '../../tools/moreapps/!Letters/EditStep';
import * as RT from '../../tools/moreapps/!Letters/RevTrack';
import {buildDocx, documentXml, settingsXml, W_NS, R_NS}
  from './build-docx.mjs';
import {commentParts, cs, ce, cr} from './comment-fixtures.mjs';
import {SEPS, noteP, mark} from './note-fixtures.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const NOW = new Date(2025, 0, 2, 3, 4, 5);
const D = '2024-01-02T03:04:00Z';
const TRACK = '<w:trackRevisions/>';
const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const sp = ' xml:space="preserve"';
const FMT = ['', '<w:b/>', '<w:i/>', '<w:u w:val="single"/>'];
const att = (id, au) => `w:id="${id}" w:author="${au}" w:date="${D}"`;
const run = (t, f, tag = 'w:t') => `<w:r>${f ? '<w:rPr>' + f +
  '</w:rPr>' : ''}<${tag}${sp}>${t}</${tag}></w:r>`;
const bmk = (id) => `<w:bookmarkStart w:id="${id}" w:name="b${id}"/>` +
  `<w:bookmarkEnd w:id="${id}"/>`;
const FIELD = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText> PAGE </w:instrText></w:r><w:r>' +
  '<w:fldChar w:fldCharType="separate"/></w:r>' + run('1') +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

/** A seeded generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['teh', 'a', 'fox', 'brwn', 'xy', 'lazy', 'q',
  '\u{1D518}x', 'שלום'];

/** A random paragraph: {xml, cm (comments), nt (footnote marks)}.
 *  Plain runs of several formats; insertions and deletions by Ann
 *  (the author recording) and Bo, some holding a bookmark, some only
 *  marks; a move of Bo's (both halves, with their ranges); tabs, a
 *  PAGE field, a footnote mark; bookmarks and comment ranges
 *  between; ids from 1, sometimes one large. */
function paraXml(R) {
  const pick = (xs) => xs[Math.floor(R() * xs.length)];
  let id = 1 + Math.floor(R() * 3), out = '', bm = 0, cm = 0, nt = 0;
  let mv = 0;
  const bare = {Ann: [], Bo: []};      // (marks-only insertions' ids)
  // (sometimes a paragraph before, holding only a marks-only
  // insertion whose id the paragraph edited may use again)
  let lead = '';
  if (R() < 0.3) {
    const au = R() < 0.5 ? 'Ann' : 'Bo';
    lead = `<w:p>${run('x ')}<w:ins ${att(800, au)}>` +
      `<w:bookmarkStart w:id="99" w:name="lead"/>` +
      `<w:bookmarkEnd w:id="99"/></w:ins></w:p>`;
    bare[au].push(800);
  }
  const open = [];
  const n = 1 + Math.floor(R() * 10);
  for (let k = 0; k < n; k++) {
    let t = '';
    const w = 1 + Math.floor(R() * 4);
    for (let j = 0; j < w; j++) {
      t += pick(WORDS) + (R() < 0.7 ? ' ' : '');
    }
    const f = pick(FMT), x = R();
    const nid = R() < 0.1 ? 900 + k : id++;
    const tag = (kind, au, body, i = nid) => `<w:${kind} ` +
      `${att(i, au)}>${body}</w:${kind}>`;
    // (an insertion sometimes of the id of a marks-only one before:
    // one revision in two stretches, one holding only marks)
    const again = (au) => (bare[au].length && R() < 0.4
      ? bare[au][bare[au].length - 1] : nid);
    let inner = run(t, f);
    if (R() < 0.15) {
      inner = run(t.slice(0, 2), f) + bmk(50 + bm++) +
        run(t.slice(2), f);
    }
    if (x < 0.3) out += inner;
    else if (x < 0.42) out += tag('ins', 'Ann', inner, again('Ann'));
    else if (x < 0.52) out += tag('ins', 'Bo', inner, again('Bo'));
    else if (x < 0.6) out += tag('del', 'Ann', run(t, f, 'w:delText'));
    else if (x < 0.68) out += tag('del', 'Bo', run(t, f, 'w:delText'));
    else if (x < 0.73) {
      const au = pick(['Ann', 'Bo']);
      out += tag('ins', au, bmk(50 + bm++)) + run(t, f);
      bare[au].push(nid);
    } else if (x < 0.77 && !mv) {
      const m = 700 + 4 * mv++, a = att(m, 'Bo').replace(/^w:id="\d+"/,
        '');
      out += `<w:moveFromRangeStart w:id="${m}"${a} w:name="mv"/>` +
        `<w:moveFrom ${att(m + 1, 'Bo')}>${run(t, f, 'w:delText')}` +
        `</w:moveFrom><w:moveFromRangeEnd w:id="${m}"/>` + run(' ') +
        `<w:moveToRangeStart w:id="${m + 2}"${a} w:name="mv"/>` +
        `<w:moveTo ${att(m + 3, 'Bo')}>${run(t, f)}</w:moveTo>` +
        `<w:moveToRangeEnd w:id="${m + 2}"/>`;
    } else if (x < 0.83) out += '<w:r><w:tab/></w:r>' + run(t, f);
    else if (x < 0.87) out += FIELD + run(t, f);
    else if (x < 0.91 && !nt) {
      out += mark(1) + run(t, f);
      nt++;
    } else out += run(t, f);
    const y = R();
    if (y < 0.12) out += bmk(bm++);
    else if (y < 0.24 && cm < 3) {
      out += cs(cm);
      open.push(cm++);
    } else if (y < 0.34 && open.length) {
      const c = open.shift();
      out += ce(c) + cr(c);
    }
  }
  for (const c of open) out += ce(c) + cr(c);
  return {xml: `${lead}<w:p>${out}</w:p>`, cm, nt};
}

/** Random ranges of text (ascending, apart, some adjacent, some at
 *  either end). */
function rangesOf(R, len) {
  const out = [];
  let at = R() < 0.3 ? 0 : Math.floor(R() * 3);
  while (at < len) {
    const n = 1 + Math.floor(R() * 4);
    const to = Math.min(len, at + n);
    if (R() < 0.15 && out.length) {
      const last = out[out.length - 1];       // (to the end)
      if (last.to < len) out.push({from: last.to, to: len});
      break;
    }
    out.push({from: at, to});
    at = to + (R() < 0.3 ? 0 : Math.floor(R() * 5));
  }
  return out;
}

const REPL = ['the', 'a', 'brown fox', '', 'quick', 'qu\u{1F600}'];

async function docOf(bytes) {
  const d = new Document(await readDocx(bytes));
  d.reviewer = () => ({name: 'Ann', now: NOW});
  d.seen = [];
  d.on('change', (e) => d.seen.push(e));
  return d;
}
/** The paragraph edited: the last. */
const P = (d) => d.doc.sections[0].blocks.at(-1);
/** P(d) less its id (each Document read numbers its own). */
const Q = (d) => ({...P(d), id: 0});
const AT = (d) => [0, d.doc.sections[0].blocks.length - 1];
/** The parts written that the edit can touch. */
async function partsXml(d) {
  const z = await readZip(await writeDocx(d.doc, {date: DATE}));
  let s = '';
  for (const n of ['word/document.xml', 'word/comments.xml',
    'word/footnotes.xml']) {
    const b = z.get(n);
    s += n + ':' + (b ? new TextDecoder().decode(b) : '') + '\n';
  }
  return s;
}
/** The comments and notes models. */
const rest = (d) => JSON.stringify({c: d.doc.comments, n: d.doc.notes},
  (k, v) => (v instanceof Map ? [...v] : v && v.type === 'p'
    ? {...v, id: 0} : v));
/** Where the last step (an undo or redo) leaves the caret. */
const caret = (d) => {
  if (!d.seen.length) return null;     // (nothing changed)
  const e = stepEnd(d.doc, d.seen.at(-1).ops, null);
  return e && e.off;
};

/** The case of a seed: bytes, the ranges swap can take, the text. */
async function caseOf(seed) {
  const R = rng(seed);
  const {xml, cm, nt} = paraXml(R);
  const c = commentParts(Object.fromEntries(
    Array.from({length: cm}, (_, k) => [k, 'c' + k])));
  const parts = {'word/document.xml': documentXml(xml),
    'word/settings.xml': settingsXml(TRACK), ...c.parts};
  const docRels = [...c.docRels];
  if (nt) {
    parts['word/footnotes.xml'] = DECL + `<w:footnotes xmlns:w=` +
      `"${W_NS}" xmlns:r="${R_NS}">${SEPS}<w:footnote w:id="1">` +
      `${noteP('fn')}</w:footnote></w:footnotes>`;
    docRels.push(['rIdF1', R_NS + '/footnotes', 'footnotes.xml']);
  }
  const bytes = await buildDocx(parts, {docRels});
  const d = await docOf(bytes), p = P(d), s = RT.session(d);
  const lo = (k) => /[\uDC00-\uDFFF]/.test(p.text[k] || '');
  const rs = rangesOf(R, p.text.length).filter((r) => !lo(r.from) &&
    !lo(r.to) && s.why(p, r.from, r.to) === null);
  return {bytes, rs, text: REPL[Math.floor(R() * REPL.length)]};
}

/** The ranges replaced one by one (last first): what each did. */
function oneByOne(d, rs, text) {
  const p = P(d), did = [];
  RT.record(d, () => d.atomic(() => {
    const s = RT.session(d);
    for (let k = rs.length - 1; k >= 0; k--) {
      const r = rs[k], was = P(d).text.length;
      const res = s.swap(AT(d), r.from, r.to,
        piece(p, r.from, r.to - r.from, text));
      did.push({ins: res, delta: P(d).text.length - was});
    }
  }));
  return did;
}

function batch(d, rs, text) {
  const p = P(d);
  let did;
  RT.record(d, () => d.atomic(() => {
    did = RT.session(d).swapMany(AT(d), rs.map((r) => ({...r,
      content: piece(p, r.from, r.to - r.from, text)})));
  }));
  return did;
}

/** Each id one revision: one kind, author and date (a tag may lie
 *  in several stretches, as swap leaves it). */
function unique(d, why) {
  const by = new Map();
  for (const r of P(d).runs) {
    if (!r.rev) continue;
    const k = [r.rev.kind, r.rev.author, r.rev.date].join();
    assert.equal(by.get(r.rev.id) || k, k, why);
    by.set(r.rev.id, k);
  }
}

/** a (one by one) and b (in one pass, from what each was: was) the
 *  same, as the header says; then after undo, after redo. */
async function same(a, b, why, [orig, origB]) {
  assert.deepEqual(Q(b), Q(a), why);
  assert.deepEqual(list(b.doc), list(a.doc), why);
  assert.equal(rest(b), rest(a), why);
  unique(b, why);
  assert.equal(await partsXml(b), await partsXml(a), why);
  assert.equal(b.undoDepth, a.undoDepth, why);
  for (const d of [a, b]) d.undo();
  assert.deepEqual(P(b), origB, why);
  assert.deepEqual(P(a), orig, why);
  assert.equal(rest(b), rest(a), why);
  assert.equal(caret(b), caret(a), why + ' (caret after undo)');
  for (const d of [a, b]) d.redo();
  assert.deepEqual(Q(b), Q(a), why);
  assert.equal(await partsXml(b), await partsXml(a), why);
  assert.equal(caret(b), caret(a), why + ' (caret after redo)');
}

describe('RevTrack swapMany', () => {
  it('equals the one-by-one result: 300 seeded cases, undo and redo',
    async () => {
      const n = {revs: 0, adjacent: 0, ends: 0, marks: 0, inl: 0,
        fast: 0, fastRevs: 0};
      let used = 0;
      for (let seed = 1; used < 300; seed++) {
        const {bytes, rs, text} = await caseOf(seed);
        if (!rs.length) continue;
        used++;
        const a = await docOf(bytes), b = await docOf(bytes);
        const p = P(a), was = [p, P(b)];
        if (text && p.runs.some((r) => r.rev)) n.revs++;
        const len = p.text.length;
        if (rs.some((r, k) => k && rs[k - 1].to === r.from)) {
          n.adjacent++;
        }
        if (rs[0].from === 0 || rs.at(-1).to === len) n.ends++;
        if (text && /￼/.test(p.text)) n.inl++;
        if (text && p.runs.some((r) => r.rev &&
          /^￼+$/.test(p.text.slice(r.start, r.end)))) n.marks++;
        const why = `seed ${seed}`;
        let ea = null, eb = null, da, db;
        try {
          da = oneByOne(a, rs, text);
        } catch (e) { ea = e.message; }
        let puts = 0;
        const ap = b.apply.bind(b);
        b.apply = (op, o) => {
          puts++;
          return ap(op, o);
        };
        try { db = batch(b, rs, text); } catch (e) { eb = e.message; }
        b.apply = ap;
        // (the pass taken, not one by one: three splices)
        if (puts === 3 && rs.length > 1) {
          n.fast++;
          if (p.runs.some((r) => r.rev)) n.fastRevs++;
        }
        assert.equal(eb, ea, why);
        if (ea) continue;
        assert.deepEqual(db, da, why);
        await same(a, b, why, was);
      }
      // (an empty replacement is swapped one by one: so the cases of
      // text put in are counted)
      assert.ok(n.revs >= 150 && n.adjacent >= 50 && n.ends >= 50 &&
        n.marks >= 20 && n.inl >= 100 && n.fast >= 120 &&
        n.fastRevs >= 60, JSON.stringify(n));
    });
  it('a revision holding only marks, outside the ranges, stays',
    async () => {
      const xml = '<w:p>' + run('teh a ') +
        `<w:ins ${att(5, 'Bo')}>${bmk(1)}</w:ins>` + run(' tail') +
        '</w:p>';
      const bytes = await buildDocx({'word/document.xml':
        documentXml(xml), 'word/settings.xml': settingsXml(TRACK)});
      const rs = [{from: 0, to: 3}];
      const a = await docOf(bytes), b = await docOf(bytes);
      const was = [P(a), P(b)];
      oneByOne(a, rs, 'the');
      batch(b, rs, 'the');
      assert.ok(list(b.doc).some((e) => e.id === 5));
      await same(a, b, 'marks only', was);
    });
  it('a revision holding only marks in another paragraph stays',
    async () => {
      // (one insertion in two paragraphs: only marks in the first, its
      // text in the second, where the ranges are)
      const xml = '<w:p>' + run('x ') +
        `<w:ins ${att(5, 'Bo')}>${bmk(1)}</w:ins>` + '</w:p><w:p>' +
        run('teh a ') + `<w:ins ${att(5, 'Bo')}>${run('bob')}</w:ins>` +
        run(' teh') + '</w:p>';
      const bytes = await buildDocx({'word/document.xml':
        documentXml(xml), 'word/settings.xml': settingsXml(TRACK)});
      const rs = [{from: 0, to: 3}, {from: 10, to: 13}];
      const P1 = (d) => d.doc.sections[0].blocks[1];
      const go = (d, many) => {
        const p = P1(d);
        const cs = rs.map((r) => ({...r, content: piece(p, r.from, 3,
          'the')}));
        RT.record(d, () => d.atomic(() => {
          const s = RT.session(d);
          if (many) s.swapMany([0, 1], cs);
          else {
            for (const c of [...cs].reverse()) {
              s.swap([0, 1], c.from, c.to, c.content);
            }
          }
        }));
      };
      const a = await docOf(bytes), b = await docOf(bytes);
      go(a, false);
      go(b, true);
      assert.deepEqual(list(b.doc), list(a.doc));
      assert.ok(P(b).runs.some((r) => r.rev && r.rev.id === 5));
      assert.equal(await partsXml(b), await partsXml(a));
    });
  it('the caret after undo and redo is where one by one leaves it',
    async () => {
      const xml = '<w:p>' + run('teh a teh b teh c tail') + '</w:p>';
      const bytes = await buildDocx({'word/document.xml':
        documentXml(xml), 'word/settings.xml': settingsXml(TRACK)});
      const rs = [{from: 0, to: 3}, {from: 6, to: 9},
        {from: 12, to: 15}];
      const a = await docOf(bytes), b = await docOf(bytes);
      const was = [P(a), P(b)];
      oneByOne(a, rs, 'the');
      batch(b, rs, 'the');
      await same(a, b, 'caret', was);
    });
  it('the author\'s own insertion holding the largest id, cut away',
    async () => {
      // (the id is free again once its text is gone: one by one the
      // first new id is chosen after that cut, so here too)
      const xml = '<w:p>' + run('one ') +
        `<w:ins ${att(9, 'Ann')}>${run('teh')}</w:ins>` + run(' two ') +
        `<w:ins ${att(3, 'Bo')}>${run('x')}</w:ins>` + run(' teh') +
        '</w:p>';
      const bytes = await buildDocx({'word/document.xml':
        documentXml(xml), 'word/settings.xml': settingsXml(TRACK)});
      const rs = [{from: 0, to: 3}, {from: 4, to: 7}];
      const a = await docOf(bytes), b = await docOf(bytes);
      oneByOne(a, rs, 'the');
      batch(b, rs, 'the');
      assert.deepEqual(Q(b), Q(a));
      const mine = P(b).runs.filter((r) => r.rev &&
        r.rev.author === 'Ann').map((r) => r.rev.id);
      assert.deepEqual(mine.sort(), [4, 5, 6]);
      assert.deepEqual(list(b.doc), list(a.doc));
    });
  it('one paragraph put in a few times, however many ranges',
    async () => {
      const words = [];
      for (let k = 0; k < 2000; k++) words.push(k % 7 ? 'teh' : 'fox');
      const xml = '<w:p>' + run(words.join(' ')) + '</w:p>';
      const bytes = await buildDocx({'word/document.xml':
        documentXml(xml), 'word/settings.xml': settingsXml(TRACK)});
      const b = await docOf(bytes), text = P(b).text, rs = [];
      for (let k = text.indexOf('teh'); k >= 0;
        k = text.indexOf('teh', k + 3)) rs.push({from: k, to: k + 3});
      let puts = 0;
      const ap = b.apply.bind(b);
      b.apply = (op, o) => {
        puts++;
        return ap(op, o);
      };
      const t0 = performance.now();
      batch(b, rs, 'the');
      const ms = performance.now() - t0;
      assert.ok(puts <= 3, 'paragraph changes: ' + puts);
      assert.ok(ms < 1500, 'took ' + Math.round(ms) + ' ms');
      assert.equal(list(b.doc).length, 2 * rs.length);
      assert.equal(b.undoDepth, 1);
    });
});
