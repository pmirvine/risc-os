// !AREncode - the Acorn Replay compressor front end (Uniqueway Ltd / Acorn, 1994), as shipped in
// $.Replay on the RISC OS 3.71 hard disc. The original !RunImage is object code only (no source in the
// tree), so this recreation follows its Templates, its `messages` file (read from the application
// directory at run time), the !Help and $.Replay.!ReadMe (which documents every window).
//
// Windows (Templates): edithdr "Replay compressor" (the Compress / Control window: header details,
// helpful sprite, single-/multi-tasking, Compress / Join / Continue), cvtwin "Movie setup",
// compress "Configure compressor", filters + fpane "Filters", tracks "Sound tracks",
// summary (the running task's log), xfersend, query, progInfo.
//
// What does not exist here is the compressor itself: the batch compressors (<ARMovie$Dir>.MovingLine,
// Decomp7, Decomp17 ...BatchComp) and the Join tool are ARM code. Compress sets up the work directory
// (Header, Sprite) and starts the "Differ_task" exactly like the original, then reports that the
// compressor could not initialise, in the summary log and in a "Message from AREncode" box.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { os } from '../../core/os.js';
import { loadMessages, parseMessagesText } from '../../core/messages.js';
import { loadTemplates } from '../../core/templates.js';
import { loadManifest, spritesFromFile, SpriteInfo } from '../../core/sprites.js';
import { saveAs } from '../../core/dialogs.js';
import { readHeader, parseInfoFile } from '../ARPlayer/armovie.js';

const TPL = 'assets/templates/AREncode.json';
const FT_ARMOVIE = 0xAE7, FT_SPRITE = 0xFF9, FT_TEXT = 0xFFF, FT_DATA = 0xFFD;

// The video decompressors / batch compressors of the original !ARMovie (their directories are ARM code
// and codec data, not on the seed disc): Info file contents (name; copyright; bpp; x step;min;max;
// y step;min;max; temporal/spatial; colour spaces). Directories found on the disc take precedence.
const KNOWN_TYPES = {
  1: { dir: 'MovingLine', name: 'Moving Lines', x: '1;1;1280', y: '1;1;1024', spaces: 'YUV 5,5,5; RGB 5,5,5', batch: true },
  2: { dir: 'Decomp2', name: '15 bit colour uncompressed', spaces: 'YUV 5,5,5; RGB 5,5,5' },
  3: { dir: 'Decomp3', name: 'YYUV uncompressed', spaces: 'YUV 5,5,5' },
  4: { dir: 'Decomp4', name: '8 bit monochrome uncompressed', spaces: '8' },
  5: { dir: 'Decomp5', name: '4Y1UV uncompressed', spaces: 'YUV 5,5,5' },
  6: { dir: 'Decomp6', name: '16Y1UV uncompressed', spaces: 'YUV 5,5,5' },
  7: { dir: 'Decomp7', name: 'Moving Blocks', x: '4;4;1280', y: '4;4;1024', spaces: 'YUV 5,5,5', batch: true },
  8: { dir: 'Decomp8', name: '24 bit colour uncompressed', spaces: 'YUV 8,8,8; RGB 8,8,8' },
  9: { dir: 'Decomp9', name: 'YYUV8 uncompressed', spaces: 'YUV 8,8,8' },
  17: { dir: 'Decomp17', name: 'Moving Blocks HQ', x: '4;4;1280', y: '4;4;1024', spaces: 'YUV 5,5,5', batch: true },
};
// The image filters supplied with Replay ($.Replay.!ReadMe, "Filtering a movie").
const KNOWN_FILTERS = ['DirectY', 'SharpenY', 'SMedian5', 'SMedian9', 'SmoothY5', 'SmoothY9', 'TClamp'];
// 256-colour (or deeper) screen modes offered by the mode arrows in the Compress window.
const MODES = [10, 13, 15, 21, 24, 28, 32, 36, 40, 44, 45, 46, 47, 48, 49];

const DEFAULTS = {
  single: true, mode: '28', deleteOnJoin: true,
  divisor: 1, fpc: 0, startAt: false, start: 0, index: false, indexN: 1, joinKeys: true,
  compressor: 1, makeKeys: true, cmode: 'size', latency: '0.5', rate: 150, doubleBuf: false, faster: false, arm2: false,
  quality: 10, frameSize: 5800, filters: [],
};

