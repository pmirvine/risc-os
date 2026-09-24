// Maestro music file format (filetype &AF1 "Music"), reverse-engineered from the 3.71
// !Maestro !RunImage (BASIC, PROCo / PROCx / PROCka).  Pure module (no DOM) so it can be
// tested under node.
//
// File:  "Maestro" LF, version byte (2; 1 = old fixed-order format), then tagged sections:
//   1 music:   PRINT# int queueLen, 8 x PRINT# int channelLen (BASIC ints: &40 + 4 bytes MSB
//              first), then the queue bytes, then each channel's note bytes.
//   2 staves:  byte staves-1 (0..3), byte percussion (0/1)
//   3 voices:  8 x (byte channel, byte voice number)
//   4 volume:  8 bytes (0..7 = ppp..fff)
//   5 stereo:  8 bytes (0..6 = full left..full right)
//   6 tempo:   byte (0..14, index into the beats-per-minute table)
// Queue: a non-zero byte is a "gate" = bitmask of channels that each play their next note;
// a zero byte is followed by a command byte whose lowest set bit gives its type:
//   bit0 time signature  ((c>>1)&15)+1 beats of note type (c>>5)
//   bit1 key signature   (c>>2)&1 = flats, (c>>3)&7 = number of sharps/flats
//   bit2 clef            (c>>3)&3 = clef (0 treble, 1 alto, 2 tenor, 3 bass), c>>6 = stave
//   bit5 bar line
// Notes: 2 bytes per note.  a: bits 3-7 = stave position+16 (0 = rest; 16 = middle line),
//   bit2 tie to next, bit1 (unused/join), bit0 stem down.
//   b: bits 5-7 note type (0 breve .. 7 hemidemisemiquaver), bits 3-4 dots, bits 0-2
//   accidental (0 none, 1 natural, 2 sharp, 3 flat, 4 double sharp, 5 double flat,
//   6 naturalised sharp, 7 naturalised flat).

export const TEMPO_BPM = [40, 50, 60, 65, 70, 80, 90, 100, 115, 130, 145, 160, 175, 190, 210];
export const TEMPO_NAMES = ['Largissimo', 'Largo', 'Larghetto', 'Grave', 'Adagio', 'Adagietto', 'Andante', 'Andantino', 'Moderato', 'Allegretto', 'Allegro', 'Vivace', 'Veloce', 'Presto', 'Prestissimo'];
export const VOLUME_NAMES = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
export const STEREO_KEYS = ['FullL', 'Left', 'CentreL', 'Centre', 'CentreR', 'Right', 'FullR'];
export const STEREO_POS = [0, 1, 2, 3, 4, 5, 6].map((r) => Math.trunc((2 * r / 6 - 1) * 127));   // Stereo%() (integer assignment truncates)
// Amplitude for each volume level (B%() in the original): logarithmic 0..127
export const VOLUME_AMP = [0, 1, 2, 3, 4, 5, 6, 7].map((r) => Math.floor((r + 1) * 120 / 8 - 1));
// Clef pitch offsets F%(): treble, alto, tenor, bass
export const CLEF_OFFSET = [11, 5, 3, -1];

/** Duration of note type/dots index I (= b>>3) in "beat units" (crotchet = 128): G%(). */
export const durUnits = (i) => (1 << (7 - (i >> 2))) * ((120 >> (i & 3)) & 15);

/** I%(clef, flats, n): stave position of the n-th sharp/flat of a key signature. */
export const KEYPOS = (() => {
  const T = (b) => (b ? -1 : 0);
  const r = [];
  for (let C = 0; C < 4; C++) {
    r[C] = [[], []];
    for (let A = 0; A < 2; A++) for (let P = 0; P < 7; P++) {
      r[C][1 - A][P] = 3 * (P & 1) - Math.trunc(P / 2) + (P - 3) * A + (A & T(C !== 2) & T((P & 5) === 0)) * 7 - 1 - ((C - 1) >> 1) - 2 * T(C === 2);
    }
  }
  return r;
})();

/** ba%(key, note letter): accidental (2 sharp / 3 flat) for key index 2*count+flats. */
export const KEYACC = (() => {
  const r = [];
  for (let C = 0; C < 16; C++) {
    r[C] = [0, 0, 0, 0, 0, 0, 0];
    if (C < 2) continue;
    for (let N = 0; N < (C >> 1); N++) r[C][((7 + KEYPOS[1][C & 1][N]) % 7 + 7) % 7] = (C % 2) + 2;
  }
  return r;
})();

// Pitch in RISC OS units (&4000 = middle C, 4096 per octave): b() and a()
const Q = 4096 / 12;
const DA = [0, 2, 4, 5, 7, 9, 11];
export const pitchOfLine = (n) => Math.floor(((1 + Math.floor(n / 7)) << 12) + DA[((n % 7) + 7) % 7] * Q + 0.49);
export const ACC_OFFSET = [0, 0, Q, -Q, 2 * Q, -2 * Q, Q, -Q];
/** RISC OS pitch -> MIDI note number (fractional). */
export const pitchToMidi = (p) => 60 + (p - 0x4000) * 12 / 4096;

