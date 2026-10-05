// Standalone check (not part of `node --test`): validates what the
// .docx writer writes against the ECMA-376 schema with xmllint.
//
//   node tests/moreapps/validate.mjs
//   VALIDATE_DIR=tests/moreapps/corpus [VALIDATE_MAX=150] node ...
//
// With VALIDATE_DIR the .docx files under that folder (at most
// VALIDATE_MAX, evenly spread) are read and written, and for each
// of the document, styles and settings parts the schema errors of
// the original are compared with those of what we wrote (by message
// and element, line numbers left out): only errors the writer ADDS
// are reported as FAIL.
//
// Needs xmllint and the schema files in tools/moreapps/.cache/
// (wml.xsd and the files it imports, from the python-docx mirror
// https://raw.githubusercontent.com/python-openxml/python-docx/
// master/ref/xsd/). Prints PASS, FAIL (with xmllint's messages) or
// SKIP for the document, styles and settings parts of new documents,
// an edited document and every reader fixture. A FAIL means Word may
// complain about the file; some fixtures hold content that is wrong
// on purpose (unknown elements, a pPr with attributes...), and the
// writer keeps such content as it was.
import {existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync,
  readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {FIXTURES} from './docx-fixtures.mjs';

const CACHE = fileURLToPath(new URL('../../tools/moreapps/.cache/',
  import.meta.url));
const NEEDED = ['wml.xsd', 'shared-commonSimpleTypes.xsd',
  'shared-math.xsd', 'shared-relationshipReference.xsd',
  'dml-wordprocessingDrawing.xsd', 'dml-main.xsd'];

function hasXmllint() {
  try {
    execFileSync('xmllint', ['--version'], {stdio: 'ignore'});
    return true;
  } catch (e) {
    return false;
  }
}

if (!hasXmllint()) {
  console.log('SKIP: xmllint not found');
  process.exit(0);
}
const missing = NEEDED.filter((f) => !existsSync(join(CACHE, f)));
if (missing.length) {
  console.log('SKIP: not in tools/moreapps/.cache: ' + missing.join(' '));
  process.exit(0);
}

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const DIRECTORY = process.env.VALIDATE_DIR;

function docxIn(d, out = []) {
  for (const e of readdirSync(d, {withFileTypes: true})) {
    if (e.isDirectory()) docxIn(join(d, e.name), out);
    else if (/\.docx$/i.test(e.name)) out.push(join(d, e.name));
  }
  return out.sort();
}

const samples = DIRECTORY ? [] : [
  ['newDoc a4', () => writeDocx(newDoc({date: DATE}), {date: DATE})],
  ['newDoc letter', () => writeDocx(newDoc({paper: 'letter',
    date: DATE}), {date: DATE})],
  ['edited newDoc', () => {
    const d = new Document(newDoc({date: DATE}));
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: ' Title & <more>\ttext\nline two '});
    d.apply({op: 'setProps', block: [0, 0], pStyle: 'Heading1',
      pPr: {jc: 'center', spacing: {before: 120}, keepNext: false},
      range: {start: 1, end: 6}, rPr: {b: true, sz: 28, color: 'FF0000',
        rFonts: {ascii: 'Arial'}}});
    d.apply({op: 'splitBlock', block: [0, 0], at: 8});
    return writeDocx(d.doc, {date: DATE});
  }],
  ...FIXTURES.map(([name, make]) => ['fixture ' + name, async () =>
    writeDocx(await readDocx(await make()), {date: DATE})]),
];

// The schemas import the xml: namespace without saying where its
// schema is; a copy of them in a temporary folder points at a small
// local one (so nothing is fetched from the network).
const XML_XSD = '<xs:schema xmlns:xs="http://www.w3.org/2001/' +
  'XMLSchema" targetNamespace="http://www.w3.org/XML/1998/namespace">' +
  '<xs:attribute name="space"><xs:simpleType><xs:restriction base=' +
  '"xs:NCName"><xs:enumeration value="default"/><xs:enumeration ' +
  'value="preserve"/></xs:restriction></xs:simpleType>' +
  '</xs:attribute><xs:attribute name="lang" type="xs:language"/>' +
  '</xs:schema>';
const IMPORT = '<xsd:import namespace="http://www.w3.org/XML/1998/' +
  'namespace"/>';

