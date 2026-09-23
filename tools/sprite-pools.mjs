// Which sprite files go into which pool under assets/sprites/. Used by `node tools/sprites.mjs --build`.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V, findResources } from './lib/sources.mjs';

const OUT = path.join(ROOT, 'assets/sprites');

export function sources() {
  // Priority order: explicit Wimp pool, shipped disc, ROM messages/resources, other sources. First file for a pool/base wins.
  const W = 'Sources/OS_Core/Desktop/Wimp/Resources/UK/';
  const list = [
    ...['Tools', 'Tools3d', 'Sprites', 'Sprites22', 'Sprites23'].map((b) => ({ rel: W + b + ',ff9', pool: 'Wimp' })),
  ];
  // Wimp's own pool is handled explicitly above; the Messages copy of Tools is identical to Tools3d.
  list.push(...findResources(/,ff9$/i, ['Install/HardDisc4', 'Sources/OS_Core/Internat/Messages/UK', 'Sources', 'Apps'])
    .filter((r) => !/\/(Tutorials|Images)\//.test(r.rel) && !/Messages\/UK\/Resources\/(Wimp|Picker)\//.test(r.rel)));
  return list;
}

export function buildPools(convert) {
  const seen = new Set();
  const index = {};
  fs.mkdirSync(OUT, { recursive: true });
  for (const e of fs.readdirSync(OUT)) if (e !== 'index.html') fs.rmSync(path.join(OUT, e), { recursive: true, force: true });
  let nfiles = 0, nsprites = 0;
  for (const { rel, pool } of sources()) {
    const base = path.basename(rel).replace(/,ff9$/i, '');
    const key = (pool + '/' + base).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const dir = path.join(OUT, pool);
    let m;
    try { m = convert(path.join(V, rel), dir, base); }
    catch (e) { console.warn('FAILED', rel, e.message); continue; }
    (index[pool] ||= {})[base] = { source: rel, count: Object.keys(m).length };
    nfiles++; nsprites += Object.keys(m).length;
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`converted ${nfiles} sprite files, ${nsprites} sprites, ${Object.keys(index).length} pools`);
}
