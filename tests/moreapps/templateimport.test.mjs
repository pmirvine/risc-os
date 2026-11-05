// A template made from a document imported from a real ODT or .doc
// (the uncommitted corpus; skipped when absent) has the template
// content type on its main part, and reads back as a template.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {asTemplate, isTemplate, isMacro}
  from '../../tools/moreapps/!Letters/Template';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const first = (dir, ext, test = () => true) => {
  const walk = (d) => {
    if (!fs.existsSync(d)) return null;
    for (const e of fs.readdirSync(d, {withFileTypes: true})
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) { const r = walk(q); if (r) return r; }
      else if (e.name.toLowerCase().endsWith(ext) && test(q)) return q;
    }
    return null;
  };
  return walk(path.join(HERE, dir));
};
const small = (f) => fs.statSync(f).size < 200000;
const ODT = first('corpus/libreoffice-odt', '.odt', small);
const DOC = first('corpus/poi-doc', '.doc', small);

async function check(read, file) {
  const got = await read(new Uint8Array(fs.readFileSync(file)),
    {maxParagraphs: 200000});
  assert.ok(got.doc);
  const bytes = await writeDocx(asTemplate(got.doc));
  const back = await readDocx(bytes, {});
  assert.equal(isTemplate(back), true);
  assert.equal(isMacro(back.meta.contentTypes, back.meta.mainPart),
    false);
  // (the original is still a document)
  assert.equal(isTemplate(got.doc), false);
}

describe('template from an imported document', () => {
  it('ODT', {skip: ODT ? false : 'no ODT corpus'},
    () => check(readOdt, ODT));
  it('.doc', {skip: DOC ? false : 'no .doc corpus'},
    () => check(readDoc, DOC));
});
