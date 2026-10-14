// The headers and footers of the corpus (Batch D P6.2, D10), gated
// like the other corpus tests (tests/moreapps/corpus, optional; one
// file in ten unless WORD_EDIT_CORPUS=1):
//
// - read and written untouched, every header and footer part that
//   reads as a story, and its .rels, comes out byte-identical;
// - each story written from the model (forced: no bytes) reads back
//   as the same story under the body's normalisations (docx-compare
//   canon: ids renumbered, property children in schema order): the
//   same kind, root, prolog, relationships and blocks; and written
//   again from what was read back gives the very same bytes
//   (byte-stable).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx, DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {readStory} from '../../tools/moreapps/!Letters/StoryRead';
import {writeStory} from '../../tools/moreapps/!Letters/StoryWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {corpusFiles, nameOf, SKIP_CORPUS, ALL}
  from './roundtrip-lib.mjs';
import {canon, sameBytes, sameTree} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const files = corpusFiles();

/** The story in canonical form (ids from 0, extra nodes ordered). */
function canonStory(s) {
  const d = canon({sections: [], meta: {}, stories: new Map([[s.part,
    {...s, bytes: null, orig: []}]])});
  return d.stories.get(s.part);
}

/** Checks the stories of one file; adds to `n`. */
async function checkFile(bytes, name, n) {
  let doc;
  try {
    doc = await readDocx(bytes);
  } catch (e) {
    if (e instanceof DocxError) {
      n.refused++;
      return;
    }
    throw e;
  }
  n.files++;
  if (!doc.stories.size) return;
  n.withStories++;
  const z0 = await readZip(bytes);
  const z = await readZip(await writeDocx(doc, {date: DATE}));
  const {map} = docScope(doc);
  for (const [part, s] of doc.stories) {
    n.stories++;
    n.blocks += s.blocks.length;
    assert.ok(sameBytes(z.get(part), z0.get(part)),
      name + ': ' + part + ' not byte-identical');
    if (s.relsPart) {
      n.rels++;
      assert.ok(sameBytes(z.get(s.relsPart), z0.get(s.relsPart)),
        name + ': ' + s.relsPart + ' not byte-identical');
    }
    const relsBytes = s.relsPart ? doc.parts.get(s.relsPart) : null;
    const opts = {relsPart: s.relsPart};
    const out = writeStory({...s, bytes: null}, map);
    const back = readStory(part, out, map, relsBytes, opts);
    assert.ok(back, name + ': ' + part + ' forced write does not read');
    if (!s.blocks.length) {
      // read empty: written with one empty w:p (CT_HdrFtr needs a
      // block: StoryWrite, P6 fix I3)
      n.emptied++;
      assert.deepEqual(back.blocks.map((b) => [b.type, b.text]),
        [['p', '']], name + ': ' + part + ' empty');
    } else {
      sameTree(canonStory(back), canonStory(s), name + ': ' + part);
    }
    const again = writeStory({...back, bytes: null}, map);
    assert.ok(sameBytes(again, out), name + ': ' + part +
      ' forced write not byte-stable');
    if (sameBytes(out, s.bytes)) n.sameAsRead++;
  }
}

describe('stories corpus', {skip: files.length ? false : SKIP_CORPUS},
  () => {
    it('every header and footer round-trips; forced writes equivalent',
      async () => {
        const t0 = Date.now();
        const n = {files: 0, refused: 0, withStories: 0, stories: 0,
          rels: 0, blocks: 0, sameAsRead: 0, emptied: 0};
        const failures = [];
        for (const f of files) {
          try {
            await checkFile(readFileSync(f), nameOf(f), n);
          } catch (e) {
            failures.push(String(e.message).split('\n').slice(0, 3)
              .join(' | ').slice(0, 400));
          }
        }
        console.log(`# stories corpus${ALL ? '' : ' (sample; ' +
          'WORD_EDIT_CORPUS=1 for all)'}: ${files.length} files, ` +
          `${n.files} read, ${n.refused} refused, ${n.withStories} ` +
          `with stories, ${n.stories} stories (${n.rels} with .rels, ` +
          `${n.blocks} blocks) byte-identical; forced writes ` +
          `equivalent, ${n.sameAsRead} of them the very bytes read, ` +
          `${n.emptied} read empty given one w:p; ` +
          `${failures.length} failures; ${Date.now() - t0} ms`);
        assert.deepEqual(failures, []);
        if (ALL) assert.ok(n.stories > 0, 'no story in the corpus');
      });
  });
