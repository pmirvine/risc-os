// ChangeFSI image engine: decode a source image, apply ChangeFSI's processing options
// (range/equalise/invert/gamma/sharpen/smooth/brighten/black), scale with pixel-shape
// handling, rotate/mirror, then error-diffusion dither (Floyd-Steinberg) into a RISC OS
// screen mode and encode a real sprite file (or a JPEG file).
//
// Mirrors FNChangeFSI in Sources/Apps/ChangeFSI/source/ChangeFSI (Sophie Wilson): the same
// mode strings ("28", "12", "S16,90,90", "S32,90,45", "JPEG75", "JPEGMONO75", "27t"),
// scale-factor arithmetic (xmul:xdiv, source/destination pixel shapes, "=size:" to fit),
// the same info strings and the same output sprite naming ("p28", "p28s24", "S32,90,90").

import { decodeSpriteFile, modeInfo, VIDC256, WIMP_RGB } from '../../core/spritefile.js';

export const FORMAT_ERROR = 'Sorry: format not recognised - please try again or contact your supplier';
const bitsText = (n) => (n === 1 ? '1 bit per pixel' : `${n} bits per pixel`);

// ------------------------------------------------------------------ decoding

/** Decode bytes (+ RISC OS filetype, leafname) into {w, h, rgb: Float32Array (0..1), xeig, yeig, info}. */
export async function decodeImage(bytes, filetype, name = '') {
  const b = bytes;
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (filetype === 0xFF9) return decodeSprite(b);
  if (str(0, 4) === 'II*\0' || str(0, 4) === 'MM\0*') return decodeTIFF(b);
  if (str(0, 4) === 'GIF8') {
    const quant = (b[10] & 7) + 1;
    const img = await browserDecode(b, 'image/gif');
    return { ...img, info: `GIF file, ${img.w} by ${img.h} pixels, ${bitsText(quant)}` };
  }
  if (str(0, 2) === 'BM') {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const bpp = v.getUint16(28, true), comp = v.getUint32(30, true);
    const img = await browserDecode(b, 'image/bmp');
    const c = ['Uncompressed ', 'RLE8 compressed ', 'RLE4 compressed '][comp] ?? '';
    return { ...img, info: `${c}Windows 3.0 .BMP image, ${img.w} by ${img.h} pixels, ${bitsText(bpp)}` };
  }
  if (b[0] === 0x89 && str(1, 3) === 'PNG') {
    const img = await browserDecode(b, 'image/png');
    return { ...img, info: `PNG image, ${img.w} by ${img.h} pixels, ${bitsText(b[24] * [1, 0, 3, 1, 2, 0, 4][b[25]] || 24)}` };
  }
  if ((b[0] === 0xFF && b[1] === 0xD8) || filetype === 0xC85 || str(6, 4) === 'JFIF') {
    const comps = jpegComponents(b);
    const img = await browserDecode(b, 'image/jpeg');
    return { ...img, info: `JFIF image, ${img.w} by ${img.h} pixels, ${bitsText(8 * comps)}`, mono: comps === 1 };
  }
  throw new Error(FORMAT_ERROR);
}

function jpegComponents(b) {
  let p = 2;
  while (p + 4 < b.length) {
    if (b[p] !== 0xFF) { p++; continue; }
    const m = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return b[p + 9] || 3;
    p += 2 + len;
  }
  return 3;
}

async function browserDecode(bytes, mime) {
  let bmp;
  try { bmp = await createImageBitmap(new Blob([bytes], { type: mime })); } catch { throw new Error(FORMAT_ERROR); }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  return { w: c.width, h: c.height, rgb: toFloat(d, c.width * c.height, true), xeig: 1, yeig: 1 };
}

function toFloat(rgba, n, whiteBg) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = (rgba[i * 4 + k] / 255) * a + (whiteBg ? 1 - a : 0);
  }
  return out;
}

function decodeSprite(b) {
  const list = decodeSpriteFile(b);
  if (!list.length) throw new Error('Not understood RISC OS sprite');
  const s = list[0];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const off = v.getUint32(4, true) - 4;
  const mode = v.getUint32(off + 40, true);
  const info = mode < 256
    ? `RISC OS sprite, mode ${mode} ${s.width} by ${s.height} pixels, ${bitsText(s.bpp)}`
    : `New RISC OS sprite, ${s.width} by ${s.height} pixels, ${bitsText(s.bpp)}`;
  // transparent pixels become white (as ChangeFSI's note says for a 16-colour sprite in 256 colours)
  return { w: s.width, h: s.height, rgb: toFloat(s.rgba, s.width * s.height, true), xeig: s.xeig, yeig: s.yeig, info };
}

