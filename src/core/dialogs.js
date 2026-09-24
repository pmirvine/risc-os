// Standard dialogue boxes: error/message box (Wimp_ReportError), program info box, Save-as box
// (with the drag-to-save protocol), query (Discard/Cancel) boxes.

import { wimp } from './wimp.js';
import { loadTemplates } from './templates.js';
import { sprites } from './sprites.js';
import { fonts, textWidth } from './fonts.js';
import { os } from './os.js';
import { fileSprite } from './filetypes.js';
import { input } from './input.js';

let wimpTpl, pinTpl, filerTpl, factTpl;
export async function initDialogs() {
  [wimpTpl, pinTpl, filerTpl, factTpl] = await Promise.all([
    loadTemplates('assets/templates/Wimp.json'), loadTemplates('assets/templates/Pinboard.json'),
    loadTemplates('assets/templates/Filer.json'), loadTemplates('assets/templates/FilerAct.json'),
  ]);
  wimp._reportError = reportError;
}

// ---------------------------------------------------------------- error box
const CATEGORY_SPRITE = { error: 'error', info: 'information', information: 'information', warning: 'warning', program: 'program', question: 'question', user1: 'user1', user2: 'user2' };

/**
 * Wimp_ReportError. message: string | Error. opts:
 *   appName   - "Message from <appName>" title (else "Error")
 *   title     - explicit title
 *   sprite    - application sprite name (default 'switcher' when no app)
 *   category  - 'error' (default) | 'info' | 'warning' | 'program' | 'question'
 *   ok (default true), cancel (bool), buttons: ['Describe', ...] extra buttons
 *   okText    - default button text ('OK', or 'Continue' when extra buttons are used)
 * Resolves to 1 (OK), 2 (Cancel) or the extra button's text.
 */
export function reportError(message, opts = {}) {
  if (message instanceof Error) message = message.message;
  message = String(message ?? '');
  const queue = (reportError._q ??= []);
  return new Promise((resolve) => {
    queue.push({ message, opts, resolve });
    if (queue.length === 1) showNext();
  });
}
function showNext() {
  const q = reportError._q;
  if (!q.length || q[0].shown) return;   // (a box reported just after the previous one closed is already up)
  q[0].shown = true;
  const { message, opts, resolve } = q[0];
  const done = (v) => { q.shift(); resolve(v); setTimeout(showNext, 0); };
  const title = opts.title ?? (opts.appName ? `Message from ${opts.appName}` : 'Error');
  const w = wimp.createWindowFromTemplate(wimpTpl, 'error', { title });
  w._errorBox = true;
  const extra = opts.buttons ?? [];
  const hasOK = opts.ok !== false;
  const hasCancel = !!opts.cancel;
  const I = w.icons;
  // message text
  I[0].setText(message);
  // sprites
  // Wimp07: the application sprite is "!<appname>" (first 10 characters), or 'switcher' when no
  // application name is given. If that sprite doesn't exist there is no application sprite and
  // the category sprite's icon is extended up to the top of the application sprite's icon.
  const appSprite = opts.sprite ?? (opts.appName && String(opts.appName).trim() ? '!' + String(opts.appName).replace(/^\\/, '').slice(0, 10).toLowerCase() : 'switcher');
  I[3].setSprite(CATEGORY_SPRITE[opts.category ?? 'error'] ?? 'error');
  if (sprites.has(appSprite)) I[2].setSprite(appSprite);
  else {
    I[2].setState({ deleted: true });
    I[3].moveTo({ ...I[3].bbox, y0: I[2].bbox.y0 });
  }
  I[1].setText(opts.okText ?? (extra.length || opts.category === 'program' ? 'Continue' : 'OK'));
  if (!hasOK) I[1].setState({ deleted: true });
  if (!hasCancel) I[4].setState({ deleted: true });
  else I[4].setText(opts.cancelText ?? 'Cancel');
  for (let i = 6; i <= 10; i++) I[i]?.setState({ deleted: true });
  // buttons are right-aligned: OK, then Cancel, then any extra buttons (Wimp07 alignicons)
  const slots = [6, 7, 8];
  extra.slice(0, 3).forEach((t, k) => { const ic = I[slots[k]]; if (ic) { ic.setText(t); ic.setState({ deleted: false }); ic._extra = t; } });
  {
    let right = w.extent.x1 - 10;
    const order = [hasOK && I[1], hasCancel && I[4], ...extra.slice(0, 3).map((_, k) => I[slots[k]])].filter(Boolean);
    const ref = I[4].bbox;
    for (const ic of order) {
      const b = ic.bbox;
      const width = b.x1 - b.x0;
      const top = ic === I[1] ? b.y0 : ref.y0, bot = ic === I[1] ? b.y1 : ref.y1;
      ic.moveTo({ x0: right - width, y0: top, x1: right, y1: bot });
      right -= width + 10;
    }
  }
  // layout: grow height for long messages
  const msgIcon = I[0];
  const width = msgIcon.bbox.x1 - msgIcon.bbox.x0;
  const lines = wrapCount(message, width);
  const lineH = 20;             // L validation: 40 OS units per line
  const need = lines * lineH + 8;
  const avail = msgIcon.bbox.y1 - msgIcon.bbox.y0;
  let grow = Math.max(0, need - avail);
  if (grow) {
    msgIcon.moveTo({ ...msgIcon.bbox, y1: msgIcon.bbox.y1 + grow });
    for (const ic of w.icons) if (ic && ic !== msgIcon && ic.bbox.y0 >= 150) ic.moveTo({ ...ic.bbox, y0: ic.bbox.y0 + grow, y1: ic.bbox.y1 + grow });
    w.extent.y1 += grow;
  }
  // vertically centre message text in its box
  const H = w.extent.y1;
  const W = w.extent.x1 - w.extent.x0;
  const x = Math.round((wimp.width - W) / 2), y = Math.round((wimp.height - H) / 2);
  w.open({ x, y, w: W, h: H, behind: 'top' });
  w.el.style.zIndex = '150001';
  wimp.layers.modal.appendChild(w.el);
  const shield = document.createElement('div');
  shield.className = 'modal-shield';
  wimp.layers.modal.insertBefore(shield, w.el);
  if (!(opts.noBeep) && wimp.config.errorBeep !== false) wimp.beep();
  const prevModal = wimp.modal;
  const finish = (icon) => {
    icon?.setState({ selected: true });
    setTimeout(() => {
      wimp.modal = prevModal;
      shield.remove();
      w.delete();
      const v = icon === I[1] ? 1 : icon === I[4] ? 2 : icon?._extra ?? 1;
      done(v);
    }, 120);
  };
  wimp.modal = {
    onPointerDown: (e, button) => {
      if (button === 'menu') return;
      const hit = wimp.hitTest(input.mouseX, input.mouseY, e);
      if (hit.window !== w || !hit.icon) return;
      const ic = hit.icon;
      if (ic === I[1] || ic === I[4] || ic._extra) {
        ic.setState({ selected: true });
        const up = (ev) => {
          window.removeEventListener('pointerup', up, true);
          const h2 = wimp.hitTest(input.mouseX, input.mouseY, ev);
          if (h2.icon === ic) finish(ic); else ic.setState({ selected: false });
        };
        window.addEventListener('pointerup', up, true);
      }
    },
    onKey: (e, k) => {
      if (k.code === 13) { finish(hasOK ? I[1] : I[4]); return true; }
      if (k.code === 27) { finish(hasCancel ? I[4] : I[1]); return true; }
      return true;
    },
  };
}

