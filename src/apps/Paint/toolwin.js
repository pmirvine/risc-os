// The "Paint tools" window (c.ToolWindow): one for all sprites; extra fields appear at the
// bottom for the text, spray, fill, block and brush tools (templates tool_text, tool_spray...).

import { wimp } from '../../core/wimp.js';
import { input } from '../../core/input.js';
import { templateIconToSpec } from '../../core/icons.js';
import { TOOLARRAY, TOOL_HELP } from './tools.js';

const DESC_ICON = 22, MODE_BASE = 24;

export class ToolWindow {
  constructor(A) {
    this.A = A;
    this.win = null;
    this.extra = [];          // tools_icons: extra icons for the current tool
  }

  tpl(name) { return this.A.tpl.windows[name.toLowerCase()]; }

  /** toolwindow_display */
  display(atPointer) {
    const A = this.A;
    if (this.win) { this.win.open({ behind: 'top' }); return; }
    const w = this.win = A.task.createWindowFromTemplate(A.tpl, 'toolwind', { spriteArea: A.paintSprites });
    this.baseH = w.h;
    w.on('click', (ev) => this.click(ev));
    w.on('key', (ev) => this.key(ev));
    w.on('iconchanged', () => this.readFields());
    w.on('close', (ev) => { ev.preventDefault(); this.close(); A.options.showTools = false; });
    w.on('helprequest', (ev) => {
      const i = ev.icon ? w.icons.indexOf(ev.icon) : -1;
      ev.text = A.msgs[i >= 1 && i <= 27 && TOOL_HELP[i - 1] ? TOOL_HELP[i - 1] : 'PntH1'];
    });
    let { x, y } = w;
    if (atPointer) { x = Math.round(input.mouseX - w.w / 2); y = Math.round(input.mouseY - w.h / 2); }
    w.open({ x, y, behind: 'top' });
    this.setState();
  }

  close() {
    if (!this.win) return;
    this.demunge(false);
    this.win.delete();
    this.win = null;
  }

  /** toolwindow_close: when the last file window goes. */
  closeIfUnused() { if (!this.A.files.length) this.close(); }

  /** set_tool_window_state */
  setState() {
    const w = this.win, A = this.A;
    if (!w) return;
    for (let i = 1; i < TOOLARRAY.length; i++) w.icons[i]?.setState({ selected: TOOLARRAY[i] === A.currentTool });
    for (let i = 0; i <= 3; i++) w.icons[MODE_BASE + i]?.setState({ selected: i === A.toolOpts.mode });
    this.demunge(false);
    this.munge();
    this.setDescription();
  }

  setDescription() {
    const A = this.A, t = A.tools.tools[A.currentTool];
    this.win?.icons[DESC_ICON]?.setText(A.msg(t?.description ?? ''));
  }

  // ------------------------------------------------------------------ extra fields
  /** Create icon n of drop template `tpl` (createicon / createicon_ind). */
  icon(tpl, n, { selected = false, text = null } = {}) {
    const spec = templateIconToSpec(tpl.icons[n]);
    if (text != null) spec.text = text;
    if (selected) spec.flags |= 1 << 21; else spec.flags &= ~(1 << 21);
    const ic = this.win.addIcon(spec);
    this.extra.push(ic);
    return ic;
  }

  /** extend_tools: make the window as tall as the drop template. */
  extend(tpl) {
    const h = tpl ? (tpl.visible.y1 - tpl.visible.y0) / 2 : this.baseH;
    const w = this.win;
    w.extent = { ...w.extent, y1: Math.max(w.extent.y1, h) };
    w.open({ h, behind: 'keep' });
  }

