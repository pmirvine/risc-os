#!/usr/bin/env node
// RISC OS Wimp Templates (,fec) → JSON.
//   node tools/templates.mjs <file,fec>        print JSON for one file
//   node tools/templates.mjs --build           convert all templates into assets/templates/
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V, findResources } from './lib/sources.mjs';

const BUTTON_TYPES = ['never', 'always', 'autorepeat', 'click', 'release', 'doubleclick', 'clickdrag',
  'releasedrag', 'doubledrag', 'menu', 'clickdoubledrag', 'radio', 'reserved12', 'reserved13', 'writeclickdrag', 'writable'];

const latin1 = (buf, off, max = 1e9) => {
  let s = '';
  for (let i = off; i < buf.length && i < off + max; i++) { const c = buf[i]; if (c < 32) break; s += String.fromCharCode(c); }
  return s;
};

export function decodeIconFlags(f) {
  const o = {
    text: !!(f & 1), sprite: !!(f & 2), border: !!(f & 4), hcentre: !!(f & 8), vcentre: !!(f & 16),
    filled: !!(f & 32), font: !!(f & 64), needsHelp: !!(f & 128), indirected: !!(f & 256),
    rjustify: !!(f & 512), allowAdjust: !!(f & 1024), halfSize: !!(f & 2048),
    button: (f >>> 12) & 15, buttonType: BUTTON_TYPES[(f >>> 12) & 15], esg: (f >>> 16) & 31,
    selected: !!(f & (1 << 21)), shaded: !!(f & (1 << 22)), deleted: !!(f & (1 << 23)),
  };
  if (o.font) o.fontHandle = (f >>> 24) & 255; else { o.fg = (f >>> 24) & 15; o.bg = (f >>> 28) & 15; }
  return o;
}

export function decodeWindowFlags(f) {
  return {
    moveable: !!(f & 2), autoRedraw: !!(f & 16), pane: !!(f & 32), allowOffScreen: !!(f & 64),
    scrollRepeat: !!(f & 256), scrollDebounced: !!(f & 512), realColours: !!(f & 1024), backWindow: !!(f & 2048),
    hotKeys: !!(f & 4096), keepOnScreen: !!(f & 8192), ignoreRightExtent: !!(f & 16384), ignoreLowerExtent: !!(f & 32768),
    hasBack: !!(f & (1 << 24)), hasClose: !!(f & (1 << 25)), hasTitle: !!(f & (1 << 26)), hasToggle: !!(f & (1 << 27)),
    hasVScroll: !!(f & (1 << 28)), hasAdjust: !!(f & (1 << 29)), hasHScroll: !!(f & (1 << 30)), newFormat: !!(f & (1 << 31)),
  };
}

/** Decode the 12-byte icon data field. base = offset of window block (indirected pointers are relative to it). */
function iconData(buf, dataOff, flags, base, winEnd) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const i32 = (o) => dv.getInt32(o, true);
  const d = {};
  if (flags & 256) {
    const p0 = i32(dataOff), p1 = i32(dataOff + 4), len = i32(dataOff + 8);
    const str = (p) => (p >= 0 && base + p < buf.length ? latin1(buf, base + p) : null);
    if (flags & 1) {
      d.text = str(p0) ?? '';
      d.bufferSize = len;
      const v = p1 === -1 || p1 === 0 && false ? null : str(p1);
      if (v !== null && p1 !== -1) d.validation = v;
    } else if (flags & 2) {
      // indirected sprite only: p0 = name, p1 = sprite area (1 = Wimp pool), len = name length (0 = pointer to sprite)
      d.spriteName = str(p0) ?? '';
      d.spriteArea = p1;
    }
  } else {
    // non-indirected: 12 bytes text or sprite name
    const s = latin1(buf, dataOff, 12);
    if (flags & 1) d.text = s;
    if (flags & 2) d.spriteName = s;
  }
  if ((flags & 3) === 3 && !(flags & 256)) d.spriteName = d.text; // text+sprite non-indirected: same 12 bytes
  if (d.validation) {
    // Validation string commands separated by ';': A allow, D display char, F colours, K keys, L lines, P pointer, R border, S sprites
    d.validationParsed = {};
    for (const part of d.validation.split(/(?<!\\);/)) {
      if (!part) continue;
      const k = part[0].toUpperCase();
      d.validationParsed[k] = part.slice(1);
    }
    if (d.validationParsed.S) d.spriteName = d.validationParsed.S.split(',')[0];
  }
  return d;
}

