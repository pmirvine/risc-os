// node --test tests/browse : !Browse, the web browser (src/apps/Browse) and its engine (tools/browser-server.mjs).
// Each script starts its own server (ports 8396-8400); the engine's need a Chrome and are skipped without one.
import { suite } from '../lib/suite.mjs';
suite('browse', [
  { name: 'engine', args: ['tests/browse/engine.mjs'], browser: false },
  { name: 'app', args: ['tests/browse/app.mjs'] },
  { name: 'embedded', args: ['tests/browse/embedded.mjs'] },
]);
