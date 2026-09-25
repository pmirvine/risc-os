// Completion for !JsEdit: as you type a name (or after a '.'), a small list of names that could finish it opens
// under the caret - the mode's Complete entries (the desktop's API, with a line about each) and words already in
// the text. Up/Down choose, Return or Tab puts the rest of the name in, Escape (or carrying on typing
// something else) closes it. The keyboard stays with the text window; the list takes clicks too.

import { wimp } from '../../core/wimp.js';
import { wimpColour } from '../../core/palette.js';

const ROWS = 8, ROW_H = 18, W = 400;

/** The name being typed before index i: '' or e.g. 'pri', 'task.ev', 'w.'. */
export function prefixAt(doc, i) {
  const before = doc.slice(Math.max(0, i - 80), i);
  const m = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?)$/.exec(before);
  return m ? m[1] : '';
}

/** Candidates for a prefix: [{name (what the list shows), insert (text that replaces the last part), about}]. */
export function candidates(mode, doc, prefix) {
  if (!prefix) return [];
  const dot = prefix.lastIndexOf('.');
  const obj = dot >= 0 ? prefix.slice(0, dot) : '', part = dot >= 0 ? prefix.slice(dot + 1) : prefix;
  const out = [], seen = new Set();
  // name: the whole name (what to insert is its last part); args: shown after it in the list
  const add = (name, about, args = '') => { const last = name.slice(name.lastIndexOf('.') + 1); if (seen.has(last) || last === part) return; seen.add(last); out.push({ name: name + args, insert: last, about }); };
  const entries = mode?.complete ?? [];
  if (obj) {
    // members of that object; failing that, members of anything (so w., win. and doc. all get window methods)
    for (const e of entries) if (e.name.startsWith(prefix)) add(e.name, e.about, e.args);
    if (!out.length) {
      // members used after a dot in the text (game.snake ...), then members of anything (w., win., g. ...)
      const used = new Set([...doc.text.matchAll(/\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
      for (const w of [...used].sort()) if (w.startsWith(part) && w !== part) add(`${obj}.${w}`, '');
      for (const e of entries) { const last = e.name.slice(e.name.lastIndexOf('.') + 1); if (e.name.includes('.') && last.startsWith(part)) add(`${obj}.${last}`, e.about, e.args); }
    }
  } else {
    for (const e of entries) if (!e.name.includes('.') && e.name.startsWith(part)) add(e.name, e.about, e.args);
    for (const w of [...(mode?.keywords ?? []), ...(mode?.api ?? []), ...(mode?.constants ?? [])]) if (w.startsWith(part)) add(w, '');
    // words in the text
    const words = new Set(doc.text.match(/[A-Za-z_$][\w$]{2,}/g) ?? []);
    for (const w of [...words].sort()) if (w.startsWith(part)) add(w, '');
  }
  return out.slice(0, 60);
}

export class Completion {
  /** Open (or refresh) the list for view v; closes itself if there is nothing to offer. */
  static update(v, force = false) {
    const prefix = prefixAt(v.doc, v.caret);
    const dotted = prefix.includes('.');
    if (!force && !dotted && prefix.length < 2) { v.completion?.close(); return; }
    const items = candidates(v.mode, v.doc, prefix);
    if (!items.length) { v.completion?.close(); return; }
    if (!v.completion) v.completion = new Completion(v);
    v.completion.show(items, prefix);
  }

  constructor(view) {
    this.view = view;
    this.items = [];
    this.sel = 0;
    this.top = 0;
    const w = this.win = view.task.createWindow({
      flags: { pane: true }, colours: { workBg: 0 },
      extent: { w: W, h: ROWS * ROW_H + 22 }, x: 0, y: 0, w: W, h: ROWS * ROW_H + 22, workButton: 'click',
    });
    w.useCanvas((g) => this._draw(g));
    w.on('click', (ev) => {
      const k = this.top + Math.floor(ev.y / ROW_H);
      if (k < this.items.length) { this.sel = k; this.accept(); }
      return true;
    });
  }

  show(items, prefix) {
    this.items = items; this.prefix = prefix;
    this.sel = Math.min(this.sel, items.length - 1);
    if (this.sel < 0) this.sel = 0;
    this.top = Math.max(0, Math.min(this.top, this.sel));
    const v = this.view, pos = wimp.caret?.pos;
    const p = v.win.workToScreen(pos?.x ?? 0, (pos?.y ?? 0) + v.lh + 2);
    const h = Math.min(ROWS, items.length) * ROW_H + 22;
    let y = p.y;
    if (y + h > wimp.height - 70) y = p.y - v.lh - h - 4;      // (above the caret near the bottom of the screen)
    this.win.open({ x: Math.min(p.x, wimp.width - W - 8), y, w: W, h, behind: 'top' });
    this.win.invalidate();
  }
  get isOpen() { return this.win.isOpen && this.items.length > 0; }
  close() { if (this.win.isOpen) this.win.close(); this.items = []; }
  dispose() { this.win.delete(); }

  /** Keys while the list is open: true if used. */
  key(ev) {
    if (!this.isOpen) return false;
    const n = this.items.length;
    switch (ev.code) {
      case 0x18E: this.sel = (this.sel + 1) % n; break;               // down
      case 0x18F: this.sel = (this.sel - 1 + n) % n; break;           // up
      case 13: case 0x18A: this.accept(); return true;               // Return, Tab
      case 27: this.close(); return true;                            // Escape
      default: return false;
    }
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + ROWS) this.top = this.sel - ROWS + 1;
    this.win.invalidate();
    return true;
  }

  accept() {
    const it = this.items[this.sel];
    const v = this.view;
    this.close();
    if (!it) return;
    const part = this.prefix.slice(this.prefix.lastIndexOf('.') + 1);
    const at = v.caret;
    v.doc.replace(at - part.length, part.length, it.insert);
    v.setCaret(at - part.length + it.insert.length);
    v.doc.separate();
  }

  _draw(g) {
    const W0 = this.win.w;
    g.font = '14px "RISCOS System Fixed", monospace';
    g.textBaseline = 'middle';
    const shown = this.items.slice(this.top, this.top + ROWS);
    shown.forEach((it, k) => {
      const y = k * ROW_H;
      const on = this.top + k === this.sel;
      g.fillStyle = on ? wimpColour(7) : wimpColour(0);
      g.fillRect(0, y, W0, ROW_H);
      g.fillStyle = on ? wimpColour(0) : wimpColour(7);
      g.fillText(it.name, 6, y + ROW_H / 2 + 1);
    });
    const it = this.items[this.sel];
    const y = shown.length * ROW_H;
    g.fillStyle = wimpColour(1); g.fillRect(0, y, W0, 22);
    g.fillStyle = wimpColour(7); g.font = '12px Homerton, Helvetica, sans-serif';
    g.fillText((it?.about || (this.items.length > ROWS ? `${this.items.length} names` : '')).slice(0, 70), 6, y + 11);
  }
}