// Minimal baseline TIFF reader: uncompressed / PackBits, bilevel, grey, palette, RGB (8 bit samples).
function decodeTIFF(b) {
  const le = b[0] === 0x49;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
  const ifd = u32(4), n = u16(ifd), tags = {};
  const sz = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    const bytes = (sz[type] ?? 1) * cnt, at = bytes <= 4 ? e + 8 : u32(e + 8);
    const vals = [];
    for (let k = 0; k < cnt; k++) vals.push(type === 3 ? u16(at + k * 2) : type === 4 ? u32(at + k * 4) : b[at + k]);
    tags[tag] = vals;
  }
  const w = tags[256]?.[0], h = tags[257]?.[0], bps = tags[258]?.[0] ?? 1, spp = tags[277]?.[0] ?? 1;
  const comp = tags[259]?.[0] ?? 1, photo = tags[262]?.[0] ?? 1;
  if (!w || !h || (comp !== 1 && comp !== 32773) || (bps !== 1 && bps !== 4 && bps !== 8)) throw new Error('TIFF compression type not supported');
  const offs = tags[273] ?? [], counts = tags[279] ?? [];
  const rps = tags[278]?.[0] ?? h;
  const rowBytes = Math.ceil((w * bps * spp) / 8);
  const data = new Uint8Array(rowBytes * h);
  let pos = 0;
  offs.forEach((o, i) => {
    const end = o + (counts[i] ?? rowBytes * rps);
    if (comp === 1) { data.set(b.subarray(o, Math.min(end, o + data.length - pos)), pos); pos += end - o; return; }
    let p = o;
    while (p < end && pos < data.length) {
      const c = (b[p++] << 24) >> 24;
      if (c >= 0) { for (let k = 0; k <= c; k++) data[pos++] = b[p++]; } else if (c !== -128) { const x = b[p++]; for (let k = 0; k < 1 - c; k++) data[pos++] = x; }
    }
  });
  const rgb = new Float32Array(w * h * 3);
  const cmap = tags[320], max = (1 << bps) - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 3;
    if (spp >= 3) { for (let k = 0; k < 3; k++) rgb[o + k] = data[y * rowBytes + x * spp + k] / 255; continue; }
    const bit = x * bps, val = (data[y * rowBytes + (bit >> 3)] >> (8 - bps - (bit & 7))) & max;
    if (photo === 3 && cmap) { const N = 1 << bps; for (let k = 0; k < 3; k++) rgb[o + k] = cmap[k * N + val] / 65535; continue; }
    const g = photo === 0 ? 1 - val / max : val / max;
    rgb[o] = rgb[o + 1] = rgb[o + 2] = g;
  }
  const c = comp === 32773 ? 'PackBits compressed ' : '';
  return { w, h, rgb, xeig: 1, yeig: 1, info: `${c}TIFF file, ${w} by ${h} pixels, ${bitsText(bps * spp)}` };
}

// ------------------------------------------------------------------ output modes

const OLD_MODES = {
  // mode: [log2bpp, xeig, yeig, xres, yres]
  0: [0, 1, 2, 640, 256], 8: [1, 1, 2, 640, 256], 12: [2, 1, 2, 640, 256], 15: [3, 1, 2, 640, 256],
  25: [0, 1, 1, 640, 480], 26: [1, 1, 1, 640, 480], 27: [2, 1, 1, 640, 480], 28: [3, 1, 1, 640, 480],
};

/**
 * Parse a ChangeFSI output mode string. Returns {kind:'sprite'|'jpeg', bpp, xeig, yeig, mode, name,
 * suffix, mono, quality, xres, yres}. screen = {w, h} for "S" modes / current mode sizes.
 */
