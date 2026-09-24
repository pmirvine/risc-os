// !Draw for RISC OS 3.71 (Draw 1.11, 24-Jul-95) - application shell: icon bar, windows and their
// toolbox panes, menus (c.DrawMenu), keys (draw_menu_processkeys), mouse (paper_but), file loading
// and saving (c.DrawFileIO), dialogues. Model and drawing: editor.js; file format: drawfile.js.

import { wimp } from '../../core/wimp.js';
import { Menu, colourMenu } from '../../core/menu.js';
import { saveAs } from '../../core/dialogs.js';
import { os } from '../../core/os.js';
import { sprites, SpriteInfo } from '../../core/sprites.js';
import { loadTemplates } from '../../core/templates.js';
import { startPointerDrag, input } from '../../core/input.js';
import * as DF from './drawfile.js';
import { Diagram, View, S, PAPER, PATTERNS, patternIndex, dbc, MAXZOOM, BLACK, WHITE, scaleObject, rotateObject, translateObject, makeRotatable, isRotatable } from './editor.js';
import { colourPicker, preloadPicker } from './picker.js';

const TRANSPARENT = DF.TRANSPARENT;
const FT = { DRAW: 0xAFF, SPRITE: 0xFF9, TEXT: 0xFFF, JPEG: 0xC85, DXF: 0xDEA, PS: 0xFF5 };

// Wimp key codes
const K = {
  F1: 0x181, F2: 0x182, F3: 0x183, F4: 0x184, F5: 0x185, F6: 0x186, F7: 0x187, F8: 0x188, F9: 0x189,
  SH: 0x10, CTRL: 0x20, TAB: 0x18A, COPY: 0x18B, PRINT: 0x180,
};

