// ReadNumbering: the numbering definitions in full (level indents,
// suffix, restart, legal, justification, run format, pStyle,
// lvlOverride / startOverride, multiLevelType, numStyleLink) and the
// paragraph numbering resolved through styles (Styles.resolvePara).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readNumbering, levelOf}
  from '../../tools/moreapps/!Word/ReadNumbering';
import {resolvePara} from '../../tools/moreapps/!Word/Styles';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r,
  STRICT_W_NS, STRICT_R_NS} from './build-docx.mjs';
import {entries, sameBytes} from './docx-compare.mjs';

const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');

/** A docx with this numbering.xml inside (and styles, body). */
const make = (inner, {styles, body = p(r('x')), strict} = {}) => {
  const ns = strict ? {ns: STRICT_W_NS} : {};
  const parts = {
    'word/document.xml': documentXml(body,
      strict ? {ns: STRICT_W_NS, rNs: STRICT_R_NS} : {}),
    'word/numbering.xml': numberingXml(inner, ns),
  };
  if (styles) parts['word/styles.xml'] = stylesXml(styles, ns);
  return buildDocx(parts, strict ? {strict: true} : {});
};
const readWith = async (inner, opts) => readDocx(await make(inner, opts));
const nums = async (inner, opts) => (await readWith(inner, opts))
  .numbering.nums;

const lvl = (ilvl, inside, a = '') =>
  `<w:lvl w:ilvl="${ilvl}"${a}>${inside}</w:lvl>`;
const abs = (id, inside, a = '') =>
  `<w:abstractNum w:abstractNumId="${id}"${a}>${inside}</w:abstractNum>`;
const num = (id, absId, inside = '') => `<w:num w:numId="${id}">` +
  `<w:abstractNumId w:val="${absId}"/>${inside}</w:num>`;

const FULL = lvl(0, '<w:start w:val="3"/><w:numFmt w:val="decimal"/>' +
  '<w:lvlRestart w:val="0"/><w:pStyle w:val="Heading1"/>' +
  '<w:isLgl/><w:suff w:val="space"/><w:lvlText w:val="%1."/>' +
  '<w:lvlJc w:val="right"/><w:pPr><w:ind w:left="720" ' +
  'w:hanging="360"/><w:jc w:val="center"/></w:pPr><w:rPr>' +
  '<w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/>' +
  '<w:b/><w:i w:val="0"/><w:color w:val="FF0000"/>' +
  '<w:sz w:val="28"/><w:u w:val="single"/></w:rPr>');

