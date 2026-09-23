// !PhotoView - Acorn's PhotoCD Toolkit example application (0.10, 31 Mar 1995), recreated from
// Sources/Apps/PhotoView (c.main, c.pcdovervw, c.sprparam, c.image). There are no PhotoCD discs
// here, so the "Source" is a directory of JPEG files (the disc's Images.00-49, 50-99, Team):
//  - icon bar icon; menu Info / Source > (paths; drag a directory to the icon to add one) / Quit;
//  - SELECT on the icon: the "Overview" contact sheet of the selected source (c.pcdovervw: 128 x 128
//    slide frames, 96 x 64 thumbnails, columns follow the window width, thumbnails made lazily);
//  - click a slide: the "Opening an Image Pac" parameter box (c.sprparam: Resolution, Orientation
//    - also by clicking a side of the thumbnail, ADJUST mirrors - Palette, Dither), OK opens an image
//    window (c.image) whose menu has Image info, Save (sprite file), Export (faded, as released)
//    and Scale view (the RISC OS 3 style zoom box, 25..400% buttons).
//  - JPEGs double-clicked in the Filer or dropped on the icon / a PhotoView window open directly.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { saveAs } from '../../core/dialogs.js';
import { loadTemplates } from '../../core/templates.js';
import { loadManifest } from '../../core/sprites.js';
import { templateIconToSpec } from '../../core/icons.js';
import { formatDate } from '../../core/filer.js';
import { input } from '../../core/input.js';
import { vfs } from '../../core/vfs.js';
import { loadSystemFont, vduText } from '../Patience/vdutext.js';
import { thumbnail, decodeJPEG, render, spriteFile } from './image.js';

const JPEG = 0xC85, PHOTOCD = 0xBE8;
const MAX_OVWS = 12, MAX_IMAGES = 128, MAX_PATHS = 16;
const DEFAULT_SOURCES = ['ADFS::HardDisc4.$.Images.00-49', 'ADFS::HardDisc4.$.Images.50-99', 'ADFS::HardDisc4.$.Images.Team'];
// Legal palettes per screen depth (c.sprparam LegalPal8 - the desktop is a true colour mode, so all are offered)
const PALETTES = 6;

