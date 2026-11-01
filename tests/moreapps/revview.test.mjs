// The markup views (Batch F2, Display): ./RevView (Final, the default:
// deletions hidden; Original: insertions hidden; All Markup: both
// shown and taking space), the one place runs become line tokens
// (./LineTokens), the keys and the selection never inside hidden
// text, Find, the word count, Info, Change Case and the clipboard's
// plain text following the view, and ./RevPaint drawing All Markup
// in the author's colour (./AuthorColour, the comments' palette)
// with a change bar. Final lays out as the raw w:del did; a document
// without revisions pays nothing.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {deleteBack, deleteForward}
  from '../../tools/moreapps/!Letters/EditDel';
import {search, count as findCount}
  from '../../tools/moreapps/!Letters/Find';
import {count as wordCount}
  from '../../tools/moreapps/!Letters/WordCount';
import {facts} from '../../tools/moreapps/!Letters/Info';
import {changeCase} from '../../tools/moreapps/!Letters/ChangeCase';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {visible, hides, modeOf, isMode, MODES, setMarkup, shownSel}
  from '../../tools/moreapps/!Letters/RevView';
import {marks, NONE, BAR, BAR_GAP}
  from '../../tools/moreapps/!Letters/RevPaint';
import {colourOf as cColour, fillOf}
  from '../../tools/moreapps/!Letters/CommentPaint';
import {colourOf, inkOf, INK, PALETTE}
  from '../../tools/moreapps/!Letters/AuthorColour';
import {paintView} from '../../tools/moreapps/!Letters/EditPaint';
import {hiddenSpans} from '../../tools/moreapps/!Letters/Kinds';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {buildDocx, documentXml} from './build-docx.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {tbl as tblOf, tr, tc as tcOf} from './tbl-fixtures.mjs';

before(loadStyles);

