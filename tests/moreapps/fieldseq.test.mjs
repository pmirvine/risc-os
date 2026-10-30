// FieldSeq (Batch E3): SEQ numbering in document order, per
// identifier, with resets by heading, \r, \c, \h and number formats;
// the Fields entry; memo; hostile input.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {counters} from '../../tools/moreapps/!Letters/FieldSeq';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {evaluate, REGISTRY}
  from '../../tools/moreapps/!Letters/Fields';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';

const fc = (t) => `<w:r><w:fldChar w:fldCharType="${t}"/></w:r>`;
const it_ = (s) => `<w:r><w:instrText xml:space="preserve">${s}` +
  '</w:instrText></w:r>';
const fld = (instr, res = 'x') => fc('begin') + it_(instr) +
  fc('separate') + r(res) + fc('end');
const seq = (a) => p(fld(` SEQ ${a} `));
const style = (id, name, inner = '') => `<w:style w:type="paragraph" ` +
  `w:styleId="${id}"><w:name w:val="${name}"/><w:pPr>${inner}` +
  '</w:pPr></w:style>';
const STYLES = stylesXml(style('Normal', 'Normal') +
  style('Heading1', 'heading 1', '<w:outlineLvl w:val="0"/>') +
  style('Heading2', 'heading 2', '<w:outlineLvl w:val="1"/>'));
const H = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES}));
/** The texts of the SEQ fields of the body, in order. */
const shown = (doc) => {
  const m = counters(doc);
  return scan(doc).filter((f) => /^\s*SEQ/i.test(f.instr))
    .map((f) => m.get(f.begin));
};
const run = async (body) => shown(await read(body));

describe('counting', () => {
  it('counts per identifier, case-insensitive', async () => {
    assert.deepEqual(await run(seq('Figure') + seq('Table') +
      seq('figure') + seq('FIGURE') + seq('Table') + seq('Eq')),
    ['1', '1', '2', '3', '2', '1']);
  });

  it('\\r, \\c and \\n', async () => {
    assert.deepEqual(await run(seq('F') + seq('F \\r 5') +
      seq('F') + seq('F \\c') + seq('F \\c') + seq('F \\n') +
      seq('G \\c') + seq('G')),
    ['1', '5', '6', '6', '6', '7', '0', '1']);
  });

  it('\\h hides but counts; a bookmark argument is ignored',
    async () => {
      assert.deepEqual(await run(seq('F \\h') + seq('F') +
        seq('F bm1') + seq('F bm2 \\h') + seq('F \\* roman')),
      ['', '2', '3', '', 'v']);
    });

  it('formats', async () => {
    const body = seq('F') + seq('F \\* ROMAN') + seq('F \\* roman') +
      seq('F \\* ALPHABETIC') + seq('F \\* alphabetic') +
      seq('F \\* ARABIC') + seq('F \\* MERGEFORMAT');
    assert.deepEqual(await run(body),
      ['1', 'II', 'iii', 'D', 'e', '6', '7']);
  });

  it('unsupported format or switch: no entry; format still counts',
    async () => {
      const d = await read(seq('F \\* CardText') + seq('F') +
        seq('F \\z') + seq('F') + seq('') + seq('F \\r x') +
        seq('F \\r 99999999999999999999') + seq('F \\s 0') +
        seq('F'));
      assert.deepEqual(shown(d), [undefined, '2', undefined, '3',
        undefined, undefined, undefined, undefined, '4']);
      const f = scan(d)[0];
      assert.equal(REGISTRY.get('SEQ').eval({doc: d}, f), null);
      assert.equal(evaluate({doc: d}, f), null);
      assert.equal(evaluate({doc: d}, scan(d)[1]), '2');
      assert.equal(evaluate({}, scan(d)[1]), null);
    });

  it('a locked field is counted but evaluate keeps its result',
    async () => {
      const d = await read(p(fc('begin').replace('<w:fldChar ',
        '<w:fldChar w:fldLock="1" ') + it_(' SEQ F ') + fc('separate') +
        r('9') + fc('end')) + seq('F'));
      assert.deepEqual(shown(d), ['1', '2']);
      assert.equal(evaluate({doc: d}, scan(d)[0]), null);
    });
});

describe('mixed-case formats', () => {
  it('Alphabetic and Roman keep the stored result but count; ' +
    'upper and lower compute; one bad \\* spoils the field',
  async () => {
    const d = await read(seq('F') + seq('F \\* Alphabetic') +
      seq('F') + seq('F \\* Roman') + seq('F') +
      seq('F \\* ALPHABETIC') + seq('F \\* roman') +
      seq('F \\* ALPHABETIC \\* Roman') +
      seq('F \\* Upper \\* Alphabetic') + seq('F'));
    assert.deepEqual(shown(d), ['1', undefined, '3', undefined, '5',
      'F', 'vii', undefined, undefined, '10']);
    assert.equal(evaluate({doc: d}, scan(d)[1]), null);
    assert.equal(evaluate({doc: d}, scan(d)[2]), '3');
  });
});

