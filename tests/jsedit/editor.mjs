// !JsEdit in the desktop: starting it from $.Apps, typing with smart indentation, completion, the syntax check,
// Run and throwback, the Functions list, modes, Tab / Shift-Tab and comments on selections, BASIC files, and
// Shift-double-click (edit) versus double-click (run) on a JSScript file.
import { launch, BASE_URL } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ width: 1100, height: 850 });
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const sleep = (ms) => page.waitForTimeout(ms);
const type = async (s) => { for (const ch of s) { if (ch === '\n') await page.keyboard.press('Enter'); else await page.keyboard.type(ch); } };
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  // helpers in the page: the running JsEdit's texts
  await page.evaluate(() => {
    window.__je = () => os.wimp.tasks.find((t) => t.name === 'JsEdit');
    window.__texts = () => [...(__je()?.windows ?? [])].map((w) => w.userData?.state).filter(Boolean);
    window.__msgs = [];
    const orig = os.wimp.reportError.bind(os.wimp);
    os.wimp.reportError = (m, o) => { __msgs.push(m); return o?.category === 'info' ? Promise.resolve(1) : orig(m, o); };
  });
  const started = await page.evaluate(async () => {
    await os.cli.run('Run ADFS::HardDisc4.$.Apps.!JsEdit');
    await new Promise((r) => setTimeout(r, 600));
    return { task: !!__je(), icon: os.iconbar.items.some((i) => i.sprite === '!jsedit' && i.task === __je()), dir: os.sysvars.get('JsEdit$Dir') };
  });
  ok('starts from $.Apps.!JsEdit', started.task && started.icon && started.dir === 'ADFS::HardDisc4.$.Apps.!JsEdit', started);

  // ---------------------------------------------------------------- typing
  await page.evaluate(() => { os.iconbar.items.find((i) => i.sprite === '!jsedit').onClick({ button: 'select' }); });
  await sleep(500);
  await page.keyboard.press('End');
  await type('Test\nfunction add(a, b) {\nif (a) {\nreturn a + b;\n}\n}\n');
  let t = await page.evaluate(() => { const s = __texts()[0]; return { text: s.doc.text, type: s.filetype, mode: s.mode.name }; });
  ok('new text is a JSScript file in JavaScript mode', t.type === 0xF81 && t.mode === 'JavaScript', t);
  ok('Return keeps / adds indentation, } outdents', t.text === '// Test\nfunction add(a, b) {\n  if (a) {\n    return a + b;\n  }\n}\n', t.text);

  // ---------------------------------------------------------------- completion
  await type('pri');
  await sleep(150);
  const list = await page.evaluate(() => __texts()[0].views[0].completion?.items.map((i) => i.name));
  ok('completion list as you type', list?.[0] === 'print(...values)', list);
  await page.keyboard.press('Enter');
  await type("('x');\ntask.ev");
  await sleep(150);
  const list2 = await page.evaluate(() => __texts()[0].views[0].completion?.items.map((i) => i.name));
  ok('member completion', list2?.includes('task.every(ms, fn)'), list2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await type('win.op');
  await sleep(150);
  const list3 = await page.evaluate(() => __texts()[0].views[0].completion?.items.map((i) => i.name));
  ok('members of any window variable', list3?.includes('win.open()'), list3);
  await page.keyboard.press('Tab');
  t = await page.evaluate(() => __texts()[0].doc.text);
  ok('Tab takes the completion', t.endsWith("print('x');\nwin.open"), t.slice(-30));

  // ---------------------------------------------------------------- syntax check
  await type('(;\n');
  await sleep(1300);
  const marks = await page.evaluate(() => [...__texts()[0].errors]);
  ok('syntax check marks the line', marks.length === 1 && marks[0][0] === 8, marks);
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await type('();\n');
  await sleep(1300);
  ok('mark goes when it is fixed', await page.evaluate(() => __texts()[0].errors.size === 0));

  // ---------------------------------------------------------------- Run and throwback
  const run = await page.evaluate(async () => {
    const s = __texts()[0];
    s.doc.setText("// Prog\nprint('start');\nnope();\n");
    await s.saveTo('RAM::RamDisc0.$.Prog', true);
    s.doc.insert(0, ' ');                         // changed: Run saves it first
    __msgs.length = 0;
    await s.run(s.views[0]);
    await new Promise((r) => setTimeout(r, 700));
    return { saved: (await os.vfs.readText('RAM::RamDisc0.$.Prog')).startsWith(' // Prog'), type: os.vfs.stat('RAM::RamDisc0.$.Prog').filetype, errors: [...s.errors], tb: s.app.throwback.errors.map((e) => `${e.line}:${e.message}`), box: [...__msgs], caret: s.views[0].lineOf(s.views[0].caret) + 1, tbOpen: s.app.throwback.win.isOpen };
  });
  ok('Run saves first', run.saved && run.type === 0xF81, run);
  ok('throwback: error listed, line marked, caret there, no error box', run.tb[0] === '3:nope is not defined' && run.errors[0]?.[0] === 3 && run.caret === 3 && !run.box.length && run.tbOpen, run);
  const syn = await page.evaluate(async () => {
    const s = __texts()[0];
    s.doc.setText('let a = ;\n');
    await s.saveTo('RAM::RamDisc0.$.Prog', true);
    await s.run(s.views[0]);
    await new Promise((r) => setTimeout(r, 300));
    return { tb: s.app.throwback.errors[0], ran: os.wimp.tasks.filter((t) => t.name === 'Prog').length };
  });
  const keep = await page.evaluate(async () => {
    const s = __texts()[0];
    s.doc.setText("// Prog\nnope();\n");
    await s.saveTo('RAM::RamDisc0.$.Prog', true);
    s.doc.insert(0, ' ');                       // an edit just before Run
    await s.run(s.views[0]);
    await new Promise((r) => setTimeout(r, 1500));   // longer than the syntax check's delay
    return [...s.errors];
  });
  ok('a run-time error mark stays after the syntax check', keep.length === 1 && keep[0][0] === 2, keep);
  ok('Run checks the syntax first (and does not run)', syn.tb?.line === 1 && /Unexpected token/.test(syn.tb?.message), syn);

  // ---------------------------------------------------------------- functions, modes, indent, comment
  const misc = await page.evaluate(async () => {
    const s = __texts()[0], v = s.views[0];
    s.doc.setText('function one() {}\nconst two = (x) => x;\nasync function three() {\n}\n');
    s.showFunctions();
    await new Promise((r) => setTimeout(r, 50));
    const fns = s.functions.items.map((i) => i.text.trim());
    // Tab / Shift-Tab on a selection of lines
    const { setSelection } = await import('/src/apps/Edit/view.js');
    setSelection(s.doc, 0, s.doc.length);
    v.indent(1);
    const indented = s.doc.text;
    v.indent(-1);
    const back = s.doc.text;
    s.toggleComment(v);
    const commented = s.doc.text;
    s.toggleComment(v);
    const uncommented = s.doc.text;
    s.setType('BASIC');
    const basicMode = s.mode.name;
    s.setType('JSScript');
    return { fns, indented, back, commented, uncommented, basicMode };
  });
  ok('Functions list', JSON.stringify(misc.fns) === JSON.stringify(['1  one', '2  two', '3  three']), misc.fns);
  ok('Tab indents the selected lines', misc.indented.startsWith('  function one() {}\n  const two'), misc.indented);
  ok('Shift-Tab outdents them', misc.back.startsWith('function one() {}\nconst two'), misc.back);
  ok('Comment / uncomment lines', misc.commented.startsWith('// function one() {}\n// const two') && misc.uncommented === misc.back, [misc.commented, misc.uncommented]);
  ok('Set type changes the mode', misc.basicMode === 'BASIC');

  // ---------------------------------------------------------------- BASIC file
  const bas = await page.evaluate(async () => {
    const app = __texts()[0].app;
    const s = await app.open('ADFS::HardDisc4.$.Demos.BASIC.Mandelbrot', 0);
    const v = s.views[0];
    const L = s.doc.text.split('\n').findIndex((l) => /PRINT|FOR/.test(l));
    const tok = v.tokens(L);
    return { mode: s.mode.name, basicText: /^\s*\d*\s*REM|^\s*\d/.test(s.doc.text), hasKeyword: [...tok.cls].includes(4) };
  });
  ok('BASIC programs open as coloured listings', bas.mode === 'BASIC' && bas.hasKeyword, bas);

  // ---------------------------------------------------------------- Filer: Shift-double-click edits, double-click runs
  const filer = await page.evaluate(async () => {
    os.vfs.writeFile('RAM::RamDisc0.$.Hi', "print('hi');\n", { filetype: 0xF81 });
    const n0 = __texts().length;
    await os.filer.run('RAM::RamDisc0.$.Hi', { shift: true });
    await new Promise((r) => setTimeout(r, 400));
    const edited = __texts().length === n0 + 1 && __texts().some((s) => s.filename === 'RAM::RamDisc0.$.Hi');
    await os.filer.run('RAM::RamDisc0.$.Hi', {});
    await new Promise((r) => setTimeout(r, 400));
    return { edited, ran: os.wimp.tasks.some((t) => t.name === 'Hi') };
  });
  ok('Shift-double-click edits a JSScript file in JsEdit', filer.edited, filer);
  ok('double-click still runs it', filer.ran, filer);

  // ---------------------------------------------------------------- dark theme, Nerd Fonts
  const look = await page.evaluate(async () => {
    const s = __texts()[0], v = s.views[0];
    const pixel = () => { const c = v.win.el.querySelector('canvas'); const d = c.getContext('2d').getImageData(Math.floor(c.width * 0.8), Math.floor(c.height * 0.8), 1, 1).data; return d[0] + d[1] + d[2]; };
    s.front(); v.invalidate();
    await new Promise((r) => setTimeout(r, 100));
    const light = pixel();
    const item = s.menu(v).items[4].submenu.items.find((i) => i.text === 'Dark theme');
    item.action();
    v.invalidate();
    await new Promise((r) => setTimeout(r, 100));
    const dark = pixel();
    const saved = os.sysvars.get('JsEdit$Display');
    item.action();
    const fams = os.fontreg.families().map((f) => f[0]);
    const css = os.fonts.cssFor('JetBrainsMono.Bold', 12);
    await document.fonts.load(css);
    return { light, dark, saved, fams, css, loaded: document.fonts.check(css) };
  });
  ok('Dark theme darkens the text window', look.light > 600 && look.dark < 150, look);
  ok('Dark theme is remembered', /\bdark\b/.test(look.saved), look.saved);
  ok('Nerd Fonts in the font list', ['JetBrainsMono', 'Hack', 'FiraCode'].every((f) => look.fams.includes(f)), look.fams);
  ok('Nerd Font CSS and loading', /^700 15px "JetBrainsMono Nerd"/.test(look.css) && look.loaded, look);

  // ---------------------------------------------------------------- quitting with changes asks first
  const q = await page.evaluate(async () => { const s = __texts()[0]; s.doc.insert(0, 'x'); return __texts()[0].app.modifiedCount; });
  ok('changed texts are counted for the quit query', q >= 1, q);
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
}
