// WaveSynth voice (vendor/ro371/Sources/OS_Core/HWSupport/Sound/Voices/WaveSynth/s/WaveSynth),
// ported instruction by instruction: a 256-byte log wavetable played by a 16.16 phase
// accumulator, with an envelope interpreter walking the wavetable's segment descriptors and
// the amplitude applied in the log domain (subtracting 2 * attenuation from each sample byte).
//
// A wavetable is the "!WT:" memory image: a 16-word header (magic, name, length, eight pitch
// related start descriptors, the release descriptor), descriptors of two words each at
// offset 8 * n, and 256-byte sample segments at offset 256 * n. Descriptor word 0: bits 9+
// = count, bit 8 = count wave cycles (else groups of 4 samples), bits 0-7 = amplitude goal
// (bit 7 set = ramp down, &FF = full on, 0 = hold); word 1: next descriptor << 16 | segment.

const ACTIVE = 0x08, FLUSH2 = 0x02;

/** The ROM's "Beep" wavetable (WaveTable0): header, envelope descriptors and one segment. */
const BEEP_SAMPLES = [
  0x40, 0x68, 0x80, 0x8C, 0x9A, 0xA2, 0xA8, 0xAE, 0xB6, 0xBC, 0xC0, 0xC4, 0xC6, 0xCA, 0xCC, 0xD0,
  0xD2, 0xD4, 0xD8, 0xDA, 0xDE, 0xE0, 0xE0, 0xE2, 0xE4, 0xE4, 0xE6, 0xE8, 0xE8, 0xEA, 0xEA, 0xEC,
  0xEE, 0xEE, 0xF0, 0xF0, 0xF2, 0xF2, 0xF4, 0xF4, 0xF4, 0xF6, 0xF6, 0xF8, 0xF8, 0xF8, 0xFA, 0xFA,
  0xFA, 0xFC, 0xFC, 0xFC, 0xFC, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE,
  0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFE, 0xFC, 0xFC, 0xFC, 0xFC, 0xFA,
  0xFA, 0xFA, 0xF8, 0xF8, 0xF8, 0xF6, 0xF6, 0xF4, 0xF4, 0xF4, 0xF2, 0xF2, 0xF0, 0xF0, 0xEE, 0xEE,
  0xEC, 0xEA, 0xEA, 0xE8, 0xE8, 0xE6, 0xE4, 0xE4, 0xE2, 0xE0, 0xE0, 0xDE, 0xDA, 0xD8, 0xD4, 0xD2,
  0xD0, 0xCC, 0xCA, 0xC6, 0xC4, 0xC0, 0xBC, 0xB6, 0xAE, 0xA8, 0xA2, 0x9A, 0x8C, 0x80, 0x68, 0x40,
  0x41, 0x69, 0x81, 0x8D, 0x9B, 0xA3, 0xA9, 0xAF, 0xB7, 0xBD, 0xC1, 0xC5, 0xC7, 0xCB, 0xCD, 0xD1,
  0xD3, 0xD5, 0xD9, 0xDB, 0xDF, 0xE1, 0xE1, 0xE3, 0xE5, 0xE5, 0xE7, 0xE9, 0xE9, 0xEB, 0xEB, 0xED,
  0xEF, 0xEF, 0xF1, 0xF1, 0xF3, 0xF3, 0xF5, 0xF5, 0xF5, 0xF7, 0xF7, 0xF9, 0xF9, 0xF9, 0xFB, 0xFB,
  0xFB, 0xFD, 0xFD, 0xFD, 0xFD, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFD, 0xFD, 0xFD, 0xFD, 0xFB,
  0xFB, 0xFB, 0xF9, 0xF9, 0xF9, 0xF7, 0xF7, 0xF5, 0xF5, 0xF5, 0xF3, 0xF3, 0xF1, 0xF1, 0xEF, 0xEF,
  0xED, 0xEB, 0xEB, 0xE9, 0xE9, 0xE7, 0xE5, 0xE5, 0xE3, 0xE1, 0xE1, 0xDF, 0xDB, 0xD9, 0xD5, 0xD3,
  0xD1, 0xCD, 0xCB, 0xC7, 0xC5, 0xC1, 0xBD, 0xB7, 0xAF, 0xA9, 0xA3, 0x9B, 0x8D, 0x81, 0x69, 0x41,
];

