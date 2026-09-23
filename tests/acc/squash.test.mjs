// node tests/acc/squash.test.mjs - Squash LZW / file format round trips (incl. real ,fca files
// from the RISC OS source tree and cross-checks against the host's compress(1) if present).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { compress, decompress, squashFile, unsquashFile, readHeader } from '../../src/apps/Squash/lzw.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// 1. round trips of assorted data
function rnd(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; }; }
const r = rnd(42);
const cases = {
  empty: new Uint8Array(0), one: new Uint8Array([65]), abab: new TextEncoder().encode('ab'.repeat(5000)),
  zeros: new Uint8Array(200000), random: Uint8Array.from({ length: 70000 }, () => (r() >> 16) & 255),
  text: new TextEncoder().encode(fs.readFileSync(path.join(root, 'docs/CORE_API.md'), 'utf8').repeat(6)),
  lowent: Uint8Array.from({ length: 150000 }, () => (r() % 7) + 97),
};
for (const [name, data] of Object.entries(cases)) {
  const z = compress(data);
  const back = decompress(z, data.length);
  ok(eq(back, data), `round trip ${name} (${data.length} -> ${z.length})`);
  ok(eq(decompress(z), data), `round trip ${name} (unbounded)`);
}

// 2. squash file header
const text = cases.text;
const sq = squashFile(text, 0xFFFFFF00 | 0, 0x12345678);
ok(sq && String.fromCharCode(...sq.slice(0, 4)) === 'SQSH', 'SQSH id');
const h = readHeader(sq);
ok(h.length === text.length && h.filetype === 0xFFF && h.exec === 0x12345678, 'header fields');
ok(eq(unsquashFile(sq).data, text), 'unsquash file');
ok(squashFile(cases.random, 0xFFFFFD00, 0) === null, 'incompressible data left alone');

// 3. real Squash files from the RISC OS sources
for (const rel of ['Sources/Diversions/Meteors/R/Meteors,fca', 'Sources/Apps/Paint/Test/paint_bug3,fca', 'Sources/OS_Core/Video/Render/Colours/Tables/8greys,fca']) {
  const p = path.join(root, 'vendor/ro371', rel);
  if (!fs.existsSync(p)) continue;
  const b = new Uint8Array(fs.readFileSync(p));
  const u = unsquashFile(b);
  ok(u.data.length === u.length, `real file ${rel}: ${b.length} -> ${u.length} bytes, type ${u.filetype.toString(16)}`);
  // re-squashing should give data that decompresses to the same thing
  const again = squashFile(u.data, u.load, u.exec);
  ok(again && eq(unsquashFile(again).data, u.data), `re-squash ${rel}`);
  ok(!again || again.length <= b.length + 64, `re-squash size close to original (${again?.length} vs ${b.length})`);
}

// 3b. cross-check with the Printers app's independent decompressor on the seed disc's squashed printer definitions
{
  const { unsquash } = await import('../../src/apps/Printers/unsquash.js');
  const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/disc/manifest.json'), 'utf8'));
  let n = 0;
  const walk = (node) => { for (const c of node.children ?? []) { if (c.children) walk(c); else if (c.path && n < 40) {
    const b = new Uint8Array(fs.readFileSync(path.join(root, 'assets/disc', c.path)));
    if (b.length > 20 && String.fromCharCode(...b.slice(0, 4)) === 'SQSH') { n++; ok(eq(unsquashFile(b).data, unsquash(b)), `agrees with Printers/unsquash: ${c.path}`); }
  } } };
  walk(man.root);
  ok(n > 0, `found squashed seed files (${n})`);
}

// 4. host compress(1) interop
try {
  const tmp = fs.mkdtempSync('/tmp/sqt-');
  const f = path.join(tmp, 'x');
  fs.writeFileSync(f, cases.text);
  execFileSync('compress', ['-b', '12', '-f', f]);
  const theirs = new Uint8Array(fs.readFileSync(f + '.Z'));
  ok(eq(decompress(theirs, cases.text.length), cases.text), 'decompress host compress -b12 output');
  fs.writeFileSync(f + '2.Z', compress(cases.text));
  const back = execFileSync('uncompress', ['-c', f + '2.Z']);
  ok(eq(new Uint8Array(back), cases.text), 'host uncompress of our output');
  const small = new TextEncoder().encode('TOBEORNOTTOBEORTOBEORNOT'.repeat(20));
  fs.writeFileSync(f, small); execFileSync('compress', ['-b', '12', '-f', f]);
  ok(eq(new Uint8Array(fs.readFileSync(f + '.Z')), compress(small)), 'byte-identical to compress -b12 for small input');
  fs.rmSync(tmp, { recursive: true });
} catch (e) { console.log('(host compress check skipped:', e.message, ')'); }

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
