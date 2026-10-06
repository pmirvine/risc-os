// The !Word sprites, used by tools/disc-moreapps.mjs: the application's icon (a blue document page with a white
// W on it), '!word' 34 x 34 and 'sm!word' 18 x 18, and the icons of Word documents: .docx (file type &A7E,
// 'file_a7e' / 'small_a7e': a white page with a blue W in its corner) and the older .doc (&AE6, 'file_ae6' /
// 'small_ae6': the same page with a dark blue W). The system sprite pools have none of these. They are drawn
// with simple shapes onto character maps (tools/lib/spritewrite.mjs: one letter per Wimp colour).
// libIconFiles(): the icon of !WimpLib, the library in !Boot.Resources (tools/disc-wimplib.mjs): books on a
// shelf, '!wimplib' 34 x 34 and 'sm!wimplib' 18 x 18.
// barSprites(): the buttons of !Word's toolbar (WimpLib Ui/Toolbar, !Word ToolbarBind), 20 x 20, named wb_* so
// that they meet no other sprite in the Wimp's pool: bold, italic, underline, strike, super, sub, the four
// alignments, indent more / less, colour (an A: the toolbar draws the colour under it), highlight, clear and
// style. (No zoom button: zoom is on the window menu and Ctrl+wheel, the toolbar has no room.) Letters come from the small bitmaps in GLYPHS; the rest are lines and triangles. A pressed button
// is shown by its slab border going in and its highlight colour (validation R5), so no pressed variants.
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

// a page with its top right corner folded over: x0..x1, y0..y1, fold f pixels
function page(c, x0, y0, x1, y1, f, fill) {
  c.rect(x0, y0, x1, y1, fill, 'K');
  for (let y = y0; y <= y0 + f; y++) for (let x = x1 - f; x <= x1; x++) {
    const dx = x - (x1 - f), dy = y - y0;
    if (dx > dy) c.put(x, y, '.');
    else c.put(x, y, x === x1 - f || y === y0 + f || dx === dy ? 'K' : 'w');
  }
}

// a W from (x0, y0) to (x1, y1), strokes w wide
function letterW(c, x0, y0, x1, y1, col, w) {
  const q = (x1 - x0) / 4, mid = Math.round(y0 + (y1 - y0) * 0.45);
  const xs = [0, 1, 2, 3, 4].map((i) => Math.round(x0 + q * i));
  c.line(xs[0], y0, xs[1], y1, col, w);
  c.line(xs[1], y1, xs[2], mid, col, w);
  c.line(xs[2], mid, xs[3], y1, col, w);
  c.line(xs[3], y1, xs[4], y0, col, w);
}

function appIcon() {
  const c = canvas(34);
  page(c, 5, 1, 28, 32, 6, 'B');
  letterW(c, 8, 11, 23, 25, 'W', 3);
  return c.rows();
}

function appSmall() {
  const c = canvas(18);
  page(c, 2, 0, 15, 17, 3, 'B');
  letterW(c, 4, 6, 12, 13, 'W', 2);
  return c.rows();
}

// a document page with lines of text and a W badge in its bottom left corner
function docIcon(badge) {
  const c = canvas(34);
  page(c, 6, 1, 27, 32, 6, 'W');
  for (const [y, len] of [[10, 13], [13, 15], [16, 10]]) c.line(10, y, 9 + len, y, 'l');
  c.rect(3, 19, 18, 31, badge, 'K');
  letterW(c, 5, 22, 15, 28, 'W', 2);
  return c.rows();
}

function docSmall(badge) {
  const c = canvas(18);
  page(c, 3, 0, 15, 17, 3, 'W');
  for (const [y, len] of [[5, 7], [7, 9], [9, 6]]) c.line(5, y, 4 + len, y, 'l');
  c.rect(0, 10, 10, 17, badge, 'K');
  letterW(c, 1, 12, 9, 15, 'W', 1);
  return c.rows();
}

// books standing on a shelf: [x0, x1, top, colour] each, the shelf at the bottom
function books(n, list, bands) {
  const c = canvas(n);
  const floor = n - 4;
  for (const [x0, x1, top, col] of list) {
    c.rect(x0, top, x1, floor, col, 'K');
    for (const dy of bands) c.line(x0 + 1, top + dy, x1 - 1, top + dy, 'Y');
  }
  c.rect(0, floor + 1, n - 1, n - 1, 'O', 'K');
  return c.rows();
}

const libIcon = () => books(34, [[4, 10, 7, 'R'], [11, 17, 3, 'B'], [18, 23, 9, 'E'], [24, 29, 5, 'L']], [3, 18]);
const libSmall = () => books(18, [[1, 5, 4, 'R'], [6, 10, 1, 'B'], [11, 16, 3, 'E']], [2]);

