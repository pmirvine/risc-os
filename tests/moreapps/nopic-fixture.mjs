// Test-only: paragraphs without pictures (and one with a drawing, laid
// out in a scope where nothing is a picture), and their lines as
// LineLayout laid them out BEFORE Batch B (commit e7c33d7), in
// nopic-lines.json. picline.test.mjs lays them out with today's
// LineLayout and compares. To make the snapshot again (only from the
// pre-batch code):
//   git archive e7c33d7 tools/moreapps | tar -x -C <dir>
//   node tests/moreapps/nopic-fixture.mjs <dir>/tools/moreapps
// (writes nopic-lines.json next to this file).
import {writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';
import {drawingXml, URIS} from './pic-fixtures.mjs';

export const WIDTH = 500;
const LONG = 'The quick brown fox jumps over the lazy dog, and then ' +
  'runs on through the long grass until the line has to wrap twice.';

/** The .docx (Promise<Uint8Array>). */
export function nopicDocx() {
  const body = [
    p(r('Bold ', '<w:b/>') + r('italic ', '<w:i/>') +
      r('big', '<w:sz w:val="28"/>') + r('2', '<w:vertAlign ' +
      'w:val="superscript"/>') + '<w:r><w:tab/></w:r>' +
      r(LONG, '<w:u w:val="single"/>')),
    p(r(LONG + ' ' + LONG, '<w:highlight w:val="yellow"/>') +
      '<w:hyperlink r:id="rIdL"><w:r><w:t>a link</w:t></w:r>' +
      '</w:hyperlink>', '<w:spacing w:line="360" w:lineRule="auto"/>' +
      '<w:ind w:firstLine="720"/><w:jc w:val="both"/>'),
    p(r('Before ') + '<w:r><w:pict><v:shape xmlns:v="urn:' +
      'schemas-microsoft-com:vml"/></w:pict></w:r>' + r(' after') +
      '<w:r><w:br/></w:r>' + '<w:r><w:tab/></w:r>' + r('9.50'),
    '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="6000"/>' +
      '</w:tabs><w:jc w:val="right"/>'),
    p(r('A drawing ') + '<w:r>' + drawingXml({decl: false}) +
      '</w:r>' + r(' as a box.'), '<w:ind w:left="360" ' +
      'w:hanging="360"/>'),
  ].join('');
  const root = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
    `xmlns:pic="${URIS.pic}"`;
  return buildDocx({'word/document.xml': documentXml(body,
    {rootAttrs: root})}, {docRels: [['rIdL', REL('hyperlink'),
    'http://example.com/', 'External']]});
}

/** Lines as plain data (what JSON keeps). */
export const plain = (lines) => JSON.parse(JSON.stringify(lines));

/** Lay the paragraphs out with the modules in `dir` (old or new). */
export async function layAll(dir, map) {
  const u = (m) => pathToFileURL(dir + '/!Word/' + m).href;
  const {readDocx} = await import(u('DocxRead'));
  const {layoutPara} = await import(u('LineLayout'));
  const {TextMetrics} = await import(pathToFileURL(dir +
    '/!WimpLib/TextMetrics').href);
  const doc = await readDocx(await nopicDocx());
  const tm = new TextMetrics((t) => 8 * t.length);
  return doc.sections[0].blocks.map((b) => plain(layoutPara(b,
    doc.styles, WIDTH, tm, new Map(), undefined, 48, map)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('./nopic-lines.json',
    import.meta.url));
  writeFileSync(out, JSON.stringify(await layAll(process.argv[2]),
    null, 1) + '\n');
  console.log('wrote', out);
}
