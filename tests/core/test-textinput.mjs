// The opt-in text-input proxy (src/core/textinput.js, wimp.setCaret(..., {text: true})) in a real browser:
// node tests/core/test-textinput.mjs
// Printable keys reach a text-caret window once, as `textinput`; other keys stay `key`; IME composition gives
// `composition` / `compositionend`; carets without the option behave exactly as before.
import { launch, BASE_URL } from './pw.mjs';

const { browser, page, logs } = await launch();
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const cdp = await page.context().newCDPSession(page);

  // Two windows made through the same API applications use: T (text caret) and P (plain caret, no option).
  const none = await page.evaluate(() => os.wimp.textInput.el === null && ![...document.querySelectorAll('textarea')].some((x) => !x.closest('.screen')));
  ok('no proxy element before the first text caret', none);

  const geo = await page.evaluate(() => {
    const t = os.wimp.createTask('TextInputTest');
    const log = window.__log = [];
    const rec = (name, w) => {
      w.on('key', (ev) => { log.push({ w: name, type: 'key', code: ev.code, char: ev.char ?? '' }); return true; });
      for (const type of ['textinput', 'composition', 'compositionend']) {
        w.on(type, (ev) => { log.push({ w: name, type, text: ev.text, truncated: ev.truncated, start: ev.start, cancelled: ev.cancelled }); return true; });
      }
    };
    const T = window.__T = t.createWindow({ title: 'Text', x: 100, y: 100, w: 300, h: 200, extent: { w: 300, h: 200 }, flags: { title: true, moveable: true }, workButton: 'click' });
    const P = window.__P = t.createWindow({ title: 'Plain', x: 500, y: 100, w: 300, h: 200, extent: { w: 300, h: 200 }, flags: { title: true, moveable: true }, workButton: 'click' });
    rec('T', T); rec('P', P);
    T.on('click', () => { os.wimp.setCaret(T, null, -1, { x: 10, y: 10, h: 20 }, { text: true }); return true; });
    P.on('click', () => { os.wimp.setCaret(P, null, -1, { x: 10, y: 10, h: 20 }); return true; });
    T.open(); P.open();
    const s = os.wimp.screen.getBoundingClientRect(), z = os.wimp.scale;
    const c = (w) => ({ x: s.x + (w.x + 40) * z, y: s.y + (w.y + 60) * z });   // inside the work area
    return { T: c(T), P: c(P) };
  });
  const take = () => page.evaluate(() => window.__log.splice(0));
  const proxyState = () => page.evaluate(() => {
    const a = document.activeElement;
    const px = [...document.querySelectorAll('textarea')].find((x) => !x.closest('.screen'));
    return {
      focused: !!px && a === px, body: a === document.body, inScreen: px ? !!px.closest('.screen') : null,
      value: px?.value ?? null, text: os.wimp.caret?.text ?? null,
    };
  });
  const textOf = (l) => l.filter((e) => e.type === 'textinput').map((e) => e.text);

  // ---- a plain caret: nothing changes
  await page.mouse.click(geo.P.x, geo.P.y);
  let s = await proxyState();
  ok('plain caret: proxy not focused, activeElement is body', !s.focused && s.body && s.text !== true, s);
  await page.keyboard.press('a');
  let l = await take();
  ok('plain caret: a gives key with char a, no textinput', l.length === 1 && l[0].type === 'key' && l[0].char === 'a' && l[0].w === 'P', l);

  // ---- a text caret, placed by a click (focus inside the gesture)
  await page.mouse.click(geo.T.x, geo.T.y);
  s = await proxyState();
  ok('text caret: wimp.caret.text is true', s.text === true, s);
  ok('text caret: proxy focused after click', s.focused, s);
  ok('text caret: proxy is outside .screen', s.inScreen === false, s);
  const attrs = await page.evaluate(() => {
    const px = document.activeElement, cs = getComputedStyle(px);
    return {
      pos: cs.position, op: cs.opacity, fs: cs.fontSize, w: px.offsetWidth, h: px.offsetHeight, tab: px.tabIndex,
      ac: px.getAttribute('autocapitalize'), acr: px.getAttribute('autocorrect'), acp: px.getAttribute('autocomplete'),
      sp: px.spellcheck, aria: px.getAttribute('aria-hidden'),
    };
  });
  ok('proxy attributes', attrs.pos === 'fixed' && attrs.op === '0' && attrs.fs === '16px' && attrs.w <= 1 && attrs.h <= 1 && attrs.tab === -1
    && attrs.ac === 'off' && attrs.acr === 'off' && attrs.acp === 'off' && attrs.sp === false && attrs.aria === 'true', attrs);
  await take();

  await page.keyboard.insertText('é€😀');
  l = await take();
  ok('insertText é€😀 gives one textinput', l.length === 1 && l[0].type === 'textinput' && l[0].text === 'é€😀' && l[0].truncated === false && l[0].w === 'T', l);

  await page.keyboard.press('a');
  l = await take();
  ok('a gives exactly one textinput and no key', l.length === 1 && l[0].type === 'textinput' && l[0].text === 'a', l);
  await page.keyboard.press('Shift+A');
  await page.keyboard.press('Space');
  l = await take();
  ok('Shift-A and Space are text', JSON.stringify(textOf(l)) === '["A"," "]' && l.length === 2, l);

  for (const [k, code] of [['Backspace', 8], ['ArrowLeft', 0x18C], ['F5', 0x185], ['Control+z', 26], ['Enter', 13], ['Tab', 0x18A], ['Delete', 127], ['Escape', 27]]) {
    await page.keyboard.press(k);
    l = await take();
    ok(`${k} gives one key and no textinput`, l.length === 1 && l[0].type === 'key' && l[0].code === code, l);
  }
  s = await proxyState();
  ok('proxy value empty after commits and keys', s.value === '' && s.focused, s);

  // ---- dead key (Windows style: a Dead keydown, then the composed character)
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Dead', code: 'Quote', windowsVirtualKeyCode: 222 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Dead', code: 'Quote', windowsVirtualKeyCode: 222 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'é', code: 'KeyE', windowsVirtualKeyCode: 69, text: 'é', unmodifiedText: 'é' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'é', code: 'KeyE', windowsVirtualKeyCode: 69 });
  l = await take();
  ok('dead key then e gives one textinput é and no key', l.length === 1 && l[0].type === 'textinput' && l[0].text === 'é', l);
  // dead key (macOS style: the accent as a composition, then the commit)
  await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: 'é' });
  l = await take();
  ok('dead key as composition commits é once', JSON.stringify(textOf(l)) === '["é"]', l);

  // ---- IME composition
  await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '日本' });
  l = await take();
  const seq = l.map((e) => e.type).join(',');
  // Chrome sends a last compositionupdate with the committed text just before compositionend
  const n = l.length;
  ok('composition: start, updates, end, then textinput', /^(composition,){2,3}compositionend,textinput$/.test(seq)
    && l[0].start === true && l[0].text === 'に' && l[1].start === false && l[1].text === 'にほ'
    && l.slice(1, n - 2).every((e) => e.start === false)
    && l[n - 2].cancelled === false && l[n - 2].text === '日本' && l[n - 1].text === '日本', l);
  s = await proxyState();
  ok('proxy value empty after composition', s.value === '', s);

  await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  l = await take();
  const end = l.filter((e) => e.type === 'compositionend');
  ok('cancelled composition: compositionend cancelled, no textinput', end.length === 1 && end[0].cancelled === true && !textOf(l).length, l);
  s = await proxyState();
  ok('proxy value empty after cancelled composition', s.value === '', s);
  await page.keyboard.press('b');
  l = await take();
  ok('typing works after a cancelled composition', JSON.stringify(textOf(l)) === '["b"]' && l.length === 1, l);

  // ---- limits and cleaning
  await cdp.send('Input.insertText', { text: 'x'.repeat(150000) });
  l = await take();
  ok('150,000 characters truncated to 100,000', l.length === 1 && l[0].text.length === 100000 && l[0].truncated === true, l.map((e) => ({ ...e, text: e.text?.length })));
  await page.keyboard.insertText('a\u0001b\u0007c\td\ne');
  l = await take();
  ok('control characters dropped, \\t and \\n kept', JSON.stringify(textOf(l)) === JSON.stringify(['abc\td\ne']), l);
  await page.evaluate(() => {
    const px = document.activeElement;
    px.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: '\uD800x', cancelable: true, bubbles: true }));
  });
  l = await take();
  ok('lone surrogate replaced', JSON.stringify(textOf(l)) === JSON.stringify(['�x']), l);

  // ---- auto-repeat
  for (let i = 0; i < 10; i++) await page.keyboard.down('a');
  await page.keyboard.up('a');
  l = await take();
  ok('auto-repeat: ten a give ten textinput', textOf(l).length === 10 && l.length === 10 && textOf(l).every((t) => t === 'a'), l);
  await Promise.all(['1', '2', '3', '4', '5'].map((k) => cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'Digit' + k, windowsVirtualKeyCode: 48 + +k, text: k })));
  await Promise.all(['1', '2', '3', '4', '5'].map((k) => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Digit' + k, windowsVirtualKeyCode: 48 + +k })));
  l = await take();
  ok('five keys sent at once each delivered once, in order', textOf(l).join('') === '12345' && l.length === 5, l);
  await page.keyboard.type('hello');
  l = await take();
  ok('typing hello gives hello once', textOf(l).join('') === 'hello' && l.length === 5, l);

  // ---- mobile-style edits with no real keydown (keyCode 229): delivered as keys, once
  await page.evaluate(() => {
    const px = document.activeElement;
    px.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 229, bubbles: true, cancelable: true }));
    px.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true, bubbles: true }));
    px.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', cancelable: true, bubbles: true }));
  });
  l = await take();
  ok('deleteContentBackward / insertLineBreak with no key give Backspace / Return keys', l.map((e) => e.type + e.code).join() === 'key8,key13', l);

  // ---- a composition ending with empty data while the field holds the committed text
  await page.evaluate(() => {
    const px = document.activeElement;
    px.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    px.value = '漢字';
    px.dispatchEvent(new CompositionEvent('compositionend', { data: '' }));
  });
  l = await take();
  ok('compositionend with empty data commits the field text', l.map((e) => e.type).join() === 'compositionend,textinput'
    && l[0].cancelled === false && l[0].text === '漢字' && l[1].text === '漢字', l);
  ok('field empty after that', (await proxyState()).value === '');

  // ---- a cancelled beforeinput, then an edit the browser did not cancel (plain input event): delivered
  await page.evaluate(() => {
    const px = document.activeElement;
    px.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'q', cancelable: true, bubbles: true }));
    px.value = 'z';
    px.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'z', bubbles: true }));
  });
  l = await take();
  ok('cancelled beforeinput then a plain input: both delivered once', JSON.stringify(textOf(l)) === '["q","z"]' && l.length === 2, l);
  await page.evaluate(() => {
    const px = document.activeElement;
    px.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'u', cancelable: false, bubbles: true }));
    px.value = 'u';
    px.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'u', bubbles: true }));
  });
  l = await take();
  ok('uncancellable beforeinput: delivered once, field cleared', JSON.stringify(textOf(l)) === '["u"]' && l.length === 1 && (await proxyState()).value === '', l);

  // ---- AltGr (Ctrl+Alt giving a character) is text; Ctrl+Alt+letter/digit is a key
  const alt = await page.evaluate(() => {
    const px = document.activeElement;
    const send = (key, code) => { const e = new KeyboardEvent('keydown', { key, code, ctrlKey: true, altKey: true, bubbles: true, cancelable: true }); px.dispatchEvent(e); return e.defaultPrevented; };
    return { at: send('@', 'KeyQ'), euro: send('€', 'KeyE'), c: send('c', 'KeyC'), one: send('1', 'Digit1') };
  });
  l = await take();
  ok('AltGr @ and € are left to the browser (no key, not prevented)', !alt.at && !alt.euro && !l.some((e) => e.char === '@' || e.code === 0x80), { alt, l });
  ok('Ctrl+Alt+C and Ctrl+Alt+1 are key events', alt.c && alt.one && l.length === 2 && l.every((e) => e.type === 'key') && l[0].code === 99 && l[1].code === 49, { alt, l });

  // ---- a modal state swallows printable keys: no textinput
  await page.evaluate(() => { window.__mk = 0; os.wimp.modal = { onKey: () => { window.__mk++; return false; } }; });
  await page.keyboard.press('a');
  const mk = await page.evaluate(() => { os.wimp.modal = null; return window.__mk; });
  l = await take();
  ok('modal: printable key goes to the modal, no textinput', mk === 1 && !l.length && (await proxyState()).value === '', { mk, l });

  // ---- a menu dialogue box with a writable icon takes the caret; closing it restores the text caret
  const menu = await page.evaluate(() => {
    const t = os.wimp.tasks.find((x) => x.name === 'TextInputTest');
    const D = t.createWindow({ title: 'Dbox', x: 0, y: 0, w: 200, h: 80, extent: { w: 200, h: 80 }, flags: { title: true },
      icons: [{ x: 10, y: 10, w: 120, h: 28, text: 'x', button: 'writable', border: true }] });
    os.wimp.menus.open(D, 300, 400);
    const inMenu = { win: os.wimp.caret?.window === D, text: os.wimp.caret?.text ?? null, proxy: document.activeElement === os.wimp.textInput.el };
    os.wimp.menus.close();
    const c = os.wimp.caret;
    return { inMenu, after: { win: c?.window === window.__T, text: c?.text ?? null, proxy: document.activeElement === os.wimp.textInput.el } };
  });
  ok('menu dbox: caret in the dbox, proxy blurred', menu.inMenu.win && menu.inMenu.text !== true && !menu.inMenu.proxy, menu);
  ok('menu closed: text caret restored with the proxy focused', menu.after.win && menu.after.text === true && menu.after.proxy, menu);
  await page.keyboard.press('m');
  l = await take();
  ok('typing after the menu: textinput', JSON.stringify(textOf(l)) === '["m"]' && l.length === 1, l);

  // ---- hot keys keep priority
  const f12 = await page.evaluate(() => { window.__f12 = 0; os.wimp.on('hotkey:F12', () => { window.__f12++; return true; }, { first: true }); return true; });
  await page.keyboard.press('F12');
  l = await take();
  ok('F12 still emits its hot key with a text caret', f12 && (await page.evaluate(() => window.__f12)) === 1 && !l.length, l);

  // ---- caret elsewhere: proxy blurred
  await page.mouse.click(geo.P.x, geo.P.y);
  s = await proxyState();
  ok('caret to a plain window: proxy blurred', !s.focused && s.body && s.text !== true, s);
  await page.keyboard.press('a');
  l = await take();
  ok('plain caret again: a gives key', l.length === 1 && l[0].type === 'key' && l[0].char === 'a' && l[0].w === 'P', l);

  await page.mouse.click(geo.T.x, geo.T.y);
  ok('text caret again: focused', (await proxyState()).focused);
  await page.evaluate(() => os.wimp.setCaret(null));
  s = await proxyState();
  ok('setCaret(null): proxy blurred', !s.focused && s.body, s);

  // ---- losing the caret mid-composition leaves no stuck state
  await page.mouse.click(geo.T.x, geo.T.y);
  await take();
  await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
  await page.mouse.click(geo.P.x, geo.P.y);
  l = await take();
  const ends = l.filter((e) => e.type === 'compositionend');
  ok('caret moved mid-composition: one cancelled compositionend to T, no textinput', ends.length === 1 && ends[0].w === 'T' && ends[0].cancelled === true && !textOf(l).length, l);
  await page.keyboard.press('a');
  l = await take();
  ok('after that, the plain window gets key a', l.length === 1 && l[0].type === 'key' && l[0].w === 'P', l);
  await page.mouse.click(geo.T.x, geo.T.y);
  await page.keyboard.press('c');
  l = await take();
  ok('and the text window types again', JSON.stringify(textOf(l)) === '["c"]' && l.length === 1, l);

  // ---- a window closed with the text caret
  await page.evaluate(() => window.__T.close());
  s = await proxyState();
  ok('window closed: caret gone, proxy blurred', !s.focused && s.text !== true, s);
  await page.evaluate(() => os.wimp.tasks.find((t) => t.name === 'TextInputTest')?.quit());
} catch (e) { res.push('FAIL exception ' + e.stack); }
console.log(res.join('\n'));
if (logs.some((l) => /PAGEERROR/.test(l))) console.log(logs.filter((l) => /PAGEERROR/.test(l)).join('\n'));
await browser.close();
if (res.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
