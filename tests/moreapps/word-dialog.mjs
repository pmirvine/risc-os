// WimpLib Ui/Dialog in the real desktop, through !Word's test hook
// (task.word.dialog(spec)): every kind of control by its icon name
// (label, text, length, number, option, radio, popup, colour,
// button); Tab / Shift-Tab / Down / Up move the caret between the
// writable icons (the core's focusNext), shaded fields skipped; typed
// values read back (inches, points, numbers; letters the field does
// not allow refused; a length that is not one reads null); a popup's
// menu (a real click on its arrow and on an item) sets the display
// field; an option toggles; a radio group is exclusive; a colour pick
// (a real click on a swatch) sets the swatch, drawn; values() after
// edits; mixed (empty) fields reported as undefined, also after OK;
// Return presses the default button, Escape and the close icon
// Cancel, a click on a button; a handler returning false keeps the
// box; a row's button does not close it; a shaded default button is
// not pressed; two keys two windows, the same key the same box
// brought to the front; 30 open / close cycles (every way of closing,
// popups open) leave no windows, icons, listeners or menus behind.
// Also: set() reports no change; close() then open() keeps the box and
// its place; Escape / the close icon with Cancel shaded still cancel;
// a box wider than the screen keeps its buttons in the window; a box
// keyed per document and deleted when it closes leaves nothing; a
// task that quits takes its boxes with it.
// Needs the disc built by tools/disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const doc = Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('Dialogs.'))) }));
const out = [];
const live = (s) => { if (process.env.LIVE) console.error(s.slice(0, 600)); };
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); live(out.at(-1)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const type = async (t) => { await page.keyboard.type(t); await settle(); };
const click = async (q) => { await page.mouse.click(q.x, q.y); await wait(60); await settle(); };
const icon = (name, key = 'main') => ev(([n, k]) => window.__icon(n, k), [name, key]);
const caret = () => ev(() => { const c = os.wimp.caret; return c?.icon?.name ?? (c?.window ? 'window' : null); });
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (bytes) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    os.vfs.writeFile('RAM::RamDisc0.$.Dlg', new Uint8Array(bytes), { filetype: 0xA7E });
    os.vfs.writeFile('RAM::RamDisc0.$.Dlg2', new Uint8Array(bytes), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    await os.filer.run('RAM::RamDisc0.$.Dlg');
    for (let i = 0; i < 200 && !window.__word()?.word.docs.length; i++) await window.__sleep(50);
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__rows = () => [
      { kind: 'label', text: 'Indents and spacing' },
      [{ kind: 'text', name: 'name', label: 'Name', maxLen: 40, help: 'A name.' }],
      [{ kind: 'length', name: 'left', label: 'Left' }, { kind: 'length', name: 'before', label: 'Before', unit: 'pt' }],
      [{ kind: 'number', name: 'at', label: 'At', min: 0, max: 10, unit: 'lines', after: 'lines' }],
      [{ kind: 'popup', name: 'align', label: 'Alignment', choices: [{ id: 'left', text: 'Left' }, { id: 'center', text: 'Centre' }, { id: 'right', text: 'Right' }] }],
      { kind: 'option', name: 'keep', text: 'Keep with next' },
      [{ kind: 'radio', name: 'none', group: 'setting', text: 'None' }, { kind: 'radio', name: 'box', group: 'setting', text: 'Box' }],
      [{ kind: 'colour', name: 'col', label: 'Colour' }, { kind: 'button', name: 'clear', text: 'Clear' }],
    ];
    window.__dl = {};
    window.__log = [];
    /** A dialog for key k, its events logged; keep: the button handler's answer. */
    window.__make = (k = 'main', extra = {}) => {
      const d = window.__word().word.dialog({ key: k, title: 'Test ' + k, rows: window.__rows(), ...extra });
      if (window.__dl[k] !== d) {
        window.__dl[k] = d;
        d.on('button', (e) => { window.__log.push(['button', k, e.name, e.values]); return window.__keep ? false : undefined; });
        d.on('change', (e) => window.__log.push(['change', k, e.name, e.value ?? null]));
        d.on('close', () => window.__log.push(['close', k]));
      }
      return d;
    };
    window.__icon = (n, k = 'main') => {
      const w = window.__dl[k].win, b = w.iconByName(n).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    return { ok: !!window.__word(), msgs: window.__msgs };
  }, doc);
  ok('Word runs', s0.ok && !s0.msgs.length, s0);
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, dom: document.querySelectorAll('*').length, stack: os.wimp.stack.length };
  });
  const base = await counts();

  // ---------------------------------------------------- every kind of control by its icon name
  const o1 = await ev(() => {
    const d = window.__make();
    d.open();
    const w = d.win, names = ['text:0', 'label:name', 'name', 'label:left', 'left', 'label:before', 'before', 'at', 'after:at',
      'label:align', 'align', 'arrow:align', 'keep', 'none', 'box', 'label:col', 'col', 'clear', 'button:Cancel', 'button:OK'];
    const ic = (n) => w.iconByName(n);
    return { missing: names.filter((n) => !ic(n)), open: d.isOpen, title: w.title,
      kinds: { name: ic('name').writable, left: ic('left').writable, at: ic('at').writable, align: ic('align').writable,
        keep: ic('keep').validation, none: [ic('none').validation, ic('none').esg], box: ic('box').esg,
        arrow: ic('arrow:align').validation, ok: ic('button:OK').validation, cancel: ic('button:Cancel').validation },
      top: os.wimp.stack.at(-1) === w, centred: Math.abs(w.x + w.w / 2 - os.wimp.width / 2) <= 2 };
  });
  ok('a dialog with every kind of control: the icons by name', !o1.missing.length && o1.open && o1.title === 'Test main', o1);
  ok('... writable fields, option / radio sprites, a radio ESG, the popup arrow, default and other buttons',
    o1.kinds.name && o1.kinds.left && o1.kinds.at && !o1.kinds.align && o1.kinds.keep === 'Soptoff,opton'
    && o1.kinds.none[0] === 'Sradiooff,radioon' && o1.kinds.none[1] > 0 && o1.kinds.box === o1.kinds.none[1]
    && /gright/.test(o1.kinds.arrow) && o1.kinds.ok === 'R6,3' && o1.kinds.cancel === 'R5,3', o1.kinds);
  ok('... opened at the front, centred the first time', o1.top && o1.centred, o1);
  ok('... one more window', (await counts()).win === base.win + 1);

  // ---------------------------------------------------- the caret: first field, Tab / Down / Up / Shift-Tab
  const c0 = await caret();
  await press('Tab'); const c1 = await caret();
  await press('ArrowDown'); const c2 = await caret();
  await press('Tab'); const c3 = await caret();
  await press('Tab'); const c4 = await caret();
  await press('ArrowUp'); const c5 = await caret();
  await press('Shift+Tab'); const c6 = await caret();
  ok('the caret starts in the first field; Tab / Down go on, Up / Shift-Tab back (wrapping)', same([c0, c1, c2, c3, c4, c5, c6],
    ['name', 'left', 'before', 'at', 'name', 'at', 'before']), [c0, c1, c2, c3, c4, c5, c6]);

  // ---------------------------------------------------- typing; values read back
  await ev(() => { window.__log.length = 0; });
  await click(await icon('name')); await type('Hello');
  await click(await icon('left')); await type('0.5cm');           // c and m are not allowed
  await click(await icon('before')); await type('12');
  await click(await icon('at')); await type('1.5');
  const t1 = await ev(() => { const d = window.__dl.main; return { v: d.values(), left: d.win.iconByName('left').text,
    changes: window.__log.filter((e) => e[0] === 'change').map((e) => e[2]) }; });
  ok('typed: text, a length in inches (letters it does not allow refused), points, a number', t1.v.name === 'Hello'
    && t1.left === '0.5' && t1.v.left === 720 && t1.v.before === 240 && t1.v.at === 1.5, t1);
  ok('... each key reported as a change of its field', t1.changes.filter((n) => n === 'name').length === 5
    && t1.changes.includes('left') && t1.changes.includes('at'), t1.changes);
  await click(await icon('left')); await press('Control+u'); await type('pt');
  const t2 = await ev(() => ({ left: window.__dl.main.get('left'), invalid: window.__dl.main.invalid() }));
  ok('a length that is not one reads null (invalid() names it)', t2.left === null && same(t2.invalid, ['left']), t2);
  await press('Control+u'); await type('1in');

  // ---------------------------------------------------- popup: a real click on the arrow, then on an item
  await click(await icon('arrow:align'));
  const m1 = await ev(() => {
    const lv = os.wimp.menus.levels[0], a = window.__dl.main.win.iconByName('arrow:align').bbox;
    const at = window.__dl.main.win.workToScreen(a.x1, a.y0);
    return { open: os.wimp.menus.isOpen, items: lv?.rows.map((r) => r.item.text), x: lv?.win.x, ax: at.x,
      pos: window.__client(lv.win, 20, (lv.rows[1].top + lv.rows[1].bottom) / 2) };
  });
  ok('a click on the popup arrow opens its menu of choices at its right', m1.open && same(m1.items, ['Left', 'Centre', 'Right'])
    && Math.abs(m1.x - m1.ax) <= 40, m1);
  await click(m1.pos);
  const m2 = await ev(() => ({ text: window.__dl.main.win.iconByName('align').text, v: window.__dl.main.get('align'),
    menus: os.wimp.menus.isOpen, ch: window.__log.filter((e) => e[2] === 'align').at(-1) }));
  ok('... choosing Centre sets the display field and the value (its id), reported', m2.text === 'Centre' && m2.v === 'center'
    && !m2.menus && same(m2.ch, ['change', 'main', 'align', 'center']), m2);
  await click(await icon('align'));
  const m3 = await ev(() => { const lv = os.wimp.menus.levels[0]; const r = { open: os.wimp.menus.isOpen,
    ticked: lv?.rows.map((x) => typeof x.item.ticked === 'function' ? x.item.ticked() : !!x.item.ticked) }; os.wimp.menus.close(); return r; });
  ok('... a click on the display field opens it too, the choice ticked', m3.open && same(m3.ticked, [false, true, false]), m3);

  // ---------------------------------------------------- option, radios
  await click(await icon('keep')); const k1 = await ev(() => window.__dl.main.get('keep'));
  await click(await icon('keep')); const k2 = await ev(() => window.__dl.main.get('keep'));
  ok('an option toggles (off, on, off)', k1 === true && k2 === false, [k1, k2]);
  await click(await icon('none'));
  const r1 = await ev(() => ({ g: window.__dl.main.get('setting'), none: window.__dl.main.get('none'), box: window.__dl.main.get('box') }));
  await click(await icon('box'));
  const r2 = await ev(() => ({ g: window.__dl.main.get('setting'), none: window.__dl.main.get('none'), box: window.__dl.main.get('box') }));
  await page.mouse.click((await icon('box')).x, (await icon('box')).y, { button: 'right' }); await settle();
  const r3 = await ev(() => window.__dl.main.get('setting'));
  ok('a radio group is exclusive (None, then Box; Adjust on the chosen one keeps it)', r1.g === 'none' && r1.none && !r1.box
    && r2.g === 'box' && !r2.none && r2.box && r3 === 'box', [r1, r2, r3]);

  // ---------------------------------------------------- colour: a real click on a swatch
  await click(await icon('col'));
  const p1 = await ev(() => {
    const lv = os.wimp.menus.levels[0], w = lv?.win;
    return { open: os.wimp.menus.isOpen, hex: !!w?.iconByName?.('hex'), at: w && window.__client(w, 8 + 22 * 2 + 11, 8 + 22 * 1 + 11) };
  });
  ok('a click on the colour button opens the colour popup', p1.open && p1.hex, p1);
  await click(p1.at);
  await ev(() => window.__frames(3));
  const p2 = await ev(() => {
    const d = window.__dl.main, w = d.win, v = d.get('col'), b = w.iconByName('col').bbox, c = w._canvas;
    const k = c.width / w.w, px = c.getContext('2d').getImageData(Math.round((b.x0 + b.x1) / 2 * k), Math.round((b.y0 + b.y1) / 2 * k), 1, 1).data;
    const hex = [...px.slice(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { v, hex, menus: os.wimp.menus.isOpen, ch: window.__log.filter((e) => e[2] === 'col').at(-1), caret: os.wimp.caret?.window === w };
  });
  ok('... a swatch picked: the value, the swatch drawn in it, reported; the popup gone', /^[0-9A-F]{6}$/.test(p2.v) && p2.hex === p2.v
    && !p2.menus && same(p2.ch, ['change', 'main', 'col', p2.v]), p2);

  // ---------------------------------------------------- values() after the edits; a row button; Return
  await click(await icon('clear'));
  const v1 = await ev(() => ({ v: window.__dl.main.values(), open: window.__dl.main.isOpen, b: window.__log.filter((e) => e[0] === 'button') }));
  ok('values() after the edits', same({ ...v1.v, col: 'x' }, { name: 'Hello', left: 1440, before: 240, at: 1.5, align: 'center', keep: false,
    none: false, box: true, col: 'x', setting: 'box' }), v1.v);
  ok("a row's button is reported ({name}) and does not close the box", v1.open && v1.b.length === 1 && v1.b[0][2] === 'clear', v1.b);
  await click(await icon('name'));
  await ev(() => { window.__log.length = 0; });
  await press('Enter');
  const e1 = await ev(() => ({ log: window.__log, gone: window.__dl.main.gone, open: os.wimp.windows.size }));
  ok('Return presses the default button (OK) with the values; the box is deleted; close reported', e1.log[0]?.[2] === 'OK'
    && e1.log[0][3].left === 1440 && e1.gone && e1.log.some((e) => e[0] === 'close') && e1.open === base.win, e1);

  // ---------------------------------------------------- Escape, the close icon, a click on Cancel; keep (false)
  const closeBy = async (how) => {
    await ev(() => { window.__log.length = 0; window.__make().open(); });
    await settle();
    if (how === 'escape') await press('Escape');
    else if (how === 'icon') {
      const q = await ev(() => { const r = window.__dl.main.win.tools.close.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await click(q);
    } else await click(await icon('button:Cancel'));
    return ev(() => ({ log: window.__log.map((e) => e.slice(0, 3)), gone: window.__dl.main.gone }));
  };
  for (const how of ['escape', 'icon', 'click']) {
    const x = await closeBy(how);
    ok(`${how === 'escape' ? 'Escape' : how === 'icon' ? 'the close icon' : 'a click on Cancel'} presses Cancel; the box goes`,
      same(x.log, [['button', 'main', 'Cancel'], ['close', 'main']]) && x.gone, x);
  }
  await ev(() => { window.__keep = true; window.__make().open(); });
  await settle(); await press('Enter');
  const kp = await ev(() => ({ gone: window.__dl.main.gone, open: window.__dl.main.isOpen }));
  ok('a button handler returning false keeps the box open', !kp.gone && kp.open, kp);
  await ev(() => { window.__keep = false; window.__dl.main.shade('OK', true); window.__log.length = 0; });
  await press('Enter');
  const sh = await ev(() => ({ log: window.__log.length, open: window.__dl.main.isOpen }));
  ok('a shaded default button: Return does nothing', sh.log === 0 && sh.open, sh);

  // ---------------------------------------------------- shading a field; mixed values
  await click(await icon('left'));
  await ev(() => window.__dl.main.shade('left', true));
  const s1 = await caret();
  await press('Tab'); const s2 = await caret();
  await press('Tab'); const s3 = await caret();
  ok('a shaded field gives up the caret and Tab skips it', s1 === 'name' && s2 === 'before' && s3 === 'at', [s1, s2, s3]);
  const mx = await ev(() => {
    const d = window.__dl.main;
    d.shade('left', false);
    for (const n of ['name', 'left', 'before', 'at', 'align', 'keep', 'col', 'setting']) d.set(n, undefined);
    const ic = (n) => d.win.iconByName(n);
    return { v: d.values(), shown: ['name', 'left', 'before', 'at', 'align'].map((n) => ic(n).text), keep: ic('keep').selected };
  });
  ok('mixed values: shown empty (the option off) and reported as undefined', mx.shown.every((t) => t === '') && !mx.keep
    && Object.values(mx.v).every((x) => x === undefined || x === false) && mx.v.keep === undefined && mx.v.setting === undefined, mx);
  await click(await icon('before')); await type('6');
  await ev(() => { window.__dl.main.shade('OK', false); window.__log.length = 0; });
  await press('Enter');
  const mo = await ev(() => window.__log[0]?.[3]);
  ok('... a field left empty is still undefined after OK; the one typed in has its value', mo && mo.left === undefined
    && mo.name === undefined && mo.keep === undefined && mo.before === 120, mo);

  // ---------------------------------------------------- one box per key
  const kk = await ev(() => {
    const a = window.__make('a'), b = window.__make('b');
    a.open(); b.open({ x: 100, y: 100 });
    const top1 = os.wimp.stack.at(-1) === b.win;
    const a2 = window.__make('a');
    const r = { same: a2 === a, two: a.win !== b.win && a.isOpen && b.isOpen, top1, top2: os.wimp.stack.at(-1) === a.win,
      at: [b.win.x, b.win.y] };
    a.delete(); b.delete();
    r.gone = a.gone && b.gone;
    r.fresh = window.__make('a') !== a;
    window.__dl.a.delete();
    return r;
  });
  ok('two keys: two boxes; the same key: the same box, brought to the front; a new one after it went', kk.same && kk.two && kk.top1
    && kk.top2 && same(kk.at, [100, 100]) && kk.gone && kk.fresh, kk);

  // ---------------------------------------------------- set reports nothing; close() then open(); a shaded Cancel
  const sc = await ev(() => {
    window.__log.length = 0;
    const d = window.__make('main');
    d.set('name', 'x'); d.set('left', 720); d.set('keep', true); d.set('setting', 'box'); d.set('align', 'right'); d.set('col', 'FF0000');
    return window.__log.filter((e) => e[0] === 'change').length;
  });
  ok('api.set reports no change', sc === 0, sc);
  const co = await ev(async () => {
    window.__log.length = 0;
    const d = window.__make('main');
    d.open({ x: 120, y: 140 });
    await window.__frames(1);
    const at = [d.win.x, d.win.y];
    d.close();
    const r = { at, closedOpen: d.isOpen, again: window.__make('main') === d, wins: os.wimp.windows.size };
    d.open();
    await window.__frames(1);
    return { ...r, back: [d.win.x, d.win.y], open: d.isOpen, gone: d.gone, closes: window.__log.filter((e) => e[0] === 'close').length };
  });
  ok('close() then open(): the same box under its key, back where it was; one close reported', !co.closedOpen && co.again
    && co.open && !co.gone && same(co.at, co.back) && co.closes === 1, co);
  for (const how of ['escape', 'icon']) {
    await ev(() => { window.__log.length = 0; const d = window.__make('main'); d.open(); d.shade('Cancel', true); });
    await settle();
    if (how === 'escape') await press('Escape');
    else {
      const q = await ev(() => { const r = window.__dl.main.win.tools.close.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await click(q);
    }
    const x = await ev(() => ({ log: window.__log.map((e) => e.slice(0, 3)), gone: window.__dl.main.gone }));
    ok(`${how === 'escape' ? 'Escape' : 'the close icon'} with Cancel shaded still presses Cancel; the box goes`,
      same(x.log, [['button', 'main', 'Cancel'], ['close', 'main']]) && x.gone, x);
  }

  // ---------------------------------------------------- a box wider than the screen
  const nw = await ev(async () => {
    const d = window.__make('wide', { minW: os.wimp.width + 400 });
    d.open();
    await window.__frames(1);
    const r = { w: d.win.w, screen: os.wimp.width, sx: d.win.scrollX, ok: d.win.iconByName('button:OK').bbox,
      cancel: d.win.iconByName('button:Cancel').bbox };
    d.delete();
    return r;
  });
  ok('a box wider than the screen: the window fits it, its buttons are inside the window', nw.w <= nw.screen - 40 && nw.sx === 0
    && nw.ok.x1 <= nw.w - 8 && nw.cancel.x0 >= 8 && nw.cancel.x1 < nw.ok.x0, nw);

  // ---------------------------------------------------- a per-document key; deleted with its document
  const oc0 = await counts();
  const oc = await ev(async () => {
    const t = window.__word(), dw = await t.word.open('RAM::RamDisc0.$.Dlg2');
    await window.__frames(2);
    const key = 'para:' + dw.docKey;
    const box = t.word.dialog({ key, title: 'Para', rows: window.__rows() });
    box.on('change', () => {});
    box.on('button', () => {});
    box.open();
    dw.win.on('deleted', () => box.delete());
    await window.__frames(1);
    const r = { had: box.isOpen, same: t.word.dialog({ key, rows: [] }) === box };
    dw.close();
    await window.__frames(3);
    return { ...r, gone: box.gone, fresh: (() => { const b = t.word.dialog({ key, rows: [] }); const f = b !== box; b.delete(); return f; })() };
  });
  await ev(() => window.__frames(3));
  const oc1 = await counts();
  ok("a box keyed by its document ('para:<docKey>') deleted when the document closes: gone, its key free, nothing left",
    oc.had && oc.same && oc.gone && oc.fresh && oc1.win === oc0.win && oc1.task === oc0.task && oc1.icons === oc0.icons
    && oc1.wl === oc0.wl && oc1.tl === oc0.tl && Math.abs(oc1.dom - oc0.dom) <= 5, { oc, oc0, oc1 });

  // ---------------------------------------------------- leaks: 30 cycles
  const mid = await counts();
  for (let i = 0; i < 30; i++) {
    const how = i % 6;
    await ev((h) => {
      const d = window.__make('main');
      d.open();
      if (h === 3 || h === 4) {
        const ic = d.win.iconByName(h === 3 ? 'arrow:align' : 'col').bbox;
        d.win.emit('click', { icon: d.win.iconByName(h === 3 ? 'arrow:align' : 'col'), button: 'select', x: ic.x0 + 2, y: ic.y0 + 2 });
      }
    }, how);
    await settle();
    if (how === 0) await press('Enter');
    else if (how === 1) await press('Escape');
    else if (how === 2) await click(await icon('button:Cancel'));
    else if (how === 3 || how === 4) { await press('Escape'); await ev(() => window.__dl.main.delete()); }
    else await ev(() => { window.__dl.main.close(); window.__dl.main.delete(); });
    await settle();
  }
  await ev(() => window.__frames(4));
  const end = await counts();
  ok('30 dialogs opened and closed (Return, Escape, Cancel, with the popup menu or colour popup open, close + delete): '
    + 'no windows, icons, listeners or menus left', end.win === base.win && end.task === base.task && end.icons === base.icons
    && end.wl === base.wl && end.tl === base.tl && !end.menus && end.stack === base.stack && Math.abs(end.dom - base.dom) <= 5, { base, mid, end });
  // ---------------------------------------------------- the task quits: its boxes go
  const qt = await ev(async () => {
    const t = window.__word(), d = window.__make('q');
    d.open();
    const w = d.win;
    t.quit();
    await window.__sleep(200);
    return { gone: d.gone, left: [...os.wimp.windows].includes(w), alive: t.alive };
  });
  ok('the task quits: its open box is deleted with it', qt.gone && !qt.left && !qt.alive, qt);
  const msgs = await ev(() => window.__msgs);
  ok('no errors reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
