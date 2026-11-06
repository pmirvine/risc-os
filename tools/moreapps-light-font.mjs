#!/usr/bin/env node
// Builds the Letters Light faces that !Letters draws Calibri Light with
// (the Office theme heading font): tools/moreapps/!Letters/Fonts/
// LettersLight-Regular and LettersLight-Italic, the table of their widths
// in tests/moreapps/lightfont-widths.json (so the tests need no Word), and
// the Lato entry at the end of Fonts/Licences. The output is committed;
// only a maintainer rebuilds it, on a Mac with Microsoft Word installed.
// Inputs: Lato Light and Light Italic (TrueType, SIL OFL 1.1) from the
// google/fonts repository at a pinned commit, cached in the git-ignored
// tools/moreapps/.cache and checked against the SHA-256 below; Word's
// calibril.ttf and calibrili.ttf, of which only the advance widths are
// read; Carlito-Regular (bundled), for the vertical metrics. The glyph
// work is tools/moreapps-light-font.py (fontTools, installed at a pinned
// version into a throwaway venv in .cache). The result is a Modified
// Version under the OFL, so it is not called Lato (a Reserved Font Name).
// Most glyphs are scaled horizontally; a few punctuation glyphs are
// centred or shrunk evenly instead (see the .py); kerning, ligatures and
// hinting are removed.
// Run it after tools/moreapps-fonts.mjs, which rewrites Licences without
// the Lato entry. The output is the same bytes every run.
//   Usage: node tools/moreapps-light-font.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'tools/moreapps/.cache');
const OUT = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const WIDTHS = path.join(ROOT, 'tests/moreapps/lightfont-widths.json');
const PY = path.join(ROOT, 'tools/moreapps-light-font.py');
const WORD = '/Applications/Microsoft Word.app/Contents/Resources/DFonts';
const FONTTOOLS = 'fonttools==4.60.1';
const COMMIT = '15e8fc68b03a0214ace8b52ca0153e1b597345ec';
const RAW = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/lato/`;
// The repository is too large to fetch whole, so the three files are
// fetched one by one from the pinned commit.
const FILES = [
  {name: 'Lato-Light.ttf', sha: 'cf2a774503baf418d584f49967bd160e1e03f087c13b25602f28024ec7788f08'},
  {name: 'Lato-LightItalic.ttf', sha: '700e6722fd14a10e7646347a6b14c486d4c364a373ba61c70e0b5ccee7811635'},
  {name: 'OFL.txt', sha: '74ba064d03f1f1c4a952da936c3eb71866c34404916734de3cae73b34357e59e'},
];
const RULE = '='.repeat(70);
const HEAD = 'Letters Light (Lato Light, widths of Calibri Light)';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lf = (s) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
const fail = (m) => { console.error('moreapps-light-font: ' + m); process.exit(1); };

async function fetchFile(f) {
  const p = path.join(CACHE, `lato-${COMMIT.slice(0, 7)}-${f.name}`);
  if (fs.existsSync(p) && sha256(fs.readFileSync(p)) === f.sha) return p;
  const url = RAW + f.name;
  console.log('downloading ' + url);
  const r = await fetch(url, {redirect: 'follow'});
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (sha256(b) !== f.sha) throw new Error(`${f.name}: SHA-256 ${sha256(b)} is not the expected ${f.sha}`);
  fs.mkdirSync(CACHE, {recursive: true});
  fs.writeFileSync(p, b);
  return p;
}

function python() {
  const venv = path.join(CACHE, 'lightfont-venv');
  const py = path.join(venv, 'bin/python');
  const stamp = path.join(venv, 'installed');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === FONTTOOLS) return py;
  try { execFileSync('python3', ['--version'], {stdio: 'ignore'}); } catch {
    fail('needs Python 3 (python3 on the PATH) to run fontTools');
  }
  console.log(`making a venv in ${path.relative(ROOT, venv)} with ${FONTTOOLS}`);
  fs.rmSync(venv, {recursive: true, force: true});
  execFileSync('python3', ['-I', '-m', 'venv', venv], {stdio: 'inherit'});
  execFileSync(py, ['-I', '-m', 'pip', 'install', '-q', '--disable-pip-version-check', FONTTOOLS],
    {stdio: 'inherit'});
  fs.writeFileSync(stamp, FONTTOOLS);
  return py;
}

const calibri = ['calibril.ttf', 'calibrili.ttf'].map((f) => path.join(WORD, f));
for (const f of calibri) if (!fs.existsSync(f)) fail(`needs Microsoft Word's ${f} (Calibri Light widths)`);
const carlito = path.join(OUT, 'Carlito-Regular');
if (!fs.existsSync(carlito)) fail('needs Fonts/Carlito-Regular: run tools/moreapps-fonts.mjs first');

