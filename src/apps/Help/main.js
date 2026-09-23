// !Help - interactive help (RISC OS 3.71 !Help 2.29, a BASIC program: Sources/Apps/Help/bas).
//
// While "helpful", every 10cs it reads the pointer position: over window furniture it shows its
// own HelpI* texts; otherwise it asks whatever is under the pointer for help (the core's
// wimp.helpAt, i.e. Message_HelpRequest), falling back to the desktop component texts in
// desktop.js, and for icon bar icons to "This is the <task> icon.". The reply is expanded
// (GSTrans |M newlines, \X tokens -> "T<X>" messages) and word-wrapped into up to 32 text icons
// in the "interactive" window, whose height follows the number of lines (at least 4).

import { wimp } from '../../core/wimp.js';
import { input } from '../../core/input.js';
import { os } from '../../core/os.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { textWidth, fonts } from '../../core/fonts.js';
import { loadDesktopMessages, furnitureHelp, iconbarHelp, menuHelp, windowHelp } from './desktop.js';

const MAXLINES = 32;
const LINE_DY = 20;           // (i_dy% + const%) = 40 OS units between lines
const LINE_H = 24;            // i_dy% = 48 OS units: height of one line icon
const PER_LINE_OS = 41;       // window height per line (i_dy% - 8 + 1)

/** Expand Help's "\X" tokens (message T<X>) and GSTrans control sequences; returns lines. */
export function expandHelp(text, M) {
  // GSTrans: |M (or |m) -> CR, |<char> -> control char, || -> |, |" -> "
  let s = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '|' && i + 1 < text.length) {
      const d = text[++i];
      if (d === '|') s += '|';
      else if (d === '"') s += '"';
      else if (d === '?') s += '\x7f';
      else if (d === '!') { const e = text[++i]; s += String.fromCharCode((e?.charCodeAt(0) ?? 0) | 0x80); }
      else s += String.fromCharCode(d.toUpperCase().charCodeAt(0) & 31);
      continue;
    }
    s += c;
  }
  // WRS token expansion: \\ -> \, \X -> message TX (unchanged if there is no such token)
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\' || i + 1 >= s.length) { out += s[i]; continue; }
    const d = s[++i];
    if (d === '\\') { out += '\\'; continue; }
    out += M.has('T' + d) ? M.lookup('T' + d) : '\\' + d;
  }
  return out;
}

