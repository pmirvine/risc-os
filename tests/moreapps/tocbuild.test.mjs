// TocBuild (Batch E3): the entries of a table of contents or of
// figures, their paragraphs as Word writes them, the hidden _Toc
// bookmarks and the latent styles. Pure.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {entries, blocks, nextTocName, styleIdByName}
  from '../../tools/moreapps/!Letters/TocBuild';
import {parse} from '../../tools/moreapps/!Letters/TocSwitches';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {planBlocks} from '../../tools/moreapps/!Letters/FieldBlocks';
import {fieldInlines} from '../../tools/moreapps/!Letters/FieldMake';
import {paraNode} from '../../tools/moreapps/!Letters/WritePara';
import {rootScope} from '../../tools/moreapps/!Letters/Ns';
import {NS} from '../../tools/moreapps/!Letters/Wml';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {builtinStyle, galleryIds, ensureBuiltins}
  from '../../tools/moreapps/!Letters/StylesBuiltin';
import {ensureBuiltin} from '../../tools/moreapps/!Letters/StyleCmd';
import {displayName} from '../../tools/moreapps/!Letters/StyleName';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r}
  from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';

const sty = (id, name, inner = '', based = '') => '<w:style ' +
  `w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (based ? `<w:basedOn w:val="${based}"/>` : '') +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(sty('Normal', 'Normal') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal') +
  sty('Heading3', 'heading 3', OL(2), 'Normal') +
  sty('Appendix', 'Appendix', '', 'Normal') +
  sty('Caption', 'caption', '', 'Normal'));
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0">' +
  '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>' +
  '<w:lvlText w:val="%1"/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
const H = (id, text, extra = '', runs = '') => p(runs || r(text),
  `<w:pStyle w:val="${id}"/>${extra}`);
const NUM = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/>' +
  '</w:numPr>';
const S = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const E = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const fld = (code, result) => '<w:r><w:fldChar w:fldCharType=' +
  '"begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' +
  `${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType=` +
  `"separate"/></w:r>${r(result)}<w:r><w:fldChar w:fldCharType=` +
  '"end"/></w:r>';
const read = async (body, parts = {}) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES,
  ...parts}));
const brief = (es) => es.map((e) => [e.level, e.text]);
const SW = (s) => parse(s);
const ids = (d) => d.sections[0].blocks.map((b) => b.id);

/** Fake pages: page index by paragraph id (a Map), numbers 1 up. */
const pagesOf = (byPara, n = 9) => ({
  list: Array.from({length: n}, (_, i) => ({num: i + 1,
    fmt: 'decimal'})),
  G: {}, ofPos: (pos) => (byPara.has(pos.id) ? byPara.get(pos.id)
    : 0)});

describe('entries: which paragraphs', () => {
  it('\\o "1-2" takes Heading 1 and 2, not 3, nor body text',
    async () => {
      const d = await read(H('Heading1', 'One') + p(r('body')) +
        H('Heading2', 'Two') + H('Heading3', 'Three') +
        H('Appendix', 'App'));
      assert.deepEqual(brief(entries(d, SW('TOC \\o "1-2"'), {})),
        [[1, 'One'], [2, 'Two']]);
      assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3"'), {})),
        [[1, 'One'], [2, 'Two'], [3, 'Three']]);
    });
  it('no switches: Heading 1 to 9', async () => {
    const d = await read(H('Heading1', 'One') + H('Heading3', 'Three'));
    assert.deepEqual(brief(entries(d, SW('TOC'), {})),
      [[1, 'One'], [3, 'Three']]);
  });
  it('\\u adds paragraphs with an outline level, within \\o',
    async () => {
      const d = await read(H('Heading1', 'One') +
        p(r('Own'), OL(1)) + p(r('Deep'), OL(5)));
      assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3"'), {})),
        [[1, 'One']]);
      assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3" \\u'), {})),
        [[1, 'One'], [2, 'Own']]);
      assert.deepEqual(brief(entries(d, SW('TOC \\u'), {})),
        [[1, 'One'], [2, 'Own'], [6, 'Deep']]);
    });
  it('\\t takes the named styles at their levels', async () => {
    const d = await read(H('Heading1', 'One') +
      H('Appendix', 'App A') + H('Appendix', 'App B') +
      H('Heading2', 'Two'));
    assert.deepEqual(brief(entries(d,
      SW('TOC \\o "1-1" \\t "Appendix,2"'), {})),
    [[1, 'One'], [2, 'App A'], [2, 'App B']]);
    assert.deepEqual(brief(entries(d, SW('TOC \\t "appendix;3"'), {})),
      [[3, 'App A'], [3, 'App B']]);
    assert.deepEqual(entries(d, SW('TOC \\t "Nope,1"'), {}), []);
  });
  it('__proto__ style names are inert', async () => {
    const d = await read(H('Appendix', 'x'));
    assert.deepEqual(entries(d, SW('TOC \\t "__proto__,1"'), {}), []);
  });
  it('no headings: no entries', async () => {
    const d = await read(p(r('just text')));
    assert.deepEqual(entries(d, SW('TOC \\o "1-3"'), {}), []);
  });
  it('a paragraph is one entry however many switches match',
    async () => {
      const d = await read(H('Heading1', 'One'));
      assert.equal(entries(d, SW('TOC \\o "1-3" \\u \\t "Heading 1,2"'),
        {}).length, 1);
    });
  it('the TOC\'s own paragraphs are never entries', async () => {
    const body = H('Heading1', 'One') +
      p('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r>' +
        '<w:instrText>' +
        ' TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar ' +
        'w:fldCharType="separate"/></w:r>' + r('old entry'),
      '<w:pStyle w:val="Heading1"/>') +
      H('Heading2', 'stale result') + p('<w:r><w:fldChar ' +
        'w:fldCharType="end"/></w:r>') + H('Heading1', 'Two');
    const d = await read(body);
    assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3"'), {})),
      [[1, 'One'], [1, 'Two']]);
  });
  it('a cell paragraph counts', async () => {
    const d = await read('<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
      'w:w="100"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="100" ' +
      'w:type="dxa"/></w:tcPr>' + H('Heading1', 'In cell') +
      '</w:tc></w:tr></w:tbl>' + p(''));
    assert.deepEqual(brief(entries(d, SW('TOC'), {})),
      [[1, 'In cell']]);
  });
});

describe('entries: text', () => {
  it('breaks and tabs become one space; white-space headings go',
    async () => {
      const d = await read(H('Heading1', '', '',
        r('a') + '<w:r><w:br/></w:r>' + r('b') +
        '<w:r><w:tab/></w:r>' + r('c')) + H('Heading1', '   ') +
        H('Heading1', 'after'));
      assert.deepEqual(brief(entries(d, SW('TOC'), {})),
        [[1, 'a b c'], [1, 'after']]);
    });
  it('hidden text is left out; all hidden: no entry', async () => {
    const d = await read(H('Heading1', '', '',
      r('Shown ') + r('secret', '<w:vanish/>') + r('end')) +
      H('Heading1', '', '', r('only hidden', '<w:vanish/>')) +
      H('Heading1', '', '', r('off', '<w:vanish w:val="0"/>')));
    assert.deepEqual(brief(entries(d, SW('TOC'), {})),
      [[1, 'Shown end'], [1, 'off']]);
  });
  it('a numbered heading has its label', async () => {
    const d = await read(H('Heading1', 'Intro', NUM) +
      H('Heading1', 'Plain'), {'word/numbering.xml': NUMBERING});
    const es = entries(d, SW('TOC'), {});
    assert.deepEqual(es.map((e) => [e.label, e.text]),
      [['1', 'Intro'], ['', 'Plain']]);
  });
  it('a field in a heading shows its result; huge text is kept',
    async () => {
      const big = 'x'.repeat(20000);
      const d = await read(H('Heading1', '', '',
        r('Page ') + fld('PAGE', '7')) + H('Heading1', big));
      const es = entries(d, SW('TOC'), {});
      assert.equal(es[0].text, 'Page 7');
      assert.equal(es[1].text.length, 20000);
    });
  it('duplicate heading text gives two entries', async () => {
    const d = await read(H('Heading1', 'Same') + H('Heading1', 'Same'));
    const es = entries(d, SW('TOC'), {});
    assert.equal(es.length, 2);
    assert.notEqual(es[0].para, es[1].para);
  });
});

describe('entries: bookmarks and pages', () => {
  it('reports the spanning bookmark, null for none', async () => {
    const d = await read(
      p(S(1, '_Toc100000001') + r('One') + E(1),
        '<w:pStyle w:val="Heading1"/>') + H('Heading1', 'Two'));
    assert.deepEqual(entries(d, SW('TOC'), {}).map((e) => e.bookmark),
      ['_Toc100000001', null]);
  });
  it('page from the bookmark, else from the paragraph', async () => {
    const d = await read(
      p(S(1, '_Toc100000001') + r('One') + E(1),
        '<w:pStyle w:val="Heading1"/>') + H('Heading1', 'Two') +
      H('Heading1', 'Three'));
    const [a, b, c] = ids(d);
    const pg = pagesOf(new Map([[a, 2], [b, 4], [c, 5]]));
    const es = entries(d, SW('TOC'), {doc: d, pages: pg});
    assert.deepEqual(es.map((e) => e.page), ['3', '5', '6']);
    assert.deepEqual(entries(d, SW('TOC'), {}).map((e) => e.page),
      [null, null, null]);
    assert.deepEqual(entries(d, SW('TOC'), null).map((e) => e.page),
      [null, null, null]);
  });
  it('\\b limits to the bookmark range', async () => {
    const d = await read(H('Heading1', 'Before') +
      p(S(1, 'Part') + r('x')) + H('Heading1', 'In') +
      p(r('y') + E(1)) + H('Heading1', 'After'));
    assert.deepEqual(brief(entries(d, SW('TOC \\b Part'), {})),
      [[1, 'In']]);
    assert.equal(entries(d, SW('TOC \\b Nope'), {}), null);
  });
});

describe('entries: tables of figures', () => {
  const cap = (id, label, n, text) => p(r(label + ' ') +
    fld(`SEQ ${id} \\* ARABIC`, String(n)) + r(text),
  '<w:pStyle w:val="Caption"/>');
  it('\\c lists the captions whole, at level 1', async () => {
    const d = await read(cap('Figure', 'Figure', 1, ': A cat') +
      cap('Table', 'Table', 1, ': T') + H('Heading1', 'H') +
      cap('Figure', 'Figure', 2, ': A dog'));
    const es = entries(d, SW('TOC \\h \\z \\c "Figure"'), {});
    assert.deepEqual(brief(es), [[1, 'Figure 1: A cat'],
      [1, 'Figure 2: A dog']]);
  });
  it('\\a leaves out the label and number', async () => {
    const d = await read(cap('Figure', 'Figure', 1, ' A cat'));
    assert.deepEqual(brief(entries(d, SW('TOC \\a "figure"'), {})),
      [[1, 'A cat']]);
  });
  it('the identifier is compared with case ignored', async () => {
    const d = await read(cap('FIGURE', 'Figure', 1, ' x'));
    assert.equal(entries(d, SW('TOC \\c "figure"'), {}).length, 1);
  });
});

/** The skeleton of an XML node: names and the attributes that
 *  matter, not ids, anchors, rsids, sizes or text. */
function skel(n) {
  if (typeof n === 'string') return 'T';
  const l = n.name.replace(/^w:/, '');
  const keep = new Map([['pStyle', ['val']], ['rStyle', ['val']],
    ['tab', ['val', 'leader']], ['fldChar', ['fldCharType']],
    ['hyperlink', ['history']]]);
  const at = (keep.get(l) || []).map((k) => {
    const a = n.attrs.find(([x]) => x.replace(/^w:/, '') === k);
    return a ? `${k}=${a[1]}` : null;
  }).filter(Boolean).join(',');
  const kids = n.children.filter((c) => typeof c === 'string' ||
    !['sz', 'szCs', 'b', 'bCs'].includes(c.name.replace(/^w:/, '')));
  const txt = l === 'instrText' ? kids.join('').replace(/_Toc\d+/,
    '#') : kids.map(skel).join(' ');
  return `${l}[${at}](${txt})`;
}

/** The pPr and the content of the nth TOC paragraph of style
 *  `style` having a hyperlink, from a corpus file. */
async function corpusEntry(file, style, text) {
  const z = await readZip(new Uint8Array(readFileSync(
    new URL('./corpus/' + file, import.meta.url))));
  const xml = parseXml(new TextDecoder().decode(
    z.get ? await z.get('word/document.xml') : z['word/document.xml']))
    .root;
  const found = [];
  const walk = (n) => {
    if (typeof n === 'string') return;
    if (n.name === 'w:p') found.push(n);
    n.children.forEach(walk);
  };
  walk(xml);
  const str = (n) => typeof n === 'string' ? n : n.children.map(str)
    .join('');
  const hit = found.find((q) => str(q).includes(text) &&
    JSON.stringify(q).includes(`"w:val","${style}"`) &&
    JSON.stringify(q).includes('w:hyperlink'));
  assert.ok(hit, 'corpus entry ' + text);
  return skel(hit);
}

const MAP = rootScope({name: 'w:p', attrs: [['xmlns:w', NS.w]]});
const xmlOf = (para) => skel(paraNode(para, null, MAP));

const HAVE = existsSync(new URL('./corpus/open-xml-sdk',
  import.meta.url));

describe('blocks: the shape Word writes', () => {
  const entry = (o) => ({level: 1, text: 'Head', label: '',
    bookmark: null, para: 1, page: '3', ...o});

  it('an unnumbered entry equals a real Word entry', {skip: !HAVE},
    async () => {
    const want = await corpusEntry('open-xml-sdk/test/' +
      'DocumentFormat.OpenXml.Tests.Assets/assets/TestFiles/' +
      'Complex01.docx', 'TOC2', 'Heading 2 again');
    const d = await read(H('Heading1', 'x'));
    const out = blocks(d, [entry({level: 2, text: 'Heading 2 again',
      bookmark: '_Toc402299825'})], SW('TOC \\o "1-3" \\h \\z \\u'),
    {tabPos: 9350});
    assert.equal(xmlOf(out.blocks[0]), want);
  });
  it('a numbered entry equals a real Word entry', {skip: !HAVE},
    async () => {
    const want = await corpusEntry('open-xml-sdk/v2FxTestFiles/' +
      'bvt/complex2005_12rtm.docx', 'TOC2', 'Motivation');
    const d = await read(H('Heading1', 'x'));
    const out = blocks(d, [entry({level: 2, label: '1.1',
      text: 'Motivation', bookmark: '_Toc111877845'})],
    SW('TOC \\o "1-3" \\h \\z'), {tabPos: 8630});
    // the left tab of the number is Word's own measure (440 a
    // level): only the kinds of stops are compared
    assert.equal(xmlOf(out.blocks[0]), want);
  });
  it('the model: style, tabs, link, tab run, PAGEREF marks',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const out = blocks(d, [entry({level: 3, text: 'T',
        bookmark: '_Toc100000009', page: '12'})],
      SW('TOC \\h'), {tabPos: 9000, leader: 'hyphen'});
      const b = out.blocks[0];
      assert.equal(b.pStyle, 'TOC3');
      assert.deepEqual(b.pPr.tabs, [{val: 'right', pos: 9000,
        leader: 'hyphen'}]);
      assert.equal(b.text, OBJ);
      const x = b.inlines[0];
      assert.equal(x.kind, 'raw');
      assert.equal(x.level, 'p');
      assert.equal(x.node.name, 'w:hyperlink');
      assert.deepEqual(x.node.attrs, [['w:anchor', '_Toc100000009'],
        ['w:history', '1']]);
      assert.equal(x.text, 'T12');
      const kinds = x.node.children.map((c) => {
        const k = c.children.find((y) => y.name !== 'w:rPr');
        if (!k) return 'empty';
        return k.name === 'w:fldChar' ? k.attrs[0][1]
          : k.name.slice(2);
      });
      assert.deepEqual(kinds, ['t', 'tab', 'begin', 'instrText',
        'empty', 'separate', 't', 'end']);
      const rs = x.node.children[0].children[0].children[0];
      assert.equal(rs.attrs[0][1], 'Hyperlink');
      assert.deepEqual(out.stylesNeeded, ['TOC3', 'Hyperlink']);
      assert.deepEqual(out.bookmarksToAdd, []);
    });
  it('the numbered entry: label, tab, text; left tab stop',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const out = blocks(d, [entry({label: '2', text: 'Two'})],
        SW('TOC \\h'), {tabPos: 9000});
      const b = out.blocks[0];
      assert.deepEqual(b.pPr.tabs.map((t) => [t.val, t.pos]),
        [['left', 440], ['right', 9000]]);
      assert.equal(b.inlines[0].text, '2Two3');
    });
  it('without \\h: plain runs, the tab, a PAGEREF field', async () => {
    const d = await read(H('Heading1', 'x'));
    const out = blocks(d, [entry({label: '1', text: 'One',
      bookmark: '_Toc100000001'})], SW('TOC \\o "1-3"'),
    {tabPos: 9000});
    const b = out.blocks[0];
    assert.equal(b.text, '1\tOne\t' + OBJ.repeat(3) + '3' + OBJ);
    const marks = Object.values(b.inlines).map((x) => x.node.name);
    assert.deepEqual(marks, ['w:fldChar', 'w:instrText', 'w:fldChar',
      'w:fldChar']);
    assert.equal(b.inlines[Object.keys(b.inlines)[1]].node
      .children[0], ' PAGEREF _Toc100000001 \\h ');
    assert.deepEqual(out.stylesNeeded, ['TOC1']);
  });
  it('the entry paragraph is a valid block and a valid field result',
    async () => {
      const d = await read(H('Heading1', 'x'));
      for (const q of ['TOC \\h', 'TOC', 'TOC \\n \\h',
        'TOC \\p "-"']) {
        const out = blocks(d, [entry({}), entry({level: 2, label: '1.',
          text: 'Two', para: 2})], SW(q), {});
        for (const b of out.blocks) checkBlock(b);
      }
    });
  it('\\n leaves out tab and page number for those levels',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const out = blocks(d, [entry({}), entry({level: 2, text: 'Two',
        para: 2})], SW('TOC \\h \\n "2-3"'), {});
      assert.equal(out.blocks[0].inlines[0].text, 'Head3');
      assert.equal(out.blocks[1].inlines[0].text, 'Two');
      assert.equal(out.blocks[1].pPr.tabs, undefined);
      assert.equal(out.blocks[1].inlines[0].node.children.length, 1);
    });
  it('\\p puts the separator in place of the tab and leader',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const out = blocks(d, [entry({})], SW('TOC \\h \\p " - "'), {});
      const b = out.blocks[0];
      assert.equal(b.pPr.tabs, undefined);
      assert.equal(b.inlines[0].text, 'Head - 3');
    });
  it('the leader none, and a page not known', async () => {
    const d = await read(H('Heading1', 'x'));
    let out = blocks(d, [entry({page: null})], SW('TOC \\h'),
      {leader: 'none', tabPos: 5000});
    assert.deepEqual(out.blocks[0].pPr.tabs,
      [{val: 'right', pos: 5000}]);
    assert.equal(out.blocks[0].inlines[0].text, 'Head');
    out = blocks(d, [entry({})], SW('TOC \\h'), {tabPos: -5});
    assert.ok(out.blocks[0].pPr.tabs[0].pos > 0);
  });
  it('a table of figures uses its style; \\a as well', async () => {
    const d = await read(H('Heading1', 'x'));
    const out = blocks(d, [entry({})], SW('TOC \\h \\c "Figure"'), {});
    assert.equal(out.blocks[0].pStyle, 'TableofFigures');
    assert.deepEqual(out.stylesNeeded, ['TableofFigures', 'Hyperlink']);
  });
  it('levels are clamped to TOC 1..9', async () => {
    const d = await read(H('Heading1', 'x'));
    const out = blocks(d, [entry({level: 0}), entry({level: 99})],
      SW('TOC'), {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle),
      ['TOC1', 'TOC9']);
  });
  it('text with markup characters and controls is made safe',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const out = blocks(d, [entry({text: '<&> \u0001 \ud800 x'})],
        SW('TOC \\h'), {});
      checkBlock(out.blocks[0]);
      const doc = await readDocx(await writeDocx(d));
      assert.ok(doc);
      assert.ok(!out.blocks[0].inlines[0].text.includes('\u0001'));
    });
  it('no entries: one plain paragraph, Word\'s text', async () => {
    const d = await read(H('Heading1', 'x'));
    let out = blocks(d, [], SW('TOC \\o "1-3"'), {});
    assert.equal(out.blocks.length, 1);
    assert.equal(out.blocks[0].text, 'No table of contents entries ' +
      'found.');
    assert.equal(out.blocks[0].pStyle, undefined);
    assert.deepEqual(out.stylesNeeded, []);
    out = blocks(d, [], SW('TOC \\c "Figure"'), {});
    assert.equal(out.blocks[0].text, 'No table of figures entries ' +
      'found.');
    checkBlock(out.blocks[0]);
  });
  it('the input is not changed', async () => {
    const d = await read(H('Heading1', 'x'));
    const es = [entry({})];
    const snap = JSON.stringify(es);
    const before = JSON.stringify(d.sections);
    blocks(d, es, SW('TOC \\h'), {});
    assert.equal(JSON.stringify(es), snap);
    assert.equal(JSON.stringify(d.sections), before);
  });
});

describe('blocks: hidden bookmarks', () => {
  it('a heading with a _Toc bookmark reuses it; others get new ones',
    async () => {
      const d = await read(
        p(S(1, '_TOC100000005') + r('One') + E(1),
          '<w:pStyle w:val="Heading1"/>') +
        p(S(2, 'MyMark') + r('Two') + E(2),
          '<w:pStyle w:val="Heading1"/>') + H('Heading1', 'Three'));
      const es = entries(d, SW('TOC'), {});
      const out = blocks(d, es, SW('TOC \\h'), {});
      assert.deepEqual(out.bookmarksToAdd, [
        {paraId: es[1].para, name: '_Toc100000006'},
        {paraId: es[2].para, name: '_Toc100000007'}]);
      assert.equal(out.blocks[0].inlines[0].node.attrs[0][1],
        '_TOC100000005');
      assert.equal(out.blocks[1].inlines[0].node.attrs[0][1],
        '_Toc100000006');
    });
  it('names are unique across the body, headers and notes',
    async () => {
      const body = p(S(1, '_Toc100000020') + r('a') + E(1)) +
        H('Heading1', 'H');
      const hd = await readDocx(await withHeaders(body,
        {default: {hdr: p(S(2, '_Toc100000030') + r('h') + E(2))}}));
      assert.equal(nextTocName(hd, new Set()), '_Toc100000031');
      assert.equal(nextTocName(hd, new Set(['_Toc100000040'])),
        '_Toc100000041');
      const nd = await noteDoc(p(r('a') + mark(1)), {
        1: noteP('see').replace('</w:p>', S(7, '_Toc100000050') +
          r('n') + E(7) + '</w:p>')});
      assert.equal(nextTocName(nd, new Set()), '_Toc100000051');
      const fresh = await read(H('Heading1', 'x'));
      assert.equal(nextTocName(fresh, new Set()), '_Toc100000001');
    });
  it('case is ignored and an unpaired start still takes the name',
    async () => {
      const d = await read(p(S(1, '_TOC100000001') + r('a')));
      assert.equal(nextTocName(d, new Set()), '_Toc100000002');
    });
  it('deterministic and monotone', async () => {
    const d = await read(H('Heading1', 'a') + H('Heading1', 'b'));
    const es = entries(d, SW('TOC'), {});
    const a = blocks(d, es, SW('TOC \\h'), {});
    const b = blocks(d, es, SW('TOC \\h'), {});
    assert.deepEqual(a.bookmarksToAdd, b.bookmarksToAdd);
    const n = a.bookmarksToAdd.map((x) => Number(x.name.slice(4)));
    assert.ok(n[0] < n[1]);
    assert.ok(a.bookmarksToAdd.every((x) =>
      /^_Toc\d{9}$/.test(x.name)));
  });
  it('the numbers wrap round past 9 digits, still unique', async () => {
    const d = await read(p(S(1, '_Toc999999999') + r('a') + E(1)));
    const n = nextTocName(d, new Set());
    assert.match(n, /^_Toc\d{9}$/);
    assert.notEqual(n, '_Toc999999999');
  });
});

describe('planBlocks takes the blocks', () => {
  it('a TOC field whose result is the entry paragraphs', async () => {
    const f = fieldInlines(' TOC \\o "1-3" \\h \\z ');
    const first = newPara(f.ins, {inlines: f.inlines});
    const d = await read(H('Heading1', 'One') + H('Heading2', 'Two'));
    d.sections[0].blocks.unshift(first);
    const doc = new Document(d);
    const fs = scan(doc.doc);
    assert.equal(fs.length, 1);
    const es = entries(doc.doc, SW(fs[0].instr), {});
    assert.equal(es.length, 2);
    const out = blocks(doc.doc, es, SW(fs[0].instr), {});
    const plan = planBlocks(doc.doc, fs[0], out.blocks);
    assert.ok(plan, 'planBlocks accepts the entry blocks');
    const none = planBlocks(doc.doc, fs[0],
      blocks(doc.doc, [], SW(fs[0].instr), {}).blocks);
    assert.ok(none);
  });
});

const BEGIN = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>';
const SEP = '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
const END = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
const code = (c) => `<w:r><w:instrText xml:space="preserve"> ${c} ` +
  '</w:instrText></w:r>';
const LINK = (t) => '<w:hyperlink w:anchor="x" w:history="1">' +
  r(t) + '</w:hyperlink>';

describe('entries: headings next to the TOC field', () => {
  it('a heading holding the TOC\'s end mark is an entry', async () => {
    const d = await read(
      p(BEGIN + code('TOC \\t "Heading 3,1"') + SEP + LINK('old 1'),
        '<w:pStyle w:val="TOC1"/>') +
      p(LINK('old 2'), '<w:pStyle w:val="TOC1"/>') +
      p(END + r('Executive Summary'), '<w:pStyle w:val="Heading3"/>') +
      H('Heading3', 'General'));
    assert.deepEqual(brief(entries(d,
      SW('TOC \\t "Heading 3,1"'), {})),
    [[1, 'Executive Summary'], [1, 'General']]);
  });
  it('an empty end paragraph and a stale result stay out',
    async () => {
      const d = await read(
        p(BEGIN + code('TOC \\o "1-3"') + SEP + LINK('old 1'),
          '<w:pStyle w:val="Heading1"/>') +
        p(LINK('old 2'), '<w:pStyle w:val="Heading2"/>') +
        p(END, '<w:pStyle w:val="Heading1"/>') + H('Heading1', 'Two'));
      assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3"'), {})),
        [[1, 'Two']]);
    });
  it('text before the begin mark is the body\'s', async () => {
    const d = await read(
      p(r('Intro') + BEGIN + code('TOC \\o "1-3"') + SEP +
        LINK('old 1'), '<w:pStyle w:val="Heading1"/>') +
      p(END, '<w:pStyle w:val="Heading1"/>'));
    assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3"'), {})),
      [[1, 'Intro']]);
  });
  it('a TOC inside one paragraph: the text round it counts',
    async () => {
      const d = await read(
        p(r('Pre') + BEGIN + code('TOC \\o "1-3"') + SEP + r('old') +
          END + r('Post'), '<w:pStyle w:val="Heading1"/>'));
      assert.deepEqual(brief(entries(d, SW('TOC \\o "1-3"'), {})),
        [[1, 'PrePost']]);
    });
  it('the real Business Plan file: every stored entry is found',
    async () => {
      const f = new URL('./corpus/open-xml-sdk/v2FxTestFiles/' +
        'wordprocessing/footer & header/Business Plan for a ' +
        'Startup Business_July.docx', import.meta.url);
      let bytes;
      try {
        bytes = new Uint8Array(readFileSync(f));
      } catch (e) {
        return;
      }
      const d = await readDocx(bytes);
      const fl = scan(d).find((x) => /^\s*TOC\b/.test(x.instr));
      let n = 0, inside = false;
      forEachBlock(d, (b) => {
        if (b.type !== 'p') return true;
        if (b.id === fl.end.id) inside = false;
        if (inside) n++;
        if (b.id === fl.sep.id) inside = true;
        return true;
      });
      const es = entries(d, SW(fl.instr), {});
      // the paragraph with the separate holds the first entry
      assert.equal(es.length, n + 1);
      assert.ok(es.some((e) => e.text === 'Executive Summary'));
    });
});

describe('blocks: styles found by name', () => {
  const cs = (id, name, type = 'paragraph') => `<w:style w:type=` +
    `"${type}" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;
  const withStyles = async (inner) => readDocx(await buildDocx({
    'word/document.xml': documentXml(H('Heading1', 'x')),
    'word/styles.xml': stylesXml(sty('Normal', 'Normal') + inner)}));
  const SWH = SW('TOC \\h \\o "1-3"');
  const E3 = [1, 2, 3].map((level) => ({level, text: 'T' + level,
    label: '', bookmark: null, para: level, page: '1'}));

  it('styles named toc n under other ids are used', async () => {
    const d = await withStyles(cs('10', 'toc 1') + cs('20', 'toc 2') +
      cs('30', 'TOC 3') + cs('a3', 'Hyperlink', 'character'));
    const out = blocks(d, E3, SWH, {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle),
      ['10', '20', '30']);
    const rs = out.blocks[0].inlines[0].node.children[0].children[0]
      .children[0];
    assert.equal(rs.attrs[0][1], 'a3');
    assert.deepEqual(out.stylesNeeded, []);
    assert.deepEqual(out.conflicts, []);
  });
  it('a bare table: standard ids, all listed', async () => {
    const d = await withStyles('');
    const out = blocks(d, E3, SWH, {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle),
      ['TOC1', 'TOC2', 'TOC3']);
    assert.deepEqual(out.stylesNeeded,
      ['TOC1', 'TOC2', 'TOC3', 'Hyperlink']);
  });
  it('mixed: toc 1 present, toc 2 missing', async () => {
    const d = await withStyles(cs('Inhalt1', 'toc 1'));
    const out = blocks(d, E3.slice(0, 2), SW('TOC'), {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle),
      ['Inhalt1', 'TOC2']);
    assert.deepEqual(out.stylesNeeded, ['TOC2']);
  });
  it('LibreOffice\'s Contents 1 is not toc 1', async () => {
    const d = await withStyles(cs('Contents_20_1', 'Contents 1'));
    const out = blocks(d, E3.slice(0, 1), SW('TOC'), {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle), ['TOC1']);
    assert.deepEqual(out.stylesNeeded, ['TOC1']);
  });
  it('another style with the standard id is a conflict', async () => {
    const d = await withStyles(cs('TOC1', 'My list'));
    const out = blocks(d, E3.slice(0, 1), SW('TOC'), {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle), ['TOC1']);
    assert.deepEqual(out.stylesNeeded, []);
    assert.deepEqual(out.conflicts, [{id: 'TOC1', name: 'toc 1'}]);
  });
  it('a table of figures finds table of figures by name', async () => {
    const d = await withStyles(cs('Abb', 'Table of Figures'));
    const out = blocks(d, E3.slice(0, 1), SW('TOC \\c "Figure"'), {});
    assert.deepEqual(out.blocks.map((b) => b.pStyle), ['Abb']);
    assert.equal(styleIdByName(d, ' table of FIGURES ', 'paragraph'),
      'Abb');
    assert.equal(styleIdByName(d, 'Abb'), null);
    assert.equal(styleIdByName(null, 'x'), null);
  });
});

