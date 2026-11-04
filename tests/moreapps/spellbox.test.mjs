// The Spelling dialogue (Batch F3, F7): spellStep walks the flagged
// words in document order (body, table, headers and footers, notes,
// comments), from the caret, round once with a notice, in bounded
// slices; the controller (spellRun) does Ignore, Ignore All, Change,
// Change All (one undo step) and Add through ./SpellFix and selects
// the word; the Tools items and the F7 key. ('riscos' replaced by a
// stand-in; the window itself is checked in word-spell-paint.mjs.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {keymap, ROWS, WINDOW}
  from '../../tools/moreapps/!Letters/Keymap';
import {buildDocx, documentXml, settingsXml, p, r, REL, W_NS,
  R_NS}
  from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {commentParts} from './comment-fixtures.mjs';
import {SEPS, noteP, enoteP, mark, emark} from './note-fixtures.mjs';

globalThis.__sbStub = {notes: [], beeps: 0};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__sbStub;' +
  'export const Menu = class {constructor(t, i) {this.title = t;' +
  ' this.items = i;}};' +
  'export const wimp = {beep() { s.beeps++; }, menus: {},' +
  ' setCaret() {}, width: 2000};' +
  'export const reportError = (m) => { s.notes.push(m); };' +
  'export const vfs = {exists: () => false, readFile: () => ' +
  'Promise.reject(new Error(\'stub\'))}, choices = {write() {}};' +
  'export const TextArea = class {}, textWidth = () => 0,' +
  ' saveAs = () => {}, query = () => {}, infoBox = () => {},' +
  ' os = {};');
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
const SB = await import(L + 'SpellBox');
const {toolsMenu} = await import(L + 'ToolsMenu');
const {docCommand} = await import(L + 'DocKeys');
const {Typing} = await import(L + 'Typing');
const {setSpell, ensureSpell} = await import(L + 'SpellBind');
const {personalWords, spellOn} = await import(L + 'SpellOpts');

const st = globalThis.__sbStub;
const D = '2024-01-02T03:04:00Z';
const ins = (id, text) => `<w:ins w:id="${id}" w:author="Ann" ` +
  `w:date="${D}">${r(text)}</w:ins>`;
const K = new Set(('the quick brown fox jumps over lazy dog hello ' +
  'world word is a test this and not valid it was here there new old ' +
  'text of in body').split(' '));
const dict = {has: (w) => K.has(w.toLowerCase()),
  tryChars: 'abcdefghijklmnopqrstuvwxyz'};
const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const TBL = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  'w:w="4000"/></w:tblGrid><w:tr><w:tc>' + inner + '</w:tc></w:tr>' +
  '</w:tbl>';
const mkDoc = async (body, extra = {}) => new Document(await readDocx(
  await buildDocx({'word/document.xml': documentXml(body), ...extra})));

/** A document with every kind of story, each holding a word that is
 *  not in the dictionary (see ./spellfix.test.mjs). */
async function allStories() {
  const body = p(r('teh body') + mark(1) + emark(2)) +
    TBL(p(r('cellx')) + TBL(p(r('nestx'))) + p()) + p(r('gone'));
  const c = commentParts({0: 'cmtx'});
  const en = (a, b) => `<w:endnote ${a}>${b}</w:endnote>`;
  const notes = {
    'word/footnotes.xml': DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">${SEPS}<w:footnote w:id="1">` +
      `${noteP('fnx')}</w:footnote></w:footnotes>`,
    'word/endnotes.xml': DECL + `<w:endnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">` +
      en('w:type="separator" w:id="-1"',
        p('<w:r><w:separator/></w:r>')) +
      en('w:type="continuationSeparator" w:id="0"',
        p('<w:r><w:continuationSeparator/></w:r>')) +
      en('w:id="2"', enoteP('enx')) + '</w:endnotes>'};
  const bytes = await withHeaders(body, {default: {
    hdr: p(r('hdrx')), ftr: p(r('ftrx'))}}, {
    parts: {...c.parts, ...notes}, docRels: [...c.docRels,
      ['rIdN1', REL('footnotes'), 'footnotes.xml'],
      ['rIdN2', REL('endnotes'), 'endnotes.xml']]});
  return new Document(await readDocx(bytes));
}

/** A window-like object over d: a view with a selection, a typing
 *  that counts commands, and a state checked by dict. */
function mk(d, o = {}) {
  const typing = new Typing(d), cmds = {n: 0};
  const run = typing.command.bind(typing);
  typing.command = (f) => { cmds.n++; return run(f); };
  const view = {d, hdr: null, typing, sel: null, spell: null,
    ensure() {}, edited(s) { this.sel = s; },
    setSelection(s) { this.sel = s; }, focus() {}};
  const dw = {d, app: o.app || {choices: {}, docs: new Map()}, view,
    boxes: new Map(), closed: false, cmds,
    win: {isOpen: false, invalidate() {}}};
  if (o.state !== false) {
    dw.spell = new SpellState(dw, {dict, now: () => 0, raf: () => 0,
      caf: () => {}, ...(o.spell || {})});
  }
  return dw;
}
const paras = (dw) => dw.spell.paras();
const words = (dw) => {
  const out = [];
  for (const q of paras(dw)) {
    dw.spell.flagsAt(q, 0);
    for (const f of dw.spell.flagsOf(q) || []) out.push(f.word);
  }
  return out;
};
const caretIn = (dw, para, off) => {
  dw.view.sel = S.caret({id: para.id, off});
};
const selText = (dw) => {
  const s = dw.view.sel;
  assert.ok(s, 'a selection');
  assert.equal(s.anchor.id, s.head.id);
  const q = paras(dw).find((x) => x.id === s.head.id);
  return q.text.slice(Math.min(s.anchor.off, s.head.off),
    Math.max(s.anchor.off, s.head.off));
};
const noteCount = () => st.notes.length;

