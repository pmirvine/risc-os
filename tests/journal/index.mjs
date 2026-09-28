// node --test tests/journal : !Journal ($.Apps.!Journal, tools/journal) - its Check program, and the
// application in a real browser (tests/journal/journal.mjs).
import { suite } from '../lib/suite.mjs';
suite('journal', [
  { name: 'disc files (Latin-1, 72 columns)', args: ['tools/disc-journal.mjs', '--check'], browser: false },
  { name: 'the Journal', args: ['tests/journal/journal.mjs'] },
]);
