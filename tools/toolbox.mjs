#!/usr/bin/env node
// RISC OS Toolbox resource files (,fae "Res") → JSON.
//   node tools/toolbox.mjs <file,fae>      print JSON for one file
//   node tools/toolbox.mjs --build         convert the known Res files into assets/templates/<Pool>.Res.json
//
// Format (Toolbox, RISC OS 3.5+): "RESF", version (101), offset of the first object (-1 = none). Each object:
//   int string_table_offset, message_table_offset, relocation_table_offset   (relative to the object start, -1 = none)
//   ObjectTemplateHeader { int class_id, flags, version; char name[12]; int total_size, body, body_size }
//     (body is relative to the header, i.e. object start + 12)
//   body, string table, message table, relocation table { int n; { int word (offset in body), directive } × n }
//   Directives: 1 string reference, 2 message reference (both offsets into their table), 3 sprite area, 4 object offset.
// The next object follows the relocation table. Pointer fields that aren't relocated are null (-1/0 in the file).
//
// Output: { source, objects: { <name>: { class, className, flags, version, …class body… } } } — windows keep the
// Wimp window block (OS units, like assets/templates) plus the gadget list with each gadget's own fields decoded.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V } from './lib/sources.mjs';
import { decodeWindowFlags } from './templates.mjs';

const CLASSES = {   // the classes this converter decodes; others keep their strings only
  0x82880: 'Window', 0x828C0: 'Menu', 0x82900: 'Iconbar', 0x82B40: 'ProgInfo',
};
const GADGETS = {
  128: 'ActionButton', 192: 'OptionButton', 256: 'LabelledBox', 320: 'Label', 384: 'RadioButton', 448: 'DisplayField',
  512: 'WritableField', 576: 'Slider', 640: 'Draggable', 704: 'PopUp', 768: 'Adjuster', 832: 'NumberRange',
  896: 'StringSet', 960: 'Button',
};
// Gadget bodies after the 36-byte header: field name, 's' (string pointer) or 'i' (int).
const GADGET_FIELDS = {
  ActionButton: [['text', 's'], ['maxText', 'i'], ['clickShow', 's'], ['event', 'i']],
  OptionButton: [['label', 's'], ['maxLabel', 'i'], ['event', 'i']],
  LabelledBox: [['label', 's']],
  Label: [['label', 's']],
  RadioButton: [['group', 'i'], ['label', 's'], ['maxLabel', 'i'], ['event', 'i']],
  DisplayField: [['text', 's'], ['maxText', 'i']],
  WritableField: [['text', 's'], ['maxText', 'i'], ['allowable', 's'], ['maxAllowable', 'i'], ['before', 'i'], ['after', 'i']],
  Slider: [['lower', 'i'], ['upper', 'i'], ['step', 'i'], ['initial', 'i']],
  Draggable: [['text', 's'], ['maxText', 'i'], ['sprite', 's'], ['maxSprite', 'i']],
  PopUp: [['menu', 's']],
  Adjuster: [['increment', 'i']],
  NumberRange: [['lower', 'i'], ['upper', 'i'], ['step', 'i'], ['initial', 'i'], ['precision', 'i'], ['before', 'i'], ['after', 'i'], ['displayLength', 'i']],
  StringSet: [['stringSet', 's'], ['title', 's'], ['selected', 's'], ['maxSelected', 'i'], ['allowable', 's'], ['maxAllowable', 'i'], ['before', 'i'], ['after', 'i']],
  Button: [['buttonFlags', 'i'], ['value', 's'], ['maxValue', 'i'], ['validation', 's'], ['maxValidation', 'i']],
};

const cstr = (buf, off) => { let s = ''; for (let i = off; i < buf.length && buf[i] !== 0; i++) s += String.fromCharCode(buf[i]); return s; };

export function parseResFile(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const i32 = (o) => dv.getInt32(o, true), u32 = (o) => dv.getUint32(o, true);
  if (cstr(buf, 0).slice(0, 4) !== 'RESF') throw new Error('Not a Toolbox resource file');
  const out = { version: i32(4), objects: {} };
  let off = i32(8);
  while (off > 0 && off + 48 <= buf.length) {
    const strT = i32(off), msgT = i32(off + 4), relT = i32(off + 8);
    const h = off + 12;
    const cls = u32(h), flags = u32(h + 4), version = i32(h + 8);
    const name = cstr(buf.subarray(0, h + 24), h + 12).slice(0, 12);
    const body = h + i32(h + 28), bodySize = i32(h + 32);
    // relocations: body offset → resolved string
    const rel = new Map();
    let end = h + 36 + bodySize;
    if (relT >= 0) {
      const r = off + relT, n = i32(r);
      for (let k = 0; k < n; k++) {
        const word = i32(r + 4 + k * 8), dir = i32(r + 8 + k * 8);
        const v = i32(body + word);
        if (dir === 1 && strT >= 0 && v >= 0) rel.set(word, cstr(buf, off + strT + v));
        else if (dir === 2 && msgT >= 0 && v >= 0) rel.set(word, cstr(buf, off + msgT + v));
        else if (dir === 4) rel.set(word, { objectOffset: v });
      }
      end = r + 4 + n * 8;
    } else end = Math.max(end, off + (msgT >= 0 ? msgT : strT >= 0 ? strT : 0));
    const S = (o) => (rel.has(o) ? rel.get(o) : null);
    const I = (o) => i32(body + o);
    const obj = { class: '0x' + cls.toString(16).toUpperCase(), className: CLASSES[cls] ?? null, flags, version };
    const kind = CLASSES[cls];
    if (kind === 'Window') windowLayout(obj, body, S, I, u32, buf);
    else if (kind === 'Menu') {
      Object.assign(obj, { menuFlags: I(0), title: S(4), maxTitle: I(8), help: S(12), maxHelp: I(16), showEvent: I(20), hideEvent: I(24) });
      const n = I(28);
      obj.entries = [];
      for (let k = 0; k < n; k++) {
        const e = 32 + k * 40;
        const f = I(e);
        obj.entries.push({ flags: f, ticked: !!(f & 1), dotted: !!(f & 2), faded: !!(f & 256), isSprite: !!(f & 512), hasSubmenu: !!(f & 1024),
          submenuEvent: !!(f & 2048), clickShowTransient: !!(f & 4096),
          cmp: I(e + 4), text: S(e + 8), maxText: I(e + 12), clickShow: S(e + 16), submenuShow: S(e + 20),
          submenuEventCode: I(e + 24), clickEvent: I(e + 28), help: S(e + 32), maxHelp: I(e + 36) });
      }
    } else if (kind === 'ProgInfo') {
      Object.assign(obj, { piFlags: I(0), title: S(4), maxTitle: I(8), purpose: S(12), author: S(16), licenceType: I(20), version: S(24), window: S(28) });
    } else if (kind === 'Iconbar') {
      Object.assign(obj, { ibFlags: I(0), position: I(4), priority: I(8), spriteName: S(12), maxSpriteName: I(16), text: S(20), maxText: I(24),
        menu: S(28), selectEvent: I(32), adjustEvent: I(36), selectShow: S(40), adjustShow: S(44), help: S(48), maxHelp: I(52) });
    } else {
      obj.strings = [...rel.values()].filter((v) => typeof v === 'string');
    }
    out.objects[name] = obj;
    if (end <= off) break;
    off = end;
  }
  return out;
}

