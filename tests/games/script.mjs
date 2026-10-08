// Helpers for the !Pacman tests: play a game from a list of steps.
import { Game } from '../../tools/games/!Pacman/Game';

/** A game past its intro. */
export function playing(opts = {}) {
  const g = new Game({ seed: 1, ...opts });
  g.debug.skipIntro();
  return g;
}

/** Run a script of [want, frames] steps; returns every event. */
export function run(game, steps) {
  const events = [];
  for (const [want, n] of steps) {
    for (let i = 0; i < n; i++) events.push(...game.tick({ want }));
  }
  return events;
}
