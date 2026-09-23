// Interactive help for the core desktop components that do not answer Message_HelpRequest
// themselves in this implementation: window furniture (answered by !Help itself, tokens HelpI*),
// the icon bar device icons, the Filer's viewers / menus / boxes, the Task Manager, the Pinboard
// and the Display Manager. Texts are the original Messages tokens of those modules.

import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { loadMessages } from '../../core/messages.js';

const POOLS = ['Help', 'Filer', 'Pinboard', 'Switcher', 'ADFSFiler', 'RAMFSFiler', 'ResFiler', 'Display'];
let M = null;
export async function loadDesktopMessages() {
  const list = await Promise.all(POOLS.map((p) => loadMessages(p)));
  M = Object.fromEntries(POOLS.map((p, i) => [p, list[i]]));
  return M;
}
const has = (pool, t) => M?.[pool]?.has(t);
const look = (pool, t, ...a) => (has(pool, t) ? M[pool].lookup(t, ...a) : null);
/** First token that exists in pool. */
const first = (pool, toks, ...a) => { for (const t of toks) if (has(pool, t)) return M[pool].lookup(t, ...a); return null; };

// ------------------------------------------------------------------ window furniture (Help's own)
/** Help for a window tool at screen point (sx, sy), from the hit-test result; null if not a tool. */
export function furnitureHelp(hit) {
  const part = hit.part;
  if (!part || part === 'work' || part === 'blank' || !hit.window) return null;
  const H = (...t) => t.map((x) => look('Help', x) ?? '').join('');
  switch (part) {
    case 'back': return H('HelpI2');
    case 'close': return H('HelpI3');
    case 'title': return H('HelpI4', 'HelpI4a', 'HelpI4b');
    case 'toggle': return H('HelpI5', 'HelpI5a');
    case 'size': return H('HelpI9');
    case 'up': return H('HelpI6');
    case 'down': return H('HelpI8');
    case 'vwell': case 'vbar': case 'vscroll': return H('HelpI7');
    case 'left': return H('HelpI10');
    case 'right': return H('HelpI12');
    case 'hwell': case 'hbar': case 'hscroll': return H('HelpI11');
    default: return null;
  }
}

// ------------------------------------------------------------------ icon bar
export function iconbarHelp(item) {
  if (!item) return null;
  const drive = (item.text ?? '').replace(/^:/, '');
  switch (item.sprite) {
    case 'floppydisc': return look('ADFSFiler', 'F??FF', drive || '0');
    case 'harddisc': return look('ADFSFiler', 'H??FF', '4');
    case 'ramfs': return look('RAMFSFiler', 'F');
    case 'romapps': return look('ResFiler', 'HFF');
    case 'display': return look('Display', 'HB00');
    case 'switcher': return look('Switcher', 'HiFF');
    default: return null;
  }
}

// ------------------------------------------------------------------ menus
function filerMenuHelp(levels, lv, i, item) {
  const viewer = [...(os.filer?.viewers?.values() ?? [])].find((v) => v.win === wimp.menus.ctx?.window);
  const sel = viewer?.selection?.() ?? [];
  const one = sel.length === 1 ? sel[0] : null;
  const k = !sel.length ? '-' : sel.length > 1 ? 'S' : one.isApp ? (os.vfs.exists(one.path + '.!Help') ? 'H' : 'A') : one.type === 'dir' ? 'D' : 'F';
  const path = [];
  for (let l = 0; l < lv.level; l++) path.push(levels[l].subOpenFor);
  path.push(i);
  const d = path.join('');
  const shaded = !!(typeof item.shaded === 'function' ? item.shaded(item) : item.shaded);
  const g = shaded ? 'G' : '?';
  const kinds = k === 'H' ? ['H', 'A', '?'] : [k, '?'];
  const toks = [];
  for (const kk of kinds) toks.push(`MH${kk}${d}${g}`);
  if (shaded) for (const kk of kinds) toks.push(`MH${kk}${d}?`);
  return first('Filer', toks, one?.name ?? '');
}

/** Help for menu item i of level lv (core menus without their own help). */
export function menuHelp(lv, i) {
  const mm = wimp.menus;
  const levels = mm.levels;
  const item = lv.menu?.items[i];
  if (!item) return null;
  const owner = mm.owner?.name ?? '';
  const shaded = !!(typeof item.shaded === 'function' ? item.shaded(item) : item.shaded);
  const top = levels[0];
  const topI = lv.level > 0 ? top.subOpenFor : i;
  switch (owner) {
    case 'Filer': return filerMenuHelp(levels, lv, i, item);
    case 'ADFS Filer': {
      const P = /::0/.test(String(top.menu.title)) ? 'F' : 'H';
      if (lv.level === 0) return first('ADFSFiler', [`${P}?${shaded ? 'G' : 'N'}0${i + 1}`, `${P}?N0${i + 1}`]);
      if (topI === 0) return look('ADFSFiler', `${P}??11`);
      if (topI === 4) return look('ADFSFiler', `H??${i + 1}5`);
      return null;
    }
    case 'RAMFS Filer': return lv.level === 0 ? look('RAMFSFiler', String(i + 1)) : null;
    case 'Resource Filer': return look('ResFiler', 'H02');
    case 'Display Manager': return lv.level === 0 ? look('Display', `HM0${i}`) : null;
    case 'Task Manager': {
      if (lv.level === 0) {
        if (i === 2) {
          const name = /'(.*)'/.exec(String(typeof item.text === 'function' ? item.text(item) : item.text))?.[1];
          return name ? look('Switcher', 'HT03', name) : look('Switcher', 'H?03');
        }
        return look('Switcher', `H?0${i + 1}`);
      }
      if (topI === 1) return look('Switcher', 'H?12');
      if (topI === 2) { const name = /'(.*)'/.exec(String(top.menu.items[2].text))?.[1]; return look('Switcher', 'HT13', name ?? ''); }
      return null;
    }
    case 'Pinboard':
      if (lv.level === 0) return look('Pinboard', i === 0 ? 'PH0' : `PH${i}`);
      if (topI === 6) return look('Pinboard', `PH6${i}`);
      return null;
    default: return null;
  }
}

// ------------------------------------------------------------------ windows
export function windowHelp(hit) {
  const w = hit.window;
  if (!w) return null;
  const owner = w.task?.name ?? '';
  const name = (w.name ?? '').toLowerCase();
  if (owner === 'Filer') {
    if (name === 'fileinfo') return look('Filer', 'Infobox_Help_?');
    if (name === 'faccess') return look('Filer', 'Access_Help_?');
    if (name === 'xfer_send') { const i = hit.icon?.handle; return first('Filer', [i != null ? `Copysave_Help_${i}` : '', 'Copysave_Help_B'].filter(Boolean)); }
  }
  if (owner === 'Task Manager') {
    if (name === 'proginfo') return look('Switcher', 'H?11');
    return look('Switcher', 'H');
  }
  if (owner === 'Display Manager') {
    if (name === 'info') return look('Display', 'HI00');
    return look('Display', 'HDFF');
  }
  if (owner === 'Pinboard' && name === 'proginfo') return look('Pinboard', 'Hdb');
  return null;
}
