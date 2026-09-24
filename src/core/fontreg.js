// Font registry: the outline fonts the desktop knows, as the Font Manager's Font_ListFonts would list them.
//
//  * The built-in fonts: assets/fonts/fonts.json, the ROM and !Fonts fonts pre-converted to OpenType by
//    tools/fonts.mjs (loaded by assets/fonts/fonts.css).
//  * Outline fonts found in the Font$Path directories on the virtual disc: any directory holding an Outlines
//    (Outlines0) and an IntMetrics (IntMetric0) file is a font, named by its path below the Font$Path directory
//    (e.g. <!Fonts>.Sample.Medium = "Sample.Medium"), as the Font Manager does. !T1ToFont writes such fonts. They
//    are converted to a web font when first used: the Outlines / IntMetrics (and Encoding) files are parsed
//    (riscosfont.js) and built into OpenType with the same code as tools/fonts.mjs (fontbuild.js, opentype.js
//    loaded on demand from assets/lib/opentype), then added to document.fonts as family "RISCOS <name>".
//
// Built-in fonts win over disc fonts of the same name (the seed !Fonts holds NewHall, Sassoon, ...).
//
//   await fontRegistry.ready()        fonts.json loaded, Font$Path (re)scanned if the disc changed
//   fontRegistry.names()              every font name, sorted (case as found)
//   fontRegistry.info(name)           {name, family, weight, style, fallback, ascender, descender, disc?} | null
//   fontRegistry.families(filter?)    [[family, [styles…]]…] for font menus ('' = the font has no style part)
//   fontRegistry.fonts()              {name: info} (fonts.json's "fonts" shape), fontRegistry.latin1ToUnicode
//   await fontRegistry.load(name)     make the font usable in CSS (builds a disc font's web font); → info | null
//   fontRegistry.cssFor(name, px)     CSS font string (starts loading a disc font)
import { vfs } from './vfs.js';
import { sysvars } from './sysvars.js';
import { fonts } from './fonts.js';
import { parseOutlines, parseIntMetrics, parseEncoding } from './riscosfont.js';
import { buildOpenType } from './fontbuild.js';
import { BASE0, LATIN1 } from './encodings.js';

const DEFAULT_FONT_PATH = 'ADFS::HardDisc4.$.!Boot.Resources.!Fonts.';
const url = (p) => new URL('../../' + p, import.meta.url).href;

let builtin = {};                 // lower-case name -> info (fonts.json)
let builtinP = null;
const disc = new Map();           // lower-case name -> info (virtual disc)
let dirty = true;
const building = new Map();       // lower-case name -> Promise<info|null>
let opentypeP = null;

function guessFallback(name) {
  return /times|trinity|roman|serif|newhall|schoolbook|garamond|^cm[a-z]*\d/i.test(name) ? '"Times New Roman", Times, serif'
    : /courier|corpus|mono|typewriter|fixed|^cmtt/i.test(name) ? '"Courier New", Courier, monospace' : 'Helvetica, Arial, sans-serif';
}

/** The directories on Font$Path that exist on the virtual disc. */
function fontDirs() {
  const fp = sysvars.get('Font$Path') || DEFAULT_FONT_PATH;
  const out = [];
  for (let d of String(fp).split(',')) {
    d = d.trim().replace(/\.$/, '');
    if (!d) continue;
    try { if (vfs.isDir(d)) out.push(vfs.canonical(d)); } catch { /* not on the disc (e.g. Resources:$.Fonts) */ }
  }
  return [...new Set(out)];
}

function walk(dir, prefix, depth) {
  if (depth > 6) return;
  let list;
  try { list = vfs.list(dir); } catch { return; }
  const files = new Map(list.filter((e) => e.type === 'file').map((e) => [e.name.toLowerCase(), e]));
  const outl = files.get('outlines') ?? files.get('outlines0');
  const met = files.get('intmetrics') ?? files.get('intmetric0');
  if (prefix && outl && met && !disc.has(prefix.toLowerCase())) {
    disc.set(prefix.toLowerCase(), {
      name: prefix, family: 'RISCOS ' + prefix, weight: 400, style: 'normal', fallback: guessFallback(prefix),
      ascender: 900, descender: -250, disc: true, dir,
      outlines: outl.path, metrics: met.path, encoding: files.get('encoding')?.path ?? null, base0: /0$/.test(outl.name),
    });
  }
  for (const e of list) {
    if (e.type !== 'dir' || e.name.startsWith('!') || /^encodings$/i.test(e.name)) continue;
    walk(e.path, prefix ? `${prefix}.${e.name}` : e.name, depth + 1);
  }
}

function rescan() {
  if (!dirty) return;
  dirty = false;
  const old = new Map(disc);
  disc.clear();
  for (const d of fontDirs()) walk(d, '', 0);
  // keep what we know about fonts already built (a rewritten font is rebuilt: see load())
  for (const [k, v] of disc) { const o = old.get(k); if (o && o.outlines === v.outlines) disc.set(k, o); }
}