/** C printf subset used by the messages (%s %d %g). */
function fmt(s, ...a) {
  let i = 0;
  return String(s).replace(/%(0?)(\d*)([dsgi%])/g, (m, z, w, c) => {
    if (c === '%') return '%';
    let v = a[i++];
    if (c === 'd' || c === 'i') v = String(Math.trunc(Number(v) || 0));
    else if (c === 'g') v = String(+Number(v).toPrecision(6));
    else v = String(v ?? '');
    return w ? v.padStart(+w, z ? '0' : ' ') : v;
  });
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const leafOf = (p) => { const s = String(p); const i = s.lastIndexOf('.'); return i >= 0 ? s.slice(i + 1) : s; };

export default async function start(task, ctx) {
  const vfs = os.vfs, sysvars = os.sysvars;
  const exists = (p) => { try { return vfs.exists(p); } catch { return false; } };

  // ------------------------------------------------------------------ !Run
  if (!sysvars.get('ARMovie$Dir')) {
    await task.reportError('ARMovie resources not found. Please open a directory display containing the !ARMovie application.');
    task.quit(); return;
  }
  if (!sysvars.get('ARWork$Dir')) {
    await task.reportError('Cannot find !ARWork application for temporary file storage.');
    task.quit(); return;
  }
  const appDir = ctx.dir || ctx.app.appDir;
  sysvars.set('AREncode$Dir', appDir);
  sysvars.set('AREncode$Path', '<AREncode$Dir>.', 'macro');
  sysvars.set('AREncode$OptionsFile', `${appDir}.!Choices`);
  sysvars.set('AREncode$WorkDir', '<ARWork$Dir>.AREncode', 'macro');
  const armovieDir = () => sysvars.get('ARMovie$Dir');
  const workRoot = () => sysvars.get('AREncode$WorkDir') || `${sysvars.get('ARWork$Dir')}.AREncode`;

  // ------------------------------------------------------------------ resources
  let dict = {};
  try { dict = parseMessagesText(await vfs.readText(`${appDir}.messages`)); } catch { /* none */ }
  if (!Object.keys(dict).length) dict = (await loadMessages('AREncode')).dict;
  const has = (t) => t in dict;
  const M = (t, ...a) => fmt(has(t) ? dict[t] : t, ...a);
  const tpl = await loadTemplates(TPL);
  const area = new Map([...[...await loadManifest('ARPlayer', 'Sprites22')].filter(([k]) => /uniqueway/.test(k)), ...await loadManifest('AREncode', '!Sprites')]);

  // ------------------------------------------------------------------ help
  const winHelp = (w, prefix) => {
    w.on('helprequest', (ev) => {
      const i = ev.icon ? w.icons.indexOf(ev.icon) : -1;
      if (i >= 0) {
        const ic = w.icons[i];
        if (ic.selected && has(`${prefix}${i}S`)) { ev.text = M(`${prefix}${i}S`); return; }
        if (has(`${prefix}${i}`)) { ev.text = M(`${prefix}${i}`); return; }
      }
      ev.text = M(prefix);
    });
  };
  const menuHelp = (tok, { ticked, shaded } = {}) => () => {
    if (shaded?.() && has(tok + 'G')) return M(tok + 'G');
    if (ticked?.() && has(tok + 'S')) return M(tok + 'S');
    return has(tok) ? M(tok) : null;
  };
  // "hdrmenu:>a,b,c|>d,e" -> [[{text, dbox}], …] groups separated by '|'
  const menuGroups = (tok) => M(tok).split('|').map((g) => g.split(',').map((s) => ({ text: s.replace(/^>/, ''), dbox: s.startsWith('>') })));

  // ------------------------------------------------------------------ choices (AREncode$OptionsFile)
  const opts = structuredClone(DEFAULTS);
  try {
    const f = sysvars.get('AREncode$OptionsFile');
    if (exists(f)) {
      const lines = (await vfs.readText(f)).split('\n');
      for (const l of lines.slice(1)) {
        const m = /^(\w+):(.*)$/.exec(l);
        if (!m || !(m[1] in DEFAULTS)) continue;
        const d = DEFAULTS[m[1]];
        opts[m[1]] = Array.isArray(d) ? m[2].split(',').filter(Boolean) : typeof d === 'boolean' ? m[2] === '1' : typeof d === 'number' ? +m[2] : m[2];
      }
    }
  } catch { /* defaults */ }
  function saveChoices() {
    const f = sysvars.get('AREncode$OptionsFile');
    const body = [M('pref0'), ...Object.keys(DEFAULTS).map((k) => {
      const v = opts[k];
      return `${k}:${Array.isArray(v) ? v.join(',') : typeof v === 'boolean' ? (v ? 1 : 0) : v}`;
    })].join('\n') + '\n';
    try { vfs.writeFile(f, body, { filetype: FT_TEXT }); } catch (e) { task.reportError(e.message); }
  }

  // ------------------------------------------------------------------ compressors / decompressors
  const types = structuredClone(KNOWN_TYPES);
  try {
    for (const e of vfs.list(armovieDir())) {
      if (e.type !== 'dir') continue;
      const m = /^Decomp(\d+)$/i.exec(e.name);
      const n = m ? +m[1] : /^MovingLine$/i.test(e.name) ? 1 : 0;
      if (!n || !exists(`${e.path}.Info`)) continue;
      const lines = (await vfs.readText(`${e.path}.Info`)).split('\n');
      types[n] = { dir: e.name, name: lines[0].trim(), x: lines[3]?.trim(), y: lines[4]?.trim(), spaces: lines[6]?.trim() ?? '', batch: exists(`${e.path}.BatchComp`) || !!types[n]?.batch };
    }
  } catch { /* use the table */ }
  const compressors = Object.entries(types).filter(([, t]) => t.batch).map(([n, t]) => ({ n: +n, ...t }));
  const comp = () => compressors.find((c) => c.n === opts.compressor) ?? compressors[0];
  const filtersAvailable = [...KNOWN_FILTERS];

  // ------------------------------------------------------------------ state
  let movie = null;            // {path, leaf, hdr, dir, sprite, spriteBytes, tracks: [{path, leaf, hdr}], edited}
  let running = null;          // summary task state
  let setupSaved = null;       // cvtwin values at open (Cancel)

  const workDirOf = (m) => `${workRoot()}.${m.leaf}`;
  const workDirs = () => { try { return vfs.list(workRoot()).filter((e) => e.type === 'dir'); } catch { return []; } };
  const hasWork = () => (movie && exists(workDirOf(movie))) || workDirs().length > 0;

  // ------------------------------------------------------------------ query box ("Message from AREncode")
  function ask(message, buttons) {
    return new Promise((resolve) => {
      const w = task.createWindowFromTemplate(tpl, 'query', { spriteArea: area });
      const I = w.icons;
      I[1].setText(message);
      const map = [[0, buttons[0]], [3, buttons[1]], [2, buttons[2]]];
      for (const [i, t] of map) { if (t) I[i].setText(t); else I[i].setState({ deleted: true }); }
      const done = (v) => { w.delete(); resolve(v); };
      w.on('click', (ev) => { const m = map.find(([i]) => w.icons[i] === ev.icon); if (m?.[1] && ev.button !== 'menu') done(m[1]); return true; });
      w.on('key', (ev) => { if (ev.code === 13) { done(buttons[0]); return true; } if (ev.code === 27) { done(buttons[buttons.length - 1]); return true; } return false; });
      w.open({ x: (wimp.width - w.w) / 2, y: (wimp.height - w.h) / 2 - 40, behind: 'top' });
      wimp.setCaret(w);
    });
  }

  // ------------------------------------------------------------------ number fields with arrows
  function arrows(w, spec, onChange) {
    // spec: { field: [up, down, min, max, step] }
    w.on('click', (ev) => {
      const i = w.icons.indexOf(ev.icon);
      for (const [f, [up, down, min, max, step = 1]] of Object.entries(spec)) {
        if (i !== up && i !== down) continue;
        const dir = (i === up ? 1 : -1) * (ev.button === 'adjust' ? -1 : 1);
        const ic = w.icons[+f];
        const dec = String(step).includes('.') ? String(step).split('.')[1].length : 0;
        const v = clamp((parseFloat(ic.text) || 0) + dir * step, typeof min === 'function' ? min() : min, typeof max === 'function' ? max() : max);
        ic.setText(v.toFixed(dec));
        onChange?.(+f, v);
        return true;
      }
      return undefined;
    });
  }
  const opt = (ic, on) => ic.setState({ selected: !!on });

  // ================================================================== progInfo
  const progInfo = task.createWindowFromTemplate(tpl, 'progInfo', { spriteArea: area });
  progInfo.icons[4].setText(ctx.app.info.version);
  for (const i of [10, 12, 13]) progInfo.icons[i]?.setState({ deleted: true });   // licence fields (unregistered copy)
  winHelp(progInfo, 'HprogInfo');

  // ================================================================== edithdr: the Compress window
  const hdrArea = new Map(area);
  const ed = task.createWindowFromTemplate(tpl, 'edithdr', { spriteArea: hdrArea });
  const E = ed.icons;
  winHelp(ed, 'Hedithdr');
  E[21].area = hdrArea;
  for (const i of [7, 8, 22]) E[i]?.setState({ deleted: true });   // "Display" box: outside the window
  let defaultSprite = null;
  try { const b = await vfs.readFile(`${armovieDir()}.Default`); defaultSprite = { bytes: b, s: [...spritesFromFile(b).values()][0] }; } catch { /* none */ }
  // the helpful sprite, scaled down to fit the Sprite box (the default one is a full-screen picture)
  let spriteSeq = 0;
  async function showSprite(s) {
    const seq = ++spriteSeq;
    if (!s) { E[21].setSprite(''); return; }
    const b = E[21].bbox, bw = b.x1 - b.x0 - 4, bh = b.y1 - b.y0 - 4;
    let info = s;
    if (s.cssW > bw || s.cssH > bh) {
      try {
        const src = await s.canvas();
        const k = Math.min(bw / s.cssW, bh / s.cssH);
        const w = Math.max(1, Math.round(s.cssW * k)), h = Math.max(1, Math.round(s.cssH * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
        info = new SpriteInfo({ name: 'arencode_sprite', w, h, osW: w * 2, osH: h * 2, url: c.toDataURL(), hasMask: s.hasMask });
      } catch { /* plot unscaled */ }
    }
    if (seq !== spriteSeq) return;
    hdrArea.set('arencode_sprite', info);
    E[21].setSprite('');
    E[21].setSprite('arencode_sprite');
  }
  function edRefresh() {
    opt(E[12], opts.single);
    E[14].setText(String(opts.mode));
    for (const i of [13, 14, 15, 16]) E[i].setState({ shaded: !opts.single });
    opt(E[23], opts.deleteOnJoin);
    const noMovie = !movie;
    const wd = movie ? workDirOf(movie) : null;
    E[2].setState({ shaded: noMovie || !movie.hdr?.videoFormat || !!running });
    E[1].setState({ shaded: noMovie || !(movie.dir || exists(`${wd}.Images0`)) || !!running });
    E[0].setState({ shaded: noMovie || !exists(`${wd}.StoppedC`) || !!running });
    for (const i of [9, 10, 11]) E[i].setState({ shaded: noMovie });
  }
  const readHdrFields = () => { if (movie) { movie.name = E[9].text; movie.date = E[10].text; movie.author = E[11].text; } };
  ed.on('click', (ev) => {
    if (ev.button === 'menu') return undefined;
    const i = E.indexOf(ev.icon);
    if (i === 12) { opts.single = E[12].selected; edRefresh(); }
    else if (i === 23) opts.deleteOnJoin = E[23].selected;
    else if (i === 2 && !E[2].shaded) compress();
    else if (i === 1 && !E[1].shaded) join();
    else if (i === 0 && !E[0].shaded) compress(true);
    else return undefined;
    return true;
  });
  arrows(ed, { 14: [15, 16, 0, 999] }, (f) => {
    // step through the 256-colour modes rather than every number
    const cur = parseInt(opts.mode, 10) || 28;
    const up = parseInt(E[14].text, 10) > cur;
    const k = MODES.indexOf(cur);
    const next = k < 0 ? 28 : MODES[clamp(k + (up ? 1 : -1), 0, MODES.length - 1)];
    opts.mode = String(next); E[14].setText(opts.mode);
  });
  ed.on('iconchanged', (ev) => { if (ev.icon === E[14]) opts.mode = E[14].text; else readHdrFields(); });
  ed.on('dataload', (ev) => { loadFiles(ev.files, { onWindow: true, icon: E.indexOf(ev.icon) }); return true; });

  // ================================================================== cvtwin: Movie setup
  const cv = task.createWindowFromTemplate(tpl, 'cvtwin', { spriteArea: area });
  const C = cv.icons;
  winHelp(cv, 'Hcvtwin');
  for (const i of [3, 4, 7, 8, 9, 10, 11, 12]) C[i].setState({ deleted: true });   // Locations / Misc: outside the window
  const nframes = () => movie?.hdr?.nframes ?? 0;
  const fpsOf = () => movie?.hdr?.fps || 12.5;
  const autoFpc = (div) => Math.max(1, Math.round(fpsOf() / div * 2));
  function cvFill(o = opts) {
    C[14].setText(String(+fpsOf().toFixed(3)));
    C[16].setText(String(o.divisor));
    C[20].setText(String(o.fpc || autoFpc(o.divisor)));
    C[24].setText(String(Math.floor(nframes() / (o.divisor || 1))));
    opt(C[26], o.startAt); C[27].setText(String(o.start));
    opt(C[31], o.index); C[32].setText(String(o.indexN));
    opt(C[35], o.joinKeys);
    for (const i of [27, 28, 29]) C[i].setState({ shaded: !o.startAt });
    for (const i of [32, 33, 34]) C[i].setState({ shaded: !o.index });
  }
  const cvRead = () => ({
    divisor: clamp(parseInt(C[16].text, 10) || 1, 1, 8), fpc: parseInt(C[20].text, 10) || 0,
    startAt: C[26].selected, start: parseInt(C[27].text, 10) || 0, index: C[31].selected, indexN: parseInt(C[32].text, 10) || 0, joinKeys: C[35].selected,
  });
  arrows(cv, { 16: [17, 18, 1, 8], 20: [21, 22, 1, 999], 27: [28, 29, 0, () => Math.max(0, nframes() - 1)], 32: [33, 34, 0, 99] }, (f, v) => {
    if (f === 16) {   // "The number of frames per chunk changes automatically as you alter the frame rate"
      C[20].setText(String(autoFpc(v)));
      C[24].setText(String(Math.floor(nframes() / v)));
      if (C[31].selected) C[32].setText(String(v));
    }
  });
  cv.on('menuopen', () => { setupSaved = structuredClone(opts); cvFill(); });
  cv.on('click', (ev) => {
    if (ev.button === 'menu') return undefined;
    const i = C.indexOf(ev.icon);
    if (i === 26 || i === 31) { const r = cvRead(); cvFill({ ...opts, ...r }); }
    else if (i === 0) { Object.assign(opts, { divisor: 1, fpc: 0, startAt: false, start: 0, index: false, indexN: 1, joinKeys: true }); cvFill(); wimp.menus.close(); }
    else if (i === 1) { if (setupSaved) Object.assign(opts, setupSaved); wimp.menus.close(); }
    else if (i === 2) { const r = cvRead(); if (r.fpc === autoFpc(r.divisor)) r.fpc = 0; Object.assign(opts, r); wimp.menus.close(); }
    return true;
  });
  cv.on('key', (ev) => { if (ev.code === 13) { const r = cvRead(); Object.assign(opts, r); wimp.menus.close(); return true; } return false; });

  // ================================================================== compress: Configure compressor
  const cw = task.createWindowFromTemplate(tpl, 'compress', { spriteArea: area });
  const K = cw.icons;
  winHelp(cw, 'Hcompress');
  // the Quality factor (23-26) and Frame size (27-31) rows are laid out below the window; the program
  // moves whichever the Compression mode needs up into the box, in place of Device latency.
  const shiftRow = (ids, fromY) => { const dy = K[10].bbox.y0 - K[fromY].bbox.y0; for (const i of ids) K[i].moveTo({ ...K[i].bbox, y0: K[i].bbox.y0 + dy, y1: K[i].bbox.y1 + dy }); };
  shiftRow([23, 24, 25, 26], 23);
  shiftRow([27, 28, 29, 30, 31], 27);
  const optRow = { y0: K[21].bbox.y0, 21: { ...K[21].bbox }, 22: { ...K[22].bbox } };
  let cwSaved = null;
  function cwFill(o = opts) {
    K[33].setText(comp()?.name ?? '');
    K[34].setState({ shaded: compressors.length < 2 });
    opt(K[32], o.makeKeys);
    opt(K[7], o.cmode === 'quality'); opt(K[8], o.cmode === 'size'); opt(K[9], o.cmode === 'bandwidth');
    K[11].setText(String(o.latency)); K[16].setText(String(o.rate));
    opt(K[20], o.doubleBuf); opt(K[21], o.faster); opt(K[22], o.arm2);
    K[24].setText(String(o.quality)); K[28].setText(String(o.frameSize));
    const show = (ids, on) => { for (const i of ids) K[i].setState({ deleted: !on }); };
    show([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], o.cmode === 'bandwidth');
    show([21, 22], o.cmode !== 'quality');
    show([23, 24, 25, 26], o.cmode === 'quality');
    show([27, 28, 29, 30, 31], o.cmode === 'size');
    // Frame size mode: Faster matching / Limit to ARM2 move up under the frame size row
    const dy = o.cmode === 'size' ? K[15].bbox.y0 - optRow.y0 : 0;
    for (const i of [21, 22]) K[i].moveTo({ ...K[i].bbox, y0: optRow[i].y0 + dy, y1: optRow[i].y1 + dy });
  }
  const cwRead = () => ({
    makeKeys: K[32].selected, cmode: K[7].selected ? 'quality' : K[9].selected ? 'bandwidth' : 'size',
    latency: K[11].text, rate: parseInt(K[16].text, 10) || 0, doubleBuf: K[20].selected, faster: K[21].selected, arm2: K[22].selected,
    quality: clamp(parseInt(K[24].text, 10) || 0, 0, 99), frameSize: parseInt(K[28].text, 10) || 0,
  });
  arrows(cw, { 11: [12, 13, 0, 99, 0.1], 16: [17, 18, 1, 99999, 10], 24: [25, 26, 0, 99], 28: [29, 30, 100, 999999, 100] });
  cw.on('click', (ev) => {
    const i = K.indexOf(ev.icon);
    if (ev.button === 'menu') return undefined;
    if (i === 7 || i === 8 || i === 9) { const r = cwRead(); r.cmode = i === 7 ? 'quality' : i === 8 ? 'size' : 'bandwidth'; cwFill({ ...opts, ...r }); }
    else if (i === 34 && !K[34].shaded) {
      const m = new Menu(M('Tdfmt'), compressors.map((c) => ({ text: c.name, ticked: () => c.n === opts.compressor, action: () => { opts.compressor = c.n; K[33].setText(c.name); } })));
      m.help = M('Hdfmt?');
      const b = K[34].bbox, p = cw.workToScreen(b.x1, b.y0);
      wimp.menus.open(m, p.x + 4, p.y, { task });
    } else if (i === 0) { const keep = opts.compressor; Object.assign(opts, { makeKeys: true, cmode: 'size', latency: DEFAULTS.latency, rate: DEFAULTS.rate, doubleBuf: false, faster: false, arm2: false, quality: DEFAULTS.quality, frameSize: DEFAULTS.frameSize }); opts.compressor = keep; cwFill(); }
    else if (i === 1) { if (cwSaved) Object.assign(opts, cwSaved); cw.close(); }
    else if (i === 2) { Object.assign(opts, cwRead()); cw.close(); }
    return true;
  });
  function openCompress() {
    if (cw.isOpen) { cw.bringToFront(); return; }
    cwSaved = structuredClone(opts); cwFill();
    cw.open({ x: cw.x, y: Math.max(40, Math.min(cw.y, wimp.height - 70 - cw.h)), behind: 'top' });
  }

  // ================================================================== filters + fpane
  const fw = task.createWindowFromTemplate(tpl, 'filters', { spriteArea: area });
  const F = fw.icons;
  winHelp(fw, 'Hfilters');
  let inUse = [];
  const makePane = (help) => {
    const p = task.createWindowFromTemplate(tpl, 'fpane', { spriteArea: area });
    const proto = p.icons[0];
    p.proto = { ...proto.bbox, flags: proto.flags };
    proto.setState({ deleted: true });
    p.on('helprequest', (ev) => { ev.text = M(help); });
    p.items = [];
    return p;
  };
  const paneA = makePane('HfpaneA'), paneB = makePane('HfpaneB');
  const rowH = (p) => p.proto.y1 - p.proto.y0;
  function fillPane(p, names) {
    for (const ic of p.items) ic.setState({ deleted: true });
    p.items = names.map((n, k) => {
      const ic = p.addIcon({ bbox: { x0: p.proto.x0, y0: p.proto.y0 + k * rowH(p), x1: p.proto.x1, y1: p.proto.y1 + k * rowH(p) }, flags: p.proto.flags & ~(1 << 21), text: n, bufLen: 16 });
      ic.data = n;
      return ic;
    });
    p.setExtent({ w: p.extent.x1 - p.extent.x0, h: Math.max(names.length * rowH(p) + 4, 120) });
  }
  const fitPane = (p, ic) => {
    const b = F[ic].bbox;
    fw.attachPane(p, { dx: b.x0 + 4, dy: b.y0 + 4, w: b.x1 - b.x0 - 8 - 20, h: b.y1 - b.y0 - 8 });
  };
  fitPane(paneA, 2); fitPane(paneB, 3);
  let fwSaved = null;
  const refreshFilters = () => { fillPane(paneA, filtersAvailable.filter((n) => !inUse.includes(n))); fillPane(paneB, inUse); };
  function paneDrag(p, ev) {
    const ic = ev.icon; if (!ic?.data) return;
    const b = ic.bbox, s = p.workToScreen(b.x0, b.y0);
    wimp.drag({ box: { x0: s.x, y0: s.y, x1: s.x + (b.x1 - b.x0), y1: s.y + (b.y1 - b.y0) }, event: ev.pointerEvent }).then((drop) => {
      if (!drop) return;
      const name = ic.data;
      if (drop.window === paneB) {
        inUse = inUse.filter((n) => n !== name);
        const at = clamp(Math.floor(((drop.y ?? 0) - paneB.proto.y0) / rowH(paneB)), 0, inUse.length);
        inUse.splice(at, 0, name);
      } else if (drop.window === paneA) inUse = inUse.filter((n) => n !== name);
      refreshFilters();
    });
  }
  for (const p of [paneA, paneB]) {
    p.on('drag', (ev) => { paneDrag(p, ev); return true; });
    p.on('click', (ev) => { if (ev.icon?.data) for (const ic of p.items) ic.setState({ selected: ic === ev.icon }); return true; });
    p.on('doubleclick', (ev) => { if (p === paneB && ev.button === 'adjust' && ev.icon?.data) { inUse = inUse.filter((n) => n !== ev.icon.data); refreshFilters(); } return true; });
  }
  fw.on('click', (ev) => {
    const i = F.indexOf(ev.icon);
    if (i === 0) { opts.filters = [...inUse]; fw.close(); }
    else if (i === 1) { inUse = [...(fwSaved ?? opts.filters)]; fw.close(); }
    return ev.button === 'menu' ? undefined : true;
  });
  function openFilters() {
    if (fw.isOpen) { fw.bringToFront(); return; }
    fwSaved = [...opts.filters]; inUse = [...opts.filters]; refreshFilters();
    fw.open({ behind: 'top' });
  }

  // ================================================================== tracks: Sound tracks
  const tw = task.createWindowFromTemplate(tpl, 'tracks', { spriteArea: area });
  const T = tw.icons;
  winHelp(tw, 'Htracks');
  T[12].setState({ deleted: true }); T[13].setState({ deleted: true });
  let tracks = [], tFile = 0, tTrack = 0, tAdpcm = false, tSaved = null;
  const chanText = (sp) => (sp.channels === 1 ? M('mono') : sp.channels === 2 ? (sp.reversed ? M('stereor') : M('stereo')) : M('nchans', sp.channels));
  const soundCoding = (sp) => {
    if (sp.format === 2) return sp.description || sp.filename;
    const tok = /A/.test(sp.filename) ? 'SoundA4' : /S/.test(sp.filename.slice(5)) ? 'SoundS8' : /U/.test(sp.filename.slice(5)) ? 'SoundU8' : 'SoundE8';
    return M(tok);
  };
  function twFill() {
    tFile = clamp(tFile, 0, Math.max(0, tracks.length - 1));
    const f = tracks[tFile];
    T[15].setText(tracks.length ? String(tFile + 1) : '0'); T[11].setText(String(tracks.length));
    T[3].setText(f?.path ?? '');
    const snd = f?.hdr?.sound ?? [];
    tTrack = clamp(tTrack, 0, Math.max(0, snd.length - 1));
    const sp = snd[tTrack];
    T[7].setText(snd.length ? String(tTrack + 1) : '0'); T[19].setText(String(snd.length));
    T[5].setText(sp ? M('Mtracks3', sp.precision, soundCoding(sp)) : '');
    T[23].setText(sp ? M('Mtracks2', sp.format, chanText(sp), sp.rate < 256 && sp.rate > 0 ? 1e6 / sp.rate : sp.rate, 'Hz') : '');
    opt(T[22], tAdpcm);
    T[21].setState({ shaded: !tracks.length });
  }
  tw.on('click', (ev) => {
    if (ev.button === 'menu') return undefined;
    const i = T.indexOf(ev.icon), dir = ev.button === 'adjust' ? -1 : 1;
    if (i === 16 || i === 17) { tFile += (i === 16 ? 1 : -1) * dir; tTrack = 0; twFill(); }
    else if (i === 8 || i === 9) { tTrack += (i === 8 ? 1 : -1) * dir; twFill(); }
    else if (i === 20) { tracks.splice(tFile + (tracks.length ? 1 : 0), 0, { path: '', hdr: null, blank: true }); if (tracks.length > 1) tFile++; twFill(); }
    else if (i === 21 && tracks.length) { tracks.splice(tFile, 1); twFill(); }
    else if (i === 22) tAdpcm = T[22].selected;
    else if (i === 0) { if (movie) { movie.tracks = tracks.filter((t) => !t.blank); movie.adpcm = tAdpcm; } tw.close(); }
    else if (i === 1) { if (tSaved) ({ tracks, tAdpcm } = tSaved); tw.close(); }
    return true;
  });
  tw.on('dataload', async (ev) => {
    for (const f of ev.files ?? []) {
      const st = vfs.stat(f.path);
      if (!st || st.filetype !== FT_ARMOVIE) continue;
      const hdr = await readMovie(st.path);
      if (!hdr) continue;
      if (!hdr.nsoundtracks) { task.reportError(M('Mtracks0', st.path)); continue; }
      const entry = { path: st.path, leaf: st.name, hdr };
      const blank = tracks.findIndex((t) => t.blank);
      if (blank >= 0) { tracks[blank] = entry; tFile = blank; }
      else { tracks = [entry]; tFile = 0; }   // replaces all the current tracks
      tTrack = 0;
    }
    twFill();
    return true;
  });
  function openTracks() {
    if (tw.isOpen) { tw.bringToFront(); return; }
    tracks = (movie?.tracks ?? []).map((t) => ({ ...t })); tAdpcm = !!movie?.adpcm; tSaved = { tracks: [...tracks], tAdpcm };
    tFile = 0; tTrack = 0; twFill(); tw.open({ behind: 'top' });
  }

  // ================================================================== summary
  const sw = task.createWindowFromTemplate(tpl, 'summary', { spriteArea: area });
  const S = sw.icons;
  winHelp(sw, 'Hsummary');
  let log = [];
  function logLine(s) {
    log.push(s);
    const last = log.slice(-4);
    for (let k = 0; k < 4; k++) S[7 + k].setText(last[k] ?? '');
  }
  const logBox = () => saveAs({ task, title: 'Save as', filename: 'Log', filetype: FT_TEXT, getData: async () => log.join('\n') + '\n' });
  sw.on('click', (ev) => {
    if (ev.button === 'menu') return undefined;
    const i = S.indexOf(ev.icon);
    if (i === 2) stopTask();                                           // Abort
    else if (i === 11 && !S[11].shaded) stopTask();                    // Suspend (nothing to save: stops)
    else if (i === 3 && running && !S[3].shaded) { running.paused = !running.paused; S[3].setState({ selected: running.paused }); }
    else if (i === 6) { const b = logBox(); const p = sw.workToScreen(S[6].bbox.x0, S[6].bbox.y1); wimp.menus.open(b, p.x, p.y, { task }); }
    return true;
  });
  sw.on('close', (ev) => {
    ev.preventDefault?.();
    (async () => {
      if (running?.active && (await ask(M('difftask5'), [M('discard'), M('cancel')])) !== M('discard')) return;
      stopTask();
    })();
    return false;
  });
  function stopTask() {
    if (running?.timer) clearTimeout(running.timer);
    running = null;
    sw.close();
    edRefresh();
    ed.open({ behind: 'top' });
  }

  // ================================================================== load movies / directories
  async function readMovie(path) {
    let bytes;
    try { bytes = await vfs.readFile(path); } catch (e) { task.reportError(e.message); return null; }
    const hdr = readHeader(bytes, () => null);
    if (!hdr) { task.reportError(M('hdr6', -1)); return null; }
    hdr.bytes = bytes;
    return hdr;
  }
  async function loadMovie(st) {
    if (running) { task.reportError(M('main1')); return; }
    let hdr, dirMode = false, headerPath = st.path;
    if (st.type === 'dir') {
      // an extracted movie (ARPlayer "Save data"): a Header text file plus Images / sound files
      headerPath = `${st.path}.Header`;
      if (!exists(headerPath)) { task.reportError(`File '${st.name}.Header' not found`); return; }
      hdr = await readMovie(headerPath); dirMode = true;
    } else hdr = await readMovie(st.path);
    if (!hdr) return;
    if (!dirMode && !hdr.videoFormat) { task.reportError(M('hdr3', st.name)); return; }
    if (hdr.videoFormat && !types[hdr.videoFormat]) { task.reportError(M('hdr6', hdr.videoFormat)); return; }
    let sprite = null, spriteBytes = null;
    if (hdr.spriteOffset > 0 && hdr.spriteSize > 0 && hdr.bytes.length >= hdr.spriteOffset + hdr.spriteSize) {
      try {
        const b = hdr.bytes.subarray(hdr.spriteOffset, hdr.spriteOffset + hdr.spriteSize);
        const file = new Uint8Array(b.length + 4); new DataView(file.buffer).setUint32(0, b.length + 4, true); file.set(b, 4);
        sprite = [...spritesFromFile(file).values()][0] ?? null; spriteBytes = file;
      } catch { /* no sprite */ }
    }
    if (!sprite && dirMode && exists(`${st.path}.Sprite`)) {
      try { spriteBytes = await vfs.readFile(`${st.path}.Sprite`); sprite = [...spritesFromFile(spriteBytes).values()][0] ?? null; } catch { /* */ }
    }
    if (!sprite && defaultSprite) { sprite = defaultSprite.s; spriteBytes = defaultSprite.bytes; }
    movie = { path: st.path, leaf: st.name, hdr, dir: dirMode, sprite, spriteBytes, name: hdr.name, date: hdr.date, author: hdr.author,
      tracks: hdr.nsoundtracks ? [{ path: dirMode ? '' : st.path, leaf: st.name, hdr }] : [], adpcm: false };
    // a work directory of the same name: its Header overrides the details (restarting a session)
    const wh = `${workDirOf(movie)}.Header`;
    if (exists(wh)) {
      try { const h = readHeader(await vfs.readFile(wh)); if (h) Object.assign(movie, { name: h.name, date: h.date, author: h.author }); }
      catch { task.reportError('Invalid header file in the work directory'); }
    }
    E[9].setText(movie.name); E[10].setText(movie.date); E[11].setText(movie.author);
    showSprite(sprite);
    edRefresh();
    ed.open({ behind: 'top' });
    wimp.setCaret(ed, E[9], E[9].text.length);
  }
  async function loadSprite(st) {
    if (!movie) return;
    let s = null, bytes;
    try { bytes = await vfs.readFile(st.path); s = [...spritesFromFile(bytes).values()][0] ?? null; } catch { /* */ }
    if (!s) { task.reportError(M('hdr4')); return; }
    const w = (movie.hdr.xsize || 0) * 2, h = (movie.hdr.ysize || 0) * 2;
    if (w && (s.osW !== w || s.osH !== h)) {
      if ((await ask(M('hdr5', w, h), ['OK', M('cancel')])) !== 'OK') return;
    }
    movie.sprite = s; movie.spriteBytes = bytes; showSprite(s);
  }
  async function loadFiles(files, { onWindow = false } = {}) {
    for (const f of files ?? []) {
      const st = vfs.stat(f.path);
      if (!st) continue;
      if (st.filetype === FT_SPRITE && onWindow) { await loadSprite(st); continue; }
      if (st.filetype === FT_ARMOVIE || st.type === 'dir') { await loadMovie(st); return; }
      task.reportError(M('hdr6', -1).replace(/video type -1/, `file type &${st.filetype.toString(16).toUpperCase()}`));
    }
  }

  // ================================================================== compress / join
  function writeWork() {
    const wd = workDirOf(movie);
    vfs.mkdir(wd, { parents: true });
    const pre = opts.index ? String(opts.indexN) : '';
    readHdrFields();
    const h = movie.hdr;
    const div = opts.divisor || 1;
    const fpc = opts.fpc || autoFpc(div);
    const c = comp();
    const lines = ['ARMovie', movie.name, movie.date, movie.author,
      `${c.n} video format`, `${h.xsize} ${M('rephdr5')}`, `${h.ysize} ${M('rephdr5')}`, `${h.bpp} ${M('rephdr6')}${h.colourspace ? ` (${h.colourspace})` : ''}`,
      `${+(h.fps / div).toFixed(3)} ${M('rephdr7')}`];
    const sp = (movie.tracks[0]?.hdr?.sound ?? [])[0];
    if (sp) lines.push(`${sp.format} ${M('rephdr0')}`, `${sp.rate} Hz ${M('rephdr1')}`, `${sp.channels} ${M('rephdr2')}`, `${sp.precision} ${M('rephdr3')}`);
    else lines.push(`0 ${M('rephdr0')}`, `0 ${M('rephdr1')}`, `0 ${M('rephdr2')}`, `0 ${M('rephdr3')}`);
    const n = Math.max(1, Math.ceil(Math.floor(h.nframes / div) / fpc));
    lines.push(`${fpc} ${M('rephdr8')}`, `${n - 1} ${M('rephdr9')}`);
    try { vfs.writeFile(`${wd}.${pre}Header`, lines.join('\n') + '\n', { filetype: FT_TEXT }); } catch { throw new Error(M('difftask10')); }
    if (movie.spriteBytes) { try { vfs.writeFile(`${wd}.Sprite`, movie.spriteBytes, { filetype: FT_SPRITE }); } catch { throw new Error(M('difftask11')); } }
    return wd;
  }
  function checkCompressor() {
    const c = comp(), h = movie.hdr;
    if (!c) return M('Mcomp2');
    const spaces = (c.spaces ?? '').toUpperCase();
    if (h.colourspace && !spaces.includes(h.colourspace.toUpperCase())) return M('Mcomp0', c.name);
    for (const [axis, v, tok] of [[c.x, h.xsize, 'Mcomp6'], [c.y, h.ysize, 'Mcomp7']]) {
      if (!axis) continue;
      const [step, min, max] = axis.split(';').map(Number);
      const why = v < min ? 'Mcomp3' : v > max ? 'Mcomp4' : v % step ? 'Mcomp5' : null;
      if (why) return M('Mcomp1', c.name, M(tok), M(why));
    }
    return null;
  }
  function startSummary(title, toolname) {
    running = { title, active: true, paused: false };
    log = [];
    S[1].setText(toolname); S[4].setText('0');
    S[5].setText(title);
    for (const i of [3, 11]) S[i].setState({ shaded: false, selected: false });
    ed.close();
    edRefresh();
    sw.open({ behind: 'top' });
  }
  function failTask(detail, lines) {
    running.timer = setTimeout(() => {
      if (!running) return;
      for (const l of lines) logLine(l);
      logLine(M('difftask6', detail));
      running.active = false;
      for (const i of [3, 11]) S[i].setState({ shaded: true });
      task.reportError(M('difftask6', detail));
    }, 700);
  }
  async function compress(cont = false) {
    if (!movie || running) return;
    const bad = checkCompressor();
    if (bad) { task.reportError(bad); return; }
    const exe = `${armovieDir()}.${comp().dir}.BatchComp`;
    let wd;
    try { wd = writeWork(); } catch (e) { task.reportError(e.message); return; }
    const c = comp();
    if (opts.single) {
      // single-tasking: the compressor takes over the screen in the chosen mode - it can't start here
      logLine(M('hdr1', movie.leaf));
      task.reportError(M('difftask6', M('difftask12')) + ` (${c.name}: ${exists(exe) ? 'ARM code' : 'no batch compressor'})`);
      edRefresh();
      return;
    }
    startSummary(M('hdr1', movie.leaf), M('difftask0'));
    logLine(M('difftask1', movie.leaf));
    logLine(`${M('difftask4')}: ${c.name}`);
    failTask(M('difftask12'), [`${c.name} batch compressor (${comp().dir}.BatchComp) unavailable`, `Work directory ${wd}`]);
  }
  function join() {
    if (!movie || running) return;
    startSummary(M('difftask3', movie.leaf), M('difftask2'));
    logLine(M('difftask3', movie.leaf));
    failTask(`'Join' is ARM code, which cannot be run on this computer`, [`${armovieDir()}.Tools.Join`]);
  }

  // ================================================================== menus
  const [grpA, grpB] = menuGroups('hdrmenu');
  const noEncoded = () => true;   // nothing is ever encoded here
  const xfer = () => {
    const w = task.createWindowFromTemplate(tpl, 'xfersend', { spriteArea: area });
    w.icons[4].setState({ deleted: true });
    w.icons[3].setSprite('file_ae7');
    w.icons[2].setText(movie?.leaf ?? 'Movie');
    w.on('menuclosed', () => setTimeout(() => w.delete(), 0));
    return w;
  };
  const deleteMenu = () => new Menu(M('Tdelete'), workDirs().map((d) => ({
    text: d.name,
    shaded: () => !exists(d.path),
    action: () => { try { vfs.delete(d.path, { recursive: true, force: true }); } catch (e) { task.reportError(e.message); } edRefresh(); },
  })));
  const hdrMenu = () => new Menu(M('taskname'), [
    { text: grpA[0].text, shaded: noEncoded, submenu: xfer, help: menuHelp('HHELP0', { shaded: noEncoded }) },
    { text: grpA[1].text, action: () => { const p = movie && exists(workDirOf(movie)) ? workDirOf(movie) : workRoot(); if (exists(p)) os.filer.openDir(p); }, shaded: () => !hasWork(), help: menuHelp('HHELP1', { shaded: () => !hasWork() }) },
    { text: grpA[2].text, dotted: true, shaded: () => !workDirs().length, submenu: deleteMenu, help: menuHelp('HHELP2', { shaded: () => !workDirs().length }) },
    { text: grpB[0].text, submenu: cv, help: menuHelp('HHELP3') },
    { text: grpB[1].text, shaded: () => !compressors.length, action: openCompress, help: menuHelp('HHELP4', { shaded: () => !compressors.length, ticked: () => cw.isOpen }) },
    { text: grpB[2].text, shaded: () => !filtersAvailable.length, action: openFilters, help: menuHelp('HHELP5', { shaded: () => !filtersAvailable.length, ticked: () => fw.isOpen }) },
    { text: grpB[3].text, action: openTracks, help: menuHelp('HHELP6', { ticked: () => tw.isOpen }) },
  ]);
  ed.menu = hdrMenu;
  const im = menuGroups('imenu')[0];
  const iconMenu = new Menu(M('taskname'), [
    { text: im[0].text, submenu: progInfo, help: menuHelp('IMENU0') },
    { text: im[1].text, action: saveChoices, help: menuHelp('IMENU1') },
    { text: im[2].text, action: () => quit(), help: menuHelp('IMENU2') },
  ]);
  async function quit() {
    if (running?.active) { task.reportError(M('main3')); return; }
    task.quit();
  }

  task.addIconbarIcon({
    sprite: ctx.app.sprite, side: 'right',
    onClick: () => { edRefresh(); ed.open({ behind: 'top' }); },   // a blank Compress window to drop a movie into
    menu: iconMenu, help: M('ICON'),
    onDataLoad: (ev) => { loadFiles(ev.files); return true; },
  });
  task.onMessage('Quit', () => task.quit());
  task.onMessage('PreQuit', (m) => { if (running?.active) { m.object?.(); task.reportError(M('main3')); } });
  task.on('run', ({ file }) => { if (file) loadFiles([{ path: file }]); });
  edRefresh();
  if (ctx.file) loadFiles([{ path: ctx.file }]);

  task.arencode = { get movie() { return movie; }, get running() { return running; }, opts, compressors, windows: { ed, cv, cw, fw, tw, sw, paneA, paneB }, loadFiles, compress, saveChoices, get log() { return log; } };
}
