// StringLib and Percussion voices (vendor/ro371/Sources/OS_Core/HWSupport/Sound/Voices/
// StringLib/s/StringLib and Percussion/s/Percussion), ported instruction by instruction.
//
// Both are the same "plucked string" engine by David Flynn: GateOn fills a 128-word delay
// line (one wave period) with +/-amplitude from a 33-bit shift-register random generator
// (always seeded &AAAAAAAA, so every note starts identically), then every "evolution" tick
// the whole period is low-pass filtered, y[n] = x[n-1]/2^a + x[n]*(1 - 2/2^a) + x[n+1]/2^a,
// and converted to a 128-byte log wavetable through the Level1 linear -> log table (which
// carries the master volume). A 16.16 phase accumulator plays the table (top 7 bits index it).
// The duration counts centiseconds on its own accumulator and the note stops dead at the end.
//
// StringLib plays at the SOUND pitch and filters every ~2 cs. Percussion ignores the pitch
// (fixed increment &100 = 81.4 Hz), filters every ~0.5 cs and flips the sign of each filtered
// sample when an LFSR (mask &1D872B41) shifts a 1 out, which turns the string into a drum.

const ACTIVE = 0x08, FORCE_FLUSH = 0x02;
const CENTISEC = Math.floor(65536 * 4 / 208);      // 1260: tempo accumulator increment
const RAND_SEED = 0xAAAAAAAA;
const RAND_MASK = 0x1D872B41;

/** Signed-overflow add of b<<16 into a (ADDS Rn,Rn,Rn,LSL #16): returns [result, V]. */
function addsHalf(a) {
  const b = (a << 16) | 0, r = (a + b) | 0;
  return [r, ((a ^ r) & (b ^ r)) < 0];
}

/** Per-channel instance data segment. */
class Instance {
  constructor() {
    this.r = new Int32Array(9);          // RegSav1..8 at r[1..8] (r[6], r[7] are pointers in the ARM)
    this.seedL = 0; this.seedH = 0;
    this.dline = new Int32Array(160);    // [0] DLineSave (sample -1), [1..128] DLine, [129] DLine256; RND overruns to 160
    this.wave = new Uint8Array(256);     // WaveBuff (bytes 0..127 used)
  }
}

export class StringVoice {
  /**
   * @param name   voice name
   * @param shift  outer tap shift a (filter y = x[-1]>>a + x[+1]>>a - x>>(a-1) + x)
   * @param drum   Percussion behaviour (fixed pitch, fast evolution, random sign flips)
   */
  constructor(name, shift, drum = false) {
    this.name = name; this.a = shift; this.b = shift - 1; this.drum = drum;
    this.inst = [];
  }
  instantiate(ch) { this.inst[ch] = new Instance(); return true; }
  free(ch) { this.inst[ch] = null; }
  data(ch) { return this.inst[ch] ?? (this.inst[ch] = new Instance()); }

  gateOn(sys, ch, c, out) {
    const d = this.data(ch);
    const r = d.r;
    let r3 = c.duration & 0xFFF;                  // mask to 12 bits (centiseconds)
    const r4 = CENTISEC;
    const r5 = ((this.drum ? 0x400 : CENTISEC >> 1) | 0xFFFF0000) | 0;   // force the evolution acc to overflow early
    const r2 = amp7ToLinearLocal(c.ampGate);
    let r1;
    if (this.drum) r1 = ((r[1] & 0xFFFF0000) | 0x100) | 0;
    else r1 = (((c.pitch & 0x7FFFFFFF) & 0xFFFF) | (r[1] & 0xFFFF0000)) | 0;
    d.seedL = RAND_SEED; d.seedH = RAND_SEED;
    r[1] = r1; r[2] = r2; r[3] = r3; r[4] = r4; r[5] = r5;
    // Fill_RND: random +/- amplitude words from DLineSave up to WaveBuff, 32 at a time
    let s0 = d.seedL >>> 0, s1 = d.seedH >>> 0;
    const pos = r2 | 0, neg = (-r2) | 0;
    let p = 0;
    while (p < 130) {
      const carry = s0 & 1;                       // MOVS R2,R0,LSR #1
      let t = ((s0 >>> 1) | (s1 << 31)) >>> 0;
      s1 = ((s1 << 1) | carry) >>> 0;             // ADC R1,R1,R1
      t = (t ^ (s0 << 12)) >>> 0;
      s0 = (t ^ (t >>> 20)) >>> 0;
      for (let k = 0; k < 32; k++) {              // MOVS R0,R0,ROR #1 : extract bits
        const bit = s0 & 1;
        s0 = ((s0 >>> 1) | (bit << 31)) >>> 0;
        d.dline[p++] = bit ? pos : neg;
      }
    }
    d.seedL = s0 | 0; d.seedH = s1 | 0;
    this.filter(sys, d);
    out.fill(0);                                  // Fill_RND3: mute the first buffer
    return ACTIVE;
  }

