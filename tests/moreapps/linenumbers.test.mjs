// Line numbers on pages (Batch D P11.1, D24): a section's lnNumType
// numbers the body lines of its pages in the left margin (Print
// layout only, computed per page from the page's fragments):
// countBy (every countBy-th number shown), start (PG28: as written;
// 1 when absent; a number below 1 is counted, never shown), distance
// (default 0.25 in, 360 twips: the number's right edge that far left
// of its column), restart newPage (default) / newSection /
// continuous. Not numbered: lines in tables, paragraphs with
// suppressLineNumbers in force (direct or by style), a section
// without lnNumType; empty paragraphs ARE counted (PG29). Also
// suppressLineNumbers typed in pPr (read, written, round trip), the
// Paragraph box's Suppress line numbers option (ParaPatch, Format
// query, FormatCheck), the lnNumType distance with a unit (Strict)
// typed, and the numbers painted by PagePaint, right aligned, in the
// Line Number character style (else Normal's font).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {docLayout} from './page-fixtures.mjs';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {numbersOf, numberFont, DISTANCE, MAX_SHOWN}
  from '../../tools/moreapps/!Letters/LineNumbers';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readSect} from '../../tools/moreapps/!Letters/ReadSect';
import {sectFields} from '../../tools/moreapps/!Letters/WriteSect';
import {paraPatch} from '../../tools/moreapps/!Letters/FormatCheck';
import {fill, patch, NAMES}
  from '../../tools/moreapps/!Letters/ParaPatch';
import {query} from '../../tools/moreapps/!Letters/Format';
import {explicit} from '../../tools/moreapps/!Letters/FormatPara';
import {resolver} from '../../tools/moreapps/!Letters/FormatEff';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {W} from '../../tools/moreapps/!Letters/Ns';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {buildDocx, documentXml, stylesXml} from './build-docx.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {entryText} from './docx-compare.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {newPara} from '../../tools/moreapps/!Letters/Model';

before(loadStyles);

const P_ = (t, pPr = '') => `<w:p>${pPr ? '<w:pPr>' + pPr +
  '</w:pPr>' : ''}${t ? '<w:r><w:t>' + t + '</w:t></w:r>' : ''}</w:p>`;
const PBB = '<w:pageBreakBefore/>';
const SUP = '<w:suppressLineNumbers/>';
const LN = (a = '') => `<w:lnNumType w:countBy="1" ${a}/>`;
const SECT = (inner, type = '') => '<w:sectPr>' +
  (type ? `<w:type w:val="${type}"/>` : '') + inner + '</w:sectPr>';

/** Body laid out and paginated (all pages worked out unless lazy). */
async function paged(body, parts, lazy) {
  const {L, G, doc} = await docLayout(body, parts);
  const P = new Pages(G);
  if (!lazy) P.finish();
  return {L, G, P, doc};
}
const texts = (P, i) => numbersOf(P, i).map((x) => x.text);
const words = (n, w = 'word') => Array.from({length: n}, () => w)
  .join(' ');

/** The baseline (page y) of line j of root item k on page i, the
 *  fragment moved by whole px as PrintFrags places it. */
function baseOf(P, i, k, j = 0) {
  const it = P.G.items[k];
  for (const fr of P.at(i).frames) {
    for (const f of fr.frags) {
      if (f.id !== it.id) continue;
      return it.y + Math.round(f.y - it.y) + it.lines[j].y +
        it.lines[j].base;
    }
  }
  return null;
}

