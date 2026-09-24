// node --test tests/core : functional checks, persistence, every act-*.mjs action script and a short monkey run.
import { suite, actions } from '../lib/suite.mjs';
suite('core', [
  { name: 'test-core', args: ['tests/core/test-core.mjs'] },
  { name: 'test-persist', args: ['tests/core/test-persist.mjs'] },
  { name: 'monkey 300', args: ['tests/core/monkey.mjs', '300', '12345'], allow: [/^no errors$/] },
  ...actions('core'),
]);
