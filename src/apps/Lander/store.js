// Where !Lander finds David Braben's original program. It is (C) D. J. Braben 1987 and never part of this
// repository or its disc image; the user supplies it:
//   1. a file given to !Lander (*Run <Lander$Dir> <file>, a file dropped on the game) - kept in IndexedDB;
//   2. the copy kept in IndexedDB from an earlier run;
//   3. a local, git-ignored checkout served by the dev server: vendor/lander (Mark Moxon's
//      lander-source-code-acorn-archimedes repository, whose 4-reference-binaries hold the game).
//      Only probed when the page comes from this machine, and through the dev server's manifest
//      (serve.mjs answers __dev/lander.json with the files that exist), so a public static deployment
//      makes no requests for it and a missing checkout gives no 404s.
import { identifyBinary } from './host.js';

const DB = 'riscos-lander', STORE = 'binary', KEY = 'original';
export const DEV_MANIFEST = '__dev/lander.json';

function db() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no IndexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  try {
    return await new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
      const q = fn(s);
      t.oncomplete = () => res(q?.result);
      t.onerror = () => rej(t.error);
    });
  } finally { d.close(); }
}

/** The binary kept in IndexedDB, or null. */
export async function loadStored() {
  try {
    const v = await tx('readonly', (s) => s.get(KEY));
    return v?.bytes ? new Uint8Array(v.bytes) : null;
  } catch { return null; }
}
/** Keep a binary (after checking that it is Lander). Returns true if stored. */
export async function store(bytes, name = '') {
  if (!identifyBinary(bytes)) return false;
  try { await tx('readwrite', (s) => s.put({ bytes: bytes.slice().buffer, name, date: Date.now() }, KEY)); return true; } catch { return false; }
}
export async function forget() {
  try { await tx('readwrite', (s) => s.delete(KEY)); } catch { /* none */ }
}

/** True if the page is served from this machine (the dev server). */
export function isLocalHost(host = globalThis.location?.hostname ?? '') {
  return /^(localhost|127(\.\d+){3}|\[?::1\]?)$/i.test(host) || /\.localhost$/i.test(host);
}

/** The dev server's local copy (vendor/lander, git-ignored), or null. */
export async function fetchVendor(base = '') {
  if (!isLocalHost()) return null;
  let files = [];
  try {
    const r = await fetch(base + DEV_MANIFEST, { cache: 'no-cache' });
    if (r.ok) files = (await r.json())?.files ?? [];
  } catch { /* not the dev server */ }
  for (const u of files) {
    try {
      const r = await fetch(base + u, { cache: 'no-cache' });
      if (!r.ok) continue;
      const b = new Uint8Array(await r.arrayBuffer());
      if (identifyBinary(b)) return b;
    } catch { /* not there */ }
  }
  return null;
}