describe('LineNumbers.numbersOf (P11.1, D24)', () => {
  it('countBy 5 shows 5, 10, ... on each line that number falls on',
    async () => {
      const body = Array.from({length: 12}, (_, i) => P_('p' + i))
        .join('') + SECT('<w:lnNumType w:countBy="5"/>');
      const {P} = await paged(body);
      const ns = numbersOf(P, 0);
      assert.deepEqual(ns.map((x) => x.text), ['5', '10']);
      assert.equal(ns[0].y, baseOf(P, 0, 4));
      assert.equal(ns[1].y, baseOf(P, 0, 9));
    });

  const THREE = (restart) => {
    const ln = LN(restart ? `w:restart="${restart}"` : '');
    return P_('a1') + P_('a2') + P_('a3') + P_('b1', PBB) +
      P_('b2', SECT(ln)) + P_('c1') + P_('c2') + SECT(ln);
  };
  for (const [restart, want] of [
    [null, [['1', '2', '3'], ['1', '2'], ['1', '2']]],
    ['newPage', [['1', '2', '3'], ['1', '2'], ['1', '2']]],
    ['newSection', [['1', '2', '3'], ['4', '5'], ['1', '2']]],
    ['continuous', [['1', '2', '3'], ['4', '5'], ['6', '7']]]]) {
    it(`restart ${restart || '(none: newPage)'} across 3 pages`,
      async () => {
        const {P} = await paged(THREE(restart));
        assert.equal(P.count, 3);
        assert.deepEqual([0, 1, 2].map((i) => texts(P, i)), want);
      });
  }

  it('asked for a later page first (pages not worked out yet): the ' +
    'same numbers', async () => {
    const {P} = await paged(THREE('continuous'), undefined, true);
    assert.deepEqual(texts(P, 2), ['6', '7']);
    assert.deepEqual(texts(P, 1), ['4', '5']);
  });

  it('a suppressed paragraph is skipped (direct, or by its style; ' +
    'w:val="0" turns the style\'s off)', async () => {
    const styles = {'word/styles.xml': stylesXml(
      '<w:style w:type="paragraph" w:styleId="NoNum"><w:name ' +
      'w:val="No Num"/><w:pPr>' + SUP + '</w:pPr></w:style>')};
    const body = P_('a') + P_('b', SUP) + P_('c') +
      P_('d', '<w:pStyle w:val="NoNum"/>') +
      P_('e', '<w:pStyle w:val="NoNum"/>' +
        '<w:suppressLineNumbers w:val="0"/>') + P_('f') + SECT(LN());
    const {P} = await paged(body, styles);
    const ns = numbersOf(P, 0);
    assert.deepEqual(ns.map((x) => x.text), ['1', '2', '3', '4']);
    assert.deepEqual(ns.map((x) => x.y), [0, 2, 4, 5]
      .map((k) => baseOf(P, 0, k)));
  });

  it('the lines of a table are skipped', async () => {
    const t = tbl([tr([tc(P_('x1') + P_('x2')), tc(P_('y1'))])]);
    const {P} = await paged(P_('a') + t + P_('b') + SECT(LN()));
    const ns = numbersOf(P, 0);
    assert.deepEqual(ns.map((x) => x.text), ['1', '2']);
    assert.equal(ns[1].y, baseOf(P, 0, 2));
  });

  it('empty paragraphs are counted (PG29)', async () => {
    const {P} = await paged(P_('a') + P_('') + P_('b') + SECT(LN()));
    assert.deepEqual(texts(P, 0), ['1', '2', '3']);
  });

  it('a section without lnNumType is not numbered; a later one ' +
    'that is starts at its start', async () => {
    const body = P_('a') + P_('b', SECT('')) + P_('c') +
      SECT(LN('w:restart="continuous"'));
    const {P} = await paged(body);
    assert.deepEqual([0, 1].map((i) => texts(P, i)), [[], ['1']]);
  });

  it('no lnNumType anywhere: nothing; a page not there: nothing',
    async () => {
      const {P} = await paged(P_('a') + P_('b'));
      assert.deepEqual(numbersOf(P, 0), []);
      for (const i of [-1, 7, 1e9, NaN, '__proto__']) {
        assert.deepEqual(numbersOf(P, i), [], String(i));
      }
    });

  it('start as written (PG28); below 1 counted, not shown', async () => {
    const {P} = await paged(P_('a') + P_('b') + P_('c') +
      SECT(LN('w:start="3"')));
    assert.deepEqual(texts(P, 0), ['3', '4', '5']);
    const z = await paged(P_('a') + P_('b') + SECT(LN('w:start="0"')));
    assert.deepEqual(texts(z.P, 0), ['1']);
  });

  it('countBy above 100 (Word\'s limit) counts as any value (P11 ' +
    'fix M1)', async () => {
    const {P} = await paged(P_('a') + P_('b') + P_('c') +
      SECT('<w:lnNumType w:countBy="101" w:start="100"/>'));
    assert.deepEqual(texts(P, 0), ['101']);
  });

  it('a number longer than MAX_SHOWN\'s 9 digits is counted, not ' +
    'drawn (P11 fix M2)', async () => {
    assert.equal(MAX_SHOWN, 999999999);
    const {P} = await paged(P_('a') + P_('b') + P_('c') +
      SECT(LN('w:start="999999998"')));
    assert.deepEqual(texts(P, 0), ['999999998', '999999999']);
    const z = await paged(P_('a') + SECT(LN('w:start="2147483647"')));
    assert.deepEqual(texts(z.P, 0), []);
  });

  it('distance: 0.25 in when absent, else as written (px = twips / ' +
    '15), from the column\'s left edge', async () => {
    assert.equal(DISTANCE, 360);
    const a = await paged(P_('a') + SECT(LN()));
    const x0 = a.P.at(0).frames[0].x;
    assert.equal(numbersOf(a.P, 0)[0].x, x0 - 24);
    const b = await paged(P_('a') + SECT(LN('w:distance="720"')));
    assert.equal(numbersOf(b.P, 0)[0].x, x0 - 48);
  });

  it('a paragraph split across pages: every line numbered once, in ' +
    'order (continuous)', async () => {
    const sect = SECT('<w:pgSz w:w="6000" w:h="3600"/><w:pgMar ' +
      'w:top="720" w:right="720" w:bottom="720" w:left="720" ' +
      'w:header="0" w:footer="0" w:gutter="0"/>' +
      LN('w:restart="continuous"'));
    const body = Array.from({length: 6}, (_, i) => P_(words(30 + i)))
      .join('') + sect;
    const {P} = await paged(body);
    assert.ok(P.count > 3, 'several pages');
    const all = [];
    for (let i = 0; i < P.count; i++) all.push(...texts(P, i));
    const lines = P.G.items.reduce((n, it) => n + it.lines.length, 0);
    assert.deepEqual(all, Array.from({length: lines},
      (_, j) => String(j + 1)));
  });

  it('two columns: each column\'s numbers at its own left edge, the ' +
    'count going on', async () => {
    const body = P_('a') +
      P_('b</w:t><w:br w:type="column"/><w:t>b2') +
      P_('c') + SECT('<w:cols w:num="2" w:space="720"/>' + LN());
    const {P} = await paged(body);
    const fr = P.at(0).frames;
    assert.equal(fr.length, 2);
    const ns = numbersOf(P, 0);
    assert.deepEqual(ns.map((x) => x.text), ['1', '2', '3', '4']);
    assert.deepEqual(ns.map((x) => x.x), [fr[0].x, fr[0].x, fr[1].x,
      fr[1].x].map((x) => x - 24));
  });
});

