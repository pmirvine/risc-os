// The comments drawn in the text (Batch F1, Display): ./CommentPaint
// rects, the range between a comment's start and end lit in its
// author's colour (resolved lighter, the selected comment stronger),
// a point comment's small marker at its reference, from the layout's
// own line boxes (L.selectionRects, L.caretRect) and only what the
// band shows; ./EditPaint paintView fills them, multiplied, in
// Draft, Print layout, Outline and Web; nothing moves.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintView} from '../../tools/moreapps/!Letters/EditPaint';
import {rects, paintComments, colourOf, fillOf, PALETTE, NONE,
  MARK_W, MARK_H, stats}
  from '../../tools/moreapps/!Letters/CommentPaint';
import {stats as markStats}
  from '../../tools/moreapps/!Letters/CommentMarks';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {caret} from '../../tools/moreapps/!Letters/Selection';
import {setResolved} from '../../tools/moreapps/!Letters/CommentCmd';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {commentDoc, commentParts, cs, ce, cr, range}
  from './comment-fixtures.mjs';

before(loadStyles);

const W = 1000;
const laid = (doc) => {
  const L = new DocLayout(doc, tm());
  L.layout(W);
  return L;
};
const para = (doc, k = 0) => doc.sections[0].blocks[k];
const pos = (b, off) => ({id: b.id, off});
const offOf = (b, kind, id) => Number(Object.keys(b.inlines)
  .find((k) => b.inlines[k].kind === kind && b.inlines[k].id === id));
const LONG = 'word '.repeat(60);           // (wraps: 300 chars)

/** A fake 2D context recording what is drawn. */
function fakeG() {
  const calls = [];
  const g = {calls, fillStyle: '', globalCompositeOperation:
    'source-over', font: '', textBaseline: '', strokeStyle: '',
  lineWidth: 1};
  for (const n of ['save', 'restore', 'fillText', 'strokeRect',
    'beginPath', 'rect', 'clip', 'translate', 'scale', 'moveTo',
    'lineTo', 'stroke', 'setLineDash']) {
    g[n] = (...a) => calls.push([n, ...a]);
  }
  g.fillRect = (...a) => calls.push(['fillRect', g.fillStyle,
    g.globalCompositeOperation, ...a]);
  g.measureText = (t) => ({width: 8 * String(t).length});
  return g;
}

/** Print layout's placement on L (every page worked out). */
function print(L) {
  const P = new Pages(printGalley(L));
  L.place = PlacePrint(L, P);
  P.finish();
  return P;
}

