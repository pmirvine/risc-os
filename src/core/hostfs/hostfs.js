// HostFS: folders on the host machine mounted as RISC OS discs, HostFS::<name>.$
//
// The VFS contract is synchronous for metadata (stat, list, writeFile, rename ...), so a mount keeps the same
// in-memory Node tree the hard disc does:
//   * mounting scans the whole host folder once (names, sizes, dates; types from ./names.js);
//   * file contents are read from the host the first time they're wanted (node.gen);
//   * changes are made to the tree at once and mirrored to the host behind the scenes, one at a time, by
//     reconciling each changed node with where it is on the host (node.hostName / node.hostParent);
//   * the host is rescanned when a Filer window opens a directory, when the page gets the focus again and
//     when the backend reports a change (FileSystemObserver, or the server's watch events).
//
// Backends (same interface, paths are arrays of host names below the mounted folder):
//   ./fsa.js     File System Access API (Chromium), read/write
//   ./server.js  the local server, serve.mjs --host Name=/path (every browser), read/write
//   ./files.js   a read-only snapshot from <input webkitdirectory> or a dropped folder

import { vfs, Node, ATTR } from '../vfs.js';
import { Emitter } from '../util.js';
import { hostToRiscos, riscosToHost, discName } from './names.js';

export const LARGE_TREE = 20000;
const RW = ATTR.ownerRead | ATTR.ownerWrite;

class Cancelled extends Error {}

export class HostMount {
  constructor(backend, { id, name }) {
    this.backend = backend;
    this.id = id;
    this.name = name;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.epoch = 0;                   // bumped by every queued change: a rescan listing from before one is stale
    this.space = null;
    this._lastCheck = new Map();
    this._errors = 0;
    this.disc = null;
  }

  get readonly() { return this.backend.readonly; }
  get root() { return this.disc.root; }

  /** Scan the host folder and add the disc. onLarge(count) resolves true to carry on with a big tree. */
  async mount({ onLarge, limit = LARGE_TREE } = {}) {
    const drive = 1 + Math.max(0, ...vfs.discs.filter((d) => d.fs === 'HostFS').map((d) => d.drive));
    const root = new Node('$', true);
    let count = 0, asked = false;
    const walk = async (dir, parts) => {
      const entries = await this.backend.list(parts);
      count += entries.length;
      if (count > limit && !asked) {
        asked = true;
        if (!(await onLarge?.(count))) throw new Cancelled();
      }
      for (const e of entries) {
        const n = this._add(dir, e);
        if (n?.isDir) await walk(n, [...parts, e.name]);
      }
    };
    root.hostName = '';
    this._root = root;
    await walk(root, []);
    // size: the host's figures when the backend knows them (usage() then uses this.space), else RISC OS 3.71's 2G limit
    this.disc = vfs.addDisc({ fs: 'HostFS', name: this.name, drive, readonly: this.readonly, size: 0x7FFFFFFF, host: this, dynamic: true });
    root.disc = this.disc;
    this.disc.root = root;
    vfs._changed(root);                          // Filer windows / Pinboard pins waiting for this disc
    await this._space();
    this._unwatch = this.backend.watch?.((parts) => this._hostChanged(parts)) ?? null;
    return this;
  }

  dismount() {
    this._unwatch?.();
    if (this.disc) vfs.removeDisc(this.disc);
  }

  /** Wait until every change has reached the host. */
  flush() { return this.queue; }

  // ------------------------------------------------------------ which node holds which host name
  // Each host directory's node keeps hostKids (lower-case host name -> the node that is that object on the host)
  // and hostExtra (host names there that no node shows: hidden files, names that clash once mapped), so a change
  // never moves or writes onto a host object that something else still is.
  _hold(n, dir, name) {
    this._release(n);
    n.hostName = name; n.hostParent = dir;
    (dir.hostKids ??= new Map()).set(name.toLowerCase(), n);
    dir.hostExtra?.delete(name.toLowerCase());
  }
  _release(n) {
    const k = n.hostParent?.hostKids;
    if (k && n.hostName != null && k.get(n.hostName.toLowerCase()) === n) k.delete(n.hostName.toLowerCase());
    n.hostName = null; n.hostParent = null;
  }