describe('styles', () => {
  it('Word\'s values', () => {
    const t1 = builtinStyle('TOC1'), t3 = builtinStyle('TOC3');
    assert.equal(t1.name, 'toc 1');
    assert.equal(t1.basedOn, 'Normal');
    assert.equal(t1.next, 'Normal');
    assert.equal(t1.uiPriority, 39);
    assert.equal(t1.unhideWhenUsed, true);
    assert.deepEqual(t1.pPr.spacing, {after: 100});
    assert.equal(t1.pPr.ind, undefined);
    assert.deepEqual(t3.pPr.ind, {left: 440});
    assert.equal(builtinStyle('TOC9').pPr.ind.left, 1760);
    assert.equal(builtinStyle('TOCHeading').basedOn, 'Heading1');
    assert.equal(builtinStyle('TOCHeading').pPr.outlineLvl, 9);
    assert.equal(builtinStyle('Hyperlink').rPr.color, '0563C1');
    assert.equal(builtinStyle('Caption').name, 'caption');
    assert.equal(builtinStyle('Caption').uiPriority, 35);
    assert.equal(builtinStyle('TableofFigures').name,
      'table of figures');
    assert.equal(displayName('toc 1'), 'TOC 1');
    assert.equal(displayName('table of figures'), 'Table of Figures');
    assert.equal(displayName('caption'), 'Caption');
  });
  it('latent: not in the gallery nor in a new document', () => {
    const ids2 = galleryIds();
    for (const i of ['TOC1', 'TOCHeading', 'Hyperlink', 'Caption',
      'TableofFigures']) assert.ok(!ids2.includes(i), i);
    const t = ensureBuiltins({docDefaults: {rPr: {extra: []},
      pPr: {extra: []}}, styles: new Map(),
    defaults: {paragraph: null, character: null}});
    assert.ok(!t.styles.has('TOC1'));
    assert.ok(!t.styles.has('Caption'));
  });
  it('ensureBuiltin adds them on first use, with their bases',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const t = ensureBuiltin(d.styles, 'TOC2');
      assert.ok(t.styles.has('TOC2'));
      assert.ok(!d.styles.styles.has('TOC2'));
      const h = ensureBuiltin(d.styles, 'TOCHeading');
      assert.equal(h.styles.get('TOCHeading').basedOn, 'Heading1');
      assert.ok(ensureBuiltin(d.styles, 'Hyperlink').styles
        .has('Hyperlink'));
    });
  it('a new document\'s styles part has none of the latent family',
    async () => {
      const z = await readZip(await writeDocx(newDoc()));
      const xml = new TextDecoder().decode(z.get
        ? await z.get('word/styles.xml') : z['word/styles.xml']);
      const ids3 = [...xml.matchAll(/w:styleId="([^"]*)"/g)]
        .map((m) => m[1]);
      for (const i of ['TOC1', 'TOC9', 'TOCHeading', 'Hyperlink',
        'Caption', 'TableofFigures']) assert.ok(!ids3.includes(i), i);
      assert.deepEqual(ids3.sort(), ['DefaultParagraphFont',
        'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5',
        'Heading6', 'ListParagraph', 'Normal', 'Title']);
    });
  it('building blocks leaves the styles of the document alone',
    async () => {
      const d = await read(H('Heading1', 'x'));
      const before = d.styles, n = d.styles.styles.size;
      const sw = SW('TOC \h');
      blocks(d, entries(d, sw, {}), sw, {});
      assert.equal(d.styles, before);
      assert.equal(d.styles.styles.size, n);
    });
});

