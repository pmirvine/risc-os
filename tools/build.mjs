#!/usr/bin/env node
// Regenerate every asset: node tools/build.mjs   (fonts need `cd tools && npm i` once for opentype.js)
import { execFileSync } from 'node:child_process';
const run = (...a) => { console.log('>', a.join(' ')); execFileSync(process.execPath, a, { stdio: 'inherit' }); };
const d = new URL('.', import.meta.url).pathname;
run(d + 'sprites.mjs', '--build');
run(d + 'templates.mjs', '--build');
run(d + 'messages.mjs', '--build');
run(d + 'sysfont.mjs');
run(d + 'fonts.mjs');
run(d + 'misc.mjs');
run(d + 'disc.mjs');
