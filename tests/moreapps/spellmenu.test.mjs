// Spelling suggestions in the window's menu (Batch F3): the Menu
// button over a flagged word puts up to five suggestions, Ignore All
// and Add to Dictionary first in ./WinMenu windowMenu; anywhere else,
// or with spelling off, the menu is the one it always was. The
// caret and selection are not touched. ('riscos' replaced by a
// stand-in that has every name the application asks of it.)
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readdirSync, readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {buildDocx, documentXml, settingsXml, p, r}
  from './build-docx.mjs';
import {toLayout, toScreen} from '../../tools/moreapps/!Letters/Zoom';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {loadStyles, tm} from './word-docs.mjs';

const DIR = '../../tools/moreapps/!Letters/';
const names = new Set();
const ROOT = new URL('../../tools/moreapps/', import.meta.url);
for (const e of readdirSync(ROOT, {recursive: true,
  withFileTypes: true})) {
  if (!e.isFile() || e.name.endsWith('.png')) continue;
  const src = readFileSync(new URL(e.name, 'file://' + e.parentPath +
    '/'), 'latin1');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'riscos'/g)) {
    for (const n of m[1].split(',')) {
      const k = n.trim().split(/\s+as\s+/)[0];
      if (k) names.add(k);
    }
  }
}
globalThis.__smStub = {msgs: []};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__smStub;' +
  [...names].map((n) => (n === 'Menu'
    ? 'export class Menu {constructor(t, i) {this.title = t;' +
      ' this.items = i;}}'
    : n === 'reportError' ? 'export const reportError = (m) => ' +
      '{ s.msgs.push(m); };'
    : `export const ${n} = new Proxy(function () {}, ` +
      '{get: () => () => {}, apply: () => undefined});')).join('\n'));
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const {SpellState} = await import(DIR + 'SpellState');
const {windowMenu} = await import(DIR + 'WinMenu');
const {spellItems} = await import(DIR + 'SpellMenu');
const RT = await import(DIR + 'RevTrack');
const {Dict} = await import(DIR + 'SpellDict');

before(loadStyles);

const K = new Set(('the quick brown fox jumps over lazy dog hello ' +
  'world word is a test this and not valid it was here there ' +
  'text of in then ten tea').split(' '));
const dict = {has: (w) => K.has(w.toLowerCase()),
  tryChars: 'abcdefghijklmnopqrstuvwxyz'};
const mkDoc = async (body, extra = {}) => new Document(await readDocx(
  await buildDocx({'word/document.xml': documentXml(body), ...extra})));
const texts = (m) => m.items.map((i) => i.text);
const TBL = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  'w:w="4000"/></w:tblGrid><w:tr><w:tc>' + inner + '</w:tc></w:tr>' +
  '</w:tbl>';

/** A window-like object: document, layout, state, view. */
async function mkWin(body, o = {}) {
  const d = await mkDoc(body, o.extra || {});
  const L = new DocLayout(d.doc, tm());
  L.layout(1000);
  const dw = {d, app: {task: {}, choices: {}, docs: new Map()},
    isUntitled: false, viewName: 'print', leaf: 'x', doc: d.doc,
    markup: {}, boxes: {}};
  const spell = new SpellState(dw, {dict: o.dict || dict,
    now: () => 0, raf: () => 0, caf: () => {}});
  dw.spell = spell;
  const sel = {anchor: {id: L.items[0].id, off: 1},
    head: {id: L.items[0].id, off: 1}, affinity: 'down'};
  dw.view = {L, zoom: 1, mac: false, hdr: null, sel,
    spell: o.off ? null : spell, win: {invalidate() {}},
    typing: {command: (fn) => fn(), reset() {}},
    get hitAt() {
      return (x, y) => {                // (as ./EditView hitAt)
        const q = toLayout(x, y, this.zoom, this.L.top);
        return this.L.hitTest(q.x, q.y);
      };
    }};
  dw.real = d;
  return dw;
}
/** A Menu press at the middle of the range [from, to) of item i. */
function press(dw, from, to, i = 0, id) {
  const L = dw.view.L, it = id ? L.byId.get(id) : L.items[i];
  const b = L.selectionRects({anchor: {id: it.id, off: from},
    head: {id: it.id, off: to}})[0];
  return {button: 'menu', x: b.x + b.w / 2, y: b.y + b.h / 2};
}
/** press, as a window point at zoom z (the work area scrolled by
 *  (sx, sy): the Wimp's x, y are in the work area, scroll not
 *  removed). */
