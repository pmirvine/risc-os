// Incremental pagination (Batch D P2.3, D7): DocItems' L.dirtyFrom
// and L.cleanFrom, Pages reusing an older Pages (pages before the
// dirty item kept by identity, convergence, later pages kept with
// their cursors shifted), and the slices (step, ensure). Real
// DocLayout, the fake measurer (word-docs tm).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {loadStyles, tm, fake, rng} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {galley} from './page-fixtures.mjs';

before(loadStyles);
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const text = (i) => `${i} ` + WORDS[i % 10] + ' words';

/** A new layout of d (from prev) at 800 px. */
function lay(d, metrics, prev) {
  const L = new DocLayout(d.doc, metrics, prev);
  L.layout(800);
  return L;
}
const type = (d, s, i, at = 0) => d.apply({op: 'replaceText',
  block: [s, i], at, del: 0, ins: 'x'});
const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
/** The item index page i of P starts at (a cursor's k). */
const pageOf = (P, k) => {
  for (let i = 0; i < P.count; i++) {
    const pg = P.at(i);
    if (pg.end.k > k || (pg.end.k === k && pg.end.line > 0)) return i;
  }
  return -1;
};

describe('L.dirtyFrom and L.cleanFrom (DocItems)', () => {
  /** A 10-paragraph document laid out, then changed by f. */
  function after(f) {
    const d = mk(Array.from({length: 10}, (_, i) => text(i)));
    const m = tm(), L0 = lay(d, m);
    f(d);
    return {L0, L: lay(d, m, L0)};
  }

  it('a first layout: 0', () => {
    const d = mk(['a', 'b']);
    assert.equal(lay(d, tm()).dirtyFrom, 0);
  });

  it('an unchanged relayout: Infinity', () => {
    const {L} = after(() => {});
    assert.equal(L.dirtyFrom, Infinity);
  });

  it('an edit of paragraph 4: 4 (and clean from 5)', () => {
    const {L} = after((d) => type(d, 0, 4));
    assert.equal(L.dirtyFrom, 4);
    assert.equal(L.cleanFrom, 5);
  });

  it('a paragraph inserted at 4: 4 (clean from 5)', () => {
    const {L} = after((d) => d.apply({op: 'insertBlock', at: [0, 4],
      block: newPara('new')}));
    assert.equal(L.dirtyFrom, 4);
    assert.equal(L.cleanFrom, 5);
  });

  it('paragraph 4 deleted: 4 (clean from 4)', () => {
    const {L} = after((d) => d.apply({op: 'removeBlock', at: [0, 4]}));
    assert.equal(L.dirtyFrom, 4);
    assert.equal(L.cleanFrom, 4);
  });

  it('the last paragraph deleted: 9', () => {
    const {L} = after((d) => d.apply({op: 'removeBlock', at: [0, 9]}));
    assert.equal(L.dirtyFrom, 9);
  });

  it('invalidate(): 0', () => {
    const {L} = after(() => {});
    L.invalidate();
    L.layout(800);
    assert.equal(L.dirtyFrom, 0);
  });

  it('another top (the panes): 0', () => {
    const d = mk(['a', 'b']);
    const m = tm(), L0 = lay(d, m);
    const L = new DocLayout(d.doc, m, L0, {top: 30});
    L.layout(800);
    assert.equal(L.dirtyFrom, 0);
  });
});

