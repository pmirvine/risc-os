// Application framework: registry of JavaScript applications, their application directories
// in the VFS, sprites, file-type associations, and task start-up. See docs/CORE_API.md.

import { wimp } from './wimp.js';
import { vfs } from './vfs.js';
import { sysvars } from './sysvars.js';
import { sprites } from './sprites.js';
import { hex3 } from './filetypes.js';
import { os } from './os.js';
import { infoBox, saveAs, query, discardChanges, reportError } from './dialogs.js';
import { Menu, colourMenu } from './menu.js';

export class AppManager {
  constructor() {
    this.apps = [];            // registered descriptors
    this.running = new Map();  // app -> [tasks]
  }

  /** Load src/apps/index.js and register every app listed there. */
  async loadRegistry() {
    let list = [];
    try { list = (await import('../apps/index.js')).default ?? []; } catch (e) { console.error('apps/index.js failed', e); }
    await Promise.all(list.map(async (entry) => {
      try {
        const mod = typeof entry === 'string' ? await import(new URL('../apps/' + entry.replace(/^\.\//, ''), import.meta.url).href) : await entry();
        const d = mod.default ?? mod.app ?? mod;
        this.register(d, entry);
      } catch (e) {
        console.error(`App ${entry} failed to load`, e);
      }
    }));
  }

  /**
   * The RISC OS 3.71 ROM applications (Resources:$.Apps). Any that no JavaScript app has
   * registered for get a placeholder directory so the Apps viewer is complete.
   */
  ensureRomApps() {
    vfs.romAdd('Resources:$.Apps', { dir: true });
    vfs.romAdd('Resources:$.Resources', { dir: true });
    for (const n of ['Alarm', 'Chars', 'Configure', 'Draw', 'Edit', 'Help', 'Paint', 'Printers']) {
      const dir = `Resources:$.Apps.!${n}`;
      if (vfs.exists(dir)) continue;
      vfs.romAdd(dir, { dir: true });
      vfs.romAdd(dir + '.!Run', { filetype: 0xFEB, content: `| !Run file for !${n}\nError !${n} is not available in this version\n` });
      vfs.romAdd(dir + '.!Help', { filetype: 0xFFF, content: async () => { try { const r = await fetch(`assets/help/${n}.txt`); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch { /* */ } return new Uint8Array(0); } });
    }
  }

  /** Register an application descriptor (see CORE_API.md). */
  register(desc, source) {
    const d = { multiInstance: false, memory: 64, ...desc, _source: source };
    d.appName ??= '!' + d.name;
    d.dirVar ??= `${d.name}$Dir`;
    if (!d.appDir && !d.hidden) d.appDir = `Resources:$.Apps.${d.appName}`;
    if (d.appDir) d.appDir = d.appDir.replace(/\.$/, '');
    d.sprite ??= d.appName.toLowerCase();
    this.apps.push(d);
    // * commands provided by the app
    for (const [name, c] of Object.entries(d.commands ?? {})) {
      os.cli.register(name, typeof c === 'function' ? { run: c } : c);
    }
    // create the application directory in ROM if needed
    if (d.appDir && /^resources:/i.test(d.appDir) && !vfs.exists(d.appDir)) {
      const dir = vfs.romAdd(d.appDir, { dir: true });
      vfs.romAdd(dir + '.!Boot', { filetype: 0xFEB, content: `| !Boot file for ${d.appName}\nSet ${d.dirVar} <Obey$Dir>\n` });
      vfs.romAdd(dir + '.!Run', { filetype: 0xFEB, content: `| !Run file for ${d.appName}\nSet ${d.dirVar} <Obey$Dir>\nWimpSlot -min ${d.memory}K -max ${d.memory}K\nRun <${d.dirVar}>.!RunImage %*0\n` });
      if (d.help !== false) {
        const helpUrl = typeof d.help === 'string' ? d.help : `assets/help/${d.name}.txt`;
        vfs.romAdd(dir + '.!Help', { filetype: 0xFFF, content: async () => { try { const r = await fetch(helpUrl); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch { /* */ } return new TextEncoder().encode(`${d.name}\n`); } });
      }
      vfs.romAdd(dir + '.!RunImage', { filetype: 0xFFD, content: '' });
      for (const [leaf, f] of Object.entries(d.files ?? {})) vfs.romAdd(`${dir}.${leaf}`, f);
    }
    return d;
  }

  find(nameOrPath) {
    const l = String(nameOrPath).toLowerCase();
    return this.apps.find((a) => a.name.toLowerCase() === l || a.appName.toLowerCase() === l || a.appDir?.toLowerCase() === l) ?? null;
  }
  _byDir(path) {
    let c;
    try { c = vfs.canonical(path).toLowerCase(); } catch { c = String(path).toLowerCase(); }
    return this.apps.find((a) => a.appDir && (() => { try { return vfs.canonical(a.appDir).toLowerCase() === c; } catch { return false; } })()) ?? null;
  }

  /** "Boot" an app (Filer_Boot): sprites, variables, file types. Returns true if it is ours. */
  bootAppDir(path) {
    const d = this._byDir(path);
    if (!d) return false;
    this.boot(d);
    return true;
  }

  async boot(d) {
    if (d._booted) return d._booted;
    d._booted = (async () => {
      if (d.appDir) sysvars.set(d.dirVar, vfs.exists(d.appDir) ? vfs.canonical(d.appDir) : d.appDir);
      // sprites for the icon (and file types) - merged into the Wimp pool like *IconSprites
      for (const s of [].concat(d.sprites ?? [])) {
        try {
          if (typeof s === 'string' && /\.json$/.test(s)) { const [pool, file] = s.replace(/^assets\/sprites\//, '').replace(/\.json$/, '').split('/'); await sprites.addManifest(pool, file); }
          else if (typeof s === 'string') { if (vfs.exists(s)) sprites.addSpriteFile(await vfs.readFile(s), s); }
          else if (s.pool) await sprites.addManifest(s.pool, s.file ?? '!Sprites22');
        } catch (e) { console.warn('sprites for', d.name, e); }
      }
      // file types: names and run actions
      const types = Array.isArray(d.filetypes) ? Object.fromEntries(d.filetypes.map((t) => [t, {}])) : (d.filetypes ?? {});
      for (const [t, info] of Object.entries(types)) {
        const h = hex3(+t);
        if (info?.name) sysvars.set('File$Type_' + h, info.name);
        if (info?.run !== false) {
          const cur = sysvars.get('Alias$@RunType_' + h);
          if (cur == null || info?.override) sysvars.set('Alias$@RunType_' + h, `Run <${d.dirVar}>.!Run %*0`);
        }
      }
      try { await d.boot?.(os, d); } catch (e) { console.error(e); }
      os.filer?._rerender?.();
    })();
    return d._booted;
  }

  async bootAll() { await Promise.all(this.apps.map((d) => this.boot(d))); }

  /** *IconSprites on a path inside a registered app: satisfied by the app's own sprites. */
  iconSprites(path) {
    const l = path.toLowerCase();
    const d = this.apps.find((a) => a.appDir && l.startsWith(vfs.canonical(a.appDir).toLowerCase() + '.'));
    if (!d) return false;
    this.boot(d);
    return true;
  }

  /** *Run of an app directory or its !Run/!RunImage: start the JS app. Returns true if handled. */
  runPath(path, tail = '') {
    const l = path.toLowerCase();
    const d = this.apps.find((a) => {
      if (!a.appDir) return false;
      let dir;
      try { dir = vfs.canonical(a.appDir).toLowerCase(); } catch { return false; }
      return l === dir || l === dir + '.!run' || l === dir + '.!runimage';
    });
    if (!d) return false;
    this.start(d, tail);
    return true;
  }

  /**
   * Files dropped on a registered application's directory icon in a Filer viewer. Only apps whose descriptor
   * sets `appIconDrop: true` take them (the 3.71 Filer copies the files into the directory instead): a running
   * instance gets a DataLoad message (Message_DataLoad, window -1 = no window); otherwise the app is started
   * with the first file, as *Run <app> <file>. Returns true if the drop was given to the app.
   */
  dropOnApp(appPath, files) {
    const d = this._byDir(appPath);
    if (!d?.appIconDrop || !files?.length) return false;
    const [t] = this.tasksOf(d);
    const f = files[0];
    if (t) {
      wimp.sendMessage('DataLoad', { files, path: f.path, filetype: f.filetype, window: null, icon: null }, { to: t });
      return true;
    }
    this.start(d, `"${f.path}"`);
    return true;
  }

  /**
   * Shift-double-click: an app whose descriptor lists the file type in `edits` (e.g. !JsEdit for JSScript)
   * opens the file; double-clicking it still does what it did (runs it). Returns true if one did.
   */
  editFile(path, type) {
    const d = this.apps.find((a) => a.edits?.includes(type));
    if (!d) return false;
    this.start(d, `"${path}"`);
    return true;
  }

  /** Open a file with the app that handles a file type (used for Shift-double-click etc.). */
  openFile(path, type) {
    const d = this.apps.find((a) => {
      const t = Array.isArray(a.filetypes) ? a.filetypes : Object.keys(a.filetypes ?? {}).map(Number);
      return t.includes(type);
    });
    if (!d) return false;
    const claimed = wimp.sendMessage('DataOpen', { path, filetype: type, files: [{ path, filetype: type }] });
    if (!claimed) this.start(d, path);
    return true;
  }

  /**
   * Start an application. args: command tail (string). Resolves to the Task.
   * Single-instance apps that are already running get a 'run' event instead (and a DataOpen
   * if the tail names a file).
   */
  async start(d, args = '') {
    if (typeof d === 'string') d = this.find(d);
    if (!d) throw new Error('Application not found');
    await this.boot(d);
    const file = (args ?? '').trim().replace(/^"(.*)"$/, '$1') || null;
    const existing = (this.running.get(d) ?? []).filter((t) => t.alive);
    if (existing.length && !d.multiInstance) {
      const t = existing[0];
      t.emit('run', { args, file });
      if (file && vfs.exists(file)) {
        const st = vfs.stat(file);
        wimp.sendMessage('DataOpen', { path: st.path, filetype: st.filetype, files: [st] }, { to: t });
      }
      return t;
    }
    const task = wimp.createTask(d.name, { app: d, memory: d.memory });
    this.running.set(d, [...existing, task]);
    task.on('quit', () => this.running.set(d, (this.running.get(d) ?? []).filter((t) => t !== task)));
    // automatic DataOpen handling for declared file types
    if (d.open) {
      const types = Array.isArray(d.filetypes) ? d.filetypes : Object.keys(d.filetypes ?? {}).map(Number);
      task.onMessage('DataOpen', (msg) => { if (types.includes(msg.filetype)) { d.open(task, msg.path, msg); return true; } });
    }
    const ctx = { args, file: file && vfs.exists(file) ? vfs.canonical(file) : file, os, app: d, dir: d.appDir ? sysvars.get(d.dirVar) : null };
    try {
      let start = d.start;
      if (!start && d.load) { const m = await d.load(); start = m.default?.start ?? m.start ?? m.default; }
      if (typeof start !== 'function') throw new Error(`${d.name} has no start function`);
      await start(task, ctx);
    } catch (e) {
      console.error(e);
      reportError(e.message ?? String(e), { appName: d.name, category: 'error' });
      task.quit();
    }
    return task;
  }

  /** Tasks currently running for an app. */
  tasksOf(d) { return (this.running.get(typeof d === 'string' ? this.find(d) : d) ?? []).filter((t) => t.alive); }
}

// Convenience helpers exported for apps
export { Menu, colourMenu, infoBox, saveAs, query, discardChanges, reportError };

export const apps = new AppManager();