describe('ReadNumbering: level fields', () => {
  it('reads every new level field', async () => {
    const n = await nums(abs(0, '<w:multiLevelType w:val="hybrid' +
      'Multilevel"/>' + FULL) + num(1, 0));
    const one = n.get(1);
    assert.equal(one.multiLevelType, 'hybridMultilevel');
    assert.deepEqual(one.levels[0], {ilvl: 0, start: 3,
      numFmt: 'decimal', lvlRestart: 0, pStyle: 'Heading1', isLgl: true,
      suff: 'space', lvlText: '%1.', lvlJc: 'right',
      pPr: {ind: {left: 720, hanging: 360}},
      rPr: {rFonts: {ascii: 'Symbol', hAnsi: 'Symbol', hint: 'default'},
        b: true, i: false, color: 'FF0000', sz: 28}});
    assert.equal(one.overrides.size, 0);
  });

  it('missing elements are undefined', async () => {
    const n = await nums(abs(0, lvl(0, '')) + num(1, 0));
    assert.deepEqual(n.get(1).levels[0], {ilvl: 0});
    assert.equal(n.get(1).multiLevelType, undefined);
  });

  it('unknown values are ignored, never thrown', async () => {
    const n = await nums(abs(0, '<w:multiLevelType w:val="zig"/>' +
      lvl(0, '<w:suff w:val="dash"/><w:lvlJc w:val="middle"/>' +
        '<w:isLgl w:val="maybe"/><w:lvlRestart w:val="x"/>' +
        '<w:start w:val="1.5"/><w:pPr><w:ind w:left="abc" ' +
        'w:hanging="360" w:leftChars="2"/></w:pPr><w:rPr>' +
        '<w:sz w:val="big"/><w:b w:val="nope"/><w:caps/></w:rPr>' +
        '<w:pStyle/><w:x/>')) + num(1, 0));
    assert.deepEqual(n.get(1).levels[0], {ilvl: 0,
      pPr: {ind: {hanging: 360}}});
    assert.equal(n.get(1).multiLevelType, undefined);
  });

  it('suffix values and justification start/end', async () => {
    const n = await nums(abs(0, lvl(0, '<w:suff w:val="tab"/>' +
      '<w:lvlJc w:val="start"/>') + lvl(1, '<w:suff w:val="nothing"/>' +
      '<w:lvlJc w:val="end"/>') + lvl(2, '<w:lvlJc w:val="center"/>' +
      '<w:isLgl w:val="0"/>')) + num(1, 0));
    const ls = n.get(1).levels;
    assert.equal(ls[0].suff, 'tab');
    assert.equal(ls[0].lvlJc, 'left');
    assert.equal(ls[1].suff, 'nothing');
    assert.equal(ls[1].lvlJc, 'right');
    assert.equal(ls[2].lvlJc, 'center');
    assert.equal(ls[2].isLgl, false);
  });

  it('ind start/end (Strict names), firstLine, right', async () => {
    const n = await nums(abs(0, lvl(0, '<w:pPr><w:ind w:start="100" ' +
      'w:end="50" w:firstLine="20"/></w:pPr>') + lvl(1, '<w:pPr>' +
      '<w:ind w:left="10" w:right="5" w:firstLine="1" w:hanging="2"/>' +
      '</w:pPr>')) + num(1, 0));
    const ls = n.get(1).levels;
    assert.deepEqual(ls[0].pPr, {ind: {left: 100, right: 50,
      firstLine: 20}});
    // hanging wins over firstLine (as in Word)
    assert.deepEqual(ls[1].pPr, {ind: {left: 10, right: 5, hanging: 2}});
  });

  it('lvlText is kept to 255 characters, numFmt to 64', async () => {
    const n = await nums(abs(0, lvl(0, '<w:lvlText w:val="' +
      '%1'.repeat(100000) + '"/><w:numFmt w:val="' + 'x'.repeat(500) +
      '"/>') + lvl(1, '<w:lvlText w:val=""/>')) + num(1, 0));
    const ls = n.get(1).levels;
    assert.equal(ls[0].lvlText, '%1'.repeat(127) + '%');
    assert.equal(ls[0].numFmt, 'x'.repeat(64));
    assert.equal(ls[1].lvlText, '');
  });

  it('levels are indexed by ilvl; missing levels are absent',
    async () => {
      const n = await nums(abs(0, lvl(2, '<w:numFmt w:val="bullet"/>') +
        lvl(0, '')) + num(1, 0));
      const ls = n.get(1).levels;
      assert.equal(ls[0].ilvl, 0);
      assert.equal(ls[2].numFmt, 'bullet');
      assert.equal(1 in ls, false);
      assert.equal(ls.length, 3);
    });
});

