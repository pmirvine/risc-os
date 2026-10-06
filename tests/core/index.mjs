// node --test tests/core : functional checks, persistence, every act-*.mjs action script and a short monkey run.
import { suite, actions } from '../lib/suite.mjs';
suite('core', [
  { name: 'test-core', args: ['tests/core/test-core.mjs'] },
  { name: 'test-persist', args: ['tests/core/test-persist.mjs'] },
  { name: 'test-appkit', args: ['tests/core/test-appkit.mjs'] },
  { name: 'test-hostfs', args: ['tests/core/test-hostfs.mjs'] },
  { name: 'test-hostfs-app', args: ['tests/core/test-hostfs-app.mjs'] },
  { name: 'test-hostfs-names', args: ['tests/core/test-hostfs-names.mjs'], browser: false },
  { name: 'test-memory', args: ['tests/core/test-memory.mjs'], browser: false },
  { name: 'test-textinput', args: ['tests/core/test-textinput.mjs'] },
  { name: 'test-textinput-pure', args: ['tests/core/test-textinput-pure.mjs'], browser: false },
  { name: 'test-taskmanager', args: ['tests/core/test-taskmanager.mjs'] },
  { name: 'monkey 300', args: ['tests/core/monkey.mjs', '300', '12345'], allow: [/^no errors$/] },
  // act-buttons checks the default (Acorn) mouse mapping; the other scripts use the two-button one (pw.mjs)
  ...actions('core').map((e) => (e.name === 'act-buttons.mjs' ? { ...e, env: { BUTTONS: 'acorn' } } : e)),
]);
