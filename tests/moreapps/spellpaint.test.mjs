// The misspelt words underlined (Batch F3): ./SpellPaint paintSpell
// draws a red zigzag under each flagged range of the paragraphs the
// band shows (and checks those only), boxes from the layout, memoised;
// ./SpellBind keeps the setting: off draws nothing and asks for no
// animation frame.
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {editLayout} from '../../tools/moreapps/!Letters/StoryLayout';
import {paintView} from '../../tools/moreapps/!Letters/EditPaint';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {loadStyles, tm} from './word-docs.mjs';

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
const {SpellState} = await import(L + 'SpellState');
const {paintSpell, stats, COLOUR, AMP} = await import(L + 'SpellPaint');
const {syncSpell, setSpell, stopSpell, attachSpell} = await import(L + 'SpellBind');
const {checkPara} = await import(L + 'SpellCheck');

before(loadStyles);

const K = new Set(('the quick brown fox jumps over lazy dog hello ' +
  'world word is a test this and not valid it was here there ' +
  'text of in').split(' '));
const dict = {has: (w) => K.has(w.toLowerCase())};
const W = 1000;
const mkDoc = async (body, extra = {}) => new Document(await readDocx(
  await buildDocx({'word/document.xml': documentXml(body), ...extra})));
const laid = (d) => {
  const lay = new DocLayout(d.doc, tm());
  lay.layout(W);
  return lay;
};
const mkState = (d, o = {}) => new SpellState({d, app: {choices: {}}},
  {dict, now: () => 0, raf: () => 0, caf: () => {}, ...o});
const BIG = {y0: -1e6, y1: 1e6};

/** A fake 2D context recording the zigzags: one per moveTo. */
function fakeG() {
  const g = {calls: [], strokes: 0, styles: [], saves: 0, depth: 0,
    strokeStyle: '', lineWidth: 1, globalCompositeOperation: ''};
  for (const n of ['fillRect', 'fillText', 'strokeRect', 'rect',
    'clip', 'translate', 'scale', 'setLineDash', 'beginPath']) {
    g[n] = (...a) => g.calls.push([n, ...a]);
  }
  g.measureText = (t) => ({width: 8 * String(t).length});
  g.save = () => { g.saves++; g.depth++; };
  g.restore = () => { g.depth--; };
  g.moveTo = (x, y) => g.calls.push(['moveTo', x, y]);
  g.lineTo = (x, y) => g.calls.push(['lineTo', x, y]);
  g.stroke = () => {
    g.strokes++;
    g.styles.push([g.strokeStyle, g.lineWidth]);
  };
  return g;
}
/** The zigzags drawn: [{x0, x1, y}] from moveTo..lineTo runs. */
function waves(g) {
  const out = [];
  for (const [n, x, y] of g.calls) {
    if (n === 'moveTo') out.push({x0: x, x1: x, y, ys: [y]});
    else if (n === 'lineTo' && out.length) {
      const w = out[out.length - 1];
      w.x1 = x;
      w.ys.push(y);
    }
  }
  return out;
}

