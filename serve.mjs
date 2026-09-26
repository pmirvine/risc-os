// Tiny zero-dependency static server:
//   node serve.mjs [port] [--lan | --listen=address] [--host Name=/path] [--host-ro Name=/path] [--browser[=chrome]]
// It answers only this machine unless --lan (every network interface) or --listen is given; HostFS and !Browse's
// engine stay this-machine-only either way.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHostArgs, hostfsHandler } from './tools/hostfs-server.mjs';
import { parseBrowserArgs, browserHandler } from './tools/browser-server.mjs';
const root = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const port = +args.find((a) => /^\d+$/.test(a)) || 8371;
const listen = args.includes('--lan') ? null : (args.find((a) => a.startsWith('--listen='))?.slice(9) ?? 'loopback');
// HostFS: node serve.mjs --host Work=~/riscos-files [--host-ro Name=/path] (tools/hostfs-server.mjs)
const hostMounts = parseHostArgs(args);
const hostfs = hostfsHandler(hostMounts, port);
// !Browse: node serve.mjs --browser (tools/browser-server.mjs)
const browserOpts = parseBrowserArgs(args);
const browse = browserHandler(browserOpts, port);
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.gif':'image/gif', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.wav':'audio/wav', '.txt':'text/plain' };
const handler = (req, res) => {
  try { serveRequest(req, res); } catch { if (!res.headersSent) res.writeHead(400); res.end(); }   // e.g. a bad %-escape
};
const serveRequest = (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/__hostfs/')) return hostfs(req, res, url);
  if (url.pathname.startsWith('/__browse/')) return browse.handle(req, res, url);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/__dev/lander.json') {   // !Lander: which of the git-ignored original binaries exist (src/apps/Lander/store.js)
    const files = ['vendor/lander/4-reference-binaries/!RunImage.bin', 'vendor/lander/4-reference-binaries/GameCode.bin']
      .filter((f) => fs.existsSync(path.join(root, f)));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ files }));
  }
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    // X-HostFS: tells the page this server has /__hostfs/ and /__browse/ (other static servers don't; see
    // src/core/hostfs/server.js)
    // frame-ancestors: other sites can't show the desktop in a frame (and so click in it for you)
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-HostFS': '1', 'Content-Security-Policy': "frame-ancestors 'self'" });
    res.end(data);
  });
};
// loopback: 127.0.0.1 and ::1 (a browser may try either for "localhost"); --lan: every interface
const addresses = listen === 'loopback' ? ['127.0.0.1', '::1'] : [listen];      // null: every interface
let first = true;
for (const addr of addresses) {
  const server = http.createServer(handler);
  server.on('upgrade', (req, socket, head) => browse.upgrade(req, socket, head));
  server.on('error', (e) => {
    if (addr === '::1' && ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(e.code)) return;   // no IPv6 here: 127.0.0.1 is enough
    console.error(`serve.mjs: ${e.message}`);
    process.exit(1);
  });
  server.listen(port, ...(addr ? [addr] : []), () => {
    if (!first) return;
    first = false;
    console.log(`RISC OS on http://localhost:${port}/`);
    if (listen !== 'loopback') {
      const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && !n.internal && n.family === 'IPv4');
      for (const n of nets) console.log(`  also on the network at http://${n.address}:${port}/`);
      if (hostMounts.length || browserOpts.enabled) console.log('  (HostFS and !Browse\'s engine are only available on this machine)');
    }
    for (const m of hostMounts) console.log(`  HostFS::${m.name} -> ${m.root}${m.readonly ? ' (read-only)' : ''}`);
    if (browserOpts.enabled) {
      const s = browse.service.status();
      console.log(s.engine ? `  !Browse's engine: ${s.engine} (profile ${browserOpts.profile})` : `  !Browse: ${s.error}`);
    }
  });
}
const quit = () => { browse.shutdown(); process.exit(0); };
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('exit', () => browse.shutdown());