export function parseMode(str, screen = { w: 800, h: 600 }) {
  const s = String(str).trim().toUpperCase();
  if (s.startsWith('JPEG')) {
    const mono = s.startsWith('JPEGMONO');
    return { kind: 'jpeg', mono, quality: parseInt(s.slice(mono ? 8 : 4), 10) || 75, name: 'JPEG', bpp: mono ? 8 : 24, xeig: 1, yeig: 1, xres: screen.w, yres: screen.h };
  }
  if (/^S(16|24|32)/.test(s)) {
    const [bs, xd, yd] = s.slice(1).split(',').map((t) => parseInt(t, 10));
    const bpp = bs === 16 ? 16 : 32;
    const eig = (d) => (d >= 180 ? 0 : d >= 90 ? 1 : d >= 45 ? 2 : 3);
    const xdpi = xd || 90, ydpi = yd || 90;
    const mode = (((bpp === 16 ? 5 : 6) << 27) | (ydpi << 14) | (xdpi << 1) | 1) >>> 0;
    return { kind: 'sprite', bpp, xeig: eig(xdpi), yeig: eig(ydpi), mode, name: s, suffix: '', xres: screen.w, yres: screen.h };
  }
  const m = parseInt(s, 10);
  const suffix = /[CDRT]$/.test(s) ? s.slice(-1) : '';
  if (!Number.isFinite(m) || !OLD_MODES[m]) {
    const mi = Number.isFinite(m) ? modeInfo(m) : null;
    if (!mi || m > 49) throw new Error('Incorrect value for mode number in Sprite Output dialogue box.');
    const xres = 640, yres = mi.yeig === 2 ? 256 : 480;
    return { kind: 'sprite', bpp: mi.bpp, xeig: mi.xeig, yeig: mi.yeig, mode: m, name: 'p' + m + suffix.toLowerCase(), suffix, xres, yres };
  }
  const [l2, xe, ye, xres, yres] = OLD_MODES[m];
  return { kind: 'sprite', bpp: 1 << l2, xeig: xe, yeig: ye, mode: m, name: 'p' + m + suffix.toLowerCase(), suffix, xres, yres };
}

// ------------------------------------------------------------------ processing

/**
 * opts: {mode (string), mono (bool), scale: {type:'fit'|'1:1'|'1:2x'|'1:2y'|'1:2'|'custom', xi, xo, yi, yo},
 *        nosize, noscale, lock, rotate: 0|1|-1, hflip, vflip, range, equal, nodither, invert, brighten,
 *        black (n|false), gamma (n|false), sharpen (n|false), smooth (n|false), screen:{w,h}}
 * Returns {kind, w, h, spec, bytes (Uint8Array file), sprite (decoded preview rgba), name, rangeInfo, oname}.
 */
export async function convert(src, opts) {
  const spec = parseMode(opts.mode, opts.screen);
  let { w, h } = src;
  let rgb = src.rgb.slice();
  let rangeInfo = 'Range not used';

  // --- colour map adjustments (per channel, like r%()/g%()/b%() tables)
  if (opts.invert) for (let i = 0; i < rgb.length; i++) rgb[i] = 1 - rgb[i];
  const mono = opts.mono || spec.mono;
  if (mono) {
    for (let i = 0; i < w * h; i++) { const y = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]; rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = y; }
  }
  if (opts.range) {
    let mn = 1, mx = 0;
    for (let i = 0; i < rgb.length; i++) { if (rgb[i] < mn) mn = rgb[i]; if (rgb[i] > mx) mx = rgb[i]; }
    if (mx >= 0.999 && mn < 1 / 255) rangeInfo = "No point in '-range' on this image";
    else if (mx > mn) {
      for (let i = 0; i < rgb.length; i++) rgb[i] = (rgb[i] - mn) / (mx - mn);
      rangeInfo = `Input image maximum ${fmtPct(mx * 100)}% minimum ${fmtPct(mn * 100)}%`;
    }
  } else if (opts.equal) {
    const hist = new Float64Array(256);
    for (let i = 0; i < w * h; i++) hist[Math.min(255, Math.round((0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]) * 255))]++;
    const cdf = new Float64Array(256);
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc / (w * h); }
    for (let i = 0; i < rgb.length; i++) rgb[i] = cdf[Math.min(255, Math.round(rgb[i] * 255))];
    rangeInfo = 'Histogram equalisation applied';
  }
  if (opts.gamma && opts.gamma !== 1) { const e = 1 / opts.gamma; for (let i = 0; i < rgb.length; i++) rgb[i] = Math.pow(Math.max(0, rgb[i]), e); }
  // pre-sharpen / smooth at source resolution (ChangeFSI's sharp% routine: 3x3 kernel)
  const sh = opts.sharpen ? +opts.sharpen : opts.smooth ? -Math.min(23, +opts.smooth) : 0;
  if (sh && sh !== 8) rgb = sharpen(rgb, w, h, sh);

  // --- scale factors
  const S = scaleFactors(src, spec, opts);
  const nw = Math.max(1, Math.round(w * S.x)), nh = Math.max(1, Math.round(h * S.y));
  // scaling is done in source orientation; rotation swaps afterwards
  rgb = resample(rgb, w, h, nw, nh);
  w = nw; h = nh;
  if (opts.rotate) ({ rgb, w, h } = rotate(rgb, w, h, opts.rotate));
  if (opts.hflip) rgb = flip(rgb, w, h, true);
  if (opts.vflip) rgb = flip(rgb, w, h, false);
  if (opts.brighten && mono) for (let i = 0; i < rgb.length; i++) rgb[i] = Math.min(1, rgb[i] * 16 / 15);
  if (opts.black && spec.bpp === 1) { const k = Math.min(128, +opts.black) / 255; for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, (rgb[i] - k) / (1 - k)); }

  let oname = spec.kind === 'jpeg' ? '' : spec.name;
  if (opts.range) oname += 'r';
  if (opts.equal && !opts.range) oname += 'e';
  if (sh) oname += 's' + sh;
  if (opts.black && spec.bpp === 1) oname += 'b' + opts.black;
  if (opts.gamma && opts.gamma !== 1) oname += 'g' + (+opts.gamma).toFixed(2);
  if (opts.brighten && mono) oname += 'b';

  if (spec.kind === 'jpeg') {
    const bytes = await encodeJPEG(rgb, w, h, spec.quality, spec.mono);
    return { kind: 'jpeg', w, h, spec, bytes, rangeInfo, name: 'JPEG', preview: toRGBA(rgb, w, h) };
  }
  const q = quantise(rgb, w, h, spec, mono, !opts.nodither);
  const name = oname.slice(0, 12).toLowerCase();
  const bytes = encodeSprite({ name, w, h, spec, ...q });
  return { kind: 'sprite', w, h, spec, bytes, rangeInfo, name, oname };
}