// ---------------------------------------------------------------- the toolbar's buttons
const GLYPHS = {
  B: ['KKKKKKK..', 'KKKKKKKK.', 'KK....KKK', 'KK.....KK', 'KK....KKK', 'KKKKKKKK.', 'KKKKKKKKK', 'KK.....KK',
    'KK.....KK', 'KK....KKK', 'KKKKKKKK.', 'KKKKKKK..'],
  I: ['...KKKKK.', '.....KK..', '.....KK..', '....KK...', '....KK...', '....KK...', '...KK....', '...KK....',
    '...KK....', '..KK.....', '..KK.....', 'KKKKK....'],
  U: ['KK.....KK', 'KK.....KK', 'KK.....KK', 'KK.....KK', 'KK.....KK', 'KK.....KK', 'KK.....KK', 'KK.....KK',
    '.KK...KK.', '..KKKKK..'],
  S: ['..KKKKKK.', '.KK....KK', 'KK.......', 'KK.......', '.KKK.....', '...KKKK..', '......KKK', '.......KK',
    '.......KK', 'KK....KK.', '.KKKKKK..'],
  x: ['KK...KK', '.KK.KK.', '..KKK..', '..KKK..', '.KK.KK.', 'KK...KK'],
  2: ['BBB.', '...B', '.BB.', 'B...', 'BBBB'],
  A: ['....KK....', '...KKKK...', '...K..K...', '..KK..KK..', '..KK..KK..', '.KKKKKKKK.', '.KK....KK.',
    'KK......KK', 'KK......KK'],
  P: ['.KKKKKKK', 'KKKKK.K.', 'KKKKK.K.', 'KKKKK.K.', '.KKKK.K.', '...KK.K.', '....K.K.', '....K.K.',
    '....K.K.', '....K.K.', '....K.K.'],
};

function glyph(c, ch, x0, y0, col = null) {
  GLYPHS[ch].forEach((row, y) => [...row].forEach((k, x) => { if (k !== '.') c.put(x0 + x, y0 + y, col ?? k); }));
}

const N = 20;
// lines across, 3 px apart, from y 3: [x0, length] each
function lines(spec) {
  const c = canvas(N);
  spec.forEach(([x, len], i) => c.line(x, 3 + 3 * i, x + len - 1, 3 + 3 * i, 'K'));
  return c;
}
const ALIGN = {
  left: [[2, 16], [2, 10], [2, 16], [2, 10], [2, 16]],
  centre: [[2, 16], [5, 10], [2, 16], [5, 10], [2, 16]],
  right: [[2, 16], [8, 10], [2, 16], [8, 10], [2, 16]],
  justify: [[2, 16], [2, 16], [2, 16], [2, 16], [2, 16]],
};
// a triangle pointing right (dir 1) or left (-1), its base at x, centred on row y
function triangle(c, x, y, dir) {
  for (let i = 0; i < 4; i++) for (let j = i - 3; j <= 3 - i; j++) c.put(x + dir * i, y + j, 'B');
}
function indent(dir) {
  const c = lines([[2, 16], [9, 9], [9, 9], [9, 9], [2, 16]]);
  triangle(c, dir > 0 ? 3 : 6, 9, dir);
  return c.rows();
}
const letter = (ch, x, y, more) => { const c = canvas(N); glyph(c, ch, x, y); more?.(c); return c.rows(); };

const BAR = {
  wb_bold: () => letter('B', 5, 4, (c) => glyph(c, 'B', 6, 4)),
  wb_italic: () => letter('I', 6, 4),
  wb_underline: () => letter('U', 5, 3, (c) => c.rect(4, 15, 15, 16, 'K')),
  wb_strike: () => letter('S', 5, 4, (c) => c.rect(3, 9, 16, 9, 'R')),
  wb_super: () => letter('x', 4, 9, (c) => glyph(c, 2, 12, 3)),
  wb_sub: () => letter('x', 4, 5, (c) => glyph(c, 2, 12, 12)),
  wb_left: () => lines(ALIGN.left).rows(),
  wb_centre: () => lines(ALIGN.centre).rows(),
  wb_right: () => lines(ALIGN.right).rows(),
  wb_justify: () => lines(ALIGN.justify).rows(),
  wb_indmore: () => indent(1),
  wb_indless: () => indent(-1),
  wb_colour: () => letter('A', 5, 2),
  wb_highlight: () => {
    const c = canvas(N);
    c.line(15, 2, 8, 9, 'K', 3);
    c.line(16, 3, 9, 10, 'd', 1);
    c.rect(6, 10, 8, 12, 'K');
    c.rect(2, 15, 17, 18, 'Y', 'K');
    return c.rows();
  },
  wb_clear: () => letter('A', 1, 2, (c) => { c.line(10, 11, 17, 18, 'R', 2); c.line(17, 11, 10, 18, 'R', 2); }),
  wb_style: () => letter('P', 6, 4),
};

/** The toolbar's sprites (see the header): [[name, rows]]. */
export const barSprites = () => Object.entries(BAR).map(([n, f]) => [n, f()]);

/** The sprite file for !WimpLib.!Sprites. */
export function libIconFiles() {
  return { '!Sprites': spriteFile([sprite('!wimplib', libIcon()), sprite('sm!wimplib', libSmall())]) };
}

/** The sprite file for !Word.!Sprites. */
export function iconFiles() {
  return {
    '!Sprites': spriteFile([
      sprite('!word', appIcon()), sprite('sm!word', appSmall()),
      sprite('file_a7e', docIcon('L')), sprite('small_a7e', docSmall('L')),
      sprite('file_ae6', docIcon('B')), sprite('small_ae6', docSmall('B')),
      ...barSprites().map(([n, rows]) => sprite(n, rows)),
    ]),
  };
}

// node tools/moreapps/icon.mjs: show them as text
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const rows of [appIcon(), appSmall(), docIcon('L'), docSmall('L'), libIcon(), libSmall()]) console.log(rows.join('\n') + '\n');
  for (const [n, rows] of barSprites()) console.log(n + '\n' + rows.join('\n') + '\n');
}
