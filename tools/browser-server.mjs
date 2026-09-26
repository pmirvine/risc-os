// !Browse's engine for serve.mjs: a real, modern web browser (headless Chrome) whose pages are shown in RISC OS.
//
//   node serve.mjs --browser                 find a Chrome (Chrome for Testing first: it can send sound)
//   node serve.mjs --browser=/path/to/chrome
//   node serve.mjs --browser --browser-profile ~/somewhere   (default ~/.riscos-browse; cookies and logins persist)
//
// Chrome runs headless, driven over a private pipe (--remote-debugging-pipe: no DevTools port is opened), with
// its own profile. Each tab in !Browse is a page in Chrome: the page's pictures come as JPEG frames (a screencast,
// acknowledged frame by frame so a slow connection only gets fewer frames), the desktop sends mouse and keys
// back. Downloads, uploads, JavaScript dialogues, <select> menus, the pointer shape, pop-up windows and printing
// are passed to !Browse to do the RISC OS way. Sound: a small extension (tools/browse-ext) captures each tab's
// sound; branded Chrome no longer loads extensions from the command line, so sound needs Chrome for Testing or
// Chromium (npx @puppeteer/browsers install chrome@stable, or Playwright's).
//
// The page talks to this over a WebSocket at /__browse/ws. As HostFS (tools/hostfs-server.mjs): only from this
// machine, for this server's own host name, not from other sites (Sec-Fetch-Site, Origin), and with the per-run
// token from GET /__browse/. Without --browser, GET /__browse/ still answers (enabled: false) and
// /__browse/check says whether a site lets itself be shown in a frame, for !Browse's embedded mode.
import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EXT_DIR = path.join(HERE, 'browse-ext');
const MAX_MESSAGE = 1024 * 1024;            // from the page: JSON commands only
const MAX_UPLOAD = 512 * 1024 * 1024;
const HIGH_WATER = 2 * 1024 * 1024;         // frames wait while this much is still unsent to the page
const WORLD = 'riscos';                     // the isolated world !Browse's helper script runs in

/** --browser[=chrome], --browser-profile dir. */
export function parseBrowserArgs(argv) {
  const o = { enabled: false, chrome: null, profile: path.join(os.homedir(), '.riscos-browse') };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--browser(?:=(.*))?$/.exec(argv[i]);
    if (m) { o.enabled = true; if (m[1]) o.chrome = m[1]; continue; }
    const p = /^--browser-profile(?:=(.*))?$/.exec(argv[i]);
    if (p) o.profile = path.resolve((p[1] ?? argv[++i]).replace(/^~(?=$|\/)/, os.homedir()));
  }
  return o;
}

// ------------------------------------------------------------------ finding a Chrome
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const byVersion = (dirs) => dirs.sort((a, b) => (+(/(\d+)(?!.*\d)/.exec(b)?.[1] ?? 0)) - (+(/(\d+)(?!.*\d)/.exec(a)?.[1] ?? 0)));
const glob = (dir, re) => { try { return byVersion(fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n))); } catch { return []; } };

/** Candidates, best first: Chrome for Testing / Chromium (they load the sound extension), then branded browsers. */
export function chromeCandidates() {
  const home = os.homedir(), out = [];
  const plat = process.platform;
  const pw = plat === 'darwin' ? path.join(home, 'Library/Caches/ms-playwright') : plat === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright') : path.join(home, '.cache/ms-playwright');
  for (const d of glob(pw, /^chromium-\d+$/)) {
    for (const sub of glob(d, /^chrome-/)) {
      out.push(path.join(sub, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), path.join(sub, 'Chromium.app/Contents/MacOS/Chromium'), path.join(sub, 'chrome'), path.join(sub, 'chrome.exe'));
    }
  }
  for (const d of glob(path.join(home, '.cache/puppeteer/chrome'), /./)) {
    for (const sub of glob(d, /^chrome-/)) out.push(path.join(sub, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), path.join(sub, 'chrome'), path.join(sub, 'chrome.exe'));
  }
  if (plat === 'darwin') {
    for (const a of ['Chromium', 'Google Chrome', 'Microsoft Edge', 'Brave Browser']) out.push(`/Applications/${a}.app/Contents/MacOS/${a}`, path.join(home, `Applications/${a}.app/Contents/MacOS/${a}`));
  } else if (plat === 'win32') {
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      out.push(path.join(base, 'Chromium/Application/chrome.exe'), path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
    }
  } else {
    for (const n of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'brave-browser']) {
      try { out.push(execFileSync('which', [n], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* not there */ }
    }
  }
  return out.filter(Boolean);
}

export function findChrome(explicit) {
  if (explicit) {
    const f = explicit.replace(/^~(?=$|\/)/, os.homedir());
    if (exists(f)) return f;
    // a .app bundle: the program inside it
    const app = /\/([^/]+)\.app\/?$/.exec(f);
    if (app && exists(path.join(f, 'Contents/MacOS', app[1]))) return path.join(f, 'Contents/MacOS', app[1]);
    throw new Error(`--browser: ${explicit} not found`);
  }
  for (const env of [process.env.RISCOS_BROWSER, process.env.CHROME_PATH]) if (env && exists(env)) return env;
  return chromeCandidates().find(exists) ?? null;
}

// ------------------------------------------------------------------ Chrome over a pipe (CDP)
class Chrome extends EventEmitter {
  constructor(bin, args) {
    super();
    this.proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    this.log = '';
    this.proc.stdio[2].on('data', (d) => { this.log = (this.log + d).slice(-4000); });
    this.out = this.proc.stdio[3];
    this.out.on('error', () => {});
    this.id = 0;
    this.waiting = new Map();
    let buf = Buffer.alloc(0);
    this.proc.stdio[4].on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      let i;
      while ((i = buf.indexOf(0)) >= 0) {
        let msg;
        try { msg = JSON.parse(buf.subarray(0, i).toString('utf8')); } catch { msg = null; }
        buf = buf.subarray(i + 1);
        if (!msg) continue;
        if (msg.id != null) {
          const w = this.waiting.get(msg.id);
          this.waiting.delete(msg.id);
          if (w) msg.error ? w.reject(Object.assign(new Error(msg.error.message), { cdp: msg.error })) : w.resolve(msg.result);
        } else this.emit('event', msg);
      }
    });
    this.proc.on('exit', (code) => {
      for (const w of this.waiting.values()) w.reject(new Error('The browser engine stopped'));
      this.waiting.clear();
      this.emit('exit', code);
    });
    this.proc.on('error', (e) => this.emit('exit', e.message));
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.waiting.set(id, { resolve, reject });
      const m = { id, method, params };
      if (sessionId) m.sessionId = sessionId;
      this.out.write(JSON.stringify(m) + '\0');
    });
  }
  kill() { try { this.proc.kill(); } catch { /* gone */ } }
}