  gateOff(sys, ch, c, out) { return this.zero(c, out, 0); }

  zero(c, out, i) {
    c.duration = 0;
    out.fill(0, i);
    return FORCE_FLUSH;
  }

  update(sys, ch, c, out) {
    const d = this.data(ch), r = d.r;
    let r3 = c.duration | 0, r4, r5;
    if (r3 === 0) { r3 = r[3]; r4 = r[4]; r5 = r[5]; }
    else { r3 &= 0xFFF; r4 = CENTISEC; r5 = ((this.drum ? 0x400 : CENTISEC >> 1) | 0xFFFF0000) | 0; }
    const w0 = (c.ampGate | (c.voice << 8) | (c.instance << 16) | (c.flags << 24)) | 0;
    const r2 = w0 === 0 ? r[2] : amp7ToLinearLocal(c.ampGate);
    let r1 = c.pitch | 0;
    if (r1 === 0) r1 = r[1];
    else if (this.drum) r1 = ((r[1] & 0xFFFF0000) | 0x100) | 0;
    else r1 = ((r1 & 0xFFFF) | (r[1] & 0xFFFF0000)) | 0;
    r[1] = r1; r[2] = r2; r[3] = r3; r[4] = r4; r[5] = r5;
    return this.fillWave(sys, c, d, out);
  }

  fill(sys, ch, c, out) { return this.fillWave(sys, c, this.data(ch), out); }

  fillWave(sys, c, d, out) {
    const r = d.r, wave = d.wave, len = out.length;
    let r1 = r[1], r3 = r[3], r4 = r[4], r5 = r[5];
    let i = 0;
    for (;;) {
      let v;
      [r4, v] = addsHalf(r4);                     // tempo advance
      if (v) {                                    // Fill_Period: a centisecond has passed
        r3 = (r3 - 1) | 0;
        if (r3 < 0) { r[1] = r1; r[3] = r3; r[4] = r4; r[5] = r5; return this.zero(c, out, i); }
      } else {
        [r5, v] = addsHalf(r5);                   // timbre advance
        if (v) { r[1] = r1; r[3] = r3; r[4] = r4; r[5] = r5; this.filter(sys, d); }
      }
      for (let k = 0; k < 4; k++) {               // Fill_Wave1
        r1 = (r1 + (r1 << 16)) | 0;
        out[i++] = wave[r1 >>> 25];
      }
      if (i >= len) { r[1] = r1; r[3] = r3; r[4] = r4; r[5] = r5; return ACTIVE; }
    }
  }

  /** FiltN: filter the 128-sample period and rebuild the log wavetable. */
  filter(sys, d) {
    const S = d.dline, a = this.a, b = this.b, log = sys.logTable, W = d.wave;
    const drum = this.drum;
    let seed = d.seedL | 0;
    let r4 = S[0], r5 = S[1];
    S[129] = ((r4 >> a) + (S[2] >> a) - (r5 >> b) + r5) | 0;   // new sample 0 as sample 128
    S[0] = S[128];                                // old sample 127 as sample -1
    for (let p = 1; p < 129; p += 4) {
      const x = [r4, r5, S[p + 1], S[p + 2], S[p + 3], S[p + 4]];
      for (let k = 0; k < 4; k++) {
        let y = ((x[k] >> a) + (x[k + 2] >> a) - (x[k + 1] >> b) + x[k + 1]) | 0;
        if (drum) {
          const carry = seed < 0;                 // MOVS R11,R11,LSL #1
          seed = (seed << 1) | 0;
          if (carry) { seed = (seed ^ RAND_MASK) | 0; y = (-y) | 0; }
        }
        S[p + k] = y;
        W[p - 1 + k] = log[y >>> 19];
      }
      r4 = x[4]; r5 = x[5];
    }
    if (drum) d.seedL = seed;
  }
}

/** StringLib/Percussion GateOn amplitude: 7-bit log -> 32-bit linear (as the ARM code). */
function amp7ToLinearLocal(ampGate) {
  const a = ampGate & 0x7F, c = a >> 4, s = a & 15;
  let r0 = ((c << 12) | s) + 0x10;                // ...CCC 0001SSSS
  r0 = ((r0 >>> 12) | (r0 << 20)) >>> 0;          // ROR #12
  r0 = c >= 32 ? 0 : (r0 << c) >>> 0;             // LSL by CCC
  r0 = (r0 - 0x01000000) >>> 0;                   // remove bias
  return (r0 >>> 1) | 0;
}

export const stringLibVoices = () => [
  new StringVoice('StringLib-Soft', 2),
  new StringVoice('StringLib-Pluck', 3),
  new StringVoice('StringLib-Steel', 4),
  new StringVoice('StringLib-Hard', 5),
];

export const percussionVoices = () => [
  new StringVoice('Percussion-Soft', 3, true),
  new StringVoice('Percussion-Medium', 4, true),
  new StringVoice('Percussion-Snare', 5, true),
  new StringVoice('Percussion-Noise', 6, true),
];
