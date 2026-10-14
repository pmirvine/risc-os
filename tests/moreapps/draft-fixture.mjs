// Test-only: eight documents laid out by DocLayout in the Draft
// galley (plain, lists, borders, breaks, pictures, tables, two
// sections of one size, a landscape second section), and what that
// layout gave BEFORE Batch D P1.3 gave each section its own width
// (commit 77f36e6c, the tree after P1.2), in draft-layout.json:
// every root item's {id, kind, x, w, y, h}, 40 caretRect samples and
// 40 hitTest samples. draft-layout.test.mjs lays them out with
// today's modules and compares (the landscape document's first
// section only: its second is now laid out at the landscape width).
// To make the snapshot again (only from the P1.2 tree):
//   git archive 77f36e6c tools/moreapps | tar -x -C <dir>
//   node tests/moreapps/draft-fixture.mjs <dir>/tools/moreapps
// (writes draft-layout.json next to this file).
import {writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {notableDocs} from './notable-fixture.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';

export const VIEW_W = 1000;
const LONG = 'The quick brown fox jumps over the lazy dog, and then ' +
  'runs on through the long grass until the line has to wrap twice.';
const MAR = '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
  'w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>';
const sect = (w, h, more = '') => `<w:sectPr>${more}<w:pgSz ` +
  `w:w="${w}" w:h="${h}"${w > h ? ' w:orient="landscape"' : ''}/>` +
  `${MAR}</w:sectPr>`;
const doc = (body) => buildDocx({'word/document.xml':
  documentXml(body)});

/** The eight documents: [[name, Promise<Uint8Array>]]. */
export function draftDocs() {
  const old = new Map(notableDocs());
  return [
    ...['plain', 'lists', 'borders', 'breaks', 'pictures']
      .map((n) => [n, old.get(n)]),
    ['tables', doc([
      p(r('Before the table ' + LONG)),
      tbl([tr([tc(p(r('one ' + LONG))), tc(p(r('two')))]),
        tr([tc(p(r('three'))), tc([p(r('four')), p(r(LONG))])])],
      {grid: [3000, 4000]}),
      p(r('Between')),
      tbl([tr([tc(p(r('auto width ' + LONG)))])],
        {tblPr: '<w:tblW w:w="0" w:type="auto"/>', grid: [9026]}),
      p(r('After ' + LONG)),
    ].join(''))],
    ['twosect', doc([
      p(r('First section ' + LONG)),
      p(r('Its last paragraph ' + LONG), sect(11906, 16838,
        '<w:type w:val="nextPage"/>')),
      p(r('Second section ' + LONG)),
      p(r('The end ' + LONG)),
      sect(11906, 16838),
    ].join(''))],
    ['landscape', doc([
      p(r('Portrait section ' + LONG)),
      p(r('Its last paragraph ' + LONG), sect(11906, 16838,
        '<w:type w:val="nextPage"/>')),
      p(r('Landscape section ' + LONG + ' ' + LONG)),
      p(r('The end ' + LONG)),
      sect(16838, 11906),
    ].join(''))],
  ];
}

/** 8 px per UTF-16 unit, 9 when bold (as ./word-docs fake). */
const fake = (t, css) => (css.includes('bold') ? 9 : 8) * t.length;
const end = (it) => (it.kind === 'p' ? it.block.text.length : 1);

/** What a layout L gives (plain data: what JSON keeps). */
export function sample(L) {
  const {items} = L;
  const n = items.length;
  const out = {items: items.map((it) => ({id: it.id, kind: it.kind,
    x: it.x, w: it.w, y: it.y, h: it.h}))};
  out.carets = [];
  for (let k = 0; k < 40; k++) {
    const it = L.flow[(k * 7) % L.flow.length];
    const off = Math.floor(end(it) * ((k * 13) % 11) / 10);
    const aff = k % 2 ? 'up' : 'down';
    const pos = {id: it.id, off};
    out.carets.push({pos, aff, rect: L.caretRect(pos, aff)});
  }
  out.hits = [];
  const x0 = L.left - 30, xw = L.textW + 60;
  for (let k = 0; k < 40; k++) {
    const x = x0 + xw * ((k * 17) % 40) / 39;
    const y = L.height * k / 39 - 10;
    out.hits.push({x, y, hit: L.hitTest(x, y)});
  }
  if (!n) throw new Error('no items');
  return JSON.parse(JSON.stringify(out));
}

/** Lay every document out with the modules in `dir` (old or new). */
export async function sampleAll(dir) {
  const u = (m) => pathToFileURL(dir + '/' + m).href;
  const {readDocx} = await import(u('!Letters/DocxRead'));
  const {DocLayout} = await import(u('!Letters/DocLayout'));
  const {TextMetrics} = await import(u('!WimpLib/TextMetrics'));
  const out = {};
  for (const [name, bytes] of draftDocs()) {
    const d = await readDocx(await bytes);
    const L = new DocLayout(d, new TextMetrics(fake));
    L.layout(VIEW_W);
    out[name] = sample(L);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('./draft-layout.json',
    import.meta.url));
  writeFileSync(out, JSON.stringify(await sampleAll(process.argv[2]),
    null, 1) + '\n');
  console.log('wrote', out);
}