export class MaestroError extends Error {}

/** A new empty score (PROCy): just the initial bar line. */
export function emptyScore() {
  return {
    items: [{ t: 'cmd', v: 0x20 }],
    staves: 0, perc: 0,
    voices: [1, 1, 1, 1, 1, 1, 1, 1],
    volume: [6, 6, 6, 6, 6, 6, 6, 6],
    stereo: [3, 3, 3, 3, 3, 3, 3, 3],
    tempo: 8,
  };
}

/** Channel -> stave assignment (D%(), i%()). */
export function channelStaves(z, perc) {
  const r = [];
  for (let c = 0; c < 8; c++) r[c] = Math.floor((z + 1) * c / 8);
  if (z === 2) { r[1] = 1; r[2] = 1; r[5] = 2; }
  if (perc) r[7] = z + 1;
  return r;
}

export function isMaestro(bytes) {
  return bytes.length >= 9 && String.fromCharCode(...bytes.slice(0, 8)) === 'Maestro\n';
}

/** Parse a Maestro file (Uint8Array) into a score object. */
export function parseMaestro(bytes) {
  if (!isMaestro(bytes)) throw new MaestroError('Invalid music file');
  const doc = emptyScore();
  let p = 8;
  const ver = bytes[p++];
  if (ver === 0) throw new MaestroError('Invalid music file');
  const need = (n) => { if (p + n > bytes.length) throw new MaestroError('Invalid music file'); };
  const byte = () => { need(1); return bytes[p++]; };
  const int = () => {
    need(5);
    if (bytes[p] !== 0x40) throw new MaestroError('Invalid music file');
    const v = (bytes[p + 1] << 24) | (bytes[p + 2] << 16) | (bytes[p + 3] << 8) | bytes[p + 4];
    p += 5;
    return v;
  };
  const music = () => {
    const ql = int();
    const cl = [];
    for (let c = 0; c < 8; c++) cl.push(int());
    need(ql);
    const q = bytes.slice(p, p + ql); p += ql;
    const ch = cl.map((n) => { need(n); const d = bytes.slice(p, p + n); p += n; return d; });
    const ptr = new Array(8).fill(0);
    const items = [];
    for (let i = 0; i < q.length;) {
      if (q[i]) {
        const notes = [];
        for (let c = 0; c < 8; c++) {
          if (!(q[i] & (1 << c))) continue;
          const a = ch[c][ptr[c]] ?? 0, b = ch[c][ptr[c] + 1] ?? 0;
          ptr[c] += 2;
          notes.push({ ch: c, a, b });
        }
        items.push({ t: 'gate', notes });
        i += 1;
      } else {
        if (q[i + 1]) items.push({ t: 'cmd', v: q[i + 1] });
        i += 2;
      }
    }
    doc.items = items.length ? items : [{ t: 'cmd', v: 0x20 }];
  };
  const staves = () => { doc.staves = Math.min(3, byte()); doc.perc = byte() === 1 ? 1 : 0; };
  const voices = () => { for (let i = 0; i < 8; i++) { const c = byte() & 7; doc.voices[c] = byte() || 1; } };
  const volume = () => { for (let i = 0; i < 8; i++) doc.volume[i] = Math.max(0, Math.min(7, byte())); };
  const stereo = () => { for (let i = 0; i < 8; i++) doc.stereo[i] = Math.min(6, byte()); };
  const tempo = () => { doc.tempo = Math.min(14, byte()); };
  if (ver === 1) {
    tempo(); voices(); staves(); music();
  } else {
    const fns = { 1: music, 2: staves, 3: voices, 4: volume, 5: stereo, 6: tempo };
    while (p < bytes.length) {
      const f = fns[bytes[p]];
      if (!f) break;
      p++;
      f();
    }
  }
  return doc;
}

