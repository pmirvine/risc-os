// The Squash module's 12-bit LZW (Unix compress -b 12 format, 0x1F 0x9D 0x8C header), ported
// from vendor/ro371/Sources/OS_Core/Squash/c/cssr (compress_store_store) and c/zssr
// (zcat_store_store), and the Squash file format of the !Squash application (c/squash):
//
//   +0  "SQSH"   +4 original length   +8 load address   +12 exec address   +16 reserved (0)
//   +20 LZW data
//
// Host-agnostic: works in node and the browser.

const INIT_BITS = 9, BITS = 12, HASH_RETRY = 5003, CHECK_GAP = 32768, FIRST = 257, CLEAR = 256;

export const SQUASH_TYPE = 0xFCA;
export const HEADER_SIZE = 20;

/** LZW-compress bytes exactly as Squash_Compress (restartable algorithm) does. */
export function compress(input) {
  const n = input.length;
  const out = [];
  if (n === 0) return new Uint8Array(0);
  const hashTable = new Int32Array(HASH_RETRY).fill(-1);
  const codeTable = new Int32Array(HASH_RETRY);
  const buf = new Uint8Array(BITS + 4);
  let offset = 0, codeSize = INIT_BITS, freeEntry = FIRST, maxcode = (1 << INIT_BITS) - 1;

  const flush = (count) => { for (let i = 0; i < count; i++) out.push(buf[i]); };
  function outputCode(code, clearFlag) {
    if (code < 0) {                          // last byte(s)
      if (offset) { flush((offset + 7) >> 3); offset = 0; }
      return;
    }
    let bp = offset >> 3;
    const bo = offset & 7;
    if (bo) { buf[bp++] |= (code << bo) & 0xFF; code >>= 8 - bo; }
    const nb = (codeSize + 7) >> 3;
    for (let i = 0; i < nb; i++) buf[bp + i] = (code >> (8 * i)) & 0xFF;
    offset += codeSize;
    if (offset === codeSize << 3) { flush(codeSize); offset = 0; }   // a whole group of 8 codes
    if (freeEntry > maxcode || clearFlag) {
      if (offset) {                          // pad the group out (as compress(1) does)
        for (let i = (offset + 7) >> 3; i < codeSize; i++) buf[i] = 0;
        flush(codeSize); offset = 0;
      }
      codeSize = clearFlag ? INIT_BITS : codeSize + 1;
      maxcode = codeSize === BITS ? 1 << BITS : (1 << codeSize) - 1;
    }
  }

  out.push(0x1F, 0x9D, 0x80 | BITS);
  let previous = input[0];
  let inCount = 1, checkpoint = CHECK_GAP;
  for (let p = 1; p < n; p++) {
    const current = input[p];
    inCount++;
    const fcode = (current << BITS) + previous;
    let hash = (current << (BITS - 8)) ^ previous;
    if (hashTable[hash] === fcode) { previous = codeTable[hash]; continue; }
    if (hashTable[hash] >= 0) {
      const disp = hash ? HASH_RETRY - hash : 1;
      for (;;) {
        hash -= disp;
        if (hash < 0) hash += HASH_RETRY;
        if (hashTable[hash] < 0 || hashTable[hash] === fcode) break;
      }
      if (hashTable[hash] === fcode) { previous = codeTable[hash]; continue; }
    }
    outputCode(previous, false);
    previous = current;
    if (freeEntry < 1 << BITS) {
      codeTable[hash] = freeEntry++;
      hashTable[hash] = fcode;
    } else if (inCount >= checkpoint) {
      hashTable.fill(-1);
      freeEntry = FIRST;
      outputCode(CLEAR, true);
      checkpoint = inCount + CHECK_GAP;
    }
  }
  outputCode(previous, false);
  outputCode(-1, false);
  return Uint8Array.from(out);
}

export class SquashError extends Error {}

