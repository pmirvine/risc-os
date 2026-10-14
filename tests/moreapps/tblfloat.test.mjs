// TblFloat: a floating table's w:tblpPr (and w:tblOverlap) typed for
// layout only (Batch D P12.6, owner ruling R5). Every horzAnchor /
// vertAnchor, each tblpXSpec / tblpYSpec, tblpX / tblpY twips
// (negative too), the four fromText distances, tblOverlap never /
// overlap, absent attributes -> the defaults; anything not
// understood -> unknown. Round trip (Review Focus 6): open, type in
// a cell, save: tblpPr and tblOverlap byte-identical, the tblPr
// order kept (OrderTbl). Corpus-gated (WORD_EDIT_CORPUS=1 for every
// file): every corpus floating table reads without throw; counts by
// unknown printed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {rootScope} from '../../tools/moreapps/!Letters/Ns';
import {readTblPr} from '../../tools/moreapps/!Letters/TblProps';
import {floatOf, isFloating, MAX_POS, MAX_DIST}
  from '../../tools/moreapps/!Letters/TblFloat';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {typeText} from '../../tools/moreapps/!Letters/Edit';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {docMap} from '../../tools/moreapps/!Letters/PicRead';
import {TBLPR} from '../../tools/moreapps/!Letters/OrderTbl';
import {buildDocx, documentXml, p, r, W_NS} from './build-docx.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {corpusFiles, nameOf, SKIP_CORPUS, ALL, CORPUS}
  from './roundtrip-lib.mjs';

// the corpus's floating-table file, read by its path (it is outside
// the one-in-ten sample): run with every corpus file
// (WORD_EDIT_CORPUS=1), as the other corpus round trips (final fix
// B, review 3 M31)
const FLY = join(CORPUS, 'libreoffice', 'ww8export', 'data',
  'clearing-break-with-fly.docx');
const FLY_SKIP = !ALL ? 'set WORD_EDIT_CORPUS=1 (every corpus file)'
  : !existsSync(CORPUS) ? SKIP_CORPUS
    : !existsSync(FLY) ? 'clearing-break-with-fly.docx not in the corpus'
      : false;

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';

/** tblPr inner XML -> its TFloat (and the tblPr). */
function of(inner) {
  const root = parseXml(`<w:tblPr xmlns:w="${W_NS}" ` +
    `xmlns:w14="${W14}">${inner}</w:tblPr>`).root;
  const map = rootScope(root);
  const tp = readTblPr(root, map);
  return {f: floatOf(tp, map), tp, map};
}
const tf = (attrs, more = '') => of(`<w:tblpPr ${attrs}/>${more}`).f;
const DEF = {horz: 'text', vert: 'margin', dist: {t: 0, b: 0, l: 0,
  r: 0}, overlap: true, unknown: false};