describe('Pages(G, prev): reuse and convergence', () => {
  it('a character typed in page 40\'s paragraph of a 100-page ' +
    'document: pages 0..39 kept, convergence within 2 pages', () => {
    const d = mk(Array.from({length: 3000}, (_, i) => text(i)));
    const m = tm(), L0 = lay(d, m);
    const P0 = new Pages(galleyOf(L0)).finish();
    assert.ok(P0.count >= 100, `${P0.count} pages`);
    const k = (P0.at(40).start.k + P0.at(40).end.k) >> 1;
    type(d, 0, k, 2);
    const L = lay(d, m, L0);
    assert.equal(L.dirtyFrom, k);
    const P = new Pages(galleyOf(L), P0).finish();
    for (let i = 0; i < 40; i++) {
      assert.equal(P.at(i), P0.at(i), `page ${i}`);
    }
    for (let i = 42; i < P0.count; i++) {
      assert.equal(P.at(i), P0.at(i), `page ${i}`);
    }
    assert.equal(P.count, P0.count);
    assert.ok(P.kept >= 97, `kept ${P.kept}`);
    assert.deepEqual(P.list, new Pages(galleyOf(L)).finish().list);
  });

  it('a paragraph inserted on page 40 (a page break before every ' +
    '25th): later pages kept with their cursors shifted by one ' +
    'item, as a fresh pagination', () => {
    const d = mk(Array.from({length: 2500}, (_, i) => (i % 25 ? text(i)
      : [text(i), {pPr: {pageBreakBefore: true}}])));
    const m = tm(), L0 = lay(d, m);
    const P0 = new Pages(galleyOf(L0)).finish();
    const k = (P0.at(40).start.k + P0.at(40).end.k) >> 1;
    d.apply({op: 'insertBlock', at: [0, k], block: newPara('new')});
    const L = lay(d, m, L0);
    const P = new Pages(galleyOf(L), P0).finish();
    for (let i = 0; i < 40; i++) {
      assert.equal(P.at(i), P0.at(i), `page ${i}`);
    }
    assert.ok(P.kept >= 97, `kept ${P.kept}`);
    assert.deepEqual(P.at(60).start, {k: P0.at(60).start.k + 1,
      line: 0});
    assert.deepEqual(P.list, new Pages(galleyOf(L)).finish().list);
    const last = P.at(P.count - 1);
    assert.equal(last.end.k, L.items.length);
  });

  it('an unchanged relayout keeps every page; an unfinished prev ' +
    'is carried on', () => {
    const d = mk(Array.from({length: 600}, (_, i) => text(i)));
    const m = tm(), L0 = lay(d, m);
    const P0 = new Pages(galleyOf(L0));
    P0.at(5);
    const L = lay(d, m, L0);
    const P = new Pages(galleyOf(L), P0);
    assert.equal(P.count, P0.count);
    for (let i = 0; i < P0.count; i++) assert.equal(P.at(i), P0.at(i));
    P.finish();
    assert.deepEqual(P.list, new Pages(galleyOf(L)).finish().list);
  });

  it('no prev, or no dirtyFrom on G: nothing kept', () => {
    const d = mk(['a', 'b']);
    const L = lay(d, tm());
    const P0 = new Pages(galleyOf(L)).finish();
    assert.equal(P0.kept, 0);
    const G = galleyOf(L);
    const fake = {...G, items: G.items, dirtyFrom: undefined};
    assert.equal(new Pages(fake, P0).kept, 0);
  });
});

describe('slices: step(ms) and ensure(i)', () => {
  it('a line added at the top of a 1,500-page document: ensure(2) ' +
    '< 5 ms, step(2) finishes < 300 ms in all, as a fresh ' +
    'pagination', () => {
    const d = mk(Array.from({length: 50000}, (_, i) => text(i)));
    const m = tm(), L0 = lay(d, m);
    const P0 = new Pages(galleyOf(L0)).finish();
    assert.ok(P0.count >= 1500, `${P0.count} pages`);
    d.apply({op: 'insertBlock', at: [0, 0], block: newPara('top')});
    const L = lay(d, m, L0);
    const ens = [], tot = [], slices = [];
    let P = null;
    for (let run = 0; run < 7; run++) {
      P = new Pages(galleyOf(L), P0);   // (facts: worked out anew)
      const t0 = performance.now();
      P.ensure(2);
      ens.push(performance.now() - t0);
      assert.ok(P.count >= 3);
      let n = 0;
      while (!P.step(2)) {
        n++;
        assert.ok(n < 10000, 'slices end');
      }
      tot.push(performance.now() - t0);
      slices.push(n);
    }
    console.log(`# ensure(2) ${median(ens).toFixed(2)} ms, all ` +
      `${median(tot).toFixed(1)} ms in ${median(slices)} slices`);
    assert.ok(median(ens) < 5, `ensure ${median(ens)} ms`);
    assert.ok(median(tot) < 300, `total ${median(tot)} ms`);
    assert.ok(P.done);
    assert.equal(P.step(2), true, 'done stays done');
    assert.deepEqual(P.list, new Pages(galleyOf(L)).finish().list);
  });

  it('step(ms) computes at least one page and stops; ensure(i) ' +
    'returns page i', () => {
    const d = mk(Array.from({length: 600}, (_, i) => text(i)));
    const L = lay(d, tm());
    const P = new Pages(galleyOf(L));
    assert.equal(P.step(0), false);
    assert.ok(P.count >= 1);
    const pg = P.ensure(10);
    assert.equal(pg, P.at(10));
    assert.ok(P.count >= 11);
    assert.equal(P.ensure(1e9), null);
    assert.ok(P.done);
    assert.equal(P.ensure(-1), null);
  });
});