function wrapCount(text, width) {
  let lines = 0;
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let cur = '';
    lines++;
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (textWidth(t) > width && cur) { lines++; cur = wd; } else cur = t;
    }
  }
  return lines;
}

// ---------------------------------------------------------------- program info box
/**
 * Standard "About this program" box. info: {name, purpose, author, version} (or template
 * + icon values). Returns a Window suitable as a menu submenu (Info ▸).
 */
export function infoBox(task, info, { template = pinTpl, name = 'proginfo', title = 'About this program' } = {}) {
  const w = wimp.createWindowFromTemplate(template, name, { title }, task);
  const vals = [info.name, info.purpose, info.author ?? '© Acorn Computers Ltd, 1997', info.version];
  const valueIcons = w.icons.filter((ic) => ic && ic.borderType === 2 || (ic && /R2/.test(ic.validation ?? '')));
  valueIcons.forEach((ic, i) => { if (vals[i] != null) ic.setText(vals[i]); });
  if (template === pinTpl) w.icons[0]?.setState({ deleted: true });
  return w;
}

// ---------------------------------------------------------------- Save as
/**
 * Create a standard Save-as dialogue box. opts:
 *   task, title ('Save as'), filename (leaf or full path), filetype (number),
 *   getData: async () => Uint8Array|string   (data to save)
 *   save: async (path) => void               (alternative: write the file yourself)
 *   onSaved(path|null, {toApp})              (after successful save)
 *   selection: bool - show a "Selection" option (not in 3.71 standard boxes; ignored)
 * Returns the Window (use as a menu submenu, or call .openCentred()).
 */
