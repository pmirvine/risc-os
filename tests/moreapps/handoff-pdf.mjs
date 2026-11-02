// The Batch G1 hand-off: ten varied corpus documents exported as PDF
// for the owner to open in a real PDF reader (Preview, Acrobat), and
// a README of what to look for in each.
//
//   node tests/moreapps/handoff-pdf.mjs
//
// Writes tests/moreapps/word-check-out/pdf-1-<n>-<name>.pdf and
// pdf-1-README.txt (never committed). The documents come from the
// local corpus (tests/moreapps/corpus, git-ignored); one that is not
// there is left out and the README says so. Each is laid out in
// Print layout and exported as the desktop does (tests/moreapps/
// pdf-docs: the real fonts; the layout measured with their advances
// and kerning as opentype.js reads them, not by the browser), its
// pictures decoded by Chromium (Playwright, tests/core/pw.mjs: the
// desktop's createImageBitmap and OffscreenCanvas; without it a grey
// pixel stands in, and the README says so). Then tools/pdf-check.mjs
// runs over the files.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {bundled, windowOf, raster, ROOT} from './pdf-docs.mjs';

const CORPUS = path.join(ROOT, 'tests/moreapps/corpus');
const OUT = path.join(ROOT, 'tests/moreapps/word-check-out');

/** [corpus file, short name, what to look at]. */
const DOCS = [
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/mixed features/' +
    'BackgroundReport - THE WORKING GROUP ON INTERNET ' +
    'GOVERNANCE.docx', 'report',
  'a long report: headers and footers with page numbers, ' +
    'footnotes at the foot of their pages, tables with borders ' +
    'and shading, web links that open in the browser'],
  ['poi/bug57031.docx', 'tables-pictures',
    'tables with borders and shaded cells, pictures, headers'],
  ['poi/drawing.docx', 'drawing',
    'pictures and drawings beside text, tables, links'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/complex0.docx',
    'columns', 'text in two columns, headers, tables'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/hyperlink/' +
    'Hyperlink - internal.docx', 'internal-links',
  'links to places in the document: clicking one goes to its ' +
    'page; a shaded paragraph, a picture, headers'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/table/' +
    '2003 Consumer Confidence Report.docx', 'report-tables',
  'tables with borders and shading, headers and footers'],
  ['poi/form_footnotes.docx', 'footnotes',
    'footnotes (their numbers in the text and at the foot of the ' +
    'page), a table, a picture'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/table/2007.docx',
    'shading', 'tables with shaded rows and cells and their ' +
    'borders, links'],
  ['open-xml-sdk/v2FxTestFiles/bvt/complex2005_12rtm.docx',
    'long-manual', 'a long manual: tables, headers and footers on ' +
    'every page, links'],
  ['poi/bug65649.docx', 'cyrillic',
    'Cyrillic text in Liberation Serif, footnotes, tables, ' +
    'pictures; the largest corpus document (189 pages here)'],
];

/** Word's own page count from docProps/app.xml, or null. */
function wordPages(doc) {
  const app = doc.parts && doc.parts.get('docProps/app.xml');
  const text = app && Buffer.from(app).toString('utf8');
  if (!text || !text.includes('Microsoft')) return null;
  const a = text.indexOf('<Pages>'), b = text.indexOf('</Pages>');
  return a >= 0 && b > a ? Number(text.slice(a + 7, b)) : null;
}

/** A rasterise through Chromium, or null when it cannot start. */
async function chromium() {
  try {
    const {launch} = await import('../core/pw.mjs');
    const {browser, page} = await launch();
    await page.setContent('<!doctype html><p>raster</p>');
    const rasterise = async (bm) => {
      const r = await page.evaluate(async ([b64, mime]) => {
        const bytes = Uint8Array.from(atob(b64), (c) =>
          c.charCodeAt(0));
        const im = await createImageBitmap(new Blob([bytes],
          {type: mime || ''}));
        const c = new OffscreenCanvas(im.width, im.height);
        const g = c.getContext('2d');
        g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, im.width, im.height).data;
        let s = '';
        for (let i = 0; i < d.length; i += 0x8000) {
          s += String.fromCharCode(...d.subarray(i, i + 0x8000));
        }
        return {width: im.width, height: im.height, rgba: btoa(s)};
      }, [Buffer.from(bm.bytes).toString('base64'), bm.mime]);
      return {width: r.width, height: r.height,
        rgba: new Uint8Array(Buffer.from(r.rgba, 'base64'))};
    };
    return {browser, rasterise};
  } catch {
    return null;
  }
}

