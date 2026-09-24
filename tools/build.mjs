#!/usr/bin/env node
// Regenerate every asset: node tools/build.mjs   (fonts need `cd tools && npm i` once for opentype.js)
import { execFileSync } from 'node:child_process';
const run = (...a) => { console.log('>', a.join(' ')); execFileSync(process.execPath, a, { stdio: 'inherit' }); };
const d = new URL('.', import.meta.url).pathname;
run(d + 'sprites.mjs', '--build');
run(d + 'templates.mjs', '--build');
run(d + 'toolbox.mjs', '--build');   // Toolbox Res files (templates.mjs empties assets/templates)
run(d + 'messages.mjs', '--build');
run(d + 'sysfont.mjs');
run(d + 'fonts.mjs');
run(d + 'misc.mjs');
run(d + 'disc.mjs');
run(d + 'basicwimp-demo.mjs');   // adds $.Examples (disc.mjs rebuilds assets/disc without it)
run(d + 'disc-classics.mjs');     // $.Apps.!Calc, $.Diversions.!Madness, !Hopper (from tools/classics)
run(d + 'disc-patch.mjs');        // !Patch's ,fc3 patch files (disc.mjs skips them)
run(d + 'disc-basicdemos.mjs');   // $.Demos.BASIC (BBC BASIC demo programs from src/basic/demos)
run(d + 'disc-lander.mjs');       // $.Diversions.!Lander (the JS app; the original binary is never on the disc)