describe('suppressLineNumbers in pPr: read, written, round trip', () => {
  const doc = (pPr) => buildDocx({'word/document.xml':
    documentXml(P_('a', pPr) + P_('b'))});

  it('typed: true, w:val="0" false', async () => {
    const d = await readDocx(await doc('<w:numPr><w:ilvl w:val="0"/>' +
      '</w:numPr>' + SUP));
    assert.equal(d.sections[0].blocks[0].pPr.suppressLineNumbers, true);
    assert.deepEqual(d.sections[0].blocks[0].pPr.extra, []);
    const off = await readDocx(await doc(
      '<w:suppressLineNumbers w:val="0"/>'));
    assert.equal(off.sections[0].blocks[0].pPr.suppressLineNumbers,
      false);
  });

  for (const pPr of [SUP, '<w:suppressLineNumbers w:val="0"/>',
    '<w:keepNext/>' + SUP + '<w:pBdr><w:top w:val="single" ' +
    'w:sz="4" w:space="1" w:color="auto"/></w:pBdr>']) {
    it('written back as read: ' + pPr.slice(0, 40), async () => {
      const bytes = await doc(pPr);
      const back = await writeDocx(await readDocx(bytes));
      assert.equal(await entryText(back, 'word/document.xml'),
        await entryText(bytes, 'word/document.xml'));
    });
  }

  it('set by the model: written in pPr order', async () => {
    const d = await readDocx(await doc('<w:keepNext/><w:jc ' +
      'w:val="center"/>'));
    const p0 = d.sections[0].blocks[0];
    d.sections[0].blocks[0] = {...p0,
      pPr: {...p0.pPr, suppressLineNumbers: true}};
    const xml = await entryText(await writeDocx(d),
      'word/document.xml');
    assert.match(xml, /<w:keepNext\/><w:suppressLineNumbers\/><w:jc /);
  });
});

