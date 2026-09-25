// Adds $.Apps.!JsEdit to the seed hard disc: the application directory of the programmer's editor (the program
// itself is src/apps/JsEdit, registered in src/apps/index.js): !Boot, !Run, !Help, !Sprites, a placeholder
// !RunImage, and Modes (the colouring / indentation / completion files, from src/apps/JsEdit/Modes, which
// users can change). Idempotent: replaces only Apps.!JsEdit.   Usage: node tools/disc-jsedit.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sprite, spriteFile } from './lib/spritewrite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/apps/JsEdit');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const latin1 = (s) => Buffer.from(s, 'latin1');

// the application's sprites: a page of code with coloured lines and a pen
const sprites = JSON.parse(fs.readFileSync(path.join(SRC, 'sprites.json'), 'utf8'));

const files = [
  ['!Boot', 'feb', latin1('| !Boot file for !JsEdit\nIconSprites <Obey$Dir>.!Sprites\n')],
  ['!Run', 'feb', latin1('| !Run file for !JsEdit\nSet JsEdit$Dir <Obey$Dir>\nIconSprites <JsEdit$Dir>.!Sprites\nWimpSlot -min 256K -max 256K\nRun <JsEdit$Dir>.!RunImage %*0\n')],
  ['!Help', 'fff', latin1(fs.readFileSync(path.join(SRC, 'Help.txt'), 'utf8'))],
  ['!Sprites', 'ff9', spriteFile(Object.entries(sprites).map(([n, rows]) => sprite(n, rows)))],
  ['!RunImage', 'ffd', latin1('')],                    // the program is JavaScript in src/apps/JsEdit
];
const modes = fs.readdirSync(path.join(SRC, 'Modes')).filter((f) => !f.startsWith('.')).sort();

const OUT = path.join(DISC, 'HardDisc4', 'Apps', encodeName('!JsEdit'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'Modes'), { recursive: true });
const node = { name: '!JsEdit', type: 'app', children: [] };
const put = (dir, parent, name, type, data) => {
  const host = path.join(dir, encodeName(name));
  fs.writeFileSync(host, data);
  parent.children.push({ name, type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
};
for (const [n, t, d] of files) put(OUT, node, n, t, d);
const modesNode = { name: 'Modes', type: 'dir', children: [] };
node.children.push(modesNode);
for (const m of modes) put(path.join(OUT, 'Modes'), modesNode, m, 'fff', latin1(fs.readFileSync(path.join(SRC, 'Modes', m), 'utf8')));
node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const apps = mf.root.children.find((c) => c.name === 'Apps');
apps.children = apps.children.filter((c) => c.name !== '!JsEdit');
apps.children.push(node);
apps.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let count = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { count++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = count; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`$.Apps.!JsEdit written (${files.length} files, ${modes.length} modes); manifest now ${count} files`);
