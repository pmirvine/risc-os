#!/usr/bin/env node
// Adds the Nerd Fonts (programming fonts with thousands of icon glyphs, https://www.nerdfonts.com) to the
// desktop's built-in fonts, after tools/fonts.mjs has written assets/fonts/fonts.json and fonts.css:
//   JetBrainsMono.Medium / .Bold, Hack.Medium / .Bold, FiraCode.Medium / .Bold
// so they appear in every font menu (Edit and !JsEdit's Display > Font, Draw, ...) and in CSS as
// "JetBrainsMono Nerd", "Hack Nerd", "FiraCode Nerd". The browser downloads a font the first time it is used.
//
// The files in assets/fonts/nerd are the "Mono" variants (icons one cell wide) of Nerd Fonts v3.5.1, Regular
// and Bold, converted to WOFF2 with fontTools (`TTFont(ttf).flavor = 'woff2'`); tools/nerdfonts.json holds their
// fonts.json entries (metrics per 1000 units from the hhea table). Licences: the fonts are SIL OFL 1.1
// (JetBrains Mono, Fira Code) and MIT/Bitstream Vera (Hack); Nerd Fonts' patcher and glyphs are MIT (icon sets
// under their own free licences, listed in each <Font>-README.md). Idempotent.   Usage: node tools/nerdfonts.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FONTS = path.join(ROOT, 'assets/fonts');
const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/nerdfonts.json'), 'utf8'));

const jsonPath = path.join(FONTS, 'fonts.json');
const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
for (const [name, info] of Object.entries(extra)) j.fonts[name] = info;
fs.writeFileSync(jsonPath, JSON.stringify(j, null, 1));

const cssPath = path.join(FONTS, 'fonts.css');
const START = '/* Nerd Fonts (tools/nerdfonts.mjs) */', END = '/* end of Nerd Fonts */';
let css = fs.readFileSync(cssPath, 'utf8');
const i = css.indexOf(START);
if (i >= 0) css = css.slice(0, i) + css.slice(css.indexOf(END) + END.length).replace(/^\n/, '');
const faces = Object.values(extra).map((f) => `@font-face { font-family: "${f.family}"; src: url("${f.file}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`);
css = css.replace(/\n*$/, '\n') + [START, ...faces, END].join('\n') + '\n';
fs.writeFileSync(cssPath, css);
console.log(`fonts.json, fonts.css: ${Object.keys(extra).length} Nerd Fonts`);