describe('Suppress line numbers in the Paragraph box', () => {
  it('ParaPatch: nolines shows the flag; changed, it patches it', () => {
    assert.ok(NAMES.includes('nolines'));
    assert.equal(fill({suppressLineNumbers: true}).nolines, true);
    assert.equal(fill({suppressLineNumbers: null}).nolines, undefined);
    const q = {suppressLineNumbers: false};
    assert.deepEqual(patch({...fill(q), nolines: true}, q).patch,
      {suppressLineNumbers: true});
    assert.deepEqual(patch(fill(q), q).patch, {});
  });

  it('FormatCheck takes it as a flag', () => {
    assert.deepEqual(paraPatch({suppressLineNumbers: true}),
      {suppressLineNumbers: true});
    assert.throws(() => paraPatch({suppressLineNumbers: 1}));
  });

  it('Format query: the flag in force; explicit against the style',
    async () => {
      const styles = {'word/styles.xml': stylesXml(
        '<w:style w:type="paragraph" w:styleId="NoNum"><w:name ' +
        'w:val="No Num"/><w:pPr>' + SUP + '</w:pPr></w:style>')};
      const d = await readDocx(await buildDocx({'word/document.xml':
        documentXml(P_('a') + P_('b', '<w:pStyle w:val="NoNum"/>')),
      ...styles}));
      const [a, b] = d.sections[0].blocks;
      const q = (p) => query(d, S.caret({id: p.id, off: 0}));
      assert.equal(q(a).suppressLineNumbers, false);
      assert.equal(q(b).suppressLineNumbers, true);
      const res = resolver(d);
      assert.deepEqual(explicit({suppressLineNumbers: true}, a, res)
        .pPr, {suppressLineNumbers: true});
      assert.deepEqual(explicit({suppressLineNumbers: false}, a, res)
        .pPr, {suppressLineNumbers: null});
      assert.deepEqual(explicit({suppressLineNumbers: false}, b, res)
        .pPr, {suppressLineNumbers: false});
    });
});

describe('lnNumType distance with a unit (Strict)', () => {
  const MAP = new Map([['w', W]]);
  const node = (x) => parseXml(`<w:sectPr xmlns:w="${W}">` +
    x + '</w:sectPr>').root;

  it('read as twips, the string kept; written back as read while ' +
    'the value is the same, in twips once changed', () => {
    const p = readSect(node('<w:lnNumType w:countBy="1" ' +
      'w:distance="0.25in"/>'), MAP);
    assert.deepEqual(p.lnNumType, {countBy: 1, distance: 360});
    assert.deepEqual(p.units, {lnNumType: {distance: '0.25in'}});
    const attr = (pp) => sectFields(pp)[0].attrs;
    assert.deepEqual(attr(p), [['w:countBy', '1'],
      ['w:distance', '0.25in']]);
    assert.deepEqual(attr({...p, lnNumType: {countBy: 1,
      distance: 720}}), [['w:countBy', '1'], ['w:distance', '720']]);
  });

  it('a negative distance with a unit stays raw', () => {
    const p = readSect(node('<w:lnNumType w:distance="-1in"/>'), MAP);
    assert.equal(p.lnNumType, undefined);
    assert.equal(p.extra.length, 1);
  });
});

describe('the numbers painted (PagePaint)', () => {
  /** A context recording fillText with its font and alignment. */
  function rec() {
    const seen = [], props = {};
    const g = new Proxy({}, {
      get(t, k) {
        if (k in props) return props[k];
        if (k === 'fillText') {
          return (s, x, y) => seen.push({s: String(s), x, y,
            font: props.font, align: props.textAlign,
            fill: props.fillStyle});
        }
        if (k === 'measureText') return (s) => ({width: 6 * s.length});
        return () => {};
      },
      set(t, k, v) { props[k] = v; return true; },
    });
    return {g, seen};
  }

  it('right aligned at x, on the baseline, in Normal\'s font', async () => {
    const {L, P} = await paged(P_('a') + P_('b') + SECT(LN()));
    const {g, seen} = rec();
    paintPage(P, 0, g, {place: PlacePrint(L, P)});
    const ns = numbersOf(P, 0);
    const got = seen.filter((c) => c.s === '1' || c.s === '2');
    assert.deepEqual(got.map((c) => [c.s, c.x, c.y, c.align]),
      ns.map((n) => [n.text, n.x, n.y, 'right']));
    assert.equal(got[0].font, numberFont(L.doc.styles).css);
    assert.match(got[0].font, /14\.67px/);
  });

  it('the Line Number character style when the document has it', async () => {
    const styles = {'word/styles.xml': stylesXml(
      '<w:style w:type="character" w:styleId="LineNumber"><w:name ' +
      'w:val="line number"/><w:rPr><w:sz w:val="16"/>' +
      '<w:color w:val="FF0000"/></w:rPr></w:style>')};
    const {L, P} = await paged(P_('a') + SECT(LN()), styles);
    const f = numberFont(L.doc.styles);
    assert.match(f.css, /10\.67px/);
    assert.equal(f.colour, '#FF0000');
    const {g, seen} = rec();
    paintPage(P, 0, g, {place: PlacePrint(L, P)});
    const one = seen.find((c) => c.s === '1');
    assert.equal(one.font, f.css);
    assert.equal(one.fill, '#FF0000');
  });
});

