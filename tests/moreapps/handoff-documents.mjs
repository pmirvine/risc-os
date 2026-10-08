// Generates the real-Word hand-off files for !Word's documents (New,
// Save, Save as), local only, never committed: tests/moreapps/corpus/
// is git-ignored. Not a test:
//
//   node tests/moreapps/handoff-documents.mjs
//
// It runs !Word in the real desktop (Playwright; the static server is
// started if it is not running; needs the disc built by
// tools/disc-moreapps.mjs) and writes into
// tests/moreapps/corpus/handoff/ (made if missing):
//   new-1-empty.docx    a New document saved untouched (Save box OK)
//   new-2-typed.docx    a New document, text typed with the keyboard
//                       (bold and italic by Ctrl-B / Ctrl-I, Enter),
//                       saved from the Save box
//   saved-1-edited.docx a rich document (edit-rich.mjs: headings,
//                       lists, a table, a link, two sections) opened
//                       in !Word, edited with the keyboard, saved with
//                       Save (back to its own file)
//   saved-2-as.docx     that window edited again, saved with Save as
//                       under a new name
//   doc-README.txt      what Word should show, the open questions
// Every file is the bytes !Word wrote to its disc (read back out of
// the desktop's filing system), checked here with readDocx and the
// package linter. A file is written only when its bytes change (the
// dates inside change on every run); nothing else in the folder is
// touched or removed.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {launch, BASE_URL} from '../core/pw.mjs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {richDocx} from './edit-rich.mjs';
import {lintPackage} from './lint-package.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const up = async () => { try { return (await fetch(BASE_URL)).ok; } catch { return false; } };
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, ['serve.mjs'], {cwd: ROOT, stdio: 'ignore'});
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}

const {browser, page, logs} = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const files = {};
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, {timeout: 20000});
  await ev(async (rich) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    os.vfs.writeFile('RAM::RamDisc0.$.Rich', new Uint8Array(rich), {filetype: 0xA7E});
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__bytes = async (p) => Array.from(await os.vfs.readFile(p));
    window.__box = (d) => d.win.menu({}).items.find((i) => i.text === 'Save as').submenu();
    // Save on an untitled document: the Save box, its OK
    window.__saveNew = async (d, to) => {
      const p = d.save();
      await window.__frames(2);
      const box = window.__box(d);
      box.setFilename(to);
      box.emit('click', {icon: box.icons[0], button: 'select'});
      return p;
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
  }, Array.from(await richDocx()));

  // new-1: New, saved untouched
  files['new-1-empty.docx'] = await ev(async () => {
    const t = window.__word();
    const u = await t.word.new();
    const ok = await window.__saveNew(window.__by(u.leaf), 'RAM::RamDisc0.$.New1');
    if (!ok) throw new Error('new-1 not saved: ' + window.__msgs);
    return window.__bytes('RAM::RamDisc0.$.New1');
  });

  // new-2: New, typed with the keyboard
  await ev(async () => {
    const t = window.__word();
    const u = await t.word.new();
    window.__by(u.leaf).dw.view.focus();
    await window.__frames(2);
  });
  await page.keyboard.type('A new document typed in !Word.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('This line has ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' and ');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('italic');
  await page.keyboard.press('Control+i');
  await page.keyboard.type(' words.');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Accents and more: caf\u00e9, \u00a3 5, \u20ac 7, \u65e5\u672c.');
  files['new-2-typed.docx'] = await ev(async () => {
    const d = window.__word().word.docs.find((x) => x.untitled);
    const ok = await window.__saveNew(d, 'RAM::RamDisc0.$.New2');
    if (!ok) throw new Error('new-2 not saved: ' + window.__msgs);
    return window.__bytes('RAM::RamDisc0.$.New2');
  });

  // saved-1: a rich document opened, edited, Save
  await ev(async () => {
    const t = window.__word();
    const dw = await t.word.open('RAM::RamDisc0.$.Rich');
    const h = window.__by('Rich').view;
    const L = h.layout, first = L.items.find((x) => x.text !== undefined) ?? L.items[0];
    h.setSelection({id: first.id, off: 0});
    dw.view.focus();
    await window.__frames(2);
  });
  await page.keyboard.type('Edited: ');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('A paragraph added after the title by !Word.');
  files['saved-1-edited.docx'] = await ev(async () => {
    const d = window.__by('Rich');
    d.win.menu({}).items.find((i) => i.text === 'Save').action();
    for (let i = 0; i < 100 && (d.saving || d.view.dirty); i++) await window.__sleep(20);
    if (d.view.dirty) throw new Error('saved-1 not saved: ' + window.__msgs);
    return window.__bytes('RAM::RamDisc0.$.Rich');
  });

  // saved-2: that window edited again, Save as a new name
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Saved again with Save as.');
  files['saved-2-as.docx'] = await ev(async () => {
    const d = window.__by('Rich');
    const box = window.__box(d);
    box.open({x: 200, y: 200});
    box.setFilename('RAM::RamDisc0.$.SavedAs');
    box.emit('click', {icon: box.icons[0], button: 'select'});
    for (let i = 0; i < 100 && !window.__by('SavedAs'); i++) await window.__sleep(20);
    const s = window.__by('SavedAs');
    if (!s || s.view.dirty) throw new Error('saved-2 not saved: ' + window.__msgs);
    return window.__bytes('RAM::RamDisc0.$.SavedAs');
  });
  const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
  if (errs.length) throw new Error(errs.join('\n'));
} finally {
  await browser.close();
  server?.kill();
}

