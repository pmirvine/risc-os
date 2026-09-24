// !Hopper's Choices:Hopper.Choices (keys.c keys_write_out_prefs: 13 words) and Choices:Hopper.HiScores (hopper.c
// hopper_save_hi: 10 x [score word, 40 byte name]) files.

/** keys.c keys_default_prefs. */
export const defaultPrefs = () => ({ up: 207, down: 232, left: 225, right: 194, soundFx: 1, ingame: 1, intro: 1, saveHi: 1,
  fxVol: 64, musicVol: 48, musicSpeed: 1, update: 0, autoRepeat: 0 });
export const PREF_ORDER = ['up', 'down', 'left', 'right', 'soundFx', 'ingame', 'intro', 'saveHi', 'fxVol', 'musicVol', 'musicSpeed', 'update', 'autoRepeat'];
/** hopper_reset_hi: ten entries of 1000 "Hopper" (plus the 11th slot used while inserting). */
export const resetHi = () => Array.from({ length: 11 }, () => ({ name: 'Hopper', score: 1000 }));

export function readPrefs(bytes) {
  const p = defaultPrefs();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  PREF_ORDER.forEach((k, i) => { if (i * 4 + 4 <= bytes.length) p[k] = v.getInt32(i * 4, true); });
  return p;
}
export function writePrefs(p) {
  const b = new Uint8Array(PREF_ORDER.length * 4), v = new DataView(b.buffer);
  PREF_ORDER.forEach((k, i) => v.setInt32(i * 4, p[k] | 0, true));
  return b;
}
export function readHi(bytes) {
  const hi = resetHi(), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 10 && i * 44 + 44 <= bytes.length; i++) {
    const nb = bytes.subarray(i * 44 + 4, i * 44 + 44), z = nb.indexOf(0);
    hi[i] = { score: v.getInt32(i * 44, true), name: String.fromCharCode(...nb.subarray(0, z < 0 ? 40 : z)) };
  }
  return hi;
}
export function writeHi(hi) {
  const b = new Uint8Array(440), v = new DataView(b.buffer);
  for (let i = 0; i < 10; i++) {
    v.setInt32(i * 44, hi[i].score | 0, true);
    const n = hi[i].name.slice(0, 39);
    for (let j = 0; j < n.length; j++) b[i * 44 + 4 + j] = n.charCodeAt(j) & 255;
  }
  return b;
}
