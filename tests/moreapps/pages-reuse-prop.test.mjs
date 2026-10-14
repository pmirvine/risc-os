// A reused pagination IS a fresh pagination (Batch D P2 fix wave,
// review I2): Pages(G, prev) after an edit deep-equals Pages(G) with
// no tolerance: every page field (fmt, size, mar of blank pages; y0
// of a page whose space before the fill dropped; vShift; cut dy),
// `seen`, the frames, and the pages before dirtyFrom by identity.
// Deterministic cases for each defect the review found, then seeded
// random edits: fake galleys, and a real 300-paragraph DocLayout in
// 6 mixed sections (fake measurer, word-docs tm). Both carry tables
// (P4.1) whose rows split across pages (per-cell cuts), with
// cantSplit, exact and header rows, so cuts, heads and the shift a
// page starting in a table gives are covered too. With headers and
// footers (P7.2): the fake galleys' header and footer heights and
// references per section and type change with some edits (a header
// edited: nothing in the body moves), and the real document has
// default, first-page and even headers and a footer, edited as
// stories and by titlePg.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {newPara, OBJ} from '../../tools/moreapps/!Letters/Model';
import {loadStyles, tm, rng} from './word-docs.mjs';
import {buildDocx, documentXml, settingsXml, REL, p, r}
  from './build-docx.mjs';
import {galley} from './page-fixtures.mjs';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {hdrXml, ftrXml} from './story-fixtures.mjs';

before(loadStyles);

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const TYPES = ['nextPage', 'continuous', 'evenPage', 'oddPage',
  undefined];
const lay = (d, m, prev) => {
  const L = new DocLayout(d.doc, m, prev);
  L.layout(800);
  return L;
};
const sect = (w, h, type, extra = '', left = 1440) =>
  `<w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}` +
  `<w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="1440" ` +
  `w:right="1440" w:bottom="1440" w:left="${left}" w:header="708" ` +
  `w:footer="708" w:gutter="0"/>${extra}</w:sectPr>`;
const setSection = (d, s, change) => {
  const sec = d.doc.sections[s];
  const op = {op: 'setSection', at: s, props: change({...sec.props})};
  if (sec.raw !== undefined) op.raw = sec.raw;
  d.apply(op);
};

const SEEN = {cuts: 0, heads: 0, cellEdits: 0, realCuts: 0,
  realHeads: 0, storyEdits: 0, titlePg: 0, hfPages: 0};

/** Q (reused from P) against a fresh pagination of the same G. */
function same(Q, G, P, msg) {
  const F = new Pages(G).finish();
  for (const pg of F.list) {
    if (pg.start.cuts) SEEN.cuts++;
    if (!pg.blank && pg.frames[0].frags.some((f) => f.heads)) {
      SEEN.heads++;
    }
  }
  assert.deepEqual(Q.list, F.list, msg);
  assert.deepEqual(Q.seen, F.seen, 'seen: ' + msg);
  for (let j = 0; j < F.count; j++) {
    assert.deepEqual(Q.list[j].frames, F.list[j].frames,
      `frames ${j}: ${msg}`);
  }
  // (kept by identity: prev's pages before dirtyFrom up to the first
  // a header or footer edit changed, P7.2)
  const d = G.dirtyFrom;
  for (let j = 0; P && j < P.count && P.seen[j] < d &&
    isDeepStrictEqual(P.list[j], F.list[j]); j++) {
    assert.equal(Q.list[j], P.list[j], `kept ${j}: ${msg}`);
  }
  return F;
}

describe('a blank page after an edited section (review I2 a)', () => {
  const body = p(r('a')) + p('', sect(11906, 16838)) + p(r('b')) +
    p('', sect(11906, 16838, 'nextPage')) + p(r('c')) +
    sect(11906, 16838, 'evenPage');
  for (const [what, change] of [
    ['its pgNumType fmt', (x) => ({...x, pgNumType: {fmt: 'upperRoman'}})],
    ['its left margin', (x) => ({...x, pgMar: {...x.pgMar, left: 2000}})],
  ]) {
    it(`section 1 changes ${what}: the blank page is worked out ` +
      'again', async () => {
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(body)}));
      const d = new Document(doc), m = tm();
      const L0 = lay(d, m), P0 = new Pages(galleyOf(L0)).finish();
      assert.deepEqual(P0.list.map((pg) => pg.blank),
        [false, false, true, false]);
      setSection(d, 1, change);
      const L = lay(d, m, L0), G = galleyOf(L);
      const Q = new Pages(G, P0).finish();
      const F = same(Q, G, P0, what);
      assert.notDeepEqual(
        [F.at(2).fmt, F.at(2).mar], [P0.at(2).fmt, P0.at(2).mar]);
    });
  }
});