describe('ReadNumbering: overrides', () => {
  it('startOverride and a replacement level', async () => {
    const n = await nums(abs(0, lvl(0, '<w:start w:val="1"/>' +
      '<w:numFmt w:val="decimal"/>') + lvl(1, '')) + num(1, 0) +
      num(2, 0, '<w:lvlOverride w:ilvl="0"><w:startOverride ' +
        'w:val="5"/></w:lvlOverride><w:lvlOverride w:ilvl="1">' +
        lvl(1, '<w:numFmt w:val="upperRoman"/><w:lvlText w:val="%2)"/>' +
          '<w:suff w:val="space"/>') + '</w:lvlOverride>'));
    const two = n.get(2);
    assert.deepEqual(two.overrides.get(0), {start: 5});
    assert.deepEqual(two.overrides.get(1), {level: {ilvl: 1,
      numFmt: 'upperRoman', lvlText: '%2)', suff: 'space'}});
    // levels stay the abstract's; levelOf applies a replacement
    assert.equal(two.levels[1].numFmt, undefined);
    assert.equal(levelOf(two, 1).numFmt, 'upperRoman');
    assert.equal(levelOf(two, 0).numFmt, 'decimal');
    assert.equal(levelOf(two, 7), undefined);
    assert.equal(n.get(1).overrides.size, 0);
  });

  it('bad overrides are ignored; the first of an ilvl wins', async () => {
    const n = await nums(abs(0, lvl(0, '')) + num(1, 0,
      '<w:lvlOverride w:ilvl="9"><w:startOverride w:val="2"/>' +
      '</w:lvlOverride><w:lvlOverride w:ilvl="x"/><w:lvlOverride ' +
      'w:ilvl="3"><w:startOverride w:val="7"/></w:lvlOverride>' +
      '<w:lvlOverride w:ilvl="3"><w:startOverride w:val="8"/>' +
      '</w:lvlOverride><w:lvlOverride w:ilvl="4"><w:startOverride ' +
      'w:val="9999999999999"/></w:lvlOverride>'));
    const o = n.get(1).overrides;
    assert.deepEqual([...o.keys()], [3, 4]);
    assert.deepEqual(o.get(3), {start: 7});
    assert.deepEqual(o.get(4), {});
  });

  it('at most 1000 lvlOverride elements are looked at', () => {
    const many = '<w:lvlOverride w:ilvl="x"/>'.repeat(1000) +
      '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/>' +
      '</w:lvlOverride>';
    const n = direct(abs(0, lvl(0, '')) + num(1, 0, many));
    assert.equal(n.get(1).overrides.size, 0);
  });
});

/** readNumbering on a numbering.xml string, no package. */
function direct(inner, styles) {
  const root = parseXml(numberingXml(inner)).root;
  return readNumbering(root, rootScope(root), styles).nums;
}

describe('ReadNumbering: hostile', () => {
  it('100k levels: only ilvl 0..8 are kept, quickly', () => {
    let s = '';
    for (let i = 0; i < 100000; i++) s += lvl(i, '<w:start w:val="1"/>');
    const t = Date.now();
    const n = direct(abs(0, s) + num(1, 0));
    assert.ok(Date.now() - t < 2000);
    const ls = n.get(1).levels;
    assert.equal(ls.length, 9);
    assert.equal(ls[8].ilvl, 8);
  });

  it('huge, negative and duplicate values', () => {
    const n = direct(abs(0, lvl(0, '<w:start w:val="2147483648"/>') +
      lvl(1, '<w:start w:val="2147483649"/>' +
        '<w:pPr><w:ind w:left="99999999999"/></w:pPr>') +
      lvl(0, '<w:start w:val="5"/>') + lvl(-1, '') + lvl('a', '') +
      lvl(2, '<w:lvlRestart w:val="-1"/>')) + num(1, 0));
    const ls = n.get(1).levels;
    assert.equal(ls[0].start, 2 ** 31); // first ilvl 0 wins
    assert.deepEqual(ls[1], {ilvl: 1});
    assert.deepEqual(ls[2], {ilvl: 2});
    assert.equal(ls.length, 3);
  });

  it('__proto__ and other odd ids are inert', () => {
    const n = direct(abs('__proto__', lvl(0, '<w:numFmt ' +
      'w:val="bullet"/>')) + num('__proto__', '__proto__') +
      num('constructor', 'nothing'));
    assert.equal(n.get('__proto__').levels[0].numFmt, 'bullet');
    assert.equal(n.get('constructor').levels.length, 0);
    assert.equal({}.numFmt, undefined);
  });

  it('a level rPr can not pollute prototypes', () => {
    const n = direct(abs(0, lvl(0, '<w:rPr><w:__proto__ w:val="1"/>' +
      '</w:rPr><w:pPr><w:ind w:__proto__="1"/></w:pPr>')) + num(1, 0));
    assert.deepEqual(n.get(1).levels[0], {ilvl: 0});
    assert.equal({}.val, undefined);
  });
});

