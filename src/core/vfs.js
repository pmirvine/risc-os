// Virtual filing system with RISC OS semantics.
//
// Full paths look like  ADFS::HardDisc4.$.Apps.!Draw   RAM::RamDisc0.$.Foo   Resources:$.Apps
// Supported: '$' root, '@' CSD, '^' parent, '&' URD, '%' library, path variables (Boot:, Choices:
// via <Name>$Path), FS-only prefixes (ADFS:$.x, RAM:x), ':disc.$' on the current FS, wildcards
// '*' and '#' in leaf names (expandWild). Names are case-insensitive and case-preserving.
//
// Discs:
//   ADFS::HardDisc4  seed contents (assets/disc/manifest.json, fetched lazily) + IndexedDB overlay
//   ADFS::0          floppy, persisted in IndexedDB, starts empty
//   RAM::RamDisc0    RAM disc, not persisted
//   Resources:$      read-only ROM filing system (Resources:$.Apps holds the ROM applications)
//
// File info objects: {name, path, type:'file'|'dir', isApp, filetype (0-0xFFF, -1 untyped,
//   0x1000 dir, 0x2000 app), size, load, exec, attr, date (JS Date), locked}

import { Emitter } from './util.js';
import { sysvars } from './sysvars.js';
import { decodeLatin1, encodeLatin1 } from './charset.js';

export const FT_DIR = 0x1000, FT_APP = 0x2000, FT_UNTYPED = -1;
export const ATTR = { ownerRead: 1, ownerWrite: 2, locked: 8, publicRead: 16, publicWrite: 32 };
const DEFAULT_ATTR = ATTR.ownerRead | ATTR.ownerWrite | ATTR.publicRead;
const SEED_DATE = Date.UTC(1997, 1, 19, 12, 0, 0);   // 19-Feb-1997 (RISC OS 3.71 build date)

export class FSError extends Error {
  constructor(message, errnum = 0) { super(message); this.errnum = errnum; this.riscos = true; }
}
const err = (m, n) => new FSError(m, n);

/** Centiseconds since 1900 (RISC OS 5-byte time) from JS ms. */
export const msToCs = (ms) => Math.floor((ms + 2208988800000) / 10);
export const csToMs = (cs) => cs * 10 - 2208988800000;

class Node {
  constructor(name, isDir, parent = null) {
    this.name = name;
    this.isDir = isDir;
    this.parent = parent;
    this.children = isDir ? new Map() : null;
    this.load = 0; this.exec = 0;
    this.attr = isDir ? ATTR.ownerRead | ATTR.ownerWrite : DEFAULT_ATTR;
    this.date = Date.now();
    this.size = 0;
    this.data = null;     // Uint8Array when loaded / created
    this.src = null;      // URL for lazily-fetched seed content
  }
  get filetype() {
    if (this.isDir) return this.name.startsWith('!') ? FT_APP : FT_DIR;
    return (this.load >>> 20) === 0xFFF ? (this.load >>> 8) & 0xFFF : FT_UNTYPED;
  }
  setType(t, dateMs = this.date) {
    const cs = msToCs(dateMs);
    const hi = Math.floor(cs / 0x100000000) & 0xFF;
    this.load = (0xFFF00000 | ((t & 0xFFF) << 8) | hi) >>> 0;
    this.exec = cs >>> 0;
    this.date = dateMs;
  }
  stamp(ms = Date.now()) {
    this.date = ms;
    if ((this.load >>> 20) === 0xFFF) this.setType(this.filetype, ms);
  }
}

// ---------------------------------------------------------------- IndexedDB overlay
class Store {
  constructor(name) { this.name = name; this.db = null; this.queue = Promise.resolve(); }
  async open() {
    if (typeof indexedDB === 'undefined') return;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('nodes', { keyPath: 'key' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch(() => null);
  }
  async all() {
    if (!this.db) return [];
    return new Promise((res) => {
      const out = [];
      const tx = this.db.transaction('nodes', 'readonly');
      const c = tx.objectStore('nodes').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); };
      c.onerror = () => res(out);
    });
  }
  put(rec) { return this._tx((s) => s.put(rec)); }
  del(key) { return this._tx((s) => s.delete(key)); }
  clear() { return this._tx((s) => s.clear()); }
  _tx(fn) {
    if (!this.db) return Promise.resolve();
    this.queue = this.queue.then(() => new Promise((res) => {
      const tx = this.db.transaction('nodes', 'readwrite');
      fn(tx.objectStore('nodes'));
      tx.oncomplete = res; tx.onerror = () => { console.warn('VFS store error', tx.error); res(); };
    }));
    return this.queue;
  }
}

