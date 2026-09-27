// The !Lander2 application icon (!Sprites / !Sprites22), used by tools/disc-lander2.mjs.
// Placeholder: replaced by the drawn icon.
import { sprite, spriteFile } from '../lib/spritewrite.mjs';

const rows = Array.from({ length: 34 }, (_, y) => Array.from({ length: 34 }, (_, x) =>
  (y > 18 ? ((x >> 2) + (y >> 2)) % 2 ? 'G' : 'E' : Math.abs(x - 17) < (y - 2) && y > 4 && y < 14 ? 'W' : '.')).join(''));

/** { '!Sprites': Buffer, '!Sprites22'?: Buffer } */
export function iconFiles() {
  return { '!Sprites': spriteFile([sprite('!lander2', rows)]) };
}
