// SpellFix: replace one / all, ignore, add to the dictionary.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {buildDocx, documentXml, settingsXml, p, r,
  REL, W_NS, R_NS} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {emit} from './word-emit.mjs';
import {commentParts, range} from './comment-fixtures.mjs';
import {SEPS, noteP, enoteP, mark, emark} from './note-fixtures.mjs';

globalThis.__sfStub = {notes: []};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__sfStub;' +
  'export const vfs = {exists: () => false, readFile: () => ' +
  'Promise.reject(new Error(\'stub\'))}, choices = {write() {}};' +
  'export const reportError = (m) => { s.notes.push(m); };');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const warn = console.warn;             // (the stand-in reads nothing)
console.warn = (...a) => {
  if (!String(a[0]).includes('dictionary not read')) warn(...a);
};
const L = '../../tools/moreapps/!Letters/';
const {SpellState} = await import(L + 'SpellState');
const {fixWord, fixAll, ignoreAll, addToDictionary} =
  await import(L + 'SpellFix');
const RM = await import(L + 'RevMarks');
const {setSpell, stopSpell} = await import(L + 'SpellBind');
const {addPersonal, personalWords} = await import(L + 'SpellOpts');
const {loadChoices} = await import(L + 'WordChoices');
const RT = await import(L + 'RevTrack');
const {piece} = await import(L + 'Find');
const SM = await import(L + 'RevSwapMany');

const K = new Set(('the quick brown fox jumps over lazy dog hello ' +
  'world word is a test this and not valid it was here there new old ' +
  'text of in').split(' '));
const dict = {has: (w) => K.has(w.toLowerCase())};
const D = '2024-01-02T03:04:00Z';
const att = (id) => `w:id="${id}" w:author="Ann" w:date="${D}"`;
const ins = (id, t) => `<w:ins ${att(id)}>${r(t)}</w:ins>`;
const del = (id, t) => `<w:del ${att(id)}><w:r><w:delText ` +
  `xml:space="preserve">${t}</w:delText></w:r></w:del>`;
const mkDoc = async (body, extra = {}) => new Document(await readDocx(
  await buildDocx({'word/document.xml': documentXml(body), ...extra})));
const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const TBL = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  'w:w="4000"/></w:tblGrid><w:tr><w:tc>' + inner + '</w:tc></w:tr>' +
  '</w:tbl>';
/** A document with every kind of story: a body with a table and a
 *  table in its cell, a header, a footer, a footnote, an endnote and
 *  a comment, each holding a word that is not in the dictionary. */
async function allStories(settings = '', same = '') {
  const w = (x) => same || x;
  const body = p(r(w('teh') + ' body') + mark(1) + emark(2)) +
    TBL(p(r(w('cellx'))) + TBL(p(r(w('nestx')))) + p()) +
    p(range(0, r(w('gone'))));
  const c = commentParts({0: w('cmtx')});
  const en = (a, b) => `<w:endnote ${a}>${b}</w:endnote>`;
  const notes = {
    'word/footnotes.xml': DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">${SEPS}<w:footnote w:id="1">` +
      `${noteP(w('fnx'))}</w:footnote></w:footnotes>`,
    'word/endnotes.xml': DECL + `<w:endnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">` +
      en('w:type="separator" w:id="-1"',
        p('<w:r><w:separator/></w:r>')) +
      en('w:type="continuationSeparator" w:id="0"',
        p('<w:r><w:continuationSeparator/></w:r>')) +
      en('w:id="2"', enoteP(w('enx'))) + '</w:endnotes>'};
  const parts = {...c.parts, ...notes};
  if (settings) parts['word/settings.xml'] = settingsXml(settings);
  const bytes = await withHeaders(body, {default: {
    hdr: p(r(w('hdrx'))), ftr: p(r(w('ftrx')))}}, {parts, docRels: [
    ...c.docRels, ['rIdN1', REL('footnotes'), 'footnotes.xml'],
    ['rIdN2', REL('endnotes'), 'endnotes.xml']]});
  return new Document(await readDocx(bytes));
}
const NOW = () => 0;
const TRACK = '<w:trackRevisions/>';
const mk = (d, app = {choices: {}}, o = {}) => {
  const dw = {d, app, view: {typing: {n: 0, command(f) {
    this.n++;
    d.breakCoalesce();
    return f();
  }}}};
  dw.spell = new SpellState(dw, {dict, now: NOW, ...o});
  for (const q of dw.spell.paras()) dw.spell.flagsAt(q, 0);
  return dw;                           // (flagsAt: long ones too)
};
const body = (d) => d.doc.sections[0].blocks;
const texts = (d) => {
  const out = [];
  const add = (b) => {
    if (b.type === 'p') out.push(b.text);
    else for (const row of b.rows) for (const c of row.cells)
      c.blocks.forEach(add);
  };
  d.doc.sections.forEach((s) => s.blocks.forEach(add));
  for (const st of d.doc.stories.values()) st.blocks.forEach(add);
  for (const m of [d.doc.notes.footnotes, d.doc.notes.endnotes]) {
    for (const n of m.values()) n.blocks.forEach(add);
  }
  for (const c of d.doc.comments.map.values()) c.blocks.forEach(add);
  return out;
};
const hitOf = (dw, p, word) => {
  const f = dw.spell.flagsOf(p).find((x) => x.word === word);
  return {para: p, ...f};
};
const find = (dw, word) => {
  for (const p of dw.spell.paras()) {
    const f = (dw.spell.flagsOf(p) || []).find((x) => x.word === word);
    if (f) return {para: p, ...f};
  }
  return null;
};