// ---------------------------------------------------------------- discs
class Disc {
  constructor({ fs, name, drive, persist = false, readonly = false, size, aliases = [] }) {
    this.fs = fs; this.name = name; this.drive = drive;
    this.persist = persist; this.readonly = readonly; this.size = size;
    this.aliases = aliases;
    this.root = new Node('$', true);
    this.root.disc = this;
  }
  get prefix() { return this.fs === 'Resources' ? 'Resources:' : `${this.fs}::${this.name}.`; }
  get key() { return this.prefix.toLowerCase(); }
}

export class VFS extends Emitter {
  constructor() {
    super();
    this.discs = [];
    this.store = new Store('riscos371-vfs');
    this.csd = 'ADFS::HardDisc4.$';
    this.urd = 'ADFS::HardDisc4.$';
    this.lib = 'ADFS::HardDisc4.$';
    this.prevDir = this.csd;
    this.currentFS = 'ADFS';
    this._pendingNotify = new Set();
  }

  // ------------------------------------------------------------ init
  async init({ manifestUrl = 'assets/disc/manifest.json' } = {}) {
    this.hd = this.addDisc({ fs: 'ADFS', name: 'HardDisc4', drive: 4, persist: true, size: 540 * 1024 * 1024, aliases: ['4'] });
    this.floppy = this.addDisc({ fs: 'ADFS', name: '0', drive: 0, persist: true, size: 1600 * 1024, aliases: ['Floppy'] });
    this.ram = this.addDisc({ fs: 'RAM', name: 'RamDisc0', drive: 0, size: 1024 * 1024, aliases: ['0'] });
    this.rom = this.addDisc({ fs: 'Resources', name: '', readonly: true, size: 0 });
    try {
      const r = await fetch(manifestUrl);
      if (r.ok) this._loadSeed(this.hd, (await r.json()).root, 'assets/disc/');
    } catch (e) { console.warn('No seed disc', e); }
    await this.store.open();
    await this._applyOverlay();
  }

  addDisc(o) { const d = new Disc(o); this.discs.push(d); return d; }

  _loadSeed(disc, tree, base) {
    const walk = (json, node) => {
      for (const c of json.children ?? []) {
        const isDir = c.type === 'dir' || c.type === 'app';
        const n = new Node(c.name, isDir, node);
        n.seed = true;
        n.date = SEED_DATE;
        if (!isDir) {
          n.size = c.size ?? 0;
          if (c.path) n.src = base + c.path;
          if (c.type === 'untyped') {
            n.load = parseInt(c.load ?? '0', 16) >>> 0; n.exec = parseInt(c.exec ?? '0', 16) >>> 0;
            n.date = SEED_DATE;
          } else n.setType(parseInt(c.type, 16), SEED_DATE);
          if (c.locked) n.attr |= ATTR.locked;
          if (c.placeholder) n.placeholder = true;   // ARM code left out of the seed disc (tools/disc.mjs)
        } else {
          n.date = SEED_DATE;
          walk(c, n);
        }
        node.children.set(c.name.toLowerCase(), n);
      }
    };
    walk(tree, disc.root);
  }

