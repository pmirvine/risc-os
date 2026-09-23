// RISC OS Latin-1 (Acorn extended ISO 8859-1) <-> Unicode.
// 0x80-0x9F hold Acorn-specific glyphs (e.g. 0x8B is the Shift arrow used in menus).
const HIGH = [
  '€', 'Ŵ', 'ŵ', '◰', '\u{1FBC0}', 'Ŷ', 'ŷ', '\u{1FBC1}',
  '⇦', '⇨', '⇩', '⇧', '…', '™', '‰', '•',
  '‘', '’', '‹', '›', '“', '”', '„', '–',
  '—', '−', 'Œ', 'œ', '†', '‡', 'ﬁ', 'ﬂ',
];
const REV = new Map(HIGH.map((c, i) => [c, 0x80 + i]));

/** Decode bytes (Uint8Array / array) in RISC OS Latin-1 to a JS string. */
export function decodeLatin1(bytes, start = 0, end = bytes.length) {
  let s = '';
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    s += b >= 0x80 && b < 0xA0 ? HIGH[b - 0x80] : String.fromCharCode(b);
  }
  return s;
}

/** Encode a JS string to RISC OS Latin-1 bytes (unknown chars become '?'). */
export function encodeLatin1(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80 || (c >= 0xA0 && c < 0x100)) out.push(c);
    else out.push(REV.get(ch) ?? 0x3F);
  }
  return new Uint8Array(out);
}

/** Read a control-terminated string (any byte < 32 ends it) from bytes. */
export function ctrlString(bytes, off, max = Infinity) {
  let e = off;
  while (e < bytes.length && e - off < max && bytes[e] >= 32) e++;
  return decodeLatin1(bytes, off, e);
}
