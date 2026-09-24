// !Patch engine: patch file parsing (c/PatchParse), directory enumeration (c/Subroutins) and the
// check / apply / remove logic (c/PatchApply) of the Application Patcher 1.32, on the virtual disc.
//
// Data model (the C lists are built by prepending, and are kept in that order here):
//   apps:    [{ name, fileType, desc, patches: [PATCH], targets: [TARGET] }]
//   PATCH:   { desc, files: [FILE] }
//   FILE:    { flavour: 'modify'|'replace'|'create'|'delete', name, fileType, transform,
//              verifies: [{location, data}], changes: [{location, old, new}],
//              oldContents, oldType, newContents, newType }
//   TARGET:  { outerDir ("ADFS::HardDisc4.$.Apps."), displayPath, patches: [{patch, action, icon}] }
// Actions: NONE (greyed: no select icon), APPLY, REMOVE (UNKNOWN only inside checkPatch).
//
// Transforms (Transforms file, MessageTrans format): <T>_Prepare / <T>_Finish *commands run through
// the CLI with %0 %1 substituted, as Wimp_StartTask would. "Copy" works on the virtual disc.
// "Squeeze" needs UnSqueeze / squeeze (ARM code): see the UnSqueeze command in main.js.

export const ACTION = { NONE: 0, APPLY: 1, REMOVE: 2, UNKNOWN: 3 };
export const FT_PATCH = 0xFC3;
export const FT_DONTCARE = 0;
const CHUNK_SIZE = 256;

/** OS_ReadUnsigned-style number: "&1F", "16_1F", "123", with an optional leading '-'. */
export function readNumber(s) {
  s = String(s ?? '').trim();
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  let base = 10, m;
  if (s[0] === '&') { base = 16; s = s.slice(1); }
  else if ((m = /^(\d+)_/.exec(s))) { base = +m[1]; s = s.slice(m[0].length); }
  let v = 0;
  for (const ch of s) {
    const d = parseInt(ch, 36);
    if (Number.isNaN(d) || d >= base) break;
    v = (v * base + d) >>> 0;
  }
  return neg ? -v : v;
}

const word = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const latin1 = (s) => Uint8Array.from(String(s), (c) => c.charCodeAt(0) & 255);
const concat = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };

// Commands (split_parms TRUE = two space-separated parameters)
const CMDS = [
  ['Application:', 'application', true], ['Description:', 'description', false], ['Patch:', 'patch', false],
  ['File:', 'file', true], ['Transform:', 'transform', true], ['Location:', 'location', true],
  ['ChangeWord:', 'changeword', true], ['VerifyWord:', 'verifyword', true], ['ChangeByte:', 'changebyte', true],
  ['VerifyByte:', 'verifybyte', true], ['ChangeString:', 'changestring', true], ['VerifyString:', 'verifystring', true],
  ['ReplaceFile:', 'replacefile', true], ['CreateFile:', 'createfile', true], ['DeleteFile:', 'deletefile', true],
  ['OldContents:', 'oldcontents', true], ['NewContents:', 'newcontents', true],
  ['PatchesDir:', 'patchesdir', true], ['TransformsFile:', 'transformsfile', true],
];

export class Patcher {
  /**
   * env: { vfs, gstrans(s) → string, run(cmd) → Promise (throws on error),
   *        report(text) → Promise<boolean> (true = OK / carry on; false = Cancel pressed),
   *        msg(token, ...args), parseMessages(text) → {token: value} }
   */
  constructor(env) {
    this.env = env;
    this.apps = [];
    this.transforms = [];      // MessageTrans dictionaries from TransformsFile
    this.onTarget = null;      // (target) => void   new target found (the window adds icons)
    this.cancelled = false;
  }

  async report(text) {
    if (this.cancelled) return false;
    const ok = await this.env.report(text);
    if (!ok) this.cancelled = true;
    return ok;
  }
  err(token, ...a) { return this.env.msg(token, ...a); }

