// Wimp_OpenTemplate / Wimp_LoadTemplate / Wimp_CloseTemplate over a Templates file read from the
// VFS: the window block is copied into the program's buffer exactly as stored, indirected data
// into its workspace (pointers relocated), and font references resolved through Font_FindFont.

import { vfs } from '../vfs.js';
import { BasicError } from '../../basic/errors.js';
import { decodeLatin1 } from '../charset.js';

const IND = 0x100, TEXT = 1, SPRITE = 2, FONT = 0x40;

export class TemplateFile {
  constructor(bytes) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.entries = [];
    const fontOff = this.v.getInt32(0, true);
    let p = 16;
    while (p + 24 <= bytes.length) {
      const off = this.v.getInt32(p, true);
      if (off === 0) break;
      const size = this.v.getInt32(p + 4, true), type = this.v.getInt32(p + 8, true);
      let name = '';
      for (let i = 0; i < 12; i++) { const c = bytes[p + 12 + i]; if (c < 32) break; name += String.fromCharCode(c); }
      this.entries.push({ off, size, type, name });
      p += 24;
    }
    // font data: 48-byte records {xsize, ysize (1/16 pt), name[40]}
    this.fonts = [];
    if (fontOff > 0) {
      for (let q = fontOff; q + 48 <= bytes.length; q += 48) {
        const name = decodeLatin1(bytes.slice(q + 8, q + 48)).replace(/[\0\r\n].*$/s, '');
        this.fonts.push({ xs: this.v.getInt32(q, true), ys: this.v.getInt32(q + 4, true), name });
      }
    }
  }
  static async open(path) {
    const st = vfs.stat(path);
    if (!st || st.type !== 'file') throw new BasicError(0x108D6, `File '${path}' not found`);
    return new TemplateFile(await vfs.readFile(st.path));
  }
}

function wildMatch(pat, name) {
  const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/#/g, '.') + '$', 'i');
  return re.test(name);
}

/**
 * Wimp_LoadTemplate. r: registers (modified). m: machine. fontFind(name, xs, ys) -> handle.
 */
export function loadTemplate(tf, r, m, fontFind) {
  if (!tf) throw new BasicError(0x288, 'Template file not open');
  const M = m.mem;
  const namePtr = r[5] >>> 0;
  let pat = '';
  for (let i = 0; i < 12; i++) { const c = M.rd8(namePtr + i); if (c < 32) break; pat += String.fromCharCode(c); }
  let start = r[6] | 0;
  let idx = -1;
  for (let i = Math.max(0, start); i < tf.entries.length; i++) {
    if (tf.entries[i].type === 1 && wildMatch(pat, tf.entries[i].name)) { idx = i; break; }
  }
  if (idx < 0) { r[6] = 0; return; }
  const e = tf.entries[idx];
  const b = tf.b, v = tf.v, base = e.off;
  const nIcons = v.getInt32(base + 84, true);
  const blockLen = 88 + 32 * nIcons;
  // indirected data: everything after the icon blocks
  const indLen = Math.max(0, e.size - blockLen);
  const writeName = () => {
    const nm = e.name.slice(0, 11);
    for (let i = 0; i < nm.length; i++) M.wr8(namePtr + i, nm.charCodeAt(i));
    M.wr8(namePtr + nm.length, 13);
  };
  if ((r[1] | 0) <= 0) {           // size enquiry (RISC OS 3): sizes, and the name found
    r[1] = blockLen; r[2] = indLen; r[6] = idx + 1;
    writeName();
    return;
  }
  const buf = r[1] >>> 0;
  let ws = r[2] >>> 0;
  const wsEnd = r[3] >>> 0;
  if (ws + indLen > wsEnd) throw new BasicError(0x2C7, 'Not enough room for indirected icon data');
  for (let i = 0; i < blockLen; i++) M.wr8(buf + i, b[base + i]);
  for (let i = 0; i < indLen; i++) M.wr8(ws + i, b[base + blockLen + i]);
  const reloc = (p) => { const o = M.rd32(p); if (o > 0 && o < e.size) M.wr32(p, ws + o - blockLen); };
  const fixIcon = (flags, dp) => {
    if (flags & IND) {
      if (flags & TEXT) { reloc(dp); const vp = M.rd32(dp + 4); if (vp > 0 && vp < e.size) reloc(dp + 4); }
      else if (flags & SPRITE) { reloc(dp); }
    }
  };
  const fontRef = r[4] | 0;
  const fixFont = (flagsPtr) => {
    let f = M.rd32(flagsPtr) >>> 0;
    if (!(f & FONT)) return;
    const n = f >>> 24;
    const fd = tf.fonts[n - 1];
    if (!fd) return;
    const h = fontFind(fd.name, fd.xs, fd.ys);
    if (fontRef !== -1 && fontRef) M.wr8((fontRef >>> 0) + h, Math.min(255, M.rd8((fontRef >>> 0) + h) + 1));
    f = ((f & 0x00FFFFFF) | ((h & 255) << 24)) >>> 0;
    M.wr32(flagsPtr, f);
  };
  fixIcon(M.rd32(buf + 56), buf + 72);          // title
  fixFont(buf + 56);
  for (let i = 0; i < nIcons; i++) {
    const ip = buf + 88 + 32 * i;
    fixIcon(M.rd32(ip + 16), ip + 20);
    fixFont(ip + 16);
  }
  writeName();
  r[2] = ws + indLen;
  r[6] = idx + 1;
}
