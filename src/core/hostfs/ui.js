// HostFS on the desktop: an icon on the left of the icon bar for each mounted folder (Select: open it, Menu:
// Rescan / Free / Mount at start-up / Dismount / Forget), folders dropped onto the page, mounts remembered across
// reloads (each mounted again at start-up unless that's turned off), and the *HostFS, *HostMount, *HostDismount,
// *HostMounts commands. Mounting and the list of mounts are the application $.Utilities.!HostFS
// (src/apps/HostFS), through os.hostfs; the mounts don't need it to be running, as ShareFS's discs don't need
// !Access+.

import { wimp } from '../wimp.js';
import { vfs } from '../vfs.js';
import { Menu } from '../menu.js';
import { query } from '../dialogs.js';
import { os } from '../os.js';
import { cli, CLIError } from '../cli.js';
import { hostfs } from './hostfs.js';
import { FSABackend } from './fsa.js';
import { ServerBackend, serverInfo } from './server.js';
import { FilesBackend } from './files.js';

const APP = 'HostFS Filer';
let task = null;
let server = null;            // {token, mounts} from serve.mjs, or null
const slots = [];             // {id, name, state: 'scanning'|'mounted'|'offline', mount, handle, icon}
const listeners = new Set();  // told when mounts change (the !HostFS Mounts window)
let records = [];             // remembered mounts (the IndexedDB store): {id, kind: 'fsa'|'server', name, handle, server, readonly, startup}
const notify = () => { for (const f of listeners) { try { f(); } catch (e) { console.warn(e); } } };

const report = (msg) => wimp.reportError(msg, { appName: APP });

export async function initHostFS() {
  task = wimp.createTask(APP, { kind: 'module', memory: 0 });
  installCommands();
  installDrop();
  window.addEventListener('focus', () => { for (const v of os.filer.viewers.values()) vfs.revalidate(v.path); });
  os.hostfs = {
    hostfs, pickFolder, pickReadOnly, mountBackend, slots,
    dismount: (name) => dismountSlot(slotByName(name)),
    // for !HostFS
    list: mountList, setStartup, mountRemembered, forget, serverFolders, mountServerFolder: (name) => mountServerByName(name),
    supportsPicking: () => FSABackend.supported,
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };
  restore().catch((e) => console.warn('HostFS restore', e));
}

// ---------------------------------------------------------------- icon bar
function layout() {
  slots.forEach((s, i) => {
    const sprite = s.state === 'offline' ? 'nodisc' : 'harddisc';
    const priority = 0x4B000000 - i * 0x100;
    if (s.icon && s.icon.priority !== priority) { wimp.iconbar.remove(s.icon); s.icon = null; }
    if (!s.icon) {
      s.icon = wimp.iconbar.add({ task, side: 'left', priority, sprite, text: s.name, onClick: () => clickSlot(s) });
      s.icon.menu = () => slotMenu(s);
      s.icon.onDataLoad = (ev) => {
        if (s.state !== 'mounted') return;
        import('../fileraction.js').then(({ fileAction }) => fileAction(ev.shift ? 'move' : 'copy', ev.files.map((f) => f.path), s.mount.disc.prefix + '$', os.filer.options));
      };
    } else wimp.iconbar.update(s.icon, { sprite, text: s.name });
    s.icon.help = s.state === 'offline'
      ? `This is the HostFS folder '${s.name}'.|MThe browser needs your permission to use it again: click SELECT to give it.`
      : `This is the HostFS folder '${s.name}'${s.mount?.readonly ? ' (read-only)' : ''}.|MClick SELECT to open it.|MClick MENU to rescan or dismount it.`;
  });
}
function addSlot(s) { slots.push(s); layout(); notify(); return s; }
function removeSlot(s) {
  const i = slots.indexOf(s);
  if (i < 0) return;
  slots.splice(i, 1);
  if (s.icon) wimp.iconbar.remove(s.icon);
  s.icon = null;
  layout();
  notify();
}
const slotByName = (name) => slots.find((s) => s.name.toLowerCase() === String(name ?? '').replace(/^hostfs::/i, '').replace(/\.\$.*$/, '').toLowerCase());

function clickSlot(s) {
  if (s.state === 'mounted') os.filer.openDir(s.mount.disc.prefix + '$');
  else if (s.state === 'offline') reconnect(s);
}

