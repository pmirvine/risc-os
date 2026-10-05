#!/usr/bin/env node
// Fetches the metric-compatible fonts bundled with !Word (Carlito for
// Calibri, Caladea for Cambria, Liberation Sans/Serif/Mono for Arial/
// Times New Roman/Courier New) and writes them, plus Licences, to
// tools/moreapps/!Word/Fonts/ (committed; the disc build copies them as
// untyped data). The archives are cached in the git-ignored
// tools/moreapps/.cache and checked against the SHA-256 below, so the
// output is the same bytes every run. Each family's licence file must
// say SIL Open Font License 1.1, or the script stops.
// Licences keeps two tab characters from the upstream texts (exempt
// from the no-tab rule). Fonts are kept as the unmodified TTF files (a WOFF2 conversion would
// need fontTools and brotli, and would be a Modified Version under the
// OFL); the disc build can convert when they are installed.
//   Usage: node tools/moreapps-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'tools/moreapps/.cache');
const OUT = path.join(ROOT, 'tools/moreapps/!Word/Fonts');
const GH = 'https://github.com/';
const CL = 'https://codeload.github.com/';

// dir: the folder in the archive that holds the TTFs; lic: licence file
const SOURCES = [
  {name: 'Carlito', stands: 'Calibri', ver: 'googlefonts/carlito commit 3a810cab78ebd6e2e4eed42af9e8453c4f9b850a',
    file: 'carlito-3a810ca.tar.gz',
    url: CL + 'googlefonts/carlito/tar.gz/3a810cab78ebd6e2e4eed42af9e8453c4f9b850a',
    sha: 'ff1fdae06e67136660c7d8135323631c7465c6b4d299d4281bb44eed2165091f',
    dir: 'carlito-3a810cab78ebd6e2e4eed42af9e8453c4f9b850a/fonts/ttf',
    lic: 'carlito-3a810cab78ebd6e2e4eed42af9e8453c4f9b850a/OFL.txt',
    fonts: ['Carlito']},
  {name: 'Caladea', stands: 'Cambria', ver: 'huertatipografica/Caladea commit 336a529cfad3d103d6527752686f8331d13e820a',
    file: 'caladea-336a529.tar.gz',
    url: CL + 'huertatipografica/Caladea/tar.gz/336a529cfad3d103d6527752686f8331d13e820a',
    sha: '959ccb46ba0f24291545ad591b57a33533513578e2132e82354ab54cb7fd6e13',
    dir: 'Caladea-336a529cfad3d103d6527752686f8331d13e820a/fonts/ttf',
    lic: 'Caladea-336a529cfad3d103d6527752686f8331d13e820a/OFL.txt',
    fonts: ['Caladea']},
  {name: 'Liberation Fonts', stands: 'Arial, Times New Roman, Courier New', ver: 'liberation-fonts 2.1.5',
    file: 'liberation-fonts-ttf-2.1.5.tar.gz',
    url: GH + 'liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz',
    sha: '7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0',
    dir: 'liberation-fonts-ttf-2.1.5',
    lic: 'liberation-fonts-ttf-2.1.5/LICENSE',
    fonts: ['LiberationSans', 'LiberationSerif', 'LiberationMono']},
];
const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lf = (s) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');

async function fetchArchive(s) {
  const p = path.join(CACHE, s.file);
  if (fs.existsSync(p) && sha256(fs.readFileSync(p)) === s.sha) return p;
  console.log('downloading ' + s.url);
  const r = await fetch(s.url, {redirect: 'follow'});
  if (!r.ok) throw new Error(`${s.url}: HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (sha256(b) !== s.sha) throw new Error(`${s.file}: SHA-256 ${sha256(b)} is not the expected ${s.sha}`);
  fs.mkdirSync(CACHE, {recursive: true});
  fs.writeFileSync(p, b);
  return p;
}

fs.mkdirSync(OUT, {recursive: true});
const notices = [];
let total = 0, count = 0;
for (const s of SOURCES) {
  const archive = await fetchArchive(s);
  const x = path.join(CACHE, 'x', s.file.replace(/\.tar\.gz$/, ''));
  fs.rmSync(x, {recursive: true, force: true});
  fs.mkdirSync(x, {recursive: true});
  execFileSync('tar', ['-xzf', archive, '-C', x]);
  const lic = lf(fs.readFileSync(path.join(x, s.lic), 'utf8'));
  if (!/SIL OPEN FONT LICENSE Version 1\.1/.test(lic)) throw new Error(`${s.name}: licence is not the SIL OFL 1.1`);
  for (const f of s.fonts) for (const st of STYLES) {
    const ttf = fs.readFileSync(path.join(x, s.dir, `${f}-${st}.ttf`));
    const magic = ttf.subarray(0, 4).toString('latin1');
    if (magic !== '\0\x01\0\0' && magic !== 'true') throw new Error(`${f}-${st}: not a TrueType font`);
    fs.writeFileSync(path.join(OUT, `${f}-${st}`), ttf);
    total += ttf.length; count++;
  }
  notices.push(`${'='.repeat(70)}\n${s.name} (metric-compatible with ${s.stands})\n` +
    `Source:  ${s.url}\nVersion: ${s.ver}\nArchive: ${s.file}\nSHA-256: ${s.sha}\n` +
    `Licence: SIL Open Font License, Version 1.1 (file ${s.lic.split('/').pop()} in the archive)\n${'='.repeat(70)}\n\n${lic.trim()}\n`);
}
fs.writeFileSync(path.join(OUT, 'Licences'),
  'Fonts bundled with !Word. The font files here are unmodified TrueType\n' +
  'files, named without the .ttf extension. All three families are free\n' +
  'software under the SIL Open Font License 1.1 (full texts below). They\n' +
  'have the same character widths as Calibri, Cambria, Arial, Times New\n' +
  'Roman and Courier New so documents break lines as they do in Word.\n' +
  'Fetched by tools/moreapps-fonts.mjs.\n\n' + notices.join('\n'));
fs.rmSync(path.join(CACHE, 'x'), {recursive: true, force: true});
console.log(`${count} fonts, ${total} bytes (${(total / 1048576).toFixed(2)} MB) in tools/moreapps/!Word/Fonts (TTF)`);
