// node --test tests/paint : sprite file round trips and the Paint end-to-end scripts.
import { suite } from '../lib/suite.mjs';
suite('paint', [
  { name: 'sprite round trip', args: ['tests/paint/roundtrip.mjs'], browser: false },
  ...['act-basic', 'act-full', 'act-snapshot', 'act-tools2'].map((f) => ({ name: f, args: ['tests/paint/pw.mjs', `tests/paint/${f}.mjs`] })),
]);
