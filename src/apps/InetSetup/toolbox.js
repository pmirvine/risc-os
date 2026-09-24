// A small Toolbox (RISC OS 3.5+ Aquarius toolbox) for applications whose UI lives in a Res file.
//
// tools/toolbox.mjs converts the Res file to JSON (assets/templates/<App>.Res.json); this module turns
// its Window objects into Wimp windows, mapping each gadget onto Wimp icons with the 3.71 Window
// module's look, and raises Toolbox-style events:
//
//   const tb = new Toolbox(task, res, { spriteArea, onEvent(code, id) })
//   const o = tb.create('Main')            // TBWindow (Window object) or a Menu object's core Menu
//   o.on('action', ({cmp, event, isDefault, isCancel, adjust}))   ActionButton_Selected (event 0) / its own event
//   o.on('option', ({cmp, on})) · o.on('radio', ({cmp, on, previous})) · o.on('value', ({cmp, value}))
//   o.on('drag', ({cmp, drop})) · o.on('doubleclick', ({cmp})) · o.on('click', ({cmp, ev}))
//   o.on('hidden') · o.on('completed')     (Window_DialogueCompleted)
//   o.show(parent) · o.hide() · o.showing · o.setValue/getValue · o.setState/getState · o.radioOn(group cmp)
//   o.fade(cmp, bool) · o.faded(cmp) · o.setTitle(t) · o.addGadget(g) · o.moveGadget(cmp, bbox)
//   o.setAvailable(cmp, 'a,b,c') (StringSet) · o.setClickShow(cmp, obj) · o.setDefaultFocus(cmp)
//
// Gadget bboxes are in OS units, work-area origin top-left, y up (negative downwards), like templates.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { infoBox } from '../../core/dialogs.js';
import { templateIconToSpec } from '../../core/icons.js';

const F = { text: 1, sprite: 2, border: 4, hcentre: 8, vcentre: 16, filled: 32, indirected: 256, rjustify: 512, selected: 1 << 21, shaded: 1 << 22, deleted: 1 << 23 };
const col = (fg, bg) => ((fg & 15) << 24 | (bg & 15) << 28) >>> 0;
const bt = (n) => (n & 15) << 12;
const box = (b) => ({ x0: b.xmin, y0: b.ymin, x1: b.xmax, y1: b.ymax });

