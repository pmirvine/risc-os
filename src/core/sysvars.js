// System variables (OS_ReadVarVal / OS_SetVarVal) and GSTrans.
//
// Types: 'string' (GSTrans'd when set with *Set), 'number' (*SetEval), 'macro' (*SetMacro,
// expanded on read), 'code' (a JS getter function, e.g. Sys$Time).

export class SysVars {
  constructor() {
    this.vars = new Map();   // lcname -> {name, type, value}
  }

  set(name, value, type = 'string') {
    this.vars.set(name.toLowerCase(), { name, type, value });
  }
  setCode(name, fn) { this.set(name, fn, 'code'); }
  unset(name) {
    // supports wildcards
    const re = wildRe(name);
    let n = 0;
    for (const k of [...this.vars.keys()]) if (re.test(k)) { this.vars.delete(k); n++; }
    return n;
  }
  has(name) { return this.vars.has(name.toLowerCase()); }
  entry(name) { return this.vars.get(name.toLowerCase()) ?? null; }

  /** Read a variable's value as a string (macros expanded, numbers formatted). null if unset. */
  get(name) {
    const v = this.vars.get(name.toLowerCase());
    if (!v) return null;
    switch (v.type) {
      case 'number': return String(v.value | 0);
      case 'macro': return this.gstrans(v.value);
      case 'code': return String(v.value());
      default: return String(v.value);
    }
  }

  /** List variables matching a wildcard pattern (for *Show). */
  list(pattern = '*') {
    const re = wildRe(pattern);
    return [...this.vars.values()].filter((v) => re.test(v.name.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * GSTrans: expand <var> references, |x control sequences and "quotes".
   * opts.noQuotes: don't strip quotes.
   */
  gstrans(s, opts = {}) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '<') {
        const j = s.indexOf('>', i + 1);
        if (j > i) {
          const inner = s.slice(i + 1, j);
          if (/^\d+$/.test(inner)) { out += String.fromCharCode(+inner & 255); i = j; continue; }
          if (/^&[0-9a-f]+$/i.test(inner)) { out += String.fromCharCode(parseInt(inner.slice(1), 16) & 255); i = j; continue; }
          if (/^[^\s<>]+$/.test(inner)) {
            const v = this.get(inner);
            out += v ?? '';
            i = j; continue;
          }
        }
        out += c;
      } else if (c === '|' && i + 1 < s.length) {
        const d = s[++i];
        if (d === '|') out += '|';
        else if (d === '"') out += '"';
        else if (d === '<') out += '<';
        else if (d === '?') out += '\x7f';
        else if (d === '!') { const e = s[++i] ?? ''; out += String.fromCharCode(e.charCodeAt(0) | 0x80); }
        else if (d >= '@' && d <= '~') out += String.fromCharCode(d.toUpperCase().charCodeAt(0) & 31);
        else out += d;
      } else if (c === '"' && !opts.noQuotes) {
        // quotes are removed (GSTrans with quote processing)
      } else out += c;
    }
    return out;
  }
}

export function wildRe(pattern) {
  const esc = pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/#/g, '.');
  return new RegExp('^' + esc + '$');
}

export const sysvars = new SysVars();
