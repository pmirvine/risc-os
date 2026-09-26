// !Browse's connection to its engine: the headless Chrome that serve.mjs --browser runs (tools/browser-server.mjs).
//
//   const e = await Engine.probe()   // {mode: 'engine' | 'embedded', info, reason}
//   await e.connect()
//   const { tab } = await e.request({ op: 'open', url, w, h })
//   e.send({ op: 'mouse', tab, ... })
//   e.on('state' | 'dialog' | 'select' | 'files' | 'download' | 'progress' | 'opened' | 'closed' | 'lost', fn)
//   e.frames.set(tab, (meta, jpegBytes) => ...)
//
// Frames and sound arrive as binary WebSocket messages: [kind][tab u32][...], kind 1 a JPEG frame (after four
// u16s: the page's width and height, and the width and height of what the frame shows), kind 2 sound (16-bit
// stereo samples at 48 kHz). Without --browser (or from another computer, or on another web server) there's no
// engine, and !Browse shows pages in a frame instead (./view.js).
import { Emitter } from '../../core/util.js';

const BASE = '__browse/';

export class Engine extends Emitter {
  constructor(info) {
    super();
    this.info = info;          // {token, enabled, engine, error}
    this.ws = null;
    this.ready = null;
    this.frames = new Map();   // tab -> fn(meta, bytes)
    this.replies = new Map();
    this.req = 0;
    this.audio = null;
    this.soundOn = true;
  }

  /**
   * What this server offers: {mode: 'engine', info} when serve.mjs --browser has an engine, otherwise
   * {mode: 'embedded', info (token for frame checks, or null), reason}.
   */
  static async probe() {
    let info = null;
    try {
      // only serve.mjs answers /__browse/: it marks its pages (X-HostFS), so other servers aren't asked
      const page = await fetch('./', { method: 'HEAD', cache: 'no-store' });
      if (page.headers.get('x-hostfs')) {
        const r = await fetch(BASE, { cache: 'no-store' });
        if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) info = await r.json();
        else if (r.status === 403) return { mode: 'embedded', info: null, reason: 'remote' };
      }
    } catch { /* no server */ }
    if (!info) return { mode: 'embedded', info: null, reason: 'server' };
    if (!info.enabled) return { mode: 'embedded', info, reason: 'off' };
    if (!info.engine) return { mode: 'embedded', info, reason: 'nochrome', detail: info.error };
    return { mode: 'engine', info };
  }

  /** Can this site be shown in a frame? true / false / null (couldn't tell). */
  static async frameable(info, url) {
    if (!info?.token) return null;
    try {
      const r = await fetch(`${BASE}check?url=${encodeURIComponent(url)}`, { headers: { 'X-Browse-Token': info.token }, cache: 'no-store' });
      return (await r.json()).frameable ?? null;
    } catch { return null; }
  }

  connect() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const u = new URL(`${BASE}ws?t=${this.info.token}`, location.href);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = this.ws = new WebSocket(u);
      ws.binaryType = 'arraybuffer';
      let opened = false;
      ws.onmessage = (m) => {
        if (typeof m.data !== 'string') { this.binary(m.data); return; }
        let e;
        try { e = JSON.parse(m.data); } catch { return; }
        if (e.ev === 'hello') { this.id = e.id; return; }
        if (e.ev === 'ready') { opened = true; this.engineName = e.engine; this.hasAudio = e.audio; this.send({ op: 'audio', on: this.soundOn }); resolve(this); return; }
        if (e.ev === 'error' && e.fatal) { reject(new Error(e.message)); return; }
        if (e.ev === 'reply') {
          const r = this.replies.get(e.req);
          this.replies.delete(e.req);
          if (r) e.error ? r.reject(new Error(e.error)) : r.resolve(e);
          return;
        }
        this.emit(e.ev, e);
      };
      ws.onclose = () => {
        for (const r of this.replies.values()) r.reject(new Error('The connection to the browser engine was lost'));
        this.replies.clear();
        this.ws = null;
        this.ready = null;
        if (!opened) reject(new Error('!Browse couldn\'t reach its engine'));
        else this.emit('lost', {});
      };
    });
    return this.ready;
  }

  get connected() { return this.ws?.readyState === 1; }

  send(o) { if (this.connected) this.ws.send(JSON.stringify(o)); }

  request(o) {
    if (!this.connected) return Promise.reject(new Error('!Browse isn\'t connected to its engine'));
    return new Promise((resolve, reject) => {
      const req = ++this.req;
      this.replies.set(req, { resolve, reject });
      this.ws.send(JSON.stringify({ ...o, req }));
    });
  }

  binary(buf) {
    const b = new Uint8Array(buf);
    const tab = new DataView(buf).getUint32(1, true);
    if (b[0] === 1) {
      const meta = new Uint16Array(buf.slice(5, 13));
      this.frames.get(tab)?.(meta, b.subarray(13));
    } else if (b[0] === 2) this.play(buf.slice(5));
  }

  // ---------------------------------------------------------------- sound
  setSound(on) {
    this.soundOn = on;
    this.send({ op: 'audio', on });
    if (!on && this.audio) { this.audio.ctx.close(); this.audio = null; }
  }
  /** Let sound start: browsers only allow it after the user has done something on the page. */
  wake() { if (this.audio?.ctx.state === 'suspended') this.audio.ctx.resume(); }
  play(pcm) {
    if (!this.soundOn) return;
    if (!this.audio) {
      const ctx = new AudioContext({ sampleRate: 48000 });
      this.audio = { ctx, next: 0 };
    }
    const { ctx } = this.audio;
    const s = new Int16Array(pcm);
    const n = s.length >> 1;
    const ab = ctx.createBuffer(2, n, 48000);
    const l = ab.getChannelData(0), r = ab.getChannelData(1);
    for (let i = 0; i < n; i++) { l[i] = s[i * 2] / 32768; r[i] = s[i * 2 + 1] / 32768; }
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    // a little behind, so that late chunks still join up; after a gap (silence isn't sent), start again
    const now = ctx.currentTime;
    if (this.audio.next < now + 0.02 || this.audio.next > now + 1) this.audio.next = now + 0.12;
    src.start(this.audio.next);
    this.audio.next += n / 48000;
  }

  // ---------------------------------------------------------------- files
  /** A download or printout, once the engine has it. */
  async fetchFile(id) {
    const r = await fetch(`${BASE}file/${id}?c=${this.id}`, { headers: { 'X-Browse-Token': this.info.token }, cache: 'no-store' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `The file couldn't be fetched (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  }
  /** Send a file for the page (a file chooser, or files dropped on it): its id. */
  async upload(name, data) {
    const r = await fetch(`${BASE}upload?c=${this.id}&name=${encodeURIComponent(name)}`, { method: 'POST', body: data, headers: { 'X-Browse-Token': this.info.token } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'The file couldn\'t be sent');
    return j.id;
  }
}
