// RISC OS 3.71 sound system constants and tables, taken from the ARM sources
// (vendor/ro371/Sources/OS_Core/HWSupport/Sound):
//   Sound0 (SoundDMA)      - sample period, buffer length, the mu-law -> 16-bit linear table
//   Sound1 (SoundChannels) - BuildLogTable (linear -> log + the log amplitude table), PitchTab,
//                            the BBC pitch constants and the pitch -> phase increment code
// Pure data/functions, no dependencies (runs in node, the browser and an AudioWorklet).

/** Default sample period in microseconds per channel sample (Sound0 SCPeriod). */
export const SAMPLE_PERIOD = 48;
/** Samples per second per channel at the default period: 20833.33 Hz. */
export const SAMPLE_RATE = 1e6 / SAMPLE_PERIOD;
/** Samples per channel in each DMA buffer (Sound0 SCBufferLen, &D0). */
export const BUFFER_LEN = 208;
/** Seconds per buffer fill: 208 * 48us = 9.984 ms, the "centisecond" of durations. */
export const FILL_PERIOD = BUFFER_LEN * SAMPLE_PERIOD / 1e6;
/** Largest magnitude in the 12-bit linear scale of the VIDC log DAC. */
export const LINEAR_MAX = 3952;

/**
 * VIDC 8-bit log ("mu-law") sample -> linear (Sound0 convtable, used for 16-bit output).
 * Bit 0 is the sign, bits 1-7 the magnitude m: chord c = m>>4, point p = m&15, value =
 * 16 * (2^c - 1) + p * 2^c, i.e. 0 1 2 .. 15 16 18 .. 46 48 52 ... 3824 3952.
 */
export const LOG_TO_LINEAR = (() => {
  const t = new Int16Array(256);
  for (let b = 0; b < 256; b++) {
    const m = b >> 1, c = m >> 4, p = m & 15;
    const v = 16 * ((1 << c) - 1) + p * (1 << c);
    t[b] = b & 1 ? -v : v;
  }
  return t;
})();

/** Attenuation in log steps for a Sound_Volume value (1..127). */
const attenOf = (maxAmp) => 127 - (maxAmp & 0x7F);

/**
 * Sound1 BuildLogTable: the 8K linear -> log table, indexed by a 13-bit two's complement
 * linear value (a 32-bit sample >>> 19), scaled by the master volume (Sound_Volume).
 */
export function buildLogTable(maxAmp) {
  const atten = attenOf(maxAmp);
  const t = new Uint8Array(8192);
  let pos = 0, neg = 8192, amp = 0;
  t[pos++] = 0;                             // 0 is a special case
  let bytesPerStep = 1;
  for (;;) {                                // InitChord
    for (let steps = 15; steps >= 0; steps--) {   // 16 steps per chord
      amp += 2;
      if (amp > 0xFE) amp = 0xFE;
      let v = amp - 2 * atten;
      if (v < 0) v = 0;
      const n = v | 1;
      for (let k = bytesPerStep; k > 0; k--) {
        t[pos++] = v;
        t[--neg] = n;
        if (pos >= neg) return t;
      }
    }
    bytesPerStep <<= 1;
  }
}

/**
 * Sound1 AmpLUT (SoundLevel1AmpTable): 256 bytes, entry i = max(0, i - 2 * attenuation).
 * WaveSynth reads it at index 2*amp to scale a 7-bit note amplitude by the master volume.
 */
export function buildAmpTable(maxAmp) {
  const atten = attenOf(maxAmp);
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = Math.max(0, i - 2 * atten);
  return t;
}

/**
 * The 7-bit log amplitude -> 32-bit linear conversion used by StringLib and Percussion
 * GateOn: ((SSSS+16) x 2^CCC - 16) x 2^19 (plus the ARM code's small C<<C residue).
 */
export function amp7ToLinear32(amp) {
  const a = amp & 0x7F, c = a >> 4, s = a & 15;
  const r0 = ((16 + s) * 2 ** (20 + c) + (c << c) - 0x01000000) % 4294967296;
  return Math.floor(((r0 + 4294967296) % 4294967296) / 2);
}

