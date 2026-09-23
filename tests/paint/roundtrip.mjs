// node tests/paint/roundtrip.mjs  - decode + re-encode every sprite file on the seed disc
import fs from 'fs';
import path from 'path';
import { readSpriteFile, writeSpriteFile, touch } from '../../src/apps/Paint/spritefile.js';
const root = new URL('../../assets/disc/', import.meta.url).pathname;
const man = JSON.parse(fs.readFileSync(root + 'manifest.json', 'utf8'));
const files = [];
(function walk(n) { for (const c of n.children ?? []) { if (c.type === 'ff9') files.push(c.path); walk(c); } })(man.root);
let ok = 0, same = 0, diff = 0, sprites = 0, bad = 0;
for (const f of files) {
  const buf = new Uint8Array(fs.readFileSync(root + f));
  let sf;
  try { sf = readSpriteFile(buf); } catch (e) { console.log('FAIL', f, e.message); continue; }
  const w1 = writeSpriteFile(sf);
  const eqRaw = w1.length === buf.length && w1.every((b, i) => b === buf[i]);
  sf.sprites.forEach((s) => { sprites++; if (s.bad) bad++; else touch(s); });
  const w2 = writeSpriteFile(sf);
  const eq = w2.length === buf.length && w2.every((b, i) => b === buf[i]);
  if (eqRaw) ok++;
  if (eq) same++; else {
    diff++;
    let i = 0; while (i < Math.min(w2.length, buf.length) && w2[i] === buf[i]) i++;
    if (process.env.V) console.log('re-encode differs', f, 'len', buf.length, w2.length, 'first diff at', i);
  }
}
console.log(`${files.length} files, ${sprites} sprites (${bad} unknown modes); raw round-trip ok ${ok}; re-encoded identical ${same}, differ ${diff}`);
// fresh encode (no original bytes) must decode to the same pixels/mask/palette
import { encodeSprite, decodeSprite } from '../../src/apps/Paint/spritefile.js';
let fresh = 0, freshBad = 0;
for (const f of files) {
  const sf = readSpriteFile(new Uint8Array(fs.readFileSync(root + f)));
  for (const s of sf.sprites) {
    if (s.bad) continue;
    s.raw = null; s.orig = null;
    const d = decodeSprite(encodeSprite(s));
    const same = d.w === s.w && d.h === s.h && d.px.every((v, i) => v === s.px[i]) && (!s.mask || d.mask.every((v, i) => v === s.mask[i])) && (!s.pal || d.pal.every((v, i) => v === s.pal[i]));
    fresh++; if (!same) { freshBad++; console.log('fresh mismatch', f, s.name); }
  }
}
console.log(`fresh encode: ${fresh} sprites, ${freshBad} mismatches`);
