// Clipboard and Find round trip: documents changed by random copy,
// cut and paste (!Word's own route: ./ClipSlice, ./ClipStore,
// ./ClipHtml, ./ClipPick, ./ClipPaste as ./EditClip runs them: the
// exact copy within the document, the same copy pasted as from
// another document, its HTML read back through ./ClipRead, its
// plain text, other programs' HTML (Word, Google Docs, web pages,
// hostile), a copy from another document) and by Find and Replace
// (./Find: Replace of one match, Replace all with Match case and
// Whole words, needles with regular expression characters, emoji,
// tabs and line breaks in the replacement), with bursts of undo and
// redo, then written and read back. The checks are those of
// roundtrip-lib.mjs: the model read back equals the changed model;
// the package linter and xmllint/wml.xsd (when available, for one
// seed) add no error; undoing everything gives back the opened model
// and its bytes. Every block passes ModelCheck after every step.
//
// Documents: the reader fixtures, the rich generated document, small
// documents with styles, headings, hyperlinks, tables and sections,
// and the corpus sample, gated as edit-roundtrip.test.mjs (one file
// in ten by a hash of its name; WORD_EDIT_CORPUS=1 for every file).
// 40 seeded commands per file (CLIP_MS caps the time per file). The
// commands run per kind are counted and printed; each kind must have
// run and changed a document.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {linkUrl} from '../../tools/moreapps/!Word/ClipLinks';
import {pasteBlocks, pastePlain, cutSelection}
  from '../../tools/moreapps/!Word/ClipPaste';
import * as F from '../../tools/moreapps/!Word/Find';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {toggleList} from '../../tools/moreapps/!Word/ListMake';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {FIXTURES} from './docx-fixtures.mjs';
import {richDocx} from './edit-rich.mjs';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';
import {STYLES, rng} from './word-docs.mjs';
import {parseHtml} from './html-fake.mjs';
import {sourceDocx} from './clip-lists-docs.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS} from './roundtrip-lib.mjs';

const STEPS = 40;
const CLIP_MS = 4000;
const KEY = 1, OTHER = 2;

// ------------------------------------------------------------ payloads

/** HTML as other programs put it on the clipboard (and worse). */
const FOREIGN = [
  '<p><b>bold</b> and <i>italic</i></p><p>second <u>line</u></p>',
  '<h1>Heading</h1><ul><li>one</li><li>two</li></ul><ol><li>3</li></ol>',
  '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr>' +
    '</table>',
  '<p class=MsoNormal><span style="mso-fareast-font-family:Calibri;' +
    'color:#FF0000;font-size:14pt">red</span><o:p></o:p></p>' +
    '<!--[if !supportLists]--><p>Word list<!--[endif]--></p>',
  '<b style="font-weight:normal" id="docs-internal-guid-1"><span ' +
    'style="font-weight:700;font-family:Arial">G</span><span>docs</span></b>',
  '<pre>pre a\n  pre b</pre>x<br>y&nbsp;z &lt;&amp;&gt; "q" \u{1F600}',
  '<a href="javascript:alert(1)">js</a><script>bad()</script>' +
    '<img src="http://x/y.png" onerror="bad()"><style>p{}</style>' +
    '<iframe src="http://x"></iframe><svg><text>s</text></svg>after',
  '<div>' + '<div>'.repeat(300) + 'deep' + '</div>'.repeat(301),
  '<p style="color:expression(alert(1));font-size:9999pt">big</p>',
  '<p></p><p>&nbsp;</p><p>\t tabs \t</p>',
  '<span style="vertical-align:super">sup</span><sub>sub</sub><s>s</s>',
];
const NEEDLES = ['a', 'e', 'the', 'The', ' ', '.', 'a.*b', '(x)', '[y]',
  '$1', '\\', '\u{1F600}', 'e\u0301', 'link', 'cell', 'Para 1'];
const REPLS = ['', 'X', 'longer text', '\t', 'a\nb', '\u{1F469}\u200d' +
  '\u{1F4BB}', '$&', '<&>', 'the'];

// ------------------------------------------------------------ commands

const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pickOf = (rd, a) => a[Math.floor(rd() * a.length)];

/** A random position in block b (a grapheme boundary, or a box edge). */
function posIn(rd, b) {
  if (b.type !== 'p') return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
  return {id: b.id, off: pickOf(rd, graphemes(b.text))};
}

/** A random caret, or a selection (often across a few blocks). */
function randSel(rd, d) {
  const bs = allBlocks(d);
  if (!bs.length) return null;
  const k = Math.floor(rd() * bs.length);
  const a = posIn(rd, bs[k]);
  if (rd() < 0.35) return S.caret(a);
  const far = rd() < 0.15 ? bs.length : 4;
  const k2 = Math.max(0, Math.min(bs.length - 1,
    k + Math.floor((rd() * 2 - 1) * far)));
  return S.select(a, posIn(rd, bs[k2]));
}

