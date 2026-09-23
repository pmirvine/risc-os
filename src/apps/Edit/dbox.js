// RISC_OSLib "dbox" conventions for Edit's dialogue boxes, on top of the core Wimp.
//
// A dbox is created from Edit's Templates. It is shown either as a submenu (from the menu tree),
// or as a transient menu-like box near the pointer / caret (dbox_show when the triggering event was
// a key press: 50px right of and 60px below the caret). Keys follow dbox.c:
//   F1..F9     "click" the n'th action button (click/release/radio icons, in icon order)
//   Return     move the caret to the next writable icon, or click icon 0 (the default action)
//   Escape     close the box
//   letters    (when not typed into a field) click the action button whose text starts with it, or
//              contains it as its first capital letter ("reDo" = D)
// Adjust-clicking an action button reports persist = true (dbox_persist), the box stays open.

import { wimp } from '../../core/wimp.js';
import { input } from '../../core/input.js';

const ACTION_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export class DBox {
  /**
   * tpl: templates object; name: template name. opts: {task, onAction(i, {persist, button}),
   * onClose(), help: prefix or fn(icon) -> text}
   */
  constructor(tpl, name, opts) {
    this.opts = opts;
    this.win = wimp.createWindowFromTemplate(tpl, name, {}, opts.task);
    this.win.userData = this;
    const w = this.win;
    this.actions = w.icons.map((ic, i) => (ic && !ic.writable && ACTION_TYPES.has(ic.buttonType) && ic.text ? i : -1)).filter((i) => i >= 0);
    w.on('click', (ev) => {
      if (ev.button === 'menu' || !ev.icon) return;
      if (ev.icon.writable || !this.actions.includes(ev.icon.handle)) return;
      this.action(ev.icon.handle, ev.button === 'adjust', ev.button);
      return true;
    });
    w.on('key', (ev) => this.key(ev));
    w.on('close', (ev) => { ev.preventDefault(); this.hide(); });
    w.on('closed', () => { if (this._showing) { this._showing = false; this.opts.onClose?.(); } });
    w.on('helprequest', (ev) => { ev.text = this.helpFor(ev.icon); });
  }

  get icons() { return this.win.icons; }
  get showing() { return this.win.isOpen; }
  field(i) { return this.win.icons[i]?.text ?? ''; }
  setField(i, t) { this.win.icons[i]?.setText(t); }
  numeric(i) { return parseInt(this.field(i), 10) || 0; }
  selected(i) { return !!this.win.icons[i]?.selected; }
  setSelected(i, on) { this.win.icons[i]?.setState({ selected: !!on }); }

  helpFor(icon) {
    const h = this.opts.help;
    if (typeof h === 'function') return h(icon);
    if (!h) return null;
    const M = this.opts.messages;
    if (icon) {
      const i = icon.handle;
      const tok = h + (i < 10 ? String(i) : String.fromCharCode(87 + i));
      if (M?.has(tok)) return M.lookup(tok);
    }
    return M?.has(h) ? M.lookup(h) : null;
  }

  action(i, persist = false, button = 'select') {
    this.opts.onAction?.(i, { persist, button });
  }

  key(ev) {
    const c = ev.code;
    if (c >= 0x181 && c <= 0x189) {
      const i = this.actions[c - 0x181];
      if (i != null) { if (this.win.icons[i]?.buttonType === 11) this.win.icons[i].setState({ selected: !this.win.icons[i].selected }); this.action(i); return true; }
      return false;
    }
    if (c === 13) {
      const cur = wimp.caret?.icon;
      const ws = this.win.icons.filter((ic) => ic && ic.writable && !ic.deleted && !ic.shaded);
      const k = cur ? ws.indexOf(cur) : -1;
      if (k >= 0 && k + 1 < ws.length) { wimp.setCaret(this.win, ws[k + 1], ws[k + 1].text.length); return true; }
      this.action(0);
      return true;
    }
    if (c === 27) { this.hide(); return true; }
    if (c < 256 && /[a-z]/i.test(String.fromCharCode(c))) {
      const K = String.fromCharCode(c).toUpperCase();
      for (const i of this.actions) {
        const t = this.win.icons[i].text;
        for (const ch of t) {
          if (ch === K) { this.action(i); return true; }
          if (ch >= 'A' && ch <= 'Z') break;
        }
      }
    }
    return false;
  }

  /**
   * Show as a transient box (Wimp_CreateMenu with a window). how: 'key' (near the caret) or
   * 'pointer'. If a menu tree is currently open and this box is its submenu, nothing to do.
   */
  show(how = 'pointer', at = null) {
    if (this._asSubmenu && this.win.isOpen) return;
    let x, y;
    if (at) ({ x, y } = at);
    else if (how === 'key' && wimp.caret?.window?.isOpen && wimp.caret.pos) {
      const cw = wimp.caret.window, p = cw.workToScreen(wimp.caret.pos.x, wimp.caret.pos.y);
      x = p.x + 50; y = p.y + 60;
    } else { x = input.mouseX - 24; y = input.mouseY - 24; }
    this._showing = true;
    wimp.menus.open(this.win, Math.round(x), Math.round(y), { task: this.opts.task });
    this._afterShow();
  }
  /** For use as a menu item's submenu: `submenu: () => dbox.asSubmenu()`. */
  asSubmenu() {
    this._showing = true;
    queueMicrotask(() => this._afterShow());
    return this.win;
  }
  _afterShow() {
    const ws = this.win.icons.find((ic) => ic && ic.writable && !ic.deleted && !ic.shaded);
    if (ws && this.win.isOpen) wimp.setCaret(this.win, ws, ws.text.length);
  }
  /** Show as a static window, centred on the screen (dboxquery style). */
  showStatic() {
    const w = this.win;
    this._showing = true;
    w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
    this._afterShow();
    if (!wimp.caret || wimp.caret.window !== w) wimp.setCaret(w);
  }
  hide() {
    if (wimp.menus.levels.some((l) => l.win === this.win)) wimp.menus.close();
    if (this.win.isOpen) this.win.close();
  }
}
