// A small in-memory filing system implementing the BASIC machine's fs interface.
// Used by the standalone demo page and by tests; the Wimp core supplies its own VFS.
// Paths use RISC OS syntax ("$.Dir.File", "ADFS::HardDisc4.$.Dir.File", "RAM::0.$.x"); names are
// case-insensitive; a leading filing system / disc spec is ignored and "@" is the current directory.

export class MemFS {
  constructor(opts = {}) {
    this.files = new Map(); // canonical lowercase path -> {name, data, type}
    this.dirs = new Set(['$']);
    this.cwd = '$';
    this.persist = opts.persist ? opts.storageKey || 'riscos-basic-memfs' : null;
    if (this.persist) this.loadStore();
  }
  canon(path) {
    let p = String(path).trim();
    p = p.replace(/^[A-Za-z]+::[^.]*\./, '').replace(/^[A-Za-z]+:/, '');
    if (p.startsWith('$.')) p = p;
    else if (p === '$') p = '$';
    else if (p.startsWith('@.')) p = this.cwd + p.slice(1);
    else if (p.startsWith('^.')) p = this.cwd.split('.').slice(0, -1).join('.') + p.slice(1);
    else p = this.cwd + '.' + p;
    return p;
  }
  key(path) { return this.canon(path).toLowerCase(); }
  async readFile(path) {
    const f = this.files.get(this.key(path));
    if (!f) return null;
    return { data: f.data.slice(), type: f.type };
  }
  async writeFile(path, data, type = 0xFFD) {
    const c = this.canon(path);
    const parts = c.split('.');
    for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('.').toLowerCase());
    this.files.set(c.toLowerCase(), { name: c, data: Uint8Array.from(data), type });
    this.saveStore();
  }
  async stat(path) {
    const k = this.key(path);
    const f = this.files.get(k);
    if (f) return { type: 'file', filetype: f.type, length: f.data.length };
    if (this.dirs.has(k)) return { type: 'dir' };
    return null;
  }
  async delete(path) { const ok = this.files.delete(this.key(path)); this.saveStore(); return ok; }
  async rename(a, b) {
    const f = this.files.get(this.key(a)); if (!f) return false;
    this.files.delete(this.key(a)); await this.writeFile(b, f.data, f.type); return true;
  }
  async mkdir(path) { this.dirs.add(this.key(path)); }
  async setDir(path) { this.cwd = this.canon(path); }
  async list(dir) {
    const d = (dir ? this.canon(dir) : this.cwd).toLowerCase();
    const out = [];
    for (const f of this.files.values()) {
      const k = f.name.toLowerCase();
      if (k.startsWith(d + '.') && !k.slice(d.length + 1).includes('.')) out.push({ name: f.name.slice(d.length + 1), filetype: f.type, length: f.data.length, type: 'file' });
    }
    for (const k of this.dirs) if (k.startsWith(d + '.') && !k.slice(d.length + 1).includes('.')) out.push({ name: k.slice(d.length + 1), type: 'dir' });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  loadStore() {
    try {
      const s = globalThis.localStorage && localStorage.getItem(this.persist);
      if (!s) return;
      for (const [k, v] of Object.entries(JSON.parse(s))) {
        this.files.set(k, { name: v.name, type: v.type, data: Uint8Array.from(atob(v.data), (c) => c.charCodeAt(0)) });
      }
    } catch (e) { /* ignore */ }
  }
  saveStore() {
    if (!this.persist) return;
    try {
      const o = {};
      for (const [k, f] of this.files) o[k] = { name: f.name, type: f.type, data: btoa(String.fromCharCode(...f.data)) };
      localStorage.setItem(this.persist, JSON.stringify(o));
    } catch (e) { /* ignore */ }
  }
}