  async _applyOverlay() {
    const recs = await this.store.all();
    recs.sort((a, b) => a.depth - b.depth);
    for (const r of recs) {
      const disc = this.discs.find((d) => d.key === r.disc);
      if (!disc) continue;
      const parts = r.parts;
      let dir = disc.root;
      let ok = true;
      for (let i = 0; i < parts.length - 1; i++) {
        const c = dir.children.get(parts[i].toLowerCase());
        if (!c || !c.isDir) { ok = false; break; }
        dir = c;
      }
      if (!ok) continue;
      const lc = parts[parts.length - 1].toLowerCase();
      if (r.deleted) { dir.children.delete(lc); continue; }
      let n = dir.children.get(lc);
      if (!n || n.isDir !== r.isDir || (r.isDir && r.fresh)) {
        n = new Node(r.name, r.isDir, dir);
        dir.children.set(lc, n);
      }
      n.name = r.name; n.load = r.load >>> 0; n.exec = r.exec >>> 0; n.attr = r.attr; n.date = r.date;
      n.seed = false;
      if (!r.isDir) {
        if (r.data) { n.data = new Uint8Array(r.data); n.size = n.data.length; n.src = null; }
        else if (r.src) { n.src = r.src; n.size = r.size ?? 0; n.data = null; }
      }
    }
  }

  // ------------------------------------------------------------ path handling
  /**
   * Resolve a path to {disc, parts:[names...]} (parts relative to $). Throws FSError on bad paths.
   * opts.write: for path variables with several entries, use the first.
   */
  parse(path, opts = {}) {
    let p = String(path ?? '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');   // not .trim(): hard spaces (&A0) are part of names (Video.HiRes.!Warning&A0)
    if (p.includes('<')) p = sysvars.gstrans(p);
    // path variable prefix  Name:rest  (not FS::)
    const pv = /^([A-Za-z0-9_$!]+):(?!:)(.*)$/.exec(p);
    if (pv && !this._fsName(pv[1])) {
      const val = sysvars.get(pv[1] + '$Path');
      if (val == null) throw err(`Filing system or path ${pv[1]}: not present`, 0x108D9);
      const prefixes = val.split(',').map((s) => s.trim()).filter((s) => s !== '');
      if (!prefixes.length) prefixes.push('');
      let first = null;
      for (const pre of prefixes) {
        let cand;
        try { cand = this.parse(pre + pv[2], opts); } catch { continue; }
        first ??= cand;
        if (opts.write) return cand;
        if (this._node(cand)) return cand;
      }
      if (first) return first;
      throw err(`File '${p}' not found`, 0x108D6);
    }
    let disc = null, rest = p;
    let m;
    if ((m = /^([A-Za-z]+)::([^.]+)(?:\.(.*))?$/.exec(p))) {           // FS::disc.path
      disc = this._findDisc(m[1], m[2]);
      if (!disc) throw err(`Disc name '${m[2]}' not recognised`, 0x108D5);
      rest = m[3] ?? '$';
    } else if ((m = /^([A-Za-z]+):(.*)$/.exec(p)) && this._fsName(m[1])) {  // FS:path
      const fs = this._fsName(m[1]);
      rest = m[2] || '@';
      if (fs === 'Resources') disc = this.rom;
      else {
        const csd = this._parseCanonical(this.csd);
        disc = csd.disc.fs === fs ? csd.disc : this.discs.find((d) => d.fs === fs);
      }
      if (rest.startsWith(':')) return this.parse(fs + ':' + rest, opts);
      if (!rest.startsWith('$') && disc !== this._parseCanonical(this.csd).disc) rest = '$.' + rest;
    } else if ((m = /^:([^.]+)(?:\.(.*))?$/.exec(p))) {                 // :disc.path
      const fs = this._parseCanonical(this.csd).disc.fs;
      disc = this._findDisc(fs, m[1]);
      if (!disc) throw err(`Disc name '${m[1]}' not recognised`, 0x108D5);
      rest = m[2] ?? '$';
    }
    if (disc && m && (p.includes('::') || p.startsWith(':')) && !rest.startsWith('$')) rest = '$.' + rest;
    const comps = rest === '' ? ['@'] : rest.split('.');
    let parts;
    let i = 0;
    if (comps[0] === '$') { parts = []; i = 1; disc ??= this._parseCanonical(this.csd).disc; }
    else {
      const special = ['&', '@', '%', '\\'].includes(comps[0]);
      const base = comps[0] === '&' ? this.urd : comps[0] === '%' ? this.lib : comps[0] === '\\' ? this.prevDir : this.csd;
      const b = this._parseCanonical(base);
      if (disc && b.disc !== disc) { parts = []; }
      else { disc = b.disc; parts = [...b.parts]; }
      if (special) i = 1;
    }
    for (; i < comps.length; i++) {
      const c = comps[i];
      if (c === '' ) { if (i === comps.length - 1) break; throw err(`Bad name`, 0xCC); }
      if (c === '^') { if (parts.length) parts.pop(); else throw err('Illegal use of ^', 0x108AE); continue; }
      if (c === '@' || c === '$') continue;
      parts.push(c);
    }
    return { disc, parts };
  }

