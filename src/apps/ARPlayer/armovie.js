// ARMovie (&AE7) header reading for !ARPlayer, following SJ Middleton's ARLib (arhdr.c, arsnd.c)
// and ARPlayer's display.c/scan_file: multiple sound tracks ("|2 ..." columns), sound formats 1
// (standard: Sound<A|S|U|E><bits>) and 2 (indirect: a decompressor name under <ARMovie$SoundDir>),
// chunk catalogue, helpful sprite, movie length in centiseconds and frame count.
// Sound data are decoded with the shared decoders in ../Player/audio.js.

import { decodeADPCM, decodeRaw } from '../Player/audio.js';

const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
const ul = (s) => { const m = /^\s*([+-]?\d+)/.exec(s ?? ''); return m ? parseInt(m[1], 10) : 0; };   // strtoul
const dbl = (s) => { const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s ?? ''); return m ? parseFloat(m[1]) : 0; };  // strtod

// header lines (arline.h)
const L = { Ident: 0, Name: 1, Date: 2, Author: 3, VideoType: 4, XSize: 5, YSize: 6, PixelDepth: 7, FrameRate: 8,
  SoundType: 9, SoundRate: 10, SoundChannels: 11, SoundPrecision: 12, FramesPerChunk: 13, NChunks: 14,
  EvenChunkSize: 15, OddChunkSize: 16, CatalogueOffset: 17, SpriteOffset: 18, SpriteSize: 19, KeyFrameOffset: 20 };

/**
 * Parse an ARMovie header. readInfo(name) -> {description, author, seekable, nbits} | null reads
 * <ARMovie$SoundDir>.<name>.Info for indirect (type 2) sound. Returns null if not an ARMovie.
 */
