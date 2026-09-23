// RISC OS menus.
//
//   const m = new Menu('Title', [
//     { text: 'Info', submenu: infoWindow },                // dialogue box as a submenu
//     { text: 'Save', submenu: () => saveBox, dotted: true }, // dotted separator after this item
//     { text: 'Grid', ticked: () => grid, action: () => { grid = !grid; } },
//     { text: 'Name', writable: { value: 'abc', maxLen: 10, validation: 'A~ ' }, action: (ev) => rename(ev.value) },
//     { text: 'Quit', shaded: false, action: () => task.quit() },
//   ]);
//   wimp.menus.open(m, x, y)            // x,y = screen top-left of the menu's work area
//   wimp.menus.openAt(m, ev)            // at a click event (x-32, y), like the RISC OS convention
//   wimp.menus.openIconbar(m, sx)       // just above the icon bar
//
// Item fields may be functions (evaluated each time the menu is (re)drawn): text, ticked, shaded,
// submenu. action(ev) receives {item, index, path, button, value, menu}. Adjust-click keeps the
// menu tree open (and redraws ticks). Menu.onSelect(ev) is called for every selection too.

import { el } from './util.js';
import { wimpColour } from './palette.js';
import { fonts, textWidth } from './fonts.js';
import { sprites } from './sprites.js';
import { Window } from './window.js';
import { input } from './input.js';

const ITEM_H = 22;     // 44 OS units
const SEP_H = 12;      // 24 OS units
const TICK_W = 12;     // 24 OS units
const ARROW_W = 12;

export class Menu {
  constructor(title, items = [], opts = {}) {
    this.title = title;
    this.items = items;
    this.opts = opts;
    this.onSelect = opts.onSelect ?? null;
    this.width = opts.width ?? 0;    // minimum item width (px)
  }
  item(i) { return this.items[i]; }
}

const val = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

// The desktop font has no glyph for the Acorn "Shift" arrow (Latin-1 0x8B -> U+21E7): draw it.
function shiftArrow() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '9'); svg.setAttribute('height', '11'); svg.setAttribute('viewBox', '0 0 9 11');
  svg.style.cssText = 'vertical-align:-1px;margin:0 1px';
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M4.5 0.5 L8.5 5 L6.5 5 L6.5 10.5 L2.5 10.5 L2.5 5 L0.5 5 Z');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  svg.appendChild(path);
  return svg;
}
export function setKeyText(elm, text) {
  elm.textContent = '';
  const parts = text.split('⇧');
  parts.forEach((p, i) => {
    if (i) elm.appendChild(shiftArrow());
    if (p) elm.appendChild(document.createTextNode(p));
  });
}

export class MenuManager {
  constructor(wimp) {
    this.wimp = wimp;
    this.levels = [];     // [{menu, win, highlight, x, y, isDbox}]
    this.owner = null;
    this.ctx = null;
  }
  get isOpen() { return this.levels.length > 0; }

  openAt(menu, ev, opts = {}) { return this.open(menu, (ev.sx ?? input.mouseX) - 32, ev.sy ?? input.mouseY, opts); }

  openIconbar(menu, sx, opts = {}) {
    const h = this._measure(menu).h;
    const ibH = this.wimp.iconbar?.height ?? 68;
    return this.open(menu, sx - 32, this.wimp.height - 48 - h, { ...opts, iconbar: true });
  }

  /** Open a top-level menu (closing any existing tree). */
  open(menu, x, y, opts = {}) {
    this.close();
    this.owner = opts.task ?? null;
    this.ctx = opts;
    this._savedCaret = this.wimp.caret;
    this._openLevel(0, menu, x, y);
  }

  /** Re-open the current tree (after Adjust clicks, to refresh ticks). */
  refresh() {
    for (const lv of this.levels) if (!lv.isDbox) this._render(lv);
  }

