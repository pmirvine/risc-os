// Desktop configuration (the CMOS settings a !Configure app would change). Persisted in localStorage.
//
//   os.config.get(key) / os.config.set(key, value)
//   keys: zoom (1|2|..), rightButton ('menu'|'adjust'), textured (bool), wimpFont ('homerton'|'system'),
//         wimpFlags (number, *Configure WimpFlags), doubleClickDelay (cs), dragDelay (cs), dragMove (OS units)
//   Added for !Configure (see docs/CHANGES_NEEDED.md): wimpFont may also be any RISC OS font name
//   ('Trinity.Medium'); doubleClickMove (OS units); beepLoud, speaker (bool) and volume (0-7) scale wimp.beep();
//   mode ({width,height} | null) is applied once at boot. Unknown keys may be stored in values + save().

import { wimp } from './wimp.js';
import { input } from './input.js';
import { fonts } from './fonts.js';
import { configureSound } from './sound/index.js';

const KEY = 'riscos371.config';
const DEFAULTS = { zoom: 1, rightButton: 'menu', textured: true, wimpFont: 'homerton', wimpFlags: 0b01101111, doubleClickDelay: 10, dragDelay: 5, dragMove: 16,
  doubleClickMove: 32, beepLoud: true, speaker: true, volume: 7, mode: null };

export const config = {
  values: { ...DEFAULTS },
  load() {
    try { Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* */ }
    if (localStorage.getItem('riscos.zoom')) this.values.zoom = +localStorage.getItem('riscos.zoom');
    if (localStorage.getItem('riscos.rightIsAdjust') === '1') this.values.rightButton = 'adjust';
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* */ } },
  get(k) { return this.values[k]; },
  /** Apply all settings to the running desktop. */
  apply() {
    const v = this.values;
    input.config.rightIsAdjust = v.rightButton === 'adjust';
    wimp.config.textured = !!v.textured;
    wimp.config.offScreen = v.wimpFlags & (1 << 6) ? 'all' : v.wimpFlags & (1 << 5) ? 'all' : 'none';
    fonts.system = v.wimpFont === 'system';
    // any other outline font as the desktop font (Wimp$Font)
    const fn = /^(system|homerton)$/i.test(v.wimpFont ?? '') ? 'Homerton.Medium' : String(v.wimpFont);
    const css = fonts.cssFor(fn, 12).match(/^(italic )?(\d+) [\d.]+px (.*)$/);
    if (css) { fonts.family = css[3]; fonts.weight = css[2] === '400' ? '' : css[2]; fonts.style = css[1] ? 'italic' : ''; }
    if (wimp.screen) wimp.screen.style.font = fonts.css;
    input.config.doubleClickMs = (v.doubleClickDelay ?? 10) * 40;
    input.config.doubleClickMove = (v.doubleClickMove ?? 32) / 2;
    input.config.dragMove = (v.dragMove ?? 16) / 2;
    input.config.dragDelayMs = (v.dragDelay ?? 5) * 100;
    wimp.config.solidDrags = !!(v.wimpFlags & 1);
    wimp.config.errorBeep = !(v.wimpFlags & (1 << 4));
    wimp.config.beepGain = v.speaker === false ? 0 : (v.beepLoud === false ? 0.03 : 0.08) * ((v.volume ?? 7) + 1) / 8;
    configureSound({ volume: v.volume ?? 7, speaker: v.speaker !== false, loud: v.beepLoud !== false, voice: v.voice ?? 1 });   // SoundCMOS, BELLinfo
    if (v.mode && !this._modeApplied && wimp.setMode) wimp.setMode(v.mode, { greys: !!v.modeGreys });
    this._modeApplied = true;
    if ((wimp.zoom ?? 1) !== v.zoom) wimp.setScale(v.zoom);
    for (const w of wimp.windows) { for (const ic of w.icons) ic?.render(); w._layout(); }
  },
  /** Set a value (accepts *Configure style keywords too). Returns true if known. */
  set(k, val) {
    const key = String(k).toLowerCase();
    const s = String(val ?? '').trim();
    const map = {
      zoom: () => { this.values.zoom = Math.max(1, Math.min(4, parseFloat(s) || 1)); },
      buttons: () => { this.values.rightButton = /adjust/i.test(s) ? 'adjust' : 'menu'; },
      rightbutton: () => map.buttons(),
      textured: () => { this.values.textured = !/^(0|off|no|false)$/i.test(s); },
      wimpfont: () => { this.values.wimpFont = s === '1' || /system/i.test(s) ? 'system' : /^[a-z]+\.[a-z.]+$/i.test(s) ? s : 'homerton'; },
      wimpdoubleclickmove: () => { this.values.doubleClickMove = parseInt(s, 10) || 32; },
      wimpflags: () => { this.values.wimpFlags = parseInt(s, 10) & 255; },
      wimpdoubleclickdelay: () => { this.values.doubleClickDelay = parseInt(s, 10) || 10; input.config.doubleClickMs = this.values.doubleClickDelay * 100 * 0.4; },
      wimpdragdelay: () => { this.values.dragDelay = parseInt(s, 10) || 5; },
      wimpdragmove: () => { this.values.dragMove = parseInt(s, 10) || 16; input.config.dragMove = this.values.dragMove / 2; },
    };
    if (!map[key]) return false;
    map[key]();
    this.save();
    this.apply();
    return true;
  },
};