/** Envelope descriptors 8..14 of the Beep wavetable: [word0, word1]. */
export const BEEP_DESCRIPTORS = {
  8: [0x7F + (1 << 9), 0x00090001],          // ATTACK:  ramp up to &7F, a step every 2 groups of 4 samples
  9: [0xF0 + (31 << 9), 0x000A0001],         // DECAY:   ramp down to &70, a step every 32 groups
  10: [0x80 + (500 << 9), 0x000E0001],       // SUS a:   ramp down to 0, a step every 501 groups, then dead
  11: [0xDF + (25 << 9), 0x000A0001],        // SUS b:   (unreachable)
  12: [0x00 + ((0xFFFFF << 9) >>> 0), 0x000D0002],   // SUSTAIN (unreachable)
  13: [0x80 + (1 << 9), 0x000E0001],         // release: ramp down to 0, a step every 2 groups
  14: [0, 0],                                // dead
};

/** Build the Beep wavetable memory image (512 bytes). */
export function beepWavetable() {
  const b = new Uint8Array(512);
  const w = new DataView(b.buffer);
  b.set([0x21, 0x57, 0x54, 0x3A], 0);                     // "!WT:"
  b.set([0x42, 0x65, 0x65, 0x70], 4);                     // "Beep"
  w.setUint32(16, 512, true);                             // total length
  for (let i = 5; i <= 12; i++) w.setUint32(i * 4, 8, true);   // eight pitch related entries
  w.setUint32(52, 13, true);                              // end (release) descriptor
  for (const [n, [a, c]] of Object.entries(BEEP_DESCRIPTORS)) { w.setUint32(n * 8, a >>> 0, true); w.setUint32(n * 8 + 4, c >>> 0, true); }
  b.set(BEEP_SAMPLES, 256);
  return b;
}

/** Name held in a wavetable header ("Beep", "Brass15", ...). */
export function wavetableName(t) {
  let s = '';
  for (let i = 4; i < 16 && t[i] >= 32; i++) s += String.fromCharCode(t[i]);
  return s;
}

/** Pitch increment -> start descriptor word index (PitchStartMap). */
const PITCH_START_MAP = (() => {
  const m = new Uint8Array(256);
  let i = 0;
  for (const [v, n] of [[5, 2], [6, 2], [7, 4], [8, 8], [9, 16], [10, 32], [11, 64], [12, 128]]) for (let k = 0; k < n; k++) m[i++] = v;
  return m;
})();

/**
 * A WaveSynth voice over a wavetable image. The per-channel registers live in the SCCB as
 * the ARM code keeps them: R2 = pitch (phase << 16 | increment), R4 = duration (buffer
 * fills), R5 = segment base (p1), R6 = count/goal word (p2), R7 = amplitude (p3),
 * R8 = descriptor offset (p4).
 */
export class WaveSynthVoice {
  constructor(table = beepWavetable(), name) {
    this.table = table;
    this.words = new DataView(table.buffer, table.byteOffset, table.byteLength);
    this.name = name ?? 'WaveSynth-' + wavetableName(table);
  }
  word(off) { return off + 4 <= this.table.length ? this.words.getInt32(off, true) : 0; }
  sample(off) { return off < this.table.length ? this.table[off] : 0; }

  instantiate() { return true; }
  free() {}

  /** Note amplitude scaled by the master volume, as an attenuation 0 (loud) .. 127. */
  static noteAtten(sys, ampByte) { return 127 - (sys.ampTable[(ampByte & 0x7F) << 1] >> 1); }

  gateOn(sys, ch, c, out) {
    const att = WaveSynthVoice.noteAtten(sys, c.ampGate);
    const r2 = c.pitch >>> 0;
    const idx = r2 & 0x4000 ? 255 : (r2 >>> 6) & 0xFF;     // MOVS R0,R2,LSL #18 (carry = bit 14)
    const r8 = (this.word(PITCH_START_MAP[idx] * 4) << 3) >>> 0;
    const r6 = this.word(r8), r7w = this.word(r8 + 4);
    const st = { r2, r4: c.duration | 0, r5: 0, r6, r7: 0, r8, att };
    if (r7w === 0) return this.finished(c, st, out, 0);
    st.r5 = (r7w & 0xFFFF) << 8;
    if ((r6 & 0xFF) === 0xFF) st.r7 |= 0x7F;
    if (st.r4 <= 0) { st.r7 = 0; return this.gateOffRamp(c, st, out, 0); }
    return this.run(c, st, out, 0);
  }

  gateOff(sys, ch, c, out) {
    const att = WaveSynthVoice.noteAtten(sys, c.flags & ACTIVE ? c.ampGate : 0);
    c.duration = 0;
    const st = { r2: c.pitch >>> 0, r4: 0, r5: c.p1, r6: c.p2, r7: c.p3, r8: c.p4, att };
    st.r7 = 0;                                   // CMP R4,#0 : MOVLE R7,#0 (R4 was just zeroed)
    return this.gateOffRamp(c, st, out, 0);
  }

  update(sys, ch, c, out) {
    return c.flags & ACTIVE ? this.fill(sys, ch, c, out) : this.gateOff(sys, ch, c, out);
  }