/** A needle: a piece of a paragraph's text, or one of NEEDLES. */
function needleOf(rd, d) {
  const ps = allBlocks(d).filter((b) => b.type === 'p' && b.text);
  if (!ps.length || rd() < 0.4) return pickOf(rd, NEEDLES);
  const t = pickOf(rd, ps).text, g = graphemes(t);
  const a = pickOf(rd, g), b = Math.min(t.length, a + 1 +
    Math.floor(rd() * 6));
  const n = t.slice(a, b).replace(/\ufffc/g, '');
  return n || pickOf(rd, NEEDLES);
}

/** A copy as the window makes it: {text, html} on "the clipboard". */
function copyOf(store, doc, s, key) {
  const token = store.put(s, key);
  const html = toHtml(doc, s, {token, urlOf: linkUrl(doc)});
  return {text: s.plain, html: html ?? ''};
}

/** A paste as ./EditClip runs it (RangeError: the plain text). */
function pasteIn(d, sel, payload, store) {
  const x = pick(payload, {store, docKey: KEY, parseHtml});
  if (!x) return [null, sel];
  const run = (y) => (y.route === 'plain' ? pastePlain(d, sel, y.text)
    : pasteBlocks(d, sel, y.blocks, y.opts));
  try {
    return [x.route, run(x)];
  } catch (e) {
    if (!(e instanceof RangeError) || x.route === 'plain' ||
      !payload.text) throw e;
    return ['fallback', run({route: 'plain', text: payload.text})];
  }
}

/**
 * The state of one run: the store, the last copy on the clipboard,
 * a source document for copies from another document.
 */
function clipState(src) {
  return {store: new ClipStore(), clip: null, src};
}

/** One random command; returns [kind, the selection after it]. */
function command(rd, d, sel, st) {
  const x = rd();
  if (x < 0.07) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', null];
  }
  if (x < 0.13 && st.src) {
    // a copy made in another document
    const s = slice(st.src.doc, randSel(rd, st.src) ||
      S.caret({id: 'none', off: 0}));
    if (s) st.clip = copyOf(st.store, st.src.doc, s, OTHER);
    return ['copy other', sel];
  }
  if (x < 0.25) {
    const needle = needleOf(rd, d), repl = pickOf(rd, REPLS);
    const opts = {matchCase: rd() < 0.5, whole: rd() < 0.3};
    if (rd() < 0.5) {
      F.replaceAll(d, needle, repl, opts);
      return ['replaceAll', null];
    }
    const from = {s: 0, i: 0, off: 0};
    const m = F.search(d.doc, from, needle, {...opts, wrap: true});
    if (m) F.replaceOne(d, m, repl);
    return ['replaceOne', null];
  }
  if (!sel) return ['none', null];
  if (x < 0.4) {
    const s = slice(d.doc, sel);
    if (s) st.clip = copyOf(st.store, d.doc, s, KEY);
    return ['copy', sel];
  }
  if (x < 0.5) {
    const s = slice(d.doc, sel);
    if (!s) return ['cut', sel];
    st.clip = copyOf(st.store, d.doc, s, KEY);
    return ['cut', cutSelection(d, sel).sel];
  }
  // a paste: the last copy (exactly, as from another document, its
  // HTML, its text) or other programs' HTML
  let payload, kind;
  const y = rd();
  if (y < 0.3 || !st.clip) {
    payload = {text: 'plain ' + pickOf(rd, NEEDLES),
      html: pickOf(rd, FOREIGN)};
    kind = 'paste foreign';
  } else if (y < 0.65) {
    payload = st.clip;
    kind = 'paste copy';
  } else if (y < 0.75) {
    // the same copy, its marker unknown: read as HTML
    payload = {text: st.clip.text, html: st.clip.html
      .replace(/<!--word-clip:[0-9a-f]+-->/, '')};
    kind = 'paste own html';
  } else if (y < 0.85) {
    payload = {text: st.clip.text, html: ''};
    kind = 'paste plain';
  } else {
    // copied here, pasted as from another document
    const e = pick(st.clip, {store: st.store, docKey: -1, parseHtml});
    if (!e || e.route !== 'exact') return ['paste cross', sel];
    const out = pasteBlocks(d, sel, e.blocks, {...e.opts,
      sameDoc: false});
    return ['paste cross', out];
  }
  const [route, out] = pasteIn(d, sel, payload, st.store);
  return [kind + (route ? '' : ' (nothing)'), out];
}

/** STEPS commands on d; returns {steps, capped, counts}. */
function clipAll(src) {
  return (d, seed, {every = false} = {}) => {
    const rd = rng(seed), st = clipState(src), counts = {};
    let sel = null, k = 0;
    const t0 = Date.now();
    for (; k < STEPS; k++) {
      if (Date.now() - t0 > CLIP_MS) break;
      if (!sel || rd() < 0.5) sel = randSel(rd, d);
      const depth = d.undoDepth, nb = d.doc.numbering;
      let kind = '?';
      try {
        [kind, sel] = command(rd, d, sel, st);
        if (every) for (const b of allBlocks(d)) checkBlock(b);
      } catch (e) {
        e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
        throw e;
      }
      counts[kind] = (counts[kind] || 0) + 1;
      if (d.doc.numbering !== nb && kind.startsWith('paste')) {
        // lists of another document made here (L6)
        counts['lists made'] = (counts['lists made'] || 0) + 1;
      }
      if (d.undoDepth > depth) {
        counts[kind + ' changed'] = (counts[kind + ' changed'] || 0) + 1;
      }
    }
    for (const b of allBlocks(d)) checkBlock(b);
    return {steps: k, capped: k < STEPS, counts, grows: true};
  };
}

