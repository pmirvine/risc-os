// node tests/core/shot.mjs edit-full tests/edit/act-full.mjs
// Edit end to end with real mouse/keyboard: Filer double-click, typing, F3 save, reload from the
// Filer, Find & Replace dialogue, a BASIC program typed in, saved (tokenised) and reloaded.
import { filerOpen, iconbarPos, hoverArrow, clickItem, menuTexts, saveBoxTo, check } from './ui.mjs';

const RAM = 'RAM::RamDisc0.$';
const E = (page, body, arg) => page.evaluate(`(async (arg) => { const E = await import('/src/apps/Edit/api.js'); const app = E.currentEdit(); ${body} })(${JSON.stringify(arg ?? null)})`);
const shot = (page, n) => page.screenshot({ path: `tests/screens/edit-${n}.png` });
const top = (page) => E(page, `const s = app.states.find((q) => q.views[0].win.isOpen && q.views[0].win === [...wimp.windows].filter((w) => w.isOpen && w.task === app.task).pop()) ?? app.states[app.states.length - 1]; const w = s.views[0].win; return { x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, text: s.doc.text, type: s.doc.filetype ?? s.filetype, file: s.doc.filename }`);

export default async (page) => {
  // ---- text file from the Filer
  await filerOpen(page, 'ADFS::HardDisc4.$.Tutorials', 'ReadMe', { wait: 1500 });
  let t = await top(page);
  const orig = await page.evaluate(() => os.vfs.readText('ADFS::HardDisc4.$.Tutorials.ReadMe'));
  check('double-click text file opens it in Edit', t.title.startsWith('ADFS::HardDisc4.$.Tutorials.ReadMe') && t.text === orig, t.title);
  await shot(page, 'filer-open');

  // click at the start of line 1 and type; Ctrl-Down to the end and type more
  await page.mouse.click(t.x + 4, t.y + 8);
  await page.keyboard.type('EDITED: ');
  await page.keyboard.press('Control+ArrowDown');
  await page.keyboard.type('Last line added.\n');
  t = await top(page);
  check('typing inserts text; title gets *', t.text.startsWith('EDITED: ') && t.text.endsWith('Last line added.\n') && t.title.includes('*'), t.title);
  // F3 = save box: type a path
  await page.keyboard.press('F3');
  await page.waitForTimeout(300);
  await shot(page, 'f3-savebox');
  await saveBoxTo(page, `${RAM}.Notes`);
  t = await top(page);
  const st = await page.evaluate((p) => os.vfs.stat(p), `${RAM}.Notes`);
  check('F3 save to RAM disc', st?.filetype === 0xFFF && st.size === t.text.length && !t.title.includes('*'), t.title);
  const savedText = t.text;
  // Ctrl-F2 closes the window; reopen by double-clicking in the RAM disc viewer
  await page.keyboard.press('Control+F2');
  await page.waitForTimeout(300);
  await filerOpen(page, RAM, 'Notes');
  t = await top(page);
  check('reload from Filer shows the saved text', t.text === savedText && t.title.startsWith(`${RAM}.Notes`), t.title);

  // ---- Find & Replace (F4)
  await page.mouse.click(t.x + 4, t.y + 8);
  await page.keyboard.press('Control+ArrowUp');
  await page.keyboard.press('F4');
  await page.waitForTimeout(300);
  const fb = await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /find/i.test(q.title)); return w ? { title: w.title, icons: w.icons.map((i, k) => i ? `${k}:${i.writable ? 'W' : ''}${i.text ?? ''}` : null).filter(Boolean) } : null; });
  console.log('find box', JSON.stringify(fb));
  // the caret is in the Find field: type, Tab to Replace, type, then Return (= Go)
  await page.keyboard.type('the');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('THE');
  await shot(page, 'findbox');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await shot(page, 'foundbox');
  const found = await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /found|find/i.test(q.title)); return w?.title; });
  console.log('after Go:', found);
  // "E" = replace to end of file in the Found box
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  t = await top(page);
  const nThe = (t.text.match(/THE/g) ?? []).length, nthe = (t.text.match(/the/g) ?? []).length;
  check('Find & Replace to end of file', nThe > 3 && nthe === 0, `THE x${nThe}, the x${nthe}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('F8');   // undo
  t = await top(page);
  check('F8 undoes the replacement', t.text === savedText);

  // ---- a BASIC program: icon bar menu > Create > BASIC
  const ib = await iconbarPos(page, 'Edit');
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(200);
  console.log('icon bar menu:', (await menuTexts(page, 0)).join(' | '));
  await hoverArrow(page, 0, 1);
  console.log('create menu:', (await menuTexts(page, 1)).join(' | '));
  await clickItem(page, 1, 1);        // BASIC
  await page.waitForTimeout(300);
  t = await top(page);
  check('Create > BASIC opens an empty BASIC window', t.type === 0xFFB, t.title);
  const prog = 'REM > Test\nFOR I% = 1 TO 3\n  PRINT "Hello ";I%\nNEXT\nIF TRUE THEN PRINT "done" ELSE STOP\nEND\n';
  await page.keyboard.type(prog);
  await shot(page, 'basic-typed');
  await page.keyboard.press('F3');
  await page.waitForTimeout(300);
  await saveBoxTo(page, `${RAM}.Prog`);
  const bytes = await page.evaluate(async (p) => Array.from(await os.vfs.readFile(p)), `${RAM}.Prog`);
  const bst = await page.evaluate((p) => os.vfs.stat(p), `${RAM}.Prog`);
  // tokens: REM &F4, FOR &E3, TO &B8, PRINT &F1, NEXT &ED, IF &E7, TRUE &B9, THEN &8C, ELSE &8B, STOP &FA, END &E0
  const has = (b) => bytes.includes(b);
  check('saved as tokenised BASIC (&FFB)', bst.filetype === 0xFFB && bytes[0] === 13 && [0xF4, 0xE3, 0xB8, 0xF1, 0xED, 0xE7, 0xB9, 0x8C, 0x8B, 0xFA, 0xE0].every(has) && bytes[bytes.length - 2] === 13 && bytes[bytes.length - 1] === 0xFF,
    `${bytes.length} bytes, first line ${bytes.slice(0, 12).map((b) => b.toString(16)).join(' ')}`);
  check('line numbers 10, 20, ...', bytes[1] === 0 && bytes[2] === 10, `${bytes[1]},${bytes[2]}`);
  // run it through the BASIC interpreter's detokeniser as a cross-check
  const det = await page.evaluate(async (b) => { const m = await import('/src/basic/tokens.js'); return m.programToText(m.parseProgram(new Uint8Array(b)).lines); }, bytes);
  console.log('src/basic detokenise:', JSON.stringify(det).slice(0, 200));
  await page.keyboard.press('Control+F2');
  await page.waitForTimeout(300);
  // Shift-double-click loads BASIC into Edit (a plain double-click would run it)
  await filerOpen(page, RAM, 'Prog', { shift: true });
  t = await top(page);
  check('Shift-double-click BASIC loads detokenised text', t.text === prog && t.type === 0xFFB, JSON.stringify(t.text.slice(0, 60)));
  await shot(page, 'basic-reloaded');
  // edit and save back: re-save must reproduce the same bytes
  await page.keyboard.press('F3');
  await page.waitForTimeout(300);
  await saveBoxTo(page, `${RAM}.Prog2`);
  const bytes2 = await page.evaluate(async (p) => Array.from(await os.vfs.readFile(p)), `${RAM}.Prog2`);
  check('BASIC re-save is byte-identical', bytes2.length === bytes.length && bytes2.every((b, i) => b === bytes[i]));

  // ---- window menu tree
  t = await top(page);
  await page.mouse.click(t.x + 100, t.y + 40, { button: 'right' });
  await page.waitForTimeout(200);
  console.log('window menu:', (await menuTexts(page, 0)).join(' | '));
  await hoverArrow(page, 0, 3);
  console.log('edit submenu:', (await menuTexts(page, 1)).join(' | '));
  await shot(page, 'windowmenu');
  await page.keyboard.press('Escape');
};
