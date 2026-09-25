// HostFS for serve.mjs: host folders named on the command line, served to the page's HostFS
// (src/core/hostfs/server.js) under /__hostfs/.
//
//   node serve.mjs --host Work=~/riscos-files --host-ro Photos=~/Pictures
//
// Only the folders given are reachable (paths are resolved with realpath, so neither "..", odd names nor
// symlinks lead outside them; symlinked directories aren't followed, so there are no loops); requests are only
// answered from this machine and for this server's own host name (no DNS rebinding); a browser's cross-site
// requests are refused (Sec-Fetch-Site) and responses can't be used by other sites (nosniff, CORP same-origin);
// changes also need the per-run token from GET /__hostfs/ and a same-origin Origin header.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const MAX_BODY = 1024 * 1024 * 1024;

/** Parse --host / --host-ro arguments: [{name, root, readonly}]. */
export function parseHostArgs(argv) {
  const mounts = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^--host(-ro)?(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const spec = m[2] ?? argv[++i];
    const eq = spec?.indexOf('=') ?? -1;
    if (!spec || eq < 1) throw new Error(`${a}: expected Name=/path`);
    const name = spec.slice(0, eq);
    if (!/^[A-Za-z0-9_+-]{1,24}$/.test(name)) throw new Error(`${a}: bad mount name '${name}' (letters, digits, _ + -)`);
    let dir = spec.slice(eq + 1).replace(/^~(?=$|\/)/, os.homedir());
    dir = fs.realpathSync.native(path.resolve(dir));   // .native: the real case on macOS, as fsp.realpath gives
    if (!fs.statSync(dir).isDirectory()) throw new Error(`${a}: ${dir} is not a directory`);
    mounts.push({ name, root: dir, readonly: !!m[1] });
  }
  return mounts;
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function hostfsHandler(mounts, port) {
  const token = crypto.randomBytes(16).toString('hex');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));

  const SAFE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const send = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...SAFE });
    res.end(JSON.stringify(obj));
  };

  /** Resolve path components below a mount; the result (or its parent, for new objects) must stay inside. */
  const resolve = async (m, parts, { mustExist = true } = {}) => {
    for (const p of parts) if (!p || p === '.' || p === '..' || /[/\\\0]/.test(p)) throw new HttpError(400, `Bad name '${p}'`);
    const full = path.join(m.root, ...parts);
    const inside = (r) => r === m.root || r.startsWith(m.root + path.sep);
    try {
      const real = await fsp.realpath(full);
      if (!inside(real)) throw new HttpError(403, 'Outside the mounted folder');
      return full;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (mustExist) throw new HttpError(404, `'${parts[parts.length - 1] ?? '$'}' not found`);
      const parent = await fsp.realpath(path.dirname(full)).catch(() => { throw new HttpError(404, 'Directory not found'); });
      if (!inside(parent)) throw new HttpError(403, 'Outside the mounted folder');
      return full;
    }
  };

  const readBody = (req) => new Promise((res, rej) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { rej(new HttpError(413, 'File too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });

  const entry = async (m, dir, d) => {
    const full = path.join(dir, d.name);
    try {
      const st = await fsp.stat(full);
      if (d.isSymbolicLink()) {
        if (st.isDirectory()) return null;          // no symlinked directories: they could loop
        const real = await fsp.realpath(full);
        if (real !== m.root && !real.startsWith(m.root + path.sep)) return null;
      }
      if (!st.isFile() && !st.isDirectory()) return null;
      return { name: d.name, isDir: st.isDirectory(), size: st.isFile() ? st.size : 0, mtime: Math.round(st.mtimeMs), readonly: m.readonly || !(st.mode & 0o200) };
    } catch { return null; }
  };

  const watch = (m, req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', ...SAFE, Connection: 'keep-alive' });
    res.write(': hostfs\n\n');
    let w;
    try {
      w = fs.watch(m.root, { recursive: true }, (_ev, file) => {
        const parts = file ? String(file).split(path.sep).slice(0, -1) : null;
        res.write(`data: ${JSON.stringify({ path: parts })}\n\n`);
      });
      w.on('error', () => {});
    } catch { /* no watching on this platform */ }
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); w?.close(); });
  };

  return async function handle(req, res, url) {
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new HttpError(403, 'HostFS is only available on this machine');
      if (!hosts.has(req.headers.host)) throw new HttpError(403, 'Bad host');
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request');
      const rest = url.pathname.slice('/__hostfs/'.length);
      if (rest === '') {
        return send(res, 200, { token, mounts: mounts.map((m) => ({ name: m.name, readonly: m.readonly })) });
      }
      const segs = rest.split('/');
      const m = mounts.find((x) => x.name.toLowerCase() === decodeURIComponent(segs[0]).toLowerCase());
      if (!m) throw new HttpError(404, 'No such mount');
      const parts = segs.slice(1).filter((s) => s !== '').map(decodeURIComponent);
      const q = url.searchParams;
      if (req.method === 'GET') {
        if (q.has('watch')) return watch(m, req, res);
        const p = await resolve(m, parts);
        if (q.has('list')) {
          const ents = await fsp.readdir(p, { withFileTypes: true });
          return send(res, 200, { entries: (await Promise.all(ents.map((d) => entry(m, p, d)))).filter(Boolean) });
        }
        const st = await fsp.stat(p);
        if (!st.isFile()) throw new HttpError(400, 'Not a file');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, ...SAFE });
        return fs.createReadStream(p).pipe(res);
      }
      // changes: same-origin requests carrying the token only
      if (req.headers['x-hostfs-token'] !== token) throw new HttpError(403, 'Bad token');
      if (req.headers.origin && !origins.has(req.headers.origin)) throw new HttpError(403, 'Bad origin');
      const op = req.method === 'PUT' ? 'write' : q.get('op');
      if (op === 'statfs') {
        const s = await fsp.statfs(m.root);
        return send(res, 200, { size: s.bsize * s.blocks, free: s.bsize * s.bavail });
      }
      if (m.readonly) throw new HttpError(403, `HostFS::${m.name} is read-only`);
      if (!parts.length) throw new HttpError(400, 'Bad name');
      const mtime = q.has('mtime') ? +q.get('mtime') / 1000 : null;
      if (op === 'write') {
        const p = await resolve(m, parts, { mustExist: false });
        const old = await fsp.stat(p).catch(() => null);
        if (old && !(old.mode & 0o200)) throw new HttpError(403, `'${parts[parts.length - 1]}' is read-only on the host`);
        const body = await readBody(req);
        const tmp = path.join(path.dirname(p), `.${path.basename(p)}.hostfs-${crypto.randomBytes(4).toString('hex')}`);
        await fsp.writeFile(tmp, body);
        await fsp.rename(tmp, p).catch(async (e) => { await fsp.rm(tmp, { force: true }); throw e; });
        if (mtime) await fsp.utimes(p, new Date(), mtime);
        const st = await fsp.stat(p);
        return send(res, 200, { mtime: Math.round(st.mtimeMs), size: st.size });
      }
      if (op === 'mkdir') { await fsp.mkdir(await resolve(m, parts, { mustExist: false })); return send(res, 200, {}); }
      if (op === 'delete') { await fsp.rm(await resolve(m, parts), { recursive: true, force: true }); return send(res, 200, {}); }
      if (op === 'utimes') { await fsp.utimes(await resolve(m, parts), new Date(), mtime); return send(res, 200, {}); }
      if (op === 'move') {
        const from = await resolve(m, parts);
        const toParts = String(q.get('to') ?? '').split('/').filter((s) => s !== '');
        if (!toParts.length) throw new HttpError(400, 'Bad name');
        const to = await resolve(m, toParts, { mustExist: false });
        // never replace another object (a case-only rename is the same object on a case-insensitive disc)
        const [a, b] = await Promise.all([fsp.lstat(from), fsp.lstat(to).catch(() => null)]);
        if (b && (a.ino !== b.ino || a.dev !== b.dev)) throw new HttpError(409, `'${toParts[toParts.length - 1]}' already exists`);
        await fsp.rename(from, to);
        return send(res, 200, {});
      }
      throw new HttpError(400, 'Bad request');
    } catch (e) {
      const code = e.code && typeof e.code === 'number' ? e.code : e.code === 'ENOENT' ? 404 : e.code === 'EEXIST' || e.code === 'ENOTEMPTY' ? 409 : e.code === 'EACCES' || e.code === 'EPERM' ? 403 : 500;
      if (!res.headersSent) send(res, code, { error: e.message });
      else res.end();
    }
  };
}