// ------------------------------------------------------------------ a small WebSocket server (RFC 6455)
function acceptWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const ws = new EventEmitter();
  let buf = head?.length ? Buffer.from(head) : Buffer.alloc(0), frag = null, open = true;
  const frame = (op, data) => {
    if (!open) return;
    const n = data.length;
    const h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    if (n >= 126 && n < 65536) { h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    if (n >= 65536) { h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    socket.write(h);
    socket.write(data);
  };
  const close = (code = 1000) => {
    if (!open) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code);
    frame(8, b);
    open = false;
    socket.end();
  };
  socket.on('data', (d) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 15, masked = buf[1] & 0x80;
      let len = buf[1] & 127, o = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); o = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); o = 10; }
      if (!masked || len > MAX_MESSAGE) { close(1009); return; }
      if (buf.length < o + 4 + len) return;
      const mask = buf.subarray(o, o + 4);
      const data = Buffer.from(buf.subarray(o + 4, o + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(o + 4 + len);
      if (op === 8) { close(); return; }
      if (op === 9) { frame(10, data); continue; }
      if (op === 10) continue;
      if (op === 0) { if (!frag) continue; frag.parts.push(data); } else frag = { op, parts: [data] };
      if (frag.parts.reduce((a, p) => a + p.length, 0) > MAX_MESSAGE) { close(1009); return; }
      if (fin) {
        const msg = Buffer.concat(frag.parts), text = frag.op === 1;
        frag = null;
        ws.emit('message', text ? msg.toString('utf8') : msg, !text);
      }
    }
  });
  const ping = setInterval(() => frame(9, Buffer.alloc(0)), 30000);
  const gone = () => { if (ws.closed) return; ws.closed = true; open = false; clearInterval(ping); ws.emit('close'); };
  socket.on('close', gone);
  socket.on('error', gone);
  socket.on('drain', () => ws.emit('drain'));
  ws.send = (obj) => frame(1, Buffer.from(JSON.stringify(obj)));
  ws.sendBinary = (b) => frame(2, b);
  ws.buffered = () => socket.writableLength;
  ws.close = close;
  return ws;
}

// ------------------------------------------------------------------ the helper script, in each frame of each page
// It runs in an isolated world (the page can't see or change it) and reports through the __riscosBrowse binding:
// a <select> being opened (its menu is then a RISC OS menu), the pointer shape and the link under the pointer.
const HELPER = `(() => {
  const send = (o) => { try { globalThis.__riscosBrowse(JSON.stringify(o)); } catch {} };
  const offset = () => {                       // this frame's position in the page, as far as it can be seen
    let x = 0, y = 0, w = window;
    try { while (w.frameElement) { const r = w.frameElement.getBoundingClientRect(); x += r.left; y += r.top; w = w.parent; } } catch {}
    return { x, y };
  };
  addEventListener('mousedown', (e) => {
    const s = e.target?.closest?.('select');
    if (!s || s.multiple || s.size > 1 || s.disabled || e.button !== 0) return;
    e.preventDefault();
    s.focus();
    globalThis.__riscosSelect = s;
    const r = s.getBoundingClientRect(), o = offset();
    const options = [...s.options].map((op) => ({
      text: (op.label || op.text || '').replace(/\\s+/g, ' ').trim(),
      disabled: op.disabled || !!op.parentElement?.disabled,
      group: op.parentElement?.tagName === 'OPTGROUP' ? op.parentElement.label : '',
    }));
    send({ k: 'select', options, index: s.selectedIndex, x: r.left + o.x, y: r.bottom + o.y, w: r.width });
  }, true);
  let cursor = '', link = '', pending = null;
  addEventListener('mousemove', (e) => {
    pending = e.target;
    if (pending.__riscosQueued) return;
    queueMicrotask(() => {
      const el = pending;
      if (!el || el.nodeType !== 1) return;
      let c = getComputedStyle(el).cursor;
      if (c === 'auto') c = el.closest('a[href],area[href]') ? 'pointer' : el.isContentEditable || /^(TEXTAREA)$/.test(el.tagName) || (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/.test(el.type)) ? 'text' : 'default';
      const l = el.closest('a[href],area[href]')?.href ?? '';
      if (c !== cursor) { cursor = c; send({ k: 'cursor', cursor: c }); }
      if (l !== link) { link = l; send({ k: 'link', url: l }); }
    });
  }, true);
})();`;

