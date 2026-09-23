// The icon bar: a back-ish window along the bottom of the screen with device icons on the left
// and application icons on the right (Wimp Iconbar logic: 16 OS unit gaps, priorities).
//
//   const h = wimp.iconbar.add({ task, sprite: '!draw', text?, side: 'right'|'left', priority,
//           onClick(ev), menu: Menu | (ev) => Menu, onDataLoad(ev), onDataSave(ev), help });
//   wimp.iconbar.remove(h); wimp.iconbar.update(h, {sprite, text})

import { IF } from './templates.js';
import { sprites } from './sprites.js';
import { textWidth, fonts } from './fonts.js';

const HEIGHT = 66;        // 132 OS units (Wimp template "iconbar")
const GAP = 8;            // iconbargap = 16 OS
const BASE = 54;          // work-area y of the icon baseline (108 OS below the top)

export class IconBar {
  constructor(wimp) {
    this.wimp = wimp;
    this.items = [];
    this.height = HEIGHT + 2;
    const w = this.window = wimp.createWindow(wimp.systemTask, {
      flags: { noBounds: true },
      colours: { titleFg: 7, titleBg: 1, workFg: 7, workBg: 1, titleFocus: 1 },
      extent: { x0: 0, y0: 0, x1: 4000, y1: HEIGHT },
      workButton: 0,
    });
    w._isIconbar = true;
    w.el.classList.add('iconbar');
    w.on('click', (ev) => this._click(ev));
    w.on('doubleclick', (ev) => this._click(ev));
    w.on('dataload', (ev) => this._dataLoad(ev));
    w.on('datasave', (ev) => this._dataSave(ev));
    wimp.on('modechange', () => this.reopen());
    sprites.onChange(() => this.layout());
    this.reopen();
  }

  reopen() {
    const W = this.wimp.width, H = this.wimp.height;
    this.window.open({ x: 1, y: H - HEIGHT - 1, w: W - 2, h: HEIGHT, behind: this.wimp.iconbarFront ? 'top' : 'bottom' });
    this.layout();
  }

  add(spec) {
    const it = { side: 'right', priority: 0, ...spec };
    it.task = spec.task ?? this.wimp.systemTask;
    const f = IF.sprite | IF.hcentre | (it.text != null ? IF.text | IF.indirected : 0) | (7 << 24) | (1 << 28) | (3 << 12);
    it.icon = this.window.addIcon({ bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, flags: f >>> 0, text: it.text, sprite: it.sprite, validation: it.text != null ? 'S' + it.sprite : undefined, bufLen: 64, area: it.area });
    it.icon.el.classList.add('ibicon');
    it.icon._ib = it;
    this.items.push(it);
    it.task?.iconbarIcons?.add(it);
    this.layout();
    return it;
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.window.deleteIcon(it.icon.handle);
    it.task?.iconbarIcons?.delete(it);
    this.layout();
  }

  update(it, { sprite, text } = {}) {
    if (sprite != null) { it.sprite = sprite; it.icon.spriteName = sprite; if (it.text != null) it.icon.setValidation('S' + sprite); }
    if (text != null) { it.text = text; it.icon.setText(text); }
    this.layout();
  }

  _size(it) {
    const s = it.area?.get?.(String(it.sprite).toLowerCase()) ?? sprites.get(it.sprite);
    const sw = s ? s.cssW : 34, sh = s ? s.cssH : 34;
    if (it.text != null) {
      const tw = Math.max(textWidth(it.text, fonts.css) + 2, it.text.length * 8);
      // sprite baseline 20 OS (10px) above origin, text baseline 16 OS (8px) below
      return { w: Math.ceil(Math.max(sw, tw)), top: BASE - 10 - sh, bottom: BASE + 8 };
    }
    return { w: Math.ceil(sw), top: BASE + 4 - sh, bottom: BASE + 4 };
  }

  layout() {
    const W = this.window.w;
    const left = this.items.filter((i) => i.side === 'left').sort((a, b) => b.priority - a.priority);
    const right = this.items.filter((i) => i.side !== 'left').sort((a, b) => b.priority - a.priority);
    let x = 0;
    for (const it of left) {
      const s = this._size(it);
      x += GAP;
      it.icon.moveTo({ x0: x, y0: s.top, x1: x + s.w, y1: s.bottom });
      x += s.w;
    }
    x = W;
    for (const it of right) {
      const s = this._size(it);
      x -= GAP;
      it.icon.moveTo({ x0: x - s.w, y0: s.top, x1: x, y1: s.bottom });
      x -= s.w;
    }
  }

  /** Screen x of the centre of an icon (menus open there). */
  iconScreenX(it) { return this.window.x + (it.icon.bbox.x0 + it.icon.bbox.x1) / 2; }

  _click(ev) {
    const it = ev.icon?._ib;
    if (!it) return;
    ev.iconbarItem = it;
    if (ev.button === 'menu') {
      const m = typeof it.menu === 'function' ? it.menu(ev) : it.menu;
      if (m) this.wimp.menus.openIconbar(m, ev.sx, { task: it.task, iconbar: it });
      return true;
    }
    if (ev.kind === 'click' || ev.kind === 'double') it.onClick?.(ev);
    return true;
  }

  _dataLoad(ev) {
    const it = ev.icon?._ib;
    if (!it) return;
    ev.iconbarItem = it;
    if (it.onDataLoad) { it.onDataLoad(ev); return true; }
    const t = this.wimp.sendMessage('DataLoad', { ...ev, iconbar: it }, { to: it.task });
    return !!t;
  }
  _dataSave(ev) {
    const it = ev.icon?._ib;
    if (!it) return;
    if (it.onDataSave) { it.onDataSave(ev); return true; }
  }
}
