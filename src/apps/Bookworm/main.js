// !Bookworm 1.00 (12-Feb-97) - Acorn's HTML browser for the RISC OS 3.7 User Guide
// (vendor/ro371/Sources/Apps/BookWorm: a single-user build of Merlyn Kline's Browser / ANT HTMLLib).
//
// What is reproduced (see docs/apps/Bookworm.md):
//  * icon bar icon (!app) - SELECT opens a new browser window on the home page (Params HomePage,
//    file://ROManual:BOOKB/USERGUIDE); MENU: Info / Choices... / Quit.
//  * browser windows from the original Templates: 'viewer' with its three panes - 'URLbar' (URL field +
//    history popup), 'buttonbar' (home, back, reload, stop, forward, add to hotlist, hotlist, resources,
//    load images, export) and 'InfoBar' (status line, spinning globe, byte count).
//  * pages are parsed like HTMLLib (html.js) and formatted/redrawn like Reformat.c/Redraw.c (layout.js)
//    on a canvas, with the RISC OS outline fonts named in Params (Trinity body, Homerton headings,
//    Corpus fixed), GIFs decoded from the VFS, links in the Params link colours, history, hotlist
//    (User.HotList), global history (User.History, for followed-link colours), Find, Open URL, Save.
//  * double-clicking an HTML file (&FAF) opens it in a new window (Alias$@RunType_FAF / DataOpen).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { vfs } from '../../core/vfs.js';
import { sysvars } from '../../core/sysvars.js';
import { loadTemplates } from '../../core/templates.js';
import { loadManifest } from '../../core/sprites.js';
import { parseMessagesText } from '../../core/messages.js';
import { saveAs } from '../../core/dialogs.js';
import { input } from '../../core/input.js';
import { fonts as desktopFonts } from '../../core/fonts.js';
import { decodeLatin1 } from '../../core/charset.js';
import { parseHTML, parseText } from './html.js';
import { Formatter } from './layout.js';
import { translate, splitURL, resolveURL, pathToURL, urlToPath as urlToPathWith } from './url.js';

const VERSION = '1.00 (12-Feb-97)';
const BUTTONBAR_H = 80, URLBAR_H = 72, STATUS_H = 96;      // OS units (Browser.h)
const DEFAULT_WIDTH = 1280, DEFAULT_HEIGHT = 1320;
// button bar icons (Button.c button_icons[])
const B = { HOME: 0, FWD: 1, EXPORT: 2, RELOAD: 3, RESOURCES: 4, HOTLIST: 5, STOP: 6, BACK: 7, ADDHOT: 8, IMAGES: 9 };

const DEFAULT_PARAMS = `HomePage        file://ROManual:BOOKB/USERGUIDE
FontSize        205
Font            sans=Homerton.Medium:Homerton.Medium:Homerton.Bold:Homerton.Bold.Oblique;serif
Font            serif=Trinity.Medium:Trinity.Medium:Trinity.Bold:Trinity.Bold.Italic;sans
Font            fixed=Corpus.Medium:Corpus.Medium.Oblique:Corpus.Bold:Corpus.Bold.Oblique;
Font            system=Corpus.Medium:Corpus.Medium.Oblique:Corpus.Bold:Corpus.Bold.Oblique;fixed
Font            dialogue=Homerton.Medium:Homerton.Medium.Oblique:Homerton.Bold:Homerton.Bold.Oblique;
Toolbar         Yes
URLBar          Yes
StatusBar       Yes
DisplayBGs      Yes
PageColour      0xdddddd00
TextColour      0x00000000
LinkColour      0x99440000
UsedColour      0xffbb0000
`;

/** RISC OS palette word &BBGGRR00 -> CSS colour */
const palWord = (w) => { const v = w >>> 0; return `rgb(${(v >>> 8) & 255},${(v >>> 16) & 255},${(v >>> 24) & 255})`; };

function parseParams(text) {
  const p = { faces: {}, fontsize: 205, homepage: 'file://ROManual:BOOKB/USERGUIDE', toolbar: true, urlbar: true, statusbar: true,
    delayimages: false, displaybgs: true, systemfont: false, maxvhistory: 50, maxghistory: 8, maxhot: 64, maximages: 2, fixedptr: false,
    col_back: 0xdddddd00, col_text: 0, col_link: 0x99440000, col_used: 0xffbb0000, historyfile: 'Bookworm:User.History', hotlistfile: 'Bookworm:User.HotList', proxy: 'None;', post_in: 'null:', post_out: 'null:' };
  const yn = (v) => /^y/i.test(v);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    if (/^END$/i.test(line)) break;
    const m = /^(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    switch (k) {
      case 'homepage': p.homepage = v; break;
      case 'systemfont': p.systemfont = yn(v); break;
      case 'vhistsize': p.maxvhistory = parseInt(v, 10) || 50; break;
      case 'ghistsize': p.maxghistory = parseInt(v, 10) || 8; break;
      case 'maxhotlist': p.maxhot = parseInt(v, 10) || 64; break;
      case 'history': p.historyfile = v; break;
      case 'hotlist': p.hotlistfile = v; break;
      case 'fontsize': p.fontsize = parseInt(v, 10) || 205; break;
      case 'font': { const f = defineTypeface(v); if (f) p.faces[f.name] = f; break; }
      case 'toolbar': p.toolbar = yn(v); break;
      case 'urlbar': p.urlbar = yn(v); break;
      case 'statusbar': p.statusbar = yn(v); break;
      case 'delayimages': p.delayimages = yn(v); break;
      case 'displaybgs': p.displaybgs = yn(v); break;
      case 'maximages': p.maximages = parseInt(v, 10) || 2; break;
      case 'pagecolour': p.col_back = Number(v) >>> 0; break;
      case 'textcolour': p.col_text = Number(v) >>> 0; break;
      case 'linkcolour': p.col_link = Number(v) >>> 0; break;
      case 'usedcolour': p.col_used = Number(v) >>> 0; break;
      case 'fixedpointer': p.fixedptr = yn(v); break;
      case 'proxy': p.proxy = v; break;
      case 'postin': p.post_in = v; break;
      case 'postout': p.post_out = v; break;
    }
  }
  return p;
}
/** fm_define_typeface: "name=normal:italic:bold:bolditalic;alternative" */
function defineTypeface(desc) {
  const eq = desc.indexOf('=');
  if (eq <= 0) return null;
  const name = desc.slice(0, eq).toLowerCase();
  let rest = desc.slice(eq + 1), alt = '';
  const sc = rest.indexOf(';');
  if (sc >= 0) { alt = rest.slice(sc + 1).trim().toLowerCase(); rest = rest.slice(0, sc); }
  const names = rest.split(':').slice(0, 4).map((s) => s.trim());
  while (names.length < 4) names.push('');
  return { name, names, alt };
}
const typefaceDesc = (f) => `${f.name}=${f.names.join(':')};${f.alt ?? ''}`;

const urlToPath = (url) => urlToPathWith(url, (q) => { try { return vfs.exists(q) ? vfs.canonical(q) : null; } catch { return null; } });

