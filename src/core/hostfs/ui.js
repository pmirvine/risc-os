// HostFS on the desktop: the permanent HostFS icon on the icon bar (Select: mount a folder), an icon for
// each mounted folder (Select: open it, Menu: Rescan / Free / Dismount), folders dropped onto the page,
// mounts remembered across reloads, and the *HostFS, *HostMount, *HostDismount, *HostMounts commands.

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

const report = (msg) => wimp.reportError(msg, { appName: APP });

export async function initHostFS() {
  task = wimp.createTask(APP, { kind: 'module', memory: 0 });
  const main = wimp.iconbar.add({
    task, side: 'left', priority: 0x4C000000, sprite: 'network', text: 'HostFS',
    help: 'This is the HostFS icon.|MClick SELECT to mount a folder from this computer.|MClick MENU for other mounting options.|MThe file Docs.HostFS on the hard disc explains HostFS.',
    onClick: () => pickFolder(),
  });
  main.menu = () => mainMenu();
  installCommands();
  installDrop();
  window.addEventListener('focus', () => { for (const v of os.filer.viewers.values()) vfs.revalidate(v.path); });
  os.hostfs = { hostfs, pickFolder, pickReadOnly, mountBackend, dismount: (name) => dismountSlot(slotByName(name)), slots };
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
function addSlot(s) { slots.push(s); layout(); return s; }
function removeSlot(s) {
  const i = slots.indexOf(s);
  if (i < 0) return;
  slots.splice(i, 1);
  if (s.icon) wimp.iconbar.remove(s.icon);
  s.icon = null;
  layout();
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
    { text: s.state === 'offline' ? 'Forget' : 'Dismount', shaded: s.state === 'scanning', action: () => dismountSlot(s) },
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

function mainMenu() {
  const serverItems = (server?.mounts ?? []).map((m) => {
    const s = slots.find((x) => x.id === `server:${m.name}`);
    return { text: m.name + (m.readonly ? ' (read-only)' : ''), ticked: !!s, action: () => (s ? dismountSlot(s) : mountServer(m)) };
  });
  return new Menu('HostFS', [
    { text: 'Mount folder...', shaded: !FSABackend.supported, action: () => pickFolder() },
    { text: 'Mount read-only...', action: () => pickReadOnly() },
    { text: 'Server folders', shaded: !serverItems.length, showArrowWhenShaded: true, submenu: serverItems.length ? new Menu('Server', serverItems) : null },
  ]);
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
  if (record) await hostfs.store.put({ ...record, id: s.id, name: s.name });
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
  const s = await mountBackend(new ServerBackend(m, server.token), { id, name: hostfs.uniqueName(m.name), open, record: { kind: 'server', server: m.name, dismounted: false } });
  return s;
}

async function reconnect(s) {
  const backend = new FSABackend(s.handle, { readonly: !!s.readonly });
  if (await backend.permission(true) !== 'granted') { report(`Permission to use '${s.name}' was refused`); return; }
  await mountBackend(backend, { slot: s });
}

async function dismountSlot(s) {
  if (!s) throw new CLIError('No HostFS folder of that name is mounted');
  if (s.state === 'scanning') return;
  if (s.mount) {
    const key = s.mount.disc.key;
    for (const v of [...os.filer.viewers.values()]) if (v.path.toLowerCase().startsWith(key)) v.close();
    await hostfs.dismount(s.mount);
  }
  removeSlot(s);
  if (s.id.startsWith('server:')) await hostfs.store.put({ id: s.id, kind: 'server', server: s.id.slice(7), dismounted: true });
  else await hostfs.store.del(s.id);
}

/** Start-up: server folders (unless dismounted last time) and remembered picked folders. */
async function restore() {
  const recs = await hostfs.store.all();
  server = await serverInfo();
  for (const m of server?.mounts ?? []) {
    const r = recs.find((x) => x.id === `server:${m.name}`);
    if (!r?.dismounted) await mountServer(m, { open: false });
  }
  if (!FSABackend.supported) return;
  for (const r of recs.filter((x) => x.kind === 'fsa' && x.handle)) {
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
      server ??= await serverInfo();
      const m = server?.mounts.find((x) => x.name.toLowerCase() === a[0].toLowerCase());
      if (!m) throw new CLIError(`The server has no HostFS folder called '${a[0]}'`, 0x108D5);
      const s = slots.find((x) => x.id === `server:${m.name}`);
      if (s) return;
      await mountServer(m, { open: false });
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