  // ------------------------------------------------------------------ enumeration (Subroutins)
  /**
   * enumerate_files_in_object: call fn(dir, leaf, filetype) for the object itself (if its type is in
   * `want`: 'file' / 'dir' / both) and, for directories, everything inside recursively.
   */
  async enumerate(object, want, fn) {
    const { vfs } = this.env;
    let st;
    try { st = vfs.stat(object); } catch (e) { await this.report(e.message); return; }
    if (!st) { await this.report(`File '${object}' not found`); return; }
    const isDir = st.type === 'dir';
    const ft = isDir ? (st.isApp ? 0x2000 : 0x1000) : (st.filetype ?? -1);
    if ((isDir && want.dir) || (!isDir && want.file)) {
      const i = st.path.lastIndexOf('.');
      if (i >= 0) await fn(st.path.slice(0, i), st.path.slice(i + 1), ft);
      else await fn(null, st.path, ft);
    }
    if (isDir) await this.enumerateDir(st.path, want, fn);
  }
  async enumerateDir(dir, want, fn) {
    const { vfs } = this.env;
    let list;
    try { list = vfs.list(dir); } catch (e) { await this.report(e.message); return; }
    for (const e of list) {
      if (this.cancelled) return;
      const isDir = e.type === 'dir';
      const ft = isDir ? (e.isApp ? 0x2000 : 0x1000) : (e.filetype ?? -1);
      if ((isDir && want.dir) || (!isDir && want.file)) await fn(dir, e.name, ft);
      if (isDir) await this.enumerateDir(`${dir}.${e.name}`, want, fn);
    }
  }

  // ------------------------------------------------------------------ parsing (PatchParse)
  findApp(name, fileType) { return this.apps.find((a) => a.name === name && a.fileType === fileType) ?? null; }

