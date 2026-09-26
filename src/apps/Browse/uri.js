// Address files. A URI file (&F91, Acorn's URI handler) is text:
//
//   URI<tab>100
//   <tab># comment lines
//   <tab>https://www.riscosopen.org/
//   <tab>RISC OS Open                 (the title, or * for none)
//
// An ANT URL file (&B28) is just the address. Both open in !Browse.
import { vfs } from '../../core/vfs.js';

export function uriFile(url, title) {
  return `URI\t100\n\t# Saved by !Browse\n\t${url}\n\t${(title || '*').replace(/[\r\n\t]+/g, ' ')}\n`;
}

/** The address in a URI or URL file. */
export async function readURLFile(path) {
  const text = await vfs.readText(path);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (/^URI\s+\d+/.test(lines[0] ?? '')) return lines[1] ?? null;
  return lines[0] ?? null;
}

/** File name extensions for file types that have no extension of their own on the host (uploads). */
export const TYPE_EXT = { 0xFFF: 'txt', 0xFAF: 'html', 0xC85: 'jpg', 0xB60: 'png', 0x695: 'gif', 0xADF: 'pdf', 0xF81: 'js', 0xF79: 'css', 0xFB1: 'wav', 0xDFE: 'csv', 0xF91: 'uri', 0xFF9: 'spr', 0xAFF: 'aff', 0xB28: 'url', 0xA91: 'zip', 0xDDC: 'zip' };
