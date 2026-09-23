// Decompress a Squash file (type &FCA: "SQSH" header + Unix compress LZW data), as used for the
// printer definition files (PrntDefn &FC6) in HardDisc4.Printing.Printers. Returns a Uint8Array,
// or the input unchanged if it isn't squashed.

export function isSquashed(b) { return b && b.length > 22 && b[0] === 0x53 && b[1] === 0x51 && b[2] === 0x53 && b[3] === 0x48; }

export function unsquash(b) {
  if (!isSquashed(b)) return b;
  const outLen = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
  return uncompressLZW(b.subarray(20), outLen);
}

/** Unix compress (.Z) decoder: magic 1F 9D, flags byte (bit 7 block mode, bits 0-4 max bits). */
export function uncompressLZW(d, hint = 0) {
  if (d[0] !== 0x1F || d[1] !== 0x9D) throw new Error('Not compressed data');
  const maxbits = d[2] & 0x1F, block = !!(d[2] & 0x80);
  const maxmax = 1 << maxbits;
  const prefix = new Uint16Array(maxmax), suffix = new Uint8Array(maxmax);
  for (let i = 0; i < 256; i++) suffix[i] = i;
  const out = new Uint8Array(Math.max(hint, 16));
  let o = 0, buf = out;
  const put = (c) => { if (o >= buf.length) { const n = new Uint8Array(buf.length * 2); n.set(buf); buf = n; } buf[o++] = c; };
  const total = (d.length - 3) * 8;
  let bit = 0, nbits = 9, maxcode = 511, free = block ? 257 : 256, cnt = 0, clear = false;
  let oldcode = -1, finchar = 0;
  const stack = new Uint8Array(maxmax);
  const align = () => { const r = cnt % 8; if (r) bit += (8 - r) * nbits; cnt = 0; };
  for (;;) {
    if (clear || free > maxcode) {
      align();
      if (clear) { nbits = 9; maxcode = 511; clear = false; }
      else { nbits++; maxcode = nbits === maxbits ? maxmax : (1 << nbits) - 1; }
    }
    if (bit + nbits > total) break;
    let code = 0;
    for (let i = 0; i < nbits; i++, bit++) if (d[3 + (bit >> 3)] & (1 << (bit & 7))) code |= 1 << i;
    cnt++;
    if (oldcode === -1) { if (code >= 256) break; oldcode = finchar = code; put(code); continue; }
    if (code === 256 && block) { free = 256; clear = true; continue; }
    const incode = code;
    let sp = 0;
    if (code >= free) { stack[sp++] = finchar; code = oldcode; }
    while (code >= 256) { stack[sp++] = suffix[code]; code = prefix[code]; }
    finchar = suffix[code];
    stack[sp++] = finchar;
    while (sp) put(stack[--sp]);
    if (free < maxmax) { prefix[free] = oldcode; suffix[free] = finchar; free++; }
    oldcode = incode;
  }
  return buf.slice(0, hint || o);
}
