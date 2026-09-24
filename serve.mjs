// Tiny zero-dependency static server: node serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const port = +process.argv[2] || 8371;
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.gif':'image/gif', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.wav':'audio/wav', '.txt':'text/plain' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log(`RISC OS on http://localhost:${port}/`));