/** The words spellStep gives walking from the start to the end. */
function walk(dw, from) {
  const out = [];
  let cur = from;
  for (let k = 0; k < 200; k++) {
    const r = SB.spellStep(dw, cur, {quiet: true});
    if (!r) return out;
    assert.ok(!r.busy);
    if (cur && out.length && r.wrapped) return out;
    out.push(r.hit.word);
    cur = {i: r.hit.i, off: r.hit.to};
  }
  throw new Error('no end');
}

describe('spellStep', () => {
  it('goes in document order over every story', async () => {
    const dw = mk(await allStories());
    const ws = walk(dw);
    assert.deepEqual(ws.slice(0, 4), ['teh', 'cellx', 'nestx', 'gone']);
    const rest = ws.slice(4).sort();
    assert.deepEqual(rest,
      ['cmtx', 'enx', 'fnx', 'ftrx', 'hdrx'].sort());
    assert.equal(ws[ws.length - 1], 'cmtx');
    assert.deepEqual(ws, words(dw));
    dw.spell.stop();
  });

  it('hits say where they are: body only in the body', async () => {
    const dw = mk(await allStories());
    const flags = [];
    let cur;
    for (let k = 0; k < 20; k++) {
      const r = SB.spellStep(dw, cur, {quiet: true});
      if (!r || (cur && r.wrapped)) break;
      flags.push([r.hit.word, r.hit.body]);
      cur = {i: r.hit.i, off: r.hit.to};
    }
    assert.deepEqual(flags.map((x) => x[0]), words(dw));
    assert.deepEqual(flags.filter((x) => x[1]).map((x) => x[0]),
      ['teh', 'cellx', 'nestx', 'gone']);
    assert.equal(flags.filter((x) => !x[1]).length, 5);
    dw.spell.stop();
  });

  it('starts at the caret and wraps once, with the notice',
    async () => {
      const dw = mk(await allStories());
      const ps = paras(dw);
      const cell = ps.find((q) => q.text === 'cellx');
      caretIn(dw, cell, 2);              // (inside the word)
      st.notes.length = 0;
      let r = SB.spellStep(dw);
      assert.equal(r.hit.word, 'cellx');
      assert.equal(r.wrapped, false);
      assert.equal(noteCount(), 0);
      const last = ps.findIndex((q) => q.text === 'cmtx');
      assert.ok(last > 0);
      r = SB.spellStep(dw, {i: last, off: 4});   // (after the last)
      assert.equal(r.hit.word, 'teh');
      assert.equal(r.wrapped, true);
      assert.deepEqual(st.notes,
        ['Reached the end; continuing from the start']);
      dw.spell.stop();
    });

  it('a caret after the only flagged word finds it again, wrapped',
    async () => {
      const d = await mkDoc(p(r('zork here')) + p(r('hello')));
      const dw = mk(d);
      caretIn(dw, paras(dw)[1], 3);
      st.notes.length = 0;
      const got = SB.spellStep(dw);
      assert.equal(got.hit.word, 'zork');
      assert.equal(got.wrapped, true);
      assert.equal(st.notes.length, 1);
      dw.spell.stop();
    });

  it('nothing flagged: null and Spelling check complete', async () => {
    const d = await mkDoc(p(r('hello world')) + p(r('the test')));
    const dw = mk(d);
    assert.deepEqual(words(dw), []);
    st.notes.length = 0;
    assert.equal(SB.spellStep(dw), null);
    assert.deepEqual(st.notes, ['Spelling check complete']);
    dw.spell.stop();
  });

  it('o.quiet says nothing', async () => {
    const dw = mk(await mkDoc(p(r('hello'))));
    st.notes.length = 0;
    assert.equal(SB.spellStep(dw, undefined, {quiet: true}), null);
    assert.equal(st.notes.length, 0);
    dw.spell.stop();
  });

  it('context: the word marked, cut with ... both sides', async () => {
    const long = 'the quick brown fox jumps over the lazy dog ' +
      'zork and the quick brown fox jumps over the lazy dog again';
    const dw = mk(await mkDoc(p(r(long))));
    const c = SB.spellStep(dw).context;
    assert.equal(c.word, 'zork');
    assert.ok(c.before.startsWith('...') && c.after.endsWith('...'));
    assert.equal(c.text, `${c.before}[zork]${c.after}`);
    assert.ok(c.text.length < 90);
    const dw2 = mk(await mkDoc(p(r('a zork b'))));
    assert.equal(SB.spellStep(dw2).context.text, 'a [zork] b');
    dw.spell.stop();
    dw2.spell.stop();
  });

  it('the dictionary not read: null, a notice, no throw', async () => {
    const d = await mkDoc(p(r('zork')));
    const dw = mk(d, {state: false});
    dw.spell = new SpellState(dw, {
      readBytes: () => Promise.reject(new Error('no')),
      notify() {}, raf: () => 0, caf: () => {}});
    assert.equal(dw.spell.dictReady, false);
    st.notes.length = 0;
    assert.equal(SB.spellStep(dw), null);
    assert.deepEqual(st.notes, [SB.MSGS.wait]);
    const c = SB.spellRun(dw);
    c.begin();
    assert.equal(c.hit, null);
    assert.equal(c.message, SB.MSGS.off);
    assert.equal(c.busy, true);
    c.dispose();
    await new Promise((res) => setTimeout(res, 5));
    dw.spell.stop();
  });

  it('shows the failure of the dictionary and is not busy',
    async () => {
      const d = await mkDoc(p(r('zork')));
      const dw = mk(d, {state: false});
      dw.spell = new SpellState(dw, {
        readBytes: () => Promise.reject(new Error('no')),
        notify() {}, raf: () => 0, caf: () => {}});
      const c = SB.spellRun(dw);
      c.begin();
      assert.equal(c.busy, true);
      await new Promise((res) => setTimeout(res, 20));
      assert.equal(dw.spell.failed, true);
      assert.equal(c.busy, false);
      assert.equal(c.message, SB.MSGS.failed);
      assert.equal(c.message, 'The dictionary could not be read.');
      c.dispose();
      dw.spell.stop();
    });

  it('works with the setting off: no underlines, no slices',
    async () => {
      const d = await mkDoc(p(r('zork')) + p(r('hello')) +
        p(r('blurb')));
      let frames = 0;
      const dw = mk(d, {spell: {raf: () => { frames++; return 0; }}});
      assert.equal(dw.view.spell, null);
      const ws = walk(dw);
      assert.deepEqual(ws, ['zork', 'blurb']);
      assert.equal(dw.view.spell, null);
      assert.equal(frames, 0);
      dw.spell.stop();
    });

  it('makes its state when the window has none', async () => {
    const dw = mk(await mkDoc(p(r('zork'))), {state: false});
    assert.equal(dw.spell, undefined);
    st.notes.length = 0;
    assert.equal(SB.spellStep(dw), null);   // (dictionary not read)
    assert.ok(dw.spell instanceof SpellState);
    assert.equal(dw.view.spell, null);
    dw.spell.stop();
  });

  it('a large document is stepped in slices', async () => {
    const N = 30000;
    const body = p(r('hello world')).repeat(N) + p(r('zork'));
    const dw = mk(await mkDoc(body));
    assert.equal(paras(dw).length, N + 1);
    let calls = 0, cur, hit = null;
    for (; calls < 100000 && !hit; calls++) {
      const r = SB.spellStep(dw, cur, {budget: 0.5, quiet: true});
      assert.ok(r, 'found');
      if (r.busy) {
        assert.ok(r.from.i > (cur ? cur.i : 0), 'progress');
        cur = r.from;
      } else hit = r.hit;
    }
    assert.ok(calls > 1, `needed ${calls} calls`);
    assert.equal(hit.word, 'zork');
    assert.equal(hit.i, N);
    dw.spell.stop();
  });

  it('a paragraph of 5000 flagged words is walked, each once',
    async () => {
      const dw = mk(await mkDoc(p(r('zork '.repeat(5000)))));
      let cur, n = 0;
      for (;;) {
        const r = SB.spellStep(dw, cur, {quiet: true});
        if (!r) break;
        if (r.wrapped) break;
        n++;
        cur = {i: r.hit.i, off: r.hit.to};
      }
      assert.equal(n, 5000);
      dw.spell.stop();
    });
});

