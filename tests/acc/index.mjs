// node --test tests/acc : accessory apps (Alarm, Chars, CloseUp, Configure, Maestro, Printers, SciCalc, Squash, system apps).
import { suite, actions } from '../lib/suite.mjs';
suite('acc', [
  { name: 'squash formats', args: ['tests/acc/squash.test.mjs'], browser: false },
  ...actions('acc'),
]);