  /** munge_window */
  munge() {
    const A = this.A, T = A.currentTool, o = A.toolOpts;
    const w = this.win;
    let caret = null;
    this.fields = {};
    if (T === 'text') {
      const t = this.tpl('tool_text');
      this.extend(t);
      this.icon(t, 0);
      this.fields.text = caret = this.icon(t, 1, { text: o.text.text });
      this.icon(t, 6);
      this.fields.xsize = this.icon(t, 2, { text: o.text.xsize });
      this.icon(t, 7);
      this.fields.ysize = this.icon(t, 3, { text: o.text.ysize });
      this.icon(t, 5);
      this.fields.xspace = this.icon(t, 4, { text: o.text.xspace });
      for (const k of ['text', 'xsize', 'ysize', 'xspace']) this.fields[k].bufLen = k === 'text' ? 256 : 5;
      for (const k of ['xsize', 'ysize', 'xspace']) this.fields[k].setValidation('A0-9');
      A.spriteWins.redisplayAll();
    } else if (T === 'fill') {
      const t = this.tpl('tool_fill');
      this.extend(t);
      this.fields.local = this.icon(t, 0, { selected: o.floodLocal });
      this.fields.global = this.icon(t, 1, { selected: !o.floodLocal });
    } else if (T === 'scissor' || T === 'camera') {
      const t = this.tpl('tool_cut');
      this.extend(t);
      this.fields.local = this.icon(t, 0, { selected: !o.exporting });
      this.fields.export = this.icon(t, 1, { selected: o.exporting });
    } else if (T === 'spray') {
      const t = this.tpl('tool_spray');
      this.extend(t);
      this.icon(t, 2);
      this.fields.density = caret = this.icon(t, 0, { text: o.spray.density });
      this.icon(t, 3);
      this.fields.radius = this.icon(t, 1, { text: o.spray.radius });
      for (const k of ['density', 'radius']) { this.fields[k].bufLen = 4; this.fields[k].setValidation('A0-9'); }
    } else if (T === 'brush') {
      const t = this.tpl('tool_brush');
      const b = o.brush;
      this.extend(t);
      this.icon(t, 10); this.icon(t, 6); this.icon(t, 9); this.icon(t, 3); this.icon(t, 11);
      this.fields.useNew = this.icon(t, 0);
      this.fields.useGcol = this.icon(t, 2, { selected: b.useGcol });
      const name = A.msgs[b.name] ?? b.name;
      this.fields.name = caret = this.icon(t, 12, { text: name });
      this.fields.name.bufLen = 13;
      this.fields.xm = this.icon(t, 5, { text: String(b.scale.xmul) });
      this.fields.xd = this.icon(t, 4, { text: String(b.scale.xdiv) });
      this.fields.ym = this.icon(t, 7, { text: String(b.scale.ymul) });
      this.fields.yd = this.icon(t, 8, { text: String(b.scale.ydiv) });
      for (const k of ['xm', 'xd', 'ym', 'yd']) { this.fields[k].bufLen = 3; this.fields[k].setValidation('A0-9'); }
      A.spriteWins.redisplayAll();
    }
    if (caret) wimp.setCaret(w, caret, caret.text.length);
  }

  /** demunge_window */
  demunge(really) {
    const w = this.win;
    if (!w) return;
    for (const ic of this.extra) w.deleteIcon(ic.handle);
    this.extra = [];
    this.fields = {};
    if (w.isOpen) this.extend(null);
    if (wimp.caret?.window === w) wimp.setCaret(null);
    void really;
  }

  /** Copy the writable fields into the tool options. */
  readFields() {
    const f = this.fields ?? {}, o = this.A.toolOpts;
    if (f.text) { o.text.text = f.text.text; o.text.xsize = f.xsize.text; o.text.ysize = f.ysize.text; o.text.xspace = f.xspace.text; }
    if (f.density) { o.spray.density = f.density.text; o.spray.radius = f.radius.text; }
  }

