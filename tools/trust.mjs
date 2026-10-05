// Who may talk to hostfs-server.mjs and browser-server.mjs.
//
// By default only this machine: loopback peers, for loopback Host names. To run behind a reverse proxy (Docker +
// Apache), give --public-url=<url> and set RISCOS_PROXY_SECRET (16+ characters); the proxy adds that secret as an
// X-Proxy-Auth header, and requests carrying it are accepted from any peer, for the public host name.
// X-Forwarded-* headers are never consulted: anyone can send those.
import crypto from 'node:crypto';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Read --public-url=<url> and RISCOS_PROXY_SECRET: {publicUrl: URL|null, secret: string|null}. */
export function parseTrustArgs(argv, env = process.env) {
  let publicUrl = null;
  for (let i = 0; i < argv.length; i++) {
    const m = /^--public-url(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    const spec = m[1] ?? argv[++i];
    try { publicUrl = new URL(spec); } catch { throw new Error(`--public-url: '${spec}' is not a URL`); }
    if (publicUrl.protocol !== 'https:' && publicUrl.protocol !== 'http:') throw new Error('--public-url: must be an http or https URL');
  }
  if (!publicUrl) return { publicUrl: null, secret: null };
  const secret = env.RISCOS_PROXY_SECRET ?? '';
  if (secret.length < 16) throw new Error('--public-url needs RISCOS_PROXY_SECRET set to at least 16 characters');
  return { publicUrl, secret };
}

/** Host names, Origins and the peer check for a server on this port. */
export function makeTrust({ publicUrl, secret }, port) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  if (publicUrl) {
    hosts.add(publicUrl.host);
    origins.add(publicUrl.origin);
  }
  const want = secret ? Buffer.from(secret) : null;

  /** True for a loopback peer or, with a public URL, a request carrying the proxy's secret. */
  const allowedRemote = (req) => {
    if (LOOPBACK.has(req.socket.remoteAddress)) return true;
    if (!want) return false;
    const got = req.headers['x-proxy-auth'];
    if (typeof got !== 'string') return false;
    const have = Buffer.from(got);
    return have.length === want.length && crypto.timingSafeEqual(have, want);
  };

  return { hosts, origins, allowedRemote };
}