  _parseCanonical(p) {
    const m = /^([A-Za-z]+)::([^.]+)\.\$(?:\.(.*))?$/.exec(p);
    if (m) return { disc: this._findDisc(m[1], m[2]), parts: m[3] ? m[3].split('.') : [] };
    const r = /^Resources:\$(?:\.(.*))?$/i.exec(p);
    if (r) return { disc: this.rom, parts: r[1] ? r[1].split('.') : [] };
    return { disc: this.hd, parts: [] };
  }

  _fsName(n) {
    const l = n.toLowerCase();
    if (l === 'adfs') return 'ADFS';
    if (l === 'ram' || l === 'ramfs') return 'RAM';
    if (l === 'resources' || l === 'resourcefs') return 'Resources';
    return null;
  }
  _findDisc(fs, name) {
    const f = this._fsName(fs);
    const l = String(name).toLowerCase();
    return this.discs.find((d) => d.fs === f && (d.name.toLowerCase() === l || d.aliases.some((a) => a.toLowerCase() === l) || String(d.drive) === l)) ?? null;
  }

  _node(loc) {
    let n = loc.disc.root;
    for (const p of loc.parts) {
      if (!n.isDir) return null;
      n = n.children.get(p.toLowerCase());
      if (!n) return null;
    }
    return n;
  }

  /** Canonical full path of a location. */
  _pathOf(disc, parts) { return disc.prefix + '$' + parts.map((p) => '.' + p).join(''); }
  _nodePath(n) {
    const parts = [];
    let x = n;
    while (x.parent) { parts.unshift(x.name); x = x.parent; }
    return this._pathOf(x.disc, parts);
  }

  /** Canonicalise a path (resolving case to the stored names where the objects exist). */
  canonical(path) {
    const loc = this.parse(path);
    const out = [];
    let n = loc.disc.root;
    for (const p of loc.parts) {
      const c = n?.isDir ? n.children.get(p.toLowerCase()) : null;
      out.push(c ? c.name : p);
      n = c;
    }
    return this._pathOf(loc.disc, out);
  }

  /** Split a full path into [parentPath, leaf]. */
  split(path) {
    const c = this.canonical(path);
    const i = c.lastIndexOf('.');
    if (i < 0 || c.endsWith('$')) return [c, ''];
    return [c.slice(0, i), c.slice(i + 1)];
  }
  leaf(path) { return this.split(path)[1]; }
  parent(path) { return this.split(path)[0]; }
  join(dir, leaf) { return `${dir}.${leaf}`; }
  isRoot(path) { return this.canonical(path).endsWith('$'); }

  // ------------------------------------------------------------ queries
  _info(n, path) {
    return {
      name: n.name, path, type: n.isDir ? 'dir' : 'file', isApp: n.isDir && n.name.startsWith('!'),
      filetype: n.filetype, size: n.isDir ? 0 : n.size, load: n.load >>> 0, exec: n.exec >>> 0,
      attr: n.attr, locked: !!(n.attr & ATTR.locked), date: new Date(n.date), readonly: this._discOf(n).readonly,
      ...(n.placeholder && n.seed ? { placeholder: true } : {}),
    };
  }
  _discOf(n) { let x = n; while (x.parent) x = x.parent; return x.disc; }

  /** File info or null if the object doesn't exist. */
  stat(path) {
    let loc;
    try { loc = this.parse(path); } catch { return null; }
    const n = this._node(loc);
    return n ? this._info(n, this._nodePath(n)) : null;
  }
  exists(path) { return !!this.stat(path); }
  isDir(path) { const s = this.stat(path); return !!s && s.type === 'dir'; }

