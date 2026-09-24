// !Calc - the four-function desktop calculator of Arthur 1.2, RISC OS 2 and RISC OS 3.0/3.1.
//
// Recreated from the RISC OS 2 Applications 2 disc copy (version 0.40, 03-Nov-88: its BASIC !RunImage and
// Template) and the RISC OS 3 Applications Guide (keyboard use). The window is built from a Wimp template in
// the JSON template format (Templates.json next to this file): 17 key icons at the original positions and
// colours, plus a right-justified text icon for the display (the original PRINTed the display in its redraw loop,
// at the same place). The arithmetic follows the original PROCdigit / PROCpoint / PROCoperator / PROCdisplay:
//
//  * immediate execution: each operator key works out <previous result> <pending operator> <display>
//    (so 2+3x4 = 20), like a pocket calculator; "=" just finishes the pending operation;
//  * up to 8 digits are entered; results are rounded to 7 decimal places (@% = &01020711, STR$ then EVAL),
//    trailing zeros dropped and cut to 8 digits (plus point and sign);
//  * a result of 100000000 or more, or a division by zero, shows "Error"; then only C (or Delete) works.
// There are no memory, percent or sign-change keys: the original had none.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { input } from '../../core/input.js';
import { infoBox } from '../../core/dialogs.js';
import { loadTemplates } from '../../core/templates.js';

const TEMPLATES = new URL('./Templates.json', import.meta.url).href;

let sysfont = null;
const systemFont = () => (sysfont ??= fetch('assets/fonts/system8x8.json').then((r) => r.json()).then((j) => j.chars).catch(() => null));

// BBC BASIC V reals are 5 bytes: a 32-bit mantissa. Round a JS double to that precision.
export function basicReal(x) {
  if (!x || !Number.isFinite(x)) return x;
  const e = Math.floor(Math.log2(Math.abs(x))) + 1;
  const s = 2 ** (32 - e);
  return Math.round(x * s) / s;
}

/** STR$ with @% = &01020711 (fixed format, 7 decimal places). */
const str7 = (x) => {
  let s = x.toFixed(7);
  if (/^-0\.0*$/.test(s)) s = s.slice(1);
  return s;
};

class CalcError extends Error {}

/** The calculator's registers and key actions (the original's PROCs). */
export class Calculator {
  constructor() { this.clear(); }
  clear() { this.error = false; this.tempreg = 0; this.entry = '0'; this.op = '='; this.dreg = this.entry; }
  digit(k) {
    if (this.entry.length - (this.entry.includes('.') ? 1 : 0) < 8) this.entry = this.entry === '0' ? k : this.entry + k;
    this.dreg = this.entry;
  }
  point() {
    if (!this.entry.includes('.') && this.entry.length < 8) this.entry += '.';
    this.dreg = this.entry;
  }
  static val(s) { const v = parseFloat(s); return Number.isFinite(v) ? basicReal(v) : 0; }
  static evaluate(a, op, b) {
    // EVAL(STR$tempreg + operator$ + dreg$)
    const x = Calculator.val(a), y = Calculator.val(b);
    let r;
    switch (op) {
      case '+': r = x + y; break;
      case '-': r = x - y; break;
      case '*': r = x * y; break;
      case '/': if (y === 0) throw new CalcError('Division by zero'); r = x / y; break;
      default: r = y;
    }
    if (!Number.isFinite(r)) throw new CalcError('Number too big');
    return basicReal(r);
  }
  operator(k) {
    this.tempreg = this.op === '=' ? Calculator.val(this.dreg) : Calculator.evaluate(str7(this.tempreg), this.op, this.dreg);
    this.display(str7(this.tempreg));
    this.entry = '0'; this.op = k;
  }
  display(v) {
    if (Math.abs(parseFloat(v)) >= 100000000) throw new CalcError('Division by zero');     // displayreg=0/0
    if (v.includes('.')) v = v.replace(/0+$/, '');
    v = v.slice(0, 8 + (v.includes('.') ? 1 : 0) + (v.includes('-') ? 1 : 0));
    if (v.endsWith('.')) v = v.slice(0, -1);
    if (v === '-0') v = '0';
    this.dreg = v;
  }
  /** One key (icon number 0-16 of the template). Returns the display text. */
  press(icon) {
    if (this.error) { if (icon === 16) this.clear(); return this.dreg; }
    try {
      if (icon >= 0 && icon <= 9) this.digit(String(icon));
      else if (icon === 10) this.point();
      else if (icon >= 11 && icon <= 15) this.operator('=+-*/'[icon - 11]);
      else if (icon === 16) this.clear();
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = true; this.dreg = 'Error';          // ON ERROR LOCAL errorflag%=TRUE: dreg$="Error"
    }
    return this.dreg;
  }
}

