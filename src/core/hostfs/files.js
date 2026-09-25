// Read-only HostFS backend over File objects: a folder chosen with <input type=file webkitdirectory> or
// dropped onto the page in a browser without the File System Access API (Firefox, Safari). It's a snapshot
// of the folder as it was when chosen; nothing is written back.

export class FilesBackend {
  constructor(label, tree) {
    this.kind = 'files';
    this.readonly = true;
    this.label = label;
    this.tree = tree;               // {dirs: Map(name -> tree), files: Map(name -> File)}
    this.preservesTime = false;
  }

  /** From <input webkitdirectory> files (each has webkitRelativePath "Folder/sub/leaf"). */
  static fromFileList(list) {
    const tree = newDir();
    let label = 'Host';
    for (const f of list) {
      const parts = (f.webkitRelativePath || f.name).split('/');
      if (parts.length > 1) label = parts.shift();
      add(tree, parts, f);
    }
    return new FilesBackend(label, tree);
  }

  /** From a dropped directory (DataTransferItem.webkitGetAsEntry()). */
  static async fromEntry(entry) {
    const tree = newDir();
    const walk = async (dirEntry, node) => {
      const reader = dirEntry.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) {
          if (e.isDirectory) { const d = newDir(); node.dirs.set(e.name, d); await walk(e, d); }
          else node.files.set(e.name, await new Promise((res, rej) => e.file(res, rej)));
        }
      }
    };
    await walk(entry, tree);
    return new FilesBackend(entry.name, tree);
  }

  _node(parts) {
    let n = this.tree;
    for (const p of parts) { n = n.dirs.get(p); if (!n) throw new Error('Not found'); }
    return n;
  }

  async permission() { return 'granted'; }
  async list(parts) {
    const n = this._node(parts);
    return [
      ...[...n.dirs.keys()].map((name) => ({ name, isDir: true, size: 0, mtime: 0 })),
      ...[...n.files].map(([name, f]) => ({ name, isDir: false, size: f.size, mtime: f.lastModified })),
    ];
  }
  async read(parts) {
    const f = this._node(parts.slice(0, -1)).files.get(parts[parts.length - 1]);
    if (!f) throw new Error('Not found');
    return new Uint8Array(await f.arrayBuffer());
  }
  async space() { return null; }
  watch() { return null; }
}

function newDir() { return { dirs: new Map(), files: new Map() }; }
function add(tree, parts, f) {
  let n = tree;
  for (const p of parts.slice(0, -1)) { if (!n.dirs.has(p)) n.dirs.set(p, newDir()); n = n.dirs.get(p); }
  n.files.set(parts[parts.length - 1], f);
}