const dir = mkdtempSync(join(tmpdir(), 'docx-validate-'));
for (const f of readdirSync(CACHE).filter((n) => n.endsWith('.xsd'))) {
  writeFileSync(join(dir, f), readFileSync(join(CACHE, f), 'utf8')
    .replace(IMPORT, IMPORT.replace('/>', ' schemaLocation="xml.xsd"/>')));
}
writeFileSync(join(dir, 'xml.xsd'), XML_XSD);
const schema = join(dir, 'wml.xsd');
const counts = {PASS: 0, FAIL: 0, SKIP: 0};

/** Set of normalised xmllint errors for these bytes. */
function errorsOf(bytes) {
  const file = join(dir, 'part.xml');
  writeFileSync(file, bytes);
  try {
    execFileSync('xmllint', ['--noout', '--nonet', '--schema', schema,
      file], {stdio: 'pipe', maxBuffer: 1 << 28});
    return new Set();
  } catch (e) {
    return new Set(String(e.stderr).split('\n')
      .filter((l) => l && !l.endsWith('fails to validate') &&
        !l.endsWith('validates'))
      .map((l) => l.replace(file + ':', '').replace(/^\d+:\s*/, '')));
  }
}

async function compareDirectory() {
  const all = docxIn(DIRECTORY);
  const max = Number(process.env.VALIDATE_MAX) || 150;
  const stride = Math.max(1, all.length / max);
  const picked = [];
  for (let i = 0; i < all.length; i += stride) picked.push(all[Math.floor(i)]);
  let files = 0, parts = 0, origBad = 0, writtenBad = 0, added = 0;
  const kinds = new Map();
  for (const f of picked) {
    let doc, out, orig;
    try {
      orig = await readZip(readFileSync(f));
      doc = await readDocx(readFileSync(f));
      out = await readZip(await writeDocx(doc, {date: DATE}));
    } catch (e) {
      continue;
    }
    files++;
    const m = doc.meta;
    for (const part of [m.mainPart, m.stylesPart, m.settingsPart]) {
      if (!part || !orig.has(part) || !out.has(part)) continue;
      parts++;
      const was = errorsOf(orig.get(part));
      const now = errorsOf(out.get(part));
      if (was.size) origBad++;
      if (now.size) writtenBad++;
      const extra = [...now].filter((x) => !was.has(x));
      if (extra.length) {
        added++;
        console.log('FAIL ' + f.slice(DIRECTORY.length) + ' ' + part);
        for (const x of extra.slice(0, 5)) console.log('    ' + x);
        for (const x of extra) {
          const k = x.replace(/^.*?(Schemas validity error : )/, '');
          kinds.set(k, (kinds.get(k) || 0) + 1);
        }
      }
    }
  }
  console.log(`# ${files} files, ${parts} parts: ${origBad} originals ` +
    `with schema errors, ${writtenBad} written with schema errors, ` +
    `${added} written parts with errors the original did not have`);
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`#   ${n} x ${k.slice(0, 200)}`);
  }
}

try {
  if (DIRECTORY) {
    await compareDirectory();
    process.exitCode = 0;
  }
  for (const [name, make] of samples) {
    let zip, names;
    try {
      const bytes = await make();
      zip = await readZip(bytes);
      const {meta} = await readDocx(bytes);
      names = [meta.mainPart, meta.stylesPart, meta.settingsPart]
        .filter(Boolean);
    } catch (e) {
      console.log('SKIP ' + name + ': ' + e.message);
      counts.SKIP++;
      continue;
    }
    for (const part of names) {
      const bytes = zip.get(part);
      if (!bytes) {
        console.log('SKIP ' + name + ' ' + part + ': not written');
        counts.SKIP++;
        continue;
      }
      const file = join(dir, 'part.xml');
      writeFileSync(file, bytes);
      try {
        execFileSync('xmllint', ['--noout', '--nonet', '--schema',
          schema, file],
          {stdio: 'pipe'});
        console.log('PASS ' + name + ' ' + part);
        counts.PASS++;
      } catch (e) {
        const msg = String(e.stderr).split('\n')
          .filter((l) => l && !l.endsWith('fails to validate'))
          .map((l) => '    ' + l.replace(file, part)).join('\n');
        console.log('FAIL ' + name + ' ' + part + '\n' + msg);
        counts.FAIL++;
      }
    }
  }
} finally {
  rmSync(dir, {recursive: true, force: true});
}
console.log(`# ${counts.PASS} pass, ${counts.FAIL} fail, ` +
  `${counts.SKIP} skip`);
