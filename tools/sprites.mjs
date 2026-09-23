#!/usr/bin/env node
// RISC OS sprite file → PNG + JSON manifest converter.
//   node tools/sprites.mjs <spritefile> <outdir>       convert one file (writes <outdir>/<Base>/*.png + <outdir>/<Base>.json)
//   node tools/sprites.mjs --list <spritefile>          list sprites
//   node tools/sprites.mjs --build                       convert all pools listed in tools/sprite-pools.mjs into assets/sprites/
import fs from 'node:fs';
import path from 'node:path';
import { parseSpriteFile } from './lib/spritefile.mjs';
import { encodePNG } from './lib/png.mjs';

/** URL/filesystem-safe lower-case filename for a sprite name. */
export function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_!\-]/g, (c) => '~' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

/** Scale an RGBA image vertically by an integer factor (row duplication). */
function scaleRows(w, h, rgba, f) {
  const out = new Uint8Array(w * h * f * 4);
  for (let y = 0; y < h; y++) for (let k = 0; k < f; k++) out.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), (y * f + k) * w * 4);
  return out;
}
function scaleCols(w, h, rgba, f) {
  const out = new Uint8Array(w * f * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < f; k++) out.set(rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w * f + x * f + k) * 4);
  return out;
}

/**
 * Convert one sprite file. PNGs go to <outDir>/<base>/<name>.png, manifest to <outDir>/<base>.json.
 * Returns the manifest object.
 */
export function convertSpriteFile(file, outDir, base) {
  base = base || path.basename(file).replace(/,[0-9a-f]{3}$/i, '');
  const sprites = parseSpriteFile(fs.readFileSync(file));
  const dir = path.join(outDir, base);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {};
  for (const s of sprites) {
    if (s.error) { console.warn(`  ${file}: ${s.name}: ${s.error}`); continue; }
    if (!s.w || !s.h) continue;
    const fn = safeName(s.name);
    fs.writeFileSync(path.join(dir, fn + '.png'), encodePNG(s.w, s.h, s.rgba));
    const e = { w: s.w, h: s.h, file: `${base}/${fn}.png`, xeig: s.xeig, yeig: s.yeig, osW: s.w << s.xeig, osH: s.h << s.yeig, bpp: s.bpp, hasMask: s.hasMask, hasPalette: s.hasPalette };
    if (s.xeig !== s.yeig) {
      // Square-pixel version at the finer of the two resolutions.
      let { w, h, rgba } = s;
      if (s.yeig > s.xeig) { const f = 1 << (s.yeig - s.xeig); rgba = scaleRows(w, h, rgba, f); h *= f; }
      else { const f = 1 << (s.xeig - s.yeig); rgba = scaleCols(w, h, rgba, f); w *= f; }
      fs.writeFileSync(path.join(dir, fn + '.sq.png'), encodePNG(w, h, rgba));
      e.fileSq = `${base}/${fn}.sq.png`; e.wSq = w; e.hSq = h; e.eigSq = Math.min(s.xeig, s.yeig);
    }
    manifest[s.name.toLowerCase()] = e;
  }
  fs.writeFileSync(path.join(outDir, base + '.json'), JSON.stringify(manifest, null, 1));
  return manifest;
}

async function main() {
  const a = process.argv.slice(2);
  if (a[0] === '--list') {
    for (const s of parseSpriteFile(fs.readFileSync(a[1])))
      console.log(s.error ? `${s.name}: ${s.error}` : `${s.name.padEnd(12)} ${s.w}x${s.h} ${s.bpp}bpp eig ${s.xeig},${s.yeig} mode 0x${s.mode.toString(16)} mask:${s.hasMask} pal:${s.hasPalette}`);
  } else if (a[0] === '--build') {
    const { buildPools } = await import('./sprite-pools.mjs');
    buildPools(convertSpriteFile);
  } else if (a.length === 2) {
    convertSpriteFile(a[0], a[1]);
  } else {
    console.log('usage: sprites.mjs <file> <outdir> | --list <file> | --build');
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
