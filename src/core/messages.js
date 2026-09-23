import { decodeLatin1 } from './charset.js';
// MessageTrans equivalent. Messages files are converted by the assets agent to
// assets/messages/<Component>.json (flat {token: text}). Built-in defaults can be
// supplied so the desktop works even when a file is missing.

const files = new Map();

export async function loadMessages(component, defaults = {}) {
  if (files.has(component)) return files.get(component);
  const p = (async () => {
    let dict = {};
    try {
      const r = await fetch(`assets/messages/${component}.json`);
      if (r.ok) dict = await r.json();
    } catch { /* ignore */ }
    // values may contain raw RISC OS Latin-1 control-range characters (e.g. U+008B for the Shift arrow)
    for (const k of Object.keys(dict)) if (typeof dict[k] === 'string') dict[k] = dict[k].replace(/[\u0080-\u009f]/g, (c) => decodeLatin1([c.charCodeAt(0)]));
    return new Messages(component, { ...defaults, ...dict });
  })();
  files.set(component, p);
  return p;
}

export class Messages {
  constructor(name, dict) { this.name = name; this.dict = dict; }
  /** Look up token, substituting %0..%3. Returns the token itself if missing. */
  lookup(token, ...args) {
    let s = this.dict[token];
    if (s == null) return token;
    return s.replace(/%([0-3])/g, (_, n) => (args[+n] ?? ''));
  }
  has(token) { return token in this.dict; }
}

/** Parse a raw RISC OS Messages text file into a {token: text} dictionary. */
export function parseMessagesText(text) {
  const out = {};
  let pending = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = /^([^:]*):(.*)$/.exec(line);
    if (!m) continue;
    const toks = m[1].split('/');
    for (const t of toks) out[t] = m[2];
  }
  return out;
}
