// Generates the real-Word hand-off files for !Letters' templates.
// Local only, never committed: tests/moreapps/corpus/ is git-ignored.
// Not a test:
//
//   node tests/moreapps/handoff-templates.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   st4-1.dotx    a letter template as Save as template writes it
//   st4-2.docx    the document made from it: the template opened in
//                 !Letters (untitled copy) and saved as a Word document
//   st4-README.txt what to look at in Word
// A file is written only when its bytes change, so a file open in
// Word is left alone.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {asTemplate, toDocument}
  from '../../tools/moreapps/!Letters/Template';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 10, 5, 12));
fs.mkdirSync(OUT, {recursive: true});

function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const doc = newDoc({date: DATE});
doc.sections[0].blocks.splice(0, 1,
  newPara('Letter template', {pStyle: 'Title'}),
  newPara('Dear Sir or Madam,'),
  newPara('Write the letter here. Heading and body text use the ' +
    'styles of the document.'),
  newPara('Yours faithfully,'));
const tpl = await writeDocx(asTemplate(doc), {date: DATE});
// what !Letters does on opening the .dotx: an untitled copy, saved
// as a Word document
const copy = await writeDocx(toDocument(await readDocx(tpl)),
  {date: DATE});

const README = [
  'Template hand-off files (st4-1.dotx, st4-2.docx)',
  '=================================================',
  '',
  'st4-1.dotx is a template as !Letters\' Save as template writes',
  'it. st4-2.docx is the document !Letters makes when that template',
  'is opened (an untitled copy) and then saved as a Word document.',
  '',
  'What to look at',
  '---------------',
  '1. Open st4-1.dotx in Word. It should open as a NEW document made',
  '   from the template (title "Document1", not st4-1), with no',
  '   repair message. Look at File > Save As: Word offers the',
  '   Word Template type when a template is opened for editing.',
  '2. Open st4-2.docx. It is a plain document: no template banner,',
  '   it opens with its own name, and File > Save As offers Word',
  '   Document as the type. Its text is the same as the template\'s.',
  '3. Both show the Title and the three paragraphs: "Letter',
  '   template", "Dear Sir or Madam,", the instruction line and',
  '   "Yours faithfully,".',
  '',
];
const made = [
  `st4-1.dotx (${put('st4-1.dotx', tpl)})`,
  `st4-2.docx (${put('st4-2.docx', copy)})`,
  `st4-README.txt (${put('st4-README.txt',
    Buffer.from(README.join('\n'), 'latin1'))})`];
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
