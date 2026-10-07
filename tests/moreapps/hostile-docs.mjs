// Test-only: hostile and odd .docx documents for !Word's view, read
// with the real reader and laid out with a measurer whose cost grows
// with the text (as a canvas's does), and the sweeps that drive the
// selection over them. hostile-view.test.mjs runs the sweeps in a
// worker, so that a hang is stopped by a watchdog.
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import * as S from '../../tools/moreapps/!Word/Selection';
import {itemEnd} from '../../tools/moreapps/!Word/DocPos';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {rng} from './word-docs.mjs';

const TBL = '<w:tbl><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
const sect = (inner) => `<w:sectPr>${inner}</w:sectPr>`;
const LINK = '<w:hyperlink w:anchor="x"><w:r><w:t>a link here</w:t></w:r></w:hyperlink>';
const INLINES = LINK + '<w:r><w:tab/></w:r><w:bookmarkStart w:id="0" w:name="b"/>' +
  '<w:bookmarkEnd w:id="0"/><w:r><w:br/></w:r><w:proofErr w:type="spellStart"/>' +
  '<w:r><w:noBreakHyphen/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r>';
const MIXED = [
  p(r('Plain text, with words and spaces.')),
  p(''),
  p(r('Emoji \u{1F600}\u{1F469}‍\u{1F4BB} and flags \u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}\u{1F1E6} é x')),
  TBL,
  p(INLINES),
  p(r('中文字 한글 ' + 'long'.repeat(1500))),
  p(r('tab') + '<w:r><w:tab/><w:tab/></w:r>' + r('  spaced   out  ') + '<w:r><w:br/></w:r>' + r('   after')),
  p(Array.from({ length: 300 }, (_, i) => r(i % 2 ? 'b ' : 'a', i % 2 ? '<w:b/>' : '')).join('')),
  TBL,
  p(r('a' + '́'.repeat(3000) + ' b'), '<w:ind w:left="2000000000"/>'),
  p(r('centred '.repeat(30)), '<w:jc w:val="center"/>'),
  p(r('The end.')),
].join('');

/** The bodies of the hostile documents, by name. */
export const BODIES = {
  word: p(r('x'.repeat(100000))),
  runs: p(Array.from({ length: 50000 }, (_, i) => r(i % 3 ? 'ab' : 'c ', i % 2 ? '<w:b/>' : '')).join('')),
  tabs: p('<w:r>' + '<w:tab/>'.repeat(5000) + '</w:r>' + r('end')),
  indents: p(r('wide '.repeat(50)), '<w:ind w:left="2000000000" w:right="2000000000" w:firstLine="-2000000000"/>') +
    p(r('neg '.repeat(50)), '<w:ind w:left="-2000000000" w:right="-2000000000" w:hanging="2000000000"/>'),
  pageZero: p(r('a b c d e f')) + sect('<w:pgSz w:w="0" w:h="0"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"/>'),
  pageNeg: p(r('a b c d e f')) + sect('<w:pgSz w:w="-12000" w:h="-1"/><w:pgMar w:top="-1" w:right="-5000" w:bottom="-1" w:left="-5000"/>'),
  pageHuge: p(r('a b c d e f')) + sect('<w:pgSz w:w="1000000000" w:h="1000000000"/><w:pgMar w:top="1000000000" w:right="1" w:bottom="1" w:left="1000000000"/>'),
  pageNone: p(r('no section properties at all')),
  inlines: p(INLINES),
  opaqueEnds: TBL + p(r('middle')) + TBL,
  empty: '',
  mixed: MIXED,
};

/** The bytes of hostile document name. */
export const docxOf = (name) => buildDocx({ 'word/document.xml': documentXml(BODIES[name]) });

/** A measurer that looks at every character, as a canvas does. */
export function slowMeasure(t) {
  let w = 0;
  for (let i = 0; i < t.length; i++) w += 6 + (t.charCodeAt(i) & 3);
  return w;
}

/** {doc, L}: hostile document name, read and laid out. */
export async function laidOut(name, viewW = 800) {
  const doc = await readDocx(await docxOf(name));
  const L = new DocLayout(doc, new TextMetrics(slowMeasure));
  L.layout(viewW);
  return { doc, L };
}

const bounds = new WeakMap();
/** Whether pos is a valid caret place in L (problem text, or ''). */
export function badPos(L, doc, pos) {
  if (!pos || !Number.isInteger(pos.off)) return `bad ${JSON.stringify(pos)}`;
  const it = L.byId.get(pos.id);
  if (!it) return `no item ${pos.id}`;
  if (pos.off < 0 || pos.off > itemEnd(it)) return `off ${pos.off} out of range`;
  if (it.kind === 'p') {
    let b = bounds.get(it.block);
    if (!b) bounds.set(it.block, b = new Set(graphemes(it.block.text)));
    if (!b.has(pos.off)) return `off ${pos.off} not at a grapheme boundary`;
  }
  return '';
}

/** Problems with sel in L (Selection.clamp leaves it as it is). */
export function badSel(L, doc, sel) {
  if (!sel) return L.items.length ? 'no selection' : '';
  const why = badPos(L, doc, sel.anchor) || badPos(L, doc, sel.head);
  if (why) return why;
  const c = S.clamp(sel, doc, L);
  if (JSON.stringify([c.anchor, c.head]) !== JSON.stringify([sel.anchor, sel.head])) return 'clamp moves it';
  if (sel.affinity !== 'up' && sel.affinity !== 'down') return 'affinity';
  return '';
}

