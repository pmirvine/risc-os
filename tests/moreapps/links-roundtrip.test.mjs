// Hyperlinks, bookmarks, the format painter and the word count round
// trip: documents changed with !Word's A6 commands (./LinkOps
// insertLink / editLink / removeLink, ./Bookmarks addBookmark /
// deleteBookmark, ./FormatPaint pick and paint, ./WordCount count),
// mixed with typing, Enter, deleting, character formats, paragraph
// styles and bursts of undo and redo; then written and read back.
// The checks are those of roundtrip-lib.mjs: the model read back
// equals the changed model; every block passes ModelCheck; the
// package linter (which reports a link whose r:id the relationships
// do not hold as rid-unresolved) and xmllint/wml.xsd (when
// available, for one seed) add no error; undo of everything gives
// back the opened model and its bytes (relationships and styles
// included). Besides: a command that is refused ({error}) changes
// nothing (no undo step, no change to the model); the word count
// and goTo change nothing; a link made, saved and read back is the
// same link with the same External relationship and no
// rid-unresolved; a bookmark over several paragraphs reads back with
// its pair of ids; the painter's replace leaves the target with the
// picked formatting.
//
// Documents: the reader fixtures, the list fixtures (the painter
// carries lists), plain documents, links (web, mailto, anchor, a
// ScreenTip, formatted text, a missing r:id), bookmarks (spanning
// paragraphs, hidden, duplicate names, ids clashing, in a table),
// a document with its own Hyperlink style, a Strict document, and
// the corpus sample, gated as the other round trips (one file in
// ten by a hash of the name; WORD_EDIT_CORPUS=1 for every file,
// which needs NODE_OPTIONS=--max-old-space-size=4096). 40 seeded
// commands per file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, stylesXml, p, r, REL, STRICT_REL}
  from './build-docx.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS, write} from './roundtrip-lib.mjs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {Document} from '../../tools/moreapps/!Word/Document';
import {rng} from './word-docs.mjs';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as LO from '../../tools/moreapps/!Word/LinkOps';
import * as BM from '../../tools/moreapps/!Word/Bookmarks';
import * as FP from '../../tools/moreapps/!Word/FormatPaint';
import {count} from '../../tools/moreapps/!Word/WordCount';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {lintPackage} from './lint-package.mjs';

export const STEPS = 40;
const LINKS_MS = 3000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);

function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pick(rd, graphemes(b.text))};
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

/** A selection on a random link (its one character), or null. */
function linkSel(rd, d) {
  const found = [];
  for (const b of allBlocks(d)) {
    if (b.type !== 'p') continue;
    for (const [off, x] of Object.entries(b.inlines || {})) {
      if (LO.isLink(x)) found.push({id: b.id, off: +off});
    }
  }
  if (!found.length) return null;
  const q = pick(rd, found);
  return rd() < 0.7 ? S.select(q, {id: q.id, off: q.off + 1})
    : S.caret(q);
}

const ADDRESSES = ['https://example.org/a?b=c#d', 'www.example.net',
  'mailto:someone@example.org', 'ftp://files.example.org/x.txt',
  'http://example.org/with space/é', '#Mark', '#', '#bad name',
  'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd',
  'vbscript:x', ' ', '', 'x', 'http://', 'http://a b/', 'HTTP://UP.ORG',
  'https://e.org/\u0001', 'mailto:', 'https://e.org/' + 'a'.repeat(2100),
  null, 7, {}];
const TEXTS = [undefined, 'new text', 'a\u0001b', '', ' ', 'café \u{1F600}',
  'x'.repeat(1500), null, 5];
const TIPS = [undefined, '', 'a tip', 't\u0007ip', 'x'.repeat(400)];
const BNAMES = ['Mark', 'mark', 'MARK', 'Other_1', 'Café', 'a',
  'x'.repeat(40), 'x'.repeat(41), '', '1abc', '_hidden', 'a b', '__proto__',
  'constructor', 'toString', 'a\u0000b', 'a-b', 'Bad\u{FFFC}', null, 5, {}];

export const KINDS = ['link insert', 'link edit', 'link remove',
  'bookmark add', 'bookmark delete', 'bookmark goto', 'painter',
  'word count', 'format', 'type', 'enter', 'delete range', 'style',
  'undo/redo'];
const CHANGES = ['link insert', 'link edit', 'link remove',
  'bookmark add', 'bookmark delete', 'painter', 'format', 'type',
  'enter'];