export default async function start(task, ctx) {
  const M = await (await fetch('assets/messages/PhotoView.json')).json();
  const msg = (t, d = t) => M[t] ?? d;
  const tpl = await loadTemplates('assets/templates/PhotoView.json');
  const appSprites = await loadManifest('PhotoView', 'Sprites');
  loadSystemFont();

  // ------------------------------------------------------------------ parameters (c.sprparam)
  const opts = { resolution: 3, orientation: 0, palette: 1, dither: true };

  // ------------------------------------------------------------------ interactive help (main_processhelpevent)
  const helpFor = (win, base) => win.on('helprequest', (ev) => {
    const i = ev.icon ? win.icons.indexOf(ev.icon) : -1;
    const c = i < 0 ? null : i <= 9 ? String(i) : i <= 35 ? String.fromCharCode(97 + i - 10) : 'z';
    const t = (c && M[base + c]) || M[base];
    if (t) ev.text = t;
  });
  const menuItems = (s) => s.split(',').map((t) => t.replace(/^>/, ''));

  // ------------------------------------------------------------------ Source paths (c.main)
  const paths = ['CDFS::0.$'];                  // always present, faded: no CD-ROM drives
  let selected = 0;                             // 1-based index into paths (0 = none)
  for (const p of DEFAULT_SOURCES) if (vfs.isDir(p)) paths.push(vfs.canonical(p));
  if (paths.length > 1) selected = 2;
  function addPath(path) {
    let p;
    try {
      const st = vfs.stat(path);
      if (!st) return 0;
      p = st.type === 'dir' ? st.path : vfs.parent(st.path);
    } catch { return 0; }
    const i = paths.findIndex((q) => q.toLowerCase() === p.toLowerCase());
    if (i >= 0) return i + 1;
    if (paths.length >= MAX_PATHS) { task.reportError('Too many paths - could not add this one'); return 0; }
    paths.push(p);
    return paths.length;
  }

  // ------------------------------------------------------------------ ProgInfo
  let info = null;
  const infoWin = () => {
    if (!info) {
      info = task.createWindowFromTemplate(tpl, 'ProgInfo', { spriteArea: appSprites });
      info.icons[2].setText(ctx.app?.info?.purpose ?? 'PhotoCD Toolkit example app');
      info.icons[3].setText(ctx.app?.info?.author ?? '© Acorn Computers Ltd, 1993');
      info.icons[4].setText(ctx.app?.info?.version ?? '0.10 (31 Mar 1995)');
      helpFor(info, 'PROGINFO');
    }
    return info;
  };

  // ------------------------------------------------------------------ Overview contact sheets (c.pcdovervw)
  const ovTpl = tpl.windows.overview;
  const slideSpec = ovTpl.icons.map(templateIconToSpec);
  const XSTART = slideSpec[0].bbox.x0;                     // 8 px
  const XOFF = slideSpec[0].bbox.x1;                       // 136 px (slide pitch)
  const FRAME = slideSpec[0].bbox.x1 - slideSpec[0].bbox.x0;   // 128 px
  const THUMB_W = 96, THUMB_H = 64;                        // PCD Base/64 (192 x 128 OS units)
  const LABEL = slideSpec[2].bbox;
  const overviews = [];

  function jpegsIn(dir) {
    return vfs.list(dir).filter((f) => f.type === 'file' && f.filetype === JPEG)
      .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
  }

  function openOverview(path) {
    const had = overviews.find((o) => o.path.toLowerCase() === path.toLowerCase());
    if (had) { had.win.open({ behind: 'top' }); return had; }
    if (overviews.length >= MAX_OVWS) { task.reportError(msg('ovw2many').replace('%d', MAX_OVWS)); return null; }
    let files;
    try { files = jpegsIn(path); } catch (e) { task.reportError(e.message ?? String(e)); return null; }
    const cols = 4;                                        // default_columns
    const win = task.createWindowFromTemplate(tpl, 'Overview', { icons: [], workButton: 'click', title: `Overview: ${path}` });
    const ov = { path, win, files, columns: cols, slides: [] };
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    win.work.appendChild(layer);
    files.forEach((f, i) => {
      const frame = win.addIcon({ ...slideSpec[0], bbox: { ...slideSpec[0].bbox } });
      const slot = win.addIcon({ ...slideSpec[1], bbox: { ...slideSpec[1].bbox } });
      const label = win.addIcon({ ...slideSpec[2], bbox: { ...slideSpec[2].bbox }, text: f.name, bufLen: 64 });
      ov.slides.push({ file: f, frame, slot, label, thumb: null, state: 0, canvas: null, n: i });
    });
    ov.layout = () => layoutOverview(ov);
    ov.layer = layer;
    layoutOverview(ov);
    win.on('open', (ev) => {
      ev.preventDefault();
      win.open(ev);
      const c = Math.max(1, Math.floor(win.w / XOFF));
      if (c !== ov.columns) { ov.columns = c; layoutOverview(ov); }
      pumpThumbs();
    });
    win.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      const mx = ev.x, my = ev.y;
      if (mx % XOFF < XSTART || my % XOFF < XSTART) return true;
      const row = Math.floor(my / XOFF), col = Math.floor(mx / XOFF);
      if (col >= ov.columns) return true;
      const n = row * ov.columns + col;
      if (n >= ov.slides.length) return true;
      openParams(ov, n);
      return true;
    });
    win.on('close', (ev) => {
      ev.preventDefault();
      if (params.ov === ov) params.cancel();
      win.delete();
      overviews.splice(overviews.indexOf(ov), 1);
    });
    win.on('dataload', (ev) => { loadFiles(ev.files); return true; });
    overviews.push(ov);
    win.open({ w: XSTART + cols * XOFF, behind: 'top' });
    pumpThumbs();
    return ov;
  }

  function slotBox(s, x, y) {
    const t = s.thumb;
    const portrait = t && t.h > t.w;
    const bw = t ? t.canvas.width + 4 : (portrait ? THUMB_H : THUMB_W), bh = t ? t.canvas.height + 4 : (portrait ? THUMB_W : THUMB_H);
    const x0 = x + XSTART + Math.floor((FRAME - bw) / 2), y0 = y + XSTART + Math.floor((FRAME - bh) / 2);
    return { x0, y0, x1: x0 + bw, y1: y0 + bh };
  }
  function layoutOverview(ov) {
    const cols = ov.columns, n = ov.slides.length, rows = Math.ceil(n / cols);
    ov.win.setExtent({ x0: 0, y0: 0, x1: Math.max(XSTART + n * XOFF, XSTART + cols * XOFF), y1: XSTART + rows * XOFF });
    ov.slides.forEach((s, i) => {
      const x = (i % cols) * XOFF, y = Math.floor(i / cols) * XOFF;
      s.frame.moveTo({ x0: x + XSTART, y0: y + XSTART, x1: x + XOFF, y1: y + XOFF });
      s.slot.moveTo(slotBox(s, x, y));
      s.label.moveTo({ x0: x + LABEL.x0, y0: y + LABEL.y0, x1: x + LABEL.x1, y1: y + LABEL.y1 });
      if (s.canvas) placeThumb(s);
    });
  }
  function placeThumb(s) {
    const b = s.slot.bbox;
    s.canvas.style.left = (b.x0 + 2) + 'px';
    s.canvas.style.top = (b.y0 + 2) + 'px';
  }

  // lazily make the thumbnails of the visible slides (plus one row ahead), two at a time
  let decoding = 0;
  function pumpThumbs() {
    for (const ov of overviews) {
      if (!ov.win.isOpen) continue;
      const cols = ov.columns;
      const r0 = Math.max(0, Math.floor(ov.win.scrollY / XOFF)), r1 = Math.floor((ov.win.scrollY + ov.win.h) / XOFF) + 1;
      for (let i = r0 * cols; i < Math.min(ov.slides.length, (r1 + 1) * cols) && decoding < 2; i++) {
        const s = ov.slides[i];
        if (s.state) continue;
        s.state = 1; decoding++;
        vfs.readFile(s.file.path)
          .then((b) => thumbnail(b, THUMB_W, THUMB_H))
          .then((t) => {
            s.thumb = t; s.state = 2;
            s.slot.setText('');
            const c = s.canvas = document.createElement('canvas');
            c.width = t.canvas.width; c.height = t.canvas.height;
            c.getContext('2d').drawImage(t.canvas, 0, 0);
            c.style.cssText = 'position:absolute';
            ov.layer.appendChild(c);
            const i2 = ov.slides.indexOf(s);
            s.slot.moveTo(slotBox(s, (i2 % ov.columns) * XOFF, Math.floor(i2 / ov.columns) * XOFF));
            placeThumb(s);
          })
          .catch(() => { s.state = 3; s.slot.setText(msg('notavail1', 'N/A')); })
          .finally(() => { decoding--; pumpThumbs(); });
      }
    }
  }
  task.every(250, pumpThumbs);

  // ------------------------------------------------------------------ "Opening an Image Pac" box (c.sprparam)
  const sp = task.createWindowFromTemplate(tpl, 'SprParams', { spriteArea: appSprites });
  const SI = sp.icons;
  helpFor(sp, 'SPRPAR');
  const disp = document.createElement('canvas');
  {
    const b = SI[9].bbox;
    disp.width = b.x1 - b.x0 - 4; disp.height = b.y1 - b.y0 - 4;
    disp.style.cssText = `position:absolute;left:${b.x0 + 2}px;top:${b.y0 + 2}px;pointer-events:none`;
    sp.work.appendChild(disp);
  }
  const params = { ov: null, n: -1, saved: null, cancel() {} };
  const modeText = () => '32 bpp - 90 x 90 dpi';
  function paramFields() {
    SI[4].setText(msg('resol' + opts.resolution));
    SI[7].setText(msg('xform' + opts.orientation));
    SI[14].setText(msg('MEpal' + opts.palette));
    SI[12].setText(modeText());
    SI[16].setState({ selected: opts.dither });
    drawDisp();
  }
  function drawDisp() {
    const g = disp.getContext('2d');
    g.clearRect(0, 0, disp.width, disp.height);
    const t = params.ov?.slides[params.n]?.thumb;
    if (!t) return;
    const rot = opts.orientation % 4, mirror = opts.orientation >= 4;
    g.save();
    g.translate(disp.width / 2, disp.height / 2);
    g.rotate(-rot * Math.PI / 2);
    if (mirror) g.scale(-1, 1);
    g.drawImage(t.canvas, -t.canvas.width / 2, -t.canvas.height / 2);
    g.restore();
  }
  function openParams(ov, n) {
    if (sp.isOpen) return;                      // sprpar_open: refuse to start another
    params.ov = ov; params.n = n;
    const s = ov.slides[n];
    sp.setTitle(`Opening an Image Pac (${s.file.name})`);
    opts.orientation = 0;                       // the JPEG's default orientation
    params.saved = { resolution: opts.resolution, palette: opts.palette, dither: opts.dither };
    SI[9].setText(s.state === 3 ? msg('notavail2', 'Not available') : '');
    paramFields();
    const w = sp.w, h = sp.h;
    const r = wimp.screenRect(true);
    const x = Math.max(0, Math.min(r.w - w, Math.round((input.mouseX ?? r.w / 2) - w / 2)));
    const y = Math.max(0, Math.min(r.h - h, Math.round((input.mouseY ?? r.h / 2) - h / 2)));
    sp.open({ x, y, behind: 'top' });
  }
  params.cancel = () => {
    if (!sp.isOpen) return;
    sp.close();
    if (params.saved) Object.assign(opts, params.saved);
    params.ov = null;
  };
  const popupAt = (ic) => { const p = sp.workToScreen(ic.bbox.x1 + 24, ic.bbox.y0); return p; };
  const resolutionMenu = () => new Menu(msg('MEresolT'), [1, 2, 3, 4, 5].map((i) => ({
    text: msg('MEresol' + i), ticked: () => opts.resolution === i, action: () => { opts.resolution = i; paramFields(); },
  })));
  const orientationMenu = () => new Menu(msg('MExformT'), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    text: msg('MExform' + i), ticked: () => opts.orientation === i, action: () => { opts.orientation = i; paramFields(); },
  })));
  const paletteMenu = () => new Menu(msg('MEpalT'), Array.from({ length: PALETTES }, (_, k) => k + 1).map((i) => ({
    text: msg('MEpal' + i), ticked: () => opts.palette === i, action: () => { opts.palette = i; paramFields(); },
  })));
  const popups = { 5: resolutionMenu, 8: orientationMenu, 15: paletteMenu };
  sp.on('click', (ev) => {
    const i = ev.iconIndex;
    if (popups[i]) { const p = popupAt(SI[i]); wimp.menus.open(popups[i](), p.x, p.y, { task }); return true; }
    if (ev.button === 'menu') return true;
    if (i === 0) {                               // OK
      const ov = params.ov, n = params.n;
      sp.close(); params.ov = null;
      if (ov && ov.slides[n]) openImage(ov.slides[n].file.path, { ...opts }, ov.slides[n].file.name);
    } else if (i === 1) params.cancel();
    else if (i === 16) { opts.dither = !opts.dither; SI[16].setState({ selected: opts.dither }); }
    else if (i === 9) {
      // set the rotation by clicking a side of the thumbnail (ADJUST: mirrored)
      const b = SI[9].bbox, h = b.y1 - b.y0;
      const mx = ev.x - b.x0, my = b.y1 - ev.y;  // from the icon's bottom-left, y up
      let o;
      if (mx > my) o = mx > h - my ? 0 : 3;
      else o = mx > h - my ? 1 : 2;
      if (ev.button === 'adjust') o += 4;
      opts.orientation = o;
      paramFields();
    }
    return true;
  });

  // ------------------------------------------------------------------ image windows (c.image)
  const images = [];
  let busy = false;
  async function openImage(path, p = { ...opts }, name = null) {
    if (busy) { task.reportError(msg('already')); return null; }
    if (images.length >= MAX_IMAGES) { task.reportError(msg('toomany')); return null; }
    busy = true;
    let src, bytes;
    try {
      bytes = await vfs.readFile(path);
      src = await decodeJPEG(bytes);
    } catch (e) {
      busy = false;
      task.reportError(`PhotoCD error: ${msg('pcdbadfmt')}`);
      return null;
    }
    if (!task.alive) { busy = false; return null; }
    const pic = render(src, p);
    busy = false;
    const st = vfs.stat(path);
    const im = { path: st?.path ?? path, name: name ?? vfs.leaf(path), size: bytes.length, date: st?.date, srcW: src.width, srcH: src.height, pic, zoomMul: 1, zoomDiv: 1, params: p };
    src.close?.();
    const win = im.win = task.createWindowFromTemplate(tpl, 'Image', { title: im.name, extent: { w: pic.w, h: pic.h }, workButton: 'click' });
    win.useCanvas((g) => {
      const zw = pic.w * im.zoomMul / im.zoomDiv, zh = pic.h * im.zoomMul / im.zoomDiv;
      g.imageSmoothingEnabled = im.zoomMul < im.zoomDiv;
      g.drawImage(pic.canvas, 0, 0, zw, zh);
    });
    win.on('click', (ev) => { if (ev.button === 'menu') { wimp.menus.openAt(imageMenu(im), ev, { task }); } return true; });
    win.on('close', (ev) => { ev.preventDefault(); win.delete(); images.splice(images.indexOf(im), 1); });
    win.on('dataload', (ev) => { loadFiles(ev.files); return true; });
    images.push(im);
    win.open({ behind: 'top' });
    return im;
  }
  function rezoom(im) {
    const w = Math.max(1, Math.round(im.pic.w * im.zoomMul / im.zoomDiv)), h = Math.max(1, Math.round(im.pic.h * im.zoomMul / im.zoomDiv));
    im.win.setExtent({ w, h });
    im.win.open({ behind: 'keep' });
    im.win.invalidate();
  }

  // Image info (c.image image_infobox), adapted to files: name, date, size, dimensions, rights file
  function findRights(path) {
    for (let d = vfs.parent(path), k = 0; d && k < 2; d = vfs.parent(d), k++) {
      try { const p = d + '.ReadMe'; if (vfs.exists(p) && vfs.stat(p).type === 'file') return p; } catch { /* */ }
    }
    return null;
  }
  function imageInfo(im) {
    const w = task.createWindowFromTemplate(tpl, 'ImageInfo');
    const I = w.icons;
    I[0].setText('Filename'); I[2].setText('Image size'); I[3].setText('File size');
    I[7].setText(im.name);
    I[8].setText(im.date ? formatDate(im.date) : msg('notmod', '-'));
    I[9].setText(`${im.srcW} x ${im.srcH} pixels`);
    I[10].setText(`${im.size} bytes`);
    const rights = findRights(im.path);
    I[11].setText(rights ? 'Yes' : 'No');
    I[12].setText(rights ? vfs.leaf(rights) : '');
    I[13].setState({ shaded: !rights });
    helpFor(w, 'IMAGEINFO');
    I[7].help = 'The name of the image file.';
    I[9].help = 'The size of the image in pixels.';
    I[10].help = 'The size of the image file.';
    w.on('click', (ev) => {
      if (ev.iconIndex === 13 && rights && ev.button !== 'menu') { readRights(rights); wimp.menus.close(); }
      return true;
    });
    w.on('menuclosed', () => w.delete());
    return w;
  }
  // the copyright file in a RISC_OSLib txt window (template 'text', system font, no caret)
  async function readRights(path) {
    let text;
    try { text = (await vfs.readText(path)).replace(/\r/g, ''); } catch (e) { task.reportError(msg('rightmem')); return; }
    await loadSystemFont();
    const lines = text.split('\n').map((l) => l.replace(/\t/g, '        '));
    const LH = 12, CW = 8;
    const tw = task.createWindowFromTemplate(tpl, 'text', { title: msg('righttit'), extent: { w: Math.max(640, Math.max(...lines.map((l) => l.length)) * CW + 8), h: lines.length * LH + 8 } });
    tw.useCanvas((g, r) => {
      g.fillStyle = '#000';
      const a = Math.max(0, Math.floor(r.y0 / LH) - 1), b = Math.min(lines.length, Math.ceil(r.y1 / LH) + 1);
      for (let i = a; i < b; i++) vduText(g, lines[i], 8, -(4 + i * LH) * 2);
    });
    tw.on('close', (ev) => { ev.preventDefault(); tw.delete(); });
    tw.open({ behind: 'top' });
  }

  // Scale view (image_magnify): the RISC OS 3 zoom box; div is forced to 100
  const sv = task.createWindowFromTemplate(tpl, 'ScaleView');
  const VI = sv.icons;
  helpFor(sv, 'SCALEVIEW');
  let svTarget = null;
  const MINPC = Math.floor(100 / 16), MAXPC = 16 * 100;
  const pct = () => parseInt(VI[6].text, 10) || 0;
  const setPct = (v) => { VI[6].setText(String(v)); if (wimp.caret?.window === sv) wimp.setCaret(sv, VI[6], VI[6].text.length); };
  function scaleWin(im) {
    svTarget = im;
    let cur = Math.max(1, im.zoomMul);
    cur = im.zoomDiv >= 1 ? Math.floor(cur * 100 / im.zoomDiv) : cur * 100;
    VI[6].setText(String(cur));
    return sv;
  }
  function applyScale(close) {
    const im = svTarget;
    if (!im || !images.includes(im)) return;
    im.zoomMul = Math.max(1, pct()); im.zoomDiv = 100;
    rezoom(im);
    if (close) wimp.menus.close();
  }
  sv.on('click', (ev) => {
    if (ev.button === 'menu') return;
    const i = ev.iconIndex, adjust = ev.button === 'adjust';
    let cur = pct(), nv;
    switch (i) {
      case 0: applyScale(!adjust); return true;
      case 1: wimp.menus.close(); return true;
      case 7: nv = cur > 100 ? Math.floor((cur - 1) / 50) * 50 : Math.floor((cur - 1) / 5) * 5; if (nv >= MINPC) cur = nv; break;
      case 8: nv = cur >= 100 ? Math.floor((cur + 50) / 50) * 50 : Math.floor((cur + 5) / 5) * 5; if (nv <= MAXPC) cur = nv; break;
      case 9: cur = 25; break;
      case 10: cur = 50; break;
      case 11: cur = 100; break;
      case 12: cur = 150; break;
      case 13: cur = 200; break;
      case 14: cur = 400; break;
      default: return;
    }
    setPct(cur);
    return true;
  });
  sv.on('key', (ev) => { if (ev.code === 13) { applyScale(true); return true; } });

  let saveWin = null;
  function saveBox(im) {
    saveWin?.delete();
    saveWin = saveAs({
      task, filename: 'Spritefile', filetype: 0xFF9,
      getData: async () => spriteFile(im.pic, im.name),
    });
    return saveWin;
  }
  function imageMenu(im) {
    const [tInfo, tSave, tExport, tScale] = menuItems(msg('MEimageB', '>Image info,>Save,Export,>Scale view'));
    return new Menu(msg('MEimageT', 'Image'), [
      { text: tInfo, submenu: () => imageInfo(im), help: msg('IMGMNU0') },
      { text: tSave, submenu: () => saveBox(im), help: msg('IMGMNU1') },
      { text: tExport, shaded: true, help: msg('IMGMNU2') },     // faded in the released build
      { text: tScale, submenu: () => scaleWin(im), help: msg('IMGMNU3') },
    ]);
  }

  // ------------------------------------------------------------------ loading files
  function loadFiles(files) {
    for (const f of files ?? []) {
      const st = f.path ? vfs.stat(f.path) : null;
      if (!st) continue;
      if (st.filetype === JPEG) openImage(st.path);
      else if (st.filetype === PHOTOCD) task.reportError(`PhotoCD error: ${msg('pcdbadfmt')}`);
    }
  }

  // ------------------------------------------------------------------ icon bar (c.main)
  const iconMenu = () => {
    const [tInfo, tSource, tQuit] = menuItems(msg('MEicbarB', '>Info,Source,Quit'));
    const sourceMenu = new Menu(msg('MEicbar2T', 'Source'), paths.map((p, i) => ({
      text: p, shaded: i === 0, ticked: () => selected === i + 1,
      action: () => { selected = i + 1; openOverview(paths[i]); },
    })));
    return new Menu(msg('MEicbarT', 'PhotoView'), [
      { text: tInfo, submenu: infoWin, help: msg('IHELP0') },
      { text: tSource, submenu: sourceMenu, help: msg('IHELP1') },
      { text: tQuit, help: msg('IHELP2'), action: () => task.quit() },
    ]);
  };
  task.addIconbarIcon({
    sprite: '!photoview',
    help: msg('IHELPI'),
    onClick: (ev) => { if (ev.button !== 'menu' && selected > 1) openOverview(paths[selected - 1]); },
    menu: iconMenu,
    onDataLoad: (ev) => {
      const f = ev.files?.[0];
      if (!f) return;
      const st = vfs.stat(f.path);
      if (!st) return;
      const i = addPath(st.path);
      if (i) selected = i;
      if (st.type === 'file' && st.filetype === JPEG) openImage(st.path);
      else if (i) openOverview(paths[i - 1]);
    },
  });

  task.onMessage('DataOpen', (m) => {
    if (m.filetype === JPEG) { openImage(m.path); return true; }
    if (m.filetype === PHOTOCD) { task.reportError(`PhotoCD error: ${msg('pcdbadfmt')}`); return true; }
  });
  task.onMessage('PreQuit', () => false);       // nothing is ever unsaved
  task.onMessage('Quit', () => task.quit());

  // test hook (tests/div/photoview*.mjs)
  task.photoview = { opts, paths, overviews, images, openOverview, openImage, openParams, get params() { return sp; }, get scaleView() { return sv; }, spriteFile };

  if (ctx.file && vfs.exists(ctx.file)) {
    const st = vfs.stat(ctx.file);
    if (st.filetype === JPEG) openImage(st.path);
    else if (st.filetype === PHOTOCD) task.reportError(`PhotoCD error: ${msg('pcdbadfmt')}`);
  }
}