describe('the dialogue controller', () => {
  const frames = () => {
    const q = [];
    return {raf: (f) => q.push(f), run: () => q.splice(0).forEach((f) =>
      f())};
  };

  it('begin shows the first word, selected, with suggestions',
    async () => {
      const dw = mk(await mkDoc(p(r('the tehx fox')) + p(r('zork'))));
      const c = SB.spellRun(dw);
      c.begin();
      assert.equal(c.hit.word, 'tehx');
      assert.equal(selText(dw), 'tehx');
      assert.ok(Array.isArray(c.sugg));
      assert.ok(c.context.text.includes('[tehx]'));
      c.dispose();
      dw.spell.stop();
    });

  it('Change puts the text in, selects the next word', async () => {
    const d = await mkDoc(p(r('teh fox')) + p(r('a zork')));
    const dw = mk(d);
    const c = SB.spellRun(dw);
    c.begin();
    assert.equal(c.hit.word, 'teh');
    assert.equal(c.change('the'), true);
    assert.equal(paras(dw)[0].text, 'the fox');
    assert.equal(c.hit.word, 'zork');
    assert.equal(selText(dw), 'zork');
    assert.equal(dw.cmds.n, 1);
    d.undo();
    assert.equal(paras(dw)[0].text, 'teh fox');
    c.dispose();
    dw.spell.stop();
  });

  it('Change goes past the text it put in, flagged or not',
    async () => {
      const dw = mk(await mkDoc(p(r('teh a zork'))));
      const c = SB.spellRun(dw);
      c.begin();
      c.change('blurbx');                // (itself not in the list)
      assert.equal(paras(dw)[0].text, 'blurbx a zork');
      assert.equal(c.hit.word, 'zork');
      c.dispose();
      dw.spell.stop();
    });

  it('Change with no text takes the first suggestion', async () => {
    const dw = mk(await mkDoc(p(r('teh fox'))));
    const c = SB.spellRun(dw);
    c.begin();
    const first = c.sugg[0];
    assert.equal(typeof first, 'string', 'a suggestion for teh');
    c.change();
    assert.equal(paras(dw)[0].text, first + ' fox');
    c.dispose();
    dw.spell.stop();
  });

  it('Change with empty text changes nothing and says so',
    async () => {
      const d = await mkDoc(p(r('teh fox')));
      const dw = mk(d);
      const c = SB.spellRun(dw);
      c.begin();
      assert.equal(c.change('   '), false);
      assert.equal(c.message, SB.MSGS.none);
      assert.equal(paras(dw)[0].text, 'teh fox');
      assert.equal(d.undoDepth, 0);
      assert.equal(c.hit.word, 'teh');
      c.dispose();
      dw.spell.stop();
    });

  it('Change All: every one, one undo step', async () => {
    const d = await mkDoc(p(r('teh a teh')) + p(r('zork')) +
      TBL(p(r('teh'))));
    const dw = mk(d);
    const c = SB.spellRun(dw);
    c.begin();
    const before = paras(dw).map((q) => q.text);
    assert.equal(c.changeAll('the'), 3);
    assert.deepEqual(paras(dw).map((q) => q.text),
      ['the a the', 'zork', 'the']);
    assert.equal(dw.cmds.n, 1);
    assert.equal(d.undoDepth, 1);
    assert.equal(c.hit.word, 'zork');
    d.undo();
    assert.deepEqual(paras(dw).map((q) => q.text), before);
    assert.equal(d.undoDepth, 0);
    c.dispose();
    dw.spell.stop();
  });

  it('Ignore skips this one only; Ignore All every one', async () => {
    const d = await mkDoc(p(r('zork a zork')) + p(r('zork')));
    const dw = mk(d);
    const c = SB.spellRun(dw);
    c.begin();
    c.ignore();
    assert.equal(c.hit.word, 'zork');
    assert.equal(c.hit.from, 7);       // (the second in the paragraph)
    assert.equal(words(dw).length, 3, 'still flagged in the text');
    c.ignoreAll();
    assert.deepEqual(words(dw), []);
    assert.equal(c.hit, null);
    assert.equal(c.message, SB.MSGS.done);
    assert.equal(d.undoDepth, 0);
    c.dispose();
    dw.spell.stop();
  });

  it('Add keeps the word and goes on', async () => {
    const app = {choices: {}, docs: new Map()};
    const d = await mkDoc(p(r('zork here')) + p(r('blurb')));
    const dw = mk(d, {app});
    const c = SB.spellRun(dw);
    c.begin();
    assert.equal(c.hit.word, 'zork');
    await c.add();
    assert.deepEqual(personalWords(app), ['zork']);
    assert.equal(c.hit.word, 'blurb');
    assert.deepEqual(words(dw), ['blurb']);
    c.dispose();
    dw.spell.stop();
  });

  it('Ignore All and Add of a word with a curly apostrophe or a ' +
    'soft hyphen', async () => {
    const app = {choices: {}, docs: new Map()};
    const d = await mkDoc(p(r('O\u2019Hara here')) + p(r("o'hara")) +
      p(r('zo\u00ADrk')) + p(r('zork')));
    const dw = mk(d, {app});
    const c = SB.spellRun(dw);
    c.begin();
    assert.equal(c.hit.word, 'O\u2019Hara');
    c.ignoreAll();
    assert.equal(c.hit.word, 'zo\u00ADrk');
    assert.deepEqual(words(dw), ['zo\u00ADrk', 'zork']);
    await c.add();
    assert.deepEqual(personalWords(app), ['zork']);
    assert.deepEqual(words(dw), []);
    assert.equal(c.hit, null);
    c.dispose();
    dw.spell.stop();
  });

  it('wrapping and completing are said in the message', async () => {
    const d = await mkDoc(p(r('zork')) + p(r('hello')));
    const dw = mk(d);
    caretIn(dw, paras(dw)[1], 2);
    const c = SB.spellRun(dw);
    st.notes.length = 0;
    c.begin();
    assert.equal(c.hit.word, 'zork');
    assert.ok(c.message.includes(SB.MSGS.wrap), c.message);
    c.change('the');
    assert.equal(c.hit, null);
    assert.equal(c.message, SB.MSGS.done);
    assert.equal(st.notes[st.notes.length - 1], SB.MSGS.done);
    c.dispose();
    dw.spell.stop();
  });

  it('a stale word: Change says so and looks again', async () => {
    const d = await mkDoc(p(r('zork')) + p(r('blurb')));
    const dw = mk(d);
    const c = SB.spellRun(dw);
    c.begin();
    const h = c.hit;
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'zz'});
    assert.notEqual(paras(dw)[0], h.para);
    assert.equal(c.change('x'), false);
    assert.equal(paras(dw)[0].text, 'zzzork');   // (not changed)
    assert.equal(c.hit.word, 'zzzork');          // (looked again)
    assert.ok(c.message.includes(SB.MSGS.gone), c.message);
    c.dispose();
    dw.spell.stop();
  });

  it('Close (stop) leaves the selection on the last word',
    async () => {
      const dw = mk(await mkDoc(p(r('zork a blurb'))));
      const c = SB.spellRun(dw);
      c.begin();
      c.ignore();
      assert.equal(selText(dw), 'blurb');
      const was = dw.view.sel;
      c.stop();
      assert.equal(dw.view.sel, was);
      assert.equal(selText(dw), 'blurb');
      c.dispose();
      dw.spell.stop();
    });

  it('a word outside the body is shown, not selected', async () => {
    const dw = mk(await allStories());
    const c = SB.spellRun(dw);
    c.begin();
    for (const w of ['teh', 'cellx', 'nestx', 'gone']) {
      assert.equal(c.hit.word, w);
      assert.equal(selText(dw), w);
      c.ignore();
    }
    const sel = dw.view.sel;
    assert.equal(c.hit.word, 'hdrx');
    assert.equal(c.hit.body, false);
    assert.equal(dw.view.sel, sel, 'the selection is left');
    assert.equal(c.message, SB.MSGS.other);
    c.change('the');
    assert.equal(c.hit.word, 'ftrx');
    c.dispose();
    dw.spell.stop();
  });

  it('a big document: begin goes on in animation frames',
    async () => {
      const f = frames();
      const body = p(r('hello world')).repeat(20000) + p(r('zork'));
      const dw = mk(await mkDoc(body));
      const c = SB.spellRun(dw, {raf: f.raf, caf() {}});
      const ups = [];
      c.onUpdate = () => ups.push(c.busy);
      c.begin();
      let n = 0;
      while (c.busy && n++ < 10000) f.run();
      assert.ok(n > 0, 'it took more than one go');
      assert.equal(c.hit.word, 'zork');
      assert.equal(ups[0], true);
      assert.equal(ups[ups.length - 1], false);
      c.dispose();
      dw.spell.stop();
    });

  it('dispose cancels a pending frame and stops updating',
    async () => {
      const f = frames();
      let cancelled = 0;
      const body = p(r('hello world')).repeat(20000) + p(r('zork'));
      const dw = mk(await mkDoc(body));
      const c = SB.spellRun(dw, {raf: (g) => { f.raf(g); return 7; },
        caf: (id) => { if (id === 7) cancelled++; }});
      let ups = 0;
      c.onUpdate = () => ups++;
      c.begin();
      assert.equal(c.busy, true);
      const u = ups;
      c.dispose();
      assert.equal(cancelled, 1);
      f.run();
      assert.equal(ups, u);
      assert.equal(c.hit, null);
      dw.spell.stop();
    });

  it('stop (Close) cancels a pending frame, begin goes on again',
    async () => {
      const f = frames();
      let cancelled = 0;
      const body = p(r('hello world')).repeat(20000) + p(r('zork'));
      const dw = mk(await mkDoc(body));
      const c = SB.spellRun(dw, {raf: (g) => { f.raf(g); return 9; },
        caf: (id) => { if (id === 9) cancelled++; }});
      c.begin();
      assert.equal(c.busy, true);
      c.stop();
      assert.equal(cancelled, 1);
      assert.equal(c.busy, false);
      c.begin();                         // (the box opened again)
      let n = 0;
      while (c.busy && n++ < 10000) f.run();
      assert.equal(c.hit.word, 'zork');
      c.dispose();
      dw.spell.stop();
    });

  it('a dictionary that arrives later starts the check', async () => {
    const d = await mkDoc(p(r('zork')));
    const dw = mk(d, {state: false});
    let ready;
    const pr = new Promise((res) => { ready = res; });
    dw.spell = new SpellState(dw, {raf: () => 0, caf() {},
      readBytes: () => pr, notify() {}});
    const c = SB.spellRun(dw);
    c.begin();
    assert.equal(c.busy, true);
    dw.spell._ready(dict);              // (the read ended)
    assert.equal(c.busy, false);
    assert.equal(c.hit.word, 'zork');
    c.dispose();
    dw.spell.stop();
    ready(null);
    await pr;
  });
});

