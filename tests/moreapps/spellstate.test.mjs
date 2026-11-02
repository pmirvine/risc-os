// SpellState: per document checking, cache, slices, caret rule.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {buildDocx, documentXml, settingsXml, p, r,
  REL, W_NS, R_NS} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {commentParts, range} from './comment-fixtures.mjs';
import {SEPS, noteP, enoteP, mark, emark} from './note-fixtures.mjs';

globalThis.__ssStub = {notes: []};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__ssStub;' +
  'export const vfs = {exists: () => false}, choices = {write() {}};' +
  'export const reportError = (m) => { s.notes.push(m); };');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const L = '../../tools/moreapps/!Letters/';
const {SpellState, allParas, SLICE_MS} = await import(L + 'SpellState');
const {checkPara} = await import(L + 'SpellCheck');
const {addPersonal, personalWords} = await import(L + 'SpellOpts');
const {loadChoices} = await import(L + 'WordChoices');
const RT = await import(L + 'RevTrack');
const {typeText} = await import(L + 'Edit');
const {deleteBack} = await import(L + 'EditDel');
const S = await import(L + 'Selection');
const {blocks: walkBlocks} = await import(L + 'Walk');

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
async function allStories(settings = '') {
  const body = p(r('teh body') + mark(1) + emark(2)) +
    TBL(p(r('cellx')) + TBL(p(r('nestx'))) + p()) +
    p(range(0, r('gone')));
  const c = commentParts({0: 'cmtx'});
  const en = (a, b) => `<w:endnote ${a}>${b}</w:endnote>`;
  const notes = {
    'word/footnotes.xml': DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">${SEPS}<w:footnote w:id="1">` +
      `${noteP('fnx')}</w:footnote></w:footnotes>`,
    'word/endnotes.xml': DECL + `<w:endnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">` +
      en('w:type="separator" w:id="-1"', p('<w:r><w:separator/></w:r>')) +
      en('w:type="continuationSeparator" w:id="0"',
        p('<w:r><w:continuationSeparator/></w:r>')) +
      en('w:id="2"', enoteP('enx')) + '</w:endnotes>'};
  const parts = {...c.parts, ...notes};
  if (settings) parts['word/settings.xml'] = settingsXml(settings);
  const bytes = await withHeaders(body, {default: {
    hdr: p(r('hdrx')), ftr: p(r('ftrx'))}}, {parts, docRels: [
    ...c.docRels, ['rIdN1', REL('footnotes'), 'footnotes.xml'],
    ['rIdN2', REL('endnotes'), 'endnotes.xml']]});
  return new Document(await readDocx(bytes));
}
const NOW = () => 0;
const mk = (d, o = {}) => new SpellState({d, app: {choices: {}}},
  {dict, now: NOW, ...o});
const body = (d) => d.doc.sections[0].blocks;
const type = (d, i, at, ins, del = 0) =>
  d.apply({op: 'replaceText', block: [0, i], at, del, ins});
const best = (f, n = 4) => {
  f();
  let m = Infinity;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    f();
    m = Math.min(m, performance.now() - t);
  }
  return m;
};

/** A fake animation frame queue. */
function frames() {
  const q = [];
  const f = {
    raf: (fn) => q.push(fn),
    caf: () => {},
    get n() { return q.length; },
    run(max = 1e5) {
      let k = 0;
      while (q.length && k++ < max) q.shift()();
      return k;
    },
  };
  return f;
}
const counter = () => {
  const c = {n: 0, paras: []};
  c.check = (...a) => { c.n++; c.paras.push(a[2]); return checkPara(...a); };
  return c;
};