const fmtPct = (v) => String(Math.round(v * 1000) / 1000);

/** Scale factors (output pixels per source pixel), following FNChangeFSI's xmul/xdiv logic. */
export function scaleFactors(src, spec, o) {
  const nosize = o.nosize || o.noscale, noscale = o.noscale;
  // source pixel size in OS units (sprites carry theirs; others are square 90dpi = 2 OS units)
  const sx = nosize ? 2 : (1 << (src.xeig ?? 1)), sy = nosize ? 2 : (1 << (src.yeig ?? 1));
  // destination pixel size
  let dx = noscale ? 2 : (1 << spec.xeig), dy = noscale ? 2 : (1 << spec.yeig);
  if (o.rotate) [dx, dy] = [dy, dx];
  let fx = sx / dx, fy = sy / dy;
  const sc = o.scale ?? { type: '1:1' };
  const W = src.w, H = src.h;
  const tw = o.rotate ? spec.yres : spec.xres, th = o.rotate ? spec.xres : spec.yres;
  switch (sc.type) {
    case 'fit': fx = tw / W; fy = th / H; break;
    case '1:2': fx /= 2; fy /= 2; break;
    case '1:2x': fx /= 2; break;          // "Scale 1:2 1:1"
    case '1:2y': fy /= 2; break;          // "Scale 1:1 1:2"
    case 'custom': {
      const xi = +sc.xi || 1, yi = +sc.yi || 1;
      fx = sc.xo === '' || +sc.xo === 0 ? (+sc.xi || W) / W : fx * xi / +sc.xo;
      fy = sc.yo === '' || +sc.yo === 0 ? (+sc.yi || H) / H : fy * yi / +sc.yo;
      break;
    }
    default: break;
  }
  if (o.lock) { const m = Math.min(fx * dx, fy * dy); fx = m / dx; fy = m / dy; }
  return { x: fx, y: fy };
}

function sharpen(rgb, w, h, s) {
  const out = new Float32Array(rgb.length);
  const a = Math.abs(s);
  const at = (x, y, k) => rgb[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3 + k];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) {
    let sum = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) sum += at(x + i, y + j, k);
    const c = at(x, y, k);
    const v = s > 0 ? (a * c - sum) / (a - 8) : (a * c + sum) / (a + 8);
    out[(y * w + x) * 3 + k] = Math.min(1, Math.max(0, v));
  }
  return out;
}

