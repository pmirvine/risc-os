// The !Lander2 application icon (!Sprites and !Sprites22), used by tools/disc-lander2.mjs.
//
// The picture: Lander's hoverplane (the green dart of the original) flying over chequered land seen in
// perspective, with the grey launch pad, a strip of sea, patches of red virus spreading over the land,
// the ship's black shadow and a trail of exhaust sparks. It is drawn as flat polygons on a 34 x 34 design
// grid, rendered with 4 x 4 supersampling:
//   !Sprites22: '!lander2' 68 x 68 and 'sm!lander2' 36 x 36, 32 bits per pixel at 180 dpi (so they take
//               the room of a 34 x 34 / 18 x 18 icon and stay sharp on high-resolution screens);
//   !Sprites:   the same at 34 x 34 and 18 x 18 in 16 Wimp colours, mode 27 (square pixels).
import { newSprite, writeSpriteFile } from '../../src/apps/Paint/spritefile.js';

// ---------------------------------------------------------------- the picture, in design units (0-34)
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** [{ pts: [[x, y]...] (convex), colour: [r, g, b] }] in painting order. */
function scene() {
  const polys = [];
  const add = (pts, colour) => polys.push({ pts, colour: typeof colour === 'string' ? hex(colour) : colour });
  // the land: rows of tiles from the horizon (y 15) to the bottom, widening towards the front
  const edges = [14.6, 16.5, 18.8, 21.7, 25.3, 29.3, 31.6];
  const half = (y) => 10 + (y - 14.6) * 0.41;
  const N = 8;
  const colX = (i, y) => 17 + ((i - N / 2) / (N / 2)) * half(y);
  // which tiles are what: s sea, p pad, v virus (two shades), else land
  const MAP = [
    'ssvvsss.',
    '.vVv..ss',
    'vVv.....',
    '.v..pp..',
    '...pp..v',
    '.......V',
  ];
  for (let r = 0; r < edges.length - 1; r++) {
    const y0 = edges[r], y1 = edges[r + 1];
    const light = r * 9;                   // nearer rows are brighter (as Lander's)
    for (let i = 0; i < N; i++) {
      const kind = MAP[r][i];
      const odd = (i + r) % 2;
      let c;
      if (kind === 's') c = odd ? [30, 70, 200] : [40, 90, 220];
      else if (kind === 'p') c = odd ? [150, 150, 158] : [175, 175, 184];
      else if (kind === 'v') c = odd ? [150, 62, 30] : [176, 74, 36];
      else if (kind === 'V') c = odd ? [196, 40, 24] : [214, 56, 30];
      else c = odd ? [46, 140, 36] : [70, 170, 46];
      c = c.map((v) => Math.min(255, v + light));
      add([[colX(i, y0), y0], [colX(i + 1, y0), y0], [colX(i + 1, y1), y1], [colX(i, y1), y1]], c);
    }
  }
  // the front edge of the land, a slab of earth (as the edge of Lander's view)
  const yb = edges[edges.length - 1];
  add([[colX(0, yb), yb], [colX(N, yb), yb], [colX(N, yb) - 0.4, yb + 2.2], [colX(0, yb) + 0.4, yb + 2.2]],
    [92, 58, 30]);
  // the ship's shadow on the land
  const shadow = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    shadow.push([17 + 6 * Math.cos(a), 26.6 + 1.4 * Math.sin(a)]);
  }
  add(shadow, [10, 16, 10]);
  // exhaust sparks under the ship
  for (const [x, y, c] of [[16.2, 14.2, '#ffee66'], [17.6, 15.6, '#ffaa22'], [15.6, 16.9, '#ff7711'],
    [17.1, 18.3, '#ffcc33'], [18.4, 19.8, '#ee4411'], [16.3, 21.2, '#ff9922'], [17.7, 23, '#cc3311']]) {
    add([[x, y], [x + 1.1, y], [x + 1.1, y + 1.1], [x, y + 1.1]], c);
  }
  // the ship, seen from above and behind: a low pyramid with a pointed nose (Lander's blueprint)
  const nose = [17, 2], left = [4, 10.4], right = [30, 10.4], peak = [17, 7.2];
  const tail = [17, 12.4], under = [17, 13.4];
  const grow = (p, k) => [17 + (p[0] - 17) * k, 8 + (p[1] - 8) * k];
  // a dark outline first: the silhouette, a little larger
  add([grow(nose, 1.12), grow(left, 1.07), grow(under, 1.12), grow(right, 1.07)], [8, 24, 16]);
  add([left, under, right], '#1a8a88');              // the underside, just showing
  add([left, nose, peak], '#b4f0a0');                 // the upper faces, lit from the left
  add([nose, right, peak], '#78d064');
  add([left, peak, tail], '#58b048');
  add([peak, right, tail], '#34893a');
  return polys;
}