// ------------------------------------------------------------ README

const dec = new TextDecoder();
const lines = [];
const say = (...x) => lines.push(...x);
const made = [];
const show = (t) => [...t.replace(/\t/g, '<tab>').replace(/\n/g, '<br>')
  .replace(/\ufffc/g, '<link>')].map((c) => (c.codePointAt(0) < 128 ? c
  : '<U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') +
    '>')).join('');

/** What a saved file holds, as !Word reads it back. */
async function describe(name, about) {
  const bytes = new Uint8Array(files[name]);
  const doc = await readDocx(bytes);
  const zip = await readZip(bytes);
  const problems = lintPackage(zip).problems.filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)})`);
  const s = doc.sections[doc.sections.length - 1];
  const pg = s.props && s.props.pgSz;
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word read back from the saved file (paragraph: style, text;',
    'runs that are bold or italic are marked; <U+XXXX> a character',
    'that is not ASCII):');
  let k = 0;
  for (const b of doc.sections.flatMap((x) => x.blocks)) {
    if (b.type !== 'p') { say('    [table]'); continue; }
    k++;
    const marks = (b.runs || []).filter((r) => r.rPr && (r.rPr.b || r.rPr.i))
      .map((r) => `${r.rPr.b ? 'bold' : 'italic'} "${show(b.text.slice(r.start, r.end))}"`);
    say(`  ${String(k).padStart(2)}. ${b.pStyle || 'Normal'}: ` +
      `${show(b.text) || '(empty)'}` + (marks.length ? ` [${marks.join(', ')}]` : ''));
  }
  if (pg) say(`  Page: ${pg.w} x ${pg.h} twips (${(pg.w / 1440).toFixed(2)}" x ${(pg.h / 1440).toFixed(2)}").`);
  const core = zip.get('docProps/core.xml');
  if (core) {
    say('  docProps/core.xml as written:');
    for (const m of dec.decode(core).matchAll(/<(dc|cp|dcterms):(\w+)[^>]*?(?:\/>|>([^<]*)(?=<))/g)) {
      if (m[2] === 'coreProperties') continue;
      say(`    ${m[1]}:${m[2]} = ${m[3] === undefined ? '(empty)' : m[3] || '(empty)'}`);
    }
  }
}

say('!Word documents hand-off (local only, not committed)',
  '====================================================',
  '',
  'Made by: node tests/moreapps/handoff-documents.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten,',
  'but the dates inside a new document change on every run). Each',
  'file was written by !Word itself in the desktop (New, typing with',
  'the keyboard, Save, the Save box\'s OK, Save as) and copied out of',
  'its filing system. Open each in real Word: note any repair prompt',
  'or error, and whether what you see matches the description. Then',
  'the open questions below.');
await describe('new-1-empty.docx', [
  'Icon bar click (New), then Save: the Save box offered a name, OK.',
  'Word should open it with no prompt, as a blank document like',
  'File > New > Blank document: Calibri 11 pt, 8 pt after each',
  'paragraph, line spacing 1.08 ("Multiple 1.08"), margins 1 inch',
  '(2.54 cm) all round, A4 paper, not in Compatibility Mode (no',
  '"[Compatibility Mode]" in the title bar).']);
await describe('new-2-typed.docx', [
  'New, then typed with real keys: three paragraphs; Ctrl-B and Ctrl-I',
  'switched bold and italic on and off while typing; the third line',
  'was typed in one go (accents, pound, euro, two CJK characters).',
  'Word should show three Normal paragraphs, "bold" bold and "italic"',
  'italic, in Calibri 11 (CJK in a fallback font).']);
await describe('saved-1-edited.docx', [
  'A rich document (made by tests/moreapps/edit-rich.mjs: Heading 1,',
  'bold/italic, a link, a numbered and a bulleted list, a table,',
  'Heading 2, a tab, a line break, accents and an emoji, two sections)',
  'opened in !Word: "Edited: " typed at the start of the title, End,',
  'Enter, a new paragraph typed, then Save (back to the same file).',
  'Word should show everything the original has (lists numbered,',
  'the table, the link working, the second section on a new page),',
  'the title starting "Edited: " and the new paragraph after it (in',
  'the style Word gives after a heading: Normal).']);
await describe('saved-2-as.docx', [
  'The same window: Ctrl-End, Enter, a last paragraph typed, then Save',
  'as with a new name (the Save box\'s OK). Word should show',
  'saved-1-edited plus the paragraph "Saved again with Save as." at',
  'the very end.']);
say('',
  'Open questions (please try each in real Word and write down what',
  'Word does):',
  '',
  'D1 Repair prompt. Do new-1 and new-2 (documents !Word made from',
  '   nothing) open without "Word found unreadable content" or any',
  '   other prompt? And saved-1 / saved-2?',
  'D2 Default look. Is new-1 exactly a blank Word document: Calibri',
  '   (Body) 11, spacing after 8 pt, line spacing 1.08, margins 1"',
  '   (Layout > Margins > "Normal"), paper A4? Style gallery: Normal,',
  '   No Spacing, Heading 1, Heading 2, Title...? Anything different?',
  'D3 A4 or Letter. !Word\'s New is A4 (the icon bar menu and the',
  '   window menu); app.newDoc({paper: \'letter\'}) gives Letter.',
  '   Should New follow the locale (Letter in the US)?',
  'D4 Properties. File > Info: !Word writes no author (dc:creator),',
  '   "Last modified by" Word, the created and modified times of New,',
  '   and does NOT update the modified time or "last modified by"',
  '   when it saves an existing document (docProps as read). Does Word',
  '   mind? What does it show for Author, Created, Modified?',
  'D5 Everything kept. Compare saved-1-edited with the original',
  '   (make it again: it is the rich document of edit-rich.mjs, or',
  '   compare with saved-2): anything lost, moved or restyled apart',
  '   from the two edits?',
  'D6 File names on the host. On the desktop a document is file type',
  '   &A7E. Saved as "Report/docx" (the RISC OS way of writing',
  '   "Report.docx") onto a HostFS disc it becomes Report.docx on the',
  '   host; saved as plain "Report" it becomes "Report,a7e". Does',
  '   Word open a renamed "Report,a7e" -> "Report.docx" without fuss',
  '   (it should: the bytes are the same)?',
  '',
  'Files (this run): ' + made.join('; ') + '.');
console.log(made.join('\n'));
console.log(put('doc-README.txt', Buffer.from(lines.join('\n') + '\n', 'utf8')),
  'doc-README.txt');
