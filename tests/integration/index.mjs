// node --test tests/integration : cross-application flows (flows.mjs groups) and the long random test.
import { suite } from '../lib/suite.mjs';
const groups = ['dnd', 'print', 'help', 'chars', 'tw', 'configure', 'pinboard', 'shutdown', 'reset', 'basic'];
suite('integration', [
  ...groups.map((g) => ({ name: g, args: ['tests/integration/flows.mjs', g] })),
  { name: 'monkey (2 seeds x 1500 steps)', args: ['tests/integration/monkey.mjs', '1500', '1', '2'], timeout: 900000 },
]);