function pressAt(dw, from, to, z, i = 0) {
  const e = press(dw, from, to, i), L = dw.view.L;
  dw.view.zoom = z;
  return {...e, ...toScreen(e.x, e.y, z, L.top)};
}
const textOf = (dw, k = 0) => dw.d.doc.sections[0].blocks[k].text;

const LONG = Array.from({length: 200}, (_, i) =>
  p(r(`line ${i} the teh fox`))).join('');
const COLS2 = '<w:sectPr><w:cols w:num="2" w:space="720"/></w:sectPr>';

/** A window laid out as Print layout places it (pages, margins). */
async function printWin(body, sect = '') {
  const dw = await mkWin(body + sect);
  const L = dw.view.L;
  L.place = PlacePrint(L, new Pages(galleyOf(L)).finish());
  return dw;
}
/** A Menu press on the 'teh' of the paragraph starting with t. */
function pressWord(dw, t) {
  const L = dw.view.L;
  const it = L.flow.find((i) => i.block && i.block.text.startsWith(t));
  assert.ok(it, t);
  const off = it.block.text.indexOf('teh');
  const b = L.selectionRects({anchor: {id: it.id, off},
    head: {id: it.id, off: off + 3}})[0];
  return {button: 'menu', x: b.x + b.w / 2, y: b.y + b.h / 2};
}

describe('Menu button: where the point is', () => {
  const BODY = Array.from({length: 40}, (_, i) =>
    p(r(`line ${i} the teh fox`))).join('');
  it('zoom 1.5: the point is scaled back', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const plain = texts(windowMenu(dw));
    const t = texts(windowMenu(dw, pressAt(dw, 4, 7, 1.5)));
    assert.ok(t.includes('Ignore All'), t.join());
    // (the unscaled point is elsewhere: another word, not teh)
    const z = {...pressAt(dw, 0, 3, 1.5)};
    assert.deepEqual(texts(windowMenu(dw, z)), plain);
  });
  it('a word far down the page, zoomed', async () => {
    const dw = await mkWin(BODY);
    for (const z of [1, 1.5, 0.5]) {
      const ev = pressAt(dw, 13, 16, z, 30);
      const t = texts(windowMenu(dw, ev));
      assert.ok(t.includes('Ignore All'), z + ' ' + t.join());
      windowMenu(dw, ev).items[0].action();
      assert.equal(textOf(dw, 30).includes('teh'), false);
      dw.d.undo();
      dw.view.L = new DocLayout(dw.d.doc, tm());
      dw.view.L.layout(1000);
    }
  });
  it('a scrolled window: the point is in the work area', async () => {
    // (a word on a later page: its y is far below the first screen,
    // so a window-relative point could not reach it)
    const ONE = Array.from({length: 200}, (_, i) => p(r(i === 150
      ? 'line 150 the teh fox' : `line ${i} the quick fox`))).join('');
    const dw = await printWin(ONE);
    const ev = pressWord(dw, 'line 150 the teh');
    assert.ok(ev.y > 1200, 'far down: ' + ev.y);
    assert.ok(texts(windowMenu(dw, ev)).includes('Ignore All'));
    const rel = {...ev, y: ev.y - 1000};      // (scrolled by 1000)
    assert.deepEqual(texts(windowMenu(dw, rel)),
      texts(windowMenu(dw)));
  });
  it('page view: margins and a centred page', async () => {
    const dw = await printWin(LONG);
    const ev = pressWord(dw, 'line 5 the teh');
    assert.ok(ev.x > 100, 'the page starts well in: ' + ev.x);
    assert.ok(texts(windowMenu(dw, ev)).includes('Ignore All'));
    const left = {button: 'menu', x: 5, y: ev.y};
    assert.deepEqual(texts(windowMenu(dw, left)), texts(windowMenu(dw)));
  });
  it('two columns: a word in each column', async () => {
    const dw = await printWin(LONG, COLS2);
    const a = pressWord(dw, 'line 5 the teh');
    const L = dw.view.L;
    // (the first paragraph whose box is well right of the first's)
    const hits = L.flow.filter((i) => i.block && /teh/.test(i.block.text))
      .map((i) => ({i, b: L.selectionRects({anchor: {id: i.id, off: 13},
        head: {id: i.id, off: 16}})[0]}));
    const right = hits.find((h) => h.b && h.b.x > a.x + 150);
    assert.ok(right, 'layout has 2 columns');
    const ev = {button: 'menu', x: right.b.x + right.b.w / 2,
      y: right.b.y + right.b.h / 2};
    assert.ok(texts(windowMenu(dw, ev)).includes('Ignore All'));
    assert.ok(texts(windowMenu(dw, a)).includes('Ignore All'));
  });
});

