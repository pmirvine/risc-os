// !Chars (RISC OS 3.71) - a JavaScript re-implementation of Sources/Apps/Chars/bas/!RunImage.
//
// Window "Characters" from the real Templates, 32 x 8 grid of the 256 character codes.
// System font: characters plotted with VDU 23,17,7 spacing (24 x 44 OS units), control codes
// (0-31, 127) shown as inverted '@'+code / '?'. Outline font: 13 x 15 pt, codes 32-255, centred.
// SELECT (auto-repeat) or pressing Shift over a character = Wimp_ProcessKey to the caret owner.
// MENU = the Font Manager's font menu (System Font + families + styles). Close = quit.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadMessages } from '../../core/messages.js';
import { loadTemplates } from '../../core/templates.js';
import { os } from '../../core/os.js';

// geometry in OS units, as the BASIC program
const LM = 16, TM = 16, MXSP = 24, MYSP = 44;
const px = (o) => o / 2;

let sysFont = null;           // {chars:[256][8]}
let fontList = null;          // the font registry (core fontreg.js: fonts.json + outline fonts on the disc)

async function loadSysFont() {
  if (!sysFont) sysFont = await (await fetch('assets/fonts/system8x8.json')).json();
  return sysFont;
}
async function loadFontList() {
  fontList = await os.fontreg.ready();
  return fontList;
}

/** Families -> styles from the outline fonts (as Font_ListFonts would build them). */
function families(list) {
  return list.families((name) => !/^System\./.test(name));   // bitmap system font substitutes, not in Font$Path
}

