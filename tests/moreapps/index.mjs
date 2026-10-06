// node --test tests/moreapps/index.mjs : the moreapps family's scripts
// (tools/moreapps): the disc checks, and in a real browser (after node
// tools/disc-wimplib.mjs and disc-moreapps.mjs) the 'wimplib' import
// through WimpLib$Path (jsrun-wimplib.mjs), !Boot.Resources.!WimpLib and
// $.MoreApps booted at desktop start (boot.mjs), and the !Word stub
// opening and saving .docx files (word.mjs, word-life.mjs), its caret and
// selection (word-edit.mjs), also on hostile documents
// (word-edit-hostile.mjs), and typing, deleting and undo in it
// (word-typing.mjs), also against hostile input (word-typing-
// hostile.mjs). The unit tests are the *.test.mjs files
// here: node --test tests/moreapps finds them itself.
import { suite } from '../lib/suite.mjs';
suite('moreapps', [
  { name: 'disc files (Latin-1, 72 columns)', args: ['tools/disc-moreapps.mjs', '--check'], browser: false },
  { name: 'the library sources (Latin-1, 72 columns, 250 lines)', args: ['tools/disc-wimplib.mjs', '--check'], browser: false },
  { name: "the 'wimplib' import and the !Word stub", args: ['tests/moreapps/jsrun-wimplib.mjs'] },
  { name: 'WimpLib and $.MoreApps booted at start-up (cold boot)', args: ['tests/moreapps/boot.mjs'] },
  { name: '!Word opens a .docx and saves a faithful copy', args: ['tests/moreapps/word.mjs'] },
  { name: '!Word: click, drag and keys select; the caret', args: ['tests/moreapps/word-edit.mjs'] },
  { name: '!Word: hostile and odd documents (huge words, absurd sizes, random input)', args: ['tests/moreapps/word-edit-hostile.mjs'] },
  { name: '!Word: typing, deleting, undo and redo; input methods; hostile input', args: ['tests/moreapps/word-typing.mjs'] },
  { name: '!Word: typing against hostile input (storms, 50,000 paragraphs, 500 random actions)', args: ['tests/moreapps/word-typing-hostile.mjs'] },
  { name: '!Word without its fonts; open, close and Quit leave nothing behind', args: ['tests/moreapps/word-life.mjs'] },
]);