const CMDS = ['left', 'right', 'up', 'down', 'home', 'end', 'wordLeft', 'wordRight', 'paraStart',
  'paraEnd', 'docHome', 'docEnd', 'pageUp', 'pageDown'];
const XS = [-1e6, -1, 0, 30, 200, 700, 5000, 1e9, NaN, Infinity, -Infinity];

/** Timing of each call: {worst, what, calls}. */
function timer() {
  const t = { worst: 0, what: '', calls: 0, all: [] };
  t.run = (what, fn) => {
    const s = performance.now();
    const v = fn();
    const d = performance.now() - s;
    t.calls++;
    t.all.push(d);
    if (d > t.worst) { t.worst = d; t.what = what; }
    return v;
  };
  /** The 95th percentile of the calls' times (ms). */
  t.p95 = () => {
    const a = [...t.all].sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 0;
  };
  return t;
}

/** Up to n places spread over item it (ends, line ends, middles). */
function places(it, n = 12) {
  if (it.kind === 'box') return [0, 1];
  const out = new Set([0, itemEnd(it)]);
  for (const ln of it.lines.slice(0, n)) { out.add(ln.from); out.add(ln.to); }
  const len = itemEnd(it);
  for (let k = 1; k < n; k++) out.add(Math.floor(len * k / n));
  return [...out];
}

/**
 * Every command (with and without Shift) from places in each of the
 * first items, a few times over; clicks at extreme points; caret and
 * selection rectangles; words and paragraphs. -> {worst, what, calls,
 * bad: [first problems]}
 */
export async function sweep(name) {
  const { doc, L } = await laidOut(name);
  const t = timer(), bad = [];
  const note = (what, sel) => {
    const why = badSel(L, doc, sel);
    if (why && bad.length < 5) bad.push(`${what}: ${why}`);
  };
  const items = L.items.slice(0, 40);
  for (const it of items) {
    for (const off of places(it)) {
      // (a place inside a cluster snaps to its start)
      const pos = { id: it.id, off: L.locate({ id: it.id, off }).off };
      t.run('caretRect', () => L.caretRect(pos, 'up'));
      t.run('caretRect', () => L.caretRect(pos));
      t.run('selectWord', () => note('word', S.selectWord(L, pos)));
      t.run('selectPara', () => note('para', S.selectPara(L, pos)));
      for (const cmd of CMDS) {
        for (const ext of [false, true]) {
          let s = S.caret(pos);
          for (let k = 0; k < 4; k++) {
            s = t.run(cmd, () => S.move(s, L, cmd, ext, 400));
            note(cmd, s);
          }
          t.run('selectionRects', () => L.selectionRects(s));
        }
      }
    }
  }
  const ys = [...XS, L.height / 2, L.height - 30, L.height + 10];
  for (const x of XS) {
    for (const y of ys) {
      const h = t.run('hitTest', () => L.hitTest(x, y));
      if (h) note(`hit ${x},${y}`, S.caret(h.pos, h.affinity));
      else if (L.items.length) bad.push(`hit ${x},${y}: null`);
    }
  }
  const all = S.selectAll(L);
  if (all) {
    note('all', all);
    t.run('selectionRects', () => L.selectionRects(all));
    t.run('text', () => S.text(all, L));
  }
  return { worst: t.worst, what: t.what, calls: t.calls, p95: t.p95(), bad, items: L.items.length };
}

/**
 * 500 random sequences of keys and clicks (plain, Shift, double,
 * triple, extreme places) on the mixed document, from random
 * starts. -> {bad, steps, worst}
 */
export async function fuzz(seed = 1, n = 500) {
  const { doc, L } = await laidOut('mixed', 700);
  const rnd = rng(seed), bad = [];
  const t = timer();
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const coord = (max) => (rnd() < 0.15 ? pick(XS) : rnd() * max);
  let steps = 0;
  for (let q = 0; q < n; q++) {
    let s = S.selectAll(L);
    const len = 1 + Math.floor(rnd() * 12);
    for (let k = 0; k < len; k++, steps++) {
      const a = rnd();
      if (a < 0.6) {
        const cmd = pick(CMDS), ext = rnd() < 0.3;
        s = t.run(cmd, () => S.move(s, L, cmd, ext, 50 + rnd() * 600));
      } else {
        const h = t.run('hitTest', () => L.hitTest(coord(L.width + 200), coord(L.height + 100)));
        if (!h) { bad.push(`seq ${q}: no hit`); continue; }
        const b = rnd();
        s = b < 0.4 ? S.caret(h.pos, h.affinity) : b < 0.65 ? S.select(s.anchor, h.pos, h.affinity)
          : b < 0.85 ? S.selectWord(L, h.pos) : S.selectPara(L, h.pos);
      }
      const why = badSel(L, doc, s);
      if (why && bad.length < 5) bad.push(`seq ${q} step ${k}: ${why} ${JSON.stringify(s)}`);
      L.caretRect(s.head, s.affinity);
      L.selectionRects(s, L.caretRect(s.head).y - 300, L.caretRect(s.head).y + 300);
    }
  }
  return { bad, steps, worst: t.worst, what: t.what, p95: t.p95() };
}