export default async function start(task, ctx) {
  const [msgs, tpl] = await Promise.all([loadMessages('Chars'), loadTemplates('assets/templates/Chars.json'), loadSysFont(), loadFontList()]);
  const fm = await loadMessages('Fonts', { SystemFont: 'System Font', FontList: 'Font List' });
  const SYSTEM = msgs.lookup('Font');     // "System Font"
  let font = SYSTEM;                      // current font identifier
  let cssFont = null;
  const W = px(LM + 31 * MXSP + 16 + 16), H = px(TM + 7 * MYSP + 32 + 16);

  const win = await wimp.createWindowFromTemplate(tpl, 'Characters', { title: msgs.lookup('Tsk') }, task);
  win.setExtent({ w: W, h: H });

  // --------------------------------------------------------------- glyph atlas (system font)
  const atlas = document.createElement('canvas');
  atlas.width = 256 * 8; atlas.height = 16;
  {
    const g = atlas.getContext('2d');
    const img = g.createImageData(atlas.width, 16);
    const put = (x, y) => { for (const yy of [y * 2, y * 2 + 1]) { const o = (yy * atlas.width + x) * 4; img.data[o + 3] = 255; } };
    for (let c = 0; c < 256; c++) {
      let rows, inv = false;
      if (c < 32 || c === 127) { rows = sysFont.chars[c === 127 ? 63 : (c | 64)]; inv = true; } else rows = sysFont.chars[c];
      for (let y = 0; y < 8; y++) {
        let b = rows[y]; if (inv) b ^= 0xFF;
        for (let x = 0; x < 8; x++) if (b & (0x80 >> x)) put(c * 8 + x, y);
      }
    }
    g.putImageData(img, 0, 0);
  }

  const u = fontList.latin1ToUnicode ?? {};
  const uni = (c) => String.fromCharCode(u[c] ?? c);

  win.useCanvas((g, r) => {
    if (font === SYSTEM) {
      g.imageSmoothingEnabled = false;
      for (let y = 0; y < 8; y++) {
        const cy = px(TM) + y * px(MYSP);
        if (cy > r.y1 || cy + 16 < r.y0) continue;
        for (let x = 0; x < 32; x++) {
          const ch = y * 32 + x;
          g.drawImage(atlas, ch * 8, 0, 8, 16, px(LM) + x * px(MXSP), cy, 8, 16);
        }
      }
    } else {
      g.fillStyle = '#000';
      g.textBaseline = 'alphabetic';
      g.font = cssFont;
      for (let y = 1; y < 8; y++) {
        const base = px(TM + 24) + y * px(MYSP);
        if (base - 22 > r.y1 || base + 6 < r.y0) continue;
        for (let x = 0; x < 32; x++) {
          const ch = y * 32 + x;
          const s = uni(ch);
          g.save();
          g.translate(px(LM) + x * px(MXSP) + px(MXSP) / 2, base);
          g.scale(13 / 15, 1);                 // 13pt wide x 15pt high
          g.fillText(s, -g.measureText(s).width / 2, 0);
          g.restore();
        }
      }
    }
  }, { hiDPI: true });

  // --------------------------------------------------------------- hit testing / key entry
  const charAt = (wx, wy) => {
    const Y = Math.floor((wy * 2 - TM + ((MYSP - 32) >> 1)) / MYSP);
    if (Y < 0 || Y > 7) return -1;
    const X = Math.floor((wx * 2 - (LM + ((16 - MXSP) >> 1))) / MXSP);
    if (X < 0 || X > 31) return -1;
    return X + Y * 32;
  };
  const doChar = (ch) => { if (ch >= 0) wimp.processKey(ch); };

  win.on('click', (ev) => {
    if (ev.button === 'menu') { openFontMenu(ev); return true; }
    if (ev.button === 'select') doChar(charAt(ev.x, ev.y));
    return true;
  });
  win.on('helprequest', (ev) => {
    const w = win.screenToWork(ev.sx, ev.sy);
    const ch = charAt(w.x, w.y);
    ev.text = ch >= 0 ? msgs.lookup('Help', String(ch), ch.toString(16).toUpperCase().padStart(2, '0')) : '';
  });
  win.on('close', (ev) => { ev.preventDefault(); task.quit(); });

  // Shift over the window enters the character under the pointer (HotKey% = INKEY-1)
  let over = false, wasDown = false;
  win.on('pointerenter', () => { over = true; wasDown = shiftDown(); });
  win.on('pointerleave', () => { over = false; });
  const shiftDown = () => os.input?.isDown?.('ShiftLeft') || os.input?.isDown?.('ShiftRight');
  task.every(40, () => {
    if (!over) return;
    const down = shiftDown();
    if (down && !wasDown) {
      const p = win.screenToWork(os.input.mouseX, os.input.mouseY);
      if (p.x >= 0 && p.y >= 0 && p.x < win.w + win.scrollX && p.y < win.h + win.scrollY) doChar(charAt(p.x, p.y));
    }
    wasDown = down;
  });

  // --------------------------------------------------------------- font menu (Font_ListFonts)
  const setFont = async (name) => {
    if (name === font) return;
    font = name;
    if (name !== SYSTEM) {
      await fontList.load(name);
      cssFont = fontList.cssFor(name, 15 * 90 / 72) ?? os.fonts?.cssFor?.(name, 15);
    }
    win.invalidate();
  };
  const fontMenu = () => {
    const items = [{ text: SYSTEM, ticked: () => font === SYSTEM, action: () => setFont(SYSTEM), dotted: true }];
    for (const [fam, styles] of families(fontList)) {
      const full = (s) => (s ? `${fam}.${s}` : fam);
      const ticked = () => font === fam || font.startsWith(fam + '.');
      if (styles.length === 1 && !styles[0]) items.push({ text: fam, ticked, action: () => setFont(fam) });
      else {
        const sub = new Menu(fam, styles.map((s) => ({ text: s || fm.lookup('Regular'), ticked: () => font === full(s), action: () => setFont(full(s)) })));
        items.push({ text: fam, ticked, submenu: sub, action: () => setFont(full(styles[0])) });
      }
    }
    return new Menu(fm.lookup('FontList'), items);
  };
  const openFontMenu = async (ev) => { await fontList.ready(); wimp.menus.open(fontMenu(), ev.sx - px(102), ev.sy - px(64), { task }); };

  task.onMessage('Quit', () => task.quit());
  task.on('run', () => win.open({ behind: 'top' }));
  win.open({ behind: 'top' });
}