  // ------------------------------------------------------------ host -> tree
  /** Add a Node for a host entry to dir (returns null for hidden entries and RISC OS name clashes). */
  _add(dir, e) {
    const r = hostToRiscos(e.name, e.isDir);
    const lc = r?.name.toLowerCase();
    if (!r || dir.children.has(lc)) {            // hidden, or the first one with this RISC OS name wins (RPCEmu)
      (dir.hostExtra ??= new Set()).add(e.name.toLowerCase());
      return null;
    }
    const n = new Node(r.name, e.isDir, dir);
    this._describe(n, e, r);
    this._hold(n, dir, e.name);
    if (!e.isDir) n.gen = () => this._read(n);
    dir.children.set(lc, n);
    return n;
  }
  _describe(n, e, r = hostToRiscos(e.name, e.isDir)) {
    const date = e.mtime || Date.now();
    // a file the host won't let us change shows as locked, so RISC OS doesn't try
    n.attr = n.isDir ? RW : this.readonly ? ATTR.ownerRead : e.readonly ? ATTR.ownerRead | ATTR.locked : RW;
    n.hostMtime = e.mtime;
    if (n.isDir) { n.date = date; return; }
    n.size = e.size;
    if (r.type != null) n.setType(r.type, date);
    else { n.load = r.load; n.exec = r.exec; n.date = date; }
  }

  async _read(n) {
    if (this.pending) await this.queue;          // it may be being moved just now
    return this.backend.read(this._hostPath(n));
  }

  _hostPath(n) {
    const parts = [];
    for (let x = n; x !== this._root; x = x.hostParent) {
      if (x.hostName == null || !x.hostParent) throw new Error(`'${n.name}' isn't on the host yet`);
      parts.unshift(x.hostName);
    }
    return parts;
  }
  /** Still in the tree (a deleted node keeps its parent pointer, so check the parent still has it). */
  _attached(n) {
    for (let x = n; x !== this._root; x = x.parent) {
      if (!x.parent || x.parent.children.get(x.name.toLowerCase()) !== x) return false;
    }
    return true;
  }
  _nodeAt(parts) {
    let n = this._root;
    for (const p of parts) {
      n = n.hostKids?.get(p.toLowerCase());
      if (!n?.isDir) return null;
    }
    return n;
  }
  _dirty(n) { return !n.isDir && (n._ver ?? 0) !== (n._written ?? 0); }

  /** Bring a directory up to date with the host (deep: its subdirectories too). */
  async rescan(dir = this._root, { deep = false } = {}) {
    if (this.pending) await this.queue;
    if (!this._attached(dir) || dir.hostName == null) return;
    const epoch = this.epoch;
    let entries;
    try { entries = await this.backend.list(this._hostPath(dir)); } catch { return; }
    if (this.pending || this.epoch !== epoch) return;     // changed meanwhile: the next check will catch up
    let changed = false;
    const byHost = new Map(entries.map((e) => [e.name, e]));
    const seen = new Set();
    for (const [lc, c] of [...dir.children]) {
      if (c.hostName == null || this._dirty(c)) { if (c.hostName) seen.add(c.hostName); continue; }   // ours, not saved yet
      const e = byHost.get(c.hostName);
      if (!e || e.isDir !== c.isDir) { dir.children.delete(lc); this._release(c); changed = true; continue; }
      seen.add(e.name);
      if (!c.isDir && (e.size !== c.size || Math.abs((e.mtime || 0) - (c.hostMtime || 0)) > 1500)) {
        this._describe(c, e);
        c.data = null; c.gen = () => this._read(c);
        changed = true;
      }
    }
    dir.hostExtra = new Set();
    for (const e of entries) if (!seen.has(e.name) && this._add(dir, e)) changed = true;
    if (changed) vfs._changed(dir);
    if (deep) for (const c of [...dir.children.values()]) if (c.isDir && c.hostName != null) await this.rescan(c, { deep });
    if (dir === this._root) this._space();
  }

  /** A Filer window is showing dir: check the host, at most every couple of seconds per directory. */
  revalidate(dir) {
    const now = Date.now();
    if (now - (this._lastCheck.get(dir) ?? 0) < 2000) return;
    this._lastCheck.set(dir, now);
    this.rescan(dir).catch(() => {});
  }

