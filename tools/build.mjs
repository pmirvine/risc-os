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
run(d + 'nerdfonts.mjs');        // the Nerd Fonts (JetBrains Mono, Hack, Fira Code) added to fonts.json / fonts.css
run(d + 'misc.mjs');
run(d + 'disc.mjs');
run(d + 'basicwimp-demo.mjs');   // adds $.Examples (disc.mjs rebuilds assets/disc without it)
run(d + 'disc-classics.mjs');     // $.Apps.!Calc, $.Diversions.!Madness, !Hopper (from tools/classics)
run(d + 'disc-patch.mjs');        // !Patch's ,fc3 patch files (disc.mjs skips them)
run(d + 'disc-basicdemos.mjs');   // $.Demos.BASIC (BBC BASIC demo programs from src/basic/demos)
run(d + 'disc-lander.mjs');       // $.Diversions.!Lander (the JS app; the original binary is never on the disc)
run(d + 'disc-type1.mjs');        // $.Utilities.Type1Fonts (a sample SIL OFL Type 1 font for !T1ToFont, from tools/type1)
run(d + 'disc-docs.mjs');        // $.Docs (help files for this desktop's own features, e.g. HostFS, from tools/docs)
run(d + 'disc-jstutor.mjs');     // $.Manuals.JSTutor (the JavaScript tutorial) and $.Examples.JS, from tools/jstutor
run(d + 'disc-jstutor.mjs', '--book', 'jsapps');   // $.Manuals.JSApps (the second tutorial: desktop applications) and $.Examples.JSApps
run(d + 'disc-jsedit.mjs');      // $.Apps.!JsEdit (the programmer's editor's application directory and modes)
run(d + 'disc-browse.mjs');      // $.Apps.!Browse (the web browser's application directory)
run(d + 'disc-hostfs.mjs');      // $.Utilities.!HostFS (mounting folders from this computer)
