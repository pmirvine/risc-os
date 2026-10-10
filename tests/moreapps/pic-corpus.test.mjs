// The pictures of the corpus (Batch B, B1.2): pictureOf over every
// raw inline of every file, mediaOf for each understood one. Gated
// like the other corpus tests (tests/moreapps/corpus, optional).
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {pictureOf, docMap, MAX_EXT}
  from '../../tools/moreapps/!Word/PicRead';
import {mediaOf, imageInfo, decodable}
  from '../../tools/moreapps/!Word/PicMedia';
import {corpusFiles, nameOf, SKIP_CORPUS, ALL}
  from './roundtrip-lib.mjs';

const files = corpusFiles();

// (tables are kept as opaque nodes: only body paragraphs are looked at)
const paras = (blocks) => blocks.filter((b) => b.inlines);

describe('pic corpus', {skip: files.length ? false : SKIP_CORPUS}, () => {
  it('pictureOf and mediaOf over every inline', async () => {
    const n = {files: 0, raw: 0, understood: 0, floating: 0,
      missing: 0, other: 0, undecodable: 0};
    const bad = [];
    for (const f of files) {
      let doc;
      try {
        doc = await readDocx(readFileSync(f));
      } catch (e) {
        if (e instanceof DocxError) continue;
        throw e;
      }
      n.files++;
      const map = docMap(doc);
      for (const s of doc.sections) {
        for (const p of paras(s.blocks)) {
          for (const x of Object.values(p.inlines)) {
            if (!x || x.kind !== 'raw' || x.level !== 'r' || !x.node) {
              continue;
            }
            n.raw++;
            const pic = pictureOf(x.node, map);
            if (!pic) continue;
            n.understood++;
            if (pic.floating) n.floating++;
            if (!(pic.cx >= 1 && pic.cx <= MAX_EXT &&
              pic.cy >= 1 && pic.cy <= MAX_EXT)) {
              bad.push(`${nameOf(f)}: extent ${pic.cx} x ${pic.cy}`);
            }
            const m = mediaOf(doc, pic.embed);
            if (!m) n.missing++;
            else if (!m.mime) n.other++;
            else {
              const i = imageInfo(m.bytes);
              if (!i) bad.push(`${nameOf(f)}: ${m.name} has no info`);
              else if (decodable(i, m.bytes)) n.undecodable++;
            }
          }
        }
      }
    }
    console.log(`# pic corpus${ALL ? '' : ' (sample)'}: ` +
      JSON.stringify(n) + ' (other = not PNG/JPEG/GIF)');
    assert.deepEqual(bad, []);
  });
});
