// HostFS name mapping between host filenames and RISC OS names / filetypes, following RPCEmu's hostfs.c:
//
//   host "Letter,fff"            -> RISC OS "Letter", type &FFF
//   host "Prog,ffff1900-12345678" -> RISC OS "Prog", untyped (load &FFFF1900, exec &12345678)
//   host "photo.png"             -> RISC OS "photo/png", type &B60 (extension table, ./mimemap.js)
//   host "notes"                 -> RISC OS "notes", Text (&FFF)
//
// Characters swap as in RPCEmu: '.' <-> '/', space <-> hard space (&A0), '#' <-> '?', '$' <-> '<', '^' <-> '>'.
// Characters RISC OS can't have in a name (& @ % \ : * " | controls, anything outside Latin-1) are shown
// as '_'; the node keeps its real host name, so that's only lossy for display.
//
// Writing ("smart" suffixes): a file gets ",xxx" only when its type can't be read back from the name
// (e.g. "Sprites,ff9", but "photo.png" for a PNG); untyped files always get ",load-exec"; directories never
// get a suffix.

import { typeFromExtension } from './mimemap.js';

const TO_RO = { '.': '/', '/': '.', ' ': '\xa0', '#': '?', '$': '<', '^': '>' };
const TO_HOST = { '/': '.', '\xa0': ' ', '?': '#', '<': '$', '>': '^' };
const ILLEGAL = /[\s:*&@%\\"|\x00-\x1f\x7f]/;

const HIDDEN = new Set(['.', '..', '.ds_store', 'thumbs.db', 'desktop.ini', '.localized']);

/**
 * True for host clutter HostFS doesn't show: Finder / Explorer metadata, Chrome's .crswap temporaries and
 * HostFS's own (serve.mjs writes ".<name>.hostfs-xxxxxxxx" then renames it; case-only renames go via "<name>.hostfs-tmp").
 */
export function isHidden(hostName) {
  const l = hostName.toLowerCase();
  return HIDDEN.has(l) || l.startsWith('._') || l.endsWith('.crswap') || /\.hostfs-(tmp|[0-9a-f]{8})$/.test(l);
}

const SUFFIX_LE = /^(.+),([0-9a-f]{1,8})-([0-9a-f]{1,8})$/i;
const SUFFIX_T = /^(.+),([0-9a-f]{3})$/i;

/** RISC OS leaf for a host base name (suffix already removed). */
export function leafToRiscos(base) {
  let out = '';
  for (const ch of base.normalize('NFC')) {
    const m = TO_RO[ch];
    if (m) out += m;
    else if (ch.codePointAt(0) > 0xff || ILLEGAL.test(ch)) out += '_';
    else out += ch;
  }
  return out;
}

/** Host base name for a RISC OS leaf (no suffix). */
export function leafToHost(leaf) {
  let out = '';
  for (const ch of leaf) out += TO_HOST[ch] ?? ch;
  return out;
}

/**
 * Map a host directory entry to RISC OS. Returns null for hidden entries, otherwise
 * {name, type} for typed files (type from suffix, extension or Text), {name, load, exec} for untyped
 * files, {name} for directories.
 */
export function hostToRiscos(hostName, isDir) {
  if (isHidden(hostName)) return null;
  let m;
  if ((m = SUFFIX_LE.exec(hostName))) {
    if (isDir) return { name: leafToRiscos(m[1]) };
    return { name: leafToRiscos(m[1]), load: parseInt(m[2], 16) >>> 0, exec: parseInt(m[3], 16) >>> 0 };
  }
  if ((m = SUFFIX_T.exec(hostName))) return isDir ? { name: leafToRiscos(m[1]) } : { name: leafToRiscos(m[1]), type: parseInt(m[2], 16) };
  if (isDir) return { name: leafToRiscos(hostName) };
  return { name: leafToRiscos(hostName), type: typeFromExtension(hostName) ?? 0xfff };
}

const hex = (n, w) => (n >>> 0).toString(16).padStart(w, '0');

/**
 * Host name for a RISC OS object. o: {name, isDir, filetype (-1 untyped), load, exec}.
 * forceSuffix: give a file its ",xxx" even when the extension would do (to avoid a clash on the host).
 */
export function riscosToHost(o, { forceSuffix = false } = {}) {
  const base = leafToHost(o.name);
  if (o.isDir) return base;
  if (o.filetype < 0 || o.filetype > 0xfff) return `${base},${hex(o.load, 8)}-${hex(o.exec, 8)}`;
  const inferred = typeFromExtension(base) ?? 0xfff;
  const looksSuffixed = SUFFIX_T.test(base) || SUFFIX_LE.test(base);
  return o.filetype !== inferred || looksSuffixed || forceSuffix ? `${base},${hex(o.filetype, 3)}` : base;
}

/** A valid, unique-ish RISC OS disc name for a mounted folder called hostName. */
export function discName(hostName) {
  const n = leafToRiscos(hostName).replace(/[\xa0/<>?.$]/g, '_').replace(/^_+|_+$/g, '');
  return n || 'Host';
}