const PICK_SELECT = (i) => `(() => { const s = globalThis.__riscosSelect; if (!s) return; s.selectedIndex = ${i};
  s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`;

const COPY_TEXT = `(() => { const a = document.activeElement;
  if (a && typeof a.selectionStart === 'number' && a.selectionEnd > a.selectionStart) return a.value.slice(a.selectionStart, a.selectionEnd);
  return String(getSelection() ?? ''); })()`;

// ------------------------------------------------------------------ the browser service
const extensionId = () => {
  const man = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  const hash = crypto.createHash('sha256').update(Buffer.from(man.key, 'base64')).digest('hex').slice(0, 32);
  return [...hash].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
};

const ALLOWED_URL = /^(https?:|about:blank$|data:|blob:)/i;

class Service {
  constructor(opts) {
    this.opts = opts;
    this.chrome = null;
    this.starting = null;
    this.tabs = new Map();          // our tab id -> tab
    this.bySession = new Map();
    this.byTarget = new Map();
    this.frames = new Map();        // frame id -> tab (for downloads)
    this.files = new Map();         // id -> {path, name, mime} downloads and printouts waiting to be fetched
    this.downloads = new Map();     // guid -> {tab, client, name, state, received, total, path}
    this.nextTab = 1;
    this.audio = null;              // the extension's page: {sessionId}
    this.clients = new Set();
    this.tmp = null;
    this.bin = null;
    this.error = null;
  }

  status() {
    let bin = this.bin;
    if (!bin && !this.error) {
      try { bin = this.bin = findChrome(this.opts.chrome); } catch (e) { this.error = e.message; }
    }
    return { engine: bin ? path.basename(bin) : null, error: bin ? null : this.error ?? 'No Chrome, Chromium or Edge was found: give its path with --browser=/path/to/chrome', audio: this.chrome ? !!this.audio : null };
  }

  ensure() {
    if (this.chrome) return Promise.resolve();
    this.starting ??= this.launch().finally(() => { this.starting = null; });
    return this.starting;
  }