describe('hostile and linear', () => {
  const many = async (n) => {
    let body = '';
    for (let i = 0; i < n; i++) {
      body += H('Heading' + (1 + i % 3), 'Heading ' + i, '',
        r('Heading ' + i));
    }
    return read(body);
  };
  const best = (fn, k = 3) => {
    let m = Infinity;
    for (let i = 0; i < k; i++) {
      const t0 = performance.now();
      fn();
      m = Math.min(m, performance.now() - t0);
    }
    return m;
  };
  const all = (d) => {
    const sw = SW('TOC \\o "1-3" \\h');
    return blocks(d, entries(d, sw, {}), sw, {});
  };
  it('10,000 headings take about 10 times 1,000', async () => {
    const a = await many(1000), b = await many(10000);
    const ta = best(() => all(a)), tb = best(() => all(b));
    const out = all(b);
    assert.equal(out.blocks.length, 10000);
    assert.equal(out.bookmarksToAdd.length, 10000);
    assert.equal(new Set(out.bookmarksToAdd.map((x) => x.name)).size,
      10000);
    assert.ok(tb < 25 * ta + 100,
      `1,000: ${ta.toFixed(0)} ms, 10,000: ${tb.toFixed(0)} ms`);
    if (process.env.WORD_PERF === '1') assert.ok(tb < 2000, tb);
  });
  it('entries and blocks of nothing', async () => {
    const d = await read(p(''));
    assert.deepEqual(entries(d, SW('TOC'), {}), []);
    assert.deepEqual(entries(null, SW('TOC'), {}), []);
    assert.equal(blocks(d, null, SW('TOC'), {}).blocks.length, 1);
    assert.equal(blocks(d, [{}], SW('TOC'), {}).blocks.length, 1);
  });
});
