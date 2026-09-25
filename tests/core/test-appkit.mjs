// The desktop's helpers for applications (programs get them from src/core/jsrun.js): Templates files read from
// the disc, icon help / names, the caretmove event and returnNext, Choices, dragSave, and the TextArea gadget.
import { launch, BASE_URL } from './pw.mjs';

const { browser, page, logs } = await launch();
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });

  const r = await page.evaluate(async () => {
    const out = {};
    const t = os.wimp.createTask('AppKit');
    // a Templates file on the disc
    const tpl = await globalThis.__riscos.loadTemplates('ADFS::HardDisc4.$.Apps.!CloseUp.Templates');
    out.templates = Object.keys(tpl.windows).length > 0;
    const first = Object.keys(tpl.windows)[0];
    const tw = await t.createWindowFromTemplate('<Obey$Dir>'.replace('<Obey$Dir>', 'ADFS::HardDisc4.$.Apps.!CloseUp') + '.Templates', first);
    out.fromPath = !!tw?.icons;
    // icons keep help and name; caretmove; returnNext
    const w = t.createWindow({
      title: 'Form', x: 100, y: 100, w: 300, h: 200, extent: { w: 300, h: 200 }, returnNext: true,
      icons: [
        { x: 10, y: 10, w: 120, h: 28, text: '', button: 'writable', border: true, name: 'first', help: 'The first field' },
        { x: 10, y: 50, w: 120, h: 28, text: '', button: 'writable', border: true, name: 'second' },
      ],
    });
    w.open();
    out.help = w.iconByName('first')?.help === 'The first field' && !!w.iconByName('second');
    const moves = [];
    w.on('caretmove', (ev) => moves.push(`${ev.from?.name}>${ev.to?.name}`));
    let returned = 0;
    w.on('key', (ev) => { if (ev.code === 13) returned++; });
    os.wimp.setCaret(w, w.icons[0]);
    os.wimp.processKey(13);                      // Return in the first: to the second
    out.afterReturn = os.wimp.caret.icon?.name;
    os.wimp.processKey(13);                      // Return in the last: reported
    out.returned = returned;
    out.moves = moves;
    // Choices
    const { choices } = globalThis.__riscos;
    out.choicesDefault = (await choices.read('AppKitTest', { a: 1 })).a;
    choices.write('AppKitTest', { a: 2, b: 'x' });
    out.choicesSaved = await choices.read('AppKitTest', { a: 1, c: 3 });
    // dragSave: dropped on a directory display
    os.vfs.mkdir('RAM::RamDisc0.$.Drop');
    const v = os.filer.openDir('RAM::RamDisc0.$.Drop');
    const realDrag = os.wimp.drag;
    os.wimp.drag = () => Promise.resolve({ window: v.win });
    out.dragged = await globalThis.__riscos.dragSave({ sx: 10, sy: 10, window: w }, { task: t, leafname: 'Card', filetype: 0xFFF, getData: async () => 'hello' });
    os.wimp.drag = realDrag;
    out.draggedText = os.vfs.exists('RAM::RamDisc0.$.Drop.Card') ? await os.vfs.readText('RAM::RamDisc0.$.Drop.Card') : null;
    // formatting helpers
    out.date = globalThis.__riscos.formatTime('%W3 %ZDY%ST %M3', new Date(2026, 8, 25));
    t.quit();
    return out;
  });
  ok('Templates file from the disc', r.templates && r.fromPath, r);
  ok('icons keep help and name', r.help);
  ok('Return moves to the next field (returnNext)', r.afterReturn === 'second', r.afterReturn);
  ok('Return in the last field is reported', r.returned === 1, r.returned);
  ok('caretmove between icons', r.moves.includes('first>second'), r.moves);
  ok('Choices: defaults', r.choicesDefault === 1, r.choicesDefault);
  ok('Choices: saved and merged', r.choicesSaved.a === 2 && r.choicesSaved.b === 'x' && r.choicesSaved.c === 3, r.choicesSaved);
  ok('dragSave to a directory display', r.dragged === 'RAM::RamDisc0.$.Drop.Card' && r.draggedText === 'hello', r);
  ok('formatTime', r.date === 'Fri 25th Sep', r.date);

  // ---------------------------------------------------------------- TextArea, typed into with the keyboard
  await page.evaluate(() => {
    const t = os.wimp.createTask('Notes');
    const w = window.__notesWin = t.createWindow({ title: 'Notes', x: 100, y: 100, w: 320, h: 220, extent: { w: 320, h: 220 }, workButton: 'click',
      icons: [{ x: 10, y: 10, w: 120, h: 28, text: '', button: 'writable', border: true, name: 'title' }] });
    w.open();
    const { TextArea } = globalThis.__riscos;
    w.on('click', () => true);                   // the program's own handler, added first, takes every click...
    window.__area = new TextArea(w, { x: 10, y: 50, w: 200, h: 100, text: '' });   // ...but the text area still gets its own
    window.__area2 = new TextArea(w, { x: 10, y: 160, w: 200, h: 50, text: 'other' });
    window.__changes = 0;
    window.__area.on('change', () => window.__changes++);
    w.emit('click', { button: 'select', x: 50, y: 60 });   // into the text area
  });
  await page.keyboard.type('The quick brown fox jumps over the lazy dog again');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Line two');
  await page.keyboard.press('Backspace');
  const ta = await page.evaluate(() => ({ text: __area.text, rows: __area.rows.length, changes: __changes, other: __area2.text, focused: [__area.focused, __area2.focused] }));
  ok('TextArea takes typing, Return and Backspace', ta.text === 'The quick brown fox jumps over the lazy dog again\nLine tw', ta.text);
  ok('TextArea wraps long lines', ta.rows >= 3, ta.rows);
  ok('TextArea change events', ta.changes === ta.text.length + 2, ta.changes);
  ok('only one text area has the caret', ta.focused[0] && !ta.focused[1] && ta.other === 'other', ta);
  const tb = await page.evaluate(() => {
    const w = __notesWin;
    os.wimp.setCaret(w, w.icons[0]);             // the caret into the writable icon
    const blurred = !__area.focused;
    os.wimp.processKey(65);                      // typed into the icon, not the text area
    return { blurred, icon: w.icons[0].text, text: __area.text.slice(-2) };
  });
  const tc = await page.evaluate(() => {
    const w = __notesWin;
    os.wimp.setCaret(w, w.icons[0]);
    os.wimp.processKey(0x18A);                   // Tab from the icon: into the first text area
    const first = __area.focused;
    __area.key({ code: 0x18A });                 // Tab in the text area: the next one
    const second = __area2.focused && !__area.focused;
    __area2.key({ code: 0x18A });                // and round to the icon
    return { first, second, back: os.wimp.caret.icon === w.icons[0] };
  });
  ok('Tab moves through fields and text areas in reading order', tc.first && tc.second && tc.back, tc);
  ok('the caret leaving the text area takes its keys away', tb.blurred && tb.icon === 'A' && tb.text === 'tw', tb);

  // ---------------------------------------------------------------- the names reach a JSScript program
  const prog = await page.evaluate(async () => {
    os.vfs.writeFile('RAM::RamDisc0.$.Names', "print(typeof TextArea, typeof dragSave, typeof choices, typeof formatTime, typeof textWidth, typeof discardChanges, typeof sprites);\n", { filetype: 0xF81 });
    let out = '';
    os.hooks.jsOutput = (t, s) => { out += s; };
    await os.cli.run('Run RAM::RamDisc0.$.Names');
    return out;
  });
  ok('programs get the new names', prog.trim() === 'function function object function function function object', prog);
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
}
