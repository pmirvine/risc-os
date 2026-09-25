// The example programs in tools/jstutor/examples/, as they go on the disc (used by tools/disc-jstutor.mjs and
// tools/jstutor/harness.mjs): no extension = JSScript (&F81); !Run, !Boot = Obey; !Help, ReadMe = Text;
// <Name>.sprites.json = a sprite file <Name> ({"spritename": [rows]}, tools/lib/spritewrite.mjs letters).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sprite, spriteFile } from '../lib/spritewrite.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * [{parts: RISC OS names below $.Examples.<book>, dir: true} | {parts, type: 'f81'|'feb'|'fff'|'ff9', data: Buffer}]
 * for the book in bookSrc (default tools/jstutor). An application whose directory holds a file Toolkit.list (module
 * names, one per line) gets a Toolkit directory with copies of those modules from <bookSrc>/toolkit/, so each
 * example stays complete in itself while the book keeps one copy of each module.
 */
export function exampleFiles(problems = [], bookSrc = HERE) {
  const DIR = path.join(bookSrc, 'examples');
  const out = [];
  const walk = (dir, parts) => {
    for (const name of fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort()) {
      const full = path.join(dir, name);
      const where = `examples/${[...parts, name].join('/')}`;
      if (fs.statSync(full).isDirectory()) { out.push({ parts: [...parts, name], dir: true }); walk(full, [...parts, name]); continue; }
      if (name === 'Toolkit.list') {
        const mods = fs.readFileSync(full, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        out.push({ parts: [...parts, 'Toolkit'], dir: true });
        for (const m of mods) {
          const src = path.join(bookSrc, 'toolkit', m);
          if (!fs.existsSync(src)) { problems.push(`${where}: no toolkit module '${m}'`); continue; }
          const text = fs.readFileSync(src, 'utf8');
          text.split('\n').forEach((l, i) => { if (l.length > 70) problems.push(`toolkit/${m}:${i + 1} is over 70 characters`); });
          out.push({ parts: [...parts, 'Toolkit', m], type: 'f81', data: Buffer.from(text, 'latin1') });
        }
        continue;
      }
      if (name.endsWith('.sprites.json')) {
        const def = JSON.parse(fs.readFileSync(full, 'utf8'));
        out.push({ parts: [...parts, name.slice(0, -13)], type: 'ff9', data: spriteFile(Object.entries(def).map(([n, rows]) => sprite(n, rows))) });
        continue;
      }
      const text = fs.readFileSync(full, 'utf8');
      if (/[^\n\x20-\x7e\xa0-\xff]/.test(text)) problems.push(`${where}: only Latin-1 text (and no tabs) please`);
      const type = /^!(Run|Boot)$/.test(name) ? 'feb' : /^(!Help|ReadMe)$/.test(name) ? 'fff' : 'f81';
      if (type === 'f81') text.split('\n').forEach((l, i) => { if (l.length > 70) problems.push(`${where}:${i + 1} is over 70 characters`); });
      out.push({ parts: [...parts, name], type, data: Buffer.from(text, 'latin1') });
    }
  };
  walk(DIR, []);
  return out;
}
