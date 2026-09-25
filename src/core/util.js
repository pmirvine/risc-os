// Small shared helpers.

/** Minimal event emitter with cancellable events. */
export class Emitter {
  constructor() { this._h = new Map(); }
  /** Add a handler; opts.first puts it before the handlers already there (e.g. a gadget inside a window). */
  on(type, fn, opts = {}) {
    if (!this._h.has(type)) this._h.set(type, []);
    if (opts.first) this._h.get(type).unshift(fn); else this._h.get(type).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const a = this._h.get(type);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  hasListeners(type) { return (this._h.get(type)?.length ?? 0) > 0; }
  /**
   * Call handlers in order. `ev` gets preventDefault()/stopPropagation(); returns ev.
   * If a handler returns true, ev.handled is set and remaining handlers are skipped.
   */
  emit(type, ev = {}) {
    if (!ev.preventDefault) {
      ev.defaultPrevented = false;
      ev.preventDefault = () => { ev.defaultPrevented = true; };
    }
    ev.type = ev.type ?? type;
    const a = this._h.get(type);
    if (a) {
      for (const fn of [...a]) {
        let r;
        try { r = fn(ev); } catch (err) { console.error(`Error in ${type} handler`, err); reportHandlerError?.(err); }
        if (r === true) { ev.handled = true; break; }
        if (r === false) ev.defaultPrevented = true;
      }
    }
    return ev;
  }
}
let reportHandlerError = null;
export function setHandlerErrorReporter(fn) { reportHandlerError = fn; }

export function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Format a byte count like the Filer ("1234 bytes", "12K", "3M"). */
export function formatSize(n) {
  if (n < 4096) return `${n} bytes`;
  if (n < 1024 * 1024 * 4) return `${Math.round(n / 1024)}K`;
  if (n < 1024 * 1024 * 1024 * 4) return `${Math.round(n / (1024 * 1024))}M`;
  return `${Math.round(n / (1024 * 1024 * 1024))}G`;
}

export const hex = (n, w = 8) => (n >>> 0).toString(16).toUpperCase().padStart(w, '0');

/** Parse a RISC OS icon validation string into {letter: [strings]} (letters upper-case). */
export function parseValidation(v) {
  const out = {};
  if (!v) return out;
  let cur = '';
  const cmds = [];
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '\\' && i + 1 < v.length) { cur += v[++i]; continue; }
    if (c === ';') { cmds.push(cur); cur = ''; continue; }
    cur += c;
  }
  cmds.push(cur);
  for (const c of cmds) {
    if (!c) continue;
    const k = c[0].toUpperCase();
    (out[k] ??= []).push(c.slice(1));
  }
  return out;
}

/** Test a character against an 'A' validation spec (e.g. "~ .:*" or "0-9A-F"). */
export function allowedChar(spec, ch) {
  if (spec == null) return true;
  // Parse into a list of [allow, set]
  let allow = true, ok = true, i = 0, first = true;
  const inSet = (s, c) => {
    for (let j = 0; j < s.length; j++) {
      let a = s[j];
      if (a === '\\' && j + 1 < s.length) a = s[++j];
      if (s[j + 1] === '-' && j + 2 < s.length) {
        let b = s[j + 2];
        if (c >= a && c <= b) return true;
        j += 2;
      } else if (c === a) return true;
    }
    return false;
  };
  // Segments separated by '~' toggling allow/disallow. Leading '~' => all allowed except.
  const segs = [];
  let cur = '', mode = true;
  for (let j = 0; j < spec.length; j++) {
    const c = spec[j];
    if (c === '\\' && j + 1 < spec.length) { cur += '\\' + spec[++j]; continue; }
    if (c === '~') { segs.push([mode, cur]); cur = ''; mode = !mode; continue; }
    cur += c;
  }
  segs.push([mode, cur]);
  // Default: if spec starts with '~' everything allowed initially
  ok = spec[0] === '~';
  for (const [m, s] of segs) if (s && inSet(s, ch)) ok = m;
  return ok;
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