/** Serialise a score (PROCx): always the version 2 tagged format. */
export function saveMaestro(doc) {
  const out = [];
  const str = (s) => { for (const ch of s) out.push(ch.charCodeAt(0)); };
  const int = (v) => out.push(0x40, (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  str('Maestro\n'); out.push(2);
  const q = [];
  const ch = [[], [], [], [], [], [], [], []];
  for (const it of doc.items) {
    if (it.t === 'cmd') { q.push(0, it.v); continue; }
    let mask = 0;
    for (const n of [...it.notes].sort((x, y) => x.ch - y.ch)) {
      if (mask & (1 << n.ch)) continue;
      mask |= 1 << n.ch;
      ch[n.ch].push(n.a, n.b);
    }
    if (mask) q.push(mask);
  }
  out.push(1); int(q.length); for (const c of ch) int(c.length);
  out.push(...q); for (const c of ch) out.push(...c);
  out.push(2, doc.staves, doc.perc);
  out.push(3); for (let c = 0; c < 8; c++) out.push(c, doc.voices[c]);
  out.push(4, ...doc.volume);
  out.push(5, ...doc.stereo);
  out.push(6, doc.tempo);
  return new Uint8Array(out);
}

/**
 * Work out the performance (PROCka / PROCCb / PROCDb): returns
 * { events: [{time, dur (seconds), ch, midi, amp (0..127 log), item, voice, pan, pitch (15-bit
 * SOUND pitch, Line()+Aoff()), d20 (SOUND duration in 1/20 s, D%)}], bars: [{time, item}], length }.
 * Bars start one bar-length apart (the Sound scheduler's beat counter), each stave keeps its own
 * time cursor inside a bar, ties join notes, accidentals last to the end of the bar.
 */
export function perform(doc, { fromItem = 0 } = {}) {
  const unit = 60 / (TEMPO_BPM[doc.tempo] * 128);
  // Duration%(): each note/dot type's length in 1/20 s at this tempo, rounded, at most 254
  const durTicks = (i) => Math.min(254, Math.floor(75 / TEMPO_BPM[doc.tempo] * durUnits(i) / 8 + 0.5));
  const stv = channelStaves(doc.staves, doc.perc);
  const z = doc.staves;
  let barLen = 4 * 128;
  let keyAcc = KEYACC[0];
  const clef = [0, 0, 0, 0, 0];
  let barStart = 0;
  let Qs = new Array(6).fill(0);
  let barAcc = [];
  const resetBar = () => { Qs = new Array(6).fill(0); barAcc = [0, 1, 2, 3, 4, 5].map(() => new Array(40).fill(0)); };
  resetBar();
  let first = true;
  let tieFree = 0xff;
  const events = [], bars = [];
  // per channel list of notes in order (for tie look-ahead)
  const chNotes = [[], [], [], [], [], [], [], []];
  doc.items.forEach((it, idx) => { if (it.t === 'gate') for (const n of it.notes) chNotes[n.ch].push({ n, idx }); });
  const chPtr = new Array(8).fill(0);
  let started = fromItem === 0;
  let barUsed = 0;
  doc.items.forEach((it, idx) => {
    if (!started && idx >= fromItem) { started = true; barStart = 0; resetBar(); }
    if (it.t === 'cmd') {
      const v = it.v;
      if (v & 1) barLen = (((v >> 1) & 15) + 1) * durUnits((v >> 3) & 28);
      else if (v & 2) keyAcc = KEYACC[(v >> 2) & 15];
      else if (v & 4) clef[v >> 6] = (v >> 3) & 3;
      else if (v & 0x20) {
        if (barUsed || bars.length) { barStart += barLen; }
        bars.push({ time: barStart * unit, item: idx });
        resetBar(); first = true; barUsed = 0;
      }
      return;
    }
    const notes = [...it.notes].sort((a, b) => a.ch - b.ch);
    let Q = 0;
    for (const n of notes) Q = Math.max(Q, Qs[stv[n.ch]]);
    const R = new Array(6).fill(65536);
    for (const n of notes) {
      const C = n.ch, S = stv[C];
      const T = n.a, D = n.b, I = D >> 3;
      let L = T >> 3, A = 0;
      if (L && S <= z) {
        if (D & 7) barAcc[S][L] = D & 7;
        A = barAcc[S][L];
        L += CLEF_OFFSET[clef[S]];
        if (!A) A = keyAcc[((L % 7) + 7) % 7];
      }
      const my = chPtr[C]++;
      if (tieFree & (1 << C)) {
        let units = durUnits(I);
        let d20 = durTicks(I);
        if (T & 4) {
          tieFree &= ~(1 << C);
          for (let k = my + 1; k < chNotes[C].length; k++) {
            const nn = chNotes[C][k].n;
            units += durUnits(nn.b >> 3);
            d20 += durTicks(nn.b >> 3);
            if (!(nn.a & 4)) break;
          }
        }
        if (L && started) {
          const amp = Math.min(127, Math.floor((first ? 1.01 : 1) * VOLUME_AMP[doc.volume[C]]));
          const pitch = pitchOfLine(L) + ACC_OFFSET[A];
          events.push({ time: (barStart + Q) * unit, dur: Math.min(units * unit, 12.7), ch: C, midi: pitchToMidi(pitch), amp, item: idx, voice: doc.voices[C], pan: STEREO_POS[doc.stereo[C]] / 127, perc: S > z, pitch, d20: Math.min(d20, 254) });
        }
      } else if (!(T & 4)) tieFree |= 1 << C;
      const g = durUnits(I);
      if (g < R[S]) { R[S] = g; Qs[S] = Q + g; }
      barUsed = Math.max(barUsed, Qs[S]);
    }
    first = false;
  });
  // start at the first note (skip the silent leading bar)
  const t0 = events.length ? Math.min(...events.map((e) => e.time)) : 0;
  for (const e of events) e.time -= t0;
  for (const b of bars) b.time -= t0;
  const length = events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
  return { events, bars, length };
}