describe('the dialogue and a state stopped while it reads', () => {
  it('F7 while the dictionary loads, then the setting turned off: ' +
    'the dialogue does not stay on Reading the dictionary', async () => {
    const KEY = Symbol.for('letters.spell.dict');
    delete globalThis[KEY];
    let release;
    const gate = new Promise((ok) => { release = ok; });
    const rb = async (q) => {
      await gate;
      return new TextEncoder().encode(q.endsWith('dic')
        ? '2\nhello\nhere\n' : 'SET UTF-8\n');
    };
    const app = {choices: {}, docs: new Map()};
    const dw = mk(await mkDoc(p(r('hello zork here'))), {app,
      state: false});
    dw.spell = new SpellState(dw, {readBytes: rb, notify() {},
      raf: () => 0, caf() {}});
    const was = dw.spell;
    const c = SB.spellRun(dw);
    c.begin();
    assert.equal(c.busy, true);
    assert.equal(c.message, SB.MSGS.off);
    was.stop();                        // (the setting turned off)
    release();
    await new Promise((ok) => setTimeout(ok, 30));
    assert.equal(was.dictReady, false, 'the stopped one stays unused');
    assert.notEqual(dw.spell, was);
    assert.equal(c.busy, false);
    assert.equal(c.hit && c.hit.word, 'zork');
    c.dispose();
    dw.spell.stop();
    delete globalThis[KEY];
  });
});