describe('SpellState', () => {
  it('null until checked; ensure checks; cached per paragraph',
    async () => {
      const d = await mkDoc(p(r('teh fox')) + p(r('hello wrld')));
      const c = counter(), st = mk(d, {check: c.check});
      const ps = body(d);
      assert.equal(st.flagsOf(ps[0]), null);
      assert.equal(st.ensure(ps), true);
      assert.deepEqual(st.flagsOf(ps[0]).map((x) => x.word), ['teh']);
      assert.deepEqual(st.flagsOf(ps[1]).map((x) => x.word), ['wrld']);
      assert.equal(c.n, 2);
      st.ensure(ps);
      assert.equal(c.n, 2);
      st.stop();
    });
  it('typing re-checks the edited paragraph only', async () => {
    const d = await mkDoc(p(r('teh fox')) + p(r('hello wrld')) +
      p(r('the dog')));
    const c = counter(), st = mk(d, {check: c.check});
    st.ensure(st.paras());
    assert.equal(c.n, 3);
    type(d, 1, 10, 'x');
    st.ensure(st.paras());
    assert.equal(c.n, 4);
    assert.equal(c.paras[3], body(d)[1]);
    assert.deepEqual(st.flagsOf(body(d)[1]).map((x) => x.word),
      ['wrldx']);
    st.stop();
  });
  it('flagsAt by para and by path', async () => {
    const d = await mkDoc(p(r('the teh dog')));
    const st = mk(d);
    const a = st.flagsAt([0, 0], 5);
    assert.deepEqual(a, {from: 4, to: 7, word: 'teh'});
    assert.equal(st.flagsAt(body(d)[0], 2), null);
    assert.equal(st.flagsAt([0, 9], 2), null);
    st.stop();
  });
  it('walks tables, headers, footers, notes and comments',
    async () => {
      const d = await allStories();
      const all = allParas(d.doc);
      const texts = all.map((q) => q.text);
      for (const t of ['teh body', 'cellx', 'nestx', 'hdrx', 'ftrx',
        'fnx', 'enx', 'cmtx', 'gone']) {
        assert.ok(texts.some((x) => x.includes(t)), t);
      }
      const f = frames(), st = mk(d, {raf: f.raf, caf: f.caf});
      st.start();
      f.run();
      for (const t of ['cellx', 'nestx', 'hdrx', 'ftrx', 'fnx', 'enx',
        'cmtx']) {
        const q = all.find((x) => x.text.includes(t));
        const at = q.text.indexOf(t);
        const fl = st.flagsOf(q);
        assert.deepEqual(fl.map((x) => x.word), [t.trim()], t);
        assert.deepEqual(st.flagsAt(q, at + 1),
          {from: at, to: at + t.length, word: t}, t);
      }
      // by path: the cell, and the table inside the cell
      assert.equal(st.flagsAt([0, 1, 0, 0, 0], 2).word, 'cellx');
      assert.equal(st.flagsAt([0, 1, 0, 0, 1, 0, 0, 0], 2).word,
        'nestx');
      assert.equal(st.flagsAt([0, 0], 1).word, 'teh');
      st.stop();
    });
  it('ignoreAll and the markup view', async () => {
    const d = await mkDoc(p(r('hello ') + del(1, 'zork ') +
      ins(2, 'blarg')));
    const st = mk(d), q = body(d)[0];
    st.ensure([q]);
    assert.deepEqual(st.flagsOf(q).map((x) => x.word), ['blarg']);
    d.markup = 'original';
    assert.equal(st.flagsOf(q), null);
    st.ensure([q]);
    assert.deepEqual(st.flagsOf(q).map((x) => x.word), ['zork']);
    d.markup = 'final';
    let told = 0;
    st.onChange(() => told++);
    st.ignoreAll('BLARG');
    assert.equal(told, 1);
    st.ensure([q]);
    assert.deepEqual(st.flagsOf(q), []);
    st.stop();
  });
  it('the personal list is read through the setting', async () => {
    const d = await mkDoc(p(r('hello zork')));
    let list = [];
    const st = mk(d, {personal: () => list}), q = body(d)[0];
    st.ensure([q]);
    assert.equal(st.flagsOf(q).length, 1);
    list = Object.freeze(['Zork']);
    assert.equal(st.flagsOf(q), null);
    st.ensure([q]);
    assert.deepEqual(st.flagsOf(q), []);
    st.stop();
  });
  it('a caret outside any paragraph (a table, a picture) hushes nothing',
    async () => {
      const d = await mkDoc(p(r('helo world')));
      const st = mk(d);
      const q = body(d)[0];
      st.setCaret(null, 0);
      st.ensure([q]);
      assert.deepEqual(st.flagsOf(q).map((x) => x.word), ['helo']);
      st.stop();
    });
  it('caret rule: the word being typed waits for the caret to leave',
    async () => {
      const d = await mkDoc(p(r('hello ')));
      const st = mk(d);
      let told = 0;
      st.onChange(() => told++);
      type(d, 0, 6, 't');
      type(d, 0, 7, 'e');
      type(d, 0, 8, 'h');
      let q = body(d)[0];
      st.setCaret(q, 9);
      st.ensure([q]);
      assert.deepEqual(st.flagsOf(q), []);
      type(d, 0, 9, ' ');            // (a space typed: word is done)
      q = body(d)[0];
      st.setCaret(q, 10);
      st.ensure([q]);
      assert.deepEqual(st.flagsOf(q).map((x) => x.word), ['teh']);
      // typing again, then moving away
      type(d, 0, 10, 'x');
      q = body(d)[0];
      st.setCaret(q, 11);
      st.ensure([q]);
      assert.deepEqual(st.flagsOf(q).map((x) => x.word), ['teh']);
      told = 0;
      st.setCaret(q, 3);
      assert.equal(told, 1);
      assert.deepEqual(st.flagsOf(q).map((x) => x.word),
        ['teh', 'x']);
      st.stop();
    });
  it('caret rule: not when the last change was not typing',
    async () => {
      const d = await mkDoc(p(r('hello teh')));
      const st = mk(d), q = body(d)[0];
      st.setCaret(q, 9);
      st.ensure([q]);
      assert.equal(st.flagsOf(q).length, 1);
      type(d, 0, 0, 'hello ', 0);    // (a paste of six characters)
      const q2 = body(d)[0];
      st.setCaret(q2, 15);
      st.ensure([q2]);
      assert.equal(st.flagsOf(q2).length, 1);
      d.undo();
      const q3 = body(d)[0];
      st.setCaret(q3, 9);
      st.ensure([q3]);
      assert.equal(st.flagsOf(q3).length, 1);
      st.stop();
    });
  it('the caret rule applies to the paragraph typed in only',
    async () => {
      const d = await mkDoc(p(r('teh')) + p(r('hello')));
      const st = mk(d);
      type(d, 1, 5, 'x');
      const a = body(d)[0], b = body(d)[1];
      st.setCaret(a, 3);
      st.ensure([a, b]);
      assert.equal(st.flagsOf(a).length, 1);
      st.stop();
    });
  it('stop cancels the slice and the listener', async () => {
    const d = await mkDoc(p(r('teh')) + p(r('teh')));
    const f = frames(), st = mk(d, {raf: f.raf, caf: f.caf});
    st.start();
    assert.equal(f.n, 1);
    st.stop();
    f.run();
    assert.equal(st.flagsOf(body(d)[0]), null);
    type(d, 0, 0, 'x');
    assert.equal(f.n, 0);
  });
  it('a change restarts the slices; only new paragraphs are checked',
    async () => {
      const d = await mkDoc(p(r('teh')) + p(r('teh')) + p(r('teh')));
      const f = frames(), c = counter();
      const st = mk(d, {raf: f.raf, caf: f.caf, check: c.check});
      st.start();
      f.run();
      assert.equal(c.n, 3);
      type(d, 2, 0, 'x');
      assert.equal(f.n, 1);
      f.run();
      assert.equal(c.n, 4);
      st.stop();
    });
});