/** Area-averaging resample (box filter with fractional coverage; replicates when enlarging). */
function resample(src, w, h, nw, nh) {
  if (nw === w && nh === h) return src;
  // horizontal pass
  const tmp = new Float32Array(nw * h * 3);
  const rx = w / nw;
  for (let x = 0; x < nw; x++) {
    const a = x * rx, b = a + rx;
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, bl = 0;
      for (let sx = Math.floor(a); sx < Math.ceil(b); sx++) {
        const cov = Math.min(b, sx + 1) - Math.max(a, sx);
        const o = (y * w + Math.min(w - 1, sx)) * 3;
        r += src[o] * cov; g += src[o + 1] * cov; bl += src[o + 2] * cov;
      }
      const o = (y * nw + x) * 3;
      tmp[o] = r / rx; tmp[o + 1] = g / rx; tmp[o + 2] = bl / rx;
    }
  }
  const out = new Float32Array(nw * nh * 3);
  const ry = h / nh;
  for (let y = 0; y < nh; y++) {
    const a = y * ry, b = a + ry;
    for (let sy = Math.floor(a); sy < Math.ceil(b); sy++) {
      const cov = (Math.min(b, sy + 1) - Math.max(a, sy)) / ry;
      const so = Math.min(h - 1, sy) * nw * 3, oo = y * nw * 3;
      for (let i = 0; i < nw * 3; i++) out[oo + i] += tmp[so + i] * cov;
    }
  }
  return out;
}

function rotate(rgb, w, h, dir) {
  // +90 = anticlockwise (ChangeFSI's "-rotate"), -90 clockwise
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = dir > 0 ? y : h - 1 - y, ny = dir > 0 ? w - 1 - x : x;
    const o = (ny * h + nx) * 3, i = (y * w + x) * 3;
    out[o] = rgb[i]; out[o + 1] = rgb[i + 1]; out[o + 2] = rgb[i + 2];
  }
  return { rgb: out, w: h, h: w };
}

function flip(rgb, w, h, horiz) {
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, o = horiz ? (y * w + (w - 1 - x)) * 3 : ((h - 1 - y) * w + x) * 3;
    out[o] = rgb[i]; out[o + 1] = rgb[i + 1]; out[o + 2] = rgb[i + 2];
  }
  return out;
}

function toRGBA(rgb, w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = rgb[i * 3] * 255; d[i * 4 + 1] = rgb[i * 3 + 1] * 255; d[i * 4 + 2] = rgb[i * 3 + 2] * 255; d[i * 4 + 3] = 255; }
  return d;
}

// ------------------------------------------------------------------ quantisation

function greys(n) { return Array.from({ length: n }, (_, i) => { const v = Math.round(i * 255 / (n - 1)); return [v, v, v]; }); }

/** Palette used for an output mode (null = mode's default palette, not written to the sprite). */
function outputPalette(spec, mono) {
  if (spec.bpp > 8) return { pal: null, write: false };
  if (mono) return { pal: greys(1 << spec.bpp), write: true };
  switch (spec.bpp) {
    case 1: return { pal: [[0, 0, 0], [255, 255, 255]], write: true };
    case 2: return { pal: [[0, 0, 0], [255, 0, 0], [255, 255, 0], [255, 255, 255]], write: true };   // mode 1/8/26 default
    case 4: return { pal: WIMP_RGB.map((c) => c.slice()), write: true };                               // "R": current (Wimp) palette
    default: return { pal: VIDC256, write: false };
  }
}

