// !ChangeFSI - image mastering (Sophie Wilson / Acorn). Desktop front end reproduced from the
// Wimp part of Sources/Apps/ChangeFSI/source/ChangeFSI (1.12, 13 Mar 95): icon bar menu with the
// Scaling / Processing / Sprite Output / JPEG Output dialogues (3dTemplate), drag a picture to the
// icon bar to convert it, the result appears in a picture window whose menu gives Image, Source and
// Range info, the Zoom (magnifier) box, Save image and Reprocess. Choices are saved to
// <ChangeFSI$Dir>.Choices in the original format.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { saveAs, query } from '../../core/dialogs.js';
import { loadTemplates } from '../../core/templates.js';
import { decodeSpriteFile } from '../../core/spritefile.js';
import { os } from '../../core/os.js';
import { decodeImage, convert, parseMode } from './fsi.js';

const DEFAULT_MSGS = [' processed in ', ' seconds', "Image created from '", "' not saved: do you really want to exit?",
  'Image info', 'Source info', 'Range info', 'Zoom', 'Save image', 'Reprocess', 'Info', 'Scaling', 'Processing',
  'Sprite Output', 'Fast', 'Save Choices', 'Quit', 'Scale to fill ', ' by ', 'Range not used', 'ChangeFSI',
  '1.12 (13 Mar 95)', 'Incorrect value for ', ' in ', ' dialogue box.', 'JPEG quality', 'mode number', 'JPEG Output',
  'Overwrite source file?'];