/** Sound1 PitchTab: 2^30 * 2^(i/256), 256 entries of 32-bit fraction. */
export const PITCH_TAB = new Uint32Array([
  0x40000000, 0x402C6BEA, 0x4058F6A8, 0x4085A051, 0x40B268FA, 0x40DF50B9, 0x410C57A2, 0x41397DCC,
  0x4166C34D, 0x41942839, 0x41C1ACA8, 0x41EF50AE, 0x421D1462, 0x424AF7DA, 0x4278FB2B, 0x42A71E6D,
  0x42D561B4, 0x4303C518, 0x433248AE, 0x4360EC8D, 0x438FB0CC, 0x43BE9580, 0x43ED9AC0, 0x441CC0A4,
  0x444C0741, 0x447B6EAE, 0x44AAF702, 0x44DAA054, 0x450A6ABB, 0x453A564E, 0x456A6323, 0x459A9152,
  0x45CAE0F2, 0x45FB521B, 0x462BE4E2, 0x465C9961, 0x468D6FAE, 0x46BE67E1, 0x46EF8210, 0x4720BE55,
  0x47521CC6, 0x47839D7B, 0x47B5408C, 0x47E70611, 0x4818EE22, 0x484AF8D6, 0x487D2646, 0x48AF768A,
  0x48E1E9BA, 0x49147FEE, 0x4947393F, 0x497A15C5, 0x49AD1598, 0x49E038D1, 0x4A137F88, 0x4A46E9D7,
  0x4A7A77D5, 0x4AAE299C, 0x4AE1FF44, 0x4B15F8E6, 0x4B4A169C, 0x4B7E587E, 0x4BB2BEA5, 0x4BE7492B,
  0x4C1BF829, 0x4C50CBB8, 0x4C85C3F1, 0x4CBAE0EF, 0x4CF022CA, 0x4D25899C, 0x4D5B157F, 0x4D90C68C,
  0x4DC69CDD, 0x4DFC988D, 0x4E32B9B4, 0x4E69006E, 0x4E9F6CD4, 0x4ED5FF00, 0x4F0CB70D, 0x4F439514,
  0x4F7A9931, 0x4FB1C37D, 0x4FE91413, 0x50208B0E, 0x50582888, 0x508FEC9C, 0x50C7D765, 0x50FFE8FE,
  0x51382182, 0x5170810B, 0x51A907B5, 0x51E1B59A, 0x521A8AD7, 0x52538787, 0x528CABC4, 0x52C5F7AA,
  0x52FF6B55, 0x533906E1, 0x5372CA68, 0x53ACB608, 0x53E6C9DB, 0x542105FD, 0x545B6A8C, 0x5495F7A1,
  0x54D0AD5B, 0x550B8BD4, 0x5546932A, 0x5581C378, 0x55BD1CDB, 0x55F89F70, 0x56344B53, 0x567020A0,
  0x56AC1F75, 0x56E847EF, 0x57249A2A, 0x57611643, 0x579DBC57, 0x57DA8C84, 0x581786E6, 0x5854AB9C,
  0x5891FAC1, 0x58CF7475, 0x590D18D4, 0x594AE7FB, 0x5988E20A, 0x59C7071D, 0x5A055751, 0x5A43D2C7,
  0x5A82799A, 0x5AC14BEA, 0x5B0049D5, 0x5B3F7378, 0x5B7EC8F2, 0x5BBE4A62, 0x5BFDF7E6, 0x5C3DD19C,
  0x5C7DD7A4, 0x5CBE0A1C, 0x5CFE6923, 0x5D3EF4D8, 0x5D7FAD59, 0x5DC092C7, 0x5E01A540, 0x5E42E4E3,
  0x5E8451D0, 0x5EC5EC26, 0x5F07B405, 0x5F49A98C, 0x5F8BCCDC, 0x5FCE1E13, 0x60109D51, 0x60534AB7,
  0x60962665, 0x60D9307B, 0x611C6919, 0x615FD05F, 0x61A3666D, 0x61E72B65, 0x622B1F66, 0x626F4292,
  0x62B39509, 0x62F816EC, 0x633CC85B, 0x6381A978, 0x63C6BA64, 0x640BFB41, 0x64516C2E, 0x64970D4F,
  0x64DCDEC3, 0x6522E0AE, 0x6569132F, 0x65AF766A, 0x65F60A80, 0x663CCF92, 0x6683C5C3, 0x66CAED36,
  0x6712460B, 0x6759D065, 0x67A18C68, 0x67E97A34, 0x683199EE, 0x6879EBB6, 0x68C26FB1, 0x690B2601,
  0x69540EC9, 0x699D2A2C, 0x69E6784D, 0x6A2FF94F, 0x6A79AD56, 0x6AC39485, 0x6B0DAF00, 0x6B57FCE9,
  0x6BA27E66, 0x6BED3399, 0x6C381CA6, 0x6C8339B3, 0x6CCE8AE1, 0x6D1A1057, 0x6D65CA38, 0x6DB1B8A8,
  0x6DFDDBCC, 0x6E4A33C9, 0x6E96C0C3, 0x6EE382DF, 0x6F307A41, 0x6F7DA710, 0x6FCB0970, 0x7018A185,
  0x70666F76, 0x70B47368, 0x7102AD80, 0x71511DE4, 0x719FC4BA, 0x71EEA226, 0x723DB650, 0x728D015E,
  0x72DC8374, 0x732C3CBA, 0x737C2D56, 0x73CC556E, 0x741CB528, 0x746D4CAC, 0x74BE1C20, 0x750F23AB,
  0x75606374, 0x75B1DBA2, 0x76038C5B, 0x765575C8, 0x76A79810, 0x76F9F359, 0x774C87CC, 0x779F5591,
  0x77F25CCE, 0x78459DAD, 0x78991854, 0x78ECCCED, 0x7940BB9E, 0x7994E492, 0x79E947EF, 0x7A3DE5DF,
  0x7A92BE8B, 0x7AE7D21A, 0x7B3D20B6, 0x7B92AA89, 0x7BE86FBA, 0x7C3E7073, 0x7C94ACDE, 0x7CEB2524,
  0x7D41D96E, 0x7D98C9E6, 0x7DEFF6B7, 0x7E476009, 0x7E9F0607, 0x7EF6E8DB, 0x7F4F08AE, 0x7FA765AD,
]);

