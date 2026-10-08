// Icons for the games family: libIconFiles() is the !Sprites of !GameLib,
// the game library in !Boot.Resources (tools/disc-gamelib.mjs): a joystick,
// '!gamelib' 34 x 34 and 'sm!gamelib' 18 x 18. pacIconFiles() is that of
// !Pacman: a yellow disc with a mouth and a ghost, '!pacman' and
// 'sm!pacman'. Drawn with simple shapes onto character maps
// (tools/lib/spritewrite.mjs: one letter per Wimp colour).
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
    // a disc of radius r about (cx, cy), with a black rim; keep(dx, dy) cuts bits out
    disc(cx, cy, r, c, edge = 'K', keep = () => true) {
      for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d <= r * r && keep(x - cx, y - cy)) put(x, y, d > (r - 1) * (r - 1) ? edge : c);
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

// a joystick seen from the front: a base, a shaft, a red ball and a button
function stick(n, s) {
  const c = canvas(n);
  c.rect(s(3), s(21), s(30), s(31), 'd', 'K');
  c.rect(s(5), s(23), s(28), s(24), 'D');
  c.disc(s(26), s(27), Math.max(1, s(2)), 'R');
  c.line(s(15), s(20), s(12), s(11), 'K', Math.max(1, s(2)));
  c.disc(s(12), s(8), s(6), 'R');
  c.put(s(10), s(6), 'W');
  return c.rows();
}

// Pac-Man (a mouth cut in the right) and a red ghost behind him
function pac(n, s) {
  const c = canvas(n);
  const gx = s(25), gy = s(17), gr = s(8);
  c.disc(gx, gy, gr, 'R', 'K', (dx, dy) => dy <= 0 || Math.abs(dx) < gr);
  c.rect(gx - gr, gy, gx + gr, gy + gr, 'R', 'K');
  c.put(gx - s(3), gy - s(2), 'W'); c.put(gx + s(3), gy - s(2), 'W');
  const px = s(13), py = s(17), pr = s(11);
  c.disc(px, py, pr, 'Y', 'K', (dx, dy) => !(dx > 0 && Math.abs(dy) < dx * 0.6));
  c.put(px - s(1), py - s(6), 'K');
  return c.rows();
}

const big = (x) => x;
const small = (x) => Math.round(x * 18 / 34);

/** The sprite file for !GameLib.!Sprites. */
export function libIconFiles() {
  return { '!Sprites': spriteFile([sprite('!gamelib', stick(34, big)), sprite('sm!gamelib', stick(18, small))]) };
}

/** The sprite file for !Pacman.!Sprites. */
export function pacIconFiles() {
  return { '!Sprites': spriteFile([sprite('!pacman', pac(34, big)), sprite('sm!pacman', pac(18, small))]) };
}