/** What an {error} result must leave alone. */
function refusedCheck(kind, d, depth, before) {
  assert.equal(d.undoDepth, depth, kind + ' refused: no undo step');
  if (before) assert.deepEqual(d.doc.sections, before,
    kind + ' refused: unchanged');
}

/** One random command; [kind, selection after]. */
function command(rd, d, t, sel, every) {
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
  let kind, res;
  const attempt = (fn) => {
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      return {error: e.message};
    }
  };
  if (x < 0.22) {
    kind = 'link insert';
    const o = {};
    const a = pick(rd, ADDRESSES);
    if (rd() < 0.15) o.anchor = pick(rd, BNAMES); else o.address = a;
    const txt = pick(rd, TEXTS);
    if (txt !== undefined) o.text = txt;
    const tip = pick(rd, TIPS);
    if (tip !== undefined) o.tip = tip;
    res = attempt(() => LO.insertLink(d, t, sel, o));
  } else if (x < 0.3) {
    kind = 'link edit';
    const ls = linkSel(rd, d) || sel;
    const o = {};
    if (rd() < 0.6) o.address = pick(rd, ADDRESSES);
    if (rd() < 0.4) o.text = pick(rd, TEXTS);
    if (rd() < 0.4) o.tip = pick(rd, TIPS);
    res = attempt(() => LO.editLink(d, t, ls, o));
  } else if (x < 0.36) {
    kind = 'link remove';
    res = attempt(() => LO.removeLink(d, t, linkSel(rd, d) || sel));
  } else if (x < 0.5) {
    kind = 'bookmark add';
    res = attempt(() => BM.addBookmark(d, t, sel, pick(rd, BNAMES)));
  } else if (x < 0.55) {
    kind = 'bookmark delete';
    res = attempt(() => BM.deleteBookmark(d, t, pick(rd, BNAMES), sel));
  } else if (x < 0.58) {
    kind = 'bookmark goto';
    res = attempt(() => BM.goTo(d.doc, pick(rd, BNAMES)));
    if (res && res.sel) res = {sel: res.sel};
    assert.equal(d.undoDepth, depth, 'goTo changes nothing');
    return [kind, res && res.sel ? res.sel : sel];
  } else if (x < 0.7) {
    kind = 'painter';
    const from = randSel(rd, d);
    const picked = FP.pick(d.doc, from);
    res = picked ? attempt(() => ({sel: FP.paint(d, t, sel, picked)}))
      : null;
  } else if (x < 0.74) {
    kind = 'word count';
    const c = count(d.doc, rd() < 0.5 ? sel : null);
    assert.ok(Number.isInteger(c.words) && c.words >= 0, 'words');
    assert.ok(c.chars >= c.charsNoSpaces, 'chars');
    assert.equal(d.undoDepth, depth, 'count changes nothing');
    if (before) assert.deepEqual(d.doc.sections, before, 'count');
    return [kind, sel];
  } else if (x < 0.8) {
    kind = 'format';
    res = attempt(() => FA.apply(pick(rd, ['bold', 'italic', 'underline']),
      d, t, sel));
  } else if (x < 0.88) {
    kind = 'type';
    res = {sel: t.type(sel, pick(rd, ['a', ' ', 'word ', 'é', 'x']))};
  } else if (x < 0.93) {
    kind = 'enter';
    res = run('enter', d, t, sel);
  } else if (x < 0.97) {
    kind = 'delete range';
    const to = randSel(rd, d);
    res = run('delete', d, t, to ? S.select(sel.anchor, to.head) : sel);
  } else {
    kind = 'style';
    res = attempt(() => FA.apply('style', d, t, sel, pick(rd,
      ['Heading1', 'Normal', 'Hyperlink', 'Title'])));
  }
  if (res && res.error !== undefined) {
    refusedCheck(kind, d, depth, before);
    return [kind + ' refused', sel];
  }
  if (res === undefined || res === null) return [kind + ' none', sel];
  return [kind, res.sel || res || sel];
}

/** STEPS commands on d. */
export function linksAll(d, seed, {every = false, steps = STEPS} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < steps; k++) {
    if (Date.now() - t0 > LINKS_MS) break;
    if (!sel || rd() < 0.6) sel = randSel(rd, d);
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel] = command(rd, d, t, sel, every);
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

const HREL = [['rId9', REL('hyperlink'), 'https://example.org/one',
  'External'], ['rId10', REL('hyperlink'), 'mailto:a@example.org',
  'External']];
