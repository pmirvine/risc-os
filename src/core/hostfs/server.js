// HostFS backend on the local server (serve.mjs --host Name=/path): works in every browser and, unlike the
// File System Access API, keeps RISC OS datestamps (utimes) and renames in place.
//
//   GET  /__hostfs/                      {token, mounts: [{name, readonly}]}
//   GET  /__hostfs/<mount>/<path>?list   {entries: [{name, isDir, size, mtime, readonly}]}
//   GET  /__hostfs/<mount>/<path>        file contents
//   PUT  /__hostfs/<mount>/<path>?mtime= write a file              -> {mtime, size}
//   POST /__hostfs/<mount>/<path>?op=mkdir | delete | move&to=<path> | utimes&mtime= | statfs
//   GET  /__hostfs/<mount>?watch         server-sent events: data {path: [...]} for a changed directory
//
// Requests that change anything carry the token from the first call (X-HostFS-Token).

const BASE = '__hostfs/';

let info = null;
/** The server's mounts, or null when the page isn't served by serve.mjs with HostFS. */
export async function serverInfo() {
  if (info) return info;
  try {
    // only serve.mjs has HostFS: it marks its responses, so other static servers aren't asked (no 404 noise)
    const page = await fetch('./', { method: 'HEAD', cache: 'no-store' });
    if (!page.headers.get('x-hostfs')) return null;
    const r = await fetch(BASE, { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    info = await r.json();
    return info;
  } catch { return null; }
}

export class ServerBackend {
  constructor(mount, token) {
    this.kind = 'server';
    this.mount = mount.name;
    this.readonly = !!mount.readonly;
    this.label = mount.name;
    this.token = token;
    this.preservesTime = true;
  }

  _url(parts, q = '') {
    return BASE + encodeURIComponent(this.mount) + '/' + parts.map(encodeURIComponent).join('/') + (q ? '?' + q : '');
  }
  async _req(parts, { method = 'GET', q = '', body, json = true, retry = true } = {}) {
    const headers = method === 'GET' ? {} : { 'X-HostFS-Token': this.token };
    const r = await fetch(this._url(parts, q), { method, body, headers, cache: 'no-store' });
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`;
      try { msg = (await r.json()).error ?? msg; } catch { /* */ }
      if (msg === 'Bad token' && retry) {           // the server was restarted: it has a new token
        info = null;
        const i = await serverInfo();
        if (i?.token) { this.token = i.token; return this._req(parts, { method, q, body, json, retry: false }); }
      }
      throw new Error(msg);
    }
    return json ? r.json() : new Uint8Array(await r.arrayBuffer());
  }

  async permission() { return 'granted'; }
  async list(parts) { return (await this._req(parts, { q: 'list' })).entries; }
  async read(parts) { return this._req(parts, { json: false }); }
  async write(parts, bytes, { mtime } = {}) {
    return this._req(parts, { method: 'PUT', q: mtime ? `mtime=${Math.round(mtime)}` : '', body: bytes });
  }
  async mkdir(parts) { await this._req(parts, { method: 'POST', q: 'op=mkdir' }); }
  async remove(parts) { await this._req(parts, { method: 'POST', q: 'op=delete' }); }
  async move(from, to) {
    await this._req(from, { method: 'POST', q: 'op=move&to=' + encodeURIComponent(to.join('/')) });
  }
  async setTime(parts, mtime) { await this._req(parts, { method: 'POST', q: `op=utimes&mtime=${Math.round(mtime)}` }); }
  async space() { try { return await this._req([], { method: 'POST', q: 'op=statfs' }); } catch { return null; } }

  watch(cb) {
    if (typeof EventSource !== 'function') return null;
    const es = new EventSource(BASE + encodeURIComponent(this.mount) + '?watch');
    es.onmessage = (e) => { try { cb(JSON.parse(e.data).path ?? null); } catch { cb(null); } };
    return () => es.close();
  }
}
