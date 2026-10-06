// node --test tests/moreapps/index.mjs : the moreapps family's scripts
// (tools/moreapps): the disc checks, and in a real browser (after node
// tools/disc-wimplib.mjs and disc-moreapps.mjs) the 'wimplib' import
// through WimpLib$Path (jsrun-wimplib.mjs), !Boot.Resources.!WimpLib and
// $.MoreApps booted at desktop start (boot.mjs), and the !Word stub
// opening and saving .docx files (word.mjs, word-life.mjs), its caret and
// selection (word-edit.mjs), also on hostile documents
// (word-edit-hostile.mjs), and typing, deleting and undo in it
// (word-typing.mjs), also against hostile input (word-typing-
// hostile.mjs), and formatting: as drawn, by keys and the Format menu (word-format.mjs), and by its toolbar
// (word-toolbar.mjs) and its ruler (word-ruler.mjs); zoom (word-zoom.mjs); formatting against hostile input
// (word-format-hostile.mjs). The unit tests are the *.test.mjs files
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
  { name: '!Word: formatting shown (highlight, superscript, subscript, justified text); keys, pending format, the Format menu', args: ['tests/moreapps/word-format.mjs'] },
  { name: '!Word: the toolbar (style, font, size, B I U, colour, highlight, alignment); the page below it; leaks', args: ['tests/moreapps/word-toolbar.mjs'] },
  { name: '!Word: the ruler (indent markers dragged, snapping, clamping, show/hide, scroll); leaks', args: ['tests/moreapps/word-ruler.mjs'] },
  { name: '!Word: zoom (clicks, drags, caret, selection, scrolling, ruler at 50/100/200%; Ctrl+wheel; menu; 50,000 paragraphs; hiDPI); leaks', args: ['tests/moreapps/word-zoom.mjs'] },
  { name: '!Word: formatting against hostile input (50,000 paragraphs, 1000 toggles, input methods, absurd sizes, zoom while resizing, 500 random actions)', args: ['tests/moreapps/word-format-hostile.mjs'] },
  { name: '!Word without its fonts; open, close and Quit leave nothing behind', args: ['tests/moreapps/word-life.mjs'] },
]);