const link = (id, text, extra = '') => `<w:hyperlink r:id="${id}" ` +
  `w:history="1"${extra}><w:r><w:rPr><w:rStyle w:val="Hyperlink"/>` +
  `</w:rPr><w:t>${text}</w:t></w:r></w:hyperlink>`;
const anchor = (name, text) => `<w:hyperlink w:anchor="${name}">` +
  `<w:r><w:t>${text}</w:t></w:r></w:hyperlink>`;
const bs = (id, name) => `<w:bookmarkStart w:id="${id}" w:name="${name}"/>`;
const be = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const TABLE = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc><w:p>' + bs(40, 'InCell') +
  '<w:r><w:t>cell text</w:t></w:r>' + be(40) + '</w:p></w:tc></w:tr>' +
  '</w:tbl>';
const HSTYLE = stylesXml(
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name ' +
  'w:val="Hyperlink"/><w:rPr><w:color w:val="FF0000"/><w:u ' +
  'w:val="double"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name ' +
  'w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/>' +
  '<w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/>' +
  '</w:rPr></w:style>');
const doc = (body, parts = {}, opts = {}) => () => buildDocx(
  {'word/document.xml': documentXml(body), ...parts}, opts);

const TEXTS_DOC = ['hello world', 'The quick brown fox', 'café \u{1F600}',
  'one. two! three?', 'a b c d e f g'];
const MORE = [
  ['plain paragraphs', doc(TEXTS_DOC.map((s) => p(r(s))).join(''))],
  ['formatted runs for the painter', doc(
    p(r('Bold red ', '<w:b/><w:color w:val="FF0000"/>') + r('plain ') +
      r('italic', '<w:i/><w:sz w:val="40"/>'), '<w:jc w:val="center"/>') +
    p(r('Second paragraph plain')) +
    p(r('Third'), '<w:ind w:left="720"/><w:spacing w:before="240"/>'))],
  ['links: web, mailto, anchor, ScreenTip, missing r:id', doc(
    p(r('See ') + link('rId9', 'the site', ' w:tooltip="A tip"') +
      r(' and ') + link('rId10', 'mail me')) +
    p(anchor('Mark', 'go to mark') + r(' then ') +
      anchor('Nowhere', 'missing target')) +
    p(bs(1, 'Mark') + r('Marked text') + be(1)) +
    p('<w:hyperlink r:id="rId77"><w:r><w:t>no rel</w:t></w:r>' +
      '</w:hyperlink>' + r(' tail')),
  {}, {docRels: HREL})],
  ['a document with its own Hyperlink style', doc(
    p(r('A ') + link('rId9', 'link') + r(' B')) + p(r('Heading'),
      '<w:pStyle w:val="Heading1"/>') + p(r('Plain text here')),
    {'word/styles.xml': HSTYLE}, {docRels: HREL})],
  ['bookmarks over paragraphs, hidden, duplicate names, clashing ids',
    doc(p(bs(1, 'Span') + r('starts here')) + p(r('middle')) +
      p(r('ends here') + be(1)) + p(bs(2, '_Toc1') + r('hidden') + be(2)) +
      p(bs(3, 'Dup') + r('one') + be(3)) +
      p(bs(4, 'dup') + r('two') + be(4)) +
      p(bs(4, 'Clash') + r('same id') + be(4)) +
      p(bs(2147483647, 'Big') + r('big id') + be(2147483647)) +
      p(be(99) + r('orphan end') + bs(98, 'Orphan')))],
  ['a bookmark in a table', doc(p(r('Before')) + TABLE +
    p(r('After the table')))],
  ['Strict hyperlinks', doc(p(r('Strict ') + link('rId9', 'link'),
    '') + p(r('Plain')), {}, {strict: true,
    docRels: [['rId9', STRICT_REL('hyperlink'), 'https://e.org/',
      'External']]})],
  ['empty document', doc('')],
];

const {xsd, note: xsdNote} = schema();
// 'lossless rule' holds runs whose raw rPr children are the same set
// in a different order: a character format command (not an A6 one)
// splits a run there and the reader merges the halves again, which
// the equality check reports. It is left out here (the format round
// trip has the same fixture with other seeds).
const DOCS = [...FIXTURES.filter(([n]) => n !== 'lossless rule'),
  ...LIST_DOCS, ...MORE];