  _hostChanged(parts) {
    const dir = parts ? this._nodeAt(parts) : null;
    clearTimeout(this._watchT);
    const all = !dir;
    (this._watchDirs ??= new Set()).add(dir ?? this._root);
    this._watchT = setTimeout(() => {
      const dirs = [...this._watchDirs]; this._watchDirs.clear();
      for (const d of dirs) this.rescan(d, { deep: all && d === this._root }).catch(() => {});
    }, 200);
  }

  async _space() {
    const s = await this.backend.space?.().catch(() => null);
    this.space = s?.size ? { size: s.size, free: s.free, used: s.size - s.free } : null;
  }

  // ------------------------------------------------------------ tree -> host (called by vfs)
  persist(n, extra = {}) {
    if (this.readonly) return;
    if (extra.data) n._ver = (n._ver ?? 0) + 1;
    this._enqueue(() => this._sync(n), n);
  }
  removed(n) { if (!this.readonly) this._enqueue(() => this._remove(n)); }

  _enqueue(fn, n = null) {
    this.pending++; this.epoch++;
    this.queue = this.queue.then(fn)
      .then(() => { if (n) n._retries = 0; }, (e) => this._failed(e, n))
      .catch(() => {})
      .finally(() => { this.pending--; });
  }

  async _failed(e, n) {
    console.warn('HostFS', e);
    // try a node again a few times (e.g. the server was restarted); edits aren't thrown away meanwhile
    if (n && (n._retries = (n._retries ?? 0) + 1) <= 3) setTimeout(() => { if (this._attached(n)) this._enqueue(() => this._sync(n), n); }, 1000 * n._retries);
    if (this._errors++ < 1) {
      const { wimp } = await import('../wimp.js');
      wimp.reportError(`HostFS::${this.name}: ${e.message ?? e}`, { appName: 'HostFS Filer' });
    }
    clearTimeout(this._errT);
    this._errT = setTimeout(() => { this._errors = 0; this.rescan(this._root, { deep: true }).catch(() => {}); }, 5000);
  }

  /** The node's current host name if it still describes it, so host names RISC OS can't show exactly (R&D.txt, 日本.txt) are kept. */
  _keepName(n) {
    if (n.hostName == null) return false;
    const r = hostToRiscos(n.hostName, n.isDir);
    if (!r || r.name !== n.name) return false;
    if (n.isDir) return true;
    if (r.type != null) return n.filetype === r.type;
    return n.filetype === -1 && r.load === n.load >>> 0 && r.exec === n.exec >>> 0;
  }

  /** Make host name `name` in dir free for n: returns the name to use (maybe with a ",xxx" to avoid a clash). */
  async _claim(dir, name, n) {
    const b = this.backend;
    const occ = dir.hostKids?.get(name.toLowerCase());
    if (occ && occ !== n) {
      if (!this._attached(occ)) {                  // deleted from the tree: its removal is queued, do it now
        await b.remove(this._hostPath(occ));
        this._release(occ);
      } else {                                     // another object that is moving too (e.g. two names swapped)
        const tmp = `.${occ.hostName}.hostfs-${Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')}`;
        await b.move(this._hostPath(occ), [...this._hostPath(dir), tmp], occ.isDir);
        this._hold(occ, dir, tmp);
        this._enqueue(() => this._sync(occ), occ);
      }
    }
    if (dir.hostExtra?.has(name.toLowerCase())) {   // something on the host RISC OS can't see: don't overwrite it
      const alt = n.isDir ? null : riscosToHost({ name: n.name, isDir: false, filetype: n.filetype, load: n.load, exec: n.exec }, { forceSuffix: true });
      if (!alt || alt.toLowerCase() === name.toLowerCase() || dir.hostExtra.has(alt.toLowerCase()) || (dir.hostKids?.get(alt.toLowerCase()) ?? n) !== n) {
        throw new Error(`Can't save '${n.name}': '${name}' already exists in the host folder`);
      }
      return alt;
    }
    return name;
  }