describe('SpellFix', () => {
  it('replaces keeping the first character\'s format; undo, redo',
    async () => {
      const d = await mkDoc(p(r('a ') + r('teh', '<w:b/>') +
        r(' fox')));
      const dw = mk(d), before = texts(d);
      const h = hitOf(dw, body(d)[0], 'teh');
      const out = fixWord(dw, h, 'the');
      assert.deepEqual([out.from, out.to], [2, 5]);
      assert.equal(body(d)[0].text, 'a the fox');
      const run = body(d)[0].runs.find((x) => x.start <= 2 &&
        x.end > 2);
      assert.ok(run.rPr && run.rPr.b);
      assert.equal(dw.view.typing.n, 1);
      d.undo();
      assert.deepEqual(texts(d), before);
      assert.equal(d.undoDepth, 0);
      d.redo();
      assert.equal(body(d)[0].text, 'a the fox');
      dw.spell.stop();
    });
  it('a range over runs and format characters is replaced whole',
    async () => {
      const d = await mkDoc(p(r('x t') + r('e\u00ADh', '<w:i/>') +
        r(' y')));
      const dw = mk(d);
      const h = find(dw, 'teh') || find(dw, 'te\u00ADh');
      assert.ok(h);
      assert.equal(body(d)[0].text.slice(h.from, h.to), 'te\u00ADh');
      fixWord(dw, h, 'the');
      assert.equal(body(d)[0].text, 'x the y');
      d.undo();
      assert.equal(body(d)[0].text, 'x te\u00ADh y');
      dw.spell.stop();
    });
  it('stale hits change nothing and do not throw', async () => {
    const d = await mkDoc(p(r('teh fox')) + p(r('teh dog')));
    const dw = mk(d);
    const h = hitOf(dw, body(d)[0], 'teh');
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'zz'});
    assert.equal(fixWord(dw, h, 'the'), null);
    assert.equal(body(d)[0].text, 'zzteh fox');
    const g = {path: [0, 1], from: 0, to: 3, word: 'tex'};
    assert.equal(fixWord(dw, g, 'the'), null);
    assert.equal(fixWord(dw, {path: [0, 9], from: 0, to: 3,
      word: 'teh'}, 'the'), null);
    assert.equal(fixWord(dw, {path: [0, 1], from: 0, to: 99,
      word: 'teh'}, 'the'), null);
    assert.equal(fixWord(dw, {path: [0, 1], from: 0, to: 3,
      word: 'teh'}, 'the').to, 3);
    assert.equal(d.undoDepth, 2);
    dw.spell.stop();
  });
  it('fixAll: body, table cell, footnote, header, comment: one step',
    async () => {
      const d = await allStories();
      const dw = mk(d), before = texts(d);
      assert.equal(fixAll(dw, 'cellx', 'cell'), 1);
      assert.equal(fixAll(dw, 'nestx', 'nest'), 1);
      d.undo(); d.undo();
      assert.deepEqual(texts(d), before);
      // the same word in every kind of story
      const q = await mkDoc(p(r('teh a')) + TBL(p(r('teh b'))) +
        p(r('c teh')));
      const w2 = mk(q), was = texts(q);
      assert.equal(fixAll(w2, 'teh', 'the'), 3);
      assert.deepEqual(texts(q), ['the a', 'the b', 'c the']);
      assert.equal(w2.view.typing.n, 1);
      q.undo();
      assert.deepEqual(texts(q), was);
      q.redo();
      assert.deepEqual(texts(q), ['the a', 'the b', 'c the']);
      w2.spell.stop();
      dw.spell.stop();
    });
  it('fixAll over every story is one undo step', async () => {
    const d = await allStories('', 'zzq');
    const dw = mk(d), before = texts(d);
    const left = () => texts(d).filter((t) => t.includes('zzq'))
      .length;
    const n = left();
    assert.ok(n >= 8);
    assert.equal(fixAll(dw, 'zzq', 'the'), n);
    assert.equal(left(), 0);
    assert.equal(d.undoDepth, 1);
    assert.equal(dw.view.typing.n, 1);
    d.undo();
    assert.deepEqual(texts(d), before);
    d.redo();
    assert.equal(left(), 0);
    dw.spell.stop();
  });
  it('fixAll is exact: case differs, and none found is 0', async () => {
    const d = await mkDoc(p(r('Teh teh TEH tehx')));
    const dw = mk(d);
    assert.equal(fixAll(dw, 'teh', 'the'), 1);
    assert.equal(body(d)[0].text, 'Teh the TEH tehx');
    assert.equal(fixAll(dw, 'nothere', 'x'), 0);
    assert.equal(fixAll(dw, 'Teh', 'The'), 1);
    assert.equal(body(d)[0].text, 'The the TEH tehx');
    assert.equal(d.undoDepth, 2);
    dw.spell.stop();
  });
  it('fixAll: several in a paragraph keep their formats', async () => {
    const d = await mkDoc(p(r('teh ', '<w:b/>') + r('and teh x')));
    const dw = mk(d);
    assert.equal(fixAll(dw, 'teh', 'the'), 2);
    const t = body(d)[0];
    assert.equal(t.text, 'the and the x');
    const at = (o) => t.runs.find((x) => x.start <= o && o < x.end);
    assert.ok(at(0).rPr && at(0).rPr.b);
    assert.ok(!(at(8).rPr && at(8).rPr.b));
    dw.spell.stop();
  });
  it('tracked: a deletion and an insertion; the Changes list; undo',
    async () => {
      const d = await mkDoc(p(r('a teh b teh')), {
        'word/settings.xml': settingsXml(TRACK)});
      const dw = mk(d);
      assert.equal(RT.on(d), true);
      const out = fixWord(dw, hitOf(dw, body(d)[0], 'teh'), 'the');
      assert.ok(out);
      let l = RM.list(d.doc).filter((e) => e.kind !== undefined);
      assert.deepEqual(l.map((e) => e.kind).sort(), ['del', 'ins']);
      assert.equal(l.find((e) => e.kind === 'ins').text, 'the');
      assert.equal(l.find((e) => e.kind === 'del').text, 'teh');
      assert.equal(new Set(l.map((e) => e.author)).size, 1);
      const n = fixAll(dw, 'teh', 'the');
      assert.equal(n, 1);
      l = RM.list(d.doc);
      assert.equal(l.filter((e) => e.kind === 'ins').length >= 1,
        true);
      assert.equal(l.filter((e) => e.kind === 'del').length >= 2,
        true);
      d.undo();
      d.undo();
      assert.deepEqual(RM.list(d.doc), []);
      assert.equal(body(d)[0].text, 'a teh b teh');
      d.redo();
      assert.equal(RM.list(d.doc).length >= 2, true);
      dw.spell.stop();
    });
  it('tracked: refused is told and nothing changes', async () => {
    const d = await mkDoc(p(r('a ') + ins(7, 'teh') + r(' b')), {
      'word/settings.xml': settingsXml(TRACK)});
    const dw = mk(d);
    const h = find(dw, 'teh');
    assert.ok(h);
    globalThis.__sfStub.notes.length = 0;
    const text = body(d)[0].text, depth = d.undoDepth;
    assert.equal(fixWord(dw, h, 'the'), null);
    assert.equal(body(d)[0].text, text);
    assert.equal(d.undoDepth, depth);
    assert.equal(globalThis.__sfStub.notes.length, 1);
    assert.equal(fixAll(dw, 'teh', 'the'), 0);
    assert.equal(globalThis.__sfStub.notes.length, 2);
    assert.equal(body(d)[0].text, text);
    dw.spell.stop();
  });
  it('a header (by story key) and a footnote through the facade',
    async () => {
      const d = await allStories();
      const dw = mk(d);
      const part = [...d.doc.stories.keys()].find((k) =>
        d.doc.stories.get(k).blocks[0].text === 'hdrx');
      const hp = d.doc.stories.get(part).blocks[0];
      const f = dw.spell.flagsOf(hp)[0];
      const out = fixWord(dw, {story: part, path: [0, 0], ...f},
        'head');
      assert.ok(out);
      assert.equal(d.doc.stories.get(part).blocks[0].text, 'head');
      d.undo();
      assert.equal(d.doc.stories.get(part).blocks[0].text, 'hdrx');
      const fh = find(dw, 'fnx');
      assert.ok(fixWord(dw, fh, 'note'));
      assert.ok(texts(d).some((x) => x.endsWith(' note')));
      const ch = find(dw, 'cmtx');
      assert.ok(fixWord(dw, ch, 'cmt'));
      assert.ok(texts(d).includes('cmt'));
      d.undo(); d.undo();
      assert.ok(!texts(d).some((x) => x.endsWith(' note')));
      assert.ok(!texts(d).includes('cmt'));
      dw.spell.stop();
    });
  it('tracking on: a header edit is plain, the body is tracked',
    async () => {
      const d = await allStories(TRACK);
      const dw = mk(d);
      assert.equal(RT.on(d), true);
      assert.equal(fixAll(dw, 'hdrx', 'head'), 1);
      assert.deepEqual(RM.list(d.doc), []);
      assert.equal(fixAll(dw, 'teh', 'the'), 1);
      assert.equal(RM.list(d.doc).length >= 2, true);
      dw.spell.stop();
    });
  it('addToDictionary stops flagging; a new state agrees',
    async () => {
      const app = {choices: {}};
      const d = await mkDoc(p(r('zork here')) + p(r('zork')));
      const dw = mk(d, app);
      assert.equal(dw.spell.flagsOf(body(d)[0]).length, 1);
      await addToDictionary(dw, 'zork');
      assert.deepEqual(dw.spell.flagsOf(body(d)[0]) || [], []);
      assert.deepEqual(personalWords(app), ['zork']);
      const st2 = new SpellState({d, app}, {dict, now: NOW});
      st2.ensure(st2.paras());
      assert.deepEqual(st2.flagsOf(body(d)[0]), []);
      assert.equal(d.undoDepth, 0);
      st2.stop();
      dw.spell.stop();
    });
  it('ignoreAll stops flagging in this document only', async () => {
    const d = await mkDoc(p(r('zork Zork')));
    const dw = mk(d);
    assert.equal(dw.spell.flagsOf(body(d)[0]).length, 2);
    ignoreAll(dw, 'zork');
    dw.spell.ensure(dw.spell.paras());
    assert.deepEqual(dw.spell.flagsOf(body(d)[0]), []);
    const other = mk(d);
    assert.equal(other.spell.flagsOf(body(d)[0]).length, 2);
    assert.equal(d.undoDepth, 0);
    other.spell.stop();
    dw.spell.stop();
  });
  it('fixAll agrees with a string oracle (fuzz)', async () => {
    const toks = ['teh', 'the', 'fox', 'Teh', 'tehx', 'teh,', 'a'];
    const REPL = ['the', '', 'teh!', 'The Fox'];
    for (let seed = 1; seed <= 5; seed++) {
      let sd = seed * 7919;
      const rnd = () => (sd = (sd * 1103515245 + 12345) %
        2147483648) / 2147483648;
      for (let round = 0; round < 8; round++) {
        const paras = [];
        for (let i = 0; i < 6; i++) {
          const n = 1 + Math.floor(rnd() * 6), t = [];
          for (let k = 0; k < n; k++) t.push(toks[Math.floor(
            rnd() * toks.length)]);
          paras.push(t);
        }
        // each paragraph in several runs, some bold, split anywhere
        const xml = paras.map((t) => {
          const txt = t.join(' ');
          let out = '', at = 0;
          while (at < txt.length) {
            const n = 1 + Math.floor(rnd() * 5);
            out += r(txt.slice(at, at + n),
              rnd() < 0.5 ? '<w:b/>' : '');
            at += n;
          }
          return p(out);
        }).join('');
        const d = await mkDoc(xml);
        const dw = mk(d), before = texts(d);
        const rep = REPL[Math.floor(rnd() * REPL.length)];
        const want = paras.map((t) => t.map((x) => (x === 'teh' ||
          x === 'teh,' ? x.replace('teh', rep) : x)).join(' '));
        let c = 0;
        for (const t of paras) for (const x of t) {
          if (x === 'teh' || x === 'teh,') c++;
        }
        assert.equal(fixAll(dw, 'teh', rep), c);
        assert.deepEqual(texts(d), want);
        if (c) {
          assert.equal(d.undoDepth, 1);
          d.undo();
          assert.deepEqual(texts(d), before);
          d.redo();
          assert.deepEqual(texts(d), want);
        }
        dw.spell.stop();
      }
    }
  });
  it('fixAll fuzz over every story, with an empty replacement',
    async () => {
      for (const rep of ['', 'the', 'teh!']) {
        const d = await allStories('', 'teh');
        const dw = mk(d), before = texts(d);
        const want = before.map((t) => t.split('teh').join(rep));
        const c = before.filter((t) => t.includes('teh')).length;
        assert.equal(fixAll(dw, 'teh', rep), c);
        assert.deepEqual(texts(d), want);
        d.undo();
        assert.deepEqual(texts(d), before);
        dw.spell.stop();
      }
    });
  it('tracked fixAll: several in a paragraph, one undo step',
    async () => {
      const d = await mkDoc(p(r('teh a teh b teh')), {
        'word/settings.xml': settingsXml(TRACK)});
      const dw = mk(d), before = body(d)[0];
      assert.equal(fixAll(dw, 'teh', 'teh!'), 3);
      const l = RM.list(d.doc);
      assert.equal(l.filter((e) => e.kind === 'del').length, 3);
      assert.equal(l.filter((e) => e.kind === 'ins').length, 3);
      const ids = l.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.every((x) => Number.isInteger(x)));
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.equal(body(d)[0].text, before.text);
      assert.deepEqual(RM.list(d.doc), []);
      d.redo();
      assert.equal(RM.list(d.doc).length, 6);
      dw.spell.stop();
    });
  it('tracked fixAll: 2,000 in one paragraph in one pass, one undo ' +
    'step', async () => {
    const ws = [];
    for (let k = 0; k < 2000; k++) ws.push('teh');
    const d = await mkDoc(p(r(ws.join(' a ')) + del(5, 'XX') +
      r(' teh')), {'word/settings.xml': settingsXml(TRACK)});
    const dw = mk(d), was = body(d)[0];
    let puts = 0;
    const ap = d.apply.bind(d);
    d.apply = (op, o) => {
      puts++;
      return ap(op, o);
    };
    const t0 = performance.now(), out = [];
    assert.equal(fixAll(dw, 'teh', 'the', out), 2001);
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, 'took ' + Math.round(ms) + ' ms');
    assert.ok(puts <= 3, 'paragraph changes: ' + puts);
    assert.equal(d.undoDepth, 1);
    const t = body(d)[0].text;
    for (const x of out) {
      assert.equal(t.slice(x.ins.from, x.ins.to), 'the');
    }
    const l = RM.list(d.doc);
    assert.equal(l.filter((e) => e.kind === 'ins').length, 2001);
    assert.equal(new Set(l.map((e) => e.id)).size, l.length);
    emit('spellfix-tracked-change-all', await writeDocx(d.doc));
    d.undo();
    assert.deepEqual(body(d)[0], was);
    d.redo();
    assert.equal(body(d)[0].text, t);
    dw.spell.stop();
  });
  it('tracked fixAll: 4,000 paragraphs with another\'s insertion ' +
    'each in one go: the body looked through once', async () => {
    let x = '';
    for (let k = 0; k < 4000; k++) {
      x += p(r('teh a ') + ins(k + 1, 'bob') + r(' teh end'));
    }
    const d = await mkDoc(x, {'word/settings.xml': settingsXml(TRACK)});
    const dw = mk(d), was = SM.stats.lists;
    const t0 = performance.now();
    assert.equal(fixAll(dw, 'teh', 'the'), 8000);
    const ms = performance.now() - t0;
    assert.ok(ms < 3000, 'took ' + Math.round(ms) + ' ms');
    assert.ok(SM.stats.lists - was <= 1, 'body walks: ' +
      (SM.stats.lists - was));
    assert.equal(d.undoDepth, 1);
    assert.equal(body(d)[3999].runs.filter((q) => q.rev).length, 5);
    dw.spell.stop();
  });
  it('tracked fixAll: the document swap would make, range by range',
    async () => {
      // (Ann's own insertion edited, a deletion between)
      const x = p(r('teh ') + ins(7, 'teh') + r(' teh ') + del(8, 'a') +
        r(' teh')) + TBL(p(r('teh teh', '<w:b/>')) + p()) +
        p(r('teh'));
      const bytes = {'word/settings.xml': settingsXml(TRACK)};
      const a = await mkDoc(x, bytes), b = await mkDoc(x, bytes);
      const when = new Date(2025, 0, 2, 3, 4, 5);
      a.reviewer = b.reviewer = () => ({name: 'Ann', now: when});
      const dw = mk(b), out = [];
      fixAll(dw, 'teh', 'the', out);
      assert.equal(out.length, 7);
      // (one by one, last first, by hand: the old way)
      const s = RT.session(a), hits = new Map();
      for (const q of out) {
        if (!hits.has(q.para)) hits.set(q.para, []);
        hits.get(q.para).push(q);
      }
      const at = [[0, 0], [0, 1, 0, 0, 0], [0, 2]];
      RT.record(a, () => a.atomic(() => {
        [...hits.values()].forEach((qs, i) => {
          for (const q of [...qs].reverse()) {
            s.swap(at[i], q.from, q.to, piece(q.para, q.from,
              q.to - q.from, 'the'));
          }
        });
      }));
      const strip = (d) => JSON.stringify(d.doc.sections, (k, v) =>
        (v && (v.type === 'p' || v.type === 'tbl') ? {...v, id: 0}
          : v)) + JSON.stringify(RM.list(d.doc));
      assert.equal(strip(b), strip(a));
      emit('spellfix-tracked-change-all-mixed', await writeDocx(b.doc));
      dw.spell.stop();
    });
  it('tracked: text already deleted inside the range', async () => {
    const d = await mkDoc(p(r('a te') + del(5, 'XX') + r('h b')), {
      'word/settings.xml': settingsXml(TRACK)});
    const dw = mk(d), was = body(d)[0];
    const h = find(dw, 'teh');
    assert.ok(h);
    assert.ok(fixWord(dw, h, 'the'));
    const l = RM.list(d.doc);
    const dels = l.filter((e) => e.kind === 'del');
    assert.deepEqual(dels.map((e) => e.text).sort(), ['XX', 'h', 'te']);
    assert.equal(dels.filter((e) => e.author === 'Ann').length, 1);
    assert.equal(l.filter((e) => e.kind === 'ins')[0].text, 'the');
    d.undo();
    assert.deepEqual(body(d)[0].runs, was.runs);
    assert.equal(body(d)[0].text, was.text);
    dw.spell.stop();
  });
  it('tracked fixAll: ids exhausted is told, nothing changes',
    async () => {
      const d = await mkDoc(p(r('a teh b') + ins(2147483647, 'zz')), {
        'word/settings.xml': settingsXml(TRACK)});
      const dw = mk(d), text = body(d)[0].text;
      globalThis.__sfStub.notes.length = 0;
      let n;
      assert.doesNotThrow(() => { n = fixAll(dw, 'teh', 'the'); });
      assert.equal(n, 0);
      assert.equal(body(d)[0].text, text);
      assert.equal(d.undoDepth, 0);
      assert.equal(globalThis.__sfStub.notes.length, 1);
      dw.spell.stop();
    });
  it('tracked fixAll: some left in another author\'s text is said',
    async () => {
      const d = await mkDoc(p(r('teh ') + ins(7, 'teh') + r(' teh')), {
        'word/settings.xml': settingsXml(TRACK)});
      const dw = mk(d);
      globalThis.__sfStub.notes.length = 0;
      assert.equal(fixAll(dw, 'teh', 'the'), 2);
      assert.equal(globalThis.__sfStub.notes.length, 1);
      assert.match(globalThis.__sfStub.notes[0], /Changed 2; 1 left/);
      globalThis.__sfStub.notes.length = 0;
      assert.equal(fixAll(dw, 'zzz', 'the'), 0);
      assert.equal(globalThis.__sfStub.notes.length, 0);
      dw.spell.stop();
    });
  it('fixAll out: what was really done, with the text put in',
    async () => {
      const d = await mkDoc(p(r('teh a teh b teh')));
      const dw = mk(d), out = [];
      assert.equal(fixAll(dw, 'teh', 'thee', out), 3);
      assert.equal(body(d)[0].text, 'thee a thee b thee');
      assert.deepEqual(out.map((x) => [x.from, x.to, x.delta,
        x.ins.from, x.ins.to]).sort((a, b) => a[0] - b[0]),
      [[0, 3, 1, 0, 4], [6, 9, 1, 7, 11], [12, 15, 1, 14, 18]]);
      assert.equal(fixAll(dw, 'zzz', 'x', out), 0);
      assert.deepEqual(out, []);
      dw.spell.stop();
    });
  it('fixAll out under Track Changes: old text kept; a range ' +
    'refused is not listed; fixWord says its delta', async () => {
    const d = await mkDoc(p(r('teh ') + ins(7, 'teh') + r(' teh')), {
      'word/settings.xml': settingsXml(TRACK)});
    const dw = mk(d), out = [];
    assert.equal(fixAll(dw, 'teh', 'thee', out), 2);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((x) => x.delta), [4, 4]);
    const t = body(d)[0].text;
    for (const x of out) {
      assert.equal(t.slice(x.ins.from, x.ins.to), 'thee');
    }
    const d2 = await mkDoc(p(r('a teh')), {
      'word/settings.xml': settingsXml(TRACK)});
    const dw2 = mk(d2);
    const o = fixWord(dw2, hitOf(dw2, body(d2)[0], 'teh'), 'thee');
    assert.equal(o.delta, 4);
    assert.equal(body(d2)[0].text.length, 'a teh'.length + o.delta);
    dw.spell.stop();
    dw2.spell.stop();
  });
  it('addToDictionary refreshes every running window; ignoreAll ' +
    'only its own',
    async () => {
      const app = {choices: {}, docs: new Map()};
      const d = await mkDoc(p(r('zork')));
      const win = () => ({isOpen: false, invalidate() {}});
      const mkw = (id) => {
        const w = {d, app, view: {}, win: win(), closed: false};
        app.docs.set(id, w);
        return w;
      };
      const a = mkw(1), b = mkw(2), off = mkw(3);
      try {
        await setSpell(app, true);     // (a, b and off all start)
        const calls = [];
        for (const [n, w] of [['a', a], ['b', b], ['off', off]]) {
          assert.ok(w.spell, n);
          w.spell._raf = () => 0;      // (no frames here)
          w.spell._ready(dict);        // (the stand-in reads none)
          w.spell.refresh = () => { calls.push(n); };
        }
        stopSpell(off);                // (no longer running)
        const q = body(d)[0];
        for (const w of [a, b]) w.spell.ensure([q]);
        const gen = b.spell._gen;
        calls.length = 0;
        ignoreAll(a, 'zork');
        assert.deepEqual(calls, [], 'ignoreAll: no window re-checked');
        assert.equal(b.spell._gen, gen);
        assert.equal(b.spell.flagsOf(q).length, 1);
        a.spell.ensure([q]);
        assert.deepEqual(a.spell.flagsOf(q), []);
        calls.length = 0;
        await addToDictionary(a, 'zork');
        assert.deepEqual(calls.sort(), ['a', 'a', 'b']);
      } finally {
        for (const w of [a, b, off]) stopSpell(w);
      }
    });
  it('pasted hostile text: long runs of format characters',
    async () => {
      const junk = 'te\u00AD'.repeat(20000) + 'h';
      const d = await mkDoc(p(r(junk + ' teh')));
      const dw = mk(d);
      const h = find(dw, 'teh');
      const t0 = performance.now();
      assert.ok(h);
      fixWord(dw, h, 'the');
      assert.ok(performance.now() - t0 < 2000);
      assert.equal(fixWord(dw, {path: [0, 0], from: 0, to: 5,
        word: 'zz\u00AD'.repeat(50000)}, 'x'), null);
      dw.spell.stop();
    });
});