describe('ReadNumbering: namespaces', () => {
  it('Strict and transitional read the same', async () => {
    const inner = abs(0, '<w:multiLevelType w:val="multilevel"/>' +
      FULL) + num(1, 0, '<w:lvlOverride w:ilvl="0"><w:startOverride ' +
      'w:val="2"/></w:lvlOverride>');
    const a = await nums(inner);
    const b = await nums(inner, {strict: true});
    assert.deepEqual(b, a);
    assert.equal(b.get(1).levels[0].suff, 'space');
    assert.deepEqual(b.get(1).overrides.get(0), {start: 2});
  });
});

const style = (id, inside, a = '') => '<w:style w:type="paragraph" ' +
  `w:styleId="${id}"${a}><w:name w:val="${id}"/>${inside}</w:style>`;
const numPr = (numId, ilvl) => '<w:numPr>' +
  (ilvl === undefined ? '' : `<w:ilvl w:val="${ilvl}"/>`) +
  (numId === undefined ? '' : `<w:numId w:val="${numId}"/>`) +
  '</w:numPr>';
const pPr = (s) => `<w:pPr>${s}</w:pPr>`;

describe('Paragraph numbering through styles', () => {
  const NUMS = abs(0, lvl(0, '<w:pStyle w:val="Heading1"/>' +
    '<w:lvlText w:val="%1"/>') + lvl(1, '<w:pStyle w:val="Heading2"/>' +
    '<w:lvlText w:val="%1.%2"/>')) + num(4, 0);
  const STYLES = style('Normal', '', ' w:default="1"') +
    style('Heading1', '<w:basedOn w:val="Normal"/>' + pPr(numPr(4))) +
    style('Heading2', '<w:basedOn w:val="Heading1"/>' +
      pPr(numPr(undefined, 1))) +
    style('Heading3', '<w:basedOn w:val="Heading2"/>') +
    style('Plain', '<w:basedOn w:val="Heading1"/>' + pPr(numPr(0))) +
    style('LoopA', '<w:basedOn w:val="LoopB"/>' + pPr(numPr(4, 2))) +
    style('LoopB', '<w:basedOn w:val="LoopA"/>' + pPr(numPr(4, 5)));
  const para = (pStyle, direct = '') =>
    p(r('x'), (pStyle ? `<w:pStyle w:val="${pStyle}"/>` : '') + direct);
  const resolved = async (body) => {
    const doc = await readWith(NUMS, {styles: STYLES, body});
    return paras(doc).map((q) => resolvePara(doc.styles, q).numPr);
  };

  it('style pPr keeps numPr as a field', async () => {
    const doc = await readWith(NUMS, {styles: STYLES});
    assert.deepEqual(doc.styles.styles.get('Heading1').pPr.numPr,
      {numId: 4});
    assert.equal(doc.numbering.nums.get(4).levels[1].pStyle,
      'Heading2');
  });

  it('heading styles number, the chain gives numId and ilvl',
    async () => {
      assert.deepEqual(await resolved(para('Heading1') +
        para('Heading2') + para('Heading3') + para('Normal')), [
        {numId: 4, ilvl: 0, ilvlGiven: false},
        {numId: 4, ilvl: 1, ilvlGiven: true},
        {numId: 4, ilvl: 1, ilvlGiven: true}, null]);
    });

  it('direct numPr wins over the style; numId 0 is no number',
    async () => {
      assert.deepEqual(await resolved(
        para('Heading1', numPr(7, 3)) +
        para('Heading2', numPr(0)) + para('Plain') +
        para('', numPr(9)) + para('Heading1', numPr(undefined, 2)) +
        para('', numPr(undefined, 1))), [
        {numId: 7, ilvl: 3, ilvlGiven: true}, null, null,
        {numId: 9, ilvl: 0, ilvlGiven: false},
        {numId: 4, ilvl: 2, ilvlGiven: true}, null]);
    });

  it('circular style numbering does not hang', async () => {
    const got = await resolved(para('LoopA') + para('LoopB'));
    assert.deepEqual(got, [{numId: 4, ilvl: 2, ilvlGiven: true},
      {numId: 4, ilvl: 5, ilvlGiven: true}]);
  });

  it('a numPr kept raw (tracked change inside) still numbers',
    async () => {
      const ins = '<w:ins w:id="1" w:author="a" ' +
        'w:date="2020-01-01T00:00:00Z"/>';
      const doc = await readWith(NUMS, {styles: STYLES, body:
        para('Heading1', '<w:numPr><w:ilvl w:val="1"/>' + ins +
          '<w:numId w:val="9"/></w:numPr>') +
        para('Heading1', '<w:numPr>' + ins + '<w:numId w:val="0"/>' +
          '</w:numPr>')});
      const ps = paras(doc);
      assert.equal(ps[0].pPr.numPr, undefined, 'kept raw');
      assert.deepEqual(ps.map((q) => resolvePara(doc.styles, q).numPr),
        [{numId: 9, ilvl: 1, ilvlGiven: true}, null]);
    });

  it('ilvl beyond 8 gives no number', async () => {
    assert.deepEqual(await resolved(para('', numPr(4, 9))), [null]);
  });
});

