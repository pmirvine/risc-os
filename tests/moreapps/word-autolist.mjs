// !Word's AutoFormat lists as you type, in the real desktop with real
// key presses: '* ' then text makes a bullet item; '1. ' then text a
// numbered one, Enter continues it and Enter on the empty item ends
// it; '2. ' continues a list, '7. ' starts a new one; a Tab after
// '1.' does it too; Ctrl-Z right after the conversion gives back the
// typed '* ' (the caret after the space), Ctrl-Z again the typing;
// never for a space typed elsewhere, in overwrite mode (Insert), an
// input method's commit (a real CDP composition: '1. ' committed
// whole, and a space committed after '1.' typed), Ctrl-V of '* x',
// Find / Replace making '1. ', undo / redo; Format > AutoFormat lists
// ticked, turned off (then nothing converts), kept in Choices:Word
// with Recent (neither overwrites the other) across a restart of
// Word, turned on again; on a Mac, Cmd-Z gives back the marker. No
// page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const N = 16;
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const files = {
  Au: Array.from(await docx([...Array.from({ length: N }, () => p()), p(r('Qtext')), p(r('Last'))].join(''))),
};
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const CHOICES = 'ADFS::HardDisc4.$.!Boot.Choices.Word';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const type = async (s) => { await page.keyboard.type(s); await settle(); };
const click = async (q, opts) => { await page.mouse.click(q.x, q.y, opts); await wait(60); await settle(); };

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
  const s0 = await ev(async ([files, CHOICES]) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    if (os.vfs.exists(CHOICES)) os.vfs.delete(CHOICES);
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf = 'Au') => window.__word()?.word.docs.find((d) => d.path?.endsWith('.' + leaf));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off) => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__state = () => {
      const d = window.__doc(), v = d.view, bs = d.d.doc.sections.flatMap((s) => s.blocks), h = v.selection?.head;
      return { lines: v.lines(), labels: v.labels(), depth: v.undoDepth, head: h ? [bs.findIndex((b) => b.id === h.id), h.off] : null,
        overwrite: v.overwrite, msgs: window.__msgs.length };
    };
    window.__start = async () => {
      await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
      for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
      await window.__word().word.recentReady;
    };
    window.__openAu = async () => {
      await os.filer.run('RAM::RamDisc0.$.Au');
      for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
      window.__doc().win.open({ x: 60, y: 40, w: 900, h: 600, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(3);
    };
    await window.__openAu();
    return { ok: !!window.__doc(), s: window.__state() };
  }, [files, CHOICES]);
  ok('the document opens: empty paragraphs, no list', s0.ok && s0.s.labels.every((x) => x === null) && !s0.s.msgs, s0);

  const caretAt = async (i, off = 0) => click(await ev(([i, off]) => window.__point(i, off), [i, off]));
  const st = () => ev(() => window.__state());

  // ---------------------------------------------------- * then text
  await caretAt(0);
  const d0 = (await st()).depth;
  await type('* hello');
  const a1 = await st();
  ok("'* hello' at an empty paragraph's start: a bullet item 'hello' (typing, the conversion, the word: three steps)",
    a1.lines[0] === 'hello' && a1.labels[0] === '•' && a1.depth === d0 + 3 && same(a1.head, [0, 5]), a1);

  // ---------------------------------------------------- Ctrl-Z right after the conversion
  await caretAt(1);
  await type('* ');
  const u0 = await st();
  await press('Control+z');
  const u1 = await st();
  await press('Control+z');
  const u2 = await st();
  ok('Ctrl-Z right after the conversion gives back "* " as typed, the caret after the space; Ctrl-Z again takes the typing away',
    u0.lines[1] === '' && u0.labels[1] === '•' && u1.lines[1] === '* ' && u1.labels[1] === null && same(u1.head, [1, 2])
    && u2.lines[1] === '' && u2.labels[1] === null, { u0, u1, u2 });
  await press('Control+y');
  await press('Control+y');
  const u3 = await st();
  ok('... redo twice: the item again', u3.lines[1] === '' && u3.labels[1] === '•', u3);
  await press('Control+z', 2);

  // ---------------------------------------------------- 1. Enter Enter
  await caretAt(2);
  await type('1. one');
  await press('Enter');
  await type('two');
  await press('Enter');
  const e1 = await st();
  await press('Enter');
  const e2 = await st();
  ok("'1. one', Enter, 'two': 1. and 2.; Enter on the empty third item ends the list",
    same(e1.labels.slice(2, 5), ['1.', '2.', '3.']) && same(e1.lines.slice(2, 5), ['one', 'two', ''])
    && same(e2.labels.slice(2, 5), ['1.', '2.', null]), { e1: e1.labels.slice(0, 8), e2: e2.labels.slice(0, 8), l: e2.lines.slice(0, 8) });
  // the paragraph after the ended list: 3. continues, 7. starts anew
  const base = e2.lines.length;
  await type('3. three');
  const c1 = await st();
  ok("'3. ' after the ended 1. 2. list continues it (3.)", c1.labels[4] === '3.' && c1.lines[4] === 'three' && c1.lines.length === base, c1.labels.slice(0, 8));
  await caretAt(6);
  await type('7. seven');
  const c2 = await st();
  ok("'7. ' after it starts a new list at 7", c2.labels[6] === '7.' && c2.lines[6] === 'seven', c2.labels.slice(0, 8));

  // ---------------------------------------------------- Tab after the marker
  await caretAt(8);
  await type('a.');
  await press('Tab');
  const t1 = await st();
  ok("'a.' then Tab: a lettered item, the marker and the tab gone", t1.labels[8] === 'a.' && t1.lines[8] === '', t1.labels.slice(6, 10));
  await press('Control+z');
  const t2 = await st();
  ok('... Ctrl-Z gives back "a." and the tab', t2.lines[8] === 'a.\t' && t2.labels[8] === null && same(t2.head, [8, 3]), t2.lines[8]);
  await press('Control+z', 3);

  // ---------------------------------------------------- refusals
  await caretAt(9);
  await type('ab * x');
  const r1 = await st();
  ok('a space typed after "ab *" (not at the start): no list', r1.lines[9] === 'ab * x' && r1.labels[9] === null, r1.lines[9]);
  await ev(() => { const d = window.__doc(), b = d.d.doc.sections[0].blocks[9]; d.view.setSelection({ id: b.id, off: 4 }); });
  await type(' ');
  const r1b = await st();
  ok('... nor a space typed after "ab *" in the middle', r1b.labels[9] === null && r1b.lines[9] === 'ab *  x', r1b.lines[9]);
  // overwrite mode
  await caretAt(10);
  await press('Insert');
  await type('* over');
  const r2 = await st();
  await press('Insert');
  ok('in overwrite mode (Insert): "* " is typed, no list', r2.overwrite && r2.lines[10] === '* over' && r2.labels[10] === null, r2.lines[10]);
  // an input method
  {
    const cdp = await page.context().newCDPSession(page);
    await caretAt(11);
    await cdp.send('Input.imeSetComposition', { text: '1.', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.imeSetComposition', { text: '1. ', selectionStart: 3, selectionEnd: 3 });
    await settle();
    const i0 = await st();
    await cdp.send('Input.insertText', { text: '1. ' });
    await settle();
    const i1 = await st();
    ok('an input method composing "1." and a space, committed: typed as it is, no list', i0.lines[11] === '' && i1.lines[11] === '1. '
      && i1.labels[11] === null && !i1.msgs, { i0: i0.lines[11], i1: i1.lines[11], l: i1.labels[11] });
    await caretAt(12);
    await type('1.');
    await cdp.send('Input.imeSetComposition', { text: ' ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: ' ' });
    await settle();
    const i2 = await st();
    ok('"1." typed, then a space committed by an input method: no list', i2.lines[12] === '1. ' && i2.labels[12] === null, i2.lines[12]);
    await type('x');
    // a Save while an input method composes a space after '-': the
    // save types the composing text itself (DocSave), never a list
    const li = (await st()).lines.indexOf('Last');
    await caretAt(li, 0);
    await type('-');
    await cdp.send('Input.imeSetComposition', { text: ' ', selectionStart: 1, selectionEnd: 1 });
    await settle();
    const saved = await ev(async () => { const d = window.__doc(), c = d.view.composing; return { c, ok: await d.save() }; });
    await settle();
    const i3 = await st();
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await settle();
    ok('a Save while a space is being composed after "-": the space is typed by the save, no list',
      saved.c === ' ' && saved.ok === true && i3.lines[li] === '- Last' && i3.labels[li] === null, { saved, l: i3.lines[li], b: i3.labels[li] });
    await cdp.detach();
  }
  // paste
  await caretAt(13);
  await ev(() => navigator.clipboard.writeText('* x'));
  await press(MOD + '+v');
  await wait(200);
  await settle();
  const r3 = await st();
  ok(`${MOD}-V of "* x": pasted as text, no list`, r3.lines[13] === '* x' && r3.labels[13] === null, { l: r3.lines[13], b: r3.labels[13] });
  // Find / Replace
  const r4 = await ev(() => {
    const d = window.__doc();
    d.view.setSelection({ id: d.d.doc.sections[0].blocks[0].id, off: 0 });
    d.dw.view.focus();
    const f = window.__word().word.find;
    f.open(true);
    const msg = f.run('all', { find: 'Q', replace: '1. ', matchCase: true, whole: false });
    return { msg, s: window.__state() };
  });
  const q = r4.s.lines.indexOf('1. text');
  ok('Replace all making "1. text": no list', q > 0 && r4.s.labels[q] === null && /^1 replaced/.test(r4.msg), { msg: r4.msg, q, l: r4.s.lines });
  await ev(() => os.wimp.menus.close());
  await ev(() => { for (const w of os.wimp.windows) if (w.isOpen && w.iconByName?.('button:Replace all')) w.close(); });
  await settle();
  // undo / redo of typing '1. ' made without the conversion
  await caretAt(14);
  await type('1.');
  await type(' ');
  const r5a = await st();
  await press('Control+z');
  await press('Control+z');
  const r5 = await st();
  await press('Control+y');
  const r6 = await st();
  ok('undo then redo of the typed "1. " (after the conversion was undone too): the text back, no list', r5a.labels[14] === '1.'
    && r6.lines[14] === '1. ' && r6.labels[14] === null && r5.lines[14] === '', { a: r5a.labels[14], r5: r5.lines[14], r6: r6.lines[14], l: r6.labels[14] });
  await press('Control+z');

  // ---------------------------------------------------- Mac: Cmd-Z
  await ev(() => { window.__doc().dw.view.mac = true; });
  await caretAt(15);
  await type('- ');
  const m0 = await st();
  await press('Meta+z');
  const m1 = await st();
  ok('on a Mac: "- " makes a dash item; Cmd-Z gives back "- "', m0.labels[15] === '–' && m1.lines[15] === '- ' && m1.labels[15] === null, { m0: m0.labels[15], m1: m1.lines[15] });
  await press('Meta+z');
  await ev(() => { window.__doc().dw.view.mac = false; });

  // ---------------------------------------------------- Format > AutoFormat lists
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pick = async (level, text, { hover = false } = {}) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + esc(text), 'i') }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item ${text} at level ${level}`);
    if (hover) {
      await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
      await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
      await wait(250);
    } else {
      await page.mouse.click(b.x + 30, b.y + b.height / 2);
      await wait(150);
    }
    await settle();
  };
  const formatItems = () => ev(() => {
    const lv = os.wimp.menus.levels[1];
    return lv ? lv.rows.map((r) => [String(r.item.text), typeof r.item.ticked === 'function' ? !!r.item.ticked(r.item) : !!r.item.ticked]) : null;
  });
  const formatMenu = async () => {
    await ev(() => os.wimp.menus.close());
    const ic = await ev(() => { const rc = window.__doc().toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: rc.left + 4, y: rc.top + 4 }; });
    await click(ic, { button: 'middle' });
    await wait(200);
    await pick(0, 'Format', { hover: true });
  };
  await formatMenu();
  const f1 = await formatItems();
  const af = (f) => f && f.find((x) => x[0] === 'AutoFormat lists');
  ok('Format > AutoFormat lists, last, ticked', af(f1) && af(f1)[1] === true && f1[f1.length - 1][0] === 'AutoFormat lists', f1);
  await pick(1, 'AutoFormat lists');
  await ev(() => os.wimp.menus.close());
  await settle();
  const ch1 = await ev(async (C) => JSON.parse(await os.vfs.readText(C)), CHOICES);
  ok('... chosen: off, kept in Choices:Word beside Recent', ch1.autoList === false && Array.isArray(ch1.recent)
    && ch1.recent.some((x) => /RamDisc0\.\$\.Au$/.test(x)), ch1);
  await caretAt(15);
  await type('* off');
  const o1 = await st();
  ok('... with it off, "* " is typed as it is', o1.lines[15] === '* off' && o1.labels[15] === null, o1.lines[15]);
  await formatMenu();
  const f2 = await formatItems();
  ok('... and the item is not ticked', af(f2) && af(f2)[1] === false, f2);
  await ev(() => os.wimp.menus.close());
  // a restart of Word: still off, Recent still there
  const re = await ev(async (C) => {
    window.__word().quit();
    await window.__sleep(100);
    await window.__start();
    const word = window.__word().word;
    await window.__openAu();
    return { recent: word.recent, file: JSON.parse(await os.vfs.readText(C)) };
  }, CHOICES);
  ok('Word started again: Recent is read back and the choice kept (neither overwrote the other)',
    re.recent.some((x) => /RamDisc0\.\$\.Au$/.test(x)) && re.file.autoList === false && re.file.recent.length >= 1, re);
  const free = (x, from = 0) => x.lines.findIndex((l, k) => k >= from && l === '' && x.labels[k] === null);
  const z0 = free(await st(), 8);
  await caretAt(z0, 0);
  await type('* still off ');
  const o2 = await st();
  ok('... and typing "* " at a start converts nothing', z0 > 0 && o2.lines[z0] === '* still off ' && o2.labels[z0] === null, { z0, l: o2.lines });
  await formatMenu();
  const f3 = await formatItems();
  await pick(1, 'AutoFormat lists');
  await ev(() => os.wimp.menus.close());
  const ch2 = await ev(async (C) => JSON.parse(await os.vfs.readText(C)), CHOICES);
  const z1 = free(await st(), z0 + 1);
  await caretAt(z1);
  await type('* on');
  const o3 = await st();
  ok('turned on again: unticked before, kept true, "* " converts again', af(f3) && af(f3)[1] === false && ch2.autoList === true
    && ch2.recent.length >= 1 && z1 > z0 && o3.labels[z1] === '•' && o3.lines[z1] === 'on', { f3: af(f3), ch2, l: o3.labels, t: o3.lines });
  const msgs = await ev(() => window.__msgs);
  ok('no error messages', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