describe('Menu button over a flagged word', () => {
  it('suggestions first, the usual items after, one call', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const plain = texts(windowMenu(dw));
    const m = windowMenu(dw, press(dw, 4, 7));
    const t = texts(m);
    const n = t.indexOf('Ignore All');
    assert.ok(n >= 1 && n <= 6, t.join());
    assert.ok(t.slice(0, n).includes('the'), t.join());
    assert.equal(t[n + 1], 'Add to Dictionary');
    assert.ok(m.items[n + 1].dotted);
    assert.deepEqual(t.slice(n + 2), plain);
    assert.equal(m.items.slice(0, n).filter((i) => i.shaded).length, 0);
  });
  it('a suggestion fixes the word in ONE undo step', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const m = windowMenu(dw, press(dw, 4, 7));
    const k = m.items.findIndex((i) => i.text === 'the');
    m.items[k].action();
    assert.equal(textOf(dw), 'the the fox');
    dw.d.undo();
    assert.equal(textOf(dw), 'the teh fox');
  });
  it('(no suggestions) is shaded, Ignore All still there', async () => {
    const dw = await mkWin(p(r('the zzqxjvkw fox')));
    const m = windowMenu(dw, press(dw, 4, 12));
    assert.equal(m.items[0].text, '(no suggestions)');
    assert.ok(m.items[0].shaded);
    assert.equal(m.items[1].text, 'Ignore All');
    assert.equal(m.items[2].text, 'Add to Dictionary');
  });
  it('Ignore All stops the flag', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const m = windowMenu(dw, press(dw, 4, 7));
    m.items.find((i) => i.text === 'Ignore All').action();
    const q = dw.d.doc.sections[0].blocks[0];
    assert.equal(dw.spell.flagsAt(q, 5), null);
  });
  it('a correct word, empty space, a line end: unchanged', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const plain = texts(windowMenu(dw));
    assert.deepEqual(texts(windowMenu(dw, press(dw, 0, 3))), plain);
    assert.deepEqual(texts(windowMenu(dw, press(dw, 8, 11))), plain);
    const L = dw.view.L;
    const far = {button: 'menu', x: 900, y: L.items[0].y + 5};
    assert.deepEqual(texts(windowMenu(dw, far)), plain);
    const above = {button: 'menu', x: 10, y: -500};
    assert.deepEqual(texts(windowMenu(dw, above)), plain);
    assert.deepEqual(texts(windowMenu(dw, {button: 'menu'})), plain);
  });
  it('beside a flagged word at the line end: unchanged', async () => {
    const dw = await mkWin(p(r('the teh')));
    const e = press(dw, 4, 7);
    assert.ok(texts(windowMenu(dw, e)).includes('Ignore All'));
    const b = dw.view.L.selectionRects({anchor: {id:
      dw.view.L.items[0].id, off: 4}, head: {id: dw.view.L.items[0].id,
      off: 7}})[0];
    const out = {button: 'menu', x: b.x + b.w + 60, y: e.y};
    assert.deepEqual(texts(windowMenu(dw, out)), texts(windowMenu(dw)));
  });
  it('spelling off, or no dictionary: unchanged', async () => {
    const off = await mkWin(p(r('the teh fox')), {off: true});
    assert.deepEqual(texts(windowMenu(off, press(off, 4, 7))),
      texts(windowMenu(off)));
    const dw = await mkWin(p(r('the teh fox')));
    const ev = press(dw, 4, 7);
    dw.spell.dictReady = false;
    assert.deepEqual(texts(windowMenu(dw, ev)), texts(windowMenu(dw)));
  });
  it('caret and selection are not moved', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const sel = dw.view.sel, was = JSON.stringify(sel);
    windowMenu(dw, press(dw, 4, 7)).items[0].action();
    assert.equal(dw.view.sel, sel);
    assert.equal(JSON.stringify(dw.view.sel), was);
  });
  it('the word being typed has no spelling items', async () => {
    const dw = await mkWin(p(r('the ')));
    const typ = (at, ins) => dw.d.apply({op: 'replaceText',
      block: [0, 0], at, del: 0, ins});
    typ(4, 't');
    typ(5, 'e');
    typ(6, 'h');
    const q = dw.d.doc.sections[0].blocks[0];
    dw.spell.setCaret(q, 7);
    dw.spell.ensure([q]);
    assert.deepEqual(dw.spell.flagsOf(q), []);
    dw.view.L = new DocLayout(dw.d.doc, tm());
    dw.view.L.layout(1000);
    assert.deepEqual(spellItems(dw, press(dw, 4, 7)), []);
  });
  it('a word in a table cell', async () => {
    const dw = await mkWin(TBL(p(r('the teh fox'))));
    const L = dw.view.L;
    const id = [...L.byId.keys()].find((k) => L.byId.get(k).block &&
      L.byId.get(k).block.text === 'the teh fox');
    const t = texts(windowMenu(dw, press(dw, 4, 7, 0, id)));
    assert.ok(t.includes('Ignore All') && t[0] !== 'Save', t.join());
  });
  it('Track Changes on: the fix is a tracked change', async () => {
    const dw = await mkWin(p(r('the teh fox')), {extra: {
      'word/settings.xml': settingsXml('<w:trackRevisions/>')}});
    assert.ok(RT.on(dw.d));
    const m = windowMenu(dw, press(dw, 4, 7));
    m.items.find((i) => i.text === 'the').action();
    const x = dw.d.doc.sections[0].blocks[0];
    assert.ok(x.text.includes('teh') && x.text.includes('the'), x.text);
    assert.equal(x.text, 'the tehthe fox');
    assert.ok(RT.session(dw.d), 'a session');
  });
  it('Latin-1 only: others dropped, curly apostrophe shown straight',
    async () => {
      const d2 = {has: (w) => ['don\u2019t', 'caf\u00e9', 'caf\u0113']
        .includes(w), tryChars: 'abcdefghijklmnopqrstuvwxyz' +
        '\u00e9\u0113\u2019'};
      const dw = await mkWin(p(r('cafe dont fox')), {dict: d2});
      const m = windowMenu(dw, press(dw, 0, 4));
      const t = texts(m);
      assert.ok(t.includes('caf\u00e9'), t.join());
      assert.ok(!t.some((x) => x.includes('\u0113')), t.join());
      const m2 = windowMenu(dw, press(dw, 5, 9));
      const t2 = texts(m2);
      assert.ok(t2.includes("don't"), t2.join());
      assert.ok(!t2.some((x) => x.includes('\u2019')), t2.join());
      m2.items[t2.indexOf("don't")].action();
      assert.equal(textOf(dw), 'cafe don\u2019t fox');
    });
  it('at most five suggestions, though there are eight', async () => {
    const W8 = ['cat', 'hat', 'mat', 'rat', 'sat', 'pat', 'vat', 'fat'];
    const d8 = {has: (w) => w === 'the' || W8.includes(w),
      tryChars: 'abcdefghijklmnopqrstuvwxyz'};
    const {suggest} = await import(DIR + 'SpellSuggest');
    assert.ok(suggest(d8, 'bat', 8).length >= 8);
    const dw = await mkWin(p(r('the bat')), {dict: d8});
    const t = texts(windowMenu(dw, press(dw, 4, 7)));
    const n = t.indexOf('Ignore All');
    assert.equal(n, 5, t.join());
    for (const x of t.slice(0, 5)) assert.ok(W8.includes(x), x);
  });
  it('header / note modes: no spelling items', async () => {
    const dw = await mkWin(p(r('the teh fox')));
    const ev = press(dw, 4, 7);
    dw.view.hdr = {};
    assert.deepEqual(spellItems(dw, ev), []);
  });
  it('suggest runs once per menu, none while it is not built',
    async () => {
      const dw = await mkWin(p(r('the teh fox')));
      let n = 0;
      const real = dw.spell.dict;
      Object.defineProperty(dw.spell, 'dict', {get: () => {
        n++;
        return real;
      }});
      const ev = press(dw, 4, 7);
      assert.equal(n, 0);
      windowMenu(dw, ev);
      assert.equal(n, 1);
      windowMenu(dw, press(dw, 0, 3));
      assert.equal(n, 1);
    });
});
