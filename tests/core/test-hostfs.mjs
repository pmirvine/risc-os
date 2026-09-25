// HostFS: host folders mounted as HostFS::<name>. Runs its own server (serve.mjs --host Test=<tmp dir>) and
// checks the server backend against the real folder, then the File System Access backend against the
// origin-private file system (the same handle API a picked folder has).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './pw.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 8300 + Math.floor(Math.random() * 60);
const URL0 = `http://localhost:${PORT}/`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostfs-'));
const put = (p, s, mtime) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); if (mtime) fs.utimesSync(path.join(dir, p), mtime, mtime); };
put('Read Me.txt', 'Hello from the host\n');
put('Sprites,ff9', 'x');
put('photo.png', 'png');
put('Prog,00008000-12345678', 'code');
put('a b#c', 'odd name');
put('Sub/inner.html', '<p>hi</p>', new Date('1997-02-19T12:00:00Z'));
put('.DS_Store', 'junk');
put('!MyApp/!Run,feb', 'Set MyApp$Ran yes\n');
put('Prog.bas,ffb', '');
put('R&D.txt', 'rd'); put('日本.txt', 'jp'); put('Notes,fff', 'suffixed'); put('Notes', 'plain');
put('File', 'old'); put('A', 'a-content'); put('B', 'b-content'); put('ro.txt', 'ro'); fs.chmodSync(path.join(dir, 'ro.txt'), 0o444);

const server = spawn(process.execPath, ['serve.mjs', String(PORT), '--host', `Test=${dir}`], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL0)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }

const results = [];
const ok = (name, v) => results.push(`${v ? 'PASS' : 'FAIL'} ${name}`);
const { browser, page, logs } = await launch();
try {
  await page.goto(URL0 + '?fast=1');
  await page.waitForFunction(() => window.os?.hostfs?.slots?.some((s) => s.state === 'mounted'), null, { timeout: 20000 });

  // ---------------------------------------------------------------- server backend: reading
  const r = await page.evaluate(async () => {
    const v = os.vfs;
    const names = v.list('HostFS::Test.$').map((i) => i.name);
    const t = (p) => v.stat(p)?.filetype;
    return {
      names,
      readme: t('HostFS::Test.$.Read\xa0Me/txt'),
      sprites: t('HostFS::Test.$.Sprites'),
      png: t('HostFS::Test.$.photo/png'),
      untyped: (() => { const s = v.stat('HostFS::Test.$.Prog'); return s && [s.filetype, s.load.toString(16), s.exec.toString(16)]; })(),
      inner: t('HostFS::Test.$.Sub.inner/html'),
      innerYear: v.stat('HostFS::Test.$.Sub.inner/html')?.date.getUTCFullYear(),
      text: await v.readText('HostFS::Test.$.Read\xa0Me/txt'),
      app: v.stat('HostFS::Test.$.!MyApp')?.isApp,
      cat: await (async () => { let s = ''; await os.cli.run('Cat HostFS::Test.$', { out: { write: (x) => { s += x; }, writeln: (x) => { s += x + '\n'; } } }); return s; })(),
    };
  });
  ok('hidden .DS_Store', !r.names.includes('/DS_Store'));
  ok('space -> hard space, # -> ?', r.names.includes('Read\xa0Me/txt') || r.names.includes('Read Me/txt'));
  ok('odd name mapped', r.names.includes('a\xa0b?c'));
  ok('.txt is Text', r.readme === 0xfff);
  ok(',ff9 suffix is Sprite', r.sprites === 0xff9);
  ok('.png by extension', r.png === 0xb60);
  ok('load-exec suffix untyped', r.untyped && r.untyped[0] === -1 && r.untyped[1] === '8000' && r.untyped[2] === '12345678');
  ok('.html in subdirectory', r.inner === 0xfaf);
  ok('host date kept', r.innerYear === 1997);
  ok('file contents', r.text === 'Hello from the host\n');
  ok('application directory', r.app === true);
  ok('*Cat works', /Test/.test(r.cat));
  ok('guide on the hard disc', await page.evaluate(() => os.vfs.stat('ADFS::HardDisc4.$.Docs.HostFS')?.filetype === 0xfff));

  // ---------------------------------------------------------------- server backend: writing
  await page.evaluate(async () => {
    const v = os.vfs;
    v.writeFile('HostFS::Test.$.Letter', 'Dear host', { filetype: 0xfff });
    v.writeFile('HostFS::Test.$.Pic', new Uint8Array([1, 2, 3]), { filetype: 0xff9 });
    v.writeFile('HostFS::Test.$.page/html', '<b>x</b>', { filetype: 0xfaf });
    v.writeFile('HostFS::Test.$.notpng/png', 'text!', { filetype: 0xfff });
    v.mkdir('HostFS::Test.$.NewDir');
    v.writeFile('HostFS::Test.$.NewDir.Deep', 'deep', { filetype: 0xffd });
    v.rename('HostFS::Test.$.Sub', 'HostFS::Test.$.Renamed');
    v.setType('HostFS::Test.$.Letter', 0xffb);
    v.delete('HostFS::Test.$.photo/png');
    await v.copy('ADFS::HardDisc4.$.!Boot.!Run', 'HostFS::Test.$.BootRun');
    await os.hostfs.hostfs.mounts[0].flush();
  });
  const has = (p) => fs.existsSync(path.join(dir, p));
  ok('text file written without suffix', has('Letter,ffb') && !has('Letter'));
  ok('sprite written with ,ff9', has('Pic,ff9') && fs.readFileSync(path.join(dir, 'Pic,ff9')).length === 3);
  ok('HTML written as page.html', has('page.html'));
  ok('Text named /png gets ,fff', has('notpng.png,fff'));
  ok('directory created', has('NewDir/Deep,ffd'));
  ok('directory renamed', has('Renamed/inner.html') && !has('Sub'));
  ok('file deleted', !has('photo.png'));
  ok('copied from the hard disc', has('BootRun,feb'));
  ok('contents', fs.readFileSync(path.join(dir, 'Letter,ffb'), 'latin1') === 'Dear host');

  // ---------------------------------------------------------------- sequences that must not lose host files
  const seq = await page.evaluate(async () => {
    const v = os.vfs, P = 'HostFS::Test.$.';
    v.writeFile(P + 'Temp', 'new', { filetype: 0xffd });          // save via a temporary file
    v.delete(P + 'File');
    v.rename(P + 'Temp', P + 'File');
    v.rename(P + 'A', P + 'T'); v.rename(P + 'B', P + 'A'); v.rename(P + 'T', P + 'B');   // swap two names
    v.stamp(P + 'R&D/txt'.replace('&', '_')); v.setType(P + '__/txt', 0xfff);           // names shown with '_'
    const notes = v.stat(P + 'Notes');
    v.writeFile(P + 'Notes', 'saved', { filetype: 0xfff });          // one of two host files that are both "Notes"
    await os.hostfs.hostfs.mounts[0].flush();
    let crossSite = null;
    try { crossSite = (await fetch('/__hostfs/Test/A', { headers: {} })).status; } catch { /* */ }
    return { notesVisible: !!notes, ro: v.stat(P + 'ro/txt'), crossSite };
  });
  const rd = (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; } };
  ok('save via temporary file keeps the file', rd('File,ffd') === 'new' && !has('File') && !has('Temp,ffd'));
  ok('swapped names keep both files', rd('A') === 'b-content' && rd('B') === 'a-content');
  ok('names RISC OS shows with _ are kept', has('R&D.txt') && has('日本.txt') && !has('R_D.txt') && !has('__.txt'));
  ok('hidden clash not overwritten', seq.notesVisible && [rd('Notes'), rd('Notes,fff')].sort().join() === ['plain', 'saved'].sort().join() || [rd('Notes'), rd('Notes,fff')].sort().join() === ['saved', 'suffixed'].sort().join());
  ok('read-only host file is locked', seq.ro?.locked === true);
  const cs = await fetch(URL0 + '__hostfs/Test/A', { headers: { 'Sec-Fetch-Site': 'cross-site' } }).then((r) => r.status);
  ok('cross-site read refused', cs === 403);

  // ---------------------------------------------------------------- changes made on the host
  put('FromHost.txt', 'new on host');
  fs.rmSync(path.join(dir, 'a b#c'));
  await page.evaluate(async () => { await os.hostfs.hostfs.mounts[0].rescan(undefined, { deep: true }); });
  const h = await page.evaluate(() => [os.vfs.exists('HostFS::Test.$.FromHost/txt'), os.vfs.exists('HostFS::Test.$.a\xa0b?c')]);
  ok('host addition seen', h[0]);
  ok('host deletion seen', !h[1]);

  // ---------------------------------------------------------------- running an application from HostFS
  const ran = await page.evaluate(async () => { await os.cli.run('Run HostFS::Test.$.!MyApp'); return os.sysvars.get('MyApp$Ran'); });
  ok('!Run of an app on HostFS', ran === 'yes');

  // ---------------------------------------------------------------- dismount
  const d = await page.evaluate(async () => { os.filer.openDir('HostFS::Test.$'); await os.hostfs.dismount('Test'); return [os.vfs.exists('HostFS::Test.$'), [...os.filer.viewers.keys()].some((k) => k.startsWith('hostfs'))]; });
  ok('dismounted', !d[0] && !d[1]);

  // ---------------------------------------------------------------- File System Access backend (OPFS)
  const f = await page.evaluate(async () => {
    const { FSABackend } = await import('/src/core/hostfs/fsa.js');
    const root = await navigator.storage.getDirectory();
    for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    const w = await (await root.getFileHandle('notes.txt', { create: true })).createWritable(); await w.write('opfs notes'); await w.close();
    await root.getDirectoryHandle('Docs', { create: true });
    const s = await os.hostfs.mountBackend(new FSABackend(root), { name: 'OPFS', open: false });
    const m = s.mount, v = os.vfs;
    const out = { text: await v.readText('HostFS::OPFS.$.notes/txt'), type: v.stat('HostFS::OPFS.$.notes/txt')?.filetype };
    v.writeFile('HostFS::OPFS.$.Docs.Draw1', new Uint8Array(10), { filetype: 0xaff });
    v.rename('HostFS::OPFS.$.notes/txt', 'HostFS::OPFS.$.Notes/txt');
    v.rename('HostFS::OPFS.$.Docs', 'HostFS::OPFS.$.Papers');
    await m.flush();
    const names = async (d) => { const a = []; for await (const [n] of d.entries()) a.push(n); return a.sort(); };
    out.root = await names(root);
    out.papers = await names(await root.getDirectoryHandle('Papers'));
    await os.hostfs.dismount('OPFS');
    return out;
  });
  ok('FSA: read', f.text === 'opfs notes' && f.type === 0xfff);
  ok('FSA: case-only rename', f.root.includes('Notes.txt') && !f.root.includes('notes.txt'));
  ok('FSA: directory rename (copy + delete)', f.root.includes('Papers') && !f.root.includes('Docs'));
  ok('FSA: write with suffix', f.papers.includes('Draw1,aff'));

  // ---------------------------------------------------------------- remembered across a reload
  await page.evaluate(async () => {
    const { FSABackend } = await import('/src/core/hostfs/fsa.js');
    const root = await navigator.storage.getDirectory();
    await os.hostfs.mountBackend(new FSABackend(root), { name: 'Kept', open: false, record: { kind: 'fsa', handle: root } });
    os.pinboard.pin('HostFS::Kept.$.Papers.Draw1', 300, 300);
  });
  await page.reload();
  await page.waitForFunction(() => window.os?.hostfs?.slots?.some((s) => s.name === 'Kept' && s.state === 'mounted'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(100);
  const k = await page.evaluate(() => ({ slots: os.hostfs.slots.map((s) => `${s.name}:${s.state}`), papers: os.vfs.exists('HostFS::Kept.$.Papers.Draw1'), pinned: os.pinboard.pins.some((p) => /Kept/.test(p.path)) }));
  ok('pin on a HostFS folder back after reload', k.pinned);
  ok('picked folder remounted after reload', k.slots.includes('Kept:mounted') && k.papers);
  ok('dismounted server folder stays dismounted', !k.slots.some((s) => s.startsWith('Test')));

  // ---------------------------------------------------------------- commands
  const c = await page.evaluate(async () => {
    let s = '';
    const out = { write: (x) => { s += x; }, writeln: (x) => { s += x + '\n'; } };
    await os.cli.run('HostMount Test', { out });
    const mounted = os.vfs.exists('HostFS::Test.$.Letter');
    await os.cli.run('HostMounts', { out });
    await os.cli.run('Dismount HostFS::Kept', { out });
    await os.cli.run('Dismount :4', { out });            // not HostFS: still harmless
    await os.cli.run('HostFS', { out });
    await new Promise((r) => setTimeout(r, 50));
    const saved = localStorage.getItem('riscos371.pinboard') ?? JSON.stringify(os.pinboard.parked);
    const parked = os.pinboard.parked.some((p) => /Kept/.test(p.path)) && !os.pinboard.pins.some((p) => /Kept/.test(p.path));
    os.pinboard.clear();
    return { mounted, list: s, kept: os.vfs.exists('HostFS::Kept.$'), csd: os.vfs.csd, parked, saved };
  });
  ok('*HostMount <server folder>', c.mounted);
  ok('*HostMounts', /HostFS::Test\s+server folder/.test(c.list) && /HostFS::Kept\s+folder/.test(c.list));
  ok('*Dismount HostFS::<name>', !c.kept);
  ok('*HostFS selects HostFS', c.csd === 'HostFS::Test.$');
  ok('pin kept while its folder is dismounted', c.parked && /Kept/.test(c.saved));

  // ---------------------------------------------------------------- read-only snapshot, large folder warning
  const q = await page.evaluate(async () => {
    const { FilesBackend } = await import('/src/core/hostfs/files.js');
    const mk = (p, s) => { const f = new File([s], p.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: p }); return f; };
    const files = () => [mk('Snap/a.txt', 'A'), mk('Snap/b.txt', 'B'), mk('Snap/Dir/c,ffb', 'C'), mk('Snap/d.png', 'D')];
    os.hostfs.hostfs.largeTree = 2;
    const cancel = os.hostfs.mountBackend(FilesBackend.fromFileList(files()), { open: false });
    await new Promise((r) => setTimeout(r, 300));
    const asked = /more than 2 files/.test(document.body.textContent);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    const cancelled = await Promise.race([cancel, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
    os.hostfs.hostfs.largeTree = 20000;
    const s = await os.hostfs.mountBackend(FilesBackend.fromFileList(files()), { open: false });
    let err = null;
    try { os.vfs.writeFile(`HostFS::${s.name}.$.New`, 'x'); } catch (e) { err = e.message; }
    return { asked, cancelled: cancelled === null, name: s.name, type: os.vfs.stat(`HostFS::${s.name}.$.Dir.c`)?.filetype, text: await os.vfs.readText(`HostFS::${s.name}.$.b/txt`), err, ro: os.vfs.stat(`HostFS::${s.name}.$.a/txt`)?.readonly };
  });
  ok('large folder: asks before mounting', q.asked);
  ok('large folder: Cancel', q.cancelled);
  ok('read-only snapshot mounted', q.name === 'Snap' && q.type === 0xffb && q.text === 'B');
  ok('read-only snapshot refuses writes', /read-only/.test(q.err ?? '') && q.ro);
  await page.evaluate(async () => { await os.hostfs.hostfs.store.clear(); });
} catch (e) {
  results.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(results.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR|^error/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