/** BBCPitchInc16 = 65536 * 4096 / 48 (truncated), BBCPitchBase = &4000 - 53*4096/48. */
export const BBC_PITCH_INC16 = Math.floor(65536 * 4096 / 48);
export const BBC_PITCH_BASE = 0x4000 - Math.floor(53 * 4096 / 48);
/** Default Sound_Tuning value, DefMasterPitch = &AAB0 - &4000. */
export const DEF_MASTER_PITCH = 0xAAB0 - 0x4000;

/** BBC pitch 0..255 (48 steps per octave, 53 = middle C) -> 15-bit RISC OS pitch (&4000 = middle C). */
export function bbcPitchTo15(p) {
  return (Math.imul(p | 0, BBC_PITCH_INC16) >>> 16) + BBC_PITCH_BASE;   // MUL, LSR #16, ADD
}

/**
 * Sound_Pitch / SoundShared pitch processing: pitch -> 16-bit phase increment.
 *   pitch < 256      BBC pitch (converted with BBCPitchInc16/BBCPitchBase)
 *   256..&7FFF       15-bit pitch: 3-bit octave, 12-bit fraction (8 bits significant), &4000 = middle C
 *   >= &8000         the phase increment itself (low 16 bits)
 * master is the Sound_Tuning value (added to the 15-bit pitch).
 */
export function pitchToInc(pitch, master = DEF_MASTER_PITCH) {
  pitch |= 0;                                     // the ARM compares are signed
  if (pitch >= 0x8000) return pitch & 0xFFFF;
  const r2 = pitch < 256 ? bbcPitchTo15(pitch) : pitch;
  const v = (r2 + master) >>> 0;
  let rot = ((v >>> 12) | (v << 20)) >>> 0;       // octave to the bottom 4 bits
  rot = (rot & ~0x00FF0000) >>> 0;                // force to a word index
  const frac = PITCH_TAB[rot >>> 24];
  const shift = (rot ^ 0x1F) & 0xFF;              // invert the octave
  return (shift >= 32 ? 0 : frac >>> shift) & 0xFFFF;
}

/** Frequency in Hz of a phase increment: the oscillators add inc to a 16-bit phase each sample. */
export const incToHz = (inc, sampleRate = SAMPLE_RATE) => inc * sampleRate / 65536;

/** Frequency in Hz a SOUND pitch plays at (with the default tuning and sample period). */
export const pitchToHz = (pitch, master) => incToHz(pitchToInc(pitch, master));
