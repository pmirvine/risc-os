// Clipboard events for text carets (src/core/wimp.js _paste / _copyCut / _keyDown, src/core/textinput.js exec,
// wimp.readClipboard), caret blink and click counts, in a real browser:
// node tests/core/test-clipboard.mjs
// Everything is opt-in through setCaret(..., {text: true}); the plain-caret and writable-icon windows here are the
// control: they must behave exactly as before.
import { launch, BASE_URL } from './pw.mjs';

const { browser, page, logs } = await launch();
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const origin = new URL(BASE_URL).origin;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
  const MOD = mac ? 'Meta' : 'Control';

  const geo = await page.evaluate(() => {
    const t = os.wimp.createTask('ClipboardTest');
    const log = window.__log = [];
    window.__ret = {};          // per event type: what the handler returns
    window.__copyFn = null;     // copy/cut handler body
    const strip = (ev) => Object.keys(ev).filter((k) => !['type', 'defaultPrevented', 'preventDefault', 'handled'].includes(k)).sort();
    const rec = (name, w) => {
      w.on('key', (ev) => { log.push({ w: name, type: 'key', code: ev.code, key: ev.key }); return true; });
      w.on('textinput', (ev) => { log.push({ w: name, type: 'textinput', text: ev.text }); return true; });
      w.on('paste', (ev) => {
        log.push({ w: name, type: 'paste', keys: strip(ev), text: ev.text, html: ev.html, files: ev.files?.map((f) => f.name), win: ev.window === w });
        return window.__ret.paste;
      });
      for (const type of ['copy', 'cut']) {
        w.on(type, (ev) => {
          const r = window.__copyFn ? window.__copyFn(ev) : undefined;
          window.__lateSet = ev.setData;
          log.push({ w: name, type, cut: ev.cut, keys: strip(ev), win: ev.window === w, r });
          return true;
        });
      }
      for (const type of ['click', 'doubleclick']) w.on(type, (ev) => { log.push({ w: name, type, count: ev.count }); return true; });
    };
    const mk = (title, x, workButton, extra = {}) => t.createWindow({ title, x, y: 100, w: 260, h: 200, extent: { w: 260, h: 200 }, flags: { title: true, moveable: true }, workButton, ...extra });
    const T = window.__T = mk('Text', 40, 'clickdragdouble');
    const P = window.__P = mk('Plain', 320, 'click');
    const W = window.__W = mk('Icon', 600, 'click', { icons: [{ x: 10, y: 10, w: 200, h: 28, text: 'x', button: 'writable', border: true }] });
    rec('T', T); rec('P', P); rec('W', W);
    window.__opts = { text: true };
    T.on('click', () => { os.wimp.setCaret(T, null, -1, { x: 10, y: 10, h: 20 }, window.__opts); }, { first: true });
    T.on('doubleclick', () => { os.wimp.setCaret(T, null, -1, { x: 10, y: 10, h: 20 }, window.__opts); }, { first: true });
    P.on('click', () => { os.wimp.setCaret(P, null, -1, { x: 10, y: 10, h: 20 }); }, { first: true });
    T.open(); P.open(); W.open();
    // the default action of each keydown, seen after the Wimp's capturing listener
    window.__kd = [];
    window.addEventListener('keydown', (e) => window.__kd.push({ key: e.key, prevented: e.defaultPrevented }));
    // page helpers
    window.__dt = ({ text, html, files = 0 } = {}) => {
      const dt = new DataTransfer();
      if (text != null) dt.setData('text/plain', text);
      if (html != null) dt.setData('text/html', html);
      for (let i = 0; i < files; i++) dt.items.add(new File(['data' + i], 'f' + i + '.txt', { type: 'text/plain' }));
      return dt;
    };
    window.__fire = (type, target, dt) => {
      const e = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const s = os.wimp.screen.getBoundingClientRect(), z = os.wimp.scale;
    const c = (w) => ({ x: s.x + (w.x + 60) * z, y: s.y + (w.y + 90) * z });
    return { T: c(T), P: c(P) };
  });
  const take = () => page.evaluate(() => window.__log.splice(0));
  const kd = () => page.evaluate(() => window.__kd.splice(0).filter((e) => !['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)));
  const proxyValue = () => page.evaluate(() => os.wimp.textInput.el?.value ?? null);
  const focusT = async () => { await page.mouse.click(geo.T.x, geo.T.y); await page.waitForTimeout(450); await take(); await kd(); };
  const focusP = async () => { await page.mouse.click(geo.P.x, geo.P.y); await page.waitForTimeout(450); await take(); await kd(); };

  // ================================================================ paste
  await focusT();
  ok('text caret placed by a click', await page.evaluate(() => os.wimp.caret?.text === true && document.activeElement === os.wimp.textInput.el));
  let r = await page.evaluate(() => { window.__ret.paste = true; return __fire('paste', os.wimp.textInput.el, __dt({ text: 'hi\r\nthere', html: '<b>hi</b>', files: 1 })); });
  let l = await take();
  ok('paste (text caret): {text, html, files, window}', l.length === 1 && l[0].type === 'paste' && l[0].w === 'T'
    && JSON.stringify(l[0].keys) === '["files","html","text","window"]' && l[0].text === 'hi\nthere' && l[0].html === '<b>hi</b>'
    && JSON.stringify(l[0].files) === '["f0.txt"]' && l[0].win, l);
  ok('paste handled by the window: DOM paste prevented', r === true, r);
  ok('paste: proxy value stays empty, no textinput', (await proxyValue()) === '' && !l.some((e) => e.type === 'textinput'), l);
  r = await page.evaluate(() => { window.__ret.paste = undefined; return __fire('paste', os.wimp.textInput.el, __dt({ text: 'a' })); });
  l = await take();
  ok('paste not handled: DOM paste not prevented', r === false && l.length === 1 && l[0].text === 'a' && l[0].html === '' && l[0].files.length === 0, { r, l });
  await page.evaluate(() => __fire('paste', os.wimp.textInput.el, __dt({ html: 'h'.repeat(2000001) })));
  l = await take();
  ok('paste: html over 2,000,000 characters only: nothing to deliver, no event', l.length === 0, l);
  await page.evaluate(() => __fire('paste', os.wimp.textInput.el, __dt({ text: 't', html: 'h'.repeat(2000001) })));
  l = await take();
  ok('paste: html over 2 MB becomes "" (not truncated)', l.length === 1 && l[0].html === '' && l[0].text === 't', l.map((e) => ({ ...e, html: e.html?.length })));
  await page.evaluate(() => __fire('paste', os.wimp.textInput.el, __dt({ html: 'h'.repeat(2000000) })));
  l = await take();
  ok('paste: html of exactly 2,000,000 characters kept, html-only paste delivered', l.length === 1 && l[0].html.length === 2000000 && l[0].text === '', l.map((e) => ({ ...e, html: e.html?.length })));
  await page.evaluate(() => __fire('paste', os.wimp.textInput.el, __dt({ text: 'x'.repeat(150000) })));
  l = await take();
  ok('paste: text over 100,000 units capped', l.length === 1 && l[0].text.length === 100000, l.map((e) => ({ ...e, text: e.text?.length })));
  await page.evaluate(() => __fire('paste', os.wimp.textInput.el, __dt({ files: 9 })));
  l = await take();
  ok('paste: 9 files give 8 (files only is delivered)', l.length === 1 && l[0].files.length === 8 && l[0].files[7] === 'f7.txt' && l[0].text === '', l);
  await page.evaluate(() => __fire('paste', os.wimp.textInput.el, __dt({})));
  ok('paste: empty clipboard, no event', (await take()).length === 0);
  // a paste aimed at a page field outside the desktop is that field's
  r = await page.evaluate(() => {
    const f = document.createElement('input'); document.body.appendChild(f);
    const p = __fire('paste', f, __dt({ text: 'z' })); f.remove(); return p;
  });
  l = await take();
  ok('paste into a page field outside the desktop: not delivered', l.length === 0 && r === false, { r, l });

  // a real paste (keyboard shortcut, system clipboard): delivered once as paste, never also as textinput
  await page.evaluate(() => navigator.clipboard.writeText('real paste'));
  for (const ret of [true, undefined]) {
    await page.evaluate((v) => { window.__ret.paste = v; }, ret);
    await page.keyboard.press(MOD + '+v');
    await page.waitForTimeout(50);
    l = await take();
    const k = await kd();
    ok(`real ${MOD}+V (handler returns ${ret}): key, then paste, no textinput, proxy empty`,
      l.map((e) => e.type).join() === 'key,paste' && l[1].text === 'real paste' && (await proxyValue()) === '' && k[0]?.prevented === false, { l, k });
  }
  if (mac) {
    await page.keyboard.press('Control+v');
    l = await take();
    const k = await kd();
    ok('real Control+V on a Mac: key event, not prevented', l.length === 1 && l[0].type === 'key' && k[0].prevented === false, { l, k });
  }

  // ---- control: a plain caret gets {text} exactly as before
  await focusP();
  r = await page.evaluate(() => { window.__ret.paste = true; return __fire('paste', document.body, __dt({ text: 'p\r\nq', html: '<i>x</i>', files: 2 })); });
  l = await take();
  ok('plain caret: paste is {text} only, raw text, DOM paste not prevented', l.length === 1 && l[0].w === 'P'
    && JSON.stringify(l[0].keys) === '["text"]' && l[0].text === 'p\r\nq' && r === false, { r, l });
  await page.evaluate(() => __fire('paste', document.body, __dt({ html: '<i>x</i>' })));
  ok('plain caret: html-only paste gives no event (as before)', (await take()).length === 0);
  await page.evaluate(() => { window.__ret.paste = undefined; os.wimp.setCaret(__W, 0, 1); });
  await page.evaluate(() => __fire('paste', document.body, __dt({ text: 'ab\ncd', html: '<b>no</b>' })));
  l = await take();
  const icon = await page.evaluate(() => __W.icons[0].text);
  ok('writable icon: first line typed into the icon, no paste event', l.length === 0 && icon === 'xab', { l, icon });

  // ================================================================ copy / cut
  await focusT();
  const copy = (type, target = 'proxy') => page.evaluate(([type, target]) => {
    const dt = new DataTransfer();
    const field = target === 'field' ? document.body.appendChild(document.createElement('input')) : null;
    const t = target === 'proxy' ? os.wimp.textInput.el : target === 'screen' ? os.wimp.screen
      : target === 'html' ? document.documentElement : field ?? document.body;
    const prevented = __fire(type, t, dt);
    field?.remove();
    return { prevented, types: [...dt.types], plain: dt.getData('text/plain'), html: dt.getData('text/html'), evil: dt.getData('application/x-evil') };
  }, [type, target]);
  await page.evaluate(() => {
    window.__copyFn = (ev) => [ev.setData('text/plain', 'a'), ev.setData('text/html', '<b>a</b>'), ev.setData('application/x-evil', 'x')];
  });
  r = await copy('copy');
  l = await take();
  ok('copy: event {window, cut, setData} to the text-caret window', l.length === 1 && l[0].type === 'copy' && l[0].w === 'T' && l[0].cut === false
    && JSON.stringify(l[0].keys) === '["cut","setData","window"]' && l[0].win, l);
  ok('copy: setData returns true, true, false (unknown type)', JSON.stringify(l[0]?.r) === '[true,true,false]', l);
  ok('copy: text/plain and text/html written, other types absent, prevented', r.prevented && r.plain === 'a' && r.html === '<b>a</b>'
    && r.evil === '' && !r.types.includes('application/x-evil'), r);
  ok('copy: setData after the event does nothing', await page.evaluate(() => window.__lateSet('text/plain', 'late') === false));
  r = await copy('cut');
  l = await take();
  ok('cut: event with cut: true, data written, prevented', l.length === 1 && l[0].type === 'cut' && l[0].cut === true && r.prevented && r.plain === 'a', { l, r });
  await page.evaluate(() => { window.__copyFn = null; });
  r = await copy('copy');
  l = await take();
  ok('copy with no setData: default left (not prevented, nothing written)', l.length === 1 && !r.prevented && r.types.length === 0, { l, r });
  await page.evaluate(() => { window.__copyFn = (ev) => ev.setData('text/html', 'h'.repeat(8000001)); });
  r = await copy('copy');
  ok('copy with only an oversized html: dropped, not prevented', !r.prevented && r.types.length === 0, r);
  await take();
  await page.evaluate(() => { window.__copyFn = (ev) => ev.setData('text/plain', 's'); });
  r = await copy('copy', 'screen');
  l = await take();
  ok('copy targeted inside .screen: delivered', l.length === 1 && r.prevented && r.plain === 's', { l, r });
  r = await copy('copy', 'field');
  l = await take();
  ok('copy targeted at a page field outside the desktop: not delivered', l.length === 0 && !r.prevented, { l, r });
  for (const tg of ['body', 'html']) {
    for (const type of ['copy', 'cut']) {
      r = await copy(type, tg);
      l = await take();
      ok(`${type} targeted at document ${tg} (hidden field lost focus): delivered`, l.length === 1 && l[0].type === type && l[0].w === 'T' && r.prevented && r.plain === 's', { l, r });
    }
    r = await page.evaluate((tg) => { window.__ret.paste = true; return __fire('paste', tg === 'html' ? document.documentElement : document.body, __dt({ text: 'bp' })); }, tg);
    l = await take();
    ok(`paste targeted at document ${tg}: delivered`, l.length === 1 && l[0].type === 'paste' && l[0].text === 'bp' && r === true, { l, r });
  }
  await page.evaluate(() => { window.__ret.paste = undefined; });
  // the caret is still a text caret in a window that is not open: only isOpen keeps the event away
  const noWin = await page.evaluate(() => {
    const t = os.wimp.tasks.find((x) => x.name === 'ClipboardTest');
    const X = t.createWindow({ title: 'X', x: 0, y: 0, w: 100, h: 100, extent: { w: 100, h: 100 }, flags: { title: true } });
    let n = 0; X.on('copy', (ev) => { n++; ev.setData('text/plain', 'x'); return true; });
    X.open(); os.wimp.setCaret(X, null, -1, { x: 1, y: 1, h: 10 }, { text: true });
    const fire = () => __fire('copy', os.wimp.textInput.el, new DataTransfer());
    const open = { prevented: fire(), n };
    const saved = os.wimp.caret;
    X.close();
    os.wimp.caret = saved;      // what a stale caret would look like
    const state = { text: os.wimp.caret?.text === true, win: os.wimp.caret?.window === X, isOpen: X.isOpen };
    const closed = { prevented: fire(), n: n - open.n };
    os.wimp.caret = null;
    X.delete();
    return { open, state, closed };
  });
  ok('copy with a text caret whose window is not open: nothing (open: delivered)', noWin.open.n === 1 && noWin.open.prevented
    && noWin.state.text && noWin.state.win && !noWin.state.isOpen && noWin.closed.n === 0 && !noWin.closed.prevented, noWin);

  // ---- control: a plain caret gets no copy / cut
  await focusP();
  await page.evaluate(() => { window.__copyFn = (ev) => ev.setData('text/plain', 'no'); });
  r = await copy('copy', 'body');
  const r2 = await copy('cut', 'screen');
  l = await take();
  ok('plain caret: no copy / cut event, defaults untouched', l.length === 0 && !r.prevented && !r2.prevented && r.types.length === 0, { l, r, r2 });
  await page.evaluate(() => os.wimp.setCaret(__W, 0, 0));
  r = await copy('copy', 'screen');
  l = await take();
  ok('writable icon caret: no copy event', l.length === 0 && !r.prevented, { l, r });

  // ================================================================ keys
  await focusT();
  await page.evaluate(() => { window.__copyFn = (ev) => ev.setData('text/plain', 'kc'); });
  for (const [key, type] of [['c', 'copy'], ['x', 'cut']]) {
    await page.keyboard.press(`${MOD}+${key}`);
    l = await take();
    const k = await kd();
    ok(`real ${MOD}+${key.toUpperCase()} (text caret): key event first, then ${type}, not prevented`,
      l.map((e) => e.type).join() === 'key,' + type && k[0]?.prevented === false, { l, k });
  }
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(`real ${MOD}+X wrote the window's data to the system clipboard`, clip === 'kc', clip);
  // synthetic keydowns on the proxy: which are left to the browser
  const keys = (target) => page.evaluate((target) => {
    const t = target === 'proxy' ? os.wimp.textInput.el : document.body;
    const send2 = (key, code, m) => { const e = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...m }); t.dispatchEvent(e); return e.defaultPrevented; };
    const send = (key, m) => send2(key, 'Key' + key.toUpperCase(), m);
    return {
      ctrlC: send('c', { ctrlKey: true }), ctrlX: send('x', { ctrlKey: true }), ctrlV: send('v', { ctrlKey: true }), ctrlShiftC: send('C', { ctrlKey: true, shiftKey: true }),
      metaC: send('c', { metaKey: true }), metaX: send('x', { metaKey: true }), metaV: send('v', { metaKey: true }),
      metaR: send('r', { metaKey: true }), metaL: send('l', { metaKey: true }), ctrlR: send('r', { ctrlKey: true }),
      ctrlZ: send('z', { ctrlKey: true }), ctrlAltC: send('c', { ctrlKey: true, altKey: true }), metaAltC: send('c', { metaKey: true, altKey: true }),
      // non-Latin layouts: the layout's letter on the C / X / V keys (Russian с ч м, Greek ψ); Dvorak: J on KeyC
      ruC: send2('с', 'KeyC', { ctrlKey: true }), ruX: send2('ч', 'KeyX', { ctrlKey: true }), ruV: send2('м', 'KeyV', { metaKey: true }),
      grC: send2('ψ', 'KeyC', { ctrlKey: true }), ruAltC: send2('с', 'KeyC', { ctrlKey: true, altKey: true }), ruZ: send2('я', 'KeyZ', { ctrlKey: true }),
      dvorakJ: send2('j', 'KeyC', { ctrlKey: true }), dvorakC: send2('c', 'KeyI', { ctrlKey: true }),
    };
  }, target);
  const want = (o, prevented) => Object.entries(prevented).filter(([k, v]) => o[k] !== v);
  r = await keys('proxy');
  l = await take();
  let bad = want(r, { ctrlC: false, ctrlX: false, ctrlV: false, ctrlShiftC: false, metaC: false, metaX: false, metaV: false, metaR: true, metaL: true, ctrlR: true, ctrlZ: true, ctrlAltC: true, metaAltC: true });
  ok('text caret: Ctrl/Cmd+C/X/V left to the browser; Cmd-R, Cmd-L, Ctrl-R, Ctrl-Z, Ctrl+Alt+C, Cmd+Alt+C prevented', !bad.length, { bad, r });
  bad = want(r, { ruC: false, ruX: false, ruV: false, grC: false, ruAltC: false, ruZ: true, dvorakJ: true, dvorakC: false });
  ok('text caret, other layouts: Ctrl+с/ч, Cmd+м, Ctrl+ψ on the C/X/V keys left to the browser; Ctrl+я prevented; Dvorak: e.key decides (J on KeyC prevented, C on KeyI not)', !bad.length, { bad, r });
  // Ctrl+Alt+с is a non-ASCII character with Ctrl+Alt: the existing AltGr rule leaves it to the browser as text
  ok('text caret: every other key still reached the window as key (Ctrl+Alt+с is AltGr text, as before)', l.length === 20 && l.every((e) => e.type === 'key' && e.w === 'T'), l);
  // Cmd-R with nothing handling it is still prevented for a text caret (the caret is there)
  await page.evaluate(() => { window.__keyH = __T._h.get('key'); __T._h.set('key', []); });
  r = await keys('proxy');
  await page.evaluate(() => __T._h.set('key', window.__keyH));
  await take();
  ok('text caret, key not handled: Cmd-R / Cmd-L still prevented, Cmd-C not', r.metaR && r.metaL && !r.metaC && !r.ctrlC, r);

  // ---- control: plain caret keeps the old rules (Ctrl-C prevented; Cmd + c/v/x/r/l exempt)
  await focusP();
  r = await keys('body');
  l = await take();
  bad = want(r, { ctrlC: true, ctrlX: true, ctrlV: true, ctrlShiftC: true, metaC: false, metaX: false, metaV: false, metaR: false, metaL: false, ctrlR: true, ctrlZ: true, ctrlAltC: true, metaAltC: false });
  ok('plain caret: Ctrl-C/X/V prevented as before, Cmd + c/v/x/r/l exempt as before', !bad.length, { bad, r });
  bad = want(r, { ruC: true, ruX: true, ruV: true, grC: true, ruAltC: true, ruZ: true, dvorakJ: true, dvorakC: true });
  ok('plain caret, other layouts: unchanged (Ctrl+с etc. prevented; Cmd+м prevented as before: e.key is not c/v/x)', !bad.length, { bad, r });
  ok('plain caret: keys reach the window as key', l.length === 21 && l.every((e) => e.type === 'key' && e.w === 'P'), l);
  await page.keyboard.press('Control+c');
  l = await take();
  let k = await kd();
  ok('plain caret: real Control+C prevented, no copy event', l.map((e) => e.type).join() === 'key' && k[0]?.prevented === true, { l, k });

  // ================================================================ exec / readClipboard
  await focusT();
  await page.evaluate(() => { window.__copyFn = (ev) => ev.setData('text/plain', 'menu copy'); });
  r = await page.evaluate(() => { document.activeElement.blur(); return [os.wimp.textInput.exec('copy'), document.activeElement === os.wimp.textInput.el]; });
  l = await take();
  ok('exec("copy"): focuses the proxy, fires copy, returns true', r[0] === true && r[1] && l.length === 1 && l[0].type === 'copy' && l[0].cut === false, { r, l });
  ok('exec("copy") wrote the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === 'menu copy');
  r = await page.evaluate(() => os.wimp.textInput.exec('cut'));
  l = await take();
  ok('exec("cut") fires cut', r === true && l.length === 1 && l[0].type === 'cut' && l[0].cut === true, { r, l });
  r = await page.evaluate(() => [os.wimp.textInput.exec('paste'), os.wimp.textInput.exec('selectAll'), os.wimp.textInput.exec('delete')]);
  l = await take();
  ok('exec: only copy and cut', JSON.stringify(r) === '[false,false,false]' && l.length === 0, { r, l });

  await page.evaluate(async () => {
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob(['from menu'], { type: 'text/plain' }),
      'text/html': new Blob(['<i>from menu</i>'], { type: 'text/html' }),
    })]);
  });
  r = await page.evaluate(() => os.wimp.readClipboard());
  l = await take();
  ok('readClipboard: resolves true, emits paste with text and html', r === true && l.length === 1 && l[0].type === 'paste' && l[0].text === 'from menu'
    && l[0].html.includes('<i>from menu</i>') && l[0].files.length === 0 && JSON.stringify(l[0].keys) === '["files","html","text","window"]', { r, l });
  r = await page.evaluate(async () => {
    const real = navigator.clipboard;
    const out = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => ({ read: () => Promise.reject(new DOMException('no', 'NotAllowedError')), readText: () => Promise.reject(new DOMException('no', 'NotAllowedError')) }) });
    out.push(await os.wimp.readClipboard());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => ({ readText: () => Promise.resolve('only text') }) });
    out.push(await os.wimp.readClipboard());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined });
    out.push(await os.wimp.readClipboard());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => real });
    return out;
  });
  l = await take();
  ok('readClipboard: denied -> false, readText only -> true with text, absent -> false', JSON.stringify(r) === '[false,true,false]'
    && l.length === 1 && l[0].text === 'only text' && l[0].html === '', { r, l });
  r = await page.evaluate(async () => {
    const real = navigator.clipboard;
    const reads = [];
    const big = (name, size, fill) => ({ size, type: 'text/plain', text: async () => { reads.push(name + ':text'); return fill.repeat(size); },
      slice: (a, b) => { reads.push(name + ':slice'); return new Blob([fill.repeat(Math.min(size, b) - a)]); } });
    const item = { types: ['text/plain', 'text/html'], getType: async (t) => (t === 'text/plain' ? big('plain', 7000000, 'p') : big('html', 6000001, 'h')) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => ({ read: async () => [item] }) });
    const res = await os.wimp.readClipboard();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => real });
    return { res, reads };
  });
  l = await take();
  ok('readClipboard: a 7 MB text item is read only as far as the cap (sliced), a 6 MB+ html item not read at all', r.res === true
    && JSON.stringify(r.reads) === '["plain:slice"]' && l.length === 1 && l[0].text.length === 100000 && l[0].html === '', { r, l: l.map((e) => ({ ...e, text: e.text?.length })) });
  await focusP();
  r = await page.evaluate(() => os.wimp.readClipboard());
  l = await take();
  ok('readClipboard with a plain caret: false, no event', r === false && l.length === 0, { r, l });

  // ================================================================ blink
  const blink = () => page.evaluate(() => ({ cls: os.wimp.caretEl.classList.contains('blink'), anim: getComputedStyle(os.wimp.caretEl).animationName, t: os.wimp.caretEl.getAnimations?.()[0]?.currentTime ?? null }));
  let b = await blink();
  ok('plain caret: no blink class, no animation', !b.cls && b.anim === 'none', b);
  await focusT();
  b = await blink();
  ok('text caret without blink: no blink class', !b.cls && b.anim === 'none', b);
  await page.evaluate(() => { window.__opts = { text: true, blink: true }; os.wimp.setCaret(__T, null, -1, { x: 10, y: 10, h: 20 }, window.__opts); });
  b = await blink();
  ok('text caret with blink: class blink, animation caret-blink', b.cls && b.anim === 'caret-blink', b);
  await page.waitForTimeout(700);
  const before = (await blink()).t;
  await page.evaluate(() => os.wimp.setCaret(__T, null, -1, { x: 30, y: 10, h: 20 }, window.__opts));
  b = await blink();
  ok('blink restarts when the caret moves', before > 500 && b.t !== null && b.t < 200, { before, b });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  b = await blink();
  ok('prefers-reduced-motion: no animation', b.cls && b.anim === 'none', b);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const menu = await page.evaluate(() => {
    os.wimp.setCaret(__T, null, -1, { x: 10, y: 10, h: 20 }, { text: true, blink: true, clipboard: true });
    const t = os.wimp.tasks.find((x) => x.name === 'ClipboardTest');
    const D = t.createWindow({ title: 'Dbox', x: 0, y: 0, w: 200, h: 80, extent: { w: 200, h: 80 }, flags: { title: true },
      icons: [{ x: 10, y: 10, w: 120, h: 28, text: 'x', button: 'writable', border: true }] });
    os.wimp.menus.open(D, 300, 400);
    const inMenu = os.wimp.caret?.window === D && !os.wimp.caretEl.classList.contains('blink');
    os.wimp.menus.close();
    const c = os.wimp.caret;
    D.delete();
    return { inMenu, win: c?.window === __T, text: c?.text, blink: c?.blink, clipboard: c?.clipboard, cls: os.wimp.caretEl.classList.contains('blink') };
  });
  ok('caret restored after a menu dialogue box keeps text, blink and clipboard', menu.inMenu && menu.win && menu.text === true && menu.blink === true && menu.clipboard === true && menu.cls, menu);
  await page.evaluate(() => { window.__opts = { text: true }; os.wimp.setCaret(__T, null, -1, { x: 10, y: 10, h: 20 }, window.__opts); });
  ok('text caret set again without blink: class removed', !(await blink()).cls);

  // ================================================================ clipboard placeholder (opt-in, off by default)
  const ph = () => page.evaluate(() => { const t = os.wimp.textInput.el; return { v: t.value, s: t.selectionStart, e: t.selectionEnd }; });
  await page.evaluate(() => os.wimp.textInput.setHasSelection(true));
  let p = await ph();
  ok('setHasSelection without the clipboard option: proxy stays empty', p.v === '', p);
  await page.evaluate(() => { os.wimp.textInput.setHasSelection(false); window.__opts = { text: true, clipboard: true }; os.wimp.setCaret(__T, null, -1, { x: 10, y: 10, h: 20 }, window.__opts); os.wimp.textInput.setHasSelection(true); });
  p = await ph();
  ok('clipboard option + selection: a selected placeholder in the proxy', p.v === ' ' && p.s === 0 && p.e === 1, p);
  await page.evaluate(() => os.wimp.setCaret(__T, null, -1, { x: 40, y: 10, h: 20 }, window.__opts));
  p = await ph();
  ok('placeholder kept selected when the caret moves', p.v === ' ' && p.s === 0 && p.e === 1, p);
  await take();
  await page.keyboard.press('a');
  l = await take();
  ok('typing over the placeholder: one textinput a', l.length === 1 && l[0].type === 'textinput' && l[0].text === 'a', l);
  await page.evaluate(() => { window.__copyFn = (ev) => ev.setData('text/plain', 'ph'); os.wimp.textInput.setHasSelection(true); });
  await page.keyboard.press(`${MOD}+c`);
  l = await take();
  ok('copy with the placeholder: copy event, clipboard written', l.map((e) => e.type).join() === 'key,copy' && (await page.evaluate(() => navigator.clipboard.readText())) === 'ph', l);
  await page.evaluate(() => navigator.clipboard.writeText('pasted'));
  await page.evaluate(() => { window.__ret.paste = undefined; });
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(50);
  l = await take();
  ok('paste with the placeholder: paste only, no textinput', l.map((e) => e.type).join() === 'key,paste' && l[1].text === 'pasted', l);
  // a menu dialogue box takes the caret: the declaration is dropped; declaring it again on gaincaret restores it
  const dbox = () => page.evaluate(() => {
    const t = os.wimp.tasks.find((x) => x.name === 'ClipboardTest');
    const D = t.createWindow({ title: 'Dbox', x: 0, y: 0, w: 200, h: 80, extent: { w: 200, h: 80 }, flags: { title: true },
      icons: [{ x: 10, y: 10, w: 120, h: 28, text: 'x', button: 'writable', border: true }] });
    os.wimp.menus.open(D, 300, 400);
    const during = os.wimp.textInput.el.value;
    os.wimp.menus.close();
    D.delete();
    const el = os.wimp.textInput.el;
    return { during, v: el.value, s: el.selectionStart, e: el.selectionEnd, focused: document.activeElement === el };
  });
  await page.evaluate(() => os.wimp.textInput.setHasSelection(true));
  p = await dbox();
  ok('after a menu dialogue box, without a gaincaret handler: placeholder gone (the app must declare again)', p.during === '' && p.v === '' && p.focused, p);
  await page.evaluate(() => { os.wimp.textInput.setHasSelection(true); window.__gc = __T.on('gaincaret', () => os.wimp.textInput.setHasSelection(true)); });
  p = await dbox();
  await page.evaluate(() => window.__gc());
  ok('after a menu dialogue box, setHasSelection(true) on gaincaret: placeholder back, selected', p.during === '' && p.v === ' ' && p.s === 0 && p.e === 1 && p.focused, p);
  await page.evaluate(() => os.wimp.textInput.setHasSelection(false));
  p = await ph();
  ok('setHasSelection(false): proxy empty', p.v === '', p);
  await page.evaluate(() => os.wimp.textInput.setHasSelection(true));
  await focusP();
  p = await ph();
  ok('caret to a plain window: placeholder gone', p.v === '' && !(await page.evaluate(() => os.wimp.textInput.focused)), p);
  await page.evaluate(() => { window.__opts = { text: true }; });

  // ================================================================ click count
  await page.waitForTimeout(500);
  await take();
  for (let i = 0; i < 4; i++) { await page.mouse.click(geo.T.x, geo.T.y); await page.waitForTimeout(60); }
  l = await take();
  ok('four quick clicks (click/drag/double window): click 1, doubleclick 2, click 3, doubleclick 3 (isDouble as before, count stays 3)', l.map((e) => e.type + e.count).join() === 'click1,doubleclick2,click3,doubleclick3', l);
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i++) { await page.mouse.click(geo.P.x, geo.P.y); await page.waitForTimeout(60); }
  l = await take();
  ok('three quick clicks (click window): counts 1, 2, 3', l.map((e) => e.type + e.count).join() === 'click1,click2,click3', l);
  await page.waitForTimeout(500);
  await page.mouse.click(geo.P.x, geo.P.y);
  await page.waitForTimeout(60);
  await page.mouse.click(geo.P.x + 40, geo.P.y);
  await page.waitForTimeout(60);
  await page.mouse.click(geo.T.x, geo.T.y);
  await page.waitForTimeout(450);
  await page.mouse.click(geo.T.x, geo.T.y);
  l = await take();
  ok('count restarts when the pointer moves, the window changes or time passes', l.map((e) => e.type + e.count).join() === 'click1,click1,click1,click1', l);
  await page.waitForTimeout(500);
  await page.mouse.click(geo.P.x, geo.P.y);
  await page.waitForTimeout(60);
  await page.keyboard.down('Shift');
  await page.mouse.click(geo.P.x, geo.P.y);   // Adjust (two-button mapping)
  await page.keyboard.up('Shift');
  l = await take();
  ok('a different button (Adjust) starts a new count', l.map((e) => e.type + e.count).join() === 'click1,click1', l);

  await page.evaluate(() => os.wimp.tasks.find((t) => t.name === 'ClipboardTest')?.quit());
} catch (e) { res.push('FAIL exception ' + e.stack); }
console.log(res.join('\n'));
if (logs.some((l) => /PAGEERROR/.test(l))) console.log(logs.filter((l) => /PAGEERROR/.test(l)).join('\n'));
await browser.close();
if (res.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