/** Icons (template form, OS units) for one gadget: [{bbox, flags, text, validation, bufLen, role}]. */
export function gadgetIcons(g) {
  const b = box(g.bbox);
  const shade = g.faded ? F.shaded : 0;
  const I = (o) => ({ ...o, flags: (o.flags | shade) >>> 0 });
  switch (g.type) {
    case 'ActionButton': {
      const def = g.flags & 1;
      return [I({ role: 'main', bbox: b, flags: F.text | F.border | F.hcentre | F.vcentre | F.filled | F.indirected | bt(3) | col(7, 1),
        text: g.text ?? '', validation: def ? 'R6,3' : 'R5,3', bufLen: Math.max(g.maxText ?? 0, (g.text ?? '').length + 1) })];
    }
    case 'OptionButton':
    case 'RadioButton': {
      const on = !!(g.flags & 4);
      return [I({ role: 'main', bbox: b, flags: F.text | F.sprite | F.vcentre | F.indirected | bt(3) | col(7, 1) | (on ? F.selected : 0),
        text: g.label ?? '', validation: g.type === 'OptionButton' ? 'Soptoff,opton' : 'Sradiooff,radioon', bufLen: (g.maxLabel ?? 0) + 1 })];
    }
    case 'Label': {
      const f = g.flags;
      return [I({ role: 'main', bbox: b, flags: F.text | F.vcentre | F.indirected | col(7, 1) | (f & 1 ? 0 : F.border) | (f & 2 ? F.rjustify : 0) | (f & 4 ? F.hcentre : 0),
        text: g.label ?? '', bufLen: (g.label ?? '').length + 1 })];
    }
    case 'LabelledBox': {
      // a channel round the box, with the label on a grey patch over its top edge
      const lh = 36, lw = Math.max(40, (g.label ?? '').length * 16 + 16);
      return [
        I({ role: 'box', bbox: { ...b, y1: b.y1 - lh / 2 }, flags: F.text | F.border | F.indirected | col(7, 1), text: '', validation: 'R4', bufLen: 1 }),
        I({ role: 'main', bbox: { x0: b.x0 + 16, y0: b.y1 - lh, x1: b.x0 + 16 + lw, y1: b.y1 }, flags: F.text | F.filled | F.vcentre | F.hcentre | F.indirected | col(7, 1),
          text: g.label ?? '', bufLen: (g.label ?? '').length + 1 }),
      ];
    }
    case 'DisplayField': {
      const j = (g.flags >>> 1) & 3;
      return [I({ role: 'main', bbox: b, flags: F.text | F.border | F.filled | F.vcentre | F.indirected | col(7, 1) | (j === 1 ? F.rjustify : j === 2 ? F.hcentre : 0),
        text: g.text ?? '', validation: 'R2', bufLen: (g.maxText ?? 16) + 1 })];
    }
    case 'WritableField': {
      // flags: b0/b1 value-changed events, b2-3 justification (0 left, 1 right, 2 centred), b4 conceal text
      let v = 'R7;Pptr_write';
      if (g.allowable) v += ';A' + g.allowable;
      if (g.flags & 16) v += ';D*';
      const j = (g.flags >>> 2) & 3;
      return [I({ role: 'main', bbox: b, flags: F.text | F.border | F.filled | F.vcentre | F.indirected | bt(15) | col(7, 0) | (j === 1 ? F.rjustify : j === 2 ? F.hcentre : 0),
        text: g.text ?? '', validation: v, bufLen: (g.maxText ?? 16) })];
    }
    case 'StringSet': {
      const writable = !!(g.flags & 4), noDisplay = !!(g.flags & 16), j = (g.flags >>> 5) & 3;
      const out = [];
      if (!noDisplay) {
        let v = writable ? 'R7;Pptr_write' : 'R2';
        if (writable && g.allowable) v += ';A' + g.allowable;
        out.push(I({ role: 'main', bbox: { ...b, x1: b.x1 - 52 }, flags: F.text | F.border | F.filled | F.vcentre | F.indirected | (writable ? bt(15) | col(7, 0) : col(7, 1)) | (j === 1 ? F.rjustify : j === 2 ? F.hcentre : 0),
          text: g.selected ?? '', validation: v, bufLen: (g.maxSelected ?? 16) }));
      }
      out.push(I({ role: 'popup', bbox: { x0: b.x1 - 44, y0: b.y0 + (b.y1 - b.y0 - 44) / 2, x1: b.x1, y1: b.y0 + (b.y1 - b.y0 + 44) / 2 },
        flags: F.sprite | F.text | F.border | F.hcentre | F.vcentre | F.filled | F.indirected | bt(3) | col(7, 1), text: '', validation: 'R5;Sgright,pgright', bufLen: 1 }));
      return out;
    }
    case 'PopUp':
      return [I({ role: 'popup', bbox: b, flags: F.sprite | F.text | F.border | F.hcentre | F.vcentre | F.filled | F.indirected | bt(3) | col(7, 1), text: '', validation: 'R5;Sgright,pgright', bufLen: 1 })];
    case 'Draggable': {
      const type = (g.flags >>> 3) & 7;
      const hasSprite = g.flags & 2, hasText = g.flags & 4;
      return [I({ role: 'main', bbox: b, flags: (hasText ? F.text : F.text) | (hasSprite ? F.sprite : 0) | F.hcentre | (hasText && hasSprite ? 0 : F.vcentre) | F.indirected | bt(type === 0 ? 6 : 10) | col(7, 1),
        text: hasText ? (g.text ?? '') : '', validation: hasSprite ? 'S' + (g.sprite ?? '') : undefined, bufLen: (g.maxText ?? 1) + 1 })];
    }
    case 'Button': {
      const f = (g.buttonFlags >>> 0) | F.indirected;
      // a sprite-only Button's value is its (indirected) sprite name
      if (!(f & F.text) && (f & F.sprite)) return [I({ role: 'main', bbox: b, flags: f >>> 0, sprite: g.value ?? '', validation: g.validation ?? undefined })];
      return [I({ role: 'main', bbox: b, flags: f >>> 0, text: g.value ?? '', validation: g.validation ?? undefined, bufLen: Math.max(g.maxValue ?? 1, (g.value ?? '').length + 1) })];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------- Window objects
export class TBWindow {
  constructor(tb, name, tpl) {
    this.tb = tb; this.name = name; this.tpl = tpl;
    this.handlers = {};
    this.gadgets = new Map();       // cmp -> {g, icons: [Icon]}
    this.clickShow = new Map();
    this.defaultFocus = tpl.defaultFocus;
    const w = tpl.window;
    const t = {
      name, visible: box(w.visible), extent: box(w.extent), scroll: w.scroll, flags: w.flags, colours: w.colours,
      titleFlags: w.titleFlags, workFlags: w.workFlags, minWidth: w.minWidth, minHeight: w.minHeight,
      title: { text: w.title.text ?? '', validation: w.title.validation ?? undefined, bufLen: Math.max(w.title.bufferSize ?? 0, 64) },
      icons: [],
    };
    this.win = wimp.createWindowFromTemplate({ windows: { [name.toLowerCase()]: t } }, name, { spriteArea: tb.spriteArea }, tb.task);
    if (tpl.help) this.win.helpText = tpl.help;
    // gadgets "at back" (the labelled boxes) first, so the others are on top of them
    for (const g of [...tpl.gadgets.filter((x) => x.atBack), ...tpl.gadgets.filter((x) => !x.atBack)]) this.addGadget(g);
    this.menuName = tpl.menu;
    this.win.on('click', (ev) => this._click(ev));
    this.win.on('doubleclick', (ev) => { const c = ev.icon?._tbCmp; if (c != null && !this.faded(c)) this.emit('doubleclick', { cmp: c, ev }); });
    this.win.on('drag', (ev) => this._drag(ev));
    this.win.on('iconchanged', (ev) => { const c = ev.icon?._tbCmp; if (c != null) this.emit('value', { cmp: c, value: ev.icon.text }); });
    this.win.on('key', (ev) => this._key(ev));
    this.win.on('close', () => { this.hide(true); return false; });
    this.win.on('dataload', (ev) => { this.emit('dataload', { ...ev, cmp: ev.icon?._tbCmp ?? null }); return true; });
  }

  on(type, fn) { (this.handlers[type] ??= []).push(fn); return this; }
  emit(type, ev = {}) { let r = false; for (const f of this.handlers[type] ?? []) if (f({ ...ev, obj: this }) === true) r = true; return r; }

  get showing() { return this.win.isOpen; }
  get task() { return this.tb.task; }

  addGadget(g) {
    const icons = gadgetIcons(g).map((spec) => {
      const ic = this.win.addIcon(templateIconToSpec(spec));
      ic._tbCmp = g.cmp; ic._tbRole = spec.role;
      if (g.help) ic.help = g.help;
      return ic;
    });
    this.gadgets.set(g.cmp, { g: { ...g }, icons });
    return icons;
  }
  _main(cmp) { const e = this.gadgets.get(cmp); return e?.icons.find((i) => i._tbRole === 'main') ?? e?.icons[0] ?? null; }
  gadget(cmp) { return this.gadgets.get(cmp)?.g ?? null; }

  moveGadget(cmp, b) {
    const e = this.gadgets.get(cmp);
    if (!e) return;
    const dx = b.xmin - e.g.bbox.xmin, dy = b.ymin - e.g.bbox.ymin;
    e.g.bbox = { ...b };
    for (const ic of e.icons) {
      const q = ic.bbox;
      if (ic._tbRole === 'main' && e.icons.length === 1) ic.moveTo(templateIconToSpec({ bbox: box(b), flags: ic.flags }).bbox);
      else ic.moveTo({ x0: q.x0 + dx / 2, y0: q.y0 - dy / 2, x1: q.x1 + dx / 2, y1: q.y1 - dy / 2 });
    }
  }

  // --- values
  setValue(cmp, v) {
    const e = this.gadgets.get(cmp);
    if (!e) return;
    const ic = this._main(cmp);
    const s = String(v ?? '');
    if (e.g.type === 'StringSet') e.g.selected = s;
    ic?.setText(s);
    if (wimp.caret?.window === this.win && wimp.caret.icon === ic) wimp.setCaret(this.win, ic, Math.min(wimp.caret.index ?? s.length, s.length));
  }
  getValue(cmp) { return this._main(cmp)?.text ?? ''; }
  setState(cmp, on) {
    const e = this.gadgets.get(cmp);
    if (!e) return;
    if (on && e.g.type === 'RadioButton') {
      for (const [c, o] of this.gadgets) if (c !== cmp && o.g.type === 'RadioButton' && o.g.group === e.g.group) this._main(c)?.setState({ selected: false });
    }
    this._main(cmp)?.setState({ selected: !!on });
  }
  getState(cmp) { return !!this._main(cmp)?.selected; }
  /** The selected radio button in cmp's group (radiobutton_get_state's 'selected' output). */
  radioOn(cmp) {
    const e = this.gadgets.get(cmp);
    for (const [c, o] of this.gadgets) if (o.g.type === 'RadioButton' && o.g.group === e?.g.group && this.getState(c)) return c;
    return -1;
  }
  fade(cmp, on = true) {
    const e = this.gadgets.get(cmp);
    if (!e) return;
    e.g.faded = !!on;
    for (const ic of e.icons) ic.setState({ shaded: !!on });
    if (on && wimp.caret?.window === this.win && e.icons.includes(wimp.caret.icon)) wimp.setCaret(this.win);
  }
  faded(cmp) { return !!this.gadgets.get(cmp)?.g.faded; }
  setTitle(t) { this.win.setTitle(t); }
  setAvailable(cmp, list) { const e = this.gadgets.get(cmp); if (e) e.g.stringSet = list; }
  setClickShow(cmp, obj) { this.clickShow.set(cmp, obj); }
  setDefaultFocus(cmp) { this.defaultFocus = cmp; }
  setFocus(cmp) { const ic = this._main(cmp); if (ic?.writable && !ic.shaded) wimp.setCaret(this.win, ic, ic.text.length); }

  /** Resize the visible area / extent (OS units, like the Toolbox's full position block). */
  setSize(wOS, hOS) {
    this.win.setExtent({ w: wOS / 2, h: hOS / 2 });
    if (this.win.isOpen) this.win.open({ w: wOS / 2, h: hOS / 2, behind: 'keep' });
    else { this.win.w = wOS / 2; this.win.h = hOS / 2; }
  }

  // --- show / hide
  show(parent = null, pos = null) {
    this.parent = parent;
    const first = !this._shown;
    this._shown = true;
    this.emit('abouttobeshown');
    if (pos) this.win.open({ ...pos, behind: 'top' });
    else this.win.open({ behind: 'top' });
    if (first || !this.win.hasFocus) this._focus();
  }
  _focus() {
    const f = this.defaultFocus;
    if (f === -1) return;
    if (f === -2 || f == null) { wimp.setCaret(this.win); return; }
    const ic = this._main(f);
    if (ic?.writable && !ic.shaded) wimp.setCaret(this.win, ic, ic.text.length);
    else wimp.setCaret(this.win);
  }
  hide(byUser = false) {
    if (!this.win.isOpen) return;
    this.win.close();
    this.emit('hidden');
    if (byUser) this.emit('completed');
    if (this.tpl.hideEvent > 0) this.tb.raise(this.tpl.hideEvent, { obj: this });
  }

  // --- input
  _click(ev) {
    if (ev.button === 'menu') {
      if (this.menuName) { wimp.menus.openAt(this.tb.menu(this.menuName, this), ev, { task: this.task }); return true; }
      return;
    }
    const cmp = ev.icon?._tbCmp;
    if (cmp == null) { this.emit('click', { cmp: null, ev }); return; }
    const e = this.gadgets.get(cmp);
    if (!e || e.g.faded) return true;
    const adjust = ev.button === 'adjust';
    if (this.emit('click', { cmp, ev }) === true) return true;
    switch (e.g.type) {
      case 'ActionButton': this._action(cmp, adjust); break;
      case 'OptionButton': {
        const on = !this.getState(cmp);
        this.setState(cmp, on);
        this.emit('option', { cmp, on, adjust });
        break;
      }
      case 'RadioButton': {
        if (this.getState(cmp)) break;
        const previous = this.radioOn(cmp);
        this.setState(cmp, true);
        if (previous >= 0) this.emit('radio', { cmp: previous, on: false, previous });
        this.emit('radio', { cmp, on: true, previous });
        break;
      }
      case 'StringSet':
      case 'PopUp':
        if (ev.icon._tbRole === 'popup') this._popup(cmp, ev);
        break;
      default: break;
    }
    return true;
  }
  /** Activate an action button (Select, or Adjust = keep the window open). */
  _action(cmp, adjust = false) {
    const e = this.gadgets.get(cmp);
    if (!e || e.g.faded) return;
    const g = e.g, local = !!(g.flags & 4);
    const main = this._main(cmp);
    main?.setState({ selected: true });
    setTimeout(() => main?.setState({ selected: false }), 120);
    const ev = { cmp, event: g.event || 0, isDefault: !!(g.flags & 1), isCancel: !!(g.flags & 2), adjust, local };
    const show = this.clickShow.get(cmp) ?? (g.clickShow ? this.tb.find(g.clickShow) : null);
    if (g.event) this.tb.raise(g.event, { obj: this, cmp, ...ev });
    else this.emit('action', ev);
    if (show) { (typeof show === 'function' ? show() : show)?.show(this); }
    if (!local && !adjust && !show) this.hide(true);
  }
  _popup(cmp, ev) {
    const g = this.gadgets.get(cmp).g;
    if (g.type === 'StringSet') {
      if (g.flags & 8) this.emit('stringsetshown', { cmp });
      const list = String(g.stringSet ?? '').split(',').filter((s) => s !== '');
      if (!list.length) return;
      const cur = this.getValue(cmp);
      const m = new Menu(g.title ?? '', list.map((s) => ({ text: s, ticked: () => this.getValue(cmp) === s,
        action: () => { this.setValue(cmp, s); if (s !== cur) this.emit('value', { cmp, value: s }); } })));
      const ic = ev.icon, p = this.win.workToScreen(ic.bbox.x1, ic.bbox.y0);
      wimp.menus.open(m, p.x, p.y, { task: this.task });
    } else if (g.menu) {
      const m = this.tb.menu(g.menu, this);
      const ic = ev.icon, p = this.win.workToScreen(ic.bbox.x1, ic.bbox.y0);
      wimp.menus.open(m, p.x, p.y, { task: this.task });
    }
  }
  _drag(ev) {
    const cmp = ev.icon?._tbCmp;
    if (cmp == null || this.faded(cmp)) return;
    const g = this.gadgets.get(cmp).g;
    if (g.type !== 'Draggable') return;
    const ic = ev.icon, p = this.win.workToScreen(ic.bbox.x0, ic.bbox.y0);
    const sprite = g.sprite ?? 'file_xxx';
    wimp.drag({ sprite, box: { x0: p.x, y0: p.y, x1: p.x + (ic.bbox.x1 - ic.bbox.x0), y1: p.y + (ic.bbox.y1 - ic.bbox.y0) }, event: ev.pointerEvent })
      .then((drop) => { if (drop) this.emit('drag', { cmp, drop }); });
    return true;
  }
  _key(ev) {
    if (ev.code === 13) {          // Return: the default action button
      for (const [c, e] of this.gadgets) if (e.g.type === 'ActionButton' && e.g.flags & 1 && !e.g.faded) { this._action(c); return true; }
    } else if (ev.code === 27) {   // Escape: the cancel button
      for (const [c, e] of this.gadgets) if (e.g.type === 'ActionButton' && e.g.flags & 2 && !e.g.faded) { this._action(c); return true; }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------------------- the toolbox
export class Toolbox {
  constructor(task, res, { spriteArea = null, onEvent = null, onCreate = null, info = null } = {}) {
    this.task = task; this.res = res; this.spriteArea = spriteArea;
    this.onEvent = onEvent; this.onCreate = onCreate; this.info = info;
    this.objects = new Map();        // name -> TBWindow (created objects, first instance)
    this.menuFade = new Map();       // `${menu}:${cmp}` -> faded
  }
  template(name) { const t = this.res.objects[name]; if (!t) throw new Error(`Toolbox object template '${name}' not found`); return t; }
  /** toolbox_create_object (always a new instance for windows). */
  create(name) {
    const t = this.template(name);
    if (t.className !== 'Window') throw new Error(`${name} is a ${t.className}, not a Window`);
    const o = new TBWindow(this, name, t);
    if (!this.objects.has(name)) this.objects.set(name, o);
    this.onCreate?.(name, o);        // Toolbox_ObjectAutoCreated-style hook
    return o;
  }
  find(name) { return this.objects.get(name) ?? (this.res.objects[name]?.className === 'Window' ? this.create(name) : null); }
  raise(code, id = {}) { this.onEvent?.(code, id); }
  setMenuFade(menu, cmp, on) { this.menuFade.set(`${menu}:${cmp}`, !!on); }

  /** A Menu object as a core Menu (submenus: ProgInfo → the "About this program" box; windows as dialogue boxes). */
  menu(name, parent = null) {
    const t = this.template(name);
    return new Menu(t.title ?? this.info?.name ?? this.task.name, t.entries.map((e) => ({
      text: e.text ?? '',
      dotted: e.dotted,
      ticked: e.ticked,
      help: e.help ?? undefined,
      shaded: () => this.menuFade.get(`${name}:${e.cmp}`) ?? e.faded,
      submenu: e.submenuShow ? () => {
        const s = this.res.objects[e.submenuShow];
        if (s?.className === 'ProgInfo') {
          const w = infoBox(this.task, { name: this.info?.name ?? this.task.name, purpose: s.purpose, author: s.author, version: this.info?.version ?? s.version ?? '' });
          w.on('menuclosed', () => w.delete());
          return w;
        }
        const o = this.find(e.submenuShow);
        this.raise('abouttobeshown', { obj: o, name: e.submenuShow });
        o?.emit('abouttobeshown');
        return o?.win;
      } : undefined,
      action: e.clickEvent ? () => this.raise(e.clickEvent, { obj: parent, menu: name, cmp: e.cmp }) : undefined,
    })));
  }
}

/** Load a converted Res file (assets/templates/<App>.Res.json). */
export async function loadRes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Resource file not found: ${url}`);
  return r.json();
}