  close(fromLevel = 0) {
    const caretInMenu = this.levels.some((l) => l.win === this.wimp.caret?.window);
    while (this.levels.length > fromLevel) {
      const lv = this.levels.pop();
      if (lv.isDbox) { lv.win._menuDbox = false; lv.win.close(); lv.win.emit('menuclosed', {}); }
      else lv.win.delete();
    }
    if (fromLevel === 0 && this.owner !== undefined) {
      const owner = this.owner;
      this.owner = null;
      if (this.ctx?.onClose) this.ctx.onClose();
      this.ctx = null;
      if (owner) this.wimp.sendMessage('MenusDeleted', {}, { to: owner });
      const sc = this._savedCaret;
      this._savedCaret = null;
      if (caretInMenu) {
        if (sc?.window?.isOpen) this.wimp.setCaret(sc.window, sc.icon ?? null, sc.index ?? -1, sc.pos ?? null);
        else this.wimp.setCaret(null);
      }
    }
  }

  _measure(menu) {
    const font = fonts.css;
    let w = Math.max(this.width ?? 0, menu.width || 0);
    for (const it of menu.items) {
      let t = String(val(it.text, it) ?? '');
      let tw = textWidth(t, font);
      if (it.spriteW) tw = Math.max(tw, it.spriteW + 6);   // sprite items: width hint (px)
      if (it.key) tw += textWidth(String(it.key), font) + 16;
      if (it.writable) tw = Math.max(tw, textWidth('W'.repeat(Math.min(it.writable.maxLen ?? 10, 20)), font) * 0.8);
      w = Math.max(w, tw);
    }
    const titleW = textWidth(String(val(menu.title) ?? ''), font) + 16;
    const textW = Math.ceil(Math.max(w + 12, titleW - TICK_W - ARROW_W, 40));
    let h = 0;
    for (const it of menu.items) h += ITEM_H + (val(it.dotted, it) ? SEP_H : 0);
    return { w: TICK_W + textW + ARROW_W, textW, h };
  }