/** LZW-decompress (Squash_Decompress). outLen: expected output size (optional limit). */
export function decompress(input, outLen = Infinity) {
  const n = input.length;
  if (n === 0) return new Uint8Array(0);
  if (n < 3) throw new SquashError('Bad input for module Squash');
  if (input[2] !== (0x80 | BITS)) throw new SquashError('Bad input for module Squash');
  const prefixes = new Uint16Array(1 << BITS);
  const suffixes = new Uint8Array(1 << BITS);
  const out = new Uint8Array(Number.isFinite(outLen) ? outLen : Math.max(1024, n * 4));
  let buffer = out, len = 0;
  const put = (b) => {
    if (len >= buffer.length) {
      if (Number.isFinite(outLen)) return false;
      const nb = new Uint8Array(buffer.length * 2); nb.set(buffer); buffer = nb;
    }
    buffer[len++] = b;
    return true;
  };

  let p = 3, bufStart = 3, bufSize = 0, offset = 0;
  let codeSize = INIT_BITS, codemask = (1 << INIT_BITS) - 1, maxcode, freeEntry = FIRST;
  const clearTables = () => { for (let i = 0; i < 256; i++) { prefixes[i] = 0; suffixes[i] = i; } maxcode = (1 << INIT_BITS) - 1; };
  clearTables();

  function inputCode(clearFlag) {
    let bits = codeSize;
    if (clearFlag || offset >= bufSize || freeEntry > maxcode) {
      if (freeEntry > maxcode) {
        codeSize = ++bits;
        maxcode = bits === BITS ? 1 << BITS : (1 << bits) - 1;
        codemask = (1 << bits) - 1;
      }
      if (clearFlag) { codeSize = INIT_BITS; codemask = (1 << INIT_BITS) - 1; bits = INIT_BITS; }
      if (p >= n) return -1;
      bufStart = p;
      const bs = Math.min(bits, n - p);
      p += bs;
      offset = 0;
      bufSize = (bs << 3) - (bits - 1);
    }
    const bp = bufStart + (offset >> 3);
    const code = ((input[bp] | 0) | ((input[bp + 1] | 0) << 8) | ((input[bp + 2] | 0) << 16)) >> (offset & 7);
    offset += codeSize;
    return code & codemask;
  }

  let finalChar, previousCode;
  finalChar = previousCode = inputCode(false);
  if (finalChar < 0) return buffer.slice(0, len);
  if (!put(finalChar)) return buffer.slice(0, len);
  const stack = new Uint8Array(1 << BITS);
  outer: for (;;) {
    let code = inputCode(false);
    if (code < 0) break;
    if (code === CLEAR) {
      clearTables();
      freeEntry = FIRST - 1;
      code = inputCode(true);
      if (code < 0) break;
    }
    const inCode = code;
    let sp = 0;
    if (code >= freeEntry) {
      if (code === freeEntry) { stack[sp++] = finalChar; code = previousCode; }
      else throw new SquashError('Bad input for module Squash');
    }
    while (code >= 256) { stack[sp++] = suffixes[code]; code = prefixes[code]; }
    stack[sp++] = finalChar = code;
    while (sp > 0) if (!put(stack[--sp])) break outer;
    if (freeEntry < 1 << BITS) { prefixes[freeEntry] = previousCode; suffixes[freeEntry] = finalChar; freeEntry++; }
    previousCode = inCode;
  }
  return buffer.slice(0, len);
}

/** Is this a Squash file (header check)? */
export function isSquashed(bytes) {
  return bytes.length >= HEADER_SIZE && bytes[0] === 0x53 && bytes[1] === 0x51 && bytes[2] === 0x53 && bytes[3] === 0x48;
}

const rd32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const wr32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };

/**
 * Make a Squash file from data + the original load/exec addresses (a typed file has
 * load = &FFFtttdd). Returns null if compression gives no improvement (Squash then leaves
 * the file alone, as the original does).
 */
export function squashFile(data, load, exec) {
  const lz = compress(data);
  if (HEADER_SIZE + lz.length >= data.length) return null;
  const out = new Uint8Array(HEADER_SIZE + lz.length);
  out.set([0x53, 0x51, 0x53, 0x48]);
  wr32(out, 4, data.length); wr32(out, 8, load >>> 0); wr32(out, 12, exec >>> 0); wr32(out, 16, 0);
  out.set(lz, HEADER_SIZE);
  return out;
}

/** Read a Squash file header: {length, load, exec, filetype (or -1 if untyped)}. */
export function readHeader(bytes) {
  if (!isSquashed(bytes) || rd32(bytes, 16) !== 0) throw new SquashError('Invalid Squash header');
  const load = rd32(bytes, 8), exec = rd32(bytes, 12);
  return { length: rd32(bytes, 4), load, exec, filetype: (load >>> 20) === 0xFFF ? (load >>> 8) & 0xFFF : -1 };
}

/** Unsquash a Squash file: {data, load, exec, filetype}. */
export function unsquashFile(bytes) {
  const h = readHeader(bytes);
  const data = decompress(bytes.subarray(HEADER_SIZE), h.length);
  if (data.length !== h.length) throw new SquashError('Bad input for module Squash');
  return { ...h, data };
}
