// !Journal ($.Apps.!Journal, tools/journal) in a real browser: node tests/journal/journal.mjs
// Its Check program; On this day at start; today's page from the icon bar (typing, Ctrl-T, autosave to
// $.Journal.<year>.<month>.<day>); mood and weather from the pop-up menus; the calendar (Adjust on the icon);
// a page changed by another program; Find (F4); turning the page; exporting a month as a Draw file; locking
// with a password, quitting and opening it again; removing the password; and, with autosave off, the
// Discard / Cancel / Save box. Screenshots: journal-day.png, journal-calendar.png in SHOTS.
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ buttons: 'acorn' });   // right = Adjust, middle = Menu
const out = [];
const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) });

/** Things about the Journal's windows, from the page. */
const state = () => page.evaluate(() => {
  const ws = [...wimp.windows].filter((w) => w.task?.name === 'Journal' && w.isOpen);
  const day = ws.find((w) => w._textAreas?.size);
  const area = day && [...day._textAreas][0];
  return {
    titles: ws.map((w) => w.title),
    day: day ? { title: day.title, text: area.text, mood: day.iconByName('mood')?.text, weather: day.iconByName('weather')?.text, words: day.iconByName('words')?.text } : null,
    errors: [...wimp.windows].filter((w) => w._errorBox && w.isOpen).map((w) => w.icons[0]?.text),
  };
});
const winCentre = (title) => page.evaluate((title) => {
  const w = [...wimp.windows].find((q) => q.task?.name === 'Journal' && q.isOpen && (title instanceof RegExp ? title.test(q.title) : q.title.startsWith(title)));
  w?.bringToFront();
  return w ? { x: w.x + w.w / 2, y: w.y + w.h / 2, wx: w.x, wy: w.y } : null;
}, title);
// (the day window brought to the front first, so that clicks there reach it)
const dayCentre = () => page.evaluate(() => {
  const w = [...wimp.windows].find((q) => q.task?.name === 'Journal' && q.isOpen && q._textAreas?.size);
  w?.bringToFront();
  return w ? { x: w.x + w.w / 2, y: w.y + w.h / 2 } : null;
});
const iconAt = (title, name) => page.evaluate(({ title, name }) => {
  const w = [...wimp.windows].find((q) => q.task?.name === 'Journal' && q.isOpen && q.title.startsWith(title));
  const ic = w?.iconByName(name);
  if (!ic) return null;
  return w.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2);
}, { title, name });
const iconbar = () => page.evaluate(() => {
  const it = wimp.iconbar.items.find((i) => i.task?.name === 'Journal');
  return it ? { x: wimp.iconbar.iconScreenX(it), y: wimp.height - 30 } : null;
});
/** Choose a menu item by its text at a level (hovering over its parent's arrow first for a submenu). */
async function pick(level, text, { hover = false, button = 'left' } = {}) {
  const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: text }).first();
  const b = await item.boundingBox();
  if (!b) throw new Error(`no menu item '${text}' at level ${level}`);
  if (hover) {
    await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
    await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
    await wait(300);
  } else {
    await page.mouse.click(b.x + 30, b.y + b.height / 2, { button });
    await wait(300);
  }
}
/** Click OK on the message box that is showing. */
async function okMessage() {
  const p = await page.evaluate(() => {
    const w = [...wimp.windows].find((q) => q._errorBox && q.isOpen);
    if (!w) return null;
    const b = w.icons[1].bbox;
    return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  });
  if (p) { await page.mouse.click(p.x, p.y); await wait(300); }
}
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const fileOf = (key, root = 'ADFS::HardDisc4.$.Journal') => `${root}.${key.replace(/-/g, '.')}`;
const readFile = (p) => page.evaluate((p) => (os.vfs.exists(p) ? { text: String.fromCharCode(...os.vfs.readFileSync(p)), type: os.vfs.stat(p).filetype } : null), p);
const lastYear = `${now.getFullYear() - 1}-${today.slice(5)}`;

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });

  // ---------------------------------------------------------------- Check
  const check = await page.evaluate(async () => {
    let s = '';
    os.hooks.jsOutput = (t, x) => { s += x; };
    await os.cli.run('Run ADFS::HardDisc4.$.Apps.!Journal.Check');
    for (let i = 0; i < 50 && !/all ok|FAILED/.test(s); i++) await new Promise((r) => setTimeout(r, 100));
    os.hooks.jsOutput = null;
    return s;
  });
  ok('Check: all ok', /all ok/.test(check), check.split('\n').filter((l) => /FAIL/.test(l)).join('; '));
  await page.evaluate(() => { for (const w of [...wimp.windows]) if (w._jsOutput) w.close(); });

  // ---------------------------------------------------------------- On this day at start
  await page.evaluate(({ p }) => {
    os.vfs.mkdir(os.vfs.parent(p), { parents: true });
    os.vfs.writeFile(p, 'Mood: Calm\n\nA walk by the river, a year ago.\n', { filetype: 0xFFF });
  }, { p: fileOf(lastYear) });
  await page.evaluate(() => os.cli.run('Run ADFS::HardDisc4.$.Apps.!Journal'));
  await page.waitForFunction(() => wimp.iconbar.items.some((i) => i.task?.name === 'Journal'), null, { timeout: 8000 });
  await wait(800);
  let s = await state();
  ok('On this day opens at start', s.titles.some((t) => t.startsWith('On this day')), s.titles);
  const otd = await winCentre('On this day');
  if (otd) await page.mouse.click(otd.wx + 8, otd.wy - 20);   // (its close icon)
  await page.evaluate(() => { const w = [...wimp.windows].find((q) => q.isOpen && q.title.startsWith('On this day')); w?.close(); });

  // ---------------------------------------------------------------- today's page
  const ib = await iconbar();
  await page.mouse.click(ib.x, ib.y);
  await wait(800);
  s = await state();
  ok('Select on the icon opens today\'s page', !!s.day && /\d{4}$/.test(s.day.title), s.titles);
  await page.keyboard.type('Went for a long walk by the river this morning.');
  await page.keyboard.press('Control+t');
  await page.keyboard.type('Wrote some code.');
  s = await state();
  ok('typing: the title has a * until it is saved', / \*$/.test(s.day.title), s.day.title);
  ok('Ctrl-T starts an entry with the time', /morning\.\n\n\d\d:\d\d\nWrote some code\.$/.test(s.day.text), s.day.text);
  ok('the word count', s.day.words === '14 words', s.day.words);
  await wait(2200);
  let f = await readFile(fileOf(today));
  ok('autosave writes $.Journal.<year>.<month>.<day> as Text', f?.type === 0xFFF && f.text.startsWith('Went for a long walk'), f);
  s = await state();
  ok('saved: the * goes', !/\*$/.test(s.day.title), s.day.title);
  await shot('journal-day.png');

  // ---------------------------------------------------------------- mood and weather
  const moodBtn = await iconAt(s.day.title.replace(/ \*$/, ''), 'mood!');
  await page.mouse.click(moodBtn.x, moodBtn.y);
  await wait(300);
  await pick(0, 'Happy');
  const weatherBtn = await iconAt(s.day.title.replace(/ \*$/, ''), 'weather!');
  await page.mouse.click(weatherBtn.x, weatherBtn.y);
  await wait(300);
  await pick(0, 'Rain');
  s = await state();
  ok('mood and weather from the pop-up menus', s.day.mood === 'Happy' && s.day.weather === 'Rain', s.day);
  await wait(2000);
  f = await readFile(fileOf(today));
  ok('they are saved at the top of the file', f.text.startsWith('Mood: Happy\nWeather: Rain\n\nWent'), f.text);

  // ---------------------------------------------------------------- the menu: Insert > Date
  const dc = await dayCentre();
  await page.mouse.click(dc.x, dc.y + 100, { button: 'middle' });
  await wait(300);
  await pick(0, 'Insert', { hover: true });
  await pick(1, 'Date');
  s = await state();
  ok('Insert > Date types the date', /code\.\w+day \d+(st|nd|rd|th) \w+ \d{4}$/.test(s.day.text), s.day.text.slice(-30));
  await page.keyboard.press('F8');
  s = await state();
  ok('F8 undoes it', s.day.text.endsWith('code.'), s.day.text.slice(-20));

  // ---------------------------------------------------------------- the calendar
  await page.mouse.click(ib.x, ib.y, { button: 'right' });   // Adjust
  await wait(800);
  s = await state();
  const cal = s.titles.find((t) => t === 'Journal');
  ok('Adjust on the icon opens the calendar', !!cal, s.titles);
  const calInfo = await page.evaluate(() => {
    const w = [...wimp.windows].find((q) => q.task?.name === 'Journal' && q.isOpen && q.title === 'Journal');
    const px = w.view.querySelector('canvas');
    return { hasCanvas: !!px };
  });
  ok('the calendar draws', calInfo.hasCanvas);
  await shot('journal-calendar.png');

  // ---------------------------------------------------------------- changed by another program
  await wait(2000);                        // (the undo is saved first)
  await page.evaluate((p) => os.vfs.writeFile(p, 'Mood: Tired\n\nChanged in Edit.\n', { filetype: 0xFFF }), fileOf(today));
  await wait(500);
  s = await state();
  ok('a page changed by another program is loaded again', s.day.text === 'Changed in Edit.' && s.day.mood === 'Tired', s.day);

  // ---------------------------------------------------------------- Find
  const dayTitle = s.day.title;
  const dc2 = await dayCentre();
  await page.mouse.click(dc2.x, dc2.y + 60);
  await page.keyboard.press('F4');
  await wait(400);
  await page.keyboard.type('river');
  await page.keyboard.press('Enter');
  await wait(500);
  const found = await page.evaluate(() => {
    const w = [...wimp.windows].find((q) => q.isOpen && /^Find/.test(q.title));
    return { title: w?.title };
  });
  ok('Find lists the days with the words', /^Find 'river': 1 day$/.test(found.title ?? ''), found.title);

  await page.evaluate(() => [...wimp.windows].find((q) => q.isOpen && /^Find/.test(q.title))?.close());

  // ---------------------------------------------------------------- turning the page
  const dc4 = await dayCentre();
  await page.mouse.click(dc4.x, dc4.y + 60);
  await page.keyboard.press('Control+Shift+ArrowLeft');
  await wait(500);
  s = await state();
  ok('Ctrl-Shift-Left turns to the day before', s.day && s.day.title !== dayTitle && s.day.text === '', s.day?.title);
  await page.keyboard.press('Control+Shift+ArrowRight');
  await wait(500);
  s = await state();
  ok('... and Ctrl-Shift-Right back', s.day?.title === dayTitle, s.day?.title);

  // ---------------------------------------------------------------- a month as a Draw file
  const cc = await winCentre(/^Journal$/);
  await page.mouse.click(cc.x, cc.y, { button: 'middle' });
  await wait(300);
  await pick(0, 'Export', { hover: true });
  await pick(1, 'Month as Draw file', { hover: true });
  const draw = await page.evaluate(async () => {
    const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? ''));
    const ic = w.icons.find((i) => i?.writable);
    ic.setText('RAM::RamDisc0.$.Month');
    wimp.setCaret(w, ic);
    return true;
  });
  await page.keyboard.press('Enter');
  await wait(800);
  const parsed = await page.evaluate(async () => {
    const p = 'RAM::RamDisc0.$.Month';
    if (!os.vfs.exists(p)) return null;
    const { parseDrawfile } = await import('/src/apps/Draw/drawfile.js');
    const doc = parseDrawfile(os.vfs.readFileSync(p));
    return { type: os.vfs.stat(p).filetype, objects: doc.objects.length, texts: doc.objects.filter((o) => o.text != null).map((o) => o.text).slice(0, 3), fonts: doc.fonts ? Object.values(doc.fonts) : null };
  });
  ok('Export > Month as Draw file saves a Draw file that Draw reads', draw && parsed?.type === 0xAFF && parsed.objects > 40, parsed);

  // ---------------------------------------------------------------- lock, quit, open again
  await page.mouse.click(ib.x, ib.y, { button: 'middle' });
  await wait(300);
  await pick(0, 'Password', { hover: true });
  await pick(1, 'Lock journal');
  await wait(400);
  await page.keyboard.type('open sesame');
  await page.keyboard.press('Tab');
  await page.keyboard.type('open sesame');
  await page.keyboard.press('Enter');
  await wait(3000);
  s = await state();
  ok('locking says so', s.errors.some((e) => /journal is locked/.test(e)), s.errors);
  await okMessage();
  f = await readFile(fileOf(today));
  const lockFile = await readFile('ADFS::HardDisc4.$.Journal.Lock');
  ok('locked: the pages are scrambled, with the Journal\'s file type', f?.type === 0x1C6 && f.text.startsWith('JLK1') && !f.text.includes('Changed in Edit') && !!lockFile, { type: f?.type });
  await page.mouse.click(ib.x, ib.y, { button: 'middle' });
  await wait(300);
  await pick(0, 'Quit');
  await wait(600);
  ok('Quit', !(await page.evaluate(() => wimp.tasks.some((t) => t.name === 'Journal' && t.alive))));
  await page.evaluate(() => os.cli.run('Run ADFS::HardDisc4.$.Apps.!Journal'));
  await page.waitForFunction(() => wimp.iconbar.items.some((i) => i.task?.name === 'Journal'), null, { timeout: 8000 });
  await wait(500);
  const ib2 = await iconbar();
  await page.mouse.click(ib2.x, ib2.y);
  await wait(500);
  s = await state();
  ok('a locked journal asks for its password', s.titles.includes('Journal locked'), s.titles);
  await page.keyboard.type('wrong');
  await page.keyboard.press('Enter');
  await wait(2000);
  s = await state();
  ok('the wrong password is refused', s.errors.some((e) => /not the password/.test(e)) && !s.day, s.errors);
  await okMessage();
  await wait(300);
  await page.mouse.click(ib2.x, ib2.y);
  await wait(500);
  await page.keyboard.type('open sesame');
  await page.keyboard.press('Enter');
  await wait(2500);
  s = await state();
  ok('the right one opens today\'s page', s.day?.text === 'Changed in Edit.', s.day);

  // ---------------------------------------------------------------- remove the password
  await page.mouse.click(ib2.x, ib2.y, { button: 'middle' });
  await wait(300);
  await pick(0, 'Password', { hover: true });
  await pick(1, 'Remove password');
  await wait(400);
  await page.keyboard.type('open sesame');
  await page.keyboard.press('Enter');
  await wait(3000);
  await okMessage();
  f = await readFile(fileOf(today));
  ok('Remove password: the pages are Text again', f?.type === 0xFFF && f.text.includes('Changed in Edit') && !(await readFile('ADFS::HardDisc4.$.Journal.Lock')), f);

  // ---------------------------------------------------------------- autosave off: Discard / Cancel / Save
  await page.evaluate(() => os.choices?.write?.('Journal', {}));
  await page.mouse.click(ib2.x, ib2.y, { button: 'middle' });
  await wait(300);
  await pick(0, 'Choices');
  await wait(400);
  await page.evaluate(() => {
    const w = [...wimp.windows].find((q) => q.isOpen && q.title === 'Journal choices');
    const ic = w.iconByName('autosave');
    if (ic.selected) ic.setState({ selected: false });
  });
  const setBtn = await iconAt('Journal choices', 'button:Set');
  await page.mouse.click(setBtn.x, setBtn.y);
  await wait(300);
  s = await state();
  const dc3 = await dayCentre();
  await page.mouse.click(dc3.x, dc3.y + 60);
  await page.keyboard.type(' More.');
  await wait(2000);
  s = await state();
  f = await readFile(fileOf(today));
  ok('autosave off: not saved, still *', / \*$/.test(s.day.title) && !f.text.includes('More.'), s.day.title);
  await page.keyboard.press('Control+F2');
  await wait(400);
  s = await state();
  ok('closing asks Discard / Cancel / Save', s.titles.includes('Journal') && s.day, s.titles);
  const save = await page.evaluate(() => {
    const w = [...wimp.windows].find((q) => q.isOpen && q.icons?.some((i) => i?.name === 'button:Save'));
    const ic = w.iconByName('button:Save');
    return w.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2);
  });
  await page.mouse.click(save.x, save.y);
  await wait(500);
  s = await state();
  f = await readFile(fileOf(today));
  ok('Save saves it and closes the page', !s.day && f.text.includes('More.'), { day: s.day, text: f.text });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}

console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