function quantise(rgb, w, h, spec, mono, dither) {
  const n = w * h;
  const err = Float32Array.from(rgb, (v) => v * 255);
  const put = (x, y, k, e) => { if (x >= 0 && x < w && y < h) err[(y * w + x) * 3 + k] += e; };
  if (spec.bpp >= 16) {
    const out = new Uint8Array(n * 3);
    const levels = spec.bpp === 16 ? 31 : 255;
    for (let y = 0; y < h; y++) {
      const ltr = !(y & 1);
      for (let xi = 0; xi < w; xi++) {
        const x = ltr ? xi : w - 1 - xi, d = ltr ? 1 : -1;
        for (let k = 0; k < 3; k++) {
          const i = (y * w + x) * 3 + k;
          const v = Math.min(255, Math.max(0, err[i]));
          const q = Math.round(v * levels / 255);
          out[i] = q;
          if (dither && levels < 255) { const e = v - q * 255 / levels; put(x + d, y, k, e * 7 / 16); put(x - d, y + 1, k, e * 3 / 16); put(x, y + 1, k, e * 5 / 16); put(x + d, y + 1, k, e / 16); }
        }
      }
    }
    return { direct: out, levels };
  }
  const { pal, write } = outputPalette(spec, mono);
  const lut = new Int16Array(32768).fill(-1);
  const nearest = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let best = lut[key];
    if (best >= 0) return best;
    let bd = Infinity;
    const rr = (r & ~7) + 4, gg = (g & ~7) + 4, bb = (b & ~7) + 4;
    for (let i = 0; i < pal.length; i++) {
      const c = pal[i];
      const d = 3 * (c[0] - rr) ** 2 + 4 * (c[1] - gg) ** 2 + 2 * (c[2] - bb) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    lut[key] = best;
    return best;
  };
  const idx = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const ltr = !(y & 1);      // serpentine scan, as ChangeFSI alternates direction per row
    for (let xi = 0; xi < w; xi++) {
      const x = ltr ? xi : w - 1 - xi, d = ltr ? 1 : -1;
      const i = (y * w + x) * 3;
      const r = Math.min(255, Math.max(0, err[i])), g = Math.min(255, Math.max(0, err[i + 1])), b = Math.min(255, Math.max(0, err[i + 2]));
      const p = nearest(r | 0, g | 0, b | 0);
      idx[y * w + x] = p;
      if (dither) {
        const c = pal[p];
        const e = [r - c[0], g - c[1], b - c[2]];
        for (let k = 0; k < 3; k++) { put(x + d, y, k, e[k] * 7 / 16); put(x - d, y + 1, k, e[k] * 3 / 16); put(x, y + 1, k, e[k] * 5 / 16); put(x + d, y + 1, k, e[k] / 16); }
      }
    }
  }
  return { indices: idx, palette: write ? pal : null };
}

// ------------------------------------------------------------------ encoders

/** Encode a one-sprite RISC OS sprite file (no leading area size word). */
export function encodeSprite({ name, w, h, spec, indices, palette, direct, levels }) {
  const bpp = spec.bpp;
  const rowBits = w * bpp;
  const words = Math.ceil(rowBits / 32);
  const rowBytes = words * 4;
  const palBytes = palette ? palette.length * 8 : 0;
  const imgOff = 44 + palBytes;
  const size = imgOff + rowBytes * h;
  const out = new Uint8Array(12 + size);
  const v = new DataView(out.buffer);
  v.setUint32(0, 1, true); v.setUint32(4, 16, true); v.setUint32(8, 16 + size, true);
  const s = 12;
  v.setUint32(s, size, true);
  for (let i = 0; i < 12; i++) out[s + 4 + i] = i < name.length ? name.charCodeAt(i) : 0;
  v.setUint32(s + 16, words - 1, true);
  v.setUint32(s + 20, h - 1, true);
  v.setUint32(s + 24, 0, true);
  v.setUint32(s + 28, (rowBits - 1) & 31, true);
  v.setUint32(s + 32, imgOff, true);
  v.setUint32(s + 36, imgOff, true);
  v.setUint32(s + 40, spec.mode, true);
  if (palette) palette.forEach((c, i) => {
    const word = ((c[2] << 24) | (c[1] << 16) | (c[0] << 8)) >>> 0;
    v.setUint32(s + 44 + i * 8, word, true); v.setUint32(s + 48 + i * 8, word, true);
  });
  const base = s + imgOff;
  for (let y = 0; y < h; y++) {
    const row = base + y * rowBytes;
    for (let x = 0; x < w; x++) {
      if (bpp <= 8) {
        const bit = x * bpp;
        out[row + (bit >> 3)] |= indices[y * w + x] << (bit & 7);
      } else if (bpp === 16) {
        const o = (y * w + x) * 3;
        v.setUint16(row + x * 2, direct[o] | (direct[o + 1] << 5) | (direct[o + 2] << 10), true);
      } else {
        const o = (y * w + x) * 3;
        out[row + x * 4] = direct[o]; out[row + x * 4 + 1] = direct[o + 1]; out[row + x * 4 + 2] = direct[o + 2];
      }
    }
  }
  return out;
}

async function encodeJPEG(rgb, w, h, quality, mono) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const d = toRGBA(rgb, w, h);
  if (mono) for (let i = 0; i < w * h; i++) { const y = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = y; }
  c.getContext('2d').putImageData(new ImageData(d, w, h), 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', Math.max(0.01, Math.min(1, quality / 100))));
  return new Uint8Array(await blob.arrayBuffer());
}
