// What paintPage asks of a 2D context (Batch G1 task 1): every
// method called and property set on g over the pages of up to 40
// corpus documents (git-ignored, optional) and the synthetic
// fixtures pagepaint.test.mjs uses, against SUPPORTED, the surface
// the PDF context implements (exported by !Letters/PdfSink), or in
// EXTRAS, what it asks only of a context that has it (a link: this
// recorder has every name). A name outside them fails the test and
// is printed.
// CENSUS_WHERE=1 prints where each name was first used.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, existsSync, statSync}
  from 'node:fs';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {settle} from '../../tools/moreapps/!Letters/ViewPass';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {docLayout} from './page-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {SUPPORTED, EXTRAS}
  from '../../tools/moreapps/!Letters/PdfSink';
import {buildDocx, documentXml, REL, R_NS} from './build-docx.mjs';

const CORPUS = new URL('./corpus/', import.meta.url).pathname;
const MAX_DOCS = 40, MAX_PAGES = 30;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const long = (i) => Array.from({length: 20 + (i % 7) * 9},
  (_, j) => WORDS[(i + j) % 10]).join(' ');

/** A recording 2D context: seen maps each method called or
 *  property set to the first place that did. */
function recorder(seen) {
  const props = {};
  const note = (k) => {
    if (!seen.has(k)) {
      seen.set(k, process.env.CENSUS_WHERE
        ? new Error().stack.split('\n').slice(3, 6).join(' | ') : '');
    }
  };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') {
        return (s) => { note(k); return {width: 6 * s.length}; };
      }
      if (k in props) return props[k];
      if (k === 'getTransform') {
        return () => { note(k); return {a: 1, b: 0}; };
      }
      return (...a) => { note(k); };
    },
    set(t, k, v) {
      note(k);
      props[k] = v;
      return true;
    },
  });
}

/** Every page (at most MAX_PAGES) of L, P, Pl painted on seen. */
function paintAll(P, Pl, seen) {
  P.finish();
  const n = Math.min(P.count, MAX_PAGES);
  for (let i = 0; i < n; i++) {
    paintPage(P, i, recorder(seen), {place: Pl, marks: false});
  }
  return n;
}

function printed(L, w = 800) {
  L.layout(w);
  const P = new Pages(printGalley(L));
  L.place = PlacePrint(L, P);
  L.layout(w);
  return {P, Pl: L.place};
}

/** Corpus .docx files, spread evenly, at most MAX_DOCS. */
function corpusFiles() {
  if (!existsSync(CORPUS)) return [];
  const all = [];
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const q = d + f;
      if (statSync(q).isDirectory()) walk(q + '/');
      else if (/\.docx$/i.test(f)) all.push(q);
    }
  };
  walk(CORPUS);
  const step = Math.max(1, Math.floor(all.length / MAX_DOCS));
  return all.filter((_, i) => i % step === 0).slice(0, MAX_DOCS);
}

describe('what paintPage asks of the context (G1)', () => {
  const seen = new Map();
  before(loadStyles);

  it('synthetic fixtures: text, columns, headers, a picture',
    async () => {
      const d = mk(Array.from({length: 120}, (_, i) => long(i)));
      let {P, Pl} = printed(new DocLayout(d.doc, tm()));
      assert.ok(paintAll(P, Pl, seen) >= 2);
      const SEP = '<w:sectPr><w:cols w:num="2" w:space="720" ' +
        'w:sep="1"/></w:sectPr>';
      const {L} = await docLayout(Array.from({length: 40},
        (_, i) => p(r(long(i)))).join('') + SEP);
      ({P, Pl} = printed(L));
      paintAll(P, Pl, seen);
      const png = pngBytes(4, 2);
      const pics = {get: () => ({state: 'ready',
        bitmap: {width: 4, height: 2}})};
      const doc = await readDocx(await wordHf({pic: png, default: {
        hdr: p(picRun('rIdP1') + r('Logo')), ftr: p(r('Foot'))}}));
      const H = new DocLayout(doc, tm(), null, {pics});
      ({P, Pl} = printed(H));
      paintAll(P, Pl, seen);
      assert.ok(seen.has('drawImage'));
      const ldoc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('See ') + '<w:hyperlink r:id="rIdL1"><w:r>' +
          '<w:t>the site</w:t></w:r></w:hyperlink>'), {rNs: R_NS})},
      {docRels: [['rIdL1', REL('hyperlink'), 'https://example.com/',
        'External']]}));
      ({P, Pl} = printed(new DocLayout(ldoc, tm())));
      paintAll(P, Pl, seen);
      assert.ok(seen.has('link'));
    });

  it('corpus documents, settled as the window settles them',
    async (t) => {
      const files = corpusFiles();
      if (!files.length) return t.skip('no corpus');
      let docs = 0;
      for (const f of files) {
        let doc;
        try {
          doc = await readDocx(readFileSync(f));
        } catch { continue; }
        try {
          const B = new DocLayout(doc, tm(), null, {floats: true});
          B.layout(800);
          const {L, P} = settle(doc, {L: B});
          L.place = PlacePrint(L, P);
          L.layout(L.width);
          paintAll(P, L.place, seen);
          docs++;
        } catch { /* a hostile file: not this test's business */ }
      }
      assert.ok(docs > 0, 'no corpus document painted');
      console.log(`census: ${docs} corpus documents`);
    });

  it('every name is in SUPPORTED', () => {
    const extra = [...seen.keys()].filter((k) => !SUPPORTED.has(k) &&
      !EXTRAS.has(k));
    if (process.env.CENSUS_WHERE) {
      for (const [k, w] of seen) console.log(k, '<-', w);
    }
    assert.deepEqual(extra, [], 'outside SUPPORTED: ' + extra);
  });
});