describe('SpellState: later fixes', () => {
  it('a markup change restarts the background checking', async () => {
    const d = await mkDoc(Array.from({length: 10000}, () =>
      p(r('the teh dog'))).join(''));
    const f = frames(), st = mk(d, {raf: f.raf, caf: f.caf});
    st.start();
    f.run();
    assert.equal(st.flagsOf(body(d)[9999]).length, 1);
    d.markup = 'original';           // (sends no change)
    st.ensure([body(d)[0]]);
    assert.ok(f.n > 0, 'a frame is pending');
    assert.equal(st.flagsOf(body(d)[9999]), null);
    f.run();
    assert.equal(st.flagsOf(body(d)[9999]).length, 1);
    st.stop();
  });
  it('a styles change outside d.apply restarts it too', async () => {
    const d = await mkDoc(p(r('teh')) + p(r('teh')));
    const f = frames(), st = mk(d, {raf: f.raf, caf: f.caf});
    st.start();
    f.run();
    const dd = d.doc.styles.docDefaults || {};
    d.doc.styles = {...d.doc.styles, docDefaults: {...dd, rPr: {
      ...(dd.rPr || {}), extra: [{name: 'w:lang',
        attrs: [['w:val', 'fr-FR']]}]}}};
    st.ensure([body(d)[0]]);
    f.run();
    assert.deepEqual(st.flagsOf(body(d)[1]), []);
    st.stop();
  });
  it('the caret rule hides only the word typed at', async () => {
    const d = await mkDoc(p(r('wrld fox teh')));
    const st = mk(d);
    type(d, 0, 0, 'y');              // 'ywrld fox teh'
    let q = body(d)[0];
    st.ensure([q]);
    st.setCaret(q, q.text.length);   // (End)
    assert.deepEqual(st.flagsOf(q).map((x) => x.word),
      ['ywrld', 'teh']);
    st.setCaret(q, 1);               // (a space follows: not hidden)
    assert.equal(st.flagsOf(q).length, 2);
    const e = await mkDoc(p(r('fox wrl')));
    const s2 = mk(e);
    type(e, 0, 7, 'd');
    q = body(e)[0];
    s2.ensure([q]);
    s2.setCaret(q, 8);
    assert.deepEqual(s2.flagsOf(q), []);
    s2.setCaret(q, 3);
    assert.equal(s2.flagsOf(q).length, 1);
    st.stop();
    s2.stop();
  });
  it('stop, start, stop: listening and slices come back', async () => {
    const d = await mkDoc(p(r('teh')) + p(r('teh')));
    const f = frames(), c = counter();
    const st = mk(d, {raf: f.raf, caf: f.caf, check: c.check});
    st.start();
    f.run();
    assert.equal(c.n, 2);
    st.stop();
    type(d, 0, 0, 'x');
    assert.equal(f.n, 0);
    st.start();
    assert.equal(f.n, 1);
    f.run();
    assert.equal(c.n, 3);
    type(d, 1, 0, 'y');
    assert.equal(f.n, 1, 'listening again');
    f.run();
    assert.equal(c.n, 4);
    st.stop();
    type(d, 1, 0, 'z');
    assert.equal(f.n, 0);
  });
  it('a dictionary read that ends while stopped is not used',
    async () => {
      const d = await mkDoc(p(r('teh')));
      delete globalThis[Symbol.for('letters.spell.dict')];
      let release;
      const gate = new Promise((ok) => { release = ok; });
      const dic = 'SET UTF-8\n';
      const rb = async (q) => {
        await gate;
        return new TextEncoder().encode(q.endsWith('dic')
          ? '1\nteh\n' : dic);
      };
      const f = frames();
      const st = new SpellState({d, app: {}}, {readBytes: rb,
        raf: f.raf, caf: f.caf, now: NOW});
      st.start();
      st.stop();
      release();
      await new Promise((ok) => setTimeout(ok, 30));
      assert.equal(st.dictReady, false);
      st.start();                      // (reads it again: shared)
      await new Promise((ok) => setTimeout(ok, 30));
      assert.equal(st.dictReady, true);
      st.stop();
      delete globalThis[Symbol.for('letters.spell.dict')];
    });
});