export default async function start(task, ctx) {
  // ---------------------------------------------------------------------------- resources
  const [tpl, msgs, drawSprites] = await Promise.all([
    loadTemplates('assets/templates/Draw.json'),
    fetch('assets/messages/Draw.json').then((r) => r.json()).catch(() => ({})),
    sprites.loadManifest('Draw', 'Sprites'),
    DF.loadFontInfo(), DF.loadSystemFont(), preloadPicker(), os.fontreg?.ready(),
  ]);
  if (os.fontreg) DF.useFontRegistry(os.fontreg);   // font menus and text also use the fonts found on the disc
  const msg = (t, ...a) => { let s = msgs[t] ?? t; a.forEach((v, i) => { s = s.replace(/%[sd0-9]/, String(v)); }); return s.replace(/^####/, ''); };
  // the crosshair pointer (square-pixel version of the mode 12 sprite, active point 8,4 -> 8,8)
  const ch = drawSprites.get('crosshairs');
  if (ch && !sprites.hasArea('Draw/pointer')) {
    const info = new SpriteInfo({ name: 'drawcrosshairs', w: 17, h: 18, osW: 34, osH: 36, url: 'assets/sprites/Draw/Sprites/crosshairs.sq.png', hasMask: true });
    info.hot = [8, 8];
    sprites.addArea(new Map([['drawcrosshairs', info]]), 'Draw/pointer');
  }

  // ---------------------------------------------------------------------------- options
  const options = readOptions(os.sysvars?.get?.('Draw$Options'));
  const diagrams = [];
  let focusView = null;
  let lastJustify = { h: 0, v: 0 };
  const menuBuf = { interp: '8', grade: '8', rotate: '0.0', xscale: '1.0', yscale: '1.0', lscale: '1.0', magnify: '1.0' };
  let printCopies = 1;
  const paperTpl = tpl.windows.paper;
  let yshift = 0;

  const app = {
    options, msg,
    noteMode(d) {
      options.mode = d.main === S.PATH ? (d.curved ? (d.closed ? 'ccurve' : 'curve') : (d.closed ? 'cline' : 'line')) : d.main === S.RECT ? 'rect' : d.main === S.ELLI ? 'elli' : d.main === S.TEXT ? 'text' : d.main === S.SEL ? 'sel' : options.mode;
      if (d.main === S.PATH) { options.curved = d.curved; options.closed = d.closed; }
    },
    claimFocus(d, view) {
      view ??= d.views.includes(focusView) ? focusView : d.views[0];
      if (!view) return;
      focusView = view;
      if (!(d.sub === S.T_CARET || d.sub === S.T_CHAR)) wimp.setCaret(view.win);
    },
    releaseCaret(d, keepFocus = true) {
      const v = d.views.includes(focusView) ? focusView : d.views[0];
      if (v && wimp.caret?.window === v.win) wimp.setCaret(keepFocus ? v.win : null);
    },
    showTextCaret(d, view) {
      view ??= d.views.includes(focusView) ? focusView : d.views[0];
      const o = d.cons;
      if (!view || !o) return;
      focusView = view;
      const adv = DF.textAdvance(o, d.fonts);
      const fn = (o.style & 0xFF) ? d.fonts.get(o.style & 0xFF) : null;
      const fi = fn ? DF.fontInfo(fn) : null;
      const asc = fi ? fi.ascender / 1000 * o.ysize : o.ysize * 7 / 8, desc = fi ? -fi.descender / 1000 * o.ysize : o.ysize / 8;
      const top = view.toWork(o.x + adv, o.y + asc), bot = view.toWork(o.x + adv, o.y - desc);
      wimp.setCaret(view.win, null, -1, { x: Math.round(top.x), y: Math.round(top.y), h: Math.max(4, Math.round(bot.y - top.y)) });
    },
  };

  // ---------------------------------------------------------------------------- diagrams & views
  function newDiagram() {
    const d = new Diagram(app);
    diagrams.push(d);
    openView(d);
    if (d.main === S.SEL) d.changeState(S.SEL);
    return d;
  }

  function openView(d) {
    // position: template, each new window 48 OS units lower (blank_position)
    const scrH = wimp.height;
    let y0 = paperTpl.visible.y0 - yshift, y1 = paperTpl.visible.y1 - yshift;
    if (y0 < 150) { yshift = 0; y0 = paperTpl.visible.y0; y1 = paperTpl.visible.y1; }
    yshift += 48;
    const win = task.createWindowFromTemplate(tpl, 'paper', {
      title: d.title, icons: [], x: paperTpl.visible.x0 / 2, y: scrH - y1 / 2, w: (paperTpl.visible.x1 - paperTpl.visible.x0) / 2, h: (y1 - y0) / 2,
      workButton: 10, minW: 1, minH: 1,
    });
    const pane = task.createWindowFromTemplate(tpl, 'pane', { spriteArea: drawSprites });
    const view = new View(app, d, win, pane);
    d.views.push(view);
    win.useCanvas((g, r) => view.redraw(g, r));
    win.setExtent({ x0: 0, y0: 0, x1: view.extW, y1: view.extH });
    // pane sync (draw_open_wind): pane to the left of the visible area, tops aligned
    const syncPane = () => {
      if (!win.isOpen || !view.showPane) { if (pane.isOpen) pane.close(); return; }
      const x = win.x >= 0 ? Math.max(win.x, pane.w) - pane.w : win.x - pane.w;
      pane.open({ x, y: win.y, behind: 'keep' });
      wimp._stackAbove?.(pane, win);
    };
    view.syncPane = syncPane;
    win.on('opened', syncPane);
    win.on('moved', syncPane);
    win.on('closed', () => pane.close());
    win.on('deleted', () => pane.delete());
    win.menu = (ev) => menuFor(view);
    win.on('click', (ev) => paperClick(view, ev));
    win.on('doubleclick', (ev) => paperDouble(view, ev));
    win.on('drag', (ev) => paperDrag(view, ev));
    win.on('pointermove', (ev) => pointerMoved(view, ev));
    win.on('pointerenter', () => view.updatePointer());
    win.on('key', (ev) => processKey(view, ev));
    win.on('close', (ev) => { ev.preventDefault(); closeView(view, ev); });
    win.on('dataload', (ev) => { insertFiles(view, ev); return true; });
    win.on('datasave', (ev) => { receiveData(view, ev); return true; });
    win.on('gaincaret', () => { focusView = view; });
    win.on('helprequest', (ev) => { ev.text = helpForState(d); });
    pane.on('click', (ev) => paneClick(view, ev));
    pane.on('helprequest', (ev) => { ev.text = ev.icon ? paneHelp(ev.icon.handle) : null; });
    pane.menu = () => menuFor(view);
    view.showToolState();
    view.updatePointer();
    view.updateTitle();
    d.updateTitles();
    const h = win.h;
    win.open({ scrollX: 0, scrollY: Math.max(0, view.extH - h), behind: 'top' });
    focusView = view;
    wimp.setCaret(win);
    return view;
  }

  function disposeDiagram(d) {
    for (const v of [...d.views]) v.win.delete();
    d.views = [];
    const i = diagrams.indexOf(d);
    if (i >= 0) diagrams.splice(i, 1);
  }

  async function closeView(view, ev) {
    const d = view.diag;
    wimp.menus.close();
    if (ev?.button === 'adjust' && d.filename && d.filename.includes('.')) {
      os.filer?.openDir(d.filename.slice(0, d.filename.lastIndexOf('.')));
      if (ev.shift) return;
    }
    if (d.views.length === 1 && d.modified) {
      const r = await closeQuery(d);
      if (r === 'Save') { saveBox(d, 'file').openCentred(); return; }
      if (r !== 'Discard') return;
    }
    if (d.views.length === 1) { disposeDiagram(d); return; }
    d.views = d.views.filter((v) => v !== view);
    view.win.delete();
    if (focusView === view) focusView = null;
    d.updateTitles();
  }

  // ---------------------------------------------------------------------------- dialogues
  function queryBox(name, message) {
    return new Promise((resolve) => {
      const w = wimp.createWindowFromTemplate(tpl, name, {}, task);
      const I = w.icons;
      I[1].setText(message);
      const finish = (v) => { w.delete(); resolve(v); };
      w.on('click', (ev) => { if (ev.button === 'menu' || !ev.icon) return; if (ev.icon.handle !== 1) finish(ev.icon.text); });
      w.on('close', (e) => { e.preventDefault(); finish('Cancel'); });
      w.on('key', (e) => { if (e.code === 27) finish('Cancel'); else if (e.code === 13) finish(I[0].text); return true; });
      w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
      wimp.setCaret(w);
    });
  }
  const closeQuery = (d) => queryBox('close', d.filename ? msg('DrawS2', d.filename) : msg('DrawS1'));

  async function mayQuit() {
    const n = diagrams.filter((d) => d.modified).length;
    if (!n) return true;
    const r = await queryBox('quit', n === 1 ? msg('DrawQ1') : msg('DrawQ2', n));
    return r === 'Discard';
  }

  let infoWin = null;
  function infoBox() {
    infoWin?.delete();
    infoWin = wimp.createWindowFromTemplate(tpl, 'progInfo', {}, task);
    infoWin.icons[4].setText(msg('DrawID'));
    return infoWin;
  }

  function saveBox(d, how) {
    const sel = () => d.selected();
    const kinds = {
      file: { name: d.filename || msg('FileDr'), type: FT.DRAW, data: () => serialise(d) },
      selection: { name: msg('FileSe'), type: FT.DRAW, data: () => serialise(d, sel()) },
      sprite: { name: msg('FileSp'), type: FT.SPRITE, data: () => exportSprites(sel()) },
      textarea: { name: msg('FileTa'), type: FT.TEXT, data: () => new TextEncoder().encode(sel().find((o) => o.type === 'textarea')?.text ?? '') },
      jpeg: { name: msg('FileTc'), type: FT.JPEG, data: () => sel().find((o) => o.type === 'jpeg')?.data ?? new Uint8Array(0) },
    };
    const k = kinds[how];
    return saveAs({
      task, filename: k.name, filetype: k.type,
      getData: async () => k.data(),
      onSaved: (path) => {
        if (how === 'file' && path) { d.filename = path; d.setModified(false); d.updateTitles(); }
      },
    });
  }

  function magnifier(view) {
    const w = wimp.createWindowFromTemplate(tpl, 'magnifier', {}, task);
    const I = w.icons;
    const show = () => { I[0].setText(String(view.zoom.mul)); I[1].setText(String(view.zoom.div)); };
    show();
    const apply = (mul, div) => {
      mul = Math.max(1, Math.min(MAXZOOM, mul | 0)); div = Math.max(1, Math.min(MAXZOOM, div | 0));
      zoomTo(view, mul, div);
      show();
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const d = ev.button === 'adjust' ? -1 : 1;
      if (ev.icon === I[2]) apply(view.zoom.mul + d, view.zoom.div);
      else if (ev.icon === I[3]) apply(view.zoom.mul - d, view.zoom.div);
      else if (ev.icon === I[4]) apply(view.zoom.mul, view.zoom.div + d);
      else if (ev.icon === I[5]) apply(view.zoom.mul, view.zoom.div - d);
    });
    w.on('key', (ev) => { if (ev.code === 13) { apply(parseInt(I[0].text, 10) || 1, parseInt(I[1].text, 10) || 1); wimp.menus.close(); return true; } });
    w.on('menuclosed', () => w.delete());
    return w;
  }

  function numPoint(view) {
    const d = view.diag, e = d.edit;
    const w = wimp.createWindowFromTemplate(tpl, 'NumPoint', { spriteArea: null }, task);
    const I = w.icons;
    let inches = options.numInches ?? true;
    const el = e?.obj.elements[e.cur];
    const cor = e?.cor ?? ['x', 'y'];
    const unit = () => (inches ? dbc.OneInch : dbc.OneCm);
    const show = () => {
      I[3].setState({ selected: inches }); I[4].setState({ selected: !inches });
      if (el) { I[1].setText((el[cor[0]] / unit()).toFixed(3)); I[2].setText((el[cor[1]] / unit()).toFixed(3)); }
    };
    show();
    const ok = () => {
      const x = parseFloat(I[1].text), y = parseFloat(I[2].text);
      if (!isNaN(x) && !isNaN(y)) d.editOp('setpoint', { x: Math.round(x * unit()), y: Math.round(y * unit()) });
      wimp.menus.close();
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.icon === I[0]) ok();
      else if (ev.icon === I[5]) wimp.menus.close();
      else if (ev.icon === I[3] || ev.icon === I[4]) {
        const x = parseFloat(I[1].text) * unit(), y = parseFloat(I[2].text) * unit();
        inches = ev.icon === I[3]; options.numInches = inches;
        I[1].setText((x / unit()).toFixed(3)); I[2].setText((y / unit()).toFixed(3));
        I[3].setState({ selected: inches }); I[4].setState({ selected: !inches });
      }
    });
    w.on('key', (ev) => { if (ev.code === 13) { ok(); return true; } });
    w.on('menuclosed', () => w.delete());
    return w;
  }

  function fileDbox(view, load) {
    const w = wimp.createWindowFromTemplate(tpl, 'dboxfile_db', {}, task);
    const I = w.icons;
    I[1].setText(msg(load ? 'MenuLF' : 'MenuLI'));
    const ok = async () => {
      const name = I[2].text.trim();
      w.delete();
      if (!name) return;
      try {
        const st = os.vfs.stat(name);
        if (!st || st.type !== 'file') throw new Error(msg('FileO1'));
        if (load) await loadFileNew(st.path, st.filetype);
        else await insertFile(view, st.path, st.filetype, view.diag.ptzzz);
      } catch (e) { task.reportError(e.message ?? String(e)); }
    };
    w.on('click', (ev) => { if (ev.icon === I[0] && ev.button !== 'menu') ok(); });
    w.on('key', (ev) => { if (ev.code === 13) { ok(); return true; } if (ev.code === 27) { w.delete(); return true; } });
    w.on('close', (e) => { e.preventDefault(); w.delete(); });
    w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
    wimp.setCaret(w, I[2], 0);
  }

  function printDbox(d) {
    const w = wimp.createWindowFromTemplate(tpl, 'printerInfo', {}, task);
    const I = w.icons;
    I[0].setText(os.printers?.current?.name ?? msg('Print0'));
    I[2].setText(String(printCopies));
    const go = () => { printCopies = parseInt(I[2].text, 10) || 1; wimp.menus.close(); printIt(d, printCopies); };
    w.on('click', (ev) => { if (ev.icon === I[3] && ev.button !== 'menu') go(); });
    w.on('key', (ev) => { if (ev.code === 13) { go(); return true; } });
    w.on('menuclosed', () => w.delete());
    return w;
  }
  /** draw_print_queue: print via the Printers application (os.printers), or complain like Draw does. */
  function printIt(d, copies = 1) {
    if (!os.printers?.current) { task.reportError(msg('Print1')); return; }
    if (!d.objects.length) { task.reportError(msg('Print2')); return; }
    const canvas = renderPage(d, 2), lim = d.viewLimit;
    // the whole paper at its true size (46080 draw units per inch)
    const html = `<img class="pic" src="${canvas.toDataURL()}" style="width:${(lim.x1 / DF.DU_PER_INCH).toFixed(3)}in;height:${(lim.y1 / DF.DU_PER_INCH).toFixed(3)}in;max-width:100%;image-rendering:auto">`;
    for (let i = 0; i < copies; i++) os.printers.print({ title: d.filename || d.title, html });
  }
  /** Render the whole paper to a canvas at `scale` (1 = 90 dpi). */
  function renderPage(d, scale) {
    const lim = d.viewLimit, k = scale / 512;
    const c = document.createElement('canvas');
    c.width = Math.ceil(lim.x1 * k); c.height = Math.ceil(lim.y1 * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    DF.renderObjects(g, d.objects, { k, ox: 0, oy: c.height, fonts: d.fonts, thinWidth: scale / 2 });
    return c;
  }

  // ---------------------------------------------------------------------------- menus
  const K2T = (s) => s.replace(/\x8b/g, '⇧');
  /** RISC_OSLib menu_new syntax -> item list: [{text, key, dotted, dbox}] */
  function parseItems(token) {
    const out = [];
    for (const part of msg(token).split(',')) {
      for (const [j, seg] of part.split('|').entries()) {
        if (j > 0 && out.length) out[out.length - 1].dotted = true;
        let t = seg, dbox = false;
        if (t.startsWith('>')) { dbox = true; t = t.slice(1); }
        const m = /^(.*?\S)\s{2,}(\S.*)$/.exec(t);
        out.push(m ? { text: m[1], key: K2T(m[2]), dbox } : { text: t.trim(), dbox });
      }
    }
    return out;
  }
  function makeMenu(titleTok, itemsTok, specs, opts = {}) {
    const base = parseItems(itemsTok);
    return new Menu(msg(titleTok), base.map((b, i) => ({ ...b, ...(specs[i] ?? {}) })), opts);
  }
  const writableItem = (get, set, validation = 'A0-9.', maxLen = 9) => {
    const w = { value: get(), maxLen, validation };
    return { text: '', writable: w, action: (ev) => set(ev.value ?? w.value) };
  };
  /** Numeric list menu with a final writable entry (line width, font sizes, tricap). */
  function numMenu(titleTok, itemsTok, values, current, fmt, parse, apply) {
    const items = parseItems(itemsTok);
    return new Menu(msg(titleTok), items.map((b, i) => (i < values.length
      ? { ...b, ticked: () => current() === values[i], action: () => apply(values[i]) }
      : writableItem(() => fmt(current()), (v) => { const n = parse(v); if (n != null && !isNaN(n)) apply(n); }))));
  }

  // style (read_style)
  function readStyle(d) {
    const st = { pathFade: true, patternFade: true, textFade: true, textcolFade: true, path: null, text: null };
    if ([S.PATH, S.TEXT, S.RECT, S.ELLI, S.EDIT].includes(d.main)) {
      st.patternFade = d.main === S.EDIT;
      st.pathFade = false; st.textFade = false;
      st.path = { ...d.path }; st.text = { ...d.font };
    } else if (d.main === S.SEL) {
      const walk = (o) => {
        if (o.type === 'group') return o.objects.forEach(walk);
        if (o.type === 'tagged') return o.object && walk(o.object);
        if (o.type === 'path') {
          const s = o.style;
          st.pathFade = st.patternFade = false;
          st.path = { width: o.width, stroke: o.stroke, fill: o.fill, dash: o.dash, join: DF.pathStyle.join(s), startcap: DF.pathStyle.startcap(s), endcap: DF.pathStyle.endcap(s), winding: DF.pathStyle.winding(s), tricapW: DF.pathStyle.tricapW(s), tricapH: DF.pathStyle.tricapH(s) };
        } else if (o.type === 'text' || o.type === 'trfmtext') {
          st.textFade = false;
          st.text = { ref: o.style & 0xFF, xsize: o.xsize, ysize: o.ysize, colour: o.colour, bg: o.bg };
        } else if (o.type === 'textarea') {
          st.textcolFade = false;
          st.text = { ...(st.text ?? d.font), colour: o.colour, bg: o.bg };
        }
      };
      d.selected().forEach(walk);
    }
    return st;
  }
  /** set_style: restyle the selection (select mode) or the text being typed, and the current style. */
  function setStyle(d, key, value) {
    const P = d.path, F = d.font;
    const applyObj = (o) => {
      if (o.type === 'path') {
        const s = o.style;
        const cur = { join: DF.pathStyle.join(s), endcap: DF.pathStyle.endcap(s), startcap: DF.pathStyle.startcap(s), winding: DF.pathStyle.winding(s), tricapW: DF.pathStyle.tricapW(s), tricapH: DF.pathStyle.tricapH(s) };
        switch (key) {
          case 'width': o.width = value; break;
          case 'stroke': o.stroke = value; break;
          case 'fill': o.fill = value; break;
          case 'dash': o.dash = value ? { offset: value.offset, elements: value.elements.slice() } : null; break;
          default: if (key in cur) { cur[key] = value; o.style = (DF.pathStyle.make(cur) | (o.style & 0xFF00)) >>> 0; } break;
        }
      } else if (o.type === 'text' || o.type === 'trfmtext') {
        switch (key) {
          case 'font': o.style = ((o.style & ~0xFF) | value) >>> 0; break;
          case 'size': o.xsize = o.ysize = value; break;
          case 'height': o.ysize = value; break;
          case 'colour': o.colour = value; break;
          case 'bg': o.bg = value; break;
          default: break;
        }
      } else if (o.type === 'textarea') {
        if (key === 'colour') o.colour = value; else if (key === 'bg') o.bg = value;
      }
    };
    if (d.main === S.SEL && d.sel.size) d.restyle(applyObj);
    else if ((d.sub === S.T_CARET || d.sub === S.T_CHAR) && d.cons) { applyObj(d.cons); d.bound(d.cons); app.showTextCaret(d); d.redrawAll(); }
    switch (key) {
      case 'width': P.width = value; break;
      case 'stroke': P.stroke = value; break;
      case 'fill': P.fill = value; break;
      case 'dash': P.dash = value; break;
      case 'join': case 'startcap': case 'endcap': case 'winding': case 'tricapW': case 'tricapH': P[key] = value; break;
      case 'font': F.ref = value; break;
      case 'size': F.xsize = F.ysize = value; break;
      case 'height': F.ysize = value; break;
      case 'colour': F.colour = value; break;
      case 'bg': F.bg = value; break;
      default: break;
    }
  }

  const pt = (v) => (v / dbc.OnePoint).toFixed(2);
  const parsePt = (s) => { const n = parseFloat(s); return isNaN(n) ? null : Math.round(n * dbc.OnePoint); };

  function colourItem(d, key, titleTok, trans) {
    return () => {
      const st = readStyle(d);
      const cur = key === 'stroke' ? st.path?.stroke : key === 'fill' ? st.path?.fill : key === 'colour' ? st.text?.colour : st.text?.bg;
      return colourPicker({ task, title: msg(titleTok), colour: cur ?? BLACK, allowTransparent: trans, onChoose: (c) => setStyle(d, key, c) });
    };
  }

  function capMenu(d, which) {
    const st = () => readStyle(d).path ?? d.path;
    const triMenu = (tok, key) => numMenu(tok, 'MenuLC4', [16, 32, 48, 64], () => st()[key], (v) => (v / 16).toFixed(2), (s) => { const n = parseFloat(s); return isNaN(n) ? null : Math.round(n * 16); }, (v) => { if (v >= 0 && v < 0x100) setStyle(d, key, v); });
    const cap = makeMenu('MenuLC2', 'MenuLC3', [{ submenu: () => triMenu('MenuLG1', 'tricapW') }, { submenu: () => triMenu('MenuLG2', 'tricapH') }]);
    return makeMenu(which === 'startcap' ? 'MenuLCs' : 'MenuLCe', 'MenuLC1', [0, 1, 2, 3].map((v) => ({
      ticked: () => st()[which] === v, action: () => setStyle(d, which, v), ...(v === 3 ? { submenu: () => cap } : {}),
    })));
  }

  function fontMenu(d) {
    const cur = () => { const st = readStyle(d); return st.text?.ref ? (d.fonts.get(st.text.ref) ?? '') : ''; };
    const fams = new Map();
    for (const n of DF.availableFonts()) { const f = n.split('.')[0]; if (!fams.has(f)) fams.set(f, []); fams.get(f).push(n); }
    const items = [{ text: msg('MenuF1'), ticked: () => cur() === '', action: () => setStyle(d, 'font', 0), dotted: true }];
    for (const [f, list] of [...fams.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const pick = (name) => setStyle(d, 'font', d.fontRef(name));
      if (list.length === 1 && list[0] === f) items.push({ text: f, ticked: () => cur().toLowerCase() === f.toLowerCase(), action: () => pick(f) });
      else {
        items.push({
          text: f, ticked: () => cur().toLowerCase().startsWith(f.toLowerCase() + '.'),
          action: () => pick(list.find((n) => /medium$|primary$/i.test(n)) ?? list[0]),
          submenu: () => new Menu(f, list.sort().map((n) => ({ text: n.slice(f.length + 1), ticked: () => cur().toLowerCase() === n.toLowerCase(), action: () => pick(n) }))),
        });
      }
    }
    return new Menu(msg('MenuF0'), items);
  }

  function styleMenu(d) {
    const st = () => readStyle(d);
    const P = () => st().path ?? d.path, T = () => st().text ?? d.font;
    const pf = () => st().pathFade, tf = () => st().textFade;
    const widthM = () => numMenu('MenuLW0', 'MenuLW1', [0, 160, 320, 640, 1280, 2560], () => P().width, pt, parsePt, (v) => { if (v >= 0 && v < 640000) setStyle(d, 'width', v); });
    const patternM = () => new Menu(msg('MenuLP0'), ['none', 'pat1', 'pat2', 'pat3', 'pat4'].map((s, i) => ({
      text: '', sprite: drawSprites.get(s), spriteArea: drawSprites, spriteW: 100, ticked: () => patternIndex(P().dash) === i, action: () => setStyle(d, 'dash', PATTERNS[i]),
    })));
    const joinM = () => makeMenu('MenuLJ0', 'MenuLJ1', [0, 1, 2].map((v) => ({ ticked: () => P().join === v, action: () => setStyle(d, 'join', v) })));
    const windM = () => makeMenu('MenuLR0', 'MenuLR1', [0, 1].map((v) => ({ ticked: () => P().winding === v, action: () => setStyle(d, 'winding', v) })));
    const sizeM = (tok, key, get) => numMenu(tok, 'MenuFS1', [5120, 6400, 7680, 8960, 12800], get, pt, parsePt, (v) => { if (v >= 640 && v < 640000) setStyle(d, key, v); });
    return makeMenu('MenuS0', 'MenuS1', [
      { shaded: pf, submenu: widthM },
      { shaded: pf, submenu: colourItem(d, 'stroke', 'MenuCl1', true) },
      { shaded: pf, submenu: colourItem(d, 'fill', 'MenuCl2', true) },
      { shaded: () => st().patternFade, submenu: patternM },
      { shaded: pf, submenu: joinM },
      { shaded: pf, submenu: () => capMenu(d, 'startcap') },
      { shaded: pf, submenu: () => capMenu(d, 'endcap') },
      { shaded: pf, submenu: windM },
      { shaded: tf, submenu: () => fontMenu(d) },
      { shaded: tf, submenu: () => sizeM('MenuLG3', 'size', () => T().xsize) },
      { shaded: tf, submenu: () => sizeM('MenuLG2', 'height', () => T().ysize) },
      { shaded: () => tf() && st().textcolFade, submenu: colourItem(d, 'colour', 'MenuCl4', true) },
      { shaded: () => tf() && st().textcolFade, submenu: colourItem(d, 'bg', 'MenuCl5', false) },
    ]);
  }

  function gotSel(d) {
    const s = d.main === S.SEL ? d.selected() : [];
    const g = { n: s.length, path: false, sprite: false, group: false, textarea: false, text: false, aatext: false, jpeg: false, interp: false };
    for (const o of s) {
      if (o.type === 'path') g.path = true;
      if (o.type === 'sprite' || o.type === 'trfmsprite') g.sprite = true;
      if (o.type === 'group') g.group = true;
      if (o.type === 'textarea') g.textarea = true;
      if (o.type === 'text' || o.type === 'trfmtext') { g.text = true; if (o.style & 0xFF) g.aatext = true; }
      if (o.type === 'jpeg') g.jpeg = true;
    }
    if (s.length === 1 && s[0].type === 'group') { const p = s[0].objects.filter((o) => o.type === 'path'); g.interp = p.length === 2; }
    return g;
  }

  function doSave(view, how, fromKey) {
    const d = view.diag, g = gotSel(d);
    const ok = { file: true, selection: g.n > 0, sprite: g.sprite && g.n === 1, textarea: g.textarea && g.n === 1, jpeg: g.jpeg && g.n === 1 }[how];
    if (!ok) { task.reportError(msg('MenuNoS')); return null; }
    const b = saveBox(d, how);
    if (fromKey) b.openCentred();
    return b;
  }

  function doSelect(view, code, arg) {
    const d = view.diag, g = gotSel(d);
    switch (code) {
      case 'select': d.changeState(S.SEL); break;
      case 'all': d.selectAll(); break;
      case 'clear': d.clearSelection(); break;
      case 'copy': if (g.n) d.copySelection(view.jog()); break;
      case 'delete': d.deleteSelection(); break;
      case 'front': d.frontBack(true); break;
      case 'back': d.frontBack(false); break;
      case 'group': d.group(); break;
      case 'ungroup': d.ungroup(); break;
      case 'edit': {
        if (g.n !== 1) break;
        const o = d.selected()[0];
        if (o.type === 'path') { d.editObject(o); break; }
        if ((o.type === 'text' || o.type === 'trfmtext') && arg != null) { d.restyle((q) => { if (q === o) q.text = arg; }); }
        break;
      }
      case 'snap': if (g.n && (view.grid.show || view.grid.lock)) d.transformSelection((o) => { const b = o.bbox; const p = view.snap({ x: b.x0, y: b.y0 }); translateObject(o, p.x - b.x0, p.y - b.y0); }); break;
      case 'justify': if (g.group) { if (arg) lastJustify = arg; d.justify(lastJustify.h, lastJustify.v); } break;
      case 'interp': case 'grade': {
        const n = Math.min(255, parseInt(code === 'interp' ? menuBuf.interp : menuBuf.grade, 10) || 0);
        if (g.interp && n > 1) d.interpolate(n, code === 'grade');
        break;
      }
      case 'topath': task.reportError(msg('DrawT')); break;
      default: break;
    }
  }

  function doTransform(view, code) {
    const d = view.diag;
    const num = (s) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
    switch (code) {
      case 'rotate': {
        const a = num(menuBuf.rotate) * Math.PI / 180;
        if (!a) return;
        const s = Math.sin(a), c = Math.cos(a);
        d.transformSelection((o) => { if (isRotatable(o, d.fonts)) rotateObject(o, s, c, null, d.fonts); });
        break;
      }
      case 'xscale': { const f = num(menuBuf.xscale); if (f && f !== 1) d.transformSelection((o) => scaleObject(o, f, 1, null, { body: true }, d.fonts)); break; }
      case 'yscale': { const f = num(menuBuf.yscale); if (f && f !== 1) d.transformSelection((o) => scaleObject(o, 1, f, null, { body: true }, d.fonts)); break; }
      case 'lscale': { const f = num(menuBuf.lscale); if (f && f !== 1) d.transformSelection((o) => scaleObject(o, f, f, null, { body: false, lines: true }, d.fonts)); break; }
      case 'magnify': { const f = num(menuBuf.magnify); if (f && f !== 1) d.transformSelection((o) => scaleObject(o, f, f, null, { body: true, lines: true }, d.fonts)); break; }
      default: break;
    }
  }

  function gridMenu(view) {
    const G = view.grid;
    const fade = () => !(G.show || G.lock);
    const redraw = () => { view.setGridState(); view.invalidate(); };
    const SPACE = [[1, 1, 1, 1], [1, 1]], DIV = [[4, 16, 5, 10], [2, 10]];
    const sizeMenu = (size, yonly) => {
      const xy = yonly ? 1 : 0;
      const set = (space, divide) => {
        for (let a = xy; a <= 1; a++) {
          if (a === 0) { G.xinch = size === 0; } else { G.yinch = size === 0; }
          G.unit[size].space[a] = space; G.unit[size].divide[a] = divide;
        }
        if (!yonly) { options.grid.space = space; options.grid.divide = divide; options.grid.cm = size === 1; }
        redraw();
      };
      const u = G.unit[size];
      const bufs = { space: String(u.space[xy]), div: String(u.divide[xy]) };
      const items = parseItems(size === 0 ? 'MenuGrI' : 'MenuGrC');
      const n = SPACE[size].length;
      return new Menu(msg(size === 0 ? 'MenuGsI' : 'MenuGsC'), items.map((b, i) => {
        if (i < n) return { ...b, ticked: () => u.space[xy] === SPACE[size][i] && u.divide[xy] === DIV[size][i], action: () => set(SPACE[size][i], DIV[size][i]) };
        const isSpace = i === n;
        return {
          ...b,
          submenu: () => new Menu(msg(isSpace ? 'MenuGr0' : 'MenuGr1'), [writableItem(() => (isSpace ? bufs.space : bufs.div), (v) => {
            if (isSpace) bufs.space = v; else bufs.div = v;
            let sp = parseFloat(bufs.space) || 0, dv = parseInt(bufs.div, 10) || 1;
            const unit = size === 0 ? dbc.OneInch : dbc.OneCm;
            const min = 512 / (unit * 8), max = (wimp.height * 2 * 256) / unit;
            sp = Math.max(min, Math.min(max, sp));
            set(sp, Math.max(1, dv));
          }, isSpace ? 'A0-9.' : 'A0-9', isSpace ? 6 : 3)]),
        };
      }));
    };
    return makeMenu('MenuGD0', 'MenuGD1', [
      { ticked: () => G.show, action: () => { G.show = !G.show; options.grid.show = G.show; redraw(); } },
      { ticked: () => G.lock, action: () => { G.lock = !G.lock; options.grid.lock = G.lock; view.updateTitle(); } },
      { ticked: () => G.auto, shaded: fade, action: () => { G.auto = !G.auto; options.grid.auto = G.auto; redraw(); } },
      { shaded: fade, submenu: () => colourMenu(msg('MenuGD0'), () => G.colour, (n) => { G.colour = n; redraw(); }) },
      { ticked: () => G.xinch, shaded: fade, submenu: () => sizeMenu(0, false), action: () => { G.xinch = G.yinch = true; redraw(); } },
      { ticked: () => !G.xinch, shaded: fade, submenu: () => sizeMenu(1, false), action: () => { G.xinch = G.yinch = false; redraw(); } },
      { ticked: () => G.yinch, shaded: () => fade() || G.iso, submenu: () => sizeMenu(0, true), action: () => { G.yinch = true; redraw(); } },
      { ticked: () => !G.yinch, shaded: () => fade() || G.iso, submenu: () => sizeMenu(1, true), action: () => { G.yinch = false; redraw(); } },
      { ticked: () => !G.iso, shaded: fade, action: () => { G.iso = false; options.grid.iso = false; redraw(); } },
      { ticked: () => G.iso, shaded: fade, action: () => { G.iso = true; options.grid.iso = true; redraw(); } },
    ]);
  }

  function paperMenu(view) {
    const d = view.diag;
    const opt = () => d.paper.options;
    const resize = (size, o) => {
      d.paper.size = size; d.paper.options = o;
      options.paperSize = size; options.paperOptions = o & ~PAPER.Default;
      for (const v of d.views) v.setExtent();
    };
    return makeMenu('MenuP0', 'MenuP1', [
      { ticked: () => !!(opt() & PAPER.Show), action: () => { d.paper.options ^= PAPER.Show; d.redrawAll(); } },
      { ticked: () => !!(opt() & PAPER.Default), action: () => { d.paper.options ^= PAPER.Default; d.redrawAll(); } },
      { ticked: () => !(opt() & PAPER.Landscape), action: () => resize(d.paper.size, opt() & ~PAPER.Landscape) },
      { ticked: () => !!(opt() & PAPER.Landscape), action: () => resize(d.paper.size, opt() | PAPER.Landscape) },
      ...[0x100, 0x200, 0x300, 0x400, 0x500, 0x600].map((s) => ({ ticked: () => d.paper.size === s, action: () => resize(s, opt()) })),
    ]);
  }

  function editMenu(view) {
    const d = view.diag;
    const c = () => d.editChecks();
    const snapOK = () => view.grid.show || view.grid.lock;
    return makeMenu('MenuEd0', 'MenuEd1', [
      { shaded: () => !c().curve, action: () => d.editOp('curve') },
      { shaded: () => !c().line, action: () => d.editOp('line') },
      { shaded: () => !c().move, action: () => d.editOp('move') },
      { shaded: () => !(c().got && d.edit.obj.elements[d.edit.cur]?.t !== DF.PATH.MOVE), action: () => d.editOp('add') },
      { shaded: () => !c().got, action: () => d.editOp('delete') },
      { shaded: () => !c().got, action: () => d.editOp('flatten') },
      { shaded: () => !(c().got && c().closed), action: () => d.editOp('open', view.jog()) },
      { shaded: () => !(c().got && !c().closed), action: () => d.editOp('close') },
      { shaded: () => !c().enter, submenu: () => numPoint(view) },
      { shaded: () => !snapOK(), action: () => d.editOp('snap', (p) => view.snap(p)) },
    ], { help: msg('EDIT0') });
  }

  function menuFor(view) {
    const d = view.diag;
    focusView = view;
    if (d.main === S.EDIT) return editMenu(view);
    const g = () => gotSel(d);
    const selOwner = () => d.main === S.SEL;
    const misc = () => makeMenu('MenuM0', 'MenuM1', [
      { submenu: () => infoBox() },
      { action: () => openView(d) },
      { ticked: () => !!(d.paper.options & PAPER.Show), submenu: () => paperMenu(view), action: () => { d.paper.options ^= PAPER.Show; d.redrawAll(); } },
      { submenu: () => printDbox(d), action: () => printIt(d) },
      { ticked: () => view.zoomLock, action: () => { view.zoomLock = !view.zoomLock; options.zoomLock = view.zoomLock; } },
      { shaded: () => !d.canUndo(), action: () => d.doUndo() },
      { shaded: () => !d.canRedo(), action: () => d.doRedo() },
    ]);
    const save = () => makeMenu('MenuSv0', 'MenuSv1', [
      { submenu: () => saveBox(d, 'file') },
      { shaded: () => !g().n, submenu: () => saveBox(d, 'selection') },
      { shaded: () => !(g().sprite && g().n === 1), submenu: () => saveBox(d, 'sprite') },
      { shaded: () => !(g().textarea && g().n === 1), submenu: () => saveBox(d, 'textarea') },
      { shaded: true, submenu: () => null },
      { shaded: () => !(g().jpeg && g().n === 1), submenu: () => saveBox(d, 'jpeg') },
    ]);
    const enter = () => makeMenu('MenuEn0', 'MenuEn1', [
      { ticked: () => d.main === S.TEXT, action: () => d.changeState(S.TEXT) },
      { ticked: () => d.main === S.PATH && !d.curved, action: () => d.changeState(S.PATH, 0, d.closed) },
      { ticked: () => d.main === S.PATH && d.curved, action: () => d.changeState(S.PATH, 1, d.closed) },
      { shaded: () => d.main !== S.PATH, action: () => d.movePending() },
      { shaded: () => d.main !== S.PATH, action: () => d.complete() },
      { shaded: () => d.main !== S.PATH, ticked: () => d.closed, action: () => d.changeState(S.PATH, d.curved, !d.closed) },
      { action: () => d.abandon() },
      { ticked: () => d.main === S.RECT, action: () => d.changeState(S.RECT) },
      { ticked: () => d.main === S.ELLI, action: () => d.changeState(S.ELLI) },
    ]);
    const editText = () => {
      const o = d.selected()[0];
      const w = { value: o?.text ?? '', maxLen: 255, validation: '' };
      return new Menu(msg('MenuLG4'), [{ text: '', writable: w, action: (ev) => doSelect(view, 'edit', ev.value ?? w.value) }]);
    };
    const num = (tok, key, valid) => () => new Menu(msg(tok), [writableItem(() => menuBuf[key], (v) => { menuBuf[key] = v; }, valid, 6)]);
    const select = () => makeMenu('MenuSe0', 'MenuSe1', [
      { action: () => doSelect(view, 'all') },
      { shaded: () => !(selOwner() && g().n), action: () => doSelect(view, 'clear') },
      { shaded: () => !g().n, action: () => doSelect(view, 'copy') },
      { shaded: () => !(selOwner() && g().n), action: () => doSelect(view, 'delete') },
      { shaded: () => !(selOwner() && g().n), action: () => doSelect(view, 'front') },
      { shaded: () => !(selOwner() && g().n), action: () => doSelect(view, 'back') },
      { shaded: () => !(selOwner() && g().n > 1), action: () => doSelect(view, 'group') },
      { shaded: () => !g().group, action: () => doSelect(view, 'ungroup') },
      { shaded: () => !(g().n === 1 && (g().path || g().text)), action: () => doSelect(view, 'edit'), submenu: () => (g().text && !g().path ? editText() : null) },
      { shaded: () => !(selOwner() && g().n && (view.grid.show || view.grid.lock)), action: () => doSelect(view, 'snap') },
      { shaded: () => !g().group, action: () => doSelect(view, 'justify'), submenu: () => makeMenu('MenuSJ0', 'MenuSJ1', [1, 2, 3, 4, 5, 6].map((i) => ({ ticked: () => (i <= 3 ? lastJustify.h === i : lastJustify.v === i - 3), action: () => doSelect(view, 'justify', i <= 3 ? { h: i, v: 0 } : { h: 0, v: i - 3 }) }))) },
      { shaded: () => !g().interp, action: () => doSelect(view, 'interp'), submenu: () => new Menu(msg('MenuSG0'), [writableItem(() => menuBuf.interp, (v) => { menuBuf.interp = v; doSelect(view, 'interp'); }, 'A0-9', 6)]) },
      { shaded: () => !g().interp, action: () => doSelect(view, 'grade'), submenu: () => new Menu(msg('MenuSG0'), [writableItem(() => menuBuf.grade, (v) => { menuBuf.grade = v; doSelect(view, 'grade'); }, 'A0-9', 6)]) },
      { shaded: () => !(g().aatext || g().group), action: () => doSelect(view, 'topath') },
    ]);
    const tnum = (tok, key, code, valid) => () => new Menu(msg(tok), [writableItem(() => menuBuf[key], (v) => { menuBuf[key] = v; doTransform(view, code); }, valid, 6)]);
    const transform = () => makeMenu('MenuSe2', 'MenuSe3', [
      { shaded: () => !(selOwner() && g().n && d.selected().some((o) => isRotatable(o, d.fonts))), action: () => doTransform(view, 'rotate'), submenu: tnum('MenuSA0', 'rotate', 'rotate', 'A0-9.\\-') },
      { shaded: () => !(selOwner() && g().n), action: () => doTransform(view, 'xscale'), submenu: tnum('MenuSX0', 'xscale', 'xscale', 'A0-9.\\-') },
      { shaded: () => !(selOwner() && g().n), action: () => doTransform(view, 'yscale'), submenu: tnum('MenuSY0', 'yscale', 'yscale', 'A0-9.\\-') },
      { shaded: () => !(selOwner() && readStyle(d).path), action: () => doTransform(view, 'lscale'), submenu: tnum('MenuSL0', 'lscale', 'lscale', 'A0-9.') },
      { shaded: () => !(selOwner() && g().n), action: () => doTransform(view, 'magnify'), submenu: tnum('MenuSM0', 'magnify', 'magnify', 'A0-9.\\-') },
    ]);
    return makeMenu('MenuD0', 'MenuD1', [
      { submenu: misc },
      { submenu: save, action: () => { if (d.filename) saveTo(d, d.filename); else saveBox(d, 'file').openCentred(); } },
      { submenu: () => styleMenu(d) },
      { ticked: () => [S.PATH, S.RECT, S.ELLI, S.TEXT].includes(d.main), submenu: enter, action: () => d.changeState(S.PATH, d.curved, d.closed) },
      { ticked: () => d.main === S.SEL, submenu: select, action: () => doSelect(view, 'select') },
      { shaded: () => !(selOwner() && g().n), submenu: transform },
      { submenu: () => magnifier(view) },
      { ticked: () => view.grid.show, submenu: () => gridMenu(view), action: () => { view.grid.show = !view.grid.show; options.grid.show = view.grid.show; view.setGridState(); view.invalidate(); } },
      { ticked: () => view.showPane, action: () => toggleToolbox(view) },
    ]);
  }

  function toggleToolbox(view) {
    view.showPane = !view.showPane;
    options.toolbox = view.showPane;
    view.syncPane();
  }

  // ---------------------------------------------------------------------------- zoom (c.DrawAction)
  function zoomLockFix(mul, div) {
    if (mul >= div) { const r = mul / div; let n = 1; while (n <= MAXZOOM && n <= r) n *= 2; return [n / 2, 1]; }
    const r = div / mul; let n = 1; while (n <= MAXZOOM && n <= r) n *= 2; return [1, n / 2];
  }
  function zoomTo(view, mul, div, centre) {
    const w = view.win;
    const old = view.k;
    if (mul !== view.zoom.mul || div !== view.zoom.div) view.lastzoom = { ...view.zoom };
    view.zoom = { mul, div };
    options.zoomMul = mul; options.zoomDiv = div;
    view.setGridState();
    const nk = view.k;
    let sx, sy;
    if (centre) { const c = { x: centre.x * nk, y: Math.ceil(view.diag.viewLimit.y1 * nk) - centre.y * nk }; sx = c.x - w.w / 2; sy = c.y - w.h / 2; }
    else {
      // keep the centre of the window fixed (draw_action_zoom)
      const cx = w.scrollX + w.w / 2, cy = w.scrollY + w.h / 2;
      const oldH = Math.ceil(view.diag.viewLimit.y1 * old);
      const dx = cx / old, dy = (oldH - cy) / old;
      const newH = Math.ceil(view.diag.viewLimit.y1 * nk);
      sx = dx * nk - w.w / 2; sy = newH - dy * nk - w.h / 2;
    }
    view.setExtent();
    w.open({ scrollX: sx, scrollY: sy });
    if ((view.diag.sub === S.T_CARET || view.diag.sub === S.T_CHAR) && focusView === view) app.showTextCaret(view.diag, view);
  }
  function zoomAlter(view, adjust) {
    let { mul, div } = view.zoom;
    if (adjust === 0) { mul = div = 1; }
    else if (view.zoomLock) {
      [mul, div] = zoomLockFix(mul, div);
      if (adjust > 0) { if (div === 1) { if (mul <= MAXZOOM / 2) mul *= 2; } else div /= 2; }
      else if (mul === 1) { if (div <= MAXZOOM / 2) div *= 2; } else mul /= 2;
    } else if (adjust > 0) {
      if (mul !== 1 || div === 1) { if (mul === MAXZOOM) return; mul++; } else div--;
    } else if (mul !== 1) mul--; else { if (div === MAXZOOM) return; div++; }
    zoomTo(view, mul, div);
  }
  function zoomBox(view, box) {
    if (box.x0 === box.x1 || box.y0 === box.y1) return;
    const w = view.win;
    const bw = Math.abs(box.x1 - box.x0), bh = Math.abs(box.y1 - box.y0);
    const ratio = Math.min(w.w * 512 / bw, w.h * 512 / bh);
    let best = null, near = 1e9;
    for (let m = 1; m <= MAXZOOM; m++) for (let dv = 1; dv <= MAXZOOM; dv++) { const f = m / dv; if (f < ratio && ratio - f < near) { best = [m, dv]; near = ratio - f; } }
    let [mul, div] = best ?? [view.zoom.mul, view.zoom.div];
    if (view.zoomLock) [mul, div] = zoomLockFix(mul, div);
    zoomTo(view, mul, div, { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
  }

  // ---------------------------------------------------------------------------- mouse (paper_but)
  const drawPt = (view, ev) => view.fromWork(ev.x, ev.y);
  // Shift+Select is how Adjust is made when right = Menu, so Shift only counts as a modifier for Adjust
  // when a real Adjust button exists (Configure Buttons Adjust).
  const shifted = (ev) => (ev.button === 'adjust' ? !!ev.shift && !!input.config.rightIsAdjust : !!ev.shift);

  function paperClick(view, ev) {
    const d = view.diag;
    if (globalThis.__drawDebug) console.log('click', ev.button, ev.shift, ev.kind);
    if (ev.button === 'menu') return undefined;
    focusView = view;
    if (!(d.sub === S.T_CARET || d.sub === S.T_CHAR)) wimp.setCaret(view.win);
    let pt = drawPt(view, ev);
    if (ev.button === 'select') {
      switch (d.main) {
        case S.PATH: case S.TEXT: case S.RECT: case S.ELLI:
          pt = view.snapIfLocked(pt);
          if (pt.x !== d.ptzzz.x || pt.y !== d.ptzzz.y) d.moveConstruction(pt);
          d.enterSelect(view, pt);
          break;
        case S.SEL: d.selectClick(pt, view.grab); break;
        case S.EDIT: d.leaveEdit(true); break;
        default: break;
      }
    } else if (ev.button === 'adjust') {
      if (shifted(ev)) return true;
      switch (d.main) {
        case S.SEL: d.selectAdjust(pt, view.grab); break;
        case S.PATH: case S.RECT: case S.ELLI: case S.TEXT:
          if (d.sub === d.main) d.editAdjust(pt, view.grab);
          else if (d.main !== S.TEXT) {
            const n = d.objects.length;
            d.complete();
            if (d.objects.length > n) d.editObject(d.objects[d.objects.length - 1]);
          }
          break;
        case S.EDIT: d.editAdjust(pt, view.grab); break;
        default: break;
      }
    }
    d.ptzzz = pt;
    return true;
  }

  function paperDouble(view, ev) {
    const d = view.diag, pt = drawPt(view, ev);
    if (ev.button === 'select') {
      if ([S.PATH, S.TEXT, S.RECT, S.ELLI].includes(d.main)) {
        d.complete();
      } else if (d.main === S.SEL) d.selectDouble(pt, view.grab);
    } else if (ev.button === 'adjust') {
      if (shifted(ev)) zoomAlter(view, -1);
      else if (d.main === S.EDIT) d.editDoubleAdjust(pt, view.grab);
    }
    return true;
  }

  function trackDrag(view, ev, { snap = true, onEnd }) {
    const d = view.diag, w = view.win;
    let timer = null, last = null;
    const move = (q) => {
      last = q;
      // scroll the window when the pointer nears its edge (draw_null_event_handler)
      const nx = w.w / 20, ny = w.h / 20;
      let dx = 0, dy = 0;
      if (q.x > w.x + w.w - nx) dx = 2 * (nx + q.x - (w.x + w.w)); else if (q.x < w.x + nx) dx = -2 * (nx - (q.x - w.x));
      if (q.y > w.y + w.h - ny) dy = 2 * (ny + q.y - (w.y + w.h)); else if (q.y < w.y + ny) dy = -2 * (ny - (q.y - w.y));
      if (dx || dy) { w.open({ scrollX: w.scrollX + dx / 2, scrollY: w.scrollY + dy / 2 }); view.syncPane?.(); }
      const wp = w.screenToWork(q.x, q.y);
      let pt = view.fromWork(wp.x, wp.y);
      if (snap) pt = view.snapIfLocked(pt);
      if (pt.x !== d.ptzzz.x || pt.y !== d.ptzzz.y) d.moveConstruction(pt);
    };
    timer = setInterval(() => { if (last) move(last); }, 100);
    startPointerDrag(ev.pointerEvent ?? {}, {
      onMove: (q) => move(q),
      onEnd: () => { clearInterval(timer); onEnd?.(); },
    });
  }

  function paperDrag(view, ev) {
    const d = view.diag;
    let pt = drawPt(view, ev);
    if (ev.button === 'select') {
      if (d.main === S.SEL) {
        if (d.selectDragStart(pt, view.grab, false, ev.shift)) {
          const capture = d.sub === S.SEL_SELECT;
          if (d.sub !== S.SEL_SCALE && !capture) d.ptzzz = view.snapIfLocked(pt);
          trackDrag(view, ev, { snap: !capture, onEnd: () => d.selectDragEnd() });
        }
      }
    } else if (ev.button === 'adjust') {
      if ((shifted(ev) || ev.ctrl) && d.main !== S.EDIT) {
        // zoom box
        const prevSub = d.sub;
        d.sub = S.ZOOM; d.drag = { box: { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y } };
        d.ptzzz = pt;
        trackDrag(view, ev, { snap: false, onEnd: () => { const b = d.drag.box; d.drag = null; d.sub = prevSub === S.ZOOM ? d.main : prevSub; d.redrawAll(); zoomBox(view, b); } });
      } else if (d.main === S.SEL) {
        if (d.selectDragStart(pt, view.grab, true, shifted(ev))) trackDrag(view, ev, { snap: false, onEnd: () => d.selectDragEnd() });
      } else if (d.main === S.EDIT) {
        if (d.editDragStart(pt, view.grab, shifted(ev) || ev.ctrl)) trackDrag(view, ev, { snap: true, onEnd: () => d.editDragEnd() });
      }
    }
    return true;
  }

  function pointerMoved(view, ev) {
    const d = view.diag;
    if (![S.P1, S.P2, S.P3, S.RECT_DRAG, S.ELLI_DRAG].includes(d.sub)) return;
    if (ev.buttons) return;
    const pt = view.snapIfLocked(view.fromWork(ev.x, ev.y));
    if (pt.x !== d.ptzzz.x || pt.y !== d.ptzzz.y) d.moveConstruction(pt);
  }

  function paneClick(view, ev) {
    if (ev.button === 'menu') return undefined;
    const d = view.diag;
    focusView = view;
    wimp.setCaret(view.win);
    switch (ev.icon?.handle) {
      case 0: d.changeState(S.PATH, 0, 0); break;
      case 1: d.changeState(S.PATH, 0, 1); break;
      case 2: d.changeState(S.PATH, 1, 0); break;
      case 3: d.changeState(S.PATH, 1, 1); break;
      case 4: d.movePending(); break;
      case 5: d.changeState(S.TEXT); break;
      case 6: d.changeState(S.RECT); break;
      case 7: d.changeState(S.ELLI); break;
      case 8: d.changeState(S.SEL); break;
      default: break;
    }
    return true;
  }

  // ---------------------------------------------------------------------------- keys
  function processKey(view, ev) {
    const d = view.diag, code = ev.code;
    const edit = d.main === S.EDIT;
    wimp.menus.close();
    switch (code) {
      case K.F1: view.grid.show = !view.grid.show; options.grid.show = view.grid.show; view.setGridState(); view.invalidate(); break;
      case K.F1 + K.SH: view.grid.lock = !view.grid.lock; options.grid.lock = view.grid.lock; view.updateTitle(); break;
      case K.F1 + K.CTRL: toggleToolbox(view); break;
      case K.F2: fileDbox(view, true); break;
      case K.F2 + K.SH: fileDbox(view, false); break;
      case K.F2 + K.CTRL: closeView(view); break;
      case K.F3: doSave(view, 'file', true); break;
      case K.F3 + K.SH: doSave(view, 'selection', true); break;
      case K.F3 + K.CTRL: { const g = gotSel(d); doSave(view, g.sprite ? 'sprite' : g.jpeg ? 'jpeg' : 'sprite', true); break; }
      case K.F3 + K.CTRL + K.SH: doSave(view, 'textarea', true); break;
      case K.F4: case 7: doSelect(view, 'group'); break;
      case K.F4 + K.SH: case 21: doSelect(view, 'ungroup'); break;
      case K.F4 + K.CTRL: case 6: doSelect(view, 'front'); break;
      case K.F4 + K.CTRL + K.SH: case 2: doSelect(view, 'back'); break;
      case K.F5: if (edit) { if (d.editChecks().enter) wimp.menus.open(numPoint(view), wimp.width / 2 - 130, wimp.height / 2 - 60, { task }); } else doSelect(view, 'all'); break;
      case K.F5 + K.SH: case 19: if (edit) d.editOp('snap', (p) => view.snap(p)); else doSelect(view, 'snap'); break;
      case K.F5 + K.CTRL: case 10: doSelect(view, 'justify'); break;
      case K.F6: if (d.main !== S.SEL) d.changeState(S.SEL); break;
      case K.F6 + K.SH: case 26: doSelect(view, 'clear'); break;
      case K.F6 + K.CTRL: case 5: doSelect(view, 'edit'); break;
      case K.F7: case K.COPY: case 3: if (edit) d.editOp('add'); else doSelect(view, 'copy'); break;
      case K.F8: d.doUndo(); break;
      case K.F8 + K.SH: case 24: if (edit) d.editOp('delete'); else doSelect(view, 'delete'); break;
      case K.F9: d.doRedo(); break;
      case K.F7 + K.CTRL: case K.TAB: d.changeState(S.TEXT); break;
      case K.F9 + K.CTRL: if (edit) d.editOp('line'); else d.changeState(S.PATH, 0, d.closed); break;
      case K.F8 + K.CTRL: if (edit) d.editOp('curve'); else d.changeState(S.PATH, 1, d.closed); break;
      case 1: doSelect(view, 'all'); break;
      case 4: zoomAlter(view, 0); break;
      case 8: case 127:
        if ([S.PATH, S.RECT, S.ELLI, S.TEXT].includes(d.main)) d.enterDelete();
        else if (edit) d.editOp('delete'); else doSelect(view, 'delete');
        break;
      case 12: view.zoomLock = !view.zoomLock; break;
      case 13:
        if (d.sub === S.T_CARET || d.sub === S.T_CHAR) {
          const o = d.cons;
          d.enterSelect(view, { x: o.x, y: o.y - d.lineHeight() });
        } else d.complete();
        break;
      case 17: zoomAlter(view, -1); break;
      case 18: zoomTo(view, view.lastzoom.mul, view.lastzoom.div); break;
      case 23: zoomAlter(view, 1); break;
      case 27: d.abandon(); break;
      case K.PRINT: wimp.menus.open(printDbox(d), Math.round(wimp.width / 2 - 108), Math.round(wimp.height / 2 - 40), { task }); break;
      case K.PRINT + K.SH + K.CTRL: task.reportError(msg('Print1')); break;
      case 0x18C: case 0x18D: case 0x18E: case 0x18F: return false;
      default:
        if (code >= 32 && code <= 255 && ev.char != null) {
          if (d.sub === S.T_CARET || d.sub === S.T_CHAR) d.addTextChar(String.fromCharCode(code));
          return true;
        }
        return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------- help
  function helpForState(d) {
    switch (d.main) {
      case S.PATH: return d.sub === S.PATH ? msg('HelpP1') : d.sub === S.P_MOVE ? msg('HelpP2') : msg('HelpP3');
      case S.RECT: return d.sub === S.RECT ? msg('HelpR1') : msg('HelpR2');
      case S.ELLI: return d.sub === S.ELLI ? msg('HelpE1') : msg('HelpE2');
      case S.TEXT: return d.sub === S.TEXT ? msg('HelpT1') : msg('HelpT2');
      case S.SEL: return msg('HelpM2');
      case S.EDIT: return msg('HelpM1');
      default: return null;
    }
  }
  const paneHelp = (i) => msg('HelpI1') + msg(['HelpI2', 'HelpI3', 'HelpI4', 'HelpI5', 'HelpI6', 'HelpI7', 'HelpI8', 'HelpI9', 'HelpIA'][i] ?? 'HelpI2');

  // ---------------------------------------------------------------------------- files
  function serialise(d, objects) {
    const v = d.views[0];
    const opts = objects ? false : {
      paperSize: d.paper.size, paperOptions: d.paper.options,
      gridSpacing: v ? v.grid.unit[v.grid.xinch ? 0 : 1].space[0] : 1, gridDivision: v ? v.grid.unit[v.grid.xinch ? 0 : 1].divide[0] : 2,
      gridIso: +!!v?.grid.iso, gridAuto: +!!v?.grid.auto, gridShow: +!!v?.grid.show, gridLock: +!!v?.grid.lock, gridCm: +!v?.grid.xinch,
      zoomMul: v?.zoom.mul ?? 1, zoomDiv: v?.zoom.div ?? 1, zoomLock: +!!v?.zoomLock, toolbox: +!!v?.showPane,
      mode: modeBits(d), undoSize: 5000,
    };
    const doc = { major: 201, minor: 0, creator: 'Draw', fonts: d.fonts, objects: objects ?? d.objects, options: opts || null };
    let bbox;
    if (objects) { bbox = null; }
    return DF.serialiseDrawfile(doc, { options: opts, bbox });
  }
  function modeBits(d) {
    switch (d.main) {
      case S.RECT: return 16; case S.ELLI: return 32; case S.TEXT: return 64; case S.SEL: return 128;
      case S.PATH: return d.curved ? (d.closed ? 8 : 4) : (d.closed ? 2 : 1);
      default: return 1;
    }
  }
  function exportSprites(objs) {
    const s = objs.filter((o) => o.type === 'sprite' || o.type === 'trfmsprite');
    const size = s.reduce((n, o) => n + o.data.length, 0);
    const out = new Uint8Array(12 + size);
    const v = new DataView(out.buffer);
    v.setUint32(0, s.length, true); v.setUint32(4, 16, true); v.setUint32(8, 16 + size, true);
    let p = 12;
    for (const o of s) { out.set(o.data, p); p += o.data.length; }
    return out;
  }
  async function saveTo(d, path) {
    try {
      os.vfs.writeFile(path, serialise(d), { filetype: FT.DRAW });
      d.setModified(false); d.updateTitles();
    } catch (e) { task.reportError(e.message ?? String(e)); }
  }

  /** Build objects to add from file data (fetch_drawfile / fetch_spritefile / fetch_textArea_file / fetch_jpeg). */
  function objectsFromData(d, bytes, type, mouse) {
    switch (type) {
      case FT.DRAW: {
        const doc = DF.parseDrawfile(bytes);
        // tie up font references with the diagram's font table (tieupfontrefs)
        const remap = new Map();
        for (const [n, name] of doc.fonts) remap.set(n, d.fontRef(name));
        const fix = (o) => {
          if ((o.type === 'text' || o.type === 'trfmtext') && (o.style & 0xFF)) o.style = ((o.style & ~0xFF) | (remap.get(o.style & 0xFF) ?? 0)) >>> 0;
          else if (o.type === 'group') o.objects.forEach(fix);
          else if (o.type === 'tagged' && o.object) fix(o.object);
        };
        doc.objects.forEach(fix);
        return { objects: doc.objects, doc };
      }
      case FT.SPRITE: {
        const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (bytes.length < 16 || v.getUint32(0, true) < 1) throw new Error(msg('FileS1'));
        const first = v.getUint32(4, true) - 4, next = v.getUint32(first, true);
        const data = bytes.slice(first, first + next);
        const s = DF.spriteOSSize(data);
        return { objects: [{ type: 'sprite', tag: DF.OBJ.SPRITE, bbox: { x0: mouse.x, y0: mouse.y, x1: mouse.x + s.w * 256, y1: mouse.y + s.h * 256 }, data }] };
      }
      case FT.JPEG: {
        const dim = jpegSize(bytes);
        if (!dim) throw new Error(msg('FileF2'));
        let { w, h, xdpi, ydpi } = dim;
        if (!xdpi || !ydpi) { ydpi = 90; xdpi = 90; }
        const width = Math.round(w * 256 * 180 / xdpi), height = Math.round(h * 256 * 180 / ydpi);
        const o = { type: 'jpeg', tag: DF.OBJ.JPEG, bbox: null, width, height, xdpi, ydpi, matrix: [65536, 0, 0, 65536, mouse.x, mouse.y], data: bytes.slice() };
        DF.boundObject(o, d.fonts);
        return { objects: [o] };
      }
      case FT.TEXT: {
        let text = new TextDecoder('latin1').decode(bytes);
        if (text[0] !== '\\') text = '\\! 1\n\\F 0 Trinity.Medium 12\n\\F 1 Corpus.Medium 12\n\\0\\AD/\\L12\n' + text.replace(/\\/g, '\\\\');
        const cols = Math.max(1, parseInt(/\\D\s*(\d+)/.exec(text)?.[1] ?? '1', 10));
        const W = dbc.OneInch + dbc.HalfInch, H = W, SEP = dbc.QuarterInch, B = dbc.FifthInch;
        let x = mouse.x, y = mouse.y;
        if (cols !== 1) { x += B; y += B; }
        const columns = [];
        for (let i = 0; i < cols; i++) { columns.push({ tag: DF.OBJ.TEXTCOL, bbox: { x0: x, y0: y, x1: x + W, y1: y + H } }); x += W + SEP; }
        const o = { type: 'textarea', tag: DF.OBJ.TEXTAREA, bbox: null, columns, reserved: [0, 0], colour: BLACK, bg: WHITE, text: text.endsWith('\n') ? text : text + '\n' };
        DF.boundObject(o, d.fonts);
        if (cols !== 1) { o.bbox.x0 -= B; o.bbox.y0 -= B; o.bbox.x1 += B; o.bbox.y1 += B; }
        return { objects: [o] };
      }
      case FT.DXF: throw new Error(msg('DxfL2'));
      default: throw new Error(msg('FileF2'));
    }
  }

  function applyOptions(d, op) {
    const v = d.views[0];
    d.paper.size = op.paperSize || PAPER.A4; d.paper.options = op.paperOptions;
    if (v) {
      const cm = op.gridCm ? 1 : 0;
      v.grid.unit[cm].space = [op.gridSpacing, op.gridSpacing]; v.grid.unit[cm].divide = [op.gridDivision, op.gridDivision];
      Object.assign(v.grid, { show: !!op.gridShow, lock: !!op.gridLock, xinch: !cm, yinch: !cm, iso: !!op.gridIso, auto: !!op.gridAuto });
      v.zoomLock = !!op.zoomLock;
      if (!!op.toolbox !== v.showPane) toggleToolbox(v);
      const m = op.mode;
      const st = m & 16 ? S.RECT : m & 32 ? S.ELLI : m & 64 ? S.TEXT : m & 128 ? S.SEL : S.PATH;
      d.changeState(st, !!(m & 12), !!(m & 10));
      v.setExtent();
      zoomTo(v, Math.max(1, Math.min(MAXZOOM, op.zoomMul || 1)), Math.max(1, Math.min(MAXZOOM, op.zoomDiv || 1)));
      v.win.open({ scrollX: 0, scrollY: Math.max(0, v.extH - v.win.h) });
    }
  }
  /** draw_setPaperSize: choose the paper that fits a drawing with no options object. */
  function paperFor(d, maxx, maxy) {
    const X = [dbc.A4short, dbc.A4long, dbc.A4short * 2, dbc.A4long * 2, dbc.A4short * 4, dbc.A4long * 4];
    const Y = [dbc.A4long / 2, dbc.A4short, dbc.A4long, dbc.A4short * 2, dbc.A4long * 2, dbc.A4short * 4];
    let l = 0; while (l < 6 && (X[l] < maxx || Y[l] < maxy)) l++; if (l === 6) l = 5;
    let p = 0; while (p < 6 && (Y[p] < maxx || X[p] < maxy)) p++; if (p === 6) p = 5;
    const fitL = (maxx - X[l]) ** 2 + (maxy - Y[l]) ** 2, fitP = (maxx - Y[p]) ** 2 + (maxy - X[p]) ** 2;
    let opt = d.paper.options & ~PAPER.Landscape, choice;
    if (fitP < fitL) choice = p; else { opt |= PAPER.Landscape; choice = l; }
    d.paper.size = [0x600, 0x500, 0x400, 0x300, 0x200, 0x100][choice];
    d.paper.options = opt;
    for (const v of d.views) v.setExtent();
  }

  /** Load a file into a new diagram (double-click, icon bar drop, F2). */
  async function loadFileNew(path, type, bytes) {
    try {
      bytes ??= await os.vfs.readFile(path);
      type ??= os.vfs.stat(path)?.filetype;
      // already loaded? (Draw reopens a view)
      const d = new Diagram(app);
      const { objects, doc } = objectsFromData(d, bytes, type, { x: 0, y: 0 });
      diagrams.push(d);
      openView(d);
      d.objects = objects;
      if (doc) {
        await DF.prepareDrawfile({ ...doc, fonts: d.fonts, objects });
        if (doc.options) applyOptions(d, doc.options);
        else paperFor(d, doc.bbox.x1, doc.bbox.y1);
      } else if (d.main === S.SEL) d.changeState(S.SEL);
      if (type === FT.DRAW && path) { d.filename = path; d.modified = false; } else d.modified = true;
      d.updateTitles();
      d.redrawAll();
      return d;
    } catch (e) {
      task.reportError(e instanceof DF.DrawfileError ? e.message : (e.message ?? String(e)));
      return null;
    }
  }

  /** Insert a file into an existing diagram at a point (DataLoad on a window). */
  async function insertFile(view, path, type, mouse, bytes) {
    const d = view.diag;
    try {
      bytes ??= await os.vfs.readFile(path);
      const clean = d.objects.length === 0;
      const { objects, doc } = objectsFromData(d, bytes, type, mouse);
      if (doc) await DF.prepareDrawfile({ ...doc, fonts: d.fonts, objects });
      d.abandon();
      d.checkpoint();
      if (doc && !clean) { const dx = mouse.x - doc.bbox.x0, dy = mouse.y - doc.bbox.y0; for (const o of objects) translateObject(o, dx, dy); }
      d.objects.push(...objects);
      if (doc && clean) {
        if (doc.options) applyOptions(d, doc.options); else paperFor(d, doc.bbox.x1, doc.bbox.y1);
        if (path && type === FT.DRAW) { d.filename = path; d.modified = false; d.updateTitles(); d.redrawAll(); return; }
      }
      d.setModified(true);
      d.redrawAll();
    } catch (e) { task.reportError(e.message ?? String(e)); }
  }

  function insertFiles(view, ev) {
    const pt = view.snapIfLocked(view.fromWork(ev.x, ev.y));
    for (const f of ev.files ?? []) insertFile(view, f.path, f.filetype, pt);
  }
  async function receiveData(view, ev) {
    const pt = view.snapIfLocked(view.fromWork(ev.x, ev.y));
    try {
      const data = await ev.receive();
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      insertFile(view, null, ev.filetype, pt, bytes);
    } catch (e) { task.reportError(e.message ?? String(e)); }
  }

  // ---------------------------------------------------------------------------- icon bar & messages
  const ibMenu = () => new Menu(msg('Draw00'), [
    { text: 'Info', submenu: () => infoBox() },
    { text: 'Quit', action: async () => { if (await mayQuit()) task.quit(); } },
  ]);
  task.addIconbarIcon({
    sprite: ctx.app.sprite,
    onClick: (ev) => { if (ev.button !== 'menu') newDiagram(); },
    menu: ibMenu,
    help: () => msg('DrawH1'),
    onDataLoad: (ev) => { for (const f of ev.files ?? []) loadFileNew(f.path, f.filetype); return true; },
  });
  task.onMessage('DataOpen', (m) => {
    if (m.filetype !== FT.DRAW) return false;
    loadFileNew(m.path, FT.DRAW);
    return true;
  });
  task.onMessage('PreQuit', (m) => {
    if (diagrams.some((d) => d.modified)) { m.object?.(); mayQuit().then((ok) => { if (ok) task.quit(); }); }
  });
  task.onMessage('Quit', () => task.quit());
  task.on('run', ({ file }) => { if (file) loadFileNew(file); });

  // test/automation hook
  globalThis.__draw = { app, diagrams, newDiagram, loadFileNew, zoomTo, menuFor, DF, S };

  if (ctx.file) await loadFileNew(ctx.file);
}

// ------------------------------------------------------------------------------------ helpers
/** read_options: defaults (initial_options) overridden by Draw$Options. */
function readOptions(str) {
  const o = {
    paperSize: PAPER.A4, paperOptions: 0,
    grid: { space: 1.0, divide: 2, iso: false, auto: false, show: false, lock: false, cm: true },
    zoomMul: 1, zoomDiv: 1, zoomLock: false, toolbox: true, mode: 'cline', curved: false, closed: true,
  };
  for (const tok of String(str ?? '').split(/\s+/).filter(Boolean)) {
    const c = tok[0].toUpperCase(), rest = tok.slice(1);
    if (c === 'P' && rest) {
      o.paperSize = { 0: 0x100, 1: 0x200, 2: 0x300, 3: 0x400, 5: 0x600 }[rest[0]] ?? 0x500;
      const f = rest.slice(1).toUpperCase();
      o.paperOptions = (f.includes('L') ? PAPER.Landscape : 0) | (f.includes('S') ? PAPER.Show : 0);
    } else if (c === 'G') {
      const m = /^([\d.]+)x(\d+)(.*)$/i.exec(rest);
      let flags = rest;
      if (m) { o.grid.space = parseFloat(m[1]) || 1; o.grid.divide = parseInt(m[2], 10) || 2; flags = m[3]; }
      const F = flags.toUpperCase();
      Object.assign(o.grid, { iso: F.includes('I'), auto: F.includes('A'), show: F.includes('S'), lock: F.includes('L'), cm: F.includes('C') });
    } else if (c === 'Z') {
      const m = /^(\d+):(\d+)(L?)/i.exec(rest);
      if (m) { o.zoomMul = Math.max(1, Math.min(8, +m[1])); o.zoomDiv = Math.max(1, Math.min(8, +m[2])); o.zoomLock = !!m[3]; }
    } else if (c === 'T') o.toolbox = rest[0] !== '-';
    else if (c === 'M') {
      const m = { L: 'line', l: 'cline', C: 'curve', c: 'ccurve', R: 'rect', r: 'rect', E: 'elli', e: 'elli', T: 'text', t: 'text', S: 'sel', s: 'sel' }[rest[0]];
      if (m) { o.mode = m; o.curved = m === 'curve' || m === 'ccurve'; o.closed = m === 'cline' || m === 'ccurve'; }
    }
  }
  return o;
}

/** JPEG dimensions and density from the SOF / JFIF headers. */
function jpegSize(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let p = 2, xdpi = 0, ydpi = 0;
  while (p + 4 < b.length) {
    if (b[p] !== 0xFF) { p++; continue; }
    const m = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
    if (m === 0xE0 && b[p + 4] === 0x4A) {   // JFIF
      const units = b[p + 11], xd = (b[p + 12] << 8) | b[p + 13], yd = (b[p + 14] << 8) | b[p + 15];
      if (units === 1) { xdpi = xd; ydpi = yd; } else if (units === 2) { xdpi = Math.round(xd * 2.54); ydpi = Math.round(yd * 2.54); }
    }
    if ((m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xCB && m !== 0xC8)) {
      return { h: (b[p + 5] << 8) | b[p + 6], w: (b[p + 7] << 8) | b[p + 8], xdpi, ydpi };
    }
    p += 2 + len;
  }
  return null;
}