const got = [];
for (const f of FILES) got.push(await fetchFile(f));
const lic = lf(fs.readFileSync(got[2], 'utf8'));
if (!/SIL OPEN FONT LICENSE Version 1\.1/.test(lic)) fail('Lato: licence is not the SIL OFL 1.1');
if (!/Reserved Font Name "Lato"/.test(lic)) fail('Lato: OFL.txt no longer names the Reserved Font Name "Lato"');

const py = python();
const tmp = path.join(CACHE, 'lightfont-out');
fs.rmSync(tmp, {recursive: true, force: true});
fs.mkdirSync(tmp, {recursive: true});
try {
  execFileSync(py, ['-I', PY, got[0], got[1], ...calibri, carlito, tmp, path.join(tmp, 'widths.json')],
    {stdio: 'inherit'});
} catch (e) {
  fail('the fontTools step (tools/moreapps-light-font.py) failed; nothing was written');
}
let total = 0;
for (const st of ['Regular', 'Italic']) {
  const b = fs.readFileSync(path.join(tmp, `LettersLight-${st}`));
  if (b.subarray(0, 4).toString('latin1') !== '\0\x01\0\0') fail(`LettersLight-${st}: not a TrueType font`);
  fs.writeFileSync(path.join(OUT, `LettersLight-${st}`), b);
  total += b.length;
}
fs.copyFileSync(path.join(tmp, 'widths.json'), WIDTHS);
fs.rmSync(tmp, {recursive: true, force: true});

// Licences: replace (or add) the Lato entry, which is always the last.
const licences = path.join(OUT, 'Licences');
let text = fs.readFileSync(licences, 'latin1');
const at = text.indexOf(`${RULE}\n${HEAD}\n`);
if (at >= 0) text = text.slice(0, at).replace(/\n*$/, '\n');
text += `\n${RULE}\n${HEAD}\n` +
  'Files:   LettersLight-Regular, LettersLight-Italic\n' +
  `Source:  ${RAW}Lato-Light.ttf\n` +
  `         ${RAW}Lato-LightItalic.ttf\n` +
  `Version: google/fonts commit ${COMMIT} (Lato 2.015)\n` +
  FILES.map((f) => `SHA-256: ${f.sha}  ${f.name}\n`).join('') +
  'Licence: SIL Open Font License, Version 1.1 (file OFL.txt in ofl/lato,\n' +
  '         below)\n' +
  'Modified Version: renamed Letters Light; glyph widths adjusted. The\n' +
  'glyphs of Latin-1, Latin Extended-A and the rest of Windows-1252 are\n' +
  'given the advance widths of Calibri Light (no Calibri outlines are\n' +
  'used): most are scaled horizontally, a few punctuation shapes are\n' +
  're-centred in the new width or shrunk evenly, and other accented\n' +
  'letters are scaled with their base letter. Kerning, ligatures and\n' +
  'hinting are removed, and the line\n' +
  'spacing is that of Carlito. Built by tools/moreapps-light-font.mjs.\n' +
  '"Lato" is a Reserved Font Name, so the modified fonts do not use it.\n' +
  `${RULE}\n\n${lic.trim()}\n`;
fs.writeFileSync(licences, text, 'latin1');
console.log(`2 fonts, ${total} bytes in tools/moreapps/!Letters/Fonts; widths in ${path.relative(ROOT, WIDTHS)}`);