function slotMenu(s) {
  const mounted = s.state === 'mounted';
  return new Menu(`HostFS::${s.name}`, [
    { text: 'Open $', shaded: !mounted, action: () => clickSlot(s) },
    { text: 'Rescan', shaded: !mounted, action: () => s.mount.rescan(s.mount.root, { deep: true }).catch((e) => report(e.message)) },
    { text: 'Free', shaded: !mounted, action: () => os.free?.showDisc?.(s.mount.disc) },
    ...(recordFor(s.id) ? [{ text: 'Mount at start-up', ticked: () => recordFor(s.id)?.startup !== false, action: () => setStartup(s.id, recordFor(s.id)?.startup === false) }] : []),
    { text: 'Dismount', shaded: s.state === 'scanning', action: () => dismountSlot(s) },
    ...(s.id.startsWith('server:') || !recordFor(s.id) ? [] : [{ text: 'Forget', action: () => forget(s.id) }]),
    ...(mounted && s.mount.backend.kind === 'fsa' && s.mount.readonly ? [{ text: 'Allow changes', action: () => allowChanges(s) }] : []),
  ]);
}

/** A folder mounted read-only because write access couldn't be asked for (dropped): ask now (menu click). */
async function allowChanges(s) {
  const backend = new FSABackend(s.handle);
  if (await backend.permission(true) !== 'granted') { report(`Permission to change '${s.name}' was refused`); return; }
  const key = s.mount.disc.key;
  for (const v of [...os.filer.viewers.values()]) if (v.path.toLowerCase().startsWith(key)) v.close();
  await hostfs.dismount(s.mount);
  s.mount = null;
  await mountBackend(backend, { slot: s });
}

// ---------------------------------------------------------------- remembered mounts (for !HostFS)
const recordFor = (id) => records.find((r) => r.id === id) ?? null;
async function putRecord(rec) {
  records = [...records.filter((r) => r.id !== rec.id), rec];
  await hostfs.store.put(rec);
  notify();
}

/** Every mount, mounted or remembered: {id, name, kind, state, readonly, startup, remembered}. */
function mountList() {
  const out = slots.map((s) => {
    const r = recordFor(s.id);
    return { id: s.id, name: s.name, kind: s.id.startsWith('server:') ? 'server' : s.mount?.backend.kind ?? r?.kind ?? 'fsa', state: s.state, readonly: !!(s.mount?.readonly ?? s.readonly), startup: r ? r.startup !== false : null, remembered: !!r };
  });
  for (const r of records) {
    if (out.some((o) => o.id === r.id)) continue;
    if (r.kind === 'server' && !(server?.mounts ?? []).some((m) => `server:${m.name}` === r.id)) continue;   // not on this server
    out.push({ id: r.id, name: r.name ?? r.server ?? r.id, kind: r.kind, state: 'dismounted', readonly: !!r.readonly, startup: r.startup !== false, remembered: true });
  }
  for (const m of server?.mounts ?? []) {
    const id = `server:${m.name}`;
    if (!out.some((o) => o.id === id)) out.push({ id, name: m.name, kind: 'server', state: 'dismounted', readonly: !!m.readonly, startup: true, remembered: false });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base' }));
}

/** Mount this one when the desktop starts? */
async function setStartup(id, on) {
  const r = recordFor(id) ?? (id.startsWith('server:') ? { id, kind: 'server', server: id.slice(7) } : null);
  if (!r) return;
  await putRecord({ ...r, startup: !!on, dismounted: undefined });
}

/** Mount a remembered (or server) folder again. A picked folder may need the browser's permission: call from a click. */
async function mountRemembered(id) {
  if (slots.some((s) => s.id === id && s.state === 'mounted')) return slots.find((s) => s.id === id);
  if (id.startsWith('server:')) return mountServerByName(id.slice(7));
  const off = slots.find((s) => s.id === id && s.state === 'offline');
  if (off) return reconnect(off);
  const r = recordFor(id);
  if (!r?.handle) return null;
  const backend = new FSABackend(r.handle, { readonly: !!r.readonly });
  if (await backend.permission(true) !== 'granted') { report(`Permission to use '${r.name}' was refused`); return null; }
  const s = await mountBackend(backend, { id, name: hostfs.uniqueName(r.name) });
  if (s) s.handle = r.handle;
  return s;
}

/** Dismount it (if it's mounted) and don't remember it. */
async function forget(id) {
  const s = slots.find((x) => x.id === id);
  if (s) await dismountSlot(s, { forget: true });
  records = records.filter((r) => r.id !== id);
  await hostfs.store.del(id);
  notify();
}

async function serverFolders() {
  server ??= await serverInfo();
  return server?.mounts ?? [];
}
async function mountServerByName(name) {
  server ??= await serverInfo();
  const m = server?.mounts.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!m) throw new CLIError(`The server has no HostFS folder called '${name}'`, 0x108D5);
  const s = slots.find((x) => x.id === `server:${m.name}`);
  if (s) return s;
  return mountServer(m, { open: false });
}