describe('links round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          linksAll, {xsd: k === 0 ? xsd : null, every: true});
        if (res.refused) continue;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# links commands (generated): ' + JSON.stringify(total));
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

/** A session on bytes. */
async function open(bytes) {
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  return {d, t, p: (i) => allBlocks(d)[i],
    caret: (i, off = 0) => S.caret({id: allBlocks(d)[i].id, off}),
    sel: (i, a, j = i, b = a) => S.select({id: allBlocks(d)[i].id,
      off: a}, {id: allBlocks(d)[j].id, off: b})};
}
const saved = async (d) => {
  const bytes = await write(d.doc);
  return {bytes, zip: await readZip(bytes), back: await readDocx(bytes)};
};
const problems = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error');
const text = (zip, name) => new TextDecoder().decode(zip.get(name));
const PLAIN3 = () => buildDocx({'word/document.xml': documentXml(
  p(r('one two three')) + p(r('four five six')) + p(r('seven')))});

describe('links round trip: pinned cases', () => {
  it('a link made, saved and read back is the same link; no ' +
    'rid-unresolved; undo takes it away', async () => {
    const s = await open(await PLAIN3());
    const o = LO.insertLink(s.d, s.t, s.sel(0, 4, 0, 7),
      {address: 'https://example.org/x', tip: 'tip'});
    assert.ok(o.sel, JSON.stringify(o));
    assert.equal(s.d.undoDepth, 1);
    const a = await saved(s.d);
    assert.deepEqual(problems(a.zip).filter((q) =>
      q.rule === 'rid-unresolved'), []);
    assert.deepEqual(problems(a.zip), []);
    const x = text(a.zip, 'word/document.xml');
    assert.match(x, /<w:hyperlink [^>]*r:id="rId\d+"/);
    assert.match(x, /w:tooltip="tip"/);
    assert.match(text(a.zip, 'word/_rels/document.xml.rels'),
      /Target="https:\/\/example\.org\/x" TargetMode="External"/);
    assert.match(text(a.zip, 'word/styles.xml'), /w:styleId="Hyperlink"/);
    const q = a.back.sections[0].blocks[0];
    assert.equal(q.text, 'one ￼ three');
    const info = LO.linkInfo(a.back, q.inlines[4]);
    assert.deepEqual(info, {text: 'two', address:
      'https://example.org/x', tip: 'tip'});
    while (s.d.undo());
    const z = await saved(s.d);
    assert.ok(!/<w:hyperlink/.test(text(z.zip, 'word/document.xml')));
    assert.ok(!/Hyperlink/.test(text(z.zip, 'word/styles.xml')));
  });
  it('edit then remove: the relationship stays, the text is back, ' +
    'still valid', async () => {
    const s = await open(await PLAIN3());
    LO.insertLink(s.d, s.t, s.sel(0, 0, 0, 3), {address: 'www.a.org'});
    const at = S.select({id: s.p(0).id, off: 0}, {id: s.p(0).id, off: 1});
    assert.ok(LO.editLink(s.d, s.t, at, {address: 'mailto:z@a.org',
      text: 'ONE'}).sel);
    assert.ok(LO.removeLink(s.d, s.t, at).sel);
    assert.equal(s.p(0).text, 'ONE two three');
    const a = await saved(s.d);
    assert.deepEqual(problems(a.zip), []);
    assert.ok(!/<w:hyperlink/.test(text(a.zip, 'word/document.xml')));
    assert.equal(a.back.sections[0].blocks[0].text, 'ONE two three');
    // two relationships were made and both stay (valid, unused)
    const rels = text(a.zip, 'word/_rels/document.xml.rels')
      .match(/hyperlink"/g) || [];
    assert.equal(rels.length, 2);
  });
  it('a link to a bookmark has no relationship; bad addresses change ' +
    'nothing', async () => {
    const s = await open(await PLAIN3());
    BM.addBookmark(s.d, s.t, s.sel(2, 0, 2, 5), 'Seven');
    const depth = s.d.undoDepth;
    const rels0 = s.d.doc.rels;
    assert.ok(LO.insertLink(s.d, s.t, s.sel(0, 0, 0, 3),
      {address: '#Seven'}).sel);
    assert.equal(s.d.doc.rels, rels0, 'no new relationship');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x',
      'file:///etc/passwd', 'vbscript:x', 'http://a b/', 'x:y',
      'https://e.org/' + 'a'.repeat(3000)]) {
      const before = s.d.undoDepth;
      const o = LO.insertLink(s.d, s.t, s.sel(1, 0, 1, 4), {address: bad});
      assert.ok(o.error, bad.slice(0, 20) + ' refused');
      assert.equal(s.d.undoDepth, before);
    }
    assert.equal(s.d.undoDepth, depth + 1);
    const a = await saved(s.d);
    assert.deepEqual(problems(a.zip), []);
    assert.match(text(a.zip, 'word/document.xml'),
      /<w:hyperlink w:anchor="Seven"/);
  });
  it('a bookmark over several paragraphs reads back with its pair, ' +
    'ids unique; moving by name is one step', async () => {
    const s = await open(await PLAIN3());
    assert.ok(BM.addBookmark(s.d, s.t, s.sel(0, 4, 2, 3), 'Span').sel);
    assert.ok(BM.addBookmark(s.d, s.t, s.sel(1, 0, 1, 4), 'Other').sel);
    assert.ok(BM.addBookmark(s.d, s.t, s.sel(1, 5, 1, 9), 'span').sel);
    assert.equal(s.d.undoDepth, 3);
    const a = await saved(s.d);
    assert.deepEqual(problems(a.zip), []);
    const x = text(a.zip, 'word/document.xml');
    assert.equal((x.match(/<w:bookmarkStart /g) || []).length, 2);
    assert.equal((x.match(/<w:bookmarkEnd /g) || []).length, 2);
    const ids = [...x.matchAll(/<w:bookmarkStart w:id="(\d+)"/g)]
      .map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    const g = BM.goTo(a.back, 'Span');
    assert.ok(g.sel, JSON.stringify(g));
    for (const bad of ['', '1a', 'a b', 'x'.repeat(41), '__proto__x ']) {
      assert.ok(BM.addBookmark(s.d, s.t, s.sel(2, 0), bad).error, bad);
    }
    assert.equal(s.d.undoDepth, 3);
    while (s.d.undo());
    assert.ok(!/bookmarkStart/.test(text((await saved(s.d)).zip,
      'word/document.xml')));
  });
  it('the painter replaces: the target ends up with the picked ' +
    'format and nothing more; one step; read back equal', async () => {
    const s = await open(await buildDocx({'word/document.xml':
      documentXml(p(r('Source ', '<w:b/><w:color w:val="FF0000"/>') +
        r('rest'), '<w:jc w:val="center"/>') +
        p(r('Target ', '<w:i/><w:u w:val="single"/>') + r('more')))}));
    const picked = FP.pick(s.d.doc, s.sel(0, 0, 0, 6));
    assert.ok(picked && picked.rPr.b && picked.rPr.color === 'FF0000');
    assert.equal(picked.pPr, undefined, 'inside a paragraph: chars only');
    FP.paint(s.d, s.t, s.sel(1, 0, 1, 6), picked);
    assert.equal(s.d.undoDepth, 1);
    const q = s.p(1);
    const first = q.runs.find((x) => x.start === 0);
    assert.equal(first.rPr.b, true);
    assert.equal(first.rPr.color, 'FF0000');
    assert.ok(!first.rPr.i && !first.rPr.u, 'old format replaced');
    // the same paint again changes nothing
    FP.paint(s.d, s.t, s.sel(1, 0, 1, 6), picked);
    assert.equal(s.d.undoDepth, 1, 'no change, no step');
    const a = await saved(s.d);
    assert.deepEqual(problems(a.zip), []);
    assert.deepEqual(a.back.sections[0].blocks[1].runs.map((x) =>
      [x.start, x.end, !!x.rPr.b, x.rPr.color || null, !!x.rPr.i]),
    q.runs.map((x) => [x.start, x.end, !!x.rPr.b, x.rPr.color || null,
      !!x.rPr.i]));
    while (s.d.undo());
    assert.ok(s.p(1).runs.find((x) => x.start === 0).rPr.i);
  });
  it('the word count reads, never writes', async () => {
    const s = await open(await PLAIN3());
    const c = count(s.d.doc);
    assert.equal(c.words, 7);
    assert.equal(c.paras, 3);
    assert.equal(count(s.d.doc, s.sel(0, 0, 1, 4)).words, 4);
    assert.equal(s.d.undoDepth, 0);
    const a = await saved(s.d);
    const b = await write((await open(await PLAIN3())).d.doc);
    assert.deepEqual(a.bytes, b);
  });
});

const files = corpusFiles();

describe('links round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} link / bookmark / painter commands in ${ALL ? 'every' :
    'one in ten'} corpus file round-trip; undo restores`, () =>
    corpusRun(files, linksAll, xsd, xsdNote, 'links-edited corpus'));
});