  async _sync(n) {
    if (n === this._root || !this._attached(n)) return;     // removed since: _remove deals with it
    if (n.parent.hostName == null) await this._sync(n.parent);
    const dir = n.parent;
    const b = this.backend;
    let want = n.hostParent === dir && this._keepName(n) ? n.hostName : riscosToHost({ name: n.name, isDir: n.isDir, filetype: n.filetype, load: n.load, exec: n.exec });
    if (n.hostParent !== dir || n.hostName !== want) want = await this._claim(dir, want, n);
    const to = [...this._hostPath(dir), want];
    if (n.hostName == null) {
      if (n.isDir) await b.mkdir(to);
      else n._ver = (n._ver ?? 0) || 1;              // new file: always write it
      this._hold(n, dir, want);
    } else if (n.hostName !== want || n.hostParent !== dir) {
      await b.move(this._hostPath(n), to, n.isDir);
      this._hold(n, dir, want);
    }
    if (n.isDir) return;
    const time = b.preservesTime ? n.date : undefined;
    if (this._dirty(n)) {
      const v = n._ver;
      const bytes = n.data ?? await vfs._data(n);
      const r = await b.write(to, bytes, { mtime: time });
      n._written = v;
      n.hostMtime = r?.mtime ?? Date.now();
    } else if (time != null && Math.abs(time - (n.hostMtime ?? 0)) > 1500) {
      await b.setTime(to, time);
      n.hostMtime = time;
    }
  }

  async _remove(n) {
    if (n.hostName == null) return;
    await this.backend.remove(this._hostPath(n));
    this._release(n);
  }
}

// ---------------------------------------------------------------- remembered mounts
// Folder handles (File System Access) and which server folders are dismounted are kept in IndexedDB, so
// mounts come back after a reload (a picked folder may need a click to give permission again).
class MountStore {
  async _db() {
    if (this.db !== undefined) return this.db;
    this.db = typeof indexedDB === 'undefined' ? null : await new Promise((res) => {
      const r = indexedDB.open('riscos371-hostfs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('mounts', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
    return this.db;
  }
  async _tx(mode, fn) {
    const db = await this._db();
    if (!db) return null;
    return new Promise((res) => {
      const tx = db.transaction('mounts', mode);
      const req = fn(tx.objectStore('mounts'));
      tx.oncomplete = () => res(req?.result ?? null);
      tx.onerror = () => res(null);
    });
  }
  all() { return this._tx('readonly', (s) => s.getAll()).then((r) => r ?? []); }
  put(rec) { return this._tx('readwrite', (s) => s.put(rec)); }
  del(id) { return this._tx('readwrite', (s) => s.delete(id)); }
  clear() { return this._tx('readwrite', (s) => s.clear()); }
}

class HostFS extends Emitter {
  constructor() {
    super();
    this.mounts = [];
    this.store = new MountStore();
    this.largeTree = LARGE_TREE;      // ask before mounting a folder with more objects than this
  }

  /** A disc name not used by another mount. */
  uniqueName(label) {
    const base = discName(label).slice(0, 24);
    let n = base, i = 2;
    while (vfs.discs.some((d) => d.fs === 'HostFS' && d.name.toLowerCase() === n.toLowerCase())) n = `${base}${i++}`;
    return n;
  }

  /** Mount a backend. opts: {id, name, onLarge}. Resolves the HostMount, or null if cancelled. */
  async mount(backend, { id, name, onLarge } = {}) {
    const m = new HostMount(backend, { id: id ?? `${backend.kind}:${Date.now()}`, name: name ?? this.uniqueName(backend.label) });
    try { await m.mount({ onLarge, limit: this.largeTree }); } catch (e) { if (e instanceof Cancelled) return null; throw e; }
    this.mounts.push(m);
    this.emit('mounts', {});
    return m;
  }

  async dismount(m) {
    await m.flush();
    m.dismount();
    this.mounts = this.mounts.filter((x) => x !== m);
    this.emit('mounts', {});
  }

  byDisc(disc) { return this.mounts.find((m) => m.disc === disc) ?? null; }
  byName(name) { return this.mounts.find((m) => m.name.toLowerCase() === String(name).toLowerCase()) ?? null; }
}

export const hostfs = new HostFS();
vfs.registerFS('HostFS');