// ---------------------------------------------------------------- mounting
const onLarge = async (count) => (await query({
  task, title: APP,
  message: `This folder holds more than ${hostfs.largeTree.toLocaleString('en-GB')} files and directories. Mounting it may be slow and use a lot of memory.`,
  buttons: ['Continue', 'Cancel'],
})) === 'Continue';

/**
 * Mount a backend with an icon. opts: {id, name, record (IndexedDB record to keep), open}. Resolves the slot.
 */
export async function mountBackend(backend, { id, name, record, open = true, slot } = {}) {
  name ??= hostfs.uniqueName(backend.label);
  const s = slot ?? addSlot({ id: id ?? `${backend.kind}:${Date.now()}`, name, state: 'scanning' });
  s.state = 'scanning'; layout();
  let m;
  try { m = await hostfs.mount(backend, { id: s.id, name: s.name, onLarge }); } catch (e) { removeSlot(s); report(`Can't mount '${backend.label}': ${e.message ?? e}`); return null; }
  if (!m) { removeSlot(s); return null; }
  Object.assign(s, { state: 'mounted', mount: m });
  layout();
  notify();
  if (record) await putRecord({ startup: true, ...recordFor(s.id), ...record, id: s.id, name: s.name });
  if (open) os.filer.openDir(m.disc.prefix + '$');
  return s;
}

/** Select on the HostFS icon: pick a folder (File System Access API), or a read-only one elsewhere. */
export async function pickFolder() {
  if (!FSABackend.supported) return pickReadOnly();
  let h;
  try { h = await globalThis.showDirectoryPicker({ id: 'riscos-hostfs', mode: 'readwrite' }); } catch (e) {
    if (e?.name !== 'AbortError') report(e.message ?? String(e));
    return null;
  }
  return mountHandle(h);
}

async function mountHandle(h) {
  for (const s of slots) if (s.handle && await s.handle.isSameEntry(h).catch(() => false)) { clickSlot(s); return s; }
  let backend = new FSABackend(h);
  if (await backend.permission(true) !== 'granted') {
    backend = new FSABackend(h, { readonly: true });
    if (await backend.permission(true) !== 'granted') { report(`Permission to use '${h.name}' was refused`); return null; }
  }
  // (a dropped folder can't ask for write access: a drop isn't a click. It mounts read-only for now, with
  // "Allow changes" on its menu, and isn't remembered as read-only.)
  const s = await mountBackend(backend, { record: { kind: 'fsa', handle: h } });
  if (s) s.handle = h;
  return s;
}

/** A read-only snapshot of a folder (<input type=file webkitdirectory>): any browser. */
export function pickReadOnly() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      input.remove();
      if (!input.files?.length) return resolve(null);
      resolve(await mountBackend(FilesBackend.fromFileList(input.files)));
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    input.click();
  });
}

async function mountServer(m, { open = true } = {}) {
  const id = `server:${m.name}`;
  const s = await mountBackend(new ServerBackend(m, server.token), { id, name: hostfs.uniqueName(m.name), open, record: { kind: 'server', server: m.name } });
  return s;
}

async function reconnect(s) {
  const backend = new FSABackend(s.handle, { readonly: !!s.readonly });
  if (await backend.permission(true) !== 'granted') { report(`Permission to use '${s.name}' was refused`); return; }
  await mountBackend(backend, { slot: s });
}

/** Dismount: it stays in !HostFS's list (unless forgotten), no longer mounted at start-up. */
async function dismountSlot(s, { forget: forgetting = false } = {}) {
  if (!s) throw new CLIError('No HostFS folder of that name is mounted');
  if (s.state === 'scanning') return;
  if (s.mount) {
    const key = s.mount.disc.key;
    for (const v of [...os.filer.viewers.values()]) if (v.path.toLowerCase().startsWith(key)) v.close();
    await hostfs.dismount(s.mount);
  }
  removeSlot(s);
  if (forgetting) return;
  const r = recordFor(s.id) ?? (s.id.startsWith('server:') ? { id: s.id, kind: 'server', server: s.id.slice(7) } : null);
  if (r) await putRecord({ ...r, startup: false, dismounted: undefined });
}