  async launch() {
    const bin = this.bin ?? (this.bin = findChrome(this.opts.chrome));
    if (!bin) throw new Error(this.status().error);
    await fsp.mkdir(this.opts.profile, { recursive: true });
    this.tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'riscos-browse-'));
    await fsp.mkdir(path.join(this.tmp, 'downloads'));
    const id = this.extId = extensionId();
    const args = ['--headless', '--remote-debugging-pipe', `--user-data-dir=${this.opts.profile}`, '--no-first-run',
      '--no-default-browser-check', '--disable-search-engine-choice-screen', '--password-store=basic', '--use-mock-keychain',
      `--load-extension=${EXT_DIR}`, `--disable-extensions-except=${EXT_DIR}`, `--allowlisted-extension-id=${id}`, 'about:blank'];
    const c = new Chrome(bin, args);
    c.on('event', (m) => this.event(m));
    const ready = new Promise((resolve, reject) => {
      c.once('exit', () => reject(new Error(`The browser engine (${path.basename(bin)}) stopped: ${c.log.trim().split('\n').slice(-3).join(' ') || 'no reason given'}`)));
      c.send('Browser.getVersion').then(resolve, reject);
    });
    const version = await ready;
    this.chrome = c;
    this.userAgent = version.userAgent.replace('HeadlessChrome', 'Chrome');
    c.on('exit', () => this.stopped());
    await c.send('Target.setDiscoverTargets', { discover: true });
    await c.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(this.tmp, 'downloads'), eventsEnabled: true });
    // the first tab Chrome opened isn't one of ours
    for (const t of (await c.send('Target.getTargets')).targetInfos) if (t.type === 'page' && !t.url.startsWith('chrome-extension:')) c.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
    await this.startAudio().catch(() => { this.audio = null; });
    console.log(`  !Browse: ${path.basename(bin)} ${version.product.split('/')[1] ?? ''}${this.audio ? ', with sound' : ' (no sound: that needs Chrome for Testing or Chromium)'}`);
  }

  async startAudio() {
    const c = this.chrome;
    const { targetId } = await c.send('Target.createTarget', { url: `chrome-extension://${this.extId}/audio.html`, background: true });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    for (let i = 0; i < 20; i++) {
      const r = await c.send('Runtime.evaluate', { expression: 'typeof capture', returnByValue: true }, sessionId).catch(() => null);
      if (r?.result?.value === 'function') {
        await c.send('Runtime.addBinding', { name: '__riscosAudio' }, sessionId);
        this.audio = { sessionId, targetId };
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    c.send('Target.closeTarget', { targetId }).catch(() => {});
  }

  stopped() {
    const log = this.chrome?.log ?? '';
    this.chrome = null;
    this.audio = null;
    for (const t of this.tabs.values()) t.client.ws.send({ ev: 'closed', tab: t.id, crashed: true });
    this.tabs.clear(); this.bySession.clear(); this.byTarget.clear(); this.frames.clear();
    for (const cl of this.clients) cl.ws.send({ ev: 'error', message: 'The browser engine stopped' });
    if (log) console.log('  !Browse: the browser engine stopped');
  }

  shutdown() {
    this.chrome?.kill();
    if (this.tmp) fs.rmSync(this.tmp, { recursive: true, force: true });
  }

  send(tab, method, params = {}) { return this.chrome.send(method, params, tab.sessionId); }

  // ---------------------------------------------------------------- tabs
  async openTab(client, { url = 'about:blank', w = 800, h = 600, zoom = 1, targetId = null, opener = null }) {
    await this.ensure();
    const c = this.chrome;
    // each tab in a window of its own, so that every tab being shown is drawn
    if (!targetId) ({ targetId } = await c.send('Target.createTarget', { url: 'about:blank', newWindow: true, background: true }));
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    const { windowId } = await c.send('Browser.getWindowForTarget', { targetId });
    const tab = { id: this.nextTab++, targetId, sessionId, windowId, client, w, h, zoom, shown: false, casting: false,
      waitingAck: null, chooser: null, url: '', title: '', loading: false };
    this.tabs.set(tab.id, tab);
    this.bySession.set(sessionId, tab);
    this.byTarget.set(targetId, tab);
    client.tabs.add(tab.id);
    const s = (m, p) => this.send(tab, m, p).catch(() => {});
    await Promise.all([
      s('Page.enable'), s('Runtime.enable'),
      s('Page.setInterceptFileChooserDialog', { enabled: true }),
      s('Page.addScriptToEvaluateOnNewDocument', { source: HELPER, worldName: WORLD, runImmediately: true }),
      s('Runtime.addBinding', { name: '__riscosBrowse', executionContextName: WORLD }),
      s('Emulation.setFocusEmulationEnabled', { enabled: true }),
      s('Network.setUserAgentOverride', { userAgent: this.userAgent }),
      this.metrics(tab),
    ]);
    if (tab.zoom !== 1) await this.setZoom(tab, tab.zoom);
    if (this.audio && !opener) {
      // find the tab from the extension by a title nobody else will have, before it goes anywhere
      const title = `riscos-browse-${crypto.randomBytes(6).toString('hex')}`;
      await s('Runtime.evaluate', { expression: `document.title = ${JSON.stringify(title)}` });
      await c.send('Runtime.evaluate', { expression: `capture(${JSON.stringify(title)}, ${tab.id})`, awaitPromise: true }, this.audio.sessionId).catch(() => {});
    } else if (this.audio && opener) {
      // a pop-up already has its page: find it by its target id's title too
      const title = `riscos-browse-${crypto.randomBytes(6).toString('hex')}`;
      const r = await this.send(tab, 'Runtime.evaluate', { expression: `(() => { const t = document.title; document.title = ${JSON.stringify(title)}; return t; })()`, returnByValue: true }).catch(() => null);
      await c.send('Runtime.evaluate', { expression: `capture(${JSON.stringify(title)}, ${tab.id})`, awaitPromise: true }, this.audio.sessionId).catch(() => {});
      await s('Runtime.evaluate', { expression: `document.title = ${JSON.stringify(r?.result?.value ?? '')}` });
    }
    if (url !== 'about:blank') await this.navigate(tab, url);
    await this.history(tab);
    return tab;
  }

  // The screencast shows a tab's whole (unseen) window, so the window is made the page's size; Chrome won't
  // make one smaller than about 500 by 230, so a smaller page is emulated in its top left corner and each frame
  // says how much of it is page (see frame()).
  async metrics(tab) {
    const w = Math.round(tab.w), h = Math.round(tab.h);
    await this.chrome.send('Browser.setWindowBounds', { windowId: tab.windowId, bounds: { windowState: 'normal' } }).catch(() => {});
    await this.chrome.send('Browser.setWindowBounds', { windowId: tab.windowId, bounds: { width: Math.max(w, 500), height: Math.max(h, 240) } }).catch(() => {});
    await this.send(tab, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    if (tab.casting) await this.cast(tab, true, true);
  }

  /** Page zoom, as a browser's: CSS zoom on the page's root element, now and in each page to come. */
  async setZoom(tab, zoom) {
    tab.zoom = zoom;
    const js = `(() => { const z = ${JSON.stringify(String(zoom))};
      const set = () => { const r = document.documentElement; if (!r) return false; r.style.zoom = z === '1' ? '' : z; return true; };
      if (!set()) new MutationObserver((_, o) => { if (set()) o.disconnect(); }).observe(document, { childList: true }); })()`;
    if (tab.zoomScript) await this.send(tab, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: tab.zoomScript }).catch(() => {});
    tab.zoomScript = zoom === 1 ? null : (await this.send(tab, 'Page.addScriptToEvaluateOnNewDocument', { source: js, worldName: WORLD }).catch(() => ({}))).identifier;
    await this.send(tab, 'Runtime.evaluate', { expression: js }).catch(() => {});
  }

  async cast(tab, on, restart = false) {
    if (on && (!tab.casting || restart)) {
      if (tab.casting) await this.send(tab, 'Page.stopScreencast').catch(() => {});
      tab.casting = true;
      await this.send(tab, 'Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: Math.max(tab.w, 500), maxHeight: Math.max(tab.h, 240), everyNthFrame: 1 }).catch(() => {});
      // the screencast only sends a frame when something changes: the page as it is now, to start with
      const shot = await this.send(tab, 'Page.captureScreenshot', { format: 'jpeg', quality: 80 }).catch(() => null);
      if (shot && tab.shown) this.frame(tab, shot.data, { deviceWidth: tab.w, deviceHeight: tab.h });
    } else if (!on && tab.casting) {
      tab.casting = false;
      await this.send(tab, 'Page.stopScreencast').catch(() => {});
    }
  }

  /** A frame to the page: kind 1, tab, the page's size and the size of what the frame shows (u16s), JPEG. */
  frame(tab, data, meta) {
    const head = Buffer.alloc(13);
    head[0] = 1;
    head.writeUInt32LE(tab.id, 1);
    head.writeUInt16LE(Math.min(tab.w, 65535), 5);
    head.writeUInt16LE(Math.min(tab.h, 65535), 7);
    head.writeUInt16LE(Math.min(Math.round(meta?.deviceWidth ?? tab.w), 65535), 9);
    head.writeUInt16LE(Math.min(Math.round(meta?.deviceHeight ?? tab.h), 65535), 11);
    tab.client.ws.sendBinary(Buffer.concat([head, Buffer.from(data, 'base64')]));
  }

  closeTab(tab, fromPage = false) {
    this.tabs.delete(tab.id);
    this.bySession.delete(tab.sessionId);
    this.byTarget.delete(tab.targetId);
    for (const [f, t] of this.frames) if (t === tab) this.frames.delete(f);
    tab.client.tabs.delete(tab.id);
    if (this.audio) this.chrome?.send('Runtime.evaluate', { expression: `release(${tab.id})` }, this.audio.sessionId).catch(() => {});
    if (!fromPage) this.chrome?.send('Target.closeTarget', { targetId: tab.targetId }).catch(() => {});
    else tab.client.ws.send({ ev: 'closed', tab: tab.id });
  }

  async navigate(tab, url) {
    if (!ALLOWED_URL.test(url)) throw new Error(`!Browse doesn't open ${url.split(':')[0]}: addresses`);
    const r = await this.send(tab, 'Page.navigate', { url });
    if (r.errorText && r.errorText !== 'net::ERR_ABORTED') tab.client.ws.send({ ev: 'state', tab: tab.id, error: r.errorText });
  }

  async history(tab) {
    const h = await this.send(tab, 'Page.getNavigationHistory').catch(() => null);
    if (!h) return;
    tab.hist = h;
    const e = h.entries[h.currentIndex];
    tab.client.ws.send({ ev: 'state', tab: tab.id, url: e?.url ?? tab.url, title: e?.title || tab.title, canBack: h.currentIndex > 0, canForward: h.currentIndex < h.entries.length - 1 });
  }

  async go(tab, delta) {
    const h = await this.send(tab, 'Page.getNavigationHistory');
    const e = h.entries[h.currentIndex + delta];
    if (e) await this.send(tab, 'Page.navigateToHistoryEntry', { entryId: e.id });
  }

  // ---------------------------------------------------------------- events from Chrome
  event(m) {
    const p = m.params ?? {};
    if (m.method === 'Runtime.bindingCalled' && this.audio && m.sessionId === this.audio.sessionId) {
      const i = p.payload.indexOf(':');
      const tab = this.tabs.get(+p.payload.slice(0, i));
      if (!tab || !tab.client.audio) return;
      const pcm = Buffer.from(p.payload.slice(i + 1), 'base64');
      const head = Buffer.alloc(5); head[0] = 2; head.writeUInt32LE(tab.id, 1);
      tab.client.ws.sendBinary(Buffer.concat([head, pcm]));
      return;
    }
    if (m.method === 'Target.targetCreated') return this.targetCreated(p.targetInfo);
    if (m.method === 'Target.targetInfoChanged') {
      const tab = this.byTarget.get(p.targetInfo.targetId);
      if (tab && p.targetInfo.title !== tab.title && !p.targetInfo.title.startsWith('riscos-browse-')) {
        tab.title = p.targetInfo.title;
        tab.client.ws.send({ ev: 'state', tab: tab.id, title: tab.title });
      }
      return;
    }
    if (m.method === 'Target.targetDestroyed' || m.method === 'Target.detachedFromTarget') {
      const tab = this.byTarget.get(p.targetId) ?? this.bySession.get(p.sessionId);
      if (tab) this.closeTab(tab, true);
      return;
    }
    if (m.method?.startsWith('Browser.download')) return this.downloadEvent(m.method, p);
    const tab = m.sessionId && this.bySession.get(m.sessionId);
    if (!tab) return;
    const ws = tab.client.ws;
    switch (m.method) {
      case 'Page.screencastFrame': {
        const ack = () => this.send(tab, 'Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
        if (!tab.shown) { ack(); return; }
        this.frame(tab, p.data, p.metadata);
        if (ws.buffered() > HIGH_WATER) ws.once('drain', ack); else ack();
        return;
      }
      case 'Page.frameNavigated':
        this.frames.set(p.frame.id, tab);
        if (!p.frame.parentId) { tab.url = p.frame.url; this.history(tab); }
        return;
      case 'Page.navigatedWithinDocument':
        if (p.frameId === tab.targetId) this.history(tab);
        return;
      case 'Page.frameStartedLoading':
        if (p.frameId === tab.targetId) { tab.loading = true; ws.send({ ev: 'state', tab: tab.id, loading: true }); }
        return;
      case 'Page.frameStoppedLoading':
        if (p.frameId === tab.targetId) { tab.loading = false; ws.send({ ev: 'state', tab: tab.id, loading: false }); this.history(tab); }
        return;
      case 'Page.javascriptDialogOpening':
        ws.send({ ev: 'dialog', tab: tab.id, type: p.type, message: p.message, value: p.defaultPrompt ?? '', url: p.url });
        return;
      case 'Page.fileChooserOpened':
        tab.chooser = { backendNodeId: p.backendNodeId, multiple: p.mode === 'selectMultiple' };
        ws.send({ ev: 'files', tab: tab.id, multiple: tab.chooser.multiple });
        return;
      case 'Page.windowOpen':
        return;
      case 'Inspector.targetCrashed':
        ws.send({ ev: 'state', tab: tab.id, crashed: true, loading: false });
        return;
      case 'Runtime.bindingCalled': {
        if (p.name !== '__riscosBrowse') return;
        let o;
        try { o = JSON.parse(p.payload); } catch { return; }
        if (o.k === 'select' && Array.isArray(o.options)) {
          tab.selectContext = p.executionContextId;
          ws.send({ ev: 'select', tab: tab.id, options: o.options.slice(0, 500), index: o.index, x: +o.x || 0, y: +o.y || 0, w: +o.w || 0 });
        } else if (o.k === 'cursor') ws.send({ ev: 'state', tab: tab.id, cursor: String(o.cursor).slice(0, 40) });
        else if (o.k === 'link') ws.send({ ev: 'state', tab: tab.id, link: String(o.url).slice(0, 2048) });
      }
    }
  }

  async targetCreated(info) {
    // pop-ups, target=_blank links and middle clicks: a new tab in the same !Browse window
    if (info.type !== 'page' || !info.openerId || this.byTarget.has(info.targetId)) return;
    const opener = this.byTarget.get(info.openerId);
    if (!opener) return;
    const client = opener.client;
    try {
      const tab = await this.openTab(client, { targetId: info.targetId, w: opener.w, h: opener.h, zoom: opener.zoom, opener });
      client.ws.send({ ev: 'opened', tab: tab.id, opener: opener.id, url: info.url });
      this.history(tab);
    } catch { /* it went again */ }
  }

  downloadEvent(method, p) {
    if (method === 'Browser.downloadWillBegin') {
      const tab = this.frames.get(p.frameId) ?? [...this.tabs.values()].at(-1);
      if (!tab) { this.chrome.send('Browser.cancelDownload', { guid: p.guid }).catch(() => {}); return; }
      const d = { guid: p.guid, tab, client: tab.client, name: p.suggestedFilename || 'download', url: p.url, state: 'inProgress', received: 0, total: 0, path: path.join(this.tmp, 'downloads', p.guid) };
      this.downloads.set(p.guid, d);
      tab.client.ws.send({ ev: 'download', tab: tab.id, id: p.guid, name: d.name, url: p.url });
    } else if (method === 'Browser.downloadProgress') {
      const d = this.downloads.get(p.guid);
      if (!d) return;
      d.state = p.state; d.received = p.receivedBytes; d.total = p.totalBytes;
      if (p.state === 'completed') this.files.set(p.guid, { path: d.path, name: d.name, client: d.client });
      d.client.ws.send({ ev: 'progress', id: p.guid, state: p.state, received: p.receivedBytes, total: p.totalBytes });
      if (p.state !== 'inProgress') this.downloads.delete(p.guid);
    }
  }

  // ---------------------------------------------------------------- commands from the page
  async command(client, o) {
    const ws = client.ws;
    const reply = (x) => { if (o.req != null) ws.send({ ev: 'reply', req: o.req, ...x }); };
    if (o.op === 'open') {
      const tab = await this.openTab(client, o);
      return reply({ tab: tab.id });
    }
    if (o.op === 'audio') { client.audio = !!o.on; return reply({}); }
    if (o.op === 'download') {
      if (o.action === 'cancel') {
        if (this.downloads.has(o.id)) await this.chrome?.send('Browser.cancelDownload', { guid: o.id }).catch(() => {});
        const f = this.files.get(o.id);
        this.files.delete(o.id);
        if (f) fsp.rm(f.path, { force: true }).catch(() => {});
      }
      return reply({});
    }
    const tab = this.tabs.get(o.tab);
    if (!tab || tab.client !== client) throw new Error('No such tab');
    const s = (m, p) => this.send(tab, m, p);
    switch (o.op) {
      case 'close': this.closeTab(tab); break;
      case 'navigate': await this.navigate(tab, String(o.url)); break;
      case 'back': await this.go(tab, -1); break;
      case 'forward': await this.go(tab, 1); break;
      case 'reload': await s('Page.reload', { ignoreCache: !!o.hard }); break;
      case 'stop': await s('Page.stopLoading'); break;
      case 'size':
        Object.assign(tab, { w: Math.max(16, Math.min(Math.round(+o.w) || 800, 4096)), h: Math.max(16, Math.min(Math.round(+o.h) || 600, 4096)) });
        await this.metrics(tab);
        break;
      case 'zoom':
        await this.setZoom(tab, Math.max(0.25, Math.min(+o.zoom || 1, 5)));
        break;
      case 'show':
        tab.shown = !!o.on;
        await this.cast(tab, tab.shown);
        if (tab.shown) await s('Page.bringToFront').catch(() => {});
        break;
      case 'mouse':
        await s('Input.dispatchMouseEvent', { type: o.type, x: +o.x, y: +o.y, button: o.button ?? 'none', buttons: o.buttons | 0, clickCount: o.clickCount | 0, modifiers: o.modifiers | 0 });
        break;
      case 'wheel':
        await s('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +o.x, y: +o.y, deltaX: +o.dx || 0, deltaY: +o.dy || 0, modifiers: o.modifiers | 0 });
        break;
      case 'key': {
        const k = { type: o.type, modifiers: o.modifiers | 0, key: o.key, code: o.code, windowsVirtualKeyCode: o.keyCode | 0, nativeVirtualKeyCode: o.keyCode | 0 };
        if (o.text) { k.text = o.text; k.unmodifiedText = o.text; }
        if (Array.isArray(o.commands)) k.commands = o.commands.filter((c) => /^[a-zA-Z]+$/.test(c));
        await s('Input.dispatchKeyEvent', k);
        break;
      }
      case 'text': await s('Input.insertText', { text: String(o.text) }); break;
      case 'dialog': await s('Page.handleJavaScriptDialog', { accept: !!o.accept, promptText: o.text ?? '' }).catch(() => {}); break;
      case 'select':
        if (tab.selectContext != null && Number.isInteger(o.index)) await s('Runtime.evaluate', { expression: PICK_SELECT(o.index), contextId: tab.selectContext }).catch(() => {});
        break;
      case 'find': {
        const r = await s('Runtime.evaluate', { expression: `window.find(${JSON.stringify(String(o.text))}, ${!!o.caseSensitive}, ${!!o.backwards}, true)`, returnByValue: true });
        return reply({ found: !!r.result?.value });
      }
      case 'copy': {
        const r = await s('Runtime.evaluate', { expression: COPY_TEXT, returnByValue: true });
        return reply({ text: String(r.result?.value ?? '') });
      }
      case 'source': {
        const r = await s('Runtime.evaluate', { expression: 'document.documentElement ? "<!DOCTYPE html>\\n" + document.documentElement.outerHTML : ""', returnByValue: true });
        return reply({ text: String(r.result?.value ?? '') });
      }
      case 'pdf': {
        const r = await s('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
        const id = crypto.randomBytes(12).toString('hex');
        const file = path.join(this.tmp, 'downloads', id);
        await fsp.writeFile(file, Buffer.from(r.data, 'base64'));
        this.files.set(id, { path: file, name: 'page.pdf', client });
        return reply({ file: id });
      }
      case 'files':
        // a file chooser answered: files uploaded by the page (POST /__browse/upload), or none
        if (tab.chooser && Array.isArray(o.files)) {
          const paths = o.files.map((id) => client.uploads.get(id)).filter(Boolean);
          if (paths.length) await s('DOM.setFileInputFiles', { files: tab.chooser.multiple ? paths : paths.slice(0, 1), backendNodeId: tab.chooser.backendNodeId }).catch(() => {});
        }
        tab.chooser = null;
        break;
      case 'drop': {
        // files dragged from the Filer onto the page
        const paths = (o.files ?? []).map((id) => client.uploads.get(id)).filter(Boolean);
        if (!paths.length) break;
        const data = { items: [], files: paths, dragOperationsMask: 1 };
        for (const type of ['dragEnter', 'dragOver', 'drop']) await s('Input.dispatchDragEvent', { type, x: +o.x, y: +o.y, data, modifiers: 0 }).catch(() => {});
        break;
      }
      default: throw new Error(`Unknown command '${o.op}'`);
    }
    return reply({});
  }

  connect(ws) {
    const client = { ws, tabs: new Set(), uploads: new Map(), audio: false };
    this.clients.add(client);
    ws.on('message', async (text, binary) => {
      if (binary) return;
      let o;
      try { o = JSON.parse(text); } catch { return; }
      try { await this.command(client, o); } catch (e) {
        if (o?.req != null) ws.send({ ev: 'reply', req: o.req, error: e.message });
        else ws.send({ ev: 'error', tab: o?.tab, message: e.message });
      }
    });
    ws.on('close', () => {
      this.clients.delete(client);
      for (const id of client.tabs) { const t = this.tabs.get(id); if (t) this.closeTab(t); }
      for (const [id, f] of this.files) if (f.client === client) { this.files.delete(id); fsp.rm(f.path, { force: true }).catch(() => {}); }
      for (const p of client.uploads.values()) fsp.rm(path.dirname(p), { recursive: true, force: true }).catch(() => {});
    });
    this.ensure().then(() => ws.send({ ev: 'ready', audio: !!this.audio, engine: path.basename(this.bin) }),
      (e) => ws.send({ ev: 'error', fatal: true, message: e.message }));
    return client;
  }
}

// ------------------------------------------------------------------ can a site be shown in a frame?
async function frameCheck(url) {
  if (!/^https?:\/\//i.test(url)) return { frameable: false, reason: 'Only http: and https: pages can be shown' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (RISC OS) !Browse' } });
    ac.abort();
    const xfo = (r.headers.get('x-frame-options') ?? '').toLowerCase();
    const csp = r.headers.get('content-security-policy') ?? '';
    const fa = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp)?.[1]?.trim().toLowerCase();
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return { frameable: false, reason: 'X-Frame-Options', url: r.url };
    if (fa != null && !fa.split(/\s+/).includes('*')) return { frameable: false, reason: 'frame-ancestors', url: r.url };
    return { frameable: true, url: r.url };
  } catch (e) {
    return { frameable: null, reason: e.name === 'AbortError' ? 'No answer' : e.cause?.code ?? e.message };
  } finally { clearTimeout(timer); }
}

// ------------------------------------------------------------------ the HTTP side
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function browserHandler(opts, port) {
  const service = opts.enabled ? new Service(opts) : null;
  const token = crypto.randomBytes(16).toString('hex');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  const SAFE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...SAFE }); res.end(JSON.stringify(obj)); };
  const guard = (req) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new HttpError(403, '!Browse\'s engine is only available on this machine');
    if (!hosts.has(req.headers.host)) throw new HttpError(403, 'Bad host');
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request');
  };
  const client = (req, t) => {
    if (t !== token) throw new HttpError(403, 'Bad token');
    if (req.headers.origin && !origins.has(req.headers.origin)) throw new HttpError(403, 'Bad origin');
  };

  const handle = async (req, res, url) => {
    try {
      guard(req);
      const rest = url.pathname.slice('/__browse/'.length);
      if (rest === '' && req.method === 'GET') {
        return send(res, 200, { token, enabled: !!service, ...(service ? service.status() : {}) });
      }
      client(req, req.headers['x-browse-token'] ?? url.searchParams.get('t'));
      if (rest === 'check') return send(res, 200, await frameCheck(url.searchParams.get('url') ?? ''));
      if (!service) throw new HttpError(404, 'Start the server with --browser');
      const cl = [...service.clients].find((c) => c.ws.id === url.searchParams.get('c'));
      if (rest.startsWith('file/') && req.method === 'GET') {
        const id = rest.slice(5);
        const f = service.files.get(id);
        if (!f || (cl && f.client !== cl)) throw new HttpError(404, 'No such file');
        const st = await fsp.stat(f.path);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, ...SAFE });
        const stream = fs.createReadStream(f.path);
        stream.pipe(res);
        stream.on('close', () => { service.files.delete(id); fsp.rm(f.path, { force: true }).catch(() => {}); });
        return;
      }
      if (rest === 'upload' && req.method === 'POST') {
        if (!cl) throw new HttpError(400, 'No connection');
        const name = path.basename(String(url.searchParams.get('name') ?? 'file')).replace(/[\0/\\]/g, '_') || 'file';
        const dir = await fsp.mkdtemp(path.join(service.tmp, 'up-'));
        const file = path.join(dir, name);
        let n = 0;
        const out = fs.createWriteStream(file);
        await new Promise((resolve, reject) => {
          req.on('data', (c) => { n += c.length; if (n > MAX_UPLOAD) { req.destroy(); reject(new HttpError(413, 'File too large')); } });
          req.pipe(out);
          out.on('finish', resolve);
          req.on('error', reject);
        });
        const id = crypto.randomBytes(8).toString('hex');
        cl.uploads.set(id, file);
        return send(res, 200, { id });
      }
      throw new HttpError(404, 'Not found');
    } catch (e) {
      const code = typeof e.code === 'number' ? e.code : 500;
      if (!res.headersSent) send(res, code, { error: e.message }); else res.end();
    }
  };

  const upgrade = (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname !== '/__browse/ws' || !service) throw new HttpError(404, 'Not found');
      guard(req);
      if (!origins.has(req.headers.origin)) throw new HttpError(403, 'Bad origin');
      if (url.searchParams.get('t') !== token) throw new HttpError(403, 'Bad token');
      const ws = acceptWebSocket(req, socket, head);
      ws.id = crypto.randomBytes(8).toString('hex');
      ws.send({ ev: 'hello', id: ws.id });
      service.connect(ws);
    } catch (e) {
      socket.end(`HTTP/1.1 ${e.code ?? 400} ${e.message}\r\nConnection: close\r\n\r\n`);
    }
  };

  return { handle, upgrade, service, shutdown: () => service?.shutdown() };
}