describe('SpellState: dictionary failure', () => {
  it('dictReady stays false, no flags, no throw, one notice',
    async () => {
      const d = await mkDoc(p(r('teh')));
      const notes = [];
      delete globalThis[Symbol.for('letters.spell.dict')];
      const st = new SpellState({d, app: {}}, {
        readBytes: async () => { throw new Error('gone'); },
        notify: (m, o) => notes.push([m, o]), now: NOW});
      await new Promise((ok) => setTimeout(ok, 20));
      assert.equal(st.dictReady, false);
      assert.equal(st.ensure(body(d)), false);
      assert.equal(st.flagsOf(body(d)[0]), null);
      assert.equal(st.flagsAt(body(d)[0], 1), null);
      st.start();
      type(d, 0, 0, 'x');
      assert.equal(notes.length, 1);
      assert.deepEqual(notes[0][1], {appName: 'Letters',
        category: 'info'});
      st.stop();
    });
});

describe('SpellState: oracle fuzz', () => {
  const TRACK = '<w:trackRevisions/>';
  const WHEN = new Date(2025, 0, 2, 3, 4, 5);
  const EXPECTED = /next block is not a paragraph|not a paragraph|^$|nothing|joining|refused|tracked|cannot|selection/i;

  /** Every paragraph with where to edit it. */
  function sites(d) {
    const out = [];
    for (const e of walkBlocks(d.doc)) {
      if (e.b.type === 'p') out.push({p: e.b, block: e.at,
        body: true, top: e.depth === 0});
    }
    for (const [part, st] of d.doc.stories) {
      st.blocks.forEach((b, j) => b.type === 'p' && out.push({p: b,
        block: [0, j], story: part}));
    }
    for (const kind of ['footnote', 'endnote']) {
      const m = d.doc.notes[kind + 's'];
      for (const [id, n] of m || []) {
        if (n.type !== 'normal') continue;
        n.blocks.forEach((b, j) => b.type === 'p' && out.push({p: b,
          block: [0, j], story: {note: {kind, id}}}));
      }
    }
    for (const [id, c] of d.doc.comments.map) {
      c.blocks.forEach((b, j) => b.type === 'p' && out.push({p: b,
        comment: id, j, c}));
    }
    return out;
  }

  const langStyles = (styles, lang) => {
    const dd = styles.docDefaults || {};
    return {...styles, docDefaults: {...dd, rPr: {...(dd.rPr || {}),
      extra: lang ? [{name: 'w:lang', attrs: [['w:val', lang]]}]
        : []}}};
  };

  it('flags equal a from-scratch check, 400 steps over every story',
    async () => {
      let seed = 4242;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) /
        2 ** 32;
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const d = await allStories(TRACK);
      d.reviewer = () => ({name: 'Ann', now: WHEN});
      const app = {};
      await loadChoices(app);
      const st = new SpellState({d, app}, {dict, now: NOW});
      const ign = new Set();
      const verify = () => {
        st.ensure(st.paras());
        const ctx = {markup: d.markup, ignore: ign,
          personal: new Set(personalWords(app)), memo: null};
        for (const q of st.paras()) {
          const want = checkPara(dict, d.doc, q, ctx);
          assert.deepEqual(st.flagsOf(q), want,
            JSON.stringify(q.text) + ' ' + d.markup);
        }
      };
      const n0 = st.paras().length;
      const BODY = ['teh', 'hello', 'wrld', 'x', ' ', '.', 'o', 'dog '];
      let applied = 0, edits = 0, tracked = 0, struck = 0;
      const refused = [];
      const STEPS = 400;
      for (let step = 0; step < STEPS; step++) {
        const k = pick(['ins', 'ins', 'del', 'tins', 'tins', 'tdel',
          'track', 'split', 'merge', 'undo', 'redo', 'mode', 'paste',
          'style', 'ignore', 'personal', 'comment']);
        try {
          const ss = sites(d), t = pick(ss);
          const n = t.p.text.length, at = Math.floor(rnd() * (n + 1));
          if (k === 'ins' || k === 'paste' || k === 'del') {
            const del = k === 'del' ? Math.min(3, n - at) : 0;
            const ins = k === 'del' ? '' : k === 'paste'
              ? ' hello wrld teh ' : pick(BODY);
            if (!del && !ins) continue;
            if (t.comment !== undefined) {
              const text = t.p.text.slice(0, at) + ins +
                t.p.text.slice(at + del);
              d.apply({op: 'setComment', id: t.comment, blocks: [{
                ...t.p, text, runs: text ? [{...t.p.runs[0], start: 0,
                  end: text.length}] : []}]});
            } else {
              const op = {op: 'replaceText', block: t.block, at, del,
                ins};
              if (t.story !== undefined) op.story = t.story;
              d.apply(op);
            }
            edits++;
          } else if (k === 'tins' || k === 'tdel') {
            const b = ss.filter((x) => x.body);
            const u = pick(b), m = u.p.text.length;
            const c = S.caret({id: u.p.id, off: Math.floor(
              rnd() * (m + 1))});
            if (k === 'tins') typeText(d, c, pick(BODY));
            else deleteBack(d, c);
            if (RT.on(d)) tracked++;
            edits++;
          } else if (k === 'track') {
            RT.setTracking(d, null, !RT.on(d));
          } else if (k === 'split' && t.body) {
            d.apply({op: 'splitBlock', block: t.block, at});
          } else if (k === 'merge' && t.body) {
            d.apply({op: 'mergeBlock', block: t.block});
          } else if (k === 'undo') d.undo();
          else if (k === 'redo') d.redo();
          else if (k === 'mode') {
            d.markup = pick(['final', 'all', 'original']);
          } else if (k === 'style') {
            // (outside d.apply: no change event is sent)
            d.doc.styles = langStyles(d.doc.styles,
              pick([null, 'fr-FR', 'en-GB', 'en-US']));
          } else if (k === 'ignore') {
            const w = pick(['teh', 'wrld', 'blarg', 'cellx']);
            ign.add(w);
            st.ignoreAll(w);
          } else if (k === 'personal') {
            await addPersonal(app, pick(['hdrx', 'zork', 'Fnx']));
            st.refresh();
          } else continue;
          applied++;
        } catch (e) {
          if (!(e instanceof RangeError || e.name === 'Refused') ||
            !EXPECTED.test(e.message)) throw e;
          refused.push(e.message);
        }
        if (rnd() < 0.4) verify();
      }
      verify();
      for (const q of st.paras()) {
        if (q.runs.some((x) => x.rev && x.rev.kind === 'del')) struck++;
      }
      assert.ok(applied >= STEPS / 2, `applied ${applied} of ${STEPS}`
        + ' refused: ' + [...new Set(refused)].join('; '));
      assert.ok(edits >= 100, 'edits ' + edits);
      assert.ok(tracked >= 10, 'tracked edits ' + tracked);
      assert.ok(st.paras().length >= n0 - 2);
      assert.ok(struck + tracked > 0);
      st.stop();
    });
});