describe('TblFloat floatOf', () => {
  it('no tblpPr: null (tblOverlap alone too); not floating', () => {
    assert.equal(of('<w:tblStyle w:val="T"/>').f, null);
    assert.equal(of('<w:tblOverlap w:val="never"/>').f, null);
    assert.equal(floatOf(null, new Map()), null);
    assert.equal(floatOf(undefined, new Map()), null);
    const {tp, map} = of('<w:tblStyle w:val="T"/>');
    assert.equal(isFloating(tp, map), false);
    const g = of('<w:tblpPr w:tblpX="1"/>');
    assert.equal(isFloating(g.tp, g.map), true);
  });
  it('absent attributes take the defaults (17.4.58)', () => {
    assert.deepEqual(tf(''), DEF);
    const f = tf('');
    assert.ok(Object.isFrozen(f) && Object.isFrozen(f.dist));
    assert.equal('x' in f, false);
    assert.equal('xSpec' in f, false);
  });
  it('every horzAnchor and vertAnchor value', () => {
    for (const v of ['text', 'margin', 'page']) {
      assert.equal(tf(`w:horzAnchor="${v}"`).horz, v);
      assert.equal(tf(`w:vertAnchor="${v}"`).vert, v);
      assert.equal(tf(`w:horzAnchor="${v}"`).unknown, false);
    }
    assert.equal(tf('w:horzAnchor="column"').unknown, true);
    assert.equal(tf('w:vertAnchor="paragraph"').unknown, true);
  });
  it('each tblpXSpec and tblpYSpec', () => {
    for (const v of ['left', 'center', 'right', 'inside', 'outside']) {
      const f = tf(`w:tblpXSpec="${v}" w:tblpX="100"`);
      assert.equal(f.xSpec, v);
      assert.equal(f.x, 100);
      assert.equal(f.unknown, false);
    }
    for (const v of ['inline', 'top', 'center', 'bottom', 'inside',
      'outside']) {
      const f = tf(`w:tblpYSpec="${v}"`);
      assert.equal(f.ySpec, v);
      assert.equal(f.unknown, false);
    }
    assert.equal(tf('w:tblpXSpec="inline"').unknown, true);
    assert.equal(tf('w:tblpYSpec="left"').unknown, true);
  });
  it('tblpX / tblpY twips, negative too, at the cap', () => {
    const f = tf('w:tblpX="2880" w:tblpY="-1440"');
    assert.equal(f.x, 2880);
    assert.equal(f.y, -1440);
    assert.equal(tf(`w:tblpX="${MAX_POS}"`).x, MAX_POS);
    assert.equal(tf(`w:tblpY="-${MAX_POS}"`).y, -MAX_POS);
    assert.equal(tf(`w:tblpX="${MAX_POS + 1}"`).unknown, true);
    assert.equal(tf(`w:tblpY="-${MAX_POS + 1}"`).unknown, true);
    assert.equal(tf('w:tblpX="0"').x, 0);
  });
  it('the four fromText distances', () => {
    const f = tf('w:leftFromText="180" w:rightFromText="181" ' +
      'w:topFromText="0" w:bottomFromText="360"');
    assert.deepEqual(f.dist, {t: 0, b: 360, l: 180, r: 181});
    assert.equal(f.unknown, false);
    assert.equal(tf(`w:leftFromText="${MAX_DIST}"`).dist.l, MAX_DIST);
    assert.equal(tf(`w:leftFromText="${MAX_DIST + 1}"`).unknown, true);
    assert.equal(tf('w:topFromText="-1"').unknown, true);
  });
  it('tblOverlap never / overlap', () => {
    assert.equal(tf('', '<w:tblOverlap w:val="never"/>').overlap, false);
    assert.equal(tf('', '<w:tblOverlap w:val="overlap"/>').overlap,
      true);
    assert.equal(tf('', '<w:tblOverlap w:val="never"/>').unknown, false);
    assert.equal(tf('', '<w:tblOverlap w:val="sometimes"/>').unknown,
      true);
    assert.equal(tf('', '<w:tblOverlap/>').unknown, true);
  });
  it('hostile: 1e9, NaN, 1.5, "1in", __proto__, an unknown or ' +
    'foreign attribute, content, two tblpPr: unknown', () => {
    for (const a of ['w:tblpX="1e9"', 'w:tblpY="NaN"', 'w:tblpX="1.5"',
      'w:leftFromText="1in"', 'w:tblpX=""', 'w:tblpX="0x10"',
      'w:__proto__="1"', 'w:constructor="page"', 'w:foo="1"',
      'w14:tblpX="1"', 'w:horzAnchor="__proto__"',
      'w:tblpXSpec="toString"']) {
      const f = tf(a);
      assert.equal(f.unknown, true, a);
      assert.equal(Object.getPrototypeOf(f), Object.prototype, a);
    }
    assert.equal(tf('w:tblpX="1e9"').x, undefined);
    assert.equal(of('<w:tblpPr><w:x/></w:tblpPr>').f.unknown, true);
    assert.equal(of('<w:tblpPr w:tblpX="1"/><w:tblpPr w:tblpX="2"/>')
      .f.unknown, true);
  });
  it('cached per tblPr and map', () => {
    const {tp, map} = of('<w:tblpPr w:tblpX="7"/>');
    assert.equal(floatOf(tp, map), floatOf(tp, map));
  });
});

const FLOAT = '<w:tblpPr w:leftFromText="180" w:rightFromText="180" ' +
  'w:vertAnchor="text" w:horzAnchor="margin" w:tblpX="2000" ' +
  'w:tblpY="200"/><w:tblOverlap w:val="never"/>';
const TBLPR_XML = '<w:tblStyle w:val="TableGrid"/>' + FLOAT +
  '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0"/>';

/** document.xml of docx bytes. */
async function docXml(bytes) {
  const z = await readZip(bytes);
  return new TextDecoder().decode(await z.get('word/document.xml'));
}