describe('CommentPaint rects: the range lit', () => {
  it('a range inside one line: one rect over its text, the ' +
    'selection\'s box for the same span', async () => {
    const doc = await commentDoc(p(r('aa') + range(1, r('bbbb')) +
      r('cc')), {1: 'one'});
    const L = laid(doc), b = para(doc);
    const out = rects(doc, {L});
    assert.equal(out.length, 1);
    const [c] = out;
    assert.equal(c.id, 1);
    assert.equal(c.point, false);
    assert.equal(c.resolved, false);
    assert.equal(c.selected, false);
    assert.equal(c.rects.length, 1);
    const want = L.selectionRects({anchor: pos(b, offOf(b, 'cmtStart',
      1)), head: pos(b, offOf(b, 'cmtEnd', 1))});
    assert.deepEqual(c.rects, want);
    // the marks draw nothing: the box is the four b's (8 px each)
    assert.equal(c.rects[0].w, 32);
    const x0 = L.caretRect(pos(b, 2)).x;
    assert.equal(c.rects[0].x, x0);
    assert.equal(c.fill, PALETTE[colourOf('Ann')].soft);
  });

  it('a range across lines: a rect on each line it covers',
    async () => {
      const doc = await commentDoc(p(r('aa') + cs(1) + r(LONG) +
        ce(1) + cr(1)), {1: 'one'});
      const L = laid(doc), it = L.items[0];
      assert.ok(it.lines.length >= 3, 'wraps');
      const [c] = rects(doc, {L});
      assert.equal(c.rects.length, it.lines.length);
      const ys = c.rects.map((x) => x.y);
      assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
      assert.equal(new Set(ys).size, ys.length);
    });

  it('a range across paragraphs: rects in each, the first one\'s ' +
    'end mark too', async () => {
    const doc = await commentDoc(p(r('one ') + cs(4) + r('two')) +
      p(r('mid')) + p(r('three') + ce(4) + cr(4) + r(' four')),
    {4: 'across'});
    const L = laid(doc);
    const [c] = rects(doc, {L});
    const ys = new Set(c.rects.map((x) => x.y));
    for (const it of L.items) {
      assert.ok(ys.has(it.y + it.lines[0].y), 'paragraph ' + it.index);
    }
    // the paragraph mark's stub where a crossed paragraph ends
    assert.ok(c.rects.some((x) => x.w === 6));
  });

  it('a point comment: a small marker at its reference, no range',
    async () => {
      const doc = await commentDoc(p(r('ab') + cr(3) + r('cd')) +
        p(r('ef') + cs(5) + ce(5) + cr(5) + r('gh')),
      {3: 'ref only', 5: 'empty range'});
      const L = laid(doc);
      const out = rects(doc, {L});
      assert.deepEqual(out.map((c) => [c.id, c.point]),
        [[3, true], [5, true]]);
      for (const [k, c] of out.entries()) {
        const b = para(doc, k), at = offOf(b, 'cmtRef', c.id);
        const cr0 = L.caretRect(pos(b, at));
        assert.equal(c.rects.length, 1);
        const m = c.rects[0];
        assert.equal(m.w, MARK_W);
        assert.equal(m.h, MARK_H);
        assert.equal(m.y, Math.round(cr0.y));
        assert.ok(Math.abs(m.x + MARK_W / 2 - cr0.x) <= 1, 'centred');
        assert.equal(c.fill, fillOf('Ann', false, false, true));
      }
    });

  it('a document with no comments: nothing, no work, nothing made',
    async () => {
      const doc = await commentDoc(p(r('plain')) + p(r('text')));
      const L = laid(doc);
      const m0 = markStats.paras, s0 = stats.built;
      const a = rects(doc, {L}), b = rects(doc, {L, y0: 0, y1: 500});
      assert.equal(a, NONE);
      assert.equal(b, NONE);
      assert.ok(Object.isFrozen(NONE));
      assert.equal(markStats.paras, m0, 'no paragraph scanned');
      assert.equal(stats.built, s0, 'no entries built');
      const g = fakeG();
      paintComments(L, g, {x0: 0, y0: 0, x1: W, y1: 2000}, null);
      assert.equal(g.calls.length, 0, 'nothing drawn, no save');
      // a Doc with no comments field at all (made elsewhere)
      const bare = {...doc};
      delete bare.comments;
      assert.equal(rects(bare, {L}), NONE);
    });

  it('marks naming no comment, a lone start and opaque marks (a ' +
    'header) draw nothing', async () => {
    const c = commentParts({1: 'one', 3: 'three'});
    const doc = await readDocx(await withHeaders(
      p(r('a') + range(2, r('b'))) + p(r('c') + cs(1) + r('d')),
      {default: p(range(3, r('h')))}, {parts: c.parts,
        docRels: c.docRels}));
    const L = laid(doc);
    assert.equal(rects(doc, {L}).length, 0);
  });
});