export function saveAs(opts) {
  const task = opts.task ?? wimp.systemTask;
  const w = wimp.createWindowFromTemplate(filerTpl, 'xfer_send', { title: opts.title ?? 'Save as' }, task);
  const I = w.icons;
  const okI = I[0], nameI = I[1], sprI = I[2];
  I[3]?.setState({ deleted: true });
  const leafOf = (p) => { const s = String(p); const i = s.lastIndexOf('.'); return i >= 0 ? s.slice(i + 1) : s; };
  const setType = (t) => {
    w.filetype = t;
    const spr = t === 0x1000 ? 'directory' : t === 0x2000 ? 'application' : fileSprite({ type: 'file', filetype: t }).name;
    sprI.setSprite(spr);
  };
  nameI.bufLen = 256;
  nameI.setText(opts.filename ?? 'Untitled');
  setType(opts.filetype ?? 0xFFD);
  w.setFilename = (n) => nameI.setText(n);
  w.setFiletype = setType;
  w.filename = () => nameI.text;

  const doSave = async (path, toApp = null) => {
    try {
      if (toApp) {
        const res = await wimp.dataSave(toApp, { leafname: leafOf(nameI.text), filetype: w.filetype, getData: opts.getData }, task);
        if (!res) return false;
        if (res.path) await writeTo(res.path);
        wimp.menus.close();
        w.close();
        opts.onSaved?.(res.path ?? null, { toApp: !res.path });
        return true;
      }
      await writeTo(path);
      nameI.setText(path);
      wimp.menus.close();
      w.close();
      opts.onSaved?.(path, {});
      return true;
    } catch (e) {
      wimp.reportError(e.message ?? String(e), { appName: task.name });
      return false;
    }
  };
  const writeTo = async (path) => {
    if (opts.save) { await opts.save(path); return; }
    const data = await opts.getData();
    os.vfs.writeFile(path, data, { filetype: w.filetype });
  };
  const okAction = () => {
    const t = nameI.text;
    if (!/[.:]/.test(t)) { wimp.reportError('To save, drag the icon to a directory display', { appName: task.name }); return; }
    doSave(t);
  };
  sprI.flags = ((sprI.flags & ~0xF000) | (6 << 12)) >>> 0;
  w.on('click', (ev) => {
    if (ev.icon === okI && ev.button !== 'menu') okAction();
  });
  w.on('drag', (ev) => {
    if (ev.icon === sprI) {
      sprI.setState({ selected: false });
      const b = sprI.bbox;
      const p = w.workToScreen(b.x0, b.y0);
      const s = sprites.get(sprI.spriteName);
      const sx = p.x + ((b.x1 - b.x0) - (s?.cssW ?? 34)) / 2, sy = p.y + ((b.y1 - b.y0) - (s?.cssH ?? 34)) / 2;
      wimp.drag({ sprite: sprI.spriteName, box: { x0: sx, y0: sy, x1: sx + (s?.cssW ?? 34), y1: sy + (s?.cssH ?? 34) }, event: ev.pointerEvent }).then((drop) => {
        if (!drop.window || drop.window === w) return;
        const fdir = drop.window._filerDir;
        if (fdir) doSave(`${fdir}.${leafOf(nameI.text)}`);
        else doSave(null, drop);
      });
    }
  });
  w.on('key', (ev) => { if (ev.code === 13) { okAction(); return true; } if (ev.code === 27) { wimp.menus.close(); w.close(); return true; } });
  // make the sprite icon draggable (template button type is click/drag already)
  w.openCentred = () => {
    w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
    wimp.setCaret(w, nameI, nameI.text.length);
  };
  return w;
}

// ---------------------------------------------------------------- query box
/**
 * Simple query box (e.g. "Discard changes?") built from the FilerAct 'query' template.
 * opts: {title, message, buttons: ['Discard', 'Cancel'], task}. Resolves to the button text
 * (or null if closed). The last button is the default for Escape; the first for Return.
 */
export function query(opts) {
  return new Promise((resolve) => {
    const w = wimp.createWindowFromTemplate(factTpl, 'query', { title: opts.title ?? opts.task?.name ?? 'Query' }, opts.task);
    const I = w.icons;
    const btns = opts.buttons ?? ['Discard', 'Cancel'];
    I[1].setText(opts.message ?? '');
    I[0].setText(btns[0]);
    if (btns[1]) I[2].setText(btns[1]); else I[2].setState({ deleted: true });
    const finish = (v) => { w.delete(); resolve(v); };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.icon === I[0]) finish(btns[0]);
      else if (ev.icon === I[2]) finish(btns[1]);
    });
    w.on('close', (ev) => { ev.preventDefault(); finish(null); });
    w.on('key', (ev) => { if (ev.code === 13) finish(btns[0]); else if (ev.code === 27) finish(btns[btns.length - 1]); return true; });
    w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
    wimp.setCaret(w);
  });
}

/** "Discard changes" helper used by apps on close/quit. Resolves true to discard. */
export async function discardChanges(task, what = 'This file has been modified. Discard changes?') {
  const r = await query({ task, title: task?.name, message: what, buttons: ['Discard', 'Cancel'] });
  return r === 'Discard';
}