// P11 fix I2: the counts of the pages a Pages keeps from the last one
// are taken over (LineNumbers inherit), and with no continuous
// restart a page's count is walked from its section's first page.
// Both must give exactly a fresh pagination's numbers, in any order.
describe('carried counts and section walks equal a fresh pagination ' +
  '(P11 fix I2)', () => {
  const PG = '<w:pgSz w:w="6000" w:h="3600"/><w:pgMar w:top="720" ' +
    'w:right="720" w:bottom="720" w:left="720" w:header="0" ' +
    'w:footer="0" w:gutter="0"/>';
  const RESTARTS = [null, 'newPage', 'newSection', 'continuous'];
  /** A seeded random generator (mulberry32). */
  const rnd = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Random sections; noCont: no continuous restart. */
  function body(r, noCont) {
    const n = 1 + Math.floor(r() * 4);
    let out = '';
    for (let s = 0; s < n; s++) {
      const rs = RESTARTS[Math.floor(r() * (noCont ? 3 : 4))];
      const ln = rs === null && r() < 0.3 ? ''
        : LN(rs ? `w:restart="${rs}"` : '');
      const sect = SECT(PG + ln, r() < 0.4 ? 'continuous' : '');
      const k = 2 + Math.floor(r() * 8);
      for (let j = 0; j < k; j++) {
        const t = words(1 + Math.floor(r() * 40));
        out += j === k - 1 && s < n - 1 ? P_(t, sect)
          : P_(t, r() < 0.15 ? SUP : '');
      }
      if (s === n - 1) out += sect;
    }
    return out;
  }
  const all = (P) => {
    const out = [];
    for (let i = 0; i < P.count; i++) out.push(texts(P, i));
    return out;
  };
  /** Pages asked in a random order (the last first, then shuffled). */
  function shuffled(P, r) {
    const n = P.count, order = [n - 1];
    for (let i = 0; i < n - 1; i++) order.push(i);
    for (let i = order.length - 1; i > 1; i--) {
      const j = 1 + Math.floor(r() * i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const out = [];
    for (const i of order) out[i] = texts(P, i);
    return out;
  }

  it('asked last first, no continuous restart (section walks)',
    async () => {
      for (let seed = 1; seed <= 30; seed++) {
        const r = rnd(seed), b = body(r, true);
        const fresh = all((await paged(b)).P);
        const {P} = await paged(b, undefined, true);
        P.at(1e9);
        assert.deepEqual(shuffled(P, r), fresh, `seed ${seed}`);
      }
    });

  it('a newSection section starting mid-page (continuous break): ' +
    'its lines on the page before counted', async () => {
    const b = P_('a', SECT(PG + LN())) + P_(words(60)) + P_(words(60)) +
      SECT(PG + LN('w:restart="newSection"'), 'continuous');
    const fresh = all((await paged(b)).P);
    const {P} = await paged(b, undefined, true);
    P.at(1e9);
    assert.ok(P.count > 1 && P.at(1).s === 1 && P.at(0).s === 0);
    assert.notEqual(fresh[1][0], '1');
    assert.deepEqual(texts(P, P.count - 1), fresh[P.count - 1]);
    assert.deepEqual(texts(P, 1), fresh[1]);
  });

  it('a Pages made from the last after an edit (counts taken over)',
    async () => {
      const m = tm();
      for (let seed = 1; seed <= 40; seed++) {
        const r = rnd(1000 + seed);
        const doc = await readDocx(await buildDocx({
          'word/document.xml': documentXml(body(r, r() < 0.5))}));
        const d = new Document(doc);
        const L0 = new DocLayout(d.doc, m);
        L0.layout(1000);
        const P0 = new Pages(galleyOf(L0)).finish();
        all(P0);                      // its counts worked out
        const s = Math.floor(r() * d.doc.sections.length);
        const k = Math.floor(r() * d.doc.sections[s].blocks.length);
        if (r() < 0.5) {
          d.apply({op: 'insertBlock', at: [s, k],
            block: newPara(words(1 + Math.floor(r() * 30)))});
        } else {
          d.apply({op: 'replaceText', block: [s, k], at: 0, del: 0,
            ins: words(1 + Math.floor(r() * 20)) + ' '});
        }
        const L1 = new DocLayout(d.doc, m, L0);
        L1.layout(1000);
        const P1 = new Pages(galleyOf(L1), P0);
        P1.finish();
        const fresh = all(new Pages(galleyOf(L1)).finish());
        assert.deepEqual(shuffled(P1, r), fresh, `seed ${seed}`);
      }
    });
});