describe('the y0 the fill gave (review I2 b)', () => {
  it('a page break before a page whose space before no longer ' +
    'fits: the taken page keeps the fill\'s y0', () => {
    const spec = (br) => ({items: [...Array(8).fill(10),
      {lines: [10], brPage: br ? [0] : null},
      {lines: [10, 10, 10], before: 95}, ...Array(30).fill(10)]});
    const P0 = new Pages(galley(spec(false))).finish();
    const G = {...galley(spec(true)), dirtyFrom: 8, cleanFrom: 9};
    assert.equal(P0.at(1).start.k, 9);
    const Q = new Pages(G, P0).finish();
    same(Q, G, P0, 'break');
    assert.equal(Q.at(1).y0, G.items[9].y + 95);
    assert.ok(Q.kept >= 2, 'kept ' + Q.kept);
  });
});

/** A random fake table (R): rows split, cantSplit, exact, heads. */
function tableOf(R) {
  const pick = (n) => Math.floor(R() * n);
  const nh = R() < 0.4 ? 1 + pick(2) : 0, cols = 1 + pick(3);
  const ls = (n) => Array.from({length: n}, () => 8 + pick(5) + R() / 3);
  const rows = Array.from({length: 1 + pick(25)}, (_, i) => {
    const o = {cells: Array.from({length: cols}, () => (R() < 0.1
      ? {items: [ls(pick(3)), {h: 10 + pick(80)}]}
      : ls(pick(R() < 0.25 ? 30 : 4)))), header: i < nh};
    if (R() < 0.1) o.cantSplit = true;
    if (R() < 0.06) o.exact = 10 + pick(150);
    if (R() < 0.05) o.mar = {top: pick(5), bottom: pick(5)};
    return o;
  });
  return {kind: 'tbl', rows, keepNext: R() < 0.15};
}

/** A random fake item (R). */
function itemOf(R, sections = true) {
  const pick = (n) => Math.floor(R() * n);
  const x = pick(12);
  if (x === 0) return {kind: 'box', h: 30 + pick(300)};
  if (x === 11 && R() < 0.6) return tableOf(R);
  if (x === 1) return 0;
  const lines = Array.from({length: 1 + pick(8)},
    () => (pick(20) ? 10 + R() / 3 : 10 + pick(150)));
  const o = {lines, before: pick(4) ? 0 : pick(150) + R(),
    after: pick(3) ? 0 : pick(20), keepNext: R() < 0.2,
    keepLines: R() < 0.1, widow: R() < 0.85, breakBefore: R() < 0.04};
  if (R() < 0.05) o.brPage = [pick(lines.length)];
  if (sections && R() < 0.05) {
    o.sectStart = ['nextPage', 'continuous', 'oddPage',
      'evenPage'][pick(4)];
  }
  return o;
}

const HF_TYPES = ['default', 'first', 'even'];

/** Random header and footer heights and references (R). */
function hfOf(R) {
  const t = {};
  for (const kind of ['hdr', 'ftr']) {
    for (let s = 0; s < 4; s++) {
      for (const type of HF_TYPES) {
        const k = kind + s + type, x = R();
        t[k] = x < 0.3 ? null : {h: x < 0.6 ? 2 + R() * 8
          : 10 + Math.floor(R() * 60) + R() / 3, part: k + 'a'};
      }
    }
  }
  return t;
}

/** t with one entry changed (a header edited: R). */
function hfEdit(t, R) {
  const ks = Object.keys(t), k = ks[Math.floor(R() * ks.length)];
  const o = t[k], x = R();
  return {...t, [k]: x < 0.2 ? null : {h: 5 + R() * 70,
    part: o && x < 0.7 ? o.part : k + 'b'}};
}

/** G with t's headers and footers (the type by Paginate's rule). */
function withHf(G, t) {
  const at = (kind, s, type) => t[kind + (s % 4) + type] || null;
  const refs = new Map();
  return Object.assign(G, {
    hdrH: (s, type) => (at('hdr', s, type) || {h: 0}).h,
    ftrH: (s, type) => (at('ftr', s, type) || {h: 0}).h,
    refOf(s, type, kind) {
      const o = at(kind, s, type), k = kind + s + type;
      if (!o) return null;
      if (!refs.has(k)) {
        refs.set(k, Object.freeze({part: o.part, type, s: s % 4}));
      }
      return refs.get(k);
    }});
}

