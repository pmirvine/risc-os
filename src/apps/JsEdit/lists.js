// !JsEdit's list windows: Throwback (errors from JSScript programs and the syntax check, as the DDE's SrcEdit
// shows compiler errors: click one to go to it) and Functions (the definitions in a text, found with its
// mode's Functions patterns, as StrongED's List of functions: click one to go to it).

import { wimp } from '../../core/wimp.js';
import { wimpColour } from '../../core/palette.js';

const ROW_H = 20;

/** A window listing lines of text, each with an action on click. */
export class ListWindow {
  constructor(task, title, { x = 120, y = 120, w = 460, h = 220 } = {}) {
    this.task = task;
    this.items = [];                          // {text, strong, go()}
    const win = this.win = task.createWindow({
      title, flags: { back: true, close: true, title: true, vscroll: true, size: true, moveable: true, toggle: true },
      colours: { workBg: 0 }, extent: { w: 1200, h }, x, y, w, h, workButton: 'click', minW: 120, minH: 60,
    });
    win.useCanvas((g, r) => this._draw(g, r));
    win.on('click', (ev) => {
      if (ev.button === 'menu') return false;
      const it = this.items[Math.floor(ev.y / ROW_H)];
      it?.go?.();
      return true;
    });
    win.on('close', (ev) => { ev.preventDefault(); win.close(); });
  }
  set(items) {
    this.items = items;
    this.win.setExtent({ w: 1200, h: Math.max(this.win.h, items.length * ROW_H + 8) });
    this.win.invalidate();
  }
  open() { this.win.open({ behind: 'top' }); }
  _draw(g, r) {
    g.font = '14px "RISCOS System Fixed", monospace';
    g.textBaseline = 'middle';
    this.items.forEach((it, k) => {
      const y = k * ROW_H;
      if (y > r.y1 || y + ROW_H < r.y0) return;
      if (k % 2) { g.fillStyle = '#f4f4f4'; g.fillRect(r.x0, y, r.x1 - r.x0, ROW_H); }
      g.fillStyle = wimpColour(it.colour ?? 7);
      g.fillText(it.text, 8, y + ROW_H / 2 + 1);
    });
    if (!this.items.length) { g.fillStyle = wimpColour(4); g.fillText(this.empty ?? '', 8, ROW_H / 2 + 1); }
  }
}

/** Throwback: one list for the whole application. */
export class Throwback extends ListWindow {
  constructor(app) {
    super(app.task, 'Throwback', { x: 140, y: Math.max(60, wimp.height - 330), w: 560, h: 180 });
    this.app = app;
    this.errors = [];                         // {path, line, message, program}
    this.empty = 'No errors';
  }
  /** Add an error (the newest first) and show the list. */
  add(e) {
    this.errors = [e, ...this.errors.filter((x) => !(x.path === e.path && x.line === e.line))].slice(0, 100);
    this._refresh();
    this.open();
  }
  clear(path) { this.errors = path ? this.errors.filter((e) => e.path.toLowerCase() !== path.toLowerCase()) : []; this._refresh(); }
  _refresh() {
    const items = [];
    let last = null;
    for (const e of this.errors) {
      if (e.path !== last) { items.push({ text: `Errors in ${e.path}`, colour: 8, go: () => this.app.openAt(e.path, e.line) }); last = e.path; }
      items.push({ text: `  line ${String(e.line).padStart(4)}: ${e.message}`, colour: 11, go: () => this.app.openAt(e.path, e.line) });
    }
    this.set(items);
  }
}

/** Functions: the definitions in one text. */
export class FunctionsList extends ListWindow {
  constructor(text) {
    super(text.app.task, 'Functions', { x: 560, y: 140, w: 300, h: 260 });
    this.text = text;
    this.empty = 'No functions found';
    this.win.on('closed', () => { if (text.functions === this) text.functions = null; });
    this.update();
  }
  update() {
    const t = this.text, mode = t.mode;
    this.win.setTitle(`Functions in ${t.filename ? t.filename.slice(t.filename.lastIndexOf('.') + 1) : '<untitled>'}`);
    const items = [];
    const lines = t.doc.text.split('\n');
    lines.forEach((l, k) => {
      for (const re of mode?.functions ?? []) {
        const m = re.exec(l);
        if (m && m[1]) { items.push({ text: `${String(k + 1).padStart(5)}  ${m[1]}`, go: () => t.gotoLine(k + 1) }); break; }
      }
    });
    this.set(items);
  }
}
