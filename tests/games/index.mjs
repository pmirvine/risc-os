// node --test tests/games/index.mjs : the games family's scripts
// (tools/games): the library source check, and in a real browser (after
// node tools/disc-gamelib.mjs) the 'gamelib' import through
// GameLib$Path (jsrun-gamelib.mjs). The unit tests are the *.test.mjs
// files here: node --test tests/games finds them itself.
import { suite } from '../lib/suite.mjs';
suite('games', [
  { name: 'the library sources (Latin-1, 72 columns, 250 lines)', args: ['tools/disc-gamelib.mjs', '--check'], browser: false },
  { name: 'the game sources (Latin-1, 72 columns, 250 lines)', args: ['tools/disc-pacman.mjs', '--check'], browser: false },
  { name: "the 'gamelib' import", args: ['tests/games/jsrun-gamelib.mjs'] },
  { name: '!Pacman in the desktop', args: ['tests/core/shot.mjs', 'games-pacman', 'tests/games/pacman.mjs'] },
]);