/** Window object body (WindowTemplate): flags, help, pointer, menu, shortcuts, gadgets, focus, events, toolbars, wimp window. */
function windowLayout(obj, body, S, I, u32, buf) {
  Object.assign(obj, {
    windowFlags: I(0), help: S(4), maxHelp: I(8), pointer: S(12), maxPointer: I(16), pointerHot: [I(20), I(24)],
    menu: S(28), defaultFocus: I(48), showEvent: I(52), hideEvent: I(56),
    toolbars: { ibl: S(60), itl: S(64), ebl: S(68), etl: S(72) },
  });
  const w = 76;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  obj.window = {
    visible: { xmin: I(w), ymin: I(w + 4), xmax: I(w + 8), ymax: I(w + 12) },
    scroll: { x: I(w + 16), y: I(w + 20) }, behind: I(w + 24), flags: u32(body + w + 28) >>> 0,
    colours: { titleFg: buf[body + w + 32], titleBg: buf[body + w + 33], workFg: buf[body + w + 34], workBg: buf[body + w + 35],
      scrollOuter: buf[body + w + 36], scrollInner: buf[body + w + 37], titleFocus: buf[body + w + 38], extra: buf[body + w + 39] },
    extent: { xmin: I(w + 40), ymin: I(w + 44), xmax: I(w + 48), ymax: I(w + 52) },
    titleFlags: u32(body + w + 56) >>> 0, workFlags: u32(body + w + 60) >>> 0,
    minWidth: dv.getUint16(body + w + 68, true), minHeight: dv.getUint16(body + w + 70, true),
    title: { text: S(w + 72) ?? '', validation: S(w + 76), bufferSize: I(w + 80) },
  };
  obj.window.flagsDecoded = decodeWindowFlags(obj.window.flags);
  const ns = I(32), ks = I(36);
  obj.shortcuts = [];
  for (let k = 0; k < ns && ks >= 0; k++) {
    const o = ks + k * 16;
    obj.shortcuts.push({ flags: I(o), key: I(o + 4), event: I(o + 8), show: S(o + 12) });
  }
  const ng = I(40), gs = I(44);
  obj.gadgets = [];
  let o = gs;
  for (let k = 0; k < ng && gs >= 0; k++) {
    const flags = I(o) >>> 0, ts = I(o + 4) >>> 0, type = ts & 0xFFFF;
    const kind = GADGETS[type] ?? `type${type}`;
    const gd = {
      type: kind, flags, faded: !!(flags & 0x80000000), atBack: !!(flags & 0x40000000),
      bbox: { xmin: I(o + 8), ymin: I(o + 12), xmax: I(o + 16), ymax: I(o + 20) },
      cmp: I(o + 24), help: S(o + 28), maxHelp: I(o + 32),
    };
    const fields = GADGET_FIELDS[kind] ?? [];
    fields.forEach(([n, t], j) => { gd[n] = t === 's' ? S(o + 36 + j * 4) : I(o + 36 + j * 4); });
    obj.gadgets.push(gd);
    // the size in the header is the size of the whole gadget; fall back to the known body length
    const size = (ts >>> 16) || (36 + fields.length * 4);
    o += size;
  }
}

// --------------------------------------------------------------------------- CLI
const TARGETS = [
  ['SystemRes/InetSetup/Resources/UK/Res,fae', 'InetSetup.Res.json'],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === '--build') {
    const outDir = path.join(ROOT, 'assets/templates');
    for (const [src, out] of TARGETS) {
      const file = path.join(V, 'Sources', src);
      const j = { source: 'Sources/' + src, ...parseResFile(fs.readFileSync(file)) };
      fs.writeFileSync(path.join(outDir, out), JSON.stringify(j, null, 1));
      console.log(`${out}: ${Object.keys(j.objects).length} objects`);
    }
  } else if (arg) {
    console.log(JSON.stringify(parseResFile(fs.readFileSync(arg)), null, 1));
  } else {
    console.log('Usage: node tools/toolbox.mjs <file,fae> | --build');
  }
}
