#!/usr/bin/env node
// Messages (MessageTrans token:value) files → assets/messages/<Pool>.json, and !Help texts → assets/help/<App>.txt
//   node tools/messages.mjs --build
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V, findResources } from './lib/sources.mjs';

/** Parse a MessageTrans file. "a/b:value" defines both a and b. '#' starts a comment line. */
export function parseMessages(text) {
  const out = {};
  let pending = [];
  for (const raw of text.split(/\r?\n|\r/)) {
    if (raw.startsWith('#') || raw === '') continue;
    const i = raw.indexOf(':');
    if (i < 0) continue;
    const toks = raw.slice(0, i).split('/').filter(Boolean);
    const val = raw.slice(i + 1);
    // A line "tok:" with empty value followed by further token lines is legal only as alias chain; keep literal empty.
    for (const t of [...pending, ...toks]) out[t] = val;
    pending = [];
  }
  return out;
}

const readLatin1 = (f) => fs.readFileSync(f).toString('latin1');

function build() {
  const OUT = path.join(ROOT, 'assets/messages');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const seen = new Set(), index = {};
  const files = [
    { rel: 'Sources/OS_Core/Desktop/Wimp/Resources/UK/Messages', pool: 'Wimp' },
    ...findResources(/^Messages$/),
  ];
  for (const { rel, pool } of files) {
    if (seen.has(pool.toLowerCase())) continue;
    seen.add(pool.toLowerCase());
    const m = parseMessages(readLatin1(path.join(V, rel)));
    if (!Object.keys(m).length) continue;
    fs.writeFileSync(path.join(OUT, pool + '.json'), JSON.stringify(m, null, 1));
    index[pool] = { source: rel, count: Object.keys(m).length };
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`messages: ${Object.keys(index).length} files`);

  // !Help text files (plain text, no filetype suffix or ,fff)
  const HOUT = path.join(ROOT, 'assets/help');
  fs.rmSync(HOUT, { recursive: true, force: true });
  fs.mkdirSync(HOUT, { recursive: true });
  const hidx = {};
  const hseen = new Set();
  for (const { rel, pool } of findResources(/^!Help(,fff)?$/i, ['Sources/OS_Core/Internat/Messages/UK', 'Install/HardDisc4', 'Sources', 'Apps'])) {
    // pool for Messages/UK/Apps/!Draw/!Help is "Draw"; for others poolFor uses nearest !App
    const name = pool;
    if (hseen.has(name.toLowerCase())) continue;
    const buf = fs.readFileSync(path.join(V, rel));
    if (buf.includes(0)) continue; // binary (e.g. a Drawfile) - skip
    hseen.add(name.toLowerCase());
    fs.writeFileSync(path.join(HOUT, name + '.txt'), buf.toString('latin1').replace(/\r\n?/g, '\n'), 'utf8');
    hidx[name] = rel;
  }
  fs.writeFileSync(path.join(HOUT, 'index.json'), JSON.stringify(hidx, null, 1));
  console.log(`help: ${Object.keys(hidx).length} files`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--build') build();
  else if (process.argv[2]) console.log(parseMessages(readLatin1(process.argv[2])));
  else console.log('usage: messages.mjs <file> | --build');
}
