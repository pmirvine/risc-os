// node --test tests/core : functional checks, persistence, every act-*.mjs action script and a short monkey run.
import { suite, actions } from '../lib/suite.mjs';
suite('core', [
  { name: 'test-core', args: ['tests/core/test-core.mjs'] },
  { name: 'test-persist', args: ['tests/core/test-persist.mjs'] },
  { name: 'test-hostfs', args: ['tests/core/test-hostfs.mjs'] },
  { name: 'test-hostfs-names', args: ['tests/core/test-hostfs-names.mjs'], browser: false },
  { name: 'monkey 300', args: ['tests/core/monkey.mjs', '300', '12345'], allow: [/^no errors$/] },
  // act-buttons checks the default (Acorn) mouse mapping; the other scripts use the two-button one (pw.mjs)
  ...actions('core').map((e) => (e.name === 'act-buttons.mjs' ? { ...e, env: { BUTTONS: 'acorn' } } : e)),
]);