export function readHeader(bytes, readInfo = () => null) {
  const text = latin1(bytes.subarray(0, Math.min(bytes.length, 8192)));
  const lines = [];
  let pos = 0;
  const linePos = [];
  for (let i = 0; i <= L.KeyFrameOffset; i++) {
    const nl = text.indexOf('\n', pos);
    linePos.push(pos);
    if (nl < 0) { lines.push(text.slice(pos)); pos = text.length; } else { lines.push(text.slice(pos, nl)); pos = nl + 1; }
  }
  if (!lines[0].toUpperCase().startsWith('ARMOVIE')) return null;
  const strip = (s) => s.replace(/[\x00- ]+$/, '');
  const hdr = {
    name: strip(lines[L.Name]), date: strip(lines[L.Date]), author: strip(lines[L.Author]),
    videoFormat: ul(lines[L.VideoType]), xsize: ul(lines[L.XSize]), ysize: ul(lines[L.YSize]),
    bpp: ul(lines[L.PixelDepth]), colourspace: '', fps: dbl(lines[L.FrameRate]),
    framesPerChunk: ul(lines[L.FramesPerChunk]), nchunks: ul(lines[L.NChunks]) + 1,
    evenChunkSize: ul(lines[L.EvenChunkSize]), oddChunkSize: ul(lines[L.OddChunkSize]),
    catalogueOffset: ul(lines[L.CatalogueOffset]), spriteOffset: ul(lines[L.SpriteOffset]),
    spriteSize: ul(lines[L.SpriteSize]), keyFrameOffset: 0, sound: [], lines: lines.slice(0, 14),
  };
  const pd = lines[L.PixelDepth].toUpperCase();
  if (pd.includes('PALETTE')) hdr.colourspace = 'Palette';
  else if (pd.includes('YUV')) hdr.colourspace = 'YUV';
  else if (hdr.bpp === 8) hdr.colourspace = 'Grey';
  else if (pd.includes('RGB')) hdr.colourspace = 'RGB';
  if (linePos[L.KeyFrameOffset] <= hdr.spriteOffset && linePos[L.KeyFrameOffset] <= hdr.catalogueOffset) hdr.keyFrameOffset = ul(lines[L.KeyFrameOffset]);
  if (hdr.keyFrameOffset === 0) hdr.keyFrameOffset = -1;
  hdr.nframes = hdr.nchunks * hdr.framesPerChunk;

  // sound lines: first track's values, then "|n value" columns for further tracks
  const track = (n) => (hdr.sound[n - 1] ??= { format: 0, filename: '', rate: 0, channels: 0, precision: 0, reversed: false, seekable: false, description: '' });
  for (const ln of [L.SoundType, L.SoundRate, L.SoundChannels, L.SoundPrecision]) {
    const parts = lines[ln].split('|');
    parts.forEach((p, k) => {
      let n = 1;
      if (k > 0) { const m = /^\s*(\d+)/.exec(p); n = m ? +m[1] : 0; p = p.replace(/^\s*\d+/, ''); }
      if (n < 1) return;
      const sp = track(n);
      switch (ln) {
        case L.SoundType: {
          sp.format = ul(p);
          if (sp.format === 2) {
            sp.filename = (/^\s*\d+\s+(\S+)/.exec(p)?.[1] ?? '').slice(0, 11);
            const info = readInfo(sp.filename);
            if (info) { sp.seekable = !!info.seekable; sp.description = info.description ?? ''; sp.nbits = info.nbits; }
          }
          break;
        }
        case L.SoundRate: sp.rate = dbl(p); break;
        case L.SoundChannels: sp.channels = ul(p); if (/REVER/i.test(p)) sp.reversed = true; break;
        case L.SoundPrecision: {
          sp.precision = ul(p);
          if (sp.format === 1) {
            const up = p.replace(/^\s*\d+/, '').toUpperCase();
            let ch;
            if (sp.precision === 4 || up.includes('ADPCM')) ch = 'A';
            else {
              sp.seekable = true;
              ch = sp.precision === 16 || up.includes('LIN') ? (up.includes('UNSIGN') ? 'U' : 'S') : 'E';
            }
            sp.filename = `Sound${ch}${sp.precision}`;
          }
          break;
        }
        default: break;
      }
    });
  }
  hdr.sound = hdr.sound.filter(Boolean);
  if (hdr.sound.length === 1 && hdr.sound[0].format === 0) hdr.sound = [];
  hdr.nsoundtracks = hdr.sound.length && hdr.sound[0].format ? hdr.sound.length : 0;

  // catalogue: NC+1 entries "FO,VS;S1|2 S2|3 S3"
  hdr.catalogue = [];
  if (hdr.catalogueOffset > 0 && hdr.catalogueOffset < bytes.length) {
    const cat = latin1(bytes.subarray(hdr.catalogueOffset, Math.min(bytes.length, hdr.catalogueOffset + 64 * (hdr.nchunks + 2) + 256)));
    for (const line of cat.split('\n')) {
      const m = /^\s*(\d+)\s*,\s*(\d+)\s*;\s*(\d+)(.*)$/.exec(line);
      if (!m) break;
      const sound = [+m[3]];
      for (const t of m[4].matchAll(/\|\s*(\d+)\s+(\d+)/g)) sound[+t[1] - 1] = +t[2];
      hdr.catalogue.push({ offset: +m[1], video: +m[2], sound });
      if (hdr.catalogue.length >= hdr.nchunks) break;
    }
  }
  return hdr;
}

/** Sample rate in Hz (a rate below 256 is a sample period in microseconds). */
export const realRate = (sp) => (sp.rate < 256 && sp.rate > 0 ? 1e6 / sp.rate : sp.rate);
export const bytesPerSec = (sp) => Math.ceil(realRate(sp) * sp.precision / 8 * Math.max(1, sp.channels));

/** Movie length (centiseconds) and number of frames, as ARPlayer's scan_file(). */
export function movieLength(hdr) {
  let length, nframes;
  if (hdr.videoFormat) {
    nframes = hdr.nframes;
    length = Math.trunc(nframes * 100 / (hdr.fps || 12.5));
  } else {
    const sp = hdr.sound[0];
    const chunkLength = Math.trunc(hdr.framesPerChunk / hdr.fps * 100);
    const last = hdr.catalogue[hdr.nchunks - 1]?.sound[0] ?? 0;
    length = (hdr.nchunks - 1) * chunkLength + Math.trunc(last * 100 / Math.max(1, bytesPerSec(sp)));
    nframes = Math.trunc(length * hdr.fps / 100 + 0.5);
  }
  return { length, nframes };
}