describe('mixed sections (Review Focus 1)', () => {
  /** Section n's paragraphs, each with words of its own. */
  const paras = (s, n) => Array.from({length: n}, (_, i) =>
    p(r(`s${s}p${i} ` + WORDS[i % 10] + ` q${s}x${i} words`))).join('');
  const sect = (w, h, orient) => `<w:sectPr><w:pgSz w:w="${w}" ` +
    `w:h="${h}"${orient ? ` w:orient="${orient}"` : ''}/>` +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
    'w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr>';
  const body = paras(0, 200) + p('', sect(11906, 16838)) +
    paras(1, 200) + p('', sect(16838, 11906, 'landscape')) +
    paras(2, 200) + sect(11906, 16838);

  it('a keystroke in the landscape middle section keeps every page ' +
    'before it and re-breaks only that paragraph', async () => {
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(body)}));
    const d = new Document(doc);
    const log = [];
    const m = new TextMetrics((t, css) => {
      log.push(t);
      return fake(t, css);
    }, {max: 1});
    const L0 = lay(d, m);
    const P0 = new Pages(galleyOf(L0)).finish();
    const s1 = L0.items.findIndex((it) => it.s === 1);
    const k = s1 + 100;
    assert.equal(L0.items[k].s, 1);
    const pk = pageOf(P0, k);
    assert.ok(pk > 0);
    assert.ok(P0.at(pk).w > P0.at(0).w, 'a landscape page');
    log.length = 0;
    type(d, 1, 100, 3);
    const L = lay(d, m, L0);
    const mine = L.items[k].block.text;
    assert.ok(log.length > 0);
    assert.ok(log.every((t) => mine.includes(t)),
      `measured only paragraph ${k}: ${log.find((t) =>
        !mine.includes(t))}`);
    L.items.forEach((it, j) => {
      if (j !== k) {
        assert.equal(it.lines, L0.items[j].lines, `item ${j}`);
      }
    });
    assert.equal(L.dirtyFrom, k);
    const P = new Pages(galleyOf(L), P0).finish();
    for (let i = 0; i < pk; i++) {
      assert.equal(P.at(i), P0.at(i), `page ${i}`);
    }
    assert.ok(P.kept >= P0.count - 2, `kept ${P.kept}`);
    assert.deepEqual(P.list, new Pages(galleyOf(L)).finish().list);
  });

  it('a page setup change of the middle section: dirty from its ' +
    'first item, every page of section 0 but its last kept',
  async () => {
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(body)}));
    const d = new Document(doc);
    const m = tm(), L0 = lay(d, m);
    const P0 = new Pages(galleyOf(L0)).finish();
    const s1 = L0.items.findIndex((it) => it.s === 1);
    const sec = doc.sections[1];
    const pgSz = {...sec.props.pgSz, h: 11000};
    d.apply({op: 'setSection', at: 1, props: {...sec.props, pgSz},
      raw: sec.raw});
    const L = lay(d, m, L0);
    assert.equal(L.dirtyFrom, s1);
    const P = new Pages(galleyOf(L), P0).finish();
    // (section 0's last page looks at section 1's first item:
    // whether it starts a page; so it is worked out again)
    const ps = pageOf(P0, s1) - 1;
    assert.ok(ps >= 3);
    for (let i = 0; i < ps; i++) {
      assert.equal(P.at(i), P0.at(i), `page ${i}`);
    }
    assert.ok(P.kept >= ps, `kept ${P.kept}`);
    assert.deepEqual(P.list, new Pages(galleyOf(L)).finish().list);
  });
});