  // ------------------------------------------------------------------ events
  click(ev) {
    const A = this.A, w = this.win;
    if (ev.button === 'menu') return true;
    const i = ev.icon ? w.icons.indexOf(ev.icon) : -1;
    const T = A.currentTool;
    // wind up the previous tool's options
    if (T === 'brush') {
      if (ev.icon && ev.icon === this.fields.useNew) { A.toolOpts.brush.useGcol = this.fields.useGcol.selected; this.brushGo(); }
      if (ev.icon && ev.icon === this.fields.useGcol) A.toolOpts.brush.useGcol = this.fields.useGcol.selected;
    } else if (T === 'fill' && this.fields.local) {
      if (ev.icon === this.fields.local || ev.icon === this.fields.global) {
        ev.icon.setState({ selected: true });
        A.toolOpts.floodLocal = this.fields.local.selected;
      }
    } else if ((T === 'scissor' || T === 'camera') && this.fields.local) {
      if (ev.icon === this.fields.local || ev.icon === this.fields.export) {
        ev.icon.setState({ selected: true });
        const old = A.toolOpts.exporting;
        A.toolOpts.exporting = this.fields.export.selected;
        if (old !== A.toolOpts.exporting) A.spriteWins.stopAllTools();
      }
    }
    if (i > 0 && i < TOOLARRAY.length) {
      this.readFields();
      this.demunge(true);
      A.spriteWins.stopAllTools();
      A.currentTool = TOOLARRAY[i];
      if (A.currentTool === 'text') A.toolOpts.text = { ...A.toolOpts.text, xsize: '8', ysize: '8', xspace: '8' };
      ev.icon.setState({ selected: true });
      for (let k = 1; k < TOOLARRAY.length; k++) if (k !== i) w.icons[k]?.setState({ selected: false });
      this.setDescription();
      if (A.currentTool === 'brush') this.findBrush(A.toolOpts.brush.name, false);
      this.munge();
      A.spriteWins.redisplayAll();
    } else if (i >= MODE_BASE && i < MODE_BASE + 4) {
      A.toolOpts.mode = i - MODE_BASE;
      ev.icon.setState({ selected: true });
      for (let k = 0; k < 4; k++) if (MODE_BASE + k !== i) w.icons[MODE_BASE + k]?.setState({ selected: false });
    }
    return true;
  }

  key(ev) {
    const w = this.win;
    this.readFields();
    if (ev.code !== 13) return false;
    const c = wimp.caret;
    if (c?.window !== w || !c.icon) return true;
    // Return: on to the next writable icon; past the last one, the brush takes the new settings
    const list = w.icons.filter((ic) => ic && !ic.deleted && ic.writable);
    const k = list.indexOf(c.icon);
    if (k + 1 < list.length) wimp.setCaret(w, list[k + 1], list[k + 1].text.length);
    else {
      if (this.A.currentTool === 'brush') this.brushGo();
      if (list.length) wimp.setCaret(w, list[0], list[0].text.length);
    }
    return true;
  }

  /** performbrushGOaction: use the named sprite and scale as the brush. */
  async brushGo() {
    const A = this.A, f = this.fields, b = A.toolOpts.brush;
    if (!f.name) return;
    const typed = f.name.text;
    const name = A.msgs[typed] ?? typed;
    const s = await A.findSprite(name);
    if (!s) { A.error('PntE5a'); return; }
    A.spriteWins.stopAllTools();
    b.sprite = s; b.name = typed;
    const rd = (ic) => { const n = parseInt(ic.text, 10); return n > 0 ? n : 1; };
    b.scale = { xmul: rd(f.xm), xdiv: rd(f.xd), ymul: rd(f.ym), ydiv: rd(f.yd) };
    A.spriteWins.redisplayAll();
  }

  async findBrush(token, report) {
    const A = this.A;
    const s = await A.findSprite(A.msgs[token] ?? token);
    if (s) A.toolOpts.brush.sprite = s;
    else if (report) A.error('PntE5a');
  }

  brushChanged() { this.A.spriteWins.redisplayAll(); }
}