describe('ReadNumbering: numStyleLink', () => {
  const LIST = '<w:style w:type="numbering" w:styleId="L"><w:name ' +
    'w:val="L"/><w:pPr>' + numPr(2) + '</w:pPr></w:style>';
  it('an abstractNum with numStyleLink takes the linked levels',
    async () => {
      const n = await nums(abs(0, '<w:styleLink w:val="L"/>' +
        lvl(0, '<w:numFmt w:val="lowerLetter"/>')) +
        abs(1, '<w:numStyleLink w:val="L"/>') + num(2, 0) + num(3, 1),
      {styles: LIST});
      assert.equal(n.get(3).levels[0].numFmt, 'lowerLetter');
      assert.equal(n.get(3).numStyleLink, 'L');
      assert.equal(n.get(2).styleLink, 'L');
    });

  it('a numStyleLink loop ends with no levels', async () => {
    const loop = '<w:style w:type="numbering" w:styleId="L"><w:name ' +
      'w:val="L"/><w:pPr>' + numPr(3) + '</w:pPr></w:style>';
    const n = await nums(abs(1, '<w:numStyleLink w:val="L"/>') +
      num(3, 1), {styles: loop});
    assert.equal(n.get(3).levels.length, 0);
  });
});

describe('ReadNumbering: round trip', () => {
  it('numbering.xml bytes are unchanged after read and write',
    async () => {
      const inner = abs(0, '<w:multiLevelType w:val="multilevel"/>' +
        FULL + lvl(1, '<w:numFmt w:val="bullet"/>')) + num(1, 0) +
        num(2, 0, '<w:lvlOverride w:ilvl="0"><w:startOverride ' +
          'w:val="5"/></w:lvlOverride><w:lvlOverride w:ilvl="1">' +
          lvl(1, '<w:numFmt w:val="decimal"/>') + '</w:lvlOverride>');
      for (const strict of [false, true]) {
        const bytes = await make(inner, {strict, body:
          p(r('a'), numPr(2, 1)) + p(r('b'), numPr(1, 0))});
        const a = await readDocx(bytes);
        const out = await writeDocx(a, {date: new Date(2024, 0, 1)});
        const [z0, z1] = [await entries(bytes), await entries(out)];
        assert.ok(sameBytes(z1.get('word/numbering.xml'),
          z0.get('word/numbering.xml')), 'strict ' + strict);
        const b = await readDocx(out);
        assert.deepEqual(b.numbering.nums, a.numbering.nums);
      }
    });
});