export default async function start(task, ctx) {
  const { vfs } = os;
  const dir = ctx.dir || 'ADFS::HardDisc4.$.Utilities.!ChangeFSI';
  // Messages (m$() array, one per line, as the BASIC reads them)
  const m = DEFAULT_MSGS.slice();
  try { (await vfs.readText(dir + '.Messages')).split(/\r?\n/).forEach((l, i) => { if (l !== '' && i < m.length) m[i] = l; }); } catch { /* defaults */ }

  const tpl = await loadTemplates('assets/templates/ChangeFSI.3dTemplate.json');
  const mk = (name, o = {}) => wimp.createWindowFromTemplate(tpl, name, o, task);
  const infow = mk('Info'), scalew = mk('Scaling'), proc = mk('Processing'), output = mk('Output');
  const jpego = mk('JPEGOutput'), sinfo = mk('Sprite'), srcinfo = mk('Source'), raninfo = mk('Range'), zoom = mk('Zoom');
  infow.icons[7].setText(m[21]);
  const S = scalew.icons, P = proc.icons, O = output.icons, J = jpego.icons, Z = zoom.icons;
  const sel = (ic) => !!ic?.selected;
  const setSel = (ic, on) => ic?.setState({ selected: !!on });
  const setShade = (ic, on) => ic?.setState({ shaded: !!on });

  // ---------------------------------------------------------------- state / Choices
  let dest = 1;                // 1 = sprite output, 0 = JPEG output
  let fast = false;
  let admode = '28';
  const vram = true;           // a RiscPC: "Fast" is greyed out
  let F = '';                  // source file name (F$)
  let srcBytes = null, srcType = -1;
  let result = null;           // {kind, bytes, w, h, spec, name, preview canvas}
  let pic = null, saved = true;
  let info = '', range = m[19], cputime = 0;
  let tofit = { x: 640, y: 480 };

  const applyBits = (win, bits, from, to, map = (i) => i) => { for (let i = from; i <= to; i++) setSel(win.icons[map(i)], (bits >>> i) & 1); };
  const readBits = (win, from, to, map = (i) => i) => { let b = 0; for (let i = from; i <= to; i++) if (sel(win.icons[map(i)])) b |= 1 << i; return b >>> 0; };
  function applyChoices(c) {
    fast = c.fast; dest = c.dest;
    applyBits(scalew, c.statescale, 0, 9);
    applyBits(scalew, c.statescale, 10, 13, (i) => i + 6);
    applyBits(proc, c.stateproc, 0, 7);
    applyBits(output, c.stateoutput, 0, 26);
    applyBits(jpego, c.statejpeg, 0, 3);
    for (const i of [7, 8, 13, 14]) setShade(O[i], (c.stateoutput >>> 17) & 1);
    J[5].setText(c.jpegq); O[34].setText(c.oldmode);
    [P[8], P[9], P[10], P[12]].forEach((ic, i) => ic.setText(c.p[i]));
    admode = c.admode; O[19].setText(c.spcl);
    [S[10], S[11], S[12], S[13]].forEach((ic, i) => ic.setText(c.s[i]));
  }
  const defaults = { fast: false, dest: 1, statescale: 0b10000000100, stateproc: 0, stateoutput: 0x4052008, statejpeg: 2,
    jpegq: '75', oldmode: '', p: ['', '2.2', '24', '4'], admode: '28', spcl: '', s: ['1', '4', '1', '4'] };
  let choices = { ...defaults };
  try {
    const txt = await vfs.readText(dir + '.Choices');
    const L = txt.split(/\r?\n/);
    const b = (s) => /^(-1|TRUE)$/i.test(s.trim());
    choices = { fast: b(L[0]), dest: +L[1], statescale: +L[2], stateproc: +L[3], stateoutput: +L[4], statejpeg: +L[5], jpegq: L[6], oldmode: L[7],
      p: [L[8], L[9], L[10], L[11]], admode: L[12], spcl: L[13], s: [L[14], L[15], L[16], L[17]] };
  } catch { /* no Choices file: defaults */ }
  applyChoices(choices);
  showScaleToFit();
  Z[4].setText('1'); Z[5].setText('1');

  function saveChoices() {
    const statescale = readBits(scalew, 0, 9) | readBits(scalew, 10, 13, (i) => i + 6);
    const lines = [fast ? '-1' : '0', dest, statescale, readBits(proc, 0, 7), readBits(output, 0, 26), readBits(jpego, 0, 3),
      J[5].text, O[34].text, P[8].text, P[9].text, P[10].text, P[12].text, admode, O[19].text, S[10].text, S[11].text, S[12].text, S[13].text];
    try { vfs.writeFile(dir + '.Choices', lines.join('\n') + '\n', { filetype: 0xFFF }); } catch (e) { task.reportError(e.message); }
  }

  // ---------------------------------------------------------------- modes (FNdeducemode / PROCshowscaletofit)
  function screen() { return { w: wimp.width, h: wimp.height }; }
  // The browser desktop is a 16 million colour, 90 x 90 dpi mode.
  function currentMode() { return 'S32,90,90'; }
  function deduceMode() {
    if (sel(O[18])) return currentMode();
    if (sel(O[24])) return O[34].text;
    return admode;
  }
  function showScaleToFit() {
    admode = deduceMode();
    let x;
    const u = admode.toUpperCase();
    if (u[0] === 'S') {
      const [b, xd, yd] = u.slice(1).split(',').map((t) => parseInt(t, 10));
      x = (xd > yd ? 6 : 0) + (b > 16 ? 5 : 4);
      tofit = { x: wimp.width, y: wimp.height };
    } else if (u[0] === 'J') {
      x = 12; tofit = { x: wimp.width, y: wimp.height };
    } else {
      try {
        const sp = parseMode(admode, screen());
        tofit = { x: sp.xres, y: sp.yres };
        x = (sp.yeig > sp.xeig ? 6 : 0) + Math.log2(sp.bpp);
      } catch { x = 12; }
    }
    S[1].setText(`${m[17]}${tofit.x}${m[18]}${tofit.y}`);
    for (let i = 0; i <= 11; i++) setSel(O[i + 3], i === x);
    if (x === 12) setSel(O[24], false);
    O[20].setText(admode);
  }
  const monoShade = (on) => { for (const i of [7, 8, 13, 14]) setShade(O[i], on); };

  // ---------------------------------------------------------------- dialogue clicks
  const MODE_OF = { 3: '25', 4: '26', 5: '27', 6: '28', 7: 'S16,90,90', 8: 'S32,90,90', 9: '0', 10: '8', 11: '12', 12: '15', 13: 'S16,90,45', 14: 'S32,90,45' };
  output.on('click', (ev) => {
    if (ev.button === 'menu') return;
    dest = 1;
    const i = ev.iconIndex;
    if (MODE_OF[i]) { admode = MODE_OF[i]; setSel(O[18], false); setSel(O[24], false); }
    if (i === 15) { admode = deduceMode(); wimp.setCaret(output, O[19], O[19].text.length); monoShade(false); }
    if (i === 16) monoShade(false);
    if (i === 17) {
      monoShade(true);
      if (/^S/i.test(admode)) { admode = /45$/.test(admode) ? '15' : '28'; setSel(O[18], false); setSel(O[24], false); }
    }
    if (i === 18) setSel(O[24], false);
    if (i === 24) { setSel(O[18], false); admode = deduceMode(); wimp.setCaret(output, O[34], O[34].text.length); }
    if (sel(O[18])) admode = deduceMode();
    showScaleToFit();
    wimp.menus.refresh?.();
  });
  output.on('key', (ev) => {
    if (ev.icon === O[34] && sel(O[24])) { admode = O[34].text; }
    showScaleToFit();
    if (ev.code === 13) { wimp.menus.close(); return true; }
    return false;
  });
  jpego.on('click', (ev) => {
    if (ev.button === 'menu') return;
    dest = 0;
    const q = () => parseInt(J[5].text, 10) || 0;
    const setQ = (v) => { J[5].setText(String(Math.max(0, Math.min(100, v)))); wimp.setCaret(jpego, J[5], J[5].text.length); };
    const adj = ev.button === 'adjust';
    if (ev.iconIndex === 3) setQ(q() + (adj ? 1 : -1));
    if (ev.iconIndex === 4) setQ(q() + (adj ? -1 : 1));
    wimp.menus.refresh?.();
  });
  const cycleKeys = (win, icons) => win.on('key', (ev) => {
    const k = icons.indexOf(ev.icon);
    if (k < 0) return false;
    if (ev.code === 13 && k === icons.length - 1) { wimp.menus.close(); return true; }
    if (ev.code === 13 || ev.code === 0x18E) { const n = icons[(k + 1) % icons.length]; wimp.setCaret(win, n, n.text.length); return true; }
    if (ev.code === 0x18F) { const n = icons[(k + icons.length - 1) % icons.length]; wimp.setCaret(win, n, n.text.length); return true; }
    return false;
  });
  cycleKeys(proc, [P[8], P[9], P[10]]);
  cycleKeys(scalew, [S[10], S[11], S[12], S[13]]);

  // ---------------------------------------------------------------- zoom
  const zoomVal = (i) => Math.max(1, parseInt(Z[4 + i].text, 10) || 1);
  function doZoom(s, a) {
    Z[4 + s].setText(String(Math.max(1, zoomVal(s) + a)));
    if (pic) resizePic();
  }
  zoom.on('click', (ev) => {
    if (ev.button === 'menu') return;
    const adj = ev.button === 'adjust' ? -1 : 1;
    if (ev.iconIndex === 0) doZoom(0, adj);
    if (ev.iconIndex === 1) doZoom(0, -adj);
    if (ev.iconIndex === 2) doZoom(1, adj);
    if (ev.iconIndex === 3) doZoom(1, -adj);
  });
  zoom.on('key', (ev) => {
    if (ev.code === 13 || ev.code === 0x18E || ev.code === 0x18F) {
      if (pic) resizePic();
      if (ev.code === 13 && ev.icon === Z[5]) { wimp.menus.close(); return true; }
      const n = ev.icon === Z[4] ? Z[5] : Z[4];
      wimp.setCaret(zoom, n, n.text.length);
      return true;
    }
    return false;
  });

  // ---------------------------------------------------------------- processing (PROCcallFSI)
  function checkValues() {
    if (dest === 0 && (parseInt(J[5].text, 10) || 0) > 100) return m[22] + m[25] + m[23] + m[27] + m[24];
    if (dest === 1 && !/^[A-Za-z]/.test(admode)) {
      const n = parseInt(admode, 10);
      try { if (!admode.length || (n > 127 && n < 256)) throw 0; parseMode(admode, screen()); } catch { return m[22] + m[26] + m[23] + m[13] + m[24]; }
    }
    return null;
  }
  function modeString() {
    let A = deduceMode(), mono = false;
    if (dest === 0) return { mode: (sel(J[2]) ? 'JPEGMONO' : 'JPEG') + J[5].text, mono: sel(J[2]) };
    if (sel(O[15])) A += O[19].text;
    else if (sel(O[16])) { if (sel(O[5]) || sel(O[11])) A += 'R'; }
    else {
      mono = true;
      let sp = null;
      try { sp = parseMode(A, screen()); } catch { /* */ }
      if (sp && sp.bpp === 8 && !/^S/i.test(A)) { if (sel(O[6])) A = '27t'; if (sel(O[12])) A = '12t'; }
    }
    return { mode: A, mono };
  }
  function options() {
    const { mode, mono } = modeString();
    let scale = { type: '1:1' };
    if (sel(S[1])) scale = { type: 'fit' };
    else if (sel(S[5])) scale = { type: '1:2' };
    else if (sel(S[4])) scale = { type: '1:2x' };
    else if (sel(S[3])) scale = { type: '1:2y' };
    else if (sel(S[9])) scale = { type: 'custom', xi: S[10].text, xo: S[11].text, yi: S[12].text, yo: S[13].text };
    const num = (ic, d) => { const v = parseFloat(ic.text); return Number.isFinite(v) ? v : d; };
    return {
      mode, mono: mono || /t$/i.test(mode), scale, screen: screen(),
      nosize: sel(S[0]), noscale: sel(S[18]), lock: sel(S[19]),
      rotate: sel(S[6]) ? (sel(S[16]) ? 1 : -1) : 0, hflip: sel(S[7]), vflip: sel(S[8]),
      range: sel(P[0]), equal: sel(P[1]) && !sel(P[0]), nodither: sel(P[2]), invert: sel(P[3]), brighten: sel(P[4]),
      black: sel(P[5]) ? num(P[8], 32) : false, gamma: sel(P[6]) ? num(P[9], 2.2) : false,
      sharpen: sel(P[7]) ? num(P[10], 24) : false, smooth: sel(P[11]) && !sel(P[7]) ? num(P[12], 1) : false,
    };
  }

  async function callFSI() {
    const bad = checkValues();
    if (bad) {
      const r = await task.reportError(bad, { cancel: true });
      if (r === 2) task.quit();
      return;
    }
    if (!srcBytes) return;
    if (pic) { pic.delete(); pic = null; saved = true; result = null; }
    range = m[19];
    const t0 = performance.now();
    try {
      const src = await decodeImage(srcBytes, srcType, F);
      info = src.info;
      const opts = options();
      const r = await convert(src, opts);
      cputime = Math.round((performance.now() - t0) / 10);
      range = r.rangeInfo || m[19];
      await showResult(r);
    } catch (e) {
      task.reportError(`${e.message ?? e} (code 9950)`, { cancel: true }).then((b) => { if (b === 2) task.quit(); });
      return;
    }
  }

  async function showResult(r) {
    // preview canvas: decode what we produced so the window shows the real sprite
    const c = document.createElement('canvas');
    let xeig = 1, yeig = 1;
    if (r.kind === 'sprite') {
      const s = decodeSpriteFile(r.bytes)[0];
      c.width = s.width; c.height = s.height;
      c.getContext('2d').putImageData(new ImageData(s.rgba, s.width, s.height), 0, 0);
      xeig = s.xeig; yeig = s.yeig;
      sinfo.icons[6].setText(String(r.spec.mode));
      sinfo.icons[5].setText(r.name);
      sinfo.icons[8].setText(String(r.bytes.length + 4));
      sinfo.icons[7].setText(String(r.w)); sinfo.icons[9].setText(String(r.h));
    } else {
      c.width = r.w; c.height = r.h;
      c.getContext('2d').putImageData(new ImageData(r.preview, r.w, r.h), 0, 0);
      sinfo.icons[6].setText('JPEG'); sinfo.icons[5].setText('JPEG');
      sinfo.icons[8].setText(String(r.bytes.length));
      sinfo.icons[7].setText(String(r.w)); sinfo.icons[9].setText(String(r.h));
    }
    result = { ...r, canvas: c, osW: r.w << xeig, osH: r.h << yeig };
    raninfo.icons[0].setText(range);
    srcinfo.icons[0].setText(`${info}${m[0]}${Math.floor(cputime / 100)}.${String(cputime % 100).padStart(2, '0')}${m[1]}`);
    saved = false;
    openPic();
  }

  const picSize = () => ({ w: Math.max(1, Math.round((result.osW / 2) * zoomVal(0) / zoomVal(1))), h: Math.max(1, Math.round((result.osH / 2) * zoomVal(0) / zoomVal(1))) });
  function title() { return /^<Wimp\$S/i.test(F) ? (result.kind === 'jpeg' ? 'JPEGImage' : 'SpriteFile') : F; }
  function openPic() {
    const { w, h } = picSize();
    pic = mk('Pic', { title: title(), extent: { w, h } });
    if (w < 64 || h < 64) pic.colours.workBg = 0; else pic.colours.workBg = 255;
    pic.useCanvas((g) => {
      const s = picSize();
      g.imageSmoothingEnabled = false;
      g.drawImage(result.canvas, 0, 0, s.w, s.h);
    });
    pic.on('click', (ev) => { if (ev.button === 'menu') { wimp.menus.openAt(picMenu(), ev, { task }); return true; } });
    pic.on('close', async (ev) => {
      ev.preventDefault();
      pic.delete(); pic = null; saved = true;
    });
    const r = wimp.screenRect(true);
    const vw = Math.min(w, r.w - 60), vh = Math.min(h, r.h - 80);
    pic.open({ x: Math.round((r.w - vw) / 2), y: Math.round((r.h - vh) / 2), w: vw, h: vh, behind: 'top' });
  }
  function resizePic() {
    if (!pic || !result) return;
    const { w, h } = picSize();
    pic.setExtent({ w, h });
    const r = wimp.screenRect(true);
    pic.open({ w: Math.min(w, r.w - 60), h: Math.min(h, r.h - 80), behind: 'keep' });
    pic.invalidate();
  }

  // ---------------------------------------------------------------- saving
  let saveWin = null;
  function saveBox() {
    saveWin?.delete();
    const jpeg = result?.kind === 'jpeg';
    const leaf = /^<Wimp\$S/i.test(F) ? (jpeg ? 'JPEGImage' : 'SpriteFile') : F;
    saveWin = saveAs({
      task, filename: leaf, filetype: jpeg ? 0xC85 : 0xFF9,
      save: async (path) => {
        if (F && vfs.exists(F) && (() => { try { return vfs.canonical(path) === vfs.canonical(F); } catch { return false; } })()) {
          const b = await task.reportError(m[28], { cancel: true, category: 'question' });
          if (b === 2) throw new Error('Not saved');
        }
        vfs.writeFile(path, result.bytes, { filetype: jpeg ? 0xC85 : 0xFF9 });
      },
      getData: async () => result.bytes,
      onSaved: (path) => { saved = true; },
    });
    return saveWin;
  }

  // ---------------------------------------------------------------- menus
  const iconbarMenu = () => new Menu(m[20], [
    { text: m[10], submenu: infow },
    { text: m[11], submenu: scalew },
    { text: m[12], submenu: proc },
    { text: m[13], submenu: output, ticked: () => dest === 1 },
    { text: m[27], submenu: jpego, ticked: () => dest === 0 },
    { text: m[9], shaded: () => !F || /^(SpriteFile|JPEGImage)$/.test(F), action: () => callFSI() },
    { text: m[14], ticked: () => fast, shaded: () => vram, action: () => { fast = !fast; } },
    { text: m[15], action: () => saveChoices() },
    { text: m[16], action: () => quit() },
  ]);
  const picMenu = () => new Menu(m[20], [
    { text: m[4], submenu: sinfo },
    { text: m[5], submenu: srcinfo },
    { text: m[6], submenu: raninfo },
    { text: m[7], submenu: zoom },
    { text: m[8], submenu: () => saveBox() },
    { text: m[9], shaded: () => !F || /^<Wimp\$S/i.test(F), action: () => callFSI() },
  ]);
  // a menu reopened after clicking a dialogue (dest changed) keeps its ticks right
  const origOpen = output.open.bind(output);
  output.open = (st) => { origOpen(st); showScaleToFit(); };

  async function quit() {
    if (!saved && pic) {
      const b = await task.reportError(`${m[2]}${F}${m[3]}`, { cancel: true, category: 'warning' });
      if (b !== 1) return;
    }
    task.quit();
  }

  // ---------------------------------------------------------------- loading
  async function loadFile(path, type) {
    try {
      srcBytes = await vfs.readFile(path);
      srcType = type ?? vfs.stat(path)?.filetype ?? -1;
      F = vfs.canonical(path);
      callFSI();
    } catch (e) { task.reportError(e.message ?? String(e)); }
  }
  task.addIconbarIcon({
    sprite: '!changefsi',
    onClick: (ev) => { if (ev.button !== 'menu' && pic) pic.open({ behind: 'top' }); },
    menu: iconbarMenu,
    onDataLoad: (ev) => {
      const f = ev.files?.[0];
      if (!f) return;
      if (f.filetype === 0x1000 || f.filetype === 0x2000 || f.type === 'dir') { task.reportError('Directory given (code 9830)'); return; }
      loadFile(f.path, f.filetype);
    },
    onDataSave: async (ev) => {
      // RAM transfer / <Wimp$Scrap> from another application's Save box
      try {
        const data = await ev.receive();
        srcBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        srcType = ev.filetype; F = '<Wimp$Scrap>';
        callFSI();
      } catch (e) { task.reportError(e.message ?? String(e)); }
    },
  });
  task.onMessage('DataOpen', (msg) => {
    if (msg.filetype === 0xFF0 || msg.filetype === 0xC85) { loadFile(msg.path, msg.filetype); return true; }
  });
  task.onMessage('PreQuit', (msg) => { if (!saved && pic) { msg.object?.(); quit(); } });
  task.onMessage('ModeChange', () => showScaleToFit());
  if (ctx.file && vfs.exists(ctx.file)) loadFile(ctx.file);
}