describe('the session: one origin, one wrap, one end', () => {
  const count = (m) => st.notes.filter((x) => x === m).length;

  it('Ignore through every word ends with Spelling check complete',
    async () => {
      const dw = mk(await mkDoc(p(r('zork a blurb'))));
      const c = SB.spellRun(dw);
      st.notes.length = 0;
      c.begin();
      const seen = [];
      for (let k = 0; k < 10 && c.hit; k++) {
        seen.push(c.hit.word);
        c.ignore();
      }
      assert.deepEqual(seen, ['zork', 'blurb']);
      assert.equal(c.hit, null);
      assert.equal(c.message, SB.MSGS.done);
      assert.equal(count(SB.MSGS.done), 1);
      assert.equal(count(SB.MSGS.wrap), 0);
      c.ignore();                        // (nothing to ignore)
      assert.equal(count(SB.MSGS.done), 1);
      c.dispose();
      dw.spell.stop();
    });

  it('from mid-document: round once, back at the origin, done',
    async () => {
      const dw = mk(await mkDoc(p(r('zork')) + p(r('hello')) +
        p(r('blurb'))));
      caretIn(dw, paras(dw)[1], 0);
      const c = SB.spellRun(dw);
      st.notes.length = 0;
      c.begin();
      const seen = [];
      for (let k = 0; k < 10 && c.hit; k++) {
        seen.push(c.hit.word);
        c.ignore();
      }
      assert.deepEqual(seen, ['blurb', 'zork']);
      assert.equal(count(SB.MSGS.wrap), 1);
      assert.equal(count(SB.MSGS.done), 1);
      assert.equal(c.hit, null);
      c.dispose();
      dw.spell.stop();
    });

  it('the wrap notice comes once, however many words follow it',
    async () => {
      const dw = mk(await mkDoc(p(r('zork')) + p(r('qqq')) +
        p(r('hello')) + p(r('blurb'))));
      caretIn(dw, paras(dw)[2], 0);
      const c = SB.spellRun(dw);
      st.notes.length = 0;
      c.begin();
      const seen = [];
      for (let k = 0; k < 10 && c.hit; k++) {
        seen.push(c.hit.word);
        c.ignore();
      }
      assert.deepEqual(seen, ['blurb', 'zork', 'qqq']);
      assert.equal(count(SB.MSGS.wrap), 1);
      assert.equal(count(SB.MSGS.done), 1);
      c.dispose();
      dw.spell.stop();
    });

  it('a word the caret was in is not shown twice in a session',
    async () => {
      const dw = mk(await mkDoc(p(r('zork a blurb'))));
      caretIn(dw, paras(dw)[0], 7);      // (inside blurb: not zork)
      const c = SB.spellRun(dw);
      c.begin();
      const seen = [];
      for (let k = 0; k < 10 && c.hit; k++) {
        seen.push(c.hit.word);
        c.ignore();
      }
      assert.deepEqual(seen, ['blurb', 'zork']);
      c.dispose();
      dw.spell.stop();
    });

  it('Change counts as seen: the walk still ends at its origin',
    async () => {
      const dw = mk(await mkDoc(p(r('zork a blurb ')) + p(r('zork'))));
      caretIn(dw, paras(dw)[0], 6);
      const c = SB.spellRun(dw);
      st.notes.length = 0;
      c.begin();
      assert.equal(c.hit.word, 'blurb');
      c.change('the');                   // (offsets move by -2)
      assert.equal(c.hit.word, 'zork');
      assert.equal(c.hit.i, 1);
      c.ignore();
      assert.equal(c.hit.word, 'zork');  // (round: the first one)
      assert.equal(c.hit.i, 0);
      assert.equal(count(SB.MSGS.wrap), 1);
      c.ignore();
      assert.equal(c.hit, null);
      assert.equal(count(SB.MSGS.done), 1);
      assert.equal(count(SB.MSGS.wrap), 1);
      c.dispose();
      dw.spell.stop();
    });

  it('Change All does not bring back earlier or ignored words',
    async () => {
      const dw = mk(await mkDoc(p(r('blurb zork blurb')) +
        p(r('zork blurb'))));
      caretIn(dw, paras(dw)[0], 0);
      const c = SB.spellRun(dw);
      c.begin();
      assert.equal(c.hit.word, 'blurb');
      c.ignore();
      assert.equal(c.hit.word, 'zork');
      c.ignore();
      assert.equal(c.hit.word, 'blurb');
      assert.equal(c.hit.from, 11);
      assert.equal(c.changeAll('the'), 3);
      assert.deepEqual(paras(dw).map((q) => q.text),
        ['the zork the', 'zork the']);
      // (the earlier, ignored 'zork' of paragraph 0 is not shown)
      assert.equal(c.hit.word, 'zork');
      assert.equal(c.hit.i, 1);
      c.ignore();
      assert.equal(c.hit, null);
      c.dispose();
      dw.spell.stop();
    });

  it('Change All keeps the origin when the first words change length',
    async () => {
      const dw = mk(await mkDoc(p(r('blurb zork blurb zork'))));
      caretIn(dw, paras(dw)[0], 16);     // (after the second blurb)
      const c = SB.spellRun(dw);
      c.begin();
      assert.equal(c.hit.word, 'zork');
      assert.equal(c.hit.from, 17);
      c.ignore();                        // (round: the first blurb)
      assert.equal(c.hit.wrapped, undefined);
      assert.equal(c.hit.word, 'blurb');
      assert.equal(c.hit.from, 0);
      assert.equal(c.changeAll('a'), 2);
      assert.equal(paras(dw)[0].text, 'a zork a zork');
      // the walk ends at its origin, between the second 'a' and
      // the second 'zork'; 'zork' at 2 is before it
      assert.equal(c.hit.word, 'zork');
      assert.equal(c.hit.from, 2);
      c.ignore();
      assert.equal(c.hit, null);
      c.dispose();
      dw.spell.stop();
    });

  /** Walk the session: act(c) on each word shown (it may change the
   *  text); the words shown in order. */
  const session = (dw, act) => {
    const c = SB.spellRun(dw), seen = [];
    st.notes.length = 0;
    c.begin();
    for (let k = 0; k < 20 && c.hit; k++) {
      seen.push(c.hit.word);
      act(c, k);
    }
    c.dispose();
    return seen;
  };

  it('a session from mid-document ends exactly at its origin, ' +
    'though what it passed is still misspelt', async () => {
    const dw = mk(await mkDoc(p(r('hello')) + p(r('zork')) +
      p(r('blurb'))));
    caretIn(dw, paras(dw)[2], 0);
    st.notes.length = 0;
    const seen = session(dw, (c) => c.change(c.hit.word + 'x'));
    assert.deepEqual(seen, ['blurb', 'zork']);
    assert.deepEqual(paras(dw).map((q) => q.text),
      ['hello', 'zorkx', 'blurbx']);
    assert.equal(count(SB.MSGS.wrap), 1);
    assert.equal(count(SB.MSGS.done), 1);
    dw.spell.stop();
  });

  it('the same inside one paragraph, the origin at an offset',
    async () => {
      const dw = mk(await mkDoc(p(r('zork a blurb'))));
      caretIn(dw, paras(dw)[0], 7);
      const seen = session(dw, (c) => c.change(c.hit.word + 'x'));
      assert.deepEqual(seen, ['blurb', 'zork']);
      assert.equal(paras(dw)[0].text, 'zorkx a blurbx');
      assert.equal(count(SB.MSGS.done), 1);
      dw.spell.stop();
    });

  it('Ignore goes on after the word, not from the paragraph start',
    async () => {
      const dw = mk(await mkDoc(p(r('zork blurb qq'))));
      // (zork put right into another misspelling is passed; an
      // Ignore at an offset must not go back to it)
      const seen = session(dw, (c) => {
        if (c.hit.word === 'zork') c.change('zorkx');
        else c.ignore();
      });
      assert.deepEqual(seen, ['zork', 'blurb', 'qq']);
      assert.equal(count(SB.MSGS.done), 1);
      dw.spell.stop();
    });

  for (const track of [false, true]) {
    it(`Change All ${track ? 'under Track Changes ' : ''}keeps its ` +
      'place: nothing skipped, nothing repeated', async () => {
      const extra = track
        ? {'word/settings.xml': settingsXml('<w:trackRevisions/>')}
        : {};
      const d = await mkDoc(p(r('zork qq zork')) + p(r('hello')),
        extra);
      const dw = mk(d);
      const RT = await import(L + 'RevTrack');
      assert.equal(RT.on(d), track);
      const seen = session(dw, (c) => {
        if (c.hit.i === 0 && c.hit.from === 8) {
          assert.equal(c.changeAll('blurbx'), 2);
        } else c.ignore();
      });
      assert.deepEqual(seen, ['zork', 'qq', 'zork']);
      if (track) {
        assert.ok(paras(dw)[0].text.length > 'zork qq zork'.length,
          'the old text is kept, deleted');
      }
      assert.equal(count(SB.MSGS.done), 1);
      assert.equal(d.undoDepth, 1);
      dw.spell.stop();
    });
  }

  it('Change All puts in a word that is still misspelt: it is not ' +
    'shown again, wherever it went', async () => {
    const d = await mkDoc(p(r('zork')) + p(r('qq zork')) +
      p(r('zork')));
    const dw = mk(d);
    caretIn(dw, paras(dw)[1], 0);        // (origin: paragraph 1)
    const seen = session(dw, (c) => {
      if (c.hit.word === 'zork') c.changeAll('blurbx');
      else c.ignore();
    });
    assert.deepEqual(seen, ['qq', 'zork']);
    assert.deepEqual(paras(dw).map((q) => q.text),
      ['blurbx', 'qq blurbx', 'blurbx']);
    dw.spell.stop();
  });

  it('the origin moves with a Change made on the way round',
    async () => {
      const dw = mk(await mkDoc(p(r('blurb qq zork'))));
      caretIn(dw, paras(dw)[0], 9);
      const seen = session(dw, (c) => {
        const w = c.hit.word;
        if (w === 'zork') c.change('zorx');
        else if (w === 'blurb') c.change('a');
        else c.ignore();
      });
      assert.deepEqual(seen, ['zork', 'blurb', 'qq']);
      assert.equal(paras(dw)[0].text, 'a qq zorx');
      dw.spell.stop();
    });

  it('Change All that lengthens the text does not bring back a ' +
    'word put right before it', async () => {
    const dw = mk(await mkDoc(p(r('zork qq zork'))));
    const seen = session(dw, (c) => {
      const w = c.hit.word;
      if (w === 'qq') c.change('qqx');
      else if (c.hit.from === 0) c.ignore();
      else c.changeAll('blurbx');
    });
    assert.deepEqual(seen, ['zork', 'qq', 'zork']);
    assert.equal(paras(dw)[0].text, 'blurbx qqx blurbx');
    dw.spell.stop();
  });

  it('Change All does not hide an identical word it did not touch',
    async () => {
      const dw = mk(await mkDoc(p(r('blurbx zork'))));
      caretIn(dw, paras(dw)[0], 6);
      const seen = session(dw, (c) => {
        if (c.hit.word === 'zork') c.changeAll('blurbx');
        else c.ignore();
      });
      assert.deepEqual(seen, ['zork', 'blurbx']);
      assert.equal(paras(dw)[0].text, 'blurbx blurbx');
      assert.equal(seen.length, 2);
      dw.spell.stop();
    });

  const TRK = {'word/settings.xml': settingsXml('<w:trackRevisions/>')};

  it('tracked Change All with a word in the author\'s own insertion: ' +
    'the walk\'s places are right', async () => {
    const w = 'blurbxxxxxx';
    const d = await mkDoc(p(r(`zork a ${w} tail`)), TRK);
    const dw = mk(d);
    caretIn(dw, paras(dw)[0], 'zork a blurbxxxxxx '.length);
    const seen = session(dw, (c) => {
      const x = c.hit.word;
      if (x === 'tail') c.change('tailx');
      else if (x === 'zork') c.change(w);   // (an own insertion)
      else c.changeAll('q'.repeat(11));
    });
    assert.deepEqual(seen, ['tail', 'zork', w]);
    assert.ok(paras(dw)[0].text.includes('tailx'));
    assert.equal(count(SB.MSGS.done), 1);
    dw.spell.stop();
  });

  it('tracked Change All with an occurrence refused (another ' +
    'author\'s revision): the walk\'s places are right', async () => {
    const d = await mkDoc(p(ins(7, 'zork') + r(' a zork tail')), TRK);
    const dw = mk(d);
    caretIn(dw, paras(dw)[0], 'zork a zork '.length);
    st.notes.length = 0;
    let n = -1;
    const seen = session(dw, (c) => {
      const x = c.hit.word;
      if (x === 'tail') c.change('tailx');
      else if (c.hit.from === 0) c.ignore();   // (Ann's)
      else n = c.changeAll('q'.repeat(11));
    });
    assert.equal(n, 1);
    assert.deepEqual(seen, ['tail', 'zork', 'zork']);
    assert.ok(paras(dw)[0].text.startsWith('zork a '));
    assert.equal(count(SB.MSGS.done), 1);
    dw.spell.stop();
  });

  it('the skip set keeps a word out (spellStep o.skip)', async () => {
    const dw = mk(await mkDoc(p(r('zork blurb'))));
    const only = (i, x) => x.word === 'zork';
    assert.equal(SB.spellStep(dw, {i: 0, off: 0},
      {quiet: true, skip: only}).hit.word, 'blurb');
    assert.equal(SB.spellStep(dw, {i: 0, off: 0},
      {quiet: true}).hit.word, 'zork');
    dw.spell.stop();
  });

  it('begin again is a new session: ignored words come back',
    async () => {
      const dw = mk(await mkDoc(p(r('zork'))));
      const c = SB.spellRun(dw);
      c.begin();
      c.ignore();
      assert.equal(c.hit, null);
      c.begin();
      assert.equal(c.hit.word, 'zork');
      c.dispose();
      dw.spell.stop();
    });

  it('the header and footer mode starts at the top', async () => {
    const dw = mk(await allStories());
    const cell = paras(dw).find((q) => q.text === 'cellx');
    caretIn(dw, cell, 2);
    assert.equal(SB.spellStep(dw, undefined, {quiet: true}).hit.word,
      'cellx');
    dw.view.hdr = {};
    assert.equal(SB.spellStep(dw, undefined, {quiet: true}).hit.word,
      'teh');
    dw.spell.stop();
  });

  it('a state made for F7 with the setting off repaints once the ' +
    'setting is turned on', async () => {
    const app = {choices: {}, docs: new Map()};
    const dw = mk(await mkDoc(p(r('zork'))), {app, state: false});
    let inv = 0;
    dw.win = {isOpen: true, invalidate() { inv++; }};
    app.docs.set(1, dw);
    SB.spellStep(dw, undefined, {quiet: true});   // (makes the state)
    const s = dw.spell;
    assert.ok(s);
    assert.ok(s._fns.size > 0, 'a repaint hook');
    await setSpell(app, true);
    assert.equal(dw.spell, s);
    assert.equal(dw.view.spell, s);
    assert.ok(s._fns.size > 0);
    inv = 0;
    s._tell();
    assert.equal(inv, 1);
    s.stop();
  });

  it('a state stopped before its dictionary came is replaced; a ' +
    'ready one is kept', async () => {
    const dw = mk(await mkDoc(p(r('zork'))), {state: false});
    const never = new Promise(() => {});
    const old = dw.spell = new SpellState(dw, {readBytes: () => never,
      notify() {}, raf: () => 0, caf() {}});
    old.stop();
    assert.equal(old.stopped, true);
    SB.spellStep(dw, undefined, {quiet: true});
    assert.notEqual(dw.spell, old);
    dw.spell.stop();
    const ready = mk(await mkDoc(p(r('zork'))));
    ready.spell.stop();
    const was = ready.spell;
    assert.equal(SB.spellStep(ready, undefined, {quiet: true})
      .hit.word, 'zork');
    assert.equal(ready.spell, was);
    assert.equal(ensureSpell(ready), was);
  });

  it('100,000 paragraphs: each call is a slice, not the lot',
    async () => {
      const N = 100000;
      const dw0 = await mkDoc(p(r('hello world')).repeat(N) +
        p(r('zork')));
      const worst = [];
      for (let pass = 0; pass < 3; pass++) {
        const dw = mk(dw0);
        let cur, worstMs = 0, calls = 0, hit = null;
        while (!hit && calls++ < 100000) {
          const t = performance.now();
          const x = SB.spellStep(dw, cur, {budget: 8, quiet: true});
          worstMs = Math.max(worstMs, performance.now() - t);
          assert.ok(x, 'found');
          if (x.busy) cur = x.from; else hit = x.hit;
        }
        assert.equal(hit.word, 'zork');
        assert.ok(calls > 2, `slices: ${calls}`);
        worst.push(worstMs);
        dw.spell.stop();
      }
      assert.ok(Math.min(...worst) < 100, `worst slice ${worst}`);
    });
});