describe('resets by heading', () => {
  it('\\s 1: chapter numbering 1,2,1,2,3', async () => {
    const body = H(1, 'A') + seq('F \\s 1') + seq('F \\s 1') +
      H(1, 'B') + seq('F \\s 1') + seq('F \\s 1') + seq('F \\s 1');
    assert.deepEqual(await run(body), ['1', '2', '1', '2', '3']);
  });

  it('a lower heading does not reset \\s 1; \\s 2 resets at both',
    async () => {
      const body = H(1, 'A') + seq('F \\s 1') + H(2, 'a') +
        seq('F \\s 1') + seq('G \\s 2') + seq('G \\s 2') + H(2, 'b') +
        seq('G \\s 2') + H(1, 'C') + seq('G \\s 2') + seq('F \\s 1');
      assert.deepEqual(await run(body),
        ['1', '2', '1', '2', '1', '1', '1']);
    });

  it('each identifier resets on its own; no heading, no reset',
    async () => {
      const body = seq('F \\s 1') + seq('G \\s 1') + H(1, 'A') +
        seq('F \\s 1') + H(1, 'B') + seq('G \\s 1') + seq('F \\s 1');
      assert.deepEqual(await run(body), ['1', '1', '1', '1', '1']);
    });

  it('the heading holding the field comes first; \\r wins',
    async () => {
      const body = seq('F \\s 1') + p(r('Chapter ') + fld(' SEQ F \\s 1 '),
        '<w:pStyle w:val="Heading1"/>') + seq('F \\r 7 \\s 1');
      assert.deepEqual(await run(body), ['1', '1', '7']);
    });
});

describe('where fields are', () => {
  const TC = (x) => `<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/>` +
    `</w:tcPr>${x}</w:tc>`;
  it('in tables and in the result of another field', async () => {
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="100"/>' +
      '</w:tblGrid><w:tr>' + TC(seq('F')) + TC(seq('F')) +
      '</w:tr></w:tbl>';
    const nested = p(fc('begin') + it_(' REF x ') + fc('separate') +
      fld(' SEQ F ') + fc('end'));
    assert.deepEqual(await run(seq('F') + tbl + nested + seq('F')),
      ['1', '2', '3', '4', '5']);
  });

  it('a TOC result counts nothing, the rest goes on', async () => {
    const toc = p(fc('begin') + it_(' TOC \\o "1-3" ') + fc('separate') +
      fld(' SEQ F ') + fld(' SEQ F ')) + p(fc('end'));
    assert.deepEqual(await run(seq('F') + toc + seq('F')),
      ['1', undefined, undefined, '2']);
  });

  it('headers are counted on their own; the body is unaffected',
    async () => {
      const bytes = await withHeaders(seq('F') + seq('F'),
        {default: {hdr: seq('F')}});
      const d = await readDocx(bytes);
      const m = counters(d);
      assert.deepEqual(scan(d).map((f) => m.get(f.begin)),
        ['1', '2']);
      const name = [...d.stories.keys()][0];
      assert.deepEqual(scan(d, name).map((f) => m.get(f.begin)),
        ['1']);
    });
});

describe('memo', () => {
  it('memoised, recomputed after an edit and after undo',
    async () => {
      const doc = await read(seq('F') + p(r('abc')) + seq('F'));
      const d = new Document(doc);
      const a = counters(d.doc);
      assert.equal(counters(d.doc), a);
      d.apply({op: 'replaceText', block: [0, 1], at: 1, del: 0,
        ins: 'Z'});
      const b = counters(d.doc);
      assert.notEqual(b, a);
      assert.deepEqual(shown(d.doc), ['1', '2']);
      d.apply({op: 'removeBlock', at: [0, 0]});
      assert.deepEqual(shown(d.doc), ['1']);
      d.undo();
      assert.deepEqual(shown(d.doc), ['1', '2']);
    });
});

describe('hostile', () => {
  it('__proto__ and constructor as identifiers; big \\r',
    async () => {
      assert.deepEqual(await run(seq('__proto__') + seq('__PROTO__') +
        seq('constructor') + seq('F \\r 9007199254740991') +
        seq('F') + seq('F')),
      ['1', '2', '1', '9007199254740991', undefined, '1']);
    });

  it('not documents', () => {
    assert.equal(counters(null).size, 0);
    assert.equal(counters({}).size, 0);
    assert.equal(evaluate({}, {instr: ' SEQ F ', begin: {}}), null);
  });

  it('deeply nested fields do not throw', async () => {
    let x = r('1');
    for (let i = 0; i < 300; i++) x = fc('begin') +
      it_(' SEQ F ') + fc('separate') + x + fc('end');
    const d = await read(p(x));
    assert.equal(shown(d).length, 300);
  });

  it('10,000 fields are linear', async () => {
    const make = (n) => read(Array.from({length: n}, (_, i) =>
      i % 50 === 0 ? H(1, 'h') + seq('F \\s 1') : seq('F')).join(''));
    const time = async (n) => {
      const d = await make(n);
      let best = Infinity;
      for (let k = 0; k < 5; k++) {
        const d2 = await make(n);
        const t = process.hrtime.bigint();
        const m = counters(d2);
        best = Math.min(best, Number(process.hrtime.bigint() - t));
        assert.ok(m.size >= n - 1);
      }
      void d;
      return best;
    };
    const small = await time(1000), big = await time(10000);
    assert.ok(big < small * 40, `ratio ${big / small}`);
    if (process.env.WORD_PERF) assert.ok(big < 2e9);
  });
});