  _openLevel(level, menu, x, y) {
    this.close(level);
    if (menu instanceof Window) return this._openDbox(level, menu, x, y);
    const m = this._measure(menu);
    const hasTitle = !!val(menu.title);
    // menus taller than the screen get a vertical scroll bar (Wimp wf_icon5)
    const maxH = this.wimp.height - (hasTitle ? 20 : 1) - 2;
    const scroll = m.h > maxH;
    const visH = scroll ? maxH : m.h;
    const win = new Window(this.wimp, this.owner ?? this.wimp.systemTask, {
      flags: { title: hasTitle, moveable: true, vscroll: scroll },
      colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: 0, titleFocus: 2 },
      title: val(menu.title) ?? '',
      extent: { x0: 0, y0: 0, x1: m.w, y1: m.h },
      x: 0, y: 0, w: m.w, h: visH,
    });
    win._scrollMenu = scroll;
    win._menuWindow = true;
    win.el.classList.add('menu');
    this.wimp.layers.menus.appendChild(win.el);
    const lv = { menu, win, highlight: -1, level, measure: m, subOpenFor: -1 };
    this.levels[level] = lv;
    // position: keep on screen
    const scrW = this.wimp.width, scrH = this.wimp.height;
    if (x + m.w + 1 > scrW) x = level > 0 ? Math.max(0, this.levels[level - 1].win.x - m.w - 2) : scrW - m.w - 1;
    x = Math.max(1, x);
    const top = hasTitle ? 20 : 1;
    y = Math.min(y, scrH - visH - 1);
    y = Math.max(top, y);
    win.x = x; win.y = y;
    win.isOpen = true;
    win.el.style.display = '';
    win.el.style.zIndex = String(level + 1);
    win._layout();
    this._render(lv);
    // move with title-bar drag: re-render not needed
    win.on('moved', () => {});
    return lv;
  }

  _openDbox(level, win, x, y) {
    const lv = { menu: null, win, isDbox: true, level, highlight: -1 };
    this.levels[level] = lv;
    win._menuDbox = true;
    const f = win._frame ?? { left: 1, topH: 20, rightW: 1, botH: 1 };
    if (x + win.w + f.rightW > this.wimp.width) x = Math.max(0, (this.levels[level - 1]?.win.x ?? this.wimp.width) - win.w - f.rightW - 2);
    y = Math.min(y, this.wimp.height - win.h - f.botH);
    y = Math.max(f.topH, y);
    if (!this._savedCaret && this.wimp.caret && !this.wimp.caret.window?._menuWindow) this._savedCaret = this.wimp.caret;
    win.open({ x, y, behind: 'top' });
    // dialogue boxes in menus sit above other windows
    win.el.style.zIndex = String(90000 + level);
    // give caret to first writable icon
    const wr = win.icons.find((i) => i && i.writable && !i.shaded && !i.deleted);
    if (wr) this.wimp.setCaret(win, wr, wr.text.length);
    win.emit('menuopen', {});
    return lv;
  }

  _render(lv) {
    const { menu, win } = lv;
    const m = lv.measure = this._measure(menu);
    if (win.w !== m.w || (!win._scrollMenu && win.h !== m.h)) { win.extent = { x0: 0, y0: 0, x1: m.w, y1: m.h }; win.w = m.w; if (!win._scrollMenu) win.h = m.h; win._layout(); }
    const work = win.work;
    work.textContent = '';
    lv.rows = [];
    let y = 0;
    menu.items.forEach((it, i) => {
      const text = String(val(it.text, it) ?? '');
      const shaded = !!val(it.shaded, it);
      const ticked = !!val(it.ticked, it);
      const dotted = !!val(it.dotted, it);
      const sub = it.submenu != null && !(typeof it.submenu === 'function' && it.submenuLazy === false) ? true : false;
      const row = el('div', 'mitem', work);
      row.style.top = y + 'px'; row.style.height = ITEM_H + 'px'; row.style.width = m.w + 'px';
      row.dataset.index = i;
      if (ticked) {
        const t = sprites.img('\x80', { variant: shaded ? 'shaded' : null });
        t.style.position = 'absolute'; t.style.left = Math.round((TICK_W - (t._sprite?.cssW ?? 12)) / 2) + 'px'; t.style.top = Math.round((ITEM_H - (t._sprite?.cssH ?? 12)) / 2) + 'px';
        row.appendChild(t);
      }
      const hl = lv.highlight === i && !shaded;
      const tb = el('div', 'mtext', row);
      tb.style.left = TICK_W + 'px'; tb.style.width = m.textW + 'px';
      tb.style.paddingLeft = '3px'; tb.style.boxSizing = 'border-box';
      tb.style.background = hl ? wimpColour(7) : wimpColour(0);
      tb.style.color = shaded ? wimpColour(hl ? 0 : 4) : wimpColour(hl ? 0 : 7);
      tb.style.font = fonts.css;
      if (it.colour != null) {
        // Wimp colour menu: each entry is filled with its colour
        const light = [0, 1, 2, 3, 9, 10, 12, 14, 15].includes(it.colour & 15);
        tb.style.background = wimpColour(it.colour & 15);
        tb.style.color = light ? (hl ? '#ffffff' : '#000000') : (hl ? '#000000' : '#ffffff');
        if (hl) tb.style.boxShadow = 'inset 0 0 0 2px ' + (light ? '#000' : '#fff');
      }
      if (it.writable) {
        const inp = document.createElement('span');
        inp.className = 'mwritable';
        inp.textContent = it.writable.value ?? '';
        tb.appendChild(inp);
        lv.writableRow = i;
        lv.writableEl = inp;
        if (lv.writeIndex == null) lv.writeIndex = (it.writable.value ?? '').length;
      } else {
        tb.textContent = text;
        if (it.sprite) {   // sprite menu item (e.g. Draw's line patterns): sprite name or SpriteInfo, from it.spriteArea or the Wimp pool
          const im = sprites.img(it.sprite, { area: it.spriteArea });
          im.style.position = 'absolute'; im.style.left = '3px'; im.style.top = Math.round((ITEM_H - (im._sprite?.cssH ?? 0)) / 2) + 'px';
          im.style.imageRendering = 'pixelated';
          tb.appendChild(im);
        }
      }
      if (it.key) {
        const k = el('div', 'mkey', tb);
        setKeyText(k, String(val(it.key)));
        k.style.right = '6px';
      }
      if (sub && !shaded || (sub && it.showArrowWhenShaded)) {
        const a = sprites.img('\x89', { variant: shaded ? 'shaded' : null });
        a.style.position = 'absolute'; a.style.left = TICK_W + m.textW + Math.round((ARROW_W - (a._sprite?.cssW ?? 10)) / 2) + 'px'; a.style.top = Math.round((ITEM_H - (a._sprite?.cssH ?? 10)) / 2) + 'px';
        row.appendChild(a);
      } else if (sub) {
        const a = sprites.img('\x89', { variant: 'shaded' });
        a.style.position = 'absolute'; a.style.left = TICK_W + m.textW + Math.round((ARROW_W - (a._sprite?.cssW ?? 10)) / 2) + 'px'; a.style.top = Math.round((ITEM_H - (a._sprite?.cssH ?? 10)) / 2) + 'px';
        row.appendChild(a);
      }
      lv.rows.push({ top: y, bottom: y + ITEM_H, item: it, shaded, sub });
      y += ITEM_H;
      if (dotted) {
        const d = el('div', 'mdots', work);
        d.style.top = y + SEP_H / 2 + 'px';
        d.style.width = m.w + 'px';
        y += SEP_H;
      }
    });
    this._drawWritableCaret(lv);
  }

  _drawWritableCaret(lv) {
    if (lv.writableEl == null) return;
    const it = lv.menu.items[lv.writableRow];
    const c = el('span', 'caret', lv.writableEl.parentNode);
    const pre = (it.writable.value ?? '').slice(0, lv.writeIndex ?? 0);
    const x = TICK_W + 3 + textWidth(pre, fonts.css);
    c.style.position = 'absolute';
    c.style.left = (x - TICK_W) + 'px';
    c.style.top = '1px'; c.style.height = (ITEM_H - 2) + 'px';
  }

  _levelAt(target) {
    const w = target.closest('.win')?._win;
    return this.levels.find((l) => l.win === w) ?? null;
  }

  _rowAt(lv, sy) {
    const wy = sy - lv.win.y + lv.win.scrollY;
    return lv.rows?.findIndex((r) => wy >= r.top && wy < r.bottom) ?? -1;
  }

  pointerMove(e, p) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target) return;
    const lv = this._levelAt(target);
    if (!lv || lv.isDbox) return;
    if (target.closest('[data-part]')?.dataset.part !== 'work') return;
    const i = this._rowAt(lv, p.y);
    if (i !== lv.highlight) {
      lv.highlight = i;
      this._render(lv);
      // moving onto a different item closes deeper levels
      if (this.levels.length > lv.level + 1 && lv.subOpenFor !== i) this.close(lv.level + 1);
    }
    if (i < 0) return;
    const row = lv.rows[i];
    // open a submenu when the pointer moves over the right-hand (arrow) part of the item
    const wx = p.x - lv.win.x;
    if (row.sub && !row.shaded && wx >= lv.measure.w - ARROW_W - 16 && lv.subOpenFor !== i) this._openSub(lv, i, 'arrow');
    else if (row.sub && !row.shaded && row.item.autoOpen && lv.subOpenFor !== i) this._openSub(lv, i, 'auto');
  }

  _openSub(lv, i, how) {
    const row = lv.rows[i];
    let sub = row.item.submenu;
    if (typeof sub === 'function') sub = sub({ item: row.item, index: i, how });
    if (!sub) return;
    lv.subOpenFor = i;
    const x = lv.win.x + lv.win.w + 1;
    const y = lv.win.y + row.top - lv.win.scrollY;
    const ev = { item: row.item, index: i, path: this._path(lv, i), menu: lv.menu, x, y };
    row.item.onSubmenu?.(ev);
    lv.menu.opts?.onSubmenu?.(ev);
    const nlv = this._openLevel(lv.level + 1, sub, x, y);
    if (nlv) nlv.parentIndex = i;
  }

  _path(lv, i) {
    const p = [];
    for (let l = 0; l < lv.level; l++) p.push(this.levels[l].subOpenFor);
    p.push(i);
    return p;
  }

  pointerDown(e, button, target) {
    const lv = this._levelAt(target);
    if (!lv) return;
    const partEl = target.closest('[data-part]');
    const part = partEl?.dataset.part;
    if (part && part !== 'title' && part !== 'work') {
      this.wimp._furniturePointerDown(lv.win, part, e, button, { x: input.mouseX, y: input.mouseY }, partEl);
      return;
    }
    if (part === 'title') {
      // drag the menu by its title bar
      const win = lv.win, ox = input.mouseX, oy = input.mouseY, sx = win.x, sy = win.y;
      import('./input.js').then(({ startPointerDrag }) => startPointerDrag(e, {
        onMove: (q) => { win.x = sx + q.x - ox; win.y = sy + q.y - oy; win._layout(); },
      }));
      return;
    }
    const i = this._rowAt(lv, input.mouseY);
    if (i < 0) return;
    if (lv.rows[i]?.item.writable) return;
    this.select(lv, i, button);
  }

  select(lv, i, button) {
    const row = lv.rows[i];
    if (!row || row.shaded) return;
    const it = row.item;
    const ev = { item: it, index: i, path: this._path(lv, i), button, menu: lv.menu, value: it.writable?.value, keepOpen: button === 'adjust' };
    if (!it.action && !lv.menu.onSelect && row.sub) { this._openSub(lv, i, 'click'); return; }
    const ctx = this.ctx;
    if (!ev.keepOpen) this.close();
    try {
      it.action?.(ev);
      lv.menu.onSelect?.(ev);
      ctx?.onSelect?.(ev);
    } catch (err) { console.error(err); this.wimp.reportError(String(err.message ?? err)); }
    if (ev.keepOpen && this.isOpen) this.refresh();
  }

  /** Keyboard handling while a menu is open. Returns true if consumed. */
  key(e, k) {
    const top = this.levels[this.levels.length - 1];
    if (!top) return false;
    if (k.code === 27) { this.close(); return true; }
    if (top.isDbox) return false;
    const lv = top;
    const n = lv.rows.length;
    const it = lv.writableRow != null ? lv.menu.items[lv.writableRow] : null;
    const move = (d) => {
      let i = lv.highlight;
      for (let c = 0; c < n; c++) { i = (i + d + n) % n; if (!lv.rows[i].shaded) break; }
      lv.highlight = i; this._render(lv);
    };
    switch (k.code) {
      case 0x18E: move(1); return true;
      case 0x18F: move(-1); return true;
      case 0x18D: if (lv.highlight >= 0 && lv.rows[lv.highlight].sub) this._openSub(lv, lv.highlight, 'key'); return true;
      case 0x18C: if (lv.level > 0) this.close(lv.level); return true;
      case 13:
        if (it) { this.select(lv, lv.writableRow, 'select'); return true; }
        if (lv.highlight >= 0) this.select(lv, lv.highlight, 'select');
        return true;
    }
    if (it) {
      const w = it.writable;
      let v = w.value ?? '', i = lv.writeIndex ?? v.length;
      if (k.code === 8 || k.code === 127) { if (i > 0) { v = v.slice(0, i - 1) + v.slice(i); i--; } }
      else if (k.code === 21) { v = ''; i = 0; }
      else if (k.code === 0x18B) { v = v.slice(0, i) + v.slice(i + 1); }
      else if (k.code === 0x18C) i = Math.max(0, i - 1);
      else if (k.code === 0x18D) i = Math.min(v.length, i + 1);
      else if (k.char && k.code >= 32) {
        if (w.maxLen != null && v.length >= w.maxLen) return true;
        if (w.validation) {
          const A = /(?:^|;)a([^;]*)/i.exec(w.validation)?.[1];
          if (A != null) {
            // lazy import to keep module graph simple
            if (!allowed(A, k.char)) return true;
          }
        }
        v = v.slice(0, i) + k.char + v.slice(i); i++;
      } else return true;
      w.value = v; lv.writeIndex = i;
      w.onChange?.(v);
      this._render(lv);
      return true;
    }
    return false;
  }
}

import { allowedChar as allowed } from './util.js';

/** Build the standard Wimp colour menu (16 colours). onPick(n). */
export function colourMenu(title, current, onPick, opts = {}) {
  const items = [];
  for (let n = 0; n < 16; n++) {
    items.push({ text: String(n), colour: n, ticked: () => (typeof current === 'function' ? current() : current) === n, action: () => onPick(n) });
  }
  const m = new Menu(title, items, opts);
  m.isColourMenu = true;
  return m;
}
