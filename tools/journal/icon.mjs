// The !Journal sprites, used by tools/disc-journal.mjs: the application's icon (a red notebook with a label
// and a gold pen across it), '!journal' 34 x 34 and 'sm!journal' 18 x 18, and the icons of a locked journal
// page (file type &1C6: a page of scribbled lines with a padlock), 'file_1c6' and 'small_1c6'. They are drawn
// with simple shapes onto character maps (tools/lib/spritewrite.mjs: one letter per Wimp colour).
import { sprite, spriteFile } from '../lib/spritewrite.mjs';

function canvas(n) {
  const g = Array.from({ length: n }, () => Array(n).fill('.'));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < n && y < n) g[y][x] = c; };
  return {
    put,
    rect(x0, y0, x1, y1, c, edge = null) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        put(x, y, edge && (x === x0 || x === x1 || y === y0 || y === y1) ? edge : c);
      }
    },
    line(x0, y0, x1, y1, c, w = 1) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(x0 + (x1 - x0) * i / steps), y = Math.round(y0 + (y1 - y0) * i / steps);
        for (let d = 0; d < w; d++) put(x + d, y, c);
      }
    },
    rows: () => g.map((r) => r.join('')),
  };
}

function book() {
  const c = canvas(34);
  c.rect(25, 5, 28, 30, 'C', 'K');                  // the pages' edges
  for (let y = 8; y < 29; y += 3) c.line(26, y, 27, y, 'w');
  c.rect(4, 3, 25, 31, 'R', 'K');                    // the cover
  c.rect(5, 4, 7, 30, 'O');                          // the spine
  c.rect(10, 9, 21, 15, 'C', 'K');                   // the label
  c.line(12, 11, 19, 11, 'D'); c.line(12, 13, 17, 13, 'D');
  c.rect(18, 31, 19, 33, 'B');                       // the ribbon
  // the pen, lying across the cover
  c.line(31, 8, 15, 26, 'K', 4);
  c.line(31, 8, 15, 26, 'Y', 3);
  c.line(31, 8, 28, 11, 'B', 3);   // its cap
  c.put(14, 27, 'K'); c.put(13, 28, 'K');           // its nib
  return c.rows();
}

function lockedPage() {
  const c = canvas(34);
  c.rect(6, 2, 27, 31, 'W', 'K');                                // the page
  // its folded corner: cut away above the diagonal, the fold below it
  for (let y = 2; y <= 8; y++) for (let x = 21; x <= 27; x++) {
    if (x - 21 > y - 2) c.put(x, y, '.');
    else c.put(x, y, x === 21 || y === 8 || x - 21 === y - 2 ? 'K' : 'w');
  }
  for (const [y, len] of [[12, 13], [15, 10], [18, 12], [21, 4]]) c.line(9, y, 9 + len, y, 'D');
  // the padlock
  c.rect(15, 16, 22, 22, 'W', 'D');                              // the shackle
  c.rect(16, 17, 21, 22, 'W');
  c.rect(13, 21, 24, 30, 'Y', 'K');                              // the body
  c.rect(18, 24, 19, 27, 'K');                                   // the keyhole
  return c.rows();
}

// the small ones, drawn by hand
const SMALL_BOOK = [
  '..................',
  '..............KK..',
  '.KKKKKKKKKKK.KYYK.',
  '.KOORRRRRRRKKYYK..',
  '.KOORRRRRRRKYYKK..',
  '.KOORKKKKKRYYKCK..',
  '.KOORKCCCKYYKKCK..',
  '.KOORKKKKYYKRKwK..',
  '.KOORRRRYYKRRKCK..',
  '.KOORRRYYKRRRKCK..',
  '.KOORRYYKRRRRKwK..',
  '.KOORKYKRRRRRKCK..',
  '.KOORKKRRRRRRKCK..',
  '.KOORRRRRRRRRKCK..',
  '.KOORRRRRRRRRKKK..',
  '.KKKKKKKKBBKKK....',
  '.........BB.......',
  '..................',
];
const SMALL_PAGE = [
  '..................',
  '..KKKKKKKKKK......',
  '..KWWWWWWWKwK.....',
  '..KWWWWWWWKwwK....',
  '..KWDDDDDWKKKKK...',
  '..KWWWWWWWWWWWK...',
  '..KWDDDDDDDDWWK...',
  '..KWWWWWWWWWWWK...',
  '..KWDDDDDWWWWWK...',
  '..KWWWWWDDDDWWK...',
  '..KWWWWWDWWDWWK...',
  '..KWWWWKKKKKKKK...',
  '..KWWWWKYYYYYYK...',
  '..KWWWWKYYKKYYK...',
  '..KWWWWKYYKKYYK...',
  '..KWWWWKYYYYYYK...',
  '..KKKKKKKKKKKKK...',
  '..................',
];

/** The sprite file for !Journal.!Sprites. */
export function iconFiles() {
  return {
    '!Sprites': spriteFile([
      sprite('!journal', book()), sprite('sm!journal', SMALL_BOOK),
      sprite('file_1c6', lockedPage()), sprite('small_1c6', SMALL_PAGE),
    ]),
  };
}

// node tools/journal/icon.mjs: show them as text
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const rows of [book(), SMALL_BOOK, lockedPage(), SMALL_PAGE]) console.log(rows.join('\n') + '\n');
}