describe('random edits to fake galleys (review I2)', () => {
  it('3000 seeds: one item replaced, inserted or removed, or a ' +
    'header edited; prev finished or not', () => {
    let runs = 0, kept = 0, hfEdits = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const R = rng(seed), pick = (n) => Math.floor(R() * n);
      const items = Array.from({length: 20 + pick(80)},
        () => itemOf(R));
      const k = pick(items.length), to = items.slice();
      const ss = (o) => o && typeof o === 'object' && o.sectStart;
      if (ss(items[k]) || ss(items[k + 1])) continue;
      const op = pick(4), n = itemOf(R, false);
      let clean = k + 1, dirty = k;
      const hf0 = hfOf(R);
      let hf1 = R() < 0.3 ? hfEdit(hf0, R) : hf0;
      if (op === 0) to[k] = n;
      else if (op === 1) to.splice(k, 0, n);
      else if (op === 2) {
        to.splice(k, 1);
        clean = k;
      } else {
        // (a header edited, the body as it was: nothing dirty)
        hf1 = hfEdit(hf0, R);
        dirty = clean = Infinity;
      }
      if (hf1 !== hf0) hfEdits++;
      const sections = [{vAlign: 'center'},
        {pgNumType: {start: 1 + pick(3)}}, {size: {w: 300, h: 140}},
        {vAlign: 'bottom'}];
      const frame = 100 + pick(3) * 20;
      const P0 = new Pages(withHf(galley({items, sections, frame}),
        hf0));
      if (R() < 0.5) P0.finish();
      else P0.at(pick(20));
      const G = withHf({...galley({items: op === 3 ? items : to,
        sections, frame}), dirtyFrom: dirty, cleanFrom: clean}, hf1);
      const Q = new Pages(G, P0).finish();
      same(Q, G, P0, `seed ${seed}`);
      runs++;
      kept += Q.kept;
    }
    assert.ok(runs > 2000 && kept > runs * 2 && hfEdits > 900,
      `${runs} ${kept} ${hfEdits}`);
  });
});

/** The 300-paragraph document of seed R (6 sections). */
async function docOf(R) {
  const pick = (n) => Math.floor(R() * n);
  const words = (n) => Array.from({length: n}, (_, i) =>
    WORDS[(i + n + pick(3)) % 10]).join(' ');
  const flags = () => [R() < 0.15 ? '<w:keepNext/>' : '',
    R() < 0.1 ? '<w:keepLines/>' : '',
    R() < 0.03 ? '<w:pageBreakBefore/>' : '',
    R() < 0.1 ? '<w:widowControl w:val="0"/>' : '',
    R() < 0.2 ? `<w:spacing w:before="${20 * pick(40)}" ` +
      `w:after="${20 * pick(20)}"/>` : ''].join('');
  const cell = () => '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>' +
    '</w:tcPr>' + Array.from({length: R() < 0.2 ? 5 + pick(40) : 1},
    () => p(r(words(1 + pick(20))), R() < 0.5 ? '<w:keepNext/>' : ''))
    .join('') + '</w:tc>';
  const trPr = (i, nh) => {
    const x = [i < nh ? '<w:tblHeader/>' : '',
      R() < 0.1 ? '<w:cantSplit/>' : '',
      R() < 0.05 ? `<w:trHeight w:val="${200 + 100 * pick(40)}" ` +
        'w:hRule="exact"/>' : ''].join('');
    return x ? `<w:trPr>${x}</w:trPr>` : '';
  };
  const tbl = () => {
    const nh = R() < 0.4 ? 1 + pick(2) : 0;
    return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol ' +
      'w:w="3000"/></w:tblGrid>' + Array.from({length: 1 + pick(
        R() < 0.3 ? 60 : 4)}, (_, i) => '<w:tr>' + trPr(i, nh) +
      cell() + cell() + '</w:tr>').join('') + '</w:tbl>';
  };
  const paras = (n) => Array.from({length: n}, () => (R() < 0.07
    ? tbl() : p(R() < 0.05 ? '' : r(words(1 + pick(50))), flags())))
    .join('');
  const ref = (kind, type, id) => `<w:${kind}Reference w:type=` +
    `"${type}" r:id="${id}"/>`;
  const refd = (refs, x) => x.replace('<w:sectPr>', '<w:sectPr>' +
    refs);
  const body = paras(50) +
    p('', refd(ref('header', 'default', 'rIdH1') +
      ref('footer', 'default', 'rIdF1'), sect(11906, 16838, null,
      '<w:pgNumType w:fmt="lowerRoman" w:start="3"/>'))) +
    paras(50) + p('', sect(11906, 16838, 'continuous')) +
    paras(50) + p('', refd(ref('header', 'first', 'rIdH2'),
      sect(16838, 11906, 'continuous', '<w:titlePg/>'))) +
    paras(50) + p('', sect(11906, 16838, 'oddPage',
      '<w:pgNumType w:start="1"/><w:vAlign w:val="center"/>')) +
    paras(50) + p('', refd(ref('header', 'even', 'rIdH3'),
      sect(11906, 9000, 'evenPage'))) +
    paras(50) + sect(11906, 16838, 'nextPage',
      '<w:vAlign w:val="bottom"/><w:titlePg/>');
  const hps = (n) => Array.from({length: n}, () =>
    p(r(words(1 + pick(30))))).join('');
  return readDocx(await buildDocx({
    'word/document.xml': documentXml(body),
    'word/header1.xml': hdrXml(hps(2)),
    'word/header2.xml': hdrXml(hps(7)),
    'word/header3.xml': hdrXml(hps(4)),
    'word/footer1.xml': ftrXml(hps(3)),
    'word/settings.xml': settingsXml('<w:evenAndOddHeaders/>')},
  {docRels: [['rIdH1', REL('header'), 'header1.xml'],
    ['rIdH2', REL('header'), 'header2.xml'],
    ['rIdH3', REL('header'), 'header3.xml'],
    ['rIdF1', REL('footer'), 'footer1.xml']]}));
}

