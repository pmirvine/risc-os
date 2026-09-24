// node --test tests/div : Diversions and multimedia apps.
import { suite, actions } from '../lib/suite.mjs';
suite('div', [
  { name: 'arplayer-node', args: ['tests/div/arplayer-node.mjs'], browser: false },
  { name: 'bookworm-links', args: ['tests/div/bookworm-links.mjs'], browser: false },
  { name: 'hopper-node', args: ['tests/div/hopper-node.mjs'], browser: false },
  { name: 'smoke-diversions', args: ['tests/div/smoke-diversions.mjs'] },
  ...['ChangeFSI', 'PhotoView', 'ARPlayer', 'Bookworm', 'Player'].map((a) => ({ name: 'monkey ' + a, args: ['tests/div/monkey-div.mjs', a, '150', '7'] })),
  ...actions('div', /^(?!monkey|smoke|arplayer-node|bookworm-links|hopper-node).*\.mjs$/),
]);