const br = await chromium();
const lines = [];
const say = (s = '') => lines.push(s);
say('Batch G1 hand-off: PDF export (the window menu's Export as PDF...)');
say('='.repeat(55));
say();
say('Open each pdf-1-*.pdf in Preview (or Acrobat) and check:');
say();
say('* Text can be selected, copied and found with Find (Cmd-F).');
say('* Fonts: File > Properties (Preview: Tools > Show Inspector)');
say('  lists each font as embedded (a subset: ABCDEF+Name), and the');
say('  text looks as it does in !Letters (Liberation, Carlito,');
say('  Caladea; nothing falls back to Helvetica or Times).');
say('* Tables, borders and shading are where !Letters shows them.');
say('* Pictures appear at their size and place (EMF / WMF drawings');
say('  are left out, as on screen; the notes say so).');
say('* Headers and footers on each page, page numbers right.');
say('* Footnotes at the foot of their page, their numbers matching.');
say('* Columns: text flows down one column and into the next.');
say('* Web links open in the browser when clicked; links to places');
say('  in the document go to that page.');
say('* Pages: the count below is ours; "Word" is the count Word');
say('  wrote in the file when it last saved it (docProps/app.xml:');
say('  it can be stale, and our layout is not Word\'s, so near is');
say('  good; far out is worth a note).');
say();
say('Known limits: no kerning (lines may look a touch looser or');
say('tighter than on screen), characters no bundled font has (CJK,');
say('emoji) show as blanks, the layout here was measured in Node');
say('with the fonts\' own advances rather than by the browser.');
say(br ? 'Pictures were decoded by Chromium, as on the desktop.'
  : 'Chromium could not start: each picture is one grey pixel.');
say();

let n = 0;
for (const [rel, short, what] of DOCS) {
  const f = path.join(CORPUS, rel);
  if (!fs.existsSync(f)) {
    say(`(not in the corpus here: ${rel})`);
    continue;
  }
  n++;
  const doc = await readDocx(fs.readFileSync(f));
  const t0 = performance.now();
  const res = await exportPdf(windowOf(doc), {loader: bundled(),
    raf: (cb) => setImmediate(cb),
    rasterise: br ? br.rasterise : raster});
  const ms = Math.round(performance.now() - t0);
  const name = `pdf-1-${n}-${short}.pdf`;
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, name), res.bytes);
  const wp = wordPages(doc);
  say(`${name}`);
  say(`  from: corpus/${rel}`);
  say(`  pages: ${res.pages}` + (wp ? `; Word: ${wp}` : '; Word: not ' +
    'recorded'));
  say(`  look at: ${what}`);
  for (const note of res.notes) say(`  note: ${note}`);
  say();
  console.log(`${name}: ${res.pages} pages, ${ms} ms`);
}
if (br) await br.browser.close();

const check = spawnSync(process.execPath, [path.join(ROOT,
  'tools/pdf-check.mjs'), ...fs.readdirSync(OUT)
  .filter((x) => x.startsWith('pdf-1-') && x.endsWith('.pdf'))
  .map((x) => path.join(OUT, x))], {encoding: 'utf8'});
const last = check.stdout.trim().split('\n').pop();
say(`tools/pdf-check.mjs (poppler) over these files: ${last}`);
fs.writeFileSync(path.join(OUT, 'pdf-1-README.txt'),
  lines.join('\n') + '\n');
console.log(`${n} files and pdf-1-README.txt in ${OUT}; ${last}`);