const STORIES = ['word/header1.xml', 'word/header2.xml',
  'word/header3.xml', 'word/footer1.xml'];

/** A header or footer of d edited (R): text added or taken away, a
 *  paragraph split or joined. */
function storyEdit(d, R, x) {
  const pick = (n) => Math.floor(R() * n);
  const story = STORIES[pick(STORIES.length)];
  const bs = d.doc.stories.get(story).blocks, i = pick(bs.length);
  const b = bs[i];
  if (b.type !== 'p') return;
  if (x === 14) {
    d.apply({op: 'replaceText', story, block: [0, i], at: 0,
      del: R() < 0.4 ? Math.min(b.text.length, 1 + pick(60)) : 0,
      ins: R() < 0.6 ? WORDS.slice(0, 1 + pick(10)).join(' ') + ' '
        : ''});
  } else if (R() < 0.5 || bs.length < 2) {
    d.apply({op: 'splitBlock', story, block: [0, i],
      at: pick(b.text.length + 1)});
  } else if (i + 1 < bs.length && bs[i + 1].type === 'p') {
    d.apply({op: 'mergeBlock', story, block: [0, i]});
  }
  SEEN.storyEdits++;
}

/** One random edit to d (R); false when the model refused it. */
function edit(d, R) {
  const pick = (n) => Math.floor(R() * n);
  const words = (n) => Array.from({length: n}, (_, i) =>
    WORDS[(i + n) % 10]).join(' ');
  const secs = d.doc.sections, s = pick(secs.length);
  const bs = secs[s].blocks, i = pick(bs.length), b = bs[i];
  let x = pick(17);
  const pp = (pPr) => d.apply({op: 'setProps',
    block: [s, i], pPr});
  try {
    if (x === 14 || x === 15) {
      storyEdit(d, R, x);
      return true;
    }
    if (x === 16) {
      setSection(d, s, (o) => {
        if (o.titlePg) delete o.titlePg;
        else o.titlePg = true;
        return o;
      });
      SEEN.titlePg++;
      return true;
    }
    if (b.type === 'tbl' && x >= 4 && x < 9) x = 12 + (x & 1);
    if (x === 0 || (b.type !== 'p' && x < 9)) {
      d.apply({op: 'insertBlock', at: [s, i],
        block: newPara(words(1 + pick(40)))});
    } else if (x === 1 && bs.length > 3) {
      d.apply({op: 'removeBlock', at: [s, i]});
    } else if (x === 2) pp({keepNext: b.pPr.keepNext ? null : true});
    else if (x === 3) pp({keepLines: b.pPr.keepLines ? null : true});
    else if (x === 4) {
      pp({widowControl: b.pPr.widowControl === false ? null : false});
    } else if (x === 5) pp({spacing: {before: 20 * pick(60)}});
    else if (x === 6) {
      d.apply({op: 'replaceText', block: [s, i],
        at: pick(b.text.length + 1), del: 0, ins: OBJ,
        inlines: {0: {kind: 'br', level: 'r', brType: 'page'}}});
    } else if (x === 7) {
      pp({pageBreakBefore: b.pPr.pageBreakBefore ? null : true});
    } else if (x === 8 && b.text.length > 3) {
      d.apply({op: 'replaceText', block: [s, i], at: 0,
        del: 1 + pick(Math.min(30, b.text.length - 1)), ins: ''});
    } else if (x === 9) {
      const y = pick(5);
      setSection(d, s, (o) => {
        if (y === 0) {
          const t = TYPES[pick(TYPES.length)];
          if (t) o.type = t;
          else delete o.type;
        } else if (y === 1) {
          o.pgNumType = pick(2) ? {start: pick(5)} : {fmt: 'upperRoman'};
        } else if (y === 2) {
          o.vAlign = ['top', 'center', 'bottom'][pick(3)];
        } else if (y === 3) {
          o.pgSz = {...(o.pgSz || {w: 11906}), h: 8000 + 1000 * pick(9)};
        } else {
          o.pgMar = {...(o.pgMar || {}), top: 1440, bottom: 1440,
            header: 708, footer: 708, gutter: 0, right: 1440,
            left: 1000 + 100 * pick(9)};
        }
        return o;
      });
    } else if (x === 10 && i < bs.length - 1 && secs.length < 10) {
      const sec = secs[s];
      const op = {op: 'splitSection', at: [s, i],
        props: {...sec.props, type: TYPES[pick(4)]}};
      if (sec.raw !== undefined) op.raw = sec.raw;
      d.apply(op);
    } else if (x === 11 && s < secs.length - 1 && secs.length > 2) {
      d.apply({op: 'mergeSection', at: s});
    } else if (x >= 12 && b.type === 'tbl') {
      // (a cell's paragraph grows or shrinks: its row splits again)
      const rr = pick(b.rows.length), cs = b.rows[rr].cells;
      const c = pick(cs.length), j = pick(cs[c].blocks.length);
      const q = cs[c].blocks[j];
      if (q.type !== 'p') return false;
      d.apply({op: 'replaceText', block: [s, i, rr, c, j], at: 0,
        del: x === 13 ? Math.min(q.text.length, 40) : 0,
        ins: x === 13 ? '' : words(30 + pick(200)) + ' '});
      SEEN.cellEdits++;
    } else {
      d.apply({op: 'replaceText', block: [s, i], at: 0, del: 0,
        ins: x === 12 ? 'x' : words(12) + ' '});
    }
  } catch (e) {
    if (!(e instanceof RangeError || e instanceof TypeError)) throw e;
    return false;
  }
  return true;
}

