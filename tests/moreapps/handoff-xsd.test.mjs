// The hand-off files of Batch C (tb-*.docx, handoff-tables.mjs) and
// Batch D (pg-*, hf-*, cl-*.docx; R11: pg-* from handoff-pages.mjs),
// in the git-ignored corpus/handoff, give no xmllint message at all
// in any part xmllint can check (the document, styles, numbering,
// settings, font table, web settings, notes, comments, headers and
// footers): Word may refuse such a file or offer to repair it, which
// would spoil the owner's session (final fix wave: a `thinThickThin`
// border and two orders out of place were found; final fix B, review
// 3 M24: every kind of message counts, a missing required attribute
// too, and settings.xml is checked). Not counted, as the
// Transitional schemas do not know them: what Word's own extensions
// add (attributes and elements in a schemas.microsoft.com namespace:
// w14 ids, w14:docId), mc:Ignorable, and the Strict root (Batch A's
// cl-3-strict). Skipped without the files or without xmllint and the
// schemas (tools/moreapps/.cache).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {schema} from './roundtrip-lib.mjs';

const DIR = join(import.meta.dirname, 'corpus', 'handoff');
const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => /^(tb|pg|hf|cl)-.*\.docx$/.test(f)) : [];
const {xsd, note} = schema();
const PART = new RegExp('^word/(document|styles|numbering|settings|' +
  'fontTable|webSettings|comments|footnotes|endnotes|header\\d*|' +
  'footer\\d*)\\.xml$');
const MS = '\\{http://schemas\\.microsoft\\.com/[^}]*\\}';
const IGNORED = [
  // an extension's attribute, and mc:Ignorable
  new RegExp(`attribute '(${MS}|\\{http://schemas\\.openxmlformats\\.` +
    `org/markup-compatibility/2006\\}Ignorable)[^']*': The attribute ` +
    `.* is not allowed`),
  // an extension's element (w14:docId in settings)
  new RegExp(`Element '${MS}[^']*': This element is not expected`),
  // the Strict root
  /Element '\{http:\/\/purl\.oclc\.org\/ooxml\/[^}]*\}[^']*': No matching global declaration available for the validation root/,
];
/** Whether an xmllint message counts against a hand-off file. */
const counts = (m) => !IGNORED.some((re) => re.test(m));

describe('hand-off files: no schema message', () => {
  it('counts every kind of message but the extensions and Strict',
    {skip: xsd ? false : note}, () => {
      const W = '<w:document xmlns:w="http://schemas.openxmlformats.' +
        'org/wordprocessingml/2006/main" xmlns:w14="http://schemas.' +
        'microsoft.com/office/word/2010/wordml" xmlns:mc="http://' +
        'schemas.openxmlformats.org/markup-compatibility/2006" ' +
        'mc:Ignorable="w14"><w:body><w:p w14:paraId="1A2B3C4D">' +
        '<w:pPr>JC</w:pPr></w:p></w:body></w:document>';
      const msgs = (jc) => [...xsd.errors(Buffer.from(
        W.replace('JC', jc)))].filter(counts);
      assert.deepEqual(msgs('<w:jc w:val="left"/>'), []);
      const missing = msgs('<w:jc/>');
      assert.equal(missing.length, 1);
      assert.match(missing[0], /required but missing/);
      assert.equal(msgs('<w:jc w:val="nowhere"/>').length, 1);
    });

  it('no message in any part of any file', {skip: xsd && files.length
    ? false : note || 'no files'}, async () => {
    const bad = [];
    for (const f of files) {
      const z = await readZip(readFileSync(join(DIR, f)));
      for (const [k, v] of z) {
        if (!PART.test(k)) continue;
        for (const e of xsd.errors(v)) {
          if (counts(e)) bad.push(`${f} ${k}: ${e.slice(0, 200)}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});
