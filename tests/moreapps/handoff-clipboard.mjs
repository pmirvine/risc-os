// Generates the real-Word hand-off files for !Word's copy, paste and
// Find (local only, never committed: tests/moreapps/corpus/ is
// git-ignored). Not a test:
//
//   node tests/moreapps/handoff-clipboard.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   clip-1-samedoc.docx    copies and cuts pasted in the same document
//   clip-2-crossdoc.docx   copies from another document pasted in a
//                          new one
//   clip-3-html.docx       a new document made by pasting HTML from
//                          other programs (Word, Google Docs, a web
//                          page, a table, Notepad's plain text)
//   clip-4-tableids.docx   tables copied in the same document: one
//                          holding a bookmark (pasted as text), one
//                          with w14:paraId (pasted as a table)
//   find-1-replaceall.docx Replace all and Replace in a rich document
//   clip-README.txt        what Word should show, the open questions,
//                          and the checks to make by hand in a browser
// Every change is made with !Word's own clipboard and Find modules
// (ClipSlice, ClipStore, ClipHtml, ClipPick, ClipPaste, Find) on a
// Document, as ./EditClip and ./EditFind run them in the window. The
// HTML of other programs is parsed by html-fake.mjs (a small HTML
// parser the unit tests use), standing in for the browser's
// DOMParser; ClipRead walks either the same way. A file is written
// only when its bytes change (the output is the same every run), so
// a file open in Word is left alone; nothing else in the folder is
// touched or removed. Each file is read back and its paragraphs
// listed in the README, so the list is what was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {linkUrl} from '../../tools/moreapps/!Word/ClipLinks';
import {pasteBlocks, pastePlain, deleteSelection}
  from '../../tools/moreapps/!Word/ClipPaste';
import * as F from '../../tools/moreapps/!Word/Find';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {richDocx} from './edit-rich.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {parseHtml} from './html-fake.mjs';
import {lintPackage} from './lint-package.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 8, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

// ------------------------------------------------------------ helpers

// the tokens need not be random here (the files are the same every
// run): a counter
let tok = 0;
const store = new ClipStore({rand: () => {
  tok++;
  return Array.from({length: 8}, (_, k) => (tok >> (8 * k)) & 255);
}});

/** A window on a Document: its key, its typing, its commands. */
function session(doc, key) {
  const d = new Document(doc);
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => now});
  const all = () => d.doc.sections.flatMap((s) => s.blocks);
  const para = (start) => {
    const b = all().find((x) => x.type === 'p' && x.text.startsWith(start));
    if (!b) throw new Error('no paragraph starting ' + JSON.stringify(start));
    return b;
  };
  /** {id, off}: at a number, before (or after: end) a string, 'end'. */
  const pos = (start, at = 0, end = false) => {
    const b = para(start);
    let off = at;
    if (at === 'end') off = b.text.length;
    else if (typeof at === 'string') {
      const k = b.text.indexOf(at);
      if (k < 0) throw new Error(`no ${JSON.stringify(at)} in ${b.text}`);
      off = k + (end ? at.length : 0);
    }
    return {id: b.id, off};
  };
  const s = {
    d, key, all, para, pos,
    caret: (start, at) => S.caret(pos(start, at)),
    select: (a, b) => S.select(a, b),
    /** Ctrl-C: {text, html} as the clipboard would hold them. */
    copy(sel) {
      const sl = slice(d.doc, sel);
      if (!sl) throw new Error('nothing selected');
      const token = store.put(sl, key);
      const html = toHtml(d.doc, sl, {token, urlOf: linkUrl(d.doc)});
      return {text: sl.plain, html: html ?? ''};
    },
    /** Ctrl-X: the copy, then the selection deleted (one step). */
    cut(sel) {
      const c = s.copy(sel);
      t.command(() => deleteSelection(d, sel));
      return c;
    },
    /** Ctrl-V of a payload at sel; returns [route, caret after]. */
    paste(sel, payload) {
      now += 2000;
      const x = pick(payload, {store, docKey: key, parseHtml});
      if (!x) throw new Error('nothing to paste');
      const out = t.command(() => (x.route === 'plain'
        ? pastePlain(d, sel, x.text)
        : pasteBlocks(d, sel, x.blocks, x.opts)));
      return [x.route, out];
    },
    /** Type text keystroke by keystroke. */
    type(sel, text) {
      for (const ch of text) {
        now += 50;
        sel = t.type(sel, ch);
      }
      return sel;
    },
    enter(sel) { return t.command(() => E.splitPara(d, sel)); },
    replaceAll(needle, repl, opts = {}) {
      now += 2000;
      return t.command(() => F.replaceAll(d, needle, repl, opts));
    },
  };
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);