describe('SpellState: big documents', () => {
  it('10,000 paragraphs: visible first, the rest in slices',
    async () => {
      const text = 'the quick brown fox jumps over teh lazy dog ';
      const d = await mkDoc(Array.from({length: 10000}, () =>
        p(r(text))).join(''));
      const f = frames();
      const st = new SpellState({d, app: {}}, {dict, raf: f.raf,
        caf: f.caf});
      const vis = body(d).slice(0, 40);
      const ms = best(() => {
        const s = mk(d);
        s.ensure(vis);
        s.stop();
      });
      assert.ok(ms < 50, 'ensure ms ' + ms);
      st.ensure(vis);
      assert.equal(st.flagsOf(vis[39]).length, 1);
      // (a slice is SLICE_MS of work and one paragraph over; the
      // garbage collector adds 10 to 15 ms to about one slice in
      // six on this heap, so the bound is on the median, over
      // three runs, and a sanity bound on the worst: this catches
      // only gross regressions, such as a slice that does not stop)
      const med = [], worst = [];
      for (let run = 0; run < 3; run++) {
        const g = frames(), s = new SpellState({d, app: {}},
          {dict, raf: g.raf, caf: g.caf});
        s.start();
        const took = [];
        while (g.n) {
          const t = performance.now();
          g.run(1);
          took.push(performance.now() - t);
        }
        took.sort((a, b) => a - b);
        med.push(took[took.length >> 1]);
        worst.push(took[took.length - 1]);
        assert.ok(took.length > 1);
        assert.equal(s.flagsOf(body(d)[9999]).length, 1);
        s.stop();
      }
      assert.ok(Math.min(...med) < SLICE_MS + 10, 'median ' + med);
      assert.ok(Math.min(...worst) < 100, 'worst ' + worst);
      st.stop();
    });
  it('a 100,000-character and a 1 MB paragraph: ensure does not ' +
    'check them; the slices do, a chunk at a time, as checkPara would',
  async () => {
    const {LONG} = await import(L + 'SpellState');
    for (const n of [4200, 42000]) {
      const d = await mkDoc(p(r('the quick teh brown fox '.repeat(n)))
        + p(r('hello wrld')));
      const q = body(d)[0], small = body(d)[1];
      assert.ok(q.text.length >= 24 * n && q.text.length > LONG);
      const ms = best(() => {
        const s = mk(d);
        s.ensure([q, small]);
        s.stop();
      }, 4);
      assert.ok(ms < 20, 'ensure ms ' + ms);
      const f = frames(), s = new SpellState({d, app: {}}, {dict,
        raf: f.raf, caf: f.caf});
      s.start();
      assert.equal(s.ensure([q, small]), false);
      assert.equal(s.flagsOf(q), null);
      assert.deepEqual(s.flagsOf(small).map((x) => x.word), ['wrld']);
      const took = [];
      while (f.n) {
        const t = performance.now();
        f.run(1);
        took.push(performance.now() - t);
      }
      assert.ok(took.length > 1, 'slices ' + took.length);
      took.sort((a, b) => a - b);
      assert.ok(took[took.length >> 1] < SLICE_MS + 10,
        'median ' + took[took.length >> 1]);
      assert.ok(took[took.length - 1] < 150, 'worst ' + took.at(-1));
      assert.deepEqual(s.flagsOf(q), checkPara(dict, d.doc, q,
        {markup: 'final'}));
      assert.equal(s.flagsOf(q).length, n);
      assert.equal(s.ensure([q, small]), true);
      s.stop();
    }
  });
  it('a long paragraph on show goes before the rest; the word being ' +
    'typed in it is still not flagged', async () => {
    const long = 'the quick teh brown fox '.repeat(2000);
    const d = await mkDoc(Array.from({length: 3000}, () =>
      p(r('the fox teh'))).join('') + p(r(long)));
    const f = frames(), c = counter();
    let clock = 0;                     // (1 ms a look at the clock)
    const st = new SpellState({d, app: {}}, {dict, raf: f.raf,
      caf: f.caf, now: () => clock++, check: c.check});
    st.start();
    const at = body(d).length - 1;
    type(d, at, long.length, 'x');
    type(d, at, long.length + 1, 'q');
    const q = body(d)[at];
    st.setCaret(q, long.length + 2, true);
    assert.equal(st.ensure([q]), false);
    let k = 0;
    while (!st.flagsOf(q) && k++ < 100) f.run(1);
    assert.ok(k > 1, 'over several slices: ' + k);
    assert.ok(c.n < 10, 'the long one first: ' + c.n);
    const fl = st.flagsOf(q);
    assert.equal(fl.length, 2000);
    assert.ok(!fl.some((x) => x.word === 'xq'), 'hushed');
    st.setCaret(q, 0);
    assert.ok(st.flagsOf(q).some((x) => x.word === 'xq'));
    f.run();
    assert.equal(st.flagsOf(body(d)[0]).length, 1);
    st.stop();
  });
});