describe('TblFloat round trip (Review Focus 6)', () => {
  it('open, type in a cell, save: tblpPr and tblOverlap byte-' +
    'identical, the tblPr order kept', async () => {
    const body = p(r('before')) + tbl([tr([tc(p(r('cell'))),
      tc(p(r('two')))])], {tblPr: TBLPR_XML}) + p(r('after'));
    const bytes = await buildDocx({'word/document.xml':
      documentXml(body)});
    const doc = await readDocx(bytes);
    const d = new Document(doc);
    let cell = null;
    forEachBlock(d.doc, (b) => {
      if (b.type === 'p' && b.text === 'cell') cell = b;
    });
    assert.ok(cell);
    const t = new Typing(d);
    t.command(() => typeText(d, S.caret({id: cell.id, off: 4}),
      ' typed'));
    const out = await writeDocx(d.doc, {date: new Date(2024, 0, 1)});
    const a = await docXml(bytes), b = await docXml(out);
    assert.match(b, /cell typed/);
    const grab = (s, re) => (s.match(re) || [])[0];
    for (const re of [/<w:tblpPr [^>]*\/>/, /<w:tblOverlap [^>]*\/>/]) {
      assert.ok(grab(a, re));
      assert.equal(grab(b, re), grab(a, re));
    }
    const pr = grab(b, /<w:tblPr>.*?<\/w:tblPr>/);
    const names = [...pr.matchAll(/<w:(\w+)/g)].map((m) => m[1])
      .filter((n) => n !== 'tblPr');
    assert.deepEqual(names, ['tblStyle', 'tblpPr', 'tblOverlap', 'tblW',
      'tblLook']);
    const order = names.map((n) => TBLPR.indexOf(n));
    assert.ok(order.every((v) => v >= 0));
    assert.deepEqual(order, [...order].sort((x, y) => x - y));
  });
});

describe('TblFloat: tblpPr written as read (P12b fix wave)', () => {
  it('a tblpPr and tblOverlap written with a space before /> keep ' +
    'it after an edit in the table', async () => {
    const PR = '<w:tblpPr w:leftFromText="141" w:rightFromText="141" ' +
      'w:vertAnchor="text" w:tblpY="1" />';
    const OV = '<w:tblOverlap w:val="never" />';
    const body = tbl([tr([tc(p(r('cell')))])], {tblPr: PR + OV}) +
      p(r('after'));
    const bytes = await buildDocx({'word/document.xml':
      documentXml(body)});
    const d = new Document(await readDocx(bytes));
    let cell = null;
    forEachBlock(d.doc, (b) => {
      if (b.type === 'p' && b.text === 'cell') cell = b;
    });
    new Typing(d).command(() => typeText(d, S.caret({id: cell.id,
      off: 4}), ' typed'));
    const b = await docXml(await writeDocx(d.doc,
      {date: new Date(2024, 0, 1)}));
    assert.match(b, /cell typed/);
    assert.ok(b.includes(PR + OV), b.slice(0, 600));
  });

  it('clearing-break-with-fly.docx: open, type in the floating ' +
    'table, save: its tblpPr and tblOverlap as read',
  {skip: FLY_SKIP}, async () => {
    const bytes = readFileSync(FLY);
    const d = new Document(await readDocx(bytes));
    let cell = null;
    forEachBlock(d.doc, (b) => {
      if (!cell && b.type === 'p') cell = b;
    });
    new Typing(d).command(() => typeText(d, S.caret({id: cell.id,
      off: 0}), 'EDIT '));
    const a = await docXml(bytes);
    const b = await docXml(await writeDocx(d.doc,
      {date: new Date(2024, 0, 1)}));
    assert.match(b, /EDIT /);
    for (const re of [/<w:tblpPr [^>]*>/g, /<w:tblOverlap [^>]*>/g]) {
      assert.deepEqual(b.match(re), a.match(re));
    }
  });
});

describe('TblFloat over the corpus', () => {
  const files = corpusFiles();
  it('every floating table reads without throw (counts printed)',
    {skip: files.length ? false : SKIP_CORPUS}, async () => {
      let tables = 0, unknown = 0, docs = 0;
      const why = new Map();
      for (const f of files) {
        let doc;
        try {
          doc = await readDocx(readFileSync(f));
        } catch {
          continue;                    // (a refused file: not ours)
        }
        let seen = false;
        forEachBlock(doc, (b) => {
          if (b.type !== 'tbl') return;
          const t = floatOf(b.tblPr, docMap(doc));
          if (!t) return;
          seen = true;
          tables++;
          if (t.unknown) {
            unknown++;
            why.set(nameOf(f), (why.get(nameOf(f)) || 0) + 1);
          }
        });
        if (seen) docs++;
      }
      console.log(`TblFloat corpus (${ALL ? 'every file' : 'one in ' +
        'ten; WORD_EDIT_CORPUS=1 for all'}): ${tables} floating ` +
        `tables in ${docs} files, ${unknown} unknown` +
        (why.size ? ': ' + [...why].map(([n, c]) => `${n} ${c}`)
          .join(', ') : ''));
      assert.ok(unknown <= tables);
    });
});
