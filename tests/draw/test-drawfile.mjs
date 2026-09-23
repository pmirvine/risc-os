// node tests/draw/test-drawfile.mjs : parse every sample Drawfile, re-serialise, compare bytes.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parseDrawfile, serialiseDrawfile, pathBBox, boundObject } from '../../src/apps/Draw/drawfile.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const files = execSync(`find ${root}/vendor/ro371 -name '*,aff'`).toString().trim().split('\n');
let ok = 0, same = 0, bad = 0;
const counts = {};
const count = (objs) => { for (const o of objs) { counts[o.type] = (counts[o.type] ?? 0) + 1; if (o.objects) count(o.objects); if (o.object) count([o.object]); } };
for (const f of files) {
  const b = new Uint8Array(fs.readFileSync(f));
  let doc;
  try { doc = parseDrawfile(b); } catch (e) { console.log('REJECT', path.relative(root, f), e.message); bad++; continue; }
  ok++;
  count(doc.objects);
  if (doc.warnings.length) console.log('WARN', path.relative(root, f), doc.warnings.slice(0, 3).join('; '));
  // round trip: re-serialise with the file's own header bbox; compare the object stream
  const out = serialiseDrawfile(doc, { bbox: doc.bbox });
  const doc2 = parseDrawfile(out);
  const again = serialiseDrawfile(doc2, { bbox: doc2.bbox });
  const stable = Buffer.compare(Buffer.from(out), Buffer.from(again)) === 0;
  // compare objects part: strip header/fonttable/options from both
  const strip = (bytes) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const parts = [];
    let o = 40;
    while (o + 8 <= bytes.length) { const t = v.getUint32(o, true) & 255, s = v.getUint32(o + 4, true); if (s < 8) break; if (t !== 0 && t !== 11) parts.push(bytes.slice(o, o + s)); o += s; }
    return Buffer.concat(parts.map((p) => Buffer.from(p)));
  };
  const eq = Buffer.compare(strip(b), strip(out)) === 0;
  if (eq) same++;
  else {
    const A = strip(b), B = strip(out);
    let i = 0; while (i < A.length && A[i] === B[i]) i++;
    console.log('DIFF', path.relative(root, f), 'objects bytes', A.length, 'vs', B.length, 'first diff at', i, stable ? '' : '(unstable!)');
  }
}
console.log(`parsed ${ok}, rejected ${bad}, object streams identical ${same}/${ok}`);
console.log(counts);
