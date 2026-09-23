// The RISC OS 3.6+ ColourPicker dialogue (ColourPicker_OpenDialogue, transient, as a submenu),
// as used by Draw 3.71's dboxtcol for Line colour / Fill colour / Text colour / Background.
// Built from the ColourPicker module's own templates (assets/templates/Picker.json + Picker-RGB.json).
// Only the RGB colour model is implemented (the CMYK/HSV radio buttons are shaded).
//
//   const w = await colourPicker({ task, title: 'Line colour', colour, allowTransparent: true,
//                                  onChoose: (c) => ... });   // c = 0xBBGGRR00 or 0xFFFFFFFF (none)
//   use w as a menu submenu (dialogue box).

import { loadTemplates } from '../../core/templates.js';
import { templateIconToSpec } from '../../core/icons.js';
import { wimp } from '../../core/wimp.js';
import { sprites } from '../../core/sprites.js';
import { WIMP_COLOURS } from '../../core/palette.js';

const TRANSPARENT = 0xFFFFFFFF;
const PANE_DX = 24, PANE_DY = 2;      // RGB model pane origin in the Picker window (OS units)

// main window icons
const I_PATCH = 0, I_RGB = 1, I_NONE = 2, I_CMYK = 5, I_HSV = 6, I_CANCEL = 8, I_OK = 9;

let T = null;
/** Load the ColourPicker templates and sprites (call once before colourPicker). */
export async function preloadPicker() {
  if (T) return T;
  const [main, rgb, spr] = await Promise.all([loadTemplates('assets/templates/Picker.json'), loadTemplates('assets/templates/Picker-RGB.json'), sprites.loadManifest('Picker', 'Sprites')]);
  T = { main, rgb, spr };
  return T;
}