/** Coding of a sound track for the decoders: {type, bits}. */
export function trackCoding(sp) {
  const name = (sp.filename || '').toLowerCase();
  if (sp.format === 2 && !/^sound[asue]\d+/.test(name)) return { type: /adpcm/.test(name) ? 'adpcm' : 'unknown', bits: 4 };
  const m = /^sound([asue])(\d+)/.exec(name);
  const letter = m?.[1] ?? 's', bits = m ? +m[2] : sp.precision;
  if (letter === 'a') return { type: 'adpcm', bits: 4 };
  return { type: letter === 'u' ? 'unsigned' : letter === 'e' ? 'mulaw' : 'signed', bits: bits || 8 };
}

/** Decode sound track n (from 1) to {rate, channels: Float32Array[]} or null. */
export function decodeTrack(bytes, hdr, n = 1) {
  const sp = hdr.sound[n - 1];
  if (!sp || !sp.format) return null;
  const { type, bits } = trackCoding(sp);
  if (type === 'unknown') return null;
  const nch = Math.max(1, Math.min(2, sp.channels || 1));
  const parts = [];
  let total = 0;
  for (const c of hdr.catalogue) {
    let start = c.offset + c.video;
    for (let t = 0; t < n - 1; t++) start += c.sound[t] ?? 0;
    if (n > 1 && bits === 16) start = (start + 3) & ~3;       // 16 bit sound data is word aligned
    const size = c.sound[n - 1] ?? 0;
    if (!size || start >= bytes.length) continue;
    let data = bytes.subarray(start, Math.min(bytes.length, start + size));
    let chans;
    if (type === 'adpcm') {
      // each chunk starts with the coder state per channel: previous value (int16), step index, 0
      const st = [];
      for (let ch = 0; ch < nch; ch++) st.push({ val: data.length >= 4 * ch + 4 ? ((data[4 * ch] | (data[4 * ch + 1] << 8)) << 16 >> 16) : 0, index: data[4 * ch + 2] ?? 0 });
      chans = decodeADPCM(data.subarray(4 * nch), nch, st);
    } else {
      if (bits === 16 && (data.byteOffset & 1)) data = data.slice();
      chans = decodeRaw(data, { type, bits, channels: nch });
    }
    parts.push(chans);
    total += chans[0].length;
  }
  if (!total) return null;
  const out = Array.from({ length: nch }, () => new Float32Array(total));
  let p = 0;
  for (const chs of parts) { for (let c = 0; c < nch; c++) out[c].set(chs[c] ?? chs[0], p); p += chs[0].length; }
  if (sp.reversed && nch === 2) out.reverse();
  return { rate: Math.round(realRate(sp)), channels: out };
}

/** The helpful sprite as a RISC OS sprite file (the header's sprite block is already in file form). */
export function helpfulSprite(bytes, hdr) {
  if (hdr.spriteOffset <= 0 || hdr.spriteSize <= 12 || hdr.spriteOffset + hdr.spriteSize > bytes.length) return null;
  return bytes.slice(hdr.spriteOffset, hdr.spriteOffset + hdr.spriteSize);
}

/** Raw sound data of track n (all chunks), as !ARMovie.Tools.Extract writes it. */
export function trackData(bytes, hdr, n) {
  const parts = [];
  for (const c of hdr.catalogue) {
    let start = c.offset + c.video;
    for (let t = 0; t < n - 1; t++) start += c.sound[t] ?? 0;
    const size = c.sound[n - 1] ?? 0;
    if (size) parts.push(bytes.subarray(start, Math.min(bytes.length, start + size)));
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let p = 0;
  for (const d of parts) { out.set(d, p); p += d.length; }
  return out;
}

/** Parse a decompressor / sound code Info file (arsnd_readinfo). */
export function parseInfoFile(text) {
  const l = text.split(/\r?\n/);
  return { description: l[0] ?? '', author: l[1] ?? '', seekable: ul(l[2]) !== 0, nbits: ul(l[3]) };
}