/** Start-up: server folders (unless dismounted last time) and remembered picked folders. */
async function restore() {
  // (records from before the start-up choice: dismounted server folders stay so)
  records = (await hostfs.store.all()).map((r) => (r.startup == null && r.dismounted != null ? { ...r, startup: !r.dismounted } : r));
  server = await serverInfo();
  notify();
  for (const m of server?.mounts ?? []) {
    const r = recordFor(`server:${m.name}`);
    if (r?.startup !== false) await mountServer(m, { open: false });
  }
  if (!FSABackend.supported) return;
  for (const r of records.filter((x) => x.kind === 'fsa' && x.handle && x.startup !== false)) {
    const backend = new FSABackend(r.handle, { readonly: !!r.readonly });
    const p = await backend.permission(false);
    if (p === 'granted') {
      const s = await mountBackend(backend, { id: r.id, name: hostfs.uniqueName(r.name), open: false });
      if (s) s.handle = r.handle;
    } else if (p === 'prompt') addSlot({ id: r.id, name: hostfs.uniqueName(r.name), state: 'offline', handle: r.handle, readonly: !!r.readonly });
  }
}

// ---------------------------------------------------------------- folders dropped onto the page
function installDrop() {
  const files = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (e.defaultPrevented || !files(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    if (e.defaultPrevented || !files(e)) return;
    e.preventDefault();
    // both must be asked for before the handler returns (the DataTransfer is emptied afterwards)
    const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
    const handles = items.map((i) => i.getAsFileSystemHandle?.() ?? null);
    const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
    (async () => {
      let dirs = 0;
      for (let i = 0; i < items.length; i++) {
        const h = await handles[i]?.catch(() => null);
        if (h?.kind === 'directory') { dirs++; await mountHandle(h); continue; }
        if (!h && entries[i]?.isDirectory) {
          dirs++;
          try { await mountBackend(await FilesBackend.fromEntry(entries[i])); } catch (err) { report(err.message ?? String(err)); }
        }
      }
      if (!dirs) report('To mount a folder with HostFS, drop the folder itself onto the desktop.');
    })();
  });
}

// ---------------------------------------------------------------- * commands
function installCommands() {
  cli.register('HostFS', {
    syntax: 'Syntax: *HostFS', help: '*HostFS selects the HostFS filing system (the first mounted host folder).',
    run: async () => {
      const s = slots.find((x) => x.state === 'mounted');
      if (!s) throw new CLIError('No HostFS folders are mounted', 0x108D5);
      vfs.setCSD(s.mount.disc.prefix + '$'); vfs.currentFS = 'HostFS';
    },
  });
  cli.register('HostMount', {
    syntax: 'Syntax: *HostMount [<server folder>]',
    help: '*HostMount mounts a folder from this computer as HostFS::<name>. With no name it asks for a folder; with a name it mounts that folder from the local server (serve.mjs --host <name>=<path>).',
    max: 1,
    run: async (a) => {
      if (!a[0]) { await pickFolder(); return; }
      await mountServerByName(a[0]);
    },
  });
  const dismountCmd = async (a) => { await dismountSlot(slotByName(a[0])); };
  cli.register('HostDismount', { syntax: 'Syntax: *HostDismount <disc name>', help: '*HostDismount dismounts a HostFS folder.', min: 1, max: 1, run: dismountCmd });
  // *Dismount: HostFS discs are dismounted, anything else is ignored as before
  const old = cli.find('Dismount');
  cli.register('Dismount', {
    syntax: 'Syntax: *Dismount [<disc spec>]', help: '*Dismount ensures that it is safe to finish using a disc.',
    run: async (a, ctx) => {
      const spec = a[0] ?? '';
      const host = /^hostfs:/i.test(spec) || (spec.startsWith(':') && vfs.currentFS === 'HostFS');
      if (host && slotByName(spec.replace(/^:/, ''))) return dismountCmd([spec.replace(/^:/, '')]);
      return old?.run?.(a, ctx);
    },
  });
  cli.register('HostMounts', {
    syntax: 'Syntax: *HostMounts', help: '*HostMounts lists the mounted HostFS folders.',
    run: async (a, { out }) => {
      if (!slots.length) { out.writeln('No HostFS folders are mounted'); return; }
      const kinds = { fsa: 'folder', server: 'server folder', files: 'read-only snapshot' };
      for (const s of slots) {
        const what = s.state === 'offline' ? 'needs permission (click its icon)' : s.state === 'scanning' ? 'scanning' : `${kinds[s.mount.backend.kind]}${s.mount.readonly ? ', read-only' : ''}`;
        out.writeln(`HostFS::${s.name.padEnd(12)} ${what}`);
      }
    },
  });
}
