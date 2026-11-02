// The spell check over the corpus (optional, like the other corpus
// tests): every paragraph of every file is checked with the bundled
// dictionary, never throws and averages under 5 ms. No count of
// flags is pinned.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readDocx, DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {parseDict} from '../../tools/moreapps/!Letters/SpellDict';
import {loadDict, DICT_DIR} from '../../tools/moreapps/!Letters/SpellLoad';
import {checkPara, allParas} from '../../tools/moreapps/!Letters/SpellCheck';
import {corpusFiles, nameOf, SKIP_CORPUS} from './roundtrip-lib.mjs';

const files = corpusFiles();
const ROOT = new URL('../../tools/moreapps/!Letters/', import.meta.url);
const HAVE = existsSync(new URL('Dict/en_GB_dic', ROOT));
const skip = !HAVE ? 'no Dict/' : files.length ? false : SKIP_CORPUS;

describe('spell corpus', {skip}, () => {
  it('checks every paragraph: no throw, under 5 ms each', async () => {
    const rd = async (q) =>
      new Uint8Array(readFileSync(new URL(q.split('.').join('/'),
        ROOT)));
    const dict = parseDict(await loadDict(rd, DICT_DIR));
    const memo = new Map();
    let n = 0, ms = 0, worst = [0, ''];
    for (const f of files) {
      let doc;
      try {
        doc = await readDocx(readFileSync(f));
      } catch (e) {
        if (e instanceof DocxError) continue;
        throw e;
      }
      for (const markup of ['final', 'all']) {
        for (const q of allParas(doc)) {
          const t = performance.now();
          const got = checkPara(dict, doc, q,
            {markup, ignore: new Set(), personal: new Set(), memo});
          const dt = performance.now() - t;
          ms += dt;
          n++;
          if (dt > worst[0]) worst = [dt, nameOf(f)];
          for (const g of got) {
            assert.ok(g.from >= 0 && g.to <= q.text.length &&
              g.from < g.to, nameOf(f));
          }
        }
      }
    }
    console.log(`spell corpus: ${n} paragraphs, ` +
      `${(ms / Math.max(n, 1)).toFixed(3)} ms each, ` +
      `worst ${worst[0].toFixed(1)} ms (${worst[1]})`);
    assert.ok(ms / Math.max(n, 1) < 5);
  });
});
