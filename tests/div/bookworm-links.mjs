// node tests/div/bookworm-links.mjs - parse every page of the User Guide on the seed disc with Bookworm's
// HTMLLib emulation and resolve every link / image the way Bookworm does (file:// URLs, RISC OS name
// translation, case-insensitive names, FileCore 10-character truncation). Also checks #fragments.
// Prints the links that are broken in the original data too.
import fs from 'fs';
import path from 'path';
import { parseHTML } from '../../src/apps/Bookworm/html.js';
import { resolveURL, urlToPath, pathToURL } from '../../src/apps/Bookworm/url.js';

const ROOT = 'assets/disc/HardDisc4/Manuals/Manual';
const dec = (s) => s.replace(/=([0-9a-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
// host exists(): 'ROManual:BOOKB.TOC/HTM' -> canonical RISC OS-ish path or null
function exists(p) {
  const m = /^ROManual:(.*)$/i.exec(p);
  if (!m) return null;
  let dir = ROOT, canon = 'ROManual:';
  const parts = m[1].split('.');
  for (let i = 0; i < parts.length; i++) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
    const e = fs.readdirSync(dir).find((x) => dec(x).toLowerCase() === parts[i].toLowerCase());
    if (!e) return null;
    dir = path.join(dir, e); canon += (i ? '.' : '') + dec(e);
  }
  return canon;
}
const hostPath = (canon) => path.join(ROOT, ...canon.slice('ROManual:'.length).split('.').map((s) => s.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'))));

const docs = new Map();
const load = (canon) => {
  if (!docs.has(canon)) docs.set(canon, parseHTML(fs.readFileSync(hostPath(canon), 'latin1')));
  return docs.get(canon);
};
let pages = 0, links = 0, imgs = 0, tokens = 0;
const broken = [], badFrag = [];
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir)) {
    const f = path.join(dir, e), r = rel ? rel + '.' + dec(e) : dec(e);
    if (fs.statSync(f).isDirectory()) { walk(f, r); continue; }
    const txt = fs.readFileSync(f, 'latin1');
    if (!/<(html|body|a )/i.test(txt)) continue;
    pages++;
    const canon = 'ROManual:' + r;
    const url = pathToURL(canon);
    const doc = load(canon);
    tokens += doc.tokens.length;
    const seen = new Set();
    for (const t of doc.tokens) {
      for (const [ref, isImg] of [[t.href, false], [t.kind === 'img' ? t.img.src : null, true]]) {
        if (ref == null || seen.has(ref + isImg)) continue;
        seen.add(ref + isImg);
        isImg ? imgs++ : links++;
        const u = resolveURL(url, ref);
        if (!u) continue;                                   // http: etc.
        const p = urlToPath(u, exists);
        if (!p) { broken.push(`${r}: ${ref}`); continue; }
        const frag = u.split('#')[1];
        if (frag && !isImg && !load(p).names.has(frag.toLowerCase())) badFrag.push(`${r}: ${ref}`);
      }
    }
  }
}
walk(ROOT, '');
console.log(`${pages} pages, ${tokens} tokens, ${links} distinct links, ${imgs} distinct images`);
console.log(`${broken.length} unresolved (broken in the original too):`);
for (const b of broken) console.log('  ' + b);
console.log(`${badFrag.length} missing #fragments:`);
for (const b of badFrag.slice(0, 40)) console.log('  ' + b);
if (pages < 80 || broken.length > 40) process.exit(1);