describe('Tools menu and key', () => {
  const item = (m, t) => m.items.find((i) => i.text === t);
  const val = (f) => (typeof f === 'function' ? f() : f);

  it('F7 is the Spelling command; the item shows it', async () => {
    const dw = mk(await mkDoc(p(r('x'))));
    assert.equal(keymap.labelFor('spell'), 'F7');
    assert.equal(keymap.row('spell').menu, 'Window');
    assert.ok(WINDOW.has('spell'));
    assert.ok(ROWS.some((x) => x.id === 'spell'));
    assert.equal(keymap.lookup({code: 0, char: '', key: 'F7',
      shift: false, ctrl: false, alt: false}), 'spell');
    dw.view.mac = false;
    const m = toolsMenu(dw);
    assert.equal(item(m, 'Spelling...').key, 'F7');
    dw.spell.stop();
  });

  it('F7 and the item open the box (once made, the same)',
    async () => {
      const dw = mk(await mkDoc(p(r('x'))));
      let opened = 0;
      const api = {open() { opened++; }};
      dw.boxes.set('spell', {api, on() {}});
      assert.equal(docCommand(dw, 'spell'), true);
      assert.equal(opened, 1);
      dw.view.mac = false;
      item(toolsMenu(dw), 'Spelling...').action();
      assert.equal(opened, 2);
      dw.spell.stop();
    });

  it('Check spelling as you type: ticked as set; toggling follows',
    async () => {
      const app = {choices: {}, docs: new Map()};
      const mkw = async (id) => {
        const dw = mk(await mkDoc(p(r('zork'))), {app, state: false});
        dw.win = {isOpen: false, invalidate() {}};
        dw.view.mac = false;
        app.docs.set(id, dw);
        return dw;
      };
      const a = await mkw(1), b = await mkw(2);
      await setSpell(app, true);
      const tick = (dw) => val(item(toolsMenu(dw),
        'Check spelling as you type').ticked);
      assert.equal(tick(a), true);
      assert.ok(a.view.spell && a.view.spell === a.spell);
      assert.ok(b.view.spell);
      item(toolsMenu(a), 'Check spelling as you type').action();
      await new Promise((res) => setTimeout(res, 10));
      assert.equal(spellOn(app), false);
      assert.equal(tick(a), false);
      assert.equal(tick(b), false);
      assert.equal(a.view.spell, null);
      assert.equal(b.view.spell, null);
      item(toolsMenu(b), 'Check spelling as you type').action();
      await new Promise((res) => setTimeout(res, 10));
      assert.equal(tick(a), true);
      assert.equal(a.view.spell, a.spell);
      assert.equal(b.view.spell, b.spell);
      for (const w of [a, b]) w.spell.stop();
    });
});