  /** Directory listing (array of info), sorted by name. */
  list(path) {
    const loc = this.parse(path);
    const n = this._node(loc);
    if (!n) throw err(`Directory '${this.leaf(path) || path}' not found`, 0x108D6);
    if (!n.isDir) throw err(`'${n.name}' is a file`, 0x108D6);
    const base = this._nodePath(n);
    return [...n.children.values()].map((c) => this._info(c, base + '.' + c.name)).sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
  }

  /** Expand wildcards in the leaf (and intermediate) components. Returns array of full paths. */
  expandWild(path) {
    if (!/[*#]/.test(path)) return this.exists(path) ? [this.canonical(path)] : [];
    const loc = this.parse(path);
    let cur = [loc.disc.root];
    for (const p of loc.parts) {
      const re = new RegExp('^' + p.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/#/g, '.') + '$');
      const next = [];
      for (const d of cur) {
        if (!d.isDir) continue;
        for (const c of d.children.values()) if (re.test(c.name.toLowerCase())) next.push(c);
      }
      cur = next;
    }
    return cur.map((n) => this._nodePath(n)).sort();
  }

  /** Read file contents (Promise<Uint8Array>). */
  async readFile(path) {
    const loc = this.parse(path);
    const n = this._node(loc);
    if (!n) throw err(`File '${loc.parts[loc.parts.length - 1] ?? path}' not found`, 0x108D6);
    if (n.isDir) throw err(`'${n.name}' is a directory`, 0x108D6);
    return this._data(n);
  }
  async _data(n) {
    if (n.data) return n.data;
    if (n.src) {
      if (!n._fetch) {
        n._fetch = fetch(n.src).then(async (r) => {
          if (!r.ok) throw err(`Can't read '${n.name}'`);
          const b = new Uint8Array(await r.arrayBuffer());
          n.data = b; n.size = b.length;
          return b;
        }).finally(() => { n._fetch = null; });
      }
      return n._fetch;
    }
    if (n.gen) { n.data = await n.gen(); n.size = n.data.length; return n.data; }
    return new Uint8Array(0);
  }
  /** Synchronous read; throws if the contents haven't been loaded (use preload first). */
  readFileSync(path) {
    const n = this._node(this.parse(path));
    if (!n || n.isDir) throw err(`File '${path}' not found`, 0x108D6);
    if (n.data) return n.data;
    if (!n.src && !n.gen) return new Uint8Array(0);
    throw err(`File '${n.name}' not loaded`, 0);
  }
  async preload(path) { await this.readFile(path); }
  async readText(path) { return decodeLatin1(await this.readFile(path)); }

  // ------------------------------------------------------------ mutation
  _checkWritable(disc, what = 'write') {
    if (disc.readonly) throw err('Filing system is read-only', 0x108C9);
  }
  _parentFor(path, create = false) {
    const loc = this.parse(path, { write: true });
    if (!loc.parts.length) throw err('Bad name', 0xCC);
    const dirLoc = { disc: loc.disc, parts: loc.parts.slice(0, -1) };
    const dir = this._node(dirLoc);
    if (!dir) throw err(`Directory '${dirLoc.parts[dirLoc.parts.length - 1] ?? '$'}' not found`, 0x108D6);
    if (!dir.isDir) throw err(`'${dir.name}' is a file`, 0x108D6);
    return { loc, dir, leaf: loc.parts[loc.parts.length - 1] };
  }

  /**
   * Write a file. data: Uint8Array | ArrayBuffer | string (Latin-1). opts: {filetype, load, exec, attr}
   * Returns the canonical path.
   */
  writeFile(path, data, opts = {}) {
    const { loc, dir, leaf } = this._parentFor(path);
    this._checkWritable(loc.disc);
    this._validLeaf(leaf);
    const bytes = typeof data === 'string' ? encodeLatin1(data) : data instanceof Uint8Array ? data : new Uint8Array(data ?? []);
    let n = dir.children.get(leaf.toLowerCase());
    if (n && n.isDir) throw err(`'${leaf}' cannot be created - a directory with that name already exists`, 0x108C4);
    if (n && n.attr & ATTR.locked) throw err(`'${n.name}' is locked`, 0x108C3);
    const now = Date.now();
    if (!n) { n = new Node(leaf, false, dir); dir.children.set(leaf.toLowerCase(), n); n.attr = opts.attr ?? DEFAULT_ATTR; }
    n.data = bytes; n.size = bytes.length; n.src = null; n.seed = false;
    if (opts.load != null) { n.load = opts.load >>> 0; n.exec = (opts.exec ?? 0) >>> 0; n.date = now; }
    else n.setType(opts.filetype ?? (n.load ? n.filetype : 0xFFD), now);
    if (opts.filetype === FT_UNTYPED) { n.load = 0; n.exec = 0; }
    this._persist(n);
    this._changed(dir);
    return this._nodePath(n);
  }

  /** Create a directory (no error if it exists). Returns canonical path. */
  mkdir(path, { parents = false } = {}) {
    const loc = this.parse(path, { write: true });
    this._checkWritable(loc.disc);
    let n = loc.disc.root;
    for (let i = 0; i < loc.parts.length; i++) {
      const p = loc.parts[i];
      let c = n.children.get(p.toLowerCase());
      if (!c) {
        if (i < loc.parts.length - 1 && !parents) throw err(`Directory '${p}' not found`, 0x108D6);
        this._validLeaf(p);
        c = new Node(p, true, n);
        c.fresh = true;
        n.children.set(p.toLowerCase(), c);
        this._persist(c, { fresh: true });
        this._changed(n);
      } else if (!c.isDir) throw err(`'${p}' cannot be created - a file with that name already exists`, 0x108C5);
      n = c;
    }
    return this._nodePath(n);
  }

  _validLeaf(leaf) {
    if (!leaf || /[\s.:*#$&@^%\\"|\x00-\x1f]/.test(leaf)) throw err(`Bad name '${leaf}'`, 0xCC);
  }

  /** Delete an object. Directories must be empty unless opts.recursive. opts.force ignores locks. */
  delete(path, opts = {}) {
    const { loc, dir, leaf } = this._parentFor(path);
    this._checkWritable(loc.disc);
    const n = dir.children.get(leaf.toLowerCase());
    if (!n) throw err(`File '${leaf}' not found`, 0x108D6);
    if (n.attr & ATTR.locked && !opts.force) throw err(`'${n.name}' is locked`, 0x108C3);
    if (n.isDir && n.children.size && !opts.recursive) throw err('Directory not empty', 0x108B4);
    if (this._isCsdInside(n)) throw err("Can't delete current directory", 0x10896);
    dir.children.delete(leaf.toLowerCase());
    this._unpersist(n, loc);
    this._changed(dir);
  }
  _isCsdInside(n) {
    try { const c = this._node(this.parse(this.csd)); let x = c; while (x) { if (x === n) return true; x = x.parent; } } catch { /* */ }
    return false;
  }

  /** Rename / move within a disc (like *Rename). */
  rename(from, to) {
    const a = this._parentFor(from), b = this._parentFor(to);
    this._checkWritable(a.loc.disc);
    const n = a.dir.children.get(a.leaf.toLowerCase());
    if (!n) throw err(`File '${a.leaf}' not found`, 0x108D6);
    if (n.attr & ATTR.locked) throw err(`'${n.name}' is locked`, 0x108C3);
    if (a.loc.disc !== b.loc.disc) throw err('Not same disc', 0x1089F);
    this._validLeaf(b.leaf);
    const existing = b.dir.children.get(b.leaf.toLowerCase());
    if (existing && existing !== n) throw err(`Item cannot be renamed - '${b.leaf}' already exists`, 0x108C2);
    for (let x = b.dir; x; x = x.parent) if (x === n) throw err('A directory can not be copied or moved into itself', 0);
    this._unpersist(n, a.loc);
    a.dir.children.delete(a.leaf.toLowerCase());
    n.name = b.leaf; n.parent = b.dir;
    b.dir.children.set(b.leaf.toLowerCase(), n);
    this._persistTree(n, true);
    this._changed(a.dir); this._changed(b.dir);
    return this._nodePath(n);
  }

  /** Copy an object (recursively for directories). Returns canonical destination path. */
  async copy(from, to, opts = {}) {
    const src = this._node(this.parse(from));
    if (!src) throw err(`File '${this.leaf(from)}' not found`, 0x108D6);
    const b = this._parentFor(to);
    this._checkWritable(b.loc.disc);
    for (let x = b.dir; x; x = x.parent) if (x === src) throw err('A directory can not be copied or moved into itself', 0);
    const existing = b.dir.children.get(b.leaf.toLowerCase());
    if (existing) {
      if (existing === src) return this._nodePath(src);
      if (existing.isDir !== src.isDir) throw err(src.isDir ? 'Directory cannot be copied - a file with that destination name already exists' : 'File cannot be copied - a directory with that destination name already exists', 0);
      if (!src.isDir) {
        if (opts.newer && existing.date >= src.date) return this._nodePath(existing);
        if (existing.attr & ATTR.locked && !opts.force) throw err(`'${existing.name}' is locked`, 0x108C3);
      }
    }
    const dup = async (s, dir, name) => {
      let n = dir.children.get(name.toLowerCase());
      if (!n || n.isDir !== s.isDir) { n = new Node(name, s.isDir, dir); dir.children.set(name.toLowerCase(), n); if (s.isDir) n.fresh = true; }
      n.load = s.load; n.exec = s.exec; n.attr = s.attr & ~(opts.keepLocks ? 0 : 0); n.date = opts.stamp ? Date.now() : s.date;
      n.seed = false;
      if (s.isDir) {
        this._persist(n, { fresh: !!n.fresh });
        for (const c of s.children.values()) { await dup(c, n, c.name); opts.onProgress?.(c); }
      } else {
        if (s.data) { n.data = s.data.slice(); n.src = null; }
        else if (s.src) { n.src = s.src; n.data = null; }
        else n.data = await this._data(s);
        n.size = s.size;
        this._persist(n);
      }
      return n;
    };
    const n = await dup(src, b.dir, b.leaf);
    this._changed(b.dir);
    return this._nodePath(n);
  }

  /** Move (copy + delete when crossing discs, rename otherwise). */
  async move(from, to, opts = {}) {
    const a = this.parse(from), b = this.parse(to, { write: true });
    if (a.disc === b.disc) return this.rename(from, to);
    const p = await this.copy(from, to, opts);
    this.delete(from, { recursive: true, force: opts.force });
    return p;
  }

  setType(path, type) {
    const n = this._must(path);
    if (n.isDir) return;
    this._checkWritable(this._discOf(n));
    n.setType(type, n.date);
    this._persist(n); this._changed(n.parent);
  }
  setLoadExec(path, load, exec) {
    const n = this._must(path);
    n.load = load >>> 0; n.exec = exec >>> 0;
    this._persist(n); this._changed(n.parent);
  }
  setAccess(path, attr) {
    const n = this._must(path);
    this._checkWritable(this._discOf(n));
    n.attr = attr & 0xFF;
    this._persist(n); this._changed(n.parent);
  }
  stamp(path) {
    const n = this._must(path);
    this._checkWritable(this._discOf(n));
    n.stamp(Date.now());
    this._persist(n); this._changed(n.parent);
  }
  _must(path) {
    const n = this._node(this.parse(path));
    if (!n) throw err(`File '${this.leaf(path)}' not found`, 0x108D6);
    return n;
  }

  /** Rename a disc (Name disc). */
  nameDisc(disc, name) {
    disc.aliases.push(disc.name);
    disc.name = name;
    this.emit('discs', {});
  }

  /** Bytes used on a disc. */
  usage(disc) {
    let used = 0;
    const walk = (n) => { if (n.isDir) { used += 2048; for (const c of n.children.values()) walk(c); } else used += Math.ceil((n.size || 0) / 1024) * 1024; };
    walk(disc.root);
    return { size: disc.size, used, free: Math.max(0, disc.size - used) };
  }
  discOf(path) { return this.parse(path).disc; }

  /** Remove everything from a disc (e.g. RAM disc close-down, floppy format). */
  wipe(disc) {
    disc.root.children.clear();
    if (disc.persist) this.store.all().then((rs) => rs.filter((r) => r.disc === disc.key).forEach((r) => this.store.del(r.key)));
    this._changed(disc.root);
  }

  // ------------------------------------------------------------ ROM filing system helpers
  /**
   * Add a read-only object to Resources: (used by the app registry for ROM applications).
   * content: Uint8Array | string | () => Promise<Uint8Array> | {src: url}
   */
  romAdd(path, { dir = false, filetype = 0xFFF, content = null } = {}) {
    const loc = this.parse(path);
    let n = loc.disc.root;
    for (let i = 0; i < loc.parts.length; i++) {
      const p = loc.parts[i];
      const last = i === loc.parts.length - 1;
      let c = n.children.get(p.toLowerCase());
      if (!c) {
        c = new Node(p, last ? dir : true, n);
        c.date = SEED_DATE;
        // ROM files are LR/r; the Filer shows ResourceFS directories as WR/ (3.7 screenshots)
        c.attr = c.isDir ? ATTR.ownerRead | ATTR.ownerWrite : ATTR.ownerRead | ATTR.publicRead | ATTR.locked;
        n.children.set(p.toLowerCase(), c);
      }
      if (last && !dir) {
        c.setType(filetype, SEED_DATE);
        if (content == null) { c.data = new Uint8Array(0); }
        else if (typeof content === 'string') { c.data = encodeLatin1(content); c.size = c.data.length; }
        else if (content instanceof Uint8Array) { c.data = content; c.size = content.length; }
        else if (typeof content === 'function') { c.gen = content; c.size = 0; }
        else if (content.src) { c.src = content.src; c.size = content.size ?? 0; }
      }
      n = c;
    }
    this._changed(n.parent ?? n);
    return this._nodePath(n);
  }

  // ------------------------------------------------------------ persistence
  _recKey(disc, parts) { return disc.key + '|' + parts.map((p) => p.toLowerCase()).join('.'); }
  _partsOf(n) { const p = []; let x = n; while (x.parent) { p.unshift(x.name); x = x.parent; } return p; }
  _persist(n, extra = {}) {
    const disc = this._discOf(n);
    if (!disc.persist) return;
    const parts = this._partsOf(n);
    const rec = {
      key: this._recKey(disc, parts), disc: disc.key, parts, depth: parts.length, name: n.name, isDir: n.isDir,
      load: n.load >>> 0, exec: n.exec >>> 0, attr: n.attr, date: n.date, fresh: !!(extra.fresh ?? n.fresh),
    };
    if (!n.isDir) {
      if (n.data) rec.data = n.data.buffer.slice(n.data.byteOffset, n.data.byteOffset + n.data.byteLength);
      else if (n.src) { rec.src = n.src; rec.size = n.size; }
    }
    this.store.put(rec);
  }
  _persistTree(n, fresh) {
    this._persist(n, { fresh: n.isDir ? fresh : false });
    if (n.isDir) for (const c of n.children.values()) this._persistTree(c, fresh);
  }
  _unpersist(n, loc) {
    const disc = loc.disc;
    if (!disc.persist) return;
    // tombstone this path (hides seed object) and delete records of the subtree
    const parts = this._partsOf(n).length ? this._partsOf(n) : loc.parts;
    const key = this._recKey(disc, parts);
    this.store.put({ key, disc: disc.key, parts, depth: parts.length, deleted: true });
    const prefix = key + '.';
    this.store.all().then((rs) => rs.forEach((r) => { if (r.key.startsWith(prefix)) this.store.del(r.key); }));
  }

  /** Forget all local changes (reset the hard disc to the seed state). */
  async resetOverlay() { await this.store.clear(); location.reload(); }

  // ------------------------------------------------------------ change notification
  _changed(dirNode) {
    if (!dirNode) return;
    const p = this._nodePath(dirNode);
    this._pendingNotify.add(p);
    if (!this._notifyT) this._notifyT = setTimeout(() => {
      this._notifyT = null;
      const dirs = [...this._pendingNotify];
      this._pendingNotify.clear();
      for (const d of dirs) this.emit('change', { dir: d });
    }, 0);
  }

  /** Set the currently selected directory (*Dir). */
  setCSD(path) {
    const n = this._node(this.parse(path));
    if (!n || !n.isDir) throw err(`Directory '${path}' not found`, 0x108D6);
    this.prevDir = this.csd;
    this.csd = this._nodePath(n);
    return this.csd;
  }
}

export const vfs = new VFS();
globalThis.vfs = vfs;