export default async function start(task, ctx) {
  const [tpl, DM] = await Promise.all([loadTemplates('assets/templates/Help.json'), loadDesktopMessages()]);
  const M = DM.Help;
  const H = (t, ...a) => M.lookup(t, ...a);

  // ------------------------------------------------------------------ windows
  const win = task.createWindowFromTemplate(tpl, 'interactive', {});
  const line0 = win.icons[0];
  const lineX = line0.bbox.x0;
  win.deleteIcon(0);
  const top0 = win.y;
  const info = task.createWindowFromTemplate(tpl, 'info', {});
  info.icons[3]?.setText(H('HelpID'));

  let helpful = false;
  let shown = null;                 // the help text currently displayed (helpreceived$)
  let nlines = 0;

  const minLines = () => { const chars = Math.floor((win.w * 2) / 16); return Math.max(1, Math.ceil(256 / Math.max(1, chars))); };
  const resize = () => {
    const l = Math.max(minLines(), nlines);
    const h = Math.round((l * PER_LINE_OS) / 2);
    win.setExtent({ x0: win.extent.x0, y0: 0, x1: win.extent.x1, y1: h });
    if (win.isOpen) win.open({ h, behind: 'keep' });
    else win.h = h;
  };

  function display(text) {
    text = text ?? '';
    if (text === shown) return;
    shown = text;
    for (let i = win.icons.length - 1; i >= 0; i--) if (win.icons[i]) win.deleteIcon(i);
    const t = expandHelp(text, M);
    const maxW = win.w;
    const lines = [];
    for (const para of t.split(/[\r\n]/)) {
      let rest = para;
      for (;;) {
        if (textWidth(rest, fonts.css) + 8 < maxW) { lines.push(rest); break; }
        // break at the last space that fits
        let cut = -1;
        for (let k = rest.indexOf(' '); k >= 0; k = rest.indexOf(' ', k + 1)) {
          if (textWidth(rest.slice(0, k), fonts.css) + 8 < maxW) cut = k; else break;
        }
        if (cut <= 0) { let k = rest.length; while (k > 1 && textWidth(rest.slice(0, k), fonts.css) + 8 >= maxW) k--; cut = k; lines.push(rest.slice(0, cut)); rest = rest.slice(cut); } else { lines.push(rest.slice(0, cut)); rest = rest.slice(cut + 1); }
        if (!rest) break;
      }
    }
    if (lines.length && lines[lines.length - 1] === '' && t.endsWith('\r')) lines.pop();
    nlines = Math.min(MAXLINES, t ? lines.length : 0);
    for (let n = 0; n < nlines; n++) {
      win.addIcon({ x: lineX, y: n * LINE_DY, w: Math.ceil(textWidth(lines[n], fonts.css)) + 8, h: LINE_H, text: lines[n], vcentre: true, fg: 7, bg: 0 });
    }
    resize();
  }

  // ------------------------------------------------------------------ what's under the pointer
  function helpFor(sx, sy) {
    const hit = wimp.hitTest(sx, sy);
    if (!hit.window && !hit.element?.closest?.('.menu')) return '';
    // Help's own windows and icon
    if (hit.window === win) return H('HelpH2');
    if (hit.window === info) return H('HelpH4');
    // window furniture: Help answers itself (Wimp_GetPointerInfo icon -2..-13)
    const fh = furnitureHelp(hit);
    if (fh != null) return fh;
    // an open menu: its item help, else the desktop components' texts
    const menuEl = hit.element?.closest?.('.menu');
    if (menuEl) {
      const lv = wimp.menus.levels.find((l) => l.win.el === menuEl);
      if (lv && !lv.isDbox) {
        const i = wimp.menus._rowAt(lv, sy);
        if (i < 0) return '';
        if (wimp.menus.owner === task) return i === 0 ? H('Mnu01') : H('Mnu02');
        const h = wimp.helpAt(sx, sy);
        if (h) return h;
        return menuHelp(lv, i) ?? '';
      }
    }
    // Message_HelpRequest
    const h = wimp.helpAt(sx, sy);
    if (h) return h;
    if (hit.window?._isIconbar) {
      const item = hit.icon?._ib;
      if (!item) return '';
      if (item.task === task) return H('HelpH1');
      return iconbarHelp(item) ?? H('HelpH3', item.task?.name ?? '');
    }
    return windowHelp(hit) ?? '';
  }

  const poll = () => {
    if (!helpful) return;
    let text = '';
    try { text = helpFor(input.mouseX, input.mouseY); } catch (e) { console.warn('Help:', e); }
    display(text);
  };
  task.every(100, poll);

  function front() {
    helpful = true;
    shown = null;
    display('');
    resize();
    win.open({ x: win.x, y: top0, behind: 'top' });
  }
  win.on('close', (ev) => { ev.preventDefault(); helpful = false; win.close(); });
  win.on('open', (ev) => { ev.preventDefault(); const rewrap = ev.w !== win.w; win.open({ ...ev, h: win.h }); if (rewrap) { const t = shown; shown = null; display(t); } });
  win.on('key', (ev) => { if (ev.code === 0x181) { win.close(); helpful = false; return true; } return false; });

  // ------------------------------------------------------------------ icon bar
  const menu = new Menu(H('H'), [
    { text: H('I'), submenu: info, help: () => H('Mnu01') },
    { text: H('Q'), action: () => task.quit(), help: () => H('Mnu02') },
  ]);
  task.addIconbarIcon({
    sprite: H('SN').toLowerCase(),
    side: 'right',
    onClick: (ev) => { if (ev.button !== 'menu') front(); },
    menu: () => menu,
    help: () => H('HelpH1'),
  });
  task.onMessage('Quit', () => task.quit());
  task.on('run', () => front());

  // Help$Options: "I" (default) = interactive help on at start, "~I" = off
  const optStr = os.sysvars?.get('Help$Options') ?? 'I';
  if (!/~\s*i/i.test(optStr)) front();
}