describe('random edits to a real document (review I2)', () => {
  for (let seed = 1; seed <= 8; seed++) {
    it(`seed ${seed}: 150 edits, incremental == fresh exactly`,
      async () => {
        const R = rng(seed * 7919), pick = (n) => Math.floor(R() * n);
        const d = new Document(await docOf(R)), m = tm();
        let L = lay(d, m), P = new Pages(printGalley(L)).finish();
        let kept = 0, done = 0;
        for (let round = 0; round < 150; round++) {
          if (!edit(d, R)) continue;
          const N = lay(d, m, L), G = printGalley(N);
          const Q = new Pages(G, P).finish();
          const F = same(Q, G, P, `seed ${seed} round ${round}`);
          for (const pg of F.list) {
            if (pg.header || pg.footer) SEEN.hfPages++;
            if (pg.start.cuts) SEEN.realCuts++;
            if (!pg.blank && pg.frames[0].frags.some((f) => f.heads)) {
              SEEN.realHeads++;
            }
          }
          kept += Q.kept;
          done++;
          L = N;
          // (the next prev: finished, partly worked out, or a reused
          // Pages left unfinished, as the slices leave it)
          const z = pick(3);
          if (z === 0) P = Q;
          else if (z === 1) {
            P = new Pages(G);
            P.at(pick(Q.count + 2));
          } else {
            P = new Pages(G, P);
            P.step(0);
          }
        }
        assert.ok(done > 100 && kept > done, `${done} ${kept}`);
      });
  }
  it('tables in these runs split rows, repeat header rows and are ' +
    'edited in their cells', () => {
    assert.ok(SEEN.cuts > 100 && SEEN.heads > 100 &&
      SEEN.cellEdits > 30 && SEEN.realCuts > 100 &&
      SEEN.realHeads > 100 && SEEN.storyEdits > 100 &&
      SEEN.titlePg > 30 && SEEN.hfPages > 1000, JSON.stringify(SEEN));
  });
});