describe('CommentPaint rects: colours', () => {
  it('the author\'s colour: one of six, by the name, the same each ' +
    'time', () => {
    assert.equal(PALETTE.length, 6);
    for (const e of PALETTE) {
      for (const k of ['soft', 'light', 'strong']) {
        assert.match(e[k], /^#[0-9a-f]{6}$/);
      }
    }
    const names = ['Ann', 'Bob', 'Carla', 'Dmitri', '', 'Zo\u00eb',
      'A very long name '.repeat(20)];
    for (const n of names) {
      const k = colourOf(n);
      assert.ok(Number.isInteger(k) && k >= 0 && k < 6, n);
      assert.equal(colourOf(n), k);
    }
    assert.equal(colourOf(undefined), colourOf(''));
    const seen = new Set(['Ann', 'Bob', 'Carla', 'Dmitri', 'Eve',
      'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'].map(colourOf));
    assert.ok(seen.size >= 3, 'names spread over the palette');
  });

  it('lighter when resolved (not over white: paler than soft), ' +
    'stronger when selected', () => {
    const sum = (h) => [1, 3, 5].reduce((s, k) =>
      s + parseInt(h.slice(k, k + 2), 16), 0);
    for (const e of PALETTE) {
      assert.ok(sum(e.light) > sum(e.soft), e.light);
      assert.ok(sum(e.strong) < sum(e.soft), e.strong);
    }
    assert.equal(fillOf('Ann', false, false),
      PALETTE[colourOf('Ann')].soft);
    assert.equal(fillOf('Ann', true, false),
      PALETTE[colourOf('Ann')].light);
    assert.equal(fillOf('Ann', true, true),
      PALETTE[colourOf('Ann')].strong);
    // a point marker one step up
    assert.equal(fillOf('Ann', false, false, true),
      PALETTE[colourOf('Ann')].strong);
    assert.equal(fillOf('Ann', true, false, true),
      PALETTE[colourOf('Ann')].soft);
  });

  it('resolved, selected and each author\'s colour in rects',
    async () => {
      const doc = await commentDoc(p(range(1, r('aa')) + r(' ') +
        range(2, r('bb')) + r(' ') + range(3, r('cc'))),
      {1: {text: 'x', author: 'Ann'}, 2: {text: 'y', author: 'Bob',
        done: true}, 3: {text: 'z', author: 'Carla'}});
      const L = laid(doc);
      const by = (sel) => new Map(rects(doc, {L, sel})
        .map((c) => [c.id, c]));
      const a = by(null);
      assert.equal(a.get(1).fill, fillOf('Ann', false, false));
      assert.equal(a.get(2).resolved, true);
      assert.equal(a.get(2).fill, fillOf('Bob', true, false));
      assert.equal(a.get(3).fill, fillOf('Carla', false, false));
      assert.ok([...a.values()].every((c) => !c.selected));
      const s = by(3);
      assert.equal(s.get(3).selected, true);
      assert.equal(s.get(3).fill, fillOf('Carla', false, true));
      assert.equal(s.get(1).selected, false);
      assert.equal(by(2).get(2).fill, fillOf('Bob', true, true));
      // an id naming nothing selects nothing
      assert.ok(rects(doc, {L, sel: 99}).every((c) => !c.selected));
    });

  it('a thread is drawn once, in its first comment\'s colour; ' +
    'selecting a reply selects it', async () => {
      const doc = await commentDoc(p(cs(1) + cs(2) + r('both') +
        ce(1) + ce(2) + cr(1) + cr(2)),
      {1: {text: 'q', author: 'Ann'}, 2: {text: 'a', author: 'Bob',
        parent: 1}});
      const L = laid(doc);
      const out = rects(doc, {L});
      assert.deepEqual(out.map((c) => c.id), [1]);
      assert.equal(out[0].fill, fillOf('Ann', false, false));
      assert.equal(rects(doc, {L, sel: 2})[0].selected, true);
    });

  it('a reply whose parent has no marks is drawn itself', async () => {
    const doc = await commentDoc(p(range(2, r('only'))),
      {1: {text: 'q'}, 2: {text: 'a', author: 'Bob', parent: 1}});
    const L = laid(doc);
    assert.deepEqual(rects(doc, {L}).map((c) => c.id), [2]);
  });
});

describe('CommentPaint: only what the band shows', () => {
  const many = async (n, per = 5) => {
    let body = '';
    const cm = {};
    for (let k = 0; k < n; k += per) {
      let s = '';
      for (let j = k; j < Math.min(n, k + per); j++) {
        s += range(j, r('w' + j)) + r(' ');
        cm[j] = {text: 'c', author: 'A' + (j % 7)};
      }
      body += p(s);
    }
    return commentDoc(body, cm);
  };

  it('a band: the comments on its lines only', async () => {
    const doc = await many(200);
    const L = laid(doc);
    const all = rects(doc, {L});
    assert.equal(all.length, 200);
    const it = L.items[10], y0 = it.y, y1 = it.y + it.h - 1;
    const some = rects(doc, {L, y0, y1});
    assert.deepEqual(some.map((c) => c.id), [50, 51, 52, 53, 54]);
    for (const c of some) {
      for (const x of c.rects) {
        assert.ok(x.y + x.h > y0 && x.y <= y1, JSON.stringify(x));
      }
    }
  });

  it('10,000 comments: the first paint of a layout linear, a band ' +
    'after it costs what it shows (1,000 vs 10,000)', async () => {
    const time = async (n) => {
      const doc = await many(n);
      const L = laid(doc);
      const it = L.items[2];
      const ctx = {L, y0: it.y, y1: it.y + it.h - 1};
      const t0 = performance.now();
      rects(doc, ctx);                  // (entries built and located)
      const first = performance.now() - t0;
      let best = Infinity;
      for (let k = 0; k < 5; k++) {
        const t1 = performance.now();
        for (let j = 0; j < 20; j++) rects(doc, ctx);
        best = Math.min(best, performance.now() - t1);
      }
      assert.equal(rects(doc, ctx).length, 5);
      return {first, best};
    };
    await time(200);
    const a = await time(1000), b = await time(10000);
    assert.ok(b.first / Math.max(a.first, 2) < 40,
      'first ' + (b.first / a.first).toFixed(1));
    // (the same five comments shown: not ten times the work; a scan
    // of every entry measured 19 times)
    assert.ok(b.best / Math.max(a.best, 1) < 6,
      'band ' + (b.best / a.best).toFixed(1));
  });
});

describe('CommentPaint: Print layout and painting', () => {
  it('Print layout: the boxes where the pages put the lines',
    async () => {
      let body = '';
      for (let k = 0; k < 80; k++) body += p(r('line ' + k));
      body += p(r('xx') + range(7, r('on page two')) + r('yy'));
      const doc = await commentDoc(body, {7: 'late'});
      const L = laid(doc);
      const draft = rects(doc, {L})[0].rects;
      const P = print(L);
      assert.ok(P.count >= 2);
      const b = doc.sections[0].blocks[80];
      const sel = {anchor: pos(b, offOf(b, 'cmtStart', 7)),
        head: pos(b, offOf(b, 'cmtEnd', 7))};
      const [c] = rects(doc, {L});
      assert.deepEqual(c.rects, L.selectionRects(sel));
      assert.notDeepEqual(c.rects, draft, 'moved onto its page');
      const y = c.rects[0].y;
      assert.equal(rects(doc, {L, y0: y - 2, y1: y + 2}).length, 1);
      assert.equal(rects(doc, {L, y0: 0, y1: 300}).length, 0);
    });

  it('paintView fills them multiplied, the selection after them; ' +
    'no change to the text drawn', async () => {
    const doc = await commentDoc(p(r('aa') + range(1, r('bbbb')) +
      r('cc')), {1: {text: 'one', author: 'Ann'}});
    const L = laid(doc);
    const rect = {x0: 0, y0: 0, x1: W, y1: 1200};
    const g = fakeG();
    paintView(L, g, rect, null, true, {comment: 1});
    const fills = g.calls.filter((c) => c[0] === 'fillRect' &&
      c[1] === fillOf('Ann', false, true));
    assert.equal(fills.length, 1);
    assert.equal(fills[0][2], 'multiply');
    const box = rects(doc, {L, sel: 1})[0].rects[0];
    assert.deepEqual(fills[0].slice(3), [box.x, box.y, box.w, box.h]);
    // the text: exactly as a copy with no comment draws it
    // (the runs may cut the text in other places: its characters at
    // the same x, 8 px each)
    const text = (gg) => gg.calls.filter((c) => c[0] === 'fillText')
      .flatMap((c) => [...c[1]].map((ch, k) => [ch, c[2] + 8 * k,
        c[3]]));
    const plain = await commentDoc(p(r('aabbbbcc')));
    const g2 = fakeG();
    paintView(laid(plain), g2, rect, null, true, {});
    assert.deepEqual(text(g), text(g2));
  });
});

describe('CommentPaint: after edits, in Outline, the layout as it was',
  () => {
    it('typing before a range moves it; resolving lightens it ' +
      '(new entries each time)', async () => {
      const d = new Document(await commentDoc(p(r('aa') +
        range(1, r('bbbb')) + r('cc')),
      {1: {text: 'x', author: 'Ann'}}));
      const t = new Typing(d);
      const L0 = laid(d.doc);
      const [a] = rects(d.doc, {L: L0});
      const b = para(d.doc);
      t.type(caret(pos(b, 0)), 'zz');
      const L1 = laid(d.doc);
      const [c] = rects(d.doc, {L: L1});
      assert.equal(c.rects[0].x, a.rects[0].x + 16);
      assert.equal(c.rects[0].w, a.rects[0].w);
      assert.equal(c.resolved, false);
      assert.equal(setResolved(d, t, 1, true), true);
      const [e] = rects(d.doc, {L: laid(d.doc)});
      assert.equal(e.resolved, true);
      assert.equal(e.fill, fillOf('Ann', true, false));
      d.undo();
      assert.equal(rects(d.doc, {L: laid(d.doc)})[0].resolved, false);
    });

    it('Outline: a comment under a collapsed heading draws nothing',
      async () => {
        const H = (t) => p(r(t), '<w:pStyle w:val="Heading1"/>');
        const doc = await commentDoc(H('Head') + p(range(1, r('in'))) +
          H('Next') + p(range(2, r('out'))), {1: 'one', 2: 'two'});
        const lay = (ks) => {
          const set = new Set(ks.map((k) => para(doc, k).id));
          const L = new DocLayout(doc, tm(), null, {outline: set});
          L.layout(900);
          return L;
        };
        assert.deepEqual(rects(doc, {L: lay([])}).map((c) => c.id),
          [1, 2]);
        assert.deepEqual(rects(doc, {L: lay([0])}).map((c) => c.id),
          [2]);
      });

    it('the layout is not changed by working the boxes out',
      async () => {
        const doc = await commentDoc(p(r('aa') + range(1, r(LONG))) +
          p(r('b') + cr(2)), {1: 'one', 2: 'two'});
        const L = laid(doc);
        const P = print(L);
        const keys = Object.keys(L).sort(), items = L.items;
        const lines = L.items.map((it) => it.lines);
        const n = P.count, list = P.list;
        rects(doc, {L});
        rects(doc, {L, y0: 0, y1: 400, sel: 1});
        paintComments(L, fakeG(), {x0: 0, y0: 0, x1: W, y1: 3000}, 2);
        assert.deepEqual(Object.keys(L).sort(), keys);
        assert.equal(L.items, items);
        assert.ok(L.items.every((it, k) => it.lines === lines[k]));
        assert.equal(P.count, n);
        assert.equal(P.list, list);
      });
  });

describe('nothing moves: lines and pages as with no comments', () => {
  it('line boxes and page starts the same as the text without its ' +
    'marks', async () => {
    let body = '', bare = '';
    const cm = {};
    for (let k = 0; k < 120; k++) {
      const t = (k % 3 ? 'some words ' : LONG) + k;
      if (k % 4 === 0) {
        body += p(r('a ') + range(k, r(t)) + r(' z'));
        cm[k] = {text: 'c' + k, author: 'N' + k};
      } else if (k % 4 === 1) {
        body += p(r('a ') + cr(k) + r(t) + r(' z'));
        cm[k] = 'pt';
      } else body += p(r('a ') + r(t) + r(' z'));
      bare += p(r('a ') + r(t) + r(' z'));
    }
    const doc = await commentDoc(body, cm);
    const plain = await commentDoc(bare);
    const shape = (L) => L.items.map((it) => [it.y, it.h,
      it.lines.map((l) => [l.y, l.h, l.items.reduce((s, x) =>
        s + x.w, 0)])]);
    const La = laid(doc), Lb = laid(plain);
    assert.deepEqual(shape(La), shape(Lb));
    assert.ok(rects(doc, {L: La}).length > 0);
    const starts = (L) => {
      const P = print(L);
      return Array.from({length: P.count}, (_, i) => {
        const pg = P.at(i);
        return [pg.start.k, pg.start.line, pg.start.dy ?? 0, pg.top,
          pg.h];
      });
    };
    assert.deepEqual(starts(La), starts(Lb));
    assert.deepEqual(shape(La), shape(Lb), 'and after paginating');
  });
});