const {checkPara} = await import(L + 'SpellCheck');
describe('SpellFix: Change All at scale', () => {
  const best = (f, n = 2) => {
    let m = Infinity;
    for (let i = 0; i < n; i++) m = Math.min(m, f());
    return m;
  };
  /** The flags every paragraph has, as a from-scratch check gives. */
  const scratch = (dw) => dw.spell.paras().map((q) =>
    checkPara(dict, dw.d.doc, q, {markup: 'final'}).map((x) =>
      [x.from, x.to, x.word]));
  const flags = (dw) => dw.spell.paras().map((q) => {
    dw.spell.flagsAt(q, 0);
    return dw.spell.flagsOf(q).map((x) => [x.from, x.to, x.word]);
  });
  it('out: in document order; each ins holds the text put in, in ' +
    'every story, several to a paragraph', async () => {
    for (const rep of ['the', '', 'tehhh', 'Te']) {
      const d = await allStories('', 'teh');
      const q0 = body(d)[0];
      const dw = mk(d);
      const before = dw.spell.paras();
      // (more of them in the first paragraph, in two runs)
      dw.d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
        ins: 'teh a teh teh b '});
      assert.notEqual(body(d)[0], q0);
      const was = dw.spell.paras(), out = [];
      const n = fixAll(dw, 'teh', rep, out);
      assert.equal(n, out.length);
      assert.ok(n >= 11, 'n ' + n);
      const now = dw.spell.paras();
      const idx = new Map(was.map((q, i) => [q, i]));
      let last = [-1, -1];
      for (const x of out) {
        const i = idx.get(x.para);
        assert.ok(i !== undefined);
        assert.ok(i > last[0] || (i === last[0] && x.from > last[1]),
          'document order');
        last = [i, x.from];
        assert.equal(x.para.text.slice(x.from, x.to), 'teh');
        assert.equal(x.delta, rep.length - 3);
        assert.equal(now[i].text.slice(x.ins.from, x.ins.to), rep);
      }
      assert.equal(before.length, was.length);
      dw.spell.stop();
    }
  });
  it('the flags after Change All, its undo and its redo are a fresh ' +
    'check\'s, tracked or not', async () => {
    for (const settings of ['', TRACK]) {
      const xml = p(r('teh a teh ') + ins(7, 'teh') + r(' b teh')) +
        p(r('zork teh') + del(8, 'teh ') + r('teh')) + p(r('the fox'));
      const d = await mkDoc(xml, settings ? {'word/settings.xml':
        settingsXml(settings)} : {});
      const dw = mk(d);
      const n = fixAll(dw, 'teh', 'tehh');
      assert.ok(n >= 3, 'n ' + n);
      assert.deepEqual(flags(dw), scratch(dw), 'after ' + settings);
      d.undo();
      assert.deepEqual(flags(dw), scratch(dw), 'undo ' + settings);
      assert.ok(flags(dw).flat().some((x) => x[2] === 'teh'));
      d.redo();
      assert.deepEqual(flags(dw), scratch(dw), 'redo ' + settings);
      dw.spell.stop();
    }
  });
  it('40,000 paragraphs, and 8,000 in one paragraph: under a ' +
    'second, with undo; the flags after undo are a fresh check\'s',
  async () => {
    const many = await mkDoc(p(r('teh quick')).repeat(40000));
    const one = await mkDoc(p(r('teh quick brown fox '.repeat(8000))));
    for (const [d, N] of [[many, 40000], [one, 8000]]) {
      const was = texts(d);
      const ms = best(() => {
        const dw = mk(d), out = [];
        const t = performance.now();
        assert.equal(fixAll(dw, 'teh', 'the', out), N);
        assert.equal(out.length, N);
        d.undo();
        const took = performance.now() - t;
        dw.spell.stop();
        return took;
      });
      assert.ok(ms < 1000, `${N}: ${ms} ms`);
      assert.deepEqual(texts(d), was);
      const dw = mk(d);
      assert.equal(fixAll(dw, 'teh', 'the'), N);
      assert.ok(!texts(d).some((t) => t.includes('teh')));
      d.undo();
      assert.deepEqual(flags(dw), scratch(dw));
      assert.equal(flags(dw).flat().length, N);
      dw.spell.stop();
    }
  });
});