const SHOW = [['b', (v) => (v ? 'bold' : 'NOT bold')],
  ['i', (v) => (v ? 'italic' : 'not italic')],
  ['u', (v) => 'underline ' + v], ['strike', (v) => (v ? 'struck' : '')],
  ['vertAlign', (v) => v], ['color', (v) => 'colour ' + v],
  ['highlight', (v) => 'highlight ' + v], ['sz', (v) => v / 2 + ' pt'],
  ['rFonts', (v) => 'font ' + (v.ascii || v.hAnsi)]];

/** What a written file holds: its paragraphs and their formats. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  for (const b of doc.sections.flatMap((x) => x.blocks)) {
    if (b.type !== 'p') { out.push('    [table]'); continue; }
    const pp = [b.pStyle];
    if (b.pPr.jc) pp.push('jc ' + b.pPr.jc);
    if (b.pPr.numPr) pp.push('list');
    const kinds = Object.values(b.inlines || {}).map((x) =>
      (x.kind === 'raw' ? x.node?.name : x.kind));
    if (kinds.length) pp.push('objects: ' + kinds.join(' '));
    const show = (t) => JSON.stringify(t.replace(/\ufffc/g, '<obj>')
      .replace(/\t/g, '<tab>').replace(/\n/g, '<br>')).slice(1, -1);
    out.push('    ' + (pp.filter(Boolean).length ? '(' +
      pp.filter(Boolean).join('; ') + ') ' : '') + show(b.text));
    for (const r of b.runs) {
      const f = SHOW.filter(([k]) => r.rPr[k] !== undefined)
        .map(([k, fn]) => fn(r.rPr[k])).filter(Boolean);
      if (r.rStyle) f.push('style ' + r.rStyle);
      if (f.length) {
        out.push('      "' + show(b.text.slice(r.start, r.end)) + '": ' +
          f.join(', '));
      }
    }
  }
  return out;
}

const made = [];
async function save(name, doc, about) {
  const bytes = await writeDocx(doc, {date: DATE});
  const problems = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  const how = put(name, bytes);
  made.push(`${name} (${bytes.length} bytes, ${how})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word wrote (read back: each paragraph, its style, then each',
    'run with direct formatting; <obj> is a hyperlink or another',
    'object, [table] a table):', ...await describe(bytes));
}

// ------------------------------------------------------------ 1: same document

{
  const s = session(await readDocx(await richDocx()), 1);
  const notes = [];
  // the formatted sentence copied to the end of "The end."
  let c = s.copy(s.select(s.pos('Plain, bold'), s.pos('Plain, bold',
    'end')));
  let [route] = s.paste(s.caret('The end.', 'end'), c);
  notes.push('a. route ' + route);
  // the link paragraph, copied whole with its paragraph mark, pasted
  // before "The first paragraph of section two."
  c = s.copy(s.select(s.pos('A link:'), s.pos('First numbered')));
  [route] = s.paste(s.caret('The first paragraph of section two', 0), c);
  notes.push('b. route ' + route);
  // a list item with its paragraph mark, pasted before "The end."
  c = s.copy(s.select(s.pos('Second numbered'), s.pos('A bullet point')));
  [route] = s.paste(s.caret('The end.', 0), c);
  notes.push('c. route ' + route);
  // from "the table." across the table to "The paragraph after",
  // pasted at the end of "One line / and the next"
  c = s.copy(s.select(s.pos('The paragraph before', 'the table.'),
    s.pos('The paragraph after', ' the table', false)));
  [route] = s.paste(s.caret('One line', 'end'), c);
  notes.push('d. route ' + route);
  // "italic words, " cut, pasted after "Name:\t"
  c = s.cut(s.select(s.pos('Plain, bold', 'italic words, '),
    s.pos('Plain, bold', 'italic words, ', true)));
  [route] = s.paste(s.caret('Name:', 'value'), c);
  notes.push('e. route ' + route);
  await save('clip-1-samedoc.docx', s.d.doc, [
    'The rich document (a heading, bold and italic words, a hyperlink,',
    'a numbered and a bulleted list, a table, two sections), with',
    'copies and a cut pasted in the SAME document (the exact route:',
    'everything kept), in this order:',
    ' a. "Plain, bold words, italic words, and plain again." copied',
    '    and pasted at the end of "The end." (bold and italic kept);',
    ' b. the whole link paragraph, with its paragraph mark, pasted',
    '    before "The first paragraph of section two.": a second LIVE',
    '    hyperlink to example.com (the same relationship id as the',
    '    first);',
    ' c. "Second numbered item" with its paragraph mark pasted before',
    '    "The end.": a numbered item 3 there (numbering kept: the list',
    '    continues: 1, 2 ... 3);',
    ' d. from "the table." across the table to "The paragraph after"',
    '    pasted at the end of "One line / and the next": a second copy',
    '    of the table (with its borders and its two cells) between',
    '    "...and the nextthe table." and a new paragraph "The',
    '    paragraph after" (where the copy ended);',
    ' e. "italic words, " cut from the second paragraph (one undo step)',
    '    and pasted after "Name:<tab>", in italic.',
    'Routes taken: ' + notes.join('; ') + '.',
    'Check: no repair prompt; both links work; list numbers as said;',
    'the table copy looks like the first one.',
  ]);
}

// ------------------------------------------------------------ 2: another document

{
  const src = session(await readDocx(await richDocx()), 2);
  const s = session(newDoc({date: DATE}), 3);
  let c0 = s.type(s.caret('', 0), 'Pasted from the rich document:');
  const notes = [];
  const from = (a, b) => {
    const c = src.copy(src.select(a, b));
    c0 = s.enter(c0);
    const [route, out] = s.paste(c0, c);
    notes.push(route);
    c0 = out;
  };
  // the Heading 1 with its mark, the formatted sentence, the link
  // paragraph, a list item, the table and the paragraphs around it
  from(src.pos('Typing test'), src.pos('Plain, bold'));
  from(src.pos('Plain, bold'), src.pos('Plain, bold', 'end'));
  from(src.pos('A link:'), src.pos('A link:', 'end'));
  from(src.pos('First numbered'), src.pos('First numbered', 'end'));
  from(src.pos('The paragraph before'), src.pos('The paragraph after',
    'end'));
  from(src.pos('Caf'), src.pos('Caf', 'end'));
  await save('clip-2-crossdoc.docx', s.d.doc, [
    'A new document. Pieces of the rich document (another document:',
    'another window, another key) pasted one after another, each in',
    'a new paragraph (routes: ' + notes.join(', ') + '). Across',
    'documents a link becomes its text, a list item\'s text copied',
    'without its paragraph mark plain text (with the mark it brings',
    'its list: cl-README.txt), a table is left out, and a style is',
    'used only when this document has one of the same name. Word',
    'should show:',
    ' - "Typing test" in this document\'s Heading 1 (by name), then an',
    '   empty paragraph (the paragraph mark copied with it);',
    ' - "Plain, bold words, italic words, and plain again." with bold',
    '   and italic as in the rich document;',
    ' - "A link: example.com and text after it." with "example.com"',
    '   plain text, like the words around it (no longer a link, and',
    '   without the link\'s blue underlining: nothing to click);',
    ' - "First numbered item" with no number (its text only);',
    ' - "The paragraph before the table." then "The paragraph after',
    '   the table." with NO table between them (left out);',
    ' - "Caf\u00e9, na\u00efve, \u{1F600} smile." (accents and the emoji).',
    'Check: no repair prompt; no link in the document.',
  ]);
}

// ------------------------------------------------------------ 3: other programs' HTML

const WORD_HTML = '<html xmlns:o="urn:schemas-microsoft-com:office:office">' +
  '<head><meta name=Generator content="Microsoft Word 15"><style>' +
  '<!-- p.MsoNormal {margin:0cm; font-size:11.0pt;} --></style></head>' +
  '<body lang=EN-GB><!--StartFragment--><p class=MsoNormal><b><span ' +
  'style=\'font-family:"Cambria",serif;color:#C00000\'>Red Cambria bold' +
  '</span></b><span style=\'font-size:14.0pt\'> then 14 pt</span><o:p>' +
  '</o:p></p><p class=MsoListParagraphCxSpFirst style=\'text-indent:' +
  '-18.0pt;mso-list:l0 level1 lfo1\'><![if !supportLists]><span ' +
  'style=\'mso-list:Ignore\'>1.<span style=\'font:7.0pt "Times New ' +
  'Roman"\'>&nbsp;&nbsp; </span></span><![endif]>A Word list item' +
  '<o:p></o:p></p><!--EndFragment--></body></html>';
const GDOCS_HTML = '<meta charset="utf-8"><b style="font-weight:normal;" ' +
  'id="docs-internal-guid-1a2b3c"><p dir="ltr" style="line-height:1.38;' +
  'margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;' +
  'font-family:Arial,sans-serif;color:#000000;font-weight:700;">Bold ' +
  'from Google Docs</span><span style="font-size:11pt;font-family:Arial,' +
  'sans-serif;color:#000000;font-weight:400;font-style:italic;"> and ' +
  'italic</span></p></b>';
const WEB_HTML = '<h1>A web heading</h1><p>Text with a <a href=' +
  '"https://example.com/page?a=1&amp;b=2">link</a>, <em>emphasis</em>, ' +
  '<strong>strong</strong>, <u>underline</u>, <s>struck</s>, x<sup>2' +
  '</sup> and H<sub>2</sub>O.</p><ul><li>First bullet</li><li>Second ' +
  'bullet</li></ul><ol><li>Numbered one</li><li>Numbered two</li></ol>' +
  '<h2>A smaller heading</h2><p style="text-align:center;color:' +
  'rgb(0,112,192)">Centred blue</p><script>alert(1)</script>' +
  '<img src="https://example.com/x.png" alt="a picture">';
const TABLE_HTML = '<table><tr><th>Name</th><th>Value</th></tr><tr>' +
  '<td>alpha</td><td>1</td></tr><tr><td>beta</td><td><b>2</b></td>' +
  '</tr></table>';
const PRE_HTML = '<pre>line one\n    indented line</pre><p>&lt;tags&gt; ' +
  '&amp; "quotes" \'single\' &#x1F600; caf&#233;</p>';
const NOTEPAD = 'Plain text\tfrom Notepad\r\nits second line';

{
  const s = session(newDoc({date: DATE}), 4);
  let c = s.type(s.caret('', 0), 'Pasted from other programs:');
  const routes = [];
  for (const [label, payload] of [
    ['1 Word:', {text: 'Red Cambria bold then 14 pt\nA Word list item',
      html: WORD_HTML}],
    ['2 Google Docs:', {text: 'Bold from Google Docs and italic',
      html: GDOCS_HTML}],
    ['3 a web page:', {text: 'A web heading ...', html: WEB_HTML}],
    ['4 a table:', {text: 'Name\tValue\nalpha\t1\nbeta\t2',
      html: TABLE_HTML}],
    ['5 pre and entities:', {text: 'line one', html: PRE_HTML}],
    ['6 Notepad (plain text):', {text: NOTEPAD, html: ''}],
  ]) {
    c = s.enter(c);
    c = s.type(c, label);
    c = s.enter(c);
    const [route, out] = s.paste(c, payload);
    routes.push(route);
    c = out;
  }
  await save('clip-3-html.docx', s.d.doc, [
    'A new document made by pasting what other programs put on the',
    'clipboard (as HTML, read with !Word\'s whitelist; routes: ' +
      routes.join(', ') + '),',
    'each after a label paragraph. Word should show:',
    ' 1 Word: "Red Cambria bold" bold, dark red (C00000), in Cambria;',
    '   " then 14 pt" 14 pt; "A Word list item" as an ordinary',
    '   paragraph (no number: the "1." Word puts in for other programs',
    '   is dropped);',
    ' 2 Google Docs: "Bold from Google Docs" bold, " and italic" italic',
    '   (not all bold: Google\'s <b style="font-weight:normal"> wrapper',
    '   is not bold), both Arial 11 pt;',
    ' 3 a web page: "A web heading" in this document\'s Heading 1 (also',
    '   bold, at Word\'s heading size); "link" plain text (no link);',
    '   emphasis italic, strong bold, underline, struck, x squared and',
    '   H2O; the four list items as ordinary paragraphs (no bullets or',
    '   numbers); "A smaller heading" in Heading 2; "Centred blue"',
    '   centred, blue (0070C0); nothing from the script; no picture;',
    ' 4 a table: flattened to text: "Name<tab>Value", "alpha<tab>1",',
    '   "beta<tab>2", one paragraph per row (the heading row and the',
    '   2 bold, as the HTML has them);',
    ' 5 pre: "line one" and "    indented line" (spaces kept), then',
    '   "<tags> & "quotes" \'single\' \u{1F600} caf\u00e9";',
    ' 6 Notepad: "Plain text<tab>from Notepad" and "its second line".',
    'Check: no repair prompt; the formatting as said.',
  ]);
}

// ------------------------------------------------------------ 4: tables with ids

{
  const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
  const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  const cell = (inner) => '<w:tc><w:tcPr><w:tcW w:w="2400" ' +
    'w:type="dxa"/></w:tcPr>' + inner + '</w:tc>';
  const grid = '<w:tblPr><w:tblW w:w="4800" w:type="dxa"/><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((x) =>
      `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
      .join('') + '</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol ' +
    'w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>';
  const withMark = '<w:tbl>' + grid + '<w:tr>' + cell('<w:p>' +
    '<w:bookmarkStart w:id="0" w:name="InTable"/>' + r('Marked') +
    '<w:bookmarkEnd w:id="0"/></w:p>') + cell(p(r('cell'))) +
    '</w:tr></w:tbl>';
  const pid = (id, t) => `<w:p w14:paraId="${id}" w14:textId="77777777">` +
    r(t) + '</w:p>';
  const withParaIds = '<w:tbl>' + grid + '<w:tr>' +
    cell(pid('1A2B3C4D', 'Plain')) + cell(pid('1A2B3C4E', 'table')) +
    '</w:tr></w:tbl>';
  const body = p(r('Before the marked table.')) + withMark +
    p(r('After the marked table.')) + p(r('Before the plain table.')) +
    withParaIds + p(r('After the plain table.')) + p(r('End.'));
  const bytes = await buildDocx({'word/document.xml': documentXml(body,
    {rootAttrs: ` xmlns:w14="${W14}" xmlns:mc="${MC}" ` +
      'mc:Ignorable="w14"'})});
  const s = session(await readDocx(bytes), 6);
  const routes = [];
  for (const [a, b] of [['Before the marked', 'After the marked'],
    ['Before the plain', 'After the plain']]) {
    const c = s.copy(s.select(s.pos(a, 'end'), s.pos(b, 0)));
    const [route] = s.paste(s.caret('End.', 'end'), c);
    routes.push(route);
  }
  await save('clip-4-tableids.docx', s.d.doc, [
    'A document with two tables. The first holds a bookmark (InTable)',
    'in its first cell, the second Word\'s paragraph ids (w14:paraId).',
    'Each table was copied (from the end of the paragraph before it to',
    'the start of the one after) and pasted at the end of "End." in',
    'the same document (routes: ' + routes.join(', ') + '). A table',
    'holding an id that must stay unique (a bookmark, a comment, a',
    'tracked change, a picture) is pasted as text, so the bookmark is',
    'not there twice; a table without one is pasted whole, without the',
    'paragraph ids (Word gives new ones). The second paste went in',
    'at the same place, so before the first. Word should show, after',
    '"End.": a second copy of the plain table ("Plain" | "table",',
    'with its borders), an empty paragraph, a paragraph',
    '"Marked<tab>cell" (plain text: no table, no second bookmark) and',
    'an empty paragraph (the paragraph ends copied around each',
    'table).',
    'Check: no repair prompt; Insert > Bookmark lists InTable once and',
    'Go To takes you to the first table.',
  ]);
}

// ------------------------------------------------------------ find: Replace all

{
  const s = session(await readDocx(await richDocx()), 5);
  const r = [];
  const run = (needle, repl, opts, what) => {
    const x = s.replaceAll(needle, repl, opts);
    const q = (t) => t.replace(/\t/g, '<tab>');
    r.push(` ${what}: "${q(needle)}" -> "${q(repl)}" ` + JSON.stringify(opts) +
      `: ${x.count} replaced` + (x.skipped ? `, ${x.skipped} in links ` +
      'not replaced' : ''));
  };
  run('paragraph', 'para', {matchCase: false, whole: true}, 'a');
  run('The', 'THE', {matchCase: true, whole: true}, 'b');
  run('bold words', 'BOLD WORDS', {}, 'c');
  run('example', 'sample', {}, 'd');
  run('value', 'v1\tv2', {}, 'e');
  run('smile', 'grin \u{1F601}', {}, 'f');
  run('item', 'entry', {matchCase: false, whole: false}, 'g');
  run('a.*b', 'never', {}, 'h');
  // Replace (one): the first "heading" found from the start
  const m = F.search(s.d.doc, {s: 0, i: 0, off: 0}, 'heading',
    {wrap: true});
  const one = m ? F.replaceOne(s.d, m, 'HEADING') : null;
  r.push(' i: Replace of the first "heading" (case ignored): ' +
    (one ? 'replaced' : 'none'));
  await save('find-1-replaceall.docx', s.d.doc, [
    'The rich document after these Replace alls (Edit > Replace...,',
    'Replace all), each one undo step, and one Replace:',
    ...r,
    'Word should show: "THE para before the table." and "THE para',
    'after the table." ("paragraph" as a whole word, any case, then',
    '"The" with match case: "the" inside sentences kept, "THE" for',
    'every capitalised "The");',
    '"BOLD WORDS" still bold (a replacement takes the format of the',
    'first character it replaces); the link "example.com" UNCHANGED',
    '(link text is found but never replaced); "Name:<tab>v1<tab>v2"',
    '(a tab in the replacement); "grin \u{1F601}" in place of "smile";',
    '"entry" in the list items (not whole words: "First numbered',
    'entry"); "a.*b" found nowhere (no patterns); "A second HEADING".',
    'Check: no repair prompt; the list numbers and the table as before.',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  '!Word copy, paste and Find hand-off (local only, not committed)',
  '===============================================================',
  '',
  'Made by: node tests/moreapps/handoff-clipboard.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten;',
  'no other file here is touched). Every file is a document changed',
  'with !Word\'s own clipboard and Find modules, as its window runs',
  'them, and saved by !Word. Open each in real Word: note any repair',
  'prompt or error, and whether what you see matches the description.',
  'Then the questions, and the checks by hand in a browser.',
  '',
  'Questions (please try each in real Word and note what it does):',
  '',
  'C1 A document with pasted content, saved: does each file open with',
  '   no repair prompt (clip-1, clip-2, clip-3, find-1)? clip-1 has a',
  '   pasted second copy of a hyperlink (the same relationship id)',
  '   and of a table.',
  'C2 Formatting pasted from other programs (clip-3): is what Word',
  '   shows for each of the six pastes what the list below says? Is',
  '   anything Word itself would keep (on a paste from the same',
  '   source) obviously missing?',
  'C3 Links across documents (clip-2): the link pasted into another',
  '   document is only its text (still blue and underlined, as it was',
  '   formatted). Acceptable, or should it stay a link?',
  'C4 Headings and lists pasted from HTML (clip-3, 3): headings take',
  '   the document\'s Heading 1 / Heading 2 (and are also bold at',
  '   Word\'s heading size); list items become ordinary paragraphs',
  '   without bullets or numbers. Word would make a list: acceptable',
  '   for now?',
  'C5 Tables (clip-3, 4): a pasted HTML table becomes one paragraph',
  '   per row, the cells separated by tabs. Across !Word documents a',
  '   table is left out (clip-2); in the same document it is copied',
  '   whole (clip-1 d). Acceptable?',
  'C6 Replace all (find-1): is each result what the list says? Word',
  '   also leaves link text alone? Does Word\'s Match case / Find',
  '   whole words only agree on "The" and "paragraph"?',
  'C8 Tables with ids pasted in the same document (clip-4): no',
  '   repair prompt, the bookmark InTable once, the marked table\'s',
  '   copy as the text "Marked<tab>cell", the plain table\'s copy a',
  '   table. Is flattening such a table acceptable?',
  'C7 A picture copied and pasted in the same document (not in these',
  '   files: copy one in !Word, paste it, save): Word opens it with',
  '   two pictures sharing an id (wp:docPr) without a repair prompt?',
  '',
  'Checks by hand in a browser (Chrome, then Safari or Firefox if',
  'possible), with !Word running in the desktop:',
  '',
  'H1 Copy in !Word, paste into real Word, Google Docs, a web mail',
  '   editor and Notepad (TextEdit in plain text): the text, its',
  '   paragraphs, tabs and line breaks arrive; Word and Google Docs',
  '   also get bold, italic, underline, colours, sizes and fonts, and',
  '   a link to a web address as a link.',
  'H2 Copy in Word, Google Docs, a web page and Notepad; Ctrl-V (Cmd-V',
  '   on a Mac) into !Word: compare with clip-3\'s descriptions.',
  'H3 Edit menu Copy, Cut and Paste in !Word (not the keys): Paste',
  '   may ask for permission to read the clipboard; refused, a',
  '   message says to press Ctrl-V.',
  'H4 Copy between two !Word windows keeps the formatting exactly',
  '   (styles by name); within one window links and list numbers too.',
  'H5 A picture or a file copied in the computer\'s file manager,',
  '   pasted into !Word: nothing pasted, the bell and a message.',
  'H6 Find (Ctrl-F, F4), Find next (Ctrl-G), Replace (Ctrl-H) and',
  '   Replace all in a long document; Cmd-F and Cmd-G on a Mac.',
  'H7 Safari and Firefox: do Ctrl-C / Cmd-C and Ctrl-X copy and cut at',
  '   all? (Only Chrome could be tried while this was written: the',
  '   desktop\'s "clipboard" caret option exists for browsers that need',
  '   it and is off.)',
  ...lines,
  '',
];
const how = put('clip-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`clip-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
