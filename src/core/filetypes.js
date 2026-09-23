// File types: names, icon sprites, and Filer run actions (double-click semantics).

import { sprites } from './sprites.js';
import { sysvars } from './sysvars.js';
import { FT_DIR, FT_APP, FT_UNTYPED } from './vfs.js';

let names = {};

export async function initFiletypes() {
  try {
    const r = await fetch('assets/filetypes.json');
    if (r.ok) names = await r.json();
  } catch { /* ignore */ }
  for (const [hex, n] of Object.entries(names)) {
    const k = 'File$Type_' + hex.toUpperCase().padStart(3, '0');
    if (!sysvars.has(k)) sysvars.set(k, n);
  }
}

export const hex3 = (t) => (t & 0xFFF).toString(16).toUpperCase().padStart(3, '0');

/** Name of a file type ('Text', 'Sprite', or the hex number if unknown). */
export function typeName(t) {
  if (t === FT_DIR) return 'Directory';
  if (t === FT_APP) return 'Application';
  if (t === FT_UNTYPED || t == null) return '';
  const v = sysvars.get('File$Type_' + hex3(t));
  return v ?? hex3(t).toLowerCase();
}

/** Parse a file type given as a name or hex number (as *SetType does). Returns number or -1. */
export function parseType(s) {
  s = String(s).trim();
  if (/^&[0-9a-f]+$/i.test(s)) return parseInt(s.slice(1), 16) & 0xFFF;
  for (const v of sysvars.list('File$Type_*')) if (String(v.value).toLowerCase() === s.toLowerCase()) return parseInt(v.name.slice(-3), 16);
  if (/^[0-9a-f]{1,3}$/i.test(s)) return parseInt(s, 16);
  return -1;
}

/**
 * Sprite name for a file object (info from vfs.stat/list).
 * opts.small: small icon; opts.open: open directory variant.
 */
export function fileSprite(info, { small = false, open = false } = {}) {
  if (info.type === 'dir') {
    if (info.isApp) {
      const leaf = info.name.toLowerCase();
      if (small && sprites.has('sm' + leaf)) return { name: 'sm' + leaf };
      if (sprites.has(leaf)) return { name: leaf, half: small };
      return { name: small ? 'small_app' : 'application' };
    }
    if (open) return { name: small ? 'small_diro' : 'directoryo' };
    return { name: small ? 'small_dir' : 'directory' };
  }
  const t = info.filetype;
  if (t === FT_UNTYPED) {
    if (small && sprites.has('small_lxa')) return { name: 'small_lxa' };
    if (!small && sprites.has('file_lxa')) return { name: 'file_lxa' };
    return { name: small ? 'small_xxx' : 'file_xxx' };
  }
  const h = hex3(t).toLowerCase();
  if (small) {
    if (sprites.has('small_' + h)) return { name: 'small_' + h };
    if (sprites.has('file_' + h)) return { name: 'file_' + h, half: true };
    return { name: 'small_xxx' };
  }
  if (sprites.has('file_' + h)) return { name: 'file_' + h };
  return { name: 'file_xxx' };
}