/** Create the picker dialogue (synchronous: usable directly as a submenu). */
export function colourPicker({ task, title, colour, allowTransparent = true, onChoose }) {
  if (!T) throw new Error('ColourPicker not loaded');
  const { main, rgb } = T;
  const w = wimp.createWindowFromTemplate(main, 'picker', { title }, task);
  const crosshatch = T.spr.get('crosshatch');
  // add the RGB model's icons, translated into place
  const rw = rgb.windows.rgb;
  const map = {};
  rw.icons.forEach((ic, i) => {
    if (ic.bbox.y0 < -900) return;   // icons parked outside the pane's extent
    const spec = templateIconToSpec({ ...ic, bbox: { x0: ic.bbox.x0 + PANE_DX, y0: ic.bbox.y0 + PANE_DY, x1: ic.bbox.x1 + PANE_DX, y1: ic.bbox.y1 + PANE_DY } });
    const icon = w.addIcon(spec);
    const name = /N0\/([A-Za-z0-9]+)/.exec(ic.validation ?? '')?.[1];
    if (name) map[name] = icon;
  });
  const I = w.icons;
  I[I_CMYK].setState({ shaded: true });
  I[I_HSV].setState({ shaded: true });
  I[I_RGB].setState({ selected: true });
  if (!allowTransparent) I[I_NONE].setState({ shaded: true });

  // state
  let none = (colour >>> 0) === TRANSPARENT;
  let v = none ? [0, 0, 0] : [(colour >>> 8) & 255, (colour >>> 16) & 255, (colour >>> 24) & 255].map((c) => c / 255 * 100);
  let slice = 0;     // 0 red, 1 green, 2 blue: the component on the Z slider
  const names = ['Red', 'Green', 'Blue'];
  const knobCol = [11, 10, 8];

  // overlays (true-colour areas)
  const overlay = (icon, inset = 0) => {
    const c = document.createElement('canvas');
    const b = icon.bbox;
    c.width = Math.max(1, b.x1 - b.x0 - 2 * inset); c.height = Math.max(1, b.y1 - b.y0 - 2 * inset);
    Object.assign(c.style, { position: 'absolute', left: b.x0 + inset + 'px', top: b.y0 + inset + 'px', pointerEvents: 'none', imageRendering: 'pixelated' });
    w.work.appendChild(c);
    return c;
  };
  const sliceC = overlay(map.Slice);
  const patchC = overlay(I[I_PATCH], 2);
  let hatch = null;
  if (crosshatch) crosshatch.canvas().then((c) => { hatch = c; draw(); });

  const axes = () => { const o = [0, 1, 2].filter((i) => i !== slice); return { x: o[0], y: o[1] }; };
  const toColour = () => (none ? TRANSPARENT : ((Math.round(v[2] * 2.55) << 24) | (Math.round(v[1] * 2.55) << 16) | (Math.round(v[0] * 2.55) << 8)) >>> 0);
  const css = () => `rgb(${v.map((c) => Math.round(c * 2.55)).join(',')})`;

  function draw() {
    // the XY slice at the current Z value
    const g = sliceC.getContext('2d');
    const W = sliceC.width, H = sliceC.height;
    const img = g.createImageData(W, H);
    const { x, y } = axes();
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = [0, 0, 0];
        c[slice] = v[slice] * 2.55; c[x] = i / (W - 1) * 255; c[y] = (1 - j / (H - 1)) * 255;
        const o = (j * W + i) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // crosshair at the current point
    const px = Math.round(v[x] / 100 * (W - 1)), py = Math.round((1 - v[y] / 100) * (H - 1));
    g.fillStyle = (v[0] + v[1] + v[2]) / 3 > 50 ? '#000' : '#fff';
    g.fillRect(px - 4, py, 9, 1); g.fillRect(px, py - 4, 1, 9);
    // patch
    const p = patchC.getContext('2d');
    if (none) {
      p.fillStyle = '#ffffff'; p.fillRect(0, 0, patchC.width, patchC.height);
      if (hatch) { p.fillStyle = p.createPattern(hatch, 'repeat'); p.fillRect(0, 0, patchC.width, patchC.height); }
    } else { p.fillStyle = css(); p.fillRect(0, 0, patchC.width, patchC.height); }
    // knobs
    const setKnob = (track, knob, frac, vertical, col) => {
      if (!track || !knob) return;
      const t = track.bbox;
      if (vertical) knob.moveTo({ x0: t.x0, x1: t.x1, y1: t.y1, y0: Math.round(t.y1 - (t.y1 - t.y0) * frac) });
      else knob.moveTo({ x0: t.x0, y0: t.y0, y1: t.y1, x1: Math.round(t.x0 + (t.x1 - t.x0) * frac) });
      knob.setState({ bg: col });
    };
    setKnob(map.ZTrack, map.ZKnob, v[slice] / 100, true, knobCol[slice]);
    setKnob(map.XTrack, map.XKnob, v[x] / 100, false, knobCol[x]);
    setKnob(map.YTrack, map.YKnob, v[y] / 100, true, knobCol[y]);
    // fields and radios
    names.forEach((n, i) => {
      const f = map[n + 'Percent'];
      if (f && wimp.caret?.icon !== f) f.setText(v[i].toFixed(1));
      map[n + 'Slice']?.setState({ selected: i === slice });
    });
    I[I_NONE].setState({ selected: none });
  }

  const setFrom = (i, val) => { v[i] = Math.max(0, Math.min(100, val)); none = false; draw(); };
  const pickXY = (wx, wy) => {
    const b = map.Slice.bbox;
    const { x, y } = axes();
    v[x] = Math.max(0, Math.min(100, (wx - b.x0) / (b.x1 - b.x0 - 1) * 100));
    v[y] = Math.max(0, Math.min(100, (1 - (wy - b.y0) / (b.y1 - b.y0 - 1)) * 100));
    none = false;
    draw();
  };
  const pickZ = (wy) => { const t = map.ZTrack.bbox; setFrom(slice, (t.y1 - wy) / (t.y1 - t.y0) * 100); };
  const pickX = (wx) => { const t = map.XTrack.bbox; setFrom(axes().x, (wx - t.x0) / (t.x1 - t.x0) * 100); };
  const pickY = (wy) => { const t = map.YTrack.bbox; setFrom(axes().y, (t.y1 - wy) / (t.y1 - t.y0) * 100); };
  const inIcon = (ic, x, y) => ic && x >= ic.bbox.x0 && x < ic.bbox.x1 && y >= ic.bbox.y0 && y < ic.bbox.y1;
  const dragArea = (ev, fn) => {
    import('../../core/input.js').then(({ startPointerDrag }) => startPointerDrag(ev.pointerEvent ?? {}, {
      onMove: (q) => { const p = w.screenToWork(q.x, q.y); fn(p.x, p.y); },
    }));
  };
  const areaAt = (x, y) => {
    if (inIcon(map.XYWell, x, y)) return (px, py) => pickXY(px, py);
    if (inIcon(map.ZWell, x, y)) return (px, py) => pickZ(py);
    if (inIcon(map.XTrack, x, y) || inIcon(map.XKnob, x, y)) return (px) => pickX(px);
    if (inIcon(map.YTrack, x, y) || inIcon(map.YKnob, x, y)) return (px, py) => pickY(py);
    return null;
  };

  const choose = (keepOpen) => {
    const c = toColour();
    if (!keepOpen) { wimp.menus.close(); w.close(); }
    onChoose?.(c);
  };

  w.on('click', (ev) => {
    if (ev.button === 'menu') return true;
    const ic = ev.icon;
    const a = areaAt(ev.x, ev.y);
    if (a) { a(ev.x, ev.y); return true; }
    if (!ic) return true;
    if (ic === I[I_OK]) { choose(ev.button === 'adjust'); return true; }
    if (ic === I[I_CANCEL]) { wimp.menus.close(); w.close(); return true; }
    if (ic === I[I_NONE]) { if (allowTransparent) { none = !none; draw(); } return true; }
    for (let i = 0; i < 3; i++) {
      if (ic === map[names[i] + 'Slice']) { slice = i; draw(); return true; }
      if (ic === map[names[i] + 'Up']) { setFrom(i, Math.floor(v[i] + 1)); return true; }
      if (ic === map[names[i] + 'Down']) { setFrom(i, Math.ceil(v[i] - 1)); return true; }
    }
    for (let n = 0; n < 16; n++) {
      if (ic === map['Colour' + n]) {
        const h = WIMP_COLOURS[n];
        v = [1, 3, 5].map((o) => parseInt(h.substr(o, 2), 16) / 2.55);
        none = false;
        draw();
        return true;
      }
    }
    return true;
  });
  w.on('drag', (ev) => { const a = areaAt(ev.x, ev.y); if (a) dragArea(ev, a); return true; });
  w.on('iconchanged', (ev) => {
    for (let i = 0; i < 3; i++) if (ev.icon === map[names[i] + 'Percent']) { const n = parseFloat(ev.icon.text); if (!isNaN(n)) { v[i] = Math.max(0, Math.min(100, n)); none = false; draw(); } }
  });
  w.on('key', (ev) => {
    if (ev.code === 13) { choose(false); return true; }
    if (ev.code === 27) { wimp.menus.close(); w.close(); return true; }
    return false;
  });
  w.on('menuclosed', () => w.delete());
  draw();
  return w;
}
