#!/usr/bin/env node
// Build the seed virtual hard disc (HardDisc4) from vendor/ro371/Install/HardDisc4.
//   node tools/disc.mjs
// Output: assets/disc/HardDisc4/... (files under a URL-safe name encoding) and assets/disc/manifest.json
//
// Host export conventions (vendor tree): "name,xxx" = filetype xxx; "name,llllllll-eeeeeeee" = load/exec;
// no suffix = Text (fff); a '.' in a host name is a '/' in the RISC OS name.
//
// Stored name encoding (per path component): every byte outside [A-Za-z0-9_-] becomes "=" + 2 lower-case
// hex digits of its Latin-1 code, e.g. "!Boot" → "=21Boot", "Drum+Cym" → "Drum=2bCym", "TCP/IP" → "TCP=2fIP".
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V } from './lib/sources.mjs';

const SRC = path.join(V, 'Install/HardDisc4');
const OUT = path.join(ROOT, 'assets/disc');
const DISC = 'HardDisc4';

export const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
export const decodeName = (n) => n.replace(/=([0-9a-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const SKIP_TYPES = new Set(['ff8', 'ffa', 'ffc', 'fc3', 'd94']); // absolute, module, utility, patch, ARMovie codec binaries
const MAX_FILE = 2 * 1024 * 1024;
const skipped = [];

function skipFile(rel, type, size) {
  if (SKIP_TYPES.has(type)) return 'binary type ' + type;
  if (size > MAX_FILE) return 'larger than 2MB';
  if (/^Video\//.test(rel) && type === 'ae7') return 'ARMovie video';
  if (/!ARMovie\/(Shapes|MovingLine|Decomp\d*)\//.test(rel)) return 'ARMovie codec data';
  if (/!Boot\/Resources\/!ARMovie\//.test(rel) && size > 50000) return 'ARMovie codec data';
  if (/\/(djpeg|cjpeg|hpcdtoppm)(,|$)/.test(rel)) return 'executable';
  return null;
}

function parseHostName(host) {
  const m = host.match(/^(.*),([0-9a-fA-F]{3})$/);
  if (m) return { name: m[1].replace(/\./g, '/'), type: m[2].toLowerCase() };
  const le = host.match(/^(.*),([0-9a-fA-F]{1,8})-([0-9a-fA-F]{1,8})$/);
  if (le) {
    const load = parseInt(le[2], 16) >>> 0, exec = parseInt(le[3], 16) >>> 0;
    const typed = (load >>> 20) === 0xfff;
    return { name: le[1].replace(/\./g, '/'), type: typed ? ((load >>> 8) & 0xfff).toString(16).padStart(3, '0') : 'untyped', load: load.toString(16).padStart(8, '0'), exec: exec.toString(16).padStart(8, '0') };
  }
  return { name: host.replace(/\./g, '/'), type: 'fff' };
}

let totalBytes = 0, nfiles = 0;
function walk(hostDir, rel, outDir) {
  const entries = fs.readdirSync(hostDir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  const children = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))) {
    const hp = path.join(hostDir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      const name = e.name.replace(/\./g, '/');
      const enc = encodeName(name);
      const sub = walk(hp, r, path.join(outDir, enc));
      children.push({ name, type: name.startsWith('!') ? 'app' : 'dir', children: sub });
    } else {
      const info = parseHostName(e.name);
      const size = fs.statSync(hp).size;
      const why = skipFile(r, info.type, size);
      if (why) { skipped.push({ path: r, size, why }); continue; }
      const enc = encodeName(info.name);
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(hp, path.join(outDir, enc));
      const relOut = path.relative(OUT, path.join(outDir, enc)).split(path.sep).join('/');
      const node = { name: info.name, type: info.type, size, path: relOut };
      if (info.load) { node.load = info.load; node.exec = info.exec; }
      children.push(node);
      totalBytes += size; nfiles++;
    }
  }
  return children;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const tree = walk(SRC, '', path.join(OUT, DISC));
// prune empty dirs that only existed for skipped files? keep them: RISC OS users expect the structure.
const manifest = {
  disc: DISC,
  note: 'Tree of the seed hard disc. type = 3-hex-digit filetype, "dir", "app" (directory whose name starts with !) or "untyped" (load/exec given). path is relative to assets/disc/. Names use RISC OS conventions (case-insensitive, "." is the path separator so never appears in names).',
  encoding: 'Stored path components: each char outside [A-Za-z0-9_-] → "=" + 2 lower-case hex digits (Latin-1).',
  totalBytes, files: nfiles,
  root: { name: '$', type: 'dir', children: tree },
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
fs.writeFileSync(path.join(OUT, 'skipped.json'), JSON.stringify(skipped, null, 1));
console.log(`disc: ${nfiles} files, ${(totalBytes / 1048576).toFixed(1)} MB; skipped ${skipped.length} (${(skipped.reduce((a, s) => a + s.size, 0) / 1048576).toFixed(1)} MB)`);
