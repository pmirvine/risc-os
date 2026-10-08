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
// (word-format-hostile.mjs); list numbers and bullets drawn and edited (word-lists.mjs), also against hostile input
// (word-lists-hostile.mjs); untitled documents and Save / Save as
// (word-save.mjs); the Save / Discard / Cancel prompt on close, and
// Revert (word-close.mjs); New, Recent files, Quit and PreQuit
// (word-quit.mjs); documents against hostile use: saves onto open,
// locked and read-only files, 1000 Saves, input methods, shutdowns,
// Recent, 500 random actions (word-documents-hostile.mjs); Save
// boxes and existing files: Replace / Cancel (word-replace.mjs); a
// new document's whole white page (word-page.mjs). The unit
// tests are the *.test.mjs files
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
  { name: '!Word: list numbers and bullets drawn in the hanging space; not selected; click on a label; 50,000 list paragraphs; 200%', args: ['tests/moreapps/word-lists.mjs'] },
  { name: '!Word: lists against hostile input (100,000 list paragraphs, Tab spam, absurd numbering, select all + Backspace, 500 random actions)', args: ['tests/moreapps/word-lists-hostile.mjs'] },
  { name: '!Word: untitled documents, Save, Save as and Save a copy (Save box OK and drag, typing during a save, locked / read-only / bad names, another open document, input methods)', args: ['tests/moreapps/word-save.mjs'] },
  { name: '!Word: closing asks Save / Discard / Cancel (keys, the Save box for an untitled document, one prompt); Revert; saves of a window in turn; leaks', args: ['tests/moreapps/word-close.mjs'] },
  { name: '!Word: New from the icon bar (one per double-click), Recent files (Choices:Word, missing / hostile entries), Quit and PreQuit ask once (Task Manager, shutdown, a close prompt open); 50 dirty windows; leaks', args: ['tests/moreapps/word-quit.mjs'] },
  { name: '!Word: documents against hostile use (Save as onto open / locked / read-only / bad names, 1000 Saves, Save while typing and composing, 50 dirty windows at shutdown, shutdown twice, prompts that cannot open, 10,000 hostile Recent entries, Revert of a deleted file, Quit with the Save box open, 500 random actions)', args: ['tests/moreapps/word-documents-hostile.mjs'] },
  { name: '!Word: Save boxes and existing files (a free name for a new document, Replace / Cancel, Save a copy refusing open files and holding composing text); the late commit only straight after a Save; prompts brought forward (Quit with a Save box or its Replace question, Revert); a failed Save a copy named as Save names it', args: ['tests/moreapps/word-replace.mjs'] },
  { name: '!Word: a new document shows a whole page (A4, Letter; the white page down the window, its height and end; 50% and 200%; clicks low in the page, typing, Ctrl-End, Page Down)', args: ['tests/moreapps/word-page.mjs'] },
  { name: '!Word without its fonts; open, close and Quit leave nothing behind', args: ['tests/moreapps/word-life.mjs'] },
]);