vfs.on?.('change', () => { dirty = true; });

function loadOpentype() {
  if (globalThis.opentype) return Promise.resolve(globalThis.opentype);
  opentypeP ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url('assets/lib/opentype/opentype.min.js');
    s.onload = () => (globalThis.opentype ? res(globalThis.opentype) : rej(new Error('opentype.js did not load')));
    s.onerror = () => { opentypeP = null; rej(new Error('opentype.js could not be loaded')); };
    document.head.appendChild(s);
  });
  return opentypeP;
}

let encNames = null;
const encodings = () => (encNames ??= { latin1: parseEncoding(LATIN1), base0: parseEncoding(BASE0) });

const stampOf = (info) => { const st = vfs.stat(info.outlines); return st ? `${st.size}:${st.load}:${st.exec}:${st.date}` : ''; };

/** Convert a disc font to a web font and add it to document.fonts. */
async function buildWebFont(info) {
  const stamp = info.stamp = stampOf(info);
  info.failed = false;
  const [opentype, outB, metB, encT] = await Promise.all([
    loadOpentype(), vfs.readFile(info.outlines), vfs.readFile(info.metrics), info.encoding ? vfs.readText(info.encoding) : null,
  ]);
  const outl = parseOutlines(outB);
  const met = parseIntMetrics(metB);
  const { latin1, base0 } = encodings();
  const encoding = !info.base0 && encT ? parseEncoding(encT) : null;
  const { font, ascender, descender } = buildOpenType(opentype, {
    outl, met, family: info.family, latin1, base0, isBase0: info.base0, encoding, keepUnmapped: true, uniqueNames: true,
  });
  const face = new FontFace(info.family, font.toArrayBuffer(), { weight: '400', style: 'normal' });
  await face.load();
  if (info.face) document.fonts.delete(info.face);
  document.fonts.add(face);
  Object.assign(info, { face, ascender, descender, stamp });
  return info;
}

export const fontRegistry = {
  /** Load fonts.json (once) and rescan the Font$Path directories if the disc has changed. */
  async ready() {
    builtinP ??= fetch(url('assets/fonts/fonts.json')).then((r) => r.json()).then((j) => {
      this.json = j;
      this.latin1ToUnicode = j.latin1ToUnicode ?? {};
      builtin = Object.fromEntries(Object.entries(j.fonts ?? {}).map(([k, v]) => [k.toLowerCase(), { name: k, ...v }]));
    }).catch(() => { builtin = {}; });
    await builtinP;
    rescan();
    return this;
  },
  json: null,
  latin1ToUnicode: {},

  /** Mark the disc fonts for rescanning (done automatically when the VFS changes). */
  invalidate() { dirty = true; },

  info(name) {
    if (!name) return null;
    const l = String(name).trim().toLowerCase();
    rescan();
    return builtin[l] ?? disc.get(l) ?? null;
  },

  names() {
    rescan();
    const all = new Map();
    for (const f of disc.values()) all.set(f.name.toLowerCase(), f.name);
    for (const f of Object.values(builtin)) all.set(f.name.toLowerCase(), f.name);
    return [...all.values()].sort((a, b) => a.localeCompare(b));
  },

  /** {name: info}, like fonts.json's "fonts". */
  fonts() { return Object.fromEntries(this.names().map((n) => [n, this.info(n)])); },

  /** Families and their styles, for font menus: [[family, [style, …]], …]; filter(name) → false to leave a font out. */
  families(filter = (n) => !/^System\./i.test(n)) {
    const fam = new Map();
    for (const n of this.names()) {
      if (!filter(n)) continue;
      const [f, ...rest] = n.split('.');
      if (!fam.has(f)) fam.set(f, []);
      fam.get(f).push(rest.join('.'));
    }
    return [...fam.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  },

  /** Make a font usable in CSS. Resolves to its info (null if unknown or it can't be converted). */
  async load(name) {
    await this.ready();
    const info = this.info(name);
    if (!info) return null;
    if (!info.disc) {
      try { await document.fonts.load(this.cssFor(info.name, 16)); } catch { /* */ }
      return info;
    }
    if (info.face && info.stamp === stampOf(info)) return info;
    if (info.failed && info.stamp === stampOf(info)) return null;
    const k = info.name.toLowerCase();
    if (!building.has(k)) {
      building.set(k, buildWebFont(info).catch((e) => { info.failed = true; console.warn(`Font ${info.name} could not be converted:`, e.message); return null; })
        .finally(() => building.delete(k)));
    }
    return building.get(k);
  },

  /** CSS font for a font name at a size in CSS px (a disc font is converted in the background). */
  cssFor(name, px) {
    const f = this.info(name);
    if (!f) return null;
    if (f.disc && !f.face) this.load(f.name);
    return `${f.style === 'italic' ? 'italic ' : ''}${f.weight} ${px}px "${f.family}", ${f.fallback}`;
  },
};

fonts.registry = fontRegistry;