// ------------------------------------------------------------------ application
export default async function start(task, ctx) {
  const dir = ctx.dir || vfs.canonical(ctx.app.appDir);
  // !Run: Set ROManual$Path "<Bookworm$Dir>.^.Manual." / Set Bookworm$Path <Bookworm$Dir>.
  sysvars.set('ROManual$Path', vfs.parent(dir) + '.Manual.');
  sysvars.set('Bookworm$Path', dir + '.');

  let M = {};
  try { M = await (await fetch('assets/messages/Bookworm.json')).json(); } catch { /* none */ }
  try { M = { ...M, ...parseMessagesText(await vfs.readText(dir + '.Messages')) }; } catch { /* rom copy only */ }
  const msg = (t, ...a) => { let s = M[t] ?? t; a.forEach((v) => { s = s.replace(/%[sd]/, v); }); return s; };

  let paramsText = DEFAULT_PARAMS;
  try { paramsText = await vfs.readText(dir + '.Params'); } catch { /* defaults */ }
  let params = parseParams(paramsText);
  const defaultParams = parseParams(DEFAULT_PARAMS);
  for (const [k, v] of Object.entries(defaultParams.faces)) params.faces[k] ??= v;

  const [tpl, spr, metricsJson] = await Promise.all([
    loadTemplates('assets/templates/Bookworm.json'),
    loadManifest('Bookworm', 'Sprites'),
    fetch('assets/fonts/fonts.json').then((r) => r.json()).catch(() => ({ fonts: {} })),
  ]);
  const metrics = metricsJson.fonts ?? {};
  const sprCanvas = new Map();
  await Promise.all([...spr].filter(([n]) => /^(b\d|missing)$/.test(n)).map(async ([n, s]) => { sprCanvas.set(n, { c: await s.canvas(), w: s.cssW, h: s.cssH }); }));
  const bullets = [];
  for (let i = 0; sprCanvas.has('b' + i); i++) { const s = sprCanvas.get('b' + i); bullets.push({ w: s.w * 2, h: s.h * 2, s }); }
  let animLength = 0;
  while (spr.has('a' + animLength)) animLength++;

  // ---------------------------------------------------------------- hotlist & global history (User)
  const userPath = (p) => p.replace(/^Bookworm:/i, dir + '.');
  const hotlist = [];                          // [{url, title}]
  try {
    const t = await vfs.readText(userPath(params.hotlistfile));
    for (const m of t.matchAll(/<a\s+href\s*=\s*"([^"]*)"\s*>([^<]*)<\/a>/gi)) hotlist.push({ url: m[1], title: m[2] });
  } catch { /* none */ }
  const saveHotlist = () => {
    try { vfs.writeFile(userPath(params.hotlistfile), hotlistHTML(), { filetype: 0xFAF }); } catch (e) { task.reportError(e.message); }
  };
  const hotlistHTML = () => {
    const title = msg('STITLE');
    return `<html>\n<head>\n<title>${title}</title>\n</head>\n<body>\n<h1>${title}</h1>\n<ul>\n` +
      hotlist.map((h) => `    <li><a href="${h.url}">${h.title}</a>\n`).join('') + '</ul><p>\n</body>\n</html>\n';
  };
  const ghistory = [];                         // global history of visited URLs (most recent last)
  try {
    const b = await vfs.readFile(userPath(params.historyfile));
    let o = 0;
    while (o + 4 < b.length) {
      o += 4;
      let e = o;
      while (e < b.length && b[e]) e++;
      const u = String.fromCharCode(...b.subarray(o, e));
      if (u) ghistory.push(u);
      o = (e + 4) & ~3;
    }
  } catch { /* none */ }
  const visited = new Set(ghistory.map((u) => u.toLowerCase()));
  let historyDirty = false;
  const addHistory = (url) => {
    const u = splitURL(url).base;
    const i = ghistory.findIndex((x) => x.toLowerCase() === u.toLowerCase());
    if (i >= 0) ghistory.splice(i, 1);
    ghistory.push(u);
    visited.add(u.toLowerCase());
    let size = ghistory.reduce((a, s) => a + 4 + ((s.length + 4) & ~3), 0);
    while (size > params.maxghistory * 1024 && ghistory.length > 1) { const r = ghistory.shift(); size -= 4 + ((r.length + 4) & ~3); }
    historyDirty = true;
  };
  const saveHistory = () => {
    if (!historyDirty) return;
    const parts = [];
    const now = Math.floor(Date.now() / 1000);
    for (const u of ghistory) {
      const n = (u.length + 4) & ~3;
      const a = new Uint8Array(4 + n);
      new DataView(a.buffer).setInt32(0, now, true);
      for (let i = 0; i < u.length; i++) a[4 + i] = u.charCodeAt(i) & 255;
      parts.push(a);
    }
    const out = new Uint8Array(parts.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of parts) { out.set(a, o); o += a.length; }
    try { vfs.writeFile(userPath(params.historyfile), out, { filetype: 0xFFD }); historyDirty = false; } catch { /* read-only */ }
  };

  // ---------------------------------------------------------------- images (shared cache)
  const images = new Map();                    // canonical path -> {state, bmp, w, h, size, waiters}
  function loadImage(path) {
    let e = images.get(path.toLowerCase());
    if (e) return e;
    e = { state: 'loading', bmp: null, w: 0, h: 0, size: 0 };
    images.set(path.toLowerCase(), e);
    e.promise = (async () => {
      try {
        const bytes = await vfs.readFile(path);
        e.size = bytes.length;
        const type = vfs.stat(path)?.filetype;
        const mime = type === 0xC85 ? 'image/jpeg' : type === 0xB60 ? 'image/png' : 'image/gif';
        e.bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
        e.w = e.bmp.width; e.h = e.bmp.height; e.state = 'ok';
      } catch { e.state = 'error'; }
    })();
    return e;
  }

  const formatter = () => new Formatter({ params, metrics, bullets, imageSize: (t) => imageSize(t) });
  let fmt = formatter();
  function imageSize(t) {
    const im = t._im;
    const missing = sprCanvas.get('missing');
    if (t.img.w && t.img.h) return { w: t.img.w * 2, h: t.img.h * 2 };
    if (im && im.state === 'ok') {
      let w = im.w, h = im.h;
      if (t.img.w) { h = Math.round(h * t.img.w / w); w = t.img.w; } else if (t.img.h) { w = Math.round(w * t.img.h / h); h = t.img.h; }
      return { w: w * 2, h: h * 2 };
    }
    return { w: (missing?.w ?? 17) * 2, h: (missing?.h ?? 17) * 2 };
  }

  // ---------------------------------------------------------------- browser views
  const views = new Set();

  class View {
    constructor() {
      this.bars = { url: params.urlbar, tool: params.toolbar, status: params.statusbar };
      this.toggled = false;
      this.hist = []; this.hpos = -1;
      this.doc = null; this.url = null; this.source = null; this.layout = null; this.displayWidth = 0;
      this.highlight = -1; this.ptrLink = -1; this.found = null; this.loading = 0; this.anim = 0;
      this.plainback = !params.displaybgs;
      this.statusText = '';
      views.add(this);
      const r = wimp.screenRect(false);
      const count = views.size - 1;
      const W = Math.min(DEFAULT_WIDTH, r.w * 2 - 64) / 2, H = Math.min(DEFAULT_HEIGHT, wimp.height * 2 - 128) / 2;
      const x = Math.round((wimp.width - W) / 2 - 10), y = Math.round((wimp.height - H) / 2 + count * 16);
      const w = this.win = task.createWindowFromTemplate(tpl, 'viewer', { x, y, w: W, h: H, workButton: 'click', spriteArea: spr, title: '' });
      w.titleBufLen = 256;
      this.canvas = w.useCanvas((g, r) => this.paint(g, { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }), { hiDPI: true, fill: false });
      w.on('click', (ev) => this.click(ev));
      w.on('pointermove', (ev) => this.pointer(ev));
      w.on('pointerleave', () => this.pointer(null));
      w.on('scrollrequest', (ev) => this.scrollRequest(ev));
      w.on('key', (ev) => this.key(ev));
      w.on('moved', () => { this.syncPanes(); this.checkWidth(); });
      w.on('closed', () => this.syncPanes());
      w.on('close', (ev) => { ev.preventDefault(); this.destroy(); });
      w.on('dataload', (ev) => this.dataLoad(ev));
      w.on('helprequest', (ev) => { ev.text = msg(this.linkAt(ev.x, ev.y) >= 0 ? 'HwBROW1' : 'HwBROW2'); });
      w.menu = () => this.menu();
      // panes
      this.urlbar = task.createWindowFromTemplate(tpl, 'URLbar', { spriteArea: spr });
      this.bbar = task.createWindowFromTemplate(tpl, 'buttonbar', { spriteArea: spr });
      this.status = task.createWindowFromTemplate(tpl, 'InfoBar', { spriteArea: spr });
      for (const p of [this.urlbar, this.bbar, this.status]) {
        p._paneParent = w;
        p.menu = () => this.menu();
        p.on('click', (ev) => { if (ev.button !== 'menu') this.focus(); });
      }
      const U = this.urlbar.icons;
      U[2].bufLen = 512;
      U[1].help = msg('HwURL1'); U[2].help = msg('HwURL2'); this.urlbar.helpText = msg('HwURL');
      this.urlbar.on('click', (ev) => { if (ev.iconIndex === 1 && ev.button !== 'menu') { this.historyList(ev); return true; } });
      this.urlbar.on('key', (ev) => {
        if (ev.code === 13) { this.go(fixURL(U[2].text.trim())); return true; }
        return this.key(ev);
      });
      this.bbar.helpText = msg('HwBUT');
      this.bbar.icons.forEach((ic, i) => { ic.help = msg('HwBUT' + i); });
      this.bbar.on('click', (ev) => { if (ev.iconIndex >= 0 && ev.button === 'select') { this.button(ev.iconIndex, ev); return true; } });
      this.status.helpText = msg('HwSTAT');
      this.status.icons.forEach((ic, i) => { ic.help = msg('HwSTAT' + i); });
      this.status.icons[3].bufLen = 30;
      this.status.icons[0].bufLen = 256;
      this.setStatus();
      this.setButtons();
      this.displayWidth = this.calcDisplayWidth();
      this.setExtent();
      w.open({ x, y, w: W, h: H, scrollX: 0, scrollY: 0, behind: 'top' });
    }

    // --- panes (Panes.c: button bar and URL bar across the top, status bar along the bottom)
    barOS() {
      let y = 0, c = 0;
      if (this.bars.tool) { y += BUTTONBAR_H + 2; c++; }
      if (this.bars.url) { y += URLBAR_H + 2; c++; }
      if (c > 1) y += 2;
      return y;
    }
    syncPanes() {
      const w = this.win;
      const list = [[this.status, this.bars.status, w.h - STATUS_H / 2, STATUS_H / 2],
        [this.urlbar, this.bars.url, 0, URLBAR_H / 2],
        [this.bbar, this.bars.tool, this.bars.url ? (this.toggled ? URLBAR_H / 2 + 2 : URLBAR_H / 2) : 0, BUTTONBAR_H / 2]];
      for (const [p, on, dy, h] of list) {
        if (!w.isOpen || !on) { if (p.isOpen) p.close(); continue; }
        p.open({ x: w.x, y: w.y + dy, w: w.w, h, scrollX: 0, scrollY: 0, behind: 'keep' });
      }
      // stacking: button bar on top, then URL bar, then status bar, all directly above the viewer
      for (const p of [this.bbar, this.urlbar, this.status]) if (p.isOpen) wimp._stackAbove(p, w);
    }
    toggleBar(which) {
      this.bars[which] = !this.bars[which];
      if (which !== 'status') this.toggled = true;
      this.syncPanes();
      this.reformat(true);
      this.setStatus();
    }

    focus() {
      if (this.bars.url && this.urlbar.isOpen) { const ic = this.urlbar.icons[2]; wimp.setCaret(this.urlbar, ic, ic.text.length); } else wimp.setCaret(this.win);
    }

    // --- geometry
    calcDisplayWidth() {
      let width = this.win.w * 2;
      if (width < params.fontsize * 2) width = params.fontsize * 2;
      return width & ~31;
    }
    topOS() { return -(this.barOS() + 16); }
    checkWidth() {
      const dw = this.calcDisplayWidth();
      if (dw !== this.displayWidth) { this.displayWidth = dw; this.reformat(true); }
    }
    setExtent() {
      const w = this.win;
      const maxW = this.layout ? this.layout.maxWidth : 0;
      const extW = Math.max(wimp.width - 23, Math.ceil((maxW + 12) / 2));
      let extH = this.layout ? Math.ceil((-this.layout.bottom + 12) / 2) : 0;
      if (this.bars.status) extH += STATUS_H / 2;
      extH = Math.max(extH, w.h, DEFAULT_HEIGHT / 2);
      const e = w.extent;
      if (e.x1 !== extW || e.y1 !== extH) w.setExtent({ x0: 0, y0: 0, x1: extW, y1: extH });
    }
    /** Reformat; keep the top visible line in place if keep. */
    reformat(keep) {
      let anchor = null;
      if (keep && this.layout) {
        const l = this.topLine();
        if (l) anchor = { t: l.chunks[0]?.t ?? 0, o: l.chunks[0]?.o ?? 0 };
      }
      this.displayWidth = this.calcDisplayWidth();
      this.layout = this.doc ? fmt.format(this.doc.tokens, this.displayWidth, this.topOS()) : null;
      this.setExtent();
      if (anchor) this.showToken(anchor.t, anchor.o); else this.win.invalidate();
    }
    lineTopPx(l) { return -(l.y + l.h) / 2; }
    /** first line whose bottom is below the top of the visible area under the bars */
    topLine() {
      if (!this.layout) return null;
      const y = -(this.win.scrollY + this.barOS() / 2 + 2) * 2;
      for (const l of this.layout.lines) if (l.y < y) return l;
      return null;
    }
    /** browser_show_token: make a token appear at the top of the window (below the bars). */
    showToken(tn, offset = 0) {
      if (!this.layout) return false;
      let line = null;
      for (const l of this.layout.lines) {
        if (l.chunks.some((c) => c.t > tn || (c.t === tn && (c.o + Math.max(c.l, 1) > offset || c.l <= 0)))) { line = l; break; }
      }
      if (!line) line = this.layout.lines[this.layout.lines.length - 1];
      if (!line) return false;
      this.win.scrollTo(this.win.scrollX, Math.max(0, Math.round(this.lineTopPx(line) - this.barOS() / 2 - 2)));
      this.win.invalidate();
      return true;
    }

    // --- page loading (Fetch.c / browser_show_url_f)
    async go(url, opts = {}) {
      if (!url) return;
      if (!/^file:/i.test(url)) { task.reportError(msg('FALON')); return; }
      const { base, frag } = splitURL(url);
      if (this.url && this.doc && !opts.reload && splitURL(this.url).base.toLowerCase() === base.toLowerCase() && frag !== '' && !opts.fresh) {
        // a reference within the displayed page
        if (opts.history !== false) this.pushHistory(url);
        this.url = url;
        this.showURL();
        this.scrollToFragment(frag);
        return;
      }
      const path = urlToPath(url);
      if (!path) { task.reportError(`File '${translate(base.replace(/^file:\/*/i, ''))}' not found`); return; }
      const gen = this.gen = (this.gen ?? 0) + 1;
      this.startFetch(url);
      let data;
      try { data = await vfs.readFile(path); } catch (e) { this.endFetch(); task.reportError(e.message); return; }
      if (gen !== this.gen || !views.has(this)) return;
      const st = vfs.stat(path);
      const text = decodeLatin1(data);
      const isHTML = st?.filetype === 0xFAF || /<\s*(html|head|body|title|p|h\d|a\s)[\s>]/i.test(text.slice(0, 2048));
      if (!isHTML && st?.filetype !== 0xFFF && st?.filetype !== -1) { this.endFetch(); task.reportError(msg('NoData')); return; }
      const doc = isHTML ? parseHTML(text) : parseText(text);
      // images: resolve and start fetching (Images.c)
      const pending = [];
      for (const t of doc.tokens) {
        if (t.kind !== 'img') continue;
        const u = resolveURL(url, t.img.src);
        const p = u && urlToPath(u);
        if (!p) { t._im = { state: 'error' }; continue; }
        t._im = loadImage(p);
        if (t._im.state === 'loading') pending.push(t._im);
      }
      if (opts.history !== false) this.pushHistory(url);
      this.doc = doc; this.url = url; this.source = data; this.found = null; this.highlight = -1;
      this.ptrLink = -1; this.canvas.style.cursor = '';
      this.docBytes = data.length;
      addHistory(url);
      const title = doc.title ? doc.title : msg('notitle') + url;
      this.win.setTitle(title);
      this.title = title;
      this.showURL();
      await this.loadFonts();
      if (gen !== this.gen) return;
      this.reformat(false);
      if (frag) this.scrollToFragment(frag);
      else this.win.scrollTo(0, opts.scrollY ?? 0);
      this.win.invalidate();
      this.progress();
      // wait for images, reformatting if any image changed size
      const uniq = [...new Set(pending)];
      this.imagesPending = uniq.length;
      this.setStatus();
      for (const im of uniq) {
        im.promise.then(() => {
          if (gen !== this.gen) return;
          this.imagesPending--;
          const resize = doc.tokens.some((t) => t._im === im && !(t.img.w && t.img.h));
          if (resize) this.reformat(true); else this.win.invalidate();
          this.progress();
          this.setStatus();
          if (!this.imagesPending) this.endFetch();
        });
      }
      if (!uniq.length) this.endFetch();
      this.setButtons();
      for (const v of views) if (v !== this) v.win.invalidate();          // followed-link colours
    }
    async loadFonts() {
      const css = new Set();
      for (const t of this.doc.tokens) if (t.kind === 'text') css.add(fmt.font(t).css);
      css.add(fontCss('sans', true, true, 1.5));
      try { await Promise.all([...css].map((c) => document.fonts.load(c))); } catch { /* fallback fonts */ }
    }
    scrollToFragment(frag) {
      const n = this.doc?.names.get(decodeURIComponent(frag).toLowerCase());
      if (n != null) this.showToken(n, 0);
    }
    pushHistory(url) {
      const cur = this.hist[this.hpos];
      if (cur) cur.scrollY = this.win.scrollY;
      if (cur && cur.url === url) return;
      this.hist.splice(this.hpos + 1);
      this.hist.push({ url, scrollY: 0 });
      if (this.hist.length > params.maxvhistory) this.hist.shift();
      this.hpos = this.hist.length - 1;
    }
    back() {
      if (this.hpos <= 0) return;
      this.hist[this.hpos].scrollY = this.win.scrollY;
      const h = this.hist[--this.hpos];
      this.go(h.url, { history: false, scrollY: h.scrollY, fresh: true });
    }
    forward() {
      if (this.hpos >= this.hist.length - 1) return;
      this.hist[this.hpos].scrollY = this.win.scrollY;
      const h = this.hist[++this.hpos];
      this.go(h.url, { history: false, scrollY: h.scrollY, fresh: true });
    }
    reload() { if (this.url) { for (const t of this.doc?.tokens ?? []) if (t._im) images.forEach((v, k) => { if (v === t._im) images.delete(k); }); this.go(this.url, { history: false, reload: true, scrollY: this.win.scrollY }); } }
    showURL() { this.urlbar.icons[2].setText(this.url ?? ''); if (wimp.caret?.window === this.urlbar) wimp.setCaret(this.urlbar, this.urlbar.icons[2], (this.url ?? '').length); }

    startFetch(url) {
      this.loading++;
      this.fetchURL = url;
      this.setStatus();
      this.setButtons();
      if (!this.animStop) {
        let last = 0;
        this.animStop = task.every(50, () => {
          const now = performance.now();
          if (now - last < 50) return;
          last = now;
          this.anim = this.anim + 1 >= animLength ? 1 : this.anim + 1;
          this.status.icons[2]?.setValidation('Sa' + this.anim);
        });
      }
    }
    endFetch() {
      this.loading = 0;
      this.fetchURL = null;
      this.imagesPending = 0;
      // keep the globe spinning a moment so the fetch is visible, as on the real machine
      task.after(350, () => {
        if (this.loading) return;
        this.animStop?.(); this.animStop = null;
        this.anim = 0;
        this.status.icons[2]?.setValidation('Sa0');
        this.setStatus();
        this.setButtons();
      });
    }
    progress() {
      let n = this.docBytes ?? 0;
      const seen = new Set();
      for (const t of this.doc?.tokens ?? []) if (t._im && !seen.has(t._im)) { seen.add(t._im); n += t._im.size || 0; }
      this.status.icons[3].setText(n < 1 ? '...' : n < 10240 ? String(n) : Math.round(n / 1024) + 'K');
    }
    setStatus() {
      let s;
      if (this.ptrLink >= 0) s = this.doc.tokens[this.ptrLink].href;
      else if (this.fetchURL && !this.doc) s = msg('FETCH', this.fetchURL);
      else if (this.imagesPending === 1) s = msg('GetPic');
      else if (this.imagesPending > 1) s = msg('GetPics', this.imagesPending);
      else if (this.loading && this.fetchURL) s = msg('FETCH', this.fetchURL);
      else s = msg('READY');
      s ??= '';
      if (s !== this.statusText) { this.statusText = s; this.status.icons[0].setText(s); }
    }
    grey(b) {
      switch (b) {
        case B.BACK: return this.hpos <= 0;
        case B.FWD: return this.hpos >= this.hist.length - 1;
        case B.STOP: return !this.loading;
        case B.HOTLIST: return hotlist.length === 0;
        case B.RESOURCES: return true;                     // no system resources list on this machine
        case B.IMAGES: return true;                        // images are never delayed
        case B.EXPORT: return true;                        // Draw file export not provided
      }
      return false;
    }
    setButtons() {
      this.bbar.icons.forEach((ic, i) => ic.setState({ shaded: this.grey(i) }));
    }
    button(i, ev) {
      if (this.grey(i)) return;
      switch (i) {
        case B.HOME: this.go(params.homepage); break;
        case B.BACK: this.back(); break;
        case B.FWD: this.forward(); break;
        case B.RELOAD: this.reload(); break;
        case B.STOP: this.gen++; this.endFetch(); break;
        case B.ADDHOT: addHot(this); break;
        case B.HOTLIST: listWindow('hot', this).openAt(ev); break;
      }
      this.focus();
    }

    // --- redraw (Redraw.c redraw_draw)
    colour(t, tn) {
      if (t.href) {
        if (tn === this.highlight) return '#ff0000';
        const u = resolveURL(this.url, t.href);
        const b = this.doc.body;
        if (u && visited.has(splitURL(u).base.toLowerCase())) return (!this.plainback && b.vlink) || palWord(params.col_used);
        return (!this.plainback && b.link) || palWord(params.col_link);
      }
      return (!this.plainback && this.doc.body.text) || palWord(params.col_text);
    }
    paint(g, rect) {
      const bg = (!this.plainback && this.doc?.body.bgcolor) || palWord(params.col_back);
      g.fillStyle = this.doc || this.url ? bg : '#dddddd';
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      if (!this.layout || !this.layout.lines.length) {
        if (this.url && this.doc) {
          g.font = fontCss('sans', true, true, 1.5);
          g.fillStyle = '#000';
          g.fillText(msg('NoData'), 32, (this.barOS() + 16 + 64 + 8) / 2);
        }
        return;
      }
      const toks = this.doc.tokens, lines = this.layout.lines;
      const y0 = -rect.y * 2, y1 = -(rect.y + rect.h) * 2;         // OS (y up)
      // binary search: first line with top below y0
      let lo = 0, hi = lines.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (lines[m].y >= y0) lo = m + 1; else hi = m; }
      for (let li = lo; li < lines.length; li++) {
        const l = lines[li];
        if (l.y + l.h < y1) break;
        if (!l.chunks.length) continue;
        let x = fmt.startX(l, toks, this.displayWidth);
        const base = l.y + l.b;
        const by = -base / 2;
        for (const c of l.chunks) {
          const t = toks[c.t];
          if (x / 2 > rect.x + rect.w) break;
          if ((x + c.w) / 2 >= rect.x) this.drawChunk(g, t, c, x, base, by, l);
          x += c.w;
        }
      }
    }
    drawChunk(g, t, c, x, base, by, l) {
      if (t.kind === 'text') {
        const s = t.text.substr(c.o, c.l).replace(/\n$/, '');
        if (!s) return;
        const f = fmt.font(t);
        if (this.found && this.found.t === c.t) {
          const a = Math.max(this.found.o, c.o), b = Math.min(this.found.o + this.found.l, c.o + c.l);
          if (b > a) {
            const pre = widthPx(f.css, t.text.slice(c.o, a)), w = widthPx(f.css, t.text.slice(a, b));
            g.fillStyle = '#000000';
            g.fillRect(x / 2 + pre, by - f.top / 2, w, (f.top + f.bot) / 2);
          }
        }
        g.font = f.css;
        g.fillStyle = this.colour(t, c.t);
        g.fillText(s, x / 2, by);
        if (this.found && this.found.t === c.t) {
          const a = Math.max(this.found.o, c.o), b = Math.min(this.found.o + this.found.l, c.o + c.l);
          if (b > a) {
            g.fillStyle = '#ffffff';
            g.fillText(t.text.slice(a, b), x / 2 + widthPx(f.css, t.text.slice(c.o, a)), by);
          }
        }
        if (t.href && s.trim()) {
          g.fillRect(Math.round(x / 2), Math.floor(by + 2), Math.round(c.w / 2), 1);
        }
      } else if (t.kind === 'img') {
        const box = fmt.imageBox(t);
        const o = t.href ? t.img.border * 2 : 0;
        if (o) {
          g.fillStyle = this.colour(t, c.t);
          const X = x / 2, Y = -(base + box.y1) / 2, W = (box.x1 - box.x0) / 2, H = (box.y1 - box.y0) / 2, O = o / 2;
          g.fillRect(X, Y, W, O); g.fillRect(X, Y + H - O, W, O);
          g.fillRect(X, Y, O, H); g.fillRect(X + W - O, Y, O, H);
        }
        const sz = imageSize(t);
        const left = (x + o) / 2, top = -(base + o + box.y0 + sz.h) / 2;
        const im = t._im;
        if (im?.state === 'ok') {
          g.imageSmoothingEnabled = false;
          g.drawImage(im.bmp, left, top, sz.w / 2, sz.h / 2);
        } else if (im?.state === 'error') {
          const m = sprCanvas.get('missing');
          if (m) g.drawImage(m.c, left, top, m.w, m.h);
        }
      } else if (t.kind === 'hr') {
        const oy = l.y + ((l.h / 2 + 1) & ~3);
        const lft = 96 + (t.indent | 0) * 32;
        const w = this.displayWidth - 96 * 2 - (t.indent | 0) * 32 - 1;
        g.fillStyle = '#999999';
        g.fillRect(lft / 2, -(oy + 4) / 2, w / 2, 2);
        g.fillStyle = '#eeeeee';
        g.fillRect(lft / 2, -oy / 2, w / 2, 2);
      } else if (t.kind === 'bullet') {
        const n = bullets.length || 1, b = bullets[(t.indent + n - 1) % n];
        if (b) g.drawImage(b.s.c, x / 2, by - b.s.h, b.s.w, b.s.h);
      }
    }

    // --- pointer & clicks
    /** token (link) under a work-area point, or -1 (browser_get_pointer_token) */
    tokenAt(px, py) {
      if (!this.layout) return null;
      const X = px * 2, Y = -py * 2;
      for (const l of this.layout.lines) {
        if (l.y > Y) continue;
        if (l.y + l.h <= Y) return null;
        let x = l.chunks.length ? fmt.startX(l, this.doc.tokens, this.displayWidth) : 0;
        for (const c of l.chunks) {
          if (X >= x && X < x + c.w) return { tn: c.t, c, x };
          x += c.w;
        }
        return null;
      }
      return null;
    }
    linkAt(px, py) {
      const h = this.tokenAt(px, py);
      return h && this.doc.tokens[h.tn].href != null ? h.tn : -1;
    }
    pointer(ev) {
      const tn = ev ? this.linkAt(ev.x, ev.y) : -1;
      if (tn !== this.ptrLink) {
        this.ptrLink = tn;
        this.canvas.style.cursor = tn >= 0 && !params.fixedptr ? `url("${spr.get('ptr_link')?.url?.replace(/\.png$/, '.sq.png') ?? ''}") 2 10, pointer` : '';
        this.setStatus();
      }
    }
    click(ev) {
      if (ev.button === 'menu') return;
      this.focus();
      const tn = this.linkAt(ev.x, ev.y);
      if (tn < 0) return true;
      const t = this.doc.tokens[tn];
      const url = resolveURL(this.url, t.href);
      if (!url) { task.reportError(msg('FALON')); return true; }
      if (ev.button === 'adjust') { newView(url); return true; }
      if (t.kind !== 'img') {           // browser_flash_token
        this.highlight = tn; this.win.invalidate();
        task.after(120, () => { this.highlight = -1; this.win.invalidate(); this.go(url); });
      } else this.go(url);
      return true;
    }
    scrollRequest(ev) {
      if (ev.wheel) return false;
      const w = this.win;
      let ystep = w.h - this.barOS() / 2 - 16;
      if (ystep < 16) ystep = 16;
      if (this.bars.status) ystep -= URLBAR_H / 2;           // (sic) Browser.c uses URLBAR_HEIGHT here
      let { scrollX: sx, scrollY: sy } = w;
      if (ev.dx === -1) sx -= 16; if (ev.dx === 1) sx += 16;
      if (ev.dx === -2) sx -= w.w; if (ev.dx === 2) sx += w.w;
      if (ev.dy === -1) sy -= 16; if (ev.dy === 1) sy += 16;
      if (ev.dy === -2) sy -= ystep; if (ev.dy === 2) sy += ystep;
      w.scrollTo(sx, sy);
      return true;
    }
    key(ev) {
      switch (ev.code) {
        case 0x183: saveBox(this).openCentred?.(); return true;             // F3
        case 0x184: findWindow(this).openAt({ sx: input.mouseX, sy: input.mouseY }); return true;   // F4
        case 0x18F: this.scrollRequest({ dy: -1 }); return true;           // Up
        case 0x19F: this.scrollRequest({ dy: -2 }); return true;           // Shift-Up
        case 0x18E: this.scrollRequest({ dy: 1 }); return true;            // Down
        case 0x19E: this.scrollRequest({ dy: 2 }); return true;            // Shift-Down
      }
      return false;
    }
    dataLoad(ev) {
      const f = ev.files?.[0];
      if (!f || (f.filetype !== 0xFAF && f.filetype !== 0xFFF)) return false;
      this.go(pathToURL(f.path));
      return true;
    }

    historyList(ev) { listWindow('history', this).openAt(ev); }

    // --- window menu (MenuDefs.c m_browse1)
    menu() {
      const mk = (title, token, defs, helpBase) => {
        const names = parseMenu(msg(token));
        return new Menu(title, names.map((n, i) => ({ text: n.text, key: n.key, dotted: n.dotted, help: msg(`${helpBase}${i}`), ...(defs[i] ?? {}) })));
      };
      const fileMenu = () => mk(msg('mtFile'), 'mFile', [
        { submenu: () => saveBox(this), shaded: () => !this.source },
        { submenu: () => mk(msg('mtExpor'), 'mExport', [
          { shaded: true },
          { submenu: () => textBox(this), shaded: () => !this.doc },
          { shaded: true },
          { shaded: true },
        ], 'HmMAIN01') },
        { shaded: true },
      ], 'HmMAIN0');
      const navMenu = () => mk(msg('mtNavig'), 'mNaviga', [
        { submenu: () => getlocWindow(this) },
        { action: () => this.go(params.homepage) },
        { action: () => this.back(), shaded: () => this.grey(B.BACK) },
        { action: () => this.forward(), shaded: () => this.grey(B.FWD) },
        { action: () => this.reload(), shaded: () => !this.url },
        { action: () => { this.gen++; this.endFetch(); }, shaded: () => this.grey(B.STOP) },
        { shaded: true },
      ], 'HmMAIN1');
      const hotMenu = () => mk(msg('mtHotli'), 'mHotlis', [
        { submenu: () => listWindow('hot', this), shaded: () => !hotlist.length },
        { action: () => addHot(this), shaded: () => !this.url },
        { submenu: () => listWindow('del', this), shaded: () => !hotlist.length },
        { submenu: () => hotSaveBox(), shaded: () => !hotlist.length },
      ], 'HmMAIN2');
      const utilMenu = () => mk(msg('mtUtili'), 'mUtilit', [
        { submenu: () => findWindow(this), shaded: () => !this.doc },
        { ticked: () => this.bars.url, action: () => this.toggleBar('url') },
        { ticked: () => this.bars.tool, action: () => this.toggleBar('tool') },
        { ticked: () => this.bars.status, action: () => this.toggleBar('status') },
        { ticked: () => false, shaded: true },
        { ticked: () => !this.plainback, action: () => { this.plainback = !this.plainback; this.win.invalidate(); } },
      ], 'HmMAIN4');
      return mk('Bookworm', 'mBrowse1', [
        { submenu: fileMenu },
        { submenu: navMenu },
        { submenu: hotMenu },
        { shaded: true },
        { submenu: utilMenu },
      ], 'HmMAIN');
    }

    destroy() {
      views.delete(this);
      this.gen = (this.gen ?? 0) + 1;
      this.animStop?.();
      for (const p of [this.bbar, this.urlbar, this.status]) p.delete();
      this.win.delete();
      this._lists?.forEach((w) => w.delete());
    }
  }

  // ---------------------------------------------------------------- helpers
  function fontCss(face, italic, bold, scale = 1) {
    return fontsCss(fmt.fontName(face, italic, bold), params.fontsize * scale / 16);
  }
  function fixURL(u) {
    if (!u) return u;
    if (!u.includes(':')) return 'http://' + u;
    return u;
  }
  function addHot(v) {
    if (!v.url) return;
    const i = hotlist.findIndex((h) => h.url === v.url);
    if (i >= 0) hotlist.splice(i, 1);
    if (hotlist.length >= params.maxhot) { task.reportError(msg('ERR03')); return; }
    hotlist.unshift({ url: v.url, title: v.title ?? v.url });
    saveHotlist();
    for (const x of views) x.setButtons();
  }

  // Menu strings: ">Save      F3,Export,Print...  Print" -> [{text, key, dotted}]
  function parseMenu(s) {
    const out = [];
    for (const group of s.split('|')) {
      const items = group.split(',');
      items.forEach((it) => {
        const t = it.replace(/^>/, '');
        const m = /^(.*?)\s{2,}(\S.*)$/.exec(t);
        out.push({ text: m ? m[1] : t, key: m ? m[2] : undefined });
      });
      if (out.length) out[out.length - 1].dotted = true;
    }
    if (out.length) out[out.length - 1].dotted = false;
    return out;
  }

  // Save boxes (File > Save = source HTML, Export > Plain text)
  function saveBox(v) {
    return saveAs({ task, title: 'Save as', filename: msg('htmfile'), filetype: 0xFAF, getData: () => v.source ?? new Uint8Array(0) });
  }
  function textBox(v) {
    return saveAs({ task, title: 'Save as', filename: msg('txtfile'), filetype: 0xFFF, getData: () => pageText(v) });
  }
  function hotSaveBox() {
    return saveAs({ task, title: 'Save as', filename: msg('HotFile'), filetype: 0xFAF, getData: () => hotlistHTML() });
  }
  function pageText(v) {
    if (!v.layout) return '';
    const out = [];
    for (const l of v.layout.lines) {
      let s = ' '.repeat(Math.max(0, Math.round(fmt.startX(l, v.doc.tokens, v.displayWidth) / 32) - 1));
      for (const c of l.chunks) {
        const t = v.doc.tokens[c.t];
        if (t.kind === 'text') s += t.text.substr(c.o, c.l).replace(/\n$/, '');
        else if (t.kind === 'hr') s += '-'.repeat(60);
        else if (t.kind === 'bullet') s += '* ';
        else if (t.kind === 'img' && t.img.alt) s += `[${t.img.alt}]`;
      }
      if (l.chunks.length && l.h > 4) out.push(s.replace(/\s+$/, ''));
    }
    return out.join('\n') + '\n';
  }

  // Hotlist / history list dialogue ('hotlist' template; Hotlist.c)
  function listWindow(kind, v) {
    const entries = () => (kind === 'history' ? [...ghistory].reverse().map((u) => ({ url: u, title: u })) : hotlist);
    const w = task.createWindowFromTemplate(tpl, 'hotlist', { workButton: 'doubleclick', spriteArea: spr });
    (v._lists ??= new Set()).add(w);
    w.setTitle(kind === 'history' ? msg('HTHIST') : kind === 'del' ? msg('HTDEL') : msg('HTSEL'));
    const LH = 22;
    const size = () => { const n = entries().length; w.setExtent({ x0: 0, y0: 0, x1: 750, y1: Math.max(LH * n, 390) }); };
    size();
    const css = fontsCss(fmt.fontName('dialogue', false, false), params.fontsize / 16);
    w.useCanvas((g, r) => {
      const rect = { y: r.y0, h: r.y1 - r.y0 };
      g.font = css;
      g.textBaseline = 'alphabetic';
      entries().forEach((e, i) => {
        const y = (i + 1) * LH;
        if (y < rect.y || y - LH > rect.y + rect.h) return;
        let x = 4;
        if (kind === 'del') { g.fillStyle = '#ff0000'; g.fillText('×', x, y - LH / 4 - 1); x += 12; }
        g.fillStyle = '#000000';
        g.fillText(e.title, x, y - LH / 4 - 1);
      });
    }, { hiDPI: true });
    w.helpText = msg(kind === 'history' ? 'HdHIST' : kind === 'del' ? 'HdHOTLD' : 'HdHOTL');
    const pick = (ev) => {
      const i = Math.floor(ev.y / LH), list = entries();
      if (i < 0 || i >= list.length) return;
      if (kind === 'del') { hotlist.splice(i, 1); saveHotlist(); size(); w.invalidate(); for (const x of views) x.setButtons(); if (!hotlist.length) { wimp.menus.close(); w.close(); } return; }
      v.go(list[i].url);
      if (ev.button !== 'adjust') { if (w._menuWindow) wimp.menus.close(); w.close(); }
    };
    w.on('doubleclick', (ev) => { if (ev.button !== 'menu') pick(ev); return true; });
    w.on('close', (ev) => { ev.preventDefault(); w.close(); });
    w.openAt = (ev) => {
      const W = 427, H = 396;
      const x = Math.max(0, Math.min(wimp.width - W - 30, (ev?.sx ?? input.mouseX) - 64)), y = Math.max(40, Math.min(wimp.height - H - 60, (ev?.sy ?? input.mouseY) - 40));
      w.open({ x, y, w: W, h: H, scrollX: 0, scrollY: 0, behind: 'top' });
    };
    return w;
  }

  // Find dialogue ('find' template)
  function findWindow(v) {
    const w = task.createWindowFromTemplate(tpl, 'find', { spriteArea: spr });
    (v._lists ??= new Set()).add(w);
    const I = w.icons;
    I[2].bufLen = 256;
    if (v.lastFind) I[2].setText(v.lastFind.text);
    I[6].setState({ selected: !!v.lastFind?.caseSens });
    w.helpText = msg('HdFIND');
    [[0, 'HdFIND0'], [1, 'HdFIND1'], [2, 'HdFIND2'], [5, 'HdFIND5'], [6, 'HdFIND6']].forEach(([i, t]) => { I[i].help = msg(t); });
    const done = () => { if (w._menuWindow) wimp.menus.close(); w.close(); };
    const find = (next) => {
      const text = I[2].text;
      if (!text || !v.doc) return false;
      const cs = I[6].selected;
      v.lastFind = { text, caseSens: cs };
      const toks = v.doc.tokens;
      let st = { t: 0, o: 0 };
      if (next) {
        if (v.found) st = { t: v.found.t, o: v.found.o + 1 };
        else { const l = v.topLine(); if (l?.chunks[0]) st = { t: l.chunks[0].t, o: l.chunks[0].o }; }
      }
      const needle = cs ? text : text.toLowerCase();
      for (let tn = st.t; tn < toks.length; tn++) {
        const t = toks[tn];
        if (t.kind !== 'text') continue;
        const hay = cs ? t.text : t.text.toLowerCase();
        const i = hay.indexOf(needle, tn === st.t ? st.o : 0);
        if (i >= 0) {
          v.found = { t: tn, o: i, l: text.length };
          v.showToken(tn, i);
          v.win.invalidate();
          return true;
        }
      }
      v.found = null; v.win.invalidate();
      wimp.beep();
      return false;
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.iconIndex === 0) { if (find(false) && ev.button === 'select') done(); return true; }
      if (ev.iconIndex === 5) { find(true); return true; }
      if (ev.iconIndex === 1) { if (ev.button === 'select') done(); return true; }
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { if (find(false)) done(); return true; }
      if (ev.code === 27) { done(); return true; }
    });
    w.on('menuopen', () => wimp.setCaret(w, I[2], I[2].text.length));
    w.openAt = (ev) => {
      w.open({ x: Math.max(0, Math.min(wimp.width - w.w - 30, (ev?.sx ?? 200) - 64)), y: Math.max(40, (ev?.sy ?? 200) - 60), behind: 'top' });
      wimp.setCaret(w, I[2], I[2].text.length);
    };
    return w;
  }

  // Open URL dialogue ('getloc' template)
  function getlocWindow(v) {
    const w = task.createWindowFromTemplate(tpl, 'getloc', { spriteArea: spr });
    (v._lists ??= new Set()).add(w);
    const I = w.icons;
    I[2].setText(msg('GETLOC'));
    I[3].bufLen = 512;
    I[3].setText(v.url ?? '');
    w.helpText = msg('HdGETLOC');
    [[0, 'HdGETLOC0'], [1, 'HdGETLOC1'], [3, 'HdGETLOC3']].forEach(([i, t]) => { I[i].help = msg(t); });
    const done = () => { if (w._menuWindow) wimp.menus.close(); w.close(); };
    const open = () => { const u = I[3].text.trim(); if (u) v.go(fixURL(u)); };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.iconIndex === 0) { open(); if (ev.button === 'select') done(); return true; }
      if (ev.iconIndex === 1) { if (ev.button === 'select') done(); return true; }
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { open(); done(); return true; }
      if (ev.code === 27) { done(); return true; }
    });
    w.on('menuopen', () => wimp.setCaret(w, I[3], I[3].text.length));
    return w;
  }

  // ---------------------------------------------------------------- Info & Choices
  const info = task.createWindowFromTemplate(tpl, 'info', { spriteArea: spr });
  info.icons[1].setText('Bookworm');
  info.icons[4].setText(VERSION);
  info.helpText = msg('HdINFO');

  let choices = null;
  function choicesWindow() {
    if (choices) return choices;
    const w = choices = task.createWindowFromTemplate(tpl, 'Choices', { spriteArea: spr });
    const I = w.icons;
    const opts = [[4, 'urlbar'], [5, 'toolbar'], [6, 'statusbar'], [7, 'delayimages'], [8, 'displaybgs']];
    const fontIcons = [[12, 'serif'], [15, 'sans'], [18, 'fixed']];
    w.helpText = msg('HdCH');
    I.forEach((ic, i) => { const h = M['HdCH' + i.toString(36)]; if (h) ic.help = h.replace(/^\\S/, 'Click SELECT to '); });
    for (const [i] of fontIcons) I[i].bufLen = 64;
    const reset = () => {
      for (const [i, k] of opts) I[i].setState({ selected: !!params[k] });
      for (const [i, f] of fontIcons) I[i].setText(params.faces[f]?.names[0] ?? '');
    };
    const defaults = () => {
      for (const [i, k] of opts) I[i].setState({ selected: !!defaultParams[k] });
      I[12].setText('Trinity.Medium'); I[15].setText('Homerton.Medium'); I[18].setText('Corpus.Medium');
    };
    const read = () => {
      for (const [i, k] of opts) params[k] = I[i].selected;
      const def = (face, name) => {
        const f = params.faces[face] ?? { name: face, names: ['', '', '', ''], alt: '' };
        const names = [name, modified(name, ['Italic', 'Oblique']), modified(name, ['Bold']), ''];
        names[3] = modified(names[2], ['Italic', 'Oblique']);
        params.faces[face] = { ...f, names };
      };
      for (const [i, f] of fontIcons) def(f, I[i].text);
      def('system', I[18].text);
      fmt = formatter();
      for (const v of views) { v.plainback = !params.displaybgs; if (v.doc) v.loadFonts().then(() => v.reformat(true)); v.setStatus(); }
    };
    // modified_font(): try <font>.<style>, then replacing the last component
    const modified = (orig, styles) => {
      for (const s of styles) {
        if (metrics[`${orig}.${s}`]) return `${orig}.${s}`;
        const d = orig.lastIndexOf('.');
        if (d > 0 && metrics[`${orig.slice(0, d)}.${s}`]) return `${orig.slice(0, d)}.${s}`;
      }
      return orig;
    };
    const fontMenu = (i) => {
      const fams = new Map();
      for (const n of Object.keys(metrics)) { const [fam, ...st] = n.split('.'); if (!fams.has(fam)) fams.set(fam, []); fams.get(fam).push(st.join('.')); }
      return new Menu(msg('Fontmenu'), [...fams].sort((a, b) => a[0].localeCompare(b[0])).map(([fam, styles]) => ({
        text: fam,
        ticked: () => I[i].text.split('.')[0] === fam,
        action: () => I[i].setText(`${fam}.${styles.includes('Medium') ? 'Medium' : styles[0]}`.replace(/\.$/, '')),
        submenu: styles.length > 1 || styles[0] ? new Menu(fam, styles.map((s) => ({ text: s || 'Regular', ticked: () => I[i].text === `${fam}.${s}`, action: () => I[i].setText(s ? `${fam}.${s}` : fam) }))) : undefined,
      })));
    };
    w.on('click', (ev) => {
      const i = ev.iconIndex;
      if (ev.button === 'menu' && ![13, 16, 19].includes(i)) return;
      switch (i) {
        case 1: reset(); break;
        case 0: case 2: read(); if (i === 2) saveParams(); break;
        case 3: defaults(); break;
        case 13: case 16: case 19: {
          const ic = I[i];
          wimp.menus.open(fontMenu(i - 1), w.x + (ic.bbox.x0 - w.scrollX) + 22 + 1, w.y + (ic.bbox.y0 - w.scrollY), { task });
          return true;
        }
        default: return;
      }
      if ([0, 1, 2].includes(i) && ev.button === 'select') w.close();
      return true;
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { read(); w.close(); return true; }
      if (ev.code === 27) { reset(); w.close(); return true; }
    });
    w.reset = reset;
    return w;
  }
  function saveParams() {
    const fyn = (k, v) => `${k.padEnd(16)}${v ? 'Yes' : 'No'}\n`;
    const hex = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');
    let s = paramsText.split(/\r?\n/).filter((l) => l.startsWith(';')).join('\n') + '\n\n';
    s += `HomePage        ${params.homepage}\n` + fyn('SystemFont', params.systemfont) +
      `VHistSize       ${params.maxvhistory}\nGHistSize       ${params.maxghistory}\nMaxHotlist      ${params.maxhot}\n` +
      `History         ${params.historyfile}\nHotList         ${params.hotlistfile}\nFontSize        ${params.fontsize}\n`;
    for (const f of ['sans', 'serif', 'fixed', 'system', 'dialogue']) if (params.faces[f]) s += `Font            ${typefaceDesc(params.faces[f])}\n`;
    s += fyn('Toolbar', params.toolbar) + fyn('URLBar', params.urlbar) + fyn('StatusBar', params.statusbar) + fyn('DelayImages', params.delayimages) + fyn('DisplayBGs', params.displaybgs) +
      `MaxImages       ${params.maximages}\nPageColour      ${hex(params.col_back)}\nTextColour      ${hex(params.col_text)}\nLinkColour      ${hex(params.col_link)}\nUsedColour      ${hex(params.col_used)}\n` +
      fyn('FixedPointer', params.fixedptr) +
      (params.proxy ? `Proxy           ${params.proxy}\n` : '') + (params.post_in ? `PostIn          ${params.post_in}\n` : '') + (params.post_out ? `PostOut         ${params.post_out}\n` : '') + 'END\n';
    try { vfs.writeFile(dir + '.Params', s, { filetype: 0xFFF }); paramsText = s; } catch (e) { task.reportError(e.message); }
  }

  // ---------------------------------------------------------------- icon bar (IconBar.c)
  const newView = (url) => { const v = new View(); v.go(url); v.focus(); return v; };
  const quit = () => { saveHistory(); for (const v of [...views]) v.destroy(); task.quit(); };
  const ibMenu = () => new Menu('Bookworm', parseMenu(msg('mBrowse')).map((n, i) => ({
    text: n.text, dotted: n.dotted, help: msg('HmIBAR' + i),
    ...[{ submenu: info }, { action: () => { const w = choicesWindow(); w.reset(); if (!w.isOpen) w.open({ behind: 'top' }); else w.bringToFront(); } }, { action: quit }][i],
  })));
  task.addIconbarIcon({
    sprite: '!app', area: spr, side: 'right',
    help: msg('HIBAR'),
    onClick: (ev) => { if (ev.button !== 'menu') newView(params.homepage); },
    menu: ibMenu,
    onDataLoad: (ev) => {
      const f = ev.files?.[0] ?? ev;
      if (f?.path && (f.filetype === 0xFAF || f.filetype === 0xFFF)) newView(pathToURL(f.path));
    },
  });
  task.onMessage('DataOpen', (m) => {
    if (m.filetype !== 0xFAF) return false;
    newView(pathToURL(m.path));
    return true;
  });
  task.onMessage('Quit', () => { quit(); return true; });
  task.onMessage('PreQuit', () => { saveHistory(); return false; });
  task.on('quit', () => saveHistory());
  // running again: a file arrives as DataOpen (above); without one nothing happens, as the original
  wimp.on?.('modechange', () => { for (const v of views) v.reformat(true); });

  // test hook
  task.bookworm = { views, newView, hotlist, params, resolveURL, urlToPath, images };

  if (ctx.file) newView(pathToURL(ctx.file));
}

function widthPx(css, s) {
  const c = widthPx.ctx ??= document.createElement('canvas').getContext('2d');
  c.font = css;
  return c.measureText(s).width;
}
function fontsCss(name, pt) { return desktopFonts.cssFor(name, pt); }