  /** read_patch_file(directory, file, filetype). */
  async readPatchFile(directory, file, fileType) {
    if (fileType !== FT_PATCH) return;
    const { vfs, gstrans } = this.env;
    const filename = directory == null ? file : `${directory}.${file}`;
    let text;
    try { text = await vfs.readText(filename); } catch (e) { await this.report(e.message); return; }
    let app = null, patch = null, f = null, chg = null, ver = null, loc = 0;
    const need = async (thing, what) => {
      if (thing) return true;
      await this.report(`${what} before it is introduced in patch file '${filename}'`);
      return false;
    };
    for (const raw of text.split('\n')) {
      if (this.cancelled) return;
      const line = raw.replace(/\r$/, '');
      if (line === '' || line[0] === '#') continue;
      const cmd = CMDS.find(([k]) => line.startsWith(k));
      if (!cmd) continue;                          // unknown keyword: ignored (falls off the table)
      const [key, id, split] = cmd;
      let p1 = line.slice(key.length), p2 = '';
      if (split) {
        if (/^\s/.test(p1)) { p2 = p1.trimStart(); p1 = ''; }
        else { const m = /^(\S*)\s*(.*)$/.exec(p1); p1 = m[1]; p2 = m[2]; }
      } else p1 = p1.trim();
      switch (id) {
        case 'application': {
          const ft = readNumber(p2);
          app = this.findApp(p1, ft);
          if (!app) { app = { name: p1, fileType: ft, desc: null, patches: [], targets: [] }; this.apps.unshift(app); }
          patch = null; f = null;
          break;
        }
        case 'description':
          if (!(await need(app, 'Description'))) return;
          if (app.desc == null) app.desc = p1;
          break;
        case 'patch':
          if (!(await need(app, 'Patch'))) return;
          patch = app.patches.find((p) => p.desc === p1);
          if (!patch) { patch = { desc: p1, files: [] }; app.patches.unshift(patch); }
          f = null;
          break;
        case 'file': case 'replacefile': case 'createfile': case 'deletefile':
          if (!(await need(patch, 'File'))) return;
          f = { flavour: { file: 'modify', replacefile: 'replace', createfile: 'create', deletefile: 'delete' }[id], name: p1,
            fileType: id === 'file' ? readNumber(p2) : 0, transform: null, verifies: [], changes: [],
            oldContents: null, oldType: 0, newContents: null, newType: 0 };
          patch.files.unshift(f);
          chg = null; ver = null; loc = 0;
          break;
        case 'transform': if (await need(f, 'Transform')) f.transform = p1; else return; break;
        case 'location': loc = readNumber(p1); break;
        case 'changeword': case 'changebyte': case 'changestring': {
          if (!(await need(f, 'Change'))) return;
          let o, n;
          if (id === 'changeword') { o = word(readNumber(p1)); n = word(readNumber(p2)); }
          else if (id === 'changebyte') { o = Uint8Array.of(readNumber(p1) & 255); n = Uint8Array.of(readNumber(p2) & 255); }
          else { o = latin1(gstrans(p1)); n = latin1(gstrans(p2)).slice(0, o.length); if (n.length < o.length) n = concat(n, new Uint8Array(o.length - n.length)); }
          if (!chg || chg.old.length + o.length > Math.max(CHUNK_SIZE, chg.old.length) || chg.location + chg.old.length !== loc) {
            chg = { location: loc, old: new Uint8Array(0), new: new Uint8Array(0) };
            f.changes.unshift(chg);
          }
          chg.old = concat(chg.old, o); chg.new = concat(chg.new, n);
          loc += o.length;
          break;
        }
        case 'verifyword': case 'verifybyte': case 'verifystring': {
          if (!(await need(f, 'Verify'))) return;
          const d = id === 'verifyword' ? word(readNumber(p1)) : id === 'verifybyte' ? Uint8Array.of(readNumber(p1) & 255) : latin1(gstrans(p1));
          if (!ver || ver.data.length + d.length > Math.max(CHUNK_SIZE, ver.data.length) || ver.location + ver.data.length !== loc) {
            ver = { location: loc, data: new Uint8Array(0) };
            f.verifies.unshift(ver);
          }
          ver.data = concat(ver.data, d);
          loc += d.length;
          break;
        }
        case 'oldcontents': if (await need(f, 'OldContents')) { f.oldContents = p1; f.oldType = readNumber(p2); } else return; break;
        case 'newcontents': if (await need(f, 'NewContents')) { f.newContents = p1; f.newType = readNumber(p2); } else return; break;
        case 'patchesdir':
          await this.enumerate(p1, { file: true }, (d, leaf, ft) => this.readPatchFile(d, leaf, ft));
          break;
        case 'transformsfile':
          try { this.transforms.unshift(this.env.parseMessages(await vfs.readText(p1))); }
          catch (e) { await this.report(e.message); }
          break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------------ targets (Main)
  /** add_to_list_if_patchable: an object found in a dropped directory tree. */
  addIfPatchable(dir, object, fileType) {
    for (const app of this.apps) {
      if (app.name === object && (app.fileType === fileType || app.fileType === FT_DONTCARE)) {
        const outerDir = dir == null ? '' : dir + '.';
        const t = { app, outerDir, displayPath: outerDir + object, patches: app.patches.map((p) => ({ patch: p, action: ACTION.NONE, icon: null })) };
        app.targets.unshift(t);
        this.onTarget?.(t);
      }
    }
  }

  get allTargets() { return this.apps.flatMap((a) => a.targets); }

  // ------------------------------------------------------------------ transforms
  lookupAll(token) {
    for (const d of this.transforms) if (token in d) return d[token];
    return null;
  }
  scrap() {
    const s = this.env.gstrans('<Wimp$Scrap>') || 'RAM::RamDisc0.$.ScrapFile';
    // !Scrap's scrap directory is created on demand (CDir <Wimp$ScrapDir>)
    try { const d = this.env.vfs.parent(s); if (d && !this.env.vfs.exists(d)) this.env.vfs.mkdir(d, { parents: true }); } catch { /* */ }
    return s;
  }
  /** transform_file(): run <transform><suffix> with %0 %1. Returns an error message or null (after reporting it). */
  async transform(p0, p1, transform, suffix) {
    const tpl = this.lookupAll(transform + suffix);
    if (tpl == null) { const m = `Message token ${transform}${suffix} not found`; await this.report(m); return m; }
    const cmd = this.env.gstrans(tpl.replace(/%([0-3])/g, (_, n) => [p0, p1, '', ''][+n]));
    try { await this.env.run(cmd); return null; } catch (e) { const m = e?.message ?? String(e); await this.report(m); return m; }
  }

  // ------------------------------------------------------------------ file access helpers
  info(path) {
    try {
      const st = this.env.vfs.stat(path);
      if (!st) return { type: 0, fileType: 0 };
      if (st.type === 'dir') return { type: 2, fileType: st.isApp ? 0x2000 : 0x1000 };
      return { type: 1, fileType: st.filetype ?? -1, st };
    } catch { return { type: 0, fileType: 0 }; }
  }
  /** check_file_bytes */
  static match(bytes, location, data, eofAllowed) {
    const extent = bytes.length, length = data.length;
    if (location + length > extent && (!eofAllowed || location >= extent)) return false;
    for (let i = 0; i < length; i++) {
      const b = location + i < extent ? bytes[location + i] : 0;
      if (b !== data[i]) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ check_patch
  async checkPatch(target, tp) {
    const { vfs } = this.env;
    let likely = ACTION.NONE;
    for (const file of tp.patch.files) {
      const path = target.outerDir + file.name;
      const { type, fileType } = this.info(path);
      let act = ACTION.UNKNOWN;
      switch (file.flavour) {
        case 'create':
          if (type === 0) act = ACTION.APPLY;
          else if (fileType === file.newType || file.newType === FT_DONTCARE) act = ACTION.REMOVE;
          else return ACTION.NONE;
          break;
        case 'delete':
          if (type === 0) act = ACTION.REMOVE;
          else if (fileType === file.oldType || file.oldType === FT_DONTCARE) act = ACTION.APPLY;
          else return ACTION.NONE;
          break;
        case 'replace':
          if (type === 0) return ACTION.NONE;
          if (file.oldType === FT_DONTCARE || file.newType === FT_DONTCARE) break;
          if (file.oldType === file.newType) { if (fileType !== file.oldType) return ACTION.NONE; }
          else if (fileType === file.oldType) act = ACTION.APPLY;
          else if (fileType === file.newType) act = ACTION.REMOVE;
          else return ACTION.NONE;
          break;
        case 'modify': {
          if (type === 0 || (fileType !== file.fileType && file.fileType !== FT_DONTCARE)) return ACTION.NONE;
          let local = path, scrap = null;
          if (file.transform) {
            scrap = local = this.scrap();
            if (await this.transform(path, scrap, file.transform, '_Prepare')) { this.deleteScrap(scrap); return ACTION.NONE; }
          }
          let bytes;
          try {
            if (!vfs.exists(local)) throw new Error(`File '${local}' not found`);
            bytes = await vfs.readFile(local);
          } catch (e) { await this.report(e.message); this.deleteScrap(scrap); return ACTION.NONE; }
          this.deleteScrap(scrap);
          for (const v of file.verifies) if (!Patcher.match(bytes, v.location, v.data, false)) return ACTION.NONE;
          for (const c of file.changes) {
            if (Patcher.match(bytes, c.location, c.old, true)) {
              if (act === ACTION.REMOVE) return ACTION.NONE;
              act = ACTION.APPLY;
            } else {
              if (act === ACTION.APPLY) return ACTION.NONE;
              if (Patcher.match(bytes, c.location, c.new, false)) act = ACTION.REMOVE;
              else if (act === ACTION.REMOVE) return ACTION.NONE;
            }
          }
          break;
        }
        default: break;
      }
      if (act === ACTION.APPLY) { if (likely === ACTION.REMOVE) return ACTION.NONE; likely = act; }
      else if (act === ACTION.REMOVE) { if (likely === ACTION.APPLY) return ACTION.NONE; likely = act; }
      else if (act === ACTION.NONE) return ACTION.NONE;
    }
    return likely;
  }
  deleteScrap(p) { if (p) try { if (this.env.vfs.exists(p)) this.env.vfs.delete(p, { force: true }); } catch { /* */ } }

  // ------------------------------------------------------------------ perform_patch
  async performPatch(target, tp) {
    const { vfs } = this.env;
    const action = tp.action;
    const typeOk = (have, want) => have === want || want === FT_DONTCARE;
    for (const file of tp.patch.files) {
      const path = target.outerDir + file.name;
      const { type, fileType } = this.info(path);
      const noFile = async () => { await this.report(`File '${path}' not found`); return false; };
      const badType = async () => { await this.report(this.err('BadFileType', path)); return false; };
      const create = async (contents) => {
        if (type !== 0) { await this.report(this.err('FileExists', path)); return false; }
        return !(await this.transform(contents, path, 'Copy', '_Finish'));
      };
      const del = async (want) => {
        if (type === 0) return noFile();
        if (!typeOk(fileType, want)) return badType();
        try { vfs.delete(path); return true; } catch (e) { await this.report(e.message); return false; }
      };
      const replace = async (want, contents) => {
        if (type === 0) return noFile();
        if (!typeOk(fileType, want)) return badType();
        return !(await this.transform(contents, path, 'Copy', '_Finish'));
      };
      let ok = true;
      switch (file.flavour) {
        case 'create': ok = action === ACTION.APPLY ? await create(file.newContents) : await del(file.newType); break;
        case 'delete': ok = action === ACTION.APPLY ? await del(file.oldType) : await create(file.oldContents); break;
        case 'replace': ok = action === ACTION.APPLY ? await replace(file.oldType, file.newContents) : await replace(file.newType, file.oldContents); break;
        case 'modify': {
          if (type === 0) return noFile();
          if (!typeOk(fileType, file.fileType)) return badType();
          const transform = file.transform ?? (file.changes.length ? 'Copy' : null);
          let local = path;
          if (transform) {
            local = this.scrap();
            if (await this.transform(path, local, transform, '_Prepare')) return false;
          }
          let bytes, lst;
          try {
            lst = vfs.stat(local);
            if (!lst) throw new Error(`File '${local}' not found`);
            bytes = new Uint8Array(await vfs.readFile(local));
          } catch (e) { await this.report(e.message); return false; }
          for (const v of file.verifies) {
            if (!Patcher.match(bytes, v.location, v.data, false)) { await this.report(this.err('VerifyFail', path)); return false; }
          }
          for (const c of file.changes) {
            const [from, to, eof, failTok] = action === ACTION.APPLY ? [c.old, c.new, true, 'OldFail'] : [c.new, c.old, false, 'NewFail'];
            if (!Patcher.match(bytes, c.location, from, eof)) { await this.report(this.err(failTok, path)); return false; }
            if (c.location + to.length > bytes.length) { const b = new Uint8Array(c.location + to.length); b.set(bytes); bytes = b; }
            bytes.set(to, c.location);
          }
          if (file.changes.length) {
            try { vfs.writeFile(local, bytes, { load: lst.load, exec: lst.exec }); }
            catch (e) { await this.report(`${this.err('WriteFail', local)}: ${e.message}`); return false; }
          }
          if (transform && (await this.transform(local, path, transform, '_Finish'))) return false;
          break;
        }
        default: break;
      }
      if (!ok) return false;
    }
    return true;
  }
}