describe('paintSpell', () => {
  it('a flagged word gets a zigzag along its box', async () => {
    const d = await mkDoc(p(r('the teh fox')));
    const lay = laid(d), st = mkState(d), g = fakeG();
    paintSpell(lay, g, BIG, st);
    const box = lay.selectionRects({
      anchor: {id: lay.items[0].id, off: 4},
      head: {id: lay.items[0].id, off: 7}})[0];
    const ws = waves(g);
    assert.equal(ws.length, 1);
    assert.equal(ws[0].x0, Math.round(box.x));
    assert.equal(ws[0].x1, Math.round(box.x) + Math.round(box.w));
    const base = box.y + box.h - 1.5;
    assert.equal(ws[0].y, base);
    assert.deepEqual([...new Set(ws[0].ys)].sort(),
      [base - AMP, base].sort());
    assert.equal(g.strokes, 1);
    assert.deepEqual(g.styles[0], [COLOUR, 1]);
    assert.equal(g.depth, 0, 'saves balanced');
    st.stop();
  });
  it('a word of two runs is one box per run, both drawn', async () => {
    const d = await mkDoc(p(r('the te') +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>h</w:t></w:r>' + r(' fox')));
    const lay = laid(d), st = mkState(d), g = fakeG();
    paintSpell(lay, g, BIG, st);
    const flags = st.flagsOf(d.doc.sections[0].blocks[0]);
    assert.deepEqual(flags.map((f) => f.word), ['teh']);
    const rs = lay.selectionRects({anchor: {id: lay.items[0].id,
      off: flags[0].from}, head: {id: lay.items[0].id,
      off: flags[0].to}});
    const ws = waves(g);
    assert.ok(rs.length >= 1);
    assert.equal(ws.length, rs.length);
    const spanR = rs.reduce((a, b) => a + Math.round(b.w), 0);
    const spanW = ws.reduce((a, w) => a + (w.x1 - w.x0), 0);
    assert.equal(spanW, spanR);
    st.stop();
  });
  it('paragraphs outside the band are not drawn or checked',
    async () => {
      const d = await mkDoc(Array.from({length: 300}, (_, i) =>
        p(r(`teh line${i}`))).join(''));
      const lay = laid(d);
      let n = 0;
      const st = mkState(d, {check: (...a) => {
        n++;
        return checkPara(...a);
      }});
      const g = fakeG();
      paintSpell(lay, g, {y0: 0, y1: 200}, st);
      const drawn = waves(g).length;
      assert.ok(drawn > 0 && drawn < 40, `drawn ${drawn}`);
      assert.ok(n > 0 && n < 40, `checked ${n}`);
      const ys = waves(g).map((w) => w.y);
      assert.ok(Math.max(...ys) < 260);
      st.stop();
    });
  it('nothing without a state, nothing flagged: nothing drawn',
    async () => {
      const d = await mkDoc(p(r('the fox')));
      const lay = laid(d), g = fakeG();
      paintSpell(lay, g, BIG, null);
      paintSpell(lay, g, BIG, mkState(d));
      assert.equal(g.saves, 0);
      assert.equal(g.calls.filter((c) => c[0] === 'moveTo').length, 0);
    });
  it('a range over a line wrap draws on both lines', async () => {
    const text = 'the quick brown fox '.repeat(30).trim();
    const d = await mkDoc(p(r(text)));
    const lay = new DocLayout(d.doc, tm());
    lay.layout(300);
    assert.ok(lay.items[0].lines.length > 1);
    const st = mkState(d, {check: (dd, doc, para) =>
      [{from: 0, to: para.text.length, word: 'x'}]});
    const g = fakeG();
    paintSpell(lay, g, BIG, st);
    const ys = new Set(waves(g).map((w) => w.y));
    assert.equal(ys.size, lay.items[0].lines.length);
    st.stop();
  });
  it('table cell and header story paragraphs draw', async () => {
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/>' +
      '</w:tblGrid><w:tr><w:tc>' + p(r('cellx')) + '</w:tc></w:tr>' +
      '</w:tbl>';
    const bytes = await withHeaders(p(r('the fox')) + tbl,
      {default: p(r('hdrx'))});
    const d = new Document(await readDocx(bytes));
    const lay = laid(d), st = mkState(d), g = fakeG();
    paintSpell(lay, g, BIG, st);
    assert.equal(waves(g).length, 1, 'the cell');
    const [, story] = [...d.doc.stories][0];
    const ed = editLayout(story, 500, {doc: d.doc, metrics: tm()}, 0);
    const g2 = fakeG();
    paintSpell(ed.L, g2, BIG, st);
    assert.equal(waves(g2).length, 1, 'the header');
    st.stop();
  });
  it('boxes are worked out once per layout and flags', async () => {
    const d = await mkDoc(p(r('teh fox')) + p(r('the dog')));
    const lay = laid(d), st = mkState(d);
    paintSpell(lay, fakeG(), BIG, st);
    const n = stats.built;
    paintSpell(lay, fakeG(), BIG, st);
    paintSpell(lay, fakeG(), {y0: 0, y1: 100}, st);
    assert.equal(stats.built, n);
    st.ignoreAll('teh');
    const g = fakeG();
    paintSpell(lay, g, BIG, st);
    assert.equal(waves(g).length, 0);
    st.stop();
  });
  it('a hushed word keeps one array: no rebuild per paint',
    async () => {
      const d = await mkDoc(p(r('the fox')));
      const lay = laid(d), st = mkState(d);
      const para = () => d.doc.sections[0].blocks[0];
      d.apply({op: 'replaceText', block: [0, 0], at: 7, del: 0,
        ins: 'z'});                    // 'the foxz': being typed
      st.ensure([para()]);
      st.setCaret(para(), 8);
      assert.deepEqual(st.flagsOf(para()), []);
      paintSpell(lay, fakeG(), BIG, st);
      const n = stats.built;
      assert.equal(st.flagsOf(para()), st.flagsOf(para()));
      for (let i = 0; i < 5; i++) paintSpell(lay, fakeG(), BIG, st);
      assert.equal(stats.built, n);
      st.stop();
    });
  it('setCaret(quiet) tells nobody; setCaret tells', async () => {
    const d = await mkDoc(p(r('the fox')));
    const st = mkState(d);
    const para = () => d.doc.sections[0].blocks[0];
    d.apply({op: 'replaceText', block: [0, 0], at: 7, del: 0,
      ins: 'z'});
    st.ensure([para()]);
    let told = 0;
    st.onChange(() => told++);
    st.setCaret(para(), 8, true);      // (hushes)
    st.setCaret(para(), 0, true);      // (leaves it)
    assert.equal(told, 0);
    st.setCaret(para(), 8);
    assert.equal(told, 1);
    st.stop();
  });
  it('the spell layer is quick on a page of misspellings', async () => {
    const line = (i) => p(r('teh wrng spelng ' + i % 10 + ' mispeled'));
    const d = await mkDoc(Array.from({length: 10000}, (_, i) =>
      line(i)).join(''));
    const lay = laid(d), rect = {x0: 0, y0: 0, x1: W, y1: 900};
    const min = (f, k = 5) => {
      f();                             // (warm-up)
      let m = Infinity;
      for (let i = 0; i < k; i++) m = Math.min(m, f());
      return m;
    };
    const timed = (f) => {
      const t = performance.now();
      f();
      return performance.now() - t;
    };
    const st = mkState(d, {now: () => 0});
    const g0 = fakeG();
    paintSpell(lay, g0, rect, st);
    const n = waves(g0).length;        // (a full page of flags)
    assert.ok(n >= 150, `flags in view ${n}`);
    // first paint: a new state each time, boxes worked out afresh
    // (the checking of the page is not what is timed)
    const first = min(() => {
      const s2 = mkState(d, {now: () => 0});
      s2.ensure(s2.paras().slice(0, 100));
      const t = timed(() => paintSpell(lay, fakeG(), rect, s2));
      s2.stop();
      return t;
    });
    assert.ok(first < 50, `first paint ${first} ms`);
    const again = min(() => timed(
      () => paintSpell(lay, fakeG(), rect, st)));
    assert.ok(again < 5, `memo paint ${again} ms`);
    st.stop();
  });
  it('paintView draws it over the text, under the selection',
    async () => {
      const d = await mkDoc(p(r('teh fox')));
      const lay = laid(d), st = mkState(d), g = fakeG();
      const rect = {x0: 0, y0: 0, x1: W, y1: 600};
      paintView(lay, g, rect, null, true, {spell: st});
      assert.equal(waves(g).length, 1);
      const g2 = fakeG();
      paintView(lay, g2, rect, null, true, {spell: null});
      assert.equal(waves(g2).length, 0, 'off: none');
      paintView(lay, g2, rect, null, true);
      assert.equal(waves(g2).length, 0);
      st.stop();
    });
});

describe('the setting (./SpellBind)', () => {
  let frames, raf, caf;
  before(() => {
    frames = 0;
    raf = globalThis.requestAnimationFrame;
    caf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = () => ++frames;
    globalThis.cancelAnimationFrame = () => {};
  });
  after(() => {
    globalThis.requestAnimationFrame = raf;
    globalThis.cancelAnimationFrame = caf;
  });
  const fakeDw = async (choices) => {
    const d = await mkDoc(p(r('teh fox')));
    const app = {choices, docs: new Map(), dir: 'X'};
    const dw = {app, d, view: {spell: null}, closed: false,
      win: {isOpen: true, invalidate() { dw.inv = (dw.inv || 0) + 1; }}};
    app.docs.set('a', dw);
    return dw;
  };
  it('off: no state, no frame, nothing painted', async () => {
    const dw = await fakeDw({spell: false});
    frames = 0;
    assert.equal(syncSpell(dw), false);
    assert.equal(dw.spell, undefined);
    assert.equal(dw.view.spell, null);
    assert.equal(frames, 0);
  });
  it('attach waits for the choices: a saved off reads nothing',
    async () => {
      const dw = await fakeDw({});
      let go;
      dw.app.choicesReady = new Promise((res) => { go = res; });
      frames = 0;
      attachSpell(dw);
      assert.equal(dw.spell, null, 'not before the choices');
      dw.app.choices.spell = false;
      go();
      await dw.app.choicesReady;
      await null;
      assert.equal(dw.spell, null);
      assert.equal(dw.view.spell, null);
      assert.equal(frames, 0);
    });
  it('on starts it; off stops it; on again; close stops', async () => {
    const dw = await fakeDw({});
    frames = 0;
    dw.spell = new SpellState(dw, {dict, now: () => 0,
      raf: () => { frames++; return frames; }, caf: () => {}});
    assert.equal(syncSpell(dw), true);
    assert.equal(dw.view.spell, dw.spell);
    assert.ok(frames > 0, 'checking is scheduled');
    dw.app.choices.spell = false;
    syncSpell(dw);
    assert.equal(dw.view.spell, null);
    const n = frames;
    dw.d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'x'});
    assert.equal(frames, n, 'a change asks for no frame while off');
    dw.app.choices.spell = true;
    syncSpell(dw);
    assert.equal(dw.view.spell, dw.spell);
    assert.ok(frames > n);
    stopSpell(dw);
    assert.equal(dw.view.spell, null);
  });
  it('setSpell keeps the choice and every window follows',
    async () => {
      const dw = await fakeDw({});
      dw.spell = new SpellState(dw, {dict, raf: () => 0,
        caf: () => {}});
      syncSpell(dw);
      await setSpell(dw.app, false);
      assert.equal(dw.app.choices.spell, false);
      assert.equal(dw.view.spell, null);
      await setSpell(dw.app, true);
      assert.equal(dw.view.spell, dw.spell);
      stopSpell(dw);
    });
});
