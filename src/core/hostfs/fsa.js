// HostFS backend on the File System Access API (Chromium): a folder picked with showDirectoryPicker, or
// dropped onto the page (DataTransferItem.getAsFileSystemHandle). Paths are arrays of host names below the
// picked folder.
//
// Limits of the API: there's no way to set a file's modification time (saving stamps it "now"), and
// FileSystemHandle.move() isn't available for local files everywhere, so renames fall back to copy + delete.

export class FSABackend {
  constructor(root, { readonly = false } = {}) {
    this.kind = 'fsa';
    this.root = root;
    this.readonly = readonly;
    this.label = root.name;
    this.preservesTime = false;
  }

  static get supported() { return typeof globalThis.showDirectoryPicker === 'function'; }

  /** 'granted' | 'prompt' | 'denied' for read/write (or read) access to the root. */
  async permission(request = false) {
    const mode = this.readonly ? 'read' : 'readwrite';
    try {
      let p = await this.root.queryPermission({ mode });
      if (p !== 'granted' && request) p = await this.root.requestPermission({ mode });
      return p;
    } catch { return 'denied'; }
  }

  async _dir(parts, create = false) {
    let d = this.root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  async _handle(parts, isDir) {
    const d = await this._dir(parts.slice(0, -1));
    const leaf = parts[parts.length - 1];
    return isDir ? d.getDirectoryHandle(leaf) : d.getFileHandle(leaf);
  }

  async list(parts) {
    const d = await this._dir(parts);
    const out = [];
    const files = [];
    for await (const [name, h] of d.entries()) {
      if (h.kind === 'directory') out.push({ name, isDir: true, size: 0, mtime: 0 });
      else files.push([name, h]);
    }
    await Promise.all(files.map(async ([name, h]) => {
      try { const f = await h.getFile(); out.push({ name, isDir: false, size: f.size, mtime: f.lastModified }); } catch { /* vanished */ }
    }));
    return out;
  }

  async read(parts) {
    const f = await (await this._handle(parts, false)).getFile();
    return new Uint8Array(await f.arrayBuffer());
  }

  async write(parts, bytes) {
    const d = await this._dir(parts.slice(0, -1));
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    try { await w.write(bytes); } catch (e) { await w.abort?.(); throw e; }
    await w.close();
    const f = await fh.getFile();
    return { mtime: f.lastModified, size: f.size };
  }

  async mkdir(parts) { await this._dir(parts, true); }

  async remove(parts) {
    const d = await this._dir(parts.slice(0, -1));
    await d.removeEntry(parts[parts.length - 1], { recursive: true });
  }

  async move(from, to, isDir) {
    const same = from.length === to.length && from.slice(0, -1).every((p, i) => p === to[i]);
    const a = from[from.length - 1], b = to[to.length - 1];
    if (same && a !== b && a.toLowerCase() === b.toLowerCase()) {   // case-only rename on a case-insensitive disc
      const tmp = [...to.slice(0, -1), `${b}.hostfs-tmp`];
      await this.move(from, tmp, isDir);
      return this.move(tmp, to, isDir);
    }
    const h = await this._handle(from, isDir);
    if (typeof h.move === 'function') {
      try { await h.move(await this._dir(to.slice(0, -1)), b); return; } catch { /* not supported for local files: copy */ }
    }
    await this._copy(h, await this._dir(to.slice(0, -1)), b);
    await this.remove(from);
  }
  async _copy(h, dest, name) {
    if (h.kind === 'file') {
      const f = await h.getFile();
      const w = await (await dest.getFileHandle(name, { create: true })).createWritable();
      await w.write(f); await w.close();
      return;
    }
    const d = await dest.getDirectoryHandle(name, { create: true });
    for await (const [n, c] of h.entries()) await this._copy(c, d, n);
  }

  /** Space isn't available through the API. */
  async space() { return null; }

  /** Change notifications (FileSystemObserver, Chrome 133+): cb(parts of the changed directory | null). */
  watch(cb) {
    const FSO = globalThis.FileSystemObserver;
    if (typeof FSO !== 'function') return null;
    let obs;
    try {
      obs = new FSO((records) => {
        for (const r of records) {
          if (r.type === 'errored' || r.type === 'unknown') { cb(null); continue; }
          cb((r.relativePathComponents ?? []).slice(0, -1));
          if (r.relativePathMovedFrom) cb(r.relativePathMovedFrom.slice(0, -1));
        }
      });
      obs.observe(this.root, { recursive: true }).catch(() => {});
    } catch { return null; }
    return () => obs.disconnect();
  }
}