// ------------------------------------------------------------ documents

const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const LINK = '<w:hyperlink r:id="rIdL"><w:r><w:t>the link</w:t></w:r>' +
  '</w:hyperlink>';
const H = (t, lvl = 1) => p(r(t), `<w:pStyle w:val="Heading${lvl}"/>`);
const doc = (body, styles) => () => buildDocx({'word/document.xml':
  documentXml(body), ...(styles ? {'word/styles.xml': STYLES} : {})},
  {docRels: [['rIdL', REL('hyperlink'), 'http://example.com/a?b=1&c=2',
    'External']]});
const STYLED = doc(H('The title') +
  p(r('Plain ') + r('bold', '<w:b/>') + r(' big', '<w:sz w:val="40"/>') +
    r(' red', '<w:color w:val="FF0000"/>') + r(' e\u0301 \u{1F600}')) +
  '<w:p><w:r><w:t xml:space="preserve">A </w:t></w:r>' + LINK +
  '<w:r><w:t xml:space="preserve"> after a.*b (x) [y]</w:t></w:r></w:p>' +
  TBL + H('Sub', 2) + p(r('Tab') + '<w:r><w:tab/></w:r>' + r('stop') +
    '<w:r><w:br/></w:r>' + r('next line'), '<w:jc w:val="center"/>') +
  SECT, true);
/**
 * A document whose lists were made by !Word (ListMake: the numbering
 * part, relationship and List Paragraph all new): a bullet list, a
 * numbered list, a plain gap and a second list continued after it.
 */
async function madeLists() {
  const d = new Document(await readDocx(await doc(
    ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
      .map((t, i) => p(r(t + ' the'))).join(''))()));
  const bs = () => d.doc.sections.flatMap((s) => s.blocks);
  const over = (a, b) => S.select({id: bs()[a].id, off: 0},
    {id: bs()[b].id, off: bs()[b].text.length});
  const t = new Typing(d);
  toggleList(d, t, over(0, 1), {kind: 'bullet'});
  toggleList(d, t, over(2, 3), {kind: 'number'});
  toggleList(d, t, over(5, 6), {kind: 'number', entry: 'a)'});
  return writeDocx(d.doc, {date: new Date(Date.UTC(2026, 9, 9))});
}
const MORE = [
  ['lists made by !Word (ListMake)', madeLists],
  ['rich (edit-rich.mjs)', richDocx],
  ['styled: headings, formats, a link, a table', STYLED],
  ['table first', doc(TBL + p(r('after the table')) + TBL)],
  ['sections, some empty', doc(p(r('one'), SECT) + p('', SECT) +
    p(r('three the'), SECT) + p(r('four')) + SECT, true)],
  ['many short paragraphs', doc(Array.from({length: 60}, (_, i) =>
    p(r('Para ' + i + ' the ') + r('bold', '<w:b/>'))).join(''), true)],
  ['no paragraphs', doc('')],
];

const {xsd, note: xsdNote} = schema();
const KINDS = ['copy', 'cut', 'paste copy', 'paste foreign',
  'paste own html', 'paste plain', 'paste cross', 'copy other',
  'replaceAll', 'replaceOne', 'undo/redo'];
const CHANGED = ['cut', 'paste copy', 'paste foreign', 'paste own html',
  'paste plain', 'paste cross', 'replaceAll', 'replaceOne'];

/** The source document for copies from another document. */
async function source(k) {
  // odd seeds: lists, borders, shading and tab stops (L6)
  return new Document(await readDocx(await (k % 2 ? sourceDocx()
    : STYLED())));
}

describe('clipboard and find round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of [...FIXTURES, ...MORE]) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const src = await source(k);
        // (the schema check, slow on some fixtures, for a seed of
        // each source; the numbering part only grows: L6)
        const res = await roundTrip(bytes, name, hash(name) + k,
          clipAll(src), {xsd: k < 2 ? xsd : null, every: true,
            keep: ['numberingPart']});
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran, and changed documents', () => {
    console.log('# clipboard and find commands (generated): ' +
      JSON.stringify(total));
    assert.ok(total['lists made'] > 0, 'a paste made lists (L6)');
    for (const kind of KINDS)
      assert.ok(total[kind] > 3, kind + ' ran: ' + JSON.stringify(total));
    for (const kind of CHANGED) {
      assert.ok(total[kind + ' changed'] > 0, kind + ' changed: ' +
        JSON.stringify(total));
    }
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

const files = corpusFiles();

describe('clipboard and find round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} clipboard and find commands in ${ALL ? 'every'
    : 'one in ten'} corpus file round-trip; undo restores`,
  async () => corpusRun(files, clipAll(await source()), xsd, xsdNote,
    'clipboard corpus'));
});