describe('random edits: always as a fresh pagination', () => {
  it('200 edits (text, inserts, deletes, keep and break flags, ' +
    'spacing) over 3 sections, prev finished or not', async () => {
    const R = rng(23);
    const pick = (n) => Math.floor(R() * n);
    const words = (n) => Array.from({length: n}, (_, i) =>
      WORDS[(i + n) % 10]).join(' ');
    const flag = () => [R() < 0.1 ? '<w:keepNext/>' : '',
      R() < 0.04 ? '<w:pageBreakBefore/>' : ''].join('');
    const paras = (n) => Array.from({length: n}, () =>
      p(r(words(1 + pick(30))), flag())).join('');
    const sect = (w, h, type) => `<w:sectPr>${type ? '<w:type ' +
      `w:val="${type}"/>` : ''}<w:pgSz w:w="${w}" w:h="${h}"/>` +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
      'w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr>';
    const body = paras(120) + p('', sect(11906, 16838)) +
      paras(120) + p('', sect(16838, 11906, 'continuous')) +
      paras(120) + sect(11906, 16838, 'oddPage');
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(body)}));
    const d = new Document(doc), m = tm();
    let L = lay(d, m), P = new Pages(galleyOf(L)).finish();
    let kept = 0;
    for (let round = 0; round < 200; round++) {
      const s = pick(3), bs = d.doc.sections[s].blocks;
      const i = pick(bs.length), b = bs[i], x = pick(7);
      if (x === 0 || b.type !== 'p') {
        d.apply({op: 'insertBlock', at: [s, i],
          block: newPara(words(1 + pick(40)))});
      } else if (x === 1 && bs.length > 3) {
        d.apply({op: 'removeBlock', at: [s, i]});
      } else if (x === 2) {
        d.apply({op: 'setProps', block: [s, i],
          pPr: {keepNext: b.pPr.keepNext ? null : true}});
      } else if (x === 3) {
        d.apply({op: 'setProps', block: [s, i], pPr:
          {pageBreakBefore: b.pPr.pageBreakBefore ? null : true}});
      } else if (x === 4) {
        d.apply({op: 'setProps', block: [s, i],
          pPr: {spacing: {before: 20 * pick(30)}}});
      } else {
        d.apply({op: 'replaceText', block: [s, i], at: 0, del: 0,
          ins: x === 5 ? 'x' : words(12) + ' '});
      }
      const N = lay(d, m, L);
      const Q = new Pages(galleyOf(N), P).finish();
      const F = new Pages(galleyOf(N)).finish();
      assert.deepEqual(Q.list, F.list, `round ${round}`);
      for (let j = 0; j < P.count && P.seen[j] < N.dirtyFrom; j++) {
        assert.equal(Q.list[j], P.list[j], `round ${round} page ${j}`);
      }
      kept += Q.kept;
      L = N;
      // (the next prev: finished, or only partly worked out)
      P = R() < 0.5 ? Q : new Pages(galleyOf(N));
      if (P !== Q) P.at(pick(F.count + 2));
    }
    console.log(`# 200 random edits: ${kept} pages reused`);
    assert.ok(kept > 200 * 5, `kept ${kept}`);
  });
});

describe('convergence needs the same y0 (fake galleys)', () => {
  it('a page break added before a page start keeps its space ' +
    'before: that page is worked out, not taken', () => {
    const spec = (br) => ({items: [...Array(9).fill(10),
      {lines: [10], brPage: br ? [0] : null},
      {lines: [10], before: 5}, ...Array(14).fill(10),
      {lines: [10], breakBefore: true}, ...Array(25).fill(10)]});
    const P0 = new Pages(galley(spec(false))).finish();
    const G = {...galley(spec(true)), dirtyFrom: 9, cleanFrom: 10};
    const P = new Pages(G, P0).finish();
    const F = new Pages(galley(spec(true))).finish();
    assert.equal(P0.at(1).start.k, 10);
    assert.notEqual(P0.at(1).y0, F.at(1).y0);
    assert.deepEqual(P.list, F.list);
    assert.ok(P.kept >= 1, 'a later page converges');
    assert.equal(P.at(P.count - 1), P0.at(P0.count - 1));
  });
});
