// node --test tests/browse : !Browse, the web browser (src/apps/Browse) and its engine (tools/browser-server.mjs).
import { suite } from '../lib/suite.mjs';
suite('browse', [
  { name: 'engine', args: ['tests/browse/engine.mjs'], browser: false },
]);
