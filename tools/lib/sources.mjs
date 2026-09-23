// Shared helpers for locating resources in vendor/ro371 and naming output "pools" (one per app/module).
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const V = path.join(ROOT, 'vendor/ro371');

// Test/debug/foreign-language/duplicate trees we never want.
export const EXCLUDE = /\/(Test|test|tests|debug|Debug|Germany|AUNold|Import|BuildSys|HostFS|Doc|Docs|Menus|CRel4)\/|Wimp\/Test|Internat\/Messages\/Resources\/|\/Paint\/HardTest|_OPatches|PrivateDoc|Territory\/Manager|InetSetup\/Source\/|_PickerPrv|\/!Paint\/Templates/;

export function walk(dir, re, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, re, acc);
    else if (re.test(e.name)) acc.push(p);
  }
  return acc;
}

export const cleanPool = (s) => s.replace(/^!/, '').replace(/\+/g, 'Plus').replace(/[^A-Za-z0-9_-]/g, '_');

/** Derive a pool (app/module) name from a path relative to vendor/ro371. */
export function poolFor(rel) {
  const parts = rel.split('/').slice(0, -1);
  const mi = rel.match(/Internat\/Messages\/UK\/Resources2?\/(.*)$/);
  if (mi) {
    const sub = mi[1].split('/').slice(0, -1).filter((p) => p !== 'Resources' && p !== 'UK');
    return cleanPool(sub.join('-'));
  }
  if (parts.includes('Textures')) return 'Textures';
  if (/2DTools/i.test(rel)) return 'Configure';
  const di = parts.indexOf('DataFiles');
  if (di >= 0) return 'Printers-' + parts[di + 1];
  if (/Printers\/Manager\//.test(rel)) return 'Printers';
  while (parts.length > 1 && parts[parts.length - 1] === 'UK') parts.pop();
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].startsWith('!')) return cleanPool(parts[i]);
  const ri = parts.lastIndexOf('Resources');
  if (ri > 0) {
    if (parts[ri + 1] && parts[ri - 1] === 'UK') return cleanPool(parts[ri + 1]);
    return cleanPool(parts[ri - 1]);
  }
  return cleanPool(parts[parts.length - 1]);
}

/** All matching files in priority order (first wins per pool/basename), with their pool. */
export function findResources(re, order = ['Sources/OS_Core/Internat/Messages/UK', 'Install/HardDisc4', 'Sources', 'Apps']) {
  const list = [];
  for (const dir of order) {
    for (const f of walk(path.join(V, dir), re).sort()) {
      const rel = path.relative(V, f);
      if (EXCLUDE.test('/' + rel)) continue;
      list.push({ rel, pool: poolFor(rel) });
    }
  }
  return list;
}
