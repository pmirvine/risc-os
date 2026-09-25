// node --test tests/jstutor : the JavaScript tutorial ($.Manuals.JSTutor) and its example programs.
import { suite } from '../lib/suite.mjs';
suite('jstutor', [
  { name: 'book sources (listings, pictures, links)', args: ['tools/disc-jstutor.mjs', '--check'], browser: false },
  { name: 'example programs run', args: ['tests/jstutor/examples.mjs'] },
  { name: 'JSRun', args: ['tests/jstutor/jsrun.mjs'] },
]);
