// DocxWrite round trips: read -> write -> read gives the same model,
// for every reader fixture, textutil output and real files found on
// this machine (read only; they are never committed).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync}
  from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {NS} from '../../tools/moreapps/!Word/Wml';
import {FIXTURES} from './docx-fixtures.mjs';
import {assertSameDoc, entries, xmlEntries, realDocxFiles, sameBytes}
  from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});

/**
 * The writer's documented normalisations of a document it reads
 * back, applied to the model `doc` read from the original.
 */
function expected(doc) {
  const d = structuredClone(doc);
  const at = d.meta.documentRoot.attrs;
  if (!at.some(([n]) => n === 'xmlns:w')) at.push(['xmlns:w', NS.w]);
  return d;
}

/** Round-trip one file: equal model, stable bytes, clean package. */
async function roundTrip(bytes, what) {
  const a = await readDocx(bytes);
  const out1 = await write(a);
  const b = await readDocx(out1);
  assertSameDoc(b, expected(a), what);
  const out2 = await write(b);
  assert.ok(sameBytes(await write(await readDocx(out2)), out2),
    what + ': second generation is stable');
  assert.ok(sameBytes(await write(b), out2), what + ': deterministic');
  // unknown parts byte-identical
  const z = await entries(out1);
  for (const [n, v] of a.parts) {
    assert.ok(sameBytes(z.get(n), v), what + ': part ' + n);
  }
  await xmlEntries(out1); // every XML part parses
  return {a, out1, z};
}

describe('DocxWrite: round trip of the reader fixtures', () => {
  for (const [name, make] of FIXTURES) {
    it(name, async () => {
      await roundTrip(await make(), name);
    });
  }
});

const TEXTUTIL = '/usr/bin/textutil';

describe('DocxWrite: round trip of textutil documents', () => {
  it('html and rtf converted by textutil',
    {skip: existsSync(TEXTUTIL) ? false : 'no /usr/bin/textutil'},
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'docx-rt-'));
      try {
        writeFileSync(join(dir, 'a.html'), '<html><body><h1>Head</h1>' +
          '<p>Plain <b>bold</b> <i>it</i> <a href="http://example.' +
          'invalid/">link</a>.</p><ul><li>one</li></ul><table border=' +
          '"1"><tr><td>A</td><td>B</td></tr></table></body></html>');
        writeFileSync(join(dir, 'b.rtf', ), '{\\rtf1\\ansi{\\fonttbl' +
          '\\f0 Helvetica;}\\f0\\fs48 Big\\par\\fs24 Plain {\\b bold}.' +
          '\\par}');
        for (const src of ['a.html', 'b.rtf']) {
          const out = join(dir, src + '.docx');
          execFileSync(TEXTUTIL, ['-convert', 'docx', '-output', out,
            join(dir, src)]);
          await roundTrip(readFileSync(out), 'textutil ' + src);
        }
      } finally {
        rmSync(dir, {recursive: true, force: true});
      }
    });
});

/** Every r:id / r:embed / r:link / r:pict value in a tree. */
function relRefs(node, out = []) {
  if (typeof node !== 'object' || !node.attrs) return out;
  for (const [n, v] of node.attrs) {
    if (/^r:(id|embed|link|pict|dm|lo|qs|cs|href)$/.test(n))
      out.push(v);
  }
  for (const c of node.children) relRefs(c, out);
  return out;
}

describe('DocxWrite: real .docx files on this machine', () => {
  // off by default: MOREAPPS_REAL_DOCX=1 searches the system folders
  // and MOREAPPS_REAL_DOCX_DIRS (see docx-compare.mjs, realDocxRoots)
  const off = process.env.MOREAPPS_REAL_DOCX !== '1' &&
    'set MOREAPPS_REAL_DOCX=1 (and MOREAPPS_REAL_DOCX_DIRS=dir:dir) ' +
    'to round-trip the .docx files on this machine';
  it('round-trips every real file found', {skip: off}, async (t) => {
    const files = await realDocxFiles();
    if (!files.length) {
      t.skip('no .docx files found');
      return;
    }
    let ok = 0, refused = 0, paras = 0;
    const failed = [];
    for (const f of files) {
      let bytes;
      try {
        bytes = readFileSync(f);
      } catch (e) {
        continue;
      }
      let doc;
      try {
        doc = await readDocx(bytes);
      } catch (e) {
        if (e instanceof DocxError) { refused++; continue; }
        throw e;
      }
      try {
        const {a, out1} = await roundTrip(bytes, f);
        const x = await xmlEntries(out1);
        const ids = (await readDocx(out1)).rels.map((r) => r.id);
        assert.equal(new Set(ids).size, ids.length, f + ': unique ids');
        const main = x.get(a.meta.mainPart).root;
        for (const id of relRefs(main)) {
          assert.ok(ids.includes(id), f + ': r:id ' + id + ' exists');
        }
        paras += doc.sections.reduce((n, s) => n + s.blocks.length, 0);
        ok++;
      } catch (e) {
        failed.push(f + ': ' + e.message.split('\n')[0]);
      }
    }
    console.log(`# real files: ${files.length} found, ${ok} round-trip,` +
      ` ${refused} refused by the reader, ${failed.length} failed,` +
      ` ${paras} blocks`);
    assert.deepEqual(failed, []);
  });
});