// ---------------------------------------------------------------- rendering
/** RGBA pixels (with alpha from coverage) of the picture at size x size. */
function render(size, SS = 4) {
  const n = size * SS, k = n / 34;
  const buf = new Int16Array(n * n).fill(-1);          // polygon index per sample
  const polys = scene();
  polys.forEach((p, idx) => {
    const pts = p.pts.map(([x, y]) => [x * k, y * k]);
    const ys = pts.map((q) => q[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(n - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
          const x = ax + ((cy - ay) * (bx - ax)) / (by - ay);
          lo = Math.min(lo, x); hi = Math.max(hi, x);
        }
      }
      for (let x = Math.max(0, Math.ceil(lo - 0.5)); x < Math.min(n, Math.ceil(hi - 0.5)); x++) buf[y * n + x] = idx;
    }
  });
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const idx = buf[(y * SS + j) * n + x * SS + i];
          if (idx < 0) continue;
          const c = polys[idx].colour;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = (y * size + x) * 4;
      if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = (a * 255) / (SS * SS); }
    }
  }
  return out;
}

// A 32 bpp sprite at 180 dpi (the mode word of a "new format" sprite: type 6, 180 x 180 dpi).
function sprite32(name, size) {
  const rgba = render(size);
  const s = newSprite({ name, w: size, h: size, mode: ((6 << 27) | (180 << 14) | (180 << 1) | 1) >>> 0, mask: true });
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    s.px[i] = (rgba[o] | (rgba[o + 1] << 8) | (rgba[o + 2] << 16)) >>> 0;
    s.mask[i] = rgba[o + 3] >= 110 ? 1 : 0;
  }
  return s;
}

// A 16-colour sprite in mode 27, each pixel the nearest Wimp colour.
const WIMP = ['#ffffff', '#dddddd', '#bbbbbb', '#999999', '#777777', '#555555', '#333333', '#000000',
  '#004499', '#eeee00', '#00cc00', '#dd0000', '#eeeebb', '#558800', '#ffbb00', '#00bbff'].map(hex);
function sprite4(name, size) {
  const rgba = render(size);
  const s = newSprite({ name, w: size, h: size, mode: 27, mask: true });
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    let best = 0, bd = Infinity;
    WIMP.forEach(([r, g, b], c) => {
      const d = (r - rgba[o]) ** 2 * 3 + (g - rgba[o + 1]) ** 2 * 4 + (b - rgba[o + 2]) ** 2 * 2;
      if (d < bd) { bd = d; best = c; }
    });
    s.px[i] = best;
    s.mask[i] = rgba[o + 3] >= 128 ? 1 : 0;
  }
  return s;
}

/** { '!Sprites': Buffer, '!Sprites22': Buffer } */
export function iconFiles() {
  return {
    '!Sprites': Buffer.from(writeSpriteFile({ sprites: [sprite4('!lander2', 34), sprite4('sm!lander2', 18)] })),
    '!Sprites22': Buffer.from(writeSpriteFile({ sprites: [sprite32('!lander2', 68), sprite32('sm!lander2', 36)] })),
  };
}

/** For checking the picture: RGBA pixels at any size. */
export { render as renderIcon };
