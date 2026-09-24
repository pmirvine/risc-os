// node --test tests/edit : Edit and Help action scripts, and the browser-resize check.
import { suite, actions } from '../lib/suite.mjs';
suite('edit', [
  { name: 'resize', args: ['tests/edit/resize.mjs'] },
  ...actions('edit'),
]);