describe('SpellState: one word key on both sides', () => {
  const CURLY = 'O’Hara', SHY = 'zo­rk';
  it('Ignore All of a word with a curly apostrophe', async () => {
    const d = await mkDoc(p(r(CURLY + ' hello')) + p(r("o'hara x")) +
      p(r('O’HARA')));
    const st = mk(d), ps = body(d);
    st.ensure(ps);
    assert.deepEqual(st.flagsOf(ps[0]).map((x) => x.word), [CURLY]);
    st.ignoreAll(st.flagsOf(ps[0])[0].word);
    st.ensure(ps);
    assert.deepEqual(st.flagsOf(ps[0]), []);
    assert.deepEqual(st.flagsOf(ps[1]).map((x) => x.word), ['x']);
    assert.deepEqual(st.flagsOf(ps[2]), []);
    st.stop();
  });
  it('Ignore All of a word holding a format character', async () => {
    for (const f of ['­', '​', '‌', '‍', '⁠',
      '﻿']) {
      const w = 'zo' + f + 'rk';
      const d = await mkDoc(p(r(w + ' hello')) + p(r('zork')));
      const st = mk(d), ps = body(d);
      st.ensure(ps);
      assert.deepEqual(st.flagsOf(ps[0]).map((x) => x.word), [w]);
      st.ignoreAll(w);
      st.ensure(ps);
      assert.deepEqual(st.flagsOf(ps[0]), [], JSON.stringify(f));
      assert.deepEqual(st.flagsOf(ps[1]), [], JSON.stringify(f));
      st.stop();
    }
  });
  it('a personal list holding the raw form still matches', async () => {
    const d = await mkDoc(p(r(CURLY + ' ' + SHY + " O'Hara zork")));
    const list = Object.freeze([CURLY, SHY]);
    const st = mk(d, {personal: () => list});
    const q = body(d)[0];
    st.ensure([q]);
    assert.deepEqual(st.flagsOf(q), []);
    st.stop();
  });
});

