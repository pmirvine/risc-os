// Write small RISC OS sprite files (4bpp, mode 27 square pixels, Wimp colours, with a mask) from character
// maps, one character per pixel: '.' transparent, W white, K black, and the letters below for Wimp colours.
// (The same method as tools/basicwimp-demo.mjs.)
const COLOURS = { '.': -1, W: 0, w: 1, l: 2, g: 3, m: 4, d: 5, D: 6, K: 7, B: 8, Y: 9, G: 10, R: 11, C: 12, E: 13, O: 14, L: 15 };

/** One sprite: name (at most 12 characters), rows of equal length. */
export function sprite(name, rows) {
  const h = rows.length, w = rows[0].length;
  const words = Math.ceil(w * 4 / 32), rowBytes = words * 4;
  const img = Buffer.alloc(rowBytes * h), mask = Buffer.alloc(rowBytes * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = COLOURS[ch] ?? -1;
    const o = y * rowBytes + (x >> 1), sh = (x & 1) * 4;
    if (c >= 0) { img[o] |= c << sh; mask[o] |= 0xF << sh; }
  }));
  const hdr = Buffer.alloc(44);
  hdr.writeUInt32LE(44 + img.length * 2, 0);
  Buffer.from(name.padEnd(12, '\0').slice(0, 12), 'latin1').copy(hdr, 4);
  hdr.writeUInt32LE(words - 1, 16); hdr.writeUInt32LE(h - 1, 20); hdr.writeUInt32LE(0, 24);
  hdr.writeUInt32LE((w * 4 - 1) % 32, 28); hdr.writeUInt32LE(44, 32); hdr.writeUInt32LE(44 + img.length, 36); hdr.writeUInt32LE(27, 40);
  return Buffer.concat([hdr, img, mask]);
}

/** A sprite file holding the sprites. */
export function spriteFile(list) {
  const body = Buffer.concat(list);
  const h = Buffer.alloc(12);
  h.writeUInt32LE(list.length, 0); h.writeUInt32LE(16, 4); h.writeUInt32LE(16 + body.length, 8);
  return Buffer.concat([h, body]);
}