export function parseTemplates(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const i32 = (o) => dv.getInt32(o, true), u32 = (o) => dv.getUint32(o, true);
  const fontOff = i32(0);
  const fonts = [];
  if (fontOff > 0) {
    for (let o = fontOff; o + 48 <= buf.length; o += 48) fonts.push({ xPoint: i32(o) / 16, yPoint: i32(o + 4) / 16, name: latin1(buf, o + 8, 40) });
  }
  const windows = {};
  for (let ix = 16; ix + 24 <= buf.length && u32(ix) !== 0; ix += 24) {
    const off = u32(ix), size = u32(ix + 4), type = u32(ix + 8), name = latin1(buf, ix + 12, 12);
    if (type !== 1) { windows[name] = { type, unsupported: true }; continue; }
    const b = off;
    const wflags = u32(b + 28);
    const colours = [...buf.subarray(b + 32, b + 40)];
    const tflags = u32(b + 56);
    const w = {
      visible: { xmin: i32(b), ymin: i32(b + 4), xmax: i32(b + 8), ymax: i32(b + 12) },
      scroll: { x: i32(b + 16), y: i32(b + 20) },
      behind: i32(b + 24),
      flags: wflags, flagsDecoded: decodeWindowFlags(wflags),
      colours: { titleFg: colours[0], titleBg: colours[1], workFg: colours[2], workBg: colours[3], scrollOuter: colours[4], scrollInner: colours[5], titleFocus: colours[6], extra: colours[7] },
      extent: { xmin: i32(b + 40), ymin: i32(b + 44), xmax: i32(b + 48), ymax: i32(b + 52) },
      titleFlags: tflags, titleFlagsDecoded: decodeIconFlags(tflags),
      workFlags: u32(b + 60), workButton: (u32(b + 60) >>> 12) & 15, workButtonType: BUTTON_TYPES[(u32(b + 60) >>> 12) & 15],
      spriteArea: i32(b + 64),
      minWidth: dv.getUint16(b + 68, true), minHeight: dv.getUint16(b + 70, true),
      title: iconData(buf, b + 72, tflags, b, b + size),
      icons: [],
    };
    const n = u32(b + 84);
    for (let k = 0; k < n; k++) {
      const io = b + 88 + k * 32;
      const f = u32(io + 16);
      w.icons.push({
        i: k,
        bbox: { xmin: i32(io), ymin: i32(io + 4), xmax: i32(io + 8), ymax: i32(io + 12) },
        flags: f, ...decodeIconFlags(f), ...iconData(buf, io + 20, f, b, b + size),
      });
    }
    windows[name] = w;
  }
  return { fonts, windows };
}

function build() {
  const OUT = path.join(ROOT, 'assets/templates');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const seen = new Set(), index = {};
  for (const { rel, pool } of findResources(/,fec$/i)) {
    const base = path.basename(rel).replace(/,fec$/i, '');
    const primary = /^templates$/i.test(base);
    const outName = primary ? pool : `${pool}.${base.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    if (seen.has(outName.toLowerCase())) continue;
    seen.add(outName.toLowerCase());
    let t;
    try { t = parseTemplates(fs.readFileSync(path.join(V, rel))); } catch (e) { console.warn('FAILED', rel, e.message); continue; }
    t.source = rel;
    fs.writeFileSync(path.join(OUT, outName + '.json'), JSON.stringify(t, null, 1));
    index[outName] = { source: rel, windows: Object.keys(t.windows) };
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`converted ${Object.keys(index).length} template files`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv[2];
  if (a === '--build') build();
  else if (a) console.log(JSON.stringify(parseTemplates(fs.readFileSync(a)), null, 1));
  else console.log('usage: templates.mjs <file> | --build');
}