describe('SpellState: repaints only for what is on show', () => {
  it('slices over paragraphs off the screen ask for no repaint; one ' +
    'that was painted unchecked does', async () => {
    const d = await mkDoc(Array.from({length: 3000}, () =>
      p(r('the fox teh'))).join(''));
    let clock = 0;                     // (1 ms a look at the clock)
    const f = frames(), st = new SpellState({d, app: {}}, {dict,
      raf: f.raf, caf: f.caf, now: () => clock++});
    let told = 0;
    st.onChange(() => told++);
    st.start();
    f.run();
    assert.equal(told, 0, 'nothing on show: no repaint');
    assert.equal(st.flagsOf(body(d)[2999]).length, 1);
    // on show, but more than ensure has time for
    st.ignoreAll('zzz');               // (all to be checked again)
    told = 0;
    const vis = body(d).slice(0, 40);
    assert.equal(st.ensure(vis), false);
    assert.ok(vis.some((q) => st.flagsOf(q) === null));
    let slices = 0;
    while (vis.some((q) => st.flagsOf(q) === null) && slices < 50) {
      f.run(1);
      slices++;
    }
    assert.ok(told >= 1 && told <= slices, `told ${told} in ${slices}`);
    const was = told;
    f.run();                           // (the rest: off the screen)
    assert.equal(told, was);
    for (const q of vis) assert.equal(st.flagsOf(q).length, 1);
    told = 0;
    type(d, 2000, 0, 'x');             // (off the screen: no repaint)
    f.run();
    assert.equal(told, 0);
    st.stop();
  });
});