// keyboard (RISC OS 3 Applications Guide: numeric keypad, Enter = equals, Delete = Clear)
const KEYS = { '.': 10, '=': 11, 13: 11, '+': 12, '-': 13, '*': 14, x: 14, X: 14, '/': 15, 127: 16, 8: 16, c: 16, C: 16 };

export default async function start(task, ctx) {
  const info = ctx.app.info;
  const [tpl, font] = await Promise.all([loadTemplates(TEMPLATES), systemFont()]);
  const calc = new Calculator();
  const win = task.createWindowFromTemplate(tpl, 'Calculator');
  // PROCcalc: SYS Col%,0: RECTANGLE FILL bx%+12,by%-28,10*16,-32 : SYS Col%,7: MOVE bx%+12+16*(10-LENdreg$),by%-28: PRINT dreg$
  const disp = document.createElement('canvas');
  disp.width = 80; disp.height = 16;
  disp.className = 'calc-display';
  disp.style.cssText = 'position:absolute;left:6px;top:14px;width:80px;height:16px;pointer-events:none;image-rendering:pixelated';
  win.work.appendChild(disp);
  const g = disp.getContext('2d');
  let shown = '';
  const show = () => {
    shown = calc.dreg;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 80, 16);
    g.fillStyle = '#000000';
    let x = 8 * (10 - shown.length);
    for (const ch of shown) {
      const rows = font?.[ch.charCodeAt(0) & 255] ?? [];
      for (let r = 0; r < 8; r++) for (let b = 0; b < 8; b++) if (rows[r] & (0x80 >> b)) g.fillRect(x + b, r, 1, 1);
      x += 8;
    }
  };
  show();

  const pressIcon = (i) => { calc.press(i); show(); };
  win.on('click', (ev) => {
    if (ev.button === 'menu') return true;                       // no window menu in the original
    const i = ev.iconIndex;
    if (i != null && i >= 0 && i <= 16) pressIcon(i);
    else wimp.setCaret(win);                                     // elsewhere (the display): input focus
    return true;
  });
  win.on('key', (ev) => {
    const c = ev.code;
    let i = c >= 48 && c <= 57 ? c - 48 : (KEYS[ev.char] ?? KEYS[c]);
    if (i == null) return false;
    pressIcon(i);
    return true;
  });

  // Close: remember where the window was (its bottom-left corner), keep the icon on the icon bar.
  // The first opening puts the window's bottom-left corner where the pointer was when Calc started.
  let pos = { x: input.mouseX ?? wimp.width / 2, bottom: input.mouseY ?? wimp.height / 2 };
  win.on('close', (ev) => { ev.preventDefault(); pos = { x: win.x, bottom: win.y + win.h }; win.close(); });
  const open = () => {
    if (win.isOpen) { win.open({ behind: 'top' }); return; }      // PROCfront
    const r = wimp.screenRect(true);
    const x = Math.max(4, Math.min(Math.round(pos.x), r.w - win.w - 24));
    const y = Math.max(40, Math.min(Math.round(pos.bottom - win.h), r.h - win.h - 4));
    win.open({ x, y, w: win.w, h: win.h, behind: 'top' });
  };

  let infoWin = null;
  const menu = () => new Menu('Calculator', [
    { text: 'Info', submenu: () => (infoWin ??= infoBox(task, info)) },
    { text: 'Quit', action: () => task.quit() },
  ]);
  task.addIconbarIcon({
    sprite: '!calc',
    onClick: (ev) => { if (ev.button !== 'menu') open(); },
    menu,
    help: 'This is the Calculator.|MClick SELECT to open the Calculator window.',
  });
  win.helpText = 'This is the Calculator window.|MClick on the keys (or type on the numeric keypad after clicking on the display) to calculate.|MEnter is =, Delete is C.';
  task.onMessage('Quit', () => task.quit());
  task.calc = { calc, win, press: pressIcon, open, get display() { return shown; }, displayCanvas: disp };
}
