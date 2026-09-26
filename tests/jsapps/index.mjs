// node --test tests/jsapps : the second tutorial ($.Manuals.JSApps, "Writing Desktop Applications in JavaScript")
// and its example applications (tools/jsapps).
import { suite } from '../lib/suite.mjs';
suite('jsapps', [
  { name: 'book sources (listings, pictures, links)', args: ['tools/disc-jstutor.mjs', '--check', '--book', 'jsapps'], browser: false },
  { name: 'example programs run', args: ['tests/jstutor/examples.mjs'], env: { JSBOOK: 'jsapps' } },
]);