  fill(sys, ch, c, out) {
    const att = WaveSynthVoice.noteAtten(sys, c.ampGate);
    const st = { r2: c.pitch >>> 0, r4: c.duration | 0, r5: c.p1, r6: c.p2, r7: c.p3, r8: c.p4, att };
    if (st.r4 === 0) return this.gateOffRamp(c, st, out, 0);
    return this.run(c, st, out, 0);
  }

  gateOffRamp(c, st, out, i) {
    st.r8 = (this.word(52) << 3) >>> 0;          // WaveEnd: the release descriptor
    const amp = st.r7 & 0x7F;
    st.r6 = this.word(st.r8);
    const r7w = this.word(st.r8 + 4);
    if (r7w === 0) return this.finished(c, st, out, i);
    st.r7 = amp;
    st.r5 = (r7w & 0xFFFF) << 8;
    return this.run(c, st, out, i);
  }

  finished(c, st, out, i) {
    c.pitch = 0;                                 // clear phase (and increment)
    c.duration = st.r4; c.p1 = st.r5; c.p2 = st.r6; c.p3 = st.r7; c.p4 = st.r8;
    out.fill(0, i);
    return FLUSH2;
  }

  /** FillBuffer / FillLoop: fill out[i..] in groups of four samples. */
  run(c, st, out, i) {
    const T = this.table, len = out.length;
    let { r2, r4, r5, r6, r7, r8 } = st;
    const att = st.att;
    let sub = (((att + 127 - (r7 & 0x7F)) & 0xFF) << 1);     // R1 LSR #23
    let k = 0;                                   // which of Fill0..Fill3 comes next
    for (;;) {
      if (k === 0) {
        // Fill0: count groups of four samples unless counting wave cycles
        if (!(r6 & 0x100)) {
          r6 = (r6 - 0x200) | 0;
          if (r6 < 0) {                          // FillTime0
            const a = r6 & 0xFF;
            if (a !== 0 && a !== 0xFF) {
              const goal = a & 0x7F;
              let reload = false;
              if (a & 0x80) { r7--; if (r7 < goal) r7 = goal; else reload = true; }
              else { r7++; if (r7 > goal) r7 = goal; else reload = true; }
              if (reload) {                      // FillTimeRampAmp
                r6 = this.word(r8);
                sub = (((att + 127 - (r7 & 0x7F)) & 0xFF) << 1);
              }
            }
          }
        }
        // Fill0A: end of buffer?
        if (i >= len) {                          // FillDone
          r4 = (r4 - 1) | 0;
          if (r4 === 0) {                        // duration over: start the release at the next fill
            st.r2 = r2; st.r4 = r4; st.r5 = r5; st.r6 = r6; st.r7 = r7; st.r8 = r8;
            return this.gateOffRamp(c, st, out, i);
          }
          c.pitch = r2; c.duration = r4; c.p1 = r5; c.p2 = r6; c.p3 = r7; c.p4 = r8;
          return ACTIVE;
        }
      }
      const s = (r5 + (r2 >>> 24) < T.length ? T[r5 + (r2 >>> 24)] : 0) - sub;
      out[i++] = s < 0 ? 0 : s;
      const ph = (r2 >>> 16) + (r2 & 0xFFFF);    // ADDS R2,R2,R2,LSL #16
      r2 = (((ph & 0xFFFF) << 16) | (r2 & 0xFFFF)) >>> 0;
      k = (k + 1) & 3;
      if (ph > 0xFFFF) {                         // phase wrapped: FixN
        if (r6 & 0x100) r6 = (r6 - 0x200) | 0;
        if (r6 < 0) {                            // Advance
          const a = r6 & 0xFF;
          let next = a === 0 || a === 0xFF;
          if (!next) {
            const goal = a & 0x7F;
            if (a & 0x80) { r7--; next = r7 < goal; } else { r7++; next = r7 > goal; }
            if (!next) r6 = this.word(r8);       // RampAmp
          }
          if (next) {                            // NextSeg
            const goal = r6 & 0x7F;
            r8 = ((this.word(r8 + 4) >>> 16) << 3) >>> 0;
            r6 = this.word(r8);
            const r7w = this.word(r8 + 4);
            if (r7w === 0) {
              st.r4 = r4; st.r5 = r5; st.r6 = r6; st.r7 = r7; st.r8 = r8;
              return this.finished(c, st, out, i);
            }
            r7 = goal;
            r5 = (r7w & 0xFFFF) << 8;
            if ((r6 & 0xFF) === 0xFF) r7 |= 0x7F;
          }
          sub = (((att + 127 - (r7 & 0x7F)) & 0xFF) << 1);   // AmpScale
        }
      }
    }
  }
}