const D = '2024-01-02T03:04:00Z';
const att = (id, au) => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) + ` w:date="${D}"`;
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, rPr = '', tag = 'w:t') =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<${tag}${sp(t)}>${t}` +
  `</${tag}></w:r>`;
const dRun = (t) => run(t, '', 'w:delText');
const el = (name, id, inner, au = 'Ann') =>
  `<w:${name} ${att(id, au)}>${inner}</w:${name}>`;
const ins = (id, t, au) => el('ins', id, run(t), au);
const del = (id, t, au) => el('del', id, dRun(t), au);
const mvFrom = (id, t, au) => el('moveFrom', id, run(t), au);
const mvTo = (id, t, au) => el('moveTo', id, run(t), au);
const para = (inner) => `<w:p>${inner}</w:p>`;
const docOf = async (body, opts) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body)}), opts);
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);

const W = 400;
const laid = (doc, markup) => {
  const L = new DocLayout(doc, tm(), null,
    markup === undefined ? {} : {markup});
  L.layout(W);
  return L;
};
/** The text the lines of paragraph b show. */
const shown = (L, b) => L.byId.get(b.id).lines.flatMap((ln) =>
  ln.items.map((x) => x.text || '')).join('');
/** The lines of every paragraph, as drawn (no offsets): top,
 *  height, text and right edge. */
const look = (L) => L.items.filter((it) => it.kind === 'p')
  .map((it) => it.lines.map((ln) => [ln.y, ln.h, ln.items
    .map((x) => x.text || '').join(''), Math.max(0, ...ln.items
    .filter((x) => x.w > 0).map((x) => x.x + x.w))]));
const pagesOf = (L) => {
  const P = new Pages(printGalley(L));
  P.finish();
  return P.count;
};
const pos = (b, off) => ({id: b.id, off});

// 'Keep new old end.': ins 'new ' [5, 9) by Ann, del 'old ' [9, 13)
// by Bo
const ONE = para(run('Keep ') + ins(1, 'new ', 'Ann') +
  del(2, 'old ', 'Bo') + run('end.'));
const LONG = 'word '.repeat(40);

describe('RevView: the rule', () => {
  it('visible and hides: Final hides del and mvFrom, Original ins ' +
    'and mvTo, All none; anything else is Final', () => {
    const r = (kind) => ({start: 0, end: 1, rev: {id: 1, kind}});
    const want = {final: [true, false, true, false],
      original: [false, true, false, true], all: [true, true, true,
        true]};
    for (const m of MODES) {
      assert.deepEqual(['ins', 'del', 'mvTo', 'mvFrom']
        .map((k) => visible(r(k), m)), want[m], m);
    }
    for (const bad of [undefined, null, 'All', 7, {}]) {
      assert.deepEqual(['ins', 'del'].map((k) => visible(r(k), bad)),
        [true, false]);
      assert.equal(modeOf(bad), 'final');
      assert.equal(isMode(bad), false);
    }
    assert.equal(visible({start: 0, end: 1}, 'original'), true);
    assert.equal(visible(null, 'final'), true);
    assert.equal(visible({rev: {kind: 'odd'}}, 'final'), true);
    assert.equal(hides('del', 'final'), true);
    assert.equal(hides('ins', 'original'), true);
  });

  it('setMarkup: Final at first, a mode set once lays out again, an ' +
    'invalid or unchanged one is ignored', async () => {
    const doc = await docOf(ONE);
    const d = new Document(doc);
    assert.equal(d.markup, 'final');
    let n = 0;
    const dw = {d, L: laid(doc), newLayout(metrics, prev) {
      n++;
      this.L = new DocLayout(doc, metrics, prev,
        {markup: this.d.markup});
      this.L.layout(W);
    }};
    for (const bad of ['final', 'All', null, undefined, 3]) {
      assert.equal(setMarkup(dw, bad), false);
    }
    assert.equal(n, 0);
    assert.equal(setMarkup(dw, 'all'), true);
    assert.equal(n, 1);
    assert.equal(d.markup, 'all');
    assert.equal(dw.L.markup, 'all');
    assert.equal(shown(dw.L, blocks(doc)[0]), 'Keep new old end.');
    assert.equal(setMarkup(dw, 'all'), false);
    assert.equal(setMarkup(dw, 'original'), true);
    assert.equal(shown(dw.L, blocks(doc)[0]), 'Keep old end.');
  });
});

describe('RevView: what each view lays out', () => {
  it('final shows ins plain and hides del, original the reverse, ' +
    'all shows both', async () => {
    const doc = await docOf(ONE), b = blocks(doc)[0];
    assert.equal(shown(laid(doc), b), 'Keep new end.');
    assert.equal(shown(laid(doc, 'final'), b), 'Keep new end.');
    assert.equal(shown(laid(doc, 'original'), b), 'Keep old end.');
    assert.equal(shown(laid(doc, 'all'), b), 'Keep new old end.');
    assert.equal(shown(laid(doc, 'bogus'), b), 'Keep new end.');
    // Final and Original draw no marks: insertions and deletions
    // plain
    for (const m of ['final', 'original']) {
      const L = laid(doc, m);
      assert.equal(marks(L, L.byId.get(b.id), 0), NONE);
    }
  });

  it('a document with revisions lays out in Final exactly as with ' +
    'the pre-F2 BLANK rule (line breaks and page starts equal)',
  async () => {
    const body = para(run(LONG) + del(1, LONG) + run(LONG) +
      ins(2, 'more words here ') + run('end')) +
      para(run('a ') + mvFrom(3, 'gone ') + run(LONG)) +
      para(run(LONG + LONG) + del(4, 'x'.repeat(300)) + run(LONG));
    const now = await docOf(body);
    const raw = await docOf(body, {revisionMarks: false});
    assert.ok(blocks(now)[0].runs.some((r) => r.rev));
    assert.ok(!blocks(raw)[0].runs.some((r) => r.rev));
    const a = laid(now), r = laid(raw), f = laid(now, 'final');
    assert.deepEqual(look(a), look(r));
    assert.deepEqual(look(f), look(r));
    assert.equal(a.height, r.height);
    assert.equal(pagesOf(a), pagesOf(r));
    // and All Markup takes the deleted text's room
    const n = (L) => L.items.reduce((k, it) => k + it.lines.length, 0);
    assert.ok(n(laid(now, 'all')) > n(a) + 3);
  });

  it('all markup reflows only through run visibility: as the same ' +
    'text untagged; Original as the text without the insertions',
  async () => {
    const tagged = await docOf(para(run(LONG) + ins(1, LONG) +
      del(2, LONG) + run('tail')));
    const plain = await docOf(para(run(LONG) + run(LONG) +
      run(LONG) + run('tail')));
    const orig = await docOf(para(run(LONG) + run(LONG) +
      run('tail')));
    assert.deepEqual(look(laid(tagged, 'all')), look(laid(plain)));
    assert.deepEqual(look(laid(tagged, 'original')),
      look(laid(orig)));
    assert.deepEqual(look(laid(tagged, 'final')), look(laid(orig)));
  });

  it('a document without revisions lays out the same in every view ' +
    'and pays nothing', async () => {
    const doc = await docOf(para(run(LONG)) + para(run('two')));
    const want = look(laid(doc));
    for (const m of MODES) assert.deepEqual(look(laid(doc, m)), want);
    for (const b of blocks(doc)) {
      for (const m of MODES) assert.equal(hiddenSpans(b, m).length, 0);
    }
    const L = laid(doc, 'all');
    assert.equal(marks(L, L.items[0], 0), NONE);
  });

  it('a layout of another view keeps no lines of the one before; ' +
    'one of the same view keeps them', async () => {
    const doc = await docOf(ONE);
    const L0 = laid(doc);
    const lines = L0.items[0].lines;
    const L1 = new DocLayout(doc, L0.metrics, L0);
    L1.layout(W);
    assert.equal(L1.markup, 'final');
    assert.equal(L1.items[0].lines, lines);
    const L2 = new DocLayout(doc, L1.metrics, L1, {markup: 'all'});
    L2.layout(W);
    assert.notEqual(L2.items[0].lines, lines);
    const L3 = new DocLayout(doc, L2.metrics, L2);
    assert.equal(L3.markup, 'all');            // (prev's)
  });
});

describe('RevView: the caret and the selection', () => {
  const hidden = {final: [9, 13], original: [5, 9], all: null};
  const inside = (m, off) => !!hidden[m] && off > hidden[m][0] &&
    off < hidden[m][1];

  it('the caret never lands inside hidden text and arrow keys skip ' +
    'it', async () => {
    const doc = await docOf(ONE), b = blocks(doc)[0];
    for (const m of MODES) {
      const L = laid(doc, m);
      const seen = [];
      let s = S.caret(pos(b, 0));
      for (let k = 0; k < 30; k++) {
        s = S.move(s, L, 'right');
        seen.push(s.head.off);
        if (s.head.off === b.text.length) break;
      }
      assert.ok(!seen.some((o) => inside(m, o)), m + ' ' + seen);
      // every press moves on the screen
      const xs = seen.map((o) => L.caretRect(pos(b, o)).x);
      assert.ok(xs.every((x, i) => !i || x > xs[i - 1]), m + ' ' + xs);
      const back = [];
      for (let k = 0; k < 30 && s.head.off > 0; k++) {
        s = S.move(s, L, 'left');
        back.push(s.head.off);
      }
      assert.ok(!back.some((o) => inside(m, o)), m + ' ' + back);
      assert.equal(back[back.length - 1], 0);
      // the word keys, Home and End, Shift-select
      for (const c of ['wordRight', 'wordLeft', 'end', 'home']) {
        for (let o = 0; o <= b.text.length; o++) {
          if (inside(m, o)) continue;
          const t = S.move(S.caret(pos(b, o)), L, c);
          assert.ok(!inside(m, t.head.off), `${m} ${c} ${o}`);
          const e = S.move(S.caret(pos(b, o)), L, c, true);
          assert.ok(!inside(m, e.head.off), `${m} ${c} ext ${o}`);
        }
      }
      // a click anywhere on the line
      for (let x = 0; x < W; x += 3) {
        const h = L.hitTest(x, L.byId.get(b.id).y + 2);
        assert.ok(!inside(m, h.pos.off), `${m} click ${x}`);
      }
      // a selection made inside hidden text is moved out
      if (hidden[m]) {
        const [a, z] = hidden[m];
        const out = shownSel(L, S.select(pos(b, a + 1), pos(b, z - 1)));
        assert.ok(!inside(m, out.anchor.off) && !inside(m,
          out.head.off));
        assert.deepEqual([out.anchor.off, out.head.off], [a, z]);
      } else {
        const s0 = S.select(pos(b, 10), pos(b, 11));
        assert.equal(shownSel(L, s0), s0);
      }
    }
  });

  it('Backspace and Delete step over hidden text and never take it, ' +
    'in each view', async () => {
    for (const m of MODES) {
      const doc = await docOf(ONE);
      const d = new Document(doc);
      d.markup = m;
      const b = blocks(doc)[0];
      // after the hidden stretch (13) Backspace takes the character
      // before it; at its start (9) Delete the one after it
      let s = deleteBack(d, S.caret(pos(b, hidden[m] ? hidden[m][1]
        : 13)));
      let p = blocks(d.doc)[0];
      if (m === 'final') {
        assert.equal(p.text, 'Keep newold end.');
        assert.equal(s.head.off, 8);
      } else if (m === 'original') {
        assert.equal(p.text, 'Keep new old end.'.slice(0, 4) +
          'new old end.');
      } else assert.equal(p.text, 'Keep new oldend.');
      assert.ok(!inside(m, s.head.off));
      d.undo();
      p = blocks(d.doc)[0];
      s = deleteForward(d, S.caret(pos(p, hidden[m] ? hidden[m][0]
        : 9)));
      p = blocks(d.doc)[0];
      const want = {final: 'Keep new old nd.',
        all: 'Keep new ld end.'};
      if (m === 'original') {
        // (9 is past the hidden 'new ': Delete takes the 'o')
        assert.equal(p.text, 'Keep new ld end.');
      } else assert.equal(p.text, want[m]);
      assert.ok(!inside(m, s.head.off));
    }
  });
});

describe('RevView: text consumers follow the view', () => {
  it('find and word count follow the view', async () => {
    const doc = await docOf(ONE);
    const at = (m) => search(doc, null, 'old', {view: m});
    assert.equal(at(undefined), null);
    assert.equal(at('final'), null);
    const a = at('all'), o = at('original');
    assert.deepEqual([a.from, a.to, a.inInline], [9, 12, true]);
    assert.deepEqual([o.from, o.to, o.inInline], [9, 12, true]);
    assert.equal(search(doc, null, 'new', {view: 'original'}), null);
    const n = search(doc, null, 'new', {view: 'final'});
    assert.deepEqual([n.from, n.inInline], [5, false]);
    // 'new end' across the deletion: found in Final only, never
    // replaced
    assert.equal(search(doc, null, 'new end', {})?.inInline, true);
    assert.equal(search(doc, null, 'new end', {view: 'all'}), null);
    assert.equal(findCount(doc, 'o', {view: 'all'}), 1);
    assert.equal(findCount(doc, 'o', {view: 'original'}), 1);
    assert.equal(findCount(doc, 'o', {}), 0);
    assert.equal(findCount(doc, 'w', {view: 'original'}), 0);
    assert.equal(findCount(doc, 'w', {view: 'all'}), 1);
    const words = (m) => wordCount(doc, null, laid(doc, m)).words;
    assert.deepEqual(MODES.map(words), [3, 4, 3]);
    assert.equal(wordCount(doc).words, 3);
    const chars = (m) => wordCount(doc, null, laid(doc, m)).chars;
    assert.deepEqual(MODES.map(chars), [13, 17, 13]);
  });

  it('the selection\'s text, a double-click, Change Case, Info and ' +
    'the clipboard\'s plain text follow the view', async () => {
    const body = para(run('Keep ', '<w:rFonts ' +
      'w:ascii="Carlito" w:hAnsi="Carlito"/>') + ins(1, 'new ') +
      el('del', 2, run('old ', '<w:rFonts w:ascii="Caladea" ' +
        'w:hAnsi="Caladea"/>', 'w:delText'), 'Bo') + run('end.'));
    const doc = await docOf(body), b = blocks(doc)[0];
    const all = S.select(pos(b, 0), pos(b, b.text.length));
    const text = (m) => S.text(all, laid(doc, m));
    assert.deepEqual(MODES.map(text), ['Keep new end.',
      'Keep new old end.', 'Keep old end.']);
    const plain = (m) => slice(doc, all, m).plain;
    assert.deepEqual(MODES.map(plain), MODES.map(text));
    assert.equal(slice(doc, all).plain, 'Keep new end.');
    // a double-click on 'old' (10): the hidden stretch in Final, the
    // word in All and Original
    const word = (m) => {
      const s = S.selectWord(laid(doc, m), pos(b, 10));
      return [s.anchor.off, s.head.off];
    };
    assert.deepEqual(MODES.map(word), [[9, 13], [9, 12], [9, 12]]);
    // Info's fonts: the deleted text's in All and Original
    const fonts = (m) => facts(doc, m).fonts.includes('Caladea');
    assert.deepEqual(MODES.map(fonts), [false, true, true]);
    assert.equal(fonts(undefined), false);
    // Change Case (upper) of the whole paragraph: the hidden text
    // is left as it is
    // (a document of its own each time: one Doc, one Document)
    const cased = async (m) => {
      const d = new Document(await docOf(body));
      d.markup = m;
      const q = blocks(d.doc)[0];
      changeCase(d, new Typing(d), S.select(pos(q, 0),
        pos(q, q.text.length)), 'upper');
      return blocks(d.doc)[0].text;
    };
    assert.deepEqual(await Promise.all(MODES.map(cased)),
      ['KEEP NEW old END.',
      'KEEP NEW OLD END.', 'KEEP new OLD END.']);
  });
});

describe('RevView: a table on the clipboard', () => {
  const tc = (inner) => tcOf([para(inner)]);
  const tbl = (...cells) => tblOf([tr(cells)]);
  const plainIn = (doc, m) => {
    const bs = blocks(doc), a = bs[0], z = bs[bs.length - 1];
    return slice(doc, S.select(pos(a, 0), pos(z, z.text.length)), m)
      .plain;
  };

  it('a cell\'s deleted text is left out of the plain text in Final, ' +
    'there in All; Original shows it and hides the inserted text',
  async () => {
    const doc = await docOf(para(run('before')) +
      tbl(tc(run('a ') + del(1, 'gone ', 'Bo') + run('b')),
        tc(run('c ') + ins(2, 'new ', 'Ann') + run('d'))) +
      para(run('after')));
    assert.equal(blocks(doc)[1].type, 'tbl');
    const want = {final: 'before\na b\tc new d\nafter',
      all: 'before\na gone b\tc new d\nafter',
      original: 'before\na gone b\tc d\nafter'};
    for (const m of MODES) assert.equal(plainIn(doc, m), want[m], m);
    assert.equal(plainIn(doc), want.final);
  });

  it('a table without revisions copies the same in every view',
    async () => {
      const doc = await docOf(para(run('x')) +
        tbl(tc(run('one') + '<w:r><w:tab/></w:r>' + run('two')),
          tc(run('three'))) + para(run('y')));
      const want = plainIn(doc);
      assert.equal(want, 'x\none two\tthree\ny');
      for (const m of MODES) assert.equal(plainIn(doc, m), want);
    });
});

describe('RevPaint: All Markup drawn', () => {
  it('an author keeps one colour in comments and changes', () => {
    for (const a of ['Ann', 'Bo', 'Zoë', '', 'Unknown author']) {
      assert.equal(colourOf(a), cColour(a));
      assert.equal(inkOf(a), INK[colourOf(a)]);
      assert.equal(fillOf(a, false, false),
        PALETTE[colourOf(a)].soft);
    }
    assert.equal(INK.length, PALETTE.length);
  });

  it('marks: insertions underlined, deletions struck through, moves ' +
    'doubled, in the author colour; a change bar left of the line',
  async () => {
    const doc = await docOf(para(run('Keep ') + ins(1, 'new ', 'Ann') +
      del(2, 'old ', 'Bo') + mvTo(3, 'here ', 'Cy') +
      mvFrom(4, 'there ', null) + run('end.')));
    const L = laid(doc, 'all'), it = L.items[0], b = it.block;
    const ms = marks(L, it, 0);
    const ln = it.lines[0];
    const byKind = (k) => ms.filter((x) => x.kind === k);
    const textOf = (k) => byKind(k).map((x) => ln.items[x.at].text)
      .join('');
    assert.equal(textOf('under'), 'new ');
    assert.equal(textOf('strike'), 'old ');
    assert.equal(textOf('under2'), 'here ');
    assert.equal(textOf('strike2'), 'there ');
    assert.ok(byKind('under').every((x) => x.colour === inkOf('Ann')));
    assert.ok(byKind('strike').every((x) => x.colour === inkOf('Bo')));
    assert.ok(byKind('strike2').every((x) => x.colour ===
      inkOf('Unknown author')));
    const bar = byKind('bar');
    assert.equal(bar.length, 1);
    assert.equal(bar[0].colour, BAR);
    assert.equal(bar[0].x0, Math.round(L.root.x - BAR_GAP));
    assert.equal(bar[0].h, Math.round(ln.h));
    // the marks lie over their items (a change's spaces too, as in
    // Word)
    for (const x of ms.filter((q) => q.kind !== 'bar')) {
      const item = ln.items[x.at];
      assert.equal(x.x0, it.x + item.x);
      assert.equal(x.x1, it.x + item.x + item.w);
    }
    assert.equal(b.text.slice(5, 9), 'new ');
    // painting: the text of 'old' in Bo's ink, its strike line, and
    // the bar
    const g = fakeG();
    paintView(L, g, {x0: 0, y0: 0, x1: 2000, y1: 2000}, null, false);
    const texts = g.calls.filter((c) => c[0] === 'fillText');
    const ink = (w) => texts.find((c) => c[2].startsWith(w))[1];
    assert.equal(ink('old'), inkOf('Bo'));
    assert.equal(ink('new'), inkOf('Ann'));
    assert.equal(ink('Keep'), '#000000');
    const fills = g.calls.filter((c) => c[0] === 'fillRect');
    assert.ok(fills.some((c) => c[1] === BAR));
    assert.ok(fills.filter((c) => c[1] === inkOf('Cy')).length >= 2);
    // Final paints none of it
    const g2 = fakeG();
    paintView(laid(doc), g2, {x0: 0, y0: 0, x1: 2000, y1: 2000}, null,
      false);
    assert.ok(!g2.calls.some((c) => c[1] === BAR));
  });

  it('a line without a change has no bar; hostile tags and odd ' +
    'items never throw', async () => {
    const doc = await docOf(para(run(LONG + LONG + 'tail ') +
      ins(1, 'new')));
    const L = laid(doc, 'all'), it = L.items[0];
    assert.ok(it.lines.length > 2);
    assert.equal(marks(L, it, 0), NONE);
    assert.ok(marks(L, it, it.lines.length - 1).length > 0);
    for (const bad of [null, undefined, {}, {lines: null},
      {block: {runs: 3}, lines: []}]) {
      assert.equal(marks(L, bad, 0), NONE);
    }
    assert.equal(marks(null, it, 0), NONE);
    assert.equal(marks(L, it, 99), NONE);
    const fake = {kind: 'p', block: newPara('abc'), x: 0, y: 0,
      lines: [{y: 0, h: 10, base: 8, items: [{t: 'w', text: 'a',
        from: 0, to: 1, x: 0, w: 5, f: {px: NaN}, rev: {kind: 'del',
          author: 7}}, {text: 'b', x: 5, w: 5, rev: 'x'},
      {text: 'c', x: 10, w: 5, rev: {kind: 'weird'}}, null,
      {x: 0, w: 3, rev: null}, {x: 0, w: 0, rev: {kind: 'ins'}}]}]};
    const ms = marks(L, fake, 0);
    assert.deepEqual(ms.map((x) => x.kind), ['strike', 'bar']);
    assert.equal(ms[0].colour, inkOf('Unknown author'));
  });

  it('10,000 revisions paint within a load-robust ratio of as many ' +
    'plain runs (best of 5, ratio < 12)', async () => {
    const N = 10000;
    let tagged = '', plain = '';
    for (let k = 0; k < N; k++) {
      tagged += (k % 2 ? ins(k + 1, 'ab ', 'A' + (k % 7))
        : del(k + 1, 'cd ', 'B')) + run('e ');
      plain += run('ab ', '<w:b/>') + run('e ');
    }
    const t = await docOf(para(tagged)), p = await docOf(para(plain));
    const Lt = laid(t, 'all'), Lp = laid(p, 'all');
    const rect = {x0: 0, y0: 0, x1: 2000, y1: 1e9};
    const time = (L) => {
      let best = Infinity;
      for (let k = 0; k < 5; k++) {
        const g = fakeG(), t0 = performance.now();
        paintView(L, g, rect, null, false);
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    const a = time(Lt), b = time(Lp);
    assert.ok(a < 12 * b + 5, `${a} vs ${b}`);
  });
});

/** A fake 2D context recording what is drawn (fillText with the
 *  colour it is drawn in). */
function fakeG() {
  const calls = [];
  const g = {calls, fillStyle: '', globalCompositeOperation:
    'source-over', font: '', textBaseline: '', strokeStyle: '',
  lineWidth: 1};
  for (const n of ['save', 'restore', 'strokeRect', 'beginPath',
    'rect', 'clip', 'translate', 'scale', 'moveTo', 'lineTo',
    'stroke', 'setLineDash']) {
    g[n] = (...a) => calls.push([n, ...a]);
  }
  g.fillText = (t, ...a) => calls.push(['fillText', g.fillStyle, t,
    ...a]);
  g.fillRect = (...a) => calls.push(['fillRect', g.fillStyle, ...a]);
  g.measureText = (t) => ({width: 8 * String(t).length});
  return g;
}
